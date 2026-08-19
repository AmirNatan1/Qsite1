import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REPORT = path.join(ROOT, "artifacts", "evidence", "phase-1", "phase-1-browser-report.json");
const DEFAULT_OUTPUT = path.join(ROOT, "artifacts", "evidence", "phase-1", "review");

const SUPPORTING_ROUTE_IDS = Object.freeze([
  "for-industry",
  "for-startups",
  "industries",
  "proof",
  "maradin",
  "spark",
  "about",
  "contact",
  "404",
]);
const SHORT_HEIGHT_ROUTE_IDS = Object.freeze(["for-industry", "for-startups", "industries", "maradin"]);
const TYPOGRAPHY_ROUTE_IDS = Object.freeze(["for-industry", "maradin", "spark", "contact"]);

const HOME_CAPTURE_IDS = Object.freeze([
  "baseline--home--desktop-1440x900",
  "baseline--home--short-desktop-1366x650",
  "baseline--home--mobile-390x844",
  "baseline--home--narrow-320x800",
  "baseline--home--mobile-landscape-844x390",
]);
const SUPPORTING_390_CAPTURE_IDS = Object.freeze(
  SUPPORTING_ROUTE_IDS.map((routeId) => `baseline--${routeId}--mobile-390x844`),
);
const SUPPORTING_320_CAPTURE_IDS = Object.freeze(
  SUPPORTING_ROUTE_IDS.map((routeId) => `baseline--${routeId}--narrow-320x800`),
);
const SHORT_HEIGHT_CAPTURE_IDS = Object.freeze(
  SHORT_HEIGHT_ROUTE_IDS.map((routeId) => `baseline--${routeId}--short-desktop-1366x650`),
);
const LANDSCAPE_CAPTURE_IDS = Object.freeze([
  HOME_CAPTURE_IDS[4],
  ...SHORT_HEIGHT_ROUTE_IDS.map((routeId) => `baseline--${routeId}--mobile-landscape-844x390`),
]);
const ACCESSIBILITY_CAPTURE_IDS = Object.freeze([
  ...TYPOGRAPHY_ROUTE_IDS.map((routeId) => `text-200--${routeId}--mobile`),
  ...TYPOGRAPHY_ROUTE_IDS.map((routeId) => `fallback--${routeId}--mobile-390x844`),
  "keyboard-focus-mobile",
  "js-disabled-nav-mobile",
]);
const REQUIRED_CAPTURE_IDS = Object.freeze([
  ...HOME_CAPTURE_IDS,
  ...SUPPORTING_390_CAPTURE_IDS,
  ...SUPPORTING_320_CAPTURE_IDS,
  ...SHORT_HEIGHT_CAPTURE_IDS,
  ...SHORT_HEIGHT_ROUTE_IDS.map((routeId) => `baseline--${routeId}--mobile-landscape-844x390`),
  ...ACCESSIBILITY_CAPTURE_IDS,
]);

const SHEETS = Object.freeze([
  {
    group: "supporting-mobile-390",
    filename: "phase-1-supporting-routes-mobile-390-review.png",
    title: "PHASE 1 · SUPPORTING ROUTES · 390×844",
    sourceIds: SUPPORTING_390_CAPTURE_IDS,
    layout: { columns: 3, tileWidth: 390, previewHeight: 844 },
  },
  {
    group: "supporting-mobile-320",
    filename: "phase-1-supporting-routes-mobile-320-review.png",
    title: "PHASE 1 · SUPPORTING ROUTES · 320×800",
    sourceIds: SUPPORTING_320_CAPTURE_IDS,
    layout: { columns: 3, tileWidth: 320, previewHeight: 800 },
  },
  {
    group: "short-height",
    filename: "phase-1-short-height-review.png",
    title: "PHASE 1 · SUPPORTING ROUTES · 1366×650",
    sourceIds: SHORT_HEIGHT_CAPTURE_IDS,
    layout: { columns: 2, tileWidth: 683, previewHeight: 325 },
  },
  {
    group: "mobile-landscape",
    filename: "phase-1-mobile-landscape-review.png",
    title: "PHASE 1 · MOBILE LANDSCAPE · 844×390",
    sourceIds: LANDSCAPE_CAPTURE_IDS,
    layout: { columns: 2, tileWidth: 633, previewHeight: 293 },
  },
  {
    group: "accessibility-typography",
    filename: "phase-1-accessibility-typography-review.png",
    title: "PHASE 1 · 200% TEXT · FALLBACK · OPEN NAVIGATION",
    sourceIds: ACCESSIBILITY_CAPTURE_IDS,
    layout: { columns: 4, tileWidth: 390, previewHeight: 844 },
  },
]);

