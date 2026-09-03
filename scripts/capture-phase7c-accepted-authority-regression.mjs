#!/usr/bin/env node

/**
 * Phase 7C accepted-authority visual regression.
 *
 * The Phase 7B parent and Phase 7C candidate are captured sequentially in one
 * explicit installed-Chromium process, context, page, viewport and rendering
 * configuration. The tool does not create or update baselines. It writes a
 * fresh, caller-owned evidence directory containing paired PNGs, derived masks
 * and a portable JSON report.
 */

import { createHash } from "node:crypto";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { PHASE7C_PARENT } from "./phase7c-contract.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCHEMA = "quantum-hub.phase-7c.accepted-authority-regression.v1";
export const MANIFEST_SCHEMA = "quantum-hub.phase-7c.accepted-authority-regression-manifest.v1";
export const REPORT_PATH = "phase-7c-accepted-authority-regression.json";
export const MANIFEST_PATH = "evidence-manifest.json";
export const DEFAULT_VIEWPORT = Object.freeze({ width: 1440, height: 900 });
export const DEFAULT_TIMEOUT_MS = 30_000;
export const CSSOM_GEOMETRY_QUANTUM_PX = 1 / 65_536;
export const EDGE_QUANTIZATION_CONTRACT = Object.freeze({
  name: "EDGE_QUANTIZATION_EQUIVALENT",
  maximumRgbChannelDelta: 1,
  maximumChangedFraction: 0.0001,
  maximumConnectedComponentPixels: 16,
  maximumConnectedComponentSpan: 10,
  maximumNeutralChannelSpread: 4,
  alphaMustBeExact: true,
  edgeRadiusPixels: 1,
});

export const GOVERNED_STATES = Object.freeze([
  Object.freeze({ id: "phase7a-manifesto-signal-field", route: "/#entry", kind: "manifesto", root: "#entry" }),
  Object.freeze({ id: "phase7a-audience-bifurcation", route: "/#entry", kind: "audience", root: "[data-field-map-threshold]" }),
  Object.freeze({ id: "phase7a-field-map-closed", route: "/about/", kind: "field-map-closed", root: "[data-field-map]" }),
  Object.freeze({ id: "phase7a-field-map-open", route: "/about/", kind: "field-map-open", root: "[data-field-map]" }),
  Object.freeze({ id: "phase7b-method-frame", route: "/#entry", kind: "method", root: "[data-operating-field]", state: "frame", progress: 0.175 }),
  Object.freeze({ id: "phase7b-method-source", route: "/#entry", kind: "method", root: "[data-operating-field]", state: "source", progress: 0.365 }),
  Object.freeze({ id: "phase7b-method-assess", route: "/#entry", kind: "method", root: "[data-operating-field]", state: "assess", progress: 0.555 }),
  Object.freeze({ id: "phase7b-method-test", route: "/#entry", kind: "method", root: "[data-operating-field]", state: "test", progress: 0.745 }),
  Object.freeze({ id: "phase7b-method-decide", route: "/#entry", kind: "method", root: "[data-operating-field]", state: "decide", progress: 0.905 }),
]);

const HASH_40 = /^[0-9a-f]{40}$/;
const PORTABLE_PATH_DENY = /(?:^|\/)(?:\.git|node_modules|browser-cache|raw|source)(?:\/|$)/i;
const TEXT_SELECTOR = "h1,h2,h3,h4,h5,h6,p,a,summary,button,label,dt,dd,li,span";
const STRUCTURAL_SELECTOR = [
  "svg",
  ".signal-field__source",
  ".signal-field__source img",
  ".signal-field__source span",
  ".field-map__material > span",
  ".workpiece-test-surface > span",
  ".workpiece-registration > span",
].join(",");

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function stable(value) {
  const normalize = (item) => Array.isArray(item)
    ? item.map(normalize)
    : item && typeof item === "object"
      ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, normalize(item[key])]))
      : item;
  return `${JSON.stringify(normalize(value), null, 2)}\n`;
}

