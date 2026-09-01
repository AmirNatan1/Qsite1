import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { parseStoredZip } from "../scripts/audit-phase7a-human-review-package.mjs";
import {
  R2_AUDIT_SCHEMA,
  REQUIRED_R2_EVIDENCE as AUDIT_REQUIRED,
  assertAllowedR2AuditPath,
  auditR2PackageBytes,
  auditR2ReviewFile,
  auditR2ReviewBytes,
  parseArguments as parseAuditArguments,
  runSelfTest as auditSelfTest,
  safeR2AuditPath,
} from "../scripts/audit-phase7a-r2-package.mjs";
import { createStoredZipBuffer, sha256, stableJson } from "../scripts/package-phase7a-human-review.mjs";
import { FROZEN_MAIN, PHASE7A_PARENT, PHYSICAL_ASSETS } from "../scripts/phase7a-contract.mjs";
import {
  IN_ARCHIVE_MANIFEST,
  PHASE7A_R2_REVIEW_ZIP_NAME,
  REQUIRED_R2_EVIDENCE,
  R2_BRANCH,
  R2_ARIA_DIFF_SCHEMA,
  R2_DEPLOYMENT_BINDING_SCHEMA,
  R2_HUMAN_GATES_SCHEMA,
  R2_INSTALLED_CHROME_SCHEMA,
  R2_LIMITATIONS_SCHEMA,
  R2_MANIFEST_SCHEMA,
  R2_PACKAGE_SCHEMA,
  R2_PHASE4_HASH_SCHEMA,
  R2_PREPACKAGE_AUDIT_SCHEMA,
  R2_SOURCE_AUTHORITY_SCHEMA,
  R2_TASK_AUTHORITY_SCHEMA,
  R2_TASK_REQUIREMENTS,
  R2_TASK_SCOPE,
  R2_TEST_RECEIPT_SCHEMA,
  R2_HUMAN_GATES,
  assertAllowedR2EvidencePath,
  buildR2ReviewArtifacts,
  normalizeR2EvidenceEntries,
  packageR2ReviewDirectory,
  parseArguments as parsePackageArguments,
  runSelfTest as packageSelfTest,
  safeR2EvidencePath,
} from "../scripts/package-phase7a-r2-human-review.mjs";
import {
  PHASE7A_R2_AXE_CASES,
  PHASE7A_R2_AXE_SCHEMA,
  PHASE7A_R2_AXE_VERSION,
  PHASE7A_R2_BUNDLE_SCHEMA,
  PHASE7A_R2_FIELD_MAP_DESTINATIONS,
  PHASE7A_R2_FIELD_MAP_SCHEMA,
  PHASE7A_R2_PARENT,
  PHASE7A_R2_SUMMARY_AX_ROLE,
  PHASE7A_R2_TARGET_SCHEMA,
  PHASE7A_R2_TARGET_STATES,
} from "../scripts/phase7a-r2-field-map-authority.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXTERNAL_EVIDENCE_ROOT = path.resolve(ROOT, "..", "phase7a-r2-compact-source-evidence");
const EXTERNAL_OUTPUT_ROOT = path.resolve(ROOT, "..", "phase7a-r2-compact-package-output");
const FINAL_HEAD = "a".repeat(40);

const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const cloneEntries = (entries) => entries.map(({ relativePath, data }) => ({ relativePath, data: Buffer.from(data) }));

function trigger(expanded) {
  return { tag: "summary", ariaControls: "field-map-navigation", ariaHasPopup: null, authoredAriaExpanded: null, axRole: PHASE7A_R2_SUMMARY_AX_ROLE, axName: "Field map", axExpanded: expanded };
}

function destinations() {
  return PHASE7A_R2_FIELD_MAP_DESTINATIONS.map(({ href, name, focusName }) => ({ href, accessibleName: name, focusName, visible: true, focusable: true, axRole: "link" }));
}

function openState() {
  return {
    open: true, rootOpen: true, backgroundRegionCount: 3, inertRegionCount: 3, ownedInertCount: 3,
    activeElement: "a", activeDestinationName: "About", trigger: trigger(true), destinations: destinations(),
    focusableInventory: [
      { element: "summary", name: "Field map", insideFieldMap: true },
      ...PHASE7A_R2_FIELD_MAP_DESTINATIONS.map(({ focusName }) => ({ element: "a", name: focusName, insideFieldMap: true })),
    ],
  };
}

function closedState(activeElement = "body") {
  return { open: false, rootOpen: false, backgroundRegionCount: 3, inertRegionCount: 0, ownedInertCount: 0, activeElement, trigger: trigger(false) };
}

const focus = (activeElement, activeDestinationName) => ({ activeElement, activeDestinationName });

