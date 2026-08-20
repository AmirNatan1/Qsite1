type MeasuredElement = {
  element: HTMLElement;
  top: number;
  height: number;
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const numberValue = (value: number) => clamp(value).toFixed(4);

function measure(element: HTMLElement): MeasuredElement {
  const bounds = element.getBoundingClientRect();
  return {
    element,
    top: bounds.top + window.scrollY,
    height: Math.max(bounds.height, 1),
  };
}

export function initOperatingField() {
  const root = document.documentElement;
  const main = document.querySelector<HTMLElement>("main");
  const method = document.querySelector<HTMLElement>("[data-method-section]");
  const experience = document.querySelector<HTMLElement>("[data-method-experience]");
  const workpiece = document.querySelector<HTMLElement>("[data-method-workpiece]");
  const stages = Array.from(document.querySelectorAll<HTMLElement>("[data-method-stage]"));
  const stageCopyBlocks = stages.map((stage) => stage.querySelector<HTMLElement>("div"));
  const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-field-section]"));
  const territories = Array.from(document.querySelectorAll<HTMLElement>("[data-territory]"));
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (!main || !method || !experience || !workpiece || stages.length !== 5) return;

  const abortController = new AbortController();
  const { signal } = abortController;
  let frame = 0;
  let needsMeasurement = true;
  let sectionMetrics: MeasuredElement[] = [];
  let territoryMetrics: MeasuredElement[] = [];
  let stageMetrics: MeasuredElement[] = [];
  let experienceMetric = measure(experience);
  let sceneTrackingEnabled = false;
  let methodStickyEnabled = false;

  const clearMethodProgress = () => {
    for (const property of [
      "--method-progress",
      "--method-frame",
      "--method-source",
      "--method-assess",
      "--method-test",
      "--method-decide",
    ]) {
      method.style.removeProperty(property);
    }
    for (const stage of stages) stage.style.removeProperty("--stage-presence");
  };

  const disableEnhancement = () => {
    root.removeAttribute("data-operating-field");
    method.removeAttribute("data-method-sticky");
    clearMethodProgress();
    for (const item of [...sections, ...territories]) {
      item.style.removeProperty("--field-progress");
      item.style.removeProperty("--territory-progress");
    }
  };

  const contentFits = () => {
    const availableHeight = window.innerHeight - 120;
    const workpieceHeight = workpiece.getBoundingClientRect().height;
    const stageCopyFits = stageCopyBlocks.every(
      (copy) => copy && copy.getBoundingClientRect().height <= availableHeight * 0.72,
    );
    return workpieceHeight <= availableHeight && stageCopyFits;
  };

  const remeasure = () => {
    sectionMetrics = sections.map(measure);
    territoryMetrics = territories.map(measure);
    stageMetrics = stages.map(measure);
    experienceMetric = measure(experience);
    sceneTrackingEnabled = window.innerWidth >= 768 && !motionPreference.matches;
    methodStickyEnabled =
      window.innerWidth >= 1120 &&
      window.innerHeight >= 704 &&
      sceneTrackingEnabled &&
      contentFits();

    if (sceneTrackingEnabled) root.dataset.operatingField = "enhanced";
    else root.removeAttribute("data-operating-field");

    method.dataset.methodSticky = String(methodStickyEnabled);
    if (!methodStickyEnabled) clearMethodProgress();
    needsMeasurement = false;
  };

  const writeProgress = () => {
    if (document.hidden || motionPreference.matches) return;
    if (needsMeasurement) remeasure();

    const scrollPosition = window.scrollY;
    const viewportHeight = window.innerHeight;

    if (sceneTrackingEnabled) {
      for (const item of sectionMetrics) {
        const progress = (scrollPosition + viewportHeight - item.top) / (item.height + viewportHeight);
        item.element.style.setProperty("--field-progress", numberValue(progress));
      }

      for (const item of territoryMetrics) {
        const progress = (scrollPosition + viewportHeight * 0.74 - item.top) / item.height;
        item.element.style.setProperty("--territory-progress", numberValue(progress));
      }
    }

    if (methodStickyEnabled) {
      const methodTravel = Math.max(experienceMetric.height - viewportHeight * 0.45, 1);
      const methodProgress =
        (scrollPosition + viewportHeight * 0.52 - experienceMetric.top) / methodTravel;
      method.style.setProperty("--method-progress", numberValue(methodProgress));

      const phaseNames = ["frame", "source", "assess", "test", "decide"];
      stageMetrics.forEach((item, index) => {
        const stageProgress =
          (scrollPosition + viewportHeight * 0.62 - item.top) / Math.max(item.height * 0.72, 1);
        method.style.setProperty(`--method-${phaseNames[index]}`, numberValue(stageProgress));

        const distance = Math.abs(item.top + item.height / 2 - (scrollPosition + viewportHeight / 2));
        const presence = 1 - distance / Math.max(viewportHeight * 0.72, 1);
        item.element.style.setProperty("--stage-presence", numberValue(presence));
      });
    }
  };

  const schedule = () => {
    if (frame || document.hidden) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      writeProgress();
    });
  };

  const invalidate = () => {
    needsMeasurement = true;
    schedule();
  };

  const handleMotionChange = () => {
    if (motionPreference.matches) disableEnhancement();
    else invalidate();
  };

  const resizeObserver = new ResizeObserver(invalidate);
  resizeObserver.observe(main);
  resizeObserver.observe(experience);

  window.addEventListener("scroll", schedule, { passive: true, signal });
  window.addEventListener("resize", invalidate, { passive: true, signal });
  window.addEventListener("pageshow", invalidate, { passive: true, signal });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden && frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      } else if (!document.hidden) {
        invalidate();
      }
    },
    { signal },
  );
  motionPreference.addEventListener("change", handleMotionChange, { signal });

  void document.fonts?.ready.then(invalidate);

  window.addEventListener(
    "pagehide",
    (event) => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      if (event.persisted) return;
      resizeObserver.disconnect();
      abortController.abort();
    },
    { signal },
  );

  writeProgress();
}
