#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { basename, delimiter, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLAN_RELATIVE = "prototypes/phase-0-portal-layout-qa/capture-plan-v3.json";
const EVIDENCE_RELATIVE = "artifacts/evidence/phase-0-3d-repair-v3";
const CHECKPOINT_RELATIVE = `${EVIDENCE_RELATIVE}/capture-checkpoint.json`;
const MATRIX_RELATIVE = `${EVIDENCE_RELATIVE}/browser-matrix-report.json`;
const REPORTS_RELATIVE = `${EVIDENCE_RELATIVE}/reports`;
const RECOVERY_RELATIVE = `${EVIDENCE_RELATIVE}/recovery`;
const TARGETED_RELATIVE = `${EVIDENCE_RELATIVE}/targeted`;

const CHECKPOINT_SCHEMA = "quantum-hub.phase-0-3d-repair-v3.capture-checkpoint.v2";
const CASE_REPORT_SCHEMA = "quantum-hub.phase-0-3d-repair-v3.local-browser-case.v1";
const RECOVERY_REPORT_SCHEMA = "quantum-hub.phase-0-3d-repair-v3.browser-control-recovery.v1";
const MATRIX_SCHEMA = "quantum-hub.phase-0-3d-repair-v3.typography-collision-matrix.v1";
const AUTHORITY = "repository-native-playwright";
const MAX_BATCH_SIZE = 10;
const SCREENSHOTS_PER_VISUAL_CASE = 11;
const MINIMUM_MODAL_VOTES = 7;
const MAX_MODAL_ROUNDS = 3;
const RUNNER_TIMEOUT_MS = 45_000;
const SCREENSHOT_QUALITY = 95;

const RESPONSIVE_REPAIR_CASE = "portal-zoom-200--short-desktop-1366x650";
const LONG_COPY_SHORT_REPAIR_CASE = "portal-long-copy--short-desktop-1366x650";
const TARGETED_STRESS_CASES = Object.freeze([
  "portal-actual--short-desktop-1366x650",
  "portal-zoom-200--short-desktop-1366x650",
  "hero-zoom-200--short-desktop-1366x650",
  "portal-zoom-200--narrow-320x800",
  "portal-zoom-200--mobile-390x844",
  "portal-zoom-200--mobile-landscape-844x390",
]);
const HARNESS_RELATIVES = Object.freeze([
  "prototypes/phase-0-portal-layout-qa/index.html",
  "prototypes/phase-0-portal-layout-qa/styles.css",
  "prototypes/phase-0-portal-layout-qa/app.js",
  "prototypes/phase-0-portal-layout-qa/runner.html",
  "prototypes/phase-0-portal-layout-qa/runner.css",
  "prototypes/phase-0-portal-layout-qa/runner.js",
]);

const requireFromHere = createRequire(import.meta.url);

function repoPath(relativePath) {
  const normalized = String(relativePath).replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("../")) {
    throw new Error(`Unsafe repository-relative path: ${relativePath}`);
  }
  const absolute = resolve(ROOT, ...normalized.split("/"));
  const rootPrefix = `${ROOT.toLowerCase()}${sep}`;
  if (absolute.toLowerCase() !== ROOT.toLowerCase() && !absolute.toLowerCase().startsWith(rootPrefix)) {
    throw new Error(`Path escapes the repository: ${relativePath}`);
  }
  return absolute;
}

