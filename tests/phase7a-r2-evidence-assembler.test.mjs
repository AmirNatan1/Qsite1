import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import {
  ASSEMBLER_SCHEMA, DEPLOYMENT_SCHEMA, GENERIC_CAPTURE_SCHEMA, GENERIC_MANIFEST_SCHEMA, INSTALLED_CAPTURE_SCHEMA, INSTALLED_MANIFEST_SCHEMA,
  assembleR2ReviewEvidence, constructR2Payloads, parseArguments, selfTest, validateGitAuthority,
} from "../scripts/assemble-phase7a-r2-review-evidence.mjs";
import { FROZEN_MAIN, PHASE7A_R2_BRANCH, PHASE7A_R2_PARENT } from "../scripts/phase7a-contract.mjs";
import { REQUIRED_R2_EVIDENCE, normalizeR2EvidenceEntries } from "../scripts/package-phase7a-r2-human-review.mjs";
import { sha256 } from "../scripts/package-phase7a-human-review.mjs";
import {
  PHASE7A_R2_AXE_CASES, PHASE7A_R2_AXE_SCHEMA, PHASE7A_R2_AXE_VERSION, PHASE7A_R2_FIELD_MAP_DESTINATIONS,
  PHASE7A_R2_FIELD_MAP_SCHEMA, PHASE7A_R2_SUMMARY_AX_NAME, PHASE7A_R2_SUMMARY_AX_ROLE, PHASE7A_R2_TARGET_STATES,
} from "../scripts/phase7a-r2-field-map-authority.mjs";
import { PHASE7A_R2_RETAINED_QA_SCHEMA } from "../scripts/qa-phase7a-browser.mjs";
import { r2AxeAuthorityFixture } from "./phase7a-r2-axe-fixture.mjs";
import {
  PHASE7A_R2_VISUAL_REGRESSION_MANIFEST_SCHEMA,
  PHASE7A_R2_VISUAL_REGRESSION_METHOD,
  PHASE7A_R2_VISUAL_REGRESSION_PATHS,
  PHASE7A_R2_VISUAL_REGRESSION_REPORT_PATH,
  PHASE7A_R2_VISUAL_REGRESSION_SCHEMA,
} from "../scripts/phase7a-r2-visual-regression-authority.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REVISION = "a".repeat(40);
const DEPLOYMENT_ID = "7ebd4769-55dd-4f04-99cc-0ba6936b9605";
const IMMUTABLE_URL = "https://7ebd4769.qsite1.pages.dev/";
const BRANCH_URL = "https://repair-phase-7a-r2-field-map.qsite1.pages.dev/";
const BASELINE_DEPLOYMENT_ID = "139320ab-e562-4590-85ad-fa9920e6aad7";
const BASELINE_URL = "https://139320ab.qsite1.pages.dev/";
const DEPLOYMENT_CHECK_RUN_ID = "99855957370";
const ABOUT_BYTES = 900;
const BASELINE_ABOUT_SHA = "b".repeat(64);
const CURRENT_ABOUT_SHA = "c".repeat(64);
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const focus = (activeElement, activeDestinationName) => ({ activeElement, activeDestinationName });
const box = (type) => { const value = Buffer.alloc(8); value.writeUInt32BE(8, 0); value.write(type, 4, 4, "ascii"); return value; };
const mp4 = () => Buffer.concat([box("ftyp"), box("moov"), box("mdat")]);

function trigger(expanded) { return { tag: "summary", ariaControls: "field-map-navigation", ariaHasPopup: null, authoredAriaExpanded: null, axRole: PHASE7A_R2_SUMMARY_AX_ROLE, axName: PHASE7A_R2_SUMMARY_AX_NAME, axExpanded: expanded }; }
function destinations() { return PHASE7A_R2_FIELD_MAP_DESTINATIONS.map(({ href, name, focusName }) => ({ href, accessibleName: name, focusName, visible: true, focusable: true, axRole: "link" })); }
function openState() { return { open: true, rootOpen: true, backgroundRegionCount: 3, inertRegionCount: 3, ownedInertCount: 3, activeElement: "a", activeDestinationName: "About", trigger: trigger(true), destinations: destinations(), focusableInventory: [{ element: "summary", name: "Field map", insideFieldMap: true }, ...PHASE7A_R2_FIELD_MAP_DESTINATIONS.map(({ focusName }) => ({ element: "a", name: focusName, insideFieldMap: true }))] }; }
function closedState(activeElement = "body") { return { open: false, rootOpen: false, backgroundRegionCount: 3, inertRegionCount: 0, ownedInertCount: 0, activeElement, trigger: trigger(false) }; }
function controls() { return [{ selector: "[data-field-map] > summary", href: null, accessibleName: "Field map", elementType: "summary", width: 152, height: 44, visible: true, intendedInteractive: true }, ...PHASE7A_R2_FIELD_MAP_DESTINATIONS.map(({ href, name }) => ({ selector: `[data-field-map] a[href="${href}"]`, href, accessibleName: name, elementType: "a", width: 180, height: 44, visible: true, intendedInteractive: true }))]; }

