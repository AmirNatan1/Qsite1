const LAB_CANARY = "QH_PHASE3_MEDIA_LAB_ONLY";
const REPORT_SCHEMA = "quantum-hub.phase-3-crt-media-lab.v1";
const SEEK_TIMEOUT_MS = 15_000;
const FINAL_FRAME_SAFETY_FACTOR = 1.05;
const FORWARD_REVERSE_SEQUENCE = Object.freeze([0, 0.2, 0.4, 0.6, 0.8, 1, 0.8, 0.6, 0.4, 0.2, 0]);
const RAPID_ALTERNATING_SEQUENCE = Object.freeze([0.08, 0.92, 0.12, 0.88, 0.16, 0.84, 0.2, 0.8, 0.24, 0.76]);

const elements = {
  sourceForm: document.querySelector("#media-source"),
  file: document.querySelector("#media-file"),
  sourceUrl: document.querySelector("#source-url"),
  frameRate: document.querySelector("#frame-rate"),
  clear: document.querySelector("#clear-source"),
  media: document.querySelector("#media"),
  timeline: document.querySelector("#timeline"),
  capabilityStatus: document.querySelector("#capability-status"),
  runStatus: document.querySelector("#run-status"),
  sourceName: document.querySelector("#source-name"),
  progress: document.querySelector("#progress-display"),
  time: document.querySelector("#time-display"),
  frame: document.querySelector("#frame-display"),
  dimensions: document.querySelector("#dimension-display"),
  ready: document.querySelector("#ready-display"),
  actions: [...document.querySelectorAll("[data-exercise]")],
  cancel: document.querySelector("#cancel-run"),
  results: document.querySelector("#result-rows"),
  resetVisibility: document.querySelector("#reset-visibility"),
  visibilityState: document.querySelector("#visibility-state"),
  visibilityCount: document.querySelector("#visibility-count"),
  hiddenDuration: document.querySelector("#hidden-duration"),
  hiddenMediaAdvance: document.querySelector("#hidden-media-advance"),
  export: document.querySelector("#export-report"),
  report: document.querySelector("#report-preview"),
};

const readyStateLabels = Object.freeze([
  "HAVE_NOTHING",
  "HAVE_METADATA",
  "HAVE_CURRENT_DATA",
  "HAVE_FUTURE_DATA",
  "HAVE_ENOUGH_DATA",
]);

let objectUrl = null;
let activeController = null;
let positionAnimationFrame = null;
let hiddenSession = null;

const report = {
  schema: REPORT_SCHEMA,
  canary: LAB_CANARY,
  generatedAt: new Date().toISOString(),
  scope: "isolated Phase 3 browser media QA; no production runtime integration",
  environment: {
    href: window.location.href,
    userAgent: navigator.userAgent,
    language: navigator.language,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemoryGiB: navigator.deviceMemory ?? null,
    requestVideoFrameCallback: typeof HTMLVideoElement.prototype.requestVideoFrameCallback === "function",
    playbackQuality: typeof HTMLVideoElement.prototype.getVideoPlaybackQuality === "function",
    visibilityApi: typeof document.visibilityState === "string",
  },
  source: null,
  runs: [],
  visibility: createVisibilityRecord(),
};

window.phase3MediaLabReport = report;

function createVisibilityRecord() {
  return {
    currentState: document.visibilityState,
    transitions: 0,
    completedHiddenSessions: 0,
    totalHiddenMs: 0,
    events: [
      {
        type: "initial",
        at: new Date().toISOString(),
        state: document.visibilityState,
        mediaTimeSeconds: 0,
        playing: false,
      },
    ],
  };
}

function rounded(value, digits = 3) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function frameRate() {
  const value = Number.parseFloat(elements.frameRate.value);
  return Number.isFinite(value) && value > 0 ? value : 24;
}

