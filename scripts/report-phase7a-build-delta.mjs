import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";

const SCRIPT_PATH = fileURLToPath(import.meta.url);

export const PHYSICAL_OPENING_PREFIX = "media/cinematic/";

export const CATEGORY_ORDER = Object.freeze([
  "html",
  "css",
  "javascript",
  "fonts",
  "physical-opening-media",
  "maradin-media",
  "images",
  "data",
  "other",
]);

const COMPRESSIBLE_EXTENSIONS = new Set([
  ".css",
  ".csv",
  ".html",
  ".js",
  ".json",
  ".map",
  ".mjs",
  ".svg",
  ".txt",
  ".xml",
]);

const COMPRESSIBLE_BASENAMES = new Set(["_headers", "_redirects"]);

const codepointCompare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const sha256 = (payload) => createHash("sha256").update(payload).digest("hex");
const normalizedPath = (value) => value.replaceAll(path.sep, "/");

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function categoryFor(relativePath) {
  if (relativePath.startsWith(PHYSICAL_OPENING_PREFIX)) return "physical-opening-media";
  if (relativePath.startsWith("media/maradin/")) return "maradin-media";

  const extension = path.posix.extname(relativePath).toLowerCase();
  if (extension === ".html") return "html";
  if (extension === ".css") return "css";
  if ([".js", ".mjs", ".cjs"].includes(extension)) return "javascript";
  if ([".woff", ".woff2", ".ttf", ".otf", ".eot"].includes(extension)) return "fonts";
  if ([".avif", ".gif", ".ico", ".jpeg", ".jpg", ".png", ".svg", ".webp"].includes(extension)) return "images";
  if ([".csv", ".json", ".map", ".txt", ".xml"].includes(extension)) return "data";
  return "other";
}

