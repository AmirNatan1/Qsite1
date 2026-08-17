const MEDIA_ROOT = "/artifacts/original/phase-0-3d-repair/media/";
const SEEK_ORDER = Object.freeze([0, 0.25, 0.5, 0.75, 0.99, 0.5, 0.1]);
const FRAME_TOLERANCE_SECONDS = 0.055;
const STEP_TIMEOUT_MS = 20_000;

const VARIANTS = Object.freeze([
  {
    id: "vp9-g1",
    label: "VP9 WebM · key interval 1",
    codec: "VP9",
    container: "WebM",
    keyframeInterval: 1,
    mime: 'video/webm; codecs="vp9"',
    filename: "field-unit-animatic-vp9-g1.webm",
  },
  {
    id: "vp9-g6",
    label: "VP9 WebM · key interval 6",
    codec: "VP9",
    container: "WebM",
    keyframeInterval: 6,
    mime: 'video/webm; codecs="vp9"',
    filename: "field-unit-animatic-vp9-g6.webm",
  },
  {
    id: "vp9-g12",
    label: "VP9 WebM · key interval 12",
    codec: "VP9",
    container: "WebM",
    keyframeInterval: 12,
    mime: 'video/webm; codecs="vp9"',
    filename: "field-unit-animatic-vp9-g12.webm",
  },
  {
    id: "h264-g1",
    label: "H.264 MP4 · key interval 1",
    codec: "H.264",
    container: "MP4",
    keyframeInterval: 1,
    mime: "video/mp4",
    filename: "field-unit-animatic-h264-g1.mp4",
  },
  {
    id: "h264-g6",
    label: "H.264 MP4 · key interval 6",
    codec: "H.264",
    container: "MP4",
    keyframeInterval: 6,
    mime: "video/mp4",
    filename: "field-unit-animatic-h264-g6.mp4",
  },
  {
    id: "h264-g12",
    label: "H.264 MP4 · key interval 12",
    codec: "H.264",
    container: "MP4",
    keyframeInterval: 12,
    mime: "video/mp4",
    filename: "field-unit-animatic-h264-g12.mp4",
  },
].map((variant) => Object.freeze({ ...variant, url: `${MEDIA_ROOT}${variant.filename}` })));

const elements = {
  form: document.querySelector("#seek-controls"),
  select: document.querySelector("#variant"),
  runSelected: document.querySelector("#run-selected"),
  runAll: document.querySelector("#run-all"),
  cancel: document.querySelector("#cancel-run"),
  media: document.querySelector("#media"),
  supportStatus: document.querySelector("#support-status"),
  runStatus: document.querySelector("#run-status"),
  resultBody: document.querySelector("#variant-results"),
  report: document.querySelector("#json-report"),
  download: document.querySelector("#download-report"),
  factFile: document.querySelector("#fact-file"),
  factDuration: document.querySelector("#fact-duration"),
  factDimensions: document.querySelector("#fact-dimensions"),
};

const report = {
  schemaVersion: 1,
  harness: "phase-0-3d-media-spike",
  scope: "original Blender Field Unit animatic; non-production Phase 0 evidence",
  generatedAt: null,
  measurementState: "idle",
  seekOrderFractions: [...SEEK_ORDER],
  matchingFrameToleranceSeconds: FRAME_TOLERANCE_SECONDS,
  environment: {
    href: window.location.href,
    userAgent: navigator.userAgent,
    platform: navigator.userAgent.includes("Windows")
      ? "Windows"
      : navigator.userAgent.includes("Macintosh")
        ? "macOS"
        : navigator.userAgent.includes("Linux")
          ? "Linux"
          : null,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemoryGiB: navigator.deviceMemory ?? null,
    requestVideoFrameCallback: typeof HTMLVideoElement.prototype.requestVideoFrameCallback === "function",
    getVideoPlaybackQuality: typeof HTMLVideoElement.prototype.getVideoPlaybackQuality === "function",
  },
  variants: [],
};

window.phase0SeekReport = report;

let activeController = null;

function rounded(value, digits = 3) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function abortError() {
  return new DOMException("Measurement cancelled", "AbortError");
}

function describeMediaError(video) {
  if (!video.error) return "The browser could not load the media.";
  const labels = {
    1: "Media loading was aborted.",
    2: "A network error interrupted media loading.",
    3: "The browser could not decode this media.",
    4: "The media source or codec is unsupported.",
  };
  return labels[video.error.code] ?? `Media error code ${video.error.code}.`;
}

function errorRecord(error) {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
  };
}

