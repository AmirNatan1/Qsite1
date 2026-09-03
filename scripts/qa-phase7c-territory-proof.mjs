#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import axeCore from "axe-core";
import { chromium, firefox, webkit } from "playwright-core";
import sharp from "sharp";

import {
  PHASE7C_CYCLE_COUNT,
  PHASE7C_ALLOWED_STATUSES,
  PHASE7C_ENGINES,
  PHASE7C_GATES,
  PHASE7C_INDUSTRIES,
  PHASE7C_PERFORMANCE_BUDGET,
  PHASE7C_PROOF_RECORD,
  PHASE7C_RECORDING_SCENARIOS,
  PHASE7C_STATE_SAMPLES as PHASE7C_STATE_SAMPLE_TUPLES,
  PHASE7C_CORE_VIEWPORTS,
} from "./phase7c-contract.mjs";
import { observeTargetSizes, TARGET_MINIMUM_CSS_PIXELS } from "./phase7a-target-size.mjs";
import { TERRITORY_STATE_RANGES } from "../src/scripts/territory-traverse-state.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");

export const SCHEMA = "quantum-hub.phase-7c.territory-proof-browser-qa.v1";
export const REPORT_FILE = "phase-7c-browser-qa.json";
export const MANIFEST_FILE = "evidence-manifest.json";
export const STATUSES = PHASE7C_ALLOWED_STATUSES;

const ENGINE_MAP = Object.freeze({
  chromium: chromium,
  firefox: firefox,
  webkit: webkit,
});

const ENGINE_EVIDENCE = Object.freeze({
  chromium: "Chromium browser authority",
  firefox: "Firefox browser authority",
  webkit: "Playwright WebKit proxy; not physical Safari",
});

const DEFAULT_TIMEOUT_MS = 10_000;
const TARGET_MINIMUM_CSS_PX = TARGET_MINIMUM_CSS_PIXELS;
const CLS_BUDGET = PHASE7C_PERFORMANCE_BUDGET.clsMaximum;
const LONG_TASK_THRESHOLD_MS = 50;
const STOP_HOLD_MS = 2_000;
const MEMORY_ABSOLUTE_GROWTH_BUDGET = 8 * 1024 * 1024;
const MEMORY_SLOPE_BUDGET_PER_CYCLE = 1024 * 1024;
const CANONICAL_1280_CARRIER_PROBES = Object.freeze([
  Object.freeze({ scrollY: 12_000, observedStage: "automotive", note: "Independent inspection reported a carrier/copy crossing near this release position." }),
  Object.freeze({ scrollY: 12_620, observedStage: "automotive", note: "Independent inspection reported the later Automotive settlement as clear." }),
  Object.freeze({ scrollY: 13_600, observedStage: "logistics", note: "Independent inspection reported a carrier/body-copy crossing near this position." }),
  Object.freeze({ scrollY: 14_580, observedStage: "manufacturing", note: "Independent inspection reported a carrier/title-edge crossing near this position." }),
]);
const PHASE7C_INDUSTRY_NAMES = PHASE7C_INDUSTRIES;
const PHASE7C_PROOF_TITLE = PHASE7C_PROOF_RECORD;
const PHASE7C_HUMAN_GATES = PHASE7C_GATES;
const PHASE7C_STATE_SAMPLES = Object.freeze(Object.fromEntries(
  PHASE7C_STATE_SAMPLE_TUPLES.map(([state, progress]) => [state, Object.freeze({ state, progress })]),
));
const PHASE7C_VIEWPORTS = Object.freeze(PHASE7C_CORE_VIEWPORTS.map(([width, height]) => Object.freeze({
  id: `${width}x${height}`,
  width,
  height,
})));
const STABLE_STAGE_SAMPLES = Object.freeze([
  PHASE7C_STATE_SAMPLES.automotive,
  PHASE7C_STATE_SAMPLES.logistics,
  PHASE7C_STATE_SAMPLES.manufacturing,
  PHASE7C_STATE_SAMPLES.energy,
  PHASE7C_STATE_SAMPLES.proof,
]);

function normalizeSlashes(value) {
  return value.replaceAll("\\", "/");
}

