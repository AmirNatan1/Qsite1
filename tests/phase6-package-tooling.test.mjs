import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ACCEPTED_PHASE5B_SHA,
  AUTHORIZATION,
  DEPLOYMENT_VERIFICATION_PATH,
  DEPLOYMENT_VERIFICATION_SCHEMA,
  FROZEN_MAIN_SHA,
  HUMAN_REVIEW_GATES,
  MAX_ARCHIVE_BYTES,
  PACKAGE_SCHEMA,
  R1_AUDIT_SCHEMA,
  R1_CLOSURE_REPORT_SPEC,
  R1_DEPLOYMENT_VERIFICATION_SCHEMA,
  R1_HUMAN_EVIDENCE_SCHEMA,
  R1_HUMAN_LEDGER_PATH,
  R1_PACKAGE_SCHEMA,
  R1_REQUIRED_ARCHIVE_FILENAME,
  R1_REQUIRED_BRANCH,
  R1_REQUIRED_BRANCH_URL,
  R1_REQUIRED_PARENT,
  R1_REQUIRED_HUMAN_RECORDINGS,
  REPORT_SPECS,
  REQUIRED_ARCHIVE_FILENAME,
  REQUIRED_BRANCH,
  REQUIRED_BRANCH_URL,
  REQUIRED_REMOTE_URL,
  REQUIRED_REPOSITORY,
  TOPOLOGY_SECTIONS,
  assertAllowedEntry,
  assertExternalPath,
  assertFreshOutputSet,
  assertNoPrivateText,
  buildPackageArtifacts,
  collectPayloadEntries,
  createStoredZipBuffer,
  dryRunReport,
  parseArguments as parsePackageArguments,
  publishFreshSetAtomic,
  safeRelativePath,
  selfTest as packageSelfTest,
  sha256,
  stableJson,
  validateOptionShape,
  validateIsoBmffMp4 as validatePackageMp4,
  validateR1CanonicalEvidencePayload,
  validateR1HumanEvidencePayload,
} from "../scripts/package-phase6-human-review.mjs";
import {
  AUDIT_SCHEMA,
  auditBuffers,
  parseArguments as parseAuditArguments,
  parseStoredZip,
  validateIsoBmffMp4 as validateAuditMp4,
  validateR1CanonicalEvidenceEntries,
  validateR1HumanEvidenceEntries,
} from "../scripts/audit-phase6-human-review-package.mjs";

