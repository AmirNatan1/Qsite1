import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { PUBLIC_ROUTES } from "../scripts/phase7a-contract.mjs";
import {
  verifyPhase7CMarkup,
  verifyPhase7COutput,
  verifyPhase7CStyles,
} from "../scripts/verify-phase7c-output.mjs";

const governedMarkup = `<!doctype html>
<html><body><main><h1>We turn industrial needs into field evidence.</h1>
<section data-territory-traverse data-territory-mode="static" data-territory-state="release" data-territory-projection="settled" data-field-section aria-labelledby="territory-title">
  <h2 id="territory-title">One carrier. Four operating conditions.</h2>
  <div class="territory-world__visual" aria-hidden="true"><svg aria-hidden="true" focusable="false"><path data-territory-carrier d="M0 0L1 0"></path></svg></div>
  <section data-territory-stage="automotive" aria-labelledby="automotive-title"><h3 id="automotive-title">Automotive &amp; Mobility</h3><div data-territory-static="automotive" aria-hidden="true"></div></section>
  <section data-territory-stage="logistics" aria-labelledby="logistics-title"><h3 id="logistics-title">Logistics &amp; Supply Chain</h3><div data-territory-static="logistics" aria-hidden="true"></div></section>
  <section data-territory-stage="manufacturing" aria-labelledby="manufacturing-title"><h3 id="manufacturing-title"><span>Industry 4.0 /</span><span>Advanced</span><span>Manufacturing</span></h3><div data-territory-static="manufacturing" aria-hidden="true"></div></section>
  <section data-territory-stage="energy" aria-labelledby="energy-title"><h3 id="energy-title">Energy &amp; Infrastructure</h3><div data-territory-static="energy" aria-hidden="true"></div></section>
  <section data-territory-stage="proof" data-proof-threshold data-proof-record="maradin" aria-labelledby="proof-title">
    <h3 id="proof-title">Maradin &mdash; Dynamic Ground Projection</h3>
    <img src="/media/maradin/maradin-field-aperture-poster-approved.jpg" width="1920" height="1080" loading="lazy" alt="A vehicle on a road at night in a real field environment.">
    <a href="/pocs/maradin/">Open the field record</a>
  </section>
</section></main></body></html>`;

const governedCss = `
.territory-world .territory-world__visual{display:none}
.territory-world .territory-static{display:block}
.territory-world[data-territory-mode="enhanced"] .territory-world__visual{display:block}
.territory-world[data-territory-mode="enhanced"] .territory-static{display:none}
.territory-world .territory-proof__link{min-width:44px;min-height:44px}
@media (prefers-reduced-motion:reduce){.territory-world[data-territory-mode="enhanced"] .territory-static{display:block}}
@media (min-width:40.001rem) and (max-height:30rem) and (orientation:landscape){.territory-world .territory-static{display:block}}
@media (max-width:40rem){.territory-world .territory-static{display:block}}
`;

test("the governed fixture exposes four territories, one carrier and one truthful Proof record", () => {
  const report = verifyPhase7CMarkup(governedMarkup);
  assert.deepEqual(report.territories, [
    "Automotive & Mobility",
    "Logistics & Supply Chain",
    "Industry 4.0 / Advanced Manufacturing",
    "Energy & Infrastructure",
  ]);
  assert.equal(report.territoryRoots, 1);
  assert.equal(report.carrierPaths, 1);
  assert.equal(report.decorativeSvgs, 1);
  assert.equal(report.staticFallbacks, 4);
  assert.equal(report.proofRecords, 1);
  assert.equal(report.proofRecord, "Maradin — Dynamic Ground Projection");
  assert.equal(report.mediaPlayers, 0);
  assert.equal(report.poster.meaningfulAlt, true);
});

test("markup authority fails closed on replacement scenes, added records, media and invalid semantics", () => {
  assert.throws(
    () => verifyPhase7CMarkup(governedMarkup.replace("</svg>", '<path data-territory-carrier d="M0 1L1 1"></path></svg>')),
    /one persistent Territory Carrier/,
  );
  assert.throws(
    () => verifyPhase7CMarkup(governedMarkup.replace("data-proof-record=\"maradin\"", 'data-proof-record="maradin" data-proof-record="invented"')),
    /exactly one Proof record/,
  );
  assert.throws(
    () => verifyPhase7CMarkup(governedMarkup.replace("<a href=", "<video></video><a href=")),
    /media player or source set/,
  );
  assert.throws(
    () => verifyPhase7CMarkup(governedMarkup.replace('aria-labelledby="energy-title"', 'aria-labelledby="missing-title"')),
    /does not resolve uniquely/,
  );
  assert.throws(
    () => verifyPhase7CMarkup(governedMarkup.replace("A vehicle on a road at night in a real field environment.", "image")),
    /meaningful alternative text|generic/,
  );
});

test("built CSS contract proves static, enhanced, reduced-motion, mobile and short-landscape modes", () => {
  assert.deepEqual(verifyPhase7CStyles(governedCss), {
    namespaced: true,
    authoredStaticDefault: true,
    enhancedBoundedVisual: true,
    reducedMotionFallback: true,
    mobileFallback: true,
    shortLandscapeFallback: true,
  });
  assert.throws(
    () => verifyPhase7CStyles(governedCss.replace(".territory-world .territory-static{display:block}\n", "")),
    /visible by default/,
  );
  assert.throws(
    () => verifyPhase7CStyles(governedCss.replace("@media (prefers-reduced-motion:reduce)", "@media (prefers-reduced-motion:no-preference)")),
    /reduced-motion authority/,
  );
});

test("the assembled verifier retains all nine routes in an isolated output fixture", async () => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "phase7c-output-"));
  try {
    const dist = path.join(fixtureRoot, "dist");
    await mkdir(path.join(dist, "_astro"), { recursive: true });
    await writeFile(path.join(dist, "index.html"), governedMarkup, "utf8");
    await writeFile(path.join(dist, "_astro", "site.css"), governedCss, "utf8");
    for (const authority of PUBLIC_ROUTES.slice(1)) {
      const filename = path.join(dist, authority.file);
      await mkdir(path.dirname(filename), { recursive: true });
      await writeFile(filename, `<h1>${authority.h1}</h1>`, "utf8");
    }

    const inheritedVerifier = async () => ({
      status: "PASS",
      inheritedPhase7AStatus: "PASS",
    });
    const report = await verifyPhase7COutput(fixtureRoot, { inheritedVerifier });
    assert.equal(report.status, "PASS");
    assert.equal(report.inheritedPhase7BStatus, "PASS");
    assert.equal(report.routes.length, 9);
    assert.deepEqual(report.routes.map(({ route }) => route), PUBLIC_ROUTES.map(({ route }) => route));
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

const liveHome = path.join(process.cwd(), "dist", "index.html");
const liveDistReady = existsSync(liveHome)
  && readFileSync(liveHome, "utf8").includes("data-territory-traverse");

test(
  "the current live dist satisfies inherited Phase 7B and additive Phase 7C output authority",
  { skip: liveDistReady ? false : "build Phase 7C before running the optional live-dist assertion" },
  async () => {
    const report = await verifyPhase7COutput();
    assert.equal(report.status, "PASS");
    assert.equal(report.inheritedPhase7BStatus, "PASS");
    assert.equal(report.inheritedPhase7AStatus, "PASS");
    assert.equal(report.routes.length, 9);
    assert.equal(report.staticFallbacks, 4);
    assert.equal(report.mediaPlayers, 0);
  },
);

