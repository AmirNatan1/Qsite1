#!/usr/bin/env node

/**
 * Phase 7C genuine installed-Google-Chrome browser-native 200% evidence.
 *
 * The tool launches the installed Chrome executable in a fresh disposable
 * profile with Playwright's viewport disabled. It deliberately does not send
 * operating-system keyboard input. Instead it prints one session-bound READY
 * record, waits for `CAPTURE <session-id>` on stdin, and measures the same live
 * page after an external operator has used normal Chrome keyboard zoom.
 */

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createInterface } from "node:readline";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  PHASE7C_BRANCH,
  PHASE7C_FROZEN_MAIN,
  PHASE7C_INDUSTRIES,
  PHASE7C_PARENT,
  PHASE7C_PROOF_RECORD,
} from "./phase7c-contract.mjs";
import {
  DEFAULT_FFMPEG_CANDIDATES,
  DEFAULT_FFPROBE_CANDIDATES,
} from "./capture-phase7a-r1-closure.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const NATIVE200_SCHEMA = "quantum-hub.phase-7c.installed-chrome-native-200.v1";
export const NATIVE200_MANIFEST_SCHEMA = "quantum-hub.phase-7c.installed-chrome-native-200-manifest.v1";
export const NATIVE200_REPORT_NAME = "installed-chrome-native-200.json";
export const NATIVE200_MANIFEST_NAME = "installed-chrome-native-200-manifest.json";
export const NATIVE200_RECORDING_NAME = "installed-chrome-native-200.mp4";
export const NATIVE200_LIMITATION = "LIMITATION — COMPUTER USE URL VERIFICATION";
export const NATIVE200_SCREENSHOTS = Object.freeze({
  baseline: "chrome-page-baseline-100.png",
  automotive: "territory-automotive-200.png",
  logistics: "territory-logistics-200.png",
  manufacturing: "territory-manufacturing-200.png",
  energy: "territory-energy-200.png",
  proofTitle: "territory-proof-title-200.png",
  proofRecord: "territory-proof-record-200.png",
  proofLink: "territory-proof-link-200.png",
  fieldMap: "field-map-open-200.png",
});