function hasMedia() {
  return Number.isFinite(elements.media.duration) && elements.media.duration > 0;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function frameDuration() {
  return 1 / frameRate();
}

function finalFrameTime() {
  if (!hasMedia()) return 0;
  return Math.max(0, elements.media.duration - frameDuration() * FINAL_FRAME_SAFETY_FACTOR);
}

function targetForFraction(fraction) {
  const normalized = clamp(fraction, 0, 1);
  return normalized >= 1 ? finalFrameTime() : elements.media.duration * normalized;
}

function formatClock(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainder.toFixed(3).padStart(6, "0")}`;
}

function formatMilliseconds(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} ms` : "—";
}

function percentile(values, proportion) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * proportion) - 1)];
}

function qualitySnapshot() {
  if (typeof elements.media.getVideoPlaybackQuality !== "function") return { supported: false };
  const quality = elements.media.getVideoPlaybackQuality();
  return {
    supported: true,
    totalVideoFrames: quality.totalVideoFrames,
    droppedVideoFrames: quality.droppedVideoFrames,
    corruptedVideoFrames: quality.corruptedVideoFrames,
  };
}

function qualityDelta(before, after, key) {
  return before.supported && after.supported ? after[key] - before[key] : null;
}

function errorRecord(error) {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
  };
}

function abortError() {
  return new DOMException("Exercise cancelled", "AbortError");
}

function mediaErrorMessage() {
  const messages = {
    1: "Media loading was aborted.",
    2: "A network error interrupted media loading.",
    3: "The browser could not decode this media.",
    4: "The media source or codec is unsupported.",
  };
  return messages[elements.media.error?.code] ?? "The media could not be loaded.";
}

function setStatus(message, state = "idle") {
  elements.runStatus.textContent = message;
  elements.runStatus.dataset.state = state;
}

function setBusy(busy) {
  for (const action of elements.actions) action.disabled = busy || !hasMedia();
  elements.cancel.disabled = !busy;
  elements.file.disabled = busy;
  elements.sourceUrl.disabled = busy;
  elements.clear.disabled = busy;
  elements.timeline.disabled = busy || !hasMedia();
}

function updatePosition() {
  const duration = hasMedia() ? elements.media.duration : null;
  const current = duration === null ? 0 : clamp(elements.media.currentTime, 0, duration);
  const normalized = duration === null ? 0 : clamp(current / duration, 0, 1);
  const fps = frameRate();
  const frameCount = duration === null ? null : Math.max(1, Math.ceil(duration * fps));
  const frameIndex = frameCount === null ? 0 : Math.min(frameCount - 1, Math.max(0, Math.floor(current * fps + 1e-7)));

  if (document.activeElement !== elements.timeline) elements.timeline.value = normalized.toFixed(4);
  elements.timeline.setAttribute("aria-valuetext", `${(normalized * 100).toFixed(2)} percent`);
  elements.progress.value = `${normalized.toFixed(4)} · ${(normalized * 100).toFixed(2)}%`;
  elements.time.value = `${formatClock(current)} / ${formatClock(duration)}`;
  elements.frame.value = `${frameIndex.toLocaleString()} / ${frameCount?.toLocaleString() ?? "—"} @ ${rounded(fps, 3)} fps`;
  elements.dimensions.textContent = elements.media.videoWidth
    ? `${elements.media.videoWidth} × ${elements.media.videoHeight}`
    : "—";
  elements.ready.textContent = readyStateLabels[elements.media.readyState] ?? `State ${elements.media.readyState}`;
}

function startPositionLoop() {
  if (positionAnimationFrame !== null) return;
  const tick = () => {
    updatePosition();
    if (elements.media.paused || elements.media.ended) {
      positionAnimationFrame = null;
      return;
    }
    positionAnimationFrame = requestAnimationFrame(tick);
  };
  positionAnimationFrame = requestAnimationFrame(tick);
}

