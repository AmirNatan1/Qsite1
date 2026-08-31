import os from "node:os";
import path from "node:path";

import {
  PHASE7A_GATES,
  PUBLIC_ROUTES,
  RECORDING_SCENARIOS,
  REVIEW_ZIP_NAME,
} from "./phase7a-contract.mjs";

export const SCHEMA = "quantum-hub.phase-7a.browser-evidence.v1";

export const EVIDENCE_STATUSES = Object.freeze([
  "PASS",
  "FAIL",
  "LIMITATION",
  "NOT OBSERVED",
  "PENDING HUMAN REVIEW",
  "NOT AVAILABLE TO EXECUTION ENVIRONMENT",
]);

export const BROWSER_ENGINES = Object.freeze([
  Object.freeze({ id: "chromium", evidenceClass: "BROWSER ENGINE" }),
  Object.freeze({ id: "firefox", evidenceClass: "BROWSER ENGINE" }),
  Object.freeze({ id: "webkit", evidenceClass: "WEBKIT PROXY" }),
]);

const PUBLIC_ROUTE_IDS = Object.freeze([
  "home",
  "for-industry",
  "for-startups",
  "industries",
  "proof",
  "maradin",
  "spark",
  "about",
  "contact",
]);

export const REAL_404_PATH = "/__phase7a-real-404-probe__/";

export const ROUTE_OUTCOMES = Object.freeze([
  ...PUBLIC_ROUTES.map((route, index) => Object.freeze({
    id: PUBLIC_ROUTE_IDS[index],
    path: route.route,
    expectedStatus: 200,
    public: true,
    real404: false,
  })),
  Object.freeze({
    id: "404",
    path: REAL_404_PATH,
    expectedStatus: 404,
    public: false,
    real404: true,
  }),
]);

const viewport = (id, width, height, family) => Object.freeze({ id, width, height, family });

export const CORE_VIEWPORTS = Object.freeze([
  viewport("desktop-1440x900", 1440, 900, "desktop"),
  viewport("short-desktop-1366x650", 1366, 650, "desktop"),
  viewport("desktop-1280x800", 1280, 800, "desktop"),
  viewport("tablet-landscape-1024x768", 1024, 768, "desktop"),
  viewport("tablet-portrait-768x1024", 768, 1024, "portrait"),
  viewport("mobile-390x844", 390, 844, "portrait"),
  viewport("mobile-360x800", 360, 800, "portrait"),
  viewport("narrow-320x800", 320, 800, "portrait"),
  viewport("mobile-landscape-844x390", 844, 390, "landscape"),
  viewport("narrow-landscape-740x360", 740, 360, "landscape"),
  viewport("landscape-800x360", 800, 360, "landscape"),
  viewport("landscape-896x414", 896, 414, "landscape"),
  viewport("landscape-900x480", 900, 480, "landscape"),
]);

export const CROSS_ENGINE_VIEWPORT_IDS = Object.freeze([
  "desktop-1440x900",
  "mobile-390x844",
  "mobile-landscape-844x390",
]);

export const HOME_EXTRA_VIEWPORT_IDS = Object.freeze([
  "short-desktop-1366x650",
  "tablet-landscape-1024x768",
  "tablet-portrait-768x1024",
  "narrow-320x800",
]);

export const AXE_VIEWPORT_IDS = Object.freeze([
  "desktop-1440x900",
  "mobile-390x844",
]);

export const ROUTE_MATRIX_COUNTS = Object.freeze({
  chromium: 130,
  firefox: 34,
  webkit: 34,
  all: 198,
});

export const AXE_CASE_COUNT = 60;

export const ROUTE_CASE_CHECKS = Object.freeze([
  "httpStatus",
  "semanticContent",
  "singleH1",
  "landmarks",
  "targetSize",
  "noHorizontalOverflow",
  "networkIsolation",
]);

export const FALLBACK_VARIANTS = Object.freeze([
  "reduced-motion",
  "no-javascript",
  "fallback-fonts",
]);

