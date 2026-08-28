// QH_PHASE5A_ROUTE_LAB_ONLY
import { ROUTE_ORDER, ROUTES } from "./route-data.mjs";

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function motif(slug, modifier = "") {
  return `<div class="motif motif--${escapeHtml(slug)} ${modifier}" aria-hidden="true">
    <span class="motif__plane motif__plane--a"></span>
    <span class="motif__plane motif__plane--b"></span>
    <span class="motif__plane motif__plane--c"></span>
    <span class="motif__plane motif__plane--d"></span>
    <span class="motif__trace"></span>
    <span class="motif__signal"></span>
    <span class="motif__aperture"></span>
    <span class="motif__index">${escapeHtml(ROUTE_ORDER.indexOf(slug) + 1)}</span>
  </div>`;
}

function navigation(currentSlug) {
  const items = ROUTE_ORDER.filter((slug) => slug !== "maradin" && slug !== "404").map((slug) => {
    const route = ROUTES[slug];
    const current = slug === currentSlug ? ' aria-current="page"' : "";
    return `<li><a href="${escapeHtml(route.publicPath)}"${current}>${escapeHtml(route.publicLabel)}</a></li>`;
  }).join("");
  return `<header class="site-head">
    <a class="wordmark" href="/for-partners/" aria-label="Quantum Hub supporting-route preproduction home">
      <span class="wordmark__mark" aria-hidden="true">Q</span><span>Quantum<span>Hub</span></span>
    </a>
    <nav class="desktop-nav" aria-label="Prototype routes"><ul>${items}</ul></nav>
    <details class="mobile-nav"><summary>Routes</summary><nav aria-label="Prototype routes mobile"><ul>${items}</ul></nav></details>
  </header>`;
}

function mediaMarkup(route) {
  if (route.slug === "proof") {
    return `<figure class="evidence-aperture">
      <img src="/media/maradin/maradin-field-aperture-poster-approved.jpg" alt="Approved Maradin field-aperture poster used as a preproduction crop study" />
      <figcaption>Existing governed poster · single public record</figcaption>
    </figure>`;
  }
  if (route.slug === "maradin") {
    return `<div class="documentary-field" aria-label="Approved Maradin still-image crop studies">
      <figure><img src="/media/maradin/maradin-field-aperture-poster-approved.jpg" alt="Approved Maradin field aperture" /><figcaption>field aperture</figcaption></figure>
      <figure><img src="/media/maradin/maradin-prove-field-frame-approved.jpg" alt="Approved Maradin projection field frame" /><figcaption>test condition</figcaption></figure>
      <figure><img src="/media/maradin/maradin-real-field-still-approved.jpg" alt="Approved Maradin real-field still" /><figcaption>field observation</figcaption></figure>
    </div>`;
  }
  return "";
}

function chapters(route) {
  return route.chapters.map((chapter, index) => {
    const phase = route.arc[index] ?? route.arc.at(-1);
    const isTerritory = route.slug === "industries";
    return `<section class="chapter ${isTerritory ? `chapter--territory chapter--territory-${index + 1}` : ""}" data-chapter="${index + 1}" aria-labelledby="chapter-${index + 1}">
      <div class="chapter__index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</div>
      <div class="chapter__copy">
        <p class="kicker">${escapeHtml(phase)}</p>
        <h2 id="chapter-${index + 1}">${escapeHtml(chapter)}</h2>
        <p>Existing publication-safe content maps into this chapter. Phase 5A defines spatial hierarchy and behavior; public copy remains unchanged.</p>
      </div>
      <div class="chapter__field" aria-hidden="true"><span></span><span></span><span></span></div>
    </section>`;
  }).join("");
}

function reviewBand(route) {
  return `<aside class="review-band" aria-label="Preproduction decisions">
    <div><span>signature</span><strong>${escapeHtml(route.signature)}</strong></div>
    <div><span>motion</span><strong>${escapeHtml(route.motion.join(" → "))}</strong></div>
    <div><span>datum</span><strong>${escapeHtml(route.datum)}</strong></div>
  </aside>`;
}

