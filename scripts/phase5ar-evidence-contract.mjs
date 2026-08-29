import { createHash } from "node:crypto";
import path from "node:path";

import {
  ACCEPTED_PHASE4_SHA,
  FAMILY_PROFILES,
  MAIN_SHA,
  MANIFEST_URL_PATH,
  PHYSICAL_FRAME_COUNT,
  FPS,
  SOURCE_BLEND_SHA256,
  expectedOffsetForCoordinate,
  profileForView,
  recordingDurationResult,
  validateActiveManifest,
} from "./phase5a-evidence-contract.mjs";

export {
  ACCEPTED_PHASE4_SHA,
  FAMILY_PROFILES,
  MAIN_SHA,
  MANIFEST_URL_PATH,
  PHYSICAL_FRAME_COUNT,
  FPS,
  SOURCE_BLEND_SHA256,
  expectedOffsetForCoordinate,
  profileForView,
  recordingDurationResult,
  validateActiveManifest,
};

export const SCHEMA = "quantum-hub.phase-5a-r.manifesto-browser-evidence.v1";
export const ACCEPTED_PHASE5A_SHA = "799ee284355f161e06404919d5022cd051165bf5";
export const REQUIRED_BRANCH = "codex/phase-5a-r-manifesto-route-identity-repair";
export const REQUIRED_PROJECT = "qsite1";
export const ACTIVE_MEDIA_MANIFEST_SHA256 = "06f9f5b256577ed1b0f159a435135fca6a78185be57b4db8853b9b276c080a54";
export const ACCEPTED_PHASE5A_EVIDENCE_MANIFEST_SHA256 = "adc8c254b31448407c1d6a5d5f49f0082f78d8ce2994b356f6fbb51c224cb1dd";
export const ACCEPTED_PHASE5A_DEPLOYMENT_REPORT_SHA256 = "a6636a9199b0220f0549f328564f66f738f0a258322ff10fe05d8858d128abe7";
export const MANIFESTO_TEXT = "We turn industrial needs into field evidence.";
export const HEADLESS_LOAD_LONG_TASK_LIMITATION_MS = 203;
export const HOLD_MILLISECONDS = 1_400;

export const VIEWPOINTS = Object.freeze([
  Object.freeze({ id: "desktop-1440x900", width: 1440, height: 900, family: "desktop", input: "wheel" }),
  Object.freeze({ id: "short-desktop-1366x650", width: 1366, height: 650, family: "desktop", input: "wheel" }),
  Object.freeze({ id: "desktop-1280x800", width: 1280, height: 800, family: "desktop", input: "wheel" }),
  Object.freeze({ id: "tablet-1024x768", width: 1024, height: 768, family: "desktop", input: "wheel" }),
  Object.freeze({ id: "tablet-768x1024", width: 768, height: 1024, family: "portrait", input: "wheel" }),
  Object.freeze({ id: "portrait-390x844", width: 390, height: 844, family: "portrait", input: "wheel" }),
  Object.freeze({ id: "portrait-360x800", width: 360, height: 800, family: "portrait", input: "wheel" }),
  Object.freeze({ id: "narrow-320x800", width: 320, height: 800, family: "portrait", input: "wheel" }),
  Object.freeze({ id: "landscape-844x390", width: 844, height: 390, family: "landscape", input: "wheel" }),
  Object.freeze({ id: "landscape-740x360", width: 740, height: 360, family: "landscape", input: "wheel" }),
  Object.freeze({ id: "landscape-800x360", width: 800, height: 360, family: "landscape", input: "wheel" }),
  Object.freeze({ id: "landscape-896x414", width: 896, height: 414, family: "landscape", input: "wheel" }),
  Object.freeze({ id: "landscape-900x480", width: 900, height: 480, family: "landscape", input: "wheel" }),
]);

export const RECORDINGS = Object.freeze([
  Object.freeze({ id: "01-forward-manifesto", direction: "forward", relativePath: "recordings/01-forward-manifesto.mp4", minimumSeconds: 5 }),
  Object.freeze({ id: "02-reverse-manifesto", direction: "reverse", relativePath: "recordings/02-reverse-manifesto.mp4", minimumSeconds: 4 }),
]);

