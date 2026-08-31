import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  ACCESSIBILITY_VIEWPORTS,
  MENU_REPEAT_CYCLES,
  SCHEMA,
  expectedAxeCases,
  historyFailures,
  keyboardFailures,
  mobileMenuFailures,
  normalizeAxeViolations,
  parseArguments,
  runSelfTest,
  seriousCriticalAxeFailures,
  validateReport,
} from "../scripts/qa-phase6-accessibility-interactions.mjs";
import { PHASE6_ROUTES } from "../scripts/phase6-contract.mjs";

const root = path.resolve(import.meta.dirname, "..");
const BASE_URL = "http://127.0.0.1:4338/";

function cleanDiagnostics(routePath, status = 200, { includeHome = false } = {}) {
  const diagnostics = {
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    requests: [{
      documentUrl: "about:blank",
      failure: null,
      fromServiceWorker: false,
      isMainFrame: true,
      isNavigation: true,
      method: "GET",
      resourceType: "document",
      status,
      url: new URL(routePath, BASE_URL).toString(),
    }],
  };
  if (includeHome && new URL(routePath, BASE_URL).pathname !== "/") {
    diagnostics.requests.push({
      documentUrl: new URL(routePath, BASE_URL).toString(), failure: null, fromServiceWorker: false,
      isMainFrame: true, isNavigation: true, method: "GET", resourceType: "document", status: 200, url: BASE_URL,
    });
  }
  return diagnostics;
}

function visibleSkipTarget(expectedHash) {
  const tag = expectedHash === "#entry" ? "section" : "main";
  const visibleAncestor = (ancestorTag) => ({ ariaHidden: null, contentVisibility: "visible", display: "block", hidden: false, inert: false, opacity: 1, tag: ancestorTag, visibility: "visible" });
  return {
    targetDisplay: expectedHash === "#entry" ? "grid" : "block",
    targetRect: { bottom: 100, height: 100, left: 0, right: 100, top: 0, width: 100 },
    targetRenderedVisible: true,
    targetTag: tag,
    targetVisibility: "visible",
    targetVisibilityChain: [{ ...visibleAncestor(tag), display: expectedHash === "#entry" ? "grid" : "block" }, visibleAncestor("body"), visibleAncestor("html")],
    targetVisible: true,
  };
}

function focused(key = "a|/target|Target") {
  const [tag, keyHref, ...textParts] = key.split("|");
  const text = textParts.join("|");
  const visibleAncestor = (ancestorTag) => ({ ariaHidden: null, contentVisibility: "visible", display: "block", hidden: false, inert: false, opacity: 1, tag: ancestorTag, visibility: "visible" });
  return {
    ariaLabel: null,
    classes: [],
    focusVisible: true,
    href: keyHref || null,
    key,
    outlineColor: "rgb(240, 107, 160)",
    outlineStyle: "solid",
    outlineWidth: "2px",
    rect: { bottom: 80, height: 44, left: 10, right: 110, top: 36, width: 100 },
    renderedVisible: true,
    selector: "a.target",
    tag,
    text,
    visible: true,
    visibilityChain: [visibleAncestor(tag), visibleAncestor("body"), visibleAncestor("html")],
    withinMobileNav: false,
    withinSiteHeader: false,
  };
}

function resolvedHomeState(hash = "#entry") {
  return { cinematicMode: "enhanced", entryInert: false, hash, manifestoReveal: "resolved", mediaState: "ready", path: "/", route: `/${hash}` };
}

function desktopHome(routePath) {
  return {
    activationError: null,
    arrival: resolvedHomeState(),
    arrivalReady: true,
    back: routePath === "/" ? resolvedHomeState("") : { cinematicMode: null, entryInert: null, hash: "", manifestoReveal: null, mediaState: null, path: routePath, route: routePath },
    backError: null,
    focus: { ...focused("a|/#entry|"), ariaLabel: "Quantum home", classes: ["brand-link"], href: "/#entry", withinSiteHeader: true },
    forward: resolvedHomeState(),
    forwardError: null,
    preparation: routePath === "/" ? {
      input: "NATIVE WHEEL",
      ready: true,
      resolved: true,
      state: { cinematicMode: "enhanced", entryInert: false, hash: "", manifestoReveal: "resolved", mediaState: "ready", path: "/", route: "/" },
      wheelSteps: 12,
    } : null,
  };
}

function keyboardRow(engine, route) {
  const expectedHash = route.id === "home" ? "#entry" : "#main-content";
  const forwardFirst = route.id === "home"
    ? { ...focused("a|/for-partners/|For partners"), classes: ["audience-trajectory"], href: "/for-partners/" }
    : route.id === "maradin"
      ? focused("button||▶ Play field footage")
      : route.id === "spark"
        ? focused("summary||Who is SPARK for?")
    : focused("a|/one|One");
  const forwardSecond = route.id === "home"
    ? { ...focused("a|/for-startups/|For startups"), classes: ["audience-trajectory"], href: "/for-startups/" }
    : route.id === "maradin"
      ? focused("button||▶ Play test footage")
      : route.id === "spark"
        ? focused("summary||Is a POC guaranteed?")
    : focused("a|/two|Two");
  const record = {
    activationReady: true,
    afterActivation: { activeId: expectedHash.slice(1), hash: expectedHash, path: route.path, ...visibleSkipTarget(expectedHash) },
    backward: { ...forwardFirst },
    desktopHome: desktopHome(route.path),
    diagnostics: cleanDiagnostics(route.path, route.expectedStatus, { includeHome: true }),
    engine,
    expectedHash,
    first: { ...focused(`a|${expectedHash}|${route.id === "home" ? "Skip cinematic intro" : "Skip to content"}`), classes: ["skip-link"], href: expectedHash },
    firstVisibilityReady: true,
    forwardFirst,
    forwardSecond,
    interactionReady: true,
    route: route.id,
    routePath: route.path,
  };
  record.failures = keyboardFailures(record);
  record.status = record.failures.length ? "FAIL" : "PASS";
  return record;
}

