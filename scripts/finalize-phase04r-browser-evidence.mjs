#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_RELATIVE = "artifacts/original/phase-0-4-crt-television";
const EVIDENCE_RELATIVE = "artifacts/evidence/phase-0-4r-crt-television";
const PLAN_RELATIVE = "prototypes/phase-0-4r-crt-portal-qa/capture-plan.json";
const MATRIX_RELATIVE = `${EVIDENCE_RELATIVE}/browser-matrix-report.json`;
const CHECKPOINT_RELATIVE = `${EVIDENCE_RELATIVE}/capture-checkpoint.json`;
const SNAPSHOT_RELATIVE = `${EVIDENCE_RELATIVE}/capture-plan-authority.json`;
const BROWSER_EVIDENCE_RELATIVE = `${EVIDENCE_RELATIVE}/browser-evidence-manifest.json`;
const COMPOSITION_INPUTS_RELATIVE = `${EVIDENCE_RELATIVE}/browser-review-composition-inputs.json`;
const PORTAL_STATE_8_REPORT_RELATIVE = `${EVIDENCE_RELATIVE}/portal-states/portal-08-full-semantic-surface.json`;
const PORTAL_BROWSER_AUTHORITY_RELATIVE = `${EVIDENCE_RELATIVE}/portal-states/portal-browser-state-authority.json`;
const PHYSICAL_PORTAL_RELATIVE = `${PACKAGE_RELATIVE}/manifests/crt-phase-0-4r-portal-physical-state-authority.json`;
const CANONICAL_RELATIVE = `${PACKAGE_RELATIVE}/manifests/crt-phase-0-4r-canonical-render-inventory.json`;
const POWER_STATE_RELATIVE = `${PACKAGE_RELATIVE}/manifests/crt-phase-0-4r-power-on-state-authority.json`;
const BLENDER_VALIDATION_RELATIVE = `${PACKAGE_RELATIVE}/manifests/blender-source-validation.json`;
const FINAL_PORTAL_RELATIVE = `${PACKAGE_RELATIVE}/manifests/crt-phase-0-4r-portal-transition-state-authority.json`;
const COMPOSITION_RELATIVE = `${PACKAGE_RELATIVE}/manifests/phase-0-4r-browser-review-composition-manifest.json`;
const FINALIZER_RELATIVE = "scripts/finalize-phase04r-browser-evidence.mjs";
const REFINED_SOURCE_PACKAGE_RELATIVE = "source/quantum-signal-television-v1.blend";
const CANONICAL_RENDERER_PACKAGE_RELATIVE = "source/render_crt_canonical_stills.py";
const KEEP_OUT_SCHEMA = "quantum-hub.phase-0-4-crt-television.scene-source-keepouts.v1";
const SOURCE_IDS = Object.freeze([
  "source-desktop-dormant",
  "source-mobile-dormant",
  "source-reduced-desktop-dormant",
  "source-reduced-mobile-dormant",
  "source-physical-portal-close",
  "source-text-free-portal-takeover",
]);
const PHYSICAL_SCREEN_COPY = Object.freeze({
  brand: "QUANTUM HUB",
  route: ["FRAME", "SOURCE", "ASSESS", "TEST", "DECIDE"],
  status: "TEST ROUTE AVAILABLE",
});
const PHYSICAL_SCREEN_STATE_IDS = Object.freeze({
  brand: ["power-06-quantum-interface-stabilizes"],
  route: ["power-07-portal-ready", "portal-01-television-in-scene"],
  ready: ["portal-02-screen-active", "portal-03-close-approach", "portal-04-glass-almost-fills", "portal-05-bezel-exits"],
  "text-free": ["portal-06-distortion-reduces"],
});
const PHYSICAL_SCREEN_STAGE_EXPECTATIONS = Object.freeze({
  brand: { stage: "brand", visibility: "visible-readable-copy", expectedCopyLines: [PHYSICAL_SCREEN_COPY.brand] },
  route: { stage: "route", visibility: "visible-readable-copy", expectedCopyLines: [PHYSICAL_SCREEN_COPY.route.join(" ")] },
  ready: { stage: "ready", visibility: "visible-readable-copy", expectedCopyLines: [PHYSICAL_SCREEN_COPY.status] },
  "text-free": { stage: "text-free", visibility: "active-no-copy-surface", expectedCopyLines: [] },
});

const PLAN_SCHEMA = "quantum-hub.phase-0-4r-crt-television.typography-capture-plan.v1";
const MATRIX_SCHEMA = "quantum-hub.phase-0-4r-crt-television.typography-collision-matrix.v1";
const CHECKPOINT_SCHEMA = "quantum-hub.phase-0-4r-crt-television.capture-checkpoint.v1";
const PORTAL_CAPTURE_SCHEMA = "quantum-hub.phase-0-4r-crt-television.portal-state-browser-capture.v1";
const PORTAL_BROWSER_AUTHORITY_SCHEMA = "quantum-hub.phase-0-4r-crt-television.portal-browser-state-authority.v1";
const PHYSICAL_PORTAL_SCHEMA = "quantum-hub.phase-0-4r-crt-television.portal-physical-state-authority.v1";
const CANONICAL_SCHEMA = "quantum-hub.phase-0-4r-crt-television.canonical-render-inventory.v1";
const POWER_STATE_SCHEMA = "quantum-hub.phase-0-4r-crt-television.power-on-state-authority.v1";
const BLENDER_VALIDATION_SCHEMA = "quantum-hub.phase-0-4-crt-television.blender-source-validation.v1";
const FINAL_PORTAL_SCHEMA = "quantum-hub.phase-0-4r-crt-television.portal-transition-state-authority.v1";
const EVIDENCE_SCHEMA = "quantum-hub.phase-0-4r-crt-television.browser-evidence.v1";
const INPUTS_SCHEMA = "quantum-hub.phase-0-4r-crt-television.browser-review-composition-inputs.v1";
const COMPOSITION_SCHEMA = "quantum-hub.phase-0-4r-crt-television.browser-review-composition.v1";
const PORTAL_CASE_ID = "portal-actual--desktop-1440x900";
const TEXT_FREE_SOURCE_ID = "source-text-free-portal-takeover";
const POWER_IDS = Object.freeze([
  "power-01-completely-dormant",
  "power-02-current-reaches-connection",
  "power-03-power-indicator-response",
  "power-04-crt-electrical-wake",
  "power-05-raster-phosphor-appears",
  "power-06-quantum-interface-stabilizes",
  "power-07-portal-ready",
]);
const PORTAL_IDS = Object.freeze([
  "portal-01-television-in-scene",
  "portal-02-screen-active",
  "portal-03-close-approach",
  "portal-04-glass-almost-fills",
  "portal-05-bezel-exits",
  "portal-06-distortion-reduces",
  "portal-07-dom-takes-ownership",
  "portal-08-full-semantic-surface",
]);
const REVIEW_OUTPUTS = Object.freeze([
  [10, "crt-portal-transition-sheet.png"],
  [11, "crt-physical-dom-alignment-sheet.png"],
  [12, "crt-desktop-hero-composition.png"],
  [13, "crt-mobile-hero-composition.png"],
  [14, "crt-text-zoom-and-fallback.png"],
  [15, "crt-reduced-motion-desktop.png"],
  [16, "crt-reduced-motion-mobile.png"],
]);

function repoPath(relativePath) {
  const normalized = String(relativePath).replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("../")) throw new Error(`Unsafe path: ${relativePath}`);
  const absolute = resolve(ROOT, ...normalized.split("/"));
  const prefix = `${ROOT.toLowerCase()}${sep}`;
  if (absolute.toLowerCase() !== ROOT.toLowerCase() && !absolute.toLowerCase().startsWith(prefix)) throw new Error(`Path escapes repository: ${relativePath}`);
  return absolute;
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function canonicalDigest(value) {
  return sha256Bytes(Buffer.from(JSON.stringify(canonical(value))));
}

