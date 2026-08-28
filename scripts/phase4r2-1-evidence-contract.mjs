import { createHash } from "node:crypto";
import path from "node:path";

export const SCHEMA = "quantum-hub.phase-4-r2-1.browser-evidence.v1";
export const MAIN_SHA = "501040c42bba30b9d9517b88a8f9857992a2dba4";
export const REQUIRED_BRANCH = "repair/phase-4r2-1-causal-signal-scroll-stability";
export const FRAME_COUNT = 540;
export const PHYSICAL_FRAME_COUNT = 500;
export const FPS = 30;
export const FIRST_CHANGED_FRAME = 46;
export const ARRIVAL_FRAME = 285;
export const STABLE_Q_FRAME = 370;
export const BLACK_START_FRAME = 501;
export const ENTRY_START_FRAME = 514;
export const BLACK_BEAT_FRAME_COUNT = ENTRY_START_FRAME - BLACK_START_FRAME;
export const WAKE_DURATION_SECONDS = (STABLE_Q_FRAME - ARRIVAL_FRAME) / FPS;
export const MAX_ACTIVE_ASSET_BYTES = 25 * 1024 * 1024;

export const VIEWPOINTS = Object.freeze([
  { id: "desktop-1440x900", width: 1440, height: 900, family: "desktop", firstInput: true },
  { id: "portrait-390x844", width: 390, height: 844, family: "portrait", firstInput: true },
  { id: "narrow-320x800", width: 320, height: 800, family: "portrait", firstInput: true },
  { id: "tablet-768x1024", width: 768, height: 1024, family: "portrait", firstInput: true },
  { id: "landscape-844x390", width: 844, height: 390, family: "landscape", firstInput: true },
  { id: "landscape-740x360", width: 740, height: 360, family: "landscape" },
  { id: "landscape-800x360", width: 800, height: 360, family: "landscape" },
  { id: "landscape-896x414", width: 896, height: 414, family: "landscape" },
  { id: "landscape-900x480", width: 900, height: 480, family: "landscape" },
]);

export const FIRST_INPUT_PROBES = Object.freeze([
  { id: "programmatic-15px", kind: "programmatic", delta: 15 },
  { id: "programmatic-30px", kind: "programmatic", delta: 30 },
  { id: "programmatic-60px", kind: "programmatic", delta: 60 },
  { id: "small-wheel", kind: "wheel", delta: 15 },
  { id: "normal-wheel", kind: "wheel", delta: 100 },
  { id: "arrow-down", kind: "keyboard", key: "ArrowDown" },
  { id: "touch-delta", kind: "touch", delta: 180 },
]);

/**
 * A-L is the human-facing inventory. E and J are split because the brief asks
 * for distinct reverse phases and three distinct timeout positions.
 */
export const RECORDINGS = Object.freeze([
  { id: "A-first-input-response", gate: "A", viewpoint: "desktop-1440x900", kind: "first-input" },
  { id: "B-ordered-current", gate: "B", viewpoint: "desktop-1440x900", kind: "ordered-current" },
  { id: "C-auto-wake-no-input", gate: "C", viewpoint: "desktop-1440x900", kind: "wake-no-input" },
  { id: "D-auto-wake-continue-forward", gate: "D", viewpoint: "desktop-1440x900", kind: "wake-continue" },
  { id: "E1-auto-wake-reverse-indicator", gate: "E", viewpoint: "desktop-1440x900", kind: "wake-reverse-indicator" },
  { id: "E2-auto-wake-reverse-raster", gate: "E", viewpoint: "desktop-1440x900", kind: "wake-reverse-raster" },
  { id: "E3-auto-wake-reverse-after-q", gate: "E", viewpoint: "desktop-1440x900", kind: "wake-reverse-after-q" },
  { id: "E4-auto-wake-reentry-reload", gate: "E", viewpoint: "desktop-1440x900", kind: "wake-reentry-reload" },
  { id: "F-desktop-forward-to-method", gate: "F", viewpoint: "desktop-1440x900", kind: "full-forward" },
  { id: "G-desktop-reverse-to-dormancy", gate: "G", viewpoint: "desktop-1440x900", kind: "full-reverse" },
  { id: "H-fast-jump-settled-and-top", gate: "H", viewpoint: "desktop-1440x900", kind: "fast-jump" },
  { id: "I-landscape-844x390-forward", gate: "I", viewpoint: "landscape-844x390", kind: "full-forward" },
  { id: "J1-timeout-mid-current", gate: "J", viewpoint: "desktop-1440x900", kind: "timeout", position: "mid-current" },
  { id: "J2-timeout-entry", gate: "J", viewpoint: "desktop-1440x900", kind: "timeout", position: "entry" },
  { id: "J3-timeout-method", gate: "J", viewpoint: "desktop-1440x900", kind: "timeout", position: "method" },
  { id: "K-narrow-320x800-journey", gate: "K", viewpoint: "narrow-320x800", kind: "full-forward" },
  { id: "L-tablet-768x1024-journey", gate: "L", viewpoint: "tablet-768x1024", kind: "full-forward" },
]);

