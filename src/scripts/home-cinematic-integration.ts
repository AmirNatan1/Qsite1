export type MediaFamily = "desktop" | "portrait" | "landscape";
export type Codec = "h264";

type ProductionAsset = {
  file: string;
  kind: "video" | "poster";
  family: MediaFamily;
  codec?: Codec;
  resolution?: [number, number];
  durationSeconds?: number;
  bytes?: number;
  sha256?: string;
  fps?: number;
  frames?: number;
};

type ProductionManifest = {
  schema: string;
  sourceBlendSha256?: string;
  physicalTimeline?: { frames?: number; fps?: number; durationRational?: string };
  authorization?: { mergeMain?: boolean; phase5?: boolean };
  assets?: ProductionAsset[];
};

const PHYSICAL_FRAME_COUNT = 500;
const CONCEPTUAL_FRAME_COUNT = 540;
const BLACK_START_U = 500;
const ENTRY_START_U = 513;
const BLACK_FRAME_COUNT = ENTRY_START_U - BLACK_START_U;
const FRAME_RATE = 30;
export const FIRST_CHANGED_FRAME = 46;
export const ARRIVAL_FRAME = 285;
export const STABLE_Q_FRAME = 370;
const FIRST_CHANGED_U = FIRST_CHANGED_FRAME - 1;
const ARRIVAL_U = ARRIVAL_FRAME - 1;
const LOAD_TIMEOUT_MS = 12_000;
const MAX_ASSET_BYTES = 25 * 1024 * 1024;
const SOURCE_BLEND_SHA256 = "58f5479484dd8da342556abad1e58c96a660f30e6a9d6d5215927056b5cbc516";
const MANIFEST_PATH = "/media/cinematic/phase-4r2/manifests/phase-4r2-production-media-manifest.json";
const MEDIA_ROOT = "/media/cinematic/phase-4r2/";

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const rounded = (value: number, digits = 4) => Number(value.toFixed(digits));
const mix = (start: number, end: number, progress: number) => start + (end - start) * progress;

function interpolatePiecewise(value: number, input: readonly number[], output: readonly number[]) {
  const progress = Math.min(input.at(-1) ?? 1, Math.max(input[0] ?? 0, value));
  for (let index = 1; index < input.length; index += 1) {
    const inputStart = input[index - 1]!;
    const inputEnd = input[index]!;
    const outputStart = output[index - 1]!;
    const outputEnd = output[index]!;
    if (progress <= inputEnd) return mix(outputStart, outputEnd, (progress - inputStart) / Math.max(inputEnd - inputStart, Number.EPSILON));
  }
  return output.at(-1) ?? 1;
}

export type CinematicSegmentId =
  | "top-dormancy"
  | "current-orbit"
  | "crt-arrival"
  | "indicator"
  | "phosphor-line"
  | "raster-expansion"
  | "raster-settling"
  | "q-appearance"
  | "q-hold"
  | "frontal-approach"
  | "physical-threshold"
  | "digital-breathing"
  | "entry-reveal";

/**
 * Physical/editorial authority from the accepted F1-F500 film. Coordinates are
 * zero-based so physical frame F285 is u=284. Browser-owned black and ENTRY
 * follow the physical threshold without loading another decoder.
 */
export const CINEMATIC_SEGMENTS = [
  { id: "top-dormancy", startU: 0, endU: 0, physical: "F1" },
  { id: "current-orbit", startU: FIRST_CHANGED_U, endU: ARRIVAL_U - 1, physical: "F46-F284" },
  { id: "crt-arrival", startU: ARRIVAL_U, endU: ARRIVAL_U, physical: "F285" },
  { id: "indicator", startU: 285, endU: 298, physical: "F286-F299" },
  { id: "phosphor-line", startU: 299, endU: 314, physical: "F300-F315" },
  { id: "raster-expansion", startU: 315, endU: 334, physical: "F316-F335" },
  { id: "raster-settling", startU: 335, endU: 354, physical: "F336-F355" },
  { id: "q-appearance", startU: 355, endU: 368, physical: "F356-F369" },
  { id: "q-hold", startU: 369, endU: 404, physical: "F370-F405" },
  { id: "frontal-approach", startU: 405, endU: 479, physical: "F406-F480" },
  { id: "physical-threshold", startU: 480, endU: 499, physical: "F481-F500" },
  { id: "digital-breathing", startU: 500, endU: 512, physical: "F500 hold" },
  { id: "entry-reveal", startU: 513, endU: CONCEPTUAL_FRAME_COUNT, physical: "F500 hold" },
] as const satisfies readonly { id: CinematicSegmentId; startU: number; endU: number; physical: string }[];

/** Explicit authored landmarks; no undifferentiated scroll-percent multiplier. */
const PIECEWISE_COORDINATES = [
  FIRST_CHANGED_U,
  54,
  226.8,
  ARRIVAL_U,
  285,
  291,
  299,
  315,
  335,
  355,
  369,
  405,
  421.2,
  480,
  500,
  513,
  CONCEPTUAL_FRAME_COUNT,
] as const;

