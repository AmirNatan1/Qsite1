import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contractRelative = "artifacts/original/phase-0-3d-repair-v2/portal-layout.json";
const acceptedContractSha256 = "25666cf071afe7564dc051cbec770ead325cdf19ef1f4926e43d793a2a053bc5";
const keepoutRelative = "artifacts/original/phase-0-3d-repair-v3/manifests/scene-source-keepouts.json";
const acceptedKeepoutSha256 = "3ac16456b5a4a9e5a57755206f135684eca12fcfb7b1aafe30fb3cf86e862b8a";
const harnessRoot = "prototypes/phase-0-portal-layout-qa";
const planRelative = `${harnessRoot}/capture-plan-v3.json`;
const evidenceIndexRelative = "artifacts/evidence/phase-0-3d-repair-v3/README.md";
const evidenceRelative = "artifacts/evidence/phase-0-3d-repair-v3/TYPOGRAPHY_COLLISION_QA.md";
const matrixRelative = "artifacts/evidence/phase-0-3d-repair-v3/browser-matrix-report.json";
const browserControlRecoveryRelative = "artifacts/evidence/phase-0-3d-repair-v3/recovery/browser-control-checkpoint-03d20589d64d95d8.recovery-report.json";
const staleNativeRecoveryRelative = "artifacts/evidence/phase-0-3d-repair-v3/recovery/stale-harness-checkpoint-535009fc4c465854.recovery-report.json";
const captureRunnerRelative = "scripts/capture-phase03-browser-matrix.mjs";
const normalizerRelative = "scripts/normalize-phase03-captures.py";
const prototypeServerRelative = "scripts/serve-prototype.mjs";
const requiredFiles = [
  contractRelative,
  keepoutRelative,
  `${harnessRoot}/index.html`,
  `${harnessRoot}/styles.css`,
  `${harnessRoot}/app.js`,
  `${harnessRoot}/runner.html`,
  `${harnessRoot}/runner.css`,
  `${harnessRoot}/runner.js`,
  planRelative,
  "docs/planning/TYPOGRAPHY_AND_LAYOUT_CONTRACT.md",
  evidenceIndexRelative,
  evidenceRelative,
  browserControlRecoveryRelative,
  staleNativeRecoveryRelative,
  captureRunnerRelative,
  normalizerRelative,
  prototypeServerRelative,
];
const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

function absolute(relative) {
  return path.join(root, ...String(relative).replaceAll("\\", "/").split("/"));
}

async function exists(relative) {
  try {
    return (await stat(absolute(relative))).isFile();
  } catch {
    return false;
  }
}

async function text(relative) {
  try {
    return await readFile(absolute(relative), "utf8");
  } catch (error) {
    errors.push(`unable to read ${relative}: ${error.message}`);
    return "";
  }
}

async function json(relative) {
  const source = await text(relative);
  try {
    return JSON.parse(source);
  } catch (error) {
    errors.push(`${relative} is invalid JSON: ${error.message}`);
    return null;
  }
}

function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}

function parseQuery(source) {
  return Object.fromEntries(new URLSearchParams(source));
}

function expandCases(plan) {
  const viewports = new Map((plan?.viewports ?? []).map((viewport) => [viewport.id, viewport]));
  const cases = [];
  for (const template of plan?.caseTemplates ?? []) {
    const ids = template.viewportIds === "all" ? [...viewports.keys()] : template.viewportIds ?? [];
    const captures = new Set(template.captureViewportIds === "all" ? ids : template.captureViewportIds ?? []);
    for (const viewportId of ids) {
      cases.push({
        id: `${template.idPrefix}--${viewportId}`,
        idPrefix: template.idPrefix,
        viewportId,
        viewport: viewports.get(viewportId),
        query: template.query,
        focusSelector: template.focusSelector ?? null,
        captureRequired: captures.has(viewportId),
      });
    }
  }
  return cases;
}

for (const relative of requiredFiles) check(await exists(relative), `required Phase 0.3 file is missing: ${relative}`);

const contractSource = await text(contractRelative);
const contract = (() => {
  try {
    return JSON.parse(contractSource);
  } catch (error) {
    errors.push(`${contractRelative} is invalid JSON: ${error.message}`);
    return null;
  }
})();
const contractHash = sha256(contractSource);
check(contractHash === acceptedContractSha256, "Phase 0.3 changed the accepted portal-layout JSON authority");
if (contract) {
  check(contract.schema === "quantum-hub.phase-0-3d-repair-v2.portal-layout.v1", "portal-layout schema changed unexpectedly");
  check(contract.copy?.heading === "WHERE DO YOU ENTER?", "portal H1 changed unexpectedly");
  check(contract.acceptance?.maximumAnchorDeltaPx === 3, "portal anchor tolerance changed unexpectedly");
  check(contract.acceptance?.glyphRuleClearancePx === 12, "portal glyph/rule clearance changed unexpectedly");
  check(Array.isArray(contract.copy?.route) && contract.copy.route.join("|") === "Frame|Source|Assess|Test|Decide", "portal route changed unexpectedly");
  check(Array.isArray(contract.copy?.audiences) && contract.copy.audiences.join("|") === "For industry|For startups", "portal audience paths changed unexpectedly");
}

