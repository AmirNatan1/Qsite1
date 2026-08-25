type MediaFamily = "desktop" | "mobile";
type Codec = "vp9" | "h264";

const FRAME_COUNT = 270;
const FRAME_RATE = 30;
const FINAL_FRAME_INDEX = FRAME_COUNT - 1;
const TAKEOVER_START = 264 / FINAL_FRAME_INDEX;
const LOAD_TIMEOUT_MS = 12_000;

const SOURCES = Object.freeze({
  desktop: Object.freeze({
    vp9: "/media/cinematic/phase-3-desktop-vp9-44a1d9facd43.webm",
    h264: "/media/cinematic/phase-3-desktop-h264-a73be0bb9890.mp4",
  }),
  mobile: Object.freeze({
    vp9: "/media/cinematic/phase-3-mobile-vp9-0ffcf12a431b.webm",
    h264: "/media/cinematic/phase-3-mobile-h264-34319f80ae39.mp4",
  }),
});

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
    if (progress <= inputEnd) {
      const span = Math.max(inputEnd - inputStart, Number.EPSILON);
      return mix(outputStart, outputEnd, (progress - inputStart) / span);
    }
  }
  return output.at(-1) ?? 1;
}

function mapCinematicProgress(scrollProgress: number, family: MediaFamily, shortHeight: boolean) {
  const timeline = [0, 0.1, 0.42, 0.78, 1] as const;
  if (family === "mobile") {
    return interpolatePiecewise(scrollProgress, [0, 0.04, 0.3267, 0.6133, 1], timeline);
  }
  if (shortHeight) {
    return interpolatePiecewise(scrollProgress, [0, 0.0358, 0.3343, 0.6269, 1], timeline);
  }
  return interpolatePiecewise(scrollProgress, [0, 0.0411, 0.3425, 0.6301, 1], timeline);
}

function chooseFamily(width: number, height: number): MediaFamily {
  const portraitTabletOrPhone = width <= 800 && height > width;
  const narrowLandscape = width <= 900 && height <= 480;
  return portraitTabletOrPhone || narrowLandscape ? "mobile" : "desktop";
}

function isSafariOrIOS() {
  const agent = navigator.userAgent;
  const appleMobile = /iPad|iPhone|iPod/.test(agent);
  const safari = /AppleWebKit/.test(agent) && !/Chrome|Chromium|CriOS|Edg|OPR|FxiOS/.test(agent);
  return appleMobile || safari;
}

function chooseCodec(video: HTMLVideoElement): Codec | null {
  const h264 = video.canPlayType('video/mp4; codecs="avc1.640028"') || video.canPlayType('video/mp4; codecs="avc1.42E01E"');
  if (!isSafariOrIOS() && video.canPlayType('video/webm; codecs="vp09.00.10.08"') === "probably") return "vp9";
  return h264 ? "h264" : null;
}

