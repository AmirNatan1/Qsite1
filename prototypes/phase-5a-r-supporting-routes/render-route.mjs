// QH_PHASE5AR_ROUTE_LAB_ONLY
import { ROUTE_ORDER, ROUTES, architectureFingerprint } from "./route-data.mjs";

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const escapeAttribute = escapeHtml;

function navigation(currentSlug) {
  const items = ROUTE_ORDER
    .filter((slug) => slug !== "maradin" && slug !== "404")
    .map((slug) => {
      const route = ROUTES[slug];
      const current = slug === currentSlug ? ' aria-current="page"' : "";
      return `<li><a href="${escapeAttribute(route.publicPath)}"${current}>${escapeHtml(route.publicLabel)}</a></li>`;
    })
    .join("");
  return `<header class="site-head">
    <a class="wordmark" href="/for-partners/" aria-label="Quantum Hub Phase 5A-R route lab home"><span class="wordmark__mark" aria-hidden="true">Q</span><span>Quantum<span>Hub</span></span></a>
    <nav class="desktop-nav" aria-label="Preproduction route studies"><ul>${items}</ul></nav>
    <details class="mobile-nav"><summary>Routes</summary><nav aria-label="Preproduction route studies mobile"><ul>${items}</ul></nav></details>
  </header>`;
}

function kicker(text) {
  return `<p class="kicker">${escapeHtml(text)}</p>`;
}

function status(route) {
  return `<p class="preproduction-status"><strong>PREPRODUCTION</strong><span>${escapeHtml(route.status)}</span></p>`;
}

function actMap(act) {
  return `<p class="act-map"><span>approved content map</span>${escapeHtml(act.map.join(" · "))}</p>`;
}

function annotation(act) {
  return `<p class="act-note">${escapeHtml(act.note)}</p>`;
}

function titleBlock(route, headingId, extra = "") {
  return `<div class="title-block">
    ${kicker(route.eyebrow)}
    <h1 id="${escapeAttribute(headingId)}">${escapeHtml(route.title)}</h1>
    <p class="lede">${escapeHtml(route.lede)}</p>
    ${status(route)}
    ${extra}
  </div>`;
}

function industryPage(route) {
  const [pressure, frame, test, decision] = route.acts;
  return `<main id="main" class="repair-page industry-page" data-document-regions="4">
    <article class="industry-pressure-system" aria-labelledby="industry-title">
      <section class="industry-act industry-act--pressure" data-act="1" data-state="${escapeAttribute(pressure.id)}">
        <div class="industry-load" aria-hidden="true"><span></span><span></span><span></span><i></i></div>
        ${titleBlock(route, "industry-title")}
        <div class="industry-act__copy">${kicker(pressure.kicker)}<h2>${escapeHtml(pressure.title)}</h2>${actMap(pressure)}${annotation(pressure)}</div>
      </section>
      <section class="industry-act industry-act--frame" data-act="2" data-state="${escapeAttribute(frame.id)}">
        <div class="industry-boundary" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="industry-act__copy">${kicker(frame.kicker)}<h2>${escapeHtml(frame.title)}</h2>${actMap(frame)}${annotation(frame)}</div>
      </section>
      <section class="industry-act industry-act--test" data-act="3" data-state="${escapeAttribute(test.id)}">
        <div class="industry-search-field" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
        <div class="industry-act__copy">${kicker(test.kicker)}<h2>${escapeHtml(test.title)}</h2>${actMap(test)}${annotation(test)}</div>
      </section>
      <section class="industry-act industry-act--decision" data-act="4" data-state="${escapeAttribute(decision.id)}">
        <div class="industry-decision-plane" aria-hidden="true"><span></span><span></span></div>
        <div class="industry-act__copy">${kicker(decision.kicker)}<h2>${escapeHtml(decision.title)}</h2>${actMap(decision)}${annotation(decision)}<p class="route-ending">${escapeHtml(route.conversion)}</p></div>
      </section>
    </article>
  </main>`;
}

