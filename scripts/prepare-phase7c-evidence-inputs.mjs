#!/usr/bin/env node

import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  access,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  PHASE7C_ALLOWED_STATUSES,
  PHASE7C_BRANCH,
  PHASE7C_CORE_VIEWPORTS,
  PHASE7C_CYCLE_COUNT,
  PHASE7C_DOCUMENTARY_ASSET,
  PHASE7C_FROZEN_MAIN,
  PHASE7C_GATES,
  PHASE7C_INDUSTRIES,
  PHASE7C_MACRO_STATES,
  PHASE7C_PARENT,
  PHASE7C_PERFORMANCE_BUDGET,
  PHASE7C_PRODUCTION_PATHS,
  PHASE7C_PROOF_RECORD,
  PHASE7C_RECORDING_SCENARIOS,
  PHASE7C_REQUIRED_NODE,
  PHASE7C_STATE_SAMPLES,
} from "./phase7c-contract.mjs";
import {
  PHASE7C_RECORDING_INVENTORY_SCHEMA,
  REQUIRED_PHASE7C_INPUTS,
  assertExternalPhase7CPath,
  assertNoPrivateOrSecretPhase7CPayload,
  normalizePhase7CEvidenceEntries,
} from "./assemble-phase7c-evidence.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCHEMA = "quantum-hub.phase-7c.evidence-input-preparation.v1";
export const RECORDING_MAP_SCHEMA = "quantum-hub.phase-7c.transcoded-recording-map.v1";
export const BROWSER_SCHEMA = "quantum-hub.phase-7c.territory-proof-browser-qa.v1";
export const ACCEPTED_AUTHORITY_SCHEMA = "quantum-hub.phase-7c.accepted-authority-regression.v1";
export const NATIVE200_SCHEMA = "quantum-hub.phase-7c.installed-chrome-native-200.v1";
export const BUILD_DELTA_SCHEMA = "quantum-hub.phase-7c.build-delta.v1";
export const DEPLOYMENT_SCHEMA = "quantum-hub.phase-7c.deployment-verification.v1";
export const BROWSER_REPORT_NAME = "phase-7c-browser-qa.json";
export const ACCEPTED_REPORT_NAME = "phase-7c-accepted-authority-regression.json";
export const NATIVE200_REPORT_NAME = "installed-chrome-native-200.json";
export const MANIFEST_NAME = "evidence-manifest.json";
export const NATIVE200_MANIFEST_NAME = "installed-chrome-native-200-manifest.json";
export const REQUIRED_BROWSER_CASES = Object.freeze([
  "forward-reverse-fast-stop",
  "authored-mobile-forward-reverse",
  "responsive-and-short-landscape",
  "reduced-motion-no-js-fallback-font",
  "field-map-keyboard-inert",
  "accessibility",
  "ten-cycle-cls-lifecycle-performance",
  "network-failure-media-isolation",
]);
const REPORTABLE_RECORDING_SCENARIOS = new Set(["documentary-media-network", "lifecycle-ten-cycles"]);

const HASH40 = /^[0-9a-f]{40}$/;
const HASH64 = /^[0-9a-f]{64}$/;
const RECEIPT_LABEL = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DESIGN_DOCUMENTS = Object.freeze([
  "docs/phase-7c-territory-proof-architecture.md",
  "docs/phase-7c-reference-study.md",
  "docs/phase-7c-documentary-asset-ledger.md",
]);
const ACCEPTED_CASES = Object.freeze([
  "phase7a-manifesto-signal-field",
  "phase7a-audience-bifurcation",
  "phase7a-field-map-closed",
  "phase7a-field-map-open",
  "phase7b-method-frame",
  "phase7b-method-source",
  "phase7b-method-assess",
  "phase7b-method-test",
  "phase7b-method-decide",
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function stableJson(value) {
  const normalize = (item) => Array.isArray(item)
    ? item.map(normalize)
    : item && typeof item === "object"
      ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, normalize(item[key])]))
      : item;
  return `${JSON.stringify(normalize(value), null, 2)}\n`;
}

function normalizePath(value) {
  return String(value).replaceAll("\\", "/");
}

function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function exists(candidate) {
  try { await access(candidate); return true; }
  catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

function portableRelative(value, label) {
  invariant(typeof value === "string" && value.length > 0, `${label} is missing`);
  invariant(!value.includes("\\") && !path.posix.isAbsolute(value) && path.posix.normalize(value) === value, `${label} is not a portable relative path`);
  invariant(!value.split("/").some((segment) => !segment || segment === "." || segment === ".." || segment.startsWith(".")), `${label} traverses or enters a hidden path`);
  return value;
}

function validateStatus(document, label, { requirePass = false } = {}) {
  invariant(document && typeof document === "object" && !Array.isArray(document), `${label} must be a JSON object`);
  invariant(PHASE7C_ALLOWED_STATUSES.includes(document.status), `${label} status is outside the governed taxonomy`);
  invariant(document.status !== "FAIL", `${label} contains an unresolved FAIL`);
  invariant(document.status !== "PENDING HUMAN REVIEW", `${label} is evidence, not a human-gate decision`);
  if (requirePass) invariant(document.status === "PASS", `${label} must PASS`);
  return document.status;
}

function validateRevision(value, revision, label) {
  invariant(value === revision, `${label} revision differs from final revision`);
}

function aggregateStatus(statuses) {
  const values = statuses.filter(Boolean);
  invariant(values.length > 0, "cannot aggregate an empty evidence status set");
  invariant(!values.includes("FAIL"), "cannot derive packaged evidence from FAIL status");
  if (values.every((status) => status === "PASS")) return "PASS";
  if (values.includes("LIMITATION")) return "LIMITATION";
  if (values.includes("NOT AVAILABLE TO EXECUTION ENVIRONMENT")) return "NOT AVAILABLE TO EXECUTION ENVIRONMENT";
  return "NOT OBSERVED";
}

function safeParseJson(bytes, label) {
  try { return JSON.parse(Buffer.from(bytes).toString("utf8")); }
  catch { throw new Error(`${label} is not valid JSON`); }
}

function redactString(value, roots) {
  if (path.win32.isAbsolute(value) || (path.posix.isAbsolute(value) && !value.startsWith("//"))) return "<private-path-redacted>";
  let result = value;
  const variants = [...new Set(roots.filter(Boolean).flatMap((root) => [path.resolve(root), normalizePath(path.resolve(root))]))]
    .sort((left, right) => right.length - left.length);
  for (const variant of variants) result = result.split(variant).join("<private-path-redacted>");
  return result;
}

function sanitizeValue(value, roots) {
  if (typeof value === "string") return redactString(value, roots);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, roots));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeValue(item, roots)]));
  return value;
}

function jsonBytes(value, roots, relativePath) {
  const bytes = Buffer.from(stableJson(sanitizeValue(value, roots)));
  assertNoPrivateOrSecretPhase7CPayload(bytes, relativePath);
  return bytes;
}

