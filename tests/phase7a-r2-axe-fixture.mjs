import { createHash } from "node:crypto";

import {
  PHASE7A_R2_AXE_SCHEMA,
  PHASE7A_R2_AXE_VERSION,
  PHASE7A_R2_LOCAL_CONTRAST_CASES,
  PHASE7A_R2_PARENT,
} from "../scripts/phase7a-r2-field-map-authority.mjs";

const [HOME_CONTRAST_CASE, OPEN_CONTRAST_CASE] = PHASE7A_R2_LOCAL_CONTRAST_CASES;

const HOME_TARGETS = Object.freeze([
  ".brand-link > span",
  ".field-map__trigger-label",
  ".field-map__trigger-state",
  ".manifesto-line--one > .manifesto-word:nth-child(1)",
  ".manifesto-line--one > .manifesto-word:nth-child(2)",
  ".manifesto-line--two > .manifesto-word:nth-child(1)",
  ".manifesto-line--two > .manifesto-word:nth-child(2)",
  ".manifesto-line--three > .manifesto-word:nth-child(1)",
  ".manifesto-word--contact",
  ".manifesto-word:nth-child(3)",
  ...HOME_CONTRAST_CASE.selectors.map(({ selector }) => selector),
]);

const OPEN_TARGETS = Object.freeze(OPEN_CONTRAST_CASE.selectors.map(({ selector }) => selector));

function rgb(value) {
  const match = /^(?:rgb|rgba)\((\d+),(\d+),(\d+)(?:,([\d.]+))?\)$/.exec(value);
  return { channels: match.slice(1, 4).map(Number), alpha: match[4] === undefined ? 1 : Number(match[4]) };
}

function hex(value) {
  return value.slice(1).match(/.{2}/g).map((channel) => Number.parseInt(channel, 16));
}

function toHex(channels) {
  return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function luminance(channels) {
  const values = channels.map((value) => value / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

function ratio(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function selectorMeasurement(engine, engineIndex, contrastCase, screenshotBytes) {
  const worstBackground = "#090c0d";
  const background = hex(worstBackground);
  const samples = contrastCase.selectors.map((record, index) => {
    const foreground = rgb(record.foreground);
    const composite = foreground.channels.map((channel, channelIndex) => Math.round(channel * foreground.alpha + background[channelIndex] * (1 - foreground.alpha)));
    const rect = { x: 20 + (index % 5) * 250, y: 80 + Math.floor(index / 5) * 120, width: 100, height: 20 };
    const pixelBounds = { x0: rect.x, y0: rect.y, x1: rect.x + rect.width, y1: rect.y + rect.height };
    return {
      ...record,
      rect,
      pixelBounds,
      sampledPixelCount: rect.width * rect.height,
      worstBackground,
      compositedForeground: toHex(composite),
      minimumRatio: Number(ratio(composite, background).toFixed(3)),
      status: "PASS",
    };
  });
  return {
    engine,
    route: contrastCase.route,
    state: contrastCase.state,
    viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
    maskingMethod: "temporary color:transparent and -webkit-text-fill-color:transparent on every exact selector-local axe-incomplete text selector; layout, element backgrounds and pseudo-elements preserved; screenshot pixels sampled beneath original element bounding boxes",
    screenshot: {
      path: `screenshots/${engine}-${contrastCase.id}-background-mask.png`,
      bytes: screenshotBytes ? screenshotBytes.length : 1000 + engineIndex * 10 + (contrastCase.state === "field-map-open" ? 1 : 0),
      sha256: screenshotBytes ? createHash("sha256").update(screenshotBytes).digest("hex") : (engineIndex === 0 ? "a" : "b").repeat(64),
      width: 1440,
      height: 900,
    },
    samples,
    status: "PASS",
  };
}

function authorityFor(state, target) {
  const local = PHASE7A_R2_LOCAL_CONTRAST_CASES.find((record) => record.state === state)?.selectors.find(({ selector }) => selector === target);
  if (local) return { authorityKind: "selector-local", authorityId: local.id };
  if (state === "reduced-motion-home" && (target === ".field-map__trigger-label" || target === ".brand-link > span")) return { authorityKind: "fixed-pair", authorityId: "closed-header-white-over-authored-upper-bound" };
  if (state === "reduced-motion-home" && target === ".field-map__trigger-state") return { authorityKind: "fixed-pair", authorityId: "closed-header-muted-over-authored-upper-bound" };
  return { authorityKind: "fixed-pair", authorityId: "manifesto-white-over-live-magenta" };
}

function axeCase(route, state, targets) {
  return {
    route,
    state,
    status: "PASS",
    passes: 32,
    violations: [],
    incomplete: [{
      id: "color-contrast",
      impact: "serious",
      help: "Elements must meet minimum color contrast ratio thresholds",
      nodes: targets.map((target) => ({ target: [target], failureSummary: "Synthetic governed incomplete fixture", html: "<span>fixture</span>" })),
    }],
  };
}

export function r2AxeAuthorityFixture({ screenshotBytes = null } = {}) {
  const selectorMeasurements = ["chromium", "firefox"].flatMap((engine, engineIndex) => PHASE7A_R2_LOCAL_CONTRAST_CASES.map((contrastCase) => selectorMeasurement(engine, engineIndex, contrastCase, screenshotBytes)));
  const engines = ["chromium", "firefox"].map((engine) => {
    const cases = [axeCase("/", "reduced-motion-home", HOME_TARGETS), axeCase("/about/", "field-map-open", OPEN_TARGETS)];
    return { engine, status: "PASS", violationCount: 0, incompleteCount: 2, cases };
  });
  const bindings = engines.flatMap(({ engine, cases }) => cases.flatMap(({ route, state, incomplete }) => incomplete.flatMap(({ nodes }) => nodes.map(({ target }) => ({
    engine,
    route,
    state,
    target,
    ...authorityFor(state, target[0]),
  })))));
  return {
    schema: PHASE7A_R2_AXE_SCHEMA,
    status: "PASS",
    parent: PHASE7A_R2_PARENT,
    axeVersion: PHASE7A_R2_AXE_VERSION,
    engines,
    manualContrast: {
      method: "WCAG 2.x relative luminance; the closed header uses a channel-wise #242424 upper bound derived from rgba(8,11,12,0.9) over any clipped backdrop; the manifesto uses its authored live-magenta pair; every incomplete over complex home or open-Field-Map material is bound one-to-one to an engine-local masked screenshot using temporary color:transparent and -webkit-text-fill-color:transparent while preserving layout, element backgrounds and pseudo-elements",
      pairs: [
        { id: "closed-header-white-over-authored-upper-bound", foreground: "#ffffff", background: "#242424", threshold: 4.5, ratio: 15.523 },
        { id: "closed-header-muted-over-authored-upper-bound", foreground: "#8a9797", background: "#242424", threshold: 4.5, ratio: 5.14 },
        { id: "manifesto-white-over-live-magenta", foreground: "#ffffff", background: "#d82b72", threshold: 3, ratio: 4.658 },
      ],
      selectorMeasurements,
      bindings,
      status: "PASS",
    },
  };
}
