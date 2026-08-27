import { createHash, randomUUID } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

export const PHASE4R2_SOURCE_BLEND_SHA256 = "b0c9c7c1cf5a1642870cf03a36791cc50ec31ac207aeae794fbea83c856a79c0";
export const PHASE4R2_SOURCE_BLEND_BYTES = 3_600_194;
export const PHASE4R2_SOURCE_BLEND_RELATIVE = "artifacts/original/phase-4r1-1-periphery-current-mobile-crt/source/quantum-signal-television-phase4r1-1-periphery-current-mobile-crt.blend";
export const PHASE4R2_MANIFEST_RELATIVE = "manifests/phase-4r2-production-media-manifest.json";
export const PHASE4R2_AUTHORITY_RELATIVE = "artifacts/original/phase-4r2-final-cinematic-production";
export const PHASE4R2_OUTPUT_RELATIVE = "public/media/cinematic/phase-4r2";
export const PHASE4R2_MAX_ASSET_BYTES = 25 * 1024 * 1024;

const FRAME_COUNT = 500;
const FPS = 30;
const DURATION_SECONDS = 50 / 3;
const FFMPEG_SHA256 = "72a489eccd008c2ec2c0a5856c5c75bc3d8bbfa90166c4566865c246445e6aa3";
const FFPROBE_SHA256 = "19202b23c0043f15ad1b7bce2344f406fd52bd6efd8f995ce02e7392a1cec52f";
const REQUIRED_VISUAL_FIELDS = Object.freeze(["darkGradientBanding", "exactQ", "graphiteCurrent", "wallShadows", "portalBlack", "overall"]);
const CRC32_TABLE = Object.freeze(Array.from({ length: 256 }, (_unused, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
}));
const VISUAL_SAMPLE_FRAMES = Object.freeze([...new Set([
  1, ...Array.from({ length: 20 }, (_unused, index) => (index + 1) * 25),
  76, 106, 150, 166, 180, 225, 285, 320, 356, 360, 370, 390, 405, 450, 480,
])].sort((left, right) => left - right));
export const PHASE4R2_FAMILIES = Object.freeze({
  desktop: Object.freeze({ width: 1920, height: 1200, camera: "Phase4R1_Camera_Desktop", settingsSha256: "df63b497e22a2654516e8bd2f66c0fc1b8314ffaab760de7063e7c9d57c9aa34" }),
  portrait: Object.freeze({ width: 780, height: 1688, camera: "Phase4R1_Camera_Mobile", settingsSha256: "132864c63c625eb850f578d1350295d389175bc489b0815478358482ebf916d7" }),
  landscape: Object.freeze({ width: 1688, height: 780, camera: "Phase4R1_Camera_Landscape", settingsSha256: "d705be7dd797934fe8fb1cbf6a7116a3700fa88f1f23ae8d9b76529d004c6dde" }),
});
export const PHASE4R2_DELIVERY_DECISIONS = Object.freeze({
  desktop: Object.freeze({
    cohort: "desktop-native-1920x1200-v1", masterResolution: Object.freeze([1920, 1200]), deliveryResolution: Object.freeze([1920, 1200]),
    rationale: "Evaluate and retain the authored 1920x1200 desktop master first; a visual-PASS candidate below the strict asset gate avoids any desktop wall/Q/current resolution loss.",
  }),
  portrait: Object.freeze({
    cohort: "portrait-native-780x1688-v1", masterResolution: Object.freeze([780, 1688]), deliveryResolution: Object.freeze([780, 1688]),
    rationale: "Retain the authored 780x1688 portrait master when a visual-PASS candidate fits, preserving the exact 390x844 composition at 2x review density without resampling.",
  }),
  landscape: Object.freeze({
    cohort: "landscape-native-1688x780-v1", masterResolution: Object.freeze([1688, 780]), deliveryResolution: Object.freeze([1688, 780]),
    rationale: "Retain the authored 1688x780 mobile-landscape master when a visual-PASS candidate fits, preserving the exact 844x390 authority at 2x review density without resampling.",
  }),
});
export const PHASE4R2_FIXED_AUTHORITY_PATHS = Object.freeze([
  PHASE4R2_MANIFEST_RELATIVE,
  "manifests/phase-4r2-media-selection.json",
  ...Object.keys(PHASE4R2_FAMILIES).map((family) => `manifests/phase-4r2-${family}-frame-manifest.json`),
  "reports/phase-4r2-frame-completion-audit.json",
  "reports/phase-4r2-encode-quality-report.json",
  "reports/phase-4r2-poster-validation-report.json",
  ...Object.keys(PHASE4R2_FAMILIES).map((family) => `reports/phase-4r2-${family}-codec-determinism.json`),
  "reports/phase-4r2-master-visual-verdict.json",
  "reports/phase-4r2-encode-visual-verdict.json",
]);

const CODECS = Object.freeze({
  vp9: Object.freeze({ extension: "webm", container: "webm", encoder: "libvpx-vp9", settings: "vp9-v1" }),
  h264: Object.freeze({ extension: "mp4", container: "mp4", encoder: "libx264", settings: "h264-v1" }),
});
const TOP_LEVEL_KEYS = Object.freeze(["assets", "authorization", "codecDeterminismReports", "deliveryResolutionDecisions", "encodeVisualVerdictSha256", "masterVisualVerdictSha256", "physicalTimeline", "qualityReportSha256", "schema", "selectionSha256", "sourceBlendSha256"]);
const VIDEO_KEYS = Object.freeze(["bytes", "codec", "deliveryDecision", "deliveryResolution", "durationSeconds", "encode", "family", "file", "fps", "frames", "kind", "masterFrameManifestSha256", "masterResolution", "quality", "resolution", "selectionReason", "sha256", "sourceMaster"]);
const POSTER_KEYS = Object.freeze(["bytes", "deliveryDecision", "deliveryResolution", "derivationAuthority", "derivationAuthoritySha256", "family", "file", "kind", "masterF1Sha256", "masterFrameManifestSha256", "masterResolution", "resolution", "sha256"]);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
};
const canonical = (value) => JSON.stringify(stableValue(value));
const same = (left, right) => canonical(left) === canonical(right);
const exactKeys = (value, expected) => value && typeof value === "object" && !Array.isArray(value) && same(Object.keys(value).sort(), [...expected].sort());
const hex256 = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const assertAuthority = (condition, message) => { if (!condition) throw new Error(`Phase 4-R2 authority rejected: ${message}`); };
const containsPrivatePath = (value) => /(?:[A-Za-z]:[\\/]|\/Users\/[^/\s]+|\/home\/[^/\s]+|OneDrive|AppData)/i.test(String(value ?? "").replace(/\\\\/g, "\\"));

function forwardColorFilter(width, height) {
  return `zscale=w=${width}:h=${height}:f=lanczos:rin=full:r=limited:min=gbr:m=bt709:tin=iec61966-2-1:t=bt709:pin=bt709:p=bt709:d=error_diffusion,format=yuv420p`;
}

function reverseColorFilter(width, height) {
  return `zscale=w=${width}:h=${height}:f=lanczos:rin=limited:r=full:min=bt709:m=gbr:tin=bt709:t=iec61966-2-1:pin=bt709:p=bt709:d=error_diffusion,format=gbrp`;
}

