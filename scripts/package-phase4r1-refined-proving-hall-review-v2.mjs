#!/usr/bin/env node

/**
 * Deterministically assemble the Phase 4-R1 recovery + refined Proving Hall
 * human-review package (v2).
 *
 * This consumer is deliberately fail closed. It never runs Blender, never
 * starts or resumes the 540-frame Cycles production render, never integrates
 * cinematic media into the runtime, and never makes a human acceptance
 * decision. Producer outputs remain outside Git; only authenticated review
 * derivatives are copied into a fresh external package.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const PACKAGER_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(PACKAGER_FILE), "..");

const CONTRACT_SCHEMA = "quantum-hub.phase-4-r1.refined-proving-hall.packager-input.v2";
const PACKAGE_SCHEMA = "quantum-hub.phase-4-r1.refined-proving-hall.review-package.v2";
const RESULT_SCHEMA = "quantum-hub.phase-4-r1.refined-proving-hall.review-package.detached-checksum.v2";
const EXPECTED_BRANCH = "redirect/phase-4r1-proving-hall-environment";
const EXPECTED_PARENT = "4fd17810d47697785e66584a7ef40199ff597ba1";
const RECOVERY_START_HEAD = "3c73a51f976272343d32ede89fc12d1fab228f80";
const RECOVERY_CHECKPOINT_HEAD = "5cb0ad10c64db810e4719c08e42c9f4120593885";
const RECOVERED_SOURCE_AUTHORITY = Object.freeze({ bytes: 3_081_427, sha256: "e24ccf974a57c0a5ffad48a42d07238138bf7e519da0494f5b9329f2a8b60e87" });
const MAIN_AUTHORITY = "501040c42bba30b9d9517b88a8f9857992a2dba4";
const PHASE4_AUTHORITY = "ce7bd0cb61bf4b9abd81303d89c5ac1aef089e0c";
const Q_WHITE_SHA256 = "c660ed87bc5293bfbffa662e523343a7e83bc86cb94848912494e85e0dc9d4ff";
const Q_COLOR_SHA256 = "04dc37965b33587fea5f4664660f8a7f9a81ec7904d39925b41c6826b80cded9";
const Q_WHITE_PATH = "public/brand/quantum-icon-white.svg";
const Q_COLOR_PATH = "public/brand/quantum-icon-color.svg";
const FIXED_EPOCH = "1980-01-01T00:00:00.000Z";
const ARCHIVE_FILENAME = "phase-4r1-proving-hall-environment-review-v2.zip";
const MANIFEST_FILENAME = "phase-4r1-proving-hall-environment-review-v2-manifest.json";
const RESULT_FILENAME = "phase-4r1-proving-hall-environment-review-v2-result.json";
const README_FILENAME = "README.md";
const CLASSIFICATION = "PHASE 4-R1 RECOVERY + REFINED PROVING HALL PREPRODUCTION · HUMAN UNACCEPTED · COMPLETE 540-FRAME CYCLES FILM NOT AUTHORIZED · REFINED PHYSICAL MEDIA RUNTIME INTEGRATION NOT AUTHORIZED · PHASE 5 UNAUTHORIZED";

const SOURCE_SCHEMAS = Object.freeze({
  recoveryReport: "quantum-hub.phase-4-r1.recovery-report.v2",
  recoveryBackupSummary: "quantum-hub.phase-4-r1.recovery-backup-summary.v2",
  sourceBuild: "quantum-hub.phase-4-r1.refined-proving-hall.source-build.v2",
  sourceValidation: "quantum-hub.phase-4-r1.refined-proving-hall.source-validation.v2",
  assetLedger: "quantum-hub.phase-4-r1.refined-proving-hall.asset-ledger.v2",
  qProvenance: "quantum-hub.phase-4-r1.exact-q-provenance.v2",
});

const EVIDENCE_SCHEMAS = Object.freeze({
  environmentProof: "quantum-hub.phase-4-r1.refined-proving-hall.sparse-proof.v2",
  previews: "quantum-hub.phase-4-r1.refined-proving-hall.previews.v2",
  cyclesStills: "quantum-hub.phase-4-r1.refined-proving-hall.cycles-benchmarks.v2",
  cyclesMotion: "quantum-hub.phase-4-r1.refined-proving-hall.cycles-motion.v2",
  chrome: "quantum-hub.phase-4r1.chrome-evidence.v2",
  responsive: "quantum-hub.phase-4-r1.refined-proving-hall.responsive-evidence.v2",
});

const SOURCE_KEYS = Object.freeze(Object.keys(SOURCE_SCHEMAS));
const EVIDENCE_KEYS = Object.freeze(Object.keys(EVIDENCE_SCHEMAS));
const SOURCE_PRODUCER_IDS = Object.freeze([
  "config",
  "builder",
  "preflight",
  "validator",
  "exact-q-generator",
  "sparse-proof-renderer",
  "preview-renderer",
  "cycles-benchmarks-renderer",
]);
const HUMAN_REVIEW_GATES = Object.freeze({
  recoveryAndProvenanceSafety: null,
  darkProvingHallArtDirection: null,
  centralSpiralAndCrtComposition: null,
  cableOriginAndSimpleCrtConnection: null,
  currentLegibility: null,
  exactQuantumQFidelity: null,
  cleanCinematicChromeSuppression: null,
  cameraAndThresholdRegression: null,
  materialAndFinalQualityLighting: null,
});

const FINAL_HANDOFF_COVERAGE = Object.freeze([
  { item: 1, subject: "actual interrupted-task cause / strongest supported diagnosis", authority: "recoveryReport.errorInvestigation + reports/phase4r1-actual-error-investigation.json" },
  { item: 2, subject: "prompt_cache_retention cause classification", authority: "recoveryReport.errorInvestigation.promptCacheRetentionWasTaskEndingCause" },
  { item: 3, subject: "current branch", authority: "repository.branch; exact live Git validation" },
  { item: 4, subject: "starting HEAD found during recovery", authority: "recoveryReport.git.startingHead" },
  { item: 5, subject: "final HEAD", authority: "repository.head; HEAD/upstream/live-remote parity" },
  { item: 6, subject: "exact parent", authority: "repository.directParent + accepted R0 ancestor" },
  { item: 7, subject: "clean-tree status", authority: "repository.cleanTree; packaging refuses a dirty tree" },
  { item: 8, subject: "upstream/remote parity", authority: "repository upstream/live-remote fields" },
  { item: 9, subject: "main unchanged", authority: "repository.localMain/liveRemoteMain exact frozen SHA" },
  { item: 10, subject: "external recovery-backup path", authority: "live final handoff; ZIP stores only recovery alias and redacts private absolute paths" },
  { item: 11, subject: "backup inventory", authority: "recoveryBackupSummary.files + inventorySummary" },
  { item: 12, subject: "backup sizes and SHA-256 hashes", authority: "recoveryBackupSummary.files independently schema-validated" },
  { item: 13, subject: "recovered Blender candidates", authority: "recoveryReport.blenderCandidates" },
  { item: 14, subject: "selected Blender source and reason", authority: "recoveryReport.selectedSource.reason + validation" },
  { item: 15, subject: "selected Blender bytes and SHA-256", authority: "frozen recovered-source authority e24ccf…; recovery provenance only" },
  { item: 16, subject: "recovery checkpoint commit", authority: "recoveryReport.git.checkpointHead + verified final-HEAD ancestry" },
  { item: 17, subject: "partial renders found", authority: "recoveryReport.renderInventory/partialRenders" },
  { item: 18, subject: "frames or outputs reused", authority: "recovery inventory plus all final visual manifests require reusedRecoveredOldVisualEvidence:false" },
  { item: 19, subject: "frames or outputs regenerated", authority: "previews/environment/Cycles/responsive manifests and packaged output ledger" },
  { item: 20, subject: "central-floor visible-object inventory", authority: "central-floor audit; exact hero set CRT + spiral cable" },
  { item: 21, subject: "wall/perimeter-detail inventory", authority: "sourceBuild.design.environment + perimeter/shadow sheets" },
  { item: 22, subject: "palette and lighting summary", authority: "palette audit + sourceBuild design/environment" },
  { item: 23, subject: "no bright white factory lighting", authority: "palette.brightWhiteFactoryPanels:false + dark dormant sheet" },
  { item: 24, subject: "cable geometry measurements", authority: "desktop/mobile/landscape cable audits" },
  { item: 25, subject: "outer cable-origin treatment", authority: "family cable audits + cable-origin sheet" },
  { item: 26, subject: "lower-rear CRT connection", authority: "family cable audits + rear-connection close-up" },
  { item: 27, subject: "current mask and continuity", authority: "family current audits + continuous-current sheet/excerpts" },
  { item: 28, subject: "camera measurements", authority: "family camera audits + camera-path sheet" },
  { item: 29, subject: "official Q source path and SHA-256", authority: "verified repository SVG authorities + Q provenance" },
  { item: 30, subject: "screen texture path and SHA-256", authority: "Q provenance screen-texture roles" },
  { item: 31, subject: "Q overlay/difference validation", authority: "zero-difference Q metrics + overlay/difference/silhouette/aspect files" },
  { item: 32, subject: "cinematic chrome suppression", authority: "chrome machine report/controller producer authority + visibility sheets/recordings" },
  { item: 33, subject: "no-first-paint flash", authority: "two first-paint states and no-first-paint-flash checks" },
  { item: 34, subject: "fallback and accessibility results", authority: "chrome state/check matrix + fallbacks/skip/reverse evidence" },
  { item: 35, subject: "Cycles stills and motion samples", authority: "seven Cycles still roles + two bounded Cycles motion roles" },
  { item: 36, subject: "package path", authority: "fresh external output root + exact v2 ZIP filename" },
  { item: 37, subject: "package byte size", authority: "detached result archive.bytes" },
  { item: 38, subject: "package SHA-256", authority: "detached result archive.sha256" },
  { item: 39, subject: "manifest path, size and SHA-256", authority: "detached result manifest record" },
  { item: 40, subject: "repository-size delta", authority: "repository.repositorySize baseline/current/delta" },
  { item: 41, subject: "genuine blockers or evidence limitations", authority: "producer limitations + live final handoff; automation cannot hide a blocker" },
  { item: 42, subject: "complete 540-frame Cycles render not newly started/resumed", authority: "input/report/package authorization gates all exactly false" },
  { item: 43, subject: "Phase 5 remains unauthorized", authority: "input/report/package phase5Authorized gates all exactly false" },
]);

const PREVIEW_ROLES = Object.freeze({
  "desktop-forward": Object.freeze({ filename: "phase4r1-refined-desktop-forward.mp4", width: 1440, height: 900, frames: 540, fps: 30 }),
  "mobile-forward": Object.freeze({ filename: "phase4r1-refined-mobile-forward.mp4", width: 390, height: 844, frames: 540, fps: 30 }),
  "landscape-forward": Object.freeze({ filename: "phase4r1-refined-landscape-forward.mp4", width: 844, height: 390, frames: 540, fps: 30 }),
  "desktop-reverse": Object.freeze({ filename: "phase4r1-refined-desktop-reverse.mp4", width: 1440, height: 900, frames: 540, fps: 30 }),
  "current-travel-excerpt": Object.freeze({ filename: "phase4r1-refined-current-travel-excerpt.mp4", width: 1440, height: 900, minimumFrames: 30, maximumFrames: 540, fps: 30 }),
  "q-threshold-excerpt": Object.freeze({ filename: "phase4r1-refined-q-threshold-excerpt.mp4", width: 1440, height: 900, minimumFrames: 30, maximumFrames: 540, fps: 30 }),
});

const ENVIRONMENT_ROLES = Object.freeze([
  "dark-dormant-factory-sheet",
  "wide-to-tight-cable-sheet",
  "central-floor-object-audit-sheet",
  "perimeter-wall-detail-sheet",
  "shadow-composition-sheet",
  "cable-origin-sheet",
  "simple-rear-connection-closeup",
  "continuous-current-sheet",
  "camera-path-evidence-sheet",
]);

const ENVIRONMENT_AUDIT_ROLES = Object.freeze([
  "central-floor-object-audit",
  "palette-audit",
  "cable-geometry-audit",
  "current-continuity-audit",
  "camera-audit",
  "exact-q-fidelity-audit",
]);

const Q_PROVENANCE_ROLES = Object.freeze([
  "official-white-svg",
  "official-color-svg",
  "screen-texture-white",
  "screen-texture-color",
  "pre-crt-effect-q",
  "official-source-overlay",
  "difference-image",
  "silhouette-comparison",
  "aspect-ratio-comparison",
]);

const CYCLES_STILL_ROLES = Object.freeze([
  "desktop-dormant-wide",
  "desktop-early-current",
  "desktop-mid-conduction",
  "desktop-rear-orbit",
  "desktop-q-activation",
  "desktop-late-approach",
  "mobile-mid-conduction",
]);

const CYCLES_MOTION_ROLES = Object.freeze({
  "current-proving-hall": Object.freeze({ minimumFrames: 30, maximumFrames: 180, fps: 30 }),
  "q-threshold": Object.freeze({ minimumFrames: 30, maximumFrames: 180, fps: 30 }),
});
const REFINED_FAMILIES = Object.freeze(["desktop", "mobile", "landscape"]);
const FAMILY_TURN_RANGES = Object.freeze({
  desktop: Object.freeze([3.25, 3.75]),
  mobile: Object.freeze([2.50, 3.25]),
  landscape: Object.freeze([2.75, 3.75]),
});

const RESPONSIVE_ROLE_IDS = Object.freeze([
  "mobile-390x844",
  "mobile-360x800",
  "narrow-320x800",
  "tablet-portrait-768x1024",
  "landscape-844x390",
  "landscape-740x360",
  "landscape-800x360",
  "landscape-896x414",
  "landscape-900x480",
]);
const RESPONSIVE_VIEWPORTS = Object.freeze({
  "mobile-390x844": Object.freeze({ width: 390, height: 844, family: "mobile", physicalFit: "cover", provisional: false }),
  "mobile-360x800": Object.freeze({ width: 360, height: 800, family: "mobile", physicalFit: "cover", provisional: false }),
  "narrow-320x800": Object.freeze({ width: 320, height: 800, family: "mobile", physicalFit: "cover", provisional: false }),
  "tablet-portrait-768x1024": Object.freeze({ width: 768, height: 1024, family: "mobile", physicalFit: "contain", provisional: true, background: "#020204" }),
  "landscape-844x390": Object.freeze({ width: 844, height: 390, family: "landscape", physicalFit: "cover", provisional: false }),
  "landscape-740x360": Object.freeze({ width: 740, height: 360, family: "landscape", physicalFit: "cover", provisional: false }),
  "landscape-800x360": Object.freeze({ width: 800, height: 360, family: "landscape", physicalFit: "cover", provisional: false }),
  "landscape-896x414": Object.freeze({ width: 896, height: 414, family: "landscape", physicalFit: "cover", provisional: false }),
  "landscape-900x480": Object.freeze({ width: 900, height: 480, family: "landscape", physicalFit: "cover", provisional: false }),
});

const CHROME_STATE_IDS = Object.freeze([
  "first-paint-desktop",
  "first-paint-mobile",
  "dormancy",
  "conduction-25",
  "conduction-50",
  "q-activation",
  "q-hold",
  "approach",
  "threshold",
  "breathing",
  "entry-first-readable",
  "entry-settled",
  "reverse-one-step",
  "fast-jump-forward",
  "fast-jump-reverse",
  "fast-jump-latest",
  "skip-media-pending",
  "reduced-motion",
  "no-javascript",
  "deep-link-entry",
  "deep-link-method",
  "restored-settled",
  "restored-lower",
  "text-200-desktop",
  "text-200-mobile",
  "media-abort",
  "media-404",
  "supporting-about",
  "real-404",
]);
const CHROME_SUPPLEMENTAL_STATE_IDS = Object.freeze([
  "mobile-dormancy",
  "mobile-conduction-25",
  "mobile-conduction-50",
  "mobile-q-activation",
  "mobile-q-hold",
  "mobile-approach",
  "mobile-threshold",
  "mobile-breathing",
  "mobile-entry-first-readable",
  "mobile-entry-settled",
  "mobile-reverse-one-step",
]);

const CHROME_REQUIRED_CHECK_IDS = Object.freeze([
  "semantic-h1-single", "semantic-entry-route-count-two", "horizontal-overflow-safe", "native-document-scroll-authority", "runtime-proxy-labeled",
  "root-state-concealed", "header-visibility-hidden", "header-opacity-zero", "header-pointer-events-none", "header-inert", "header-hit-test-excluded",
  "header-focusable-descendants-zero", "header-visible-chrome-zero", "mobile-menu-closed", "entry-inert", "entry-pointer-events-none",
  "entry-focusable-descendants-zero", "shell-interactive-false", "root-state-released", "header-visibility-visible", "header-opacity-one",
  "header-pointer-active", "header-not-inert", "header-hit-test-active", "header-visible-chrome-present", "entry-not-inert", "entry-pointer-active",
  "entry-focusable-descendants-two", "controller-request-held", "bootstrap-before-body", "no-first-paint-flash", "proxy-milestone-declared",
  "settled-boundary-at-least-0.9995", "reverse-below-settle-boundary", "reverse-focus-safe", "reverse-menu-closed", "latest-position-wins",
  "skip-media-request-pending", "skip-hash-entry", "skip-settled", "skip-focus-entry", "skip-media-not-required", "fallback-reduced-motion",
  "fallback-controller-not-requested", "fallback-media-not-requested", "nojs-no-root-state", "nojs-header-released", "fallback-deep-link",
  "restored-first-paint-released", "restored-history-marker", "fallback-text-zoom", "root-font-size-200-percent", "fallback-static",
  "media-failure-reason", "media-node-dormant", "supporting-cinematic-isolation", "supporting-header-visible", "supporting-h1-single", "route-http-status",
]);

const CHROME_ARTIFACT_ROLES = Object.freeze([
  "CHROME_FIRST_PAINT_DESKTOP",
  "CHROME_FIRST_PAINT_MOBILE",
  "CHROME_MILESTONES_DESKTOP_SHEET",
  "CHROME_MILESTONES_MOBILE_SHEET",
  "CHROME_REVEAL_REVERSE_RECORDING",
  "CHROME_SKIP_PENDING_RECORDING",
  "CHROME_FALLBACKS_SHEET",
]);
const CHROME_RECORDING_ROLES = Object.freeze({
  CHROME_REVEAL_REVERSE_RECORDING: Object.freeze({ reportKey: "revealReverse", width: 1440, height: 900, frames: 17, fps: 8 }),
  CHROME_SKIP_PENDING_RECORDING: Object.freeze({ reportKey: "skipMediaPending", width: 1440, height: 900, frames: 8, fps: 8 }),
});
const CHROME_REPORT_ROLE = "CHROME_MACHINE_REPORT";

const TEXT_EXTENSIONS = new Set([".json", ".md", ".txt", ".csv", ".svg"]);

function lexicalCompare(left, right) {
  return left.localeCompare(right, "en", { sensitivity: "variant", numeric: false });
}

function normalizedPath(value) {
  return path.resolve(value).replaceAll("\\", "/").replace(/\/$/, "").toLowerCase();
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function validHash(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function exactKeys(value, required, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const keys = Object.keys(value);
  for (const key of required) if (!(key in value)) throw new Error(`${label} lacks required key ${key}`);
  for (const key of keys) if (!allowed.includes(key)) throw new Error(`${label} has unsupported key ${key}`);
}

function assertString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function assertBoolean(value, expected, label) {
  if (value !== expected) throw new Error(`${label} must be exactly ${expected}`);
}

function assertInteger(value, minimum, label) {
  if (!Number.isInteger(value) || value < minimum) throw new Error(`${label} must be an integer >= ${minimum}`);
  return value;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function sha256File(filename) {
  return sha256(await readFile(filename));
}

async function pathExists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function assertFile(candidate, label) {
  const resolved = await realpath(path.resolve(candidate));
  const details = await stat(resolved);
  if (!details.isFile()) throw new Error(`${label} is not a file: ${candidate}`);
  return resolved;
}

async function assertDirectory(candidate, label) {
  const resolved = await realpath(path.resolve(candidate));
  const details = await stat(resolved);
  if (!details.isDirectory()) throw new Error(`${label} is not a directory: ${candidate}`);
  return resolved;
}

async function readJson(filename, label) {
  let value;
  try {
    value = JSON.parse(await readFile(filename, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must contain a JSON object`);
  return value;
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function atomicWrite(destination, bytes) {
  const temporary = `${destination}.tmp-${process.pid}`;
  await writeFile(temporary, bytes);
  try {
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function atomicJson(destination, value) {
  await atomicWrite(destination, stableJson(value));
}

function resolveContractPath(contractPath, supplied) {
  assertString(supplied, "contract path");
  return path.resolve(path.dirname(contractPath), supplied);
}

function parseArguments(argv) {
  const options = {
    inputContract: null,
    output: null,
    ffmpeg: process.env.FFMPEG_PATH ?? null,
    help: false,
    printInputContract: false,
    printProducerChecklist: false,
    validateInputContract: false,
    selfTestContract: false,
    selfTestInvalidContract: false,
    selfTestMediaPrivacy: false,
    selfTestZip: false,
    mediaPrivacyFixture: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (["--input-contract", "--output", "--ffmpeg"].includes(value)) {
      const supplied = argv[index + 1];
      if (!supplied || supplied.startsWith("--")) throw new Error(`${value} requires a value`);
      if (value === "--input-contract") options.inputContract = path.resolve(supplied);
      else if (value === "--output") options.output = path.resolve(supplied);
      else options.ffmpeg = /[\\/]/.test(supplied) ? path.resolve(supplied) : supplied;
      index += 1;
    } else if (value === "--help" || value === "-h") options.help = true;
    else if (value === "--print-input-contract") options.printInputContract = true;
    else if (value === "--print-producer-checklist") options.printProducerChecklist = true;
    else if (value === "--validate-input-contract") options.validateInputContract = true;
    else if (value === "--self-test-contract") options.selfTestContract = true;
    else if (value === "--self-test-invalid-contract") options.selfTestInvalidContract = true;
    else if (value === "--self-test-zip") options.selfTestZip = true;
    else if (value === "--self-test-media-privacy") {
      options.selfTestMediaPrivacy = true;
      const fixture = argv[index + 1];
      if (fixture && !fixture.startsWith("--")) {
        options.mediaPrivacyFixture = path.resolve(fixture);
        index += 1;
      }
    } else throw new Error(`unknown argument: ${value}`);
  }
  if (options.help || options.printInputContract || options.printProducerChecklist || options.selfTestContract || options.selfTestInvalidContract || options.selfTestMediaPrivacy || options.selfTestZip) return options;
  if (!options.inputContract) throw new Error("--input-contract is required");
  if (!options.validateInputContract && !options.output) throw new Error("--output is required unless --validate-input-contract is used");
  return options;
}

function inputContractTemplate() {
  return {
    schema: CONTRACT_SCHEMA,
    status: "READY",
    classification: CLASSIFICATION,
    repository: {
      expectedBranch: EXPECTED_BRANCH,
      expectedParent: EXPECTED_PARENT,
      expectedHead: "<40 lowercase hexadecimal characters>",
      expectedUpstream: "origin/redirect/phase-4r1-proving-hall-environment",
      expectedMain: MAIN_AUTHORITY,
      requireCleanTree: true,
      requireHeadUpstreamParity: true,
      requireLiveRemoteParity: true,
    },
    authorities: Object.fromEntries(SOURCE_KEYS.map((key) => [key, {
      path: `<path to ${key}>`,
      bytes: 1,
      sha256: "<64 lowercase hexadecimal characters>",
    }])),
    derivative: {
      path: "<path to quantum-signal-television-phase4r1-refined-proving-hall.blend>",
      bytes: 1,
      sha256: "<64 lowercase hexadecimal characters>",
    },
    evidence: Object.fromEntries(EVIDENCE_KEYS.map((key) => [key, {
      root: `<external ${key} root>`,
      manifest: `<root-relative ${key} manifest filename>`,
      bytes: 1,
      sha256: "<64 lowercase hexadecimal characters>",
      schema: EVIDENCE_SCHEMAS[key],
    }])),
    authorization: {
      full540FrameCyclesProductionFilmStarted: false,
      full540FrameCyclesProductionFilmResumed: false,
      refinedPhysicalMediaRuntimeIntegrationStarted: false,
      chromeStatePolicyImplementationEvidenced: true,
      humanAccepted: false,
      phase5Authorized: false,
    },
  };
}

function producerChecklist() {
  return {
    schema: "quantum-hub.phase-4-r1.refined-proving-hall.producer-consumer-checklist.v2",
    status: "FROZEN",
    consumer: "scripts/package-phase4r1-refined-proving-hall-review-v2.mjs",
    rules: [
      "Every referenced byte stream is independently size/SHA-256 verified.",
      "Every evidence root is external to Git, exhaustive, non-overlapping, and manifest-bound.",
      "Every manifest and source report uses its exact frozen schema and PASS status.",
      "Every source/evidence producer is independently Git-tracked and size/SHA-256 verified from producerAuthorities.",
      "All paths inside package-facing records are POSIX root-relative paths; private absolute paths are forbidden.",
      "All PNG and MP4 package media passes container-aware private-metadata inspection.",
      "No raw frames, .blend, .blend1, EXR, cache, autosave, or recovery backup is copied.",
      "All nine human gates remain null; automation cannot ACCEPT, REPAIR, or REDIRECT.",
      "Complete 540-frame Cycles production, refined physical-media runtime integration, and Phase 5 remain unauthorized.",
      "Generic productionRendering/runtimeIntegration boundary fields are forbidden; use exact full540FrameCyclesProductionFilm*, refinedPhysicalMediaRuntimeIntegration*, and chromeStatePolicyImplementationEvidenced fields.",
    ],
    sourceReports: SOURCE_SCHEMAS,
    evidenceManifests: EVIDENCE_SCHEMAS,
    artifactRecordContract: {
      required: ["role or roleId", "path or relativePath", "bytes", "sha256"],
      imageRequired: ["mediaType:image/png", "width", "height"],
      pathLaw: "POSIX root-relative canonical path; no .., absolute path, drive, UNC, NUL, or symlink",
      hashLaw: "exact lowercase 64-character SHA-256 independently recomputed by consumer",
    },
    manifestInvariants: {
      status: "PASS (or passed:true only for frozen chrome schema)",
      producerAuthorities: "non-empty object of tracked repo-relative {path,bytes,sha256}",
      exhaustiveRoot: "all files except the manifest itself must be enumerated exactly once",
      recoveredOldVisualEvidence: false,
    },
    sourceBuildPreservation: {
      exactFields: SOURCE_BUILD_PRESERVATION_KEYS,
      signatureSchema: PRESERVATION_SIGNATURE_SCHEMA,
      persistenceVolatileRnaPropertyExclusionAuthority: PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY,
    },
    previewRoles: PREVIEW_ROLES,
    environmentSheetRoles: ENVIRONMENT_ROLES,
    environmentAuditRoles: ENVIRONMENT_AUDIT_ROLES,
    cyclesStillRoles: CYCLES_STILL_ROLES,
    cyclesMotionRoles: CYCLES_MOTION_ROLES,
    chromeStateIds: CHROME_STATE_IDS,
    chromeSupplementalStateIds: CHROME_SUPPLEMENTAL_STATE_IDS,
    chromeRequiredCheckIds: CHROME_REQUIRED_CHECK_IDS,
    chromeArtifactRoles: CHROME_ARTIFACT_ROLES,
    responsiveRoleIds: RESPONSIVE_ROLE_IDS,
    finalHandoffCoverage: FINAL_HANDOFF_COVERAGE,
  };
}

function printHelp() {
  process.stdout.write(`Phase 4-R1 recovery + refined Proving Hall deterministic review packager v2\n\n`);
  process.stdout.write(`Contract and self-test modes:\n`);
  process.stdout.write(`  node scripts/package-phase4r1-refined-proving-hall-review-v2.mjs --print-input-contract\n`);
  process.stdout.write(`  node scripts/package-phase4r1-refined-proving-hall-review-v2.mjs --print-producer-checklist\n`);
  process.stdout.write(`  node scripts/package-phase4r1-refined-proving-hall-review-v2.mjs --self-test-contract\n`);
  process.stdout.write(`  node scripts/package-phase4r1-refined-proving-hall-review-v2.mjs --self-test-invalid-contract\n`);
  process.stdout.write(`  node scripts/package-phase4r1-refined-proving-hall-review-v2.mjs --self-test-media-privacy [fixture] [--ffmpeg <executable>]\n`);
  process.stdout.write(`  node scripts/package-phase4r1-refined-proving-hall-review-v2.mjs --self-test-zip\n\n`);
  process.stdout.write(`Validation only:\n`);
  process.stdout.write(`  node scripts/package-phase4r1-refined-proving-hall-review-v2.mjs --input-contract <json> --validate-input-contract [--ffmpeg <executable>]\n\n`);
  process.stdout.write(`Final package:\n`);
  process.stdout.write(`  node scripts/package-phase4r1-refined-proving-hall-review-v2.mjs --input-contract <json> --output <fresh external directory> --ffmpeg <executable>\n`);
}

async function runGit(args, options = {}) {
  const result = await execFileAsync("git", args, {
    cwd: ROOT,
    windowsHide: true,
    maxBuffer: 20_000_000,
    timeout: 120_000,
    ...options,
  });
  return result.stdout.trim();
}

async function gitTreeSize(commit) {
  const listing = await runGit(["ls-tree", "-r", "-l", "--full-tree", commit]);
  let files = 0;
  let bytes = 0;
  for (const line of listing.split(/\r?\n/).filter(Boolean)) {
    const match = line.match(/^\d+\s+blob\s+[a-f0-9]{40}\s+(\d+)\t/);
    if (!match) throw new Error(`could not parse Git tree inventory for ${commit}`);
    files += 1;
    bytes += Number(match[1]);
  }
  return { commit, trackedFiles: files, trackedBytes: bytes };
}

async function repositoryState(contractRepository) {
  exactKeys(
    contractRepository,
    ["expectedBranch", "expectedParent", "expectedHead", "expectedUpstream", "expectedMain", "requireCleanTree", "requireHeadUpstreamParity", "requireLiveRemoteParity"],
    ["expectedBranch", "expectedParent", "expectedHead", "expectedUpstream", "expectedMain", "requireCleanTree", "requireHeadUpstreamParity", "requireLiveRemoteParity"],
    "input contract repository",
  );
  if (contractRepository.expectedBranch !== EXPECTED_BRANCH) throw new Error("contract expectedBranch differs from frozen Phase 4-R1 branch");
  if (contractRepository.expectedParent !== EXPECTED_PARENT) throw new Error("contract expectedParent differs from the accepted R0 ancestry authority");
  if (contractRepository.expectedMain !== MAIN_AUTHORITY) throw new Error("contract expectedMain differs from production main authority");
  if (!/^[a-f0-9]{40}$/.test(contractRepository.expectedHead)) throw new Error("contract expectedHead must be an exact lowercase 40-character commit SHA");
  assertBoolean(contractRepository.requireCleanTree, true, "contract requireCleanTree");
  assertBoolean(contractRepository.requireHeadUpstreamParity, true, "contract requireHeadUpstreamParity");
  assertBoolean(contractRepository.requireLiveRemoteParity, true, "contract requireLiveRemoteParity");

  const [branch, head, upstream, status, main, directParent, phase4Ancestor, r0Ancestor, recoveryCheckpointAncestor] = await Promise.all([
    runGit(["branch", "--show-current"]),
    runGit(["rev-parse", "HEAD"]),
    runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]),
    runGit(["status", "--porcelain=v1", "--untracked-files=all"]),
    runGit(["rev-parse", "main"]),
    runGit(["rev-parse", "HEAD^"]),
    runGit(["merge-base", "--is-ancestor", PHASE4_AUTHORITY, "HEAD"]).then(() => true, () => false),
    runGit(["merge-base", "--is-ancestor", EXPECTED_PARENT, "HEAD"]).then(() => true, () => false),
    runGit(["merge-base", "--is-ancestor", RECOVERY_CHECKPOINT_HEAD, "HEAD"]).then(() => true, () => false),
  ]);
  if (branch !== EXPECTED_BRANCH || branch !== contractRepository.expectedBranch) throw new Error(`wrong branch: ${branch}`);
  if (head !== contractRepository.expectedHead) throw new Error(`HEAD ${head} differs from contract ${contractRepository.expectedHead}`);
  if (upstream !== contractRepository.expectedUpstream) throw new Error(`upstream ${upstream} differs from contract ${contractRepository.expectedUpstream}`);
  if (status !== "") throw new Error(`worktree must be clean before final v2 packaging:\n${status}`);
  if (main !== MAIN_AUTHORITY) throw new Error(`local main moved to ${main}`);
  if (!phase4Ancestor || !r0Ancestor || !recoveryCheckpointAncestor) throw new Error("required Phase 4, accepted R0, or recovery-checkpoint ancestry is not intact");
  const upstreamHead = await runGit(["rev-parse", "@{upstream}"]);
  if (upstreamHead !== head) throw new Error(`HEAD/upstream parity failed: ${head} != ${upstreamHead}`);
  const [remoteBranchLine, remoteMainLine, originUrl] = await Promise.all([
    runGit(["ls-remote", "--heads", "origin", `refs/heads/${EXPECTED_BRANCH}`]),
    runGit(["ls-remote", "--heads", "origin", "refs/heads/main"]),
    runGit(["remote", "get-url", "origin"]),
  ]);
  const remoteHead = remoteBranchLine.split(/\s+/)[0];
  const remoteMain = remoteMainLine.split(/\s+/)[0];
  if (remoteHead !== head) throw new Error(`live remote branch differs from HEAD: ${remoteHead} != ${head}`);
  if (remoteMain !== MAIN_AUTHORITY) throw new Error(`live remote main moved to ${remoteMain}`);
  const [headTree, parentTree] = await Promise.all([gitTreeSize(head), gitTreeSize(EXPECTED_PARENT)]);

  return {
    branch,
    head,
    directParent,
    startingParentAncestor: EXPECTED_PARENT,
    upstream,
    upstreamHead,
    liveRemoteHead: remoteHead,
    liveRemoteMain: remoteMain,
    origin: originUrl.replace(/https?:\/\/[^/@]+@/i, "https://[redacted]@"),
    cleanTree: true,
    headUpstreamParity: true,
    liveRemoteParity: true,
    localMain: main,
    mainUnchanged: main === MAIN_AUTHORITY,
    phase4Ancestor: PHASE4_AUTHORITY,
    phase4AncestryIntact: phase4Ancestor,
    acceptedR0AncestryIntact: r0Ancestor,
    recoveryCheckpoint: RECOVERY_CHECKPOINT_HEAD,
    recoveryCheckpointAncestryIntact: recoveryCheckpointAncestor,
    repositorySize: {
      baseline: parentTree,
      current: headTree,
      deltaTrackedFiles: headTree.trackedFiles - parentTree.trackedFiles,
      deltaTrackedBytes: headTree.trackedBytes - parentTree.trackedBytes,
    },
  };
}

async function packagerAuthority() {
  const filename = await assertFile(PACKAGER_FILE, "v2 packager");
  const relative = path.relative(ROOT, filename).replaceAll("\\", "/");
  await runGit(["ls-files", "--error-unmatch", "--", relative]);
  const bytes = await readFile(filename);
  return { path: relative, bytes: bytes.length, sha256: sha256(bytes) };
}

function assertAuthorityShape(record, label) {
  exactKeys(record, ["path", "bytes", "sha256"], ["path", "bytes", "sha256"], label);
  assertString(record.path, `${label}.path`);
  assertInteger(record.bytes, 1, `${label}.bytes`);
  if (!validHash(record.sha256)) throw new Error(`${label}.sha256 must be a lowercase SHA-256`);
  return record;
}

async function resolveContractAuthority(contractPath, record, label, { tracked = true } = {}) {
  assertAuthorityShape(record, `contract ${label}`);
  const filename = await assertFile(resolveContractPath(contractPath, record.path), label);
  const details = await stat(filename);
  const digest = await sha256File(filename);
  if (details.size !== record.bytes || digest !== record.sha256) {
    throw new Error(`${label} authority mismatch: expected ${record.bytes}/${record.sha256}, found ${details.size}/${digest}`);
  }
  let publicPath = path.basename(filename);
  if (tracked) {
    if (!isWithin(ROOT, filename)) throw new Error(`${label} must be inside the repository and tracked`);
    const relative = path.relative(ROOT, filename).replaceAll("\\", "/");
    await runGit(["ls-files", "--error-unmatch", "--", relative]);
    publicPath = relative;
  }
  return { filename, path: publicPath, bytes: details.size, sha256: digest };
}

function requirePassReport(report, schema, label) {
  if (report.schema !== schema) throw new Error(`${label} schema must be exactly ${schema}`);
  const passed = report.status === "PASS" || report.passed === true;
  if (!passed) throw new Error(`${label} is not PASS`);
  if (report.status !== undefined && report.status !== "PASS") throw new Error(`${label}.status must be PASS when present`);
  if (report.passed !== undefined && report.passed !== true) throw new Error(`${label}.passed must be true when present`);
}

function forbiddenAuthorizationTruth(value, trail = []) {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) forbiddenAuthorizationTruth(value[index], [...trail, String(index)]);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (child === true && (
      normalized.includes("phase5authorized")
      || normalized.includes("phase4complete")
      || normalized.includes("humanaccepted")
      || normalized.includes("runtimeintegrationstarted")
      || normalized.includes("refinedphysicalmediaruntimeintegrationstarted")
      || normalized.includes("fullproductionsequencestarted")
      || normalized.includes("full540cyclesstarted")
      || normalized.includes("full540cyclesresumed")
      || normalized.includes("full540cyclesrenderstarted")
      || normalized.includes("full540cyclesrenderresumed")
      || normalized.includes("full540cyclesauthorized")
      || normalized.includes("full540framecyclesproductionfilmstarted")
      || normalized.includes("full540framecyclesproductionfilmresumed")
      || normalized.includes("full540framecyclesproductionfilmauthorized")
      || normalized.includes("complete540framecyclesrenderauthorized")
      || normalized.includes("runtimeintegrationauthorized")
      || normalized.includes("complete540framecyclesrenderstarted")
      || normalized.includes("complete540framecyclesrenderresumed")
    )) throw new Error(`forbidden authorization truth at ${[...trail, key].join(".")}`);
    forbiddenAuthorizationTruth(child, [...trail, key]);
  }
}

function rejectAmbiguousBoundaryClaims(value, trail = []) {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) rejectAmbiguousBoundaryClaims(value[index], [...trail, String(index)]);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if ([
      "runtimeintegrationstarted", "runtimeintegrationauthorized", "productionrendering", "productionrenderingstarted",
      "productionrenderingresumed", "productionrenderingauthorized", "full540cyclesstarted", "full540cyclesresumed",
      "full540cyclesauthorized", "full540cyclesrenderstarted", "full540cyclesrenderresumed", "complete540framecyclesrenderstarted",
      "complete540framecyclesrenderresumed", "complete540framecyclesrenderauthorized",
    ].includes(normalized)) {
      throw new Error(`ambiguous generic production/runtime boundary at ${[...trail, key].join(".")}; use the precise full-540-film, refined-physical-media, and chrome-policy fields`);
    }
    rejectAmbiguousBoundaryClaims(child, [...trail, key]);
  }
}

const PRESERVATION_SIGNATURE_SCHEMA = "quantum-hub.phase-4-r1.refined-proving-hall.preservation-signatures.v3";
const PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY_KEYS = Object.freeze([
  "properties",
  "scope",
  "reason",
]);
const PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY = Object.freeze({
  properties: Object.freeze(["session_uid"]),
  scope: "generic RNA simple-property persistence hashing only",
  reason: "Blender assigns session_uid at runtime and reassigns it after save/reopen; it is not authored or persisted scene state",
});

const SOURCE_BUILD_PRESERVATION_KEYS = Object.freeze([
  "preservationSignatureSchema",
  "persistenceVolatileRnaPropertyExclusionAuthority",
  "acceptedCrtBefore",
  "acceptedCrtAfter",
  "acceptedCrtPhysicalMaterialsActionsUnchanged",
  "oldApproximateQVisibilityUnchangedHidden",
  "cameraPathBefore",
  "cameraPathAfter",
  "cameraOrbitThresholdActionsAndStaticRigStateUnchanged",
  "establishingAimBefore",
  "establishingAimAfter",
  "establishingAimActionsAndStaticStateUnchanged",
  "recoveredSourceOverwritten",
]);

const LEGACY_SOURCE_BUILD_PRESERVATION_ALIASES = Object.freeze([
  "acceptedCrtUnchanged",
  "cameraOrbitThresholdActionsUnchanged",
  "establishingAimActionsUnchanged",
  "allowedOldQVisibilityTransition",
]);

const OLD_Q_VISIBILITY_OBJECTS = Object.freeze([
  "Phase4R0_QuantumQ_Accent",
  "Phase4R0_QuantumQ_Body",
]);

function validateSourceBuildPreservation(preservation) {
  if (!preservation || typeof preservation !== "object" || Array.isArray(preservation)) {
    throw new Error("source-build preservation must be an object");
  }
  for (const alias of LEGACY_SOURCE_BUILD_PRESERVATION_ALIASES) {
    if (alias in preservation) throw new Error(`source-build preservation uses rejected generic alias ${alias}`);
  }
  exactKeys(preservation, SOURCE_BUILD_PRESERVATION_KEYS, SOURCE_BUILD_PRESERVATION_KEYS, "source-build preservation");
  if (preservation.preservationSignatureSchema !== PRESERVATION_SIGNATURE_SCHEMA) {
    throw new Error(`source-build preservation signature schema must be exactly ${PRESERVATION_SIGNATURE_SCHEMA}`);
  }
  const exclusionAuthority = preservation.persistenceVolatileRnaPropertyExclusionAuthority;
  exactKeys(
    exclusionAuthority,
    PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY_KEYS,
    PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY_KEYS,
    "source-build persistence-volatile RNA property exclusion authority",
  );
  if (!Array.isArray(exclusionAuthority.properties)
    || exclusionAuthority.properties.length !== 1
    || exclusionAuthority.properties[0] !== "session_uid") {
    throw new Error("source-build persistence-volatile RNA property exclusions must contain only session_uid");
  }
  if (exclusionAuthority.scope !== PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY.scope) {
    throw new Error("source-build persistence-volatile RNA property exclusion scope differs from the frozen authority");
  }
  if (exclusionAuthority.reason !== PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY.reason) {
    throw new Error("source-build persistence-volatile RNA property exclusion reason differs from the frozen authority");
  }
  assertBoolean(preservation.acceptedCrtPhysicalMaterialsActionsUnchanged, true, "accepted CRT physical/material/action preservation");
  assertBoolean(preservation.cameraOrbitThresholdActionsAndStaticRigStateUnchanged, true, "camera orbit/threshold action and static-rig preservation");
  assertBoolean(preservation.establishingAimActionsAndStaticStateUnchanged, true, "establishing-aim action and static-state preservation");
  assertBoolean(preservation.recoveredSourceOverwritten, false, "recovered source overwrite state");

  const unchangedHidden = preservation.oldApproximateQVisibilityUnchangedHidden;
  const unchangedHiddenKeys = ["before", "after", "changed", "crtTrackMutationOccurred"];
  exactKeys(unchangedHidden, unchangedHiddenKeys, unchangedHiddenKeys, "unchanged hidden old-Q visibility state");
  exactKeys(unchangedHidden.before, OLD_Q_VISIBILITY_OBJECTS, OLD_Q_VISIBILITY_OBJECTS, "hidden old-Q visibility before state");
  exactKeys(unchangedHidden.after, OLD_Q_VISIBILITY_OBJECTS, OLD_Q_VISIBILITY_OBJECTS, "hidden old-Q visibility after state");
  for (const objectName of OLD_Q_VISIBILITY_OBJECTS) {
    assertBoolean(unchangedHidden.before[objectName], true, `${objectName} hidden old-Q visibility before state`);
    assertBoolean(unchangedHidden.after[objectName], true, `${objectName} hidden old-Q visibility after state`);
  }
  assertBoolean(unchangedHidden.changed, false, "old-Q visibility changed state");
  assertBoolean(unchangedHidden.crtTrackMutationOccurred, false, "old-Q CRT-track mutation state");
  return preservation;
}

async function resolveSourceReports(contractPath, contract) {
  exactKeys(contract.authorities, SOURCE_KEYS, SOURCE_KEYS, "input contract authorities");
  const authorities = {};
  const reports = {};
  for (const key of SOURCE_KEYS) {
    authorities[key] = await resolveContractAuthority(contractPath, contract.authorities[key], key);
    reports[key] = await readJson(authorities[key].filename, key);
    requirePassReport(reports[key], SOURCE_SCHEMAS[key], key);
    forbiddenAuthorizationTruth(reports[key]);
    rejectAmbiguousBoundaryClaims(reports[key]);
  }
  const derivative = await resolveContractAuthority(contractPath, contract.derivative, "refined Blender derivative");
  if (path.extname(derivative.filename).toLowerCase() !== ".blend") throw new Error("refined derivative must be a .blend file");

  const whiteSvg = await assertFile(path.join(ROOT, ...Q_WHITE_PATH.split("/")), "official white Q source");
  const colorSvg = await assertFile(path.join(ROOT, ...Q_COLOR_PATH.split("/")), "official color Q source");
  const [whiteBytes, colorBytes] = await Promise.all([readFile(whiteSvg), readFile(colorSvg)]);
  if (sha256(whiteBytes) !== Q_WHITE_SHA256 || sha256(colorBytes) !== Q_COLOR_SHA256) {
    throw new Error("official Quantum-Hub Q source hash mismatch; refusing an alternative or approximate Q");
  }

  const sourceText = SOURCE_KEYS.map((key) => JSON.stringify(reports[key])).join("\n");
  for (const value of [derivative.sha256, Q_WHITE_SHA256, Q_COLOR_SHA256]) {
    if (!sourceText.includes(value)) throw new Error(`source report set does not bind required authority ${value}`);
  }
  const buildText = JSON.stringify(reports.sourceBuild);
  const validationText = JSON.stringify(reports.sourceValidation);
  const ledgerText = JSON.stringify(reports.assetLedger);
  for (const value of [derivative.sha256, authorities.qProvenance.sha256]) {
    if (!buildText.includes(value)) throw new Error(`source-build report does not bind ${value}`);
  }
  for (const value of [derivative.sha256, authorities.sourceBuild.sha256, authorities.assetLedger.sha256, authorities.qProvenance.sha256]) {
    if (!validationText.includes(value)) throw new Error(`source-validation report does not bind ${value}`);
  }
  if (!ledgerText.includes(derivative.sha256)) throw new Error("asset ledger does not bind exact refined derivative");
  const ledger = reports.assetLedger;
  if (!Array.isArray(ledger.assets) || ledger.assets.length < 4 || !Array.isArray(ledger.externalAssetsDownloaded)) throw new Error("asset ledger lacks authored assets or explicit external-download inventory");
  if (ledger.externalAssetsDownloaded.length !== 0 || ledger.stockOrGenerativeAssetsUsed !== false) throw new Error("asset ledger must prove zero external downloads and zero stock/generative assets");
  const ledgerIds = ledger.assets.map((record) => record?.id);
  for (const required of ["accepted-crt", "dark-v2-hall", "responsive-spiral-cables", "exact-quantum-q"]) if (!ledgerIds.includes(required)) throw new Error(`asset ledger lacks ${required}`);
  const build = reports.sourceBuild;
  if ("runtimeIntegrationStarted" in build || "productionRenderingStarted" in build
    || build.full540FrameCyclesProductionFilmStarted !== false || build.full540FrameCyclesProductionFilmResumed !== false
    || build.refinedPhysicalMediaRuntimeIntegrationStarted !== false || build.chromeStatePolicyImplementationEvidenced !== true
    || build.phase5Authorized !== false) {
    throw new Error("source-build must precisely preserve no refined-physical-media integration while affirming the authorized chrome-state policy evidence");
  }
  validateSourceBuildPreservation(build.preservation);
  const design = build.design;
  if (!design || typeof design !== "object" || !design.environment || !design.connections || !design.cable || !design.palette) {
    throw new Error("source-build lacks the refined hall/environment/connection/cable/palette design inventory");
  }
  const environment = design.environment;
  if (!Array.isArray(environment.hiddenCollections) || !Number.isInteger(environment.hiddenCentralHardwareCount)
    || environment.hiddenCentralHardwareCount < 1 || !Array.isArray(environment.hiddenCentralHardwareObjects)
    || !Array.isArray(environment.retainedOverheadSourceObjects) || !Array.isArray(environment.lowNeutralPracticals)
    || environment.lowNeutralPracticals.length < 1) {
    throw new Error("source-build environment inventory does not prove hidden central clutter plus retained perimeter/shadow infrastructure");
  }
  if (!build.preflight || build.preflight.summary?.failed !== 0 || !build.preflight.audits) throw new Error("source-build preflight is not an exact all-PASS audit authority");
  const q = reports.qProvenance;
  if (q.manualRedraw !== false || q.approximateBlenderGeometry !== false) {
    throw new Error("Q provenance must explicitly forbid manual redraw and approximate Blender geometry");
  }
  const preCrtComposition = q.preCrtComposition;
  if (!preCrtComposition || preCrtComposition.packedRole !== "pre-crt-effect-q"
    || preCrtComposition.bodyAuthority !== "official-white-svg"
    || preCrtComposition.nodeColorAuthority !== "official-white-svg and official-color-svg"
    || String(preCrtComposition.bodyColor).toLowerCase() !== "#ffffff"
    || String(preCrtComposition.nodeColor).toLowerCase() !== "#d82b72"
    || preCrtComposition.officialPathTopologyIdenticalAcrossWhiteAndColorAuthorities !== true
    || preCrtComposition.effectAppliedBeforePackedTexture !== false) {
    throw new Error("Q provenance does not define the exact white-body/magenta-node dual-authority pre-CRT packed composition");
  }
  const qText = JSON.stringify(q);
  if (!qText.includes(Q_WHITE_PATH) || !qText.includes(Q_COLOR_PATH)) throw new Error("Q provenance does not bind both official repository SVG paths");
  if (!qText.includes(Q_WHITE_SHA256) || !qText.includes(Q_COLOR_SHA256)) throw new Error("Q provenance does not bind both official SVG hashes");
  if (!q.rasterization || typeof q.rasterization !== "object") throw new Error("Q provenance lacks exact rasterization method/command/aspect evidence");
  assertString(q.rasterization.method, "Q rasterization method");
  assertString(q.rasterization.commandOrScript, "Q rasterization command or script");
  const sourceAspect = Number(q.rasterization.sourceAspectRatio);
  const textureAspect = Number(q.rasterization.textureAspectRatio);
  if (!Number.isFinite(sourceAspect) || !Number.isFinite(textureAspect) || Math.abs(sourceAspect - textureAspect) > 1e-12) {
    throw new Error("Q source/texture aspect-ratio comparison is not exact");
  }
  const qMetrics = q.metrics;
  if (!qMetrics || qMetrics.topologyDifferencePixels !== 0 || qMetrics.missingSectionPixels !== 0
    || qMetrics.internalNegativeSpaceDifferencePixels !== 0 || qMetrics.contourDeviationPixels !== 0) {
    throw new Error("Q fidelity metrics must prove zero topology, missing-section, negative-space, and contour deviation at screen-master resolution");
  }

  const qFiles = [];
  if (!Array.isArray(q.files)) throw new Error("Q provenance report lacks files[]");
  for (let index = 0; index < q.files.length; index += 1) {
    const record = assertArtifactRecord(q.files[index], `Q provenance file ${index}`);
    let candidate = path.resolve(ROOT, ...record.relativePath.split("/"));
    if (!await pathExists(candidate)) candidate = path.resolve(path.dirname(authorities.qProvenance.filename), ...record.relativePath.split("/"));
    const filename = await assertFile(candidate, `Q provenance file ${record.role}`);
    if (!isWithin(ROOT, filename)) throw new Error(`Q provenance file ${record.role} must be tracked inside the repository`);
    const details = await stat(filename);
    const digest = await sha256File(filename);
    if (details.size !== record.bytes || digest !== record.sha256) throw new Error(`Q provenance file ${record.role} authority mismatch`);
    const repositoryPath = path.relative(ROOT, filename).replaceAll("\\", "/");
    await runGit(["ls-files", "--error-unmatch", "--", repositoryPath]);
    let image = null;
    if (path.extname(filename).toLowerCase() === ".png") {
      const metadata = await sharp(filename).metadata();
      if (metadata.format !== "png" || metadata.width !== record.width || metadata.height !== record.height) throw new Error(`Q provenance file ${record.role} dimension/format mismatch`);
      image = { width: metadata.width, height: metadata.height, format: metadata.format };
    }
    qFiles.push({ ...record, filename, repositoryPath, bytes: details.size, sha256: digest, ...(image ? { image } : {}) });
  }
  const qRoles = uniqueRoleMap(qFiles, "Q provenance files");
  requireExactRoles(qRoles, Q_PROVENANCE_ROLES, "Q provenance files");
  if (qRoles.get("official-white-svg").sha256 !== Q_WHITE_SHA256 || qRoles.get("official-color-svg").sha256 !== Q_COLOR_SHA256) {
    throw new Error("Q provenance official source roles differ from verified Quantum-Hub authorities");
  }
  for (const role of Q_PROVENANCE_ROLES.filter((value) => !value.endsWith("svg"))) {
    if (path.extname(qRoles.get(role).filename).toLowerCase() !== ".png") throw new Error(`Q provenance ${role} must be lossless PNG`);
  }
  const packedPreCrt = qRoles.get("pre-crt-effect-q");
  const comparedWhiteTexture = qRoles.get("screen-texture-white");
  if (packedPreCrt.sha256 !== comparedWhiteTexture.sha256 || packedPreCrt.bytes !== comparedWhiteTexture.bytes) {
    throw new Error("actual pre-CRT packed Q authority is not byte-identical to the zero-difference official-white direct raster");
  }
  const buildQ = build.design.q;
  const buildPacked = buildQ?.packedPreCrtTexture;
  if (!buildQ || buildQ.packed !== true || buildPacked?.path !== packedPreCrt.repositoryPath
    || buildPacked?.bytes !== packedPreCrt.bytes || buildPacked?.sha256 !== packedPreCrt.sha256
    || buildQ.officialWhiteSvg?.path !== Q_WHITE_PATH || buildQ.officialWhiteSvg?.sha256 !== Q_WHITE_SHA256
    || buildQ.officialColorSvg?.path !== Q_COLOR_PATH || buildQ.officialColorSvg?.sha256 !== Q_COLOR_SHA256) {
    throw new Error("source-build does not bind the actual packed pre-CRT screen image to both official Q authorities");
  }
  const validation = reports.sourceValidation;
  const qAudit = validation.livePreflight?.audits?.q;
  const auditPacked = qAudit?.provenanceScreenTextureRecord;
  if (!qAudit || qAudit.officialSourcePath !== Q_WHITE_PATH || qAudit.officialSourceSha256 !== Q_WHITE_SHA256
    || qAudit.officialColorSourcePath !== Q_COLOR_PATH || qAudit.officialColorSourceSha256 !== Q_COLOR_SHA256
    || qAudit.screenTextureRole !== "pre-crt-effect-q" || qAudit.screenTexturePath !== packedPreCrt.repositoryPath
    || qAudit.screenTextureSha256 !== packedPreCrt.sha256 || qAudit.packedImageFilepath !== "//q-fidelity/quantum-icon-pre-crt-effect.png"
    || qAudit.imageDatablock !== "Phase4R1V2_ExactQuantumQ_PreCRTEffect_2048" || qAudit.imagePacked !== true
    || auditPacked?.bytes !== packedPreCrt.bytes || auditPacked?.sha256 !== packedPreCrt.sha256
    || qAudit.preCrtComposition?.packedRole !== "pre-crt-effect-q"
    || String(qAudit.preCrtComposition?.bodyColor).toLowerCase() !== "#ffffff"
    || String(qAudit.preCrtComposition?.nodeColor).toLowerCase() !== "#d82b72"
    || !qAudit.provenanceMetrics || Object.values(qAudit.provenanceMetrics).some((value) => value !== 0)
    || qAudit.manualRedraw !== false || qAudit.approximateBlenderGeometry !== false
    || !Array.isArray(qAudit.oldQCurvesVisible) || qAudit.oldQCurvesVisible.length !== 0) {
    throw new Error("saved-source validation does not prove the exact dual-authority pre-CRT raster is the actual packed screen image with zero fidelity differences");
  }
  if (validation.resourceAudit?.exactQRepoRelativePacked !== true || validation.summary?.failed !== 0
    || "productionRenderingStarted" in validation || validation.full540FrameCyclesProductionFilmStarted !== false
    || validation.full540FrameCyclesProductionFilmResumed !== false || validation.reusedRecoveredOldVisualEvidence !== false) {
    throw new Error("saved-source validation lacks a clean packed-Q/resource/all-PASS/no-old-visual authority");
  }

  const producerMap = reports.sourceBuild.producerAuthorities;
  if (!producerMap || typeof producerMap !== "object" || Array.isArray(producerMap)) {
    throw new Error("source-build report lacks a complete producerAuthorities map");
  }
  exactArraySet(Object.keys(producerMap), SOURCE_PRODUCER_IDS, "source-build producer authority IDs");
  const producerAuthorities = {};
  for (const [producerId, producer] of Object.entries(producerMap)) {
    assertAuthorityShape(producer, `producer authority ${producerId}`);
    const relative = safeRelativePath(producer.path, `producer authority ${producerId}.path`);
    const filename = await assertFile(path.join(ROOT, ...relative.split("/")), `producer ${producerId}`);
    if (!isWithin(ROOT, filename)) throw new Error(`producer ${producerId} escapes the repository`);
    await runGit(["ls-files", "--error-unmatch", "--", relative]);
    const details = await stat(filename);
    const digest = await sha256File(filename);
    if (details.size !== producer.bytes || digest !== producer.sha256) throw new Error(`producer ${producerId} authority mismatch`);
    if (!validationText.includes(digest)) throw new Error(`source-validation report does not bind producer ${producerId}`);
    producerAuthorities[producerId] = { path: relative, bytes: details.size, sha256: digest };
  }

  return { authorities, reports, derivative, producerAuthorities, qFiles, qRoles, qAuthorities: {
    white: { path: Q_WHITE_PATH, bytes: whiteBytes.length, sha256: Q_WHITE_SHA256 },
    color: { path: Q_COLOR_PATH, bytes: colorBytes.length, sha256: Q_COLOR_SHA256 },
  } };
}

function safeRelativePath(value, label) {
  assertString(value, label);
  const normalized = value.replaceAll("\\", "/");
  if (path.posix.isAbsolute(normalized) || /^[a-z]:\//i.test(normalized) || normalized.split("/").includes("..") || normalized.includes("\u0000")) {
    throw new Error(`${label} must be a safe root-relative path: ${value}`);
  }
  if (normalized === "." || normalized.startsWith("./") || normalized.endsWith("/")) throw new Error(`${label} is not canonical`);
  return normalized;
}

function artifactRole(record) {
  return record.role ?? record.roleId ?? record.id;
}

function artifactPath(record) {
  return record.path ?? record.relativePath;
}

function assertArtifactRecord(record, label) {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error(`${label} must be an object`);
  const role = assertString(artifactRole(record), `${label}.role`);
  const relativePath = safeRelativePath(artifactPath(record), `${label}.path`);
  assertInteger(record.bytes, 1, `${label}.bytes`);
  if (!validHash(record.sha256)) throw new Error(`${label}.sha256 must be a lowercase SHA-256`);
  return { ...record, role, relativePath };
}

async function listFiles(root, relative = "") {
  const directory = path.join(root, ...relative.split("/").filter(Boolean));
  const entries = await readdir(directory, { withFileTypes: true });
  const results = [];
  for (const entry of entries.sort((left, right) => lexicalCompare(left.name, right.name))) {
    if (entry.isSymbolicLink()) throw new Error(`evidence roots may not contain symbolic links: ${path.join(relative, entry.name)}`);
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) results.push(...await listFiles(root, child));
    else if (entry.isFile()) results.push(child);
    else throw new Error(`unsupported evidence filesystem entry: ${child}`);
  }
  return results;
}

async function resolveEvidenceAuthority(contractPath, record, key) {
  exactKeys(record, ["root", "manifest", "bytes", "sha256", "schema"], ["root", "manifest", "bytes", "sha256", "schema"], `contract evidence.${key}`);
  if (record.schema !== EVIDENCE_SCHEMAS[key]) throw new Error(`contract evidence.${key}.schema differs from frozen schema`);
  if (!validHash(record.sha256)) throw new Error(`contract evidence.${key}.sha256 must be a lowercase SHA-256`);
  assertInteger(record.bytes, 1, `contract evidence.${key}.bytes`);
  const root = await assertDirectory(resolveContractPath(contractPath, record.root), `${key} root`);
  if (isWithin(ROOT, root)) throw new Error(`${key} root must be external to Git`);
  const manifestRelative = safeRelativePath(record.manifest, `contract evidence.${key}.manifest`);
  const manifestPath = await assertFile(path.join(root, ...manifestRelative.split("/")), `${key} manifest`);
  if (!isWithin(root, manifestPath)) throw new Error(`${key} manifest escapes its root`);
  const manifestBytes = await readFile(manifestPath);
  if (manifestBytes.length !== record.bytes || sha256(manifestBytes) !== record.sha256) throw new Error(`${key} manifest authority mismatch`);
  const manifest = JSON.parse(manifestBytes);
  requirePassReport(manifest, EVIDENCE_SCHEMAS[key], `${key} manifest`);
  forbiddenAuthorizationTruth(manifest);
  rejectAmbiguousBoundaryClaims(manifest);
  const producerMap = manifest.producerAuthorities;
  if (!producerMap || typeof producerMap !== "object" || Array.isArray(producerMap) || Object.keys(producerMap).length < 1) {
    throw new Error(`${key} manifest lacks producerAuthorities`);
  }
  const producerAuthorities = {};
  for (const [producerId, producer] of Object.entries(producerMap)) {
    assertAuthorityShape(producer, `${key} producer ${producerId}`);
    const relative = safeRelativePath(producer.path, `${key} producer ${producerId}.path`);
    const filename = await assertFile(path.join(ROOT, ...relative.split("/")), `${key} producer ${producerId}`);
    if (!isWithin(ROOT, filename)) throw new Error(`${key} producer ${producerId} escapes repository`);
    await runGit(["ls-files", "--error-unmatch", "--", relative]);
    const details = await stat(filename);
    const digest = await sha256File(filename);
    if (details.size !== producer.bytes || digest !== producer.sha256) throw new Error(`${key} producer ${producerId} authority mismatch`);
    producerAuthorities[producerId] = { path: relative, bytes: details.size, sha256: digest };
  }
  return { key, root, manifestPath, manifestRelative, record: { path: manifestRelative, bytes: manifestBytes.length, sha256: sha256(manifestBytes) }, manifest, producerAuthorities };
}

async function verifyArtifact(root, record, label) {
  const normalized = assertArtifactRecord(record, label);
  const filename = await assertFile(path.join(root, ...normalized.relativePath.split("/")), `${label} file`);
  if (!isWithin(root, filename)) throw new Error(`${label} file escapes its root`);
  const details = await stat(filename);
  const digest = await sha256File(filename);
  if (details.size !== normalized.bytes || digest !== normalized.sha256) throw new Error(`${label} file authority mismatch`);
  const extension = path.extname(filename).toLowerCase();
  let image = null;
  if (extension === ".png") {
    const metadata = await sharp(filename).metadata();
    if (!metadata.width || !metadata.height || metadata.format !== "png") throw new Error(`${label} is not a decodable PNG`);
    if (normalized.width !== undefined && normalized.width !== null && normalized.width !== metadata.width) throw new Error(`${label} declared width mismatch`);
    if (normalized.height !== undefined && normalized.height !== null && normalized.height !== metadata.height) throw new Error(`${label} declared height mismatch`);
    if (normalized.mediaType !== undefined && normalized.mediaType !== "image/png") throw new Error(`${label} mediaType must be image/png`);
    image = { width: metadata.width, height: metadata.height, format: metadata.format };
  }
  return { ...normalized, filename, bytes: details.size, sha256: digest, ...(image ? { image } : {}) };
}

function uniqueRoleMap(records, label) {
  const map = new Map();
  for (const record of records) {
    if (map.has(record.role)) throw new Error(`${label} has duplicate role ${record.role}`);
    map.set(record.role, record);
  }
  return map;
}

function requireExactRoles(map, required, label, { allowAdditional = false } = {}) {
  for (const role of required) if (!map.has(role)) throw new Error(`${label} lacks required role ${role}`);
  if (!allowAdditional && map.size !== required.length) {
    const extras = [...map.keys()].filter((role) => !required.includes(role));
    throw new Error(`${label} has unexpected roles: ${extras.join(", ")}`);
  }
}

function manifestArtifactCandidates(manifest) {
  const candidates = [];
  for (const key of ["files", "artifacts", "outputs", "stills", "motionSamples", "sheets", "reports"]) {
    if (Array.isArray(manifest[key])) candidates.push(...manifest[key]);
  }
  return candidates;
}

async function resolveGenericEvidence(evidence, requiredRoles, label, { allowAdditional = false } = {}) {
  const candidateRecords = manifestArtifactCandidates(evidence.manifest);
  if (!candidateRecords.length) throw new Error(`${label} manifest has no package-facing artifact inventory`);
  const records = [];
  for (let index = 0; index < candidateRecords.length; index += 1) {
    records.push(await verifyArtifact(evidence.root, candidateRecords[index], `${label} artifact ${index}`));
  }
  const roles = uniqueRoleMap(records, label);
  requireExactRoles(roles, requiredRoles, label, { allowAdditional });
  return { ...evidence, records, roles };
}

function exactArraySet(values, expected, label) {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  const actual = [...values];
  if (new Set(actual).size !== actual.length) throw new Error(`${label} contains duplicates`);
  const missing = expected.filter((value) => !actual.includes(value));
  const extras = actual.filter((value) => !expected.includes(value));
  if (missing.length || extras.length) throw new Error(`${label} mismatch; missing [${missing.join(", ")}], extras [${extras.join(", ")}]`);
}

async function assertExhaustiveEvidenceRoot(evidence, referencedPaths, label) {
  const expected = new Set([evidence.manifestRelative, ...referencedPaths.map((value) => safeRelativePath(value, `${label} referenced path`))]);
  const actual = await listFiles(evidence.root);
  const missing = [...expected].filter((value) => !actual.includes(value));
  const extras = actual.filter((value) => !expected.has(value));
  if (missing.length || extras.length) {
    throw new Error(`${label} root is not exhaustive; missing [${missing.join(", ")}], unreferenced [${extras.join(", ")}]`);
  }
  return { status: "PASS", files: actual.length, manifestExcludedFromOwnInventory: true };
}

async function resolveEnvironmentEvidence(evidence, source) {
  if (evidence.manifest.reusedRecoveredOldVisualEvidence !== false) throw new Error("environment proof must state reusedRecoveredOldVisualEvidence:false");
  const resolved = await resolveGenericEvidence(
    evidence,
    [...ENVIRONMENT_ROLES, ...ENVIRONMENT_AUDIT_ROLES],
    "environment proof",
    { allowAdditional: true },
  );
  for (const role of ENVIRONMENT_ROLES) {
    const extension = path.extname(resolved.roles.get(role).filename).toLowerCase();
    if (extension !== ".png") throw new Error(`environment role ${role} must be lossless PNG`);
  }
  for (const role of ENVIRONMENT_AUDIT_ROLES) {
    if (path.extname(resolved.roles.get(role).filename).toLowerCase() !== ".json") throw new Error(`environment audit ${role} must be JSON`);
    const report = await readJson(resolved.roles.get(role).filename, `environment audit ${role}`);
    requirePassReport(report, `quantum-hub.phase-4-r1.refined-proving-hall.${role}.v2`, `environment audit ${role}`);
  }
  const manifestText = JSON.stringify(resolved.manifest);
  if (!manifestText.includes(source.derivative.sha256)
    || !manifestText.includes(source.authorities.sourceBuild.sha256)
    || !manifestText.includes(source.authorities.sourceValidation.sha256)
    || !manifestText.includes(source.authorities.qProvenance.sha256)) {
    throw new Error("environment proof does not cross-bind the exact derivative/build/validation/Q authorities");
  }

  const audits = resolved.manifest.audits;
  if (!audits || typeof audits !== "object") throw new Error("environment proof lacks top-level audits");
  const central = audits.centralFloor;
  if (!central || !Array.isArray(central.visibleHeroObjects)) throw new Error("central-floor audit lacks visibleHeroObjects");
  exactArraySet(central.visibleHeroObjects, ["CRT", "spiral cable"], "central-floor visible hero objects");
  if (!Array.isArray(central.visibleNonHeroObjects) || central.visibleNonHeroObjects.length !== 0) throw new Error("central floor contains visible non-hero objects");
  if (!Array.isArray(central.invisibleTechnicalHelpers)) throw new Error("central-floor audit must separately identify invisible technical helpers");

  const palette = audits.palette;
  if (!palette || palette.magentaAbsentAtDormancy !== true || palette.brightWhiteFactoryPanels !== false) {
    throw new Error("palette audit fails dormant magenta/bright-white-panel requirements");
  }
  if (!Array.isArray(palette.dominantPalette) || palette.dominantPalette.length < 3) throw new Error("palette audit lacks a representative dominant palette");

  if (!audits.cable || typeof audits.cable !== "object" || !audits.current || typeof audits.current !== "object") throw new Error("family cable/current audits are missing");
  exactArraySet(Object.keys(audits.cable), REFINED_FAMILIES, "cable audit families");
  exactArraySet(Object.keys(audits.current), REFINED_FAMILIES, "current audit families");
  for (const family of REFINED_FAMILIES) {
    const cable = audits.cable[family];
    if (!cable || cable.status !== "PASS" || cable.oneContinuousCable !== true || cable.intersections !== 0 || cable.floatingSections !== 0) {
      throw new Error(`${family} cable audit fails one-continuous-cable/zero-intersection/zero-floating requirements`);
    }
    for (const key of ["totalLengthMeters", "visibleTurnCount", "outerRadiusMeters", "innerRadiusMeters", "minimumBendRadiusMeters"]) {
      if (typeof cable[key] !== "number" || !Number.isFinite(cable[key]) || cable[key] <= 0) throw new Error(`${family} cable audit ${key} must be finite and positive`);
    }
    if (!(cable.outerRadiusMeters > cable.innerRadiusMeters)) throw new Error(`${family} cable outer radius must exceed inner radius`);
    const [minimumTurns, maximumTurns] = FAMILY_TURN_RANGES[family];
    if (cable.visibleTurnCount < minimumTurns || cable.visibleTurnCount > maximumTurns) throw new Error(`${family} cable visible turn count is outside authored guidance`);
    assertString(cable.outerOriginTreatment, `${family} cable outerOriginTreatment`);
    assertString(cable.lowerRearConnectionTreatment, `${family} cable lowerRearConnectionTreatment`);

    const current = audits.current[family];
    if (!current || current.status !== "PASS" || current.activeEnergizedIntervalCount !== 1 || current.disconnectedEnergizedIntervalCount !== 0) {
      throw new Error(`${family} current audit fails the one-continuous-energized-interval requirement`);
    }
    if (typeof current.frontWidthNormalized !== "number" || current.frontWidthNormalized < 0.03 || current.frontWidthNormalized > 0.06) throw new Error(`${family} current leading-front width must remain within 3–6%`);
    for (const key of ["maximumEmissionAheadOfFront", "minimumReadableTrailEmission"]) {
      if (typeof current[key] !== "number" || !Number.isFinite(current[key]) || current[key] < 0) throw new Error(`${family} current audit ${key} must be finite and non-negative`);
    }
    if (current.maximumEmissionAheadOfFront > 1e-6 || current.minimumReadableTrailEmission <= 0) throw new Error(`${family} current ahead/trail emission gate failed`);
    if (typeof current.localReflectionContribution !== "number" || !Number.isFinite(current.localReflectionContribution) || current.localReflectionContribution <= 0) throw new Error(`${family} current audit lacks restrained positive local reflection`);
  }
  const camera = audits.camera;
  if (!camera || typeof camera !== "object" || !camera.families) throw new Error("camera audit is missing family measurements");
  if (camera.pathActionsPreserved !== true || camera.establishingAimActionsPreserved !== true) {
    throw new Error("camera audit does not prove preservation of the accepted orbit/threshold and establishing-aim actions");
  }
  assertString(camera.signature, "camera audit signature");
  assertString(camera.establishingAimSignature, "camera establishing-aim signature");
  exactArraySet(Object.keys(camera.families), REFINED_FAMILIES, "camera audit families");
  for (const family of REFINED_FAMILIES) {
    const measurement = camera.families[family];
    if (!measurement || measurement.counterClockwise !== true || measurement.monotonicInward !== true || measurement.monotonicDescent !== true) {
      throw new Error(`${family} camera audit fails counter-clockwise/monotonic-inward/monotonic-descent requirements`);
    }
    for (const key of [
      "angleStartDegrees", "angleEndDegrees", "angularTravelDegrees", "radiusStartMeters", "radiusEndMeters",
      "elevationStartMeters", "elevationEndMeters", "lensStartMillimeters", "lensEndMillimeters",
    ]) {
      if (typeof measurement[key] !== "number" || !Number.isFinite(measurement[key])) throw new Error(`${family} camera ${key} must be finite`);
    }
    if (Math.abs(measurement.angularTravelDegrees - 360) > 0.01) throw new Error(`${family} camera orbit must measure approximately 360 degrees`);
    if (!(measurement.radiusStartMeters > measurement.radiusEndMeters) || !(measurement.elevationStartMeters > measurement.elevationEndMeters)) {
      throw new Error(`${family} camera measurements do not prove a genuine inward descent`);
    }
    if (measurement.lensStartMillimeters <= 0 || measurement.lensEndMillimeters <= 0) throw new Error(`${family} camera lens measurements must be positive`);
    if (!Array.isArray(measurement.selectedTelemetry) || measurement.selectedTelemetry.length < 6) throw new Error(`${family} camera audit lacks selected path telemetry`);
    for (const [index, sample] of measurement.selectedTelemetry.entries()) {
      if (!sample || !Number.isInteger(sample.frame) || !Array.isArray(sample.worldMeters) || sample.worldMeters.length !== 3
        || sample.worldMeters.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
        throw new Error(`${family} camera telemetry ${index} is malformed`);
      }
    }
  }
  if (!camera.openingComposition || typeof camera.openingComposition !== "object") throw new Error("camera audit lacks responsive opening-composition measurements");
  exactArraySet(Object.keys(camera.openingComposition), REFINED_FAMILIES, "camera opening-composition families");
  for (const family of REFINED_FAMILIES) {
    if (camera.openingComposition[family]?.status !== "PASS") throw new Error(`${family} opening composition is not PASS`);
  }
  if (!audits.q || typeof audits.q !== "object") throw new Error("exact-Q audit is missing");
  const qAudit = audits.q;
  const packedPreCrt = source.qRoles.get("pre-crt-effect-q");
  const qText = JSON.stringify(qAudit);
  if (!qText.includes(source.authorities.qProvenance.sha256) || qAudit.officialSourcePath !== Q_WHITE_PATH
    || qAudit.officialSourceSha256 !== Q_WHITE_SHA256 || qAudit.officialColorSourcePath !== Q_COLOR_PATH
    || qAudit.officialColorSourceSha256 !== Q_COLOR_SHA256 || qAudit.screenTextureRole !== "pre-crt-effect-q"
    || qAudit.screenTexturePath !== packedPreCrt.repositoryPath || qAudit.screenTextureSha256 !== packedPreCrt.sha256
    || qAudit.packedImageFilepath !== "//q-fidelity/quantum-icon-pre-crt-effect.png" || qAudit.imagePacked !== true
    || !qAudit.provenanceMetrics || Object.values(qAudit.provenanceMetrics).some((value) => value !== 0)
    || qAudit.manualRedraw !== false || qAudit.approximateBlenderGeometry !== false
    || !Array.isArray(qAudit.oldQCurvesVisible) || qAudit.oldQCurvesVisible.length !== 0) {
    throw new Error("environment exact-Q audit does not bind the actual packed dual-authority pre-CRT raster and zero-difference official authorities");
  }

  resolved.exhaustive = await assertExhaustiveEvidenceRoot(resolved, resolved.records.map((record) => record.relativePath), "environment proof");
  return resolved;
}

function matchingFfprobe(ffmpegPath) {
  const extension = process.platform === "win32" ? ".exe" : "";
  return path.join(path.dirname(ffmpegPath), `ffprobe${extension}`);
}

async function supportsLibx264(candidate) {
  try {
    const result = await execFileAsync(candidate, ["-hide_banner", "-encoders"], { windowsHide: true, maxBuffer: 4_000_000 });
    return /\blibx264\b/.test(`${result.stdout}\n${result.stderr}`);
  } catch {
    return false;
  }
}

async function resolveFfmpeg(override) {
  const candidates = [];
  if (override) candidates.push(override);
  if (process.platform === "win32") {
    try {
      const located = await execFileAsync("where.exe", ["ffmpeg.exe"], { windowsHide: true, maxBuffer: 100_000 });
      candidates.push(...String(located.stdout).split(/\r?\n/).filter(Boolean));
    } catch {}
  } else candidates.push("ffmpeg");
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    candidates.push(
      path.join(process.env.LOCALAPPDATA, "QuantumHubTools", "ffmpeg-9.0.1", "ffmpeg-9.0.1-essentials_build", "bin", "ffmpeg.exe"),
      path.join(process.env.LOCALAPPDATA, "QuantumHubTools", "ffmpeg-8.0.1-essentials_build", "bin", "ffmpeg.exe"),
    );
  }
  for (const candidate of [...new Set(candidates)]) {
    try {
      if (await supportsLibx264(candidate)) {
        let resolved = candidate;
        if (path.isAbsolute(candidate)) resolved = await realpath(candidate);
        else if (process.platform === "win32") {
          const located = await execFileAsync("where.exe", [candidate], { windowsHide: true, maxBuffer: 100_000 });
          const first = String(located.stdout).split(/\r?\n/).find(Boolean);
          if (!first) continue;
          resolved = await realpath(first);
        }
        const probe = matchingFfprobe(resolved);
        await access(probe);
        return resolved;
      }
    } catch {}
  }
  throw new Error("FFmpeg with libx264 and sibling ffprobe is required");
}

async function ffmpegAuthority(ffmpegPath) {
  const ffprobePath = matchingFfprobe(ffmpegPath);
  const [ffmpegBytes, ffprobeBytes, version] = await Promise.all([
    readFile(ffmpegPath),
    readFile(ffprobePath),
    execFileAsync(ffmpegPath, ["-version"], { windowsHide: true, maxBuffer: 1_000_000 }),
  ]);
  return {
    ffmpeg: { basename: path.basename(ffmpegPath), bytes: ffmpegBytes.length, sha256: sha256(ffmpegBytes), version: String(version.stdout).split(/\r?\n/)[0].trim() },
    ffprobe: { basename: path.basename(ffprobePath), bytes: ffprobeBytes.length, sha256: sha256(ffprobeBytes) },
  };
}

function rationalNumber(value) {
  if (typeof value !== "string" || !/^\d+(?:\/\d+)?$/.test(value)) return Number.NaN;
  const [numerator, denominator = "1"] = value.split("/").map(Number);
  return denominator ? numerator / denominator : Number.NaN;
}

function assertExactVideoTimeline({ nominalFps, averageFps, frames, durationSeconds }, expectedFps, label) {
  if (!Number.isFinite(expectedFps) || expectedFps <= 0) throw new Error(`${label} has an invalid expected fps authority`);
  if (!Number.isFinite(nominalFps) || !Number.isFinite(averageFps)
    || Math.abs(nominalFps - expectedFps) > 1e-6 || Math.abs(averageFps - expectedFps) > 1e-6) {
    throw new Error(`${label} must be exact nominal/average ${expectedFps} fps`);
  }
  if (!Number.isFinite(durationSeconds) || Math.abs(durationSeconds - frames / expectedFps) > 0.01) {
    throw new Error(`${label} duration does not match its decoded ${expectedFps}-fps frame count`);
  }
}

function assertDeclaredChromeRecording(declared, expected, actual, bytes, label) {
  if (!declared || typeof declared !== "object" || !Array.isArray(declared.streams) || declared.streams.length !== 1
    || !declared.format || typeof declared.format !== "object") throw new Error(`${label} lacks one exact declared recording stream`);
  const stream = declared.streams[0];
  const declaredFps = rationalNumber(stream.avg_frame_rate);
  const declaredFrames = Number(stream.nb_frames);
  const declaredDuration = Number(declared.format.duration);
  const declaredBytes = Number(declared.format.size);
  if (stream.codec_name !== actual.codec || Number(stream.width) !== expected.width || Number(stream.height) !== expected.height
    || declaredFrames !== expected.frames || Math.abs(declaredFps - expected.fps) > 1e-6
    || Math.abs(declaredDuration - expected.frames / expected.fps) > 0.01 || declaredBytes !== bytes) {
    throw new Error(`${label} report recording authority differs from the exact probed artifact`);
  }
}

async function probeVideo(ffmpegPath, filename, label, expectedFps) {
  const ffprobe = matchingFfprobe(ffmpegPath);
  const result = await execFileAsync(ffprobe, [
    "-v", "error",
    "-count_frames",
    "-show_entries", "stream=codec_name,codec_type,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_read_frames,nb_frames,duration:format=duration,format_name",
    "-of", "json",
    filename,
  ], { windowsHide: true, maxBuffer: 2_000_000 });
  let parsed;
  try { parsed = JSON.parse(result.stdout); }
  catch { throw new Error(`${label} ffprobe output is malformed JSON`); }
  if (!Array.isArray(parsed.streams)) throw new Error(`${label} has no stream inventory`);
  const videoStreams = parsed.streams.filter((record) => record.codec_type === "video");
  const audioStreams = parsed.streams.filter((record) => record.codec_type === "audio");
  if (videoStreams.length !== 1 || audioStreams.length !== 0 || parsed.streams.length !== 1) throw new Error(`${label} must contain exactly one video stream and no audio/data streams`);
  const stream = videoStreams[0];
  const frames = Number(stream.nb_read_frames ?? stream.nb_frames);
  const nominalFps = rationalNumber(stream.r_frame_rate);
  const averageFps = rationalNumber(stream.avg_frame_rate);
  if (stream.codec_name !== "h264" || stream.pix_fmt !== "yuv420p") throw new Error(`${label} must use H.264/yuv420p`);
  if (!Number.isInteger(frames) || frames < 1) throw new Error(`${label} frame count could not be proved`);
  const durationSeconds = Number(parsed.format?.duration ?? stream.duration);
  assertExactVideoTimeline({ nominalFps, averageFps, frames, durationSeconds }, expectedFps, label);
  if (!String(parsed.format?.format_name ?? "").split(",").includes("mp4")) throw new Error(`${label} is not an MP4 container`);
  return {
    codec: stream.codec_name,
    pixelFormat: stream.pix_fmt,
    width: Number(stream.width),
    height: Number(stream.height),
    frames,
    fps: averageFps,
    nominalFps,
    durationSeconds,
    formatName: parsed.format?.format_name,
    audioStreams: audioStreams.length,
  };
}

async function verifyVideoRole(record, expected, ffmpegPath, label) {
  if (path.extname(record.filename).toLowerCase() !== ".mp4") throw new Error(`${label} must be MP4`);
  const probe = await probeVideo(ffmpegPath, record.filename, label, expected.fps);
  if (probe.width !== expected.width || probe.height !== expected.height) throw new Error(`${label} dimensions mismatch`);
  if (expected.frames !== undefined && probe.frames !== expected.frames) throw new Error(`${label} frame count ${probe.frames} != ${expected.frames}`);
  if (expected.minimumFrames !== undefined && probe.frames < expected.minimumFrames) throw new Error(`${label} is shorter than ${expected.minimumFrames} frames`);
  if (expected.maximumFrames !== undefined && probe.frames > expected.maximumFrames) throw new Error(`${label} exceeds ${expected.maximumFrames} frames`);
  if (Math.abs(probe.fps - expected.fps) > 1e-6) throw new Error(`${label} fps mismatch`);
  return probe;
}

async function resolvePreviews(evidence, source, ffmpegPath) {
  if (evidence.manifest.reusedRecoveredOldVisualEvidence !== false) throw new Error("previews must state reusedRecoveredOldVisualEvidence:false");
  const resolved = await resolveGenericEvidence(evidence, Object.keys(PREVIEW_ROLES), "refined previews");
  const expectedTimeline = { fps: 30, frameStart: 1, frameEnd: 540, physicalEnd: 500, blackStart: 501, blackEnd: 513, entryStart: 514, entrySettled: 540 };
  const timeline = resolved.manifest.timeline;
  if (!timeline || Object.entries(expectedTimeline).some(([key, value]) => timeline[key] !== value)) throw new Error("preview manifest does not preserve the exact 540-frame threshold/breathing/ENTRY timeline");
  if (!resolved.manifest.decodedGates || typeof resolved.manifest.decodedGates !== "object") throw new Error("preview manifest lacks decodedGates");
  for (const [role, expected] of Object.entries(PREVIEW_ROLES)) {
    const record = resolved.roles.get(role);
    if (path.basename(record.filename) !== expected.filename) throw new Error(`${role} filename must be exactly ${expected.filename}`);
    record.probe = await verifyVideoRole(record, expected, ffmpegPath, `preview ${role}`);
    const gate = resolved.manifest.decodedGates[role];
    if (!gate || (gate.status !== "PASS" && gate.passed !== true)) throw new Error(`preview ${role} lacks a PASS decoded gate`);
  }
  const manifestText = JSON.stringify(resolved.manifest);
  if (!manifestText.includes(source.derivative.sha256) || !manifestText.includes(source.authorities.sourceValidation.sha256)) {
    throw new Error("preview manifest does not bind exact derivative/source-validation authorities");
  }
  resolved.exhaustive = await assertExhaustiveEvidenceRoot(resolved, resolved.records.map((record) => record.relativePath), "refined previews");
  return resolved;
}

async function resolveCyclesStills(evidence, source) {
  if (evidence.manifest.reusedRecoveredOldVisualEvidence !== false) throw new Error("Cycles stills must state reusedRecoveredOldVisualEvidence:false");
  const resolved = await resolveGenericEvidence(evidence, CYCLES_STILL_ROLES, "Cycles benchmark stills");
  const settings = resolved.manifest.settings ?? resolved.manifest.cyclesSettings;
  if (!settings || !/CYCLES/i.test(String(settings.engine)) || !Number.isInteger(settings.samples) || settings.samples < 128) {
    throw new Error("Cycles benchmark stills must bind native Cycles settings with at least 128 samples");
  }
  for (const role of CYCLES_STILL_ROLES) {
    const record = resolved.roles.get(role);
    if (path.extname(record.filename).toLowerCase() !== ".png") throw new Error(`Cycles still ${role} must be PNG`);
    const metadata = await sharp(record.filename).metadata();
    if (!metadata.width || !metadata.height || metadata.width < 512 || metadata.height < 320) throw new Error(`Cycles still ${role} is below review resolution`);
    record.image = { width: metadata.width, height: metadata.height, format: metadata.format };
  }
  const manifestText = JSON.stringify(resolved.manifest);
  if (!manifestText.includes(source.derivative.sha256) || !manifestText.includes(source.authorities.sourceValidation.sha256)) {
    throw new Error("Cycles still manifest does not bind exact derivative/source-validation authorities");
  }
  if (!/CYCLES/i.test(manifestText)) throw new Error("Cycles still manifest does not declare the Cycles renderer");
  resolved.exhaustive = await assertExhaustiveEvidenceRoot(resolved, resolved.records.map((record) => record.relativePath), "Cycles benchmark stills");
  return resolved;
}

async function resolveCyclesMotion(evidence, source, ffmpegPath) {
  if (evidence.manifest.reusedRecoveredOldVisualEvidence !== false) throw new Error("Cycles motion must state reusedRecoveredOldVisualEvidence:false");
  const required = Object.keys(CYCLES_MOTION_ROLES);
  const resolved = await resolveGenericEvidence(evidence, required, "Cycles motion samples");
  const settings = resolved.manifest.settings ?? resolved.manifest.cyclesSettings;
  if (!settings || !/CYCLES/i.test(String(settings.engine)) || !Number.isInteger(settings.samples) || settings.samples < 64) {
    throw new Error("Cycles motion samples must bind native Cycles settings with at least 64 samples");
  }
  for (const [role, expected] of Object.entries(CYCLES_MOTION_ROLES)) {
    const record = resolved.roles.get(role);
    if (path.extname(record.filename).toLowerCase() !== ".mp4") throw new Error(`Cycles motion ${role} must be MP4`);
    const declaredWidth = record.width ?? 1440;
    const declaredHeight = record.height ?? 900;
    record.probe = await verifyVideoRole(record, { ...expected, width: declaredWidth, height: declaredHeight }, ffmpegPath, `Cycles motion ${role}`);
  }
  const manifestText = JSON.stringify(resolved.manifest);
  if (!manifestText.includes(source.derivative.sha256) || !manifestText.includes(source.authorities.sourceValidation.sha256)) {
    throw new Error("Cycles motion manifest does not bind exact derivative/source-validation authorities");
  }
  if (!/CYCLES/i.test(manifestText)) throw new Error("Cycles motion manifest does not declare the Cycles renderer");
  resolved.exhaustive = await assertExhaustiveEvidenceRoot(resolved, resolved.records.map((record) => record.relativePath), "Cycles motion samples");
  return resolved;
}

const CHROME_HIDDEN_STATE_IDS = Object.freeze([
  "first-paint-desktop",
  "first-paint-mobile",
  "dormancy",
  "conduction-25",
  "conduction-50",
  "q-activation",
  "q-hold",
  "approach",
  "threshold",
  "breathing",
  "entry-first-readable",
  "reverse-one-step",
  "fast-jump-reverse",
]);

const CHROME_VISIBLE_STATE_IDS = Object.freeze([
  "entry-settled",
  "fast-jump-forward",
  "fast-jump-latest",
  "skip-media-pending",
  "reduced-motion",
  "no-javascript",
  "deep-link-entry",
  "deep-link-method",
  "restored-settled",
  "restored-lower",
  "text-200-desktop",
  "text-200-mobile",
  "media-abort",
  "media-404",
  "supporting-about",
  "real-404",
]);

const CHROME_HOME_STATE_IDS = Object.freeze(CHROME_STATE_IDS.filter((id) => !["supporting-about", "real-404"].includes(id)));
const CHROME_COMMON_HOME_CHECK_IDS = Object.freeze([
  "semantic-h1-single",
  "semantic-entry-route-count-two",
  "horizontal-overflow-safe",
  "native-document-scroll-authority",
  "runtime-proxy-labeled",
]);
const CHROME_CONCEALED_CHECK_IDS = Object.freeze([
  "root-state-concealed",
  "header-visibility-hidden",
  "header-opacity-zero",
  "header-pointer-events-none",
  "header-inert",
  "header-hit-test-excluded",
  "header-focusable-descendants-zero",
  "header-visible-chrome-zero",
  "mobile-menu-closed",
  "entry-inert",
  "entry-pointer-events-none",
  "entry-focusable-descendants-zero",
  "shell-interactive-false",
]);
const CHROME_RELEASED_CHECK_IDS = Object.freeze([
  "root-state-released",
  "header-visibility-visible",
  "header-opacity-one",
  "header-pointer-active",
  "header-not-inert",
  "header-hit-test-active",
  "header-visible-chrome-present",
  "entry-not-inert",
  "entry-pointer-active",
  "entry-focusable-descendants-two",
]);
const CHROME_RELEASED_STATE_IDS = Object.freeze([
  "entry-settled",
  "fast-jump-forward",
  "fast-jump-latest",
  "skip-media-pending",
  "reduced-motion",
  "deep-link-entry",
  "deep-link-method",
  "restored-settled",
  "restored-lower",
  "text-200-desktop",
  "text-200-mobile",
  "media-abort",
  "media-404",
]);
const CHROME_PROXY_MILESTONE_STATE_IDS = Object.freeze([
  "dormancy", "conduction-25", "conduction-50", "q-activation", "q-hold", "approach", "threshold", "breathing",
]);

function requireChromeCheckIds(state, requiredIds) {
  const ids = state.checks.map((check) => check.id);
  if (ids.some((id) => typeof id !== "string" || !id)) throw new Error(`chrome state ${state.id} has a malformed check ID`);
  if (new Set(ids).size !== ids.length) throw new Error(`chrome state ${state.id} has duplicate check IDs`);
  for (const required of requiredIds) if (!ids.includes(required)) throw new Error(`chrome state ${state.id} omits required check ${required}`);
}

function assertChromeCheckContract(state) {
  if (CHROME_HOME_STATE_IDS.includes(state.id)) requireChromeCheckIds(state, CHROME_COMMON_HOME_CHECK_IDS);
  if (CHROME_HIDDEN_STATE_IDS.includes(state.id)) requireChromeCheckIds(state, CHROME_CONCEALED_CHECK_IDS);
  if (CHROME_RELEASED_STATE_IDS.includes(state.id)) requireChromeCheckIds(state, CHROME_RELEASED_CHECK_IDS);
  if (["first-paint-desktop", "first-paint-mobile"].includes(state.id)) {
    requireChromeCheckIds(state, ["controller-request-held", "bootstrap-before-body", "no-first-paint-flash"]);
  }
  if (CHROME_PROXY_MILESTONE_STATE_IDS.includes(state.id)) requireChromeCheckIds(state, ["proxy-milestone-declared"]);
  if (state.id === "entry-settled") requireChromeCheckIds(state, ["settled-boundary-at-least-0.9995"]);
  if (state.id === "reverse-one-step") requireChromeCheckIds(state, ["reverse-below-settle-boundary", "reverse-focus-safe", "reverse-menu-closed"]);
  if (["fast-jump-forward", "fast-jump-reverse", "fast-jump-latest"].includes(state.id)) requireChromeCheckIds(state, ["latest-position-wins"]);
  if (state.id === "skip-media-pending") requireChromeCheckIds(state, ["skip-media-request-pending", "skip-hash-entry", "skip-settled", "skip-focus-entry", "skip-media-not-required"]);
  if (state.id === "reduced-motion") requireChromeCheckIds(state, ["fallback-reduced-motion", "fallback-controller-not-requested", "fallback-media-not-requested"]);
  if (state.id === "no-javascript") requireChromeCheckIds(state, ["nojs-no-root-state", "nojs-header-released", "fallback-controller-not-requested", "fallback-media-not-requested"]);
  if (["deep-link-entry", "deep-link-method"].includes(state.id)) requireChromeCheckIds(state, ["fallback-deep-link", "fallback-controller-not-requested", "fallback-media-not-requested"]);
  if (["restored-settled", "restored-lower"].includes(state.id)) requireChromeCheckIds(state, ["restored-first-paint-released", "restored-history-marker", "fallback-controller-not-requested", "fallback-media-not-requested"]);
  if (["text-200-desktop", "text-200-mobile"].includes(state.id)) requireChromeCheckIds(state, ["fallback-text-zoom", "root-font-size-200-percent", "fallback-controller-not-requested", "fallback-media-not-requested"]);
  if (["media-abort", "media-404"].includes(state.id)) requireChromeCheckIds(state, ["fallback-static", "media-failure-reason", "media-node-dormant"]);
  if (["supporting-about", "real-404"].includes(state.id)) requireChromeCheckIds(state, ["supporting-cinematic-isolation", "supporting-header-visible", "supporting-h1-single"]);
}

function assertSupplementalChromeCheckContract(state) {
  requireChromeCheckIds(state, CHROME_COMMON_HOME_CHECK_IDS);
  if (state.id === "mobile-entry-settled") requireChromeCheckIds(state, CHROME_RELEASED_CHECK_IDS);
  else requireChromeCheckIds(state, CHROME_CONCEALED_CHECK_IDS);
  if (!["mobile-entry-first-readable", "mobile-entry-settled", "mobile-reverse-one-step"].includes(state.id)) requireChromeCheckIds(state, ["proxy-milestone-declared"]);
  if (state.id === "mobile-reverse-one-step") requireChromeCheckIds(state, ["reverse-below-settle-boundary", "reverse-focus-safe", "reverse-menu-closed"]);
}

function authorityRecordsDeep(value, records = []) {
  if (Array.isArray(value)) {
    for (const child of value) authorityRecordsDeep(child, records);
  } else if (value && typeof value === "object") {
    if (typeof value.relativePath === "string" && Number.isInteger(value.bytes) && validHash(value.sha256)) records.push(value);
    for (const child of Object.values(value)) authorityRecordsDeep(child, records);
  }
  return records;
}

function assertChromeHiddenState(state) {
  const measured = state.measured;
  if (!measured || typeof measured !== "object") throw new Error(`chrome state ${state.id} lacks measured evidence`);
  const header = measured.header;
  if (!header || typeof header !== "object") throw new Error(`chrome state ${state.id} must retain the semantic header DOM`);
  if (measured.chromeVisibleCount !== 0) throw new Error(`chrome state ${state.id} has visible chrome`);
  if (header.visibility !== "hidden" || Number(header.opacity) !== 0 || header.pointerEvents !== "none" || header.inert !== true || header.hitTested !== false) {
    throw new Error(`chrome state ${state.id} permits hidden pointer or interaction interception`);
  }
  if (header.visibleDescendantCount !== 0 || header.focusableDescendantCount !== 0) {
    throw new Error(`chrome state ${state.id} exposes hidden chrome descendants or keyboard targets`);
  }
  if (measured.h1Count !== 1 || measured.entryRouteCount !== 2) throw new Error(`chrome state ${state.id} regresses semantic H1/ENTRY routes`);
  if (!measured.entry || measured.entry.inert !== true || measured.entry.pointerEvents !== "none"
    || measured.entry.focusableDescendantCount !== 0 || measured.shellInteractive !== "false") {
    throw new Error(`chrome state ${state.id} exposes the concealed semantic ENTRY or interactive shell`);
  }
}

function assertChromeVisibleState(state) {
  const measured = state.measured;
  if (!measured || typeof measured !== "object" || !measured.header) throw new Error(`chrome fallback state ${state.id} lacks measured header evidence`);
  if (measured.chromeVisibleCount < 1 || measured.header.visibility !== "visible" || Number(measured.header.opacity) !== 1
    || measured.header.pointerEvents === "none" || measured.header.inert === true || measured.header.hitTested !== true) {
    throw new Error(`chrome fallback/settled state ${state.id} does not expose normal chrome`);
  }
  if (measured.h1Count !== 1) throw new Error(`chrome fallback/settled state ${state.id} regresses the single H1`);
  if (CHROME_RELEASED_STATE_IDS.includes(state.id) && (!measured.entry || measured.entry.inert !== false
    || measured.entry.pointerEvents === "none" || measured.entry.focusableDescendantCount !== 2)) {
    throw new Error(`chrome released state ${state.id} does not expose the exact semantic ENTRY interaction state`);
  }
}

async function resolveChromeEvidence(evidence, repository, ffmpegPath) {
  const report = evidence.manifest;
  exactArraySet(Object.keys(report.producerAuthorities ?? {}), ["captureScript", "artifactBuilder", "browserQa", "controller"], "chrome producer authority IDs");
  if (report.evidenceLabel !== "current-runtime chrome-state proxy — R1 physical runtime integration not authorized") {
    throw new Error("chrome evidence must carry the exact current-runtime proxy / no-R1-integration label");
  }
  const runtime = report.productionRuntimeAuthority;
  if (!runtime || runtime.frameCount !== 270 || runtime.frameRate !== 30 || runtime.integratedR1PhysicalMedia !== false) {
    throw new Error("chrome productionRuntimeAuthority must truthfully bind the 270-frame current runtime proxy and no R1 physical integration");
  }
  const runtimeGit = runtime.git;
  if (!runtimeGit || runtimeGit.branch !== repository.branch || runtimeGit.head !== repository.head
    || runtimeGit.upstreamHead !== repository.upstreamHead || runtimeGit.remoteHead !== repository.liveRemoteHead
    || runtimeGit.workingTreeClean !== true || runtimeGit.headMatchesUpstream !== true || runtimeGit.headMatchesRemote !== true
    || runtimeGit.remoteVerifiedByLsRemote !== true) {
    throw new Error("chrome evidence Git authority differs from exact packaging HEAD/upstream");
  }
  if (report.humanAcceptance !== null) throw new Error("chrome report humanAcceptance must remain null");
  const chromeContract = report.contract;
  if (!chromeContract || chromeContract.reportAuthorityRole !== CHROME_REPORT_ROLE || chromeContract.reportSelfHashExcluded !== true) throw new Error("chrome report self-authority contract mismatch");
  exactArraySet(chromeContract.requiredStateIds, CHROME_STATE_IDS, "chrome declared required state IDs");
  exactArraySet(chromeContract.requiredCheckIds, CHROME_REQUIRED_CHECK_IDS, "chrome declared required check IDs");
  exactArraySet(chromeContract.observedCheckIds, CHROME_REQUIRED_CHECK_IDS, "chrome observed check IDs");
  exactArraySet(chromeContract.mediaArtifactRoles, CHROME_ARTIFACT_ROLES, "chrome declared media artifact roles");
  if (!Array.isArray(report.states)) throw new Error("chrome evidence lacks states[]");
  const stateMap = new Map();
  const screenshotRecords = [];
  let passedChecks = 0;
  let totalChecks = 0;
  for (const state of report.states) {
    assertString(state.id, "chrome state id");
    if (stateMap.has(state.id)) throw new Error(`duplicate chrome state ${state.id}`);
    if (state.passed !== true || !Array.isArray(state.checks) || state.checks.length < 1) throw new Error(`chrome state ${state.id} is not evidenced PASS`);
    for (const check of state.checks) {
      totalChecks += 1;
      if (!check || typeof check.id !== "string" || !Object.hasOwn(check, "expected") || !Object.hasOwn(check, "actual")) {
        throw new Error(`chrome state ${state.id} has a check without exact expected/actual evidence`);
      }
      if (check.passed === true) passedChecks += 1;
      else throw new Error(`chrome state ${state.id} failed check ${check.id ?? "unknown"}`);
    }
    assertChromeCheckContract(state);
    if (!state.viewport || !Number.isInteger(state.viewport.width) || !Number.isInteger(state.viewport.height)) throw new Error(`chrome state ${state.id} lacks exact viewport dimensions`);
    const screenshot = await verifyArtifact(evidence.root, {
      role: `CHROME_STATE_${state.id.toUpperCase().replaceAll("-", "_")}`,
      path: state.screenshot?.relativePath,
      bytes: state.screenshot?.bytes,
      sha256: state.screenshot?.sha256,
    }, `chrome state ${state.id} screenshot`);
    if (screenshot.image?.width !== state.viewport.width || screenshot.image?.height !== state.viewport.height) {
      throw new Error(`chrome state ${state.id} screenshot dimensions do not match its exact viewport`);
    }
    screenshotRecords.push(screenshot);
    stateMap.set(state.id, state);
  }
  exactArraySet([...stateMap.keys()], CHROME_STATE_IDS, "chrome evidence state IDs");
  if (!chromeContract.stateCheckInventory || typeof chromeContract.stateCheckInventory !== "object") throw new Error("chrome report lacks stateCheckInventory");
  exactArraySet(Object.keys(chromeContract.stateCheckInventory), CHROME_STATE_IDS, "chrome stateCheckInventory IDs");
  for (const [id, state] of stateMap) exactArraySet(chromeContract.stateCheckInventory[id], state.checks.map((check) => check.id), `chrome stateCheckInventory ${id}`);
  if (!Array.isArray(report.supplementalResponsiveStates)) throw new Error("chrome evidence lacks supplementalResponsiveStates[]");
  const supplementalMap = new Map();
  for (const state of report.supplementalResponsiveStates) {
    if (!state || typeof state.id !== "string" || supplementalMap.has(state.id) || state.passed !== true || !Array.isArray(state.checks)) throw new Error("chrome supplemental state inventory is malformed");
    for (const check of state.checks) {
      totalChecks += 1;
      if (!check || typeof check.id !== "string" || !Object.hasOwn(check, "expected") || !Object.hasOwn(check, "actual")) {
        throw new Error(`chrome supplemental state ${state.id} has a check without exact expected/actual evidence`);
      }
      if (check.passed === true) passedChecks += 1;
      else throw new Error(`chrome supplemental state ${state.id} failed check ${check.id ?? "unknown"}`);
    }
    assertSupplementalChromeCheckContract(state);
    if (state.id === "mobile-entry-settled") assertChromeVisibleState(state);
    else assertChromeHiddenState(state);
    const screenshot = await verifyArtifact(evidence.root, {
      role: `CHROME_STATE_${state.id.toUpperCase().replaceAll("-", "_")}`,
      path: state.screenshot?.relativePath,
      bytes: state.screenshot?.bytes,
      sha256: state.screenshot?.sha256,
    }, `chrome supplemental state ${state.id} screenshot`);
    if (screenshot.image?.width !== state.viewport?.width || screenshot.image?.height !== state.viewport?.height) {
      throw new Error(`chrome supplemental state ${state.id} screenshot dimensions do not match its exact viewport`);
    }
    screenshotRecords.push(screenshot);
    supplementalMap.set(state.id, state);
  }
  exactArraySet([...supplementalMap.keys()], CHROME_SUPPLEMENTAL_STATE_IDS, "chrome supplemental state IDs");
  if (!report.summary || report.summary.checkCount !== totalChecks || report.summary.failedCheckCount !== 0
    || report.summary.capturedStateCount !== CHROME_STATE_IDS.length || report.summary.requiredStateCount !== CHROME_STATE_IDS.length
    || report.summary.supplementalResponsiveStateCount !== CHROME_SUPPLEMENTAL_STATE_IDS.length
    || report.summary.authorityReady !== true || report.summary.machineChecksPass !== true || passedChecks !== totalChecks) {
    throw new Error("chrome evidence summary is not an exact all-PASS rollup");
  }
  for (const id of CHROME_HIDDEN_STATE_IDS) assertChromeHiddenState(stateMap.get(id));
  for (const id of CHROME_VISIBLE_STATE_IDS) assertChromeVisibleState(stateMap.get(id));
  exactArraySet([...CHROME_HIDDEN_STATE_IDS, ...CHROME_VISIBLE_STATE_IDS], CHROME_STATE_IDS, "chrome hidden/visible state partition");

  if (!Array.isArray(report.artifacts)) throw new Error("chrome evidence lacks artifacts[]");
  const artifactRecords = [];
  for (let index = 0; index < report.artifacts.length; index += 1) {
    artifactRecords.push(await verifyArtifact(evidence.root, report.artifacts[index], `chrome package artifact ${index}`));
  }
  const roles = uniqueRoleMap(artifactRecords, "chrome package artifacts");
  requireExactRoles(roles, CHROME_ARTIFACT_ROLES, "chrome package artifacts");
  exactArraySet(Object.keys(report.recordings ?? {}), Object.values(CHROME_RECORDING_ROLES).map(({ reportKey }) => reportKey), "chrome declared recording keys");
  for (const role of CHROME_ARTIFACT_ROLES) {
    const record = roles.get(role);
    const extension = path.extname(record.filename).toLowerCase();
    if (role.endsWith("RECORDING")) {
      if (extension !== ".mp4") throw new Error(`${role} must be MP4`);
      const expected = CHROME_RECORDING_ROLES[role];
      if (!expected) throw new Error(`${role} lacks an exact Chrome recording authority`);
      record.probe = await verifyVideoRole(record, expected, ffmpegPath, role);
      assertDeclaredChromeRecording(report.recordings[expected.reportKey], expected, record.probe, record.bytes, role);
    } else if (extension !== ".png") throw new Error(`${role} must be PNG`);
  }
  const deepRecords = [];
  const seenDeepPaths = new Map();
  for (const [index, record] of authorityRecordsDeep(report).entries()) {
    const normalized = assertArtifactRecord({ ...record, role: `CHROME_BOUND_FILE_${index}` }, `chrome bound file ${index}`);
    const existing = seenDeepPaths.get(normalized.relativePath);
    if (existing && (existing.bytes !== normalized.bytes || existing.sha256 !== normalized.sha256)) throw new Error(`chrome report has conflicting authorities for ${normalized.relativePath}`);
    if (!existing) {
      const verified = await verifyArtifact(evidence.root, normalized, `chrome bound file ${index}`);
      seenDeepPaths.set(normalized.relativePath, verified);
      deepRecords.push(verified);
    }
  }
  const referenced = deepRecords.map((record) => record.relativePath);
  const exhaustive = await assertExhaustiveEvidenceRoot(evidence, referenced, "chrome evidence");
  return { ...evidence, stateMap, supplementalMap, screenshotRecords, deepRecords, records: artifactRecords, roles, exhaustive, machineReportRole: CHROME_REPORT_ROLE };
}

async function resolveResponsiveEvidence(evidence, repository, source) {
  if (evidence.manifest.reusedRecoveredOldVisualEvidence !== false) throw new Error("responsive evidence must state reusedRecoveredOldVisualEvidence:false");
  const resolved = await resolveGenericEvidence(evidence, RESPONSIVE_ROLE_IDS, "responsive evidence");
  const manifestText = JSON.stringify(resolved.manifest);
  if (!manifestText.includes(repository.head)) throw new Error("responsive evidence does not bind exact committed HEAD");
  if (!manifestText.includes(source.derivative.sha256) || !manifestText.includes(source.authorities.sourceValidation.sha256)) {
    throw new Error("responsive evidence does not bind the exact refined derivative/source-validation authorities");
  }
  if (!Array.isArray(resolved.manifest.viewports)) throw new Error("responsive evidence lacks viewports[]");
  const viewportMap = new Map();
  for (const viewport of resolved.manifest.viewports) {
    if (!viewport || typeof viewport !== "object" || typeof viewport.id !== "string" || viewportMap.has(viewport.id)) throw new Error("responsive evidence has an invalid/duplicate viewport record");
    viewportMap.set(viewport.id, viewport);
  }
  exactArraySet([...viewportMap.keys()], RESPONSIVE_ROLE_IDS, "responsive viewport IDs");
  for (const [id, expected] of Object.entries(RESPONSIVE_VIEWPORTS)) {
    const viewport = viewportMap.get(id);
    for (const [key, value] of Object.entries(expected)) if (viewport[key] !== value) throw new Error(`responsive viewport ${id}.${key} mismatch`);
    if (viewport.physicalPosition !== "center") throw new Error(`responsive viewport ${id} must use center positioning`);
  }
  const semantic = resolved.manifest.semanticChecks;
  if (!semantic || semantic.status !== "PASS" || semantic.exactlyOneH1 !== true || semantic.exactlyTwoEntryRoutes !== true
    || semantic.noHorizontalOverflow !== true || semantic.narrow320Safety !== true || semantic.complete844x390Entry !== true) {
    throw new Error("responsive semantic checks do not prove single-H1/two-route/overflow/320/844x390 safety");
  }
  for (const role of RESPONSIVE_ROLE_IDS) {
    const record = resolved.roles.get(role);
    if (path.extname(record.filename).toLowerCase() !== ".png") throw new Error(`responsive role ${role} must be PNG`);
    const metadata = await sharp(record.filename).metadata();
    const expected = RESPONSIVE_VIEWPORTS[role];
    if (metadata.width !== expected.width || metadata.height !== expected.height) {
      throw new Error(`responsive role ${role} dimensions ${metadata.width}x${metadata.height} do not match its exact ${expected.width}x${expected.height} viewport`);
    }
    record.image = { width: metadata.width, height: metadata.height, format: metadata.format };
  }
  resolved.exhaustive = await assertExhaustiveEvidenceRoot(resolved, resolved.records.map((record) => record.relativePath), "responsive evidence");
  return resolved;
}

function assertRecoveryEvidence(source, repository) {
  const recovery = source.reports.recoveryReport;
  const backup = source.reports.recoveryBackupSummary;
  const recoveryText = JSON.stringify(recovery);
  if (!recoveryText.includes("prompt_cache_retention")) throw new Error("recovery report does not investigate prompt_cache_retention");
  if (!recovery.errorInvestigation || typeof recovery.errorInvestigation !== "object") throw new Error("recovery report lacks errorInvestigation");
  if (typeof recovery.errorInvestigation.promptCacheRetentionWasTaskEndingCause !== "boolean") throw new Error("error investigation must explicitly classify whether prompt_cache_retention ended the task");
  assertString(recovery.errorInvestigation.strongestSupportedDiagnosis, "recovery strongest supported diagnosis");
  assertString(recovery.errorInvestigation.supportLevel, "recovery diagnosis support level");
  if (!recovery.diagnosis || typeof recovery.diagnosis !== "object") throw new Error("recovery report lacks the actual task-ending diagnosis");
  assertString(recovery.diagnosis.taskEndingCause, "recovery diagnosis.taskEndingCause");
  if (recovery.promptCacheClassification?.taskEndingCause !== recovery.errorInvestigation.promptCacheRetentionWasTaskEndingCause) {
    throw new Error("recovery prompt-cache task-ending classification is internally inconsistent");
  }
  if (!recovery.selectedSource || typeof recovery.selectedSource !== "object") throw new Error("recovery report lacks selectedSource rationale");
  if (recovery.selectedSource.bytes !== RECOVERED_SOURCE_AUTHORITY.bytes || recovery.selectedSource.sha256 !== RECOVERED_SOURCE_AUTHORITY.sha256) {
    throw new Error("recovery selectedSource differs from the validated interrupted-run Blender authority");
  }
  assertString(recovery.selectedSource.reason, "recovery selectedSource.reason");
  const selectedValidation = recovery.selectedSource.validation;
  if (!selectedValidation || typeof selectedValidation !== "object") throw new Error("recovery selectedSource lacks a non-destructive validation record");
  for (const key of [
    "opensSuccessfully", "sceneObjectsPresent", "camerasPresent", "timelineValid", "materialsPresent", "resourcesResolved",
    "originalCrtIntact", "officialQAvailable", "frameBoundsValid",
  ]) assertBoolean(selectedValidation[key], true, `recovery selectedSource.validation.${key}`);
  for (const key of ["missingLibraries", "missingTextures", "lostActions"]) {
    if (!Array.isArray(selectedValidation[key]) || selectedValidation[key].length !== 0) throw new Error(`recovery selectedSource.validation.${key} must be an empty array`);
  }
  if (!recovery.partialRenders && !recovery.renderInventory) throw new Error("recovery report lacks partial render inventory");
  if (!Array.isArray(recovery.modifiedFilesSinceInterruptedRun) || recovery.modifiedFilesSinceInterruptedRun.length < 1) throw new Error("recovery report lacks modified-file inventory");
  if (!Array.isArray(recovery.blenderCandidates) || !recovery.blenderCandidates.some((record) => record.selected === true && record.valid === true && record.sha256 === RECOVERED_SOURCE_AUTHORITY.sha256)) {
    throw new Error("recovery report does not prove selection of a valid Blender candidate");
  }
  if (!recovery.renderInventory || !Array.isArray(recovery.renderInventory.full540CyclesFrameRoots)
    || recovery.renderInventory.full540CyclesFrameRoots.length !== 0 || !Array.isArray(recovery.renderInventory.partial540CyclesFrameRoots)
    || recovery.renderInventory.partial540CyclesFrameRoots.length !== 0 || recovery.renderInventory.refinedVisualAuthorityEligible !== false) {
    throw new Error("recovery render inventory must prove no full/partial 540-frame Cycles root and no old refined-visual eligibility");
  }
  if (!recovery.processInventory || !Array.isArray(recovery.processInventory.blender) || !Array.isArray(recovery.processInventory.ffmpeg)
    || !Array.isArray(recovery.processInventory.pythonRenderWorkers) || recovery.processInventory.activeOutputMutationObserved !== false) {
    throw new Error("recovery process inventory is incomplete or reports active mutation");
  }
  if (!recovery.freeDiskSpace || !Number.isInteger(recovery.freeDiskSpace.bytesAvailableAtFinalRecoveryAudit)
    || recovery.freeDiskSpace.bytesAvailableAtFinalRecoveryAudit <= 0) throw new Error("recovery report lacks exact positive free-disk measurement");
  if (!recovery.promptCacheClassification || recovery.promptCacheClassification.projectLocalConfigHitCount !== 0
    || recovery.promptCacheClassification.globalConfigurationModified !== false || recovery.promptCacheClassification.blenderFailure !== false) {
    throw new Error("recovery prompt-cache classification does not prove no project config hit/global mutation/Blender failure");
  }
  const backupFiles = backup.files ?? backup.inventory;
  if (!Array.isArray(backupFiles) || backupFiles.length < 1) throw new Error("recovery backup summary lacks file inventory");
  if (backup.externalAbsolutePathStored !== false || typeof backup.externalRecoveryId !== "string" || backup.externalRecoveryId !== recovery.recoveryBackupAlias) {
    throw new Error("recovery backup summary must use the exact external recovery alias without storing an absolute private path");
  }
  if (!backup.inventorySummary || !Number.isInteger(backup.inventorySummary.manifestRecordCount)
    || backup.inventorySummary.manifestRecordCount < backupFiles.length || !Number.isInteger(backup.inventorySummary.actualBackupFileCountIncludingManifest)
    || backup.inventorySummary.actualBackupFileCountIncludingManifest < backup.inventorySummary.manifestRecordCount) {
    throw new Error("recovery backup inventory summary is missing or inconsistent");
  }
  for (const [index, record] of backupFiles.entries()) {
    if (!record || typeof record !== "object") throw new Error(`recovery backup record ${index} is invalid`);
    assertInteger(record.bytes, 0, `recovery backup record ${index}.bytes`);
    if (!validHash(record.sha256)) throw new Error(`recovery backup record ${index}.sha256 is invalid`);
    const modifiedTime = record.modifiedTimeUtc ?? record.mtimeUtc;
    if (modifiedTime !== null && modifiedTime !== undefined) assertString(modifiedTime, `recovery backup record ${index}.modifiedTimeUtc`);
    else if (record.recordKind !== "tree-digest" && !String(record.originalPath ?? "").startsWith("logical:")) throw new Error(`recovery backup record ${index} lacks a justified modified time`);
    assertString(record.originalPath, `recovery backup record ${index}.originalPath`);
    assertString(record.backupPath, `recovery backup record ${index}.backupPath`);
  }
  if (!backupFiles.some((record) => record.sha256 === RECOVERED_SOURCE_AUTHORITY.sha256 && record.bytes === RECOVERED_SOURCE_AUTHORITY.bytes)) {
    throw new Error("recovery backup inventory does not include the selected recovered Blender source");
  }
  if (!recovery.git || recovery.git.startingHead !== RECOVERY_START_HEAD || recovery.git.startingParent !== EXPECTED_PARENT
    || recovery.git.checkpointHead !== RECOVERY_CHECKPOINT_HEAD || recovery.git.exactParent !== EXPECTED_PARENT
    || recovery.git.branch !== EXPECTED_BRANCH || recovery.git.main !== MAIN_AUTHORITY) {
    throw new Error("recovery report does not bind the exact discovered starting HEAD/parent/checkpoint/branch/main authorities");
  }
  if (!JSON.stringify(source.reports.sourceBuild).includes(RECOVERED_SOURCE_AUTHORITY.sha256)) throw new Error("refined source-build does not bind its exact recovered source authority");
  return { backupFiles: backupFiles.length, promptCacheWarningInvestigated: true };
}

function validateContractAuthorization(authorization) {
  exactKeys(
    authorization,
    ["full540FrameCyclesProductionFilmStarted", "full540FrameCyclesProductionFilmResumed", "refinedPhysicalMediaRuntimeIntegrationStarted", "chromeStatePolicyImplementationEvidenced", "humanAccepted", "phase5Authorized"],
    ["full540FrameCyclesProductionFilmStarted", "full540FrameCyclesProductionFilmResumed", "refinedPhysicalMediaRuntimeIntegrationStarted", "chromeStatePolicyImplementationEvidenced", "humanAccepted", "phase5Authorized"],
    "input contract authorization",
  );
  for (const [key, value] of Object.entries(authorization)) {
    assertBoolean(value, key === "chromeStatePolicyImplementationEvidenced", `input contract authorization.${key}`);
  }
}

async function resolveInputContract(options) {
  const contractPath = await assertFile(options.inputContract, "input contract");
  const contract = await readJson(contractPath, "input contract");
  exactKeys(
    contract,
    ["schema", "status", "classification", "repository", "authorities", "derivative", "evidence", "authorization"],
    ["schema", "status", "classification", "repository", "authorities", "derivative", "evidence", "authorization"],
    "input contract",
  );
  if (contract.schema !== CONTRACT_SCHEMA || contract.status !== "READY" || contract.classification !== CLASSIFICATION) throw new Error("input contract schema/status/classification mismatch");
  validateContractAuthorization(contract.authorization);
  exactKeys(contract.evidence, EVIDENCE_KEYS, EVIDENCE_KEYS, "input contract evidence");

  const source = await resolveSourceReports(contractPath, contract);
  const repository = await repositoryState(contract.repository);
  const recovery = assertRecoveryEvidence(source, repository);
  const evidence = {};
  for (const key of EVIDENCE_KEYS) evidence[key] = await resolveEvidenceAuthority(contractPath, contract.evidence[key], key);
  const roots = EVIDENCE_KEYS.map((key) => evidence[key].root);
  if (new Set(roots.map(normalizedPath)).size !== roots.length) throw new Error("all evidence roots must be distinct");
  for (let left = 0; left < roots.length; left += 1) {
    for (let right = left + 1; right < roots.length; right += 1) {
      if (isWithin(roots[left], roots[right]) || isWithin(roots[right], roots[left])) throw new Error("evidence roots may not overlap or nest");
    }
  }
  const ffmpegPath = await resolveFfmpeg(options.ffmpeg);
  const [environmentProof, previews, cyclesStills, cyclesMotion, chrome, responsive] = await Promise.all([
    resolveEnvironmentEvidence(evidence.environmentProof, source),
    resolvePreviews(evidence.previews, source, ffmpegPath),
    resolveCyclesStills(evidence.cyclesStills, source),
    resolveCyclesMotion(evidence.cyclesMotion, source, ffmpegPath),
    resolveChromeEvidence(evidence.chrome, repository, ffmpegPath),
    resolveResponsiveEvidence(evidence.responsive, repository, source),
  ]);
  return {
    contractPath,
    contract,
    source,
    repository,
    recovery,
    evidence: { environmentProof, previews, cyclesStills, cyclesMotion, chrome, responsive },
    ffmpegPath,
  };
}

function privateHostPath(value) {
  if (typeof value !== "string") return false;
  const normalized = value.replaceAll("\\", "/");
  if (/file:\/{2,3}(?:[a-z]:\/|\/)/i.test(normalized)
    || /(?:^|[^a-z0-9])[a-z]:[\\/][^\s"'<>|]*/i.test(value)
    || /\\\\[^\\/\s]+[\\/][^\s"'<>|]*/i.test(value)) return true;
  if (/^https?:\/\//i.test(value.trim())) return false;
  return /(?:^|[^a-z0-9])\/(?:Users|home|private\/var|tmp|var\/tmp|mnt\/[a-z])\//i.test(normalized)
    || normalized.toLowerCase().includes(normalizedPath(ROOT).toLowerCase());
}

function sanitizedValue(value, key = "") {
  if (Array.isArray(value)) return value.map((item) => sanitizedValue(item, key));
  if (value && typeof value === "object") {
    const result = {};
    for (const [childKey, child] of Object.entries(value)) {
      if (["outputRoot", "executable", "absolutePath", "temporaryRoot", "browserProfile", "userDataDir"].includes(childKey)) continue;
      result[childKey] = sanitizedValue(child, childKey);
    }
    return result;
  }
  if (typeof value === "string" && privateHostPath(value)) return `[redacted private host ${key || "path"}]`;
  return value;
}

const MAX_EMBEDDED_METADATA_BYTES = 4 * 1024 * 1024;
const MP4_REGULAR_CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "dinf", "stbl", "edts", "udta", "ilst"]);
const MP4_TEXT_BOXES = new Set([
  "©nam", "©ART", "©alb", "©wrt", "©too", "©cmt", "©day", "©gen", "©grp", "©lyr", "©xyz",
  "auth", "cprt", "desc", "dscp", "kind", "ldes", "name", "titl", "xml ", "XMP_",
]);
const ADOBE_XMP_UUID = "be7acfcb97a942e89c71999491e3afac";
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function metadataStrings(value, result = []) {
  if (typeof value === "string") result.push(value);
  else if (Array.isArray(value)) value.forEach((item) => metadataStrings(item, result));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      result.push(key);
      metadataStrings(child, result);
    }
  }
  return result;
}