function authority() {
  const forwardCycle = [focus("a", "About"), focus("a", "Contact"), focus("field-map-summary", null), ...PHASE7A_R2_FIELD_MAP_DESTINATIONS.slice(0, 6).map(({ focusName }) => focus("a", focusName)), focus("a", "About")].map((row, index) => ({ step: index + 1, ...row }));
  const reverseCycle = [...[...PHASE7A_R2_FIELD_MAP_DESTINATIONS].reverse().map(({ focusName }) => focus("a", focusName)), focus("field-map-summary", null)].map((row, index) => ({ step: index + 1, ...row }));
  const engineEvidence = [["chromium", "installed/headed Google Chrome; Chromium CDP AX-property authority"], ["firefox", "headed Firefox automation"], ["webkit", "Playwright WebKit proxy; not physical Safari"]].map(([engine, classification]) => ({ engine, classification, forwardCycle: structuredClone(forwardCycle), reverseCycle: structuredClone(reverseCycle), bodyStops: { forward: 0, reverse: 0 }, escape: { activeElement: "field-map-summary", open: false, rootOpen: false, backgroundRegionCount: 3, inertRegionCount: 0, ownedInertCount: 0 }, repeatedCycleCount: 10, repeatedCycleStatus: "PASS", duplicateBinding: { cycles: 10, status: "PASS" }, status: "PASS" }));
  const fieldMap = { schema: PHASE7A_R2_FIELD_MAP_SCHEMA, status: "PASS", parent: PHASE7A_R2_PARENT, route: "/about/", states: { closed: closedState(), open: openState(), escape: closedState("field-map-summary") }, focus: { initial: focus("a", "About"), forwardCycle, reverseFromSummary: focus("a", "Contact"), outsideRecapture: focus("a", "About"), postCloseOutsideFocus: "outside-test-control" }, repeatedCycles: Array.from({ length: 3 }, (_, index) => ({ cycle: index + 1, opened: openState(), closed: closedState("field-map-summary") })), engineEvidence, noJavaScript: { controller: null, nativeDetailsOpen: true, horizontalOverflow: false, trigger: trigger(true), destinations: PHASE7A_R2_FIELD_MAP_DESTINATIONS.map(({ href, name }) => ({ href, accessibleName: name, visible: true, fullyInViewport: true, unoccluded: true })) } };
  const axe = r2AxeAuthorityFixture({ screenshotBytes: contrastPng });
  const states = PHASE7A_R2_TARGET_STATES.slice(0, 2).map((state) => ({ id: state.id, route: state.route, state: state.state, viewport: { ...state.viewport }, genuineInstalledChrome: false, nativeZoomPercent: null, candidateCount: 9, controls: controls(), status: "PASS" }));
  return { fieldMap, axe, targetFragment: { schema: "quantum-hub.phase-7a-r2.field-map-target-fragment.v1", status: "PASS", parent: PHASE7A_R2_PARENT, minimumCssPixels: 44, states, requiredInstalledChromeStateId: "field-map-open-installed-chrome-200-percent" } };
}

function gitAuthority() { return { branch: PHASE7A_R2_BRANCH, head: REVISION, directParent: PHASE7A_R2_PARENT, localMain: FROZEN_MAIN, originMain: FROZEN_MAIN, status: "", upstream: `origin/${PHASE7A_R2_BRANCH}`, upstreamHead: REVISION, mergeRows: "", phase6Ancestor: true, commits: [{ hash: REVISION, parent: PHASE7A_R2_PARENT, subject: "repair Field Map semantics" }], productionChangedPaths: ["src/components/SiteHeader.astro"], productionDiff: "diff --git a/src/components/SiteHeader.astro b/src/components/SiteHeader.astro\n--- a/src/components/SiteHeader.astro\n+++ b/src/components/SiteHeader.astro\n", parentHeader: '<summary aria-controls="field-map-navigation" aria-haspopup="menu" aria-expanded="false">', currentHeader: '<summary aria-controls="field-map-navigation">' }; }
function qa(engine) { return { syntheticRawQa: true, engine, reportSha256: ({ chromium: "1", firefox: "2", webkit: "3" })[engine].repeat(64) }; }
function normalizeQaFixture(report, { expectedEngine, expectedRevision }) {
  assert.equal(report.syntheticRawQa, true);
  assert.equal(report.engine, expectedEngine);
  return { schema: PHASE7A_R2_RETAINED_QA_SCHEMA, status: "PASS", authorityProfile: "phase7a-r2", branch: PHASE7A_R2_BRANCH, revision: expectedRevision, engine: expectedEngine, rawReportSha256: report.reportSha256, evidenceCaseCount: 12, failures: 0, checks: { sourceBound: true, routeMatrix: true, axe: true, responsive: true, shortLandscape800x360: true, fieldMap: true, reducedMotion: true, noJavaScript: true, fallbackFont: true, history: true, reverseLifecycle: true, network: true }, coverage: { status: "PASS" }, source: { schema: "quantum-hub.phase-7a-r2.browser-qa-source-ref.v1", status: "PASS", branch: PHASE7A_R2_BRANCH, revision: expectedRevision, upstream: `origin/${PHASE7A_R2_BRANCH}`, upstreamRevision: expectedRevision, worktreeClean: true, dist: { fileCount: 20, totalBytes: 1000, fingerprint: "d".repeat(64) }, served: { assetCount: 3, fingerprint: "e".repeat(64), parity: true } } };
}
const buildReceipt = { command: "npm run check:phase7a-r2", status: "PASS", head: REVISION, worktreeClean: true, testCount: 178, passed: 178, failures: 0, errors: 0, warnings: 0, hints: 0 };
const focusedReceipt = { command: "node --test tests/phase7a-r2-field-map-authority.test.mjs tests/phase7a-r2-evidence-assembler.test.mjs", status: "PASS", head: REVISION, worktreeClean: true, testCount: 10, passed: 10, failures: 0 };
function deployment() {
  const row = { relativePath: "index.html", bytes: 1000, sha256: "d".repeat(64) };
  const about = { relativePath: "about/index.html", bytes: ABOUT_BYTES, sha256: CURRENT_ABOUT_SHA };
  const asset = { relativePath: "_astro/navigation.css", requestPath: "/_astro/navigation.css", bytes: 123, sha256: "f".repeat(64) };
  const response = (source, publicPath) => ({ ...source, publicPath, status: "PASS", expectedHttpStatus: 200, actualHttpStatus: 200 });
  const origin = (originUrl) => ({ status: "PASS", data: { status: "PASS", origin: originUrl, responses: [response(row, "/"), response(about, "/about/"), response(asset, asset.requestPath)] } });
  return {
    schema: DEPLOYMENT_SCHEMA,
    authorityProfile: "phase7a-r2",
    status: "PASS",
    generatedAt: "2026-09-01T12:28:54.328Z",
    deployedSha: REVISION,
    parity: "PASS",
    deploymentId: DEPLOYMENT_ID,
    environment: "preview",
    projectName: "qsite1",
    immutableUrl: IMMUTABLE_URL,
    branchUrl: BRANCH_URL,
    inputs: { expectedDeployedSha: REVISION, branch: PHASE7A_R2_BRANCH, acceptedParent: PHASE7A_R2_PARENT, frozenMain: FROZEN_MAIN, localDist: "dist" },
    deployment: {
      status: "PASS",
      data: {
        status: "PASS",
        authoritySource: "CLOUDFLARE_PAGES_SIGNED_GITHUB_CHECK",
        checkRunId: DEPLOYMENT_CHECK_RUN_ID,
        appSlug: "cloudflare-workers-and-pages",
        completedAt: "2026-09-01T12:27:51Z",
        deploymentId: DEPLOYMENT_ID,
        projectName: "qsite1",
        environment: "preview",
        branch: PHASE7A_R2_BRANCH,
        immutableUrl: IMMUTABLE_URL,
        branchUrl: BRANCH_URL,
        deployedSha: REVISION,
      },
    },
    dist: { files: [row, about, asset] },
    origins: { immutable: origin(IMMUTABLE_URL), branch: origin(BRANCH_URL) },
  };
}

