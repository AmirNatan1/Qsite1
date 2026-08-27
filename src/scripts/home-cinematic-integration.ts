export type MediaFamily = "desktop" | "portrait" | "landscape";
export type Codec = "vp9" | "h264";

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
const LOAD_TIMEOUT_MS = 12_000;
const MAX_ASSET_BYTES = 25 * 1024 * 1024;
const SOURCE_BLEND_SHA256 = "b0c9c7c1cf5a1642870cf03a36791cc50ec31ac207aeae794fbea83c856a79c0";
const MANIFEST_PATH = "/media/cinematic/phase-4r2/manifests/phase-4r2-production-media-manifest.json";
const MEDIA_ROOT = "/media/cinematic/phase-4r2/";

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const rounded = (value: number, digits = 4) => Number(value.toFixed(digits));
const mix = (start: number, end: number, progress: number) => start + (end - start) * progress;
const smoothstep = (value: number) => {
  const progress = clamp(value);
  return progress * progress * (3 - 2 * progress);
};

function interpolatePiecewise(value: number, input: readonly number[], output: readonly number[]) {
  const progress = clamp(value);
  for (let index = 1; index < input.length; index += 1) {
    const inputStart = input[index - 1]!;
    const inputEnd = input[index]!;
    const outputStart = output[index - 1]!;
    const outputEnd = output[index]!;
    if (progress <= inputEnd) return mix(outputStart, outputEnd, (progress - inputStart) / Math.max(inputEnd - inputStart, Number.EPSILON));
  }
  return output.at(-1) ?? 1;
}

/** Maps native document travel to the approved conceptual 540-frame timeline. */
export function mapCinematicProgress(scrollProgress: number, family: MediaFamily, shortDesktop: boolean) {
  const output = [0, 0.1, 0.42, 0.78, 1] as const;
  if (family === "portrait" || family === "landscape") {
    return interpolatePiecewise(scrollProgress, [0, 0.04, 0.3267, 0.6133, 1], output);
  }
  return interpolatePiecewise(
    scrollProgress,
    shortDesktop ? [0, 0.0358, 0.3343, 0.6269, 1] : [0, 0.0411, 0.3425, 0.6301, 1],
    output,
  );
}

/** The selected cohort is intentionally locked on initial load. */
export function chooseFamily(width: number, height: number): MediaFamily {
  if (width <= 800 && height > width) return "portrait";
  if (width <= 900 && height <= 480 && width > height) return "landscape";
  return "desktop";
}