function assertNoPrivateMetadata(strings, label) {
  if (strings.some((value) => privateHostPath(value))) throw new Error(`private host path leaked into ${label}`);
}

function mp4BoxHeader(data, offset, end, label) {
  if (offset + 8 > end) throw new Error(`${label} has a truncated MP4 box header at byte ${offset}`);
  let size = data.readUInt32BE(offset);
  const type = data.subarray(offset + 4, offset + 8).toString("latin1");
  let headerBytes = 8;
  if (size === 1) {
    if (offset + 16 > end) throw new Error(`${label} has a truncated extended MP4 box header at byte ${offset}`);
    const extended = data.readBigUInt64BE(offset + 8);
    if (extended > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${label} has an unsupported MP4 box size`);
    size = Number(extended);
    headerBytes = 16;
  } else if (size === 0) size = end - offset;
  if (size < headerBytes || offset + size > end) throw new Error(`${label} has an invalid MP4 box bound at byte ${offset}`);
  return { type, payloadStart: offset + headerBytes, end: offset + size };
}

function appendBoundedMetadataText(result, payload, label, encoding = "utf8") {
  if (payload.length > MAX_EMBEDDED_METADATA_BYTES) throw new Error(`${label} exceeds the embedded metadata size limit`);
  if (encoding === "utf16be") {
    if (payload.length % 2) throw new Error(`${label} has malformed UTF-16 metadata`);
    const swapped = Buffer.from(payload);
    swapped.swap16();
    result.push(swapped.toString("utf16le"));
    return;
  }
  result.push(payload.toString(encoding));
  if (encoding === "utf8") result.push(payload.toString("latin1"));
}

function mp4TextMetadata(data, label = "MP4") {
  if (!Buffer.isBuffer(data) || data.length < 8) throw new Error(`${label} is not a bounded MP4 container`);
  const result = [];
  const topLevel = new Set();
  function walk(start, end, context) {
    let offset = start;
    while (offset < end) {
      const box = mp4BoxHeader(data, offset, end, label);
      if (context === "root") topLevel.add(box.type);
      if (box.type === "mdat") {
        // Encoded sample bytes are opaque; they are not treated as metadata.
      } else if (context === "ilst") walk(box.payloadStart, box.end, "metadata-item");
      else if (context === "metadata-item" && box.type === "data") {
        if (box.end - box.payloadStart < 8) throw new Error(`${label} has a truncated metadata data box`);
        const dataType = data.readUInt32BE(box.payloadStart) & 0x00ffffff;
        const payload = data.subarray(box.payloadStart + 8, box.end);
        if (dataType === 2) appendBoundedMetadataText(result, payload, label, "utf16be");
        else if (dataType === 0 || dataType === 1) appendBoundedMetadataText(result, payload, label);
      } else if (context === "metadata-item" && (box.type === "mean" || box.type === "name")) {
        if (box.end - box.payloadStart < 4) throw new Error(`${label} has a truncated freeform metadata box`);
        appendBoundedMetadataText(result, data.subarray(box.payloadStart + 4, box.end), label);
      } else if (box.type === "meta") {
        if (box.end - box.payloadStart < 4) throw new Error(`${label} has a truncated meta full-box header`);
        walk(box.payloadStart + 4, box.end, "meta");
      } else if (MP4_REGULAR_CONTAINERS.has(box.type)) walk(box.payloadStart, box.end, box.type);
      else if (MP4_TEXT_BOXES.has(box.type) || (context === "udta" && box.type.charCodeAt(0) === 0xa9)) {
        appendBoundedMetadataText(result, data.subarray(box.payloadStart, box.end), label);
      } else if (box.type === "uuid" && box.end - box.payloadStart >= 16
        && data.subarray(box.payloadStart, box.payloadStart + 16).toString("hex") === ADOBE_XMP_UUID) {
        appendBoundedMetadataText(result, data.subarray(box.payloadStart + 16, box.end), label);
      }
      offset = box.end;
    }
    if (offset !== end) throw new Error(`${label} has an unconsumed MP4 box tail`);
  }
  walk(0, data.length, "root");
  for (const required of ["ftyp", "moov", "mdat"]) if (!topLevel.has(required)) throw new Error(`${label} lacks required top-level ${required} box`);
  return result;
}

function pngNull(data, start, end, label) {
  const index = data.indexOf(0, start);
  if (index < start || index >= end) throw new Error(`${label} has a malformed PNG text field`);
  return index;
}

function inflatePngText(payload, label) {
  try {
    return inflateSync(payload, { maxOutputLength: MAX_EMBEDDED_METADATA_BYTES });
  } catch (error) {
    throw new Error(`${label} has invalid or oversized compressed PNG text metadata: ${error.message}`);
  }
}

function pngTextChunkMetadata(type, payload, label) {
  const result = [];
  const keywordEnd = pngNull(payload, 0, payload.length, label);
  if (keywordEnd < 1 || keywordEnd > 79) throw new Error(`${label} has an invalid PNG text keyword`);
  result.push(payload.subarray(0, keywordEnd).toString("latin1"));
  if (type === "tEXt") appendBoundedMetadataText(result, payload.subarray(keywordEnd + 1), label, "latin1");
  else if (type === "zTXt") {
    const methodOffset = keywordEnd + 1;
    if (methodOffset >= payload.length || payload[methodOffset] !== 0) throw new Error(`${label} has an unsupported zTXt compression method`);
    appendBoundedMetadataText(result, inflatePngText(payload.subarray(methodOffset + 1), label), label, "latin1");
  } else if (type === "iTXt") {
    let cursor = keywordEnd + 1;
    if (cursor + 2 > payload.length) throw new Error(`${label} has a truncated iTXt header`);
    const compressed = payload[cursor];
    const method = payload[cursor + 1];
    cursor += 2;
    if ((compressed !== 0 && compressed !== 1) || method !== 0) throw new Error(`${label} has invalid iTXt compression fields`);
    const languageEnd = pngNull(payload, cursor, payload.length, label);
    result.push(payload.subarray(cursor, languageEnd).toString("ascii"));
    cursor = languageEnd + 1;
    const translatedEnd = pngNull(payload, cursor, payload.length, label);
    appendBoundedMetadataText(result, payload.subarray(cursor, translatedEnd), label);
    cursor = translatedEnd + 1;
    const text = compressed ? inflatePngText(payload.subarray(cursor), label) : payload.subarray(cursor);
    appendBoundedMetadataText(result, text, label);
  } else throw new Error(`${label} requested an unsupported PNG text chunk`);
  return result;
}

function pngTextMetadata(data, label = "PNG") {
  if (!Buffer.isBuffer(data) || data.length < 8 || !data.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`${label} has an invalid PNG signature`);
  const result = [];
  let offset = 8;
  let chunkIndex = 0;
  let sawIend = false;
  while (offset < data.length) {
    if (offset + 12 > data.length) throw new Error(`${label} has a truncated PNG chunk header`);
    const length = data.readUInt32BE(offset);
    const typeStart = offset + 4;
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + length;
    const chunkEnd = payloadEnd + 4;
    if (payloadEnd < payloadStart || chunkEnd > data.length) throw new Error(`${label} has an invalid PNG chunk bound`);
    const type = data.subarray(typeStart, payloadStart).toString("ascii");
    if (!/^[A-Za-z]{4}$/.test(type)) throw new Error(`${label} has an invalid PNG chunk type`);
    if (chunkIndex === 0 && type !== "IHDR") throw new Error(`${label} does not begin with IHDR`);
    if (sawIend) throw new Error(`${label} has bytes after IEND`);
    if (["tEXt", "zTXt", "iTXt"].includes(type)) {
      const declaredCrc = data.readUInt32BE(payloadEnd);
      const actualCrc = crc32(data.subarray(typeStart, payloadEnd));
      if (declaredCrc !== actualCrc) throw new Error(`${label} has a PNG text chunk CRC mismatch`);
      result.push(...pngTextChunkMetadata(type, data.subarray(payloadStart, payloadEnd), label));
    }
    if (type === "IEND") {
      if (length !== 0) throw new Error(`${label} has a non-empty IEND chunk`);
      sawIend = true;
    }
    offset = chunkEnd;
    chunkIndex += 1;
  }
  if (!sawIend) throw new Error(`${label} lacks IEND`);
  return result;
}

function sanitizePngPrivateMetadata(data, label = "PNG") {
  pngTextMetadata(data, label);
  const parts = [data.subarray(0, 8)];
  const removed = [];
  let offset = 8;
  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + length;
    const chunkEnd = payloadEnd + 4;
    const type = data.subarray(offset + 4, payloadStart).toString("ascii");
    const payload = data.subarray(payloadStart, payloadEnd);
    if (["tEXt", "zTXt", "iTXt"].includes(type)) {
      const strings = pngTextChunkMetadata(type, payload, label);
      if (strings.some((value) => privateHostPath(value))) {
        removed.push({ type, keyword: strings[0], bytes: chunkEnd - offset });
        offset = chunkEnd;
        continue;
      }
    }
    parts.push(data.subarray(offset, chunkEnd));
    offset = chunkEnd;
  }
  const sanitized = Buffer.concat(parts);
  assertNoPrivateMetadata(pngTextMetadata(sanitized, `${label} sanitized copy`), `${label} sanitized PNG metadata`);
  return { data: sanitized, removed };
}

async function ffprobeMetadata(ffmpegPath, filename, label) {
  const result = await execFileAsync(matchingFfprobe(ffmpegPath), [
    "-v", "error", "-show_entries", "format_tags:stream_tags", "-of", "json", filename,
  ], { windowsHide: true, maxBuffer: 2_000_000 });
  let parsed;
  try { parsed = JSON.parse(result.stdout); }
  catch { throw new Error(`${label} produced malformed ffprobe metadata JSON`); }
  return metadataStrings(parsed);
}

function fixtureMp4Box(type, payload = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, "latin1");
  if (typeBytes.length !== 4) throw new Error("internal MP4 fixture type must be four bytes");
  const box = Buffer.alloc(8 + payload.length);
  box.writeUInt32BE(box.length, 0);
  typeBytes.copy(box, 4);
  payload.copy(box, 8);
  return box;
}

function fixturePngChunk(type, payload = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + payload.length);
  chunk.writeUInt32BE(payload.length, 0);
  typeBytes.copy(chunk, 4);
  payload.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + payload.length)), 8 + payload.length);
  return chunk;
}

function fixturePng(...chunks) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([PNG_SIGNATURE, fixturePngChunk("IHDR", ihdr), ...chunks, fixturePngChunk("IEND")]);
}

function expectFixtureFailure(operation, label) {
  try { operation(); }
  catch { return; }
  throw new Error(`media privacy self-test did not fail closed: ${label}`);
}

function assertMediaPrivacyScannerSelfTest() {
  const privatePath = "C:\\Users\\fixture-user\\private-project\\source.mov";
  const ftyp = fixtureMp4Box("ftyp", Buffer.from("isom\u0000\u0000\u0002\u0000isomiso2", "latin1"));
  const mediaOnlyMp4 = Buffer.concat([ftyp, fixtureMp4Box("moov"), fixtureMp4Box("mdat", Buffer.from(privatePath))]);
  assertNoPrivateMetadata(mp4TextMetadata(mediaOnlyMp4, "MP4 mdat fixture"), "MP4 mdat fixture metadata");
  const dataHeader = Buffer.alloc(8);
  dataHeader.writeUInt32BE(1, 0);
  const comment = fixtureMp4Box("©cmt", fixtureMp4Box("data", Buffer.concat([dataHeader, Buffer.from(privatePath)])));
  const metadataMp4 = Buffer.concat([
    ftyp,
    fixtureMp4Box("moov", fixtureMp4Box("udta", fixtureMp4Box("meta", Buffer.concat([Buffer.alloc(4), fixtureMp4Box("ilst", comment)])))),
    fixtureMp4Box("mdat", Buffer.from("opaque encoded sample")),
  ]);
  expectFixtureFailure(() => assertNoPrivateMetadata(mp4TextMetadata(metadataMp4, "MP4 metadata fixture"), "MP4 metadata fixture"), "MP4 metadata path");
  expectFixtureFailure(() => assertNoPrivateMetadata(metadataStrings({ format: { tags: { comment: privatePath } } }), "ffprobe fixture"), "ffprobe tag path");
  const idatOnlyPng = fixturePng(fixturePngChunk("IDAT", Buffer.from(privatePath)));
  assertNoPrivateMetadata(pngTextMetadata(idatOnlyPng, "PNG IDAT fixture"), "PNG IDAT fixture metadata");
  const textPng = fixturePng(fixturePngChunk("tEXt", Buffer.from(`Comment\0${privatePath}`, "latin1")));
  expectFixtureFailure(() => assertNoPrivateMetadata(pngTextMetadata(textPng, "PNG tEXt fixture"), "PNG tEXt fixture"), "PNG tEXt path");
  const sanitized = sanitizePngPrivateMetadata(textPng, "PNG sanitization fixture");
  if (sanitized.removed.length !== 1 || pngTextMetadata(sanitized.data, "sanitized PNG").some(privateHostPath)) throw new Error("PNG metadata sanitization self-test failed");
  const ztxt = Buffer.concat([Buffer.from("Comment\0\0", "latin1"), deflateSync(Buffer.from(privatePath, "latin1"))]);
  expectFixtureFailure(() => assertNoPrivateMetadata(pngTextMetadata(fixturePng(fixturePngChunk("zTXt", ztxt)), "PNG zTXt fixture"), "PNG zTXt fixture"), "PNG zTXt path");
  const itxt = Buffer.concat([Buffer.from("Comment\0\0\0\0\0", "latin1"), Buffer.from(privatePath)]);
  expectFixtureFailure(() => assertNoPrivateMetadata(pngTextMetadata(fixturePng(fixturePngChunk("iTXt", itxt)), "PNG iTXt fixture"), "PNG iTXt fixture"), "PNG iTXt path");
  const corruptText = fixturePngChunk("tEXt", Buffer.from(`Comment\0${privatePath}`, "latin1"));
  corruptText[corruptText.length - 1] ^= 0x01;
  expectFixtureFailure(() => pngTextMetadata(fixturePng(corruptText), "PNG corrupt fixture"), "PNG text CRC");
  const corruptMp4 = Buffer.from(metadataMp4);
  corruptMp4.writeUInt32BE(0x7fffffff, 0);
  expectFixtureFailure(() => mp4TextMetadata(corruptMp4, "MP4 corrupt fixture"), "MP4 box bounds");
  return {
    status: "PASS",
    cases: 10,
    mediaPayloadExclusions: ["MP4 mdat", "PNG IDAT"],
    metadataPathFailures: ["ffprobe tags", "MP4 ilst/data", "PNG tEXt", "PNG zTXt", "PNG iTXt"],
    metadataSanitization: ["private PNG text chunk removed without changing image chunks"],
    malformedContainerFailures: ["MP4 box bounds", "PNG text CRC"],
  };
}

async function auditMediaPrivacyFixture(candidate, ffmpegOverride) {
  const filename = await assertFile(candidate, "media privacy fixture");
  const data = await readFile(filename);
  const extension = path.extname(filename).toLowerCase();
  let metadataFields;
  if (extension === ".mp4") {
    const ffmpegPath = await resolveFfmpeg(ffmpegOverride);
    const probeStrings = await ffprobeMetadata(ffmpegPath, filename, "media privacy fixture");
    const atomStrings = mp4TextMetadata(data, "media privacy fixture");
    assertNoPrivateMetadata(probeStrings, "media privacy fixture ffprobe metadata");
    assertNoPrivateMetadata(atomStrings, "media privacy fixture MP4 metadata");
    metadataFields = { ffprobe: probeStrings.length, recognizedMp4TextAtoms: atomStrings.length };
  } else if (extension === ".png") {
    const strings = pngTextMetadata(data, "media privacy fixture");
    assertNoPrivateMetadata(strings, "media privacy fixture PNG metadata");
    metadataFields = { pngText: strings.length };
  } else if (TEXT_EXTENSIONS.has(extension)) {
    if (privateHostPath(data.toString("utf8"))) throw new Error("private path leaked into text fixture");
    metadataFields = { fullText: 1 };
  } else throw new Error("media privacy fixture must be package text, MP4, or PNG");
  return { status: "PASS", basename: path.basename(filename), bytes: data.length, sha256: sha256(data), metadataFields };
}

async function copyPackageArtifact(record, destination, ffmpegPath, role) {
  await mkdir(path.dirname(destination), { recursive: true });
  const extension = path.extname(record.filename).toLowerCase();
  const sourceBytes = await readFile(record.filename);
  let outputBytes = sourceBytes;
  let privacyTransformation = "none";
  if (extension === ".png") {
    const sanitized = sanitizePngPrivateMetadata(sourceBytes, role);
    outputBytes = sanitized.data;
    if (sanitized.removed.length) privacyTransformation = `removed ${sanitized.removed.length} private PNG text metadata chunk(s)`;
  } else if (extension === ".mp4") {
    assertNoPrivateMetadata(await ffprobeMetadata(ffmpegPath, record.filename, role), `${role} ffprobe metadata`);
    assertNoPrivateMetadata(mp4TextMetadata(sourceBytes, role), `${role} MP4 text metadata`);
  } else if (extension === ".json") {
    outputBytes = Buffer.from(stableJson(sanitizedValue(JSON.parse(sourceBytes))));
    privacyTransformation = "canonical JSON and private-host-path sanitization";
  } else if (extension === ".svg") {
    if (privateHostPath(sourceBytes.toString("utf8"))) throw new Error(`${role} SVG contains a private host path`);
  } else throw new Error(`${role} has unsupported package artifact extension ${extension}`);
  await atomicWrite(destination, outputBytes);
  return {
    role,
    path: path.relative(path.dirname(path.dirname(destination)), destination).replaceAll("\\", "/"),
    bytes: outputBytes.length,
    sha256: sha256(outputBytes),
    sourceBytes: sourceBytes.length,
    sourceSha256: sha256(sourceBytes),
    privacyTransformation,
  };
}

async function writeSanitizedReport(outputRoot, authority, report, destinationName, role) {
  const destination = path.join(outputRoot, "reports", destinationName);
  await mkdir(path.dirname(destination), { recursive: true });
  await atomicJson(destination, sanitizedValue(report));
  const data = await readFile(destination);
  if (privateHostPath(data.toString("utf8"))) throw new Error(`private host path remains in sanitized report ${role}`);
  return {
    role,
    path: `reports/${destinationName}`,
    bytes: data.length,
    sha256: sha256(data),
    sourceBytes: authority.bytes,
    sourceSha256: authority.sha256,
    sanitizedForPrivateHostPaths: true,
  };
}

async function copyRoleSet(outputRoot, resolved, roles, directory, ffmpegPath, naming = (role, record) => `${role}${path.extname(record.filename).toLowerCase()}`) {
  const outputs = [];
  for (const role of roles) {
    const record = resolved.roles.get(role);
    const filename = naming(role, record);
    if (safeRelativePath(filename, `${role} destination filename`).includes("/")) throw new Error(`${role} destination naming must return a filename only`);
    const destination = path.join(outputRoot, ...directory.split("/"), filename);
    const copied = await copyPackageArtifact(record, destination, ffmpegPath, role);
    copied.path = `${directory}/${filename}`;
    if (record.probe) copied.probe = record.probe;
    if (record.image) copied.image = record.image;
    outputs.push(copied);
  }
  return outputs;
}

async function copyOfficialQSources(outputRoot, source, ffmpegPath) {
  const outputs = [];
  for (const role of ["official-white-svg", "official-color-svg"]) {
    const record = source.qRoles.get(role);
    const filename = role === "official-white-svg" ? "quantum-icon-white.svg" : "quantum-icon-color.svg";
    const copied = await copyPackageArtifact(record, path.join(outputRoot, "q-fidelity", filename), ffmpegPath, role);
    copied.path = `q-fidelity/${filename}`;
    outputs.push(copied);
  }
  const qImageRoles = Q_PROVENANCE_ROLES.filter((role) => !role.endsWith("svg"));
  outputs.push(...await copyRoleSet(outputRoot, { roles: source.qRoles }, qImageRoles, "q-fidelity", ffmpegPath));
  return outputs;
}

function stableGeneratedAt() {
  if (!process.env.SOURCE_DATE_EPOCH) return FIXED_EPOCH;
  const seconds = Number(process.env.SOURCE_DATE_EPOCH);
  if (!Number.isInteger(seconds) || seconds < 315532800) throw new Error("SOURCE_DATE_EPOCH must be a valid ZIP-era Unix timestamp");
  const date = new Date(seconds * 1000);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() > 2107) throw new Error("SOURCE_DATE_EPOCH exceeds classic ZIP range");
  return date.toISOString();
}

async function resolveFromExistingAncestor(candidate) {
  let current = path.resolve(candidate);
  const tail = [];
  while (!await pathExists(current)) {
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`no existing ancestor for ${candidate}`);
    tail.unshift(path.basename(current));
    current = parent;
  }
  const resolved = await realpath(current);
  return path.join(resolved, ...tail);
}

async function validateFreshExternalOutput(output, inputRoots) {
  if (!/phase[-_]?4r1|phase[-_]?4[-_]?r1/i.test(path.basename(output))) throw new Error("--output basename must clearly identify Phase 4-R1");
  if (await pathExists(output)) throw new Error("--output already exists; choose a fresh external directory");
  const resolved = await resolveFromExistingAncestor(output);
  if (isWithin(ROOT, resolved)) throw new Error("--output must resolve outside the repository");
  for (const root of inputRoots) {
    if (isWithin(root, resolved) || isWithin(resolved, root)) throw new Error("--output may not overlap an evidence input root");
  }
}

function readmeText(context) {
  const { generatedAt, repository, source, evidenceOutputs, reports } = context;
  const previewList = evidenceOutputs.previews.map((record) => `- \`${record.path}\` — ${record.probe.width}×${record.probe.height}, ${record.probe.frames} frames at 30 fps`).join("\n");
  return `# Phase 4-R1 recovery + refined Proving Hall — human review v2\n\n> **${CLASSIFICATION}**\n\nThis package is a deterministic preproduction review artifact. It does not claim human acceptance, does not complete Phase 4, does not authorize or contain a complete 540-frame Cycles production film, does not integrate the refined media into the website runtime, and does not authorize Phase 5.\n\n## Exact authority\n\n- Branch: \`${repository.branch}\`\n- HEAD/upstream: \`${repository.head}\`\n- Direct parent: \`${repository.directParent}\`\n- Production \`main\`: \`${repository.localMain}\` (unchanged)\n- Repository delta from accepted R0: ${repository.repositorySize.deltaTrackedFiles >= 0 ? "+" : ""}${repository.repositorySize.deltaTrackedFiles} tracked files; ${repository.repositorySize.deltaTrackedBytes >= 0 ? "+" : ""}${repository.repositorySize.deltaTrackedBytes} tracked bytes\n- Refined Blender derivative: \`${source.derivative.path}\` — ${source.derivative.bytes} bytes — SHA-256 \`${source.derivative.sha256}\`\n- Official white Q: \`${Q_WHITE_PATH}\` — SHA-256 \`${Q_WHITE_SHA256}\`\n- Official color Q: \`${Q_COLOR_PATH}\` — SHA-256 \`${Q_COLOR_SHA256}\`\n- Deterministic package timestamp: \`${generatedAt}\`\n\nThe recovered earlier source and old renders are retained only as recovery provenance. They are not the final refined visual authority.\n\n## Included regenerated previews\n\n${previewList}\n\nThe three forward previews, desktop reverse preview, current-travel excerpt, and Q/threshold excerpt are source/validation bound and regenerated from the refined authority. No raw frame sequences are included.\n\n## Environment evidence\n\nThe package includes a dark dormant-hall sheet, full wide-to-tight cable sheet, exact central-floor object audit, perimeter/wall detail, modeled shadow composition, restrained perimeter cable origin, simple lower-rear CRT connection, continuous-current evidence, camera-path evidence, exact-Q provenance/difference evidence, responsive sheets, Cycles stills, and the two bounded Cycles motion samples.\n\nThe central proving zone audit reports exactly two visible hero objects: the CRT and the continuous spiral cable. Perimeter infrastructure and invisible technical helpers are inventoried separately.\n\n## Browser chrome evidence limitation\n\nThe chrome evidence is explicitly labelled **current-runtime chrome-state proxy — R1 physical runtime integration not authorized**. It proves the scroll/state policy, no-first-paint flash behavior, reverse hiding, skip behavior, and fallbacks against the current 270-frame runtime. It does not claim that refined R1 media was integrated. Refined physical-media runtime integration remains prohibited at this gate.\n\n## Human review gates\n\nAll nine gates remain pending (null): recovery/provenance; dark-hall art direction; central spiral/CRT; cable origin/rear connection; current legibility; exact Q; clean chrome suppression; camera/threshold regression; final-quality material/lighting. Automation has emitted no ACCEPT, REPAIR, or REDIRECT decision.\n\n## Evidence reports\n\n${reports.map((record) => `- \`${record.path}\` (SHA-256 \`${record.sha256}\`)`).join("\n")}\n\n## Privacy and package boundaries\n\nAll copied JSON is canonicalized and private host paths are redacted. PNG textual chunks and MP4/ffprobe metadata are inspected with the same container-aware policy as the checkpointed v1 packager. Package safety rejects raw/frames/source directories, Blender files, EXRs, caches, autosaves, and private paths. The adjacent detached checksum receipt contains the final ZIP byte size and SHA-256 because a ZIP cannot contain its own final hash without changing it.\n`;
}