function r1Deployment() {
  const row = (relativePath, publicPath, bytes, fileSha256) => ({ relativePath, publicPath, bytes, sha256: fileSha256, status: "PASS", localDist: "PASS", immutable: { status: "PASS", actualHttpStatus: 200, bytes, sha256: fileSha256 } });
  const about = row("about/index.html", "/about/", ABOUT_BYTES, BASELINE_ABOUT_SHA);
  const asset = row("_astro/navigation.css", "/_astro/navigation.css", 123, "f".repeat(64));
  return { schema: "quantum-hub.phase-7a-r1.evidence-assembler.v1.deployment", status: "PASS", authorityProfile: "phase7a-r1", commitHash: PHASE7A_R2_PARENT, signedDeploymentBinding: true, signedCloudflareCheckBinding: true, deploymentId: BASELINE_DEPLOYMENT_ID, payloadLedger: [about, asset] };
}

function visualAuthority(imageBytes, captureToolSha256, currentReceiptSha256) {
  const metrics = { innerWidth: 1440, innerHeight: 900, clientWidth: 1425, clientHeight: 900, outerWidth: 1440, outerHeight: 900, visualViewportWidth: 1425, visualViewportHeight: 900, visualViewportScale: 1, scrollbarWidth: 15, devicePixelRatio: 1, scrollX: 0, scrollY: 0, fontsReady: true };
  const image = (relativePath, focus, fieldMapOpen) => ({ path: relativePath, bytes: imageBytes.length, sha256: sha256(imageBytes), width: 1440, height: 900, channels: 3, focus, fieldMapOpen, metrics: { ...metrics } });
  const pair = (state, baselinePath, currentPath, fieldMapOpen) => ({ state, baseline: image(baselinePath, "field-map-summary", fieldMapOpen), current: image(currentPath, "field-map-summary", fieldMapOpen), result: { classification: "EXACT_DECODED_PIXELS", encodedBytesEqual: true, differentPixels: 0, maxChannelDelta: 0, status: "PASS" } });
  const asset = (origin) => ({ kind: "stylesheet", url: `${origin}_astro/navigation.css`, status: 200, contentType: "text/css", bytes: 123, sha256: "f".repeat(64) });
  return {
    schema: PHASE7A_R2_VISUAL_REGRESSION_SCHEMA, status: "PASS", method: PHASE7A_R2_VISUAL_REGRESSION_METHOD,
    baselineRevision: PHASE7A_R2_PARENT, currentRevision: REVISION,
    captureTool: { path: "scripts/capture-phase7a-r2-visual-regression.mjs", sha256: captureToolSha256 },
    browser: { name: "Google Chrome", product: "Chrome/150.0.7339.12", version: "150.0.7339.12", userAgent: "Mozilla/5.0 Chrome/150.0.7339.12 Safari/537.36", installed: true, headed: true, launchArguments: ["--disable-gpu", "--run-all-compositor-stages-before-draw"], rendering: { gpuCompositing: "disabled_software", rasterization: "disabled_software", purpose: "DETERMINISTIC_EXACT_PIXEL_SOFTWARE_RENDERING" }, browserCount: 1, contextCount: 1, pageCount: 1 },
    viewport: { width: 1440, height: 900, deviceScaleFactor: 1, colorScheme: "dark", reducedMotion: "no-preference" },
    bindings: {
      baseline: { revision: PHASE7A_R2_PARENT, deploymentId: BASELINE_DEPLOYMENT_ID, immutableUrl: BASELINE_URL, receiptSha256: "45f8352507129ac0c9bac567b91f27df3af22ee16fab09c42384db59c7a8126d", document: { status: 200, bytes: ABOUT_BYTES, sha256: BASELINE_ABOUT_SHA, finalUrl: `${BASELINE_URL}about/` }, loadedAssets: [asset(BASELINE_URL)] },
      current: { revision: REVISION, deploymentId: DEPLOYMENT_ID, immutableUrl: IMMUTABLE_URL, receiptSha256: currentReceiptSha256, document: { status: 200, bytes: ABOUT_BYTES, sha256: CURRENT_ABOUT_SHA, finalUrl: `${IMMUTABLE_URL}about/` }, loadedAssets: [asset(IMMUTABLE_URL)] },
    },
    captureOrder: ["baseline:closed-summary-focused", "baseline:open-summary-focused", "current:closed-summary-focused", "current:open-summary-focused", "current:open-link-focused"],
    comparisons: [
      pair("closed-summary-focused", PHASE7A_R2_VISUAL_REGRESSION_PATHS.parentClosed, PHASE7A_R2_VISUAL_REGRESSION_PATHS.currentClosed, false),
      pair("open-summary-focused", PHASE7A_R2_VISUAL_REGRESSION_PATHS.parentOpen, PHASE7A_R2_VISUAL_REGRESSION_PATHS.currentOpen, true),
    ],
    currentLinkFocused: { image: image(PHASE7A_R2_VISUAL_REGRESSION_PATHS.currentLinkFocused, "field-map-link", true), accessibleName: "06 About 06 / position", focusedElementGeometry: { selector: "[data-field-map] a[aria-current=\"page\"]", x: 300, y: 400, width: 500, height: 60 }, excludedFromCreativeComparison: true },
    runtime: { consoleErrors: [], pageErrors: [], failedRequests: [], redirects: [] }, neutralMasks: [],
    checks: { sameInstalledHeadedBrowserSession: true, sameContextAndPage: true, sameViewportDprAndScrollbar: true, summaryFocusedPairs: true, stableDuplicateFrames: true, exactDecodedPixels: true, linkFocusedEvidenceSeparate: true, deploymentDocumentsRecorded: true },
  };
}