function stopPositionLoop() {
  if (positionAnimationFrame !== null) cancelAnimationFrame(positionAnimationFrame);
  positionAnimationFrame = null;
}

function refreshReport() {
  report.generatedAt = new Date().toISOString();
  report.visibility.currentState = document.visibilityState;
  window.phase3MediaLabReport = report;
  elements.report.textContent = JSON.stringify(report, null, 2);
  renderResults();
  renderVisibility();
}

function renderResults() {
  elements.results.replaceChildren();
  if (!report.runs.length) {
    const row = document.createElement("tr");
    row.className = "empty-row";
    const cell = document.createElement("td");
    cell.colSpan = 7;
    cell.textContent = "No exercises have run.";
    row.append(cell);
    elements.results.append(row);
    return;
  }

  for (const run of report.runs) {
    const row = document.createElement("tr");
    const values = [
      run.label,
      run.status,
      String(run.measurements.length),
      formatMilliseconds(run.summary?.medianCompleteMs),
      formatMilliseconds(run.summary?.p95CompleteMs),
      formatMilliseconds(run.summary?.maxCompleteMs),
      run.summary?.droppedFramesDelta ?? "—",
    ];
    for (const [index, value] of values.entries()) {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (index === 1) cell.dataset.status = run.status;
      row.append(cell);
    }
    elements.results.append(row);
  }
}

function renderVisibility() {
  const visibility = report.visibility;
  elements.visibilityState.textContent = document.visibilityState;
  elements.visibilityCount.textContent = String(visibility.transitions);
  elements.hiddenDuration.textContent = formatMilliseconds(visibility.totalHiddenMs);
  const lastSession = [...visibility.events].reverse().find((event) => event.type === "visible" && event.mediaAdvanceSeconds !== null);
  elements.hiddenMediaAdvance.textContent = lastSession
    ? `${lastSession.mediaAdvanceSeconds.toFixed(3)} s · ${lastSession.playingAfter ? "playing" : "paused"}`
    : "—";
}

function sourceDescriptor(kind, name, url, file = null) {
  return {
    kind,
    name,
    url: kind === "local-file" ? null : url,
    file: file
      ? {
          bytes: file.size,
          mimeType: file.type || null,
          lastModified: new Date(file.lastModified).toISOString(),
        }
      : null,
    configuredFrameRate: frameRate(),
    durationSeconds: null,
    dimensions: null,
  };
}

function releaseObjectUrl() {
  if (!objectUrl) return;
  URL.revokeObjectURL(objectUrl);
  objectUrl = null;
}

function loadSource({ kind, name, url, file = null }) {
  activeController?.abort();
  stopPositionLoop();
  elements.media.pause();
  elements.media.removeAttribute("src");
  elements.media.load();
  releaseObjectUrl();

  if (kind === "local-file") {
    objectUrl = URL.createObjectURL(file);
    url = objectUrl;
  }

  report.source = sourceDescriptor(kind, name, url, file);
  report.runs = [];
  elements.sourceName.textContent = name;
  elements.media.src = url;
  elements.media.load();
  setBusy(false);
  updatePosition();
  setStatus(`Loading ${name}…`, "running");
  refreshReport();
}

function clearSource() {
  activeController?.abort();
  stopPositionLoop();
  elements.media.pause();
  elements.media.removeAttribute("src");
  elements.media.load();
  releaseObjectUrl();
  elements.file.value = "";
  elements.sourceUrl.value = "";
  elements.sourceName.textContent = "No source loaded";
  report.source = null;
  report.runs = [];
  setBusy(false);
  updatePosition();
  setStatus("Choose a media source to begin.");
  refreshReport();
}

function randomFractions(count) {
  const values = new Uint32Array(count);
  crypto.getRandomValues(values);
  return [...values].map((value) => rounded(0.01 + (value / 0xffffffff) * 0.98, 6));
}

