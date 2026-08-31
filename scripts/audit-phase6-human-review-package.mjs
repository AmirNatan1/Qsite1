#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { access, lstat, mkdir, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  validateR1MotionReport as validateCanonicalR1MotionReport,
  validateR1Node22Validation as validateCanonicalR1Node22Validation,
  validateR1PersistentLifecycle as validateCanonicalR1PersistentLifecycle,
} from "./assemble-phase6-final-evidence.mjs";
import { validateReport as validateCanonicalAccessibilityReport } from "./qa-phase6-accessibility-interactions.mjs";

const SCRIPT = fileURLToPath(import.meta.url);
export const ROOT = path.resolve(path.dirname(SCRIPT), "..");
export const PACKAGE_SCHEMA = "quantum-hub.phase-6.global-hardening-human-review.v1";
export const DETACHED_SCHEMA = `${PACKAGE_SCHEMA}.detached-manifest`;
export const AUDIT_SCHEMA = `${PACKAGE_SCHEMA}.independent-audit`;
export const IN_ARCHIVE_MANIFEST = "MANIFEST.json";
export const MAX_ARCHIVE_BYTES = 75 * 1024 * 1024;
export const REQUIRED_BRANCH = "feature/phase-6-global-hardening";
export const ACCEPTED_PHASE5B_SHA = "005a36860ecbfd6fedb3d3f2223f168c1edfbb05";
export const FROZEN_MAIN_SHA = "501040c42bba30b9d9517b88a8f9857992a2dba4";
export const REQUIRED_REPOSITORY = "AmirNatan1/Qsite1";
export const REQUIRED_REMOTE_URL = "https://github.com/AmirNatan1/Qsite1.git";
export const REQUIRED_CLOUDFLARE_PROJECT = "qsite1";
export const REQUIRED_BRANCH_URL = "https://feature-phase-6-global-harde.qsite1.pages.dev/";
export const REQUIRED_ARCHIVE_FILENAME = "phase-6-global-hardening-human-review.zip";
export const DEPLOYMENT_VERIFICATION_PATH = "00-provenance/deployment-verification.json";
export const DEPLOYMENT_VERIFICATION_SCHEMA = "quantum-hub.phase-6.deployment-verification.v1";
export const R1_PACKAGE_SCHEMA = "quantum-hub.phase-6-r1.validation-closure-human-review.v1";
export const R1_DETACHED_SCHEMA = `${R1_PACKAGE_SCHEMA}.detached-manifest`;
export const R1_AUDIT_SCHEMA = `${R1_PACKAGE_SCHEMA}.independent-audit`;
export const R1_REQUIRED_BRANCH = "repair/phase-6-r1-validation-closure";
export const R1_REQUIRED_PARENT = "aee036740b129624c54b8f1b878229f955d187ae";
export const R1_REQUIRED_BRANCH_URL = "https://repair-phase-6-r1-validation.qsite1.pages.dev/";
export const R1_REQUIRED_ARCHIVE_FILENAME = "phase-6-r1-validation-closure-human-review.zip";
export const R1_DEPLOYMENT_VERIFICATION_SCHEMA = "quantum-hub.phase-6-r1.deployment-verification.v1";
export const R1_HUMAN_EVIDENCE_SCHEMA = "quantum-hub.phase-6-r1.human-evidence-ledger.v1";
export const R1_HUMAN_LEDGER_PATH = "11-physical-device/human-evidence-ledger.json";
export const R1_REQUIRED_HUMAN_RECORDINGS = Object.freeze([
  "iphone-safari-opening.mp4",
  "iphone-safari-maradin.mp4",
  "physical-scroll-input.mp4",
  "chrome-200-percent.mp4",
]);
const R1_HUMAN_STATUSES = Object.freeze(["PASS", "FAIL", "PENDING HUMAN REVIEW"]);
const R1_DEVICE_REVIEW_CHECKS = Object.freeze({
  "iphone-safari-opening.mp4": Object.freeze(["correctDormantOpening", "firstPracticalSwipeResponse", "nativeMomentum", "stopAtPhysicalState", "reverseReconstruction", "lineRasterQ", "autonomousManifestoFade", "noF1FlashFromIntentionalHome", "orientationStability", "backgroundForeground"]),
  "iphone-safari-maradin.mp4": Object.freeze(["onePlayerLifecycle", "backgroundForeground", "retryableSourceFree", "noPersistentRafOrInterval", "noLiveOrphanBlob"]),
  "physical-scroll-input.mp4": Object.freeze(["noPositiveInputDeadZone", "nativeInertiaSovereign", "promptReversal", "noCatchUpAnimation", "freezesAtRest", "noForcedSnapping", "supportingRoutesOrdinaryFlow"]),
});
const R1_ZOOM_ROUTE_CHECKS = Object.freeze(["completeH1", "completeOpeningProposition", "readableNavigation", "usableMobileMenuWhereApplicable", "noTextClipping", "noInternalWordSplitting", "noHiddenContent", "noHorizontalOverflow", "usableControlsAndLinks", "reasonableDocumentContinuation"]);
const R1_ZOOM_ROUTES = Object.freeze(["/", "/for-partners/", "/for-startups/", "/industries/", "/pocs/", "/pocs/maradin/", "/spark/", "/about/", "/contact/", "/__phase6-intentional-404__/"]);
const EVIDENCE_ASSEMBLY_SCHEMA = "quantum-hub.phase-6.final-evidence-assembly.v1";
const EVIDENCE_ASSEMBLY_INVENTORY_PATH = "13-package/evidence-assembly-summary.json";
const R1_MOTION_EVIDENCE_SCHEMA = "quantum-hub.phase-6-r1.motion-evidence.v1";
const R1_PERSISTENT_LIFECYCLE_SCHEMA = "quantum-hub.phase-6-r1.persistent-lifecycle.v1";
const R1_MOTION_RECORDINGS = Object.freeze(["01-forward-physical-to-manifesto.mp4", "02-reverse-manifesto-to-f1.mp4", "03-stop-at-authored-states.mp4", "04-resize-orientation-mid-current-and-manifesto.mp4", "05-supporting-route-entry-and-reverse.mp4"]);
const R1_TOOLING_REPORT_FILES = Object.freeze([
  "PHASE_6_R1_VALIDATION_CLOSURE.md", "package.json", "scripts/assemble-phase6-final-evidence.mjs",
  "scripts/audit-phase6-human-review-package.mjs", "scripts/capture-phase6-r1-motion-evidence.mjs",
  "scripts/ingest-phase6-r1-human-evidence.mjs", "scripts/package-phase6-human-review.mjs",
  "scripts/qa-phase6-accessibility-interactions.mjs", "scripts/qa-phase6-r1-persistent-lifecycle.mjs",
  "scripts/verify-phase6-deployment.mjs", "scripts/verify-phase6-r1-deployment.mjs",
  "tests/phase6-accessibility-interactions.test.mjs", "tests/phase6-evidence-assembler.test.mjs",
  "tests/phase6-package-tooling.test.mjs", "tests/phase6-r1-deployment-verifier.test.mjs",
  "tests/phase6-r1-human-evidence.test.mjs", "tests/phase6-r1-motion-capture.test.mjs",
  "tests/phase6-r1-persistent-lifecycle.test.mjs",
]);
const EXPECTED_R1_CHANGED_PATH_RECORDS = Object.freeze([
  "A\tPHASE_6_R1_VALIDATION_CLOSURE.md", "M\tpackage.json", "M\tscripts/assemble-phase6-final-evidence.mjs",
  "M\tscripts/audit-phase6-human-review-package.mjs", "A\tscripts/capture-phase6-r1-motion-evidence.mjs",
  "A\tscripts/ingest-phase6-r1-human-evidence.mjs", "M\tscripts/package-phase6-human-review.mjs",
  "M\tscripts/qa-phase6-accessibility-interactions.mjs", "A\tscripts/qa-phase6-r1-persistent-lifecycle.mjs",
  "M\tscripts/verify-phase6-deployment.mjs", "A\tscripts/verify-phase6-r1-deployment.mjs",
  "M\ttests/phase6-accessibility-interactions.test.mjs", "M\ttests/phase6-evidence-assembler.test.mjs",
  "M\ttests/phase6-package-tooling.test.mjs", "A\ttests/phase6-r1-deployment-verifier.test.mjs",
  "A\ttests/phase6-r1-human-evidence.test.mjs", "A\ttests/phase6-r1-motion-capture.test.mjs",
  "A\ttests/phase6-r1-persistent-lifecycle.test.mjs",
]);
const R1_PACKAGE_SCRIPT_CHANGES = Object.freeze(["audit:phase6-r1-review", "capture:phase6-r1-motion", "check", "ingest:phase6-r1-human", "package:phase6-r1-review", "qa:phase6-r1-lifecycle", "test", "verify:phase6-r1-deployment"]);
const R1_PRODUCTION_DIFF_SCOPE = Object.freeze(["src", "public", "astro.config.mjs", "package-lock.json", ".nvmrc", "tsconfig.json", "package.json except approved R1 evidence/test scripts"]);
const R1_HTML_AUTHORITY_FILES = Object.freeze(["404.html", "about/index.html", "contact/index.html", "for-partners/index.html", "for-startups/index.html", "index.html", "industries/index.html", "pocs/index.html", "pocs/maradin/index.html", "spark/index.html"]);
const R1_PUBLIC_ROUTE_OUTCOMES = Object.freeze([
  { id: "home", relativePath: "index.html", requestPath: "/", status: 200 },
  { id: "for-industry", relativePath: "for-partners/index.html", requestPath: "/for-partners/", status: 200 },
  { id: "for-startups", relativePath: "for-startups/index.html", requestPath: "/for-startups/", status: 200 },
  { id: "industries", relativePath: "industries/index.html", requestPath: "/industries/", status: 200 },
  { id: "proof", relativePath: "pocs/index.html", requestPath: "/pocs/", status: 200 },
  { id: "maradin", relativePath: "pocs/maradin/index.html", requestPath: "/pocs/maradin/", status: 200 },
  { id: "spark", relativePath: "spark/index.html", requestPath: "/spark/", status: 200 },
  { id: "about", relativePath: "about/index.html", requestPath: "/about/", status: 200 },
  { id: "contact", relativePath: "contact/index.html", requestPath: "/contact/", status: 200 },
  { id: "404", relativePath: "404.html", requestPath: null, status: 404, real404: true },
]);
const R1_REQUIRED_HEADER_POLICIES = Object.freeze({
  "/_astro/*": "public, max-age=31556952, immutable",
  "/media/cinematic/phase-4r2/manifests/*": "public, max-age=0, must-revalidate",
  "/media/cinematic/phase-4r2/media/*": "public, max-age=31556952, immutable",
  "/media/cinematic/phase-4r2/posters/*": "public, max-age=31556952, immutable",
});
const R1_NODE22_REQUIRED_OUTCOMES = Object.freeze(["npm-ci", "astro-check", "production-build", "complete-postbuild-test-suite", "phase4-source-verification", "phase5b-phase6-r1-focused-regression", "standalone-verifier-self-tests"]);
const R1_EVIDENCE_STATUSES = new Set(["PASS", "FAIL", "LIMITATION", "NOT OBSERVED", "PENDING HUMAN REVIEW", "NOT APPLICABLE"]);
const R1_REQUIRED_ROLE_INVENTORY = Object.freeze({
  "deployment-verifier": { section: "00-provenance", kind: "document", minimum: 1, exact: 1 },
  "cross-engine-summary": { section: "02-cross-engine", kind: "document", minimum: 3, exact: 3 },
  "cross-engine-screenshot": { section: "02-cross-engine", kind: "image", minimum: 3, exact: 3 },
  "cross-engine-recording": { section: "02-cross-engine", kind: "video", minimum: 1, exact: 1 },
  "homepage-motion-summary": { section: "03-homepage-motion", kind: "document", minimum: 1, exact: 1 },
  "homepage-motion-recording": { section: "03-homepage-motion", kind: "video", minimum: 1, exact: 1 },
  "supporting-route-summary": { section: "04-supporting-routes", kind: "document", minimum: 1, exact: 1 },
  "supporting-desktop-sheet": { section: "04-supporting-routes", kind: "image", minimum: 1, exact: 1 },
  "supporting-portrait-sheet": { section: "04-supporting-routes", kind: "image", minimum: 1, exact: 1 },
  "supporting-narrow-sheet": { section: "04-supporting-routes", kind: "image", minimum: 1, exact: 1 },
  "supporting-landscape-sheet": { section: "04-supporting-routes", kind: "image", minimum: 1, exact: 1 },
  "supporting-motion-recording": { section: "04-supporting-routes", kind: "video", minimum: 1, exact: 1 },
  "history-bfcache-summary": { section: "05-history-bfcache", kind: "document", minimum: 1, exact: 1 },
  "performance-summary": { section: "06-performance", kind: "document", minimum: 1, exact: 1 },
  "memory-summary": { section: "07-memory", kind: "document", minimum: 1, exact: 1 },
  "network-media-summary": { section: "08-network-media", kind: "document", minimum: 1, exact: 1 },
  "supplemental-maradin-lifecycle-recording": { section: "08-network-media", kind: "video", minimum: 1, exact: 1 },
  "accessibility-summary": { section: "09-accessibility", kind: "document", minimum: 3, exact: 3 },
  "regression-summary": { section: "12-regression", kind: "document", minimum: 1, exact: 1 },
  "r1-motion-summary": { section: "03-homepage-motion", kind: "document", minimum: 2, exact: 2 },
  "r1-motion-recording": { section: "03-homepage-motion", kind: "video", minimum: 10, exact: 10 },
  "r1-persistent-lifecycle-summary": { section: "05-history-bfcache", kind: "document", minimum: 1, exact: 1 },
  "r1-node22-validation-summary": { section: "00-provenance", kind: "document", minimum: 1, exact: 1 },
  "accessibility-interaction-limitation": { section: "09-accessibility", kind: "document", minimum: 1, exact: 1 },
  "supplemental-reflow-proxy": { section: "09-accessibility", kind: "document", minimum: 1, exact: 1 },
  "physical-device-result": { section: "11-physical-device", kind: "document", minimum: 1, exact: 1 },
  "physical-device-recording": { section: "11-physical-device", kind: "video", minimum: 4, exact: 4 },
  "poster-study-summary": { section: "10-poster-study", kind: "document", minimum: 1, exact: 1 },
  "poster-side-by-side": { section: "10-poster-study", kind: "image", minimum: 3, exact: 3 },
  "poster-difference": { section: "10-poster-study", kind: "image", minimum: 3, exact: 3 },
});

const R1_EXACT_ASSEMBLER_PATH_ROLES = new Map([
  ["00-provenance/deployment-verification.json", "deployment-verifier"],
  ...["repository-authority.json", "checkpoint-chain.json", "production-source-diff.txt", "change-ledger.json", "deployment-authority-summary.json", "dist-deployment-parity.json", "final-build-test.json", "final-limitations.md", "final-handoff-seed.json"].map((name) => [`00-provenance/${name}`, "generated-authority"]),
  ["00-provenance/node22-integrated-validation.json", "r1-node22-validation-summary"],
  ...["accepted-phase5b-reference-hashes.json", "initial-browser-runtime-inventory.json"].map((name) => [`01-baseline/${name}`, "generated-authority"]),
  ...["chromium", "webkit", "firefox"].map((engine) => [`02-cross-engine/global-${engine}.json`, "cross-engine-summary"]),
  ...["chromium", "webkit", "firefox"].map((engine) => [`02-cross-engine/screenshots/home-${engine}.png`, "cross-engine-screenshot"]),
  ["02-cross-engine/recordings/home-forward-reverse-stop.mp4", "cross-engine-recording"], ["03-homepage-motion/homepage.json", "homepage-motion-summary"],
  ["03-homepage-motion/home-entry-manifesto-history.mp4", "homepage-motion-recording"],
  ...["chromium", "firefox"].flatMap((engine) => [[`03-homepage-motion/r1/${engine}/motion-evidence-report.json`, "r1-motion-summary"], ...R1_MOTION_RECORDINGS.map((filename) => [`03-homepage-motion/r1/${engine}/${filename}`, "r1-motion-recording"])]),
  ["04-supporting-routes/supporting.json", "supporting-route-summary"],
  ...[["desktop", "supporting-desktop-sheet"], ["portrait", "supporting-portrait-sheet"], ["narrow", "supporting-narrow-sheet"], ["landscape", "supporting-landscape-sheet"]].map(([name, role]) => [`04-supporting-routes/contact-sheets/${name}.png`, role]),
  ["04-supporting-routes/supporting-signature-motion.mp4", "supporting-motion-recording"], ["05-history-bfcache/history.json", "history-bfcache-summary"],
  ["05-history-bfcache/r1-persistent-lifecycle.json", "r1-persistent-lifecycle-summary"], ["06-performance/performance.json", "performance-summary"],
  ["07-memory/lifecycle.json", "memory-summary"], ["08-network-media/network.json", "network-media-summary"],
  ["08-network-media/maradin-media-lifecycle.mp4", "supplemental-maradin-lifecycle-recording"],
  ...["chromium", "webkit", "firefox"].map((engine) => [`09-accessibility/accessibility-${engine}.json`, "accessibility-summary"]),
  ["09-accessibility/accessibility-webkit-interaction-limitation.json", "accessibility-interaction-limitation"], ["09-accessibility/720x450-reflow-proxy.json", "supplemental-reflow-proxy"],
  ["10-poster-study/poster-request-decode-summary.json", "poster-study-summary"],
  ...["desktop", "portrait", "landscape"].map((family) => [`10-poster-study/comparisons/${family}-original-lossless-lossy.png`, "poster-side-by-side"]),
  ...["desktop", "portrait", "landscape"].map((family) => [`10-poster-study/differences/${family}-lossy-q95-difference-x32.png`, "poster-difference"]),
  [R1_HUMAN_LEDGER_PATH, "physical-device-result"], ...R1_REQUIRED_HUMAN_RECORDINGS.map((filename) => [`11-physical-device/recordings/${filename}`, "physical-device-recording"]),
  ["12-regression/repair-regressions.json", "regression-summary"],
  ...["00-provenance", "01-baseline", "02-cross-engine", "03-homepage-motion", "04-supporting-routes", "05-history-bfcache", "06-performance", "07-memory", "08-network-media", "09-accessibility", "10-poster-study", "11-physical-device", "12-regression", "13-package"].map((section) => [`${section}/section-summary.json`, "generated"]),
]);

