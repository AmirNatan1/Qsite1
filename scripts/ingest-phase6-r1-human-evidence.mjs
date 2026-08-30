#!/usr/bin/env node

/**
 * Hash-bind the four required Phase 6-R1 human recordings and, when supplied,
 * validate a human-authored visual review. Merely finding an MP4 can never
 * produce PASS.
 */

import { createHash } from "node:crypto";
import { access, lstat, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCHEMA = "quantum-hub.phase-6-r1.human-evidence-ledger.v1";
export const REVIEW_SCHEMA = "quantum-hub.phase-6-r1.human-evidence-review.v1";
export const REQUIRED_RECORDINGS = Object.freeze([
  "iphone-safari-opening.mp4",
  "iphone-safari-maradin.mp4",
  "physical-scroll-input.mp4",
  "chrome-200-percent.mp4",
]);
export const HUMAN_STATUSES = Object.freeze(["PASS", "FAIL", "PENDING HUMAN REVIEW"]);
export const DEVICE_REVIEW_CHECKS = Object.freeze({
  "iphone-safari-opening.mp4": Object.freeze([
    "correctDormantOpening",
    "firstPracticalSwipeResponse",
    "nativeMomentum",
    "stopAtPhysicalState",
    "reverseReconstruction",
    "lineRasterQ",
    "autonomousManifestoFade",
    "noF1FlashFromIntentionalHome",
    "orientationStability",
    "backgroundForeground",
  ]),
  "iphone-safari-maradin.mp4": Object.freeze([
    "onePlayerLifecycle",
    "backgroundForeground",
    "retryableSourceFree",
    "noPersistentRafOrInterval",
    "noLiveOrphanBlob",
  ]),
  "physical-scroll-input.mp4": Object.freeze([
    "noPositiveInputDeadZone",
    "nativeInertiaSovereign",
    "promptReversal",
    "noCatchUpAnimation",
    "freezesAtRest",
    "noForcedSnapping",
    "supportingRoutesOrdinaryFlow",
  ]),
});
export const ZOOM_ROUTE_CHECKS = Object.freeze([
  "completeH1",
  "completeOpeningProposition",
  "readableNavigation",
  "usableMobileMenuWhereApplicable",
  "noTextClipping",
  "noInternalWordSplitting",
  "noHiddenContent",
  "noHorizontalOverflow",
  "usableControlsAndLinks",
  "reasonableDocumentContinuation",
]);
export const ZOOM_ROUTE_OUTCOMES = Object.freeze([
  "/",
  "/for-partners/",
  "/for-startups/",
  "/industries/",
  "/pocs/",
  "/pocs/maradin/",
  "/spark/",
  "/about/",
  "/contact/",
  "/__phase6-intentional-404__/",
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function within(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function assertExternalOutput(candidate) {
  const resolved = path.resolve(candidate);
  if (resolved === path.parse(resolved).root) throw new Error("--output cannot be a filesystem root");
  if (within(ROOT, resolved)) throw new Error("--output must remain outside the repository");
  if (within(os.tmpdir(), resolved)) throw new Error("--output must remain outside OS temporary storage");
  if (path.extname(resolved).toLowerCase() !== ".json") throw new Error("--output must be a JSON file");
  return resolved;
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = { help: false, inputRoot: "", output: "", reviews: "", selfTest: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => { const value = valueAfter(argv, index, argument); index += 1; return value; };
    if (argument === "--input-root") options.inputRoot = path.resolve(next());
    else if (argument === "--output") options.output = path.resolve(next());
    else if (argument === "--reviews") options.reviews = path.resolve(next());
    else if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

export function validateOptions(options) {
  if (!options.help && !options.selfTest) {
    if (!options.inputRoot) throw new Error("--input-root is required");
    if (!options.output) throw new Error("--output is required");
    options.output = assertExternalOutput(options.output);
  }
  return options;
}

async function exists(candidate) {
  try { await access(candidate); return true; } catch { return false; }
}

async function sha256File(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

function cleanText(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  assert(typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 2_000, `${label} must be concise non-empty text${nullable ? " or null" : ""}`);
  return value;
}

function cleanTextArray(value, label, { allowEmpty = false } = {}) {
  assert(Array.isArray(value) && (allowEmpty || value.length > 0), `${label} must be ${allowEmpty ? "an" : "a non-empty"} array`);
  return value.map((item, index) => cleanText(item, `${label}[${index}]`));
}

function cleanObservations(value, label) {
  assert(Array.isArray(value) && value.length > 0, `${label} must be a non-empty array`);
  return value.map((item, index) => {
    if (typeof item === "string") return cleanText(item, `${label}[${index}]`);
    assert(item && typeof item === "object" && !Array.isArray(item), `${label}[${index}] must be text or a structured observation`);
    return structuredClone(item);
  });
}

function validateFailureReferences(value, status, label, failedChecks = []) {
  assert(Array.isArray(value), `${label} failureReferences must be an array`);
  const references = value.map((reference, index) => {
    assert(reference && typeof reference === "object" && !Array.isArray(reference), `${label} failureReferences[${index}] must be an object`);
    const check = cleanText(reference.check, `${label} failure check`);
    const timestamp = reference.timestamp === null || reference.timestamp === undefined ? null : cleanText(reference.timestamp, `${label} failure timestamp`);
    const frame = reference.frame === null || reference.frame === undefined ? null : cleanText(reference.frame, `${label} failure frame`);
    assert(timestamp !== null || frame !== null, `${label} failure reference requires timestamp or frame`);
    return { check, timestamp, frame, observation: cleanText(reference.observation, `${label} failure observation`) };
  });
  if (status === "FAIL") assert(references.length > 0, `${label} FAIL requires at least one timestamp/frame reference`);
  else assert(references.length === 0, `${label} non-FAIL cannot contain failure references`);
  for (const check of failedChecks) {
    assert(references.some((reference) => reference.check === check), `${label} false check ${check} requires a failureReference with the same check identifier and timestamp/frame`);
  }
  if (failedChecks.length) {
    const allowed = new Set(failedChecks);
    assert(references.every((reference) => allowed.has(reference.check)), `${label} failureReference identifies a check that is not false`);
  }
  return references;
}

function validateZoomRouteOutcomes(value) {
  assert(Array.isArray(value) && value.length === ZOOM_ROUTE_OUTCOMES.length, "chrome-200-percent routeOutcomes must contain exactly ten routes");
  const routes = new Set();
  const outcomes = value.map((outcome, index) => {
    assert(outcome && typeof outcome === "object" && !Array.isArray(outcome), `chrome-200-percent routeOutcomes[${index}] must be an object`);
    assert(ZOOM_ROUTE_OUTCOMES.includes(outcome.route) && !routes.has(outcome.route), `chrome-200-percent route is missing, unknown or duplicated: ${outcome.route}`);
    routes.add(outcome.route);
    assert(HUMAN_STATUSES.includes(outcome.status), `chrome-200-percent route ${outcome.route} status is invalid`);
    assert(outcome.checks && typeof outcome.checks === "object" && !Array.isArray(outcome.checks), `chrome-200-percent route ${outcome.route} checks are missing`);
    assert(JSON.stringify(Object.keys(outcome.checks).sort()) === JSON.stringify([...ZOOM_ROUTE_CHECKS].sort()), `chrome-200-percent route ${outcome.route} checks must contain exactly the ten required checks`);
    const checks = Object.fromEntries(ZOOM_ROUTE_CHECKS.map((check) => {
      assert(typeof outcome.checks[check] === "boolean", `chrome-200-percent route ${outcome.route} check ${check} must be boolean`);
      return [check, outcome.checks[check]];
    }));
    const failedChecks = ZOOM_ROUTE_CHECKS.filter((check) => checks[check] === false);
    if (outcome.status === "PASS") assert(failedChecks.length === 0, `chrome-200-percent PASS route ${outcome.route} contains a failed check`);
    if (outcome.status === "FAIL") assert(failedChecks.length > 0, `chrome-200-percent FAIL route ${outcome.route} contains no failed check`);
    if (outcome.status !== "FAIL") assert(failedChecks.length === 0, `chrome-200-percent route ${outcome.route} contains a false check without FAIL status`);
    return {
      route: outcome.route,
      status: outcome.status,
      checks,
      failureReferences: validateFailureReferences(outcome.failureReferences, outcome.status, `chrome-200-percent route ${outcome.route}`, failedChecks),
    };
  });
  assert(ZOOM_ROUTE_OUTCOMES.every((route) => routes.has(route)), "chrome-200-percent route coverage differs");
  return outcomes;
}

function validateDeviceChecks(value, filename, status) {
  const required = DEVICE_REVIEW_CHECKS[filename];
  if (!required) return undefined;
  assert(value && typeof value === "object" && !Array.isArray(value), `${filename} checks must be an object`);
  const observedKeys = Object.keys(value).sort();
  const expectedKeys = [...required].sort();
  assert(JSON.stringify(observedKeys) === JSON.stringify(expectedKeys), `${filename} checks must contain exactly: ${required.join(", ")}`);
  const checks = Object.fromEntries(required.map((check) => {
    const result = value[check];
    const valid = typeof result === "boolean" || (status === "PENDING HUMAN REVIEW" && result === null);
    assert(valid, `${filename} check ${check} must be boolean${status === "PENDING HUMAN REVIEW" ? " or null" : ""}`);
    return [check, result];
  }));
  if (status === "PASS") assert(Object.values(checks).every((result) => result === true), `${filename} PASS requires every required check to pass`);
  if (status === "FAIL") assert(Object.values(checks).some((result) => result === false), `${filename} FAIL requires at least one failed required check`);
  if (status !== "FAIL") assert(Object.values(checks).every((result) => result !== false), `${filename} contains a false check without FAIL status`);
  return checks;
}

function statusFromZoomRoutes(outcomes) {
  if (outcomes.some(({ status }) => status === "FAIL")) return "FAIL";
  if (outcomes.every(({ status }) => status === "PASS")) return "PASS";
  return "PENDING HUMAN REVIEW";
}

export function validateReviewEntry(entry, expectedFilename) {
  assert(entry && typeof entry === "object" && !Array.isArray(entry), `${expectedFilename} review must be an object`);
  assert(entry.filename === expectedFilename, `${expectedFilename} review filename differs`);
  assert(HUMAN_STATUSES.includes(entry.status), `${expectedFilename} review status is invalid`);
  const normalized = {
    filename: expectedFilename,
    evidenceClass: "PHYSICAL HUMAN RECORDING",
    device: cleanText(entry.device, `${expectedFilename} device`),
    os: cleanText(entry.os, `${expectedFilename} OS`),
    browser: cleanText(entry.browser, `${expectedFilename} browser`, { nullable: true }),
    browserVersion: cleanText(entry.browserVersion, `${expectedFilename} browser/version`, { nullable: true }),
    testSteps: cleanTextArray(entry.testSteps, `${expectedFilename} testSteps`),
    observations: cleanObservations(entry.observations, `${expectedFilename} observations`),
    observedResult: cleanText(entry.observedResult, `${expectedFilename} observedResult`),
    status: entry.status,
  };
  if (expectedFilename.startsWith("iphone-safari-")) assert(/safari/i.test(normalized.browser ?? ""), `${expectedFilename} browser must identify Safari`);
  if (expectedFilename === "chrome-200-percent.mp4") assert(/chrome/i.test(normalized.browser ?? ""), "chrome-200-percent browser must identify Chrome");
  const deviceChecks = validateDeviceChecks(entry.checks, expectedFilename, entry.status);
  if (deviceChecks) normalized.checks = deviceChecks;
  let failedChecks = deviceChecks ? Object.entries(deviceChecks).filter(([, result]) => result === false).map(([check]) => check) : [];
  if (expectedFilename === "chrome-200-percent.mp4") {
    assert(entry.genuineBrowserZoom === true, "chrome-200-percent must be genuine browser zoom");
    assert(entry.zoomPercent === 200, "chrome-200-percent zoomPercent must be 200");
    assert(entry.proxy === false, "chrome-200-percent cannot be a proxy");
    normalized.genuineBrowserZoom = true;
    normalized.zoomPercent = 200;
    normalized.proxy = false;
    normalized.routeOutcomes = validateZoomRouteOutcomes(entry.routeOutcomes);
    const derivedStatus = statusFromZoomRoutes(normalized.routeOutcomes);
    assert(entry.status === derivedStatus, `chrome-200-percent entry status must be ${derivedStatus} from its ten route statuses`);
    failedChecks = [];
  }
  normalized.failureReferences = validateFailureReferences(entry.failureReferences, entry.status, expectedFilename, failedChecks);
  return normalized;
}

export function validateReviews(document) {
  assert(document?.schema === REVIEW_SCHEMA, `review schema must be ${REVIEW_SCHEMA}`);
  assert(Array.isArray(document.entries) && document.entries.length === REQUIRED_RECORDINGS.length, "review must contain exactly four entries");
  const byFilename = new Map();
  for (const entry of document.entries) {
    assert(!byFilename.has(entry?.filename), `duplicate review entry: ${entry?.filename ?? "missing filename"}`);
    byFilename.set(entry.filename, entry);
  }
  return REQUIRED_RECORDINGS.map((filename) => validateReviewEntry(byFilename.get(filename), filename));
}

function pendingReview(filename) {
  return {
    filename,
    evidenceClass: "PHYSICAL HUMAN RECORDING",
    device: "Not reviewed",
    os: "Not reviewed",
    browser: filename.startsWith("iphone-safari-") ? "Safari (version not reviewed)" : filename === "chrome-200-percent.mp4" ? "Chrome (version not reviewed)" : null,
    browserVersion: null,
    testSteps: ["Inspect the supplied recording and document every visibly demonstrated step."],
    observations: ["Hash-bound file inventory only; visual review has not been completed."],
    observedResult: "Pending visual inspection; file presence alone is not evidence of a pass.",
    status: "PENDING HUMAN REVIEW",
    failureReferences: [],
  };
}

function overallStatus(entries) {
  if (entries.some(({ status }) => status === "FAIL")) return "FAIL";
  if (entries.every(({ status }) => status === "PASS")) return "PASS";
  return "PENDING HUMAN REVIEW";
}

async function inventoryRecordings(inputRoot) {
  if (!(await exists(inputRoot))) return { rootExists: false, missing: [...REQUIRED_RECORDINGS], files: [] };
  const rootInfo = await lstat(inputRoot);
  assert(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), "human evidence root must be a real directory, not a link");
  const resolvedRoot = await realpath(inputRoot);
  const missing = [];
  const files = [];
  for (const filename of REQUIRED_RECORDINGS) {
    const candidate = path.join(resolvedRoot, filename);
    if (!(await exists(candidate))) { missing.push(filename); continue; }
    const info = await lstat(candidate);
    if (!info.isFile() || info.isSymbolicLink()) { missing.push(filename); continue; }
    const resolved = await realpath(candidate);
    assert(path.dirname(resolved) === resolvedRoot, `${filename} resolves outside the human evidence root`);
    const fileInfo = await stat(resolved);
    assert(fileInfo.size > 0, `${filename} is empty`);
    files.push({ filename, byteSize: fileInfo.size, sha256: await sha256File(resolved) });
  }
  return { rootExists: true, missing, files };
}

export async function ingestHumanEvidence(options) {
  validateOptions(options);
  if (await exists(options.output)) throw new Error(`refusing to overwrite output: ${options.output}`);
  const inventory = await inventoryRecordings(options.inputRoot);
  let reviews = null;
  if (options.reviews) reviews = validateReviews(JSON.parse(await readFile(options.reviews, "utf8")));
  const reviewByFilename = new Map((reviews ?? []).map((entry) => [entry.filename, entry]));
  const inventoryByFilename = new Map(inventory.files.map((entry) => [entry.filename, entry]));
  const entries = inventory.files.map((record) => ({ ...record, ...(reviewByFilename.get(record.filename) ?? pendingReview(record.filename)) }));
  const blocked = inventory.missing.length > 0;
  const document = {
    schema: SCHEMA,
    createdAt: new Date().toISOString(),
    status: blocked ? "BLOCKED" : overallStatus(entries),
    evidenceClass: "HUMAN DEVICE EVIDENCE",
    requiredFilenames: [...REQUIRED_RECORDINGS],
    rootExists: inventory.rootExists,
    missingFilenames: inventory.missing,
    entries,
    policy: {
      filePresenceIsPass: false,
      machineRecordingSubstitutionAllowed: false,
      failRequiresTimestampOrFrame: true,
      allFourFilesRequiredBeforePackaging: true,
    },
  };
  assert(entries.every(({ filename, byteSize, sha256 }) => inventoryByFilename.get(filename)?.byteSize === byteSize && inventoryByFilename.get(filename)?.sha256 === sha256), "ledger hash binding differs");
  await mkdir(path.dirname(options.output), { recursive: true });
  await writeFile(options.output, `${JSON.stringify(document, null, 2)}\n`, { flag: "wx" });
  return document;
}

export function runSelfTest() {
  assert(REQUIRED_RECORDINGS.length === 4, "four human recordings are required");
  assert(overallStatus(REQUIRED_RECORDINGS.map((filename) => ({ filename, status: "PENDING HUMAN REVIEW" }))) === "PENDING HUMAN REVIEW", "pending inventory promoted");
  assert(overallStatus(REQUIRED_RECORDINGS.map((filename) => ({ filename, status: "PASS" }))) === "PASS", "complete human PASS not retained");
  return { schema: `${SCHEMA}.self-test`, status: "PASS", requiredRecordings: 4, filePresenceIsPass: false };
}

function usage() {
  return [
    "Usage:",
    "  node scripts/ingest-phase6-r1-human-evidence.mjs --input-root <phase-6-human-device-evidence> --output <fresh-external-json> [--reviews <human-review-json>]",
    "  node scripts/ingest-phase6-r1-human-evidence.mjs --self-test",
    "",
    "Without --reviews, present files remain PENDING HUMAN REVIEW. Missing required files produce a BLOCKED ledger and a non-zero exit status.",
  ].join("\n");
}

async function main() {
  const options = validateOptions(parseArguments(process.argv.slice(2)));
  if (options.help) return void process.stdout.write(`${usage()}\n`);
  if (options.selfTest) return void process.stdout.write(`${JSON.stringify(runSelfTest(), null, 2)}\n`);
  const document = await ingestHumanEvidence(options);
  process.stdout.write(`${JSON.stringify({ status: document.status, missingFilenames: document.missingFilenames }, null, 2)}\n`);
  if (document.status === "BLOCKED") process.exitCode = 2;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main().catch((error) => {
  console.error(`Phase 6-R1 human evidence ingestion failed: ${error.message}`);
  process.exitCode = 1;
});
