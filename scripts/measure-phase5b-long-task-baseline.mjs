import { execFile } from "node:child_process";
import { access, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const execFileAsync = promisify(execFile);
const ACCEPTED_PHASE5AR = "b6a9d4f6e05412dfd460a657edfd8be4ce7eef2c";

function parseArguments(argv) {
  const options = {
    baseUrl: "http://127.0.0.1:4334/",
    browser: "",
    expectedHead: ACCEPTED_PHASE5AR,
    iterations: 3,
    output: "",
    timeoutMs: 30_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => argv[++index] ?? "";
    if (argument === "--base-url") options.baseUrl = next();
    else if (argument === "--browser") options.browser = next();
    else if (argument === "--expected-head") options.expectedHead = next().toLowerCase();
    else if (argument === "--iterations") options.iterations = Number(next());
    else if (argument === "--output") options.output = path.resolve(next());
    else if (argument === "--timeout-ms") options.timeoutMs = Number(next());
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!Number.isInteger(options.iterations) || options.iterations < 1 || options.iterations > 10) throw new Error("--iterations must be an integer from 1 to 10");
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 5_000) throw new Error("--timeout-ms must be at least 5000");
  if (!/^[0-9a-f]{40}$/.test(options.expectedHead)) throw new Error("--expected-head must be a full 40-character Git SHA");
  options.baseUrl = new URL(options.baseUrl).toString();
  return options;
}

async function executable(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}

async function resolveBrowser(explicitPath) {
  const candidates = [];
  if (explicitPath) candidates.push(path.resolve(explicitPath));
  if (process.platform === "win32") {
    candidates.push("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
    candidates.push("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe");
  } else if (process.platform === "darwin") {
    candidates.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  } else {
    candidates.push("/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium");
  }
  const managed = chromium.executablePath?.();
  if (managed) candidates.push(managed);
  for (const candidate of candidates) if (await executable(candidate)) return candidate;
  throw new Error("Chrome/Chromium not found; pass --browser PATH");
}

async function currentHead() {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), windowsHide: true });
  return stdout.trim().toLowerCase();
}

async function installTelemetry(context) {
  await context.addInitScript(() => {
    const sample = { longTasks: [], layoutShifts: [] };
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          sample.longTasks.push({
            startTime: entry.startTime,
            duration: entry.duration,
            attribution: [...(entry.attribution ?? [])].map((item) => ({
              name: item.name,
              containerType: item.containerType,
              containerName: item.containerName,
              containerId: item.containerId,
              containerSrc: item.containerSrc,
            })),
          });
        }
      });
      observer.observe({ type: "longtask", buffered: true });
    } catch { /* diagnostic-only */ }
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) sample.layoutShifts.push({ startTime: entry.startTime, value: entry.value });
      });
      observer.observe({ type: "layout-shift", buffered: true });
    } catch { /* diagnostic-only */ }
    window.__phase5bLongTaskBaseline = sample;
  });
}

const SCENARIOS = Object.freeze([
  { id: "blank-control", target: "data:text/html,<title>Phase%205B%20blank%20control</title>" },
  { id: "supporting-route-static", path: "for-partners/", scroll: true },
  { id: "homepage-reduced-motion", path: "", reducedMotion: "reduce" },
  { id: "homepage-media-blocked", path: "", blockCinematic: true },
  { id: "homepage-enhanced", path: "" },
]);

async function takePhase(page, id) {
  return page.evaluate((phaseId) => {
    const telemetry = window.__phase5bLongTaskBaseline ?? { longTasks: [], layoutShifts: [] };
    const result = {
      id: phaseId,
      cls: telemetry.layoutShifts.reduce((sum, entry) => sum + entry.value, 0),
      layoutShifts: [...telemetry.layoutShifts],
      longTasks: [...telemetry.longTasks],
      maxLongTaskMs: Math.max(0, ...telemetry.longTasks.map((entry) => entry.duration)),
    };
    telemetry.longTasks.length = 0;
    telemetry.layoutShifts.length = 0;
    return result;
  }, id);
}