function semanticBundle() {
  const forwardCycle = [
    focus("a", "About"), focus("a", "Contact"), focus("field-map-summary", null),
    ...PHASE7A_R2_FIELD_MAP_DESTINATIONS.slice(0, 6).map(({ focusName }) => focus("a", focusName)),
    focus("a", "About"),
  ].map((record, index) => ({ step: index + 1, ...record }));
  const reverseCycle = [
    ...[...PHASE7A_R2_FIELD_MAP_DESTINATIONS].reverse().map(({ focusName }) => focus("a", focusName)),
    focus("field-map-summary", null),
  ].map((record, index) => ({ step: index + 1, ...record }));
  const engineEvidence = [
    ["chromium", "installed/headed Google Chrome; Chromium CDP AX-property authority"],
    ["firefox", "headed Firefox automation"],
    ["webkit", "Playwright WebKit proxy; not physical Safari"],
  ].map(([engine, classification]) => ({
    engine, classification, forwardCycle: structuredClone(forwardCycle), reverseCycle: structuredClone(reverseCycle),
    bodyStops: { forward: 0, reverse: 0 },
    escape: { activeElement: "field-map-summary", open: false, rootOpen: false, backgroundRegionCount: 3, inertRegionCount: 0, ownedInertCount: 0 },
    repeatedCycleCount: 10, repeatedCycleStatus: "PASS", duplicateBinding: { cycles: 10, status: "PASS" }, status: "PASS",
  }));
  const fieldMap = {
    schema: PHASE7A_R2_FIELD_MAP_SCHEMA,
    status: "PASS",
    parent: PHASE7A_R2_PARENT,
    route: "/about/",
    states: { closed: closedState(), open: openState(), escape: closedState("field-map-summary") },
    focus: { initial: focus("a", "About"), forwardCycle, reverseFromSummary: focus("a", "Contact"), outsideRecapture: focus("a", "About"), postCloseOutsideFocus: "outside-test-control" },
    repeatedCycles: Array.from({ length: 3 }, (_, index) => ({ cycle: index + 1, opened: openState(), closed: closedState("field-map-summary") })),
    engineEvidence,
    noJavaScript: {
      controller: null,
      nativeDetailsOpen: true,
      horizontalOverflow: false,
      trigger: trigger(true),
      destinations: PHASE7A_R2_FIELD_MAP_DESTINATIONS.map(({ href, name }) => ({ href, accessibleName: name, visible: true, fullyInViewport: true, unoccluded: true })),
    },
  };
  const axe = {
    schema: PHASE7A_R2_AXE_SCHEMA,
    status: "PASS",
    parent: PHASE7A_R2_PARENT,
    axeVersion: PHASE7A_R2_AXE_VERSION,
    engines: ["chromium", "firefox"].map((engine) => ({
      engine, status: "PASS", violationCount: 0, incompleteCount: 0,
      cases: PHASE7A_R2_AXE_CASES.map(({ route, state }) => ({ route, state, status: "PASS", passes: 32, violations: [], incomplete: [] })),
    })),
    manualContrast: {
      method: "WCAG 2.x relative luminance; worst authored solid/composited CSS colors, with radial and active-link overlays conservatively combined to #24141c",
      pairs: [
        { id: "field-map-white-over-max-layered-plane", foreground: "#ffffff", background: "#24141c", threshold: 4.5, ratio: 17.62 },
        { id: "field-map-muted-over-max-layered-plane", foreground: "#8a9797", background: "#24141c", threshold: 4.5, ratio: 5.835 },
        { id: "manifesto-white-over-live-magenta", foreground: "#ffffff", background: "#d82b72", threshold: 3, ratio: 4.658 },
      ],
      status: "PASS",
    },
  };
  const controlRows = () => [
    { selector: "[data-field-map] > summary", href: null, accessibleName: "Field map", elementType: "summary", width: 152, height: 44, visible: true, intendedInteractive: true },
    ...PHASE7A_R2_FIELD_MAP_DESTINATIONS.map(({ href, name }) => ({ selector: `[data-field-map] a[href="${href}"]`, href, accessibleName: name, elementType: "a", width: 180, height: 44, visible: true, intendedInteractive: true })),
  ];
  const targets = {
    schema: PHASE7A_R2_TARGET_SCHEMA,
    status: "PASS",
    parent: PHASE7A_R2_PARENT,
    minimumCssPixels: 44,
    states: PHASE7A_R2_TARGET_STATES.map((state) => ({
      id: state.id, route: state.route, state: state.state,
      viewport: state.viewport ? { ...state.viewport } : { id: "installed-chrome-native-200", width: 519, height: 399 },
      genuineInstalledChrome: state.genuineInstalledChrome, nativeZoomPercent: state.nativeZoomPercent,
      candidateCount: 9, controls: controlRows(), status: "PASS",
    })),
  };
  return { schema: PHASE7A_R2_BUNDLE_SCHEMA, status: "PASS", parent: PHASE7A_R2_PARENT, reviewZipName: PHASE7A_R2_REVIEW_ZIP_NAME, focus: fieldMap, axe, targets };
}

