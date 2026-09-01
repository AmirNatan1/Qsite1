export const PHASE7A_R2_PARENT = "016fef45323432f25b3eea849512a707174fe6c5";
export const PHASE7A_R2_REVIEW_ZIP_NAME = "phase-7a-r2-field-map-focus-human-review.zip";
export const PHASE7A_R2_FIELD_MAP_SCHEMA = "quantum-hub.phase-7a-r2.field-map-focus-authority.v1";
export const PHASE7A_R2_AXE_SCHEMA = "quantum-hub.phase-7a-r2.field-map-axe-authority.v1";
export const PHASE7A_R2_TARGET_SCHEMA = "quantum-hub.phase-7a-r2.field-map-target-authority.v1";
export const PHASE7A_R2_BUNDLE_SCHEMA = "quantum-hub.phase-7a-r2.field-map-authority-bundle.v1";
export const PHASE7A_R2_AXE_VERSION = "4.10.3";
export const PHASE7A_R2_SUMMARY_AX_ROLE = "DisclosureTriangle";
export const PHASE7A_R2_MINIMUM_TARGET_CSS_PIXELS = 44;

export const PHASE7A_R2_FIELD_MAP_DESTINATIONS = Object.freeze([
  Object.freeze({ href: "/#entry", name: "00 Home 00 / origin", focusName: "Home" }),
  Object.freeze({ href: "/for-partners/", name: "01 For industry 01 / need", focusName: "For industry" }),
  Object.freeze({ href: "/for-startups/", name: "02 For startups 02 / capability", focusName: "For startups" }),
  Object.freeze({ href: "/industries/", name: "03 Industries 03 / context", focusName: "Industries" }),
  Object.freeze({ href: "/pocs/", name: "04 Proof 04 / evidence", focusName: "Proof" }),
  Object.freeze({ href: "/spark/", name: "05 SPARK 05 / programme", focusName: "SPARK" }),
  Object.freeze({ href: "/about/", name: "06 About 06 / position", focusName: "About" }),
  Object.freeze({ href: "/contact/", name: "07 Contact 07 / signal", focusName: "Contact" }),
]);

export const PHASE7A_R2_AXE_CASES = Object.freeze([
  Object.freeze({ route: "/", state: "reduced-motion-home" }),
  Object.freeze({ route: "/about/", state: "field-map-open" }),
]);

export const PHASE7A_R2_TARGET_STATES = Object.freeze([
  Object.freeze({
    id: "field-map-open-desktop-1440x900",
    route: "/about/",
    state: "field-map-open",
    viewport: Object.freeze({ id: "field-map-open-desktop-1440x900", width: 1440, height: 900 }),
    genuineInstalledChrome: false,
    nativeZoomPercent: null,
  }),
  Object.freeze({
    id: "field-map-open-mobile-390x844",
    route: "/about/",
    state: "field-map-open",
    viewport: Object.freeze({ id: "field-map-open-mobile-390x844", width: 390, height: 844 }),
    genuineInstalledChrome: false,
    nativeZoomPercent: null,
  }),
  Object.freeze({
    id: "field-map-open-installed-chrome-200-percent",
    route: "/#entry",
    state: "field-map-open-native-chrome-200-percent",
    viewport: null,
    genuineInstalledChrome: true,
    nativeZoomPercent: 200,
  }),
]);

