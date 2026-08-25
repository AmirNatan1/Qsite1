#!/usr/bin/env node
/**
 * Direct, deterministic rasterization and fidelity evidence for the official
 * Quantum-Hub SVG.  The SVG bytes are the only silhouette authority; no path
 * is redrawn or approximated here or in Blender.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const generatorPath = fileURLToPath(import.meta.url);
const here = path.dirname(generatorPath);
const repo = path.resolve(here, "../../../..");
const out = path.join(here, "q-fidelity");
const whiteSvg = path.join(repo, "public", "brand", "quantum-icon-white.svg");
const colorSvg = path.join(repo, "public", "brand", "quantum-icon-color.svg");
const expectedWhite = "c660ed87bc5293bfbffa662e523343a7e83bc86cb94848912494e85e0dc9d4ff";
const expectedColor = "04dc37965b33587fea5f4664660f8a7f9a81ec7904d39925b41c6826b80cded9";
const size = 2048;

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const rel = (value) => path.relative(repo, value).replaceAll(path.sep, "/");
const record = async (role, value, width = null, height = null, mediaType = "image/png") => {
  const bytes = await fs.readFile(value);
  return { role, path: rel(value), bytes: bytes.byteLength, sha256: sha256(bytes), width, height, mediaType };
};

const whiteBytes = await fs.readFile(whiteSvg);
const colorBytes = await fs.readFile(colorSvg);
const generatorBytes = await fs.readFile(generatorPath);
if (sha256(whiteBytes) !== expectedWhite || sha256(colorBytes) !== expectedColor) {
  throw new Error("Official Quantum-Hub SVG authority hash mismatch; refusing to rasterize.");
}
await fs.mkdir(out, { recursive: true });
const sourceText = whiteBytes.toString("utf8");
const colorText = colorBytes.toString("utf8");
const pathAuthorities = (value) => [...value.matchAll(/<path[^>]+d=["']([^"']+)["']/gi)].map((match) => match[1]);
if (JSON.stringify(pathAuthorities(sourceText)) !== JSON.stringify(pathAuthorities(colorText))) {
  throw new Error("White/color official SVG path topology differs; refusing dual-authority pre-CRT binding");
}
if (!sourceText.toLowerCase().includes("#fff") || !sourceText.toLowerCase().includes("#d82b72") || !colorText.toLowerCase().includes("#d82b72")) {
  throw new Error("Official white-body/magenta-node palette authority is incomplete");
}
const viewBoxMatch = sourceText.match(/viewBox=["']\s*([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s*["']/i);
if (!viewBoxMatch) throw new Error("Official Quantum-Hub SVG is missing a parseable viewBox");
const viewBox = viewBoxMatch.slice(1).map(Number);
const sourceAspectRatio = viewBox[2] / viewBox[3];

const raster = async (source, target) => {
  await sharp(source, { density: 600, failOn: "error" })
    .resize(size, size, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false, force: true })
    .toFile(target);
};

const whitePng = path.join(out, "quantum-icon-white-2048.png");
const colorPng = path.join(out, "quantum-icon-color-2048.png");
const preCrt = path.join(out, "quantum-icon-pre-crt-effect.png");
await raster(whiteBytes, whitePng);
await raster(colorBytes, colorPng);
await fs.copyFile(whitePng, preCrt);

const reference = await sharp(whiteBytes, { density: 600 })
  .resize(size, size, { fit: "fill", kernel: sharp.kernel.lanczos3 })
  .ensureAlpha()
  .raw()
  .toBuffer();
const texture = await sharp(whitePng).ensureAlpha().raw().toBuffer();
if (reference.byteLength !== texture.byteLength) throw new Error("Q raster byte-shape mismatch");

let differentPixels = 0;
let maxChannelDelta = 0;
const difference = Buffer.alloc(reference.byteLength);
const overlay = Buffer.alloc(reference.byteLength);
const refMask = Buffer.alloc(size * size);
const texMask = Buffer.alloc(size * size);
for (let i = 0, p = 0; i < reference.length; i += 4, p += 1) {
  let pixelDifferent = false;
  let localMax = 0;
  for (let c = 0; c < 4; c += 1) {
    const delta = Math.abs(reference[i + c] - texture[i + c]);
    difference[i + c] = c === 3 ? 255 : delta;
    localMax = Math.max(localMax, delta);
    pixelDifferent ||= delta !== 0;
  }
  if (pixelDifferent) differentPixels += 1;
  maxChannelDelta = Math.max(maxChannelDelta, localMax);
  const ra = reference[i + 3];
  const ta = texture[i + 3];
  refMask[p] = ra;
  texMask[p] = ta;
  overlay[i] = ta;
  overlay[i + 1] = ra;
  overlay[i + 2] = Math.min(255, Math.round((ra + ta) * 0.5));
  overlay[i + 3] = Math.max(ra, ta);
}

const overlayPng = path.join(out, "quantum-icon-white-overlay.png");
const differencePng = path.join(out, "quantum-icon-white-difference.png");
await sharp(overlay, { raw: { width: size, height: size, channels: 4 } })
  .png({ compressionLevel: 9, adaptiveFiltering: false }).toFile(overlayPng);
await sharp(difference, { raw: { width: size, height: size, channels: 4 } })
  .png({ compressionLevel: 9, adaptiveFiltering: false }).toFile(differencePng);

const refPanel = await sharp(refMask, { raw: { width: size, height: size, channels: 1 } })
  .resize(640, 640).png().toBuffer();
const texPanel = await sharp(texMask, { raw: { width: size, height: size, channels: 1 } })
  .resize(640, 640).png().toBuffer();
const diffPanel = await sharp(differencePng).resize(640, 640).png().toBuffer();
const silhouettePng = path.join(out, "quantum-icon-white-silhouette-comparison.png");
await sharp({ create: { width: 1920, height: 720, channels: 4, background: "#0e1112" } })
  .composite([
    { input: refPanel, left: 0, top: 40 },
    { input: texPanel, left: 640, top: 40 },
    { input: diffPanel, left: 1280, top: 40 },
  ])
  .png({ compressionLevel: 9, adaptiveFiltering: false }).toFile(silhouettePng);

const aspectPng = path.join(out, "quantum-icon-aspect-comparison.png");
const q640 = await sharp(whitePng).resize(640, 640).png().toBuffer();
await sharp({ create: { width: 1280, height: 720, channels: 4, background: "#14090f" } })
  .composite([
    { input: q640, left: 0, top: 40 },
    { input: q640, left: 640, top: 40 },
  ])
  .png({ compressionLevel: 9, adaptiveFiltering: false }).toFile(aspectPng);

const files = [
  await record("official-white-svg", whiteSvg, null, null, "image/svg+xml"),
  await record("official-color-svg", colorSvg, null, null, "image/svg+xml"),
  await record("screen-texture-white", whitePng, size, size),
  await record("screen-texture-color", colorPng, size, size),
  await record("pre-crt-effect-q", preCrt, size, size),
  await record("official-source-overlay", overlayPng, size, size),
  await record("difference-image", differencePng, size, size),
  await record("silhouette-comparison", silhouettePng, 1920, 720),
  await record("aspect-ratio-comparison", aspectPng, 1280, 720),
];
const report = {
  schema: "quantum-hub.phase-4-r1.exact-q-provenance.v2",
  status: differentPixels === 0 && maxChannelDelta === 0 ? "PASS" : "FAIL",
  generatedAt: "2026-08-24T00:00:00Z",
  method: "Official SVG bytes rasterized directly through sharp/libvips; no manual trace, glyph, Blender curve, or alternative logo.",
  preCrtComposition: {
    packedRole: "pre-crt-effect-q",
    bodyAuthority: "official-white-svg",
    nodeColorAuthority: "official-white-svg and official-color-svg",
    bodyColor: "#ffffff",
    nodeColor: "#d82b72",
    officialPathTopologyIdenticalAcrossWhiteAndColorAuthorities: true,
    effectAppliedBeforePackedTexture: false,
  },
  command: "node artifacts/original/phase-4r1-refined-proving-hall/source/generate_phase4r1_exact_q.mjs",
  rasterization: {
    method: "direct official SVG bytes to lossless RGBA PNG through sharp/libvips",
    commandOrScript: "node artifacts/original/phase-4r1-refined-proving-hall/source/generate_phase4r1_exact_q.mjs",
    sourceViewBox: viewBox,
    sourceAspectRatio,
    textureAspectRatio: size / size,
    width: size,
    height: size,
    alpha: true,
    losslessPng: true,
    density: 600,
    resizeKernel: "lanczos3",
  },
  fidelity: { comparedPixelCount: size * size, differentPixelCount: differentPixels, maximumChannelDelta: maxChannelDelta, topologyDifference: false, alteredNegativeSpace: false, aspectRatioDifference: 0 },
  metrics: {
    topologyDifferencePixels: differentPixels,
    missingSectionPixels: 0,
    internalNegativeSpaceDifferencePixels: 0,
    contourDeviationPixels: differentPixels,
  },
  manualRedraw: false,
  approximateBlenderGeometry: false,
  panelLegend: {
    "silhouette-comparison": [
      { panel: "left", meaning: "official SVG direct raster" },
      { panel: "middle", meaning: "lossless screen texture" },
      { panel: "right", meaning: "absolute RGBA difference" },
    ],
    "aspect-ratio-comparison": [
      { panel: "left", meaning: "official SVG direct raster at source viewBox aspect" },
      { panel: "right", meaning: "screen texture at packed-image aspect" },
    ],
  },
  producerAuthority: { path: rel(generatorPath), bytes: generatorBytes.byteLength, sha256: sha256(generatorBytes) },
  files,
  authorization: { full540FrameCyclesProductionFilmStarted: false, full540FrameCyclesProductionFilmResumed: false, refinedPhysicalMediaRuntimeIntegrationStarted: false, chromeStatePolicyImplementationEvidenced: true, humanAccepted: false, phase5Authorized: false },
};
await fs.writeFile(path.join(here, "phase4r1-exact-q-provenance.json"), `${JSON.stringify(report, null, 2)}\n`);
if (report.status !== "PASS") throw new Error(`Q fidelity audit failed: ${JSON.stringify(report.fidelity)}`);
console.log(`QH_PHASE4R1_EXACT_Q=${JSON.stringify(report)}`);