function waitForPresentedFrame(signal, timeoutMs = 1_000) {
  if (typeof elements.media.requestVideoFrameCallback !== "function") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    let frameHandle = null;
    const timeout = window.setTimeout(() => finish(null, null), timeoutMs);
    const onAbort = () => finish(abortError());

    function finish(error, value) {
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      if (frameHandle !== null && typeof elements.media.cancelVideoFrameCallback === "function") {
        elements.media.cancelVideoFrameCallback(frameHandle);
      }
      if (error) reject(error);
      else resolve(value);
    }

    signal.addEventListener("abort", onAbort, { once: true });
    frameHandle = elements.media.requestVideoFrameCallback((callbackTime, metadata) => {
      frameHandle = null;
      finish(null, {
        callbackTime,
        mediaTimeSeconds: rounded(metadata.mediaTime, 6),
        presentedFrames: metadata.presentedFrames ?? null,
        width: metadata.width ?? null,
        height: metadata.height ?? null,
      });
    });
  });
}

function waitForSeek(targetSeconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }

    const startedAt = performance.now();
    let settled = false;
    const timeout = window.setTimeout(() => finish(new Error(`Seek to ${targetSeconds.toFixed(3)} s timed out.`)), SEEK_TIMEOUT_MS);
    const onAbort = () => finish(abortError());
    const onError = () => finish(new Error(mediaErrorMessage()));
    const onSeeked = async () => {
      const seekedAt = performance.now();
      try {
        const frame = await waitForPresentedFrame(signal);
        finish(null, {
          targetSeconds: rounded(targetSeconds, 6),
          actualSeconds: rounded(elements.media.currentTime, 6),
          seekedMs: rounded(seekedAt - startedAt),
          presentedMs: frame ? rounded(frame.callbackTime - startedAt) : null,
          completeMs: rounded((frame?.callbackTime ?? seekedAt) - startedAt),
          frame,
        });
      } catch (error) {
        finish(error);
      }
    };

    function cleanUp() {
      window.clearTimeout(timeout);
      elements.media.removeEventListener("seeked", onSeeked);
      elements.media.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
    }

    function finish(error, value) {
      if (settled) return;
      settled = true;
      cleanUp();
      if (error) reject(error);
      else resolve(value);
    }

    elements.media.addEventListener("seeked", onSeeked, { once: true });
    elements.media.addEventListener("error", onError, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });

    if (Math.abs(elements.media.currentTime - targetSeconds) < 0.0005 && elements.media.readyState >= 2) {
      queueMicrotask(onSeeked);
      return;
    }

    try {
      elements.media.currentTime = targetSeconds;
    } catch (error) {
      finish(error);
    }
  });
}