const execFileAsync = promisify(execFile);
const TEST_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUDITOR = path.join(TEST_ROOT, "scripts", "audit-phase6-human-review-package.mjs");
const PACKAGER = path.join(TEST_ROOT, "scripts", "package-phase6-human-review.mjs");
const GENERATED_AT = "2026-08-30T12:00:00.000Z";
const R1_MOTION_RECORDINGS = Object.freeze(["01-forward-physical-to-manifesto.mp4", "02-reverse-manifesto-to-f1.mp4", "03-stop-at-authored-states.mp4", "04-resize-orientation-mid-current-and-manifesto.mp4", "05-supporting-route-entry-and-reverse.mp4"]);
const R1_ZOOM_ROUTE_CHECKS = Object.freeze(["completeH1", "completeOpeningProposition", "readableNavigation", "usableMobileMenuWhereApplicable", "noTextClipping", "noInternalWordSplitting", "noHiddenContent", "noHorizontalOverflow", "usableControlsAndLinks", "reasonableDocumentContinuation"]);
const R1_ZOOM_ROUTES = Object.freeze(["/", "/for-partners/", "/for-startups/", "/industries/", "/pocs/", "/pocs/maradin/", "/spark/", "/about/", "/contact/", "/__phase6-intentional-404__/"]);
const R1_TOOLING_REPORT_FILES = Object.freeze([
  "PHASE_6_R1_VALIDATION_CLOSURE.md", "package.json", "scripts/assemble-phase6-final-evidence.mjs", "scripts/audit-phase6-human-review-package.mjs",
  "scripts/capture-phase6-r1-motion-evidence.mjs", "scripts/ingest-phase6-r1-human-evidence.mjs", "scripts/package-phase6-human-review.mjs",
  "scripts/qa-phase6-accessibility-interactions.mjs", "scripts/qa-phase6-r1-persistent-lifecycle.mjs", "scripts/verify-phase6-deployment.mjs",
  "scripts/verify-phase6-r1-deployment.mjs", "tests/phase6-accessibility-interactions.test.mjs", "tests/phase6-evidence-assembler.test.mjs",
  "tests/phase6-package-tooling.test.mjs", "tests/phase6-r1-deployment-verifier.test.mjs", "tests/phase6-r1-human-evidence.test.mjs",
  "tests/phase6-r1-motion-capture.test.mjs", "tests/phase6-r1-persistent-lifecycle.test.mjs",
]);
const R1_CHANGED_PATH_RECORDS = Object.freeze([
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
const R1_DEPLOYMENT_CHECK_RUN_ID = "456";
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
const R1_FINAL_TREE = "e".repeat(40);
const EXPECTED = Object.freeze({
  expectedHead: "a".repeat(40),
  branch: REQUIRED_BRANCH,
  deploymentId: "12345678-1234-4234-8234-123456789abc",
  immutableUrl: "https://12345678.qsite1.pages.dev/",
  branchUrl: REQUIRED_BRANCH_URL,
});
const PROVENANCE = Object.freeze({
  branch: EXPECTED.branch,
  expectedHead: EXPECTED.expectedHead,
  observedHead: EXPECTED.expectedHead,
  acceptedBase: ACCEPTED_PHASE5B_SHA,
  expectedMain: FROZEN_MAIN_SHA,
  deployment: {
    id: EXPECTED.deploymentId,
    immutableUrl: EXPECTED.immutableUrl,
    branchUrl: EXPECTED.branchUrl,
  },
});
const R1_EXPECTED = Object.freeze({
  authorityProfile: "phase6-r1",
  expectedHead: "d".repeat(40),
  branch: R1_REQUIRED_BRANCH,
  deploymentId: "87654321-1234-4234-8234-123456789abc",
  deploymentCheckRunId: R1_DEPLOYMENT_CHECK_RUN_ID,
  immutableUrl: "https://87654321.qsite1.pages.dev/",
  branchUrl: R1_REQUIRED_BRANCH_URL,
});
const R1_PROVENANCE = Object.freeze({
  authorityProfile: R1_EXPECTED.authorityProfile,
  branch: R1_EXPECTED.branch,
  expectedHead: R1_EXPECTED.expectedHead,
  observedHead: R1_EXPECTED.expectedHead,
  exactParent: R1_REQUIRED_PARENT,
  expectedMain: FROZEN_MAIN_SHA,
  deployment: {
    id: R1_EXPECTED.deploymentId,
    checkRunId: R1_EXPECTED.deploymentCheckRunId,
    immutableUrl: R1_EXPECTED.immutableUrl,
    branchUrl: R1_EXPECTED.branchUrl,
  },
});

const DEPLOYMENT_CHECKS = Object.freeze({
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

function fixtureDeploymentVerification(overrides = {}) {
  const document = {
    schema: DEPLOYMENT_VERIFICATION_SCHEMA,
    status: "PASS",
    inputs: {
      expectedHead: EXPECTED.expectedHead,
      acceptedBase: ACCEPTED_PHASE5B_SHA,
      expectedMain: FROZEN_MAIN_SHA,
      repository: REQUIRED_REPOSITORY,
      branch: REQUIRED_BRANCH,
      deploymentId: EXPECTED.deploymentId,
      immutableUrl: EXPECTED.immutableUrl,
      branchUrl: EXPECTED.branchUrl,
      localDist: "dist",
    },
    repository: {
      status: "PASS",
      data: {
        repository: REQUIRED_REPOSITORY,
        branch: REQUIRED_BRANCH,
        head: EXPECTED.expectedHead,
        acceptedBase: ACCEPTED_PHASE5B_SHA,
        directParent: ACCEPTED_PHASE5B_SHA,
        cleanTree: true,
        history: [{ commit: EXPECTED.expectedHead, parents: [ACCEPTED_PHASE5B_SHA], subject: "Fixture Phase 6 commit" }],
        productionDelta: [],
        main: { branch: "main", headSha: FROZEN_MAIN_SHA, frozenAt: FROZEN_MAIN_SHA, containsPhase6Head: false },
        upstream: { ref: `origin/${REQUIRED_BRANCH}`, headSha: EXPECTED.expectedHead, parity: true },
        liveRemote: { branchRef: `refs/heads/${REQUIRED_BRANCH}`, branchHeadSha: EXPECTED.expectedHead, mainRef: "refs/heads/main", mainHeadSha: FROZEN_MAIN_SHA, parity: true },
      },
    },
    deployment: {
      status: "PASS",
      data: {
        authoritySource: "CLOUDFLARE_PAGES_SIGNED_GITHUB_CHECK",
        checkRunId: "123",
        appSlug: "cloudflare-pages",
        completedAt: GENERATED_AT,
        deploymentId: EXPECTED.deploymentId,
        immutableUrl: EXPECTED.immutableUrl,
        branchUrl: EXPECTED.branchUrl,
        branch: REQUIRED_BRANCH,
        commitHash: EXPECTED.expectedHead,
        environment: "preview",
        status: "PASS",
      },
    },
    dist: { status: "PASS" },
    origins: {
      immutable: { status: "PASS", data: { origin: EXPECTED.immutableUrl, status: "PASS" } },
      branch: { status: "PASS", data: { origin: EXPECTED.branchUrl, status: "PASS" } },
    },
    checks: DEPLOYMENT_CHECKS,
    failures: [],
  };
  return { ...document, ...overrides };
}

function r1FixturePublicPath(relativePath, missing404Path = "/__phase6-real-404-probe__/") {
  if (relativePath === "_headers") return null;
  if (relativePath === "404.html") return missing404Path;
  if (relativePath === "index.html") return "/";
  if (relativePath.endsWith("/index.html")) return `/${relativePath.slice(0, -"index.html".length)}`;
  return `/${relativePath}`;
}

function r1FixtureCanonical(relativePath) {
  if (relativePath === "404.html") return { canonical: null, robotsNoindex: true, status: "PASS" };
  return {
    canonical: relativePath === "index.html" ? "https://qsite1.pages.dev/" : `https://qsite1.pages.dev/${relativePath.slice(0, -"index.html".length)}`,
    robotsNoindex: false,
    status: "PASS",
  };
}

function r1FixtureMime(relativePath) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  return ({ ".css": "text/css", ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".json": "application/json", ".mp4": "video/mp4", ".png": "image/png", ".txt": "text/plain", ".xml": "application/xml" })[extension];
}

function r1FixtureDeploymentParity() {
  const paths = [
    ...R1_HTML_AUTHORITY_FILES,
    "_astro/about.css",
    "_astro/About.js",
    "_astro/app.css",
    "_headers",
    "media/cinematic/phase-4r2/manifests/opening.json",
    "media/cinematic/phase-4r2/media/opening.mp4",
    "media/cinematic/phase-4r2/posters/opening.png",
    "robots.txt",
    "sitemap.xml",
  ].sort((left, right) => left.localeCompare(right));
  const files = paths.map((relativePath) => {
    const bytes = Buffer.byteLength(`dist fixture ${relativePath}`);
    return {
      relativePath,
      bytes,
      sha256: sha256(Buffer.from(`dist fixture ${relativePath}`)),
      requestPath: r1FixturePublicPath(relativePath),
      deploymentComparison: relativePath === "_headers" ? "EXCLUDED_CLOUDFLARE_CONFIGURATION" : "REQUIRED",
    };
  });
  const canonicalAuthority = Object.fromEntries(R1_HTML_AUTHORITY_FILES.map((relativePath) => [relativePath, r1FixtureCanonical(relativePath)]));
  const comparable = files.filter(({ relativePath }) => relativePath !== "_headers");
  const missing404Path = `/__phase6-real-404-${R1_EXPECTED.expectedHead.slice(0, 12)}-${R1_EXPECTED.deploymentId.slice(0, 8)}/`;
  const responses = comparable.map((file) => {
    const publicPath = r1FixturePublicPath(file.relativePath, missing404Path);
    const matchedPolicies = Object.keys(R1_REQUIRED_HEADER_POLICIES).filter((pattern) => {
      const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : pattern;
      return pattern.endsWith("*") ? publicPath.startsWith(prefix) : publicPath === prefix;
    });
    return {
      relativePath: file.relativePath,
      publicPath,
      expectedHttpStatus: file.relativePath === "404.html" ? 404 : 200,
      actualHttpStatus: file.relativePath === "404.html" ? 404 : 200,
      bytes: file.bytes,
      sha256: file.sha256,
      headers: {
        contentType: r1FixtureMime(file.relativePath),
        cacheControl: matchedPolicies.length ? R1_REQUIRED_HEADER_POLICIES[matchedPolicies[0]] : "public, max-age=0, must-revalidate",
        matchedPolicies,
        status: "PASS",
      },
      canonical: file.relativePath.endsWith(".html") ? canonicalAuthority[file.relativePath] : null,
      status: "PASS",
    };
  });
  const originData = (origin) => ({
    origin,
    status: "PASS",
    real404: { publicPath: missing404Path, httpStatus: 404, localAuthority: "404.html", byteParity: true },
    fileCount: responses.length,
    totalBytes: responses.reduce((sum, response) => sum + response.bytes, 0),
    responses: structuredClone(responses),
  });
  return {
    dist: {
      status: "PASS",
      files,
      totals: { files: files.length, comparableFiles: comparable.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0) },
      exactHtmlAuthority: [...R1_HTML_AUTHORITY_FILES],
      routeOutcomes: [...R1_PUBLIC_ROUTE_OUTCOMES],
      canonicalAuthority,
      requiredHeaderPolicies: R1_REQUIRED_HEADER_POLICIES,
    },
    origins: {
      immutable: { status: "PASS", data: originData(R1_EXPECTED.immutableUrl) },
      branch: { status: "PASS", data: originData(R1_EXPECTED.branchUrl) },
    },
  };
}

function fixtureR1DeploymentVerification(overrides = {}) {
  const parity = r1FixtureDeploymentParity();
  const document = {
    schema: R1_DEPLOYMENT_VERIFICATION_SCHEMA,
    status: "PASS",
    inputs: {
      expectedHead: R1_EXPECTED.expectedHead,
      exactParent: R1_REQUIRED_PARENT,
      expectedMain: FROZEN_MAIN_SHA,
      repository: REQUIRED_REPOSITORY,
      branch: R1_REQUIRED_BRANCH,
      deploymentId: R1_EXPECTED.deploymentId,
      immutableUrl: R1_EXPECTED.immutableUrl,
      branchUrl: R1_EXPECTED.branchUrl,
      localDist: "dist",
    },
    repository: {
      status: "PASS",
      data: {
        status: "PASS",
        repository: REQUIRED_REPOSITORY,
        branch: R1_REQUIRED_BRANCH,
        head: R1_EXPECTED.expectedHead,
        exactParent: R1_REQUIRED_PARENT,
        directParent: R1_REQUIRED_PARENT,
        cleanTree: true,
        history: [{ commit: R1_EXPECTED.expectedHead, parents: [R1_REQUIRED_PARENT], subject: "Fixture Phase 6-R1 commit" }],
        main: { local: FROZEN_MAIN_SHA, upstream: FROZEN_MAIN_SHA, live: FROZEN_MAIN_SHA, modifiedOrMerged: false },
        upstream: { ref: `origin/${R1_REQUIRED_BRANCH}`, head: R1_EXPECTED.expectedHead, live: R1_EXPECTED.expectedHead, parity: true },
        productionSourceDiff: [],
        productionDiffScope: [...R1_PRODUCTION_DIFF_SCOPE],
        toolingReportDiff: [...R1_CHANGED_PATH_RECORDS],
        packageScriptChanges: [...R1_PACKAGE_SCRIPT_CHANGES],
        trackedFileDelta: 18,
        trackedByteDelta: 4096,
      },
    },
    deployment: {
      status: "PASS",
      data: {
        authoritySource: "CLOUDFLARE_PAGES_SIGNED_GITHUB_CHECK",
        checkRunId: R1_DEPLOYMENT_CHECK_RUN_ID,
        appSlug: "cloudflare-workers-and-pages",
        completedAt: GENERATED_AT,
        deploymentId: R1_EXPECTED.deploymentId,
        immutableUrl: R1_EXPECTED.immutableUrl,
        branchUrl: R1_EXPECTED.branchUrl,
        branch: R1_REQUIRED_BRANCH,
        commitHash: R1_EXPECTED.expectedHead,
        environment: "preview",
        status: "PASS",
        branchBinding: { status: "PASS", source: "SIGNED_CHECK_EXACT_BRANCH_ALIAS", branch: R1_REQUIRED_BRANCH, branchUrl: R1_REQUIRED_BRANCH_URL },
      },
    },
    dist: parity.dist,
    origins: parity.origins,
    checks: R1_DEPLOYMENT_CHECKS,
    failures: [],
  };
  return { ...document, ...overrides };
}

function isoBox(type, ...payloads) {
  const payload = Buffer.concat(payloads.map((value) => Buffer.from(value)));
  const output = Buffer.alloc(8 + payload.length);
  output.writeUInt32BE(output.length, 0);
  output.write(type, 4, 4, "ascii");
  payload.copy(output, 8);
  return output;
}

function fixtureMp4(marker = "fixture") {
  const ftypPayload = Buffer.alloc(16);
  ftypPayload.write("isom", 0, 4, "ascii");
  ftypPayload.writeUInt32BE(0x200, 4);
  ftypPayload.write("isom", 8, 4, "ascii");
  ftypPayload.write("mp42", 12, 4, "ascii");
  const mdhd = Buffer.alloc(24);
  mdhd.writeUInt32BE(1_000, 12);
  mdhd.writeUInt32BE(1_000, 16);
  const mvhd = Buffer.alloc(24);
  mvhd.writeUInt32BE(1_000, 12);
  mvhd.writeUInt32BE(1_000, 16);
  const hdlr = Buffer.alloc(20);
  hdlr.write("vide", 8, 4, "ascii");
  const stsz = Buffer.alloc(16);
  stsz.writeUInt32BE(0, 4);
  stsz.writeUInt32BE(1, 8);
  stsz.writeUInt32BE(Math.max(1, Buffer.byteLength(marker)), 12);
  const moov = isoBox("moov", isoBox("mvhd", mvhd), isoBox("trak", isoBox("mdia", isoBox("mdhd", mdhd), isoBox("hdlr", hdlr), isoBox("minf", isoBox("stbl", isoBox("stsz", stsz))))));
  return Buffer.concat([isoBox("ftyp", ftypPayload), moov, isoBox("mdat", Buffer.from(marker))]);
}

function fixturePayloadEntries() {
  const entries = [];
  const trackedReports = REPORT_SPECS.map(({ source }) => source).sort();
  entries.push({
    path: "00-provenance/git-provenance.json",
    data: Buffer.from(stableJson({
      schema: `${PACKAGE_SCHEMA}.git-provenance`,
      status: "PASS",
      branch: EXPECTED.branch,
      head: EXPECTED.expectedHead,
      directParents: [ACCEPTED_PHASE5B_SHA],
      cleanTree: true,
      acceptedBase: ACCEPTED_PHASE5B_SHA,
      acceptedBaseAncestor: true,
      headMergedIntoMain: false,
      localMain: { ref: "refs/heads/main", head: FROZEN_MAIN_SHA },
      originMain: { ref: "refs/remotes/origin/main", head: FROZEN_MAIN_SHA },
      liveMain: { ref: "refs/heads/main", head: FROZEN_MAIN_SHA },
      upstream: { ref: `origin/${REQUIRED_BRANCH}`, head: EXPECTED.expectedHead, liveHead: EXPECTED.expectedHead, parity: true },
      remote: { name: "origin", url: REQUIRED_REMOTE_URL, repository: REQUIRED_REPOSITORY },
      trackedReports,
    })),
  });
  entries.push({ path: DEPLOYMENT_VERIFICATION_PATH, data: Buffer.from(stableJson(fixtureDeploymentVerification())) });
  for (const [index, report] of REPORT_SPECS.entries()) {
    entries.push({ path: report.archive, data: Buffer.from(`# ${report.source}\nfixture report ${index}\n`) });
  }
  const populatedByAuthority = new Set(["00-provenance", "01-baseline", "10-poster-study", "11-physical-device", "13-package"]);
  for (const [index, section] of TOPOLOGY_SECTIONS.entries()) {
    if (!populatedByAuthority.has(section)) {
      entries.push({ path: `${section}/distilled-${index}.json`, data: Buffer.from(`{"section":"${section}","ordinal":${index}}\n`) });
    }
  }
  return entries;
}

function fixtureR1HumanEvidenceEntries() {
  const recordings = R1_REQUIRED_HUMAN_RECORDINGS.map((filename, index) => {
    const data = fixtureMp4(`fixture physical human recording ${index + 1}: ${filename}`);
    return { filename, data, byteSize: data.length, sha256: sha256(data), mediaValidation: validatePackageMp4(data, filename) };
  });
  const ledger = {
    schema: R1_HUMAN_EVIDENCE_SCHEMA,
    createdAt: GENERATED_AT,
    status: "PENDING HUMAN REVIEW",
    evidenceClass: "HUMAN DEVICE EVIDENCE",
    rootExists: true,
    requiredFilenames: [...R1_REQUIRED_HUMAN_RECORDINGS],
    missingFilenames: [],
    entries: recordings.map(({ filename, byteSize, sha256: hash, mediaValidation }) => {
      const record = {
        filename,
        sha256: hash,
        byteSize,
        evidenceClass: "PHYSICAL HUMAN RECORDING",
        device: "Not reviewed",
        os: "Not reviewed",
        browser: filename.startsWith("iphone-safari-") ? "Safari (version not reviewed)" : filename === "chrome-200-percent.mp4" ? "Chrome (version not reviewed)" : null,
        browserVersion: null,
        testSteps: ["Inspect the supplied recording and document every visibly demonstrated step."],
        observedResult: "Pending visual inspection; file presence alone is not evidence of a pass.",
        status: "PENDING HUMAN REVIEW",
        mediaValidation,
        reviewedSha256: null,
        reviewedByteSize: null,
        failureReferences: [],
      };
      const checks = {
        "iphone-safari-opening.mp4": ["correctDormantOpening", "firstPracticalSwipeResponse", "nativeMomentum", "stopAtPhysicalState", "reverseReconstruction", "lineRasterQ", "autonomousManifestoFade", "noF1FlashFromIntentionalHome", "orientationStability", "backgroundForeground"],
        "iphone-safari-maradin.mp4": ["onePlayerLifecycle", "backgroundForeground", "retryableSourceFree", "noPersistentRafOrInterval", "noLiveOrphanBlob"],
        "physical-scroll-input.mp4": ["noPositiveInputDeadZone", "nativeInertiaSovereign", "promptReversal", "noCatchUpAnimation", "freezesAtRest", "noForcedSnapping", "supportingRoutesOrdinaryFlow"],
      }[filename];
      if (checks) {
        record.checks = Object.fromEntries(checks.map((check) => [check, null]));
        record.observations = checks.map((checkId) => ({ checkId, status: "PENDING HUMAN REVIEW", result: "Pending visual inspection.", timestamp: null, frame: null }));
      } else {
        record.genuineBrowserZoom = null;
        record.zoomPercent = null;
        record.proxy = null;
        record.routeOutcomes = R1_ZOOM_ROUTES.map((route) => ({
          route,
          status: "PENDING HUMAN REVIEW",
          checks: Object.fromEntries(R1_ZOOM_ROUTE_CHECKS.map((check) => [check, null])),
          failureReferences: [],
        }));
        record.observations = record.routeOutcomes.flatMap(({ route }) => R1_ZOOM_ROUTE_CHECKS.map((check) => ({ checkId: `${route}:${check}`, status: "PENDING HUMAN REVIEW", result: "Pending visual inspection.", timestamp: null, frame: null })));
      }
      return record;
    }),
    policy: { filePresenceIsPass: false, machineRecordingSubstitutionAllowed: false, failRequiresTimestampOrFrame: true, allFourFilesRequiredBeforePackaging: true },
  };
  const sourceBytes = Buffer.from(stableJson(ledger));
  const wrapper = {
    schema: "quantum-hub.phase-6.final-evidence-assembly.v1.distilled-json",
    status: "PENDING HUMAN REVIEW",
    role: "physical-device-result",
    source: { relativePath: "human-device/ledger.json", sha256: sha256(sourceBytes) },
    selection: null,
    payload: ledger,
  };
  return [
    { path: R1_HUMAN_LEDGER_PATH, data: Buffer.from(stableJson(wrapper)) },
    ...recordings.map(({ filename, data }) => ({ path: `11-physical-device/recordings/${filename}`, data })),
  ];
}

const R1_SECTION_REQUIREMENTS = Object.freeze({
  "00-provenance": ["Git provenance", "branch ancestry", "main verification", "commit chain", "clean-tree proof", "deployment verification", "dist/deployment parity", "production-source diff"],
  "01-baseline": ["PHASE_6_BASELINE.md", "PHASE_6_DEFECT_LEDGER.md", "accepted Phase 5B reference hashes", "initial browser/runtime inventory"],
  "02-cross-engine": ["browser versions", "Chromium matrix", "WebKit matrix", "Firefox matrix", "engine-specific findings", "representative cross-engine screenshots", "representative recordings"],
  "03-homepage-motion": ["fresh forward", "reverse", "fast skip", "stop-at-state", "manifesto autonomous fade", "Home /#entry", "no-F1 proof", "resize/orientation", "hidden/visible behavior"],
  "04-supporting-routes": ["cross-route desktop sheet", "cross-route portrait sheet", "cross-route 320px sheet", "cross-route 844×390 sheet", "signature motion recordings", "route-specific runtime reports"],
  "05-history-bfcache": ["direct /", "direct /#entry", "Back/Forward", "BFCache", "pageshow/pagehide", "refresh", "hash navigation", "mobile-menu history", "state-restoration report"],
  "06-performance": ["cold/warm runs", "median/p95/max", "long-task attribution", "CPU-throttle stress", "RAF/interval report", "layout/paint report", "route budgets", "request totals", "CLS"],
  "07-memory": ["repeated-cycle results", "DOM counters", "listener/observer audit", "Blob/object URL audit", "decoder audit", "media teardown", "bounded-growth conclusion"],
  "08-network-media": ["normal request inventories", "slow-network tests", "blocked/failing media", "offline tests", "homepage request isolation", "supporting-route isolation", "Maradin lifecycle", "decoder behavior"],
  "09-accessibility": ["axe", "keyboard", "focus", "mobile menu", "reduced motion", "no JS", "200%", "fallback fonts", "heading/landmark inventory", "target-size evidence"],
  "10-poster-study": ["original inventory", "candidate inventory", "side-by-side comparison", "difference images", "byte/decode comparison", "final retain/replace decision", "resulting production hashes if changed"],
  "11-physical-device": ["real-device results if genuinely performed", "otherwise PHASE_6_PHYSICAL_DEVICE_HANDOFF.md", "no false machine PASS"],
  "12-regression": ["Phase 4 media hashes", "exact Q", "Phase 5B manifesto", "R1 About hash", "all supporting-route source hashes", "publication boundaries", "homepage Operating Field", "no route-content drift"],
  "13-package": ["package README", "canonical file inventory", "embedded manifest", "independent audit", "all payload hashes", "all payload sizes", "CRC result", "privacy/secrets scan", "duplicate-path scan"],
});

function fixtureR1EvidenceRoles(section, requirement) {
  if (section === "00-provenance") return ["deployment verification", "dist/deployment parity"].includes(requirement) ? ["deployment-verifier"] : ["generated-authority"];
  if (section === "01-baseline") return ["generated-authority", "packager-injected-report"];
  if (section === "02-cross-engine") return requirement.includes("screenshots") ? ["cross-engine-screenshot"] : requirement.includes("recordings") ? ["cross-engine-recording"] : ["cross-engine-summary"];
  if (section === "03-homepage-motion") return requirement === "hidden/visible behavior"
    ? ["homepage-motion-summary", "homepage-motion-recording", "r1-motion-summary", "r1-motion-recording", "memory-summary", "r1-persistent-lifecycle-summary", "physical-device-result"]
    : requirement.includes("fade") || ["fresh forward", "reverse", "fast skip", "stop-at-state", "resize/orientation"].some((token) => requirement.includes(token))
      ? ["homepage-motion-summary", "homepage-motion-recording", "r1-motion-summary", "r1-motion-recording"] : ["homepage-motion-summary"];
  if (section === "04-supporting-routes") {
    const direct = {
      "cross-route desktop sheet": "supporting-desktop-sheet", "cross-route portrait sheet": "supporting-portrait-sheet",
      "cross-route 320px sheet": "supporting-narrow-sheet", "cross-route 844×390 sheet": "supporting-landscape-sheet",
      "signature motion recordings": "supporting-motion-recording",
    }[requirement];
    return direct ? [direct] : ["supporting-route-summary"];
  }
  if (section === "05-history-bfcache") return ["history-bfcache-summary", "r1-persistent-lifecycle-summary"];
  if (section === "06-performance") return ["performance-summary"];
  if (section === "07-memory") return ["memory-summary", "r1-persistent-lifecycle-summary"];
  if (section === "08-network-media") return ["network-media-summary", "r1-persistent-lifecycle-summary"];
  if (section === "09-accessibility") return requirement === "axe" ? ["accessibility-summary"] : ["keyboard", "focus", "mobile menu"].includes(requirement) ? ["accessibility-summary", "accessibility-interaction-limitation"] : requirement === "200%" ? ["accessibility-summary", "supplemental-reflow-proxy", "physical-device-result", "physical-device-recording"] : ["accessibility-summary"];
  if (section === "10-poster-study") return requirement === "side-by-side comparison" ? ["poster-side-by-side"] : requirement === "difference images" ? ["poster-difference"] : ["poster-study-summary", "packager-injected-report"];
  if (section === "11-physical-device") return ["physical-device-result", "physical-device-recording", "packager-injected-report"];
  if (section === "12-regression") return ["regression-summary"];
  if (section === "13-package") return ["packager-generated"];
  throw new Error(`missing R1 fixture role mapping: ${section}/${requirement}`);
}

function distilledFixture(pathname, role, payload, { status = payload.status ?? "PASS", sourceStatus } = {}) {
  const sourceBytes = Buffer.from(stableJson(payload));
  return {
    path: pathname,
    role,
    data: Buffer.from(stableJson({
      schema: "quantum-hub.phase-6.final-evidence-assembly.v1.distilled-json",
      status,
      role,
      source: { relativePath: `final/${pathname.replaceAll("/", "-")}`, sha256: sha256(sourceBytes) },
      ...(sourceStatus ? { sourceStatus } : {}),
      selection: null,
      payload,
    })),
  };
}

function accessibilityFixture(engine, { axeOnly = false, failed = false } = {}) {
  const routes = [
    { id: "home", path: "/", expectedStatus: 200 }, { id: "for-industry", path: "/for-partners/", expectedStatus: 200 },
    { id: "for-startups", path: "/for-startups/", expectedStatus: 200 }, { id: "industries", path: "/industries/", expectedStatus: 200 },
    { id: "proof", path: "/pocs/", expectedStatus: 200 }, { id: "maradin", path: "/pocs/maradin/", expectedStatus: 200 },
    { id: "spark", path: "/spark/", expectedStatus: 200 }, { id: "about", path: "/about/", expectedStatus: 200 },
    { id: "contact", path: "/contact/", expectedStatus: 200 }, { id: "404", path: "/__phase6-intentional-404__/", expectedStatus: 404 },
  ];
  const viewports = [{ id: "desktop-1440x900", width: 1440, height: 900 }, { id: "portrait-390x844", width: 390, height: 844 }];
  if (failed) {
    const failure = "WebKit interaction host timed out";
    return {
      schema: "quantum-hub.phase-6.accessibility-interactions.v1", status: "FAIL", engine, routes, viewports, selectedEngines: [engine], axeOnly: false,
      engines: [{ engine, status: "ERROR", failure }],
      failures: [{ actual: failure, code: "engine-error", engine, section: "engine" }],
      summary: { axeCases: 0, axeExpected: 20, axeViolations: 0, engineErrors: 1, failures: 1, seriousCritical: 0 },
    };
  }
  const visibleFocus = (href, classes = ["fixture-link"], key = `a|${href}|Fixture`) => ({
    classes, focusVisible: true, href, key, outlineStyle: "solid", outlineWidth: "2px",
    rect: { bottom: 40, height: 20, left: 0, right: 120, top: 20, width: 120 }, selector: "a.fixture-link", tag: "a", text: "Fixture", visible: true,
  });
  const axe = viewports.flatMap((viewport) => routes.map((route) => ({
    engine, failures: [], httpStatus: route.expectedStatus, incompleteCount: 0, route: route.id, status: "PASS", violations: [], viewport,
  })));
  const keyboard = axeOnly ? [] : routes.map((route) => {
    const expectedHash = route.id === "home" ? "#entry" : "#main-content";
    const first = visibleFocus(expectedHash, ["skip-link"], `a|${expectedHash}|Skip`);
    const forwardFirst = route.id === "home" ? visibleFocus("/for-partners/", ["audience-trajectory"], "a|/for-partners/|Industry") : visibleFocus("/fixture-one/", ["fixture-link"], "a|/fixture-one/|One");
    const forwardSecond = route.id === "home" ? visibleFocus("/for-startups/", ["audience-trajectory"], "a|/for-startups/|Startups") : visibleFocus("/fixture-two/", ["fixture-link"], "a|/fixture-two/|Two");
    return {
      afterActivation: { activeId: expectedHash.slice(1), hash: expectedHash, targetVisible: true }, backward: { ...forwardFirst },
      desktopHome: { activationError: null, arrival: { entryInert: false, hash: "#entry", manifestoReveal: "resolved", path: "/", route: "/#entry" }, back: { hash: "", path: route.path, route: route.path }, backError: null, focus: visibleFocus("/#entry"), forward: { hash: "#entry", path: "/", route: "/#entry" }, forwardError: null, preparation: route.id === "home" ? { input: "NATIVE WHEEL", ready: true, resolved: true, state: { cinematicMode: "enhanced", entryInert: false, hash: "", manifestoReveal: "resolved", mediaState: "ready", path: "/", route: "/" }, wheelSteps: 12 } : null },
      engine, expectedHash, failures: [], first, firstVisibilityReady: true, forwardFirst, forwardSecond, route: route.id, routePath: route.path, status: "PASS",
    };
  });
  const closedMenu = { activeIsTrigger: true, ariaExpanded: "false", hash: "", open: false, path: "/about/" };
  const openMenu = { activeIsTrigger: true, ariaExpanded: "true", hash: "", open: true, path: "/about/" };
  const mobileMenu = axeOnly ? null : {
    cycles: Array.from({ length: 4 }, () => ({ close: { ...closedMenu }, open: { ...openMenu } })), engine,
    escapeClose: { ...closedMenu }, failures: [], firstMenuLink: visibleFocus("/#entry"),
    navigation: { activationError: null, arrival: { ...closedMenu, hash: "#entry", path: "/" }, back: { ...closedMenu }, backError: null, focus: visibleFocus("/#entry") },
    ordinaryClose: { ...closedMenu }, ordinaryOpen: { ...openMenu }, status: "PASS", triggerFocus: visibleFocus(null, ["mobile-nav-trigger"], "summary||Menu"),
  };
  const history = axeOnly ? null : {
    back: { entryAlignmentDelta: null, hash: "", path: "/", scrollY: 0 }, bare: { entryAlignmentDelta: null, hash: "", path: "/", scrollY: 0 }, engine,
    entry: { entryAlignmentDelta: 0, hash: "#entry", path: "/", scrollY: 900 }, failures: [],
    forward: { entryAlignmentDelta: 0, hash: "#entry", path: "/", scrollY: 900 }, status: "PASS",
  };
  const result = {
    axe, browser: { engine, executable: `${engine}.exe`, headed: false, version: `fixture-${engine}` }, engine, failures: [], history, keyboard, mobileMenu, status: "PASS",
    summary: { axeCases: 20, axeViolations: 0, failures: 0, keyboardCases: keyboard.length, seriousCritical: 0 },
  };
  return {
    schema: "quantum-hub.phase-6.accessibility-interactions.v1", status: "PASS", engine, routes, viewports, selectedEngines: [engine], engines: [result], axeOnly,
    failures: [], summary: { axeCases: 20, axeExpected: 20, axeViolations: 0, engineErrors: 0, failures: 0, seriousCritical: 0 },
  };
}

function persistentLifecycleFixture() {
  const origin = new URL(R1_EXPECTED.branchUrl).origin;
  const phase4Path = "/media/cinematic/phase-4r2/media/mobile.mp4";
  const phase4Request = (frameNavigationId, range = "bytes=0-1023") => {
    const entryDocument = frameNavigationId === "navigation-entry";
    const documentUrl = new URL(entryDocument ? "/#entry" : "/", R1_EXPECTED.branchUrl).href;
    return {
      correlatedDocumentUrl: documentUrl,
      documentIdentityCorrelation: "CORRELATED",
      documentUrl,
      frameDocumentGeneration: entryDocument ? 2 : 1,
      frameDocumentId: entryDocument ? "entry-document" : "bare-document",
      frameNavigationId,
      method: "GET",
      path: phase4Path,
      range,
      resourceType: "fetch",
      url: new URL(phase4Path, R1_EXPECTED.branchUrl).href,
    };
  };
  const listenerTelemetry = () => ({ active: 3, activeByType: { click: 2, visibilitychange: 1 }, added: 3, duplicateAttempts: 0, removed: 0 });
  const navigationIds = { "bare-document": "navigation-bare", "entry-document": "navigation-entry", "support-bare-document": "navigation-support-bare", "support-entry-document": "navigation-support-entry" };
  let sequence = 0;
  const state = (label, documentId, url, scrollY, manifestoReveal = null, mediaStartTime = null, navigationType = "navigate") => {
    const hasHome = manifestoReveal !== null;
    return {
      capturedAtEpochMs: 1_800_000_000_000 + (++sequence * 100), label, documentId, maximumScroll: 1_200,
      navigationId: navigationIds[documentId] ?? `navigation-${documentId}`, origin, url, scrollY,
      mobileMenu: { open: false, expanded: "false" },
      ...(hasHome ? { home: {
        bootstrap: url === "/#entry" ? "semantic-entry" : "eligible", continuation: { audienceRouting: { inert: false }, partnerLink: { top: 100, visible: true } },
        eligibility: "eligible", fallback: null, header: "released", interactive: "true",
        manifesto: { rendered: manifestoReveal === "resolved", text: "We turn industrial needs into field evidence." }, manifestoReveal,
        mediaState: "ready", mode: "enhanced", phase: "settled", routeNavigation: "released",
        source: { hasSource: true, src: `blob:${origin}/${documentId}`, currentSrc: `blob:${origin}/${documentId}`, srcAttribute: `blob:${origin}/${documentId}`, videoNodeCount: 1, sourceNodeCount: 0 },
      } } : {}),
      probe: {
        documentId, documentEventSequence: 0, events: [], manifestoRevealEvents: hasHome ? [
          { atEpochMs: 1_800_000_000_001, value: "hidden" }, ...(manifestoReveal === "resolved" ? [{ atEpochMs: 1_800_000_000_002, value: "resolved" }] : []),
        ] : [],
        blob: hasHome ? { created: 1, revoked: 0, live: 1 } : { created: 0, revoked: 0, live: 0 },
        intervals: { created: 0, cleared: 0, active: 0 }, listeners: listenerTelemetry(), navigation: { type: navigationType, notRestoredReasons: null },
        raf: { scheduled: 0, executed: 0, cancelled: 0, active: 0 }, resources: mediaStartTime == null ? [] : [{ url: phase4Path, startTime: mediaStartTime }],
      },
    };
  };
  const states = {
    bare: state("bare-home", "bare-document", "/", 0, "hidden", 10),
    bareManifesto: state("bare-home-manifesto", "bare-document", "/", 800, "resolved", 10),
    supportAfterBare: state("support-after-bare", "support-bare-document", "/for-partners/", 120),
    bareBack: state("bare-back", "bare-document", "/", 800, "resolved", 10, "back_forward"),
    supportForward: state("support-forward", "support-bare-document", "/for-partners/", 120, null, null, "back_forward"),
    entryInitial: state("entry-initial", "entry-document", "/#entry", 900, "hidden", 20),
    entryResolved: state("entry-resolved", "entry-document", "/#entry", 900, "resolved", 20),
    supportAfterEntry: state("support-after-entry", "support-entry-document", "/for-partners/", 60),
    entryBack: state("entry-back", "entry-document", "/#entry", 900, "resolved", 20, "back_forward"),
    entryForward: state("entry-forward", "support-entry-document", "/for-partners/", 60, null, null, "back_forward"),
  };
  const bfcache = {
    status: "NOT OBSERVED", persistedEvents: [], pairedRestorations: [],
    notRestoredReasons: Object.fromEntries(Object.keys(states).map((key) => [key, null])),
    scenarios: [
      { departureKey: "bareManifesto", stateKey: "bareBack", expectedRoute: "/", status: "NOT OBSERVED", pair: null, coherent: null },
      { departureKey: "entryResolved", stateKey: "entryBack", expectedRoute: "/#entry", status: "NOT OBSERVED", pair: null, coherent: null },
    ], statement: "Persisted restoration was not observed.",
  };
  const visibilityChecks = {
    "home-current": ["routeStateStable", "currentOrbitStateStable", "homeMediaPausedWhileHidden", "noPersistentRafWhileHidden", "noPersistentIntervalWhileHidden", "noStaleTargetFrameAfterReturn", "sourcePresenceStableAfterReturn"],
    "home-manifesto": ["routeStateStable", "manifestoStateStable", "homeMediaPausedWhileHidden", "manifestoCoherentAfterReturn", "noPersistentRafWhileHidden", "noPersistentIntervalWhileHidden"],
    "maradin-release": ["routeStateStable", "activeBeforeHide", "sourceFreeWhileHidden", "sourceFreeAfterReturn", "noLiveOrphanBlobWhileHidden", "noPersistentRafWhileHidden", "noPersistentIntervalWhileHidden"],
    "maradin-retry-release": ["routeStateStable", "retryActivatedWithSource", "sourceFreeOnSecondHide", "sourceFreeAfterSecondReturn", "noLiveOrphanBlobOnSecondHide"],
  };
  const visibilityScenarios = Object.entries(visibilityChecks).map(([name, checks]) => ({
    name, status: "NOT OBSERVED",
    observation: { status: "NOT OBSERVED", checks: { sameDocument: false, sequenceBound: false, beforeVisible: false, hiddenObserved: false, visibleRestored: false, orderedVisibilityEvents: false }, transitionEvents: [] },
    checks: Object.fromEntries(checks.map((check) => [check, null])), failedChecks: [], unavailableChecks: checks, transition: null,
  }));
  const stableListeners = listenerTelemetry();
  return {
    schema: "quantum-hub.phase-6-r1.persistent-lifecycle.v1", status: "LIMITATION", createdAt: GENERATED_AT, baseUrl: R1_EXPECTED.branchUrl,
    browser: { engine: "chromium", headed: true, persistentProfile: true, profileRetained: false, version: "fixture-chromium-1" },
    profileCleanup: { status: "PASS", deletionVerified: true, profileRetained: false, errors: [] },
    history: {
      status: "PASS", bfcache,
      checks: { bareCorrect: true, bareBackCorrect: true, bareBackNoManifestoReplay: true, bareForwardCorrect: true, entryCorrect: true, entryBackCorrect: true, entryBackManifestoResolved: true, entryForwardCorrect: true, menuClosed: true },
      events: [], states,
    },
    bfcache,
    visibility: { status: "NOT OBSERVED", scenarios: visibilityScenarios, current: null, manifesto: null, maradin: null, retryActive: null, maradinRetry: null, statement: "A real hidden transition was not observed." },
    listeners: {
      status: "PASS", duplicateDocuments: [], telemetryRegressions: [],
      comparisons: [
        { name: "bare-back", documentId: "bare-document", before: stableListeners, after: stableListeners, failures: [], stable: true },
        { name: "entry-back", documentId: "entry-document", before: stableListeners, after: stableListeners, failures: [], stable: true },
      ], statement: "Same-Document listener telemetry remained stable.",
    },
    mediaRequests: {
      status: "PASS", bypassDocumentsSourceFree: true, expectedPhase4Present: true, noDuplicateSourceWithinDocument: true, noDuplicateNonRangeRequests: true,
      documents: [
        { documentId: "bare-document", labels: ["bare-back", "bare-home", "bare-home-manifesto"], mediaExpected: true, modes: ["enhanced"], paths: [phase4Path], resourceObservations: 1, selectionDocumentUrl: new URL("/", R1_EXPECTED.branchUrl).href, selectionNavigationId: "navigation-bare", selectionStable: true, sourceFree: false },
        { documentId: "entry-document", labels: ["entry-back", "entry-initial", "entry-resolved"], mediaExpected: true, modes: ["enhanced"], paths: [phase4Path], resourceObservations: 1, selectionDocumentUrl: new URL("/#entry", R1_EXPECTED.branchUrl).href, selectionNavigationId: "navigation-entry", selectionStable: true, sourceFree: false },
      ],
      network: { phase4Requests: [phase4Request("navigation-bare"), phase4Request("navigation-entry")], requestCount: 2, rangeRequestCount: 2, nonRangeRequestCount: 0, nonRangeSelections: [], uniquePaths: [phase4Path] },
    },
    interpretation: { bfcache: "NOT OBSERVED remains explicit.", visibility: "Real transitions only.", ordinaryHistory: "Independent ordinary history.", overall: "Limitations remain limitations." },
  };
}

function node22ValidationFixture(repository) {
  const log = (id, extra = {}) => {
    const logText = `${id} fixture output\n`;
    return { id, status: "PASS", log: `${id}.log`, logText, logSha256: sha256(Buffer.from(logText)), ...extra };
  };
  const distFiles = r1FixtureDeploymentParity().dist.files;
  const manifestText = `"path","bytes","sha256"\n${distFiles.map(({ relativePath, bytes, sha256: fileSha256 }) => `"${relativePath}","${bytes}","${fileSha256}"`).join("\n")}\n`;
  const manifestSha256 = sha256(Buffer.from(manifestText));
  const manifestBytes = distFiles.reduce((sum, file) => sum + file.bytes, 0);
  const differencesText = `"input","sideIndicator"\n`;
  const comparisonText = "Node 22 and Node 24 dist manifests are byte-identical.\n";
  return {
    schema: "quantum-hub.phase-6-r1.node22-integrated-validation.v7", status: "PASS", sealedAtUtc: GENERATED_AT,
    repository: {
      branch: R1_REQUIRED_BRANCH, requiredParent: R1_REQUIRED_PARENT, finalHead: repository.finalHead, finalTree: repository.finalTree,
      finalHeadDirectParent: repository.directParent, captureHeadBeforeFinalCommit: repository.directParent, main: FROZEN_MAIN_SHA, originMain: FROZEN_MAIN_SHA,
      workingTreeCleanAtSeal: true,
      productionDiff: { base: R1_REQUIRED_PARENT, scope: ["src/**", "public/**"], changedPathCount: 0, status: "ZERO PRODUCTION-SOURCE DIFF" },
      packageLock: { changedLinesFromRequiredParent: 0, sha256: "a".repeat(64) },
    },
    runtime: { nvmrc: "22.16.0", node: "v22.16.0", npm: "10.9.2", node24ComparisonRuntime: "v24.18.0", node24ComparisonNpm: "11.9.0" },
    outcomes: [
      log("npm-ci", { command: "npm ci", packagesInstalled: 741 }),
      log("astro-check", { command: "npm exec astro check", errors: 0, warnings: 0 }),
      log("production-build", { command: "npm run build", phase4OutputVerification: "PASS", phase5bProductionVerification: "PASS" }),
      log("complete-postbuild-test-suite", { tests: 300, passed: 300, failed: 0, cancelled: 0, skipped: 0, todo: 0 }),
      log("phase4-source-verification", { command: "node scripts/verify-phase4-source.mjs", stagedPhase4RuntimeFiles: 8 }),
      log("phase5b-phase6-r1-focused-regression", { tests: 120, passed: 120, failed: 0, cancelled: 0, skipped: 0, todo: 0 }),
      log("standalone-verifier-self-tests", { checks: 4, passed: 4, failed: 0, checkNames: ["phase4", "phase5b", "phase6", "phase6-r1"] }),
    ],
    distributionComparison: {
      status: "BYTE-IDENTICAL", differenceCount: 0,
      node22: { files: distFiles.length, bytes: manifestBytes, manifestSha256, manifestText },
      node24: { files: distFiles.length, bytes: manifestBytes, manifestSha256, manifestText },
      differencesText, differencesSha256: sha256(Buffer.from(differencesText)),
      comparisonText, comparisonSha256: sha256(Buffer.from(comparisonText)),
    },
    limitations: [],
  };
}

const MOTION_SAMPLE_LABELS = Object.freeze({
  "forward-physical-to-manifesto": ["F1", "current", "arrival", "indicator", "line", "raster", "Q", "threshold", "manifesto-threshold", "manifesto-resolved"],
  "reverse-manifesto-to-f1": ["manifesto", "threshold", "Q", "raster", "line", "arrival", "current", "F1", "F1-rest"],
  "resize-orientation-mid-current-and-manifesto": ["current-landscape-before", "current-portrait", "current-landscape-return", "manifesto-landscape-before", "manifesto-portrait", "manifesto-landscape-return"],
  "supporting-route-entry-and-reverse": ["supporting-about", "home-entry", "Q", "raster", "line", "arrival", "current", "F1"],
});

function motionStateFixture(label, { url = "/", frame = 150, paused = true } = {}) {
  const supporting = url === "/about/";
  const semanticLabel = label.replace(/-(?:before|after)-pause$/, "");
  const semantic = {
    F1: ["physical", "top-dormancy", "hidden"], "F1-rest": ["physical", "top-dormancy", "hidden"],
    current: ["physical", "current-orbit", "hidden"], "current-landscape-before": ["physical", "current-orbit", "hidden"],
    "current-portrait": ["physical", "current-orbit", "hidden"], "current-landscape-return": ["physical", "current-orbit", "hidden"],
    arrival: ["physical", "crt-arrival", "hidden"], indicator: ["physical", "indicator", "hidden"],
    line: ["physical", "phosphor-line", "hidden"], raster: ["physical", "raster-settling", "hidden"], Q: ["physical", "q-hold", "hidden"],
    threshold: ["physical", "physical-threshold", "hidden"], "manifesto-threshold": ["entry", "entry-reveal", "revealing"],
    "manifesto-resolved": ["entry", "entry-reveal", "resolved"], manifesto: ["settled", "entry-reveal", "resolved"],
    "manifesto-landscape-before": ["entry", "entry-reveal", "resolved"], "manifesto-portrait": ["entry", "entry-reveal", "resolved"],
    "manifesto-landscape-return": ["entry", "entry-reveal", "resolved"], "home-entry": ["settled", "entry-reveal", "resolved"],
  }[semanticLabel];
  const effectiveFrame = supporting ? 0 : frame;
  const portrait = label.endsWith("-portrait");
  return {
    label, url, viewport: portrait ? { width: 720, height: 1280 } : { width: 1280, height: 720 }, documentHidden: false,
    scrollY: effectiveFrame, maximumScroll: 1_000, horizontalOverflow: 0,
    mode: supporting ? null : "enhanced", mediaState: supporting ? null : "ready", phase: supporting ? null : semantic[0],
    segment: supporting ? null : semantic[1], targetFrame: effectiveFrame, presentedFrame: effectiveFrame,
    manifestoReveal: supporting ? null : semantic[2], navigationReleased: supporting ? null : "concealed",
    video: supporting ? null : { currentTime: Number((effectiveFrame / 30).toFixed(4)), paused, readyState: 4, hasSource: true },
  };
}

function motionObservationsFixture(id) {
  const frames = { F1: 1, "F1-rest": 1, current: 150, arrival: 285, indicator: 292, line: 307, raster: 340, Q: 370, threshold: 490, manifesto: 490, "manifesto-threshold": 490, "manifesto-resolved": 490, "home-entry": 490 };
  if (id === "stop-at-authored-states") {
    return {
      status: "PASS",
      stops: ["current", "line", "raster", "Q"].map((label) => ({
        label, status: "PASS",
        before: motionStateFixture(`${label}-before-pause`, { frame: frames[label] }),
        after: motionStateFixture(`${label}-after-pause`, { frame: frames[label] }),
      })),
    };
  }
  return {
    status: "PASS",
    samples: MOTION_SAMPLE_LABELS[id].map((label, index) => motionStateFixture(label, {
      frame: frames[label] ?? 150,
      url: id === "supporting-route-entry-and-reverse" ? index === 0 ? "/about/" : "/#entry" : id === "reverse-manifesto-to-f1" ? "/#entry" : "/",
    })),
  };
}

function canonicalR1AssemblerEntries(deploymentEntry, humanEntries) {
  const entries = [{ ...deploymentEntry, role: "deployment-verifier" }];
  const add = (entry) => { entries.push(entry); return entry; };
  const generic = (section, name, role, schema = "quantum-hub.phase-6.global-hardening.v1") => add(distilledFixture(`${section}/${name}.json`, role, { schema, status: "PASS", marker: `${section}/${name}` }));
  const repository = {
    branch: R1_REQUIRED_BRANCH, exactParent: R1_REQUIRED_PARENT, finalHead: R1_EXPECTED.expectedHead, finalTree: R1_FINAL_TREE,
    directParent: R1_REQUIRED_PARENT, cleanTree: true, localHead: R1_EXPECTED.expectedHead, upstreamHead: R1_EXPECTED.expectedHead, liveHead: R1_EXPECTED.expectedHead,
    main: { local: FROZEN_MAIN_SHA, upstream: FROZEN_MAIN_SHA, public: FROZEN_MAIN_SHA, modifiedOrMerged: false },
  };
  add({ path: "00-provenance/repository-authority.json", role: "generated-authority", data: Buffer.from(stableJson({ schema: "quantum-hub.phase-6.final-evidence-assembly.v1.repository-authority", status: "PASS", generatedAt: GENERATED_AT, repository })) });
  add({ path: "00-provenance/checkpoint-chain.json", role: "generated-authority", data: Buffer.from(stableJson({ schema: "quantum-hub.phase-6.final-evidence-assembly.v1.checkpoint-chain", status: "PASS", checkpoints: [{ head: R1_EXPECTED.expectedHead, parent: R1_REQUIRED_PARENT }] })) });
  add({ path: "00-provenance/production-source-diff.txt", role: "generated-authority", data: Buffer.from("ZERO PRODUCTION-SOURCE DIFF\n") });
  add({ path: "00-provenance/change-ledger.json", role: "generated-authority", data: Buffer.from(stableJson({
    schema: "quantum-hub.phase-6.final-evidence-assembly.v1.change-ledger", status: "PASS", productionFiles: [],
    toolingReportFiles: R1_CHANGED_PATH_RECORDS.map((record) => ({ status: record[0], path: record.slice(2) })),
    trackedFileDelta: 18, trackedByteDelta: 4096, newTrackedFilesAbove1MiB: [],
  })) });
  add({ path: "00-provenance/deployment-authority-summary.json", role: "generated-authority", data: Buffer.from(stableJson({
    schema: "quantum-hub.phase-6.final-evidence-assembly.v1.deployment-authority-summary",
    status: "PASS",
    branch: R1_REQUIRED_BRANCH,
    finalHead: R1_EXPECTED.expectedHead,
    deployment: {
      id: R1_EXPECTED.deploymentId,
      checkRunId: R1_DEPLOYMENT_CHECK_RUN_ID,
      immutableUrl: R1_EXPECTED.immutableUrl,
      branchUrl: R1_EXPECTED.branchUrl,
      deployedSha: R1_EXPECTED.expectedHead,
      parity: "PASS",
      headers: "PASS",
      real404: "PASS",
      canonical: "PASS",
      productionMainDeployed: false,
    },
    evidenceContext: { browserQa: { origin: "LOCAL", baseUrl: "http://127.0.0.1:4338/" }, deploymentBinding: { method: "DEPLOYMENT_VERIFIER_LOCAL_DIST_ORIGIN_BYTE_PARITY", status: "PASS", verifierArtifactRole: "deployment-verifier" } },
  })) });
  add({ path: "00-provenance/dist-deployment-parity.json", role: "generated-authority", data: Buffer.from(stableJson({ schema: "quantum-hub.phase-6.final-evidence-assembly.v1.dist-deployment-parity", status: "PASS", differenceCount: 0 })) });
  const nodeDocument = node22ValidationFixture(repository);
  const nodeEntry = add(distilledFixture("00-provenance/node22-integrated-validation.json", "r1-node22-validation-summary", nodeDocument));
  const nodeWrapper = JSON.parse(nodeEntry.data.toString("utf8"));
  add({ path: "00-provenance/final-build-test.json", role: "generated-authority", data: Buffer.from(stableJson({
    schema: "quantum-hub.phase-6.final-evidence-assembly.v1.final-build-test", status: "PASS",
    build: { status: "PASS" }, tests: { status: "PASS" }, publication: { status: "PASS" }, routeBudgets: { status: "PASS" },
    node22Validation: {
      artifact: { path: nodeEntry.path, source: nodeWrapper.source.relativePath, sha256: nodeWrapper.source.sha256 },
      schema: nodeDocument.schema, status: nodeDocument.status, sealedAtUtc: nodeDocument.sealedAtUtc, repository: nodeDocument.repository,
      runtime: nodeDocument.runtime, outcomes: nodeDocument.outcomes, distributionComparison: nodeDocument.distributionComparison,
    },
  })) });
  add({ path: "00-provenance/final-limitations.md", role: "generated-authority", data: Buffer.from("# Final limitations\n\nBFCache and physical review statuses remain explicit.\n") });
  add({ path: "00-provenance/final-handoff-seed.json", role: "generated-authority", data: Buffer.from(stableJson({ schema: "quantum-hub.phase-6.final-evidence-assembly.v1.final-handoff-seed", status: "PENDING HUMAN REVIEW", phase7Authorized: false })) });
  add({ path: "01-baseline/accepted-phase5b-reference-hashes.json", role: "generated-authority", data: Buffer.from(stableJson({ schema: "quantum-hub.phase-6.final-evidence-assembly.v1.accepted-phase5b-reference-hashes", status: "PASS", hashes: { fixture: "a".repeat(64) } })) });
  add({ path: "01-baseline/initial-browser-runtime-inventory.json", role: "generated-authority", data: Buffer.from(stableJson({ schema: "quantum-hub.phase-6.final-evidence-assembly.v1.initial-browser-runtime-inventory", status: "PASS", browsers: ["chromium", "webkit", "firefox"] })) });
  for (const engine of ["chromium", "webkit", "firefox"]) generic("02-cross-engine", `global-${engine}`, "cross-engine-summary");
  for (const engine of ["chromium", "webkit", "firefox"]) add({ path: `02-cross-engine/screenshots/home-${engine}.png`, role: "cross-engine-screenshot", data: Buffer.from(`png-${engine}`) });
  add({ path: "02-cross-engine/recordings/home-forward-reverse-stop.mp4", role: "cross-engine-recording", data: fixtureMp4("cross-engine") });
  generic("03-homepage-motion", "homepage", "homepage-motion-summary");
  add({ path: "03-homepage-motion/home-entry-manifesto-history.mp4", role: "homepage-motion-recording", data: fixtureMp4("homepage") });
  for (const engine of ["chromium", "firefox"]) {
    const storyIds = ["forward-physical-to-manifesto", "reverse-manifesto-to-f1", "stop-at-authored-states", "resize-orientation-mid-current-and-manifesto", "supporting-route-entry-and-reverse"];
    const recordings = R1_MOTION_RECORDINGS.map((filename, index) => {
      const data = fixtureMp4(`${engine}-${index}`);
      add({ path: `03-homepage-motion/r1/${engine}/${filename}`, role: "r1-motion-recording", data });
      const duration = 2.5 + index;
      return {
        id: storyIds[index], filename, evidenceClass: "SUPPLEMENTAL MACHINE RECORDING", relativePath: `recordings/${filename}`,
        byteSize: data.length, sha256: sha256(data), observations: motionObservationsFixture(storyIds[index]),
        validation: {
          status: "PASS", duration,
          checks: { mp4Container: true, oneVideoStream: true, zeroAudioStreams: true, h264: true, yuv420p: true, dimensions: true, constant30Fps: true, conciseDuration: true },
          media: { audioStreams: 0, codec: "h264", fps: "30/1", format: "mov,mp4,m4a,3gp,3g2,mj2", height: 720, pixelFormat: "yuv420p", width: 1280 },
        },
      };
    });
    add(distilledFixture(`03-homepage-motion/r1/${engine}/motion-evidence-report.json`, "r1-motion-summary", {
      schema: "quantum-hub.phase-6-r1.motion-evidence.v1", status: "PASS", createdAt: GENERATED_AT,
      evidenceClass: "SUPPLEMENTAL MACHINE EVIDENCE — NOT PHYSICAL DEVICE EVIDENCE", baseUrl: R1_EXPECTED.branchUrl,
      browser: { engine, headed: false, version: `fixture-${engine}` },
      inputPolicy: "Playwright native wheel, pointer, viewport and link activation; no page scroll-position writes",
      encoder: { contract: { container: "mp4", codec: "h264", pixelFormat: "yuv420p", fps: 30, audioStreams: 0 }, fullDecodeValidated: true },
      requests: { blocked: [], console: [], pageErrors: [], requests: [] }, diagnostics: { status: "PASS", failures: [] }, recordings, summary: { recordings: 5, expected: 5, failures: 0 },
    }));
  }
  generic("04-supporting-routes", "supporting", "supporting-route-summary");
  for (const [name, role] of [["desktop", "supporting-desktop-sheet"], ["portrait", "supporting-portrait-sheet"], ["narrow", "supporting-narrow-sheet"], ["landscape", "supporting-landscape-sheet"]]) add({ path: `04-supporting-routes/contact-sheets/${name}.png`, role, data: Buffer.from(`png-support-${name}`) });
  add({ path: "04-supporting-routes/supporting-signature-motion.mp4", role: "supporting-motion-recording", data: fixtureMp4("supporting") });
  generic("05-history-bfcache", "history", "history-bfcache-summary");
  add(distilledFixture("05-history-bfcache/r1-persistent-lifecycle.json", "r1-persistent-lifecycle-summary", persistentLifecycleFixture(), { status: "LIMITATION", sourceStatus: "LIMITATION" }));
  generic("06-performance", "performance", "performance-summary", "quantum-hub.phase-6.performance-lifecycle.v1");
  generic("07-memory", "lifecycle", "memory-summary", "quantum-hub.phase-6.performance-lifecycle.v1");
  generic("08-network-media", "network", "network-media-summary", "quantum-hub.phase-6.performance-lifecycle.v1");
  add({ path: "08-network-media/maradin-media-lifecycle.mp4", role: "supplemental-maradin-lifecycle-recording", data: fixtureMp4("maradin-lifecycle") });
  for (const engine of ["chromium", "webkit", "firefox"]) add(distilledFixture(`09-accessibility/accessibility-${engine}.json`, "accessibility-summary", accessibilityFixture(engine, { axeOnly: engine === "webkit" })));
  add(distilledFixture("09-accessibility/accessibility-webkit-interaction-limitation.json", "accessibility-interaction-limitation", accessibilityFixture("webkit", { failed: true }), { status: "LIMITATION", sourceStatus: "FAIL" }));
  add(distilledFixture("09-accessibility/720x450-reflow-proxy.json", "supplemental-reflow-proxy", { schema: "quantum-hub.phase-5b.responsive-accessibility.v1", status: "PASS", variants: [{ id: "text-200-proxy", viewports: [{ width: 720, height: 450 }], records: [{ route: "/", status: "PASS" }] }] }));
  add({ path: "10-poster-study/poster-request-decode-summary.json", role: "poster-study-summary", data: Buffer.from(stableJson({ schema: "fixture.poster", status: "PASS", marker: 1 })) });
  for (const family of ["desktop", "portrait", "landscape"]) {
    add({ path: `10-poster-study/comparisons/${family}-original-lossless-lossy.png`, role: "poster-side-by-side", data: Buffer.from(`poster-comparison-${family}`) });
    add({ path: `10-poster-study/differences/${family}-lossy-q95-difference-x32.png`, role: "poster-difference", data: Buffer.from(`poster-difference-${family}`) });
  }
  for (const entry of humanEntries) add({ ...entry, role: entry.path === R1_HUMAN_LEDGER_PATH ? "physical-device-result" : "physical-device-recording" });
  generic("12-regression", "repair-regressions", "regression-summary", "quantum-hub.phase-6.repair-regressions.v1");
  for (const section of TOPOLOGY_SECTIONS) {
    const sectionStatus = section === "03-homepage-motion" || section === "09-accessibility" || section === "11-physical-device" ? "PENDING HUMAN REVIEW" : section === "05-history-bfcache" ? "NOT OBSERVED" : "PASS";
    const injected = [];
    if (section === "01-baseline") injected.push(...[...REPORT_SPECS.slice(0, 2), R1_CLOSURE_REPORT_SPEC].map(({ archive }) => ({ path: archive, role: "packager-injected-report", generatedByPackager: true })));
    if (section === "10-poster-study") injected.push({ path: REPORT_SPECS[2].archive, role: "packager-injected-report", generatedByPackager: true });
    if (section === "11-physical-device") injected.push({ path: REPORT_SPECS[3].archive, role: "packager-injected-report", generatedByPackager: true });
    if (section === "13-package") injected.push(...["MANIFEST.json", "13-package/README.md", "13-package/package-metadata.json"].map((relativePath) => ({ path: relativePath, role: "packager-generated", generatedByPackager: true })));
    const requirementEvidence = [
      ...entries.filter(({ path: relativePath }) => !relativePath.endsWith("/section-summary.json")).map(({ path: relativePath, role }) => ({ path: relativePath, role })),
      ...injected,
      ...(section === "13-package" ? ["detached manifest sibling", "independent audit sibling"].map((relativePath) => ({ path: relativePath, role: "packager-generated" })) : []),
    ];
    const requirements = R1_SECTION_REQUIREMENTS[section].map((requirement) => {
      let status = sectionStatus;
      if (section === "09-accessibility" && requirement === "axe") status = "PASS";
      if (section === "09-accessibility" && ["keyboard", "focus", "mobile menu"].includes(requirement)) status = "LIMITATION";
      if (section === "05-history-bfcache" && requirement !== "BFCache") status = "PASS";
      if (section === "03-homepage-motion" && requirement !== "hidden/visible behavior") status = "PASS";
      if (section === "13-package") status = "GENERATED BY PACKAGER";
      const evidenceRoles = fixtureR1EvidenceRoles(section, requirement);
      const evidence = [...new Set(requirementEvidence.filter(({ role }) => evidenceRoles.includes(role)).map(({ path: relativePath }) => relativePath))];
      return { requirement, status, statement: `Fixture authority for ${requirement}.`, evidenceRoles, evidence };
    });
    const evidence = entries.filter(({ path: relativePath }) => relativePath.startsWith(`${section}/`) && !relativePath.endsWith("/section-summary.json"))
      .map(({ path: relativePath, role, data }) => ({ path: relativePath, role, byteSize: data.length, sha256: sha256(data) }));
    evidence.push(...injected);
    add({ path: `${section}/section-summary.json`, role: "generated", data: Buffer.from(stableJson({ schema: "quantum-hub.phase-6.final-evidence-assembly.v1.section-summary", section, status: section === "13-package" ? "READY FOR PACKAGER" : sectionStatus, summary: `Canonical fixture summary for ${section}.`, requirements, limitations: sectionStatus === "PASS" ? [] : ["Fixture limitation retained."], evidence })) });
  }
  const inventory = entries.slice().sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path))).map(({ path: pathname, data, role }) => ({ path: pathname, byteSize: data.length, sha256: sha256(data), role }));
  add({ path: "13-package/evidence-assembly-summary.json", role: "generated", data: Buffer.from(stableJson({
    schema: "quantum-hub.phase-6.final-evidence-assembly.v1.evidence-root-inventory", status: "PASS", generatedAt: GENERATED_AT,
    sourcePolicy: { explicitFinalSelectionsOnly: true, sourceHashesBound: true, rawFramesRetained: false, cachesRetained: false, nestedArchivesRetained: false, privatePathsRetained: false, identicalPayloadsRetained: false },
    topology: TOPOLOGY_SECTIONS, inventoryExcludingSelf: inventory, inventoryExcludingSelfBytes: inventory.reduce((sum, record) => sum + record.byteSize, 0),
    reservedPathsAbsent: ["MANIFEST.json", "00-provenance/git-provenance.json", ...[...REPORT_SPECS, R1_CLOSURE_REPORT_SPEC].map(({ archive }) => archive), "13-package/README.md", "13-package/package-metadata.json"].sort(),
    downstream: { packagerAddsTrackedReports: 5, packagerAddsGitProvenance: true, packagerAddsManifestAndPackageMetadata: true, independentAuditIsSibling: true }, humanReviewGates: HUMAN_REVIEW_GATES, authorization: AUTHORIZATION,
  })) });
  return entries;
}