function within(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function exists(candidate) {
  try { await access(candidate); return true; }
  catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

export function safeRelativePath(value) {
  invariant(typeof value === "string" && value.length > 0, "evidence path is required");
  invariant(!value.includes("\\") && !path.posix.isAbsolute(value), "evidence paths must be portable relative paths");
  invariant(path.posix.normalize(value) === value && value !== "." && !value.startsWith("../"), "evidence path may not traverse");
  invariant(!PORTABLE_PATH_DENY.test(value), "evidence path enters a forbidden directory");
  invariant(!/\.(?:zip|7z|rar|tar|tgz)$/i.test(value), "nested archives are not accepted evidence");
  return value;
}

export function normalizeBaseUrl(value, flag = "base URL") {
  let url;
  try { url = new URL(value); }
  catch { throw new Error(`${flag} must be an absolute URL`); }
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
  invariant(url.protocol === "https:" || (url.protocol === "http:" && loopback), `${flag} must use HTTPS or loopback HTTP`);
  invariant(!url.username && !url.password && !url.search && !url.hash, `${flag} may not contain credentials, query or fragment`);
  invariant(url.pathname.endsWith("/"), `${flag} pathname must end with /`);
  return url.toString();
}

function nextValue(argv, index, flag) {
  const value = argv[index + 1];
  invariant(value && !value.startsWith("--"), `${flag} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const options = {
    phase7bUrl: "",
    phase7cUrl: "",
    phase7bRevision: PHASE7C_PARENT,
    phase7cRevision: "",
    chromiumExecutable: "",
    evidenceRoot: "",
    viewport: { ...DEFAULT_VIEWPORT },
    timeoutMs: DEFAULT_TIMEOUT_MS,
    headed: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => { const value = nextValue(argv, index, flag); index += 1; return value; };
    if (flag === "--phase7b-url") options.phase7bUrl = normalizeBaseUrl(next(), flag);
    else if (flag === "--phase7c-url") options.phase7cUrl = normalizeBaseUrl(next(), flag);
    else if (flag === "--phase7b-revision") options.phase7bRevision = next();
    else if (flag === "--phase7c-revision") options.phase7cRevision = next();
    else if (flag === "--chromium-executable") options.chromiumExecutable = path.resolve(next());
    else if (flag === "--evidence-root") options.evidenceRoot = path.resolve(next());
    else if (flag === "--timeout-ms") options.timeoutMs = Number(next());
    else if (flag === "--viewport") {
      const match = /^(\d+)x(\d+)$/.exec(next());
      invariant(match, "--viewport must be WIDTHxHEIGHT");
      options.viewport = { width: Number(match[1]), height: Number(match[2]) };
    } else if (flag === "--headed") options.headed = true;
    else if (flag === "--help" || flag === "-h") options.help = true;
    else throw new Error(`unknown argument: ${flag}`);
  }
  if (!options.help) {
    for (const key of ["phase7bUrl", "phase7cUrl", "phase7cRevision", "chromiumExecutable", "evidenceRoot"]) {
      invariant(options[key], `--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required`);
    }
    invariant(options.phase7bUrl !== options.phase7cUrl, "Phase 7B and Phase 7C URLs must differ");
    invariant(options.phase7bRevision === PHASE7C_PARENT, `Phase 7B revision must remain ${PHASE7C_PARENT}`);
    invariant(HASH_40.test(options.phase7cRevision) && options.phase7cRevision !== PHASE7C_PARENT, "--phase7c-revision must be the committed Phase 7C SHA");
    invariant(Number.isSafeInteger(options.timeoutMs) && options.timeoutMs >= 5_000 && options.timeoutMs <= 120_000, "--timeout-ms must be 5000..120000");
    invariant(Number.isSafeInteger(options.viewport.width) && options.viewport.width >= 800 && options.viewport.width <= 3840, "viewport width is outside the governed range");
    invariant(Number.isSafeInteger(options.viewport.height) && options.viewport.height >= 600 && options.viewport.height <= 2160, "viewport height is outside the governed range");
  }
  return options;
}

export function compareStructuredAuthority(baseline, current, limit = 2_000) {
  const mismatches = [];
  const visit = (left, right, cursor) => {
    if (mismatches.length >= limit) return;
    if (Object.is(left, right)) return;
    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right)) {
        mismatches.push({ path: cursor, baseline: left, current: right, reason: "type" });
        return;
      }
      if (left.length !== right.length) mismatches.push({ path: `${cursor}.length`, baseline: left.length, current: right.length, reason: "length" });
      for (let index = 0; index < Math.max(left.length, right.length); index += 1) visit(left[index], right[index], `${cursor}[${index}]`);
      return;
    }
    if (left && right && typeof left === "object" && typeof right === "object") {
      const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
      for (const key of keys) visit(left[key], right[key], cursor ? `${cursor}.${key}` : key);
      return;
    }
    mismatches.push({ path: cursor, baseline: left, current: right, reason: "value" });
  };
  visit(baseline, current, "authority");
  return {
    status: mismatches.length === 0 ? "PASS" : "FAIL",
    exact: mismatches.length === 0,
    mismatches,
    truncated: mismatches.length >= limit,
  };
}

export function canonicalizeComputedCssPixels(value) {
  invariant(typeof value === "string", "computed CSS value must be a string");
  return value.replace(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?px\b/gi, (token) => {
    const numeric = Number.parseFloat(token);
    if (!Number.isFinite(numeric)) return token;
    const quantized = Math.round(numeric / CSSOM_GEOMETRY_QUANTUM_PX) * CSSOM_GEOMETRY_QUANTUM_PX;
    const normalized = Number(quantized.toFixed(12));
    return `${Object.is(normalized, -0) ? 0 : normalized}px`;
  });
}

function isNeutral(r, g, b) {
  return Math.max(r, g, b) - Math.min(r, g, b) <= EDGE_QUANTIZATION_CONTRACT.maximumNeutralChannelSpread;
}

function connectedComponents(coordinates, width) {
  if (coordinates.length > 100_000) return { complete: false, components: [] };
  const pending = new Set(coordinates.map(({ x, y }) => y * width + x));
  const components = [];
  while (pending.size) {
    const first = pending.values().next().value;
    pending.delete(first);
    const queue = [first];
    const members = [];
    let left = width;
    let right = -1;
    let top = Number.MAX_SAFE_INTEGER;
    let bottom = -1;
    while (queue.length) {
      const pixel = queue.pop();
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      members.push({ x, y });
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX < 0 || nextX >= width || nextY < 0) continue;
          const next = nextY * width + nextX;
          if (pending.delete(next)) queue.push(next);
        }
      }
    }
    members.sort((a, b) => a.y - b.y || a.x - b.x);
    components.push({
      pixels: members.length,
      bounds: { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1 },
      coordinates: members,
    });
  }
  components.sort((a, b) => b.pixels - a.pixels || a.bounds.top - b.bounds.top || a.bounds.left - b.bounds.left);
  return { complete: true, components };
}

function ownerForCoordinate(x, y, textRects = []) {
  const matches = textRects.filter(({ rect }) => rect
    && x >= Math.floor(rect.left) - 1 && x <= Math.ceil(rect.right) + 1
    && y >= Math.floor(rect.top) - 1 && y <= Math.ceil(rect.bottom) + 1);
  matches.sort((a, b) => (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height));
  return matches[0]?.id ?? null;
}

export function classifyGovernedPixels({ baseline, current, width, height, textEdgeMask, protectedMask, textRects = [] }) {
  invariant(Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0, "decoded dimensions are required");
  const pixels = width * height;
  invariant(baseline instanceof Uint8Array || Buffer.isBuffer(baseline), "baseline RGBA bytes are required");
  invariant(current instanceof Uint8Array || Buffer.isBuffer(current), "current RGBA bytes are required");
  invariant(baseline.length === pixels * 4 && current.length === baseline.length, "RGBA byte dimensions differ");
  invariant(textEdgeMask instanceof Uint8Array && textEdgeMask.length === pixels, "derived typography-edge mask differs");
  invariant(protectedMask instanceof Uint8Array && protectedMask.length === pixels, "derived protected-geometry mask differs");

  let differingChannels = 0;
  let differingPixels = 0;
  let maximumRgbChannelDelta = 0;
  let alphaDifferences = 0;
  let outsideTypographyEdge = 0;
  let protectedDifferences = 0;
  let nonNeutralDifferences = 0;
  const coordinates = [];
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * 4;
    let differs = false;
    const deltas = [];
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(baseline[offset + channel] - current[offset + channel]);
      deltas.push(delta);
      if (delta > 0) { differs = true; differingChannels += 1; }
      if (channel < 3) maximumRgbChannelDelta = Math.max(maximumRgbChannelDelta, delta);
      else if (delta > 0) alphaDifferences += 1;
    }
    if (!differs) continue;
    differingPixels += 1;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const onTypographyEdge = textEdgeMask[pixel] === 1;
    const onProtectedGeometry = protectedMask[pixel] === 1;
    const neutral = isNeutral(baseline[offset], baseline[offset + 1], baseline[offset + 2])
      && isNeutral(current[offset], current[offset + 1], current[offset + 2]);
    if (!onTypographyEdge) outsideTypographyEdge += 1;
    if (onProtectedGeometry) protectedDifferences += 1;
    if (!neutral) nonNeutralDifferences += 1;
    coordinates.push({
      x,
      y,
      baseline: [...baseline.subarray(offset, offset + 4)],
      current: [...current.subarray(offset, offset + 4)],
      deltas,
      typographyElement: ownerForCoordinate(x, y, textRects),
      onTypographyEdge,
      onProtectedGeometry,
      neutral,
    });
  }

  const exact = differingPixels === 0;
  const clusters = connectedComponents(coordinates, width);
  const largestComponent = clusters.components[0]?.pixels ?? 0;
  const largestSpan = clusters.components.reduce((maximum, component) => Math.max(maximum, component.bounds.width, component.bounds.height), 0);
  const changedFraction = differingPixels / pixels;
  const conditions = {
    exactDimensions: true,
    semanticsAndGeometryMustBeExactSeparately: true,
    maximumRgbChannelDelta: maximumRgbChannelDelta <= EDGE_QUANTIZATION_CONTRACT.maximumRgbChannelDelta,
    alphaExact: alphaDifferences === 0,
    changedFraction: changedFraction <= EDGE_QUANTIZATION_CONTRACT.maximumChangedFraction,
    actualNeutralTypographyEdgeOnly: outsideTypographyEdge === 0,
    bothColorsNeutralOrNearNeutral: nonNeutralDifferences === 0,
    noProtectedGeometryDifference: protectedDifferences === 0,
    connectedComponentsComplete: clusters.complete,
    connectedComponentPixelLimit: clusters.complete && largestComponent <= EDGE_QUANTIZATION_CONTRACT.maximumConnectedComponentPixels,
    connectedComponentSpanLimit: clusters.complete && largestSpan <= EDGE_QUANTIZATION_CONTRACT.maximumConnectedComponentSpan,
    noCoherentTranslationResizeWrapOrGlyphDisplacement: maximumRgbChannelDelta <= 1,
  };
  const equivalent = !exact && Object.values(conditions).every(Boolean);
  const failedConditions = Object.entries(conditions).filter(([, passed]) => !passed).map(([name]) => name);

  return {
    exactComparison: {
      status: exact ? "PASS" : "FAIL",
      classification: exact ? "EXACT" : "EXACT_EQUALITY_NOT_ACHIEVED",
    },
    adjudication: {
      status: exact
        ? "PASS — EXACT"
        : equivalent
          ? "PASS — EDGE_QUANTIZATION_EQUIVALENT"
          : "FAIL — MEANINGFUL_DIFFERENCE",
      classification: exact ? "EXACT" : equivalent ? "EDGE_QUANTIZATION_EQUIVALENT" : "MEANINGFUL_DIFFERENCE",
      contract: EDGE_QUANTIZATION_CONTRACT,
      conditions,
      failedConditions,
    },
    metrics: {
      width,
      height,
      governedPixels: pixels,
      differingPixels,
      differingChannels,
      changedFraction,
      maximumRgbChannelDelta,
      alphaDifferences,
      outsideTypographyEdge,
      protectedDifferences,
      nonNeutralDifferences,
      connectedComponents: clusters.components.length,
      largestComponentPixels: largestComponent,
      largestComponentSpan: largestSpan,
    },
    coordinates,
    coordinatesComplete: true,
    clusters: clusters.components,
    status: exact || equivalent ? "PASS" : "FAIL",
  };
}

function alphaEdge(alpha, width, height) {
  const result = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const value = alpha[index];
      let edge = value > 0 && value < 255;
      for (const [offsetX, offsetY] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
        const neighbor = alpha[nextY * width + nextX];
        if (neighbor !== value && (neighbor > 0 || value > 0)) edge = true;
      }
      if (edge) result[index] = 1;
    }
  }
  return result;
}

function dilate(mask, width, height, radius) {
  const result = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX >= 0 && nextX < width && nextY >= 0 && nextY < height) result[nextY * width + nextX] = 1;
        }
      }
    }
  }
  return result;
}

export function buildTypographyEdgeMask({ baselineAlpha, currentAlpha, width, height }) {
  const pixels = width * height;
  invariant(baselineAlpha instanceof Uint8Array && baselineAlpha.length === pixels, "baseline text alpha mask differs");
  invariant(currentAlpha instanceof Uint8Array && currentAlpha.length === pixels, "current text alpha mask differs");
  const baselineEdge = dilate(alphaEdge(baselineAlpha, width, height), width, height, EDGE_QUANTIZATION_CONTRACT.edgeRadiusPixels);
  const currentEdge = dilate(alphaEdge(currentAlpha, width, height), width, height, EDGE_QUANTIZATION_CONTRACT.edgeRadiusPixels);
  const mask = new Uint8Array(pixels);
  for (let index = 0; index < pixels; index += 1) mask[index] = baselineEdge[index] && currentEdge[index] ? 1 : 0;
  return {
    mask,
    method: "INTERSECTION_OF_ONE_PIXEL_DILATED_ACTUAL_TEXT_RASTER_EDGES",
    baselineEdgePixels: baselineEdge.reduce((sum, value) => sum + value, 0),
    currentEdgePixels: currentEdge.reduce((sum, value) => sum + value, 0),
    eligiblePixels: mask.reduce((sum, value) => sum + value, 0),
  };
}

export function buildProtectedGeometryMask({ baselineAlpha, currentAlpha, width, height, outlineBands = [] }) {
  const pixels = width * height;
  invariant(baselineAlpha instanceof Uint8Array && baselineAlpha.length === pixels, "baseline protected alpha mask differs");
  invariant(currentAlpha instanceof Uint8Array && currentAlpha.length === pixels, "current protected alpha mask differs");
  const mask = new Uint8Array(pixels);
  for (let index = 0; index < pixels; index += 1) mask[index] = baselineAlpha[index] > 0 || currentAlpha[index] > 0 ? 1 : 0;
  for (const band of outlineBands) {
    const thickness = Math.max(1, Math.ceil(Number(band.thickness) || 1));
    const left = Math.max(0, Math.floor(band.rect.left) - thickness);
    const right = Math.min(width - 1, Math.ceil(band.rect.right) + thickness);
    const top = Math.max(0, Math.floor(band.rect.top) - thickness);
    const bottom = Math.min(height - 1, Math.ceil(band.rect.bottom) + thickness);
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const inside = x >= Math.ceil(band.rect.left) + thickness && x <= Math.floor(band.rect.right) - thickness
          && y >= Math.ceil(band.rect.top) + thickness && y <= Math.floor(band.rect.bottom) - thickness;
        if (!inside) mask[y * width + x] = 1;
      }
    }
  }
  return { mask, method: "UNION_OF_ACTUAL_STRUCTURAL_RASTER_AND_FOCUS_OUTLINE_BANDS", protectedPixels: mask.reduce((sum, value) => sum + value, 0) };
}

export function differenceMaskRgba(comparison) {
  const { width, height } = comparison.metrics;
  const result = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < result.length; offset += 4) {
    result[offset] = 8; result[offset + 1] = 8; result[offset + 2] = 8; result[offset + 3] = 255;
  }
  for (const coordinate of comparison.coordinates) {
    const offset = (coordinate.y * width + coordinate.x) * 4;
    const color = coordinate.onProtectedGeometry
      ? [255, 208, 0]
      : !coordinate.onTypographyEdge || !coordinate.neutral
        ? [255, 48, 48]
        : [255, 0, 168];
    result[offset] = color[0]; result[offset + 1] = color[1]; result[offset + 2] = color[2]; result[offset + 3] = 255;
  }
  return result;
}

export function validateAdditiveAuthority(parent, current) {
  const checks = {
    parentHasNoTerritory: parent.territoryCount === 0,
    currentHasOneTerritory: current.territoryCount === 1,
    operatingFieldStillUnique: parent.operatingFieldCount === 1 && current.operatingFieldCount === 1,
    operatingAndTerritoryShareParent: current.sameParent === true,
    territoryFollowsOperatingField: current.operatingBeforeTerritory === true,
    onlyZeroLayoutComponentScriptsIntervene: current.interveningElements.every(({ tag, width, height }) => tag === "script" && width === 0 && height === 0),
    exactOperatingToTerritoryBoundary: current.territoryDocumentTop === current.operatingDocumentBottom,
    exactHeading: current.heading === "One carrier. Four operating conditions.",
    fourOrderedIndustries: JSON.stringify(current.industries) === JSON.stringify([
      "Automotive & Mobility",
      "Logistics & Supply Chain",
      "Industry 4.0 / Advanced Manufacturing",
      "Energy & Infrastructure",
    ]),
    singleProofLink: current.proofLinks.length === 1 && current.proofLinks[0] === "/pocs/maradin/",
    acceptedAuthorityRetainedBeforeInsertion: current.acceptedFieldOrder.slice(0, 2).join("|") === "field-map-threshold|operating-field"
      && current.acceptedFieldOrder[2] === "territories",
  };
  return { status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL", checks, parent, current };
}

async function decodePng(bytes) {
  const { default: sharp } = await import("sharp");
  const decoded = await sharp(bytes, { failOn: "error" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  invariant(decoded.info.channels === 4, "PNG did not decode to RGBA");
  return { data: new Uint8Array(decoded.data), width: decoded.info.width, height: decoded.info.height };
}

function alphaChannel(decoded) {
  const alpha = new Uint8Array(decoded.width * decoded.height);
  for (let pixel = 0; pixel < alpha.length; pixel += 1) alpha[pixel] = decoded.data[pixel * 4 + 3];
  return alpha;
}

async function encodeRgba(bytes, width, height) {
  const { default: sharp } = await import("sharp");
  return sharp(Buffer.from(bytes), { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
}

function maskRgba(mask) {
  const result = new Uint8Array(mask.length * 4);
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    const value = mask[pixel] ? 255 : 0;
    const offset = pixel * 4;
    result[offset] = value; result[offset + 1] = value; result[offset + 2] = value; result[offset + 3] = 255;
  }
  return result;
}

function route(baseUrl, pathname) {
  return new URL(pathname, baseUrl).toString();
}

async function waitForSettledPredicate(page, specification, timeoutMs) {
  return page.evaluate(async ({ specification: spec, timeout }) => {
    const started = performance.now();
    let stableFrames = 0;
    let lastSignature = "";
    let latest = null;
    const visible = (element) => {
      if (!(element instanceof Element)) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0;
    };
    while (performance.now() - started <= timeout) {
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      const root = document.querySelector(spec.root);
      const details = document.querySelector("[data-field-map]");
      const background = [...document.querySelectorAll("[data-field-map-background]")];
      const links = [...document.querySelectorAll("[data-field-map] nav a[href]")];
      const actualProgress = Number(root?.getAttribute("data-method-progress"));
      const signalDashOffset = Number.parseFloat(getComputedStyle(document.querySelector(".signal-field__live") ?? document.documentElement).strokeDashoffset);
      const predicate = {
        root: spec.kind === "field-map-open" || spec.kind === "field-map-closed"
          ? visible(details?.querySelector("summary"))
          : visible(root),
        fonts: !document.fonts || document.fonts.status === "loaded",
        scrollStable: true,
        kind: spec.kind,
        manifestoResolved: spec.kind !== "manifesto" || document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved",
        signalSettled: spec.kind !== "manifesto" || [null, "settled"].includes(document.querySelector("[data-signal-field]")?.getAttribute("data-probe")),
        signalDrawSettled: spec.kind !== "manifesto" || (Number.isFinite(signalDashOffset) && Math.abs(signalDashOffset) <= (1 / 65_536)),
        mapState: spec.kind !== "field-map-open" && spec.kind !== "field-map-closed"
          || (spec.kind === "field-map-open" ? details?.hasAttribute("open") === true : details?.hasAttribute("open") === false),
        mapEnhancedState: spec.kind !== "field-map-open" && spec.kind !== "field-map-closed"
          || (spec.kind === "field-map-open" ? document.documentElement.hasAttribute("data-field-map-open") : !document.documentElement.hasAttribute("data-field-map-open")),
        inertState: spec.kind !== "field-map-open" && spec.kind !== "field-map-closed"
          || (spec.kind === "field-map-open" ? background.length > 0 && background.every((region) => region.hasAttribute("inert")) : background.every((region) => !region.hasAttribute("data-field-map-inert-owned"))),
        mapControls: spec.kind !== "field-map-open" || (visible(details?.querySelector("summary")) && links.length === 8 && links.every(visible)),
        activeFocusContained: spec.kind !== "field-map-open" || document.activeElement?.closest?.("[data-field-map]") === details,
        methodMode: spec.kind !== "method" || root?.getAttribute("data-method-mode") === "enhanced",
        methodState: spec.kind !== "method" || root?.getAttribute("data-method-state") === spec.state,
        methodProgress: spec.kind !== "method" || (Number.isFinite(actualProgress) && Math.abs(actualProgress - spec.progress) <= 0.0025),
        oneWorkpiece: spec.kind !== "method" || root?.querySelectorAll("[data-workpiece]").length === 1,
        workpieceProbeSettled: spec.kind !== "method" || root?.getAttribute("data-method-probe") === "settled",
        noOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      };
      const passed = Object.entries(predicate).filter(([key]) => !["kind", "scrollStable"].includes(key)).every(([, value]) => value === true);
      const signature = JSON.stringify({
        scrollX, scrollY,
        rootGeometry: root ? (() => {
          const rect = root.getBoundingClientRect();
          return [rect.left, rect.top, rect.right, rect.bottom, rect.width, rect.height].map((value) => Number(value.toFixed(4)));
        })() : null,
        semanticGeometry: root ? [...root.querySelectorAll("h1,h2,h3,p,a,summary")].map((element) => {
          const rect = element.getBoundingClientRect();
          return [rect.left, rect.top, rect.right, rect.bottom].map((value) => Number(value.toFixed(4)));
        }) : null,
        root: root ? [...root.attributes].filter((attribute) => attribute.name.startsWith("data-")).map((attribute) => [attribute.name, attribute.value]) : null,
        rootStyle: root?.getAttribute("style") ?? null,
        signalDashOffset: Number.isFinite(signalDashOffset) ? Math.round(signalDashOffset * 65_536) / 65_536 : null,
        details: details?.hasAttribute("open") ?? null,
        inert: background.map((region) => [region.hasAttribute("inert"), region.getAttribute("data-field-map-inert-owned")]),
        focus: document.activeElement?.tagName ?? null,
      });
      stableFrames = passed && signature === lastSignature ? stableFrames + 1 : 0;
      lastSignature = signature;
      latest = { predicate, signature, passed };
      if (stableFrames >= 2) return {
        status: "PASS",
        settlementMs: Number((performance.now() - started).toFixed(3)),
        stableFrames: stableFrames + 1,
        predicate,
        activeElement: document.activeElement?.tagName.toLowerCase() ?? null,
        inertRegionCount: background.filter((region) => region.hasAttribute("inert")).length,
        methodState: root?.getAttribute("data-method-state") ?? null,
        methodProgress: root?.getAttribute("data-method-progress") ?? null,
        timeoutMs: timeout,
      };
    }
    throw new Error(`state ${spec.id} did not settle within ${timeout}ms: ${JSON.stringify(latest)}`);
  }, { specification, timeout: timeoutMs });
}

async function waitForGeometryStability(page, selector, timeoutMs) {
  return page.evaluate(async ({ selector: governedSelector, timeout }) => {
    const started = performance.now();
    let previous = "";
    let stableFrames = 0;
    while (performance.now() - started <= timeout) {
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      const root = document.querySelector(governedSelector);
      if (!root) continue;
      const elements = [root, ...root.querySelectorAll("h1,h2,h3,p,a,summary")];
      const structuralStyles = [...root.querySelectorAll("svg *")].map((element) => {
        const style = getComputedStyle(element);
        return [style.strokeDashoffset, style.opacity, style.transform];
      });
      const signature = JSON.stringify(elements.map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          rect: [rect.left, rect.top, rect.right, rect.bottom, rect.width, rect.height].map((value) => Number(value.toFixed(4))),
          transform: style.transform,
          opacity: style.opacity,
        };
      }).concat([{ structuralStyles }]));
      stableFrames = signature === previous ? stableFrames + 1 : 0;
      previous = signature;
      if (stableFrames >= 2) return { status: "PASS", stableFrames: stableFrames + 1, settlementMs: Number((performance.now() - started).toFixed(3)) };
    }
    throw new Error(`${governedSelector} geometry did not settle within ${timeout}ms`);
  }, { selector, timeout: timeoutMs });
}

async function navigateAndPrepare(page, baseUrl, specification, timeoutMs, viewport) {
  const response = await page.goto(route(baseUrl, specification.route), { waitUntil: "load", timeout: timeoutMs });
  invariant(response && response.status() === 200, `${specification.id} navigation returned ${response?.status() ?? "no response"}`);
  await page.waitForSelector(specification.root, { timeout: timeoutMs });
  await page.waitForFunction(() => document.readyState === "complete" && (!document.fonts || document.fonts.status === "loaded"), null, { timeout: timeoutMs });
  await page.mouse.move(Math.floor(viewport.width / 2), 1);
  if (specification.route.includes("#entry")) {
    await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved", null, { timeout: timeoutMs });
  }
  const prePositionGeometry = await waitForGeometryStability(page, specification.root, timeoutMs);
  if (specification.kind !== "field-map-open") {
    await page.evaluate(() => {
      const details = document.querySelector("[data-field-map]");
      if (details?.hasAttribute("open")) details.querySelector("summary")?.click();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
  }
  if (specification.kind === "manifesto") {
    await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") === "resolved", null, { timeout: timeoutMs });
    await page.evaluate(() => {
      const element = document.querySelector("#entry");
      if (element) scrollTo(0, Math.round(Math.max(0, scrollY + element.getBoundingClientRect().top)));
    });
  } else if (specification.kind === "audience") {
    await page.evaluate(() => {
      const element = document.querySelector("[data-field-map-threshold]");
      if (!element) return;
      const rect = element.getBoundingClientRect();
      scrollTo(0, Math.round(Math.max(0, scrollY + rect.top + rect.height / 2 - innerHeight / 2)));
    });
  } else if (specification.kind === "field-map-open" || specification.kind === "field-map-closed") {
    await page.evaluate(() => scrollTo(0, 0));
    const details = page.locator("[data-field-map]");
    const isOpen = await details.evaluate((element) => element.hasAttribute("open"));
    if (specification.kind === "field-map-open" && !isOpen) {
      await page.locator("[data-field-map] > summary").focus();
      await page.keyboard.press("Enter");
    } else if (specification.kind === "field-map-closed" && isOpen) {
      await page.keyboard.press("Escape");
    }
  } else if (specification.kind === "method") {
    await page.evaluate(({ progress }) => {
      const field = document.querySelector("[data-operating-field]");
      if (!field) return;
      const rect = field.getBoundingClientRect();
      const start = scrollY + rect.top;
      const travel = Math.max(1, rect.height - innerHeight);
      scrollTo(0, Math.round(start + travel * progress));
    }, { progress: specification.progress });
  }
  const settlement = await waitForSettledPredicate(page, specification, timeoutMs);
  return { ...settlement, prePositionGeometry };
}

async function captureGovernedSnapshot(page, specification) {
  return page.evaluate(({ rootSelector, stateId, textSelector, structuralSelector }) => {
    const round = (value) => Number(Number(value).toFixed(4));
    const canonicalCssPixels = (value) => value.replace(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?px\b/gi, (token) => {
      const numeric = Number.parseFloat(token);
      const quantized = Math.round(numeric * 65_536) / 65_536;
      const normalized = Number(quantized.toFixed(12));
      return `${Object.is(normalized, -0) ? 0 : normalized}px`;
    });
    const rectOf = (element) => {
      if (!(element instanceof Element)) return null;
      const rect = element.getBoundingClientRect();
      return { left: round(rect.left), top: round(rect.top), right: round(rect.right), bottom: round(rect.bottom), width: round(rect.width), height: round(rect.height) };
    };
    const visible = (element) => {
      const rect = element?.getBoundingClientRect?.();
      const style = element instanceof Element ? getComputedStyle(element) : null;
      return Boolean(rect && style && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0
        && rect.top < innerHeight && rect.left < document.documentElement.clientWidth
        && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0);
    };
    const canonicalText = (element) => element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const root = document.querySelector(rootSelector);
    if (!root) throw new Error(`${stateId} governed root is missing`);
    const globalElements = [...document.querySelectorAll(".site-header, .site-header *")].filter(visible);
    const rootElements = [root, ...root.querySelectorAll("*")];
    const allElements = [...new Set([...globalElements, ...rootElements])];
    const elementIndex = new Map(allElements.map((element, index) => [element, index]));
    const id = (element) => {
      if (!(element instanceof Element)) return null;
      if (element.id) return `#${element.id}`;
      const data = [...element.attributes].find((attribute) => attribute.name.startsWith("data-") && attribute.value);
      const className = typeof element.className === "string" ? element.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".") : "";
      return `${element.tagName.toLowerCase()}${className ? `.${className}` : ""}@${elementIndex.get(element) ?? -1}${data ? `[${data.name}=${data.value}]` : ""}`;
    };
    const styleFields = (element) => {
      const style = getComputedStyle(element);
      return {
        color: style.color,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        fontFamily: style.fontFamily,
        fontWeight: style.fontWeight,
        fontStretch: style.fontStretch,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        fontOpticalSizing: style.fontOpticalSizing,
        fontVariationSettings: style.fontVariationSettings,
        textTransform: style.textTransform,
        whiteSpace: style.whiteSpace,
        wordBreak: style.wordBreak,
        overflowWrap: style.overflowWrap,
        transform: style.transform,
      };
    };
    const textCandidates = allElements.filter((element) => element.matches?.(textSelector)
      && [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && /\S/.test(node.textContent ?? "")));
    const textElements = textCandidates.map((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const lineRects = [...range.getClientRects()].map((rect) => ({ left: round(rect.left), top: round(rect.top), right: round(rect.right), bottom: round(rect.bottom), width: round(rect.width), height: round(rect.height) }));
      return { id: id(element), tag: element.tagName.toLowerCase(), text: canonicalText(element), rect: rectOf(element), lineRects, style: styleFields(element), visible: visible(element) };
    });
    const semanticElements = allElements.filter((element) => element === root || element.matches?.("h1,h2,h3,h4,h5,h6,p,a,nav,summary,button,section,[role],[aria-label]"))
      .map((element) => ({
        id: id(element),
        tag: element.tagName.toLowerCase(),
        text: canonicalText(element),
        href: element instanceof HTMLAnchorElement ? element.getAttribute("href") : null,
        role: element.getAttribute("role"),
        ariaLabel: element.getAttribute("aria-label"),
        ariaCurrent: element.getAttribute("aria-current"),
        ariaExpanded: element.getAttribute("aria-expanded"),
        open: element instanceof HTMLDetailsElement ? element.open : null,
        rect: rectOf(element),
        visible: visible(element),
      }));
    const structuralElements = allElements.filter((element) => element.matches?.("svg,svg *,[data-workpiece],.workpiece-test-surface *,.workpiece-registration *,.signal-field__source *,.field-map__material *"))
      .map((element) => {
        let box = null;
        if (element instanceof SVGGraphicsElement) {
          try { const value = element.getBBox(); box = { x: round(value.x), y: round(value.y), width: round(value.width), height: round(value.height) }; } catch { box = null; }
        }
        const style = getComputedStyle(element);
        const geometryAttributes = Object.fromEntries([...element.attributes]
          .filter((attribute) => /^(?:d|points|x|y|x1|x2|y1|y2|cx|cy|r|rx|ry|width|height|viewBox|preserveAspectRatio|pathLength|transform)$/i.test(attribute.name))
          .map((attribute) => [attribute.name, attribute.value]));
        return {
          id: id(element), tag: element.tagName.toLowerCase(), className: element.getAttribute("class"), geometryAttributes,
          rect: rectOf(element), box,
          style: { fill: style.fill, stroke: style.stroke, strokeWidth: style.strokeWidth, strokeDasharray: style.strokeDasharray, strokeDashoffset: canonicalCssPixels(style.strokeDashoffset), opacity: style.opacity, transform: style.transform },
        };
      });
    const active = document.activeElement;
    const activeStyle = active instanceof Element ? getComputedStyle(active) : null;
    const hasMeaningfulFocus = active instanceof Element
      && active !== document.body
      && active !== document.documentElement;
    const focusProtection = hasMeaningfulFocus ? [{
      id: id(active), rect: rectOf(active), thickness: Math.max(1,
        Number.parseFloat(activeStyle.outlineWidth) || 0,
        Number.parseFloat(activeStyle.borderTopWidth) || 0,
        Number.parseFloat(activeStyle.boxShadow === "none" ? "0" : "2") || 0),
    }] : [];
    const datasets = Object.fromEntries([...root.attributes].filter((attribute) => attribute.name.startsWith("data-")).map((attribute) => [attribute.name, attribute.value]));
    return {
      stateId,
      viewport: {
        innerWidth, innerHeight, clientWidth: document.documentElement.clientWidth, clientHeight: document.documentElement.clientHeight,
        devicePixelRatio, scrollX: round(scrollX), scrollY: round(scrollY),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      },
      documentState: {
        cinematicMode: document.documentElement.getAttribute("data-cinematic-mode"),
        manifestoReveal: document.querySelector("[data-cinematic-shell]")?.getAttribute("data-manifesto-reveal") ?? null,
        fieldMapOpen: document.documentElement.hasAttribute("data-field-map-open"),
        fontsStatus: document.fonts?.status ?? "unsupported",
      },
      root: { id: id(root), rect: rectOf(root), datasets },
      semanticElements,
      links: semanticElements.filter(({ tag }) => tag === "a").map(({ id: linkId, text, href, ariaLabel, rect, visible: isVisible }) => ({ id: linkId, text, href, ariaLabel, rect, visible: isVisible })),
      textElements,
      structuralElements,
      activeElement: hasMeaningfulFocus ? { id: id(active), tag: active.tagName.toLowerCase(), text: canonicalText(active), rect: rectOf(active) } : null,
      focusProtection,
      fieldMap: {
        open: document.querySelector("[data-field-map]")?.hasAttribute("open") ?? false,
        inertRegions: document.querySelectorAll("[data-field-map-background][inert]").length,
        ownedInertRegions: document.querySelectorAll("[data-field-map-background][data-field-map-inert-owned]").length,
        visibleControls: [...document.querySelectorAll("[data-field-map] > summary, [data-field-map] nav a[href]")].filter(visible).length,
      },
    };
  }, { rootSelector: specification.root, stateId: specification.id, textSelector: TEXT_SELECTOR, structuralSelector: STRUCTURAL_SELECTOR });
}

