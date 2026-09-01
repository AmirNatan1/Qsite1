import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { deflateSync } from "node:zlib";

import ts from "typescript";
import {
  PHASE4R2_DELIVERY_DECISIONS,
  PHASE4R2_FAMILIES,
  PHASE4R2_AUTHORITY_RELATIVE,
  PHASE4R2_MANIFEST_RELATIVE,
  PHASE4R2_SETTINGS_AUTHORITIES,
  PHASE4R2_SOURCE_BLEND_RELATIVE,
  PHASE4R2_SOURCE_BLEND_SHA256,
  PHASE4R21_AUTHORITY_RELATIVE,
  PHASE4R21_MANIFEST_RELATIVE,
  PHASE4R21_OUTPUT_RELATIVE,
  PHASE4R21_SOURCE_BLEND_RELATIVE,
  buildPhase4R2CanonicalEncodeArgv,
  loadAndValidatePhase4R21Authority,
  stagePhase4R2RuntimeMedia,
  validatePhase4R2AuthorityRecords,
} from "../scripts/stage-phase4r2-runtime-media.mjs";
import {
  BOUNDARY_REPORT_SHA256,
  FAMILIES as PHASE4R21_FAMILIES,
  SOURCE_SHA256 as PHASE4R21_SOURCE_BLEND_SHA256,
  activePosterRelativePath,
  activeVideoRelativePath,
  buildActiveFrameManifest,
  buildActiveProductionManifest,
} from "../scripts/phase4r2-1-production.mjs";

function loadRuntime() {
  const filename = path.join(process.cwd(), "src", "scripts", "home-cinematic-integration.ts");
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("module", "exports", output)(module, module.exports);
  return module.exports;
}

const digest = (value) => createHash("sha256").update(value).digest("hex");
const stableValue = (value) => Array.isArray(value)
  ? value.map(stableValue)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
    : value;
const canonical = (value) => JSON.stringify(stableValue(value));
const recordJson = (relative, json) => {
  const payload = Buffer.from(`${JSON.stringify(json, null, 2)}\n`);
  return { relative, json, payload, bytes: payload.length, sha256: digest(payload) };
};
const recordBinary = (relative, payload) => ({ relative, payload, bytes: payload.length, sha256: digest(payload) });
const visualFields = { darkGradientBanding: "PASS", exactQ: "PASS", graphiteCurrent: "PASS", wallShadows: "PASS", portalBlack: "PASS", overall: "PASS" };
const visualSampleFrames = [...new Set([1, ...Array.from({ length: 20 }, (_unused, index) => (index + 1) * 25), 76, 106, 150, 166, 180, 225, 285, 320, 356, 360, 370, 390, 405, 450, 480])].sort((left, right) => left - right);
const crc32Table = Array.from({ length: 256 }, (_unused, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});
const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = (crc >>> 8) ^ crc32Table[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
};
const pngCache = new Map();

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

function pngFixture(width, height, suffix) {
  const key = `${width}x${height}:${suffix}`;
  if (pngCache.has(key)) return pngCache.get(key);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const decoded = Buffer.alloc((width * 3 + 1) * height);
  Buffer.from(suffix).copy(decoded, 1, 0, Math.min(Buffer.byteLength(suffix), width * 3));
  const payload = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk("IHDR", header), pngChunk("IDAT", deflateSync(decoded, { level: 9 })), pngChunk("IEND", Buffer.alloc(0))]);
  pngCache.set(key, payload);
  return payload;
}

function videoFixture(codec, suffix) {
  if (codec === "vp9") return Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from(suffix)]);
  const payload = Buffer.alloc(16 + suffix.length);
  payload.writeUInt32BE(payload.length, 0);
  payload.write("ftyp", 4, "ascii");
  payload.write(suffix, 16, "utf8");
  return payload;
}

function posterDerivation(family) {
  const { width, height } = PHASE4R2_FAMILIES[family];
  const forward = `zscale=w=${width}:h=${height}:f=lanczos:rin=full:r=limited:min=gbr:m=bt709:tin=iec61966-2-1:t=bt709:pin=bt709:p=bt709:d=error_diffusion,format=yuv420p`;
  const reverse = `zscale=w=${width}:h=${height}:f=lanczos:rin=limited:r=full:min=bt709:m=gbr:tin=bt709:t=iec61966-2-1:pin=bt709:p=bt709:d=error_diffusion,format=gbrp`;
  return { sourceFrame: 1, sourceFormat: "16-bit RGB PNG", resolution: [width, height], filter: `${forward},${reverse}`, output: { codec: "png", bitDepth: 8, colorType: "RGB", alpha: false, compressionLevel: 9, prediction: "mixed" } };
}

