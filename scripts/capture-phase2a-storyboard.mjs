// QH_PHASE2A_LAB_ONLY · Phase 2A-R evidence pipeline
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import sharp from "sharp";

const ROOT = path.resolve(process.cwd());
const BASE_URL = process.env.PHASE2A_BASE_URL ?? "http://127.0.0.1:4174/";
const CHROME = process.env.PHASE2A_CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PROTOTYPE_ROOT = path.join(ROOT, "prototypes", "phase-2-interior-spectacle");
const PLAN_PATH = path.join(PROTOTYPE_ROOT, "capture-plan.json");
const OUTPUT_ROOT = path.join(ROOT, "artifacts", "evidence", "phase-2a", "review");
const BUILD_REPORT = path.join(ROOT, "artifacts", "evidence", "phase-1", "phase-1-build-report.json");
const ISOLATION_REPORT = path.join(ROOT, "artifacts", "evidence", "phase-2a", "phase-2a-isolation-report.json");
const ACCEPTED_PARENT = "c37eff7da9ada99e4d65e2a76f89871b9a706db0";

const OUTPUTS = {
  desktop: "phase-2a-r-desktop-keyframes.png",
  mobile: "phase-2a-r-mobile-keyframes--390x844.png",
  narrow: "phase-2a-r-mobile-narrow--320x800.png",
  transitions: "phase-2a-r-transition-storyboard.png",
  reduced: "phase-2a-r-reduced-motion-keyframes.png",
  comparison: "phase-2a-r-spectacle-comparison.png",
  manifest: "phase-2a-r-visual-evidence-manifest.json",
};

