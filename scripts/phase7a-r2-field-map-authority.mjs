export const PHASE7A_R2_PARENT = "016fef45323432f25b3eea849512a707174fe6c5";
export const PHASE7A_R2_REVIEW_ZIP_NAME = "phase-7a-r2-field-map-focus-human-review.zip";
export const PHASE7A_R2_FIELD_MAP_SCHEMA = "quantum-hub.phase-7a-r2.field-map-focus-authority.v1";
export const PHASE7A_R2_AXE_SCHEMA = "quantum-hub.phase-7a-r2.field-map-axe-authority.v1";
export const PHASE7A_R2_TARGET_SCHEMA = "quantum-hub.phase-7a-r2.field-map-target-authority.v1";
export const PHASE7A_R2_BUNDLE_SCHEMA = "quantum-hub.phase-7a-r2.field-map-authority-bundle.v1";
export const PHASE7A_R2_AXE_VERSION = "4.10.3";
export const PHASE7A_R2_SUMMARY_AX_ROLE = "DisclosureTriangle";
export const PHASE7A_R2_SUMMARY_AX_NAME = "FIELD MAP";
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

const contrastSelector = (id, selector, foreground, threshold = 4.5) => Object.freeze({ id, selector, foreground, threshold });

const MANUAL_CONTRAST_PAIRS = Object.freeze([
  Object.freeze({ id: "closed-header-white-over-authored-upper-bound", foreground: "#ffffff", background: "#242424", threshold: 4.5 }),
  Object.freeze({ id: "closed-header-muted-over-authored-upper-bound", foreground: "#8a9797", background: "#242424", threshold: 4.5 }),
  Object.freeze({ id: "manifesto-white-over-live-magenta", foreground: "#ffffff", background: "#d82b72", threshold: 3 }),
]);

const HOME_CONTRAST_SELECTORS = Object.freeze([
  contrastSelector("bifurcation-coordinate", ".field-map-threshold__coordinate", "rgb(138,151,151)"),
  contrastSelector("bifurcation-heading-one", "#field-map-threshold-title > span:nth-child(1)", "rgba(244,247,246,0.94)"),
  contrastSelector("bifurcation-heading-two", "#field-map-threshold-title > span:nth-child(2)", "rgba(244,247,246,0.94)"),
  contrastSelector("bifurcation-industry-label", ".bifurcation-destination--industry > .bifurcation-destination__label", "rgb(255,255,255)"),
  contrastSelector("bifurcation-industry-copy", ".bifurcation-destination--industry > .bifurcation-destination__copy", "rgb(138,151,151)"),
  contrastSelector("bifurcation-startup-label", ".bifurcation-destination--startup > .bifurcation-destination__label", "rgb(255,255,255)"),
  contrastSelector("bifurcation-startup-copy", ".bifurcation-destination--startup > .bifurcation-destination__copy", "rgb(138,151,151)"),
  contrastSelector("bifurcation-instruction", ".field-map-threshold__instruction", "rgb(138,151,151)"),
]);