async function captureIsolatedMask(page, specification, mode) {
  invariant(mode === "text" || mode === "protected", "mask mode differs");
  return page.evaluate(({ rootSelector, mode: maskMode, textSelector, structuralSelector }) => {
    const root = document.querySelector(rootSelector);
    if (!root) throw new Error("governed root is missing during mask capture");
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0
        && rect.top < innerHeight && rect.left < document.documentElement.clientWidth
        && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0;
    };
    const roots = [root, document.querySelector(".site-header")].filter(Boolean);
    const targets = [];
    if (maskMode === "text") {
      for (const governed of roots) {
        targets.push(...[...governed.querySelectorAll(textSelector)].filter((element) => visible(element)
          && [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && /\S/.test(node.textContent ?? ""))));
      }
    } else {
      for (const governed of roots) targets.push(...[...governed.querySelectorAll(structuralSelector)].filter(visible));
    }
    const attribute = maskMode === "text" ? "data-phase7c-text-mask" : "data-phase7c-protected-mask";
    for (const target of targets) target.setAttribute(attribute, "");
    const style = document.createElement("style");
    style.id = "phase7c-regression-mask-style";
    style.textContent = maskMode === "text" ? `
      html,body{background:transparent!important;background-image:none!important}
      body *{visibility:hidden!important;background:transparent!important;background-image:none!important;box-shadow:none!important;outline:none!important;border-color:transparent!important;text-shadow:none!important}
      body *::before,body *::after{content:none!important;display:none!important}
      [data-phase7c-text-mask]{visibility:visible!important;color:#fff!important;-webkit-text-fill-color:#fff!important;opacity:1!important}
    ` : `
      html,body{background:transparent!important;background-image:none!important}
      body *{visibility:hidden!important;background-color:transparent!important;box-shadow:none!important;outline:none!important;border-color:transparent!important;text-shadow:none!important}
      body *::before,body *::after{content:none!important;display:none!important}
      [data-phase7c-protected-mask],[data-phase7c-protected-mask] *{visibility:visible!important}
    `;
    document.head.append(style);
    return { attribute, count: targets.length };
  }, { rootSelector: specification.root, mode, textSelector: TEXT_SELECTOR, structuralSelector: STRUCTURAL_SELECTOR }).then(async (setup) => {
    try { return await page.screenshot({ type: "png", fullPage: false, animations: "disabled", caret: "hide", omitBackground: true }); }
    finally {
      await page.evaluate(({ attribute }) => {
        document.getElementById("phase7c-regression-mask-style")?.remove();
        document.querySelectorAll(`[${attribute}]`).forEach((element) => element.removeAttribute(attribute));
      }, setup);
    }
  });
}