const PIECEWISE_PROGRESS = {
  desktop: [0, 0.038056, 0.31713, 0.395484, 0.396854, 0.405073, 0.416031, 0.437949, 0.465346, 0.492743, 0.51192, 0.640396, 0.691074, 0.835542, 0.884681, 0.922159, 1],
  shortDesktop: [0, 0.032792, 0.306208, 0.385067, 0.386445, 0.394717, 0.405747, 0.427806, 0.455379, 0.482952, 0.502253, 0.631556, 0.684481, 0.834058, 0.884934, 0.922331, 1],
  portrait: [0, 0.036262, 0.296167, 0.372615, 0.373951, 0.381971, 0.392662, 0.414046, 0.440776, 0.467506, 0.486217, 0.611566, 0.665562, 0.827041, 0.881966, 0.920328, 1],
  landscape: [0, 0.036429, 0.29753, 0.37433, 0.375672, 0.383729, 0.39447, 0.415951, 0.442805, 0.469658, 0.488455, 0.614381, 0.667706, 0.82718, 0.881423, 0.919961, 1],
} as const;

function scrollProfile(family: MediaFamily, shortDesktop: boolean): readonly number[] {
  return family === "desktop" && shortDesktop ? PIECEWISE_PROGRESS.shortDesktop : PIECEWISE_PROGRESS[family];
}

function piecewiseOffsets(travel: number, family: MediaFamily, shortDesktop: boolean) {
  const extent = Math.max(1, Math.round(travel));
  const offsets = scrollProfile(family, shortDesktop).map((progress) => Math.round(progress * extent));
  const arrivalIndex = PIECEWISE_COORDINATES.indexOf(ARRIVAL_U);
  const activationIndex = PIECEWISE_COORDINATES.indexOf(285);
  // F285 owns the exact arrival coordinate. The next positive document pixel
  // owns F286, so there is no hidden gesture or dead interval at the CRT.
  offsets[activationIndex] = Math.min(extent, offsets[arrivalIndex]! + 1);
  return offsets;
}

export function arrivalScrollProgress(family: MediaFamily, shortDesktop: boolean) {
  return scrollProfile(family, shortDesktop)[PIECEWISE_COORDINATES.indexOf(ARRIVAL_U)]!;
}

export function arrivalScrollOffset(travel: number, family: MediaFamily, shortDesktop: boolean) {
  return Math.max(1, Math.round(Math.max(1, travel) * arrivalScrollProgress(family, shortDesktop)));
}

/** Exact top is F1; every positive integer scroll offset enters visible F46+. */
export function conceptualCoordinateForScroll(scrollOffset: number, travel: number, family: MediaFamily, shortDesktop: boolean) {
  const extent = Math.max(1, Math.round(travel));
  const offset = Math.min(extent, Math.max(0, Math.round(scrollOffset)));
  if (offset === 0) return 0;
  return interpolatePiecewise(offset, piecewiseOffsets(extent, family, shortDesktop), PIECEWISE_COORDINATES);
}

export function scrollOffsetForFrame(frame: number, travel: number, family: MediaFamily, shortDesktop: boolean) {
  if (frame >= CONCEPTUAL_FRAME_COUNT) return Math.max(1, Math.round(travel));
  const targetU = Math.min(CONCEPTUAL_FRAME_COUNT, Math.max(0, Math.floor(frame) - 1));
  if (targetU === 0) return 0;
  const offsets = piecewiseOffsets(travel, family, shortDesktop);
  return Math.round(interpolatePiecewise(targetU, PIECEWISE_COORDINATES, offsets));
}

export function cinematicSegmentForCoordinate(coordinate: number): CinematicSegmentId {
  if (coordinate === 0) return "top-dormancy";
  const segment = CINEMATIC_SEGMENTS.find(({ startU, endU }) => coordinate >= startU && coordinate <= endU);
  return segment?.id ?? "entry-reveal";
}

/** Normalized compatibility surface; runtime uses the integer-offset authority above. */
export function mapCinematicProgress(scrollProgress: number, family: MediaFamily, shortDesktop: boolean) {
  const extent = 1_000_000;
  return conceptualCoordinateForScroll(clamp(scrollProgress) * extent, extent, family, shortDesktop) / CONCEPTUAL_FRAME_COUNT;
}

/** The selected cohort is intentionally locked on initial load. */
export function chooseFamily(width: number, height: number): MediaFamily {
  if (width <= 800 && height > width) return "portrait";
  if (width <= 900 && height <= 480 && width > height) return "landscape";
  return "desktop";
}

export function travelViewportHeights(family: MediaFamily, shortDesktop: boolean) {
  if (family === "portrait") return 5.35;
  if (family === "landscape") return 5.6;
  return shortDesktop ? 5.95 : 6.75;
}

export type CinematicDocumentPhase = "physical" | "black" | "entry" | "settled";
export type CinematicDocumentState = {
  scrollOffset: number;
  scrollProgress: number;
  conceptualCoordinate: number;
  conceptualFrame: number;
  physicalFrame: number;
  black: number;
  blackBreath: number;
  semantic: number;
  settled: boolean;
  phase: CinematicDocumentPhase;
};