function textBytes(value, roots, relativePath) {
  const normalized = `${redactString(String(value), roots).replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n*$/, "")}\n`;
  const bytes = Buffer.from(normalized);
  assertNoPrivateOrSecretPhase7CPayload(bytes, relativePath);
  return bytes;
}

async function realDirectory(directory, label) {
  const absolute = path.resolve(directory);
  const status = await lstat(absolute);
  invariant(status.isDirectory() && !status.isSymbolicLink(), `${label} must be a real directory`);
  invariant(path.resolve(await realpath(absolute)) === absolute, `${label} may not traverse a symlink`);
  return absolute;
}

async function readJson(filename, label) {
  const bytes = await readFile(filename);
  invariant(bytes.length > 0, `${label} is empty`);
  return { bytes, document: safeParseJson(bytes, label) };
}

function manifestRows(manifest, label) {
  const rows = Array.isArray(manifest.entries) ? manifest.entries : manifest.payloads;
  invariant(Array.isArray(rows) && rows.length > 0, `${label} contains no payload ledger`);
  return rows;
}

export async function verifyEvidenceRoot({ root, reportName, manifestName, label }) {
  const absoluteRoot = await realDirectory(root, `${label} root`);
  portableRelative(reportName, `${label} report name`);
  portableRelative(manifestName, `${label} manifest name`);
  const manifestPath = path.join(absoluteRoot, ...manifestName.split("/"));
  const { bytes: manifestBytes, document: manifest } = await readJson(manifestPath, `${label} manifest`);
  if (Object.hasOwn(manifest, "status")) validateStatus(manifest, `${label} manifest`);
  const rows = manifestRows(manifest, `${label} manifest`);
  const seen = new Set();
  const payloads = [];
  for (const row of rows) {
    const relativePath = portableRelative(row.path, `${label} manifest payload`);
    invariant(!seen.has(relativePath), `${label} manifest contains a duplicate payload path`);
    seen.add(relativePath);
    invariant(Number.isSafeInteger(row.bytes) && row.bytes > 0 && HASH64.test(row.sha256 ?? ""), `${label} manifest payload metadata differs: ${relativePath}`);
    const absolutePath = path.resolve(absoluteRoot, ...relativePath.split("/"));
    invariant(isWithin(absoluteRoot, absolutePath), `${label} manifest payload escapes its root`);
    const status = await lstat(absolutePath);
    invariant(status.isFile() && !status.isSymbolicLink(), `${label} payload is not a regular file: ${relativePath}`);
    invariant(path.resolve(await realpath(absolutePath)) === absolutePath, `${label} payload traverses a symlink: ${relativePath}`);
    const bytes = await readFile(absolutePath);
    invariant(bytes.length === row.bytes && sha256(bytes) === row.sha256, `${label} payload hash or byte size differs: ${relativePath}`);
    payloads.push({ relativePath, absolutePath, bytes, bytesCount: bytes.length, sha256: row.sha256 });
  }
  invariant(seen.has(reportName), `${label} manifest does not bind its report`);
  const reportPayload = payloads.find(({ relativePath }) => relativePath === reportName);
  const report = safeParseJson(reportPayload.bytes, `${label} report`);
  validateStatus(report, `${label} report`);
  return {
    root: absoluteRoot,
    report,
    reportBinding: {
      path: reportName,
      bytes: reportPayload.bytesCount,
      sha256: reportPayload.sha256,
      schema: report.schema ?? null,
      status: report.status,
    },
    manifestBinding: {
      path: manifestName,
      bytes: manifestBytes.length,
      sha256: sha256(manifestBytes),
      schema: manifest.schema ?? null,
      status: manifest.status ?? null,
      payloadCount: rows.length,
    },
    payloads,
  };
}

function validateBrowserReport(report, revision) {
  invariant(report.schema === BROWSER_SCHEMA, "browser QA schema differs");
  validateRevision(report.revision, revision, "browser QA");
  invariant(Array.isArray(report.results) && report.results.length === 3, "browser QA must bind Chromium, Firefox and WebKit proxy");
  const expected = ["chromium", "firefox", "webkit"];
  invariant(expected.every((engine) => report.results.some((result) => result.engine === engine)), "browser QA engine matrix differs");
  for (const result of report.results) {
    validateStatus(result, `browser QA ${result.engine}`);
    if (result.status !== "NOT AVAILABLE TO EXECUTION ENVIRONMENT") {
      const names = new Set((result.cases ?? []).map(({ name }) => name));
      invariant(REQUIRED_BROWSER_CASES.every((name) => names.has(name)), `${result.engine} browser QA is not the full Phase 7C suite`);
      for (const item of result.cases) validateStatus(item, `${result.engine}/${item.name}`);
    }
  }
  invariant(JSON.stringify(report.humanGates) === JSON.stringify(PHASE7C_GATES.map((name) => ({ name, status: "PENDING HUMAN REVIEW" }))), "browser QA human gates differ");
  return report;
}

function validateAcceptedReport(report, revision) {
  invariant(report.schema === ACCEPTED_AUTHORITY_SCHEMA, "accepted-authority schema differs");
  validateStatus(report, "accepted-authority report", { requirePass: true });
  validateRevision(report.authority?.phase7b?.revision, PHASE7C_PARENT, "accepted-authority Phase 7B");
  validateRevision(report.authority?.phase7c?.revision, revision, "accepted-authority Phase 7C");
  invariant(report.authority?.baselineMutation === "NONE" && report.authority?.productionMutation === "NONE", "accepted-authority mutation evidence differs");
  const ids = new Set((report.cases ?? []).map(({ id }) => id));
  invariant(ACCEPTED_CASES.every((id) => ids.has(id)), "accepted-authority governed-state inventory differs");
  invariant(report.cases.every(({ status }) => status === "PASS"), "accepted-authority contains a non-PASS governed state");
  return report;
}

function validateNative200Report(report, revision) {
  invariant(report.schema === NATIVE200_SCHEMA, "installed-Chrome 200% schema differs");
  validateRevision(report.revision, revision, "installed-Chrome 200%");
  validateStatus(report, "installed-Chrome 200%");
  invariant(report.humanGate === "PENDING HUMAN REVIEW", "installed-Chrome 200% human-gate metadata differs");
  if (report.status === "PASS") {
    invariant(report.genuineInstalledChrome === true && report.nativeZoomPercent === 200, "installed-Chrome 200% is not genuine browser-native evidence");
    invariant(report.observedTargetUrl === report.exactTargetUrl, "installed-Chrome 200% target URL differs");
  }
  return report;
}

function validateBuildDelta(report, revision) {
  invariant(report.schema === BUILD_DELTA_SCHEMA, "build-delta schema differs");
  validateStatus(report, "build-delta report", { requirePass: true });
  validateRevision(report.source?.phase7bParent?.commit, PHASE7C_PARENT, "build-delta parent");
  validateRevision(report.source?.phase7cCurrent?.baseCommit, revision, "build-delta Phase 7C");
  return report;
}

