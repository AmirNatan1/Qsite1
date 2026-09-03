import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";

import {
  PHASE7C_DOCUMENTARY_ASSET,
  PHASE7C_PARENT,
  PHASE7C_PERFORMANCE_BUDGET,
  PHASE7C_PRODUCTION_PATHS,
} from "./phase7c-contract.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCHEMA = "quantum-hub.phase-7c.build-delta.v1";

export const BUILD_CATEGORIES = Object.freeze([
  "html",
  "javascript",
  "css",
  "static-asset",
  "deployment-control",
  "other",
]);

const CODE_CATEGORIES = Object.freeze(["html", "javascript", "css"]);
const STATIC_ASSET_EXTENSIONS = new Set([
  ".avif", ".gif", ".ico", ".jpeg", ".jpg", ".png", ".svg", ".webp",
  ".mp3", ".mp4", ".ogg", ".wav", ".webm",
  ".eot", ".otf", ".ttf", ".woff", ".woff2",
]);
const DEPLOYMENT_CONTROL_FILES = new Set(["_headers", "_redirects"]);

const compareCodepoints = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const normalizedPath = (value) => value.replaceAll("\\", "/");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function invariant(condition, message) {
  if (!condition) throw new Error(message);
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

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function reportPath(repository, filename) {
  const relative = normalizedPath(path.relative(repository, filename));
  return relative && !relative.startsWith("../") ? relative : `[external]/${path.basename(filename)}`;
}

function gitResult(root, args, options = {}) {
  return spawnSync("git", args, {
    cwd: root,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

function gitText(root, args) {
  const result = gitResult(root, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `git ${args.join(" ")} failed`).trim());
  return result.stdout.trim();
}

function gitBlob(root, objectId) {
  const result = gitResult(root, ["cat-file", "blob", objectId]);
  if (result.status !== 0) {
    throw new Error((result.stderr?.toString("utf8") || `git cat-file blob ${objectId} failed`).trim());
  }
  return result.stdout;
}

function blobAtRef(root, ref, relativePath) {
  const specifier = `${ref}:${relativePath}`;
  const probe = gitResult(root, ["rev-parse", "--verify", "--quiet", specifier], { encoding: "utf8" });
  if (probe.status !== 0) return null;
  const objectId = probe.stdout.trim();
  const type = gitText(root, ["cat-file", "-t", objectId]);
  invariant(type === "blob", `${specifier} is not a Git blob`);
  const bytes = gitBlob(root, objectId);
  return {
    exists: true,
    rawBytes: bytes.length,
    sha256: digest(bytes),
    gitObjectId: objectId,
    authority: "exact-git-blob",
  };
}

function worktreeBlobIdentity(root, bytes) {
  const result = gitResult(root, ["hash-object", "--stdin"], { input: bytes, encoding: "utf8" });
  if (result.status !== 0) throw new Error((result.stderr || "git hash-object --stdin failed").trim());
  return result.stdout.trim();
}

function categoryFor(relativePath) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  const basename = path.posix.basename(relativePath);
  if (extension === ".html") return "html";
  if ([".js", ".mjs", ".cjs"].includes(extension)) return "javascript";
  if (extension === ".css") return "css";
  if (DEPLOYMENT_CONTROL_FILES.has(basename)) return "deployment-control";
  if (
    relativePath.startsWith("media/") ||
    relativePath.startsWith("fonts/") ||
    relativePath.startsWith("images/") ||
    STATIC_ASSET_EXTENSIONS.has(extension)
  ) return "static-asset";
  return "other";
}

function compressedCodeLengths(category, bytes) {
  if (!CODE_CATEGORIES.includes(category)) return null;
  return {
    rawBytes: bytes.length,
    gzipBytes: gzipSync(bytes, { level: 9, mtime: 0 }).length,
    brotliBytes: brotliCompressSync(bytes, {
      params: {
        [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
        [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
      },
    }).length,
  };
}

export async function inventoryBuild(directory) {
  let root;
  try {
    root = await realpath(path.resolve(directory));
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`Required build directory does not exist: ${directory}`);
    throw error;
  }
  invariant(await exists(path.join(root, "index.html")), `Required build is incomplete; index.html is absent: ${directory}`);

  const inventory = [];
  async function visit(current) {
    const entries = (await readdir(current, { withFileTypes: true })).sort((left, right) => compareCodepoints(left.name, right.name));
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      invariant(!entry.isSymbolicLink(), `Build directories must not contain symbolic links: ${entry.name}`);
      if (entry.isDirectory()) {
        await visit(absolute);
        continue;
      }
      invariant(entry.isFile(), `Unsupported build entry: ${entry.name}`);
      const relative = normalizedPath(path.relative(root, absolute));
      const bytes = await readFile(absolute);
      const category = categoryFor(relative);
      inventory.push({
        path: relative,
        category,
        rawBytes: bytes.length,
        sha256: digest(bytes),
        compression: compressedCodeLengths(category, bytes),
      });
    }
  }

  await visit(root);
  invariant(inventory.length > 0, `Required build is empty: ${directory}`);
  return { root, inventory: inventory.sort((left, right) => compareCodepoints(left.path, right.path)) };
}

function emptyCodeTotals() {
  return { files: 0, rawBytes: 0, gzipBytes: 0, brotliBytes: 0 };
}

function addCode(totals, entry) {
  totals.files += 1;
  totals.rawBytes += entry.compression.rawBytes;
  totals.gzipBytes += entry.compression.gzipBytes;
  totals.brotliBytes += entry.compression.brotliBytes;
}

function summarizeCode(inventory) {
  const categories = Object.fromEntries(CODE_CATEGORIES.map((category) => [category, emptyCodeTotals()]));
  const aggregate = emptyCodeTotals();
  for (const entry of inventory) {
    if (!CODE_CATEGORIES.includes(entry.category)) continue;
    addCode(categories[entry.category], entry);
    addCode(aggregate, entry);
  }
  return { categories, aggregate };
}

function subtractMetrics(current, parent) {
  return {
    files: current.files - parent.files,
    rawBytes: current.rawBytes - parent.rawBytes,
    gzipBytes: current.gzipBytes - parent.gzipBytes,
    brotliBytes: current.brotliBytes - parent.brotliBytes,
  };
}

function codeComparison(parentInventory, currentInventory) {
  const phase7bParent = summarizeCode(parentInventory);
  const phase7cCurrent = summarizeCode(currentInventory);
  return {
    phase7bParent,
    phase7cCurrent,
    delta: {
      categories: Object.fromEntries(CODE_CATEGORIES.map((category) => [
        category,
        subtractMetrics(phase7cCurrent.categories[category], phase7bParent.categories[category]),
      ])),
      aggregate: subtractMetrics(phase7cCurrent.aggregate, phase7bParent.aggregate),
    },
    compressionAuthority: {
      gzipLevel: 9,
      gzipMtime: 0,
      brotliQuality: 11,
      scope: "HTML, JavaScript and CSS only; already-compressed static assets are not recompressed for this report",
    },
  };
}

function inventoryChanges(parentInventory, currentInventory) {
  const parent = new Map(parentInventory.map((entry) => [entry.path, entry]));
  const current = new Map(currentInventory.map((entry) => [entry.path, entry]));
  const allPaths = [...new Set([...parent.keys(), ...current.keys()])].sort(compareCodepoints);
  const changes = { added: [], removed: [], changed: [], unchanged: [] };
  for (const relative of allPaths) {
    const before = parent.get(relative);
    const after = current.get(relative);
    if (!before) changes.added.push(after);
    else if (!after) changes.removed.push(before);
    else if (before.sha256 === after.sha256) changes.unchanged.push(relative);
    else changes.changed.push({ path: relative, phase7bParent: before, phase7cCurrent: after });
  }
  return changes;
}

function productionAssetComparison(changes, parentInventory, currentInventory) {
  const isAsset = ({ category }) => !CODE_CATEGORIES.includes(category) && category !== "deployment-control";
  const added = changes.added.filter(isAsset);
  const removed = changes.removed.filter(isAsset);
  const changed = changes.changed.filter(({ phase7bParent, phase7cCurrent }) => (
    isAsset(phase7bParent) || isAsset(phase7cCurrent)
  ));
  const parentAssets = parentInventory.filter(isAsset);
  const currentAssets = currentInventory.filter(isAsset);
  const phase7bBytes = parentAssets.reduce((sum, entry) => sum + entry.rawBytes, 0);
  const phase7cBytes = currentAssets.reduce((sum, entry) => sum + entry.rawBytes, 0);
  return {
    phase7bParent: {
      files: parentAssets.length,
      rawBytes: phase7bBytes,
    },
    phase7cCurrent: {
      files: currentAssets.length,
      rawBytes: phase7cBytes,
    },
    delta: { files: currentAssets.length - parentAssets.length, rawBytes: phase7cBytes - phase7bBytes },
    added: { files: added.length, rawBytes: added.reduce((sum, entry) => sum + entry.rawBytes, 0), inventory: added },
    removed: { files: removed.length, rawBytes: removed.reduce((sum, entry) => sum + entry.rawBytes, 0), inventory: removed },
    changed,
  };
}

function localRequestPath(value) {
  if (!value || /^data:|^blob:|^mailto:|^tel:|^javascript:/i.test(value)) return null;
  let url;
  try {
    url = new URL(value, "https://phase7c-build.invalid/");
  } catch {
    return null;
  }
  if (url.origin !== "https://phase7c-build.invalid") return null;
  const decoded = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  invariant(decoded !== "" && !decoded.split("/").includes(".."), `Unsafe local build request path: ${value}`);
  return decoded;
}

function requestCategory(entry) {
  if (entry.category === "javascript") return "javascript";
  if (entry.category === "css") return "css";
  if (entry.category === "static-asset") return "static-asset";
  return "other";
}

async function homepageRequests(buildRoot, inventory) {
  const html = await readFile(path.join(buildRoot, "index.html"), "utf8");
  const inventoryByPath = new Map(inventory.map((entry) => [entry.path, entry]));
  const requests = new Map();
  for (const match of html.matchAll(/<(?:script|img|source|link)\b[^>]*>/gi)) {
    const tag = match[0];
    for (const attribute of tag.matchAll(/\b(src|href|srcset)\s*=\s*["']([^"']+)["']/gi)) {
      const candidates = attribute[1].toLowerCase() === "srcset"
        ? attribute[2].split(",").map((candidate) => candidate.trim().split(/\s+/, 1)[0]).filter(Boolean)
        : [attribute[2]];
      for (const candidate of candidates) {
        const relative = localRequestPath(candidate);
        if (!relative) continue;
        const entry = inventoryByPath.get(relative);
        invariant(entry, `Homepage declares a local request absent from its build: ${relative}`);
        requests.set(relative, {
          path: relative,
          category: requestCategory(entry),
          rawBytes: entry.rawBytes,
          sha256: entry.sha256,
        });
      }
    }
  }
  return [...requests.values()].sort((left, right) => compareCodepoints(left.path, right.path));
}

function compareRequests(parentRequests, currentRequests) {
  const parent = new Map(parentRequests.map((entry) => [entry.path, entry]));
  const current = new Map(currentRequests.map((entry) => [entry.path, entry]));
  const added = [...current.values()].filter(({ path: relative }) => !parent.has(relative));
  const removed = [...parent.values()].filter(({ path: relative }) => !current.has(relative));
  const changed = [...current.values()].filter(({ path: relative, sha256 }) => parent.has(relative) && parent.get(relative).sha256 !== sha256);
  const countByCategory = (records, category) => records.filter((entry) => entry.category === category).length;
  const documentaryPath = PHASE7C_DOCUMENTARY_ASSET.path.slice("public/".length);
  return {
    authority: "Unique local src, href and srcset candidate requests declared by built homepage script, link, image and source elements",
    phase7bParent: { count: parentRequests.length, inventory: parentRequests },
    phase7cCurrent: { count: currentRequests.length, inventory: currentRequests },
    delta: {
      total: currentRequests.length - parentRequests.length,
      javascript: countByCategory(currentRequests, "javascript") - countByCategory(parentRequests, "javascript"),
      css: countByCategory(currentRequests, "css") - countByCategory(parentRequests, "css"),
      staticAssets: countByCategory(currentRequests, "static-asset") - countByCategory(parentRequests, "static-asset"),
    },
    added,
    removed,
    changed,
    budgetMetrics: {
      addedJavascriptRequests: countByCategory(added, "javascript"),
      addedDocumentaryPosterRequests: added.filter(({ path: relative }) => relative === documentaryPath).length,
    },
  };
}

export async function productionSourceAuthority({
  repository,
  acceptedRef = PHASE7C_PARENT,
  currentRef = "HEAD",
  worktree = false,
}) {
  const root = await realpath(path.resolve(repository));
  const phase7bParentCommit = gitText(root, ["rev-parse", `${acceptedRef}^{commit}`]);
  const currentCommit = gitText(root, ["rev-parse", `${currentRef}^{commit}`]);
  const files = [];

  for (const relative of PHASE7C_PRODUCTION_PATHS) {
    const phase7bParent = blobAtRef(root, phase7bParentCommit, relative) ?? {
      exists: false,
      rawBytes: 0,
      sha256: null,
      gitObjectId: null,
      authority: "absent-at-parent",
    };

    let phase7cCurrent;
    if (worktree) {
      const filename = path.join(root, ...relative.split("/"));
      invariant(await exists(filename), `Explicit worktree source is missing: ${relative}`);
      const bytes = await readFile(filename);
      phase7cCurrent = {
        exists: true,
        rawBytes: bytes.length,
        sha256: digest(bytes),
        gitObjectId: worktreeBlobIdentity(root, bytes),
        authority: "explicit-worktree-bytes-with-git-blob-identity",
      };
    } else {
      phase7cCurrent = blobAtRef(root, currentCommit, relative);
      invariant(phase7cCurrent, `Committed Phase 7C source blob is missing at ${currentCommit}: ${relative}`);
    }

    files.push({
      path: relative,
      phase7bParent,
      phase7cCurrent,
      deltaRawBytes: phase7cCurrent.rawBytes - phase7bParent.rawBytes,
    });
  }

  const sumSide = (side) => ({
    files: files.filter((entry) => entry[side].exists).length,
    rawBytes: files.reduce((sum, entry) => sum + entry[side].rawBytes, 0),
  });
  const phase7bParent = sumSide("phase7bParent");
  const phase7cCurrent = sumSide("phase7cCurrent");
  const currentBytes = (relative) => files.find(({ path: candidate }) => candidate === relative)?.phase7cCurrent.rawBytes ?? 0;
  const controllerAndStateRawBytes = currentBytes("src/scripts/territory-traverse.ts") + currentBytes("src/scripts/territory-traverse-state.mjs");
  const cssRawBytes = currentBytes("src/styles/routes/phase-7c-territory-proof.css");

  return {
    mode: worktree ? "explicit-worktree" : "git-commit",
    phase7bParent: { ref: acceptedRef, commit: phase7bParentCommit, ...phase7bParent },
    phase7cCurrent: {
      ref: worktree ? "WORKTREE" : currentRef,
      baseCommit: currentCommit,
      ...phase7cCurrent,
    },
    delta: { files: phase7cCurrent.files - phase7bParent.files, rawBytes: phase7cCurrent.rawBytes - phase7bParent.rawBytes },
    files,
    budgetMetrics: { controllerAndStateRawBytes, cssRawBytes },
  };
}

function budgetReport({ productionAssets, requests, source }) {
  const checks = [
    {
      id: "new-production-asset-files",
      actual: productionAssets.added.files,
      operator: "<=",
      limit: PHASE7C_PERFORMANCE_BUDGET.newAssetFileDelta,
      contractKey: "newAssetFileDelta",
    },
    {
      id: "new-production-asset-bytes",
      actual: productionAssets.added.rawBytes,
      operator: "<=",
      limit: PHASE7C_PERFORMANCE_BUDGET.newAssetByteDelta,
      contractKey: "newAssetByteDelta",
    },
    {
      id: "removed-production-asset-files",
      actual: productionAssets.removed.files,
      operator: "===",
      limit: 0,
      contractKey: "zero-new-asset-governance",
    },
    {
      id: "changed-production-asset-files",
      actual: productionAssets.changed.length,
      operator: "===",
      limit: 0,
      contractKey: "zero-new-asset-governance",
    },
    {
      id: "added-javascript-requests",
      actual: requests.budgetMetrics.addedJavascriptRequests,
      operator: "<=",
      limit: PHASE7C_PERFORMANCE_BUDGET.emittedControllerRequestMaximum,
      contractKey: "emittedControllerRequestMaximum",
    },
    {
      id: "added-documentary-poster-requests",
      actual: requests.budgetMetrics.addedDocumentaryPosterRequests,
      operator: "<=",
      limit: PHASE7C_PERFORMANCE_BUDGET.lazyDocumentaryRequestMaximum,
      contractKey: "lazyDocumentaryRequestMaximum",
    },
    {
      id: "controller-and-state-raw-bytes",
      actual: source.budgetMetrics.controllerAndStateRawBytes,
      operator: "<=",
      limit: PHASE7C_PERFORMANCE_BUDGET.rawControllerAndStateMaximum,
      contractKey: "rawControllerAndStateMaximum",
    },
    {
      id: "phase7c-css-raw-bytes",
      actual: source.budgetMetrics.cssRawBytes,
      operator: "<=",
      limit: PHASE7C_PERFORMANCE_BUDGET.rawCssMaximum,
      contractKey: "rawCssMaximum",
    },
  ].map((check) => ({
    ...check,
    status: check.operator === "<="
      ? check.actual <= check.limit ? "PASS" : "FAIL"
      : check.actual === check.limit ? "PASS" : "FAIL",
  }));
  return {
    authority: "PHASE7C_PERFORMANCE_BUDGET from scripts/phase7c-contract.mjs",
    checks,
    status: checks.every(({ status }) => status === "PASS") ? "PASS" : "FAIL",
  };
}

export async function createPhase7CBuildDeltaReport({
  repository = process.cwd(),
  phase7bDist,
  phase7cDist,
  acceptedRef = PHASE7C_PARENT,
  currentRef = "HEAD",
  worktree = false,
}) {
  invariant(phase7bDist, "An explicit Phase 7B parent build directory is required");
  invariant(phase7cDist, "An explicit Phase 7C current build directory is required");
  const repositoryRoot = await realpath(path.resolve(repository));
  const [phase7bBuild, phase7cBuild, source] = await Promise.all([
    inventoryBuild(phase7bDist),
    inventoryBuild(phase7cDist),
    productionSourceAuthority({ repository: repositoryRoot, acceptedRef, currentRef, worktree }),
  ]);
  invariant(phase7bBuild.root !== phase7cBuild.root, "Phase 7B parent and Phase 7C current build directories must differ");

  const [phase7bRequests, phase7cRequests] = await Promise.all([
    homepageRequests(phase7bBuild.root, phase7bBuild.inventory),
    homepageRequests(phase7cBuild.root, phase7cBuild.inventory),
  ]);
  const changes = inventoryChanges(phase7bBuild.inventory, phase7cBuild.inventory);
  const productionAssets = productionAssetComparison(changes, phase7bBuild.inventory, phase7cBuild.inventory);
  const requests = compareRequests(phase7bRequests, phase7cRequests);
  const code = codeComparison(phase7bBuild.inventory, phase7cBuild.inventory);
  const budgets = budgetReport({ productionAssets, requests, source });

  return {
    schema: SCHEMA,
    status: budgets.status,
    inputs: {
      repository: ".",
      phase7bParentBuild: reportPath(repositoryRoot, phase7bBuild.root),
      phase7cCurrentBuild: reportPath(repositoryRoot, phase7cBuild.root),
      absolutePathsOmitted: true,
    },
    source,
    builds: {
      phase7bParent: { inventory: phase7bBuild.inventory },
      phase7cCurrent: { inventory: phase7cBuild.inventory },
    },
    comparison: {
      code,
      productionAssets,
      requests,
      inventoryChanges: changes,
    },
    budgets,
  };
}

export async function writePhase7CBuildDeltaReport(options) {
  invariant(options.output, "An explicit output JSON path is required");
  invariant(path.extname(options.output).toLowerCase() === ".json", "Output path must end in .json");
  const [phase7bRoot, phase7cRoot] = await Promise.all([
    realpath(path.resolve(options.phase7bDist)),
    realpath(path.resolve(options.phase7cDist)),
  ]);
  const output = path.resolve(options.output);
  invariant(!isInside(phase7bRoot, output) && !isInside(phase7cRoot, output), "Output JSON must be external to both governed build directories");
  const report = await createPhase7CBuildDeltaReport(options);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

export function parseArguments(argv) {
  const options = { repository: process.cwd(), currentRef: "HEAD", worktree: false };
  const valueOptions = new Map([
    ["--repository", "repository"],
    ["--phase7b-dist", "phase7bDist"],
    ["--phase7c-dist", "phase7cDist"],
    ["--current-ref", "currentRef"],
    ["--output", "output"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--worktree") {
      invariant(!options.worktree, "Duplicate argument: --worktree");
      options.worktree = true;
      continue;
    }
    const key = valueOptions.get(argument);
    invariant(key, `Unknown argument: ${argument}`);
    const value = argv[index + 1];
    invariant(value && !value.startsWith("--"), `Missing value for ${argument}`);
    invariant(!Object.hasOwn(options, key) || ["repository", "currentRef"].includes(key) && options[key] === (key === "repository" ? process.cwd() : "HEAD"), `Duplicate argument: ${argument}`);
    options[key] = value;
    index += 1;
  }
  for (const key of ["phase7bDist", "phase7cDist", "output"]) invariant(options[key], `Missing required argument for ${key}`);
  invariant(!(options.worktree && argv.includes("--current-ref")), "--worktree cannot be combined with --current-ref; worktree mode is explicitly based on HEAD");
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const report = await writePhase7CBuildDeltaReport(options);
    process.stdout.write(`${JSON.stringify({
      schema: report.schema,
      status: report.status,
      sourceMode: report.source.mode,
      codeDelta: report.comparison.code.delta,
      productionAssetDelta: report.comparison.productionAssets.delta,
      requestDelta: report.comparison.requests.delta,
      budgetChecks: report.budgets.checks,
    }, null, 2)}\n`);
    if (report.status !== "PASS") process.exitCode = 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      schema: SCHEMA,
      status: "FAIL",
      error: { name: error instanceof Error ? error.name : "Error", message: error instanceof Error ? error.message : String(error) },
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
