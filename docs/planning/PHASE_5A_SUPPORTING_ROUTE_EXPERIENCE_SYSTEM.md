# Phase 5A Supporting-Route Experience System

Status: CP3 creative and implementation-planning authority; human review pending; Phase 5B is not authorized

Accepted parent: `47a6f3cc7f464b09c9c143cac273c2a1f5a35bfa`

Scope: `/for-partners/`, `/for-startups/`, `/industries/`, `/pocs/`, `/pocs/maradin/`, `/spark/`, `/about/`, `/contact/`, and the real `404`

## 1. Authority and production boundary

This document defines the shared experience system for supporting-route visual preproduction. It is additive to the accepted Phase 2 Operating Field thesis and the accepted Phase 4 production site. It does not authorize a supporting-route production redesign.

Phase 5A must keep the existing public supporting routes byte-frozen while speculative work is reviewed. The only public production change authorized elsewhere in Phase 5A is the separately governed homepage CRT scroll amendment. CP3 and CP4 may add planning documents, isolated local prototype source, capture tooling, tests, and external review output; they may not change supporting-route HTML, content, styles, navigation, assets, or generated public output.

The following supporting-route production surfaces are frozen for this preproduction track:

- the nine route sources under `src/pages/`;
- `src/components/PageHero.astro`, `ProcessList.astro`, `ClosingCta.astro`, `SiteHeader.astro`, and `SiteFooter.astro`;
- `src/layouts/BaseLayout.astro`;
- the publication-controlled records under `src/content/`;
- `src/styles/routes/standard.css`, `proof.css`, and `not-found.css`;
- shared tokens, typography, layout, navigation, global and component styles;
- `src/pages/sitemap.xml.ts` and `robots.txt.ts`;
- all files under `public/brand/`, `public/fonts/`, and `public/media/maradin/`.

No design descriptor in this document is approved public copy. Existing published copy remains the only copy authority unless a later human gate explicitly approves a change.

## 2. Local-only preproduction contract

Speculative route compositions must remain outside Astro production inputs. The planned design lab is:

`prototypes/phase-5a-supporting-routes/`

Its canary is:

`QH_PHASE5A_ROUTE_LAB_ONLY`

The lab must:

- remain outside `src/`, `public/`, and `dist/`;
- expose no public or preview route that resembles a production URL;
- use complete semantic HTML that remains understandable with JavaScript disabled;
- contain no external network dependency, package runtime, iframe, analytics, form, API call, or remote font;
- reference, rather than copy, governed Quantum fonts, brand marks and approved Maradin media;
- use only a local, allow-listed server for capture;
- produce all screenshots, contact sheets, recordings and the final ZIP outside the repository and outside Git;
- refuse an output directory inside the repository;
- pass a canary/path scan proving no production input or generated public file references the lab;
- preserve the accepted public supporting-route bytes through CP5.

No tracked route storyboard PNG, video, GIF, MP4, WebM, PDF or ZIP is permitted in Phase 5A. The compact tracked authority is planning and prototype source only. Review derivatives belong in the external human-review package.

## 3. System thesis

Supporting routes begin inside the Operating Field. They inherit its material logic, typographic pressure and causal motion grammar, but they do not replay its entrance.

The shared character is:

`precision instrument × industrial documentary × editorial architecture`

The route system is not a reusable visual template. It is a family of distinct operating conditions held together by a limited set of materials, type roles, motion verbs, navigation laws and publication controls.

Every route receives:

1. immediate semantic availability and settled site chrome;
2. one authored overture in normal flow;
3. one dominant spatial thesis;
4. at most one signature behavior;
5. a route-specific use—or deliberate absence—of the conductive datum;
6. restrained copy with one meaningful H1;
7. a static premium composition for reduced motion and no JavaScript;
8. a lean route-local performance envelope;
9. a clear next internal route where publication permits one.

No route receives:

- the proving-hall film, CRT startup, spiral, portal runway or `WHERE DO YOU ENTER?`;
- a second homepage chapter stack;
- a universal black-heading-grey-panel template;
- a sticky chapter, scroll lock, snap point, horizontal scroller or input interception;
- continuous ambient animation or an automatic route transition;
- a dashboard, filter system, carousel, card catalogue, testimonial strip or logo wall;
- fabricated people, partners, facilities, metrics, contact destinations, outcomes or confidential material.

## 4. Navigation and document-entry law

Supporting-route navigation is a normal document navigation. A cross-document visual animation is not part of Phase 5B scope.

- The destination document paints its semantic content immediately.
- The normal Quantum header, current-route state, skip link and footer are present from the first route frame.
- No route entry waits for media, JavaScript, a transition controller or a previous-page state.
- The current navigation labels remain `For industry`, `For startups`, `Industries`, `Proof`, `SPARK`, `About`, and `Contact`.
- `/pocs/maradin/` remains grouped under the current `Proof` navigation item; its own field-record context is established in-page.
- The mobile `<details>` navigation remains usable without JavaScript. Enhancement may retain Escape, outside-click closure and focus return.
- Open-mobile-navigation compositions are mandatory review states at portrait and short-landscape sizes.
- Focus navigation moves the native document normally. Visual state must recompute from the resulting document position without covering the focused element.
- The 404 retains the same reliable navigation and a direct recovery route.

## 5. Spatial grammar

The common world uses architectural relationships rather than repeated components:

- **boundary** — separates a broad condition from a testable one;
- **aperture** — exposes approved evidence or a consequential route;
- **corridor** — creates alignment, transfer or access without becoming a flowchart;
- **plane** — supplies institutional mass and editorial depth;
- **seam** — relates adjacent conditions without becoming a progress line;
- **threshold** — changes the meaning of the operating condition;
- **void** — provides pause, emphasis and calm agency;
- **documentary breach** — allows approved real evidence to displace abstraction.

Each route owns one dominant geometry:

| Route | Dominant geometry |
| --- | --- |
| For industry | pressure chamber and challenge aperture |
| For startups | alignment corridor and field-access threshold |
| Industries | four consecutive material territories |
| Proof | one deep evidence aperture |
| Maradin | documentary field cuts and observation shutters |
| SPARK | dormant runway and closed threshold |
| About | interlocking institutional planes and editorial spine |
| Contact | calm arrival plane and three intent rails |
| 404 | displaced plane and interrupted seam |

No dominant geometry may be reused as another route's primary composition.

## 6. Conductive datum policy

The datum remains connective tissue, not the protagonist. It is never a global progress meter, decorative underline, animated border or route diagram.

| Route | Datum role |
| --- | --- |
| For industry | ownership-and-criteria edge that bounds the challenge |
| For startups | alignment rail that ends after field entry |
| Industries | local territory seam; absent in passages that do not need it |
| Proof | evidence-aperture edge that disappears when the record opens |
| Maradin | occasional crop or caption edge; mostly absent around imagery |
| SPARK | runway edge terminating at the closed threshold |
| About | implied joint or editorial spine rather than a visible current |
| Contact | quiet terminus and target alignment |
| 404 | interrupted neutral seam; no active magenta current |

Only a currently consequential edge may use magenta. Resolved structure returns to graphite or a pale editorial rule. Documentary media is never outlined, bisected or overprinted by the datum.

## 7. Material system

The accepted Dark V2 material world remains authoritative:

- **proving black** — `#0e1112`; uninterrupted ground and deepest void;
- **graphite plate** — approximately `#151a1b` to `#1a2020`; matte operating surfaces;
- **structural graphite** — `#283030` to `#3a4444`; restrained edge and load definition;
- **warm shadow** — approximately `#14090f`; electrical residue, never a decorative glow field;
- **editorial rule** — low-contrast pale boundary derived from resolved raster structure;
- **documentary light** — approved Maradin media allowed to break the abstract darkness;
- **conductive magenta** — `#d82b72` / `#f06ba0`; active route, focus and consequential state only;
- **Quantum white** — decisive hierarchy and legibility, not a permanent full-field surface except where documentary light requires it.