function fixtureR1PayloadEntries() {
  const entries = [];
  const r1Reports = [...REPORT_SPECS, R1_CLOSURE_REPORT_SPEC];
  const trackedReports = r1Reports.map(({ source }) => source).sort();
  entries.push({
    path: "00-provenance/git-provenance.json",
    data: Buffer.from(stableJson({
      schema: `${R1_PACKAGE_SCHEMA}.git-provenance`,
      status: "PASS",
      branch: R1_EXPECTED.branch,
      head: R1_EXPECTED.expectedHead,
      headTree: R1_FINAL_TREE,
      directParents: [R1_REQUIRED_PARENT],
      cleanTree: true,
      exactParent: R1_REQUIRED_PARENT,
      exactParentAncestor: true,
      headMergedIntoMain: false,
      localMain: { ref: "refs/heads/main", head: FROZEN_MAIN_SHA },
      originMain: { ref: "refs/remotes/origin/main", head: FROZEN_MAIN_SHA },
      liveMain: { ref: "refs/heads/main", head: FROZEN_MAIN_SHA },
      upstream: { ref: `origin/${R1_REQUIRED_BRANCH}`, head: R1_EXPECTED.expectedHead, liveHead: R1_EXPECTED.expectedHead, parity: true },
      remote: { name: "origin", url: REQUIRED_REMOTE_URL, repository: REQUIRED_REPOSITORY },
      trackedReports,
    })),
  });
  const deploymentEntry = { path: DEPLOYMENT_VERIFICATION_PATH, data: Buffer.from(stableJson(fixtureR1DeploymentVerification())) };
  for (const [index, report] of r1Reports.entries()) {
    entries.push({ path: report.archive, data: Buffer.from(`# ${report.source}\nR1 fixture report ${index}\n`) });
  }
  entries.push(...canonicalR1AssemblerEntries(deploymentEntry, fixtureR1HumanEvidenceEntries()));
  return entries;
}