function startupPage(route) {
  const [signal, conditions, fit, field] = route.acts;
  const conditionLabels = conditions.map.map((label, index) => `<span data-channel="${index + 1}">${escapeHtml(label)}</span>`).join("");
  return `<main id="main" class="repair-page startup-page" data-document-regions="4">
    <article class="startup-corridor" aria-labelledby="startup-title">
      <header class="startup-act startup-act--signal" data-act="1" data-state="${escapeAttribute(signal.id)}">
        <div class="startup-signal-map" aria-hidden="true"><i></i><span></span><span></span><span></span></div>
        ${titleBlock(route, "startup-title", `${actMap(signal)}${annotation(signal)}`)}
      </header>
      <ol class="startup-route" aria-label="Conditional field route">
        <li class="startup-act startup-act--conditions" data-act="2" data-state="${escapeAttribute(conditions.id)}">
          <div class="startup-channel-field" aria-hidden="true">${conditionLabels}</div>
          <div>${kicker(conditions.kicker)}<h2>${escapeHtml(conditions.title)}</h2>${actMap(conditions)}${annotation(conditions)}</div>
        </li>
        <li class="startup-act startup-act--fit" data-act="3" data-state="${escapeAttribute(fit.id)}">
          <div class="startup-tolerance" aria-hidden="true"><span></span><span></span><span></span></div>
          <div>${kicker(fit.kicker)}<h2>${escapeHtml(fit.title)}</h2>${actMap(fit)}${annotation(fit)}</div>
        </li>
        <li class="startup-act startup-act--field" data-act="4" data-state="${escapeAttribute(field.id)}">
          <div class="startup-field-threshold" aria-hidden="true"><span></span><i></i></div>
          <div>${kicker(field.kicker)}<h2>${escapeHtml(field.title)}</h2>${actMap(field)}${annotation(field)}<p class="route-ending">${escapeHtml(route.conversion)}</p></div>
        </li>
      </ol>
    </article>
  </main>`;
}

function industriesPage(route) {
  const territoryMarkup = route.acts.map((act, index) => `<section class="territory territory--${escapeAttribute(act.id)}" data-act="${index + 1}" data-state="${escapeAttribute(act.id)}" aria-labelledby="territory-${escapeAttribute(act.id)}">
    <div class="territory__material" aria-hidden="true"><span></span><span></span><span></span><i></i></div>
    <div class="territory__copy">${kicker(act.kicker)}<h2 id="territory-${escapeAttribute(act.id)}">${escapeHtml(act.title)}</h2>${actMap(act)}${annotation(act)}</div>
  </section>`).join("");
  return `<main id="main" class="repair-page industries-page" data-document-regions="6">
    <article class="industries-atlas" aria-labelledby="industries-title">
      <header class="industries-threshold">
        ${titleBlock(route, "industries-title")}
        <div class="territory-threshold" aria-hidden="true"><span>01</span><span>02</span><span>03</span><span>04</span></div>
      </header>
      <div class="territory-sequence">${territoryMarkup}</div>
      <footer class="industries-context">
        ${kicker("shared context")}
        <h2>Four fields. One evidence discipline.</h2>
        <p class="route-ending">${escapeHtml(route.conversion)}</p>
      </footer>
    </article>
  </main>`;
}

function proofPage(route) {
  const [threshold, record] = route.acts;
  return `<main id="main" class="repair-page proof-page" data-document-regions="2">
    <article class="proof-archive" aria-labelledby="proof-title">
      <header class="proof-act proof-act--threshold" data-act="1" data-state="${escapeAttribute(threshold.id)}">
        <div class="proof-void">${titleBlock(route, "proof-title", `${actMap(threshold)}${annotation(threshold)}`)}</div>
        <figure class="proof-puncture"><img src="${escapeAttribute(route.media[0])}" alt="Approved Maradin field-aperture poster used as the single record threshold" /><figcaption>Existing governed poster · one public record</figcaption></figure>
      </header>
      <section class="proof-act proof-act--record" data-act="2" data-state="${escapeAttribute(record.id)}" aria-labelledby="proof-record-title">
        <div class="proof-record-edge" aria-hidden="true"><span></span></div>
        <div class="proof-record-copy">${kicker(record.kicker)}<h2 id="proof-record-title">${escapeHtml(record.title)}</h2>${actMap(record)}${annotation(record)}<a class="record-link" href="${escapeAttribute(ROUTES.maradin.publicPath)}">Open the Maradin record</a><p class="route-ending">${escapeHtml(route.conversion)}</p></div>
      </section>
    </article>
  </main>`;
}

