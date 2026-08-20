import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";

const ROOT = path.resolve(process.cwd());
const BASELINE_SHA = "c37eff7da9ada99e4d65e2a76f89871b9a706db0";
const LAB_RELATIVE = "prototypes/phase-2-interior-spectacle";
const LAB_ROOT = path.join(ROOT, ...LAB_RELATIVE.split("/"));
const DIST_RELATIVE = "dist";
const DIST_ROOT = path.join(ROOT, DIST_RELATIVE);
const REPORT_RELATIVE = "artifacts/evidence/phase-2a/phase-2a-isolation-report.json";
const REPORT_PATH = path.join(ROOT, ...REPORT_RELATIVE.split("/"));
const PHASE1_OUTPUT_VERIFIER = "scripts/verify-phase1-output.mjs";
const CANARY = "QH_PHASE2A_LAB_ONLY";
const STRICT_UTF8 = new TextDecoder("utf-8", { fatal: true });

const FROZEN_DIRECTORIES = Object.freeze(["src", "public"]);
const FROZEN_FILES = Object.freeze([
  ".nvmrc",
  "astro.config.mjs",
  "tsconfig.json",
  "package.json",
  "package-lock.json",
  "scripts/phase1-qa-config.mjs",
  "scripts/qa-phase1-browser.mjs",
  "scripts/verify-phase1-output.mjs",
  "scripts/verify-phase1-source.mjs",
  "tests/phase1-publication.test.mjs",
]);
const FROZEN_PATHS = Object.freeze([...FROZEN_DIRECTORIES, ...FROZEN_FILES]);

const PRODUCTION_SCAN_PATHS = Object.freeze([
  ...FROZEN_DIRECTORIES,
  "astro.config.mjs",
  "tsconfig.json",
  "package.json",
  "package-lock.json",
]);
const GOVERNANCE_SCAN_PATHS = Object.freeze([
  "scripts/phase1-qa-config.mjs",
  "scripts/verify-phase1-output.mjs",
  "scripts/verify-phase1-source.mjs",
  "tests/phase1-publication.test.mjs",
]);
const FORBIDDEN_BINARY_EXTENSIONS = Object.freeze(new Set([
  ".avif",
  ".avi",
  ".blend",
  ".bmp",
  ".eot",
  ".gif",
  ".glb",
  ".gltf",
  ".ico",
  ".jpeg",
  ".jpg",
  ".m4a",
  ".m4v",
  ".mkv",
  ".mov",
  ".mp3",
  ".mp4",
  ".ogg",
  ".otf",
  ".png",
  ".ttf",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
]));
const LAB_TEXT_EXTENSIONS = Object.freeze(new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".svg",
  ".txt",
]));
const PRODUCTION_TOKENS = Object.freeze([
  Object.freeze({ id: "phase2a-canary", value: CANARY.toLowerCase() }),
  Object.freeze({ id: "phase2a-lab-name", value: "phase-2-interior-spectacle" }),
  Object.freeze({ id: "prototype-reference", value: "prototypes/" }),
  Object.freeze({ id: "phase2a-evidence-reference", value: "artifacts/evidence/phase-2a" }),
]);
const GOVERNANCE_TOKENS = Object.freeze([
  Object.freeze({ id: "phase2a-canary", value: CANARY.toLowerCase() }),
  Object.freeze({ id: "phase2a-lab-name", value: "phase-2-interior-spectacle" }),
  Object.freeze({ id: "phase2a-evidence-reference", value: "artifacts/evidence/phase-2a" }),
]);

const failures = [];
const checks = [];

function repoPath(relativePath) {
  const normalized = String(relativePath).replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error(`Unsafe repository-relative path: ${relativePath}`);
  }
  const absolute = path.resolve(ROOT, ...normalized.split("/"));
  if (!isWithin(ROOT, absolute)) throw new Error(`Path escapes repository root: ${relativePath}`);
  return absolute;
}

function repoRelative(absolutePath) {
  return path.relative(ROOT, absolutePath).split(path.sep).join("/");
}