function replaceEntry(entries, pathname, transform) {
  const target = entries.find(({ path: relativePath }) => relativePath === pathname);
  assert.ok(target, `missing fixture entry ${pathname}`);
  const next = transform(Buffer.from(target.data));
  target.data = Buffer.isBuffer(next) ? next : Buffer.from(stableJson(next));
}

function rebindAssemblerMutation(entries, pathname, transform) {
  replaceEntry(entries, pathname, transform);
  const section = pathname.split("/", 1)[0];
  const summaryPath = `${section}/section-summary.json`;
  if (pathname !== summaryPath) {
    replaceEntry(entries, summaryPath, (bytes) => {
      const summary = JSON.parse(bytes.toString("utf8"));
      const evidence = summary.evidence.find(({ path: evidencePath }) => evidencePath === pathname);
      assert.ok(evidence, `missing section evidence ${pathname}`);
      const target = entries.find(({ path: relativePath }) => relativePath === pathname);
      evidence.byteSize = target.data.length;
      evidence.sha256 = sha256(target.data);
      return summary;
    });
  }
  replaceEntry(entries, "13-package/evidence-assembly-summary.json", (bytes) => {
    const inventory = JSON.parse(bytes.toString("utf8"));
    for (const changedPath of new Set([pathname, summaryPath])) {
      const record = inventory.inventoryExcludingSelf.find(({ path: inventoryPath }) => inventoryPath === changedPath);
      const target = entries.find(({ path: relativePath }) => relativePath === changedPath);
      assert.ok(record && target, `missing inventory binding ${changedPath}`);
      record.byteSize = target.data.length;
      record.sha256 = sha256(target.data);
    }
    inventory.inventoryExcludingSelfBytes = inventory.inventoryExcludingSelf.reduce((sum, record) => sum + record.byteSize, 0);
    return inventory;
  });
  return entries;
}