function within(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeError(error) {
  const text = error instanceof Error ? error.message : String(error);
  return text
    .replace(/[A-Za-z]:\\[^\r\n"']+/g, "<local-path>")
    .replace(/\/[Uu]sers\/[^/\s]+\/[^\r\n"']+/g, "<local-path>")
    .slice(0, 2_000);
}

function round(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function dedupe(values) {
  return [...new Set(values.filter(Boolean))];
}

function statusRank(status) {
  if (status === "FAIL") return 4;
  if (status === "NOT AVAILABLE TO EXECUTION ENVIRONMENT") return 3;
  if (status === "LIMITATION") return 2;
  if (status === "NOT OBSERVED") return 1;
  return 0;
}

export function honestStatus(checks, limitations = []) {
  const normalizedChecks = Array.isArray(checks) ? checks : Object.values(checks ?? {});
  if (normalizedChecks.some((value) => value === false)) return "FAIL";
  if (limitations.length > 0 || normalizedChecks.some((value) => value == null)) {
    return "LIMITATION";
  }
  return "PASS";
}

function aggregateStatus(results, inheritedLimitations = []) {
  let status = inheritedLimitations.length > 0 ? "LIMITATION" : "PASS";
  for (const result of results) {
    if (statusRank(result?.status) > statusRank(status)) status = result.status;
  }
  return status;
}

function parsePositiveInteger(value, option) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${option} must be a positive integer.`);
  }
  return parsed;
}

function outputIgnoredByGit(resolvedOutput, repositoryRoot = ROOT) {
  if (!within(repositoryRoot, resolvedOutput)) return true;
  const relative = normalizeSlashes(path.relative(repositoryRoot, resolvedOutput));
  if (!relative) return false;
  const result = spawnSync("git", ["check-ignore", "-q", "--", relative], {
    cwd: repositoryRoot,
    stdio: "ignore",
  });
  return result.status === 0;
}

export function validateOutputDirectory(
  candidate,
  { repositoryRoot = ROOT, ignoreProbe = outputIgnoredByGit } = {},
) {
  if (!candidate) throw new Error("--output is required.");
  const resolved = path.resolve(candidate);
  if (resolved === path.parse(resolved).root || resolved === repositoryRoot) {
    throw new Error("Evidence output cannot be a filesystem or repository root.");
  }
  if (within(repositoryRoot, resolved) && !ignoreProbe(resolved, repositoryRoot)) {
    throw new Error("Evidence output inside the repository must be ignored by Git.");
  }
  return resolved;
}

export function parseArguments(argv = process.argv.slice(2), options = {}) {
  const parsed = {
    baseUrl: null,
    output: null,
    revision: null,
    engine: "all",
    suite: "full",
    headed: false,
    chromiumExecutable: null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    selfTest: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${token} requires a value.`);
      return argv[index];
    };
    if (token === "--base-url") parsed.baseUrl = next();
    else if (token === "--output") parsed.output = next();
    else if (token === "--revision") parsed.revision = next();
    else if (token === "--engine") parsed.engine = next().toLowerCase();
    else if (token === "--suite") parsed.suite = next().toLowerCase();
    else if (token === "--chromium-executable") parsed.chromiumExecutable = path.resolve(next());
    else if (token === "--timeout-ms") parsed.timeoutMs = parsePositiveInteger(next(), token);
    else if (token === "--headed") parsed.headed = true;
    else if (token === "--self-test") parsed.selfTest = true;
    else if (token === "--help" || token === "-h") parsed.help = true;
    else throw new Error(`Unknown option: ${token}`);
  }

  if (parsed.help || parsed.selfTest) return parsed;
  if (!parsed.baseUrl) throw new Error("--base-url is required.");
  const url = new URL(parsed.baseUrl);
  if (!/^https?:$/.test(url.protocol)) throw new Error("--base-url must use http or https.");
  parsed.baseUrl = url.href.replace(/\/$/, "");
  if (!/^[0-9a-f]{40}$/.test(parsed.revision ?? "")) {
    throw new Error("--revision must be an exact 40-character lowercase Git SHA.");
  }
  if (!["all", ...Object.keys(ENGINE_MAP)].includes(parsed.engine)) {
    throw new Error("--engine must be all, chromium, firefox, or webkit.");
  }
  if (!["full", "responsive-smoke"].includes(parsed.suite)) {
    throw new Error("--suite must be full or responsive-smoke.");
  }
  parsed.output = validateOutputDirectory(parsed.output, options);
  return parsed;
}

export function validateSettlementSnapshot(snapshot, expected = {}) {
  const tolerance = expected.progressTolerance ?? 0.025;
  const progressMatches = expected.progress == null
    ? true
    : Number.isFinite(snapshot.progress)
      && Math.abs(snapshot.progress - expected.progress) <= tolerance;
  const checks = {
    rootPresent: snapshot.rootPresent === true,
    fontsLoaded: snapshot.fontsLoaded === true,
    backgroundAvailable: snapshot.backgroundInert === false,
    projectionSettled: snapshot.mode !== "enhanced" || snapshot.projection === "settled",
    rafIdle: snapshot.mode !== "enhanced" || snapshot.raf === "idle",
    stateMatches: expected.state == null || snapshot.state === expected.state,
    progressMatches,
    carrierPresent: snapshot.carrierCount === 1,
    trackPresent: snapshot.trackCount === 1,
  };
  return {
    checks,
    status: honestStatus(checks),
  };
}

export function validateResponsiveSnapshot(snapshot, viewport, expectedMode) {
  const checks = {
    viewportWidth: snapshot.viewport.width === viewport.width,
    viewportHeight: snapshot.viewport.height === viewport.height,
    mode: snapshot.mode === expectedMode,
    fourTerritories: snapshot.territoryCount === PHASE7C_INDUSTRY_NAMES.length,
    exactTerritoryNames:
      JSON.stringify(snapshot.territoryNames) === JSON.stringify(PHASE7C_INDUSTRY_NAMES),
    proofTitle: snapshot.proofTitle === PHASE7C_PROOF_TITLE,
    oneCarrier: snapshot.carrierCount === 1,
    oneTrack: snapshot.trackCount === 1,
    fourFallbacks: snapshot.staticFallbackCount === 4,
    fallbackVisibility:
      expectedMode === "enhanced"
        ? snapshot.visibleStaticFallbackCount === 0
        : snapshot.visibleStaticFallbackCount === 4,
    titleVisible: snapshot.titleVisible === true,
    titleUnclipped: snapshot.titleClipped === false,
    noInternalWordBreaks: Array.isArray(snapshot.internallyBrokenWords) && snapshot.internallyBrokenWords.length === 0,
    liveCarrierClearOfGlyphs: snapshot.carrierTextIntersection?.status !== "FAIL",
    horizontalOverflow: snapshot.horizontalOverflow <= 1,
    noTerritoryVideo: snapshot.territoryVideoCount === 0,
    oneProofRecord: snapshot.proofRecordCount === 1,
    oneApprovedPoster: snapshot.posterCount === 1,
    ordinaryProofLink: snapshot.proofHref === "/pocs/maradin/",
  };
  return { checks, status: honestStatus(checks) };
}

async function inspectCarrierTextClearance(page) {
  return page.evaluate(() => {
    const root = document.querySelector("[data-territory-traverse]");
    if (!(root instanceof HTMLElement)) {
      return { status: "FAIL", applicable: false, failure: "Territory root missing", intersectionCount: null };
    }
    const visible = (element) => {
      if (!(element instanceof Element) || element.closest("[aria-hidden='true']")) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number.parseFloat(style.opacity) > 0
        && rect.width > 0 && rect.height > 0
        && rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight;
    };
    const visualGeometryVisible = (element) => {
      if (!(element instanceof Element)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number.parseFloat(style.opacity) > 0
        && rect.width > 0 && rect.height > 0
        && rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight;
    };
    const glyphs = [];
    for (const element of root.querySelectorAll("h2, h3, p, a[href]")) {
      if (!visible(element)) continue;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (let offset = 0; offset < node.data.length; offset += 1) {
          const character = node.data[offset];
          if (/\s/.test(character)) continue;
          const range = document.createRange();
          range.setStart(node, offset);
          range.setEnd(node, offset + 1);
          const rect = range.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          glyphs.push({
            left: rect.left + Math.min(1, rect.width * 0.06),
            right: rect.right - Math.min(1, rect.width * 0.06),
            top: rect.top + rect.height * 0.1,
            bottom: rect.bottom - rect.height * 0.1,
            character,
            element: element.id ? `#${element.id}` : element.tagName.toLowerCase(),
            text: element.textContent.trim().replace(/\s+/g, " ").slice(0, 120),
          });
        }
      }
    }

    const points = [];
    const path = root.querySelector("[data-territory-carrier]");
    if (path instanceof SVGGeometryElement && path.getScreenCTM() && visualGeometryVisible(path)) {
      const matrix = path.getScreenCTM();
      const length = path.getTotalLength();
      const step = Math.max(0.75, length / 8_000);
      const strokeWidth = Number.parseFloat(getComputedStyle(path).strokeWidth) || 2;
      for (let distance = 0; distance <= length; distance += step) {
        const local = path.getPointAtLength(distance);
        const screen = new DOMPoint(local.x, local.y).matrixTransform(matrix);
        if (screen.x >= -4 && screen.x <= innerWidth + 4 && screen.y >= -4 && screen.y <= innerHeight + 4) {
          points.push({ x: screen.x, y: screen.y, radius: Math.max(1, strokeWidth / 2), source: "enhanced-svg-carrier" });
        }
      }
    }
    for (const carrier of root.querySelectorAll("[data-territory-static] .territory-static__carrier")) {
      if (!visualGeometryVisible(carrier)) continue;
      const rect = carrier.getBoundingClientRect();
      const style = getComputedStyle(carrier);
      const matrix = style.transform === "none" ? new DOMMatrix() : new DOMMatrix(style.transform);
      const horizontal = carrier.offsetWidth >= carrier.offsetHeight;
      const rawX = horizontal ? matrix.a : matrix.c;
      const rawY = horizontal ? matrix.b : matrix.d;
      const magnitude = Math.max(0.0001, Math.hypot(rawX, rawY));
      const directionX = rawX / magnitude;
      const directionY = rawY / magnitude;
      const length = horizontal ? carrier.offsetWidth * magnitude : carrier.offsetHeight * magnitude;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const startX = centerX - directionX * length / 2;
      const startY = centerY - directionY * length / 2;
      const stroke = Math.max(carrier.offsetWidth < carrier.offsetHeight ? carrier.offsetWidth : carrier.offsetHeight, 2);
      for (let distance = 0; distance <= length; distance += 0.75) {
        points.push({
          x: startX + directionX * distance,
          y: startY + directionY * distance,
          radius: Math.max(1, stroke / 2),
          source: "static-authored-carrier",
        });
      }
    }

    const intersections = [];
    let minimumClearance = Number.POSITIVE_INFINITY;
    for (const point of points) {
      for (const glyph of glyphs) {
        const nearestX = Math.max(glyph.left, Math.min(point.x, glyph.right));
        const nearestY = Math.max(glyph.top, Math.min(point.y, glyph.bottom));
        const clearance = Math.hypot(point.x - nearestX, point.y - nearestY) - point.radius;
        minimumClearance = Math.min(minimumClearance, clearance);
        if (clearance <= 0 && intersections.length < 200) {
          intersections.push({
            x: Number(point.x.toFixed(2)),
            y: Number(point.y.toFixed(2)),
            carrierSource: point.source,
            textElement: glyph.element,
            text: glyph.text,
            character: glyph.character,
          });
        }
      }
    }
    const unique = [];
    const seen = new Set();
    for (const intersection of intersections) {
      const key = `${intersection.textElement}:${intersection.character}:${intersection.x}:${intersection.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(intersection);
    }
    return {
      status: unique.length > 0 ? "FAIL" : "PASS",
      applicable: points.length > 0,
      mode: root.dataset.territoryMode ?? null,
      state: root.dataset.territoryState ?? null,
      viewport: { width: innerWidth, height: innerHeight },
      scrollY,
      glyphRectCount: glyphs.length,
      sampledCarrierPointCount: points.length,
      minimumClearancePx: Number.isFinite(minimumClearance) ? Number(minimumClearance.toFixed(2)) : null,
      intersectionCount: unique.length,
      intersections: unique,
      methodology: "Non-whitespace character Range boxes are inset to approximate glyph-bearing ink; the live SVG path uses getScreenCTM/getPointAtLength and static carriers use their transformed line axis. Stroke radius participates in collision distance.",
    };
  });
}

async function sweepCarrierTextClearance(page, geometry, timeoutMs) {
  const records = [];
  const failures = [];
  for (const [state, [start, end]] of Object.entries(TERRITORY_STATE_RANGES)) {
    const progresses = new Set([
      Number((start + 0.002).toFixed(4)),
      Number(((start + end) / 2).toFixed(4)),
      Number((end - 0.002).toFixed(4)),
    ]);
    for (let progress = start + 0.01; progress < end - 0.005; progress += 0.01) {
      progresses.add(Number(progress.toFixed(4)));
    }
    for (const progress of [...progresses].sort((left, right) => left - right)) {
      const settlement = await scrollToProgress(page, geometry, { state, progress }, timeoutMs);
      const clearance = await inspectCarrierTextClearance(page);
      records.push({ state, progress, settlement, clearance });
      if (settlement.status === "FAIL" || clearance.status === "FAIL") {
        failures.push({ state, progress, scrollY: clearance.scrollY, intersections: clearance.intersections });
      }
    }
  }
  const directScrollProbes = [];
  for (const probe of CANONICAL_1280_CARRIER_PROBES) {
    await page.evaluate((top) => window.__phase7cQa.nativeScrollTo(top), probe.scrollY);
    const settlement = await waitForControllerSettled(page, timeoutMs);
    const clearance = await inspectCarrierTextClearance(page);
    const atRequestedScroll = Math.abs(clearance.scrollY - probe.scrollY) <= 1;
    const record = { ...probe, atRequestedScroll, settlement, clearance };
    directScrollProbes.push(record);
    if (settlement.status === "FAIL" || !atRequestedScroll || clearance.status === "FAIL") {
      failures.push({
        kind: "direct-scroll-probe",
        requestedScrollY: probe.scrollY,
        actualScrollY: clearance.scrollY,
        observedStage: probe.observedStage,
        actualState: clearance.state,
        intersections: clearance.intersections,
      });
    }
  }
  return {
    viewport: { width: 1280, height: 720 },
    sampling: "Every macro-state start+0.002, midpoint, end-0.002, plus 0.01 progress increments; every point is predicate-settled before glyph/carrier geometry is sampled. Four independently observed absolute-scroll positions are then replayed exactly and retained whether clear or failing.",
    sampleCount: records.length + directScrollProbes.length,
    status: failures.length === 0 ? "PASS" : "FAIL",
    failures,
    records,
    directScrollProbes,
  };
}

export function recordingSpecifications(engine) {
  const prefix = engine === "webkit" ? "webkit-proxy" : engine;
  const visualPaths = {
    "full-forward-journey": `videos/${prefix}/01-full-forward-journey.webm`,
    "complete-reverse-journey": `videos/${prefix}/02-complete-reverse-journey.webm`,
    "authored-stop-states": `videos/${prefix}/03-authored-stop-states.webm`,
    "fast-forward-immediate-reverse": `videos/${prefix}/04-fast-forward-immediate-reverse.webm`,
    "desktop-responsive-authority": `videos/${prefix}/05-desktop-responsive-authority.webm`,
    "mobile-390-forward-reverse": `videos/${prefix}/06-mobile-390-forward-reverse.webm`,
    "narrow-short-landscape": `videos/${prefix}/07-narrow-short-landscape.webm`,
    "reduced-motion-resolved-states": `videos/${prefix}/08-reduced-motion-resolved-states.webm`,
    "no-javascript-semantic-territories": `videos/${prefix}/09-no-javascript-semantic-territories.webm`,
  };
  return PHASE7C_RECORDING_SCENARIOS.map((scenario) => {
    if (visualPaths[scenario]) {
      return {
        scenario,
        engineAuthority: ENGINE_EVIDENCE[engine],
        captureKind: "scenario-specific-video",
        evidencePath: visualPaths[scenario],
        artifactReuse: false,
      };
    }
    if (scenario === "installed-chrome-200-percent") {
      return {
        scenario,
        engineAuthority: "Separate installed-Google-Chrome browser-native zoom authority",
        captureKind: "external-native-zoom-recording",
        evidencePath: engine === "chromium" ? "external-recordings/10-installed-chrome-200-percent.mp4" : null,
        status: "NOT OBSERVED",
        artifactReuse: false,
        rootSidePlan: "Bind the separately generated installed-Chrome native-200 artifact after verifying browser chrome, zoom telemetry, URL, and the exact revision. Never substitute viewport or CSS scaling.",
      };
    }
    return {
      scenario,
      engineAuthority: ENGINE_EVIDENCE[engine],
      captureKind: "structured-report",
      evidencePath: `${REPORT_FILE}#${scenario}`,
      artifactReuse: false,
    };
  });
}

export function validateMemoryTrend(samples) {
  const values = (Array.isArray(samples) ? samples : []).filter(Number.isFinite);
  if (values.length < 2) {
    return {
      status: "LIMITATION",
      samples: values,
      reason: "Precise heap telemetry is unavailable or insufficient for a trend assertion.",
    };
  }
  const baseline = values[0];
  const end = values.at(-1);
  const count = values.length;
  const meanX = (count - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / count;
  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    numerator += (index - meanX) * (value - meanY);
    denominator += (index - meanX) ** 2;
  });
  const slopeBytesPerCycle = denominator === 0 ? 0 : numerator / denominator;
  const endGrowthBytes = end - baseline;
  const growthBudgetBytes = Math.max(MEMORY_ABSOLUTE_GROWTH_BUDGET, baseline * 0.25);
  const slopeBudgetBytesPerCycle = Math.max(MEMORY_SLOPE_BUDGET_PER_CYCLE, baseline * 0.02);
  const checks = {
    endGrowthBounded: endGrowthBytes <= growthBudgetBytes,
    slopeBounded: slopeBytesPerCycle <= slopeBudgetBytesPerCycle,
  };
  return {
    status: honestStatus(checks),
    samples: values,
    baselineBytes: baseline,
    endBytes: end,
    minimumBytes: Math.min(...values),
    maximumBytes: Math.max(...values),
    endGrowthBytes,
    slopeBytesPerCycle,
    growthBudgetBytes,
    slopeBudgetBytesPerCycle,
    checks,
    rationale: "The ten-cycle heap endpoint must remain within 8 MiB or 25% of baseline, and its least-squares slope within 1 MiB/cycle or 2% of baseline. Negative growth always remains within budget.",
  };
}

export function validatePortableReport(report) {
  const text = JSON.stringify(report);
  const failures = [];
  if (report.schema !== SCHEMA) failures.push("schema mismatch");
  if (!/^[0-9a-f]{40}$/.test(report.revision ?? "")) failures.push("invalid revision");
  if (/[A-Za-z]:\\|\/Users\/|file:\/\//i.test(text)) failures.push("private local path present");
  if (/"(?:password|private[_-]?key)"\s*:|"authorization"\s*:\s*"bearer/i.test(text)) {
    failures.push("possible secret-bearing key present");
  }
  const gates = report.humanGates ?? [];
  if (
    gates.length !== PHASE7C_HUMAN_GATES.length
    || gates.some((gate, index) => gate.name !== PHASE7C_HUMAN_GATES[index] || gate.status !== "PENDING HUMAN REVIEW")
  ) {
    failures.push("human gates are not authoritative and pending");
  }
  return { status: failures.length === 0 ? "PASS" : "FAIL", failures };
}

function browserInstrumentation() {
  const qa = {
    version: 1,
    pendingRafs: new Set(),
    intervals: new Set(),
    listeners: [],
    observers: [],
    layoutShifts: [],
    longTasks: [],
    runtimeScrollWrites: [],
    boundaries: [],
    carrierReference: null,
    documentReference: document,
  };

  const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
  const nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  const nativeSetInterval = window.setInterval.bind(window);
  const nativeClearInterval = window.clearInterval.bind(window);
  const nativeAddEventListener = EventTarget.prototype.addEventListener;
  const nativeRemoveEventListener = EventTarget.prototype.removeEventListener;
  const nativeScrollTo = window.scrollTo.bind(window);
  const nativeScrollBy = window.scrollBy.bind(window);
  const nativeScrollIntoView = Element.prototype.scrollIntoView;

  window.requestAnimationFrame = (callback) => {
    let id = 0;
    id = nativeRequestAnimationFrame((time) => {
      qa.pendingRafs.delete(id);
      callback(time);
    });
    qa.pendingRafs.add(id);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    qa.pendingRafs.delete(id);
    return nativeCancelAnimationFrame(id);
  };
  window.setInterval = (callback, delay, ...args) => {
    const id = nativeSetInterval(callback, delay, ...args);
    qa.intervals.add(id);
    return id;
  };
  window.clearInterval = (id) => {
    qa.intervals.delete(id);
    return nativeClearInterval(id);
  };
  EventTarget.prototype.addEventListener = function addEventListener(type, listener, options) {
    qa.listeners.push({ target: this, type, listener, options, removed: false });
    return nativeAddEventListener.call(this, type, listener, options);
  };
  EventTarget.prototype.removeEventListener = function removeEventListener(type, listener, options) {
    for (let index = qa.listeners.length - 1; index >= 0; index -= 1) {
      const entry = qa.listeners[index];
      if (!entry.removed && entry.target === this && entry.type === type && entry.listener === listener) {
        entry.removed = true;
        break;
      }
    }
    return nativeRemoveEventListener.call(this, type, listener, options);
  };

  for (const name of ["ResizeObserver", "IntersectionObserver", "MutationObserver"]) {
    const NativeObserver = window[name];
    if (typeof NativeObserver !== "function") continue;
    window[name] = class InstrumentedObserver extends NativeObserver {
      constructor(...args) {
        super(...args);
        qa.observers.push({ name, instance: this, disconnected: false });
      }
      disconnect() {
        const record = qa.observers.find((entry) => entry.instance === this);
        if (record) record.disconnected = true;
        return super.disconnect();
      }
    };
  }

  const recordScrollWrite = (method, args) => {
    qa.runtimeScrollWrites.push({ method, at: performance.now(), args: [...args].slice(0, 2) });
  };
  window.scrollTo = (...args) => {
    recordScrollWrite("window.scrollTo", args);
    return nativeScrollTo(...args);
  };
  window.scrollBy = (...args) => {
    recordScrollWrite("window.scrollBy", args);
    return nativeScrollBy(...args);
  };
  Element.prototype.scrollIntoView = function scrollIntoView(...args) {
    recordScrollWrite("Element.scrollIntoView", args);
    return nativeScrollIntoView.apply(this, args);
  };

  const NativePerformanceObserver = window.PerformanceObserver;
  const observePerformance = (type, destination) => {
    if (typeof NativePerformanceObserver !== "function") return false;
    try {
      const supported = NativePerformanceObserver.supportedEntryTypes ?? [];
      if (!supported.includes(type)) return false;
      const observer = new NativePerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (type === "layout-shift") {
            destination.push({
              startTime: entry.startTime,
              value: entry.value,
              hadRecentInput: entry.hadRecentInput,
              sources: [...(entry.sources ?? [])].map((source) => ({
                node: source.node instanceof Element
                  ? `${source.node.tagName.toLowerCase()}${source.node.id ? `#${source.node.id}` : ""}`
                  : null,
                previousRect: source.previousRect ? { ...source.previousRect.toJSON?.() } : null,
                currentRect: source.currentRect ? { ...source.currentRect.toJSON?.() } : null,
              })),
            });
          } else {
            destination.push({ startTime: entry.startTime, duration: entry.duration, name: entry.name });
          }
        }
      });
      observer.observe({ type, buffered: true });
      return true;
    } catch {
      return false;
    }
  };

  qa.layoutShiftSupported = observePerformance("layout-shift", qa.layoutShifts);
  qa.longTaskSupported = observePerformance("longtask", qa.longTasks);
  qa.nativeScrollTo = (top) => nativeScrollTo({ top, left: 0, behavior: "instant" });
  qa.resetRuntimeWrites = () => { qa.runtimeScrollWrites.length = 0; };
  qa.setCarrierReference = () => {
    qa.carrierReference = document.querySelector("[data-territory-carrier]");
    return qa.carrierReference instanceof Element;
  };
  qa.sameCarrier = () => qa.carrierReference != null
    && qa.carrierReference === document.querySelector("[data-territory-carrier]");
  qa.sameDocument = () => qa.documentReference === document;
  qa.beginBoundary = (label) => {
    const boundary = {
      label,
      timestamp: performance.now(),
      preBoundaryCumulativeCls: qa.layoutShifts
        .filter((entry) => !entry.hadRecentInput)
        .reduce((sum, entry) => sum + entry.value, 0),
      layoutShiftCount: qa.layoutShifts.length,
      longTaskCount: qa.longTasks.length,
    };
    qa.boundaries.push(boundary);
    return boundary;
  };
  qa.measureBoundary = (boundary) => {
    const included = qa.layoutShifts.filter(
      (entry) => !entry.hadRecentInput && entry.startTime >= boundary.timestamp,
    );
    const excluded = qa.layoutShifts.filter(
      (entry) => !entry.hadRecentInput && entry.startTime < boundary.timestamp,
    );
    const longTasks = qa.longTasks.filter((entry) => entry.startTime >= boundary.timestamp);
    return {
      boundaryTimestamp: boundary.timestamp,
      cycleStartTimestamp: boundary.timestamp,
      preBoundaryCumulativeCls: boundary.preBoundaryCumulativeCls,
      includedLayoutShifts: included,
      excludedPreBoundaryEntries: excluded,
      cycleAttributableCls: included.reduce((sum, entry) => sum + entry.value, 0),
      postCycleCumulativeCls: qa.layoutShifts
        .filter((entry) => !entry.hadRecentInput)
        .reduce((sum, entry) => sum + entry.value, 0),
      attributableLongTasks: longTasks,
    };
  };
  qa.snapshot = () => ({
    pendingRafCount: qa.pendingRafs.size,
    intervalCount: qa.intervals.size,
    listenerCount: qa.listeners.filter((entry) => !entry.removed).length,
    listenerAdds: qa.listeners.length,
    observerCount: qa.observers.filter((entry) => !entry.disconnected).length,
    runtimeScrollWrites: [...qa.runtimeScrollWrites],
    layoutShiftSupported: qa.layoutShiftSupported,
    longTaskSupported: qa.longTaskSupported,
    memoryBytes: performance.memory?.usedJSHeapSize ?? null,
    sameCarrier: qa.sameCarrier(),
    sameDocument: qa.sameDocument(),
  });

  Object.defineProperty(window, "__phase7cQa", { value: qa, configurable: false });
}

async function addInstrumentation(context) {
  await context.addInitScript(browserInstrumentation);
}

export async function waitForFontsLoaded(page, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const started = Date.now();
  await page.waitForFunction(
    () => !document.fonts || document.fonts.status === "loaded",
    null,
    { timeout: timeoutMs },
  );
  return { settled: true, settlementMs: Date.now() - started, predicate: "document.fonts.status === loaded" };
}