function sourceAuthority() {
  return {
    schema: R2_SOURCE_AUTHORITY_SCHEMA, status: "PASS", branch: R2_BRANCH, parent: PHASE7A_R2_PARENT, head: FINAL_HEAD,
    acceptedPhase6: PHASE7A_PARENT, acceptedPhase6Ancestry: true, localMain: FROZEN_MAIN, originMain: FROZEN_MAIN,
    mergeCount: 0, commits: [{ hash: FINAL_HEAD, parent: PHASE7A_R2_PARENT, subject: "repair Field Map focus semantics" }],
    worktreeClean: true, worktreeStatus: [], upstream: `origin/${R2_BRANCH}`, upstreamHead: FINAL_HEAD, upstreamParity: true,
    productionChangedPaths: [...R2_TASK_SCOPE],
    build: { command: "npm run check:phase7a-r2", status: "PASS", head: FINAL_HEAD, worktreeClean: true, errors: 0, warnings: 0, hints: 0 },
  };
}

const engineSummaries = () => ["chromium", "firefox", "webkit"].map((engine) => ({ engine, status: "PASS", passCount: 10, failures: 0 }));
const reportHashes = () => ["chromium", "firefox", "webkit"].map((name, index) => ({ name, sha256: String(index + 1).repeat(64) }));

function box(type, payload = Buffer.alloc(0)) {
  const result = Buffer.alloc(8 + payload.length);
  result.writeUInt32BE(result.length, 0);
  result.write(type, 4, 4, "ascii");
  payload.copy(result, 8);
  return result;
}

function fixtureMp4() {
  return Buffer.concat([box("ftyp"), box("moov"), box("mdat")]);
}

let png;
let fixtureEntries;
let artifacts;
let filesystemRoot;
let evidenceDir;
let outputDir;
let boundaryOptions;

