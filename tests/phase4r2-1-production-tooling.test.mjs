import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ACTIVE_AUTHORITY_ROOT_RELATIVE,
  ACTIVE_FRAME_MANIFEST_SCHEMA,
  ACTIVE_MANIFEST_RELATIVE,
  ACTIVE_MANIFEST_SCHEMA,
  ACTIVE_PUBLIC_ROOT_RELATIVE,
  AFFECTED_END,
  AFFECTED_START,
  BOUNDARY_REPORT_SHA256,
  FAMILIES,
  FRAME_COUNT,
  SOURCE_SHA256,
  activeAuthorityFileInventory,
  activeFrameManifestRelativePath,
  activePosterRelativePath,
  activeRuntimeFileInventory,
  activeVideoRelativePath,
  affectedFrames,
  buildActiveFrameManifest,
  buildActiveProductionManifest,
  buildEncodeArguments,
  pathIsWithin,
  reusedFrames,
  validateActiveProductionManifest,
  validateBoundaryReportData,
  validateVideoProbe,
} from "../scripts/phase4r2-1-production.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("R2.1 partial-production frame partition is exact and exhaustive", () => {
  const affected = affectedFrames();
  const reused = reusedFrames();
  assert.equal(affected[0], AFFECTED_START);
  assert.equal(affected.at(-1), AFFECTED_END);
  assert.equal(affected.length, 449);
  assert.equal(reused.length, 51);
  assert.deepEqual(reused.slice(0, 3), [1, 2, 3]);
  assert.deepEqual(reused.slice(-6), [495, 496, 497, 498, 499, 500]);
  assert.equal(new Set([...affected, ...reused]).size, FRAME_COUNT);
  assert.deepEqual([...affected, ...reused].sort((a, b) => a - b),
    Array.from({ length: FRAME_COUNT }, (_, index) => index + 1));
});

test("R2.1 tooling pins the accepted source and zero-pixel boundary proof", () => {
  assert.equal(SOURCE_SHA256, "58f5479484dd8da342556abad1e58c96a660f30e6a9d6d5215927056b5cbc516");
  assert.equal(BOUNDARY_REPORT_SHA256, "f182b35dc533878a7c70b7f1327e8d92c5438fd3984b6223d520fd5b83abc9df");
});

test("durable-root containment treats dot-dot-prefixed child names as children", () => {
  const parent = path.resolve(REPO_ROOT, "containment-authority");
  assert.equal(pathIsWithin(parent, parent), true);
  assert.equal(pathIsWithin(parent, path.join(parent, "..frames", "raw")), true);
  assert.equal(pathIsWithin(parent, path.resolve(parent, "..", "sibling")), false);
});

test("R2.1 delivery arguments implement the faithful H.264-only authority", () => {
  for (const family of ["desktop", "portrait", "landscape"]) {
    const args = buildEncodeArguments(family, "<SEQUENCE>/F%03d.png", "<OUTPUT>.mp4", 22);
    assert.ok(args.includes("libx264"));
    assert.ok(args.includes("slow"));
    assert.ok(args.includes("22"));
    assert.ok(args.includes("500"));
    assert.ok(args.includes("yuv420p"));
    assert.ok(args.includes("+faststart"));
    assert.equal(args.includes("libvpx-vp9"), false);
    assert.equal(args.some((value) => value.endsWith(".webm")), false);
  }
  assert.throws(() => buildEncodeArguments("desktop", "in", "out", 28), /CRF/);
  assert.throws(() => buildEncodeArguments("unknown", "in", "out", 22), /unknown family/);
});

