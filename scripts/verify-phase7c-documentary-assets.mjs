import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { PHASE7C_PARENT } from "./phase7c-contract.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCHEMA = "quantum-hub.phase-7c.documentary-assets.v1";
const LEDGER_PATH = "docs/phase-7c-documentary-asset-ledger.md";
const COMPONENT_PATH = "src/components/home/TerritoryProofThreshold.astro";
const CONTENT_PATH = "src/content/proofs.ts";
const APPROVED_TITLE = "Maradin — Dynamic Ground Projection";
const APPROVED_SUMMARY = "A real-world field test of Maradin’s MEMS-based laser scanning technology for vehicle‑to‑road visual communication.";
const APPROVED_POSTER_ALT = "A vehicle on a road at night in a real field environment.";

export const PHASE7C_MARADIN_ASSETS = Object.freeze([
  Object.freeze({
    id: "MARADIN-IMG-001",
    path: "public/media/maradin/maradin-field-aperture-poster-approved.jpg",
    kind: "image",
    bytes: 86_343,
    sha256: "6afc1a69570f2541b89b4f6a5074bec04a5d607743d91670321f550b4d6364bd",
    width: 1920,
    height: 1080,
    decision: "ACCEPT",
    disposition: "ACCEPT — selected",
  }),
  Object.freeze({
    id: "MARADIN-IMG-002",
    path: "public/media/maradin/maradin-prove-field-frame-approved.jpg",
    kind: "image",
    bytes: 169_156,
    sha256: "b85f1bd5413b6fe7da235e5217e16b106ae4ff0763e8deb9db6e509dbc0b8b8c",
    width: 1920,
    height: 1080,
    decision: "REJECT",
    disposition: "REJECT — not needed in addition to the selected poster",
  }),
  Object.freeze({
    id: "MARADIN-IMG-003",
    path: "public/media/maradin/maradin-real-field-still-approved.jpg",
    kind: "image",
    bytes: 961_699,
    sha256: "49ab9aca0d2e3ef9e9ce164f43f9dbd1514ef815179626bef2bb4217827a6741",
    width: 3840,
    height: 2160,
    decision: "REVIEW REQUIRED",
    disposition: "REVIEW REQUIRED — do not use",
  }),
  Object.freeze({
    id: "MARADIN-VID-001",
    path: "public/media/maradin/maradin-field-aperture-approved.mp4",
    kind: "video",
    bytes: 3_962_341,
    sha256: "daaec510c528bd7f72a97cfce1d9ede3359ec1339e28e26f524d127f09bf247c",
    width: 1920,
    height: 1080,
    decision: "REJECT",
    disposition: "REJECT — no homepage player",
  }),
  Object.freeze({
    id: "MARADIN-VID-002",
    path: "public/media/maradin/maradin-test-contact-approved.mp4",
    kind: "video",
    bytes: 4_133_483,
    sha256: "076aecf40d9e67ac29eb0b8e2d34ffc374619862a9679a6e44bc08ccfd2c113d",
    width: 1920,
    height: 1080,
    decision: "REJECT",
    disposition: "REJECT — no homepage player",
  }),
]);

const ACCEPTED_ASSET = PHASE7C_MARADIN_ASSETS.find(({ decision }) => decision === "ACCEPT");
assert.ok(ACCEPTED_ASSET, "one accepted Phase 7C documentary asset is required");

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function commaInteger(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function occurrences(source, needle) {
  if (!needle) return 0;
  let count = 0;
  let cursor = 0;
  while ((cursor = source.indexOf(needle, cursor)) !== -1) {
    count += 1;
    cursor += needle.length;
  }
  return count;
}

async function exists(filename) {
  try {
    await access(filename);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function git(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `git ${args.join(" ")} failed`).trim());
  }
  return result.stdout.trim();
}

const JPEG_START_OF_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf,
]);

export function readJpegDimensions(bytes) {
  invariant(Buffer.isBuffer(bytes), "JPEG inspection requires a Buffer");
  invariant(bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8, "JPEG signature is invalid");

  let offset = 2;
  while (offset + 3 < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;

    const marker = bytes[offset];
    offset += 1;
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) continue;
    invariant(offset + 2 <= bytes.length, "JPEG segment length is truncated");
    const segmentLength = bytes.readUInt16BE(offset);
    invariant(segmentLength >= 2 && offset + segmentLength <= bytes.length, "JPEG segment exceeds the file boundary");

    if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
      invariant(segmentLength >= 7, "JPEG start-of-frame segment is truncated");
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      invariant(width > 0 && height > 0, "JPEG dimensions are empty");
      return Object.freeze({ width, height, format: "JPEG" });
    }

    if (marker === 0xda || marker === 0xd9) break;
    offset += segmentLength;
  }

  throw new Error("JPEG start-of-frame dimensions were not found");
}

