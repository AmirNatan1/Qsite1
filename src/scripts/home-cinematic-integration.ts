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
export const FIRST_CHANGED_FRAME = 46;
export const ARRIVAL_FRAME = 285;
export const STABLE_Q_FRAME = 370;
export const WAKE_DURATION_SECONDS = (STABLE_Q_FRAME - ARRIVAL_FRAME) / FRAME_RATE;
const FIRST_CHANGED_U = FIRST_CHANGED_FRAME - 1;
const ARRIVAL_U = ARRIVAL_FRAME - 1;
const STABLE_Q_U = STABLE_Q_FRAME - 1;
const ARRIVAL_TIME = ARRIVAL_U / FRAME_RATE;
const STABLE_Q_TIME = STABLE_Q_U / FRAME_RATE;
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

function scrollAnchors(family: MediaFamily, shortDesktop: boolean) {
  if (family === "portrait" || family === "landscape") {
    return [0, 0.04, 0.3267, 0.6133, 1] as const;
  }
  return shortDesktop ? [0, 0.0358, 0.3343, 0.6269, 1] as const : [0, 0.0411, 0.3425, 0.6301, 1] as const;
}

export function arrivalScrollProgress(family: MediaFamily, shortDesktop: boolean) {
  const input = scrollAnchors(family, shortDesktop);
  return mix(input[2], input[3], ((ARRIVAL_U / CONCEPTUAL_FRAME_COUNT) - 0.42) / 0.36);
}

export function arrivalScrollOffset(travel: number, family: MediaFamily, shortDesktop: boolean) {
  return Math.max(1, Math.round(Math.max(1, travel) * arrivalScrollProgress(family, shortDesktop)));
}

