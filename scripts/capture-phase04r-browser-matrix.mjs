#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { basename, delimiter, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLAN_RELATIVE = "prototypes/phase-0-4r-crt-portal-qa/capture-plan.json";
const EVIDENCE_RELATIVE = "artifacts/evidence/phase-0-4r-crt-television";
const CHECKPOINT_RELATIVE = `${EVIDENCE_RELATIVE}/capture-checkpoint.json`;
const MATRIX_RELATIVE = `${EVIDENCE_RELATIVE}/browser-matrix-report.json`;
const REPORTS_RELATIVE = `${EVIDENCE_RELATIVE}/reports`;
const RECOVERY_RELATIVE = `${EVIDENCE_RELATIVE}/recovery`;
const PORTAL_STATE_8_RAW_RELATIVE = `${EVIDENCE_RELATIVE}/portal-states/portal-08-full-semantic-surface.jpg`;
const PORTAL_STATE_8_REPORT_RELATIVE = `${EVIDENCE_RELATIVE}/portal-states/portal-08-full-semantic-surface.json`;
const PORTAL_BROWSER_AUTHORITY_RELATIVE = `${EVIDENCE_RELATIVE}/portal-states/portal-browser-state-authority.json`;

const PLAN_SCHEMA = "quantum-hub.phase-0-4r-crt-television.typography-capture-plan.v1";
const CHECKPOINT_SCHEMA = "quantum-hub.phase-0-4r-crt-television.capture-checkpoint.v1";
const CASE_REPORT_SCHEMA = "quantum-hub.phase-0-4r-crt-television.local-browser-case.v1";
const RECOVERY_SCHEMA = "quantum-hub.phase-0-4r-crt-television.capture-recovery.v1";
const MATRIX_SCHEMA = "quantum-hub.phase-0-4r-crt-television.typography-collision-matrix.v1";
const HARNESS_SCHEMA = "quantum-hub.phase-0-4r-crt-television.harness-authority.v1";
const PORTAL_STATE_CAPTURE_SCHEMA = "quantum-hub.phase-0-4r-crt-television.portal-state-browser-capture.v1";
const PORTAL_BROWSER_AUTHORITY_SCHEMA = "quantum-hub.phase-0-4r-crt-television.portal-browser-state-authority.v1";
const AUTHORITY = "repository-native-playwright";
const MAX_BATCH_SIZE = 10;
const SCREENSHOTS_PER_VISUAL_CASE = 11;
const MINIMUM_MODAL_VOTES = 7;
const MAX_MODAL_ROUNDS = 3;
const RUNNER_TIMEOUT_MS = 45_000;
const SCREENSHOT_QUALITY = 95;
const KEEP_OUT_LAYOUT_AUTHORITY_PATH = "crt-portal-layout.json";
const POST_BEZEL_TAKEOVER_SOURCE_ID = "source-text-free-portal-takeover";
const POST_BEZEL_GEOMETRY_IDS = Object.freeze(["crt-cabinet", "crt-screen", "spiral-cable"]);
const REQUIRED_REPAIR_SOURCE_IDS = Object.freeze([
  "source-desktop-dormant",
  "source-mobile-dormant",
  "source-reduced-desktop-dormant",
  "source-reduced-mobile-dormant",
  "source-physical-portal-close",
  "source-text-free-portal-takeover",
]);

const HARNESS_RELATIVES = Object.freeze([
  "prototypes/phase-0-4r-crt-portal-qa/index.html",
  "prototypes/phase-0-4-crt-portal-qa/styles.css",
  "prototypes/phase-0-4r-crt-portal-qa/repair.css",
  "prototypes/phase-0-4r-crt-portal-qa/app.js",
  "prototypes/phase-0-4r-crt-portal-qa/runner.html",
  "prototypes/phase-0-4-crt-portal-qa/runner.css",
  "prototypes/phase-0-4-crt-portal-qa/runner.js",
]);

const requireFromHere = createRequire(import.meta.url);

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

