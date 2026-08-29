// QH_PHASE5AR_ROUTE_LAB_ONLY
import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

import {
  ROUTE_ORDER,
  ROUTES,
  architectureFingerprint,
} from "../prototypes/phase-5a-r-supporting-routes/route-data.mjs";

export const SCHEMA = "qh.phase5ar.responsive-route-qa.v1";
export const CANARY = "QH_PHASE5AR_ROUTE_LAB_ONLY";
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const LAB_ROOT = path.join(ROOT, "prototypes", "phase-5a-r-supporting-routes");
export const CAPTURE_PLAN_PATH = path.join(LAB_ROOT, "capture-plan.json");
export const SERVER_PATH = path.join(LAB_ROOT, "server.mjs");
export const TARGET_MINIMUM = 44;
export const OVERFLOW_TOLERANCE = 1.5;
export const PRIMARY_COPY_EXCLUSIONS = ".act-map,.act-note,.preproduction-status";

export const SELECTOR_CONTRACT = Object.freeze({
  "for-industry": Object.freeze({
    overture: ".industry-act--pressure",
    copy: ".industry-act--pressure .title-block",
    geometry: ".industry-load",
    proposition: Object.freeze([]),
  }),
  "for-startups": Object.freeze({
    overture: ".startup-act--signal",
    copy: ".startup-act--signal .title-block",
    geometry: ".startup-signal-map",
    proposition: Object.freeze([]),
  }),
  industries: Object.freeze({
    overture: ".industries-threshold",
    copy: ".industries-threshold .title-block",
    geometry: ".territory-threshold",
    proposition: Object.freeze([]),
  }),
  proof: Object.freeze({
    overture: ".proof-act--threshold",
    copy: ".proof-act--threshold .title-block",
    geometry: ".proof-puncture",
    proposition: Object.freeze([]),
  }),
  maradin: Object.freeze({
    overture: ".maradin-act--opening",
    copy: ".maradin-act--opening .title-block",
    geometry: ".documentary-frame--opening",
    proposition: Object.freeze([]),
  }),
  spark: Object.freeze({
    overture: ".spark-act--runway",
    copy: ".spark-act--runway .title-block",
    geometry: ".spark-runway",
    proposition: Object.freeze([
      Object.freeze({ selector: ".spark-act--runway h1", minimum: 1 }),
      Object.freeze({ selector: ".spark-status", minimum: 1, text: "Applications closed" }),
    ]),
  }),
  about: Object.freeze({
    overture: ".about-act--worlds",
    copy: ".about-act--worlds .title-block",
    geometry: ".about-joint",
    proposition: Object.freeze([]),
  }),
  contact: Object.freeze({
    overture: ".contact-arrival",
    copy: ".contact-heading",
    geometry: ".intent-field",
    proposition: Object.freeze([
      Object.freeze({ selector: ".contact-heading h1", minimum: 1 }),
      Object.freeze({ selector: ".intent-rail", minimum: 3 }),
      Object.freeze({ selector: ".endpoint-plane", minimum: 1 }),
    ]),
  }),
  "404": Object.freeze({
    overture: ".notfound-field",
    copy: ".notfound-copy",
    geometry: ".misregistered-plane",
    proposition: Object.freeze([
      Object.freeze({ selector: ".notfound-copy h1", minimum: 1 }),
      Object.freeze({ selector: ".notfound-copy .lede", minimum: 1 }),
      Object.freeze({ selector: ".recovery-link", minimum: 1, text: "Return Home" }),
    ]),
  }),
});

export const CLASS_SCENARIOS = Object.freeze([
  "text-200",
  "fallback-font",
  "reduced-motion",
  "no-js",
  "keyboard-desktop",
  "keyboard-mobile",
]);

export const ROUTE_QA = Object.freeze(Object.fromEntries(ROUTE_ORDER.map((slug) => [slug, Object.freeze({
  slug,
  path: ROUTES[slug].publicPath,
  title: ROUTES[slug].title,
  actCount: ROUTES[slug].architecture.actCount,
  documentRegions: ROUTES[slug].architecture.documentRegions,
  architecture: architectureFingerprint(ROUTES[slug]),
  selectors: SELECTOR_CONTRACT[slug],
})])));

function exactArray(actual, expected, label) {
  assert.ok(Array.isArray(actual), `${label} must be an array`);
  assert.deepEqual(actual, expected, `${label} differs from the Phase 5A-R responsive contract`);
}

function viewportKey(viewport) {
  return `${viewport.id}:${viewport.width}x${viewport.height}`;
}