function visualFixture(imageBytes, captureToolSha256, currentReceiptSha256) {
  const report = visualAuthority(imageBytes, captureToolSha256, currentReceiptSha256);
  const reportBytes = json(report);
  return { report, reportBytes, reportSha256: sha256(reportBytes), outputFiles: new Map([[PHASE7A_R2_VISUAL_REGRESSION_REPORT_PATH, reportBytes], ...Object.values(PHASE7A_R2_VISUAL_REGRESSION_PATHS).map((relativePath) => [relativePath, imageBytes])]) };
}

let png;
let contrastPng;
let pure;
const clonePure = () => {
  const generic = structuredClone(pure.generic);
  const installed = structuredClone(pure.installed);
  const visualRegression = structuredClone(pure.visualRegression);
  generic.outputFiles = new Map([...pure.generic.outputFiles].map(([relativePath, bytes]) => [relativePath, Buffer.from(bytes)]));
  installed.outputFiles = new Map([...pure.installed.outputFiles].map(([relativePath, bytes]) => [relativePath, Buffer.from(bytes)]));
  visualRegression.outputFiles = new Map([...pure.visualRegression.outputFiles].map(([relativePath, bytes]) => [relativePath, Buffer.from(bytes)]));
  visualRegression.reportBytes = Buffer.from(pure.visualRegression.reportBytes);
  return { ...pure, generic, installed, visualRegression, qa: structuredClone(pure.qa), deploymentReport: structuredClone(pure.deploymentReport), r1DeploymentReport: structuredClone(pure.r1DeploymentReport), gitAuthority: structuredClone(pure.gitAuthority), buildReceipt: structuredClone(pure.buildReceipt), focusedReceipt: structuredClone(pure.focusedReceipt), normalizeQaReport: pure.normalizeQaReport };
};

function rebindVisualReport(fixture) {
  fixture.visualRegression.reportBytes = json(fixture.visualRegression.report);
  fixture.visualRegression.reportSha256 = sha256(fixture.visualRegression.reportBytes);
  fixture.visualRegression.outputFiles.set(PHASE7A_R2_VISUAL_REGRESSION_REPORT_PATH, fixture.visualRegression.reportBytes);
}