function makeAuthorityFixture() {
  const records = new Map();
  const putJson = (relative, json) => { const record = recordJson(relative, json); records.set(relative, record); return record; };
  const putBinary = (relative, payload) => { const record = recordBinary(relative, payload); records.set(relative, record); return record; };
  const frameRecords = {};
  for (const [family, authority] of Object.entries(PHASE4R2_FAMILIES)) {
    const frames = Array.from({ length: 500 }, (_unused, index) => ({
      frame: index + 1,
      file: `F${String(index + 1).padStart(3, "0")}.png`,
      bytes: index + 1,
      sha256: digest(`${family}-F${index + 1}`),
      width: authority.width,
      height: authority.height,
      bitDepth: 16,
      colorType: 2,
    }));
    const sequence = frames.map((frame) => `${frame.frame}|${frame.file}|${frame.bytes}|${frame.sha256}|${frame.width}|${frame.height}|16|2\n`).join("");
    frameRecords[family] = putJson(`manifests/phase-4r2-${family}-frame-manifest.json`, {
      schema: "quantum-hub.phase-4-r2.frame-manifest.v1",
      family,
      source: { blendSha256: PHASE4R2_SOURCE_BLEND_SHA256, settingsSha256: authority.settingsSha256, camera: authority.camera },
      master: { resolution: [authority.width, authority.height], fps: 30, frameRange: [1, 500], frameCount: 500, totalBytes: frames.reduce((sum, frame) => sum + frame.bytes, 0), sequenceSha256: digest(sequence) },
      frames,
    });
  }
  const master = putJson("reports/phase-4r2-master-visual-verdict.json", {
    schema: "quantum-hub.phase-4-r2.master-visual-verdict.v1",
    sourceBlendSha256: PHASE4R2_SOURCE_BLEND_SHA256,
    families: Object.fromEntries(Object.keys(PHASE4R2_FAMILIES).map((family) => [family, { settingsSha256: PHASE4R2_FAMILIES[family].settingsSha256, masterFrameManifestSha256: frameRecords[family].sha256, visualSampleFrames, pilot: "PASS", temporal: "PASS", finalVisualSample: "PASS" }])),
  });
  const settings = structuredClone(PHASE4R2_SETTINGS_AUTHORITIES);
  const keyframes = Array.from({ length: Math.ceil(500 / 12) }, (_unused, index) => 1 + index * 12).filter((frame) => frame <= 500);
  const aggregate = { ssim: 0.99, psnrDb: 42 };
  const metrics = {
    aggregate,
    criticalFrames: Object.fromEntries(["F001", "F166", "F285", "F370", "F480", "F500"].map((frame) => [frame, aggregate])),
    ranges: Object.fromEntries(["currentF150F180", "qF360F390", "approachF450F500"].map((range) => [range, aggregate])),
    perFrame: Array.from({ length: 500 }, (_unused, index) => ({ frame: index + 1, ...aggregate })),
    comparisonSpace: "display-referred full-range gbrp16le",
    status: "PASS",
  };
  const assets = [];
  const selectionAssets = [];
  const qualityFamilies = {};
  const encodeCandidates = {};
  const posterStates = {};
  for (const [family, authority] of Object.entries(PHASE4R2_FAMILIES)) {
    const candidates = [];
    const selection = {};
    for (const codec of ["vp9", "h264"]) {
      const container = codec === "vp9" ? "webm" : "mp4";
      const settingsName = `${codec}-v1`;
      const payload = videoFixture(codec, `${family}-${codec}`);
      const payloadHash = digest(payload);
      const basename = `phase-4r2-${family}-${codec}-${payloadHash.slice(0, 12)}.${container}`;
      const receiptOutput = `<EXTERNAL_ROOT>/media-production/candidates/${family}/${family}-${codec}-high/${family}-${codec}-high.partial-00000000-0000-4000-8000-000000000000.${container}`;
      const argv = buildPhase4R2CanonicalEncodeArgv({ family, codec, crf: codec === "vp9" ? 20 : 16, output: receiptOutput });
      const argvSha256 = digest(canonical(argv));
      const quality = { ssim: 0.99, psnrDb: 42 };
      const reason = `selected ${family} ${codec}`;
      const crfs = codec === "vp9" ? { high: 20, balanced: 24, smaller: 28 } : { high: 16, balanced: 19, smaller: 22 };
      for (const qualityLevel of ["high", "balanced", "smaller"]) {
        const id = `${family}-${codec}-${qualityLevel}`;
        const selected = qualityLevel === "high";
        const candidateSha = selected ? payloadHash : digest(id);
        const candidateBytes = selected ? payload.length : 100 + candidates.length;
        const candidateOutput = `<EXTERNAL_ROOT>/media-production/candidates/${family}/${id}/${id}.partial-00000000-0000-4000-8000-000000000000.${container}`;
        const candidateArgv = buildPhase4R2CanonicalEncodeArgv({ family, codec, crf: crfs[qualityLevel], output: candidateOutput });
        const candidateArgvSha = digest(canonical(candidateArgv));
        const visual = { sha256: candidateSha, bytes: candidateBytes, masterFrameManifestSha256: frameRecords[family].sha256, settingsAuthoritySha256: settings[settingsName].sha256, argvSha256: candidateArgvSha, ...visualFields };
        const candidateFile = selected ? basename : `phase-4r2-${family}-${codec}-${candidateSha.slice(0, 12)}.${container}`;
        candidates.push({ id, codec, qualityLevel, crf: crfs[qualityLevel], file: candidateFile, externalRelativePath: `candidates/${family}/${id}/${candidateFile}`, bytes: candidateBytes, sha256: candidateSha, resolution: [authority.width, authority.height], settingsAuthoritySha256: settings[settingsName].sha256, argvSha256: candidateArgvSha, argv: candidateArgv, probe: { codec, profile: null, level: null, resolution: [authority.width, authority.height], pixelFormat: "yuv420p", fps: "30/1", frames: 500, durationSeconds: 50 / 3, color: { range: "tv", space: "bt709", transfer: "bt709", primaries: "bt709" } }, metadata: { privacy: "PASS" }, decode: "PASS", keyframes, container: { status: "PASS" }, seeking: { status: "PASS" }, metrics, cloudflareGate: "PASS", operationalTarget: "PASS", visual, selected, rejectionReason: selected ? null : `larger-than-selected:${family}-${codec}-high`, interruptedRunRecovery: null, machineStatus: "PASS" });
        encodeCandidates[id] = visual;
      }
      selection[codec] = `${family}-${codec}-high`;
      const video = {
        file: `media/${basename}`, kind: "video", family, codec, resolution: [authority.width, authority.height], masterResolution: [authority.width, authority.height], deliveryResolution: [authority.width, authority.height], deliveryDecision: PHASE4R2_DELIVERY_DECISIONS[family], fps: 30, frames: 500, durationSeconds: 50 / 3, bytes: payload.length, sha256: payloadHash,
        sourceMaster: { family, resolution: [authority.width, authority.height], frameRange: [1, 500], format: "16-bit RGB PNG sequence", sequenceSha256: frameRecords[family].json.master.sequenceSha256, totalBytes: frameRecords[family].json.master.totalBytes },
        masterFrameManifestSha256: frameRecords[family].sha256,
        encode: { settingsAuthority: settingsName, settingsAuthoritySha256: settings[settingsName].sha256, settings: settings[settingsName].value, commonSettingsAuthoritySha256: settings.common.sha256, argvSha256, argv, crf: crfs.high, qualityLevel: "high" },
        quality, selectionReason: reason,
      };
      assets.push(video);
      putBinary(video.file, payload);
      selectionAssets.push({ kind: "video", family, codec, candidateId: selection[codec], externalRelativePath: `candidates/${family}/${family}-${codec}-high/${basename}`, file: basename, bytes: payload.length, sha256: payloadHash, resolution: [authority.width, authority.height], deliveryDecision: PHASE4R2_DELIVERY_DECISIONS[family], masterFrameManifestSha256: frameRecords[family].sha256, settingsAuthority: settingsName, settingsAuthoritySha256: settings[settingsName].sha256, settings: settings[settingsName].value, commonSettingsAuthoritySha256: settings.common.sha256, argvSha256, argv, crf: crfs.high, qualityLevel: "high", selectionReason: reason, quality });
    }
    qualityFamilies[family] = { masterFrameManifestSha256: frameRecords[family].sha256, masterVisualVerdictSha256: master.sha256, masterVisualVerdictBytes: master.bytes, deliveryDecision: PHASE4R2_DELIVERY_DECISIONS[family], candidates, selection, codecDeterminismReportSha256: "", codecDeterminismReportBytes: 0 };
    const derivationAuthority = posterDerivation(family);
    const posterPayload = pngFixture(authority.width, authority.height, family);
    const posterHash = digest(posterPayload);
    const posterFile = `phase-4r2-${family}-poster-${posterHash.slice(0, 12)}.png`;
    const poster = { file: `posters/${posterFile}`, kind: "poster", family, resolution: [authority.width, authority.height], masterResolution: [authority.width, authority.height], deliveryResolution: [authority.width, authority.height], deliveryDecision: PHASE4R2_DELIVERY_DECISIONS[family], bytes: posterPayload.length, sha256: posterHash, masterF1Sha256: frameRecords[family].json.frames[0].sha256, masterFrameManifestSha256: frameRecords[family].sha256, derivationAuthority, derivationAuthoritySha256: digest(canonical(derivationAuthority)) };
    assets.push(poster);
    putBinary(poster.file, posterPayload);
    const probe = { codec_name: "png", codec_type: "video", width: authority.width, height: authority.height, pix_fmt: "rgb24", color_range: "pc", color_space: "gbr", color_transfer: "iec61966-2-1", color_primaries: "bt709" };
    const metric = { rgbPsnrDb: 42, lumaGlobalSsim: 0.99, status: "PASS" };
    posterStates[family] = { ...poster, file: posterFile, externalRelativePath: `posters/${family}/${posterFile}`, probe, comparisons: { masterF1: metric, decodedVP9F1: metric, decodedH264F1: metric }, status: "PASS" };
  }
  const selectionInputSha256 = digest("pre-selection-quality");
  const encode = putJson("reports/phase-4r2-encode-visual-verdict.json", { schema: "quantum-hub.phase-4-r2.encode-visual-verdict.v1", sourceBlendSha256: PHASE4R2_SOURCE_BLEND_SHA256, qualityReportSha256: selectionInputSha256, candidates: encodeCandidates });
  const determinism = {};
  for (const family of Object.keys(PHASE4R2_FAMILIES)) {
    const codecs = {};
    for (const codec of ["vp9", "h264"]) {
      const runSha = digest(`${family}-${codec}-run`);
      const run = (suffix) => {
        const basename = `${family}-${codec}-critical-${suffix}.${codec === "vp9" ? "webm" : "mp4"}`;
        const externalRelativePath = `determinism/${family}/run-00000000-0000-4000-8000-000000000000/${basename}`;
        const argv = buildPhase4R2CanonicalEncodeArgv({ family, codec, crf: codec === "vp9" ? 24 : 19, startFrame: 360, frameCount: 31, output: `<EXTERNAL_ROOT>/media-production/${externalRelativePath}` });
        return { basename, externalRelativePath, bytes: 10, sha256: runSha, argv, argvSha256: digest(canonical(argv)) };
      };
      codecs[codec] = { crf: codec === "vp9" ? 24 : 19, frames: [360, 390], settingsAuthoritySha256: settings[`${codec}-v1`].sha256, runs: [run("a"), run("b")], status: "PASS" };
    }
    determinism[family] = putJson(`reports/phase-4r2-${family}-codec-determinism.json`, { schema: "quantum-hub.phase-4-r2.codec-determinism.v1", sourceBlendSha256: PHASE4R2_SOURCE_BLEND_SHA256, family, masterFrameManifestSha256: frameRecords[family].sha256, toolchain: { ffmpegSha256: "72a489eccd008c2ec2c0a5856c5c75bc3d8bbfa90166c4566865c246445e6aa3", ffprobeSha256: "19202b23c0043f15ad1b7bce2344f406fd52bd6efd8f995ce02e7392a1cec52f" }, codecs, status: "PASS" });
    qualityFamilies[family].codecDeterminismReportSha256 = determinism[family].sha256;
    qualityFamilies[family].codecDeterminismReportBytes = determinism[family].bytes;
  }
  const toolchain = { ffmpeg: { sha256: "72a489eccd008c2ec2c0a5856c5c75bc3d8bbfa90166c4566865c246445e6aa3" }, ffprobe: { sha256: "19202b23c0043f15ad1b7bce2344f406fd52bd6efd8f995ce02e7392a1cec52f" }, sharp: { version: "0.35.3", libvips: "fixture" } };
  const quality = putJson("reports/phase-4r2-encode-quality-report.json", { schema: "quantum-hub.phase-4-r2.encode-quality-report.v1", sourceBlendSha256: PHASE4R2_SOURCE_BLEND_SHA256, toolchain, settingsAuthorities: settings, families: qualityFamilies, masterVisualVerdictSha256: master.sha256, masterVisualVerdictBytes: master.bytes, encodeVisualVerdictSha256: encode.sha256, encodeVisualVerdictBytes: encode.bytes, selectionInputSha256, status: "SELECTED_VISUAL_PASS" });
  const selection = putJson("manifests/phase-4r2-media-selection.json", { schema: "quantum-hub.phase-4-r2.media-selection.v1", sourceBlendSha256: PHASE4R2_SOURCE_BLEND_SHA256, selectionInputSha256, qualityReportSha256: quality.sha256, masterVisualVerdictSha256: master.sha256, encodeVisualVerdictSha256: encode.sha256, deliveryResolutionDecisions: PHASE4R2_DELIVERY_DECISIONS, assets: selectionAssets, status: "PASS" });
  putJson("reports/phase-4r2-poster-validation-report.json", { schema: "quantum-hub.phase-4-r2.poster-validation-report.v1", sourceBlendSha256: PHASE4R2_SOURCE_BLEND_SHA256, families: posterStates, status: "PASS" });
  putJson("reports/phase-4r2-frame-completion-audit.json", { schema: "quantum-hub.phase-4-r2.frame-completion-audit.v1", sourceBlendSha256: PHASE4R2_SOURCE_BLEND_SHA256, toolchain, families: Object.fromEntries(Object.keys(PHASE4R2_FAMILIES).map((family) => [family, { manifest: { basename: `phase-4r2-${family}-frame-manifest.json`, bytes: frameRecords[family].bytes, sha256: frameRecords[family].sha256, deterministicTwoRunCheck: "PASS" }, inventory: { expected: 500, valid: 500, missing: 0, duplicate: 0, extra: 0 }, fullPngDecode: "PASS", independentFfmpegDecode: "PASS", ledgerParity: "PASS", status: "PASS" }])), status: "PASS" });
  putJson(PHASE4R2_MANIFEST_RELATIVE, { schema: "quantum-hub.phase-4-r2.production-media-manifest.v1", sourceBlendSha256: PHASE4R2_SOURCE_BLEND_SHA256, physicalTimeline: { frames: 500, fps: 30, durationRational: "50/3" }, selectionSha256: selection.sha256, qualityReportSha256: quality.sha256, masterVisualVerdictSha256: master.sha256, encodeVisualVerdictSha256: encode.sha256, deliveryResolutionDecisions: PHASE4R2_DELIVERY_DECISIONS, codecDeterminismReports: Object.fromEntries(Object.keys(PHASE4R2_FAMILIES).map((family) => [family, { bytes: determinism[family].bytes, sha256: determinism[family].sha256 }])), assets, authorization: { mergeMain: false, phase5: false } });
  return records;
}

