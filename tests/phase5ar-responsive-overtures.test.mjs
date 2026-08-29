import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CANARY,
  CAPTURE_PLAN_PATH,
  CLASS_SCENARIOS,
  PRIMARY_COPY_EXCLUSIONS,
  ROUTE_QA,
  SELECTOR_CONTRACT,
  TARGET_MINIMUM,
  groupDiagnostics,
  validateArchitectureIdentity,
  validateCapturePlanForQa,
  validateObservation,
} from "../scripts/qa-phase5ar-responsive-routes.mjs";
import { ROUTE_ORDER, ROUTES } from "../prototypes/phase-5a-r-supporting-routes/route-data.mjs";
import { renderRoute } from "../prototypes/phase-5a-r-supporting-routes/render-route.mjs";

function validObservation(slug = "for-industry", viewport = { id: "landscape-844", width: 844, height: 390 }) {
  const route = ROUTE_QA[slug];
  const propositions = route.selectors.proposition.map((item) => ({
    selector: item.selector,
    elements: Array.from({ length: item.minimum }, () => ({
      rect: { left: 20, top: 110, right: 300, bottom: 154, width: 280, height: 44 },
      visible: true,
      text: item.text ?? "Complete proposition",
    })),
  }));
  return {
    scenario: "base",
    viewport,
    route: slug,
    architecture: route.architecture,
    board: "page",
    classes: [],
    jsMode: "enhanced",
    reducedMotion: false,
    mainCount: 1,
    documentRegions: route.documentRegions,
    actCount: route.actCount,
    actSequence: Array.from({ length: route.actCount }, (_unused, index) => String(index + 1)),
    acts: Array.from({ length: route.actCount }, (_unused, index) => ({ selector: `[data-act='${index + 1}']`, visible: true, textLength: 100 })),
    h1Count: 1,
    h1: {
      text: route.title,
      visible: true,
      rect: { left: 20, top: 90, right: 420, bottom: 180, width: 400, height: 90 },
      clientWidth: 400,
      clientHeight: 90,
      scrollWidth: 400,
      scrollHeight: 90,
      brokenWords: [],
      clippedBy: [],
      wordBreak: "normal",
      overflowWrap: "normal",
      hyphens: "none",
      fontFamily: "Syne, Arial, sans-serif",
    },
    headingLevels: [1, ...Array.from({ length: route.actCount }, () => 2)],
    emptyHeadings: [],
    duplicateHeadingIds: [],
    brokenLabelledBy: [],
    skipLinkValid: true,
    documentWidths: { viewport: viewport.width, html: viewport.width, body: viewport.width },
    horizontalOverflow: 0,
    horizontalContentOutliers: [],
    stickyOrFixed: [],
    targets: [{ selector: ".wordmark", rect: { left: 20, top: 30, right: 100, bottom: 74, width: 80, height: TARGET_MINIMUM }, text: "Quantum Hub" }],
    first: {
      overture: { visible: true, rect: { left: 0, top: 68, right: viewport.width, bottom: viewport.height, width: viewport.width, height: viewport.height - 68 } },
      copy: {
        visible: true,
        rect: { left: 20, top: 74, right: 430, bottom: 350, width: 410, height: 276 },
        contentRect: { left: 20, top: 90, right: 420, bottom: 320, width: 400, height: 230 },
      },
      geometry: { visible: true, rect: { left: 460, top: 68, right: 840, bottom: 390, width: 380, height: 322, intersectionRatio: 0.32 }, intersectionRatio: 0.32 },
    },
    propositions,
    motion: { activeAnimations: [], activeTransitions: [] },
    inViewAttributes: 0,
    inlineProgress: 0,
  };
}

test("responsive QA binds the exact 13-view capture plan and five short-landscape neighbors", async () => {
  const plan = JSON.parse(await readFile(CAPTURE_PLAN_PATH, "utf8"));
  assert.equal(validateCapturePlanForQa(plan), true);
  assert.equal(plan.validationViewports.length, 13);
  assert.equal(plan.shortLandscapeViewports.length, 5);
  assert.deepEqual(plan.routes, ROUTE_ORDER);
  assert.equal(plan.canary, CANARY);
});

test("all nine renderer architectures expose stable overture, copy, and identity selectors", () => {
  assert.deepEqual(Object.keys(SELECTOR_CONTRACT).sort(), [...ROUTE_ORDER].sort());
  for (const slug of ROUTE_ORDER) {
    const html = renderRoute(ROUTES[slug], "page");
    const selectors = SELECTOR_CONTRACT[slug];
    for (const selector of [selectors.overture, selectors.copy, selectors.geometry, ...selectors.proposition.map((item) => item.selector)]) {
      for (const className of [...selector.matchAll(/\.([a-z0-9_-]+)/gi)].map((match) => match[1])) {
        assert.match(html, new RegExp(`class=["'][^"']*\\b${className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`), `${slug} ${selector}`);
      }
    }
    assert.equal(ROUTE_QA[slug].actCount, ROUTES[slug].architecture.actCount);
    assert.equal(ROUTE_QA[slug].documentRegions, ROUTES[slug].architecture.documentRegions);
  }
});

test("observation validator accepts an intentional complete short-landscape composition", () => {
  const observation = validObservation();
  assert.deepEqual(validateObservation(observation, ROUTE_QA["for-industry"], {
    scenario: "base",
    requireH1InViewport: true,
    requireFirstComposition: true,
    requireTargets: true,
    expectJs: true,
  }), []);
});