test("R2.1 finalize contract binds the active runtime to exactly three H.264 videos and three posters", () => {
  const families = Object.keys(FAMILIES);
  const frameManifests = Object.fromEntries(families.map((family, index) => [family, {
    file: activeFrameManifestRelativePath(family),
    bytes: 120_000 + index,
    sha256: String(index + 1).repeat(64),
    sequenceSha256: String(index + 4).repeat(64),
    firstFrameSha256: String(index + 7).repeat(64),
    frames: 500,
    fps: 30,
    resolution: [FAMILIES[family].width, FAMILIES[family].height],
  }]));
  const assets = families.flatMap((family, index) => {
    const videoSha256 = String.fromCharCode(97 + index).repeat(64);
    const posterSha256 = String.fromCharCode(100 + index).repeat(64);
    const frameManifest = frameManifests[family];
    const resolution = [FAMILIES[family].width, FAMILIES[family].height];
    return [{
      kind: "video",
      family,
      codec: "h264",
      file: activeVideoRelativePath(family, videoSha256),
      bytes: 12_000_000 + index,
      sha256: videoSha256,
      frames: 500,
      fps: 30,
      durationSeconds: 500 / 30,
      resolution,
      masterFrameManifestSha256: frameManifest.sha256,
    }, {
      kind: "poster",
      family,
      file: activePosterRelativePath(family, posterSha256),
      bytes: 100_000 + index,
      sha256: posterSha256,
      resolution,
      masterF1Sha256: frameManifest.firstFrameSha256,
      masterFrameManifestSha256: frameManifest.sha256,
    }];
  });
  const manifest = buildActiveProductionManifest({ frameManifests, toolchain: {}, assets });
  assert.equal(validateActiveProductionManifest(manifest), true);
  assert.equal(manifest.schema, ACTIVE_MANIFEST_SCHEMA);
  assert.equal(ACTIVE_MANIFEST_RELATIVE, "manifests/phase-4r2-production-media-manifest.json");
  assert.equal(manifest.runtimeStaging.publicRoot, ACTIVE_PUBLIC_ROOT_RELATIVE);
  assert.equal(manifest.assets.length, 6);
  assert.equal(manifest.assets.filter(({ kind }) => kind === "video").length, 3);
  assert.equal(manifest.assets.filter(({ kind }) => kind === "poster").length, 3);
  assert.deepEqual(manifest.runtimeStaging.exactFiles, activeRuntimeFileInventory(manifest));
  assert.equal(manifest.runtimeStaging.exactFiles.length, 7, "public gets one manifest plus six active payloads");
  assert.equal(manifest.authorityMaterialization.trackedRoot, ACTIVE_AUTHORITY_ROOT_RELATIVE);
  assert.deepEqual(manifest.authorityMaterialization.exactFiles, activeAuthorityFileInventory(manifest));
  assert.equal(manifest.authorityMaterialization.exactFiles.length, 10, "tracked authority gets one manifest, three frame manifests, and six payloads");
  assert.doesNotMatch(JSON.stringify(manifest), /(?:vp9|webm)/i);
  assert.doesNotMatch(JSON.stringify(manifest), /artifacts[\\/]original/i, "public manifest must not expose repository-internal authority paths");

  const missingFrameRate = structuredClone(manifest);
  missingFrameRate.assets.find(({ kind }) => kind === "video").fps = undefined;
  assert.throws(() => validateActiveProductionManifest(missingFrameRate), /H\.264 runtime contract/);
  const stalePublicFile = structuredClone(manifest);
  stalePublicFile.runtimeStaging.exactFiles.push("media/stale.mp4");
  assert.throws(() => validateActiveProductionManifest(stalePublicFile), /staging\/cleanup contract/);
});