export function validateCapturePlanForQa(plan) {
  assert.equal(plan?.schema, "qh.phase5ar.supporting-route-capture-plan.v1", "capture-plan schema differs");
  assert.equal(plan?.canary, CANARY, "capture-plan canary differs");
  exactArray(plan?.routes, ROUTE_ORDER, "capture-plan routes");
  assert.equal(plan?.validationViewports?.length, 13, "responsive QA requires exactly 13 validation viewports");
  assert.equal(new Set(plan.validationViewports.map(viewportKey)).size, 13, "validation viewports must be unique");
  exactArray(plan?.viewports, plan.validationViewports, "capture-plan viewport aliases");
  assert.equal(plan?.shortLandscapeViewports?.length, 5, "responsive QA requires five short-landscape neighbors");
  const validationKeys = new Set(plan.validationViewports.map(viewportKey));
  for (const viewport of plan.shortLandscapeViewports) {
    assert.ok(validationKeys.has(viewportKey(viewport)), `${viewport.id} is not a validation viewport`);
    assert.ok(viewport.height <= 480 && viewport.width > viewport.height, `${viewport.id} is not short landscape`);
  }
  for (const slug of ROUTE_ORDER) {
    assert.equal(plan?.actCounts?.[slug], ROUTE_QA[slug].actCount, `${slug} capture-plan act count differs`);
    assert.equal(plan?.documentRegions?.[slug], ROUTE_QA[slug].documentRegions, `${slug} capture-plan document regions differ`);
    assert.ok(SELECTOR_CONTRACT[slug], `${slug} has no QA selector contract`);
  }
  assert.equal(plan?.rules?.stickyChapter, false, "sticky chapters must remain prohibited");
  assert.equal(plan?.rules?.phase5BAuthorized, false, "Phase 5B must remain unauthorized");
  assert.equal(plan?.rules?.publicRoutesChanged, false, "public supporting routes must remain frozen");
  return true;
}

function diagnostic(context, code, message, details = {}) {
  return {
    scenario: context.scenario,
    route: context.route,
    viewport: context.viewport,
    code,
    message,
    ...details,
  };
}

function approximatelyInside(rect, viewport, tolerance = 2) {
  return rect
    && rect.width > 0
    && rect.height > 0
    && rect.left >= -tolerance
    && rect.top >= -tolerance
    && rect.right <= viewport.width + tolerance
    && rect.bottom <= viewport.height + tolerance;
}

