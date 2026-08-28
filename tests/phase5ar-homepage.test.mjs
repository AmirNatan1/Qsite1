import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), "utf8");

test("Phase 5A-R makes the manifesto the sole post-CRT H1 and routes audiences afterward", async () => {
  const source = await read("src/components/home/EntryField.astro");
  const h1s = [...source.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
  assert.equal(h1s.length, 1);
  assert.equal(h1s[0][1].replace(/\{["']\s+["']\}/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), "We turn industrial needs into field evidence.");
  assert.doesNotMatch(source, /Where do you enter\?/i);

  const manifestoStart = source.indexOf('id="entry"');
  const manifestoEnd = source.indexOf("</section>", manifestoStart);
  const routingStart = source.indexOf('id="audience-routing"');
  assert.ok(manifestoStart >= 0 && manifestoEnd > manifestoStart && routingStart > manifestoEnd);
  const manifesto = source.slice(manifestoStart, manifestoEnd);
  assert.match(manifesto, /data-manifesto-threshold/);
  assert.doesNotMatch(manifesto, /<p\b|<a\b|<nav\b|<img\b|<svg\b|field-label|audience-trajectory/);

  for (const [href, copy] of [
    ["/for-partners/", "Bring us an operational challenge."],
    ["/for-startups/", "Bring us a technology ready to be tested."],
  ]) {
    assert.match(source.slice(routingStart), new RegExp(`href="${href.replaceAll("/", "\\/")}"`));
    assert.ok(source.slice(routingStart).includes(copy));
  }
  assert.doesNotMatch(source, /class="[^"]*(?:card|button|modal|column)[^"]*"/i);
});

test("Phase 5A-R manifesto uses normal-flow hold, anchored reveal, and reversible chrome threshold", async () => {
  const [cinematicCss, homeCss, responsiveCss, controller] = await Promise.all([
    read("src/styles/routes/home-cinematic.css"),
    read("src/styles/routes/home.css"),
    read("src/styles/routes/home-responsive.css"),
    read("src/scripts/home-cinematic-integration.ts"),
  ]);

  assert.match(cinematicCss, /min-height:\s*calc\(170svh - var\(--cinematic-header-px\)\)/);
  assert.match(cinematicCss, /top:\s*calc\(var\(--manifesto-anchor-px\) - var\(--cinematic-header-px\)\)/);
  assert.match(cinematicCss, /opacity:\s*var\(--cinematic-semantic\)/);
  assert.doesNotMatch(`${cinematicCss}\n${homeCss}`, /\.manifesto-field[^}]*position:\s*sticky/);
  assert.doesNotMatch(`${cinematicCss}\n${homeCss}\n${responsiveCss}`, /scroll-snap-(?:type|align|stop)\s*:/i);
  assert.match(homeCss, /\.manifesto-field__content[\s\S]*?padding-top:\s*clamp\(3\.5rem, 10svh, 7rem\)/);
  assert.match(responsiveCss, /padding-top:\s*clamp\(3\.2rem, 9svh, 5\.5rem\)/);
  assert.match(responsiveCss, /padding-top:\s*clamp\(1\.35rem, 7svh, 2\.7rem\)/);

  assert.match(controller, /--manifesto-anchor-px["'`],\s*`\$\{Math\.min\(0, currentScrollOffset - scrollExtent\)/);
  assert.match(controller, /navigationReleasePoint\s*=\s*audienceTop\s*-\s*window\.innerHeight/);
  assert.match(controller, /setThresholdInteraction\(settled, navigationReleased\)/);
  assert.match(controller, /setThresholdInteraction\(true, false\)/);
  assert.match(controller, /downstreamFields[\s\S]*?field\.setAttribute\("inert"/);
  assert.match(controller, /version:\s*4, settledOrLower/);
});

test("Phase 5A-R keeps static fallback semantics and the accepted physical mapping authority", async () => {
  const [index, controller] = await Promise.all([
    read("src/pages/index.astro"),
    read("src/scripts/home-cinematic-integration.ts"),
  ]);

  assert.match(index, /skipHref="\#entry"/);
  assert.match(index, /const candidate = capable && !reduced && !directDeepLink && !restoredSettled && !textZoomUnsafe/);
  assert.match(index, /downstreamFields\.forEach\(\(field\) => field\.toggleAttribute\("inert", concealed\)\)/);
  assert.match(index, /querySelectorAll\("\[data-field-section\]"\)\.forEach\(\(field\) => field\.removeAttribute\("inert"\)\)/);
  assert.match(controller, /PHYSICAL_FRAME_COUNT = 500/);
  assert.match(controller, /BLACK_START_U = 500/);
  assert.match(controller, /ENTRY_START_U = 513/);
  assert.match(controller, /CONCEPTUAL_FRAME_COUNT = 540/);
  assert.match(controller, /id: "entry-reveal", startU: 513, endU: CONCEPTUAL_FRAME_COUNT/);
  assert.equal((controller.match(/video\.play\(/g) ?? []).length, 0);
});