test("R2.1 complete sequence is normalized to the standard active frame-manifest path and schema", () => {
  const family = "desktop";
  const authority = FAMILIES[family];
  const partial = {
    schema: "quantum-hub.phase-4-r2-1.frame-manifest.v1",
    family,
    source: {
      blendSha256: SOURCE_SHA256,
      blackBoundaryReportSha256: BOUNDARY_REPORT_SHA256,
      settingsSha256: "a".repeat(64),
    },
    frames: Array.from({ length: FRAME_COUNT }, (_unused, index) => ({
      frame: index + 1,
      file: `F${String(index + 1).padStart(3, "0")}.png`,
      bytes: 1_000 + index,
      sha256: "b".repeat(64),
      width: authority.width,
      height: authority.height,
      bitDepth: 16,
      colorType: 2,
      interlaced: 0,
      provenance: { mode: index < 45 || index >= 494 ? "exact-reuse" : "r2-1-affected-render" },
    })),
  };
  const active = buildActiveFrameManifest(family, partial);
  assert.equal(active.schema, ACTIVE_FRAME_MANIFEST_SCHEMA);
  assert.equal(activeFrameManifestRelativePath(family), "manifests/phase-4r2-desktop-frame-manifest.json");
  assert.equal(active.frames.length, FRAME_COUNT);
  assert.deepEqual(Object.keys(active.frames[0]).sort(), ["bitDepth", "bytes", "colorType", "file", "frame", "height", "sha256", "width"].sort());
  assert.deepEqual(active.master.frameRange, [1, 500]);
  assert.equal(active.master.fps, 30);
  assert.equal(active.master.totalBytes, partial.frames.reduce((total, frame) => total + frame.bytes, 0));
  assert.match(active.master.sequenceSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(active.source, {
    blendSha256: SOURCE_SHA256,
    camera: authority.camera,
    settingsSha256: "a".repeat(64),
  });
});

test("R2.1 active delivery contract matches the CP4 runtime binding surface", async () => {
  const runtime = await readFile(path.join(REPO_ROOT, "src", "scripts", "home-cinematic-integration.ts"), "utf8");
  assert.match(runtime, /const MANIFEST_PATH = "\/media\/cinematic\/phase-4r2\/manifests\/phase-4r2-production-media-manifest\.json"/);
  assert.match(runtime, /manifest\.schema !== "quantum-hub\.phase-4-r2\.production-media-manifest\.v1"/);
  assert.match(runtime, /manifest\.assets\.length !== 6/);
  assert.match(runtime, /asset\.frames !== PHYSICAL_FRAME_COUNT/);
  assert.match(runtime, /asset\.fps !== FRAME_RATE/);
  assert.match(runtime, /media\/phase-4r2-\$\{family\}-\$\{codec\}-\$\{asset\.sha256\.slice\(0, 12\)\}\.mp4/);
  assert.doesNotMatch(runtime, /\b(?:vp9|webm)\b/i);
});

test("R2.1 zero-pixel black-boundary proof is bound to exact prior masters", async () => {
  const authorityRoot = path.join(REPO_ROOT, "artifacts", "original", "phase-4r2-final-cinematic-production");
  const report = JSON.parse(await readFile(path.join(
    REPO_ROOT,
    "artifacts", "original", "phase-4r2-1-causal-signal-scroll-stability", "review", "pilots",
    "black-boundary-production-report.json",
  )));
  const manifests = Object.fromEntries(await Promise.all(
    ["desktop", "portrait", "landscape"].map(async (family) => [family, JSON.parse(await readFile(path.join(
      authorityRoot, "manifests", `phase-4r2-${family}-frame-manifest.json`,
    )))]),
  ));
  assert.equal(validateBoundaryReportData(report, manifests), true);
  const corrupted = structuredClone(report);
  corrupted.outputs[0].masterComparison.differentRgbSamples = 1;
  assert.throws(() => validateBoundaryReportData(corrupted, manifests), /parity mismatch/);
});

test("H.264 probe validation fails closed on container, color, duration, profile, and GOP", () => {
  const probe = {
    streams: [{
      codec_type: "video",
      codec_name: "h264",
      profile: "High",
      width: 1920,
      height: 1200,
      pix_fmt: "yuv420p",
      r_frame_rate: "30/1",
      avg_frame_rate: "30/1",
      nb_read_frames: "500",
      color_range: "tv",
      color_space: "bt709",
      color_transfer: "bt709",
      color_primaries: "bt709",
    }],
    format: { duration: String(500 / 30), format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
    frames: Array.from({ length: 500 }, (_, index) => ({ key_frame: index % 12 === 0 ? 1 : 0 })),
  };
  assert.equal(validateVideoProbe("desktop", probe).keyframeInterval, 12);
  for (const mutate of [
    (value) => { delete value.format.duration; },
    (value) => { value.format.format_name = "matroska,webm"; },
    (value) => { value.streams[0].profile = "Main"; },
    (value) => { value.streams[0].color_primaries = undefined; },
    (value) => { value.frames[12].key_frame = 0; },
    (value) => { value.streams.push({ codec_type: "subtitle" }); },
  ]) {
    const invalid = structuredClone(probe);
    mutate(invalid);
    assert.throws(() => validateVideoProbe("desktop", invalid), /probe authority mismatch/);
  }
});
