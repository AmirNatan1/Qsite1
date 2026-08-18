import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

const repositoryRoot = process.cwd();
const packageRelative = "artifacts/original/phase-0-4-crt-television";
const packageRoot = path.join(repositoryRoot, ...packageRelative.split("/"));
const acceptedParent = "5ba1d0fac427d7584db5d0d202e18f1ac8c3f8ae";
const expectedBranch = "redirect/phase-0-4-crt-television";
const expectedOrigin = "https://github.com/AmirNatan1/Qsite1.git";
const maximumFileBytes = 100 * 1024 * 1024;
const explicitPreflight = process.argv.includes("--preflight");
const explicitFinal = process.argv.includes("--final");
let preflight = explicitPreflight;
const errors = [];
if (explicitPreflight && explicitFinal) errors.push("Phase 0.4 verifier cannot run with both --preflight and --final");
let sharpDecoder = null;
try {
  ({ default: sharpDecoder } = await import("sharp"));
} catch (error) {
  errors.push(`sharp PNG decoder is unavailable: ${error.message}`);
}
const decodedPngCache = new Map();

const proportionSourceRelative = "source/quantum-signal-television-proportion-options.blend";
const refinedSourceRelative = "source/quantum-signal-television-v1.blend";
const refinedSourceBuildRelative = "manifests/crt-refined-source-build.json";
const materialManifestRelative = "manifests/crt-material-and-asset-manifest.json";
const canonicalManifestRelative = "manifests/crt-canonical-render-manifest.json";
const powerStateAuthorityRelative = "manifests/crt-power-on-state-authority.json";
const portalStateAuthorityRelative = "manifests/crt-portal-transition-state-authority.json";
const refinedValidationRelative = "manifests/blender-source-validation.json";
const keepoutManifestRelative = "manifests/crt-scene-source-keepouts.json";
const packageInventoryRelative = "manifests/package-inventory.json";
const reviewBundleRelative = "manifests/review-bundle-manifest.json";
const reviewZipRelative = "phase-0-4-crt-television-review.zip";
const browserMatrixRelative = "artifacts/evidence/phase-0-4-crt-television/browser-matrix-report.json";
const browserEvidenceRelative = "artifacts/evidence/phase-0-4-crt-television/browser-evidence-manifest.json";
const browserReviewCompositionRelative = "manifests/browser-review-composition-manifest.json";
const staticReviewCompositionRelative = "manifests/crt-review-composition-manifest.json";
const capturePlanRelative = "prototypes/phase-0-4-crt-portal-qa/capture-plan.json";
const capturePlanSnapshotRelative = "artifacts/evidence/phase-0-4-crt-television/capture-plan-authority.json";
const repositoryImpactRelative = "artifacts/evidence/phase-0-4-crt-television/repository-impact-report.json";
const proportionManifestRelative = "manifests/crt-proportion-render-manifest.json";
const proportionDecisionRelative = "manifests/crt-proportion-decision-manifest.json";
const proportionValidationRelative = "manifests/crt-proportion-source-validation.json";
const sanitizerRelative = "manifests/png-metadata-sanitization.json";
const proportionSheetRelative = "crt-television-proportion-options.png";
const expectedProportionViews = new Set([
  "front",
  "side",
  "rear",
  "top",
  "three-quarter-front",
  "three-quarter-rear",
]);
const expectedProportionOptions = new Set(["A", "B", "C"]);
const exactPowerStateIds = [
  "power-01-completely-dormant",
  "power-02-current-reaches-connection",
  "power-03-power-indicator-response",
  "power-04-crt-electrical-wake",
  "power-05-raster-phosphor-appears",
  "power-06-quantum-interface-stabilizes",
  "power-07-portal-ready",
];
const exactPortalStateIds = [
  "portal-01-television-in-scene",
  "portal-02-screen-active",
  "portal-03-close-approach",
  "portal-04-glass-almost-fills",
  "portal-05-bezel-exits",
  "portal-06-distortion-reduces",
  "portal-07-dom-takes-ownership",
  "portal-08-full-semantic-surface",
];

const exactSourceRoleIds = [
  "source-desktop-dormant",
  "source-mobile-dormant",
  "source-reduced-desktop-dormant",
  "source-reduced-mobile-dormant",
  "source-physical-portal-close",
  "source-text-free-portal-takeover",
];

const exactCanonicalGroupCounts = new Map([
  ["design", 5],
  ["materials", 7],
  ["details", 4],
  ["cable", 4],
  ["environment", 1],
  ["camera-study", 5],
  ["power-on", 7],
  ["portal", 6],
  ["sources", 6],
]);

const exactRefinedValidationCheckIds = [
  "refined_assembly_collection",
  "assembled_overall_width",
  "assembled_overall_height",
  "assembled_overall_depth",
  "convex_smoked_glass",
  "separate_phosphor_layer",
  "visible_screen_aspect_4_3",
  "desktop_spiral_2_5_turns",
  "mobile_spiral_2_25_turns",
  "mobile_authored_separately",
  "physical_rear_cable_connection",
  "recessed_conductor_channel",
  "external_libraries",
  "external_images",
  "packed_files",
  "external_paths",
  "missing_files",
  "image_texture_nodes",
  "modelled_from_scratch",
  "private_photo_loaded",
  "third_party_models",
  "full_animatic_created",
  "manufacturer_branding",
  "portal_layout_authority",
  "embedded_source_lineage",
  "physical_screen_copy",
  "exact_seven_power_states",
  "exact_eight_portal_states",
  "camera_arrival_to_power_arc",
];

const exactBrowserReviewSheets = [
  {
    reviewIndex: 11,
    filename: "crt-physical-dom-alignment-sheet.png",
    sourceCaseIds: [
      "portal-actual--desktop-1440x900",
      "portal-actual--tablet-landscape-1024x768",
      "portal-actual--mobile-390x844",
    ],
  },
  {
    reviewIndex: 12,
    filename: "crt-desktop-hero-composition.png",
    sourceCaseIds: [
      "hero-actual--desktop-1440x900",
      "hero-actual--short-desktop-1366x650",
      "hero-actual--desktop-1280x800",
      "hero-actual--tablet-landscape-1024x768",
    ],
  },
  {
    reviewIndex: 13,
    filename: "crt-mobile-hero-composition.png",
    sourceCaseIds: [
      "hero-actual--mobile-390x844",
      "hero-actual--mobile-360x800",
      "hero-actual--narrow-320x800",
      "hero-actual--mobile-landscape-844x390",
    ],
  },
  {
    reviewIndex: 14,
    filename: "crt-text-zoom-and-fallback.png",
    sourceCaseIds: [
      "hero-zoom-200--desktop-1440x900",
      "portal-zoom-200--narrow-320x800",
      "hero-long-copy--mobile-390x844",
      "portal-long-copy--desktop-1440x900",
    ],
  },
  {
    reviewIndex: 15,
    filename: "crt-reduced-motion-desktop.png",
    sourceCaseIds: [
      "hero-reduced-motion--desktop-1440x900",
      "portal-reduced-motion--desktop-1440x900",
    ],
  },
  {
    reviewIndex: 16,
    filename: "crt-reduced-motion-mobile.png",
    sourceCaseIds: [
      "hero-reduced-motion--mobile-390x844",
      "portal-reduced-motion--mobile-390x844",
    ],
  },
];

const exactBrowserGovernedReviewSheets = [
  {
    reviewIndex: 10,
    filename: "crt-portal-transition-sheet.png",
    stateIds: exactPortalStateIds,
  },
  ...exactBrowserReviewSheets,
];

const capturePlanSchema = "quantum-hub.phase-0-4-crt-television.typography-capture-plan.v1";
const browserMatrixSchema = "quantum-hub.phase-0-4-crt-television.typography-collision-matrix.v1";
const browserEvidenceSchema = "quantum-hub.phase-0-4-crt-television.browser-evidence.v1";
const browserReviewCompositionSchema = "quantum-hub.phase-0-4-crt-television.browser-review-composition.v1";

const exactStaticReviewSheets = [
  [2, "crt-television-recommended-design-sheet.png"],
  [3, "crt-cabinet-material-sheet.png"],
  [4, "crt-screen-glass-and-phosphor-sheet.png"],
  [5, "crt-controls-speaker-rear-detail-sheet.png"],
  [6, "crt-cable-and-connection-sheet.png"],
  [7, "crt-proving-ground-style-frame.png"],
  [8, "crt-camera-path-study.png"],
  [9, "crt-power-on-contact-sheet.png"],
];

const requiredRefinedMaterialRoles = new Map([
  ["cabinet", "CRT_CaredForCharcoalABS"],
  ["secondary cabinet", "CRT_SecondaryMouldedABS"],
  ["bezel", "CRT_ThickProtectiveBezelABS"],
  ["gasket", "CRT_GlassPerimeterGasket"],
  ["glass", "CRT_ThickSmokedGlass"],
  ["phosphor dormant", "CRT_PhosphorOff"],
  ["phosphor active", "CRT_PhosphorLowGrey"],
  ["wake", "CRT_WakeLineEmission"],
  ["interface", "CRT_PhysicalSignalInterface"],
  ["controls", "CRT_EraPhysicalControlCaps"],
  ["indicator dormant", "CRT_PowerIndicatorOff"],
  ["indicator active", "CRT_PowerIndicatorWarmMagenta"],
  ["speaker and vent cavity", "CRT_VentSpeakerCavity"],
  ["graphite sheath", "SpiralCable_GraphiteSheath"],
  ["conductor cavity", "SpiralCable_InactiveInternalChannel"],
  ["conductor inactive", "SpiralCable_InactiveInternalChannel"],
  ["conductor energized trail", "SpiralCable_EnergizedTrail"],
  ["conductor advancing front", "SpiralCable_ModestlyBrighterFront"],
  ["terrain", "ProvingGround_DarkAggregateTerrain"],
  ["service plate", "ProvingGround_ServicePlate"],
]);

const exactReviewPngNames = new Set([
  "crt-television-proportion-options.png",
  "crt-television-recommended-design-sheet.png",
  "crt-cabinet-material-sheet.png",
  "crt-screen-glass-and-phosphor-sheet.png",
  "crt-controls-speaker-rear-detail-sheet.png",
  "crt-cable-and-connection-sheet.png",
  "crt-proving-ground-style-frame.png",
  "crt-camera-path-study.png",
  "crt-power-on-contact-sheet.png",
  "crt-portal-transition-sheet.png",
  "crt-physical-dom-alignment-sheet.png",
  "crt-desktop-hero-composition.png",
  "crt-mobile-hero-composition.png",
  "crt-text-zoom-and-fallback.png",
  "crt-reduced-motion-desktop.png",
  "crt-reduced-motion-mobile.png",
]);

const protectedBaseline = new Map([
  ["artifacts/original/phase-0", "2fc11881f8b4b771fafaab890d2879da20920a69"],
  ["artifacts/original/phase-0-3d-repair", "ac46cd1546dc8df8c41302574a39d0aef4465b52"],
  ["artifacts/original/phase-0-3d-repair-v2", "45dc45438ce1b981d448d7d3ea6c7ece38dea471"],
  ["artifacts/original/phase-0-3d-repair-v3", "9747b6d0d0753010b34e2e9eac44361ff1434e06"],
  ["artifacts/evidence/phase-0", "22de63edb2f8b58f748c84ff7b43ed8ca3d847f8"],
  ["artifacts/evidence/phase-0-3d-repair-v2", "062bce1170fd52ff5972348bcdcf7247cb92a574"],
  ["artifacts/evidence/phase-0-3d-repair-v3", "d0c6f026642fed1a683fcbb81e17de53794bf682"],
  ["public/brand", "23f2070b032fe564f5edc1a03ac720243555e2f8"],
  ["public/media/maradin", "5d33491efd0b72b4b85b412f87904c07456092d3"],
  ["docs/planning/QHUB_IMPORT_LEDGER.md", "7d521a8b229950338f2be3b77465cf94cd007526"],
  ["docs/planning/PUBLICATION_MATRIX.md", "641bc101ac3e868126917c58d93c5929831c2ae2"],
  ["src", "6c5fc6072e2884955e90d0c797056cbde64ab711"],
  ["public", "772f9408c9d51936d27efa81306c063b23be9235"],
  ["astro.config.mjs", "dbea7720436ea60e5d2f3a090b14e89e64d055eb"],
  ["package-lock.json", "e6efe95e1029e95b98c72dc7cb3121d9fb86f49a"],
]);

const videoExtensions = new Set([".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v", ".ogv"]);
const audioExtensions = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"]);
const externalModelExtensions = new Set([".obj", ".fbx", ".gltf", ".glb", ".stl", ".abc", ".usd", ".usda", ".usdc", ".usdz"]);
const externalImageExtensions = new Set([".jpg", ".jpeg", ".webp", ".avif", ".heic", ".tif", ".tiff", ".exr", ".hdr"]);
const referenceBinaryExtensions = new Set([
  ".apng",
  ".avif",
  ".bmp",
  ".cr2",
  ".dng",
  ".exr",
  ".gif",
  ".heic",
  ".heif",
  ".hdr",
  ".jpeg",
  ".jpg",
  ".nef",
  ".png",
  ".psb",
  ".psd",
  ".raw",
  ".svg",
  ".tif",
  ".tiff",
  ".webp",
]);
const fontExtensions = new Set([".eot", ".otf", ".ttf", ".woff", ".woff2"]);
const executableExtensions = new Set([".exe", ".dll", ".msi", ".bat", ".cmd", ".com"]);
const allowedPackageExtensions = new Set([".blend", ".json", ".md", ".png", ".py", ".zip"]);
const forbiddenNames = /(?:^|[\\/\-_.])(reference|photo|photograph|manufacturer|brand-logo)(?:[\\/\-_.]|$)/i;
const numberedFrame = /(?:^|\/)(?:(?:frame|shot|render)[-_]?)?\d{3,}\.(?:png|jpe?g|webp|avif)$/i;
const sequenceDirectory = /(?:^|\/)(?:frames?|animatic|sequence)(?:\/|$)/i;

function check(condition, message) {
  if (!condition) errors.push(message);
}

function normalize(value) {
  return String(value ?? "").replaceAll("\\", "/");
}

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", options.quiet ? "ignore" : "pipe"],
  }).trim();
}

function gitBuffer(args, options = {}) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    stdio: ["ignore", "pipe", options.quiet ? "ignore" : "pipe"],
    maxBuffer: 128 * 1024 * 1024,
  });
}

async function exists(absolute) {
  try {
    await fs.access(absolute);
    return true;
  } catch {
    return false;
  }
}

if (!preflight && !explicitFinal) {
  const finalSentinels = [
    path.join(packageRoot, ...packageInventoryRelative.split("/")),
    path.join(packageRoot, ...browserReviewCompositionRelative.split("/")),
    path.join(packageRoot, ...reviewBundleRelative.split("/")),
    path.join(packageRoot, ...reviewZipRelative.split("/")),
    path.join(repositoryRoot, ...browserMatrixRelative.split("/")),
    path.join(repositoryRoot, ...browserEvidenceRelative.split("/")),
    path.join(repositoryRoot, ...capturePlanSnapshotRelative.split("/")),
    path.join(repositoryRoot, ...repositoryImpactRelative.split("/")),
    ...[...exactReviewPngNames].map((name) => path.join(packageRoot, name)),
  ];
  const sentinelStates = await Promise.all(finalSentinels.map((absolute) => exists(absolute)));
  preflight = !sentinelStates.every(Boolean);
}

async function walk(directory, relative = "") {
  const records = [];
  if (!(await exists(directory))) return records;
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const childRelative = normalize(path.posix.join(relative, entry.name));
    const child = path.join(directory, entry.name);
    const metadata = await fs.lstat(child);
    check(!metadata.isSymbolicLink(), `symbolic link is forbidden in Phase 0.4 package: ${childRelative}`);
    if (metadata.isDirectory()) records.push(...(await walk(child, childRelative)));
    else if (metadata.isFile()) records.push({ absolute: child, relative: childRelative, bytes: metadata.size });
  }
  return records;
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
    ["Windows user-profile path", /[a-z]:[\\/]+(?:users|documents and settings)[\\/]+[a-z0-9._-]+/i],
    ["POSIX user-profile path", /\/(?:users|home)\/[a-z0-9._-]+(?:[\\/]|$)/i],
    ["private attachment path", /(?:^|[\\/])\.codex[\\/]+attachments[\\/]+/i],
  ];
  for (const representation of representations) {
    for (const [label, expression] of patterns) if (expression.test(representation)) return label;
  }
  return null;
}

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function recordPath(record) {
  return normalize(record?.package_relative_path ?? record?.packageRelativePath ?? record?.path ?? record?.name);
}

function recordSha(record) {
  return String(record?.sha256 ?? record?.after_sha256 ?? "").toLowerCase();
}

function arrayIsEmpty(value) {
  return Array.isArray(value) && value.length === 0;
}

function setMatches(observed, expected) {
  if (observed.size !== expected.size) return false;
  for (const value of expected) if (!observed.has(value)) return false;
  return true;
}

function arrayMatches(observed, expected) {
  return Array.isArray(observed) && observed.length === expected.length && observed.every((value, index) => value === expected[index]);
}

