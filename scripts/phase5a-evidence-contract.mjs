import { createHash } from "node:crypto";
import path from "node:path";

export const SCHEMA = "quantum-hub.phase-5a.scroll-crt-browser-evidence.v1";
export const ACCEPTED_PHASE4_SHA = "47a6f3cc7f464b09c9c143cac273c2a1f5a35bfa";
export const MAIN_SHA = "501040c42bba30b9d9517b88a8f9857992a2dba4";
export const REQUIRED_BRANCH = "feature/phase-5a-scroll-crt-route-preproduction";
export const SOURCE_BLEND_SHA256 = "58f5479484dd8da342556abad1e58c96a660f30e6a9d6d5215927056b5cbc516";
export const MANIFEST_URL_PATH = "/media/cinematic/phase-4r2/manifests/phase-4r2-production-media-manifest.json";
export const CONCEPTUAL_FRAME_COUNT = 540;
export const PHYSICAL_FRAME_COUNT = 500;
export const FPS = 30;
export const FIRST_CHANGED_FRAME = 46;
export const ARRIVAL_FRAME = 285;
export const STABLE_Q_FRAME = 370;
export const BLACK_START_FRAME = 501;
export const ENTRY_START_FRAME = 514;
export const HOLD_MILLISECONDS = 3_400;
export const MAX_ACTIVE_ASSET_BYTES = 25 * 1024 * 1024;

/**
 * Coordinates are zero-based editorial coordinates. F285 is u284; browser-
 * owned black and ENTRY continue after the unchanged F500 physical film.
 */
export const SEGMENTS = Object.freeze([
  { id: "top-dormancy", startU: 0, endU: 0, conceptual: "u0", physical: "F1", semantic: "0" },
  { id: "current-orbit", startU: 45, endU: 283, conceptual: "u45-u283", physical: "F46-F284", semantic: "0" },
  { id: "crt-arrival", startU: 284, endU: 284, conceptual: "u284", physical: "F285", semantic: "0" },
  { id: "indicator", startU: 285, endU: 298, conceptual: "u285-u298", physical: "F286-F299", semantic: "0" },
  { id: "phosphor-line", startU: 299, endU: 314, conceptual: "u299-u314", physical: "F300-F315", semantic: "0" },
  { id: "raster-expansion", startU: 315, endU: 334, conceptual: "u315-u334", physical: "F316-F335", semantic: "0" },
  { id: "raster-settling", startU: 335, endU: 354, conceptual: "u335-u354", physical: "F336-F355", semantic: "0" },
  { id: "q-appearance", startU: 355, endU: 368, conceptual: "u355-u368", physical: "F356-F369", semantic: "0" },
  { id: "q-hold", startU: 369, endU: 404, conceptual: "u369-u404", physical: "F370-F405", semantic: "0" },
  { id: "frontal-approach", startU: 405, endU: 479, conceptual: "u405-u479", physical: "F406-F480", semantic: "0" },
  { id: "physical-threshold", startU: 480, endU: 499, conceptual: "u480-u499", physical: "F481-F500", semantic: "0" },
  { id: "digital-breathing", startU: 500, endU: 512, conceptual: "u500-u512", physical: "F500 hold", semantic: "0" },
  { id: "entry-reveal", startU: 513, endU: 540, conceptual: "u513-u540", physical: "F500 hold", semantic: "smoothstep" },
]);

export const PIECEWISE_COORDINATES = Object.freeze([45, 54, 226.8, 284, 285, 291, 299, 315, 335, 355, 369, 405, 421.2, 480, 500, 513, 540]);