function zoomMakesPortalUnsafe() {
  const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  const viewportScale = window.visualViewport?.scale ?? 1;
  const chromeRatio = window.innerWidth > 0 && window.outerWidth > 0 ? window.outerWidth / window.innerWidth : 1;
  const desktopPageZoom = navigator.maxTouchPoints === 0 && window.outerWidth >= 900 && chromeRatio >= 1.65;
  return rootFontSize >= 30 || viewportScale >= 1.75 || desktopPageZoom;
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

  if (!shell || !stage || !video || !entry || !entryContent || root.dataset.cinematicMode !== "candidate") return;
  if (!header || !skipLink) {
    root.dataset.cinematicEligibility = "bypass";
    root.dataset.cinematicMode = "static";
    root.dataset.cinematicHeader = "released";
    root.dataset.cinematicFallback = "required-dom";
    header?.removeAttribute("inert");
    entry.removeAttribute("inert");
    shell.dataset.cinematicInteractive = "true";
    shell.dataset.cinematicPhase = "fallback";
    return;
  }

  const abortController = new AbortController();
  const { signal } = abortController;
  const mediaAbortController = new AbortController();
  const initialFamily = chooseFamily(window.innerWidth, window.innerHeight);
  const initialShortHeight = initialFamily === "desktop" && window.innerHeight < 704;
  const travelFactor = initialFamily === "mobile" ? 3 : initialShortHeight ? 3.35 : 3.65;
  const authoredTravel = window.innerHeight * travelFactor;
  const codec = chooseCodec(video);
  let animationFrame = 0;
  let needsMeasurement = true;
  let shellTop = 0;
  let entryTop = 1;
  let entryBottom = 1;
  let headerHeight = 0;
  let travel = 1;
  let latestFrame = -1;
  let targetFrame = 0;
  let targetTime = 0;
  let metadataReady = false;
  let mediaReady = false;
  let mediaFailed = false;
  let failed = false;
  let loadTimer = 0;
  let mediaObjectUrl: string | null = null;
  let persistedSettledState: boolean | null = null;

  const closeMobileMenu = () => {
    if (mobileMenu?.open) mobileMenu.removeAttribute("open");
  };

  const persistRestorationState = (settledOrLower: boolean) => {
    if (persistedSettledState === settledOrLower) return;
    try {
      const currentState = history.state && typeof history.state === "object" ? history.state : {};
      history.replaceState({
        ...currentState,
        quantumHomeCinematic: { version: 1, settledOrLower },
      }, document.title);
      persistedSettledState = settledOrLower;
    } catch {
      // History restoration metadata is advisory; failure must not trap the page.
    }
  };

  const setSettledInteraction = (settled: boolean) => {
    if (settled) {
      header.removeAttribute("inert");
      entry.removeAttribute("inert");
      root.dataset.cinematicHeader = "released";
      shell.dataset.cinematicInteractive = "true";
      return;
    }

    closeMobileMenu();
    const focused = document.activeElement;
    if (focused instanceof Node && (header.contains(focused) || entry.contains(focused))) {
      skipLink.focus({ preventScroll: true });
    }
    header.setAttribute("inert", "");
    entry.setAttribute("inert", "");
    root.dataset.cinematicHeader = "concealed";
    shell.dataset.cinematicInteractive = "false";
  };

  const clearLoadTimer = () => {
    if (loadTimer) window.clearTimeout(loadTimer);
    loadTimer = 0;
  };

  const releaseMedia = () => {
    mediaAbortController.abort();
    video.pause();
    video.removeAttribute("src");
    video.load();
    if (mediaObjectUrl) URL.revokeObjectURL(mediaObjectUrl);
    mediaObjectUrl = null;
  };

  const clearCinematicStyles = () => {
    for (const property of [
      "--cinematic-header-px",
      "--cinematic-travel-px",
      "--cinematic-progress",
      "--cinematic-film-progress",
      "--cinematic-takeover",
      "--cinematic-semantic",
      "--cinematic-media-ready",
    ]) shell.style.removeProperty(property);
    for (const property of ["--cinematic-takeover", "--cinematic-semantic"]) root.style.removeProperty(property);
  };

  const failOpen = (reason: string) => {
    if (failed || mediaFailed) return;
    mediaFailed = true;
    failed = true;
    clearLoadTimer();
    releaseMedia();
    root.dataset.cinematicFallback = reason;
    root.dataset.cinematicEligibility = "bypass";
    shell.dataset.mediaState = "failed";
    mediaReady = false;

    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    shell.dataset.cinematicPhase = "fallback";
    setSettledInteraction(true);
    root.dataset.cinematicMode = "static";
    clearCinematicStyles();
  };

  const portalFits = () => {
    if (zoomMakesPortalUnsafe()) return false;
    const anchors = [
      entryContent.querySelector<HTMLElement>("h1"),
      entryContent.querySelector<HTMLElement>(".entry-paths"),
    ];
    const horizontalFit = anchors.every((anchor) => {
      if (!anchor) return false;
      const bounds = anchor.getBoundingClientRect();
      return bounds.left >= -3 && bounds.right <= window.innerWidth + 3;
    });
    const documentFit = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= window.innerWidth + 3;
    return horizontalFit && documentFit && window.innerHeight >= 320;
  };

  if (motion.matches || !codec || !portalFits()) {
    failOpen(motion.matches ? "reduced-motion" : codec ? "typography-fit" : "codec");
    return;
  }

  const selectedSource = SOURCES[initialFamily][codec];
  const publicState = {
    mode: root.dataset.cinematicMode,
    mediaFamily: initialFamily,
    codec,
    delivery: "blob" as const,
    scrollProgress: 0,
    cinematicProgress: 0,
    targetFrame: 1,
    targetTime: 0,
    actualTime: 0,
    takeoverProgress: 0,
    mediaReady: false,
  };
  window.quantumPhase4 = publicState;

  root.dataset.cinematicMode = "enhanced";
  shell.dataset.mediaFamily = initialFamily;
  shell.dataset.mediaCodec = codec;
  shell.dataset.mediaSource = selectedSource;
  shell.dataset.mediaDelivery = "blob";
  shell.dataset.mediaState = "loading";
  video.preload = "auto";

  const loadSelectedMedia = async () => {
    try {
      const response = await fetch(selectedSource, {
        cache: "force-cache",
        signal: mediaAbortController.signal,
      });
      if (!response.ok) throw new Error(`cinematic media response ${response.status}`);
      const mediaBlob = await response.blob();
      if (!mediaBlob.size || !mediaBlob.type.startsWith("video/")) throw new Error("cinematic media response is not video");
      if (failed || mediaFailed || mediaAbortController.signal.aborted) return;
      mediaObjectUrl = URL.createObjectURL(mediaBlob);
      video.src = mediaObjectUrl;
      video.load();
    } catch {
      if (!mediaAbortController.signal.aborted) failOpen("media");
    }
  };

  const measure = () => {
    headerHeight = header?.getBoundingClientRect().height ?? 0;
    shell.style.setProperty("--cinematic-header-px", `${headerHeight.toFixed(2)}px`);
    // Keep the accepted session travel and progress invariant across an in-flight
    // resize/orientation change. The sticky viewport and portal bounds still reflow,
    // while reload in the new orientation selects its authored travel afresh.
    shell.style.setProperty("--cinematic-travel-px", `${authoredTravel.toFixed(2)}px`);
    const shellBounds = shell.getBoundingClientRect();
    const entryBounds = entry.getBoundingClientRect();
    shellTop = shellBounds.top + window.scrollY;
    entryTop = entryBounds.top + window.scrollY;
    entryBottom = entryTop + entryBounds.height;
    travel = Math.max(entryTop - headerHeight - shellTop, 1);
    needsMeasurement = false;
  };

  const requestCurrentFrame = () => {
    if (!metadataReady || mediaFailed || failed || document.hidden || video.seeking || targetFrame === latestFrame) return;
    latestFrame = targetFrame;
    try {
      video.pause();
      video.currentTime = targetTime;
    } catch {
      failOpen("seek");
    }
  };

  const write = () => {
    if (failed || document.hidden) return;
    if (needsMeasurement) measure();

    const scrollProgress = clamp((window.scrollY - shellTop) / travel);
    const cinematicProgress = mapCinematicProgress(scrollProgress, initialFamily, initialShortHeight);
    const takeover = smoothstep((cinematicProgress - TAKEOVER_START) / (1 - TAKEOVER_START));
    const semantic = smoothstep((takeover - 0.24) / 0.76);
    targetFrame = Math.round(cinematicProgress * FINAL_FRAME_INDEX);
    targetTime = targetFrame / FRAME_RATE;

    shell.style.setProperty("--cinematic-progress", scrollProgress.toFixed(4));
    shell.style.setProperty("--cinematic-film-progress", cinematicProgress.toFixed(4));
    shell.style.setProperty("--cinematic-takeover", takeover.toFixed(4));
    shell.style.setProperty("--cinematic-semantic", semantic.toFixed(4));
    shell.style.setProperty("--cinematic-media-ready", mediaReady ? "1" : "0");
    root.style.setProperty("--cinematic-takeover", takeover.toFixed(4));
    root.style.setProperty("--cinematic-semantic", semantic.toFixed(4));

    const settled = scrollProgress >= 0.9995;
    shell.dataset.cinematicPhase = settled ? "settled" : takeover > 0 ? "takeover" : "physical";
    setSettledInteraction(settled);
    persistRestorationState(settled);
    shell.dataset.scrollProgress = scrollProgress.toFixed(4);
    shell.dataset.cinematicProgress = cinematicProgress.toFixed(4);
    shell.dataset.targetFrame = String(targetFrame + 1);
    shell.dataset.targetTime = targetTime.toFixed(4);
    shell.dataset.takeoverProgress = takeover.toFixed(4);
    requestCurrentFrame();

    Object.assign(publicState, {
      mode: root.dataset.cinematicMode,
      scrollProgress: rounded(scrollProgress),
      cinematicProgress: rounded(cinematicProgress),
      targetFrame: targetFrame + 1,
      targetTime: rounded(targetTime),
      actualTime: rounded(video.currentTime),
      takeoverProgress: rounded(takeover),
      mediaReady,
    });
  };

  const schedule = () => {
    if (animationFrame || document.hidden || failed) return;
    if (!needsMeasurement && window.scrollY > entryBottom + window.innerHeight && root.dataset.cinematicHeader === "released") return;
    animationFrame = window.requestAnimationFrame(() => {
      animationFrame = 0;
      write();
    });
  };

  const invalidate = () => {
    needsMeasurement = true;
    if (!portalFits()) {
      failOpen("typography-fit");
      return;
    }
    schedule();
  };

  const revealUsableFrame = () => {
    if (mediaFailed || !metadataReady || Math.abs(video.currentTime - targetTime) > 2 / FRAME_RATE) return;
    mediaReady = true;
    shell.dataset.mediaState = "ready";
    clearLoadTimer();
    schedule();
  };

  const handleSkip = () => {
    shell.style.setProperty("--cinematic-progress", "1");
    shell.style.setProperty("--cinematic-film-progress", "1");
    shell.style.setProperty("--cinematic-takeover", "1");
    shell.style.setProperty("--cinematic-semantic", "1");
    root.style.setProperty("--cinematic-takeover", "1");
    root.style.setProperty("--cinematic-semantic", "1");
    shell.dataset.cinematicPhase = "settled";
    shell.dataset.scrollProgress = "1.0000";
    shell.dataset.cinematicProgress = "1.0000";
    shell.dataset.targetFrame = String(FRAME_COUNT);
    shell.dataset.targetTime = (FINAL_FRAME_INDEX / FRAME_RATE).toFixed(4);
    shell.dataset.takeoverProgress = "1.0000";
    setSettledInteraction(true);
    persistRestorationState(true);
    entry.focus({ preventScroll: true });
  };

  const resizeObserver = new ResizeObserver(invalidate);
  resizeObserver.observe(shell);
  resizeObserver.observe(entry);

  window.addEventListener("scroll", schedule, { passive: true, signal });
  window.addEventListener("resize", invalidate, { passive: true, signal });
  window.addEventListener("orientationchange", invalidate, { passive: true, signal });
  window.addEventListener("pageshow", invalidate, { passive: true, signal });
  skipLink.addEventListener("click", handleSkip, { signal });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) {
        if (animationFrame) window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        video.pause();
      } else {
        invalidate();
      }
    },
    { signal },
  );
  motion.addEventListener("change", () => {
    if (motion.matches) failOpen("reduced-motion-change");
  }, { signal });

  video.addEventListener("loadedmetadata", () => {
    metadataReady = true;
    requestCurrentFrame();
  }, { signal });
  video.addEventListener("loadeddata", revealUsableFrame, { signal });
  video.addEventListener("seeked", () => {
    revealUsableFrame();
    requestCurrentFrame();
  }, { signal });
  video.addEventListener("error", () => failOpen("media"), { signal });

  void document.fonts?.ready.then(() => {
    if (!portalFits()) failOpen("typography-fit");
    else invalidate();
  });

  window.addEventListener("pagehide", (event) => {
    const settledOrLower = shell.dataset.cinematicPhase === "settled"
      || window.scrollY >= entryTop - headerHeight - 1;
    persistedSettledState = null;
    persistRestorationState(settledOrLower);
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    video.pause();
    if (event.persisted) return;
    clearLoadTimer();
    releaseMedia();
    resizeObserver.disconnect();
    abortController.abort();
  }, { signal });

  loadTimer = window.setTimeout(() => {
    if (!mediaReady) failOpen(metadataReady ? "decode-timeout" : "load-timeout");
  }, LOAD_TIMEOUT_MS);

  void loadSelectedMedia();
  measure();
  write();
}

declare global {
  interface Window {
    quantumPhase4?: Readonly<{
      mode: string | undefined;
      mediaFamily: MediaFamily;
      codec: Codec;
      delivery: "blob";
      scrollProgress: number;
      cinematicProgress: number;
      targetFrame: number;
      targetTime: number;
      actualTime: number;
      takeoverProgress: number;
      mediaReady: boolean;
    }>;
  }
}