const execFileAsync = promisify(execFile);
const HASH_40 = /^[0-9a-f]{40}$/;
const HASH_64 = /^[0-9a-f]{64}$/;
const ZOOM_TOLERANCE = 0.08;
const OUTER_DIMENSION_TOLERANCE = 3;
const SCREEN_DIMENSION_TOLERANCE = 1;
const FRAME_RATE = 6;
const MANUFACTURING_ATOMS = Object.freeze(["Industry 4.0 /", "Advanced", "Manufacturing"]);
const EXPECTED_FIELD_MAP_CONTROLS = 9;
const EXPECTED_FIELD_MAP_LINKS = 8;
const PROHIBITED_LAUNCH_ARGUMENTS = Object.freeze([
  "--force-device-scale-factor",
  "--window-size",
  "--user-agent",
  "--use-mobile-user-agent",
  "--touch-events",
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function within(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function portableJson(value) {
  const serialized = `${JSON.stringify(canonical(value), null, 2)}\n`;
  invariant(!/(?:[a-z]:\\Users\\|file:\/\/|\/(?:Users|home)\/)/i.test(serialized), "native-200 evidence exposes a private local path");
  return serialized;
}

function nextValue(argv, index, flag) {
  const value = argv[index + 1];
  invariant(value && !value.startsWith("--"), `${flag} requires a value`);
  return value;
}

function normalizeTargetUrl(value) {
  const target = new URL(value);
  invariant(["http:", "https:"].includes(target.protocol), "--url must use HTTP(S)");
  invariant(!target.username && !target.password, "--url must not contain credentials");
  return target.toString();
}

function assertExternalOutput(output) {
  invariant(typeof output === "string" && output.length > 0, "--output is required");
  const resolved = path.resolve(output);
  invariant(
    resolved !== path.parse(resolved).root && !within(ROOT, resolved) && !within(os.tmpdir(), resolved),
    "--output must be a fresh durable external directory",
  );
  return resolved;
}

export function parseArguments(argv) {
  const options = {
    chrome: "",
    environmentalLimitation: "",
    ffmpeg: "",
    ffprobe: "",
    handshakeTimeoutMs: 300_000,
    help: false,
    output: "",
    revision: "",
    selfTest: false,
    skipRecording: false,
    timeoutMs: 45_000,
    url: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => {
      const value = nextValue(argv, index, flag);
      index += 1;
      return value;
    };
    if (flag === "--chrome") options.chrome = next();
    else if (flag === "--environmental-limitation") options.environmentalLimitation = next();
    else if (flag === "--ffmpeg") options.ffmpeg = next();
    else if (flag === "--ffprobe") options.ffprobe = next();
    else if (flag === "--handshake-timeout-ms") options.handshakeTimeoutMs = Number(next());
    else if (flag === "--output") options.output = next();
    else if (flag === "--revision") options.revision = next();
    else if (flag === "--timeout-ms") options.timeoutMs = Number(next());
    else if (flag === "--url") options.url = next();
    else if (flag === "--skip-recording") options.skipRecording = true;
    else if (flag === "--self-test") options.selfTest = true;
    else if (flag === "--help" || flag === "-h") options.help = true;
    else throw new Error(`unknown argument: ${flag}`);
  }

  if (!options.help && !options.selfTest) {
    invariant(HASH_40.test(options.revision), "--revision must be an exact lowercase final Phase 7C SHA");
    invariant(options.revision !== PHASE7C_PARENT, "--revision must identify a new Phase 7C commit");
    options.output = assertExternalOutput(options.output);
    invariant(Number.isSafeInteger(options.timeoutMs) && options.timeoutMs >= 5_000 && options.timeoutMs <= 120_000, "--timeout-ms is invalid");
    invariant(
      Number.isSafeInteger(options.handshakeTimeoutMs)
        && options.handshakeTimeoutMs >= 10_000
        && options.handshakeTimeoutMs <= 600_000,
      "--handshake-timeout-ms is invalid",
    );
    if (options.environmentalLimitation) {
      invariant(options.environmentalLimitation.trim().length >= 30, "--environmental-limitation must explain the unavailable observation");
    } else {
      options.url = normalizeTargetUrl(options.url);
      if (options.chrome) options.chrome = path.resolve(options.chrome);
    }
  }
  return options;
}

export function installedChromeCandidates(environment = process.env, platform = process.platform) {
  if (platform !== "win32") return [];
  const candidates = [
    environment.PROGRAMFILES && path.join(environment.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    environment["PROGRAMFILES(X86)"] && path.join(environment["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
    environment.LOCALAPPDATA && path.join(environment.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean).map((candidate) => path.resolve(candidate));
  return [...new Set(candidates)];
}

async function resolveChromeExecutable(requested) {
  const candidates = requested ? [requested] : installedChromeCandidates();
  invariant(candidates.length > 0, "installed Google Chrome candidates are unavailable on this platform");
  for (const candidate of candidates) {
    try {
      const info = await lstat(candidate);
      if (!info.isFile() || !/^chrome(?:\.exe)?$/i.test(path.basename(candidate))) continue;
      return candidate;
    } catch {
      // Continue only through the bounded installed-Chrome candidate list.
    }
  }
  throw new Error("installed Google Chrome executable is unavailable");
}

async function gitText(args) {
  const result = await execFileAsync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
    timeout: 20_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return String(result.stdout).trim();
}

async function repositoryAuthority(revision) {
  const [branch, head, statusText, upstream, upstreamHead, localMain, originMain, mergeBase, mergesText] = await Promise.all([
    gitText(["branch", "--show-current"]),
    gitText(["rev-parse", "HEAD"]),
    gitText(["status", "--porcelain=v1", "--untracked-files=all"]),
    gitText(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]),
    gitText(["rev-parse", "@{upstream}"]),
    gitText(["rev-parse", "main"]),
    gitText(["rev-parse", "origin/main"]),
    gitText(["merge-base", PHASE7C_PARENT, revision]),
    gitText(["rev-list", "--merges", `${PHASE7C_PARENT}..${revision}`]),
  ]);
  invariant(branch === PHASE7C_BRANCH && head === revision, "native-200 repository branch or HEAD differs");
  invariant(!statusText, "native-200 capture requires a clean worktree including untracked files");
  invariant(upstream === `origin/${PHASE7C_BRANCH}` && upstreamHead === revision, "native-200 capture requires local/upstream parity");
  invariant(localMain === PHASE7C_FROZEN_MAIN && originMain === PHASE7C_FROZEN_MAIN, "main changed");
  invariant(mergeBase === PHASE7C_PARENT && !mergesText, "Phase 7C ancestry is not linear from the accepted parent");
  return {
    branch,
    head,
    localMain,
    originMain,
    requiredParent: PHASE7C_PARENT,
    upstream,
    upstreamHead,
    worktreeClean: true,
    zeroMergeCommits: true,
  };
}

export function validateCaptureHandshake(line, sessionId) {
  invariant(typeof sessionId === "string" && /^[0-9a-f-]{36}$/i.test(sessionId), "capture session id is invalid");
  return String(line ?? "").trim() === `CAPTURE ${sessionId}`;
}

export function waitForCaptureHandshake({ input, sessionId, timeoutMs }) {
  invariant(input && typeof input.on === "function", "handshake input is unavailable");
  invariant(Number.isSafeInteger(timeoutMs) && timeoutMs >= 10 && timeoutMs <= 600_000, "handshake timeout is invalid");
  return new Promise((resolve, reject) => {
    const reader = createInterface({ input, crlfDelay: Infinity, terminal: false });
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reader.close();
      callback(value);
    };
    const timer = setTimeout(() => finish(reject, new Error("bounded external native-zoom handshake timed out")), timeoutMs);
    reader.on("line", (line) => {
      if (String(line).trim() === `ABORT ${sessionId}`) {
        finish(reject, new Error("external native-zoom operator aborted the session"));
      } else if (validateCaptureHandshake(line, sessionId)) {
        finish(resolve, { acknowledgedAt: new Date().toISOString(), sessionId });
      }
    });
    reader.on("error", (error) => finish(reject, error));
    reader.on("close", () => {
      if (!settled) finish(reject, new Error("external native-zoom handshake input closed before capture"));
    });
  });
}

function noSubstitutionGeometry(geometry) {
  return geometry.rootCssZoom === "1"
    && geometry.bodyCssZoom === "1"
    && geometry.rootTransform === "none"
    && geometry.bodyTransform === "none"
    && Math.abs(geometry.visualViewportScale - 1) <= 0.001
    && geometry.playwrightViewport === null;
}

export function validateNativeZoomGeometry(baseline, observed, launchContract) {
  for (const geometry of [baseline, observed]) {
    invariant(
      geometry?.innerWidth > 0
        && geometry.innerHeight > 0
        && geometry.outerWidth > 0
        && geometry.outerHeight > 0
        && geometry.screenWidth > 0
        && geometry.screenHeight > 0
        && geometry.devicePixelRatio > 0,
      "native zoom geometry is incomplete",
    );
  }
  invariant(launchContract?.viewport === null && launchContract.deviceEmulation === false, "Playwright native-window launch contract differs");
  const launchArguments = launchContract.arguments ?? [];
  const forbiddenArguments = launchArguments.filter((argument) => PROHIBITED_LAUNCH_ARGUMENTS.some((prefix) => argument.startsWith(prefix)));
  const widthRatio = baseline.innerWidth / observed.innerWidth;
  const heightRatio = baseline.innerHeight / observed.innerHeight;
  const dprRatio = observed.devicePixelRatio / baseline.devicePixelRatio;
  const checks = {
    reciprocalContentWidth: Math.abs(widthRatio - 2) <= ZOOM_TOLERANCE,
    reciprocalContentHeight: Math.abs(heightRatio - 2) <= ZOOM_TOLERANCE,
    reciprocalDevicePixelRatio: Math.abs(dprRatio - 2) <= ZOOM_TOLERANCE,
    outerWindowStable: Math.abs(baseline.outerWidth - observed.outerWidth) <= OUTER_DIMENSION_TOLERANCE
      && Math.abs(baseline.outerHeight - observed.outerHeight) <= OUTER_DIMENSION_TOLERANCE,
    screenStable: Math.abs(baseline.screenWidth - observed.screenWidth) <= SCREEN_DIMENSION_TOLERANCE
      && Math.abs(baseline.screenHeight - observed.screenHeight) <= SCREEN_DIMENSION_TOLERANCE,
    baselineUnsubstituted: noSubstitutionGeometry(baseline),
    observedUnsubstituted: noSubstitutionGeometry(observed),
    playwrightNativeWindow: launchContract.viewport === null,
    noDeviceEmulation: launchContract.deviceEmulation === false && forbiddenArguments.length === 0,
  };
  invariant(Object.values(checks).every(Boolean), "observed geometry is not genuine installed-Chrome browser-native 200% zoom");
  return {
    baseline,
    checks,
    dprRatio,
    forbiddenArguments,
    heightRatio,
    observed,
    status: "PASS",
    widthRatio,
  };
}

async function observedGeometry(page) {
  const browserGeometry = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    return {
      bodyCssZoom: body.zoom || "1",
      bodyTransform: body.transform || "none",
      devicePixelRatio,
      innerHeight,
      innerWidth,
      outerHeight,
      outerWidth,
      rootCssZoom: root.zoom || "1",
      rootTransform: root.transform || "none",
      screenHeight: screen.height,
      screenWidth: screen.width,
      visualViewportScale: visualViewport?.scale ?? 1,
    };
  });
  return { ...browserGeometry, playwrightViewport: page.viewportSize() };
}

async function waitForNativeZoom(page, baseline, launchContract, timeoutMs) {
  const started = Date.now();
  let lastObserved = null;
  while (Date.now() - started <= timeoutMs) {
    lastObserved = await observedGeometry(page);
    try {
      return {
        latencyMs: Date.now() - started,
        result: validateNativeZoomGeometry(baseline, lastObserved, launchContract),
      };
    } catch {
      await page.waitForTimeout(50);
    }
  }
  throw new Error(`external keyboard handshake completed but native 200% geometry never settled: ${JSON.stringify(lastObserved)}`);
}

async function wheelTo(page, targetY, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await page.evaluate((target) => ({
      height: innerHeight,
      scrollY,
      target: Math.max(0, Math.min(target, document.documentElement.scrollHeight - innerHeight)),
    }), targetY);
    if (Math.abs(state.target - state.scrollY) <= 3) return state.scrollY;
    const delta = Math.max(-state.height * 0.72, Math.min(state.height * 0.72, state.target - state.scrollY));
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(45);
  }
  throw new Error("native wheel delivery did not reach the requested Phase 7C position");
}

async function waitForTerritorySettlement(page, expectedFallback, timeoutMs) {
  await page.waitForFunction((fallback) => {
    const territory = document.querySelector("[data-territory-traverse]");
    return territory?.getAttribute("data-territory-controller") === "ready"
      && territory.getAttribute("data-territory-mode") === "static"
      && territory.getAttribute("data-territory-fallback") === fallback
      && territory.getAttribute("data-territory-projection") === "settled"
      && territory.getAttribute("data-territory-raf") === "idle";
  }, expectedFallback, { timeout: timeoutMs });
}

async function wheelElementIntoAuthorityPosition(page, selector, timeoutMs) {
  const targetY = await page.evaluate((target) => {
    const element = document.querySelector(target);
    if (!(element instanceof HTMLElement)) return null;
    const rect = element.getBoundingClientRect();
    const documentTop = scrollY + rect.top;
    const desiredTop = Math.max(18, (innerHeight - Math.min(rect.height, innerHeight - 36)) / 2);
    return documentTop - desiredTop;
  }, selector);
  invariant(Number.isFinite(targetY), `${selector} is missing`);
  await wheelTo(page, targetY, timeoutMs);
  await page.waitForFunction(() => document.querySelector("[data-territory-traverse]")?.getAttribute("data-territory-projection") === "settled", null, { timeout: timeoutMs });
}

async function territoryStageAuthority(page, stageName, expectedHeading, screenshotPath, timeoutMs) {
  const selector = `[data-territory-stage="${stageName}"]`;
  await wheelElementIntoAuthorityPosition(page, `${selector} .territory-passage__copy`, timeoutMs);
  const authority = await page.evaluate(({ selector: target, expected, atoms }) => {
    const stage = document.querySelector(target);
    const heading = stage?.querySelector("h3");
    const copy = stage?.querySelector(".territory-passage__copy > p:last-child");
    const coordinate = stage?.querySelector(".territory-passage__coordinate");
    const staticVisual = stage?.querySelector("[data-territory-static]");
    const carrier = stage?.querySelector(".territory-static__carrier");
    const rectRecord = (element) => {
      if (!(element instanceof Element)) return null;
      const rect = element.getBoundingClientRect();
      return { bottom: rect.bottom, height: rect.height, left: rect.left, right: rect.right, top: rect.top, width: rect.width };
    };
    const visible = (element, requireViewport = true) => {
      if (!(element instanceof Element)) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const rendered = rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0;
      return rendered && (!requireViewport || (rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1));
    };
    const headingStyle = heading ? getComputedStyle(heading) : null;
    const copyStyle = copy ? getComputedStyle(copy) : null;
    const atomRecords = [...(heading?.querySelectorAll("[data-territory-title-atom]") ?? [])].map((atom) => {
      const clientRects = [...atom.getClientRects()];
      return {
        bounds: rectRecord(atom),
        clientRectCount: clientRects.length,
        fullyInsideHeading: atom.getBoundingClientRect().left >= heading.getBoundingClientRect().left - 1
          && atom.getBoundingClientRect().right <= heading.getBoundingClientRect().right + 1,
        text: atom.textContent?.replace(/\s+/g, " ").trim() ?? "",
        whiteSpace: getComputedStyle(atom).whiteSpace,
      };
    });
    return {
      atomRecords,
      bodyCopy: copy?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      bodyCopyBounds: rectRecord(copy),
      bodyCopyFullyVisible: visible(copy),
      bodyCopyWordBreak: copyStyle?.wordBreak ?? "",
      coordinate: coordinate?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      expectedHeading: expected,
      heading: heading?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      headingBounds: rectRecord(heading),
      headingFullyVisible: visible(heading),
      headingOverflowWrap: headingStyle?.overflowWrap ?? "",
      headingWordBreak: headingStyle?.wordBreak ?? "",
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      stage: target.match(/data-territory-stage="([^"]+)/)?.[1] ?? "",
      staticCarrierVisible: visible(carrier, false),
      staticVisualVisible: visible(staticVisual, false),
      manufacturingAtomsExpected: atoms,
    };
  }, { selector, expected: expectedHeading, atoms: MANUFACTURING_ATOMS });
  const manufacturingChecks = stageName !== "manufacturing" || (
    authority.atomRecords.length === MANUFACTURING_ATOMS.length
    && authority.atomRecords.every((atom, index) => atom.text === MANUFACTURING_ATOMS[index]
      && atom.clientRectCount === 1
      && atom.fullyInsideHeading
      && atom.whiteSpace === "nowrap")
  );
  const checks = {
    bodyCopyPresent: authority.bodyCopy.length > 0,
    copyFullyVisible: authority.bodyCopyFullyVisible,
    exactHeading: authority.heading === expectedHeading,
    headingFullyVisible: authority.headingFullyVisible,
    manufacturingWordIntegrity: manufacturingChecks,
    noHorizontalOverflow: !authority.horizontalOverflow,
    noInternalWordBreaking: !["anywhere", "break-all", "break-word"].includes(authority.headingWordBreak)
      && !["anywhere", "break-all", "break-word"].includes(authority.bodyCopyWordBreak),
    staticCarrierVisible: authority.staticCarrierVisible,
    staticVisualVisible: authority.staticVisualVisible,
  };
  invariant(Object.values(checks).every(Boolean), `${expectedHeading} fails genuine 200% territory authority`);
  await page.screenshot({ path: screenshotPath, type: "png", animations: "disabled", caret: "hide" });
  return { ...authority, checks, status: "PASS" };
}