function documentaryFigure(src, alt, caption, modifier = "") {
  return `<figure class="documentary-frame ${modifier}"><img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" /><figcaption>${escapeHtml(caption)}</figcaption></figure>`;
}

function maradinPage(route) {
  const [opening, challenge, technology, test, evidence, conclusion] = route.acts;
  return `<main id="main" class="repair-page maradin-page" data-document-regions="6">
    <article class="maradin-record" aria-labelledby="maradin-title">
      <section class="maradin-act maradin-act--opening" data-act="1" data-state="${escapeAttribute(opening.id)}">
        ${documentaryFigure(route.media[0], "Approved Maradin field aperture", "field aperture · governed documentary still", "documentary-frame--opening")}
        ${titleBlock(route, "maradin-title", `${actMap(opening)}${annotation(opening)}`)}
      </section>
      <section class="maradin-act maradin-act--challenge" data-act="2" data-state="${escapeAttribute(challenge.id)}">
        <div class="maradin-copy">${kicker(challenge.kicker)}<h2>${escapeHtml(challenge.title)}</h2>${actMap(challenge)}${annotation(challenge)}</div>
        ${documentaryFigure(route.media[2], "Approved Maradin real-field still", "field condition · approved still", "documentary-frame--portrait")}
      </section>
      <section class="maradin-act maradin-act--technology" data-act="3" data-state="${escapeAttribute(technology.id)}">
        ${documentaryFigure(route.media[1], "Approved Maradin projection field frame", "physical technology · approved frame", "documentary-frame--wide")}
        <div class="maradin-copy">${kicker(technology.kicker)}<h2>${escapeHtml(technology.title)}</h2>${actMap(technology)}${annotation(technology)}</div>
      </section>
      <section class="maradin-act maradin-act--test" data-act="4" data-state="${escapeAttribute(test.id)}">
        <div class="maradin-test-matte" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="maradin-copy">${kicker(test.kicker)}<h2>${escapeHtml(test.title)}</h2>${actMap(test)}${annotation(test)}<p class="media-role">Two existing videos remain user-initiated production assets; this preproduction document uses governed still-first evidence only.</p></div>
      </section>
      <section class="maradin-act maradin-act--evidence" data-act="5" data-state="${escapeAttribute(evidence.id)}">
        <div class="maradin-evidence-pair">${documentaryFigure(route.media[0], "Approved Maradin field aperture detail", "aperture observation")}${documentaryFigure(route.media[1], "Approved Maradin prove-field detail", "test observation")}</div>
        <div class="maradin-copy">${kicker(evidence.kicker)}<h2>${escapeHtml(evidence.title)}</h2>${actMap(evidence)}${annotation(evidence)}</div>
      </section>
      <section class="maradin-act maradin-act--conclusion" data-act="6" data-state="${escapeAttribute(conclusion.id)}">
        <div class="maradin-copy">${kicker(conclusion.kicker)}<h2>${escapeHtml(conclusion.title)}</h2>${actMap(conclusion)}${annotation(conclusion)}<p class="route-ending">${escapeHtml(route.conversion)}</p></div>
      </section>
    </article>
  </main>`;
}

function sparkPage(route) {
  const [runway, closed, context] = route.acts;
  return `<main id="main" class="repair-page spark-page" data-document-regions="3">
    <article class="spark-route" aria-labelledby="spark-title">
      <header class="spark-act spark-act--runway" data-act="1" data-state="${escapeAttribute(runway.id)}">
        <div class="spark-runway" aria-hidden="true"><i></i><span></span><span></span></div>
        ${titleBlock(route, "spark-title", `${actMap(runway)}${annotation(runway)}`)}
        <p class="spark-status">Applications closed</p>
      </header>
      <section class="spark-act spark-act--closed" data-act="2" data-state="${escapeAttribute(closed.id)}" aria-labelledby="spark-closed-title">
        <div class="sealed-gate" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
        <div>${kicker(closed.kicker)}<h2 id="spark-closed-title">${escapeHtml(closed.title)}</h2>${actMap(closed)}${annotation(closed)}<p class="closed-copy">Applications closed</p></div>
      </section>
      <footer class="spark-act spark-act--context" data-act="3" data-state="${escapeAttribute(context.id)}">
        <div class="side-release" aria-hidden="true"><span></span></div>
        <div>${kicker(context.kicker)}<h2>${escapeHtml(context.title)}</h2>${actMap(context)}${annotation(context)}<p class="route-ending">${escapeHtml(route.conversion)}</p></div>
      </footer>
    </article>
  </main>`;
}