function compressedLengths(relativePath, payload) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  const basename = path.posix.basename(relativePath);
  const compressible = COMPRESSIBLE_EXTENSIONS.has(extension) || COMPRESSIBLE_BASENAMES.has(basename);
  if (!compressible) {
    return { compression: "identity", gzipBytes: payload.length, brotliBytes: payload.length };
  }

  return {
    compression: "compressed",
    gzipBytes: gzipSync(payload, { level: 9, mtime: 0 }).length,
    brotliBytes: brotliCompressSync(payload, {
      params: {
        [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
        [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
      },
    }).length,
  };
}

async function inventoryDirectory(root) {
  const inventory = [];

  async function visit(directory) {
    const entries = (await readdir(directory, { withFileTypes: true }))
      .sort((left, right) => codepointCompare(left.name, right.name));

    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Build directories must not contain symbolic links: ${absolute}`);
      if (entry.isDirectory()) {
        await visit(absolute);
        continue;
      }
      if (!entry.isFile()) throw new Error(`Unsupported build-directory entry: ${absolute}`);

      const relative = normalizedPath(path.relative(root, absolute));
      const payload = await readFile(absolute);
      const compressed = compressedLengths(relative, payload);
      inventory.push({
        path: relative,
        category: categoryFor(relative),
        rawBytes: payload.length,
        sha256: sha256(payload),
        ...compressed,
      });
    }
  }

  await visit(root);
  return inventory.sort((left, right) => codepointCompare(left.path, right.path));
}

function emptyTotals() {
  return { files: 0, rawBytes: 0, gzipBytes: 0, brotliBytes: 0 };
}

function addEntry(totals, entry) {
  totals.files += 1;
  totals.rawBytes += entry.rawBytes;
  totals.gzipBytes += entry.gzipBytes;
  totals.brotliBytes += entry.brotliBytes;
}

function summarize(inventory) {
  const categories = Object.fromEntries(CATEGORY_ORDER.map((category) => [category, emptyTotals()]));
  const totals = emptyTotals();
  for (const entry of inventory) {
    addEntry(categories[entry.category], entry);
    addEntry(totals, entry);
  }
  return { categories, totals };
}

function subtract(left, right) {
  return {
    files: left.files - right.files,
    rawBytes: left.rawBytes - right.rawBytes,
    gzipBytes: left.gzipBytes - right.gzipBytes,
    brotliBytes: left.brotliBytes - right.brotliBytes,
  };
}

function compareCategories(accepted, phase7a) {
  return Object.fromEntries(CATEGORY_ORDER.map((category) => [category, {
    accepted: accepted[category],
    phase7a: phase7a[category],
    delta: subtract(phase7a[category], accepted[category]),
  }]));
}

function inventoryChanges(acceptedInventory, phase7aInventory) {
  const accepted = new Map(acceptedInventory.map((entry) => [entry.path, entry]));
  const phase7a = new Map(phase7aInventory.map((entry) => [entry.path, entry]));
  const paths = [...new Set([...accepted.keys(), ...phase7a.keys()])].sort(codepointCompare);
  const changes = { added: [], removed: [], changed: [], unchanged: [] };

  for (const relative of paths) {
    const before = accepted.get(relative);
    const after = phase7a.get(relative);
    if (!before) changes.added.push(after);
    else if (!after) changes.removed.push(before);
    else if (before.sha256 === after.sha256) changes.unchanged.push(relative);
    else changes.changed.push({ path: relative, accepted: before, phase7a: after });
  }

  return changes;
}

function comparisonFor(acceptedInventory, phase7aInventory) {
  const accepted = summarize(acceptedInventory);
  const phase7a = summarize(phase7aInventory);
  return {
    totals: {
      accepted: accepted.totals,
      phase7a: phase7a.totals,
      delta: subtract(phase7a.totals, accepted.totals),
    },
    categories: compareCategories(accepted.categories, phase7a.categories),
    changes: inventoryChanges(acceptedInventory, phase7aInventory),
  };
}

export async function createBuildDeltaReport({ acceptedDist, phase7aDist }) {
  if (!acceptedDist || !phase7aDist) throw new Error("Both acceptedDist and phase7aDist are required");
  const acceptedRoot = await realpath(path.resolve(acceptedDist));
  const phase7aRoot = await realpath(path.resolve(phase7aDist));
  if (acceptedRoot === phase7aRoot) throw new Error("Accepted and Phase 7A dist directories must be different");

  const [acceptedInventory, phase7aInventory] = await Promise.all([
    inventoryDirectory(acceptedRoot),
    inventoryDirectory(phase7aRoot),
  ]);
  const phase7aByPath = new Map(phase7aInventory.map((entry) => [entry.path, entry]));
  const excludedPhysicalOpening = acceptedInventory.filter((entry) => {
    if (entry.category !== "physical-opening-media") return false;
    const candidate = phase7aByPath.get(entry.path);
    return candidate?.category === "physical-opening-media"
      && candidate.rawBytes === entry.rawBytes
      && candidate.sha256 === entry.sha256;
  });
  const excludedPaths = new Set(excludedPhysicalOpening.map((entry) => entry.path));
  const acceptedIsolated = acceptedInventory.filter((entry) => !excludedPaths.has(entry.path));
  const phase7aIsolated = phase7aInventory.filter((entry) => !excludedPaths.has(entry.path));

  return {
    schema: "quantum-hub.phase-7a.build-delta.v1",
    inputs: {
      acceptedDist: normalizedPath(acceptedRoot),
      phase7aDist: normalizedPath(phase7aRoot),
    },
    compression: {
      policy: "Text-like files use deterministic compression; precompressed and binary files count at identity bytes.",
      gzipLevel: 9,
      brotliQuality: 11,
    },
    builds: {
      accepted: { inventory: acceptedInventory, ...summarize(acceptedInventory) },
      phase7a: { inventory: phase7aInventory, ...summarize(phase7aInventory) },
    },
    comparisons: {
      complete: comparisonFor(acceptedInventory, phase7aInventory),
      signalFieldIsolated: {
        exclusion: `Files under ${PHYSICAL_OPENING_PREFIX} are excluded only when path and SHA-256 are unchanged.`,
        excludedPhysicalOpening: {
          inventory: excludedPhysicalOpening,
          ...summarize(excludedPhysicalOpening),
        },
        ...comparisonFor(acceptedIsolated, phase7aIsolated),
      },
    },
  };
}

export async function writeBuildDeltaReport({ acceptedDist, phase7aDist, output }) {
  if (!output) throw new Error("An explicit external output JSON path is required");
  if (path.extname(output).toLowerCase() !== ".json") throw new Error("Output path must end in .json");

  const acceptedRoot = await realpath(path.resolve(acceptedDist));
  const phase7aRoot = await realpath(path.resolve(phase7aDist));
  const outputPath = path.resolve(output);
  if (isInside(acceptedRoot, outputPath) || isInside(phase7aRoot, outputPath)) {
    throw new Error("Output JSON must be external to both prebuilt dist directories");
  }

  const report = await createBuildDeltaReport({ acceptedDist: acceptedRoot, phase7aDist: phase7aRoot });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

export function parseArguments(argv) {
  const values = {};
  const names = new Map([
    ["--accepted-dist", "acceptedDist"],
    ["--phase7a-dist", "phase7aDist"],
    ["--output", "output"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    const name = names.get(option);
    if (!name) throw new Error(`Unknown argument: ${option}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${option}`);
    if (values[name]) throw new Error(`Duplicate argument: ${option}`);
    values[name] = value;
    index += 1;
  }

  for (const [option, name] of names) {
    if (!values[name]) throw new Error(`Missing required argument: ${option}`);
  }
  return values;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const report = await writeBuildDeltaReport(options);
    process.stdout.write(`${JSON.stringify({
      schema: report.schema,
      output: normalizedPath(path.resolve(options.output)),
      completeDelta: report.comparisons.complete.totals.delta,
      signalFieldDelta: report.comparisons.signalFieldIsolated.totals.delta,
      excludedPhysicalFiles: report.comparisons.signalFieldIsolated.excludedPhysicalOpening.totals.files,
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