test("short-landscape copy uses core semantic bounds rather than stretched grid and lab-annotation boxes", () => {
  assert.equal(PRIMARY_COPY_EXCLUSIONS, ".act-map,.act-note,.preproduction-status");
  const observation = validObservation("contact", { id: "landscape-740", width: 740, height: 360 });
  observation.first.copy.rect.bottom = 374;
  observation.first.copy.rect.height = 300;
  observation.first.copy.contentRect = { left: 20, top: 90, right: 280, bottom: 289, width: 260, height: 199 };
  assert.deepEqual(validateObservation(observation, ROUTE_QA.contact, {
    requireH1InViewport: true,
    requireFirstComposition: true,
    requireShortProposition: true,
  }), []);
});

test("observation validator reports precise overflow, H1, sticky, target, composition, and proposition failures", () => {
  const industry = validObservation();
  industry.horizontalOverflow = 19;
  industry.h1.brokenWords = ["industrial"];
  industry.stickyOrFixed = [{ selector: ".industry-act", position: "sticky" }];
  industry.targets[0].rect.height = 32;
  industry.first.copy.contentRect.bottom = 470;
  const industryCodes = new Set(validateObservation(industry, ROUTE_QA["for-industry"], {
    requireH1InViewport: true,
    requireFirstComposition: true,
    requireTargets: true,
    expectJs: true,
  }).map(({ code }) => code));
  for (const code of ["horizontal-overflow", "h1-word-break", "sticky-fixed", "target-size", "short-landscape-copy"]) assert.ok(industryCodes.has(code), code);

  const contact = validObservation("contact");
  contact.propositions[1].elements[0].rect.bottom = 450;
  contact.propositions[2].elements = [];
  const contactCodes = new Set(validateObservation(contact, ROUTE_QA.contact, {
    requireShortProposition: true,
  }).map(({ code }) => code));
  assert.ok(contactCodes.has("short-proposition-fold"));
  assert.ok(contactCodes.has("short-proposition-missing"));
});

test("static-class contracts catch executed no-JS, motion, and missing fallback classes", () => {
  const noJs = validObservation();
  assert.ok(validateObservation(noJs, ROUTE_QA["for-industry"], { scenario: "no-js", expectJs: false }).some(({ code }) => code === "no-js-executed"));

  const reduced = validObservation();
  reduced.reducedMotion = true;
  reduced.motion.activeTransitions.push({ selector: ".industry-act", duration: "1s" });
  assert.ok(validateObservation(reduced, ROUTE_QA["for-industry"], { scenario: "reduced-motion", expectReduced: true }).some(({ code }) => code === "reduced-motion-runtime"));

  const fallback = validObservation();
  fallback.classes = [];
  fallback.h1.fontFamily = "Syne";
  const fallbackCodes = new Set(validateObservation(fallback, ROUTE_QA["for-industry"], { expectedClass: "qa-fallback-font", fallbackFont: true }).map(({ code }) => code));
  assert.ok(fallbackCodes.has("qa-class"));
  assert.ok(fallbackCodes.has("fallback-font"));
});

test("static variants are CSP-safe and never depend on blocked inline styles", async () => {
  const [qaSource, cssSource, enhancementSource, rendererSource] = await Promise.all([
    readFile(new URL("../scripts/qa-phase5ar-responsive-routes.mjs", import.meta.url), "utf8"),
    readFile(new URL("../prototypes/phase-5a-r-supporting-routes/shared/system.css", import.meta.url), "utf8"),
    readFile(new URL("../prototypes/phase-5a-r-supporting-routes/shared/enhancement.js", import.meta.url), "utf8"),
    readFile(new URL("../prototypes/phase-5a-r-supporting-routes/render-route.mjs", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(qaSource, /\.style\.setProperty\(/);
  assert.match(cssSource, /html\.qa-text-200\s*\{[\s\S]*?font-size:\s*200%/);
  assert.match(cssSource, /html\.qa-fallback-font/);
  assert.doesNotMatch(enhancementSource, /\.style\.setProperty\(/);
  assert.doesNotMatch(rendererSource, /style="/);
});

test("architecture audit rejects route drift and cross-route template duplication", () => {
  const valid = ROUTE_ORDER.map((route) => ({ route, architecture: ROUTE_QA[route].architecture }));
  assert.deepEqual(validateArchitectureIdentity(valid), []);
  const duplicate = structuredClone(valid);
  duplicate.find(({ route }) => route === "for-startups").architecture = ROUTE_QA["for-industry"].architecture;
  assert.ok(validateArchitectureIdentity(duplicate).some(({ code }) => code === "architecture-duplicate"));
  duplicate.push({ route: "for-startups", architecture: "drifted" });
  assert.ok(validateArchitectureIdentity(duplicate).some(({ code }) => code === "architecture-drift"));
});

test("diagnostic grouping remains compact and all accessibility classes stay explicit", () => {
  assert.deepEqual(CLASS_SCENARIOS, ["text-200", "fallback-font", "reduced-motion", "no-js", "keyboard-desktop", "keyboard-mobile"]);
  const grouped = groupDiagnostics([
    { code: "target-size", route: "404", selector: ".recovery-link", viewport: "landscape-740", message: "small" },
    { code: "target-size", route: "404", selector: ".recovery-link", viewport: "landscape-844", message: "small" },
  ]);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].occurrences, 2);
  assert.deepEqual(grouped[0].viewports, ["landscape-740", "landscape-844"]);
});