const keepoutSource = await text(keepoutRelative);
const keepoutAuthority = (() => {
  try {
    return JSON.parse(keepoutSource);
  } catch (error) {
    errors.push(`${keepoutRelative} is invalid JSON: ${error.message}`);
    return null;
  }
})();
const keepoutHash = sha256(keepoutSource);
check(keepoutHash === acceptedKeepoutSha256, "Phase 0.3 scene keepout authority changed after creative freeze");
if (keepoutAuthority) {
  check(keepoutAuthority.schema === "quantum-hub.phase-0-3d-repair-v3.scene-source-keepouts.v1", "unexpected v3 scene-keepout schema");
  const records = new Map((keepoutAuthority.records ?? []).map((record) => [record.id, record]));
  check(records.size === 4, "v3 scene-keepout authority must contain four frozen source records");
  const expectedSegmentCounts = new Map([
    ["desktop-dormant", 33],
    ["mobile-dormant", 34],
    ["reduced-desktop", 33],
    ["reduced-mobile", 34],
  ]);
  for (const [id, expectedSegmentCount] of expectedSegmentCounts) {
    const record = records.get(id);
    check(Boolean(record), `v3 scene-keepout authority lacks ${id}`);
    check((record?.cable?.segment_rectangles ?? []).length === expectedSegmentCount, `v3 scene-keepout authority has the wrong cable-segment count for ${id}`);
    check(Number(record?.station?.bbox?.w) > 0 && Number(record?.station?.bbox?.h) > 0, `v3 Station bounds are invalid for ${id}`);
    if (id.includes("mobile")) {
      const visibility = record?.cable?.visibility_evidence;
      check(record?.cable?.authored_turns === 2.25, `v3 mobile cable is not authored at 2.25 turns for ${id}`);
      check(visibility?.pass === true && Number(visibility?.visible_turns_approx) >= 2.15, `v3 mobile visible-turn gate failed for ${id}`);
    }
  }
}

const html = await text(`${harnessRoot}/index.html`);
const css = await text(`${harnessRoot}/styles.css`);
const app = await text(`${harnessRoot}/app.js`);
const runnerHtml = await text(`${harnessRoot}/runner.html`);
const runnerCss = await text(`${harnessRoot}/runner.css`);
const runnerApp = await text(`${harnessRoot}/runner.js`);
const docs = await text("docs/planning/TYPOGRAPHY_AND_LAYOUT_CONTRACT.md");
const evidence = await text(evidenceRelative);
const captureRunner = await text(captureRunnerRelative);
const normalizer = await text(normalizerRelative);
const prototypeServer = await text(prototypeServerRelative);
const harnessSource = `${html}\n${css}\n${app}\n${runnerHtml}\n${runnerCss}\n${runnerApp}`;
const source = `${harnessSource}\n${docs}\n${evidence}`;
const harnessAuthorityRecords = [
  [`${harnessRoot}/index.html`, html],
  [`${harnessRoot}/styles.css`, css],
  [`${harnessRoot}/app.js`, app],
  [`${harnessRoot}/runner.html`, runnerHtml],
  [`${harnessRoot}/runner.css`, runnerCss],
  [`${harnessRoot}/runner.js`, runnerApp],
].map(([filePath, fileSource]) => ({
  path: filePath,
  bytes: Buffer.byteLength(fileSource),
  sha256: sha256(fileSource),
}));
const harnessCacheTokens = new Set([...harnessSource.matchAll(/phase03-layout-v\d+/g)].map((match) => match[0]));
const harnessCacheToken = harnessCacheTokens.size === 1 ? [...harnessCacheTokens][0] : null;
const harnessAuthorityHash = sha256(
  harnessAuthorityRecords.map((file) => `${file.path}\0${file.bytes}\0${file.sha256}`).join("\n"),
);

check(/Phase 0\.3/.test(html) && /phase03-layout-v(?:[1-9]\d*)/.test(html), "harness is not cache-bumped and labelled for Phase 0.3");
check(harnessCacheToken !== null, "harness files do not share one cache authority token");
check(/quantum-hub\.phase-0-3d-repair-v3\.typography-collision-browser-report\.v1/.test(app), "harness does not emit the Phase 0.3 browser-report schema");
check(/quantum-hub\.phase-0-3d-repair-v3\.exact-viewport-runner-report\.v1/.test(runnerApp), "runner does not emit the Phase 0.3 schema");
check(/window\.phase03Ready/.test(app) && /window\.runPhase03TypographyCheck/.test(app), "harness omits the Phase 0.3 QA API");
check(/KEEP_OUT_URL/.test(app) && /scene-source-keepouts\.json/.test(app), "harness does not load the frozen v3 keepout authority");
check(/sourceRecord\.cable\.segment_rectangles/.test(app) && /cableSegments\.length === sourceRecord\.cable\.segment_rectangles\.length/.test(app), "harness does not collision-test every authored cable segment");
check(/Aperture Station/.test(app) && !/source-derived Field Unit\/cable keepouts/.test(app), "v3-facing scene-safety report does not name the Aperture Station consistently");
check(/window\.phase03RunnerReady/.test(runnerApp) && /window\.phase03RunnerReport/.test(runnerApp), "runner omits the Phase 0.3 API");
check(/id="phase03-report"/.test(html) && /id="phase03-runner-report"/.test(runnerHtml), "Phase 0.3 reports are not exposed as DOM JSON");
check(/previous\?\.isConnected/.test(app) && /document\.activeElement\.blur\(\)/.test(app), "focus measurement does not restore or neutralize the audited control");
check(/const focusState =/.test(runnerApp) && /focusedReviewControl === null/.test(runnerApp) && /runnerReport\.focusState\.pass/.test(runnerApp), "runner does not distinguish neutral captures from explicitly requested focus");