async function settleAfterPaint(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function gotoHome(page, baseUrl, timeoutMs) {
  const response = await page.goto(`${baseUrl}/#entry`, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  if (!response || response.status() >= 400) {
    throw new Error(`Home navigation failed with status ${response?.status() ?? "none"}.`);
  }
  await page.waitForSelector("[data-territory-traverse]", { state: "attached", timeout: timeoutMs });
  const fontSettlement = await waitForFontsLoaded(page, timeoutMs);
  const started = Date.now();
  await page.waitForFunction(
    () => {
      const root = document.querySelector("[data-territory-traverse]");
      if (!(root instanceof HTMLElement)) return false;
      if (!window.__phase7cQa) return true;
      return root.dataset.territoryMode !== "enhanced"
        || (root.dataset.territoryProjection === "settled" && root.dataset.territoryRaf === "idle");
    },
    null,
    { timeout: timeoutMs },
  );
  return {
    status: response.status(),
    fontSettlement,
    entrySettlementMs: Date.now() - started,
    predicate: "Territory attached and its dormant controller projection settled before chapter entry",
  };
}

async function territoryGeometry(page) {
  return page.evaluate(() => {
    const runway = document.querySelector("[data-territory-runway]");
    if (!(runway instanceof HTMLElement)) return null;
    const rect = runway.getBoundingClientRect();
    const start = window.scrollY + rect.top;
    const travel = Math.max(1, rect.height - window.innerHeight);
    return { start, travel, height: rect.height, viewportHeight: window.innerHeight };
  });
}

async function operatingFieldGeometry(page) {
  return page.evaluate(() => {
    const field = document.querySelector("[data-operating-field]");
    if (!(field instanceof HTMLElement)) return null;
    const rect = field.getBoundingClientRect();
    return {
      start: window.scrollY + rect.top,
      travel: Math.max(1, rect.height - window.innerHeight),
      height: rect.height,
      viewportHeight: window.innerHeight,
    };
  });
}

async function scrollToDecide(page, timeoutMs) {
  const geometry = await operatingFieldGeometry(page);
  if (!geometry) throw new Error("Accepted Phase 7B Operating Field geometry is unavailable.");
  const requestedProgress = 0.92;
  const started = Date.now();
  await page.evaluate(
    ({ top }) => window.__phase7cQa.nativeScrollTo(top),
    { top: geometry.start + geometry.travel * requestedProgress },
  );
  await page.waitForFunction(({ progress }) => {
    const field = document.querySelector("[data-operating-field]");
    const actual = Number.parseFloat(field?.getAttribute("data-method-progress") ?? "NaN");
    return field instanceof HTMLElement
      && field.dataset.methodState === "decide"
      && Math.abs(actual - progress) <= 0.025
      && field.dataset.methodProbe === "settled"
      && !field.closest("[inert]")
      && (!document.fonts || document.fonts.status === "loaded");
  }, { progress: requestedProgress }, { timeout: timeoutMs });
  await settleAfterPaint(page);
  const snapshot = await page.evaluate(() => {
    const field = document.querySelector("[data-operating-field]");
    return {
      state: field?.getAttribute("data-method-state") ?? null,
      progress: Number.parseFloat(field?.getAttribute("data-method-progress") ?? "NaN"),
      mode: field?.getAttribute("data-method-mode") ?? null,
      probe: field?.getAttribute("data-method-probe") ?? null,
      inert: Boolean(field?.closest("[inert]")),
      scrollY: window.scrollY,
    };
  });
  return {
    requestedState: "Phase 7B DECIDE",
    requestedProgress,
    settlementMs: Date.now() - started,
    timeoutMs,
    snapshot,
    status: snapshot.state === "decide"
      && Math.abs(snapshot.progress - requestedProgress) <= 0.025
      && snapshot.probe === "settled"
      && !snapshot.inert
      ? "PASS"
      : "FAIL",
  };
}

async function settleMaradinAperture(page, timeoutMs) {
  const started = Date.now();
  await page.evaluate(() => {
    const aperture = document.querySelector("[data-proof-threshold]");
    if (!(aperture instanceof HTMLElement)) throw new Error("Maradin Proof aperture is missing.");
    const rect = aperture.getBoundingClientRect();
    const top = Math.max(0, window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2);
    window.__phase7cQa.nativeScrollTo(top);
  });
  await page.waitForFunction(() => {
    const root = document.querySelector("[data-territory-traverse]");
    const aperture = document.querySelector("[data-proof-threshold]");
    const title = aperture?.querySelector("[data-proof-title]");
    const link = aperture?.querySelector("a[href='/pocs/maradin/']");
    const image = aperture?.querySelector("img");
    const visible = (element) => {
      if (!(element instanceof Element)) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0
        && rect.bottom > 0 && rect.top < innerHeight
        && rect.right > 0 && rect.left < innerWidth
        && style.display !== "none" && style.visibility !== "hidden";
    };
    return root?.getAttribute("data-territory-state") === "proof"
      && root?.getAttribute("data-territory-projection") === "settled"
      && root?.getAttribute("data-territory-raf") === "idle"
      && !root.closest("[inert]")
      && visible(aperture)
      && visible(title)
      && visible(link)
      && image instanceof HTMLImageElement
      && image.complete
      && image.naturalWidth === 1920
      && image.naturalHeight === 1080;
  }, null, { timeout: timeoutMs });
  const snapshot = await page.evaluate(() => {
    const aperture = document.querySelector("[data-proof-threshold]");
    const root = document.querySelector("[data-territory-traverse]");
    const image = aperture?.querySelector("img");
    const rect = aperture?.getBoundingClientRect();
    return {
      state: root?.getAttribute("data-territory-state") ?? null,
      progress: Number.parseFloat(root?.getAttribute("data-territory-progress") ?? "NaN"),
      projection: root?.getAttribute("data-territory-projection") ?? null,
      raf: root?.getAttribute("data-territory-raf") ?? null,
      apertureRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      title: aperture?.querySelector("[data-proof-title]")?.textContent.trim() ?? null,
      link: aperture?.querySelector("a")?.getAttribute("href") ?? null,
      poster: image instanceof HTMLImageElement
        ? { complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight }
        : null,
      scrollY: window.scrollY,
    };
  });
  return {
    requestedState: "Maradin documentary aperture settled",
    settlementMs: Date.now() - started,
    timeoutMs,
    snapshot,
    status: snapshot.state === "proof"
      && snapshot.projection === "settled"
      && snapshot.raf === "idle"
      && snapshot.title === PHASE7C_PROOF_TITLE
      && snapshot.link === "/pocs/maradin/"
      && snapshot.poster?.naturalWidth === 1920
      ? "PASS"
      : "FAIL",
  };
}

async function holdStableState(page, specification, holdMs = STOP_HOLD_MS) {
  const label = specification.label;
  const started = await page.evaluate(() => performance.now());
  const deadline = started + holdMs;
  const handle = await page.waitForFunction(({ expected, stopAt, sampleLabel }) => {
    const qa = window.__phase7cQa;
    qa.stopHoldSamples ??= {};
    qa.stopHoldSamples[sampleLabel] ??= [];
    const root = expected.scope === "method"
      ? document.querySelector("[data-operating-field]")
      : document.querySelector("[data-territory-traverse]");
    const state = expected.scope === "method"
      ? root?.getAttribute("data-method-state")
      : root?.getAttribute("data-territory-state");
    const progress = Number.parseFloat(expected.scope === "method"
      ? root?.getAttribute("data-method-progress") ?? "NaN"
      : root?.getAttribute("data-territory-progress") ?? "NaN");
    const track = document.querySelector("[data-territory-track]");
    const carrier = document.querySelector("[data-territory-carrier]");
    const aperture = document.querySelector("[data-proof-threshold]");
    const fingerprint = JSON.stringify({
      state,
      progress,
      rootStyle: root?.getAttribute("style") ?? "",
      projection: root?.getAttribute("data-territory-projection") ?? null,
      raf: root?.getAttribute("data-territory-raf") ?? null,
      probe: root?.getAttribute("data-method-probe") ?? null,
      trackTransform: track instanceof Element ? getComputedStyle(track).transform : null,
      carrierOpacity: carrier instanceof Element ? getComputedStyle(carrier).opacity : null,
      carrierStrokeWidth: carrier instanceof Element ? getComputedStyle(carrier).strokeWidth : null,
      apertureOpacity: aperture instanceof Element ? getComputedStyle(aperture).opacity : null,
      apertureTransform: aperture instanceof Element ? getComputedStyle(aperture).transform : null,
    });
    qa.stopHoldSamples[sampleLabel].push({
      at: performance.now(),
      state,
      progress,
      fingerprint,
      pendingRafCount: qa.pendingRafs.size,
    });
    return performance.now() >= stopAt;
  }, {
    expected: { scope: specification.scope, state: specification.state, progress: specification.progress },
    stopAt: deadline,
    sampleLabel: label,
  }, { polling: 100, timeout: holdMs + 5_000 });
  await handle.dispose();
  const completed = await page.evaluate((sampleLabel) => ({
    endedAt: performance.now(),
    samples: window.__phase7cQa.stopHoldSamples[sampleLabel] ?? [],
  }), label);
  const fingerprints = dedupe(completed.samples.map((sample) => sample.fingerprint));
  const states = dedupe(completed.samples.map((sample) => sample.state));
  const progressValues = completed.samples.map((sample) => sample.progress);
  const checks = {
    actualMultiSecondHold: completed.endedAt - started >= holdMs,
    sampledThroughout: completed.samples.length >= Math.floor(holdMs / 250),
    exactState: states.length === 1 && states[0] === specification.state,
    progressStable: progressValues.every((value) => Math.abs(value - specification.progress) <= 0.025),
    projectionFingerprintStable: fingerprints.length === 1,
    noPendingRaf: completed.samples.every((sample) => sample.pendingRafCount === 0),
  };
  return {
    label,
    scope: specification.scope,
    requestedState: specification.state,
    requestedProgress: specification.progress,
    holdMs,
    actualHoldMs: completed.endedAt - started,
    sampleCount: completed.samples.length,
    samples: completed.samples,
    uniqueFingerprintCount: fingerprints.length,
    checks,
    status: honestStatus(checks),
  };
}

async function waitForControllerSettled(page, timeoutMs, expected = {}) {
  const started = Date.now();
  await page.waitForFunction(
    ({ expectedState, expectedProgress, tolerance }) => {
      const root = document.querySelector("[data-territory-traverse]");
      if (!(root instanceof HTMLElement)) return false;
      const mode = root.dataset.territoryMode ?? "static";
      const progress = Number.parseFloat(root.dataset.territoryProgress ?? "0");
      return (!expectedState || root.dataset.territoryState === expectedState)
        && (expectedProgress == null || Math.abs(progress - expectedProgress) <= tolerance)
        && (mode !== "enhanced" || root.dataset.territoryProjection === "settled")
        && (mode !== "enhanced" || root.dataset.territoryRaf === "idle")
        && (!document.fonts || document.fonts.status === "loaded")
        && !root.closest("[inert]")
        && document.querySelectorAll("[data-territory-carrier]").length === 1
        && document.querySelectorAll("[data-territory-track]").length === 1;
    },
    {
      expectedState: expected.state ?? null,
      expectedProgress: expected.progress ?? null,
      tolerance: expected.progressTolerance ?? 0.025,
    },
    { timeout: timeoutMs },
  );
  const snapshot = await settlementSnapshot(page);
  const validation = validateSettlementSnapshot(snapshot, expected);
  return {
    settlementMs: Date.now() - started,
    timeoutMs,
    predicateComponents: validation.checks,
    ...snapshot,
    status: validation.status,
  };
}

async function settlementSnapshot(page) {
  return page.evaluate(() => {
    const root = document.querySelector("[data-territory-traverse]");
    return {
      rootPresent: root instanceof HTMLElement,
      mode: root?.dataset.territoryMode ?? null,
      state: root?.dataset.territoryState ?? null,
      progress: Number.parseFloat(root?.dataset.territoryProgress ?? "NaN"),
      projection: root?.dataset.territoryProjection ?? null,
      raf: root?.dataset.territoryRaf ?? null,
      fontsLoaded: !document.fonts || document.fonts.status === "loaded",
      backgroundInert: Boolean(root?.closest("[inert]")),
      carrierCount: document.querySelectorAll("[data-territory-carrier]").length,
      trackCount: document.querySelectorAll("[data-territory-track]").length,
      activeElement: document.activeElement instanceof Element
        ? `${document.activeElement.tagName.toLowerCase()}${document.activeElement.id ? `#${document.activeElement.id}` : ""}`
        : null,
      scrollY: window.scrollY,
    };
  });
}

async function scrollToProgress(page, geometry, sample, timeoutMs) {
  await page.evaluate(
    ({ top }) => window.__phase7cQa.nativeScrollTo(top),
    { top: geometry.start + geometry.travel * sample.progress },
  );
  return waitForControllerSettled(page, timeoutMs, sample);
}

async function scrollElementToCenter(page, selector, timeoutMs) {
  await page.evaluate((selected) => {
    const element = document.querySelector(selected);
    if (!(element instanceof Element)) throw new Error(`Missing selector ${selected}`);
    const rect = element.getBoundingClientRect();
    const top = Math.max(0, window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2);
    window.__phase7cQa?.nativeScrollTo
      ? window.__phase7cQa.nativeScrollTo(top)
      : window.scrollTo({ top, left: 0, behavior: "instant" });
  }, selector);
  return waitForControllerSettled(page, timeoutMs);
}

function expectedMode(viewport, reducedMotion = false) {
  return viewport.width > 640 && viewport.height > 480 && !reducedMotion ? "enhanced" : "static";
}

async function inspectResponsiveState(page, selector) {
  return page.evaluate(({ selected, expectedNames, expectedProof }) => {
    const visible = (element) => {
      if (!(element instanceof Element)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const title = document.querySelector(selected);
    const titleRect = title?.getBoundingClientRect() ?? null;
    const titleRange = title ? document.createRange() : null;
    if (titleRange && title) titleRange.selectNodeContents(title);
    const glyphRect = titleRange?.getBoundingClientRect() ?? null;
    const lineRects = titleRange
      ? [...titleRange.getClientRects()].map((rect) => ({
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left,
      }))
      : [];
    const clippingAncestors = [];
    for (let ancestor = title?.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      const clipsX = ["hidden", "clip", "auto", "scroll"].includes(style.overflowX);
      const clipsY = ["hidden", "clip", "auto", "scroll"].includes(style.overflowY);
      if (clipsX || clipsY) {
        const rect = ancestor.getBoundingClientRect();
        clippingAncestors.push({ clipsX, clipsY, rect });
      }
    }
    const outsideClipAncestor = Boolean(glyphRect && clippingAncestors.some(({ clipsX, clipsY, rect }) => (
      (clipsX && (glyphRect.left < rect.left - 1 || glyphRect.right > rect.right + 1))
      || (clipsY && (glyphRect.top < rect.top - 1 || glyphRect.bottom > rect.bottom + 1))
    )));
    const outsideViewport = Boolean(glyphRect && (
      glyphRect.left < -1 || glyphRect.right > window.innerWidth + 1
      || glyphRect.top < -1 || glyphRect.bottom > window.innerHeight + 1
    ));
    const titleClipped = outsideClipAncestor || outsideViewport;
    const internallyBrokenWords = [];
    if (title) {
      const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (const match of node.data.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          if (range.getClientRects().length > 1) internallyBrokenWords.push(match[0]);
        }
      }
    }
    const root = document.querySelector("[data-territory-traverse]");
    const fallbacks = [...document.querySelectorAll("[data-territory-static]")];
    const territoryNames = [...document.querySelectorAll("[data-territory-stage]:not([data-territory-stage='proof']) [data-territory-title]")]
      .map((entry) => entry.textContent.trim());
    const proofTitle = document.querySelector("[data-proof-title]")?.textContent.trim() ?? null;
    const poster = document.querySelector("[data-proof-record='maradin'] img");
    const proofLink = document.querySelector("[data-proof-record='maradin'] a[href]");
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      mode: root?.dataset.territoryMode ?? "static",
      state: root?.dataset.territoryState ?? null,
      territoryCount: territoryNames.length,
      territoryNames,
      expectedNames,
      proofTitle,
      expectedProof,
      carrierCount: document.querySelectorAll("[data-territory-carrier]").length,
      trackCount: document.querySelectorAll("[data-territory-track]").length,
      staticFallbackCount: fallbacks.length,
      visibleStaticFallbackCount: fallbacks.filter(visible).length,
      titleSelector: selected,
      titleVisible: visible(title)
        && titleRect.bottom > 0
        && titleRect.top < window.innerHeight
        && titleRect.right > 0
        && titleRect.left < window.innerWidth,
      titleClipped,
      titleRect: titleRect ? {
        x: titleRect.x,
        y: titleRect.y,
        width: titleRect.width,
        height: titleRect.height,
      } : null,
      glyphRect: glyphRect ? {
        x: glyphRect.x,
        y: glyphRect.y,
        width: glyphRect.width,
        height: glyphRect.height,
      } : null,
      lineRects,
      clippingAncestorCount: clippingAncestors.length,
      outsideClipAncestor,
      outsideViewport,
      internallyBrokenWords,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      territoryVideoCount: root?.querySelectorAll("video, source").length ?? 0,
      proofRecordCount: root?.querySelectorAll("[data-proof-record]").length ?? 0,
      posterCount: root?.querySelectorAll("img[src='/media/maradin/maradin-field-aperture-poster-approved.jpg']").length ?? 0,
      poster: poster instanceof HTMLImageElement ? {
        width: poster.getAttribute("width"),
        height: poster.getAttribute("height"),
        loading: poster.loading,
        alt: poster.alt,
      } : null,
      proofHref: proofLink?.getAttribute("href") ?? null,
    };
  }, { selected: selector, expectedNames: PHASE7C_INDUSTRY_NAMES, expectedProof: PHASE7C_PROOF_TITLE });
}

async function screenshot(page, outputRoot, relativePath) {
  const destination = path.join(outputRoot, ...relativePath.split("/"));
  if (!within(outputRoot, destination)) throw new Error("Unsafe screenshot path.");
  await mkdir(path.dirname(destination), { recursive: true });
  await page.screenshot({ path: destination, animations: "disabled" });
  const metadata = await sharp(destination).metadata();
  const bytes = await readFile(destination);
  return {
    path: normalizeSlashes(path.relative(outputRoot, destination)),
    bytes: bytes.length,
    sha256: sha256(bytes),
    decode: metadata.format === "png" && metadata.width > 0 && metadata.height > 0 ? "PASS" : "FAIL",
    width: metadata.width,
    height: metadata.height,
  };
}

async function finalizeVideo(video, rawDirectory, outputRoot, relativePath) {
  const destination = path.join(outputRoot, ...relativePath.split("/"));
  if (!within(outputRoot, destination)) throw new Error("Unsafe video path.");
  await mkdir(path.dirname(destination), { recursive: true });
  const limitations = [];
  try {
    if (!video) throw new Error("Playwright did not provide a video handle.");
    await video.saveAs(destination);
    const bytes = await readFile(destination);
    const webmSignature = bytes.length >= 4
      && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
    return {
      status: webmSignature && bytes.length > 1_024 ? "PASS" : "FAIL",
      path: normalizeSlashes(path.relative(outputRoot, destination)),
      bytes: bytes.length,
      sha256: sha256(bytes),
      decode: webmSignature ? "PASS — EBML/WebM signature" : "FAIL",
      limitations,
    };
  } catch (error) {
    limitations.push(`Video capture unavailable: ${safeError(error)}`);
    return { status: "LIMITATION", path: null, bytes: null, sha256: null, decode: "NOT OBSERVED", limitations };
  } finally {
    if (within(outputRoot, rawDirectory)) await rm(rawDirectory, { recursive: true, force: true });
  }
}

async function captureScenarioVideo(
  browser,
  engine,
  configuration,
  scenario,
  { viewport = { width: 1280, height: 720 }, javaScriptEnabled = true, reducedMotion = "no-preference" } = {},
  action,
) {
  const prefix = engine === "webkit" ? "webkit-proxy" : engine;
  const rawDirectory = path.join(configuration.output, ".capture-video", prefix, scenario);
  await mkdir(rawDirectory, { recursive: true });
  const context = await browser.newContext({
    viewport,
    javaScriptEnabled,
    reducedMotion,
    recordVideo: { dir: rawDirectory, size: viewport },
  });
  if (javaScriptEnabled) await addInstrumentation(context);
  const page = await context.newPage();
  const video = page.video();
  const failures = [];
  let payload = null;
  try {
    payload = await action(page, context);
    failures.push(...(payload?.failures ?? []));
  } catch (error) {
    failures.push(safeError(error));
  } finally {
    await context.close();
  }
  const specification = recordingSpecifications(engine).find((entry) => entry.scenario === scenario);
  if (!specification?.evidencePath) {
    return {
      scenario,
      status: "NOT OBSERVED",
      failures,
      payload,
      artifact: null,
      limitation: "No in-runner visual artifact path is governed for this scenario.",
    };
  }
  const artifact = await finalizeVideo(video, rawDirectory, configuration.output, specification.evidencePath);
  return {
    scenario,
    status: failures.length > 0 ? "FAIL" : artifact.status,
    failures,
    payload,
    artifact,
  };
}

async function waitForRecordingBeat(page, minimumMs = 350) {
  const start = await page.evaluate(() => performance.now());
  const handle = await page.waitForFunction(
    (deadline) => performance.now() >= deadline,
    start + minimumMs,
    { polling: 50, timeout: minimumMs + 2_000 },
  );
  await handle.dispose();
  const end = await page.evaluate(() => performance.now());
  return { minimumMs, actualMs: end - start, predicate: "monotonic performance.now boundary" };
}

async function settlePhysicalFirstFrame(page, timeoutMs) {
  const started = Date.now();
  await page.evaluate(() => window.__phase7cQa.nativeScrollTo(0));
  await page.waitForFunction(() => {
    const shell = document.querySelector("[data-cinematic-shell]");
    return shell instanceof HTMLElement
      && shell.getAttribute("data-target-frame") === "1"
      && window.scrollY === 0;
  }, null, { timeout: timeoutMs });
  const snapshot = await page.evaluate(() => {
    const shell = document.querySelector("[data-cinematic-shell]");
    return {
      pathname: location.pathname,
      hash: location.hash,
      scrollY: window.scrollY,
      targetFrame: shell?.getAttribute("data-target-frame") ?? null,
      routeNavigation: shell?.getAttribute("data-route-navigation") ?? null,
      physicalInert: Boolean(shell?.closest("[inert]")),
    };
  });
  return {
    requestedState: "physical opening F1",
    settlementMs: Date.now() - started,
    timeoutMs,
    snapshot,
    status: snapshot.scrollY === 0 && snapshot.targetFrame === "1" ? "PASS" : "FAIL",
  };
}

async function targetInventory(page, route, viewport, state) {
  const observation = await observeTargetSizes(page, { route, viewport, state });
  const genuineFailures = observation.targetFailures.filter((failure) => failure.intendedInteractive !== false);
  return {
    status: observation.status,
    minimumCssPx: TARGET_MINIMUM_CSS_PX,
    inventory: observation.records,
    failures: genuineFailures,
    validExclusions: observation.validExclusions,
    unexplainedExclusions: observation.unexplainedExclusions,
    contractFailures: observation.contractFailures,
  };
}

async function responsiveCase(browser, engine, configuration) {
  const records = [];
  const artifacts = [];
  const failures = [];
  for (const viewport of PHASE7C_VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    await addInstrumentation(context);
    const page = await context.newPage();
    try {
      const navigation = await gotoHome(page, configuration.baseUrl, configuration.timeoutMs);
      const mode = expectedMode(viewport);
      const stageRecords = [];
      for (const sample of STABLE_STAGE_SAMPLES) {
        const selector = sample.state === "proof"
          ? "[data-proof-title]"
          : `[data-territory-stage='${sample.state}'] [data-territory-title]`;
        const settlement = await scrollElementToCenter(page, selector, configuration.timeoutMs);
        const snapshot = await inspectResponsiveState(page, selector);
        snapshot.carrierTextIntersection = await inspectCarrierTextClearance(page);
        const validation = validateResponsiveSnapshot(snapshot, viewport, mode);
        stageRecords.push({ sample, settlement, snapshot, validation });
        if (validation.status === "FAIL") {
          failures.push(`${viewport.id}/${sample.state}: ${Object.entries(validation.checks).filter(([, value]) => !value).map(([key]) => key).join(", ")}`);
        }
        if (sample.state === "manufacturing" || sample.state === "proof") {
          artifacts.push(await screenshot(
            page,
            configuration.output,
            `screenshots/${engine}/responsive/${viewport.id}-${sample.state}.png`,
          ));
        }
      }
      const targets = await targetInventory(page, "/#entry", viewport.id, "proof");
      if (targets.status === "FAIL") failures.push(`${viewport.id}: target-size failure`);
      records.push({ viewport, expectedMode: mode, navigation, stages: stageRecords, targets });
    } catch (error) {
      failures.push(`${viewport.id}: ${safeError(error)}`);
      records.push({ viewport, status: "FAIL", error: safeError(error) });
    } finally {
      await context.close();
    }
  }
  return { name: "responsive-and-short-landscape", status: failures.length ? "FAIL" : "PASS", failures, records, artifacts };
}

async function narrowLandscapeRecordingCase(browser, engine, configuration) {
  const run = await captureScenarioVideo(
    browser,
    engine,
    configuration,
    "narrow-short-landscape",
    { viewport: { width: 320, height: 800 } },
    async (page) => {
      const failures = [];
      const records = [];
      await gotoHome(page, configuration.baseUrl, configuration.timeoutMs);
      const viewports = PHASE7C_VIEWPORTS.filter((viewport) => (
        viewport.id === "320x800" || viewport.height <= 480
      ));
      for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.evaluate(() => {
          const title = document.querySelector("[data-territory-stage='manufacturing'] [data-territory-title]");
          const rect = title.getBoundingClientRect();
          const top = Math.max(0, scrollY + rect.top + rect.height / 2 - innerHeight / 2);
          window.__phase7cQa.nativeScrollTo(top);
        });
        await waitForControllerSettled(page, configuration.timeoutMs);
        const manufacturing = await inspectResponsiveState(page, "[data-territory-stage='manufacturing'] [data-territory-title]");
        manufacturing.carrierTextIntersection = await inspectCarrierTextClearance(page);
        const manufacturingValidation = validateResponsiveSnapshot(manufacturing, viewport, expectedMode(viewport));
        await scrollElementToCenter(page, "[data-proof-title]", configuration.timeoutMs);
        const proof = await inspectResponsiveState(page, "[data-proof-title]");
        proof.carrierTextIntersection = await inspectCarrierTextClearance(page);
        const proofValidation = validateResponsiveSnapshot(proof, viewport, expectedMode(viewport));
        if (manufacturingValidation.status === "FAIL" || proofValidation.status === "FAIL") failures.push(viewport.id);
        records.push({ viewport, manufacturing, manufacturingValidation, proof, proofValidation, beat: await waitForRecordingBeat(page, 550) });
      }
      return { failures, records };
    },
  );
  return {
    name: "narrow-short-landscape-recording",
    status: run.status,
    failures: run.failures,
    records: run.payload?.records ?? [],
    recording: run,
    artifacts: run.artifact ? [run.artifact] : [],
  };
}

async function projectionSnapshot(page) {
  return page.evaluate(() => {
    const root = document.querySelector("[data-territory-traverse]");
    const carrier = document.querySelector("[data-territory-carrier]");
    const carrierStyle = carrier instanceof SVGElement ? getComputedStyle(carrier) : null;
    const rootStyle = root instanceof HTMLElement ? getComputedStyle(root) : null;
    const projectionProperties = [
      "--territory-release",
      "--territory-automotive",
      "--territory-automotive-logistics",
      "--territory-routing",
      "--territory-logistics-manufacturing",
      "--territory-tolerance",
      "--territory-manufacturing-energy",
      "--territory-load",
      "--territory-registration",
      "--territory-proof",
      "--territory-track",
      "--territory-track-x",
      "--territory-field-noise",
      "--territory-carrier-weight",
      "--territory-automotive-residue",
      "--territory-logistics-residue",
      "--territory-manufacturing-residue",
    ];
    return {
      state: root?.dataset.territoryState ?? null,
      progress: Number.parseFloat(root?.dataset.territoryProgress ?? "NaN"),
      projection: root?.dataset.territoryProjection ?? null,
      raf: root?.dataset.territoryRaf ?? null,
      carrierPath: carrier?.getAttribute("d") ?? null,
      carrierDashOffset: carrierStyle?.strokeDashoffset ?? null,
      carrierOpacity: carrierStyle?.opacity ?? null,
      projectionProperties: Object.fromEntries(
        projectionProperties.map((property) => [property, rootStyle?.getPropertyValue(property).trim() ?? null]),
      ),
      sameCarrier: window.__phase7cQa.sameCarrier(),
      title: document.querySelector("[data-territory-stage][aria-current='step'] [data-territory-title]")?.textContent.trim() ?? null,
    };
  });
}

async function journeyCase(browser, engine, configuration) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await addInstrumentation(context);
  const page = await context.newPage();
  const failures = [];
  const artifacts = [];
  const forward = [];
  const reverse = [];
  let directSkip = null;
  let runtime = null;
  let forwardReverseEquality = null;
  let decideBeforeRelease = null;
  let decideAfterReverse = null;
  let maradinAperture = null;
  let carrierTextClearanceSweep = null;
  try {
    await gotoHome(page, configuration.baseUrl, configuration.timeoutMs);
    decideBeforeRelease = await scrollToDecide(page, configuration.timeoutMs);
    if (decideBeforeRelease.status === "FAIL") failures.push("Phase 7B DECIDE did not settle before Territory release");
    const geometry = await territoryGeometry(page);
    if (!geometry) throw new Error("Territory runway geometry unavailable.");
    await page.evaluate(() => {
      window.__phase7cQa.setCarrierReference();
      window.__phase7cQa.resetRuntimeWrites();
    });

    for (const sample of Object.values(PHASE7C_STATE_SAMPLES)) {
      const settlement = await scrollToProgress(page, geometry, sample, configuration.timeoutMs);
      const projection = await projectionSnapshot(page);
      const carrierTextIntersection = await inspectCarrierTextClearance(page);
      forward.push({ sample, settlement, projection, carrierTextIntersection });
      if (settlement.status === "FAIL" || !projection.sameCarrier) failures.push(`forward/${sample.state}`);
      if (carrierTextIntersection.status === "FAIL") failures.push(`forward/${sample.state}: live carrier intersects glyph-bearing text`);
      if (["automotive", "manufacturing", "energy", "proof"].includes(sample.state)) {
        artifacts.push(await screenshot(page, configuration.output, `screenshots/${engine}/journey/forward-${sample.state}.png`));
      }
    }
    maradinAperture = await settleMaradinAperture(page, configuration.timeoutMs);
    if (maradinAperture.status === "FAIL") failures.push("Maradin aperture did not settle after Territory progress 1");
    artifacts.push(await screenshot(page, configuration.output, `screenshots/${engine}/journey/maradin-aperture.png`));
    carrierTextClearanceSweep = await sweepCarrierTextClearance(page, geometry, configuration.timeoutMs);
    if (carrierTextClearanceSweep.status === "FAIL") failures.push("canonical 1280x720 carrier/glyph clearance sweep");
    for (const sample of [...Object.values(PHASE7C_STATE_SAMPLES)].reverse()) {
      const settlement = await scrollToProgress(page, geometry, sample, configuration.timeoutMs);
      const projection = await projectionSnapshot(page);
      const carrierTextIntersection = await inspectCarrierTextClearance(page);
      reverse.push({ sample, settlement, projection, carrierTextIntersection });
      if (settlement.status === "FAIL" || !projection.sameCarrier) failures.push(`reverse/${sample.state}`);
      if (carrierTextIntersection.status === "FAIL") failures.push(`reverse/${sample.state}: live carrier intersects glyph-bearing text`);
    }
    decideAfterReverse = await scrollToDecide(page, configuration.timeoutMs);
    if (decideAfterReverse.status === "FAIL") failures.push("Complete reverse did not return exactly to Phase 7B DECIDE");
    const reverseByState = new Map(reverse.map((entry) => [entry.sample.state, entry.projection]));
    const equalityRecords = forward.map((entry) => {
      const reversed = reverseByState.get(entry.sample.state);
      const keys = ["state", "progress", "carrierPath", "carrierDashOffset", "carrierOpacity", "projectionProperties"];
      const equal = keys.every((key) => JSON.stringify(entry.projection[key]) === JSON.stringify(reversed?.[key]));
      return { state: entry.sample.state, equal, forward: entry.projection, reverse: reversed };
    });
    forwardReverseEquality = {
      status: equalityRecords.every((entry) => entry.equal) ? "PASS" : "FAIL",
      records: equalityRecords,
    };
    if (forwardReverseEquality.status === "FAIL") failures.push("forward/reverse projection equality");

    const fastStartDecide = await scrollToDecide(page, configuration.timeoutMs);
    const firstSkip = await scrollToProgress(page, geometry, PHASE7C_STATE_SAMPLES.energy, configuration.timeoutMs);
    const immediateReverse = await scrollToDecide(page, configuration.timeoutMs);
    directSkip = { fastStartDecide, firstSkip, immediateReverse };
    if (fastStartDecide.status === "FAIL" || firstSkip.status === "FAIL" || immediateReverse.status === "FAIL") {
      failures.push("direct-skip/immediate-reversal");
    }
    runtime = await page.evaluate(() => window.__phase7cQa.snapshot());
    if (runtime.runtimeScrollWrites.length !== 0) failures.push("production runtime wrote scroll position");
    if (!runtime.sameCarrier) failures.push("persistent carrier identity changed");
  } catch (error) {
    failures.push(safeError(error));
  } finally {
    await context.close();
  }

  const videoRuns = [];
  videoRuns.push(await captureScenarioVideo(
    browser,
    engine,
    configuration,
    "full-forward-journey",
    {},
    async (recordingPage) => {
      const runFailures = [];
      await gotoHome(recordingPage, configuration.baseUrl, configuration.timeoutMs);
      const decide = await scrollToDecide(recordingPage, configuration.timeoutMs);
      await waitForRecordingBeat(recordingPage);
      const geometry = await territoryGeometry(recordingPage);
      await recordingPage.evaluate(() => window.__phase7cQa.setCarrierReference());
      const states = [];
      for (const sample of Object.values(PHASE7C_STATE_SAMPLES)) {
        const settlement = await scrollToProgress(recordingPage, geometry, sample, configuration.timeoutMs);
        const clearance = await inspectCarrierTextClearance(recordingPage);
        states.push({ sample, settlement, clearance, beat: await waitForRecordingBeat(recordingPage) });
        if (settlement.status === "FAIL" || clearance.status === "FAIL") runFailures.push(sample.state);
      }
      const aperture = await settleMaradinAperture(recordingPage, configuration.timeoutMs);
      await waitForRecordingBeat(recordingPage, 700);
      if (decide.status === "FAIL" || aperture.status === "FAIL") runFailures.push("DECIDE or Maradin aperture");
      return { failures: runFailures, decide, states, aperture };
    },
  ));
  videoRuns.push(await captureScenarioVideo(
    browser,
    engine,
    configuration,
    "complete-reverse-journey",
    {},
    async (recordingPage) => {
      const runFailures = [];
      await gotoHome(recordingPage, configuration.baseUrl, configuration.timeoutMs);
      await recordingPage.evaluate(() => window.__phase7cQa.setCarrierReference());
      const aperture = await settleMaradinAperture(recordingPage, configuration.timeoutMs);
      await waitForRecordingBeat(recordingPage, 700);
      const geometry = await territoryGeometry(recordingPage);
      const states = [];
      for (const sample of [...Object.values(PHASE7C_STATE_SAMPLES)].reverse()) {
        const settlement = await scrollToProgress(recordingPage, geometry, sample, configuration.timeoutMs);
        const clearance = await inspectCarrierTextClearance(recordingPage);
        states.push({ sample, settlement, clearance, beat: await waitForRecordingBeat(recordingPage) });
        if (settlement.status === "FAIL" || clearance.status === "FAIL") runFailures.push(sample.state);
      }
      const decide = await scrollToDecide(recordingPage, configuration.timeoutMs);
      await waitForRecordingBeat(recordingPage, 700);
      const physical = await settlePhysicalFirstFrame(recordingPage, configuration.timeoutMs);
      await waitForRecordingBeat(recordingPage, 700);
      if (aperture.status === "FAIL" || decide.status === "FAIL" || physical.status === "FAIL") runFailures.push("aperture/DECIDE/F1 reachability");
      return { failures: runFailures, aperture, states, decide, physical };
    },
  ));
  videoRuns.push(await captureScenarioVideo(
    browser,
    engine,
    configuration,
    "authored-stop-states",
    {},
    async (recordingPage) => {
      const runFailures = [];
      await gotoHome(recordingPage, configuration.baseUrl, configuration.timeoutMs);
      const holds = [];
      const decide = await scrollToDecide(recordingPage, configuration.timeoutMs);
      holds.push(await holdStableState(recordingPage, {
        label: "phase7b-decide",
        scope: "method",
        state: "decide",
        progress: 0.92,
      }));
      const geometry = await territoryGeometry(recordingPage);
      for (const sample of Object.values(PHASE7C_STATE_SAMPLES)) {
        if (sample.state === "proof") await settleMaradinAperture(recordingPage, configuration.timeoutMs);
        else await scrollToProgress(recordingPage, geometry, sample, configuration.timeoutMs);
        const hold = await holdStableState(recordingPage, {
          label: `territory-${sample.state}`,
          scope: "territory",
          state: sample.state,
          progress: sample.progress,
        });
        const clearance = await inspectCarrierTextClearance(recordingPage);
        holds.push({ ...hold, carrierTextIntersection: clearance });
        if (hold.status === "FAIL" || clearance.status === "FAIL") runFailures.push(sample.state);
      }
      if (decide.status === "FAIL" || holds[0].status === "FAIL") runFailures.push("Phase 7B DECIDE hold");
      return { failures: runFailures, governedTerritoryHoldCount: holds.length - 1, decideBound: true, holdMs: STOP_HOLD_MS, holds };
    },
  ));
  videoRuns.push(await captureScenarioVideo(
    browser,
    engine,
    configuration,
    "fast-forward-immediate-reverse",
    {},
    async (recordingPage) => {
      const runFailures = [];
      await gotoHome(recordingPage, configuration.baseUrl, configuration.timeoutMs);
      const decideStart = await scrollToDecide(recordingPage, configuration.timeoutMs);
      await waitForRecordingBeat(recordingPage, 500);
      const geometry = await territoryGeometry(recordingPage);
      const energy = await scrollToProgress(recordingPage, geometry, PHASE7C_STATE_SAMPLES.energy, configuration.timeoutMs);
      await waitForRecordingBeat(recordingPage, 500);
      const decideReturn = await scrollToDecide(recordingPage, configuration.timeoutMs);
      await waitForRecordingBeat(recordingPage, 700);
      if ([decideStart, energy, decideReturn].some((entry) => entry.status === "FAIL")) runFailures.push("latest-position authority");
      return { failures: runFailures, decideStart, energy, decideReturn, queuedCatchUpObserved: false };
    },
  ));
  for (const run of videoRuns) {
    if (run.status === "FAIL") failures.push(`${run.scenario} recording authority failed`);
    if (run.artifact) artifacts.push(run.artifact);
  }
  return {
    name: "forward-reverse-fast-stop",
    status: failures.length ? "FAIL" : aggregateStatus(videoRuns),
    failures,
    decideBeforeRelease,
    forward,
    maradinAperture,
    carrierTextClearanceSweep,
    reverse,
    decideAfterReverse,
    forwardReverseEquality,
    directSkip,
    runtime,
    scenarioRecordings: videoRuns,
    artifacts,
  };
}