function mobileMenuRow(engine) {
  const closed = { activeIsTrigger: true, ariaExpanded: "false", hash: "", open: false, path: "/about/" };
  const open = { activeIsTrigger: true, ariaExpanded: "true", hash: "", open: true, path: "/about/" };
  const record = {
    cycles: Array.from({ length: MENU_REPEAT_CYCLES }, () => ({ close: { ...closed }, open: { ...open } })),
    diagnostics: cleanDiagnostics("/about/", 200, { includeHome: true }),
    engine,
    escapeClose: { ...closed },
    firstMenuLink: { ...focused("a|/#entry|Home"), withinMobileNav: true },
    navigation: {
      activationError: null,
      arrival: { activeIsTrigger: false, ariaExpanded: "false", hash: "#entry", open: false, path: "/" },
      back: { ...closed, activeIsTrigger: false },
      backError: null,
      focus: { ...focused("a|/#entry|Home"), href: "/#entry", withinMobileNav: true },
    },
    ordinaryClose: { ...closed },
    ordinaryOpen: { ...open },
    triggerFocus: { ...focused("summary||Menu"), withinMobileNav: true },
  };
  record.failures = mobileMenuFailures(record);
  record.status = record.failures.length ? "FAIL" : "PASS";
  return record;
}

function historyRow(engine) {
  const record = {
    back: { entryAlignmentDelta: 4200, hash: "", path: "/", scrollY: 0 },
    bare: { entryAlignmentDelta: 4200, hash: "", path: "/", scrollY: 0 },
    diagnostics: cleanDiagnostics("/"),
    engine,
    entry: { entryAlignmentDelta: 0, hash: "#entry", path: "/", scrollY: 4200 },
    entryReady: true,
    forward: { entryAlignmentDelta: 0, hash: "#entry", path: "/", scrollY: 4200 },
    forwardReady: true,
  };
  record.failures = historyFailures(record);
  record.status = record.failures.length ? "FAIL" : "PASS";
  return record;
}

function validReport(engine = "webkit", { axeOnly = false } = {}) {
  const routes = PHASE6_ROUTES.map(({ expectedStatus, id, path: routePath }) => ({ expectedStatus, id, path: routePath }));
  const axe = ACCESSIBILITY_VIEWPORTS.flatMap((viewport) => routes.map((route) => ({
    caseError: null,
    diagnostics: cleanDiagnostics(route.path, route.expectedStatus),
    engine,
    failures: [],
    httpStatus: route.expectedStatus,
    incompleteCount: 0,
    route: route.id,
    status: "PASS",
    violations: [],
    viewport: { ...viewport },
  })));
  const keyboard = axeOnly ? [] : PHASE6_ROUTES.map((route) => keyboardRow(engine, route));
  const mobileMenu = axeOnly ? null : mobileMenuRow(engine);
  const history = axeOnly ? null : historyRow(engine);
  const failures = [
    ...axe.flatMap((record) => record.failures.map((failure) => ({ section: "axe", route: record.route, viewport: record.viewport.id, ...failure }))),
    ...keyboard.flatMap((record) => record.failures.map((failure) => ({ section: "keyboard", route: record.route, ...failure }))),
    ...(mobileMenu?.failures ?? []).map((failure) => ({ section: "mobile-menu", ...failure })),
    ...(history?.failures ?? []).map((failure) => ({ section: "history", ...failure })),
  ];
  const result = {
    axe,
    browser: { engine, executable: { chromium: "chrome.exe", firefox: "firefox.exe", webkit: "Playwright.exe" }[engine], headed: false, version: "1.0" },
    engine,
    failures,
    history,
    keyboard,
    mobileMenu,
    status: failures.length ? "FAIL" : "PASS",
    summary: { axeCases: 20, axeViolations: 0, failures: failures.length, keyboardCases: keyboard.length, seriousCritical: 0 },
  };
  return {
    axeOnly,
    baseUrl: BASE_URL,
    engine,
    engines: [result],
    failures: failures.map((failure) => ({ engine, ...failure })),
    generatedAt: "2026-08-30T14:00:00.000Z",
    headed: false,
    routes,
    schema: SCHEMA,
    selectedEngines: [engine],
    status: failures.length ? "FAIL" : "PASS",
    summary: { axeCases: 20, axeExpected: 20, axeViolations: 0, engineErrors: 0, failures: failures.length, seriousCritical: 0 },
    viewports: ACCESSIBILITY_VIEWPORTS,
  };
}

test("accessibility contract freezes sixty default axe cases", () => {
  assert.deepEqual(ACCESSIBILITY_VIEWPORTS.map(({ width, height }) => `${width}x${height}`), ["1440x900", "390x844"]);
  assert.equal(PHASE6_ROUTES.length, 10);
  assert.equal(expectedAxeCases("chromium"), 20);
  assert.equal(expectedAxeCases("webkit"), 20);
  assert.equal(expectedAxeCases("firefox"), 20);
  assert.equal(expectedAxeCases("all"), 60);
  assert.equal(MENU_REPEAT_CYCLES, 4);
});

test("CLI supports all engines, headed Firefox and strict external output intent", () => {
  const output = path.resolve(root, "..", "phase-6-work", "accessibility-firefox.json");
  const options = parseArguments([
    "--base-url", "http://127.0.0.1:4338",
    "--engine", "firefox",
    "--axe-only",
    "--headed",
    "--output", output,
    "--timeout-ms", "5000",
  ]);
  assert.equal(options.baseUrl, "http://127.0.0.1:4338/");
  assert.equal(options.engine, "firefox");
  assert.equal(options.axeOnly, true);
  assert.equal(options.headed, true);
  assert.equal(options.output, output);
  assert.throws(() => parseArguments(["--engine", "safari", "--output", output]), /chromium, webkit, firefox or all/);
  assert.throws(() => parseArguments(["--engine", "all"]), /--output is required/);
  assert.throws(() => parseArguments(["--output", path.join(root, "accessibility.json")]), /outside the repository/);
});