export const FAMILY_PROFILES = Object.freeze({
  desktop: Object.freeze({
    id: "desktop",
    travelVh: 6.75,
    startupVh: 0.7859,
    startupRangeVh: [0.75, 1],
    progress: Object.freeze([0, 0.038056, 0.31713, 0.395484, "arrival+1px", 0.405073, 0.416031, 0.437949, 0.465346, 0.492743, 0.51192, 0.640396, 0.691074, 0.835542, 0.884681, 0.922159, 1]),
  }),
  shortDesktop: Object.freeze({
    id: "shortDesktop",
    travelVh: 5.95,
    startupVh: 0.6973,
    startupRangeVh: [0.65, 0.85],
    progress: Object.freeze([0, 0.032792, 0.306208, 0.385067, "arrival+1px", 0.394717, 0.405747, 0.427806, 0.455379, 0.482952, 0.502253, 0.631556, 0.684481, 0.834058, 0.884934, 0.922331, 1]),
  }),
  portrait: Object.freeze({
    id: "portrait",
    travelVh: 5.35,
    startupVh: 0.6078,
    startupRangeVh: [0.6, 0.8],
    progress: Object.freeze([0, 0.036262, 0.296167, 0.372615, "arrival+1px", 0.381971, 0.392662, 0.414046, 0.440776, 0.467506, 0.486217, 0.611566, 0.665562, 0.827041, 0.881966, 0.920328, 1]),
  }),
  landscape: Object.freeze({
    id: "landscape",
    travelVh: 5.6,
    startupVh: 0.6391,
    startupRangeVh: [0.6, 0.8],
    progress: Object.freeze([0, 0.036429, 0.29753, 0.37433, "arrival+1px", 0.383729, 0.39447, 0.415951, 0.442805, 0.469658, 0.488455, 0.614381, 0.667706, 0.82718, 0.881423, 0.919961, 1]),
  }),
});

export const STARTUP_LANDMARKS = Object.freeze([
  { id: "arrival", frame: 285, coordinate: 284, segment: "crt-arrival" },
  { id: "first-indicator", frame: 286, coordinate: 285, segment: "indicator" },
  { id: "indicator", frame: 292, coordinate: 291, segment: "indicator" },
  { id: "line", frame: 308, coordinate: 307, segment: "phosphor-line" },
  { id: "raster", frame: 325, coordinate: 324, segment: "raster-expansion" },
  { id: "settling", frame: 345, coordinate: 344, segment: "raster-settling" },
  { id: "q-appearance", frame: 360, coordinate: 359, segment: "q-appearance" },
  { id: "stable-q", frame: 370, coordinate: 369, segment: "q-hold" },
]);

export const VIEWPOINTS = Object.freeze([
  { id: "desktop-1440x900", width: 1440, height: 900, family: "desktop", input: "wheel" },
  { id: "portrait-390x844", width: 390, height: 844, family: "portrait", input: "touch" },
  { id: "narrow-320x800", width: 320, height: 800, family: "portrait", input: "keyboard" },
  { id: "tablet-768x1024", width: 768, height: 1024, family: "portrait", input: "touch" },
  { id: "landscape-844x390", width: 844, height: 390, family: "landscape", input: "wheel" },
]);

export const RECORDINGS = Object.freeze([
  { id: "A-arrival-stop", gate: "A", viewpoint: "desktop-1440x900", kind: "arrival-stop", minimumSeconds: 3.4 },
  { id: "B-scroll-driven-startup", gate: "B", viewpoint: "desktop-1440x900", kind: "progressive-startup", minimumSeconds: 2.2 },
  { id: "C-stop-on-line", gate: "C", viewpoint: "desktop-1440x900", kind: "line-hold", minimumSeconds: 3.4 },
  { id: "D-stop-on-raster", gate: "D", viewpoint: "desktop-1440x900", kind: "raster-hold", minimumSeconds: 3.4 },
  { id: "E-reverse-startup", gate: "E", viewpoint: "desktop-1440x900", kind: "reverse-startup", minimumSeconds: 2.2 },
  { id: "F-fast-jump-scrollbar", gate: "F", viewpoint: "desktop-1440x900", kind: "fast-jump", minimumSeconds: 3.4 },
  { id: "G-first-positive-15px", gate: "G", viewpoint: "desktop-1440x900", kind: "first-input", minimumSeconds: 1 },
  ...VIEWPOINTS.map((view, index) => ({
    id: `H${index + 1}-responsive-${view.id}`,
    gate: "H",
    viewpoint: view.id,
    kind: "responsive-startup",
    minimumSeconds: 1.4,
  })),
]);