async function packageFileRecords(root, relativePaths) {
  const records = [];
  for (const relativePath of [...relativePaths].sort(lexicalCompare)) {
    const data = await readFile(path.join(root, ...relativePath.split("/")));
    records.push({ path: relativePath, bytes: data.length, sha256: sha256(data) });
  }
  return records;
}

async function assertPackageSafety(root, relativePaths, ffmpegPath) {
  assertMediaPrivacyScannerSelfTest();
  const forbidden = /(?:^|\/)(?:raw|frames?|cache|caches|source|autosaves?|recovery-backup)(?:\/|$)|\.(?:blend\d*|exr|abc|vdb|bphys|tmp|bak)$/i;
  for (const relativePath of relativePaths) {
    if (forbidden.test(relativePath)) throw new Error(`forbidden raw/source/cache artifact in package: ${relativePath}`);
    const filename = path.join(root, ...relativePath.split("/"));
    const data = await readFile(filename);
    const extension = path.extname(relativePath).toLowerCase();
    if (TEXT_EXTENSIONS.has(extension)) {
      if (privateHostPath(data.toString("utf8"))) throw new Error(`private host path leaked into ${relativePath}`);
    } else if (extension === ".mp4") {
      assertNoPrivateMetadata(await ffprobeMetadata(ffmpegPath, filename, relativePath), `${relativePath} ffprobe metadata`);
      assertNoPrivateMetadata(mp4TextMetadata(data, relativePath), `${relativePath} MP4 metadata`);
    } else if (extension === ".png") {
      assertNoPrivateMetadata(pngTextMetadata(data, relativePath), `${relativePath} PNG metadata`);
    } else throw new Error(`unsupported package file extension: ${relativePath}`);
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = date.getUTCFullYear();
  if (year < 1980 || year > 2107) throw new Error("ZIP timestamp is outside classic DOS range");
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

async function createStoredZip(root, relativePaths, destination, generatedAt) {
  const files = [...relativePaths].sort(lexicalCompare);
  if (files.length > 0xffff) throw new Error("classic ZIP entry limit exceeded");
  const { time, date } = dosDateTime(new Date(generatedAt));
  const local = [];
  const central = [];
  let offset = 0;
  for (const relativePath of files) {
    const name = Buffer.from(relativePath, "utf8");
    const data = await readFile(path.join(root, ...relativePath.split("/")));
    if (data.length > 0xffffffff || offset > 0xffffffff) throw new Error("classic ZIP size limit exceeded");
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    local.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, name);
    offset += localHeader.length + name.length + data.length;
  }
  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  await atomicWrite(destination, Buffer.concat([...local, centralBuffer, end]));
}

async function verifyStoredZip(archiveData, root, expectedFiles) {
  let cursor = 0;
  const entries = [];
  for (const expected of [...expectedFiles].sort(lexicalCompare)) {
    const localOffset = cursor;
    if (cursor + 30 > archiveData.length) throw new Error(`ZIP local header is truncated for ${expected}`);
    if (archiveData.readUInt32LE(cursor) !== 0x04034b50) throw new Error(`ZIP local header missing for ${expected}`);
    const flags = archiveData.readUInt16LE(cursor + 6);
    const method = archiveData.readUInt16LE(cursor + 8);
    const crc = archiveData.readUInt32LE(cursor + 14);
    const compressedSize = archiveData.readUInt32LE(cursor + 18);
    const uncompressedSize = archiveData.readUInt32LE(cursor + 22);
    const nameLength = archiveData.readUInt16LE(cursor + 26);
    const extraLength = archiveData.readUInt16LE(cursor + 28);
    const nameStart = cursor + 30;
    const name = archiveData.subarray(nameStart, nameStart + nameLength).toString("utf8");
    const dataStart = nameStart + nameLength + extraLength;
    const data = archiveData.subarray(dataStart, dataStart + compressedSize);
    const source = await readFile(path.join(root, ...expected.split("/")));
    if (flags !== 0x0800 || method !== 0 || extraLength !== 0 || name !== expected || compressedSize !== source.length || uncompressedSize !== source.length
      || crc !== crc32(source) || sha256(data) !== sha256(source)) throw new Error(`ZIP entry failed independent verification: ${expected}`);
    entries.push({ path: name, bytes: source.length, crc32: crc.toString(16).padStart(8, "0"), sha256: sha256(source), localOffset });
    cursor = dataStart + compressedSize;
  }
  const centralOffset = cursor;
  for (let index = 0; index < entries.length; index += 1) {
    const expected = entries[index];
    if (cursor + 46 > archiveData.length || archiveData.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error(`ZIP central-directory header missing or truncated for ${expected.path}`);
    }
    const flags = archiveData.readUInt16LE(cursor + 8);
    const method = archiveData.readUInt16LE(cursor + 10);
    const crc = archiveData.readUInt32LE(cursor + 16);
    const compressedSize = archiveData.readUInt32LE(cursor + 20);
    const uncompressedSize = archiveData.readUInt32LE(cursor + 24);
    const nameLength = archiveData.readUInt16LE(cursor + 28);
    const extraLength = archiveData.readUInt16LE(cursor + 30);
    const commentLength = archiveData.readUInt16LE(cursor + 32);
    const diskStart = archiveData.readUInt16LE(cursor + 34);
    const localOffset = archiveData.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    const end = nameStart + nameLength + extraLength + commentLength;
    if (end > archiveData.length) throw new Error(`ZIP central-directory entry is truncated for ${expected.path}`);
    const name = archiveData.subarray(nameStart, nameStart + nameLength).toString("utf8");
    if (flags !== 0x0800 || method !== 0 || name !== expected.path || compressedSize !== expected.bytes || uncompressedSize !== expected.bytes
      || crc !== Number.parseInt(expected.crc32, 16) || extraLength !== 0 || commentLength !== 0 || diskStart !== 0 || localOffset !== expected.localOffset) {
      throw new Error(`ZIP central-directory entry disagrees with verified local authority: ${expected.path}`);
    }
    cursor = end;
  }
  const centralSize = cursor - centralOffset;
  if (cursor + 22 !== archiveData.length || archiveData.readUInt32LE(cursor) !== 0x06054b50) throw new Error("ZIP end-of-central-directory record is missing, truncated, or followed by trailing bytes");
  const diskNumber = archiveData.readUInt16LE(cursor + 4);
  const centralDisk = archiveData.readUInt16LE(cursor + 6);
  const entriesOnDisk = archiveData.readUInt16LE(cursor + 8);
  const totalEntries = archiveData.readUInt16LE(cursor + 10);
  const declaredCentralSize = archiveData.readUInt32LE(cursor + 12);
  const declaredCentralOffset = archiveData.readUInt32LE(cursor + 16);
  const commentLength = archiveData.readUInt16LE(cursor + 20);
  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entries.length || totalEntries !== entries.length
    || declaredCentralSize !== centralSize || declaredCentralOffset !== centralOffset || commentLength !== 0) {
    throw new Error("ZIP end-of-central-directory authority mismatch");
  }
  return {
    status: "PASS",
    method: "local headers/data plus central-directory and EOCD name/offset/count/size/CRC32/SHA-256 verification",
    entries: entries.length,
    centralOffset,
    centralSize,
    trailingBytes: 0,
  };
}

