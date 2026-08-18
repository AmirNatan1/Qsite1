#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_RELATIVE = "artifacts/original/phase-0-4-crt-television";
const EVIDENCE_RELATIVE = "artifacts/evidence/phase-0-4-crt-television";
const PLAN_RELATIVE = "prototypes/phase-0-4-crt-portal-qa/capture-plan.json";
const MATRIX_RELATIVE = `${EVIDENCE_RELATIVE}/browser-matrix-report.json`;
const SNAPSHOT_RELATIVE = `${EVIDENCE_RELATIVE}/capture-plan-authority.json`;
const BROWSER_EVIDENCE_RELATIVE = `${EVIDENCE_RELATIVE}/browser-evidence-manifest.json`;
const CHECKPOINT_RELATIVE = `${EVIDENCE_RELATIVE}/capture-checkpoint.json`;
const CANONICAL_RELATIVE = `${PACKAGE_RELATIVE}/manifests/crt-canonical-render-manifest.json`;
const POWER_STATE_RELATIVE = `${PACKAGE_RELATIVE}/manifests/crt-power-on-state-authority.json`;
const PORTAL_STATE_RELATIVE = `${PACKAGE_RELATIVE}/manifests/crt-portal-transition-state-authority.json`;
const MATERIAL_RELATIVE = `${PACKAGE_RELATIVE}/manifests/crt-material-and-asset-manifest.json`;
const COMPOSITION_RELATIVE = `${PACKAGE_RELATIVE}/manifests/browser-review-composition-manifest.json`;
const CREATIVE_COMPOSITION_RELATIVE = `${PACKAGE_RELATIVE}/manifests/crt-review-composition-manifest.json`;

const PLAN_SCHEMA = "quantum-hub.phase-0-4-crt-television.typography-capture-plan.v1";
const MATRIX_SCHEMA = "quantum-hub.phase-0-4-crt-television.typography-collision-matrix.v1";
const EVIDENCE_SCHEMA = "quantum-hub.phase-0-4-crt-television.browser-evidence.v1";
const COMPOSITION_SCHEMA = "quantum-hub.phase-0-4-crt-television.browser-review-composition.v1";
const CREATIVE_COMPOSITION_SCHEMA = "quantum-hub.phase-0-4-crt-television.review-composition.v1";
const CANONICAL_SCHEMA = "quantum-hub.phase-0-4-crt-television.canonical-still-render-inventory.v1";
const POWER_STATE_SCHEMA = "quantum-hub.phase-0-4-crt-television.power-on-state-authority.v1";
const PORTAL_STATE_SCHEMA = "quantum-hub.phase-0-4-crt-television.portal-transition-state-authority.v1";
const MATERIAL_SCHEMA = "quantum-hub.phase-0-4-crt-television.material-and-asset.v1";
const CHECKPOINT_SCHEMA = "quantum-hub.phase-0-4-crt-television.capture-checkpoint.v1";
const PORTAL_CASE_ID = "portal-actual--desktop-1440x900";
const TEXT_FREE_SOURCE_ID = "source-text-free-portal-takeover";
const OWNER = "repository browser semantic DOM";

const POWER_STATE_IDS = Object.freeze([
  "power-01-completely-dormant",
  "power-02-current-reaches-connection",
  "power-03-power-indicator-response",
  "power-04-crt-electrical-wake",
  "power-05-raster-phosphor-appears",
  "power-06-quantum-interface-stabilizes",
  "power-07-portal-ready",
]);