/**
 * Browser recording duration is scheduling-dependent, so an exact frame count
 * cannot be known before capture. These lower bounds make the later exact
 * decoded-frame ledger meaningful: a truncated two-frame clip cannot declare
 * itself authoritative merely by calling its observed count "expected".
 */
export const MINIMUM_RECORDING_SECONDS = Object.freeze({
  "A-first-input-response": 1,
  "B-ordered-current": 8,
  "C-auto-wake-no-input": 2.7,
  "D-auto-wake-continue-forward": 1,
  "E1-auto-wake-reverse-indicator": 0.5,
  "E2-auto-wake-reverse-raster": 1,
  "E3-auto-wake-reverse-after-q": 2.7,
  "E4-auto-wake-reentry-reload": 5.4,
  "F-desktop-forward-to-method": 12,
  "G-desktop-reverse-to-dormancy": 12,
  "H-fast-jump-settled-and-top": 2,
  "I-landscape-844x390-forward": 10,
  "J1-timeout-mid-current": 12,
  "J2-timeout-entry": 12,
  "J3-timeout-method": 12,
  "K-narrow-320x800-journey": 10,
  "L-tablet-768x1024-journey": 10,
});

export const SHEETS = Object.freeze([
  { id: "01-first-input-before-after", title: "FIRST INPUT · BEFORE / AFTER" },
  { id: "02-root-cause-matrix", title: "SIGNAL ROOT-CAUSE MATRIX" },
  { id: "03-current-loop-order", title: "ONE ORDERED CURRENT FRONT" },
  { id: "04-full-arrival-cable", title: "FULL ARRIVAL CABLE" },
  { id: "05-auto-wake", title: "AUTOMATIC CRT WAKE" },
  { id: "06-reverse-wake", title: "REVERSE WAKE" },
  { id: "07-desktop-production", title: "DESKTOP PRODUCTION" },
  { id: "08-portal", title: "PORTAL" },
  { id: "09-physical-dom-continuity", title: "PHYSICAL / DOM CONTINUITY" },
  { id: "10-landscape-844x390", title: "844 × 390" },
  { id: "11-short-landscape-neighbors", title: "SHORT-LANDSCAPE NEIGHBORS" },
  { id: "12-timeout-geometry", title: "TIMEOUT GEOMETRY" },
  { id: "13-chrome-visibility", title: "CHROME VISIBILITY" },
  { id: "14-reduced-motion", title: "REDUCED MOTION" },
  { id: "15-no-javascript", title: "NO JAVASCRIPT" },
  { id: "16-zoom-200", title: "200%" },
  { id: "17-operating-field-regression", title: "OPERATING FIELD REGRESSION" },
]);

export const CURRENT_PROGRESS_SAMPLES = Object.freeze([0, 5, 10, 15, 25, 40, 50, 60, 75, 90, 97, 100]);
export const TIMEOUT_POSITIONS = Object.freeze(["top", "mid-current", "entry", "built-with-industry", "method", "bottom-conversion"]);
export const SHORT_LANDSCAPE_IDS = Object.freeze(["landscape-740x360", "landscape-800x360", "landscape-844x390", "landscape-896x414", "landscape-900x480"]);
export const SUPPORTING_ROUTES = Object.freeze(["/for-partners/", "/for-startups/", "/industries/", "/pocs/", "/pocs/maradin/", "/spark/", "/about/", "/contact/", "/404/"]);

export const HUMAN_GATES = Object.freeze({
  "PHYSICAL → DIGITAL CONTINUITY": "PENDING HUMAN REVIEW",
  "NATIVE SCROLL + REVERSE INTEGRITY": "PENDING HUMAN REVIEW",
  "RESPONSIVE + ACCESSIBLE INTEGRATION": "PENDING HUMAN REVIEW",
  "MEDIA + PERFORMANCE SAFETY": "PENDING HUMAN REVIEW",
  "OPERATING FIELD REGRESSION": "PENDING HUMAN REVIEW",
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

export function normalizeTargetUrl(value, mode) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("capture URL must be a credential-free origin root");
  }
  const loopback = /^(?:localhost|127\.0\.0\.1|\[?::1\]?)$/i.test(url.hostname);
  if (mode === "local" && (!loopback || url.protocol !== "http:")) throw new Error("local capture requires an HTTP loopback origin");
  if (mode === "deployed" && (loopback || url.protocol !== "https:")) throw new Error("deployed capture requires a non-loopback HTTPS origin");
  return url.toString();
}