async function deterministicZipSelfTest() {
  const prefix = path.join(tmpdir(), "qsite-phase4r1-v2-zip-selftest-");
  const root = await mkdtemp(prefix);
  const resolvedTemp = await realpath(tmpdir());
  const resolvedRoot = await realpath(root);
  if (!isWithin(resolvedTemp, resolvedRoot) || !path.basename(resolvedRoot).startsWith("qsite-phase4r1-v2-zip-selftest-")) {
    throw new Error("ZIP self-test temporary root escaped its exact safety boundary");
  }
  try {
    await mkdir(path.join(resolvedRoot, "reports"), { recursive: false });
    await atomicWrite(path.join(resolvedRoot, "README.md"), "deterministic Phase 4-R1 v2 ZIP fixture\n");
    await atomicJson(path.join(resolvedRoot, "reports", "fixture.json"), { schema: "quantum-hub.phase-4-r1.zip-self-test.v2", status: "PASS" });
    const relativePaths = ["README.md", "reports/fixture.json"];
    const first = path.join(resolvedRoot, "first.zip");
    const second = path.join(resolvedRoot, "second.zip");
    await createStoredZip(resolvedRoot, relativePaths, first, FIXED_EPOCH);
    await createStoredZip(resolvedRoot, relativePaths, second, FIXED_EPOCH);
    const [firstBytes, secondBytes] = await Promise.all([readFile(first), readFile(second)]);
    if (!firstBytes.equals(secondBytes)) throw new Error("deterministic ZIP self-test produced different bytes from identical inputs");
    const verification = await verifyStoredZip(firstBytes, resolvedRoot, relativePaths);
    const tampered = Buffer.from(firstBytes);
    tampered.writeUInt32LE((tampered.readUInt32LE(verification.centralOffset + 16) ^ 1) >>> 0, verification.centralOffset + 16);
    let tamperRejected = false;
    try { await verifyStoredZip(tampered, resolvedRoot, relativePaths); }
    catch { tamperRejected = true; }
    if (!tamperRejected) throw new Error("deterministic ZIP self-test did not reject a corrupted central-directory CRC");
    return {
      status: "PASS",
      deterministicByteEquality: true,
      archiveBytes: firstBytes.length,
      archiveSha256: sha256(firstBytes),
      integrity: verification,
      corruptedCentralDirectoryRejected: true,
    };
  } finally {
    if (isWithin(resolvedTemp, resolvedRoot) && path.basename(resolvedRoot).startsWith("qsite-phase4r1-v2-zip-selftest-")) {
      await rm(resolvedRoot, { recursive: true, force: true });
    }
  }
}

