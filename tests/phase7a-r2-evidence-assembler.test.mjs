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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REVISION = "a".repeat(40);
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
function deployment() { const row = { relativePath: "index.html", bytes: 1000, sha256: "d".repeat(64) }; const response = () => ({ ...row, actualHttpStatus: 200 }); return { schema: DEPLOYMENT_SCHEMA, authorityProfile: "phase7a-r2", status: "PASS", deployedSha: REVISION, parity: "PASS", deploymentId: "deploy-r2", immutableUrl: "https://deploy-r2.example.invalid/", branchUrl: "https://repair-r2.example.invalid/", deployment: { status: "PASS", authoritySource: "CLOUDFLARE_PAGES_SIGNED_GITHUB_CHECK", checkRunId: "123", deploymentId: "deploy-r2", deployedSha: REVISION }, dist: { files: [row] }, origins: { immutable: { status: "PASS", responses: [response()] }, branch: { status: "PASS", responses: [response()] } } }; }

let png;
let contrastPng;
let pure;
const clonePure = () => {
  const generic = structuredClone(pure.generic);
  const installed = structuredClone(pure.installed);
  generic.outputFiles = new Map([...pure.generic.outputFiles].map(([relativePath, bytes]) => [relativePath, Buffer.from(bytes)]));
  installed.outputFiles = new Map([...pure.installed.outputFiles].map(([relativePath, bytes]) => [relativePath, Buffer.from(bytes)]));
  return { ...pure, generic, installed, qa: structuredClone(pure.qa), deploymentReport: structuredClone(pure.deploymentReport), gitAuthority: structuredClone(pure.gitAuthority), buildReceipt: structuredClone(pure.buildReceipt), focusedReceipt: structuredClone(pure.focusedReceipt), r1Baselines: structuredClone(pure.r1Baselines), normalizeQaReport: pure.normalizeQaReport };
};

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
  pure = { authorityDocumentBytes: Buffer.from("# authority\n"), generic, installed, qa: qaRows, deploymentReport: deployment(), gitAuthority: gitAuthority(), buildReceipt, focusedReceipt, normalizeQaReport: normalizeQaFixture, r1Baselines: { closed: { relativePath: "07-field-map/visuals/closed-desktop-1440x900.png", bytes: png }, open: { relativePath: "07-field-map/visuals/open-desktop-1440x900.png", bytes: png } } };
});

test("assembler self-test and CLI require every explicit authority input", () => {
  assert.deepEqual(selfTest(), { schema: ASSEMBLER_SCHEMA, status: "PASS", payloadCount: 34, acceptedGates: 5, pendingGates: 1, createsPackage: false });
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
  assert.equal(payloads.size, 34);
  assert.deepEqual([...payloads.keys()].sort(), REQUIRED_R2_EVIDENCE.map(({ relativePath }) => relativePath).sort());
  assert.deepEqual([...payloads.keys()].filter((relativePath) => relativePath.endsWith("-background-mask.png")).sort(), [
    "06-accessibility/chromium-bifurcation-background-mask.png",
    "06-accessibility/chromium-field-map-open-background-mask.png",
    "06-accessibility/firefox-bifurcation-background-mask.png",
    "06-accessibility/firefox-field-map-open-background-mask.png",
  ]);
  const root = path.resolve(ROOT, "..", "synthetic-r2-evidence");
  assert.equal(normalizeR2EvidenceEntries([...payloads].map(([relativePath, data]) => ({ relativePath, data })), { sourceEvidenceRoot: root }).length, 34);
  const bundle = JSON.parse(payloads.get("00-authority/r2-field-map-authority.json"));
  assert.equal(bundle.focus.engineEvidence.length, 3);
  assert.equal(bundle.targets.states.length, 3);
  const source = JSON.parse(payloads.get("01-provenance/source-authority.json"));
  assert.equal(source.build.command, "npm run check:phase7a-r2");
  const gates = JSON.parse(payloads.get("00-authority/human-gates-status.json"));
  assert.equal(gates.gates.filter(({ decision }) => decision === "ACCEPT").length, 5);
  assert.equal(gates.gates.filter(({ decision }) => decision === "PENDING HUMAN REVIEW").length, 1);
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
  const badDeployment = clonePure(); badDeployment.deploymentReport.origins.branch.responses[0].sha256 = "e".repeat(64);
  await assert.rejects(() => constructR2Payloads(badDeployment), /branch index parity/);
  const badFocus = clonePure(); badFocus.generic.focus.engineEvidence[2].repeatedCycleCount = 9;
  await assert.rejects(() => constructR2Payloads(badFocus), /10-cycle status/);
  const badContrastScreenshot = clonePure(); badContrastScreenshot.generic.outputFiles.set("06-accessibility/chromium-bifurcation-background-mask.png", Buffer.from("substituted"));
  await assert.rejects(() => constructR2Payloads(badContrastScreenshot), /contrast screenshot binding differs/);
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

test("filesystem assembler atomically writes exactly 34 payloads and refuses overwrite", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "qh-r2-assembler-"));
  const boundaryOptions = { repositoryRoot: ROOT, temporaryRoot: path.join(temp, "production-temp-sentinel") };
  try {
    const fieldMapDir = path.join(temp, "field-map"); const installedChromeDir = path.join(temp, "chrome"); const r1EvidenceDir = path.join(temp, "r1"); const outputDir = path.join(temp, "assembled");
    await writeCaptureRoot(fieldMapDir, pure, false); await writeCaptureRoot(installedChromeDir, pure, true);
    for (const state of ["closed", "open"]) { const filename = path.join(r1EvidenceDir, "07-field-map/visuals", `${state}-desktop-1440x900.png`); await mkdir(path.dirname(filename), { recursive: true }); await writeFile(filename, png); }
    const files = {};
    for (const engine of ["chromium", "firefox", "webkit"]) { files[`${engine}Qa`] = path.join(temp, `${engine}.json`); await writeFile(files[`${engine}Qa`], json(qa(engine))); }
    const deploymentPath = path.join(temp, "deployment.json"); await writeFile(deploymentPath, json(deployment()));
    const options = { fieldMapDir, installedChromeDir, ...files, deployment: deploymentPath, r1EvidenceDir, outputDir, revision: REVISION };
    const dependencies = { boundaryOptions, gitAuthority: gitAuthority(), buildReceipt, focusedReceipt, normalizeQaReport: normalizeQaFixture, recordingDecoder: async ({ bytes }) => bytes.equals(mp4()) };
    const result = await assembleR2ReviewEvidence(options, dependencies);
    assert.equal(result.status, "PASS"); assert.equal(result.payloadCount, 34);
    const actual = [];
    const visit = async (directory, prefix = "") => { for (const entry of await readdir(directory, { withFileTypes: true })) { if (entry.isDirectory()) await visit(path.join(directory, entry.name), `${prefix}${entry.name}/`); else actual.push(`${prefix}${entry.name}`); } };
    await visit(outputDir);
    assert.deepEqual(actual.sort(), REQUIRED_R2_EVIDENCE.map(({ relativePath }) => relativePath).sort());
    await assert.rejects(() => assembleR2ReviewEvidence(options, dependencies), /refusing to overwrite/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