function pngDimensions(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature) || buffer.toString("ascii", 12, 16) !== "IHDR") {
    return null;
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function pngContainsChunk(buffer, requested) {
  let cursor = 8;
  while (cursor + 12 <= buffer.length) {
    const bytes = buffer.readUInt32BE(cursor);
    const type = buffer.toString("ascii", cursor + 4, cursor + 8);
    const next = cursor + 12 + bytes;
    if (next > buffer.length) return false;
    if (type === requested) return true;
    cursor = next;
    if (type === "IEND") break;
  }
  return false;
}

async function decodePng(buffer, relative) {
  const fileSha = sha256Buffer(buffer);
  if (decodedPngCache.has(fileSha)) return decodedPngCache.get(fileSha);
  if (!sharpDecoder) return null;
  try {
    const decoded = await sharpDecoder(buffer, { failOn: "error", limitInputPixels: false }).raw().toBuffer({ resolveWithObject: true });
    const result = {
      width: decoded.info.width,
      height: decoded.info.height,
      channels: decoded.info.channels,
      pixelSha256: sha256Buffer(decoded.data),
    };
    decodedPngCache.set(fileSha, result);
    return result;
  } catch (error) {
    errors.push(`PNG decode failed for ${relative}: ${error.message}`);
    return null;
  }
}

async function verifyFileRecord(record, label, expectedPath = null, expectedDimensions = null) {
  const relative = recordPath(record);
  check(relative.length > 0, `${label} has no package-relative path`);
  if (!relative) return null;
  if (expectedPath !== null) check(relative === expectedPath, `${label} path is ${relative}; expected ${expectedPath}`);
  check(!path.posix.isAbsolute(relative) && !relative.startsWith("../") && !relative.includes("/../"), `${label} has unsafe path: ${relative}`);
  const absolute = path.join(packageRoot, ...relative.split("/"));
  check(await exists(absolute), `${label} points to a missing file: ${relative}`);
  if (!(await exists(absolute))) return null;
  const buffer = await fs.readFile(absolute);
  const metadata = await fs.stat(absolute);
  check(numberFrom(record, ["bytes", "size", "after_bytes"]) === metadata.size, `${label} byte mismatch: ${relative}`);
  check(recordSha(record) === sha256Buffer(buffer), `${label} SHA-256 mismatch: ${relative}`);
  if (expectedDimensions !== null || path.extname(relative).toLowerCase() === ".png") {
    const dimensions = pngDimensions(buffer);
    check(dimensions !== null, `${label} is not a valid PNG: ${relative}`);
    if (dimensions) {
      const recordedWidth = numberFrom(record, ["width"]);
      const recordedHeight = numberFrom(record, ["height"]);
      if (Number.isFinite(recordedWidth)) check(recordedWidth === dimensions.width, `${label} width mismatch: ${relative}`);
      if (Number.isFinite(recordedHeight)) check(recordedHeight === dimensions.height, `${label} height mismatch: ${relative}`);
      if (expectedDimensions) {
        check(Number.isFinite(recordedWidth) && Number.isFinite(recordedHeight), `${label} does not record PNG dimensions: ${relative}`);
        check(dimensions.width === expectedDimensions.width, `${label} width is ${dimensions.width}; expected ${expectedDimensions.width}`);
        check(dimensions.height === expectedDimensions.height, `${label} height is ${dimensions.height}; expected ${expectedDimensions.height}`);
      }
    }
    check(!pngContainsChunk(buffer, "acTL"), `${label} is an animated PNG: ${relative}`);
    const decoded = await decodePng(buffer, relative);
    if (decoded && dimensions) {
      check(decoded.width === dimensions.width && decoded.height === dimensions.height, `${label} decoded dimensions differ from IHDR: ${relative}`);
    }
    return { relative, buffer, metadata, decoded };
  }
  return { relative, buffer, metadata };
}

async function verifyRepositoryFileRecord(record, label, expectedPath = null, expectedDimensions = null) {
  const relative = repositoryRecordPath(record);
  check(relative.length > 0, `${label} has no repository-relative path`);
  if (!relative) return null;
  if (expectedPath !== null) check(relative === expectedPath, `${label} path is ${relative}; expected ${expectedPath}`);
  check(!path.posix.isAbsolute(relative) && !relative.startsWith("../") && !relative.includes("/../"), `${label} has unsafe path: ${relative}`);
  const absolute = path.join(repositoryRoot, ...relative.split("/"));
  check(await exists(absolute), `${label} points to a missing file: ${relative}`);
  if (!(await exists(absolute))) return null;
  const buffer = await fs.readFile(absolute);
  const metadata = await fs.stat(absolute);
  check(numberFrom(record, ["bytes", "size", "after_bytes"]) === metadata.size, `${label} byte mismatch: ${relative}`);
  check(recordSha(record) === sha256Buffer(buffer), `${label} SHA-256 mismatch: ${relative}`);
  if (expectedDimensions !== null || path.extname(relative).toLowerCase() === ".png") {
    const dimensions = pngDimensions(buffer);
    check(dimensions !== null, `${label} is not a valid PNG: ${relative}`);
    if (dimensions) {
      const recordedWidth = numberFrom(record, ["width"]);
      const recordedHeight = numberFrom(record, ["height"]);
      check(Number.isFinite(recordedWidth) && recordedWidth === dimensions.width, `${label} width mismatch: ${relative}`);
      check(Number.isFinite(recordedHeight) && recordedHeight === dimensions.height, `${label} height mismatch: ${relative}`);
      if (expectedDimensions) {
        check(dimensions.width === expectedDimensions.width, `${label} width is ${dimensions.width}; expected ${expectedDimensions.width}`);
        check(dimensions.height === expectedDimensions.height, `${label} height is ${dimensions.height}; expected ${expectedDimensions.height}`);
      }
    }
    check(!pngContainsChunk(buffer, "acTL"), `${label} is an animated PNG: ${relative}`);
    const decoded = await decodePng(buffer, relative);
    return { relative, buffer, metadata, decoded };
  }
  return { relative, buffer, metadata };
}

function findEndOfCentralDirectory(buffer) {
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    table[value] = crc >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipExtraFieldIds(buffer) {
  const ids = [];
  let cursor = 0;
  while (cursor + 4 <= buffer.length) {
    const id = buffer.readUInt16LE(cursor);
    const bytes = buffer.readUInt16LE(cursor + 2);
    if (cursor + 4 + bytes > buffer.length) throw new Error("truncated ZIP extra field");
    ids.push(id);
    cursor += 4 + bytes;
  }
  if (cursor !== buffer.length) throw new Error("malformed ZIP extra fields");
  return ids;
}

function readZipMembers(buffer) {
  const members = [];
  const end = findEndOfCentralDirectory(buffer);
  if (end < 0) throw new Error("end-of-central-directory record not found");
  const disk = buffer.readUInt16LE(end + 4);
  const centralDisk = buffer.readUInt16LE(end + 6);
  const entriesOnDisk = buffer.readUInt16LE(end + 8);
  const totalEntries = buffer.readUInt16LE(end + 10);
  const centralBytes = buffer.readUInt32LE(end + 12);
  const centralOffset = buffer.readUInt32LE(end + 16);
  const archiveCommentBytes = buffer.readUInt16LE(end + 20);
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== totalEntries) throw new Error("multi-disk ZIP is forbidden");
  if (totalEntries === 0xffff || centralBytes === 0xffffffff || centralOffset === 0xffffffff) throw new Error("ZIP64 review bundles are forbidden");
  if (archiveCommentBytes !== 0 || end + 22 + archiveCommentBytes !== buffer.length) throw new Error("ZIP comments or appended bytes are forbidden");
  if (centralOffset + centralBytes !== end) throw new Error("central directory does not end at the archive terminator");
  let cursor = centralOffset;
  let minimumLocalOffset = Number.POSITIVE_INFINITY;
  let totalUncompressedBytes = 0;
  const localRanges = [];
  for (let index = 0; index < totalEntries; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error(`invalid central-directory entry ${index}`);
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const centralCrc = buffer.readUInt32LE(cursor + 16);
    const compressedBytes = buffer.readUInt32LE(cursor + 20);
    const uncompressedBytes = buffer.readUInt32LE(cursor + 24);
    const nameBytes = buffer.readUInt16LE(cursor + 28);
    const extraBytes = buffer.readUInt16LE(cursor + 30);
    const commentBytes = buffer.readUInt16LE(cursor + 32);
    const externalAttributes = buffer.readUInt32LE(cursor + 38);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = normalize(buffer.toString(flags & 0x0800 ? "utf8" : "latin1", cursor + 46, cursor + 46 + nameBytes));
    const centralExtra = buffer.subarray(cursor + 46 + nameBytes, cursor + 46 + nameBytes + extraBytes);
    const extraIds = zipExtraFieldIds(centralExtra);
    if (extraIds.includes(0x0001) || extraIds.includes(0x7075)) throw new Error(`ZIP64 or Unicode path extra field is forbidden for ${name}`);
    if (commentBytes !== 0) throw new Error(`member comments are forbidden for ${name}`);
    if (flags & 0x0001) throw new Error(`encrypted ZIP member is forbidden: ${name}`);
    if (flags & 0x0008) throw new Error(`data-descriptor ZIP member is forbidden: ${name}`);
    if (((externalAttributes >>> 16) & 0o170000) === 0o120000) throw new Error(`symlink ZIP member is forbidden: ${name}`);
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`invalid local header for ${name}`);
    minimumLocalOffset = Math.min(minimumLocalOffset, localOffset);
    const localFlags = buffer.readUInt16LE(localOffset + 6);
    const localMethod = buffer.readUInt16LE(localOffset + 8);
    const localCrc = buffer.readUInt32LE(localOffset + 14);
    const localCompressedBytes = buffer.readUInt32LE(localOffset + 18);
    const localUncompressedBytes = buffer.readUInt32LE(localOffset + 22);
    const localNameBytes = buffer.readUInt16LE(localOffset + 26);
    const localExtraBytes = buffer.readUInt16LE(localOffset + 28);
    const localName = normalize(buffer.toString(localFlags & 0x0800 ? "utf8" : "latin1", localOffset + 30, localOffset + 30 + localNameBytes));
    const localExtra = buffer.subarray(localOffset + 30 + localNameBytes, localOffset + 30 + localNameBytes + localExtraBytes);
    const localExtraIds = zipExtraFieldIds(localExtra);
    if (localExtraIds.includes(0x0001) || localExtraIds.includes(0x7075)) throw new Error(`local ZIP64 or Unicode path extra field is forbidden for ${name}`);
    if (localName !== name || localFlags !== flags || localMethod !== method) throw new Error(`local/central header mismatch for ${name}`);
    if (localCrc !== centralCrc || localCompressedBytes !== compressedBytes || localUncompressedBytes !== uncompressedBytes) {
      throw new Error(`local/central size or CRC mismatch for ${name}`);
    }
    const dataOffset = localOffset + 30 + localNameBytes + localExtraBytes;
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedBytes);
    if (compressed.length !== compressedBytes) throw new Error(`truncated member ${name}`);
    if (dataOffset + compressedBytes > centralOffset) throw new Error(`member overlaps central directory: ${name}`);
    localRanges.push({ start: localOffset, end: dataOffset + compressedBytes, name });
    let contents;
    if (method === 0) contents = Buffer.from(compressed);
    else if (method === 8) contents = inflateRawSync(compressed);
    else throw new Error(`unsupported compression method ${method} for ${name}`);
    if (contents.length !== uncompressedBytes) throw new Error(`uncompressed byte mismatch for ${name}`);
    if (crc32(contents) !== centralCrc) throw new Error(`CRC-32 mismatch for ${name}`);
    if (compressedBytes === 0 && uncompressedBytes > 0) throw new Error(`invalid compression ratio for ${name}`);
    if (compressedBytes > 0 && uncompressedBytes / compressedBytes > 200) throw new Error(`excessive compression ratio for ${name}`);
    totalUncompressedBytes += uncompressedBytes;
    if (totalUncompressedBytes > 200 * 1024 * 1024) throw new Error("review ZIP expands beyond 200 MiB");
    members.push({ name, contents });
    cursor += 46 + nameBytes + extraBytes + commentBytes;
  }
  if (cursor !== centralOffset + centralBytes) throw new Error("central-directory byte count mismatch");
  if (minimumLocalOffset !== 0) throw new Error("prepended ZIP payload is forbidden");
  localRanges.sort((left, right) => left.start - right.start);
  for (let index = 0; index < localRanges.length; index += 1) {
    const expectedStart = index === 0 ? 0 : localRanges[index - 1].end;
    if (localRanges[index].start !== expectedStart) throw new Error(`hidden gap or overlapping local member before ${localRanges[index].name}`);
  }
  if (localRanges.at(-1)?.end !== centralOffset) throw new Error("hidden payload exists before the central directory");
  return members;
}

async function readJson(absolute, label) {
  try {
    return JSON.parse(await fs.readFile(absolute, "utf8"));
  } catch (error) {
    errors.push(`${label} is missing or invalid JSON: ${error.message}`);
    return {};
  }
}

function recordsFrom(value) {
  if (Array.isArray(value)) return value;
  for (const key of ["records", "files", "assets", "outputs", "review_files", "reviewFiles"]) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return [];
}

function collectGovernedFileRecords(value, location = "$", records = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectGovernedFileRecords(item, `${location}[${index}]`, records));
    return records;
  }
  if (!value || typeof value !== "object") return records;
  const relative = value.package_relative_path;
  const hasHash = typeof value.sha256 === "string" || typeof value.after_sha256 === "string";
  const hasBytes = value.bytes !== undefined || value.after_bytes !== undefined || value.size !== undefined;
  if (typeof relative === "string" && hasHash && hasBytes) records.push({ record: value, location });
  for (const [key, nested] of Object.entries(value)) collectGovernedFileRecords(nested, `${location}.${key}`, records);
  return records;
}

function numberFrom(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length > 0 && Number.isFinite(Number(value))) return Number(value);
  }
  return Number.NaN;
}

function sourceValidationCount(validation, keys) {
  for (const key of keys) {
    const direct = validation?.[key];
    if (typeof direct === "number" && Number.isFinite(direct)) return direct;
    if (typeof direct === "string" && direct.trim().length > 0 && Number.isFinite(Number(direct))) return Number(direct);
    if (Array.isArray(direct)) return direct.length;
    const nested = validation?.summary?.[key] ?? validation?.counts?.[key] ?? validation?.external_dependencies?.[key];
    if (typeof nested === "number" && Number.isFinite(nested)) return nested;
    if (typeof nested === "string" && nested.trim().length > 0 && Number.isFinite(Number(nested))) return Number(nested);
    if (Array.isArray(nested)) return nested.length;
  }
  return Number.NaN;
}

function sameFileRecord(left, right) {
  return (
    recordPath(left) === recordPath(right) &&
    numberFrom(left, ["bytes", "size", "after_bytes"]) === numberFrom(right, ["bytes", "size", "after_bytes"]) &&
    recordSha(left) === recordSha(right) &&
    (!Number.isFinite(numberFrom(left, ["width"])) || numberFrom(left, ["width"]) === numberFrom(right, ["width"])) &&
    (!Number.isFinite(numberFrom(left, ["height"])) || numberFrom(left, ["height"]) === numberFrom(right, ["height"]))
  );
}

function repositoryRecordPath(record) {
  return normalize(record?.repository_relative_path ?? record?.repositoryRelativePath ?? record?.path ?? record?.name);
}

const topLevel = normalize(git(["rev-parse", "--show-toplevel"]));
check(topLevel.toLowerCase() === normalize(repositoryRoot).toLowerCase(), "Phase 0.4 verifier must run at the Qsite1 Git top-level");
check(git(["remote", "get-url", "origin"]) === expectedOrigin, "origin URL differs from the authorized Qsite1 remote");
check(git(["remote", "get-url", "--push", "origin"]) === expectedOrigin, "origin push URL differs from the authorized Qsite1 remote");
check(git(["branch", "--show-current"]) === expectedBranch, `Phase 0.4 work must remain on ${expectedBranch}`);
try {
  git(["merge-base", "--is-ancestor", acceptedParent, "HEAD"]);
} catch {
  errors.push(`accepted parent ${acceptedParent} is not an ancestor of HEAD`);
}

for (const [protectedPath, expectedObject] of protectedBaseline) {
  let observed = "";
  try {
    observed = git(["rev-parse", `HEAD:${protectedPath}`], { quiet: true });
  } catch {
    errors.push(`protected baseline path is missing: ${protectedPath}`);
    continue;
  }
  check(observed === expectedObject, `protected baseline changed: ${protectedPath}`);
  const workingDiff = git(["diff", "--name-only", "--", protectedPath], { quiet: true });
  check(workingDiff.length === 0, `protected working-tree change detected: ${protectedPath}`);
  const stagedDiff = git(["diff", "--cached", "--name-only", "--", protectedPath], { quiet: true });
  check(stagedDiff.length === 0, `protected staged change detected: ${protectedPath}`);
  const untracked = git(["ls-files", "--others", "--exclude-standard", "--", protectedPath], { quiet: true });
  check(untracked.length === 0, `protected path contains untracked content: ${protectedPath}`);
}