function validateDeployment(report, revision) {
  invariant(report.schema === DEPLOYMENT_SCHEMA, "deployment schema differs");
  validateStatus(report, "deployment report", { requirePass: true });
  validateRevision(report.authority?.parent, PHASE7C_PARENT, "deployment parent");
  validateRevision(report.authority?.frozenMain, PHASE7C_FROZEN_MAIN, "deployment main");
  validateRevision(report.deployment?.deployedSha, revision, "deployed Git SHA");
  validateRevision(report.repository?.head, revision, "deployment repository HEAD");
  invariant(report.repository?.upstream?.parity === true && report.repository?.zeroMergeCommits === true && report.repository?.cleanWorktree === true, "deployment repository provenance differs");
  return report;
}

function sourceBinding(name, binding, revision) {
  return { name, revision, ...binding };
}

function findCase(result, name) {
  return (result.cases ?? []).find((item) => item.name === name) ?? null;
}

function engineCaseRows(browserReport, name) {
  return browserReport.results.map((result) => {
    if (result.status === "NOT AVAILABLE TO EXECUTION ENVIRONMENT") {
      return { engine: result.engine, engineAuthority: result.engineAuthority, status: result.status, limitations: result.limitations ?? [] };
    }
    const evidence = findCase(result, name);
    invariant(evidence, `${result.engine} is missing ${name}`);
    return { engine: result.engine, engineAuthority: result.engineAuthority, status: evidence.status, evidence };
  });
}

function reportDocument(schema, revision, binding, statuses, evidence) {
  return { schema, status: aggregateStatus(statuses), revision, binding, ...evidence };
}

function deriveBrowserMatrix(report, revision, binding) {
  return reportDocument("quantum-hub.phase-7c.browser-matrix.v1", revision, binding, report.results.map(({ status }) => status), {
    engines: report.results.map(({ engine, engineAuthority, browserSource, browserVersion, headed, status, failures = [], limitations = [], cases = [] }) => ({
      engine, engineAuthority, browserSource: browserSource ?? null, browserVersion: browserVersion ?? null, headed: headed ?? null, status, failures, limitations,
      cases: cases.map(({ name, status: caseStatus }) => ({ name, status: caseStatus })),
    })),
    methodology: report.methodology,
  });
}

function deriveWebkit(report, revision, binding) {
  const result = report.results.find(({ engine }) => engine === "webkit");
  invariant(result, "browser report lacks WebKit proxy evidence");
  return reportDocument("quantum-hub.phase-7c.webkit-proxy.v1", revision, binding, [result.status], {
    authority: "Playwright WebKit proxy; not physical Safari",
    physicalSafari: "NOT OBSERVED",
    result,
  });
}

function deriveResponsive(report, native200, revision, bindings) {
  const responsive = engineCaseRows(report, "responsive-and-short-landscape");
  const mobile = engineCaseRows(report, "authored-mobile-forward-reverse");
  const fallback = engineCaseRows(report, "reduced-motion-no-js-fallback-font");
  return reportDocument("quantum-hub.phase-7c.responsive-matrix.v1", revision, bindings, [
    ...responsive.map(({ status }) => status), ...mobile.map(({ status }) => status), ...fallback.map(({ status }) => status), native200.status,
  ], {
    coreViewports: PHASE7C_CORE_VIEWPORTS.map(([width, height]) => ({ id: `${width}x${height}`, width, height })),
    responsive,
    authoredMobile: mobile,
    reducedMotionNoJsFallbackFont: fallback,
    installedChromeNative200: native200,
  });
}

function deriveAccessibility(report, native200, revision, bindings) {
  const axe = engineCaseRows(report, "accessibility");
  const fieldMap = engineCaseRows(report, "field-map-keyboard-inert");
  return reportDocument("quantum-hub.phase-7c.accessibility.v1", revision, bindings, [
    ...axe.map(({ status }) => status), ...fieldMap.map(({ status }) => status), native200.status,
  ], { axe, fieldMap, installedChromeFieldMap: native200.fieldMap ?? null });
}

function deriveTargets(report, revision, binding) {
  const records = [];
  for (const result of report.results) {
    if (result.status === "NOT AVAILABLE TO EXECUTION ENVIRONMENT") {
      records.push({ engine: result.engine, status: result.status, inventories: [] });
      continue;
    }
    const responsive = findCase(result, "responsive-and-short-landscape");
    const fieldMap = findCase(result, "field-map-keyboard-inert");
    const inventories = [
      ...(responsive?.records ?? []).map(({ viewport, targets }) => ({ state: "responsive-proof", viewport, targets })),
      ...(fieldMap?.targets ? [{ state: "field-map-open", viewport: "1280x800", targets: fieldMap.targets }] : []),
    ];
    invariant(inventories.length > 0, `${result.engine} target-size inventory is empty`);
    const statuses = inventories.map(({ targets }) => targets?.status);
    invariant(statuses.every((status) => status && status !== "FAIL"), `${result.engine} contains a target-size failure`);
    records.push({ engine: result.engine, status: aggregateStatus(statuses), inventories });
  }
  return reportDocument("quantum-hub.phase-7c.target-sizes.v1", revision, binding, records.map(({ status }) => status), { minimumCssPixels: 44, records });
}

function lifecycleRows(report) {
  return engineCaseRows(report, "ten-cycle-cls-lifecycle-performance");
}

function derivePerformance(report, buildDelta, revision, bindings) {
  const lifecycle = lifecycleRows(report);
  return reportDocument("quantum-hub.phase-7c.performance.v1", revision, bindings, [...lifecycle.map(({ status }) => status), buildDelta.status], {
    budgets: PHASE7C_PERFORMANCE_BUDGET,
    buildDelta: { status: buildDelta.status, budgets: buildDelta.budgets, comparison: buildDelta.comparison, source: buildDelta.source },
    browserLifecycle: lifecycle,
  });
}

function deriveLifecycle(report, revision, binding) {
  const rows = lifecycleRows(report);
  return reportDocument("quantum-hub.phase-7c.lifecycle.v1", revision, binding, rows.map(({ status }) => status), { requiredCycles: PHASE7C_CYCLE_COUNT, engines: rows });
}

function deriveCls(report, revision, binding) {
  const rows = lifecycleRows(report).map((row) => ({
    engine: row.engine,
    engineAuthority: row.engineAuthority,
    status: row.status,
    budget: row.evidence?.clsBudget ?? PHASE7C_PERFORMANCE_BUDGET.clsMaximum,
    cycles: (row.evidence?.cycles ?? []).map(({ cycle, measurement }) => ({ cycle, measurement })),
    limitations: row.limitations ?? row.evidence?.limitations ?? [],
  }));
  for (const row of rows) {
    if (row.status === "PASS" || row.status === "LIMITATION") invariant(row.cycles.length === PHASE7C_CYCLE_COUNT, `${row.engine} CLS cycle ledger is incomplete`);
  }
  return reportDocument("quantum-hub.phase-7c.cycle-attributable-cls.v1", revision, binding, rows.map(({ status }) => status), { maximum: PHASE7C_PERFORMANCE_BUDGET.clsMaximum, engines: rows });
}

