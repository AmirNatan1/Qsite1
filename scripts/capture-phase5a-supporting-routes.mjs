// QH_PHASE5A_ROUTE_LAB_ONLY
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { access, copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { ROUTE_ORDER, ROUTES, VIEWPORTS, assertRouteData } from "../prototypes/phase-5a-supporting-routes/route-data.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(process.cwd());
const PROTOTYPE_ROOT = path.join(ROOT, "prototypes", "phase-5a-supporting-routes");
const CHROME_DEFAULT = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const CANARY = "QH_PHASE5A_ROUTE_LAB_ONLY";

function argument(name, fallback = null) {
  const exact = `--${name}`;
  const index = process.argv.findIndex((value) => value === exact || value.startsWith(`${exact}=`));
  if (index < 0) return fallback;
  const value = process.argv[index];
  return value.includes("=") ? value.slice(value.indexOf("=") + 1) : process.argv[index + 1];
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function slash(value) {
  return value.replaceAll("\\", "/");
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function assertExternalFreshOutput(output) {
  const relative = path.relative(ROOT, output);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new Error("Route review output must be outside the repository");
  }
  const relativeToTemp = path.relative(path.resolve(tmpdir()), output);
  if (relativeToTemp === "" || (!relativeToTemp.startsWith("..") && !path.isAbsolute(relativeToTemp))) {
    throw new Error("Route review output must be durable and outside the OS temporary directory");
  }
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(candidate));
    else if (entry.isFile()) files.push(candidate);
  }
  return files;
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
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`);
}

async function composeResponsiveSheet({ route, captures, destination }) {
  const columns = 3;
  const panelWidth = 320;
  const panelHeight = 210;
  const labelHeight = 42;
  const gap = 14;
  const margin = 24;
  const headerHeight = 96;
  const rows = Math.ceil(captures.length / columns);
  const tileHeight = panelHeight + labelHeight;
  const width = margin * 2 + columns * panelWidth + (columns - 1) * gap;
  const height = margin + headerHeight + rows * tileHeight + (rows - 1) * gap + margin;
  const composites = [{
    input: svg(width - margin * 2, headerHeight, `
      <rect width="100%" height="100%" fill="#060607"/>
      <text x="0" y="32" fill="#f2eee7" font-family="Arial, sans-serif" font-size="25" font-weight="700">${escapeXml(route.publicLabel)} · responsive continuity</text>
      <text x="0" y="63" fill="#99948e" font-family="Arial, sans-serif" font-size="14">Seven required viewports + 200% text + fallback font + open navigation + keyboard focus</text>
    `),
    left: margin,
    top: margin,
  }];

  for (let index = 0; index < captures.length; index += 1) {
    const capture = captures[index];
    const image = await sharp(capture.path)
      .resize(panelWidth, panelHeight, { fit: "contain", background: "#09090b" })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    const label = svg(panelWidth, labelHeight, `
      <rect width="100%" height="100%" fill="#101013"/>
      <line x1="0" y1="${labelHeight - 1}" x2="${panelWidth}" y2="${labelHeight - 1}" stroke="#343238"/>
      <text x="13" y="26" fill="#ded8d0" font-family="Arial, sans-serif" font-size="13" font-weight="700">${escapeXml(capture.label)}</text>
    `);
    const tile = await sharp({ create: { width: panelWidth, height: tileHeight, channels: 4, background: "#09090b" } })
      .composite([{ input: image, left: 0, top: 0 }, { input: label, left: 0, top: panelHeight }])
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

  await sharp({ create: { width, height, channels: 4, background: "#060607" } })
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(destination);
}

function startServer(port) {
  const child = spawn(process.execPath, [path.join(PROTOTYPE_ROOT, "server.mjs"), `--port=${port}`], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  return { child, output: () => ({ stdout, stderr }) };
}

async function waitForServer(baseUrl, processState) {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (processState.child.exitCode !== null) {
      const output = processState.output();
      throw new Error(`Prototype server exited early: ${output.stderr || output.stdout}`);
    }
    try {
      const response = await fetch(new URL("for-partners/", baseUrl), { signal: AbortSignal.timeout(700) });
      if (response.ok && response.headers.get("x-phase5a-local-prototype") === CANARY) return;
    } catch {
      // Server startup is bounded by the outer deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error("Timed out waiting for the Phase 5A route lab server");
}

async function stopServer(processState) {
  if (!processState || processState.child.exitCode !== null) return;
  processState.child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => processState.child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
  if (processState.child.exitCode === null) processState.child.kill("SIGKILL");
}

async function waitReady(page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts?.ready);
}

async function pageAudit(page, expectedRoute) {
  const audit = await page.evaluate(({ canary, route }) => {
    const fixedOrSticky = [...document.querySelectorAll("body *")]
      .filter((element) => ["fixed", "sticky"].includes(getComputedStyle(element).position))
      .map((element) => element.className || element.tagName);
    return {
      canary: document.body.innerText.includes(canary),
      route: document.documentElement.dataset.route,
      videos: document.querySelectorAll("video").length,
      cinematic: document.querySelectorAll("[data-cinematic], .cinematic-runway").length,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      overtureGeometry: (() => {
        const element = document.querySelector(".overture");
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { left: rect.left, right: rect.right, width: rect.width, grid: style.gridTemplateColumns, paddingLeft: style.paddingLeft, paddingRight: style.paddingRight };
      })(),
      fixedOrSticky,
      overflowTargets: [...document.querySelectorAll("body *")]
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.width > 0 && (rect.right > innerWidth + 1 || rect.left < -1))
        .slice(0, 12)
        .map(({ element, rect }) => ({ selector: element.className || element.tagName, left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) })),
      scrollContainers: [document.documentElement, document.body, ...document.querySelectorAll("body *")]
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .slice(0, 12)
        .map((element) => ({ selector: element.className || element.tagName, client: element.clientWidth, scroll: element.scrollWidth })),
      h1: document.querySelectorAll("h1").length,
      main: Boolean(document.querySelector("main")),
      expectedRoute: route,
    };
  }, { canary: CANARY, route: expectedRoute });
  if (!audit.canary || audit.route !== expectedRoute || audit.videos !== 0 || audit.cinematic !== 0 || audit.h1 !== 1 || !audit.main) {
    throw new Error(`Prototype semantic/isolation audit failed for ${expectedRoute}: ${JSON.stringify(audit)}`);
  }
  if (audit.scrollWidth > audit.viewportWidth + 1) throw new Error(`Horizontal overflow on ${expectedRoute}: ${audit.scrollWidth} > ${audit.viewportWidth}; geometry=${JSON.stringify(audit.overtureGeometry)}; targets=${JSON.stringify(audit.overflowTargets)}; containers=${JSON.stringify(audit.scrollContainers)}`);
  if (audit.fixedOrSticky.length) throw new Error(`Fixed/sticky prototype element on ${expectedRoute}: ${audit.fixedOrSticky.join(", ")}`);
  return audit;
}

async function runAxe(page, axeSource, route, viewport) {
  await page.evaluate(axeSource);
  const result = await page.evaluate(async () => {
    const report = await globalThis.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      resultTypes: ["violations"],
    });
    return report.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      description: violation.description,
      nodes: violation.nodes.length,
      targets: violation.nodes.slice(0, 5).map((node) => node.target),
    }));
  });
  const blockers = result.filter(({ impact }) => impact === "critical" || impact === "serious");
  if (blockers.length) throw new Error(`Axe serious/critical violations for ${route.slug} ${viewport}: ${JSON.stringify(blockers)}`);
  return result;
}

async function screenshotState({ page, url, viewport, destination, fullPage = false, prepare = null, route }) {
  await page.setViewportSize(viewport);
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  if (!response?.ok()) throw new Error(`Navigation failed: ${url} (${response?.status()})`);
  if (response.headers()["x-phase5a-local-prototype"] !== CANARY) throw new Error(`Missing local-lab canary header: ${url}`);
  await waitReady(page);
  if (prepare) await prepare(page);
  const audit = await pageAudit(page, route.slug);
  await page.screenshot({ path: destination, fullPage, animations: "disabled", caret: "hide" });
  return audit;
}

function routeBrief(route) {
  const lines = [
    `# ${route.publicLabel} — Phase 5A route brief`,
    "",
    `Public path reference: \`${route.publicPath}\`  `,
    "Status: local speculative preproduction; public route unchanged; Phase 5B unauthorized.",
    "",
    `1. **Purpose:** ${route.purpose}`,
    `2. **Audience:** ${route.audience}`,
    `3. **User question answered:** ${route.userQuestion}`,
    `4. **Content hierarchy:** ${route.chapters.join(" → ")}.`,
    `5. **Proposed page chapters:** ${route.chapters.join("; ")}.`,
    `6. **Emotional/spatial arc:** ${route.arc.join(" → ")}.`,
    `7. **Signature behavior:** ${route.signature}`,
    `8. **Motion verbs:** ${route.motion.join(" → ")}.`,
    `9. **Material vocabulary:** ${route.materials.join("; ")}.`,
    `10. **Media strategy:** Essential: ${route.media.essential}. ${route.media.repository} ${route.media.drive} Desired asset: ${route.media.desired} Accepted fallback: ${route.media.fallback}`,
    `11. **Publication constraints:** ${route.publication.join("; ")}.`,
    "12. **Desktop storyboard:** 1440×900 full-page capture; overture and signature field coexist before the chapter sequence.",
    `13. **Portrait storyboard:** 390×844 full-page capture; ${route.mobile}`,
    `14. **Short-landscape storyboard:** 844×390 key composition; ${route.landscape}`,
    `15. **Reduced-motion version:** ${route.reduced}`,
    `16. **No-JS version:** ${route.nojs}`,
    `17. **Performance strategy:** ${route.performance.runtime}; JS ${route.performance.js}; CSS ${route.performance.css}; media ${route.performance.media}; long-task risk ${route.performance.risk}; third-party dependency ${route.performance.dependency}. Mobile: ${route.mobile}`,
    `18. **Implementation risks:** ${route.risks.join("; ")}.`,
    `19. **Dependencies:** ${route.dependencies.join("; ")}.`,
    `20. **Open questions requiring human approval:** ${route.openQuestions.join("; ")}.`,
    "",
    `Conversion boundary: ${route.conversion}`,
    "",
    "No item in this brief authorizes Phase 5B.",
    "",
  ];
  return lines.join("\n");
}