function makeActiveAuthorityFixture() {
  const records = new Map();
  const putJson = (relative, json) => { const record = recordJson(relative, json); records.set(relative, record); return record; };
  const putBinary = (relative, payload) => { const record = recordBinary(relative, payload); records.set(relative, record); return record; };
  const frameManifests = {};
  const assets = [];
  for (const [family, authority] of Object.entries(PHASE4R21_FAMILIES)) {
    const frames = Array.from({ length: 500 }, (_unused, index) => ({
      bitDepth: 16,
      bytes: index + 1,
      colorType: 2,
      file: `F${String(index + 1).padStart(3, "0")}.png`,
      frame: index + 1,
      height: authority.height,
      sha256: digest(`r2.1-${family}-F${index + 1}`),
      width: authority.width,
    }));
    const activeFrameManifest = buildActiveFrameManifest(family, {
      schema: "quantum-hub.phase-4-r2-1.frame-manifest.v1",
      family,
      source: {
        blendSha256: PHASE4R21_SOURCE_BLEND_SHA256,
        blackBoundaryReportSha256: BOUNDARY_REPORT_SHA256,
        settingsSha256: digest(`r2.1-${family}-settings`),
      },
      frames,
    });
    const frameRecord = putJson(`manifests/phase-4r2-${family}-frame-manifest.json`, activeFrameManifest);
    frameManifests[family] = {
      file: frameRecord.relative,
      bytes: frameRecord.bytes,
      sha256: frameRecord.sha256,
      sequenceSha256: activeFrameManifest.master.sequenceSha256,
      firstFrameSha256: activeFrameManifest.frames[0].sha256,
      frames: 500,
      fps: 30,
      resolution: [authority.width, authority.height],
    };

    const videoPayload = videoFixture("h264", `r2.1-${family}-h264`);
    const videoHash = digest(videoPayload);
    const videoFile = activeVideoRelativePath(family, videoHash);
    putBinary(videoFile, videoPayload);
    assets.push({
      file: videoFile,
      kind: "video",
      family,
      codec: "h264",
      resolution: [authority.width, authority.height],
      fps: 30,
      frames: 500,
      durationSeconds: 50 / 3,
      bytes: videoPayload.length,
      sha256: videoHash,
      masterFrameManifestSha256: frameRecord.sha256,
    });

    const posterPayload = pngFixture(authority.width, authority.height, `r2.1-${family}`);
    const posterHash = digest(posterPayload);
    const posterFile = activePosterRelativePath(family, posterHash);
    putBinary(posterFile, posterPayload);
    assets.push({
      file: posterFile,
      kind: "poster",
      family,
      resolution: [authority.width, authority.height],
      bytes: posterPayload.length,
      sha256: posterHash,
      masterF1Sha256: activeFrameManifest.frames[0].sha256,
      masterFrameManifestSha256: frameRecord.sha256,
    });
  }
  putJson(PHASE4R21_MANIFEST_RELATIVE, buildActiveProductionManifest({
    frameManifests,
    toolchain: { fixture: true },
    assets,
  }));
  return records;
}