const CHROME_OUTPUT_NAMES = Object.freeze({
  CHROME_FIRST_PAINT_DESKTOP: "first-paint-desktop.png",
  CHROME_FIRST_PAINT_MOBILE: "first-paint-mobile.png",
  CHROME_MILESTONES_DESKTOP_SHEET: "chrome-visibility-desktop-sheet.png",
  CHROME_MILESTONES_MOBILE_SHEET: "chrome-visibility-mobile-sheet.png",
  CHROME_REVEAL_REVERSE_RECORDING: "chrome-reveal-reverse.mp4",
  CHROME_SKIP_PENDING_RECORDING: "chrome-skip-media-pending.mp4",
  CHROME_FALLBACKS_SHEET: "chrome-fallbacks-sheet.png",
});

function publicAuthority(record) {
  return { path: record.path, bytes: record.bytes, sha256: record.sha256 };
}

function publicEvidenceAuthority(resolved) {
  return {
    schema: resolved.manifest.schema,
    status: resolved.manifest.status ?? (resolved.manifest.passed === true ? "PASS" : undefined),
    manifest: resolved.record,
    trackedProducers: resolved.producerAuthorities,
    exhaustiveRootInventory: resolved.exhaustive,
  };
}

async function assemblePackage(resolved, output) {
  const roots = EVIDENCE_KEYS.map((key) => resolved.evidence[key].root);
  await validateFreshExternalOutput(output, roots);
  await mkdir(output, { recursive: false });
  const outputRoot = await realpath(output);
  if (isWithin(ROOT, outputRoot)) throw new Error("created output unexpectedly resolves inside the repository");
  for (const directory of ["previews", "sheets/environment", "sheets/chrome", "sheets/responsive", "cycles/benchmark-stills", "cycles/motion-samples", "q-fidelity", "reports"]) {
    await mkdir(path.join(outputRoot, ...directory.split("/")), { recursive: true });
  }
  const generatedAt = stableGeneratedAt();
  const source = resolved.source;
  const evidence = resolved.evidence;
  const ffmpegPath = resolved.ffmpegPath;
  const mediaTools = await ffmpegAuthority(ffmpegPath);
  const consumerAuthority = await packagerAuthority();
  const inputContractBytes = await readFile(resolved.contractPath);
  const inputContractAuthority = { bytes: inputContractBytes.length, sha256: sha256(inputContractBytes), includedInPackage: false, privatePathsCopied: false };

  try {
    const reports = [];
    const sourceReportNames = {
      recoveryReport: "phase4r1-recovery-report.json",
      recoveryBackupSummary: "phase4r1-recovery-backup-summary.json",
      sourceBuild: "phase4r1-refined-source-build.json",
      sourceValidation: "phase4r1-refined-source-validation.json",
      assetLedger: "phase4r1-refined-asset-ledger.json",
      qProvenance: "phase4r1-exact-q-provenance.json",
    };
    for (const key of SOURCE_KEYS) {
      reports.push(await writeSanitizedReport(outputRoot, source.authorities[key], source.reports[key], sourceReportNames[key], key));
    }
    const evidenceReports = [
      ["environmentProof", "phase4r1-refined-proof-manifest.json"],
      ["previews", "phase4r1-refined-previews-manifest.json"],
      ["cyclesStills", "phase4r1-refined-cycles-benchmarks-manifest.json"],
      ["cyclesMotion", "phase4r1-refined-cycles-motion-manifest.json"],
      ["chrome", "phase4r1-chrome-evidence-report.json"],
      ["responsive", "phase4r1-refined-responsive-evidence-manifest.json"],
    ];
    for (const [key, filename] of evidenceReports) {
      reports.push(await writeSanitizedReport(outputRoot, evidence[key].record, evidence[key].manifest, filename, `${key}-manifest`));
    }
    const errorInvestigationPath = path.join(outputRoot, "reports", "phase4r1-actual-error-investigation.json");
    await atomicJson(errorInvestigationPath, sanitizedValue({
      schema: "quantum-hub.phase-4-r1.actual-error-investigation.v2",
      status: "PASS",
      classification: CLASSIFICATION,
      investigation: source.reports.recoveryReport.errorInvestigation,
      promptCacheRetentionInvestigated: true,
      selectedRecoveredSource: source.reports.recoveryReport.selectedSource,
      sourceRecoveryReportSha256: source.authorities.recoveryReport.sha256,
    }));
    const errorInvestigationBytes = await readFile(errorInvestigationPath);
    reports.push({
      role: "actual-error-investigation",
      path: "reports/phase4r1-actual-error-investigation.json",
      bytes: errorInvestigationBytes.length,
      sha256: sha256(errorInvestigationBytes),
      sourceSha256: source.authorities.recoveryReport.sha256,
    });

    const environmentOutputs = [
      ...await copyRoleSet(outputRoot, evidence.environmentProof, ENVIRONMENT_ROLES, "sheets/environment", ffmpegPath),
      ...await copyRoleSet(outputRoot, evidence.environmentProof, ENVIRONMENT_AUDIT_ROLES, "reports", ffmpegPath),
    ];
    const previewOutputs = await copyRoleSet(
      outputRoot,
      evidence.previews,
      Object.keys(PREVIEW_ROLES),
      "previews",
      ffmpegPath,
      (role) => PREVIEW_ROLES[role].filename,
    );
    const cyclesStillOutputs = await copyRoleSet(outputRoot, evidence.cyclesStills, CYCLES_STILL_ROLES, "cycles/benchmark-stills", ffmpegPath);
    const cyclesMotionOutputs = await copyRoleSet(outputRoot, evidence.cyclesMotion, Object.keys(CYCLES_MOTION_ROLES), "cycles/motion-samples", ffmpegPath);
    const chromeOutputs = await copyRoleSet(
      outputRoot,
      evidence.chrome,
      CHROME_ARTIFACT_ROLES,
      "sheets/chrome",
      ffmpegPath,
      (role) => CHROME_OUTPUT_NAMES[role],
    );
    const responsiveOutputs = await copyRoleSet(outputRoot, evidence.responsive, RESPONSIVE_ROLE_IDS, "sheets/responsive", ffmpegPath);
    const qOutputs = await copyOfficialQSources(outputRoot, source, ffmpegPath);
    const evidenceOutputs = {
      environment: environmentOutputs,
      previews: previewOutputs,
      cyclesStills: cyclesStillOutputs,
      cyclesMotion: cyclesMotionOutputs,
      chrome: chromeOutputs,
      responsive: responsiveOutputs,
      qFidelity: qOutputs,
    };

    await atomicWrite(path.join(outputRoot, README_FILENAME), readmeText({
      generatedAt,
      repository: resolved.repository,
      source,
      evidenceOutputs,
      reports,
    }));

    const preManifestPaths = (await listFiles(outputRoot)).filter((relativePath) => ![ARCHIVE_FILENAME, MANIFEST_FILENAME, RESULT_FILENAME].includes(relativePath));
    const files = await packageFileRecords(outputRoot, preManifestPaths);
    const manifest = {
      schema: PACKAGE_SCHEMA,
      status: "PASS",
      generatedAt,
      classification: CLASSIFICATION,
      authorization: {
        humanAccepted: false,
        phase4CompleteClaimed: false,
        full540FrameCyclesProductionFilmStarted: false,
        full540FrameCyclesProductionFilmResumed: false,
        full540FrameCyclesProductionFilmAuthorized: false,
        refinedPhysicalMediaRuntimeIntegrationStarted: false,
        refinedPhysicalMediaRuntimeIntegrationAuthorized: false,
        chromeStatePolicyImplementationEvidenced: true,
        phase5Authorized: false,
      },
      humanReviewGates: HUMAN_REVIEW_GATES,
      finalHandoffCoverage: FINAL_HANDOFF_COVERAGE,
      honesty: {
        automatedHumanDecisionEmitted: false,
        recoveredOldRendersUsedAsFinalRefinedEvidence: false,
        recoveredOldSourceIncluded: false,
        refinedBlenderSourceIncluded: false,
        rawFrameSequencesIncluded: false,
        exrCachesAutosavesIncluded: false,
        recoveryBackupIncluded: false,
        completeCyclesProductionFilmIncluded: false,
        chromeEvidenceScope: "current-runtime chrome-state proxy — R1 physical runtime integration not authorized",
        chromeEvidenceUsesIntegratedR1PhysicalMedia: false,
        outputExternalAndUntracked: true,
      },
      deterministicPolicy: {
        timestamp: generatedAt,
        archive: "stored classic ZIP; sorted UTF-8 paths; fixed UTC DOS timestamp",
        mediaPrivacy: "container-aware MP4 box + ffprobe metadata and PNG text-chunk inspection; private PNG text chunks removed only when necessary",
        json: "two-space canonical JSON plus private-host-path sanitization",
        node: process.version,
        sharp: sharp.versions.sharp,
        libvips: sharp.versions.vips,
        mediaTools,
      },
      consumerAuthority,
      inputContractAuthority,
      repository: resolved.repository,
      sourceAuthorities: {
        derivative: publicAuthority(source.derivative),
        trackedProducers: source.producerAuthorities,
        reports: Object.fromEntries(SOURCE_KEYS.map((key) => [key, publicAuthority(source.authorities[key])])),
        officialQ: source.qAuthorities,
        qFiles: source.qFiles.map((record) => ({ role: record.role, path: record.repositoryPath, bytes: record.bytes, sha256: record.sha256 })),
      },
      evidenceAuthorities: Object.fromEntries(EVIDENCE_KEYS.map((key) => [key, publicEvidenceAuthority(evidence[key])])),
      evidenceCrossBinding: {
        refinedDerivativeSha256: source.derivative.sha256,
        refinedSourceBuildSha256: source.authorities.sourceBuild.sha256,
        refinedSourceValidationSha256: source.authorities.sourceValidation.sha256,
        actualPackedPreCrtQSha256: source.qRoles.get("pre-crt-effect-q").sha256,
        officialWhiteQSha256: Q_WHITE_SHA256,
        officialColorQSha256: Q_COLOR_SHA256,
        environmentProofManifestSha256: evidence.environmentProof.record.sha256,
        previewsManifestSha256: evidence.previews.record.sha256,
        cyclesStillsManifestSha256: evidence.cyclesStills.record.sha256,
        cyclesMotionManifestSha256: evidence.cyclesMotion.record.sha256,
        chromeProxyReportSha256: evidence.chrome.record.sha256,
        responsiveManifestSha256: evidence.responsive.record.sha256,
        chromeIsStatePolicyEvidenceNotRefinedRenderEvidence: true,
      },
      recovery: {
        ...resolved.recovery,
        recoveryReportSha256: source.authorities.recoveryReport.sha256,
        recoveryBackupSummarySha256: source.authorities.recoveryBackupSummary.sha256,
        selectedRecoveredSource: sanitizedValue(source.reports.recoveryReport.selectedSource),
        oldRecoveredVisualsClass: "recovery provenance only",
      },
      audits: sanitizedValue(evidence.environmentProof.manifest.audits),
      chromeAudit: {
        reportSha256: evidence.chrome.record.sha256,
        stateCount: evidence.chrome.stateMap.size,
        supplementalResponsiveStateCount: evidence.chrome.supplementalMap.size,
        hiddenPreSettledStates: CHROME_HIDDEN_STATE_IDS,
        visibleSettledAndFallbackStates: CHROME_VISIBLE_STATE_IDS,
        noFirstPaintFlashPassed: true,
        hiddenPointerInterceptionPassed: true,
        hiddenKeyboardFocusTargetPassed: true,
        reverseHidesChromePassed: true,
        fallbacksExposeNormalChromePassed: true,
      },
      evidenceOutputs,
      reports,
      counts: {
        regeneratedForwardPreviews: 3,
        regeneratedReversePreviews: 1,
        updatedMotionExcerpts: 2,
        environmentSheets: ENVIRONMENT_ROLES.length,
        machineReadableEnvironmentAudits: ENVIRONMENT_AUDIT_ROLES.length,
        exactQFiles: qOutputs.length,
        chromeStates: CHROME_STATE_IDS.length,
        chromeSupplementalResponsiveStates: CHROME_SUPPLEMENTAL_STATE_IDS.length,
        chromeReviewMedia: CHROME_ARTIFACT_ROLES.length,
        responsiveSheets: RESPONSIVE_ROLE_IDS.length,
        cyclesBenchmarkStills: CYCLES_STILL_ROLES.length,
        cyclesMotionSamples: Object.keys(CYCLES_MOTION_ROLES).length,
      },
      archivePlan: {
        filename: ARCHIVE_FILENAME,
        includesManifest: true,
        manifestExcludedFromOwnFileLedger: true,
        detachedChecksumReceipt: RESULT_FILENAME,
        detachedChecksumReceiptIncludedInArchive: false,
        selfHashExplanation: "A ZIP cannot contain its own final SHA-256 without changing that SHA-256.",
      },
      files,
    };
    forbiddenAuthorizationTruth(manifest);
    rejectAmbiguousBoundaryClaims(manifest);
    for (const decision of Object.values(manifest.humanReviewGates)) if (decision !== null) throw new Error("human review gate decisions must remain null");
    await atomicJson(path.join(outputRoot, MANIFEST_FILENAME), manifest);

    const archiveFiles = (await listFiles(outputRoot)).filter((relativePath) => ![ARCHIVE_FILENAME, RESULT_FILENAME].includes(relativePath));
    await assertPackageSafety(outputRoot, archiveFiles, ffmpegPath);
    const archivePath = path.join(outputRoot, ARCHIVE_FILENAME);
    await createStoredZip(outputRoot, archiveFiles, archivePath, generatedAt);
    const [archiveData, manifestData] = await Promise.all([
      readFile(archivePath),
      readFile(path.join(outputRoot, MANIFEST_FILENAME)),
    ]);
    const zipIntegrityGate = await verifyStoredZip(archiveData, outputRoot, archiveFiles);
    const result = {
      schema: RESULT_SCHEMA,
      status: "PASS",
      generatedAt,
      classification: CLASSIFICATION,
      archive: { filename: ARCHIVE_FILENAME, bytes: archiveData.length, sha256: sha256(archiveData), entries: archiveFiles.length },
      manifest: { filename: MANIFEST_FILENAME, bytes: manifestData.length, sha256: sha256(manifestData), excludedFromOwnFileLedger: true },
      zipIntegrityGate,
      full540FrameCyclesProductionFilmStarted: false,
      full540FrameCyclesProductionFilmResumed: false,
      refinedPhysicalMediaRuntimeIntegrationStarted: false,
      chromeStatePolicyImplementationEvidenced: true,
      humanAccepted: false,
      phase5Authorized: false,
    };
    await atomicJson(path.join(outputRoot, RESULT_FILENAME), result);
    return { outputRoot, archivePath, result };
  } catch (error) {
    await rm(outputRoot, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

function sourceBuildPreservationSelfTestFixture() {
  return {
    preservationSignatureSchema: PRESERVATION_SIGNATURE_SCHEMA,
    persistenceVolatileRnaPropertyExclusionAuthority: {
      properties: [...PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY.properties],
      scope: PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY.scope,
      reason: PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY.reason,
    },
    acceptedCrtBefore: {},
    acceptedCrtAfter: {},
    acceptedCrtPhysicalMaterialsActionsUnchanged: true,
    oldApproximateQVisibilityUnchangedHidden: {
      before: {
        Phase4R0_QuantumQ_Accent: true,
        Phase4R0_QuantumQ_Body: true,
      },
      after: {
        Phase4R0_QuantumQ_Accent: true,
        Phase4R0_QuantumQ_Body: true,
      },
      changed: false,
      crtTrackMutationOccurred: false,
    },
    cameraPathBefore: {},
    cameraPathAfter: {},
    cameraOrbitThresholdActionsAndStaticRigStateUnchanged: true,
    establishingAimBefore: {},
    establishingAimAfter: {},
    establishingAimActionsAndStaticStateUnchanged: true,
    recoveredSourceOverwritten: false,
  };
}

function chromeHiddenStateTypeSelfTest() {
  const fixture = {
    id: "chrome-hidden-fixture",
    measured: {
      chromeVisibleCount: 0,
      header: {
        visibility: "hidden",
        opacity: 0,
        pointerEvents: "none",
        inert: true,
        hitTested: false,
        visibleDescendantCount: 0,
        focusableDescendantCount: 0,
      },
      h1Count: 1,
      entryRouteCount: 2,
      entry: {
        inert: true,
        pointerEvents: "none",
        focusableDescendantCount: 0,
      },
      shellInteractive: "false",
    },
  };
  assertChromeHiddenState(fixture);
  const invalid = structuredClone(fixture);
  invalid.measured.shellInteractive = false;
  let booleanRejected = false;
  try { assertChromeHiddenState(invalid); }
  catch { booleanRejected = true; }
  if (!booleanRejected) throw new Error("chrome hidden-state self-test accepted a Boolean in place of the DOM attribute string");
  return {
    status: "PASS",
    domAttributeType: "string",
    concealedValue: "false",
    booleanRejected: true,
  };
}

function videoTimelineSelfTest() {
  const production = { nominalFps: 30, averageFps: 30, frames: 540, durationSeconds: 18 };
  const chromeReveal = { nominalFps: 8, averageFps: 8, frames: 17, durationSeconds: 2.125 };
  const chromeSkip = { nominalFps: 8, averageFps: 8, frames: 8, durationSeconds: 1 };
  assertExactVideoTimeline(production, 30, "production timeline fixture");
  assertExactVideoTimeline(chromeReveal, 8, "Chrome reveal timeline fixture");
  assertExactVideoTimeline(chromeSkip, 8, "Chrome skip timeline fixture");
  const expectFailure = (label, fixture, expectedFps) => {
    try { assertExactVideoTimeline(fixture, expectedFps, label); }
    catch { return true; }
    throw new Error(`video timeline self-test did not reject ${label}`);
  };
  const chromeRejectedAsProduction = expectFailure("8-fps Chrome proxy as production", chromeReveal, 30);
  const productionRejectedAsChrome = expectFailure("30-fps production as Chrome proxy", production, 8);
  const wrongDurationRejected = expectFailure("wrong Chrome duration", { ...chromeReveal, durationSeconds: 2 }, 8);
  return {
    status: "PASS",
    productionFps: 30,
    chromeProxyFps: 8,
    chromeRejectedAsProduction,
    productionRejectedAsChrome,
    wrongDurationRejected,
  };
}

function assertContractSelfTest() {
  const contract = inputContractTemplate();
  const checklist = producerChecklist();
  if (contract.schema !== CONTRACT_SCHEMA || checklist.status !== "FROZEN") throw new Error("contract self-test schema freeze failed");
  exactArraySet(Object.keys(contract.authorities), SOURCE_KEYS, "contract source keys");
  exactArraySet(Object.keys(contract.evidence), EVIDENCE_KEYS, "contract evidence keys");
  exactArraySet(Object.keys(PREVIEW_ROLES), ["desktop-forward", "mobile-forward", "landscape-forward", "desktop-reverse", "current-travel-excerpt", "q-threshold-excerpt"], "preview roles");
  exactArraySet(Object.keys(CHROME_RECORDING_ROLES), ["CHROME_REVEAL_REVERSE_RECORDING", "CHROME_SKIP_PENDING_RECORDING"], "Chrome recording roles");
  exactArraySet([...CHROME_HIDDEN_STATE_IDS, ...CHROME_VISIBLE_STATE_IDS], CHROME_STATE_IDS, "chrome state partition");
  if (new Set(ENVIRONMENT_ROLES).size !== ENVIRONMENT_ROLES.length
    || new Set(ENVIRONMENT_AUDIT_ROLES).size !== ENVIRONMENT_AUDIT_ROLES.length
    || new Set(CHROME_ARTIFACT_ROLES).size !== CHROME_ARTIFACT_ROLES.length) throw new Error("contract self-test found duplicate roles");
  if (FINAL_HANDOFF_COVERAGE.length !== 43 || FINAL_HANDOFF_COVERAGE.some((record, index) => record.item !== index + 1)) {
    throw new Error("contract self-test found an incomplete or unordered 43-item final-handoff coverage matrix");
  }
  for (const value of Object.values(HUMAN_REVIEW_GATES)) if (value !== null) throw new Error("human gate self-test failed");
  validateContractAuthorization(contract.authorization);
  validateSourceBuildPreservation(sourceBuildPreservationSelfTestFixture());
  return {
    status: "PASS",
    schema: CONTRACT_SCHEMA,
    sourceSchemas: SOURCE_SCHEMAS,
    evidenceSchemas: EVIDENCE_SCHEMAS,
    roleCounts: {
      previews: Object.keys(PREVIEW_ROLES).length,
      environmentSheets: ENVIRONMENT_ROLES.length,
      environmentAudits: ENVIRONMENT_AUDIT_ROLES.length,
      qFiles: Q_PROVENANCE_ROLES.length,
      chromeStates: CHROME_STATE_IDS.length,
      chromeSupplementalStates: CHROME_SUPPLEMENTAL_STATE_IDS.length,
      chromeRequiredChecks: CHROME_REQUIRED_CHECK_IDS.length,
      chromeArtifacts: CHROME_ARTIFACT_ROLES.length,
      responsive: RESPONSIVE_ROLE_IDS.length,
      cyclesStills: CYCLES_STILL_ROLES.length,
      cyclesMotion: Object.keys(CYCLES_MOTION_ROLES).length,
      humanGatesPending: Object.keys(HUMAN_REVIEW_GATES).length,
      finalHandoffItems: FINAL_HANDOFF_COVERAGE.length,
    },
    sourceBuildPreservation: {
      exactFields: SOURCE_BUILD_PRESERVATION_KEYS,
      signatureSchema: PRESERVATION_SIGNATURE_SCHEMA,
      persistenceVolatileRnaPropertyExclusionAuthority: PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY,
      rejectedGenericAliases: LEGACY_SOURCE_BUILD_PRESERVATION_ALIASES,
      exactOldQVisibilityObjects: OLD_Q_VISIBILITY_OBJECTS,
      oldQVisibilityState: "hidden -> hidden, unchanged",
      crtTrackMutationOccurred: false,
    },
    chromeHiddenStateType: chromeHiddenStateTypeSelfTest(),
    videoTimelines: videoTimelineSelfTest(),
    mediaPrivacy: assertMediaPrivacyScannerSelfTest(),
  };
}

function assertInvalidContractSelfTest() {
  const rejected = [];
  const expectFailure = (label, operation) => {
    try { operation(); }
    catch (error) {
      rejected.push({ label, message: error.message });
      return;
    }
    throw new Error(`invalid-contract self-test did not fail closed: ${label}`);
  };
  const authorization = structuredClone(inputContractTemplate().authorization);
  authorization.full540FrameCyclesProductionFilmStarted = true;
  expectFailure("unauthorized full 540-frame Cycles production-film start", () => validateContractAuthorization(authorization));
  const deniedChromePolicy = structuredClone(inputContractTemplate().authorization);
  deniedChromePolicy.chromeStatePolicyImplementationEvidenced = false;
  expectFailure("false denial of implemented chrome-state policy evidence", () => validateContractAuthorization(deniedChromePolicy));
  expectFailure("ambiguous generic runtime boundary", () => rejectAmbiguousBoundaryClaims({ runtimeIntegrationStarted: false }));
  expectFailure("ambiguous generic production-render boundary", () => rejectAmbiguousBoundaryClaims({ productionRenderingStarted: false }));
  for (const alias of LEGACY_SOURCE_BUILD_PRESERVATION_ALIASES) {
    const legacyPreservation = sourceBuildPreservationSelfTestFixture();
    legacyPreservation[alias] = true;
    expectFailure(`generic source-build preservation alias ${alias}`, () => validateSourceBuildPreservation(legacyPreservation));
  }
  const wrongPreservationSchema = sourceBuildPreservationSelfTestFixture();
  wrongPreservationSchema.preservationSignatureSchema = "quantum-hub.phase-4-r1.refined-proving-hall.preservation-signatures.v2";
  expectFailure("stale source-build preservation signature schema", () => validateSourceBuildPreservation(wrongPreservationSchema));
  const widenedVolatileExclusions = sourceBuildPreservationSelfTestFixture();
  widenedVolatileExclusions.persistenceVolatileRnaPropertyExclusionAuthority.properties.push("tag");
  expectFailure("source-build preservation excludes authored tag state", () => validateSourceBuildPreservation(widenedVolatileExclusions));
  const changedExclusionScope = sourceBuildPreservationSelfTestFixture();
  changedExclusionScope.persistenceVolatileRnaPropertyExclusionAuthority.scope = "all RNA persistence hashing";
  expectFailure("source-build preservation exclusion scope drift", () => validateSourceBuildPreservation(changedExclusionScope));
  const changedExclusionReason = sourceBuildPreservationSelfTestFixture();
  changedExclusionReason.persistenceVolatileRnaPropertyExclusionAuthority.reason = "runtime field";
  expectFailure("source-build preservation exclusion reason drift", () => validateSourceBuildPreservation(changedExclusionReason));
  const extraExclusionAuthorityKey = sourceBuildPreservationSelfTestFixture();
  extraExclusionAuthorityKey.persistenceVolatileRnaPropertyExclusionAuthority.appliesTo = "all signatures";
  expectFailure("source-build preservation exclusion authority has an extra key", () => validateSourceBuildPreservation(extraExclusionAuthorityKey));
  const visibleOldQBefore = sourceBuildPreservationSelfTestFixture();
  visibleOldQBefore.oldApproximateQVisibilityUnchangedHidden.before.Phase4R0_QuantumQ_Body = false;
  expectFailure("old-Q body is visible before refinement", () => validateSourceBuildPreservation(visibleOldQBefore));
  const visibleOldQAfter = sourceBuildPreservationSelfTestFixture();
  visibleOldQAfter.oldApproximateQVisibilityUnchangedHidden.after.Phase4R0_QuantumQ_Accent = false;
  expectFailure("old-Q accent is visible after refinement", () => validateSourceBuildPreservation(visibleOldQAfter));
  const extraOldQObject = sourceBuildPreservationSelfTestFixture();
  extraOldQObject.oldApproximateQVisibilityUnchangedHidden.after.UnapprovedQTrack = true;
  expectFailure("unchanged old-Q visibility record names an extra object", () => validateSourceBuildPreservation(extraOldQObject));
  const falselyChangedOldQ = sourceBuildPreservationSelfTestFixture();
  falselyChangedOldQ.oldApproximateQVisibilityUnchangedHidden.changed = true;
  expectFailure("old-Q visibility falsely claims a change", () => validateSourceBuildPreservation(falselyChangedOldQ));
  const claimedOldQMutation = sourceBuildPreservationSelfTestFixture();
  claimedOldQMutation.oldApproximateQVisibilityUnchangedHidden.crtTrackMutationOccurred = true;
  expectFailure("old-Q visibility claims a CRT-track mutation", () => validateSourceBuildPreservation(claimedOldQMutation));
  const missingEvidence = structuredClone(inputContractTemplate());
  delete missingEvidence.evidence.chrome;
  expectFailure("missing chrome evidence authority", () => exactKeys(missingEvidence.evidence, EVIDENCE_KEYS, EVIDENCE_KEYS, "invalid evidence contract"));
  const unsafePath = "../private/raw/frames";
  expectFailure("unsafe evidence path traversal", () => safeRelativePath(unsafePath, "invalid artifact path"));
  return { status: "PASS", invalidContractsRejected: rejected.length, rejected };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { printHelp(); return; }
  if (options.printInputContract) { process.stdout.write(stableJson(inputContractTemplate())); return; }
  if (options.printProducerChecklist) { process.stdout.write(stableJson(producerChecklist())); return; }
  if (options.selfTestContract) { process.stdout.write(stableJson(assertContractSelfTest())); return; }
  if (options.selfTestInvalidContract) { process.stdout.write(stableJson(assertInvalidContractSelfTest())); return; }
  if (options.selfTestZip) { process.stdout.write(stableJson(await deterministicZipSelfTest())); return; }
  if (options.selfTestMediaPrivacy) {
    const report = assertMediaPrivacyScannerSelfTest();
    if (options.mediaPrivacyFixture) report.fixture = await auditMediaPrivacyFixture(options.mediaPrivacyFixture, options.ffmpeg);
    process.stdout.write(stableJson(report));
    return;
  }
  const resolved = await resolveInputContract(options);
  if (options.validateInputContract) {
    process.stdout.write(stableJson({
      schema: `${CONTRACT_SCHEMA}.validation-result`,
      status: "PASS",
      contractSha256: await sha256File(resolved.contractPath),
      repository: resolved.repository,
      derivative: publicAuthority(resolved.source.derivative),
      evidence: Object.fromEntries(EVIDENCE_KEYS.map((key) => [key, publicEvidenceAuthority(resolved.evidence[key])])),
      authorization: resolved.contract.authorization,
    }));
    return;
  }
  const packaged = await assemblePackage(resolved, options.output);
  process.stdout.write(`Phase 4-R1 refined Proving Hall v2 review package PASS: ${packaged.archivePath}\n`);
  process.stdout.write(`Archive SHA-256 ${packaged.result.archive.sha256}\n`);
}

main().catch((error) => {
  process.stderr.write(`Phase 4-R1 refined Proving Hall v2 packaging failed: ${error.stack ?? error}\n`);
  process.exitCode = 1;
});