export const PROOF_STATES = Object.freeze([
  Object.freeze({ id: 1, slug: "desktop-first-readable", label: "Desktop manifesto · first readable" }),
  Object.freeze({ id: 2, slug: "desktop-settled", label: "Desktop manifesto · settled" }),
  Object.freeze({ id: 3, slug: "manifesto-only", label: "Manifesto-only field proof" }),
  Object.freeze({ id: 4, slug: "audience-emergence", label: "Audience-routing emergence" }),
  Object.freeze({ id: 5, slug: "first-chrome-visible", label: "First chrome-visible state" }),
  Object.freeze({ id: 6, slug: "built-with-industry", label: "Transition into Built with industry" }),
  Object.freeze({ id: 7, slug: "portrait-390x844", label: "Manifesto · 390x844" }),
  Object.freeze({ id: 8, slug: "narrow-320x800", label: "Manifesto · 320x800" }),
  Object.freeze({ id: 9, slug: "tablet-768x1024", label: "Manifesto · 768x1024" }),
  Object.freeze({ id: 10, slug: "landscape-844x390", label: "Manifesto · 844x390" }),
  Object.freeze({ id: 11, slug: "short-landscape-neighbors", label: "Short-landscape neighboring fit proof" }),
  Object.freeze({ id: 12, slug: "text-200-percent", label: "Manifesto · 200% text" }),
  Object.freeze({ id: 13, slug: "reduced-motion", label: "Reduced-motion static manifesto" }),
  Object.freeze({ id: 14, slug: "no-javascript", label: "No-JavaScript static manifesto" }),
  Object.freeze({ id: 15, slug: "reverse-path", label: "Reverse path · chrome hides into CRT" }),
]);

export const SHEETS = Object.freeze([
  Object.freeze({ id: "01-manifesto-sequence", relativePath: "sheets/01-manifesto-sequence.png", stateIds: Object.freeze([1, 2, 3, 4, 5, 6]), columns: 3 }),
  Object.freeze({ id: "02-responsive-manifesto", relativePath: "sheets/02-responsive-manifesto.png", stateIds: Object.freeze([7, 8, 9, 10, 11]), columns: 3 }),
  Object.freeze({ id: "03-accessibility-fallbacks", relativePath: "sheets/03-accessibility-fallbacks.png", stateIds: Object.freeze([12, 13, 14]), columns: 3 }),
  Object.freeze({ id: "04-reverse-path", relativePath: "sheets/04-reverse-path.png", stateIds: Object.freeze([15]), columns: 3 }),
]);

export const REPORT_SCHEMAS = Object.freeze({
  "reports/manifesto-behavior.json": "quantum-hub.phase-5a-r.manifesto-behavior.v1",
  "reports/semantic-chrome.json": "quantum-hub.phase-5a-r.semantic-chrome.v1",
  "reports/responsive-fallback.json": "quantum-hub.phase-5a-r.responsive-fallback.v1",
  "reports/crt-regression.json": "quantum-hub.phase-5a-r.frozen-crt-regression.v1",
  "reports/browser-diagnostics.json": "quantum-hub.phase-5a-r.browser-diagnostics.v1",
  "reports/git-deployment-provenance.json": "quantum-hub.phase-5a-r.git-deployment-provenance.v1",
});

export const REVIEW_GATES = Object.freeze({
  "MANIFESTO THRESHOLD": "PENDING HUMAN REVIEW",
  "SCROLL-DRIVEN CRT ACTIVATION": "PENDING HUMAN REVIEW",
  "SUPPORTING-ROUTE CREATIVE THESIS": "PENDING HUMAN REVIEW",
  "ROUTE-SPECIFIC SPATIAL IDENTITY": "PENDING HUMAN REVIEW",
  "RESPONSIVE + ACCESSIBLE ROUTE CONTINUITY": "PENDING HUMAN REVIEW",
  "PUBLICATION + MEDIA SAFETY": "PENDING HUMAN REVIEW",
  "PERFORMANCE + IMPLEMENTATION STRATEGY": "PENDING HUMAN REVIEW",
});

export const AUTHORIZATION = Object.freeze({
  humanAccepted: false,
  mainMerged: false,
  phase5BAuthorized: false,
});

export function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
}

export function stableJson(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function normalizePreviewUrl(value, label = "preview URL") {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/"
    || !url.hostname.endsWith(`.${REQUIRED_PROJECT}.pages.dev`) || url.hostname === `${REQUIRED_PROJECT}.pages.dev`) {
    throw new Error(`${label} must be a credential-free ${REQUIRED_PROJECT} Pages HTTPS origin root`);
  }
  return url.toString();
}