function writeActiveAuthorityFixture(root, records) {
  const authorityRoot = path.join(root, ...PHASE4R21_AUTHORITY_RELATIVE.split("/"));
  for (const record of records.values()) {
    const destination = path.join(authorityRoot, ...record.relative.split("/"));
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, record.payload);
  }
  const source = path.join(process.cwd(), ...PHASE4R21_SOURCE_BLEND_RELATIVE.split("/"));
  const destination = path.join(root, ...PHASE4R21_SOURCE_BLEND_RELATIVE.split("/"));
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

test("Phase 4-R2 locks the three authored initial-load cohorts", () => {
  const { chooseFamily, travelViewportHeights } = loadRuntime();
  assert.equal(chooseFamily(800, 801), "portrait");
  assert.equal(chooseFamily(801, 900), "desktop");
  assert.equal(chooseFamily(844, 390), "landscape");
  assert.equal(chooseFamily(900, 480), "landscape");
  assert.equal(chooseFamily(900, 481), "desktop");
  assert.equal(travelViewportHeights("desktop", false), 6.75);
  assert.equal(travelViewportHeights("desktop", true), 5.95);
  assert.equal(travelViewportHeights("portrait", false), 5.35);
  assert.equal(travelViewportHeights("landscape", false), 5.6);
});

