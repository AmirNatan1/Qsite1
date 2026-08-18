const params = new URLSearchParams(window.location.search);
const width = Number.parseInt(params.get("vw") ?? "", 10);
const height = Number.parseInt(params.get("vh") ?? "", 10);
const captureScale = Number.parseFloat(params.get("captureScale") ?? "");
const maximumRenderedWidth = 1200;
const allowedViewports = new Set([
  "1440x900",
  "1366x650",
  "1280x800",
  "1024x768",
  "768x1024",
  "390x844",
  "360x800",
  "320x800",
  "844x390",
]);

if (!allowedViewports.has(`${width}x${height}`)) {
  throw new Error(`Unsupported Phase 0.4 viewport: ${width}x${height}`);
}
const expectedCaptureScale = Math.min(1, maximumRenderedWidth / width);
if (!Number.isFinite(captureScale) || Math.abs(captureScale - expectedCaptureScale) > 0.000001) {
  throw new Error(`Unsupported captureScale ${params.get("captureScale")}; expected ${expectedCaptureScale}`);
}

const elements = {
  body: document.body,
  viewport: document.querySelector("#capture-viewport"),
  frame: document.querySelector("#qa-frame"),
  status: document.querySelector("#runner-status"),
  report: document.querySelector("#phase04-runner-report"),
};

elements.body.style.setProperty("--capture-width", `${width}px`);
elements.body.style.setProperty("--capture-height", `${height}px`);
elements.body.style.setProperty("--capture-scale", String(captureScale));
elements.body.dataset.captureStatus = params.get("status") === "1" ? "true" : "false";

const childUrl = new URL("./index.html", window.location.href);
for (const key of ["surface", "fixture", "zoom", "motion", "font", "chrome"]) {
  if (params.has(key)) childUrl.searchParams.set(key, params.get(key));
}
if (!childUrl.searchParams.has("chrome")) childUrl.searchParams.set("chrome", "0");

function loadFrame() {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Exact viewport iframe timed out")), 30_000);
    elements.frame.addEventListener("load", () => {
      window.clearTimeout(timeout);
      resolve();
    }, { once: true });
    elements.frame.src = childUrl.href;
  });
}

function twoFrames(target = window) {
  return new Promise((resolve) => target.requestAnimationFrame(() => target.requestAnimationFrame(resolve)));
}

async function run() {
  await loadFrame();
  const child = elements.frame.contentWindow;
  if (!child) throw new Error("Exact viewport iframe is unavailable");
  await child.phase04Ready;
  const report = await child.runPhase04TypographyCheck();
  const focusSelector = params.get("focusSelector");
  if (focusSelector) {
    const target = child.document.querySelector(focusSelector);
    if (!(target instanceof child.HTMLElement)) throw new Error(`Focus target not found: ${focusSelector}`);
    target.focus({ preventScroll: true });
    await twoFrames(child);
  }
  const active = child.document.activeElement;
  const focusedReviewControl = active instanceof child.HTMLElement && active.matches("#review-surface button") ? active : null;
  const focusState = {
    requested: Boolean(focusSelector),
    requestedSelector: focusSelector || null,
    activeReviewControlId: focusedReviewControl?.id || null,
    pass: focusSelector ? focusedReviewControl?.matches(focusSelector) === true : focusedReviewControl === null,
  };
  const iframeViewport = {
    width: child.innerWidth,
    height: child.innerHeight,
    devicePixelRatio: child.devicePixelRatio,
  };
  await twoFrames();
  const rect = elements.viewport.getBoundingClientRect();
  const captureRenderedBounds = {
    left: Number(rect.left.toFixed(3)),
    top: Number(rect.top.toFixed(3)),
    x: Number(rect.left.toFixed(3)),
    y: Number(rect.top.toFixed(3)),
    width: Number(rect.width.toFixed(3)),
    height: Number(rect.height.toFixed(3)),
    rasterX: Math.round(rect.left),
    rasterY: Math.round(rect.top),
    rasterWidth: Math.round(rect.width),
    rasterHeight: Math.round(rect.height),
  };
  const captureBoundsMatch =
    Math.abs(rect.left) <= 0.01 &&
    Math.abs(rect.top) <= 0.01 &&
    Math.abs(rect.width - width * captureScale) <= 0.01 &&
    Math.abs(rect.height - height * captureScale) <= 0.01;
  const runnerReport = {
    schema: "quantum-hub.phase-0-4-crt-television.exact-viewport-runner-report.v1",
    requestedViewport: { width, height, unit: "CSS pixel" },
    iframeViewport,
    viewportMatch: iframeViewport.width === width && iframeViewport.height === height,
    devicePixelRatioPolicy: "record actual browser DPR; do not claim control",
    captureScale,
    captureScalePolicy: "evidence-only outer transform; iframe layout remains at the exact requested CSS viewport",
    maximumRenderedWidth,
    captureRenderedBounds,
    captureBoundsMatch,
    focusSelector: focusSelector || null,
    focusState,
    report,
  };
  runnerReport.pass =
    runnerReport.viewportMatch &&
    runnerReport.captureBoundsMatch &&
    runnerReport.focusState.pass &&
    report.pass === true;
  window.phase04RunnerReport = runnerReport;
  elements.report.textContent = JSON.stringify(runnerReport);
  elements.body.dataset.ready = "true";
  elements.body.dataset.pass = String(runnerReport.pass);
  elements.status.textContent = runnerReport.pass
    ? `PASS · exact ${width}×${height} CSS px · DPR ${iframeViewport.devicePixelRatio}`
    : `REVIEW · exact viewport or child gate failed · DPR ${iframeViewport.devicePixelRatio}`;
  window.parent.postMessage({ type: "phase04-runner-report", report: runnerReport }, window.location.origin);
  return runnerReport;
}

const readiness = run().catch((error) => {
  elements.body.dataset.ready = "error";
  elements.body.dataset.pass = "false";
  elements.status.textContent = error.message;
  throw error;
});

window.phase04RunnerReady = readiness;

