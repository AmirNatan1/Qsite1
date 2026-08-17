import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const projectRoot = process.cwd();
const directory = path.join(projectRoot, "artifacts", "original", "phase-0");
const names = (await readdir(directory)).filter((name) => name.endsWith(".svg")).sort();

assert.equal(names.length, 10, "expected ten original Phase 0 SVG sources");

for (const name of names) {
  const absolute = path.join(directory, name);
  const source = await readFile(absolute, "utf8");
  const metadata = await sharp(Buffer.from(source)).metadata();
  assert.ok(metadata.width && metadata.height, `${name} has no raster dimensions`);
  const geometrySource = source.replace(/<text\b[^>]*>[\s\S]*?<\/text>/gi, "");
  const rendered = await sharp(Buffer.from(geometrySource))
    .resize({ width: 320, withoutEnlargement: true })
    .png()
    .toBuffer();
  assert.ok(rendered.length > 1000, `${name} did not produce a credible raster result`);
}

console.log(`Verified original creative assets: ${names.length}/10 SVGs parsed and vector geometry rasterized.`);