async function proofAuthority(page, staging, timeoutMs) {
  await wheelElementIntoAuthorityPosition(page, ".territory-proof__content", timeoutMs);
  const titleState = await page.evaluate((expectedTitle) => {
    const root = document.querySelector("[data-proof-threshold][data-proof-record='maradin']");
    const title = root?.querySelector("#territory-proof-title");
    const copy = root?.querySelector(".territory-proof__content > p:not(.territory-proof__eyebrow)");
    const rect = (element) => {
      if (!(element instanceof Element)) return null;
      const value = element.getBoundingClientRect();
      return { bottom: value.bottom, height: value.height, left: value.left, right: value.right, top: value.top, width: value.width };
    };
    const fullyVisible = (element) => {
      if (!(element instanceof Element)) return false;
      const value = element.getBoundingClientRect();
      return value.width > 0 && value.height > 0 && value.left >= -1 && value.right <= innerWidth + 1 && value.top >= -1 && value.bottom <= innerHeight + 1;
    };
    return {
      copy: copy?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      copyBounds: rect(copy),
      copyFullyVisible: fullyVisible(copy),
      expectedTitle,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      title: title?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      titleBounds: rect(title),
      titleFullyVisible: fullyVisible(title),
    };
  }, PHASE7C_PROOF_RECORD);
  await page.screenshot({ path: path.join(staging, NATIVE200_SCREENSHOTS.proofTitle), type: "png", animations: "disabled", caret: "hide" });

  await wheelElementIntoAuthorityPosition(page, ".territory-proof__figure", timeoutMs);
  await page.waitForFunction(() => {
    const image = document.querySelector("[data-proof-threshold][data-proof-record='maradin'] .territory-proof__image");
    return image instanceof HTMLImageElement
      && image.complete
      && image.naturalWidth === 1920
      && image.naturalHeight === 1080;
  }, null, { timeout: timeoutMs });
  const recordState = await page.evaluate(() => {
    const root = document.querySelector("[data-proof-threshold][data-proof-record='maradin']");
    const figure = root?.querySelector(".territory-proof__figure");
    const image = root?.querySelector(".territory-proof__image");
    const link = root?.querySelector(".territory-proof__link");
    const rect = (element) => {
      if (!(element instanceof Element)) return null;
      const value = element.getBoundingClientRect();
      return { bottom: value.bottom, height: value.height, left: value.left, right: value.right, top: value.top, width: value.width };
    };
    const rendered = (element) => {
      if (!(element instanceof Element)) return false;
      const value = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return value.width > 0 && value.height > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0;
    };
    return {
      figureBounds: rect(figure),
      figureVisible: rendered(figure),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      image: image instanceof HTMLImageElement ? {
        alt: image.alt,
        complete: image.complete,
        naturalHeight: image.naturalHeight,
        naturalWidth: image.naturalWidth,
        rendered: rendered(image),
        srcPath: new URL(image.currentSrc || image.src).pathname,
      } : null,
      link: link instanceof HTMLAnchorElement ? {
        accessibleName: link.getAttribute("aria-label") || link.textContent?.replace(/\s+/g, " ").trim() || "",
        bounds: rect(link),
        hrefPath: new URL(link.href).pathname,
        rendered: rendered(link),
      } : null,
    };
  });
  await page.screenshot({ path: path.join(staging, NATIVE200_SCREENSHOTS.proofRecord), type: "png", animations: "disabled", caret: "hide" });
  await wheelElementIntoAuthorityPosition(page, ".territory-proof__link", timeoutMs);
  const linkViewportState = await page.evaluate(() => {
    const link = document.querySelector("[data-proof-threshold][data-proof-record='maradin'] .territory-proof__link");
    if (!(link instanceof HTMLAnchorElement)) return { fullyVisible: false };
    const rect = link.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      fullyVisible: rect.width > 0
        && rect.height > 0
        && rect.left >= -1
        && rect.right <= innerWidth + 1
        && rect.top >= -1
        && rect.bottom <= innerHeight + 1,
      left: rect.left,
      right: rect.right,
      top: rect.top,
    };
  });
  await page.screenshot({ path: path.join(staging, NATIVE200_SCREENSHOTS.proofLink), type: "png", animations: "disabled", caret: "hide" });
  const checks = {
    copyPresent: titleState.copy.length > 0,
    exactTitle: titleState.title === PHASE7C_PROOF_RECORD,
    imageIntrinsicAuthority: recordState.image?.complete === true
      && recordState.image.naturalWidth === 1920
      && recordState.image.naturalHeight === 1080
      && recordState.image.srcPath === "/media/maradin/maradin-field-aperture-poster-approved.jpg",
    imageVisible: recordState.image?.rendered === true && recordState.figureVisible === true,
    linkAuthority: recordState.link?.hrefPath === "/pocs/maradin/"
      && recordState.link.accessibleName.length > 0
      && recordState.link.rendered === true
      && linkViewportState.fullyVisible,
    linkTargetSize: recordState.link?.bounds?.width >= 44 && recordState.link?.bounds?.height >= 44,
    noHorizontalOverflow: !titleState.horizontalOverflow && !recordState.horizontalOverflow,
    titleAndCopyVisible: titleState.titleFullyVisible && titleState.copyFullyVisible,
  };
  invariant(Object.values(checks).every(Boolean), "Maradin proof threshold fails genuine 200% authority");
  return { checks, linkViewportState, recordState, status: "PASS", titleState };
}