function toRepoRelative(absolutePath) {
  return relative(ROOT, absolutePath).split(sep).join("/");
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function sha256File(absolutePath) {
  return sha256Bytes(await readFile(absolutePath));
}

async function exists(absolutePath) {
  try {
    await access(absolutePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJson(absolutePath) {
  return JSON.parse(await readFile(absolutePath, "utf8"));
}

function portableJson(value) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  const privatePathPatterns = [/[A-Za-z]:[\\/]/, /(?:^|["'\s])\/Users\//, /(?:^|["'\s])\/home\//];
  for (const pattern of privatePathPatterns) {
    if (pattern.test(serialized)) {
      throw new Error("Refusing to write an evidence record containing an absolute private path");
    }
  }
  return serialized;
}

async function atomicWrite(absolutePath, contents) {
  await mkdir(dirname(absolutePath), { recursive: true });
  const temporary = `${absolutePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, contents, { flag: "wx" });
  try {
    await rename(temporary, absolutePath);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function atomicWriteJson(absolutePath, value) {
  await atomicWrite(absolutePath, portableJson(value));
}

function parseArguments(argv) {
  const options = {
    batchSize: MAX_BATCH_SIZE,
    browserExecutable: null,
    caseIds: [],
    help: false,
    list: false,
    targetedStress: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      index += 1;
      return value;
    };
    if (argument === "--batch-size") options.batchSize = Number.parseInt(next(), 10);
    else if (argument === "--browser-executable") options.browserExecutable = next();
    else if (argument === "--case") options.caseIds.push(next());
    else if (argument === "--targeted-stress") options.targetedStress = true;
    else if (argument === "--list") options.list = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > MAX_BATCH_SIZE) {
    throw new Error(`--batch-size must be an integer from 1 through ${MAX_BATCH_SIZE}`);
  }
  if (options.targetedStress && options.caseIds.length > 0) {
    throw new Error("--targeted-stress and --case are mutually exclusive");
  }
  return options;
}

function printHelp() {
  console.log(`Phase 0.3 repository-native browser matrix capture

Usage:
  node scripts/capture-phase03-browser-matrix.mjs [options]

Options:
  --batch-size N              Process at most N pending cases (1-${MAX_BATCH_SIZE}; default ${MAX_BATCH_SIZE})
  --case CASE_ID              Process one planned authority case; repeat for more cases
  --targeted-stress           Force modal diagnostic captures for the six bound stress cases
  --browser-executable PATH   Use an installed Chromium-family browser executable
  --list                      Print the expanded plan without browser or filesystem mutation
  --help                      Show this help

Environment:
  NODE_PATH                   Existing package roots used to resolve playwright/playwright-core
  PHASE03_BROWSER_EXECUTABLE  Browser executable override (CLI takes precedence)

The prototype server must already be listening at http://127.0.0.1:4173.`);
}

function expandPlan(plan) {
  const viewports = new Map(plan.viewports.map((viewport) => [viewport.id, viewport]));
  const expanded = [];
  for (const template of plan.caseTemplates) {
    const viewportIds = template.viewportIds === "all" ? [...viewports.keys()] : template.viewportIds;
    const captureIds = new Set(template.captureViewportIds === "all" ? viewportIds : template.captureViewportIds ?? []);
    for (const viewportId of viewportIds) {
      const viewport = viewports.get(viewportId);
      if (!viewport) throw new Error(`Unknown viewport ${viewportId} in ${template.idPrefix}`);
      expanded.push({
        id: `${template.idPrefix}--${viewportId}`,
        idPrefix: template.idPrefix,
        viewportId,
        viewport,
        query: template.query,
        focusSelector: template.focusSelector ?? null,
        captureRequired: captureIds.has(viewportId),
      });
    }
  }
  const ids = new Set(expanded.map((entry) => entry.id));
  if (ids.size !== expanded.length) throw new Error("The Phase 0.3 plan expands to duplicate case IDs");
  if (expanded.length !== 46) throw new Error(`The Phase 0.3 plan must expand to 46 cases, observed ${expanded.length}`);
  const captureCount = expanded.filter((entry) => entry.captureRequired).length;
  if (captureCount !== 36) throw new Error(`The Phase 0.3 plan must require 36 captures, observed ${captureCount}`);
  return expanded;
}

async function validateFrozenAuthority(plan, planBytes) {
  if (plan.schema !== "quantum-hub.phase-0-3d-repair-v3.typography-capture-plan.v1") {
    throw new Error(`Unexpected Phase 0.3 capture-plan schema: ${plan.schema}`);
  }
  const runner = new URL(plan.runnerUrl);
  if (runner.protocol !== "http:" || runner.hostname !== "127.0.0.1" || runner.port !== "4173") {
    throw new Error("Phase 0.3 capture runner must remain on http://127.0.0.1:4173");
  }
  if (plan.sceneFreeze?.status !== "frozen" || plan.sceneFreeze?.matrixStatus !== "ready-for-capture") {
    throw new Error("Phase 0.3 scene authority is not frozen and ready for capture");
  }
  if (plan.capture?.stabilization?.successiveFullPageJpegsPerVisualCase !== SCREENSHOTS_PER_VISUAL_CASE) {
    throw new Error("Phase 0.3 plan does not require 11 successive JPEGs per visual case");
  }
  if (plan.capture?.stabilization?.minimumWinnerVotes !== MINIMUM_MODAL_VOTES) {
    throw new Error("Phase 0.3 plan does not require a modal winner of at least 7/11");
  }

  const authorities = [
    {
      path: plan.contractPath,
      sha256: "25666cf071afe7564dc051cbec770ead325cdf19ef1f4926e43d793a2a053bc5",
    },
    plan.sceneFreeze.keepoutAuthority,
    ...plan.sceneFreeze.sources,
  ];
  for (const authority of authorities) {
    const absolute = repoPath(authority.path);
    const metadata = await stat(absolute);
    const digest = await sha256File(absolute);
    if (digest !== String(authority.sha256).toLowerCase()) {
      throw new Error(`Frozen authority SHA-256 mismatch: ${authority.path}`);
    }
    if (authority.bytes != null && metadata.size !== Number(authority.bytes)) {
      throw new Error(`Frozen authority byte count mismatch: ${authority.path}`);
    }
  }

  return {
    path: PLAN_RELATIVE,
    sha256: sha256Bytes(planBytes),
    bytes: planBytes.length,
  };
}

async function validateHarnessAuthority() {
  const files = [];
  const cacheTokens = new Set();
  for (const relativePath of HARNESS_RELATIVES) {
    const bytes = await readFile(repoPath(relativePath));
    const source = bytes.toString("utf8");
    for (const match of source.matchAll(/phase03-layout-v\d+/g)) cacheTokens.add(match[0]);
    files.push({
      path: relativePath,
      bytes: bytes.length,
      sha256: sha256Bytes(bytes),
    });
  }
  if (cacheTokens.size !== 1) {
    throw new Error(`Phase 0.3 harness must expose one shared cache token, observed: ${[...cacheTokens].join(", ")}`);
  }
  const cacheToken = [...cacheTokens][0];
  const aggregateSource = files.map((file) => `${file.path}\0${file.bytes}\0${file.sha256}`).join("\n");
  return {
    schema: "quantum-hub.phase-0-3d-repair-v3.harness-authority.v1",
    cacheToken,
    sha256: sha256Bytes(aggregateSource),
    files,
  };
}

async function resolvePlaywright() {
  const candidates = ["playwright", "playwright-core"];
  const executablePackageRoot = resolve(dirname(process.execPath), "..", "node_modules");
  const nodeRoots = String(process.env.NODE_PATH ?? "")
    .split(delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
  const attempts = [];

  for (const candidate of candidates) {
    attempts.push(candidate);
    try {
      const loaded = requireFromHere(candidate);
      if (loaded?.chromium) return { chromium: loaded.chromium, packageName: candidate };
    } catch {
      // Continue through the bundled-runtime-relative and NODE_PATH roots.
    }
    const executableRelativeCandidate = join(executablePackageRoot, candidate);
    attempts.push(executableRelativeCandidate);
    try {
      const loaded = requireFromHere(executableRelativeCandidate);
      if (loaded?.chromium) return { chromium: loaded.chromium, packageName: candidate };
    } catch {
      // Continue through explicitly supplied existing NODE_PATH roots.
    }
    for (const root of nodeRoots) {
      const absoluteCandidate = join(root, candidate);
      attempts.push(absoluteCandidate);
      try {
        const loaded = requireFromHere(absoluteCandidate);
        if (loaded?.chromium) return { chromium: loaded.chromium, packageName: candidate };
      } catch {
        // Try the next already-installed package location.
      }
    }
  }
  throw new Error(
    `Unable to resolve an existing Playwright package. Set NODE_PATH to a package root containing playwright or playwright-core. Tried ${attempts.length} locations.`,
  );
}

function browserCandidates() {
  const candidates = [];
  if (process.platform === "win32") {
    const programFiles = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"]].filter(Boolean);
    for (const root of programFiles) {
      candidates.push(join(root, "Google", "Chrome", "Application", "chrome.exe"));
      candidates.push(join(root, "Microsoft", "Edge", "Application", "msedge.exe"));
    }
    if (process.env.LOCALAPPDATA) {
      candidates.push(join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"));
      candidates.push(join(process.env.LOCALAPPDATA, "Microsoft", "Edge", "Application", "msedge.exe"));
    }
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    );
  } else {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/microsoft-edge",
      "/usr/bin/microsoft-edge-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
    );
  }
  return [...new Set(candidates)];
}

async function resolveBrowserExecutable(cliOverride, chromium) {
  const requested = cliOverride ?? process.env.PHASE03_BROWSER_EXECUTABLE;
  if (requested) {
    const absolute = resolve(requested);
    if (!(await exists(absolute))) throw new Error("The requested browser executable does not exist");
    return { absolute, resolution: cliOverride ? "cli-override" : "environment-override" };
  }
  let playwrightManaged = null;
  try {
    playwrightManaged = chromium.executablePath?.();
  } catch {
    // A package can expose Chromium without a managed executable; continue to system detection.
  }
  if (playwrightManaged && (await exists(playwrightManaged))) {
    return { absolute: playwrightManaged, resolution: "playwright-managed-executable" };
  }
  for (const candidate of browserCandidates()) {
    if (await exists(candidate)) return { absolute: candidate, resolution: "installed-browser-auto-detection" };
  }
  throw new Error("No installed Chrome, Edge, or Chromium executable was detected; use --browser-executable");
}

async function validateServer(plan) {
  let response;
  try {
    response = await fetch(plan.runnerUrl, { cache: "no-store", redirect: "error" });
  } catch (error) {
    throw new Error(`Phase 0.3 prototype server is not reachable at ${plan.runnerUrl}: ${error.message}`);
  }
  if (!response.ok) throw new Error(`Phase 0.3 prototype server returned HTTP ${response.status}`);
  const content = await response.text();
  if (!content.includes("phase03-runner-report")) {
    throw new Error("Phase 0.3 prototype server returned an unexpected runner document");
  }
}

function buildRunnerUrl(plan, plannedCase) {
  const url = new URL(plan.runnerUrl);
  const state = new URLSearchParams(plannedCase.query);
  for (const [key, value] of state) url.searchParams.set(key, value);
  url.searchParams.set("vw", String(plannedCase.viewport.width));
  url.searchParams.set("vh", String(plannedCase.viewport.height));
  url.searchParams.set("captureScale", String(plannedCase.viewport.captureScale));
  if (plannedCase.focusSelector) url.searchParams.set("focusSelector", plannedCase.focusSelector);
  return url.href;
}

function withoutNestedReport(runnerDomReport) {
  const runner = structuredClone(runnerDomReport);
  delete runner.report;
  return runner;
}

async function readRunnerDomReport(page, plan, plannedCase) {
  await page.waitForSelector(plan.browserApi.runnerReadySelector, { timeout: RUNNER_TIMEOUT_MS });
  const serialized = await page.locator(plan.browserApi.runnerReportDomSelector).textContent();
  if (!serialized || serialized.trim() === "{}") throw new Error(`Runner DOM report is empty for ${plannedCase.id}`);
  let runnerDomReport;
  try {
    runnerDomReport = JSON.parse(serialized);
  } catch (error) {
    throw new Error(`Runner DOM report is invalid JSON for ${plannedCase.id}: ${error.message}`);
  }
  const report = runnerDomReport[plan.browserApi.runnerChildReportProperty];
  if (runnerDomReport.schema !== plan.browserApi.expectedRunnerSchema || report?.schema !== plan.browserApi.expectedSchema) {
    throw new Error(`Runner or child schema mismatch for ${plannedCase.id}`);
  }
  const requested = runnerDomReport.requestedViewport ?? {};
  if (requested.width !== plannedCase.viewport.width || requested.height !== plannedCase.viewport.height) {
    throw new Error(`Runner requested-viewport mismatch for ${plannedCase.id}`);
  }
  if (Math.abs(Number(runnerDomReport.captureScale) - Number(plannedCase.viewport.captureScale)) > 0.000001) {
    throw new Error(`Runner capture-scale mismatch for ${plannedCase.id}`);
  }
  if (runnerDomReport.pass !== true || report.pass !== true) {
    throw new Error(`Runner DOM report failed for ${plannedCase.id}`);
  }
  return { runner: withoutNestedReport(runnerDomReport), report, serializedSha256: sha256Bytes(serialized) };
}

function evaluateResponsiveRepairAssertion(plannedCase, report) {
  const blocks = report.layout?.textOverflow?.blocks ?? [];
  if (plannedCase.id === LONG_COPY_SHORT_REPAIR_CASE) {
    const startupChoice = blocks.find((block) => block.id === "portal-startups");
    const checks = {
      exactViewport: report.viewport?.width === 1366 && report.viewport?.height === 650,
      exactState:
        report.state?.surface === "portal" &&
        report.state?.fixture === "long" &&
        report.state?.textZoom === 100,
      reportPass: report.pass === true,
      textOverflowPass: report.layout?.textOverflowPass === true,
      pageHorizontalOverflowOff: report.layout?.pageHorizontalOverflow === false,
      routeHorizontalOverflowOff: report.layout?.routeHorizontalOverflow === false,
      wholeWords: report.copy?.wordFragmentationOffenders === 0 && report.layout?.wordIntegrity?.pass === true,
      startupChoiceMeasured: Boolean(startupChoice),
      startupChoiceScrollWidthWithinClient:
        Boolean(startupChoice) && Number(startupChoice.scrollWidthPx) <= Number(startupChoice.clientWidthPx) + 1,
      startupChoiceGlyphBoundsPass:
        Boolean(startupChoice) && startupChoice.glyphOverflow === false && startupChoice.pass === true,
      targetsRemainAtLeast44:
        (report.layout?.buttons ?? []).length >= 2 &&
        report.layout.buttons.every((button) => Number(button.widthPx) >= 44 && Number(button.heightPx) >= 44),
    };
    return {
      applicable: true,
      caseId: LONG_COPY_SHORT_REPAIR_CASE,
      strategy: "fixture-only audience control inset removal within the native short-wide flow",
      checks,
      pass: Object.values(checks).every(Boolean),
    };
  }
  if (plannedCase.id !== RESPONSIVE_REPAIR_CASE) return { applicable: false, pass: true };
  const heading = blocks.find((block) => block.id === "portal-heading");
  const checks = {
    exactViewport: report.viewport?.width === 1366 && report.viewport?.height === 650,
    exactState: report.state?.surface === "portal" && report.state?.textZoom === 200,
    reportPass: report.pass === true,
    textOverflowPass: report.layout?.textOverflowPass === true,
    pageHorizontalOverflowOff: report.layout?.pageHorizontalOverflow === false,
    routeHorizontalOverflowOff: report.layout?.routeHorizontalOverflow === false,
    wholeWords: report.copy?.wordFragmentationOffenders === 0 && report.layout?.wordIntegrity?.pass === true,
    headingMeasured: Boolean(heading),
    headingScrollWidthWithinClient:
      Boolean(heading) && Number(heading.scrollWidthPx) <= Number(heading.clientWidthPx) + 1,
    headingGlyphBoundsPass: Boolean(heading) && heading.glyphOverflow === false && heading.pass === true,
  };
  return {
    applicable: true,
    caseId: RESPONSIVE_REPAIR_CASE,
    strategy: "one-column native document flow with bounded responsive display clamp",
    checks,
    pass: Object.values(checks).every(Boolean),
  };
}

function assertCaseReport(plannedCase, runner, report) {
  if (runner.pass !== true || report.pass !== true) throw new Error(`Browser gates failed for ${plannedCase.id}`);
  if (report.copy?.wordFragmentationOffenders !== 0) {
    throw new Error(`Display-word fragmentation remains for ${plannedCase.id}`);
  }
  if (report.layout?.pageHorizontalOverflow !== false || report.layout?.routeHorizontalOverflow !== false) {
    throw new Error(`Horizontal overflow remains for ${plannedCase.id}`);
  }
  if (report.layout?.textOverflowPass !== true || report.layout?.collisionPass !== true) {
    throw new Error(`Text overflow or collision remains for ${plannedCase.id}`);
  }
  const responsiveRepair = evaluateResponsiveRepairAssertion(plannedCase, report);
  if (!responsiveRepair.pass) throw new Error(`${plannedCase.id} responsive repair assertion failed`);
  return responsiveRepair;
}

async function collectModalCapture(page) {
  const discardedAttempts = [];
  for (let round = 1; round <= MAX_MODAL_ROUNDS; round += 1) {
    const samples = [];
    const bytesByHash = new Map();
    for (let shot = 1; shot <= SCREENSHOTS_PER_VISUAL_CASE; shot += 1) {
      const bytes = await page.screenshot({
        type: "jpeg",
        quality: SCREENSHOT_QUALITY,
        fullPage: true,
        omitBackground: false,
      });
      const digest = sha256Bytes(bytes);
      samples.push({ shot, sha256: digest, bytes: bytes.length });
      if (!bytesByHash.has(digest)) bytesByHash.set(digest, bytes);
    }
    const histogram = [...new Set(samples.map((sample) => sample.sha256))]
      .map((digest) => ({
        sha256: digest,
        votes: samples.filter((sample) => sample.sha256 === digest).length,
        bytes: bytesByHash.get(digest).length,
      }))
      .sort((left, right) => right.votes - left.votes || left.sha256.localeCompare(right.sha256));
    const winner = histogram[0];
    const tied = histogram.length > 1 && histogram[1].votes === winner.votes;
    if (!tied && winner.votes >= MINIMUM_MODAL_VOTES) {
      return {
        bytes: bytesByHash.get(winner.sha256),
        record: {
          pass: true,
          method: "exact-byte-modal-winner",
          successiveFullPageJpegs: SCREENSHOTS_PER_VISUAL_CASE,
          minimumWinnerVotes: MINIMUM_MODAL_VOTES,
          round,
          winner,
          uniqueByteSequences: histogram.length,
          histogram,
          samples,
          discardedAttempts,
          timingClaim: "none; readiness and paint barriers do not prove a stable raster",
        },
      };
    }
    discardedAttempts.push({
      round,
      reason: tied ? "tied-mode" : "modal-winner-below-7-of-11",
      histogram,
      samples,
    });
    if (round < MAX_MODAL_ROUNDS) {
      await page.reload({ waitUntil: "domcontentloaded", timeout: RUNNER_TIMEOUT_MS });
      await page.waitForSelector('body[data-ready="true"]', { timeout: RUNNER_TIMEOUT_MS });
    }
  }
  return {
    bytes: null,
    record: {
      pass: false,
      method: "exact-byte-modal-winner",
      successiveFullPageJpegs: SCREENSHOTS_PER_VISUAL_CASE,
      minimumWinnerVotes: MINIMUM_MODAL_VOTES,
      rounds: MAX_MODAL_ROUNDS,
      winner: null,
      discardedAttempts,
      timingClaim: "none; readiness and paint barriers do not prove a stable raster",
    },
  };
}

async function preserveRecoveredRaws(plan, recoveryStem, recoveredRawAuthority) {
  const directory = repoPath(plan.capture.rawDirectory);
  if (!(await exists(directory))) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const records = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".jpg")) continue;
    const absolute = join(directory, entry.name);
    const bytes = await readFile(absolute);
    const metadata = await stat(absolute);
    const digest = sha256Bytes(bytes);
    const preservedRelative = `${RECOVERY_RELATIVE}/raw/${recoveryStem}/${entry.name}`;
    const preservedAbsolute = repoPath(preservedRelative);
    if (await exists(preservedAbsolute)) {
      const preservedMetadata = await stat(preservedAbsolute);
      const preservedDigest = await sha256File(preservedAbsolute);
      if (preservedMetadata.size !== metadata.size || preservedDigest !== digest) {
        throw new Error(`Recovered raw preservation collision: ${preservedRelative}`);
      }
    } else {
      await atomicWrite(preservedAbsolute, bytes);
    }
    records.push({
      source: {
        path: toRepoRelative(absolute),
        bytes: metadata.size,
        sha256: digest,
      },
      preservedCopy: {
        path: preservedRelative,
        bytes: metadata.size,
        sha256: digest,
        byteIdentical: true,
      },
      authority: recoveredRawAuthority,
    });
  }
  return records;
}

async function preserveRecoveredReports(recoveryStem) {
  const directory = repoPath(REPORTS_RELATIVE);
  if (!(await exists(directory))) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const records = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) continue;
    const absolute = join(directory, entry.name);
    const bytes = await readFile(absolute);
    const digest = sha256Bytes(bytes);
    const preservedRelative = `${RECOVERY_RELATIVE}/reports/${recoveryStem}/${entry.name}`;
    const preservedAbsolute = repoPath(preservedRelative);
    if (await exists(preservedAbsolute)) {
      const preservedMetadata = await stat(preservedAbsolute);
      const preservedDigest = await sha256File(preservedAbsolute);
      if (preservedMetadata.size !== bytes.length || preservedDigest !== digest) {
        throw new Error(`Recovered report preservation collision: ${preservedRelative}`);
      }
    } else {
      await atomicWrite(preservedAbsolute, bytes);
    }
    records.push({
      source: { path: toRepoRelative(absolute), bytes: bytes.length, sha256: digest },
      preservedCopy: { path: preservedRelative, bytes: bytes.length, sha256: digest, byteIdentical: true },
      authority: "preserved-stale-harness-report",
    });
  }
  return records;
}

async function preserveAndRetireMatrix(recoveryStem) {
  const sourceAbsolute = repoPath(MATRIX_RELATIVE);
  if (!(await exists(sourceAbsolute))) return null;
  const bytes = await readFile(sourceAbsolute);
  const digest = sha256Bytes(bytes);
  const preservedRelative = `${RECOVERY_RELATIVE}/matrices/${recoveryStem}/browser-matrix-report.json`;
  const preservedAbsolute = repoPath(preservedRelative);
  if (await exists(preservedAbsolute)) {
    const preservedMetadata = await stat(preservedAbsolute);
    const preservedDigest = await sha256File(preservedAbsolute);
    if (preservedMetadata.size !== bytes.length || preservedDigest !== digest) {
      throw new Error(`Recovered matrix preservation collision: ${preservedRelative}`);
    }
  } else {
    await atomicWrite(preservedAbsolute, bytes);
  }
  await unlink(sourceAbsolute);
  return {
    source: { path: MATRIX_RELATIVE, bytes: bytes.length, sha256: digest },
    preservedCopy: { path: preservedRelative, bytes: bytes.length, sha256: digest, byteIdentical: true },
    retiredFromCanonicalPath: true,
  };
}

function newCheckpoint(planAuthority, harnessAuthority, migration) {
  const timestamp = new Date().toISOString();
  return {
    schema: CHECKPOINT_SCHEMA,
    authority: AUTHORITY,
    createdAt: timestamp,
    updatedAt: timestamp,
    status: "in-progress",
    plan: planAuthority,
    harness: harnessAuthority,
    migration,
    cases: {},
    targetedCases: {},
    completedAuthorityCases: 0,
    expectedAuthorityCases: 46,
    matrix: null,
  };
}

async function preserveLegacyCheckpoint(bytes, parsed, plan, planAuthority, harnessAuthority) {
  const digest = sha256Bytes(bytes);
  const nativeHarnessMismatch = parsed?.schema === CHECKPOINT_SCHEMA && parsed?.authority === AUTHORITY;
  const migrationKind = nativeHarnessMismatch ? "stale-repository-native-harness-authority" : "browser-control-to-repository-native";
  const recoveredRawAuthority = nativeHarnessMismatch
    ? "preserved-stale-repository-native-output"
    : "preserved-untrusted-browser-control-output";
  const recoveredRawPolicy = nativeHarnessMismatch
    ? "each stale repository-native JPEG is copied byte-for-byte into the deterministic recovery/raw subtree but cannot be promoted or skipped after a harness authority change; every planned authority case must be recaptured and checkpointed against the replacement exact harness authority"
    : "each browser-control JPEG is copied byte-for-byte into the deterministic recovery/raw subtree but is not promoted or skipped; every planned authority case must be recaptured and checkpointed by the repository-native runner";
  const stem = `${nativeHarnessMismatch ? "stale-harness-checkpoint" : "browser-control-checkpoint"}-${digest.slice(0, 16)}`;
  const preservedRelative = `${RECOVERY_RELATIVE}/${stem}.json`;
  const reportRelative = `${RECOVERY_RELATIVE}/${stem}.recovery-report.json`;
  const preservedAbsolute = repoPath(preservedRelative);
  if (!(await exists(preservedAbsolute))) await atomicWrite(preservedAbsolute, bytes);
  const recoveredRaws = await preserveRecoveredRaws(plan, stem, recoveredRawAuthority);
  const recoveredReports = await preserveRecoveredReports(stem);
  const recoveredMatrix = await preserveAndRetireMatrix(stem);
  const recoveryReport = {
    schema: RECOVERY_REPORT_SCHEMA,
    createdAt: new Date().toISOString(),
    migrationKind,
    reason: nativeHarnessMismatch
      ? "repository-native checkpoint preserved because the pixel/report-producing harness authority changed"
      : "browser-control checkpoint preserved before repository-native Playwright authority migration",
    source: {
      path: CHECKPOINT_RELATIVE,
      schema: parsed?.schema ?? "unreadable",
      status: parsed?.status ?? "unknown",
      bytes: bytes.length,
      sha256: digest,
    },
    preservedCopy: {
      path: preservedRelative,
      bytes: bytes.length,
      sha256: digest,
      byteIdentical: true,
    },
    recoveredRawFiles: recoveredRaws,
    recoveredCaseReports: recoveredReports,
    recoveredMatrix,
    recoveredRawPolicy,
    destinationAuthority: AUTHORITY,
    plan: planAuthority,
    harness: harnessAuthority,
  };
  await atomicWriteJson(repoPath(reportRelative), recoveryReport);
  return {
    sourceSha256: digest,
    preservedCheckpoint: preservedRelative,
    recoveryReport: reportRelative,
    recoveredRawCount: recoveredRaws.length,
    recoveredReportCount: recoveredReports.length,
    recoveredMatrix: recoveredMatrix?.preservedCopy ?? null,
    authorityPolicy: nativeHarnessMismatch
      ? "prior local evidence is preserved but cannot satisfy resume after a harness authority change"
      : "historical browser-control evidence is preserved but not trusted for local-authority resume",
  };
}

async function loadCheckpoint(plan, planAuthority, harnessAuthority) {
  const checkpointAbsolute = repoPath(CHECKPOINT_RELATIVE);
  if (!(await exists(checkpointAbsolute))) {
    const checkpoint = newCheckpoint(planAuthority, harnessAuthority, null);
    await atomicWriteJson(checkpointAbsolute, checkpoint);
    return checkpoint;
  }

  const bytes = await readFile(checkpointAbsolute);
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    parsed = null;
  }
  const native =
    parsed?.schema === CHECKPOINT_SCHEMA &&
    parsed?.authority === AUTHORITY &&
    parsed?.cases &&
    !Array.isArray(parsed.cases);
  const samePlan = native && parsed.plan?.sha256 === planAuthority.sha256;
  const sameHarness = native && parsed.harness?.sha256 === harnessAuthority.sha256;
  if (native && samePlan && sameHarness) return parsed;

  const migration = await preserveLegacyCheckpoint(bytes, parsed, plan, planAuthority, harnessAuthority);
  const checkpoint = newCheckpoint(planAuthority, harnessAuthority, migration);
  await atomicWriteJson(checkpointAbsolute, checkpoint);
  return checkpoint;
}