test.before(async () => {
  png = await sharp({ create: { width: 4, height: 3, channels: 3, background: { r: 24, g: 118, b: 164 } } }).png().toBuffer();
  const authorityDocumentBytes = await readFile(path.join(ROOT, "docs/phase-7a-r2-review-authority.md"));
  const byPath = new Map();
  byPath.set("00-authority/task-authority.json", json({ schema: R2_TASK_AUTHORITY_SCHEMA, status: "PASS", parent: PHASE7A_R2_PARENT, reviewZipName: PHASE7A_R2_REVIEW_ZIP_NAME, authorityDocument: { path: "docs/phase-7a-r2-review-authority.md", bytes: authorityDocumentBytes.length, sha256: sha256(authorityDocumentBytes) }, scope: [...R2_TASK_SCOPE], requirements: [...R2_TASK_REQUIREMENTS] }));
  byPath.set("00-authority/human-gates-status.json", json({ schema: R2_HUMAN_GATES_SCHEMA, status: "PENDING_HUMAN_REVIEW", gates: R2_HUMAN_GATES.map((gate) => ({ ...gate })) }));
  byPath.set("00-authority/r2-field-map-authority.json", json(semanticBundle()));
  byPath.set("01-provenance/source-authority.json", json(sourceAuthority()));
  const dist = { path: "dist/index.html", bytes: 1234, sha256: "d".repeat(64) };
  byPath.set("01-provenance/deployment-binding.json", json({ schema: R2_DEPLOYMENT_BINDING_SCHEMA, status: "PASS", parent: PHASE7A_R2_PARENT, head: FINAL_HEAD, deploymentId: "deployment-r2-final", immutableUrl: "https://deployment-r2-final.example.invalid/", branchUrl: "https://repair-phase-7a-r2.example.invalid/", deployedSha: FINAL_HEAD, signedCheck: { name: "pages-deployment", workflow: "Cloudflare Pages", commitSha: FINAL_HEAD, status: "PASS" }, localDist: dist, deployedParity: { immutable: { status: "PASS", httpStatus: 200, bytes: dist.bytes, sha256: dist.sha256 }, branch: { status: "PASS", httpStatus: 200, bytes: dist.bytes, sha256: dist.sha256 } } }));
  byPath.set("02-diff/production.diff", Buffer.from("diff --git a/src/components/SiteHeader.astro b/src/components/SiteHeader.astro\nindex 1111111..2222222 100644\n--- a/src/components/SiteHeader.astro\n+++ b/src/components/SiteHeader.astro\n@@ -1 +1 @@\n-old focus semantics\n+new focus semantics\n"));
  byPath.set("02-diff/aria-before-after.json", json({ schema: R2_ARIA_DIFF_SCHEMA, status: "PASS", before: ["aria-controls"], after: [] }));
  const bundle = semanticBundle();
  byPath.set("03-focus/raw-cross-engine-focus.json", json(bundle.focus));
  byPath.set("05-chrome-200/installed-chrome-200.json", json({ schema: R2_INSTALLED_CHROME_SCHEMA, status: "PASS", genuineInstalledChrome: true, nativeZoomPercent: 200, report: { fieldMapOpen: true, horizontalOverflow: false } }));
  byPath.set("06-accessibility/axe-and-manual-contrast.json", json(bundle.axe));
  byPath.set("06-accessibility/target-inventory.json", json(bundle.targets));
  byPath.set("07-regression/focused-regression.json", json({ schema: R2_TEST_RECEIPT_SCHEMA, status: "PASS", command: "node --test tests/phase7a-r2-field-map-authority.test.mjs tests/phase7a-r2-evidence-assembler.test.mjs", testCount: 6, failures: 0, checks: { fieldMapFocus: true, aria: true, axe: true, targetSize: true, installedChrome200: true }, engineSummaries: engineSummaries(), reportHashes: reportHashes() }));
  byPath.set("07-regression/retained-suite.json", json({ schema: R2_TEST_RECEIPT_SCHEMA, status: "PASS", command: "npm run check:phase7a-r2", testCount: 134, failures: 0, checks: { signalField: true, audienceBifurcation: true, shortLandscape800x360: true, noJavaScript: true, reducedMotion: true, lifecycleCleanup: true, publicationBoundaries: true }, engineSummaries: engineSummaries(), reportHashes: reportHashes() }));
  byPath.set("08-governance/phase4-hashes.json", json({ schema: R2_PHASE4_HASH_SCHEMA, status: "PASS", assets: PHYSICAL_ASSETS.map(([assetPath, assetSha256]) => ({ path: assetPath, sha256: assetSha256 })) }));
  byPath.set("08-governance/environmental-limitations.json", json({ schema: R2_LIMITATIONS_SCHEMA, status: "DECLARED", limitations: ["Human acceptance remains external to this evidence package."], creativeStability: { baselineRevision: PHASE7A_R2_PARENT, currentRevision: FINAL_HEAD, comparisons: ["closed", "open"].map((state) => ({ state, baselinePath: `07-field-map/visuals/${state}-desktop-1440x900.png`, baselineSha256: sha256(png), currentPath: `04-field-map/${state}.png`, currentSha256: sha256(png), comparison: "EXACT_BYTES", status: "PASS" })) } }));
  for (const { relativePath } of REQUIRED_R2_EVIDENCE) {
    if (relativePath.endsWith(".png")) byPath.set(relativePath, png);
    if (relativePath.endsWith(".mp4")) byPath.set(relativePath, fixtureMp4());
  }
  const auditedRows = [...byPath].sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right))).map(([relativePath, data]) => ({ path: relativePath, bytes: data.length, sha256: sha256(data), status: "PASS" }));
  byPath.set("09-audit/prepackage-evidence-audit.json", json({ schema: R2_PREPACKAGE_AUDIT_SCHEMA, status: "PASS", auditedPayloadCount: auditedRows.length, finalPayloadCount: REQUIRED_R2_EVIDENCE.length, auditedPayloadBytes: auditedRows.reduce((sum, row) => sum + row.bytes, 0), selfExclusion: "prepackage audit excludes its own bytes to avoid self-reference", payloads: auditedRows, checks: { topology: "PASS", pathSafety: "PASS", privacyAndSecrets: "PASS", forbiddenPayloadClasses: "PASS", semanticAuthority: "PASS" }, mediaDecode: { png: "PASS", pngCount: 11, mp4: "PASS", mp4Count: 3 } }));
  fixtureEntries = [...byPath].map(([relativePath, data]) => ({ relativePath, data }));
  artifacts = buildR2ReviewArtifacts(cloneEntries(fixtureEntries), { sourceEvidenceRoot: EXTERNAL_EVIDENCE_ROOT });
  filesystemRoot = await mkdtemp(path.join(os.tmpdir(), "qh-r2-package-api-"));
  evidenceDir = path.join(filesystemRoot, "evidence");
  outputDir = path.join(filesystemRoot, "output");
  boundaryOptions = { repositoryRoot: ROOT, temporaryRoot: path.join(filesystemRoot, "production-temp-refusal-sentinel") };
  for (const entry of fixtureEntries) {
    const target = path.join(evidenceDir, ...entry.relativePath.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, entry.data, { flag: "wx" });
  }
});