export const TOPOLOGY_SECTIONS = Object.freeze([
  "00-provenance",
  "01-baseline",
  "02-cross-engine",
  "03-homepage-motion",
  "04-supporting-routes",
  "05-history-bfcache",
  "06-performance",
  "07-memory",
  "08-network-media",
  "09-accessibility",
  "10-poster-study",
  "11-physical-device",
  "12-regression",
  "13-package",
]);
const R1_BRIEF_REQUIREMENTS = Object.freeze({
  "00-provenance": Object.freeze(["Git provenance", "branch ancestry", "main verification", "commit chain", "clean-tree proof", "deployment verification", "dist/deployment parity", "production-source diff"]),
  "01-baseline": Object.freeze(["PHASE_6_BASELINE.md", "PHASE_6_DEFECT_LEDGER.md", "accepted Phase 5B reference hashes", "initial browser/runtime inventory"]),
  "02-cross-engine": Object.freeze(["browser versions", "Chromium matrix", "WebKit matrix", "Firefox matrix", "engine-specific findings", "representative cross-engine screenshots", "representative recordings"]),
  "03-homepage-motion": Object.freeze(["fresh forward", "reverse", "fast skip", "stop-at-state", "manifesto autonomous fade", "Home /#entry", "no-F1 proof", "resize/orientation", "hidden/visible behavior"]),
  "04-supporting-routes": Object.freeze(["cross-route desktop sheet", "cross-route portrait sheet", "cross-route 320px sheet", "cross-route 844×390 sheet", "signature motion recordings", "route-specific runtime reports"]),
  "05-history-bfcache": Object.freeze(["direct /", "direct /#entry", "Back/Forward", "BFCache", "pageshow/pagehide", "refresh", "hash navigation", "mobile-menu history", "state-restoration report"]),
  "06-performance": Object.freeze(["cold/warm runs", "median/p95/max", "long-task attribution", "CPU-throttle stress", "RAF/interval report", "layout/paint report", "route budgets", "request totals", "CLS"]),
  "07-memory": Object.freeze(["repeated-cycle results", "DOM counters", "listener/observer audit", "Blob/object URL audit", "decoder audit", "media teardown", "bounded-growth conclusion"]),
  "08-network-media": Object.freeze(["normal request inventories", "slow-network tests", "blocked/failing media", "offline tests", "homepage request isolation", "supporting-route isolation", "Maradin lifecycle", "decoder behavior"]),
  "09-accessibility": Object.freeze(["axe", "keyboard", "focus", "mobile menu", "reduced motion", "no JS", "200%", "fallback fonts", "heading/landmark inventory", "target-size evidence"]),
  "10-poster-study": Object.freeze(["original inventory", "candidate inventory", "side-by-side comparison", "difference images", "byte/decode comparison", "final retain/replace decision", "resulting production hashes if changed"]),
  "11-physical-device": Object.freeze(["real-device results if genuinely performed", "otherwise PHASE_6_PHYSICAL_DEVICE_HANDOFF.md", "no false machine PASS"]),
  "12-regression": Object.freeze(["Phase 4 media hashes", "exact Q", "Phase 5B manifesto", "R1 About hash", "all supporting-route source hashes", "publication boundaries", "homepage Operating Field", "no route-content drift"]),
  "13-package": Object.freeze(["package README", "canonical file inventory", "embedded manifest", "independent audit", "all payload hashes", "all payload sizes", "CRC result", "privacy/secrets scan", "duplicate-path scan"]),
});

export const REPORT_SPECS = Object.freeze([
  Object.freeze({ source: "PHASE_6_BASELINE.md", archive: "01-baseline/PHASE_6_BASELINE.md" }),
  Object.freeze({ source: "PHASE_6_DEFECT_LEDGER.md", archive: "01-baseline/PHASE_6_DEFECT_LEDGER.md" }),
  Object.freeze({ source: "PHASE_6_POSTER_STUDY.md", archive: "10-poster-study/PHASE_6_POSTER_STUDY.md" }),
  Object.freeze({ source: "PHASE_6_PHYSICAL_DEVICE_HANDOFF.md", archive: "11-physical-device/PHASE_6_PHYSICAL_DEVICE_HANDOFF.md" }),
]);
export const R1_CLOSURE_REPORT_SPEC = Object.freeze({ source: "PHASE_6_R1_VALIDATION_CLOSURE.md", archive: "01-baseline/PHASE_6_R1_VALIDATION_CLOSURE.md" });
function reportSpecsForProfile(profile) {
  return profile.id === "phase6-r1" ? [...REPORT_SPECS, R1_CLOSURE_REPORT_SPEC] : [...REPORT_SPECS];
}

export const HUMAN_REVIEW_GATES = Object.freeze({
  "NATIVE-SCROLL + MOTION INTEGRITY": "PENDING HUMAN REVIEW",
  "CROSS-ENGINE + HISTORY RESILIENCE": "PENDING HUMAN REVIEW",
  "PERFORMANCE + MEMORY SAFETY": "PENDING HUMAN REVIEW",
  "ACCESSIBILITY + FALLBACK RESILIENCE": "PENDING HUMAN REVIEW",
  "MEDIA + NETWORK ISOLATION": "PENDING HUMAN REVIEW",
  "VISUAL + PUBLICATION REGRESSION": "PENDING HUMAN REVIEW",
});

export const AUTHORIZATION = Object.freeze({
  machinePassGrantsHumanAcceptance: false,
  humanAccepted: false,
  phase6Complete: false,
  phase7Authorized: false,
  mainMerged: false,
});

const LEGACY_DEPLOYMENT_CHECKS = Object.freeze({
  exactGitBranchMainAuthority: true,
  signedSuccessfulDeploymentBindsExactHead: true,
  allDeployableFilesComparedWhereCloudflarePermits: true,
  branchImmutableLocalByteParity: true,
  successfulHttpOutcomes: true,
  real404StatusAndByteParity: true,
  requiredHeadersAndCachePolicies: true,
  canonicalBehavior: true,
  productionMainUnchangedAndPhase6Unmerged: true,
});

const R1_DEPLOYMENT_CHECKS = Object.freeze({
  exactR1BranchParentAndFrozenMain: true,
  zeroProductionSourceDiff: true,
  signedSuccessfulDeploymentBindsExactHead: true,
  immutableLocalByteParity: true,
  branchLocalByteParity: true,
  real404HeadersCanonicalAndTenRoutes: true,
});

const AUTHORITY_PROFILES = Object.freeze({
  phase6: Object.freeze({
    id: "phase6",
    packageSchema: PACKAGE_SCHEMA,
    detachedSchema: DETACHED_SCHEMA,
    auditSchema: AUDIT_SCHEMA,
    branch: REQUIRED_BRANCH,
    parent: ACCEPTED_PHASE5B_SHA,
    parentField: "acceptedBase",
    ancestorField: "acceptedBaseAncestor",
    branchUrl: REQUIRED_BRANCH_URL,
    archiveFilename: REQUIRED_ARCHIVE_FILENAME,
    deploymentSchema: DEPLOYMENT_VERIFICATION_SCHEMA,
    deploymentChecks: LEGACY_DEPLOYMENT_CHECKS,
    title: "Phase 6 global-hardening",
  }),
  "phase6-r1": Object.freeze({
    id: "phase6-r1",
    packageSchema: R1_PACKAGE_SCHEMA,
    detachedSchema: R1_DETACHED_SCHEMA,
    auditSchema: R1_AUDIT_SCHEMA,
    branch: R1_REQUIRED_BRANCH,
    parent: R1_REQUIRED_PARENT,
    parentField: "exactParent",
    ancestorField: "exactParentAncestor",
    branchUrl: R1_REQUIRED_BRANCH_URL,
    archiveFilename: R1_REQUIRED_ARCHIVE_FILENAME,
    deploymentSchema: R1_DEPLOYMENT_VERIFICATION_SCHEMA,
    deploymentChecks: R1_DEPLOYMENT_CHECKS,
    title: "Phase 6-R1 validation closure",
  }),
});

export function authorityProfileById(id = "phase6") {
  const profile = AUTHORITY_PROFILES[id];
  if (!profile) throw new Error(`--authority-profile must be phase6 or phase6-r1, received ${id ?? "missing"}`);
  return profile;
}