async function captureOne(page, baseUrl, revision, specification, options) {
  const settlement = await navigateAndPrepare(page, baseUrl, specification, options.timeoutMs, options.viewport);
  const snapshot = await captureGovernedSnapshot(page, specification);
  const screenshot = await page.screenshot({ type: "png", fullPage: false, animations: "disabled", caret: "hide" });
  const textMask = await captureIsolatedMask(page, specification, "text");
  const protectedMask = await captureIsolatedMask(page, specification, "protected");
  const decoded = await decodePng(screenshot);
  invariant(decoded.width === options.viewport.width && decoded.height === options.viewport.height, `${specification.id} screenshot dimensions differ from the shared context`);
  return {
    revision,
    settlement,
    snapshot,
    screenshot,
    textMask,
    protectedMask,
    image: { bytes: screenshot.length, sha256: sha256(screenshot), width: decoded.width, height: decoded.height },
  };
}

async function additiveSnapshot(page, baseUrl, timeoutMs) {
  const response = await page.goto(route(baseUrl, "/#entry"), { waitUntil: "load", timeout: timeoutMs });
  invariant(response && response.status() === 200, `additive-authority navigation returned ${response?.status() ?? "no response"}`);
  await page.waitForFunction(() => document.readyState === "complete" && (!document.fonts || document.fonts.status === "loaded"), null, { timeout: timeoutMs });
  return page.evaluate(() => {
    const operating = document.querySelector("[data-operating-field]");
    const territory = document.querySelector("[data-territory-traverse]");
    const documentTop = (element) => element ? scrollY + element.getBoundingClientRect().top : -1;
    const documentBottom = (element) => element ? scrollY + element.getBoundingClientRect().bottom : -1;
    return {
      operatingFieldCount: document.querySelectorAll("[data-operating-field]").length,
      territoryCount: document.querySelectorAll("[data-territory-traverse]").length,
      operatingBeforeTerritory: Boolean(operating && territory && (operating.compareDocumentPosition(territory) & Node.DOCUMENT_POSITION_FOLLOWING)),
      sameParent: Boolean(operating && territory && operating.parentElement === territory.parentElement),
      interveningElements: operating && territory && operating.parentElement === territory.parentElement
        ? [...operating.parentElement.children].slice([...operating.parentElement.children].indexOf(operating) + 1, [...operating.parentElement.children].indexOf(territory)).map((element) => {
          const rect = element.getBoundingClientRect();
          return { tag: element.tagName.toLowerCase(), width: rect.width, height: rect.height };
        })
        : [],
      operatingDocumentBottom: documentBottom(operating),
      territoryDocumentTop: documentTop(territory),
      heading: territory?.querySelector("h2")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      industries: [...(territory?.querySelectorAll("[data-territory-passage] h3") ?? [])].map((element) => element.textContent?.replace(/\s+/g, " ").trim() ?? ""),
      proofLinks: [...(territory?.querySelectorAll("[data-proof-threshold] a[href]") ?? [])].map((anchor) => anchor.getAttribute("href")),
      acceptedFieldOrder: [...document.querySelectorAll("[data-field-section]")].map((element) => {
        if (element.hasAttribute("data-field-map-threshold")) return "field-map-threshold";
        if (element.hasAttribute("data-operating-field")) return "operating-field";
        if (element.hasAttribute("data-territory-traverse")) return "territories";
        return element.id || element.classList[0] || element.tagName.toLowerCase();
      }),
    };
  });
}