test("axe normalization retains node selectors and fails serious/critical impacts", () => {
  const violations = normalizeAxeViolations([
    {
      description: "Fixture issue",
      help: "Fix the fixture",
      helpUrl: "https://example.test/help",
      id: "fixture-rule",
      impact: "serious",
      nodes: [{ failureSummary: "Failure", html: "<button></button>", target: ["main", "button.fixture"] }],
      tags: ["wcag2aa"],
    },
    {
      description: "Minor issue",
      help: "Minor",
      helpUrl: "https://example.test/minor",
      id: "minor-rule",
      impact: "minor",
      nodes: [{ failureSummary: "Minor", html: "<p></p>", target: ["p"] }],
      tags: ["best-practice"],
    },
  ]);
  assert.deepEqual(violations[0].nodes[0].selectors, ["main", "button.fixture"]);
  const failures = seriousCriticalAxeFailures({ route: "about", violations, viewport: ACCESSIBILITY_VIEWPORTS[0] });
  assert.equal(failures.length, 1);
  assert.equal(failures[0].impact, "serious");
  assert.deepEqual(failures[0].selectors, ["main", "button.fixture"]);
});

test("keyboard validator covers visible skip activation and reverse focus order", () => {
  const first = { ...focused("a|#main-content|Skip to content"), classes: ["skip-link"], href: "#main-content" };
  const forwardFirst = focused("a|/one|One");
  const record = {
    activationReady: true,
    afterActivation: { activeId: "main-content", hash: "#main-content", path: "/about/", ...visibleSkipTarget("#main-content") },
    backward: { ...forwardFirst },
    expectedHash: "#main-content",
    desktopHome: desktopHome("/about/"),
    first,
    firstVisibilityReady: true,
    forwardFirst,
    forwardSecond: focused("a|/two|Two"),
    interactionReady: true,
    route: "about",
    routePath: "/about/",
  };
  assert.deepEqual(keyboardFailures(record), []);
  record.backward.key = "a|/wrong|Wrong";
  record.first.outlineWidth = "0px";
  const codes = keyboardFailures(record).map(({ code }) => code);
  assert.ok(codes.includes("skip-link-focus"));
  assert.ok(codes.includes("shift-tab-order"));
});

test("keyboard validator accepts visible native supporting-route controls without promoting arbitrary focus targets", () => {
  for (const [routeId, firstKey, secondKey] of [
    ["maradin", "button||▶ Play field footage", "button||▶ Play test footage"],
    ["spark", "summary||Who is SPARK for?", "summary||Is a POC guaranteed?"],
  ]) {
    const route = PHASE6_ROUTES.find(({ id }) => id === routeId);
    const record = keyboardRow("chromium", route);
    record.forwardFirst = focused(firstKey);
    record.forwardSecond = focused(secondKey);
    record.backward = { ...record.forwardFirst };
    assert.deepEqual(keyboardFailures(record), [], `${routeId} native controls were rejected`);
  }

  const route = PHASE6_ROUTES.find(({ id }) => id === "about");
  const arbitrary = keyboardRow("chromium", route);
  arbitrary.forwardFirst = focused("div||Focusable div");
  arbitrary.backward = { ...arbitrary.forwardFirst };
  assert.ok(keyboardFailures(arbitrary).some(({ code }) => code === "forward-focus-visibility"));

  const maradin = keyboardRow("chromium", PHASE6_ROUTES.find(({ id }) => id === "maradin"));
  maradin.forwardFirst = focused("summary||Wrong route control");
  maradin.backward = { ...maradin.forwardFirst };
  assert.ok(keyboardFailures(maradin).some(({ code }) => code === "forward-focus-visibility"));
});