export function manifestoTopBandForView(view) {
  if (view.family === "landscape") return [6, 9];
  if (view.family === "portrait") return [8, 11];
  return [8, 12];
}

export function addressesForGeometry(geometry, view) {
  if (!Number.isFinite(geometry?.travel) || geometry.travel <= 0 || !Number.isFinite(geometry?.audienceTop)
    || !Number.isFinite(geometry?.builtTop) || !Number.isFinite(view?.height) || view.height <= 0) {
    throw new Error("manifesto geometry must contain finite positive travel and document boundaries");
  }
  const profile = profileForView(view);
  const revealStart = expectedOffsetForCoordinate(geometry.travel, profile, 513);
  const settledOffset = expectedOffsetForCoordinate(geometry.travel, profile, 540);
  const firstReadable = Math.round((revealStart + settledOffset) / 2);
  const clamp = (value) => Math.max(0, Math.min(geometry.maxScrollY ?? Number.MAX_SAFE_INTEGER, Math.round(value)));
  return Object.freeze({
    top: 0,
    firstPositive: 15,
    arrival: clamp((geometry.shellTop ?? 0) + expectedOffsetForCoordinate(geometry.travel, profile, 284)),
    stableQ: clamp((geometry.shellTop ?? 0) + expectedOffsetForCoordinate(geometry.travel, profile, 369)),
    threshold: clamp((geometry.shellTop ?? 0) + expectedOffsetForCoordinate(geometry.travel, profile, 500)),
    revealStart: clamp((geometry.shellTop ?? 0) + revealStart),
    firstReadable: clamp((geometry.shellTop ?? 0) + firstReadable),
    settled: clamp((geometry.shellTop ?? 0) + geometry.travel),
    preRelease: clamp(geometry.audienceTop - view.height - 1),
    release: clamp(geometry.audienceTop - view.height),
    audienceVisible: clamp(geometry.audienceTop - view.height + 1),
    builtVisible: clamp(geometry.builtTop - view.height + 1),
  });
}

export function effectiveVisibilityResult({ rect, ancestors, viewport }) {
  const chain = Array.isArray(ancestors) ? ancestors : [];
  let effectiveOpacity = 1;
  const checks = {
    finiteRect: [rect?.top, rect?.bottom, rect?.left, rect?.right].every(Number.isFinite),
    intersectsViewport: false,
    displayed: true,
    visible: true,
    nonZeroOpacity: true,
  };
  if (checks.finiteRect && Number.isFinite(viewport?.width) && Number.isFinite(viewport?.height)) {
    checks.intersectsViewport = rect.bottom > 0 && rect.top < viewport.height && rect.right > 0 && rect.left < viewport.width;
  }
  for (const item of chain) {
    if (item?.display === "none") checks.displayed = false;
    if (["hidden", "collapse"].includes(item?.visibility)) checks.visible = false;
    const opacity = Number(item?.opacity);
    if (Number.isFinite(opacity)) effectiveOpacity *= opacity;
  }
  // Multiplication can represent an exact 1% chain as 0.010000000000000002.
  // Keep the evidence boundary perceptual and deterministic despite that drift.
  checks.nonZeroOpacity = effectiveOpacity > 0.0100001;
  return { effectiveOpacity, checks, pass: Object.values(checks).every(Boolean) };
}

export function manifestoHoldResult(before, after, elapsedMilliseconds) {
  const checks = {
    sufficientObservation: elapsedMilliseconds >= HOLD_MILLISECONDS,
    scrollUnchanged: Math.abs(after.scrollY - before.scrollY) <= 0.01,
    targetFrameUnchanged: after.targetFrame === before.targetFrame,
    presentedFrameUnchanged: after.presentedFrame === before.presentedFrame,
    decoderTimeUnchanged: Math.abs(after.currentTime - before.currentTime) <= 0.002,
    semanticSettled: before.semanticProgress === 1 && after.semanticProgress === 1 && before.manifestoSettled === true && after.manifestoSettled === true,
    chromeConcealed: before.headerState === "concealed" && after.headerState === "concealed",
    zeroPlayback: after.telemetry.playCalls === before.telemetry.playCalls && after.telemetry.playEvents === before.telemetry.playEvents && after.telemetry.playingEvents === before.telemetry.playingEvents,
  };
  return { elapsedMilliseconds, checks, pass: Object.values(checks).every(Boolean) };
}