const VIDEO_SAMPLE_ENTRY_TYPES = Object.freeze(["avc1", "avc2", "avc3", "avc4", "hvc1", "hev1", "vp09", "av01"]);

export function readMp4Dimensions(bytes) {
  invariant(Buffer.isBuffer(bytes), "MP4 inspection requires a Buffer");
  invariant(bytes.length >= 16 && bytes.toString("ascii", 4, 8) === "ftyp", "MP4 ftyp signature is invalid");

  const dimensions = [];
  for (const type of VIDEO_SAMPLE_ENTRY_TYPES) {
    const signature = Buffer.from(type, "ascii");
    let cursor = 0;
    while ((cursor = bytes.indexOf(signature, cursor)) !== -1) {
      const entryStart = cursor - 4;
      if (entryStart >= 0 && cursor + 32 <= bytes.length) {
        const entrySize = bytes.readUInt32BE(entryStart);
        const width = bytes.readUInt16BE(cursor + 28);
        const height = bytes.readUInt16BE(cursor + 30);
        const entryEnd = entryStart + entrySize;
        if (entrySize >= 86 && entryEnd <= bytes.length && width > 0 && height > 0) {
          dimensions.push({ width, height, sampleEntry: type });
        }
      }
      cursor += signature.length;
    }
  }

  invariant(dimensions.length > 0, "MP4 visual sample-entry dimensions were not found");
  const unique = new Set(dimensions.map(({ width, height }) => `${width}x${height}`));
  invariant(unique.size === 1, "MP4 contains conflicting visual sample-entry dimensions");
  return Object.freeze({ ...dimensions[0], format: "MP4" });
}

export function readMediaDimensions(asset, bytes) {
  if (asset.kind === "image") return readJpegDimensions(bytes);
  if (asset.kind === "video") return readMp4Dimensions(bytes);
  throw new Error(`Unsupported documentary asset kind: ${asset.kind}`);
}

export async function inspectGovernedAssets(root = process.cwd(), base = "public") {
  const records = [];
  for (const asset of PHASE7C_MARADIN_ASSETS) {
    const relative = base === "public" ? asset.path : path.posix.join(base, asset.path.slice("public/".length));
    const filename = path.join(root, ...relative.split("/"));
    const bytes = await readFile(filename);
    const dimensions = readMediaDimensions(asset, bytes);
    const actual = {
      bytes: bytes.length,
      sha256: digest(bytes),
      width: dimensions.width,
      height: dimensions.height,
      format: dimensions.format,
    };

    assert.equal(actual.bytes, asset.bytes, `${relative} byte count differs from documentary authority`);
    assert.equal(actual.sha256, asset.sha256, `${relative} SHA-256 differs from documentary authority`);
    assert.equal(actual.width, asset.width, `${relative} encoded width differs from documentary authority`);
    assert.equal(actual.height, asset.height, `${relative} encoded height differs from documentary authority`);

    records.push({
      id: asset.id,
      path: relative.replaceAll("\\", "/"),
      kind: asset.kind,
      decision: asset.decision,
      expected: {
        bytes: asset.bytes,
        sha256: asset.sha256,
        width: asset.width,
        height: asset.height,
      },
      actual,
      status: "PASS",
    });
  }
  return records;
}

function sectionForAsset(ledger, asset) {
  const marker = `| Repository path | \`${asset.path}\` |`;
  const markerIndex = ledger.indexOf(marker);
  invariant(markerIndex >= 0, `${asset.id} repository path is absent from the documentary ledger`);
  const sectionStart = ledger.lastIndexOf("\n### ", markerIndex);
  invariant(sectionStart >= 0, `${asset.id} ledger section heading is absent`);
  const nextSubsection = ledger.indexOf("\n### ", markerIndex + marker.length);
  const nextSection = ledger.indexOf("\n## ", markerIndex + marker.length);
  const candidates = [nextSubsection, nextSection].filter((index) => index >= 0);
  const sectionEnd = candidates.length > 0 ? Math.min(...candidates) : ledger.length;
  return ledger.slice(sectionStart, sectionEnd);
}