function activeDescriptor() {
  const active = document.activeElement;
  const map = document.querySelector("[data-field-map]");
  if (!(active instanceof HTMLElement) || !map?.contains(active)) return { id: active === document.body ? "BODY" : "OUTSIDE", inMap: false };
  if (active.matches("summary")) return { id: "summary", inMap: true, tag: "summary" };
  const links = [...map.querySelectorAll(".field-map-destination")];
  const index = links.indexOf(active);
  return {
    accessibleName: active.getAttribute("aria-label") || active.textContent?.replace(/\s+/g, " ").trim() || "",
    id: index >= 0 ? `destination-${index + 1}` : "map-other",
    inMap: true,
    tag: active.tagName.toLowerCase(),
  };
}

async function fieldMapAuthority(page, staging, timeoutMs) {
  await wheelTo(page, 0, timeoutMs);
  const summary = page.locator("[data-field-map] > summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(({ linkCount }) => {
    const map = document.querySelector("[data-field-map]");
    const links = [...document.querySelectorAll("[data-field-map] .field-map-destination")];
    const visible = links.every((link) => {
      const rect = link.getBoundingClientRect();
      const style = getComputedStyle(link);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    });
    return map?.hasAttribute("open")
      && map.getAttribute("data-controller") === "ready"
      && links.length === linkCount
      && visible
      && document.querySelectorAll("[data-field-map-background][inert]").length > 0
      && document.activeElement?.closest("[data-field-map]") === map;
  }, { linkCount: EXPECTED_FIELD_MAP_LINKS }, { timeout: timeoutMs });

  const open = await page.evaluate(() => ({
    backgroundFocusable: [...document.querySelectorAll("a[href], button, summary, input, select, textarea, [tabindex]")]
      .filter((element) => !element.closest("[data-field-map]") && !element.closest("[inert]") && element.getClientRects().length > 0).length,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    inertRegions: document.querySelectorAll("[data-field-map-background][inert]").length,
    links: [...document.querySelectorAll("[data-field-map] .field-map-destination")].map((link) => {
      const rect = link.getBoundingClientRect();
      return {
        accessibleName: link.getAttribute("aria-label") || link.textContent?.replace(/\s+/g, " ").trim() || "",
        height: rect.height,
        href: link.getAttribute("href"),
        rendered: rect.width > 0 && rect.height > 0,
        width: rect.width,
      };
    }),
  }));
  open.active = await page.evaluate(activeDescriptor);

  const forward = [];
  for (let index = 0; index < EXPECTED_FIELD_MAP_CONTROLS; index += 1) {
    forward.push(await page.evaluate(activeDescriptor));
    await page.keyboard.press("Tab");
  }
  await page.locator("[data-field-map] > summary").focus();
  const reverse = [];
  for (let index = 0; index < EXPECTED_FIELD_MAP_CONTROLS; index += 1) {
    reverse.push(await page.evaluate(activeDescriptor));
    await page.keyboard.press("Shift+Tab");
  }
  await page.screenshot({ path: path.join(staging, NATIVE200_SCREENSHOTS.fieldMap), type: "png", animations: "disabled", caret: "hide" });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => {
    const map = document.querySelector("[data-field-map]");
    return !map?.hasAttribute("open")
      && document.querySelectorAll("[data-field-map-background][inert]").length === 0
      && document.activeElement?.matches("[data-field-map] > summary");
  }, null, { timeout: timeoutMs });
  const closed = await page.evaluate(() => ({
    inertRegions: document.querySelectorAll("[data-field-map-background][inert]").length,
    open: document.querySelector("[data-field-map]")?.hasAttribute("open") ?? false,
  }));
  closed.active = await page.evaluate(activeDescriptor);
  const sequenceAuthority = (sequence) => sequence.length === EXPECTED_FIELD_MAP_CONTROLS
    && sequence.every(({ inMap, id }) => inMap && id !== "BODY" && id !== "OUTSIDE")
    && new Set(sequence.map(({ id }) => id)).size === EXPECTED_FIELD_MAP_CONTROLS;
  const checks = {
    eightLinks: open.links.length === EXPECTED_FIELD_MAP_LINKS,
    escapeReturnsFocus: !closed.open && closed.inertRegions === 0 && closed.active.id === "summary",
    forwardContained: sequenceAuthority(forward),
    linksMeasurable: open.links.every(({ rendered }) => rendered),
    noBackgroundFocusable: open.backgroundFocusable === 0,
    noHorizontalOverflow: !open.horizontalOverflow,
    openInertAuthority: open.inertRegions > 0,
    reverseContained: sequenceAuthority(reverse),
    targetSizes: open.links.every(({ width, height }) => width >= 44 && height >= 44),
  };
  invariant(Object.values(checks).every(Boolean), "Field Map fails genuine 200% keyboard/inert authority");
  return { checks, closed, forward, open, reverse, status: "PASS" };
}