async function mobileJourneyCase(browser, engine, configuration) {
  const viewport = { width: 390, height: 844 };
  const rawDirectory = path.join(configuration.output, ".capture-video", engine, "mobile");
  await mkdir(rawDirectory, { recursive: true });
  const context = await browser.newContext({
    viewport,
    recordVideo: { dir: rawDirectory, size: viewport },
  });
  await addInstrumentation(context);
  const page = await context.newPage();
  const video = page.video();
  const failures = [];
  const artifacts = [];
  const selectors = [
    ...["automotive", "logistics", "manufacturing", "energy"]
      .map((stage) => `[data-territory-stage='${stage}'] [data-territory-title]`),
    "[data-proof-title]",
  ];
  const forward = [];
  const reverse = [];
  let decideBeforeRelease = null;
  let aperture = null;
  let decideAfterReverse = null;
  try {
    await gotoHome(page, configuration.baseUrl, configuration.timeoutMs);
    decideBeforeRelease = await scrollToDecide(page, configuration.timeoutMs);
    if (decideBeforeRelease.status === "FAIL") failures.push("mobile DECIDE handoff");
    for (const selector of selectors) {
      const settlement = await scrollElementToCenter(page, selector, configuration.timeoutMs);
      const snapshot = await inspectResponsiveState(page, selector);
      snapshot.carrierTextIntersection = await inspectCarrierTextClearance(page);
      forward.push({ selector, settlement, snapshot });
      if (!snapshot.titleVisible || snapshot.titleClipped || snapshot.horizontalOverflow > 1 || snapshot.mode !== "static" || snapshot.carrierTextIntersection.status === "FAIL") {
        failures.push(`mobile forward ${selector}`);
      }
      artifacts.push(await screenshot(
        page,
        configuration.output,
        `screenshots/${engine}/mobile/forward-${forward.length}.png`,
      ));
    }
    aperture = await settleMaradinAperture(page, configuration.timeoutMs);
    if (aperture.status === "FAIL") failures.push("mobile Maradin aperture");
    for (const selector of [...selectors].reverse()) {
      const settlement = await scrollElementToCenter(page, selector, configuration.timeoutMs);
      const snapshot = await inspectResponsiveState(page, selector);
      snapshot.carrierTextIntersection = await inspectCarrierTextClearance(page);
      reverse.push({ selector, settlement, snapshot });
      if (!snapshot.titleVisible || snapshot.titleClipped || snapshot.horizontalOverflow > 1 || snapshot.mode !== "static" || snapshot.carrierTextIntersection.status === "FAIL") {
        failures.push(`mobile reverse ${selector}`);
      }
    }
    decideAfterReverse = await scrollToDecide(page, configuration.timeoutMs);
    if (decideAfterReverse.status === "FAIL") failures.push("mobile reverse to DECIDE");
  } catch (error) {
    failures.push(safeError(error));
  } finally {
    await context.close();
  }
  const videoArtifact = await finalizeVideo(
    video,
    rawDirectory,
    configuration.output,
    recordingSpecifications(engine).find((entry) => entry.scenario === "mobile-390-forward-reverse").evidencePath,
  );
  return {
    name: "authored-mobile-forward-reverse",
    status: failures.length ? "FAIL" : videoArtifact.status,
    failures,
    viewport,
    decideBeforeRelease,
    forward,
    aperture,
    reverse,
    decideAfterReverse,
    artifacts: [...artifacts, videoArtifact],
  };
}

