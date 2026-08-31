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
export const OBSERVATION_STATUSES = Object.freeze([...HUMAN_STATUSES, "LIMITATION"]);
export const HUMAN_EVIDENCE_POLICY = Object.freeze({
  filePresenceIsPass: false,
  machineRecordingSubstitutionAllowed: false,
  failRequiresTimestampOrFrame: true,
  allFourFilesRequiredBeforePackaging: true,
});
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

function bmffBoxes(bytes, start = 0, end = bytes.length, label = "MP4") {
  const boxes = [];
  let offset = start;
  while (offset < end) {
    assert(end - offset >= 8, `${label} contains a truncated ISO-BMFF box header`);
    const size32 = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    let headerSize = 8;
    let size = size32;
    if (size32 === 1) {
      assert(end - offset >= 16, `${label} contains a truncated extended ISO-BMFF box header`);
      const extended = bytes.readBigUInt64BE(offset + 8);
      assert(extended <= BigInt(Number.MAX_SAFE_INTEGER), `${label} contains an oversized ISO-BMFF box`);
      size = Number(extended);
      headerSize = 16;
    }
    assert(size32 !== 0 && size >= headerSize && offset + size <= end, `${label} contains an invalid or truncated ISO-BMFF box size`);
    boxes.push({ type, start: offset, end: offset + size, payloadStart: offset + headerSize, payloadSize: size - headerSize });
    offset += size;
  }
  assert(offset === end, `${label} ISO-BMFF box inventory does not consume the file`);
  return boxes;
}

function childBox(bytes, parent, type, label) {
  return bmffBoxes(bytes, parent.payloadStart, parent.end, label).find((box) => box.type === type) ?? null;
}

function mediaHeaderDuration(bytes, box, label) {
  assert(box && box.payloadSize >= 20, `${label} is missing or truncated`);
  const version = bytes[box.payloadStart];
  if (version === 0) {
    const timescale = bytes.readUInt32BE(box.payloadStart + 12);
    const duration = bytes.readUInt32BE(box.payloadStart + 16);
    assert(timescale > 0 && duration > 0, `${label} must have positive timescale and duration`);
    return { timescale, duration };
  }
  assert(version === 1 && box.payloadSize >= 32, `${label} version is unsupported or truncated`);
  const timescale = bytes.readUInt32BE(box.payloadStart + 20);
  const duration64 = bytes.readBigUInt64BE(box.payloadStart + 24);
  assert(timescale > 0 && duration64 > 0n && duration64 <= BigInt(Number.MAX_SAFE_INTEGER), `${label} must have positive timescale and duration`);
  return { timescale, duration: Number(duration64) };
}

export function validateMp4Structure(bytes, label = "recording") {
  assert(Buffer.isBuffer(bytes) && bytes.length >= 32, `${label} is too small to be a coherent MP4`);
  const top = bmffBoxes(bytes, 0, bytes.length, label);
  const ftyp = top.find(({ type }) => type === "ftyp");
  const moov = top.find(({ type }) => type === "moov");
  const mdat = top.find(({ type }) => type === "mdat");
  assert(ftyp && ftyp === top[0] && ftyp.payloadSize >= 8, `${label} is missing a coherent leading ftyp box`);
  assert(moov && moov.payloadSize > 0, `${label} is missing a non-empty moov box`);
  assert(mdat && mdat.payloadSize > 0, `${label} is missing a non-empty mdat box`);
  const mvhd = childBox(bytes, moov, "mvhd", `${label}/moov`);
  const movie = mediaHeaderDuration(bytes, mvhd, `${label}/moov/mvhd`);
  const traks = bmffBoxes(bytes, moov.payloadStart, moov.end, `${label}/moov`).filter(({ type }) => type === "trak");
  const videoTracks = [];
  for (const trak of traks) {
    const mdia = childBox(bytes, trak, "mdia", `${label}/trak`);
    if (!mdia) continue;
    const hdlr = childBox(bytes, mdia, "hdlr", `${label}/trak/mdia`);
    if (!hdlr || hdlr.payloadSize < 12 || bytes.subarray(hdlr.payloadStart + 8, hdlr.payloadStart + 12).toString("ascii") !== "vide") continue;
    const media = mediaHeaderDuration(bytes, childBox(bytes, mdia, "mdhd", `${label}/trak/mdia`), `${label}/trak/mdia/mdhd`);
    const minf = childBox(bytes, mdia, "minf", `${label}/trak/mdia`);
    const stbl = minf && childBox(bytes, minf, "stbl", `${label}/trak/mdia/minf`);
    const sampleBox = stbl && (childBox(bytes, stbl, "stsz", `${label}/trak/mdia/minf/stbl`) ?? childBox(bytes, stbl, "stz2", `${label}/trak/mdia/minf/stbl`));
    assert(sampleBox && sampleBox.payloadSize >= 12, `${label} video track lacks a complete sample-size box`);
    const sampleCount = bytes.readUInt32BE(sampleBox.payloadStart + 8);
    assert(sampleCount > 0, `${label} video track must contain a positive sample/frame count`);
    const sampleSize = sampleBox.type === "stsz" ? bytes.readUInt32BE(sampleBox.payloadStart + 4) : null;
    const compactFieldSize = sampleBox.type === "stz2" ? bytes[sampleBox.payloadStart + 7] : null;
    const sampleEntriesValid = sampleBox.type === "stsz"
      ? sampleSize !== 0 || sampleBox.payloadSize >= 12 + sampleCount * 4
      : [4, 8, 16].includes(compactFieldSize) && sampleBox.payloadSize >= 12 + Math.ceil(sampleCount * compactFieldSize / 8);
    assert(sampleEntriesValid, `${label} video track contains a truncated sample-size table`);
    videoTracks.push({ ...media, sampleCount });
  }
  assert(videoTracks.length, `${label} does not contain a coherent video track`);
  return { movie, videoTrack: videoTracks[0], videoTracks, topLevelBoxes: top.map(({ type }) => type) };
}