function r1EntryMap(entries) {
  return new Map(entries.map(({ path: relativePath, data }) => [relativePath, Buffer.from(data)]));
}

function fixtureArtifacts(options = {}) {
  return buildPackageArtifacts({
    payloadEntries: fixturePayloadEntries(),
    provenance: PROVENANCE,
    outputFilename: REQUIRED_ARCHIVE_FILENAME,
    generatedAt: GENERATED_AT,
    ...options,
  });
}

function fixtureR1Artifacts(options = {}) {
  return buildPackageArtifacts({
    payloadEntries: fixtureR1PayloadEntries(),
    provenance: R1_PROVENANCE,
    outputFilename: R1_REQUIRED_ARCHIVE_FILENAME,
    generatedAt: GENERATED_AT,
    ...options,
  });
}

test("Phase 6 package authority remains fixed, pending, and capped", () => {
  assert.deepEqual(TOPOLOGY_SECTIONS, [
    "00-provenance", "01-baseline", "02-cross-engine", "03-homepage-motion",
    "04-supporting-routes", "05-history-bfcache", "06-performance", "07-memory",
    "08-network-media", "09-accessibility", "10-poster-study", "11-physical-device",
    "12-regression", "13-package",
  ]);
  assert.equal(REPORT_SPECS.length, 4);
  assert.equal(Object.keys(HUMAN_REVIEW_GATES).length, 6);
  assert.ok(Object.values(HUMAN_REVIEW_GATES).every((value) => value === "PENDING HUMAN REVIEW"));
  assert.ok(Object.values(AUTHORIZATION).every((value) => value === false));
  assert.equal(MAX_ARCHIVE_BYTES, 75 * 1024 * 1024);
  assert.equal(REQUIRED_BRANCH, "feature/phase-6-global-hardening");
  assert.equal(ACCEPTED_PHASE5B_SHA, "005a36860ecbfd6fedb3d3f2223f168c1edfbb05");
  assert.equal(FROZEN_MAIN_SHA, "501040c42bba30b9d9517b88a8f9857992a2dba4");
  assert.equal(REQUIRED_BRANCH_URL, "https://feature-phase-6-global-harde.qsite1.pages.dev/");
  assert.equal(REQUIRED_ARCHIVE_FILENAME, "phase-6-global-hardening-human-review.zip");
});

test("package and auditor CLIs enforce the exact Phase 6 and Cloudflare authorities", () => {
  const common = [
    "--expected-head", EXPECTED.expectedHead,
    "--branch", EXPECTED.branch,
    "--deployment-id", EXPECTED.deploymentId,
    "--immutable-url", EXPECTED.immutableUrl,
    "--branch-url", EXPECTED.branchUrl,
  ];
  const packageOptions = parsePackageArguments(["--evidence-root", "fixture-evidence", "--output", REQUIRED_ARCHIVE_FILENAME, "--generated-at", GENERATED_AT, ...common]);
  assert.equal(packageOptions.expectedHead, EXPECTED.expectedHead);
  assert.equal(packageOptions.deploymentId, EXPECTED.deploymentId);
  assert.match(packageOptions.output, new RegExp(`${REQUIRED_ARCHIVE_FILENAME.replaceAll(".", "\\.")}$`));
  assert.equal(validateOptionShape(packageOptions).immutableUrl, EXPECTED.immutableUrl);
  const auditOptions = parseAuditArguments(["--archive", REQUIRED_ARCHIVE_FILENAME, "--manifest", "phase-6-global-hardening-human-review-manifest.json", "--audit-output", "phase-6-global-hardening-human-review-audit.json", ...common, "--expected-parent-process-id", "123"]);
  assert.equal(auditOptions.branch, EXPECTED.branch);
  assert.equal(auditOptions.expectedParentProcessId, 123);
  assert.throws(() => validateOptionShape({ ...packageOptions, expectedHead: "not-a-sha" }), /expected-head/);
  assert.throws(() => validateOptionShape({ ...packageOptions, branch: "feature/phase-6-fixture" }), /branch must be exactly/);
  assert.throws(() => validateOptionShape({ ...packageOptions, deploymentId: "fixture-deployment" }), /Cloudflare deployment UUID/);
  assert.throws(() => validateOptionShape({ ...packageOptions, immutableUrl: "https://87654321.qsite1.pages.dev/" }), /immutable-url must be exactly/);
  assert.throws(() => validateOptionShape({ ...packageOptions, branchUrl: "https://another.qsite1.pages.dev/" }), /branch-url must be exactly/);
  assert.throws(() => validateOptionShape({ ...packageOptions, generatedAt: "August 30, 2026" }), /canonical ISO/);
  assert.throws(() => validateOptionShape({ ...packageOptions, output: path.resolve("fixture.zip") }), /output basename must be exactly/);
});

test("Phase 6-R1 packaging selects only the exact repair authority while preserving legacy defaults", async () => {
  assert.equal(R1_PACKAGE_SCHEMA, "quantum-hub.phase-6-r1.validation-closure-human-review.v1");
  assert.equal(R1_REQUIRED_BRANCH, "repair/phase-6-r1-validation-closure");
  assert.equal(R1_REQUIRED_PARENT, "aee036740b129624c54b8f1b878229f955d187ae");
  assert.equal(R1_REQUIRED_BRANCH_URL, "https://repair-phase-6-r1-validation.qsite1.pages.dev/");
  assert.equal(R1_REQUIRED_ARCHIVE_FILENAME, "phase-6-r1-validation-closure-human-review.zip");

  const common = [
    "--authority-profile", "phase6-r1",
    "--expected-head", R1_EXPECTED.expectedHead,
    "--branch", R1_EXPECTED.branch,
    "--deployment-id", R1_EXPECTED.deploymentId,
    "--deployment-check-run-id", R1_EXPECTED.deploymentCheckRunId,
    "--immutable-url", R1_EXPECTED.immutableUrl,
    "--branch-url", R1_EXPECTED.branchUrl,
  ];
  const packageOptions = parsePackageArguments(["--evidence-root", "fixture-evidence", "--output", R1_REQUIRED_ARCHIVE_FILENAME, "--generated-at", GENERATED_AT, ...common]);
  assert.equal(packageOptions.authorityProfile, "phase6-r1");
  assert.equal(packageOptions.deploymentCheckRunId, R1_DEPLOYMENT_CHECK_RUN_ID);
  assert.equal(dryRunReport("phase6").requiredReports.length, 4);
  assert.deepEqual(dryRunReport("phase6-r1").requiredReports, [...REPORT_SPECS, R1_CLOSURE_REPORT_SPEC]);
  assert.equal(packageSelfTest("phase6-r1").humanEvidenceStatus, "PENDING HUMAN REVIEW");
  const { stdout: selfTestStdout } = await execFileAsync(process.execPath, [PACKAGER, "--authority-profile", "phase6-r1", "--self-test"], { cwd: TEST_ROOT, encoding: "utf8", windowsHide: true });
  assert.deepEqual(JSON.parse(selfTestStdout), packageSelfTest("phase6-r1"));
  assert.equal(validateOptionShape(packageOptions).branch, R1_REQUIRED_BRANCH);
  const auditOptions = parseAuditArguments(["--archive", R1_REQUIRED_ARCHIVE_FILENAME, "--manifest", "phase-6-r1-validation-closure-human-review-manifest.json", "--audit-output", "phase-6-r1-validation-closure-human-review-audit.json", ...common, "--expected-parent-process-id", "123"]);
  assert.equal(auditOptions.authorityProfile, "phase6-r1");
  assert.equal(auditOptions.deploymentCheckRunId, R1_DEPLOYMENT_CHECK_RUN_ID);
  assert.equal(auditOptions.branch, R1_REQUIRED_BRANCH);
  assert.throws(() => validateOptionShape({ ...packageOptions, authorityProfile: "phase6", branch: REQUIRED_BRANCH }), /output basename must be exactly/);
  assert.throws(() => validateOptionShape({ ...packageOptions, branch: REQUIRED_BRANCH }), /branch must be exactly/);
  assert.throws(() => validateOptionShape({ ...packageOptions, branchUrl: REQUIRED_BRANCH_URL }), /branch-url must be exactly/);
  assert.throws(() => validateOptionShape({ ...packageOptions, deploymentCheckRunId: "0" }), /deployment-check-run-id/);
  assert.throws(() => validateOptionShape({ ...packageOptions, deploymentCheckRunId: null }), /deployment-check-run-id/);
  assert.throws(() => parsePackageArguments(["--authority-profile"]), /requires a value/);

  const packageDocument = JSON.parse(await readFile(path.join(TEST_ROOT, "package.json"), "utf8"));
  assert.equal(packageDocument.scripts["package:phase6-r1-review"], "node scripts/package-phase6-human-review.mjs --authority-profile phase6-r1");
  assert.equal(packageDocument.scripts["audit:phase6-r1-review"], "node scripts/audit-phase6-human-review-package.mjs --authority-profile phase6-r1");
});

test("an assembled Phase 6-R1 artifact passes only under its R1 package and deployment schemas", () => {
  const humanBinding = validateR1HumanEvidencePayload(fixtureR1PayloadEntries());
  assert.equal(humanBinding.recordings.length, 4);
  assert.deepEqual(humanBinding.recordings.map(({ filename }) => filename).sort(), [...R1_REQUIRED_HUMAN_RECORDINGS].sort());
  const artifacts = fixtureR1Artifacts();
  assert.equal(artifacts.manifest.schema, R1_PACKAGE_SCHEMA);
  assert.equal(artifacts.detached.schema, `${R1_PACKAGE_SCHEMA}.detached-manifest`);
  assert.equal(artifacts.manifest.provenance.authorityProfile, "phase6-r1");
  assert.equal(artifacts.manifest.provenance.exactParent, R1_REQUIRED_PARENT);
  assert.equal(artifacts.manifest.deploymentVerification.schema, R1_DEPLOYMENT_VERIFICATION_SCHEMA);
  const result = auditBuffers({
    archiveBytes: artifacts.archiveBytes,
    detachedBytes: artifacts.detachedBytes,
    archiveFilename: R1_REQUIRED_ARCHIVE_FILENAME,
    expected: R1_EXPECTED,
  });
  assert.equal(result.manifest.schema, R1_PACKAGE_SCHEMA);
  assert.match(parseStoredZip(artifacts.archiveBytes).entries.get("13-package/README.md").toString("utf8"), /five tracked Phase 6-R1 reports/);
  assert.equal(result.deploymentVerification.binding.schema, R1_DEPLOYMENT_VERIFICATION_SCHEMA);
  assert.deepEqual(result.manifest.humanEvidence, humanBinding);
  assert.deepEqual(validateR1HumanEvidenceEntries(parseStoredZip(artifacts.archiveBytes).entries), humanBinding);
  assert.throws(() => auditBuffers({ archiveBytes: artifacts.archiveBytes, detachedBytes: artifacts.detachedBytes, archiveFilename: REQUIRED_ARCHIVE_FILENAME, expected: EXPECTED }), /in-archive manifest authority differs|detached archive binding differs/);
  assert.throws(() => auditBuffers({ archiveBytes: artifacts.archiveBytes, detachedBytes: artifacts.detachedBytes, archiveFilename: REQUIRED_ARCHIVE_FILENAME, expected: R1_EXPECTED }), /archive filename must be exactly/);
  assert.throws(() => buildPackageArtifacts({ payloadEntries: fixtureR1PayloadEntries(), provenance: R1_PROVENANCE, outputFilename: REQUIRED_ARCHIVE_FILENAME, generatedAt: GENERATED_AT }), /output filename must be exactly/);
});

