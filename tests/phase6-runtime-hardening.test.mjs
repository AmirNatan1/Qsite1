import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import ts from "typescript";

const root = process.cwd();
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

function loadCinematicRuntime() {
  const filename = path.join(root, "src", "scripts", "home-cinematic-integration.ts");
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("module", "exports", output)(module, module.exports);
  return module.exports;
}

test("Phase 6 homepage bootstrap keeps its fail-open watchdog through controller initialization", () => {
  const source = read("src/pages/index.astro");
  assert.match(source, /__quantumHomeControllerWatchdog\s*=\s*window\.setTimeout/);
  assert.match(source, /const preserveRunway = window\.scrollY !== 0[\s\S]*?window\.location\.hash === "#entry"[\s\S]*?cinematicEntryIntent === "pending"/);
  assert.match(source, /cinematicMode = preserveRunway \? "enhanced" : "static"/);
  assert.match(source, /cinematicFallback = preserveRunway[\s\S]*?"controller-timeout"[\s\S]*?removeAttribute\("inert"\)/);
  assert.match(source, /"controller-timeout-preserve-runway"[\s\S]*?"failed-preserve-runway"[\s\S]*?manifestoReveal = "resolved"/);
  assert.match(source, /const clearControllerWatchdog = \(\) => \{[\s\S]*?window\.clearTimeout\(controllerWatchdog\)/);
  assert.match(source, /const controllerTimeoutIsTerminal = \(\) => root\.dataset\.cinematicFallback === "controller-timeout"[\s\S]*?"controller-timeout-preserve-runway"/);
  assert.match(source, /import\("\.\.\/scripts\/home-cinematic-integration"\)[\s\S]*?if \(controllerTimeoutIsTerminal\(\)\) return;[\s\S]*?initHomeCinematicIntegration\(\);[\s\S]*?clearControllerWatchdog\(\);/);
  assert.match(source, /\.catch\(\(\) => \{[\s\S]*?clearControllerWatchdog\(\);[\s\S]*?if \(controllerTimeoutIsTerminal\(\)\) return;/);
  assert.match(source, /\} else clearControllerWatchdog\(\);/);
  assert.doesNotMatch(source, /setInterval|scrollTo\(|scrollIntoView\(|\.scrollTop\s*=/);
});

test("Phase 6 cinematic mapping resolves positive fractions and the square portrait cohort", () => {
  const {
    chooseFamily,
    conceptualCoordinateForScroll,
    physicalFrameFor,
  } = loadCinematicRuntime();
  assert.equal(chooseFamily(800, 800), "portrait");
  assert.equal(chooseFamily(800, 799), "desktop");
  assert.equal(physicalFrameFor(conceptualCoordinateForScroll(0, 4_000, "desktop", false)), 1);
  assert.equal(physicalFrameFor(conceptualCoordinateForScroll(-0.25, 4_000, "desktop", false)), 1);
  for (const offset of [0.01, 0.1, 0.49]) {
    assert.equal(physicalFrameFor(conceptualCoordinateForScroll(offset, 4_000, "desktop", false)), 46);
  }
});

test("Phase 6 cinematic failures collapse only at a safe top and release failed entry intent", () => {
  const {
    canCollapseCinematicAtFailure,
    cinematicFailureDisposition,
  } = loadCinematicRuntime();
  assert.equal(canCollapseCinematicAtFailure(0, "", undefined), true);
  assert.equal(canCollapseCinematicAtFailure(-1, "", undefined), true, "top overscroll is still the safe top");
  assert.equal(canCollapseCinematicAtFailure(0.01, "", undefined), false);
  assert.equal(canCollapseCinematicAtFailure(0, "#entry", "pending"), false);
  assert.equal(canCollapseCinematicAtFailure(0, "", "pending"), false);
  assert.equal(cinematicFailureDisposition("media", true, true), "static");
  assert.equal(cinematicFailureDisposition("media", true, false), "preserve-runway");

  const source = read("src/scripts/home-cinematic-integration.ts");
  const styles = read("src/styles/routes/home-cinematic.css");
  assert.match(source, /semanticEntryNavigationResolved[\s\S]*?window\.scrollY >= entryTop - headerHeight - 1[\s\S]*?mediaFailed \|\| \(mediaReady && presentedPhysicalFrame === targetPhysicalFrame\)[\s\S]*?delete root\.dataset\.cinematicEntryIntent/);
  assert.match(source, /if \(manifestoSettled\) \{[\s\S]{0,100}entry\.removeAttribute\("inert"\);[\s\S]{0,100}fieldMapThreshold\.removeAttribute\("inert"\);/);
  assert.match(styles, /data-cinematic-mode="static"\]\[data-cinematic-fallback\][\s\S]*?margin-top:\s*calc\(-1 \* var\(--cinematic-header-px\)\)/);
  assert.match(styles, /data-cinematic-mode="static"\]\[data-cinematic-fallback\][\s\S]*?\.cinematic-runway[\s\S]*?height:\s*100svh/);
});

test("Phase 6 Maradin media teardown survives BFCache and recovers failures", () => {
  const source = read("src/scripts/routes/maradin-documentary.ts");
  assert.match(source, /const abortController = new AbortController\(\)/);
  assert.match(source, /video\.play\(\)\.catch\(\(\) => release\(player\)\)/);
  assert.match(source, /addEventListener\("error", \(\) => release\(player\), \{ signal \}\)/);
  assert.match(source, /visibilitychange[\s\S]*?document\.hidden[\s\S]*?releaseAll\(\)/);
  assert.match(source, /pagehide[\s\S]*?releaseAll\(\)[\s\S]*?if \(!event\.persisted\) abortController\.abort\(\)/);
  assert.doesNotMatch(source, /pagehide[\s\S]{0,180}once:\s*true/);
  assert.doesNotMatch(source, /beforeunload|unload|setInterval|requestAnimationFrame/);
});

test("Phase 7A controls use the semantic destination, exact Q, and accessible Field Map", () => {
  const header = read("src/components/SiteHeader.astro");
  const footer = read("src/components/SiteFooter.astro");
  const notFound = read("src/components/routes/error/NotFoundExperience.astro");
  for (const source of [header, footer]) assert.match(source, /quantum-icon-white\.svg/);
  assert.match(header, /const HOME_HREF = "\/#entry"/);
  assert.match(header, /<details class="field-map"/);
  assert.match(header, /event\.key === "Escape"/);
  assert.match(header, /trigger\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(footer, /class="site-footer__return" href="\/#entry"/);
  assert.match(notFound, /<a href="\/#entry">Return to the signal origin<\/a>/);
});

test("Phase 7A source verifier is deny-by-default for superseded paths and frozen authorities", () => {
  const verifier = read("scripts/verify-phase7a-source.mjs");
  assert.match(verifier, /DELETED_PRODUCTION_PATHS/);
  assert.match(verifier, /PHYSICAL_ASSETS/);
  assert.match(verifier, /MARADIN_FROZEN_PATHS/);
  assert.match(verifier, /first Phase 7A commit must descend directly/);
  assert.match(verifier, /no production runtime dependency may be added/);
});