test.after(async () => {
  if (filesystemRoot) await rm(filesystemRoot, { recursive: true, force: true });
});

function mutateJsonEntry(entries, relativePath, mutate) {
  return entries.map((entry) => {
    if (entry.relativePath !== relativePath) return { relativePath: entry.relativePath, data: Buffer.from(entry.data) };
    const document = JSON.parse(entry.data.toString("utf8"));
    mutate(document);
    return { relativePath, data: json(document) };
  });
}

function rebuildWith(changes) {
  const parsed = parseStoredZip(artifacts.archiveBytes).entries;
  return createStoredZipBuffer([...parsed].map(([relativePath, entry]) => ({ relativePath, data: changes.get(relativePath) ?? entry.data })));
}

test("R2 package and audit CLIs require explicit external roots", () => {
  assert.deepEqual(packageSelfTest(), { schema: R2_PACKAGE_SCHEMA, status: "PASS", reviewZipName: PHASE7A_R2_REVIEW_ZIP_NAME, requiredPayloads: 30, realPackageCreationEnabled: true });
  assert.deepEqual(auditSelfTest(), { schema: R2_AUDIT_SCHEMA, status: "PASS", reviewZipName: PHASE7A_R2_REVIEW_ZIP_NAME, requiredPayloads: 30, realFileAuditEnabled: true });
  assert.throws(() => parsePackageArguments([]), /--evidence-dir/);
  assert.throws(() => parsePackageArguments(["--evidence-dir", EXTERNAL_EVIDENCE_ROOT]), /--output-dir/);
  assert.throws(() => parsePackageArguments(["--evidence-dir", ROOT, "--output-dir", EXTERNAL_OUTPUT_ROOT]), /outside the Git repository/);
  const parsed = parsePackageArguments(["--evidence-dir", EXTERNAL_EVIDENCE_ROOT, "--output-dir", EXTERNAL_OUTPUT_ROOT]);
  assert.equal(parsed.evidenceDir, EXTERNAL_EVIDENCE_ROOT);
  assert.equal(parsed.outputDir, EXTERNAL_OUTPUT_ROOT);
  assert.throws(() => parseAuditArguments(["--zip", path.join(EXTERNAL_OUTPUT_ROOT, "wrong.zip"), "--report", path.join(EXTERNAL_OUTPUT_ROOT, "audit.json")]), /basename/);
  assert.equal(parseAuditArguments(["--zip", path.join(EXTERNAL_OUTPUT_ROOT, PHASE7A_R2_REVIEW_ZIP_NAME), "--report", path.join(EXTERNAL_OUTPUT_ROOT, "audit.json")]).zipPath.endsWith(PHASE7A_R2_REVIEW_ZIP_NAME), true);
  assert.throws(() => parsePackageArguments(["--evidence-dir", evidenceDir, "--output-dir", outputDir]), /OS temporary directory/);
  assert.throws(() => parseAuditArguments(["--zip", path.join(outputDir, PHASE7A_R2_REVIEW_ZIP_NAME), "--report", path.join(outputDir, "audit.json")]), /OS temporary directory/);
});

test("compact R2 package is exact, deterministic and manifests every payload byte/hash/CRC", () => {
  assert.equal(PHASE7A_R2_REVIEW_ZIP_NAME, "phase-7a-r2-field-map-focus-human-review.zip");
  assert.equal(REQUIRED_R2_EVIDENCE.length, 30);
  assert.deepEqual(REQUIRED_R2_EVIDENCE, AUDIT_REQUIRED);
  assert.equal(artifacts.manifest.schema, R2_MANIFEST_SCHEMA);
  assert.equal(artifacts.manifest.archiveFilename, PHASE7A_R2_REVIEW_ZIP_NAME);
  assert.equal(artifacts.manifest.payloads.length, fixtureEntries.length);
  for (const payload of artifacts.manifest.payloads) {
    const source = fixtureEntries.find(({ relativePath }) => relativePath === payload.path);
    assert.ok(source, payload.path);
    assert.equal(payload.bytes, source.data.length);
    assert.equal(payload.sha256, sha256(source.data));
    assert.match(payload.crc32, /^[0-9a-f]{8}$/);
  }
  const repeated = buildR2ReviewArtifacts(cloneEntries(fixtureEntries), { sourceEvidenceRoot: EXTERNAL_EVIDENCE_ROOT });
  assert.deepEqual(repeated.archiveBytes, artifacts.archiveBytes);
  assert.deepEqual(repeated.manifestBytes, artifacts.manifestBytes);
  const parsed = parseStoredZip(artifacts.archiveBytes);
  assert.equal(parsed.entries.size, 31);
  assert.ok(parsed.entries.has(IN_ARCHIVE_MANIFEST));
});