function qualitySnapshot(video) {
  if (typeof video.getVideoPlaybackQuality !== "function") return { supported: false };
  const quality = video.getVideoPlaybackQuality();
  return {
    supported: true,
    creationTime: rounded(quality.creationTime),
    totalVideoFrames: quality.totalVideoFrames,
    droppedVideoFrames: quality.droppedVideoFrames,
    corruptedVideoFrames: quality.corruptedVideoFrames,
  };
}

function qualityDifference(start, end, field) {
  if (!start.supported || !end.supported) return null;
  return end[field] - start[field];
}

function percentile(values, proportion) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * proportion) - 1);
  return sorted[index];
}

function updateReport() {
  report.generatedAt = new Date().toISOString();
  window.phase0SeekReport = report;
  elements.report.textContent = JSON.stringify(report, null, 2);
  updateResultRows();
}

function resultFor(id) {
  return report.variants.find((variant) => variant.id === id);
}

function replaceResult(next) {
  const existingIndex = report.variants.findIndex((variant) => variant.id === next.id);
  if (existingIndex === -1) report.variants.push(next);
  else report.variants.splice(existingIndex, 1, next);
  updateReport();
}

function formatMilliseconds(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} ms` : "—";
}

function updateResultRows() {
  elements.resultBody.replaceChildren();
  for (const variant of VARIANTS) {
    const result = resultFor(variant.id);
    const completions = result?.seeks?.map((seek) => seek.completeMs).filter(Number.isFinite) ?? [];
    const errors = result?.seeks?.map((seek) => seek.absoluteFrameErrorSeconds).filter(Number.isFinite) ?? [];
    const dropped = result?.quality
      ? qualityDifference(result.quality.before, result.quality.after, "droppedVideoFrames")
      : null;
    const cells = [
      variant.filename,
      variant.codec,
      String(variant.keyframeInterval),
      result?.status ?? "not run",
      formatMilliseconds(percentile(completions, 0.5)),
      formatMilliseconds(percentile(completions, 0.95)),
      errors.length ? `${Math.max(...errors).toFixed(4)} s` : "—",
      dropped ?? "—",
    ];
    const row = document.createElement("tr");
    for (const [index, value] of cells.entries()) {
      const cell = document.createElement("td");
      cell.textContent = String(value);
      if (index === 3 && result) cell.dataset.status = result.status === "passed" ? "pass" : "fail";
      row.append(cell);
    }
    elements.resultBody.append(row);
  }
}

function setStatus(message, state = "idle") {
  elements.runStatus.textContent = message;
  elements.runStatus.dataset.state = state;
}

function setBusy(busy) {
  elements.select.disabled = busy;
  elements.runSelected.disabled = busy || !report.environment.requestVideoFrameCallback;
  elements.runAll.disabled = busy || !report.environment.requestVideoFrameCallback;
  elements.cancel.disabled = !busy;
}

function updateMediaFacts(variant) {
  elements.factFile.textContent = variant?.filename ?? "Not loaded";
  elements.factDuration.textContent = Number.isFinite(elements.media.duration)
    ? `${elements.media.duration.toFixed(3)} s`
    : "—";
  elements.factDimensions.textContent = elements.media.videoWidth
    ? `${elements.media.videoWidth} × ${elements.media.videoHeight}`
    : "—";
}

function setPreviewVariant(variant) {
  elements.media.pause();
  elements.media.src = variant.url;
  elements.media.load();
  updateMediaFacts(variant);
}

function waitForMediaEvent(video, eventName, signal, timeoutMs = STEP_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }

    const timeout = window.setTimeout(() => finish(new Error(`Timed out waiting for ${eventName}.`)), timeoutMs);
    const onEvent = (event) => finish(null, event);
    const onError = () => finish(new Error(describeMediaError(video)));
    const onAbort = () => finish(abortError());

    function finish(error, value) {
      window.clearTimeout(timeout);
      video.removeEventListener(eventName, onEvent);
      video.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(value);
    }

    video.addEventListener(eventName, onEvent, { once: true });
    video.addEventListener("error", onError, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function inspectHttp(variant, signal) {
  const response = await fetch(variant.url, { method: "HEAD", cache: "no-store", signal });
  if (!response.ok) throw new Error(`${variant.filename} returned HTTP ${response.status}.`);
  return {
    status: response.status,
    contentLength: Number.parseInt(response.headers.get("content-length") ?? "", 10) || null,
    contentType: response.headers.get("content-type"),
    acceptRanges: response.headers.get("accept-ranges"),
  };
}

async function loadVariant(variant, signal) {
  elements.media.pause();
  elements.media.removeAttribute("src");
  elements.media.load();

  const metadataReady = waitForMediaEvent(elements.media, "loadedmetadata", signal);
  elements.media.src = variant.url;
  elements.media.load();
  await metadataReady;
  if (!Number.isFinite(elements.media.duration) || elements.media.duration <= 0) {
    throw new Error("The media duration is missing or invalid.");
  }
  if (elements.media.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await waitForMediaEvent(elements.media, "loadeddata", signal);
  }
  elements.media.pause();
  updateMediaFacts(variant);
}

function seekWithoutFrameMeasurement(video, targetSeconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }

    const timeout = window.setTimeout(() => finish(new Error("Timed out while priming the decoder.")), STEP_TIMEOUT_MS);
    const onSeeked = () => finish();
    const onError = () => finish(new Error(describeMediaError(video)));
    const onAbort = () => finish(abortError());

    function finish(error) {
      window.clearTimeout(timeout);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve();
    }

    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      video.currentTime = targetSeconds;
    } catch (error) {
      finish(error);
    }
  });
}

function measureSeek(video, targetSeconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }

    const startedAt = performance.now();
    let seekedAt = null;
    let currentTimeAtSeeked = null;
    let matchingFrame = null;
    let frameHandle = null;
    let observedCallbacks = 0;
    let settled = false;

    const timeout = window.setTimeout(
      () => finish(new Error(`Timed out seeking to ${targetSeconds.toFixed(3)} seconds.`)),
      STEP_TIMEOUT_MS,
    );

    function cleanUp() {
      window.clearTimeout(timeout);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
      if (frameHandle !== null && typeof video.cancelVideoFrameCallback === "function") {
        video.cancelVideoFrameCallback(frameHandle);
      }
    }

    function finish(error) {
      if (settled) return;
      settled = true;
      cleanUp();
      if (error) {
        reject(error);
        return;
      }
      const completedAt = Math.max(seekedAt, matchingFrame.callbackTime);
      resolve({
        seekedMs: rounded(seekedAt - startedAt),
        framePresentedMs: rounded(Math.max(0, matchingFrame.callbackTime - startedAt)),
        completeMs: rounded(completedAt - startedAt),
        frameDeltaFromSeekedMs: rounded(matchingFrame.callbackTime - seekedAt),
        currentTimeAtSeeked: rounded(currentTimeAtSeeked, 6),
        currentTimeAtCompletion: rounded(video.currentTime, 6),
        observedFrameCallbacks: observedCallbacks,
        frame: matchingFrame.metadata,
      });
    }

    function maybeFinish() {
      if (seekedAt !== null && matchingFrame !== null) finish();
    }

    function requestFrame() {
      frameHandle = video.requestVideoFrameCallback(onFrame);
    }

    function onFrame(callbackTime, metadata) {
      if (settled) return;
      observedCallbacks += 1;
      const absoluteErrorSeconds = Math.abs(metadata.mediaTime - targetSeconds);
      if (absoluteErrorSeconds <= FRAME_TOLERANCE_SECONDS) {
        matchingFrame = {
          callbackTime,
          metadata: {
            mediaTime: rounded(metadata.mediaTime, 6),
            absoluteErrorSeconds: rounded(absoluteErrorSeconds, 6),
            presentedFrames: metadata.presentedFrames,
            expectedDisplayTime: rounded(metadata.expectedDisplayTime),
            processingDuration: rounded(metadata.processingDuration, 6),
            width: metadata.width,
            height: metadata.height,
          },
        };
        maybeFinish();
        return;
      }
      requestFrame();
    }

    function onSeeked() {
      seekedAt = performance.now();
      currentTimeAtSeeked = video.currentTime;
      maybeFinish();
    }

    function onError() {
      finish(new Error(describeMediaError(video)));
    }

    function onAbort() {
      finish(abortError());
    }

    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
    requestFrame();
    try {
      video.currentTime = targetSeconds;
    } catch (error) {
      finish(error);
    }
  });
}

async function runVariant(variant, signal) {
  const startedAt = performance.now();
  const result = {
    id: variant.id,
    filename: variant.filename,
    url: variant.url,
    codec: variant.codec,
    container: variant.container,
    keyframeIntervalFrames: variant.keyframeInterval,
    canPlayType: elements.media.canPlayType(variant.mime) || "",
    status: "running",
    http: null,
    media: null,
    primingSeekSeconds: null,
    quality: null,
    seeks: [],
    totalRunMs: null,
    error: null,
  };
  replaceResult(result);
  setStatus(`Loading ${variant.label}…`, "running");

  try {
    result.http = await inspectHttp(variant, signal);
    await loadVariant(variant, signal);
    result.media = {
      durationSeconds: rounded(elements.media.duration, 6),
      width: elements.media.videoWidth,
      height: elements.media.videoHeight,
      readyState: elements.media.readyState,
    };

    const primeTarget = Math.min(0.2, elements.media.duration * 0.05);
    if (primeTarget > 0.005) {
      await seekWithoutFrameMeasurement(elements.media, primeTarget, signal);
      result.primingSeekSeconds = rounded(primeTarget, 6);
    }

    const qualityBefore = qualitySnapshot(elements.media);
    for (const [index, fraction] of SEEK_ORDER.entries()) {
      if (signal.aborted) throw abortError();
      const targetSeconds = Math.min(elements.media.duration * fraction, Math.max(0, elements.media.duration - 0.001));
      const previousFraction = index > 0 ? SEEK_ORDER[index - 1] : null;
      const direction = previousFraction === null ? "initial" : fraction >= previousFraction ? "forward" : "reverse";
      const stepQualityBefore = qualitySnapshot(elements.media);
      setStatus(
        `${variant.label}: seek ${index + 1}/${SEEK_ORDER.length} to ${(fraction * 100).toFixed(0)}% (${direction}).`,
        "running",
      );
      const measurement = await measureSeek(elements.media, targetSeconds, signal);
      const stepQualityAfter = qualitySnapshot(elements.media);
      result.seeks.push({
        index,
        fraction,
        direction,
        targetSeconds: rounded(targetSeconds, 6),
        ...measurement,
        absoluteFrameErrorSeconds: measurement.frame.absoluteErrorSeconds,
        playbackQualityBefore: stepQualityBefore,
        playbackQualityAfter: stepQualityAfter,
      });
      replaceResult(result);
    }

    const qualityAfter = qualitySnapshot(elements.media);
    result.quality = {
      before: qualityBefore,
      after: qualityAfter,
      totalFramesDelta: qualityDifference(qualityBefore, qualityAfter, "totalVideoFrames"),
      droppedFramesDelta: qualityDifference(qualityBefore, qualityAfter, "droppedVideoFrames"),
      corruptedFramesDelta: qualityDifference(qualityBefore, qualityAfter, "corruptedVideoFrames"),
    };
    result.status = "passed";
    result.totalRunMs = rounded(performance.now() - startedAt);
    replaceResult(result);
    setStatus(`${variant.label} completed all seven seeks.`, "pass");
  } catch (error) {
    result.status = error instanceof DOMException && error.name === "AbortError" ? "cancelled" : "failed";
    result.totalRunMs = rounded(performance.now() - startedAt);
    result.error = errorRecord(error);
    replaceResult(result);
    if (result.status === "cancelled") throw error;
    setStatus(`${variant.label} failed: ${result.error.message}`, "fail");
  }

  return result;
}

async function runVariants(variants) {
  if (activeController) return;
  activeController = new AbortController();
  setBusy(true);
  report.measurementState = "running";
  updateReport();

  try {
    for (const variant of variants) await runVariant(variant, activeController.signal);
    const failures = variants.filter((variant) => resultFor(variant.id)?.status !== "passed").length;
    report.measurementState = failures ? "completed-with-errors" : "completed";
    setStatus(
      failures ? `Run completed with ${failures} failed variant${failures === 1 ? "" : "s"}.` : "Run completed.",
      failures ? "fail" : "pass",
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      report.measurementState = "cancelled";
      setStatus("Run cancelled. Completed measurements remain in the report.", "fail");
    } else {
      report.measurementState = "failed";
      setStatus(error instanceof Error ? error.message : String(error), "fail");
    }
  } finally {
    activeController = null;
    setBusy(false);
    updateReport();
  }
}

for (const variant of VARIANTS) {
  const option = document.createElement("option");
  option.value = variant.id;
  option.textContent = variant.label;
  elements.select.append(option);
}

const frameCallbackSupported = report.environment.requestVideoFrameCallback;
elements.supportStatus.textContent = frameCallbackSupported
  ? "requestVideoFrameCallback available · frame-present measurement enabled"
  : "requestVideoFrameCallback unavailable · automated runs disabled";
setBusy(false);
updateReport();

elements.media.addEventListener("loadedmetadata", () => {
  updateMediaFacts(VARIANTS.find((variant) => variant.id === elements.select.value));
});

setPreviewVariant(VARIANTS[0]);

elements.select.addEventListener("change", () => {
  const variant = VARIANTS.find((candidate) => candidate.id === elements.select.value);
  if (variant) setPreviewVariant(variant);
});

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const variant = VARIANTS.find((candidate) => candidate.id === elements.select.value);
  if (variant) void runVariants([variant]);
});

elements.runAll.addEventListener("click", () => void runVariants(VARIANTS));
elements.cancel.addEventListener("click", () => activeController?.abort());

elements.download.addEventListener("click", () => {
  updateReport();
  const blob = new Blob([`${JSON.stringify(report, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `phase-0-3d-media-seek-${new Date().toISOString().replaceAll(":", "-")}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
});
