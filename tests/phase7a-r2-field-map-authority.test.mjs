import assert from "node:assert/strict";
import test from "node:test";

import {
  PHASE7A_R2_AXE_CASES,
  PHASE7A_R2_AXE_SCHEMA,
  PHASE7A_R2_AXE_VERSION,
  PHASE7A_R2_BUNDLE_SCHEMA,
  PHASE7A_R2_FIELD_MAP_DESTINATIONS,
  PHASE7A_R2_FIELD_MAP_SCHEMA,
  PHASE7A_R2_MINIMUM_TARGET_CSS_PIXELS,
  PHASE7A_R2_PARENT,
  PHASE7A_R2_REVIEW_ZIP_NAME,
  PHASE7A_R2_SUMMARY_AX_ROLE,
  PHASE7A_R2_TARGET_SCHEMA,
  PHASE7A_R2_TARGET_STATES,
  validatePhase7aR2FieldMapAuthority,
  validateR2AxeAuthority,
  validateR2FieldMapFocusAuthority,
  validateR2TargetAuthority,
} from "../scripts/phase7a-r2-field-map-authority.mjs";

const trigger = (expanded) => ({
  tag: "summary",
  ariaControls: "field-map-navigation",
  ariaHasPopup: null,
  authoredAriaExpanded: null,
  axRole: PHASE7A_R2_SUMMARY_AX_ROLE,
  axName: "Field map",
  axExpanded: expanded,
});

const destinations = () => PHASE7A_R2_FIELD_MAP_DESTINATIONS.map(({ href, name, focusName }) => ({
  href,
  accessibleName: name,
  focusName,
  visible: true,
  focusable: true,
  axRole: "link",
}));

const noJavaScriptDestinations = () => PHASE7A_R2_FIELD_MAP_DESTINATIONS.map(({ href, name }) => ({
  href,
  accessibleName: name,
  visible: true,
  fullyInViewport: true,
  unoccluded: true,
}));

function closedState(activeElement = "body") {
  return {
    open: false,
    rootOpen: false,
    backgroundRegionCount: 3,
    inertRegionCount: 0,
    ownedInertCount: 0,
    activeElement,
    trigger: trigger(false),
  };
}

function openState() {
  return {
    open: true,
    rootOpen: true,
    backgroundRegionCount: 3,
    inertRegionCount: 3,
    ownedInertCount: 3,
    activeElement: "a",
    activeDestinationName: "About",
    trigger: trigger(true),
    destinations: destinations(),
    focusableInventory: [
      { element: "summary", name: "Field map", insideFieldMap: true },
      ...PHASE7A_R2_FIELD_MAP_DESTINATIONS.map(({ focusName }) => ({ element: "a", name: focusName, insideFieldMap: true })),
    ],
  };
}

const focus = (activeElement, activeDestinationName) => ({ activeElement, activeDestinationName });

function engineEvidence(forwardCycle) {
  const reverseCycle = [
    ...[...PHASE7A_R2_FIELD_MAP_DESTINATIONS].reverse().map(({ focusName }) => focus("a", focusName)),
    focus("field-map-summary", null),
  ].map((record, index) => ({ step: index + 1, ...record }));
  const engines = [
    ["chromium", "installed/headed Google Chrome; Chromium CDP AX-property authority"],
    ["firefox", "headed Firefox automation"],
    ["webkit", "Playwright WebKit proxy; not physical Safari"],
  ];
  return engines.map(([engine, classification]) => ({
    engine,
    classification,
    forwardCycle: structuredClone(forwardCycle),
    reverseCycle: structuredClone(reverseCycle),
    bodyStops: { forward: 0, reverse: 0 },
    escape: { activeElement: "field-map-summary", open: false, rootOpen: false, backgroundRegionCount: 3, inertRegionCount: 0, ownedInertCount: 0 },
    repeatedCycleCount: 10,
    repeatedCycleStatus: "PASS",
    duplicateBinding: { cycles: 10, status: "PASS" },
    status: "PASS",
  }));
}