test("packager and independent path policies reject traversal, duplicates and forbidden payload classes", () => {
  for (const invalid of ["../escape.json", "/absolute.json", "C:/absolute.json", "folder\\file.json", "a/%2e%2e/b.json"]) {
    assert.throws(() => safeR2EvidencePath(invalid), /portable|unsafe|reinterpretation/i);
    assert.throws(() => safeR2AuditPath(invalid), /portable|unsafe|reinterpretation/i);
  }
  for (const invalid of ["proof.zip", "font.woff2", "source.mov", "node_modules/file.json", "browser-cache/state.json", "Default/Cache/data.json", "src/private.json"]) {
    assert.throws(() => assertAllowedR2EvidencePath(invalid), /nested archive|font binary|source media|forbidden/i);
    assert.throws(() => assertAllowedR2AuditPath(invalid), /nested archive|font binary|source media|forbidden/i);
  }
  const missing = cloneEntries(fixtureEntries).slice(1);
  assert.throws(() => normalizeR2EvidenceEntries(missing, { sourceEvidenceRoot: EXTERNAL_EVIDENCE_ROOT }), /topology differs/);
  const duplicate = cloneEntries(fixtureEntries);
  duplicate.push({ relativePath: fixtureEntries[0].relativePath, data: Buffer.from(fixtureEntries[0].data) });
  assert.throws(() => normalizeR2EvidenceEntries(duplicate, { sourceEvidenceRoot: EXTERNAL_EVIDENCE_ROOT }), /duplicate/);
  const privatePayload = cloneEntries(fixtureEntries).map((entry) => entry.relativePath === "02-diff/production.diff" ? { ...entry, data: Buffer.from(`${entry.data}\nC:\\Users\\amir\\secret.txt\n`) } : entry);
  assert.throws(() => normalizeR2EvidenceEntries(privatePayload, { sourceEvidenceRoot: EXTERNAL_EVIDENCE_ROOT }), /privacy or secret scan/);
  const secretPayload = cloneEntries(fixtureEntries).map((entry) => entry.relativePath === "02-diff/production.diff" ? { ...entry, data: Buffer.from(`${entry.data}\napi_key=abcdefghijklmnop\n`) } : entry);
  assert.throws(() => normalizeR2EvidenceEntries(secretPayload, { sourceEvidenceRoot: EXTERNAL_EVIDENCE_ROOT }), /privacy or secret scan/);
});

test("packager rejects false R2 semantic authority and a production diff outside SiteHeader", () => {
  const falseAxe = mutateJsonEntry(fixtureEntries, "00-authority/r2-field-map-authority.json", (document) => { document.axe.engines[0].cases[0].violations.push({ id: "aria-allowed-attr" }); });
  assert.throws(() => buildR2ReviewArtifacts(falseAxe, { sourceEvidenceRoot: EXTERNAL_EVIDENCE_ROOT }), /contains violations/);
  const sub44 = mutateJsonEntry(fixtureEntries, "00-authority/r2-field-map-authority.json", (document) => { document.targets.states[0].controls[0].height = 43.99; });
  assert.throws(() => buildR2ReviewArtifacts(sub44, { sourceEvidenceRoot: EXTERNAL_EVIDENCE_ROOT }), /below 44/);
  const wrongFocus = mutateJsonEntry(fixtureEntries, "00-authority/r2-field-map-authority.json", (document) => { document.focus.focus.postCloseOutsideFocus = "a"; });
  assert.throws(() => buildR2ReviewArtifacts(wrongFocus, { sourceEvidenceRoot: EXTERNAL_EVIDENCE_ROOT }), /remains active after close/);
  const extraDiff = cloneEntries(fixtureEntries).map((entry) => entry.relativePath === "02-diff/production.diff" ? { ...entry, data: Buffer.from(`${entry.data}\ndiff --git a/src/pages/index.astro b/src/pages/index.astro\n`) } : entry);
  assert.throws(() => buildR2ReviewArtifacts(extraDiff, { sourceEvidenceRoot: EXTERNAL_EVIDENCE_ROOT }), /single-file scope/);
});