check(
  /\.review-surface\s+:is\(h1,\s*h2\)[\s\S]*?overflow-wrap:\s*normal\s*!important;[\s\S]*?word-break:\s*normal\s*!important;[\s\S]*?hyphens:\s*none\s*!important;/.test(css),
  "H1/H2 whole-word CSS authority is incomplete",
);
check(!/\.heading-line\s*\{[^}]*overflow-wrap:\s*anywhere/is.test(css), "heading line still permits arbitrary word fragmentation");
check(/function wordIntegrityReport\(\)/.test(app), "harness lacks the word-integrity report");
check(/wordFragmentationOffenders:\s*wordFragmentationDetails\.length/.test(app), "harness lacks the numeric word-fragmentation count");
check(/humanLineBreakReport/.test(app) && /renderedLines/.test(app), "harness lacks the human line-break report");
check(/style\.wordBreak/.test(app) && /style\.overflowWrap/.test(app) && /style\.hyphens/.test(app), "harness does not verify computed whole-word styles");
check(/report\.layout\.wordIntegrityPass/.test(app), "whole-word integrity is not part of the top-level browser pass");

check(/directional-scrim-quiet-field/.test(app) && /directional-scrim-quiet-field/.test(css), "reduced-motion quiet-composition strategy is missing");
check(/function reducedMotionCompositionReport\(\)/.test(app), "harness lacks the reduced-motion composition report");
check(/floatingRoundedPanelOffenders/.test(app), "harness does not detect large rounded reduced-motion panels");
check(/body\[data-reduced="true"\][^{]*\s+\.scene-grade\s*\{[\s\S]*?linear-gradient/.test(css), "reduced-motion state lacks a directional full-frame scrim");
check(
  /body\[data-reduced="true"\]\s+:is\([^}]+\)\s*\{[^}]*border-radius:\s*0;[^}]*box-shadow:\s*none;[^}]*backdrop-filter:\s*none;/s.test(css),
  "reduced-motion semantic containers are not explicitly free of floating-glass treatment",
);
check(/report\.layout\.reducedMotionComposition\.pass/.test(app), "reduced-motion composition is not part of the top-level browser pass");
check(
  /const allowedPortalScene = state\.reduced\s*\? authoredMobileSceneMode\(\)\s*\? SCENES\.reducedMobile\s*:\s*SCENES\.reducedDesktop\s*:\s*SCENES\.portalResponsive;/s.test(app),
  "portal no-duplicate-copy authority does not bind the exact reduced desktop/mobile still selected for the viewport",
);