function aboutPage(route) {
  const [worlds, interlock, position] = route.acts;
  return `<main id="main" class="repair-page about-page" data-document-regions="3">
    <article class="about-position" aria-labelledby="about-title">
      <header class="about-act about-act--worlds" data-act="1" data-state="${escapeAttribute(worlds.id)}">
        <div class="institutional-world institutional-world--industry" aria-hidden="true"></div>
        <div class="institutional-world institutional-world--technology" aria-hidden="true"></div>
        <div class="about-joint" aria-hidden="true"><span></span></div>
        ${titleBlock(route, "about-title", `${actMap(worlds)}${annotation(worlds)}`)}
      </header>
      <section class="about-act about-act--interlock" data-act="2" data-state="${escapeAttribute(interlock.id)}">
        <div class="interlock-cut" aria-hidden="true"><span></span><span></span></div>
        <div class="about-copy">${kicker(interlock.kicker)}<h2>${escapeHtml(interlock.title)}</h2>${actMap(interlock)}${annotation(interlock)}</div>
      </section>
      <footer class="about-act about-act--position" data-act="3" data-state="${escapeAttribute(position.id)}">
        <div class="operating-spine" aria-hidden="true"><span></span></div>
        <div class="about-copy">${kicker(position.kicker)}<h2>${escapeHtml(position.title)}</h2>${actMap(position)}${annotation(position)}<nav class="audience-release" aria-label="Audience routes"><a href="${escapeAttribute(ROUTES["for-industry"].publicPath)}">For industry</a><a href="${escapeAttribute(ROUTES["for-startups"].publicPath)}">For startups</a></nav><p class="route-ending">${escapeHtml(route.conversion)}</p></div>
      </footer>
    </article>
  </main>`;
}

function contactPage(route) {
  const [arrival] = route.acts;
  const intents = route.intents.map((intent, index) => `<section class="intent-rail" id="${escapeAttribute(intent.id)}" data-intent="${index + 1}" aria-labelledby="intent-${escapeAttribute(intent.id)}">
    <span aria-hidden="true">0${index + 1}</span><div><h2 id="intent-${escapeAttribute(intent.id)}">${escapeHtml(intent.label)}</h2><p>${escapeHtml(intent.detail)}</p></div>
  </section>`).join("");
  return `<main id="main" class="repair-page contact-page" data-document-regions="1">
    <article class="contact-arrival" data-act="1" data-state="${escapeAttribute(arrival.id)}" aria-labelledby="contact-title">
      <header class="contact-heading">${titleBlock(route, "contact-title", `${actMap(arrival)}${annotation(arrival)}`)}</header>
      <div class="intent-field">${intents}<div class="endpoint-plane"><span>Endpoint pending verification</span><strong>No form or destination is simulated.</strong></div></div>
      <p class="route-ending">${escapeHtml(route.conversion)}</p>
    </article>
  </main>`;
}

function notFoundPage(route) {
  const [recovery] = route.acts;
  return `<main id="main" class="repair-page notfound-page" data-document-regions="1">
    <article class="notfound-field" data-act="1" data-state="${escapeAttribute(recovery.id)}" aria-labelledby="notfound-title">
      <div class="misregistered-plane" aria-hidden="true"><span></span><i>404</i></div>
      <div class="notfound-copy">${kicker(route.eyebrow)}<h1 id="notfound-title">${escapeHtml(route.title)}</h1><p class="lede">${escapeHtml(route.lede)}</p>${actMap(recovery)}${annotation(recovery)}<a class="recovery-link" href="/for-partners/">Return Home</a>${status(route)}</div>
    </article>
  </main>`;
}

const PAGE_RENDERERS = Object.freeze({
  "for-industry": industryPage,
  "for-startups": startupPage,
  industries: industriesPage,
  proof: proofPage,
  maradin: maradinPage,
  spark: sparkPage,
  about: aboutPage,
  contact: contactPage,
  "404": notFoundPage,
});