const HASH40 = /^[0-9a-f]{40}$/;
const HASH64 = /^[0-9a-f]{64}$/;
const CLOUDFLARE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ALLOWED_EXTENSIONS = new Set([".json", ".md", ".txt", ".csv", ".png", ".jpg", ".jpeg", ".webp", ".avif", ".mp4"]);
const TEXT_EXTENSIONS = new Set([".json", ".md", ".txt", ".csv"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif"]);
const VIDEO_EXTENSIONS = new Set([".mp4"]);
const FORBIDDEN_ENTRY = /(?:^|\/)(?:raw(?:[-_ ]?frames?)?|frames?|caches?|browser-cache|traces?|heap-dumps?|profiles?|private|secrets?|credentials?|candidates?|rejected|quarantine|temp|tmp|__pycache__|node_modules|\.git)(?:\/|$)|(?:^|\/)\.(?:env|ds_store)(?:\.|$)|\.(?:zip|7z|rar|tar|tgz|gz|bz2|xz|webm|blend\d*|exr|tiff?|mov|mkv|avi|heapsnapshot|trace|pem|key|p12|pfx|log|map)$/i;
const PRIVATE_OR_SECRET_TEXT = /(?:(?:^|[\s"'=:(`\[])[a-z]:[\\/]|(?:^|[\s"'=:(`\[])\/(?:users|home|tmp|private|var\/folders)\/[^/\s]+(?:\/|\b)|(?:^|[^a-z])onedrive(?:[^a-z]|$)|appdata|localcache|(?:^|[\\/])\.codex(?:[\\/]|$)|file:\/\/|\\\\[^\\\s]+[\\][^\\\s]+|github_pat_[a-z0-9_]+|gh[opusr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:password|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|bearer)\s*[:=]\s*["']?(?:bearer\s+)?[a-z0-9_./+:-]{12,})/i;

const CRC32_TABLE = Object.freeze(Array.from({ length: 256 }, (_unused, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
}));

function lexicalCompare(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    return Object.fromEntries(Object.keys(value).sort(lexicalCompare).map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function stableJson(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

function exactJson(actual, expected, label) {
  if (stableJson(actual) !== stableJson(expected)) throw new Error(`${label} differs`);
}

function assertR1DeploymentStatusClosure(value, label, location = "report") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertR1DeploymentStatusClosure(item, label, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const childLocation = `${location}.${key}`;
    if (key === "status" && typeof child === "string" && child !== "PASS") throw new Error(`${label} contains a non-PASS string status at ${childLocation}`);
    assertR1DeploymentStatusClosure(child, label, childLocation);
  }
}

export function safeRelativePath(value, label = "path") {
  if (typeof value !== "string" || !value || value.includes("\\") || value.includes("\0") || path.posix.isAbsolute(value)) {
    throw new Error(`${label} must be a portable relative path`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === "." || normalized.startsWith("../") || value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`${label} is unsafe: ${value}`);
  }
  return value;
}

function auditDeploymentPublicPath(relativePath, missing404Path = "/__phase6-real-404-probe__/") {
  if (relativePath === "_headers") return null;
  if (relativePath === "404.html") return missing404Path;
  if (relativePath === "index.html") return "/";
  if (relativePath.endsWith("/index.html")) return `/${relativePath.slice(0, -"index.html".length)}`;
  return `/${relativePath}`;
}

function auditDeploymentCanonical(relativePath) {
  if (relativePath === "404.html") return { canonical: null, robotsNoindex: true, status: "PASS" };
  const canonical = relativePath === "index.html"
    ? "https://qsite1.pages.dev/"
    : `https://qsite1.pages.dev/${relativePath.slice(0, -"index.html".length)}`;
  return { canonical, robotsNoindex: false, status: "PASS" };
}

function auditDeploymentMimeTypes(relativePath) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  return ({
    ".avif": ["image/avif"], ".css": ["text/css"], ".html": ["text/html"], ".ico": ["image/x-icon", "image/vnd.microsoft.icon"],
    ".jpeg": ["image/jpeg"], ".jpg": ["image/jpeg"], ".js": ["application/javascript", "text/javascript", "application/x-javascript"], ".json": ["application/json"],
    ".mjs": ["application/javascript", "text/javascript", "application/x-javascript"],
    ".mp4": ["video/mp4"], ".pdf": ["application/pdf"], ".png": ["image/png"], ".svg": ["image/svg+xml"], ".txt": ["text/plain"],
    ".wasm": ["application/wasm"], ".webm": ["video/webm"], ".webp": ["image/webp"],
    ".woff": ["font/woff", "application/font-woff"], ".woff2": ["font/woff2", "application/font-woff2"], ".xml": ["application/xml", "text/xml"],
  })[extension] ?? [];
}

function auditHeaderPatternMatches(pattern, publicPath) {
  const expression = `^${pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`;
  return new RegExp(expression).test(publicPath);
}

function auditStrictCacheControlDirectives(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} Cache-Control must be a primitive nonempty string`);
  const byName = new Map();
  for (const directive of value.toLowerCase().split(",").map((part) => part.trim()).filter(Boolean)) {
    const match = /^([a-z][a-z0-9-]*)(?:=(?:"[^"]*"|[^\s,]+))?$/.exec(directive);
    if (!match || byName.has(match[1])) throw new Error(`${label} Cache-Control contains an invalid, duplicate, or conflicting directive`);
    byName.set(match[1], directive);
  }
  if (!byName.size) throw new Error(`${label} Cache-Control contains no directives`);
  return byName;
}

function auditUrlPathAuthority(value, label) {
  if (typeof value !== "string" || !value.startsWith("/") || /[%#?\\]/.test(value)) throw new Error(`${label} is not an exact URL pathname`);
  const parsed = new URL(value, "https://phase6.invalid/");
  if (parsed.pathname !== value || parsed.search || parsed.hash) throw new Error(`${label} does not round-trip as an exact URL pathname`);
  return value;
}

function auditDeploymentTimestamp(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be an exact UTC ISO timestamp`);
  }
  const canonical = new Date(value).toISOString();
  if (value !== canonical && value !== canonical.replace(/\.000Z$/, "Z")) throw new Error(`${label} must be an exact UTC ISO timestamp`);
  return value;
}

function auditR1RawDeploymentAuthority(document, expected, label) {
  assertR1DeploymentStatusClosure(document, label);
  const signed = document.deployment?.data;
  if (!signed || signed.status !== "PASS" || signed.authoritySource !== "CLOUDFLARE_PAGES_SIGNED_GITHUB_CHECK"
    || signed.appSlug !== "cloudflare-workers-and-pages" || !/^[1-9]\d*$/.test(signed.checkRunId ?? "")
    || signed.checkRunId !== expected.deploymentCheckRunId || signed.deploymentId !== expected.deploymentId
    || signed.immutableUrl !== expected.immutableUrl || signed.branchUrl !== expected.branchUrl
    || signed.branch !== R1_REQUIRED_BRANCH || signed.commitHash !== expected.expectedHead || signed.environment !== "preview"
    || typeof signed.completedAt !== "string" || !Number.isFinite(Date.parse(signed.completedAt))) {
    throw new Error(`${label} signed deployment/check-run authority differs`);
  }
  auditDeploymentTimestamp(signed.completedAt, `${label} completedAt`);
  exactJson(signed.branchBinding, { status: "PASS", source: "SIGNED_CHECK_EXACT_BRANCH_ALIAS", branch: R1_REQUIRED_BRANCH, branchUrl: R1_REQUIRED_BRANCH_URL }, `${label} branch binding`);

  const dist = document.dist;
  if (!dist || dist.status !== "PASS" || !Array.isArray(dist.files) || !dist.files.length) throw new Error(`${label} raw dist inventory is missing`);
  exactJson(dist.routeOutcomes, R1_PUBLIC_ROUTE_OUTCOMES, `${label} route outcomes`);
  exactJson(dist.exactHtmlAuthority, R1_HTML_AUTHORITY_FILES, `${label} HTML authority inventory`);
  exactJson(dist.requiredHeaderPolicies, R1_REQUIRED_HEADER_POLICIES, `${label} header policies`);
  const byPath = new Map();
  const requestPaths = new Set();
  let previous = null;
  let totalBytes = 0;
  for (const record of dist.files) {
    const relativePath = record?.relativePath;
    safeRelativePath(relativePath, `${label} raw dist path`);
    if (/[%#?]/.test(relativePath)) throw new Error(`${label} raw dist path is URL-reinterpretable`);
    if ((previous !== null && previous.localeCompare(relativePath) >= 0) || byPath.has(relativePath)
      || /\.(?:map|zip|key|pem|env)$/i.test(relativePath) || /(?:^|\/)(?:node_modules|src|source|cache|\.cache|\.git|artifacts)(?:\/|$)/i.test(relativePath)
      || !Number.isSafeInteger(record.bytes) || record.bytes <= 0 || !HASH64.test(record.sha256 ?? "")) {
      throw new Error(`${label} raw dist inventory is unsafe, duplicate or unsorted`);
    }
    const requestPath = auditDeploymentPublicPath(relativePath);
    if (record.requestPath !== requestPath || record.deploymentComparison !== (relativePath === "_headers" ? "EXCLUDED_CLOUDFLARE_CONFIGURATION" : "REQUIRED")) {
      throw new Error(`${label} raw dist request/comparison authority differs: ${relativePath}`);
    }
    if (requestPath !== null) {
      auditUrlPathAuthority(requestPath, `${label} raw dist request path`);
      if (requestPaths.has(requestPath)) throw new Error(`${label} raw dist request paths are not unique`);
      requestPaths.add(requestPath);
    }
    previous = relativePath;
    totalBytes += record.bytes;
    if (!Number.isSafeInteger(totalBytes)) throw new Error(`${label} raw dist byte total differs`);
    byPath.set(relativePath, record);
  }
  const paths = [...byPath.keys()];
  const htmlPaths = paths.filter((relativePath) => relativePath.endsWith(".html"));
  if (stableJson(htmlPaths) !== stableJson(R1_HTML_AUTHORITY_FILES) || paths.includes("_redirects")
    || !["_headers", "robots.txt", "sitemap.xml"].every((relativePath) => byPath.has(relativePath))
    || !["_astro/", "media/cinematic/phase-4r2/manifests/", "media/cinematic/phase-4r2/media/", "media/cinematic/phase-4r2/posters/"].every((prefix) => paths.some((relativePath) => relativePath.startsWith(prefix)))) {
    throw new Error(`${label} raw dist required topology differs`);
  }
  exactJson(dist.canonicalAuthority, Object.fromEntries(R1_HTML_AUTHORITY_FILES.map((relativePath) => [relativePath, auditDeploymentCanonical(relativePath)])), `${label} canonical authority`);
  const comparable = paths.filter((relativePath) => relativePath !== "_headers");
  exactJson(dist.totals, { files: paths.length, comparableFiles: comparable.length, bytes: totalBytes }, `${label} dist totals`);

  const auditOrigin = (stage, expectedOrigin, originLabel) => {
    const data = stage?.data;
    if (stage?.status !== "PASS" || data?.status !== "PASS" || data.origin !== expectedOrigin || !Array.isArray(data.responses)
      || data.responses.length !== comparable.length || data.fileCount !== comparable.length) throw new Error(`${label} ${originLabel} origin inventory differs`);
    const missing404Path = `/__phase6-real-404-${expected.expectedHead.slice(0, 12)}-${expected.deploymentId.slice(0, 8)}/`;
    exactJson(data.real404, { publicPath: missing404Path, httpStatus: 404, localAuthority: "404.html", byteParity: true }, `${label} ${originLabel} real 404`);
    let originBytes = 0;
    const exercisedPolicies = new Set();
    const observedPublicPaths = new Set();
    for (let index = 0; index < comparable.length; index += 1) {
      const relativePath = comparable[index];
      const local = byPath.get(relativePath);
      const response = data.responses[index];
      const expectedStatus = relativePath === "404.html" ? 404 : 200;
      const publicPath = auditDeploymentPublicPath(relativePath, missing404Path);
      auditUrlPathAuthority(publicPath, `${label} ${originLabel} public path`);
      if (observedPublicPaths.has(publicPath)) throw new Error(`${label} ${originLabel} public paths are not unique`);
      observedPublicPaths.add(publicPath);
      if (response?.relativePath !== relativePath || response.publicPath !== publicPath || response.status !== "PASS"
        || response.expectedHttpStatus !== expectedStatus || response.actualHttpStatus !== expectedStatus
        || response.bytes !== local.bytes || response.sha256 !== local.sha256) {
        throw new Error(`${label} ${originLabel} response/local byte and HTTP parity differs: ${relativePath}`);
      }
      const canonical = relativePath.endsWith(".html") ? dist.canonicalAuthority[relativePath] : null;
      if (stableJson(response.canonical) !== stableJson(canonical)) throw new Error(`${label} ${originLabel} response canonical authority differs: ${relativePath}`);
      const headers = response.headers;
      const matchedPolicies = Object.keys(R1_REQUIRED_HEADER_POLICIES).filter((pattern) => auditHeaderPatternMatches(pattern, publicPath));
      const mimeTypes = auditDeploymentMimeTypes(relativePath);
      const contentType = typeof headers?.contentType === "string" ? headers.contentType.split(";", 1)[0].trim().toLowerCase() : "";
      const cache = headers?.cacheControl;
      if (headers?.status !== "PASS" || typeof headers.contentType !== "string" || !headers.contentType.trim()
        || typeof headers.cacheControl !== "string" || !headers.cacheControl.trim() || stableJson(headers.matchedPolicies) !== stableJson(matchedPolicies)
        || !mimeTypes.includes(contentType)) {
        throw new Error(`${label} ${originLabel} response header authority differs: ${relativePath}`);
      }
      const actualDirectives = auditStrictCacheControlDirectives(cache, `${label} ${originLabel} ${relativePath}`);
      if (actualDirectives.has("private") || (actualDirectives.has("no-store") && relativePath !== "404.html")) throw new Error(`${label} ${originLabel} response header authority differs: ${relativePath}`);
      for (const pattern of matchedPolicies) {
        exercisedPolicies.add(pattern);
        const required = auditStrictCacheControlDirectives(R1_REQUIRED_HEADER_POLICIES[pattern], `${label} required ${pattern}`);
        if (stableJson([...actualDirectives.entries()].sort(([left], [right]) => lexicalCompare(left, right))) !== stableJson([...required.entries()].sort(([left], [right]) => lexicalCompare(left, right)))) {
          throw new Error(`${label} ${originLabel} response cache policy differs: ${relativePath}`);
        }
      }
      originBytes += response.bytes;
    }
    if (data.totalBytes !== originBytes || stableJson([...exercisedPolicies].sort(lexicalCompare)) !== stableJson(Object.keys(R1_REQUIRED_HEADER_POLICIES).sort(lexicalCompare))) {
      throw new Error(`${label} ${originLabel} response byte total/header-policy coverage differs`);
    }
  };
  auditOrigin(document.origins?.immutable, expected.immutableUrl, "immutable");
  auditOrigin(document.origins?.branch, expected.branchUrl, "branch");
}

function sectionFor(relativePath) {
  safeRelativePath(relativePath, "package entry");
  return relativePath.split("/", 1)[0];
}

export function assertAllowedEntry(relativePath) {
  safeRelativePath(relativePath, "package entry");
  if (relativePath === IN_ARCHIVE_MANIFEST) return true;
  if (FORBIDDEN_ENTRY.test(relativePath)) throw new Error(`forbidden raw/cache/archive/private payload: ${relativePath}`);
  if (!TOPOLOGY_SECTIONS.includes(sectionFor(relativePath))) throw new Error(`entry is outside the Phase 6 review topology: ${relativePath}`);
  if (!ALLOWED_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase())) throw new Error(`unsupported review payload: ${relativePath}`);
  return true;
}

function semanticJsonText(value) {
  const values = [];
  const visit = (node, key = "") => {
    if (typeof node === "string") {
      values.push(node);
      if (key) values.push(`${key}: ${node}`);
    } else if (Array.isArray(node)) node.forEach((item) => visit(item, key));
    else if (node && typeof node === "object") Object.entries(node).forEach(([childKey, item]) => visit(item, childKey));
    else if (key && node !== null && node !== undefined) values.push(`${key}: ${node}`);
  };
  visit(value);
  return values.join("\n");
}

export function assertNoPrivateText(bytes, relativePath) {
  if (PRIVATE_OR_SECRET_TEXT.test(relativePath)) throw new Error(`privacy/secrets scan failed in path: ${relativePath}`);
  const extension = path.posix.extname(relativePath).toLowerCase();
  const data = Buffer.from(bytes);
  const isText = relativePath === IN_ARCHIVE_MANIFEST || TEXT_EXTENSIONS.has(extension);
  const text = isText ? data.toString("utf8") : (data.toString("latin1").match(/[\x20-\x7e]{24,}/g) ?? []).join("\n");
  if (PRIVATE_OR_SECRET_TEXT.test(text)) throw new Error(`privacy/secrets scan failed in payload: ${relativePath}`);
  if (extension === ".json" || relativePath === IN_ARCHIVE_MANIFEST) {
    let document;
    try { document = JSON.parse(text); } catch { throw new Error(`invalid JSON payload: ${relativePath}`); }
    if (PRIVATE_OR_SECRET_TEXT.test(semanticJsonText(document))) throw new Error(`privacy/secrets semantic scan failed: ${relativePath}`);
  } else if (TEXT_EXTENSIONS.has(extension) && text.includes("\u0000")) throw new Error(`text payload contains NUL bytes: ${relativePath}`);
  return true;
}

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function rebuildStoredZip(entries) {
  const normalized = [...entries.entries()]
    .map(([entryPath, data]) => ({ path: entryPath, data: Buffer.from(data) }))
    .sort((left, right) => lexicalCompare(left.path, right.path));
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const date = (1 << 5) | 1;
  for (const entry of normalized) {
    const name = Buffer.from(entry.path, "utf8");
    const checksum = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, entry.data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + entry.data.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(normalized.length, 8);
  end.writeUInt16LE(normalized.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

export function parseStoredZip(input, maximumBytes = MAX_ARCHIVE_BYTES) {
  const bytes = Buffer.from(input);
  if (bytes.length < 22 || bytes.length > maximumBytes) throw new Error("ZIP size boundary failed");
  const endOffset = bytes.length - 22;
  if (bytes.readUInt32LE(endOffset) !== 0x06054b50 || bytes.readUInt16LE(endOffset + 20) !== 0) throw new Error("canonical EOCD missing or commented");
  const disk = bytes.readUInt16LE(endOffset + 4);
  const centralDisk = bytes.readUInt16LE(endOffset + 6);
  const diskEntries = bytes.readUInt16LE(endOffset + 8);
  const entriesCount = bytes.readUInt16LE(endOffset + 10);
  const centralSize = bytes.readUInt32LE(endOffset + 12);
  const centralOffset = bytes.readUInt32LE(endOffset + 16);
  if (!entriesCount || disk || centralDisk || diskEntries !== entriesCount || centralOffset + centralSize !== endOffset) throw new Error("multi-disk or malformed central directory");
  const entries = new Map();
  let cursor = centralOffset;
  let expectedLocalOffset = 0;
  let previous = null;
  for (let index = 0; index < entriesCount; index += 1) {
    if (cursor + 46 > endOffset || bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error("central directory entry missing");
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const time = bytes.readUInt16LE(cursor + 12);
    const date = bytes.readUInt16LE(cursor + 14);
    const checksum = bytes.readUInt32LE(cursor + 16);
    const compressed = bytes.readUInt32LE(cursor + 20);
    const size = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const startDisk = bytes.readUInt16LE(cursor + 34);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    if (!nameLength || flags !== 0x0800 || method !== 0 || time !== 0 || date !== ((1 << 5) | 1) || compressed !== size || extraLength || commentLength || startDisk) throw new Error("ZIP entry is not canonical stored UTF-8");
    const nameEnd = cursor + 46 + nameLength;
    if (nameEnd > endOffset) throw new Error("central filename is truncated");
    const entryPath = bytes.subarray(cursor + 46, nameEnd).toString("utf8");
    safeRelativePath(entryPath, "ZIP entry");
    assertAllowedEntry(entryPath);
    if (entries.has(entryPath) || (previous !== null && lexicalCompare(previous, entryPath) >= 0)) throw new Error("ZIP paths are duplicate or not canonical lexical order");
    if (localOffset !== expectedLocalOffset || localOffset + 30 > centralOffset || bytes.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("local entry offset differs");
    const localFlags = bytes.readUInt16LE(localOffset + 6);
    const localMethod = bytes.readUInt16LE(localOffset + 8);
    const localTime = bytes.readUInt16LE(localOffset + 10);
    const localDate = bytes.readUInt16LE(localOffset + 12);
    const localCrc = bytes.readUInt32LE(localOffset + 14);
    const localCompressed = bytes.readUInt32LE(localOffset + 18);
    const localSize = bytes.readUInt32LE(localOffset + 22);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    if (localFlags !== flags || localMethod !== method || localTime !== time || localDate !== date || localCrc !== checksum || localCompressed !== compressed || localSize !== size || localNameLength !== nameLength || localExtraLength) throw new Error("local and central ZIP metadata differ");
    const localNameEnd = localOffset + 30 + localNameLength;
    if (localNameEnd > centralOffset) throw new Error("local filename is truncated");
    const localName = bytes.subarray(localOffset + 30, localNameEnd).toString("utf8");
    if (localName !== entryPath) throw new Error("local and central ZIP paths differ");
    const dataEnd = localNameEnd + size;
    if (dataEnd > centralOffset) throw new Error("ZIP payload is truncated");
    const data = bytes.subarray(localNameEnd, dataEnd);
    if (crc32(data) !== checksum) throw new Error(`CRC rejection for ${entryPath}`);
    entries.set(entryPath, Buffer.from(data));
    previous = entryPath;
    expectedLocalOffset = dataEnd;
    cursor = nameEnd;
  }
  if (cursor !== endOffset || expectedLocalOffset !== centralOffset) throw new Error("ZIP directory/local surfaces are not contiguous");
  if (!rebuildStoredZip(entries).equals(bytes)) throw new Error("ZIP is not the unique canonical stored encoding");
  return { entries, canonical: true, crcValidated: true };
}

function parseJson(bytes, label) {
  try { return JSON.parse(Buffer.from(bytes).toString("utf8")); }
  catch { throw new Error(`invalid JSON payload: ${label}`); }
}

function auditIsoBoxes(bytes, start, end, label) {
  const boxes = [];
  let offset = start;
  while (offset < end) {
    if (end - offset < 8) throw new Error(`MP4 container structure differs (${label}: truncated box header)`);
    let size = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    let header = 8;
    if (size === 1) {
      if (end - offset < 16) throw new Error(`MP4 container structure differs (${label}: truncated extended box)`);
      const extended = bytes.readBigUInt64BE(offset + 8);
      if (extended > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`MP4 container structure differs (${label}: unsafe box size)`);
      size = Number(extended);
      header = 16;
    } else if (size === 0) size = end - offset;
    if (size < header || offset + size > end) throw new Error(`MP4 container structure differs (${label}: invalid ${type || "unknown"} box size)`);
    boxes.push({ type, end: offset + size, payloadStart: offset + header, payloadSize: size - header });
    offset += size;
  }
  return boxes;
}

export function validateIsoBmffMp4(input, label = "recording") {
  const bytes = Buffer.from(input);
  const top = auditIsoBoxes(bytes, 0, bytes.length, label);
  const ftyp = top.find(({ type }) => type === "ftyp");
  const moov = top.find(({ type }) => type === "moov");
  const mdats = top.filter(({ type }) => type === "mdat");
  if (!ftyp || ftyp !== top[0] || ftyp.payloadSize < 8 || !moov || !mdats.some(({ payloadSize }) => payloadSize > 0)) throw new Error(`MP4 container structure differs (${label}: ftyp/moov/mdat authority)`);
  const children = (box) => auditIsoBoxes(bytes, box.payloadStart, box.end, label);
  const movieHeader = children(moov).find(({ type }) => type === "mvhd");
  if (!movieHeader) throw new Error(`MP4 container structure differs (${label}: missing mvhd)`);
  const movieVersion = bytes[movieHeader.payloadStart];
  let movieTimescale;
  let movieDuration;
  if (movieVersion === 0 && movieHeader.payloadSize >= 20) {
    movieTimescale = bytes.readUInt32BE(movieHeader.payloadStart + 12);
    movieDuration = BigInt(bytes.readUInt32BE(movieHeader.payloadStart + 16));
  } else if (movieVersion === 1 && movieHeader.payloadSize >= 32) {
    movieTimescale = bytes.readUInt32BE(movieHeader.payloadStart + 20);
    movieDuration = bytes.readBigUInt64BE(movieHeader.payloadStart + 24);
  } else throw new Error(`MP4 container structure differs (${label}: invalid mvhd)`);
  if (!movieTimescale || movieDuration <= 0n || movieDuration > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`MP4 container structure differs (${label}: non-positive or unsafe movie duration/timescale)`);
  let videoTracks = 0;
  let firstVideoSampleCount = null;
  for (const trak of children(moov).filter(({ type }) => type === "trak")) {
    const mdia = children(trak).find(({ type }) => type === "mdia");
    if (!mdia) continue;
    const media = children(mdia);
    const hdlr = media.find(({ type }) => type === "hdlr");
    const mdhd = media.find(({ type }) => type === "mdhd");
    if (!hdlr || hdlr.payloadSize < 12 || bytes.subarray(hdlr.payloadStart + 8, hdlr.payloadStart + 12).toString("ascii") !== "vide" || !mdhd) continue;
    const version = bytes[mdhd.payloadStart];
    let timescale;
    let duration;
    if (version === 0 && mdhd.payloadSize >= 20) {
      timescale = bytes.readUInt32BE(mdhd.payloadStart + 12);
      duration = BigInt(bytes.readUInt32BE(mdhd.payloadStart + 16));
    } else if (version === 1 && mdhd.payloadSize >= 32) {
      timescale = bytes.readUInt32BE(mdhd.payloadStart + 20);
      duration = bytes.readBigUInt64BE(mdhd.payloadStart + 24);
    } else throw new Error(`MP4 container structure differs (${label}: invalid mdhd)`);
    const minf = media.find(({ type }) => type === "minf");
    const stbl = minf && children(minf).find(({ type }) => type === "stbl");
    const sampleBoxes = stbl && children(stbl);
    const stsz = sampleBoxes?.find(({ type }) => type === "stsz");
    const stz2 = sampleBoxes?.find(({ type }) => type === "stz2");
    const sampleTable = stsz ?? stz2;
    if (!sampleTable || sampleTable.payloadSize < 12) throw new Error(`MP4 container structure differs (${label}: missing video sample table)`);
    const sampleCount = bytes.readUInt32BE(sampleTable.payloadStart + 8);
    const sampleSize = stsz ? bytes.readUInt32BE(stsz.payloadStart + 4) : null;
    const compactFieldSize = stz2 ? bytes[stz2.payloadStart + 7] : null;
    const sampleEntriesValid = stsz
      ? sampleSize !== 0 || stsz.payloadSize >= 12 + sampleCount * 4
      : [4, 8, 16].includes(compactFieldSize) && stz2.payloadSize >= 12 + Math.ceil(sampleCount * compactFieldSize / 8);
    if (!timescale || duration <= 0n || !sampleCount || !sampleEntriesValid) throw new Error(`MP4 container structure differs (${label}: non-positive duration/timescale/sample count)`);
    if (firstVideoSampleCount === null) firstVideoSampleCount = sampleCount;
    videoTracks += 1;
  }
  if (!videoTracks) throw new Error(`MP4 container structure differs (${label}: no valid video track)`);
  return {
    container: "ISO-BMFF MP4",
    durationSeconds: Number((Number(movieDuration) / movieTimescale).toFixed(6)),
    sampleCount: firstVideoSampleCount,
    videoTrackCount: videoTracks,
  };
}

function auditR1Status(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replaceAll("_", " ").replace(/\s+/g, " ").toUpperCase();
  if (normalized === "NOT-OBSERVED") return "NOT OBSERVED";
  return R1_EVIDENCE_STATUSES.has(normalized) ? normalized : null;
}

function auditR1Aggregate(statuses, fallback = "NOT OBSERVED") {
  const values = statuses.map(auditR1Status).filter(Boolean);
  if (!values.length) return fallback;
  if (values.includes("FAIL")) return "FAIL";
  if (values.includes("PENDING HUMAN REVIEW")) return "PENDING HUMAN REVIEW";
  if (values.includes("LIMITATION")) return "LIMITATION";
  if (values.includes("NOT OBSERVED")) return "NOT OBSERVED";
  return values.every((status) => status === "PASS") ? "PASS" : fallback;
}

const R1_MOTION_SAMPLE_LABELS = Object.freeze({
  "forward-physical-to-manifesto": Object.freeze(["F1", "current", "arrival", "indicator", "line", "raster", "Q", "threshold", "manifesto-threshold", "manifesto-resolved"]),
  "reverse-manifesto-to-f1": Object.freeze(["manifesto", "threshold", "Q", "raster", "line", "arrival", "current", "F1", "F1-rest"]),
  "resize-orientation-mid-current-and-manifesto": Object.freeze(["current-landscape-before", "current-portrait", "current-landscape-return", "manifesto-landscape-before", "manifesto-portrait", "manifesto-landscape-return"]),
  "supporting-route-entry-and-reverse": Object.freeze(["supporting-about", "home-entry", "Q", "raster", "line", "arrival", "current", "F1"]),
});
const R1_MOTION_HOME_STATE = Object.freeze({
  F1: { phase: "physical", segment: "top-dormancy", manifestoReveal: "hidden" }, "F1-rest": { phase: "physical", segment: "top-dormancy", manifestoReveal: "hidden" },
  current: { phase: "physical", segment: "current-orbit", manifestoReveal: "hidden" }, "current-landscape-before": { phase: "physical", segment: "current-orbit", manifestoReveal: "hidden" },
  "current-portrait": { phase: "physical", segment: "current-orbit", manifestoReveal: "hidden" }, "current-landscape-return": { phase: "physical", segment: "current-orbit", manifestoReveal: "hidden" },
  arrival: { phase: "physical", segments: ["crt-arrival", "indicator"], manifestoReveal: "hidden" }, indicator: { phase: "physical", segment: "indicator", manifestoReveal: "hidden" },
  line: { phase: "physical", segment: "phosphor-line", manifestoReveal: "hidden" }, raster: { phase: "physical", segment: "raster-settling", manifestoReveal: "hidden" },
  Q: { phase: "physical", segment: "q-hold", manifestoReveal: "hidden" }, threshold: { phase: "physical", segment: "physical-threshold", manifestoReveal: "hidden" },
  "manifesto-threshold": { phase: "entry", segment: "entry-reveal", manifestoReveal: "revealing" }, "manifesto-resolved": { phase: "entry", segment: "entry-reveal", manifestoReveal: "resolved" },
  manifesto: { phase: "settled", segment: "entry-reveal", manifestoReveal: "resolved" }, "manifesto-landscape-before": { phase: "entry", segment: "entry-reveal", manifestoReveal: "resolved" },
  "manifesto-portrait": { phase: "entry", segment: "entry-reveal", manifestoReveal: "resolved" }, "manifesto-landscape-return": { phase: "entry", segment: "entry-reveal", manifestoReveal: "resolved" },
  "home-entry": { phase: "settled", segment: "entry-reveal", manifestoReveal: "resolved" },
});

function auditR1MotionSample(sample, label, context) {
  const keys = ["documentHidden", "horizontalOverflow", "label", "manifestoReveal", "maximumScroll", "mediaState", "mode", "navigationReleased", "phase", "presentedFrame", "scrollY", "segment", "targetFrame", "url", "video", "viewport"];
  if (!sample || typeof sample !== "object" || Array.isArray(sample) || stableJson(Object.keys(sample).sort(lexicalCompare)) !== stableJson(keys.sort(lexicalCompare))
    || sample.label !== label || typeof sample.url !== "string" || !sample.url.startsWith("/") || typeof sample.documentHidden !== "boolean" || sample.documentHidden
    || !Number.isFinite(sample.scrollY) || sample.scrollY < 0 || !Number.isFinite(sample.maximumScroll) || sample.maximumScroll < 0 || sample.scrollY > sample.maximumScroll
    || !Number.isFinite(sample.horizontalOverflow) || sample.horizontalOverflow < 0 || sample.horizontalOverflow > 1 || !Number.isSafeInteger(sample.targetFrame) || sample.targetFrame < 0
    || !Number.isSafeInteger(sample.presentedFrame) || sample.presentedFrame < 0 || !sample.viewport || !Number.isSafeInteger(sample.viewport.width)
    || sample.viewport.width <= 0 || !Number.isSafeInteger(sample.viewport.height) || sample.viewport.height <= 0
    ) {
    throw new Error(`R1 independent motion observation sample differs: ${context}/${label}`);
  }
  if (label === "supporting-about") {
    if (sample.url !== "/about/" || sample.mode !== null || sample.mediaState !== null || sample.phase !== null || sample.segment !== null
      || sample.targetFrame !== 0 || sample.presentedFrame !== 0 || sample.manifestoReveal !== null || sample.navigationReleased !== null || sample.video !== null) {
      throw new Error(`R1 independent motion supporting-route state differs: ${context}/${label}`);
    }
    return sample;
  }
  const semanticLabel = label.replace(/-(?:before|after)-pause$/, "");
  const expected = R1_MOTION_HOME_STATE[semanticLabel];
  if (!expected || !["/", "/#entry"].includes(sample.url) || sample.mode !== "enhanced" || sample.mediaState !== "ready" || sample.phase !== expected.phase
    || (expected.segment ? sample.segment !== expected.segment : !expected.segments.includes(sample.segment)) || sample.manifestoReveal !== expected.manifestoReveal
    || sample.navigationReleased !== "concealed" || sample.targetFrame !== sample.presentedFrame
    || !sample.video || typeof sample.video !== "object" || Array.isArray(sample.video)
    || stableJson(Object.keys(sample.video).sort(lexicalCompare)) !== stableJson(["currentTime", "hasSource", "paused", "readyState"])
    || !Number.isFinite(sample.video.currentTime) || sample.video.currentTime < 0 || sample.video.paused !== true || sample.video.hasSource !== true
    || !Number.isSafeInteger(sample.video.readyState) || sample.video.readyState < 1 || sample.video.readyState > 4) {
    throw new Error(`R1 independent motion observation video state differs: ${context}/${label}`);
  }
  return sample;
}

function auditR1MotionSequence(samples, direction, context) {
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if ((direction === "forward" && (current.scrollY < previous.scrollY || current.targetFrame < previous.targetFrame))
      || (direction === "reverse" && (current.scrollY > previous.scrollY || current.targetFrame > previous.targetFrame))) throw new Error(`R1 independent motion ${direction} sequence differs: ${context}`);
  }
}

function auditR1MotionObservations(recording, engine) {
  const observations = recording.observations;
  const context = `${engine}/${recording.filename}`;
  if (!observations || typeof observations !== "object" || Array.isArray(observations) || observations.status !== "PASS") throw new Error(`R1 independent motion observations differ: ${context}`);
  if (recording.id === "stop-at-authored-states") {
    if (stableJson(Object.keys(observations).sort(lexicalCompare)) !== stableJson(["status", "stops"]) || !Array.isArray(observations.stops)
      || stableJson(observations.stops.map(({ label }) => label)) !== stableJson(["current", "line", "raster", "Q"])) throw new Error(`R1 independent stop-at-state observation inventory differs: ${context}`);
    for (const stop of observations.stops) {
      if (!stop || stableJson(Object.keys(stop).sort(lexicalCompare)) !== stableJson(["after", "before", "label", "status"]) || stop.status !== "PASS") throw new Error(`R1 independent stop-at-state observation differs: ${context}`);
      const before = auditR1MotionSample(stop.before, `${stop.label}-before-pause`, context);
      const after = auditR1MotionSample(stop.after, `${stop.label}-after-pause`, context);
      if (Math.abs(after.scrollY - before.scrollY) > 1 || after.maximumScroll !== before.maximumScroll || after.targetFrame !== before.targetFrame || after.presentedFrame !== before.presentedFrame
        || after.video.currentTime !== before.video.currentTime || after.video.paused !== true || before.video.paused !== true) throw new Error(`R1 independent stop-at-state stability differs: ${context}/${stop.label}`);
    }
    return;
  }
  const labels = R1_MOTION_SAMPLE_LABELS[recording.id];
  if (!labels || stableJson(Object.keys(observations).sort(lexicalCompare)) !== stableJson(["samples", "status"]) || !Array.isArray(observations.samples)
    || stableJson(observations.samples.map(({ label }) => label)) !== stableJson(labels)) throw new Error(`R1 independent motion sample inventory differs: ${context}`);
  const samples = labels.map((label, index) => auditR1MotionSample(observations.samples[index], label, context));
  if (recording.id === "forward-physical-to-manifesto") auditR1MotionSequence(samples, "forward", context);
  if (recording.id === "reverse-manifesto-to-f1") auditR1MotionSequence(samples, "reverse", context);
  if (recording.id === "supporting-route-entry-and-reverse") {
    if (samples[0].url !== "/about/" || samples.slice(1).some(({ url }) => url !== "/#entry")) throw new Error(`R1 independent supporting-route navigation differs: ${context}`);
    auditR1MotionSequence(samples.slice(1), "reverse", context);
  }
  if (recording.id === "resize-orientation-mid-current-and-manifesto") {
    const [currentLandscape, currentPortrait, currentReturn, manifestoLandscape, manifestoPortrait, manifestoReturn] = samples;
    if (!(currentLandscape.viewport.width > currentLandscape.viewport.height && currentPortrait.viewport.height > currentPortrait.viewport.width
      && currentReturn.viewport.width > currentReturn.viewport.height && manifestoLandscape.viewport.width > manifestoLandscape.viewport.height
      && manifestoPortrait.viewport.height > manifestoPortrait.viewport.width && manifestoReturn.viewport.width > manifestoReturn.viewport.height)
      || ![currentPortrait, currentReturn].every((sample) => sample.scrollY === currentLandscape.scrollY && sample.targetFrame === currentLandscape.targetFrame)
      || ![manifestoPortrait, manifestoReturn].every((sample) => sample.scrollY === manifestoLandscape.scrollY && sample.targetFrame === manifestoLandscape.targetFrame)) throw new Error(`R1 independent motion resize/orientation continuity differs: ${context}`);
  }
}

function auditDistilled(entries, relativePath, role) {
  const wrapper = parseJson(entries.get(relativePath), relativePath);
  if (wrapper?.schema !== `${EVIDENCE_ASSEMBLY_SCHEMA}.distilled-json` || wrapper.role !== role || wrapper.selection !== null
    || !wrapper.source || typeof wrapper.source.relativePath !== "string" || !HASH64.test(wrapper.source.sha256 ?? "")
    || !auditR1Status(wrapper.status) || !wrapper.payload || typeof wrapper.payload !== "object" || Array.isArray(wrapper.payload)) {
    throw new Error(`R1 independent canonical ${role} wrapper differs: ${relativePath}`);
  }
  return wrapper;
}

function auditRequirement(summary, name) {
  const matches = summary.requirements.filter(({ requirement }) => requirement === name);
  if (matches.length !== 1) throw new Error(`R1 independent section requirement differs: ${summary.section}/${name}`);
  return matches[0];
}

function auditIncludes720x450(value) {
  if (!value || typeof value !== "object") return false;
  if (value.width === 720 && value.height === 450) return true;
  return Object.values(value).some(auditIncludes720x450);
}

function auditAccessibility(entries, roles, summaries) {
  const reports = roles.get("accessibility-summary") ?? [];
  const engines = new Set();
  for (const record of reports) {
    const wrapper = auditDistilled(entries, record.path, "accessibility-summary");
    const report = wrapper.payload;
    if (report.schema === "quantum-hub.phase-6.accessibility-interactions.v1") validateCanonicalAccessibilityReport(report);
    const engine = report.engine;
    if (!["chromium", "webkit", "firefox"].includes(engine) || engines.has(engine) || wrapper.status !== "PASS" || report.status !== "PASS"
      || !["quantum-hub.phase-6.accessibility-interactions.v1", "quantum-hub.phase-6.global-hardening.v1"].includes(report.schema)
      || stableJson(report.selectedEngines) !== stableJson([engine]) || !Array.isArray(report.engines) || report.engines.length !== 1 || report.engines[0]?.engine !== engine
      || !Array.isArray(report.failures) || report.failures.length || report.summary?.axeCases !== 20 || report.summary?.axeExpected !== 20
      || report.summary?.axeViolations !== 0 || report.summary?.seriousCritical !== 0 || report.summary?.failures !== 0 || report.summary?.engineErrors !== 0) {
      throw new Error(`R1 independent accessibility summary differs: ${engine ?? record.path}`);
    }
    if (engine === "webkit") {
      if (report.axeOnly !== true) throw new Error("R1 independent WebKit accessibility summary must remain axe-only");
    } else {
      const result = report.engines[0];
      if (report.axeOnly !== false || result.status !== "PASS" || !Array.isArray(result.keyboard) || result.keyboard.length !== 10
        || result.keyboard.some((item) => item?.status !== "PASS" || item.failures?.length) || result.mobileMenu?.status !== "PASS"
        || result.mobileMenu?.cycles?.length !== 4 || result.mobileMenu?.failures?.length || result.history?.status !== "PASS" || result.history?.failures?.length) {
        throw new Error(`R1 independent accessibility interaction matrix differs: ${engine}`);
      }
    }
    engines.add(engine);
  }
  if (engines.size !== 3) throw new Error("R1 independent accessibility engine inventory differs");
  const limitationRecord = (roles.get("accessibility-interaction-limitation") ?? [])[0];
  const limitation = auditDistilled(entries, limitationRecord.path, "accessibility-interaction-limitation");
  validateCanonicalAccessibilityReport(limitation.payload);
  const sourceStatus = auditR1Status(limitation.payload.status);
  if (!['FAIL', 'LIMITATION'].includes(limitation.status) || !['FAIL', 'LIMITATION'].includes(sourceStatus) || limitation.sourceStatus !== sourceStatus
    || limitation.payload.engine !== "webkit" || limitation.payload.axeOnly === true) throw new Error("R1 independent WebKit interaction limitation binding differs");
  const proxyRecord = (roles.get("supplemental-reflow-proxy") ?? [])[0];
  const proxy = auditDistilled(entries, proxyRecord.path, "supplemental-reflow-proxy");
  const variants = proxy.payload.variants?.filter?.(({ id }) => id === "text-200-proxy") ?? [];
  if (proxy.status !== "PASS" || proxy.payload.status !== "PASS" || proxy.payload.schema !== "quantum-hub.phase-5b.responsive-accessibility.v1"
    || variants.length !== 1 || !auditIncludes720x450(variants[0]) || !variants[0].records?.length) throw new Error("R1 independent supplemental 720x450 proxy differs");
  for (const name of ["keyboard", "focus", "mobile menu"]) if (auditRequirement(summaries.get("09-accessibility"), name).status !== limitation.status) throw new Error(`R1 independent accessibility taxonomy falsely promotes ${name}`);
  if (auditRequirement(summaries.get("09-accessibility"), "axe").status !== "PASS") throw new Error("R1 independent accessibility axe taxonomy differs");
}

function auditMotion(entries, roles) {
  const summaries = roles.get("r1-motion-summary") ?? [];
  const videos = roles.get("r1-motion-recording") ?? [];
  for (const engine of ["chromium", "firefox"]) {
    const expectedPath = `03-homepage-motion/r1/${engine}/motion-evidence-report.json`;
    if (summaries.filter(({ path: relativePath }) => relativePath === expectedPath).length !== 1) throw new Error(`R1 independent motion summary inventory differs: ${engine}`);
    const wrapper = auditDistilled(entries, expectedPath, "r1-motion-summary");
    const report = wrapper.payload;
    validateCanonicalR1MotionReport(report, engine);
    if (wrapper.status !== "PASS" || report.schema !== R1_MOTION_EVIDENCE_SCHEMA || report.status !== "PASS" || report.browser?.engine !== engine
      || report.diagnostics?.status !== "PASS" || report.diagnostics?.failures?.length || report.summary?.recordings !== 5 || report.summary?.expected !== 5
      || report.summary?.failures !== 0 || report.recordings?.length !== 5
      || stableJson(report.recordings.map(({ filename }) => filename).sort(lexicalCompare)) !== stableJson([...R1_MOTION_RECORDINGS].sort(lexicalCompare))) {
      throw new Error(`R1 independent motion report differs: ${engine}`);
    }
    for (const item of report.recordings) {
      auditR1MotionObservations(item, engine);
      const videoPath = `03-homepage-motion/r1/${engine}/${item.filename}`;
      const bytes = entries.get(videoPath);
      if (!videos.some(({ path: relativePath }) => relativePath === videoPath) || !bytes || bytes.length !== item.byteSize || sha256(bytes) !== item.sha256 || item.observations?.status !== "PASS") throw new Error(`R1 independent motion recording binding differs: ${engine}/${item.filename}`);
      validateIsoBmffMp4(bytes, videoPath);
    }
  }
}

function auditMachineLifecycleStatuses(entries, roles, kind) {
  const statuses = [];
  for (const record of [...roles.values()].flat()) {
    if (path.posix.extname(record.path).toLowerCase() !== ".json" || ["generated", "generated-authority", "physical-device-result"].includes(record.role)) continue;
    let document;
    try {
      const parsed = JSON.parse(entries.get(record.path).toString("utf8"));
      document = parsed?.schema === `${EVIDENCE_ASSEMBLY_SCHEMA}.distilled-json` ? parsed.payload : parsed;
    } catch { continue; }
    const candidates = kind === "bfcache"
      ? [document?.bfcache, document?.history?.bfcache, ...(Array.isArray(document?.history) ? document.history.map((item) => item?.bfcache) : []), ...(Array.isArray(document?.engines) ? document.engines.map((engine) => engine?.history?.bfcache) : [])]
      : [document?.visibility, ...(Array.isArray(document?.engines) ? document.engines.map((engine) => engine?.visibility) : [])];
    for (const candidate of candidates) {
      const status = auditR1Status(candidate?.status ?? candidate);
      if (status) statuses.push(status);
    }
  }
  return statuses;
}

function auditLifecycle(entries, roles, summaries) {
  const record = (roles.get("r1-persistent-lifecycle-summary") ?? [])[0];
  if (record?.path !== "05-history-bfcache/r1-persistent-lifecycle.json") throw new Error("R1 independent persistent-lifecycle inventory differs");
  const wrapper = auditDistilled(entries, record.path, "r1-persistent-lifecycle-summary");
  const report = wrapper.payload;
  const deployment = parseJson(entries.get(DEPLOYMENT_VERIFICATION_PATH), DEPLOYMENT_VERIFICATION_PATH);
  validateCanonicalR1PersistentLifecycle(report, { role: "r1-persistent-lifecycle-summary", engine: "chromium", status: wrapper.status }, {
    deployment: { immutableUrl: deployment.inputs?.immutableUrl, branchUrl: deployment.inputs?.branchUrl },
  });
  const statuses = [report.history, report.bfcache, report.visibility, report.listeners, report.mediaRequests, report.profileCleanup].map(({ status } = {}) => auditR1Status(status));
  const expected = statuses.includes("FAIL") ? "FAIL" : statuses.includes("NOT OBSERVED") ? "LIMITATION" : "PASS";
  if (report.schema !== R1_PERSISTENT_LIFECYCLE_SCHEMA || report.browser?.engine !== "chromium" || statuses.some((status) => !status)
    || auditR1Status(report.status) !== expected || wrapper.status !== expected || (expected !== "PASS" && wrapper.sourceStatus !== expected)) throw new Error("R1 independent persistent-lifecycle status binding differs");
  const bfcache = auditMachineLifecycleStatuses(entries, roles, "bfcache").includes("FAIL") ? "FAIL" : auditR1Status(report.bfcache.status);
  if (auditRequirement(summaries.get("05-history-bfcache"), "BFCache").status !== bfcache) throw new Error("R1 independent BFCache taxonomy contradicts persistent lifecycle evidence");
  return report;
}

function auditChangedPaths(records, label, { diff = false } = {}) {
  if (!Array.isArray(records)) throw new Error(`${label} is not an array`);
  const normalizedRecords = records.map((record) => {
    if (typeof record === "string") {
      const match = /^([AM])\t(.+)$/.exec(record);
      if (diff && !match) throw new Error(`${label} record differs`);
      if (!match) throw new Error(`${label} must retain exact added/modified status authority`);
      return `${match[1]}\t${safeRelativePath(match[2].replaceAll("\\", "/"), label)}`;
    }
    if (!record || stableJson(Object.keys(record).sort(lexicalCompare)) !== stableJson(["path", "status"])
      || !["A", "M"].includes(record.status) || typeof record.path !== "string") throw new Error(`${label} record differs`);
    return `${record.status}\t${safeRelativePath(record.path.replaceAll("\\", "/"), label)}`;
  });
  const paths = normalizedRecords.map((record) => record.slice(2));
  if (new Set(paths).size !== paths.length) throw new Error(`${label} contains duplicate paths`);
  return { paths, records: normalizedRecords };
}

function auditNodeBoundText(text, expectedHash, label) {
  if (typeof text !== "string" || !text.length || Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024 || !HASH64.test(expectedHash ?? "") || sha256(Buffer.from(text, "utf8")) !== expectedHash) throw new Error(`R1 independent Node 22 embedded ${label} hash binding differs`);
  return text;
}

function auditNodeDistManifest(text, expectedHash, label) {
  auditNodeBoundText(text, expectedHash, `${label} dist manifest`);
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (lines.shift() !== '"path","bytes","sha256"' || !lines.length) throw new Error(`R1 independent Node 22 ${label} dist manifest differs`);
  let previous = null;
  let bytes = 0;
  const paths = new Set();
  const records = [];
  for (const line of lines) {
    const match = /^"([^"]+)","([0-9]+)","([a-f0-9]{64})"$/.exec(line);
    const byteSize = Number(match?.[2]);
    const relativePath = match?.[1];
    if (!match || !relativePath || relativePath.startsWith("/") || relativePath.includes("\\") || relativePath.split("/").includes("..")
      || !Number.isSafeInteger(byteSize) || byteSize < 0 || paths.has(relativePath) || (previous !== null && previous.localeCompare(relativePath) >= 0)) throw new Error(`R1 independent Node 22 ${label} dist manifest row differs`);
    paths.add(relativePath);
    records.push({ relativePath, bytes: byteSize, sha256: match[3] });
    previous = relativePath;
    bytes += byteSize;
    if (!Number.isSafeInteger(bytes)) throw new Error(`R1 independent Node 22 ${label} dist byte total differs`);
  }
  return { files: lines.length, bytes, records };
}

function auditR1Node22Authority(document, repository) {
  const schema = /^quantum-hub\.phase-6-r1\.node22-integrated-validation\.v([0-9]+)$/.exec(String(document?.schema ?? ""));
  if (!schema || Number(schema[1]) < 7 || document.status !== "PASS") throw new Error("R1 independent Node 22 schema/status differs");
  validateTimestamp(document.sealedAtUtc, "R1 independent Node 22 sealedAtUtc");
  const source = document.repository;
  if (!source || source.branch !== R1_REQUIRED_BRANCH || source.requiredParent !== R1_REQUIRED_PARENT || source.finalHead !== repository.finalHead
    || source.finalTree !== repository.finalTree || source.finalHeadDirectParent !== repository.directParent || source.captureHeadBeforeFinalCommit !== source.finalHeadDirectParent
    || source.main !== FROZEN_MAIN_SHA || source.originMain !== FROZEN_MAIN_SHA || source.workingTreeCleanAtSeal !== true
    || source.productionDiff?.base !== R1_REQUIRED_PARENT || stableJson(source.productionDiff?.scope) !== stableJson(["src/**", "public/**"])
    || source.productionDiff?.changedPathCount !== 0 || source.productionDiff?.status !== "ZERO PRODUCTION-SOURCE DIFF"
    || source.packageLock?.changedLinesFromRequiredParent !== 0 || !HASH64.test(source.packageLock?.sha256 ?? "")) throw new Error("R1 independent Node 22 repository authority differs");
  const runtime = document.runtime;
  if (runtime?.nvmrc !== "22.16.0" || runtime.node !== "v22.16.0" || !/^\d+\.\d+\.\d+$/.test(runtime.npm ?? "")
    || runtime.node24ComparisonRuntime !== "v24.18.0" || !/^\d+\.\d+\.\d+$/.test(runtime.node24ComparisonNpm ?? "")) throw new Error("R1 independent Node/npm runtime authority differs");
  if (!Array.isArray(document.outcomes) || stableJson(document.outcomes.map(({ id } = {}) => id)) !== stableJson(R1_NODE22_REQUIRED_OUTCOMES)) throw new Error("R1 independent Node 22 exact outcome inventory differs");
  const outcomes = new Map(document.outcomes.map((outcome) => [outcome.id, outcome]));
  for (const id of R1_NODE22_REQUIRED_OUTCOMES) {
    const outcome = outcomes.get(id);
    if (outcome.status !== "PASS" || typeof outcome.log !== "string" || !outcome.log.trim()) throw new Error(`R1 independent Node 22 required outcome differs: ${id}`);
    auditNodeBoundText(outcome.logText, outcome.logSha256, `${id} log`);
  }
  const npmCi = outcomes.get("npm-ci");
  const astro = outcomes.get("astro-check");
  const build = outcomes.get("production-build");
  const phase4 = outcomes.get("phase4-source-verification");
  const standalone = outcomes.get("standalone-verifier-self-tests");
  if (npmCi.command !== "npm ci" || !Number.isSafeInteger(npmCi.packagesInstalled) || npmCi.packagesInstalled <= 0
    || !/astro check/.test(astro.command ?? "") || astro.errors !== 0 || astro.warnings !== 0
    || build.command !== "npm run build" || build.phase4OutputVerification !== "PASS" || build.phase5bProductionVerification !== "PASS"
    || !/verify-phase4-source\.mjs/.test(phase4.command ?? "") || !Number.isSafeInteger(phase4.stagedPhase4RuntimeFiles) || phase4.stagedPhase4RuntimeFiles <= 0) throw new Error("R1 independent Node 22 command outcomes differ");
  for (const id of ["complete-postbuild-test-suite", "phase5b-phase6-r1-focused-regression"]) {
    const outcome = outcomes.get(id);
    if (!Number.isSafeInteger(outcome.tests) || outcome.tests <= 0 || outcome.passed !== outcome.tests || outcome.failed !== 0 || outcome.cancelled !== 0 || outcome.skipped !== 0 || outcome.todo !== 0) throw new Error(`R1 independent Node 22 test outcome differs: ${id}`);
  }
  if (standalone.checks !== 4 || standalone.passed !== 4 || standalone.failed !== 0 || stableJson(standalone.checkNames) !== stableJson(["phase4", "phase5b", "phase6", "phase6-r1"])) throw new Error("R1 independent Node 22 standalone self-tests differ");
  const comparison = document.distributionComparison;
  const node22Manifest = auditNodeDistManifest(comparison?.node22?.manifestText, comparison?.node22?.manifestSha256, "Node 22");
  const node24Manifest = auditNodeDistManifest(comparison?.node24?.manifestText, comparison?.node24?.manifestSha256, "Node 24");
  if (comparison?.status !== "BYTE-IDENTICAL" || comparison.differenceCount !== 0 || comparison.node22?.manifestText !== comparison.node24?.manifestText
    || comparison.node22?.manifestSha256 !== comparison.node24?.manifestSha256 || comparison.node22?.files !== node22Manifest.files || comparison.node22?.bytes !== node22Manifest.bytes
    || comparison.node24?.files !== node24Manifest.files || comparison.node24?.bytes !== node24Manifest.bytes) throw new Error("R1 independent Node 22 versus Node 24 dist comparison differs");
  const differences = auditNodeBoundText(comparison.differencesText, comparison.differencesSha256, "Node 22 versus Node 24 differences");
  if (stableJson(differences.replace(/\r\n/g, "\n").split("\n").filter(Boolean)) !== stableJson(['"input","sideIndicator"'])) throw new Error("R1 independent Node 22 differences ledger is not empty");
  auditNodeBoundText(comparison.comparisonText, comparison.comparisonSha256, "Node 22 versus Node 24 comparison");
  if (!Array.isArray(document.limitations)) throw new Error("R1 independent Node 22 limitations differ");
  return { manifest: node22Manifest };
}

function auditR1NodeAndChangeAuthority(entries, roles) {
  const repositoryAuthority = parseJson(entries.get("00-provenance/repository-authority.json"), "00-provenance/repository-authority.json");
  const repository = repositoryAuthority.repository;
  const gitProvenance = parseJson(entries.get("00-provenance/git-provenance.json"), "00-provenance/git-provenance.json");
  if (repositoryAuthority.schema !== `${EVIDENCE_ASSEMBLY_SCHEMA}.repository-authority` || repositoryAuthority.status !== "PASS" || !repository
    || repository.branch !== R1_REQUIRED_BRANCH || repository.exactParent !== R1_REQUIRED_PARENT || repository.finalHead !== gitProvenance.head || !HASH40.test(repository.directParent ?? "")
    || !Array.isArray(gitProvenance.directParents) || gitProvenance.directParents.length !== 1 || gitProvenance.directParents[0] !== repository.directParent
    || repository.main?.local !== FROZEN_MAIN_SHA || repository.main?.upstream !== FROZEN_MAIN_SHA || repository.main?.public !== FROZEN_MAIN_SHA
    || repository.main?.modifiedOrMerged !== false || !HASH40.test(repository.finalTree ?? "") || gitProvenance.headTree !== repository.finalTree) throw new Error("R1 independent repository authority differs");

  const changeLedger = parseJson(entries.get("00-provenance/change-ledger.json"), "00-provenance/change-ledger.json");
  const tooling = auditChangedPaths(changeLedger.toolingReportFiles, "R1 independent change-ledger tooling/report files");
  if (changeLedger.schema !== `${EVIDENCE_ASSEMBLY_SCHEMA}.change-ledger` || changeLedger.status !== "PASS"
    || stableJson(changeLedger.productionFiles) !== stableJson([])
    || stableJson(tooling.records) !== stableJson(EXPECTED_R1_CHANGED_PATH_RECORDS)
    || stableJson([...tooling.paths].sort(lexicalCompare)) !== stableJson([...R1_TOOLING_REPORT_FILES].sort(lexicalCompare))
    || changeLedger.trackedFileDelta !== R1_TOOLING_REPORT_FILES.length || !Number.isSafeInteger(changeLedger.trackedByteDelta)
    || !Array.isArray(changeLedger.newTrackedFilesAbove1MiB) || changeLedger.newTrackedFilesAbove1MiB.length) throw new Error("R1 independent change ledger differs from the exact 18-path authority");
  const deployment = parseJson(entries.get(DEPLOYMENT_VERIFICATION_PATH), DEPLOYMENT_VERIFICATION_PATH);
  const deployedRepository = deployment.repository?.data;
  assertR1DeploymentStatusClosure(deployment, "R1 independent deployment verification");
  const deployedTooling = auditChangedPaths(deployedRepository?.toolingReportDiff, "R1 independent deployment tooling/report diff", { diff: true });
  if (deployedRepository?.status !== "PASS" || deployedRepository?.branch !== repository.branch || deployedRepository?.head !== repository.finalHead || deployedRepository?.exactParent !== repository.exactParent
    || deployedRepository?.directParent !== repository.directParent || deployedRepository?.main?.local !== repository.main.local
    || deployedRepository?.main?.upstream !== repository.main.upstream || deployedRepository?.main?.live !== repository.main.public || deployedRepository?.main?.modifiedOrMerged !== false
    || !Array.isArray(deployedRepository?.history) || !deployedRepository.history.length || deployedRepository.history.at(-1)?.commit !== repository.finalHead
    || deployedRepository.history.at(-1)?.parents?.length !== 1 || deployedRepository.history.at(-1).parents[0] !== repository.directParent
    || stableJson(deployedRepository?.productionSourceDiff) !== stableJson([])
    || stableJson(deployedTooling.records) !== stableJson(EXPECTED_R1_CHANGED_PATH_RECORDS)
    || stableJson([...deployedTooling.paths].sort(lexicalCompare)) !== stableJson([...R1_TOOLING_REPORT_FILES].sort(lexicalCompare))
    || stableJson(deployedRepository?.productionDiffScope) !== stableJson(R1_PRODUCTION_DIFF_SCOPE)
    || stableJson(deployedRepository?.packageScriptChanges) !== stableJson(R1_PACKAGE_SCRIPT_CHANGES)
    || (deployedRepository.trackedFileDelta !== undefined && deployedRepository.trackedFileDelta !== changeLedger.trackedFileDelta)
    || (deployedRepository.trackedByteDelta !== undefined && deployedRepository.trackedByteDelta !== changeLedger.trackedByteDelta)) throw new Error("R1 independent deployment/change-ledger authority differs");

  const deploymentSummary = parseJson(entries.get("00-provenance/deployment-authority-summary.json"), "00-provenance/deployment-authority-summary.json");
  const summaryDeployment = deploymentSummary.deployment;
  if (deploymentSummary.schema !== `${EVIDENCE_ASSEMBLY_SCHEMA}.deployment-authority-summary` || deploymentSummary.status !== "PASS"
    || deploymentSummary.branch !== repository.branch || deploymentSummary.finalHead !== repository.finalHead || !summaryDeployment) {
    throw new Error("R1 independent deployment-authority summary differs");
  }
  exactJson(summaryDeployment, {
    id: deployment.deployment.data.deploymentId,
    checkRunId: deployment.deployment.data.checkRunId,
    immutableUrl: deployment.deployment.data.immutableUrl,
    branchUrl: deployment.deployment.data.branchUrl,
    deployedSha: repository.finalHead,
    parity: "PASS",
    headers: "PASS",
    real404: "PASS",
    canonical: "PASS",
    productionMainDeployed: false,
  }, "R1 independent deployment-authority summary deployment");
  auditR1RawDeploymentAuthority(deployment, {
    expectedHead: repository.finalHead,
    deploymentId: summaryDeployment.id,
    deploymentCheckRunId: summaryDeployment.checkRunId,
    immutableUrl: summaryDeployment.immutableUrl,
    branchUrl: summaryDeployment.branchUrl,
  }, "R1 independent canonical deployment verification");

  const nodeRecords = roles.get("r1-node22-validation-summary") ?? [];
  if (nodeRecords.length !== 1 || nodeRecords[0].path !== "00-provenance/node22-integrated-validation.json") throw new Error("R1 independent Node 22 artifact inventory differs");
  const nodeWrapper = auditDistilled(entries, nodeRecords[0].path, "r1-node22-validation-summary");
  if (nodeWrapper.status !== "PASS") throw new Error("R1 independent Node 22 wrapper status differs");
  validateCanonicalR1Node22Validation(nodeWrapper.payload, { repository });
  const nodeAuthority = auditR1Node22Authority(nodeWrapper.payload, repository);
  exactJson(deployment.dist.files.map(({ relativePath, bytes, sha256: fileSha256 }) => ({ relativePath, bytes, sha256: fileSha256 })), nodeAuthority.manifest.records, "R1 independent deployment/Node 22 dist ledger binding");
  const finalBuild = parseJson(entries.get("00-provenance/final-build-test.json"), "00-provenance/final-build-test.json");
  const node = nodeWrapper.payload;
  const expectedNodeBinding = {
    artifact: { path: nodeRecords[0].path, source: nodeWrapper.source.relativePath, sha256: nodeWrapper.source.sha256 },
    schema: node.schema, status: node.status, sealedAtUtc: node.sealedAtUtc, repository: node.repository,
    runtime: node.runtime, outcomes: node.outcomes, distributionComparison: node.distributionComparison,
  };
  if (finalBuild.schema !== `${EVIDENCE_ASSEMBLY_SCHEMA}.final-build-test` || finalBuild.status !== "PASS"
    || stableJson(finalBuild.node22Validation) !== stableJson(expectedNodeBinding)) throw new Error("R1 independent final-build-test/Node 22 binding differs");
}

export function validateR1CanonicalEvidenceEntries(entries) {
  const r1Reports = reportSpecsForProfile(authorityProfileById("phase6-r1"));
  const reservedPaths = [IN_ARCHIVE_MANIFEST, "00-provenance/git-provenance.json", ...r1Reports.map(({ archive }) => archive), "13-package/README.md", "13-package/package-metadata.json"].sort(lexicalCompare);
  for (const { archive } of r1Reports) if (!entries.has(archive)) throw new Error(`R1 independent canonical package omits tracked report: ${archive}`);
  const inventoryBytes = entries.get(EVIDENCE_ASSEMBLY_INVENTORY_PATH);
  const inventory = parseJson(inventoryBytes, EVIDENCE_ASSEMBLY_INVENTORY_PATH);
  if (inventory.schema !== `${EVIDENCE_ASSEMBLY_SCHEMA}.evidence-root-inventory` || inventory.status !== "PASS" || !Array.isArray(inventory.inventoryExcludingSelf)
    || stableJson(inventory.topology) !== stableJson(TOPOLOGY_SECTIONS)
    || stableJson(inventory.sourcePolicy) !== stableJson({ explicitFinalSelectionsOnly: true, sourceHashesBound: true, rawFramesRetained: false, cachesRetained: false, nestedArchivesRetained: false, privatePathsRetained: false, identicalPayloadsRetained: false })
    || stableJson(inventory.reservedPathsAbsent) !== stableJson(reservedPaths)
    || stableJson(inventory.downstream) !== stableJson({ packagerAddsTrackedReports: r1Reports.length, packagerAddsGitProvenance: true, packagerAddsManifestAndPackageMetadata: true, independentAuditIsSibling: true })
    || stableJson(inventory.humanReviewGates) !== stableJson(HUMAN_REVIEW_GATES) || stableJson(inventory.authorization) !== stableJson(AUTHORIZATION)) throw new Error("R1 independent evidence-assembly inventory authority differs");
  validateTimestamp(inventory.generatedAt, "R1 independent evidence-assembly generatedAt");
  const downstream = new Set([IN_ARCHIVE_MANIFEST, "00-provenance/git-provenance.json", "13-package/README.md", "13-package/package-metadata.json", ...r1Reports.map(({ archive }) => archive), EVIDENCE_ASSEMBLY_INVENTORY_PATH]);
  const actualPaths = [...entries.keys()].filter((relativePath) => !downstream.has(relativePath)).sort(lexicalCompare);
  const roles = new Map();
  if (inventory.inventoryExcludingSelf.length !== R1_EXACT_ASSEMBLER_PATH_ROLES.size) throw new Error("R1 independent evidence inventory path/role topology differs");
  let total = 0;
  let previous = null;
  const listed = [];
  for (const record of inventory.inventoryExcludingSelf) {
    const expectedRole = R1_EXACT_ASSEMBLER_PATH_ROLES.get(record?.path);
    if (!record || typeof record.path !== "string" || (previous !== null && lexicalCompare(previous, record.path) >= 0) || !Number.isSafeInteger(record.byteSize) || record.byteSize <= 0 || !HASH64.test(record.sha256 ?? "") || typeof record.role !== "string" || record.role !== expectedRole
      || /(?:^|[-_/])(?:repository|repo)[-_ ]source(?:[-_.\/]|$)/i.test(record.path)) throw new Error("R1 independent evidence inventory record differs");
    const bytes = entries.get(record.path);
    if (!bytes || bytes.length !== record.byteSize || sha256(bytes) !== record.sha256) throw new Error(`R1 independent evidence inventory hash/size differs: ${record.path}`);
    listed.push(record.path); total += bytes.length; previous = record.path;
    const grouped = roles.get(record.role) ?? []; grouped.push(record); roles.set(record.role, grouped);
  }
  if (stableJson(listed) !== stableJson(actualPaths) || total !== inventory.inventoryExcludingSelfBytes) throw new Error("R1 independent evidence inventory path/byte ledger differs");
  for (const [role, spec] of Object.entries(R1_REQUIRED_ROLE_INVENTORY)) {
    const matching = roles.get(role) ?? [];
    if (matching.length < spec.minimum || (spec.exact !== undefined && matching.length !== spec.exact) || matching.some(({ path: relativePath }) => sectionFor(relativePath) !== spec.section || kindFor(relativePath) !== spec.kind)) throw new Error(`R1 independent required artifact inventory differs: ${role}`);
  }
  const summaries = new Map();
  for (const section of TOPOLOGY_SECTIONS) {
    const relativePath = `${section}/section-summary.json`;
    const summary = parseJson(entries.get(relativePath), relativePath);
    const expectedRequirements = R1_BRIEF_REQUIREMENTS[section];
    if (summary.schema !== `${EVIDENCE_ASSEMBLY_SCHEMA}.section-summary` || summary.section !== section || typeof summary.summary !== "string" || !summary.summary.trim()
      || !Array.isArray(summary.limitations) || !Array.isArray(summary.evidence) || !Array.isArray(summary.requirements)
      || stableJson(summary.requirements.map(({ requirement } = {}) => requirement)) !== stableJson(expectedRequirements)
      || (section === "13-package" ? summary.status !== "READY FOR PACKAGER" : !auditR1Status(summary.status))) throw new Error(`R1 independent section summary differs: ${section}`);
    const names = new Set();
    for (const item of summary.requirements) {
      if (!item || typeof item.requirement !== "string" || names.has(item.requirement) || (section === "13-package" ? item.status !== "GENERATED BY PACKAGER" : !auditR1Status(item.status))
        || typeof item.statement !== "string" || !item.statement.trim() || !item.evidenceRoles?.length || !item.evidence?.length) throw new Error(`R1 independent section requirement differs: ${section}`);
      names.add(item.requirement);
    }
    const expectedEvidence = inventory.inventoryExcludingSelf
      .filter(({ path: evidencePath }) => sectionFor(evidencePath) === section && !evidencePath.endsWith("/section-summary.json"))
      .map(({ path: evidencePath, role, byteSize, sha256: hash }) => ({ path: evidencePath, role, byteSize, sha256: hash }));
    const injected = {
      "01-baseline": [...REPORT_SPECS.slice(0, 2), R1_CLOSURE_REPORT_SPEC].map(({ archive }) => ({ path: archive, role: "packager-injected-report", generatedByPackager: true })),
      "10-poster-study": [{ path: REPORT_SPECS[2].archive, role: "packager-injected-report", generatedByPackager: true }],
      "11-physical-device": [{ path: REPORT_SPECS[3].archive, role: "packager-injected-report", generatedByPackager: true }],
      "13-package": ["MANIFEST.json", "13-package/README.md", "13-package/package-metadata.json"].map((evidencePath) => ({ path: evidencePath, role: "packager-generated", generatedByPackager: true })),
    }[section] ?? [];
    const ordered = (value) => [...value].sort((left, right) => lexicalCompare(left.path, right.path));
    if (stableJson(ordered(summary.evidence)) !== stableJson(ordered([...expectedEvidence, ...injected]))) throw new Error(`R1 independent section evidence inventory differs: ${section}`);
    const requirementEvidence = [
      ...inventory.inventoryExcludingSelf.filter(({ path: evidencePath }) => !evidencePath.endsWith("/section-summary.json")).map(({ path: evidencePath, role }) => ({ path: evidencePath, role })),
      ...injected.map(({ path: evidencePath, role }) => ({ path: evidencePath, role })),
      ...(section === "13-package" ? ["detached manifest sibling", "independent audit sibling"].map((evidencePath) => ({ path: evidencePath, role: "packager-generated" })) : []),
    ];
    for (const item of summary.requirements) {
      if (new Set(item.evidenceRoles).size !== item.evidenceRoles.length || item.evidenceRoles.some((role) => !requirementEvidence.some((evidence) => evidence.role === role))) throw new Error(`R1 independent section requirement role binding differs: ${section}/${item.requirement}`);
      const expectedPaths = [...new Set(requirementEvidence.filter(({ role }) => item.evidenceRoles.includes(role)).map(({ path: evidencePath }) => evidencePath))].sort(lexicalCompare);
      const actualPaths = [...item.evidence];
      if (actualPaths.some((evidencePath) => typeof evidencePath !== "string" || !evidencePath) || new Set(actualPaths).size !== actualPaths.length
        || stableJson(actualPaths.sort(lexicalCompare)) !== stableJson(expectedPaths)) throw new Error(`R1 independent section requirement evidence binding differs: ${section}/${item.requirement}`);
    }
    summaries.set(section, summary);
  }
  auditAccessibility(entries, roles, summaries);
  auditMotion(entries, roles);
  const lifecycleReport = auditLifecycle(entries, roles, summaries);
  auditR1NodeAndChangeAuthority(entries, roles);
  for (const record of inventory.inventoryExcludingSelf.filter(({ path: relativePath }) => path.posix.extname(relativePath).toLowerCase() === ".mp4")) validateIsoBmffMp4(entries.get(record.path), record.path);
  const ledger = auditDistilled(entries, R1_HUMAN_LEDGER_PATH, "physical-device-result").payload;
  const zoom = ledger.entries?.find(({ filename }) => filename === "chrome-200-percent.mp4");
  const opening = ledger.entries?.find(({ filename }) => filename === "iphone-safari-opening.mp4");
  const maradin = ledger.entries?.find(({ filename }) => filename === "iphone-safari-maradin.mp4");
  const zoomStatus = zoom?.routeOutcomes ? auditR1Aggregate(zoom.routeOutcomes.map(({ status }) => status), "PENDING HUMAN REVIEW") : "PENDING HUMAN REVIEW";
  if (auditRequirement(summaries.get("09-accessibility"), "200%").status !== zoomStatus) throw new Error("R1 independent genuine 200% taxonomy contradicts human evidence");
  const lifecycleChecks = [opening?.checks?.backgroundForeground, maradin?.checks?.backgroundForeground, maradin?.checks?.retryableSourceFree, maradin?.checks?.noPersistentRafOrInterval, maradin?.checks?.noLiveOrphanBlob];
  const humanHidden = lifecycleChecks.includes(false) ? "FAIL" : lifecycleChecks.every((value) => value === true) ? "PASS" : "PENDING HUMAN REVIEW";
  const hidden = auditR1Aggregate([...auditMachineLifecycleStatuses(entries, roles, "visibility"), humanHidden], "NOT OBSERVED");
  if (auditRequirement(summaries.get("03-homepage-motion"), "hidden/visible behavior").status !== hidden) throw new Error("R1 independent hidden/visible taxonomy contradicts human evidence");
  if (summaries.get("11-physical-device").requirements.some(({ status }) => status !== ledger.status)) throw new Error("R1 independent physical-device taxonomy contradicts human evidence");
  return { path: EVIDENCE_ASSEMBLY_INVENTORY_PATH, schema: inventory.schema, status: "PASS", byteSize: inventoryBytes.length, sha256: sha256(inventoryBytes), inventoryEntries: inventory.inventoryExcludingSelf.length };
}

function aggregateHumanStatuses(statuses) {
  if (statuses.includes("FAIL")) return "FAIL";
  if (statuses.every((status) => status === "PASS")) return "PASS";
  return "PENDING HUMAN REVIEW";
}

function parseHumanTimestamp(value) {
  if (typeof value !== "string" || value.trim() !== value) return null;
  const parts = value.split(":");
  if (parts.length !== 2 && parts.length !== 3) return null;
  if (!parts.every((part, index) => index === parts.length - 1 ? /^\d{2}(?:\.\d{1,3})?$/.test(part) : /^\d{2}$/.test(part))) return null;
  const values = parts.map(Number);
  if (values.at(-1) < 0 || values.at(-1) >= 60 || !Number.isInteger(values.at(-2)) || values.at(-2) < 0 || values.at(-2) >= 60) return null;
  if (parts.length === 3 && (!Number.isInteger(values[0]) || values[0] < 0)) return null;
  return value;
}

function parseHumanFrame(value) {
  if (Number.isSafeInteger(value) && value > 0) return value;
  return typeof value === "string" && /^F[1-9]\d*$/.test(value) ? value : null;
}

function humanTimestampSeconds(value) {
  const normalized = parseHumanTimestamp(value);
  if (normalized === null) return null;
  const parts = normalized.split(":").map(Number);
  return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function humanFrameNumber(value) {
  const normalized = parseHumanFrame(value);
  if (normalized === null) return null;
  return typeof normalized === "number" ? normalized : Number(normalized.slice(1));
}

function humanStatusText(texts, status, label) {
  const pending = /\b(?:pending|not[ -]?reviewed|not[ -]?inspected|unreviewed|limitation|not[ -]?observed|synthetic|simulat(?:ed|ion))\b/i;
  const failure = /\b(?:fail|failed|failure)\b/i;
  const pass = /\b(?:pass|passed)\b/i;
  for (const text of texts.filter((value) => typeof value === "string")) {
    if (status === "PASS" && (pending.test(text) || failure.test(text))) throw new Error(`${label} PASS text contradicts its status`);
    if (status === "FAIL" && pending.test(text)) throw new Error(`${label} FAIL text contains pending/not-reviewed/limitation language`);
    if (status === "PENDING HUMAN REVIEW" && (failure.test(text) || pass.test(text)) && !pending.test(text)) throw new Error(`${label} pending text contradicts its status`);
  }
}

function validateFailureReferences(record, failedChecks, label) {
  if (!Array.isArray(record.failureReferences)) throw new Error(`${label} failureReferences must be an array`);
  const references = record.failureReferences.map((reference) => {
    if (!reference || typeof reference !== "object" || Array.isArray(reference) || typeof reference.check !== "string" || !reference.check.trim()
      || typeof reference.observation !== "string" || !reference.observation.trim()) throw new Error(`${label} failure reference is incomplete`);
    const timestamp = reference.timestamp === null || reference.timestamp === undefined ? null : parseHumanTimestamp(reference.timestamp);
    const frame = reference.frame === null || reference.frame === undefined ? null : parseHumanFrame(reference.frame);
    if ((reference.timestamp !== null && reference.timestamp !== undefined && timestamp === null)
      || (reference.frame !== null && reference.frame !== undefined && frame === null) || (timestamp === null && frame === null)) {
      throw new Error(`${label} failure reference requires a check and timestamp or frame`);
    }
    return { check: reference.check, timestamp, frame, observation: reference.observation };
  });
  if (record.status === "FAIL" && !references.length) throw new Error(`${label} FAIL requires a timestamp or frame reference`);
  if (record.status !== "FAIL" && references.length) throw new Error(`${label} non-FAIL cannot contain failure references`);
  for (const check of failedChecks) if (!references.some((reference) => reference.check === check)) throw new Error(`${label} false check ${check} lacks a matching failure reference`);
  if (failedChecks.length && references.some(({ check }) => !failedChecks.includes(check))) throw new Error(`${label} failure reference identifies a check that is not false`);
  return references;
}

function validateHumanObservationSemantics(record, expectedChecks, references, label) {
  const observations = record.observations;
  if (!Array.isArray(observations) || observations.length !== expectedChecks.size) throw new Error(`${label} observations must bind every required check exactly once`);
  const ids = new Set();
  for (const observation of observations) {
    if (!observation || typeof observation !== "object" || Array.isArray(observation)
      || stableJson(Object.keys(observation).sort(lexicalCompare)) !== stableJson(["checkId", "frame", "result", "status", "timestamp"])) {
      throw new Error(`${label} observation must contain exactly checkId, status, result, timestamp and frame`);
    }
    if (typeof observation.checkId !== "string" || !observation.checkId.trim() || ids.has(observation.checkId)
      || !["PASS", "FAIL", "PENDING HUMAN REVIEW"].includes(observation.status)
      || typeof observation.result !== "string" || !observation.result.trim()) throw new Error(`${label} structured observation is incomplete or duplicated`);
    ids.add(observation.checkId);
    const expected = expectedChecks.get(observation.checkId);
    if (!expected || observation.status !== expected) throw new Error(`${label} observation ${observation.checkId} status contradicts its check/result`);
    const timestamp = observation.timestamp === null ? null : parseHumanTimestamp(observation.timestamp);
    const frame = observation.frame === null ? null : parseHumanFrame(observation.frame);
    if ((observation.timestamp !== null && timestamp === null) || (observation.frame !== null && frame === null)) throw new Error(`${label} observation ${observation.checkId} location differs`);
    if (observation.status === "FAIL") {
      if (timestamp === null && frame === null) throw new Error(`${label} failed observation ${observation.checkId} requires a timestamp or frame`);
      if (!references.some((reference) => reference.check === observation.checkId && reference.timestamp === timestamp && reference.frame === frame)) throw new Error(`${label} failed observation ${observation.checkId} lacks a matching failure reference`);
    } else if (timestamp !== null || frame !== null) throw new Error(`${label} non-FAIL observation ${observation.checkId} cannot carry a failure location`);
    humanStatusText([observation.result], observation.status, `${label} observation ${observation.checkId}`);
  }
  if ([...expectedChecks.keys()].some((check) => !ids.has(check))) throw new Error(`${label} observations must bind every required check exactly once`);
  humanStatusText([record.device, record.os, record.browser, record.observedResult, ...record.testSteps], record.status, label);
}

function validateHumanMediaAuthority(record, references, label) {
  const media = record.mediaValidation;
  if (!media || typeof media !== "object" || Array.isArray(media)
    || stableJson(Object.keys(media).sort(lexicalCompare)) !== stableJson(["container", "durationSeconds", "sampleCount", "videoTrackCount"])
    || media.container !== "ISO-BMFF MP4" || !Number.isFinite(media.durationSeconds) || media.durationSeconds <= 0
    || !Number.isSafeInteger(media.sampleCount) || media.sampleCount <= 0
    || !Number.isSafeInteger(media.videoTrackCount) || media.videoTrackCount <= 0) {
    throw new Error(`${label} mediaValidation is incomplete`);
  }
  if (record.status === "PENDING HUMAN REVIEW") {
    if (record.reviewedSha256 !== null || record.reviewedByteSize !== null) throw new Error(`${label} pending review must not claim a reviewed byte identity`);
  } else if (!HASH64.test(record.reviewedSha256 ?? "") || !Number.isSafeInteger(record.reviewedByteSize) || record.reviewedByteSize <= 0
    || record.reviewedSha256 !== record.sha256 || record.reviewedByteSize !== record.byteSize) {
    throw new Error(`${label} review is not bound to the supplied recording bytes`);
  }
  for (const reference of references) {
    const seconds = reference.timestamp === null ? null : humanTimestampSeconds(reference.timestamp);
    const frame = reference.frame === null ? null : humanFrameNumber(reference.frame);
    if (seconds !== null && seconds > media.durationSeconds + 0.001) throw new Error(`${label} failure timestamp exceeds the recording duration`);
    if (frame !== null && frame > media.sampleCount) throw new Error(`${label} failure frame exceeds the recording sample count`);
  }
  return media;
}

function validateR1HumanLedgerSemantics(ledger) {
  if (typeof ledger.createdAt !== "string" || !Number.isFinite(Date.parse(ledger.createdAt)) || new Date(ledger.createdAt).toISOString() !== ledger.createdAt) {
    throw new Error("R1 archive human-evidence ledger createdAt is not canonical");
  }
  exactJson(ledger.policy, { filePresenceIsPass: false, machineRecordingSubstitutionAllowed: false, failRequiresTimestampOrFrame: true, allFourFilesRequiredBeforePackaging: true }, "R1 archive human-evidence ledger policy");
  for (const record of ledger.entries) {
    const label = `R1 archive human recording ${record?.filename ?? "unknown"}`;
    if (!R1_HUMAN_STATUSES.includes(record?.status)
      || record.evidenceClass !== "PHYSICAL HUMAN RECORDING"
      || typeof record.device !== "string" || !record.device.trim()
      || typeof record.os !== "string" || !record.os.trim()
      || !Object.hasOwn(record, "browserVersion") || (record.browserVersion !== null && (typeof record.browserVersion !== "string" || !record.browserVersion.trim()))
      || (record.browser !== null && record.browser !== undefined && (typeof record.browser !== "string" || !record.browser.trim()))
      || !Array.isArray(record.testSteps) || !record.testSteps.length || record.testSteps.some((step) => typeof step !== "string" || !step.trim())
      || !Array.isArray(record.observations) || !record.observations.length || record.observations.some((observation) => !observation || typeof observation !== "object" || Array.isArray(observation))
      || typeof record.observedResult !== "string" || !record.observedResult.trim()) {
      throw new Error(`${label} review metadata is incomplete`);
    }
    if (record.status !== "PENDING HUMAN REVIEW" && record.filename.startsWith("iphone-safari-")
      && (!/\biphone\b/i.test(record.device) || /\b(?:desktop|pc|android|simulat)/i.test(record.device)
        || !/\bios\b/i.test(record.os) || /\b(?:windows|android|macos)\b/i.test(record.os)
        || !/\bsafari\b/i.test(record.browser ?? "") || /\b(?:chrome|firefox|edge)\b/i.test(record.browser ?? ""))) {
      throw new Error(`${label} device/OS must identify iPhone and iOS and browser must identify Safari`);
    }
    if (record.status !== "PENDING HUMAN REVIEW" && record.filename === "physical-scroll-input.mp4"
      && (!/\bphysical\b/i.test(record.device) || !/\b(?:mouse|trackpad)\b/i.test(record.device) || /\b(?:simulat|proxy|virtual|generic)\w*\b/i.test(record.device))) {
      throw new Error(`${label} must identify physical mouse or trackpad input`);
    }
    if (record.status !== "PENDING HUMAN REVIEW" && record.filename === "chrome-200-percent.mp4"
      && (!/\b(?:desktop|laptop|pc|computer)\b/i.test(record.device) || /\b(?:mobile|iphone|simulat|proxy)\w*\b/i.test(record.device)
        || !/\bchrome\b/i.test(record.browser ?? "") || /\b(?:safari|firefox|edge)\b/i.test(record.browser ?? ""))) {
      throw new Error(`${label} must identify a physical desktop/laptop and Chrome`);
    }
    if (record.filename.startsWith("iphone-safari-") && !/\bsafari\b/i.test(record.browser ?? "")) throw new Error(`${label} browser must identify Safari`);
    if (record.filename === "chrome-200-percent.mp4" && !/\bchrome\b/i.test(record.browser ?? "")) throw new Error(`${label} browser must identify Chrome`);
    let failedChecks = [];
    const expectedObservationChecks = new Map();
    const requiredChecks = R1_DEVICE_REVIEW_CHECKS[record.filename];
    const hasChecks = record.checks && typeof record.checks === "object" && !Array.isArray(record.checks);
    if (requiredChecks) {
      if (!hasChecks || stableJson(Object.keys(record.checks).sort(lexicalCompare)) !== stableJson([...requiredChecks].sort(lexicalCompare))) throw new Error(`${label} physical checks differ`);
      const results = requiredChecks.map((check) => record.checks[check]);
      if (results.some((value) => typeof value !== "boolean" && !(record.status === "PENDING HUMAN REVIEW" && value === null))) throw new Error(`${label} physical checks are incomplete`);
      if (record.status === "PASS" && results.some((value) => value !== true)) throw new Error(`${label} PASS contains a failed check`);
      if (record.status === "FAIL" && results.every((value) => value !== false)) throw new Error(`${label} FAIL contains no failed check`);
      if (record.status !== "FAIL" && results.some((value) => value === false)) throw new Error(`${label} contains a false check without FAIL status`);
      if (record.status === "PENDING HUMAN REVIEW" && results.some((value) => value !== null)) throw new Error(`${label} pending review requires every required check to be null`);
      failedChecks = requiredChecks.filter((check) => record.checks[check] === false);
      for (const check of requiredChecks) expectedObservationChecks.set(check, record.checks[check] === false ? "FAIL" : record.checks[check] === null ? "PENDING HUMAN REVIEW" : "PASS");
    }
    const routeReferences = [];
    if (record.filename === "chrome-200-percent.mp4") {
      if (record.status === "PENDING HUMAN REVIEW") {
        if (record.genuineBrowserZoom !== null || record.zoomPercent !== null || record.proxy !== null) throw new Error(`${label} pending 200% authority must remain null`);
      } else if (record.genuineBrowserZoom !== true || record.zoomPercent !== 200 || record.proxy !== false) throw new Error(`${label} genuine 200% review is incomplete`);
      if (!Array.isArray(record.routeOutcomes) || record.routeOutcomes.length !== R1_ZOOM_ROUTES.length) throw new Error(`${label} genuine 200% route review differs`);
        const routes = new Set();
        for (const outcome of record.routeOutcomes) {
          if (!R1_ZOOM_ROUTES.includes(outcome?.route) || routes.has(outcome.route) || !R1_HUMAN_STATUSES.includes(outcome.status)
            || !outcome.checks || stableJson(Object.keys(outcome.checks).sort(lexicalCompare)) !== stableJson([...R1_ZOOM_ROUTE_CHECKS].sort(lexicalCompare))
            || R1_ZOOM_ROUTE_CHECKS.some((check) => typeof outcome.checks[check] !== "boolean" && !(outcome.status === "PENDING HUMAN REVIEW" && outcome.checks[check] === null))) throw new Error(`${label} genuine 200% route review differs`);
          routes.add(outcome.route);
          const routeFailures = R1_ZOOM_ROUTE_CHECKS.filter((check) => outcome.checks[check] === false);
          if (outcome.status === "PASS" && routeFailures.length) throw new Error(`${label} route PASS contains a failed check`);
          if (outcome.status === "FAIL" && !routeFailures.length) throw new Error(`${label} route FAIL contains no failed check`);
          if (outcome.status !== "FAIL" && routeFailures.length) throw new Error(`${label} route contains a false check without FAIL status`);
          if (record.status === "PENDING HUMAN REVIEW" && (outcome.status !== "PENDING HUMAN REVIEW" || R1_ZOOM_ROUTE_CHECKS.some((check) => outcome.checks[check] !== null))) throw new Error(`${label} pending review requires all routes and checks to remain pending/null`);
          const references = validateFailureReferences(outcome, routeFailures, `${label} route ${outcome.route}`);
          routeReferences.push(...references.map((reference) => ({ ...reference, check: `${outcome.route}:${reference.check}` })));
          for (const check of R1_ZOOM_ROUTE_CHECKS) expectedObservationChecks.set(`${outcome.route}:${check}`, outcome.checks[check] === false ? "FAIL" : outcome.checks[check] === null ? "PENDING HUMAN REVIEW" : "PASS");
        }
        if (stableJson([...routes].sort(lexicalCompare)) !== stableJson([...R1_ZOOM_ROUTES].sort(lexicalCompare))) throw new Error(`${label} genuine 200% route inventory differs`);
        if (record.status !== aggregateHumanStatuses(record.routeOutcomes.map(({ status }) => status))) throw new Error(`${label} status differs from route outcomes`);
      failedChecks = [];
    }
    const references = validateFailureReferences(record, failedChecks, label);
    validateHumanObservationSemantics(record, expectedObservationChecks, [...references, ...routeReferences], label);
    validateHumanMediaAuthority(record, [...references, ...routeReferences], label);
  }
  const expectedStatus = aggregateHumanStatuses(ledger.entries.map(({ status }) => status));
  if (ledger.status !== expectedStatus) throw new Error(`R1 archive human-evidence ledger status must be ${expectedStatus}`);
}

export function validateR1HumanEvidenceEntries(entries) {
  const ledgerBytes = entries.get(R1_HUMAN_LEDGER_PATH);
  if (!ledgerBytes) throw new Error(`R1 archive requires the human-evidence ledger: ${R1_HUMAN_LEDGER_PATH}`);
  const wrapper = parseJson(ledgerBytes, R1_HUMAN_LEDGER_PATH);
  const ledger = wrapper?.payload;
  const permittedStatuses = new Set(R1_HUMAN_STATUSES);
  if (wrapper?.schema !== "quantum-hub.phase-6.final-evidence-assembly.v1.distilled-json"
    || wrapper.role !== "physical-device-result"
    || wrapper.selection !== null
    || !permittedStatuses.has(wrapper.status)
    || !wrapper.source || !HASH64.test(wrapper.source.sha256 ?? "")
    || ledger?.schema !== R1_HUMAN_EVIDENCE_SCHEMA
    || ledger.evidenceClass !== "HUMAN DEVICE EVIDENCE"
    || ledger.rootExists !== true
    || ledger.status !== wrapper.status
    || !Array.isArray(ledger.requiredFilenames)
    || !Array.isArray(ledger.missingFilenames) || ledger.missingFilenames.length
    || !Array.isArray(ledger.entries)) {
    throw new Error("R1 archive human-evidence ledger authority differs");
  }
  const expectedFilenames = [...R1_REQUIRED_HUMAN_RECORDINGS].sort(lexicalCompare);
  if (stableJson([...ledger.requiredFilenames].sort(lexicalCompare)) !== stableJson(expectedFilenames)
    || stableJson(ledger.entries.map(({ filename }) => filename).sort(lexicalCompare)) !== stableJson(expectedFilenames)) {
    throw new Error("R1 archive human-evidence ledger omits or duplicates a required recording");
  }
  validateR1HumanLedgerSemantics(ledger);
  const physicalVideoPaths = [...entries.keys()]
    .filter((relativePath) => relativePath.startsWith("11-physical-device/") && path.posix.extname(relativePath).toLowerCase() === ".mp4")
    .sort(lexicalCompare);
  const expectedPaths = expectedFilenames.map((filename) => `11-physical-device/recordings/${filename}`).sort(lexicalCompare);
  if (stableJson(physicalVideoPaths) !== stableJson(expectedPaths)) throw new Error("R1 archive physical recording inventory differs");
  const recordings = ledger.entries.map((record) => {
    const recordingPath = `11-physical-device/recordings/${record.filename}`;
    const bytes = entries.get(recordingPath);
    if (!bytes || record.evidenceClass !== "PHYSICAL HUMAN RECORDING" || !permittedStatuses.has(record.status)
      || !Number.isSafeInteger(record.byteSize) || record.byteSize <= 0 || record.byteSize !== bytes.length
      || !HASH64.test(record.sha256 ?? "") || record.sha256 !== sha256(bytes)) {
      throw new Error(`R1 archive human recording is not hash/size/status bound: ${record.filename}`);
    }
    const mediaValidation = validateIsoBmffMp4(bytes, record.filename);
    if (stableJson(record.mediaValidation) !== stableJson(mediaValidation)) throw new Error(`R1 archive human recording media validation is not bound to the supplied bytes: ${record.filename}`);
    return { filename: record.filename, path: recordingPath, status: record.status, byteSize: bytes.length, sha256: record.sha256, mediaValidation };
  }).sort((left, right) => lexicalCompare(left.filename, right.filename));
  return {
    status: ledger.status,
    ledger: { path: R1_HUMAN_LEDGER_PATH, byteSize: ledgerBytes.length, sha256: sha256(ledgerBytes), schema: R1_HUMAN_EVIDENCE_SCHEMA },
    recordings,
  };
}

function kindFor(relativePath) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  return "document";
}

function normalizePreviewUrl(value, label) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`${label} must be an absolute HTTPS URL`); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash || parsed.pathname !== "/" || !parsed.hostname) {
    throw new Error(`${label} must be a credential-free HTTPS origin root without port, query, or fragment`);
  }
  return parsed.href;
}

export function validateExpected(input) {
  const expected = { ...input };
  const profile = authorityProfileById(expected.authorityProfile ?? "phase6");
  expected.authorityProfile = profile.id;
  if (!HASH40.test(expected.expectedHead ?? "")) throw new Error("--expected-head must be a 40-character lowercase Git SHA");
  if ([profile.parent, FROZEN_MAIN_SHA].includes(expected.expectedHead)) throw new Error(`--expected-head must identify the new ${profile.title} final commit`);
  if (expected.branch !== profile.branch) throw new Error(`--branch must be exactly ${profile.branch}`);
  if (typeof expected.deploymentId !== "string" || !CLOUDFLARE_UUID.test(expected.deploymentId)) throw new Error("--deployment-id must be a lowercase Cloudflare deployment UUID");
  expected.immutableUrl = normalizePreviewUrl(expected.immutableUrl, "--immutable-url");
  expected.branchUrl = normalizePreviewUrl(expected.branchUrl, "--branch-url");
  const requiredImmutable = `https://${expected.deploymentId.slice(0, 8)}.${REQUIRED_CLOUDFLARE_PROJECT}.pages.dev/`;
  if (expected.immutableUrl !== requiredImmutable) throw new Error(`--immutable-url must be exactly ${requiredImmutable}`);
  if (expected.branchUrl !== profile.branchUrl) throw new Error(`--branch-url must be exactly ${profile.branchUrl}`);
  if (profile.id === "phase6-r1" && !/^[1-9]\d*$/.test(expected.deploymentCheckRunId ?? "")) {
    throw new Error("--deployment-check-run-id must be a nonzero decimal Cloudflare check-run ID for Phase 6-R1");
  }
  return expected;
}

function expectedProvenance(expected) {
  const profile = authorityProfileById(expected.authorityProfile);
  return {
    ...(profile.id === "phase6-r1" ? { authorityProfile: profile.id } : {}),
    branch: expected.branch,
    expectedHead: expected.expectedHead,
    observedHead: expected.expectedHead,
    [profile.parentField]: profile.parent,
    expectedMain: FROZEN_MAIN_SHA,
    deployment: {
      id: expected.deploymentId,
      immutableUrl: expected.immutableUrl,
      branchUrl: expected.branchUrl,
      ...(profile.id === "phase6-r1" ? { checkRunId: expected.deploymentCheckRunId } : {}),
    },
  };
}

function validateTimestamp(value, label) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error(`${label} is not a canonical ISO timestamp`);
}