export function validateActiveManifest(manifest, expectedSourceSha256) {
  if (manifest?.schema !== "quantum-hub.phase-4-r2.production-media-manifest.v1" || manifest.status !== "PASS") {
    throw new Error("active R2.1 production manifest schema/status mismatch");
  }
  if (!/^[0-9a-f]{64}$/.test(expectedSourceSha256 ?? "") || manifest.sourceBlendSha256 !== expectedSourceSha256) {
    throw new Error("active manifest source authority mismatch");
  }
  if (manifest.physicalTimeline?.frames !== PHYSICAL_FRAME_COUNT || manifest.physicalTimeline?.fps !== FPS) {
    throw new Error("active manifest physical timeline mismatch");
  }
  if (manifest.deliveryPolicy?.h264Only !== true || manifest.deliveryPolicy?.activeVideoCount !== 3 || manifest.deliveryPolicy?.activePosterCount !== 3 || manifest.deliveryPolicy?.inactiveCodecPayloadCount !== 0) {
    throw new Error("active manifest is not the exact H.264-only policy");
  }
  if (manifest.authorization?.mergeMain !== false || manifest.authorization?.phase5 !== false) {
    throw new Error("active manifest authorization denial flags differ");
  }
  const assets = manifest.assets;
  if (!Array.isArray(assets) || assets.length !== 6 || new Set(assets.map((asset) => asset.file)).size !== 6) {
    throw new Error("active manifest must expose exactly six unique runtime assets");
  }
  const families = ["desktop", "portrait", "landscape"];
  for (const family of families) {
    const videos = assets.filter((asset) => asset.kind === "video" && asset.family === family);
    const posters = assets.filter((asset) => asset.kind === "poster" && asset.family === family);
    if (videos.length !== 1 || videos[0].codec !== "h264" || !/^media\/[a-z0-9._-]+\.mp4$/i.test(videos[0].file)
      || videos[0].frames !== PHYSICAL_FRAME_COUNT || videos[0].fps !== FPS
      || !Number.isSafeInteger(videos[0].bytes) || videos[0].bytes <= 0 || videos[0].bytes > MAX_ACTIVE_ASSET_BYTES || !/^[0-9a-f]{64}$/.test(videos[0].sha256 ?? "")) {
      throw new Error(`${family} active video authority mismatch`);
    }
    if (posters.length !== 1 || !/^posters\/[a-z0-9._-]+\.png$/i.test(posters[0].file)
      || !Number.isSafeInteger(posters[0].bytes) || posters[0].bytes <= 0 || posters[0].bytes > MAX_ACTIVE_ASSET_BYTES || !/^[0-9a-f]{64}$/.test(posters[0].sha256 ?? "")) {
      throw new Error(`${family} active poster authority mismatch`);
    }
  }
  if (assets.some((asset) => asset.codec === "vp9" || /\.webm$/i.test(asset.file)) || /(?:vp9|webm)/i.test(JSON.stringify(manifest))) throw new Error("VP9/WebM may not appear in the active manifest");
  return true;
}

export function mediaUrlPath(manifestUrlPath, assetFile) {
  if (!/^\/[a-z0-9._\/-]+\.json$/i.test(manifestUrlPath) || manifestUrlPath.includes("..")) throw new Error("invalid public manifest path");
  const manifestDirectory = path.posix.dirname(manifestUrlPath);
  const root = path.posix.dirname(manifestDirectory);
  const candidate = path.posix.normalize(`${root}/${assetFile}`);
  if (!candidate.startsWith(`${root}/`) || candidate.includes("..")) throw new Error("asset escapes the public media root");
  return candidate;
}

export function assertInventoryContract() {
  const gates = new Set(RECORDINGS.map((item) => item.gate));
  if ([..."ABCDEFGHIJKL"].some((gate) => !gates.has(gate))) throw new Error("recording A-L coverage is incomplete");
  if (RECORDINGS.length !== 17 || new Set(RECORDINGS.map((item) => item.id)).size !== RECORDINGS.length) throw new Error("recording inventory differs");
  if (Object.keys(MINIMUM_RECORDING_SECONDS).length !== RECORDINGS.length
    || RECORDINGS.some((item) => !(MINIMUM_RECORDING_SECONDS[item.id] > 0))) throw new Error("recording duration contract differs");
  if (RECORDINGS.filter((item) => item.gate === "J").length !== 3 || RECORDINGS.filter((item) => item.gate === "E").length !== 4) throw new Error("split E/J recording inventory differs");
  if (SHEETS.length !== 17 || new Set(SHEETS.map((item) => item.id)).size !== SHEETS.length) throw new Error("sheet inventory differs");
  if (VIEWPOINTS.filter((item) => item.firstInput).length !== 5 || FIRST_INPUT_PROBES.length !== 7) throw new Error("first-input matrix differs");
  if (CURRENT_PROGRESS_SAMPLES.join(",") !== "0,5,10,15,25,40,50,60,75,90,97,100") throw new Error("current sample inventory differs");
  if (TIMEOUT_POSITIONS.length !== 6 || SHORT_LANDSCAPE_IDS.length !== 5 || Object.keys(HUMAN_GATES).length !== 5) throw new Error("responsive/timeout/gate inventory differs");
  return true;
}

assertInventoryContract();