test("keyboard validator rejects focus-wait timeouts and every partial viewport edge", () => {
  const route = PHASE6_ROUTES.find(({ id }) => id === "about");
  const timedOut = keyboardRow("chromium", route);
  timedOut.firstVisibilityReady = false;
  assert.ok(keyboardFailures(timedOut).some(({ code }) => code === "skip-link-visibility-wait"));

  const notReady = keyboardRow("chromium", PHASE6_ROUTES.find(({ id }) => id === "home"));
  notReady.interactionReady = false;
  assert.ok(keyboardFailures(notReady).some(({ code }) => code === "interaction-readiness"));

  for (const [edge, value] of [["top", -1], ["left", -1], ["bottom", 901], ["right", 1441]]) {
    const partial = keyboardRow("chromium", route);
    partial.first.rect[edge] = value;
    assert.ok(keyboardFailures(partial).some(({ code }) => code === "skip-link-focus"), `${edge} partial geometry passed`);
  }
  for (const [label, mutate] of [
    ["inverted horizontal edges", (rect) => { rect.right = rect.left - 1; }],
    ["inverted vertical edges", (rect) => { rect.bottom = rect.top - 1; }],
    ["mismatched width", (rect) => { rect.width += 1; }],
    ["mismatched height", (rect) => { rect.height += 1; }],
  ]) {
    const impossible = keyboardRow("chromium", route);
    mutate(impossible.first.rect);
    assert.ok(keyboardFailures(impossible).some(({ code }) => code === "skip-link-focus"), `${label} passed`);
  }
  for (const [label, mutate, expectedCode] of [
    ["truthy focus-visible string", (row) => { row.first.focusVisible = "true"; }, "skip-link-focus"],
    ["late-correct activation after timeout", (row) => { row.activationReady = false; }, "skip-link-activation-wait"],
    ["truthy visible string", (row) => { row.first.visible = "true"; }, "skip-link-focus"],
    ["string class list", (row) => { row.first.classes = "skip-link"; }, "skip-link-focus"],
    ["non-anchor skip identity", (row) => { row.first.tag = "div"; row.first.key = `div|${row.first.href}|${row.first.text}`; }, "skip-link-focus"],
    ["empty outline style", (row) => { row.first.outlineStyle = ""; }, "skip-link-focus"],
    ["whitespace outline style", (row) => { row.first.outlineStyle = " "; }, "skip-link-focus"],
    ["noncanonical outline-style case", (row) => { row.first.outlineStyle = "SOLID"; }, "skip-link-focus"],
    ["padded none outline style", (row) => { row.first.outlineStyle = "none "; }, "skip-link-focus"],
    ["impossible outline style", (row) => { row.first.outlineStyle = "garbage"; }, "skip-link-focus"],
    ["malformed outline width", (row) => { row.first.outlineWidth = "2garbage"; }, "skip-link-focus"],
    ["transparent outline color", (row) => { row.first.outlineColor = "rgba(0, 0, 0, 0)"; }, "skip-link-focus"],
    ["wrong activation path", (row) => { row.afterActivation.path = "/contact/"; }, "skip-link-activation"],
    ["truthy target-visible string", (row) => { row.afterActivation.targetVisible = "true"; }, "skip-link-activation"],
    ["zero-width activation target", (row) => { row.afterActivation.targetRect.right = 0; row.afterActivation.targetRect.width = 0; }, "skip-link-activation"],
    ["off-right activation target", (row) => { row.afterActivation.targetRect.left = 1440; row.afterActivation.targetRect.right = 1540; }, "skip-link-activation"],
    ["wrong activation display", (row) => { row.afterActivation.targetDisplay = "grid"; }, "skip-link-activation"],
    ["hidden activation display", (row) => { row.afterActivation.targetDisplay = "none"; }, "skip-link-activation"],
    ["hidden activation visibility", (row) => { row.afterActivation.targetVisibility = "hidden"; }, "skip-link-activation"],
    ["activation target ancestor opacity", (row) => { row.afterActivation.targetVisibilityChain[1].opacity = 0.001; }, "skip-link-activation"],
    ["activation target uppercase aria-hidden", (row) => { row.afterActivation.targetVisibilityChain[1].ariaHidden = "TRUE"; }, "skip-link-activation"],
    ["zero own opacity", (row) => { row.first.visibilityChain[0].opacity = 0; }, "skip-link-focus"],
    ["effectively invisible ancestor opacity", (row) => { row.first.visibilityChain[1].opacity = 0.001; }, "skip-link-focus"],
    ["uppercase ancestor aria-hidden", (row) => { row.first.visibilityChain[1].ariaHidden = "TRUE"; }, "skip-link-focus"],
    ["uppercase ancestor display none", (row) => { row.first.visibilityChain[1].display = "NONE"; }, "skip-link-focus"],
    ["uppercase ancestor visibility hidden", (row) => { row.first.visibilityChain[1].visibility = "HIDDEN"; }, "skip-link-focus"],
    ["uppercase ancestor content visibility hidden", (row) => { row.first.visibilityChain[1].contentVisibility = "HIDDEN"; }, "skip-link-focus"],
    ["wrong activation target tag", (row) => { row.afterActivation.targetTag = "div"; row.afterActivation.targetVisibilityChain[0].tag = "div"; }, "skip-link-activation"],
    ["contradictory activation-chain display", (row) => { row.afterActivation.targetVisibilityChain[0].display = "flex"; }, "skip-link-activation"],
  ]) {
    const malformed = keyboardRow("chromium", route);
    mutate(malformed);
    assert.ok(keyboardFailures(malformed).some(({ code }) => code === expectedCode), `${label} passed`);
  }
  const missingReverseIdentity = keyboardRow("chromium", route);
  delete missingReverseIdentity.forwardFirst.key;
  delete missingReverseIdentity.backward.key;
  assert.ok(keyboardFailures(missingReverseIdentity).some(({ code }) => code === "forward-focus-visibility"));
  assert.ok(keyboardFailures(missingReverseIdentity).some(({ code }) => code === "shift-tab-order"));

  const contradictoryIdentity = keyboardRow("chromium", route);
  contradictoryIdentity.forwardFirst.key = "a|/contradiction/|One";
  assert.ok(keyboardFailures(contradictoryIdentity).some(({ code }) => code === "forward-focus-visibility"));

  const nonAnchorControls = keyboardRow("chromium", route);
  nonAnchorControls.forwardFirst.tag = "div";
  nonAnchorControls.forwardFirst.key = `div|${nonAnchorControls.forwardFirst.href}|${nonAnchorControls.forwardFirst.text}`;
  nonAnchorControls.desktopHome.focus.tag = "div";
  nonAnchorControls.desktopHome.focus.key = `div|${nonAnchorControls.desktopHome.focus.href}|${nonAnchorControls.desktopHome.focus.text}`;
  const nonAnchorCodes = keyboardFailures(nonAnchorControls).map(({ code }) => code);
  assert.ok(nonAnchorCodes.includes("forward-focus-visibility"));
  assert.ok(nonAnchorCodes.includes("desktop-home-focus"));

  for (const [routeId, wrongHash, wrongDisplay] of [["about", "#entry", "grid"], ["home", "#main-content", "block"]]) {
    const swapped = keyboardRow("chromium", PHASE6_ROUTES.find(({ id }) => id === routeId));
    swapped.expectedHash = wrongHash;
    swapped.first.href = wrongHash;
    swapped.first.key = `a|${wrongHash}|${swapped.first.text}`;
    swapped.afterActivation.hash = wrongHash;
    swapped.afterActivation.activeId = wrongHash.slice(1);
    swapped.afterActivation.targetDisplay = wrongDisplay;
    assert.ok(keyboardFailures(swapped).some(({ code }) => code === "skip-link-route-contract"), `${routeId} accepted ${wrongHash}`);
  }
});

