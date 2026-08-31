import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  ACCESSIBILITY_VIEWPORTS,
  REQUIRED_VIEWPORTS,
  ROUTES,
  SCHEMA,
  TEXT_200_PROXY,
  layoutFailures,
  parseArguments,
  validateReport,
} from "../scripts/qa-phase5b-responsive-accessibility.mjs";

const root = path.resolve(import.meta.dirname, "..");

function observation(route = ROUTES[0], viewport = REQUIRED_VIEWPORTS[0]) {
  return {
    acts: Array.from({ length: route.acts }, (_unused, index) => ({ id: String(index), textLength: 20, visible: true })),
    architecture: "fixture",
    brokenLabelledBy: [],
    clippedText: [],
    duplicateIds: [],
    h1: { clippedBy: [], count: 1, rect: { left: 20, top: 100, right: 500, bottom: 300 }, text: "Fixture", visible: true },
    horizontalOutliers: [],
    horizontalOverflow: 0,
    mainCount: 1,
    reducedMotion: false,
    regions: route.regions,
    route: route.id,
    runningAnimations: [],
    skipLinkValid: true,
    smallTargets: [],
    viewport,
  };
}

test("CP7 QA freezes nine routes, thirteen responsive sizes, two axe sizes and the 200% proxy", () => {
  assert.equal(ROUTES.length, 9);
  assert.equal(REQUIRED_VIEWPORTS.length, 13);
  assert.deepEqual(REQUIRED_VIEWPORTS.map(({ id }) => id), [
    "1440x900", "1366x650", "1280x800", "1024x768", "768x1024", "390x844", "360x800",
    "320x800", "844x390", "740x360", "800x360", "896x414", "900x480",
  ]);
  assert.deepEqual(ACCESSIBILITY_VIEWPORTS.map(({ id }) => id), ["desktop-1440x900", "portrait-390x844"]);
  assert.deepEqual(TEXT_200_PROXY, { id: "text-200-proxy-720x450", width: 720, height: 450 });
});

test("CP7 CLI binds an exact preview, HEAD and external report intent", () => {
  const sha = "1".repeat(40);
  const parsed = parseArguments(["--base-url", "http://127.0.0.1:4338", "--expected-head", sha, "--output", "../phase-5b-work/cp7.json", "--timeout-ms", "5000"]);
  assert.equal(parsed.baseUrl, "http://127.0.0.1:4338/");
  assert.equal(parsed.expectedHead, sha);
  assert.match(parsed.output, /phase-5b-work[\\/]cp7\.json$/);
  assert.throws(() => parseArguments(["--expected-head", "short"]), /full 40-character/);
});

test("CP7 layout validator catches fold, overflow, clipping and target regressions", () => {
  const route = ROUTES[0];
  const record = observation(route, { id: "fixture", width: 320, height: 360 });
  record.h1.rect.bottom = 390;
  record.horizontalOverflow = 10;
  record.clippedText = [{ selector: "h1", ancestor: ".route" }];
  record.smallTargets = [{ selector: "a", rect: { width: 20, height: 20 } }];
  const codes = layoutFailures(record, route, { requireH1InFirstViewport: true }).map(({ code }) => code);
  assert.ok(codes.includes("h1-first-viewport"));
  assert.ok(codes.includes("horizontal-overflow"));
  assert.ok(codes.includes("clipped-text"));
  assert.ok(codes.includes("target-size"));
});

test("CP7 report validator requires complete matrices and zero serious/critical axe findings", () => {
  const responsive = Array.from({ length: ROUTES.length * REQUIRED_VIEWPORTS.length }, () => ({}));
  const axe = Array.from({ length: ROUTES.length * ACCESSIBILITY_VIEWPORTS.length }, () => ({}));
  const keyboard = Array.from({ length: ROUTES.length * ACCESSIBILITY_VIEWPORTS.length }, () => ({}));
  const mobileNavigation = Array.from({ length: ROUTES.length }, () => ({}));
  const variants = [
    { viewports: ACCESSIBILITY_VIEWPORTS, records: Array.from({ length: 18 }, () => ({})) },
    { viewports: ACCESSIBILITY_VIEWPORTS, records: Array.from({ length: 18 }, () => ({})) },
    { viewports: [TEXT_200_PROXY], records: Array.from({ length: 9 }, () => ({})) },
    { viewports: [TEXT_200_PROXY], records: Array.from({ length: 9 }, () => ({})) },
  ];
  const report = { schema: SCHEMA, status: "PASS", routes: ROUTES, responsive, axe, keyboard, mobileNavigation, variants, failures: [], summary: { seriousCriticalAxe: 0 } };
  assert.equal(validateReport(report), true);
  assert.throws(() => validateReport({ ...report, summary: { seriousCriticalAxe: 1 } }), /serious\/critical/);
});

test("CP7 executable uses actual axe, native keyboard, static variants and external-only output", async () => {
  const source = await readFile(path.join(root, "scripts", "qa-phase5b-responsive-accessibility.mjs"), "utf8");
  assert.match(source, /axe-core["'], "axe\.min\.js/);
  assert.match(source, /window\.axe\.run/);
  assert.match(source, /page\.keyboard\.press\("Tab"\)/);
  assert.match(source, /javaScriptEnabled: variant\.javaScriptEnabled/);
  assert.match(source, /reducedMotion: variant\.reducedMotion/);
  assert.match(source, /context\.route\(\/\\\/fonts/);
  assert.match(source, /output must remain external and untracked/);
  assert.match(source, /seriousCriticalAxe/);
});

test("Phase 7A production remains bound to semantic hiding, neutral shells, and authored fallbacks", async () => {
  const [globalCss, shellCss, maradinCss, signalCss, signalSource] = await Promise.all([
    readFile(path.join(root, "src", "styles", "global.css"), "utf8"),
    readFile(path.join(root, "src", "styles", "routes", "phase-7a-semantic-shell.css"), "utf8"),
    readFile(path.join(root, "src", "styles", "routes", "maradin.css"), "utf8"),
    readFile(path.join(root, "src", "styles", "routes", "phase-7a-signal-field.css"), "utf8"),
    readFile(path.join(root, "src", "scripts", "signal-field.ts"), "utf8"),
  ]);
  assert.match(globalCss, /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  assert.match(shellCss, /\.semantic-shell/);
  assert.match(shellCss, /@media \(max-width:\s*48rem\)/);
  assert.match(shellCss, /@media \(max-height:\s*30rem\).*orientation:\s*landscape/s);
  assert.doesNotMatch(shellCss, /@keyframes|animation\s*:|transition\s*:/, "neutral shells are already static in reduced motion");
  assert.match(maradinCss, /\.maradin-act__count[^}]*rgba\(231, 223, 212, 0\.64\)/);
  assert.match(maradinCss, /\.maradin-player--aperture \.maradin-player__launch\s*\{\s*bottom:\s*auto;\s*top:\s*5rem/);
  assert.match(maradinCss, /\.maradin-player--aperture \.maradin-player__launch\s*\{\s*bottom:\s*5rem/);
  assert.match(signalCss, /prefers-reduced-motion:\s*reduce/);
  assert.match(signalCss, /@media \(max-width:\s*25rem\)/);
  assert.match(signalSource, /requestAnimationFrame\(write\)/);
  assert.doesNotMatch(signalSource, /setInterval|scroll(?:To|By|IntoView)\s*\(|\.scrollTop\s*=/);
});