async function validateCompletion(entry, plannedCase, planAuthority, harnessAuthority, targeted = false) {
  if (
    !entry ||
    entry.status !== "complete" ||
    entry.planSha256 !== planAuthority.sha256 ||
    entry.harnessSha256 !== harnessAuthority.sha256
  ) return false;
  if (entry.authority !== (targeted ? "targeted-diagnostic" : AUTHORITY)) return false;
  const reportPath = entry.report?.path;
  if (!reportPath || !(await exists(repoPath(reportPath)))) return false;
  const reportBytes = await readFile(repoPath(reportPath));
  if (sha256Bytes(reportBytes) !== entry.report.sha256 || reportBytes.length !== entry.report.bytes) return false;
  let report;
  try {
    report = JSON.parse(reportBytes.toString("utf8"));
  } catch {
    return false;
  }
  if (
    report.schema !== CASE_REPORT_SCHEMA ||
    report.id !== plannedCase.id ||
    report.plan?.sha256 !== planAuthority.sha256 ||
    report.harness?.sha256 !== harnessAuthority.sha256 ||
    report.runner?.pass !== true ||
    report.report?.pass !== true
  ) {
    return false;
  }
  const mustHaveCapture = targeted || plannedCase.captureRequired;
  if (mustHaveCapture) {
    const raw = entry.raw;
    if (!raw?.path || !(await exists(repoPath(raw.path)))) return false;
    const metadata = await stat(repoPath(raw.path));
    if (metadata.size !== raw.bytes || (await sha256File(repoPath(raw.path))) !== raw.sha256) return false;
    if (report.capture?.raw?.sha256 !== raw.sha256 || report.capture?.modal?.winner?.votes < MINIMUM_MODAL_VOTES) return false;
  }
  return report.responsiveRepair?.pass !== false;
}