function focusReport() {
  const forwardCycle = [
    focus("a", "About"),
    focus("a", "Contact"),
    focus("field-map-summary", null),
    ...PHASE7A_R2_FIELD_MAP_DESTINATIONS.slice(0, 6).map(({ focusName }) => focus("a", focusName)),
    focus("a", "About"),
  ].map((record, index) => ({ step: index + 1, ...record }));
  return {
    schema: PHASE7A_R2_FIELD_MAP_SCHEMA,
    status: "PASS",
    parent: PHASE7A_R2_PARENT,
    route: "/about/",
    states: { closed: closedState(), open: openState(), escape: closedState("field-map-summary") },
    focus: {
      initial: focus("a", "About"),
      forwardCycle,
      reverseFromSummary: focus("a", "Contact"),
      outsideRecapture: focus("a", "About"),
      postCloseOutsideFocus: "outside-test-control",
    },
    repeatedCycles: Array.from({ length: 3 }, (_, index) => ({ cycle: index + 1, opened: openState(), closed: closedState("field-map-summary") })),
    engineEvidence: engineEvidence(forwardCycle),
    noJavaScript: {
      controller: null,
      nativeDetailsOpen: true,
      horizontalOverflow: false,
      trigger: trigger(true),
      destinations: noJavaScriptDestinations(),
    },
  };
}

function axeReport() {
  return {
    schema: PHASE7A_R2_AXE_SCHEMA,
    status: "PASS",
    parent: PHASE7A_R2_PARENT,
    axeVersion: PHASE7A_R2_AXE_VERSION,
    engines: ["chromium", "firefox"].map((engine) => ({
      engine,
      status: "PASS",
      violationCount: 0,
      incompleteCount: 0,
      cases: PHASE7A_R2_AXE_CASES.map(({ route, state }, index) => ({ route, state, status: "PASS", passes: 30 + index, violations: [], incomplete: [] })),
    })),
    manualContrast: {
      method: "WCAG 2.x relative luminance; worst authored solid/composited CSS colors, with radial and active-link overlays conservatively combined to #24141c",
      pairs: [
        { id: "field-map-white-over-max-layered-plane", foreground: "#ffffff", background: "#24141c", threshold: 4.5, ratio: 17.62 },
        { id: "field-map-muted-over-max-layered-plane", foreground: "#8a9797", background: "#24141c", threshold: 4.5, ratio: 5.835 },
        { id: "manifesto-white-over-live-magenta", foreground: "#ffffff", background: "#d82b72", threshold: 3, ratio: 4.658 },
      ],
      status: "PASS",
    },
  };
}

function controls() {
  return [
    { selector: "[data-field-map] > summary", href: null, accessibleName: "Field map", elementType: "summary", width: 152, height: 44, visible: true, intendedInteractive: true },
    ...PHASE7A_R2_FIELD_MAP_DESTINATIONS.map(({ href, name }, index) => ({
      selector: `[data-field-map] a[href="${href}"]`,
      href,
      accessibleName: name,
      elementType: "a",
      width: 180 + index,
      height: 44,
      visible: true,
      intendedInteractive: true,
    })),
  ];
}

function targetReport() {
  return {
    schema: PHASE7A_R2_TARGET_SCHEMA,
    status: "PASS",
    parent: PHASE7A_R2_PARENT,
    minimumCssPixels: PHASE7A_R2_MINIMUM_TARGET_CSS_PIXELS,
    states: PHASE7A_R2_TARGET_STATES.map((state) => ({
      id: state.id,
      route: state.route,
      state: state.state,
      viewport: state.viewport ? { ...state.viewport } : { id: "installed-chrome-native-200", width: 519, height: 399 },
      genuineInstalledChrome: state.genuineInstalledChrome,
      nativeZoomPercent: state.nativeZoomPercent,
      candidateCount: 9,
      controls: controls(),
      status: "PASS",
    })),
  };
}