async function nativeScrollPhase(page, id, direction) {
  await page.mouse.move(180, 400);
  for (let step = 0; step < 5; step += 1) {
    await page.mouse.wheel(0, direction * 760);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(400);
  return takePhase(page, id);
}

async function runScenario(browser, options, scenario, iteration) {
  const context = await browser.newContext({
    viewport: { width: 360, height: 800 },
    reducedMotion: scenario.reducedMotion,
    serviceWorkers: "block",
  });
  await installTelemetry(context);
  const page = await context.newPage();
  const requests = [];
  const diagnostics = { consoleErrors: [], consoleWarnings: [], httpErrors: [], pageErrors: [], requestFailures: [] };
  page.on("console", (message) => {
    const entry = {
      expected: Boolean(scenario.blockCinematic && /ERR_BLOCKED_BY_CLIENT/i.test(message.text())),
      text: message.text(),
      type: message.type(),
    };
    if (message.type() === "error") diagnostics.consoleErrors.push(entry);
    if (message.type() === "warning") diagnostics.consoleWarnings.push(entry);
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push({ message: error.message, name: error.name }));
  page.on("request", (request) => requests.push({ resourceType: request.resourceType(), url: request.url() }));
  page.on("requestfailed", (request) => diagnostics.requestFailures.push({
    expected: Boolean(scenario.blockCinematic && /\/media\/cinematic\/.*\.mp4(?:\?.*)?$/i.test(request.url())),
    failure: request.failure()?.errorText ?? "unknown",
    url: request.url(),
  }));
  page.on("response", (response) => {
    if (response.status() >= 400) diagnostics.httpErrors.push({ status: response.status(), url: response.url() });
  });
  if (scenario.blockCinematic) {
    await page.route(/\/media\/cinematic\/.*\.mp4(?:\?.*)?$/i, (route) => route.abort("blockedbyclient"));
  }
  const target = scenario.target ?? new URL(scenario.path, options.baseUrl).toString();
  const startedAt = Date.now();
  try {
    const response = await page.goto(target, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
    await page.waitForTimeout(2_500);
    const phases = [await takePhase(page, "navigation-and-idle")];
    if (scenario.scroll) {
      phases.push(await nativeScrollPhase(page, "forward-native-scroll", 1));
      phases.push(await nativeScrollPhase(page, "reverse-native-scroll", -1));
    }
    const pageState = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0];
      return {
        documentReadyState: document.readyState,
        maxScrollY: Math.max(0, document.documentElement.scrollHeight - innerHeight),
        navigation: navigation ? {
          domContentLoaded: navigation.domContentLoadedEventEnd,
          duration: navigation.duration,
          loadEventEnd: navigation.loadEventEnd,
          responseEnd: navigation.responseEnd,
        } : null,
        scrollY,
      };
    });
    const unexpectedConsoleErrors = diagnostics.consoleErrors.filter((entry) => !entry.expected);
    const unexpectedRequestFailures = diagnostics.requestFailures.filter((entry) => !entry.expected);
    const status = unexpectedConsoleErrors.length || diagnostics.pageErrors.length || diagnostics.httpErrors.length || unexpectedRequestFailures.length ? "FAIL" : "PASS";
    return {
      ...pageState,
      diagnostics,
      elapsedMs: Date.now() - startedAt,
      httpStatus: response?.status() ?? null,
      id: scenario.id,
      iteration,
      mediaRequests: requests.filter((request) => /\.(?:mp4|webm)(?:\?|$)/i.test(request.url)),
      maxLongTaskMs: Math.max(0, ...phases.map((phase) => phase.maxLongTaskMs)),
      phases,
      status,
      target,
    };
  } finally {
    await context.close();
  }
}

function summarize(samples) {
  return SCENARIOS.map((scenario) => {
    const matches = samples.filter((sample) => sample.id === scenario.id);
    const maxima = matches.map((sample) => sample.maxLongTaskMs).sort((left, right) => left - right);
    return {
      id: scenario.id,
      iterations: matches.length,
      maxLongTaskMs: maxima.length ? Math.max(...maxima) : null,
      medianMaxLongTaskMs: maxima.length ? maxima[Math.floor(maxima.length / 2)] : null,
      samplesOver50Ms: matches.filter((sample) => sample.maxLongTaskMs > 50).length,
      totalMediaRequests: matches.reduce((sum, sample) => sum + sample.mediaRequests.length, 0),
    };
  });
}

async function writeFreshAtomic(filePath, contents) {
  try {
    await access(filePath);
    throw new Error(`Refusing to overwrite existing baseline: ${filePath}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, contents, { encoding: "utf8", flag: "wx" });
  await rename(temporaryPath, filePath);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: node scripts/measure-phase5b-long-task-baseline.mjs --base-url <preview> --output <fresh-json> [--expected-head <full-sha>] [--browser <path>] [--iterations 3]\n");
    return;
  }
  const observedHead = await currentHead();
  if (observedHead !== options.expectedHead) throw new Error(`Accepted-parent mismatch: expected ${options.expectedHead}, observed ${observedHead}`);
  const executablePath = await resolveBrowser(options.browser);
  const browser = await chromium.launch({ headless: true, executablePath, args: ["--disable-extensions", "--disable-background-networking"] });
  const samples = [];
  let browserVersion = "unknown";
  try {
    browserVersion = browser.version();
    const warm = await browser.newPage();
    await warm.goto("data:text/html,<title>warmup</title>");
    await warm.close();
    for (let iteration = 1; iteration <= options.iterations; iteration += 1) {
      for (const scenario of SCENARIOS) samples.push(await runScenario(browser, options, scenario, iteration));
    }
  } finally {
    await browser.close();
  }
  const report = {
    acceptedPhase5ARObservation: {
      context: "enhanced homepage initial-load, portrait 360x800",
      durationMs: 348,
      manifestDisclosedMaximumMs: 203,
      startTimeMs: 276.69999998807907,
    },
    environment: { browserVersion, headless: true, viewport: { width: 360, height: 800 } },
    generatedAt: new Date().toISOString(),
    samples,
    schema: "quantum-hub.phase-5b.long-task-baseline.v2",
    status: samples.every((sample) => sample.status === "PASS") ? "PASS" : "FAIL",
    summary: summarize(samples),
    target: { acceptedParentSha: options.expectedHead, baseUrl: options.baseUrl, iterations: options.iterations, observedHead },
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) await writeFreshAtomic(options.output, serialized);
  process.stdout.write(serialized);
  if (report.status !== "PASS") process.exitCode = 1;
}

const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().catch((error) => { console.error(error); process.exitCode = 1; });

export { ACCEPTED_PHASE5AR, parseArguments, resolveBrowser, runScenario, summarize, writeFreshAtomic };