test("expanded R2 authority receipts fail closed independently", () => {
  const closedGate = mutateJsonEntry(fixtureEntries, "00-authority/human-gates-status.json", (document) => { document.status = "PASS"; });
  assert.throws(() => buildR2ReviewArtifacts(closedGate, { sourceEvidenceRoot: EXTERNAL_EVIDENCE_ROOT }), /human-gates status/);
  const detachedDeployment = mutateJsonEntry(fixtureEntries, "01-provenance/deployment-binding.json", (document) => { document.head = "b".repeat(40); });
  assert.throws(() => buildR2ReviewArtifacts(detachedDeployment, { sourceEvidenceRoot: EXTERNAL_EVIDENCE_ROOT }), /deployment binding/);
  const falseStandaloneAxe = mutateJsonEntry(fixtureEntries, "06-accessibility/axe-and-manual-contrast.json", (document) => { document.engines[1].cases[0].violations.push({ id: "aria-allowed-attr" }); });
  assert.throws(() => buildR2ReviewArtifacts(falseStandaloneAxe, { sourceEvidenceRoot: EXTERNAL_EVIDENCE_ROOT }), /contains violations/);
  const falsePhase4 = mutateJsonEntry(fixtureEntries, "08-governance/phase4-hashes.json", (document) => { document.assets[0].sha256 = "0".repeat(64); });
  assert.throws(() => buildR2ReviewArtifacts(falsePhase4, { sourceEvidenceRoot: EXTERNAL_EVIDENCE_ROOT }), /authoritative hashes differ/);
  const staleR1Command = mutateJsonEntry(fixtureEntries, "07-regression/retained-suite.json", (document) => { document.command = "npm run check:phase7a-r1"; });
  assert.throws(() => buildR2ReviewArtifacts(staleR1Command, { sourceEvidenceRoot: EXTERNAL_EVIDENCE_ROOT }), /test receipt differs/);
  const omittedLimitation = mutateJsonEntry(fixtureEntries, "08-governance/environmental-limitations.json", (document) => { document.limitations = []; });
  assert.throws(() => buildR2ReviewArtifacts(omittedLimitation, { sourceEvidenceRoot: EXTERNAL_EVIDENCE_ROOT }), /environmental limitations differ/);
});

test("independent R2 audit validates ZIP CRC, manifest bindings, semantics and full PNG/MP4 decode", async () => {
  const structural = auditR2PackageBytes({ archiveBytes: artifacts.archiveBytes });
  assert.equal(structural.schema, R2_AUDIT_SCHEMA);
  assert.equal(structural.status, "PASS");
  assert.equal(structural.archive.filename, PHASE7A_R2_REVIEW_ZIP_NAME);
  assert.equal(structural.archive.entryCount, 31);
  assert.equal(structural.payloads.length, 30);
  assert.equal(structural.crc32.status, "PASS");
  assert.equal(structural.crc32.entryCount, 31);
  assert.ok(structural.payloads.every(({ byteStatus, sha256Status, crc32Status }) => byteStatus === "PASS" && sha256Status === "PASS" && crc32Status === "PASS"));
  assert.deepEqual(Object.values(structural.security), Array(Object.keys(structural.security).length).fill("PASS"));
  assert.deepEqual(Object.values(structural.checks), Array(Object.keys(structural.checks).length).fill("PASS"));
  const complete = await auditR2ReviewBytes({
    archiveBytes: artifacts.archiveBytes,
    recordingDecoder: async ({ relativePath, bytes }) => relativePath.startsWith("03-focus/") && bytes.equals(fixtureMp4()),
  });
  assert.equal(complete.imageDecodeStatus, "PASS");
  assert.equal(complete.recordingDecodeStatus, "PASS");
  assert.equal(complete.mediaDecode.images.count, 11);
  assert.equal(complete.mediaDecode.recordings.count, 3);
  assert.ok(complete.mediaDecode.images.files.every(({ status, width, height }) => status === "PASS" && width === 4 && height === 3));
  assert.equal(complete.checks.pngFullDecode, "PASS");
  assert.equal(complete.checks.mp4FullDecode, "PASS");
});