function validateTopology(paths) {
  const counts = Object.fromEntries(TOPOLOGY_SECTIONS.map((section) => [section, 0]));
  for (const relativePath of paths) {
    assertAllowedEntry(relativePath);
    if (relativePath !== IN_ARCHIVE_MANIFEST) counts[sectionFor(relativePath)] += 1;
  }
  for (const section of TOPOLOGY_SECTIONS) if (!counts[section]) throw new Error(`Phase 6 package topology omits ${section}`);
  return counts;
}

function validateGitProvenance(entries, expected) {
  const profile = authorityProfileById(expected.authorityProfile);
  const relativePath = "00-provenance/git-provenance.json";
  const document = parseJson(entries.get(relativePath), relativePath);
  if (document.schema !== `${profile.packageSchema}.git-provenance` || document.status !== "PASS" || document.branch !== profile.branch || document.head !== expected.expectedHead || document.cleanTree !== true) throw new Error("Git provenance differs from expected authority");
  if (!Array.isArray(document.directParents) || document.directParents.length !== 1 || !HASH40.test(document.directParents[0])) throw new Error("Git provenance direct-parent ledger differs");
  if (document[profile.parentField] !== profile.parent || document[profile.ancestorField] !== true || document.headMergedIntoMain !== false) throw new Error("Git provenance required-parent ancestry differs");
  exactJson(document.localMain, { ref: "refs/heads/main", head: FROZEN_MAIN_SHA }, "Git provenance local main");
  exactJson(document.originMain, { ref: "refs/remotes/origin/main", head: FROZEN_MAIN_SHA }, "Git provenance origin/main");
  exactJson(document.liveMain, { ref: "refs/heads/main", head: FROZEN_MAIN_SHA }, "Git provenance live main");
  exactJson(document.upstream, { ref: `origin/${profile.branch}`, head: expected.expectedHead, liveHead: expected.expectedHead, parity: true }, "Git provenance upstream");
  exactJson(document.remote, { name: "origin", url: REQUIRED_REMOTE_URL, repository: REQUIRED_REPOSITORY }, "Git provenance origin");
  const actualReports = [...(document.trackedReports ?? [])].sort(lexicalCompare);
  const expectedReports = reportSpecsForProfile(profile).map(({ source }) => source).sort(lexicalCompare);
  exactJson(actualReports, expectedReports, "tracked Phase 6 report list");
  return document;
}