async function readJson(relativePath) {
  return JSON.parse((await readFile(repoPath(relativePath))).toString("utf8"));
}

async function fileRecord(relativePath, schema = undefined) {
  const value = await readFile(repoPath(relativePath));
  return { path: relativePath, ...(schema ? { schema } : {}), bytes: value.length, sha256: sha256Bytes(value) };
}

function authorityRepositoryPath(record) {
  if (record?.repository_relative_path) return String(record.repository_relative_path).replaceAll("\\", "/");
  if (record?.package_relative_path) return `${PACKAGE_RELATIVE}/${String(record.package_relative_path).replaceAll("\\", "/")}`;
  return String(record?.path ?? "").replaceAll("\\", "/");
}

async function validateFileAuthority(record, label, { expectedPackagePath = null, expectedRepositoryPath = null } = {}) {
  const repositoryPath = authorityRepositoryPath(record);
  if (!repositoryPath || !/^[a-f0-9]{64}$/i.test(record?.sha256 ?? "") || !(Number(record?.bytes) > 0)) {
    throw new Error(`${label} lacks a verifiable package/repository file record`);
  }
  if (expectedPackagePath !== null && String(record.package_relative_path ?? "").replaceAll("\\", "/") !== expectedPackagePath) {
    throw new Error(`${label} package path changed: ${record.package_relative_path ?? "missing"}`);
  }
  if (expectedRepositoryPath !== null && repositoryPath !== expectedRepositoryPath) {
    throw new Error(`${label} repository path changed: ${repositoryPath}`);
  }
  const value = await readFile(repoPath(repositoryPath));
  if (value.length !== Number(record.bytes) || sha256Bytes(value) !== String(record.sha256).toLowerCase()) {
    throw new Error(`${label} byte/hash mismatch`);
  }
  return structuredClone(record);
}

async function validateBoundPlanAuthority(spec, label, { expectedPath, expectedSchema, expectedStatus = "PASS" }) {
  if (
    spec?.path !== expectedPath ||
    spec?.expectedSchema !== expectedSchema ||
    spec?.status !== expectedStatus ||
    !(Number(spec?.bytes) > 0) ||
    !/^[a-f0-9]{64}$/i.test(spec?.sha256 ?? "")
  ) {
    throw new Error(`Repair plan does not bind the exact frozen ${label}`);
  }
  const value = await readFile(repoPath(expectedPath));
  if (value.length !== Number(spec.bytes) || sha256Bytes(value) !== String(spec.sha256).toLowerCase()) {
    throw new Error(`Repair plan ${label} byte/hash authority differs from disk`);
  }
  const json = JSON.parse(value.toString("utf8"));
  if (json.schema !== expectedSchema || json.status !== expectedStatus) {
    throw new Error(`${label} is not ${expectedStatus} with the expected schema`);
  }
  return {
    json,
    record: { path: expectedPath, schema: expectedSchema, bytes: value.length, sha256: sha256Bytes(value), status: expectedStatus },
  };
}