const OPEN_FIELD_MAP_CONTRAST_SELECTORS = Object.freeze([
  contrastSelector("open-field-map-trigger-label", ".field-map__trigger-label", "rgb(255,255,255)"),
  contrastSelector("open-field-map-trigger-state", ".field-map__trigger-state", "rgb(138,151,151)"),
  contrastSelector("open-field-map-heading-one", ".field-map__heading > p:nth-child(1)", "rgb(138,151,151)"),
  contrastSelector("open-field-map-heading-two", ".field-map__heading > p:nth-child(2)", "rgb(138,151,151)"),
  contrastSelector("open-home-index", "a[aria-label=\"00 Home 00 / origin\"] > span:nth-child(1)", "rgb(138,151,151)"),
  contrastSelector("open-home-label", "a[aria-label=\"00 Home 00 / origin\"] > strong", "rgb(255,255,255)"),
  contrastSelector("open-home-coordinate", "a[aria-label=\"00 Home 00 / origin\"] > span:nth-child(3)", "rgb(138,151,151)"),
  contrastSelector("open-industry-index", "a[aria-label=\"01 For industry 01 / need\"] > span:nth-child(1)", "rgb(138,151,151)"),
  contrastSelector("open-industry-label", "a[aria-label=\"01 For industry 01 / need\"] > strong", "rgb(255,255,255)"),
  contrastSelector("open-industry-coordinate", "a[aria-label=\"01 For industry 01 / need\"] > span:nth-child(3)", "rgb(138,151,151)"),
  contrastSelector("open-startups-index", ".field-map-destination[href$=\"for-startups/\"] > span:nth-child(1)", "rgb(138,151,151)"),
  contrastSelector("open-startups-label", ".field-map-destination[href$=\"for-startups/\"] > strong", "rgb(255,255,255)"),
  contrastSelector("open-startups-coordinate", ".field-map-destination[href$=\"for-startups/\"] > span:nth-child(3)", "rgb(138,151,151)"),
  contrastSelector("open-industries-index", "a[href$=\"industries/\"] > span:nth-child(1)", "rgb(138,151,151)"),
  contrastSelector("open-industries-label", "a[href$=\"industries/\"] > strong", "rgb(255,255,255)"),
  contrastSelector("open-industries-coordinate", "a[href$=\"industries/\"] > span:nth-child(3)", "rgb(138,151,151)"),
  contrastSelector("open-proof-index", "a[href$=\"pocs/\"] > span:nth-child(1)", "rgb(138,151,151)"),
  contrastSelector("open-proof-label", "a[href$=\"pocs/\"] > strong", "rgb(255,255,255)"),
  contrastSelector("open-proof-coordinate", "a[href$=\"pocs/\"] > span:nth-child(3)", "rgb(138,151,151)"),
  contrastSelector("open-spark-index", "a[href$=\"spark/\"] > span:nth-child(1)", "rgb(138,151,151)"),
  contrastSelector("open-spark-label", "a[href$=\"spark/\"] > strong", "rgb(255,255,255)"),
  contrastSelector("open-spark-coordinate", "a[href$=\"spark/\"] > span:nth-child(3)", "rgb(138,151,151)"),
  contrastSelector("open-about-index", "a[href$=\"about/\"] > span:nth-child(1)", "rgb(138,151,151)"),
  contrastSelector("open-about-label", "a[href$=\"about/\"] > strong", "rgb(255,255,255)"),
  contrastSelector("open-about-coordinate", "a[href$=\"about/\"] > span:nth-child(3)", "rgb(138,151,151)"),
  contrastSelector("open-contact-index", "a[aria-label=\"07 Contact 07 / signal\"] > span:nth-child(1)", "rgb(138,151,151)"),
  contrastSelector("open-contact-label", "a[aria-label=\"07 Contact 07 / signal\"] > strong", "rgb(255,255,255)"),
  contrastSelector("open-contact-coordinate", "a[aria-label=\"07 Contact 07 / signal\"] > span:nth-child(3)", "rgb(138,151,151)"),
  contrastSelector("open-field-map-legend", ".field-map__legend", "rgb(138,151,151)"),
]);

export const PHASE7A_R2_LOCAL_CONTRAST_CASES = Object.freeze([
  Object.freeze({ id: "bifurcation", route: "/", state: "reduced-motion-home", selectors: HOME_CONTRAST_SELECTORS }),
  Object.freeze({ id: "field-map-open", route: "/about/", state: "field-map-open", selectors: OPEN_FIELD_MAP_CONTRAST_SELECTORS }),
]);

export const PHASE7A_R2_LOCAL_CONTRAST_SELECTORS = Object.freeze(PHASE7A_R2_LOCAL_CONTRAST_CASES.flatMap(({ selectors }) => selectors));