function deriveNetwork(report, revision, binding) {
  const rows = engineCaseRows(report, "network-failure-media-isolation");
  return reportDocument("quantum-hub.phase-7c.network.v1", revision, binding, rows.map(({ status }) => status), { engines: rows });
}

function deriveGovernancePart(name, part, deployment, revision, binding) {
  invariant(part && typeof part === "object", `deployment ${name} evidence is missing`);
  validateStatus(part, `deployment ${name}`, { requirePass: true });
  return reportDocument(`quantum-hub.phase-7c.${name}.v1`, revision, binding, [part.status], {
    deployedSha: deployment.deployment.deployedSha,
    evidence: part,
  });
}

function deriveRegression(phase, accepted, deployment, revision, bindings) {
  const prefix = phase === "phase7a" ? "phase7a-" : "phase7b-";
  const cases = accepted.cases.filter(({ id }) => id.startsWith(prefix));
  invariant(cases.length === (phase === "phase7a" ? 4 : 5), `${phase} regression case count differs`);
  const deploymentRegression = deployment.governance?.regression;
  invariant(deploymentRegression?.status === "PASS", "deployment regression evidence is missing");
  return reportDocument(`quantum-hub.phase-7c.${phase}-regression.v1`, revision, bindings, [accepted.status, deploymentRegression.status, ...cases.map(({ status }) => status)], {
    cases,
    deploymentRegression,
    originalExactComparisonsPreserved: true,
    edgeQuantizationAdjudicationNeverRelabelledExact: true,
  });
}

function extractLimitations(browser, native200, accepted, recordingMap) {
  const rows = [];
  for (const result of browser.results) {
    for (const detail of result.limitations ?? []) rows.push({ source: `browser:${result.engine}`, classification: "LIMITATION", detail });
    if (result.engine === "webkit") rows.push({ source: "browser:webkit", classification: "PROXY EVIDENCE", detail: "Playwright WebKit is proxy evidence and is not physical Safari." });
    if (result.status === "NOT AVAILABLE TO EXECUTION ENVIRONMENT") rows.push({ source: `browser:${result.engine}`, classification: result.status, detail: "Engine was unavailable to this execution environment." });
  }
  if (native200.status !== "PASS") rows.push({ source: "installed-chrome-200", classification: native200.status, detail: native200.environmentalLimitation ?? native200.classification ?? "Fresh native-200 observation unavailable." });
  if (accepted.status !== "PASS") rows.push({ source: "accepted-authority", classification: accepted.status, detail: "Accepted-authority comparison was bounded by an environmental limitation." });
  for (const scenario of recordingMap.scenarios) if (scenario.status !== "PASS") rows.push({ source: `recording:${scenario.scenario}`, classification: scenario.status, detail: scenario.limitation ?? "Recording observation was not available." });
  rows.push(
    { source: "device-matrix", classification: "NOT OBSERVED", detail: "No claim of physical Safari authority is made from Playwright WebKit proxy evidence." },
    { source: "device-matrix", classification: "NOT OBSERVED", detail: "No unrecorded physical-device or physical-human-input claim is promoted to PASS." },
  );
  return rows;
}

function taskBrief(revision) {
  return `# QUANTUM-HUB QSITE1 — PHASE 7C\n\nFinal evidence authority for the Territory Traverse + documentary Proof threshold.\n\n- Branch: \`${PHASE7C_BRANCH}\`\n- Exact accepted Phase 7B parent: \`${PHASE7C_PARENT}\`\n- Final Phase 7C revision: \`${revision}\`\n- Frozen local/origin main: \`${PHASE7C_FROZEN_MAIN}\`\n- Production boundary: exactly four industries and one Maradin documentary Proof record.\n- Native vertical scroll remains the sole progress authority.\n- Proxy, limitation, prior evidence, and unavailable observations retain their honest taxonomy.\n\n${PHASE7C_GATES.map((gate, index) => `${index + 1}. ${gate} — PENDING HUMAN REVIEW`).join("\n")}\n\nALL SIX PHASE 7C GATES — PENDING HUMAN REVIEW\nPHASE 7D — NOT AUTHORIZED\nMAIN — NOT MERGED\n`;
}

function stateSpecification(revision) {
  return {
    schema: "quantum-hub.phase-7c.state-specification.v1",
    status: "PASS",
    revision,
    branch: PHASE7C_BRANCH,
    acceptedParent: PHASE7C_PARENT,
    runtime: { node: PHASE7C_REQUIRED_NODE, newRuntimeDependencies: 0 },
    industries: PHASE7C_INDUSTRIES,
    proofRecord: PHASE7C_PROOF_RECORD,
    macroStates: PHASE7C_MACRO_STATES,
    samples: PHASE7C_STATE_SAMPLES.map(([state, progress]) => ({ state, progress })),
    nativeDocumentScrollSoleAuthority: true,
    deterministicFromCurrentPosition: true,
    cycleCount: PHASE7C_CYCLE_COUNT,
    performanceBudget: PHASE7C_PERFORMANCE_BUDGET,
    documentaryAsset: PHASE7C_DOCUMENTARY_ASSET,
    gates: PHASE7C_GATES.map((name) => ({ name, decision: "PENDING HUMAN REVIEW" })),
    phase7D: "NOT AUTHORIZED",
    main: "NOT MERGED",
  };
}

function validateRecordingMap(recordingMap, revision) {
  invariant(recordingMap.schema === RECORDING_MAP_SCHEMA, "recording map schema differs");
  validateStatus(recordingMap, "recording map");
  validateRevision(recordingMap.revision, revision, "recording map");
  invariant(Array.isArray(recordingMap.scenarios) && recordingMap.scenarios.length === PHASE7C_RECORDING_SCENARIOS.length, "recording map scenario count differs");
  recordingMap.scenarios.forEach((row, index) => {
    invariant(row.scenario === PHASE7C_RECORDING_SCENARIOS[index], "recording map order differs");
    validateStatus(row, `recording ${row.scenario}`);
    invariant(Array.isArray(row.artifacts), `recording ${row.scenario} artifacts are missing`);
    if (row.status === "PASS") invariant(row.artifacts.length > 0, `PASS recording ${row.scenario} has no bound artifact`);
    for (const artifact of row.artifacts) {
      invariant(artifact && typeof artifact === "object", `recording ${row.scenario} artifact metadata differs`);
      portableRelative(artifact.path, `recording ${row.scenario} artifact path`);
      const extension = path.posix.extname(artifact.path).toLowerCase();
      invariant(
        extension === ".mp4" || (REPORTABLE_RECORDING_SCENARIOS.has(row.scenario) && extension === ".json"),
        `recording ${row.scenario} artifact type differs`,
      );
      invariant(Number.isSafeInteger(artifact.bytes) && artifact.bytes > 0 && HASH64.test(artifact.sha256 ?? ""), `recording ${row.scenario} artifact hash/bytes differ`);
    }
    if (row.status === "PASS" && !REPORTABLE_RECORDING_SCENARIOS.has(row.scenario)) {
      invariant(row.artifacts.some(({ path: artifactPath }) => artifactPath.toLowerCase().endsWith(".mp4")), `PASS visual recording ${row.scenario} has no MP4`);
    }
  });
  invariant(recordingMap.status === aggregateStatus(recordingMap.scenarios.map(({ status }) => status)), "recording map aggregate status differs");
  return recordingMap;
}