function stateGlyph(route, index) {
  return `<div class="state-glyph state-glyph--${escapeAttribute(route.slug)}" data-state-index="${index + 1}" aria-hidden="true"><span></span><span></span><span></span><i></i></div>`;
}

function signatureBoard(route) {
  const states = route.signatureStates.map((label, index) => `<li><figure>${stateGlyph(route, index)}<figcaption><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(label)}</strong></figcaption></figure></li>`).join("");
  return `<main id="main" class="review-board signature-board" data-board-route="${escapeAttribute(route.slug)}">
    <header>${kicker("signature states / PREPRODUCTION")}<h1>${escapeHtml(route.publicLabel)}</h1><p>${escapeHtml(route.architecture.transitionGrammar)}</p></header>
    <ol style="--state-count:${route.signatureStates.length}">${states}</ol>
    <footer><span>${escapeHtml(route.architecture.overtureTopology)}</span><span>${escapeHtml(route.architecture.endingBehavior)}</span><span>No continuous loop</span></footer>
  </main>`;
}

function materialBoard(route) {
  const samples = route.materials.map((material, index) => `<figure class="material-sample" data-material-index="${index + 1}">${stateGlyph(route, index)}<figcaption><span>0${index + 1}</span><strong>${escapeHtml(material)}</strong></figcaption></figure>`).join("");
  return `<main id="main" class="review-board material-board" data-board-route="${escapeAttribute(route.slug)}">
    <header>${kicker("decisive material board / PREPRODUCTION")}<h1>${escapeHtml(route.publicLabel)}</h1><p>${escapeHtml(route.architecture.antiTemplateDistinction)}</p></header>
    <div class="material-board__grid">${samples}</div>
    <footer><span>Dark V2 foundation</span><span>Route-specific surface family</span><span>Magenta remains rare</span></footer>
  </main>`;
}

function routePage(route) {
  const renderer = PAGE_RENDERERS[route.slug];
  if (!renderer) throw new Error(`No Phase 5A-R renderer for ${route.slug}`);
  return renderer(route);
}

function documentShell({ title, routeSlug = "system", boardName = "page", content, navigationMarkup = "" }) {
  const route = ROUTES[routeSlug];
  const fingerprint = route ? architectureFingerprint(route) : "cross-route-system";
  return `<!doctype html>
<html lang="en" data-route="${escapeAttribute(routeSlug)}" data-architecture="${escapeAttribute(fingerprint)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${escapeHtml(title)} · Phase 5A-R local route lab</title>
  <link rel="stylesheet" href="/shared/system.css" />
  <script src="/shared/enhancement.js" defer></script>
</head>
<body data-board="${escapeAttribute(boardName)}">
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="lab-notice" role="note"><span>QH_PHASE5AR_ROUTE_LAB_ONLY</span><strong>PREPRODUCTION · NOT A PUBLIC ROUTE</strong></div>
  ${navigationMarkup}
  ${content}
</body>
</html>`;
}

export function renderRoute(route, boardName = "page") {
  let content;
  if (boardName === "signature") content = signatureBoard(route);
  else if (boardName === "materials") content = materialBoard(route);
  else content = routePage(route);
  return documentShell({
    title: route.publicLabel,
    routeSlug: route.slug,
    boardName,
    navigationMarkup: boardName === "page" ? navigation(route.slug) : "",
    content,
  });
}

export function renderSystem() {
  const routes = ROUTE_ORDER.map((slug) => {
    const route = ROUTES[slug];
    return `<article class="system-route" data-system-route="${escapeAttribute(slug)}">
      <span>${String(ROUTE_ORDER.indexOf(slug) + 1).padStart(2, "0")}</span>
      <h2>${escapeHtml(route.publicLabel)}</h2>
      <p>${escapeHtml(route.architecture.overtureTopology)}</p>
      <dl><div><dt>acts</dt><dd>${route.architecture.actCount}</dd></div><div><dt>length</dt><dd>${escapeHtml(route.architecture.documentLength)}</dd></div><div><dt>ending</dt><dd>${escapeHtml(route.architecture.endingBehavior)}</dd></div></dl>
    </article>`;
  }).join("");
  const content = `<main id="main" class="system-board"><header>${kicker("Phase 5A-R anti-template system")}<h1>Nine routes. Nine document architectures.</h1><p>Shared foundations remain; topology, rhythm, density, media relationship and endings now differ at document level.</p></header><section class="system-route-grid" aria-label="Nine route architecture fingerprints">${routes}</section></main>`;
  return documentShell({ title: "Phase 5A-R cross-route system", boardName: "system", content });
}