async function runSequence(id, label, fractions) {
  if (activeController || !hasMedia()) return;
  activeController = new AbortController();
  const signal = activeController.signal;
  const startedAt = performance.now();
  const qualityBefore = qualitySnapshot();
  const run = {
    id,
    label,
    startedAt: new Date().toISOString(),
    status: "running",
    requestedFractions: [...fractions],
    measurements: [],
    summary: null,
    error: null,
  };
  report.runs.push(run);
  elements.media.pause();
  setBusy(true);
  refreshReport();

  try {
    for (const [index, fraction] of fractions.entries()) {
      if (signal.aborted) throw abortError();
      const targetSeconds = targetForFraction(fraction);
      setStatus(`${label}: ${index + 1}/${fractions.length} → ${(fraction * 100).toFixed(1)}%`, "running");
      const measurement = await waitForSeek(targetSeconds, signal);
      run.measurements.push({
        index,
        fraction,
        estimatedFrame: Math.floor(targetSeconds * frameRate()),
        ...measurement,
      });
      updatePosition();
      refreshReport();
    }

    const qualityAfter = qualitySnapshot();
    const completions = run.measurements.map(({ completeMs }) => completeMs).filter(Number.isFinite);
    run.status = "passed";
    run.summary = {
      totalRunMs: rounded(performance.now() - startedAt),
      medianCompleteMs: rounded(percentile(completions, 0.5)),
      p95CompleteMs: rounded(percentile(completions, 0.95)),
      maxCompleteMs: rounded(completions.length ? Math.max(...completions) : null),
      playbackQualityBefore: qualityBefore,
      playbackQualityAfter: qualityAfter,
      totalFramesDelta: qualityDelta(qualityBefore, qualityAfter, "totalVideoFrames"),
      droppedFramesDelta: qualityDelta(qualityBefore, qualityAfter, "droppedVideoFrames"),
      corruptedFramesDelta: qualityDelta(qualityBefore, qualityAfter, "corruptedVideoFrames"),
    };
    setStatus(`${label} completed ${run.measurements.length} seek${run.measurements.length === 1 ? "" : "s"}.`, "pass");
  } catch (error) {
    run.status = error instanceof DOMException && error.name === "AbortError" ? "cancelled" : "failed";
    run.error = errorRecord(error);
    run.summary = { totalRunMs: rounded(performance.now() - startedAt) };
    setStatus(
      run.status === "cancelled" ? `${label} cancelled.` : `${label} failed: ${run.error.message}`,
      "fail",
    );
  } finally {
    activeController = null;
    setBusy(false);
    updatePosition();
    refreshReport();
  }
}

function exerciseFor(id) {
  if (id === "first-frame") return ["first-frame", "First-frame jump", [0]];
  if (id === "final-frame") return ["final-frame", "Final-frame jump", [1]];
  if (id === "random-10") return ["random-10", "10 random seeks", randomFractions(10)];
  if (id === "rapid-alternating") return ["rapid-alternating", "Rapid alternating seeks", RAPID_ALTERNATING_SEQUENCE];
  if (id === "forward-reverse") return ["forward-reverse", "Forward + reverse sequence", FORWARD_REVERSE_SEQUENCE];
  return null;
}

function registerVisibilityEvent() {
  const now = performance.now();
  const event = {
    type: document.hidden ? "hidden" : "visible",
    at: new Date().toISOString(),
    state: document.visibilityState,
    mediaTimeSeconds: rounded(elements.media.currentTime, 6),
    playing: !elements.media.paused && !elements.media.ended,
  };
  report.visibility.transitions += 1;

  if (document.hidden) {
    hiddenSession = {
      startedAt: now,
      mediaTimeSeconds: elements.media.currentTime,
      playing: event.playing,
    };
  } else if (hiddenSession) {
    event.hiddenDurationMs = rounded(now - hiddenSession.startedAt);
    event.mediaAdvanceSeconds = rounded(elements.media.currentTime - hiddenSession.mediaTimeSeconds, 6);
    event.playingBefore = hiddenSession.playing;
    event.playingAfter = event.playing;
    report.visibility.totalHiddenMs = rounded(report.visibility.totalHiddenMs + event.hiddenDurationMs);
    report.visibility.completedHiddenSessions += 1;
    hiddenSession = null;
  } else {
    event.hiddenDurationMs = null;
    event.mediaAdvanceSeconds = null;
  }

  report.visibility.events.push(event);
  refreshReport();
}

function resetVisibility() {
  hiddenSession = document.hidden
    ? { startedAt: performance.now(), mediaTimeSeconds: elements.media.currentTime, playing: !elements.media.paused }
    : null;
  report.visibility = createVisibilityRecord();
  refreshReport();
}

elements.sourceForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = elements.sourceUrl.value.trim();
  if (!value) {
    setStatus("Enter a source URL or choose a local file.", "fail");
    elements.sourceUrl.focus();
    return;
  }
  let resolved;
  try {
    resolved = new URL(value, window.location.href).href;
  } catch {
    setStatus("The source URL could not be resolved.", "fail");
    return;
  }
  loadSource({ kind: "url", name: value, url: resolved });
});