async function writeRouteDocuments(route, directory) {
  await writeFile(path.join(directory, "route-brief.md"), routeBrief(route));
  await writeFile(path.join(directory, "media-requirements.md"), [
    `# ${route.publicLabel} — media requirements`, "",
    `- Real media essential: ${route.media.essential}`,
    `- Existing approved repository media: ${route.media.repository}`,
    `- Connected Google Drive review: ${route.media.drive}`,
    `- Exact desired asset type: ${route.media.desired}`,
    `- Publication risk: ${route.media.risk}`,
    `- Accepted abstract/static fallback: ${route.media.fallback}`,
    "", "No stock photography, random internet imagery, AI-generated factories, fake employees, scraped partner media or ungoverned Drive material is authorized.", "",
  ].join("\n"));
  await writeFile(path.join(directory, "publication-constraints.md"), [
    `# ${route.publicLabel} — publication constraints`, "", ...route.publication.map((value) => `- ${value}`), "", `Conversion: ${route.conversion}`, "", "Public source remains byte-identical to the accepted Phase 4 route in Phase 5A.", "",
  ].join("\n"));
  await writeFile(path.join(directory, "performance-plan.md"), [
    `# ${route.publicLabel} — performance plan`, "",
    `- Runtime technique: ${route.performance.runtime}`,
    `- JavaScript estimate: ${route.performance.js}`,
    `- CSS estimate: ${route.performance.css}`,
    `- Media weight: ${route.performance.media}`,
    `- Reduced motion: ${route.reduced}`,
    `- No JavaScript: ${route.nojs}`,
    `- Mobile simplification: ${route.mobile}`,
    `- Potential long-task risk: ${route.performance.risk}`,
    `- Third-party dependency: ${route.performance.dependency}`,
    "", "Continuous animation loops, WebGL, Three.js, GSAP, React, scroll libraries, frame sequences, server APIs and CMS are out of scope.", "",
  ].join("\n"));
  await writeFile(path.join(directory, "implementation-risks.md"), [
    `# ${route.publicLabel} — implementation risks`, "", ...route.risks.map((value) => `- ${value}`), "", "Dependencies:", ...route.dependencies.map((value) => `- ${value}`), "", "Human decisions:", ...route.openQuestions.map((value) => `- ${value}`), "", "Phase 5B remains unauthorized.", "",
  ].join("\n"));
}

