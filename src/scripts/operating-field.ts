import { projectMethodProgress } from "./operating-field-state.mjs";

type MethodProjection = ReturnType<typeof projectMethodProgress>;

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const numberValue = (value: number) => value.toFixed(4);
const methodIndex: Readonly<Record<string, string>> = Object.freeze({
  "open-field": "00",
  frame: "01",
  source: "02",
  assess: "03",
  test: "04",
  decide: "05",
  release: "05",
});

function desktopTextZoomIsUnsafe() {
  const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  const viewportScale = window.visualViewport?.scale ?? 1;
  const chromeRatio = window.innerWidth > 0 && window.outerWidth > 0
    ? window.outerWidth / window.innerWidth
    : 1;
  return rootFontSize >= 30
    || viewportScale >= 1.75
    || (
      navigator.maxTouchPoints === 0
      && window.outerWidth >= 900
      && chromeRatio >= 1.65
    );
}

function writeProjection(
  field: HTMLElement,
  projection: MethodProjection,
  index?: HTMLElement | null,
  readout?: HTMLElement | null,
) {
  const stateChanged = field.dataset.methodState !== projection.state;
  field.dataset.methodProgress = numberValue(projection.progress);
  field.dataset.methodState = projection.state;
  if (stateChanged) {
    const step = methodIndex[projection.state];
    if (step) {
      if (index) index.textContent = `${step} / 05`;
      if (readout) readout.textContent = projection.state === "open-field"
        ? "OPEN FIELD"
        : projection.state === "release" ? "DECIDE" : projection.state.toUpperCase();
    }
  }

  const values: ReadonlyArray<readonly [string, number]> = [
    ["--method-progress", projection.progress],
    ["--method-open-field", projection.openField],
    ["--method-frame", projection.frame],
    ["--method-source", projection.source],
    ["--method-assess", projection.assess],
    ["--method-test", projection.test],
    ["--method-decide", projection.decide],
    ["--method-release", projection.release],
    ["--method-frame-pressure", projection.framePressure],
    ["--method-frame-aperture", projection.frameAperture],
    ["--method-candidate-dash", projection.candidateDash],
    ["--method-candidate-opacity", projection.candidateOpacity],
    ["--method-rejected-collapse", projection.rejectedCollapse],
    ["--method-history", projection.history],
    ["--method-contact", projection.contact],
    ["--method-test-surface", projection.testSurface],
    ["--method-decision-lock", projection.decisionLock],
    ["--method-decision-signal", projection.decisionSignal],
    ["--method-field-noise", projection.fieldNoise],
    ["--method-workpiece-clarity", projection.workpieceClarity],
  ];
  for (const [property, value] of values) {
    field.style.setProperty(property, numberValue(value));
  }
}

function resetProbe(field: HTMLElement) {
  field.style.setProperty("--method-probe-x", "50%");
  field.style.setProperty("--method-probe-y", "50%");
  field.style.setProperty("--method-probe-far-x", "0px");
  field.style.setProperty("--method-probe-far-y", "0px");
  field.style.setProperty("--method-probe-mid-x", "0px");
  field.style.setProperty("--method-probe-mid-y", "0px");
  field.style.setProperty("--method-probe-near-x", "0px");
  field.style.setProperty("--method-probe-near-y", "0px");
  field.dataset.methodProbe = "settled";
}