const MANUAL_CONTRAST_PAIRS = Object.freeze([
  Object.freeze({ id: "field-map-white-over-max-layered-plane", foreground: "#ffffff", background: "#24141c", threshold: 4.5 }),
  Object.freeze({ id: "field-map-muted-over-max-layered-plane", foreground: "#8a9797", background: "#24141c", threshold: 4.5 }),
  Object.freeze({ id: "manifesto-white-over-live-magenta", foreground: "#ffffff", background: "#d82b72", threshold: 3 }),
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(record, keys, label) {
  invariant(record && typeof record === "object" && !Array.isArray(record), `${label} must be an object`);
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  invariant(JSON.stringify(actual) === JSON.stringify(expected), `${label} field inventory differs`);
}

function assertRootAuthority(report, schema, label) {
  invariant(report && typeof report === "object" && !Array.isArray(report), `${label} is missing`);
  invariant(report.schema === schema, `${label} schema differs`);
  invariant(report.status === "PASS", `${label} must record PASS`);
  invariant(report.parent === PHASE7A_R2_PARENT, `${label} exact parent differs`);
}

function assertTrigger(trigger, { expanded }, label) {
  exactKeys(trigger, ["tag", "ariaControls", "ariaHasPopup", "authoredAriaExpanded", "axRole", "axName", "axExpanded"], label);
  invariant(trigger.tag === "summary", `${label} is not the native summary`);
  invariant(trigger.ariaControls === "field-map-navigation", `${label} aria-controls differs`);
  invariant(trigger.ariaHasPopup === null, `${label} must not assert popup semantics`);
  invariant(trigger.authoredAriaExpanded === null, `${label} must not author aria-expanded over native details semantics`);
  invariant(trigger.axRole === PHASE7A_R2_SUMMARY_AX_ROLE, `${label} accessibility-tree role differs`);
  invariant(trigger.axName === "Field map", `${label} accessibility-tree name differs`);
  invariant(trigger.axExpanded === expanded, `${label} native accessibility-tree expanded state differs`);
}

function assertDestinationInventory(inventory, label, { noJavaScript = false } = {}) {
  invariant(Array.isArray(inventory) && inventory.length === PHASE7A_R2_FIELD_MAP_DESTINATIONS.length, `${label} must contain exactly eight destinations`);
  const hrefs = new Set();
  const names = new Set();
  for (const [index, expected] of PHASE7A_R2_FIELD_MAP_DESTINATIONS.entries()) {
    const record = inventory[index];
    const fields = noJavaScript
      ? ["href", "accessibleName", "visible", "fullyInViewport", "unoccluded"]
      : ["href", "accessibleName", "focusName", "visible", "focusable", "axRole"];
    exactKeys(record, fields, `${label} destination ${index + 1}`);
    invariant(record.href === expected.href, `${label} destination ${index + 1} href differs`);
    invariant(record.accessibleName === expected.name, `${label} destination ${index + 1} accessible name differs`);
    invariant(record.visible === true, `${label} destination ${index + 1} is hidden`);
    if (noJavaScript) {
      invariant(record.fullyInViewport === true, `${label} destination ${index + 1} is outside the viewport`);
      invariant(record.unoccluded === true, `${label} destination ${index + 1} is occluded`);
    } else {
      invariant(record.focusName === expected.focusName, `${label} destination ${index + 1} focus name differs`);
      invariant(record.focusable === true, `${label} destination ${index + 1} is not focusable`);
      invariant(record.axRole === "link", `${label} destination ${index + 1} accessibility-tree role differs`);
    }
    invariant(!hrefs.has(record.href), `${label} destination href is duplicated`);
    invariant(!names.has(record.accessibleName), `${label} destination accessible name is duplicated`);
    hrefs.add(record.href);
    names.add(record.accessibleName);
  }
}

function assertClosedState(state, label, { focusReturn = false } = {}) {
  exactKeys(state, ["open", "rootOpen", "backgroundRegionCount", "inertRegionCount", "ownedInertCount", "activeElement", "trigger"], label);
  invariant(state.open === false && state.rootOpen === false, `${label} does not retain the closed native state`);
  invariant(Number.isInteger(state.backgroundRegionCount) && state.backgroundRegionCount >= 3, `${label} background inventory differs`);
  invariant(state.inertRegionCount === 0 && state.ownedInertCount === 0, `${label} retains stale inert ownership`);
  if (focusReturn) invariant(state.activeElement === "field-map-summary", `${label} did not return focus to the summary`);
  assertTrigger(state.trigger, { expanded: false }, `${label} trigger`);
}

function assertOpenState(state, label) {
  exactKeys(state, ["open", "rootOpen", "backgroundRegionCount", "inertRegionCount", "ownedInertCount", "activeElement", "activeDestinationName", "trigger", "destinations", "focusableInventory"], label);
  invariant(state.open === true && state.rootOpen === true, `${label} is not open`);
  invariant(Number.isInteger(state.backgroundRegionCount) && state.backgroundRegionCount >= 3, `${label} background inventory differs`);
  invariant(state.inertRegionCount === state.backgroundRegionCount && state.ownedInertCount === state.backgroundRegionCount, `${label} inert ownership differs`);
  assertTrigger(state.trigger, { expanded: true }, `${label} trigger`);
  assertDestinationInventory(state.destinations, `${label} destinations`);
  invariant(Array.isArray(state.focusableInventory) && state.focusableInventory.length === 9, `${label} focusable inventory is not exactly the summary and eight links`);
  const expected = [
    { element: "summary", name: "Field map" },
    ...PHASE7A_R2_FIELD_MAP_DESTINATIONS.map(({ focusName }) => ({ element: "a", name: focusName })),
  ];
  invariant(state.focusableInventory.every((record, index) => record?.element === expected[index].element
    && record.name === expected[index].name
    && record.insideFieldMap === true), `${label} focusable inventory order or containment differs`);
}

function focusRecord(element, destinationName) {
  return { activeElement: element, activeDestinationName: destinationName };
}

function assertFocusRecord(record, expected, label, step = null) {
  const fields = step === null ? ["activeElement", "activeDestinationName"] : ["step", "activeElement", "activeDestinationName"];
  exactKeys(record, fields, label);
  if (step !== null) invariant(record.step === step, `${label} step differs`);
  invariant(record.activeElement === expected.activeElement && (record.activeDestinationName ?? null) === expected.activeDestinationName, `${label} focus target differs`);
}

export function validateR2FieldMapFocusAuthority(report) {
  assertRootAuthority(report, PHASE7A_R2_FIELD_MAP_SCHEMA, "R2 Field Map focus authority");
  exactKeys(report, ["schema", "status", "parent", "route", "states", "focus", "repeatedCycles", "engineEvidence", "noJavaScript"], "R2 Field Map focus authority");
  invariant(report.route === "/about/", "R2 Field Map focus route differs");
  assertClosedState(report.states?.closed, "R2 initial state");
  assertOpenState(report.states?.open, "R2 open state");
  invariant(report.states.open.activeElement === "a" && report.states.open.activeDestinationName === "About", "R2 open state did not automatically focus the current About destination");
  assertClosedState(report.states?.escape, "R2 Escape state", { focusReturn: true });

  assertFocusRecord(report.focus?.initial, focusRecord("a", "About"), "R2 automatic-open focus");
  const cycle = [
    focusRecord("a", "About"),
    focusRecord("a", "Contact"),
    focusRecord("field-map-summary", null),
    ...PHASE7A_R2_FIELD_MAP_DESTINATIONS.slice(0, 6).map(({ focusName }) => focusRecord("a", focusName)),
    focusRecord("a", "About"),
  ];
  invariant(Array.isArray(report.focus?.forwardCycle) && report.focus.forwardCycle.length === cycle.length, "R2 forward focus-cycle length differs");
  report.focus.forwardCycle.forEach((record, index) => assertFocusRecord(record, cycle[index], `R2 forward focus-cycle record ${index + 1}`, index + 1));
  assertFocusRecord(report.focus?.reverseFromSummary, focusRecord("a", "Contact"), "R2 reverse wrap");
  assertFocusRecord(report.focus?.outsideRecapture, focusRecord("a", "About"), "R2 outside-focus recapture");
  invariant(report.focus?.postCloseOutsideFocus === "outside-test-control", "R2 containment listener remains active after close");

  invariant(Array.isArray(report.repeatedCycles) && report.repeatedCycles.length === 3, "R2 repeated-cycle inventory differs");
  for (const [index, cycleRecord] of report.repeatedCycles.entries()) {
    exactKeys(cycleRecord, ["cycle", "opened", "closed"], `R2 repeated cycle ${index + 1}`);
    invariant(cycleRecord.cycle === index + 1, `R2 repeated cycle ${index + 1} order differs`);
    assertOpenState(cycleRecord.opened, `R2 repeated cycle ${index + 1} open`);
    invariant(cycleRecord.opened.activeElement === "a" && cycleRecord.opened.activeDestinationName === "About", `R2 repeated cycle ${index + 1} preferred focus differs`);
    assertClosedState(cycleRecord.closed, `R2 repeated cycle ${index + 1} close`, { focusReturn: true });
  }

  const engineClassifications = [
    { engine: "chromium", classification: "installed/headed Google Chrome; Chromium CDP AX-property authority" },
    { engine: "firefox", classification: "headed Firefox automation" },
    { engine: "webkit", classification: "Playwright WebKit proxy; not physical Safari" },
  ];
  invariant(Array.isArray(report.engineEvidence) && report.engineEvidence.length === engineClassifications.length, "R2 cross-engine focus evidence must contain exactly Chromium, Firefox and WebKit");
  const reverseCycle = [
    ...[...PHASE7A_R2_FIELD_MAP_DESTINATIONS].reverse().map(({ focusName }) => focusRecord("a", focusName)),
    focusRecord("field-map-summary", null),
  ];
  for (const [engineIndex, expectedEngine] of engineClassifications.entries()) {
    const record = report.engineEvidence[engineIndex];
    const label = `R2 ${expectedEngine.engine} cross-engine focus evidence`;
    exactKeys(record, ["engine", "classification", "forwardCycle", "reverseCycle", "bodyStops", "escape", "repeatedCycleCount", "repeatedCycleStatus", "duplicateBinding", "status"], label);
    invariant(record.engine === expectedEngine.engine && record.classification === expectedEngine.classification, `${label} engine or classification differs`);
    invariant(record.status === "PASS", `${label} must record PASS`);
    invariant(Array.isArray(record.forwardCycle) && record.forwardCycle.length === cycle.length, `${label} forward cycle length differs`);
    record.forwardCycle.forEach((item, index) => assertFocusRecord(item, cycle[index], `${label} forward record ${index + 1}`, index + 1));
    invariant(Array.isArray(record.reverseCycle) && record.reverseCycle.length === reverseCycle.length, `${label} reverse cycle length differs`);
    record.reverseCycle.forEach((item, index) => assertFocusRecord(item, reverseCycle[index], `${label} reverse record ${index + 1}`, index + 1));
    exactKeys(record.bodyStops, ["forward", "reverse"], `${label} body-stop inventory`);
    invariant(record.bodyStops.forward === 0 && record.bodyStops.reverse === 0, `${label} contains a body focus stop`);
    exactKeys(record.escape, ["activeElement", "open", "rootOpen", "backgroundRegionCount", "inertRegionCount", "ownedInertCount"], `${label} Escape state`);
    invariant(record.escape.activeElement === "field-map-summary" && record.escape.open === false && record.escape.rootOpen === false, `${label} Escape focus return differs`);
    invariant(Number.isInteger(record.escape.backgroundRegionCount) && record.escape.backgroundRegionCount >= 3, `${label} Escape background inventory differs`);
    invariant(record.escape.inertRegionCount === 0 && record.escape.ownedInertCount === 0, `${label} Escape retains stale inert ownership`);
    invariant(record.repeatedCycleCount === 10 && record.repeatedCycleStatus === "PASS", `${label} 10-cycle status differs`);
    exactKeys(record.duplicateBinding, ["cycles", "status"], `${label} duplicate-binding invariant`);
    invariant(record.duplicateBinding.cycles === 10 && record.duplicateBinding.status === "PASS", `${label} duplicate-binding status differs`);
  }

  const noJavaScript = report.noJavaScript;
  exactKeys(noJavaScript, ["controller", "nativeDetailsOpen", "horizontalOverflow", "trigger", "destinations"], "R2 no-JavaScript authority");
  invariant(noJavaScript.controller === null, "R2 no-JavaScript authority unexpectedly has an enhanced controller");
  invariant(noJavaScript.nativeDetailsOpen === true, "R2 no-JavaScript native details did not open");
  invariant(noJavaScript.horizontalOverflow === false, "R2 no-JavaScript Field Map has horizontal overflow");
  assertTrigger(noJavaScript.trigger, { expanded: true }, "R2 no-JavaScript trigger");
  assertDestinationInventory(noJavaScript.destinations, "R2 no-JavaScript destinations", { noJavaScript: true });
  return true;
}

export function validateR2AxeAuthority(report) {
  assertRootAuthority(report, PHASE7A_R2_AXE_SCHEMA, "R2 axe authority");
  exactKeys(report, ["schema", "status", "parent", "axeVersion", "engines", "manualContrast"], "R2 axe authority");
  invariant(report.axeVersion === PHASE7A_R2_AXE_VERSION, "R2 axe version differs");
  invariant(Array.isArray(report.engines) && report.engines.length === 2, "R2 axe engine inventory differs");
  for (const [engineIndex, expectedEngine] of ["chromium", "firefox"].entries()) {
    const engine = report.engines[engineIndex];
    exactKeys(engine, ["engine", "status", "violationCount", "incompleteCount", "cases"], `R2 axe ${expectedEngine}`);
    invariant(engine.engine === expectedEngine, `R2 axe engine order differs: ${expectedEngine}`);
    invariant(engine.status === "PASS", `R2 axe ${expectedEngine} must record PASS`);
    invariant(Array.isArray(engine.cases) && engine.cases.length === PHASE7A_R2_AXE_CASES.length, `R2 axe ${expectedEngine} case inventory differs`);
    let violations = 0;
    let incomplete = 0;
    for (const [caseIndex, expectedCase] of PHASE7A_R2_AXE_CASES.entries()) {
      const record = engine.cases[caseIndex];
      exactKeys(record, ["route", "state", "status", "passes", "violations", "incomplete"], `R2 axe ${expectedEngine} case ${caseIndex + 1}`);
      invariant(record.route === expectedCase.route && record.state === expectedCase.state, `R2 axe ${expectedEngine} case ${caseIndex + 1} identity differs`);
      invariant(record.status === "PASS", `R2 axe ${expectedEngine} case ${caseIndex + 1} must record PASS`);
      invariant(Number.isSafeInteger(record.passes) && record.passes > 0, `R2 axe ${expectedEngine} case ${caseIndex + 1} pass inventory is vacuous`);
      invariant(Array.isArray(record.violations) && Array.isArray(record.incomplete), `R2 axe ${expectedEngine} case ${caseIndex + 1} result arrays are missing`);
      invariant(record.violations.length === 0, `R2 axe ${expectedEngine} case ${caseIndex + 1} contains violations`);
      for (const incompleteResult of record.incomplete) {
        invariant(incompleteResult?.id === "color-contrast" && incompleteResult.impact !== "critical" && Array.isArray(incompleteResult.nodes) && incompleteResult.nodes.length > 0, `R2 axe ${expectedEngine} case ${caseIndex + 1} contains an unsupported incomplete result`);
      }
      violations += record.violations.length;
      incomplete += record.incomplete.length;
    }
    invariant(engine.violationCount === violations && violations === 0, `R2 axe ${expectedEngine} violation summary differs`);
    invariant(engine.incompleteCount === incomplete, `R2 axe ${expectedEngine} incomplete summary differs`);
  }
  const manual = report.manualContrast;
  exactKeys(manual, ["method", "pairs", "status"], "R2 manual contrast authority");
  invariant(typeof manual.method === "string" && manual.method.includes("relative luminance") && manual.method.includes("#24141c"), "R2 manual contrast method differs");
  invariant(manual.status === "PASS", "R2 manual contrast authority must record PASS");
  invariant(Array.isArray(manual.pairs) && manual.pairs.length === MANUAL_CONTRAST_PAIRS.length, "R2 manual contrast pair inventory differs");
  const channel = (pair) => pair.match(/.{2}/g).map((value) => Number.parseInt(value, 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const relativeLuminance = (hex) => {
    const values = channel(hex.slice(1));
    return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
  };
  for (const [index, expected] of MANUAL_CONTRAST_PAIRS.entries()) {
    const pair = manual.pairs[index];
    exactKeys(pair, ["id", "foreground", "background", "threshold", "ratio"], `R2 manual contrast pair ${index + 1}`);
    invariant(pair.id === expected.id && pair.foreground === expected.foreground && pair.background === expected.background && pair.threshold === expected.threshold, `R2 manual contrast pair ${index + 1} identity differs`);
    const luminances = [relativeLuminance(pair.foreground), relativeLuminance(pair.background)].sort((a, b) => b - a);
    const recomputed = (luminances[0] + 0.05) / (luminances[1] + 0.05);
    invariant(Math.abs(pair.ratio - recomputed) <= 0.001 && pair.ratio >= pair.threshold, `R2 manual contrast pair ${index + 1} ratio differs`);
  }
  return true;
}

function targetControls() {
  return [
    { selector: "[data-field-map] > summary", href: null, accessibleName: "Field map", elementType: "summary" },
    ...PHASE7A_R2_FIELD_MAP_DESTINATIONS.map(({ href, name }) => ({ selector: `[data-field-map] a[href="${href}"]`, href, accessibleName: name, elementType: "a" })),
  ];
}

function assertViewport(viewport, expected, label) {
  exactKeys(viewport, ["id", "width", "height"], label);
  invariant(typeof viewport.id === "string" && viewport.id.length > 0, `${label} id differs`);
  invariant(Number.isFinite(viewport.width) && viewport.width > 0 && Number.isFinite(viewport.height) && viewport.height > 0, `${label} dimensions differ`);
  if (expected) invariant(viewport.id === expected.id && viewport.width === expected.width && viewport.height === expected.height, `${label} exact dimensions differ`);
}

export function validateR2TargetAuthority(report) {
  assertRootAuthority(report, PHASE7A_R2_TARGET_SCHEMA, "R2 target authority");
  exactKeys(report, ["schema", "status", "parent", "minimumCssPixels", "states"], "R2 target authority");
  invariant(report.minimumCssPixels === PHASE7A_R2_MINIMUM_TARGET_CSS_PIXELS, "R2 target minimum differs");
  invariant(Array.isArray(report.states) && report.states.length === PHASE7A_R2_TARGET_STATES.length, "R2 target state inventory differs");
  const expectedControls = targetControls();
  for (const [stateIndex, expectedState] of PHASE7A_R2_TARGET_STATES.entries()) {
    const state = report.states[stateIndex];
    exactKeys(state, ["id", "route", "state", "viewport", "genuineInstalledChrome", "nativeZoomPercent", "candidateCount", "controls", "status"], `R2 target state ${stateIndex + 1}`);
    invariant(state.id === expectedState.id && state.route === expectedState.route && state.state === expectedState.state, `R2 target state ${stateIndex + 1} identity differs`);
    invariant(state.genuineInstalledChrome === expectedState.genuineInstalledChrome && state.nativeZoomPercent === expectedState.nativeZoomPercent, `R2 target state ${stateIndex + 1} native zoom authority differs`);
    assertViewport(state.viewport, expectedState.viewport, `R2 target state ${stateIndex + 1} viewport`);
    invariant(state.status === "PASS", `R2 target state ${stateIndex + 1} must record PASS`);
    invariant(state.candidateCount === expectedControls.length, `R2 target state ${stateIndex + 1} candidate count differs`);
    invariant(Array.isArray(state.controls) && state.controls.length === expectedControls.length, `R2 target state ${stateIndex + 1} full control inventory differs`);
    const selectors = new Set();
    for (const [controlIndex, expected] of expectedControls.entries()) {
      const control = state.controls[controlIndex];
      exactKeys(control, ["selector", "href", "accessibleName", "elementType", "width", "height", "visible", "intendedInteractive"], `R2 target state ${stateIndex + 1} control ${controlIndex + 1}`);
      invariant(control.selector === expected.selector && control.href === expected.href && control.accessibleName === expected.accessibleName && control.elementType === expected.elementType, `R2 target state ${stateIndex + 1} control ${controlIndex + 1} identity differs`);
      invariant(!selectors.has(control.selector), `R2 target state ${stateIndex + 1} contains a duplicate selector`);
      selectors.add(control.selector);
      invariant(control.visible === true && control.intendedInteractive === true, `R2 target state ${stateIndex + 1} control ${controlIndex + 1} is not a visible intended target`);
      invariant(Number.isFinite(control.width) && control.width >= report.minimumCssPixels, `R2 target state ${stateIndex + 1} control ${controlIndex + 1} width is below 44 CSS pixels`);
      invariant(Number.isFinite(control.height) && control.height >= report.minimumCssPixels, `R2 target state ${stateIndex + 1} control ${controlIndex + 1} height is below 44 CSS pixels`);
    }
  }
  return true;
}

export function validatePhase7aR2FieldMapAuthority(bundle) {
  assertRootAuthority(bundle, PHASE7A_R2_BUNDLE_SCHEMA, "R2 Field Map authority bundle");
  exactKeys(bundle, ["schema", "status", "parent", "reviewZipName", "focus", "axe", "targets"], "R2 Field Map authority bundle");
  invariant(bundle.reviewZipName === PHASE7A_R2_REVIEW_ZIP_NAME, "R2 review ZIP name differs");
  validateR2FieldMapFocusAuthority(bundle.focus);
  validateR2AxeAuthority(bundle.axe);
  validateR2TargetAuthority(bundle.targets);
  return true;
}