/** Document progress remains authoritative even after late media delivery fails. */
export function cinematicDocumentStateForScroll(
  scrollOffset: number,
  travel: number,
  family: MediaFamily,
  shortDesktop: boolean,
): CinematicDocumentState {
  const scrollExtent = Math.max(1, Math.round(travel));
  const offset = Math.min(scrollExtent, Math.max(0, Math.round(scrollOffset)));
  const scrollProgress = offset / scrollExtent;
  const conceptualCoordinate = conceptualCoordinateForScroll(offset, scrollExtent, family, shortDesktop);
  const conceptualFrame = Math.min(CONCEPTUAL_FRAME_COUNT, Math.max(1, Math.floor(conceptualCoordinate) + 1));
  const physicalFrame = physicalFrameFor(conceptualCoordinate);
  const black = conceptualCoordinate >= BLACK_START_U ? 1 : 0;
  const blackOffset = conceptualCoordinate - BLACK_START_U;
  const blackBreath = blackOffset >= 0 && blackOffset < BLACK_FRAME_COUNT
    ? 0.5 - 0.5 * Math.cos((blackOffset / BLACK_FRAME_COUNT) * Math.PI * 2)
    : 0;
  const semantic = conceptualCoordinate >= ENTRY_START_U ? 1 : 0;
  const settled = scrollProgress >= 0.9995;
  const phase: CinematicDocumentPhase = settled
    ? "settled"
    : conceptualCoordinate >= ENTRY_START_U
      ? "entry"
      : conceptualCoordinate >= BLACK_START_U
        ? "black"
        : "physical";
  return { scrollOffset: offset, scrollProgress, conceptualCoordinate, conceptualFrame, physicalFrame, black, blackBreath, semantic, settled, phase };
}

export type CinematicFailureDisposition = "static" | "preserve-runway";

/** Compact flow is an eligibility decision only; committed enhanced geometry is immutable for this document lifetime. */
export function cinematicFailureDisposition(_reason: string, enhancedCommitted: boolean): CinematicFailureDisposition {
  return enhancedCommitted ? "preserve-runway" : "static";
}

export function conceptualFrameFor(progress: number) {
  return Math.min(CONCEPTUAL_FRAME_COUNT, Math.max(1, Math.floor(conceptualCoordinateFor(progress)) + 1));
}

/** The agreed continuous conceptual coordinate: u ∈ [0, 540]. */
export function conceptualCoordinateFor(progress: number) {
  return clamp(progress) * CONCEPTUAL_FRAME_COUNT;
}

export function physicalFrameFor(conceptualCoordinate: number) {
  return Math.min(PHYSICAL_FRAME_COUNT, Math.max(1, Math.floor(conceptualCoordinate) + 1));
}

export function supportsH264(canPlayType: (mimeType: string) => string) {
  const support = canPlayType('video/mp4; codecs="avc1.640028"');
  return support === "probably" || support === "maybe";
}

function chooseCodec(video: HTMLVideoElement): Codec | null {
  return supportsH264((mimeType) => video.canPlayType(mimeType)) ? "h264" : null;
}

function zoomMakesPortalUnsafe() {
  const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  const viewportScale = window.visualViewport?.scale ?? 1;
  const chromeRatio = window.innerWidth > 0 && window.outerWidth > 0 ? window.outerWidth / window.innerWidth : 1;
  return rootFontSize >= 30 || viewportScale >= 1.75 || (navigator.maxTouchPoints === 0 && window.outerWidth >= 900 && chromeRatio >= 1.65);
}

function mediaUrl(file: string) {
  return `${MEDIA_ROOT}${file}`;
}

const isSha256 = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

function selectedManifestAsset(manifest: ProductionManifest, family: MediaFamily, codec: Codec) {
  const completeH264Inventory = Array.isArray(manifest.assets) && (["desktop", "portrait", "landscape"] as const).every((candidate) =>
    manifest.assets!.filter((asset) => asset.kind === "video" && asset.family === candidate && asset.codec === "h264").length === 1
    && manifest.assets!.filter((asset) => asset.kind === "poster" && asset.family === candidate && asset.codec === undefined).length === 1
  );
  if (
    manifest.schema !== "quantum-hub.phase-4-r2.production-media-manifest.v1"
    || manifest.sourceBlendSha256 !== SOURCE_BLEND_SHA256
    || manifest.physicalTimeline?.frames !== PHYSICAL_FRAME_COUNT
    || manifest.physicalTimeline?.fps !== FRAME_RATE
    || manifest.physicalTimeline?.durationRational !== "50/3"
    || manifest.authorization?.mergeMain !== false
    || manifest.authorization?.phase5 !== false
    || !Array.isArray(manifest.assets)
    || manifest.assets.length !== 6
    || !completeH264Inventory
  ) throw 0;
  const selected = manifest.assets.filter((asset) => asset.kind === "video" && asset.family === family && asset.codec === codec);
  const asset = selected[0];
  if (
    selected.length !== 1
    || !asset
    || !Number.isInteger(asset.bytes)
    || (asset.bytes ?? 0) <= 0
    || (asset.bytes ?? MAX_ASSET_BYTES) >= MAX_ASSET_BYTES
    || !isSha256(asset.sha256)
    || asset.file !== `media/phase-4r2-${family}-${codec}-${asset.sha256.slice(0, 12)}.mp4`
    || asset.frames !== PHYSICAL_FRAME_COUNT
    || asset.fps !== FRAME_RATE
  ) throw 0;
  return asset;
}

