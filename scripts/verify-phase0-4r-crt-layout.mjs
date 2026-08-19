#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_PLAN_PATH = "prototypes/phase-0-4-crt-portal-qa/capture-plan.json";
const REPAIR_PLAN_PATH = "prototypes/phase-0-4r-crt-portal-qa/capture-plan.json";
const BASE_MATRIX_PATH = "artifacts/evidence/phase-0-4-crt-television/browser-matrix-report.json";
const CONTRACT_PATH = "artifacts/original/phase-0-4-crt-television/crt-portal-layout.json";
const KEEP_OUT_PATH = "artifacts/original/phase-0-4-crt-television/manifests/crt-scene-source-keepouts.json";
const EVIDENCE_ROOT = "artifacts/evidence/phase-0-4r-crt-television";
const CHECKPOINT_PATH = `${EVIDENCE_ROOT}/capture-checkpoint.json`;
const README_PATH = `${EVIDENCE_ROOT}/README.md`;
const RUNNER_PATH = "scripts/capture-phase04r-browser-matrix.mjs";
const NORMALIZER_PATH = "scripts/normalize-phase04r-captures.py";
const FINALIZER_PATH = "scripts/finalize-phase04r-browser-evidence.mjs";
const REPAIR_PLAN_SCHEMA = "quantum-hub.phase-0-4r-crt-television.typography-capture-plan.v1";

const BASE_AUTHORITIES = Object.freeze({
  plan: { bytes: 26_822, sha256: "5006dfee0af38bd0ffa71a875351b13c55766eae5ea3588968bccb16cc9fdd61" },
  matrix: { bytes: 1_149_989, sha256: "5411220869170f0290423d2f235aba2dc659aa1820e6eb2a3680bbe179d073d7" },
  contract: { bytes: 16_248, sha256: "255c5b1499857ab8a2409adf368543efa0d6f9bfe3171e8a0a0a680e2caf31cc" },
  harnessSha256: "984980d22922ea03c5a5ac157cf4c2b6372f175f6711e0f5d2bd45c7ffc38cd5",
  keepout: { bytes: 1_225_841, sha256: "c2d371d4eb3d3bfafe82ad67728c2df48ef7e38b09b2d1306d5accd2c955ac3d" },
});

const REQUIRED_SOURCE_IDS = Object.freeze([
  "source-desktop-dormant",
  "source-mobile-dormant",
  "source-reduced-desktop-dormant",
  "source-reduced-mobile-dormant",
  "source-physical-portal-close",
  "source-text-free-portal-takeover",
]);

const FROZEN_TOPOLOGY_FIELDS = Object.freeze([
  "contractPath",
  "contractAuthority",
  "contractPolicy",
  "browserApi",
  "viewports",
  "caseTemplates",
  "requiredAssertions",
  "expectedCaseCount",
  "expectedCaptureCount",
  "browserDerivedReviewSheets",
  "reviewSheetLineagePolicy",
]);

const failures = [];
const pass = (condition, message) => {
  if (!condition) failures.push(message);
};

function repoPath(relativePath) {
  const normalized = String(relativePath).replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("../")) {
    throw new Error(`Unsafe repository-relative path: ${relativePath}`);
  }
  const absolute = resolve(ROOT, ...normalized.split("/"));
  const prefix = `${ROOT.toLowerCase()}${sep}`;
  if (absolute.toLowerCase() !== ROOT.toLowerCase() && !absolute.toLowerCase().startsWith(prefix)) {
    throw new Error(`Path escapes repository root: ${relativePath}`);
  }
  return absolute;
}

