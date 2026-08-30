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

test("Phase 6 homepage bootstrap has a bounded outer-module fail-open watchdog", () => {
  const source = read("src/pages/index.astro");
  assert.match(source, /__quantumHomeControllerWatchdog\s*=\s*window\.setTimeout/);
  assert.match(source, /cinematicFallback\s*=\s*"controller-timeout"/);
  assert.match(source, /cinematicMode\s*=\s*"static"[\s\S]*?removeAttribute\("inert"\)/);
  assert.match(source, /window\.clearTimeout\(controllerWatchdog\)[\s\S]*?cinematicController\s*=\s*"claimed"/);
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

test("Phase 6 home controls use the semantic destination and ratio-correct logo", () => {
  const header = read("src/components/SiteHeader.astro");
  const footer = read("src/components/SiteFooter.astro");
  const notFound = read("src/components/routes/error/NotFoundExperience.astro");
  for (const source of [header, footer]) {
    assert.match(source, /width="242"[\s\S]*?height="182"/);
  }
  assert.match(footer, /class="brand-link" href="\/#entry"/);
  assert.match(notFound, /class="recovery-link" href="\/#entry"/);
});