export function travelViewportHeights(family: MediaFamily, shortDesktop: boolean) {
  if (family === "portrait") return 4.85;
  if (family === "landscape") return 5.1;
  return shortDesktop ? 5.45 : 6.25;
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

function chooseCodec(video: HTMLVideoElement): Codec | null {
  if (video.canPlayType('video/webm; codecs="vp09.00.10.08"') === "probably") return "vp9";
  const h264 = video.canPlayType('video/mp4; codecs="avc1.640028"') || video.canPlayType('video/mp4; codecs="avc1.42E01E"');
  return h264 ? "h264" : null;
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
  if (
    manifest.schema !== "quantum-hub.phase-4-r2.production-media-manifest.v1"
    || manifest.sourceBlendSha256 !== SOURCE_BLEND_SHA256
    || manifest.physicalTimeline?.frames !== PHYSICAL_FRAME_COUNT
    || manifest.physicalTimeline?.fps !== FRAME_RATE
    || manifest.physicalTimeline?.durationRational !== "50/3"
    || manifest.authorization?.mergeMain !== false
    || manifest.authorization?.phase5 !== false
    || !Array.isArray(manifest.assets)
    || manifest.assets.length !== 9
  ) throw 0;
  const selected = manifest.assets.filter((asset) => asset.kind === "video" && asset.family === family && asset.codec === codec);
  const asset = selected[0];
  const extension = codec === "vp9" ? "webm" : "mp4";
  if (
    selected.length !== 1
    || !asset
    || !Number.isInteger(asset.bytes)
    || (asset.bytes ?? 0) <= 0
    || (asset.bytes ?? MAX_ASSET_BYTES) >= MAX_ASSET_BYTES
    || !isSha256(asset.sha256)
    || asset.file !== `media/phase-4r2-${family}-${codec}-${asset.sha256.slice(0, 12)}.${extension}`
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
  const entryContent = shell?.querySelector<HTMLElement>(".entry-field__content");
  const header = document.querySelector<HTMLElement>(".site-header");
  const skipLink = document.querySelector<HTMLAnchorElement>(".skip-link[href='#entry']");
  const mobileMenu = header?.querySelector<HTMLDetailsElement>("[data-mobile-nav]");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const releaseMissingDom = () => {
    root.dataset.cinematicFallback = "required-dom";
    root.dataset.cinematicEligibility = "bypass";
    root.dataset.cinematicMode = "static";
    root.dataset.cinematicHeader = "released";
    document.querySelector<HTMLElement>(".site-header")?.removeAttribute("inert");
    document.querySelector<HTMLElement>("#entry")?.removeAttribute("inert");
    if (shell) {
      shell.dataset.cinematicInteractive = "true";
      shell.dataset.cinematicPhase = "fallback";
      shell.dataset.mediaState = "failed";
    }
  };
  if (!shell || !stage || !video || !entry || !entryContent || !header || !skipLink) {
    releaseMissingDom();
    return;
  }
  if (root.dataset.cinematicMode !== "candidate") return;

  const abortController = new AbortController();
  const mediaAbortController = new AbortController();
  const { signal } = abortController;
  const initialFamily = chooseFamily(window.innerWidth, window.innerHeight);
  const initialShortDesktop = initialFamily === "desktop" && window.innerHeight < 704;
  const authoredTravel = window.innerHeight * travelViewportHeights(initialFamily, initialShortDesktop);
  const codec = chooseCodec(video);
  let animationFrame = 0;
  let loadTimer = 0;
  let metadataReady = false;
  let mediaReady = false;
  let failed = false;
  let latestPhysicalFrame = -1;
  let targetPhysicalFrame = 1;
  let targetTime = 0;
  let objectUrl: string | null = null;
  let needsMeasurement = true;
  let shellTop = 0;
  let entryTop = 1;
  let headerHeight = 0;
  let travel = 1;
  let persistedSettledState: boolean | null = null;

  const clearTimer = () => {
    if (loadTimer) window.clearTimeout(loadTimer);
    loadTimer = 0;
  };
  const releaseMedia = () => {
    mediaAbortController.abort();
    video.pause();
    video.removeAttribute("src");
    video.load();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  };
  const persistRestorationState = (settledOrLower: boolean) => {
    if (persistedSettledState === settledOrLower) return;
    try {
      history.replaceState({ ...(history.state && typeof history.state === "object" ? history.state : {}), quantumHomeCinematic: { version: 1, settledOrLower } }, document.title);
      persistedSettledState = settledOrLower;
    } catch { /* History state is advisory. */ }
  };
  const setSettledInteraction = (settled: boolean) => {
    if (settled) {
      header.removeAttribute("inert");
      entry.removeAttribute("inert");
      root.dataset.cinematicHeader = "released";
      shell.dataset.cinematicInteractive = "true";
      return;
    }
    mobileMenu?.removeAttribute("open");
    const focused = document.activeElement;
    if (focused instanceof Node && (header.contains(focused) || entry.contains(focused))) skipLink.focus({ preventScroll: true });
    header.setAttribute("inert", "");
    entry.setAttribute("inert", "");
    root.dataset.cinematicHeader = "concealed";
    shell.dataset.cinematicInteractive = "false";
  };
  const clearCinematicStyles = () => {
    for (const property of ["--cinematic-header-px", "--cinematic-travel-px", "--cinematic-progress", "--cinematic-film-progress", "--cinematic-black", "--cinematic-black-breath", "--cinematic-semantic", "--cinematic-media-ready"]) shell.style.removeProperty(property);
    root.style.removeProperty("--cinematic-semantic");
  };
  const failOpen = (reason: string) => {
    if (failed) return;
    failed = true;
    clearTimer();
    releaseMedia();
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    root.dataset.cinematicFallback = reason;
    root.dataset.cinematicEligibility = "bypass";
    root.dataset.cinematicMode = "static";
    shell.dataset.mediaState = "failed";
    shell.dataset.cinematicPhase = "fallback";
    setSettledInteraction(true);
    clearCinematicStyles();
  };
  const portalFits = () => {
    if (zoomMakesPortalUnsafe() || window.innerHeight < 320) return false;
    const anchors = [entryContent.querySelector<HTMLElement>("h1"), entryContent.querySelector<HTMLElement>(".entry-paths")];
    return anchors.every((anchor) => {
      if (!anchor) return false;
      const bounds = anchor.getBoundingClientRect();
      return bounds.left >= -3 && bounds.right <= window.innerWidth + 3;
    }) && Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= window.innerWidth + 3;
  };

  if (motion.matches || !codec || !portalFits()) {
    failOpen(motion.matches ? "reduced-motion" : codec ? "typography-fit" : "codec");
    return;
  }

  const publicState = {
    mode: "enhanced", mediaFamily: initialFamily, codec, delivery: "blob" as const,
    scrollProgress: 0, cinematicProgress: 0, conceptualFrame: 1, targetFrame: 1, targetTime: 0,
    blackProgress: 0, semanticProgress: 0, mediaReady: false,
  };
  window.quantumPhase4 = publicState;
  root.dataset.cinematicMode = "enhanced";
  shell.dataset.mediaFamily = initialFamily;
  shell.dataset.mediaCodec = codec;
  shell.dataset.mediaDelivery = "blob";
  shell.dataset.mediaState = "loading";
  video.preload = "auto";

  const measure = () => {
    headerHeight = header.getBoundingClientRect().height;
    shell.style.setProperty("--cinematic-header-px", `${headerHeight.toFixed(2)}px`);
    shell.style.setProperty("--cinematic-travel-px", `${authoredTravel.toFixed(2)}px`);
    shellTop = shell.getBoundingClientRect().top + window.scrollY;
    entryTop = entry.getBoundingClientRect().top + window.scrollY;
    travel = Math.max(entryTop - headerHeight - shellTop, 1);
    needsMeasurement = false;
  };
  const requestCurrentFrame = () => {
    if (!metadataReady || failed || document.hidden || video.seeking || targetPhysicalFrame === latestPhysicalFrame) return;
    latestPhysicalFrame = targetPhysicalFrame;
    try { video.pause(); video.currentTime = targetTime; } catch { failOpen("seek"); }
  };
  const write = () => {
    if (failed || document.hidden) return;
    if (needsMeasurement) measure();
    const scrollProgress = clamp((window.scrollY - shellTop) / travel);
    const cinematicProgress = mapCinematicProgress(scrollProgress, initialFamily, initialShortDesktop);
    const conceptualCoordinate = conceptualCoordinateFor(cinematicProgress);
    const conceptualFrame = conceptualFrameFor(cinematicProgress);
    targetPhysicalFrame = physicalFrameFor(conceptualCoordinate);
    targetTime = (targetPhysicalFrame - 1) / FRAME_RATE;
    // u=[500,513) is browser-owned digital black; semantic ENTRY begins at u=513.
    const black = conceptualCoordinate >= BLACK_START_U ? 1 : 0;
    const blackOffset = conceptualCoordinate - BLACK_START_U;
    const blackBreath = blackOffset >= 0 && blackOffset < BLACK_FRAME_COUNT
      ? 0.5 - 0.5 * Math.cos((blackOffset / BLACK_FRAME_COUNT) * Math.PI * 2)
      : 0;
    const semantic = smoothstep((conceptualCoordinate - ENTRY_START_U) / (CONCEPTUAL_FRAME_COUNT - ENTRY_START_U));
    shell.style.setProperty("--cinematic-progress", scrollProgress.toFixed(4));
    shell.style.setProperty("--cinematic-film-progress", cinematicProgress.toFixed(4));
    shell.style.setProperty("--cinematic-black", black.toFixed(4));
    shell.style.setProperty("--cinematic-black-breath", blackBreath.toFixed(4));
    shell.style.setProperty("--cinematic-semantic", semantic.toFixed(4));
    shell.style.setProperty("--cinematic-media-ready", mediaReady ? "1" : "0");
    root.style.setProperty("--cinematic-semantic", semantic.toFixed(4));
    const settled = scrollProgress >= 0.9995;
    shell.dataset.cinematicPhase = settled ? "settled" : conceptualCoordinate >= ENTRY_START_U ? "entry" : conceptualCoordinate >= BLACK_START_U ? "black" : "physical";
    shell.dataset.scrollProgress = scrollProgress.toFixed(4);
    shell.dataset.cinematicProgress = cinematicProgress.toFixed(4);
    shell.dataset.conceptualCoordinate = conceptualCoordinate.toFixed(4);
    shell.dataset.conceptualFrame = String(conceptualFrame);
    shell.dataset.targetFrame = String(targetPhysicalFrame);
    shell.dataset.targetTime = targetTime.toFixed(4);
    setSettledInteraction(settled);
    persistRestorationState(settled);
    requestCurrentFrame();
    Object.assign(publicState, { mode: root.dataset.cinematicMode ?? "enhanced", scrollProgress: rounded(scrollProgress), cinematicProgress: rounded(cinematicProgress), conceptualFrame, targetFrame: targetPhysicalFrame, targetTime: rounded(targetTime), blackProgress: rounded(black), semanticProgress: rounded(semantic), mediaReady });
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
    if (failed || !metadataReady || Math.abs(video.currentTime - targetTime) > 2 / FRAME_RATE) return;
    mediaReady = true;
    shell.dataset.mediaState = "ready";
    clearTimer();
    schedule();
  };
  const handleSkip = () => {
    shell.style.setProperty("--cinematic-progress", "1");
    shell.style.setProperty("--cinematic-film-progress", "1");
    shell.style.setProperty("--cinematic-black", "1");
    shell.style.setProperty("--cinematic-semantic", "1");
    root.style.setProperty("--cinematic-semantic", "1");
    shell.dataset.cinematicPhase = "settled";
    shell.dataset.cinematicInteractive = "true";
    setSettledInteraction(true);
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
      const expectedMime = codec === "vp9" ? "video/webm" : "video/mp4";
      if (blob.size !== asset.bytes || blob.type.split(";", 1)[0] !== expectedMime) throw Error("media");
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
  window.addEventListener("scroll", schedule, { passive: true, signal });
  window.addEventListener("resize", invalidate, { passive: true, signal });
  window.addEventListener("pageshow", invalidate, { passive: true, signal });
  skipLink.addEventListener("click", handleSkip, { signal });
  motion.addEventListener("change", () => { if (motion.matches) failOpen("reduced-motion-change"); }, { signal });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { if (animationFrame) cancelAnimationFrame(animationFrame); animationFrame = 0; video.pause(); }
    else invalidate();
  }, { signal });
  video.addEventListener("loadedmetadata", () => { metadataReady = true; requestCurrentFrame(); }, { signal });
  video.addEventListener("loadeddata", revealUsableFrame, { signal });
  video.addEventListener("seeked", () => { revealUsableFrame(); requestCurrentFrame(); }, { signal });
  video.addEventListener("error", () => failOpen("media"), { signal });
  void document.fonts?.ready.then(invalidate);
  window.addEventListener("pagehide", (event) => {
    persistRestorationState(shell.dataset.cinematicPhase === "settled" || window.scrollY >= entryTop - headerHeight - 1);
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    video.pause();
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
      blackProgress: number; semanticProgress: number; mediaReady: boolean;
    }>;
  }
}