async function fileRecords(root) {
  const records = [];
  for (const file of await walk(root)) {
    const bytes = await readFile(file);
    const relative = slash(path.relative(root, file));
    if (relative === "route-preproduction-manifest.json") continue;
    const record = { path: relative, bytes: bytes.length, sha256: sha256(bytes) };
    if (/\.png$/i.test(file)) {
      const metadata = await sharp(bytes, { failOn: "error" }).metadata();
      record.media = { type: "image", format: metadata.format, width: metadata.width, height: metadata.height };
    }
    records.push(record);
  }
  return records.sort((left, right) => left.path.localeCompare(right.path));
}

async function captureRoute({ browser, route, baseUrl, staging, scratch, axeSource, requestLog, accessibility }) {
  const routeDirectory = path.join(staging, "routes", route.slug);
  const routeScratch = path.join(scratch, route.slug);
  await mkdir(routeDirectory, { recursive: true });
  await mkdir(routeScratch, { recursive: true });
  await writeRouteDocuments(route, routeDirectory);

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  context.on("request", (request) => requestLog.push({ route: route.slug, url: request.url(), resourceType: request.resourceType() }));
  const page = await context.newPage();
  const url = new URL(route.publicPath.slice(1), baseUrl).toString();
  const responsiveCaptures = [];
  const audits = [];

  for (const viewport of VIEWPORTS) {
    const rawPath = path.join(routeScratch, `${viewport.id}.png`);
    audits.push(await screenshotState({
      page,
      url,
      viewport: { width: viewport.width, height: viewport.height },
      destination: rawPath,
      route,
    }));
    responsiveCaptures.push({ path: rawPath, label: `${viewport.id} · ${viewport.width}×${viewport.height}` });
    if (viewport.id === "desktop") {
      await page.screenshot({ path: path.join(routeDirectory, "desktop-storyboard--1440x900.png"), fullPage: true, animations: "disabled", caret: "hide" });
      accessibility.push({ route: route.slug, viewport: "1440x900", violations: await runAxe(page, axeSource, route, "1440x900") });
    }
    if (viewport.id === "mobile") {
      await page.screenshot({ path: path.join(routeDirectory, "mobile-storyboard--390x844.png"), fullPage: true, animations: "disabled", caret: "hide" });
      accessibility.push({ route: route.slug, viewport: "390x844", violations: await runAxe(page, axeSource, route, "390x844") });
    }
    if (viewport.id === "mobile-landscape") {
      await page.screenshot({ path: path.join(routeDirectory, "short-landscape--844x390.png"), animations: "disabled", caret: "hide" });
    }
  }

  const specialStates = [
    {
      id: "text-200",
      label: "200% text · 1440×900",
      viewport: { width: 1440, height: 900 },
      prepare: (target) => target.evaluate(() => document.documentElement.classList.add("review-text-200")),
    },
    {
      id: "fallback-font",
      label: "fallback font · 1440×900",
      viewport: { width: 1440, height: 900 },
      prepare: (target) => target.evaluate(() => document.documentElement.classList.add("review-fallback-font")),
    },
    {
      id: "open-navigation",
      label: "open navigation · 390×844",
      viewport: { width: 390, height: 844 },
      prepare: (target) => target.locator("details.mobile-nav").evaluate((details) => { details.open = true; }),
    },
    {
      id: "keyboard-focus",
      label: "keyboard focus · 1440×900",
      viewport: { width: 1440, height: 900 },
      prepare: async (target) => { await target.keyboard.press("Tab"); await target.keyboard.press("Tab"); },
    },
  ];

  for (const special of specialStates) {
    const rawPath = path.join(routeScratch, `${special.id}.png`);
    audits.push(await screenshotState({ page, url, viewport: special.viewport, destination: rawPath, prepare: special.prepare, route }));
    responsiveCaptures.push({ path: rawPath, label: special.label });
  }

  await composeResponsiveSheet({ route, captures: responsiveCaptures, destination: path.join(routeDirectory, "responsive-contact-sheet.png") });

  const boards = [
    ["motion", "signature-motion-states.png"],
    ["materials", "material-detail-board.png"],
    ["type", "typography-hierarchy.png"],
    ["transition", "representative-transition-states.png"],
  ];
  for (const [board, filename] of boards) {
    const boardUrl = new URL(url);
    boardUrl.searchParams.set("board", board);
    await screenshotState({ page, url: boardUrl.toString(), viewport: { width: 1440, height: 900 }, destination: path.join(routeDirectory, filename), fullPage: true, route });
  }
  await context.close();

  const reducedContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark", reducedMotion: "reduce" });
  reducedContext.on("request", (request) => requestLog.push({ route: route.slug, state: "reduced", url: request.url(), resourceType: request.resourceType() }));
  const reducedPage = await reducedContext.newPage();
  const reducedAudit = await screenshotState({ page: reducedPage, url, viewport: { width: 1440, height: 900 }, destination: path.join(routeDirectory, "reduced-motion.png"), route });
  await reducedContext.close();

  const noJsContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark", javaScriptEnabled: false });
  noJsContext.on("request", (request) => requestLog.push({ route: route.slug, state: "no-js", url: request.url(), resourceType: request.resourceType() }));
  const noJsPage = await noJsContext.newPage();
  const noJsAudit = await screenshotState({ page: noJsPage, url, viewport: { width: 1440, height: 900 }, destination: path.join(routeDirectory, "no-js.png"), route });
  const noJsState = await noJsPage.evaluate(() => ({ enhanced: document.documentElement.dataset.js ?? null, links: document.querySelectorAll("a[href]").length, chapters: document.querySelectorAll(".chapter").length }));
  if (noJsState.enhanced !== null || noJsState.links < 2 || noJsState.chapters !== route.chapters.length) {
    throw new Error(`No-JS continuity failed for ${route.slug}: ${JSON.stringify(noJsState)}`);
  }
  await noJsContext.close();

  return { route: route.slug, audits, reducedAudit, noJsAudit, noJsState, artifacts: 15 };
}