export const FALLBACK_CASE_CHECKS = Object.freeze([
  "semanticContent",
  "ordinaryNavigation",
  "wholeWordWrapping",
  "noHorizontalOverflow",
  "noHiddenFocusableControls",
  "networkPolicy",
]);

export const RECORDING_ENGINES = Object.freeze(["chromium", "firefox"]);

const RECORDING_DURATION_RANGES = Object.freeze({
  "complete-threshold-entry": Object.freeze({ minimumSeconds: 12, maximumSeconds: 75 }),
  "complete-reverse": Object.freeze({ minimumSeconds: 12, maximumSeconds: 75 }),
  "stop-states": Object.freeze({ minimumSeconds: 30, maximumSeconds: 120 }),
  "home-intent": Object.freeze({ minimumSeconds: 15, maximumSeconds: 75 }),
  "responsive-authority": Object.freeze({ minimumSeconds: 30, maximumSeconds: 120 }),
  "reduced-motion-and-no-js": Object.freeze({ minimumSeconds: 20, maximumSeconds: 90 }),
  typography: Object.freeze({ minimumSeconds: 30, maximumSeconds: 150 }),
});

export const RECORDING_MEDIA_CONTRACT = Object.freeze({
  container: "mp4",
  codec: "h264",
  pixelFormat: "yuv420p",
  videoStreams: 1,
  audioStreams: 0,
  fps: 30,
  constantFrameRate: true,
  fullDecode: true,
  width: 1280,
  height: 720,
});

export const RECORDING_SPECS = Object.freeze(RECORDING_ENGINES.flatMap((engine) => (
  RECORDING_SCENARIOS.map((scenario, index) => Object.freeze({
    engine,
    evidenceClass: "SUPPLEMENTAL MACHINE RECORDING",
    scenario,
    relativePath: `recordings/${engine}/${String(index + 1).padStart(2, "0")}-${scenario}.mp4`,
    ...RECORDING_DURATION_RANGES[scenario],
  }))
)));

export const THRESHOLD_REVERSE_CYCLES = 10;
export const HOME_MARADIN_CYCLES = 10;

export const THRESHOLD_REVERSE_CHECKS = Object.freeze([
  "forwardResolved",
  "reverseReturnedToTop",
  "idleRafZero",
  "activeIntervalsZero",
  "pointerWorkSettled",
  "listenerCountBounded",
  "observerCountBounded",
  "blobCountBounded",
  "onePausedDecoder",
  "noScrollWrites",
]);

export const HOME_MARADIN_CHECKS = Object.freeze([
  "homeSourceOwned",
  "maradinInitialDormant",
  "oneActiveMaradinPlayer",
  "replacementReleasedPrevious",
  "departureReleasedMedia",
  "homeReturnCoherent",
  "blobBalanceClosed",
  "decoderCountBounded",
  "listenerCountBounded",
  "noRetryStorm",
]);

export const HUMAN_GATE_RECORDS = Object.freeze(PHASE7A_GATES.map((gate) => Object.freeze({
  gate,
  status: "PENDING HUMAN REVIEW",
})));

export const EXTERNAL_EVIDENCE_POLICY = Object.freeze({
  absolutePathRequired: true,
  outsideRepository: true,
  outsideOsTemporaryStorage: true,
  freshOutputRequired: true,
  overwriteAllowed: false,
  gitTrackedAllowed: false,
  privatePathsAllowed: false,
  nestedArchivesAllowed: false,
  archiveFilename: REVIEW_ZIP_NAME,
});

const STALE_PHASE_PATH = /(?:^|[\\/_.-])phase[-_]?6(?:[\\/_.-]|$)|__phase6/i;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function viewportById(id) {
  return CORE_VIEWPORTS.find((candidate) => candidate.id === id) ?? null;
}

function routeById(id) {
  return ROUTE_OUTCOMES.find((candidate) => candidate.id === id) ?? null;
}

function engineById(id) {
  return BROWSER_ENGINES.find((candidate) => candidate.id === id) ?? null;
}