function routePage(route) {
  const next = ROUTES[route.next];
  return `<main id="main" class="route-page">
    <section class="overture" aria-labelledby="route-title">
      <div class="overture__copy">
        <p class="kicker">${escapeHtml(route.eyebrow)}</p>
        <h1 id="route-title">${escapeHtml(route.title)}</h1>
        <p class="lede">${escapeHtml(route.userQuestion)}</p>
      </div>
      <div class="overture__field">${motif(route.slug)}</div>
      <p class="overture__note"><span>local-only thesis</span>${escapeHtml(route.overture)}</p>
    </section>
    ${reviewBand(route)}
    <div class="chapter-sequence">${chapters(route)}</div>
    ${mediaMarkup(route)}
    <section class="route-resolution" aria-labelledby="resolution-title">
      <p class="kicker">resolve / release</p>
      <h2 id="resolution-title">${escapeHtml(route.conversion)}</h2>
      <p>${escapeHtml(route.reduced)}</p>
    </section>
    <section class="route-handoff" aria-label="Representative route transition">
      <div><p class="kicker">outgoing boundary</p><p>${escapeHtml(route.publicLabel)}</p></div>
      <span aria-hidden="true"></span>
      <a href="${escapeHtml(next.publicPath)}"><small>next route study</small>${escapeHtml(next.publicLabel)}</a>
    </section>
  </main>`;
}

function sceneFrame(route, state, label) {
  return `<article class="state-frame" data-state="${state}">
    <div class="state-frame__scene">${motif(route.slug, `motif--state-${state}`)}</div>
    <div class="state-frame__caption"><span>${String(Number(state) + 1).padStart(2, "0")}</span><strong>${escapeHtml(label)}</strong></div>
  </article>`;
}

function motionBoard(route) {
  const states = route.motion.length >= 3 ? route.motion.slice(0, 3) : [route.motion[0], "Hold", route.motion.at(-1)];
  return `<main class="route-board route-board--motion">
    <header><p class="kicker">signature behavior / key states</p><h1>${escapeHtml(route.publicLabel)}</h1><p>${escapeHtml(route.signature)}</p></header>
    <div class="state-grid">${states.map((label, index) => sceneFrame(route, index, label)).join("")}</div>
    <footer><span>Input-driven only</span><span>Exact reverse</span><span>No continuous loop</span></footer>
  </main>`;
}

function materialBoard(route) {
  return `<main class="route-board route-board--materials">
    <header><p class="kicker">material / detail board</p><h1>${escapeHtml(route.publicLabel)}</h1><p>${escapeHtml(route.overture)}</p></header>
    <div class="material-grid">${route.materials.map((material, index) => `<figure class="material-sample material-sample--${index + 1}"><div>${motif(route.slug, `motif--detail-${index + 1}`)}</div><figcaption><span>0${index + 1}</span>${escapeHtml(material)}</figcaption></figure>`).join("")}</div>
    <footer><span>Dark V2</span><span>Documentary light</span><span>Magenta ≤ activation edge</span></footer>
  </main>`;
}

function typeBoard(route) {
  return `<main class="route-board route-board--type">
    <header><p class="kicker">typography hierarchy</p><h1>${escapeHtml(route.publicLabel)}</h1><p>Same typographic family; route identity comes from space, material and behavior.</p></header>
    <div class="type-specimens">
      <div class="type-specimen type-specimen--display"><span>display / Syne 800</span><strong>${escapeHtml(route.title)}</strong></div>
      <div class="type-specimen type-specimen--editorial"><span>editorial / Newsreader 400</span><strong>${escapeHtml(route.userQuestion)}</strong></div>
      <div class="type-specimen type-specimen--body"><span>body / Inter 400</span><p>${escapeHtml(route.purpose)}</p></div>
      <div class="type-specimen type-specimen--label"><span>system label / Inter 600</span><strong>${escapeHtml(route.motion.join(" / "))}</strong></div>
    </div>
  </main>`;
}