function validateDeploymentVerification(entries, expected) {
  const profile = authorityProfileById(expected.authorityProfile);
  const bytes = entries.get(DEPLOYMENT_VERIFICATION_PATH);
  if (!bytes) throw new Error(`archive omits required deployment authority: ${DEPLOYMENT_VERIFICATION_PATH}`);
  const document = parseJson(bytes, DEPLOYMENT_VERIFICATION_PATH);
  if (document.schema !== profile.deploymentSchema || document.status !== "PASS") throw new Error("deployment verification schema/status differs");
  exactJson(document.inputs, {
    expectedHead: expected.expectedHead,
    [profile.parentField]: profile.parent,
    expectedMain: FROZEN_MAIN_SHA,
    repository: REQUIRED_REPOSITORY,
    branch: profile.branch,
    deploymentId: expected.deploymentId,
    immutableUrl: expected.immutableUrl,
    branchUrl: expected.branchUrl,
    localDist: "dist",
  }, "deployment verification inputs");

  const repository = document.repository;
  const repositoryData = repository?.data;
  if (repository?.status !== "PASS" || !repositoryData || (profile.id === "phase6-r1" && repositoryData.status !== "PASS") || repositoryData.repository !== REQUIRED_REPOSITORY
    || repositoryData.branch !== profile.branch || repositoryData.head !== expected.expectedHead
    || repositoryData[profile.parentField] !== profile.parent || repositoryData.cleanTree !== true) {
    throw new Error("deployment verification repository authority differs");
  }
  const history = repositoryData.history;
  if (!Array.isArray(history) || history.length < 1) throw new Error(`deployment verification omits the ${profile.title} linear history`);
  for (let index = 0; index < history.length; index += 1) {
    const record = history[index];
    const requiredParent = index === 0 ? profile.parent : history[index - 1]?.commit;
    if (!HASH40.test(record?.commit ?? "") || !Array.isArray(record?.parents) || record.parents.length !== 1
      || record.parents[0] !== requiredParent || typeof record.subject !== "string" || !record.subject) {
      throw new Error(`deployment verification history entry ${index + 1} is not an exact linear descendant of the required parent`);
    }
  }
  if (history.at(-1).commit !== expected.expectedHead || repositoryData.directParent !== history.at(-1).parents[0]) {
    throw new Error("deployment verification history does not terminate at the expected Phase 6 HEAD");
  }
  if (profile.id === "phase6-r1") {
    exactJson(repositoryData.main, { local: FROZEN_MAIN_SHA, upstream: FROZEN_MAIN_SHA, live: FROZEN_MAIN_SHA, modifiedOrMerged: false }, "deployment verification R1 main");
    exactJson(repositoryData.upstream, { ref: `origin/${profile.branch}`, head: expected.expectedHead, live: expected.expectedHead, parity: true }, "deployment verification R1 upstream");
    exactJson(repositoryData.productionSourceDiff, [], "deployment verification R1 production-source diff");
    exactJson(repositoryData.productionDiffScope, R1_PRODUCTION_DIFF_SCOPE, "deployment verification R1 production-diff scope");
    exactJson(repositoryData.packageScriptChanges, R1_PACKAGE_SCRIPT_CHANGES, "deployment verification R1 package-script changes");
  } else {
    exactJson(repositoryData.main, { branch: "main", headSha: FROZEN_MAIN_SHA, frozenAt: FROZEN_MAIN_SHA, containsPhase6Head: false }, "deployment verification local main");
    exactJson(repositoryData.upstream, { ref: `origin/${profile.branch}`, headSha: expected.expectedHead, parity: true }, "deployment verification upstream");
    exactJson(repositoryData.liveRemote, {
      branchRef: `refs/heads/${profile.branch}`,
      branchHeadSha: expected.expectedHead,
      mainRef: "refs/heads/main",
      mainHeadSha: FROZEN_MAIN_SHA,
      parity: true,
    }, "deployment verification live remote");
  }

  const deploymentData = document.deployment?.data;
  if (document.deployment?.status !== "PASS" || !deploymentData || deploymentData.status !== "PASS"
    || deploymentData.authoritySource !== "CLOUDFLARE_PAGES_SIGNED_GITHUB_CHECK"
    || deploymentData.deploymentId !== expected.deploymentId || deploymentData.immutableUrl !== expected.immutableUrl
    || deploymentData.branchUrl !== expected.branchUrl || deploymentData.branch !== profile.branch
    || deploymentData.commitHash !== expected.expectedHead || deploymentData.environment !== "preview") {
    throw new Error("deployment verification signed Cloudflare authority differs");
  }
  if (typeof deploymentData.completedAt !== "string" || !Number.isFinite(Date.parse(deploymentData.completedAt))) {
    throw new Error("deployment verification completedAt is not a valid timestamp");
  }
  if (profile.id === "phase6-r1" && deploymentData.appSlug !== "cloudflare-workers-and-pages") throw new Error("deployment verification R1 Cloudflare app authority differs");
  if (profile.id === "phase6-r1") {
    auditR1RawDeploymentAuthority(document, {
      expectedHead: expected.expectedHead,
      deploymentId: expected.deploymentId,
      deploymentCheckRunId: expected.deploymentCheckRunId,
      immutableUrl: expected.immutableUrl,
      branchUrl: expected.branchUrl,
    }, "R1 independent deployment verification");
  }
  if (document.dist?.status !== "PASS" || document.origins?.immutable?.status !== "PASS" || document.origins?.branch?.status !== "PASS") {
    throw new Error("deployment verification dist/origin parity did not pass");
  }
  if (document.origins.immutable.data?.origin !== expected.immutableUrl || document.origins.immutable.data?.status !== "PASS"
    || document.origins.branch.data?.origin !== expected.branchUrl || document.origins.branch.data?.status !== "PASS") {
    throw new Error("deployment verification origin identities differ");
  }
  exactJson(document.checks, profile.deploymentChecks, "deployment verification checks");
  exactJson(document.failures, [], "deployment verification failures");
  return {
    document,
    binding: { path: DEPLOYMENT_VERIFICATION_PATH, schema: profile.deploymentSchema, status: "PASS", byteSize: bytes.length, sha256: sha256(bytes) },
  };
}