export function validateEvidenceStatus(status, label = "evidence status") {
  invariant(EVIDENCE_STATUSES.includes(status), `${label} is invalid: ${status ?? "<missing>"}`);
  return status;
}

export function routeMatrixForEngine(engine) {
  const engineAuthority = engineById(engine);
  invariant(engineAuthority, `unsupported browser engine: ${engine}`);
  const selectedViewports = engine === "chromium"
    ? CORE_VIEWPORTS
    : CROSS_ENGINE_VIEWPORT_IDS.map(viewportById);
  const cases = selectedViewports.flatMap((candidateViewport) => ROUTE_OUTCOMES.map((route) => Object.freeze({
    engine,
    evidenceClass: engineAuthority.evidenceClass,
    route: route.id,
    path: route.path,
    expectedStatus: route.expectedStatus,
    viewport: candidateViewport.id,
  })));
  if (engine !== "chromium") {
    const home = routeById("home");
    for (const viewportId of HOME_EXTRA_VIEWPORT_IDS) {
      cases.push(Object.freeze({
        engine,
        evidenceClass: engineAuthority.evidenceClass,
        route: home.id,
        path: home.path,
        expectedStatus: home.expectedStatus,
        viewport: viewportId,
      }));
    }
  }
  return Object.freeze(cases);
}

export function allRouteMatrixCases() {
  return Object.freeze(BROWSER_ENGINES.flatMap(({ id }) => routeMatrixForEngine(id)));
}

export function axeCases() {
  return Object.freeze(BROWSER_ENGINES.flatMap(({ id: engine, evidenceClass }) => (
    AXE_VIEWPORT_IDS.flatMap((viewportId) => ROUTE_OUTCOMES.map((route) => Object.freeze({
      engine,
      evidenceClass,
      route: route.id,
      path: route.path,
      expectedStatus: route.expectedStatus,
      viewport: viewportId,
    })))
  )));
}

export function fallbackCases() {
  const cases = [];
  const home = routeById("home");
  const portrait = "mobile-390x844";
  for (const { id: engine, evidenceClass } of BROWSER_ENGINES) {
    cases.push(
      { engine, evidenceClass, route: home.id, targetPath: "/", expectedStatus: 200, viewport: portrait, variant: "reduced-motion" },
      { engine, evidenceClass, route: home.id, targetPath: "/", expectedStatus: 200, viewport: portrait, variant: "no-javascript" },
      { engine, evidenceClass, route: home.id, targetPath: "/#entry", expectedStatus: 200, viewport: portrait, variant: "no-javascript" },
      { engine, evidenceClass, route: home.id, targetPath: "/", expectedStatus: 200, viewport: portrait, variant: "fallback-fonts" },
    );
  }
  for (const candidateViewport of CORE_VIEWPORTS) {
    if (candidateViewport.id === portrait) continue;
    cases.push({
      engine: "chromium",
      evidenceClass: engineById("chromium").evidenceClass,
      route: home.id,
      targetPath: "/",
      expectedStatus: 200,
      viewport: candidateViewport.id,
      variant: "fallback-fonts",
    });
  }
  for (const route of ROUTE_OUTCOMES.filter(({ id }) => id !== "home")) {
    for (const variant of FALLBACK_VARIANTS) {
      cases.push({
        engine: "chromium",
        evidenceClass: engineById("chromium").evidenceClass,
        route: route.id,
        targetPath: route.path,
        expectedStatus: route.expectedStatus,
        viewport: portrait,
        variant,
      });
    }
  }
  return Object.freeze(cases.map((record) => Object.freeze(record)));
}

function routeCaseKey(record) {
  return `${record.engine}\u0000${record.route}\u0000${record.path}\u0000${record.viewport}`;
}

function fallbackCaseKey(record) {
  return `${record.engine}\u0000${record.route}\u0000${record.targetPath}\u0000${record.viewport}\u0000${record.variant}`;
}

function recordingKey(record) {
  return `${record.engine}\u0000${record.scenario}\u0000${record.relativePath}`;
}