const LOCAL_CONTRAST_BY_STATE_AND_SELECTOR = new Map(PHASE7A_R2_LOCAL_CONTRAST_CASES.flatMap(({ state, selectors }) => selectors.map((record) => [`${state}\u0000${record.selector}`, record])));
const FIXED_CONTRAST_IDS = new Set(MANUAL_CONTRAST_PAIRS.map(({ id }) => id));
const HASH64 = /^[a-f0-9]{64}$/;

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
  invariant(trigger.axName === PHASE7A_R2_SUMMARY_AX_NAME, `${label} accessibility-tree name differs`);
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

function expectedContrastBinding(state, target) {
  const local = LOCAL_CONTRAST_BY_STATE_AND_SELECTOR.get(`${state}\u0000${target}`);
  if (local) return { authorityKind: "selector-local", authorityId: local.id };
  if (state !== "reduced-motion-home") return null;
  if (target === ".brand-link > span" || target === ".field-map__trigger-label") {
    return { authorityKind: "fixed-pair", authorityId: "closed-header-white-over-authored-upper-bound" };
  }
  if (target === ".field-map__trigger-state") {
    return { authorityKind: "fixed-pair", authorityId: "closed-header-muted-over-authored-upper-bound" };
  }
  const manifestoTarget = /^(?:\.manifesto-line--(?:one|two|three)\s*>\s*\.manifesto-word(?::nth-child\([123]\))?|\.manifesto-word(?:--contact|:nth-child\(3\)))$/;
  return manifestoTarget.test(target) ? { authorityKind: "fixed-pair", authorityId: "manifesto-white-over-live-magenta" } : null;
}

function parseCssColor(value, label) {
  const match = /^(?:rgb|rgba)\((\d+),(\d+),(\d+)(?:,([\d.]+))?\)$/.exec(value ?? "");
  invariant(match, `${label} CSS color differs`);
  const channels = match.slice(1, 4).map(Number);
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  invariant(channels.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255) && Number.isFinite(alpha) && alpha >= 0 && alpha <= 1, `${label} CSS color channels differ`);
  return { channels, alpha };
}