function bundle() {
  return {
    schema: PHASE7A_R2_BUNDLE_SCHEMA,
    status: "PASS",
    parent: PHASE7A_R2_PARENT,
    reviewZipName: PHASE7A_R2_REVIEW_ZIP_NAME,
    focus: focusReport(),
    axe: axeReport(),
    targets: targetReport(),
  };
}

function mutated(value, change) {
  const result = structuredClone(value);
  change(result);
  return result;
}

test("R2 Field Map authority freezes exact parent, package name and a complete passing bundle", () => {
  assert.equal(PHASE7A_R2_PARENT, "016fef45323432f25b3eea849512a707174fe6c5");
  assert.equal(PHASE7A_R2_REVIEW_ZIP_NAME, "phase-7a-r2-field-map-focus-human-review.zip");
  assert.equal(validateR2FieldMapFocusAuthority(focusReport()), true);
  assert.equal(validateR2AxeAuthority(axeReport()), true);
  assert.equal(validateR2TargetAuthority(targetReport()), true);
  assert.equal(validatePhase7aR2FieldMapAuthority(bundle()), true);
});

test("R2 focus authority rejects popup/authored-expanded lies and accessibility-tree drift", () => {
  const mutations = [
    [(report) => { report.states.open.trigger.ariaHasPopup = "true"; }, /popup semantics/],
    [(report) => { report.states.open.trigger.authoredAriaExpanded = "true"; }, /must not author aria-expanded/],
    [(report) => { report.states.open.trigger.axExpanded = false; }, /expanded state differs/],
    [(report) => { report.states.open.trigger.axRole = "button"; }, /role differs/],
    [(report) => { report.states.open.trigger.axName = "Open navigation"; }, /name differs/],
    [(report) => { report.noJavaScript.trigger.authoredAriaExpanded = "true"; }, /must not author aria-expanded/],
    [(report) => { report.noJavaScript.controller = "ready"; }, /enhanced controller/],
  ];
  for (const [change, expected] of mutations) assert.throws(() => validateR2FieldMapFocusAuthority(mutated(focusReport(), change)), expected);
});

test("R2 focus authority rejects destination, focus-cycle, containment and lifecycle tampering", () => {
  const mutations = [
    [(report) => { report.states.open.destinations.pop(); }, /exactly eight/],
    [(report) => { report.states.open.destinations[1].href = "/wrong/"; }, /href differs/],
    [(report) => { report.states.open.destinations[2].accessibleName = report.states.open.destinations[1].accessibleName; }, /accessible name differs|duplicated/],
    [(report) => { report.states.open.destinations[3].focusable = false; }, /not focusable/],
    [(report) => { report.states.open.focusableInventory[0].insideFieldMap = false; }, /containment differs/],
    [(report) => { report.states.open.activeDestinationName = "Home"; }, /automatically focus/],
    [(report) => { report.focus.forwardCycle[1].activeDestinationName = "Home"; }, /focus target differs/],
    [(report) => { report.focus.forwardCycle[2].step = 2; }, /step differs/],
    [(report) => { report.focus.reverseFromSummary.activeDestinationName = "About"; }, /focus target differs/],
    [(report) => { report.focus.outsideRecapture.activeElement = "outside-test-control"; }, /focus target differs/],
    [(report) => { report.focus.postCloseOutsideFocus = "a"; }, /remains active after close/],
    [(report) => { report.states.escape.ownedInertCount = 1; }, /stale inert/],
    [(report) => { report.repeatedCycles.pop(); }, /repeated-cycle inventory/],
    [(report) => { report.repeatedCycles[1].closed.activeElement = "body"; }, /return focus/],
    [(report) => { report.engineEvidence.pop(); }, /exactly Chromium, Firefox and WebKit/],
    [(report) => { report.engineEvidence[2].classification = "Safari"; }, /classification differs/],
    [(report) => { report.engineEvidence[1].reverseCycle[0].activeDestinationName = "About"; }, /focus target differs/],
    [(report) => { report.engineEvidence[0].bodyStops.forward = 1; }, /body focus stop/],
    [(report) => { report.engineEvidence[2].escape.ownedInertCount = 1; }, /stale inert/],
    [(report) => { report.engineEvidence[1].repeatedCycleCount = 9; }, /10-cycle status differs/],
    [(report) => { report.engineEvidence[0].duplicateBinding.status = "FAIL"; }, /duplicate-binding status differs/],
    [(report) => { report.noJavaScript.destinations[5].unoccluded = false; }, /occluded/],
  ];
  for (const [change, expected] of mutations) assert.throws(() => validateR2FieldMapFocusAuthority(mutated(focusReport(), change)), expected);
});