test("Home desktop navigation requires native cinematic preparation evidence", () => {
  const home = PHASE6_ROUTES.find(({ id }) => id === "home");
  const record = keyboardRow("chromium", home);
  assert.deepEqual(record.failures, []);
  const mutations = [
    (candidate) => { delete candidate.desktopHome.preparation; },
    (candidate) => { candidate.desktopHome.preparation.input = "PROGRAMMATIC"; },
    (candidate) => { candidate.desktopHome.preparation.ready = false; },
    (candidate) => { candidate.desktopHome.preparation.resolved = false; },
    (candidate) => { candidate.desktopHome.preparation.wheelSteps = 0; },
    (candidate) => { candidate.desktopHome.preparation.wheelSteps = 25; },
    (candidate) => { candidate.desktopHome.preparation.state.path = "/about/"; },
    (candidate) => { candidate.desktopHome.preparation.state.hash = "#entry"; },
    (candidate) => { candidate.desktopHome.preparation.state.route = "/#entry"; },
    (candidate) => { candidate.desktopHome.preparation.state.cinematicMode = "fallback"; },
    (candidate) => { candidate.desktopHome.preparation.state.mediaState = "loading"; },
    (candidate) => { candidate.desktopHome.preparation.state.entryInert = true; },
    (candidate) => { candidate.desktopHome.preparation.state.manifestoReveal = "hidden"; },
  ];
  for (const mutate of mutations) {
    const candidate = keyboardRow("chromium", home);
    mutate(candidate);
    assert.ok(keyboardFailures(candidate).some(({ code }) => code === "desktop-home-preparation"));
  }
  for (const [label, mutate, code] of [
    ["empty activation error", (candidate) => { candidate.desktopHome.activationError = ""; }, "desktop-home-navigation-wait"],
    ["late-resolved arrival after timeout", (candidate) => { candidate.desktopHome.arrivalReady = false; }, "desktop-home-arrival-wait"],
    ["omitted back error", (candidate) => { delete candidate.desktopHome.backError; }, "desktop-home-back-wait"],
    ["false forward error", (candidate) => { candidate.desktopHome.forwardError = false; }, "desktop-home-forward-wait"],
    ["contradictory arrival route", (candidate) => { candidate.desktopHome.arrival.route = "/"; }, "desktop-home-arrival"],
    ["inert forward", (candidate) => { candidate.desktopHome.forward.entryInert = true; }, "desktop-home-forward"],
    ["unresolved forward", (candidate) => { candidate.desktopHome.forward.manifestoReveal = "revealing"; }, "desktop-home-forward"],
    ["footer Home substituted for header Home", (candidate) => { candidate.desktopHome.focus.withinSiteHeader = false; }, "desktop-home-focus"],
    ["header non-brand anchor substituted", (candidate) => { candidate.desktopHome.focus.classes = []; }, "desktop-home-focus"],
    ["wrong brand accessible label", (candidate) => { candidate.desktopHome.focus.ariaLabel = "Home"; }, "desktop-home-focus"],
    ["visible Home text substituted for logo", (candidate) => { candidate.desktopHome.focus.text = "Home"; candidate.desktopHome.focus.key = "a|/#entry|Home"; }, "desktop-home-focus"],
  ]) {
    const candidate = keyboardRow("chromium", home);
    mutate(candidate);
    assert.ok(keyboardFailures(candidate).some(({ code: actual }) => actual === code), `${label} passed`);
  }
  const support = keyboardRow("chromium", PHASE6_ROUTES.find(({ id }) => id === "about"));
  support.desktopHome.back.cinematicMode = "enhanced";
  assert.ok(keyboardFailures(support).some(({ code }) => code === "desktop-home-back"));
});

test("mobile-menu validator requires close, Escape focus return and every repeat cycle", () => {
  const closed = { activeIsTrigger: true, ariaExpanded: "false", hash: "", open: false, path: "/about/" };
  const open = { activeIsTrigger: true, ariaExpanded: "true", hash: "", open: true, path: "/about/" };
  const record = {
    cycles: Array.from({ length: MENU_REPEAT_CYCLES }, () => ({ close: { ...closed }, open: { ...open } })),
    escapeClose: { ...closed },
    firstMenuLink: { ...focused("a|/#entry|Home"), withinMobileNav: true },
    navigation: {
      activationError: null,
      arrival: { activeIsTrigger: false, ariaExpanded: "false", hash: "#entry", open: false, path: "/" },
      back: { ...closed, activeIsTrigger: false },
      backError: null,
      focus: { ...focused("a|/#entry|Home"), href: "/#entry", withinMobileNav: true },
    },
    ordinaryClose: { ...closed },
    ordinaryOpen: { ...open },
    triggerFocus: { ...focused("summary||Menu"), withinMobileNav: true },
  };
  assert.deepEqual(mobileMenuFailures(record), []);
  const nonSemanticControls = structuredClone(record);
  nonSemanticControls.triggerFocus.tag = "div";
  nonSemanticControls.triggerFocus.key = `div||${nonSemanticControls.triggerFocus.text}`;
  nonSemanticControls.firstMenuLink.tag = "div";
  nonSemanticControls.firstMenuLink.key = `div|${nonSemanticControls.firstMenuLink.href}|${nonSemanticControls.firstMenuLink.text}`;
  nonSemanticControls.navigation.focus.tag = "div";
  nonSemanticControls.navigation.focus.key = `div|${nonSemanticControls.navigation.focus.href}|${nonSemanticControls.navigation.focus.text}`;
  const semanticCodes = mobileMenuFailures(nonSemanticControls).map(({ code }) => code);
  assert.ok(semanticCodes.includes("mobile-menu-trigger-focus"));
  assert.ok(semanticCodes.includes("mobile-menu-link-focus"));
  assert.ok(semanticCodes.includes("mobile-menu-navigation-focus"));
  const truthyMenuState = structuredClone(record);
  truthyMenuState.ordinaryOpen.open = "true";
  truthyMenuState.ordinaryClose.activeIsTrigger = "true";
  truthyMenuState.navigation.arrival.open = "false";
  const truthyCodes = mobileMenuFailures(truthyMenuState).map(({ code }) => code);
  assert.ok(truthyCodes.includes("mobile-menu-open"));
  assert.ok(truthyCodes.includes("mobile-menu-close"));
  assert.ok(truthyCodes.includes("mobile-menu-navigation"));
  const outsideMenu = structuredClone(record);
  outsideMenu.triggerFocus.withinMobileNav = false;
  outsideMenu.firstMenuLink.withinMobileNav = false;
  outsideMenu.navigation.focus.withinMobileNav = false;
  const contextCodes = mobileMenuFailures(outsideMenu).map(({ code }) => code);
  assert.ok(contextCodes.includes("mobile-menu-trigger-focus"));
  assert.ok(contextCodes.includes("mobile-menu-link-focus"));
  assert.ok(contextCodes.includes("mobile-menu-navigation-focus"));
  const wrongFirstMenuLink = structuredClone(record);
  wrongFirstMenuLink.firstMenuLink = { ...focused("a|/contact/|Contact"), withinMobileNav: true };
  assert.ok(mobileMenuFailures(wrongFirstMenuLink).some(({ code }) => code === "mobile-menu-link-focus"));
  const wrongMenuNames = structuredClone(record);
  wrongMenuNames.triggerFocus.text = "Navigation";
  wrongMenuNames.triggerFocus.key = "summary||Navigation";
  wrongMenuNames.firstMenuLink.text = "Start";
  wrongMenuNames.firstMenuLink.key = "a|/#entry|Start";
  wrongMenuNames.navigation.focus.text = "Start";
  wrongMenuNames.navigation.focus.key = "a|/#entry|Start";
  const nameCodes = mobileMenuFailures(wrongMenuNames).map(({ code }) => code);
  assert.ok(nameCodes.includes("mobile-menu-trigger-focus"));
  assert.ok(nameCodes.includes("mobile-menu-link-focus"));
  assert.ok(nameCodes.includes("mobile-menu-navigation-focus"));
  const wrongRoute = structuredClone(record);
  wrongRoute.ordinaryOpen.path = "/contact/";
  wrongRoute.cycles[1].close.hash = "#entry";
  const routeCodes = mobileMenuFailures(wrongRoute).map(({ code }) => code);
  assert.ok(routeCodes.includes("mobile-menu-open"));
  assert.ok(routeCodes.includes("mobile-menu-repeat-cycle"));
  record.cycles[2].close.open = true;
  record.escapeClose.activeIsTrigger = false;
  const codes = mobileMenuFailures(record).map(({ code }) => code);
  assert.ok(codes.includes("mobile-menu-escape-focus-return"));
  assert.ok(codes.includes("mobile-menu-repeat-cycle"));
});