function checkpointEntry(caseReport, reportRelative, reportBytes, raw) {
  return {
    id: caseReport.id,
    status: "complete",
    authority: caseReport.authority,
    planSha256: caseReport.plan.sha256,
    harnessSha256: caseReport.harness.sha256,
    completedAt: caseReport.capturedAt,
    report: {
      path: reportRelative,
      bytes: reportBytes.length,
      sha256: sha256Bytes(reportBytes),
    },
    raw,
  };
}

function sanitizeFailureMessage(error) {
  return String(error?.message ?? error ?? "unknown browser failure")
    .replace(/[A-Za-z]:[\\/][^\r\n"']+/g, "[private path redacted]")
    .replace(/\/(?:Users|home)\/[^\r\n"']+/g, "[private path redacted]");
}

async function recordFailedCase(
  checkpoint,
  store,
  plannedCase,
  planAuthority,
  harnessAuthority,
  browserDescriptor,
  targeted,
  error,
) {
  const output = caseOutputPaths(plannedCase, targeted);
  const capturedAt = new Date().toISOString();
  const failureReport = {
    schema: CASE_REPORT_SCHEMA,
    authority: targeted ? "targeted-diagnostic" : AUTHORITY,
    capturedAt,
    plan: planAuthority,
    harness: harnessAuthority,
    browser: browserDescriptor,
    id: plannedCase.id,
    viewportId: plannedCase.viewportId,
    query: plannedCase.query,
    focusSelector: plannedCase.focusSelector,
    captureRequired: plannedCase.captureRequired,
    status: "failed-browser-gate",
    error: sanitizeFailureMessage(error),
  };
  const reportBytes = Buffer.from(portableJson(failureReport));
  await atomicWrite(repoPath(output.report), reportBytes);
  const entry = checkpointEntry(failureReport, output.report, reportBytes, null);
  entry.status = "failed-browser-gate";
  store[plannedCase.id] = entry;
  await writeCheckpoint(checkpoint);
}

async function writeCheckpoint(checkpoint) {
  checkpoint.updatedAt = new Date().toISOString();
  checkpoint.completedAuthorityCases = Object.values(checkpoint.cases).filter(
    (entry) => entry.status === "complete" && entry.authority === AUTHORITY,
  ).length;
  await atomicWriteJson(repoPath(CHECKPOINT_RELATIVE), checkpoint);
}

function caseOutputPaths(plannedCase, targeted) {
  if (targeted) {
    return {
      raw: `${TARGETED_RELATIVE}/captures/raw/${plannedCase.id}.jpg`,
      report: `${TARGETED_RELATIVE}/reports/${plannedCase.id}.json`,
    };
  }
  return {
    raw: `${plannedCase.captureRequired ? "artifacts/evidence/phase-0-3d-repair-v3/captures/raw" : `${EVIDENCE_RELATIVE}/captures/raw`}/${plannedCase.id}.jpg`,
    report: `${REPORTS_RELATIVE}/${plannedCase.id}.json`,
  };
}

async function runCase(
  page,
  plan,
  planAuthority,
  harnessAuthority,
  plannedCase,
  browserDescriptor,
  targeted,
) {
  const url = buildRunnerUrl(plan, plannedCase);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: RUNNER_TIMEOUT_MS });
  const dom = await readRunnerDomReport(page, plan, plannedCase);
  const responsiveRepair = assertCaseReport(plannedCase, dom.runner, dom.report);
  const forceCapture = targeted || plannedCase.captureRequired;
  let raw = null;
  let modal = null;
  if (forceCapture) {
    const result = await collectModalCapture(page);
    const output = caseOutputPaths(plannedCase, targeted);
    modal = result.record;
    if (result.bytes) {
      await atomicWrite(repoPath(output.raw), result.bytes);
      raw = {
        path: output.raw,
        bytes: result.bytes.length,
        sha256: sha256Bytes(result.bytes),
        format: "JPEG",
      };
    }
  }

  const output = caseOutputPaths(plannedCase, targeted);
  const capturedAt = new Date().toISOString();
  const caseReport = {
    schema: CASE_REPORT_SCHEMA,
    authority: targeted ? "targeted-diagnostic" : AUTHORITY,
    capturedAt,
    plan: planAuthority,
    harness: harnessAuthority,
    browser: browserDescriptor,
    id: plannedCase.id,
    viewportId: plannedCase.viewportId,
    query: plannedCase.query,
    focusSelector: plannedCase.focusSelector,
    captureRequired: plannedCase.captureRequired,
    forcedDiagnosticCapture: targeted && !plannedCase.captureRequired,
    runnerDomReportSha256: dom.serializedSha256,
    runner: dom.runner,
    report: dom.report,
    responsiveRepair,
    capture: forceCapture ? { raw, modal } : null,
  };
  const reportBytes = Buffer.from(portableJson(caseReport));
  await atomicWrite(repoPath(output.report), reportBytes);
  const entry = checkpointEntry(caseReport, output.report, reportBytes, raw);
  if (forceCapture && modal?.pass !== true) entry.status = "failed-modal-capture";
  return {
    caseReport,
    entry,
  };
}

async function validateAllAuthorityCases(checkpoint, expanded, planAuthority, harnessAuthority) {
  const reports = [];
  for (const plannedCase of expanded) {
    const entry = checkpoint.cases[plannedCase.id];
    if (!(await validateCompletion(entry, plannedCase, planAuthority, harnessAuthority, false))) return null;
    reports.push(await readJson(repoPath(entry.report.path)));
  }
  return reports;
}

async function finalizeMatrix(
  checkpoint,
  expanded,
  plan,
  planAuthority,
  harnessAuthority,
  browserDescriptor,
) {
  const reports = await validateAllAuthorityCases(checkpoint, expanded, planAuthority, harnessAuthority);
  if (!reports) return false;
  const visual = reports.filter((record) => record.capture);
  if (visual.length !== 36) throw new Error(`Cannot finalize: expected 36 visual records, observed ${visual.length}`);
  const votes = visual.map((record) => Number(record.capture.modal.winner.votes));
  const discarded = visual.flatMap((record) => record.capture.modal.discardedAttempts ?? []);
  const matrix = {
    schema: MATRIX_SCHEMA,
    generatedAt: new Date().toISOString(),
    evidenceMethod:
      "repository-native Playwright runner reading serialized same-origin DOM reports and selecting exact-byte modal full-page JPEG winners",
    plan: planAuthority,
    harness: harnessAuthority,
    contract: {
      path: plan.contractPath,
      sha256: "25666cf071afe7564dc051cbec770ead325cdf19ef1f4926e43d793a2a053bc5",
    },
    fontMode: plan.fontMode,
    browser: browserDescriptor,
    capturePolicy: {
      method: "exact-byte-modal-winner",
      successiveFullPageJpegsPerVisualCase: SCREENSHOTS_PER_VISUAL_CASE,
      minimumWinnerVotes: MINIMUM_MODAL_VOTES,
      observedWinnerVotesMinimum: Math.min(...votes),
      weakCases: 0,
      tiedCases: 0,
      discardedWeakCaptureAttempts: discarded.length,
      screenshotType: "JPEG",
      screenshotQuality: SCREENSHOT_QUALITY,
      fullPage: true,
      timingClaim: "none; readiness and paint barriers do not prove a stable raster",
    },
    cases: reports.map((caseReport) => ({
      id: caseReport.id,
      viewportId: caseReport.viewportId,
      query: caseReport.query,
      focusSelector: caseReport.focusSelector,
      runner: caseReport.runner,
      report: caseReport.report,
      responsiveRepair: caseReport.responsiveRepair,
      capture: caseReport.capture ? { raw: caseReport.capture.raw, modal: caseReport.capture.modal } : null,
    })),
  };
  const matrixBytes = Buffer.from(portableJson(matrix));
  await atomicWrite(repoPath(MATRIX_RELATIVE), matrixBytes);
  checkpoint.status = "complete-local-authority-awaiting-normalization";
  checkpoint.matrix = {
    path: MATRIX_RELATIVE,
    bytes: matrixBytes.length,
    sha256: sha256Bytes(matrixBytes),
    cases: reports.length,
    captures: visual.length,
  };
  await writeCheckpoint(checkpoint);
  return true;
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    printHelp();
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    printHelp();
    return;
  }

  const planBytes = await readFile(repoPath(PLAN_RELATIVE));
  const plan = JSON.parse(planBytes.toString("utf8"));
  const expanded = expandPlan(plan);
  const planAuthority = await validateFrozenAuthority(plan, planBytes);
  const harnessAuthority = await validateHarnessAuthority();
  const byId = new Map(expanded.map((entry) => [entry.id, entry]));

  if (options.list) {
    for (const entry of expanded) {
      console.log(`${entry.id}\t${entry.captureRequired ? "capture" : "report"}`);
    }
    console.log(
      `46 cases; 36 planned captures; plan SHA-256 ${planAuthority.sha256}; harness ${harnessAuthority.cacheToken} ${harnessAuthority.sha256}`,
    );
    return;
  }

  const selectedIds = options.targetedStress
    ? TARGETED_STRESS_CASES
    : options.caseIds.length > 0
      ? [...new Set(options.caseIds)]
      : expanded.map((entry) => entry.id);
  for (const id of selectedIds) {
    if (!byId.has(id)) throw new Error(`Unknown Phase 0.3 case: ${id}`);
  }

  await validateServer(plan);
  const checkpoint = await loadCheckpoint(plan, planAuthority, harnessAuthority);
  const targeted = options.targetedStress;
  const store = targeted ? checkpoint.targetedCases : checkpoint.cases;
  const pending = [];
  for (const id of selectedIds) {
    const plannedCase = byId.get(id);
    const valid = await validateCompletion(store[id], plannedCase, planAuthority, harnessAuthority, targeted);
    if (valid && !targeted) {
      console.log(`SKIP ${id} (checkpoint, report, and raw hashes validated)`);
      continue;
    }
    // Targeted stress is intentionally forced even if an earlier diagnostic exists.
    pending.push(plannedCase);
  }
  const batch = pending.slice(0, targeted ? TARGETED_STRESS_CASES.length : options.batchSize);
  if (batch.length === 0) {
    const finalized = targeted
      ? false
      : await finalizeMatrix(checkpoint, expanded, plan, planAuthority, harnessAuthority, checkpoint.browser);
    console.log(finalized ? `COMPLETE ${MATRIX_RELATIVE}` : "No pending selected cases in this batch.");
    return;
  }

  const playwright = await resolvePlaywright();
  const executable = await resolveBrowserExecutable(options.browserExecutable, playwright.chromium);
  const browser = await playwright.chromium.launch({
    executablePath: executable.absolute,
    headless: true,
  });
  const version = browser.version();
  const browserDescriptor = {
    engine: "Chromium",
    product: basename(executable.absolute).replace(/\.exe$/i, ""),
    version,
    executableResolution: executable.resolution,
    automationPackage: playwright.packageName,
    localAuthority: true,
  };
  checkpoint.browser = browserDescriptor;
  await writeCheckpoint(checkpoint);

  let completed = 0;
  try {
    for (const plannedCase of batch) {
      const renderedWidth = Math.ceil(plannedCase.viewport.width * plannedCase.viewport.captureScale);
      const renderedHeight = Math.ceil(plannedCase.viewport.height * plannedCase.viewport.captureScale);
      const context = await browser.newContext({
        viewport: {
          width: Math.max(1280, renderedWidth),
          height: Math.max(720, renderedHeight),
        },
        reducedMotion: new URLSearchParams(plannedCase.query).get("motion") === "reduce" ? "reduce" : "no-preference",
        colorScheme: "dark",
        locale: "en-US",
        serviceWorkers: "block",
      });
      const page = await context.newPage();
      try {
        console.log(`RUN ${plannedCase.id}${targeted ? " (targeted forced visual)" : ""}`);
        let result;
        try {
          result = await runCase(
            page,
            plan,
            planAuthority,
            harnessAuthority,
            plannedCase,
            browserDescriptor,
            targeted,
          );
        } catch (error) {
          await recordFailedCase(
            checkpoint,
            store,
            plannedCase,
            planAuthority,
            harnessAuthority,
            browserDescriptor,
            targeted,
            error,
          );
          throw error;
        }
        store[plannedCase.id] = result.entry;
        await writeCheckpoint(checkpoint);
        if (result.entry.status !== "complete") {
          throw new Error(
            `${plannedCase.id} exhausted ${MAX_MODAL_ROUNDS} modal rounds without a unique ${MINIMUM_MODAL_VOTES}/11 winner; discarded attempts were checkpointed`,
          );
        }
        completed += 1;
        const votes = result.caseReport.capture?.modal?.winner?.votes;
        console.log(`PASS ${plannedCase.id}${votes ? ` · modal ${votes}/11` : " · DOM report"}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  if (targeted) {
    console.log(`TARGETED COMPLETE ${completed}/${batch.length}; authority matrix unchanged.`);
    return;
  }
  const finalized = await finalizeMatrix(
    checkpoint,
    expanded,
    plan,
    planAuthority,
    harnessAuthority,
    browserDescriptor,
  );
  if (finalized) {
    console.log(`MATRIX COMPLETE ${MATRIX_RELATIVE}`);
  } else {
    const validCount = (await Promise.all(
      expanded.map((entry) =>
        validateCompletion(checkpoint.cases[entry.id], entry, planAuthority, harnessAuthority, false),
      ),
    )).filter(Boolean).length;
    console.log(`CHECKPOINTED ${validCount}/46 local-authority cases; rerun to resume.`);
  }
}

main().catch((error) => {
  console.error(`Phase 0.3 capture stopped: ${error.message}`);
  process.exitCode = 1;
});
