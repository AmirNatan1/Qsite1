import { projectTerritoryProgress } from "./territory-traverse-state.mjs";

type TerritoryProjection = ReturnType<typeof projectTerritoryProgress>;
type TerritoryMode = "enhanced" | "static";

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const numberValue = (value: number) => value.toFixed(4);

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

function presentationMode(reducedMotion: MediaQueryList): {
  mode: TerritoryMode;
  fallback?: string;
} {
  if (reducedMotion.matches) return { mode: "static", fallback: "reduced-motion" };
  if (desktopTextZoomIsUnsafe()) return { mode: "static", fallback: "text-zoom" };
  if (window.innerWidth <= 640) return { mode: "static", fallback: "authored-mobile" };
  if (window.innerHeight <= 480) return { mode: "static", fallback: "short-landscape" };
  return { mode: "enhanced" };
}

function writeProjection(
  field: HTMLElement,
  projection: TerritoryProjection,
  trackTravel: number,
  mode: TerritoryMode,
) {
  const values: ReadonlyArray<readonly [string, number]> = [
    ["--territory-progress", projection.progress],
    ["--territory-release", projection.release],
    ["--territory-automotive", projection.automotive],
    ["--territory-automotive-logistics", projection.automotiveToLogistics],
    ["--territory-routing", projection.routing],
    ["--territory-logistics-manufacturing", projection.logisticsToManufacturing],
    ["--territory-tolerance", projection.tolerance],
    ["--territory-manufacturing-energy", projection.manufacturingToEnergy],
    ["--territory-load", projection.load],
    ["--territory-registration", projection.registration],
    ["--territory-proof", projection.proof],
    ["--territory-track", projection.track],
    ["--territory-field-noise", projection.fieldNoise],
    ["--territory-carrier-weight", projection.carrierWeight],
    ["--territory-automotive-residue", projection.automotiveResidue],
    ["--territory-logistics-residue", projection.logisticsResidue],
    ["--territory-manufacturing-residue", projection.manufacturingResidue],
  ];

  for (const [property, value] of values) {
    field.style.setProperty(property, numberValue(value));
  }
  const trackX = mode === "enhanced" ? -(projection.track * trackTravel) : 0;
  field.style.setProperty("--territory-track-x", `${trackX.toFixed(2)}px`);
  field.dataset.territoryProgress = numberValue(projection.progress);
  field.dataset.territoryState = projection.state;
}

export function initTerritoryTraverse() {
  const field = document.querySelector<HTMLElement>("[data-territory-traverse]");
  if (!field || field.dataset.territoryController === "ready") return;

  const runway = field.querySelector<HTMLElement>("[data-territory-runway]")
    ?? field.querySelector<HTMLElement>(".territory-world__runway")
    ?? field;
  const track = field.querySelector<SVGElement>("[data-territory-track]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const abortController = new AbortController();
  const { signal } = abortController;

  let frame = 0;
  let needsMeasure = true;
  let chapterStart = 0;
  let chapterTravel = 1;
  let trackTravel = 0;
  let activeMode: TerritoryMode = "static";
  let lastProjectionKey = "";

  field.dataset.territoryController = "ready";
  field.dataset.territoryRaf = "idle";

  const setMode = () => {
    const next = presentationMode(reducedMotion);
    const modeChanged = activeMode !== next.mode || field.dataset.territoryMode !== next.mode;
    activeMode = next.mode;
    field.dataset.territoryMode = next.mode;
    if (next.fallback) field.dataset.territoryFallback = next.fallback;
    else delete field.dataset.territoryFallback;
    if (modeChanged) {
      needsMeasure = true;
      lastProjectionKey = "";
    }
  };

  const measure = () => {
    const documentPosition = window.scrollY;
    const runwayBounds = runway.getBoundingClientRect();
    chapterStart = documentPosition + runwayBounds.top;
    chapterTravel = Math.max(1, runwayBounds.height - window.innerHeight);
    trackTravel = activeMode === "enhanced" && track
      ? Math.max(0, track.getBoundingClientRect().width - window.innerWidth)
      : 0;
    field.dataset.territoryTrackTravel = trackTravel.toFixed(2);
    needsMeasure = false;
  };

  const render = () => {
    frame = 0;
    field.dataset.territoryRaf = "idle";
    if (document.hidden || signal.aborted) return;

    setMode();
    if (needsMeasure) measure();

    const progress = clamp((window.scrollY - chapterStart) / chapterTravel);
    const projection = projectTerritoryProgress(progress);
    const projectionKey = `${activeMode}:${trackTravel.toFixed(2)}:${JSON.stringify(projection)}`;
    if (projectionKey !== lastProjectionKey) {
      writeProjection(field, projection, trackTravel, activeMode);
      lastProjectionKey = projectionKey;
    }
    field.dataset.territoryProjection = "settled";
  };

  const schedule = () => {
    if (frame || document.hidden || signal.aborted) return;
    field.dataset.territoryProjection = "dirty";
    field.dataset.territoryRaf = "pending";
    frame = window.requestAnimationFrame(render);
  };

  const invalidate = () => {
    needsMeasure = true;
    schedule();
  };

  window.addEventListener("scroll", schedule, { passive: true, signal });
  window.addEventListener("resize", invalidate, { passive: true, signal });
  window.visualViewport?.addEventListener("resize", invalidate, { passive: true, signal });
  reducedMotion.addEventListener("change", invalidate, { signal });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      field.dataset.territoryRaf = "idle";
      field.dataset.territoryProjection = "dirty";
      return;
    }
    invalidate();
  }, { signal });

  window.addEventListener("pagehide", (event) => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    field.dataset.territoryRaf = "idle";
    field.dataset.territoryProjection = "dirty";
    if (!event.persisted) {
      abortController.abort();
      delete field.dataset.territoryController;
    }
  }, { signal });

  window.addEventListener("pageshow", (event) => {
    if (event.persisted) invalidate();
  }, { signal });

  if (document.fonts) {
    void document.fonts.ready.then(() => {
      if (!signal.aborted) invalidate();
    });
  }

  setMode();
  measure();
  render();
}