Texture comes from tonal separation, crop, shadow, scale, edge reflection and static fine grain. Do not introduce glassmorphism, neon atmospheres, random gradients, particles, radar motifs, faux telemetry, generic noise video or pseudo-industrial metal textures.

Route-specific material accents are permitted only when they communicate the route thesis:

- load shadow and compressed slab for For industry;
- tolerance rails and exterior void for For startups;
- low velocity planes, stacked transfer volumes, rigid fixtures and tall load spans for Industries;
- archival graphite and documentary light for Proof;
- asphalt, field light and black editorial cuts for Maradin;
- dormant graphite and restrained warm residue for SPARK;
- deep institutional strata for About;
- near-black arrival walls for Contact;
- neutral misregistration for 404.

## 8. Typography system

The accepted font files and roles remain unchanged:

- **Syne 800** declares decisive route states and short chapter propositions;
- **Newsreader 400** carries context, documentary evidence and human/institutional meaning;
- **Inter 400–600** carries labels, metadata, status, navigation and compact controls.

Rules:

- one H1 per route with a logical H2/H3 hierarchy;
- no word splitting, discretionary hyphenation, clipped heading boxes or forced single-line headings;
- no fixed-height copy containers;
- no distorted, blurred or scale-animated semantic type;
- route labels and status text remain selectable semantic text;
- long headings wrap by phrase and retain reading order at 320 px, fallback fonts and 200% text;
- a long mobile H1 may use the accepted Newsreader pressure treatment when Syne cannot wrap safely, but this is an authored route decision rather than a universal breakpoint trick;
- documentary captions use Newsreader or Inter according to whether they explain meaning or identify evidence;
- magenta text is reserved for active state or precise metadata, not entire headings.

## 9. Motion modes

Supporting routes use three progressive-enhancement modes.

### Mode A — static architecture

CSS and semantic HTML supply the complete experience. Hover, target and focus states are instantaneous and optional.

Routes: Contact and 404.

### Mode B — bounded threshold state

An element changes between a small number of authored states when its own bounds cross a viewport reference. `IntersectionObserver` or an equivalent small observer may toggle state. There is no continuously running loop.

Routes: Maradin, SPARK and About. Proof may use this mode if a continuous aperture adds no meaningful information.

### Mode C — local document-progress mapping

One route-local controller derives a normalized value from the current document position and cached element bounds. Scroll and resize input request at most one animation frame; the frame writes only bounded custom properties. State is recalculated from current position, so reverse and fast scrolling are exact.

Routes: For industry, For startups, Industries, and optionally Proof.

All modes obey:

- no cancelled wheel/touch/key input;
- no synthetic scroll writes;
- no timer, autoplay, catch-up timeline or queued playhead;
- no sticky route chapter;
- no continuous `requestAnimationFrame` loop;
- no layout reads after writes inside the update frame;
- transforms, opacity and a restrained clip are preferred over layout animation;
- latest document position wins after fast scroll;
- reverse uses the same state function with decreasing progress;
- semantic content is complete before enhancement begins;
- reduced motion and no-JS never initialize a motion controller.

## 10. Motion verbs by route

| Route | Primary verbs | Intended consequence |
| --- | --- | --- |
| For industry | Focus → Cross → Resolve | pressure becomes a bounded challenge, test and decision |
| For startups | Conduct → Focus → Cross → Resolve | a signal aligns with real constraints before field entry |
| Industries | Cross → Release | each operating condition materially changes the field |
| Proof | Focus → Cross | one quiet aperture yields to one real record |
| Maradin | Cross → Resolve → Release | observation becomes an evidence sequence with limits intact |
| SPARK | Conduct → Resolve → Release | the runway reaches a closed gate and continues as context |
| About | Focus → Resolve | two institutional frames clarify Quantum's position between them |
| Contact | Focus → Resolve | an incoming intent aligns with the correct starting context |
| 404 | Resolve → Release | dislocation yields to a reliable recovery route |