async function browserIdentity(browser, executablePath, headed) {
  const session = await browser.newBrowserCDPSession();
  try {
    const identity = await session.send("Browser.getVersion");
    invariant(/^Chrome\/\d/.test(identity.product ?? "") && /(?:HeadlessChrome|Chrome)\/\d/.test(identity.userAgent ?? "") && !/\b(?:Edg|OPR)\//.test(identity.userAgent ?? ""), "explicit executable is not installed Chromium/Chrome authority");
    return {
      product: identity.product,
      version: browser.version(),
      userAgent: identity.userAgent,
      jsVersion: identity.jsVersion,
      executable: path.basename(executablePath),
      installedExecutableSuppliedByCaller: true,
      headed,
      processCount: 1,
      contextCount: 1,
      pageCount: 1,
    };
  } finally { await session.detach(); }
}

async function writeArtifact(root, relativePath, bytes, ledger) {
  safeRelativePath(relativePath);
  const destination = path.join(root, ...relativePath.split("/"));
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes, { flag: "wx" });
  ledger.push({ path: relativePath, bytes: bytes.length, sha256: sha256(bytes) });
  return ledger.at(-1);
}

async function prepareOutput(candidate) {
  const resolved = path.resolve(candidate);
  invariant(resolved !== path.parse(resolved).root && !within(ROOT, resolved), "evidence root must be a fresh directory outside the repository");
  invariant(!await exists(resolved), "refusing to overwrite an existing evidence root");
  await mkdir(resolved, { recursive: false });
  return resolved;
}