/** Exact top is F1; every positive integer scroll offset enters visible F46+. */
export function conceptualCoordinateForScroll(scrollOffset: number, travel: number, family: MediaFamily, shortDesktop: boolean) {
  const extent = Math.max(1, Math.round(travel));
  const offset = Math.min(extent, Math.max(0, Math.round(scrollOffset)));
  if (offset === 0) return 0;
  const input = scrollAnchors(family, shortDesktop);
  const arrival = arrivalScrollOffset(extent, family, shortDesktop);
  const anchors = input.map((value) => Math.round(value * extent));
  if (offset < arrival) return interpolatePiecewise(offset / arrival, [0, anchors[1]! / arrival, anchors[2]! / arrival, 1], [FIRST_CHANGED_U, 54, 226.8, ARRIVAL_U]);
  if (offset === arrival) return ARRIVAL_U;
  const postExtent = Math.max(extent - arrival - 1, 1);
  return interpolatePiecewise((offset - arrival - 1) / postExtent, [0, Math.max(0, anchors[3]! - arrival - 1) / postExtent, 1], [STABLE_Q_U + 1, 421.2, CONCEPTUAL_FRAME_COUNT]);
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

export function arrivalCrossingDirection(previousOffset: number, currentOffset: number, arrivalOffset: number, geometryChanged = false): -1 | 0 | 1 {
  if (geometryChanged) return 0;
  if (previousOffset < arrivalOffset && currentOffset >= arrivalOffset) return 1;
  if (previousOffset > arrivalOffset && currentOffset <= arrivalOffset) return -1;
  return 0;
}

export function scrollIntentFor(eventSequence: number, handledSequence: number, previousScrollY: number, currentScrollY: number, previousOffset: number, currentOffset: number, arrivalOffset: number) {
  const observed = eventSequence !== handledSequence;
  return {
    observed,
    direction: (observed ? Math.sign(currentScrollY - previousScrollY) : 0) as -1 | 0 | 1,
    arrivalCrossing: arrivalCrossingDirection(previousOffset, currentOffset, arrivalOffset, !observed),
  };
}

export type ReactionState = "pending" | "pre-arrival" | "wake-armed" | "wake-forward" | "stable-hold" | "post-arrival" | "wake-reverse" | "failed";
export type ReactionEvent = "READY_PRE" | "RESTORE_POST" | "ARRIVE" | "ARRIVAL_PRESENTED" | "STABLE_PRESENTED" | "OUTRUN" | "RETREAT" | "UNWOUND" | "FAIL";

export function transitionReaction(state: ReactionState, event: ReactionEvent): ReactionState {
  if (event === "FAIL") return "failed";
  if (event === "RESTORE_POST" || event === "OUTRUN") return "post-arrival";
  if (event === "READY_PRE" || event === "UNWOUND") return "pre-arrival";
  if (event === "ARRIVE" && (state === "pre-arrival" || state === "wake-reverse")) return "wake-armed";
  if (event === "ARRIVAL_PRESENTED" && state === "wake-armed") return "wake-forward";
  if (event === "STABLE_PRESENTED" && state === "wake-forward") return "stable-hold";
  if (event === "RETREAT" && ["wake-armed", "wake-forward", "stable-hold", "post-arrival"].includes(state)) return "wake-reverse";
  return state;
}

export type ReactionDecisionEvent = "GEOMETRY" | "CROSS_FORWARD" | "FORWARD" | "REVERSE" | "PRESENTED" | "SKIP" | "SUSPEND_PRE" | "SUSPEND_POST" | "FAIL";
export type ReactionCommand = "none" | "arm" | "play" | "stop-stable" | "seek-latest" | "reverse" | "cancel" | "fail";
export type ReactionDecisionInput = {
  state: ReactionState;
  event: ReactionDecisionEvent;
  presentedFrame: number;
  requestedFrame: number;
  scrollTargetFrame: number;
};

/** Pure arbitration authority. Requested/pending frames never become reverse anchors. */
export function decideReaction(input: ReactionDecisionInput): { state: ReactionState; command: ReactionCommand; reverseStartFrame: number } {
  const actual = Math.min(PHYSICAL_FRAME_COUNT, Math.max(1, Math.floor(input.presentedFrame)));
  const idle = (state = input.state, command: ReactionCommand = "none") => ({ state, command, reverseStartFrame: actual });
  if (input.event === "FAIL") return idle("failed", "fail");
  if (input.event === "SKIP" || input.event === "SUSPEND_POST") return idle("post-arrival", "cancel");
  if (input.event === "SUSPEND_PRE") return idle("pre-arrival", "cancel");
  if (input.event === "GEOMETRY") return idle();
  if (input.event === "PRESENTED") {
    if (input.state === "wake-armed" && actual === ARRIVAL_FRAME) return idle("wake-forward", "play");
    if (input.state === "wake-forward" && actual >= STABLE_Q_FRAME) return idle("stable-hold", "stop-stable");
    return idle();
  }
  if (input.event === "CROSS_FORWARD" && (input.state === "pre-arrival" || input.state === "wake-reverse")) return idle("wake-armed", "arm");
  if (input.event === "FORWARD" && ["wake-armed", "wake-forward", "stable-hold"].includes(input.state) && input.scrollTargetFrame > ARRIVAL_FRAME) return idle("post-arrival", "seek-latest");
  if (input.event === "REVERSE" && ["wake-armed", "wake-forward", "stable-hold", "post-arrival", "wake-reverse"].includes(input.state)) {
    if (input.scrollTargetFrame >= actual) return idle(input.scrollTargetFrame > ARRIVAL_FRAME ? "post-arrival" : "pre-arrival", "seek-latest");
    return idle("wake-reverse", "reverse");
  }
  return idle();
}

export function reverseFrameForElapsed(startFrame: number, floorFrame: number, elapsedSeconds: number) {
  const start = Math.min(PHYSICAL_FRAME_COUNT, Math.max(1, Math.floor(startFrame)));
  const floor = Math.min(start, Math.max(1, Math.floor(floorFrame)));
  const elapsed = Math.max(0, elapsedSeconds);
  if (start <= ARRIVAL_FRAME) return Math.max(floor, start - Math.floor(elapsed * 90));
  const postFrames = Math.max(0, start - STABLE_Q_FRAME);
  const authoredStart = Math.min(start, STABLE_Q_FRAME);
  const postSeconds = postFrames / 90;
  const authoredSeconds = (authoredStart - ARRIVAL_FRAME) / FRAME_RATE;
  if (elapsed < postSeconds) return Math.max(floor, start - Math.floor(elapsed * 90));
  if (elapsed < postSeconds + authoredSeconds) return Math.max(floor, authoredStart - Math.floor((elapsed - postSeconds) * FRAME_RATE));
  return Math.max(floor, ARRIVAL_FRAME - Math.floor((elapsed - postSeconds - authoredSeconds) * 90));
}

export type ReversePlan = { startFrame: number; floorFrame: number; startedAt: number };

/** Later retreat input may extend the floor, but it must not starve the active reverse clock. */
export function reviseReversePlan(current: ReversePlan | null, presentedFrame: number, targetFrame: number, now: number, replaceFloor = false): ReversePlan {
  const actual = Math.min(PHYSICAL_FRAME_COUNT, Math.max(1, Math.floor(presentedFrame)));
  const floor = Math.min(actual, Math.max(1, Math.floor(targetFrame)));
  if (!current) return { startFrame: actual, floorFrame: floor, startedAt: now };
  return { ...current, floorFrame: replaceFloor ? Math.min(current.startFrame, floor) : Math.min(current.floorFrame, floor) };
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
  let scrollTargetPhysicalFrame = 1;
  let presentedPhysicalFrame = 1;
  let currentScrollOffset = 0;
  let currentArrivalOffset = 1;
  let scrollEventSequence = 0;
  let handledScrollEventSequence = 0;
  let lastIntentScrollY = window.scrollY;
  let initialWrite = true;
  let pendingArrival = history.state?.quantumHomeCinematic?.arrivalOrBeyond === true;
  let reactionState: ReactionState = "pending";
  let reactionGeneration = 0;
  let reactionFrame = 0;
  let videoFrameCallback = 0;
  let reverseStartedAt = 0;
  let reverseStartFrame = 1;
  let reverseFloorFrame = 1;
  let persistedRestorationState = "";

  const cancelReaction = () => {
    reactionGeneration += 1;
    if (reactionFrame) window.cancelAnimationFrame(reactionFrame);
    reactionFrame = 0;
    if (videoFrameCallback && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(videoFrameCallback);
    videoFrameCallback = 0;
    video.pause();
  };

  const clearTimer = () => {
    if (loadTimer) window.clearTimeout(loadTimer);
    loadTimer = 0;
  };
  const releaseMedia = () => {
    mediaAbortController.abort();
    cancelReaction();
    video.removeAttribute("src");
    video.load();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  };
  const persistRestorationState = (settledOrLower: boolean, arrivalOrBeyond: boolean) => {
    const key = `${settledOrLower}:${arrivalOrBeyond}`;
    if (persistedRestorationState === key) return;
    try {
      history.replaceState({ ...(history.state && typeof history.state === "object" ? history.state : {}), quantumHomeCinematic: { version: 2, settledOrLower, arrivalOrBeyond } }, document.title);
      persistedRestorationState = key;
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
    reactionState = decideReaction({ state: reactionState, event: "FAIL", presentedFrame: presentedPhysicalFrame, requestedFrame: targetPhysicalFrame, scrollTargetFrame: scrollTargetPhysicalFrame }).state;
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
    blackProgress: 0, semanticProgress: 0, mediaReady: false, reactionState, presentedFrame: 1,
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
    currentArrivalOffset = arrivalScrollOffset(travel, initialFamily, initialShortDesktop);
    needsMeasurement = false;
  };
  const requestCurrentFrame = (replacePending = false) => {
    if (!metadataReady || failed || document.hidden || reactionState === "wake-forward" || (!replacePending && video.seeking) || targetPhysicalFrame === latestPhysicalFrame) return;
    latestPhysicalFrame = targetPhysicalFrame;
    try { video.pause(); video.currentTime = targetTime; } catch { failOpen("seek"); }
  };
  const publishReaction = () => {
    shell.dataset.cinematicReaction = reactionState;
    shell.dataset.presentedFrame = String(presentedPhysicalFrame);
    Object.assign(publicState, { reactionState, presentedFrame: presentedPhysicalFrame });
  };
  const targetFrame = (frame: number, replacePending = false) => {
    targetPhysicalFrame = Math.min(PHYSICAL_FRAME_COUNT, Math.max(1, Math.floor(frame)));
    targetTime = (targetPhysicalFrame - 1) / FRAME_RATE;
    requestCurrentFrame(replacePending);
  };
  const frameAtTime = (time: number) => Math.min(PHYSICAL_FRAME_COUNT, Math.max(1, Math.floor(time * FRAME_RATE + 0.001) + 1));
  const reactionDecision = (event: ReactionDecisionEvent) => decideReaction({ state: reactionState, event, presentedFrame: presentedPhysicalFrame, requestedFrame: targetPhysicalFrame, scrollTargetFrame: scrollTargetPhysicalFrame });
  const finishWake = (generation: number, observedFrame = presentedPhysicalFrame) => {
    if (generation !== reactionGeneration || reactionState !== "wake-forward") return;
    const decision = decideReaction({ state: reactionState, event: "PRESENTED", presentedFrame: observedFrame, requestedFrame: targetPhysicalFrame, scrollTargetFrame: scrollTargetPhysicalFrame });
    if (decision.command !== "stop-stable") return;
    cancelReaction();
    reactionState = decision.state;
    latestPhysicalFrame = -1;
    if (currentScrollOffset > currentArrivalOffset) {
      reactionState = decideReaction({ state: reactionState, event: "FORWARD", presentedFrame: presentedPhysicalFrame, requestedFrame: targetPhysicalFrame, scrollTargetFrame: scrollTargetPhysicalFrame }).state;
      targetFrame(scrollTargetPhysicalFrame, true);
    } else targetFrame(STABLE_Q_FRAME, true);
    publishReaction();
  };
  const watchWake = (generation: number) => {
    if (generation !== reactionGeneration || reactionState !== "wake-forward") return;
    const observe = (mediaTime: number, presentationProven: boolean) => {
      if (generation !== reactionGeneration || reactionState !== "wake-forward") return;
      const observedFrame = frameAtTime(mediaTime);
      if (presentationProven) { presentedPhysicalFrame = observedFrame; publishReaction(); }
      if (mediaTime >= STABLE_Q_TIME - 0.5 / FRAME_RATE) finishWake(generation, observedFrame);
      else watchWake(generation);
    };
    if (video.requestVideoFrameCallback) {
      videoFrameCallback = video.requestVideoFrameCallback((_now, metadata) => { videoFrameCallback = 0; observe(metadata.mediaTime, true); });
    } else {
      reactionFrame = requestAnimationFrame(() => { reactionFrame = 0; observe(video.currentTime, false); });
    }
  };
  const beginWake = () => {
    if (reactionState !== "wake-armed" || failed || document.hidden) return;
    const decision = reactionDecision("PRESENTED");
    if (decision.command !== "play") return;
    cancelReaction();
    reactionState = decision.state;
    const generation = reactionGeneration;
    publishReaction();
    const playback = video.play();
    watchWake(generation);
    void playback.catch(() => { if (generation === reactionGeneration) failOpen("playback"); });
  };
  const armWake = () => {
    const decision = reactionDecision("CROSS_FORWARD");
    if (decision.command !== "arm") return;
    cancelReaction();
    reactionState = decision.state;
    latestPhysicalFrame = -1;
    targetFrame(ARRIVAL_FRAME, true);
    publishReaction();
    if (!video.seeking && presentedPhysicalFrame === ARRIVAL_FRAME && Math.abs(video.currentTime - ARRIVAL_TIME) <= 0.5 / FRAME_RATE) beginWake();
  };
  const finishReverseIfPresented = () => {
    if (reactionState !== "wake-reverse" || targetPhysicalFrame > reverseFloorFrame || video.seeking || Math.abs(video.currentTime - targetTime) > 0.5 / FRAME_RATE) return;
    reactionState = transitionReaction(reactionState, currentScrollOffset > currentArrivalOffset ? "OUTRUN" : "UNWOUND");
    latestPhysicalFrame = -1;
    targetFrame(reactionState === "post-arrival" ? Math.max(STABLE_Q_FRAME, scrollTargetPhysicalFrame) : scrollTargetPhysicalFrame, true);
    publishReaction();
  };
  const tickReverse = (generation: number, now: number) => {
    if (generation !== reactionGeneration || reactionState !== "wake-reverse") return;
    const elapsed = (now - reverseStartedAt) / 1000;
    const frame = reverseFrameForElapsed(reverseStartFrame, reverseFloorFrame, elapsed);
    targetFrame(frame);
    if (frame <= reverseFloorFrame) { finishReverseIfPresented(); return; }
    reactionFrame = requestAnimationFrame((timestamp) => { reactionFrame = 0; tickReverse(generation, timestamp); });
  };
  const resumeReverseTick = () => {
    if (reactionState !== "wake-reverse" || reactionFrame || document.hidden) return;
    const generation = reactionGeneration;
    reactionFrame = requestAnimationFrame((timestamp) => { reactionFrame = 0; tickReverse(generation, timestamp); });
  };
  const startReverse = () => {
    const decision = reactionDecision("REVERSE");
    if (decision.command !== "reverse" && decision.command !== "seek-latest") return;
    if (reactionState === "wake-reverse" && decision.command === "reverse") {
      const plan = reviseReversePlan(
        { startFrame: reverseStartFrame, floorFrame: reverseFloorFrame, startedAt: reverseStartedAt },
        decision.reverseStartFrame,
        scrollTargetPhysicalFrame,
        performance.now(),
      );
      reverseStartFrame = plan.startFrame;
      reverseFloorFrame = plan.floorFrame;
      reverseStartedAt = plan.startedAt;
      publishReaction();
      return;
    }
    cancelReaction();
    reactionState = decision.state;
    if (decision.command === "seek-latest") {
      targetFrame(scrollTargetPhysicalFrame, true);
      publishReaction();
      return;
    }
    const plan = reviseReversePlan(null, decision.reverseStartFrame, scrollTargetPhysicalFrame, performance.now());
    reverseStartFrame = plan.startFrame;
    reverseFloorFrame = plan.floorFrame;
    reverseStartedAt = plan.startedAt;
    latestPhysicalFrame = -1;
    targetFrame(reverseStartFrame, true);
    publishReaction();
    const generation = reactionGeneration;
    reactionFrame = requestAnimationFrame((timestamp) => { reactionFrame = 0; tickReverse(generation, timestamp); });
  };
  const restorePostArrival = () => {
    cancelReaction();
    reactionState = transitionReaction(reactionState, "RESTORE_POST");
    latestPhysicalFrame = -1;
    targetFrame(Math.max(STABLE_Q_FRAME, scrollTargetPhysicalFrame), true);
    pendingArrival = false;
    publishReaction();
  };
  const suspendReactionForRestore = () => {
    cancelReaction();
    if (!["wake-armed", "wake-forward", "wake-reverse"].includes(reactionState)) return;
    if (currentScrollOffset >= currentArrivalOffset) {
      reactionState = reactionDecision("SUSPEND_POST").state;
      targetPhysicalFrame = Math.max(STABLE_Q_FRAME, scrollTargetPhysicalFrame);
      targetTime = (targetPhysicalFrame - 1) / FRAME_RATE;
      latestPhysicalFrame = -1;
      pendingArrival = true;
    } else {
      reactionState = reactionDecision("SUSPEND_PRE").state;
      targetPhysicalFrame = scrollTargetPhysicalFrame;
      targetTime = (targetPhysicalFrame - 1) / FRAME_RATE;
      latestPhysicalFrame = -1;
    }
    publishReaction();
  };
  const write = () => {
    if (failed || document.hidden) return;
    if (needsMeasurement) measure();
    const scrollExtent = Math.max(1, Math.round(travel));
    const nativeScrollY = window.scrollY;
    const previousIntentOffset = Math.min(scrollExtent, Math.max(0, Math.round(lastIntentScrollY - shellTop)));
    currentScrollOffset = Math.min(scrollExtent, Math.max(0, Math.round(nativeScrollY - shellTop)));
    currentArrivalOffset = arrivalScrollOffset(scrollExtent, initialFamily, initialShortDesktop);
    const scrollProgress = currentScrollOffset / scrollExtent;
    const conceptualCoordinate = conceptualCoordinateForScroll(currentScrollOffset, scrollExtent, initialFamily, initialShortDesktop);
    const cinematicProgress = conceptualCoordinate / CONCEPTUAL_FRAME_COUNT;
    const conceptualFrame = Math.min(CONCEPTUAL_FRAME_COUNT, Math.max(1, Math.floor(conceptualCoordinate) + 1));
    scrollTargetPhysicalFrame = physicalFrameFor(conceptualCoordinate);
    const scrollIntent = scrollIntentFor(scrollEventSequence, handledScrollEventSequence, lastIntentScrollY, nativeScrollY, previousIntentOffset, currentScrollOffset, currentArrivalOffset);
    const hasScrollIntent = scrollIntent.observed;
    const arrivalCrossing = scrollIntent.arrivalCrossing;
    const crossedForward = arrivalCrossing === 1;
    const crossedReverse = arrivalCrossing === -1;
    const movingForward = scrollIntent.direction === 1;
    const movingBackward = scrollIntent.direction === -1;
    if (!hasScrollIntent && reactionState === "wake-reverse") {
      const plan = reviseReversePlan(
        { startFrame: reverseStartFrame, floorFrame: reverseFloorFrame, startedAt: reverseStartedAt },
        presentedPhysicalFrame,
        scrollTargetPhysicalFrame,
        performance.now(),
        true,
      );
      reverseFloorFrame = plan.floorFrame;
    }
    if (!mediaReady) {
      pendingArrival = currentScrollOffset >= currentArrivalOffset && (pendingArrival || initialWrite || crossedForward);
      targetFrame(pendingArrival ? Math.max(STABLE_Q_FRAME, scrollTargetPhysicalFrame) : scrollTargetPhysicalFrame);
    } else {
      if (reactionState === "pending") {
        if (pendingArrival || (initialWrite && currentScrollOffset >= currentArrivalOffset)) restorePostArrival();
        else { reactionState = transitionReaction(reactionState, "READY_PRE"); publishReaction(); }
      }
      if (reactionState === "pre-arrival") {
        if (crossedForward) armWake();
        else if (hasScrollIntent && currentScrollOffset > currentArrivalOffset) { reactionState = transitionReaction(reactionState, "OUTRUN"); targetFrame(scrollTargetPhysicalFrame, true); publishReaction(); }
        else targetFrame(currentScrollOffset > currentArrivalOffset ? ARRIVAL_FRAME : scrollTargetPhysicalFrame, movingBackward);
      } else if (reactionState === "wake-armed" || reactionState === "wake-forward") {
        if (movingBackward) startReverse();
        else if (movingForward && currentScrollOffset > currentArrivalOffset) {
          const decision = reactionDecision("FORWARD");
          cancelReaction(); reactionState = decision.state; targetFrame(scrollTargetPhysicalFrame, true); publishReaction();
        }
      } else if (reactionState === "stable-hold") {
        if (movingBackward) startReverse();
        else if (movingForward && currentScrollOffset > currentArrivalOffset) {
          const decision = reactionDecision("FORWARD");
          reactionState = decision.state; targetFrame(scrollTargetPhysicalFrame, true); publishReaction();
        }
      } else if (reactionState === "post-arrival") {
        if (movingBackward || crossedReverse) startReverse();
        else targetFrame(Math.max(STABLE_Q_FRAME, scrollTargetPhysicalFrame));
      } else if (reactionState === "wake-reverse") {
        if (crossedForward) armWake();
        else if (movingForward) {
          cancelReaction();
          reactionState = transitionReaction(reactionState, currentScrollOffset > currentArrivalOffset ? "OUTRUN" : "UNWOUND");
          targetFrame(scrollTargetPhysicalFrame, true);
          publishReaction();
        }
        else if (movingBackward) startReverse();
      }
    }
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
    persistRestorationState(settled, currentScrollOffset >= currentArrivalOffset);
    requestCurrentFrame();
    Object.assign(publicState, { mode: root.dataset.cinematicMode ?? "enhanced", scrollProgress: rounded(scrollProgress), cinematicProgress: rounded(cinematicProgress), conceptualFrame, targetFrame: targetPhysicalFrame, targetTime: rounded(targetTime), blackProgress: rounded(black), semanticProgress: rounded(semantic), mediaReady, reactionState, presentedFrame: presentedPhysicalFrame });
    if (hasScrollIntent) { handledScrollEventSequence = scrollEventSequence; lastIntentScrollY = nativeScrollY; }
    initialWrite = false;
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
    const decision = reactionDecision("SKIP");
    cancelReaction();
    reactionState = decision.state;
    publishReaction();
    shell.style.setProperty("--cinematic-progress", "1");
    shell.style.setProperty("--cinematic-film-progress", "1");
    shell.style.setProperty("--cinematic-black", "1");
    shell.style.setProperty("--cinematic-semantic", "1");
    root.style.setProperty("--cinematic-semantic", "1");
    shell.dataset.cinematicPhase = "settled";
    shell.dataset.cinematicInteractive = "true";
    setSettledInteraction(true);
    persistRestorationState(true, true);
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
  window.addEventListener("scroll", () => { scrollEventSequence += 1; schedule(); }, { passive: true, signal });
  window.addEventListener("resize", invalidate, { passive: true, signal });
  window.addEventListener("pageshow", invalidate, { passive: true, signal });
  skipLink.addEventListener("click", handleSkip, { signal });
  motion.addEventListener("change", () => { if (motion.matches) failOpen("reduced-motion-change"); }, { signal });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      suspendReactionForRestore();
    }
    else invalidate();
  }, { signal });
  video.addEventListener("loadedmetadata", () => { metadataReady = true; requestCurrentFrame(); }, { signal });
  video.addEventListener("loadeddata", revealUsableFrame, { signal });
  video.addEventListener("seeked", () => {
    presentedPhysicalFrame = frameAtTime(video.currentTime);
    publishReaction();
    revealUsableFrame();
    if (reactionState === "wake-armed" && Math.abs(video.currentTime - ARRIVAL_TIME) <= 0.5 / FRAME_RATE) beginWake();
    else {
      finishReverseIfPresented();
      // A newer retreat/geometry target may have lowered the floor while this seek was in flight.
      resumeReverseTick();
    }
    requestCurrentFrame();
  }, { signal });
  video.addEventListener("error", () => failOpen("media"), { signal });
  void document.fonts?.ready.then(invalidate);
  window.addEventListener("pagehide", (event) => {
    persistRestorationState(shell.dataset.cinematicPhase === "settled" || window.scrollY >= entryTop - headerHeight - 1, currentScrollOffset >= currentArrivalOffset);
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    suspendReactionForRestore();
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
      blackProgress: number; semanticProgress: number; mediaReady: boolean; reactionState: ReactionState; presentedFrame: number;
    }>;
  }
}