check(/min-height:\s*44px/.test(css), "44px control target floor is missing");
check(
  /@media\s*\(orientation:\s*landscape\)\s*and\s*\(min-width:\s*600px\)\s*and\s*\(max-height:\s*700px\)[\s\S]*?body\[data-text-zoom="200"\]\[data-portal-projection="responsive"\] \.portal-contract-layer\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)[^}]*grid-template-areas:\s*none/s.test(css) &&
    /body\[data-text-zoom="200"\]\[data-portal-projection="responsive"\] \.portal-heading\s*\{[^}]*font-size:\s*calc\(clamp\(3\.2rem,\s*5vw,\s*4\.1rem\)\s*\*\s*var\(--text-zoom\)\)/s.test(css),
  "short-wide 200% portal state lacks its content-driven whole-word reflow",
);
check(
  /@media\s*\(orientation:\s*landscape\)\s*and\s*\(min-width:\s*600px\)\s*and\s*\(max-height:\s*700px\)[\s\S]*?body\[data-surface="portal"\]\[data-fixture="long"\]\[data-text-zoom="100"\]\[data-portal-projection="responsive"\][\s\S]*?\.portal-audience button\s*\{[^}]*min-width:\s*0;[^}]*padding-inline:\s*0;/s.test(css),
  "short-wide long-copy portal state does not expose the full audience-control content width",
);
check(/dividerGeometryReport/.test(app) && /thicknessPx\s*<=\s*1\.5/.test(app), "responsive divider gate is missing");
check(/collisionReport/.test(app) && /textOverflowReport/.test(app), "collision or overflow instrumentation is missing");
check(/outline:\s*3px solid/.test(css), "visible focus styling is missing");
check(/prefers-reduced-motion:\s*reduce/.test(css), "reduced-motion media query is missing");
check(!/overflow-x\s*:\s*(?:auto|scroll|clip)/i.test(css), "harness masks overflow or creates a nested horizontal scroller");
check(!/\.(?:hero|portal)-(?:compositor|copy|heading|supporting|audience)[^{]*\{[^}]*overflow\s*:\s*hidden/is.test(css), "text-bearing compositor masks overflow");
check(!/<video\b|<canvas\b/i.test(html) && !/createElement\(["'](?:video|canvas)["']\)/i.test(app), "harness instantiates cinematic media");
check(!/@font-face|https?:\/\/(?:fonts\.|use\.typekit)/i.test(harnessSource), "harness introduces a bundled or remote font dependency");
check(!/font-family\s*:[^;}]*(?:Syne|Newsreader|Inter)/i.test(css), "harness falsely delivers preferred fonts instead of fallbacks");
check(!/\bdefen[cs]e\b|\bdual[\s_-]?use\b/i.test(source), "prohibited public taxonomy leaked into Phase 0.3 evidence");
check(!/(?:[a-z]:[\\/](?:users|documents and settings)[\\/]|\/users\/|\/home\/|onedrive[\\/]|\.codex[\\/])/i.test(source), "private absolute path leaked into Phase 0.3 evidence");
check(/capture-plan-v3\.json/.test(normalizer) && /phase-0-3d-repair-v3\/browser-matrix-report\.json/.test(normalizer), "Phase 0.3 normalizer is not bound to v3 evidence");
check(/sceneFreeze\.status is frozen/.test(normalizer), "Phase 0.3 normalizer lacks its scene-freeze write lock");
check(/MAX_BATCH_SIZE\s*=\s*10/.test(captureRunner) && /batchSize\s*>\s*MAX_BATCH_SIZE/.test(captureRunner), "repository-native capture runner lacks the 10-case batch ceiling");
check(/SCREENSHOTS_PER_VISUAL_CASE\s*=\s*11/.test(captureRunner) && /MINIMUM_MODAL_VOTES\s*=\s*7/.test(captureRunner), "repository-native capture runner weakens the 11-shot, 7-vote modal gate");
check(/browser-control-checkpoint/.test(captureRunner) && /recovery\/raw/.test(captureRunner) && /byteIdentical:\s*true/.test(captureRunner) && /preserved-untrusted-browser-control-output/.test(captureRunner), "capture runner does not byte-preserve the recovered browser-control checkpoint and JPEGs before migration");
check(/stale-repository-native-harness-authority/.test(captureRunner) && /preserved-stale-repository-native-output/.test(captureRunner), "capture runner does not classify stale repository-native raw evidence separately from browser-control output");
check(/runnerReportDomSelector/.test(captureRunner) && /textContent\(\)/.test(captureRunner), "capture runner does not consume the serialized runner DOM report");
check(/dirname\(process\.execPath\)/.test(captureRunner) && /chromium\.executablePath/.test(captureRunner), "capture runner omits bundled-runtime Playwright or managed-Chromium resolution");
check(/portal-zoom-200--short-desktop-1366x650/.test(captureRunner) && /headingScrollWidthWithinClient/.test(captureRunner), "capture runner lacks the repaired 1366x650/200% portal assertion");
check(/LONG_COPY_SHORT_REPAIR_CASE/.test(captureRunner) && /startupChoiceScrollWidthWithinClient/.test(captureRunner) && /targetsRemainAtLeast44/.test(captureRunner), "capture runner lacks the repaired 1366x650 long-copy portal assertion");
check(/targeted-diagnostic/.test(captureRunner) && /TARGETED_STRESS_CASES/.test(captureRunner), "capture runner lacks isolated forced targeted evidence");
check(/--case/.test(captureRunner) && /validateCompletion/.test(captureRunner) && /validateAllAuthorityCases/.test(captureRunner), "capture runner lacks explicit selection, hash-validated resume, or 46-case finalization");
check(/HARNESS_RELATIVES/.test(captureRunner) && /validateHarnessAuthority/.test(captureRunner) && /sameHarness/.test(captureRunner), "capture resume is not bound to the pixel/report-producing harness authority");
check(/preserveRecoveredReports/.test(captureRunner) && /preserveAndRetireMatrix/.test(captureRunner) && /preserved-stale-harness-report/.test(captureRunner), "stale harness evidence is not preserved before checkpoint invalidation");

const browserControlRecovery = await json(browserControlRecoveryRelative);
if (browserControlRecovery) {
  check(browserControlRecovery.reason === "browser-control checkpoint preserved before repository-native Playwright authority migration", "browser-control recovery reason changed unexpectedly");
  check(browserControlRecovery.recoveredRawFiles?.length === 19, "browser-control recovery must account for 19 preserved raw JPEGs");
  check(
    browserControlRecovery.recoveredRawFiles?.every(
      (record) =>
        record.authority === "preserved-untrusted-browser-control-output" &&
        record.preservedCopy?.byteIdentical === true &&
        record.source?.bytes === record.preservedCopy?.bytes &&
        record.source?.sha256 === record.preservedCopy?.sha256,
    ),
    "browser-control recovery raw classifications or byte-identical lineage are invalid",
  );
  check(/browser-control JPEG/.test(browserControlRecovery.recoveredRawPolicy ?? ""), "browser-control recovery policy is misclassified");
}

const staleNativeRecovery = await json(staleNativeRecoveryRelative);
if (staleNativeRecovery) {
  check(staleNativeRecovery.migrationKind === "stale-repository-native-harness-authority", "stale-native recovery migration kind is missing or incorrect");
  check(staleNativeRecovery.reason === "repository-native checkpoint preserved because the pixel/report-producing harness authority changed", "stale-native recovery reason changed unexpectedly");
  check(staleNativeRecovery.recoveredRawFiles?.length === 36, "stale-native recovery must account for 36 preserved raw JPEGs");
  check(
    staleNativeRecovery.recoveredRawFiles?.every(
      (record) =>
        record.authority === "preserved-stale-repository-native-output" &&
        record.preservedCopy?.byteIdentical === true &&
        record.source?.bytes === record.preservedCopy?.bytes &&
        record.source?.sha256 === record.preservedCopy?.sha256,
    ),
    "stale-native recovery raw classifications or byte-identical lineage are invalid",
  );
  check(
    staleNativeRecovery.recoveredCaseReports?.length === 46 &&
      staleNativeRecovery.recoveredCaseReports.every((record) => record.authority === "preserved-stale-harness-report"),
    "stale-native recovery report classifications are invalid",
  );
  check(staleNativeRecovery.recoveredMatrix?.preservedCopy?.byteIdentical === true, "stale-native recovery matrix is not byte-identical");
  check(/stale repository-native JPEG/.test(staleNativeRecovery.recoveredRawPolicy ?? "") && /harness authority change/.test(staleNativeRecovery.recoveredRawPolicy ?? ""), "stale-native recovery policy is misclassified");
}
const targetedBlock = captureRunner.match(/const TARGETED_STRESS_CASES = Object\.freeze\(\[([\s\S]*?)\]\);/);
const targetedObserved = [...(targetedBlock?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((match) => match[1]);
const targetedExpected = [
  "portal-actual--short-desktop-1366x650",
  "portal-zoom-200--short-desktop-1366x650",
  "hero-zoom-200--short-desktop-1366x650",
  "portal-zoom-200--narrow-320x800",
  "portal-zoom-200--mobile-390x844",
  "portal-zoom-200--mobile-landscape-844x390",
];
check(JSON.stringify(targetedObserved) === JSON.stringify(targetedExpected), "capture runner does not bind the exact six targeted stress cases");
check(/artifacts["'],\s*["']original["'],\s*["']phase-0-3d-repair-v3/.test(prototypeServer), "prototype server does not expose the frozen v3 package");

const plan = await json(planRelative);
const requiredViewports = new Map([
  ["desktop-1440x900", [1440, 900]],
  ["short-desktop-1366x650", [1366, 650]],
  ["desktop-1280x800", [1280, 800]],
  ["tablet-landscape-1024x768", [1024, 768]],
  ["tablet-portrait-768x1024", [768, 1024]],
  ["mobile-390x844", [390, 844]],
  ["mobile-360x800", [360, 800]],
  ["narrow-320x800", [320, 800]],
  ["mobile-landscape-844x390", [844, 390]],
]);
const expanded = expandCases(plan);
if (plan) {
  check(plan.schema === "quantum-hub.phase-0-3d-repair-v3.typography-capture-plan.v1", "unexpected Phase 0.3 capture-plan schema");
  check(plan.contractPath === contractRelative, "Phase 0.3 plan does not preserve the accepted portal-layout source");
  check(plan.browserApi?.expectedSchema === "quantum-hub.phase-0-3d-repair-v3.typography-collision-browser-report.v1", "plan expects the wrong browser schema");
  check(plan.browserApi?.expectedRunnerSchema === "quantum-hub.phase-0-3d-repair-v3.exact-viewport-runner-report.v1", "plan expects the wrong runner schema");
  check(plan.capture?.stabilization?.method === "exact-byte-modal-winner", "plan omits exact-byte modal stabilization");
  check(plan.capture?.stabilization?.successiveFullPageJpegsPerVisualCase === 11, "plan must take 11 successive JPEGs per visual case");
  check(plan.capture?.stabilization?.minimumWinnerVotes === 7, "plan accepts a modal winner below 7/11");
  check(/none;/.test(plan.capture?.stabilization?.timingClaim ?? ""), "plan makes a timing-only raster-stability claim");
  const observed = new Map((plan.viewports ?? []).map((viewport) => [viewport.id, [viewport.width, viewport.height]]));
  check(observed.size === requiredViewports.size, "Phase 0.3 plan includes an unexpected viewport");
  for (const [id, dimensions] of requiredViewports) {
    check(JSON.stringify(observed.get(id)) === JSON.stringify(dimensions), `Phase 0.3 plan omits or changes ${id}`);
    const viewport = (plan.viewports ?? []).find((entry) => entry.id === id);
    const expectedScale = Math.min(1, 1200 / dimensions[0]);
    check(Math.abs(Number(viewport?.captureScale) - expectedScale) <= 0.000001, `Phase 0.3 plan uses the wrong capture scale for ${id}`);
  }
  check(expanded.length === 46, `Phase 0.3 plan must expand to 46 cases, observed ${expanded.length}`);
  for (const surface of ["hero", "portal"]) {
    for (const viewportId of requiredViewports.keys()) {
      check(
        expanded.some((entry) => {
          const query = parseQuery(entry.query);
          return entry.viewportId === viewportId && query.surface === surface && query.fixture === "actual" && query.zoom === "100";
        }),
        `Phase 0.3 plan lacks ${surface} actual at ${viewportId}`,
      );
    }
  }
  for (const prefix of ["hero-zoom-200", "portal-zoom-200", "hero-long-copy", "portal-long-copy", "hero-reduced-motion", "portal-reduced-motion", "hero-keyboard-focus", "portal-keyboard-focus"]) {
    check(expanded.some((entry) => entry.idPrefix === prefix), `Phase 0.3 plan lacks ${prefix}`);
  }
  const assertions = (plan.requiredAssertions ?? []).join("\n");
  check(/wordFragmentationOffenders is exactly 0/.test(assertions), "plan omits the zero-fragmentation assertion");
  check(/humanLineBreakReport/.test(assertions), "plan omits human line-break review");
  check(/44 by 44/.test(assertions), "plan omits the 44px target assertion");
  check(/directional full-frame scrim/.test(assertions) && /rounded panel offenders/.test(assertions), "plan omits reduced-motion composition assertions");
  check(/reduced-motion hero desktop and authored-mobile evidence keeps the frozen v3 Aperture Station opposite the copy/.test(assertions), "plan omits the reduced-motion hero Station/cable visibility boundary");
  check(/independently authored 2\.25-turn cable/.test(assertions) && /2\.171694 turns/.test(assertions), "plan omits the released mobile cable-turn gate");
}

const freezeStatus = plan?.sceneFreeze?.status;
const matrixStatus = plan?.sceneFreeze?.matrixStatus;
const matrixExists = await exists(matrixRelative);
const freezePending = freezeStatus === "pending-creative-v3-freeze" && matrixStatus === "pending-scene-freeze";
const freezeComplete = freezeStatus === "frozen";
check(freezePending || freezeComplete, "Phase 0.3 scene-freeze state is invalid");
if (freezePending) {
  check(!matrixExists, "Phase 0.3 matrix exists before the v3 scene sources are frozen");
  check(!Array.isArray(plan?.sceneFreeze?.sources), "pending scene-freeze state must not invent source hashes");
  check(/final browser capture is intentionally held/i.test(evidence), "evidence doc does not disclose the scene-freeze capture hold");
}
if (freezeComplete) {
  check(plan.sceneFreeze?.keepoutAuthority?.path === keepoutRelative, "plan does not bind the frozen v3 keepout authority path");
  check(plan.sceneFreeze?.keepoutAuthority?.sha256 === keepoutHash, "plan does not bind the frozen v3 keepout authority SHA-256");
  check(plan.sceneFreeze?.keepoutAuthority?.schema === keepoutAuthority?.schema, "plan does not bind the frozen v3 keepout authority schema");
  check(plan.sceneFreeze?.mobileCableGate?.authoredTurns === 2.25, "plan does not bind the authored 2.25-turn mobile cable");
  check(plan.sceneFreeze?.mobileCableGate?.pass === true && Number(plan.sceneFreeze?.mobileCableGate?.visibleTurnsApprox) >= 2.15, "plan does not bind the passing mobile visible-turn gate");
  const sources = plan?.sceneFreeze?.sources;
  check(Array.isArray(sources) && sources.length >= 3, "frozen Phase 0.3 plan lacks its scene-source ledger");
  for (const item of sources ?? []) {
    const relative = String(item.path ?? "").replaceAll("\\", "/");
    check(relative.startsWith("artifacts/original/phase-0-3d-repair-v3/") && relative.endsWith(".png") && !relative.includes(".."), `invalid v3 scene path: ${relative}`);
    check(/^[a-f0-9]{64}$/i.test(item.sha256 ?? ""), `v3 scene lacks SHA-256: ${relative}`);
    check(Number(item.width) > 0 && Number(item.height) > 0 && Number(item.bytes) > 10_000, `v3 scene metadata is incomplete: ${relative}`);
    if (await exists(relative)) {
      const buffer = await readFile(absolute(relative));
      const metadata = await stat(absolute(relative));
      check(metadata.size === Number(item.bytes), `v3 scene byte count mismatch: ${relative}`);
      check(sha256(buffer) === String(item.sha256).toLowerCase(), `v3 scene SHA-256 mismatch: ${relative}`);
    } else {
      errors.push(`frozen v3 scene is missing: ${relative}`);
    }
  }
  check(["ready-for-capture", "complete"].includes(matrixStatus), "frozen scene plan has an invalid matrix status");
  if (matrixStatus === "complete") check(matrixExists, "Phase 0.3 plan says complete but the browser matrix is missing");
}

if (matrixExists && plan) {
  const matrix = await json(matrixRelative);
  check(matrix?.schema === "quantum-hub.phase-0-3d-repair-v3.typography-collision-matrix.v1", "unexpected Phase 0.3 browser-matrix schema");
  check(matrix?.harness?.schema === "quantum-hub.phase-0-3d-repair-v3.harness-authority.v1", "Phase 0.3 matrix omits harness authority");
  check(matrix?.harness?.cacheToken === harnessCacheToken && matrix?.harness?.sha256 === harnessAuthorityHash, "Phase 0.3 matrix was captured from a stale harness/cache authority");
  check(JSON.stringify(matrix?.harness?.files) === JSON.stringify(harnessAuthorityRecords), "Phase 0.3 matrix harness file ledger is stale");
  check(matrix?.contract?.sha256 === contractHash, "Phase 0.3 matrix used a stale portal-layout authority");
  check(matrix?.capturePolicy?.method === "exact-byte-modal-winner", "Phase 0.3 matrix omits modal capture policy");
  check(Number(matrix?.capturePolicy?.observedWinnerVotesMinimum) >= 7 && matrix?.capturePolicy?.weakCases === 0, "Phase 0.3 matrix includes a weak or tied visual capture");
  const records = Array.isArray(matrix?.cases) ? matrix.cases : [];
  check(records.length === expanded.length, `Phase 0.3 matrix has ${records.length}/${expanded.length} cases`);
  const byId = new Map(records.map((record) => [record.id, record]));
  const repairedWideZoom = byId.get("portal-zoom-200--short-desktop-1366x650");
  const repairedHeading = (repairedWideZoom?.report?.layout?.textOverflow?.blocks ?? []).find((block) => block.id === "portal-heading");
  check(repairedWideZoom?.responsiveRepair?.applicable === true && repairedWideZoom?.responsiveRepair?.pass === true, "1366x650/200% portal repair is not explicitly asserted in the matrix");
  check(Boolean(repairedHeading) && Number(repairedHeading.scrollWidthPx) <= Number(repairedHeading.clientWidthPx) + 1 && repairedHeading.pass === true, "1366x650/200% portal heading still overflows its responsive column");
  const repairedLongCopy = byId.get("portal-long-copy--short-desktop-1366x650");
  const repairedStartupChoice = (repairedLongCopy?.report?.layout?.textOverflow?.blocks ?? []).find((block) => block.id === "portal-startups");
  check(repairedLongCopy?.responsiveRepair?.applicable === true && repairedLongCopy?.responsiveRepair?.pass === true, "1366x650 long-copy portal repair is not explicitly asserted in the matrix");
  check(Boolean(repairedStartupChoice) && Number(repairedStartupChoice.scrollWidthPx) <= Number(repairedStartupChoice.clientWidthPx) + 1 && repairedStartupChoice.pass === true, "1366x650 long-copy startup path still overflows its audience control");
  for (const expected of expanded) {
    const record = byId.get(expected.id);
    if (!record) {
      errors.push(`Phase 0.3 matrix lacks ${expected.id}`);
      continue;
    }
    const report = record.report ?? {};
    const runner = record.runner ?? {};
    const query = parseQuery(expected.query);
    check(runner.schema === plan.browserApi.expectedRunnerSchema && runner.pass === true, `runner failed for ${expected.id}`);
    const expectedFocusId = expected.focusSelector?.startsWith("#") ? expected.focusSelector.slice(1) : null;
    check(
      runner.focusState?.requested === Boolean(expected.focusSelector) &&
        runner.focusState?.requestedSelector === expected.focusSelector &&
        runner.focusState?.activeReviewControlId === expectedFocusId &&
        runner.focusState?.pass === true,
      `neutral/requested focus state failed for ${expected.id}`,
    );
    check(report.schema === plan.browserApi.expectedSchema && report.pass === true, `browser report failed for ${expected.id}`);
    check(report.copy?.wordFragmentationOffenders === 0, `fragmented display word detected for ${expected.id}`);
    check(Array.isArray(report.copy?.humanLineBreakReport) && report.copy.humanLineBreakReport.length >= 1, `human line-break report missing for ${expected.id}`);
    check(report.layout?.wordIntegrity?.pass === true, `whole-word style/geometry failed for ${expected.id}`);
    check(Array.isArray(report.layout?.wordIntegrity?.wordFragmentationDetails) && report.layout.wordIntegrity.wordFragmentationDetails.length === 0, `word-fragmentation details remain for ${expected.id}`);
    check(Array.isArray(report.layout?.wordIntegrity?.cssOffenders) && report.layout.wordIntegrity.cssOffenders.length === 0, `whole-word CSS offender remains for ${expected.id}`);
    check(report.layout?.collisionPass === true && report.layout?.textOverflowPass === true, `collision or text overflow failed for ${expected.id}`);
    check(report.layout?.pageHorizontalOverflow === false && report.layout?.routeHorizontalOverflow === false, `horizontal overflow failed for ${expected.id}`);
    check(report.layout?.buttonPass === true && (report.layout?.buttons ?? []).every((button) => button.widthPx >= 44 && button.heightPx >= 44), `44px target failed for ${expected.id}`);
    check(report.layout?.ruleSafetyPass === true && report.layout?.dividerPass === true, `rule/divider gate failed for ${expected.id}`);
    check(report.accessibility?.focus?.pass === true && report.accessibility?.reducedMotionPass === true, `focus/reduced-motion semantics failed for ${expected.id}`);
    if (query.motion === "reduce") {
      check(report.layout?.reducedMotionComposition?.applicable === true && report.layout.reducedMotionComposition.pass === true, `reduced-motion composition failed for ${expected.id}`);
      check(report.layout.reducedMotionComposition.strategy === "directional-scrim-quiet-field", `wrong reduced-motion strategy for ${expected.id}`);
      check(Array.isArray(report.layout.reducedMotionComposition.floatingRoundedPanelOffenders) && report.layout.reducedMotionComposition.floatingRoundedPanelOffenders.length === 0, `floating rounded panel remains for ${expected.id}`);
      if (query.surface === "portal") {
        const expectedReducedScene = expected.viewport.width < 600
          ? "/artifacts/original/phase-0-3d-repair-v3/renders/hero/reduced-mobile-base.png"
          : "/artifacts/original/phase-0-3d-repair-v3/renders/hero/reduced-desktop-base.png";
        check(report.assets?.scene === expectedReducedScene && report.assets?.doubledCopyPass === true, `reduced portal no-copy authority failed for ${expected.id}`);
        check(report.assets?.sceneClassification === "dormant reduced-motion scene", `reduced portal scene classification failed for ${expected.id}`);
        check(report.layout?.sceneSafety?.mode === "portal-reduced-displaced" && report.layout.sceneSafety.pass === true, `reduced portal displacement/keepout contract failed for ${expected.id}`);
      }
    }
    const safety = report.layout?.sceneSafety;
    if (safety?.applicable === true) {
      check(safety.pass === true, `Aperture Station/cable keepout gate failed for ${expected.id}`);
      check(safety.keepoutAuthority?.schema === keepoutAuthority?.schema, `keepout schema mismatch for ${expected.id}`);
      check(safety.keepoutAuthority?.sha256 === keepoutHash, `keepout SHA-256 mismatch for ${expected.id}`);
      const station = (safety.keepouts ?? []).find((entry) => entry.id === "field-unit");
      const cable = (safety.keepouts ?? []).find((entry) => entry.id === "spiral-cable");
      const sourceRecord = (keepoutAuthority?.records ?? []).find((entry) => entry.id === safety.keepoutAuthority?.recordId);
      const expectedSegmentCount = sourceRecord?.cable?.segment_rectangles?.length;
      check(station?.semanticName === "Aperture Station", `Aperture Station semantic label missing for ${expected.id}`);
      check(Number(expectedSegmentCount) >= 33 && cable?.sourceSegmentCount === expectedSegmentCount && cable?.segments?.length === expectedSegmentCount, `authored cable-segment geometry missing for ${expected.id}`);
      if (String(safety.keepoutAuthority?.recordId).includes("mobile")) {
        check(cable?.authoredTurns === 2.25, `mobile authored-turn value failed for ${expected.id}`);
        check(cable?.visibilityEvidence?.pass === true && Number(cable?.visibilityEvidence?.visible_turns_approx) >= 2.15, `mobile visible-turn evidence failed for ${expected.id}`);
      }
      check((safety.blocks ?? []).every((block) => block.pass === true && block.intersectingKeepouts?.length === 0), `semantic copy intersects v3 keepouts for ${expected.id}`);
    }
    if (expected.captureRequired) {
      const normalized = record.capture?.path;
      const raw = record.capture?.raw?.path;
      check(String(normalized ?? "").startsWith("artifacts/evidence/phase-0-3d-repair-v3/captures/normalized/"), `normalized capture path is invalid for ${expected.id}`);
      check(String(raw ?? "").startsWith("artifacts/evidence/phase-0-3d-repair-v3/captures/raw/"), `raw capture path is invalid for ${expected.id}`);
      for (const [relative, expectedHash, expectedBytes] of [[normalized, record.capture?.sha256, record.capture?.bytes], [raw, record.capture?.raw?.sha256, record.capture?.raw?.bytes]]) {
        if (await exists(relative ?? "")) {
          const buffer = await readFile(absolute(relative));
          const metadata = await stat(absolute(relative));
          check(sha256(buffer) === String(expectedHash ?? "").toLowerCase(), `capture SHA-256 mismatch for ${expected.id}: ${relative}`);
          check(metadata.size === Number(expectedBytes), `capture byte count mismatch for ${expected.id}: ${relative}`);
        } else {
          errors.push(`required capture is missing for ${expected.id}: ${relative}`);
        }
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`Phase 0.3 portal/typography verification failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

if (freezePending) {
  console.log(`Verified Phase 0.3 portal/typography preflight: accepted portal authority ${contractHash}, 46 planned cases, whole-word and reduced-motion quiet-composition gates; final capture held for frozen v3 scenes.`);
} else if (!matrixExists) {
  console.log(`Verified Phase 0.3 portal/typography capture readiness: frozen v3 scene ledger and 46 planned cases; browser matrix not yet captured.`);
} else {
  console.log(`Verified Phase 0.3 portal/typography evidence: 46 browser cases, zero fragmented display words, human line-break reports, targets, collision/overflow/rule/focus and reduced-motion quiet composition.`);
}