export function validateObservation(observation, routeContract, options = {}) {
  const scenario = options.scenario ?? observation.scenario ?? "base";
  const context = {
    scenario,
    route: routeContract.slug,
    viewport: observation.viewport?.id ?? "unknown",
  };
  const issues = [];
  const add = (code, message, details) => issues.push(diagnostic(context, code, message, details));

  if (observation.route !== routeContract.slug) add("route-identity", `expected html[data-route=${routeContract.slug}]`, { actual: observation.route });
  if (observation.board !== "page") add("board-mode", "responsive QA must exercise the page board", { actual: observation.board });
  if (observation.architecture !== routeContract.architecture) add("architecture-identity", "rendered architecture fingerprint differs from route data", { actual: observation.architecture, expected: routeContract.architecture });
  if (observation.mainCount !== 1) add("main-count", "page must contain exactly one main landmark", { actual: observation.mainCount, expected: 1 });
  if (observation.actCount !== routeContract.actCount) add("act-count", "rendered major-act count differs", { actual: observation.actCount, expected: routeContract.actCount });
  if (observation.documentRegions !== routeContract.documentRegions) add("document-regions", "document-region count differs", { actual: observation.documentRegions, expected: routeContract.documentRegions });
  const expectedActs = Array.from({ length: routeContract.actCount }, (_unused, index) => String(index + 1));
  if (JSON.stringify(observation.actSequence) !== JSON.stringify(expectedActs)) add("act-sequence", "data-act values must be exact and sequential", { actual: observation.actSequence, expected: expectedActs });

  if (observation.h1Count !== 1) add("h1-count", "route must contain exactly one H1", { actual: observation.h1Count, expected: 1 });
  if (observation.h1?.text !== routeContract.title) add("h1-copy", "H1 copy differs from the authored route title", { actual: observation.h1?.text, expected: routeContract.title });
  if (!observation.h1?.visible) add("h1-hidden", "H1 is not visibly rendered", { selector: "h1" });
  if (observation.h1?.brokenWords?.length) add("h1-word-break", "H1 breaks one or more words across lines", { selector: "h1", actual: observation.h1.brokenWords });
  if (observation.h1?.clippedBy?.length) add("h1-ancestor-clip", "H1 escapes a clipping ancestor", { selector: "h1", actual: observation.h1.clippedBy });
  if ((observation.h1?.scrollWidth ?? 0) > (observation.h1?.clientWidth ?? 0) + OVERFLOW_TOLERANCE && ["hidden", "clip"].includes(observation.h1?.overflowX)) add("h1-horizontal-clip", "H1 is horizontally clipped by its own overflow rule", { selector: "h1", actual: observation.h1?.scrollWidth, expectedMaximum: observation.h1?.clientWidth });
  if ((observation.h1?.scrollHeight ?? 0) > (observation.h1?.clientHeight ?? 0) + OVERFLOW_TOLERANCE && ["hidden", "clip"].includes(observation.h1?.overflowY)) add("h1-vertical-clip", "H1 is vertically clipped by its own overflow rule", { selector: "h1", actual: observation.h1?.scrollHeight, expectedMaximum: observation.h1?.clientHeight });
  if (["break-all", "break-word"].includes(observation.h1?.wordBreak) || observation.h1?.hyphens === "auto") add("h1-breaking-style", "H1 enables destructive word breaking or hyphenation", { selector: "h1", actual: { wordBreak: observation.h1?.wordBreak, hyphens: observation.h1?.hyphens } });
  const h1TextRect = observation.h1?.textRect ?? observation.h1?.rect;
  if (h1TextRect && (h1TextRect.left < -2 || h1TextRect.right > observation.viewport.width + 2)) add("h1-text-horizontal", "rendered H1 glyphs leave the horizontal viewport", { selector: "h1", actual: h1TextRect, expected: observation.viewport });
  if (options.requireH1InViewport !== false && !approximatelyInside(h1TextRect, observation.viewport)) add("h1-first-viewport", "complete H1 text must fit inside the initial viewport", { selector: "h1", actual: h1TextRect, expected: observation.viewport });

  if (observation.horizontalOverflow > OVERFLOW_TOLERANCE) add("horizontal-overflow", "document is wider than the viewport", { actual: observation.horizontalOverflow, expectedMaximum: OVERFLOW_TOLERANCE });
  for (const outlier of observation.horizontalContentOutliers ?? []) add("semantic-horizontal-overflow", "visible semantic content leaves the horizontal viewport", { selector: outlier.selector, actual: outlier.rect, expected: observation.viewport });
  for (const positioned of observation.stickyOrFixed ?? []) add("sticky-fixed", "sticky/fixed positioning is prohibited in route preproduction", { selector: positioned.selector, actual: positioned.position });

  if (observation.headingLevels?.[0] !== 1) add("heading-order", "first semantic heading must be the H1", { actual: observation.headingLevels });
  for (let index = 1; index < (observation.headingLevels?.length ?? 0); index += 1) {
    if (observation.headingLevels[index] > observation.headingLevels[index - 1] + 1) add("heading-skip", "heading hierarchy skips a level", { actual: observation.headingLevels, index });
  }
  if (observation.emptyHeadings?.length) add("empty-heading", "all headings require semantic text", { actual: observation.emptyHeadings });
  if (observation.duplicateHeadingIds?.length) add("heading-id", "heading IDs must be unique", { actual: observation.duplicateHeadingIds });
  if (observation.brokenLabelledBy?.length) add("aria-labelledby", "aria-labelledby points to a missing ID", { actual: observation.brokenLabelledBy });
  if (!observation.skipLinkValid) add("skip-link", "skip link must target the single main landmark", { selector: ".skip-link" });

  if (options.requireFirstComposition) {
    if (!observation.first?.overture?.visible) add("overture-missing", "route overture selector is absent or hidden", { selector: routeContract.selectors.overture });
    const copyContentRect = observation.first?.copy?.contentRect ?? observation.first?.copy?.rect;
    if (!approximatelyInside(copyContentRect, observation.viewport)) add("short-landscape-copy", "visible semantic opening copy does not fit the first short-landscape composition", { selector: routeContract.selectors.copy, actual: copyContentRect, expected: observation.viewport });
    if ((observation.first?.geometry?.intersectionRatio ?? 0) < 0.01) add("short-landscape-identity", "route-defining overture geometry is not materially visible", { selector: routeContract.selectors.geometry, actual: observation.first?.geometry?.intersectionRatio, expectedMinimum: 0.01 });
  }

  if (options.requireShortProposition) {
    for (const proposition of observation.propositions ?? []) {
      const expected = routeContract.selectors.proposition.find((item) => item.selector === proposition.selector);
      if (!expected) continue;
      if (proposition.elements.length < expected.minimum) add("short-proposition-missing", "short-route proposition element is missing", { selector: proposition.selector, actual: proposition.elements.length, expectedMinimum: expected.minimum });
      for (const element of proposition.elements) {
        if (!approximatelyInside(element.rect, observation.viewport)) add("short-proposition-fold", "short-route proposition is not fully visible in the first viewport", { selector: proposition.selector, actual: element.rect, expected: observation.viewport, text: element.text });
        if (expected.text && !element.text.includes(expected.text)) add("short-proposition-copy", "short-route proposition copy differs", { selector: proposition.selector, actual: element.text, expected: expected.text });
      }
    }
  }

  if (options.requireTargets) {
    for (const target of observation.targets ?? []) {
      if (target.rect.width + 0.01 < TARGET_MINIMUM || target.rect.height + 0.01 < TARGET_MINIMUM) add("target-size", "visible interactive target is smaller than 44×44 CSS pixels", { selector: target.selector, actual: { width: target.rect.width, height: target.rect.height }, expectedMinimum: TARGET_MINIMUM, text: target.text });
    }
  }

  if (options.expectJs === true && observation.jsMode !== "enhanced") add("js-enhancement", "enhanced page did not declare its JS mode", { actual: observation.jsMode });
  if (options.expectJs === false && observation.jsMode) add("no-js-executed", "no-JS class unexpectedly executed the enhancement", { actual: observation.jsMode });
  if (options.expectReduced) {
    if (!observation.reducedMotion) add("reduced-motion-query", "reduced-motion browser class is not active");
    if (observation.motion.activeAnimations.length || observation.motion.activeTransitions.length) add("reduced-motion-runtime", "reduced-motion class retains non-trivial animation or transition timing", { actual: observation.motion });
    if (observation.inViewAttributes || observation.inlineProgress) add("reduced-motion-observer", "reduced-motion class must not create scroll-state attributes or inline progress", { actual: { inViewAttributes: observation.inViewAttributes, inlineProgress: observation.inlineProgress } });
  }
  if (options.expectedClass && !observation.classes.includes(options.expectedClass)) add("qa-class", `missing ${options.expectedClass} QA class`, { actual: observation.classes });
  if (options.fallbackFont && !/arial|helvetica|sans-serif/i.test(observation.h1?.fontFamily ?? "")) add("fallback-font", "fallback-font class did not replace the display face", { actual: observation.h1?.fontFamily });
  if (options.requireAllActsVisible) {
    for (const act of observation.acts ?? []) if (!act.visible || act.textLength < 8) add("static-act", "static accessibility class hides or empties a route act", { selector: act.selector, actual: act });
  }
  return issues;
}