test("mobile-menu validator reports missing native link focus without waiting for navigation", () => {
  const closed = { activeIsTrigger: true, ariaExpanded: "false", hash: "", open: false, path: "/about/" };
  const open = { activeIsTrigger: true, ariaExpanded: "true", hash: "", open: true, path: "/about/" };
  const record = {
    cycles: Array.from({ length: MENU_REPEAT_CYCLES }, () => ({ close: { ...closed }, open: { ...open } })),
    escapeClose: { ...closed },
    firstMenuLink: { ...focused("a|/#entry|Home"), withinMobileNav: true },
    navigation: {
      arrival: { ...open },
      back: null,
      focus: { ...focused("body||"), focusVisible: false, href: null, tag: "body", visible: true },
    },
    ordinaryClose: { ...closed },
    ordinaryOpen: { ...open },
    triggerFocus: { ...focused("summary||Menu"), withinMobileNav: true },
  };
  const codes = mobileMenuFailures(record).map(({ code }) => code);
  assert.ok(codes.includes("mobile-menu-navigation-focus"));
  assert.ok(codes.includes("mobile-menu-navigation"));
  assert.ok(codes.includes("mobile-menu-history-return"));
});

test("history validator distinguishes bare Home from same-document #entry", () => {
  const record = {
    back: { entryAlignmentDelta: 4200, hash: "", path: "/", scrollY: 0 },
    bare: { entryAlignmentDelta: 4200, hash: "", path: "/", scrollY: 0 },
    entry: { entryAlignmentDelta: 0, hash: "#entry", path: "/", scrollY: 4200 },
    entryReady: true,
    forward: { entryAlignmentDelta: 0, hash: "#entry", path: "/", scrollY: 4200 },
    forwardReady: true,
  };
  assert.deepEqual(historyFailures(record), []);
  record.forward.hash = "";
  assert.deepEqual(historyFailures(record).map(({ code }) => code), ["same-document-forward"]);
  for (const [label, mutate, expected] of [
    ["string bare scroll", (candidate) => { candidate.bare.scrollY = "0"; }, "same-document-bare"],
    ["omitted forward scroll", (candidate) => { delete candidate.forward.scrollY; }, "same-document-forward"],
    ["omitted forward alignment", (candidate) => { delete candidate.forward.entryAlignmentDelta; }, "same-document-forward"],
    ["non-finite entry alignment", (candidate) => { candidate.entry.entryAlignmentDelta = Number.NaN; }, "same-document-entry"],
    ["positive back scroll", (candidate) => { candidate.back.scrollY = 100; }, "same-document-back"],
    ["late-correct entry after timeout", (candidate) => { candidate.entryReady = false; }, "same-document-entry-wait"],
    ["late-correct forward after timeout", (candidate) => { candidate.forwardReady = false; }, "same-document-forward-wait"],
  ]) {
    const candidate = historyRow("chromium");
    mutate(candidate);
    assert.ok(historyFailures(candidate).some(({ code }) => code === expected), `${label} passed`);
  }
});

test("report validator requires complete per-engine matrices but permits explicit engine errors", () => {
  const report = validReport();
  assert.equal(validateReport(report), true);
  const sparse = structuredClone(report);
  sparse.engines[0].keyboard[0] = { route: "home", failures: [], status: "PASS" };
  assert.throws(() => validateReport(sparse), /keyboard (route row|raw row\/status) differs/);
  const missingAxe = structuredClone(report);
  missingAxe.engines[0].axe = [];
  assert.throws(() => validateReport(missingAxe), /axe matrix is incomplete/);
  const forgedError = structuredClone(report);
  forgedError.engines[0] = { engine: "webkit", failure: "host limitation", status: "ERROR" };
  assert.throws(() => validateReport(forgedError), /failure ledger differs|summary differs|status differs/);
  for (const [label, mutate, pattern] of [
    ["missing browser identity", (candidate) => { delete candidate.engines[0].browser; }, /browser identity differs/],
    ["transplanted browser engine", (candidate) => { candidate.engines[0].browser.engine = "chromium"; }, /browser identity differs/],
    ["headed mismatch", (candidate) => { candidate.engines[0].browser.headed = true; }, /browser identity differs/],
    ["empty executable", (candidate) => { candidate.engines[0].browser.executable = ""; }, /browser identity differs/],
    ["transplanted Chromium executable", (candidate) => { candidate.engines[0].browser.executable = "chrome.exe"; }, /browser identity differs/],
    ["malformed version", (candidate) => { candidate.engines[0].browser.version = "WebKit latest"; }, /browser identity differs/],
    ["menu engine mismatch", (candidate) => { candidate.engines[0].mobileMenu.engine = "chromium"; }, /mobile-menu cycles are incomplete/],
    ["history engine mismatch", (candidate) => { candidate.engines[0].history.engine = "chromium"; }, /history evidence is absent or mislabeled/],
    ["truthy headed", (candidate) => { candidate.headed = "false"; }, /headed authority differs/],
    ["truthy axe-only", (candidate) => { candidate.axeOnly = "false"; }, /axe-only authority differs/],
    ["missing base URL", (candidate) => { delete candidate.baseUrl; }, /base URL authority differs/],
  ]) {
    const candidate = structuredClone(report);
    mutate(candidate);
    assert.throws(() => validateReport(candidate), pattern, `${label} passed`);
  }
  assert.equal(runSelfTest().status, "PASS");
});