async function main() {
  assertRouteData();
  const outputValue = argument("output");
  if (!outputValue) throw new Error("Usage: node scripts/capture-phase5a-supporting-routes.mjs --output <fresh-external-directory> [--chrome <path>]");
  const output = path.resolve(outputValue);
  assertExternalFreshOutput(output);
  if (await exists(output)) throw new Error(`Refusing to overwrite existing output: ${output}`);
  const staging = `${output}.staging-${process.pid}-${Date.now()}`;
  if (await exists(staging)) throw new Error(`Unexpected staging collision: ${staging}`);
  const scratch = path.join(staging, ".capture-scratch");
  const chrome = path.resolve(argument("chrome", process.env.PHASE5A_CHROME ?? CHROME_DEFAULT));
  if (!(await exists(chrome))) throw new Error(`Chrome not found: ${chrome}`);
  const port = Number.parseInt(argument("port", String(41_750 + (process.pid % 400))), 10);
  const baseUrl = `http://127.0.0.1:${port}/`;
  const axeSource = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
  let server;
  let browser;

  try {
    await mkdir(path.join(staging, "routes"), { recursive: true });
    await mkdir(path.join(staging, "cross-route-system"), { recursive: true });
    await mkdir(path.join(staging, "reports"), { recursive: true });
    await mkdir(scratch, { recursive: true });
    server = startServer(port);
    await waitForServer(baseUrl, server);
    browser = await chromium.launch({ executablePath: chrome, headless: true });

    const requestLog = [];
    const accessibility = [];
    const routeResults = [];
    for (const slug of ROUTE_ORDER) {
      routeResults.push(await captureRoute({ browser, route: ROUTES[slug], baseUrl, staging, scratch, axeSource, requestLog, accessibility }));
    }

    const systemContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
    systemContext.on("request", (request) => requestLog.push({ route: "cross-route-system", url: request.url(), resourceType: request.resourceType() }));
    const systemPage = await systemContext.newPage();
    const systemUrl = new URL("system/", baseUrl).toString();
    const systemResponse = await systemPage.goto(systemUrl, { waitUntil: "domcontentloaded" });
    if (!systemResponse?.ok() || systemResponse.headers()["x-phase5a-local-prototype"] !== CANARY) throw new Error("Cross-route system board failed local provenance check");
    await waitReady(systemPage);
    await systemPage.screenshot({ path: path.join(staging, "cross-route-system", "cross-route-system-board.png"), fullPage: true, animations: "disabled", caret: "hide" });
    await systemContext.close();
    await browser.close();
    browser = null;

    const externalRequests = requestLog.filter(({ url }) => new URL(url).origin !== new URL(baseUrl).origin);
    const cinematicRequests = requestLog.filter(({ url }) => /phase-4|cinematic|\.mp4(?:$|\?)/i.test(url));
    if (externalRequests.length || cinematicRequests.length) {
      throw new Error(`Prototype request isolation failed: ${JSON.stringify({ externalRequests, cinematicRequests })}`);
    }

    const planningCopies = [
      "PHASE_5A_SUPPORTING_ROUTE_EXPERIENCE_SYSTEM.md",
      "PHASE_5A_ROUTE_COHERENCE_MATRIX.md",
      "PHASE_5A_SUPPORTING_ROUTE_PREPRODUCTION.md",
    ];
    for (const filename of planningCopies) {
      await copyFile(path.join(ROOT, "docs", "planning", filename), path.join(staging, "cross-route-system", filename));
    }
    for (const filename of ["PHASE_5A_SUPPORTING_ROUTE_CONTENT_AUDIT.md", "PHASE_5A_PUBLICATION_AND_MEDIA_AUDIT.md"]) {
      await copyFile(path.join(ROOT, "docs", "planning", filename), path.join(staging, "reports", filename));
    }

    const accessibilityReport = {
      schema: "qh.phase5a.route-accessibility.v1",
      status: "PASS",
      routes: ROUTE_ORDER,
      viewports: ["1440x900", "390x844"],
      scans: accessibility,
      seriousOrCriticalViolations: 0,
    };
    await writeFile(path.join(staging, "reports", "accessibility.json"), `${JSON.stringify(accessibilityReport, null, 2)}\n`);
    const captureReport = {
      schema: "qh.phase5a.route-preproduction-capture.v1",
      status: "PASS",
      canary: CANARY,
      provenance: { type: "local-authored-preproduction", public: false, baseUrl, productionRouteBytesChanged: false },
      routes: routeResults,
      routeCount: routeResults.length,
      requiredViewports: VIEWPORTS,
      specialResponsiveStates: ["200% text", "fallback font", "open mobile navigation", "keyboard focus"],
      requestIsolation: { status: "PASS", requests: requestLog.length, external: 0, cinematic: 0, video: 0 },
      reducedMotion: "PASS",
      noJs: "PASS",
      fixedOrSticky: 0,
      horizontalOverflow: 0,
      phase5BAuthorized: false,
    };
    await writeFile(path.join(staging, "reports", "browser-capture-report.json"), `${JSON.stringify(captureReport, null, 2)}\n`);
    await writeFile(path.join(staging, "README.md"), [
      "# Phase 5A local supporting-route preproduction evidence", "",
      "These route storyboards were captured from an authored, local-only HTML/CSS lab. They are speculative human-review material, not deployed public routes.", "",
      "The public supporting routes remain byte-identical to the accepted Phase 4 baseline. The lab makes no external request, loads no Phase 4 cinematic media, reserves no cinematic runway, uses no sticky chapter, and remains semantically complete with reduced motion and without JavaScript.", "",
      "Proof and Maradin use only already-governed repository stills. Every other route intentionally uses abstract authored geometry. No stock, random internet, AI-generated factory, fake employee, scraped partner or confidential Drive material appears.", "",
      "Phase 5B remains unauthorized. All six human gates remain pending.", "",
    ].join("\n"));

    await rm(scratch, { recursive: true, force: true });
    const records = await fileRecords(staging);
    const manifest = {
      schema: "qh.phase5a.route-preproduction-manifest.v1",
      status: "PASS",
      provenance: "local speculative preproduction",
      canary: CANARY,
      routes: ROUTE_ORDER,
      routeArtifactsPerRoute: 15,
      files: records,
      totals: { files: records.length, bytes: records.reduce((total, record) => total + record.bytes, 0) },
      phase5BAuthorized: false,
      humanGates: "all six pending",
    };
    await writeFile(path.join(staging, "route-preproduction-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    await rename(staging, output);
    console.log(JSON.stringify({ status: "PASS", output, routes: ROUTE_ORDER.length, files: manifest.totals.files + 1, bytes: manifest.totals.bytes }, null, 2));
  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    await rm(staging, { recursive: true, force: true }).catch(() => {});
    throw error;
  } finally {
    await stopServer(server);
  }
}

await main();