function mediaValidationFromStructure(structure) {
  return {
    container: "ISO-BMFF MP4",
    durationSeconds: Number((structure.movie.duration / structure.movie.timescale).toFixed(6)),
    sampleCount: structure.videoTrack.sampleCount,
    videoTrackCount: structure.videoTracks.length,
  };
}

function validateMediaValidation(value, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} mediaValidation is missing`);
  assert(JSON.stringify(Object.keys(value).sort()) === JSON.stringify(["container", "durationSeconds", "sampleCount", "videoTrackCount"].sort()), `${label} mediaValidation fields differ`);
  assert(value.container === "ISO-BMFF MP4"
    && Number.isFinite(value.durationSeconds) && value.durationSeconds > 0
    && Number.isSafeInteger(value.sampleCount) && value.sampleCount > 0
    && Number.isSafeInteger(value.videoTrackCount) && value.videoTrackCount > 0, `${label} mediaValidation is incomplete`);
  return { ...value };
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

function parseMediaTimestamp(value) {
  if (typeof value !== "string" || value.trim() !== value) return null;
  const parts = value.split(":");
  if (parts.length !== 2 && parts.length !== 3) return null;
  if (!parts.every((part, index) => index === parts.length - 1 ? /^\d{2}(?:\.\d{1,3})?$/.test(part) : /^\d{2}$/.test(part))) return null;
  const numbers = parts.map(Number);
  const seconds = numbers.at(-1);
  const minutes = numbers.at(-2);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds >= 60 || !Number.isInteger(minutes) || minutes < 0 || minutes >= 60) return null;
  if (parts.length === 3 && (!Number.isInteger(numbers[0]) || numbers[0] < 0)) return null;
  return value;
}

function parseFrameReference(value) {
  if (Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^F[1-9]\d*$/.test(value)) return value;
  return null;
}

function mediaTimestampSeconds(value) {
  const normalized = parseMediaTimestamp(value);
  if (normalized === null) return null;
  const parts = normalized.split(":").map(Number);
  return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function frameReferenceNumber(value) {
  const normalized = parseFrameReference(value);
  if (normalized === null) return null;
  return typeof normalized === "number" ? normalized : Number(normalized.slice(1));
}

function validateEvidencePositions(references, mediaValidation, label) {
  for (const reference of references) {
    const seconds = reference.timestamp === null ? null : mediaTimestampSeconds(reference.timestamp);
    const frame = reference.frame === null ? null : frameReferenceNumber(reference.frame);
    if (seconds !== null && seconds > mediaValidation.durationSeconds + 0.001) throw new Error(`${label} failure timestamp exceeds the recording duration`);
    if (frame !== null && frame > mediaValidation.sampleCount) throw new Error(`${label} failure frame exceeds the recording sample count`);
  }
}

function cleanObservations(value, label) {
  assert(Array.isArray(value) && value.length > 0, `${label} must be a non-empty array`);
  return value.map((item, index) => {
    assert(item && typeof item === "object" && !Array.isArray(item), `${label}[${index}] must be a structured observation`);
    assert(JSON.stringify(Object.keys(item).sort()) === JSON.stringify(["checkId", "frame", "result", "status", "timestamp"]), `${label}[${index}] must contain exactly checkId, status, result, timestamp and frame`);
    assert(OBSERVATION_STATUSES.includes(item.status), `${label}[${index}] status is invalid`);
    const timestamp = item.timestamp === null ? null : parseMediaTimestamp(item.timestamp);
    const frame = item.frame === null ? null : parseFrameReference(item.frame);
    assert(item.timestamp === null || timestamp !== null, `${label}[${index}] timestamp must be a parseable media timestamp`);
    assert(item.frame === null || frame !== null, `${label}[${index}] frame must be a positive frame identifier/count`);
    if (item.status === "FAIL") assert(timestamp !== null || frame !== null, `${label}[${index}] FAIL requires a timestamp or frame`);
    else assert(timestamp === null && frame === null, `${label}[${index}] non-FAIL cannot carry a failure timestamp/frame`);
    return { checkId: cleanText(item.checkId, `${label}[${index}].checkId`), status: item.status, result: cleanText(item.result, `${label}[${index}].result`), timestamp, frame };
  });
}

const PENDING_SENTINEL = /\b(?:pending|not[ -]?reviewed|not[ -]?inspected|unreviewed|limitation|not[ -]?observed)\b/i;
const FAILURE_TOKEN = /\b(?:fail|failed|failure)\b/i;
const PASS_TOKEN = /\b(?:pass|passed)\b/i;

function assertStatusText(texts, status, label) {
  for (const text of texts) {
    if (status === "PASS" && (PENDING_SENTINEL.test(text) || FAILURE_TOKEN.test(text))) throw new Error(`${label} PASS text contradicts its status`);
    if (status === "FAIL" && PENDING_SENTINEL.test(text)) throw new Error(`${label} FAIL text contains pending/not-reviewed/limitation language`);
    if (status === "PENDING HUMAN REVIEW" && (FAILURE_TOKEN.test(text) || PASS_TOKEN.test(text)) && !PENDING_SENTINEL.test(text)) throw new Error(`${label} pending text contradicts its status`);
    if (status === "LIMITATION" && (FAILURE_TOKEN.test(text) || PASS_TOKEN.test(text))) throw new Error(`${label} LIMITATION text contradicts its status`);
  }
}

function validateFailureReferences(value, status, label, failedChecks = []) {
  assert(Array.isArray(value), `${label} failureReferences must be an array`);
  const references = value.map((reference, index) => {
    assert(reference && typeof reference === "object" && !Array.isArray(reference), `${label} failureReferences[${index}] must be an object`);
    const check = cleanText(reference.check, `${label} failure check`);
    const timestamp = reference.timestamp === null || reference.timestamp === undefined ? null : parseMediaTimestamp(reference.timestamp);
    const frame = reference.frame === null || reference.frame === undefined ? null : parseFrameReference(reference.frame);
    assert(reference.timestamp === null || reference.timestamp === undefined || timestamp !== null, `${label} failure timestamp must be a parseable media timestamp`);
    assert(reference.frame === null || reference.frame === undefined || frame !== null, `${label} failure frame must be a positive frame identifier/count`);
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

function validateHumanIdentity(entry, filename, status) {
  if (status === "PENDING HUMAN REVIEW") return;
  const device = entry.device;
  const osName = entry.os;
  const browser = entry.browser ?? "";
  if (filename.startsWith("iphone-safari-")) {
    assert(/\biphone\b/i.test(device) && !/\b(?:desktop|pc|android|simulat)/i.test(device), `${filename} device must identify a physical iPhone`);
    assert(/\bios\b/i.test(osName) && !/\b(?:windows|android|macos)\b/i.test(osName), `${filename} OS must identify iOS`);
    assert(/\bsafari\b/i.test(browser) && !/\b(?:chrome|firefox|edge)\b/i.test(browser), `${filename} browser must identify Safari`);
  } else if (filename === "physical-scroll-input.mp4") {
    assert(/\bphysical\b/i.test(device) && /\b(?:mouse|trackpad)\b/i.test(device) && !/\b(?:simulat|proxy|virtual|generic)\w*\b/i.test(device), `${filename} device must identify physical mouse or trackpad input`);
  } else if (filename === "chrome-200-percent.mp4") {
    assert(/\b(?:desktop|laptop|pc|computer)\b/i.test(device) && !/\b(?:mobile|iphone|simulat|proxy)\w*\b/i.test(device), `${filename} device must identify a physical desktop/laptop computer`);
    assert(/\bchrome\b/i.test(browser) && !/\b(?:safari|firefox|edge)\b/i.test(browser), `${filename} browser must identify Chrome`);
  }
}

function validateObservationBindings(observations, expectedChecks, references, label) {
  const expectedIds = [...expectedChecks.keys()].sort();
  const observedIds = observations.map(({ checkId }) => checkId).sort();
  assert(JSON.stringify(observedIds) === JSON.stringify(expectedIds), `${label} observations must bind every required check exactly once`);
  assert(new Set(observedIds).size === observedIds.length, `${label} observations contain a duplicate checkId`);
  for (const observation of observations) {
    const expectedStatus = expectedChecks.get(observation.checkId);
    assert(observation.status === expectedStatus, `${label} observation ${observation.checkId} status contradicts its check/result`);
    assertStatusText([observation.result], observation.status, `${label} observation ${observation.checkId}`);
    if (observation.status === "FAIL") {
      assert(references.some((reference) => reference.check === observation.checkId
        && reference.timestamp === observation.timestamp && reference.frame === observation.frame), `${label} FAIL observation ${observation.checkId} is not bound to a matching failureReference`);
    }
  }
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
      assert(typeof outcome.checks[check] === "boolean" || (outcome.status === "PENDING HUMAN REVIEW" && outcome.checks[check] === null), `chrome-200-percent route ${outcome.route} check ${check} must be boolean or null only while pending`);
      return [check, outcome.checks[check]];
    }));
    const failedChecks = ZOOM_ROUTE_CHECKS.filter((check) => checks[check] === false);
    if (outcome.status === "PASS") assert(failedChecks.length === 0, `chrome-200-percent PASS route ${outcome.route} contains a failed check`);
    if (outcome.status === "FAIL") assert(failedChecks.length > 0, `chrome-200-percent FAIL route ${outcome.route} contains no failed check`);
    if (outcome.status !== "FAIL") assert(failedChecks.length === 0, `chrome-200-percent route ${outcome.route} contains a false check without FAIL status`);
    if (outcome.status === "PENDING HUMAN REVIEW") assert(Object.values(checks).every((result) => result === null), `chrome-200-percent pending route ${outcome.route} requires every check to be null`);
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
  if (status === "PENDING HUMAN REVIEW") assert(Object.values(checks).every((result) => result === null), `${filename} pending review requires every required check to be null`);
  return checks;
}

function statusFromZoomRoutes(outcomes) {
  if (outcomes.some(({ status }) => status === "FAIL")) return "FAIL";
  if (outcomes.every(({ status }) => status === "PASS")) return "PASS";
  return "PENDING HUMAN REVIEW";
}

export function validateReviewEntry(entry, expectedFilename, mediaBinding = null) {
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
    reviewedSha256: entry.reviewedSha256,
    reviewedByteSize: entry.reviewedByteSize,
  };
  if (entry.status === "PENDING HUMAN REVIEW") {
    assert(entry.reviewedSha256 === null && entry.reviewedByteSize === null, `${expectedFilename} pending review must not claim a reviewed byte identity`);
  } else {
    assert(/^[a-f0-9]{64}$/.test(entry.reviewedSha256 ?? "") && Number.isSafeInteger(entry.reviewedByteSize) && entry.reviewedByteSize > 0, `${expectedFilename} PASS/FAIL review requires reviewedSha256 and reviewedByteSize`);
  }
  let mediaValidation = null;
  if (mediaBinding) {
    mediaValidation = validateMediaValidation(mediaBinding.mediaValidation, expectedFilename);
    assert(mediaBinding.filename === expectedFilename && /^[a-f0-9]{64}$/.test(mediaBinding.sha256 ?? "")
      && Number.isSafeInteger(mediaBinding.byteSize) && mediaBinding.byteSize > 0, `${expectedFilename} media binding is incomplete`);
    if (entry.status !== "PENDING HUMAN REVIEW") {
      assert(entry.reviewedSha256 === mediaBinding.sha256 && entry.reviewedByteSize === mediaBinding.byteSize, `${expectedFilename} review is not bound to the supplied recording bytes`);
    }
    normalized.mediaValidation = mediaValidation;
  }
  validateHumanIdentity(normalized, expectedFilename, entry.status);
  if (expectedFilename.startsWith("iphone-safari-")) assert(/safari/i.test(normalized.browser ?? ""), `${expectedFilename} browser must identify Safari`);
  if (expectedFilename === "chrome-200-percent.mp4") assert(/chrome/i.test(normalized.browser ?? ""), "chrome-200-percent browser must identify Chrome");
  const deviceChecks = validateDeviceChecks(entry.checks, expectedFilename, entry.status);
  if (deviceChecks) normalized.checks = deviceChecks;
  let failedChecks = deviceChecks ? Object.entries(deviceChecks).filter(([, result]) => result === false).map(([check]) => check) : [];
  const expectedObservationChecks = new Map();
  if (deviceChecks) {
    for (const [check, result] of Object.entries(deviceChecks)) expectedObservationChecks.set(check, result === false ? "FAIL" : result === null ? "PENDING HUMAN REVIEW" : "PASS");
  }
  if (expectedFilename === "chrome-200-percent.mp4") {
    if (entry.status === "PENDING HUMAN REVIEW") {
      assert(entry.genuineBrowserZoom === null && entry.zoomPercent === null && entry.proxy === null, "chrome-200-percent pending review must keep zoom authority null");
      normalized.genuineBrowserZoom = null;
      normalized.zoomPercent = null;
      normalized.proxy = null;
    } else {
      assert(entry.genuineBrowserZoom === true, "chrome-200-percent must be genuine browser zoom");
      assert(entry.zoomPercent === 200, "chrome-200-percent zoomPercent must be 200");
      assert(entry.proxy === false, "chrome-200-percent cannot be a proxy");
      normalized.genuineBrowserZoom = true;
      normalized.zoomPercent = 200;
      normalized.proxy = false;
    }
    normalized.routeOutcomes = validateZoomRouteOutcomes(entry.routeOutcomes);
    if (entry.status === "PENDING HUMAN REVIEW") assert(normalized.routeOutcomes.every(({ status }) => status === "PENDING HUMAN REVIEW"), "chrome-200-percent pending review requires all ten routes to remain pending");
    const derivedStatus = statusFromZoomRoutes(normalized.routeOutcomes);
    assert(entry.status === derivedStatus, `chrome-200-percent entry status must be ${derivedStatus} from its ten route statuses`);
    failedChecks = [];
    for (const outcome of normalized.routeOutcomes) {
      for (const check of ZOOM_ROUTE_CHECKS) {
        const checkId = `${outcome.route}:${check}`;
        expectedObservationChecks.set(checkId, outcome.checks[check] === false ? "FAIL" : outcome.status === "PENDING HUMAN REVIEW" ? "PENDING HUMAN REVIEW" : "PASS");
      }
    }
  }
  normalized.failureReferences = validateFailureReferences(entry.failureReferences, entry.status, expectedFilename, failedChecks);
  const allReferences = [...normalized.failureReferences];
  if (normalized.routeOutcomes) {
    for (const outcome of normalized.routeOutcomes) {
      for (const reference of outcome.failureReferences) allReferences.push({ ...reference, check: `${outcome.route}:${reference.check}` });
    }
  }
  validateObservationBindings(normalized.observations, expectedObservationChecks, allReferences, expectedFilename);
  if (mediaValidation) validateEvidencePositions(allReferences, mediaValidation, expectedFilename);
  assertStatusText([...normalized.testSteps, ...normalized.observations.map(({ result }) => result), normalized.observedResult], entry.status, expectedFilename);
  return normalized;
}

export function validateReviews(document, inventoryFiles = []) {
  assert(document?.schema === REVIEW_SCHEMA, `review schema must be ${REVIEW_SCHEMA}`);
  assert(Array.isArray(document.entries) && document.entries.length === REQUIRED_RECORDINGS.length, "review must contain exactly four entries");
  const byFilename = new Map();
  for (const entry of document.entries) {
    assert(!byFilename.has(entry?.filename), `duplicate review entry: ${entry?.filename ?? "missing filename"}`);
    byFilename.set(entry.filename, entry);
  }
  const mediaByFilename = new Map(inventoryFiles.map((record) => [record.filename, record]));
  return REQUIRED_RECORDINGS.map((filename) => validateReviewEntry(byFilename.get(filename), filename, mediaByFilename.get(filename) ?? null));
}

function pendingReview(filename) {
  const record = {
    filename,
    evidenceClass: "PHYSICAL HUMAN RECORDING",
    device: "Not reviewed",
    os: "Not reviewed",
    browser: filename.startsWith("iphone-safari-") ? "Safari (version not reviewed)" : filename === "chrome-200-percent.mp4" ? "Chrome (version not reviewed)" : null,
    browserVersion: null,
    testSteps: ["Inspect the supplied recording and document every visibly demonstrated step."],
    observations: [],
    observedResult: "Pending visual inspection; file presence alone is not evidence of a pass.",
    status: "PENDING HUMAN REVIEW",
    reviewedSha256: null,
    reviewedByteSize: null,
    failureReferences: [],
  };
  if (DEVICE_REVIEW_CHECKS[filename]) {
    record.checks = Object.fromEntries(DEVICE_REVIEW_CHECKS[filename].map((check) => [check, null]));
    record.observations = DEVICE_REVIEW_CHECKS[filename].map((check) => ({ checkId: check, status: "PENDING HUMAN REVIEW", result: "Pending visual inspection.", timestamp: null, frame: null }));
  } else {
    record.genuineBrowserZoom = null;
    record.zoomPercent = null;
    record.proxy = null;
    record.routeOutcomes = ZOOM_ROUTE_OUTCOMES.map((route) => ({
      route,
      status: "PENDING HUMAN REVIEW",
      checks: Object.fromEntries(ZOOM_ROUTE_CHECKS.map((check) => [check, null])),
      failureReferences: [],
    }));
    record.observations = record.routeOutcomes.flatMap((outcome) => ZOOM_ROUTE_CHECKS.map((check) => ({ checkId: `${outcome.route}:${check}`, status: "PENDING HUMAN REVIEW", result: "Pending visual inspection.", timestamp: null, frame: null })));
  }
  return record;
}

function overallStatus(entries) {
  if (entries.some(({ status }) => status === "FAIL")) return "FAIL";
  if (entries.every(({ status }) => status === "PASS")) return "PASS";
  return "PENDING HUMAN REVIEW";
}

export async function inventoryRecordings(inputRoot) {
  if (!(await exists(inputRoot))) return { rootExists: false, missing: [...REQUIRED_RECORDINGS], files: [] };
  const rootInfo = await lstat(inputRoot);
  assert(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), "human evidence root must be a real directory, not a link");
  const resolvedRoot = await realpath(inputRoot);
  const missing = [];
  const present = [];
  for (const filename of REQUIRED_RECORDINGS) {
    const candidate = path.join(resolvedRoot, filename);
    if (!(await exists(candidate))) { missing.push(filename); continue; }
    const info = await lstat(candidate);
    if (!info.isFile() || info.isSymbolicLink()) { missing.push(filename); continue; }
    const resolved = await realpath(candidate);
    assert(path.dirname(resolved) === resolvedRoot, `${filename} resolves outside the human evidence root`);
    present.push({ filename, resolved });
  }
  if (missing.length) return { rootExists: true, missing, files: [] };
  const files = [];
  for (const { filename, resolved } of present) {
    const fileInfo = await stat(resolved);
    assert(fileInfo.size > 0, `${filename} is empty`);
    const bytes = await readFile(resolved);
    const structure = validateMp4Structure(bytes, filename);
    files.push({ filename, byteSize: fileInfo.size, sha256: createHash("sha256").update(bytes).digest("hex"), mediaValidation: mediaValidationFromStructure(structure) });
  }
  return { rootExists: true, missing, files };
}

export async function ingestHumanEvidence(options) {
  validateOptions(options);
  if (await exists(options.output)) throw new Error(`refusing to overwrite output: ${options.output}`);
  const inventory = await inventoryRecordings(options.inputRoot);
  let reviews = null;
  if (!inventory.missing.length && options.reviews) reviews = validateReviews(JSON.parse(await readFile(options.reviews, "utf8")), inventory.files);
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
    policy: { ...HUMAN_EVIDENCE_POLICY },
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