test("Phase 6-R1 canonical assembler inventory, wrappers, taxonomy and roles fail closed in packager and auditor", () => {
  const assertBothReject = (entries, pattern) => {
    assert.throws(() => validateR1CanonicalEvidencePayload(entries), pattern);
    assert.throws(() => validateR1CanonicalEvidenceEntries(r1EntryMap(entries)), pattern);
  };

  const missingInventory = fixtureR1PayloadEntries().filter(({ path: relativePath }) => relativePath !== "13-package/evidence-assembly-summary.json");
  assertBothReject(missingInventory, /evidence-assembly-summary|omits/);

  const placeholderSummary = rebindAssemblerMutation(fixtureR1PayloadEntries(), "06-performance/section-summary.json", () => ({}));
  assertBothReject(placeholderSummary, /section summary differs: 06-performance/);

  const renamedRequirement = rebindAssemblerMutation(fixtureR1PayloadEntries(), "06-performance/section-summary.json", (bytes) => {
    const summary = JSON.parse(bytes.toString("utf8"));
    summary.requirements[0].requirement = "generic performance PASS";
    return summary;
  });
  assertBothReject(renamedRequirement, /section summary differs: 06-performance/);

  const mismatchedRequirementEvidence = rebindAssemblerMutation(fixtureR1PayloadEntries(), "06-performance/section-summary.json", (bytes) => {
    const summary = JSON.parse(bytes.toString("utf8"));
    summary.requirements[0].evidenceRoles = ["regression-summary"];
    return summary;
  });
  assertBothReject(mismatchedRequirementEvidence, /section requirement evidence binding differs/);

  const malformedReservedLedger = fixtureR1PayloadEntries();
  replaceEntry(malformedReservedLedger, "13-package/evidence-assembly-summary.json", (bytes) => {
    const inventory = JSON.parse(bytes.toString("utf8"));
    inventory.reservedPathsAbsent = inventory.reservedPathsAbsent.filter((relativePath) => relativePath !== R1_CLOSURE_REPORT_SPEC.archive);
    return inventory;
  });
  assertBothReject(malformedReservedLedger, /inventory authority differs/);

  const malformedLifecycle = rebindAssemblerMutation(fixtureR1PayloadEntries(), "05-history-bfcache/r1-persistent-lifecycle.json", (bytes) => {
    const wrapper = JSON.parse(bytes.toString("utf8"));
    wrapper.schema = "fixture.invalid-wrapper";
    return wrapper;
  });
  assertBothReject(malformedLifecycle, /persistent-lifecycle-summary wrapper differs/);

  const lifecycleWithoutRawStates = rebindAssemblerMutation(fixtureR1PayloadEntries(), "05-history-bfcache/r1-persistent-lifecycle.json", (bytes) => {
    const wrapper = JSON.parse(bytes.toString("utf8"));
    delete wrapper.payload.history.states;
    return wrapper;
  });
  assertBothReject(lifecycleWithoutRawStates, /history state ledger|persistent-lifecycle|history authority/);

  const sameRouteFreshDocumentEntries = (mutateRequest = () => undefined) => rebindAssemblerMutation(
    fixtureR1PayloadEntries(),
    "05-history-bfcache/r1-persistent-lifecycle.json",
    (bytes) => {
      const wrapper = JSON.parse(bytes.toString("utf8"));
      const report = wrapper.payload;
      const selectedPath = report.mediaRequests.documents[0].paths[0];
      const entryBackDocumentId = "entry-back-document";
      const entryBackState = report.history.states.entryBack;
      entryBackState.documentId = entryBackDocumentId;
      entryBackState.probe.documentId = entryBackDocumentId;
      entryBackState.probe.resources[0].startTime = 30;
      for (const field of ["src", "currentSrc", "srcAttribute"]) {
        entryBackState.home.source[field] = `blob:https://example.pages.dev/${entryBackDocumentId}`;
      }
      report.listeners.comparisons = report.listeners.comparisons.filter(({ name }) => name !== "entry-back");
      const bareDocument = structuredClone(report.mediaRequests.documents.find(({ documentId }) => documentId === "bare-document"));
      const entryDocument = structuredClone(report.mediaRequests.documents.find(({ documentId }) => documentId === "entry-document"));
      entryDocument.labels = ["entry-initial", "entry-resolved"];
      const entryBackDocument = { ...structuredClone(entryDocument), documentId: entryBackDocumentId, labels: ["entry-back"] };
      report.mediaRequests.documents = [bareDocument, entryBackDocument, entryDocument]
        .sort((left, right) => left.documentId.localeCompare(right.documentId));
      const bareRequest = structuredClone(report.mediaRequests.network.phase4Requests[0]);
      const entryRequest = { ...structuredClone(report.mediaRequests.network.phase4Requests[1]), range: null };
      const entryBackRequest = {
        ...structuredClone(entryRequest),
        frameDocumentGeneration: 3,
        frameDocumentId: entryBackDocumentId,
      };
      mutateRequest(entryBackRequest);
      report.mediaRequests.network.phase4Requests = [bareRequest, entryRequest, entryBackRequest];
      Object.assign(report.mediaRequests.network, {
        requestCount: 3,
        rangeRequestCount: 1,
        nonRangeRequestCount: 2,
        nonRangeSelections: [{ path: selectedPath, count: 2, logicalHomeDocuments: 3 }],
      });
      return wrapper;
    },
  );
  const sameRouteFreshDocument = sameRouteFreshDocumentEntries();
  assert.doesNotThrow(() => validateR1CanonicalEvidencePayload(sameRouteFreshDocument), "packager rejected distinct same-route Document correlations");
  assert.doesNotThrow(() => validateR1CanonicalEvidenceEntries(r1EntryMap(sameRouteFreshDocument)), "auditor rejected distinct same-route Document correlations");
  const restoredDocumentRangeTraffic = rebindAssemblerMutation(
    sameRouteFreshDocumentEntries(),
    "05-history-bfcache/r1-persistent-lifecycle.json",
    (bytes) => {
      const wrapper = JSON.parse(bytes.toString("utf8"));
      wrapper.payload.mediaRequests.network.phase4Requests.push({
        ...structuredClone(wrapper.payload.mediaRequests.network.phase4Requests[1]),
        frameDocumentGeneration: 4,
        range: "bytes=1024-2047",
      });
      wrapper.payload.mediaRequests.network.requestCount = 4;
      wrapper.payload.mediaRequests.network.rangeRequestCount = 2;
      return wrapper;
    },
  );
  assert.doesNotThrow(() => validateR1CanonicalEvidencePayload(restoredDocumentRangeTraffic), "packager rejected one restored Document across browser generations");
  assert.doesNotThrow(() => validateR1CanonicalEvidenceEntries(r1EntryMap(restoredDocumentRangeTraffic)), "auditor rejected one restored Document across browser generations");
  for (const [name, mutate] of Object.entries({
    missingFrameDocumentId: (request) => { request.frameDocumentId = null; },
    collapsedFrameDocumentId: (request) => { request.frameDocumentId = "entry-document"; },
    missingDocumentGeneration: (request) => { request.frameDocumentGeneration = null; },
    collapsedDocumentGeneration: (request) => { request.frameDocumentGeneration = 2; },
    pendingCorrelation: (request) => { request.documentIdentityCorrelation = "PENDING"; },
    mismatchedCorrelatedUrl: (request) => { request.correlatedDocumentUrl = R1_EXPECTED.branchUrl; },
    mismatchedNavigationProvenance: (request) => { request.frameNavigationId = "navigation-bare"; },
  })) {
    assertBothReject(sameRouteFreshDocumentEntries(mutate), /expectedPhase4Present contradicts raw documents\/requests|persistent-lifecycle/, `${name} passed package boundaries`);
  }

  const motionWithoutObservations = rebindAssemblerMutation(fixtureR1PayloadEntries(), "03-homepage-motion/r1/chromium/motion-evidence-report.json", (bytes) => {
    const wrapper = JSON.parse(bytes.toString("utf8"));
    delete wrapper.payload.recordings[0].observations;
    return wrapper;
  });
  assertBothReject(motionWithoutObservations, /motion observations differ|motion report binding differs|motion recording binding differs|motion recording contract differs/);

  const motionWithoutRawSamples = rebindAssemblerMutation(fixtureR1PayloadEntries(), "03-homepage-motion/r1/chromium/motion-evidence-report.json", (bytes) => {
    const wrapper = JSON.parse(bytes.toString("utf8"));
    wrapper.payload.recordings[0].observations.samples = [];
    return wrapper;
  });
  assertBothReject(motionWithoutRawSamples, /motion sample inventory differs/);

  const sparseAccessibility = rebindAssemblerMutation(fixtureR1PayloadEntries(), "09-accessibility/accessibility-chromium.json", (bytes) => {
    const wrapper = JSON.parse(bytes.toString("utf8"));
    wrapper.payload.engines[0].keyboard[0] = { route: "/", status: "PASS", failures: [] };
    return wrapper;
  });
  assertBothReject(sparseAccessibility, /accessibility|keyboard/i);

  for (const [name, mutate] of Object.entries({
    alreadyAtEntryHash: (preparation) => { preparation.state.hash = "#entry"; },
    alreadyAtEntryRoute: (preparation) => { preparation.state.route = "/#entry"; },
    impossibleWheelStepCount: (preparation) => { preparation.wheelSteps = 25; },
    wrongCinematicMode: (preparation) => { preparation.state.cinematicMode = "fallback"; },
    wrongMediaState: (preparation) => { preparation.state.mediaState = "loading"; },
  })) {
    const contradictoryPreparation = rebindAssemblerMutation(fixtureR1PayloadEntries(), "09-accessibility/accessibility-chromium.json", (bytes) => {
      const wrapper = JSON.parse(bytes.toString("utf8"));
      const preparation = wrapper.payload.engines[0].keyboard.find(({ route }) => route === "home").desktopHome.preparation;
      mutate(preparation);
      return wrapper;
    });
    assertBothReject(contradictoryPreparation, /accessibility|keyboard|preparation/i, `${name} passed package boundaries`);
  }

  for (const [name, mutate] of Object.entries({
    focusVisibilityTimeout: (row) => { row.firstVisibilityReady = false; },
    partialTop: (row) => { row.first.rect.top = -1; },
    partialLeft: (row) => { row.first.rect.left = -1; },
    partialBottom: (row) => { row.first.rect.bottom = 901; },
    partialRight: (row) => { row.first.rect.right = 1441; },
  })) {
    const incompleteFocusVisibility = rebindAssemblerMutation(fixtureR1PayloadEntries(), "09-accessibility/accessibility-chromium.json", (bytes) => {
      const wrapper = JSON.parse(bytes.toString("utf8"));
      mutate(wrapper.payload.engines[0].keyboard[0]);
      return wrapper;
    });
    assertBothReject(incompleteFocusVisibility, /accessibility|keyboard|focus/i, `${name} passed package boundaries`);
  }

  const falseKeyboardPass = rebindAssemblerMutation(fixtureR1PayloadEntries(), "09-accessibility/section-summary.json", (bytes) => {
    const summary = JSON.parse(bytes.toString("utf8"));
    summary.requirements.find(({ requirement }) => requirement === "keyboard").status = "PASS";
    return summary;
  });
  assertBothReject(falseKeyboardPass, /falsely promotes keyboard/);

  let unobservedWindowsPromotedByHuman = rebindAssemblerMutation(fixtureR1PayloadEntries(), R1_HUMAN_LEDGER_PATH, (bytes) => {
    const wrapper = JSON.parse(bytes.toString("utf8"));
    for (const filename of ["iphone-safari-opening.mp4", "iphone-safari-maradin.mp4"]) {
      const record = wrapper.payload.entries.find((entry) => entry.filename === filename);
      record.status = "PASS";
      record.device = "iPhone 15";
      record.os = "iOS 19";
      record.browser = "Safari 19";
      record.testSteps = ["Review the physical Safari background and foreground transition."];
      record.observedResult = "All visibly demonstrated lifecycle checks passed.";
      record.checks = Object.fromEntries(Object.keys(record.checks).map((check) => [check, true]));
      record.observations = Object.keys(record.checks).map((checkId) => ({ checkId, status: "PASS", result: "Observed successfully.", timestamp: null, frame: null }));
    }
    wrapper.source.sha256 = sha256(Buffer.from(stableJson(wrapper.payload)));
    return wrapper;
  });
  unobservedWindowsPromotedByHuman = rebindAssemblerMutation(unobservedWindowsPromotedByHuman, "03-homepage-motion/section-summary.json", (bytes) => {
    const summary = JSON.parse(bytes.toString("utf8"));
    summary.requirements.find(({ requirement }) => requirement === "hidden/visible behavior").status = "PASS";
    return summary;
  });
  assertBothReject(unobservedWindowsPromotedByHuman, /hidden\/visible taxonomy/);

  const unknownRole = fixtureR1PayloadEntries();
  const extra = { path: "12-regression/repository-source.txt", data: Buffer.from("repository source dump fixture\n") };
  unknownRole.push(extra);
  replaceEntry(unknownRole, "13-package/evidence-assembly-summary.json", (bytes) => {
    const inventory = JSON.parse(bytes.toString("utf8"));
    inventory.inventoryExcludingSelf.push({ path: extra.path, role: "unrecognized", byteSize: extra.data.length, sha256: sha256(extra.data) });
    inventory.inventoryExcludingSelf.sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
    inventory.inventoryExcludingSelfBytes += extra.data.length;
    return inventory;
  });
  assertBothReject(unknownRole, /inventory path\/role topology differs|inventory record differs/);

  const forgedAllowedExtra = fixtureR1PayloadEntries();
  const forged = { path: "12-regression/forged-extra.json", role: "generated", data: Buffer.from(stableJson({ schema: "forged.repository.snapshot", status: "PASS" })) };
  forgedAllowedExtra.push(forged);
  replaceEntry(forgedAllowedExtra, "12-regression/section-summary.json", (bytes) => {
    const summary = JSON.parse(bytes.toString("utf8"));
    summary.evidence.push({ path: forged.path, role: forged.role, byteSize: forged.data.length, sha256: sha256(forged.data) });
    return summary;
  });
  replaceEntry(forgedAllowedExtra, "13-package/evidence-assembly-summary.json", (bytes) => {
    const inventory = JSON.parse(bytes.toString("utf8"));
    const summary = forgedAllowedExtra.find(({ path: relativePath }) => relativePath === "12-regression/section-summary.json");
    const summaryRecord = inventory.inventoryExcludingSelf.find(({ path: relativePath }) => relativePath === summary.path);
    summaryRecord.byteSize = summary.data.length;
    summaryRecord.sha256 = sha256(summary.data);
    inventory.inventoryExcludingSelf.push({ path: forged.path, role: forged.role, byteSize: forged.data.length, sha256: sha256(forged.data) });
    inventory.inventoryExcludingSelf.sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
    inventory.inventoryExcludingSelfBytes = inventory.inventoryExcludingSelf.reduce((sum, record) => sum + record.byteSize, 0);
    return inventory;
  });
  assertBothReject(forgedAllowedExtra, /inventory path\/role topology differs/);
});

test("Phase 6-R1 package media authority rejects signature-only pseudo-MP4 files independently", () => {
  const ftyp = Buffer.alloc(16);
  ftyp.write("isom", 0, 4, "ascii");
  ftyp.writeUInt32BE(0x200, 4);
  ftyp.write("isom", 8, 4, "ascii");
  const signatureOnly = isoBox("ftyp", ftyp);
  assert.throws(() => validatePackageMp4(signatureOnly, "signature-only.mp4"), /ftyp\/moov\/mdat authority/);
  assert.throws(() => validateAuditMp4(signatureOnly, "signature-only.mp4"), /ftyp\/moov\/mdat authority/);
  assert.doesNotThrow(() => validatePackageMp4(fixtureMp4("valid"), "valid.mp4"));
  assert.doesNotThrow(() => validateAuditMp4(fixtureMp4("valid"), "valid.mp4"));
});

test("Phase 6-R1 Node 22 and change-ledger authority cannot be replaced by generic PASS metadata", () => {
  const assertBothReject = (entries, pattern) => {
    assert.throws(() => validateR1CanonicalEvidencePayload(entries), pattern);
    assert.throws(() => validateR1CanonicalEvidenceEntries(r1EntryMap(entries)), pattern);
  };
  const node24 = rebindAssemblerMutation(fixtureR1PayloadEntries(), "00-provenance/node22-integrated-validation.json", (bytes) => {
    const wrapper = JSON.parse(bytes.toString("utf8"));
    wrapper.payload.runtime.node = "v24.18.0";
    return wrapper;
  });
  assertBothReject(node24, /Node 22|node22|runtime/i);

  const forgedLogHash = rebindAssemblerMutation(fixtureR1PayloadEntries(), "00-provenance/node22-integrated-validation.json", (bytes) => {
    const wrapper = JSON.parse(bytes.toString("utf8"));
    wrapper.payload.outcomes[0].logText += "forged success\n";
    return wrapper;
  });
  assertBothReject(forgedLogHash, /embedded npm-ci log hash binding differs/);

  const extraOutcome = rebindAssemblerMutation(fixtureR1PayloadEntries(), "00-provenance/node22-integrated-validation.json", (bytes) => {
    const wrapper = JSON.parse(bytes.toString("utf8"));
    const logText = "forged extra outcome\n";
    wrapper.payload.outcomes.push({ id: "forged-extra", status: "FAIL", log: "forged-extra.log", logText, logSha256: sha256(Buffer.from(logText)) });
    return wrapper;
  });
  assertBothReject(extraOutcome, /exact outcome inventory differs|outcome inventory must contain exactly/);

  const productionChange = rebindAssemblerMutation(fixtureR1PayloadEntries(), "00-provenance/change-ledger.json", (bytes) => {
    const ledger = JSON.parse(bytes.toString("utf8"));
    ledger.productionFiles = ["src/pages/index.astro"];
    return ledger;
  });
  assertBothReject(productionChange, /change ledger differs|change-ledger/i);

  const falseInnerRepositoryStatus = rebindAssemblerMutation(fixtureR1PayloadEntries(), DEPLOYMENT_VERIFICATION_PATH, (bytes) => {
    const deployment = JSON.parse(bytes.toString("utf8"));
    deployment.repository.data.status = "FAIL";
    return deployment;
  });
  assertBothReject(falseInnerRepositoryStatus, /non-PASS string status|deployment\/change-ledger authority differs|repository authority differs/);

  const omittedTooling = rebindAssemblerMutation(fixtureR1PayloadEntries(), "00-provenance/change-ledger.json", (bytes) => {
    const ledger = JSON.parse(bytes.toString("utf8"));
    ledger.toolingReportFiles.pop();
    ledger.trackedFileDelta -= 1;
    return ledger;
  });
  assertBothReject(omittedTooling, /18-path authority|change ledger differs/i);

  const forgedChangeStatus = rebindAssemblerMutation(fixtureR1PayloadEntries(), "00-provenance/change-ledger.json", (bytes) => {
    const ledger = JSON.parse(bytes.toString("utf8"));
    ledger.toolingReportFiles[0].status = "M";
    return ledger;
  });
  assertBothReject(forgedChangeStatus, /18-path authority|change ledger differs/i);

  const fakeTreeHash = rebindAssemblerMutation(fixtureR1PayloadEntries(), "00-provenance/repository-authority.json", (bytes) => {
    const authority = JSON.parse(bytes.toString("utf8"));
    authority.repository.finalTree = "f".repeat(64);
    return authority;
  });
  assertBothReject(fakeTreeHash, /repository authority differs/);
});

