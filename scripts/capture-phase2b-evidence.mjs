import { createHash, randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { chromium } from "playwright-core";
import sharp from "sharp";

const ROOT = path.resolve(process.cwd());
const BASE_URL = process.env.PHASE2B_BASE_URL ?? "http://127.0.0.1:4322";
const OUTPUT_ROOT = path.join(ROOT, "artifacts", "evidence", "phase-2b", "review");
const ACCEPTED_PARENT = "4121e009b970cce480c4220c964cbc218e35d73c";
const execFileAsync = promisify(execFile);

const OUTPUTS = Object.freeze({
  desktop: "phase-2b-desktop-production-keyframes.png",
  short: "phase-2b-short-height-keyframes.png",
  mobile390: "phase-2b-mobile-390-keyframes.png",
  mobile320: "phase-2b-mobile-320-keyframes.png",
  reduced: "phase-2b-reduced-motion-keyframes.png",
  comparison: "phase-2b-static-poster-comparison.png",
  motion: "phase-2b-motion-scroll-sequence.png",
  manifest: "phase-2b-visual-evidence-manifest.json",
});

const SOURCE_PATHS = Object.freeze([
  "package.json",
  "src/pages/index.astro",
  "src/components/home/EntryField.astro",
  "src/components/home/BuiltWithIndustry.astro",
  "src/components/home/MethodField.astro",
  "src/components/home/IndustryTerritories.astro",
  "src/components/home/ProofField.astro",
  "src/components/home/ProgrammesField.astro",
  "src/components/home/ConversionField.astro",
  "src/styles/routes/home.css",
  "src/styles/routes/home-method.css",
  "src/styles/routes/home-responsive.css",
  "src/scripts/home-operating-field.ts",
  "scripts/verify-phase2b-source.mjs",
  "scripts/verify-phase2b-output.mjs",
  "scripts/qa-phase2b-browser.mjs",
  "scripts/capture-phase2b-evidence.mjs",
]);

const desktopCases = Object.freeze([
  ["desktop-entry", "01 · ENTRY", "#entry", 0],
  ["desktop-industry", "02 · BUILT WITH INDUSTRY", "#built-with-industry", 0.48],
  ["desktop-method-frame", "03 · METHOD / FRAME", "#method-frame", 0.5],
  ["desktop-method-assess", "04 · METHOD / ASSESS", "#method-assess", 0.5],
  ["desktop-method-test", "05 · METHOD / TEST", "#method-test", 0.5],
  ["desktop-method-decide", "06 · METHOD / DECIDE", "#method-decide", 0.5],
  ["desktop-auto", "07 · AUTOMOTIVE", "[data-territory='automotive']", 0.5],
  ["desktop-logistics", "08 · LOGISTICS", "[data-territory='logistics']", 0.5],
  ["desktop-manufacturing", "09 · MANUFACTURING", "[data-territory='manufacturing']", 0.5],
  ["desktop-energy", "10 · ENERGY", "[data-territory='energy']", 0.5],
  ["desktop-proof-opening", "11 · PROOF / OPENING", ".proof-opening", 0.5],
  ["desktop-proof-climax", "12 · PROOF / CLIMAX", ".proof-climax", 0.5],
  ["desktop-programmes", "13 · PROGRAMMES", "#programmes", 0.5],
  ["desktop-conversion", "14 · CONVERSION", "#conversion", 0.5],
]);

const shortCases = Object.freeze([
  ["short-entry", "01 · ENTRY", "#entry", 0],
  ["short-method-frame", "02 · METHOD / FRAME · STATIC FLOW", "#method-frame", 0.5],
  ["short-method-test", "03 · METHOD / TEST · STATIC FLOW", "#method-test", 0.5],
  ["short-method-decide", "04 · METHOD / DECIDE · STATIC FLOW", "#method-decide", 0.5],
  ["short-industry", "05 · MANUFACTURING", "[data-territory='manufacturing']", 0.5],
  ["short-proof", "06 · PROOF", ".proof-climax", 0.5],
  ["short-conversion", "07 · CONVERSION", "#conversion", 0.5],
]);

const mobile390Cases = Object.freeze([
  ["mobile390-entry", "01 · ENTRY", "#entry", 0],
  ["mobile390-industry", "02 · BUILT WITH INDUSTRY", "#built-with-industry", 0.43],
  ["mobile390-method", "03 · METHOD · AUTHORED NORMAL FLOW", "#method-test", 0.5],
  ["mobile390-auto", "04 · AUTOMOTIVE", "[data-territory='automotive']", 0.5],
  ["mobile390-energy", "05 · ENERGY", "[data-territory='energy']", 0.5],
  ["mobile390-proof", "06 · PROOF", ".proof-climax", 0.5],
  ["mobile390-programmes", "07 · PROGRAMMES", "#programmes", 0.55],
  ["mobile390-conversion", "08 · CONVERSION", "#conversion", 0.5],
]);

const mobile320Cases = Object.freeze([
  ["mobile320-method", "01 · METHOD", "#method-test", 0.5],
  ["mobile320-industries", "02 · INDUSTRIES / MANUFACTURING", "[data-territory='manufacturing']", 0.5],
  ["mobile320-programmes", "03 · PROGRAMMES", "#programmes", 0.55],
  ["mobile320-conversion", "04 · CONVERSION", "#conversion", 0.5],
]);

const reducedCases = Object.freeze([
  ["reduced-entry", "01 · ENTRY · REDUCED", "#entry", 0],
  ["reduced-method", "02 · METHOD · STATIC WORKPIECE", "#method-test", 0.5],
  ["reduced-industries", "03 · INDUSTRIES · STATIC TERRITORY", "[data-territory='manufacturing']", 0.5],
  ["reduced-proof", "04 · PROOF · STILL", ".proof-climax", 0.5],
  ["reduced-programmes", "05 · PROGRAMMES · STATIC", "#programmes", 0.5],
  ["reduced-conversion", "06 · CONVERSION · STATIC", "#conversion", 0.5],
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function svg(width, height, body) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`,
  );
}

async function replaceFile(temporary, destination) {
  try {
    await unlink(destination);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await rename(temporary, destination);
}

async function composeSheet({ destination, title, subtitle, panels, columns, panelWidth, panelHeight }) {
  const margin = 24;
  const gap = 16;
  const headerHeight = 92;
  const labelHeight = 42;
  const rows = Math.ceil(panels.length / columns);
  const width = margin * 2 + columns * panelWidth + (columns - 1) * gap;
  const height = headerHeight + margin + rows * (panelHeight + labelHeight) + (rows - 1) * gap + margin;
  const composites = [];

  composites.push({
    input: svg(
      width,
      headerHeight,
      `<rect width="100%" height="100%" fill="#070a0b"/>
       <text x="24" y="38" fill="#f4f6f5" font-family="Arial, sans-serif" font-size="24" font-weight="700">${escapeXml(title)}</text>
       <text x="24" y="66" fill="#98a3a2" font-family="Arial, sans-serif" font-size="14">${escapeXml(subtitle)}</text>`,
    ),
    left: 0,
    top: 0,
  });

  for (const [index, panel] of panels.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = margin + column * (panelWidth + gap);
    const top = headerHeight + margin + row * (panelHeight + labelHeight + gap);
    const input = await sharp(panel.path)
      .resize(panelWidth, panelHeight, { fit: "cover", position: "centre" })
      .png()
      .toBuffer();
    composites.push({ input, left, top });
    composites.push({
      input: svg(
        panelWidth,
        panelHeight + labelHeight,
        `<rect x="0.5" y="0.5" width="${panelWidth - 1}" height="${panelHeight + labelHeight - 1}" fill="none" stroke="#3a4444"/>
         <rect y="${panelHeight}" width="${panelWidth}" height="${labelHeight}" fill="#101516"/>
         <text x="14" y="${panelHeight + 27}" fill="#e8eceb" font-family="Arial, sans-serif" font-size="14" font-weight="700">${escapeXml(panel.label)}</text>`,
      ),
      left,
      top,
    });
  }

  const temporary = `${destination}.${randomUUID()}.tmp.png`;
  await sharp({ create: { width, height, channels: 3, background: "#050708" } })
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: true, palette: true, quality: 92, colours: 256 })
    .toFile(temporary);
  await replaceFile(temporary, destination);
}

async function waitForServer(url, timeout = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Production preview did not become available at ${url}.`);
}

async function startPreview() {
  if (process.env.PHASE2B_BASE_URL) {
    await waitForServer(BASE_URL);
    return null;
  }
  const astroBin = path.join(ROOT, "node_modules", "astro", "astro.js");
  const server = spawn(process.execPath, [astroBin, "preview", "--host", "127.0.0.1", "--port", "4322"], {
    cwd: ROOT,
    stdio: "ignore",
    windowsHide: true,
  });
  await waitForServer(BASE_URL);
  return server;
}

async function settleAt(page, selector, anchor) {
  const result = await page.evaluate(
    ({ selector, anchor }) => {
      const target = document.querySelector(selector);
      if (!(target instanceof HTMLElement)) throw new Error(`Missing evidence selector: ${selector}`);
      const bounds = target.getBoundingClientRect();
      const absoluteTop = bounds.top + window.scrollY;
      const desired = absoluteTop + bounds.height * anchor - window.innerHeight / 2;
      const maximum = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo({ top: Math.max(0, Math.min(maximum, desired)), behavior: "instant" });
      return { requestedY: Math.round(desired), boundedY: Math.round(Math.max(0, Math.min(maximum, desired))) };
    },
    { selector, anchor },
  );
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(async () => {
    const images = [...document.images].filter((image) => {
      const bounds = image.getBoundingClientRect();
      return bounds.bottom > 0 && bounds.top < window.innerHeight;
    });
    await Promise.all(images.map((image) => image.decode().catch(() => undefined)));
  });
  await page.waitForTimeout(90);
  return page.evaluate((result) => {
    const method = document.querySelector("[data-method-section]");
    const styles = method instanceof HTMLElement ? getComputedStyle(method) : null;
    return {
      ...result,
      actualY: Math.round(window.scrollY),
      methodSticky: method?.getAttribute("data-method-sticky") ?? null,
      methodProgress: styles?.getPropertyValue("--method-progress").trim() || null,
      methodFrame: styles?.getPropertyValue("--method-frame").trim() || null,
      methodSource: styles?.getPropertyValue("--method-source").trim() || null,
      methodAssess: styles?.getPropertyValue("--method-assess").trim() || null,
      methodTest: styles?.getPropertyValue("--method-test").trim() || null,
      methodDecide: styles?.getPropertyValue("--method-decide").trim() || null,
    };
  }, result);
}

async function captureCases({ browser, rawRoot, cases, viewport, reducedMotion = "no-preference", sequence = "normal" }) {
  const page = await browser.newPage({ viewport, reducedMotion });
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  const captured = [];
  try {
    for (const [id, label, selector, anchor] of cases) {
      const state = await settleAt(page, selector, anchor);
      const file = path.join(rawRoot, `${id}.png`);
      await page.screenshot({ path: file, animations: "disabled" });
      captured.push({ id, label, selector, anchor, viewport, reducedMotion, sequence, state, path: file });
    }
    return captured;
  } finally {
    await page.close();
  }
}

async function captureMotionSequence(browser, rawRoot) {
  const cases = [
    ["motion-01-entry", "01 · NORMAL FORWARD · ENTRY", "#entry", 0],
    ["motion-02-industry", "02 · NORMAL FORWARD · STRUCTURAL INHERITANCE", "#built-with-industry", 0.48],
    ["motion-03-frame", "03 · METHOD ENTER · FRAME", "#method-frame", 0.5],
    ["motion-04-source", "04 · METHOD FORWARD · SOURCE", "#method-source", 0.5],
    ["motion-05-decide-jump", "05 · FAST JUMP · DECIDE IS CURRENT", "#method-decide", 0.5],
    ["motion-06-test-reverse", "06 · REVERSE · TEST RECONSTRUCTED", "#method-test", 0.5],
    ["motion-07-frame-reverse", "07 · REVERSE · FRAME RECONSTRUCTED", "#method-frame", 0.5],
    ["motion-08-method-exit", "08 · FORWARD · METHOD EXIT / AUTOMOTIVE", "[data-territory='automotive']", 0.42],
    ["motion-09-logistics", "09 · TERRITORY TRANSFORM · LOGISTICS", "[data-territory='logistics']", 0.5],
    ["motion-10-energy-jump", "10 · FAST JUMP · ENERGY IS CURRENT", "[data-territory='energy']", 0.5],
    ["motion-11-manufacturing-reverse", "11 · REVERSE · MANUFACTURING", "[data-territory='manufacturing']", 0.5],
    ["motion-12-proof-open", "12 · PROOF ENTRY · DOCUMENTARY APERTURE", ".proof-opening", 0.5],
    ["motion-13-proof-climax", "13 · PROOF CLIMAX · DATUM ABSENT", ".proof-climax", 0.5],
    ["motion-14-programmes", "14 · PROGRAMMES · PROOF REFRAMED", "#programmes", 0.5],
    ["motion-15-conversion", "15 · CONVERSION · ARRIVAL", "#conversion", 0.5],
  ];
  return captureCases({
    browser,
    rawRoot,
    cases,
    viewport: { width: 1440, height: 900 },
    sequence: "normal-fast-reverse",
  });
}

async function fileRecord(relativePath) {
  const absolute = path.join(ROOT, relativePath);
  const bytes = await readFile(absolute);
  return { path: relativePath.replaceAll("\\", "/"), bytes: bytes.length, sha256: sha256(bytes) };
}

async function outputRecord(name) {
  const absolute = path.join(OUTPUT_ROOT, name);
  const bytes = await readFile(absolute);
  const metadata = await sharp(bytes).metadata();
  return {
    path: path.relative(ROOT, absolute).replaceAll("\\", "/"),
    bytes: bytes.length,
    sha256: sha256(bytes),
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
  };
}

async function main() {
  await stat(path.join(ROOT, "dist", "index.html"));
  await mkdir(OUTPUT_ROOT, { recursive: true });
  const rawRoot = await mkdtemp(path.join(tmpdir(), "phase2b-evidence-"));
  const preview = await startPreview();
  const browser = await chromium.launch({ headless: true });

  try {
    const desktop = await captureCases({ browser, rawRoot, cases: desktopCases, viewport: { width: 1440, height: 900 } });
    const short = await captureCases({ browser, rawRoot, cases: shortCases, viewport: { width: 1366, height: 650 } });
    const mobile390 = await captureCases({ browser, rawRoot, cases: mobile390Cases, viewport: { width: 390, height: 844 } });
    const mobile320 = await captureCases({ browser, rawRoot, cases: mobile320Cases, viewport: { width: 320, height: 800 } });
    const reduced = await captureCases({
      browser,
      rawRoot,
      cases: reducedCases,
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
      sequence: "reduced-static",
    });
    const motion = await captureMotionSequence(browser, rawRoot);

    await composeSheet({
      destination: path.join(OUTPUT_ROOT, OUTPUTS.desktop),
      title: "PHASE 2B · OPERATING FIELD · PRODUCTION KEYFRAMES",
      subtitle: "Actual Astro production homepage · 1440 × 900 · fourteen required states",
      panels: desktop,
      columns: 2,
      panelWidth: 720,
      panelHeight: 450,
    });
    await composeSheet({
      destination: path.join(OUTPUT_ROOT, OUTPUTS.short),
      title: "PHASE 2B · SHORT-HEIGHT CONTINUITY",
      subtitle: "1366 × 650 · normal flow where METHOD cannot fit safely as sticky",
      panels: short,
      columns: 1,
      panelWidth: 1025,
      panelHeight: 488,
    });
    await composeSheet({
      destination: path.join(OUTPUT_ROOT, OUTPUTS.mobile390),
      title: "PHASE 2B · AUTHORED MOBILE",
      subtitle: "390 × 844 · no sticky · no scrub · shared semantic source",
      panels: mobile390,
      columns: 2,
      panelWidth: 390,
      panelHeight: 844,
    });
    await composeSheet({
      destination: path.join(OUTPUT_ROOT, OUTPUTS.mobile320),
      title: "PHASE 2B · NARROW MOBILE HARD GATE",
      subtitle: "320 × 800 · METHOD, INDUSTRIES, PROGRAMMES, CONVERSION",
      panels: mobile320,
      columns: 2,
      panelWidth: 320,
      panelHeight: 800,
    });
    await composeSheet({
      destination: path.join(OUTPUT_ROOT, OUTPUTS.reduced),
      title: "PHASE 2B · REDUCED-MOTION EDITION",
      subtitle: "1440 × 900 · controller bypassed · authored static production states",
      panels: reduced,
      columns: 2,
      panelWidth: 720,
      panelHeight: 450,
    });
    const comparison = [desktop[1], desktop[4], desktop[6], desktop[7], desktop[8], desktop[9], desktop[12], desktop[13]];
    await composeSheet({
      destination: path.join(OUTPUT_ROOT, OUTPUTS.comparison),
      title: "PHASE 2B · STATIC-POSTER DIFFERENTIATION",
      subtitle: "Frozen major states · material silhouette must remain distinct without motion",
      panels: comparison,
      columns: 2,
      panelWidth: 720,
      panelHeight: 450,
    });
    await composeSheet({
      destination: path.join(OUTPUT_ROOT, OUTPUTS.motion),
      title: "PHASE 2B · NATIVE-SCROLL CAUSAL SEQUENCE",
      subtitle: "Forward, fast-jump and reverse states · direct document-position reconstruction",
      panels: motion,
      columns: 3,
      panelWidth: 480,
      panelHeight: 300,
    });

    const sourceRecords = await Promise.all(SOURCE_PATHS.map(fileRecord));
    const outputNames = Object.values(OUTPUTS).filter((name) => name.endsWith(".png"));
    const retainedOutputs = await Promise.all(outputNames.map(outputRecord));
    const buildReportPath = "artifacts/evidence/phase-2b/phase-2b-build-report.json";
    const browserReportPath = "artifacts/evidence/phase-2b/phase-2b-browser-report.json";
    const authorityRecords = await Promise.all([buildReportPath, browserReportPath].map(fileRecord));
    const allCases = [...desktop, ...short, ...mobile390, ...mobile320, ...reduced, ...motion];
    const [{ stdout: headOutput }, { stdout: branchOutput }] = await Promise.all([
      execFileAsync("git", ["rev-parse", "HEAD"], { cwd: ROOT }),
      execFileAsync("git", ["branch", "--show-current"], { cwd: ROOT }),
    ]);
    const manifest = {
      schemaVersion: 1,
      phase: "2B",
      status: "PASS",
      acceptedParent: ACCEPTED_PARENT,
      repositoryHeadAtCapture: headOutput.trim(),
      branchAtCapture: branchOutput.trim(),
      productionAuthority: "actual Astro static build served through astro preview",
      rawCapturePolicy: "OS-temporary only; raw browser frames are not retained in the repository",
      captureCounts: {
        desktop1440x900: desktop.length,
        short1366x650: short.length,
        mobile390x844: mobile390.length,
        mobile320x800: mobile320.length,
        reducedMotion: reduced.length,
        motionScrollSequence: motion.length,
        totalRawTemporaryFrames: allCases.length,
        retainedOutputs: retainedOutputs.length,
      },
      scrollAuthority: {
        nativeDocumentPosition: true,
        forwardSequenceCaptured: true,
        fastJumpCaptured: true,
        reverseSequenceCaptured: true,
        queuedTimeline: false,
        scrollPositionWritesByRuntime: false,
      },
      sourceRecords,
      authorityRecords,
      retainedOutputs,
      cases: allCases.map(({ path: _path, ...record }) => record),
    };
    const manifestPath = path.join(OUTPUT_ROOT, OUTPUTS.manifest);
    const temporaryManifest = `${manifestPath}.${randomUUID()}.tmp`;
    await writeFile(temporaryManifest, `${JSON.stringify(manifest, null, 2)}\n`);
    await replaceFile(temporaryManifest, manifestPath);

    console.log(
      `Phase 2B visual evidence PASS: ${allCases.length} OS-temporary captures → ${retainedOutputs.length} retained sheets.`,
    );
  } finally {
    await browser.close();
    preview?.kill();
    const resolvedRawRoot = path.resolve(rawRoot);
    if (
      path.dirname(resolvedRawRoot) === path.resolve(tmpdir()) &&
      path.basename(resolvedRawRoot).startsWith("phase2b-evidence-")
    ) {
      await rm(resolvedRawRoot, { recursive: true, force: true });
    }
  }
}

await main();