export const SHEETS = Object.freeze([
  { id: "01-arrival-stop", title: "ARRIVAL STOP · F285 HOLDS" },
  { id: "02-scroll-driven-startup", title: "SCROLL-DRIVEN CRT STARTUP" },
  { id: "03-line-raster-holds", title: "LINE + RASTER HOLDS" },
  { id: "04-reverse-startup", title: "REVERSE STARTUP" },
  { id: "05-fast-jump", title: "ONE-INPUT FAST JUMP" },
  { id: "06-first-scroll", title: "FIRST POSITIVE 15PX INPUT" },
  { id: "07-responsive-startup", title: "RESPONSIVE STARTUP" },
  { id: "08-media-fallbacks", title: "MEDIA PENDING + FAILURE FALLBACKS" },
  { id: "09-accessibility-chrome", title: "ACCESSIBILITY + CHROME + REFLOW" },
  { id: "10-supporting-routes", title: "SUPPORTING ROUTE REGRESSIONS" },
]);

export const REPORT_SCHEMAS = Object.freeze({
  "reports/frame-mapping.json": "quantum-hub.phase-5a.frame-mapping-evidence.v1",
  "reports/scroll-addressed-crt.json": "quantum-hub.phase-5a.scroll-addressed-crt-evidence.v1",
  "reports/responsive-startup.json": "quantum-hub.phase-5a.responsive-startup-evidence.v1",
  "reports/media-network.json": "quantum-hub.phase-5a.media-network-evidence.v1",
  "reports/fallback-accessibility.json": "quantum-hub.phase-5a.fallback-accessibility-evidence.v1",
  "reports/supporting-route-regressions.json": "quantum-hub.phase-5a.supporting-route-regressions.v1",
  "reports/git-deployment-provenance.json": "quantum-hub.phase-5a.git-deployment-provenance-evidence.v1",
  "reports/browser-diagnostics.json": "quantum-hub.phase-5a.browser-diagnostics.v1",
});

export const SUPPORTING_ROUTES = Object.freeze([
  "/for-partners/",
  "/for-startups/",
  "/industries/",
  "/pocs/",
  "/pocs/maradin/",
  "/spark/",
  "/about/",
  "/contact/",
]);

export const REAL_404_ROUTE = "/__phase5a-real-404-probe__/";

export const HUMAN_GATES = Object.freeze({
  "SCROLL-DRIVEN CRT ACTIVATION": "PENDING HUMAN REVIEW",
  "SUPPORTING-ROUTE CREATIVE THESIS": "PENDING HUMAN REVIEW",
  "ROUTE-SPECIFIC SPATIAL IDENTITY": "PENDING HUMAN REVIEW",
  "RESPONSIVE + ACCESSIBLE ROUTE CONTINUITY": "PENDING HUMAN REVIEW",
  "PUBLICATION + MEDIA SAFETY": "PENDING HUMAN REVIEW",
  "PERFORMANCE + IMPLEMENTATION STRATEGY": "PENDING HUMAN REVIEW",
});

export function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
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

export function normalizeDeployedUrl(value) {
  const url = new URL(value);
  const loopback = /^(?:localhost|127\.0\.0\.1|\[?::1\]?)$/i.test(url.hostname);
  if (url.protocol !== "https:" || loopback || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("deployed evidence requires a credential-free, non-loopback HTTPS origin root");
  }
  return url.toString();
}

export function profileForView(view) {
  if (view.family === "desktop" && view.height < 704) return FAMILY_PROFILES.shortDesktop;
  return FAMILY_PROFILES[view.family];
}

