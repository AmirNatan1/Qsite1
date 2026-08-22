import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const DELIVERY_ROOT = path.join(ROOT, "artifacts", "original", "phase-3-crt-opening");
const OUTPUT_ROOT = path.join(ROOT, "public", "media", "cinematic");

const assets = Object.freeze([
  {
    source: "media/phase-3-crt-opening-desktop-vp9.webm",
    output: "phase-3-desktop-vp9-44a1d9facd43.webm",
    bytes: 1_658_294,
    sha256: "44a1d9facd4316eff94e3712917a843b26d32b8012cadaa3f379edff2ffd2fcc",
  },
  {
    source: "media/phase-3-crt-opening-desktop-h264.mp4",
    output: "phase-3-desktop-h264-a73be0bb9890.mp4",
    bytes: 3_499_571,
    sha256: "a73be0bb989077551c0b3405cee2c3fa435b67049bf02b523df20baf0a4fb59e",
  },
  {
    source: "media/phase-3-crt-opening-mobile-vp9.webm",
    output: "phase-3-mobile-vp9-0ffcf12a431b.webm",
    bytes: 647_761,
    sha256: "0ffcf12a431b585f4ce37afd7df6ec0da1e52c4ef3c67d0ab761aaa5d5be517b",
  },
  {
    source: "media/phase-3-crt-opening-mobile-h264.mp4",
    output: "phase-3-mobile-h264-34319f80ae39.mp4",
    bytes: 1_242_276,
    sha256: "34319f80ae397758a3f7d4f192c572cee76c11ba5118a6fadb65c0374b4c99b2",
  },
  {
    source: "review/phase-3-reduced-motion-desktop-1440x900.png",
    output: "phase-3-dormant-desktop-03f5490ab11a.png",
    bytes: 726_026,
    sha256: "03f5490ab11a628eb00c20fa6fc96f72a72593b9ca9da0e8735e55f1c5ffe465",
  },
  {
    source: "review/phase-3-reduced-motion-mobile-390x844.png",
    output: "phase-3-dormant-mobile-9d5c19b1a5e2.png",
    bytes: 209_543,
    sha256: "9d5c19b1a5e294bc82822f44a11b94940829e67162c55783bb55bc5f5c02caad",
  },
  {
    source: "review/phase-3-reduced-motion-mobile-320x800.png",
    output: "phase-3-dormant-narrow-451d05bcc3d5.png",
    bytes: 162_832,
    sha256: "451d05bcc3d53a8c451e01751bdbb5dc3ddd7d68d9cd6e208a69dc58e4684366",
  },
]);

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function verifiedBuffer(asset) {
  const sourcePath = path.join(DELIVERY_ROOT, ...asset.source.split("/"));
  const buffer = await readFile(sourcePath);
  if (buffer.length !== asset.bytes || sha256(buffer) !== asset.sha256) {
    throw new Error(`Accepted Phase 3 authority mismatch: ${asset.source}`);
  }
  return buffer;
}

async function outputMatches(outputPath, asset) {
  try {
    const info = await stat(outputPath);
    if (info.size !== asset.bytes) return false;
    return sha256(await readFile(outputPath)) === asset.sha256;
  } catch {
    return false;
  }
}

await mkdir(OUTPUT_ROOT, { recursive: true });
const expectedOutputs = new Set(assets.map(({ output }) => output));
for (const entry of await readdir(OUTPUT_ROOT, { withFileTypes: true })) {
  if (expectedOutputs.has(entry.name)) continue;
  if (!entry.isFile()) throw new Error(`Unexpected directory in generated Phase 4 media staging: ${entry.name}`);
  await unlink(path.join(OUTPUT_ROOT, entry.name));
}
for (const asset of assets) {
  await verifiedBuffer(asset);
  const sourcePath = path.join(DELIVERY_ROOT, ...asset.source.split("/"));
  const outputPath = path.join(OUTPUT_ROOT, asset.output);
  if (!(await outputMatches(outputPath, asset))) await copyFile(sourcePath, outputPath);
}

console.log(`Staged ${assets.length} hash-verified Phase 3 production assets.`);