export async function runAcceptedAuthorityRegression(options) {
  const executable = await stat(options.chromiumExecutable).catch(() => null);
  invariant(executable?.isFile(), "caller-supplied installed Chromium executable does not exist");
  const output = await prepareOutput(options.evidenceRoot);
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    executablePath: options.chromiumExecutable,
    headless: !options.headed,
    args: ["--force-color-profile=srgb"],
  });
  const artifactLedger = [];
  let context;
  try {
    const identity = await browserIdentity(browser, options.chromiumExecutable, options.headed);
    context = await browser.newContext({
      viewport: options.viewport,
      deviceScaleFactor: 1,
      colorScheme: "dark",
      reducedMotion: "no-preference",
      locale: "en-GB",
      timezoneId: "UTC",
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(options.timeoutMs);
    const cases = [];
    for (const specification of GOVERNED_STATES) {
      const baseline = await captureOne(page, options.phase7bUrl, options.phase7bRevision, specification, options);
      const current = await captureOne(page, options.phase7cUrl, options.phase7cRevision, specification, options);
      const structured = compareStructuredAuthority(baseline.snapshot, current.snapshot);
      const [baselineDecoded, currentDecoded, baselineText, currentText, baselineProtected, currentProtected] = await Promise.all([
        decodePng(baseline.screenshot), decodePng(current.screenshot), decodePng(baseline.textMask), decodePng(current.textMask), decodePng(baseline.protectedMask), decodePng(current.protectedMask),
      ]);
      for (const decoded of [currentDecoded, baselineText, currentText, baselineProtected, currentProtected]) {
        invariant(decoded.width === baselineDecoded.width && decoded.height === baselineDecoded.height, `${specification.id} paired raster dimensions differ`);
      }
      const typographyMask = buildTypographyEdgeMask({
        baselineAlpha: alphaChannel(baselineText), currentAlpha: alphaChannel(currentText), width: baselineDecoded.width, height: baselineDecoded.height,
      });
      const protectedMask = buildProtectedGeometryMask({
        baselineAlpha: alphaChannel(baselineProtected), currentAlpha: alphaChannel(currentProtected), width: baselineDecoded.width, height: baselineDecoded.height,
        outlineBands: baseline.snapshot.focusProtection,
      });
      const pixels = classifyGovernedPixels({
        baseline: baselineDecoded.data,
        current: currentDecoded.data,
        width: baselineDecoded.width,
        height: baselineDecoded.height,
        textEdgeMask: typographyMask.mask,
        protectedMask: protectedMask.mask,
        textRects: baseline.snapshot.textElements,
      });
      if (structured.status !== "PASS") {
        pixels.status = "FAIL";
        pixels.adjudication = {
          ...pixels.adjudication,
          status: "FAIL — MEANINGFUL_DIFFERENCE",
          classification: "MEANINGFUL_DIFFERENCE",
          failedConditions: [...new Set([...pixels.adjudication.failedConditions, "semanticComputedStyleRectangleOrStructuralGeometryExact"])],
        };
      }
      const prefix = `paired/${specification.id}`;
      const baselinePath = `${prefix}-phase7b.png`;
      const currentPath = `${prefix}-phase7c.png`;
      const differencePath = `${prefix}-difference-mask.png`;
      const typographyPath = `${prefix}-typography-edge-mask.png`;
      const protectedPath = `${prefix}-protected-geometry-mask.png`;
      await writeArtifact(output, baselinePath, baseline.screenshot, artifactLedger);
      await writeArtifact(output, currentPath, current.screenshot, artifactLedger);
      await writeArtifact(output, differencePath, await encodeRgba(differenceMaskRgba(pixels), baselineDecoded.width, baselineDecoded.height), artifactLedger);
      await writeArtifact(output, typographyPath, await encodeRgba(maskRgba(typographyMask.mask), baselineDecoded.width, baselineDecoded.height), artifactLedger);
      await writeArtifact(output, protectedPath, await encodeRgba(maskRgba(protectedMask.mask), baselineDecoded.width, baselineDecoded.height), artifactLedger);
      cases.push({
        id: specification.id,
        specification,
        status: structured.status === "PASS" && pixels.status === "PASS" ? "PASS" : "FAIL",
        sameSessionAuthority: { process: 1, context: 1, page: 1, configuration: { viewport: options.viewport, deviceScaleFactor: 1, colorScheme: "dark", reducedMotion: "no-preference", locale: "en-GB", timezone: "UTC" } },
        baseline: { revision: options.phase7bRevision, screenshot: { path: baselinePath, ...baseline.image }, settlement: baseline.settlement, authority: baseline.snapshot },
        current: { revision: options.phase7cRevision, screenshot: { path: currentPath, ...current.image }, settlement: current.settlement, authority: current.snapshot },
        structuredAuthority: structured,
        pixelAuthority: pixels,
        maskAuthority: {
          typography: { ...typographyMask, mask: undefined, path: typographyPath },
          protectedGeometry: { ...protectedMask, mask: undefined, path: protectedPath },
          generatedFromActualRaster: true,
          manuallyPaintedCoordinates: false,
        },
        differenceMask: { path: differencePath, palette: { eligibleNeutralTypographyEdge: "#ff00a8", outsideContract: "#ff3030", protectedGeometry: "#ffd000", unchanged: "#080808" } },
      });
    }

    const parentAdditive = await additiveSnapshot(page, options.phase7bUrl, options.timeoutMs);
    const currentAdditive = await additiveSnapshot(page, options.phase7cUrl, options.timeoutMs);
    const additive = validateAdditiveAuthority(parentAdditive, currentAdditive);
    const checks = {
      allGovernedStatesCaptured: cases.length === GOVERNED_STATES.length,
      everyAcceptedAuthorityRetained: cases.every(({ status }) => status === "PASS"),
      exactAndEquivalenceTaxonomyPreserved: cases.every(({ pixelAuthority }) => pixelAuthority.exactComparison.status === "PASS"
        ? pixelAuthority.adjudication.status === "PASS — EXACT"
        : pixelAuthority.adjudication.status === "PASS — EDGE_QUANTIZATION_EQUIVALENT"),
      additiveOnlyAfterDecide: additive.status === "PASS",
      oneInstalledChromiumProcessContextAndPage: identity.processCount === 1 && identity.contextCount === 1 && identity.pageCount === 1,
    };
    const report = {
      schema: SCHEMA,
      status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL",
      authority: {
        phase7b: { revision: options.phase7bRevision, baseUrl: options.phase7bUrl },
        phase7c: { revision: options.phase7cRevision, baseUrl: options.phase7cUrl },
        baselineMutation: "NONE",
        productionMutation: "NONE",
      },
      browser: identity,
      captureMethod: {
        pairing: "SEQUENTIAL_SAME_PROCESS_CONTEXT_PAGE_AND_CONFIGURATION",
        settlement: "BOUNDED_OBSERVABLE_PREDICATE_STABLE_FOR_THREE_ANIMATION_FRAMES",
        screenshot: "PLAYWRIGHT_VIEWPORT_PNG",
        pixelDecode: "SHARP_RGBA",
        typographyMask: "ACTUAL_ISOLATED_TEXT_RASTER_EDGE_INTERSECTION_DILATED_ONE_PIXEL",
        protectedGeometryMask: "ACTUAL_ISOLATED_SVG_Q_SIGNAL_STRUCTURE_RASTER_PLUS_FOCUS_BANDS",
        computedSvgCssomCanonicalization: "PX_VALUES_QUANTIZED_TO_1_OVER_65536_CSS_PIXEL; DOM_RECTANGLES_AND_AUTHORED_GEOMETRY_REMAIN_EXACT",
      },
      checks,
      additiveAuthority: additive,
      cases,
    };
    const reportBytes = Buffer.from(stable(report));
    await writeArtifact(output, REPORT_PATH, reportBytes, artifactLedger);
    const manifest = {
      schema: MANIFEST_SCHEMA,
      status: report.status,
      report: { path: REPORT_PATH, bytes: reportBytes.length, sha256: sha256(reportBytes) },
      payloads: artifactLedger.slice().sort((a, b) => a.path.localeCompare(b.path)),
      duplicatePaths: false,
      traversalPaths: false,
    };
    const manifestBytes = Buffer.from(stable(manifest));
    await writeFile(path.join(output, MANIFEST_PATH), manifestBytes, { flag: "wx" });
    return { report, manifest: { ...manifest, manifest: { path: MANIFEST_PATH, bytes: manifestBytes.length, sha256: sha256(manifestBytes) } }, output };
  } finally {
    if (context) await context.close();
    await browser.close();
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: node scripts/capture-phase7c-accepted-authority-regression.mjs --phase7b-url <base/> --phase7c-url <base/> --phase7c-revision <sha40> --chromium-executable <path> --evidence-root <fresh-external-dir> [--phase7b-revision <sha40>] [--viewport 1440x900] [--timeout-ms 30000] [--headed]\n");
    return;
  }
  const result = await runAcceptedAuthorityRegression(options);
  process.stdout.write(stable({
    schema: result.report.schema,
    status: result.report.status,
    report: result.manifest.report,
    manifest: result.manifest.manifest,
    cases: result.report.cases.map(({ id, status, pixelAuthority }) => ({ id, status, exact: pixelAuthority.exactComparison.status, adjudication: pixelAuthority.adjudication.status })),
    additiveAuthority: result.report.additiveAuthority.status,
  }));
  if (result.report.status !== "PASS") process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
