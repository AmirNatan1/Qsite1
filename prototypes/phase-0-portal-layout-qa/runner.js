const params = new URLSearchParams(window.location.search);
const width = Number.parseInt(params.get("vw") ?? "", 10);
const height = Number.parseInt(params.get("vh") ?? "", 10);
const captureScale = Number.parseFloat(params.get("captureScale") ?? "");
const maximumRenderedWidth = 1200;
const allowedWidths = new Set([1440, 1366, 1280, 1024, 768, 844, 390, 360, 320]);
const allowedHeights = new Set([1024, 900, 844, 800, 768, 650, 390]);

if (!allowedWidths.has(width) || !allowedHeights.has(height)) {
  throw new Error(`Unsupported Phase 0.2 viewport: ${width}x${height}`);
}
const expectedCaptureScale = Math.min(1, maximumRenderedWidth / width);
if (!Number.isFinite(captureScale) || Math.abs(captureScale - expectedCaptureScale) > 0.000001) {
  throw new Error(
    `Unsupported Phase 0.2 captureScale ${params.get("captureScale")}; expected ${expectedCaptureScale} for ${width}px`,
  );
}

const elements = {
  body: document.body,
  viewport: document.querySelector("#capture-viewport"),
  frame: document.querySelector("#qa-frame"),
  status: document.querySelector("#runner-status"),
  reportNode: document.querySelector("#phase02-runner-report"),
};

elements.body.style.setProperty("--capture-width", `${width}px`);
elements.body.style.setProperty("--capture-height", `${height}px`);
elements.body.style.setProperty("--capture-scale", String(captureScale));
elements.body.dataset.captureStatus = params.get("status") === "1" ? "true" : "false";

const childUrl = new URL("./index.html", window.location.href);
for (const key of ["surface", "fixture", "zoom", "motion", "chrome"]) {
  if (params.has(key)) childUrl.searchParams.set(key, params.get(key));
}
if (!childUrl.searchParams.has("chrome")) childUrl.searchParams.set("chrome", "0");

function waitForFrameLoad() {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Exact viewport iframe timed out")), 30_000);
    elements.frame.addEventListener(
      "load",
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
    elements.frame.src = childUrl.href;
  });
}

function waitForPaintBarrier() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
  });
}

async function run() {
  await waitForFrameLoad();
  const child = elements.frame.contentWindow;
  if (!child) throw new Error("Exact viewport iframe is unavailable");
  await child.phase02Ready;
  const report = await child.runPhase02TypographyCheck();
  const focusSelector = params.get("focusSelector");
  if (focusSelector) {
    const focusTarget = child.document.querySelector(focusSelector);
    if (!(focusTarget instanceof child.HTMLElement)) throw new Error(`Focus target not found: ${focusSelector}`);
    focusTarget.focus({ preventScroll: true });
    await new Promise((resolve) => child.requestAnimationFrame(() => child.requestAnimationFrame(resolve)));
  }

  const iframeViewport = {
    width: child.innerWidth,
    height: child.innerHeight,
    devicePixelRatio: child.devicePixelRatio,
  };
  const renderedRect = elements.viewport.getBoundingClientRect();
  const captureRenderedBounds = {
    left: Number(renderedRect.left.toFixed(3)),
    top: Number(renderedRect.top.toFixed(3)),
    width: Number(renderedRect.width.toFixed(3)),
    height: Number(renderedRect.height.toFixed(3)),
    rasterWidth: Math.round(renderedRect.width),
    rasterHeight: Math.round(renderedRect.height),
  };
  const captureBoundsMatch =
    Math.abs(renderedRect.left) <= 0.01 &&
    Math.abs(renderedRect.top) <= 0.01 &&
    Math.abs(renderedRect.width - width * captureScale) <= 0.01 &&
    Math.abs(renderedRect.height - height * captureScale) <= 0.01;
  await waitForPaintBarrier();
  const runnerReport = {
    schema: "quantum-hub.phase-0-3d-repair-v2.exact-viewport-runner-report.v1",
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
    report,
  };
  runnerReport.pass = runnerReport.viewportMatch && runnerReport.captureBoundsMatch && report.pass === true;
  window.phase02RunnerReport = runnerReport;
  elements.reportNode.textContent = JSON.stringify(runnerReport);
  elements.body.dataset.ready = "true";
  elements.body.dataset.pass = String(runnerReport.pass);
  elements.status.textContent = runnerReport.pass
    ? `PASS · exact ${width}x${height} CSS px · DPR ${iframeViewport.devicePixelRatio}`
    : `REVIEW · iframe ${iframeViewport.width}x${iframeViewport.height} · DPR ${iframeViewport.devicePixelRatio}`;
  window.parent.postMessage({ type: "phase02-runner-report", report: runnerReport }, window.location.origin);
  return runnerReport;
}

window.phase02RunnerReady = run().catch((error) => {
  elements.body.dataset.ready = "error";
  elements.status.textContent = error.message;
  throw error;
});
