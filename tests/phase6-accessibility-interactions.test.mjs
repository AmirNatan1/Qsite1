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
    first,
    forwardFirst,
    forwardSecond: focused("a|/two|Two"),
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
  const engine = {
    axe: Array.from({ length: 20 }, () => ({})),
    engine: "webkit",
    history: {},
    keyboard: Array.from({ length: 10 }, () => ({})),
    mobileMenu: { cycles: Array.from({ length: MENU_REPEAT_CYCLES }, () => ({})) },
    status: "PASS",
  };
  const report = {
    axeOnly: false,
    engine: "webkit",
    engines: [engine],
    failures: [],
    routes: PHASE6_ROUTES,
    schema: SCHEMA,
    selectedEngines: ["webkit"],
    status: "PASS",
    summary: { axeExpected: 20, seriousCritical: 0 },
    viewports: ACCESSIBILITY_VIEWPORTS,
  };
  assert.equal(validateReport(report), true);
  assert.equal(runSelfTest().status, "PASS");
});

test("runner uses real axe and native keyboard without broad suppression", async () => {
  const source = await readFile(path.join(root, "scripts", "qa-phase6-accessibility-interactions.mjs"), "utf8");
  assert.match(source, /import axeCore from "axe-core"/);
  assert.match(source, /window\.axe\.run\(document\.documentElement/);
  assert.doesNotMatch(source, /disableRules|rules:\s*\{|exclude:\s*\[/);
  assert.match(source, /page\.keyboard\.press\("Tab"\)/);
  assert.match(source, /page\.keyboard\.press\("Shift\+Tab"\)/);
  assert.match(source, /waitForURL\([\s\S]{0,200}waitUntil:\s*"commit"/);
  assert.match(source, /page\.keyboard\.press\("Escape"\)/);
  assert.match(source, /MENU_REPEAT_CYCLES/);
  assert.match(source, /assertFreshExternalOutput/);
  assert.doesNotMatch(source, /scrollTo\s*\(|scrollIntoView\s*\(|\.scrollTop\s*=/);
  assert.match(source, /const invokedDirectly =/);
});