export function validateAssetLedger(ledger) {
  invariant(typeof ledger === "string" && ledger.length > 0, "documentary asset ledger is empty");
  const decisions = [];

  for (const asset of PHASE7C_MARADIN_ASSETS) {
    const section = sectionForAsset(ledger, asset);
    invariant(section.includes(`| Byte size | ${commaInteger(asset.bytes)} |`), `${asset.id} ledger byte authority differs`);
    invariant(section.includes(`| SHA-256 | \`${asset.sha256}\` |`), `${asset.id} ledger SHA-256 authority differs`);
    invariant(section.includes(`${asset.width} × ${asset.height}`), `${asset.id} ledger dimensions differ`);
    invariant(section.includes(`| Phase 7C decision | **${asset.decision}** |`), `${asset.id} ledger decision differs`);

    const basename = path.posix.basename(asset.path);
    const dispositionRow = `| \`${basename}\` | **${asset.disposition}** |`;
    invariant(ledger.includes(dispositionRow), `${asset.id} final disposition row differs`);
    decisions.push({ id: asset.id, path: asset.path, decision: asset.decision, disposition: asset.disposition, status: "PASS" });
  }

  invariant(decisions.filter(({ decision }) => decision === "ACCEPT").length === 1, "the ledger must accept exactly one homepage asset");
  invariant(decisions.filter(({ decision }) => decision === "REVIEW REQUIRED").length === 1, "the ledger must retain exactly one review-required asset");
  invariant(decisions.filter(({ decision }) => decision === "REJECT").length === 3, "the ledger must reject exactly three homepage assets");
  return { path: LEDGER_PATH, decisions, status: "PASS" };
}