const CONTACT_SHEET_STYLE = {
  background: "#05070a",
  panel: "#0b0e12",
  border: "#343a42",
  ink: "#f0eee8",
  muted: "#969da5",
};

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function aggregateDigest(records) {
  const digest = createHash("sha256");
  for (const record of [...records].sort((left, right) => left.path.localeCompare(right.path))) {
    digest.update(record.path);
    digest.update("\0");
    digest.update(String(record.bytes));
    digest.update("\0");
    digest.update(record.sha256);
    digest.update("\n");
  }
  return digest.digest("hex");
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function svgBuffer(width, height, body) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      ${body}
    </svg>
  `);
}

async function composeContactSheet({
  destination,
  title,
  subtitle,
  panels,
  columns,
  panelWidth,
  panelHeight,
  labelHeight = 44,
}) {
  if (!panels.length) throw new Error(`No panels supplied for ${title}`);
  const margin = 24;
  const gap = 16;
  const headerHeight = 84;
  const tileHeight = labelHeight + panelHeight;
  const rows = Math.ceil(panels.length / columns);
  const width = margin * 2 + columns * panelWidth + (columns - 1) * gap;
  const height = margin + headerHeight + rows * tileHeight + (rows - 1) * gap + margin;
  const titleWidth = width - margin * 2;
  const titleSvg = svgBuffer(titleWidth, headerHeight, `
    <rect width="${titleWidth}" height="${headerHeight}" fill="${CONTACT_SHEET_STYLE.background}"/>
    <text x="0" y="31" fill="${CONTACT_SHEET_STYLE.ink}" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" letter-spacing="1.2">${escapeXml(title)}</text>
    <text x="0" y="59" fill="${CONTACT_SHEET_STYLE.muted}" font-family="Arial, Helvetica, sans-serif" font-size="15" letter-spacing="0.5">${escapeXml(subtitle)}</text>
  `);
  const composites = [{ input: titleSvg, left: margin, top: margin }];

  for (let index = 0; index < panels.length; index += 1) {
    const panel = panels[index];
    const frame = await sharp(panel.capture.rawPath)
      .resize(panelWidth, panelHeight, { fit: "contain", background: CONTACT_SHEET_STYLE.panel })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    const tileOverlay = svgBuffer(panelWidth, tileHeight, `
      <rect x="0.5" y="0.5" width="${panelWidth - 1}" height="${tileHeight - 1}" rx="2" fill="none" stroke="${CONTACT_SHEET_STYLE.border}"/>
      <rect x="0.5" y="0.5" width="${panelWidth - 1}" height="${labelHeight}" rx="2" fill="${CONTACT_SHEET_STYLE.panel}"/>
      <line x1="0" y1="${labelHeight}" x2="${panelWidth}" y2="${labelHeight}" stroke="${CONTACT_SHEET_STYLE.border}"/>
      <text x="15" y="${Math.round(labelHeight * 0.67)}" fill="${CONTACT_SHEET_STYLE.ink}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(15, Math.round(labelHeight * 0.42))}" font-weight="700" letter-spacing="0.4">${escapeXml(panel.label)}</text>
    `);
    const tile = await sharp({
      create: { width: panelWidth, height: tileHeight, channels: 4, background: CONTACT_SHEET_STYLE.panel },
    })
      .composite([
        { input: frame, left: 0, top: labelHeight },
        { input: tileOverlay, left: 0, top: 0 },
      ])
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    const column = index % columns;
    const row = Math.floor(index / columns);
    composites.push({
      input: tile,
      left: margin + column * (panelWidth + gap),
      top: margin + headerHeight + row * (tileHeight + gap),
    });
  }

  await sharp({
    create: { width, height, channels: 4, background: CONTACT_SHEET_STYLE.background },
  })
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(destination);
}

function findCapture(reports, frame, viewport, motion = "full") {
  const capture = reports.find((report) => (
    report.frame === frame
    && report.viewport.width === viewport.width
    && report.viewport.height === viewport.height
    && report.motion === motion
  ));
  if (!capture) throw new Error(`Missing ${motion} capture for ${frame} at ${viewport.width}×${viewport.height}`);
  return capture;
}

function panelsFromRoster(reports, roster, viewport, motion = "full") {
  return roster.map(({ id, label }) => ({
    label,
    capture: findCapture(reports, id, viewport, motion),
  }));
}

async function fileRecord(filename, base = ROOT) {
  const absolute = path.isAbsolute(filename) ? filename : path.join(base, filename);
  const bytes = await readFile(absolute);
  const metadata = /\.png$/i.test(absolute) ? await sharp(bytes).metadata() : null;
  return {
    path: path.relative(ROOT, absolute).replaceAll("\\", "/"),
    bytes: bytes.length,
    sha256: sha256(bytes),
    ...(metadata ? { width: metadata.width, height: metadata.height, format: metadata.format } : {}),
  };
}

async function labSourceRecords() {
  const labFiles = (await readdir(PROTOTYPE_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(PROTOTYPE_ROOT, entry.name));
  return Promise.all(labFiles.sort().map((file) => fileRecord(file)));
}

async function sourceRecords(labRecords) {
  const planningFiles = [
    "PHASE_2_INTERIOR_VISUAL_SYSTEM_GOAL.md",
    "PHASE_2_CREATIVE_THESIS.md",
    "PHASE_2_STORYBOARD.md",
    "PHASE_2_MOTION_SYSTEM.md",
    "PHASE_2_MEDIA_REQUIREMENTS.md",
    "PHASE_2_SUPPORTING_ROUTE_STRATEGY.md",
  ].map((name) => path.join(ROOT, "docs", "planning", name));
  const evidenceScripts = [
    path.join(ROOT, "scripts", "capture-phase2a-storyboard.mjs"),
    path.join(ROOT, "scripts", "verify-phase2a-isolation.mjs"),
  ];
  const otherRecords = await Promise.all([...planningFiles, ...evidenceScripts].sort().map((file) => fileRecord(file)));
  return [...labRecords, ...otherRecords].sort((left, right) => left.path.localeCompare(right.path));
}

async function loadIsolationAuthority(labRecords) {
  const bytes = await readFile(ISOLATION_REPORT);
  const report = JSON.parse(bytes.toString("utf8"));
  const labCheck = report.checks?.find(({ id }) => id === "lab-containment-and-asset-policy");
  const frozenCheck = report.checks?.find(({ id }) => id === "frozen-production-and-governance-boundary");
  const currentLabAggregate = aggregateDigest(labRecords);
  if (report.status !== "PASS" || report.baselineSha !== ACCEPTED_PARENT) {
    throw new Error("Phase 2A isolation report is not a PASS for the accepted parent");
  }
  if (labCheck?.status !== "PASS" || labCheck.aggregateSha256 !== currentLabAggregate || labCheck.files !== labRecords.length) {
    throw new Error("Phase 2A isolation report is stale for the current lab sources; rerun the isolation verifier");
  }
  if (frozenCheck?.status !== "PASS" || frozenCheck.currentAggregateSha256 !== frozenCheck.baselineAggregateSha256) {
    throw new Error("Phase 2A isolation report does not prove a byte-identical production boundary");
  }
  return {
    record: await fileRecord(ISOLATION_REPORT),
    status: report.status,
    frozenBoundaryCheck: frozenCheck.id,
    labBoundaryCheck: labCheck.id,
    currentLabAggregateSha256: currentLabAggregate,
  };
}

function caseUrl(frame, motion = "full") {
  const url = new URL(BASE_URL);
  url.searchParams.set("frame", frame);
  if (motion === "reduced") url.searchParams.set("motion", "reduced");
  return url.toString();
}

async function inspectFrame(page, expectedId) {
  return page.evaluate((id) => {
    const frame = document.getElementById(id);
    if (!(frame instanceof HTMLElement)) throw new Error(`Missing frame ${id}`);
    const textSelectors = "h1,h2,h3,p,a,li,strong,small,span";
    const clippedText = [];
    const visibleTextElements = [];
    for (const element of frame.querySelectorAll(textSelectors)) {
      if (!(element instanceof HTMLElement)) continue;
      if (element.querySelector(textSelectors)) continue;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || Number.parseFloat(style.opacity) === 0) continue;
      if (!(element.textContent ?? "").trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(element);
      const rect = range.getBoundingClientRect();
      const tolerance = 1.5;
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (rect.left < -tolerance || rect.top < -tolerance || rect.right > innerWidth + tolerance || rect.bottom > innerHeight + tolerance) {
        clippedText.push({
          tag: element.tagName.toLowerCase(),
          text: (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 100),
          rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
        });
      }
      visibleTextElements.push({
        element,
        rect,
        lineRects: [...range.getClientRects()].map(({ left, top, right, bottom, width, height }) => ({ left, top, right, bottom, width, height })),
      });
    }
    const occludedText = [];
    for (const { element, lineRects } of visibleTextElements) {
      for (const lineRect of lineRects) {
        if (lineRect.width <= 2 || lineRect.height <= 2) continue;
        const xPositions = [0.2, 0.5, 0.8].map((ratio) => lineRect.left + lineRect.width * ratio);
        const y = lineRect.top + lineRect.height * 0.5;
        const lineIsVisible = xPositions.some((x) => {
          const hit = document.elementFromPoint(x, y);
          return hit && (hit === element || element.contains(hit) || hit.contains(element));
        });
        if (!lineIsVisible) {
          occludedText.push({
            tag: element.tagName.toLowerCase(),
            text: (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 100),
            lineRect,
          });
        }
      }
    }
    const textOverlaps = [];
    for (let firstIndex = 0; firstIndex < visibleTextElements.length; firstIndex += 1) {
      const { element: first, rect: firstRect } = visibleTextElements[firstIndex];
      for (let secondIndex = firstIndex + 1; secondIndex < visibleTextElements.length; secondIndex += 1) {
        const { element: second, rect: secondRect } = visibleTextElements[secondIndex];
        if (first.contains(second) || second.contains(first)) continue;
        const overlapWidth = Math.min(firstRect.right, secondRect.right) - Math.max(firstRect.left, secondRect.left);
        const overlapHeight = Math.min(firstRect.bottom, secondRect.bottom) - Math.max(firstRect.top, secondRect.top);
        if (overlapWidth <= 2 || overlapHeight <= 2) continue;
        textOverlaps.push({
          first: (first.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 70),
          second: (second.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 70),
          overlap: { width: overlapWidth, height: overlapHeight },
        });
      }
    }
    const frameRect = frame.getBoundingClientRect();
    return {
      captureReady: document.documentElement.dataset.captureReady,
      fontStatus: document.fonts.status,
      viewport: { width: innerWidth, height: innerHeight },
      frameRect: { left: frameRect.left, top: frameRect.top, right: frameRect.right, bottom: frameRect.bottom },
      body: { scrollWidth: document.body.scrollWidth, scrollHeight: document.body.scrollHeight },
      document: { scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },
      clippedText,
      occludedText,
      textOverlaps,
      imageFailures: [...frame.querySelectorAll("img")]
        .filter((image) => !image.complete || image.naturalWidth === 0)
        .map((image) => image.getAttribute("src")),
    };
  }, expectedId);
}

async function captureCase(browser, specification, rawRoot, sequence) {
  const context = await browser.newContext({
    viewport: specification.viewport,
    colorScheme: "dark",
    reducedMotion: specification.motion === "reduced" ? "reduce" : "no-preference",
    serviceWorkers: "block",
    locale: "en-US",
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];
  const responseFailures = [];
  const externalRequests = [];
  const baseOrigin = new URL(BASE_URL).origin;

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => requestFailures.push({ url: request.url(), error: request.failure()?.errorText ?? "unknown" }));
  page.on("response", (response) => {
    if (response.status() >= 400) responseFailures.push({ url: response.url(), status: response.status() });
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (/^https?:$/.test(url.protocol) && url.origin !== baseOrigin) externalRequests.push(request.url());
  });

  const url = caseUrl(specification.frame, specification.motion);
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => document.documentElement.dataset.captureReady === "true", null, { timeout: 30_000 });
  const audit = await inspectFrame(page, specification.frame);
  const filename = `${String(sequence).padStart(3, "0")}--${specification.id}.png`;
  const destination = path.join(rawRoot, filename);
  await page.screenshot({ path: destination, type: "png", animations: "disabled", caret: "hide" });
  const bytes = await readFile(destination);
  const failures = [];
  if (!response || response.status() >= 400) failures.push(`route status ${response?.status() ?? "none"}`);
  if (audit.captureReady !== "true") failures.push(`capture readiness ${audit.captureReady}`);
  if (audit.fontStatus !== "loaded") failures.push(`font status ${audit.fontStatus}`);
  if (audit.body.scrollWidth > specification.viewport.width || audit.document.scrollWidth > specification.viewport.width) failures.push("horizontal overflow");
  if (audit.clippedText.length) failures.push(`${audit.clippedText.length} clipped text elements`);
  if (audit.occludedText.length) failures.push(`${audit.occludedText.length} occluded text lines`);
  if (audit.textOverlaps.length) failures.push(`${audit.textOverlaps.length} overlapping text pairs`);
  if (audit.imageFailures.length) failures.push(`${audit.imageFailures.length} failed images`);
  if (consoleErrors.length) failures.push(`${consoleErrors.length} console errors`);
  if (pageErrors.length) failures.push(`${pageErrors.length} page errors`);
  if (requestFailures.length) failures.push(`${requestFailures.length} request failures`);
  if (responseFailures.length) failures.push(`${responseFailures.length} HTTP failures`);
  if (externalRequests.length) failures.push(`${externalRequests.length} external requests`);

  await context.close();
  return {
    id: specification.id,
    group: specification.group,
    frame: specification.frame,
    motion: specification.motion,
    viewport: specification.viewport,
    raw: { basename: filename, bytes: bytes.length, sha256: sha256(bytes) },
    audit,
    errors: { consoleErrors, pageErrors, requestFailures, responseFailures, externalRequests },
    failures,
    status: failures.length ? "FAIL" : "PASS",
    rawPath: destination,
  };
}

async function captureSheet(browser, sheet, viewport, destination, expectation = {}) {
  const context = await browser.newContext({ viewport, colorScheme: "dark", reducedMotion: "no-preference", serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  const url = new URL(BASE_URL);
  url.searchParams.set("sheet", sheet);
  const response = await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => document.documentElement.dataset.captureReady === "true", null, { timeout: 30_000 });
  const audit = await page.evaluate(() => ({
    captureReady: document.documentElement.dataset.captureReady,
    fontStatus: document.fonts.status,
    transitionRows: [...document.querySelectorAll(".transition-row")].map((row) => ({
      label: row.getAttribute("data-label"),
      frames: row.querySelectorAll(".transition-frame").length,
    })),
    imageFailures: [...document.querySelectorAll("img")]
      .filter((image) => !image.complete || image.naturalWidth === 0)
      .map((image) => image.getAttribute("src")),
    dimensions: {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    },
  }));
  await page.screenshot({ path: destination, type: "png", fullPage: true, animations: "disabled", caret: "hide" });
  await context.close();
  const failures = [];
  if (!response || response.status() >= 400) failures.push(`route status ${response?.status() ?? "none"}`);
  if (errors.length) failures.push(...errors);
  if (audit.captureReady !== "true") failures.push(`capture readiness ${audit.captureReady}`);
  if (audit.fontStatus !== "loaded") failures.push(`font status ${audit.fontStatus}`);
  if (audit.imageFailures.length) failures.push(`${audit.imageFailures.length} failed images`);
  if (expectation.rows !== undefined && audit.transitionRows.length !== expectation.rows) {
    failures.push(`expected ${expectation.rows} transition rows; observed ${audit.transitionRows.length}`);
  }
  if (expectation.framesPerRow !== undefined && audit.transitionRows.some(({ frames }) => frames !== expectation.framesPerRow)) {
    failures.push(`one or more transition rows did not contain ${expectation.framesPerRow} frames`);
  }
  if (expectation.routes) {
    for (let index = 0; index < expectation.routes.length; index += 1) {
      const observed = audit.transitionRows[index]?.label?.toLocaleUpperCase("en-US") ?? "";
      const expected = expectation.routes[index].toLocaleUpperCase("en-US");
      if (!observed.includes(expected)) failures.push(`transition row ${index + 1} does not identify ${expectation.routes[index]}`);
    }
  }
  if (failures.length) throw new Error(`${sheet} sheet failed: ${failures.join(" | ")}`);
  return audit;
}

function buildCases(plan) {
  const cases = [];
  for (const frame of plan.desktopFrames) {
    cases.push({ id: `${frame.id}--desktop-1440x900`, frame: frame.id, viewport: plan.primaryViewports.desktop, motion: "full", group: "desktop-primary" });
    cases.push({ id: `${frame.id}--short-1366x650`, frame: frame.id, viewport: plan.validationViewports.shortDesktop, motion: "full", group: "desktop-short" });
  }
  for (const frame of plan.mobileFrames) {
    cases.push({ id: `${frame.id}--mobile-390x844`, frame: frame.id, viewport: plan.primaryViewports.mobile, motion: "full", group: "mobile-primary" });
    cases.push({ id: `${frame.id}--narrow-320x800`, frame: frame.id, viewport: plan.validationViewports.narrowMobile, motion: "full", group: "mobile-narrow" });
    cases.push({ id: `${frame.id}--landscape-844x390`, frame: frame.id, viewport: plan.validationViewports.mobileLandscape, motion: "full", group: "mobile-landscape" });
  }
  const primaryByFrame = new Map(cases.filter(({ group }) => group === "desktop-primary" || group === "mobile-primary").map((entry) => [entry.frame, entry]));
  for (const { id } of plan.reducedMotionChecks) {
    const primary = primaryByFrame.get(id);
    if (!primary) throw new Error(`Reduced-motion frame is not in a primary roster: ${id}`);
    cases.push({ ...primary, id: `${primary.id}--reduced`, motion: "reduced", group: "reduced-motion" });
  }
  return cases;
}

async function main() {
  const planBytes = await readFile(PLAN_PATH);
  const plan = JSON.parse(planBytes.toString("utf8"));
  const labRecords = await labSourceRecords();
  const isolationAuthority = await loadIsolationAuthority(labRecords);
  const rawRoot = await mkdtemp(path.join(tmpdir(), "quantum-phase2a-storyboard-"));
  await mkdir(OUTPUT_ROOT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--disable-background-networking", "--disable-component-update", "--disable-default-apps", "--no-first-run"] });
  const browserVersion = browser.version();
  const cases = buildCases(plan);
  const reports = [];
  let transitionSheetAudit;
  try {
    for (let index = 0; index < cases.length; index += 1) {
      console.log(`[${index + 1}/${cases.length}] ${cases[index].id}`);
      reports.push(await captureCase(browser, cases[index], rawRoot, index + 1));
    }
    transitionSheetAudit = await captureSheet(
      browser,
      "transitions",
      { width: 1920, height: 1080 },
      path.join(OUTPUT_ROOT, OUTPUTS.transitions),
      {
        rows: plan.transitions.length,
        framesPerRow: 3,
        routes: plan.transitions.map(({ from, to }) => `${from} → ${to}`),
      },
    );
  } finally {
    await browser.close();
  }

  await composeContactSheet({
    destination: path.join(OUTPUT_ROOT, OUTPUTS.desktop),
    title: "PHASE 2A-R · DESKTOP SPATIAL ARCHITECTURE",
    subtitle: "15 retained states · authored at 1440×900 · source frames shown at 60% scale",
    panels: panelsFromRoster(reports, plan.desktopFrames, plan.primaryViewports.desktop),
    columns: 2,
    panelWidth: 864,
    panelHeight: 540,
    labelHeight: 48,
  });
  await composeContactSheet({
    destination: path.join(OUTPUT_ROOT, OUTPUTS.mobile),
    title: "PHASE 2A-R · MOBILE SPATIAL JOURNEY",
    subtitle: "8 authored states · exact 390×844 source frames",
    panels: panelsFromRoster(reports, plan.mobileFrames, plan.primaryViewports.mobile),
    columns: 4,
    panelWidth: 390,
    panelHeight: 844,
    labelHeight: 44,
  });
  await composeContactSheet({
    destination: path.join(OUTPUT_ROOT, OUTPUTS.narrow),
    title: "PHASE 2A-R · 320PX HARD GATE",
    subtitle: "METHOD · INDUSTRIES · PROGRAMMES · CONVERSION · exact 320×800 source frames",
    panels: panelsFromRoster(reports, plan.narrowMobileChecks, plan.validationViewports.narrowMobile),
    columns: 4,
    panelWidth: 320,
    panelHeight: 800,
    labelHeight: 44,
  });
  await composeContactSheet({
    destination: path.join(OUTPUT_ROOT, OUTPUTS.reduced),
    title: "PHASE 2A-R · REDUCED-MOTION SPATIAL STATES",
    subtitle: "Static depth and occlusion · native document flow · desktop 1440×900 captures at 50% scale",
    panels: panelsFromRoster(reports, plan.reducedMotionChecks, plan.primaryViewports.desktop, "reduced"),
    columns: 3,
    panelWidth: 720,
    panelHeight: 450,
    labelHeight: 44,
  });
  await composeContactSheet({
    destination: path.join(OUTPUT_ROOT, OUTPUTS.comparison),
    title: "PHASE 2A-R · SPECTACLE CONSEQUENCE COMPARISON",
    subtitle: "Repaired environments beside the accepted PROOF benchmark · desktop 1440×900 captures at 50% scale",
    panels: panelsFromRoster(reports, plan.spectacleComparison, plan.primaryViewports.desktop),
    columns: 5,
    panelWidth: 720,
    panelHeight: 450,
    labelHeight: 44,
  });

  for (const { id, filename } of plan.retainedFullResolution) {
    const capture = findCapture(reports, id, plan.primaryViewports.desktop);
    await copyFile(capture.rawPath, path.join(OUTPUT_ROOT, filename));
  }

  const intendedOutputPaths = plan.retainedOutputs
    .filter((relativePath) => !relativePath.endsWith(`/${OUTPUTS.manifest}`))
    .map((relativePath) => path.join(ROOT, relativePath));
  const outputRecords = (await Promise.all(intendedOutputPaths.map((filename) => fileRecord(filename))))
    .sort((left, right) => left.path.localeCompare(right.path));
  const buildReport = await stat(BUILD_REPORT).then(() => fileRecord(BUILD_REPORT)).catch(() => null);
  const failures = reports.flatMap((report) => report.failures.map((failure) => ({
    case: report.id,
    failure,
    clippedText: report.audit.clippedText,
    textOverlaps: report.audit.textOverlaps,
  })));
  const sources = await sourceRecords(labRecords);
  const rawRecords = reports.map((report) => ({
    path: report.raw.basename,
    bytes: report.raw.bytes,
    sha256: report.raw.sha256,
  }));
  const manifest = {
    schemaVersion: 2,
    authority: "phase-2a-r-cinematic-spatial-architecture-review",
    status: failures.length ? "FAIL" : "PASS",
    productionAuthority: {
      acceptedParent: ACCEPTED_PARENT,
      productionSourceChanged: isolationAuthority.status !== "PASS",
      isolationReport: isolationAuthority.record,
      isolationChecks: {
        frozenBoundary: isolationAuthority.frozenBoundaryCheck,
        labBoundary: isolationAuthority.labBoundaryCheck,
        currentLabAggregateSha256: isolationAuthority.currentLabAggregateSha256,
      },
      buildReport,
    },
    capturePlan: { path: path.relative(ROOT, PLAN_PATH).replaceAll("\\", "/"), bytes: planBytes.length, sha256: sha256(planBytes) },
    browser: { name: "Google Chrome", version: browserVersion },
    rawPolicy: "Raw browser captures remain in a unique OS-temporary directory; only portable basenames, dimensions, byte sizes and hashes are retained.",
    cases: reports.map(({ rawPath, ...report }) => report),
    visualRoster: {
      desktop: plan.desktopFrames,
      mobile: plan.mobileFrames,
      narrowMobile: plan.narrowMobileChecks,
      reducedMotion: plan.reducedMotionChecks,
      transitions: plan.transitions,
      transitionSheetAudit,
      spectacleComparison: plan.spectacleComparison,
      fullResolution: plan.retainedFullResolution,
    },
    sources,
    retainedOutputs: outputRecords,
    bindings: {
      sourceAggregateSha256: aggregateDigest(sources),
      rawCaptureAggregateSha256: aggregateDigest(rawRecords),
      retainedOutputAggregateSha256: aggregateDigest(outputRecords),
    },
    summary: {
      cases: reports.length,
      passing: reports.filter(({ status }) => status === "PASS").length,
      failing: reports.filter(({ status }) => status === "FAIL").length,
      groups: Object.fromEntries([...new Set(cases.map(({ group }) => group))].map((group) => [group, reports.filter((report) => report.group === group).length])),
      transitionSequences: plan.transitions.length,
      transitionFrames: plan.transitions.reduce((sum, transition) => sum + transition.frames, 0),
      retainedEvidenceBytes: outputRecords.reduce((sum, output) => sum + output.bytes, 0),
      failures,
    },
  };
  await writeFile(path.join(OUTPUT_ROOT, OUTPUTS.manifest), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Raw captures: ${rawRoot}`);
  console.log(`Evidence: ${OUTPUT_ROOT}`);
  console.log(`${manifest.status}: ${manifest.summary.passing}/${manifest.summary.cases} viewport cases passed.`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