test.before(async () => {
  png = await sharp({ create: { width: 8, height: 6, channels: 3, background: { r: 18, g: 30, b: 41 } } }).png().toBuffer();
  contrastPng = await sharp({ create: { width: 1440, height: 900, channels: 3, background: { r: 9, g: 12, b: 13 } } }).png().toBuffer();
  const authorityParts = authority();
  const genericFiles = new Map();
  for (const relativePath of REQUIRED_R2_EVIDENCE.map(({ relativePath }) => relativePath).filter((name) => name.startsWith("03-focus/") && name.endsWith(".mp4"))) genericFiles.set(relativePath, mp4());
  for (const relativePath of REQUIRED_R2_EVIDENCE.map(({ relativePath }) => relativePath).filter((name) => name.startsWith("04-field-map/") && name.endsWith(".png"))) genericFiles.set(relativePath, png);
  for (const relativePath of REQUIRED_R2_EVIDENCE.map(({ relativePath }) => relativePath).filter((name) => name.startsWith("06-accessibility/") && name.endsWith("-background-mask.png"))) genericFiles.set(relativePath, contrastPng);
  const installedFiles = new Map(REQUIRED_R2_EVIDENCE.map(({ relativePath }) => relativePath).filter((name) => name.startsWith("05-chrome-200/") && name.endsWith(".png")).map((name) => [name, png]));
  const installedControls = controls().map((row) => ({ ...row, focusable: true, fullyInViewport: true, unoccluded: true }));
  const installed = { report: { schema: INSTALLED_CAPTURE_SCHEMA, status: "PASS", branch: PHASE7A_R2_BRANCH, parent: PHASE7A_R2_PARENT, revision: REVISION, browser: { product: "Google Chrome" }, zoomProof: { status: "PASS", uiZoomLabelInput: "Zoom: 200%", observed: { innerWidth: 519, innerHeight: 399 } }, accessibility: { method: "CDP Accessibility.getPartialAXTree" }, states: { open: { open: true } }, targetInventory: { minimumCssPixels: 44, candidateCount: 9, controls: installedControls }, focus: { status: "PASS" }, repeatedCycles: Array.from({ length: 10 }, (_, cycle) => ({ cycle: cycle + 1, status: "PASS" })), visuals: [], limitations: ["This is genuine installed Google Chrome evidence, not physical Safari evidence."] }, outputFiles: installedFiles };
  const generic = { report: { schema: GENERIC_CAPTURE_SCHEMA, status: "PASS", authority: { head: REVISION }, limitations: ["Playwright WebKit is proxy evidence and is not physical Safari."] }, focus: authorityParts.fieldMap, axe: authorityParts.axe, targetFragment: authorityParts.targetFragment, reducedMotion: { status: "PASS", screenshot: "screenshots/chromium-reduced-motion.png" }, outputFiles: genericFiles };
  const qaRows = Object.fromEntries(["chromium", "firefox", "webkit"].map((engine, index) => [engine, { value: qa(engine), sha256: String(index + 1).repeat(64) }]));
  const captureToolSha256 = sha256(await readFile(path.join(ROOT, "scripts/capture-phase7a-r2-visual-regression.mjs")));
  const deploymentReport = deployment();
  pure = { authorityDocumentBytes: Buffer.from("# authority\n"), generic, installed, visualRegression: visualFixture(contrastPng, captureToolSha256, sha256(json(deploymentReport))), qa: qaRows, deploymentReport, r1DeploymentReport: r1Deployment(), r1DeploymentReceiptSha256: "45f8352507129ac0c9bac567b91f27df3af22ee16fab09c42384db59c7a8126d", deploymentReceiptSha256: sha256(json(deploymentReport)), gitAuthority: gitAuthority(), buildReceipt, focusedReceipt, normalizeQaReport: normalizeQaFixture };
});

test("assembler self-test and CLI require every explicit authority input", () => {
  assert.deepEqual(selfTest(), { schema: ASSEMBLER_SCHEMA, status: "PASS", payloadCount: 40, acceptedGates: 5, pendingGates: 1, createsPackage: false });
  assert.throws(() => parseArguments([]), /fieldMapDir/);
  assert.equal(parseArguments(["--self-test"]).selfTest, true);
});