function assertGatePolicy(document, label) {
  exactJson(document.humanReviewGates, HUMAN_REVIEW_GATES, `${label} human-review gates`);
  exactJson(document.authorization, AUTHORIZATION, `${label} authorization`);
}

export function auditBuffers({ archiveBytes: archiveInput, detachedBytes: detachedInput, archiveFilename, expected: expectedInput, maximumBytes = MAX_ARCHIVE_BYTES }) {
  const expected = validateExpected(expectedInput);
  const profile = authorityProfileById(expected.authorityProfile);
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0 || maximumBytes > MAX_ARCHIVE_BYTES) throw new Error("audit maximum-byte boundary is invalid");
  if (archiveFilename !== profile.archiveFilename) throw new Error(`archive filename must be exactly ${profile.archiveFilename}`);
  const archiveBytes = Buffer.from(archiveInput);
  const detachedBytes = Buffer.from(detachedInput);
  const parsed = parseStoredZip(archiveBytes, maximumBytes);
  const { entries } = parsed;
  const manifestBytes = entries.get(IN_ARCHIVE_MANIFEST);
  if (!manifestBytes) throw new Error("archive omits MANIFEST.json");
  for (const [relativePath, bytes] of entries) assertNoPrivateText(bytes, relativePath);
  assertNoPrivateText(detachedBytes, "detached-manifest.json");
  const manifest = parseJson(manifestBytes, IN_ARCHIVE_MANIFEST);
  const detached = parseJson(detachedBytes, "detached-manifest.json");
  if (manifest.schema !== profile.packageSchema || manifest.status !== "PASS" || manifest.privacyAndSecrets !== "PASS") throw new Error("in-archive manifest authority differs");
  if (detached.schema !== profile.detachedSchema || detached.status !== "PASS") throw new Error("detached manifest authority differs");
  validateTimestamp(manifest.generatedAt, "manifest generatedAt");
  if (detached.generatedAt !== manifest.generatedAt) throw new Error("detached/embedded generation timestamps differ");
  exactJson(manifest.provenance, expectedProvenance(expected), "manifest provenance");
  exactJson(detached.provenance, manifest.provenance, "detached provenance");
  exactJson(manifest.topology, TOPOLOGY_SECTIONS, "manifest topology");
  assertGatePolicy(manifest, "manifest");

  if (detached.archive?.filename !== archiveFilename || detached.archive?.byteSize !== archiveBytes.length || detached.archive?.sha256 !== sha256(archiveBytes) || detached.archive?.entries !== entries.size || detached.archive?.canonicalUniqueStoredZip !== true) throw new Error("detached archive binding differs");
  if (detached.inArchiveManifest?.path !== IN_ARCHIVE_MANIFEST || detached.inArchiveManifest?.byteSize !== manifestBytes.length || detached.inArchiveManifest?.sha256 !== sha256(manifestBytes) || detached.inArchiveManifest?.schema !== profile.packageSchema) throw new Error("detached in-archive manifest binding differs");

  if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error("manifest omits its file ledger");
  const actualPaths = [...entries.keys()].filter((relativePath) => relativePath !== IN_ARCHIVE_MANIFEST).sort(lexicalCompare);
  const ledgerPaths = [];
  const payloadHashes = new Map();
  let payloadBytes = 0;
  let previous = null;
  for (const record of manifest.files) {
    const relativePath = record?.path;
    assertAllowedEntry(relativePath);
    if (relativePath === IN_ARCHIVE_MANIFEST || (previous !== null && lexicalCompare(previous, relativePath) >= 0)) throw new Error("manifest file ledger paths are duplicate or not canonical order");
    const bytes = entries.get(relativePath);
    if (!bytes || !Number.isSafeInteger(record.byteSize) || record.byteSize !== bytes.length || !HASH64.test(record.sha256 ?? "") || record.sha256 !== sha256(bytes)) throw new Error(`manifest hash/size differs: ${relativePath}`);
    if (record.kind !== kindFor(relativePath) || record.section !== sectionFor(relativePath)) throw new Error(`manifest role differs: ${relativePath}`);
    if (payloadHashes.has(record.sha256)) throw new Error(`duplicate package payload: ${payloadHashes.get(record.sha256)} and ${relativePath}`);
    payloadHashes.set(record.sha256, relativePath);
    ledgerPaths.push(relativePath);
    payloadBytes += bytes.length;
    previous = relativePath;
  }
  exactJson(ledgerPaths, actualPaths, "manifest/archive file paths");
  const counts = validateTopology(actualPaths);
  const expectedInventory = {
    payloadFiles: actualPaths.length,
    payloadBytes,
    archiveEntries: entries.size,
    sections: counts,
    duplicatePaths: 0,
    duplicatePayloads: 0,
    rawFrames: 0,
    caches: 0,
    nestedArchives: 0,
    maximumArchiveBytes: maximumBytes,
  };
  exactJson(manifest.inventory, expectedInventory, "manifest inventory");

  for (const { archive } of reportSpecsForProfile(profile)) if (!entries.has(archive)) throw new Error(`archive omits tracked Phase 6 report: ${archive}`);
  const humanEvidence = profile.id === "phase6-r1" ? validateR1HumanEvidenceEntries(entries) : null;
  const evidenceAssembly = profile.id === "phase6-r1" ? validateR1CanonicalEvidenceEntries(entries) : null;
  if (humanEvidence) {
    exactJson(manifest.humanEvidence, humanEvidence, "manifest R1 human-evidence binding");
    exactJson(detached.humanEvidence, humanEvidence, "detached R1 human-evidence binding");
  }
  if (evidenceAssembly) {
    exactJson(manifest.evidenceAssembly, evidenceAssembly, "manifest R1 evidence-assembly binding");
    exactJson(detached.evidenceAssembly, evidenceAssembly, "detached R1 evidence-assembly binding");
  }
  const deploymentVerification = validateDeploymentVerification(entries, expected);
  exactJson(manifest.deploymentVerification, deploymentVerification.binding, "manifest deployment-verification binding");
  exactJson(detached.deploymentVerification, deploymentVerification.binding, "detached deployment-verification binding");
  const git = validateGitProvenance(entries, expected);
  if (git.directParents[0] !== deploymentVerification.document.repository.data.directParent) throw new Error("Git/deployment direct-parent authorities differ");
  const metadataPath = "13-package/package-metadata.json";
  const metadata = parseJson(entries.get(metadataPath), metadataPath);
  if (metadata.schema !== `${profile.packageSchema}.package-metadata` || metadata.status !== "PASS" || metadata.generatedAt !== manifest.generatedAt) throw new Error("package metadata authority differs");
  exactJson(metadata.provenance, manifest.provenance, "package metadata provenance");
  exactJson(metadata.deploymentVerification, deploymentVerification.binding, "package metadata deployment-verification binding");
  if (humanEvidence) exactJson(metadata.humanEvidence, humanEvidence, "package metadata R1 human-evidence binding");
  if (evidenceAssembly) exactJson(metadata.evidenceAssembly, evidenceAssembly, "package metadata R1 evidence-assembly binding");
  assertGatePolicy(metadata, "package metadata");
  const readme = entries.get("13-package/README.md")?.toString("utf8") ?? "";
  if (!/All six Phase 6 gates remain \*\*PENDING HUMAN REVIEW\*\*/.test(readme) || !/does not accept Phase 6, authorize Phase 7, or merge main/.test(readme)
    || (profile.id === "phase6-r1" && !/five tracked Phase 6-R1 reports/.test(readme))) throw new Error("package README review policy differs");

  return {
    manifest,
    detached,
    entries,
    git,
    deploymentVerification,
    ...(evidenceAssembly ? { evidenceAssembly } : {}),
    topology: counts,
    canonical: parsed.canonical,
    crcValidated: parsed.crcValidated,
    privacyAndSecrets: "PASS",
    reviewPolicy: "PASS",
  };
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = { archive: null, manifest: null, auditOutput: null, expectedHead: null, branch: null, deploymentId: null, deploymentCheckRunId: null, immutableUrl: null, branchUrl: null, expectedParentProcessId: null, authorityProfile: "phase6", selfTest: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => { const value = valueAfter(argv, index, argument); index += 1; return value; };
    if (argument === "--archive") options.archive = path.resolve(next());
    else if (argument === "--manifest") options.manifest = path.resolve(next());
    else if (argument === "--audit-output") options.auditOutput = path.resolve(next());
    else if (argument === "--expected-head") options.expectedHead = next().toLowerCase();
    else if (["--branch", "--expected-branch"].includes(argument)) options.branch = next();
    else if (["--deployment-id", "--expected-deployment-id", "--cloudflare-deployment-id"].includes(argument)) options.deploymentId = next().toLowerCase();
    else if (argument === "--deployment-check-run-id") options.deploymentCheckRunId = next();
    else if (["--immutable-url", "--observed-immutable-url"].includes(argument)) options.immutableUrl = next();
    else if (["--branch-url", "--observed-branch-url"].includes(argument)) options.branchUrl = next();
    else if (argument === "--expected-parent-process-id") options.expectedParentProcessId = Number(next());
    else if (argument === "--authority-profile") options.authorityProfile = next();
    else if (argument === "--self-test") options.selfTest = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`unknown option: ${argument}`);
  }
  return options;
}