export function initOperatingField() {
  const field = document.querySelector<HTMLElement>("[data-operating-field]");
  if (!field || field.dataset.methodController === "ready") return;

  const index = field.querySelector<HTMLElement>("[data-method-index]");
  const readout = field.querySelector<HTMLElement>("[data-method-readout]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reducedMotion.matches || desktopTextZoomIsUnsafe()) {
    field.dataset.methodMode = "static";
    field.dataset.methodFallback = reducedMotion.matches ? "reduced-motion" : "text-zoom";
    writeProjection(field, projectMethodProgress(1), index, readout);
    resetProbe(field);
    return;
  }

  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const probeSurface = field.querySelector<HTMLElement>("[data-operating-field-probe]") ?? field;
  const abortController = new AbortController();
  const { signal } = abortController;

  let frame = 0;
  let needsMeasure = true;
  let chapterStart = 0;
  let chapterTravel = 1;
  let pendingClientX = 0;
  let pendingClientY = 0;
  let pendingProbeX = 50;
  let pendingProbeY = 50;
  let probePositionDirty = false;
  let probeDirty = false;

  field.dataset.methodMode = "enhanced";
  field.dataset.methodController = "ready";
  delete field.dataset.methodFallback;
  resetProbe(field);

  const measure = () => {
    const documentPosition = window.scrollY;
    const fieldBounds = field.getBoundingClientRect();
    chapterStart = documentPosition + fieldBounds.top;
    chapterTravel = Math.max(1, fieldBounds.height - window.innerHeight);
    needsMeasure = false;
  };

  const writeProbe = () => {
    if (probePositionDirty) {
      const bounds = probeSurface.getBoundingClientRect();
      pendingProbeX = clamp((pendingClientX - bounds.left) / Math.max(1, bounds.width)) * 100;
      pendingProbeY = clamp((pendingClientY - bounds.top) / Math.max(1, bounds.height)) * 100;
    }
    const signedX = Math.min(1, Math.max(-1, (pendingProbeX - 50) / 50));
    const signedY = Math.min(1, Math.max(-1, (pendingProbeY - 50) / 50));
    field.style.setProperty("--method-probe-x", `${pendingProbeX.toFixed(2)}%`);
    field.style.setProperty("--method-probe-y", `${pendingProbeY.toFixed(2)}%`);
    field.style.setProperty("--method-probe-far-x", `${(-signedX * 2.5).toFixed(2)}px`);
    field.style.setProperty("--method-probe-far-y", `${(-signedY * 2).toFixed(2)}px`);
    field.style.setProperty("--method-probe-mid-x", `${(signedX * 4).toFixed(2)}px`);
    field.style.setProperty("--method-probe-mid-y", `${(signedY * 3).toFixed(2)}px`);
    field.style.setProperty("--method-probe-near-x", `${(signedX * 7).toFixed(2)}px`);
    field.style.setProperty("--method-probe-near-y", `${(signedY * 5).toFixed(2)}px`);
    field.dataset.methodProbe = signedX === 0 && signedY === 0 ? "settled" : "active";
    probePositionDirty = false;
    probeDirty = false;
  };

  const render = () => {
    frame = 0;
    if (document.hidden || signal.aborted) return;
    if (needsMeasure) measure();

    const progress = clamp((window.scrollY - chapterStart) / chapterTravel);
    writeProjection(field, projectMethodProgress(progress), index, readout);
    if (probeDirty) writeProbe();
  };

  const schedule = () => {
    if (frame || document.hidden || signal.aborted) return;
    frame = window.requestAnimationFrame(render);
  };

  const settleProbe = () => {
    pendingProbeX = 50;
    pendingProbeY = 50;
    probePositionDirty = false;
    probeDirty = true;
    schedule();
  };

  const releaseToStatic = (reason: "reduced-motion" | "text-zoom") => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    field.dataset.methodMode = "static";
    field.dataset.methodFallback = reason;
    delete field.dataset.methodController;
    writeProjection(field, projectMethodProgress(1), index, readout);
    resetProbe(field);
    abortController.abort();
  };

  window.addEventListener("scroll", schedule, { passive: true, signal });
  window.addEventListener("resize", () => {
    if (desktopTextZoomIsUnsafe()) {
      releaseToStatic("text-zoom");
      return;
    }
    needsMeasure = true;
    schedule();
  }, { passive: true, signal });

  if (finePointer.matches) {
    field.addEventListener("pointermove", (event) => {
      pendingClientX = event.clientX;
      pendingClientY = event.clientY;
      probePositionDirty = true;
      probeDirty = true;
      schedule();
    }, { passive: true, signal });
    field.addEventListener("pointerleave", settleProbe, { passive: true, signal });
    field.addEventListener("pointercancel", settleProbe, { passive: true, signal });
  }

  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) releaseToStatic("reduced-motion");
  }, { signal });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      pendingProbeX = 50;
      pendingProbeY = 50;
      probePositionDirty = false;
      probeDirty = false;
      resetProbe(field);
      return;
    }
    needsMeasure = true;
    schedule();
  }, { signal });

  window.addEventListener("pagehide", (event) => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    pendingProbeX = 50;
    pendingProbeY = 50;
    probePositionDirty = false;
    probeDirty = false;
    resetProbe(field);
    if (!event.persisted) {
      abortController.abort();
      delete field.dataset.methodController;
    }
  }, { signal });

  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    needsMeasure = true;
    schedule();
  }, { signal });

  measure();
  render();
}