test("Phase 6-R1 human review semantics reject contradictory status, false identity and invalid failure locations", () => {
  const assertHumanBothReject = (entries, pattern) => {
    assert.throws(() => validateR1HumanEvidencePayload(entries), pattern);
    assert.throws(() => validateR1HumanEvidenceEntries(r1EntryMap(entries)), pattern);
  };
  const mutateLedger = (mutate) => fixtureR1PayloadEntries().map((entry) => {
    if (entry.path !== R1_HUMAN_LEDGER_PATH) return entry;
    const wrapper = JSON.parse(entry.data.toString("utf8"));
    mutate(wrapper.payload, wrapper);
    return { ...entry, data: Buffer.from(stableJson(wrapper)) };
  });

  const contradiction = mutateLedger((ledger) => {
    const record = ledger.entries.find(({ filename }) => filename === "iphone-safari-opening.mp4");
    record.status = "PASS";
    record.device = "iPhone 15";
    record.os = "iOS 19";
    record.browser = "Safari 19";
    record.testSteps = ["Physical iPhone Safari review completed."];
    const checks = ["correctDormantOpening", "firstPracticalSwipeResponse", "nativeMomentum", "stopAtPhysicalState", "reverseReconstruction", "lineRasterQ", "autonomousManifestoFade", "noF1FlashFromIntentionalHome", "orientationStability", "backgroundForeground"];
    record.checks = Object.fromEntries(checks.map((check) => [check, true]));
    record.observations = checks.map((checkId) => ({ checkId, status: checkId === "backgroundForeground" ? "FAIL" : "PASS", result: checkId === "backgroundForeground" ? "Duplicate source appears on return." : "Observed successfully.", timestamp: checkId === "backgroundForeground" ? "00:01.250" : null, frame: null }));
    record.observedResult = "FAIL — duplicate source appears on return.";
    record.failureReferences = [];
  });
  assertHumanBothReject(contradiction, /observation backgroundForeground status contradicts|PASS text contradicts/);

  const invalidLocation = mutateLedger((ledger, wrapper) => {
    const record = ledger.entries.find(({ filename }) => filename === "physical-scroll-input.mp4");
    record.status = "FAIL";
    record.device = "Physical trackpad";
    record.os = "Windows 11";
    record.testSteps = ["Use the physical trackpad."];
    const checks = ["noPositiveInputDeadZone", "nativeInertiaSovereign", "promptReversal", "noCatchUpAnimation", "freezesAtRest", "noForcedSnapping", "supportingRoutesOrdinaryFlow"];
    record.checks = Object.fromEntries(checks.map((check) => [check, check !== "noPositiveInputDeadZone"]));
    record.observations = checks.map((checkId) => ({ checkId, status: checkId === "noPositiveInputDeadZone" ? "FAIL" : "PASS", result: checkId === "noPositiveInputDeadZone" ? "Dead zone observed." : "Observed successfully.", timestamp: checkId === "noPositiveInputDeadZone" ? "not supplied" : null, frame: null }));
    record.observedResult = "FAIL — dead zone observed.";
    record.failureReferences = [{ check: "noPositiveInputDeadZone", timestamp: "not supplied", frame: null, observation: "Dead zone observed." }];
    ledger.status = "FAIL";
    wrapper.status = "FAIL";
  });
  assertHumanBothReject(invalidLocation, /requires a check and timestamp or frame/);

  const wrongIphoneIdentity = mutateLedger((ledger) => {
    const record = ledger.entries.find(({ filename }) => filename === "iphone-safari-maradin.mp4");
    record.status = "PASS";
    record.device = "Desktop PC";
    record.os = "Windows 11";
    record.browser = "Safari 19";
    record.testSteps = ["Reviewed on desktop Safari."];
    record.checks = Object.fromEntries(Object.keys(record.checks).map((check) => [check, true]));
    record.observations = Object.keys(record.checks).map((checkId) => ({ checkId, status: "PASS", result: "Observed successfully.", timestamp: null, frame: null }));
    record.observedResult = "All checks passed.";
  });
  assertHumanBothReject(wrongIphoneIdentity, /device\/OS must identify iPhone and iOS/);

  const substitutedBytes = fixtureR1PayloadEntries();
  const substitutedFilename = "physical-scroll-input.mp4";
  const substitutedPath = `11-physical-device/recordings/${substitutedFilename}`;
  const substitutedVideo = substitutedBytes.find(({ path: relativePath }) => relativePath === substitutedPath);
  const substitutedWrapperEntry = substitutedBytes.find(({ path: relativePath }) => relativePath === R1_HUMAN_LEDGER_PATH);
  const substitutedWrapper = JSON.parse(substitutedWrapperEntry.data.toString("utf8"));
  const substitutedRecord = substitutedWrapper.payload.entries.find(({ filename }) => filename === substitutedFilename);
  substitutedRecord.status = "PASS";
  substitutedRecord.device = "Physical trackpad";
  substitutedRecord.os = "Windows 11";
  substitutedRecord.testSteps = ["Use the physical trackpad across the physical and supporting-route checks."];
  substitutedRecord.checks = Object.fromEntries(Object.keys(substitutedRecord.checks).map((check) => [check, true]));
  substitutedRecord.observations = Object.keys(substitutedRecord.checks).map((checkId) => ({ checkId, status: "PASS", result: "Observed successfully.", timestamp: null, frame: null }));
  substitutedRecord.observedResult = "All required checks passed.";
  substitutedRecord.reviewedSha256 = substitutedRecord.sha256;
  substitutedRecord.reviewedByteSize = substitutedRecord.byteSize;
  const replacementBytes = fixtureMp4("replacement physical bytes under the same filename");
  substitutedVideo.data = replacementBytes;
  substitutedRecord.sha256 = sha256(replacementBytes);
  substitutedRecord.byteSize = replacementBytes.length;
  substitutedRecord.mediaValidation = validatePackageMp4(replacementBytes, substitutedFilename);
  substitutedWrapperEntry.data = Buffer.from(stableJson(substitutedWrapper));
  assertHumanBothReject(substitutedBytes, /review is not bound to the supplied recording bytes/);

  const forgedMediaFacts = mutateLedger((ledger) => {
    ledger.entries[0].mediaValidation.durationSeconds += 1;
  });
  assertHumanBothReject(forgedMediaFacts, /media validation is not bound to the supplied bytes/);

  const failedPhysicalReview = ({ timestamp, frame }) => mutateLedger((ledger, wrapper) => {
    const record = ledger.entries.find(({ filename }) => filename === "physical-scroll-input.mp4");
    const failedCheck = "noPositiveInputDeadZone";
    record.status = "FAIL";
    record.device = "Physical trackpad";
    record.os = "Windows 11";
    record.testSteps = ["Use the physical trackpad and inspect the first positive input response."];
    record.checks = Object.fromEntries(Object.keys(record.checks).map((check) => [check, check !== failedCheck]));
    record.observations = Object.keys(record.checks).map((checkId) => ({
      checkId,
      status: checkId === failedCheck ? "FAIL" : "PASS",
      result: checkId === failedCheck ? "Failure observed: positive-input dead zone." : "Observed successfully.",
      timestamp: checkId === failedCheck ? timestamp : null,
      frame: checkId === failedCheck ? frame : null,
    }));
    record.observedResult = "Failure observed: positive-input dead zone.";
    record.reviewedSha256 = record.sha256;
    record.reviewedByteSize = record.byteSize;
    record.failureReferences = [{ check: failedCheck, timestamp, frame, observation: "Failure observed: positive-input dead zone." }];
    ledger.status = "FAIL";
    wrapper.status = "FAIL";
  });
  assertHumanBothReject(failedPhysicalReview({ timestamp: "00:02.000", frame: null }), /failure timestamp exceeds the recording duration/);
  assertHumanBothReject(failedPhysicalReview({ timestamp: null, frame: 2 }), /failure frame exceeds the recording sample count/);
});

test("Phase 6-R1 packager and auditor reject missing, unbound, invalid, or falsely promoted human recordings", () => {
  const build = (payloadEntries) => buildPackageArtifacts({ payloadEntries, provenance: R1_PROVENANCE, outputFilename: R1_REQUIRED_ARCHIVE_FILENAME, generatedAt: GENERATED_AT });
  const withoutLedger = fixtureR1PayloadEntries().filter(({ path: relativePath }) => relativePath !== R1_HUMAN_LEDGER_PATH);
  assert.throws(() => build(withoutLedger), /requires the human-evidence ledger/);
  assert.throws(() => validateR1HumanEvidenceEntries(new Map(withoutLedger.map(({ path: relativePath, data }) => [relativePath, data]))), /requires the human-evidence ledger/);

  const missingFilename = R1_REQUIRED_HUMAN_RECORDINGS[0];
  const withoutRecording = fixtureR1PayloadEntries().filter(({ path: relativePath }) => relativePath !== `11-physical-device/recordings/${missingFilename}`);
  assert.throws(() => build(withoutRecording), /physical recording inventory differs/);
  assert.throws(() => validateR1HumanEvidenceEntries(new Map(withoutRecording.map(({ path: relativePath, data }) => [relativePath, data]))), /physical recording inventory differs/);

  const unbound = fixtureR1PayloadEntries().map((entry) => {
    if (entry.path !== R1_HUMAN_LEDGER_PATH) return entry;
    const wrapper = JSON.parse(entry.data.toString("utf8"));
    wrapper.payload.entries[0].byteSize += 1;
    return { ...entry, data: Buffer.from(stableJson(wrapper)) };
  });
  assert.throws(() => build(unbound), /not hash\/size\/status bound/);
  assert.throws(() => validateR1HumanEvidenceEntries(new Map(unbound.map(({ path: relativePath, data }) => [relativePath, data]))), /not hash\/size\/status bound/);

  const invalidMp4Filename = R1_REQUIRED_HUMAN_RECORDINGS[0];
  const invalidMp4Path = `11-physical-device/recordings/${invalidMp4Filename}`;
  const invalidMp4 = fixtureR1PayloadEntries();
  const invalidBytes = Buffer.from(invalidMp4.find(({ path: relativePath }) => relativePath === invalidMp4Path).data);
  invalidBytes.fill(0, 4, 8);
  for (const entry of invalidMp4) {
    if (entry.path === invalidMp4Path) entry.data = invalidBytes;
    if (entry.path === R1_HUMAN_LEDGER_PATH) {
      const wrapper = JSON.parse(entry.data.toString("utf8"));
      const record = wrapper.payload.entries.find(({ filename }) => filename === invalidMp4Filename);
      record.byteSize = invalidBytes.length;
      record.sha256 = sha256(invalidBytes);
      entry.data = Buffer.from(stableJson(wrapper));
    }
  }
  assert.throws(() => build(invalidMp4), /MP4 container structure differs/);
  assert.throws(() => validateR1HumanEvidenceEntries(new Map(invalidMp4.map(({ path: relativePath, data }) => [relativePath, data]))), /MP4 container structure differs/);

  const falseOverallPass = fixtureR1PayloadEntries().map((entry) => {
    if (entry.path !== R1_HUMAN_LEDGER_PATH) return entry;
    const wrapper = JSON.parse(entry.data.toString("utf8"));
    wrapper.status = "PASS";
    wrapper.payload.status = "PASS";
    return { ...entry, data: Buffer.from(stableJson(wrapper)) };
  });
  assert.throws(() => build(falseOverallPass), /ledger status must be PENDING HUMAN REVIEW/);
  assert.throws(() => validateR1HumanEvidenceEntries(new Map(falseOverallPass.map(({ path: relativePath, data }) => [relativePath, data]))), /ledger status must be PENDING HUMAN REVIEW/);

  const missingReviewField = fixtureR1PayloadEntries().map((entry) => {
    if (entry.path !== R1_HUMAN_LEDGER_PATH) return entry;
    const wrapper = JSON.parse(entry.data.toString("utf8"));
    delete wrapper.payload.entries[0].device;
    return { ...entry, data: Buffer.from(stableJson(wrapper)) };
  });
  assert.throws(() => build(missingReviewField), /review metadata is incomplete/);
  assert.throws(() => validateR1HumanEvidenceEntries(new Map(missingReviewField.map(({ path: relativePath, data }) => [relativePath, data]))), /review metadata is incomplete/);
});

test("Phase 6-R1 deployment semantics fail closed on parent, production-diff, and signed-app mismatches", () => {
  const mutateDeployment = (mutate) => fixtureR1PayloadEntries().map((entry) => {
    if (entry.path !== DEPLOYMENT_VERIFICATION_PATH) return entry;
    const document = JSON.parse(entry.data.toString("utf8"));
    mutate(document);
    return { ...entry, data: Buffer.from(stableJson(document)) };
  });
  const build = (payloadEntries) => buildPackageArtifacts({ payloadEntries, provenance: R1_PROVENANCE, outputFilename: R1_REQUIRED_ARCHIVE_FILENAME, generatedAt: GENERATED_AT });
  assert.throws(() => build(mutateDeployment((document) => { document.inputs.exactParent = "b".repeat(40); })), /deployment verification inputs/);
  assert.throws(() => build(mutateDeployment((document) => { document.repository.data.productionSourceDiff = ["src/pages/index.astro"]; })), /production-source diff/);
  assert.throws(() => build(mutateDeployment((document) => { document.deployment.data.appSlug = "cloudflare-pages"; })), /Cloudflare app authority/);
  assert.throws(() => build(mutateDeployment((document) => { document.checks.zeroProductionSourceDiff = false; })), /deployment verification checks/);
});

test("Phase 6-R1 raw deployment parity and signed check-run authority fail closed independently", () => {
  const assertBothReject = (mutate, pattern) => {
    const entries = rebindAssemblerMutation(fixtureR1PayloadEntries(), DEPLOYMENT_VERIFICATION_PATH, (bytes) => {
      const document = JSON.parse(bytes.toString("utf8"));
      mutate(document);
      return document;
    });
    assert.throws(() => validateR1CanonicalEvidencePayload(entries), pattern);
    assert.throws(() => validateR1CanonicalEvidenceEntries(r1EntryMap(entries)), pattern);
  };

  const secondsOnly = rebindAssemblerMutation(fixtureR1PayloadEntries(), DEPLOYMENT_VERIFICATION_PATH, (bytes) => {
    const document = JSON.parse(bytes.toString("utf8"));
    document.deployment.data.completedAt = document.deployment.data.completedAt.replace(/\.000Z$/, "Z");
    return document;
  });
  assert.doesNotThrow(() => validateR1CanonicalEvidencePayload(secondsOnly));
  assert.doesNotThrow(() => validateR1CanonicalEvidenceEntries(r1EntryMap(secondsOnly)));

  assertBothReject((document) => { document.deployment.data.branchBinding.status = "FAIL"; }, /non-PASS string status/);
  assertBothReject((document) => { document.dist.canonicalAuthority["index.html"].status = "FAIL"; }, /non-PASS string status/);
  assertBothReject((document) => { document.origins.branch.data.responses[0].headers.status = "FAIL"; }, /non-PASS string status/);
  assertBothReject((document) => { document.dist.routeOutcomes[0].status = 500; }, /route outcomes/);
  assertBothReject((document) => { document.origins.immutable.data.responses[0].actualHttpStatus = 500; }, /HTTP parity|raw response parity/);
  assertBothReject((document) => { document.dist.files[0].sha256 = "f".repeat(64); }, /byte and HTTP parity|raw response parity/);
  assertBothReject((document) => { document.origins.immutable.data.responses[0].sha256 = "f".repeat(64); }, /byte and HTTP parity|raw response parity/);
  assertBothReject((document) => { document.deployment.data.checkRunId = "999"; }, /deployment-authority summary|check-run authority|checkRunId/);
  assertBothReject((document) => { document.deployment.data.completedAt = "2026-08-30T14:00:00+02:00"; }, /exact UTC ISO timestamp/);
  assertBothReject((document) => { document.repository.data.productionDiffScope.pop(); }, /production-diff scope|deployment\/change-ledger authority/);
  assertBothReject((document) => { document.repository.data.packageScriptChanges.pop(); }, /package-script changes|deployment\/change-ledger authority/);
  assertBothReject((document) => { document.origins.immutable.data.responses[0].headers.contentType = { value: "text/html" }; }, /header authority/);
  assertBothReject((document) => { document.origins.immutable.data.responses[0].headers.cacheControl = ["public", "max-age=0"]; }, /header authority/);
  assertBothReject((document) => {
    const response = document.origins.immutable.data.responses.find(({ relativePath }) => relativePath === "_astro/app.css");
    response.headers.cacheControl += ", private=\"set-cookie\"";
  }, /header authority|Cache-Control/);
  assertBothReject((document) => {
    const response = document.origins.immutable.data.responses.find(({ relativePath }) => relativePath === "_astro/app.css");
    response.headers.cacheControl += ", max-age=0";
  }, /duplicate|conflicting directive/);
  assertBothReject((document) => {
    const response = document.origins.immutable.data.responses.find(({ relativePath }) => relativePath === "_astro/app.css");
    response.headers.cacheControl += ", no-cache, s-maxage=0";
  }, /cache policy differs/);
  assertBothReject((document) => {
    const record = document.dist.files.find(({ relativePath }) => relativePath === "robots.txt");
    record.relativePath = "nested/%2e%2e/robots.txt";
  }, /raw dist path|URL-reinterpretable/);
  assertBothReject((document) => {
    const record = document.dist.files.find(({ relativePath }) => relativePath === "robots.txt");
    record.relativePath = "robots.txt#shadow.txt";
  }, /raw dist path|URL-reinterpretable/);

  assertBothReject((document) => {
    const forgedSha = "e".repeat(64);
    const relativePath = document.dist.files[0].relativePath;
    document.dist.files[0].sha256 = forgedSha;
    for (const origin of [document.origins.immutable, document.origins.branch]) {
      origin.data.responses.find((response) => response.relativePath === relativePath).sha256 = forgedSha;
    }
  }, /deployment\/Node 22 dist ledger binding/);
});