function exactCaseMap(expected, actual, keyFor, label) {
  invariant(Array.isArray(actual), `${label} cases must be an array`);
  const expectedMap = new Map(expected.map((record) => [keyFor(record), record]));
  invariant(expectedMap.size === expected.length, `${label} authority contains duplicate expected cases`);
  const actualMap = new Map();
  for (const record of actual) {
    const key = keyFor(record);
    invariant(!actualMap.has(key), `${label} contains a duplicate case: ${key}`);
    actualMap.set(key, record);
  }
  const missing = [...expectedMap.keys()].filter((key) => !actualMap.has(key));
  const unexpected = [...actualMap.keys()].filter((key) => !expectedMap.has(key));
  invariant(missing.length === 0, `${label} is missing ${missing.length} required case(s): ${missing[0] ?? ""}`);
  invariant(unexpected.length === 0, `${label} contains ${unexpected.length} stale or unexpected case(s): ${unexpected[0] ?? ""}`);
  invariant(actual.length === expected.length, `${label} case count differs`);
  return { expectedMap, actualMap };
}

function validateFailures(record, label) {
  invariant(Array.isArray(record.failures), `${label} failures must be an array`);
  return record.failures;
}

function validateChecks(checks, expectedNames, label) {
  invariant(checks && typeof checks === "object" && !Array.isArray(checks), `${label} checks are missing`);
  invariant(sameJson(sorted(Object.keys(checks)), sorted(expectedNames)), `${label} check inventory differs`);
  for (const [name, value] of Object.entries(checks)) {
    invariant(typeof value === "boolean" || value === null, `${label} check ${name} must be boolean or null`);
  }
  return {
    allPass: expectedNames.every((name) => checks[name] === true),
    hasFailure: expectedNames.some((name) => checks[name] === false),
    hasUnobserved: expectedNames.some((name) => checks[name] === null),
  };
}

function validateHonestStatus(record, derived, label) {
  validateEvidenceStatus(record.status, `${label} status`);
  const failures = validateFailures(record, label);
  if (record.status === "PASS") {
    invariant(derived === true, `${label} is a false PASS`);
    invariant(failures.length === 0, `${label} PASS retains failures`);
  } else if (record.status === "FAIL") {
    invariant(derived === false, `${label} FAIL has no failed authority`);
    invariant(failures.length > 0, `${label} FAIL requires a failure ledger`);
  } else {
    invariant(typeof record.statement === "string" && record.statement.trim().length > 0, `${label} ${record.status} requires a statement`);
    invariant(derived !== true || record.status === "PENDING HUMAN REVIEW", `${label} non-PASS status contradicts complete passing evidence`);
  }
}

function validateTopLevel(report, allCasesPass, label) {
  invariant(report && typeof report === "object" && !Array.isArray(report), `${label} report is missing`);
  validateEvidenceStatus(report.status, `${label} report status`);
  const failures = validateFailures(report, `${label} report`);
  if (report.status === "PASS") {
    invariant(allCasesPass, `${label} report is a false PASS`);
    invariant(failures.length === 0, `${label} PASS report retains failures`);
  } else if (report.status === "FAIL") {
    invariant(!allCasesPass, `${label} FAIL report contains only passing cases`);
    invariant(failures.length > 0, `${label} FAIL report requires failures`);
  } else {
    invariant(typeof report.statement === "string" && report.statement.trim().length > 0, `${label} ${report.status} report requires a statement`);
  }
}

export function validateRouteMatrixReport(report) {
  const expected = allRouteMatrixCases();
  const { expectedMap, actualMap } = exactCaseMap(expected, report?.cases, routeCaseKey, "route matrix");
  for (const [key, record] of actualMap) {
    const authority = expectedMap.get(key);
    invariant(record.evidenceClass === authority.evidenceClass, `route matrix ${key} evidence class differs`);
    invariant(record.expectedStatus === authority.expectedStatus, `route matrix ${key} expected status differs`);
    invariant(record.actualStatus === authority.expectedStatus || record.status !== "PASS", `route matrix ${key} HTTP status differs`);
    const checks = validateChecks(record.checks, ROUTE_CASE_CHECKS, `route matrix ${key}`);
    validateHonestStatus(record, checks.allPass && record.actualStatus === authority.expectedStatus, `route matrix ${key}`);
  }
  validateTopLevel(report, report.cases.every(({ status }) => status === "PASS"), "route matrix");
  return true;
}