async function copyRecordingArtifacts({ map, directory, entries, copied }) {
  const root = await realDirectory(directory, "recordings directory");
  const inventory = [];
  for (const row of map.scenarios) {
    const artifacts = [];
    for (let index = 0; index < row.artifacts.length; index += 1) {
      const metadata = row.artifacts[index];
      const sourcePath = path.resolve(root, ...metadata.path.split("/"));
      invariant(isWithin(root, sourcePath), `recording ${row.scenario} escapes its directory`);
      const status = await lstat(sourcePath);
      invariant(status.isFile() && !status.isSymbolicLink(), `recording ${row.scenario} is not a regular file`);
      invariant(path.resolve(await realpath(sourcePath)) === sourcePath, `recording ${row.scenario} traverses a symlink`);
      const bytes = await readFile(sourcePath);
      invariant(bytes.length === metadata.bytes && sha256(bytes) === metadata.sha256, `recording ${row.scenario} hash/bytes differ`);
      const suffix = row.artifacts.length > 1 ? `-${index + 1}` : "";
      const extension = path.posix.extname(metadata.path).toLowerCase();
      const outputPath = `03-recordings/${row.scenario}${suffix}${extension}`;
      invariant(!entries.has(outputPath), `recording destination collision: ${outputPath}`);
      entries.set(outputPath, bytes);
      copied.push({ sourceRole: "transcoded-recording", sourcePath: metadata.path, outputPath, bytes: bytes.length, sha256: sha256(bytes) });
      artifacts.push(outputPath);
    }
    inventory.push({ scenario: row.scenario, status: row.status, artifacts, limitation: row.limitation ?? null });
  }
  return {
    schema: PHASE7C_RECORDING_INVENTORY_SCHEMA,
    status: map.status,
    scenarios: inventory,
  };
}

function evidenceVisualName(prefix, relativePath, digest, used) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  const stem = relativePath.slice(0, -extension.length).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(-96) || "capture";
  let output = `${prefix}/${stem}-${digest.slice(0, 12)}${extension}`;
  let index = 2;
  while (used.has(output)) output = `${prefix}/${stem}-${digest.slice(0, 12)}-${index++}${extension}`;
  used.add(output);
  return output;
}

function copyPngPayloads(binding, prefix, entries, copied) {
  const used = new Set(entries.keys());
  for (const payload of binding.payloads.filter(({ relativePath }) => relativePath.toLowerCase().endsWith(".png"))) {
    const outputPath = evidenceVisualName(prefix, payload.relativePath, payload.sha256, used);
    entries.set(outputPath, payload.bytes);
    copied.push({ sourceRole: prefix, sourcePath: payload.relativePath, outputPath, bytes: payload.bytesCount, sha256: payload.sha256 });
  }
}