test("independent audit rejects CRC, embedded-manifest and cryptographically rebuilt semantic tampering", () => {
  const crcTampered = Buffer.from(artifacts.archiveBytes);
  const nameLength = crcTampered.readUInt16LE(26);
  crcTampered[30 + nameLength] ^= 0x01;
  assert.throws(() => auditR2PackageBytes({ archiveBytes: crcTampered }), /CRC rejection|deterministic stored encoding/i);

  const parsed = parseStoredZip(artifacts.archiveBytes).entries;
  const manifest = JSON.parse(parsed.get(IN_ARCHIVE_MANIFEST).data.toString("utf8"));
  manifest.payloads[0].bytes += 1;
  const manifestTampered = rebuildWith(new Map([[IN_ARCHIVE_MANIFEST, Buffer.from(stableJson(manifest))]]));
  assert.throws(() => auditR2PackageBytes({ archiveBytes: manifestTampered }), /manifest differs/);

  const authority = JSON.parse(parsed.get("00-authority/r2-field-map-authority.json").data.toString("utf8"));
  authority.focus.focus.postCloseOutsideFocus = "a";
  const authorityBytes = json(authority);
  const reboundManifest = JSON.parse(parsed.get(IN_ARCHIVE_MANIFEST).data.toString("utf8"));
  const row = reboundManifest.payloads.find(({ path: relativePath }) => relativePath === "00-authority/r2-field-map-authority.json");
  row.bytes = authorityBytes.length;
  row.sha256 = sha256(authorityBytes);
  // CRC is independently reconstructed by the auditor, so a forged manifest cannot preserve a false semantic PASS.
  const semanticTampered = rebuildWith(new Map([
    ["00-authority/r2-field-map-authority.json", authorityBytes],
    [IN_ARCHIVE_MANIFEST, Buffer.from(stableJson(reboundManifest))],
  ]));
  assert.throws(() => auditR2PackageBytes({ archiveBytes: semanticTampered }), /remains active after close|manifest differs/);
});

test("filesystem APIs create and audit one external package atomically and refuse overwrite", async () => {
  const packaged = await packageR2ReviewDirectory({ evidenceDir, outputDir, boundaryOptions });
  assert.equal(packaged.status, "PASS");
  assert.equal(packaged.zipPath, path.join(outputDir, PHASE7A_R2_REVIEW_ZIP_NAME));
  assert.equal(packaged.entryCount, 31);
  assert.equal(packaged.payloadCount, 30);
  assert.equal(packaged.bytes, artifacts.archiveBytes.length);
  assert.equal(packaged.sha256, sha256(artifacts.archiveBytes));
  assert.equal(packaged.manifestSha256, sha256(artifacts.manifestBytes));
  assert.equal(packaged.payloadBytes, artifacts.payloads.reduce((sum, payload) => sum + payload.bytes, 0));
  assert.deepEqual(await readFile(packaged.zipPath), artifacts.archiveBytes);
  await assert.rejects(() => packageR2ReviewDirectory({ evidenceDir, outputDir, boundaryOptions }), /refusing to overwrite/);

  const reportPath = path.join(outputDir, "phase-7a-r2-field-map-focus-human-review-audit.json");
  const audited = await auditR2ReviewFile({
    zipPath: packaged.zipPath,
    reportPath,
    boundaryOptions,
    recordingDecoder: async ({ relativePath, bytes }) => relativePath.startsWith("03-focus/") && bytes.equals(fixtureMp4()),
  });
  assert.equal(audited.status, "PASS");
  assert.equal(audited.zipPath, packaged.zipPath);
  assert.equal(audited.reportPath, reportPath);
  assert.equal(audited.crc32.status, "PASS");
  assert.equal(audited.crc32.entryCount, 31);
  assert.equal(audited.payloads.length, 30);
  assert.equal(audited.mediaDecode.images.count, 11);
  assert.equal(audited.mediaDecode.recordings.count, 3);
  assert.deepEqual(JSON.parse(await readFile(reportPath, "utf8")), audited);
  await assert.rejects(() => auditR2ReviewFile({ zipPath: packaged.zipPath, reportPath, boundaryOptions, recordingDecoder: async () => true }), /refusing to overwrite/);

  const unexpected = path.join(evidenceDir, "unexpected.txt");
  await writeFile(unexpected, "not part of the contract", { flag: "wx" });
  await assert.rejects(() => packageR2ReviewDirectory({ evidenceDir, outputDir: path.join(filesystemRoot, "second-output"), boundaryOptions }), /topology differs/);
  await rm(unexpected);
});

test("raw governed Phase 4 bytes are rejected and the R2 auditor remains independent of its packager", async () => {
  const governedPoster = await readFile(path.join(ROOT, "public/media/cinematic/phase-4r2/posters/phase-4r2-desktop-poster-8dc538810811.png"));
  const rawPhase4 = cloneEntries(fixtureEntries).map((entry) => entry.relativePath === "04-field-map/closed.png" ? { ...entry, data: governedPoster } : entry);
  assert.throws(() => buildR2ReviewArtifacts(rawPhase4, { sourceEvidenceRoot: EXTERNAL_EVIDENCE_ROOT }), /raw\/governed Phase 4/);
  const auditSource = await readFile(path.join(ROOT, "scripts/audit-phase7a-r2-package.mjs"), "utf8");
  assert.doesNotMatch(auditSource, /from ["']\.\/package-phase7a-r2-human-review\.mjs["']/);
});
