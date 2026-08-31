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

function focused(key = "a|/target|Target") {
  return {
    classes: [],
    focusVisible: true,
    href: "/target",
    key,
    outlineStyle: "solid",
    outlineWidth: "2px",
    rect: { bottom: 80, height: 44, left: 10, right: 110, top: 36, width: 100 },
    selector: "a.target",
    tag: "a",
    text: "Target",
    visible: true,
  };
}

function desktopHome(routePath) {
  return {
    activationError: null,
    arrival: { entryInert: false, hash: "#entry", manifestoReveal: "resolved", path: "/", route: "/#entry" },
    back: { entryInert: false, hash: "", manifestoReveal: "resolved", path: routePath, route: routePath },
    backError: null,
    focus: { ...focused("a|/#entry|Home"), href: "/#entry" },
    forward: { entryInert: false, hash: "#entry", manifestoReveal: "resolved", path: "/", route: "/#entry" },
    forwardError: null,
  };
}

function keyboardRow(engine, route) {
  const expectedHash = route.id === "home" ? "#entry" : "#main-content";
  const forwardFirst = route.id === "home"
    ? { ...focused("a|/for-partners/|For partners"), classes: ["audience-trajectory"], href: "/for-partners/" }
    : focused("a|/one|One");
  const forwardSecond = route.id === "home"
    ? { ...focused("a|/for-startups/|For startups"), classes: ["audience-trajectory"], href: "/for-startups/" }
    : focused("a|/two|Two");
  const record = {
    afterActivation: { activeId: expectedHash.slice(1), hash: expectedHash, targetVisible: true },
    backward: { ...forwardFirst },
    desktopHome: desktopHome(route.path),
    engine,
    expectedHash,
    first: { ...focused(`a|${expectedHash}|Skip to content`), classes: ["skip-link"], href: expectedHash },
    forwardFirst,
    forwardSecond,
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
    engine,
    escapeClose: { ...closed },
    firstMenuLink: focused("a|/#entry|Home"),
    navigation: {
      activationError: null,
      arrival: { activeIsTrigger: false, ariaExpanded: "false", hash: "#entry", open: false, path: "/" },
      back: { ...closed },
      backError: null,
      focus: { ...focused("a|/#entry|Home"), href: "/#entry" },
    },
    ordinaryClose: { ...closed },
    ordinaryOpen: { ...open },
    triggerFocus: focused("summary||Menu"),
  };
  record.failures = mobileMenuFailures(record);
  record.status = record.failures.length ? "FAIL" : "PASS";
  return record;
}

function historyRow(engine) {
  const record = {
    back: { entryAlignmentDelta: null, hash: "", path: "/", scrollY: 0 },
    bare: { entryAlignmentDelta: null, hash: "", path: "/", scrollY: 0 },
    engine,
    entry: { entryAlignmentDelta: 0, hash: "#entry", path: "/", scrollY: 4200 },
    forward: { entryAlignmentDelta: 0, hash: "#entry", path: "/", scrollY: 4200 },
  };
  record.failures = historyFailures(record);
  record.status = record.failures.length ? "FAIL" : "PASS";
  return record;
}

function validReport(engine = "webkit", { axeOnly = false } = {}) {
  const routes = PHASE6_ROUTES.map(({ expectedStatus, id, path: routePath }) => ({ expectedStatus, id, path: routePath }));
  const axe = ACCESSIBILITY_VIEWPORTS.flatMap((viewport) => routes.map((route) => ({
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
    browser: { engine, executable: `${engine}.exe`, headed: false, version: "1" },
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
    baseUrl: "http://127.0.0.1:4338/",
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
    afterActivation: { activeId: "main-content", hash: "#main-content", targetVisible: true },
    backward: { ...forwardFirst },
    expectedHash: "#main-content",
    desktopHome: desktopHome("/about/"),
    first,
    forwardFirst,
    forwardSecond: focused("a|/two|Two"),
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

test("mobile-menu validator requires close, Escape focus return and every repeat cycle", () => {
  const closed = { activeIsTrigger: true, ariaExpanded: "false", hash: "", open: false, path: "/about/" };
  const open = { activeIsTrigger: true, ariaExpanded: "true", hash: "", open: true, path: "/about/" };
  const record = {
    cycles: Array.from({ length: MENU_REPEAT_CYCLES }, () => ({ close: { ...closed }, open: { ...open } })),
    escapeClose: { ...closed },
    firstMenuLink: focused("a|/#entry|Home"),
    navigation: {
      arrival: { activeIsTrigger: false, ariaExpanded: "false", hash: "#entry", open: false, path: "/" },
      back: { ...closed },
      focus: { ...focused("a|/#entry|Home"), href: "/#entry" },
    },
    ordinaryClose: { ...closed },
    ordinaryOpen: { ...open },
    triggerFocus: focused("summary||Menu"),
  };
  assert.deepEqual(mobileMenuFailures(record), []);
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
    firstMenuLink: focused("a|/#entry|Home"),
    navigation: {
      arrival: { ...open },
      back: null,
      focus: { ...focused("body||"), focusVisible: false, href: null, tag: "body", visible: true },
    },
    ordinaryClose: { ...closed },
    ordinaryOpen: { ...open },
    triggerFocus: focused("summary||Menu"),
  };
  const codes = mobileMenuFailures(record).map(({ code }) => code);
  assert.ok(codes.includes("mobile-menu-navigation-focus"));
  assert.ok(codes.includes("mobile-menu-navigation"));
  assert.ok(codes.includes("mobile-menu-history-return"));
});

test("history validator distinguishes bare Home from same-document #entry", () => {
  const record = {
    back: { hash: "", path: "/", scrollY: 0 },
    bare: { hash: "", path: "/", scrollY: 0 },
    entry: { entryAlignmentDelta: 0, hash: "#entry", path: "/", scrollY: 4200 },
    forward: { hash: "#entry", path: "/", scrollY: 4200 },
  };
  assert.deepEqual(historyFailures(record), []);
  record.forward.hash = "";
  assert.deepEqual(historyFailures(record).map(({ code }) => code), ["same-document-forward"]);
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
  assert.equal(runSelfTest().status, "PASS");
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
  assert.match(source, /waitForURL\([\s\S]{0,200}waitUntil:\s*"commit"/);
  assert.match(source, /navigationFocus\.href === "\/#entry"/);
  assert.match(source, /page\.keyboard\.press\("Escape"\)/);
  assert.match(source, /MENU_REPEAT_CYCLES/);
  assert.match(source, /assertFreshExternalOutput/);
  assert.doesNotMatch(source, /scrollTo\s*\(|scrollIntoView\s*\(|\.scrollTop\s*=/);
  assert.match(source, /const invokedDirectly =/);
});