async function resizeCase(browser, engine, configuration) {
  const artifacts = [];
  const run = await captureScenarioVideo(
    browser,
    engine,
    configuration,
    "desktop-responsive-authority",
    { viewport: { width: 1280, height: 800 } },
    async (page) => {
      const failures = [];
      const records = [];
      const navigations = [];
      page.on("framenavigated", (frame) => {
        if (frame !== page.mainFrame()) return;
        try {
          const url = new URL(frame.url());
          navigations.push(url.pathname + url.hash);
        } catch {
          navigations.push(frame.url());
        }
      });
      await gotoHome(page, configuration.baseUrl, configuration.timeoutMs);
      await page.evaluate(() => window.__phase7cQa.setCarrierReference());
      const plans = [
        { sample: PHASE7C_STATE_SAMPLES.logistics, viewport: { width: 1024, height: 768 } },
        { sample: PHASE7C_STATE_SAMPLES.manufacturing, viewport: { width: 1366, height: 650 } },
        { sample: { state: "proof", progress: 0.985 }, viewport: { width: 900, height: 480 } },
      ];
      for (const plan of plans) {
        await page.setViewportSize({ width: 1280, height: 800 });
        await waitForControllerSettled(page, configuration.timeoutMs);
        let geometry = await territoryGeometry(page);
        const before = await scrollToProgress(page, geometry, plan.sample, configuration.timeoutMs);
        const beforeUrl = page.url();
        const navigationCountBefore = navigations.length;
        const documentBefore = await page.evaluate(() => window.__phase7cQa.sameDocument());
        const resizeStarted = Date.now();
        await page.setViewportSize(plan.viewport);
        const immediateSettlement = await waitForControllerSettled(page, configuration.timeoutMs);
        const postResizeState = await settlementSnapshot(page);
        const selector = plan.sample.state === "proof"
          ? "[data-proof-title]"
          : `[data-territory-stage='${plan.sample.state}'] [data-territory-title]`;
        await scrollElementToCenter(page, selector, configuration.timeoutMs);
        const snapshot = await inspectResponsiveState(page, selector);
        snapshot.carrierTextIntersection = await inspectCarrierTextClearance(page);
        const after = {
          url: page.url(),
          navigationCount: navigations.length,
          sameDocument: await page.evaluate(() => window.__phase7cQa.sameDocument()),
          sameCarrier: await page.evaluate(() => window.__phase7cQa.sameCarrier()),
          snapshot,
        };
        const checks = {
          beforeSettled: before.status === "PASS",
          immediateResizeSettled: immediateSettlement.status === "PASS",
          midProgressStateRetained: postResizeState.state === plan.sample.state,
          midProgressCoordinateRetained: Math.abs(postResizeState.progress - plan.sample.progress) <= 0.04,
          noReplacementNavigation: after.url === beforeUrl && after.navigationCount === navigationCountBefore,
          sameDocument: documentBefore && after.sameDocument,
          sameCarrier: after.sameCarrier,
          responsiveMode: snapshot.mode === expectedMode(plan.viewport),
          noOverflow: snapshot.horizontalOverflow <= 1,
          titleVisible: snapshot.titleVisible,
          titleUnclipped: !snapshot.titleClipped,
          noWordBreak: snapshot.internallyBrokenWords.length === 0,
          liveCarrierClear: snapshot.carrierTextIntersection.status !== "FAIL",
        };
        if (Object.values(checks).some((value) => !value)) {
          failures.push(`${plan.sample.state}: ${Object.entries(checks).filter(([, value]) => !value).map(([key]) => key).join(", ")}`);
        }
        const capture = await screenshot(
          page,
          configuration.output,
          `screenshots/${engine}/resize/${plan.sample.state}-${plan.viewport.width}x${plan.viewport.height}.png`,
        );
        artifacts.push(capture);
        records.push({
          state: plan.sample.state,
          sourceViewport: { width: 1280, height: 800 },
          targetViewport: plan.viewport,
          resizeSettlementMs: Date.now() - resizeStarted,
          before,
          immediateSettlement,
          postResizeState,
          after,
          checks,
          capture,
        });
        await waitForRecordingBeat(page, 600);
      }
      return { failures, records, navigations, replacementNavigationCount: Math.max(0, navigations.length - 1) };
    },
  );
  if (run.artifact) artifacts.push(run.artifact);
  return {
    name: "mid-progress-resize",
    status: run.status,
    failures: run.failures,
    records: run.payload?.records ?? [],
    navigations: run.payload?.navigations ?? [],
    artifacts,
    recording: run,
  };
}

