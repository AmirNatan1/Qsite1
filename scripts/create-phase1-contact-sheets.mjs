import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REPORT = path.join(ROOT, "artifacts", "evidence", "phase-1", "phase-1-browser-report.json");
const DEFAULT_OUTPUT = path.join(ROOT, "artifacts", "evidence", "phase-1", "review");

const SHEETS = Object.freeze([
  { group: "home", filename: "phase-1-home-review.png", title: "PHASE 1 · HOME REVIEW" },
  { group: "supporting", filename: "phase-1-supporting-routes-review.png", title: "PHASE 1 · SUPPORTING ROUTES" },
  { group: "responsive", filename: "phase-1-responsive-review.png", title: "PHASE 1 · RESPONSIVE REVIEW" },
  { group: "accessibility", filename: "phase-1-accessibility-review.png", title: "PHASE 1 · ACCESSIBILITY & STRESS" },
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
]);

const MANIFEST_FILENAME = "phase-1-visual-evidence-manifest.json";

const LAYOUT = Object.freeze({
  columns: 3,
  tileWidth: 452,
  previewHeight: 300,
  labelHeight: 66,
  gap: 14,
  padding: 18,
  headerHeight: 74,
  background: "#0e1112",
  tileBackground: "#161b1c",
});

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

The source captures remain in their OS temp directory. This script writes three key full-size
Home captures, four compact contact sheets, and a hash manifest.`);
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

function labelSvg(screenshot) {
  const primary = escapeXml(shortened(screenshot.label));
  const secondary = escapeXml(
    shortened(`${screenshot.route} · ${screenshot.viewport.id} · ${screenshot.scenario}`, 78),
  );
  return Buffer.from(`
    <svg width="${LAYOUT.tileWidth}" height="${LAYOUT.labelHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#161b1c"/>
      <line x1="0" y1="1" x2="${LAYOUT.tileWidth}" y2="1" stroke="rgba(255,255,255,.12)"/>
      <text x="14" y="27" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="700">${primary}</text>
      <text x="14" y="49" fill="#8a9797" font-family="Arial, Helvetica, sans-serif" font-size="11">${secondary}</text>
    </svg>
  `);
}

function headerSvg(title, count, report) {
  const subtitle = `${count} curated frames · ${report.generatedAt ?? "unknown generation time"} · ${report.summary?.status ?? "UNKNOWN"}`;
  const width = LAYOUT.padding * 2 + LAYOUT.columns * LAYOUT.tileWidth + (LAYOUT.columns - 1) * LAYOUT.gap;
  return Buffer.from(`
    <svg width="${width}" height="${LAYOUT.headerHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#0e1112"/>
      <circle cx="${LAYOUT.padding + 5}" cy="28" r="5" fill="#d82b72"/>
      <text x="${LAYOUT.padding + 20}" y="34" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="700" letter-spacing="1">${escapeXml(title)}</text>
      <text x="${LAYOUT.padding}" y="58" fill="#8a9797" font-family="Arial, Helvetica, sans-serif" font-size="11">${escapeXml(subtitle)}</text>
    </svg>
  `);
}

async function tileBuffer(screenshot) {
  const preview = await sharp(screenshot.path)
    .rotate()
    .resize(LAYOUT.tileWidth, LAYOUT.previewHeight, {
      fit: "contain",
      position: "top",
      background: LAYOUT.tileBackground,
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  return sharp({
    create: {
      width: LAYOUT.tileWidth,
      height: LAYOUT.previewHeight + LAYOUT.labelHeight,
      channels: 4,
      background: LAYOUT.tileBackground,
    },
  })
    .composite([
      { input: preview, left: 0, top: 0 },
      { input: labelSvg(screenshot), left: 0, top: LAYOUT.previewHeight },
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
  const selected = screenshots
    .filter(({ groups }) => groups.includes(specification.group))
    .sort((left, right) => {
      const leftOrder = left.groupOrder?.[specification.group] ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.groupOrder?.[specification.group] ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.id.localeCompare(right.id);
    });
  if (selected.length === 0) throw new Error(`No screenshots in report group: ${specification.group}`);

  const tiles = await Promise.all(selected.map(tileBuffer));
  const rows = Math.ceil(tiles.length / LAYOUT.columns);
  const canvasWidth = LAYOUT.padding * 2 + LAYOUT.columns * LAYOUT.tileWidth + (LAYOUT.columns - 1) * LAYOUT.gap;
  const tileHeight = LAYOUT.previewHeight + LAYOUT.labelHeight;
  const canvasHeight = LAYOUT.headerHeight + LAYOUT.padding + rows * tileHeight + (rows - 1) * LAYOUT.gap + LAYOUT.padding;
  const composites = [{ input: headerSvg(specification.title, selected.length, report), left: 0, top: 0 }];
  for (let index = 0; index < tiles.length; index += 1) {
    const column = index % LAYOUT.columns;
    const row = Math.floor(index / LAYOUT.columns);
    composites.push({
      input: tiles[index],
      left: LAYOUT.padding + column * (LAYOUT.tileWidth + LAYOUT.gap),
      top: LAYOUT.headerHeight + LAYOUT.padding + row * (tileHeight + LAYOUT.gap),
    });
  }

  const destination = path.join(outputDirectory, specification.filename);
  const image = sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: LAYOUT.background,
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
    report.unknownPath?.status !== "PASS" ||
    (report.unknownPath?.failures?.length ?? -1) !== 0
  ) {
    throw new Error("Visual evidence requires the complete passing 309-case Astro production-preview report");
  }
  if (!Array.isArray(report.screenshots)) throw new Error("Report does not contain a screenshots array");
  if (report.screenshots.length !== 21) throw new Error("Full browser evidence must contain exactly 21 curated screenshots");

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
    schemaVersion: 2,
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
    rawCapturePolicy: "Generated in OS temporary storage; only the seven curated PNG files are retained.",
    files,
  };
  await atomicBufferWrite(
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
    path.join(options.output, MANIFEST_FILENAME),
  );

  console.log(
    `Created ${keyOutputs.length} key captures, ${outputs.length} contact sheets, and ${MANIFEST_FILENAME}. Raw captures remain untouched at ${captureRoot}.`,
  );
}

main().catch((error) => {
  console.error(`Phase 1 contact-sheet generation stopped: ${error.stack ?? error.message}`);
  process.exitCode = 1;
});