elements.file.addEventListener("change", () => {
  const [file] = elements.file.files ?? [];
  if (!file) return;
  loadSource({ kind: "local-file", name: file.name, file });
});

elements.clear.addEventListener("click", clearSource);

elements.frameRate.addEventListener("change", () => {
  const fps = clamp(frameRate(), 1, 240);
  elements.frameRate.value = String(fps);
  if (report.source) report.source.configuredFrameRate = fps;
  updatePosition();
  refreshReport();
});

elements.timeline.addEventListener("input", () => {
  if (!hasMedia() || activeController) return;
  elements.media.pause();
  elements.media.currentTime = targetForFraction(Number.parseFloat(elements.timeline.value));
  updatePosition();
});

for (const action of elements.actions) {
  action.addEventListener("click", () => {
    const exercise = exerciseFor(action.dataset.exercise);
    if (exercise) void runSequence(...exercise);
  });
}

elements.cancel.addEventListener("click", () => activeController?.abort());
elements.resetVisibility.addEventListener("click", resetVisibility);

elements.export.addEventListener("click", () => {
  refreshReport();
  const blob = new Blob([`${JSON.stringify(report, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `phase-3-crt-media-lab-${new Date().toISOString().replaceAll(":", "-")}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
});

for (const eventName of ["loadedmetadata", "durationchange", "loadeddata", "timeupdate", "seeking", "seeked", "ended"]) {
  elements.media.addEventListener(eventName, updatePosition);
}

elements.media.addEventListener("loadedmetadata", () => {
  if (report.source) {
    report.source.durationSeconds = rounded(elements.media.duration, 6);
    report.source.dimensions = { width: elements.media.videoWidth, height: elements.media.videoHeight };
  }
  setBusy(false);
  updatePosition();
  setStatus(`Loaded ${report.source?.name ?? "media"}.`, "pass");
  refreshReport();
});

elements.media.addEventListener("error", () => {
  setBusy(false);
  updatePosition();
  setStatus(mediaErrorMessage(), "fail");
  refreshReport();
});

elements.media.addEventListener("play", startPositionLoop);
elements.media.addEventListener("pause", stopPositionLoop);
document.addEventListener("visibilitychange", registerVisibilityEvent);

document.addEventListener("keydown", (event) => {
  if (!hasMedia() || activeController || event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLButtonElement || target instanceof HTMLTextAreaElement) return;

  let targetSeconds = null;
  if (event.key === "[") targetSeconds = elements.media.currentTime - frameDuration();
  if (event.key === "]") targetSeconds = elements.media.currentTime + frameDuration();
  if (event.key === "0") targetSeconds = 0;
  if (event.key === "9") targetSeconds = finalFrameTime();
  if (targetSeconds === null) return;

  event.preventDefault();
  elements.media.pause();
  elements.media.currentTime = clamp(targetSeconds, 0, finalFrameTime());
  updatePosition();
});

const query = new URLSearchParams(window.location.search);
const queryFps = Number.parseFloat(query.get("fps") ?? "");
if (Number.isFinite(queryFps) && queryFps >= 1 && queryFps <= 240) elements.frameRate.value = String(queryFps);

const querySource = query.get("src")?.trim();
if (querySource) {
  elements.sourceUrl.value = querySource;
  try {
    loadSource({ kind: "query-parameter", name: querySource, url: new URL(querySource, window.location.href).href });
  } catch {
    setStatus("The ?src query parameter could not be resolved.", "fail");
  }
} else {
  setBusy(false);
  updatePosition();
  refreshReport();
}

elements.capabilityStatus.textContent = [
  report.environment.requestVideoFrameCallback ? "presented-frame callbacks" : "seeked-event timing",
  report.environment.playbackQuality ? "playback-quality counters" : "no quality counters",
  "visibility telemetry",
].join(" · ");

window.addEventListener("beforeunload", releaseObjectUrl, { once: true });