async function historyRestorationCase(browser, engine, configuration) {
  const prefix = engine === "webkit" ? "webkit-proxy" : engine;
  const rawDirectory = path.join(configuration.output, ".capture-video", prefix, "history-restoration");
  await mkdir(rawDirectory, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: rawDirectory, size: { width: 1280, height: 720 } },
  });
  await addInstrumentation(context);
  const page = await context.newPage();
  const video = page.video();
  const failures = [];
  const records = [];
  const artifacts = [];
  let bareOpening = null;
  let reverseReachability = null;
  try {
    const response = await page.goto(`${configuration.baseUrl}/`, { waitUntil: "domcontentloaded", timeout: configuration.timeoutMs });
    if (!response || response.status() >= 400) throw new Error(`Bare / returned ${response?.status() ?? "none"}`);
    await page.waitForSelector("[data-cinematic-shell]", { timeout: configuration.timeoutMs });
    await waitForFontsLoaded(page, configuration.timeoutMs);
    bareOpening = await settlePhysicalFirstFrame(page, configuration.timeoutMs);
    if (bareOpening.status === "FAIL" || bareOpening.snapshot.pathname !== "/" || bareOpening.snapshot.hash !== "") {
      failures.push("bare / did not retain physical F1 authority");
    }
    await waitForRecordingBeat(page, 700);

    await page.goto(`${configuration.baseUrl}/#entry`, { waitUntil: "domcontentloaded", timeout: configuration.timeoutMs });
    await page.waitForSelector("[data-territory-traverse]", { timeout: configuration.timeoutMs });
    await waitForFontsLoaded(page, configuration.timeoutMs);
    const samples = [
      PHASE7C_STATE_SAMPLES.automotive,
      PHASE7C_STATE_SAMPLES.logistics,
      PHASE7C_STATE_SAMPLES.manufacturing,
      PHASE7C_STATE_SAMPLES.energy,
      PHASE7C_STATE_SAMPLES.proof,
    ];
    for (const sample of samples) {
      const geometry = await territoryGeometry(page);
      const before = await scrollToProgress(page, geometry, sample, configuration.timeoutMs);
      if (sample.state === "proof") await settleMaradinAperture(page, configuration.timeoutMs);
      const beforeUrl = page.url();
      const beforeScroll = await page.evaluate(() => window.scrollY);
      const supporting = await page.goto(`${configuration.baseUrl}/about/`, {
        waitUntil: "domcontentloaded",
        timeout: configuration.timeoutMs,
      });
      const supportingSnapshot = await page.evaluate(() => ({
        pathname: location.pathname,
        h1: document.querySelector("main h1")?.textContent.trim() ?? null,
        territoryCount: document.querySelectorAll("[data-territory-traverse]").length,
      }));
      await page.goBack({ waitUntil: "domcontentloaded", timeout: configuration.timeoutMs });
      await page.waitForSelector("[data-territory-traverse]", { timeout: configuration.timeoutMs });
      await waitForFontsLoaded(page, configuration.timeoutMs);
      await page.waitForFunction(({ state, progress }) => {
        const root = document.querySelector("[data-territory-traverse]");
        const actual = Number.parseFloat(root?.getAttribute("data-territory-progress") ?? "NaN");
        return root?.getAttribute("data-territory-state") === state
          && Math.abs(actual - progress) <= 0.035
          && root?.getAttribute("data-territory-projection") === "settled"
          && root?.getAttribute("data-territory-raf") === "idle";
      }, sample, { timeout: configuration.timeoutMs });
      const restored = await settlementSnapshot(page);
      const restoredUrl = page.url();
      const restoredScroll = restored.scrollY;
      const checks = {
        beforeSettled: before.status === "PASS",
        actualSupportingDeparture: supporting?.status() === 200
          && supportingSnapshot.pathname === "/about/"
          && supportingSnapshot.territoryCount === 0,
        returnedToExactHistoryEntry: restoredUrl === beforeUrl,
        restoredState: restored.state === sample.state && Math.abs(restored.progress - sample.progress) <= 0.035,
        restoredScrollPosition: Math.abs(restoredScroll - beforeScroll) <= 2,
        settledAfterBack: restored.projection === "settled" && restored.raf === "idle",
      };
      if (Object.values(checks).some((value) => !value)) {
        failures.push(`${sample.state} history restoration: ${Object.entries(checks).filter(([, value]) => !value).map(([key]) => key).join(", ")}`);
      }
      const capture = await screenshot(page, configuration.output, `screenshots/${engine}/history/restored-${sample.state}.png`);
      artifacts.push(capture);
      records.push({ sample, beforeUrl, beforeScroll, supportingSnapshot, restoredUrl, restoredScroll, restored, checks, capture });
    }

    const aperture = await settleMaradinAperture(page, configuration.timeoutMs);
    const territoryGeometryValue = await territoryGeometry(page);
    const reverseStates = [];
    for (const sample of [...Object.values(PHASE7C_STATE_SAMPLES)].reverse()) {
      reverseStates.push(await scrollToProgress(page, territoryGeometryValue, sample, configuration.timeoutMs));
    }
    const decide = await scrollToDecide(page, configuration.timeoutMs);
    const physical = await settlePhysicalFirstFrame(page, configuration.timeoutMs);
    reverseReachability = { aperture, reverseStates, decide, physical };
    if (aperture.status === "FAIL" || reverseStates.some((entry) => entry.status === "FAIL") || decide.status === "FAIL" || physical.status === "FAIL") {
      failures.push("complete reverse reachability from Maradin aperture through DECIDE to physical F1");
    }
  } catch (error) {
    failures.push(safeError(error));
  } finally {
    await context.close();
  }
  const videoArtifact = await finalizeVideo(
    video,
    rawDirectory,
    configuration.output,
    `videos/${prefix}/supplemental-history-restoration-and-physical-reverse.webm`,
  );
  artifacts.push(videoArtifact);
  return {
    name: "history-restoration-route-departure-physical-reachability",
    status: failures.length ? "FAIL" : videoArtifact.status,
    failures,
    bareOpening,
    records,
    reverseReachability,
    artifacts,
  };
}

async function staticFallbackSnapshot(page) {
  return page.evaluate(({ names, proofTitle }) => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const root = document.querySelector("[data-territory-traverse]");
    const fallbacks = [...root.querySelectorAll("[data-territory-static]")];
    const passages = [...root.querySelectorAll("[data-territory-passage]")];
    const titles = [...root.querySelectorAll("[data-territory-stage]:not([data-territory-stage='proof']) [data-territory-title]")]
      .map((entry) => entry.textContent.trim());
    const proof = root.querySelector("[data-proof-title]")?.textContent.trim() ?? null;
    const internallyBrokenWords = [];
    for (const title of root.querySelectorAll("[data-territory-title], [data-proof-title]")) {
      const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (const match of node.data.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          if (range.getClientRects().length > 1) internallyBrokenWords.push(match[0]);
        }
      }
    }
    const visual = root.querySelector("[data-territory-visual]");
    const computed = visual ? getComputedStyle(visual) : null;
    return {
      mode: root?.dataset.territoryMode ?? "static",
      titles,
      proof,
      exactTitles: JSON.stringify(titles) === JSON.stringify(names) && proof === proofTitle,
      internallyBrokenWords,
      fallbackCount: fallbacks.length,
      visibleFallbackCount: fallbacks.filter(visible).length,
      enhancedVisualHidden: computed?.display === "none",
      maxPassageHeight: Math.max(0, ...passages.map((entry) => entry.getBoundingClientRect().height)),
      viewportHeight: window.innerHeight,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      proofLink: root.querySelector("[data-proof-record='maradin'] a")?.getAttribute("href") ?? null,
      territoryVideoCount: root.querySelectorAll("video, source").length,
    };
  }, { names: PHASE7C_INDUSTRY_NAMES, proofTitle: PHASE7C_PROOF_TITLE });
}

async function fallbackCase(browser, engine, configuration) {
  const definitions = [
    { id: "reduced-motion", scenario: "reduced-motion-resolved-states", viewport: { width: 390, height: 844 }, reducedMotion: "reduce", javaScriptEnabled: true, blockFonts: false },
    { id: "no-javascript", scenario: "no-javascript-semantic-territories", viewport: { width: 390, height: 844 }, reducedMotion: "no-preference", javaScriptEnabled: false, blockFonts: false },
    { id: "fallback-font", viewport: { width: 320, height: 800 }, reducedMotion: "no-preference", javaScriptEnabled: true, blockFonts: true },
  ];
  const records = [];
  const artifacts = [];
  const failures = [];
  const limitations = [];
  for (const definition of definitions) {
    const specification = definition.scenario
      ? recordingSpecifications(engine).find((entry) => entry.scenario === definition.scenario)
      : null;
    const prefix = engine === "webkit" ? "webkit-proxy" : engine;
    const rawDirectory = definition.scenario
      ? path.join(configuration.output, ".capture-video", prefix, definition.scenario)
      : null;
    if (rawDirectory) await mkdir(rawDirectory, { recursive: true });
    const context = await browser.newContext({
      viewport: definition.viewport,
      reducedMotion: definition.reducedMotion,
      javaScriptEnabled: definition.javaScriptEnabled,
      ...(rawDirectory ? { recordVideo: { dir: rawDirectory, size: definition.viewport } } : {}),
    });
    if (definition.javaScriptEnabled) await addInstrumentation(context);
    if (definition.blockFonts) {
      await context.route(/\.(?:woff2?|ttf|otf)(?:\?.*)?$/i, (route) => route.abort("blockedbyclient"));
    }
    const page = await context.newPage();
    const video = rawDirectory ? page.video() : null;
    let record = null;
    try {
      const response = await page.goto(`${configuration.baseUrl}/#entry`, { waitUntil: "domcontentloaded", timeout: configuration.timeoutMs });
      if (!response || response.status() >= 400) throw new Error(`Navigation status ${response?.status() ?? "none"}`);
      await page.waitForSelector("[data-territory-traverse]", { state: "attached", timeout: configuration.timeoutMs });
      const stateSnapshots = [];
      const selectors = [
        ...["automotive", "logistics", "manufacturing", "energy"]
          .map((stage) => `[data-territory-stage='${stage}'] [data-territory-title]`),
        "[data-proof-title]",
      ];
      for (const selector of selectors) {
        const settlement = await scrollElementToCenter(page, selector, configuration.timeoutMs);
        const responsive = await inspectResponsiveState(page, selector);
        responsive.carrierTextIntersection = await inspectCarrierTextClearance(page);
        stateSnapshots.push({ selector, settlement, responsive, beat: definition.scenario ? await waitForRecordingBeat(page, 500) : null });
      }
      const snapshot = await staticFallbackSnapshot(page);
      snapshot.carrierTextIntersection = await inspectCarrierTextClearance(page);
      const checks = {
        staticMode: snapshot.mode === "static",
        exactTitles: snapshot.exactTitles,
        noInternalWordBreaks: snapshot.internallyBrokenWords.length === 0,
        fourFallbacks: snapshot.fallbackCount === 4 && snapshot.visibleFallbackCount === 4,
        enhancedHidden: snapshot.enhancedVisualHidden,
        noBlankRunway: snapshot.maxPassageHeight <= snapshot.viewportHeight * 2,
        noOverflow: snapshot.horizontalOverflow <= 1,
        ordinaryProofLink: snapshot.proofLink === "/pocs/maradin/",
        noTerritoryVideo: snapshot.territoryVideoCount === 0,
        allResolvedStatesVisited: stateSnapshots.length === 5
          && stateSnapshots.every((entry) => entry.responsive.titleVisible && !entry.responsive.titleClipped),
        liveCarrierClear: stateSnapshots.every((entry) => entry.responsive.carrierTextIntersection.status !== "FAIL"),
      };
      const status = honestStatus(checks);
      if (status === "FAIL") failures.push(`${definition.id}: ${Object.entries(checks).filter(([, value]) => !value).map(([key]) => key).join(", ")}`);
      const targets = await targetInventory(page, "/#entry", `${definition.viewport.width}x${definition.viewport.height}`, definition.id);
      if (targets.status === "FAIL") failures.push(`${definition.id}: target-size failure`);
      const capture = await screenshot(page, configuration.output, `screenshots/${engine}/fallbacks/${definition.id}.png`);
      artifacts.push(capture);
      record = { ...definition, snapshot, stateSnapshots, checks, status, targets, capture };
    } catch (error) {
      failures.push(`${definition.id}: ${safeError(error)}`);
      record = { ...definition, status: "FAIL", error: safeError(error) };
    } finally {
      await context.close();
    }
    if (video && rawDirectory && specification?.evidencePath) {
      const videoArtifact = await finalizeVideo(video, rawDirectory, configuration.output, specification.evidencePath);
      artifacts.push(videoArtifact);
      record.recording = videoArtifact;
      if (videoArtifact.status === "FAIL") failures.push(`${definition.id}: recording failed`);
      else if (videoArtifact.status !== "PASS") limitations.push(`${definition.id}: ${videoArtifact.reason ?? "recording unavailable"}`);
    }
    records.push(record);
  }
  return {
    name: "reduced-motion-no-js-fallback-font",
    status: failures.length ? "FAIL" : limitations.length ? "LIMITATION" : "PASS",
    failures,
    limitations,
    records,
    artifacts,
  };
}

async function focusDescriptor(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    const map = document.querySelector("[data-field-map]");
    return {
      tag: active?.tagName.toLowerCase() ?? null,
      id: active?.id || null,
      text: active?.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) ?? null,
      href: active instanceof HTMLAnchorElement ? active.getAttribute("href") : null,
      inFieldMap: active instanceof Element && map?.contains(active),
      body: active === document.body,
    };
  });
}

async function waitForFieldMap(page, open, timeoutMs) {
  const started = Date.now();
  await page.waitForFunction(
    ({ expectedOpen }) => {
      const details = document.querySelector("[data-field-map]");
      const summary = details?.querySelector("summary");
      const links = [...(details?.querySelectorAll("nav a[href]") ?? [])];
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const inert = document.querySelectorAll("[data-field-map-background][inert]");
      const backgroundFocusable = [...document.querySelectorAll("[data-field-map-background] a[href], [data-field-map-background] button, [data-field-map-background] input, [data-field-map-background] select, [data-field-map-background] textarea, [data-field-map-background] [tabindex]")]
        .filter((element) => !element.closest("[inert]") && visible(element));
      if (expectedOpen) {
        return details?.open === true
          && inert.length >= 2
          && links.length === 8
          && links.every(visible)
          && summary && visible(summary)
          && backgroundFocusable.length === 0
          && document.activeElement instanceof Element
          && details.contains(document.activeElement);
      }
      return details?.open === false
        && inert.length === 0
        && document.querySelectorAll("[data-field-map-background][inert]").length === 0
        && document.activeElement === summary;
    },
    { expectedOpen: open },
    { timeout: timeoutMs },
  );
  const snapshot = await page.evaluate(() => {
    const details = document.querySelector("[data-field-map]");
    const controls = [details?.querySelector("summary"), ...(details?.querySelectorAll("nav a[href]") ?? [])].filter(Boolean);
    return {
      open: details?.open === true,
      controlCount: controls.length,
      inertRegionCount: document.querySelectorAll("[data-field-map-background][inert]").length,
      activeInMap: document.activeElement instanceof Element && details?.contains(document.activeElement),
      activeElement: document.activeElement?.tagName.toLowerCase() ?? null,
    };
  });
  return {
    requestedState: open ? "open" : "closed",
    settlementMs: Date.now() - started,
    timeoutMs,
    predicateComponents: snapshot,
  };
}

async function prepareFieldMapAvailability(page, timeoutMs) {
  const started = Date.now();
  await page.evaluate(() => {
    const threshold = document.querySelector("[data-field-map-threshold]");
    if (!(threshold instanceof Element)) throw new Error("Field Map threshold is missing.");
    const rect = threshold.getBoundingClientRect();
    const top = Math.max(0, window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2);
    window.__phase7cQa.nativeScrollTo(top);
  });
  await page.waitForFunction(() => {
    const summary = document.querySelector("[data-field-map] > summary");
    const cinematic = document.querySelector("[data-cinematic-shell]");
    const threshold = document.querySelector("[data-field-map-threshold]");
    return summary instanceof HTMLElement
      && !summary.closest("[inert]")
      && threshold instanceof HTMLElement
      && !threshold.closest("[inert]")
      && (!cinematic || cinematic.dataset.routeNavigation === "released")
      && document.querySelector("[data-field-map]")?.open === false;
  }, null, { timeout: timeoutMs });
  const snapshot = await page.evaluate(() => ({
    routeNavigation: document.querySelector("[data-cinematic-shell]")?.getAttribute("data-route-navigation") ?? null,
    summaryInert: Boolean(document.querySelector("[data-field-map] > summary")?.closest("[inert]")),
    thresholdInert: Boolean(document.querySelector("[data-field-map-threshold]")?.closest("[inert]")),
    open: document.querySelector("[data-field-map]")?.open === true,
    activeElement: document.activeElement?.tagName.toLowerCase() ?? null,
  }));
  return {
    requestedState: "post-CRT Field Map available and closed",
    settlementMs: Date.now() - started,
    timeoutMs,
    predicateComponents: snapshot,
  };
}