function git(repository, args, { buffer = false } = {}) {
  const result = spawnSync("git", args, { cwd: repository, encoding: buffer ? null : "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  invariant(result.status === 0, `git ${args[0]} failed: ${String(result.stderr ?? "").trim()}`);
  return buffer ? Buffer.from(result.stdout) : String(result.stdout).trim();
}

export async function collectRepositoryAuthority(repository, revision) {
  const root = await realDirectory(repository, "repository");
  invariant(git(root, ["rev-parse", "HEAD"]) === revision, "repository HEAD differs from final revision");
  invariant(git(root, ["branch", "--show-current"]) === PHASE7C_BRANCH, "repository branch differs from Phase 7C authority");
  invariant(git(root, ["status", "--porcelain"]) === "", "repository worktree is not clean");
  invariant(git(root, ["rev-parse", "refs/heads/main"]) === PHASE7C_FROZEN_MAIN, "local main differs from frozen authority");
  invariant(git(root, ["rev-parse", "refs/remotes/origin/main"]) === PHASE7C_FROZEN_MAIN, "origin main differs from frozen authority");
  invariant(git(root, ["rev-parse", "@{upstream}"]) === revision, "upstream branch differs from final revision");
  const parity = git(root, ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]).split(/\s+/).map(Number);
  invariant(parity.length === 2 && parity[0] === 0 && parity[1] === 0, "local/upstream parity differs from 0/0");
  const commits = git(root, ["rev-list", "--reverse", `${PHASE7C_PARENT}..${revision}`]).split(/\r?\n/).filter(Boolean);
  invariant(commits.length > 0, "Phase 7C commit list is empty");
  invariant(git(root, ["rev-parse", `${commits[0]}^`]) === PHASE7C_PARENT, "first Phase 7C commit is not a direct child of the accepted parent");
  const merges = git(root, ["rev-list", "--merges", `${PHASE7C_PARENT}..${revision}`]);
  invariant(!merges, "Phase 7C history contains a merge commit");
  const commitRecords = commits.map((commit) => {
    const [sha, parents, authoredAt, subject] = git(root, ["show", "-s", "--format=%H%x00%P%x00%aI%x00%s", commit]).split("\0");
    return { sha, parents: parents.split(" ").filter(Boolean), authoredAt, subject };
  });
  const changedProductionPaths = git(root, ["diff", "--name-only", PHASE7C_PARENT, revision, "--", "src", "public"]).split(/\r?\n/).filter(Boolean).map(normalizePath);
  invariant(JSON.stringify([...changedProductionPaths].sort()) === JSON.stringify([...PHASE7C_PRODUCTION_PATHS].sort()), "production changed-path authority differs");
  const productionDiff = git(root, ["diff", "--no-ext-diff", "--unified=3", PHASE7C_PARENT, revision, "--", "src", "public"]);
  invariant(productionDiff.length > 0, "production diff is empty");
  const designDocs = new Map(DESIGN_DOCUMENTS.map((relativePath) => [relativePath, git(root, ["show", `${revision}:${relativePath}`], { buffer: true })]));
  return {
    provenance: {
      schema: "quantum-hub.phase-7c.git-provenance.v1",
      status: "PASS",
      repository: "AmirNatan1/Qsite1",
      branch: PHASE7C_BRANCH,
      head: revision,
      acceptedParent: PHASE7C_PARENT,
      directParent: git(root, ["rev-parse", `${revision}^`]),
      firstPhase7CCommitParent: PHASE7C_PARENT,
      main: { local: PHASE7C_FROZEN_MAIN, origin: PHASE7C_FROZEN_MAIN, unchanged: true },
      upstream: { ref: git(root, ["rev-parse", "--abbrev-ref", "@{upstream}"]), head: revision, ahead: parity[0], behind: parity[1], parity: "0/0" },
      cleanWorktree: true,
      acceptedParentAncestor: true,
      zeroMergeCommits: true,
      productionChangedPaths: changedProductionPaths,
    },
    commits: {
      schema: "quantum-hub.phase-7c.commit-list.v1",
      status: "PASS",
      revision,
      exactParent: PHASE7C_PARENT,
      count: commitRecords.length,
      commits: commitRecords,
    },
    productionDiff,
    designDocs,
  };
}

async function loadBoundJson(filename, label, revision, { requirePass = true, revisionField = true } = {}) {
  const absolute = path.resolve(filename);
  const { bytes, document } = await readJson(absolute, label);
  validateStatus(document, label, { requirePass });
  if (revisionField) validateRevision(document.revision, revision, label);
  return { absolute, bytes, document, binding: { path: path.basename(absolute), bytes: bytes.length, sha256: sha256(bytes), schema: document.schema ?? null, status: document.status, revision } };
}

function receiptDestination(kind, label) {
  return `08-audit/receipts/${kind}-${label}.json`;
}

function validateReceipt(receipt, revision, label) {
  validateStatus(receipt, label, { requirePass: true });
  validateRevision(receipt.revision, revision, label);
  invariant(receipt.complete === true, `${label} does not assert complete scope`);
  return receipt;
}

function parseReceiptArgument(value, flag) {
  const separator = value.indexOf("=");
  invariant(separator > 0 && separator < value.length - 1, `${flag} must use label=path`);
  const label = value.slice(0, separator);
  invariant(RECEIPT_LABEL.test(label), `${flag} label must be lowercase kebab-case`);
  return { label, path: value.slice(separator + 1) };
}

function put(entries, relativePath, bytes) {
  invariant(!entries.has(relativePath), `duplicate prepared evidence path: ${relativePath}`);
  entries.set(relativePath, Buffer.from(bytes));
}

function bindingSummary(binding, revision) {
  return sourceBinding(binding.reportBinding.path, { ...binding.reportBinding, manifest: binding.manifestBinding }, revision);
}

export async function preparePhase7CEvidence(options, dependencies = {}) {
  const revision = options.revision;
  invariant(HASH40.test(revision ?? "") && revision !== PHASE7C_PARENT && revision !== PHASE7C_FROZEN_MAIN, "--revision must be the final lowercase Phase 7C Git SHA");
  const repositoryRoot = path.resolve(options.repository ?? ROOT);
  const evidenceRoot = assertExternalPhase7CPath(options.evidenceRoot, "--evidence-root", options.boundaryOptions ?? { repositoryRoot, temporaryRoot: os.tmpdir() });
  invariant(!await exists(evidenceRoot), "fresh evidence root already exists");
  const parent = path.dirname(evidenceRoot);
  await realDirectory(parent, "evidence-root parent");

  const [browser, accepted, native200, buildDeltaInput, deploymentInput, recordingMapInput] = await Promise.all([
    verifyEvidenceRoot({ root: options.browserRoot, reportName: options.browserReportName ?? BROWSER_REPORT_NAME, manifestName: options.browserManifestName ?? MANIFEST_NAME, label: "browser QA" }),
    verifyEvidenceRoot({ root: options.acceptedRoot, reportName: options.acceptedReportName ?? ACCEPTED_REPORT_NAME, manifestName: options.acceptedManifestName ?? MANIFEST_NAME, label: "accepted-authority" }),
    verifyEvidenceRoot({ root: options.native200Root, reportName: options.native200ReportName ?? NATIVE200_REPORT_NAME, manifestName: options.native200ManifestName ?? NATIVE200_MANIFEST_NAME, label: "installed-Chrome 200%" }),
    loadBoundJson(options.buildDelta, "build-delta report", revision, { revisionField: false }),
    loadBoundJson(options.deployment, "deployment report", revision, { revisionField: false }),
    loadBoundJson(options.recordingMap, "recording map", revision, { requirePass: false }),
  ]);
  validateBrowserReport(browser.report, revision);
  validateAcceptedReport(accepted.report, revision);
  validateNative200Report(native200.report, revision);
  validateBuildDelta(buildDeltaInput.document, revision);
  validateDeployment(deploymentInput.document, revision);
  validateRecordingMap(recordingMapInput.document, revision);

  invariant(Array.isArray(options.testReceipts) && options.testReceipts.length > 0, "at least one --test-receipt is required");
  invariant(Array.isArray(options.checkReceipts) && options.checkReceipts.length > 0, "at least one --check-receipt is required");
  const receiptInputs = [];
  for (const [kind, receiptArguments] of [["test", options.testReceipts], ["check", options.checkReceipts]]) {
    for (const receiptArgument of receiptArguments) {
      const { bytes, document } = await readJson(path.resolve(receiptArgument.path), `${kind} receipt ${receiptArgument.label}`);
      validateReceipt(document, revision, `${kind} receipt ${receiptArgument.label}`);
      receiptInputs.push({ kind, label: receiptArgument.label, bytes, document, binding: { path: path.basename(receiptArgument.path), bytes: bytes.length, sha256: sha256(bytes), schema: document.schema ?? null, status: document.status, revision } });
    }
  }

  let suppliedLimitations = null;
  if (options.limitations) {
    suppliedLimitations = await loadBoundJson(options.limitations, "caller limitations", revision, { requirePass: false });
  }

  const repositoryAuthority = dependencies.repositoryAuthority
    ?? await collectRepositoryAuthority(repositoryRoot, revision);
  validateStatus(repositoryAuthority.provenance, "repository provenance", { requirePass: true });
  validateRevision(repositoryAuthority.provenance.head, revision, "repository provenance");
  invariant(repositoryAuthority.provenance.branch === PHASE7C_BRANCH && repositoryAuthority.provenance.main?.local === PHASE7C_FROZEN_MAIN && repositoryAuthority.provenance.main?.origin === PHASE7C_FROZEN_MAIN, "repository authority differs");
  invariant(repositoryAuthority.provenance.upstream?.parity === "0/0" && repositoryAuthority.provenance.zeroMergeCommits === true && repositoryAuthority.provenance.cleanWorktree === true, "repository closure authority differs");
  invariant(repositoryAuthority.designDocs instanceof Map && DESIGN_DOCUMENTS.every((relativePath) => repositoryAuthority.designDocs.has(relativePath)), "committed design-document authority is incomplete");

  const redactionRoots = [
    os.homedir(), repositoryRoot, evidenceRoot, options.browserRoot, options.acceptedRoot, options.native200Root,
    options.recordingsDir, path.dirname(options.buildDelta), path.dirname(options.deployment), path.dirname(options.recordingMap),
    ...receiptInputs.map(({ binding }) => path.dirname(binding.path)),
  ].filter(Boolean);
  const entries = new Map();
  const copied = [];
  put(entries, "00-authority/task-brief.md", textBytes(taskBrief(revision), redactionRoots, "00-authority/task-brief.md"));
  put(entries, "01-provenance/git-provenance.json", jsonBytes(repositoryAuthority.provenance, redactionRoots, "01-provenance/git-provenance.json"));
  put(entries, "01-provenance/commits.json", jsonBytes(repositoryAuthority.commits, redactionRoots, "01-provenance/commits.json"));
  put(entries, "01-provenance/production.diff", textBytes(repositoryAuthority.productionDiff, redactionRoots, "01-provenance/production.diff"));
  for (const relativePath of DESIGN_DOCUMENTS) {
    const target = `02-design/${path.posix.basename(relativePath)}`;
    const bytes = repositoryAuthority.designDocs.get(relativePath);
    assertNoPrivateOrSecretPhase7CPayload(bytes, target);
    put(entries, target, bytes);
  }
  put(entries, "02-design/state-specification.json", jsonBytes(stateSpecification(revision), redactionRoots, "02-design/state-specification.json"));

  const browserBinding = bindingSummary(browser, revision);
  const acceptedBinding = bindingSummary(accepted, revision);
  const nativeBinding = bindingSummary(native200, revision);
  const buildBinding = sourceBinding(buildDeltaInput.binding.path, buildDeltaInput.binding, revision);
  const deploymentBinding = sourceBinding(deploymentInput.binding.path, deploymentInput.binding, revision);
  put(entries, "03-browser/browser-qa-bound-report.json", jsonBytes(browser.report, redactionRoots, "03-browser/browser-qa-bound-report.json"));
  put(entries, "03-browser/browser-matrix.json", jsonBytes(deriveBrowserMatrix(browser.report, revision, browserBinding), redactionRoots, "03-browser/browser-matrix.json"));
  put(entries, "03-browser/webkit-proxy.json", jsonBytes(deriveWebkit(browser.report, revision, browserBinding), redactionRoots, "03-browser/webkit-proxy.json"));
  copyPngPayloads(browser, "03-browser/visuals", entries, copied);

  put(entries, "04-responsive/installed-chrome-200-bound-report.json", jsonBytes(native200.report, redactionRoots, "04-responsive/installed-chrome-200-bound-report.json"));
  put(entries, "04-responsive/responsive-matrix.json", jsonBytes(deriveResponsive(browser.report, native200.report, revision, { browser: browserBinding, native200: nativeBinding }), redactionRoots, "04-responsive/responsive-matrix.json"));
  copyPngPayloads(native200, "04-responsive/visuals", entries, copied);

  put(entries, "05-assurance/accepted-authority-bound-report.json", jsonBytes(accepted.report, redactionRoots, "05-assurance/accepted-authority-bound-report.json"));
  put(entries, "05-assurance/build-delta-bound-report.json", jsonBytes(buildDeltaInput.document, redactionRoots, "05-assurance/build-delta-bound-report.json"));
  put(entries, "05-assurance/accessibility.json", jsonBytes(deriveAccessibility(browser.report, native200.report, revision, { browser: browserBinding, native200: nativeBinding }), redactionRoots, "05-assurance/accessibility.json"));
  put(entries, "05-assurance/target-sizes.json", jsonBytes(deriveTargets(browser.report, revision, browserBinding), redactionRoots, "05-assurance/target-sizes.json"));
  put(entries, "05-assurance/performance.json", jsonBytes(derivePerformance(browser.report, buildDeltaInput.document, revision, { browser: browserBinding, buildDelta: buildBinding }), redactionRoots, "05-assurance/performance.json"));
  put(entries, "05-assurance/lifecycle.json", jsonBytes(deriveLifecycle(browser.report, revision, browserBinding), redactionRoots, "05-assurance/lifecycle.json"));
  put(entries, "05-assurance/cls.json", jsonBytes(deriveCls(browser.report, revision, browserBinding), redactionRoots, "05-assurance/cls.json"));
  put(entries, "05-assurance/network.json", jsonBytes(deriveNetwork(browser.report, revision, browserBinding), redactionRoots, "05-assurance/network.json"));
  put(entries, "05-assurance/publication.json", jsonBytes(deriveGovernancePart("publication", deploymentInput.document.governance?.publication, deploymentInput.document, revision, deploymentBinding), redactionRoots, "05-assurance/publication.json"));
  put(entries, "05-assurance/phase4-hashes.json", jsonBytes(deriveGovernancePart("phase4-hashes", deploymentInput.document.governance?.phase4, deploymentInput.document, revision, deploymentBinding), redactionRoots, "05-assurance/phase4-hashes.json"));
  put(entries, "05-assurance/phase7a-regression.json", jsonBytes(deriveRegression("phase7a", accepted.report, deploymentInput.document, revision, { acceptedAuthority: acceptedBinding, deployment: deploymentBinding }), redactionRoots, "05-assurance/phase7a-regression.json"));
  put(entries, "05-assurance/phase7b-regression.json", jsonBytes(deriveRegression("phase7b", accepted.report, deploymentInput.document, revision, { acceptedAuthority: acceptedBinding, deployment: deploymentBinding }), redactionRoots, "05-assurance/phase7b-regression.json"));
  copyPngPayloads(accepted, "05-assurance/accepted-visuals", entries, copied);

  put(entries, "06-deployment/deployment.json", jsonBytes(deploymentInput.document, redactionRoots, "06-deployment/deployment.json"));
  for (const receipt of receiptInputs) {
    const destination = receiptDestination(receipt.kind, receipt.label);
    put(entries, destination, jsonBytes(receipt.document, redactionRoots, destination));
  }
  put(entries, "08-audit/validation-receipts.json", jsonBytes({
    schema: "quantum-hub.phase-7c.validation-receipts.v1",
    status: "PASS",
    revision,
    receipts: receiptInputs.map(({ kind, label, binding }) => ({ kind, label, ...binding })),
  }, redactionRoots, "08-audit/validation-receipts.json"));

  const recordingInventory = await copyRecordingArtifacts({ map: recordingMapInput.document, directory: options.recordingsDir, entries, copied });
  put(entries, "03-recordings/recording-inventory.json", jsonBytes(recordingInventory, redactionRoots, "03-recordings/recording-inventory.json"));
  put(entries, "03-recordings/transcoded-recording-map.json", jsonBytes(recordingMapInput.document, redactionRoots, "03-recordings/transcoded-recording-map.json"));

  const limitations = extractLimitations(browser.report, native200.report, accepted.report, recordingMapInput.document);
  if (suppliedLimitations) limitations.push(...(suppliedLimitations.document.limitations ?? []));
  const limitationStatus = limitations.length ? "LIMITATION" : "PASS";
  put(entries, "07-governance/environmental-limitations.json", jsonBytes({
    schema: "quantum-hub.phase-7c.environmental-limitations.v1",
    status: limitationStatus,
    revision,
    limitations,
    proxyNeverPromotedToPhysicalAuthority: true,
    unavailableObservationNeverPromotedToPass: true,
  }, redactionRoots, "07-governance/environmental-limitations.json"));

  const requiredPaths = REQUIRED_PHASE7C_INPUTS.map(({ relativePath }) => relativePath);
  const missingBeforeAudit = requiredPaths.filter((relativePath) => relativePath !== "08-audit/prepackage-audit.json" && !entries.has(relativePath));
  invariant(missingBeforeAudit.length === 0, `prepared topology is incomplete before audit: ${missingBeforeAudit.join(", ")}`);
  const plannedPayloads = [...entries].map(([relativePath, bytes]) => ({ relativePath, bytes: bytes.length, sha256: sha256(bytes) })).sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  put(entries, "08-audit/prepackage-audit.json", jsonBytes({
    schema: SCHEMA,
    status: "PASS",
    revision,
    authority: { branch: PHASE7C_BRANCH, parent: PHASE7C_PARENT, main: PHASE7C_FROZEN_MAIN, gates: PHASE7C_GATES.map((name) => ({ name, decision: "PENDING HUMAN REVIEW" })) },
    bindings: { browser: browserBinding, acceptedAuthority: acceptedBinding, native200: nativeBinding, buildDelta: buildBinding, deployment: deploymentBinding, recordingMap: recordingMapInput.binding },
    receipts: receiptInputs.map(({ kind, label, binding }) => ({ kind, label, ...binding })),
    inputManifestsVerified: true,
    everyBoundPayloadHashAndByteSizeVerified: true,
    noSourceStatusFailed: true,
    privatePathsSanitizedAndScanned: true,
    duplicatePaths: false,
    traversalPaths: false,
    copiedArtifactCount: copied.length,
    copiedArtifacts: copied,
    plannedPayloadCountExcludingThisAudit: plannedPayloads.length,
    plannedPayloadsExcludingThisAudit: plannedPayloads,
    requiredTopology: requiredPaths,
    requiredTopologyComplete: true,
    recordingScenariosComplete: recordingInventory.scenarios.length === PHASE7C_RECORDING_SCENARIOS.length,
    phase7D: "NOT AUTHORIZED",
    main: "NOT MERGED",
  }, redactionRoots, "08-audit/prepackage-audit.json"));

  const normalized = normalizePhase7CEvidenceEntries([...entries].map(([relativePath, data]) => ({ relativePath, data })));
  const staging = `${evidenceRoot}.staging`;
  invariant(!await exists(staging), "evidence staging path already exists");
  await mkdir(staging);
  let published = false;
  try {
    for (const { relativePath, data } of normalized) {
      const destination = path.join(staging, ...relativePath.split("/"));
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, data, { flag: "wx" });
    }
    await rename(staging, evidenceRoot);
    published = true;
  } finally {
    if (!published) await rm(staging, { recursive: true, force: true }).catch(() => undefined);
  }
  return {
    schema: SCHEMA,
    status: limitationStatus,
    revision,
    evidenceRoot,
    entryCount: normalized.length,
    totalBytes: normalized.reduce((sum, { data }) => sum + data.length, 0),
    requiredInputCount: REQUIRED_PHASE7C_INPUTS.length,
    copiedArtifactCount: copied.length,
    gates: PHASE7C_GATES.map((name) => ({ name, decision: "PENDING HUMAN REVIEW" })),
  };
}