function parseHexColor(value, label) {
  invariant(/^#[a-f0-9]{6}$/.test(value ?? ""), `${label} hex color differs`);
  return value.slice(1).match(/.{2}/g).map((channel) => Number.parseInt(channel, 16));
}

function hexColor(channels) {
  return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function channelLuminance(value) {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function rgbLuminance(channels) {
  return 0.2126 * channelLuminance(channels[0]) + 0.7152 * channelLuminance(channels[1]) + 0.0722 * channelLuminance(channels[2]);
}

function contrastRatio(first, second) {
  const luminances = [rgbLuminance(first), rgbLuminance(second)].sort((a, b) => b - a);
  return (luminances[0] + 0.05) / (luminances[1] + 0.05);
}

function compositedForeground(foreground, background) {
  return foreground.channels.map((channel, index) => Math.round(channel * foreground.alpha + background[index] * (1 - foreground.alpha)));
}

export function validateR2AxeAuthority(report) {
  assertRootAuthority(report, PHASE7A_R2_AXE_SCHEMA, "R2 axe authority");
  exactKeys(report, ["schema", "status", "parent", "axeVersion", "engines", "manualContrast"], "R2 axe authority");
  invariant(report.axeVersion === PHASE7A_R2_AXE_VERSION, "R2 axe version differs");
  invariant(Array.isArray(report.engines) && report.engines.length === 2, "R2 axe engine inventory differs");
  const incompleteNodes = [];
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
        for (const node of incompleteResult.nodes) {
          invariant(Array.isArray(node?.target) && node.target.length === 1 && typeof node.target[0] === "string" && node.target[0].length > 0, `R2 axe ${expectedEngine} case ${caseIndex + 1} incomplete target differs`);
          incompleteNodes.push({ engine: expectedEngine, route: record.route, state: record.state, target: node.target });
        }
      }
      violations += record.violations.length;
      incomplete += record.incomplete.length;
    }
    invariant(engine.violationCount === violations && violations === 0, `R2 axe ${expectedEngine} violation summary differs`);
    invariant(engine.incompleteCount === incomplete, `R2 axe ${expectedEngine} incomplete summary differs`);
  }
  const manual = report.manualContrast;
  exactKeys(manual, ["method", "pairs", "selectorMeasurements", "bindings", "status"], "R2 manual contrast authority");
  invariant(manual.method === "WCAG 2.x relative luminance; the closed header uses a channel-wise #242424 upper bound derived from rgba(8,11,12,0.9) over any clipped backdrop; the manifesto uses its authored live-magenta pair; every incomplete over complex home or open-Field-Map material is bound one-to-one to an engine-local masked screenshot using temporary color:transparent and -webkit-text-fill-color:transparent while preserving layout, element backgrounds and pseudo-elements", "R2 manual contrast method differs");
  invariant(manual.status === "PASS", "R2 manual contrast authority must record PASS");
  invariant(Array.isArray(manual.pairs) && manual.pairs.length === MANUAL_CONTRAST_PAIRS.length, "R2 manual contrast pair inventory differs");
  for (const [index, expected] of MANUAL_CONTRAST_PAIRS.entries()) {
    const pair = manual.pairs[index];
    exactKeys(pair, ["id", "foreground", "background", "threshold", "ratio"], `R2 manual contrast pair ${index + 1}`);
    invariant(pair.id === expected.id && pair.foreground === expected.foreground && pair.background === expected.background && pair.threshold === expected.threshold, `R2 manual contrast pair ${index + 1} identity differs`);
    const recomputed = contrastRatio(parseHexColor(pair.foreground, `R2 manual contrast pair ${index + 1} foreground`), parseHexColor(pair.background, `R2 manual contrast pair ${index + 1} background`));
    invariant(Math.abs(pair.ratio - recomputed) <= 0.001 && pair.ratio >= pair.threshold, `R2 manual contrast pair ${index + 1} ratio differs`);
  }

  const expectedMeasurements = ["chromium", "firefox"].flatMap((engine) => PHASE7A_R2_LOCAL_CONTRAST_CASES.map((contrastCase) => ({ engine, contrastCase })));
  invariant(Array.isArray(manual.selectorMeasurements) && manual.selectorMeasurements.length === expectedMeasurements.length, "R2 selector-local contrast measurement inventory differs");
  const measurementByEngineState = new Map();
  for (const [measurementIndex, expectedMeasurement] of expectedMeasurements.entries()) {
    const { engine: expectedEngine, contrastCase } = expectedMeasurement;
    const measurement = manual.selectorMeasurements[measurementIndex];
    const label = `R2 ${expectedEngine} ${contrastCase.state} selector-local contrast measurement`;
    exactKeys(measurement, ["engine", "route", "state", "viewport", "maskingMethod", "screenshot", "samples", "status"], label);
    invariant(measurement.engine === expectedEngine && measurement.route === contrastCase.route && measurement.state === contrastCase.state && measurement.status === "PASS", `${label} identity or status differs`);
    invariant(measurement.maskingMethod === "temporary color:transparent and -webkit-text-fill-color:transparent on every exact selector-local axe-incomplete text selector; layout, element backgrounds and pseudo-elements preserved; screenshot pixels sampled beneath original element bounding boxes", `${label} masking method differs`);
    exactKeys(measurement.viewport, ["width", "height", "deviceScaleFactor"], `${label} viewport`);
    invariant(measurement.viewport.width === 1440 && measurement.viewport.height === 900 && measurement.viewport.deviceScaleFactor === 1, `${label} viewport differs`);
    exactKeys(measurement.screenshot, ["path", "bytes", "sha256", "width", "height"], `${label} screenshot`);
    invariant(measurement.screenshot.path === `screenshots/${expectedEngine}-${contrastCase.id}-background-mask.png`
      && Number.isSafeInteger(measurement.screenshot.bytes) && measurement.screenshot.bytes > 0
      && HASH64.test(measurement.screenshot.sha256 ?? "")
      && measurement.screenshot.width === 1440 && measurement.screenshot.height === 900, `${label} screenshot authority differs`);
    invariant(Array.isArray(measurement.samples) && measurement.samples.length === contrastCase.selectors.length, `${label} sample inventory differs`);
    const samples = new Map();
    for (const [sampleIndex, expected] of contrastCase.selectors.entries()) {
      const sample = measurement.samples[sampleIndex];
      const sampleLabel = `${label} sample ${sampleIndex + 1}`;
      exactKeys(sample, ["id", "selector", "foreground", "threshold", "rect", "pixelBounds", "sampledPixelCount", "worstBackground", "compositedForeground", "minimumRatio", "status"], sampleLabel);
      invariant(sample.id === expected.id && sample.selector === expected.selector && sample.foreground === expected.foreground && sample.threshold === expected.threshold && sample.status === "PASS", `${sampleLabel} identity or status differs`);
      exactKeys(sample.rect, ["x", "y", "width", "height"], `${sampleLabel} rectangle`);
      invariant(Object.values(sample.rect).every(Number.isFinite) && sample.rect.width > 0 && sample.rect.height > 0
        && sample.rect.x >= 0 && sample.rect.y >= 0
        && sample.rect.x + sample.rect.width <= measurement.viewport.width + 0.01
        && sample.rect.y + sample.rect.height <= measurement.viewport.height + 0.01, `${sampleLabel} rectangle differs`);
      exactKeys(sample.pixelBounds, ["x0", "y0", "x1", "y1"], `${sampleLabel} pixel bounds`);
      const expectedBounds = {
        x0: Math.floor(sample.rect.x),
        y0: Math.floor(sample.rect.y),
        x1: Math.ceil(sample.rect.x + sample.rect.width),
        y1: Math.ceil(sample.rect.y + sample.rect.height),
      };
      invariant(Object.entries(expectedBounds).every(([key, value]) => sample.pixelBounds[key] === value), `${sampleLabel} pixel bounds differ`);
      invariant(sample.sampledPixelCount === (expectedBounds.x1 - expectedBounds.x0) * (expectedBounds.y1 - expectedBounds.y0) && sample.sampledPixelCount > 0, `${sampleLabel} sampled pixel count differs`);
      const foreground = parseCssColor(sample.foreground, `${sampleLabel} foreground`);
      const background = parseHexColor(sample.worstBackground, `${sampleLabel} worst background`);
      const composite = compositedForeground(foreground, background);
      invariant(sample.compositedForeground === hexColor(composite), `${sampleLabel} foreground composite differs`);
      const recomputed = contrastRatio(composite, background);
      invariant(Number.isFinite(sample.minimumRatio) && Math.abs(sample.minimumRatio - recomputed) <= 0.001 && sample.minimumRatio >= sample.threshold, `${sampleLabel} minimum ratio differs`);
      invariant(!samples.has(sample.id), `${sampleLabel} is duplicated`);
      samples.set(sample.id, sample);
    }
    measurementByEngineState.set(`${expectedEngine}\u0000${contrastCase.state}`, samples);
  }

  invariant(Array.isArray(manual.bindings) && manual.bindings.length === incompleteNodes.length && manual.bindings.length > 0, "R2 contrast binding inventory differs");
  for (const [index, expectedNode] of incompleteNodes.entries()) {
    const binding = manual.bindings[index];
    const label = `R2 contrast binding ${index + 1}`;
    exactKeys(binding, ["engine", "route", "state", "target", "authorityKind", "authorityId"], label);
    invariant(binding.engine === expectedNode.engine && binding.route === expectedNode.route && binding.state === expectedNode.state && JSON.stringify(binding.target) === JSON.stringify(expectedNode.target), `${label} does not bind the corresponding axe node`);
    const expected = expectedContrastBinding(binding.state, binding.target[0]);
    invariant(expected && binding.authorityKind === expected.authorityKind && binding.authorityId === expected.authorityId, `${label} authority differs or target is not governed`);
    if (binding.authorityKind === "fixed-pair") invariant(FIXED_CONTRAST_IDS.has(binding.authorityId), `${label} fixed pair is missing`);
    else invariant(measurementByEngineState.get(`${binding.engine}\u0000${binding.state}`)?.has(binding.authorityId), `${label} selector-local measurement is missing`);
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