export function validateAxeReport(report) {
  const expected = axeCases();
  const { expectedMap, actualMap } = exactCaseMap(expected, report?.cases, routeCaseKey, "axe matrix");
  for (const [key, record] of actualMap) {
    const authority = expectedMap.get(key);
    invariant(record.evidenceClass === authority.evidenceClass, `axe matrix ${key} evidence class differs`);
    invariant(record.expectedStatus === authority.expectedStatus, `axe matrix ${key} expected status differs`);
    invariant(Array.isArray(record.violations), `axe matrix ${key} violations must be an array`);
    invariant(Number.isSafeInteger(record.incompleteCount) && record.incompleteCount >= 0, `axe matrix ${key} incomplete count differs`);
    const derived = record.actualStatus === authority.expectedStatus
      && record.violations.length === 0
      && record.incompleteCount === 0;
    validateHonestStatus(record, derived, `axe matrix ${key}`);
  }
  validateTopLevel(report, report.cases.every(({ status }) => status === "PASS"), "axe matrix");
  return true;
}

export function validateFallbackReport(report) {
  const expected = fallbackCases();
  const { expectedMap, actualMap } = exactCaseMap(expected, report?.cases, fallbackCaseKey, "fallback matrix");
  for (const [key, record] of actualMap) {
    const authority = expectedMap.get(key);
    invariant(record.evidenceClass === authority.evidenceClass, `fallback matrix ${key} evidence class differs`);
    invariant(record.expectedStatus === authority.expectedStatus, `fallback matrix ${key} expected status differs`);
    invariant(record.actualStatus === authority.expectedStatus || record.status !== "PASS", `fallback matrix ${key} HTTP status differs`);
    const checks = validateChecks(record.checks, FALLBACK_CASE_CHECKS, `fallback matrix ${key}`);
    validateHonestStatus(record, checks.allPass && record.actualStatus === authority.expectedStatus, `fallback matrix ${key}`);
  }
  validateTopLevel(report, report.cases.every(({ status }) => status === "PASS"), "fallback matrix");
  return true;
}

function validateRecordingMedia(record, authority) {
  const media = record.media;
  invariant(media && typeof media === "object" && !Array.isArray(media), `${authority.relativePath} media authority is missing`);
  const checks = {
    container: media.container === RECORDING_MEDIA_CONTRACT.container,
    codec: media.codec === RECORDING_MEDIA_CONTRACT.codec,
    pixelFormat: media.pixelFormat === RECORDING_MEDIA_CONTRACT.pixelFormat,
    videoStreams: media.videoStreams === RECORDING_MEDIA_CONTRACT.videoStreams,
    audioStreams: media.audioStreams === RECORDING_MEDIA_CONTRACT.audioStreams,
    fps: media.fps === RECORDING_MEDIA_CONTRACT.fps,
    constantFrameRate: media.constantFrameRate === true,
    fullDecode: media.fullDecode === true,
    width: media.width === RECORDING_MEDIA_CONTRACT.width,
    height: media.height === RECORDING_MEDIA_CONTRACT.height,
    duration: Number.isFinite(media.durationSeconds)
      && media.durationSeconds >= authority.minimumSeconds
      && media.durationSeconds <= authority.maximumSeconds,
  };
  return { allPass: Object.values(checks).every(Boolean), checks };
}

export function validateRecordingReport(report) {
  const { expectedMap, actualMap } = exactCaseMap(RECORDING_SPECS, report?.recordings, recordingKey, "recording inventory");
  for (const [key, record] of actualMap) {
    const authority = expectedMap.get(key);
    invariant(record.evidenceClass === authority.evidenceClass, `recording ${key} evidence class differs`);
    invariant(!STALE_PHASE_PATH.test(record.relativePath), `recording ${key} uses a stale Phase 6 path`);
    const media = validateRecordingMedia(record, authority);
    validateHonestStatus(record, media.allPass, `recording ${key}`);
  }
  validateTopLevel(report, report.recordings.every(({ status }) => status === "PASS"), "recording inventory");
  return true;
}