export function validateArchitectureIdentity(records) {
  const issues = [];
  const byRoute = new Map();
  for (const record of records) {
    const previous = byRoute.get(record.route);
    if (previous && previous !== record.architecture) issues.push({ code: "architecture-drift", route: record.route, actual: record.architecture, expected: previous });
    else byRoute.set(record.route, record.architecture);
  }
  for (const slug of ROUTE_ORDER) if (!byRoute.has(slug)) issues.push({ code: "architecture-missing", route: slug });
  const owners = new Map();
  for (const [slug, fingerprint] of byRoute) {
    if (owners.has(fingerprint)) issues.push({ code: "architecture-duplicate", route: slug, sibling: owners.get(fingerprint), architecture: fingerprint });
    else owners.set(fingerprint, slug);
  }
  return issues;
}

export function groupDiagnostics(issues) {
  const groups = new Map();
  for (const issue of issues) {
    const key = [issue.code, issue.route, issue.selector ?? ""].join("|");
    const group = groups.get(key) ?? { code: issue.code, route: issue.route, selector: issue.selector ?? null, occurrences: 0, viewports: [], samples: [] };
    group.occurrences += 1;
    if (issue.viewport && !group.viewports.includes(issue.viewport)) group.viewports.push(issue.viewport);
    if (group.samples.length < 4) group.samples.push(issue);
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => `${left.route}|${left.code}|${left.selector}`.localeCompare(`${right.route}|${right.code}|${right.selector}`));
}