async function fieldMapCase(browser, engine, configuration) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await addInstrumentation(context);
  const page = await context.newPage();
  const failures = [];
  const cycles = [];
  const artifacts = [];
  let targets = null;
  let availabilitySettlement = null;
  try {
    await gotoHome(page, configuration.baseUrl, configuration.timeoutMs);
    availabilitySettlement = await prepareFieldMapAvailability(page, configuration.timeoutMs);
    const summary = page.locator("[data-field-map] > summary");
    for (let cycle = 1; cycle <= 3; cycle += 1) {
      await summary.focus();
      await page.keyboard.press("Enter");
      const openSettlement = await waitForFieldMap(page, true, configuration.timeoutMs);
      if (cycle === 1) {
        targets = await targetInventory(page, "/#entry", "1280x800", "field-map-open");
        artifacts.push(await screenshot(page, configuration.output, `screenshots/${engine}/field-map/open.png`));
      }
      const forward = [];
      const reverse = [];
      for (let index = 0; index < 10; index += 1) {
        await page.keyboard.press("Tab");
        forward.push(await focusDescriptor(page));
      }
      for (let index = 0; index < 10; index += 1) {
        await page.keyboard.press("Shift+Tab");
        reverse.push(await focusDescriptor(page));
      }
      if ([...forward, ...reverse].some((entry) => entry.body || !entry.inFieldMap)) {
        failures.push(`cycle ${cycle}: focus escaped Field Map`);
      }
      await page.keyboard.press("Escape");
      const closeSettlement = await waitForFieldMap(page, false, configuration.timeoutMs);
      const restoredFocus = await focusDescriptor(page);
      if (restoredFocus.body || !restoredFocus.inFieldMap) failures.push(`cycle ${cycle}: focus was not restored`);
      cycles.push({ cycle, openSettlement, forward, reverse, closeSettlement, restoredFocus });
    }
    const runtime = await page.evaluate(() => window.__phase7cQa.snapshot());
    if (targets?.status === "FAIL") failures.push("Field Map target-size failure");
    return {
      name: "field-map-keyboard-inert",
      status: failures.length ? "FAIL" : "PASS",
      failures,
      expectedOrder: "summary/close trigger plus eight ordinary links, wrapping in both directions",
      availabilitySettlement,
      cycles,
      targets,
      runtime,
      artifacts,
    };
  } catch (error) {
    failures.push(safeError(error));
    return { name: "field-map-keyboard-inert", status: "FAIL", failures, availabilitySettlement, cycles, targets, artifacts };
  } finally {
    await context.close();
  }
}

async function accessibilityCase(browser, engine, configuration) {
  const records = [];
  const failures = [];
  const limitations = [];
  for (const viewport of [{ id: "desktop", width: 1280, height: 800 }, { id: "narrow", width: 320, height: 800 }]) {
    const context = await browser.newContext({ viewport });
    await addInstrumentation(context);
    const page = await context.newPage();
    try {
      await gotoHome(page, configuration.baseUrl, configuration.timeoutMs);
      await scrollElementToCenter(page, "[data-proof-title]", configuration.timeoutMs);
      await page.addScriptTag({ content: axeCore.source });
      const result = await page.evaluate(async () => window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
      }));
      const contrastIncomplete = result.incomplete.filter((entry) => entry.id === "color-contrast");
      const otherIncomplete = result.incomplete.filter((entry) => entry.id !== "color-contrast");
      if (result.violations.length) failures.push(`${viewport.id}: axe violations ${result.violations.map((entry) => entry.id).join(", ")}`);
      if (otherIncomplete.length) failures.push(`${viewport.id}: axe incomplete ${otherIncomplete.map((entry) => entry.id).join(", ")}`);
      if (contrastIncomplete.length) limitations.push(`${viewport.id}: automated contrast indeterminate over authored field; manual calculation required`);
      records.push({
        viewport,
        violations: result.violations,
        incomplete: result.incomplete,
        passes: result.passes.map((entry) => entry.id),
      });
    } catch (error) {
      failures.push(`${viewport.id}: ${safeError(error)}`);
    } finally {
      await context.close();
    }
  }
  return {
    name: "accessibility",
    status: failures.length ? "FAIL" : limitations.length ? "LIMITATION" : "PASS",
    failures,
    limitations,
    records,
  };
}

async function lifecycleCase(browser, engine, configuration) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await addInstrumentation(context);
  const page = await context.newPage();
  const failures = [];
  const limitations = [];
  const cycles = [];
  let before = null;
  let after = null;
  let cleanup = null;
  let memoryTrend = null;
  const memorySamples = [];
  try {
    await gotoHome(page, configuration.baseUrl, configuration.timeoutMs);
    const geometry = await territoryGeometry(page);
    if (!geometry) throw new Error("Territory runway geometry unavailable.");
    const initialDecide = await scrollToDecide(page, configuration.timeoutMs);
    if (initialDecide.status === "FAIL") failures.push("lifecycle did not begin at Phase 7B DECIDE");
    await page.evaluate(() => {
      window.__phase7cQa.setCarrierReference();
      window.__phase7cQa.resetRuntimeWrites();
    });
    await settleAfterPaint(page);
    before = await page.evaluate(() => ({
      runtime: window.__phase7cQa.snapshot(),
      domCount: document.querySelectorAll("*").length,
      svgCount: document.querySelectorAll("svg *").length,
      territoryDomCount: document.querySelector("[data-territory-traverse]")?.querySelectorAll("*").length ?? 0,
      territorySvgCount: document.querySelector("[data-territory-traverse]")?.querySelectorAll("svg *").length ?? 0,
    }));
    memorySamples.push(before.runtime.memoryBytes);

    for (let cycle = 1; cycle <= PHASE7C_CYCLE_COUNT; cycle += 1) {
      const decideBefore = await scrollToDecide(page, configuration.timeoutMs);
      await settleAfterPaint(page);
      const boundary = await page.evaluate((label) => window.__phase7cQa.beginBoundary(label), `cycle-${cycle}`);
      const cycleStates = Object.values(PHASE7C_STATE_SAMPLES);
      const forward = [];
      const reverse = [];
      for (const sample of cycleStates) {
        forward.push(await scrollToProgress(page, geometry, sample, configuration.timeoutMs));
      }
      const aperture = await settleMaradinAperture(page, configuration.timeoutMs);
      for (const sample of [...cycleStates].reverse().slice(1)) {
        reverse.push(await scrollToProgress(page, geometry, sample, configuration.timeoutMs));
      }
      const decideAfter = await scrollToDecide(page, configuration.timeoutMs);
      await settleAfterPaint(page);
      const measurement = await page.evaluate((value) => window.__phase7cQa.measureBoundary(value), boundary);
      const cycleRuntime = await page.evaluate(() => window.__phase7cQa.snapshot());
      memorySamples.push(cycleRuntime.memoryBytes);
      const cycleCls = measurement.cycleAttributableCls;
      if (cycleCls > CLS_BUDGET) failures.push(`cycle ${cycle}: attributable CLS ${cycleCls} exceeds ${CLS_BUDGET}`);
      if (measurement.attributableLongTasks.some((entry) => entry.duration >= LONG_TASK_THRESHOLD_MS)) {
        failures.push(`cycle ${cycle}: attributable long task observed`);
      }
      if (decideBefore.status === "FAIL" || aperture.status === "FAIL" || decideAfter.status === "FAIL") {
        failures.push(`cycle ${cycle}: DECIDE/aperture boundary failed`);
      }
      cycles.push({
        cycle,
        requestedSequence: ["phase7b-decide", ...cycleStates.map(({ state }) => state), ...[...cycleStates].reverse().slice(1).map(({ state }) => state), "phase7b-decide"],
        decideBefore,
        forward,
        aperture,
        reverse,
        decideAfter,
        measurement,
        memoryBytes: cycleRuntime.memoryBytes,
      });
    }
    after = await page.evaluate(() => ({
      runtime: window.__phase7cQa.snapshot(),
      domCount: document.querySelectorAll("*").length,
      svgCount: document.querySelectorAll("svg *").length,
      territoryDomCount: document.querySelector("[data-territory-traverse]")?.querySelectorAll("*").length ?? 0,
      territorySvgCount: document.querySelector("[data-territory-traverse]")?.querySelectorAll("svg *").length ?? 0,
    }));
    if (after.domCount !== before.domCount) failures.push("DOM count changed across cycles");
    if (after.svgCount !== before.svgCount) failures.push("SVG count changed across cycles");
    if (after.runtime.listenerAdds !== before.runtime.listenerAdds) failures.push("listener binding count grew across cycles");
    if (after.runtime.observerCount !== before.runtime.observerCount) failures.push("observer count grew across cycles");
    if (after.territoryDomCount > PHASE7C_PERFORMANCE_BUDGET.territoryDomNodeMaximum) {
      failures.push(`Territory DOM count ${after.territoryDomCount} exceeds ${PHASE7C_PERFORMANCE_BUDGET.territoryDomNodeMaximum}`);
    }
    if (after.territorySvgCount > PHASE7C_PERFORMANCE_BUDGET.territorySvgElementMaximum) {
      failures.push(`Territory SVG count ${after.territorySvgCount} exceeds ${PHASE7C_PERFORMANCE_BUDGET.territorySvgElementMaximum}`);
    }
    if (after.runtime.intervalCount !== 0 || after.runtime.pendingRafCount !== 0) failures.push("idle timer or RAF remained active");
    if (!after.runtime.sameCarrier) failures.push("carrier identity changed across cycles");
    if (after.runtime.runtimeScrollWrites.length !== 0) failures.push("production runtime wrote scroll during lifecycle cycles");
    memoryTrend = validateMemoryTrend(memorySamples);
    if (memoryTrend.status === "FAIL") failures.push("ten-cycle memory trend exceeded its explicit bounded-growth policy");
    if (memoryTrend.status === "LIMITATION") limitations.push(memoryTrend.reason);
    if (!before.runtime.layoutShiftSupported) limitations.push("LayoutShift PerformanceObserver is unavailable in this engine");
    if (!before.runtime.longTaskSupported) limitations.push("LongTask PerformanceObserver is unavailable in this engine");
    if (before.runtime.memoryBytes == null || after.runtime.memoryBytes == null) {
      limitations.push("Precise JavaScript heap telemetry is unavailable in this engine");
    }
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })));
    await settleAfterPaint(page);
    cleanup = await page.evaluate(() => ({
      runtime: window.__phase7cQa.snapshot(),
      controllerGuardPresent: document.querySelector("[data-territory-traverse]")?.hasAttribute("data-territory-controller") ?? false,
    }));
    if (cleanup.controllerGuardPresent || cleanup.runtime.pendingRafCount !== 0) failures.push("pagehide cleanup did not settle");
  } catch (error) {
    failures.push(safeError(error));
  } finally {
    await context.close();
  }
  return {
    name: "ten-cycle-cls-lifecycle-performance",
    status: failures.length ? "FAIL" : limitations.length ? "LIMITATION" : "PASS",
    cycleCount: PHASE7C_CYCLE_COUNT,
    clsBudget: CLS_BUDGET,
    failures,
    limitations,
    before,
    cycles,
    memoryTrend,
    after,
    cleanup,
  };
}

async function networkCase(browser, engine, configuration) {
  const failures = [];
  const normalRequests = [];
  const normalFailures = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await addInstrumentation(context);
  const page = await context.newPage();
  page.on("request", (request) => normalRequests.push({ url: request.url(), resourceType: request.resourceType() }));
  page.on("requestfailed", (request) => normalFailures.push({ url: request.url(), error: request.failure()?.errorText ?? null }));
  let normal = null;
  try {
    await gotoHome(page, configuration.baseUrl, configuration.timeoutMs);
    await scrollElementToCenter(page, "[data-proof-title]", configuration.timeoutMs);
    await page.waitForFunction(() => {
      const image = document.querySelector("[data-proof-record='maradin'] img");
      return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
    }, null, { timeout: configuration.timeoutMs });
    normal = await page.evaluate(() => ({
      proofLink: document.querySelector("[data-proof-record='maradin'] a")?.getAttribute("href") ?? null,
      poster: (() => {
        const image = document.querySelector("[data-proof-record='maradin'] img");
        return image instanceof HTMLImageElement
          ? { complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight }
          : null;
      })(),
      territoryVideoCount: document.querySelectorAll("[data-territory-traverse] video, [data-territory-traverse] source").length,
    }));
  } catch (error) {
    failures.push(`normal: ${safeError(error)}`);
  } finally {
    await context.close();
  }

  const blockedRequests = [];
  const blockedContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await addInstrumentation(blockedContext);
  await blockedContext.route("**/media/maradin/maradin-field-aperture-poster-approved.jpg", async (route) => {
    blockedRequests.push(route.request().url());
    await route.abort("failed");
  });
  const blockedPage = await blockedContext.newPage();
  let blocked = null;
  try {
    await gotoHome(blockedPage, configuration.baseUrl, configuration.timeoutMs);
    await scrollElementToCenter(blockedPage, "[data-proof-title]", configuration.timeoutMs);
    await settleAfterPaint(blockedPage);
    blocked = await blockedPage.evaluate(() => ({
      title: document.querySelector("[data-proof-title]")?.textContent.trim() ?? null,
      proofLink: document.querySelector("[data-proof-record='maradin'] a")?.getAttribute("href") ?? null,
      semanticRecordPresent: document.querySelectorAll("[data-proof-record='maradin']").length === 1,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    }));
  } catch (error) {
    failures.push(`blocked-poster: ${safeError(error)}`);
  } finally {
    await blockedContext.close();
  }

  const supportingRequests = [];
  const supportingContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const supportingPage = await supportingContext.newPage();
  supportingPage.on("request", (request) => supportingRequests.push(request.url()));
  let supporting = null;
  try {
    const response = await supportingPage.goto(`${configuration.baseUrl}/about/`, {
      waitUntil: "domcontentloaded",
      timeout: configuration.timeoutMs,
    });
    await settleAfterPaint(supportingPage);
    supporting = await supportingPage.evaluate(() => ({
      statusDocument: document.readyState,
      territoryCount: document.querySelectorAll("[data-territory-traverse]").length,
      heading: document.querySelector("main h1")?.textContent.trim() ?? null,
    }));
    if (!response || response.status() >= 400) failures.push(`supporting route status ${response?.status() ?? "none"}`);
  } catch (error) {
    failures.push(`supporting-route: ${safeError(error)}`);
  } finally {
    await supportingContext.close();
  }

  const offlineContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await addInstrumentation(offlineContext);
  const offlinePage = await offlineContext.newPage();
  const offlineFailures = [];
  offlinePage.on("requestfailed", (request) => {
    if (request.url().includes("/media/maradin/maradin-field-aperture-poster-approved.jpg")) {
      offlineFailures.push(request.failure()?.errorText ?? "request failed");
    }
  });
  let offline = null;
  try {
    await gotoHome(offlinePage, configuration.baseUrl, configuration.timeoutMs);
    const preOfflinePosterComplete = await offlinePage.evaluate(() => {
      const image = document.querySelector("[data-proof-record='maradin'] img");
      return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
    });
    await offlineContext.setOffline(true);
    await scrollElementToCenter(offlinePage, "[data-proof-title]", configuration.timeoutMs);
    await settleAfterPaint(offlinePage);
    offline = await offlinePage.evaluate(() => ({
      title: document.querySelector("[data-proof-title]")?.textContent.trim() ?? null,
      proofLink: document.querySelector("[data-proof-record='maradin'] a")?.getAttribute("href") ?? null,
      semanticRecordPresent: document.querySelectorAll("[data-proof-record='maradin']").length === 1,
      territoryVideoCount: document.querySelectorAll("[data-territory-traverse] video, [data-territory-traverse] source").length,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      preOfflinePosterComplete,
    }));
    await offlineContext.setOffline(false);
  } catch (error) {
    failures.push(`offline-poster: ${safeError(error)}`);
  } finally {
    await offlineContext.setOffline(false).catch(() => {});
    await offlineContext.close();
  }

  const posterRequests = normalRequests.filter((entry) => entry.url.includes("/media/maradin/maradin-field-aperture-poster-approved.jpg"));
  const maradinMediaRequests = normalRequests.filter((entry) => /\/media\/maradin\/.*\.(?:mp4|webm|mov)(?:\?|$)/i.test(entry.url));
  const externalRequests = normalRequests.filter((entry) => {
    try { return new URL(entry.url).origin !== new URL(configuration.baseUrl).origin; } catch { return true; }
  });
  if (!normal?.poster?.complete || normal.poster.naturalWidth !== 1920 || normal.poster.naturalHeight !== 1080) failures.push("approved poster did not load at intrinsic dimensions");
  if (normal?.territoryVideoCount !== 0 || maradinMediaRequests.length !== 0) failures.push("Phase 7C requested or mounted video media");
  if (normal?.proofLink !== "/pocs/maradin/") failures.push("ordinary Maradin proof link missing");
  if (posterRequests.length !== 1) failures.push(`approved poster request count was ${posterRequests.length}`);
  if (normalFailures.length !== 0) failures.push("unexpected normal request failure");
  if (externalRequests.length !== 0) failures.push("unexpected cross-origin request");
  if (blockedRequests.length !== 1) failures.push(`blocked poster retry count was ${blockedRequests.length}`);
  if (!blocked?.semanticRecordPresent || blocked.proofLink !== "/pocs/maradin/" || blocked.horizontalOverflow > 1) {
    failures.push("semantic proof failed when poster was unavailable");
  }
  const supportingTerritoryRequests = supportingRequests.filter((url) => /\/media\/maradin\/|territory-traverse/i.test(url));
  if (supportingTerritoryRequests.length !== 0 || supporting?.territoryCount !== 0) {
    failures.push("supporting route requested or mounted homepage Territory media/runtime");
  }
  if (
    !offline?.semanticRecordPresent
    || offline.proofLink !== "/pocs/maradin/"
    || offline.territoryVideoCount !== 0
    || offline.horizontalOverflow > 1
    || (!offline.preOfflinePosterComplete && offlineFailures.length !== 1)
  ) {
    failures.push("offline documentary aperture did not fail once while preserving semantic Proof");
  }
  return {
    name: "network-failure-media-isolation",
    status: failures.length ? "FAIL" : "PASS",
    failures,
    normal: {
      snapshot: normal,
      requests: normalRequests.map((entry) => ({ ...entry, url: new URL(entry.url).pathname })),
      failures: normalFailures.map((entry) => ({ ...entry, url: new URL(entry.url).pathname })),
      posterRequestCount: posterRequests.length,
      maradinVideoRequestCount: maradinMediaRequests.length,
      externalRequestCount: externalRequests.length,
    },
    blockedPoster: { requestCount: blockedRequests.length, snapshot: blocked },
    supportingRoute: {
      snapshot: supporting,
      territoryRequestCount: supportingTerritoryRequests.length,
      requestPaths: supportingTerritoryRequests.map((url) => new URL(url).pathname),
    },
    offlinePoster: { requestFailureCount: offlineFailures.length, requestFailures: offlineFailures, snapshot: offline },
  };
}