test("report validator re-derives complete route-bound interaction diagnostics", () => {
  const base = validReport("chromium");
  const mutations = [
    ["missing diagnostics", (candidate) => { delete candidate.engines[0].keyboard[0].diagnostics; }],
    ["page error", (candidate) => { candidate.engines[0].keyboard[0].diagnostics.pageErrors.push({ message: "boom", name: "Error" }); }],
    ["empty request ledger", (candidate) => { candidate.engines[0].keyboard[0].diagnostics.requests = []; }],
    ["pending request", (candidate) => { const request = candidate.engines[0].keyboard[0].diagnostics.requests[0]; request.status = null; delete request.fromServiceWorker; }],
    ["service-worker response", (candidate) => { candidate.engines[0].keyboard[0].diagnostics.requests[0].fromServiceWorker = true; }],
    ["subframe navigation", (candidate) => { candidate.engines[0].keyboard[0].diagnostics.requests[0].isMainFrame = false; }],
    ["non-document navigation", (candidate) => { candidate.engines[0].keyboard[0].diagnostics.requests[0].resourceType = "image"; }],
    ["missing supporting Home navigation", (candidate) => {
      const row = candidate.engines[0].keyboard.find(({ route }) => route === "about");
      row.diagnostics.requests = row.diagnostics.requests.filter(({ url }) => new URL(url).pathname !== "/");
    }],
    ["wrong route coverage", (candidate) => { candidate.engines[0].keyboard[0].diagnostics.requests[0].url = new URL("/about/", BASE_URL).toString(); }],
    ["unexpected method", (candidate) => { candidate.engines[0].keyboard[0].diagnostics.requests[0].method = "POST"; }],
    ["axe-only diagnostics deleted", (candidate) => { delete candidate.engines[0].axe[0].diagnostics; }],
  ];
  for (const [label, mutate] of mutations) {
    const candidate = structuredClone(base);
    mutate(candidate);
    assert.throws(() => validateReport(candidate), /raw (row\/status|failure ledger) differs/, `${label} passed`);
  }

  const wrong404 = structuredClone(base);
  const notFound = wrong404.engines[0].keyboard.find(({ route }) => route === "404");
  notFound.diagnostics.requests.push({
    documentUrl: new URL("/__phase6-intentional-404__/", BASE_URL).toString(), failure: null, fromServiceWorker: false,
    isMainFrame: true, isNavigation: true, method: "GET", resourceType: "document", status: 404, url: new URL("/", BASE_URL).toString(),
  });
  assert.throws(() => validateReport(wrong404), /keyboard raw row\/status differs/, "unrelated Home 404 was accepted");

  const exact404Console = structuredClone(base);
  const exactNotFound = exact404Console.engines[0].keyboard.find(({ route }) => route === "404");
  exactNotFound.diagnostics.consoleErrors.push({
    documentUrl: new URL("/__phase6-intentional-404__/", BASE_URL).toString(),
    location: { columnNumber: 0, lineNumber: 0, url: new URL("/__phase6-intentional-404__/", BASE_URL).toString() },
    text: "Failed to load resource: the server responded with a status of 404",
  });
  assert.equal(validateReport(exact404Console), true, "exact intentional-404 console evidence should remain allowed");

  const staleDocument404Console = structuredClone(exact404Console);
  staleDocument404Console.engines[0].keyboard.find(({ route }) => route === "404").diagnostics.consoleErrors[0].documentUrl = new URL("/contact/", BASE_URL).toString();
  assert.equal(validateReport(staleDocument404Console), true, "same-origin WebKit console timing must remain bound by the exact 404 location and request ledger");

  const wrong404Console = structuredClone(exact404Console);
  wrong404Console.engines[0].keyboard.find(({ route }) => route === "404").diagnostics.consoleErrors[0].documentUrl = "https://evil.example/";
  assert.throws(() => validateReport(wrong404Console), /keyboard raw row\/status differs/, "cross-origin 404 console error was attributed to the intentional-404 document");

  const wrong404Location = structuredClone(exact404Console);
  wrong404Location.engines[0].keyboard.find(({ route }) => route === "404").diagnostics.consoleErrors[0].location.url = BASE_URL;
  assert.throws(() => validateReport(wrong404Location), /keyboard raw row\/status differs/, "unrelated Home console location was attributed to the intentional-404 document");

  const supportingBlobAbort = structuredClone(base);
  supportingBlobAbort.engines[0].keyboard[1].diagnostics.requests.push({
    documentUrl: new URL("/for-partners/", BASE_URL).toString(), failure: "net::ERR_ABORTED", fromServiceWorker: false,
    isMainFrame: true, isNavigation: false, method: "GET", resourceType: "media", status: 200, url: "blob:http://127.0.0.1:4338/supporting-fixture",
  });
  assert.throws(() => validateReport(supportingBlobAbort), /keyboard raw row\/status differs/, "supporting-route blob abort was misattributed to Home");

  const homeBlobAbort = structuredClone(base);
  homeBlobAbort.engines[0].keyboard[1].diagnostics.requests.push({
    documentUrl: new URL("/#entry", BASE_URL).toString(), failure: "net::ERR_ABORTED", fromServiceWorker: false,
    isMainFrame: true, isNavigation: false, method: "GET", resourceType: "media", status: 200, url: "blob:http://127.0.0.1:4338/home-fixture",
  });
  assert.equal(validateReport(homeBlobAbort), true, "document-bound Home response-then-abort should remain an allowed teardown");

  const wrongDocumentHomeAbort = structuredClone(base);
  wrongDocumentHomeAbort.engines[0].keyboard[0].diagnostics.requests.push({
    documentUrl: new URL("/about/", BASE_URL).toString(), failure: "net::ERR_ABORTED", fromServiceWorker: false,
    isMainFrame: true, isNavigation: false, method: "GET", resourceType: "media", status: 200, url: "blob:http://127.0.0.1:4338/home-wrong-document",
  });
  assert.throws(() => validateReport(wrongDocumentHomeAbort), /keyboard raw row\/status differs/, "Home abort without a Home document was accepted");

  const crossOriginBlobAbort = structuredClone(base);
  crossOriginBlobAbort.engines[0].keyboard[0].diagnostics.requests.push({
    documentUrl: BASE_URL, failure: "net::ERR_ABORTED", fromServiceWorker: false,
    isMainFrame: true, isNavigation: false, method: "GET", resourceType: "media", status: 200, url: "blob:https://evil.example/cross-origin",
  });
  assert.throws(() => validateReport(crossOriginBlobAbort), /keyboard raw row\/status differs/, "cross-origin blob abort was accepted");

  const maradinAbort = structuredClone(base);
  const maradin = maradinAbort.engines[0].keyboard.find(({ route }) => route === "maradin");
  maradin.diagnostics.requests.push({
    documentUrl: new URL("/pocs/maradin/", BASE_URL).toString(), failure: "net::ERR_ABORTED", fromServiceWorker: false,
    isMainFrame: true, isNavigation: false, method: "GET", resourceType: "media", status: 200,
    url: new URL("/media/maradin/maradin-field-aperture-approved.mp4", BASE_URL).toString(),
  });
  assert.equal(validateReport(maradinAbort), true, "document-bound Maradin response-then-abort should remain an allowed teardown");
});

