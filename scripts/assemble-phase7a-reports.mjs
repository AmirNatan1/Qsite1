import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  DELETED_PRODUCTION_PATHS,
  FROZEN_MAIN,
  PHASE7A_BRANCH,
  PHASE7A_GATES,
  PHASE7A_PARENT,
  PHYSICAL_ASSETS,
} from "./phase7a-contract.mjs";

export const ASSEMBLY_SCHEMA = "quantum-hub.phase-7a.report-assembly.v1";
export const BROWSER_SCHEMA = "quantum-hub.phase-7a.browser-evidence.v1";
export const BUILD_DELTA_SCHEMA = "quantum-hub.phase-7a.build-delta.v1";
export const EVIDENCE_STATUSES = Object.freeze([
  "PASS",
  "FAIL",
  "LIMITATION",
  "NOT OBSERVED",
  "PENDING HUMAN REVIEW",
  "NOT AVAILABLE TO EXECUTION ENVIRONMENT",
]);

const STATUS_SET = new Set(EVIDENCE_STATUSES);
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const EXPECTED_ENGINES = Object.freeze(["chromium", "firefox", "webkit"]);
const EXPECTED_COUNTS = Object.freeze({
  accessibility: Object.freeze({ chromium: 20, firefox: 20, webkit: 20 }),
  responsive: Object.freeze({ chromium: 13, firefox: 4, webkit: 4 }),
  routes: Object.freeze({ chromium: 130, firefox: 34, webkit: 34 }),
  network: Object.freeze({ chromium: 2, firefox: 2, webkit: 2 }),
  cycles: Object.freeze({ chromium: 10, firefox: 10, webkit: 10 }),
});

const REPORT_DEFINITIONS = Object.freeze([
  ["01-accessibility", "Accessibility"],
  ["02-responsive", "Responsive layout"],
  ["03-reduced-motion", "Reduced motion"],
  ["04-no-js", "No-JavaScript fallback"],
  ["05-fallback-fonts", "Fallback fonts"],
  ["06-performance-lifecycle", "Performance and lifecycle"],
  ["07-network", "Network resilience"],
  ["08-publication", "Publication"],
  ["09-physical-hashes", "Physical opening hashes"],
  ["10-environmental-limitations", "Environmental limitations"],
  ["11-git-provenance-deletions-tracked-deltas", "Git provenance, deletion inventory, and tracked deltas"],
  ["12-deployment-provenance", "Deployment provenance"],
  ["13-human-gates", "Human review gates"],
]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, stableValue(value[key])]),
  );
}

export function stableJson(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function sha256File(filename) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filename);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function normalizeStatus(value, fallback = "NOT OBSERVED") {
  const normalized = String(value ?? "").trim().toUpperCase();
  return STATUS_SET.has(normalized) ? normalized : fallback;
}

function aggregateStatuses(statuses, empty = "NOT OBSERVED") {
  const normalized = statuses.map((status) => normalizeStatus(status)).filter(Boolean);
  if (normalized.length === 0) return empty;
  if (normalized.includes("FAIL")) return "FAIL";
  if (normalized.includes("LIMITATION")) return "LIMITATION";
  if (normalized.includes("NOT AVAILABLE TO EXECUTION ENVIRONMENT")) return "NOT AVAILABLE TO EXECUTION ENVIRONMENT";
  if (normalized.includes("NOT OBSERVED")) return "NOT OBSERVED";
  if (normalized.includes("PENDING HUMAN REVIEW")) return "PENDING HUMAN REVIEW";
  return "PASS";
}

function observation(status, label, detail) {
  return { status: normalizeStatus(status), label, detail };
}

function report(key, title, status, statement, sources, summary, observations = [], limitations = []) {
  return {
    schema: `quantum-hub.phase-7a.report.${key.replace(/^\d+-/, "")}.v1`,
    title,
    status: normalizeStatus(status),
    statement,
    sources,
    summary,
    observations,
    limitations: [...new Set(limitations.filter(Boolean))].sort((left, right) => left.localeCompare(right)),
  };
}

function markdownEscape(value) {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\r", " ")
    .replaceAll("\n", " ");
}

export function renderReportMarkdown(document) {
  const lines = [
    `# ${document.title}`,
    "",
    `**Status:** ${document.status}`,
    "",
    document.statement,
    "",
    "## Bound evidence sources",
    "",
  ];

  if (document.sources.length === 0) {
    lines.push("No external file is claimed as a source for this report.", "");
  } else {
    lines.push("| Source | File | Bytes | SHA-256 |", "| --- | --- | ---: | --- |");
    for (const source of document.sources) {
      lines.push(`| ${markdownEscape(source.label)} | ${markdownEscape(source.filename)} | ${source.bytes} | \`${source.sha256}\` |`);
    }
    lines.push("");
  }

  lines.push("## Summary", "", "```json", JSON.stringify(stableValue(document.summary), null, 2), "```", "", "## Observations", "");
  if (document.observations.length === 0) {
    lines.push("No observation was recorded.", "");
  } else {
    lines.push("| Status | Observation | Detail |", "| --- | --- | --- |");
    for (const item of document.observations) {
      lines.push(`| ${item.status} | ${markdownEscape(item.label)} | ${markdownEscape(item.detail)} |`);
    }
    lines.push("");
  }

  lines.push("## Limitations", "");
  if (document.limitations.length === 0) lines.push("None recorded.", "");
  else for (const limitation of document.limitations) lines.push(`- ${limitation}`);
  return `${lines.join("\n").trimEnd()}\n`;
}