## 11. Route-to-route transition contract

Cross-document transitions are conceptual continuity only. Navigation must not wait for an animation, preserve a visual playhead or synthesize shared-element motion.

| Source | Destination | Compositional continuity at destination | Runtime behavior |
| --- | --- | --- | --- |
| settled homepage | any supporting route | destination overture is already inside the Operating Field | normal navigation; no CRT replay |
| For industry | Proof | bounded challenge edge becomes an evidence aperture conceptually | immediate Proof document |
| For industry | Contact / `#for-industry` | decision edge terminates at the industry intent rail | native hash navigation |
| For startups | SPARK | alignment corridor becomes a dormant programme runway | immediate SPARK document |
| For startups | Contact / `#for-startups` | aligned route terminates at the startup intent rail | native hash navigation |
| Industries | For industry | current territory returns to a challenge boundary | normal navigation |
| Industries | Contact / `#for-industry` | territory context resolves into a challenge starting point | native hash navigation |
| Proof | Maradin | archive aperture gives way immediately to documentary field reality | normal navigation; no media autoplay |
| Maradin | Proof | field record returns to the one-record archive | normal navigation |
| Maradin | Contact / `#for-industry` | evidence sequence resolves to an industry starting context | native hash navigation |
| SPARK | Contact / `#for-startups` | closed runway releases into the non-application startup path | native hash navigation |
| About | For industry / For startups | institutional interlock releases into the selected audience condition | normal navigation |
| any route | Contact | the incoming hash identifies one of three intent contexts | content is present before target styling |
| unknown URL | 404 | the system becomes quietly misregistered, not cinematic | real HTTP 404; normal recovery links |

No cross-route transition requires `document.startViewTransition`, history interception, route prefetch animation, session state or a client router.

## 12. Media system and decision

Real media is essential only where evidence is the subject.

### Proof index

Use only:

- `/media/maradin/maradin-field-aperture-poster-approved.jpg` — 86,343 bytes.

The poster is sufficient. Do not load video on the index. The semantic record remains complete if the image fails.

### Maradin field record

The complete governed set is sufficient:

- `maradin-field-aperture-approved.mp4` — 3,962,341 bytes;
- `maradin-field-aperture-poster-approved.jpg` — 86,343 bytes;
- `maradin-test-contact-approved.mp4` — 4,133,483 bytes;
- `maradin-prove-field-frame-approved.jpg` — 169,156 bytes;
- `maradin-real-field-still-approved.jpg` — 961,699 bytes.

Videos remain native, muted-capable, user-initiated, `playsinline`, and `preload="none"`. Stills below the first evidence aperture remain lazy. Do not re-encode, recolor, retouch or overwrite the approved assets in Phase 5A. The field still's frozen EXIF orientation and intended portrait crop must be preserved through CSS composition rather than destructive binary change.

### All other routes

The authored abstract composition is the accepted fallback and the recommended primary design. Repository Maradin media may not be reused as generic industry, programme, institutional or contact imagery.

No connected Google Drive review is required to complete this preproduction thesis. Any later request for a real operating-context or Herzliya asset requires a new human-approved search brief and independent verification of ownership, subject, location security, people, PPE, screens, badges, logos, relationship implication and current publication permission. Discovery never grants publication authority.

Prohibited media includes stock, scraped partner media, AI-generated factories or people, generated employees, promotional montages, Higgsfield output, confidential Drive material and placeholder boxes.

## 13. Responsive system

Every route must be authored and reviewed at:

| Family | Viewport | Required interpretation |
| --- | ---: | --- |
| desktop | 1440×900 | full spatial overture and complete chapter rhythm |
| short desktop | 1366×650 | compressed depth, no viewport-height text trap |
| tablet landscape | 1024×768 | reduced lateral distance and complete navigation |
| tablet portrait | 768×1024 | vertical architecture, not a desktop crop |
| mobile portrait | 390×844 | independently composed route identity |
| narrow mobile | 320×800 | hard gate for wrapping, touch targets and overflow |
| mobile landscape | 844×390 | short-landscape composition with reachable open navigation |

Shared responsive laws:

- native vertical flow at every size;
- no new sticky section on any supporting route;
- no horizontal document overflow at any required viewport;
- no word splitting or fixed-height text box;
- route geometry yields before semantic type becomes compressed;
- background layers reduce in number and depth on mobile;
- media uses explicit aspect ratios and factual captions;
- interactive targets remain at least 44 CSS pixels where practical;
- 200% text uses content-driven height and preserves complete headings, captions, controls and links;
- fallback-font captures use the accepted Arial/Georgia/Helvetica families and may not overlap geometry;
- open mobile navigation is tested with long route headings behind it and at 844×390;
- portrait sequences become consecutive full-width conditions rather than a sideways imitation;
- short landscape places the signature geometry beside or behind a compact text column and never requires a full viewport of empty overture space.

## 14. Reduced-motion and no-JS continuity

Reduced motion is an authored edition, not the enhanced state with durations set close to zero.

- no scroll-linked transform, line drawing, aperture interpolation, parallax or automatic media playback;
- every route displays the most legible resolved static geometry;
- semantic chapters remain in normal flow;
- Proof and Maradin use approved stills/posters and native user-initiated controls;
- magenta identifies focus, target or status only;
- no hidden content waits for an observer class;
- navigation, target anchors and recovery links remain complete.

No-JS is the same semantic document with enhancement absent:

- no `is-enhanced` class means all required content and final geometry are visible;
- native `<details>`, links, anchors and video controls remain available;
- there is no blank reserved canvas, placeholder geometry or uninitialized progress state;
- the Contact hash destinations remain native document targets;
- the 404 recovery remains immediate;
- failure of a route controller never changes document height or blocks the next route.

## 15. Accessibility and semantic contract

- Preserve the existing skip link and `main` focus target.
- Use one H1 and ordered headings; visual chapter order must match DOM order.
- Do not use `aria-hidden` on meaningful route text, evidence, status or media captions.
- Decorative planes and seams are pseudo-elements or explicitly hidden from assistive technology.
- Every informative image retains approved alt text; captions state only approved facts.
- Native videos retain controls and text fallback. No meaning depends on motion or audio.
- `Applications closed` is text, not a color-only or geometry-only state.
- Contact intent groups have stable IDs and readable target/focus states.
- 404 identifies an error semantically and offers an ordinary link to recovery.
- Keyboard focus must remain above decorative planes and inside the visible viewport.
- Pointer hover, device tilt, cursor position and touch pressure never carry required meaning.

## 16. Performance envelope

All estimates are incremental raw source budgets before minification and compression.

### Shared target

| Surface | Budget |
| --- | ---: |
| shared supporting-route CSS | ≤ 8 KB |
| shared progress/measurement helper | ≤ 1.5 KB JS |
| largest route-local controller | ≤ 4 KB JS |
| third-party runtime | 0 bytes |
| continuous animation loops | 0 |
| additional route fonts | 0 bytes |
| non-proof route media | 0 bytes |

### Route target

| Route | CSS | JS | Media at initial route load | Long-task risk |
| --- | ---: | ---: | ---: | --- |
| For industry | 5–7 KB | 1.5–2.5 KB | 0 | low |
| For startups | 5–7 KB | 1.5–2.5 KB | 0 | low |
| Industries | 7–10 KB | 2.5–4 KB | 0 | medium if all territory layers stay active |
| Proof | 4–6 KB | 0–1.5 KB | about 86 KB | low |
| Maradin | 6–9 KB | 1–2 KB | poster first; lazy stills | medium during user-initiated decode |
| SPARK | 4–6 KB | 0–1.5 KB | 0 | low |
| About | 4–6 KB | 0–1.5 KB | 0 | low |
| Contact | 2–4 KB | 0 | 0 | minimal |
| 404 | 1–2 KB | 0 | 0 | minimal |