export function parseArguments(argv) {
  const options = { repository: ROOT, testReceipts: [], checkReceipts: [], help: false, selfTest: false };
  const scalar = new Map([
    ["--repository", "repository"], ["--revision", "revision"], ["--evidence-root", "evidenceRoot"],
    ["--browser-root", "browserRoot"], ["--accepted-root", "acceptedRoot"], ["--native-200-root", "native200Root"],
    ["--build-delta", "buildDelta"], ["--deployment", "deployment"], ["--recordings-dir", "recordingsDir"],
    ["--recording-map", "recordingMap"], ["--limitations", "limitations"],
  ]);
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help") { options.help = true; continue; }
    if (flag === "--self-test") { options.selfTest = true; continue; }
    if (flag === "--test-receipt" || flag === "--check-receipt") {
      const value = argv[++index];
      invariant(value && !value.startsWith("--"), `${flag} requires label=path`);
      options[flag === "--test-receipt" ? "testReceipts" : "checkReceipts"].push(parseReceiptArgument(value, flag));
      continue;
    }
    const key = scalar.get(flag);
    invariant(key, `unknown argument: ${flag}`);
    invariant(!seen.has(key), `duplicate argument: ${flag}`);
    const value = argv[++index];
    invariant(value && !value.startsWith("--"), `${flag} requires a value`);
    options[key] = value;
    seen.add(key);
  }
  if (!options.help && !options.selfTest) {
    for (const key of ["revision", "evidenceRoot", "browserRoot", "acceptedRoot", "native200Root", "buildDelta", "deployment", "recordingsDir", "recordingMap"]) invariant(options[key], `missing required option: ${key}`);
    invariant(options.testReceipts.length > 0, "at least one --test-receipt is required");
    invariant(options.checkReceipts.length > 0, "at least one --check-receipt is required");
  }
  return options;
}