export function manifestoScrollPresenceResult(addresses, view, geometry = null) {
  const addressedDistancePixels = Number(addresses?.release) - Number(addresses?.settled);
  const observedSettledY = Number.isFinite(geometry?.shellTop) && Number.isFinite(geometry?.travel)
    ? geometry.shellTop + geometry.travel
    : Number(addresses?.settled);
  const observedReleaseY = Number.isFinite(geometry?.audienceTop) && Number.isFinite(view?.height)
    ? geometry.audienceTop - view.height
    : Number(addresses?.release);
  const distancePixels = observedReleaseY - observedSettledY;
  const viewportHeights = distancePixels / Number(view?.height);
  const checks = {
    finiteAddresses: Number.isFinite(addressedDistancePixels) && Number.isFinite(distancePixels) && Number.isFinite(viewportHeights),
    integerAddressAgreement: Math.abs(addressedDistancePixels - distancePixels) <= 1,
    positiveDistance: distancePixels > 0,
    usefulPresenceTarget: viewportHeights >= 0.6 && viewportHeights <= 0.9,
  };
  return { observedSettledY, observedReleaseY, distancePixels, addressedDistancePixels, viewportHeights, targetViewportHeights: [0.6, 0.9], checks, pass: Object.values(checks).every(Boolean) };
}

export function chromeBoundaryResult(preRelease, release, visible, reversePreRelease) {
  const checks = {
    onePixelAddresses: release.scrollY === preRelease.scrollY + 1 && visible.scrollY === release.scrollY + 1,
    concealedBefore: preRelease.headerState === "concealed" && preRelease.navigationReleased === false && preRelease.audienceInert === true,
    releasedAtBoundary: release.headerState === "released" && release.navigationReleased === true && release.audienceInert === false,
    audienceFirstPixelAfterBoundary: release.audienceIntersects === false && visible.audienceIntersects === true,
    exactReverse: reversePreRelease.scrollY === preRelease.scrollY && reversePreRelease.headerState === "concealed" && reversePreRelease.navigationReleased === false && reversePreRelease.audienceInert === true,
  };
  return { checks, pass: Object.values(checks).every(Boolean) };
}

export function normalizedRecordingResult(probe, view, minimumSeconds) {
  const duration = recordingDurationResult(probe, minimumSeconds);
  const checks = {
    mp4Container: String(probe.formatName).includes("mp4"),
    oneVideoStream: probe.videoStreams === 1,
    zeroAudioStreams: probe.audioStreams === 0,
    zeroOtherStreams: probe.otherStreams === 0,
    h264: probe.codec === "h264",
    yuv420p: probe.pixelFormat === "yuv420p",
    exactViewport: probe.width === view.width && probe.height === view.height,
    constant30Fps: probe.averageFrameRate === "30/1" && probe.realFrameRate === "30/1",
    duration: duration.pass,
  };
  return { duration, checks, pass: Object.values(checks).every(Boolean) };
}

export function assertInventoryContract() {
  const expectedViewports = ["1440x900", "1366x650", "1280x800", "1024x768", "768x1024", "390x844", "360x800", "320x800", "844x390", "740x360", "800x360", "896x414", "900x480"];
  if (VIEWPOINTS.length !== 13 || VIEWPOINTS.map(({ width, height }) => `${width}x${height}`).join("|") !== expectedViewports.join("|")) throw new Error("Phase 5A-R viewport inventory differs");
  if (RECORDINGS.length !== 2 || RECORDINGS.map((item) => item.direction).join("|") !== "forward|reverse") throw new Error("Phase 5A-R recording inventory differs");
  if (PROOF_STATES.length !== 15 || PROOF_STATES.some((item, index) => item.id !== index + 1)) throw new Error("Phase 5A-R proof-state inventory differs");
  if (SHEETS.length !== 4 || SHEETS.flatMap((item) => item.stateIds).join("|") !== PROOF_STATES.map((item) => item.id).join("|")) throw new Error("Phase 5A-R compact-sheet mapping differs");
  if (Object.keys(REPORT_SCHEMAS).length !== 6 || Object.keys(REVIEW_GATES).length !== 7 || !Object.values(REVIEW_GATES).every((value) => value === "PENDING HUMAN REVIEW")) throw new Error("Phase 5A-R report/gate inventory differs");
  if (HEADLESS_LOAD_LONG_TASK_LIMITATION_MS !== 203 || HOLD_MILLISECONDS < 1_400) throw new Error("Phase 5A-R limitation/hold authority differs");
  return true;
}

assertInventoryContract();