test("Phase 5A keeps zero-dead-zone onset and scroll-addresses every CRT startup landmark", () => {
  const {
    ARRIVAL_FRAME,
    CINEMATIC_SEGMENTS,
    STABLE_Q_FRAME,
    arrivalScrollOffset,
    cinematicSegmentForCoordinate,
    conceptualCoordinateFor,
    conceptualCoordinateForScroll,
    conceptualFrameFor,
    mapCinematicProgress,
    physicalFrameFor,
    scrollOffsetForFrame,
  } = loadRuntime();
  const viewports = [
    [6075, "desktop", false, 2403],
    [3868, "desktop", true, 1489],
    [4515, "portrait", false, 1682],
    [4280, "portrait", false, 1595],
    [5478, "portrait", false, 2041],
    [2184, "landscape", false, 818],
  ];
  for (const [travel, family, shortDesktop, expectedArrival] of viewports) {
    const arrival = arrivalScrollOffset(travel, family, shortDesktop);
    assert.equal(arrival, expectedArrival);
    assert.equal(physicalFrameFor(conceptualCoordinateForScroll(0, travel, family, shortDesktop)), 1, "exact top must be F1");
    assert.equal(physicalFrameFor(conceptualCoordinateForScroll(1, travel, family, shortDesktop)), 46, "first positive integer scroll must be F46");
    const onsetFrames = [15, 30, 60].map((offset) => physicalFrameFor(conceptualCoordinateForScroll(offset, travel, family, shortDesktop)));
    assert.ok(onsetFrames[0] >= 46 && onsetFrames[1] >= onsetFrames[0] && onsetFrames[2] > onsetFrames[0], "15/30/60px probes must react immediately and advance monotonically");
    assert.equal(physicalFrameFor(conceptualCoordinateForScroll(arrival, travel, family, shortDesktop)), ARRIVAL_FRAME);
    assert.equal(physicalFrameFor(conceptualCoordinateForScroll(arrival + 1, travel, family, shortDesktop)), ARRIVAL_FRAME + 1, "the next document pixel after arrival must own F286");
    const landmarks = [292, 300, 316, 336, 356, 370, 406, 481, 501, 514, 540];
    for (const frame of landmarks) {
      const offset = scrollOffsetForFrame(frame, travel, family, shortDesktop);
      assert.equal(Math.min(540, Math.floor(conceptualCoordinateForScroll(offset, travel, family, shortDesktop)) + 1), frame, `F${frame} must have an explicit scroll address`);
    }
    const samples = Array.from({ length: travel + 1 }, (_unused, offset) => conceptualCoordinateForScroll(offset, travel, family, shortDesktop));
    samples.forEach((coordinate, index) => {
      if (index) assert.ok(coordinate >= samples[index - 1], "forward mapping must be monotonic");
    });
    const reversed = [...samples].reverse();
    reversed.forEach((coordinate, index) => assert.equal(coordinate, samples[travel - index], "reverse uses the identical single-valued map"));
    assert.equal(conceptualCoordinateForScroll(travel, travel, family, shortDesktop), 540);
  }
  for (const [family, shortDesktop, inputs] of [
    ["desktop", false, [0, 0.038056, 0.31713, 0.691074, 1]],
    ["desktop", true, [0, 0.032792, 0.306208, 0.684481, 1]],
    ["portrait", false, [0, 0.036262, 0.296167, 0.665562, 1]],
    ["landscape", false, [0, 0.036429, 0.29753, 0.667706, 1]],
  ]) inputs.forEach((input, index) => assert.ok(Math.abs(mapCinematicProgress(input, family, shortDesktop) - [0, 0.1, 0.42, 0.78, 1][index]) < 1e-6));
  assert.deepEqual(CINEMATIC_SEGMENTS.map(({ id }) => id), [
    "top-dormancy", "current-orbit", "crt-arrival", "indicator", "phosphor-line", "raster-expansion", "raster-settling",
    "q-appearance", "q-hold", "frontal-approach", "physical-threshold", "digital-breathing", "entry-reveal",
  ]);
  assert.equal(cinematicSegmentForCoordinate(284), "crt-arrival");
  assert.equal(cinematicSegmentForCoordinate(299), "phosphor-line");
  assert.equal(cinematicSegmentForCoordinate(315), "raster-expansion");
  assert.equal(cinematicSegmentForCoordinate(355), "q-appearance");
  assert.equal(conceptualFrameFor(0), 1);
  assert.equal(conceptualFrameFor(500 / 540), 501);
  assert.equal(conceptualFrameFor(513 / 540), 514);
  assert.equal(conceptualFrameFor(1), 540);
  assert.equal(conceptualCoordinateFor(0), 0);
  assert.equal(conceptualCoordinateFor(1), 540);
  assert.equal(physicalFrameFor(0), 1);
  assert.equal(physicalFrameFor(499.999), 500);
  assert.equal(physicalFrameFor(500), 500, "u=500 starts browser black while physical seek stays at F500");
  assert.equal(physicalFrameFor(539.9), 500);
});

test("Phase 5A startup allocation stays legible in every authored viewport family", () => {
  const { arrivalScrollOffset, scrollOffsetForFrame } = loadRuntime();
  const viewports = [
    { height: 900, travel: 6075, family: "desktop", shortDesktop: false, minimum: 0.75, maximum: 1 },
    { height: 650, travel: 3868, family: "desktop", shortDesktop: true, minimum: 0.65, maximum: 0.85 },
    { height: 844, travel: 4515, family: "portrait", shortDesktop: false, minimum: 0.6, maximum: 0.8 },
    { height: 800, travel: 4280, family: "portrait", shortDesktop: false, minimum: 0.6, maximum: 0.8 },
    { height: 1024, travel: 5478, family: "portrait", shortDesktop: false, minimum: 0.6, maximum: 0.8 },
    { height: 390, travel: 2184, family: "landscape", shortDesktop: false, minimum: 0.6, maximum: 0.8 },
  ];
  for (const viewport of viewports) {
    const arrival = arrivalScrollOffset(viewport.travel, viewport.family, viewport.shortDesktop);
    const stable = scrollOffsetForFrame(370, viewport.travel, viewport.family, viewport.shortDesktop);
    const allocationVh = (stable - arrival) / viewport.height;
    assert.ok(allocationVh >= viewport.minimum && allocationVh <= viewport.maximum, `${viewport.family} startup allocation ${allocationVh.toFixed(4)}vh is in target range`);
  }
});