async function selectedMediaSource(family: MediaFamily, codec: Codec, signal: AbortSignal) {
  const response = await fetch(MANIFEST_PATH, { cache: "no-cache", signal });
  if (!response.ok) throw new Error(`manifest response ${response.status}`);
  const manifest = await response.json() as ProductionManifest;
  const asset = selectedManifestAsset(manifest, family, codec);
  return { source: mediaUrl(asset.file), asset };
}

export function initHomeCinematicIntegration() {
  const root = document.documentElement;
  const shell = document.querySelector<HTMLElement>("[data-cinematic-shell]");
  const stage = shell?.querySelector<HTMLElement>("[data-cinematic-stage]");
  const video = shell?.querySelector<HTMLVideoElement>("[data-cinematic-media]");
  const entry = shell?.querySelector<HTMLElement>("#entry");
  const manifestoContent = shell?.querySelector<HTMLElement>(".manifesto-field__content");
  const audienceRouting = shell?.querySelector<HTMLElement>("[data-audience-routing]");
  const header = document.querySelector<HTMLElement>(".site-header");
  const footer = document.querySelector<HTMLElement>(".site-footer");
  const downstreamFields = Array.from(document.querySelectorAll<HTMLElement>("[data-field-section]"));
  const skipLink = document.querySelector<HTMLAnchorElement>(".skip-link[href='#entry']");
  const mobileMenu = header?.querySelector<HTMLDetailsElement>("[data-mobile-nav]");
  const semanticHomeLinks = Array.from(header?.querySelectorAll<HTMLAnchorElement>('a[href="/#entry"]') ?? []);
  const methodField = document.querySelector<HTMLElement>("[data-method-section]");
  const methodStages = Array.from(methodField?.querySelectorAll<HTMLElement>("[data-method-stage]") ?? []);
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const fonts = document.fonts;
  let fontsReady = !fonts || fonts.status === "loaded";

  const releaseMissingDom = () => {
    root.dataset.cinematicFallback = "required-dom";
    root.dataset.cinematicEligibility = "bypass";
    root.dataset.cinematicMode = "static";
    root.dataset.cinematicHeader = "released";
    delete root.dataset.cinematicEntryIntent;
    document.querySelector<HTMLElement>(".site-header")?.removeAttribute("inert");
    document.querySelector<HTMLElement>("#entry")?.removeAttribute("inert");
    document.querySelector<HTMLElement>("[data-audience-routing]")?.removeAttribute("inert");
    document.querySelector<HTMLElement>(".site-footer")?.removeAttribute("inert");
    for (const field of document.querySelectorAll<HTMLElement>("[data-field-section]")) field.removeAttribute("inert");
    if (shell) {
      shell.dataset.cinematicInteractive = "true";
      shell.dataset.routeNavigation = "released";
      shell.dataset.cinematicPhase = "fallback";
      shell.dataset.mediaState = "failed";
    }
  };
  if (!shell || !stage || !video || !entry || !manifestoContent || !audienceRouting || !header || !skipLink) {
    releaseMissingDom();
    return;
  }
  if (root.dataset.cinematicMode !== "candidate") return;

  const abortController = new AbortController();
  const mediaAbortController = new AbortController();
  const { signal } = abortController;
  const initialCohort = root.dataset.cinematicCohort;
  const initialFamily: MediaFamily = initialCohort === "portrait"
    ? "portrait"
    : initialCohort === "landscape"
      ? "landscape"
      : "desktop";
  const initialShortDesktop = initialCohort === "short-desktop";
  const codec = chooseCodec(video);
  let animationFrame = 0;
  let manifestoAnimationFrame = 0;
  let manifestoNavigationFrame = 0;
  let semanticHomeClickPending = false;
  let manifestoRevealState: "hidden" | "armed" | "revealing" | "resolved" = "hidden";
  let manifestoThresholdActive = false;
  let manifestoRevealStartedAt = 0;
  let semanticEntryNavigationResolved = false;
  let loadTimer = 0;
  let metadataReady = false;
  let mediaReady = false;
  let mediaFailed = false;
  let failed = false;
  let latestPhysicalFrame = -1;
  let targetPhysicalFrame = 1;
  let targetTime = 0;
  let objectUrl: string | null = null;
  let needsMeasurement = true;
  let shellTop = 0;
  let entryTop = 1;
  let audienceTop = 2;
  let headerHeight = 0;
  let travel = 1;
  let committedTravel = 0;
  let scrollTargetPhysicalFrame = 1;
  let presentedPhysicalFrame = 1;
  let currentScrollOffset = 0;
  let persistedRestorationState = "";

  /**
   * The accepted Operating Field owns its motion preference response and stays
   * byte-frozen. Once its five-stage desktop geometry has actually committed,
   * remember the authored computed minimum so a later accessibility preference
   * can stop sticky motion without collapsing the already-entered document.
   */
  const rememberCommittedMethodGeometry = () => {
    if (
      root.dataset.cinematicMethodGeometry === "committed"
      || methodField?.dataset.methodSticky !== "true"
      || methodStages.length !== 5
    ) return;
    const minimums = methodStages.map((stage) => Number.parseFloat(getComputedStyle(stage).minHeight));
    if (minimums.some((value) => !Number.isFinite(value) || value <= 0)) return;
    if (Math.max(...minimums) - Math.min(...minimums) > 0.5) return;
    root.style.setProperty("--cinematic-committed-method-stage-min-height", `${minimums[0]!.toFixed(2)}px`);
    root.dataset.cinematicMethodGeometry = "committed";
  };

  const pauseDecoder = () => {
    video.pause();
  };

  const clearTimer = () => {
    if (loadTimer) window.clearTimeout(loadTimer);
    loadTimer = 0;
  };
  const releaseMedia = () => {
    mediaAbortController.abort();
    pauseDecoder();
    video.removeAttribute("src");
    video.load();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  };
  const persistRestorationState = (settledOrLower: boolean) => {
    const key = String(settledOrLower);
    if (persistedRestorationState === key) return;
    try {
      history.replaceState({ ...(history.state && typeof history.state === "object" ? history.state : {}), quantumHomeCinematic: { version: 4, settledOrLower } }, document.title);
      persistedRestorationState = key;
    } catch { /* History state is advisory. */ }
  };
  const setThresholdInteraction = (manifestoSettled: boolean, navigationReleased: boolean) => {
    if (navigationReleased) {
      header.removeAttribute("inert");
      entry.removeAttribute("inert");
      footer?.removeAttribute("inert");
      for (const field of downstreamFields) field.removeAttribute("inert");
      root.dataset.cinematicHeader = "released";
      shell.dataset.cinematicInteractive = "true";
      shell.dataset.routeNavigation = "released";
      return;
    }
    mobileMenu?.removeAttribute("open");
    const focused = document.activeElement;
    header.setAttribute("inert", "");
    footer?.setAttribute("inert", "");
    for (const field of downstreamFields) field.setAttribute("inert", "");
    root.dataset.cinematicHeader = "concealed";
    shell.dataset.routeNavigation = "concealed";
    if (manifestoSettled) {
      entry.removeAttribute("inert");
      shell.dataset.cinematicInteractive = "manifesto";
      if (focused instanceof Node && (header.contains(focused) || footer?.contains(focused) || downstreamFields.some((field) => field.contains(focused)))) {
        entry.focus({ preventScroll: true });
      }
      return;
    }
    entry.setAttribute("inert", "");
    shell.dataset.cinematicInteractive = "false";
    if (focused instanceof Node && (header.contains(focused) || entry.contains(focused) || footer?.contains(focused) || downstreamFields.some((field) => field.contains(focused)))) {
      skipLink.focus({ preventScroll: true });
    }
  };
  const clearCinematicStyles = () => {
    for (const property of ["--cinematic-header-px", "--cinematic-travel-px", "--cinematic-progress", "--cinematic-film-progress", "--cinematic-black", "--cinematic-black-breath", "--cinematic-media-ready", "--manifesto-anchor-px"]) shell.style.removeProperty(property);
  };
  const failOpen = (reason: string) => {
    if (failed) return;
    const disposition = cinematicFailureDisposition(reason, root.dataset.cinematicMode === "enhanced");
    if (mediaFailed && disposition === "preserve-runway") return;
    clearTimer();
    root.dataset.cinematicFallback = reason;
    if (disposition === "preserve-runway") {
      mediaFailed = true;
      metadataReady = false;
      mediaReady = false;
      releaseMedia();
      shell.dataset.mediaState = "failed-preserve-runway";
      shell.dataset.cinematicControl = "scroll-addressed";
      shell.style.setProperty("--cinematic-media-ready", "0");
      needsMeasurement = true;
      Object.assign(publicState, { mode: "enhanced", mediaReady: false });
      schedule();
      return;
    }
    failed = true;
    releaseMedia();
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    if (manifestoAnimationFrame) window.cancelAnimationFrame(manifestoAnimationFrame);
    manifestoAnimationFrame = 0;
    if (manifestoNavigationFrame) window.cancelAnimationFrame(manifestoNavigationFrame);
    manifestoNavigationFrame = 0;
    root.dataset.cinematicEligibility = "bypass";
    root.dataset.cinematicMode = "static";
    delete shell.dataset.manifestoReveal;
    shell.dataset.mediaState = "failed";
    shell.dataset.cinematicPhase = "fallback";
    setThresholdInteraction(true, true);
    clearCinematicStyles();
  };
  const portalFits = () => {
    if (!fontsReady) return true;
    if (zoomMakesPortalUnsafe() || window.innerHeight < 320) return false;
    const anchors = [
      manifestoContent.querySelector<HTMLElement>("h1"),
      ...manifestoContent.querySelectorAll<HTMLElement>(".manifesto-line"),
      ...audienceRouting.querySelectorAll<HTMLElement>(".audience-trajectory"),
    ];
    return anchors.every((anchor) => {
      if (!anchor) return false;
      const bounds = anchor.getBoundingClientRect();
      return bounds.left >= -3
        && bounds.right <= window.innerWidth + 3
        && anchor.scrollWidth <= anchor.clientWidth + 3;
    }) && Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= window.innerWidth + 3;
  };

  if (motion.matches || !codec || !portalFits()) {
    failOpen(motion.matches ? "reduced-motion" : codec ? "typography-fit" : "codec");
    return;
  }

  const publicState = {
    mode: "enhanced", mediaFamily: initialFamily, codec, delivery: "blob" as const,
    scrollProgress: 0, cinematicProgress: 0, conceptualFrame: 1, targetFrame: 1, targetTime: 0,
    blackProgress: 0, semanticProgress: 0, mediaReady: false, control: "scroll-addressed" as const,
    segment: "top-dormancy" as CinematicSegmentId, scrollOffset: 0, presentedFrame: 1,
    manifestoActive: false, manifestoSettled: false,
    manifestoRevealState: "hidden" as "hidden" | "armed" | "revealing" | "resolved",
    manifestoRevealDurationMs: 0,
    navigationReleased: false,
  };
  window.quantumPhase4 = publicState;
  root.dataset.cinematicMode = "enhanced";
  shell.dataset.mediaFamily = initialFamily;
  shell.dataset.mediaCodec = codec;
  shell.dataset.mediaDelivery = "blob";
  shell.dataset.mediaState = "loading";
  shell.dataset.cinematicControl = "scroll-addressed";
  shell.dataset.manifestoReveal = "hidden";
  video.preload = "auto";

  const publishManifestoReveal = () => {
    Object.assign(publicState, {
      semanticProgress: manifestoRevealState === "resolved" ? 1 : 0,
      manifestoActive: manifestoThresholdActive,
      manifestoSettled: manifestoRevealState === "resolved",
      manifestoRevealState,
      manifestoRevealDurationMs: manifestoRevealState === "resolved" && manifestoRevealStartedAt > 0
        ? rounded(performance.now() - manifestoRevealStartedAt, 1)
        : 0,
    });
  };
  const resolveManifestoReveal = () => {
    if (!manifestoThresholdActive || manifestoRevealState === "resolved") return;
    if (manifestoAnimationFrame) window.cancelAnimationFrame(manifestoAnimationFrame);
    manifestoAnimationFrame = 0;
    manifestoRevealState = "resolved";
    shell.dataset.manifestoReveal = "resolved";
    publishManifestoReveal();
  };
  const setManifestoReveal = (active: boolean) => {
    manifestoThresholdActive = active;
    if (!active) {
      if (manifestoAnimationFrame) window.cancelAnimationFrame(manifestoAnimationFrame);
      manifestoAnimationFrame = 0;
      manifestoRevealState = "hidden";
      shell.dataset.manifestoReveal = "hidden";
      publishManifestoReveal();
      return;
    }
    if (manifestoRevealState !== "hidden") {
      publishManifestoReveal();
      return;
    }
    manifestoRevealState = "armed";
    shell.dataset.manifestoReveal = "armed";
    publishManifestoReveal();
    manifestoAnimationFrame = window.requestAnimationFrame(() => {
      manifestoAnimationFrame = 0;
      if (!manifestoThresholdActive || manifestoRevealState !== "armed") return;
      manifestoRevealStartedAt = performance.now();
      manifestoRevealState = "revealing";
      shell.dataset.manifestoReveal = "revealing";
      publishManifestoReveal();
    });
  };
  const replayManifestoAfterNativeHomeNavigation = () => {
    root.dataset.cinematicEntryIntent = "pending";
    semanticEntryNavigationResolved = true;
    setManifestoReveal(false);
    if (manifestoNavigationFrame) return;
    manifestoNavigationFrame = window.requestAnimationFrame(() => {
      manifestoNavigationFrame = 0;
      if (window.location.hash !== "#entry") return;
      schedule();
    });
  };

  const measure = () => {
    headerHeight = header.getBoundingClientRect().height;
    shell.style.setProperty("--cinematic-header-px", `${headerHeight.toFixed(2)}px`);
    shellTop = shell.getBoundingClientRect().top + window.scrollY;
    entryTop = entry.getBoundingClientRect().top + window.scrollY;
    if (committedTravel === 0) {
      committedTravel = Math.max(entryTop - headerHeight - shellTop, 1);
      shell.style.setProperty("--cinematic-travel-px", `${committedTravel.toFixed(2)}px`);
      entryTop = entry.getBoundingClientRect().top + window.scrollY;
    }
    audienceTop = audienceRouting.getBoundingClientRect().top + window.scrollY;
    travel = Math.max(entryTop - headerHeight - shellTop, 1);
    needsMeasurement = false;
  };
  const requestCurrentFrame = (replacePending = false) => {
    if (!metadataReady || mediaFailed || failed || document.hidden || (!replacePending && video.seeking) || targetPhysicalFrame === latestPhysicalFrame) return;
    latestPhysicalFrame = targetPhysicalFrame;
    try { video.pause(); video.currentTime = targetTime; } catch { failOpen("seek"); }
  };
  const maybeReleaseEntryIntentGuard = () => {
    if (
      root.dataset.cinematicEntryIntent === "pending"
      && semanticEntryNavigationResolved
      && mediaReady
      && presentedPhysicalFrame === targetPhysicalFrame
    ) delete root.dataset.cinematicEntryIntent;
  };
  const publishPresentedFrame = () => {
    shell.dataset.presentedFrame = String(presentedPhysicalFrame);
    Object.assign(publicState, { presentedFrame: presentedPhysicalFrame });
    maybeReleaseEntryIntentGuard();
  };
  const targetFrame = (frame: number, replacePending = false) => {
    targetPhysicalFrame = Math.min(PHYSICAL_FRAME_COUNT, Math.max(1, Math.floor(frame)));
    targetTime = (targetPhysicalFrame - 1) / FRAME_RATE;
    requestCurrentFrame(replacePending);
  };
  const frameAtTime = (time: number) => Math.min(PHYSICAL_FRAME_COUNT, Math.max(1, Math.floor(time * FRAME_RATE + 0.001) + 1));
  const write = () => {
    if (failed || document.hidden) return;
    rememberCommittedMethodGeometry();
    if (needsMeasurement) measure();
    const scrollExtent = Math.max(1, Math.round(travel));
    const nativeScrollY = window.scrollY;
    currentScrollOffset = Math.min(scrollExtent, Math.max(0, Math.round(nativeScrollY - shellTop)));
    const documentState = cinematicDocumentStateForScroll(currentScrollOffset, scrollExtent, initialFamily, initialShortDesktop);
    const { scrollProgress, conceptualCoordinate, conceptualFrame, black, blackBreath, semantic, settled, phase } = documentState;
    const manifestoActive = semantic === 1;
    const cinematicProgress = conceptualCoordinate / CONCEPTUAL_FRAME_COUNT;
    scrollTargetPhysicalFrame = documentState.physicalFrame;
    const segment = cinematicSegmentForCoordinate(conceptualCoordinate);
    if (mediaFailed) {
      targetPhysicalFrame = scrollTargetPhysicalFrame;
      targetTime = (targetPhysicalFrame - 1) / FRAME_RATE;
    } else targetFrame(scrollTargetPhysicalFrame, true);
    // u=[500,513) is browser-owned digital black; semantic ENTRY begins at u=513.
    shell.style.setProperty("--cinematic-progress", scrollProgress.toFixed(4));
    shell.style.setProperty("--cinematic-film-progress", cinematicProgress.toFixed(4));
    shell.style.setProperty("--cinematic-black", black.toFixed(4));
    shell.style.setProperty("--cinematic-black-breath", blackBreath.toFixed(4));
    shell.style.setProperty("--manifesto-anchor-px", `${Math.min(0, currentScrollOffset - scrollExtent).toFixed(2)}px`);
    shell.style.setProperty("--cinematic-media-ready", mediaReady && !mediaFailed ? "1" : "0");
    shell.dataset.cinematicPhase = phase;
    shell.dataset.scrollProgress = scrollProgress.toFixed(4);
    shell.dataset.cinematicProgress = cinematicProgress.toFixed(4);
    shell.dataset.conceptualCoordinate = conceptualCoordinate.toFixed(4);
    shell.dataset.conceptualFrame = String(conceptualFrame);
    shell.dataset.cinematicSegment = segment;
    shell.dataset.targetFrame = String(targetPhysicalFrame);
    shell.dataset.targetTime = targetTime.toFixed(4);
    if (manifestoActive) semanticEntryNavigationResolved = true;
    setManifestoReveal(manifestoActive);
    maybeReleaseEntryIntentGuard();
    const navigationReleasePoint = audienceTop - window.innerHeight;
    const navigationReleased = settled && nativeScrollY >= navigationReleasePoint;
    setThresholdInteraction(manifestoActive, navigationReleased);
    persistRestorationState(settled);
    requestCurrentFrame();
    Object.assign(publicState, { mode: root.dataset.cinematicMode ?? "enhanced", scrollProgress: rounded(scrollProgress), cinematicProgress: rounded(cinematicProgress), conceptualFrame, targetFrame: targetPhysicalFrame, targetTime: rounded(targetTime), blackProgress: rounded(black), mediaReady, segment, scrollOffset: currentScrollOffset, presentedFrame: presentedPhysicalFrame, manifestoActive, navigationReleased });
  };
  const schedule = () => {
    if (animationFrame || document.hidden || failed) return;
    animationFrame = requestAnimationFrame(() => { animationFrame = 0; write(); });
  };
  const invalidate = () => {
    needsMeasurement = true;
    if (!portalFits()) failOpen("typography-fit");
    else schedule();
  };
  const revealUsableFrame = () => {
    if (failed || mediaFailed || !metadataReady || Math.abs(video.currentTime - targetTime) > 2 / FRAME_RATE) return;
    mediaReady = true;
    shell.dataset.mediaState = "ready";
    clearTimer();
    maybeReleaseEntryIntentGuard();
    schedule();
  };
  const handleSkip = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    pauseDecoder();
    semanticHomeClickPending = window.location.hash !== "#entry";
    shell.style.setProperty("--cinematic-progress", "1");
    shell.style.setProperty("--cinematic-film-progress", "1");
    shell.style.setProperty("--cinematic-black", "1");
    shell.style.setProperty("--manifesto-anchor-px", "0px");
    shell.dataset.cinematicPhase = "settled";
    root.dataset.cinematicEntryIntent = "pending";
    semanticEntryNavigationResolved = true;
    setManifestoReveal(true);
    resolveManifestoReveal();
    maybeReleaseEntryIntentGuard();
    setThresholdInteraction(true, false);
    persistRestorationState(true);
    entry.focus({ preventScroll: true });
  };
  const loadSelectedMedia = async () => {
    try {
      const { source, asset } = await selectedMediaSource(initialFamily, codec, mediaAbortController.signal);
      if (failed || mediaAbortController.signal.aborted) return;
      shell.dataset.mediaSource = source;
      const response = await fetch(source, { cache: "force-cache", signal: mediaAbortController.signal });
      if (!response.ok) throw new Error(`media response ${response.status}`);
      const blob = await response.blob();
      if (blob.size !== asset.bytes || blob.type.split(";", 1)[0] !== "video/mp4") throw Error("media");
      objectUrl = URL.createObjectURL(blob);
      video.src = objectUrl;
      video.load();
    } catch {
      if (!mediaAbortController.signal.aborted) failOpen("media");
    }
  };

  const resizeObserver = new ResizeObserver(invalidate);
  resizeObserver.observe(shell);
  resizeObserver.observe(entry);
  resizeObserver.observe(audienceRouting);
  if (methodField) resizeObserver.observe(methodField);
  window.addEventListener("scroll", schedule, { passive: true, signal });
  window.addEventListener("resize", invalidate, { passive: true, signal });
  window.addEventListener("pageshow", invalidate, { passive: true, signal });
  for (const link of semanticHomeLinks) {
    link.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      semanticHomeClickPending = window.location.hash !== "#entry";
      replayManifestoAfterNativeHomeNavigation();
    }, { signal });
  }
  window.addEventListener("hashchange", () => {
    if (window.location.hash !== "#entry") {
      semanticHomeClickPending = false;
      return;
    }
    if (semanticHomeClickPending) {
      semanticHomeClickPending = false;
      return;
    }
    replayManifestoAfterNativeHomeNavigation();
  }, { signal });
  skipLink.addEventListener("click", handleSkip, { signal });
  manifestoContent.addEventListener("transitionend", (event) => {
    if (event.target === manifestoContent && event.propertyName === "opacity" && manifestoRevealState === "revealing") {
      resolveManifestoReveal();
    }
  }, { signal });
  motion.addEventListener("change", () => { if (motion.matches) failOpen("reduced-motion-change"); }, { signal });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      if (manifestoThresholdActive) resolveManifestoReveal();
      else if (manifestoAnimationFrame) cancelAnimationFrame(manifestoAnimationFrame);
      manifestoAnimationFrame = 0;
      if (manifestoNavigationFrame) cancelAnimationFrame(manifestoNavigationFrame);
      manifestoNavigationFrame = 0;
      pauseDecoder();
    }
    else invalidate();
  }, { signal });
  video.addEventListener("loadedmetadata", () => { metadataReady = true; requestCurrentFrame(); }, { signal });
  video.addEventListener("loadeddata", revealUsableFrame, { signal });
  video.addEventListener("seeked", () => {
    presentedPhysicalFrame = frameAtTime(video.currentTime);
    publishPresentedFrame();
    revealUsableFrame();
    // A seek that completed after newer input immediately yields to the latest
    // document-derived target. No playback clock or directional latch exists.
    requestCurrentFrame();
  }, { signal });
  video.addEventListener("error", () => failOpen("media"), { signal });
  void fonts?.ready.then(() => { fontsReady = true; invalidate(); });
  window.addEventListener("pagehide", (event) => {
    semanticHomeClickPending = false;
    persistRestorationState(shell.dataset.cinematicPhase === "settled" || window.scrollY >= entryTop - headerHeight - 1);
    if (manifestoThresholdActive || (window.location.hash === "#entry" && window.scrollY >= entryTop - headerHeight - 1)) {
      manifestoThresholdActive = true;
      resolveManifestoReveal();
    }
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    if (manifestoAnimationFrame) cancelAnimationFrame(manifestoAnimationFrame);
    manifestoAnimationFrame = 0;
    if (manifestoNavigationFrame) cancelAnimationFrame(manifestoNavigationFrame);
    manifestoNavigationFrame = 0;
    pauseDecoder();
    if (event.persisted) return;
    clearTimer(); releaseMedia(); resizeObserver.disconnect(); abortController.abort();
  }, { signal });
  loadTimer = window.setTimeout(() => { if (!mediaReady) failOpen(metadataReady ? "decode-timeout" : "load-timeout"); }, LOAD_TIMEOUT_MS);
  void loadSelectedMedia();
  measure();
  write();
}

declare global {
  interface Window {
    quantumPhase4?: Readonly<{
      mode: string; mediaFamily: MediaFamily; codec: Codec; delivery: "blob"; scrollProgress: number;
      cinematicProgress: number; conceptualFrame: number; targetFrame: number; targetTime: number;
      blackProgress: number; semanticProgress: number; mediaReady: boolean; control: "scroll-addressed";
      segment: CinematicSegmentId; scrollOffset: number; presentedFrame: number;
      manifestoActive: boolean; manifestoSettled: boolean;
      manifestoRevealState: "hidden" | "armed" | "revealing" | "resolved";
      manifestoRevealDurationMs: number; navigationReleased: boolean;
    }>;
  }
}