async function caseGuard(name, callback) {
  try {
    return await callback();
  } catch (error) {
    return { name, status: "FAIL", failures: [safeError(error)] };
  }
}

function buildRecordingLedger(engine, cases, suite) {
  const specifications = recordingSpecifications(engine);
  const artifactMap = new Map();
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (typeof value.path === "string" && /\.(?:webm|mp4)$/i.test(value.path)) artifactMap.set(value.path, value);
    if (Array.isArray(value)) value.forEach(visit);
    else Object.values(value).forEach(visit);
  };
  cases.forEach(visit);
  const records = specifications.map((specification) => {
    if (specification.captureKind === "scenario-specific-video") {
      const artifact = artifactMap.get(specification.evidencePath);
      if (!artifact) {
        return {
          ...specification,
          status: suite === "full" ? "FAIL" : "NOT OBSERVED",
          reason: suite === "full"
            ? "Required scenario-specific video was not emitted."
            : "Responsive-smoke suite intentionally does not capture the complete recording topology.",
        };
      }
      return { ...specification, status: artifact.status, artifact };
    }
    if (specification.scenario === "installed-chrome-200-percent") return specification;
    const caseName = specification.scenario === "documentary-media-network"
      ? "network-failure-media-isolation"
      : "ten-cycle-cls-lifecycle-performance";
    const result = cases.find((entry) => entry.name === caseName);
    return {
      ...specification,
      status: result?.status ?? (suite === "full" ? "FAIL" : "NOT OBSERVED"),
      evidencePointer: `${REPORT_FILE}#/results/*/cases/${caseName}`,
      reason: result ? null : "The governing structured case was not run in this partial suite.",
    };
  });
  const requiredInRunner = records.filter((entry) => entry.scenario !== "installed-chrome-200-percent");
  const failures = requiredInRunner.filter((entry) => entry.status === "FAIL");
  const nativeZoom = records.find((entry) => entry.scenario === "installed-chrome-200-percent");
  const limitations = engine === "chromium" && nativeZoom?.status === "NOT OBSERVED"
    ? ["Installed-Chrome browser-native 200% recording must be bound by the separate native-zoom authority before package assembly."]
    : [];
  return {
    name: "recording-topology",
    status: failures.length ? "FAIL" : limitations.length ? "LIMITATION" : "PASS",
    scenarioCount: records.length,
    distinctScenarioVideoCount: records.filter((entry) => entry.captureKind === "scenario-specific-video" && entry.status === "PASS").length,
    artifactReuseCount: records.filter((entry) => entry.artifactReuse).length,
    records,
    failures: failures.map((entry) => entry.scenario),
    limitations,
  };
}

function installedChromeCandidates() {
  const values = [
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
  ];
  return dedupe(values.filter(Boolean));
}

async function firstAccessible(candidates) {
  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Keep looking; absence is disclosed by the engine result.
    }
  }
  return null;
}

async function launchEngine(engine, configuration) {
  const browserType = ENGINE_MAP[engine];
  let executablePath = null;
  let browserSource = "Playwright-managed browser";
  if (engine === "chromium") {
    executablePath = configuration.chromiumExecutable
      ?? await firstAccessible(installedChromeCandidates())
      ?? browserType.executablePath();
    browserSource = configuration.chromiumExecutable || installedChromeCandidates().includes(executablePath)
      ? "installed Google Chrome executable"
      : "Playwright-managed Chromium";
  } else {
    executablePath = browserType.executablePath();
  }
  if (!executablePath || !(await firstAccessible([executablePath]))) {
    throw new Error(`${engine} executable is not available.`);
  }
  const browser = await browserType.launch({ executablePath, headless: !configuration.headed });
  return { browser, executablePath, browserSource };
}

async function runEngine(engine, configuration) {
  let launched;
  try {
    launched = await launchEngine(engine, configuration);
  } catch (error) {
    return {
      engine,
      engineAuthority: ENGINE_EVIDENCE[engine],
      status: "NOT AVAILABLE TO EXECUTION ENVIRONMENT",
      limitations: [safeError(error)],
      cases: [],
      recordings: recordingSpecifications(engine),
    };
  }
  const { browser, executablePath, browserSource } = launched;
  const version = await browser.version();
  const cases = [];
  let recordingLedger = null;
  try {
    cases.push(await caseGuard("authored-mobile-forward-reverse", () => mobileJourneyCase(browser, engine, configuration)));
    cases.push(await caseGuard("responsive-and-short-landscape", () => responsiveCase(browser, engine, configuration)));
    if (configuration.suite === "full") {
      cases.unshift(await caseGuard("forward-reverse-fast-stop", () => journeyCase(browser, engine, configuration)));
      cases.push(await caseGuard("mid-progress-resize", () => resizeCase(browser, engine, configuration)));
      cases.push(await caseGuard("narrow-short-landscape-recording", () => narrowLandscapeRecordingCase(browser, engine, configuration)));
      cases.push(await caseGuard("history-restoration-route-departure-physical-reachability", () => historyRestorationCase(browser, engine, configuration)));
      cases.push(await caseGuard("reduced-motion-no-js-fallback-font", () => fallbackCase(browser, engine, configuration)));
      cases.push(await caseGuard("field-map-keyboard-inert", () => fieldMapCase(browser, engine, configuration)));
      cases.push(await caseGuard("accessibility", () => accessibilityCase(browser, engine, configuration)));
      cases.push(await caseGuard("ten-cycle-cls-lifecycle-performance", () => lifecycleCase(browser, engine, configuration)));
      cases.push(await caseGuard("network-failure-media-isolation", () => networkCase(browser, engine, configuration)));
    }
  } finally {
    await browser.close();
  }
  recordingLedger = buildRecordingLedger(engine, cases, configuration.suite);
  const limitations = [];
  if (engine === "webkit") limitations.push("WebKit result is Playwright proxy evidence and is not physical Safari authority.");
  for (const result of cases) limitations.push(...(result.limitations ?? []));
  limitations.push(...(recordingLedger.limitations ?? []));
  return {
    engine,
    engineAuthority: ENGINE_EVIDENCE[engine],
    browserSource,
    executable: path.basename(executablePath),
    browserVersion: version,
    headed: configuration.headed,
    status: aggregateStatus([...cases, recordingLedger], limitations),
    failures: [...cases, recordingLedger].flatMap((result) => result.failures ?? []),
    limitations: dedupe(limitations),
    cases,
    recordings: recordingLedger,
  };
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

async function evidenceManifest(outputRoot) {
  const files = (await listFiles(outputRoot))
    .filter((file) => path.basename(file) !== MANIFEST_FILE)
    .sort((left, right) => left.localeCompare(right));
  const entries = [];
  for (const file of files) {
    const bytes = await readFile(file);
    entries.push({
      path: normalizeSlashes(path.relative(outputRoot, file)),
      bytes: bytes.length,
      sha256: sha256(bytes),
    });
  }
  return {
    schema: "quantum-hub.phase-7c.browser-evidence-manifest.v1",
    entryCount: entries.length,
    totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    entries,
  };
}

export function selfTest() {
  const errors = [];
  if (PHASE7C_VIEWPORTS.length !== 13) errors.push("responsive viewport contract drift");
  if (PHASE7C_ENGINES.length !== 3) errors.push("engine authority contract drift");
  if (Object.keys(PHASE7C_STATE_SAMPLES).length !== 10) errors.push("state sample contract drift");
  if (PHASE7C_RECORDING_SCENARIOS.length !== 12) errors.push("recording scenario contract drift");
  if (PHASE7C_CYCLE_COUNT !== 10) errors.push("cycle count contract drift");
  if (PHASE7C_HUMAN_GATES.length !== 6) errors.push("human gate contract drift");
  if (honestStatus([true, null]) !== "LIMITATION") errors.push("taxonomy limitation drift");
  if (honestStatus([true, false]) !== "FAIL") errors.push("taxonomy fail-closed drift");
  return { status: errors.length ? "FAIL" : "PASS", errors };
}

function usage() {
  return [
    "Usage:",
    "  node scripts/qa-phase7c-territory-proof.mjs --base-url URL --output PATH --revision SHA [options]",
    "",
    "Options:",
    "  --engine all|chromium|firefox|webkit",
    "  --suite full|responsive-smoke",
    "  --headed",
    "  --chromium-executable PATH",
    "  --timeout-ms NUMBER",
    "  --self-test",
  ].join("\n");
}

async function main() {
  const configuration = parseArguments();
  if (configuration.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (configuration.selfTest) {
    const result = selfTest();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== "PASS") process.exitCode = 1;
    return;
  }

  try {
    await access(configuration.output);
    throw new Error("Evidence output already exists; provide a fresh ignored directory.");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(configuration.output, { recursive: false });
  const engines = configuration.engine === "all" ? Object.keys(ENGINE_MAP) : [configuration.engine];
  const results = [];
  for (const engine of engines) results.push(await runEngine(engine, configuration));
  const report = {
    schema: SCHEMA,
    generatedAt: new Date().toISOString(),
    revision: configuration.revision,
    captureOrigin: new URL(configuration.baseUrl).origin,
    methodology: {
      settlement: "Bounded waits use observable font, inert, controller-state, projection, RAF, and focus predicates. No fixed-delay sleeps are used.",
      scroll: "Harness scrolling uses a saved native scroll method; separately instrumented production scroll writes remain acceptance failures.",
      cls: `Each of ${PHASE7C_CYCLE_COUNT} cycles begins after paint-queue drain with a monotonic timestamp boundary; only later layout-shift entries count against ${CLS_BUDGET}.`,
      stopStates: `Phase 7B DECIDE plus all ${PHASE7C_STATE_SAMPLE_TUPLES.length} governed Territory states are predicate-settled and held for at least ${STOP_HOLD_MS} ms with repeated fingerprint and idle-RAF sampling.`,
      stateContinuity: "Forward, reverse, fast-skip, resize, same-history restoration, supporting-route departure/back, bare-/ physical F1, and Maradin aperture predicates retain the DECIDE-to-Proof chain without replacement navigation.",
      carrierTextClearance: "Non-whitespace character Range geometry and the transformed live carrier path are sampled fail-closed across governed states and viewports; the canonical 1280x720 sweep also replays the independently reported 12000, 12620, 13600, and 14580 scroll positions exactly.",
      recordingTopology: "Scenarios 1-9 emit distinct Chromium/Firefox/WebKit-proxy video paths; scenarios 11-12 are structured network/lifecycle reports. Scenario 10 remains an external installed-Chrome browser-native-200 binding and is never synthesized by viewport scaling.",
      memory: `Ten-cycle precise-heap telemetry, when exposed by the engine, must remain within ${MEMORY_ABSOLUTE_GROWTH_BUDGET} bytes total growth and ${MEMORY_SLOPE_BUDGET_PER_CYCLE} bytes/cycle fitted slope; unavailable heap telemetry remains a limitation.`,
      webkit: "Playwright WebKit is proxy evidence only and is never represented as physical Safari.",
      targetSize: `Interactive target inventory retains element identity, accessible name, dimensions, visibility, intent, and exclusions; unexplained sub-${TARGET_MINIMUM_CSS_PX}px targets fail.`,
    },
    status: aggregateStatus(results),
    results,
    humanGates: PHASE7C_HUMAN_GATES.map((name) => ({ name, status: "PENDING HUMAN REVIEW" })),
    phase7D: "NOT AUTHORIZED",
    main: "NOT MERGED",
  };
  const portable = validatePortableReport(report);
  if (portable.status !== "PASS") {
    report.status = "FAIL";
    report.portabilityFailures = portable.failures;
  }
  const reportPath = path.join(configuration.output, REPORT_FILE);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const manifest = await evidenceManifest(configuration.output);
  await writeFile(path.join(configuration.output, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const reportBytes = await readFile(reportPath);
  const manifestBytes = await readFile(path.join(configuration.output, MANIFEST_FILE));
  process.stdout.write(`${JSON.stringify({
    status: report.status,
    output: configuration.output,
    report: { path: REPORT_FILE, bytes: reportBytes.length, sha256: sha256(reportBytes) },
    manifest: { path: MANIFEST_FILE, bytes: manifestBytes.length, sha256: sha256(manifestBytes), entryCount: manifest.entryCount },
  }, null, 2)}\n`);
  if (report.status === "FAIL") process.exitCode = 1;
}

if (path.resolve(process.argv[1] ?? "") === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(`${safeError(error)}\n`);
    process.exitCode = 1;
  });
}