test("R2 axe authority rejects missing cases, reordered engines and false clean summaries", () => {
  const mutations = [
    [(report) => { report.axeVersion = "4.10.2"; }, /version differs/],
    [(report) => { report.engines.reverse(); }, /engine order differs/],
    [(report) => { report.engines[0].cases.pop(); }, /case inventory differs/],
    [(report) => { report.engines[0].cases[0].route = "/contact/"; }, /identity differs/],
    [(report) => { report.engines[0].cases[0].passes = 0; }, /vacuous/],
    [(report) => { report.engines[0].cases[0].violations.push({ id: "aria-allowed-attr" }); }, /contains violations/],
    [(report) => { report.engines[1].cases[1].incomplete.push({ id: "aria-valid-attr-value", impact: "critical", nodes: [{}] }); }, /unsupported incomplete/],
    [(report) => { report.engines[0].violationCount = 1; }, /violation summary differs/],
    [(report) => { report.engines[1].incompleteCount = 1; }, /incomplete summary differs/],
    [(report) => { report.manualContrast.pairs[1].ratio = 4.4; }, /ratio differs/],
    [(report) => { report.manualContrast.method = "automated"; }, /method differs/],
  ];
  for (const [change, expected] of mutations) assert.throws(() => validateR2AxeAuthority(mutated(axeReport(), change)), expected);
});

test("R2 target authority rejects vacuous, sub-44, substituted and reordered inventories", () => {
  const mutations = [
    [(report) => { report.minimumCssPixels = 43; }, /minimum differs/],
    [(report) => { report.states.pop(); }, /state inventory differs/],
    [(report) => { report.states.reverse(); }, /identity differs/],
    [(report) => { report.states[0].candidateCount = 8; }, /candidate count differs/],
    [(report) => { report.states[0].controls.pop(); }, /full control inventory differs/],
    [(report) => { report.states[0].controls[0].height = 43.99; }, /height is below 44/],
    [(report) => { report.states[1].controls[2].width = 0; }, /width is below 44/],
    [(report) => { report.states[0].controls[1].selector = report.states[0].controls[0].selector; }, /identity differs|duplicate selector/],
    [(report) => { report.states[0].controls[3].accessibleName = "Wrong"; }, /identity differs/],
    [(report) => { report.states[1].viewport.width = 391; }, /exact dimensions differ/],
    [(report) => { report.states[2].genuineInstalledChrome = false; }, /native zoom authority differs/],
    [(report) => { report.states[2].nativeZoomPercent = 175; }, /native zoom authority differs/],
    [(report) => { report.states[2].status = "FAIL"; }, /must record PASS/],
  ];
  for (const [change, expected] of mutations) assert.throws(() => validateR2TargetAuthority(mutated(targetReport(), change)), expected);
});

test("R2 bundle rejects cross-authority parent, ZIP and unexpected-field tampering", () => {
  const mutations = [
    [(report) => { report.parent = "a".repeat(40); }, /exact parent differs/],
    [(report) => { report.reviewZipName = "phase-7a-r2-review.zip"; }, /ZIP name differs/],
    [(report) => { report.focus.parent = "a".repeat(40); }, /exact parent differs/],
    [(report) => { report.axe.status = "FAIL"; }, /must record PASS/],
    [(report) => { report.targets.unexpected = true; }, /field inventory differs/],
    [(report) => { report.unexpected = true; }, /field inventory differs/],
  ];
  for (const [change, expected] of mutations) assert.throws(() => validatePhase7aR2FieldMapAuthority(mutated(bundle(), change)), expected);
});