function repoRelative(absolutePath) {
  return relative(ROOT, absolutePath).split(sep).join("/");
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function sha256File(absolutePath) {
  return sha256Bytes(await readFile(absolutePath));
}

async function exists(absolutePath) {
  try {
    await access(absolutePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJson(absolutePath) {
  return JSON.parse(await readFile(absolutePath, "utf8"));
}

function portableJson(value) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  const posixUserRoots = ["Us" + "ers", "ho" + "me"];
  const privatePaths = [
    /(?:^|["'\s])[A-Za-z]:[\\/]/m,
    ...posixUserRoots.map((rootName) => new RegExp(`(?:^|["'\\s])/${rootName}/`)),
  ];
  if (privatePaths.some((pattern) => pattern.test(serialized))) {
    throw new Error("Refusing to write an evidence record containing an absolute private path");
  }
  return serialized;
}

async function atomicWrite(absolutePath, contents) {
  await mkdir(dirname(absolutePath), { recursive: true });
  const temporary = `${absolutePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, contents, { flag: "wx" });
  try {
    await rename(temporary, absolutePath);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function atomicWriteJson(absolutePath, value) {
  await atomicWrite(absolutePath, portableJson(value));
}

function parseArguments(argv) {
  const options = {
    batchSize: MAX_BATCH_SIZE,
    browserExecutable: null,
    caseIds: [],
    help: false,
    list: false,
    portalState8: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      index += 1;
      return value;
    };
    if (argument === "--batch-size") options.batchSize = Number.parseInt(next(), 10);
    else if (argument === "--browser-executable") options.browserExecutable = next();
    else if (argument === "--case") options.caseIds.push(next());
    else if (argument === "--portal-state-8") options.portalState8 = true;
    else if (argument === "--list") options.list = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > MAX_BATCH_SIZE) {
    throw new Error(`--batch-size must be an integer from 1 through ${MAX_BATCH_SIZE}`);
  }
  if (options.portalState8 && (options.caseIds.length > 0 || options.list)) {
    throw new Error("--portal-state-8 cannot be combined with --case or --list");
  }
  return options;
}

function printHelp() {
  console.log(`Phase 0.4R repository-native CRT portal browser capture

Usage:
  node scripts/capture-phase04r-browser-matrix.mjs [options]

Options:
  --batch-size N              Process at most N pending cases (1-${MAX_BATCH_SIZE})
  --case CASE_ID              Process one planned case; repeat for more cases
  --portal-state-8            Capture the distinct full-semantic portal state after the normalized 46/36 matrix
  --browser-executable PATH   Use an existing Chromium-family executable
  --list                      Print the 46-case plan without capture or checkpoint writes
  --help                      Show this help

Environment:
  NODE_PATH                   Existing package roots containing playwright/playwright-core
  PHASE04R_BROWSER_EXECUTABLE  Browser executable override; CLI takes precedence

The server must already be available at http://127.0.0.1:4173. Capture is hard-blocked until
the plan binds frozen CRT scene hashes and source-space cabinet/screen/cable keepouts.`);
}

function expandPlan(plan) {
  const viewports = new Map((plan.viewports ?? []).map((viewport) => [viewport.id, viewport]));
  const allIds = [...viewports.keys()];
  const expanded = [];
  for (const template of plan.caseTemplates ?? []) {
    const viewportIds = template.viewportIds === "all" ? allIds : template.viewportIds ?? [];
    const captureIds = new Set(template.captureViewportIds === "all" ? allIds : template.captureViewportIds ?? []);
    for (const viewportId of viewportIds) {
      const viewport = viewports.get(viewportId);
      if (!viewport) throw new Error(`Unknown viewport ${viewportId} in ${template.idPrefix}`);
      expanded.push({
        id: `${template.idPrefix}--${viewportId}`,
        idPrefix: template.idPrefix,
        viewportId,
        viewport,
        query: template.query,
        focusSelector: template.focusSelector ?? null,
        captureRequired: captureIds.has(viewportId),
      });
    }
  }
  if (new Set(expanded.map((entry) => entry.id)).size !== expanded.length) {
    throw new Error("Phase 0.4R plan expands to duplicate case IDs");
  }
  if (expanded.length !== 46) throw new Error(`Phase 0.4R plan must expand to 46 cases, observed ${expanded.length}`);
  const captures = expanded.filter((entry) => entry.captureRequired).length;
  if (captures !== 36) throw new Error(`Phase 0.4R plan must select 36 captures, observed ${captures}`);
  return expanded;
}

async function validateFileAuthority(authority, label) {
  if (!authority?.path || !/^[a-f0-9]{64}$/i.test(authority.sha256 ?? "")) {
    throw new Error(`${label} lacks a repository-relative path and SHA-256`);
  }
  const absolute = repoPath(authority.path);
  const metadata = await stat(absolute);
  const digest = await sha256File(absolute);
  if (digest !== String(authority.sha256).toLowerCase()) throw new Error(`${label} SHA-256 mismatch: ${authority.path}`);
  if (authority.bytes != null && metadata.size !== Number(authority.bytes)) {
    throw new Error(`${label} byte count mismatch: ${authority.path}`);
  }
  return { path: authority.path, bytes: metadata.size, sha256: digest };
}

function keepoutRecordMap(authority) {
  if (Array.isArray(authority?.records)) return new Map(authority.records.map((record) => [record.id, record]));
  if (authority?.records && typeof authority.records === "object") {
    return new Map(Object.entries(authority.records).map(([id, record]) => [id, { id, ...record }]));
  }
  return new Map();
}

function keepoutSource(record, id) {
  const source = record?.source ?? record ?? {};
  return {
    id: source.id ?? record?.id ?? id,
    role: record?.sourceRole ?? source.role ?? id,
    path: source.path ?? record?.path,
    bytes: Number(source.bytes ?? record?.bytes),
    sha256: source.sha256 ?? record?.sha256,
    width: Number(source.width ?? record?.width),
    height: Number(source.height ?? record?.height),
  };
}

function geometryPolygons(geometry) {
  let value = geometry?.normalizedPolygons ?? geometry?.normalized_polygons ?? geometry?.normalizedPolygon ?? geometry?.normalized_polygon;
  if (!Array.isArray(value) || value.length === 0) return [];
  const first = value[0];
  const firstLooksLikePoint =
    (Array.isArray(first) && typeof first[0] === "number") ||
    (first && typeof first === "object" && !Array.isArray(first) && "x" in first);
  if (firstLooksLikePoint) value = [value];
  return value.map((polygon) => polygon.map((point) => ({
    x: Number(Array.isArray(point) ? point[0] : point?.x),
    y: Number(Array.isArray(point) ? point[1] : point?.y),
  })));
}

function cableSegments(geometry) {
  const value =
    geometry?.normalizedSegmentRectangles ??
    geometry?.normalized_segment_rectangles ??
    geometry?.segmentRectanglesNormalized ??
    geometry?.segment_rectangles_normalized;
  if (!Array.isArray(value)) return [];
  return value.map((segment) => ({
    x: Number(segment?.x ?? segment?.[0]),
    y: Number(segment?.y ?? segment?.[1]),
    width: Number(segment?.width ?? segment?.[2]),
    height: Number(segment?.height ?? segment?.[3]),
  }));
}

function normalizedPolygonsAreValid(polygons) {
  return polygons.length > 0 && polygons.every((polygon) =>
    polygon.length >= 3 && polygon.every((point) =>
      Number.isFinite(point.x) && Number.isFinite(point.y) &&
      point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1));
}

function normalizedSegmentsAreValid(segments) {
  return segments.length > 0 && segments.every((segment) =>
    Number.isFinite(segment.x) && Number.isFinite(segment.y) &&
    Number.isFinite(segment.width) && Number.isFinite(segment.height) &&
    segment.x >= 0 && segment.y >= 0 && segment.width > 0 && segment.height > 0 &&
    segment.x + segment.width <= 1.000001 && segment.y + segment.height <= 1.000001);
}

function hiddenGeometryIsExplicit(geometry, geometryId) {
  const bounds = geometry?.pixelBounds ?? geometry?.pixel_bounds;
  const paddedBounds = geometry?.paddedBoundsPx ?? geometry?.padded_bounds_px;
  const projectedPointCount = geometry?.projectedPointCount ?? geometry?.projected_point_count;
  const visiblePointCount = geometry?.visiblePointCount ?? geometry?.visible_point_count;
  const projection = geometryId === "spiral-cable" ? cableSegments(geometry) : geometryPolygons(geometry);
  return (
    geometry?.visible === false &&
    geometry?.visibility === "out-of-frame/no-visible-geometry" &&
    bounds == null &&
    paddedBounds == null &&
    Number(projectedPointCount) === 0 &&
    Number(visiblePointCount) === 0 &&
    projection.length === 0
  );
}

function validateKeepoutGeometry(authority, sources, contractAuthority) {
  if (authority.schema !== "quantum-hub.phase-0-4-crt-television.scene-source-keepouts.v1") {
    throw new Error("Loaded CRT keepout authority schema mismatch");
  }
  if (authority.status !== "frozen" || authority.sourceStatus !== "accepted") {
    throw new Error("CRT keepout authority is not frozen/accepted");
  }
  const expectedSourceIds = sources.map((source) => source.id);
  if (JSON.stringify(authority.sourceRoles) !== JSON.stringify(expectedSourceIds) || Number(authority.recordCount) !== sources.length) {
    throw new Error("CRT keepout sourceRoles/recordCount differ from the exact six frozen source IDs");
  }
  const records = keepoutRecordMap(authority);
  if (records.size !== 6) throw new Error(`CRT keepout authority must contain six records, observed ${records.size}`);
  for (const source of sources) {
    const record = records.get(source.id);
    if (!record) throw new Error(`CRT keepout record is missing: ${source.id}`);
    const meta = keepoutSource(record, source.id);
    const nestedSource = record.source ?? {};
    const expectedPackagePath = source.path.replace(/^artifacts\/original\/phase-0-4-crt-television\//, "");
    if (
      meta.id !== source.id ||
      meta.role !== source.id ||
      meta.path !== source.path ||
      nestedSource.packageRelativePath !== expectedPackagePath ||
      typeof nestedSource.role !== "string" ||
      nestedSource.role.length === 0 ||
      meta.bytes !== source.bytes ||
      meta.sha256 !== source.sha256 ||
      meta.width !== source.width ||
      meta.height !== source.height
    ) {
      throw new Error(`CRT keepout source lineage mismatch: ${source.id}`);
    }
    const layout = record.layoutAuthority ?? record.layout_authority;
    if (
      layout?.path !== KEEP_OUT_LAYOUT_AUTHORITY_PATH ||
      layout?.bytes !== contractAuthority.bytes ||
      layout?.sha256 !== contractAuthority.sha256 ||
      layout?.schema !== "quantum-hub.phase-0-4-crt-television.crt-portal-layout.v1"
    ) {
      throw new Error(`CRT keepout layout-authority mismatch: ${source.id}`);
    }
    if (
      typeof record.roleLabel !== "string" || record.roleLabel.length === 0 ||
      typeof record.camera !== "string" || record.camera.length === 0 ||
      typeof record.cableVariant !== "string" || record.cableVariant.length === 0
    ) {
      throw new Error(`CRT keepout role/camera/cable metadata is incomplete: ${source.id}`);
    }
    const geometry = record.geometry ?? {};
    const postBezelPolicy = sources.find((item) => item.id === POST_BEZEL_TAKEOVER_SOURCE_ID);
    const isPostBezelSource = source.id === POST_BEZEL_TAKEOVER_SOURCE_ID && source.sha256 === postBezelPolicy?.sha256;
    for (const id of POST_BEZEL_GEOMETRY_IDS) {
      const item = geometry[id];
      const bounds = item?.pixelBounds ?? item?.pixel_bounds;
      const paddedBounds = item?.paddedBoundsPx ?? item?.padded_bounds_px;
      const padding = item?.paddingPx ?? item?.padding_px ?? item?.padding;
      const lineage = item?.sourceObjectLineage ?? item?.sourceObjects ?? item?.source_objects;
      const sharedMetadataValid = Boolean(item) && padding != null && Array.isArray(lineage) && lineage.length > 0;
      const projectionValid = isPostBezelSource
        ? hiddenGeometryIsExplicit(item, id)
        : item?.visible !== false && Number(bounds?.width) > 0 && Number(bounds?.height) > 0 && Number(paddedBounds?.width) > 0 && Number(paddedBounds?.height) > 0;
      if (!sharedMetadataValid || !projectionValid) {
        throw new Error(`CRT ${id} keepout metadata is incomplete: ${source.id}`);
      }
    }
    if (!isPostBezelSource && (!normalizedPolygonsAreValid(geometryPolygons(geometry["crt-cabinet"])) || !normalizedPolygonsAreValid(geometryPolygons(geometry["crt-screen"])))) {
      throw new Error(`CRT cabinet/screen normalized polygons are missing or invalid: ${source.id}`);
    }
    if (!isPostBezelSource && !normalizedSegmentsAreValid(cableSegments(geometry["spiral-cable"]))) {
      throw new Error(`CRT spiral-cable normalized segment rectangles are missing or invalid: ${source.id}`);
    }
  }
}

async function validateFrozenAuthority(plan, planBytes) {
  if (plan.schema !== PLAN_SCHEMA) throw new Error(`Unexpected Phase 0.4R plan schema: ${plan.schema}`);
  if (plan.repairPhase !== "Phase 0.4R" || plan.repairMode !== "additive-source-rebind") {
    throw new Error("CAPTURE BLOCKED: the active plan is not the additive Phase 0.4R source-rebind authority");
  }
  if (plan.status !== "ready-for-capture") {
    throw new Error(`CAPTURE BLOCKED: Phase 0.4R plan status is ${plan.status ?? "missing"}; expected ready-for-capture`);
  }
  const runner = new URL(plan.runnerUrl);
  if (runner.protocol !== "http:" || runner.hostname !== "127.0.0.1" || runner.port !== "4173") {
    throw new Error("Phase 0.4R capture must remain on http://127.0.0.1:4173");
  }
  if (
    plan.sceneFreeze?.status !== "frozen" ||
    plan.sceneFreeze?.matrixStatus !== "ready-for-capture" ||
    plan.sceneFreeze?.captureAllowed !== true
  ) {
    throw new Error(
      "CAPTURE BLOCKED: Phase 0.4R scenes are not frozen. Bind exact replacement desktop/mobile/reduced/portal source hashes and the regenerated source-space cabinet/screen/cable keepout authority before capture.",
    );
  }
  if (plan.capture?.stabilization?.successiveFullPageJpegsPerVisualCase !== SCREENSHOTS_PER_VISUAL_CASE) {
    throw new Error("Phase 0.4R plan must require 11 successive full-page JPEGs per visual case");
  }
  if (plan.capture?.stabilization?.minimumWinnerVotes !== MINIMUM_MODAL_VOTES) {
    throw new Error("Phase 0.4R plan must require a unique modal winner of at least 7/11");
  }
  if (!Array.isArray(plan.sceneFreeze.sources) || plan.sceneFreeze.sources.length !== REQUIRED_REPAIR_SOURCE_IDS.length) {
    throw new Error("Frozen Phase 0.4R plan must bind all six required scene-source roles");
  }
  if (
    JSON.stringify(plan.sceneFreeze.requiredFrozenSourceRoles) !== JSON.stringify(REQUIRED_REPAIR_SOURCE_IDS) ||
    JSON.stringify(plan.sceneFreeze.sources.map((source) => source.id)) !== JSON.stringify(REQUIRED_REPAIR_SOURCE_IDS)
  ) {
    throw new Error("Frozen Phase 0.4R source roles or order differ from the six-role repair authority");
  }
  if (!['frozen', 'accepted'].includes(plan.sceneFreeze.keepoutAuthority?.status)) {
    throw new Error("Frozen Phase 0.4R keepout authority lacks an explicit frozen/accepted state");
  }
  const contractBytes = await readFile(repoPath(plan.contractPath));
  const contract = JSON.parse(contractBytes.toString("utf8"));
  if (contract.schema !== "quantum-hub.phase-0-4-crt-television.crt-portal-layout.v1") {
    throw new Error("Phase 0.4 contract schema mismatch");
  }
  if (contract.captureGate?.status !== "blocked" || contract.captureGate?.captureBeforeFreezeAllowed !== false) {
    throw new Error("Immutable CRT layout contract no longer preserves its original pre-freeze capture boundary");
  }
  const contractAuthority = {
    path: plan.contractPath,
    bytes: contractBytes.length,
    sha256: sha256Bytes(contractBytes),
  };
  if (
    plan.contractAuthority?.path !== contractAuthority.path ||
    plan.contractAuthority?.bytes !== contractAuthority.bytes ||
    plan.contractAuthority?.sha256 !== contractAuthority.sha256
  ) {
    throw new Error("Capture plan does not bind the exact CRT portal contract bytes and SHA-256");
  }
  if (
    plan.sceneFreeze?.requiredKeepoutAuthority?.layoutAuthority?.path !== KEEP_OUT_LAYOUT_AUTHORITY_PATH ||
    plan.sceneFreeze?.requiredKeepoutAuthority?.layoutAuthority?.sha256 !== contractAuthority.sha256
  ) {
    throw new Error("Capture plan does not bind the package-relative keepout layout authority and exact contract SHA-256");
  }
  const keepoutAuthority = await validateFileAuthority(plan.sceneFreeze.keepoutAuthority, "CRT keepout authority");
  if (plan.sceneFreeze.keepoutAuthority.schema !== "quantum-hub.phase-0-4-crt-television.scene-source-keepouts.v1") {
    throw new Error("CRT keepout authority schema mismatch");
  }
  const sources = [];
  for (const [index, source] of plan.sceneFreeze.sources.entries()) {
    if (!(Number(source.width) > 0 && Number(source.height) > 0 && Number(source.bytes) > 0)) {
      throw new Error(`Frozen scene source ${index + 1} lacks width, height or bytes`);
    }
    if (!['frozen', 'accepted'].includes(source.status)) {
      throw new Error(`Frozen scene source ${index + 1} lacks an explicit frozen/accepted state`);
    }
    sources.push({
      ...(await validateFileAuthority(source, `CRT scene source ${index + 1}`)),
      id: source.id,
      role: source.role ?? source.id,
      width: Number(source.width),
      height: Number(source.height),
    });
  }
  const requiredRoles = plan.sceneFreeze.requiredFrozenSourceRoles ?? [];
  for (const role of requiredRoles) {
    if (!sources.some((source) => source.id === role)) throw new Error(`Frozen source role is missing: ${role}`);
  }
  for (const expected of plan.sceneFreeze.expectedSourceDescriptors ?? []) {
    const source = sources.find((item) => item.id === expected.id);
    if (
      !source ||
      source.path !== expected.path ||
      source.width !== Number(expected.width) ||
      source.height !== Number(expected.height)
    ) {
      throw new Error(`Frozen source differs from the authored descriptor: ${expected.id}`);
    }
  }
  const postBezelPolicy = plan.sceneFreeze.keepoutApplicability?.postBezelSemanticTakeover;
  const takeoverSource = sources.find((source) => source.id === POST_BEZEL_TAKEOVER_SOURCE_ID);
  if (
    !takeoverSource ||
    postBezelPolicy?.sourceId !== POST_BEZEL_TAKEOVER_SOURCE_ID ||
    postBezelPolicy?.sourceSha256 !== takeoverSource.sha256 ||
    postBezelPolicy?.collisionRequired !== false ||
    JSON.stringify(postBezelPolicy?.geometryIds) !== JSON.stringify(POST_BEZEL_GEOMETRY_IDS) ||
    !/post-bezel/i.test(postBezelPolicy?.reason ?? "")
  ) {
    throw new Error("Phase 0.4R plan does not bind the exact post-bezel hidden-geometry exception");
  }
  const keepoutJson = await readJson(repoPath(plan.sceneFreeze.keepoutAuthority.path));
  validateKeepoutGeometry(keepoutJson, sources, contractAuthority);
  return {
    plan: { path: PLAN_RELATIVE, bytes: planBytes.length, sha256: sha256Bytes(planBytes) },
    contract: contractAuthority,
    keepout: { ...keepoutAuthority, schema: plan.sceneFreeze.keepoutAuthority.schema },
    sources,
  };
}

async function validateHarnessAuthority() {
  const files = [];
  for (const relativePath of HARNESS_RELATIVES) {
    const bytes = await readFile(repoPath(relativePath));
    files.push({ path: relativePath, bytes: bytes.length, sha256: sha256Bytes(bytes) });
  }
  const aggregate = files.map((file) => `${file.path}\0${file.bytes}\0${file.sha256}`).join("\n");
  return {
    schema: HARNESS_SCHEMA,
    sha256: sha256Bytes(aggregate),
    files,
  };
}

function authorityFingerprint(authority, harness) {
  return sha256Bytes(
    JSON.stringify({
      plan: authority.plan.sha256,
      contract: authority.contract.sha256,
      keepout: authority.keepout.sha256,
      sources: authority.sources.map((source) => [source.path, source.sha256]),
      harness: harness.sha256,
    }),
  );
}

async function resolvePlaywright() {
  const packageNames = ["playwright", "playwright-core"];
  const roots = String(process.env.NODE_PATH ?? "")
    .split(delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
  const executablePackageRoot = resolve(dirname(process.execPath), "..", "node_modules");
  const attempts = [];
  for (const packageName of packageNames) {
    const candidates = [packageName, join(executablePackageRoot, packageName), ...roots.map((rootPath) => join(rootPath, packageName))];
    for (const candidate of candidates) {
      attempts.push(candidate);
      try {
        const loaded = requireFromHere(candidate);
        if (loaded?.chromium) return { chromium: loaded.chromium, packageName };
      } catch {
        // Continue through already-installed package locations only.
      }
    }
  }
  throw new Error(`Unable to resolve an existing Playwright package; tried ${attempts.length} installed-package locations`);
}

function installedBrowserCandidates() {
  const candidates = [];
  if (process.platform === "win32") {
    const programRoots = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"]].filter(Boolean);
    for (const rootPath of programRoots) {
      candidates.push(join(rootPath, "Google", "Chrome", "Application", "chrome.exe"));
      candidates.push(join(rootPath, "Microsoft", "Edge", "Application", "msedge.exe"));
    }
    if (process.env.LOCALAPPDATA) {
      candidates.push(join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"));
      candidates.push(join(process.env.LOCALAPPDATA, "Microsoft", "Edge", "Application", "msedge.exe"));
    }
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    );
  } else {
    candidates.push("/usr/bin/google-chrome", "/usr/bin/microsoft-edge", "/usr/bin/chromium", "/usr/bin/chromium-browser");
  }
  return [...new Set(candidates)];
}

async function resolveBrowserExecutable(cliOverride, chromium) {
  const requested = cliOverride ?? process.env.PHASE04R_BROWSER_EXECUTABLE;
  if (requested) {
    const absolute = resolve(requested);
    if (!(await exists(absolute))) throw new Error("Requested browser executable does not exist");
    return { absolute, resolution: cliOverride ? "cli-override" : "environment-override" };
  }
  try {
    const managed = chromium.executablePath?.();
    if (managed && (await exists(managed))) return { absolute: managed, resolution: "playwright-managed-executable" };
  } catch {
    // Continue to installed browser detection.
  }
  for (const candidate of installedBrowserCandidates()) {
    if (await exists(candidate)) return { absolute: candidate, resolution: "installed-browser-auto-detection" };
  }
  throw new Error("No installed Chromium-family executable was detected; use --browser-executable");
}

async function validateServer(plan) {
  let response;
  try {
    response = await fetch(plan.runnerUrl, { cache: "no-store", redirect: "error" });
  } catch (error) {
    throw new Error(`Phase 0.4 prototype server is unavailable: ${error.message}`);
  }
  if (!response.ok) throw new Error(`Phase 0.4 prototype server returned HTTP ${response.status}`);
  const source = await response.text();
  if (!source.includes("phase04-runner-report")) throw new Error("Prototype server returned an unexpected runner document");
}

function buildRunnerUrl(plan, plannedCase) {
  const url = new URL(plan.runnerUrl);
  for (const [key, value] of new URLSearchParams(plannedCase.query)) url.searchParams.set(key, value);
  url.searchParams.set("vw", String(plannedCase.viewport.width));
  url.searchParams.set("vh", String(plannedCase.viewport.height));
  url.searchParams.set("captureScale", String(plannedCase.viewport.captureScale));
  if (plannedCase.focusSelector) url.searchParams.set("focusSelector", plannedCase.focusSelector);
  return url.href;
}

function withoutNestedReport(runnerReport, property) {
  const copy = structuredClone(runnerReport);
  delete copy[property];
  return copy;
}

async function readRunnerDomReport(page, plan, plannedCase) {
  await page.waitForSelector(plan.browserApi.runnerReadySelector, { timeout: RUNNER_TIMEOUT_MS });
  const serialized = await page.locator(plan.browserApi.runnerReportDomSelector).textContent();
  if (!serialized || serialized.trim() === "{}") throw new Error(`Runner DOM report is empty for ${plannedCase.id}`);
  let runner;
  try {
    runner = JSON.parse(serialized);
  } catch (error) {
    throw new Error(`Runner DOM report is invalid JSON for ${plannedCase.id}: ${error.message}`);
  }
  const property = plan.browserApi.runnerChildReportProperty;
  const report = runner[property];
  if (runner.schema !== plan.browserApi.expectedRunnerSchema || report?.schema !== plan.browserApi.expectedSchema) {
    throw new Error(`Runner or child report schema mismatch for ${plannedCase.id}`);
  }
  const requested = runner.requestedViewport ?? {};
  if (requested.width !== plannedCase.viewport.width || requested.height !== plannedCase.viewport.height) {
    throw new Error(`Runner requested-viewport mismatch for ${plannedCase.id}`);
  }
  if (Math.abs(Number(runner.captureScale) - Number(plannedCase.viewport.captureScale)) > 0.000001) {
    throw new Error(`Runner capture-scale mismatch for ${plannedCase.id}`);
  }
  return {
    runner: withoutNestedReport(runner, property),
    report,
    serializedSha256: sha256Bytes(serialized),
  };
}

function queryState(plannedCase) {
  return Object.fromEntries(new URLSearchParams(plannedCase.query));
}

function assertCaseReport(plannedCase, runner, report, authority) {
  const state = queryState(plannedCase);
  const fallbackStackMatches = report.fonts?.computedFallbackStackMatches ?? {};
  const fail = (message) => {
    throw new Error(`${plannedCase.id}: ${message}`);
  };
  if (runner.pass !== true || report.pass !== true) fail("runner or browser report failed");
  if (
    report.authority?.mode !== "final" ||
    report.authority?.captureEligible !== true ||
    report.authority?.scaffoldPreflight !== false
  ) {
    fail("scaffold/preflight report cannot enter final capture authority");
  }
  if (
    report.authority?.plan?.path !== PLAN_RELATIVE ||
    report.authority?.plan?.sha256 !== authority.plan.sha256
  ) {
    fail("browser plan path or SHA-256 differs from the additive Phase 0.4R capture authority");
  }
  if (report.authority?.contract?.sha256 !== authority.contract.sha256) fail("browser contract SHA-256 differs from capture authority");
  if (report.viewport?.width !== plannedCase.viewport.width || report.viewport?.height !== plannedCase.viewport.height) {
    fail("child viewport differs from the plan");
  }
  if (report.state?.surface !== state.surface || report.state?.fixture !== state.fixture || String(report.state?.textZoom) !== state.zoom) {
    fail("child state differs from the planned surface/fixture/zoom");
  }
  if (report.state?.fontMode !== state.font) fail("child font mode differs from the planned state");
  if (report.fonts?.fallbackFontPass !== true) fail("font-stack verification failed");
  if (
    state.font === "fallback" &&
    (
      report.fonts?.forcedFallbackRequested !== true ||
      report.fonts?.forcedFallbackActive !== true ||
      report.fonts?.preferredTokensAbsent !== true ||
      Object.keys(fallbackStackMatches).length !== 3 ||
      !Object.values(fallbackStackMatches).every((value) => value === true)
    )
  ) {
    fail("forced fallback-font exercise did not activate the exact documented live-element stacks");
  }
  if (state.font !== "fallback" && report.fonts?.forcedFallbackRequested !== false) {
    fail("normal-font case incorrectly reports a forced fallback request");
  }
  if (report.copy?.wordFragmentationOffenders !== 0) fail("display-word fragmentation remains");
  if (!Array.isArray(report.copy?.humanLineBreakReport) || report.copy.humanLineBreakReport.length < 1) {
    fail("human line-break report is missing");
  }
  const word = report.layout?.wordIntegrity;
  if (
    word?.pass !== true ||
    (word.cssOffenders ?? []).length !== 0 ||
    (word.wordFragmentationDetails ?? []).length !== 0
  ) {
    fail("whole-word computed-style or geometry gate failed");
  }
  if (
    report.layout?.pageHorizontalOverflow !== false ||
    report.layout?.routeHorizontalOverflow !== false ||
    report.layout?.textOverflowPass !== true ||
    report.layout?.collisionPass !== true
  ) {
    fail("overflow, clipping or collision gate failed");
  }
  if (report.layout?.ruleSafetyPass !== true || report.layout?.dividerPass !== true) fail("decorative-rule gate failed");
  const buttons = report.layout?.buttons ?? [];
  if (buttons.length < 2 || buttons.some((button) => Number(button.widthPx) < 44 || Number(button.heightPx) < 44)) {
    fail("44x44 CSS-pixel target gate failed");
  }
  if (report.accessibility?.focus?.pass !== true || report.accessibility?.reducedMotionPass !== true) {
    fail("focus or reduced-motion semantic gate failed");
  }
  const expectedFocusId = plannedCase.focusSelector?.startsWith("#") ? plannedCase.focusSelector.slice(1) : null;
  if (
    runner.focusState?.requested !== Boolean(plannedCase.focusSelector) ||
    runner.focusState?.activeReviewControlId !== expectedFocusId ||
    runner.focusState?.pass !== true
  ) {
    fail("neutral/requested focus state failed");
  }
  const safety = report.layout?.sceneSafety;
  if (safety?.applicable !== true || safety.pass !== true) fail("CRT cabinet/screen/cable scene-safety gate failed");
  if (safety.keepoutAuthority?.sha256 !== authority.keepout.sha256) fail("keepout SHA-256 differs from the frozen authority");
  if (Number(safety.minimumClearanceCssPx) < 16) fail("scene-safety clearance is below 16 CSS pixels");
  const keepoutIds = new Set((safety.keepouts ?? []).map((keepout) => keepout.id));
  for (const id of ["crt-cabinet", "crt-screen", "spiral-cable"]) {
    if (!keepoutIds.has(id)) fail(`source-projected keepout is missing: ${id}`);
  }
  if ((safety.blocks ?? []).some((block) => block.pass !== true || (block.intersectingKeepouts ?? []).length > 0)) {
    fail("semantic copy/control intersects a source-projected keepout");
  }
  const scenePath = String(report.assets?.scene ?? "").replace(/^\//, "");
  const scene = authority.sources.find((source) => source.path === scenePath);
  if (!scene || report.assets?.sceneId !== scene.id || report.assets?.sceneSha256 !== scene.sha256) {
    fail("browser scene does not bind a frozen source ID/path/hash");
  }
  if (
    safety.source?.id !== scene.id ||
    safety.source?.path !== scene.path ||
    safety.source?.sha256 !== scene.sha256 ||
    safety.source?.width !== scene.width ||
    safety.source?.height !== scene.height
  ) {
    fail("keepout record source lineage differs from the frozen scene");
  }
  const postBezelCase = state.surface === "portal" && state.motion !== "reduce";
  if (postBezelCase) {
    const applicability = safety.applicability;
    if (
      scene.id !== POST_BEZEL_TAKEOVER_SOURCE_ID ||
      applicability?.mode !== "post-bezel-physical-geometry-exited" ||
      applicability?.physicalGeometryVisible !== false ||
      applicability?.collisionRequired !== false ||
      applicability?.sourceId !== POST_BEZEL_TAKEOVER_SOURCE_ID ||
      applicability?.sourceSha256 !== scene.sha256 ||
      JSON.stringify(applicability?.geometryIds) !== JSON.stringify(POST_BEZEL_GEOMETRY_IDS) ||
      (safety.keepouts ?? []).some((keepout) => keepout.visible !== false || keepout.collisionRequired !== false || keepout.sourceRectangleCount !== 0)
    ) {
      fail("post-bezel takeover does not bind explicit out-of-frame physical geometry");
    }
  } else if ((safety.keepouts ?? []).some((keepout) => keepout.visible !== true || keepout.collisionRequired !== true || keepout.sourceRectangleCount < 1)) {
    fail("visible scene geometry is not collision-required");
  }
  if (report.assets?.doubledCopyPass !== true) fail("text-bearing physical/semantic copy is doubled");
  if (state.surface === "portal") {
    const anchors = report.layout?.anchors;
    if (anchors?.applicable === true && (anchors.pass !== true || Number(anchors.maximumDeltaPx) > 3)) {
      fail("physical/DOM anchor displacement exceeds 3 CSS pixels");
    }
    const physical = report.portal?.physicalScreen;
    const takeover = report.portal?.takeover;
    if (physical?.pass !== true || physical?.aspectRatio !== "4:3" || Number(physical.width) * 3 !== Number(physical.height) * 4) {
      fail("physical CRT screen is not machine-verified at exactly 4:3");
    }
    if (
      takeover?.pass !== true ||
      takeover?.noPermanentLetterbox !== true ||
      takeover?.noAbruptAspectSnap !== true ||
      takeover?.semanticDomUndistorted !== true ||
      takeover?.physicalTextAbsentBeforeDomCopy !== true
    ) {
      fail("physical 4:3 to native-DOM takeover gate failed");
    }
  }
  if (state.motion === "reduce") {
    const reduced = report.layout?.reducedMotionComposition;
    if (
      reduced?.applicable !== true ||
      reduced?.pass !== true ||
      reduced?.strategy !== "directional-scrim-quiet-field" ||
      (reduced.floatingRoundedPanelOffenders ?? []).length !== 0 ||
      report.media?.cinematicAssetsInstantiated !== false ||
      report.assets?.televisionPowered !== false ||
      report.assets?.cableDormant !== true
    ) {
      fail("reduced-motion static dormant CRT composition failed");
    }
  }
}

async function collectModalCapture(page, readySelector, prepareRound = null) {
  const discardedAttempts = [];
  for (let round = 1; round <= MAX_MODAL_ROUNDS; round += 1) {
    if (prepareRound) await prepareRound(round);
    const samples = [];
    const bytesByHash = new Map();
    for (let shot = 1; shot <= SCREENSHOTS_PER_VISUAL_CASE; shot += 1) {
      const bytes = await page.screenshot({
        type: "jpeg",
        quality: SCREENSHOT_QUALITY,
        fullPage: true,
        omitBackground: false,
      });
      const digest = sha256Bytes(bytes);
      samples.push({ shot, sha256: digest, bytes: bytes.length });
      if (!bytesByHash.has(digest)) bytesByHash.set(digest, bytes);
    }
    const histogram = [...bytesByHash].map(([digest, bytes]) => ({
      sha256: digest,
      bytes: bytes.length,
      votes: samples.filter((sample) => sample.sha256 === digest).length,
    })).sort((left, right) => right.votes - left.votes || left.sha256.localeCompare(right.sha256));
    const winner = histogram[0];
    const tied = histogram.length > 1 && histogram[1].votes === winner.votes;
    if (!tied && winner.votes >= MINIMUM_MODAL_VOTES) {
      return {
        bytes: bytesByHash.get(winner.sha256),
        record: {
          pass: true,
          method: "exact-byte-modal-winner",
          successiveFullPageJpegs: SCREENSHOTS_PER_VISUAL_CASE,
          minimumWinnerVotes: MINIMUM_MODAL_VOTES,
          round,
          winner,
          uniqueByteSequences: histogram.length,
          histogram,
          samples,
          discardedAttempts,
          timingClaim: "none; readiness barriers do not prove raster stability",
        },
      };
    }
    discardedAttempts.push({
      round,
      reason: tied ? "tied-mode" : "modal-winner-below-7-of-11",
      histogram,
      samples,
    });
    if (round < MAX_MODAL_ROUNDS) {
      await page.reload({ waitUntil: "domcontentloaded", timeout: RUNNER_TIMEOUT_MS });
      await page.waitForSelector(readySelector, { timeout: RUNNER_TIMEOUT_MS });
    }
  }
  return {
    bytes: null,
    record: {
      pass: false,
      method: "exact-byte-modal-winner",
      successiveFullPageJpegs: SCREENSHOTS_PER_VISUAL_CASE,
      minimumWinnerVotes: MINIMUM_MODAL_VOTES,
      winner: null,
      discardedAttempts,
      timingClaim: "none; readiness barriers do not prove raster stability",
    },
  };
}

function jpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error("Portal state 8 modal winner is not a JPEG");
  }
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3) };
    }
    offset += length;
  }
  throw new Error("Portal state 8 JPEG dimensions are unavailable");
}

function captureAuthority(capture) {
  return {
    path: capture.path,
    width: capture.width,
    height: capture.height,
    bytes: capture.bytes,
    sha256: capture.sha256,
  };
}

async function loadNormalizedPortalState7(plan, authority) {
  if (!(await exists(repoPath(MATRIX_RELATIVE)))) {
    throw new Error("Portal state 8 capture requires the finalized Phase 0.4R matrix");
  }
  const matrixBytes = await readFile(repoPath(MATRIX_RELATIVE));
  const matrix = JSON.parse(matrixBytes.toString("utf8"));
  if (
    matrix.schema !== MATRIX_SCHEMA ||
    matrix.plan?.path !== PLAN_RELATIVE ||
    matrix.plan?.sha256 !== authority.plan.sha256 ||
    matrix.keepout?.sha256 !== authority.keepout.sha256 ||
    !Array.isArray(matrix.cases) ||
    matrix.cases.length !== 46
  ) {
    throw new Error("Portal state 8 capture requires the exact normalized Phase 0.4R 46-case matrix authority");
  }
  const visual = matrix.cases.filter((record) => record.capture?.path && record.capture?.sha256);
  if (visual.length !== 36) throw new Error(`Portal state 8 capture requires 36 normalized matrix captures, observed ${visual.length}`);
  const state7 = matrix.cases.find((record) => record.id === "portal-actual--desktop-1440x900");
  if (
    state7?.runner?.pass !== true ||
    state7?.report?.pass !== true ||
    state7?.capture?.width !== 1440 ||
    state7?.capture?.height !== 900 ||
    !state7.capture.path ||
    !/^[a-f0-9]{64}$/i.test(state7.capture.sha256 ?? "")
  ) {
    throw new Error("Portal state 7 normalized browser capture is not a passing 1440x900 authority");
  }
  const state7Bytes = await readFile(repoPath(state7.capture.path));
  if (state7Bytes.length !== state7.capture.bytes || sha256Bytes(state7Bytes) !== state7.capture.sha256) {
    throw new Error("Portal state 7 normalized browser capture byte/hash lineage differs from the matrix");
  }
  const checkpoint = await readJson(repoPath(CHECKPOINT_RELATIVE));
  if (
    checkpoint.schema !== CHECKPOINT_SCHEMA ||
    checkpoint.status !== "complete-local-authority-normalized" ||
    checkpoint.authorityFingerprint !== matrix.authorityFingerprint ||
    checkpoint.matrix?.sha256 !== sha256Bytes(matrixBytes) ||
    checkpoint.matrix?.cases !== 46 ||
    checkpoint.matrix?.captures !== 36 ||
    checkpoint.matrix?.normalized !== true
  ) {
    throw new Error("Portal state 8 capture requires the exact normalized repository-native checkpoint");
  }
  return {
    matrix,
    matrixRecord: { path: MATRIX_RELATIVE, schema: MATRIX_SCHEMA, bytes: matrixBytes.length, sha256: sha256Bytes(matrixBytes), cases: 46, normalizedCaptures: 36 },
    state7,
    checkpoint,
  };
}

async function applyFullSemanticPortalState(page) {
  await page.waitForSelector('body[data-ready="true"]', { timeout: RUNNER_TIMEOUT_MS });
  return page.evaluate(async () => {
    const before = await window.runPhase04TypographyCheck();
    const sceneCrop = document.querySelector(".scene-crop");
    const reviewSurface = document.querySelector("#review-surface");
    if (!(sceneCrop instanceof HTMLElement) || !(reviewSurface instanceof HTMLElement)) {
      throw new Error("Portal semantic-state scene or review surface is missing");
    }
    document.body.dataset.phase04rPortalEvidenceState = "portal-08-full-semantic-surface";
    sceneCrop.hidden = true;
    sceneCrop.setAttribute("aria-hidden", "true");
    sceneCrop.style.setProperty("display", "none", "important");
    reviewSurface.style.setProperty("background", "linear-gradient(135deg, #0e1112 0%, #1a2020 58%, #14090f 100%)");
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const after = await window.runPhase04TypographyCheck();
    const semanticHeading = document.querySelector("#portal-heading")?.textContent?.trim() ?? "";
    const route = [...document.querySelectorAll("#portal-route li")].map((item) => item.textContent?.trim() ?? "");
    const audiences = ["#portal-industry", "#portal-startups"].map((selector) => document.querySelector(selector)?.textContent?.trim() ?? "");
    const sceneStyle = getComputedStyle(sceneCrop);
    return {
      pass:
        before?.pass === true &&
        after?.pass === true &&
        sceneStyle.display === "none" &&
        semanticHeading === "WHERE DO YOU ENTER?" &&
        JSON.stringify(route) === JSON.stringify(["Frame", "Source", "Assess", "Test", "Decide"]) &&
        audiences.every(Boolean) &&
        document.documentElement.scrollWidth === window.innerWidth &&
        document.documentElement.scrollHeight === window.innerHeight,
      state: "portal-08-full-semantic-surface",
      semanticOwner: "repository browser semantic DOM",
      transformation: "the decorative text-free takeover scene is removed after DOM ownership; semantic elements, typography and anchors are unchanged",
      sceneCrop: {
        hiddenAttribute: sceneCrop.hidden,
        display: sceneStyle.display,
        ariaHidden: sceneCrop.getAttribute("aria-hidden"),
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      semanticCopy: { heading: semanticHeading, route, audiences },
      beforeReportPass: before?.pass === true,
      afterReportPass: after?.pass === true,
      afterReport: after,
    };
  });
}

async function validExistingPortalState8(authority, harness, matrixData) {
  if (
    !(await exists(repoPath(PORTAL_STATE_8_REPORT_RELATIVE))) ||
    !(await exists(repoPath(PORTAL_STATE_8_RAW_RELATIVE))) ||
    !(await exists(repoPath(PORTAL_BROWSER_AUTHORITY_RELATIVE)))
  ) return false;
  const recordBytes = await readFile(repoPath(PORTAL_STATE_8_REPORT_RELATIVE));
  const record = JSON.parse(recordBytes.toString("utf8"));
  const rawBytes = await readFile(repoPath(PORTAL_STATE_8_RAW_RELATIVE));
  const browserAuthority = await readJson(repoPath(PORTAL_BROWSER_AUTHORITY_RELATIVE));
  return (
    record.schema === PORTAL_STATE_CAPTURE_SCHEMA &&
    record.status === "PASS" &&
    record.authorityFingerprint === authorityFingerprint(authority, harness) &&
    record.matrix?.sha256 === matrixData.matrixRecord.sha256 &&
    record.state7?.capture?.sha256 === matrixData.state7.capture.sha256 &&
    record.capture?.path === PORTAL_STATE_8_RAW_RELATIVE &&
    record.capture?.bytes === rawBytes.length &&
    record.capture?.sha256 === sha256Bytes(rawBytes) &&
    record.capture?.sha256 !== matrixData.state7.capture.sha256 &&
    record.capture?.modal?.pass === true &&
    Number(record.capture?.modal?.winner?.votes) >= MINIMUM_MODAL_VOTES &&
    record.audit?.pass === true &&
    browserAuthority.schema === PORTAL_BROWSER_AUTHORITY_SCHEMA &&
    browserAuthority.status === "PASS" &&
    browserAuthority.matrix?.sha256 === matrixData.matrixRecord.sha256 &&
    browserAuthority.states?.[0]?.capture?.sha256 === matrixData.state7.capture.sha256 &&
    browserAuthority.states?.[1]?.capture?.sha256 === record.capture.sha256 &&
    browserAuthority.distinctCaptureHashes?.pass === true
  );
}

async function capturePortalState8(plan, authority, harness, browserExecutableOverride) {
  const matrixData = await loadNormalizedPortalState7(plan, authority);
  if (await validExistingPortalState8(authority, harness, matrixData)) {
    console.log(`SKIP portal-08-full-semantic-surface (raw/report/matrix hashes validated)`);
    return;
  }
  const plannedCase = expandPlan(plan).find((entry) => entry.id === "portal-actual--desktop-1440x900");
  if (!plannedCase || plannedCase.viewport.width !== 1440 || plannedCase.viewport.height !== 900) {
    throw new Error("Portal semantic-state base case changed from the accepted 1440x900 topology");
  }
  const playwright = await resolvePlaywright();
  const executable = await resolveBrowserExecutable(browserExecutableOverride, playwright.chromium);
  const browser = await playwright.chromium.launch({ executablePath: executable.absolute, headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      reducedMotion: "no-preference",
      colorScheme: "dark",
      locale: "en-US",
      serviceWorkers: "block",
    });
    try {
      const page = await context.newPage();
      const directUrl = new URL("./index.html", plan.runnerUrl);
      for (const [key, value] of new URLSearchParams(plannedCase.query)) directUrl.searchParams.set(key, value);
      await page.goto(directUrl.href, { waitUntil: "domcontentloaded", timeout: RUNNER_TIMEOUT_MS });
      let audit = null;
      const modal = await collectModalCapture(page, 'body[data-ready="true"]', async () => {
        audit = await applyFullSemanticPortalState(page);
        if (audit.pass !== true) throw new Error("Portal state 8 semantic-ownership audit failed");
      });
      if (!modal.bytes || modal.record.pass !== true) throw new Error("Portal state 8 lacks a unique modal winner of at least 7/11");
      const dimensions = jpegDimensions(modal.bytes);
      if (dimensions.width !== 1440 || dimensions.height !== 900) {
        throw new Error(`Portal state 8 browser capture is ${dimensions.width}x${dimensions.height}, expected 1440x900`);
      }
      const capture = {
        path: PORTAL_STATE_8_RAW_RELATIVE,
        format: "JPEG",
        width: dimensions.width,
        height: dimensions.height,
        bytes: modal.bytes.length,
        sha256: sha256Bytes(modal.bytes),
        modal: modal.record,
      };
      if (capture.sha256 === matrixData.state7.capture.sha256) {
        throw new Error("Portal states 7 and 8 are not distinct browser capture authorities");
      }
      const browserDescriptor = {
        engine: "Chromium",
        product: basename(executable.absolute).replace(/\.exe$/i, ""),
        version: browser.version(),
        executableResolution: executable.resolution,
        automationPackage: playwright.packageName,
        localAuthority: true,
      };
      const record = {
        schema: PORTAL_STATE_CAPTURE_SCHEMA,
        status: "PASS",
        capturedAt: new Date().toISOString(),
        authorityFingerprint: authorityFingerprint(authority, harness),
        plan: authority.plan,
        contract: authority.contract,
        keepout: authority.keepout,
        sceneSources: authority.sources,
        harness,
        browser: browserDescriptor,
        matrix: matrixData.matrixRecord,
        state7: {
          id: "portal-07-dom-takes-ownership",
          caseId: matrixData.state7.id,
          capture: captureAuthority(matrixData.state7.capture),
        },
        id: "portal-08-full-semantic-surface",
        order: 8,
        owner: "repository browser semantic DOM",
        baseCaseId: plannedCase.id,
        query: plannedCase.query,
        capture,
        audit,
        distinctFromState7: {
          pass: capture.sha256 !== matrixData.state7.capture.sha256,
          state7Sha256: matrixData.state7.capture.sha256,
          state8Sha256: capture.sha256,
          semanticDifference: "state 7 retains the frozen text-free takeover raster behind DOM; state 8 removes that raster after full semantic ownership",
        },
      };
      const recordBytes = Buffer.from(portableJson(record));
      await atomicWrite(repoPath(PORTAL_STATE_8_RAW_RELATIVE), modal.bytes);
      await atomicWrite(repoPath(PORTAL_STATE_8_REPORT_RELATIVE), recordBytes);
      const browserAuthority = {
        schema: PORTAL_BROWSER_AUTHORITY_SCHEMA,
        status: "PASS",
        generatedAt: record.capturedAt,
        plan: authority.plan,
        matrix: matrixData.matrixRecord,
        source: authority.sources.find((source) => source.id === POST_BEZEL_TAKEOVER_SOURCE_ID),
        stateCount: 2,
        exactStateIds: ["portal-07-dom-takes-ownership", "portal-08-full-semantic-surface"],
        states: [
          {
            id: "portal-07-dom-takes-ownership",
            order: 7,
            owner: "repository browser semantic DOM",
            caseId: matrixData.state7.id,
            capture: captureAuthority(matrixData.state7.capture),
          },
          {
            id: "portal-08-full-semantic-surface",
            order: 8,
            owner: "repository browser semantic DOM",
            caseId: plannedCase.id,
            capture,
            captureReport: { path: PORTAL_STATE_8_REPORT_RELATIVE, schema: PORTAL_STATE_CAPTURE_SCHEMA, bytes: recordBytes.length, sha256: sha256Bytes(recordBytes) },
          },
        ],
        distinctCaptureHashes: {
          pass: capture.sha256 !== matrixData.state7.capture.sha256,
          state7Sha256: matrixData.state7.capture.sha256,
          state8Sha256: capture.sha256,
        },
        semanticInvariant: {
          pass: audit.pass,
          state8SceneCropDisplay: audit.sceneCrop.display,
          typographyAndAnchorsChanged: false,
          queryTopologyChanged: false,
        },
      };
      await atomicWriteJson(repoPath(PORTAL_BROWSER_AUTHORITY_RELATIVE), browserAuthority);
      const browserAuthorityBytes = await readFile(repoPath(PORTAL_BROWSER_AUTHORITY_RELATIVE));
      matrixData.checkpoint.portalSemanticStates = {
        status: "PASS",
        authority: { path: PORTAL_BROWSER_AUTHORITY_RELATIVE, schema: PORTAL_BROWSER_AUTHORITY_SCHEMA, bytes: browserAuthorityBytes.length, sha256: sha256Bytes(browserAuthorityBytes) },
        state7: { caseId: matrixData.state7.id, path: matrixData.state7.capture.path, sha256: matrixData.state7.capture.sha256 },
        state8: { report: PORTAL_STATE_8_REPORT_RELATIVE, path: capture.path, bytes: capture.bytes, sha256: capture.sha256, modalVotes: capture.modal.winner.votes },
      };
      await writeCheckpoint(matrixData.checkpoint);
      console.log(`PASS portal-08-full-semantic-surface · modal ${capture.modal.winner.votes}/11 · ${capture.sha256}`);
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

function newCheckpoint(authority, harness, migration = null) {
  return {
    schema: CHECKPOINT_SCHEMA,
    authority: AUTHORITY,
    status: "in-progress",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    authorityFingerprint: authorityFingerprint(authority, harness),
    plan: authority.plan,
    contract: authority.contract,
    keepout: authority.keepout,
    sources: authority.sources,
    harness,
    migration,
    browser: null,
    completedAuthorityCases: 0,
    cases: {},
    matrix: null,
  };
}

async function preserveFile(sourceRelative, destinationRelative) {
  const source = repoPath(sourceRelative);
  if (!(await exists(source))) return null;
  const destination = repoPath(destinationRelative);
  await mkdir(dirname(destination), { recursive: true });
  const digest = await sha256File(source);
  const metadata = await stat(source);
  if (await exists(destination)) {
    if ((await stat(destination)).size !== metadata.size || (await sha256File(destination)) !== digest) {
      throw new Error(`Recovery preservation collision: ${destinationRelative}`);
    }
  } else {
    await copyFile(source, destination, fsConstants.COPYFILE_EXCL);
  }
  return { source: sourceRelative, preservedCopy: destinationRelative, bytes: metadata.size, sha256: digest, byteIdentical: true };
}

async function preserveStaleCheckpoint(checkpointBytes, parsed) {
  const digest = sha256Bytes(checkpointBytes);
  const stem = `stale-authority-${digest.slice(0, 16)}`;
  const records = [];
  for (const entry of Object.values(parsed?.cases ?? {})) {
    if (entry?.report?.path) {
      const record = await preserveFile(entry.report.path, `${RECOVERY_RELATIVE}/${stem}/reports/${basename(entry.report.path)}`);
      if (record) records.push({ kind: "case-report", ...record });
    }
    if (entry?.raw?.path) {
      const record = await preserveFile(entry.raw.path, `${RECOVERY_RELATIVE}/${stem}/raw/${basename(entry.raw.path)}`);
      if (record) records.push({ kind: "raw-jpeg", ...record });
    }
  }
  const matrix = await preserveFile(MATRIX_RELATIVE, `${RECOVERY_RELATIVE}/${stem}/browser-matrix-report.json`);
  if (matrix) {
    records.push({ kind: "matrix", ...matrix, retiredOriginal: true });
    await unlink(repoPath(MATRIX_RELATIVE));
  }
  const checkpointCopy = `${RECOVERY_RELATIVE}/${stem}/capture-checkpoint.json`;
  await atomicWrite(repoPath(checkpointCopy), checkpointBytes);
  const recovery = {
    schema: RECOVERY_SCHEMA,
    createdAt: new Date().toISOString(),
    reason: "repository-native checkpoint preserved because plan, contract, frozen scene, keepout or harness authority changed",
    sourceCheckpoint: { path: CHECKPOINT_RELATIVE, bytes: checkpointBytes.length, sha256: digest },
    preservedCheckpoint: checkpointCopy,
    recoveredFiles: records,
    policy: "preserved files are historical only and cannot be promoted or skipped under the replacement authority",
  };
  const recoveryPath = `${RECOVERY_RELATIVE}/${stem}/recovery-report.json`;
  await atomicWriteJson(repoPath(recoveryPath), recovery);
  return { path: recoveryPath, bytes: Buffer.byteLength(portableJson(recovery)), sha256: sha256Bytes(portableJson(recovery)) };
}

async function loadCheckpoint(authority, harness) {
  const checkpointPath = repoPath(CHECKPOINT_RELATIVE);
  const fingerprint = authorityFingerprint(authority, harness);
  if (!(await exists(checkpointPath))) {
    const checkpoint = newCheckpoint(authority, harness);
    await atomicWriteJson(checkpointPath, checkpoint);
    return checkpoint;
  }
  const checkpointBytes = await readFile(checkpointPath);
  let parsed = null;
  try {
    parsed = JSON.parse(checkpointBytes.toString("utf8"));
  } catch {
    // Invalid checkpoint is still preserved below.
  }
  if (
    parsed?.schema === CHECKPOINT_SCHEMA &&
    parsed?.authority === AUTHORITY &&
    parsed?.authorityFingerprint === fingerprint &&
    parsed?.cases &&
    !Array.isArray(parsed.cases)
  ) {
    return parsed;
  }
  if (
    parsed?.schema === CHECKPOINT_SCHEMA &&
    parsed?.status === "blocked-pending-replacement-authority" &&
    parsed?.authority === AUTHORITY &&
    parsed?.authorityFingerprint === null &&
    parsed?.matrix === null &&
    parsed?.cases &&
    !Array.isArray(parsed.cases) &&
    Object.keys(parsed.cases).length === 0
  ) {
    const checkpoint = newCheckpoint(authority, harness);
    checkpoint.migration = {
      kind: "deterministic-capture-hold-release",
      preservedBytesRequired: false,
      reason: "the scaffold contained no reports, captures, matrix or reusable authority",
    };
    await atomicWriteJson(checkpointPath, checkpoint);
    return checkpoint;
  }
  const migration = await preserveStaleCheckpoint(checkpointBytes, parsed);
  const checkpoint = newCheckpoint(authority, harness, migration);
  await atomicWriteJson(checkpointPath, checkpoint);
  return checkpoint;
}

async function writeCheckpoint(checkpoint) {
  checkpoint.updatedAt = new Date().toISOString();
  checkpoint.completedAuthorityCases = Object.values(checkpoint.cases).filter((entry) => entry.status === "complete").length;
  await atomicWriteJson(repoPath(CHECKPOINT_RELATIVE), checkpoint);
}

async function validateCompletion(entry, plannedCase, authority, harness) {
  const fingerprint = authorityFingerprint(authority, harness);
  if (!entry || entry.status !== "complete" || entry.authorityFingerprint !== fingerprint) return false;
  if (!entry.report?.path || !(await exists(repoPath(entry.report.path)))) return false;
  const reportBytes = await readFile(repoPath(entry.report.path));
  if (reportBytes.length !== entry.report.bytes || sha256Bytes(reportBytes) !== entry.report.sha256) return false;
  let report;
  try {
    report = JSON.parse(reportBytes.toString("utf8"));
  } catch {
    return false;
  }
  if (
    report.schema !== CASE_REPORT_SCHEMA ||
    report.id !== plannedCase.id ||
    report.authorityFingerprint !== fingerprint ||
    report.runner?.pass !== true ||
    report.report?.pass !== true
  ) return false;
  if (plannedCase.captureRequired) {
    if (!entry.raw?.path || !(await exists(repoPath(entry.raw.path)))) return false;
    const rawPath = repoPath(entry.raw.path);
    if ((await stat(rawPath)).size !== entry.raw.bytes || (await sha256File(rawPath)) !== entry.raw.sha256) return false;
    if (report.capture?.raw?.sha256 !== entry.raw.sha256 || Number(report.capture?.modal?.winner?.votes) < MINIMUM_MODAL_VOTES) return false;
  }
  return true;
}

function outputPaths(plannedCase) {
  return {
    raw: `${EVIDENCE_RELATIVE}/captures/raw/${plannedCase.id}.jpg`,
    report: `${REPORTS_RELATIVE}/${plannedCase.id}.json`,
  };
}

async function runCase(page, plan, plannedCase, authority, harness, browserDescriptor) {
  const url = buildRunnerUrl(plan, plannedCase);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: RUNNER_TIMEOUT_MS });
  const dom = await readRunnerDomReport(page, plan, plannedCase);
  try {
    assertCaseReport(plannedCase, dom.runner, dom.report, authority);
  } catch (error) {
    error.domEvidence = dom;
    throw error;
  }
  const output = outputPaths(plannedCase);
  let capture = null;
  if (plannedCase.captureRequired) {
    const modal = await collectModalCapture(page, plan.browserApi.runnerReadySelector);
    if (!modal.bytes || modal.record.pass !== true) throw new Error(`${plannedCase.id}: no unique modal winner of at least 7/11`);
    await atomicWrite(repoPath(output.raw), modal.bytes);
    capture = {
      raw: { path: output.raw, bytes: modal.bytes.length, sha256: sha256Bytes(modal.bytes), format: "JPEG" },
      modal: modal.record,
    };
  }
  const capturedAt = new Date().toISOString();
  const fingerprint = authorityFingerprint(authority, harness);
  const caseReport = {
    schema: CASE_REPORT_SCHEMA,
    authority: AUTHORITY,
    authorityFingerprint: fingerprint,
    capturedAt,
    plan: authority.plan,
    contract: authority.contract,
    keepout: authority.keepout,
    harness,
    browser: browserDescriptor,
    id: plannedCase.id,
    viewportId: plannedCase.viewportId,
    query: plannedCase.query,
    focusSelector: plannedCase.focusSelector,
    captureRequired: plannedCase.captureRequired,
    runnerDomReportSha256: dom.serializedSha256,
    runner: dom.runner,
    report: dom.report,
    capture,
  };
  const reportBytes = Buffer.from(portableJson(caseReport));
  await atomicWrite(repoPath(output.report), reportBytes);
  return {
    caseReport,
    entry: {
      id: plannedCase.id,
      status: "complete",
      authority: AUTHORITY,
      authorityFingerprint: fingerprint,
      completedAt: capturedAt,
      report: { path: output.report, bytes: reportBytes.length, sha256: sha256Bytes(reportBytes) },
      raw: capture?.raw ?? null,
    },
  };
}

function sanitizeFailure(error) {
  return String(error?.message ?? error ?? "unknown browser failure")
    .replace(/[A-Za-z]:[\\/][^\r\n"']+/g, "[private path redacted]")
    .replace(/\/(?:Users|home)\/[^\r\n"']+/g, "[private path redacted]");
}

async function recordFailure(checkpoint, plannedCase, authority, harness, browserDescriptor, error) {
  const output = outputPaths(plannedCase);
  const capturedAt = new Date().toISOString();
  const report = {
    schema: CASE_REPORT_SCHEMA,
    authority: AUTHORITY,
    authorityFingerprint: authorityFingerprint(authority, harness),
    capturedAt,
    plan: authority.plan,
    contract: authority.contract,
    keepout: authority.keepout,
    harness,
    browser: browserDescriptor,
    id: plannedCase.id,
    viewportId: plannedCase.viewportId,
    query: plannedCase.query,
    focusSelector: plannedCase.focusSelector,
    captureRequired: plannedCase.captureRequired,
    status: "failed-browser-gate",
    error: sanitizeFailure(error),
    runnerDomReportSha256: error?.domEvidence?.serializedSha256 ?? null,
    runner: error?.domEvidence?.runner ?? null,
    report: error?.domEvidence?.report ?? null,
  };
  const bytes = Buffer.from(portableJson(report));
  await atomicWrite(repoPath(output.report), bytes);
  checkpoint.cases[plannedCase.id] = {
    id: plannedCase.id,
    status: "failed-browser-gate",
    authority: AUTHORITY,
    authorityFingerprint: authorityFingerprint(authority, harness),
    completedAt: capturedAt,
    report: { path: output.report, bytes: bytes.length, sha256: sha256Bytes(bytes) },
    raw: null,
  };
  await writeCheckpoint(checkpoint);
}

async function finalizeMatrix(checkpoint, expanded, plan, authority, harness, browserDescriptor) {
  const reports = [];
  for (const plannedCase of expanded) {
    const entry = checkpoint.cases[plannedCase.id];
    if (!(await validateCompletion(entry, plannedCase, authority, harness))) return false;
    reports.push(await readJson(repoPath(entry.report.path)));
  }
  const visual = reports.filter((report) => report.capture);
  if (visual.length !== 36) throw new Error(`Cannot finalize: expected 36 visual cases, observed ${visual.length}`);
  const votes = visual.map((report) => Number(report.capture.modal.winner.votes));
  const discarded = visual.flatMap((report) => report.capture.modal.discardedAttempts ?? []);
  const matrix = {
    schema: MATRIX_SCHEMA,
    generatedAt: new Date().toISOString(),
    evidenceMethod: "repository-native Playwright DOM reports with exact-byte modal full-page JPEG winners",
    authorityFingerprint: authorityFingerprint(authority, harness),
    plan: authority.plan,
    contract: authority.contract,
    keepout: authority.keepout,
    sceneSources: authority.sources,
    harness,
    fontMode: plan.fontMode,
    browser: browserDescriptor,
    capturePolicy: {
      method: "exact-byte-modal-winner",
      successiveFullPageJpegsPerVisualCase: SCREENSHOTS_PER_VISUAL_CASE,
      minimumWinnerVotes: MINIMUM_MODAL_VOTES,
      observedWinnerVotesMinimum: Math.min(...votes),
      weakCases: 0,
      tiedCases: 0,
      discardedWeakCaptureAttempts: discarded.length,
      screenshotType: "JPEG",
      screenshotQuality: SCREENSHOT_QUALITY,
      fullPage: true,
      timingClaim: "none; readiness barriers do not prove raster stability",
    },
    browserDerivedReviewSheets: (plan.browserDerivedReviewSheets ?? []).map((sheet) => ({
      reviewIndex: sheet.reviewIndex,
      filename: sheet.filename,
      sourceCaseIds: sheet.sourceCaseIds,
      additionalAuthorities: sheet.additionalAuthorities ?? [],
      lineageStatus: "matrix cases captured; sheet composition and output-manifest binding pending",
    })),
    reviewSheetLineagePolicy: plan.reviewSheetLineagePolicy,
    cases: reports.map((report) => ({
      id: report.id,
      viewportId: report.viewportId,
      query: report.query,
      focusSelector: report.focusSelector,
      runner: report.runner,
      report: report.report,
      capture: report.capture ? { raw: report.capture.raw, modal: report.capture.modal } : null,
    })),
  };
  const matrixBytes = Buffer.from(portableJson(matrix));
  await atomicWrite(repoPath(MATRIX_RELATIVE), matrixBytes);
  checkpoint.status = "complete-local-authority-awaiting-normalization";
  checkpoint.matrix = { path: MATRIX_RELATIVE, bytes: matrixBytes.length, sha256: sha256Bytes(matrixBytes), cases: 46, captures: 36 };
  await writeCheckpoint(checkpoint);
  return true;
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    printHelp();
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    printHelp();
    return;
  }
  const planBytes = await readFile(repoPath(PLAN_RELATIVE));
  const plan = JSON.parse(planBytes.toString("utf8"));
  const expanded = expandPlan(plan);
  if (options.list) {
    for (const entry of expanded) console.log(`${entry.id}\t${entry.captureRequired ? "capture" : "report"}`);
    console.log(`46 cases; 36 planned captures; sceneFreeze=${plan.sceneFreeze?.status}; captureAllowed=${plan.sceneFreeze?.captureAllowed}`);
    return;
  }

  const authority = await validateFrozenAuthority(plan, planBytes);
  const harness = await validateHarnessAuthority();
  if (options.portalState8) {
    await validateServer(plan);
    await capturePortalState8(plan, authority, harness, options.browserExecutable);
    return;
  }
  const byId = new Map(expanded.map((entry) => [entry.id, entry]));
  const selectedIds = options.caseIds.length > 0 ? [...new Set(options.caseIds)] : expanded.map((entry) => entry.id);
  for (const id of selectedIds) if (!byId.has(id)) throw new Error(`Unknown Phase 0.4R case: ${id}`);

  await validateServer(plan);
  const checkpoint = await loadCheckpoint(authority, harness);
  const pending = [];
  for (const id of selectedIds) {
    const plannedCase = byId.get(id);
    if (await validateCompletion(checkpoint.cases[id], plannedCase, authority, harness)) {
      console.log(`SKIP ${id} (checkpoint, report and raw hashes validated)`);
    } else {
      pending.push(plannedCase);
    }
  }
  const batch = pending.slice(0, options.batchSize);
  if (batch.length === 0) {
    const finalized = await finalizeMatrix(checkpoint, expanded, plan, authority, harness, checkpoint.browser);
    console.log(finalized ? `COMPLETE ${MATRIX_RELATIVE}` : "No pending selected cases in this batch.");
    return;
  }

  const playwright = await resolvePlaywright();
  const executable = await resolveBrowserExecutable(options.browserExecutable, playwright.chromium);
  const browser = await playwright.chromium.launch({ executablePath: executable.absolute, headless: true });
  const browserDescriptor = {
    engine: "Chromium",
    product: basename(executable.absolute).replace(/\.exe$/i, ""),
    version: browser.version(),
    executableResolution: executable.resolution,
    automationPackage: playwright.packageName,
    localAuthority: true,
  };
  checkpoint.browser = browserDescriptor;
  await writeCheckpoint(checkpoint);
  try {
    for (const plannedCase of batch) {
      const renderedWidth = Math.ceil(plannedCase.viewport.width * plannedCase.viewport.captureScale);
      const renderedHeight = Math.ceil(plannedCase.viewport.height * plannedCase.viewport.captureScale);
      const context = await browser.newContext({
        viewport: { width: Math.max(1280, renderedWidth), height: Math.max(720, renderedHeight) },
        reducedMotion: queryState(plannedCase).motion === "reduce" ? "reduce" : "no-preference",
        colorScheme: "dark",
        locale: "en-US",
        serviceWorkers: "block",
      });
      try {
        const page = await context.newPage();
        console.log(`RUN ${plannedCase.id}`);
        try {
          const result = await runCase(page, plan, plannedCase, authority, harness, browserDescriptor);
          checkpoint.cases[plannedCase.id] = result.entry;
          await writeCheckpoint(checkpoint);
          const votes = result.caseReport.capture?.modal?.winner?.votes;
          console.log(`PASS ${plannedCase.id}${votes ? ` · modal ${votes}/11` : " · DOM report"}`);
        } catch (error) {
          await recordFailure(checkpoint, plannedCase, authority, harness, browserDescriptor, error);
          throw error;
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const finalized = await finalizeMatrix(checkpoint, expanded, plan, authority, harness, browserDescriptor);
  if (finalized) {
    console.log(`MATRIX COMPLETE ${MATRIX_RELATIVE}`);
  } else {
    const valid = (await Promise.all(expanded.map((entry) => validateCompletion(checkpoint.cases[entry.id], entry, authority, harness)))).filter(Boolean).length;
    console.log(`CHECKPOINTED ${valid}/46 local-authority cases; rerun to resume.`);
  }
}

main().catch((error) => {
  console.error(`Phase 0.4R capture stopped: ${sanitizeFailure(error)}`);
  process.exitCode = 1;
});
