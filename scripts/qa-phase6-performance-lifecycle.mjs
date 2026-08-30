import { access, mkdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MEDIA_REQUEST = /\/media\/.*\.mp4(?:[?#]|$)/i;
const HOME_H264_REQUEST = /\/media\/cinematic\/phase-4r2\/.*h264.*\.mp4(?:[?#]|$)/i;
const HOME_POSTER_REQUEST = /\/media\/cinematic\/phase-4r2\/posters\/.*\.(?:png|jpe?g|webp|avif)(?:[?#]|$)/i;

export const SCHEMA = "quantum-hub.phase-6.performance-lifecycle.v1";
export const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
export const DEFAULT_ITERATIONS = 5;
export const DEFAULT_CYCLES = 10;

export const REPRESENTATIVE_SCENARIOS = Object.freeze([
  Object.freeze({ id: "home-enhanced", label: "Home enhanced", path: "/", expectedStatus: 200 }),
  Object.freeze({ id: "home-reduced", label: "Home reduced", path: "/", expectedStatus: 200, reducedMotion: "reduce" }),
  Object.freeze({ id: "home-h264-blocked", label: "Home H264 blocked", path: "/", expectedStatus: 200, mediaPolicy: "block-home-h264" }),
  Object.freeze({ id: "for-industry", label: "For industry", path: "/for-partners/", expectedStatus: 200 }),
  Object.freeze({ id: "for-startups", label: "For startups", path: "/for-startups/", expectedStatus: 200 }),
  Object.freeze({ id: "industries", label: "Industries", path: "/industries/", expectedStatus: 200 }),
  Object.freeze({ id: "maradin-pre-video", label: "Maradin pre-video", path: "/pocs/maradin/", expectedStatus: 200 }),
  Object.freeze({ id: "maradin-post-user-initiation", label: "Maradin post-user-initiation", path: "/pocs/maradin/", expectedStatus: 200, initiateVideo: true }),
  Object.freeze({ id: "contact", label: "Contact", path: "/contact/", expectedStatus: 200 }),
  Object.freeze({ id: "real-404", label: "real 404", path: "/__phase6-performance-intentional-404__/", expectedStatus: 404 }),
]);

export const MEDIA_NETWORK_SCENARIOS = Object.freeze([
  Object.freeze({ id: "high-latency-media", label: "high-latency Maradin media", path: "/pocs/maradin/", target: "maradin", latencyMs: 600, downloadBytesPerSecond: -1, expectedOutcome: "bounded-maradin" }),
  Object.freeze({ id: "low-bandwidth-media", label: "low-bandwidth Maradin media", path: "/pocs/maradin/", target: "maradin", latencyMs: 150, downloadBytesPerSecond: 64 * 1024, expectedOutcome: "bounded-maradin" }),
  Object.freeze({ id: "blocked-media", label: "blocked Maradin media", path: "/pocs/maradin/", target: "maradin", mediaPolicy: "block-media", expectedOutcome: "maradin-dormant" }),
  Object.freeze({ id: "failed-media", label: "failed Maradin media after user initiation", path: "/pocs/maradin/", target: "maradin", mediaPolicy: "fail-media", expectedOutcome: "maradin-dormant" }),
  Object.freeze({ id: "offline-media", label: "offline Maradin media after HTML", path: "/pocs/maradin/", target: "maradin", offlineAfterDocumentLoad: true, expectedOutcome: "maradin-dormant" }),
  Object.freeze({ id: "home-connection-drop-during-load", label: "Home connection drop during media load", path: "/", target: "home", mediaPolicy: "drop-home-h264", expectedOutcome: "home-static-fallback" }),
  Object.freeze({ id: "home-connection-drop-after-blob", label: "Home connection drop after Blob creation", path: "/", target: "home", offlineAfterBlob: true, expectedOutcome: "home-blob-offline" }),
  Object.freeze({ id: "home-poster-failure", label: "Home poster failure", path: "/", target: "home", mediaPolicy: "block-home-poster", expectedOutcome: "home-poster-resilient" }),
]);

export const LIMITATIONS = Object.freeze([
  "Long Tasks API entries identify main-thread blocking windows and may expose container attribution; they do not identify a JavaScript function or prove causal ownership.",
  "Harness stage labels describe measurement time windows, not causal attribution for work that crosses a stage boundary.",
  "CDP Network.loadingFinished encodedDataLength is transferred encoded data observed by Chromium; cached responses can report zero and it is not decoded payload size.",
  "Headless, locally served and CPU-throttled results are diagnostics, not field Core Web Vitals or representative end-user percentiles.",
  "performance.memory and CDP heap/DOM counters are capability-dependent lifecycle indicators; deltas alone do not prove or disprove a leak.",
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function argumentValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = {
    baseUrl: "http://127.0.0.1:4338/",
    browser: "",
    cpuRate: 4,
    cycles: DEFAULT_CYCLES,
    dryRun: false,
    headed: false,
    help: false,
    iterations: DEFAULT_ITERATIONS,
    output: "",
    quiet: false,
    selfTest: false,
    settleMs: 350,
    timeoutMs: 30_000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--base-url") {
      options.baseUrl = argumentValue(argv, index, argument);
      index += 1;
    } else if (argument === "--browser") {
      options.browser = path.resolve(argumentValue(argv, index, argument));
      index += 1;
    } else if (argument === "--cpu-rate") {
      options.cpuRate = Number(argumentValue(argv, index, argument));
      index += 1;
    } else if (argument === "--cycles") {
      options.cycles = Number(argumentValue(argv, index, argument));
      index += 1;
    } else if (argument === "--dry-run") {
      options.dryRun = true;
    } else if (argument === "--headed") {
      options.headed = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--iterations") {
      options.iterations = Number(argumentValue(argv, index, argument));
      index += 1;
    } else if (argument === "--output") {
      options.output = path.resolve(argumentValue(argv, index, argument));
      index += 1;
    } else if (argument === "--quiet") {
      options.quiet = true;
    } else if (argument === "--self-test") {
      options.selfTest = true;
    } else if (argument === "--settle-ms") {
      options.settleMs = Number(argumentValue(argv, index, argument));
      index += 1;
    } else if (argument === "--timeout-ms") {
      options.timeoutMs = Number(argumentValue(argv, index, argument));
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  invariant(Number.isInteger(options.iterations) && options.iterations >= 1 && options.iterations <= 20, "--iterations must be an integer from 1 to 20");
  invariant(Number.isInteger(options.cycles) && options.cycles >= 1 && options.cycles <= 25, "--cycles must be an integer from 1 to 25");
  invariant(Number.isFinite(options.cpuRate) && options.cpuRate >= 1 && options.cpuRate <= 20, "--cpu-rate must be from 1 to 20");
  invariant(Number.isFinite(options.settleMs) && options.settleMs >= 100 && options.settleMs <= 5_000, "--settle-ms must be from 100 to 5000");
  invariant(Number.isFinite(options.timeoutMs) && options.timeoutMs >= 5_000, "--timeout-ms must be at least 5000");
  invariant(!(options.selfTest && options.dryRun), "--self-test and --dry-run are mutually exclusive");

  const parsedBase = new URL(options.baseUrl);
  invariant(parsedBase.protocol === "http:" || parsedBase.protocol === "https:", "--base-url must use HTTP or HTTPS");
  parsedBase.hash = "";
  parsedBase.search = "";
  if (!parsedBase.pathname.endsWith("/")) parsedBase.pathname += "/";
  options.baseUrl = parsedBase.toString();

  if (!options.help && !options.selfTest && !options.dryRun && !options.output) {
    throw new Error("--output is required for a browser run");
  }
  if (options.output) assertExternalOutputPath(options.output);
  return options;
}

function pathIsWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function assertExternalOutputPath(filePath) {
  const resolved = path.resolve(filePath);
  invariant(path.extname(resolved).toLowerCase() === ".json", "--output must be a JSON file");
  invariant(!pathIsWithin(ROOT, resolved), "Phase 6 performance output must remain outside the repository");
  invariant(!pathIsWithin(os.tmpdir(), resolved), "Phase 6 performance output must remain outside OS temporary storage");
  return resolved;
}

export async function assertFreshExternalOutput(filePath) {
  const resolved = assertExternalOutputPath(filePath);
  try {
    await stat(resolved);
    throw new Error(`refusing to overwrite existing Phase 6 performance evidence: ${resolved}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return resolved;
}

async function writeFreshExternal(filePath, report) {
  const resolved = await assertFreshExternalOutput(filePath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}

function rounded(value) {
  return Number(Number(value).toFixed(3));
}

function percentile(sorted, fraction) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return rounded(sorted[lower]);
  return rounded(sorted[lower] + ((sorted[upper] - sorted[lower]) * (position - lower)));
}

function summarizeValues(values, unit) {
  const sorted = values.filter(Number.isFinite).map(Number).sort((left, right) => left - right);
  return {
    count: sorted.length,
    min: sorted.length ? rounded(sorted[0]) : null,
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted.length ? rounded(sorted.at(-1)) : null,
    unit,
  };
}

export function summarizeDurations(values) {
  return summarizeValues(values, "ms");
}

function summarizeLongTasks(samples) {
  const entries = samples.flatMap((sample) => sample.telemetry?.longTasks ?? []);
  const stageLabels = [...new Set(entries.map(({ stage }) => stage))].sort();
  return {
    attribution: "Long Tasks API container attribution when Chromium exposes it; stage labels are time-window labels only.",
    overall: summarizeDurations(entries.map(({ duration }) => duration)),
    byStage: Object.fromEntries(stageLabels.map((stage) => [stage, summarizeDurations(
      entries.filter((entry) => entry.stage === stage).map(({ duration }) => duration),
    )])),
  };
}

function numericTrend(values) {
  const finite = values.filter(Number.isFinite).map(Number);
  return {
    samples: finite.length,
    first: finite.length ? rounded(finite[0]) : null,
    last: finite.length ? rounded(finite.at(-1)) : null,
    delta: finite.length ? rounded(finite.at(-1) - finite[0]) : null,
    min: finite.length ? rounded(Math.min(...finite)) : null,
    max: finite.length ? rounded(Math.max(...finite)) : null,
  };
}

function summarizeSampleSet(samples) {
  return {
    samples: samples.length,
    statuses: Object.fromEntries([...new Set(samples.map(({ status }) => status))].sort().map((status) => [
      status,
      samples.filter((sample) => sample.status === status).length,
    ])),
    longTasks: summarizeLongTasks(samples),
    cls: summarizeValues(samples.map((sample) => sample.layout?.cls), "score"),
    maximumHorizontalOverflowPx: Math.max(0, ...samples.map((sample) => sample.layout?.horizontalOverflowPx ?? 0)),
    requests: samples.reduce((sum, sample) => sum + (sample.network?.requestCount ?? 0), 0),
    encodedBytes: samples.reduce((sum, sample) => sum + (sample.network?.encodedBytes ?? 0), 0),
    cachedRequests: samples.reduce((sum, sample) => sum + (sample.network?.cachedRequestCount ?? 0), 0),
    maximumActiveRafAtRest: Math.max(0, ...samples.map((sample) => sample.atRest?.second?.rafActive ?? 0)),
    maximumActiveIntervalsAtRest: Math.max(0, ...samples.map((sample) => sample.atRest?.second?.intervalActive ?? 0)),
  };
}

export function summarizeRepresentativeSamples(samples) {
  return REPRESENTATIVE_SCENARIOS.map((scenario) => ({
    id: scenario.id,
    label: scenario.label,
    cold: summarizeSampleSet(samples.filter((sample) => sample.scenario === scenario.id && sample.cacheClass === "cold")),
    warm: summarizeSampleSet(samples.filter((sample) => sample.scenario === scenario.id && sample.cacheClass === "warm")),
  }));
}

export function buildPlan(options) {
  return {
    schema: SCHEMA,
    browser: "Chromium",
    viewport: VIEWPORT,
    representativeScenarios: REPRESENTATIVE_SCENARIOS.map(({ id, label, path }) => ({ id, label, path })),
    cacheClasses: ["cold", "warm"],
    iterationsPerCacheClass: options.iterations,
    representativeSamples: REPRESENTATIVE_SCENARIOS.length * options.iterations * 2,
    lifecycleLoops: [
      { id: "home-support", cycles: options.cycles, pathPair: ["/", "/for-partners/"] },
      { id: "home-maradin", cycles: options.cycles, pathPair: ["/", "/pocs/maradin/"], initiatesMedia: true },
    ],
    mediaNetworkScenarios: MEDIA_NETWORK_SCENARIOS.map(({ id, label }) => ({ id, label })),
    cpuThrottleDiagnostic: { rate: options.cpuRate, scenario: "home-enhanced", availability: "CDP capability-probed at runtime" },
    defaultsSatisfyBrief: options.iterations >= 5 && options.cycles >= 10,
    outputPolicy: "fresh JSON outside both repository and OS temporary storage",
  };
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveChromium(explicitPath = "") {
  const candidates = [];
  if (explicitPath) candidates.push(path.resolve(explicitPath));
  const managed = chromium.executablePath?.();
  if (managed) candidates.push(managed);
  if (process.platform === "win32") {
    candidates.push("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
    candidates.push("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe");
  } else if (process.platform === "darwin") {
    candidates.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  } else {
    candidates.push("/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser");
  }
  for (const candidate of [...new Set(candidates)]) if (await fileExists(candidate)) return candidate;
  throw new Error("Chromium executable unavailable; install Playwright Chromium or pass --browser PATH");
}

function targetUrl(baseUrl, pathname) {
  return new URL(pathname, baseUrl).toString();
}

async function configureMediaPolicy(context, policy) {
  if (policy === "block-home-h264") {
    await context.route(HOME_H264_REQUEST, (route) => route.abort("blockedbyclient"));
  } else if (policy === "drop-home-h264") {
    await context.route(HOME_H264_REQUEST, (route) => route.abort("connectionreset"));
  } else if (policy === "block-home-poster") {
    await context.route(HOME_POSTER_REQUEST, (route) => route.abort("failed"));
  } else if (policy === "block-media") {
    await context.route(MEDIA_REQUEST, (route) => route.abort("blockedbyclient"));
  } else if (policy === "fail-media") {
    await context.route(MEDIA_REQUEST, (route) => route.fulfill({ status: 503, contentType: "video/mp4", body: "" }));
  }
}

async function installInPageProbe(context, persistentEvents) {
  await context.exposeBinding("__phase6LifecycleSink", (_source, event) => {
    persistentEvents.push({ ...event, receivedAtEpochMs: Date.now() });
  });
  await context.addInitScript(() => {
    const markers = [{ stage: "navigation", at: 0 }];
    const rafActive = new Set();
    const intervalActive = new Set();
    const blobLive = new Map();
    const probe = {
      blob: { created: 0, revoked: 0, records: [] },
      capabilities: { layoutShift: false, longTask: false },
      intervals: { created: 0, cleared: 0 },
      layoutShifts: [],
      lifecycle: [],
      longTasks: [],
      markers,
      raf: { cancelled: 0, executed: 0, scheduled: 0 },
    };
    Object.defineProperty(globalThis, "__phase6PerformanceLifecycleProbe", { configurable: true, value: probe });

    // exposeBinding callbacks queued during pagehide can be discarded with the
    // departing document. Keep the cross-document Blob ledger synchronously in
    // this tab's same-origin sessionStorage; the ordinary in-document Map below
    // remains the authority for live URLs in the current document.
    const persistentBlobKey = "__phase6_blob_ledger_v1";
    const readPersistentBlob = () => {
      try {
        const parsed = JSON.parse(sessionStorage.getItem(persistentBlobKey) ?? "{}");
        return {
          created: Number.isSafeInteger(parsed.created) && parsed.created >= 0 ? parsed.created : 0,
          revoked: Number.isSafeInteger(parsed.revoked) && parsed.revoked >= 0 ? parsed.revoked : 0,
          unmatchedRevokes: Number.isSafeInteger(parsed.unmatchedRevokes) && parsed.unmatchedRevokes >= 0 ? parsed.unmatchedRevokes : 0,
          status: "available",
        };
      } catch {
        return { created: null, revoked: null, unmatchedRevokes: null, status: "unsupported" };
      }
    };
    const incrementPersistentBlob = (field) => {
      const ledger = readPersistentBlob();
      if (ledger.status !== "available") return ledger;
      ledger[field] += 1;
      try { sessionStorage.setItem(persistentBlobKey, JSON.stringify({ created: ledger.created, revoked: ledger.revoked, unmatchedRevokes: ledger.unmatchedRevokes })); }
      catch { return { created: null, revoked: null, unmatchedRevokes: null, status: "unsupported" }; }
      return ledger;
    };

    const stageAt = (startTime) => {
      for (let index = markers.length - 1; index >= 0; index -= 1) {
        if (markers[index].at <= startTime) return markers[index].stage;
      }
      return "navigation";
    };
    globalThis.__phase6MarkPerformanceStage = (stage) => {
      markers.push({ stage, at: performance.now() });
    };
    const emit = (event) => {
      const record = { ...event, at: performance.now(), documentUrl: location.href };
      probe.lifecycle.push(record);
      try { globalThis.__phase6LifecycleSink?.(record); } catch { /* diagnostic-only */ }
    };

    const nativeRaf = globalThis.requestAnimationFrame.bind(globalThis);
    const nativeCancelRaf = globalThis.cancelAnimationFrame.bind(globalThis);
    globalThis.requestAnimationFrame = (callback) => {
      let identifier = 0;
      identifier = nativeRaf((timestamp) => {
        rafActive.delete(identifier);
        probe.raf.executed += 1;
        callback(timestamp);
      });
      probe.raf.scheduled += 1;
      rafActive.add(identifier);
      return identifier;
    };
    globalThis.cancelAnimationFrame = (identifier) => {
      if (rafActive.delete(identifier)) probe.raf.cancelled += 1;
      return nativeCancelRaf(identifier);
    };

    const nativeSetInterval = globalThis.setInterval.bind(globalThis);
    const nativeClearInterval = globalThis.clearInterval.bind(globalThis);
    globalThis.setInterval = (handler, timeout, ...args) => {
      const identifier = nativeSetInterval(handler, timeout, ...args);
      probe.intervals.created += 1;
      intervalActive.add(identifier);
      return identifier;
    };
    globalThis.clearInterval = (identifier) => {
      if (intervalActive.delete(identifier)) probe.intervals.cleared += 1;
      return nativeClearInterval(identifier);
    };

    try {
      const nativeCreateObjectUrl = URL.createObjectURL.bind(URL);
      const nativeRevokeObjectUrl = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (object) => {
        const value = nativeCreateObjectUrl(object);
        const record = { action: "create", kind: object?.constructor?.name ?? "unknown", size: Number(object?.size ?? 0), type: object?.type ?? "" };
        blobLive.set(value, record);
        probe.blob.created += 1;
        probe.blob.records.push(record);
        incrementPersistentBlob("created");
        emit({ ...record, blobType: record.type, type: "blob-create" });
        return value;
      };
      URL.revokeObjectURL = (value) => {
        const prior = blobLive.get(value) ?? null;
        blobLive.delete(value);
        probe.blob.revoked += 1;
        probe.blob.records.push({ action: "revoke", kind: prior?.kind ?? "unknown", size: prior?.size ?? null, type: prior?.type ?? "" });
        incrementPersistentBlob(prior ? "revoked" : "unmatchedRevokes");
        emit({ blobType: prior?.type ?? "", kind: prior?.kind ?? "unknown", size: prior?.size ?? null, type: "blob-revoke" });
        return nativeRevokeObjectUrl(value);
      };
    } catch { /* capability-labelled by the snapshot */ }

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          probe.longTasks.push({
            attribution: [...(entry.attribution ?? [])].map((item) => ({
              containerId: item.containerId ?? "",
              containerName: item.containerName ?? "",
              containerSrc: item.containerSrc ?? "",
              containerType: item.containerType ?? "",
              name: item.name ?? "",
            })),
            duration: entry.duration,
            stage: stageAt(entry.startTime),
            startTime: entry.startTime,
          });
        }
      });
      observer.observe({ type: "longtask", buffered: true });
      probe.capabilities.longTask = true;
    } catch { /* unsupported */ }

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) probe.layoutShifts.push({ stage: stageAt(entry.startTime), startTime: entry.startTime, value: entry.value });
        }
      });
      observer.observe({ type: "layout-shift", buffered: true });
      probe.capabilities.layoutShift = true;
    } catch { /* unsupported */ }

    for (const type of ["pageshow", "pagehide", "popstate", "hashchange"]) {
      addEventListener(type, (event) => emit({ type, persisted: typeof event.persisted === "boolean" ? event.persisted : null }));
    }
    document.addEventListener("visibilitychange", () => emit({ type: "visibilitychange", visibilityState: document.visibilityState }));

    globalThis.__phase6ProbeSnapshot = () => ({
      blob: { created: probe.blob.created, revoked: probe.blob.revoked, live: blobLive.size, records: [...probe.blob.records] },
      capabilities: { ...probe.capabilities },
      intervals: { ...probe.intervals, active: intervalActive.size },
      layoutShifts: [...probe.layoutShifts],
      lifecycle: [...probe.lifecycle],
      longTasks: [...probe.longTasks],
      markers: [...markers],
      persistentBlob: readPersistentBlob(),
      raf: { ...probe.raf, active: rafActive.size },
    });
  });
}

async function createInstrumentedContext(browser, scenario = {}) {
  const persistentEvents = [];
  const context = await browser.newContext({
    reducedMotion: scenario.reducedMotion ?? "no-preference",
    serviceWorkers: "block",
    viewport: VIEWPORT,
  });
  await installInPageProbe(context, persistentEvents);
  await configureMediaPolicy(context, scenario.mediaPolicy);
  return { context, persistentEvents };
}

async function enablePerformanceMetrics(session) {
  try {
    await session.send("Performance.enable");
    return { status: "available" };
  } catch (error) {
    return { status: "unsupported", reason: error.message };
  }
}

async function startNetworkCapture(session) {
  const records = new Map();
  const servedFromCache = new Set();
  let currentStage = "navigation";

  const handlers = {
    request(params) {
      records.set(params.requestId, {
        cached: false,
        encodedBytes: 0,
        failed: null,
        method: params.request.method,
        mimeType: "",
        resourceType: params.type,
        stage: currentStage,
        status: null,
        url: params.request.url,
      });
    },
    response(params) {
      const record = records.get(params.requestId);
      if (!record) return;
      record.status = params.response.status;
      record.mimeType = params.response.mimeType;
      record.cached = Boolean(params.response.fromDiskCache || params.response.fromPrefetchCache || servedFromCache.has(params.requestId));
    },
    cache(params) {
      servedFromCache.add(params.requestId);
      const record = records.get(params.requestId);
      if (record) record.cached = true;
    },
    finished(params) {
      const record = records.get(params.requestId);
      if (record) record.encodedBytes = params.encodedDataLength;
    },
    failed(params) {
      const record = records.get(params.requestId);
      if (record) record.failed = params.errorText;
    },
  };
  session.on("Network.requestWillBeSent", handlers.request);
  session.on("Network.responseReceived", handlers.response);
  session.on("Network.requestServedFromCache", handlers.cache);
  session.on("Network.loadingFinished", handlers.finished);
  session.on("Network.loadingFailed", handlers.failed);
  await session.send("Network.enable");

  return {
    setStage(stage) {
      currentStage = stage;
    },
    async stop() {
      await session.send("Network.disable").catch(() => undefined);
      session.off("Network.requestWillBeSent", handlers.request);
      session.off("Network.responseReceived", handlers.response);
      session.off("Network.requestServedFromCache", handlers.cache);
      session.off("Network.loadingFinished", handlers.finished);
      session.off("Network.loadingFailed", handlers.failed);
      const requests = [...records.values()];
      const byStage = {};
      for (const record of requests) {
        byStage[record.stage] ??= { encodedBytes: 0, requests: 0 };
        byStage[record.stage].requests += 1;
        byStage[record.stage].encodedBytes += record.encodedBytes;
      }
      return {
        requestCount: requests.length,
        encodedBytes: rounded(requests.reduce((sum, record) => sum + record.encodedBytes, 0)),
        cachedRequestCount: requests.filter(({ cached }) => cached).length,
        failedRequestCount: requests.filter(({ failed }) => failed).length,
        mediaRequestCount: requests.filter(({ url }) => MEDIA_REQUEST.test(url)).length,
        byStage,
        requests,
      };
    },
  };
}

function startPageDiagnostics(page) {
  const diagnostics = { consoleErrors: [], pageErrors: [], responsesAtOrAbove400: [] };
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push({ text: message.text(), location: message.location() });
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push({ message: error.message, name: error.name }));
  page.on("response", (response) => {
    if (response.status() >= 400) diagnostics.responsesAtOrAbove400.push({ status: response.status(), url: response.url() });
  });
  return diagnostics;
}

async function markStage(page, network, label) {
  network?.setStage(label);
  await page.evaluate((stage) => globalThis.__phase6MarkPerformanceStage?.(stage), label).catch(() => undefined);
}

async function settleDocument(page, scenario, options, { prime = false } = {}) {
  await page.waitForLoadState("domcontentloaded", { timeout: options.timeoutMs }).catch(() => undefined);
  if (scenario.id?.startsWith("home")) {
    await page.waitForFunction(() => {
      const root = document.documentElement;
      const shell = document.querySelector("[data-cinematic-shell]");
      return root.dataset.cinematicMode !== "candidate" && shell?.getAttribute("data-media-state") !== "loading";
    }, undefined, { timeout: Math.min(options.timeoutMs, prime ? 1_500 : 3_000) }).catch(() => undefined);
  }
  await page.waitForTimeout(prime ? Math.min(options.settleMs, 250) : options.settleMs);
}

async function initiateMaradin(page, options) {
  const launch = page.locator("[data-maradin-play]").first();
  await launch.click({ timeout: options.timeoutMs });
  await page.waitForTimeout(Math.max(150, Math.min(500, options.settleMs)));
}

async function exerciseNativeScroll(page, network, options) {
  await markStage(page, network, "scroll-forward-window");
  await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
  for (let index = 0; index < 3; index += 1) {
    await page.mouse.wheel(0, 720);
    await page.waitForTimeout(55);
  }
  await page.waitForTimeout(Math.min(options.settleMs, 300));
  await markStage(page, network, "scroll-reverse-window");
  for (let index = 0; index < 3; index += 1) {
    await page.mouse.wheel(0, -720);
    await page.waitForTimeout(55);
  }
  await page.waitForTimeout(Math.min(options.settleMs, 300));
}

async function inPageSnapshot(page) {
  return page.evaluate(() => {
    const probe = globalThis.__phase6ProbeSnapshot?.() ?? null;
    const root = document.documentElement;
    const documentWidth = Math.max(root.scrollWidth, document.body?.scrollWidth ?? 0);
    const visible = (element) => {
      if (!element || element.closest("[hidden],[inert],[aria-hidden='true']")) return false;
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0.01 && bounds.width > 0 && bounds.height > 0;
    };
    const rendered = (element) => {
      if (!element || element.closest("[hidden]")) return false;
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0.01 && bounds.width > 0 && bounds.height > 0;
    };
    const media = [...document.querySelectorAll("video,audio")].map((element) => ({
      currentSrc: element.currentSrc,
      hasSrcAttribute: element.hasAttribute("src"),
      paused: element.paused,
      readyState: element.readyState,
      src: element.getAttribute("src") ?? "",
    }));
    const shell = document.querySelector("[data-cinematic-shell]");
    const entry = document.querySelector("#entry");
    const poster = document.querySelector("[data-cinematic-poster]");
    const stage = document.querySelector("[data-cinematic-stage]");
    const homeVideo = document.querySelector("[data-cinematic-media]");
    const players = [...document.querySelectorAll("[data-maradin-player]")].map((player) => {
      const video = player.querySelector("[data-maradin-video]");
      const launch = player.querySelector("[data-maradin-play]");
      return {
        currentSrc: video?.currentSrc ?? "",
        hasSrcAttribute: video?.hasAttribute("src") ?? false,
        launchVisible: visible(launch),
        paused: video?.paused ?? true,
        readyState: video?.readyState ?? 0,
        state: player.getAttribute("data-video-state") ?? null,
      };
    });
    const navigation = performance.getEntriesByType("navigation")[0];
    return {
      blob: probe?.blob ?? null,
      capabilities: probe?.capabilities ?? null,
      cls: (probe?.layoutShifts ?? []).reduce((sum, entry) => sum + entry.value, 0),
      domNodes: document.getElementsByTagName("*").length,
      heapUsedBytes: Number(performance.memory?.usedJSHeapSize ?? NaN),
      horizontalOverflowPx: Math.max(0, documentWidth - innerWidth),
      intervals: probe?.intervals ?? null,
      layoutShifts: probe?.layoutShifts ?? [],
      lifecycle: probe?.lifecycle ?? [],
      longTasks: probe?.longTasks ?? [],
      home: shell ? {
        cinematicFootprintHeight: entry ? entry.getBoundingClientRect().bottom - shell.getBoundingClientRect().top : null,
        fallback: root.dataset.cinematicFallback ?? null,
        mediaState: shell.getAttribute("data-media-state"),
        mode: root.dataset.cinematicMode ?? null,
        posterVisible: rendered(poster),
        stageVisible: rendered(stage),
        video: homeVideo ? {
          currentSrc: homeVideo.currentSrc,
          hasSrcAttribute: homeVideo.hasAttribute("src"),
          paused: homeVideo.paused,
          readyState: homeVideo.readyState,
        } : null,
        viewportHeight: innerHeight,
      } : null,
      media,
      maradin: players.length ? {
        activePlayers: players.filter(({ state }) => state === "active").length,
        players,
        sourcedPlayers: players.filter(({ hasSrcAttribute, readyState }) => hasSrcAttribute || readyState > 0).length,
      } : null,
      navigationType: navigation?.type ?? null,
      persistentBlob: probe?.persistentBlob ?? null,
      raf: probe?.raf ?? null,
      routeIdentity: document.querySelector("[data-route-production]")?.getAttribute("data-route-production") ?? null,
      semantic: {
        h1Count: document.querySelectorAll("main h1").length,
        mainCount: document.querySelectorAll("main").length,
        usableNavigationLinks: [...document.querySelectorAll("a[href]")].filter(visible).length,
        visibleBusyOverlays: [...document.querySelectorAll("[aria-busy='true'],[role='dialog'][aria-modal='true']")].filter(visible).length,
      },
      scrollY,
      url: location.href,
      visibilityState: document.visibilityState,
    };
  });
}

async function cdpSnapshot(session) {
  let domCounters = null;
  let performanceMetrics = null;
  try {
    domCounters = await session.send("Memory.getDOMCounters");
  } catch { /* unsupported */ }
  try {
    const response = await session.send("Performance.getMetrics");
    performanceMetrics = Object.fromEntries(response.metrics.map(({ name, value }) => [name, value]));
  } catch { /* unsupported */ }
  return {
    domCounters,
    jsHeapUsedBytes: Number(performanceMetrics?.JSHeapUsedSize ?? NaN),
    performanceMetrics,
  };
}

async function collectGarbage(session) {
  try {
    await session.send("HeapProfiler.collectGarbage");
    return { status: "requested" };
  } catch (error) {
    return { status: "unsupported", reason: error.message };
  }
}

async function activityAtRest(page) {
  return page.evaluate(() => {
    const snapshot = globalThis.__phase6ProbeSnapshot?.();
    return {
      at: performance.now(),
      intervalActive: snapshot?.intervals?.active ?? null,
      intervalCreated: snapshot?.intervals?.created ?? null,
      rafActive: snapshot?.raf?.active ?? null,
      rafExecuted: snapshot?.raf?.executed ?? null,
      rafScheduled: snapshot?.raf?.scheduled ?? null,
    };
  });
}

async function primeWarmContext(context, scenario, options) {
  const page = await context.newPage();
  try {
    await page.goto(targetUrl(options.baseUrl, scenario.path), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await settleDocument(page, scenario, options, { prime: true });
    if (scenario.initiateVideo) await initiateMaradin(page, options).catch(() => undefined);
  } finally {
    await page.close();
  }
}

async function runScenarioSample(context, scenario, cacheClass, iteration, options, configuration = {}) {
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  const performanceMetricsCapability = await enablePerformanceMetrics(session);
  const diagnostics = startPageDiagnostics(page);
  let network;
  let cpuThrottle = { rate: configuration.cpuRate ?? 1, status: configuration.cpuRate ? "pending" : "not-requested" };
  const startedAt = Date.now();
  try {
    await session.send("Network.setCacheDisabled", { cacheDisabled: cacheClass === "cold" });
    if (cacheClass === "cold") await session.send("Network.clearBrowserCache");
    if (configuration.cpuRate) {
      try {
        await session.send("Emulation.setCPUThrottlingRate", { rate: configuration.cpuRate });
        cpuThrottle = { rate: configuration.cpuRate, status: "applied" };
      } catch (error) {
        cpuThrottle = { rate: configuration.cpuRate, status: "unsupported", reason: error.message };
      }
    }
    network = await startNetworkCapture(session);
    const response = await page.goto(targetUrl(options.baseUrl, scenario.path), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await markStage(page, network, "post-navigation-settle");
    await settleDocument(page, scenario, options);
    if (scenario.initiateVideo) {
      await markStage(page, network, "media-user-initiation");
      await initiateMaradin(page, options);
    }
    await exerciseNativeScroll(page, network, options);
    await markStage(page, network, "at-rest-window");
    await page.waitForTimeout(Math.max(180, options.settleMs));
    const firstAtRest = await activityAtRest(page);
    await page.waitForTimeout(220);
    const secondAtRest = await activityAtRest(page);
    await page.waitForTimeout(80);
    const runtime = await inPageSnapshot(page);
    const cdp = await cdpSnapshot(session);
    const observedStatus = response?.status() ?? null;
    const status = observedStatus === scenario.expectedStatus && diagnostics.pageErrors.length === 0 ? "PASS" : "FAIL";
    const networkResult = await network.stop();
    network = null;
    return {
      atRest: {
        first: firstAtRest,
        second: secondAtRest,
        scheduledRafDelta: secondAtRest.rafScheduled === null ? null : secondAtRest.rafScheduled - firstAtRest.rafScheduled,
        executedRafDelta: secondAtRest.rafExecuted === null ? null : secondAtRest.rafExecuted - firstAtRest.rafExecuted,
      },
      cacheClass,
      cdp,
      cpuThrottle,
      diagnostics,
      elapsedMs: Date.now() - startedAt,
      expectedStatus: scenario.expectedStatus,
      iteration,
      layout: {
        cls: rounded(runtime.cls),
        horizontalOverflowPx: rounded(runtime.horizontalOverflowPx),
        shifts: runtime.layoutShifts,
      },
      network: networkResult,
      observedStatus,
      performanceMetricsCapability,
      scenario: scenario.id,
      status,
      telemetry: {
        blob: runtime.blob,
        capabilities: runtime.capabilities,
        intervals: runtime.intervals,
        lifecycle: runtime.lifecycle,
        longTasks: runtime.longTasks,
        media: runtime.media,
        raf: runtime.raf,
      },
      url: runtime.url,
    };
  } finally {
    if (network) await network.stop().catch(() => undefined);
    if (configuration.cpuRate && cpuThrottle.status === "applied") {
      await session.send("Emulation.setCPUThrottlingRate", { rate: 1 }).catch(() => undefined);
    }
    await page.close().catch(() => undefined);
  }
}

function errorSample(scenario, cacheClass, iteration, error) {
  return {
    cacheClass,
    error: error instanceof Error ? error.message : String(error),
    iteration,
    scenario: scenario.id,
    status: "ERROR",
  };
}

async function runRepresentativeMatrix(browser, options, progress) {
  const samples = [];
  for (const scenario of REPRESENTATIVE_SCENARIOS) {
    for (let iteration = 1; iteration <= options.iterations; iteration += 1) {
      progress(`representative ${scenario.id} cold ${iteration}/${options.iterations}`);
      let context;
      try {
        ({ context } = await createInstrumentedContext(browser, scenario));
        samples.push(await runScenarioSample(context, scenario, "cold", iteration, options));
      } catch (error) {
        samples.push(errorSample(scenario, "cold", iteration, error));
      } finally {
        await context?.close().catch(() => undefined);
      }
    }

    let warmContext;
    let primeError = null;
    try {
      ({ context: warmContext } = await createInstrumentedContext(browser, scenario));
      await primeWarmContext(warmContext, scenario, options);
    } catch (error) {
      primeError = error instanceof Error ? error.message : String(error);
    }
    for (let iteration = 1; iteration <= options.iterations; iteration += 1) {
      progress(`representative ${scenario.id} warm ${iteration}/${options.iterations}`);
      if (!warmContext) {
        samples.push({ ...errorSample(scenario, "warm", iteration, new Error(primeError ?? "warm context unavailable")), primeError });
        continue;
      }
      try {
        const sample = await runScenarioSample(warmContext, scenario, "warm", iteration, options);
        samples.push(primeError ? { ...sample, primeError } : sample);
      } catch (error) {
        samples.push({ ...errorSample(scenario, "warm", iteration, error), primeError });
      }
    }
    await warmContext?.close().catch(() => undefined);
  }
  return samples;
}

async function lifecycleSnapshot(page, session, persistentEvents, label, cycle) {
  const garbageCollection = await collectGarbage(session);
  await page.waitForTimeout(40);
  const runtime = await inPageSnapshot(page);
  const cdp = await cdpSnapshot(session);
  return {
    blobCreated: runtime.blob?.created ?? null,
    blobLive: runtime.blob?.live ?? null,
    blobRevoked: runtime.blob?.revoked ?? null,
    cdpDocuments: cdp.domCounters?.documents ?? null,
    cdpEventListeners: cdp.domCounters?.jsEventListeners ?? null,
    cdpHeapUsedBytes: Number.isFinite(cdp.jsHeapUsedBytes) ? cdp.jsHeapUsedBytes : null,
    cdpNodes: cdp.domCounters?.nodes ?? null,
    cycle,
    domNodes: runtime.domNodes,
    garbageCollection,
    heapUsedBytes: Number.isFinite(runtime.heapUsedBytes) ? runtime.heapUsedBytes : null,
    intervalActive: runtime.intervals?.active ?? null,
    label,
    mediaActive: runtime.media.filter(({ paused }) => !paused).length,
    mediaElements: runtime.media.length,
    mediaWithSource: runtime.media.filter(({ currentSrc, hasSrcAttribute }) => currentSrc || hasSrcAttribute).length,
    bindingBlobCreates: persistentEvents.filter(({ type }) => type === "blob-create").length,
    bindingBlobRevokes: persistentEvents.filter(({ type }) => type === "blob-revoke").length,
    persistentBlobCreates: runtime.persistentBlob?.created ?? null,
    persistentBlobRevokes: runtime.persistentBlob?.revoked ?? null,
    persistentBlobTelemetry: runtime.persistentBlob?.status ?? "unsupported",
    persistentBlobUnmatchedRevokes: runtime.persistentBlob?.unmatchedRevokes ?? null,
    rafActive: runtime.raf?.active ?? null,
    routeIdentity: runtime.routeIdentity,
    url: runtime.url,
    visibilityState: runtime.visibilityState,
  };
}

function summarizeLifecycleSnapshots(snapshots) {
  return {
    blobLive: numericTrend(snapshots.map(({ blobLive }) => blobLive)),
    cdpDocuments: numericTrend(snapshots.map(({ cdpDocuments }) => cdpDocuments)),
    cdpEventListeners: numericTrend(snapshots.map(({ cdpEventListeners }) => cdpEventListeners)),
    cdpHeapUsedBytes: numericTrend(snapshots.map(({ cdpHeapUsedBytes }) => cdpHeapUsedBytes)),
    cdpNodes: numericTrend(snapshots.map(({ cdpNodes }) => cdpNodes)),
    domNodes: numericTrend(snapshots.map(({ domNodes }) => domNodes)),
    heapUsedBytes: numericTrend(snapshots.map(({ heapUsedBytes }) => heapUsedBytes)),
    intervalActive: numericTrend(snapshots.map(({ intervalActive }) => intervalActive)),
    mediaActive: numericTrend(snapshots.map(({ mediaActive }) => mediaActive)),
    mediaWithSource: numericTrend(snapshots.map(({ mediaWithSource }) => mediaWithSource)),
    persistentBlobBalance: numericTrend(snapshots.map(({ persistentBlobCreates, persistentBlobRevokes }) => (
      Number.isFinite(persistentBlobCreates) && Number.isFinite(persistentBlobRevokes)
        ? persistentBlobCreates - persistentBlobRevokes
        : null
    ))),
    rafActive: numericTrend(snapshots.map(({ rafActive }) => rafActive)),
  };
}

export function assessLifecycleBoundedness(snapshots) {
  const maximumCycle = Math.max(1, ...snapshots.map(({ cycle }) => cycle ?? 0));
  const warmStart = maximumCycle >= 3 ? 3 : 1;
  const active = snapshots.filter(({ cycle, label }) => cycle >= warmStart && label !== "post-loop-cleanup");
  const labels = [...new Set(active.map(({ label }) => label))];
  const checks = [];
  const ranges = {};
  const addRangeCheck = (label, key, absoluteLimit, relativeLimit = 0) => {
    const values = active.filter((snapshot) => snapshot.label === label).map((snapshot) => snapshot[key]).filter(Number.isFinite);
    if (!values.length) return;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const limit = Math.max(absoluteLimit, Math.abs(values[0]) * relativeLimit);
    ranges[label] ??= {};
    ranges[label][key] = { min, max, range, limit, samples: values.length };
    checks.push({ id: `${label}-${key}-range`, pass: range <= limit, actual: range, limit });
  };
  for (const label of labels) {
    addRangeCheck(label, "domNodes", 4);
    addRangeCheck(label, "cdpDocuments", 2);
    addRangeCheck(label, "cdpNodes", 500, 0.2);
    addRangeCheck(label, "cdpEventListeners", 60, 0.2);
    addRangeCheck(label, "cdpHeapUsedBytes", 8 * 1024 * 1024, 0.75);
  }
  const cleanup = snapshots.findLast(({ label }) => label === "post-loop-cleanup") ?? snapshots.at(-1);
  if (cleanup) {
    for (const [key, expected] of [["rafActive", 0], ["intervalActive", 0], ["mediaActive", 0], ["mediaWithSource", 0], ["blobLive", 0]]) {
      if (Number.isFinite(cleanup[key])) checks.push({ id: `cleanup-${key}`, pass: cleanup[key] === expected, actual: cleanup[key], expected });
    }
    const persistentBlobTelemetryAvailable = cleanup.persistentBlobTelemetry === "available"
      && Number.isFinite(cleanup.persistentBlobCreates)
      && Number.isFinite(cleanup.persistentBlobRevokes);
    checks.push({
      id: "cleanup-persistent-blob-telemetry",
      pass: persistentBlobTelemetryAvailable,
      actual: cleanup.persistentBlobTelemetry ?? "unsupported",
      expected: "available",
    });
    if (persistentBlobTelemetryAvailable) {
      checks.push({
        id: "cleanup-persistent-blob-balance",
        pass: cleanup.persistentBlobCreates === cleanup.persistentBlobRevokes,
        actual: cleanup.persistentBlobCreates - cleanup.persistentBlobRevokes,
        expected: 0,
      });
    }
  }
  const bounded = checks.every(({ pass }) => pass);
  return {
    bounded,
    checks,
    conclusion: bounded
      ? "PASS — forced-GC same-route indicators remained bounded after warm-up and final media/RAF/interval/Blob state was released."
      : "FAIL — at least one forced-GC same-route indicator exceeded its diagnostic bound or final resources remained active.",
    ranges,
    warmStartCycle: warmStart,
  };
}

async function runLifecycleLoop(browser, options, definition, progress) {
  const { context, persistentEvents } = await createInstrumentedContext(browser);
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  await enablePerformanceMetrics(session);
  const snapshots = [];
  try {
    for (let cycle = 1; cycle <= options.cycles; cycle += 1) {
      progress(`lifecycle ${definition.id} ${cycle}/${options.cycles}`);
      await page.goto(targetUrl(options.baseUrl, "/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
      await settleDocument(page, REPRESENTATIVE_SCENARIOS[0], { ...options, settleMs: Math.min(options.settleMs, 250) }, { prime: true });
      snapshots.push(await lifecycleSnapshot(page, session, persistentEvents, "home", cycle));

      await page.goto(targetUrl(options.baseUrl, definition.targetPath), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
      await page.waitForTimeout(Math.min(options.settleMs, 300));
      if (definition.initiateVideo) await initiateMaradin(page, options);
      snapshots.push(await lifecycleSnapshot(page, session, persistentEvents, definition.targetLabel, cycle));
    }
    await page.goto(targetUrl(options.baseUrl, "/contact/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await page.waitForTimeout(Math.min(options.settleMs, 300));
    snapshots.push(await lifecycleSnapshot(page, session, persistentEvents, "post-loop-cleanup", options.cycles));
    const boundedness = assessLifecycleBoundedness(snapshots);
    return {
      boundedness,
      cycles: options.cycles,
      id: definition.id,
      indicators: summarizeLifecycleSnapshots(snapshots),
      persistentEvents,
      snapshots,
      status: boundedness.bounded ? "COMPLETE" : "UNBOUNDED",
    };
  } finally {
    await context.close();
  }
}

async function runVisibilityCheck(browser, options) {
  const scenario = REPRESENTATIVE_SCENARIOS.find(({ id }) => id === "maradin-post-user-initiation");
  const { context, persistentEvents } = await createInstrumentedContext(browser, scenario);
  const primary = await context.newPage();
  const session = await context.newCDPSession(primary);
  await enablePerformanceMetrics(session);
  try {
    await primary.goto(targetUrl(options.baseUrl, scenario.path), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await initiateMaradin(primary, options);
    const beforeBackground = await lifecycleSnapshot(primary, session, persistentEvents, "before-background", 0);
    const background = await context.newPage();
    await background.goto("data:text/html,<title>Phase%206%20visibility%20probe</title>");
    await background.bringToFront();
    await primary.waitForTimeout(250);
    const whileBackground = await lifecycleSnapshot(primary, session, persistentEvents, "while-background", 0);
    await primary.bringToFront();
    await primary.waitForTimeout(150);
    const afterForeground = await lifecycleSnapshot(primary, session, persistentEvents, "after-foreground", 0);
    await background.close();
    const hiddenObserved = whileBackground.visibilityState === "hidden";
    const mediaReleasedWhenHidden = hiddenObserved ? whileBackground.mediaWithSource === 0 && whileBackground.mediaActive === 0 : null;
    return {
      afterForeground,
      beforeBackground,
      events: persistentEvents.filter(({ type }) => type === "visibilitychange"),
      hiddenObserved,
      mediaReleasedWhenHidden,
      status: hiddenObserved ? (mediaReleasedWhenHidden ? "PASS" : "FAIL") : "NOT_OBSERVED",
      whileBackground,
    };
  } finally {
    await context.close();
  }
}

async function historyState(page) {
  return page.evaluate(() => ({
    entryIntent: document.documentElement.dataset.cinematicEntryIntent ?? null,
    hash: location.hash,
    href: location.href,
    navigationType: performance.getEntriesByType("navigation")[0]?.type ?? null,
    scrollY,
  }));
}

async function runHistoryCheck(browser, options) {
  const { context, persistentEvents } = await createInstrumentedContext(browser);
  const page = await context.newPage();
  try {
    await page.goto(targetUrl(options.baseUrl, "/#entry"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await settleDocument(page, REPRESENTATIVE_SCENARIOS[0], options);
    await page.waitForFunction(() => document.documentElement.dataset.cinematicEntryIntent !== "pending", undefined, { timeout: 3_000 }).catch(() => undefined);
    const directEntry = await historyState(page);
    await page.goto(targetUrl(options.baseUrl, "/for-partners/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    const support = await historyState(page);
    await page.goBack({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await page.waitForTimeout(options.settleMs);
    const back = await historyState(page);
    await page.goForward({ waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await page.waitForTimeout(options.settleMs);
    const forward = await historyState(page);
    const persistedEvents = persistentEvents.filter(({ type, persisted }) => (type === "pageshow" || type === "pagehide") && persisted === true);
    const urlsCorrect = new URL(directEntry.href).pathname === "/"
      && directEntry.hash === "#entry"
      && new URL(support.href).pathname === "/for-partners/"
      && new URL(back.href).pathname === "/"
      && back.hash === "#entry"
      && new URL(forward.href).pathname === "/for-partners/";
    return {
      bfcache: {
        events: persistedEvents,
        status: persistedEvents.length ? "observed" : "not-observed",
        statement: persistedEvents.length
          ? "At least one real page transition reported persisted=true."
          : "No real page transition reported persisted=true; this is a labelled observation, not proof that BFCache is disabled.",
      },
      events: persistentEvents.filter(({ type }) => ["pageshow", "pagehide", "popstate", "hashchange"].includes(type)),
      states: { back, directEntry, forward, support },
      status: urlsCorrect ? "PASS" : "FAIL",
      urlsCorrect,
    };
  } finally {
    await context.close();
  }
}

async function applyMediaNetworkCondition(context, session, scenario) {
  if (scenario.offlineAfterDocumentLoad || scenario.offlineAfterBlob) {
    await context.setOffline(true);
    return { kind: "offline", status: "applied" };
  }
  if (Number.isFinite(scenario.latencyMs)) {
    try {
      await session.send("Network.emulateNetworkConditions", {
        connectionType: scenario.id === "low-bandwidth-media" ? "cellular3g" : "other",
        downloadThroughput: scenario.downloadBytesPerSecond,
        latency: scenario.latencyMs,
        offline: false,
        uploadThroughput: scenario.downloadBytesPerSecond,
      });
      return { kind: "CDP Network.emulateNetworkConditions", status: "applied" };
    } catch (error) {
      return { kind: "CDP Network.emulateNetworkConditions", status: "unsupported", reason: error.message };
    }
  }
  return { kind: scenario.mediaPolicy, status: "applied" };
}

async function resetMediaNetworkCondition(context, session, scenario) {
  if (scenario.offlineAfterDocumentLoad || scenario.offlineAfterBlob) await context.setOffline(false).catch(() => undefined);
  if (Number.isFinite(scenario.latencyMs)) {
    await session.send("Network.emulateNetworkConditions", {
      downloadThroughput: -1,
      latency: 0,
      offline: false,
      uploadThroughput: -1,
    }).catch(() => undefined);
  }
}

function relevantNetworkRequests(scenario, network) {
  const expression = scenario.expectedOutcome === "home-poster-resilient" ? HOME_POSTER_REQUEST
    : scenario.target === "home" ? HOME_H264_REQUEST
      : MEDIA_REQUEST;
  return (network?.requests ?? []).filter(({ url }) => expression.test(url));
}

function intentionalFaultScenario(scenario) {
  return ["block-media", "fail-media", "drop-home-h264", "block-home-poster"].includes(scenario.mediaPolicy)
    || scenario.offlineAfterDocumentLoad === true;
}

function expectedRequestFault(scenario, request) {
  if (!request) return false;
  if (scenario.mediaPolicy === "fail-media") return request.status === 503;
  if (["block-media", "drop-home-h264", "block-home-poster"].includes(scenario.mediaPolicy) || scenario.offlineAfterDocumentLoad) {
    return typeof request.failed === "string" && request.failed.length > 0;
  }
  return [200, 206].includes(request.status);
}

function dormantMaradin(runtime) {
  const players = runtime?.maradin?.players ?? [];
  return players.length === 2 && players.every((player) => player.state === "dormant"
    && !player.hasSrcAttribute && player.paused && player.readyState === 0 && player.launchVisible);
}

function releasedRuntime(runtime) {
  const media = runtime?.media ?? [];
  return media.every(({ hasSrcAttribute, paused, readyState }) => !hasSrcAttribute && paused && readyState === 0)
    && (runtime?.blob?.live ?? 0) === 0
    && (runtime?.raf?.active ?? 0) === 0
    && (runtime?.intervals?.active ?? 0) === 0;
}

function assertion(id, pass, actual, expected) {
  return { id, pass: Boolean(pass), actual, expected };
}

export function assessMediaNetworkDiagnostic(scenario, observation) {
  const { afterTeardown, beforeCleanup, cleanup, condition, diagnostics, lifecycleEvents, network } = observation;
  const relevant = relevantNetworkRequests(scenario, network);
  const allMedia = (network?.requests ?? []).filter(({ url }) => MEDIA_REQUEST.test(url));
  const expectedFault = intentionalFaultScenario(scenario);
  const unexpectedFailedRequests = (network?.requests ?? []).filter((request) => request.failed
    && !relevant.includes(request)
    && !(observation.teardownTransition?.persisted === false
      && /^blob:/i.test(request.url)
      && /aborted|cancelled|canceled/i.test(request.failed)));
  const unexpectedResponses = (diagnostics?.responsesAtOrAbove400 ?? []).filter(({ status, url }) => {
    return !(scenario.mediaPolicy === "fail-media" && status === 503 && MEDIA_REQUEST.test(url));
  });
  const unexpectedConsoleErrors = (diagnostics?.consoleErrors ?? []).filter(({ text }) => {
    return !(expectedFault && /failed to load resource|net::err_|status of 503/i.test(text));
  });
  const blobCreates = (lifecycleEvents ?? []).filter(({ type }) => type === "blob-create").length;
  const blobRevokes = (lifecycleEvents ?? []).filter(({ type }) => type === "blob-revoke").length;
  const assertions = [
    assertion("condition-applied", condition?.status === "applied", condition, { status: "applied" }),
    assertion("document-status", observation.documentStatus === 200, observation.documentStatus, 200),
    assertion("one-selected-request-no-retry", relevant.length === 1, relevant.length, 1),
    assertion("expected-request-outcome", relevant.length === 1 && expectedRequestFault(scenario, relevant[0]), relevant[0] ?? null, scenario.expectedOutcome),
    assertion("no-unexpected-network-failures", unexpectedFailedRequests.length === 0, unexpectedFailedRequests, []),
    assertion("no-unexpected-http-errors", unexpectedResponses.length === 0, unexpectedResponses, []),
    assertion("no-unexpected-console-errors", unexpectedConsoleErrors.length === 0, unexpectedConsoleErrors, []),
    assertion("no-page-errors", (diagnostics?.pageErrors ?? []).length === 0, diagnostics?.pageErrors ?? [], []),
    assertion("semantic-document-remains-usable", beforeCleanup?.semantic?.h1Count === 1
      && beforeCleanup?.semantic?.mainCount === 1
      && beforeCleanup?.semantic?.usableNavigationLinks >= 1
      && beforeCleanup?.semantic?.visibleBusyOverlays === 0, beforeCleanup?.semantic ?? null, "one H1/main, usable navigation, no busy modal"),
    assertion("no-horizontal-overflow", Number.isFinite(beforeCleanup?.horizontalOverflowPx) && beforeCleanup.horizontalOverflowPx <= 2, beforeCleanup?.horizontalOverflowPx ?? null, "<= 2px"),
    assertion("bounded-cls", Number.isFinite(beforeCleanup?.cls) && beforeCleanup.cls <= 0.1, beforeCleanup?.cls ?? null, "<= 0.1"),
    assertion("controller-teardown-release", releasedRuntime(afterTeardown), afterTeardown ? {
      blobLive: afterTeardown.blob?.live ?? null,
      intervalActive: afterTeardown.intervals?.active ?? null,
      media: afterTeardown.media,
      rafActive: afterTeardown.raf?.active ?? null,
      routeIdentity: afterTeardown.routeIdentity,
    } : null, "same-document non-persisted pagehide releases media/Blob/RAF/interval activity"),
    assertion("final-route-cleanup", cleanup?.routeIdentity === "contact" && releasedRuntime(cleanup), cleanup ? {
      blobLive: cleanup.blob?.live ?? null,
      intervalActive: cleanup.intervals?.active ?? null,
      media: cleanup.media,
      rafActive: cleanup.raf?.active ?? null,
      routeIdentity: cleanup.routeIdentity,
    } : null, "contact with no media/Blob/RAF/interval activity"),
    assertion("blob-balance-after-cleanup", blobCreates === blobRevokes, { blobCreates, blobRevokes }, "balanced"),
  ];

  if (scenario.target === "maradin") {
    assertions.push(
      assertion("maradin-route-identity", beforeCleanup?.routeIdentity === "maradin", beforeCleanup?.routeIdentity ?? null, "maradin"),
      assertion("maradin-single-decoder-bound", (beforeCleanup?.maradin?.sourcedPlayers ?? Infinity) <= 1 && (beforeCleanup?.maradin?.activePlayers ?? Infinity) <= 1, beforeCleanup?.maradin ?? null, "at most one active/sourced player"),
    );
    if (scenario.expectedOutcome === "maradin-dormant") assertions.push(assertion("maradin-failure-restores-dormancy", dormantMaradin(beforeCleanup), beforeCleanup?.maradin ?? null, "two retryable dormant source-free players"));
  }

  if (scenario.target === "home") {
    const home = beforeCleanup?.home;
    const homeMediaCount = allMedia.filter(({ url }) => HOME_H264_REQUEST.test(url)).length;
    assertions.push(
      assertion("home-route-identity", Boolean(home), home, "Home cinematic shell present"),
      assertion("home-one-h264-zero-vp9", homeMediaCount === 1 && !allMedia.some(({ url }) => /vp9/i.test(url)), allMedia, "one H264 and zero VP9 requests"),
      assertion("home-single-decoder-bound", (beforeCleanup?.media ?? []).filter(({ currentSrc, hasSrcAttribute }) => currentSrc || hasSrcAttribute).length <= 1, beforeCleanup?.media ?? [], "at most one sourced media element"),
    );
    if (scenario.expectedOutcome === "home-static-fallback") {
      assertions.push(
        assertion("home-static-coherent-fallback", home?.mode === "static" && home?.mediaState === "failed" && home?.posterVisible === true && home?.stageVisible === true, home ?? null, "static failed state with visible governed poster/stage"),
        assertion("home-fallback-geometry", Number.isFinite(home?.cinematicFootprintHeight) && Number.isFinite(home?.viewportHeight) && home.cinematicFootprintHeight <= home.viewportHeight * 2.05, home ?? null, "cinematic footprint <= 2.05 viewports"),
        assertion("home-failed-media-released", home?.video && !home.video.currentSrc && !home.video.hasSrcAttribute && home.video.paused && home.video.readyState === 0 && (beforeCleanup?.blob?.live ?? 0) === 0, { blob: beforeCleanup?.blob, video: home?.video }, "source-free paused media and zero Blob"),
      );
    } else if (scenario.expectedOutcome === "home-blob-offline") {
      assertions.push(
        assertion("home-blob-created-before-drop", blobCreates >= 1 && condition?.trigger === "blob-created", { blobCreates, condition }, "Blob observed before offline transition"),
        assertion("home-post-blob-remains-coherent", home?.mode === "enhanced" && ["ready", "loading"].includes(home?.mediaState) && home?.stageVisible === true && (beforeCleanup?.blob?.live ?? 0) === 1, { blob: beforeCleanup?.blob, home }, "enhanced visible stage backed by one local Blob"),
      );
    } else if (scenario.expectedOutcome === "home-poster-resilient") {
      assertions.push(
        assertion("home-poster-request-failed", relevant.length === 1 && Boolean(relevant[0]?.failed), relevant[0] ?? null, "one failed poster request"),
        assertion("home-poster-failure-no-loading-trap", home?.mode === "enhanced" && home?.mediaState === "ready" && home?.stageVisible === true, home ?? null, "enhanced ready visible stage"),
      );
    }
  }

  const failures = assertions.filter(({ pass }) => !pass);
  return { assertions, failures, status: failures.length ? "FAIL" : "PASS" };
}

async function dispatchNonPersistedPagehide(page) {
  return page.evaluate(() => {
    let event;
    let constructor = "PageTransitionEvent";
    try {
      event = new PageTransitionEvent("pagehide", { persisted: false });
    } catch {
      constructor = "Event-with-persisted";
      event = new Event("pagehide");
      Object.defineProperty(event, "persisted", { value: false });
    }
    dispatchEvent(event);
    return { constructor, persisted: event.persisted === true, type: event.type };
  });
}

async function runMediaNetworkDiagnostic(browser, options, scenario, progress) {
  progress(`network ${scenario.id}`);
  const { context, persistentEvents } = await createInstrumentedContext(browser, scenario);
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  const diagnostics = startPageDiagnostics(page);
  const network = await startNetworkCapture(session);
  try {
    const response = await page.goto(targetUrl(options.baseUrl, scenario.path), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await page.waitForTimeout(Math.min(options.settleMs, 300));
    await markStage(page, network, `network-${scenario.id}`);
    let condition;
    if (scenario.offlineAfterBlob) {
      await page.waitForFunction(() => (globalThis.__phase6ProbeSnapshot?.().blob?.created ?? 0) >= 1, undefined, { timeout: Math.min(options.timeoutMs, 8_000) });
      condition = { ...await applyMediaNetworkCondition(context, session, scenario), trigger: "blob-created" };
    } else if (scenario.target === "home") {
      condition = { kind: scenario.mediaPolicy, status: "applied", trigger: "before-navigation" };
    } else {
      condition = await applyMediaNetworkCondition(context, session, scenario);
      await initiateMaradin(page, options);
    }
    if (scenario.expectedOutcome === "home-static-fallback") {
      await page.waitForFunction(() => document.documentElement.dataset.cinematicMode === "static" && document.querySelector("[data-cinematic-shell]")?.getAttribute("data-media-state") === "failed", undefined, { timeout: Math.min(options.timeoutMs, 8_000) }).catch(() => undefined);
    } else if (scenario.expectedOutcome === "home-poster-resilient") {
      await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-media-state") !== "loading", undefined, { timeout: Math.min(options.timeoutMs, 8_000) }).catch(() => undefined);
    } else if (scenario.expectedOutcome === "maradin-dormant") {
      await page.waitForFunction(() => [...document.querySelectorAll("[data-maradin-player]")].every((player) => player.getAttribute("data-video-state") === "dormant"), undefined, { timeout: Math.min(options.timeoutMs, 4_000) }).catch(() => undefined);
    }
    await page.waitForTimeout(Math.max(750, options.settleMs));
    const beforeCleanup = await inPageSnapshot(page);
    await resetMediaNetworkCondition(context, session, scenario);
    const teardownTransition = await dispatchNonPersistedPagehide(page);
    await page.waitForTimeout(120);
    const afterTeardown = await inPageSnapshot(page);
    await markStage(page, network, `cleanup-${scenario.id}`);
    await page.goto(targetUrl(options.baseUrl, "/contact/"), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await page.waitForTimeout(Math.max(350, options.settleMs));
    const cleanup = await inPageSnapshot(page);
    const networkResult = await network.stop();
    const mediaRequests = networkResult.requests.filter(({ url }) => MEDIA_REQUEST.test(url));
    const record = {
      afterTeardown,
      beforeCleanup,
      cleanup,
      condition,
      diagnostics,
      documentStatus: response?.status() ?? null,
      id: scenario.id,
      label: scenario.label,
      lifecycleEvents: persistentEvents,
      media: beforeCleanup.media,
      network: networkResult,
      mediaRequests,
      target: scenario.target,
      teardownTransition,
    };
    return { ...record, ...assessMediaNetworkDiagnostic(scenario, record) };
  } finally {
    await resetMediaNetworkCondition(context, session, scenario);
    await context.close();
  }
}

async function runCpuThrottleDiagnostic(browser, options, progress) {
  progress(`CPU throttle ${options.cpuRate}x`);
  const scenario = REPRESENTATIVE_SCENARIOS[0];
  const { context } = await createInstrumentedContext(browser, scenario);
  try {
    const sample = await runScenarioSample(context, scenario, "cold", 1, options, { cpuRate: options.cpuRate });
    return {
      requestedRate: options.cpuRate,
      sample,
      status: sample.cpuThrottle.status === "applied" ? "COMPLETE" : "UNSUPPORTED",
    };
  } finally {
    await context.close();
  }
}

function sectionError(id, error) {
  return { id, error: error instanceof Error ? error.message : String(error), status: "ERROR" };
}

export function reportFailures(report) {
  const failures = [];
  for (const sample of report.representative.samples) {
    if (sample.status !== "PASS") failures.push({ section: "representative", scenario: sample.scenario, cacheClass: sample.cacheClass, iteration: sample.iteration, status: sample.status, error: sample.error ?? null });
  }
  for (const [id, section] of Object.entries(report.lifecycleLoops)) {
    if (section.status === "ERROR") failures.push({ section: "lifecycle", id, error: section.error });
    else if (section.status === "UNBOUNDED") failures.push({ section: "lifecycle", id, error: section.boundedness?.conclusion ?? "unbounded lifecycle indicators" });
  }
  if (report.visibility.status === "FAIL" || report.visibility.status === "ERROR") failures.push({ section: "visibility", status: report.visibility.status, error: report.visibility.error ?? null });
  if (report.history.status !== "PASS") failures.push({ section: "history", status: report.history.status, error: report.history.error ?? null });
  if (report.cpuThrottle.status === "ERROR") failures.push({ section: "cpu-throttle", error: report.cpuThrottle.error });
  for (const diagnostic of report.mediaNetwork) {
    if (diagnostic.status !== "PASS") failures.push({
      section: "media-network",
      id: diagnostic.id,
      status: diagnostic.status,
      error: diagnostic.error ?? null,
      failures: diagnostic.failures ?? [],
    });
  }
  return failures;
}

export function validateReport(report) {
  invariant(report.schema === SCHEMA, "Phase 6 performance report schema differs");
  invariant(report.browser.viewport.width === 1440 && report.browser.viewport.height === 900, "Phase 6 performance viewport must be 1440x900");
  invariant(report.representative.scenarios.length === 10, "Phase 6 performance report must contain exactly ten representative scenarios");
  invariant(JSON.stringify(report.representative.scenarios.map(({ id }) => id)) === JSON.stringify(REPRESENTATIVE_SCENARIOS.map(({ id }) => id)), "representative scenario order or identity differs");
  invariant(report.representative.samples.length === REPRESENTATIVE_SCENARIOS.length * report.configuration.iterations * 2, "cold/warm representative sample matrix is incomplete");
  for (const scenario of REPRESENTATIVE_SCENARIOS) {
    for (const cacheClass of ["cold", "warm"]) {
      invariant(report.representative.samples.filter((sample) => sample.scenario === scenario.id && sample.cacheClass === cacheClass).length === report.configuration.iterations, `${scenario.id} ${cacheClass} samples are incomplete`);
    }
  }
  for (const id of ["homeSupport", "homeMaradin"]) {
    if (report.lifecycleLoops[id].status !== "ERROR") invariant(report.lifecycleLoops[id].cycles === report.configuration.cycles, `${id} lifecycle cycle count differs`);
  }
  invariant(report.mediaNetwork.length === MEDIA_NETWORK_SCENARIOS.length, "media network diagnostic matrix is incomplete");
  invariant(JSON.stringify(report.mediaNetwork.map(({ id }) => id)) === JSON.stringify(MEDIA_NETWORK_SCENARIOS.map(({ id }) => id)), "media network diagnostic identity/order differs");
  for (const diagnostic of report.mediaNetwork) {
    invariant(["PASS", "FAIL", "ERROR"].includes(diagnostic.status), `${diagnostic.id} media network status is invalid`);
    if (diagnostic.status !== "ERROR") invariant(Array.isArray(diagnostic.assertions) && Array.isArray(diagnostic.failures), `${diagnostic.id} media network assertions are missing`);
  }
  invariant(report.limitations.length >= 5, "performance attribution limitations are missing");
  return true;
}

async function ensureBaseUrl(baseUrl) {
  const response = await fetch(baseUrl, { redirect: "manual" });
  invariant(response.status >= 200 && response.status < 400, `Phase 6 base URL returned HTTP ${response.status}: ${baseUrl}`);
}

export async function runPerformanceLifecycle(options) {
  await ensureBaseUrl(options.baseUrl);
  const executablePath = await resolveChromium(options.browser);
  const browser = await chromium.launch({
    args: ["--disable-background-networking", "--disable-extensions"],
    executablePath,
    headless: !options.headed,
  });
  const progress = options.quiet ? () => undefined : (message) => process.stderr.write(`[phase6-performance] ${message}\n`);
  try {
    const representativeSamples = await runRepresentativeMatrix(browser, options, progress);
    let homeSupport;
    let homeMaradin;
    let visibility;
    let history;
    let cpuThrottle;
    try {
      homeSupport = await runLifecycleLoop(browser, options, { id: "home-support", targetLabel: "support", targetPath: "/for-partners/" }, progress);
    } catch (error) {
      homeSupport = sectionError("home-support", error);
    }
    try {
      homeMaradin = await runLifecycleLoop(browser, options, { id: "home-maradin", initiateVideo: true, targetLabel: "maradin-post-user-initiation", targetPath: "/pocs/maradin/" }, progress);
    } catch (error) {
      homeMaradin = sectionError("home-maradin", error);
    }
    try {
      visibility = await runVisibilityCheck(browser, options);
    } catch (error) {
      visibility = sectionError("visibility", error);
    }
    try {
      history = await runHistoryCheck(browser, options);
    } catch (error) {
      history = sectionError("history", error);
    }
    const mediaNetwork = [];
    for (const scenario of MEDIA_NETWORK_SCENARIOS) {
      try {
        mediaNetwork.push(await runMediaNetworkDiagnostic(browser, options, scenario, progress));
      } catch (error) {
        mediaNetwork.push(sectionError(scenario.id, error));
      }
    }
    try {
      cpuThrottle = await runCpuThrottleDiagnostic(browser, options, progress);
    } catch (error) {
      cpuThrottle = sectionError("cpu-throttle", error);
    }

    const report = {
      browser: {
        executablePath,
        headed: options.headed,
        name: "Chromium",
        version: browser.version(),
        viewport: VIEWPORT,
      },
      configuration: {
        baseUrl: options.baseUrl,
        briefDefaultsSatisfied: options.iterations >= 5 && options.cycles >= 10,
        cpuRate: options.cpuRate,
        cycles: options.cycles,
        iterations: options.iterations,
        settleMs: options.settleMs,
        timeoutMs: options.timeoutMs,
      },
      cpuThrottle,
      failures: [],
      generatedAt: new Date().toISOString(),
      history,
      lifecycleLoops: { homeMaradin, homeSupport },
      limitations: [...LIMITATIONS],
      mediaNetwork,
      representative: {
        samples: representativeSamples,
        scenarios: REPRESENTATIVE_SCENARIOS,
        summary: summarizeRepresentativeSamples(representativeSamples),
      },
      schema: SCHEMA,
      status: "PASS",
      visibility,
    };
    report.failures = reportFailures(report);
    report.status = report.failures.length ? "FAIL" : "PASS";
    validateReport(report);
    return report;
  } finally {
    await browser.close();
  }
}

export function runSelfTest() {
  const defaults = parseArguments(["--self-test"]);
  const plan = buildPlan(defaults);
  invariant(REPRESENTATIVE_SCENARIOS.length === 10, "representative scenario self-test differs");
  invariant(MEDIA_NETWORK_SCENARIOS.length === 8, "media network self-test differs");
  invariant(plan.representativeSamples === 100, "default cold/warm sample count differs");
  invariant(plan.lifecycleLoops.every(({ cycles }) => cycles === 10), "default lifecycle cycle count differs");
  invariant(plan.defaultsSatisfyBrief, "defaults no longer satisfy the Phase 6 brief");
  const statistics = summarizeDurations([1, 2, 3, 4, 100]);
  invariant(statistics.min === 1 && statistics.median === 3 && statistics.p95 === 80.8 && statistics.max === 100, "duration statistic self-test differs");
  assertExternalOutputPath(path.resolve(ROOT, "..", "phase-6-work", "phase6-performance-self-test.json"));
  return { plan, schema: SCHEMA, statistics, status: "PASS" };
}

function usage() {
  return [
    "Usage: node scripts/qa-phase6-performance-lifecycle.mjs --base-url <preview> --output <external-fresh.json> [--browser <path>] [--iterations 5] [--cycles 10] [--cpu-rate 4] [--settle-ms 350] [--timeout-ms 30000] [--headed] [--quiet]",
    "       node scripts/qa-phase6-performance-lifecycle.mjs --self-test",
    "       node scripts/qa-phase6-performance-lifecycle.mjs --dry-run [--iterations 5] [--cycles 10]",
    "",
    "The default run is intentionally diagnostic: Chromium 1440x900, five cold and five warm samples per representative scenario, two ten-cycle lifecycle loops, media network faults and a CDP CPU-throttle probe.",
  ].join("\n");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (options.selfTest) {
    process.stdout.write(`${JSON.stringify(runSelfTest(), null, 2)}\n`);
    return;
  }
  if (options.dryRun) {
    process.stdout.write(`${JSON.stringify(buildPlan(options), null, 2)}\n`);
    return;
  }
  await assertFreshExternalOutput(options.output);
  const report = await runPerformanceLifecycle(options);
  await writeFreshExternal(options.output, report);
  process.stdout.write(`${JSON.stringify({ failures: report.failures.length, output: options.output, status: report.status }, null, 2)}\n`);
  if (report.status !== "PASS") process.exitCode = 1;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main().catch((error) => {
  console.error(`Phase 6 performance/lifecycle QA failed: ${error.message}`);
  process.exitCode = 1;
});