function codecArguments(codec, crf) {
  if (codec === "h264") return ["-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-profile:v", "high", "-g", "12", "-keyint_min", "12", "-sc_threshold", "0", "-flags:v", "+cgop+bitexact", "-x264-params", "keyint=12:min-keyint=12:scenecut=0:open-gop=0:aq-mode=3:aq-strength=1.0", "-threads:v", "8", "-movflags", "+faststart", "-video_track_timescale", "30000", "-f", "mp4"];
  if (codec === "vp9") return ["-c:v", "libvpx-vp9", "-deadline", "good", "-cpu-used", "1", "-crf", String(crf), "-b:v", "0", "-g", "12", "-keyint_min", "12", "-lag-in-frames", "0", "-auto-alt-ref", "0", "-row-mt", "1", "-tile-columns", "2", "-frame-parallel", "0", "-aq-mode", "1", "-threads:v", "8", "-flags:v", "+bitexact", "-cues_to_front", "1", "-cluster_time_limit", "400", "-write_crc32", "1", "-f", "webm"];
  throw new Error(`Unsupported Phase 4-R2 codec: ${codec}`);
}

export function buildPhase4R2CanonicalEncodeArgv({ family, codec, crf, output, startFrame = 1, frameCount = FRAME_COUNT }) {
  const authority = PHASE4R2_FAMILIES[family];
  assertAuthority(Boolean(authority && CODECS[codec]), "canonical encode argv has an unknown family/codec");
  return ["<FFMPEG>", "-hide_banner", "-nostdin", "-y", "-v", "warning", "-xerror", "-f", "image2", "-framerate", String(FPS), "-start_number", String(startFrame), "-i", `<EXTERNAL_ROOT>/masters/${family}/frames/F%03d.png`, "-map", "0:v:0", "-frames:v", String(frameCount), "-an", "-map_metadata", "-1", "-map_chapters", "-1", "-vf", forwardColorFilter(authority.width, authority.height), "-r", String(FPS), "-fps_mode", "cfr", "-pix_fmt", "yuv420p", "-color_range", "tv", "-colorspace", "bt709", "-color_trc", "bt709", "-color_primaries", "bt709", "-fflags", "+bitexact", "-metadata", "encoder=", "-metadata:s:v:0", "encoder=", ...codecArguments(codec, crf), output];
}

function expectedSettingsAuthorities() {
  const common = { frames: FRAME_COUNT, fps: FPS, fixedGopFrames: 12, pixelFormat: "yuv420p", colorRange: "tv", colorSpace: "bt709", transfer: "bt709", primaries: "bt709", forwardColorTransform: forwardColorFilter("<WIDTH>", "<HEIGHT>"), mapping: { videoStream: "0:v:0", audio: false, metadata: false, chapters: false }, deterministicMuxing: { ffFlags: "+bitexact", encoderMetadata: "cleared" }, maximumBytesExclusive: PHASE4R2_MAX_ASSET_BYTES };
  const h264 = { codec: "libx264", preset: "slow", crfs: [16, 19, 22], extra: codecArguments("h264", "<CRF>") };
  const vp9 = { codec: "libvpx-vp9", deadline: "good", cpuUsed: 1, crfs: [20, 24, 28], extra: codecArguments("vp9", "<CRF>") };
  const metric = { reference: "display-referred full-range gbrp16le", candidate: "BT.709 limited to sRGB/full gbrp16le", stats: ["SSIM", "PSNR"] };
  return Object.fromEntries(Object.entries({ common, "h264-v1": h264, "vp9-v1": vp9, "metric-v1": metric }).map(([key, value]) => [key, { value, sha256: sha256(Buffer.from(canonical(value))) }]));
}

export const PHASE4R2_SETTINGS_AUTHORITIES = Object.freeze(expectedSettingsAuthorities());

function relativeParts(relative) {
  if (typeof relative !== "string" || !relative || path.posix.isAbsolute(relative) || path.win32.isAbsolute(relative) || relative.includes("\\")) throw new Error(`Unsafe Phase 4-R2 relative path: ${String(relative)}`);
  if (relative.split("/").some((part) => !part || part === "." || part === "..")) throw new Error(`Non-canonical Phase 4-R2 relative path: ${relative}`);
  const normalized = path.posix.normalize(relative);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../") || normalized.split("/").some((part) => /^[a-z]:$/i.test(part))) throw new Error(`Escaping Phase 4-R2 relative path: ${relative}`);
  return normalized.split("/");
}

function under(root, relative) {
  const candidate = path.resolve(root, ...relativeParts(relative));
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!candidate.startsWith(prefix)) throw new Error(`Phase 4-R2 path escapes authority root: ${relative}`);
  return candidate;
}

async function regularFile(filename, label) {
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file`);
  return info;
}

async function filesUnder(directory, prefix = "") {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Phase 4-R2 authority tree cannot contain symlinks: ${relative}`);
    if (entry.isDirectory()) output.push(...await filesUnder(absolute, relative));
    else if (entry.isFile()) output.push(relative);
    else throw new Error(`Phase 4-R2 authority tree has an unsupported entry: ${relative}`);
  }
  return output.sort();
}

function jsonRecord(relative, payload) {
  assertAuthority(!containsPrivatePath(payload.toString("utf8")), `${relative} leaks a private filesystem path`);
  let json;
  try { json = JSON.parse(payload.toString("utf8")); } catch (error) { throw new Error(`Phase 4-R2 authority rejected: ${relative} is invalid JSON`, { cause: error }); }
  return { relative, payload, bytes: payload.length, sha256: sha256(payload), json };
}

async function loadRecords(authorityRoot, relatives) {
  const records = new Map();
  for (const relative of relatives) {
    const absolute = under(authorityRoot, relative);
    await regularFile(absolute, `Phase 4-R2 authority ${relative}`);
    const payload = await readFile(absolute);
    records.set(relative, relative.endsWith(".json") ? jsonRecord(relative, payload) : { relative, payload, bytes: payload.length, sha256: sha256(payload) });
  }
  return records;
}

function optionValue(argv, option) {
  const index = argv.lastIndexOf(option);
  return index >= 0 ? argv[index + 1] : undefined;
}

function expectedPosterDerivation(family) {
  const { width, height } = PHASE4R2_FAMILIES[family];
  const forward = forwardColorFilter(width, height);
  const reverse = reverseColorFilter(width, height);
  return { sourceFrame: 1, sourceFormat: "16-bit RGB PNG", resolution: [width, height], filter: `${forward},${reverse}`, output: { codec: "png", bitDepth: 8, colorType: "RGB", alpha: false, compressionLevel: 9, prediction: "mixed" } };
}

