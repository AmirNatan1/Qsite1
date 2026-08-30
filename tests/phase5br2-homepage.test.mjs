import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), "utf8");

const sourceSlice = (source, start, end) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `source start marker is absent: ${start}`);
  assert.ok(endIndex > startIndex, `source end marker is absent after ${start}: ${end}`);
  return source.slice(startIndex, endIndex);
};

const isPlainPrimaryActivation = (event = {}) => !(
  event.defaultPrevented
  || (event.button ?? 0) !== 0
  || event.metaKey
  || event.ctrlKey
  || event.shiftKey
  || event.altKey
);

test("Phase 5B-R2 sends the brand, desktop Home, and mobile Home to the semantic entry anchor", async () => {
  const header = await read("src/components/SiteHeader.astro");
  assert.match(header, /const HOME_HREF = "\/#entry"/);
  assert.match(header, /\{ href: HOME_HREF, label: "Home" \}/);
  assert.match(header, /<a class="brand-link" href=\{HOME_HREF\} aria-label="Quantum home">/);
  assert.equal((header.match(/navigation\.map/g) ?? []).length, 2, "desktop and mobile navigation must share the semantic Home destination");
  assert.match(header, /const path = href\.split\("#", 1\)\[0\] \|\| "\/"/);
});

test("Phase 5B-R2 navigation and reveal code contains no programmatic scroll write", async () => {
  const source = (await Promise.all([
    read("src/components/SiteHeader.astro"),
    read("src/pages/index.astro"),
    read("src/scripts/home-cinematic-integration.ts"),
  ])).join("\n");
  for (const forbidden of [
    /\bwindow\.scrollTo\s*\(/,
    /\bwindow\.scroll\s*\(/,
    /\.scrollIntoView\s*\(/,
    /\.scrollTo\s*\(/,
    /\.scrollTop\s*=/,
    /\bpreventDefault\s*\(/,
  ]) assert.doesNotMatch(source, forbidden);
  assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie|cookieStore/);
});

test("Phase 5B-R2 autonomous fade is one-shot, transition-driven, reversible, and cancels stale entry", async () => {
  const [controller, cinematicCss] = await Promise.all([
    read("src/scripts/home-cinematic-integration.ts"),
    read("src/styles/routes/home-cinematic.css"),
  ]);
  const revealStart = controller.indexOf("const setManifestoReveal =");
  const revealEnd = controller.indexOf("const measure =", revealStart);
  assert.ok(revealStart > 0 && revealEnd > revealStart);
  const reveal = controller.slice(revealStart, revealEnd);
  assert.match(reveal, /manifestoRevealState = "armed"/);
  assert.match(reveal, /window\.requestAnimationFrame/);
  assert.match(reveal, /manifestoRevealState = "revealing"/);
  assert.match(reveal, /if \(!active\)[\s\S]*?cancelAnimationFrame\(manifestoAnimationFrame\)[\s\S]*?manifestoRevealState = "hidden"/);
  assert.doesNotMatch(reveal, /setTimeout|setInterval|scrollTo|scrollIntoView|scrollTop/);
  assert.match(controller, /transitionend[\s\S]*?event\.propertyName === "opacity"[\s\S]*?resolveManifestoReveal\(\)/);
  assert.match(controller, /const semantic = conceptualCoordinate >= ENTRY_START_U \? 1 : 0/);
  assert.match(controller, /setManifestoReveal\(manifestoActive\)/);
  assert.match(cinematicCss, /opacity 720ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
  assert.doesNotMatch(`${controller}\n${cinematicCss}`, /--cinematic-semantic/);
});

test("Phase 5B-R2 semantic-entry bootstrap is prepaint black yet retains the exact physical runway", async () => {
  const [index, controller, cinematicCss] = await Promise.all([
    read("src/pages/index.astro"),
    read("src/scripts/home-cinematic-integration.ts"),
    read("src/styles/routes/home-cinematic.css"),
  ]);
  assert.match(index, /semanticHomeIntent = window\.location\.hash === "#entry"/);
  assert.match(index, /\(!directDeepLink \|\| semanticHomeIntent\)/);
  assert.match(index, /cinematicEntryIntent = "pending"/);
  assert.match(index, /root\.dataset\.cinematicCohort = initialCohort/);
  assert.match(cinematicCss, /data-cinematic-entry-intent="pending"[\s\S]*?\.cinematic-stage[\s\S]*?visibility:\s*hidden/);
  assert.match(controller, /const maybeReleaseEntryIntentGuard[\s\S]*?semanticEntryNavigationResolved[\s\S]*?mediaReady[\s\S]*?presentedPhysicalFrame === targetPhysicalFrame[\s\S]*?delete root\.dataset\.cinematicEntryIntent/);
  assert.match(controller, /committedTravel = Math\.max\(entryTop - headerHeight - shellTop, 1\)[\s\S]*?--cinematic-travel-px/);
  assert.doesNotMatch(controller, /innerHeight \* travelViewportHeights/);
  assert.match(controller, /a\[href="\/#entry"\][\s\S]*?link\.addEventListener\("click"[\s\S]*?replayManifestoAfterNativeHomeNavigation/);
  assert.match(controller, /event\.defaultPrevented \|\| event\.button !== 0 \|\| event\.metaKey \|\| event\.ctrlKey \|\| event\.shiftKey \|\| event\.altKey/);
  assert.match(controller, /addEventListener\("hashchange"[\s\S]*?replayManifestoAfterNativeHomeNavigation/);
  assert.match(controller, /PHYSICAL_FRAME_COUNT = 500/);
  assert.match(controller, /CONCEPTUAL_FRAME_COUNT = 540/);
  assert.match(controller, /ENTRY_START_U = 513/);
  assert.match(controller, /return shortDesktop \? 5\.95 : 6\.75/);
  assert.match(cinematicCss, /--cinematic-travel-px:\s*675svh/);
  assert.match(cinematicCss, /--cinematic-travel-px:\s*595svh/);
  assert.match(cinematicCss, /--cinematic-travel-px:\s*535svh/);
  assert.match(cinematicCss, /--cinematic-travel-px:\s*560svh/);
});

test("Phase 5B-R2 mutates the current document only for an unmodified primary Home or skip activation", async () => {
  const controller = await read("src/scripts/home-cinematic-integration.ts");
  const activationGuardSource = String.raw`if \(event\.defaultPrevented \|\| event\.button !== 0 \|\| event\.metaKey \|\| event\.ctrlKey \|\| event\.shiftKey \|\| event\.altKey\) return;`;
  const activationGuard = new RegExp(activationGuardSource, "g");
  assert.equal((controller.match(activationGuard) ?? []).length, 2, "Home and skip must share the modified-click guard");

  const homeHandler = sourceSlice(
    controller,
    "for (const link of semanticHomeLinks)",
    'window.addEventListener("hashchange"',
  );
  const skipHandler = sourceSlice(controller, "const handleSkip =", "const loadSelectedMedia =");
  for (const handler of [homeHandler, skipHandler]) {
    assert.match(handler, new RegExp(activationGuardSource));
    assert.doesNotMatch(handler, /preventDefault\s*\(/);
  }

  const cases = [
    { label: "plain primary", event: { button: 0 }, accepted: true },
    { label: "already cancelled", event: { button: 0, defaultPrevented: true }, accepted: false },
    { label: "middle button", event: { button: 1 }, accepted: false },
    { label: "secondary button", event: { button: 2 }, accepted: false },
    { label: "Command click", event: { button: 0, metaKey: true }, accepted: false },
    { label: "Control click", event: { button: 0, ctrlKey: true }, accepted: false },
    { label: "Shift click", event: { button: 0, shiftKey: true }, accepted: false },
    { label: "Alt click", event: { button: 0, altKey: true }, accepted: false },
  ];
  for (const { label, event, accepted } of cases) {
    assert.equal(isPlainPrimaryActivation(event), accepted, label);
  }
});

test("Phase 5B-R2 entry-intent blackout applies only while cinematic enhancement can release it", async () => {
  const cinematicCss = await read("src/styles/routes/home-cinematic.css");
  const guardRule = sourceSlice(
    cinematicCss,
    'html[data-cinematic-mode="candidate"][data-cinematic-entry-intent="pending"]',
    ".home-page .site-header",
  );
  assert.match(guardRule, /html\[data-cinematic-mode="candidate"\]\[data-cinematic-entry-intent="pending"\][\s\S]*?\.cinematic-stage/);
  assert.match(guardRule, /html\[data-cinematic-mode="enhanced"\]\[data-cinematic-entry-intent="pending"\][\s\S]*?\.cinematic-stage/);
  assert.doesNotMatch(guardRule, /(?:^|,)\s*html\[data-cinematic-entry-intent="pending"\]/m);
  assert.match(guardRule, /visibility:\s*hidden/);

  const guardApplies = (mode, intent) => intent === "pending" && ["candidate", "enhanced"].includes(mode);
  assert.equal(guardApplies("candidate", "pending"), true);
  assert.equal(guardApplies("enhanced", "pending"), true);
  assert.equal(guardApplies("static", "pending"), false, "reduced-motion/text-zoom/import failures remain static-visible");
  assert.equal(guardApplies("static", undefined), false, "no-JS source fallback remains visible");
});

test("Phase 5B-R2 controller consumes the prepaint cohort without a second viewport decision", async () => {
  const [index, controller] = await Promise.all([
    read("src/pages/index.astro"),
    read("src/scripts/home-cinematic-integration.ts"),
  ]);
  const controllerCohort = sourceSlice(controller, "const initialCohort =", "const codec =");
  assert.match(controllerCohort, /root\.dataset\.cinematicCohort/);
  assert.match(controllerCohort, /initialCohort === "portrait"[\s\S]*?initialCohort === "landscape"[\s\S]*?: "desktop"/);
  assert.match(controllerCohort, /initialShortDesktop = initialCohort === "short-desktop"/);
  assert.doesNotMatch(controllerCohort, /innerWidth|innerHeight|chooseFamily|matchMedia/);
  assert.match(index, /window\.innerWidth <= 800 && window\.innerHeight >= window\.innerWidth/);
  assert.match(index, /window\.innerWidth <= 900 && window\.innerHeight <= 480 && window\.innerWidth > window\.innerHeight/);
  assert.match(index, /initialFamily === "desktop" && window\.innerHeight < 704/);
  assert.ok(index.indexOf("root.dataset.cinematicCohort = initialCohort") < index.indexOf('root.dataset.cinematicEntryIntent = "pending"'));

  const bootstrapCohort = (width, height) => {
    const family = width <= 800 && height >= width
      ? "portrait"
      : width <= 900 && height <= 480 && width > height
        ? "landscape"
        : "desktop";
    return family === "desktop" && height < 704 ? "short-desktop" : family;
  };
  const controllerProfile = (cohort) => ({
    family: cohort === "portrait" ? "portrait" : cohort === "landscape" ? "landscape" : "desktop",
    shortDesktop: cohort === "short-desktop",
    travelVh: cohort === "portrait" ? 5.35 : cohort === "landscape" ? 5.6 : cohort === "short-desktop" ? 5.95 : 6.75,
  });
  const cases = [
    [1440, 900, "desktop", "desktop", false, 6.75],
    [1366, 650, "short-desktop", "desktop", true, 5.95],
    [1280, 800, "desktop", "desktop", false, 6.75],
    [1024, 768, "desktop", "desktop", false, 6.75],
    [768, 1024, "portrait", "portrait", false, 5.35],
    [390, 844, "portrait", "portrait", false, 5.35],
    [360, 800, "portrait", "portrait", false, 5.35],
    [320, 800, "portrait", "portrait", false, 5.35],
    [844, 390, "landscape", "landscape", false, 5.6],
    [740, 360, "landscape", "landscape", false, 5.6],
    [800, 360, "landscape", "landscape", false, 5.6],
    [896, 414, "landscape", "landscape", false, 5.6],
    [900, 480, "landscape", "landscape", false, 5.6],
    [800, 801, "portrait", "portrait", false, 5.35],
    [800, 800, "portrait", "portrait", false, 5.35],
    [900, 481, "short-desktop", "desktop", true, 5.95],
    [901, 480, "short-desktop", "desktop", true, 5.95],
    [1366, 703, "short-desktop", "desktop", true, 5.95],
    [1366, 704, "desktop", "desktop", false, 6.75],
  ];
  for (const [width, height, cohort, family, shortDesktop, travelVh] of cases) {
    assert.equal(bootstrapCohort(width, height), cohort, `${width}x${height} bootstrap cohort`);
    assert.deepEqual(controllerProfile(cohort), { family, shortDesktop, travelVh }, `${width}x${height} controller profile`);
  }
});

test("Phase 5B-R2 coalesces click/hash order and settles a pre-rAF semantic entry before pagehide", async () => {
  const controller = await read("src/scripts/home-cinematic-integration.ts");
  const replaySource = sourceSlice(controller, "const replayManifestoAfterNativeHomeNavigation =", "const measure =");
  const clickSource = sourceSlice(controller, "for (const link of semanticHomeLinks)", 'window.addEventListener("hashchange"');
  const hashSource = sourceSlice(controller, 'window.addEventListener("hashchange"', "skipLink.addEventListener");
  const pagehideSource = sourceSlice(controller, 'window.addEventListener("pagehide"', "loadTimer =");
  assert.doesNotMatch(replaySource, /semanticHomeClickPending\s*=/, "navigation rAF must not clear the click/hash coalescer");
  assert.match(clickSource, /semanticHomeClickPending = window\.location\.hash !== "#entry"[\s\S]*?replayManifestoAfterNativeHomeNavigation\(\)/);
  assert.match(hashSource, /if \(semanticHomeClickPending\)[\s\S]*?semanticHomeClickPending = false;[\s\S]*?return;[\s\S]*?replayManifestoAfterNativeHomeNavigation\(\)/);

  const createNavigationModel = (hash) => ({ hash, pending: false, replayCount: 0, navigationFrame: false });
  const replay = (state) => { state.replayCount += 1; state.navigationFrame = true; };
  const clickHome = (state, event = { button: 0 }) => {
    if (!isPlainPrimaryActivation(event)) return;
    state.pending = state.hash !== "#entry";
    replay(state);
  };
  const runNavigationFrame = (state) => { state.navigationFrame = false; };
  const hashchange = (state, hash) => {
    state.hash = hash;
    if (hash !== "#entry") { state.pending = false; return; }
    if (state.pending) { state.pending = false; return; }
    replay(state);
  };

  for (const order of ["hash-before-raf", "raf-before-hash"]) {
    const state = createNavigationModel("");
    clickHome(state);
    if (order === "hash-before-raf") { hashchange(state, "#entry"); runNavigationFrame(state); }
    else { runNavigationFrame(state); hashchange(state, "#entry"); }
    assert.equal(state.replayCount, 1, `${order} must produce one replay`);
    assert.equal(state.pending, false, `${order} must consume the coalescer`);
  }
  const sameHash = createNavigationModel("#entry");
  clickHome(sameHash);
  runNavigationFrame(sameHash);
  assert.equal(sameHash.replayCount, 1, "a same-hash click replays without waiting for hashchange");
  const independentHash = createNavigationModel("");
  hashchange(independentHash, "#entry");
  assert.equal(independentHash.replayCount, 1, "an independent native hashchange still replays");
  const modified = createNavigationModel("");
  clickHome(modified, { button: 0, ctrlKey: true });
  assert.deepEqual(modified, createNavigationModel(""), "modified click leaves the current document untouched");

  assert.match(pagehideSource, /semanticHomeClickPending = false/);
  assert.match(pagehideSource, /manifestoThresholdActive \|\| \(window\.location\.hash === "#entry" && window\.scrollY >= entryTop - headerHeight - 1\)/);
  assert.match(pagehideSource, /manifestoThresholdActive = true;[\s\S]*?resolveManifestoReveal\(\)/);
  assert.ok(pagehideSource.indexOf("resolveManifestoReveal()") < pagehideSource.indexOf("cancelAnimationFrame(manifestoNavigationFrame)"), "settlement precedes navigation-frame cancellation");
  assert.ok(pagehideSource.indexOf("manifestoNavigationFrame = 0") < pagehideSource.indexOf("if (event.persisted) return"), "persisted pages retain no stale frame handle");

  const shouldSettleOnPagehide = ({ thresholdActive, hash, scrollY, entryTop, headerHeight }) => thresholdActive
    || (hash === "#entry" && scrollY >= entryTop - headerHeight - 1);
  assert.equal(shouldSettleOnPagehide({ thresholdActive: true, hash: "", scrollY: 0, entryTop: 1000, headerHeight: 100 }), true);
  assert.equal(shouldSettleOnPagehide({ thresholdActive: false, hash: "#entry", scrollY: 900, entryTop: 1000, headerHeight: 100 }), true, "pre-rAF native entry settles");
  assert.equal(shouldSettleOnPagehide({ thresholdActive: false, hash: "#entry", scrollY: 899, entryTop: 1000, headerHeight: 100 }), true, "one-pixel anchor tolerance settles");
  assert.equal(shouldSettleOnPagehide({ thresholdActive: false, hash: "#entry", scrollY: 898, entryTop: 1000, headerHeight: 100 }), false);
  assert.equal(shouldSettleOnPagehide({ thresholdActive: false, hash: "#other", scrollY: 900, entryTop: 1000, headerHeight: 100 }), false);
});

test("Phase 5B-R2 manifesto remains the exact sole statement with monumental whole-word layouts", async () => {
  const [component, homeCss, responsiveCss] = await Promise.all([
    read("src/components/home/EntryField.astro"),
    read("src/styles/routes/home.css"),
    read("src/styles/routes/home-responsive.css"),
  ]);
  const h1 = component.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "";
  assert.equal(h1.replace(/\{["']\s+["']\}/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), "We turn industrial needs into field evidence.");
  assert.equal((h1.match(/manifesto-line/g) ?? []).length, 2);
  assert.equal((h1.match(/manifesto-mobile-line/g) ?? []).length, 5);
  assert.doesNotMatch(component.slice(component.indexOf('id="entry"'), component.indexOf("</section>")), /<p\b|<a\b|<nav\b|<img\b|<svg\b/);
  assert.match(homeCss, /font-size:\s*clamp\(3\.5rem, 6\.2vw, 7\.75rem\)/);
  assert.match(homeCss, /width:\s*160%[\s\S]*?transform:\s*scaleX\(0\.625\)/);
  assert.match(homeCss, /text-align:\s*center/);
  assert.match(responsiveCss, /font-size:\s*clamp\(2\.2rem, 10\.8vw, 5\.25rem\)/);
  assert.match(responsiveCss, /width:\s*122\.5%[\s\S]*?transform:\s*scaleX\(0\.8163\)/);
  assert.doesNotMatch(`${homeCss}\n${responsiveCss}`, /word-break:\s*(?:break-all|anywhere)/);
});
