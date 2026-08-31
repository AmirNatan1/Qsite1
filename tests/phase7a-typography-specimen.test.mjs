import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const specimenDirectory = path.join(root, "artifacts/original/phase-7a-typography-candidates");
const specimenPath = path.join(specimenDirectory, "specimens.html");

const candidates = [
  "Anybody",
  "Mona Sans",
  "Bricolage Grotesque",
  "Archivo",
];

const fontAuthority = new Map([
  ["anybody-variable.woff2", [69612, "27bf65457ce65fb6fdad625c5003cf14e2e6492afc30671ec9ec8fd1efb16fdb"]],
  ["mona-sans-v2.0.27-variable.woff2", [307976, "875ad1fab0c1f4854927fa8086963fb6ddd4608b04a58b267cddf8a9d78f80d3"]],
  ["bricolage-grotesque-variable.woff2", [204636, "b51a8ebd169637e47cb7db430431ab3e122d2f09b03ee2a03ea06f4cb46f1a8e"]],
  ["archivo-variable.ttf", [658596, "664bbeb10522dac35c174a3860aaecad7b1ad3a0fc8b0d26888e26c824ec556d"]],
]);

const sha256 = async (filename) => createHash("sha256").update(await readFile(filename)).digest("hex");

test("portable typography specimen exposes exactly four candidate comparisons", async () => {
  const source = await readFile(specimenPath, "utf8");
  const articles = source.match(/<article\b[\s\S]*?<\/article>/g) ?? [];

  assert.equal(articles.length, 4);
  for (const candidate of candidates) {
    const article = articles.find((entry) => entry.includes(`data-candidate="${candidate}"`));
    assert.ok(article, `missing ${candidate} specimen`);
    assert.equal((article.match(/class="state state--stored"/g) ?? []).length, 1);
    assert.equal((article.match(/class="state state--resolved"/g) ?? []).length, 1);
    assert.equal((article.match(/WE TURN INDUSTRIAL NEEDS INTO FIELD EVIDENCE\./g) ?? []).length, 2);
    assert.equal((article.match(/Industry 4\.0 \/ Advanced Manufacturing/g) ?? []).length, 2);
  }

  assert.match(source, /font-stretch:\s*var\(--stored-stretch\)/);
  assert.match(source, /font-stretch:\s*var\(--resolved-stretch\)/);
  assert.doesNotMatch(source, /transform:\s*scaleX/);
});

test("specimen font sources are relative, local and hash-verified", async () => {
  const source = await readFile(specimenPath, "utf8");
  const urls = [...source.matchAll(/src:\s*url\("([^"]+)"\)/g)].map((match) => match[1]);

  assert.deepEqual(urls, [...fontAuthority.keys()].map((filename) => `./${filename}`));
  assert.doesNotMatch(source, /https?:\/\/|url\("\//);

  for (const [filename, [bytes, expectedHash]] of fontAuthority) {
    const absolute = path.join(specimenDirectory, filename);
    await access(absolute);
    assert.equal((await stat(absolute)).size, bytes, `${filename} byte count changed`);
    assert.equal(await sha256(absolute), expectedHash, `${filename} hash changed`);
  }
});

test("portable candidate folder retains one licence for every proof font", async () => {
  const licences = [
    "OFL-Anybody.txt",
    "OFL-Mona-Sans.txt",
    "OFL-Bricolage-Grotesque.txt",
    "OFL-Archivo.txt",
  ];

  for (const licence of licences) await access(path.join(specimenDirectory, licence));
});