const changedCandidatePaths = new Set([
  ...git(["diff", "--name-only", acceptedParent, "--"], { quiet: true }).split(/\r?\n/),
  ...git(["ls-files", "--others", "--exclude-standard"], { quiet: true }).split(/\r?\n/),
]);
changedCandidatePaths.delete("");
for (const relative of changedCandidatePaths) {
  const normalized = normalize(relative);
  const absolute = path.join(repositoryRoot, ...normalized.split("/"));
  if (!(await exists(absolute))) continue;
  const metadata = await fs.lstat(absolute);
  if (!metadata.isFile()) continue;
  const buffer = await fs.readFile(absolute);
  const privateHit = privatePathHit(buffer);
  check(privateHit === null, `${privateHit} leaked into Phase 0.4 candidate file ${normalized}`);
  const extension = path.extname(normalized).toLowerCase();
  check(!videoExtensions.has(extension) && !audioExtensions.has(extension), `Phase 0.4 candidate adds forbidden media: ${normalized}`);
  if (referenceBinaryExtensions.has(extension)) {
    check(!forbiddenNames.test(normalized), `private/reference-oriented binary filename is forbidden in the Phase 0.4 candidate: ${normalized}`);
    check(
      normalized.startsWith(`${packageRelative}/`) || normalized.startsWith("artifacts/evidence/phase-0-4-crt-television/"),
      `Phase 0.4 candidate image/reference binary is outside the governed original/evidence roots: ${normalized}`,
    );
  }
}

const stagedCandidatePaths = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"], { quiet: true })
  .split(/\r?\n/)
  .filter(Boolean);
for (const relative of stagedCandidatePaths) {
  const normalized = normalize(relative);
  let buffer;
  try {
    buffer = gitBuffer(["show", `:${relative}`], { quiet: true });
  } catch {
    errors.push(`unable to inspect staged Phase 0.4 candidate blob: ${normalized}`);
    continue;
  }
  const privateHit = privatePathHit(buffer);
  check(privateHit === null, `${privateHit} leaked into staged Phase 0.4 candidate ${normalized}`);
  const extension = path.extname(normalized).toLowerCase();
  check(!videoExtensions.has(extension) && !audioExtensions.has(extension), `staged Phase 0.4 candidate adds forbidden media: ${normalized}`);
  if (referenceBinaryExtensions.has(extension)) {
    check(!forbiddenNames.test(normalized), `private/reference-oriented binary filename is forbidden in the staged candidate: ${normalized}`);
    check(
      normalized.startsWith(`${packageRelative}/`) || normalized.startsWith("artifacts/evidence/phase-0-4-crt-television/"),
      `staged Phase 0.4 image/reference binary is outside the governed original/evidence roots: ${normalized}`,
    );
  }
}

if (!preflight) {
  const historicalObjects = git(["rev-list", "--objects", `${acceptedParent}..HEAD`], { quiet: true })
    .split(/\r?\n/)
    .filter(Boolean);
  const inspectedBlobs = new Set();
  for (const line of historicalObjects) {
    const separator = line.indexOf(" ");
    const objectId = separator < 0 ? line : line.slice(0, separator);
    const historicalPath = separator < 0 ? "" : normalize(line.slice(separator + 1));
    let type = "";
    try {
      type = git(["cat-file", "-t", objectId], { quiet: true });
    } catch {
      errors.push(`unable to inspect Phase 0.4 branch-history object ${objectId}`);
      continue;
    }
    if (type !== "blob" || inspectedBlobs.has(objectId)) continue;
    inspectedBlobs.add(objectId);
    const buffer = gitBuffer(["cat-file", "blob", objectId], { quiet: true });
    const privateHit = privatePathHit(buffer);
    check(privateHit === null, `${privateHit} leaked into Phase 0.4 branch-history blob ${objectId}${historicalPath ? ` (${historicalPath})` : ""}`);
    const extension = path.extname(historicalPath).toLowerCase();
    check(!historicalPath || (!videoExtensions.has(extension) && !audioExtensions.has(extension)), `Phase 0.4 branch history contains forbidden media: ${historicalPath}`);
    if (historicalPath && referenceBinaryExtensions.has(extension)) {
      check(!forbiddenNames.test(historicalPath), `private/reference-oriented binary filename exists in Phase 0.4 branch history: ${historicalPath}`);
      check(
        historicalPath.startsWith(`${packageRelative}/`) || historicalPath.startsWith("artifacts/evidence/phase-0-4-crt-television/"),
        `Phase 0.4 branch-history image/reference binary is outside the governed original/evidence roots: ${historicalPath}`,
      );
    }
  }
}

check(await exists(packageRoot), `missing Phase 0.4 package root: ${packageRelative}`);
check(await exists(path.join(packageRoot, "crt-portal-layout.json")), "missing additive CRT portal-layout authority");

const portalLayout = await readJson(path.join(packageRoot, "crt-portal-layout.json"), "CRT portal-layout authority");
check(
  portalLayout.schema === "quantum-hub.phase-0-4-crt-television.crt-portal-layout.v1",
  "CRT portal-layout schema is not the authorized v1 schema",
);
check(
  portalLayout.historicalBoundary?.apertureStationStatus === "superseded by direct human creative decision",
  "CRT portal-layout authority does not preserve the Aperture Station supersession decision",
);
check(
  portalLayout.privateReference?.reference === "user-supplied CRT television photograph" &&
    portalLayout.privateReference?.repositoryStatus === "intentionally uncommitted" &&
    portalLayout.privateReference?.publicUse === false &&
    portalLayout.privateReference?.textureUse === false &&
    portalLayout.privateReference?.externalBlenderDependencyAllowed === false,
  "CRT portal-layout authority violates the opaque private-reference boundary",
);
check(portalLayout.coordinateSystems?.physicalScreenLocal?.aspectRatio === "4:3", "CRT physical screen-local authority is not 4:3");
check(portalLayout.physicalScreen?.screenGlassBoundsInCameraFrame?.aspectRatio === "4:3", "CRT glass bounds are not 4:3");
check(portalLayout.physicalScreen?.activeRasterBoundsInCameraFrame?.aspectRatio === "4:3", "CRT active raster bounds are not 4:3");
check(portalLayout.physicalScreen?.offState?.powered === false, "CRT portal authority does not begin powered off");
check(portalLayout.physicalScreen?.offState?.emission === false, "CRT portal authority permits dormant emission");
check(portalLayout.copyOwnership?.physicalScreen?.headingProhibited === "WHERE DO YOU ENTER?", "CRT physical raster does not prohibit the semantic portal heading");
check(portalLayout.copyOwnership?.semanticDom?.heading === "WHERE DO YOU ENTER?", "CRT portal authority does not bind the semantic heading");
const transitionCheckpoints = portalLayout.aspectTransition?.checkpoints ?? [];
check(transitionCheckpoints.length === 5, `CRT portal authority has ${transitionCheckpoints.length}/5 aspect-transition checkpoints`);
check(
  transitionCheckpoints.map((checkpoint) => Number(checkpoint.progress)).join(",") === "0,0.3,0.56,0.74,1",
  "CRT portal aspect-transition progress checkpoints changed",
);
check(transitionCheckpoints.at(-1)?.owner === "semantic-dom", "CRT portal transition does not end with semantic DOM ownership");
check(portalLayout.portalAlignment?.finalCameraCrop?.noPermanentLetterbox === true, "CRT portal permits permanent 4:3 letterboxing");
check(portalLayout.portalAlignment?.finalCameraCrop?.noAbruptAspectSnap === true, "CRT portal permits an abrupt aspect-ratio snap");
check(portalLayout.portalAlignment?.finalCameraCrop?.noAdditionalGesture === true, "CRT portal permits an additional handoff gesture");
check(portalLayout.wholeWordContract?.css?.wordBreak === "normal", "CRT portal whole-word contract changes word-break");
check(portalLayout.wholeWordContract?.css?.overflowWrap === "normal", "CRT portal whole-word contract changes overflow-wrap");
check(portalLayout.wholeWordContract?.css?.hyphens === "none", "CRT portal whole-word contract permits hyphenation");
check(
  portalLayout.keepoutContract?.expectedAuthority?.path === `${packageRelative}/manifests/crt-scene-source-keepouts.json` &&
    portalLayout.keepoutContract?.expectedAuthority?.schema === "quantum-hub.phase-0-4-crt-television.scene-source-keepouts.v1",
  "CRT portal-layout authority does not bind the additive scene-source keepout contract",
);
check(
  setMatches(new Set((portalLayout.keepoutContract?.requiredGeometry ?? []).map((item) => item.id)), new Set(["crt-cabinet", "crt-screen", "spiral-cable"])),
  "CRT portal-layout authority does not bind exactly cabinet, screen and segmented spiral-cable keepouts",
);
check((portalLayout.keepoutContract?.sourceRoles ?? []).length === 6, "CRT portal-layout authority does not bind six creative source roles");
check(portalLayout.reducedMotion?.loadsCinematicVideoOrFrames === false, "CRT reduced-motion contract permits cinematic media");
check(portalLayout.reducedMotion?.televisionPowered === false, "CRT reduced-motion contract permits a powered television");
check(portalLayout.reducedMotion?.cableDormant === true, "CRT reduced-motion contract does not keep the cable dormant");

const packageFiles = await walk(packageRoot);
for (const file of packageFiles) {
  const extension = path.extname(file.relative).toLowerCase();
  const extensionAllowed = allowedPackageExtensions.has(extension) || file.relative === "work/.gitignore";
  check(extensionAllowed, `unapproved Phase 0.4 package file type: ${file.relative}`);
  check(file.bytes < maximumFileBytes, `file reaches the 100 MiB boundary: ${file.relative} / ${file.bytes}`);
  check(!videoExtensions.has(extension), `video/full-animatic media is forbidden in Phase 0.4: ${file.relative}`);
  check(!audioExtensions.has(extension), `audio is forbidden in Phase 0.4: ${file.relative}`);
  check(!externalModelExtensions.has(extension), `external model shortcut is forbidden: ${file.relative}`);
  check(!externalImageExtensions.has(extension), `external/reference image source is forbidden in the original package: ${file.relative}`);
  check(!fontExtensions.has(extension), `font binary is forbidden in Phase 0.4: ${file.relative}`);
  check(!executableExtensions.has(extension), `executable is forbidden in Phase 0.4: ${file.relative}`);
  check(!/\.blend\d+$/i.test(file.relative), `Blender backup is forbidden: ${file.relative}`);
  check(!numberedFrame.test(file.relative), `numbered frame-sequence member is forbidden: ${file.relative}`);
  check(!sequenceDirectory.test(file.relative), `frame-sequence or animatic directory is forbidden: ${file.relative}`);
  check(!forbiddenNames.test(file.relative), `private/reference-oriented filename is forbidden: ${file.relative}`);
  const buffer = await fs.readFile(file.absolute);
  check(!buffer.subarray(0, 200).toString("utf8").includes("version https://git-lfs.github.com/spec/v1"), `Git LFS pointer is forbidden: ${file.relative}`);
  const privateHit = privatePathHit(buffer);
  check(privateHit === null, `${privateHit} leaked into ${file.relative}`);
}

const requiredProportionGateAuthorities = [
  proportionSourceRelative,
  proportionManifestRelative,
  proportionDecisionRelative,
  proportionValidationRelative,
  sanitizerRelative,
  proportionSheetRelative,
];
for (const relative of requiredProportionGateAuthorities) {
  check(await exists(path.join(packageRoot, ...relative.split("/"))), `missing CRT proportion-gate authority: ${relative}`);
}

const proportionValidation = await readJson(
  path.join(packageRoot, ...proportionValidationRelative.split("/")),
  "CRT proportion source validation",
);
check(
  proportionValidation.schema === "quantum-hub.phase-0-4-crt-television.proportion-source-validation.v1",
  "CRT proportion source-validation schema is not the authorized v1 schema",
);
check(String(proportionValidation.status ?? "").toUpperCase() === "PASS", "CRT proportion source validation is not PASS");
const validatedProportionSource = await verifyFileRecord(
  proportionValidation.source ?? {},
  "CRT proportion source validation",
  proportionSourceRelative,
);
for (const [label, keys] of [
  ["external libraries", ["external_libraries", "externalLibraries", "libraries"]],
  ["external images", ["external_images", "externalImages", "images"]],
  ["packed files", ["packed_files", "packedFiles", "packed"]],
  ["external file paths", ["external_file_paths", "externalFilePaths"]],
  ["missing files", ["missing_files", "missingFiles", "missing"]],
  ["image texture nodes", ["image_texture_nodes", "imageTextureNodes"]],
]) {
  const count = sourceValidationCount(proportionValidation, keys);
  check(Number.isFinite(count), `CRT proportion source validation does not expose numeric ${label}`);
  check(count === 0, `CRT proportion source validation reports ${count} ${label}`);
}
check(
  Array.isArray(proportionValidation.checks) && proportionValidation.checks.length > 0,
  "CRT proportion source validation has no explicit checks",
);
for (const item of proportionValidation.checks ?? []) {
  check(item.pass === true, `CRT proportion source validation check is not PASS: ${item.name ?? "unnamed"}`);
}
check(
  Array.isArray(proportionValidation.option_collections) && proportionValidation.option_collections.length === 3,
  "CRT proportion source validation does not bind exactly three option collections",
);
check(
  Array.isArray(proportionValidation.screen_measurements) && proportionValidation.screen_measurements.length === 3,
  "CRT proportion source validation does not bind exactly three screen measurements",
);
for (const screen of proportionValidation.screen_measurements ?? []) {
  const ratio = Number(screen.ratio);
  check(Number.isFinite(ratio) && Math.abs(ratio - 4 / 3) <= 0.002, `CRT proportion screen is not 4:3 within tolerance: ${screen.object ?? "unnamed"}`);
}

const proportionDecision = await readJson(
  path.join(packageRoot, ...proportionDecisionRelative.split("/")),
  "CRT proportion decision manifest",
);
check(
  proportionDecision.schema === "quantum-hub.phase-0-4-crt-television.proportion-decision.v1",
  "CRT proportion decision schema is not the authorized v1 schema",
);
check(proportionDecision.provisional_selection === "A", "CRT proportion gate must preserve independently selected Option A");
check(
  proportionDecision.high_detail_refinement_started === false,
  "historical CRT proportion gate must record that high-detail refinement was held until selection",
);
const decisionOptions = new Set(Object.keys(proportionDecision.options ?? {}));
check(setMatches(decisionOptions, expectedProportionOptions), "CRT proportion decision must contain exactly Options A, B, and C");
for (const option of expectedProportionOptions) {
  const record = proportionDecision.options?.[option] ?? {};
  const dimensions = record.dimensions_m ?? {};
  check(Number(dimensions.width) >= 0.78 && Number(dimensions.width) <= 0.95, `Option ${option} width is outside the authorized CRT range`);
  check(Number(dimensions.height) >= 0.62 && Number(dimensions.height) <= 0.78, `Option ${option} height is outside the authorized CRT range`);
  check(Number(dimensions.depth) >= 0.65 && Number(dimensions.depth) <= 0.85, `Option ${option} depth is outside the authorized CRT range`);
  check(Number(record.screen_class_inches) >= 28 && Number(record.screen_class_inches) <= 32, `Option ${option} screen class is outside 28–32 inches`);
  check(record.screen_visible_m?.aspect === "4:3", `Option ${option} does not declare a 4:3 visible screen`);
  check(String(record.cable_connection ?? "").length > 0, `Option ${option} omits its physical cable connection`);
  check(String(record.strongest_quality ?? "").length > 0, `Option ${option} omits its strongest quality`);
  check(String(record.strongest_risk ?? "").length > 0, `Option ${option} omits its strongest visual risk`);
}
const creativeBoundary = proportionDecision.creative_boundary ?? {};
check(creativeBoundary.modelled_from_scratch === true, "CRT proportion decision does not declare modelled-from-scratch provenance");
check(creativeBoundary.procedural_materials_only === true, "CRT proportion decision does not declare procedural-only materials");
check(Number(creativeBoundary.third_party_model_count) === 0, "CRT proportion decision reports a third-party model");
check(Number(creativeBoundary.external_texture_count) === 0, "CRT proportion decision reports an external texture");
check(Number(creativeBoundary.reference_image_datablock_count) === 0, "CRT proportion decision reports a reference-image datablock");
check(Number(creativeBoundary.packed_file_count) === 0, "CRT proportion decision reports a packed file");
check(creativeBoundary.private_reference === "user-supplied CRT television photograph", "CRT proportion decision uses non-opaque private-reference wording");
check(creativeBoundary.private_reference_repository_status === "intentionally uncommitted", "CRT proportion decision does not keep the private reference uncommitted");
check(creativeBoundary.manufacturer_branding === false, "CRT proportion decision permits manufacturer branding");
check(creativeBoundary.screen_aspect === "4:3", "CRT proportion decision does not bind the physical screen to 4:3");
await verifyFileRecord(
  proportionDecision.sheet ?? {},
  "CRT proportion decision sheet",
  proportionSheetRelative,
  { width: 4300, height: 3560 },
);