export function expectedOffsetForCoordinate(extent, profile, coordinate) {
  const total = Math.max(1, Math.round(extent));
  const coordinateIndex = PIECEWISE_COORDINATES.indexOf(coordinate);
  if (coordinateIndex < 0) throw new Error(`coordinate u${coordinate} is not an explicit Phase 5A anchor`);
  if (profile.progress[coordinateIndex] === "arrival+1px") {
    const arrivalIndex = PIECEWISE_COORDINATES.indexOf(284);
    return Math.min(total, Math.round(total * profile.progress[arrivalIndex]) + 1);
  }
  return Math.round(total * profile.progress[coordinateIndex]);
}

export function validateActiveManifest(manifest) {
  if (manifest?.schema !== "quantum-hub.phase-4-r2.production-media-manifest.v1" || manifest.status !== "PASS") {
    throw new Error("active production manifest schema/status mismatch");
  }
  if (manifest.sourceBlendSha256 !== SOURCE_BLEND_SHA256
    || manifest.physicalTimeline?.frames !== PHYSICAL_FRAME_COUNT
    || manifest.physicalTimeline?.fps !== FPS) throw new Error("unchanged physical media authority mismatch");
  if (manifest.deliveryPolicy?.h264Only !== true
    || manifest.deliveryPolicy?.activeVideoCount !== 3
    || manifest.deliveryPolicy?.activePosterCount !== 3
    || manifest.deliveryPolicy?.inactiveCodecPayloadCount !== 0) throw new Error("active manifest is not the exact H.264-only policy");
  if (manifest.authorization?.mergeMain !== false || manifest.authorization?.phase5 !== false) throw new Error("unchanged production-media authorization boundary differs");
  const assets = manifest.assets;
  if (!Array.isArray(assets) || assets.length !== 6 || new Set(assets.map((asset) => asset.file)).size !== 6) {
    throw new Error("active manifest must expose exactly six unique runtime assets");
  }
  for (const family of ["desktop", "portrait", "landscape"]) {
    const videos = assets.filter((asset) => asset.kind === "video" && asset.family === family);
    const posters = assets.filter((asset) => asset.kind === "poster" && asset.family === family);
    if (videos.length !== 1 || videos[0].codec !== "h264" || !/^media\/[a-z0-9._-]+\.mp4$/i.test(videos[0].file)
      || videos[0].frames !== PHYSICAL_FRAME_COUNT || videos[0].fps !== FPS
      || !Number.isSafeInteger(videos[0].bytes) || videos[0].bytes <= 0 || videos[0].bytes > MAX_ACTIVE_ASSET_BYTES
      || !/^[0-9a-f]{64}$/.test(videos[0].sha256 ?? "")) throw new Error(`${family} H.264 authority mismatch`);
    if (posters.length !== 1 || !/^posters\/[a-z0-9._-]+\.png$/i.test(posters[0].file)
      || !Number.isSafeInteger(posters[0].bytes) || posters[0].bytes <= 0 || posters[0].bytes > MAX_ACTIVE_ASSET_BYTES
      || !/^[0-9a-f]{64}$/.test(posters[0].sha256 ?? "")) throw new Error(`${family} poster authority mismatch`);
  }
  if (/(?:vp9|webm)/i.test(JSON.stringify(manifest))) throw new Error("VP9/WebM may not appear in the active manifest");
  return true;
}

export function mediaUrlPath(manifestUrlPath, assetFile) {
  if (!/^\/[a-z0-9._\/-]+\.json$/i.test(manifestUrlPath) || manifestUrlPath.includes("..")) throw new Error("invalid public manifest path");
  const root = path.posix.dirname(path.posix.dirname(manifestUrlPath));
  const candidate = path.posix.normalize(`${root}/${assetFile}`);
  if (!candidate.startsWith(`${root}/`) || candidate.includes("..")) throw new Error("asset escapes the public media root");
  return candidate;
}