async function collectObservation(page, routeContract, scenario, viewportId) {
  return page.evaluate(({ contract, scenarioName, id, primaryCopyExclusions }) => {
    const viewport = { id, width: innerWidth, height: innerHeight };
    const rounded = (value) => Math.round(value * 100) / 100;
    const rectFor = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const left = Math.max(0, rect.left);
      const right = Math.min(innerWidth, rect.right);
      const top = Math.max(0, rect.top);
      const bottom = Math.min(innerHeight, rect.bottom);
      const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
      return {
        left: rounded(rect.left), right: rounded(rect.right), top: rounded(rect.top), bottom: rounded(rect.bottom),
        width: rounded(rect.width), height: rounded(rect.height),
        intersectionRatio: rounded(intersection / Math.max(1, innerWidth * innerHeight)),
      };
    };
    const visible = (element) => {
      if (!element || !element.getClientRects().length) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number.parseFloat(style.opacity || "1") > 0.001 && rect.width > 0 && rect.height > 0;
    };
    const contentRectFor = (container) => {
      if (!container) return null;
      const semantic = [...container.querySelectorAll("h1,h2,h3,h4,h5,h6,p,a,figcaption,dt,dd,li,summary")]
        .filter((element) => !element.matches(primaryCopyExclusions) && element.getAttribute("aria-hidden") !== "true" && visible(element) && element.textContent.trim());
      if (!semantic.length) return rectFor(container);
      const rects = semantic.map((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const textRect = range.getBoundingClientRect();
        return textRect.width > 0 && textRect.height > 0 ? textRect : element.getBoundingClientRect();
      });
      const left = Math.min(...rects.map((rect) => rect.left));
      const right = Math.max(...rects.map((rect) => rect.right));
      const top = Math.min(...rects.map((rect) => rect.top));
      const bottom = Math.max(...rects.map((rect) => rect.bottom));
      return { left: rounded(left), right: rounded(right), top: rounded(top), bottom: rounded(bottom), width: rounded(right - left), height: rounded(bottom - top) };
    };
    const selectorFor = (element) => {
      if (!element) return "missing";
      if (element.id) return `#${CSS.escape(element.id)}`;
      const classes = [...element.classList].slice(0, 2).map((name) => `.${CSS.escape(name)}`).join("");
      const siblings = element.parentElement ? [...element.parentElement.children].filter((child) => child.tagName === element.tagName) : [];
      const suffix = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(element) + 1})` : "";
      if (classes) return `${element.tagName.toLowerCase()}${classes}${suffix}`;
      const parts = [`${element.tagName.toLowerCase()}${suffix}`];
      for (let ancestor = element.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
        const ancestorClasses = [...ancestor.classList].slice(0, 2).map((name) => `.${CSS.escape(name)}`).join("");
        const peers = ancestor.parentElement ? [...ancestor.parentElement.children].filter((child) => child.tagName === ancestor.tagName) : [];
        const ancestorSuffix = peers.length > 1 ? `:nth-of-type(${peers.indexOf(ancestor) + 1})` : "";
        parts.unshift(`${ancestor.tagName.toLowerCase()}${ancestorClasses}${ancestorSuffix}`);
        if (ancestor.id || ancestorClasses) break;
      }
      return parts.slice(-5).join(" > ");
    };
    const brokenWords = (heading) => {
      if (!heading) return [];
      const failures = [];
      const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (const match of node.data.matchAll(/\S+/gu)) {
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          const tops = new Set([...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top * 2) / 2));
          if (tops.size > 1) failures.push(match[0]);
        }
      }
      return failures;
    };
    const clippedBy = (heading) => {
      if (!heading) return [];
      const range = document.createRange();
      range.selectNodeContents(heading);
      const headingRect = range.getBoundingClientRect();
      const failures = [];
      for (let ancestor = heading.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (!/(hidden|clip)/.test(`${style.overflowX} ${style.overflowY}`)) continue;
        const rect = ancestor.getBoundingClientRect();
        if (headingRect.left < rect.left - 1 || headingRect.right > rect.right + 1 || headingRect.top < rect.top - 1 || headingRect.bottom > rect.bottom + 1) failures.push(selectorFor(ancestor));
      }
      return failures;
    };
    const timingSeconds = (value) => Math.max(0, ...String(value).split(",").map((part) => {
      const token = part.trim();
      return token.endsWith("ms") ? Number.parseFloat(token) / 1000 : Number.parseFloat(token) || 0;
    }));

    const h1s = [...document.querySelectorAll("h1")];
    const h1 = h1s[0] ?? null;
    const h1Style = h1 ? getComputedStyle(h1) : null;
    const h1TextRect = (() => {
      if (!h1) return null;
      const range = document.createRange();
      range.selectNodeContents(h1);
      const rect = range.getBoundingClientRect();
      return {
        left: rounded(rect.left), right: rounded(rect.right), top: rounded(rect.top), bottom: rounded(rect.bottom),
        width: rounded(rect.width), height: rounded(rect.height),
      };
    })();
    const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")];
    const headingIds = headings.map((heading) => heading.id).filter(Boolean);
    const duplicateHeadingIds = headingIds.filter((value, index) => headingIds.indexOf(value) !== index);
    const acts = [...document.querySelectorAll("[data-act]")];
    const allElements = [...document.querySelectorAll("*")];
    const stickyOrFixed = allElements.flatMap((element) => {
      const position = getComputedStyle(element).position;
      return position === "sticky" || position === "fixed" ? [{ selector: selectorFor(element), position }] : [];
    });
    const semantic = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6,p,a,summary,figcaption,dt,dd,strong")];
    const horizontalContentOutliers = semantic.filter((element) => {
      if (!visible(element)) return false;
      const rect = element.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < innerHeight && (rect.left < -1.5 || rect.right > innerWidth + 1.5);
    }).map((element) => ({ selector: selectorFor(element), rect: rectFor(element), text: element.textContent.trim().slice(0, 100) }));
    const targetSelector = "a[href],button:not([disabled]),summary,input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";
    const targets = [...document.querySelectorAll(targetSelector)].filter((element) => visible(element) && (() => {
      const rect = element.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
    })()).map((element) => ({ selector: selectorFor(element), rect: rectFor(element), text: element.textContent.trim().replace(/\s+/g, " ").slice(0, 100) }));
    const activeAnimations = [];
    const activeTransitions = [];
    for (const element of allElements) {
      if (!visible(element)) continue;
      const style = getComputedStyle(element);
      if (style.animationName !== "none" && timingSeconds(style.animationDuration) > 0.01) activeAnimations.push({ selector: selectorFor(element), name: style.animationName, duration: style.animationDuration });
      if (timingSeconds(style.transitionDuration) > 0.01) activeTransitions.push({ selector: selectorFor(element), duration: style.transitionDuration });
    }
    const proposition = contract.selectors.proposition.map((entry) => ({
      selector: entry.selector,
      elements: [...document.querySelectorAll(entry.selector)].map((element) => ({ rect: rectFor(element), visible: visible(element), text: element.textContent.trim().replace(/\s+/g, " ") })),
    }));
    const firstElement = document.querySelector(contract.selectors.overture);
    const firstCopy = document.querySelector(contract.selectors.copy);
    const firstGeometry = document.querySelector(contract.selectors.geometry);

    return {
      scenario: scenarioName,
      viewport,
      route: document.documentElement.dataset.route ?? null,
      architecture: document.documentElement.dataset.architecture ?? null,
      board: document.body.dataset.board ?? null,
      classes: [...document.documentElement.classList],
      jsMode: document.documentElement.dataset.js ?? null,
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      mainCount: document.querySelectorAll("main").length,
      documentRegions: Number.parseInt(document.querySelector("main")?.dataset.documentRegions ?? "-1", 10),
      actCount: acts.length,
      actSequence: acts.map((act) => act.dataset.act),
      acts: acts.map((act) => ({ selector: selectorFor(act), visible: visible(act), textLength: act.innerText.trim().length })),
      h1Count: h1s.length,
      h1: h1 ? {
        text: h1.textContent.trim().replace(/\s+/g, " "), visible: visible(h1), rect: rectFor(h1), textRect: h1TextRect,
        clientWidth: h1.clientWidth, clientHeight: h1.clientHeight, scrollWidth: h1.scrollWidth, scrollHeight: h1.scrollHeight,
        brokenWords: brokenWords(h1), clippedBy: clippedBy(h1), wordBreak: h1Style.wordBreak,
        overflowWrap: h1Style.overflowWrap, overflowX: h1Style.overflowX, overflowY: h1Style.overflowY, hyphens: h1Style.hyphens, fontFamily: h1Style.fontFamily,
      } : null,
      headingLevels: headings.map((heading) => Number.parseInt(heading.tagName.slice(1), 10)),
      emptyHeadings: headings.filter((heading) => !heading.textContent.trim()).map(selectorFor),
      duplicateHeadingIds: [...new Set(duplicateHeadingIds)],
      brokenLabelledBy: [...document.querySelectorAll("[aria-labelledby]")].flatMap((element) => element.getAttribute("aria-labelledby").split(/\s+/).filter((id) => !document.getElementById(id)).map((id) => ({ selector: selectorFor(element), id }))),
      skipLinkValid: document.querySelector(".skip-link")?.getAttribute("href") === "#main" && document.querySelectorAll("#main").length === 1,
      documentWidths: { viewport: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth },
      horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      horizontalContentOutliers,
      stickyOrFixed,
      targets,
      first: {
        overture: { visible: visible(firstElement), rect: rectFor(firstElement) },
        copy: { visible: visible(firstCopy), rect: rectFor(firstCopy), contentRect: contentRectFor(firstCopy) },
        geometry: { visible: visible(firstGeometry), rect: rectFor(firstGeometry), intersectionRatio: rectFor(firstGeometry)?.intersectionRatio ?? 0 },
      },
      propositions: proposition,
      motion: { activeAnimations, activeTransitions },
      inViewAttributes: document.querySelectorAll("[data-in-view]").length,
      inlineProgress: [...acts].filter((act) => act.style.getPropertyValue("--local-progress")).length,
    };
  }, { contract: routeContract, scenarioName: scenario, id: viewportId, primaryCopyExclusions: PRIMARY_COPY_EXCLUSIONS });
}

async function settle(page) {
  await page.waitForLoadState("load", { timeout: 10_000 });
  await page.waitForTimeout(34);
}

async function loadRoute(page, baseUrl, routeContract) {
  const url = new URL(routeContract.path, baseUrl).href;
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 12_000 });
  if (!response?.ok()) throw new Error(`${routeContract.slug}: ${url} returned ${response?.status() ?? "no response"}`);
  await settle(page);
}

function scenarioIssue(route, viewport, scenario, code, message, details = {}) {
  return diagnostic({ route, viewport, scenario }, code, message, details);
}

async function keyboardAudit(page, routeContract, viewport) {
  const issues = [];
  const state = () => page.evaluate(() => {
    const element = document.activeElement;
    const selectorFor = (target) => {
      if (!target || target === document.body) return target?.tagName?.toLowerCase() ?? "none";
      if (target.id) return `#${CSS.escape(target.id)}`;
      const classes = [...target.classList].slice(0, 2).map((name) => `.${CSS.escape(name)}`).join("");
      const siblings = target.parentElement ? [...target.parentElement.children].filter((child) => child.tagName === target.tagName) : [];
      const suffix = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(target) + 1})` : "";
      if (classes) return `${target.tagName.toLowerCase()}${classes}${suffix}`;
      const parts = [`${target.tagName.toLowerCase()}${suffix}`];
      for (let ancestor = target.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
        const ancestorClasses = [...ancestor.classList].slice(0, 2).map((name) => `.${CSS.escape(name)}`).join("");
        const peers = ancestor.parentElement ? [...ancestor.parentElement.children].filter((child) => child.tagName === ancestor.tagName) : [];
        const ancestorSuffix = peers.length > 1 ? `:nth-of-type(${peers.indexOf(ancestor) + 1})` : "";
        parts.unshift(`${ancestor.tagName.toLowerCase()}${ancestorClasses}${ancestorSuffix}`);
        if (ancestor.id || ancestorClasses) break;
      }
      return parts.slice(-5).join(" > ");
    };
    const rect = element?.getBoundingClientRect?.();
    const style = element ? getComputedStyle(element) : null;
    return {
      selector: selectorFor(element),
      tag: element?.tagName?.toLowerCase() ?? null,
      text: element?.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) ?? "",
      rect: rect ? { width: Math.round(rect.width * 100) / 100, height: Math.round(rect.height * 100) / 100, top: Math.round(rect.top * 100) / 100, left: Math.round(rect.left * 100) / 100 } : null,
      focusVisible: element?.matches?.(":focus-visible") ?? false,
      outline: style ? { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) || 0 } : null,
      detailsOpen: document.querySelector(".mobile-nav")?.open ?? false,
    };
  });
  const expectedCount = () => page.evaluate(() => {
    const selector = "a[href],button:not([disabled]),summary,input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";
    return [...document.querySelectorAll(selector)].filter((element) => element.getClientRects().length && getComputedStyle(element).visibility !== "hidden").length;
  });

  await page.evaluate(() => {
    document.querySelector(".mobile-nav")?.removeAttribute("open");
    document.activeElement?.blur?.();
  });
  const visited = new Map();
  for (let step = 0; step < 36; step += 1) {
    await page.keyboard.press("Tab");
    let current = await state();
    if (step === 0 && current.selector !== ".skip-link" && !current.selector.includes("skip-link")) issues.push(scenarioIssue(routeContract.slug, viewport.id, `keyboard-${viewport.width <= 680 ? "mobile" : "desktop"}`, "keyboard-skip-first", "first Tab must expose the skip link", { actual: current }));
    if (current.tag === "summary" && viewport.width <= 1050 && !current.detailsOpen) {
      await page.keyboard.press("Enter");
      current = await state();
      if (!current.detailsOpen) issues.push(scenarioIssue(routeContract.slug, viewport.id, "keyboard-mobile", "keyboard-menu", "Enter on the route summary must open native navigation", { actual: current }));
    }
    if (!current.selector || current.selector === "body") break;
    if (visited.has(current.selector)) break;
    visited.set(current.selector, current);
    const scenario = `keyboard-${viewport.width <= 680 ? "mobile" : "desktop"}`;
    if (!current.focusVisible || current.outline?.style === "none" || current.outline?.width < 2) issues.push(scenarioIssue(routeContract.slug, viewport.id, scenario, "keyboard-focus", "keyboard target lacks a strong visible focus indicator", { selector: current.selector, actual: current.outline }));
    if (!current.rect || current.rect.width + 0.01 < TARGET_MINIMUM || current.rect.height + 0.01 < TARGET_MINIMUM) issues.push(scenarioIssue(routeContract.slug, viewport.id, scenario, "keyboard-target", "keyboard target is smaller than 44×44 CSS pixels", { selector: current.selector, actual: current.rect, expectedMinimum: TARGET_MINIMUM, text: current.text }));
  }
  const expected = await expectedCount();
  if (visited.size < expected) issues.push(scenarioIssue(routeContract.slug, viewport.id, `keyboard-${viewport.width <= 680 ? "mobile" : "desktop"}`, "keyboard-reachability", "Tab sequence did not reach every visible native target", { actual: [...visited.keys()], expectedCount: expected }));
  return issues;
}

async function runBaseMatrix(browser, baseUrl, plan, smoke) {
  const viewports = smoke
    ? plan.validationViewports.filter(({ id }) => ["desktop", "mobile-narrow", "landscape-844"].includes(id))
    : plan.validationViewports;
  const shortIds = new Set(plan.shortLandscapeViewports.map(({ id }) => id));
  const context = await browser.newContext({ reducedMotion: "no-preference" });
  const page = await context.newPage();
  const external = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") external.push(request.url());
  });
  const issues = [];
  const architectures = [];
  let observations = 0;
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const slug of ROUTE_ORDER) {
      const route = ROUTE_QA[slug];
      await loadRoute(page, baseUrl, route);
      const observation = await collectObservation(page, route, "base", viewport.id);
      issues.push(...validateObservation(observation, route, {
        scenario: "base",
        requireH1InViewport: true,
        requireFirstComposition: shortIds.has(viewport.id),
        requireShortProposition: shortIds.has(viewport.id) && route.selectors.proposition.length > 0,
        requireTargets: true,
        expectJs: true,
      }));
      architectures.push({ route: slug, architecture: observation.architecture });
      observations += 1;
    }
  }
  for (const url of [...new Set(external)]) issues.push(scenarioIssue("all", "all", "base", "external-request", "route lab made a non-loopback request", { actual: url }));
  issues.push(...validateArchitectureIdentity(architectures).map((issue) => scenarioIssue(issue.route, "all", "base", issue.code, "route architecture identity is missing, drifting, or duplicated", issue)));
  await context.close();
  return { issues, observations, viewports: viewports.length };
}

async function runStaticVariant(browser, baseUrl, scenario, viewport, contextOptions = {}) {
  const context = await browser.newContext({ viewport, reducedMotion: contextOptions.reducedMotion ?? "no-preference", javaScriptEnabled: contextOptions.javaScriptEnabled ?? true });
  if (contextOptions.blockFonts) await context.route(/\.woff2?(?:\?.*)?$/i, (route) => route.abort("blockedbyclient"));
  const page = await context.newPage();
  const issues = [];
  let observations = 0;
  for (const slug of ROUTE_ORDER) {
    const route = ROUTE_QA[slug];
    await loadRoute(page, baseUrl, route);
    if (contextOptions.className) {
      await page.evaluate(({ className }) => {
        document.documentElement.classList.add(className);
      }, { className: contextOptions.className });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    const observation = await collectObservation(page, route, scenario, viewport.id);
    issues.push(...validateObservation(observation, route, {
      scenario,
      requireH1InViewport: contextOptions.requireH1InViewport ?? false,
      requireTargets: true,
      expectJs: contextOptions.javaScriptEnabled !== false,
      expectReduced: contextOptions.reducedMotion === "reduce",
      expectedClass: contextOptions.className,
      fallbackFont: contextOptions.blockFonts,
      requireAllActsVisible: true,
    }));
    observations += 1;
  }
  await context.close();
  return { issues, observations };
}

async function runKeyboardMatrix(browser, baseUrl, smoke) {
  const viewports = smoke
    ? [{ id: "keyboard-mobile", width: 390, height: 844 }]
    : [{ id: "keyboard-desktop", width: 1440, height: 900 }, { id: "keyboard-mobile", width: 390, height: 844 }];
  const issues = [];
  let observations = 0;
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
    const page = await context.newPage();
    for (const slug of ROUTE_ORDER) {
      const route = ROUTE_QA[slug];
      await loadRoute(page, baseUrl, route);
      issues.push(...await keyboardAudit(page, route, viewport));
      observations += 1;
    }
    await context.close();
  }
  return { issues, observations };
}

async function executable(candidate) {
  if (!candidate) return false;
  try { await access(candidate, fsConstants.X_OK); return true; } catch { return false; }
}

async function resolveChrome(override) {
  const candidates = override ? [path.resolve(override)] : [];
  if (process.platform === "win32") {
    candidates.push(
      path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
    );
    if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"));
  } else {
    candidates.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium");
  }
  const managed = chromium.executablePath?.();
  if (managed) candidates.push(managed);
  for (const candidate of candidates) if (await executable(candidate)) return candidate;
  throw new Error("Chrome/Chromium not found; pass --browser PATH or set CHROME_PATH");
}

async function startLab() {
  const child = spawn(process.execPath, [SERVER_PATH, "--port=0"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let output = "";
  const baseUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`route lab did not start within 12s\n${output}`)), 12_000);
    const listen = (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}/`);
      }
    };
    child.stdout.on("data", listen);
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`route lab exited before readiness (${code})\n${output}`));
    });
    child.once("error", reject);
  });
  return { child, baseUrl };
}