test("portable path, raw/cache/archive, and privacy/secret guards fail closed", () => {
  assert.throws(() => safeRelativePath("../escape.json"), /unsafe/);
  assert.throws(() => safeRelativePath("02-cross-engine\\capture.json"), /portable/);
  assert.throws(() => assertAllowedEntry("02-cross-engine/raw/frame-001.png"), /forbidden/);
  assert.throws(() => assertAllowedEntry("02-cross-engine/raw_frames/frame-001.png"), /forbidden/);
  assert.throws(() => assertAllowedEntry("06-performance/cache/result.json"), /forbidden/);
  assert.throws(() => assertAllowedEntry("12-regression/review.zip"), /forbidden/);
  assert.throws(() => assertAllowedEntry("09-accessibility/result.html"), /unsupported/);
  assert.throws(() => assertNoPrivateText(Buffer.from("C:\\Users\\reviewer\\capture.png"), "06-performance/report.md"), /privacy/);
  assert.throws(() => assertNoPrivateText(Buffer.from("stored under /tmp/reviewer/capture.png"), "06-performance/report.md"), /privacy/);
  assert.throws(() => assertNoPrivateText(Buffer.from("api_key=abcdefghijklmnop"), "08-network-media/report.txt"), /privacy/);
  const opaqueBinary = Buffer.from([0, 255, 92, 92, 128, 31, 56, 92, 129, 91, 200, 201]);
  assert.doesNotThrow(() => assertNoPrivateText(opaqueBinary, "10-poster-study/difference.png"));
  assert.throws(() => assertNoPrivateText(Buffer.from("PNG metadata C:\\Users\\reviewer\\capture.png remains"), "10-poster-study/metadata.png"), /privacy/);
  assert.throws(() => assertNoPrivateText(Buffer.from("C:\\Users\\reviewer\\capture.png"), "10-poster-study/notes.txt"), /privacy/);
});

test("a compact complete package passes canonical ZIP and independent semantic audit", () => {
  const artifacts = fixtureArtifacts();
  const parsed = parseStoredZip(artifacts.archiveBytes);
  assert.equal(parsed.canonical, true);
  assert.equal(parsed.crcValidated, true);
  assert.equal(parsed.entries.size, artifacts.files.length + 1);
  const result = auditBuffers({
    archiveBytes: artifacts.archiveBytes,
    detachedBytes: artifacts.detachedBytes,
    archiveFilename: REQUIRED_ARCHIVE_FILENAME,
    expected: EXPECTED,
  });
  assert.equal(result.reviewPolicy, "PASS");
  assert.equal(result.privacyAndSecrets, "PASS");
  assert.deepEqual(Object.keys(result.topology), TOPOLOGY_SECTIONS);
  for (const report of REPORT_SPECS) assert.ok(result.entries.has(report.archive));
  assert.equal(result.deploymentVerification.binding.path, DEPLOYMENT_VERIFICATION_PATH);
  assert.equal(result.deploymentVerification.binding.schema, DEPLOYMENT_VERIFICATION_SCHEMA);
});

test("two builds with the same canonical generatedAt are byte-for-byte deterministic", () => {
  const first = fixtureArtifacts();
  const second = fixtureArtifacts();
  assert.deepEqual(first.archiveBytes, second.archiveBytes);
  assert.deepEqual(first.detachedBytes, second.detachedBytes);
  assert.deepEqual(first.manifestBytes, second.manifestBytes);
  assert.throws(() => buildPackageArtifacts({
    payloadEntries: fixturePayloadEntries(),
    provenance: PROVENANCE,
    outputFilename: REQUIRED_ARCHIVE_FILENAME,
  }), /generatedAt must be a canonical ISO timestamp/);
});

test("the builder semantically binds the required successful Phase 6 deployment report", () => {
  const mutateDeployment = (mutate) => fixturePayloadEntries().map((entry) => {
    if (entry.path !== DEPLOYMENT_VERIFICATION_PATH) return entry;
    const document = JSON.parse(entry.data.toString("utf8"));
    mutate(document);
    return { ...entry, data: Buffer.from(stableJson(document)) };
  });
  const build = (payloadEntries) => buildPackageArtifacts({ payloadEntries, provenance: PROVENANCE, outputFilename: REQUIRED_ARCHIVE_FILENAME, generatedAt: GENERATED_AT });
  assert.throws(() => build(fixturePayloadEntries().filter(({ path: relativePath }) => relativePath !== DEPLOYMENT_VERIFICATION_PATH)), /required deployment verification artifact is missing/);
  assert.throws(() => build(mutateDeployment((document) => { document.inputs.expectedMain = "b".repeat(40); })), /deployment verification inputs/);
  assert.throws(() => build(mutateDeployment((document) => { document.repository.data.history[0].parents[0] = "b".repeat(40); })), /linear descendant/);
  assert.throws(() => build(mutateDeployment((document) => { document.deployment.data.commitHash = "b".repeat(40); })), /signed Cloudflare authority/);
  assert.throws(() => build(mutateDeployment((document) => { document.origins.branch.status = "FAIL"; })), /dist\/origin parity/);
  assert.throws(() => build(mutateDeployment((document) => { document.checks.canonicalBehavior = false; })), /deployment verification checks/);
  assert.throws(() => build(mutateDeployment((document) => { document.failures.push({ check: "fixture" }); })), /deployment verification failures/);
});

test("the auditor rejects byte tampering through CRC before trusting manifests", () => {
  const artifacts = fixtureArtifacts();
  const tampered = Buffer.from(artifacts.archiveBytes);
  const needle = Buffer.from("fixture report 0");
  const offset = tampered.indexOf(needle);
  assert.ok(offset >= 0);
  tampered[offset] ^= 0x01;
  assert.throws(() => parseStoredZip(tampered), /CRC rejection|canonical/);
});

test("the auditor rejects a canonically rebuilt ZIP whose payload differs from its manifest", () => {
  const artifacts = fixtureArtifacts();
  const entries = parseStoredZip(artifacts.archiveBytes).entries;
  entries.set("02-cross-engine/distilled-2.json", Buffer.from("{\"tampered\":true}\n"));
  const rebuilt = createStoredZipBuffer([...entries].map(([entryPath, data]) => ({ path: entryPath, data })));
  assert.throws(() => auditBuffers({
    archiveBytes: rebuilt,
    detachedBytes: artifacts.detachedBytes,
    archiveFilename: REQUIRED_ARCHIVE_FILENAME,
    expected: EXPECTED,
  }), /detached archive binding|manifest hash\/size/);
});

test("the auditor rejects a cryptographically rebound but semantically false deployment report", () => {
  const artifacts = fixtureArtifacts();
  const entries = parseStoredZip(artifacts.archiveBytes).entries;
  const deployment = JSON.parse(entries.get(DEPLOYMENT_VERIFICATION_PATH).toString("utf8"));
  deployment.inputs.expectedMain = "b".repeat(40);
  const deploymentBytes = Buffer.from(stableJson(deployment));
  entries.set(DEPLOYMENT_VERIFICATION_PATH, deploymentBytes);

  const binding = {
    path: DEPLOYMENT_VERIFICATION_PATH,
    schema: DEPLOYMENT_VERIFICATION_SCHEMA,
    status: "PASS",
    byteSize: deploymentBytes.length,
    sha256: sha256(deploymentBytes),
  };
  const metadataPath = "13-package/package-metadata.json";
  const metadata = JSON.parse(entries.get(metadataPath).toString("utf8"));
  metadata.deploymentVerification = binding;
  const metadataBytes = Buffer.from(stableJson(metadata));
  entries.set(metadataPath, metadataBytes);

  const manifest = JSON.parse(entries.get("MANIFEST.json").toString("utf8"));
  manifest.deploymentVerification = binding;
  for (const record of manifest.files) {
    if (record.path === DEPLOYMENT_VERIFICATION_PATH) Object.assign(record, { byteSize: deploymentBytes.length, sha256: sha256(deploymentBytes) });
    if (record.path === metadataPath) Object.assign(record, { byteSize: metadataBytes.length, sha256: sha256(metadataBytes) });
  }
  const manifestBytes = Buffer.from(stableJson(manifest));
  entries.set("MANIFEST.json", manifestBytes);
  const archiveBytes = createStoredZipBuffer([...entries].map(([entryPath, data]) => ({ path: entryPath, data })));

  const detached = JSON.parse(artifacts.detachedBytes.toString("utf8"));
  Object.assign(detached.archive, { byteSize: archiveBytes.length, sha256: sha256(archiveBytes) });
  Object.assign(detached.inArchiveManifest, { byteSize: manifestBytes.length, sha256: sha256(manifestBytes) });
  detached.deploymentVerification = binding;
  assert.throws(() => auditBuffers({
    archiveBytes,
    detachedBytes: Buffer.from(stableJson(detached)),
    archiveFilename: REQUIRED_ARCHIVE_FILENAME,
    expected: EXPECTED,
  }), /deployment verification inputs/);
});

test("the builder rejects duplicate paths, duplicate payload hashes, missing topology, and oversize output", () => {
  const base = fixturePayloadEntries();
  assert.throws(() => buildPackageArtifacts({ payloadEntries: [...base, { ...base[0] }], provenance: PROVENANCE, outputFilename: REQUIRED_ARCHIVE_FILENAME, generatedAt: GENERATED_AT }), /duplicate package path/);
  assert.throws(() => buildPackageArtifacts({ payloadEntries: [...base, { path: "02-cross-engine/copied.json", data: Buffer.from(base[0].data) }], provenance: PROVENANCE, outputFilename: REQUIRED_ARCHIVE_FILENAME, generatedAt: GENERATED_AT }), /duplicate package payload/);
  assert.throws(() => buildPackageArtifacts({ payloadEntries: base.filter(({ path: relativePath }) => !relativePath.startsWith("12-regression/")), provenance: PROVENANCE, outputFilename: REQUIRED_ARCHIVE_FILENAME, generatedAt: GENERATED_AT }), /omits 12-regression/);
  assert.throws(() => fixtureArtifacts({ maximumBytes: 512 }), /maximum is 512/);
});

test("external evidence collection adds exactly the four repository reports and rejects reserved collisions", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "qh-phase6-package-fixture-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const evidenceRoot = path.join(temporary, "evidence");
  const reportRoot = path.join(temporary, "reports");
  await mkdir(path.join(evidenceRoot, "02-cross-engine"), { recursive: true });
  await mkdir(reportRoot, { recursive: true });
  await writeFile(path.join(evidenceRoot, "02-cross-engine", "summary.json"), "{\"external\":true}\n");
  for (const [index, report] of REPORT_SPECS.entries()) await writeFile(path.join(reportRoot, report.source), `# report ${index}\n`);
  const entries = await collectPayloadEntries(evidenceRoot, reportRoot);
  assert.deepEqual(entries.map(({ path: relativePath }) => relativePath), ["02-cross-engine/summary.json", ...REPORT_SPECS.map(({ archive }) => archive)]);

  const collisionRoot = path.join(temporary, "collision");
  await mkdir(path.join(collisionRoot, "01-baseline"), { recursive: true });
  await writeFile(path.join(collisionRoot, "01-baseline", "PHASE_6_BASELINE.md"), "collision\n");
  await assert.rejects(() => collectPayloadEntries(collisionRoot, reportRoot), /reserved package path/);
});

test("external output policy and fresh atomic publication refuse repository paths and overwrites", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "qh-phase6-fresh-output-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  assert.throws(() => assertExternalPath(path.join(TEST_ROOT, "inside.zip")), /outside the repository/);
  const sourceArchive = path.join(temporary, "staged.zip");
  const sourceManifest = path.join(temporary, "staged.json");
  const destinationArchive = path.join(temporary, "fresh.zip");
  const destinationManifest = path.join(temporary, "fresh-manifest.json");
  await writeFile(sourceArchive, "archive");
  await writeFile(sourceManifest, "manifest");
  assert.equal(await assertFreshOutputSet([destinationArchive, destinationManifest]), true);
  assert.equal(await publishFreshSetAtomic([
    { source: sourceArchive, destination: destinationArchive },
    { source: sourceManifest, destination: destinationManifest },
  ]), true);
  await assert.rejects(() => assertFreshOutputSet([destinationArchive]), /already exists/);
});

test("the audit CLI runs as a separate process and emits a fresh report with its own hash", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "qh-phase6-independent-audit-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const artifacts = fixtureArtifacts();
  const archive = path.join(temporary, REQUIRED_ARCHIVE_FILENAME);
  const manifest = path.join(temporary, "phase-6-global-hardening-human-review-manifest.json");
  const audit = path.join(temporary, "phase-6-global-hardening-human-review-audit.json");
  await writeFile(archive, artifacts.archiveBytes);
  await writeFile(manifest, artifacts.detachedBytes);
  const { stdout } = await execFileAsync(process.execPath, [
    AUDITOR,
    "--archive", archive,
    "--manifest", manifest,
    "--audit-output", audit,
    "--expected-head", EXPECTED.expectedHead,
    "--branch", EXPECTED.branch,
    "--deployment-id", EXPECTED.deploymentId,
    "--immutable-url", EXPECTED.immutableUrl,
    "--branch-url", EXPECTED.branchUrl,
    "--expected-parent-process-id", String(process.pid),
  ], { cwd: TEST_ROOT, encoding: "utf8", windowsHide: true });
  const result = JSON.parse(stdout);
  const auditBytes = await readFile(audit);
  const auditDocument = JSON.parse(auditBytes.toString("utf8"));
  assert.equal(result.schema, `${AUDIT_SCHEMA}.result`);
  assert.equal(result.status, "PASS");
  assert.equal(result.audit.sha256, sha256(auditBytes));
  assert.equal(auditDocument.auditor.separateProcess, true);
  assert.equal(auditDocument.auditor.parentProcessId, process.pid);
  assert.equal(auditDocument.archive.sha256, sha256(artifacts.archiveBytes));
  await assert.rejects(() => writeFile(audit, "replacement", { flag: "wx" }), /EEXIST/);
});

test("assembled Phase 6-R1 evidence packages to the exact closure filename and passes a separate-process R1 audit", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "qh-phase6-r1-independent-audit-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const artifacts = fixtureR1Artifacts();
  const archive = path.join(temporary, R1_REQUIRED_ARCHIVE_FILENAME);
  const manifest = path.join(temporary, "phase-6-r1-validation-closure-human-review-manifest.json");
  const audit = path.join(temporary, "phase-6-r1-validation-closure-human-review-audit.json");
  await writeFile(archive, artifacts.archiveBytes);
  await writeFile(manifest, artifacts.detachedBytes);

  const { stdout } = await execFileAsync(process.execPath, [
    AUDITOR,
    "--authority-profile", "phase6-r1",
    "--archive", archive,
    "--manifest", manifest,
    "--audit-output", audit,
    "--expected-head", R1_EXPECTED.expectedHead,
    "--branch", R1_EXPECTED.branch,
    "--deployment-id", R1_EXPECTED.deploymentId,
    "--deployment-check-run-id", R1_EXPECTED.deploymentCheckRunId,
    "--immutable-url", R1_EXPECTED.immutableUrl,
    "--branch-url", R1_EXPECTED.branchUrl,
    "--expected-parent-process-id", String(process.pid),
  ], { cwd: TEST_ROOT, encoding: "utf8", windowsHide: true });

  const result = JSON.parse(stdout);
  const auditBytes = await readFile(audit);
  const auditDocument = JSON.parse(auditBytes.toString("utf8"));
  assert.equal(path.basename(archive), "phase-6-r1-validation-closure-human-review.zip");
  assert.equal(result.schema, `${R1_AUDIT_SCHEMA}.result`);
  assert.equal(result.status, "PASS");
  assert.equal(result.audit.sha256, sha256(auditBytes));
  assert.equal(auditDocument.schema, R1_AUDIT_SCHEMA);
  assert.equal(auditDocument.auditor.separateProcess, true);
  assert.equal(auditDocument.auditor.parentProcessId, process.pid);
  assert.equal(auditDocument.archive.filename, R1_REQUIRED_ARCHIVE_FILENAME);
  assert.equal(auditDocument.archive.sha256, sha256(artifacts.archiveBytes));
  assert.equal(auditDocument.detachedManifest.schema, `${R1_PACKAGE_SCHEMA}.detached-manifest`);
  assert.equal(auditDocument.inArchiveManifest.schema, R1_PACKAGE_SCHEMA);
  assert.equal(auditDocument.deploymentVerification.schema, R1_DEPLOYMENT_VERIFICATION_SCHEMA);
  assert.equal(auditDocument.provenance.authorityProfile, "phase6-r1");
  assert.equal(auditDocument.provenance.exactParent, R1_REQUIRED_PARENT);
  assert.equal(auditDocument.checks.exactBranchParentAndFrozenMain, "PASS");
  assert.equal("exactBranchBaseAndFrozenMain" in auditDocument.checks, false);
});