test("governed receipts use the current exact Node runtime and keep TAP counts distinct from browser cases", async () => {
  const source = await readFile(path.join(ROOT, "scripts/assemble-phase7a-r2-review-evidence.mjs"), "utf8");
  assert.doesNotMatch(source, /execFileAsync\([^\n]*npm\.cmd/);
  assert.match(source, /process\.execPath[\s\S]*?npm-cli\.js/);
  assert.match(source, /path\.dirname\(process\.execPath\)[\s\S]*?npm_node_execpath\s*=\s*process\.execPath/);
  assert.match(source, /focusedReceipt\.testCount/);
  assert.match(source, /buildReceipt\.testCount/);
  assert.doesNotMatch(source, /testCount:\s*summaries\.reduce/);
});

test("pure construction emits the exact closed topology and passes package authority", async () => {
  const payloads = await constructR2Payloads(pure);
  assert.equal(payloads.size, 40);
  assert.deepEqual([...payloads.keys()].sort(), REQUIRED_R2_EVIDENCE.map(({ relativePath }) => relativePath).sort());
  assert.deepEqual([...payloads.keys()].filter((relativePath) => relativePath.endsWith("-background-mask.png")).sort(), [
    "06-accessibility/chromium-bifurcation-background-mask.png",
    "06-accessibility/chromium-field-map-open-background-mask.png",
    "06-accessibility/firefox-bifurcation-background-mask.png",
    "06-accessibility/firefox-field-map-open-background-mask.png",
  ]);
  const root = path.resolve(ROOT, "..", "synthetic-r2-evidence");
  assert.equal(normalizeR2EvidenceEntries([...payloads].map(([relativePath, data]) => ({ relativePath, data })), { sourceEvidenceRoot: root }).length, 40);
  const bundle = JSON.parse(payloads.get("00-authority/r2-field-map-authority.json"));
  assert.equal(bundle.focus.engineEvidence.length, 3);
  assert.equal(bundle.targets.states.length, 3);
  const source = JSON.parse(payloads.get("01-provenance/source-authority.json"));
  assert.equal(source.build.command, "npm run check:phase7a-r2");
  const deploymentBinding = JSON.parse(payloads.get("01-provenance/deployment-binding.json"));
  assert.equal(deploymentBinding.deploymentId, DEPLOYMENT_ID);
  assert.equal(deploymentBinding.immutableUrl, IMMUTABLE_URL);
  assert.equal(deploymentBinding.branchUrl, BRANCH_URL);
  assert.deepEqual(deploymentBinding.signedCheck, { name: "CLOUDFLARE_PAGES_SIGNED_GITHUB_CHECK", workflow: `GitHub check ${DEPLOYMENT_CHECK_RUN_ID}`, commitSha: REVISION, status: "PASS" });
  const gates = JSON.parse(payloads.get("00-authority/human-gates-status.json"));
  assert.equal(gates.gates.filter(({ decision }) => decision === "ACCEPT").length, 5);
  assert.equal(gates.gates.filter(({ decision }) => decision === "PENDING HUMAN REVIEW").length, 1);
});

test("same-session visual authority accepts encoding-only differences and rejects one rebound changed pixel", async () => {
  const encodingOnly = clonePure();
  const original = encodingOnly.visualRegression.outputFiles.get(PHASE7A_R2_VISUAL_REGRESSION_PATHS.currentClosed);
  const decoded = await sharp(original).raw().toBuffer({ resolveWithObject: true });
  const reencoded = await sharp(decoded.data, { raw: decoded.info }).png({ compressionLevel: 0 }).toBuffer();
  assert.equal(original.equals(reencoded), false);
  const encodingRecord = encodingOnly.visualRegression.report.comparisons[0].current;
  encodingRecord.bytes = reencoded.length; encodingRecord.sha256 = sha256(reencoded);
  encodingOnly.visualRegression.report.comparisons[0].result.encodedBytesEqual = false;
  encodingOnly.visualRegression.outputFiles.set(PHASE7A_R2_VISUAL_REGRESSION_PATHS.currentClosed, reencoded);
  rebindVisualReport(encodingOnly);
  await constructR2Payloads(encodingOnly);

  const changedPixel = clonePure();
  const mutated = await sharp(changedPixel.visualRegression.outputFiles.get(PHASE7A_R2_VISUAL_REGRESSION_PATHS.currentOpen))
    .composite([{ input: { create: { width: 1, height: 1, channels: 3, background: { r: 255, g: 0, b: 255 } } }, left: 10, top: 10 }]).png().toBuffer();
  const changedRecord = changedPixel.visualRegression.report.comparisons[1].current;
  changedRecord.bytes = mutated.length; changedRecord.sha256 = sha256(mutated); changedRecord.channels = (await sharp(mutated).metadata()).channels; changedPixel.visualRegression.report.comparisons[1].result.encodedBytesEqual = false;
  changedPixel.visualRegression.outputFiles.set(PHASE7A_R2_VISUAL_REGRESSION_PATHS.currentOpen, mutated);
  rebindVisualReport(changedPixel);
  await assert.rejects(() => constructR2Payloads(changedPixel), /pixels differ/);
});

test("same-session visual authority rejects false session, geometry, focus, asset and tool claims", async () => {
  for (const [label, mutate, pattern] of [
    ["headless browser", (fixture) => { fixture.visualRegression.report.browser.headed = false; }, /installed\/headed Chrome identity/],
    ["unbound renderer", (fixture) => { fixture.visualRegression.report.browser.rendering.rasterization = "enabled"; }, /renderer authority/],
    ["launch arguments", (fixture) => { fixture.visualRegression.report.browser.launchArguments = ["--run-all-compositor-stages-before-draw"]; }, /launch authority/],
    ["client width", (fixture) => { fixture.visualRegression.report.comparisons[1].current.metrics.clientWidth = 1424; fixture.visualRegression.report.comparisons[1].current.metrics.visualViewportWidth = 1424; fixture.visualRegression.report.comparisons[1].current.metrics.scrollbarWidth = 16; }, /capture conditions differ/],
    ["link in neutral pair", (fixture) => { fixture.visualRegression.report.comparisons[0].current.focus = "field-map-link"; }, /raster\/state authority/],
    ["asset mutation", (fixture) => { fixture.visualRegression.report.bindings.current.loadedAssets[0].sha256 = "e".repeat(64); }, /loaded CSS\/JS\/font\/image inventories differ/],
    ["tool mutation", (fixture) => { fixture.visualRegression.report.captureTool.sha256 = "e".repeat(64); }, /capture-tool hash/],
  ]) {
    const fixture = clonePure(); mutate(fixture); rebindVisualReport(fixture);
    await assert.rejects(() => constructR2Payloads(fixture), pattern, label);
  }
});

test("same-session visual authority independently binds exact receipt bytes and every loaded asset ledger row", async () => {
  for (const [label, mutate, pattern] of [
    ["R1 receipt bytes", (fixture) => { fixture.r1DeploymentReceiptSha256 = "e".repeat(64); }, /accepted R1 authority/],
    ["R2 receipt bytes", (fixture) => { fixture.deploymentReceiptSha256 = "e".repeat(64); }, /current receipt hash/],
    ["R1 asset ledger", (fixture) => { fixture.r1DeploymentReport.payloadLedger.find((row) => row.publicPath === "/_astro/navigation.css").immutable.sha256 = "e".repeat(64); }, /signed R1 payload ledger/],
    ["R2 dist asset ledger", (fixture) => { fixture.deploymentReport.dist.files.find((row) => row.requestPath === "/_astro/navigation.css").bytes += 1; }, /signed R2 dist\/immutable ledgers/],
    ["R2 immutable asset ledger", (fixture) => { fixture.deploymentReport.origins.immutable.data.responses.find((row) => row.publicPath === "/_astro/navigation.css").sha256 = "e".repeat(64); }, /signed R2 dist\/immutable ledgers/],
  ]) {
    const fixture = clonePure(); mutate(fixture);
    await assert.rejects(() => constructR2Payloads(fixture), pattern, label);
  }
});

test("Git, QA, deployment and semantic mutations fail closed", async () => {
  for (const [key, value, pattern] of [["status", " M src/components/SiteHeader.astro", /clean upstream/], ["originMain", "b".repeat(40), /main moved/], ["mergeRows", REVISION, /merge/], ["phase6Ancestor", false, /ancestry/], ["productionChangedPaths", ["src/pages/index.astro"], /production scope/]]) {
    const changed = structuredClone(gitAuthority()); changed[key] = value; assert.throws(() => validateGitAuthority(changed, REVISION), pattern);
  }
  const badQa = clonePure(); badQa.normalizeQaReport = (report, options) => ({ ...normalizeQaFixture(report, options), checks: { sourceBound: false } });
  await assert.rejects(() => constructR2Payloads(badQa), /normalized retained-QA checks/);
  const oldCommand = clonePure(); oldCommand.buildReceipt.command = "npm run check:phase7a-r1";
  await assert.rejects(() => constructR2Payloads(oldCommand), /governed build receipt/);
  const falseFocusedCount = clonePure(); falseFocusedCount.focusedReceipt.passed -= 1;
  await assert.rejects(() => constructR2Payloads(falseFocusedCount), /focused test receipt/);
  const badDeployment = clonePure(); badDeployment.deploymentReport.origins.branch.data.responses[0].sha256 = "e".repeat(64);
  await assert.rejects(() => constructR2Payloads(badDeployment), /branch index parity/);
  const badFocus = clonePure(); badFocus.generic.focus.engineEvidence[2].repeatedCycleCount = 9;
  await assert.rejects(() => constructR2Payloads(badFocus), /10-cycle status/);
  const badContrastScreenshot = clonePure(); badContrastScreenshot.generic.outputFiles.set("06-accessibility/chromium-bifurcation-background-mask.png", Buffer.from("substituted"));
  await assert.rejects(() => constructR2Payloads(badContrastScreenshot), /contrast screenshot binding differs/);
});

test("deployment binding requires the verifier's nested signed authority and rejects tampering", async () => {
  const flat = clonePure();
  flat.deploymentReport.deployment = { ...flat.deploymentReport.deployment.data };
  await assert.rejects(() => constructR2Payloads(flat), /signed deployment wrapper/);

  const mutations = [
    ["wrapper status", (report) => { report.deployment.status = "FAIL"; }, /signed deployment wrapper/],
    ["data status", (report) => { report.deployment.data.status = "FAIL"; }, /signed deployment authority/],
    ["deployed SHA", (report) => { report.deployment.data.deployedSha = "b".repeat(40); }, /signed deployment authority/],
    ["deployment ID", (report) => { report.deployment.data.deploymentId = "11111111-2222-4333-8444-555555555555"; }, /signed deployment identity/],
    ["immutable URL", (report) => { report.deployment.data.immutableUrl = "https://tampered.qsite1.pages.dev/"; }, /signed deployment identity/],
    ["branch URL", (report) => { report.deployment.data.branchUrl = "https://tampered-branch.qsite1.pages.dev/"; }, /signed deployment identity/],
    ["authority source", (report) => { report.deployment.data.authoritySource = "SYNTHETIC"; }, /signed deployment provenance/],
    ["app slug", (report) => { report.deployment.data.appSlug = "synthetic"; }, /signed deployment provenance/],
    ["check-run ID", (report) => { delete report.deployment.data.checkRunId; }, /signed deployment provenance/],
  ];
  for (const [label, mutate, pattern] of mutations) {
    const changed = clonePure();
    mutate(changed.deploymentReport);
    await assert.rejects(() => constructR2Payloads(changed), pattern, label);
  }

  const flatOrigin = clonePure();
  flatOrigin.deploymentReport.origins.immutable = { ...flatOrigin.deploymentReport.origins.immutable.data };
  await assert.rejects(() => constructR2Payloads(flatOrigin), /immutable wrapper/);
  const tamperedOrigin = clonePure();
  tamperedOrigin.deploymentReport.origins.branch.data.origin = "https://tampered-branch.qsite1.pages.dev/";
  await assert.rejects(() => constructR2Payloads(tamperedOrigin), /branch index parity/);
  const failedOriginData = clonePure();
  failedOriginData.deploymentReport.origins.branch.data.status = "FAIL";
  await assert.rejects(() => constructR2Payloads(failedOriginData), /branch index parity/);
  const failedOriginWrapper = clonePure();
  failedOriginWrapper.deploymentReport.origins.branch.status = "FAIL";
  await assert.rejects(() => constructR2Payloads(failedOriginWrapper), /branch wrapper/);
  const wrongRootProject = clonePure();
  wrongRootProject.deploymentReport.projectName = "other";
  await assert.rejects(() => constructR2Payloads(wrongRootProject), /root authority/);
});

async function writeCaptureRoot(root, pureFixture, installedMode) {
  await mkdir(root, { recursive: true });
  const sourceMap = installedMode ? new Map([...pureFixture.installed.outputFiles].map(([target, bytes]) => [({ "05-chrome-200/closed.png": "screenshots/closed.png", "05-chrome-200/open.png": "screenshots/open.png", "05-chrome-200/keyboard-focus.png": "screenshots/focus.png", "05-chrome-200/escape-focus-return.png": "screenshots/escape.png", "05-chrome-200/chrome-visible-200-percent.png": "screenshots/chrome-visible-200-percent.png" })[target], bytes])) : new Map([...pureFixture.generic.outputFiles].map(([target, bytes]) => [({ "03-focus/chromium-focus-cycle.mp4": "recordings/chromium-field-map-forward-reverse.mp4", "03-focus/firefox-focus-cycle.mp4": "recordings/firefox-field-map-forward-reverse.mp4", "03-focus/webkit-focus-cycle.mp4": "recordings/webkit-field-map-forward-reverse.mp4", "04-field-map/closed.png": "screenshots/chromium-closed.png", "04-field-map/open.png": "screenshots/chromium-open.png", "04-field-map/keyboard-focus.png": "screenshots/chromium-focus.png", "04-field-map/escape-focus-return.png": "screenshots/chromium-escape.png", "04-field-map/no-javascript-native-open.png": "screenshots/chromium-no-javascript-native-open.png", "04-field-map/reduced-motion.png": "screenshots/chromium-reduced-motion.png", "06-accessibility/chromium-bifurcation-background-mask.png": "screenshots/chromium-bifurcation-background-mask.png", "06-accessibility/firefox-bifurcation-background-mask.png": "screenshots/firefox-bifurcation-background-mask.png", "06-accessibility/chromium-field-map-open-background-mask.png": "screenshots/chromium-field-map-open-background-mask.png", "06-accessibility/firefox-field-map-open-background-mask.png": "screenshots/firefox-field-map-open-background-mask.png" })[target], bytes]));
  for (const [relativePath, bytes] of sourceMap) { const filename = path.join(root, ...relativePath.split("/")); await mkdir(path.dirname(filename), { recursive: true }); await writeFile(filename, bytes); }
  const entries = [...sourceMap].map(([entryPath, bytes]) => ({ path: entryPath, bytes: bytes.length, sha256: sha256(bytes) }));
  if (installedMode) {
    const reportBytes = json(pureFixture.installed.report); await writeFile(path.join(root, "installed-chrome-r2-field-map-report.json"), reportBytes);
    await writeFile(path.join(root, "manifest.json"), json({ schema: INSTALLED_MANIFEST_SCHEMA, entries, report: { path: "installed-chrome-r2-field-map-report.json", bytes: reportBytes.length, sha256: sha256(reportBytes) } }));
  } else {
    await writeFile(path.join(root, "field-map-capture.json"), json(pureFixture.generic.report));
    await writeFile(path.join(root, "focus-authority.json"), json(pureFixture.generic.focus));
    await writeFile(path.join(root, "axe-authority.json"), json(pureFixture.generic.axe));
    await writeFile(path.join(root, "target-fragment.json"), json(pureFixture.generic.targetFragment));
    await writeFile(path.join(root, "reduced-motion-evidence.json"), json(pureFixture.generic.reducedMotion));
    await writeFile(path.join(root, "manifest.json"), json({ schema: GENERIC_MANIFEST_SCHEMA, sourceHead: REVISION, entries }));
  }
}

async function writeVisualRoot(root, pureFixture) {
  await mkdir(root, { recursive: true });
  for (const [relativePath, bytes] of pureFixture.visualRegression.outputFiles) {
    const filename = path.join(root, ...relativePath.split("/"));
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, bytes);
  }
  const report = { path: PHASE7A_R2_VISUAL_REGRESSION_REPORT_PATH, bytes: pureFixture.visualRegression.reportBytes.length, sha256: pureFixture.visualRegression.reportSha256 };
  const entries = Object.values(PHASE7A_R2_VISUAL_REGRESSION_PATHS).map((relativePath) => {
    const bytes = pureFixture.visualRegression.outputFiles.get(relativePath);
    return { path: relativePath, bytes: bytes.length, sha256: sha256(bytes) };
  });
  await writeFile(path.join(root, "manifest.json"), json({ schema: PHASE7A_R2_VISUAL_REGRESSION_MANIFEST_SCHEMA, status: "PASS", baselineRevision: PHASE7A_R2_PARENT, currentRevision: REVISION, report, entries }));
}