function portableJson(value) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  const posixRoots = ["Us" + "ers", "ho" + "me"];
  const patterns = [/(?:^|["'\s])[A-Za-z]:[\\/]/m, ...posixRoots.map((name) => new RegExp(`(?:^|["'\\s])/${name}/`))];
  if (patterns.some((pattern) => pattern.test(serialized))) throw new Error("Refusing to write a private absolute path");
  return serialized;
}

async function atomicWrite(relativePath, value) {
  const destination = repoPath(relativePath);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, value, { flag: "wx" });
  try {
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function atomicWriteJson(relativePath, value) {
  await atomicWrite(relativePath, portableJson(value));
}

function valuesEqual(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function pngDimensions(value) {
  if (value.length < 24 || value.toString("ascii", 1, 4) !== "PNG") throw new Error("Expected PNG capture");
  return { width: value.readUInt32BE(16), height: value.readUInt32BE(20) };
}

function jpegDimensions(value) {
  if (value.length < 4 || value[0] !== 0xff || value[1] !== 0xd8) throw new Error("Expected JPEG capture");
  let offset = 2;
  while (offset + 8 < value.length) {
    if (value[offset] !== 0xff) { offset += 1; continue; }
    const marker = value[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = value.readUInt16BE(offset);
    if (length < 2 || offset + length > value.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { width: value.readUInt16BE(offset + 5), height: value.readUInt16BE(offset + 3) };
    }
    offset += length;
  }
  throw new Error("JPEG dimensions unavailable");
}

async function validateCapture(record, label) {
  if (!record?.path || !/^[a-f0-9]{64}$/i.test(record.sha256 ?? "") || !(Number(record.bytes) > 0)) throw new Error(`${label} lacks file authority`);
  const value = await readFile(repoPath(record.path));
  if (value.length !== Number(record.bytes) || sha256Bytes(value) !== record.sha256) throw new Error(`${label} byte/hash mismatch`);
  const dimensions = record.path.toLowerCase().endsWith(".png") ? pngDimensions(value) : jpegDimensions(value);
  if (dimensions.width !== Number(record.width) || dimensions.height !== Number(record.height)) throw new Error(`${label} dimensions mismatch`);
  return { path: record.path, width: dimensions.width, height: dimensions.height, bytes: value.length, sha256: record.sha256 };
}

function captureRecord(record) {
  const candidate = record?.capture ?? record?.render ?? record;
  let path = candidate?.path ?? candidate?.repository_relative_path;
  if (!path && candidate?.package_relative_path) path = `${PACKAGE_RELATIVE}/${candidate.package_relative_path}`;
  return { path, width: candidate?.width, height: candidate?.height, bytes: candidate?.bytes, sha256: candidate?.sha256 };
}

async function validatePhysicalScreenContentStateMap(authority, label, expectedSourceSha256) {
  const stateMap = authority.physical_screen_content_state_map ?? authority.physicalScreenContentStateMap;
  const expectedKeys = Object.keys(PHYSICAL_SCREEN_STATE_IDS);
  if (!stateMap || typeof stateMap !== "object" || Array.isArray(stateMap) || !valuesEqual(Object.keys(stateMap), expectedKeys)) {
    throw new Error(`${label} lacks the exact brand/route/ready/text-free content-state map`);
  }
  const renderHashes = [];
  const renderPaths = [];
  for (const key of expectedKeys) {
    const record = stateMap[key] ?? {};
    const expected = PHYSICAL_SCREEN_STAGE_EXPECTATIONS[key];
    const expectedStateIds = PHYSICAL_SCREEN_STATE_IDS[key];
    const renders = Array.isArray(record.renders) ? record.renders : [];
    if (
      record.stage !== expected.stage ||
      record.visibility !== expected.visibility ||
      record.proof_status !== "PASS" ||
      !valuesEqual(record.state_ids, expectedStateIds) ||
      !valuesEqual(record.expected_copy_lines, expected.expectedCopyLines) ||
      renders.length !== expectedStateIds.length
    ) throw new Error(`${label} content stage is not exact: ${key}`);
    for (let index = 0; index < renders.length; index += 1) {
      const render = renders[index];
      const stateId = String(render.state_id ?? render.stateId ?? render.id ?? "");
      const interfaceStage = String(render.interface_stage ?? render.interfaceStage ?? "");
      const expectedInterfaceStage = key === "text-free" ? "none" : key;
      const sourceSha256 = String(
        render.source_sha256 ?? render.lineage?.source_sha256 ?? render.lineage?.refined_source_sha256 ?? "",
      ).toLowerCase();
      if (
        stateId !== expectedStateIds[index] ||
        interfaceStage !== expectedInterfaceStage ||
        (key === "text-free" ? render.interface !== false : render.interface !== true) ||
        (key === "text-free" && String(render.phosphor ?? "").toLowerCase() !== "takeover") ||
        render.phosphor == null ||
        sourceSha256 !== expectedSourceSha256
      ) throw new Error(`${label} render semantics/source lineage differ: ${key}/${expectedStateIds[index]}`);
      const verified = await validateCapture(captureRecord(render), `${label} content render ${stateId}`);
      renderHashes.push(verified.sha256);
      renderPaths.push(verified.path);
    }
  }
  if (new Set(renderHashes).size !== renderHashes.length || new Set(renderPaths).size !== renderPaths.length) {
    throw new Error(`${label} content-state proof reuses a governed render path or hash`);
  }
  return { stateMap: structuredClone(stateMap), canonicalSha256: canonicalDigest(stateMap), renderHashes };
}

function validatePhysicalScreenContentContract(authority, label) {
  const content = authority.physical_screen_content ?? authority.physicalScreenContent ?? {};
  const states = Array.isArray(content.states) ? content.states : [];
  const expectedStates = [
    { id: "stage-1-brand", lines: [PHYSICAL_SCREEN_COPY.brand] },
    { id: "stage-2-route-resolved", lines: [PHYSICAL_SCREEN_COPY.route.join(" ")] },
    { id: "stage-3-portal-ready", lines: [PHYSICAL_SCREEN_COPY.status] },
  ];
  if (
    !valuesEqual(states.map((record) => ({ id: record.id, lines: record.lines })), expectedStates) ||
    !states.every((record) => record.simplified === true) ||
    !valuesEqual(content.approved_copy ?? content.approvedCopy, expectedStates.map((record) => record.lines[0])) ||
    content.fictional_os_chrome !== false ||
    content.dense_telemetry !== false
  ) throw new Error(`${label} does not preserve the exact simplified brand -> route -> ready copy contract`);
  return structuredClone(content);
}

function transitionIntegrity(matrix) {
  const portalCases = matrix.cases.filter((record) => record.report?.portal?.applicable === true);
  const blankBridgeCases = portalCases.filter((record) =>
    record.report?.portal?.takeover?.pass !== true ||
    record.report?.portal?.takeover?.noPermanentLetterbox !== true ||
    record.report?.accessibility?.semanticHeadingCount !== 1);
  const aspectSnapCases = portalCases.filter((record) =>
    record.report?.portal?.physicalScreen?.pass !== true ||
    record.report?.portal?.takeover?.noAbruptAspectSnap !== true ||
    record.report?.portal?.takeover?.semanticDomUndistorted !== true);
  const doubledCopyCases = portalCases.filter((record) =>
    record.report?.assets?.doubledCopyPass !== true ||
    record.report?.portal?.takeover?.physicalTextAbsentBeforeDomCopy !== true);
  const result = {
    portalCaseCount: portalCases.length,
    blankBridgeCount: blankBridgeCases.length,
    aspectSnapCount: aspectSnapCases.length,
    doubledCopyCount: doubledCopyCases.length,
    blankBridgeCaseIds: blankBridgeCases.map((record) => record.id),
    aspectSnapCaseIds: aspectSnapCases.map((record) => record.id),
    doubledCopyCaseIds: doubledCopyCases.map((record) => record.id),
  };
  result.pass = result.portalCaseCount > 0 && result.blankBridgeCount === 0 && result.aspectSnapCount === 0 && result.doubledCopyCount === 0;
  return result;
}

async function validateFrozenSceneAuthority(plan) {
  const freeze = plan.sceneFreeze ?? {};
  if (
    !valuesEqual(freeze.requiredFrozenSourceRoles, SOURCE_IDS) ||
    !Array.isArray(freeze.sources) ||
    freeze.sources.length !== SOURCE_IDS.length ||
    !valuesEqual(freeze.sources.map((record) => record.id), SOURCE_IDS)
  ) throw new Error("Frozen repair plan does not preserve the exact ordered six-source authority");

  const descriptors = new Map((freeze.expectedSourceDescriptors ?? []).map((record) => [record.id, record]));
  if (descriptors.size !== SOURCE_IDS.length) throw new Error("Frozen repair plan lacks six exact authored source descriptors");
  const sources = new Map();
  for (let index = 0; index < SOURCE_IDS.length; index += 1) {
    const id = SOURCE_IDS[index];
    const source = freeze.sources[index];
    const descriptor = descriptors.get(id);
    if (
      source.role !== id ||
      !["frozen", "accepted"].includes(source.status) ||
      !descriptor ||
      source.path !== descriptor.path ||
      Number(source.width) !== Number(descriptor.width) ||
      Number(source.height) !== Number(descriptor.height)
    ) throw new Error(`Frozen repair source metadata differs from the authored role: ${id}`);
    sources.set(id, await validateCapture(source, `frozen scene source ${id}`));
  }

  const keepoutSpec = freeze.keepoutAuthority;
  if (keepoutSpec?.schema !== KEEP_OUT_SCHEMA || !["frozen", "accepted"].includes(keepoutSpec?.status)) {
    throw new Error("Frozen repair plan lacks an accepted source-space keepout authority");
  }
  const keepoutRecord = await validateFileAuthority(keepoutSpec, "frozen scene keepout authority", {
    expectedRepositoryPath: freeze.requiredKeepoutAuthority?.path,
  });
  const keepout = await readJson(authorityRepositoryPath(keepoutRecord));
  const ledger = keepout.records;
  if (
    keepout.schema !== KEEP_OUT_SCHEMA ||
    !["pass", "frozen"].includes(String(keepout.status ?? "").toLowerCase()) ||
    String(keepout.validationStatus ?? keepout.validation_status ?? "").toUpperCase() !== "PASS" ||
    Number(keepout.recordCount ?? keepout.record_count) !== SOURCE_IDS.length ||
    !valuesEqual(keepout.sourceRoles ?? keepout.source_roles, SOURCE_IDS) ||
    !ledger || typeof ledger !== "object" || Array.isArray(ledger) ||
    !valuesEqual(Object.keys(ledger), SOURCE_IDS)
  ) throw new Error("Frozen keepout ledger is not PASS with the exact ordered six-role object ledger");

  for (const id of SOURCE_IDS) {
    const record = ledger[id];
    const sourceRecord = captureRecord(record?.source ?? record?.file);
    const expected = sources.get(id);
    if (
      String(record?.sourceRole ?? record?.source_role ?? record?.role ?? "") !== id ||
      !["pass", "frozen", "accepted"].includes(String(record?.status ?? "").toLowerCase()) ||
      sourceRecord.path !== expected.path ||
      Number(sourceRecord.width) !== expected.width ||
      Number(sourceRecord.height) !== expected.height ||
      Number(sourceRecord.bytes) !== expected.bytes ||
      String(sourceRecord.sha256 ?? "").toLowerCase() !== expected.sha256
    ) throw new Error(`Frozen keepout/source lineage mismatch: ${id}`);
    await validateCapture(sourceRecord, `keepout source ${id}`);
    const geometry = record.geometry ?? {};
    for (const geometryId of ["crt-cabinet", "crt-screen", "spiral-cable"]) {
      if (!geometry[geometryId] || typeof geometry[geometryId] !== "object") throw new Error(`Keepout geometry is missing: ${id}/${geometryId}`);
    }
  }
}

async function loadPlanAndMatrix({ allowComplete = false } = {}) {
  const planBytes = await readFile(repoPath(PLAN_RELATIVE));
  const plan = JSON.parse(planBytes.toString("utf8"));
  if (plan.schema !== PLAN_SCHEMA || plan.repairPhase !== "Phase 0.4R" || plan.repairMode !== "additive-source-rebind") throw new Error("Unexpected Phase 0.4R plan authority");
  if (plan.sceneFreeze?.status !== "frozen" || plan.sceneFreeze?.captureAllowed !== true) throw new Error("Phase 0.4R finalization is blocked until all six sources and the regenerated keepout authority are frozen");
  if (allowComplete ? !["ready-for-capture", "complete"].includes(plan.sceneFreeze?.matrixStatus) : plan.sceneFreeze?.matrixStatus !== "ready-for-capture") {
    throw new Error(`Unexpected Phase 0.4R matrix status: ${plan.sceneFreeze?.matrixStatus}`);
  }
  await validateFrozenSceneAuthority(plan);
  const matrixBytes = await readFile(repoPath(MATRIX_RELATIVE));
  const matrix = JSON.parse(matrixBytes.toString("utf8"));
  const planAuthorityBytes = plan.sceneFreeze.matrixStatus === "complete" ? await readFile(repoPath(SNAPSHOT_RELATIVE)) : planBytes;
  if (
    matrix.schema !== MATRIX_SCHEMA ||
    matrix.plan?.path !== PLAN_RELATIVE ||
    matrix.plan?.sha256 !== sha256Bytes(planAuthorityBytes) ||
    matrix.contract?.sha256 !== plan.contractAuthority?.sha256 ||
    matrix.keepout?.sha256 !== plan.sceneFreeze?.keepoutAuthority?.sha256 ||
    !Array.isArray(matrix.cases) ||
    matrix.cases.length !== 46 ||
    new Set(matrix.cases.map((record) => record.id)).size !== 46
  ) throw new Error("Normalized Phase 0.4R matrix authority differs from the repair plan");
  if (matrix.cases.filter((record) => record.capture?.path && record.capture?.sha256).length !== 36) throw new Error("Normalized Phase 0.4R matrix lacks 36 captures");
  for (const record of matrix.cases) {
    if (record.runner?.pass !== true || record.report?.pass !== true) throw new Error(`Matrix case failed: ${record.id}`);
    if (record.capture) await validateCapture(record.capture, `matrix capture ${record.id}`);
  }
  const matrixRecord = { path: MATRIX_RELATIVE, schema: MATRIX_SCHEMA, bytes: matrixBytes.length, sha256: sha256Bytes(matrixBytes), caseCount: 46, normalizedCaptureCount: 36 };
  const checkpoint = await readJson(CHECKPOINT_RELATIVE);
  if (
    checkpoint.schema !== CHECKPOINT_SCHEMA ||
    checkpoint.status !== "complete-local-authority-normalized" ||
    checkpoint.matrix?.sha256 !== matrixRecord.sha256 ||
    checkpoint.matrix?.cases !== 46 ||
    checkpoint.matrix?.captures !== 36 ||
    checkpoint.matrix?.normalized !== true
  ) throw new Error("Normalized Phase 0.4R checkpoint does not bind the exact 46/36 matrix");
  const integrity = transitionIntegrity(matrix);
  if (!integrity.pass) throw new Error(`Portal integrity gates failed: blank=${integrity.blankBridgeCount}, aspect=${integrity.aspectSnapCount}, doubled=${integrity.doubledCopyCount}`);
  return { plan, planBytes, planAuthorityBytes, matrix, matrixBytes, matrixRecord, cases: new Map(matrix.cases.map((record) => [record.id, record])), checkpoint, integrity };
}

async function loadDistinctSemanticStates(base) {
  const spec = base.plan.browserFinalization?.portalSemanticCaptureAuthority;
  if (spec?.path !== PORTAL_BROWSER_AUTHORITY_RELATIVE || spec?.expectedSchema !== PORTAL_BROWSER_AUTHORITY_SCHEMA) {
    throw new Error("Repair plan does not bind the additive two-state browser portal authority");
  }
  const browserAuthority = await readJson(PORTAL_BROWSER_AUTHORITY_RELATIVE);
  if (
    browserAuthority.schema !== PORTAL_BROWSER_AUTHORITY_SCHEMA ||
    browserAuthority.status !== "PASS" ||
    browserAuthority.matrix?.sha256 !== base.matrixRecord.sha256 ||
    browserAuthority.stateCount !== 2 ||
    !valuesEqual(browserAuthority.exactStateIds, PORTAL_IDS.slice(6)) ||
    browserAuthority.distinctCaptureHashes?.pass !== true
  ) throw new Error("Two-state browser portal authority is not PASS against the normalized matrix");
  const state7Case = base.cases.get(PORTAL_CASE_ID);
  const state7Capture = await validateCapture(state7Case?.capture, "portal state 7");
  if (state7Case?.report?.assets?.sceneId !== TEXT_FREE_SOURCE_ID) throw new Error("Portal state 7 does not use the frozen text-free takeover source");
  const source = base.plan.sceneFreeze.sources.find((record) => record.id === TEXT_FREE_SOURCE_ID);
  if (!source?.sha256 || state7Case.report.assets.sceneSha256 !== source.sha256) throw new Error("Portal state 7 source SHA-256 differs from the repair plan");
  const state8Report = await readJson(PORTAL_STATE_8_REPORT_RELATIVE);
  if (
    state8Report.schema !== PORTAL_CAPTURE_SCHEMA ||
    state8Report.status !== "PASS" ||
    state8Report.matrix?.sha256 !== base.matrixRecord.sha256 ||
    state8Report.state7?.caseId !== PORTAL_CASE_ID ||
    state8Report.state7?.capture?.sha256 !== state7Capture.sha256 ||
    state8Report.audit?.pass !== true ||
    state8Report.audit?.sceneCrop?.display !== "none" ||
    state8Report.audit?.afterReportPass !== true ||
    state8Report.distinctFromState7?.pass !== true
  ) throw new Error("Portal state 8 browser report is not a passing full-semantic ownership authority");
  const state8Capture = await validateCapture(state8Report.capture, "portal state 8");
  if (state8Capture.width !== 1440 || state8Capture.height !== 900 || Number(state8Report.capture?.modal?.winner?.votes) < 7) throw new Error("Portal state 8 lacks exact 1440x900 >=7/11 modal capture authority");
  if (state8Capture.path === state7Capture.path || state8Capture.sha256 === state7Capture.sha256) throw new Error("Portal states 7 and 8 are not genuinely distinct browser captures");
  if (
    browserAuthority.states?.[0]?.capture?.sha256 !== state7Capture.sha256 ||
    browserAuthority.states?.[1]?.capture?.sha256 !== state8Capture.sha256 ||
    browserAuthority.states?.[1]?.captureReport?.sha256 !== (await fileRecord(PORTAL_STATE_8_REPORT_RELATIVE)).sha256
  ) throw new Error("Two-state browser portal authority capture lineage differs from its governed files");
  const state7 = {
    id: PORTAL_IDS[6], order: 7, owner: "repository browser semantic DOM", status: "PASS",
    case_id: PORTAL_CASE_ID, source_id: source.id, source_sha256: source.sha256, matrix_sha256: base.matrixRecord.sha256,
    semantic_state: "DOM takes ownership over the frozen text-free takeover raster", capture: state7Capture,
  };
  const state8 = {
    id: PORTAL_IDS[7], order: 8, owner: "repository browser semantic DOM", status: "PASS",
    case_id: PORTAL_CASE_ID, source_id: source.id, source_sha256: source.sha256, matrix_sha256: base.matrixRecord.sha256,
    semantic_state: "full semantic surface after the decorative takeover raster exits", capture: state8Capture,
    capture_report: await fileRecord(PORTAL_STATE_8_REPORT_RELATIVE, PORTAL_CAPTURE_SCHEMA),
  };
  return { source, state7, state8, state8Report, browserAuthority: { ...(await fileRecord(PORTAL_BROWSER_AUTHORITY_RELATIVE, PORTAL_BROWSER_AUTHORITY_SCHEMA)), status: "PASS", stateCount: 2 } };
}

async function loadPhysicalPortalAuthority(plan) {
  const spec = plan.browserFinalization?.portalPhysicalStateAuthority;
  const boundPhysical = await validateBoundPlanAuthority(spec, "six-state physical portal authority", {
    expectedPath: PHYSICAL_PORTAL_RELATIVE,
    expectedSchema: PHYSICAL_PORTAL_SCHEMA,
  });
  const authority = boundPhysical.json;
  const stateRecords = authority.states ?? authority.records;
  if (
    authority.schema !== PHYSICAL_PORTAL_SCHEMA || authority.status !== "PASS" ||
    !Array.isArray(stateRecords) || stateRecords.length !== 6 ||
    !valuesEqual(authority.exact_ids ?? authority.exactIds, PORTAL_IDS.slice(0, 6))
  ) throw new Error("Additive physical portal authority is not PASS with six exact ordered records");
  const source = await validateFileAuthority(authority.source, "physical portal source", {
    expectedPackagePath: REFINED_SOURCE_PACKAGE_RELATIVE,
  });
  const generator = await validateFileAuthority(authority.generator, "physical portal generator", {
    expectedPackagePath: CANONICAL_RENDERER_PACKAGE_RELATIVE,
  });
  const physicalScreenContent = validatePhysicalScreenContentContract(authority, "physical portal authority");
  const physicalContentStateMap = await validatePhysicalScreenContentStateMap(authority, "physical portal authority", source.sha256);
  const records = [];
  const stateHashes = [];
  for (let index = 0; index < 6; index += 1) {
    const record = stateRecords[index];
    if (record.id !== PORTAL_IDS[index] || Number(record.order ?? index + 1) !== index + 1) throw new Error(`Physical portal state order changed: ${PORTAL_IDS[index]}`);
    const capture = await validateCapture(captureRecord(record), `physical portal state ${record.id}`);
    stateHashes.push(capture.sha256);
    records.push({ ...structuredClone(record), id: record.id, order: index + 1, status: "PASS", owner: record.owner ?? "Blender physical CRT", capture });
  }
  if (new Set(stateHashes).size !== 6) throw new Error("Physical portal authority does not bind six unique state hashes");
  const canonicalSpec = plan.browserFinalization?.canonicalRenderManifest;
  const boundCanonical = await validateBoundPlanAuthority(canonicalSpec, "canonical render inventory", {
    expectedPath: CANONICAL_RELATIVE,
    expectedSchema: CANONICAL_SCHEMA,
  });
  const canonical = boundCanonical.json;
  const canonicalSource = await validateFileAuthority(canonical.source, "canonical render source", {
    expectedPackagePath: REFINED_SOURCE_PACKAGE_RELATIVE,
  });
  const canonicalGenerator = await validateFileAuthority(canonical.generator, "canonical render generator", {
    expectedPackagePath: CANONICAL_RENDERER_PACKAGE_RELATIVE,
  });
  validatePhysicalScreenContentContract(canonical, "canonical render inventory");
  const canonicalContentStateMap = await validatePhysicalScreenContentStateMap(canonical, "canonical render inventory", canonicalSource.sha256);
  if (canonicalSource.sha256 !== source.sha256 || canonicalGenerator.sha256 !== generator.sha256) {
    throw new Error("Physical portal authority source/generator differ from the canonical render inventory");
  }
  if (canonicalContentStateMap.canonicalSha256 !== physicalContentStateMap.canonicalSha256) {
    throw new Error("Physical portal and canonical render authorities do not share one exact physical-screen content-state map");
  }
  return {
    records,
    stateHashes,
    source,
    generator,
    physicalScreenContent,
    contentStateMap: physicalContentStateMap.stateMap,
    contentStateMapSha256: physicalContentStateMap.canonicalSha256,
    physicalAuthority: boundPhysical.record,
    canonicalAuthority: boundCanonical.record,
  };
}

async function loadPowerStateAuthority(plan) {
  const spec = plan.browserFinalization?.powerOnStateAuthority;
  const boundPower = await validateBoundPlanAuthority(spec, "seven-state power-on authority", {
    expectedPath: POWER_STATE_RELATIVE,
    expectedSchema: POWER_STATE_SCHEMA,
  });
  const authority = boundPower.json;
  const records = authority.states ?? authority.records;
  if (
    authority.schema !== POWER_STATE_SCHEMA || authority.status !== "PASS" ||
    !Array.isArray(records) || records.length !== POWER_IDS.length ||
    !valuesEqual(authority.exact_ids ?? authority.exactIds, POWER_IDS)
  ) {
    throw new Error("Additive power-state authority is not PASS with seven records");
  }
  const source = await validateFileAuthority(authority.source, "power-state source", {
    expectedPackagePath: REFINED_SOURCE_PACKAGE_RELATIVE,
  });
  const generator = await validateFileAuthority(authority.generator, "power-state generator", {
    expectedPackagePath: CANONICAL_RENDERER_PACKAGE_RELATIVE,
  });
  const contentStateMap = await validatePhysicalScreenContentStateMap(authority, "power-state authority", source.sha256);
  const stateHashes = [];
  for (let index = 0; index < POWER_IDS.length; index += 1) {
    const record = records[index];
    if (record.id !== POWER_IDS[index] || Number(record.order ?? index + 1) !== index + 1) {
      throw new Error(`Power-state order changed: ${POWER_IDS[index]}`);
    }
    const capture = await validateCapture(captureRecord(record), `power state ${record.id}`);
    stateHashes.push(capture.sha256);
  }
  if (new Set(stateHashes).size !== POWER_IDS.length) throw new Error("Power-state authority does not bind seven unique state hashes");
  const content = authority.physical_screen_content ?? authority.physicalScreenContent ?? {};
  const contentStates = Array.isArray(content.states) ? content.states : [];
  const expectedContentStates = [
    { id: "stage-1-brand", lines: [PHYSICAL_SCREEN_COPY.brand] },
    { id: "stage-2-route-resolved", lines: [PHYSICAL_SCREEN_COPY.route.join(" ")] },
    { id: "stage-3-portal-ready", lines: [PHYSICAL_SCREEN_COPY.status] },
  ];
  if (
    !valuesEqual(contentStates.map((record) => ({ id: record.id, lines: record.lines })), expectedContentStates) ||
    !contentStates.every((record) => record.simplified === true) ||
    !valuesEqual(content.approved_copy ?? content.approvedCopy, expectedContentStates.map((record) => record.lines[0])) ||
    content.fictional_os_chrome !== false ||
    content.dense_telemetry !== false
  ) throw new Error("Power-state authority does not preserve the exact brand -> route -> ready physical-screen content contract");
  const startup = authority.startup_geometry ?? authority.startupGeometry ?? {};
  const wake = startup.wake ?? {};
  const partial = startup.partial_raster ?? startup.partialRaster ?? {};
  const full = startup.full_raster ?? startup.fullRaster ?? {};
  if (
    wake.orientation !== "horizontal" || wake.bowed !== true || !/line/i.test(String(wake.shape ?? "")) ||
    !/4:3/.test(String(partial.shape ?? "")) || !(Number(partial.vertical_fill_ratio ?? partial.verticalFillRatio) > 0 && Number(partial.vertical_fill_ratio ?? partial.verticalFillRatio) < 1) || partial.degaussing_ripple?.active !== true ||
    !/4:3/.test(String(full.shape ?? "")) || Number(full.vertical_fill_ratio ?? full.verticalFillRatio) < 0.98 || (full.degaussing_settled ?? full.degaussingRipple?.settled ?? full.degaussing_ripple?.settled) !== true
  ) throw new Error("Power-state authority does not preserve the bowed-line -> partial 4:3 raster -> settled 4:3 raster startup geometry");
  const connector = authority.connector_response ?? authority.connectorResponse ?? {};
  if (
    Number(connector.pre_arrival_emission_strength ?? connector.preArrivalEmissionStrength) !== 0 ||
    !(Number(connector.post_arrival_emission_strength ?? connector.postArrivalEmissionStrength) > 0) ||
    connector.localized !== true ||
    !(Number(connector.affected_area_ratio ?? connector.affectedAreaRatio) > 0 && Number(connector.affected_area_ratio ?? connector.affectedAreaRatio) < 0.1)
  ) throw new Error("Power-state authority does not preserve zero-before-arrival and localized post-arrival connector response");
  return {
    ...boundPower.record,
    stateCount: POWER_IDS.length,
    exactStateIds: POWER_IDS,
    stateHashes,
    contentStateMapSha256: contentStateMap.canonicalSha256,
    source,
    generator,
  };
}

async function loadBlenderValidationAuthority(plan) {
  const spec = plan.browserFinalization?.blenderValidationManifest;
  const boundValidation = await validateBoundPlanAuthority(spec, "Blender source validation", {
    expectedPath: BLENDER_VALIDATION_RELATIVE,
    expectedSchema: BLENDER_VALIDATION_SCHEMA,
  });
  const source = await validateFileAuthority(
    boundValidation.json.source ?? boundValidation.json.blend_source ?? boundValidation.json.authorities?.source,
    "Blender validation source",
    { expectedPackagePath: REFINED_SOURCE_PACKAGE_RELATIVE },
  );
  const checks = new Map((boundValidation.json.checks ?? []).map((record) => [record.id, record]));
  for (const id of [
    "connector_localized_post_arrival",
    "phosphor_line_to_rectangular_raster_sequence",
    "physical_screen_copy",
    "simplified_physical_screen_content",
    "exact_seven_power_states",
    "exact_eight_portal_states",
  ]) {
    const check = checks.get(id);
    if (!check || (check.pass !== true && check.status !== "PASS")) throw new Error(`Blender validation does not prove ${id}`);
  }
  const copy = checks.get("physical_screen_copy")?.actual ?? {};
  if (!valuesEqual(copy, PHYSICAL_SCREEN_COPY)) throw new Error("Blender validation physical-screen copy differs from the approved brand/route/status contract");
  const simplified = checks.get("simplified_physical_screen_content")?.actual ?? {};
  if (
    !valuesEqual(simplified.approved_copy ?? simplified.approvedCopy, [PHYSICAL_SCREEN_COPY.brand, PHYSICAL_SCREEN_COPY.route.join(" "), PHYSICAL_SCREEN_COPY.status]) ||
    simplified.fictional_os_chrome !== false ||
    simplified.dense_telemetry !== false
  ) throw new Error("Blender validation does not prove simplified three-stage physical-screen content");
  return { ...boundValidation.record, source };
}

function buildEvidenceCore(base, snapshot, semantic, physical, powerStateAuthority, blenderValidationAuthority) {
  if (physical.contentStateMapSha256 !== powerStateAuthority.contentStateMapSha256) {
    throw new Error("Power, physical-portal and canonical authorities do not share one exact physical-screen content-state map");
  }
  const core = {
    capturePlanAuthority: snapshot,
    matrix: base.matrixRecord,
    contract: base.plan.contractAuthority,
    keepout: base.plan.sceneFreeze.keepoutAuthority,
    sceneSources: base.plan.sceneFreeze.sources,
    canonicalRenderAuthority: physical.canonicalAuthority,
    physicalPortalAuthority: physical.physicalAuthority,
    powerStateAuthority,
    blenderValidationAuthority,
    physicalScreenContentStateMapSha256: physical.contentStateMapSha256,
    portalBrowserStateAuthority: semantic.browserAuthority,
    semanticStates: [semantic.state7, semantic.state8],
    transitionIntegrity: base.integrity,
  };
  return { ...core, canonicalSha256: canonicalDigest(core) };
}

async function writeFinalPortalAuthority(base, semantic, physical, evidenceCore) {
  const outputSpec = base.plan.browserFinalization?.portalTransitionStateAuthority;
  if (outputSpec?.path !== FINAL_PORTAL_RELATIVE || outputSpec?.expectedSchema !== FINAL_PORTAL_SCHEMA) throw new Error("Repair plan does not bind the additive final 8/8 portal authority");
  const states = [...physical.records, semantic.state7, semantic.state8];
  const stateHashes = states.map((record) => captureRecord(record).sha256);
  if (stateHashes.some((value) => !/^[a-f0-9]{64}$/i.test(value ?? "")) || new Set(stateHashes).size !== PORTAL_IDS.length) {
    throw new Error("Final portal authority does not bind eight unique state hashes");
  }
  const generator = await fileRecord(FINALIZER_RELATIVE);
  const transitionQuality = {
    portalCaseCount: base.integrity.portalCaseCount,
    blankBridgeCount: base.integrity.blankBridgeCount,
    aspectSnapCount: base.integrity.aspectSnapCount,
    doubledCopyCount: base.integrity.doubledCopyCount,
    pass: base.integrity.pass,
  };
  const authority = {
    schema: FINAL_PORTAL_SCHEMA,
    status: "PASS",
    generatedAt: base.matrix.generatedAt,
    count: PORTAL_IDS.length,
    exact_ids: PORTAL_IDS,
    source: physical.source,
    generator,
    physical_generator: physical.generator,
    physical_screen_content: physical.physicalScreenContent,
    physical_screen_content_state_map: physical.contentStateMap,
    physical_state_count: 6,
    browser_state_count: 2,
    canonical_render_authority: physical.canonicalAuthority,
    physical_state_authority: physical.physicalAuthority,
    browser_matrix: base.matrixRecord,
    browser_evidence_core: { path: BROWSER_EVIDENCE_RELATIVE, schema: EVIDENCE_SCHEMA, canonicalSha256: evidenceCore.canonicalSha256 },
    browser_evidence_core_sha256: evidenceCore.canonicalSha256,
    evidence_core_sha256: evidenceCore.canonicalSha256,
    transition_integrity: base.integrity,
    transition_quality: transitionQuality,
    blankBridgeCount: transitionQuality.blankBridgeCount,
    aspectSnapCount: transitionQuality.aspectSnapCount,
    doubledCopyCount: transitionQuality.doubledCopyCount,
    distinct_browser_states: {
      pass: semantic.state7.capture.path !== semantic.state8.capture.path && semantic.state7.capture.sha256 !== semantic.state8.capture.sha256,
      state7Sha256: semantic.state7.capture.sha256,
      state8Sha256: semantic.state8.capture.sha256,
    },
    state_hashes: stateHashes,
    states,
    records: states,
    full_animatic_created: false,
  };
  if (!authority.distinct_browser_states.pass || !transitionQuality.pass) throw new Error("Final portal authority cannot promote failed or duplicate browser states");
  await atomicWriteJson(FINAL_PORTAL_RELATIVE, authority);
  return { json: authority, record: { ...(await fileRecord(FINAL_PORTAL_RELATIVE, FINAL_PORTAL_SCHEMA)), status: "PASS", stateCount: 8 } };
}

async function buildCompositionInputs(base, snapshot, semantic, portalAuthority) {
  const sheets = [{
    reviewIndex: 10,
    filename: "crt-portal-transition-sheet.png",
    stateIds: PORTAL_IDS,
    sources: portalAuthority.json.records.map((record) => ({ stateId: record.id, ...captureRecord(record) })),
  }];
  for (const planned of base.plan.browserDerivedReviewSheets ?? []) {
    const sources = planned.sourceCaseIds.map((caseId) => {
      const capture = base.cases.get(caseId)?.capture;
      if (!capture?.path) throw new Error(`Browser compositor input is not normalized: ${planned.filename} -> ${caseId}`);
      return { captureId: caseId, ...captureRecord(capture) };
    });
    sheets.push({ reviewIndex: planned.reviewIndex, filename: planned.filename, sourceCaseIds: planned.sourceCaseIds, sources, additionalAuthorities: planned.additionalAuthorities ?? [] });
  }
  if (sheets.length !== 7 || !valuesEqual(sheets.map((sheet) => sheet.reviewIndex), REVIEW_OUTPUTS.map(([index]) => index))) throw new Error("Browser compositor inputs do not preserve exact sheets 10 through 16");
  const inputs = {
    schema: INPUTS_SCHEMA,
    status: "READY_FOR_CREATIVE_COMPOSITION",
    generatedAt: base.matrix.generatedAt,
    compositionOwner: "creative track; this manifest does not generate or modify review pixels",
    capturePlanAuthority: snapshot,
    browserMatrix: base.matrixRecord,
    portalTransitionStateAuthority: portalAuthority.record,
    semanticPortalStateDistinctness: {
      pass: semantic.state7.capture.sha256 !== semantic.state8.capture.sha256,
      state7: semantic.state7.capture,
      state8: semantic.state8.capture,
    },
    sheets,
  };
  await atomicWriteJson(COMPOSITION_INPUTS_RELATIVE, inputs);
  return { json: inputs, record: { ...(await fileRecord(COMPOSITION_INPUTS_RELATIVE, INPUTS_SCHEMA)), status: inputs.status, sheetCount: 7 } };
}

function buildBrowserEvidence({ status, base, snapshot, evidenceCore, portalAuthority, powerStateAuthority, inputs, composition = null }) {
  return {
    schema: EVIDENCE_SCHEMA,
    status,
    generatedAt: base.matrix.generatedAt,
    authorityPolicy: "acyclic capture-plan snapshot -> normalized matrix -> evidence core -> PASS 8/8 portal authority -> browser evidence; the shared core digest cross-binds portal and evidence without circular file hashes",
    evidenceCore,
    evidence_core_sha256: evidenceCore.canonicalSha256,
    evidenceCoreSha256: evidenceCore.canonicalSha256,
    plan: snapshot,
    capturePlanAuthority: snapshot,
    matrix: base.matrixRecord,
    matrix_summary: { case_count: 46, normalized_capture_count: 36 },
    power_state_authority: powerStateAuthority,
    portal_state_authority: portalAuthority.record,
    portalTransitionStateAuthority: portalAuthority.record,
    browserReviewCompositionInputs: inputs.record,
    browserReviewCompositionManifest: composition,
    transitionIntegrity: base.integrity,
    blankBridgeCount: base.integrity.blankBridgeCount,
    aspectSnapCount: base.integrity.aspectSnapCount,
    doubledCopyCount: base.integrity.doubledCopyCount,
    completion: {
      caseCount: 46,
      normalizedCaptureCount: 36,
      exactPortalStateCount: 8,
      distinctBrowserStateCount: 2,
      browserReviewSheetCount: 7,
      outputsBound: status === "PASS" ? 7 : 0,
      humanCreativeAcceptance: "pending",
    },
  };
}

async function prepare() {
  const base = await loadPlanAndMatrix();
  if (await stat(repoPath(SNAPSHOT_RELATIVE)).catch(() => null)) {
    const existing = await readFile(repoPath(SNAPSHOT_RELATIVE));
    if (!existing.equals(base.planBytes)) throw new Error("Existing Phase 0.4R capture-plan snapshot differs from the matrix-bound ready plan");
  } else {
    await atomicWrite(SNAPSHOT_RELATIVE, base.planBytes);
  }
  const snapshot = { ...(await fileRecord(SNAPSHOT_RELATIVE, PLAN_SCHEMA)), originalAuthorityPath: PLAN_RELATIVE };
  const semantic = await loadDistinctSemanticStates(base);
  const physical = await loadPhysicalPortalAuthority(base.plan);
  const powerStateAuthority = await loadPowerStateAuthority(base.plan);
  const blenderValidationAuthority = await loadBlenderValidationAuthority(base.plan);
  const evidenceCore = buildEvidenceCore(base, snapshot, semantic, physical, powerStateAuthority, blenderValidationAuthority);
  const portalAuthority = await writeFinalPortalAuthority(base, semantic, physical, evidenceCore);
  const inputs = await buildCompositionInputs(base, snapshot, semantic, portalAuthority);
  const evidence = buildBrowserEvidence({ status: "READY_FOR_REVIEW_COMPOSITION", base, snapshot, evidenceCore, portalAuthority, powerStateAuthority, inputs });
  await atomicWriteJson(BROWSER_EVIDENCE_RELATIVE, evidence);
  console.log(`Prepared Phase 0.4R browser evidence from matrix ${base.matrixRecord.sha256}.`);
  console.log(`Portal authority PASS 8/8: ${portalAuthority.record.sha256}.`);
  console.log(`Creative compositor inputs only: ${COMPOSITION_INPUTS_RELATIVE}. No review pixels were generated.`);
}

async function validateComposition(base, portalAuthority, inputs) {
  const spec = base.plan.browserFinalization?.browserReviewCompositionManifest;
  if (spec?.path !== COMPOSITION_RELATIVE || spec?.expectedSchema !== COMPOSITION_SCHEMA) throw new Error("Repair plan does not bind the additive browser composition manifest");
  const composition = await readJson(COMPOSITION_RELATIVE);
  if (composition.schema !== COMPOSITION_SCHEMA || composition.status !== "PASS" || !Array.isArray(composition.records) || composition.records.length !== 7) throw new Error("Additive browser composition manifest is not PASS with seven outputs");
  const matrixBinding = composition.browserMatrix ?? composition.browser_matrix ?? composition.matrix;
  if (matrixBinding?.sha256 !== base.matrixRecord.sha256 || matrixBinding?.path !== MATRIX_RELATIVE) throw new Error("Browser composition does not bind the Phase 0.4R matrix");
  const portalBinding = composition.portalTransitionStateAuthority ?? composition.portal_state_authority;
  if (portalBinding?.sha256 !== portalAuthority.record.sha256 || portalBinding?.path !== FINAL_PORTAL_RELATIVE) throw new Error("Browser composition does not bind the additive PASS 8/8 portal authority");
  for (const [reviewIndex, filename] of REVIEW_OUTPUTS) {
    const record = composition.records.find((entry) => entry.reviewIndex === reviewIndex || entry.filename === filename);
    if (!record) throw new Error(`Browser composition output missing: ${filename}`);
    await validateCapture(record.output ?? record, `browser composition output ${filename}`);
    const expected = inputs.json.sheets.find((sheet) => sheet.reviewIndex === reviewIndex);
    if (!valuesEqual(record.sourceCaseIds ?? expected.sourceCaseIds ?? [], expected.sourceCaseIds ?? [])) throw new Error(`Browser composition case IDs changed: ${filename}`);
    const sourceRecords = record.sources ?? [];
    if (sourceRecords.length !== expected.sources.length) throw new Error(`Browser composition source count changed: ${filename}`);
    for (let index = 0; index < sourceRecords.length; index += 1) {
      const left = sourceRecords[index];
      const right = expected.sources[index];
      if ((left.captureId ?? left.stateId) !== (right.captureId ?? right.stateId) || left.path !== right.path || left.sha256 !== right.sha256) throw new Error(`Browser composition source lineage changed: ${filename}`);
    }
  }
  return { json: composition, record: { ...(await fileRecord(COMPOSITION_RELATIVE, COMPOSITION_SCHEMA)), status: "PASS", outputCount: 7 } };
}

async function complete() {
  const base = await loadPlanAndMatrix();
  const snapshotBytes = await readFile(repoPath(SNAPSHOT_RELATIVE));
  if (!snapshotBytes.equals(base.planBytes)) throw new Error("Current ready plan differs from its matrix-bound snapshot");
  const snapshot = { ...(await fileRecord(SNAPSHOT_RELATIVE, PLAN_SCHEMA)), originalAuthorityPath: PLAN_RELATIVE };
  const semantic = await loadDistinctSemanticStates(base);
  const physical = await loadPhysicalPortalAuthority(base.plan);
  const powerStateAuthority = await loadPowerStateAuthority(base.plan);
  const blenderValidationAuthority = await loadBlenderValidationAuthority(base.plan);
  const evidenceCore = buildEvidenceCore(base, snapshot, semantic, physical, powerStateAuthority, blenderValidationAuthority);
  const portalAuthority = { json: await readJson(FINAL_PORTAL_RELATIVE), record: { ...(await fileRecord(FINAL_PORTAL_RELATIVE, FINAL_PORTAL_SCHEMA)), status: "PASS", stateCount: 8 } };
  if (portalAuthority.json.status !== "PASS" || portalAuthority.json.browser_evidence_core?.canonicalSha256 !== evidenceCore.canonicalSha256) throw new Error("Prepared portal authority differs from the current browser evidence core");
  const inputs = { json: await readJson(COMPOSITION_INPUTS_RELATIVE), record: { ...(await fileRecord(COMPOSITION_INPUTS_RELATIVE, INPUTS_SCHEMA)), status: "READY_FOR_CREATIVE_COMPOSITION", sheetCount: 7 } };
  const composition = await validateComposition(base, portalAuthority, inputs);
  const evidence = buildBrowserEvidence({ status: "PASS", base, snapshot, evidenceCore, portalAuthority, powerStateAuthority, inputs, composition: composition.record });
  await atomicWriteJson(BROWSER_EVIDENCE_RELATIVE, evidence);
  const evidenceAuthority = { ...(await fileRecord(BROWSER_EVIDENCE_RELATIVE, EVIDENCE_SCHEMA)), status: "PASS" };
  const completePlan = structuredClone(base.plan);
  completePlan.status = "PASS";
  completePlan.harnessStatus = "accepted Phase 0.4 topology plus additive source-rebind evidence complete: 46 reports, 36 normalized captures and two distinct semantic portal states";
  completePlan.sceneFreeze.matrixStatus = "complete";
  completePlan.finalMatrix = { ...base.matrixRecord, status: "complete-local-authority-normalized" };
  completePlan.captureAuthoritySnapshot = snapshot;
  completePlan.completionAuthority = evidenceAuthority;
  completePlan.browserReviewCompositionAuthority = composition.record;
  completePlan.portalTransitionStateAuthority = portalAuthority.record;
  completePlan.powerOnStateAuthority = powerStateAuthority;
  completePlan.humanCreativeAcceptance = "pending";
  await atomicWriteJson(PLAN_RELATIVE, completePlan);
  console.log(`Completed Phase 0.4R browser evidence authority: ${evidenceAuthority.sha256}.`);
}

async function checkComplete() {
  const base = await loadPlanAndMatrix({ allowComplete: true });
  if (base.plan.sceneFreeze.matrixStatus !== "complete") throw new Error("--check requires the complete Phase 0.4R plan");
  const snapshot = { ...(await fileRecord(SNAPSHOT_RELATIVE, PLAN_SCHEMA)), originalAuthorityPath: PLAN_RELATIVE };
  const semantic = await loadDistinctSemanticStates(base);
  const physical = await loadPhysicalPortalAuthority(base.plan);
  const powerStateAuthority = await loadPowerStateAuthority(base.plan);
  const blenderValidationAuthority = await loadBlenderValidationAuthority(base.plan);
  const evidenceCore = buildEvidenceCore(base, snapshot, semantic, physical, powerStateAuthority, blenderValidationAuthority);
  const portalAuthority = { json: await readJson(FINAL_PORTAL_RELATIVE), record: { ...(await fileRecord(FINAL_PORTAL_RELATIVE, FINAL_PORTAL_SCHEMA)), status: "PASS", stateCount: 8 } };
  if (portalAuthority.json.status !== "PASS" || portalAuthority.json.records?.length !== 8 || portalAuthority.json.browser_evidence_core?.canonicalSha256 !== evidenceCore.canonicalSha256) throw new Error("Final portal authority is not PASS 8/8 against the current evidence core");
  const inputs = { json: await readJson(COMPOSITION_INPUTS_RELATIVE), record: { ...(await fileRecord(COMPOSITION_INPUTS_RELATIVE, INPUTS_SCHEMA)), status: "READY_FOR_CREATIVE_COMPOSITION", sheetCount: 7 } };
  const composition = await validateComposition(base, portalAuthority, inputs);
  const evidence = await readJson(BROWSER_EVIDENCE_RELATIVE);
  if (
    evidence.schema !== EVIDENCE_SCHEMA || evidence.status !== "PASS" ||
    evidence.evidenceCore?.canonicalSha256 !== evidenceCore.canonicalSha256 ||
    evidence.portalTransitionStateAuthority?.sha256 !== portalAuthority.record.sha256 ||
    evidence.power_state_authority?.sha256 !== powerStateAuthority.sha256 ||
    evidence.browserReviewCompositionManifest?.sha256 !== composition.record.sha256 ||
    evidence.blankBridgeCount !== 0 ||
    evidence.aspectSnapCount !== 0 ||
    evidence.doubledCopyCount !== 0 ||
    evidence.transitionIntegrity?.blankBridgeCount !== 0 ||
    evidence.transitionIntegrity?.aspectSnapCount !== 0 ||
    evidence.transitionIntegrity?.doubledCopyCount !== 0
  ) throw new Error("Completed Phase 0.4R browser evidence manifest differs from final authorities");
  console.log(`Phase 0.4R browser evidence PASS: 46/46 reports, 36/36 normalized captures, distinct portal states 7/8, zero blank/aspect-snap/doubled-copy violations.`);
}

function usage() {
  console.log("Usage: node scripts/finalize-phase04r-browser-evidence.mjs --prepare|--complete|--check");
  console.log("  --prepare   snapshot the ready repair plan, promote the additive portal authority PASS 8/8, and emit compositor inputs");
  console.log("  --complete  require creative-owned sheets 10-16 and seal the additive browser evidence/plan pointers");
  console.log("  --check     validate the completed additive authority without writing");
}

const modes = process.argv.slice(2).filter((argument) => ["--prepare", "--complete", "--check"].includes(argument));
if (process.argv.includes("--help")) usage();
else if (modes.length !== 1) { usage(); process.exitCode = 2; }
else {
  try {
    if (modes[0] === "--prepare") await prepare();
    else if (modes[0] === "--complete") await complete();
    else await checkComplete();
  } catch (error) {
    console.error(`Phase 0.4R browser evidence finalizer stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