function transitionBoard(route) {
  const next = ROUTES[route.next];
  return `<main class="route-board route-board--transition">
    <header><p class="kicker">representative transition states</p><h1>${escapeHtml(route.publicLabel)} → ${escapeHtml(next.publicLabel)}</h1><p>Immediate page availability; the boundary changes without replaying the proving hall.</p></header>
    <div class="transition-strip">
      <article><span>01 / resolve</span>${motif(route.slug, "motif--state-2")}<strong>${escapeHtml(route.publicLabel)}</strong></article>
      <article><span>02 / neutral seam</span><div class="neutral-seam" aria-hidden="true"></div><strong>native navigation</strong></article>
      <article><span>03 / arrive</span>${motif(next.slug, "motif--state-0")}<strong>${escapeHtml(next.publicLabel)}</strong></article>
    </div>
    <footer><span>No CRT replay</span><span>No cinematic runway</span><span>Focus lands at page start</span></footer>
  </main>`;
}

function board(route, boardName) {
  if (boardName === "motion") return motionBoard(route);
  if (boardName === "materials") return materialBoard(route);
  if (boardName === "type") return typeBoard(route);
  if (boardName === "transition") return transitionBoard(route);
  return routePage(route);
}

function documentShell({ title, routeSlug = "system", boardName = "page", content, navigationMarkup = "" }) {
  return `<!doctype html>
<html lang="en" data-route="${escapeHtml(routeSlug)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${escapeHtml(title)} · Phase 5A local route lab</title>
  <link rel="stylesheet" href="/shared/system.css" />
  <script src="/shared/enhancement.js" defer></script>
</head>
<body data-board="${escapeHtml(boardName)}">
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="lab-notice" role="note"><span>QH_PHASE5A_ROUTE_LAB_ONLY</span><strong>LOCAL PREPRODUCTION · NOT A PUBLIC ROUTE</strong></div>
  ${navigationMarkup}
  ${content}
</body>
</html>`;
}

export function renderRoute(route, boardName = "page") {
  return documentShell({
    title: route.publicLabel,
    routeSlug: route.slug,
    boardName,
    navigationMarkup: boardName === "page" ? navigation(route.slug) : "",
    content: board(route, boardName),
  });
}

export function renderSystem() {
  const routeTiles = ROUTE_ORDER.map((slug) => {
    const route = ROUTES[slug];
    return `<article class="system-route" data-system-route="${escapeHtml(slug)}">
      <div>${motif(slug, "motif--system")}</div>
      <p><span>${String(ROUTE_ORDER.indexOf(slug) + 1).padStart(2, "0")}</span>${escapeHtml(route.publicLabel)}</p>
      <strong>${escapeHtml(route.signature)}</strong>
    </article>`;
  }).join("");
  const content = `<main id="main" class="system-board">
    <header><p class="kicker">cross-route experience system</p><h1>One material world. Nine distinct spatial identities.</h1><p>The datum changes role or disappears; typography, navigation and motion law provide continuity.</p></header>
    <div class="system-laws"><span>Conduct</span><span>Focus</span><span>Cross</span><span>Resolve</span><span>Release</span></div>
    <section class="system-route-grid" aria-label="Nine supporting-route signatures">${routeTiles}</section>
    <section class="system-footer"><div><span>navigation</span><strong>Immediate semantic arrival</strong></div><div><span>motion</span><strong>Input-driven, reversible, optional</strong></div><div><span>continuity</span><strong>Complete static reading order</strong></div><div><span>media</span><strong>Governed evidence only</strong></div></section>
  </main>`;
  return documentShell({ title: "Cross-route system", content, boardName: "system" });
}