test("filesystem assembler atomically writes exactly 40 payloads and refuses overwrite", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "qh-r2-assembler-"));
  const boundaryOptions = { repositoryRoot: ROOT, temporaryRoot: path.join(temp, "production-temp-sentinel") };
  try {
    const fieldMapDir = path.join(temp, "field-map"); const installedChromeDir = path.join(temp, "chrome"); const visualRegressionDir = path.join(temp, "visual"); const r1EvidenceDir = path.join(temp, "r1"); const outputDir = path.join(temp, "assembled");
    await writeCaptureRoot(fieldMapDir, pure, false); await writeCaptureRoot(installedChromeDir, pure, true); await writeVisualRoot(visualRegressionDir, pure);
    const r1DeploymentPath = path.join(r1EvidenceDir, "17-deployment", "deployment-verification.json"); await mkdir(path.dirname(r1DeploymentPath), { recursive: true }); await writeFile(r1DeploymentPath, json(r1Deployment()));
    const files = {};
    for (const engine of ["chromium", "firefox", "webkit"]) { files[`${engine}Qa`] = path.join(temp, `${engine}.json`); await writeFile(files[`${engine}Qa`], json(qa(engine))); }
    const deploymentPath = path.join(temp, "deployment.json"); await writeFile(deploymentPath, json(deployment()));
    const options = { fieldMapDir, installedChromeDir, visualRegressionDir, ...files, deployment: deploymentPath, r1EvidenceDir, outputDir, revision: REVISION };
    const dependencies = {
      boundaryOptions, gitAuthority: gitAuthority(), buildReceipt, focusedReceipt, normalizeQaReport: normalizeQaFixture,
      testOnlyPrevalidatedR1DeploymentRecord: { value: r1Deployment(), sha256: "45f8352507129ac0c9bac567b91f27df3af22ee16fab09c42384db59c7a8126d" },
      recordingDecoder: async ({ bytes }) => bytes.equals(mp4()),
    };
    const result = await assembleR2ReviewEvidence(options, dependencies);
    assert.equal(result.status, "PASS"); assert.equal(result.payloadCount, 40);
    const actual = [];
    const visit = async (directory, prefix = "") => { for (const entry of await readdir(directory, { withFileTypes: true })) { if (entry.isDirectory()) await visit(path.join(directory, entry.name), `${prefix}${entry.name}/`); else actual.push(`${prefix}${entry.name}`); } };
    await visit(outputDir);
    assert.deepEqual(actual.sort(), REQUIRED_R2_EVIDENCE.map(({ relativePath }) => relativePath).sort());
    await assert.rejects(() => assembleR2ReviewEvidence(options, dependencies), /refusing to overwrite/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