async function executableCommand(candidates) {
  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ["-version"], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 10_000,
        maxBuffer: 1024 * 1024,
      });
      return candidate;
    } catch {
      // Continue through the bounded candidate list.
    }
  }
  return "";
}

async function resolveOptionalMediaTools(options) {
  if (options.skipRecording) return null;
  const ffmpeg = await executableCommand(options.ffmpeg ? [options.ffmpeg] : DEFAULT_FFMPEG_CANDIDATES);
  if (!ffmpeg) return null;
  const sibling = path.join(path.dirname(path.resolve(ffmpeg)), process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
  const ffprobe = await executableCommand(options.ffprobe ? [options.ffprobe] : [sibling, ...DEFAULT_FFPROBE_CANDIDATES]);
  if (!ffprobe) return null;
  return { ffmpeg, ffprobe };
}

async function captureFrames(page, directory, state) {
  let index = 0;
  while (!state.stopped) {
    index += 1;
    await page.screenshot({
      animations: "disabled",
      caret: "hide",
      path: path.join(directory, `frame-${String(index).padStart(6, "0")}.png`),
      type: "png",
    });
    await page.waitForTimeout(Math.round(1000 / FRAME_RATE));
  }
  return index;
}

async function encodeRecording(tools, frameDirectory, destination) {
  await execFileAsync(tools.ffmpeg, [
    "-v", "error", "-n", "-framerate", String(FRAME_RATE), "-i", path.join(frameDirectory, "frame-%06d.png"),
    "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", destination,
  ], { encoding: "utf8", windowsHide: true, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
  await execFileAsync(tools.ffmpeg, ["-v", "error", "-i", destination, "-f", "null", "-"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const probeResult = await execFileAsync(tools.ffprobe, [
    "-v", "error", "-show_entries", "format=duration,format_name:stream=codec_type,codec_name,pix_fmt,width,height", "-of", "json", destination,
  ], { encoding: "utf8", windowsHide: true, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  const probe = JSON.parse(probeResult.stdout);
  const videos = probe.streams.filter(({ codec_type: type }) => type === "video");
  const audios = probe.streams.filter(({ codec_type: type }) => type === "audio");
  invariant(videos.length === 1 && audios.length === 0 && videos[0].codec_name === "h264" && videos[0].pix_fmt === "yuv420p", "native-200 recording media contract differs");
  const bytes = await readFile(destination);
  return {
    audioStreams: 0,
    bytes: bytes.length,
    codec: videos[0].codec_name,
    durationSeconds: Number(probe.format.duration),
    fullDecode: true,
    height: videos[0].height,
    path: NATIVE200_RECORDING_NAME,
    pixelFormat: videos[0].pix_fmt,
    sha256: digest(bytes),
    status: "PASS",
    width: videos[0].width,
  };
}

function pngAuthority(bytes) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  invariant(bytes.length > 33 && bytes.subarray(0, 8).equals(signature), "capture is not a PNG");
  invariant(bytes.subarray(12, 16).toString("ascii") === "IHDR", "capture PNG lacks IHDR");
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  invariant(width > 0 && height > 0, "capture PNG dimensions are empty");
  return { bytes: bytes.length, format: "png", height, sha256: digest(bytes), width };
}

async function screenshotInventory(staging) {
  return Promise.all(Object.values(NATIVE200_SCREENSHOTS).map(async (name) => {
    const authority = pngAuthority(await readFile(path.join(staging, name)));
    return { path: name, ...authority };
  }));
}

export function validateInstalledReport(report) {
  invariant(report?.schema === NATIVE200_SCHEMA && ["PASS", "LIMITATION"].includes(report.status), "installed-Chrome report schema/status differs");
  invariant(report.browser === "Google Chrome" && report.genuineInstalledChrome === true && report.nativeZoomPercent === 200, "installed-Chrome identity differs");
  if (report.status === "LIMITATION") {
    invariant(report.classification === NATIVE200_LIMITATION, "native-200 limitation classification differs");
    invariant(typeof report.environmentalLimitation === "string" && report.environmentalLimitation.length >= 30, "native-200 limitation reason is incomplete");
    invariant(report.zoomGeometry === null && report.screenshots === null && report.recording === null, "native-200 limitation overstates captured evidence");
    invariant(report.osLevelZoomHandshake === null && report.territories === null && report.proof === null && report.fieldMap === null, "native-200 limitation overstates browser authority");
    portableJson(report);
    return true;
  }

  invariant(report.classification === "PASS" && report.environmentalLimitation === null, "native-200 PASS classification differs");
  invariant(/^Chrome\/[0-9.]+$/.test(report.browserVersion ?? ""), "installed Google Chrome product identity differs");
  invariant(report.exactTargetUrl === report.observedTargetUrl && /^https?:\/\//.test(report.exactTargetUrl), "exact browser target URL differs");
  invariant(report.osLevelZoomHandshake?.externalOperatorAcknowledged === true && report.osLevelZoomHandshake.toolSentOsInput === false, "external native-zoom handshake authority differs");
  invariant(report.zoomGeometry?.status === "PASS" && Object.values(report.zoomGeometry.checks ?? {}).every(Boolean), "native 200% geometry authority differs");
  invariant(report.launchContract?.viewport === null && report.launchContract.deviceEmulation === false && report.launchContract.osKeyboardInputByTool === false, "native launch/emulation contract differs");
  invariant(report.presentation?.mode === "static" && report.presentation.fallback === "text-zoom" && report.presentation.projection === "settled", "native-200 territory presentation mode differs");
  invariant(Array.isArray(report.territories) && report.territories.length === PHASE7C_INDUSTRIES.length, "native-200 territory inventory differs");
  report.territories.forEach((territory, index) => {
    invariant(territory.heading === PHASE7C_INDUSTRIES[index] && territory.status === "PASS" && Object.values(territory.checks ?? {}).every(Boolean), `native-200 ${PHASE7C_INDUSTRIES[index]} authority differs`);
  });
  const manufacturing = report.territories[2];
  invariant(manufacturing.atomRecords.length === MANUFACTURING_ATOMS.length && manufacturing.atomRecords.every((atom, index) => atom.text === MANUFACTURING_ATOMS[index] && atom.clientRectCount === 1), "Manufacturing word integrity differs");
  invariant(report.carrier?.enhancedCarrierCount === 1 && report.carrier.staticCarrierCount === 4 && report.carrier.everyStaticCarrierVisible === true, "native-200 carrier authority differs");
  invariant(report.proof?.status === "PASS" && Object.values(report.proof.checks ?? {}).every(Boolean), "native-200 proof threshold authority differs");
  invariant(report.fieldMap?.status === "PASS" && Object.values(report.fieldMap.checks ?? {}).every(Boolean), "native-200 Field Map authority differs");
  invariant(Array.isArray(report.screenshots) && report.screenshots.length === Object.keys(NATIVE200_SCREENSHOTS).length && report.screenshots.every((item) => item.bytes > 0 && HASH_64.test(item.sha256 ?? "")), "native-200 screenshot inventory differs");
  invariant(report.recording?.status === "PASS" || report.recording?.status === "NOT AVAILABLE TO EXECUTION ENVIRONMENT", "native-200 recording status differs");
  if (report.recording.status === "PASS") {
    invariant(report.recording.path === NATIVE200_RECORDING_NAME && report.recording.bytes > 0 && HASH_64.test(report.recording.sha256 ?? "") && report.recording.fullDecode === true, "native-200 recording authority differs");
  } else invariant(report.recording.path === null, "unavailable recording overstates media evidence");
  invariant(report.profile?.fresh === true && report.profile.isolated === true && report.profile.deletedAfterCapture === true && report.profile.pathReported === false, "disposable Chrome profile authority differs");
  invariant(report.humanGate === "PENDING HUMAN REVIEW", "native-200 evidence cannot self-accept the human gate");
  portableJson(report);
  return true;
}

async function writeEvidenceManifest(staging, report) {
  const payloadNames = [NATIVE200_REPORT_NAME, ...Object.values(NATIVE200_SCREENSHOTS)];
  if (report.recording?.status === "PASS") payloadNames.push(NATIVE200_RECORDING_NAME);
  const payloads = [];
  for (const name of payloadNames.sort()) {
    const bytes = await readFile(path.join(staging, name));
    payloads.push({ bytes: bytes.length, path: name, sha256: digest(bytes) });
  }
  const manifest = {
    generatedAt: new Date().toISOString(),
    payloadCount: payloads.length,
    payloads,
    schema: NATIVE200_MANIFEST_SCHEMA,
    status: report.status,
  };
  await writeFile(path.join(staging, NATIVE200_MANIFEST_NAME), portableJson(manifest), { encoding: "utf8", flag: "wx" });
  return manifest;
}

async function freshExternalOutput(output) {
  invariant(!await stat(output).then(() => true).catch(() => false), "refusing to overwrite existing native-200 evidence");
  let ancestor = path.dirname(output);
  while (!await stat(ancestor).then(() => true).catch(() => false)) ancestor = path.dirname(ancestor);
  const [realAncestor, realRoot, realTemp] = await Promise.all([realpath(ancestor), realpath(ROOT), realpath(os.tmpdir())]);
  invariant(!within(realRoot, realAncestor) && !within(realTemp, realAncestor), "native-200 output resolves inside forbidden storage");
  await mkdir(path.dirname(output), { recursive: true });
}

async function writeLimitation(options, staging) {
  const repository = await repositoryAuthority(options.revision);
  const report = {
    browser: "Google Chrome",
    classification: NATIVE200_LIMITATION,
    environmentalLimitation: options.environmentalLimitation.trim(),
    fieldMap: null,
    genuineInstalledChrome: true,
    humanGate: "PENDING HUMAN REVIEW",
    nativeZoomPercent: 200,
    observedTargetUrl: null,
    osLevelZoomHandshake: null,
    proof: null,
    recording: null,
    repository,
    revision: options.revision,
    schema: NATIVE200_SCHEMA,
    screenshots: null,
    status: "LIMITATION",
    territories: null,
    zoomGeometry: null,
  };
  validateInstalledReport(report);
  await writeFile(path.join(staging, NATIVE200_REPORT_NAME), portableJson(report), { encoding: "utf8", flag: "wx" });
  await writeEvidenceManifest(staging, report);
  return report;
}

async function capture(options, staging) {
  const repository = await repositoryAuthority(options.revision);
  const executable = await resolveChromeExecutable(options.chrome);
  const mediaTools = await resolveOptionalMediaTools(options);
  const profilePath = await mkdtemp(path.join(os.tmpdir(), "qsite1-phase7c-native200-"));
  const launchArguments = [
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-sync",
    "--new-window",
    "--no-default-browser-check",
    "--no-first-run",
  ];
  const launchContract = {
    arguments: launchArguments,
    deviceEmulation: false,
    executableName: path.basename(executable),
    freshIsolatedProfile: true,
    headless: false,
    osKeyboardInputByTool: false,
    viewport: null,
  };
  invariant(!launchArguments.some((argument) => PROHIBITED_LAUNCH_ARGUMENTS.some((prefix) => argument.startsWith(prefix))), "forbidden native-200 launch argument requested");
  const { chromium } = await import("playwright-core");
  let context;
  let captureData;
  try {
    context = await chromium.launchPersistentContext(profilePath, {
      args: launchArguments,
      executablePath: executable,
      headless: false,
      viewport: null,
    });
    const pages = context.pages();
    const page = pages[0] ?? await context.newPage();
    for (const extra of context.pages().filter((candidate) => candidate !== page)) await extra.close();
    page.setDefaultTimeout(options.timeoutMs);
    await page.bringToFront();
    const response = await page.goto(options.url, { waitUntil: "load", timeout: options.timeoutMs });
    invariant(response?.status() === 200, "installed Chrome target did not load successfully");
    invariant(page.url() === options.url, `installed Chrome exact target URL differs: ${page.url()}`);
    await page.waitForSelector("[data-territory-traverse]");
    await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());
    await page.waitForFunction(() => document.querySelector("[data-territory-traverse]")?.getAttribute("data-territory-projection") === "settled", null, { timeout: options.timeoutMs });
    const session = await context.newCDPSession(page);
    const product = await session.send("Browser.getVersion");
    await session.detach();
    invariant(/^Chrome\/[0-9.]+$/.test(product.product ?? ""), "launched browser is not installed Google Chrome");
    invariant(!/HeadlessChrome/i.test(product.userAgent ?? ""), "launched Chrome is headless");
    const baseline = await observedGeometry(page);
    invariant(noSubstitutionGeometry(baseline), "100% baseline contains viewport/CSS/transform substitution");
    await page.screenshot({ path: path.join(staging, NATIVE200_SCREENSHOTS.baseline), type: "png", animations: "disabled", caret: "hide" });

    const handshakeSessionId = randomUUID();
    const ready = {
      baseline: {
        devicePixelRatio: baseline.devicePixelRatio,
        innerHeight: baseline.innerHeight,
        innerWidth: baseline.innerWidth,
        outerHeight: baseline.outerHeight,
        outerWidth: baseline.outerWidth,
      },
      browserVersion: product.product,
      exactTargetUrl: options.url,
      instruction: "Focus the one fresh Google Chrome window matching this exact URL; use normal OS-level Chrome keyboard zoom until the visible browser UI reads 200%; then send CAPTURE <sessionId> to this process stdin. Do not resize or emulate the page.",
      pageTitle: await page.title(),
      sessionId: handshakeSessionId,
    };
    process.stdout.write(`PHASE7C_NATIVE200_READY ${JSON.stringify(ready)}\n`);
    const handshake = await waitForCaptureHandshake({ input: process.stdin, sessionId: handshakeSessionId, timeoutMs: options.handshakeTimeoutMs });
    await page.bringToFront();
    const zoomSettlement = await waitForNativeZoom(page, baseline, launchContract, Math.min(options.timeoutMs, 15_000));
    invariant(page.url() === options.url, "exact installed-Chrome target URL changed during native zoom");
    await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());
    await waitForTerritorySettlement(page, "text-zoom", options.timeoutMs);

    const frameDirectory = path.join(staging, ".native200-frames");
    const frameState = { stopped: true };
    let frameCapture = null;
    if (mediaTools) {
      await mkdir(frameDirectory, { recursive: false });
      frameState.stopped = false;
      frameCapture = captureFrames(page, frameDirectory, frameState);
    }
    let fieldMap;
    let proof;
    const territories = [];
    try {
      for (let index = 0; index < PHASE7C_INDUSTRIES.length; index += 1) {
        const stage = ["automotive", "logistics", "manufacturing", "energy"][index];
        territories.push(await territoryStageAuthority(
          page,
          stage,
          PHASE7C_INDUSTRIES[index],
          path.join(staging, NATIVE200_SCREENSHOTS[stage]),
          options.timeoutMs,
        ));
      }
      proof = await proofAuthority(page, staging, options.timeoutMs);
      fieldMap = await fieldMapAuthority(page, staging, options.timeoutMs);
    } finally {
      frameState.stopped = true;
    }

    let recording;
    if (frameCapture) {
      const frameCount = await frameCapture;
      invariant(frameCount >= 8, "native-200 recording has too few visual frames");
      recording = await encodeRecording(mediaTools, frameDirectory, path.join(staging, NATIVE200_RECORDING_NAME));
      recording.frameCount = frameCount;
      await rm(frameDirectory, { recursive: true, force: true });
    } else {
      recording = {
        path: null,
        reason: "FFmpeg/FFprobe recording tools were unavailable or recording was explicitly skipped; required page screenshots remain authoritative.",
        status: "NOT AVAILABLE TO EXECUTION ENVIRONMENT",
      };
    }
    const carrier = await page.evaluate(() => {
      const staticCarriers = [...document.querySelectorAll("[data-territory-stage]:not([data-territory-stage='proof']) .territory-static__carrier")];
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      };
      return {
        enhancedCarrierCount: document.querySelectorAll("[data-territory-carrier]").length,
        everyStaticCarrierVisible: staticCarriers.every(visible),
        staticCarrierCount: staticCarriers.length,
      };
    });
    const presentation = await page.evaluate(() => {
      const root = document.querySelector("[data-territory-traverse]");
      return {
        fallback: root?.getAttribute("data-territory-fallback"),
        mode: root?.getAttribute("data-territory-mode"),
        projection: root?.getAttribute("data-territory-projection"),
        raf: root?.getAttribute("data-territory-raf"),
      };
    });
    const screenshots = await screenshotInventory(staging);
    captureData = {
      browser: "Google Chrome",
      browserVersion: product.product,
      carrier,
      classification: "PASS",
      environmentalLimitation: null,
      exactTargetUrl: options.url,
      fieldMap,
      genuineInstalledChrome: true,
      humanGate: "PENDING HUMAN REVIEW",
      launchContract,
      nativeZoomPercent: 200,
      observedTargetUrl: page.url(),
      osLevelZoomHandshake: {
        acknowledgedAt: handshake.acknowledgedAt,
        externalOperatorAcknowledged: true,
        readyProtocol: "PHASE7C_NATIVE200_READY / CAPTURE <sessionId>",
        sessionId: handshakeSessionId,
        timeoutMs: options.handshakeTimeoutMs,
        toolSentOsInput: false,
      },
      presentation,
      proof,
      recording,
      repository,
      revision: options.revision,
      schema: NATIVE200_SCHEMA,
      screenshots,
      status: "PASS",
      targetTitle: await page.title(),
      territories,
      zoomGeometry: {
        ...zoomSettlement.result,
        settlementLatencyMs: zoomSettlement.latencyMs,
      },
    };
  } finally {
    if (context) await context.close().catch(() => undefined);
    await rm(profilePath, { recursive: true, force: true });
  }
  captureData.profile = {
    deletedAfterCapture: true,
    fresh: true,
    isolated: true,
    pathReported: false,
  };
  validateInstalledReport(captureData);
  await writeFile(path.join(staging, NATIVE200_REPORT_NAME), portableJson(captureData), { encoding: "utf8", flag: "wx" });
  await writeEvidenceManifest(staging, captureData);
  return captureData;
}

export function selfTest() {
  const launchContract = { arguments: ["--no-first-run"], deviceEmulation: false, viewport: null };
  const baseline = {
    bodyCssZoom: "1",
    bodyTransform: "none",
    devicePixelRatio: 1.25,
    innerHeight: 760,
    innerWidth: 1400,
    outerHeight: 900,
    outerWidth: 1440,
    playwrightViewport: null,
    rootCssZoom: "1",
    rootTransform: "none",
    screenHeight: 1080,
    screenWidth: 1920,
    visualViewportScale: 1,
  };
  const observed = { ...baseline, devicePixelRatio: 2.5, innerHeight: 380, innerWidth: 700 };
  invariant(validateNativeZoomGeometry(baseline, observed, launchContract).status === "PASS", "native geometry self-test differs");
  const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  invariant(validateCaptureHandshake(`CAPTURE ${sessionId}`, sessionId), "capture handshake self-test differs");
  invariant(!validateCaptureHandshake("CAPTURE another-session", sessionId), "capture handshake accepts a foreign session");
  return {
    browserLaunch: "INSTALLED GOOGLE CHROME / FRESH ISOLATED PROFILE",
    emulationAsPass: "PROHIBITED",
    externalOsInputHandshake: "REQUIRED",
    phase7cTerritories: PHASE7C_INDUSTRIES.length,
    schema: NATIVE200_SCHEMA,
    status: "PASS",
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(
      "Usage:\n"
      + "  node scripts/capture-phase7c-installed-chrome-200.mjs --url <exact-preview-url> --revision <final-head> --output <fresh-external-dir> [--chrome <installed-chrome.exe>] [--handshake-timeout-ms 300000] [--timeout-ms 45000] [--ffmpeg <command>] [--ffprobe <command>] [--skip-recording]\n"
      + "  node scripts/capture-phase7c-installed-chrome-200.mjs --revision <final-head> --output <fresh-external-dir> --environmental-limitation <honest reason>\n\n"
      + "Live mode launches visible installed Google Chrome with viewport:null in a fresh isolated profile, prints PHASE7C_NATIVE200_READY, and accepts only CAPTURE <sessionId> on stdin after an external operator performs normal OS-level browser zoom. The tool sends no OS zoom input and accepts no viewport, CSS, transform, device-scale or mobile emulation substitute.\n",
    );
    return;
  }
  if (options.selfTest) {
    process.stdout.write(portableJson(selfTest()));
    return;
  }
  await freshExternalOutput(options.output);
  const staging = `${options.output}.staging-${randomUUID()}`;
  await mkdir(staging, { recursive: false });
  let published = false;
  try {
    const report = options.environmentalLimitation
      ? await writeLimitation(options, staging)
      : await capture(options, staging);
    await rename(staging, options.output);
    published = true;
    process.stdout.write(portableJson({
      classification: report.classification,
      manifest: NATIVE200_MANIFEST_NAME,
      recording: report.recording?.path ?? null,
      report: NATIVE200_REPORT_NAME,
      status: report.status,
    }));
  } finally {
    if (!published) await rm(staging, { recursive: true, force: true }).catch(() => undefined);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`Phase 7C installed-Chrome native-200 evidence FAIL: ${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