const proportionRenderManifest = await readJson(
  path.join(packageRoot, ...proportionManifestRelative.split("/")),
  "CRT proportion render manifest",
);
check(
  proportionRenderManifest.schema === "quantum-hub.phase-0-4-crt-television.proportion-renders.v1",
  "CRT proportion render schema is not the authorized v1 schema",
);
const renderedProportionSource = await verifyFileRecord(
  proportionRenderManifest.source ?? {},
  "CRT proportion render source",
  proportionSourceRelative,
);
if (validatedProportionSource && renderedProportionSource) {
  check(
    sha256Buffer(validatedProportionSource.buffer) === sha256Buffer(renderedProportionSource.buffer),
    "CRT proportion render and validation authorities do not bind the same source bytes",
  );
  check(
    recordSha(proportionValidation.source) === recordSha(proportionRenderManifest.source),
    "CRT proportion render and validation manifests report different source SHA-256 values",
  );
}
const renderBoundary = proportionRenderManifest.creative_boundary ?? {};
check(renderBoundary.modelled_from_scratch === true, "CRT proportion render manifest does not declare scratch modelling");
check(renderBoundary.procedural_materials_only === true, "CRT proportion render manifest does not declare procedural materials");
check(renderBoundary.third_party_models === false, "CRT proportion render manifest reports third-party models");
check(renderBoundary.external_textures === false, "CRT proportion render manifest reports external textures");
check(renderBoundary.reference_image_loaded === false, "CRT proportion render manifest reports a loaded reference image");
const proportionRenderRecords = recordsFrom(proportionRenderManifest);
check(proportionRenderRecords.length === 18, `CRT proportion render manifest has ${proportionRenderRecords.length}/18 records`);
const observedOptionViews = new Set();
const renderByPath = new Map();
for (const record of proportionRenderRecords) {
  const option = String(record.option ?? "");
  const view = String(record.view ?? "");
  check(expectedProportionOptions.has(option), `CRT proportion render has unexpected option: ${option || "missing"}`);
  check(expectedProportionViews.has(view), `CRT proportion render has unexpected view: ${view || "missing"}`);
  const pair = `${option}:${view}`;
  check(!observedOptionViews.has(pair), `CRT proportion render duplicates ${pair}`);
  observedOptionViews.add(pair);
  check(record.intendedCommit === true, `CRT proportion render is not intended for commit: ${recordPath(record)}`);
  check(String(record.classification ?? "").length > 0, `CRT proportion render classification missing: ${recordPath(record)}`);
  check(String(record.approval_state ?? "").length > 0, `CRT proportion render approval state missing: ${recordPath(record)}`);
  await verifyFileRecord(record, `CRT proportion render ${pair}`, null, { width: 760, height: 570 });
  renderByPath.set(recordPath(record), record);
}
for (const option of expectedProportionOptions) {
  for (const view of expectedProportionViews) check(observedOptionViews.has(`${option}:${view}`), `CRT proportion render omits ${option}:${view}`);
}
const decisionSourceRenders = proportionDecision.source_renders ?? [];
check(decisionSourceRenders.length === 18, `CRT proportion decision has ${decisionSourceRenders.length}/18 source-render records`);
for (const record of decisionSourceRenders) {
  const relative = recordPath(record);
  const rendered = renderByPath.get(relative);
  check(Boolean(rendered), `CRT proportion decision points outside the canonical render manifest: ${relative}`);
  if (!rendered) continue;
  check(record.option === rendered.option && record.view === rendered.view, `CRT proportion decision option/view mismatch: ${relative}`);
  check(numberFrom(record, ["bytes"]) === numberFrom(rendered, ["bytes"]), `CRT proportion decision byte mismatch: ${relative}`);
  check(recordSha(record) === recordSha(rendered), `CRT proportion decision SHA-256 mismatch: ${relative}`);
}

const sanitizer = await readJson(path.join(packageRoot, ...sanitizerRelative.split("/")), "CRT PNG metadata sanitizer manifest");
check(
  sanitizer.schema === "quantum-hub.phase-0-4-crt-television.png-metadata-sanitization.v1",
  "CRT PNG sanitizer schema is not the authorized v1 schema",
);
check(sanitizer.pixel_preservation_required === true, "CRT PNG sanitizer does not require decoded-pixel preservation");
check(sanitizer.all_pixels_preserved === true, "CRT PNG sanitizer reports changed decoded pixels");
check(arrayIsEmpty(sanitizer.private_marker_hits), "CRT PNG sanitizer reports private markers");
const sanitizerScriptRelative = recordPath(sanitizer.sanitizer ?? {});
check(sanitizerScriptRelative === "source/sanitize_crt_png_metadata.py", "CRT PNG sanitizer does not bind its committed script");
if (sanitizerScriptRelative) {
  const sanitizerScriptAbsolute = path.join(packageRoot, ...sanitizerScriptRelative.split("/"));
  check(await exists(sanitizerScriptAbsolute), "CRT PNG sanitizer script is missing");
  if (await exists(sanitizerScriptAbsolute)) {
    const buffer = await fs.readFile(sanitizerScriptAbsolute);
    check(String(sanitizer.sanitizer.sha256 ?? "").toLowerCase() === sha256Buffer(buffer), "CRT PNG sanitizer script SHA-256 mismatch");
  }
}
const currentPngFiles = packageFiles.filter((file) => path.extname(file.relative).toLowerCase() === ".png");
const sanitizerRecords = recordsFrom(sanitizer);
check(sanitizerRecords.length === currentPngFiles.length, `CRT PNG sanitizer covers ${sanitizerRecords.length}/${currentPngFiles.length} current PNGs`);
const sanitizedPaths = new Set();
for (const record of sanitizerRecords) {
  const relative = recordPath(record);
  check(!sanitizedPaths.has(relative), `CRT PNG sanitizer duplicates ${relative}`);
  sanitizedPaths.add(relative);
  check(record.pixels_preserved === true, `CRT PNG decoded pixels were not preserved: ${relative}`);
  check(arrayIsEmpty(record.private_marker_hits), `CRT PNG sanitizer reports a private marker: ${relative}`);
  check(arrayIsEmpty(record.remaining_metadata_keys), `CRT PNG retains metadata keys: ${relative}`);
  check(/^[a-f0-9]{64}$/i.test(String(record.pixel_sha256 ?? "")), `CRT PNG sanitizer omits decoded-pixel SHA-256: ${relative}`);
  const verified = await verifyFileRecord(record, `CRT sanitized PNG ${relative}`);
  if (verified?.decoded) {
    check(
      String(record.pixel_sha256 ?? "").toLowerCase() === verified.decoded.pixelSha256,
      `CRT PNG decoded-pixel SHA-256 mismatch: ${relative}`,
    );
  }
}
for (const file of currentPngFiles) check(sanitizedPaths.has(file.relative), `CRT PNG sanitizer omits ${file.relative}`);

const refinedSourceBuild = await readJson(
  path.join(packageRoot, ...refinedSourceBuildRelative.split("/")),
  "refined CRT source-build manifest",
);
check(
  refinedSourceBuild.schema === "quantum-hub.phase-0-4-crt-television.refined-source-build.v1",
  "refined CRT source-build schema is not the authorized v1 schema",
);
await verifyFileRecord(refinedSourceBuild.source ?? {}, "refined CRT source-build source", refinedSourceRelative);
check(refinedSourceBuild.selected_variant === "A / Rounded 1990s domestic CRT", "refined CRT source-build manifest does not bind selected Option A");
check(
  Number(refinedSourceBuild.dimensions_m?.width) === 0.84 &&
    Number(refinedSourceBuild.dimensions_m?.height) === 0.69 &&
    Number(refinedSourceBuild.dimensions_m?.depth) === 0.76,
  "refined CRT source-build manifest changes the selected 0.84×0.69×0.76 m assembled dimensions",
);
check(refinedSourceBuild.screen_visible_m?.aspect === "4:3", "refined CRT source-build manifest changes the physical 4:3 screen");
check(Number(refinedSourceBuild.desktop_spiral_turns) === 2.5, "refined CRT source-build manifest changes the desktop 2.5-turn spiral");
const portalLayoutBuffer = await fs.readFile(path.join(packageRoot, "crt-portal-layout.json"));
check(
  String(refinedSourceBuild.portal_layout_sha256 ?? "").toLowerCase() === sha256Buffer(portalLayoutBuffer),
  "refined CRT source-build manifest does not bind the current CRT portal-layout authority",
);
check(refinedSourceBuild.creative_boundary?.modelled_from_scratch === true, "refined CRT source-build manifest does not declare scratch modelling");
check(refinedSourceBuild.creative_boundary?.procedural_materials_only === true, "refined CRT source-build manifest does not declare procedural-only materials");
check(Number(refinedSourceBuild.creative_boundary?.third_party_models) === 0, "refined CRT source-build manifest reports a third-party model");
check(Number(refinedSourceBuild.creative_boundary?.external_images) === 0, "refined CRT source-build manifest reports an external image");
check(Number(refinedSourceBuild.creative_boundary?.packed_files) === 0, "refined CRT source-build manifest reports a packed file");
check(refinedSourceBuild.creative_boundary?.private_reference_loaded === false, "refined CRT source-build manifest reports loading the private reference");
check(refinedSourceBuild.creative_boundary?.full_animatic_created === false, "refined CRT source-build manifest reports a full animatic");

const manifestJsonFiles = packageFiles.filter(
  (file) => file.relative.startsWith("manifests/") && path.extname(file.relative).toLowerCase() === ".json",
);
for (const manifestFile of manifestJsonFiles) {
  const manifest = await readJson(manifestFile.absolute, `Phase 0.4 manifest ${manifestFile.relative}`);
  const governed = collectGovernedFileRecords(manifest);
  for (const { record, location } of governed) {
    await verifyFileRecord(record, `${manifestFile.relative} ${location}`);
  }
}

const attributesFiles = git([
  "ls-files",
  "--cached",
  "--others",
  "--exclude-standard",
  "--",
  ".gitattributes",
  ":(glob)**/.gitattributes",
], { quiet: true })
  .split(/\r?\n/)
  .filter(Boolean);
for (const relative of attributesFiles) {
  const attributes = await fs.readFile(path.join(repositoryRoot, ...normalize(relative).split("/")), "utf8");
  check(!/filter=lfs|diff=lfs|merge=lfs/i.test(attributes), `Git LFS is not authorized in ${normalize(relative)}`);
}
const lfsConfigFiles = git([
  "ls-files",
  "--cached",
  "--others",
  "--exclude-standard",
  "--",
  ".lfsconfig",
  ":(glob)**/.lfsconfig",
], { quiet: true })
  .split(/\r?\n/)
  .filter(Boolean);
check(lfsConfigFiles.length === 0, `Git LFS configuration is forbidden: ${lfsConfigFiles.map(normalize).join(", ")}`);
for (let index = 0; index < packageFiles.length; index += 40) {
  const batch = packageFiles.slice(index, index + 40).map((file) => normalize(`${packageRelative}/${file.relative}`));
  const attributes = git(["check-attr", "-a", "--", ...batch], { quiet: true });
  check(!/(?:^|\n).+?:\s*(?:filter|diff|merge):\s*lfs(?:\r?$)/im.test(attributes), "Git LFS attribute applies to a Phase 0.4 package file");
}