Runtime requirements:

- measure on initialization, resize, font completion where needed, and structural change—not on every scroll event;
- one input-driven frame writes custom properties for all active local states;
- no more than four composited spatial layers in Industries and three on any other route;
- deactivate offscreen masks and transformations;
- avoid large blurred shadows and fixed full-screen filters;
- do not load route scripts on routes that do not use them;
- no video request outside Maradin and no video request before direct user intent;
- remove an effect if it causes a main-thread task over 50 ms or visible scroll hesitation;
- prefer no effect over a degraded imitation.

The existing `/media/maradin/*` paths do not have an explicit immutable `_headers` rule. Phase 5B must not add long-lived immutable caching to unhashed filenames unless replacement policy and provenance paths are updated together.

## 17. Publication and factual-safety law

The deny-by-default Phase 1 publication boundary remains binding.

- Exactly four public industries.
- Maradin is the only public proof.
- SPARK reads exactly `Applications closed` wherever status appears.
- CHAMP remains a minimal industry-side programme context; no metrics or invented programme detail.
- No public partner identities, partner wall, team member, portrait, metric, testimonial, update or current-signal item.
- No defense or dual-use taxonomy, teaser, geometry label, alt text, filename or metadata.
- No form, application, waitlist, email, phone number, response-time promise, backend or contact API.
- No POC, procurement, customer, investment, deployment or commercial-success guarantee.
- No fake facility, employee, partnership, sponsor, scale, KPI or anonymous case.
- No confidential material becomes publishable because it was found in Drive.
- Approved Maradin narrative may not acquire numeric overlays or expanded outcome language.
- Visible brands in approved evidence remain documentary context, not endorsement.

## 18. Phase 5B implementation handoff

Phase 5B may begin only after all six Phase 5A human gates receive explicit ACCEPT. A future implementation should use this separation:

- one small shared supporting-route material/typography layer;
- one route-specific CSS file per spatial identity;
- route-specific semantic markup rather than a universal page-template component;
- one optional shared measurement helper with route controllers imported only where needed;
- no client router, React, GSAP, Three.js, WebGL, canvas framework or custom scrolling library;
- no changes to publication-controlled records without a separate content approval;
- no media additions without a registered source, hash, classification and approval state;
- no new public route or sitemap entry without approval;
- exact reduced-motion and no-JS acceptance tests before visual enhancement is enabled.

The likely production topology is planning guidance only:

```text
src/styles/routes/supporting-system.css
src/styles/routes/for-industry.css
src/styles/routes/for-startups.css
src/styles/routes/industries.css
src/styles/routes/proof-index.css
src/styles/routes/maradin.css
src/styles/routes/spark.css
src/styles/routes/about.css
src/styles/routes/contact.css
src/styles/routes/not-found.css

src/scripts/routes/route-progress.ts
src/scripts/routes/for-industry.ts
src/scripts/routes/for-startups.ts
src/scripts/routes/industries.ts
src/scripts/routes/proof-index.ts
```

This topology must not be created during CP3 merely because it is documented here.

## 19. CP3 acceptance assertions

CP3 succeeds only if human review can confirm:

- the nine routes clearly belong to the Operating Field without replaying it;
- every route has a different dominant geometry and signature behavior;
- the datum changes function and is sometimes absent;
- all route content remains truthful under the existing publication boundary;
- Proof and Maradin alone carry real documentary media;
- Contact remains honest while its destination is unverified;
- every route has premium portrait, short-landscape, reduced-motion and no-JS continuity;
- the proposed runtime remains dependency-free, bounded and native-scroll-led;
- all speculative visuals remain local-only and all review media remains external;
- Phase 5B remains unauthorized pending the six human gates.