function isWithin(root, candidate) {
  const fromRoot = path.relative(root, candidate);
  return fromRoot === "" || (fromRoot !== ".." && !fromRoot.startsWith(`..${path.sep}`) && !path.isAbsolute(fromRoot));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function aggregateDigest(records) {
  const digest = createHash("sha256");
  for (const record of [...records].sort((left, right) => left.path.localeCompare(right.path))) {
    digest.update(record.path);
    digest.update("\0");
    digest.update(String(record.bytes));
    digest.update("\0");
    digest.update(record.sha256);
    digest.update("\n");
  }
  return digest.digest("hex");
}

function normalizedSearchText(value) {
  return value.toString("latin1").toLowerCase().replaceAll("\\", "/");
}

function sanitizeDiagnostic(value) {
  let sanitized = String(value ?? "").replaceAll(ROOT, "<repo>").replaceAll(ROOT.replaceAll("\\", "/"), "<repo>");
  sanitized = sanitized.replace(/[A-Za-z]:[\\/][^\r\n]*/g, "<absolute-path>");
  sanitized = sanitized.replace(/\/(?:Users|home)\/[^\s"'`]+/g, "<private-path>");
  return sanitized.trim().slice(0, 1200);
}

function addFailure(code, location, message, details = undefined) {
  failures.push({
    code,
    location: String(location).replaceAll("\\", "/"),
    message: sanitizeDiagnostic(message),
    ...(details === undefined ? {} : { details }),
  });
}

function addCheck(id, startFailureCount, summary) {
  checks.push({
    id,
    status: failures.length === startFailureCount ? "PASS" : "FAIL",
    ...summary,
  });
}

async function exists(absolutePath) {
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

async function walk(absoluteRoot, relativeRoot = repoRelative(absoluteRoot)) {
  const results = [];
  let rootMetadata;
  try {
    rootMetadata = await lstat(absoluteRoot);
  } catch (error) {
    return [{ path: relativeRoot, absolute: absoluteRoot, type: "missing", error }];
  }

  if (rootMetadata.isSymbolicLink()) return [{ path: relativeRoot, absolute: absoluteRoot, type: "symlink" }];
  if (rootMetadata.isFile()) return [{ path: relativeRoot, absolute: absoluteRoot, type: "file" }];
  if (!rootMetadata.isDirectory()) return [{ path: relativeRoot, absolute: absoluteRoot, type: "other" }];

  const entries = await readdir(absoluteRoot, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = path.join(absoluteRoot, entry.name);
    const relative = `${relativeRoot}/${entry.name}`.replace(/^\.\//, "");
    let metadata;
    try {
      metadata = await lstat(absolute);
    } catch (error) {
      results.push({ path: relative, absolute, type: "missing", error });
      continue;
    }
    if (metadata.isSymbolicLink()) results.push({ path: relative, absolute, type: "symlink" });
    else if (metadata.isDirectory()) results.push(...(await walk(absolute, relative)));
    else if (metadata.isFile()) results.push({ path: relative, absolute, type: "file" });
    else results.push({ path: relative, absolute, type: "other" });
  }
  return results;
}

function runGit(arguments_, options = {}) {
  const encoding = Object.hasOwn(options, "encoding") ? options.encoding : "utf8";
  const result = spawnSync("git", arguments_, {
    cwd: ROOT,
    encoding,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    const diagnostic = result.error?.message ?? result.stderr ?? `git exited ${result.status}`;
    throw new Error(sanitizeDiagnostic(diagnostic));
  }
  return result.stdout;
}

function baselineTree() {
  runGit(["cat-file", "-e", `${BASELINE_SHA}^{commit}`]);
  const output = runGit(["ls-tree", "-r", "-z", "--full-tree", BASELINE_SHA, "--", ...FROZEN_PATHS]);
  const records = [];
  for (const entry of output.split("\0")) {
    if (!entry) continue;
    const tab = entry.indexOf("\t");
    if (tab < 0) throw new Error("Unexpected git tree record");
    const [mode, type, object] = entry.slice(0, tab).split(" ");
    const filePath = entry.slice(tab + 1).replaceAll("\\", "/");
    records.push({ path: filePath, mode, type, object });
  }
  return records.sort((left, right) => left.path.localeCompare(right.path));
}

async function baselineInventory(tree) {
  const records = [];
  for (const entry of tree) {
    if (entry.type !== "blob" || !/^100(?:644|755)$/.test(entry.mode)) {
      addFailure("baseline-entry-type", entry.path, `Frozen baseline entry has unsupported ${entry.mode} ${entry.type}`);
      continue;
    }
    const contents = runGit(["cat-file", "blob", entry.object], { encoding: null });
    records.push({ path: entry.path, bytes: contents.length, sha256: sha256(contents), gitObject: entry.object });
  }
  return records;
}

async function currentFrozenEntries() {
  const entries = [];
  for (const directory of FROZEN_DIRECTORIES) entries.push(...(await walk(repoPath(directory), directory)));
  for (const file of FROZEN_FILES) entries.push(...(await walk(repoPath(file), file)));
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

async function frozenBoundaryCheck() {
  const start = failures.length;
  let tree = [];
  let baseline = [];
  let currentEntries = [];
  const current = [];
  try {
    tree = baselineTree();
    baseline = await baselineInventory(tree);
    currentEntries = await currentFrozenEntries();
  } catch (error) {
    addFailure("frozen-boundary-operational", "git", error.message);
  }

  const expectedByPath = new Map(baseline.map((record) => [record.path, record]));
  const currentByPath = new Map(currentEntries.map((record) => [record.path, record]));
  for (const record of baseline) {
    const observed = currentByPath.get(record.path);
    if (!observed) {
      addFailure("frozen-input-missing", record.path, "Frozen production/governance file is missing");
      continue;
    }
    if (observed.type !== "file") {
      addFailure("frozen-input-type", record.path, `Expected a regular file; observed ${observed.type}`);
      continue;
    }
    const contents = await readFile(observed.absolute);
    const candidate = { path: record.path, bytes: contents.length, sha256: sha256(contents) };
    current.push(candidate);
    if (candidate.bytes !== record.bytes || candidate.sha256 !== record.sha256) {
      addFailure("frozen-input-changed", record.path, "Frozen production/governance bytes differ from the accepted Phase 1 baseline", {
        expectedBytes: record.bytes,
        actualBytes: candidate.bytes,
        expectedSha256: record.sha256,
        actualSha256: candidate.sha256,
      });
    }
  }
  for (const observed of currentEntries) {
    if (!expectedByPath.has(observed.path)) {
      addFailure("frozen-input-added", observed.path, `Untracked or additional ${observed.type} exists inside the frozen production/governance boundary`);
    }
  }

  const baselineAggregate = baseline.length ? aggregateDigest(baseline) : null;
  const currentAggregate = current.length ? aggregateDigest(current) : null;
  if (baseline.length !== current.length || baselineAggregate !== currentAggregate) {
    addFailure("frozen-boundary-digest", "production-boundary", "Current frozen-boundary aggregate does not match the accepted baseline", {
      expectedFiles: baseline.length,
      actualFiles: current.length,
      expectedSha256: baselineAggregate,
      actualSha256: currentAggregate,
    });
  }
  addCheck("frozen-production-and-governance-boundary", start, {
    baselineSha: BASELINE_SHA,
    roots: FROZEN_PATHS,
    expectedFiles: baseline.length,
    currentFiles: current.length,
    baselineAggregateSha256: baselineAggregate,
    currentAggregateSha256: currentAggregate,
  });
  return { baseline, current };
}

async function labCheck() {
  const start = failures.length;
  const entries = await walk(LAB_ROOT, LAB_RELATIVE);
  const files = [];
  let realLabRoot = null;
  try {
    const rootMetadata = await lstat(LAB_ROOT);
    if (rootMetadata.isSymbolicLink()) addFailure("lab-root-symlink", LAB_RELATIVE, "Lab root must not be a symlink");
    if (!rootMetadata.isDirectory()) addFailure("lab-root-type", LAB_RELATIVE, "Lab root must be a directory");
    realLabRoot = await realpath(LAB_ROOT);
    if (!isWithin(ROOT, realLabRoot) || repoRelative(realLabRoot) !== LAB_RELATIVE) {
      addFailure("lab-root-containment", LAB_RELATIVE, "Lab realpath does not resolve to the exact isolated prototype directory");
    }
  } catch (error) {
    addFailure("lab-root-missing", LAB_RELATIVE, error.message);
  }

  for (const entry of entries) {
    if (entry.type === "symlink") {
      addFailure("lab-symlink", entry.path, "Symlinks are prohibited in the isolated lab");
      continue;
    }
    if (entry.type !== "file") {
      addFailure("lab-entry-type", entry.path, `Unsupported lab entry type: ${entry.type}`);
      continue;
    }
    const extension = path.extname(entry.path).toLowerCase();
    if (FORBIDDEN_BINARY_EXTENSIONS.has(extension) || /^\.blend\d*$/i.test(extension)) {
      addFailure("lab-copied-binary", entry.path, `Copied media/font/source binary is prohibited in the lab: ${extension}`);
    }
    if (!LAB_TEXT_EXTENSIONS.has(extension)) {
      addFailure("lab-non-source-file", entry.path, `Only text-native lab sources are allowed; observed ${extension || "no extension"}`);
    }
    try {
      const resolved = await realpath(entry.absolute);
      if (!realLabRoot || !isWithin(realLabRoot, resolved)) {
        addFailure("lab-file-containment", entry.path, "Lab file realpath escapes the isolated prototype root");
      }
    } catch (error) {
      addFailure("lab-file-realpath", entry.path, error.message);
    }
    const contents = await readFile(entry.absolute);
    if (LAB_TEXT_EXTENSIONS.has(extension)) {
      try {
        STRICT_UTF8.decode(contents);
      } catch {
        addFailure("lab-binary-content", entry.path, "Lab source is not valid UTF-8 text; copied or disguised binary content is prohibited");
      }
      if (!contents.includes(Buffer.from(CANARY))) {
        addFailure("lab-canary-missing", entry.path, `Every lab text source must carry ${CANARY}`);
      }
    }
    files.push({ path: entry.path, bytes: contents.length, sha256: sha256(contents) });
  }

  if (files.length === 0) addFailure("lab-empty", LAB_RELATIVE, "Isolated lab contains no regular source files");
  addCheck("lab-containment-and-asset-policy", start, {
    root: LAB_RELATIVE,
    canary: CANARY,
    files: files.length,
    bytes: files.reduce((sum, record) => sum + record.bytes, 0),
    aggregateSha256: files.length ? aggregateDigest(files) : null,
    symlinksAllowed: false,
    copiedMediaOrFontsAllowed: false,
  });
  return files;
}

async function entriesForPaths(relativePaths) {
  const entries = [];
  for (const relativePath of relativePaths) entries.push(...(await walk(repoPath(relativePath), relativePath)));
  return entries.filter((entry) => entry.type === "file");
}

async function scanEntries(entries, tokens, scope) {
  let findings = 0;
  for (const entry of entries) {
    const normalizedPath = entry.path.toLowerCase().replaceAll("\\", "/");
    const contents = normalizedSearchText(await readFile(entry.absolute));
    for (const token of tokens) {
      if (!normalizedPath.includes(token.value) && !contents.includes(token.value)) continue;
      findings += 1;
      addFailure(`${scope}-${token.id}`, entry.path, `Forbidden ${token.id} detected in ${scope}`);
    }
  }
  return findings;
}

async function productionScanCheck() {
  const start = failures.length;
  const productionEntries = await entriesForPaths(PRODUCTION_SCAN_PATHS);
  const governanceEntries = await entriesForPaths(GOVERNANCE_SCAN_PATHS);
  const runtimeFindings = await scanEntries(productionEntries, PRODUCTION_TOKENS, "production-input");
  const governanceFindings = await scanEntries(governanceEntries, GOVERNANCE_TOKENS, "governance-input");
  addCheck("production-input-reference-scan", start, {
    productionFilesScanned: productionEntries.length,
    governanceFilesScanned: governanceEntries.length,
    forbiddenTokens: PRODUCTION_TOKENS.map(({ id }) => id),
    findings: runtimeFindings + governanceFindings,
  });
}

async function distCheck(labFiles) {
  const start = failures.length;
  const distEntries = await walk(DIST_ROOT, DIST_RELATIVE);
  const distFiles = [];
  if (!(await exists(DIST_ROOT))) {
    addFailure("dist-missing", DIST_RELATIVE, "Production output is missing; run the Astro build before isolation verification");
  }
  for (const entry of distEntries) {
    if (entry.type === "symlink") {
      addFailure("dist-symlink", entry.path, "Production output must not contain symlinks");
      continue;
    }
    if (entry.type !== "file") {
      addFailure("dist-entry-type", entry.path, `Unsupported dist entry type: ${entry.type}`);
      continue;
    }
    const contents = await readFile(entry.absolute);
    const normalizedPath = entry.path.toLowerCase().replaceAll("\\", "/");
    const searchable = normalizedSearchText(contents);
    for (const token of PRODUCTION_TOKENS) {
      if (!normalizedPath.includes(token.value) && !searchable.includes(token.value)) continue;
      addFailure(`dist-${token.id}`, entry.path, `Forbidden ${token.id} detected in production output`);
    }
    distFiles.push({ path: entry.path, bytes: contents.length, sha256: sha256(contents) });
  }

  const distByHash = new Map();
  for (const record of distFiles) {
    const values = distByHash.get(record.sha256) ?? [];
    values.push(record.path);
    distByHash.set(record.sha256, values);
  }
  const hashMatches = [];
  for (const labFile of labFiles) {
    const matches = distByHash.get(labFile.sha256) ?? [];
    for (const distPath of matches) {
      hashMatches.push({ lab: labFile.path, dist: distPath, sha256: labFile.sha256 });
      addFailure("lab-dist-hash-match", distPath, `Production output is byte-identical to lab source ${labFile.path}`, {
        labPath: labFile.path,
        sha256: labFile.sha256,
      });
    }
  }
  addCheck("dist-canary-reference-and-hash-scan", start, {
    files: distFiles.length,
    bytes: distFiles.reduce((sum, record) => sum + record.bytes, 0),
    aggregateSha256: distFiles.length ? aggregateDigest(distFiles) : null,
    labFilesCompared: labFiles.length,
    identicalLabFiles: hashMatches.length,
  });
  return distFiles;
}

function phase1OutputContractCheck() {
  const start = failures.length;
  let status = "SKIP";
  let exitCode = null;
  let diagnostic;
  if (!spawnSync) throw new Error("Node child process support is unavailable");
  if (!path.isAbsolute(DIST_ROOT)) throw new Error("Unexpected non-absolute dist root");
  const result = spawnSync(process.execPath, [repoPath(PHASE1_OUTPUT_VERIFIER), "--no-write"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  exitCode = result.status;
  status = !result.error && result.status === 0 ? "PASS" : "FAIL";
  if (status === "FAIL") {
    diagnostic = sanitizeDiagnostic(result.error?.message ?? result.stderr ?? result.stdout ?? `Verifier exited ${result.status}`);
    addFailure("phase1-output-contract", PHASE1_OUTPUT_VERIFIER, "Frozen Phase 1 output contract failed", diagnostic ? { diagnostic } : undefined);
  }
  addCheck("phase1-output-contract-no-write", start, {
    script: PHASE1_OUTPUT_VERIFIER,
    mode: "--no-write",
    status,
    exitCode,
    ...(diagnostic ? { diagnostic } : {}),
  });
  return { status, exitCode };
}

function portableJson(value) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (/(?:^|["'\s])[A-Za-z]:[\\/]/m.test(serialized)) {
    throw new Error("Refusing to write an isolation report containing an absolute Windows path");
  }
  if (/(?:^|["'\s])\/(?:Users|home)\/[^\s"'`/]+\//m.test(serialized)) {
    throw new Error("Refusing to write an isolation report containing an absolute user-home path");
  }
  return serialized;
}

async function atomicWriteJson(absolutePath, value) {
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const temporary = `${absolutePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, portableJson(value), { encoding: "utf8", flag: "wx" });
  try {
    await rename(temporary, absolutePath);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function main() {
  const frozen = await frozenBoundaryCheck();
  const labFiles = await labCheck();
  await productionScanCheck();
  const distFiles = await distCheck(labFiles);
  const outputContract = phase1OutputContractCheck();

  const report = {
    schema: "quantum-hub.phase-2a.production-isolation.v1",
    generatedAt: new Date().toISOString(),
    status: failures.length === 0 ? "PASS" : "FAIL",
    baselineSha: BASELINE_SHA,
    labRoot: LAB_RELATIVE,
    distRoot: DIST_RELATIVE,
    reportPath: REPORT_RELATIVE,
    checks,
    summary: {
      frozenFilesExpected: frozen.baseline.length,
      frozenFilesVerified: frozen.current.length,
      labFiles: labFiles.length,
      distFiles: distFiles.length,
      phase1OutputContract: outputContract.status,
      failures: failures.length,
    },
    policy: {
      productionBoundary: "Frozen production inputs and Phase 1 governance files must match the accepted Phase 1 baseline byte-for-byte, including path topology.",
      labBoundary: "The Phase 2A lab must remain a regular-file-only subtree outside src/public and must reference, not copy, governed media and fonts.",
      outputBoundary: "Dist must pass the frozen Phase 1 output contract and contain no Phase 2A canary, lab/evidence reference, or byte-identical lab file.",
    },
    failures,
  };
  await atomicWriteJson(REPORT_PATH, report);

  if (failures.length > 0) {
    console.error(`Phase 2A isolation verification failed with ${failures.length} issue${failures.length === 1 ? "" : "s"}:`);
    for (const failure of failures) console.error(`- [${failure.code}] ${failure.location}: ${failure.message}`);
    console.error(`Portable report: ${REPORT_RELATIVE}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Phase 2A isolation PASS: ${frozen.current.length} frozen production/governance files, ` +
      `${labFiles.length} isolated lab files, ${distFiles.length} production output files, zero canary/reference/hash leakage.`,
  );
  console.log(`Portable report: ${REPORT_RELATIVE}`);
}

main().catch(async (error) => {
  const diagnostic = sanitizeDiagnostic(error?.stack ?? error?.message ?? error);
  console.error(`Phase 2A isolation verification stopped: ${diagnostic}`);
  process.exitCode = 1;
});