test("axe case failures remain structured and cannot be promoted by deleting diagnostics", () => {
  const report = validReport("webkit", { axeOnly: true });
  const row = report.engines[0].axe[0];
  row.caseError = "axe evaluation timed out";
  row.httpStatus = null;
  row.failures = [{ code: "axe-case-error", actual: row.caseError }];
  row.status = "FAIL";
  const failure = { engine: "webkit", section: "axe", route: row.route, viewport: row.viewport.id, ...row.failures[0] };
  report.engines[0].failures = [{ section: "axe", route: row.route, viewport: row.viewport.id, ...row.failures[0] }];
  report.engines[0].status = "FAIL";
  report.engines[0].summary.failures = 1;
  report.failures = [failure];
  report.status = "FAIL";
  report.summary.failures = 1;
  assert.equal(validateReport(report), true);

  const promoted = structuredClone(report);
  promoted.engines[0].axe[0].caseError = null;
  promoted.engines[0].axe[0].httpStatus = 200;
  promoted.engines[0].axe[0].diagnostics = cleanDiagnostics("/");
  promoted.engines[0].axe[0].failures = [];
  promoted.engines[0].axe[0].status = "PASS";
  promoted.engines[0].failures = [];
  promoted.engines[0].status = "PASS";
  promoted.engines[0].summary.failures = 0;
  promoted.failures = [];
  promoted.status = "PASS";
  promoted.summary.failures = 0;
  delete promoted.engines[0].axe[0].diagnostics;
  assert.throws(() => validateReport(promoted), /axe raw failure ledger differs/);
});

test("all-engine report requires the exact unique Chromium, WebKit and Firefox result order", () => {
  const engines = ["chromium", "webkit", "firefox"];
  const reports = engines.map((engine) => validReport(engine));
  const report = {
    ...structuredClone(reports[0]),
    engine: "all",
    engines: reports.map((item) => structuredClone(item.engines[0])),
    selectedEngines: engines,
    summary: { axeCases: 60, axeExpected: 60, axeViolations: 0, engineErrors: 0, failures: 0, seriousCritical: 0 },
  };
  assert.equal(validateReport(report), true);
  const duplicated = structuredClone(report);
  duplicated.engines = Array.from({ length: 3 }, () => structuredClone(report.engines[1]));
  assert.throws(() => validateReport(duplicated), /engine result inventory differs/);
  const missing = structuredClone(report);
  missing.engines.pop();
  assert.throws(() => validateReport(missing), /engine inventory is incomplete/);
  const wrongOrder = structuredClone(report);
  [wrongOrder.engines[0], wrongOrder.engines[1]] = [wrongOrder.engines[1], wrongOrder.engines[0]];
  assert.throws(() => validateReport(wrongOrder), /engine result inventory differs/);
});

test("URL wait failures remain structured interaction failures instead of disappearing", () => {
  const keyboard = keyboardRow("webkit", PHASE6_ROUTES[0]);
  keyboard.desktopHome.activationError = "waitForURL timed out";
  assert.ok(keyboardFailures(keyboard).some(({ code }) => code === "desktop-home-navigation-wait"));
  const menu = mobileMenuRow("webkit");
  menu.navigation.activationError = "waitForURL timed out";
  assert.ok(mobileMenuFailures(menu).some(({ code }) => code === "mobile-menu-navigation-wait"));
});

test("runner uses real axe and native keyboard without broad suppression", async () => {
  const source = await readFile(path.join(root, "scripts", "qa-phase6-accessibility-interactions.mjs"), "utf8");
  assert.match(source, /import axeCore from "axe-core"/);
  assert.match(source, /window\.axe\.run\(document\.documentElement/);
  assert.doesNotMatch(source, /disableRules|rules:\s*\{|exclude:\s*\[/);
  assert.match(source, /page\.keyboard\.press\("Tab"\)/);
  assert.match(source, /page\.keyboard\.press\("Shift\+Tab"\)/);
  assert.match(source, /waitForActiveElementFullyVisible/);
  assert.match(source, /polling:\s*50,\s*timeout:\s*Math\.min\(timeoutMs,\s*5_000\)/);
  assert.match(source, /waitForInteractionReady/);
  assert.match(source, /window\.quantumPhase4\?\.mode === "enhanced"/);
  assert.doesNotMatch(source, /waitForTimeout\(180\)/);
  assert.match(source, /prepareHomeHeaderNavigation/);
  assert.match(source, /page\.mouse\.wheel\(0, 1_200\)/);
  assert.match(source, /waitForURL\([\s\S]{0,200}waitUntil:\s*"commit"/);
  assert.match(source, /navigationFocus\.href === "\/#entry"/);
  assert.match(source, /page\.keyboard\.press\("Escape"\)/);
  assert.match(source, /MENU_REPEAT_CYCLES/);
  assert.match(source, /assertFreshExternalOutput/);
  assert.doesNotMatch(source, /scrollTo\s*\(|scrollIntoView\s*\(|\.scrollTop\s*=/);
  assert.match(source, /const invokedDirectly =/);
});