test("Phase 4-R2.1 late media failure preserves document geometry while early eligibility failures stay compact", () => {
  const {
    arrivalScrollOffset,
    cinematicDocumentStateForScroll,
    cinematicFailureDisposition,
    supportsH264,
  } = loadRuntime();
  assert.equal(cinematicFailureDisposition("load-timeout", false), "static", "a timeout before enhanced geometry commits may use compact document flow");
  for (const reason of ["load-timeout", "decode-timeout", "media", "seek", "playback", "typography-fit", "reduced-motion-change", "late-unsupported-state"]) {
    assert.equal(cinematicFailureDisposition(reason, true), "preserve-runway", `${reason} after commit must preserve the runway`);
  }

  const calls = [];
  assert.equal(supportsH264((mime) => { calls.push(mime); return "maybe"; }), true, "Safari-style maybe support is sufficient");
  assert.deepEqual(calls, ['video/mp4; codecs="avc1.640028"'], "capability selection must make one H.264 query and no fallback query");
  assert.equal(supportsH264(() => "probably"), true);
  assert.equal(supportsH264(() => ""), false);

  const travel = 1_989;
  const arrival = arrivalScrollOffset(travel, "landscape", false);
  const states = [0, arrival, Math.round(travel * 0.9), travel].map((offset) => cinematicDocumentStateForScroll(offset, travel, "landscape", false));
  assert.equal(states[0].scrollOffset, 0);
  assert.equal(states[0].scrollProgress, 0);
  assert.equal(states[0].conceptualFrame, 1);
  assert.equal(states[0].phase, "physical");
  assert.equal(states[1].physicalFrame, 285);
  assert.equal(states[1].phase, "physical");
  assert.equal(states[3].scrollOffset, travel);
  assert.equal(states[3].scrollProgress, 1);
  assert.equal(states[3].semantic, 1);
  assert.equal(states[3].phase, "settled");
  assert.equal(states[3].settled, true);

  const sampled = Array.from({ length: travel + 1 }, (_unused, offset) => cinematicDocumentStateForScroll(offset, travel, "landscape", false));
  const black = sampled.find((state) => state.conceptualCoordinate >= 500 && state.conceptualCoordinate < 513);
  const entry = sampled.find((state) => state.conceptualCoordinate > 513 && !state.settled);
  assert.ok(black && black.phase === "black" && black.black === 1 && black.semantic === 0, "the browser-owned black interval survives a late timeout");
  assert.ok(entry && entry.phase === "entry" && entry.semantic > 0, "semantic ENTRY continues from native document progress after a late timeout");
});