if (!preflight) {
  const candidateCommitted = git(["rev-parse", "HEAD"], { quiet: true }) !== acceptedParent;
  if (candidateCommitted) {
    const trackedPackagePaths = new Set(
      git(["ls-files", "--cached", "--", packageRelative], { quiet: true })
        .split(/\r?\n/)
        .filter(Boolean)
        .map(normalize),
    );
    const untrackedPackagePaths = git(["ls-files", "--others", "--exclude-standard", "--", packageRelative], { quiet: true })
      .split(/\r?\n/)
      .filter(Boolean)
      .map(normalize);
    check(untrackedPackagePaths.length === 0, `committed Phase 0.4 package has ${untrackedPackagePaths.length} untracked files`);
    for (const file of packageFiles) {
      const repositoryRelative = normalize(`${packageRelative}/${file.relative}`);
      check(trackedPackagePaths.has(repositoryRelative), `committed Phase 0.4 package file is not tracked in Git: ${file.relative}`);
    }
    const unstagedPackagePaths = git(["diff", "--name-only", "--", packageRelative], { quiet: true })
      .split(/\r?\n/)
      .filter(Boolean)
      .map(normalize);
    check(unstagedPackagePaths.length === 0, `committed Phase 0.4 package has ${unstagedPackagePaths.length} unstaged changes`);
  }

  const retainedWorkFiles = packageFiles.filter((file) => file.relative.startsWith("work/") && file.relative !== "work/.gitignore");
  check(retainedWorkFiles.length === 0, `final Phase 0.4 package retains ${retainedWorkFiles.length} transient work files`);
  check(
    packageFiles.every((file) => !/(?:^|\/)(?:__pycache__|cache|temp|tmp)(?:\/|$)/i.test(file.relative)),
    "final Phase 0.4 package retains a cache or temporary directory",
  );
  const reviewPngObserved = packageFiles
    .filter((file) => !file.relative.includes("/") && path.extname(file.relative).toLowerCase() === ".png")
    .map((file) => file.relative);
  check(reviewPngObserved.length === exactReviewPngNames.size, `final Phase 0.4 review root has ${reviewPngObserved.length}/${exactReviewPngNames.size} PNGs`);
  for (const name of exactReviewPngNames) check(reviewPngObserved.includes(name), `missing exact Phase 0.4 review PNG: ${name}`);
  for (const name of reviewPngObserved) check(exactReviewPngNames.has(name), `unexpected top-level review PNG: ${name}`);

  const blendFiles = packageFiles.filter((file) => path.extname(file.relative).toLowerCase() === ".blend");
  check(blendFiles.length === 2, `final Phase 0.4 package has ${blendFiles.length}/2 editable Blender sources`);
  check(blendFiles.some((file) => file.relative === proportionSourceRelative), "final Phase 0.4 package omits the frozen proportion-gate Blender source");
  check(blendFiles.some((file) => file.relative === refinedSourceRelative), `final Phase 0.4 package omits ${refinedSourceRelative}`);
  const blendHashes = new Set();
  for (const file of blendFiles) {
    const buffer = await fs.readFile(file.absolute);
    const blenderHeader = buffer.subarray(0, 7).toString("ascii") === "BLENDER";
    const zstdHeader = buffer.length >= 4 && buffer.readUInt32LE(0) === 0xfd2fb528;
    check(blenderHeader || zstdHeader, `editable Blender source has no BLENDER or Zstandard signature: ${file.relative}`);
    check(file.bytes >= 100_000, `editable Blender source is implausibly small: ${file.relative} / ${file.bytes}`);
    blendHashes.add(sha256Buffer(buffer));
  }
  check(blendHashes.size === 2, "proportion and refined Blender sources are byte-identical");

  const requiredFinal = [
    packageInventoryRelative,
    refinedValidationRelative,
    canonicalManifestRelative,
    materialManifestRelative,
    powerStateAuthorityRelative,
    portalStateAuthorityRelative,
    keepoutManifestRelative,
    sanitizerRelative,
    staticReviewCompositionRelative,
    browserReviewCompositionRelative,
    reviewBundleRelative,
    reviewZipRelative,
  ];
  for (const relative of requiredFinal) check(await exists(path.join(packageRoot, ...relative.split("/"))), `missing final Phase 0.4 authority: ${relative}`);
  for (const relative of [browserMatrixRelative, browserEvidenceRelative, capturePlanSnapshotRelative, repositoryImpactRelative]) {
    check(await exists(path.join(repositoryRoot, ...relative.split("/"))), `missing final Phase 0.4 repository authority: ${relative}`);
  }

  const validation = await readJson(path.join(packageRoot, ...refinedValidationRelative.split("/")), "Blender source validation");
  check(
    validation.schema === "quantum-hub.phase-0-4-crt-television.blender-source-validation.v1",
    "Blender source-validation schema is not the authorized Phase 0.4 v1 schema",
  );
  for (const [label, keys] of [
    ["external libraries", ["external_libraries", "externalLibraries", "libraries"]],
    ["external images", ["external_images", "externalImages", "images"]],
    ["packed files", ["packed_files", "packedFiles", "packed"]],
    ["external file paths", ["external_paths", "external_file_paths", "externalFilePaths"]],
    ["missing files", ["missing_files", "missingFiles", "missing"]],
    ["image texture nodes", ["image_texture_nodes", "imageTextureNodes"]],
  ]) {
    const count = sourceValidationCount(validation, keys);
    check(Number.isFinite(count), `Blender source validation does not expose a numeric ${label} count`);
    check(count === 0, `Blender source validation reports ${count} ${label}`);
  }
  const validationStatus = String(validation?.status ?? validation?.result ?? validation?.summary?.status ?? "").toUpperCase();
  check(validationStatus === "PASS", "Blender source validation is not PASS");
  check(validation.selected_option === "A", "Blender source validation does not bind selected CRT Variant A");
  check(validation.modelled_from_scratch === true, "Blender source validation does not attest scratch modelling");
  check(validation.private_photo_loaded === false, "Blender source validation reports the private CRT photograph loaded");
  check(validation.full_animatic_created === false, "Blender source validation reports a full animatic");
  check(validation.manufacturer_branding === false, "Blender source validation reports manufacturer branding");
  check(Number(validation.third_party_models) === 0, "Blender source validation reports third-party models");
  check(validation.physical_rear_cable_connection_committed === true, "Blender source validation does not prove the rear cable connection");
  check(Number(validation.desktop_spiral_turns) === 2.5, "Blender source validation does not bind the 2.5-turn desktop cable");
  check(Number(validation.mobile_spiral_turns) === 2.25, "Blender source validation does not bind the 2.25-turn mobile cable");
  check(validation.mobile_composition_authored_separately === true, "Blender source validation does not prove separately authored mobile geometry");
  check(String(validation.visible_screen?.aspect ?? "") === "4:3", "Blender source validation does not bind a 4:3 visible CRT screen");
  check(Number(validation.visible_screen?.aspect_numeric) === 1.333333333, "Blender source validation has the wrong visible-screen aspect ratio");
  check(Number(validation.assembled_overall_dimensions_m?.width) >= 0.78 && Number(validation.assembled_overall_dimensions_m?.width) <= 0.95, "validated CRT width is outside the authorized range");
  check(Number(validation.assembled_overall_dimensions_m?.height) >= 0.62 && Number(validation.assembled_overall_dimensions_m?.height) <= 0.78, "validated CRT height is outside the authorized range");
  check(Number(validation.assembled_overall_dimensions_m?.depth) >= 0.65 && Number(validation.assembled_overall_dimensions_m?.depth) <= 0.85, "validated CRT depth is outside the authorized range");
  check(Number(validation.camera_arc_degrees) >= 20 && Number(validation.camera_arc_degrees) <= 30, "validated CRT camera arc is outside 20–30 degrees");
  check(String(validation.portal_layout_sha256 ?? "").toLowerCase() === sha256Buffer(portalLayoutBuffer), "Blender source validation does not bind the current portal-layout SHA-256");
  check(Array.isArray(validation.checks) && validation.checks.length === exactRefinedValidationCheckIds.length, `Blender source validation has ${validation.checks?.length ?? 0}/${exactRefinedValidationCheckIds.length} exact checks`);
  check(arrayMatches((validation.checks ?? []).map((item) => item.id), exactRefinedValidationCheckIds), "Blender source validation check IDs/order changed");
  for (const item of validation.checks ?? []) {
    const itemPasses = item.pass === true || String(item.status ?? "").toUpperCase() === "PASS";
    check(itemPasses, `Blender source validation check is not PASS: ${item.id ?? item.name ?? "unnamed"}`);
  }
  check(Array.isArray(validation.failed_checks) && validation.failed_checks.length === 0, "Blender source validation reports failed checks");
  await verifyFileRecord(validation.validator ?? {}, "refined CRT Blender validator", "source/validate_refined_crt_source.py");
  const refinedSource = await verifyFileRecord(
    validation.source ?? {},
    "refined CRT Blender source validation",
    refinedSourceRelative,
  );
  if (refinedSource) {
    check(path.extname(refinedSource.relative).toLowerCase() === ".blend", "refined CRT source validation does not bind a .blend file");
    check(refinedSource.relative !== proportionSourceRelative, "refined CRT source validation incorrectly binds the low-cost proportion source");
    check(blendFiles.some((file) => file.relative === refinedSource.relative), "refined CRT source validation points outside the exact two Blender sources");
  }

  const materialManifest = await readJson(
    path.join(packageRoot, ...materialManifestRelative.split("/")),
    "CRT material and asset manifest",
  );
  check(
    materialManifest.schema === "quantum-hub.phase-0-4-crt-television.material-and-asset.v1",
    "CRT material-and-asset schema is not the authorized Phase 0.4 v1 schema",
  );
  check(String(materialManifest.status ?? "").toUpperCase() === "PASS", "CRT material-and-asset manifest is not PASS");
  check(materialManifest.selected_option === "A", "CRT material-and-asset manifest does not bind selected Variant A");
  check(materialManifest.procedural_only === true, "CRT material-and-asset manifest does not attest procedural-only materials");
  check(Number(materialManifest.external_texture_count) === 0, "CRT material-and-asset manifest reports external textures");
  check(Number(materialManifest.external_model_count) === 0, "CRT material-and-asset manifest reports external models");
  await verifyFileRecord(materialManifest.source ?? {}, "CRT material manifest refined source", refinedSourceRelative);
  await verifyFileRecord(materialManifest.builder ?? {}, "CRT material manifest builder", "source/build_refined_crt.py");
  await verifyFileRecord(materialManifest.renderer ?? {}, "CRT material manifest renderer", "source/render_crt_canonical_stills.py");
  await verifyFileRecord(materialManifest.validator ?? {}, "CRT material manifest validator", "source/validate_refined_crt_source.py");
  const materialRecords = Array.isArray(materialManifest.materials) ? materialManifest.materials : [];
  check(Number(materialManifest.material_count) === requiredRefinedMaterialRoles.size, "CRT material manifest material_count is not the governed 20 semantic roles");
  check(materialRecords.length === requiredRefinedMaterialRoles.size, `CRT material manifest has ${materialRecords.length}/${requiredRefinedMaterialRoles.size} semantic-role records`);
  const observedMaterialRoles = new Set();
  for (const record of materialRecords) {
    const name = String(record.name ?? "");
    const role = String(record.role ?? "");
    check(role.length > 0 && !observedMaterialRoles.has(role), `CRT material manifest has missing or duplicate material role: ${role || "missing"}`);
    observedMaterialRoles.add(role);
    check(requiredRefinedMaterialRoles.get(role) === name, `CRT material decision changed for ${role || "unnamed"}: ${name || "missing"}`);
    check(record.procedural === true, `CRT material is not declared procedural: ${name || "unnamed"}`);
    check(record.node_based === true, `CRT material is not node-based: ${name || "unnamed"}`);
    check(Number(record.external_texture_count ?? 0) === 0, `CRT material reports an external texture: ${name || "unnamed"}`);
    check(Number(record.image_texture_nodes ?? 0) === 0, `CRT material reports an image-texture node: ${name || "unnamed"}`);
    check(Number.isInteger(Number(record.assigned_object_count)) && Number(record.assigned_object_count) >= 0, `CRT material assignment count is invalid: ${name || "unnamed"}`);
    check(Array.isArray(record.assigned_objects) && record.assigned_objects.length === Number(record.assigned_object_count), `CRT material assignment list/count mismatch: ${role || "unnamed"}`);
  }
  for (const role of requiredRefinedMaterialRoles.keys()) check(observedMaterialRoles.has(role), `CRT material manifest omits ${role}`);

  const canonicalRender = await readJson(
    path.join(packageRoot, ...canonicalManifestRelative.split("/")),
    "CRT canonical render manifest",
  );
  check(
    canonicalRender.schema === "quantum-hub.phase-0-4-crt-television.canonical-still-render-inventory.v1",
    "CRT canonical render schema is not the authorized v1 schema",
  );
  check(String(canonicalRender.status ?? "").toUpperCase() === "PASS", "CRT canonical render manifest is not PASS");
  await verifyFileRecord(canonicalRender.source ?? {}, "CRT canonical render source", refinedSourceRelative);
  await verifyFileRecord(canonicalRender.generator ?? {}, "CRT canonical render generator", "source/render_crt_canonical_stills.py");
  check(Array.isArray(canonicalRender.configuration_authority) && canonicalRender.configuration_authority.length === 2, "CRT canonical render manifest does not bind exactly two configuration authorities");
  await verifyFileRecord(canonicalRender.configuration_authority?.[0] ?? {}, "CRT canonical configuration authority", "source/crt_canonical_config.py");
  await verifyFileRecord(canonicalRender.configuration_authority?.[1] ?? {}, "CRT refined configuration authority", "source/crt_refined_config.py");
  await verifyFileRecord(canonicalRender.layout_authority ?? {}, "CRT canonical render layout authority", "crt-portal-layout.json");
  check(canonicalRender.layout_authority?.consumed_directly === true, "CRT canonical renderer does not consume the portal authority directly");
  check(canonicalRender.render_settings?.engine === "BLENDER_EEVEE", "CRT canonical render engine is not the governed Eevee pipeline");
  check(Number(canonicalRender.render_settings?.samples) === 128, "CRT canonical render sample count is not 128");
  check(String(canonicalRender.render_settings?.color_management ?? "").startsWith("AgX"), "CRT canonical render manifest does not bind AgX");
  check(canonicalRender.render_settings?.denoising === false, "CRT canonical render manifest does not bind denoising off");
  check(canonicalRender.render_settings?.image_format === "PNG RGB 8-bit", "CRT canonical render manifest changes the still image format");
  check(canonicalRender.full_animatic_created === false, "CRT canonical render manifest reports a full animatic");
  const canonicalRecords = recordsFrom(canonicalRender);
  check(Number(canonicalRender.render_count) === 45 && canonicalRecords.length === 45, `CRT canonical render inventory has ${canonicalRecords.length}/45 records`);
  const canonicalIds = new Set();
  const canonicalPaths = new Set();
  const canonicalByPath = new Map();
  const observedCanonicalGroupCounts = new Map();
  for (const [index, record] of canonicalRecords.entries()) {
    const id = String(record.id ?? "");
    const relative = recordPath(record);
    check(id.length > 0 && !canonicalIds.has(id), `CRT canonical render has missing or duplicate id: ${id || "missing"}`);
    check(relative.length > 0 && !canonicalPaths.has(relative), `CRT canonical render has missing or duplicate path: ${relative || "missing"}`);
    canonicalIds.add(id);
    canonicalPaths.add(relative);
    canonicalByPath.set(relative, record);
    observedCanonicalGroupCounts.set(record.group, (observedCanonicalGroupCounts.get(record.group) ?? 0) + 1);
    check(Number(record.order) === index + 1, `CRT canonical render order mismatch: ${id}`);
    check(String(record.classification ?? "").length > 0, `CRT canonical render classification missing: ${id}`);
    check(String(record.approval_state ?? "").length > 0, `CRT canonical render approval state missing: ${id}`);
    check(record.render_settings?.engine === "BLENDER_EEVEE", `CRT canonical record changes engine: ${id}`);
    check(Number(record.render_settings?.samples) === 128, `CRT canonical record changes sample count: ${id}`);
    check(record.render_settings?.denoising === false, `CRT canonical record changes denoising: ${id}`);
    check(record.render_settings?.color_management === canonicalRender.render_settings?.color_management, `CRT canonical record changes colour management: ${id}`);
    check(arrayMatches(record.render_settings?.resolution, [Number(record.width), Number(record.height)]), `CRT canonical record resolution lineage mismatch: ${id}`);
    check(record.lineage?.parent === canonicalRender.schema, `CRT canonical record parent schema mismatch: ${id}`);
    check(record.lineage?.refined_source_sha256 === recordSha(canonicalRender.source), `CRT canonical record source lineage mismatch: ${id}`);
    check(record.lineage?.render_generator_sha256 === recordSha(canonicalRender.generator), `CRT canonical record renderer lineage mismatch: ${id}`);
    check(record.lineage?.canonical_config_sha256 === recordSha(canonicalRender.configuration_authority?.[0]), `CRT canonical record canonical-config lineage mismatch: ${id}`);
    check(record.lineage?.refined_config_sha256 === recordSha(canonicalRender.configuration_authority?.[1]), `CRT canonical record refined-config lineage mismatch: ${id}`);
    check(record.lineage?.layout_authority_sha256 === recordSha(canonicalRender.layout_authority), `CRT canonical record layout lineage mismatch: ${id}`);
    await verifyFileRecord(record, `CRT canonical render ${id}`, relative, {
      width: Number(record.width),
      height: Number(record.height),
    });
  }
  check(observedCanonicalGroupCounts.size === exactCanonicalGroupCounts.size, "CRT canonical render group roster changed");
  for (const [group, expectedCount] of exactCanonicalGroupCounts) {
    check(observedCanonicalGroupCounts.get(group) === expectedCount, `CRT canonical group ${group} has ${observedCanonicalGroupCounts.get(group) ?? 0}/${expectedCount} records`);
  }
  check(arrayMatches(canonicalRecords.filter((record) => record.group === "sources").map((record) => record.id), exactSourceRoleIds), "CRT canonical six-source order changed");

  const keepoutManifest = await readJson(
    path.join(packageRoot, ...keepoutManifestRelative.split("/")),
    "CRT scene-source keepout authority",
  );
  check(
    keepoutManifest.schema === "quantum-hub.phase-0-4-crt-television.scene-source-keepouts.v1",
    "CRT scene-source keepout schema changed",
  );
  check(keepoutManifest.status === "frozen" && keepoutManifest.sourceStatus === "accepted", "CRT scene-source keepout authority is not frozen/accepted");
  await verifyFileRecord(keepoutManifest.source ?? {}, "CRT keepout refined source", refinedSourceRelative);
  await verifyFileRecord(keepoutManifest.generator ?? {}, "CRT keepout generator", "source/generate_crt_scene_source_keepouts.py");
  await verifyFileRecord(keepoutManifest.layoutAuthority ?? {}, "CRT keepout layout authority", "crt-portal-layout.json");
  check(arrayMatches(keepoutManifest.requiredGeometry, ["crt-cabinet", "crt-screen", "spiral-cable"]), "CRT keepout required geometry changed");
  check(arrayMatches(keepoutManifest.sourceRoles, exactSourceRoleIds), "CRT keepout six-source role order changed");
  const keepoutRecords = keepoutManifest.records && typeof keepoutManifest.records === "object" ? keepoutManifest.records : {};
  check(Number(keepoutManifest.recordCount) === 6 && Object.keys(keepoutRecords).length === 6, `CRT keepout authority has ${Object.keys(keepoutRecords).length}/6 records`);
  check(arrayMatches(Object.keys(keepoutRecords), exactSourceRoleIds), "CRT keepout record key order/identity changed");
  for (const id of exactSourceRoleIds) {
    const record = keepoutRecords[id] ?? {};
    check(record.sourceRole === id && record.source?.id === id && record.source?.role === id, `CRT keepout role identity mismatch: ${id}`);
    check(record.status === "accepted", `CRT keepout record is not accepted: ${id}`);
    const expectedCableVariant = id.includes("mobile") ? "mobile" : "desktop";
    check(record.cableVariant === expectedCableVariant, `CRT keepout cable variant mismatch: ${id}`);
    const expectedSourcePath = `renders/refined/sources/${id}.png`;
    await verifyFileRecord(record.source ?? {}, `CRT keepout source ${id}`, expectedSourcePath, {
      width: Number(record.source?.width),
      height: Number(record.source?.height),
    });
    const canonicalSource = canonicalRecords.find((candidate) => candidate.id === id && candidate.group === "sources");
    check(Boolean(canonicalSource) && sameFileRecord(record.source, canonicalSource), `CRT keepout/canonical source lineage mismatch: ${id}`);
    await verifyFileRecord(record.layoutAuthority ?? {}, `CRT keepout per-source layout ${id}`, "crt-portal-layout.json");
    check(arrayMatches(Object.keys(record.geometry ?? {}), ["crt-cabinet", "crt-screen", "spiral-cable"]), `CRT keepout geometry roster changed: ${id}`);
    const hiddenTakeoverGeometry = id === "source-text-free-portal-takeover";
    if (hiddenTakeoverGeometry) {
      check(
        recordSha(record.source) === "2d11b4c7809fe943ffe90268c752ac2de37bdc9f2ebf8418e810de40b2a1bae4",
        "CRT hidden takeover keepout does not bind the frozen text-free source SHA-256",
      );
    }
    for (const geometryId of ["crt-cabinet", "crt-screen", "spiral-cable"]) {
      const geometry = record.geometry?.[geometryId] ?? {};
      check(Array.isArray(geometry.sourceObjectLineage) && geometry.sourceObjectLineage.length > 0, `CRT keepout object lineage missing: ${id}/${geometryId}`);
      check(Number(geometry.paddingPx) >= 0, `CRT keepout padding is invalid: ${id}/${geometryId}`);
      if (hiddenTakeoverGeometry) {
        check(geometry.visible === false, `CRT out-of-frame takeover geometry is not explicitly hidden: ${geometryId}`);
        check(geometry.visibility === "out-of-frame/no-visible-geometry", `CRT out-of-frame takeover visibility reason changed: ${geometryId}`);
        check(geometry.pixelBounds === null && geometry.paddedBoundsPx === null, `CRT hidden takeover geometry exposes fabricated bounds: ${geometryId}`);
        check(Array.isArray(geometry.normalizedPolygons) && geometry.normalizedPolygons.length === 0, `CRT hidden takeover geometry exposes fabricated polygons: ${geometryId}`);
        check(Number(geometry.visiblePointCount ?? 0) === 0, `CRT hidden takeover geometry reports visible points: ${geometryId}`);
        check(Number(geometry.projectedPointCount) === 0, `CRT hidden takeover geometry reports projected points: ${geometryId}`);
        if (geometryId === "spiral-cable") {
          check(Array.isArray(geometry.normalizedSegmentRectangles) && geometry.normalizedSegmentRectangles.length === 0, "CRT hidden takeover cable exposes fabricated segment rectangles");
        }
        continue;
      }
      check(geometry.visible === true, `CRT visible keepout geometry is not explicitly marked visible: ${id}/${geometryId}`);
      check(Number(geometry.pixelBounds?.width) > 0 && Number(geometry.pixelBounds?.height) > 0, `CRT keepout pixel bounds are invalid: ${id}/${geometryId}`);
      check(Number(geometry.paddedBoundsPx?.width) > 0 && Number(geometry.paddedBoundsPx?.height) > 0, `CRT keepout padded bounds are invalid: ${id}/${geometryId}`);
      check(Array.isArray(geometry.normalizedPolygons) && geometry.normalizedPolygons.length > 0, `CRT keepout polygons are missing: ${id}/${geometryId}`);
      check(Number(geometry.projectedPointCount) > 0, `CRT keepout projected point count is invalid: ${id}/${geometryId}`);
      for (const polygon of geometry.normalizedPolygons ?? []) {
        check(Array.isArray(polygon) && polygon.length >= 3, `CRT keepout polygon is degenerate: ${id}/${geometryId}`);
        for (const point of polygon ?? []) {
          check(Number.isFinite(Number(point.x)) && Number(point.x) >= 0 && Number(point.x) <= 1, `CRT keepout polygon x is outside 0–1: ${id}/${geometryId}`);
          check(Number.isFinite(Number(point.y)) && Number(point.y) >= 0 && Number(point.y) <= 1, `CRT keepout polygon y is outside 0–1: ${id}/${geometryId}`);
        }
      }
      if (geometryId === "spiral-cable") {
        check(Array.isArray(geometry.normalizedSegmentRectangles) && geometry.normalizedSegmentRectangles.length > 0, `CRT cable keepout lacks segmented rectangles: ${id}`);
      }
    }
  }
  const cameraPath = canonicalRender.camera_path ?? {};
  const cameraArc = Number(cameraPath.arrival_to_near_frontal_power_arc_degrees);
  check(cameraPath.status === "PASS" && cameraArc >= 20 && cameraArc <= 30, "CRT canonical camera arc is outside 20–30 degrees");
  check(canonicalRender.mobile_authority?.authored_separately === true, "CRT canonical mobile scene is not authored separately");
  check(Number(canonicalRender.mobile_authority?.spiral_turns) === 2.25, "CRT canonical mobile scene is not a 2.25-turn spiral");
  const powerAuthority = canonicalRender.power_on_authority ?? {};
  check(Number(powerAuthority.count) === 7, "CRT power-on authority does not bind seven states");
  check(arrayMatches(powerAuthority.exact_ids, exactPowerStateIds), "CRT power-on authority IDs/order changed");
  check(String(powerAuthority.status ?? "").toUpperCase() === "PASS", "CRT power-on authority is not PASS");
  check(Array.isArray(powerAuthority.records) && powerAuthority.records.length === 7, "CRT power-on authority does not contain seven records");
  check(arrayMatches((powerAuthority.records ?? []).map((record) => record.id), exactPowerStateIds), "CRT power-on state record order changed");
  const portalAuthority = canonicalRender.portal_transition_authority ?? {};
  check(Number(portalAuthority.count) === 8, "CRT portal authority does not bind eight states");
  check(arrayMatches(portalAuthority.exact_ids, exactPortalStateIds), "CRT portal authority IDs/order changed");
  check(Array.isArray(portalAuthority.records) && portalAuthority.records.length === 8, "CRT portal authority does not contain eight records");
  check(arrayMatches((portalAuthority.records ?? []).map((record) => record.id), exactPortalStateIds), "CRT portal state record order changed");
  check(Number(portalAuthority.physical_state_count) === 6 && Number(portalAuthority.browser_state_count) === 2, "CRT portal ownership split is not six physical plus two semantic states");
  check(String(portalAuthority.status ?? "").toUpperCase() === "PASS", "CRT canonical eight-state portal authority is not final PASS");

  const powerStateAuthority = await readJson(
    path.join(packageRoot, ...powerStateAuthorityRelative.split("/")),
    "CRT power-on state authority",
  );
  check(
    powerStateAuthority.schema === "quantum-hub.phase-0-4-crt-television.power-on-state-authority.v1",
    "CRT power-on state authority schema changed",
  );
  check(String(powerStateAuthority.status ?? "").toUpperCase() === "FROZEN", "CRT power-on state authority is not FROZEN");
  check(Number(powerStateAuthority.count) === 7, "CRT power-on state authority does not bind seven states");
  check(arrayMatches(powerStateAuthority.exact_ids, exactPowerStateIds), "CRT external power-on state IDs/order changed");
  check(powerStateAuthority.full_animatic_created === false, "CRT power-on state authority reports a full animatic");
  await verifyFileRecord(powerStateAuthority.canonical_inventory ?? {}, "CRT power authority canonical inventory", canonicalManifestRelative);
  await verifyFileRecord(powerStateAuthority.source ?? {}, "CRT power authority refined source", refinedSourceRelative);
  await verifyFileRecord(powerStateAuthority.generator ?? {}, "CRT power authority render generator", "source/render_crt_canonical_stills.py");
  await verifyFileRecord(powerStateAuthority.layout_authority ?? {}, "CRT power authority layout", "crt-portal-layout.json");
  check(JSON.stringify(powerStateAuthority.render_settings) === JSON.stringify(canonicalRender.render_settings), "CRT power authority render settings differ from canonical settings");
  check(JSON.stringify(powerStateAuthority.records) === JSON.stringify(powerAuthority.records), "CRT external and canonical seven-state power records differ");

  const portalStateAuthority = await readJson(
    path.join(packageRoot, ...portalStateAuthorityRelative.split("/")),
    "CRT portal transition state authority",
  );
  check(
    portalStateAuthority.schema === "quantum-hub.phase-0-4-crt-television.portal-transition-state-authority.v1",
    "CRT portal transition state authority schema changed",
  );
  check(String(portalStateAuthority.status ?? "").toUpperCase() === "PASS", "CRT external eight-state portal authority is not final PASS");
  check(Number(portalStateAuthority.count) === 8, "CRT portal state authority does not bind eight states");
  check(Number(portalStateAuthority.physical_state_count) === 6 && Number(portalStateAuthority.browser_state_count) === 2, "CRT external portal ownership split is not six physical plus two semantic states");
  check(arrayMatches(portalStateAuthority.exact_ids, exactPortalStateIds), "CRT external portal state IDs/order changed");
  check(portalStateAuthority.full_animatic_created === false, "CRT portal state authority reports a full animatic");
  await verifyFileRecord(portalStateAuthority.canonical_inventory ?? {}, "CRT portal authority canonical inventory", canonicalManifestRelative);
  await verifyFileRecord(portalStateAuthority.source ?? {}, "CRT portal authority refined source", refinedSourceRelative);
  await verifyFileRecord(portalStateAuthority.generator ?? {}, "CRT portal authority render generator", "source/render_crt_canonical_stills.py");
  await verifyFileRecord(portalStateAuthority.layout_authority ?? {}, "CRT portal authority layout", "crt-portal-layout.json");
  check(JSON.stringify(portalStateAuthority.render_settings) === JSON.stringify(canonicalRender.render_settings), "CRT portal authority render settings differ from canonical settings");
  check(JSON.stringify(portalStateAuthority.records) === JSON.stringify(portalAuthority.records), "CRT external and canonical eight-state portal records differ");
  for (const [index, record] of (portalAuthority.records ?? []).entries()) {
    check(record.id === exactPortalStateIds[index] && Number(record.order) === index + 1, `CRT portal state identity/order mismatch at ${index + 1}`);
    if (index < 6) {
      check(record.owner === "Blender physical CRT" && record.status === "FROZEN", `CRT physical portal state is not frozen: ${record.id}`);
      const canonicalRecord = canonicalByPath.get(recordPath(record.render));
      check(Boolean(canonicalRecord) && JSON.stringify(canonicalRecord) === JSON.stringify(record.render), `CRT physical portal state differs from canonical render: ${record.id}`);
    } else {
      check(record.owner === "repository browser semantic DOM" && record.status === "PASS", `CRT semantic portal state is not browser-owned PASS: ${record.id}`);
      check(record.case_id === "portal-actual--desktop-1440x900", `CRT semantic portal state uses the wrong browser case: ${record.id}`);
      check(record.source_id === "source-text-free-portal-takeover", `CRT semantic portal state uses the wrong source: ${record.id}`);
      check(/^[a-f0-9]{64}$/i.test(String(record.source_sha256 ?? "")), `CRT semantic portal state omits source SHA-256: ${record.id}`);
      check(/^[a-f0-9]{64}$/i.test(String(record.matrix_sha256 ?? "")), `CRT semantic portal state omits matrix SHA-256: ${record.id}`);
      check(Boolean(record.capture), `CRT semantic portal state omits browser capture: ${record.id}`);
    }
  }

  const staticReviewComposition = await readJson(
    path.join(packageRoot, ...staticReviewCompositionRelative.split("/")),
    "CRT static review composition authority",
  );
  check(
    staticReviewComposition.schema === "quantum-hub.phase-0-4-crt-television.review-composition.v1",
    "CRT static review composition schema changed",
  );
  check(
    staticReviewComposition.status === "CREATIVE_SHEETS_2_TO_9_COMPLETE_BROWSER_SHEETS_PENDING",
    "CRT static review composition does not preserve its scoped sheets 2–9 completion status",
  );
  await verifyFileRecord(staticReviewComposition.composer ?? {}, "CRT static review composer", "source/compose_crt_canonical_review_sheets.py");
  await verifyFileRecord(staticReviewComposition.refined_source ?? {}, "CRT static review refined source", refinedSourceRelative);
  await verifyFileRecord(staticReviewComposition.canonical_render_authority ?? {}, "CRT static review canonical authority", canonicalManifestRelative);
  await verifyFileRecord(staticReviewComposition.power_state_authority ?? {}, "CRT static review power authority", powerStateAuthorityRelative);
  await verifyFileRecord(staticReviewComposition.layout_authority ?? {}, "CRT static review layout authority", "crt-portal-layout.json");
  check(arrayMatches(staticReviewComposition.review_indices_complete, exactStaticReviewSheets.map(([index]) => index)), "CRT static review completed-index roster changed");
  check(arrayMatches(staticReviewComposition.review_indices_pending_browser, [10, 11, 12, 13, 14, 15, 16]), "CRT static review pending browser-index roster changed");
  const staticSheets = Array.isArray(staticReviewComposition.sheets) ? staticReviewComposition.sheets : [];
  check(Number(staticReviewComposition.sheet_count) === 8 && staticSheets.length === 8, `CRT static review composition has ${staticSheets.length}/8 sheets`);
  for (const [offset, [reviewIndex, filename]] of exactStaticReviewSheets.entries()) {
    const record = staticSheets[offset] ?? {};
    check(Number(record.review_index) === reviewIndex, `CRT static review index changed for ${filename}`);
    await verifyFileRecord(record, `CRT static review sheet ${reviewIndex}`, filename, {
      width: Number(record.width),
      height: Number(record.height),
    });
    check(record.intendedCommit === true, `CRT static review sheet is not intended for commit: ${filename}`);
    check(String(record.classification ?? "").length > 0, `CRT static review sheet classification missing: ${filename}`);
    check(String(record.approval_state ?? "").length > 0, `CRT static review sheet approval state missing: ${filename}`);
    const sources = Array.isArray(record.source_renders) ? record.source_renders : [];
    check(sources.length > 0, `CRT static review sheet has no source-render lineage: ${filename}`);
    for (const source of sources) {
      const canonicalRecord = canonicalByPath.get(recordPath(source));
      check(Boolean(canonicalRecord), `CRT static review sheet points outside canonical renders: ${filename} -> ${recordPath(source)}`);
      check(Boolean(canonicalRecord) && sameFileRecord(source, canonicalRecord), `CRT static review source lineage mismatch: ${filename} -> ${recordPath(source)}`);
      await verifyFileRecord(source, `CRT static review source ${filename}`, recordPath(source), {
        width: Number(source.width),
        height: Number(source.height),
      });
    }
  }
  check(staticReviewComposition.creative_boundary?.private_reference_included === false, "CRT static review composition includes the private reference");
  check(Number(staticReviewComposition.creative_boundary?.third_party_models) === 0, "CRT static review composition reports third-party models");
  check(Number(staticReviewComposition.creative_boundary?.external_textures) === 0, "CRT static review composition reports external textures");
  check(staticReviewComposition.creative_boundary?.full_animatic_created === false, "CRT static review composition reports a full animatic");
  check(staticReviewComposition.creative_boundary?.production_media_created === false, "CRT static review composition reports production media");

  const capturePlanAbsolute = path.join(repositoryRoot, ...capturePlanRelative.split("/"));
  const capturePlanBuffer = await fs.readFile(capturePlanAbsolute);
  const capturePlan = await readJson(capturePlanAbsolute, "Phase 0.4 complete capture plan");
  const capturePlanSnapshotAbsolute = path.join(repositoryRoot, ...capturePlanSnapshotRelative.split("/"));
  const capturePlanSnapshotBuffer = await fs.readFile(capturePlanSnapshotAbsolute);
  const capturePlanSnapshot = await readJson(capturePlanSnapshotAbsolute, "Phase 0.4 ready-plan snapshot");
  const browserMatrixAbsolute = path.join(repositoryRoot, ...browserMatrixRelative.split("/"));
  const browserMatrixBuffer = await fs.readFile(browserMatrixAbsolute);
  const browserMatrix = await readJson(browserMatrixAbsolute, "Phase 0.4 browser matrix");
  const browserMatrixSha = sha256Buffer(browserMatrixBuffer);

  check(capturePlan.schema === capturePlanSchema, "Phase 0.4 complete capture-plan schema changed");
  check(capturePlanSnapshot.schema === capturePlanSchema, "Phase 0.4 ready-plan snapshot schema changed");
  check(capturePlan.sceneFreeze?.status === "frozen" && capturePlan.sceneFreeze?.captureAllowed === true, "Phase 0.4 complete plan does not preserve the frozen capture release");
  check(capturePlan.sceneFreeze?.matrixStatus === "complete", "Phase 0.4 capture plan is not complete");
  check(capturePlanSnapshot.sceneFreeze?.matrixStatus === "ready-for-capture", "Phase 0.4 snapshot is not the ready-for-capture authority");
  check(capturePlanSnapshot.sceneFreeze?.status === "frozen" && capturePlanSnapshot.sceneFreeze?.captureAllowed === true, "Phase 0.4 ready-plan snapshot does not preserve the frozen release");
  const postBezelPolicy = capturePlan.sceneFreeze?.keepoutApplicability?.postBezelSemanticTakeover ?? {};
  check(
    postBezelPolicy.sourceId === "source-text-free-portal-takeover" &&
      postBezelPolicy.sourceSha256 === "2d11b4c7809fe943ffe90268c752ac2de37bdc9f2ebf8418e810de40b2a1bae4" &&
      postBezelPolicy.collisionRequired === false &&
      arrayMatches(postBezelPolicy.geometryIds, ["crt-cabinet", "crt-screen", "spiral-cable"]),
    "Phase 0.4 complete plan does not bind the exact post-bezel hidden-geometry exception",
  );
  check(
    JSON.stringify(capturePlanSnapshot.sceneFreeze?.keepoutApplicability?.postBezelSemanticTakeover) === JSON.stringify(postBezelPolicy),
    "Phase 0.4 ready-plan snapshot and complete plan differ on post-bezel geometry applicability",
  );
  check(browserMatrix.schema === browserMatrixSchema, "Phase 0.4 browser-matrix schema changed");
  check(browserMatrix.plan?.path === capturePlanRelative, "Phase 0.4 browser matrix changed its original plan path");
  check(Number(browserMatrix.plan?.bytes) === capturePlanSnapshotBuffer.length, "Phase 0.4 browser matrix does not bind ready-plan snapshot bytes");
  check(recordSha(browserMatrix.plan) === sha256Buffer(capturePlanSnapshotBuffer), "Phase 0.4 browser matrix does not bind the ready-plan snapshot SHA-256");
  check(
    capturePlan.captureAuthoritySnapshot?.path === capturePlanSnapshotRelative &&
      capturePlan.captureAuthoritySnapshot?.originalAuthorityPath === capturePlanRelative &&
      capturePlan.captureAuthoritySnapshot?.schema === capturePlanSchema &&
      Number(capturePlan.captureAuthoritySnapshot?.bytes) === capturePlanSnapshotBuffer.length &&
      recordSha(capturePlan.captureAuthoritySnapshot) === sha256Buffer(capturePlanSnapshotBuffer),
    "Phase 0.4 complete plan does not bind the exact ready-plan snapshot",
  );
  check(
    browserMatrix.contract?.path === capturePlan.contractAuthority?.path &&
      Number(browserMatrix.contract?.bytes) === Number(capturePlan.contractAuthority?.bytes) &&
      recordSha(browserMatrix.contract) === recordSha(capturePlan.contractAuthority),
    "Phase 0.4 browser matrix contract authority differs from the complete plan",
  );
  check(
    browserMatrix.keepout?.path === capturePlan.sceneFreeze?.keepoutAuthority?.path &&
      Number(browserMatrix.keepout?.bytes) === Number(capturePlan.sceneFreeze?.keepoutAuthority?.bytes) &&
      recordSha(browserMatrix.keepout) === recordSha(capturePlan.sceneFreeze?.keepoutAuthority),
    "Phase 0.4 browser matrix keepout authority differs from the complete plan",
  );
  await verifyRepositoryFileRecord(browserMatrix.contract ?? {}, "Phase 0.4 browser matrix contract", "artifacts/original/phase-0-4-crt-television/crt-portal-layout.json");
  await verifyRepositoryFileRecord(browserMatrix.keepout ?? {}, "Phase 0.4 browser matrix keepout", `${packageRelative}/${keepoutManifestRelative}`);

  const matrixSources = Array.isArray(browserMatrix.sceneSources) ? browserMatrix.sceneSources : [];
  const planSources = Array.isArray(capturePlan.sceneFreeze?.sources) ? capturePlan.sceneFreeze.sources : [];
  check(arrayMatches(matrixSources.map((record) => record.id), exactSourceRoleIds), "Phase 0.4 browser matrix source order changed");
  check(
    matrixSources.length === planSources.length &&
      matrixSources.every((record, index) => {
        const planned = planSources[index] ?? {};
        return (
          record.id === planned.id &&
          record.role === planned.role &&
          repositoryRecordPath(record) === repositoryRecordPath(planned) &&
          Number(record.width) === Number(planned.width) &&
          Number(record.height) === Number(planned.height) &&
          numberFrom(record, ["bytes"]) === numberFrom(planned, ["bytes"]) &&
          recordSha(record) === recordSha(planned)
        );
      }),
    "Phase 0.4 browser matrix source records differ from the complete plan",
  );
  for (const source of matrixSources) {
    check(source.role === source.id, `Phase 0.4 browser source role/ID mismatch: ${source.id ?? "missing"}`);
    await verifyRepositoryFileRecord(source, `Phase 0.4 browser source ${source.id}`, source.path, {
      width: Number(source.width),
      height: Number(source.height),
    });
  }

  const matrixCases = Array.isArray(browserMatrix.cases) ? browserMatrix.cases : [];
  const matrixCaseById = new Map(matrixCases.map((record) => [record.id, record]));
  check(matrixCases.length === 46 && matrixCaseById.size === 46, `Phase 0.4 browser matrix has ${matrixCases.length}/46 unique cases`);
  const capturedMatrixCases = matrixCases.filter((record) => record.capture?.path && record.capture?.sha256);
  check(capturedMatrixCases.length === 36, `Phase 0.4 browser matrix has ${capturedMatrixCases.length}/36 normalized captures`);
  const governedEvidenceImagePaths = new Set();
  for (const record of matrixCases) {
    check(record.runner?.pass === true && record.report?.pass === true, `Phase 0.4 browser case is not PASS: ${record.id ?? "missing"}`);
    check(record.report?.layout?.pageHorizontalOverflow === false, `Phase 0.4 browser case has page overflow: ${record.id ?? "missing"}`);
    check(record.report?.layout?.routeHorizontalOverflow === false, `Phase 0.4 browser case has route overflow: ${record.id ?? "missing"}`);
    check(record.report?.layout?.textOverflowPass === true, `Phase 0.4 browser case has text overflow: ${record.id ?? "missing"}`);
    check(record.report?.layout?.collisionPass === true, `Phase 0.4 browser case has a semantic collision: ${record.id ?? "missing"}`);
    check(record.report?.layout?.buttonPass === true, `Phase 0.4 browser case has an undersized action: ${record.id ?? "missing"}`);
    check(record.report?.layout?.dividerPass === true && record.report?.layout?.ruleSafetyPass === true, `Phase 0.4 browser case has an unsafe divider/rule: ${record.id ?? "missing"}`);
    check(record.report?.layout?.sceneSafety?.applicable === true && record.report?.layout?.sceneSafety?.pass === true, `Phase 0.4 browser case fails source-projected scene safety: ${record.id ?? "missing"}`);
    check(Number(record.report?.layout?.sceneSafety?.minimumClearanceCssPx) >= 16, `Phase 0.4 browser scene clearance is below 16 CSS px: ${record.id ?? "missing"}`);
    check(record.report?.assets?.doubledCopyPass === true, `Phase 0.4 browser case duplicates physical and semantic copy: ${record.id ?? "missing"}`);
    check(record.report?.accessibility?.focus?.pass === true && record.runner?.focusState?.pass === true, `Phase 0.4 browser focus evidence failed: ${record.id ?? "missing"}`);
    check(record.report?.portal?.physicalScreen?.pass === true && record.report?.portal?.takeover?.pass === true, `Phase 0.4 browser portal continuity failed: ${record.id ?? "missing"}`);
    check(record.report?.media?.cinematicAssetsInstantiated === false, `Phase 0.4 browser case instantiates cinematic media: ${record.id ?? "missing"}`);
    if (record.report?.state?.motion === "reduce") {
      check(record.report?.layout?.reducedMotionComposition?.pass === true, `Phase 0.4 reduced-motion composition failed: ${record.id ?? "missing"}`);
      check(record.report?.assets?.televisionPowered === false && record.report?.assets?.cableDormant === true, `Phase 0.4 reduced-motion case is not dormant: ${record.id ?? "missing"}`);
    }
    if (record.capture) {
      await verifyRepositoryFileRecord(record.capture, `Phase 0.4 normalized browser capture ${record.id}`, record.capture.path, {
        width: Number(record.capture.width),
        height: Number(record.capture.height),
      });
      governedEvidenceImagePaths.add(normalize(record.capture.path));
      check(path.extname(record.capture.path).toLowerCase() === ".png", `Phase 0.4 normalized capture is not PNG: ${record.id ?? "missing"}`);
      const rawCapture = record.capture.raw ?? {};
      await verifyRepositoryFileRecord(rawCapture, `Phase 0.4 raw browser capture ${record.id}`, rawCapture.path);
      governedEvidenceImagePaths.add(normalize(rawCapture.path));
      check(path.extname(rawCapture.path ?? "").toLowerCase() === ".jpg", `Phase 0.4 raw capture is not JPEG: ${record.id ?? "missing"}`);
    }
  }
  const evidenceRootRelative = "artifacts/evidence/phase-0-4-crt-television";
  const evidenceFiles = await walk(path.join(repositoryRoot, ...evidenceRootRelative.split("/")));
  const observedEvidenceImagePaths = new Set(
    evidenceFiles
      .filter((file) => file.relative.startsWith("captures/") && referenceBinaryExtensions.has(path.extname(file.relative).toLowerCase()))
      .map((file) => normalize(`${evidenceRootRelative}/${file.relative}`)),
  );
  check(
    setMatches(observedEvidenceImagePaths, governedEvidenceImagePaths),
    `Phase 0.4 evidence image set has ${observedEvidenceImagePaths.size}/${governedEvidenceImagePaths.size} exact matrix-governed raw/normalized captures`,
  );
  const recoveryReports = evidenceFiles.filter((file) => /^recovery\/[^/]+\/recovery-report\.json$/i.test(file.relative));
  for (const recoveryFile of recoveryReports) {
    const recovery = await readJson(recoveryFile.absolute, `Phase 0.4 browser recovery ${recoveryFile.relative}`);
    check(recovery.schema === "quantum-hub.phase-0-4-crt-television.capture-recovery.v1", `Phase 0.4 recovery schema changed: ${recoveryFile.relative}`);
    check(/historical only/.test(String(recovery.policy ?? "")) && /cannot be promoted or skipped/.test(String(recovery.policy ?? "")), `Phase 0.4 recovery lacks non-authoritative policy: ${recoveryFile.relative}`);
    const recoveryDirectory = path.posix.dirname(normalize(`${evidenceRootRelative}/${recoveryFile.relative}`));
    check(
      normalize(recovery.preservedCheckpoint).startsWith(`${recoveryDirectory}/`) && normalize(recovery.preservedCheckpoint).endsWith("/capture-checkpoint.json"),
      `Phase 0.4 recovery checkpoint path escapes its recovery directory: ${recoveryFile.relative}`,
    );
    const preservedCheckpoint = {
      path: recovery.preservedCheckpoint,
      bytes: recovery.sourceCheckpoint?.bytes,
      sha256: recovery.sourceCheckpoint?.sha256,
    };
    await verifyRepositoryFileRecord(preservedCheckpoint, `Phase 0.4 preserved recovery checkpoint ${recoveryFile.relative}`, recovery.preservedCheckpoint);
    const recoveredFiles = Array.isArray(recovery.recoveredFiles) ? recovery.recoveredFiles : [];
    const recoveredPaths = new Set();
    for (const recovered of recoveredFiles) {
      const preservedCopy = normalize(recovered.preservedCopy);
      check(["case-report", "raw-jpeg", "matrix"].includes(recovered.kind), `Phase 0.4 recovery has unexpected member kind: ${recovered.kind ?? "missing"}`);
      check(recovered.byteIdentical === true, `Phase 0.4 recovery member is not byte-identical: ${preservedCopy || "missing"}`);
      check(preservedCopy.startsWith(`${recoveryDirectory}/`), `Phase 0.4 recovery member escapes its directory: ${preservedCopy || "missing"}`);
      check(!recoveredPaths.has(preservedCopy), `Phase 0.4 recovery duplicates ${preservedCopy || "missing"}`);
      recoveredPaths.add(preservedCopy);
      await verifyRepositoryFileRecord(
        { path: preservedCopy, bytes: recovered.bytes, sha256: recovered.sha256 },
        `Phase 0.4 preserved recovery member ${preservedCopy || "missing"}`,
        preservedCopy,
      );
      if (recovered.kind === "raw-jpeg") check(path.extname(preservedCopy).toLowerCase() === ".jpg", `Phase 0.4 recovered raw capture is not JPEG: ${preservedCopy}`);
      if (recovered.kind === "matrix") check(path.posix.basename(preservedCopy) === "browser-matrix-report.json" && recovered.retiredOriginal === true, `Phase 0.4 recovered matrix is not explicitly retired: ${preservedCopy}`);
    }
  }

  const matrixReviewSheets = Array.isArray(browserMatrix.browserDerivedReviewSheets) ? browserMatrix.browserDerivedReviewSheets : [];
  check(matrixReviewSheets.length === exactBrowserReviewSheets.length, `Phase 0.4 matrix has ${matrixReviewSheets.length}/6 browser-derived sheet records`);
  for (const expected of exactBrowserReviewSheets) {
    const record = matrixReviewSheets.find((candidate) => Number(candidate.reviewIndex) === expected.reviewIndex);
    check(Boolean(record), `Phase 0.4 browser matrix omits review sheet ${expected.reviewIndex}`);
    if (!record) continue;
    check(record.filename === expected.filename, `Phase 0.4 browser matrix filename changed for sheet ${expected.reviewIndex}`);
    check(arrayMatches(record.sourceCaseIds, expected.sourceCaseIds), `Phase 0.4 browser matrix case order changed for ${expected.filename}`);
    check(Array.isArray(record.sourceCases) && record.sourceCases.length === expected.sourceCaseIds.length, `Phase 0.4 browser matrix source lineage is incomplete for ${expected.filename}`);
    for (const [index, caseId] of expected.sourceCaseIds.entries()) {
      const source = record.sourceCases?.[index] ?? {};
      const capture = matrixCaseById.get(caseId)?.capture;
      check(source.id === caseId, `Phase 0.4 browser matrix source ID mismatch: ${expected.filename} -> ${caseId}`);
      check(Boolean(capture) && sameFileRecord(source, capture), `Phase 0.4 browser matrix source/capture mismatch: ${expected.filename} -> ${caseId}`);
    }
  }

  check(
    capturePlan.finalMatrix?.path === browserMatrixRelative &&
      capturePlan.finalMatrix?.status === "complete-local-authority-normalized" &&
      Number(capturePlan.finalMatrix?.bytes) === browserMatrixBuffer.length &&
      recordSha(capturePlan.finalMatrix) === browserMatrixSha &&
      Number(capturePlan.finalMatrix?.caseCount) === 46 &&
      Number(capturePlan.finalMatrix?.normalizedCaptureCount) === 36,
    "Phase 0.4 complete plan does not bind the exact normalized 46/36 matrix",
  );

  const semanticPortalCapture = matrixCaseById.get("portal-actual--desktop-1440x900")?.capture;
  const semanticPortalSource = matrixSources.find((record) => record.id === "source-text-free-portal-takeover");
  for (const [index, record] of (portalAuthority.records ?? []).entries()) {
    if (index < 6) continue;
    check(record.source_sha256 === recordSha(semanticPortalSource), `CRT semantic portal state source SHA mismatch: ${record.id}`);
    check(record.matrix_sha256 === browserMatrixSha, `CRT semantic portal state matrix SHA mismatch: ${record.id}`);
    check(Boolean(semanticPortalCapture) && sameFileRecord(record.capture, semanticPortalCapture), `CRT semantic portal state capture mismatch: ${record.id}`);
  }

  const browserReviewComposition = await readJson(
    path.join(packageRoot, ...browserReviewCompositionRelative.split("/")),
    "CRT browser review composition authority",
  );
  check(browserReviewComposition.schema === browserReviewCompositionSchema, "CRT browser review-composition schema changed");
  check(browserReviewComposition.status === "PASS", "CRT browser review-composition authority is not PASS");
  const browserCompositionMatrix = browserReviewComposition.browser_matrix ?? browserReviewComposition.matrix ?? {};
  check(
    browserCompositionMatrix.path === browserMatrixRelative &&
      browserCompositionMatrix.schema === browserMatrixSchema &&
      Number(browserCompositionMatrix.bytes) === browserMatrixBuffer.length &&
      recordSha(browserCompositionMatrix) === browserMatrixSha &&
      Number(browserCompositionMatrix.cases_total) === 46 &&
      Number(browserCompositionMatrix.normalized_capture_count) === 36,
    "CRT browser review composition does not bind the exact normalized matrix",
  );
  await verifyRepositoryFileRecord(
    browserReviewComposition.portal_state_authority ?? browserReviewComposition.portalStateAuthority ?? {},
    "CRT browser composition portal-state authority",
    `${packageRelative}/${portalStateAuthorityRelative}`,
  );
  const browserCompositionRecords = Array.isArray(browserReviewComposition.records) ? browserReviewComposition.records : [];
  check(browserCompositionRecords.length === exactBrowserGovernedReviewSheets.length, `CRT browser review composition has ${browserCompositionRecords.length}/7 outputs`);
  const browserCompositionByIndex = new Map(browserCompositionRecords.map((record) => [Number(record.reviewIndex), record]));
  for (const expected of exactBrowserGovernedReviewSheets) {
    const record = browserCompositionByIndex.get(expected.reviewIndex) ?? {};
    check(record.filename === expected.filename || path.posix.basename(repositoryRecordPath(record)) === expected.filename, `CRT browser composition filename changed for sheet ${expected.reviewIndex}`);
    const output = await verifyRepositoryFileRecord(record, `CRT browser review sheet ${expected.reviewIndex}`, `${packageRelative}/${expected.filename}`, {
      width: Number(record.width),
      height: Number(record.height),
    });
    check(Boolean(output), `CRT browser review sheet is missing: ${expected.filename}`);
    if (expected.reviewIndex === 10) {
      check(arrayMatches(record.stateIds, exactPortalStateIds), "CRT portal-transition sheet state IDs/order changed");
      check(arrayMatches((record.sources ?? []).map((source) => source.stateId), exactPortalStateIds), "CRT portal-transition sheet source order changed");
      for (const [index, source] of (record.sources ?? []).entries()) {
        const stateCapture = portalAuthority.records?.[index]?.render ?? portalAuthority.records?.[index]?.capture;
        const expectedPath = index < 6 ? `${packageRelative}/${recordPath(stateCapture)}` : recordPath(stateCapture);
        check(repositoryRecordPath(source) === expectedPath, `CRT portal sheet source path mismatch: ${exactPortalStateIds[index] ?? index + 1}`);
        check(Boolean(stateCapture) && numberFrom(source, ["bytes"]) === numberFrom(stateCapture, ["bytes"]) && recordSha(source) === recordSha(stateCapture), `CRT portal sheet source lineage mismatch: ${exactPortalStateIds[index] ?? index + 1}`);
        if (source.path) await verifyRepositoryFileRecord(source, `CRT portal sheet source ${source.stateId}`, source.path, { width: Number(source.width), height: Number(source.height) });
      }
    } else {
      check(arrayMatches(record.sourceCaseIds, expected.sourceCaseIds), `CRT browser review composition case order changed for ${expected.filename}`);
      check(arrayMatches((record.sources ?? []).map((source) => source.captureId), expected.sourceCaseIds), `CRT browser review composition source order changed for ${expected.filename}`);
      for (const source of record.sources ?? []) {
        const capture = matrixCaseById.get(source.captureId)?.capture;
        check(Boolean(capture) && sameFileRecord(source, capture), `CRT browser review composition source mismatch: ${expected.filename} -> ${source.captureId}`);
        if (source.path) await verifyRepositoryFileRecord(source, `CRT browser review source ${source.captureId}`, source.path, { width: Number(source.width), height: Number(source.height) });
      }
    }
  }

  const browserEvidenceAbsolute = path.join(repositoryRoot, ...browserEvidenceRelative.split("/"));
  const browserEvidenceBuffer = await fs.readFile(browserEvidenceAbsolute);
  const browserEvidence = await readJson(browserEvidenceAbsolute, "Phase 0.4 browser evidence authority");
  check(browserEvidence.schema === browserEvidenceSchema && browserEvidence.status === "PASS", "Phase 0.4 browser evidence is not final PASS");
  check(
    browserEvidence.capturePlanAuthority?.path === capturePlanSnapshotRelative &&
      Number(browserEvidence.capturePlanAuthority?.bytes) === capturePlanSnapshotBuffer.length &&
      recordSha(browserEvidence.capturePlanAuthority) === sha256Buffer(capturePlanSnapshotBuffer),
    "Phase 0.4 browser evidence does not bind the ready-plan snapshot",
  );
  check(
    browserEvidence.matrix?.path === browserMatrixRelative &&
      Number(browserEvidence.matrix?.bytes) === browserMatrixBuffer.length &&
      recordSha(browserEvidence.matrix) === browserMatrixSha &&
      Number(browserEvidence.matrix?.cases) === 46 &&
      Number(browserEvidence.matrix?.normalizedCaptures) === 36,
    "Phase 0.4 browser evidence does not bind the exact normalized matrix",
  );
  await verifyRepositoryFileRecord(browserEvidence.contract ?? {}, "Phase 0.4 browser evidence contract", "artifacts/original/phase-0-4-crt-television/crt-portal-layout.json");
  await verifyRepositoryFileRecord(browserEvidence.keepout ?? {}, "Phase 0.4 browser evidence keepout", `${packageRelative}/${keepoutManifestRelative}`);
  await verifyRepositoryFileRecord(browserEvidence.canonicalRenderManifest ?? {}, "Phase 0.4 browser evidence canonical authority", `${packageRelative}/${canonicalManifestRelative}`);
  await verifyRepositoryFileRecord(browserEvidence.powerOnStateAuthority ?? {}, "Phase 0.4 browser evidence power authority", `${packageRelative}/${powerStateAuthorityRelative}`);
  await verifyRepositoryFileRecord(browserEvidence.portalTransitionStateAuthority ?? {}, "Phase 0.4 browser evidence portal authority", `${packageRelative}/${portalStateAuthorityRelative}`);
  await verifyRepositoryFileRecord(browserEvidence.creativeReviewCompositionManifest ?? {}, "Phase 0.4 browser evidence static-composition authority", `${packageRelative}/${staticReviewCompositionRelative}`);
  await verifyRepositoryFileRecord(browserEvidence.materialAndAssetManifest ?? {}, "Phase 0.4 browser evidence material authority", `${packageRelative}/${materialManifestRelative}`);
  await verifyRepositoryFileRecord(browserEvidence.browserReviewCompositionManifest ?? {}, "Phase 0.4 browser evidence review-composition authority", `${packageRelative}/${browserReviewCompositionRelative}`);
  check(arrayMatches(browserEvidence.powerOnSheet?.stateIds, exactPowerStateIds), "Phase 0.4 browser evidence power-sheet IDs/order changed");
  const evidencePowerStates = Array.isArray(browserEvidence.powerOnSheet?.states) ? browserEvidence.powerOnSheet.states : [];
  const canonicalPowerRecords = Array.isArray(powerAuthority.records) ? powerAuthority.records : [];
  check(
    evidencePowerStates.length === canonicalPowerRecords.length &&
      evidencePowerStates.every((state, index) => {
        const canonicalRecord = canonicalPowerRecords[index] ?? {};
        const canonicalCapture = canonicalRecord.render ?? canonicalRecord.capture ?? canonicalRecord;
        return (
          state.id === canonicalRecord.id &&
          Number(state.order) === index + 1 &&
          state.owner === "Blender physical CRT" &&
          repositoryRecordPath(state.capture) === `${packageRelative}/${recordPath(canonicalCapture)}` &&
          Number(state.capture?.width) === Number(canonicalCapture.width) &&
          Number(state.capture?.height) === Number(canonicalCapture.height) &&
          numberFrom(state.capture, ["bytes"]) === numberFrom(canonicalCapture, ["bytes"]) &&
          recordSha(state.capture) === recordSha(canonicalCapture)
        );
      }),
    "Phase 0.4 browser evidence power-sheet lineage differs from canonical states",
  );
  check(arrayMatches(browserEvidence.portalTransitionSheet?.stateIds, exactPortalStateIds), "Phase 0.4 browser evidence portal-sheet IDs/order changed");
  check(Number(browserEvidence.portalTransitionSheet?.physicalStateCount) === 6 && Number(browserEvidence.portalTransitionSheet?.browserStateCount) === 2, "Phase 0.4 browser evidence portal ownership split changed");
  const evidencePortalStates = Array.isArray(browserEvidence.portalTransitionSheet?.states) ? browserEvidence.portalTransitionSheet.states : [];
  const canonicalPortalRecords = Array.isArray(portalAuthority.records) ? portalAuthority.records : [];
  check(
    evidencePortalStates.length === canonicalPortalRecords.length &&
      evidencePortalStates.every((state, index) => {
        const canonicalRecord = canonicalPortalRecords[index] ?? {};
        if (index < 6) {
          const canonicalCapture = canonicalRecord.render ?? canonicalRecord.capture ?? canonicalRecord;
          return (
            state.id === canonicalRecord.id &&
            Number(state.order) === index + 1 &&
            state.owner === "Blender physical CRT" &&
            repositoryRecordPath(state.capture) === `${packageRelative}/${recordPath(canonicalCapture)}` &&
            Number(state.capture?.width) === Number(canonicalCapture.width) &&
            Number(state.capture?.height) === Number(canonicalCapture.height) &&
            numberFrom(state.capture, ["bytes"]) === numberFrom(canonicalCapture, ["bytes"]) &&
            recordSha(state.capture) === recordSha(canonicalCapture)
          );
        }
        return (
          state.id === canonicalRecord.id &&
          Number(state.order) === Number(canonicalRecord.order) &&
          state.owner === canonicalRecord.owner &&
          state.status === canonicalRecord.status &&
          state.case_id === canonicalRecord.case_id &&
          state.source_id === canonicalRecord.source_id &&
          state.source_sha256 === canonicalRecord.source_sha256 &&
          state.matrix_sha256 === canonicalRecord.matrix_sha256 &&
          repositoryRecordPath(state.capture) === repositoryRecordPath(canonicalRecord.capture) &&
          Number(state.capture?.width) === Number(canonicalRecord.capture?.width) &&
          Number(state.capture?.height) === Number(canonicalRecord.capture?.height) &&
          numberFrom(state.capture, ["bytes"]) === numberFrom(canonicalRecord.capture, ["bytes"]) &&
          recordSha(state.capture) === recordSha(canonicalRecord.capture)
        );
      }),
    "Phase 0.4 browser evidence portal-sheet lineage differs from the final eight-state authority",
  );
  const evidenceSheets = Array.isArray(browserEvidence.browserGovernedReviewSheets) ? browserEvidence.browserGovernedReviewSheets : [];
  check(arrayMatches(evidenceSheets.map((record) => Number(record.reviewIndex)), exactBrowserGovernedReviewSheets.map((record) => record.reviewIndex)), "Phase 0.4 browser evidence does not bind exact sheets 10–16 in order");
  for (const expected of exactBrowserGovernedReviewSheets) {
    const evidenceSheet = evidenceSheets.find((record) => Number(record.reviewIndex) === expected.reviewIndex) ?? {};
    const compositionRecord = browserCompositionByIndex.get(expected.reviewIndex) ?? {};
    check(evidenceSheet.filename === expected.filename && evidenceSheet.status === "PASS", `Phase 0.4 browser evidence sheet is not PASS: ${expected.filename}`);
    check(Boolean(evidenceSheet.output) && sameFileRecord(evidenceSheet.output, compositionRecord), `Phase 0.4 browser evidence output mismatch: ${expected.filename}`);
    if (expected.reviewIndex === 10) check(arrayMatches(evidenceSheet.stateIds, exactPortalStateIds), "Phase 0.4 browser evidence portal sheet changed its state IDs");
    else check(arrayMatches(evidenceSheet.sourceCaseIds, expected.sourceCaseIds), `Phase 0.4 browser evidence case IDs changed: ${expected.filename}`);
  }
  check(
    Number(browserEvidence.completion?.caseCount) === 46 &&
      Number(browserEvidence.completion?.normalizedCaptureCount) === 36 &&
      Number(browserEvidence.completion?.exactPowerStateCount) === 7 &&
      Number(browserEvidence.completion?.exactPortalStateCount) === 8 &&
      Number(browserEvidence.completion?.browserReviewSheetCount) === 7 &&
      Number(browserEvidence.completion?.outputsBound) === 7,
    "Phase 0.4 browser evidence completion counts changed",
  );
  check(
    capturePlan.completionAuthority?.path === browserEvidenceRelative &&
      capturePlan.completionAuthority?.schema === browserEvidenceSchema &&
      Number(capturePlan.completionAuthority?.bytes) === browserEvidenceBuffer.length &&
      recordSha(capturePlan.completionAuthority) === sha256Buffer(browserEvidenceBuffer),
    "Phase 0.4 complete plan does not bind the browser-evidence authority",
  );
  const browserReviewCompositionBuffer = await fs.readFile(path.join(packageRoot, ...browserReviewCompositionRelative.split("/")));
  check(
    capturePlan.browserReviewCompositionAuthority?.path === `${packageRelative}/${browserReviewCompositionRelative}` &&
      capturePlan.browserReviewCompositionAuthority?.schema === browserReviewCompositionSchema &&
      Number(capturePlan.browserReviewCompositionAuthority?.bytes) === browserReviewCompositionBuffer.length &&
      recordSha(capturePlan.browserReviewCompositionAuthority) === sha256Buffer(browserReviewCompositionBuffer),
    "Phase 0.4 complete plan does not bind the browser review-composition authority",
  );

  const inventoryPath = path.join(packageRoot, "manifests", "package-inventory.json");
  const inventory = await readJson(inventoryPath, "package inventory");
  check(
    inventory.schema === "quantum-hub.phase-0-4-crt-television.package-inventory.v1",
    "package inventory schema is not the authorized Phase 0.4 v1 schema",
  );
  check(inventory.scope === packageRelative, "package inventory does not bind the exact Phase 0.4 package root");
  check(inventory.intended_commit_only === true, "package inventory is not limited to intended committed files");
  check(
    Array.isArray(inventory.exclusions) && inventory.exclusions.length === 1 && inventory.exclusions[0] === "manifests/package-inventory.json",
    "package inventory does not explicitly self-exclude only its own file",
  );
  const inventoryRecords = recordsFrom(inventory);
  const inventoryRelative = "manifests/package-inventory.json";
  const expectedInventoryMembers = packageFiles.filter((file) => file.relative !== inventoryRelative);
  check(inventoryRecords.length === expectedInventoryMembers.length, `package inventory has ${inventoryRecords.length}/${expectedInventoryMembers.length} self-excluded records`);
  check(Number(inventory.file_count) === expectedInventoryMembers.length, "package inventory file_count does not match its governed set");
  check(
    Number(inventory.total_bytes) === expectedInventoryMembers.reduce((total, file) => total + file.bytes, 0),
    "package inventory total_bytes does not match its governed set",
  );
  check(packageFiles.reduce((total, file) => total + file.bytes, 0) < 400 * 1024 * 1024, "Phase 0.4 package exceeds the 400 MiB review-evidence budget");
  const inventoryByPath = new Map(inventoryRecords.map((record) => [normalize(record.package_relative_path ?? record.path), record]));
  for (const file of expectedInventoryMembers) {
    const record = inventoryByPath.get(file.relative);
    check(Boolean(record), `package inventory omits ${file.relative}`);
    if (!record) continue;
    const buffer = await fs.readFile(file.absolute);
    check(numberFrom(record, ["bytes", "size"]) === file.bytes, `package inventory byte mismatch: ${file.relative}`);
    check(String(record.sha256 ?? "").toLowerCase() === sha256Buffer(buffer), `package inventory SHA-256 mismatch: ${file.relative}`);
    check(record.intendedCommit === true, `package inventory does not mark intendedCommit=true: ${file.relative}`);
    check(
      normalize(record.repository_relative_path) === `${packageRelative}/${file.relative}`,
      `package inventory repository-relative path mismatch: ${file.relative}`,
    );
    check(String(record.classification ?? "").length > 0, `package inventory classification missing: ${file.relative}`);
    check(String(record.approval_state ?? record.approvalState ?? "").length > 0, `package inventory approval state missing: ${file.relative}`);
  }

  const reviewBundle = await readJson(path.join(packageRoot, "manifests", "review-bundle-manifest.json"), "review bundle manifest");
  check(
    reviewBundle.schema === "quantum-hub.phase-0-4-crt-television.review-bundle.v1",
    "review bundle schema is not the authorized Phase 0.4 v1 schema",
  );
  const reviewRecords = recordsFrom(reviewBundle);
  const reviewNames = new Set(reviewRecords.map((record) => path.posix.basename(recordPath(record))));
  check(reviewNames.size === exactReviewPngNames.size, `review bundle has ${reviewNames.size}/${exactReviewPngNames.size} exact review PNG records`);
  for (const name of exactReviewPngNames) check(reviewNames.has(name), `review bundle omits ${name}`);
  check(reviewRecords.length === exactReviewPngNames.size, `review bundle has ${reviewRecords.length}/${exactReviewPngNames.size} records without duplicates`);
  const reviewPixelHashes = new Map();
  for (const record of reviewRecords) {
    const relative = recordPath(record);
    check(!relative.includes("/"), `review bundle record is not a top-level review PNG: ${relative}`);
    check(exactReviewPngNames.has(relative), `review bundle has unexpected record: ${relative}`);
    const verified = await verifyFileRecord(record, `Phase 0.4 review bundle record ${relative}`, relative);
    if (verified?.decoded) {
      const { width, height, pixelSha256 } = verified.decoded;
      check(numberFrom(record, ["width"]) === width && numberFrom(record, ["height"]) === height, `review bundle record omits or misstates dimensions: ${relative}`);
      check(width >= 720 && height >= 720 && width * height >= 1_000_000, `review PNG is below the minimum credible evidence resolution: ${relative} / ${width}×${height}`);
      check(!reviewPixelHashes.has(pixelSha256), `review PNG duplicates decoded pixels from ${reviewPixelHashes.get(pixelSha256)}: ${relative}`);
      reviewPixelHashes.set(pixelSha256, relative);
    }
    check(String(record.classification ?? "").length > 0, `review bundle classification missing: ${relative}`);
    check(String(record.approval_state ?? record.approvalState ?? "").length > 0, `review bundle approval state missing: ${relative}`);
  }

  const zipRelative = "phase-0-4-crt-television-review.zip";
  const zipAbsolute = path.join(packageRoot, zipRelative);
  const zipBuffer = (await exists(zipAbsolute)) ? await fs.readFile(zipAbsolute) : Buffer.alloc(0);
  let zipMembers = [];
  if (zipBuffer.length > 0) {
    try {
      zipMembers = readZipMembers(zipBuffer);
    } catch (error) {
      errors.push(`Phase 0.4 review ZIP is invalid: ${error.message}`);
    }
  }
  const expectedZipMembers = new Set([...exactReviewPngNames, "README.md"]);
  const observedZipMembers = new Set();
  for (const member of zipMembers) {
    check(!member.name.endsWith("/"), `Phase 0.4 review ZIP contains a directory entry: ${member.name}`);
    check(!member.name.includes("/") && !member.name.includes("\\") && !member.name.includes(":"), `Phase 0.4 review ZIP member is not safely top-level: ${member.name}`);
    check(!member.name.startsWith(".") && !member.name.includes(".."), `Phase 0.4 review ZIP has unsafe member name: ${member.name}`);
    check(!observedZipMembers.has(member.name), `Phase 0.4 review ZIP duplicates ${member.name}`);
    observedZipMembers.add(member.name);
    check(expectedZipMembers.has(member.name), `Phase 0.4 review ZIP contains unexpected member: ${member.name}`);
    const privateHit = privatePathHit(member.contents);
    check(privateHit === null, `${privateHit} leaked into review ZIP member ${member.name}`);
    if (exactReviewPngNames.has(member.name)) {
      const packageAbsolute = path.join(packageRoot, member.name);
      if (await exists(packageAbsolute)) {
        const packageBuffer = await fs.readFile(packageAbsolute);
        check(sha256Buffer(member.contents) === sha256Buffer(packageBuffer), `review ZIP PNG differs from governed package file: ${member.name}`);
      }
    }
  }
  check(setMatches(observedZipMembers, expectedZipMembers), `Phase 0.4 review ZIP has ${observedZipMembers.size}/${expectedZipMembers.size} exact members`);
  const readme = zipMembers.find((member) => member.name === "README.md")?.contents.toString("utf8") ?? "";
  const readmeText = readme.replace(/\s+/g, " ");
  check(/selected\s+(?:CRT\s+)?variant\s*:\s*A\b/i.test(readmeText), "review ZIP README does not identify selected CRT Variant A");
  check(/0\.84\b.{0,40}0\.69\b.{0,40}0\.76\b.{0,20}(?:m|metres?|meters?)/i.test(readmeText), "review ZIP README does not bind the selected assembled dimensions");
  check(/Blender\s+version\s*:\s*5\.2\.0\s+LTS/i.test(readmeText), "review ZIP README does not identify Blender 5.2.0 LTS");
  check(/render\s+settings?/i.test(readmeText), "review ZIP README omits render settings");
  check(/engine/i.test(readmeText) && /samples?/i.test(readmeText) && /denois/i.test(readmeText), "review ZIP README does not identify engine, samples and denoising");
  check(/resolution/i.test(readmeText) && /AgX/i.test(readmeText), "review ZIP README does not identify resolution and AgX colour management");
  if (refinedSource) check(readmeText.toLowerCase().includes(sha256Buffer(refinedSource.buffer)), "review ZIP README omits the refined Blender source SHA-256");
  check(/model(?:led|ed)\s+from\s+scratch/i.test(readmeText), "review ZIP README omits modelled-from-scratch provenance");
  check(/user[- ]supplied\s+CRT\s+television\s+photograph/i.test(readmeText), "review ZIP README does not identify the private reference opaquely");
  check(/(?:not\s+committed|intentionally\s+uncommitted)/i.test(readmeText), "review ZIP README does not state that the user photograph stayed uncommitted");
  check(/(?:not|never)\s+used\s+as\s+(?:a\s+)?texture/i.test(readmeText), "review ZIP README does not state that the user photograph was not used as a texture");
  check(/no\s+third[- ]party\s+model/i.test(readmeText), "review ZIP README omits the no-third-party-model statement");
  check(/known\s+(?:visual\s+)?risks?/i.test(readmeText), "review ZIP README omits known visual risks");
  for (const name of exactReviewPngNames) {
    const absolute = path.join(packageRoot, name);
    if (!(await exists(absolute))) continue;
    const buffer = await fs.readFile(absolute);
    check(readme.toLowerCase().includes(sha256Buffer(buffer)), `review ZIP README omits SHA-256 for ${name}`);
  }
}

if (errors.length > 0) {
  console.error(`Phase 0.4 CRT asset verification failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const mode = preflight ? "preflight" : "final";
  const packageBytes = packageFiles.reduce((total, file) => total + file.bytes, 0);
  const largest = [...packageFiles].sort((left, right) => right.bytes - left.bytes)[0];
  console.log(
    `Verified Phase 0.4 CRT ${mode} boundaries: accepted parent/branch/remote, protected V1-V3 and publication trees, private-reference path scan, no external model/image source, no video/frame sequence/LFS, ${packageFiles.length} files / ${packageBytes} bytes; largest ${largest?.relative ?? "none"} / ${largest?.bytes ?? 0} bytes.`,
  );
}