const PORTAL_STATE_IDS = Object.freeze([
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
  const normalized = String(relativePath ?? "").replaceAll("\\", "/");
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

function portableJson(value) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (/(?:^|["'\s])[A-Za-z]:(?:\\\\|\/)|(?:^|["'\s])\/(?:Users|home)\//i.test(serialized)) {
    throw new Error("Refusing to write Phase 0.4 evidence containing an absolute private path");
  }
  return serialized;
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function exists(relativePath) {
  try {
    await access(repoPath(relativePath));
    return true;
  } catch {
    return false;
  }
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(repoPath(relativePath), "utf8"));
}

async function fileRecord(relativePath, extra = {}) {
  const bytes = await readFile(repoPath(relativePath));
  return { path: relativePath, bytes: bytes.length, sha256: sha256Bytes(bytes), ...extra };
}

async function atomicWrite(relativePath, bytes) {
  const destination = repoPath(relativePath);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes, { flag: "wx" });
  await rename(temporary, destination);
}

async function atomicWriteJson(relativePath, value) {
  await atomicWrite(relativePath, Buffer.from(portableJson(value)));
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function pngDimensions(bytes) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || signature.some((value, index) => bytes[index] !== value)) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function validatePngRecord(record, relativePath, label) {
  if (!record || record.path !== relativePath) throw new Error(`${label} path changed: ${record?.path}`);
  const bytes = await readFile(repoPath(relativePath));
  const dimensions = pngDimensions(bytes);
  if (!dimensions) throw new Error(`${label} is not a PNG: ${relativePath}`);
  if (
    record.bytes !== bytes.length ||
    record.sha256 !== sha256Bytes(bytes) ||
    record.width !== dimensions.width ||
    record.height !== dimensions.height
  ) {
    throw new Error(`${label} byte/hash/dimension lineage mismatch: ${relativePath}`);
  }
  return { path: relativePath, bytes: bytes.length, sha256: sha256Bytes(bytes), ...dimensions };
}

function captureAuthority(record) {
  return {
    path: record.path,
    width: record.width,
    height: record.height,
    bytes: record.bytes,
    sha256: record.sha256,
  };
}

async function validateMatrix(plan, planBytes, snapshotBytes = null) {
  const matrixBytes = await readFile(repoPath(MATRIX_RELATIVE));
  const matrix = JSON.parse(matrixBytes.toString("utf8"));
  if (matrix.schema !== MATRIX_SCHEMA) throw new Error(`Unexpected browser matrix schema: ${matrix.schema}`);
  const expectedPlanBytes = snapshotBytes ?? planBytes;
  if (matrix.plan?.path !== PLAN_RELATIVE || matrix.plan?.sha256 !== sha256Bytes(expectedPlanBytes)) {
    throw new Error("Browser matrix does not bind the ready-for-capture plan authority");
  }
  if (matrix.contract?.sha256 !== plan.contractAuthority?.sha256) throw new Error("Browser matrix CRT contract SHA-256 mismatch");
  if (matrix.keepout?.sha256 !== plan.sceneFreeze?.keepoutAuthority?.sha256) throw new Error("Browser matrix keepout SHA-256 mismatch");
  if (!Array.isArray(matrix.cases) || matrix.cases.length !== 46 || new Set(matrix.cases.map((record) => record.id)).size !== 46) {
    throw new Error(`Browser matrix does not contain 46 unique cases: ${matrix.cases?.length ?? 0}`);
  }
  const normalized = matrix.cases.filter((record) => record.capture?.path && record.capture?.sha256);
  if (normalized.length !== 36) throw new Error(`Browser matrix does not contain 36 normalized captures: ${normalized.length}`);
  for (const record of matrix.cases) {
    if (record.runner?.pass !== true || record.report?.pass !== true) throw new Error(`Browser case failed: ${record.id}`);
    if (record.capture) await validatePngRecord(record.capture, record.capture.path, `normalized browser capture ${record.id}`);
  }
  if (!Array.isArray(matrix.browserDerivedReviewSheets) || matrix.browserDerivedReviewSheets.length !== 6) {
    throw new Error("Browser matrix does not bind six review-sheet lineage records for sheets 11 through 16");
  }
  return {
    json: matrix,
    bytes: matrixBytes,
    record: { path: MATRIX_RELATIVE, schema: MATRIX_SCHEMA, bytes: matrixBytes.length, sha256: sha256Bytes(matrixBytes), cases: 46, normalizedCaptures: 36 },
    cases: new Map(matrix.cases.map((record) => [record.id, record])),
  };
}

function canonicalFileRecord(record) {
  const candidate = record?.render ?? record;
  const packagePath = candidate?.package_relative_path;
  if (!packagePath) throw new Error(`Canonical state lacks package_relative_path: ${record?.id}`);
  return {
    path: `${PACKAGE_RELATIVE}/${packagePath}`,
    width: candidate.width,
    height: candidate.height,
    bytes: candidate.bytes,
    sha256: candidate.sha256,
  };
}

async function validateCanonicalPhysicalStates(canonical) {
  if (canonical.schema !== CANONICAL_SCHEMA || canonical.status !== "PASS") {
    throw new Error("Canonical render manifest is not a PASS authority");
  }
  const power = canonical.power_on_authority ?? {};
  if (power.count !== 7 || !valuesEqual(power.exact_ids, POWER_STATE_IDS) || !Array.isArray(power.records) || power.records.length !== 7) {
    throw new Error("Canonical power-on authority does not contain the exact seven states");
  }
  const powerStates = [];
  for (let index = 0; index < POWER_STATE_IDS.length; index += 1) {
    const record = power.records[index];
    if (record.id !== POWER_STATE_IDS[index]) throw new Error(`Canonical power state order changed at ${POWER_STATE_IDS[index]}`);
    const authority = canonicalFileRecord(record);
    powerStates.push({ id: record.id, order: index + 1, owner: "Blender physical CRT", capture: await validatePngRecord(authority, authority.path, `power state ${record.id}`) });
  }

  const portal = canonical.portal_transition_authority ?? {};
  if (portal.count !== 8 || !valuesEqual(portal.exact_ids, PORTAL_STATE_IDS) || !Array.isArray(portal.records) || portal.records.length !== 8) {
    throw new Error("Canonical portal authority does not contain the exact eight state slots");
  }
  const physicalPortalStates = [];
  for (let index = 0; index < 6; index += 1) {
    const record = portal.records[index];
    if (record.id !== PORTAL_STATE_IDS[index]) throw new Error(`Canonical portal state order changed at ${PORTAL_STATE_IDS[index]}`);
    const authority = canonicalFileRecord(record);
    physicalPortalStates.push({ id: record.id, order: index + 1, owner: "Blender physical CRT", capture: await validatePngRecord(authority, authority.path, `portal state ${record.id}`) });
  }
  return { powerStates, physicalPortalStates };
}

function semanticPortalState(id, order, portalCapture, source, matrixRecord) {
  return {
    id,
    order,
    owner: OWNER,
    status: "PASS",
    case_id: PORTAL_CASE_ID,
    source_id: source.id,
    source_sha256: source.sha256,
    matrix_sha256: matrixRecord.sha256,
    capture: captureAuthority(portalCapture),
  };
}

async function patchCanonicalBrowserStates(canonical, portalCapture, source, matrixRecord) {
  const updated = structuredClone(canonical);
  updated.portal_transition_authority.records[6] = semanticPortalState(PORTAL_STATE_IDS[6], 7, portalCapture, source, matrixRecord);
  updated.portal_transition_authority.records[7] = semanticPortalState(PORTAL_STATE_IDS[7], 8, portalCapture, source, matrixRecord);
  updated.portal_transition_authority.physical_state_count = 6;
  updated.portal_transition_authority.browser_state_count = 2;
  updated.portal_transition_authority.status = "PASS";
  updated.portal_transition_authority.browser_matrix = matrixRecord;
  await atomicWriteJson(CANONICAL_RELATIVE, updated);
  return updated;
}

async function patchPortalStateAuthority(canonicalAuthority, physicalPortalStates, semanticPortalStates, matrixRecord) {
  const authority = await readJson(PORTAL_STATE_RELATIVE);
  if (
    authority.schema !== PORTAL_STATE_SCHEMA ||
    authority.count !== 8 ||
    !valuesEqual(authority.exact_ids, PORTAL_STATE_IDS) ||
    !Array.isArray(authority.records) ||
    authority.records.length !== 8
  ) {
    throw new Error("Portal transition state authority does not preserve the exact eight-state structure");
  }
  for (let index = 0; index < 6; index += 1) {
    const record = authority.records[index];
    const expected = physicalPortalStates[index];
    const rendered = canonicalFileRecord(record);
    if (record.id !== expected.id || record.order !== index + 1 || rendered.path !== expected.capture.path || rendered.sha256 !== expected.capture.sha256) {
      throw new Error(`Portal transition physical state changed: ${expected.id}`);
    }
  }
  const updated = structuredClone(authority);
  updated.status = "PASS";
  updated.canonical_inventory = {
    package_relative_path: "manifests/crt-canonical-render-manifest.json",
    bytes: canonicalAuthority.bytes,
    sha256: canonicalAuthority.sha256,
  };
  updated.records[6] = semanticPortalStates[0];
  updated.records[7] = semanticPortalStates[1];
  updated.physical_state_count = 6;
  updated.browser_state_count = 2;
  updated.browser_matrix = matrixRecord;
  await atomicWriteJson(PORTAL_STATE_RELATIVE, updated);
  return { json: updated, authority: { ...(await fileRecord(PORTAL_STATE_RELATIVE)), schema: PORTAL_STATE_SCHEMA } };
}

async function patchPowerStateAuthority(canonicalAuthority, powerStates) {
  const authority = await readJson(POWER_STATE_RELATIVE);
  if (
    authority.schema !== POWER_STATE_SCHEMA ||
    !["FROZEN", "PASS"].includes(authority.status) ||
    authority.count !== 7 ||
    !valuesEqual(authority.exact_ids, POWER_STATE_IDS) ||
    !Array.isArray(authority.records) ||
    authority.records.length !== 7
  ) {
    throw new Error("Power-on state authority does not preserve the exact seven-state structure");
  }
  for (let index = 0; index < 7; index += 1) {
    const record = authority.records[index];
    const expected = powerStates[index];
    const rendered = canonicalFileRecord(record);
    if (record.id !== expected.id || rendered.path !== expected.capture.path || rendered.sha256 !== expected.capture.sha256) {
      throw new Error(`Power-on physical state changed: ${expected.id}`);
    }
  }
  const updated = structuredClone(authority);
  updated.canonical_inventory = {
    package_relative_path: "manifests/crt-canonical-render-manifest.json",
    bytes: canonicalAuthority.bytes,
    sha256: canonicalAuthority.sha256,
  };
  await atomicWriteJson(POWER_STATE_RELATIVE, updated);
  return { json: updated, authority: { ...(await fileRecord(POWER_STATE_RELATIVE)), schema: POWER_STATE_SCHEMA } };
}

async function patchCreativeCompositionAuthorities(canonicalAuthority, powerStateAuthority) {
  const manifest = await readJson(CREATIVE_COMPOSITION_RELATIVE);
  if (manifest.schema !== CREATIVE_COMPOSITION_SCHEMA || !Array.isArray(manifest.sheets) || manifest.sheets.length !== 8) {
    throw new Error("Creative review-composition manifest does not preserve sheets 2 through 9");
  }
  const updated = structuredClone(manifest);
  updated.canonical_render_authority = {
    package_relative_path: "manifests/crt-canonical-render-manifest.json",
    bytes: canonicalAuthority.bytes,
    sha256: canonicalAuthority.sha256,
  };
  updated.power_state_authority = {
    package_relative_path: "manifests/crt-power-on-state-authority.json",
    bytes: powerStateAuthority.bytes,
    sha256: powerStateAuthority.sha256,
  };
  await atomicWriteJson(CREATIVE_COMPOSITION_RELATIVE, updated);
  return { json: updated, authority: { ...(await fileRecord(CREATIVE_COMPOSITION_RELATIVE)), schema: CREATIVE_COMPOSITION_SCHEMA } };
}

function portalStateRecordsCrossBind(portalState, canonical) {
  if (
    portalState?.schema !== PORTAL_STATE_SCHEMA ||
    portalState?.status !== "PASS" ||
    !valuesEqual(portalState?.exact_ids, PORTAL_STATE_IDS) ||
    !Array.isArray(portalState?.records) ||
    portalState.records.length !== 8
  ) return false;
  for (let index = 0; index < 6; index += 1) {
    const left = canonicalFileRecord(portalState.records[index]);
    const right = canonicalFileRecord(canonical.portal_transition_authority.records[index]);
    if (portalState.records[index].id !== PORTAL_STATE_IDS[index] || portalState.records[index].order !== index + 1 || !valuesEqual(left, right)) return false;
  }
  return valuesEqual(portalState.records[6], canonical.portal_transition_authority.records[6]) && valuesEqual(portalState.records[7], canonical.portal_transition_authority.records[7]);
}

function buildSheetLineage(plan, matrixData, physicalPortalStates, semanticPortalStates, outputs = null) {
  const outputByIndex = new Map((outputs ?? []).map((record) => [record.reviewIndex, record]));
  const portalStates = [...physicalPortalStates, ...semanticPortalStates];
  const sheets = [{
    reviewIndex: 10,
    filename: "crt-portal-transition-sheet.png",
    output: outputByIndex.get(10)?.output ?? null,
    stateIds: PORTAL_STATE_IDS,
    states: portalStates,
    status: outputByIndex.has(10) ? "PASS" : "awaiting-browser-review-composition",
  }];
  for (const planned of plan.browserDerivedReviewSheets ?? []) {
    const sources = planned.sourceCaseIds.map((caseId) => {
      const capture = matrixData.cases.get(caseId)?.capture;
      if (!capture?.path) throw new Error(`Review sheet source is not normalized: ${planned.filename} -> ${caseId}`);
      return { captureId: caseId, ...captureAuthority(capture) };
    });
    sheets.push({
      reviewIndex: planned.reviewIndex,
      filename: planned.filename,
      output: outputByIndex.get(planned.reviewIndex)?.output ?? null,
      sourceCaseIds: planned.sourceCaseIds,
      sources,
      additionalAuthorities: planned.additionalAuthorities ?? [],
      status: outputByIndex.has(planned.reviewIndex) ? "PASS" : "awaiting-browser-review-composition",
    });
  }
  return sheets;
}

async function materialAuthority() {
  const material = await readJson(MATERIAL_RELATIVE);
  if (material.schema !== MATERIAL_SCHEMA || material.status !== "PASS") throw new Error("Material/asset manifest is not a PASS authority");
  if (material.procedural_only !== true || material.external_texture_count !== 0 || material.external_model_count !== 0) {
    throw new Error("Material/asset manifest does not prove procedural-only, zero-external-texture/model production");
  }
  return { ...(await fileRecord(MATERIAL_RELATIVE)), schema: MATERIAL_SCHEMA };
}

async function validateComposition(plan, matrixData, expectedSheets, portalStateAuthority) {
  const composition = await readJson(COMPOSITION_RELATIVE);
  if (composition.schema !== COMPOSITION_SCHEMA || composition.status !== "PASS") {
    throw new Error("Browser review composition manifest is not a PASS authority");
  }
  const matrixBinding = composition.browser_matrix ?? composition.matrix;
  if (
    matrixBinding?.path !== MATRIX_RELATIVE ||
    matrixBinding?.schema !== MATRIX_SCHEMA ||
    matrixBinding?.bytes !== matrixData.record.bytes ||
    matrixBinding?.sha256 !== matrixData.record.sha256 ||
    matrixBinding?.cases_total !== 46 ||
    matrixBinding?.normalized_capture_count !== 36
  ) {
    throw new Error("Browser review composition manifest does not bind the exact normalized 46/36 matrix");
  }
  const portalBinding = composition.portal_state_authority ?? composition.portalStateAuthority;
  if (
    portalBinding?.path !== PORTAL_STATE_RELATIVE ||
    portalBinding?.schema !== PORTAL_STATE_SCHEMA ||
    portalBinding?.bytes !== portalStateAuthority.bytes ||
    portalBinding?.sha256 !== portalStateAuthority.sha256
  ) {
    throw new Error("Browser review composition manifest does not bind the final eight-state portal authority");
  }
  const records = composition.records ?? [];
  if (records.length !== REVIEW_OUTPUTS.length) throw new Error(`Browser review manifest has ${records.length}/7 exact outputs`);
  const outputs = [];
  for (const [reviewIndex, filename] of REVIEW_OUTPUTS) {
    const record = records.find((entry) => entry.reviewIndex === reviewIndex || entry.filename === filename || String(entry.path ?? "").endsWith(`/${filename}`));
    if (!record) throw new Error(`Browser review output is missing: ${filename}`);
    const repositoryPath = `${PACKAGE_RELATIVE}/${filename}`;
    const authority = {
      path: repositoryPath,
      width: record.width,
      height: record.height,
      bytes: record.bytes,
      sha256: record.sha256,
    };
    const output = await validatePngRecord(authority, repositoryPath, `browser review output ${filename}`);
    const expected = expectedSheets.find((sheet) => sheet.reviewIndex === reviewIndex);
    if (reviewIndex === 10) {
      if (!valuesEqual(record.stateIds, PORTAL_STATE_IDS)) throw new Error("Portal transition sheet does not bind the exact eight state IDs");
      const stateIds = (record.sources ?? []).map((source) => source.stateId);
      if (!valuesEqual(stateIds, PORTAL_STATE_IDS)) throw new Error("Portal transition sheet source order is not the exact eight-state sequence");
      for (const source of record.sources ?? []) {
        const expectedState = expected.states.find((state) => state.id === source.stateId);
        const expectedCapture = expectedState?.capture;
        if (
          !expectedCapture || source.path !== expectedCapture.path || source.bytes !== expectedCapture.bytes ||
          source.sha256 !== expectedCapture.sha256 || source.width !== expectedCapture.width || source.height !== expectedCapture.height
        ) {
          throw new Error(`Portal transition sheet source lineage mismatch: ${source.stateId}`);
        }
      }
    } else {
      if (!valuesEqual(record.sourceCaseIds, expected.sourceCaseIds)) throw new Error(`Browser review case IDs changed: ${filename}`);
      const captureIds = (record.sources ?? []).map((source) => source.captureId);
      if (!valuesEqual(captureIds, expected.sourceCaseIds)) throw new Error(`Browser review source order changed: ${filename}`);
      for (const source of record.sources ?? []) {
        const expectedCapture = expected.sources.find((capture) => capture.captureId === source.captureId);
        if (
          !expectedCapture || source.path !== expectedCapture.path || source.bytes !== expectedCapture.bytes ||
          source.sha256 !== expectedCapture.sha256 || source.width !== expectedCapture.width || source.height !== expectedCapture.height
        ) {
          throw new Error(`Browser review source lineage mismatch: ${filename} -> ${source.captureId}`);
        }
      }
    }
    outputs.push({ reviewIndex, filename, output });
  }
  return { json: composition, outputs, authority: { ...(await fileRecord(COMPOSITION_RELATIVE)), schema: COMPOSITION_SCHEMA } };
}

function buildBrowserEvidence({ status, snapshot, matrixData, plan, canonicalAuthority, powerStateAuthority, portalStateAuthority, creativeCompositionAuthority, material, powerStates, physicalPortalStates, semanticPortalStates, sheets, composition }) {
  return {
    schema: EVIDENCE_SCHEMA,
    status,
    generatedAt: matrixData.json.generatedAt,
    authorityPolicy: "one-way ready-plan snapshot -> normalized matrix -> browser evidence -> immutable complete-plan pointers; no circular hash dependency",
    capturePlanAuthority: snapshot,
    matrix: matrixData.record,
    contract: plan.contractAuthority,
    keepout: plan.sceneFreeze.keepoutAuthority,
    sceneSources: plan.sceneFreeze.sources,
    canonicalRenderManifest: canonicalAuthority,
    powerOnStateAuthority: powerStateAuthority,
    portalTransitionStateAuthority: portalStateAuthority,
    creativeReviewCompositionManifest: creativeCompositionAuthority,
    materialAndAssetManifest: material,
    browserReviewCompositionManifest: composition,
    powerOnSheet: {
      reviewIndex: 9,
      filename: "crt-power-on-contact-sheet.png",
      stateIds: POWER_STATE_IDS,
      states: powerStates,
    },
    portalTransitionSheet: {
      reviewIndex: 10,
      filename: "crt-portal-transition-sheet.png",
      stateIds: PORTAL_STATE_IDS,
      physicalStateCount: 6,
      browserStateCount: 2,
      states: [...physicalPortalStates, ...semanticPortalStates],
    },
    browserGovernedReviewSheets: sheets,
    completion: {
      caseCount: 46,
      normalizedCaptureCount: 36,
      exactPowerStateCount: 7,
      exactPortalStateCount: 8,
      browserReviewSheetCount: 7,
      outputsBound: status === "PASS" ? 7 : 0,
    },
  };
}

async function loadBaseAuthority(plan, planBytes, snapshotBytes = null) {
  if (plan.schema !== PLAN_SCHEMA) throw new Error(`Unexpected capture plan schema: ${plan.schema}`);
  if (plan.sceneFreeze?.status !== "frozen" || plan.sceneFreeze?.captureAllowed !== true) {
    throw new Error("Phase 0.4 browser evidence remains blocked until the six-source/keepout authority is frozen and released");
  }
  const matrixData = await validateMatrix(plan, planBytes, snapshotBytes);
  const portalRecord = matrixData.cases.get(PORTAL_CASE_ID);
  if (!portalRecord?.capture?.path) throw new Error(`${PORTAL_CASE_ID} is not a normalized capture authority`);
  const textFreeSource = (plan.sceneFreeze.sources ?? []).find((source) => source.id === TEXT_FREE_SOURCE_ID);
  if (!textFreeSource?.sha256) throw new Error(`Frozen source is missing: ${TEXT_FREE_SOURCE_ID}`);
  if (portalRecord.report?.assets?.sceneId !== TEXT_FREE_SOURCE_ID || portalRecord.report?.assets?.sceneSha256 !== textFreeSource.sha256) {
    throw new Error("Semantic portal capture does not use the frozen text-free takeover source");
  }
  const checkpoint = await readJson(CHECKPOINT_RELATIVE);
  if (checkpoint.schema !== CHECKPOINT_SCHEMA || checkpoint.status !== "complete-local-authority-normalized") {
    throw new Error("Repository-native checkpoint is not sealed as complete-local-authority-normalized");
  }
  if (checkpoint.matrix?.sha256 !== matrixData.record.sha256 || checkpoint.matrix?.cases !== 46 || checkpoint.matrix?.captures !== 36 || checkpoint.matrix?.normalized !== true) {
    throw new Error("Checkpoint does not bind the exact normalized 46/36 matrix");
  }
  return { matrixData, portalRecord, textFreeSource };
}

async function prepare() {
  const planBytes = await readFile(repoPath(PLAN_RELATIVE));
  const plan = JSON.parse(planBytes.toString("utf8"));
  if (plan.sceneFreeze?.matrixStatus !== "ready-for-capture") {
    throw new Error("--prepare requires sceneFreeze.matrixStatus=ready-for-capture");
  }
  const base = await loadBaseAuthority(plan, planBytes);
  if (await exists(SNAPSHOT_RELATIVE)) {
    const existing = await readFile(repoPath(SNAPSHOT_RELATIVE));
    if (!existing.equals(planBytes)) throw new Error("Existing capture-plan snapshot differs from the matrix-bound ready plan");
  } else {
    await atomicWrite(SNAPSHOT_RELATIVE, planBytes);
  }
  const snapshot = { path: SNAPSHOT_RELATIVE, originalAuthorityPath: PLAN_RELATIVE, schema: PLAN_SCHEMA, bytes: planBytes.length, sha256: sha256Bytes(planBytes) };

  let canonical = await readJson(CANONICAL_RELATIVE);
  const physical = await validateCanonicalPhysicalStates(canonical);
  canonical = await patchCanonicalBrowserStates(canonical, base.portalRecord.capture, base.textFreeSource, base.matrixData.record);
  const canonicalAuthority = { ...(await fileRecord(CANONICAL_RELATIVE)), schema: CANONICAL_SCHEMA };
  const semanticPortalStates = canonical.portal_transition_authority.records.slice(6, 8).map((record) => ({ ...record }));
  const powerState = await patchPowerStateAuthority(canonicalAuthority, physical.powerStates);
  const creativeComposition = await patchCreativeCompositionAuthorities(canonicalAuthority, powerState.authority);
  const portalState = await patchPortalStateAuthority(canonicalAuthority, physical.physicalPortalStates, semanticPortalStates, base.matrixData.record);
  const sheets = buildSheetLineage(plan, base.matrixData, physical.physicalPortalStates, semanticPortalStates);
  const evidence = buildBrowserEvidence({
    status: "READY_FOR_REVIEW_COMPOSITION",
    snapshot,
    matrixData: base.matrixData,
    plan,
    canonicalAuthority,
    powerStateAuthority: powerState.authority,
    portalStateAuthority: portalState.authority,
    creativeCompositionAuthority: creativeComposition.authority,
    material: null,
    powerStates: physical.powerStates,
    physicalPortalStates: physical.physicalPortalStates,
    semanticPortalStates,
    sheets,
    composition: null,
  });
  await atomicWriteJson(BROWSER_EVIDENCE_RELATIVE, evidence);
  console.log(`Prepared Phase 0.4 browser evidence from matrix ${base.matrixData.record.sha256}.`);
  console.log(`Review composition input: ${BROWSER_EVIDENCE_RELATIVE}`);
  console.log("Capture plan remains ready-for-capture until seven browser-governed review sheets and the material manifest pass.");
}

async function complete() {
  const planBytes = await readFile(repoPath(PLAN_RELATIVE));
  const plan = JSON.parse(planBytes.toString("utf8"));
  if (plan.sceneFreeze?.matrixStatus !== "ready-for-capture") {
    throw new Error("--complete requires the still-unmodified ready-for-capture plan; use --check after completion");
  }
  const snapshotBytes = await readFile(repoPath(SNAPSHOT_RELATIVE));
  if (!snapshotBytes.equals(planBytes)) throw new Error("Current ready plan differs from the preserved matrix-bound snapshot");
  const snapshot = { path: SNAPSHOT_RELATIVE, originalAuthorityPath: PLAN_RELATIVE, schema: PLAN_SCHEMA, bytes: snapshotBytes.length, sha256: sha256Bytes(snapshotBytes) };
  const base = await loadBaseAuthority(plan, planBytes, snapshotBytes);
  const canonical = await readJson(CANONICAL_RELATIVE);
  const physical = await validateCanonicalPhysicalStates(canonical);
  const semanticPortalStates = canonical.portal_transition_authority.records.slice(6, 8);
  for (let index = 0; index < semanticPortalStates.length; index += 1) {
    const expected = semanticPortalState(PORTAL_STATE_IDS[index + 6], index + 7, base.portalRecord.capture, base.textFreeSource, base.matrixData.record);
    if (!valuesEqual(semanticPortalStates[index], expected)) throw new Error(`Canonical semantic portal state lineage changed: ${expected.id}`);
  }
  const canonicalAuthority = { ...(await fileRecord(CANONICAL_RELATIVE)), schema: CANONICAL_SCHEMA };
  const powerStateAuthority = { ...(await fileRecord(POWER_STATE_RELATIVE)), schema: POWER_STATE_SCHEMA };
  const powerState = await readJson(POWER_STATE_RELATIVE);
  if (powerState.canonical_inventory?.bytes !== canonicalAuthority.bytes || powerState.canonical_inventory?.sha256 !== canonicalAuthority.sha256) {
    throw new Error("Power-on state authority does not bind the patched canonical manifest");
  }
  const portalStateAuthority = { ...(await fileRecord(PORTAL_STATE_RELATIVE)), schema: PORTAL_STATE_SCHEMA };
  const portalState = await readJson(PORTAL_STATE_RELATIVE);
  if (!portalStateRecordsCrossBind(portalState, canonical)) {
    throw new Error("Final portal transition authority does not cross-bind the canonical eight-state sequence");
  }
  if (portalState.canonical_inventory?.bytes !== canonicalAuthority.bytes || portalState.canonical_inventory?.sha256 !== canonicalAuthority.sha256) {
    throw new Error("Final portal transition authority does not bind the patched canonical manifest");
  }
  const creativeCompositionAuthority = { ...(await fileRecord(CREATIVE_COMPOSITION_RELATIVE)), schema: CREATIVE_COMPOSITION_SCHEMA };
  const creativeComposition = await readJson(CREATIVE_COMPOSITION_RELATIVE);
  if (
    creativeComposition.canonical_render_authority?.bytes !== canonicalAuthority.bytes ||
    creativeComposition.canonical_render_authority?.sha256 !== canonicalAuthority.sha256 ||
    creativeComposition.power_state_authority?.bytes !== powerStateAuthority.bytes ||
    creativeComposition.power_state_authority?.sha256 !== powerStateAuthority.sha256
  ) {
    throw new Error("Creative sheets 2-9 manifest does not bind the patched canonical/power authorities");
  }
  const material = await materialAuthority();
  const pendingSheets = buildSheetLineage(plan, base.matrixData, physical.physicalPortalStates, semanticPortalStates);
  const composition = await validateComposition(plan, base.matrixData, pendingSheets, portalStateAuthority);
  const sheets = buildSheetLineage(plan, base.matrixData, physical.physicalPortalStates, semanticPortalStates, composition.outputs);
  const evidence = buildBrowserEvidence({
    status: "PASS",
    snapshot,
    matrixData: base.matrixData,
    plan,
    canonicalAuthority,
    powerStateAuthority,
    portalStateAuthority,
    creativeCompositionAuthority,
    material,
    powerStates: physical.powerStates,
    physicalPortalStates: physical.physicalPortalStates,
    semanticPortalStates,
    sheets,
    composition: composition.authority,
  });
  await atomicWriteJson(BROWSER_EVIDENCE_RELATIVE, evidence);
  const evidenceAuthority = { ...(await fileRecord(BROWSER_EVIDENCE_RELATIVE)), schema: EVIDENCE_SCHEMA };

  const completePlan = structuredClone(plan);
  completePlan.status = "complete local browser authority; human creative acceptance pending";
  completePlan.harnessStatus = "frozen capture-authoritative harness; 46-case matrix and 36 normalized captures complete";
  completePlan.sceneFreeze.matrixStatus = "complete";
  completePlan.finalMatrix = { ...base.matrixData.record, status: "complete-local-authority-normalized", caseCount: 46, normalizedCaptureCount: 36 };
  completePlan.captureAuthoritySnapshot = snapshot;
  completePlan.completionAuthority = evidenceAuthority;
  completePlan.browserReviewCompositionAuthority = composition.authority;
  completePlan.creativeReviewCompositionAuthority = creativeCompositionAuthority;
  completePlan.powerOnStateAuthority = powerStateAuthority;
  completePlan.portalTransitionStateAuthority = portalStateAuthority;
  completePlan.materialAndAssetAuthority = material;
  await atomicWriteJson(PLAN_RELATIVE, completePlan);
  console.log(`Completed Phase 0.4 browser evidence authority: ${evidenceAuthority.sha256}`);
  console.log(`Normalized matrix authority: ${base.matrixData.record.sha256}`);
}

async function checkComplete() {
  const planBytes = await readFile(repoPath(PLAN_RELATIVE));
  const plan = JSON.parse(planBytes.toString("utf8"));
  if (plan.sceneFreeze?.matrixStatus !== "complete") throw new Error("--check requires sceneFreeze.matrixStatus=complete");
  const snapshotBytes = await readFile(repoPath(SNAPSHOT_RELATIVE));
  const snapshot = { path: SNAPSHOT_RELATIVE, originalAuthorityPath: PLAN_RELATIVE, schema: PLAN_SCHEMA, bytes: snapshotBytes.length, sha256: sha256Bytes(snapshotBytes) };
  const base = await loadBaseAuthority(plan, planBytes, snapshotBytes);
  const canonical = await readJson(CANONICAL_RELATIVE);
  const physical = await validateCanonicalPhysicalStates(canonical);
  const semanticPortalStates = canonical.portal_transition_authority.records.slice(6, 8);
  const powerStateAuthority = { ...(await fileRecord(POWER_STATE_RELATIVE)), schema: POWER_STATE_SCHEMA };
  const powerState = await readJson(POWER_STATE_RELATIVE);
  if (powerState.canonical_inventory?.bytes !== (await stat(repoPath(CANONICAL_RELATIVE))).size || powerState.canonical_inventory?.sha256 !== (await fileRecord(CANONICAL_RELATIVE)).sha256) {
    throw new Error("Power-on state authority does not bind the patched canonical manifest");
  }
  const portalStateAuthority = { ...(await fileRecord(PORTAL_STATE_RELATIVE)), schema: PORTAL_STATE_SCHEMA };
  const portalState = await readJson(PORTAL_STATE_RELATIVE);
  if (!portalStateRecordsCrossBind(portalState, canonical)) {
    throw new Error("Final portal transition authority does not cross-bind the canonical eight-state sequence");
  }
  const creativeCompositionAuthority = { ...(await fileRecord(CREATIVE_COMPOSITION_RELATIVE)), schema: CREATIVE_COMPOSITION_SCHEMA };
  const creativeComposition = await readJson(CREATIVE_COMPOSITION_RELATIVE);
  if (
    creativeComposition.canonical_render_authority?.sha256 !== (await fileRecord(CANONICAL_RELATIVE)).sha256 ||
    creativeComposition.power_state_authority?.sha256 !== powerStateAuthority.sha256
  ) {
    throw new Error("Creative sheets 2-9 manifest does not bind the patched canonical/power authorities");
  }
  const material = await materialAuthority();
  const pendingSheets = buildSheetLineage(plan, base.matrixData, physical.physicalPortalStates, semanticPortalStates);
  const composition = await validateComposition(plan, base.matrixData, pendingSheets, portalStateAuthority);
  const evidenceBytes = await readFile(repoPath(BROWSER_EVIDENCE_RELATIVE));
  const evidence = JSON.parse(evidenceBytes.toString("utf8"));
  if (evidence.schema !== EVIDENCE_SCHEMA || evidence.status !== "PASS") throw new Error("Browser evidence manifest is not PASS");
  if (evidence.capturePlanAuthority?.sha256 !== snapshot.sha256 || evidence.matrix?.sha256 !== base.matrixData.record.sha256) {
    throw new Error("Browser evidence snapshot/matrix lineage mismatch");
  }
  if (plan.finalMatrix?.sha256 !== base.matrixData.record.sha256 || plan.finalMatrix?.normalizedCaptureCount !== 36) {
    throw new Error("Complete plan does not bind the exact normalized matrix");
  }
  if (plan.captureAuthoritySnapshot?.sha256 !== snapshot.sha256) throw new Error("Complete plan snapshot authority mismatch");
  if (plan.completionAuthority?.sha256 !== sha256Bytes(evidenceBytes)) throw new Error("Complete plan browser-evidence authority mismatch");
  if (plan.browserReviewCompositionAuthority?.sha256 !== composition.authority.sha256) throw new Error("Complete plan browser-composition authority mismatch");
  if (plan.powerOnStateAuthority?.sha256 !== powerStateAuthority.sha256) throw new Error("Complete plan power-state authority mismatch");
  if (plan.portalTransitionStateAuthority?.sha256 !== portalStateAuthority.sha256) throw new Error("Complete plan portal-state authority mismatch");
  if (plan.creativeReviewCompositionAuthority?.sha256 !== creativeCompositionAuthority.sha256) throw new Error("Complete plan creative-composition authority mismatch");
  if (plan.materialAndAssetAuthority?.sha256 !== material.sha256) throw new Error("Complete plan material authority mismatch");
  console.log(`Phase 0.4 browser evidence complete: 46/46 cases, 36/36 normalized captures, matrix ${base.matrixData.record.sha256}.`);
}

function usage() {
  console.log("Usage: node scripts/finalize-phase04-browser-evidence.mjs --prepare|--complete|--check");
  console.log("  --prepare   snapshot the matrix-bound ready plan, bind portal states 7-8, and emit composition inputs");
  console.log("  --complete  require sheets 10-16 plus material/composition authorities, then mark the plan complete");
  console.log("  --check     validate the immutable completed authority without writing");
}

const modes = process.argv.slice(2).filter((argument) => ["--prepare", "--complete", "--check"].includes(argument));
if (process.argv.includes("--help")) {
  usage();
} else if (modes.length !== 1) {
  usage();
  process.exitCode = 2;
} else {
  try {
    if (modes[0] === "--prepare") await prepare();
    else if (modes[0] === "--complete") await complete();
    else await checkComplete();
  } catch (error) {
    console.error(`Phase 0.4 browser evidence finalizer stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