test("Phase 7A runtime keeps one paused decoder, native scroll, latest-position authority, and bounded Signal Field work", () => {
  const source = readFileSync(path.join(process.cwd(), "src", "scripts", "home-cinematic-integration.ts"), "utf8");
  const cinematicCss = readFileSync(path.join(process.cwd(), "src", "styles", "routes", "home-cinematic.css"), "utf8");
  const signalField = readFileSync(path.join(process.cwd(), "src", "scripts", "signal-field.ts"), "utf8");
  assert.match(source, /const releaseMissingDom/);
  assert.match(source, /cinematicFallback = "required-dom"/);
  assert.match(source, /const handleSkip[\s\S]*?setThresholdInteraction\(true, false\)[\s\S]*?entry\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /pagehide[\s\S]{0,800}cancelAnimationFrame\(animationFrame\)[\s\S]{0,120}animationFrame = 0/);
  assert.match(source, /const documentState = cinematicDocumentStateForScroll\(currentScrollOffset, scrollExtent/);
  assert.match(source, /PIECEWISE_COORDINATES/);
  assert.match(source, /PIECEWISE_PROGRESS/);
  assert.match(source, /offsets\[activationIndex\] = Math\.min\(extent, offsets\[arrivalIndex\]! \+ 1\)/);
  assert.match(source, /const segment = cinematicSegmentForCoordinate\(conceptualCoordinate\)/);
  assert.match(source, /else targetFrame\(scrollTargetPhysicalFrame, true\)/, "every direction and fast jump must target the latest document-derived physical frame");
  assert.match(source, /seeked[\s\S]{0,500}requestCurrentFrame\(\)/, "a completed stale seek must yield to the latest scroll target");
  assert.equal([...source.matchAll(/presentedPhysicalFrame\s*=(?!=)/g)].length, 2, "presented authority is initialized once and then updated only by seeked");
  assert.doesNotMatch(source, /\.play\s*\(/, "the decoder must never autonomously play");
  assert.doesNotMatch(source, /\b(?:wake-armed|wake-forward|wake-reverse|stable-hold)\b/);
  assert.doesNotMatch(source, /requestVideoFrameCallback|cancelVideoFrameCallback/);
  assert.doesNotMatch(source, /arrivalOrBeyond|scrollIntentFor|reverseFrameForElapsed|reviseReversePlan/);
  assert.doesNotMatch(source, /createElement\(\s*["'](?:video|source)["']/);
  assert.doesNotMatch(source, /\b(?:vp9|webm)\b/i, "active runtime must not probe, select, or request the historical VP9 delivery");
  assert.match(source, /manifest\.assets\.length !== 6/);
  assert.match(source, /completeH264Inventory/);
  assert.match(source, /failed-preserve-runway/);
  assert.match(source, /cinematicDocumentStateForScroll/);
  assert.match(source, /resizeObserver\.observe\(fieldMapThreshold\)/);
  assert.match(source, /fieldMapTop = fieldMapThreshold\.getBoundingClientRect\(\)\.top \+ window\.scrollY/);
  assert.doesNotMatch(source, /methodField|methodStages|cinematicMethodGeometry/);
  assert.match(signalField, /\(hover: hover\) and \(pointer: fine\)/);
  assert.match(signalField, /requestAnimationFrame\(write\)/);
  assert.match(signalField, /pointerleave|pointercancel/);
  assert.match(signalField, /visibilitychange[\s\S]*?cancelAnimationFrame\(frame\)/);
  assert.doesNotMatch(signalField, /setInterval|scroll(?:To|By|IntoView)\s*\(|\.scrollTop\s*=/);
  assert.match(cinematicCss, /prefers-reduced-motion:\s*reduce[\s\S]*?\.cinematic-media\s*\{[\s\S]*?display:\s*none/);
  assert.doesNotMatch(source, /querySelectorAll\(["']source["']\)[\s\S]{0,160}removeAttribute\(["']srcset["']\)/, "late failure must retain the still poster while releasing only video\/Blob resources");
  assert.doesNotMatch(source, /\bpreventDefault\s*\(/);
  assert.doesNotMatch(source, /(?:window\.)?scroll(?:To|By)\s*\(/);
  assert.match(source, /setTimeout\(\(\) => \{ if \(!mediaReady\) failOpen/, "the only timer is the bounded media load watchdog");
  assert.match(source, /BLACK_START_U = 500/);
  assert.match(source, /ENTRY_START_U = 513/);
});

test("the active build remains fail-closed around the accepted Phase 7A and nested H.264 authorities", () => {
  const root = process.cwd();
  const packageManifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const finalBuild = readFileSync(path.join(root, "scripts", "run-phase7a-build.mjs"), "utf8");
  const phase7bBuild = readFileSync(path.join(root, "scripts", "run-phase7b-build.mjs"), "utf8");
  const legacyStage = readFileSync(path.join(root, "scripts", "stage-phase4-media.mjs"), "utf8");
  const r2Stage = readFileSync(path.join(root, "scripts", "stage-phase4r2-runtime-media.mjs"), "utf8");
  const outputVerifier = readFileSync(path.join(root, "scripts", "verify-phase7a-output.mjs"), "utf8");

  assert.equal(packageManifest.scripts.build, "node scripts/run-phase7b-build.mjs");
  assert.equal(packageManifest.scripts["build:phase4r2-final"], "node scripts/run-phase4r2-final-build.mjs");
  assert.match(finalBuild, /PHASE4R2_FINAL_AUTHORITY: "1"/);
  assert.match(finalBuild, /verify-phase7a-environment\.mjs/);
  assert.match(finalBuild, /stage-phase4-media\.mjs/);
  assert.match(finalBuild, /stage-phase4r2-runtime-media\.mjs/);
  assert.match(finalBuild, /node_modules\/astro\/bin\/astro\.mjs/);
  assert.match(finalBuild, /verify-phase7a-output\.mjs/);
  assert.match(phase7bBuild, /PHASE4R2_FINAL_AUTHORITY: "1"/);
  assert.match(phase7bBuild, /verify-phase7b-source\.mjs/);
  assert.match(phase7bBuild, /stage-phase4-media\.mjs/);
  assert.match(phase7bBuild, /stage-phase4r2-runtime-media\.mjs/);
  assert.match(phase7bBuild, /node_modules\/astro\/bin\/astro\.mjs/);
  assert.match(phase7bBuild, /verify-phase7b-output\.mjs/);
  assert.match(legacyStage, /FINAL_AUTHORITY_EXPECTED/);
  assert.match(legacyStage, /Pruned .*legacy cinematic/);
  assert.match(r2Stage, /PHASE4R21_MANIFEST_RELATIVE/);
  assert.match(r2Stage, /loadAndValidatePhase4R21Authority/);
  assert.match(r2Stage, /active tracked authority must contain exactly ten files/);
  assert.match(r2Stage, /strict six-asset H\.264 authority/);
  assert.match(r2Stage, /rename\(tempRoot, outputRoot\)/);
  assert.match(outputVerifier, /data-cinematic-shell/);
  assert.match(outputVerifier, /data-signal-field/);
  assert.match(outputVerifier, /real404/);
  assert.match(outputVerifier, /anybody-latin-variable/);
});

test("Phase 4-R2 complete miniature source/report/media authority validates", () => {
  const result = validatePhase4R2AuthorityRecords(makeAuthorityFixture());
  assert.equal(result.assets.length, 9);
  assert.equal(result.expectedAuthorityPaths.length, 22);
  assert.equal(result.authorityReports.codecDeterminism.desktop.path, "reports/phase-4r2-desktop-codec-determinism.json");
});

test("Phase 4-R2 counterfeit authorities fail closed", () => {
  const mutations = [
    ["wrong source", (records) => { records.get(PHASE4R2_MANIFEST_RELATIVE).json.sourceBlendSha256 = digest("wrong-source"); }],
    ["fallback filename", (records) => { records.get(PHASE4R2_MANIFEST_RELATIVE).json.assets.find(({ kind }) => kind === "video").file = "media/phase-3-desktop-vp9-fallback.webm"; }],
    ["renamed filename", (records) => { records.get(PHASE4R2_MANIFEST_RELATIVE).json.assets.find(({ kind }) => kind === "poster").file = "posters/renamed.png"; }],
    ["wrong nested path", (records) => { const asset = records.get(PHASE4R2_MANIFEST_RELATIVE).json.assets.find(({ kind }) => kind === "video"); asset.file = `media/nested/${path.posix.basename(asset.file)}`; }],
    ["altered payload", (records) => { const asset = records.get(PHASE4R2_MANIFEST_RELATIVE).json.assets.find(({ kind }) => kind === "video"); const prior = records.get(asset.file); records.set(asset.file, recordBinary(asset.file, Buffer.concat([prior.payload, Buffer.from("counterfeit")]))); }],
    ["altered report", (records) => { records.get("reports/phase-4r2-encode-quality-report.json").json.status = "INCOMPLETE"; }],
    ["counterfeit settings authority", (records) => { records.get("reports/phase-4r2-encode-quality-report.json").json.settingsAuthorities["vp9-v1"].value.deadline = "realtime"; }],
    ["counterfeit candidate argv", (records) => { records.get("reports/phase-4r2-encode-quality-report.json").json.families.desktop.candidates[0].argv[0] = "<COUNTERFEIT_FFMPEG>"; }],
    ["counterfeit candidate probe", (records) => { records.get("reports/phase-4r2-encode-quality-report.json").json.families.desktop.candidates[0].probe.frames = 499; }],
    ["counterfeit candidate metrics", (records) => { records.get("reports/phase-4r2-encode-quality-report.json").json.families.desktop.candidates[0].metrics.perFrame[0].frame = 2; }],
    ["counterfeit determinism argv", (records) => { records.get("reports/phase-4r2-desktop-codec-determinism.json").json.codecs.vp9.runs[0].argv[0] = "<COUNTERFEIT_FFMPEG>"; }],
    ["extra selection key", (records) => { records.get("reports/phase-4r2-encode-quality-report.json").json.families.desktop.selection.fallback = "desktop-vp9-smaller"; }],
    ["CRC-invalid poster", (records) => {
      const manifest = records.get(PHASE4R2_MANIFEST_RELATIVE).json;
      const asset = manifest.assets.find(({ kind }) => kind === "poster");
      const payload = Buffer.from(records.get(asset.file).payload);
      payload[payload.length - 1] ^= 0x01;
      const counterfeit = recordBinary(asset.file, payload);
      records.set(asset.file, counterfeit);
      asset.bytes = counterfeit.bytes;
      asset.sha256 = counterfeit.sha256;
      const state = records.get("reports/phase-4r2-poster-validation-report.json").json.families[asset.family];
      state.bytes = counterfeit.bytes;
      state.sha256 = counterfeit.sha256;
    }],
    ["stale report hash", (records) => { const relative = "reports/phase-4r2-encode-quality-report.json"; const changed = { ...records.get(relative).json, generatedAt: "stale" }; records.set(relative, recordJson(relative, changed)); }],
    ["altered timeline", (records) => { records.get(PHASE4R2_MANIFEST_RELATIVE).json.physicalTimeline.frames = 540; }],
    ["altered merge denial", (records) => { records.get(PHASE4R2_MANIFEST_RELATIVE).json.authorization.mergeMain = true; }],
    ["altered Phase 5 denial", (records) => { records.get(PHASE4R2_MANIFEST_RELATIVE).json.authorization.phase5 = true; }],
    ["self-hashed manifest", (records) => { records.get(PHASE4R2_MANIFEST_RELATIVE).json.selfSha256 = digest("self"); }],
  ];
  for (const [label, mutate] of mutations) {
    const records = makeAuthorityFixture();
    mutate(records);
    assert.throws(() => validatePhase4R2AuthorityRecords(records), /Phase 4-R2 authority rejected/, label);
  }
});

test("Phase 4-R2.1 staging atomically replaces stale codecs and rejects a counterfeit before replacing valid runtime bytes", async () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), "phase4r2-counterfeit-stage-"));
  try {
    const records = makeActiveAuthorityFixture();
    writeActiveAuthorityFixture(temporary, records);
    const authority = await loadAndValidatePhase4R21Authority({
      authorityRoot: path.join(temporary, ...PHASE4R21_AUTHORITY_RELATIVE.split("/")),
      repositoryRoot: temporary,
    });
    assert.equal(authority.assets.length, 6);
    assert.equal(authority.expectedAuthorityPaths.length, 10);
    assert.equal(authority.runtimePaths.length, 7);
    const outputRoot = path.join(temporary, ...PHASE4R21_OUTPUT_RELATIVE.split("/"));
    mkdirSync(path.join(outputRoot, "media"), { recursive: true });
    writeFileSync(path.join(outputRoot, "media", "stale-vp9.webm"), videoFixture("vp9", "stale"));
    await stagePhase4R2RuntimeMedia({ root: temporary, finalAuthorityExpected: true });
    const emittedManifest = path.join(outputRoot, ...PHASE4R21_MANIFEST_RELATIVE.split("/"));
    const acceptedBytes = readFileSync(emittedManifest);
    assert.equal(readFileSync(path.join(outputRoot, ...PHASE4R21_MANIFEST_RELATIVE.split("/")), "utf8").includes("webm"), false);
    assert.equal(spawnSync(process.execPath, ["-e", `const{readdirSync,statSync}=require('fs'),p=require('path');let n=0;const w=d=>{for(const x of readdirSync(d)){const q=p.join(d,x);statSync(q).isDirectory()?w(q):n++}};w(${JSON.stringify(outputRoot)});process.stdout.write(String(n))`], { encoding: "utf8" }).stdout, "7", "atomic runtime tree must contain exactly the manifest plus six assets");

    const sourceBlend = path.join(temporary, ...PHASE4R21_SOURCE_BLEND_RELATIVE.split("/"));
    const acceptedSource = readFileSync(sourceBlend);
    const corruptSource = Buffer.from(acceptedSource);
    corruptSource[0] ^= 0x01;
    chmodSync(sourceBlend, 0o666);
    writeFileSync(sourceBlend, corruptSource);
    await assert.rejects(
      stagePhase4R2RuntimeMedia({ root: temporary, finalAuthorityExpected: true }),
      /R2\.1 source Blender SHA-256 mismatch/,
    );
    assert.deepEqual(readFileSync(emittedManifest), acceptedBytes, "corrupt frozen source must not replace an already accepted runtime tree");
    writeFileSync(sourceBlend, acceptedSource);

    const manifest = structuredClone(records.get(PHASE4R21_MANIFEST_RELATIVE).json);
    manifest.sourceBlendSha256 = digest("counterfeit-source");
    const counterfeit = recordJson(PHASE4R21_MANIFEST_RELATIVE, manifest);
    records.set(PHASE4R21_MANIFEST_RELATIVE, counterfeit);
    writeFileSync(path.join(temporary, ...PHASE4R21_AUTHORITY_RELATIVE.split("/"), ...PHASE4R21_MANIFEST_RELATIVE.split("/")), counterfeit.payload);

    await assert.rejects(
      stagePhase4R2RuntimeMedia({ root: temporary, finalAuthorityExpected: true }),
      /active six-asset H\.264 manifest mismatch/,
    );
    assert.deepEqual(readFileSync(emittedManifest), acceptedBytes, "failed validation must not replace an already accepted runtime tree");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("Phase 4-R2 build dispatcher selects final authority and retains pre-CP5 development mode", async () => {
  const { AUTHORITY_ROOT, AUTHORITY_MANIFEST, resolveBuildMode, runBuild } = await import(`../scripts/run-phase4-build.mjs?test=${Date.now()}`);
  assert.equal(await resolveBuildMode(async (candidate) => candidate === AUTHORITY_ROOT), "final");
  assert.equal(await resolveBuildMode(async (candidate) => candidate === AUTHORITY_MANIFEST), "final");
  assert.equal(await resolveBuildMode(async () => false), "development");

  const finalSteps = [];
  assert.equal(await runBuild({ resolveMode: async () => "final", run: (script) => finalSteps.push(script) }), "final");
  assert.deepEqual(finalSteps, ["scripts/run-phase4r2-final-build.mjs"]);
  const developmentSteps = [];
  assert.equal(await runBuild({ resolveMode: async () => "development", run: (script, args = []) => developmentSteps.push([script, args]) }), "development");
  assert.deepEqual(developmentSteps, [
    ["scripts/stage-phase4-media.mjs", []],
    ["scripts/stage-phase4r2-runtime-media.mjs", []],
    ["node_modules/astro/bin/astro.mjs", ["build"]],
    ["scripts/verify-phase4-output.mjs", []],
  ]);
});

test("Phase 4-R2.1 explicit final staging fails without authority while development mode remains selectable", () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), "phase4r2-final-authority-"));
  try {
    const result = spawnSync(process.execPath, [path.join(process.cwd(), "scripts", "stage-phase4r2-runtime-media.mjs")], {
      cwd: temporary,
      env: { ...process.env, PHASE4R2_FINAL_AUTHORITY: "1" },
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /active media authority is required but not staged/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