export function selfTest() {
  invariant(REQUIRED_PHASE7C_INPUTS.length === 25, "required evidence topology count differs");
  invariant(PHASE7C_RECORDING_SCENARIOS.length === 12, "recording scenario count differs");
  invariant(PHASE7C_GATES.length === 6, "human gate count differs");
  invariant(aggregateStatus(["PASS", "LIMITATION"]) === "LIMITATION", "status aggregation invents PASS");
  return { schema: SCHEMA, status: "PASS", requiredInputs: REQUIRED_PHASE7C_INPUTS.length, recordingScenarios: PHASE7C_RECORDING_SCENARIOS.length, gates: PHASE7C_GATES.length };
}

function usage() {
  return [
    "Usage:",
    "  node scripts/prepare-phase7c-evidence-inputs.mjs --revision SHA --evidence-root FRESH_EXTERNAL_DIR --browser-root DIR --accepted-root DIR --native-200-root DIR --build-delta FILE --deployment FILE --recordings-dir DIR --recording-map FILE --test-receipt label=FILE --check-receipt label=FILE [--limitations FILE] [--repository DIR]",
    "",
    `Recording map schema: ${RECORDING_MAP_SCHEMA}; all 12 scenarios in contract order; each artifact carries relative path, byte size and SHA-256.`,
    "Receipts must be JSON with status PASS, the exact final revision, and complete: true.",
  ].join("\n");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { process.stdout.write(`${usage()}\n`); return; }
  if (options.selfTest) { process.stdout.write(stableJson(selfTest())); return; }
  const report = await preparePhase7CEvidence(options);
  process.stdout.write(stableJson({ ...report, evidenceRoot: "<external-evidence-root>" }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`Phase 7C evidence preparation FAIL: ${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