const KEY_CAPTURES = Object.freeze([
  {
    id: "baseline--home--desktop-1440x900",
    filename: "phase-1-home-desktop-1440x900.png",
  },
  {
    id: "baseline--home--short-desktop-1366x650",
    filename: "phase-1-home-short-1366x650.png",
  },
  {
    id: "baseline--home--mobile-390x844",
    filename: "phase-1-home-mobile-390x844.png",
  },
  {
    id: "baseline--home--narrow-320x800",
    filename: "phase-1-home-mobile-320x800.png",
  },
]);

const MANIFEST_FILENAME = "phase-1-visual-evidence-manifest.json";
const LAYOUT_COMMON = Object.freeze({
  labelHeight: 66,
  gap: 14,
  padding: 18,
  headerHeight: 74,
  background: "#0e1112",
  tileBackground: "#161b1c",
});

const LEGACY_GENERATED_FILES = Object.freeze([
  "phase-1-home-review.png",
  "phase-1-supporting-routes-review.png",
  "phase-1-responsive-review.png",
  "phase-1-accessibility-review.png",
]);

function parseArguments(argv) {
  const options = { report: DEFAULT_REPORT, output: DEFAULT_OUTPUT, captureRoot: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--report") options.report = argv[++index] ?? "";
    else if (value === "--output-dir") options.output = argv[++index] ?? "";
    else if (value === "--capture-root") options.captureRoot = argv[++index] ?? "";
    else if (value === "--help" || value === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!options.report || !options.output || (argv.includes("--capture-root") && !options.captureRoot)) {
    throw new Error("--report, --output-dir and --capture-root require a value when supplied");
  }
  return {
    ...options,
    report: path.resolve(options.report),
    output: path.resolve(options.output),
    captureRoot: options.captureRoot ? path.resolve(options.captureRoot) : null,
  };
}

function usage() {
  console.log(`Create compact Phase 1 contact sheets from the browser report.

Usage:
  node scripts/create-phase1-contact-sheets.mjs [--report PATH] [--output-dir PATH] [--capture-root PATH]

Defaults:
  report: ${DEFAULT_REPORT}
  output: ${DEFAULT_OUTPUT}

The source captures remain in their OS temp directory. This script writes four key full-size
Home captures, five compact high-resolution contact sheets, and a hash manifest.`);
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function shortened(value, maximum = 62) {
  const normalized = String(value).replace(/\s+/g, " ").trim();
  return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 1).trimEnd()}…`;
}

function resolveCaptureRoot(report, override) {
  if (override) return override;
  const sessionId = report.captureSessionId;
  if (
    typeof sessionId !== "string"
    || sessionId !== path.basename(sessionId)
    || !/^quantum-phase1-qa-[a-z0-9_-]+$/i.test(sessionId)
  ) {
    throw new Error("Report has no safe captureSessionId; rerun Phase 1 browser QA to generate schema v2 evidence");
  }
  const temporaryRoot = path.resolve(tmpdir());
  const captureRoot = path.resolve(temporaryRoot, sessionId);
  const relative = path.relative(temporaryRoot, captureRoot);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Report captureSessionId resolves outside OS temporary storage");
  }
  return captureRoot;
}

async function resolveAndVerifyScreenshot(screenshot, captureRoot) {
  if (
    typeof screenshot.filename !== "string"
    || screenshot.filename !== path.basename(screenshot.filename)
    || !/^\d{3}--[a-z0-9-]+\.png$/i.test(screenshot.filename)
  ) {
    throw new Error(`Screenshot has no safe portable filename: ${screenshot.id ?? "unknown id"}`);
  }
  if (!Number.isInteger(screenshot.bytes) || screenshot.bytes <= 0 || !/^[a-f0-9]{64}$/i.test(screenshot.sha256 ?? "")) {
    throw new Error(`Screenshot has invalid size/hash evidence: ${screenshot.id ?? screenshot.filename}`);
  }

  const capturePath = path.join(captureRoot, screenshot.filename);
  let bytes;
  try {
    bytes = await readFile(capturePath);
  } catch {
    throw new Error(`Raw capture is unavailable: ${screenshot.filename}`);
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== screenshot.bytes || sha256 !== screenshot.sha256.toLowerCase()) {
    throw new Error(`Raw capture does not match report size/hash: ${screenshot.filename}`);
  }
  return {
    ...screenshot,
    path: capturePath,
    groups: Array.isArray(screenshot.groups) ? screenshot.groups : [],
  };
}

function labelSvg(screenshot, layout) {
  const primary = escapeXml(shortened(screenshot.label));
  const secondary = escapeXml(
    shortened(`${screenshot.route} · ${screenshot.viewport.id} · ${screenshot.scenario}`, 78),
  );
  return Buffer.from(`
    <svg width="${layout.tileWidth}" height="${layout.labelHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#161b1c"/>
      <line x1="0" y1="1" x2="${layout.tileWidth}" y2="1" stroke="rgba(255,255,255,.12)"/>
      <text x="14" y="27" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="700">${primary}</text>
      <text x="14" y="49" fill="#8a9797" font-family="Arial, Helvetica, sans-serif" font-size="11">${secondary}</text>
    </svg>
  `);
}

function headerSvg(title, count, report, layout) {
  const subtitle = `${count} curated frames · ${report.generatedAt ?? "unknown generation time"} · ${report.summary?.status ?? "UNKNOWN"}`;
  const width = layout.padding * 2 + layout.columns * layout.tileWidth + (layout.columns - 1) * layout.gap;
  return Buffer.from(`
    <svg width="${width}" height="${layout.headerHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#0e1112"/>
      <rect x="${layout.padding}" y="25" width="14" height="3" fill="#d82b72"/>
      <text x="${layout.padding + 24}" y="34" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="700" letter-spacing="1">${escapeXml(title)}</text>
      <text x="${layout.padding}" y="58" fill="#8a9797" font-family="Arial, Helvetica, sans-serif" font-size="11">${escapeXml(subtitle)}</text>
    </svg>
  `);
}

async function tileBuffer(screenshot, layout) {
  const preview = await sharp(screenshot.path)
    .rotate()
    .resize(layout.tileWidth, layout.previewHeight, {
      fit: "contain",
      position: "top",
      background: layout.tileBackground,
      withoutEnlargement: true,
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  return sharp({
    create: {
      width: layout.tileWidth,
      height: layout.previewHeight + layout.labelHeight,
      channels: 4,
      background: layout.tileBackground,
    },
  })
    .composite([
      { input: preview, left: 0, top: 0 },
      { input: labelSvg(screenshot, layout), left: 0, top: layout.previewHeight },
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function atomicSharpWrite(image, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp.png`;
  await image.toFile(temporary);
  try {
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function atomicBufferWrite(buffer, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, buffer);
  try {
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function describePng(destination, kind, extra = {}) {
  const buffer = await readFile(destination);
  const metadata = await sharp(buffer).metadata();
  return {
    filename: path.basename(destination),
    kind,
    width: metadata.width,
    height: metadata.height,
    bytes: buffer.byteLength,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    ...extra,
  };
}

async function buildSheet(specification, screenshots, report, outputDirectory) {
  const layout = Object.freeze({ ...LAYOUT_COMMON, ...specification.layout });
  const selected = screenshots
    .filter(({ groups }) => groups.includes(specification.group))
    .sort((left, right) => {
      const leftOrder = left.groupOrder?.[specification.group] ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.groupOrder?.[specification.group] ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.id.localeCompare(right.id);
    });
  if (selected.length === 0) throw new Error(`No screenshots in report group: ${specification.group}`);
  const selectedIds = selected.map(({ id }) => id);
  if (JSON.stringify(selectedIds) !== JSON.stringify(specification.sourceIds)) {
    throw new Error(
      `Contact-sheet source contract mismatch for ${specification.group}: expected ${specification.sourceIds.join(", ")}; observed ${selectedIds.join(", ")}`,
    );
  }

  const tiles = await Promise.all(selected.map((screenshot) => tileBuffer(screenshot, layout)));
  const rows = Math.ceil(tiles.length / layout.columns);
  const canvasWidth = layout.padding * 2 + layout.columns * layout.tileWidth + (layout.columns - 1) * layout.gap;
  const tileHeight = layout.previewHeight + layout.labelHeight;
  const canvasHeight = layout.headerHeight + layout.padding + rows * tileHeight + (rows - 1) * layout.gap + layout.padding;
  const composites = [{ input: headerSvg(specification.title, selected.length, report, layout), left: 0, top: 0 }];
  for (let index = 0; index < tiles.length; index += 1) {
    const column = index % layout.columns;
    const row = Math.floor(index / layout.columns);
    composites.push({
      input: tiles[index],
      left: layout.padding + column * (layout.tileWidth + layout.gap),
      top: layout.headerHeight + layout.padding + row * (tileHeight + layout.gap),
    });
  }

  const destination = path.join(outputDirectory, specification.filename);
  const image = sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: layout.background,
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false });
  await atomicSharpWrite(image, destination);
  const metadata = await sharp(destination).metadata();
  return {
    group: specification.group,
    path: path.resolve(destination),
    sourceFrames: selected.length,
    sourceCases: selectedIds,
    width: metadata.width,
    height: metadata.height,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (REQUIRED_CAPTURE_IDS.length !== 41 || new Set(REQUIRED_CAPTURE_IDS).size !== 41) {
    throw new Error("Curated browser capture contract must contain exactly 41 unique case IDs");
  }
  const representedCaptureIds = new Set([
    ...KEY_CAPTURES.map(({ id }) => id),
    ...SHEETS.flatMap(({ sourceIds }) => sourceIds),
  ]);
  if (
    representedCaptureIds.size !== REQUIRED_CAPTURE_IDS.length
    || !REQUIRED_CAPTURE_IDS.every((id) => representedCaptureIds.has(id))
  ) {
    throw new Error("Every curated browser capture must be represented by one full-size key or contact sheet");
  }
  const retainedPngNames = [
    ...KEY_CAPTURES.map(({ filename }) => filename),
    ...SHEETS.map(({ filename }) => filename),
  ];
  if (retainedPngNames.length !== 9 || new Set(retainedPngNames).size !== 9) {
    throw new Error("Visual evidence contract must retain exactly nine uniquely named PNG files");
  }
  const browserReportBytes = await readFile(options.report);
  const report = JSON.parse(browserReportBytes.toString("utf8"));
  if (report.authority !== "phase-1-browser-qa") throw new Error("Report is not Phase 1 browser QA evidence");
  if (report.schemaVersion !== 2) throw new Error("Browser report schema is not portable v2; rerun Phase 1 browser QA");
  if (
    report.mode !== "full" ||
    report.target?.serverMode !== "astro-preview" ||
    report.summary?.status !== "PASS" ||
    report.summary?.cases !== 309 ||
    report.summary?.passingCases !== 309 ||
    report.summary?.failingCases !== 0 ||
    report.summary?.totalFailures !== 0 ||
    report.summary?.baselineCases !== 140 ||
    report.summary?.fallbackFontMatrixCases !== 140 ||
    report.summary?.retainedStressCases !== 29 ||
    report.summary?.curatedScreenshots !== 41 ||
    report.unknownPath?.status !== "PASS" ||
    (report.unknownPath?.failures?.length ?? -1) !== 0
  ) {
    throw new Error("Visual evidence requires the complete passing 309-case Astro production-preview report");
  }
  if (!Array.isArray(report.screenshots)) throw new Error("Report does not contain a screenshots array");
  if (report.screenshots.length !== 41) throw new Error("Full browser evidence must contain exactly 41 curated screenshots");
  const actualCaptureIds = report.screenshots.map(({ id }) => id);
  if (new Set(actualCaptureIds).size !== actualCaptureIds.length) {
    throw new Error("Full browser evidence contains duplicate curated screenshot IDs");
  }
  const expectedCaptureIds = [...REQUIRED_CAPTURE_IDS].sort();
  const sortedActualCaptureIds = [...actualCaptureIds].sort();
  if (JSON.stringify(sortedActualCaptureIds) !== JSON.stringify(expectedCaptureIds)) {
    throw new Error(
      `Full browser evidence capture set differs from the 41-frame review contract; expected ${expectedCaptureIds.join(", ")}; observed ${sortedActualCaptureIds.join(", ")}`,
    );
  }

  const buildReportPath = path.join(path.dirname(options.report), "phase-1-build-report.json");
  const buildReportBytes = await readFile(buildReportPath);
  const buildReportSha256 = createHash("sha256").update(buildReportBytes).digest("hex");
  if (report.target?.buildReport?.sha256 !== buildReportSha256) {
    throw new Error("Browser evidence is not bound to the current Phase 1 build report");
  }

  const captureRoot = resolveCaptureRoot(report, options.captureRoot);
  const screenshots = await Promise.all(
    report.screenshots.map((screenshot) => resolveAndVerifyScreenshot(screenshot, captureRoot)),
  );

  await mkdir(options.output, { recursive: true });
  const outputs = [];
  for (const specification of SHEETS) {
    const output = await buildSheet(specification, screenshots, report, options.output);
    outputs.push(output);
    console.log(`${specification.group}: ${output.path} (${output.width}×${output.height}, ${output.sourceFrames} frames)`);
  }

  const keyOutputs = [];
  for (const specification of KEY_CAPTURES) {
    const source = screenshots.find(({ id }) => id === specification.id);
    if (!source) throw new Error(`Key capture is absent from report: ${specification.id}`);
    const destination = path.join(options.output, specification.filename);
    await atomicBufferWrite(await readFile(source.path), destination);
    keyOutputs.push({ destination, source });
    console.log(`key: ${destination} (${source.label})`);
  }

  const files = [];
  for (const output of outputs) {
    files.push(
      await describePng(output.path, "contact-sheet", {
        group: output.group,
        sourceFrames: output.sourceFrames,
        sourceCases: output.sourceCases,
      }),
    );
  }
  for (const { destination, source } of keyOutputs) {
    files.push(
      await describePng(destination, "key-full-size", {
        sourceCase: source.id,
        route: source.route,
        viewport: source.viewport.id,
        scenario: source.scenario,
      }),
    );
  }
  files.sort((left, right) => left.filename.localeCompare(right.filename));

  const manifest = {
    schemaVersion: 3,
    authority: "phase-1-curated-visual-evidence",
    generatedAt: report.generatedAt,
    browserReport: {
      path: "../phase-1-browser-report.json",
      sha256: createHash("sha256").update(browserReportBytes).digest("hex"),
    },
    buildReport: {
      ...report.target.buildReport,
      path: "../phase-1-build-report.json",
      sha256: buildReportSha256,
    },
    browserCases: report.summary?.cases,
    browserStatus: report.summary?.status,
    captureContract: {
      rawScreenshots: REQUIRED_CAPTURE_IDS.length,
      homeViews: HOME_CAPTURE_IDS.length,
      supportingMobile390: SUPPORTING_390_CAPTURE_IDS.length,
      supportingMobile320: SUPPORTING_320_CAPTURE_IDS.length,
      shortHeight: SHORT_HEIGHT_CAPTURE_IDS.length,
      mobileLandscape: LANDSCAPE_CAPTURE_IDS.length,
      accessibilityTypographyAndOpenNavigation: ACCESSIBILITY_CAPTURE_IDS.length,
      retainedPngFiles: SHEETS.length + KEY_CAPTURES.length,
    },
    rawCapturePolicy: "Generated in OS temporary storage; only four full-size Home captures and five high-resolution contact sheets are retained.",
    files,
  };
  await atomicBufferWrite(
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
    path.join(options.output, MANIFEST_FILENAME),
  );

  const intendedGeneratedFiles = [
    ...SHEETS.map(({ filename }) => filename),
    ...KEY_CAPTURES.map(({ filename }) => filename),
    MANIFEST_FILENAME,
  ].sort();
  for (const filename of LEGACY_GENERATED_FILES) {
    if (intendedGeneratedFiles.includes(filename)) continue;
    await unlink(path.join(options.output, filename)).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
  const actualGeneratedFiles = (await readdir(options.output))
    .filter((filename) => /^phase-1-.*\.(?:png|json)$/i.test(filename))
    .sort();
  if (JSON.stringify(actualGeneratedFiles) !== JSON.stringify(intendedGeneratedFiles)) {
    throw new Error(
      `Review output set differs from the exact nine-PNG-plus-manifest contract; expected ${intendedGeneratedFiles.join(", ")}; observed ${actualGeneratedFiles.join(", ")}`,
    );
  }
  for (const record of files) {
    const bytes = await readFile(path.join(options.output, record.filename));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (bytes.byteLength !== record.bytes || sha256 !== record.sha256) {
      throw new Error(`Retained visual evidence changed after manifest hashing: ${record.filename}`);
    }
  }

  console.log(
    `Created ${keyOutputs.length} key captures, ${outputs.length} contact sheets, and ${MANIFEST_FILENAME}. Raw captures remain untouched at ${captureRoot}.`,
  );
}

main().catch((error) => {
  console.error(`Phase 1 contact-sheet generation stopped: ${error.stack ?? error.message}`);
  process.exitCode = 1;
});