function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function assertExternalPath(candidate, label) {
  if (typeof candidate !== "string" || !candidate) throw new Error(`${label} is required`);
  const resolved = path.resolve(candidate);
  if (resolved === path.parse(resolved).root || isWithin(ROOT, resolved)) throw new Error(`${label} must be outside the repository and filesystem root`);
  return resolved;
}

async function checkedInputFile(candidate, label) {
  const resolved = assertExternalPath(candidate, label);
  const canonical = await realpath(resolved);
  const info = await lstat(canonical);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${label} must be a regular file`);
  return canonical;
}

export async function auditArchive(input) {
  const expected = validateExpected(input);
  const profile = authorityProfileById(expected.authorityProfile);
  const archive = await checkedInputFile(input.archive, "--archive");
  const manifestPath = await checkedInputFile(input.manifest, "--manifest");
  const auditOutput = assertExternalPath(input.auditOutput, "--audit-output");
  const archiveStem = path.basename(archive, path.extname(archive));
  if (path.extname(archive).toLowerCase() !== ".zip" || path.dirname(archive) !== path.dirname(manifestPath) || path.basename(manifestPath) !== `${archiveStem}-manifest.json` || path.dirname(archive) !== path.dirname(auditOutput) || path.basename(auditOutput) !== `${archiveStem}-audit.json`) throw new Error("archive, detached manifest, and audit sibling names/locations differ");
  if (!Number.isSafeInteger(input.expectedParentProcessId) || input.expectedParentProcessId <= 0 || process.ppid !== input.expectedParentProcessId || process.pid === input.expectedParentProcessId) throw new Error("auditor is not the expected separate child process");
  try { await access(auditOutput); throw new Error(`audit output already exists: ${auditOutput}`); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  const [archiveBytes, detachedBytes] = await Promise.all([readFile(archive), readFile(manifestPath)]);
  const result = auditBuffers({ archiveBytes, detachedBytes, archiveFilename: path.basename(archive), expected });
  const generatedAt = new Date().toISOString();
  const report = {
    schema: profile.auditSchema,
    status: "PASS",
    generatedAt,
    auditor: { processId: process.pid, parentProcessId: process.ppid, separateProcess: true },
    archive: { filename: path.basename(archive), byteSize: archiveBytes.length, sha256: sha256(archiveBytes), entries: result.entries.size, canonicalUniqueStoredZip: true, crcValidated: true },
    detachedManifest: { filename: path.basename(manifestPath), byteSize: detachedBytes.length, sha256: sha256(detachedBytes), schema: profile.detachedSchema },
    inArchiveManifest: { path: IN_ARCHIVE_MANIFEST, byteSize: result.entries.get(IN_ARCHIVE_MANIFEST).length, sha256: sha256(result.entries.get(IN_ARCHIVE_MANIFEST)), schema: profile.packageSchema },
    deploymentVerification: result.deploymentVerification.binding,
    provenance: result.manifest.provenance,
    topology: { sections: [...TOPOLOGY_SECTIONS], counts: result.topology },
    checks: {
      canonicalStoredZip: "PASS",
      crc32: "PASS",
      manifestHashesAndSizes: "PASS",
      duplicatePathsAndPayloads: "PASS",
      topology: "PASS",
      privacyAndSecrets: "PASS",
      rawFramesCachesAndNestedArchives: "PASS",
      detachedBindings: "PASS",
      deploymentVerificationAuthority: "PASS",
      [profile.id === "phase6-r1" ? "exactBranchParentAndFrozenMain" : "exactBranchBaseAndFrozenMain"]: "PASS",
      cloudflarePreviewPolicy: "PASS",
      reviewPolicy: "PASS",
    },
    humanReviewGates: HUMAN_REVIEW_GATES,
    authorization: AUTHORIZATION,
  };
  const bytes = Buffer.from(stableJson(report));
  assertNoPrivateText(bytes, "independent-audit.json");
  await mkdir(path.dirname(auditOutput), { recursive: true });
  const temporary = `${auditOutput}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes, { flag: "wx" });
  try { await rename(temporary, auditOutput); }
  catch (error) { await unlink(temporary).catch(() => {}); throw error; }
  return { report, bytes, auditOutput };
}