function validateCycleRows(rows, count, expectedChecks, label) {
  invariant(Array.isArray(rows), `${label} cycles must be an array`);
  invariant(rows.length === count, `${label} must contain exactly ${count} cycles`);
  const numbers = new Set();
  for (const record of rows) {
    invariant(Number.isSafeInteger(record.cycle) && record.cycle >= 1 && record.cycle <= count, `${label} cycle number differs`);
    invariant(!numbers.has(record.cycle), `${label} contains duplicate cycle ${record.cycle}`);
    numbers.add(record.cycle);
    const checks = validateChecks(record.checks, expectedChecks, `${label} cycle ${record.cycle}`);
    validateHonestStatus(record, checks.allPass, `${label} cycle ${record.cycle}`);
  }
  for (let cycle = 1; cycle <= count; cycle += 1) invariant(numbers.has(cycle), `${label} is missing cycle ${cycle}`);
  return rows.every(({ status }) => status === "PASS");
}

export function validateLifecycleReport(report) {
  invariant(report && typeof report === "object" && !Array.isArray(report), "lifecycle report is missing");
  const thresholdPass = validateCycleRows(
    report.thresholdReverse,
    THRESHOLD_REVERSE_CYCLES,
    THRESHOLD_REVERSE_CHECKS,
    "threshold/reverse",
  );
  const maradinPass = validateCycleRows(
    report.homeMaradin,
    HOME_MARADIN_CYCLES,
    HOME_MARADIN_CHECKS,
    "Home/Maradin",
  );
  validateTopLevel(report, thresholdPass && maradinPass, "lifecycle");
  return true;
}

export function validateHumanGates(records) {
  invariant(Array.isArray(records), "human gates must be an array");
  invariant(records.length === HUMAN_GATE_RECORDS.length, "human gate count differs");
  const expected = new Set(HUMAN_GATE_RECORDS.map(({ gate }) => gate));
  const observed = new Set();
  for (const record of records) {
    invariant(expected.has(record.gate), `unexpected human gate: ${record.gate ?? "<missing>"}`);
    invariant(!observed.has(record.gate), `duplicate human gate: ${record.gate}`);
    observed.add(record.gate);
    invariant(record.status === "PENDING HUMAN REVIEW", `${record.gate} must remain PENDING HUMAN REVIEW`);
  }
  for (const gate of expected) invariant(observed.has(gate), `missing human gate: ${gate}`);
  return true;
}

function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export function validateExternalEvidenceIntent(intent, {
  repositoryRoot = process.cwd(),
  temporaryRoot = os.tmpdir(),
} = {}) {
  invariant(intent && typeof intent === "object" && !Array.isArray(intent), "external evidence intent is missing");
  invariant(typeof intent.output === "string" && path.isAbsolute(intent.output), "external evidence output must be absolute");
  const resolved = path.resolve(intent.output);
  invariant(resolved !== path.parse(resolved).root, "external evidence output cannot be a filesystem root");
  invariant(!isWithin(repositoryRoot, resolved), "external evidence output must remain outside the repository");
  invariant(!isWithin(temporaryRoot, resolved), "external evidence output must remain outside OS temporary storage");
  invariant(intent.exists === false, "external evidence output must be fresh");
  invariant(intent.overwrite === false, "external evidence output must not be overwritten");
  invariant(intent.gitTracked === false, "external evidence output must remain untracked");
  invariant(!STALE_PHASE_PATH.test(resolved), "external evidence output uses a stale Phase 6 path");
  return resolved;
}