async function exists(relativePath) {
  try {
    await access(repoPath(relativePath), fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function bytes(relativePath) {
  return readFile(repoPath(relativePath));
}

async function text(relativePath) {
  return (await bytes(relativePath)).toString("utf8");
}

async function json(relativePath) {
  return JSON.parse(await text(relativePath));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function bindFile(relativePath, expected, label) {
  const value = await bytes(relativePath);
  pass(value.length === expected.bytes, `${label} byte count changed: ${value.length}`);
  pass(sha256(value) === expected.sha256, `${label} SHA-256 changed`);
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function same(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function expandPlan(plan) {
  const viewports = new Map((plan.viewports ?? []).map((viewport) => [viewport.id, viewport]));
  const allIds = [...viewports.keys()];
  const result = [];
  for (const template of plan.caseTemplates ?? []) {
    const viewportIds = template.viewportIds === "all" ? allIds : template.viewportIds ?? [];
    const captureIds = new Set(template.captureViewportIds === "all" ? allIds : template.captureViewportIds ?? []);
    for (const viewportId of viewportIds) {
      const viewport = viewports.get(viewportId);
      if (!viewport) throw new Error(`Unknown viewport ${viewportId}`);
      result.push({
        id: `${template.idPrefix}--${viewportId}`,
        viewportId,
        viewport,
        query: template.query,
        focusSelector: template.focusSelector ?? null,
        captureRequired: captureIds.has(viewportId),
      });
    }
  }
  return result;
}

function acceptedDependencyMap(matrix) {
  const groups = new Map(REQUIRED_SOURCE_IDS.map((id) => [id, { reportCaseIds: [], captureCaseIds: [] }]));
  for (const record of matrix.cases ?? []) {
    const id = record.report?.assets?.sceneId;
    if (!groups.has(id)) throw new Error(`Accepted matrix uses an unexpected source role: ${id}`);
    groups.get(id).reportCaseIds.push(record.id);
    if (record.capture) groups.get(id).captureCaseIds.push(record.id);
  }
  return groups;
}

function keepoutRecords(authority) {
  if (Array.isArray(authority?.records)) return new Map(authority.records.map((record) => [record.id, record]));
  return new Map(Object.entries(authority?.records ?? {}).map(([id, record]) => [id, { id, ...record }]));
}

function keepoutSource(record) {
  return record?.source ?? record?.sourceAuthority ?? null;
}

async function validateReleasedAuthority(plan) {
  const freeze = plan.sceneFreeze ?? {};
  pass(["ready-for-capture", "complete", "PASS"].includes(plan.status), "released repair plan has an invalid status");
  pass(freeze.status === "frozen", "released repair sceneFreeze must be frozen");
  pass(["ready-for-capture", "complete"].includes(freeze.matrixStatus), "released repair matrixStatus is invalid");
  pass(freeze.captureAllowed === true, "released repair captureAllowed must be true");
  pass(freeze.sources?.length === 6, "released repair must bind exactly six sources");
  pass(same(freeze.sources?.map((source) => source.id), REQUIRED_SOURCE_IDS), "released repair source order differs from authority");
  for (const source of freeze.sources ?? []) {
    pass(source.status === "frozen" || source.status === "accepted", `released source lacks approval state: ${source.id}`);
    pass(Number(source.bytes) > 0, `released source lacks bytes: ${source.id}`);
    pass(/^[a-f0-9]{64}$/i.test(source.sha256 ?? ""), `released source lacks SHA-256: ${source.id}`);
    if (!(await exists(source.path))) {
      failures.push(`released source file is missing: ${source.path}`);
      continue;
    }
    const value = await bytes(source.path);
    pass(value.length === Number(source.bytes), `released source byte mismatch: ${source.id}`);
    pass(sha256(value) === source.sha256, `released source SHA-256 mismatch: ${source.id}`);
  }
  const keepoutSpec = freeze.keepoutAuthority ?? {};
  pass(keepoutSpec.status === "frozen" || keepoutSpec.status === "accepted", "released keepout lacks approval state");
  pass(Number(keepoutSpec.bytes) > 0, "released keepout lacks bytes");
  pass(/^[a-f0-9]{64}$/i.test(keepoutSpec.sha256 ?? ""), "released keepout lacks SHA-256");
  if (await exists(keepoutSpec.path)) {
    const value = await bytes(keepoutSpec.path);
    pass(value.length === Number(keepoutSpec.bytes), "released keepout byte mismatch");
    pass(sha256(value) === keepoutSpec.sha256, "released keepout SHA-256 mismatch");
    const authority = JSON.parse(value.toString("utf8"));
    pass(authority.schema === keepoutSpec.schema, "released keepout schema mismatch");
    pass(authority.status === "frozen" && authority.sourceStatus === "accepted", "released keepout is not frozen/accepted");
    const records = keepoutRecords(authority);
    pass(records.size === 6, `released keepout must contain six records, observed ${records.size}`);
    for (const source of freeze.sources ?? []) {
      const record = records.get(source.id);
      const governed = keepoutSource(record);
      pass(Boolean(record), `released keepout record missing: ${source.id}`);
      pass((record?.sourceRole ?? governed?.role) === source.id, `released keepout role mismatch: ${source.id}`);
      pass(governed?.path === source.path || governed?.packageRelativePath === source.path, `released keepout path mismatch: ${source.id}`);
      pass(Number(governed?.bytes) === Number(source.bytes), `released keepout bytes mismatch: ${source.id}`);
      pass(governed?.sha256 === source.sha256, `released keepout SHA-256 mismatch: ${source.id}`);
      pass(Number(governed?.width) === Number(source.width) && Number(governed?.height) === Number(source.height), `released keepout dimensions mismatch: ${source.id}`);
    }
  } else {
    failures.push(`released keepout file is missing: ${keepoutSpec.path}`);
  }
}

async function main() {
  const basePlanBytes = await bindFile(BASE_PLAN_PATH, BASE_AUTHORITIES.plan, "accepted Phase 0.4 plan");
  const baseMatrixBytes = await bindFile(BASE_MATRIX_PATH, BASE_AUTHORITIES.matrix, "accepted Phase 0.4 matrix");
  await bindFile(CONTRACT_PATH, BASE_AUTHORITIES.contract, "immutable CRT portal contract");
  const basePlan = JSON.parse(basePlanBytes.toString("utf8"));
  const baseMatrix = JSON.parse(baseMatrixBytes.toString("utf8"));
  const repairPlan = await json(REPAIR_PLAN_PATH);
  const checkpoint = await json(CHECKPOINT_PATH);
  const runnerSource = await text(RUNNER_PATH);
  const normalizerSource = await text(NORMALIZER_PATH);
  const finalizerSource = await text(FINALIZER_PATH);
  const readmeSource = await text(README_PATH);

  pass(repairPlan.schema === REPAIR_PLAN_SCHEMA, "repair plan must use the additive Phase 0.4R browser-plan schema");
  pass(repairPlan.repairPhase === "Phase 0.4R" && repairPlan.repairMode === "additive-source-rebind", "repair plan identity is missing");
  pass(repairPlan.acceptedBaseline?.repositoryHead === "fec1f0e9243a9cda188c539ab1b79e4a99c30623", "repair baseline HEAD differs");
  pass(same(repairPlan.acceptedBaseline?.plan, { path: BASE_PLAN_PATH, ...BASE_AUTHORITIES.plan }), "accepted plan baseline record differs");
  pass(same(repairPlan.acceptedBaseline?.matrix, { path: BASE_MATRIX_PATH, ...BASE_AUTHORITIES.matrix, caseCount: 46, normalizedCaptureCount: 36 }), "accepted matrix baseline record differs");
  pass(repairPlan.acceptedBaseline?.harness?.sha256 === BASE_AUTHORITIES.harnessSha256, "accepted harness aggregate differs");
  pass(same(repairPlan.acceptedBaseline?.keepoutAuthority, { path: KEEP_OUT_PATH, ...BASE_AUTHORITIES.keepout, schema: basePlan.sceneFreeze.keepoutAuthority.schema }), "accepted keepout baseline differs");
  for (const field of FROZEN_TOPOLOGY_FIELDS) {
    pass(same(repairPlan[field], basePlan[field]), `accepted topology field changed in repair plan: ${field}`);
  }
  const expandedBase = expandPlan(basePlan);
  const expandedRepair = expandPlan(repairPlan);
  pass(same(expandedRepair, expandedBase), "expanded Phase 0.4R browser topology differs from accepted Phase 0.4");
  pass(expandedRepair.length === 46, `repair plan expands to ${expandedRepair.length} cases instead of 46`);
  pass(expandedRepair.filter((entry) => entry.captureRequired).length === 36, "repair plan must select exactly 36 normalized captures");
  pass(new Set(expandedRepair.map((entry) => entry.id)).size === 46, "repair plan has duplicate case IDs");
  for (const requiredId of [
    "hero-zoom-200--narrow-320x800",
    "portal-zoom-200--narrow-320x800",
    "hero-reduced-motion--narrow-320x800",
    "portal-reduced-motion--narrow-320x800",
    "hero-keyboard-focus--desktop-1440x900",
    "portal-keyboard-focus--mobile-390x844",
  ]) {
    pass(expandedRepair.some((entry) => entry.id === requiredId), `required repair proof case is absent: ${requiredId}`);
  }
  pass((repairPlan.requiredAssertions ?? []).some((value) => /whole-word|fragment/i.test(value)), "whole-word assertion is absent");
  pass((repairPlan.requiredAssertions ?? []).some((value) => /44/.test(value)), "44px control assertion is absent");

  const dependency = repairPlan.sourceRoleDependencyMap;
  pass(dependency?.schema === "quantum-hub.phase-0-4r-crt-television.source-role-dependency-map.v1", "repair dependency schema differs");
  pass(dependency?.reportCaseCount === 46 && dependency?.normalizedCaptureCount === 36, "repair dependency totals differ");
  const acceptedGroups = acceptedDependencyMap(baseMatrix);
  const mappedReportIds = [];
  const mappedCaptureIds = [];
  for (const id of REQUIRED_SOURCE_IDS) {
    const role = dependency?.roles?.find((entry) => entry.id === id);
    const expected = acceptedGroups.get(id);
    pass(Boolean(role), `repair dependency role is missing: ${id}`);
    pass(same(role?.reportCaseIds, expected.reportCaseIds), `repair report dependencies differ: ${id}`);
    pass(same(role?.captureCaseIds, expected.captureCaseIds), `repair capture dependencies differ: ${id}`);
    pass(role?.reportCaseCount === expected.reportCaseIds.length, `repair report count differs: ${id}`);
    pass(role?.captureCaseCount === expected.captureCaseIds.length, `repair capture count differs: ${id}`);
    mappedReportIds.push(...(role?.reportCaseIds ?? []));
    mappedCaptureIds.push(...(role?.captureCaseIds ?? []));
  }
  pass(same(mappedReportIds.sort(), expandedRepair.map((entry) => entry.id).sort()), "six-role dependency map does not cover all 46 cases exactly once");
  pass(same(mappedCaptureIds.sort(), expandedRepair.filter((entry) => entry.captureRequired).map((entry) => entry.id).sort()), "six-role dependency map does not cover all 36 captures exactly once");
  const physicalClose = dependency?.roles?.find((entry) => entry.id === "source-physical-portal-close");
  pass(physicalClose?.reportCaseCount === 0 && physicalClose?.captureCaseCount === 0, "physical portal-close must remain non-live lineage");
  pass(physicalClose?.additionalLineage?.[0]?.reviewIndex === 11, "physical portal-close sheet-11 lineage is missing");

  const hold = repairPlan.sceneFreeze?.captureAllowed === false;
  if (hold) {
    pass(repairPlan.status === "capture hold; replacement creative authority pending", "held repair plan status differs");
    pass(repairPlan.sceneFreeze?.status === "pending-replacement-authority", "held scene status differs");
    pass(repairPlan.sceneFreeze?.matrixStatus === "blocked-pending-replacement-authority", "held matrix status differs");
    pass(repairPlan.sceneFreeze?.sources?.length === 6, "held plan must retain six source descriptors");
    for (const source of repairPlan.sceneFreeze?.sources ?? []) {
      pass(source.status === "pending-replacement-authority", `held source approval state differs: ${source.id}`);
      pass(source.bytes === null && source.sha256 === null, `held source authority must remain null: ${source.id}`);
    }
    pass(repairPlan.sceneFreeze?.keepoutAuthority?.bytes === null && repairPlan.sceneFreeze?.keepoutAuthority?.sha256 === null, "held keepout authority must remain null");
    pass(checkpoint.status === "blocked-pending-replacement-authority", "held checkpoint status differs");
    pass(checkpoint.authorityFingerprint === null && checkpoint.completedAuthorityCases === 0, "held checkpoint must not contain captured authority");
    pass(Object.keys(checkpoint.cases ?? {}).length === 0 && checkpoint.matrix === null, "held checkpoint must contain no cases or matrix");
    pass(checkpoint.portalSemanticStates === null, "held checkpoint must not contain supplemental portal-state authority");
    for (const forbidden of [
      `${EVIDENCE_ROOT}/browser-matrix-report.json`,
      `${EVIDENCE_ROOT}/reports`,
      `${EVIDENCE_ROOT}/captures/raw`,
      `${EVIDENCE_ROOT}/captures/normalized`,
      `${EVIDENCE_ROOT}/portal-states`,
      `${EVIDENCE_ROOT}/capture-plan-authority.json`,
      `${EVIDENCE_ROOT}/browser-evidence-manifest.json`,
      `${EVIDENCE_ROOT}/browser-review-composition-inputs.json`,
      "artifacts/original/phase-0-4-crt-television/manifests/crt-phase-0-4r-portal-transition-state-authority.json",
    ]) {
      pass(!(await exists(forbidden)), `capture HOLD contains forbidden output: ${forbidden}`);
    }
  } else {
    await validateReleasedAuthority(repairPlan);
  }

  pass(repairPlan.capture?.rawDirectory === `${EVIDENCE_ROOT}/captures/raw`, "repair raw evidence directory differs");
  pass(repairPlan.capture?.normalizedDirectory === `${EVIDENCE_ROOT}/captures/normalized`, "repair normalized evidence directory differs");
  pass(repairPlan.capture?.reportDirectory === `${EVIDENCE_ROOT}/reports`, "repair report directory differs");
  const comparableCapture = (capture) => {
    const copy = JSON.parse(JSON.stringify(capture));
    delete copy.rawDirectory;
    delete copy.normalizedDirectory;
    delete copy.reportDirectory;
    return copy;
  };
  pass(same(comparableCapture(repairPlan.capture), comparableCapture(basePlan.capture)), "capture mechanics changed beyond additive output directories");
  pass(repairPlan.capture?.stabilization?.successiveFullPageJpegsPerVisualCase === 11, "repair capture must use 11 successive JPEGs");
  pass(repairPlan.capture?.stabilization?.minimumWinnerVotes === 7, "repair capture must require at least 7 modal votes");

  const baseIndex = await text("prototypes/phase-0-4-crt-portal-qa/index.html");
  const repairIndex = await text("prototypes/phase-0-4r-crt-portal-qa/index.html");
  const expectedIndex = baseIndex
    .replace('href="./styles.css?v=phase04-scaffold-v19"', 'href="/prototypes/phase-0-4-crt-portal-qa/styles.css?v=phase04-scaffold-v19"')
    .replace(
      '<script src="./app.js?v=phase04-scaffold-v19"',
      '<link rel="stylesheet" href="./repair.css?v=phase04r-scene-clearance-v8" />\n'
        + '    <script src="./app.js?v=phase04r-source-rebind-scene-clearance-v8"',
    );
  pass(repairIndex === expectedIndex, "additive Phase 0.4R index changes more than resource routing/cache authority");
  const repairCss = await text("prototypes/phase-0-4r-crt-portal-qa/repair.css");
  pass(
    repairCss === '/* Phase 0.4R bounded decorative-rule clearance repair. */\nbody[data-surface="portal"][data-text-zoom="200"] .portal-audience {\n  row-gap: 24px;\n}\n\nbody[data-surface="hero"][data-layout="wide"][data-fixture="actual"][data-text-zoom="100"] .scene-image {\n  transform: translate(27.5vw, clamp(88px, 10vh, 104px)) scale(0.8);\n}\n\nbody[data-surface="hero"][data-layout="portrait"][data-fixture="actual"][data-text-zoom="100"] .scene-image {\n  transform: translateY(calc(20vh + 88px)) scale(0.92);\n}\n\nbody[data-surface="portal"][data-reduced="true"][data-layout="wide"] .scene-image {\n  transform: translate(22vw, 325px);\n}\n\n@media (min-width: 900px) and (max-width: 1100px) {\n  body[data-surface="hero"][data-layout="wide"][data-fixture="actual"][data-text-zoom="100"] .scene-image {\n    transform: translate(36.5vw, 88px) scale(0.8);\n  }\n\n  body[data-surface="portal"][data-reduced="true"][data-layout="wide"] .scene-image {\n    transform: translate(36.5vw, 325px) scale(0.8);\n  }\n}\n',
    "additive Phase 0.4R repair CSS exceeds the bounded rule/scene-clearance fixes",
  );
  const baseApp = await text("prototypes/phase-0-4-crt-portal-qa/app.js");
  const repairApp = await text("prototypes/phase-0-4r-crt-portal-qa/app.js");
  const expectedApp = baseApp.replace('"prototypes/phase-0-4-crt-portal-qa/capture-plan.json"', '"prototypes/phase-0-4r-crt-portal-qa/capture-plan.json"');
  const expectedRepairApp = expectedApp.replace(
    'check(plan.schema === "quantum-hub.phase-0-4-crt-television.typography-capture-plan.v1", "Phase 0.4 capture-plan schema mismatch");',
    'check(plan.schema === "quantum-hub.phase-0-4r-crt-television.typography-capture-plan.v1", "Phase 0.4R capture-plan schema mismatch");',
  );
  pass(repairApp === expectedRepairApp, "additive Phase 0.4R app changes more than plan path/schema authority");
  const baseRunner = await text("prototypes/phase-0-4-crt-portal-qa/runner.html");
  const repairRunner = await text("prototypes/phase-0-4r-crt-portal-qa/runner.html");
  const expectedRunner = baseRunner
    .replace('href="./runner.css?v=phase04-scaffold-v19"', 'href="/prototypes/phase-0-4-crt-portal-qa/runner.css?v=phase04-scaffold-v19"')
    .replace('src="./runner.js?v=phase04-scaffold-v19"', 'src="/prototypes/phase-0-4-crt-portal-qa/runner.js?v=phase04-scaffold-v19"');
  pass(repairRunner === expectedRunner, "additive Phase 0.4R runner changes accepted exact-viewport logic");

  for (const token of [
    "const MAX_BATCH_SIZE = 10",
    "const SCREENSHOTS_PER_VISUAL_CASE = 11",
    "const MINIMUM_MODAL_VOTES = 7",
    "MAX_MODAL_ROUNDS = 3",
    "CAPTURE BLOCKED: Phase 0.4R",
    "plan.status !== \"ready-for-capture\"",
    "report.authority?.plan?.path !== PLAN_RELATIVE",
    "source.status",
    "keepoutAuthority?.status",
    "artifacts/evidence/phase-0-4r-crt-television",
    "--portal-state-8",
    "PORTAL_BROWSER_AUTHORITY_SCHEMA",
    "sceneCrop.style.setProperty(\"display\", \"none\", \"important\")",
    "capture.sha256 === matrixData.state7.capture.sha256",
  ]) {
    pass(runnerSource.includes(token), `repair runner lacks fail-closed token: ${token}`);
  }
  pass(normalizerSource.includes('PLAN_PATH = ROOT / "prototypes/phase-0-4r-crt-portal-qa/capture-plan.json"'), "repair normalizer plan path differs");
  pass(normalizerSource.includes('EVIDENCE_PATH = ROOT / "artifacts/evidence/phase-0-4r-crt-television"'), "repair normalizer evidence path differs");
  pass(normalizerSource.includes('plan.get("repairPhase") != "Phase 0.4R"'), "repair normalizer lacks repair identity gate");
  for (const token of [
    "crt-phase-0-4r-portal-physical-state-authority.json",
    "crt-phase-0-4r-portal-transition-state-authority.json",
    "portal-browser-state-authority.json",
    "browser-review-composition-inputs.json",
    "blankBridgeCount",
    "aspectSnapCount",
    "doubledCopyCount",
    "Portal states 7 and 8 are not genuinely distinct browser captures",
    "No review pixels were generated",
  ]) pass(finalizerSource.includes(token), `repair finalizer lacks deterministic authority token: ${token}`);
  const portalCaptureSpec = repairPlan.browserFinalization?.portalSemanticCaptureAuthority;
  pass(portalCaptureSpec?.expectedSchema === "quantum-hub.phase-0-4r-crt-television.portal-browser-state-authority.v1", "repair plan lacks two-state browser portal schema");
  pass(portalCaptureSpec?.state7?.caseId === "portal-actual--desktop-1440x900", "portal state 7 case binding differs");
  pass(portalCaptureSpec?.state8?.captureCommand === "node scripts/capture-phase04r-browser-matrix.mjs --portal-state-8", "portal state 8 capture command differs");
  pass(repairPlan.browserFinalization?.browserReviewCompositionInputs?.path === `${EVIDENCE_ROOT}/browser-review-composition-inputs.json`, "repair compositor-input path differs");
  pass(repairPlan.browserFinalization?.creativeReviewCompositionManifest?.path === "artifacts/original/phase-0-4-crt-television/manifests/crt-phase-0-4r-review-composition-manifest.json", "repair creative-composition path is not additive");
  pass(
    (hold ? /CAPTURE HOLD/.test(readmeSource) : /Status:\s+\*\*PASS/.test(readmeSource))
      && /46 browser reports/.test(readmeSource)
      && /36 full-size normalized captures/.test(readmeSource),
    "repair README does not disclose the current authority state and 46/36 topology",
  );

  const newFiles = [REPAIR_PLAN_PATH, CHECKPOINT_PATH, README_PATH, RUNNER_PATH, NORMALIZER_PATH, FINALIZER_PATH,
    "prototypes/phase-0-4r-crt-portal-qa/index.html", "prototypes/phase-0-4r-crt-portal-qa/app.js", "prototypes/phase-0-4r-crt-portal-qa/runner.html"];
  const privatePattern = /(?:^|["'\s])[A-Za-z]:[\\/]|(?:^|["'\s])\/(?:Users|home)\//m;
  for (const file of newFiles) pass(!privatePattern.test(await text(file)), `private absolute path leaked: ${file}`);

  const baseHarnessFiles = baseMatrix.harness?.files ?? [];
  const currentHarnessRecords = [];
  for (const record of baseHarnessFiles) {
    const value = await bytes(record.path);
    pass(value.length === record.bytes && sha256(value) === record.sha256, `accepted harness file changed: ${record.path}`);
    currentHarnessRecords.push({ path: record.path, bytes: value.length, sha256: sha256(value) });
  }
  const acceptedHarnessAggregate = currentHarnessRecords
    .map((file) => `${file.path}\0${file.bytes}\0${file.sha256}`)
    .join("\n");
  pass(sha256(Buffer.from(acceptedHarnessAggregate)) === BASE_AUTHORITIES.harnessSha256, "accepted harness aggregate SHA-256 changed");

  if (failures.length > 0) {
    console.error(`Phase 0.4R layout readiness FAIL (${failures.length})`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Phase 0.4R layout readiness PASS — ${hold ? "CAPTURE HOLD" : "released authority"}; 46 cases / 36 captures; six-role dependency map exact; accepted Phase 0.4 topology unchanged.`);
}

main().catch((error) => {
  console.error(`Phase 0.4R layout readiness crashed: ${error.message}`);
  process.exitCode = 1;
});
