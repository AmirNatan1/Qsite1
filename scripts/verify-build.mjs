import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outputRoot = path.join(root, "dist");

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute)));
    else files.push(absolute);
  }
  return files;
}

const indexPath = path.join(outputRoot, "index.html");
const index = await readFile(indexPath, "utf8");
const files = await walk(outputRoot);
const relativeFiles = files.map((file) => path.relative(outputRoot, file).replaceAll("\\", "/"));

assert.match(index, /<main\b/i, "built root must contain a main landmark");
assert.match(index, /<h1\b/i, "built root must contain an h1");
assert.match(index, /Prove it where it has to work\./, "built root must contain the approved proposition");
assert.match(index, /For industry/, "built root must contain the approved industry label");
assert.match(index, /For startups/, "built root must contain the approved startup label");
assert.doesNotMatch(index, /<form\b/i, "Phase 0 output must not contain a form");
assert.doesNotMatch(index, /Defense|dual[- ]use|testimonial|coming soon|lorem ipsum/i, "prohibited launch copy leaked");
assert.doesNotMatch(index, /href=["']\/(?:for-partners|for-startups|industries|pocs|spark|about|contact)/i, "fake route leaked");

for (const prohibited of [
  /^_worker\.js$/i,
  /(?:^|\/)functions(?:\/|$)/i,
  /server-entry/i,
  /server-render/i,
]) {
  assert.equal(relativeFiles.some((file) => prohibited.test(file)), false, `unexpected server output: ${prohibited}`);
}

for (const file of files) {
  const metadata = await stat(file);
  assert.ok(metadata.size < 25 * 1024 * 1024, `${path.relative(root, file)} exceeds the Cloudflare Pages asset limit`);
  if (!/\.(?:html|css|js|mjs|json|svg|txt|xml)$/i.test(file)) continue;
  const contents = await readFile(file, "utf8");
  assert.doesNotMatch(contents, /[A-Z]:[\\/]Users[\\/][^\\/\s]+[\\/]/i, `private path leaked from ${file}`);
}

const totalBytes = (await Promise.all(files.map(async (file) => (await stat(file)).size))).reduce(
  (sum, size) => sum + size,
  0,
);

console.log(`Verified static output: ${relativeFiles.length} files, ${totalBytes} bytes, semantic /, no server runtime.`);