function within(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function missing(filename) {
  try {
    await access(filename);
    return false;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
}

async function validateExternalInput(filename, label, repoRealpath) {
  if (!path.isAbsolute(filename)) throw new Error(`${label} must be an absolute path`);
  const resolved = await realpath(filename);
  if (within(resolved, repoRealpath)) throw new Error(`${label} must be outside the repository`);
  const details = await stat(resolved);
  if (!details.isFile()) throw new Error(`${label} must identify a regular file`);
  return resolved;
}

async function validateFreshExternalOutput(outputDirectory, repoRealpath) {
  if (!path.isAbsolute(outputDirectory)) throw new Error("--output-dir must be an absolute path");
  const resolved = path.resolve(outputDirectory);
  if (path.parse(resolved).root === resolved) throw new Error("--output-dir cannot be a filesystem root");
  if (!(await missing(resolved))) throw new Error("--output-dir must not already exist");
  const parent = await realpath(path.dirname(resolved));
  const proposed = path.join(parent, path.basename(resolved));
  if (within(proposed, repoRealpath)) throw new Error("--output-dir must be outside the repository");
  return proposed;
}

async function readBoundFile(filename, label, repoRealpath, json = false) {
  const external = await validateExternalInput(filename, label, repoRealpath);
  const bytes = await readFile(external);
  let value = bytes.toString("utf8");
  if (json) {
    try {
      value = JSON.parse(value);
    } catch (error) {
      throw new Error(`${label} is not valid JSON: ${error.message}`);
    }
  }
  return {
    value,
    descriptor: {
      label,
      filename: path.basename(external),
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    },
  };
}

function parseLogEvidence(text, label) {
  const normalized = String(text).replaceAll("\r\n", "\n");
  const lines = normalized.length === 0 ? 0 : normalized.split("\n").length - (normalized.endsWith("\n") ? 1 : 0);
  const explicitFailure = /(?:^|\n)\s*(?:status\s*:\s*)?FAIL(?:ED)?\b/im.test(normalized)
    || /(?:^|\n)\s*not ok\b/im.test(normalized)
    || /(?:^|\n)\s*#?\s*fail(?:ures?)?\s*[:=]?\s*[1-9]\d*\b/im.test(normalized)
    || /(?:^|\n)\s*#?\s*errors?\s*[:=]?\s*[1-9]\d*\b/im.test(normalized);
  const explicitPass = /(?:^|\n)\s*status\s*:\s*PASS\s*$/im.test(normalized)
    || /(?:^|\n)\s*PASS\s*$/im.test(normalized)
    || (/(?:^|\n)\s*#?\s*pass\s*[:=]?\s*[1-9]\d*\b/im.test(normalized)
      && /(?:^|\n)\s*#?\s*fail(?:ures?)?\s*[:=]?\s*0\b/im.test(normalized));
  return {
    label,
    status: explicitFailure ? "FAIL" : explicitPass ? "PASS" : "NOT OBSERVED",
    lineCount: lines,
    explicitFailure,
    explicitPass: explicitPass && !explicitFailure,
  };
}

function engineName(result) {
  return String(result?.identity?.engine ?? result?.engine ?? "").trim().toLowerCase();
}

function resultMap(browser) {
  const map = new Map();
  for (const result of Array.isArray(browser?.results) ? browser.results : []) {
    const name = engineName(result);
    if (EXPECTED_ENGINES.includes(name) && !map.has(name)) map.set(name, result);
  }
  return map;
}

function records(value) {
  return Array.isArray(value) ? value : [];
}

function countStatuses(items) {
  const counts = Object.fromEntries(EVIDENCE_STATUSES.map((status) => [status, 0]));
  for (const item of items) counts[normalizeStatus(item?.status)] += 1;
  return counts;
}

function matrixEvidence(browser, property, expectedCounts) {
  const engines = resultMap(browser);
  const perEngine = EXPECTED_ENGINES.map((engine) => {
    const items = records(engines.get(engine)?.[property]);
    const counts = countStatuses(items);
    return {
      engine,
      expected: expectedCounts[engine],
      observed: items.length,
      pass: counts.PASS,
      fail: counts.FAIL,
      limitation: counts.LIMITATION,
      notObserved: counts["NOT OBSERVED"],
    };
  });
  const observed = perEngine.reduce((total, item) => total + item.observed, 0);
  const failed = perEngine.some((item) => item.fail > 0);
  const complete = perEngine.every((item) => item.observed === item.expected && item.pass === item.expected);
  return {
    status: failed ? "FAIL" : complete ? "PASS" : observed === 0 ? "NOT OBSERVED" : "LIMITATION",
    expected: perEngine.reduce((total, item) => total + item.expected, 0),
    observed,
    perEngine,
  };
}

function singletonEvidence(browser, accessor) {
  const engines = resultMap(browser);
  const perEngine = EXPECTED_ENGINES.map((engine) => {
    const record = accessor(engines.get(engine));
    return { engine, observed: Boolean(record), status: record ? normalizeStatus(record.status) : "NOT OBSERVED" };
  });
  const statuses = perEngine.filter((item) => item.observed).map((item) => item.status);
  const failed = statuses.includes("FAIL");
  const complete = perEngine.every((item) => item.observed && item.status === "PASS");
  return {
    status: failed ? "FAIL" : complete ? "PASS" : statuses.length === 0 ? "NOT OBSERVED" : "LIMITATION",
    expected: EXPECTED_ENGINES.length,
    observed: perEngine.filter((item) => item.observed).length,
    perEngine,
  };
}

function accessibilityDetails(browser) {
  const base = matrixEvidence(browser, "accessibility", EXPECTED_COUNTS.accessibility);
  const engines = resultMap(browser);
  base.perEngine = base.perEngine.map((summary) => {
    const items = records(engines.get(summary.engine)?.accessibility);
    return {
      ...summary,
      axeViolations: items.reduce((count, item) => count + records(item?.accessibility?.violations).length, 0),
      axeIncomplete: items.reduce((count, item) => count + records(item?.accessibility?.incomplete).length, 0),
    };
  });
  if (base.perEngine.some((item) => item.axeViolations > 0)) base.status = "FAIL";
  return base;
}

function networkEvidence(browser) {
  const engines = resultMap(browser);
  const perEngine = EXPECTED_ENGINES.map((engine) => {
    const network = engines.get(engine)?.network;
    const items = Array.isArray(network) ? network : Array.isArray(network?.cases) ? network.cases : [];
    const counts = countStatuses(items);
    return { engine, expected: EXPECTED_COUNTS.network[engine], observed: items.length, pass: counts.PASS, fail: counts.FAIL };
  });
  const observed = perEngine.reduce((total, item) => total + item.observed, 0);
  const failed = perEngine.some((item) => item.fail > 0);
  const complete = perEngine.every((item) => item.observed === item.expected && item.pass === item.expected);
  return {
    status: failed ? "FAIL" : complete ? "PASS" : observed === 0 ? "NOT OBSERVED" : "LIMITATION",
    expected: 6,
    observed,
    perEngine,
  };
}

function thresholdCycleEvidence(browser) {
  const engines = resultMap(browser);
  const perEngine = EXPECTED_ENGINES.map((engine) => {
    const cycle = engines.get(engine)?.cycles;
    const samples = records(cycle?.samples);
    return {
      engine,
      expected: EXPECTED_COUNTS.cycles[engine],
      observed: samples.length,
      status: cycle ? normalizeStatus(cycle.status) : "NOT OBSERVED",
    };
  });
  const observed = perEngine.reduce((total, item) => total + item.observed, 0);
  const failed = perEngine.some((item) => item.status === "FAIL");
  const complete = perEngine.every((item) => item.observed === item.expected && item.status === "PASS");
  return {
    status: failed ? "FAIL" : complete ? "PASS" : observed === 0 ? "NOT OBSERVED" : "LIMITATION",
    expected: 30,
    observed,
    perEngine,
  };
}

function optionalPerformanceFacet(browser, name) {
  const root = browser?.performanceLifecycle ?? browser?.performance ?? {};
  const item = root?.[name];
  return item ? normalizeStatus(item.status ?? item) : "NOT OBSERVED";
}

function buildDeltaSummary(buildDelta) {
  const complete = buildDelta?.comparisons?.complete?.totals ?? {};
  const isolated = buildDelta?.comparisons?.signalFieldIsolated?.totals ?? {};
  const metric = (value) => {
    if (Number.isFinite(value)) return { files: null, rawBytes: value, gzipBytes: null, brotliBytes: null };
    return {
      files: Number.isFinite(value?.files) ? value.files : null,
      rawBytes: Number.isFinite(value?.rawBytes) ? value.rawBytes : null,
      gzipBytes: Number.isFinite(value?.gzipBytes) ? value.gzipBytes : null,
      brotliBytes: Number.isFinite(value?.brotliBytes) ? value.brotliBytes : null,
    };
  };
  const summarize = (totals) => {
    const accepted = metric(totals?.accepted);
    const phase7a = metric(totals?.phase7a);
    const delta = metric(totals?.delta);
    return {
      acceptedBytes: accepted.rawBytes,
      phase7aBytes: phase7a.rawBytes,
      deltaBytes: delta.rawBytes,
      accepted,
      phase7a,
      delta,
    };
  };
  return {
    compression: buildDelta?.compression ?? null,
    complete: summarize(complete),
    signalFieldIsolated: summarize(isolated),
    changedFiles: records(buildDelta?.comparisons?.complete?.changes?.changed).length,
    addedFiles: records(buildDelta?.comparisons?.complete?.changes?.added).length,
    removedFiles: records(buildDelta?.comparisons?.complete?.changes?.removed).length,
  };
}

function safeUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    if (!new Set(["http:", "https:"]).has(parsed.protocol)) return null;
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function scalar(value) {
  return ["string", "number", "boolean"].includes(typeof value) ? value : null;
}

function deploymentCandidate(deployment, keys) {
  const roots = [deployment, deployment?.deployment, deployment?.result, deployment?.data].filter(isPlainObject);
  for (const root of roots) {
    for (const key of keys) {
      const value = scalar(root[key]);
      if (value !== null) return value;
    }
  }
  return null;
}

function summarizeDeployment(deployment, gitEvidence) {
  if (!deployment) {
    return {
      status: "NOT AVAILABLE TO EXECUTION ENVIRONMENT",
      supplied: false,
      fields: {},
      statement: "No deployment JSON was supplied; no deployment or preview claim is made.",
    };
  }
  const rawStatus = deploymentCandidate(deployment, ["status", "state", "outcome"]);
  const normalized = String(rawStatus ?? "").trim().toUpperCase();
  const mappedStatus = ["PASS", "SUCCESS", "READY", "DEPLOYED", "ACTIVE"].includes(normalized)
    ? "PASS"
    : ["FAIL", "FAILED", "ERROR", "CANCELLED"].includes(normalized)
      ? "FAIL"
      : "NOT OBSERVED";
  const deployedSha = deploymentCandidate(deployment, ["deployedSha", "commitSha", "sha", "gitSha"]);
  const parity = deploymentCandidate(deployment, ["parity", "parityStatus", "artifactParity"]);
  const parityStatus = normalizeStatus(parity, "NOT OBSERVED");
  const shaParity = typeof deployedSha === "string" && typeof gitEvidence?.head === "string"
    ? deployedSha === gitEvidence.head
    : null;
  let status = mappedStatus;
  if (parityStatus === "FAIL" || shaParity === false) status = "FAIL";
  else if (status === "PASS" && parityStatus !== "PASS" && shaParity !== true) status = "LIMITATION";
  return {
    status,
    supplied: true,
    fields: {
      deploymentId: deploymentCandidate(deployment, ["deploymentId", "id"]),
      environment: deploymentCandidate(deployment, ["environment", "target"]),
      projectName: deploymentCandidate(deployment, ["projectName", "project"]),
      immutablePreview: safeUrl(deploymentCandidate(deployment, ["immutablePreview", "immutableUrl", "url"])),
      branchPreview: safeUrl(deploymentCandidate(deployment, ["branchPreview", "branchUrl"])),
      deployedSha,
      reportedStatus: rawStatus,
      parity,
      shaParity,
    },
    statement: status === "PASS"
      ? "The supplied deployment record explicitly reports success and binds to verified parity evidence."
      : status === "FAIL"
        ? "The supplied deployment record contains an explicit failure or provenance mismatch."
        : "A deployment record was supplied, but it does not prove both successful deployment and artifact provenance parity.",
  };
}

function sanitizedLimitations(browser) {
  return records(browser?.limitations)
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim());
}

function sourceSubset(sourceMap, ...names) {
  return names.map((name) => sourceMap[name]).filter(Boolean);
}

export function createPhase7AReportBundle({
  browser,
  buildDelta,
  checkLog,
  testLog,
  deployment = null,
  sources,
  gitEvidence,
  physicalEvidence,
}) {
  if (browser?.schema !== BROWSER_SCHEMA) throw new Error(`browser report schema must be ${BROWSER_SCHEMA}`);
  if (buildDelta?.schema !== BUILD_DELTA_SCHEMA) throw new Error(`build delta schema must be ${BUILD_DELTA_SCHEMA}`);

  const sourceMap = Object.fromEntries(sources.map((source) => [source.key, source.descriptor]));
  const browserSource = sourceSubset(sourceMap, "browser");
  const buildSource = sourceSubset(sourceMap, "buildDelta");
  const logSources = sourceSubset(sourceMap, "checkLog", "testLog");
  const accessibility = accessibilityDetails(browser);
  const responsive = matrixEvidence(browser, "responsive", EXPECTED_COUNTS.responsive);
  const routes = matrixEvidence(browser, "routes", EXPECTED_COUNTS.routes);
  const reducedMotion = singletonEvidence(browser, (result) => result?.fallback?.reducedMotion);
  const noJavaScript = singletonEvidence(browser, (result) => result?.fallback?.noJavaScript);
  const fallbackFonts = singletonEvidence(browser, (result) => result?.fallback?.fallbackFont);
  const network = networkEvidence(browser);
  const thresholdCycles = thresholdCycleEvidence(browser);
  const check = parseLogEvidence(checkLog, "exact check log");
  const tests = parseLogEvidence(testLog, "exact test log");
  const build = buildDeltaSummary(buildDelta);
  const deploymentSummary = summarizeDeployment(deployment, gitEvidence);
  const browserLimitations = sanitizedLimitations(browser);

  const documents = [];
  documents.push(report(
    "01-accessibility",
    "Phase 7A accessibility report",
    accessibility.status,
    accessibility.status === "PASS"
      ? "All expected automated axe cases were observed without reported violations across the declared three-engine matrix."
      : "The supplied browser evidence does not justify a complete accessibility PASS; only the recorded automated observations are reported.",
    browserSource,
    accessibility,
    accessibility.perEngine.map((item) => observation(
      item.fail > 0 || item.axeViolations > 0 ? "FAIL" : item.observed === item.expected && item.pass === item.expected ? "PASS" : item.observed === 0 ? "NOT OBSERVED" : "LIMITATION",
      item.engine,
      `${item.observed}/${item.expected} cases; ${item.axeViolations} axe violations; ${item.axeIncomplete} incomplete results.`,
    )),
    ["Automated axe evidence supplements, and does not replace, physical 200% zoom and assistive-technology human review."],
  ));

  documents.push(report(
    "02-responsive",
    "Phase 7A responsive report",
    responsive.status,
    responsive.status === "PASS"
      ? "Every expected automated responsive case is present and reports PASS."
      : "The responsive matrix is incomplete or contains a reported failure; unobserved viewports are not inferred.",
    browserSource,
    responsive,
    responsive.perEngine.map((item) => observation(
      item.fail > 0 ? "FAIL" : item.observed === item.expected && item.pass === item.expected ? "PASS" : item.observed === 0 ? "NOT OBSERVED" : "LIMITATION",
      item.engine,
      `${item.observed}/${item.expected} expected viewport cases were supplied.`,
    )),
    ["Programmatic viewport checks do not constitute physical-device or genuine browser-zoom approval."],
  ));

  documents.push(report(
    "03-reduced-motion",
    "Phase 7A reduced-motion report",
    reducedMotion.status,
    reducedMotion.status === "PASS"
      ? "A passing reduced-motion fallback observation is present for every declared engine."
      : "Reduced-motion behavior is reported only where the supplied browser evidence contains an explicit observation.",
    browserSource,
    reducedMotion,
    reducedMotion.perEngine.map((item) => observation(item.status, item.engine, item.observed ? "Explicit reduced-motion result supplied." : "No reduced-motion result supplied.")),
    ["Automated emulation does not approve subjective motion comfort; that decision remains a human gate."],
  ));

  documents.push(report(
    "04-no-js",
    "Phase 7A no-JavaScript fallback report",
    noJavaScript.status,
    noJavaScript.status === "PASS"
      ? "A passing no-JavaScript fallback observation is present for every declared engine."
      : "No-JavaScript behavior is not promoted beyond the explicit supplied observations.",
    browserSource,
    noJavaScript,
    noJavaScript.perEngine.map((item) => observation(item.status, item.engine, item.observed ? "Explicit no-JavaScript result supplied." : "No no-JavaScript result supplied.")),
  ));

  documents.push(report(
    "05-fallback-fonts",
    "Phase 7A fallback-font report",
    fallbackFonts.status,
    fallbackFonts.status === "PASS"
      ? "A passing fallback-font observation is present for every declared engine."
      : "Fallback-font behavior is not inferred where the supplied browser report has no explicit observation.",
    browserSource,
    fallbackFonts,
    fallbackFonts.perEngine.map((item) => observation(item.status, item.engine, item.observed ? "Explicit fallback-font result supplied." : "No fallback-font result supplied.")),
    ["Automated fallback substitution cannot approve typographic character or visual authority; that remains human review."],
  ));

  const performanceFacets = {
    thresholdCycles: thresholdCycles.status,
    homeMaradinCycles: optionalPerformanceFacet(browser, "homeMaradinCycles"),
    longTasks: optionalPerformanceFacet(browser, "longTasks"),
    pagehidePageshow: optionalPerformanceFacet(browser, "pagehidePageshow"),
    listenerStability: optionalPerformanceFacet(browser, "listenerStability"),
  };
  const performanceFailed = Object.values(performanceFacets).includes("FAIL");
  const performanceComplete = Object.values(performanceFacets).every((status) => status === "PASS");
  const performanceStatus = performanceFailed ? "FAIL" : performanceComplete ? "PASS" : "LIMITATION";
  const performanceMissing = Object.entries(performanceFacets)
    .filter(([, status]) => status === "NOT OBSERVED")
    .map(([name]) => name);
  documents.push(report(
    "06-performance-lifecycle",
    "Phase 7A performance and lifecycle report",
    performanceStatus,
    performanceStatus === "PASS"
      ? "Every required performance and lifecycle facet is explicitly present and passing."
      : "Build deltas and threshold-cycle observations are reported, but missing performance or lifecycle facets remain limitations rather than inferred passes.",
    [...browserSource, ...buildSource],
    { facets: performanceFacets, thresholdCycles, buildDelta: build },
    [
      observation(thresholdCycles.status, "Threshold cycles", `${thresholdCycles.observed}/${thresholdCycles.expected} expected samples supplied.`),
      ...Object.entries(performanceFacets)
        .filter(([name]) => name !== "thresholdCycles")
        .map(([name, status]) => observation(status, name, status === "NOT OBSERVED" ? "No explicit evidence field was supplied." : "Explicit performance evidence was supplied.")),
    ],
    performanceMissing.map((name) => `${name} was NOT OBSERVED in the supplied browser report.`),
  ));

  documents.push(report(
    "07-network",
    "Phase 7A network report",
    network.status,
    network.status === "PASS"
      ? "All expected blocked- and slow-network cases are present and passing across the declared engine matrix."
      : "Network resilience is reported only for supplied cases; absent cases are not inferred.",
    browserSource,
    network,
    network.perEngine.map((item) => observation(
      item.fail > 0 ? "FAIL" : item.observed === item.expected && item.pass === item.expected ? "PASS" : item.observed === 0 ? "NOT OBSERVED" : "LIMITATION",
      item.engine,
      `${item.observed}/${item.expected} expected network cases supplied.`,
    )),
  ));

  const publicationStatus = [routes.status, check.status, tests.status].includes("FAIL")
    ? "FAIL"
    : routes.status === "PASS" && check.status === "PASS" && tests.status === "PASS"
      ? "PASS"
      : "LIMITATION";
  documents.push(report(
    "08-publication",
    "Phase 7A publication report",
    publicationStatus,
    publicationStatus === "PASS"
      ? "The complete expected route matrix and both exact command logs explicitly report PASS."
      : "Publication is not promoted to PASS unless the complete route matrix and both supplied exact logs explicitly prove success.",
    [...browserSource, ...logSources],
    { routeMatrix: routes, logs: { check, tests } },
    [
      observation(routes.status, "Route matrix", `${routes.observed}/${routes.expected} expected route cases supplied.`),
      observation(check.status, "Check log", `${check.lineCount} lines; derived only from explicit pass/fail markers.`),
      observation(tests.status, "Test log", `${tests.lineCount} lines; derived only from explicit pass/fail markers.`),
    ],
    ["Log digests and conservative marker summaries are retained; the assembler does not reinterpret omitted command exit codes."],
  ));

  const physicalAssets = records(physicalEvidence?.assets);
  documents.push(report(
    "09-physical-hashes",
    "Phase 7A physical opening hash report",
    normalizeStatus(physicalEvidence?.status),
    physicalEvidence?.status === "PASS"
      ? "Every authoritative physical-opening asset exists and matches its frozen SHA-256 value."
      : "At least one authoritative physical-opening asset is missing, mismatched, or unavailable; no integrity claim is inferred.",
    [],
    {
      expectedCount: PHYSICAL_ASSETS.length,
      observedCount: physicalAssets.filter((item) => item.actualSha256).length,
      matchedCount: physicalAssets.filter((item) => item.status === "PASS").length,
      missingCount: physicalAssets.filter((item) => item.status === "NOT OBSERVED").length,
      mismatchedCount: physicalAssets.filter((item) => item.status === "FAIL").length,
      assets: physicalAssets,
    },
    physicalAssets.map((item) => observation(item.status, item.path, item.status === "PASS" ? "SHA-256 matches the frozen contract." : item.status === "FAIL" ? "SHA-256 differs from the frozen contract." : "Asset was not available to hash.")),
  ));

  const environmental = [...browserLimitations];
  if (resultMap(browser).size < EXPECTED_ENGINES.length) environmental.push("One or more required browser-engine result sets were NOT OBSERVED.");
  environmental.push("WebKit automation is a compatibility proxy and is not physical Safari approval.");
  environmental.push("Programmatic scroll is not evidence of physical wheel, touch, or trackpad behavior.");
  if (deploymentSummary.status === "NOT AVAILABLE TO EXECUTION ENVIRONMENT") environmental.push("Deployment JSON was NOT AVAILABLE TO EXECUTION ENVIRONMENT.");
  if (check.status === "NOT OBSERVED") environmental.push("The exact check log contains no unambiguous PASS or FAIL marker.");
  if (tests.status === "NOT OBSERVED") environmental.push("The exact test log contains no unambiguous PASS or FAIL marker.");
  for (const name of performanceMissing) environmental.push(`${name} was NOT OBSERVED.`);
  const uniqueEnvironmental = [...new Set(environmental)].sort((left, right) => left.localeCompare(right));
  documents.push(report(
    "10-environmental-limitations",
    "Phase 7A environmental limitations report",
    uniqueEnvironmental.length > 0 ? "LIMITATION" : "PASS",
    uniqueEnvironmental.length > 0
      ? "The following execution-environment boundaries constrain the evidence and are not silently converted to passes."
      : "No execution-environment limitation was recorded by the supplied evidence.",
    [...browserSource, ...sourceSubset(sourceMap, "deployment")],
    { count: uniqueEnvironmental.length, limitations: uniqueEnvironmental },
    uniqueEnvironmental.map((item) => observation("LIMITATION", "Environment", item)),
    uniqueEnvironmental,
  ));

  const gitStatus = normalizeStatus(gitEvidence?.status);
  documents.push(report(
    "11-git-provenance-deletions-tracked-deltas",
    "Phase 7A Git provenance, deletion inventory, and tracked-delta report",
    gitStatus,
    gitStatus === "PASS"
      ? "Branch ancestry, frozen-main provenance, no-merge discipline, deletion inventory, and tracked-tree deltas satisfy the recorded contract."
      : "Git provenance is reported without promotion where the repository state is dirty, incomplete, or contradicts the Phase 7A contract.",
    [],
    gitEvidence,
    [
      observation(gitEvidence?.branch === PHASE7A_BRANCH ? "PASS" : "FAIL", "Branch", gitEvidence?.branch ?? "NOT OBSERVED"),
      observation(gitEvidence?.parentIsAncestor === true ? "PASS" : "FAIL", "Parent ancestry", String(gitEvidence?.parentIsAncestor ?? "NOT OBSERVED")),
      observation(gitEvidence?.mergeCommits?.length === 0 ? "PASS" : "FAIL", "No-merge discipline", `${gitEvidence?.mergeCommits?.length ?? 0} merge commits recorded.`),
      observation(gitEvidence?.worktree?.clean === true ? "PASS" : "LIMITATION", "Worktree", gitEvidence?.worktree?.clean ? "Clean." : "Dirty; paths are inventoried in the JSON summary."),
    ],
    records(gitEvidence?.limitations),
  ));

  documents.push(report(
    "12-deployment-provenance",
    "Phase 7A deployment provenance report",
    deploymentSummary.status,
    deploymentSummary.statement,
    sourceSubset(sourceMap, "deployment"),
    deploymentSummary,
    [observation(deploymentSummary.status, "Deployment evidence", deploymentSummary.statement)],
    deploymentSummary.supplied ? [] : ["No deployment JSON was supplied, so deployment state, preview URLs, and artifact parity are not claimed."],
  ));

  const gateRecords = PHASE7A_GATES.map((gate, index) => ({
    gateNumber: index + 1,
    gate,
    status: "PENDING HUMAN REVIEW",
    authority: "Independent human reviewer",
    automatedEvidenceMayApprove: false,
  }));
  documents.push(report(
    "13-human-gates",
    "Phase 7A human review gates",
    "PENDING HUMAN REVIEW",
    "All six Phase 7A gates remain PENDING HUMAN REVIEW. Automated evidence assembly does not accept Phase 7A, authorize a later phase, or approve a merge to main.",
    [],
    { gateCount: gateRecords.length, allPending: true, gates: gateRecords },
    gateRecords.map((gate) => observation(gate.status, `Gate ${gate.gateNumber}: ${gate.gate}`, "Independent human review has not been recorded.")),
  ));

  return documents;
}

function runGit(args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", windowsHide: true });
  if (result.status !== 0 && !allowFailure) throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

function parseLsTree(text) {
  const files = [];
  for (const line of text.split("\n").filter(Boolean)) {
    const match = line.match(/^(\d+)\s+(\w+)\s+([0-9a-f]+)\s+(-|\d+)\t(.+)$/);
    if (!match) continue;
    files.push({ path: match[5], bytes: match[4] === "-" ? 0 : Number(match[4]), object: match[3] });
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  return {
    fileCount: files.length,
    bytes: files.reduce((total, file) => total + file.bytes, 0),
    inventorySha256: sha256(files.map((file) => `${file.path}\0${file.bytes}\0${file.object}\n`).join("")),
  };
}

function parseNameStatus(text) {
  return text.split("\n").filter(Boolean).map((line) => {
    const [status, ...parts] = line.split("\t");
    return { status, paths: parts };
  });
}

function parseNumstat(text) {
  let addedLines = 0;
  let deletedLines = 0;
  let binaryFiles = 0;
  for (const line of text.split("\n").filter(Boolean)) {
    const [added, deleted] = line.split("\t");
    if (added === "-" || deleted === "-") binaryFiles += 1;
    else {
      addedLines += Number(added) || 0;
      deletedLines += Number(deleted) || 0;
    }
  }
  return { addedLines, deletedLines, binaryFiles };
}

export async function collectGitEvidence() {
  const branch = runGit(["branch", "--show-current"]).stdout;
  const head = runGit(["rev-parse", "HEAD"]).stdout;
  const localMainResult = runGit(["rev-parse", "refs/heads/main"], { allowFailure: true });
  const originMainResult = runGit(["rev-parse", "refs/remotes/origin/main"], { allowFailure: true });
  const ancestry = runGit(["merge-base", "--is-ancestor", PHASE7A_PARENT, head], { allowFailure: true }).status === 0;
  const merges = runGit(["rev-list", "--merges", `${PHASE7A_PARENT}..${head}`]).stdout.split("\n").filter(Boolean);
  const worktreeLines = runGit(["status", "--short", "--untracked-files=all"]).stdout.split("\n").filter(Boolean);
  const deletedInventory = [];
  for (const relativePath of DELETED_PRODUCTION_PATHS) {
    const absentAtHead = await missing(path.join(REPO_ROOT, relativePath));
    const existedAtParent = runGit(["cat-file", "-e", `${PHASE7A_PARENT}:${relativePath}`], { allowFailure: true }).status === 0;
    deletedInventory.push({ path: relativePath, absentAtHead, existedAtParent, status: absentAtHead && existedAtParent ? "PASS" : "FAIL" });
  }
  const parentTree = parseLsTree(runGit(["ls-tree", "-r", "-l", PHASE7A_PARENT]).stdout);
  const headTree = parseLsTree(runGit(["ls-tree", "-r", "-l", head]).stdout);
  const changes = parseNameStatus(runGit(["diff", "--name-status", "--no-renames", PHASE7A_PARENT, head]).stdout);
  const numstat = parseNumstat(runGit(["diff", "--numstat", "--no-renames", PHASE7A_PARENT, head]).stdout);
  const failures = [];
  const limitations = [];
  if (branch !== PHASE7A_BRANCH) failures.push(`Current branch is ${branch || "NOT OBSERVED"}, expected ${PHASE7A_BRANCH}.`);
  if (!ancestry) failures.push("The frozen Phase 7A parent is not an ancestor of HEAD.");
  if (localMainResult.status !== 0 || localMainResult.stdout !== FROZEN_MAIN) failures.push("Local main does not resolve to the frozen-main contract value.");
  if (merges.length > 0) failures.push("Merge commits occur after the frozen Phase 7A parent.");
  if (deletedInventory.some((item) => item.status === "FAIL")) failures.push("The deletion inventory differs from the Phase 7A contract.");
  if (originMainResult.status !== 0) limitations.push("origin/main was NOT AVAILABLE TO EXECUTION ENVIRONMENT.");
  else if (originMainResult.stdout !== FROZEN_MAIN) limitations.push("origin/main differs from the frozen-main contract value.");
  if (worktreeLines.length > 0) limitations.push("The worktree is dirty; exact relative status lines are inventoried.");
  return {
    status: failures.length > 0 ? "FAIL" : limitations.length > 0 ? "LIMITATION" : "PASS",
    branch,
    head,
    expectedBranch: PHASE7A_BRANCH,
    expectedParent: PHASE7A_PARENT,
    parentIsAncestor: ancestry,
    frozenMainExpected: FROZEN_MAIN,
    localMain: localMainResult.status === 0 ? localMainResult.stdout : null,
    originMain: originMainResult.status === 0 ? originMainResult.stdout : null,
    mergeCommits: merges,
    worktree: { clean: worktreeLines.length === 0, statusLines: worktreeLines },
    deletionInventory: deletedInventory,
    trackedTrees: {
      parent: parentTree,
      head: headTree,
      delta: { files: headTree.fileCount - parentTree.fileCount, bytes: headTree.bytes - parentTree.bytes },
    },
    trackedChanges: { count: changes.length, entries: changes, ...numstat },
    failures,
    limitations,
  };
}

export async function collectPhysicalEvidence() {
  const assets = [];
  for (const [relativePath, expectedSha256] of PHYSICAL_ASSETS) {
    const filename = path.join(REPO_ROOT, relativePath);
    if (await missing(filename)) {
      assets.push({ path: relativePath, expectedSha256, actualSha256: null, bytes: null, status: "NOT OBSERVED" });
      continue;
    }
    const details = await stat(filename);
    const actualSha256 = await sha256File(filename);
    assets.push({
      path: relativePath,
      expectedSha256,
      actualSha256,
      bytes: details.size,
      status: actualSha256 === expectedSha256 ? "PASS" : "FAIL",
    });
  }
  const status = assets.some((asset) => asset.status === "FAIL")
    ? "FAIL"
    : assets.some((asset) => asset.status === "NOT OBSERVED")
      ? "NOT OBSERVED"
      : "PASS";
  return { status, assets };
}

function indexStatus(documents) {
  const nonHuman = documents.filter((document) => document.status !== "PENDING HUMAN REVIEW").map((document) => document.status);
  return aggregateStatuses(nonHuman, "NOT OBSERVED");
}

export function buildOutputFiles(documents, sourceDescriptors) {
  const files = new Map();
  for (let index = 0; index < documents.length; index += 1) {
    const [key] = REPORT_DEFINITIONS[index];
    files.set(`${key}.json`, stableJson(documents[index]));
    files.set(`${key}.md`, renderReportMarkdown(documents[index]));
  }
  const indexDocument = {
    schema: ASSEMBLY_SCHEMA,
    title: "Phase 7A deterministic report assembly",
    status: indexStatus(documents),
    statement: "These reports bind supplied machine evidence without fabricating unavailable observations. All six Phase 7A approval gates remain PENDING HUMAN REVIEW.",
    evidencePolicy: {
      unavailableEvidence: "NOT AVAILABLE TO EXECUTION ENVIRONMENT",
      absentObservation: "NOT OBSERVED",
      incompleteEvidence: "LIMITATION",
      humanApproval: "PENDING HUMAN REVIEW",
    },
    inputs: sourceDescriptors,
    reports: documents.map((document, index) => ({
      key: REPORT_DEFINITIONS[index][0],
      title: document.title,
      status: document.status,
      json: `${REPORT_DEFINITIONS[index][0]}.json`,
      markdown: `${REPORT_DEFINITIONS[index][0]}.md`,
    })),
    humanGates: Object.fromEntries(PHASE7A_GATES.map((gate) => [gate, "PENDING HUMAN REVIEW"])),
  };
  files.set("00-assembly-index.json", stableJson(indexDocument));
  files.set("00-assembly-index.md", renderReportMarkdown({
    title: indexDocument.title,
    status: indexDocument.status,
    statement: indexDocument.statement,
    sources: sourceDescriptors,
    summary: { evidencePolicy: indexDocument.evidencePolicy, reports: indexDocument.reports },
    observations: indexDocument.reports.map((item) => observation(item.status, item.title, `${item.json}; ${item.markdown}`)),
    limitations: ["All six human approval gates remain PENDING HUMAN REVIEW."],
  }));

  const manifestEntries = [...files.entries()]
    .map(([filename, content]) => ({ filename, bytes: Buffer.byteLength(content), sha256: sha256(content) }))
    .sort((left, right) => left.filename.localeCompare(right.filename));
  const manifest = {
    schema: `${ASSEMBLY_SCHEMA}.manifest`,
    status: indexDocument.status,
    deterministic: true,
    generatedAt: null,
    sourceBindings: sourceDescriptors,
    fileCountExcludingManifest: manifestEntries.length,
    files: manifestEntries,
    humanGates: Object.fromEntries(PHASE7A_GATES.map((gate) => [gate, "PENDING HUMAN REVIEW"])),
  };
  files.set("assembly-manifest.json", stableJson(manifest));
  return files;
}

export function parseArguments(argv) {
  if (argv.length === 1 && argv[0] === "--self-test") return { selfTest: true };
  const options = {};
  const names = new Map([
    ["--browser-report", "browserReport"],
    ["--build-delta", "buildDelta"],
    ["--check-log", "checkLog"],
    ["--test-log", "testLog"],
    ["--deployment-json", "deploymentJson"],
    ["--output-dir", "outputDirectory"],
  ]);
  for (let index = 0; index < argv.length; index += 2) {
    const key = names.get(argv[index]);
    if (!key || index + 1 >= argv.length) throw new Error(`Unknown or incomplete argument: ${argv[index] ?? "<missing>"}`);
    if (options[key]) throw new Error(`Duplicate argument: ${argv[index]}`);
    options[key] = argv[index + 1];
  }
  for (const key of ["browserReport", "buildDelta", "checkLog", "testLog", "outputDirectory"]) {
    if (!options[key]) throw new Error(`Missing required argument for ${key}`);
  }
  return options;
}

export async function writePhase7AReports(options, overrides = {}) {
  const repoRealpath = await realpath(REPO_ROOT);
  const outputDirectory = await validateFreshExternalOutput(options.outputDirectory, repoRealpath);
  const browserBound = await readBoundFile(options.browserReport, "browser report", repoRealpath, true);
  const buildBound = await readBoundFile(options.buildDelta, "build delta", repoRealpath, true);
  const checkBound = await readBoundFile(options.checkLog, "exact check log", repoRealpath, false);
  const testBound = await readBoundFile(options.testLog, "exact test log", repoRealpath, false);
  const deploymentBound = options.deploymentJson
    ? await readBoundFile(options.deploymentJson, "deployment JSON", repoRealpath, true)
    : null;
  const sources = [
    { key: "browser", descriptor: browserBound.descriptor },
    { key: "buildDelta", descriptor: buildBound.descriptor },
    { key: "checkLog", descriptor: checkBound.descriptor },
    { key: "testLog", descriptor: testBound.descriptor },
  ];
  if (deploymentBound) sources.push({ key: "deployment", descriptor: deploymentBound.descriptor });
  const gitEvidence = overrides.gitEvidence ?? await collectGitEvidence();
  const physicalEvidence = overrides.physicalEvidence ?? await collectPhysicalEvidence();
  const documents = createPhase7AReportBundle({
    browser: browserBound.value,
    buildDelta: buildBound.value,
    checkLog: checkBound.value,
    testLog: testBound.value,
    deployment: deploymentBound?.value ?? null,
    sources,
    gitEvidence,
    physicalEvidence,
  });
  const files = buildOutputFiles(documents, sources.map((source) => source.descriptor));
  await mkdir(outputDirectory);
  try {
    for (const [filename, content] of [...files.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      await writeFile(path.join(outputDirectory, filename), content, { encoding: "utf8", flag: "wx" });
    }
  } catch (error) {
    await rm(outputDirectory, { recursive: true, force: true });
    throw error;
  }
  return {
    outputDirectory,
    status: JSON.parse(files.get("00-assembly-index.json")).status,
    fileCount: files.size,
    files: [...files.keys()].sort((left, right) => left.localeCompare(right)),
  };
}

function selfTestBrowser() {
  const result = (engine, routeCount, responsiveCount) => ({
    identity: { engine },
    routes: Array.from({ length: routeCount }, () => ({ status: "PASS" })),
    accessibility: Array.from({ length: 20 }, () => ({ status: "PASS", accessibility: { violations: [], incomplete: [] } })),
    responsive: Array.from({ length: responsiveCount }, () => ({ status: "PASS" })),
    fallback: {
      reducedMotion: { status: "PASS" },
      noJavaScript: { status: "PASS" },
      fallbackFont: { status: "PASS" },
    },
    cycles: { status: "PASS", samples: Array.from({ length: 10 }, () => ({ status: "PASS" })) },
    network: [{ status: "PASS" }, { status: "PASS" }],
  });
  return {
    schema: BROWSER_SCHEMA,
    results: [result("chromium", 130, 13), result("firefox", 34, 4), result("webkit", 34, 4)],
    limitations: ["Automated observations supplement human review."],
  };
}

function selfTestSources() {
  return ["browser", "buildDelta", "checkLog", "testLog"].map((key) => ({
    key,
    descriptor: { label: key, filename: `${key}.txt`, bytes: 1, sha256: "0".repeat(64) },
  }));
}

export async function selfTest() {
  const browser = selfTestBrowser();
  const buildDelta = { schema: BUILD_DELTA_SCHEMA, comparisons: { complete: { totals: {} }, signalFieldIsolated: { totals: {} } } };
  const gitEvidence = {
    status: "PASS",
    branch: PHASE7A_BRANCH,
    parentIsAncestor: true,
    mergeCommits: [],
    worktree: { clean: true, statusLines: [] },
    deletionInventory: DELETED_PRODUCTION_PATHS.map((item) => ({ path: item, absentAtHead: true, existedAtParent: true, status: "PASS" })),
    limitations: [],
  };
  const physicalEvidence = {
    status: "PASS",
    assets: PHYSICAL_ASSETS.map(([item, expectedSha256]) => ({ path: item, expectedSha256, actualSha256: expectedSha256, bytes: 1, status: "PASS" })),
  };
  const input = {
    browser,
    buildDelta,
    checkLog: "status: PASS\n",
    testLog: "# pass 3\n# fail 0\n",
    deployment: null,
    sources: selfTestSources(),
    gitEvidence,
    physicalEvidence,
  };
  const first = buildOutputFiles(createPhase7AReportBundle(input), input.sources.map((item) => item.descriptor));
  const second = buildOutputFiles(createPhase7AReportBundle(input), input.sources.map((item) => item.descriptor));
  if (first.size !== 29 || second.size !== 29) throw new Error("self-test expected exactly 29 files");
  for (const [filename, content] of first) {
    if (second.get(filename) !== content) throw new Error(`self-test found nondeterministic content in ${filename}`);
  }
  const gates = JSON.parse(first.get("13-human-gates.json"));
  if (gates.status !== "PENDING HUMAN REVIEW" || gates.summary.gates.length !== 6) throw new Error("self-test found an invalid human-gate record");
  const performance = JSON.parse(first.get("06-performance-lifecycle.json"));
  if (performance.status !== "LIMITATION") throw new Error("self-test improperly promoted incomplete performance evidence");
  return { status: "PASS", fileCount: first.size };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.selfTest) {
    process.stdout.write(`${stableJson(await selfTest())}`);
    return;
  }
  const result = await writePhase7AReports(options);
  process.stdout.write(stableJson({ status: result.status, fileCount: result.fileCount, outputDirectory: result.outputDirectory }));
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invoked === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`Phase 7A report assembly failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