async function stopLab(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2_000))]);
}

function parseArguments(argv) {
  const options = { browser: process.env.CHROME_PATH ?? null, baseUrl: null, smoke: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--browser" || value === "--base-url") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) throw new Error(`${value} requires a value`);
      options[value === "--browser" ? "browser" : "baseUrl"] = next;
      index += 1;
    } else if (value === "--smoke") options.smoke = true;
    else if (value === "--help" || value === "-h") options.help = true;
    else throw new Error(`unknown argument ${value}`);
  }
  if (options.baseUrl) {
    const url = new URL(options.baseUrl);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error("--base-url must remain loopback-only");
    options.baseUrl = url.href;
  }
  return options;
}

export async function runResponsiveQa({ browserPath = null, baseUrl = null, smoke = false } = {}) {
  const plan = JSON.parse(await readFile(CAPTURE_PLAN_PATH, "utf8"));
  validateCapturePlanForQa(plan);
  let lab = null;
  if (!baseUrl) {
    lab = await startLab();
    baseUrl = lab.baseUrl;
  }
  const executablePath = await resolveChrome(browserPath);
  const browser = await chromium.launch({ headless: true, executablePath });
  const startedAt = Date.now();
  try {
    const base = await runBaseMatrix(browser, baseUrl, plan, smoke);
    const text200 = await runStaticVariant(browser, baseUrl, "text-200", { id: "text-200-1280x800", width: 1280, height: 800 }, {
      className: "qa-text-200",
      requireH1InViewport: false,
    });
    const fallback = await runStaticVariant(browser, baseUrl, "fallback-font", { id: "fallback-320x800", width: 320, height: 800 }, {
      className: "qa-fallback-font",
      blockFonts: true,
      requireH1InViewport: true,
    });
    const reduced = await runStaticVariant(browser, baseUrl, "reduced-motion", { id: "reduced-390x844", width: 390, height: 844 }, {
      reducedMotion: "reduce",
      requireH1InViewport: true,
    });
    const noJs = await runStaticVariant(browser, baseUrl, "no-js", { id: "no-js-390x844", width: 390, height: 844 }, {
      javaScriptEnabled: false,
      requireH1InViewport: true,
    });
    const keyboard = await runKeyboardMatrix(browser, baseUrl, smoke);
    const issues = [...base.issues, ...text200.issues, ...fallback.issues, ...reduced.issues, ...noJs.issues, ...keyboard.issues];
    return {
      schema: SCHEMA,
      status: issues.length ? "REPAIR" : "PASS",
      mode: smoke ? "smoke" : "full",
      canary: CANARY,
      baseUrl,
      routes: ROUTE_ORDER,
      phase5BAuthorized: false,
      publicRoutesChanged: false,
      coverage: {
        capturePlanViewports: base.viewports,
        baseObservations: base.observations,
        text200: text200.observations,
        fallbackFont: fallback.observations,
        reducedMotion: reduced.observations,
        noJs: noJs.observations,
        keyboard: keyboard.observations,
        totalObservations: base.observations + text200.observations + fallback.observations + reduced.observations + noJs.observations + keyboard.observations,
      },
      issueCount: issues.length,
      diagnostics: groupDiagnostics(issues),
      elapsedMs: Date.now() - startedAt,
    };
  } finally {
    await browser.close();
    await stopLab(lab?.child);
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Phase 5A-R responsive route QA\n\nUsage:\n  node scripts/qa-phase5ar-responsive-routes.mjs [--smoke] [--browser PATH] [--base-url LOOPBACK_URL]\n");
    return;
  }
  const report = await runResponsiveQa({ browserPath: options.browser, baseUrl: options.baseUrl, smoke: options.smoke });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== "PASS") process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Phase 5A-R responsive route QA failed: ${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