function assertPng(payload, width, height, label) {
  const crc32 = (buffer) => {
    let crc = 0xffffffff;
    for (const byte of buffer) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
    return (crc ^ 0xffffffff) >>> 0;
  };
  assertAuthority(payload.length >= 45 && payload.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${label} has no complete PNG signature`);
  let offset = 8;
  let header = null;
  let chunkIndex = 0;
  let ended = false;
  const compressed = [];
  while (!ended) {
    assertAuthority(offset + 12 <= payload.length, `${label} has a truncated PNG chunk`);
    const length = payload.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = typeStart + 4;
    const crcStart = dataStart + length;
    assertAuthority(crcStart + 4 <= payload.length, `${label} has truncated PNG data`);
    const type = payload.subarray(typeStart, dataStart);
    const data = payload.subarray(dataStart, crcStart);
    const typeName = type.toString("ascii");
    assertAuthority(payload.readUInt32BE(crcStart) === crc32(Buffer.concat([type, data])), `${label} ${typeName} CRC mismatch`);
    assertAuthority(chunkIndex !== 0 || typeName === "IHDR", `${label} PNG IHDR is not first`);
    if (typeName === "IHDR") {
      assertAuthority(!header && length === 13, `${label} has an invalid PNG IHDR`);
      header = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), bitDepth: data[8], colorType: data[9], compression: data[10], filter: data[11], interlaced: data[12] };
    } else if (typeName === "IDAT") compressed.push(data);
    else if (typeName === "IEND") { assertAuthority(length === 0, `${label} has an invalid PNG IEND`); ended = true; }
    offset = crcStart + 4;
    chunkIndex += 1;
  }
  assertAuthority(offset === payload.length && header && compressed.length > 0, `${label} PNG is incomplete or has trailing bytes`);
  assertAuthority(header.width === width && header.height === height && header.bitDepth === 8 && header.colorType === 2 && header.compression === 0 && header.filter === 0 && header.interlaced === 0, `${label} must be the exact non-interlaced 8-bit RGB family PNG`);
  const rowBytes = width * 3;
  const expectedDecodedBytes = (rowBytes + 1) * height;
  assertAuthority(Number.isSafeInteger(expectedDecodedBytes) && expectedDecodedBytes > 0 && expectedDecodedBytes <= 256 * 1024 * 1024, `${label} decoded PNG size is unsafe`);
  let inflated;
  try { inflated = inflateSync(Buffer.concat(compressed), { maxOutputLength: expectedDecodedBytes, info: true }); }
  catch (error) { throw new Error(`Phase 4-R2 authority rejected: ${label} PNG zlib decode failed`, { cause: error }); }
  assertAuthority(inflated.engine.bytesWritten === Buffer.concat(compressed).length && inflated.buffer.length === expectedDecodedBytes, `${label} PNG compressed/decoded byte boundary mismatch`);
  for (let row = 0; row < height; row += 1) assertAuthority(inflated.buffer[row * (rowBytes + 1)] <= 4, `${label} has an invalid PNG row filter`);
}

function assertVideoContainer(payload, codec, label) {
  if (codec === "vp9") assertAuthority(payload.length >= 4 && payload.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])), `${label} is not a WebM/EBML payload`);
  else assertAuthority(payload.length >= 12 && payload.subarray(4, 8).toString("ascii") === "ftyp", `${label} is not an MP4 payload`);
}

function assertFrameManifest(record, family) {
  const authority = PHASE4R2_FAMILIES[family];
  const manifest = record.json;
  assertAuthority(exactKeys(manifest, ["family", "frames", "master", "schema", "source"]), `${record.relative} has an unexpected schema shape`);
  assertAuthority(manifest.schema === "quantum-hub.phase-4-r2.frame-manifest.v1" && manifest.family === family, `${record.relative} schema/family mismatch`);
  assertAuthority(exactKeys(manifest.source, ["blendSha256", "camera", "settingsSha256"]), `${record.relative} source shape mismatch`);
  assertAuthority(manifest.source.blendSha256 === PHASE4R2_SOURCE_BLEND_SHA256 && manifest.source.camera === authority.camera && manifest.source.settingsSha256 === authority.settingsSha256, `${record.relative} source authority mismatch`);
  assertAuthority(exactKeys(manifest.master, ["fps", "frameCount", "frameRange", "resolution", "sequenceSha256", "totalBytes"]), `${record.relative} master shape mismatch`);
  assertAuthority(same(manifest.master.resolution, [authority.width, authority.height]) && manifest.master.fps === FPS && same(manifest.master.frameRange, [1, FRAME_COUNT]) && manifest.master.frameCount === FRAME_COUNT && Number.isInteger(manifest.master.totalBytes) && manifest.master.totalBytes > 0 && hex256(manifest.master.sequenceSha256) && Array.isArray(manifest.frames) && manifest.frames.length === FRAME_COUNT, `${record.relative} master timeline mismatch`);
  let totalBytes = 0;
  let sequence = "";
  for (let index = 0; index < manifest.frames.length; index += 1) {
    const frame = manifest.frames[index];
    const number = index + 1;
    const filename = `F${String(number).padStart(3, "0")}.png`;
    assertAuthority(exactKeys(frame, ["bitDepth", "bytes", "colorType", "file", "frame", "height", "sha256", "width"]), `${record.relative} frame ${number} shape mismatch`);
    assertAuthority(frame.frame === number && frame.file === filename && Number.isInteger(frame.bytes) && frame.bytes > 0 && hex256(frame.sha256) && frame.width === authority.width && frame.height === authority.height && frame.bitDepth === 16 && frame.colorType === 2, `${record.relative} frame ${number} authority mismatch`);
    totalBytes += frame.bytes;
    sequence += `${number}|${filename}|${frame.bytes}|${frame.sha256}|${authority.width}|${authority.height}|16|2\n`;
  }
  assertAuthority(totalBytes === manifest.master.totalBytes, `${record.relative} total master bytes mismatch`);
  assertAuthority(sha256(Buffer.from(sequence, "utf8")) === manifest.master.sequenceSha256, `${record.relative} sequence SHA-256 mismatch`);
}

function expectedAssetBasename(asset) {
  return asset.kind === "video" ? `phase-4r2-${asset.family}-${asset.codec}-${asset.sha256.slice(0, 12)}.${CODECS[asset.codec].extension}` : `phase-4r2-${asset.family}-poster-${asset.sha256.slice(0, 12)}.png`;
}

function assertAssetBasics(asset) {
  const authority = PHASE4R2_FAMILIES[asset.family];
  assertAuthority(Boolean(authority), `asset ${String(asset.file)} has an unknown family`);
  assertAuthority(["video", "poster"].includes(asset.kind), `asset ${String(asset.file)} has an unknown kind`);
  if (asset.kind === "video") assertAuthority(Boolean(CODECS[asset.codec]), `asset ${String(asset.file)} has an unknown codec`);
  assertAuthority(exactKeys(asset, asset.kind === "video" ? VIDEO_KEYS : POSTER_KEYS), `${String(asset.file)} has an unexpected asset shape`);
  assertAuthority(Number.isInteger(asset.bytes) && asset.bytes > 0 && asset.bytes < PHASE4R2_MAX_ASSET_BYTES, `${asset.file} violates the positive strict <25 MiB asset gate`);
  assertAuthority(hex256(asset.sha256), `${asset.file} has an invalid payload SHA-256`);
  const prefix = asset.kind === "video" ? "media/" : "posters/";
  assertAuthority(asset.file === `${prefix}${expectedAssetBasename(asset)}`, `${asset.file} is not the exact nested hash-named ${asset.kind} path`);
  assertAuthority(same(asset.resolution, [authority.width, authority.height]) && same(asset.masterResolution, [authority.width, authority.height]) && same(asset.deliveryResolution, [authority.width, authority.height]), `${asset.file} resolution authority mismatch`);
  assertAuthority(same(asset.deliveryDecision, PHASE4R2_DELIVERY_DECISIONS[asset.family]), `${asset.file} delivery decision mismatch`);
}

function assertDeterminismReport(record, family, frameManifestSha256, settingsByCodec) {
  const report = record.json;
  assertAuthority(report.schema === "quantum-hub.phase-4-r2.codec-determinism.v1" && report.sourceBlendSha256 === PHASE4R2_SOURCE_BLEND_SHA256 && report.family === family && report.masterFrameManifestSha256 === frameManifestSha256 && report.toolchain?.ffmpegSha256 === FFMPEG_SHA256 && report.toolchain?.ffprobeSha256 === FFPROBE_SHA256 && report.status === "PASS" && same(Object.keys(report.codecs ?? {}).sort(), ["h264", "vp9"]), `${record.relative} determinism authority mismatch`);
  for (const codec of Object.keys(CODECS)) {
    const state = report.codecs[codec];
    const runs = state?.runs;
    assertAuthority(state?.status === "PASS" && same(state.frames, [360, 390]) && state.crf === (codec === "vp9" ? 24 : 19) && state.settingsAuthoritySha256 === settingsByCodec[codec] && Array.isArray(runs) && runs.length === 2, `${record.relative} ${codec} determinism contract mismatch`);
    assertAuthority(new Set(runs.map((run) => run.basename)).size === 2 && new Set(runs.map((run) => run.externalRelativePath)).size === 2, `${record.relative} ${codec} determinism runs are not unique`);
    for (const [index, run] of runs.entries()) {
      const suffix = index === 0 ? "a" : "b";
      const basename = `${family}-${codec}-critical-${suffix}.${CODECS[codec].extension}`;
      const escaped = basename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      assertAuthority(run.basename === basename && new RegExp(`^determinism/${family}/run-[0-9a-f-]{36}/${escaped}$`, "i").test(run.externalRelativePath), `${record.relative} ${codec} run path mismatch`);
      assertAuthority(Number.isInteger(run.bytes) && run.bytes > 0 && hex256(run.sha256), `${record.relative} ${codec} run bytes/hash mismatch`);
      const expectedOutput = `<EXTERNAL_ROOT>/media-production/${run.externalRelativePath}`;
      assertAuthority(Array.isArray(run.argv) && hex256(run.argvSha256) && sha256(Buffer.from(canonical(run.argv))) === run.argvSha256 && run.argv.at(-1) === expectedOutput && same(run.argv, buildPhase4R2CanonicalEncodeArgv({ family, codec, crf: state.crf, startFrame: 360, frameCount: 31, output: expectedOutput })), `${record.relative} ${codec} run argv binding mismatch`);
    }
    assertAuthority(runs[0].bytes === runs[1].bytes && runs[0].sha256 === runs[1].sha256, `${record.relative} ${codec} is not byte deterministic`);
  }
}

function metricValue(value, kind) {
  return (value === "inf" && kind === "psnr") || (typeof value === "number" && Number.isFinite(value) && (kind !== "ssim" || value >= 0 && value <= 1));
}

function assertQualityCandidate(candidate, family, frameManifestSha256, visual, selectedIds) {
  const authority = PHASE4R2_FAMILIES[family];
  const codec = CODECS[candidate?.codec];
  const ladders = { vp9: { high: 20, balanced: 24, smaller: 28 }, h264: { high: 16, balanced: 19, smaller: 22 } };
  const crf = ladders[candidate?.codec]?.[candidate?.qualityLevel];
  const id = `${family}-${candidate?.codec}-${candidate?.qualityLevel}`;
  assertAuthority(Boolean(codec) && candidate.id === id && candidate.crf === crf, `${candidate?.id ?? family} candidate identity/ladder mismatch`);
  assertAuthority(same(candidate.resolution, [authority.width, authority.height]) && Number.isInteger(candidate.bytes) && candidate.bytes > 0 && hex256(candidate.sha256) && candidate.file === `phase-4r2-${family}-${candidate.codec}-${candidate.sha256.slice(0, 12)}.${codec.extension}` && candidate.externalRelativePath === `candidates/${family}/${id}/${candidate.file}`, `${id} candidate path/bytes authority mismatch`);
  const expectedGate = candidate.bytes < PHASE4R2_MAX_ASSET_BYTES ? "PASS" : "FAIL";
  assertAuthority(candidate.cloudflareGate === expectedGate && candidate.machineStatus === (expectedGate === "PASS" ? "PASS" : "SIZE_REJECTED") && candidate.operationalTarget === (candidate.bytes <= 24 * 1024 * 1024 ? "PASS" : "ABOVE_24_MIB_HEADROOM_TARGET") && candidate.decode === "PASS" && candidate.container?.status === "PASS" && candidate.seeking?.status === "PASS" && candidate.metadata?.privacy === "PASS", `${id} machine validation/status mismatch`);
  const expectedKeyframes = Array.from({ length: Math.ceil(FRAME_COUNT / 12) }, (_unused, index) => 1 + index * 12).filter((frame) => frame <= FRAME_COUNT);
  assertAuthority(candidate.probe?.codec === candidate.codec && same(candidate.probe?.resolution, [authority.width, authority.height]) && candidate.probe?.pixelFormat === "yuv420p" && candidate.probe?.fps === "30/1" && candidate.probe?.frames === FRAME_COUNT && Math.abs(candidate.probe?.durationSeconds - DURATION_SECONDS) <= 0.0011 && candidate.probe?.color?.range === "tv" && candidate.probe?.color?.space === "bt709" && candidate.probe?.color?.transfer === "bt709" && candidate.probe?.color?.primaries === "bt709" && same(candidate.keyframes, expectedKeyframes), `${id} probe/keyframe authority mismatch`);
  const expectedOutput = new RegExp(`^<EXTERNAL_ROOT>/media-production/candidates/${family}/${id}/${id}\\.partial-[0-9a-f-]{36}\\.${codec.extension}$`, "i");
  const argv = candidate.argv;
  assertAuthority(Array.isArray(argv) && hex256(candidate.argvSha256) && sha256(Buffer.from(canonical(argv))) === candidate.argvSha256 && expectedOutput.test(argv.at(-1) ?? "") && same(argv, buildPhase4R2CanonicalEncodeArgv({ family, codec: candidate.codec, crf, output: argv.at(-1) })), `${id} exact canonical encode argv mismatch`);
  assertAuthority(candidate.settingsAuthoritySha256 === PHASE4R2_SETTINGS_AUTHORITIES[codec.settings].sha256 && same(candidate.visual, visual) && candidate.selected === selectedIds.has(id), `${id} settings/visual/selection authority mismatch`);
  const metrics = candidate.metrics;
  const critical = ["F001", "F166", "F285", "F370", "F480", "F500"];
  const ranges = ["approachF450F500", "currentF150F180", "qF360F390"];
  assertAuthority(metrics?.status === "PASS" && metrics.comparisonSpace === "display-referred full-range gbrp16le" && metricValue(metrics.aggregate?.ssim, "ssim") && metricValue(metrics.aggregate?.psnrDb, "psnr") && same(Object.keys(metrics.criticalFrames ?? {}).sort(), critical) && critical.every((key) => metricValue(metrics.criticalFrames[key]?.ssim, "ssim") && metricValue(metrics.criticalFrames[key]?.psnrDb, "psnr")) && same(Object.keys(metrics.ranges ?? {}).sort(), ranges) && ranges.every((key) => metricValue(metrics.ranges[key]?.ssim, "ssim") && metricValue(metrics.ranges[key]?.psnrDb, "psnr")) && Array.isArray(metrics.perFrame) && metrics.perFrame.length === FRAME_COUNT && metrics.perFrame.every((entry, index) => entry.frame === index + 1 && metricValue(entry.ssim, "ssim") && metricValue(entry.psnrDb, "psnr")), `${id} 500-frame quality metrics authority mismatch`);
  assertAuthority(visual?.sha256 === candidate.sha256 && visual?.bytes === candidate.bytes && visual?.masterFrameManifestSha256 === frameManifestSha256 && visual?.settingsAuthoritySha256 === candidate.settingsAuthoritySha256 && visual?.argvSha256 === candidate.argvSha256 && REQUIRED_VISUAL_FIELDS.every((field) => ["PASS", "FAIL"].includes(visual[field])), `${id} visual verdict byte/master/settings/argv mismatch`);
}

function assertReportGraph(manifest, records, frameRecords, videos, posters) {
  const get = (relative) => { const record = records.get(relative); assertAuthority(Boolean(record), `missing required authority report ${relative}`); return record; };
  const selectionRecord = get("manifests/phase-4r2-media-selection.json");
  const qualityRecord = get("reports/phase-4r2-encode-quality-report.json");
  const masterRecord = get("reports/phase-4r2-master-visual-verdict.json");
  const encodeRecord = get("reports/phase-4r2-encode-visual-verdict.json");
  const completionRecord = get("reports/phase-4r2-frame-completion-audit.json");
  const posterRecord = get("reports/phase-4r2-poster-validation-report.json");
  const selection = selectionRecord.json;
  const quality = qualityRecord.json;
  const master = masterRecord.json;
  const encode = encodeRecord.json;
  const completion = completionRecord.json;
  const posterReport = posterRecord.json;

  assertAuthority(selectionRecord.sha256 === manifest.selectionSha256, "media-selection report SHA-256 differs from the production manifest");
  assertAuthority(qualityRecord.sha256 === manifest.qualityReportSha256, "encode-quality report SHA-256 differs from the production manifest");
  assertAuthority(masterRecord.sha256 === manifest.masterVisualVerdictSha256, "master-verdict SHA-256 differs from the production manifest");
  assertAuthority(encodeRecord.sha256 === manifest.encodeVisualVerdictSha256, "encode-verdict SHA-256 differs from the production manifest");
  assertAuthority(selection.schema === "quantum-hub.phase-4-r2.media-selection.v1" && selection.sourceBlendSha256 === PHASE4R2_SOURCE_BLEND_SHA256 && selection.status === "PASS" && hex256(selection.selectionInputSha256) && selection.selectionInputSha256 === quality.selectionInputSha256 && selection.qualityReportSha256 === qualityRecord.sha256 && selection.masterVisualVerdictSha256 === masterRecord.sha256 && selection.encodeVisualVerdictSha256 === encodeRecord.sha256 && same(selection.deliveryResolutionDecisions, PHASE4R2_DELIVERY_DECISIONS) && Array.isArray(selection.assets) && selection.assets.length === 6, "media-selection report is not the complete final authority");
  assertAuthority(quality.schema === "quantum-hub.phase-4-r2.encode-quality-report.v1" && quality.sourceBlendSha256 === PHASE4R2_SOURCE_BLEND_SHA256 && quality.status === "SELECTED_VISUAL_PASS" && quality.toolchain?.ffmpeg?.sha256 === FFMPEG_SHA256 && quality.toolchain?.ffprobe?.sha256 === FFPROBE_SHA256 && quality.toolchain?.sharp?.version === "0.35.3" && same(quality.settingsAuthorities, PHASE4R2_SETTINGS_AUTHORITIES) && same(Object.keys(quality.families ?? {}).sort(), Object.keys(PHASE4R2_FAMILIES).sort()) && quality.masterVisualVerdictSha256 === masterRecord.sha256 && quality.masterVisualVerdictBytes === masterRecord.bytes && quality.encodeVisualVerdictSha256 === encodeRecord.sha256 && quality.encodeVisualVerdictBytes === encodeRecord.bytes && encode.qualityReportSha256 === quality.selectionInputSha256, "encode-quality/verdict report authority mismatch");
  assertAuthority(master.schema === "quantum-hub.phase-4-r2.master-visual-verdict.v1" && master.sourceBlendSha256 === PHASE4R2_SOURCE_BLEND_SHA256 && same(Object.keys(master.families ?? {}).sort(), Object.keys(PHASE4R2_FAMILIES).sort()), "master visual verdict authority mismatch");
  assertAuthority(encode.schema === "quantum-hub.phase-4-r2.encode-visual-verdict.v1" && encode.sourceBlendSha256 === PHASE4R2_SOURCE_BLEND_SHA256, "encode visual verdict authority mismatch");
  assertAuthority(completion.schema === "quantum-hub.phase-4-r2.frame-completion-audit.v1" && completion.sourceBlendSha256 === PHASE4R2_SOURCE_BLEND_SHA256 && completion.toolchain?.ffmpeg?.sha256 === FFMPEG_SHA256 && completion.toolchain?.ffprobe?.sha256 === FFPROBE_SHA256 && completion.toolchain?.sharp?.version === "0.35.3" && completion.status === "PASS", "frame-completion audit authority mismatch");
  assertAuthority(posterReport.schema === "quantum-hub.phase-4-r2.poster-validation-report.v1" && posterReport.sourceBlendSha256 === PHASE4R2_SOURCE_BLEND_SHA256 && posterReport.status === "PASS" && same(Object.keys(posterReport.families ?? {}).sort(), Object.keys(PHASE4R2_FAMILIES).sort()), "poster-validation report authority mismatch");
  const settingsByCodec = {};
  for (const [name, settings] of Object.entries(quality.settingsAuthorities ?? {})) {
    assertAuthority(hex256(settings?.sha256) && sha256(Buffer.from(canonical(settings.value))) === settings.sha256, `quality settings authority ${name} is not self-consistent`);
  }
  for (const codec of Object.keys(CODECS)) settingsByCodec[codec] = quality.settingsAuthorities?.[CODECS[codec].settings]?.sha256;

  const expectedCandidateIds = [];
  for (const family of Object.keys(PHASE4R2_FAMILIES)) {
    const frameRecord = frameRecords[family];
    const familyQuality = quality.families?.[family];
    const selectedByFamily = selection.assets.filter((asset) => asset.family === family);
    const manifestVideos = videos.filter((asset) => asset.family === family);
    assertAuthority(familyQuality && Array.isArray(familyQuality.candidates) && familyQuality.candidates.length === 6 && exactKeys(familyQuality.selection, ["h264", "vp9"]) && selectedByFamily.length === 2 && manifestVideos.length === 2 && familyQuality.masterFrameManifestSha256 === frameRecord.sha256 && familyQuality.masterVisualVerdictSha256 === masterRecord.sha256 && familyQuality.masterVisualVerdictBytes === masterRecord.bytes && same(familyQuality.deliveryDecision, PHASE4R2_DELIVERY_DECISIONS[family]), `${family} quality/selection family authority mismatch`);
    const selectedCandidateIds = new Set(Object.values(familyQuality.selection ?? {}));
    for (const candidate of familyQuality.candidates) assertQualityCandidate(candidate, family, frameRecord.sha256, encode.candidates?.[candidate.id], selectedCandidateIds);
    const masterState = master.families?.[family];
    assertAuthority(masterState?.settingsSha256 === PHASE4R2_FAMILIES[family].settingsSha256 && masterState.masterFrameManifestSha256 === frameRecord.sha256 && same(masterState.visualSampleFrames, VISUAL_SAMPLE_FRAMES) && masterState.pilot === "PASS" && masterState.temporal === "PASS" && masterState.finalVisualSample === "PASS", `${family} master visual verdict is not an explicit complete PASS`);
    const completionState = completion.families?.[family];
    assertAuthority(completionState?.status === "PASS" && completionState.manifest?.bytes === frameRecord.bytes && completionState.manifest?.sha256 === frameRecord.sha256 && completionState.manifest?.deterministicTwoRunCheck === "PASS" && completionState.inventory?.expected === FRAME_COUNT && completionState.inventory?.valid === FRAME_COUNT && completionState.inventory?.missing === 0 && completionState.inventory?.duplicate === 0 && completionState.inventory?.extra === 0 && completionState.fullPngDecode === "PASS" && completionState.independentFfmpegDecode === "PASS" && completionState.ledgerParity === "PASS", `${family} completion audit does not bind the stable frame manifest`);
    for (const codec of Object.keys(CODECS)) {
      const ids = ["high", "balanced", "smaller"].map((qualityLevel) => `${family}-${codec}-${qualityLevel}`);
      expectedCandidateIds.push(...ids);
      assertAuthority(ids.every((id) => familyQuality.candidates.some((candidate) => candidate.id === id)), `${family} ${codec} quality ladder is incomplete`);
      const selected = selectedByFamily.find((asset) => asset.codec === codec);
      const video = manifestVideos.find((asset) => asset.codec === codec);
      const candidate = familyQuality.candidates.find((item) => item.id === selected?.candidateId);
      const visual = encode.candidates?.[selected?.candidateId];
      const smallestPassing = familyQuality.candidates.filter((item) => item.codec === codec && item.machineStatus === "PASS" && item.cloudflareGate === "PASS" && REQUIRED_VISUAL_FIELDS.every((field) => item.visual?.[field] === "PASS")).sort((left, right) => left.bytes - right.bytes || left.crf - right.crf)[0];
      assertAuthority(Boolean(selected && video && candidate && visual), `${family}:${codec} selected authority is incomplete`);
      assertAuthority(smallestPassing?.id === selected.candidateId && familyQuality.selection?.[codec] === selected.candidateId && candidate.selected === true && candidate.machineStatus === "PASS" && candidate.cloudflareGate === "PASS" && selected.kind === "video" && selected.file === path.posix.basename(video.file) && selected.externalRelativePath === `candidates/${family}/${candidate.id}/${candidate.file}` && same(selected.deliveryDecision, PHASE4R2_DELIVERY_DECISIONS[family]) && selected.bytes === video.bytes && selected.sha256 === video.sha256 && same(selected.resolution, video.resolution) && selected.masterFrameManifestSha256 === frameRecord.sha256 && selected.settingsAuthority === CODECS[codec].settings && selected.settingsAuthoritySha256 === video.encode.settingsAuthoritySha256 && selected.settingsAuthoritySha256 === settingsByCodec[codec] && same(selected.settings, video.encode.settings) && selected.commonSettingsAuthoritySha256 === video.encode.commonSettingsAuthoritySha256 && selected.commonSettingsAuthoritySha256 === quality.settingsAuthorities.common.sha256 && selected.argvSha256 === video.encode.argvSha256 && same(selected.argv, video.encode.argv) && selected.crf === video.encode.crf && selected.qualityLevel === video.encode.qualityLevel && same(selected.quality, video.quality) && selected.selectionReason === video.selectionReason && candidate.file === selected.file && candidate.bytes === selected.bytes && candidate.sha256 === selected.sha256 && candidate.settingsAuthoritySha256 === selected.settingsAuthoritySha256 && candidate.argvSha256 === selected.argvSha256 && same(candidate.metrics?.aggregate, video.quality), `${family}:${codec} video/selection/quality binding mismatch`);
      assertAuthority(visual.sha256 === video.sha256 && visual.bytes === video.bytes && visual.masterFrameManifestSha256 === frameRecord.sha256 && visual.settingsAuthoritySha256 === video.encode.settingsAuthoritySha256 && visual.argvSha256 === video.encode.argvSha256 && REQUIRED_VISUAL_FIELDS.every((field) => visual[field] === "PASS"), `${family}:${codec} selected encode verdict is not a complete exact-byte PASS`);
    }
    const determinismRecord = get(`reports/phase-4r2-${family}-codec-determinism.json`);
    const manifestDeterminism = manifest.codecDeterminismReports?.[family];
    assertAuthority(exactKeys(manifestDeterminism, ["bytes", "sha256"]) && manifestDeterminism.bytes === determinismRecord.bytes && manifestDeterminism.sha256 === determinismRecord.sha256 && familyQuality.codecDeterminismReportBytes === determinismRecord.bytes && familyQuality.codecDeterminismReportSha256 === determinismRecord.sha256, `${family} determinism report bytes/SHA binding mismatch`);
    assertDeterminismReport(determinismRecord, family, frameRecord.sha256, settingsByCodec);
    const poster = posters.find((asset) => asset.family === family);
    const posterState = posterReport.families?.[family];
    const posterMetrics = Object.values(posterState?.comparisons ?? {});
    assertAuthority(posterState?.status === "PASS" && posterState.file === path.posix.basename(poster.file) && posterState.externalRelativePath === `posters/${family}/${posterState.file}` && posterState.bytes === poster.bytes && posterState.sha256 === poster.sha256 && posterState.masterF1Sha256 === poster.masterF1Sha256 && posterState.masterFrameManifestSha256 === frameRecord.sha256 && posterState.derivationAuthoritySha256 === poster.derivationAuthoritySha256 && same(posterState.derivationAuthority, poster.derivationAuthority) && same(posterState.resolution, poster.resolution) && posterState.probe?.codec_name === "png" && posterState.probe?.codec_type === "video" && posterState.probe?.width === PHASE4R2_FAMILIES[family].width && posterState.probe?.height === PHASE4R2_FAMILIES[family].height && posterState.probe?.pix_fmt === "rgb24" && posterState.probe?.color_range === "pc" && posterState.probe?.color_space === "gbr" && posterState.probe?.color_transfer === "iec61966-2-1" && posterState.probe?.color_primaries === "bt709" && same(Object.keys(posterState.comparisons ?? {}).sort(), ["decodedH264F1", "decodedVP9F1", "masterF1"]) && posterMetrics.every((metric) => metric.status === "PASS" && (metric.rgbPsnrDb === "inf" || Number.isFinite(metric.rgbPsnrDb) && metric.rgbPsnrDb >= 30) && Number.isFinite(metric.lumaGlobalSsim) && metric.lumaGlobalSsim >= 0.98 && metric.lumaGlobalSsim <= 1), `${family} poster report binding mismatch`);
  }
  assertAuthority(same(Object.keys(encode.candidates ?? {}).sort(), expectedCandidateIds.sort()), "encode verdict must bind the exact 18-candidate ladder");
  for (const family of Object.keys(PHASE4R2_FAMILIES)) {
    for (const candidate of quality.families[family].candidates) {
      const visual = encode.candidates[candidate.id];
      assertAuthority(Boolean(visual) && same(candidate.visual, visual) && visual.sha256 === candidate.sha256 && visual.bytes === candidate.bytes && visual.masterFrameManifestSha256 === frameRecords[family].sha256 && visual.settingsAuthoritySha256 === candidate.settingsAuthoritySha256 && visual.argvSha256 === candidate.argvSha256 && REQUIRED_VISUAL_FIELDS.every((field) => ["PASS", "FAIL"].includes(visual[field])), `${candidate.id} visual verdict is not bound to its exact candidate authority`);
    }
  }
  return {
    mediaSelection: { path: selectionRecord.relative, bytes: selectionRecord.bytes, sha256: selectionRecord.sha256 },
    encodeQuality: { path: qualityRecord.relative, bytes: qualityRecord.bytes, sha256: qualityRecord.sha256 },
    masterVisualVerdict: { path: masterRecord.relative, bytes: masterRecord.bytes, sha256: masterRecord.sha256 },
    encodeVisualVerdict: { path: encodeRecord.relative, bytes: encodeRecord.bytes, sha256: encodeRecord.sha256 },
    codecDeterminism: Object.fromEntries(Object.keys(PHASE4R2_FAMILIES).map((family) => { const record = get(`reports/phase-4r2-${family}-codec-determinism.json`); return [family, { path: record.relative, bytes: record.bytes, sha256: record.sha256 }]; })),
  };
}

export function validatePhase4R2AuthorityRecords(records) {
  const manifestRecord = records.get(PHASE4R2_MANIFEST_RELATIVE);
  assertAuthority(Boolean(manifestRecord?.json), `missing ${PHASE4R2_MANIFEST_RELATIVE}`);
  const manifest = manifestRecord.json;
  assertAuthority(exactKeys(manifest, TOP_LEVEL_KEYS), "production manifest has unexpected/missing keys (including a prohibited self-hash)");
  assertAuthority(manifest.schema === "quantum-hub.phase-4-r2.production-media-manifest.v1", "production manifest schema mismatch");
  assertAuthority(manifest.sourceBlendSha256 === PHASE4R2_SOURCE_BLEND_SHA256, "production manifest source Blender SHA-256 mismatch");
  assertAuthority(exactKeys(manifest.physicalTimeline, ["durationRational", "fps", "frames"]) && manifest.physicalTimeline.frames === FRAME_COUNT && manifest.physicalTimeline.fps === FPS && manifest.physicalTimeline.durationRational === "50/3", "physical timeline must be exactly 500 frames / 30 fps / 50/3 seconds");
  assertAuthority(exactKeys(manifest.authorization, ["mergeMain", "phase5"]) && manifest.authorization.mergeMain === false && manifest.authorization.phase5 === false, "merge-to-main and Phase 5 must both remain explicitly denied");
  assertAuthority(same(manifest.deliveryResolutionDecisions, PHASE4R2_DELIVERY_DECISIONS), "three-family delivery decisions mismatch");
  assertAuthority(exactKeys(manifest.codecDeterminismReports, Object.keys(PHASE4R2_FAMILIES)), "codec determinism report family set mismatch");
  assertAuthority(Array.isArray(manifest.assets) && manifest.assets.length === 9, "manifest must declare exactly nine runtime assets");
  const videos = manifest.assets.filter((asset) => asset.kind === "video");
  const posters = manifest.assets.filter((asset) => asset.kind === "poster");
  const expectedVideoKeys = Object.keys(PHASE4R2_FAMILIES).flatMap((family) => Object.keys(CODECS).map((codec) => `${family}:${codec}`)).sort();
  assertAuthority(videos.length === 6 && same(videos.map((asset) => `${asset.family}:${asset.codec}`).sort(), expectedVideoKeys), "video inventory is not the exact three-family/two-codec Cartesian product");
  assertAuthority(posters.length === 3 && same(posters.map((asset) => asset.family).sort(), Object.keys(PHASE4R2_FAMILIES).sort()), "poster inventory is not exactly one per family");
  assertAuthority(new Set(manifest.assets.map((asset) => asset.file)).size === 9, "runtime asset paths are duplicated");
  const frameRecords = {};
  for (const family of Object.keys(PHASE4R2_FAMILIES)) {
    const relative = `manifests/phase-4r2-${family}-frame-manifest.json`;
    const record = records.get(relative);
    assertAuthority(Boolean(record), `missing ${relative}`);
    assertFrameManifest(record, family);
    frameRecords[family] = record;
  }
  for (const asset of manifest.assets) {
    assertAssetBasics(asset);
    const payloadRecord = records.get(asset.file);
    assertAuthority(Boolean(payloadRecord), `missing runtime payload ${asset.file}`);
    assertAuthority(payloadRecord.bytes === asset.bytes && payloadRecord.sha256 === asset.sha256, `${asset.file} payload bytes/SHA-256 mismatch`);
    const frameManifest = frameRecords[asset.family];
    assertAuthority(asset.masterFrameManifestSha256 === frameManifest.sha256, `${asset.file} master-frame-manifest binding mismatch`);
    if (asset.kind === "video") {
      const codec = CODECS[asset.codec];
      assertAuthority(asset.frames === FRAME_COUNT && asset.fps === FPS && Math.abs(asset.durationSeconds - DURATION_SECONDS) <= 1e-12, `${asset.file} frame/fps/duration mismatch`);
      assertAuthority(exactKeys(asset.sourceMaster, ["family", "format", "frameRange", "resolution", "sequenceSha256", "totalBytes"]) && asset.sourceMaster.family === asset.family && asset.sourceMaster.format === "16-bit RGB PNG sequence" && same(asset.sourceMaster.frameRange, [1, FRAME_COUNT]) && same(asset.sourceMaster.resolution, asset.masterResolution) && asset.sourceMaster.sequenceSha256 === frameManifest.json.master.sequenceSha256 && asset.sourceMaster.totalBytes === frameManifest.json.master.totalBytes, `${asset.file} source-master binding mismatch`);
      const crfs = asset.codec === "vp9" ? { high: 20, balanced: 24, smaller: 28 } : { high: 16, balanced: 19, smaller: 22 };
      const encodedOutputBasename = path.posix.basename(asset.encode?.argv?.at(-1)?.replaceAll("\\", "/") ?? "");
      const expectedReceiptOutput = new RegExp(`^${asset.family}-${asset.codec}-${asset.encode?.qualityLevel}\\.partial-[0-9a-f-]{36}\\.${codec.extension}$`, "i");
      assertAuthority(asset.encode?.settingsAuthority === codec.settings && hex256(asset.encode.settingsAuthoritySha256) && sha256(Buffer.from(canonical(asset.encode.settings))) === asset.encode.settingsAuthoritySha256 && hex256(asset.encode.commonSettingsAuthoritySha256) && Array.isArray(asset.encode.argv) && asset.encode.argv.every((entry) => typeof entry === "string") && sha256(Buffer.from(canonical(asset.encode.argv))) === asset.encode.argvSha256 && asset.encode.argv[0] === "<FFMPEG>" && optionValue(asset.encode.argv, "-c:v") === codec.encoder && optionValue(asset.encode.argv, "-frames:v") === String(FRAME_COUNT) && optionValue(asset.encode.argv, "-framerate") === String(FPS) && optionValue(asset.encode.argv, "-r") === String(FPS) && optionValue(asset.encode.argv, "-fps_mode") === "cfr" && optionValue(asset.encode.argv, "-pix_fmt") === "yuv420p" && optionValue(asset.encode.argv, "-f") === codec.container && expectedReceiptOutput.test(encodedOutputBasename) && asset.encode.crf === crfs[asset.encode.qualityLevel], `${asset.file} encode settings/argv/container authority mismatch`);
      assertVideoContainer(payloadRecord.payload, asset.codec, asset.file);
    } else {
      const derivation = expectedPosterDerivation(asset.family);
      assertAuthority(asset.masterF1Sha256 === frameManifest.json.frames[0].sha256 && same(asset.derivationAuthority, derivation) && asset.derivationAuthoritySha256 === sha256(Buffer.from(canonical(derivation))), `${asset.file} F1/derivation authority mismatch`);
      assertPng(payloadRecord.payload, asset.resolution[0], asset.resolution[1], asset.file);
    }
  }
  const authorityReports = assertReportGraph(manifest, records, frameRecords, videos, posters);
  return { manifest, manifestRecord: { path: manifestRecord.relative, bytes: manifestRecord.bytes, sha256: manifestRecord.sha256 }, assets: manifest.assets, authorityReports, expectedAuthorityPaths: [...PHASE4R2_FIXED_AUTHORITY_PATHS, ...manifest.assets.map((asset) => asset.file)].sort() };
}

export async function validatePhase4R2SourceBlend({ repositoryRoot }) {
  const absolute = path.resolve(repositoryRoot, ...PHASE4R2_SOURCE_BLEND_RELATIVE.split("/"));
  const info = await regularFile(absolute, "Phase 4-R2 frozen R1.1 Blender source");
  const payload = await readFile(absolute);
  assertAuthority(info.size === PHASE4R2_SOURCE_BLEND_BYTES && payload.length === PHASE4R2_SOURCE_BLEND_BYTES && sha256(payload) === PHASE4R2_SOURCE_BLEND_SHA256, "frozen R1.1 Blender source bytes/SHA-256 mismatch");
  return { path: PHASE4R2_SOURCE_BLEND_RELATIVE, bytes: payload.length, sha256: PHASE4R2_SOURCE_BLEND_SHA256 };
}

export async function loadAndValidatePhase4R2Authority({ authorityRoot, repositoryRoot = path.resolve(authorityRoot, "..", "..", "..") }) {
  const rootInfo = await lstat(authorityRoot);
  assertAuthority(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), "authority root must be a real directory, not a symlink");
  const sourceBlend = await validatePhase4R2SourceBlend({ repositoryRoot });
  const manifestAbsolute = under(authorityRoot, PHASE4R2_MANIFEST_RELATIVE);
  await regularFile(manifestAbsolute, "Phase 4-R2 production manifest");
  const manifestPayload = await readFile(manifestAbsolute);
  const manifestRecord = jsonRecord(PHASE4R2_MANIFEST_RELATIVE, manifestPayload);
  const manifest = manifestRecord.json;
  assertAuthority(Array.isArray(manifest.assets), "production manifest assets must be an array");
  const preliminaryPaths = manifest.assets.map((asset) => { assertAuthority(asset && typeof asset.file === "string", "production manifest asset path is missing"); relativeParts(asset.file); return asset.file; });
  const expectedPaths = [...PHASE4R2_FIXED_AUTHORITY_PATHS, ...preliminaryPaths].sort();
  assertAuthority(new Set(expectedPaths).size === expectedPaths.length, "authority paths are duplicated");
  const observedPaths = await filesUnder(authorityRoot);
  assertAuthority(same(observedPaths, expectedPaths), `tracked authority inventory mismatch: observed ${observedPaths.join(", ")}`);
  const records = await loadRecords(authorityRoot, expectedPaths);
  return { ...validatePhase4R2AuthorityRecords(records), records, authorityRoot, sourceBlend };
}

async function exactCopy(authorityRoot, tempRoot, record) {
  const source = under(authorityRoot, record.file);
  await regularFile(source, `Phase 4-R2 authority ${record.file}`);
  const payload = await readFile(source);
  if (payload.length !== record.bytes || sha256(payload) !== record.sha256) throw new Error(`Phase 4-R2 authority mismatch: ${record.file}`);
  const destination = under(tempRoot, record.file);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
  const copied = await readFile(destination);
  if (copied.length !== record.bytes || sha256(copied) !== record.sha256) throw new Error(`Phase 4-R2 runtime copy mismatch: ${record.file}`);
}

async function reconcile(authorityRoot, outputRoot, records) {
  const outputParent = path.dirname(outputRoot);
  await mkdir(outputParent, { recursive: true });
  const tempRoot = path.join(outputParent, `.phase-4r2-stage-${process.pid}-${randomUUID()}`);
  const backupRoot = path.join(outputParent, `.phase-4r2-backup-${process.pid}-${randomUUID()}`);
  try {
    for (const record of records) await exactCopy(authorityRoot, tempRoot, record);
    if (!same(await filesUnder(tempRoot), records.map(({ file }) => file).sort())) throw new Error("Phase 4-R2 temporary runtime tree has an unexpected inventory");
    let hadOutput = false;
    try { await stat(outputRoot); hadOutput = true; } catch (error) { if (error?.code !== "ENOENT") throw error; }
    if (hadOutput) await rename(outputRoot, backupRoot);
    try {
      await rename(tempRoot, outputRoot);
      if (hadOutput) await rm(backupRoot, { recursive: true, force: true });
    } catch (error) {
      try { await stat(outputRoot); await rm(outputRoot, { recursive: true, force: true }); } catch {}
      if (hadOutput) await rename(backupRoot, outputRoot);
      throw error;
    }
  } catch (error) {
    await rm(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

async function removeStaleOutput(outputRoot) {
  try { await lstat(outputRoot); await rm(outputRoot, { recursive: true, force: true }); console.log("Removed stale Phase 4-R2 runtime media because final authority is unavailable."); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}

export async function stagePhase4R2RuntimeMedia({ root = process.cwd(), finalAuthorityExpected = process.env.PHASE4R2_FINAL_AUTHORITY === "1" } = {}) {
  const authorityRoot = path.resolve(root, ...PHASE4R2_AUTHORITY_RELATIVE.split("/"));
  const outputRoot = path.resolve(root, ...PHASE4R2_OUTPUT_RELATIVE.split("/"));
  try { await regularFile(under(authorityRoot, PHASE4R2_MANIFEST_RELATIVE), "Phase 4-R2 production manifest"); }
  catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await removeStaleOutput(outputRoot);
    if (finalAuthorityExpected) throw new Error("Phase 4-R2 final media authority is required but not staged");
    console.log("Phase 4-R2 final media authority is not staged; runtime will use accepted dormant development posters.");
    return null;
  }
  const authority = await loadAndValidatePhase4R2Authority({ authorityRoot, repositoryRoot: root });
  const manifestRecord = authority.records.get(PHASE4R2_MANIFEST_RELATIVE);
  const runtimeRecords = [{ file: PHASE4R2_MANIFEST_RELATIVE, bytes: manifestRecord.bytes, sha256: manifestRecord.sha256 }, ...authority.assets.map((asset) => ({ file: asset.file, bytes: asset.bytes, sha256: asset.sha256 }))];
  await reconcile(authorityRoot, outputRoot, runtimeRecords);
  console.log(`Staged exactly ${runtimeRecords.length} hash-verified Phase 4-R2 runtime files from one complete source/report/media authority graph.`);
  return authority;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) await stagePhase4R2RuntimeMedia();