export function selfTest(authorityProfile = "phase6") {
  const profile = authorityProfileById(authorityProfile);
  const entries = new Map([
    [IN_ARCHIVE_MANIFEST, Buffer.from("{}\n")],
    ["13-package/fixture.json", Buffer.from("{\"fixture\":true}\n")],
  ]);
  const archive = rebuildStoredZip(entries);
  const parsed = parseStoredZip(archive);
  if (parsed.entries.size !== entries.size || !parsed.canonical || !parsed.crcValidated) throw new Error("canonical parser self-test failed");
  return { schema: `${profile.auditSchema}.self-test`, status: "PASS", authorityProfile: profile.id, canonicalParser: true, crcValidated: true, maximumArchiveBytes: MAX_ARCHIVE_BYTES };
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/audit-phase6-human-review-package.mjs \\",
    "    [--authority-profile phase6|phase6-r1] \\",
    "    --archive <external-zip> --manifest <detached-manifest> --audit-output <fresh-audit-json> \\",
    "    --expected-head <sha40> --branch <profile-exact-branch> --deployment-id <Cloudflare-UUID> \\",
    "    [--deployment-check-run-id <nonzero-decimal-R1-only>] \\",
    `    --immutable-url https://<UUID-prefix>.${REQUIRED_CLOUDFLARE_PROJECT}.pages.dev/ \\`,
    "    --branch-url <profile-exact-alias> --expected-parent-process-id <pid>",
  ].join("\n"));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { printHelp(); return; }
  if (options.selfTest) { console.log(JSON.stringify(selfTest(options.authorityProfile), null, 2)); return; }
  const result = await auditArchive(options);
  const profile = authorityProfileById(options.authorityProfile);
  process.stdout.write(stableJson({
    schema: `${profile.auditSchema}.result`,
    status: result.report.status,
    archive: result.report.archive,
    detachedManifest: result.report.detachedManifest,
    audit: { filename: path.basename(result.auditOutput), byteSize: result.bytes.length, sha256: sha256(result.bytes) },
  }));
}

const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