export function renderCoherenceMatrixMarkdown() {
  const header = [
    "# Phase 5A-R Route Coherence Matrix",
    "",
    "Status: PREPRODUCTION; public supporting routes unchanged; Phase 5B unauthorized.",
    "",
    "| Route | Document length | Chapter count | Overture topology | H1 placement | Dominant page geometry | Primary density | Media dominance | Transition grammar | Unique ending behavior | Closest visual sibling | Anti-template distinction |",
    "| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  const rows = ROUTE_ORDER.map((slug) => {
    const route = ROUTES[slug];
    const a = route.architecture;
    const cells = [route.publicLabel, a.documentLength, a.actCount, a.overtureTopology, a.h1Placement, a.dominantGeometry, a.primaryDensity, a.mediaDominance, a.transitionGrammar, a.endingBehavior, ROUTES[a.closestVisualSibling]?.publicLabel ?? a.closestVisualSibling, a.antiTemplateDistinction];
    return `| ${cells.map((cell) => String(cell).replaceAll("|", "\\|")).join(" | ")} |`;
  });
  return [...header, ...rows, "", "Human visual judgment remains authoritative.", ""].join("\n");
}

const WATCH_PAIRS = new Map([
  ["for-industry|for-startups", "Both retain four acts, so review must confirm that Industry reads as heavy central compression while Startups reads as open edge-to-field conduction."],
  ["for-industry|about", "Both use structural masses, but Industry continuously narrows a challenge aperture while About stabilizes two institutional worlds at one interlock joint."],
  ["for-startups|spark", "Both use conductive direction, but Startups branches toward conditional field access while SPARK follows one runway to a sealed applications-closed gate."],
  ["proof|maradin", "Both truthfully share Maradin media; Proof must remain a two-act archive threshold while Maradin remains the six-act documentary record."],
  ["spark|contact", "Both are concise and terminate honestly, but SPARK uses approach and a sealed gate while Contact holds three static intent rails in one arrival field."],
  ["contact|404", "Both are minimal static documents, but Contact aligns three intents and 404 misregisters one plane before immediate recovery."],
]);

export function renderAntiTemplateAuditMarkdown() {
  const lines = [
    "# Phase 5A-R Anti-Template Audit",
    "",
    "Status: PREPRODUCTION. Human visual judgment remains authoritative.",
    "",
    "Every unordered route pair is compared across eight dimensions: chapter count, page length, overture structure, H1 placement, dominant geometry, content/media relationship, transition grammar, and ending structure.",
    "",
  ];
  for (let leftIndex = 0; leftIndex < ROUTE_ORDER.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ROUTE_ORDER.length; rightIndex += 1) {
      const leftSlug = ROUTE_ORDER[leftIndex];
      const rightSlug = ROUTE_ORDER[rightIndex];
      const left = ROUTES[leftSlug];
      const right = ROUTES[rightSlug];
      const key = `${leftSlug}|${rightSlug}`;
      const watch = WATCH_PAIRS.get(key);
      const statusValue = watch ? "WATCH" : "DISTINCT";
      const rationale = watch ?? `${left.publicLabel} uses ${left.architecture.overtureTopology}, ${left.architecture.actCount} act(s), ${left.architecture.mediaDominance}, and ends through ${left.architecture.endingBehavior}; ${right.publicLabel} uses ${right.architecture.overtureTopology}, ${right.architecture.actCount} act(s), ${right.architecture.mediaDominance}, and ends through ${right.architecture.endingBehavior}. Their full-page skeletons are therefore not interchangeable.`;
      lines.push(`<!-- pair:${key} -->`, `**${statusValue}** — ${rationale}`, "");
    }
  }
  return `${lines.join("\n")}\n`;
}