export function safeRelativeEvidencePath(value, label = "evidence path") {
  invariant(typeof value === "string" && value.length > 0, `${label} is required`);
  invariant(!value.includes("\\"), `${label} must use POSIX separators`);
  invariant(!path.posix.isAbsolute(value), `${label} must be relative`);
  const normalized = path.posix.normalize(value);
  invariant(normalized === value && normalized !== "." && !normalized.startsWith("../"), `${label} is unsafe`);
  invariant(!STALE_PHASE_PATH.test(value), `${label} uses a stale Phase 6 path`);
  invariant(!/(?:^|\/)node_modules(?:\/|$)/i.test(value), `${label} contains node_modules`);
  invariant(!/\.(?:zip|7z|rar|tar|tgz)$/i.test(value), `${label} contains a nested archive`);
  return value;
}

export function validateEvidenceManifest(entries) {
  invariant(Array.isArray(entries), "evidence manifest entries must be an array");
  const paths = new Set();
  for (const entry of entries) {
    const relativePath = safeRelativeEvidencePath(entry?.relativePath);
    invariant(!paths.has(relativePath), `evidence manifest contains duplicate path: ${relativePath}`);
    paths.add(relativePath);
    invariant(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0, `${relativePath} byte size differs`);
    invariant(/^[0-9a-f]{64}$/.test(entry.sha256 ?? ""), `${relativePath} SHA-256 differs`);
    if (entry.status !== undefined) validateEvidenceStatus(entry.status, `${relativePath} status`);
  }
  return true;
}

export function validateBrowserContract() {
  invariant(PUBLIC_ROUTES.length === 9, "Phase 7A must retain exactly nine public routes");
  invariant(ROUTE_OUTCOMES.length === 10, "Phase 7A browser authority must include nine routes and one real 404");
  invariant(ROUTE_OUTCOMES.filter(({ real404, expectedStatus }) => real404 && expectedStatus === 404).length === 1, "real 404 authority differs");
  invariant(CORE_VIEWPORTS.length === 13, "Phase 7A must retain the exact thirteen core viewports");
  invariant(new Set(CORE_VIEWPORTS.map(({ id }) => id)).size === 13, "core viewport ids must be unique");
  for (const { id } of BROWSER_ENGINES) {
    invariant(routeMatrixForEngine(id).length === ROUTE_MATRIX_COUNTS[id], `${id} route matrix count differs`);
  }
  invariant(allRouteMatrixCases().length === ROUTE_MATRIX_COUNTS.all, "combined route matrix count differs");
  invariant(axeCases().length === AXE_CASE_COUNT, "axe matrix count differs");
  invariant(fallbackCases().length === 51, "fallback matrix count differs");
  invariant(RECORDING_SCENARIOS.length === 7, "recording scenario count differs");
  invariant(RECORDING_SPECS.length === 14, "recording cross-product must contain fourteen outputs");
  invariant(new Set(RECORDING_SPECS.map(recordingKey)).size === 14, "recording cross-product contains duplicates");
  invariant(THRESHOLD_REVERSE_CYCLES === 10 && HOME_MARADIN_CYCLES === 10, "lifecycle cycle authority differs");
  invariant(HUMAN_GATE_RECORDS.length === 6, "human gate count differs");
  validateHumanGates(HUMAN_GATE_RECORDS);
  invariant(EXTERNAL_EVIDENCE_POLICY.archiveFilename === REVIEW_ZIP_NAME, "review ZIP name differs");
  return Object.freeze({
    schema: SCHEMA,
    status: "PASS",
    publicRoutes: PUBLIC_ROUTES.length,
    routeOutcomes: ROUTE_OUTCOMES.length,
    coreViewports: CORE_VIEWPORTS.length,
    routeMatrix: ROUTE_MATRIX_COUNTS,
    axeCases: AXE_CASE_COUNT,
    fallbackCases: fallbackCases().length,
    recordings: RECORDING_SPECS.length,
    thresholdReverseCycles: THRESHOLD_REVERSE_CYCLES,
    homeMaradinCycles: HOME_MARADIN_CYCLES,
    humanGates: HUMAN_GATE_RECORDS.length,
  });
}

validateBrowserContract();