export function validateComponentSource(source) {
  invariant(typeof source === "string" && source.length > 0, "Territory Proof component source is empty");
  invariant(/import\s*\{[^}]*PUBLIC_INDUSTRIES[^}]*maradinProofRecord[^}]*\}\s*from\s*["']\.\.\/\.\.\/content["']/.test(source), "component must import the governed industry and Proof authorities");
  invariant(/maradinProofRecord\.media\.find\([\s\S]*?id\s*===\s*["']maradin-field-aperture-poster["']/.test(source), "component must select the governed poster record by id");

  const imageTags = source.match(/<img\b[^>]*>/gi) ?? [];
  invariant(imageTags.length === 1, "component must emit exactly one documentary image");
  const image = imageTags[0];
  invariant(/src=\{proofPoster\.src\}/.test(image), "documentary image source must come from the approved poster record");
  invariant(/alt=\{proofPoster\.alt\}/.test(image), "documentary image alternative text must come from the approved poster record");
  invariant(/width=\{proofPoster\.width\}/.test(image), "documentary image must retain its governed intrinsic width");
  invariant(/height=\{proofPoster\.height\}/.test(image), "documentary image must retain its governed intrinsic height");
  invariant(/loading=["']lazy["']/.test(image), "documentary image must load lazily");

  const acceptedPublicPath = `/${ACCEPTED_ASSET.path.slice("public/".length)}`;
  invariant(occurrences(source, acceptedPublicPath) === 1, "the accepted poster path must be governed exactly once in component source");
  invariant(occurrences(source, "{maradinProofRecord.summary}") === 1, "component must render the approved summary exactly once");
  invariant(occurrences(source, "{maradinProofRecord.title}") === 1, "component must render the approved Proof title exactly once");
  invariant(occurrences(source, 'href="/pocs/maradin/"') === 1, "component must expose one ordinary Maradin record link");

  for (const asset of PHASE7C_MARADIN_ASSETS) {
    if (asset.decision === "ACCEPT") continue;
    const basename = path.posix.basename(asset.path);
    invariant(!source.includes(basename), `${asset.id} (${asset.decision}) must not be referenced by the component`);
  }

  invariant(!/<(?:video|source|track|audio|iframe)\b/i.test(source), "component must not add a video, source, track, audio or embedded player node");
  invariant(!/\.mp4\b|\b(?:autoplay|preload|player)\b/i.test(source), "component must not add a video URL or player lifecycle");

  return {
    path: COMPONENT_PATH,
    acceptedAsset: ACCEPTED_ASSET.path,
    acceptedAssetPathOccurrences: 1,
    imageElements: 1,
    lazyImages: 1,
    intrinsicDimensions: { width: ACCEPTED_ASSET.width, height: ACCEPTED_ASSET.height },
    rejectedOrReviewAssetReferences: 0,
    videoSourcePlayerElements: 0,
    maradinLinks: 1,
    status: "PASS",
  };
}

export function validateProofContentAuthority(source) {
  invariant(typeof source === "string" && source.length > 0, "Maradin Proof content authority is empty");
  const posterMarker = 'id: "maradin-field-aperture-poster"';
  const posterStart = source.indexOf(posterMarker);
  invariant(posterStart >= 0, "Maradin poster media record is absent from the content authority");
  const nextRecord = source.indexOf("\n  {", posterStart + posterMarker.length);
  const posterRecord = source.slice(posterStart, nextRecord >= 0 ? nextRecord : source.length);

  invariant(posterRecord.includes(`src: "/${ACCEPTED_ASSET.path.slice("public/".length)}"`), "Maradin poster content path differs");
  invariant(posterRecord.includes(`alt: "${APPROVED_POSTER_ALT}"`), "Maradin poster alternative text differs");
  invariant(posterRecord.includes(`width: ${ACCEPTED_ASSET.width}`), "Maradin poster content width differs");
  invariant(posterRecord.includes(`height: ${ACCEPTED_ASSET.height}`), "Maradin poster content height differs");
  invariant(source.includes(`title: "${APPROVED_TITLE}"`), "Maradin Proof title authority differs");
  invariant(source.includes(`summary: "${APPROVED_SUMMARY}"`), "Maradin Proof summary authority differs");

  return {
    path: CONTENT_PATH,
    title: APPROVED_TITLE,
    summary: APPROVED_SUMMARY,
    posterAlt: APPROVED_POSTER_ALT,
    poster: ACCEPTED_ASSET.path,
    status: "PASS",
  };
}

export function verifyMediaGitBoundary(root = process.cwd(), parent = PHASE7C_PARENT) {
  const parentCommit = git(root, ["rev-parse", `${parent}^{commit}`]);
  assert.equal(parentCommit, parent, "Phase 7C parent authority is unavailable or differs");
  const trackedText = git(root, ["diff", "--name-status", parent, "--", "public/media"]);
  const untrackedText = git(root, ["ls-files", "--others", "--exclude-standard", "--", "public/media"]);
  const trackedChanges = trackedText ? trackedText.split(/\r?\n/).filter(Boolean) : [];
  const untrackedFiles = untrackedText ? untrackedText.split(/\r?\n/).filter(Boolean) : [];
  assert.deepEqual(trackedChanges, [], "Phase 7C must not change tracked production media");
  assert.deepEqual(untrackedFiles, [], "Phase 7C must not add untracked production media");
  return {
    parent,
    scope: "public/media",
    trackedChanges,
    untrackedFiles,
    newAssetFiles: 0,
    newAssetBytes: 0,
    status: "PASS",
  };
}

export async function verifyOptionalDistParity(root = process.cwd()) {
  const distIndex = path.join(root, "dist", "index.html");
  if (!await exists(distIndex)) {
    return {
      status: "NOT OBSERVED",
      reason: "dist/index.html is absent; source authority remains fully verified and built-byte parity is deferred until a build exists",
      assets: [],
    };
  }

  const assets = await inspectGovernedAssets(root, "dist");
  return {
    status: "PASS",
    buildMarker: "dist/index.html",
    assets,
  };
}

export async function verifyPhase7CDocumentaryAssets(root = process.cwd()) {
  const [assetRecords, ledger, component, content, dist] = await Promise.all([
    inspectGovernedAssets(root),
    readFile(path.join(root, ...LEDGER_PATH.split("/")), "utf8"),
    readFile(path.join(root, ...COMPONENT_PATH.split("/")), "utf8"),
    readFile(path.join(root, ...CONTENT_PATH.split("/")), "utf8"),
    verifyOptionalDistParity(root),
  ]);
  const ledgerReport = validateAssetLedger(ledger);
  const componentReport = validateComponentSource(component);
  const contentReport = validateProofContentAuthority(content);
  const mediaDelta = verifyMediaGitBoundary(root);
  const totalBytes = assetRecords.reduce((sum, record) => sum + record.actual.bytes, 0);

  return {
    schema: SCHEMA,
    status: "PASS",
    parent: PHASE7C_PARENT,
    authority: {
      assetCount: assetRecords.length,
      acceptedHomepageAssets: 1,
      reviewRequiredHomepageAssets: 1,
      rejectedHomepageAssets: 3,
      totalBytes,
      newAssetFiles: 0,
      newAssetBytes: 0,
    },
    assets: assetRecords,
    ledger: ledgerReport,
    content: contentReport,
    component: componentReport,
    mediaDelta,
    distParity: dist,
  };
}

function failureReport(error) {
  return {
    schema: SCHEMA,
    status: "FAIL",
    error: {
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  try {
    process.stdout.write(`${JSON.stringify(await verifyPhase7CDocumentaryAssets(), null, 2)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(failureReport(error), null, 2)}\n`);
    process.exitCode = 1;
  }
}