export function recordingDurationResult(probe, minimumSeconds) {
  const minimumFrames = Math.ceil(minimumSeconds * FPS);
  const decodedSeconds = probe.frameCount / FPS;
  const checks = {
    finiteDuration: Number.isFinite(probe.durationSeconds) && probe.durationSeconds > 0,
    minimumDuration: probe.durationSeconds >= minimumSeconds,
    minimumFrames: Number.isInteger(probe.frameCount) && probe.frameCount >= minimumFrames,
    durationMatchesDecodedFrames: Math.abs(decodedSeconds - probe.durationSeconds) <= Math.max(2 / FPS, 0.08),
  };
  return { minimumSeconds, minimumFrames, decodedSeconds, checks, pass: Object.values(checks).every(Boolean) };
}

export function holdResult(before, after, holdMilliseconds = HOLD_MILLISECONDS) {
  const checks = {
    durationExceedsBrief: holdMilliseconds > 3_200,
    scrollUnchanged: Math.abs(after.scrollY - before.scrollY) <= 0.01,
    scrollOffsetUnchanged: after.scrollOffset === before.scrollOffset,
    targetFrameUnchanged: after.targetFrame === before.targetFrame,
    presentedFrameUnchanged: after.presentedFrame === before.presentedFrame,
    decoderTimeUnchanged: Math.abs(after.currentTime - before.currentTime) <= 0.002,
    decoderPaused: before.paused === true && after.paused === true,
    noPlayCalls: after.telemetry.playCalls === before.telemetry.playCalls,
    noPlayEvents: after.telemetry.playEvents === before.telemetry.playEvents,
    noPlayingEvents: after.telemetry.playingEvents === before.telemetry.playingEvents,
  };
  return { holdMilliseconds, checks, pass: Object.values(checks).every(Boolean) };
}

export function assertInventoryContract() {
  if (SEGMENTS.length !== 13 || SEGMENTS.map((segment) => segment.id).join("|") !== [
    "top-dormancy", "current-orbit", "crt-arrival", "indicator", "phosphor-line", "raster-expansion",
    "raster-settling", "q-appearance", "q-hold", "frontal-approach", "physical-threshold", "digital-breathing", "entry-reveal",
  ].join("|")) throw new Error("piecewise segment inventory differs");
  if (PIECEWISE_COORDINATES.length !== 17 || Object.values(FAMILY_PROFILES).some((profile) => profile.progress.length !== PIECEWISE_COORDINATES.length)) throw new Error("family anchor inventory differs");
  if (VIEWPOINTS.length !== 5 || new Set(VIEWPOINTS.map((view) => `${view.width}x${view.height}`)).size !== 5) throw new Error("responsive viewpoint inventory differs");
  if (!VIEWPOINTS.some((view) => view.input === "wheel") || !VIEWPOINTS.some((view) => view.input === "keyboard") || !VIEWPOINTS.some((view) => view.input === "touch")) throw new Error("native input inventory differs");
  if (RECORDINGS.length !== 12 || new Set(RECORDINGS.map((recording) => recording.id)).size !== RECORDINGS.length
    || [..."ABCDEFGH"].some((gate) => !RECORDINGS.some((recording) => recording.gate === gate))) throw new Error("recording A-H inventory differs");
  if (SHEETS.length !== 10 || Object.keys(REPORT_SCHEMAS).length !== 8 || SUPPORTING_ROUTES.length !== 8 || Object.keys(HUMAN_GATES).length !== 6) throw new Error("artifact/regression inventory differs");
  if (HOLD_MILLISECONDS <= 3_200 || FAMILY_PROFILES.desktop.startupVh < 0.75 || FAMILY_PROFILES.desktop.startupVh > 1
    || FAMILY_PROFILES.shortDesktop.startupVh < 0.65 || FAMILY_PROFILES.shortDesktop.startupVh > 0.85
    || [FAMILY_PROFILES.portrait, FAMILY_PROFILES.landscape].some((profile) => profile.startupVh < 0.6 || profile.startupVh > 0.8)) throw new Error("startup allocation contract differs");
  return true;
}

assertInventoryContract();
