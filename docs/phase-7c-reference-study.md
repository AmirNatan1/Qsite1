# Phase 7C reference study — Territory Carrier and documentary Proof

Status: pre-implementation research recorded on 2026-09-03. Sources were
reviewed as behavioral and technical references only. No third-party source,
code, branding, copy, imagery, diagram, artwork, font, model, media or runtime
dependency is authorized for reuse.

## Research decision

Phase 7C will extend the precise magenta line that survives DECIDE into one
recognisable Territory Carrier. Native vertical document position remains the
only progress authority. On capable wide layouts, one bounded sticky visual
field may project that vertical progress as lateral and spatial change; the
document itself continues to move vertically and releases normally before and
after the chapter. Mobile, reduced-motion and no-JavaScript presentations will
preserve all four territories and the Maradin-only Proof record without
requiring the wide-layout travel effect.

The references support five operational conclusions:

1. One persistent carrier should transform continuously rather than be replaced
   by four scenes.
2. Sticky positioning is a bounded layout relationship, not permission to
   create a nested scroller or trap input.
3. Every meaningful state must be reconstructible directly from current
   document position, including reverse, fast skip and restoration.
4. Mobile and reduced-motion systems require authored resolved compositions,
   not a cropped or merely frozen desktop treatment.
5. The transition to Proof should borrow the logic of a film gate and precise
   registration, while presenting only governed Maradin evidence and no
   invented documentary scale.

The study rejects smooth-scroll engines, horizontal input capture, time-based
catch-up, arbitrary animation, copied demo treatments, cards, galleries,
dashboards, WebGL, new polyfills and new runtime dependencies.

## Source records

### 1. Codrops — 84—24 case study

- **Source/date:** Michele Giorgi, [Case Study: 84—24](https://tympanus.net/codrops/2024/04/08/case-study-84-24/),
  published 2024-04-08; reviewed 2026-09-03.
- **Reference technology:** Three.js, GSAP and a commercial 3D model are among
  the source project's techniques and assets.
- **Reusable behavioral lesson:** a single perceptual object can retain its
  identity while section-relative scroll progress changes its function and
  surrounding spatial system. The case study also demonstrates a content-first,
  deliberately minimal interface and ordinary vertical page progression.
- **Phase 7C adaptation:** the Territory Carrier remains one DOM/SVG/CSS line
  from DECIDE through Automotive, Logistics, Manufacturing, Energy and the
  Proof threshold. Each territory changes the carrier's operating condition,
  while inherited geometry remains as trace memory.
- **Exact rejection:** no source code, model, visual composition, typography,
  imagery, copy, branding, Three.js, GSAP or landscape-only blocker is reused.
  The source's presentation is not a template for Quantum-Hub.
- **Native-scroll, accessibility and performance consequence:** vertical
  document progress is sampled by the existing bounded dirty/one-RAF pattern;
  all territory names remain semantic content; no 3D render loop, model request
  or added dependency is introduced. Reduced motion uses resolved states rather
  than continuous object travel.

### 2. Codrops — Horizontal Smooth Scroll Layouts

- **Source/date:** Manoela Ilic, [Horizontal Smooth Scroll Layouts](https://tympanus.net/codrops/2020/12/08/horizontal-smooth-scroll-layouts/),
  published 2020-12-08; reviewed 2026-09-03.
- **Reference technology:** the demonstrations use Locomotive Scroll and layered
  CSS presentation.
- **Reusable behavioral lesson:** opposing outer/inner displacement, clipping
  and different depth rates can make a composition read as lateral travel
  while preserving continuity between visible layers.
- **Phase 7C adaptation:** only the perceptual principle is retained. Within the
  bounded wide-layout sticky field, authored SVG/CSS layers may move laterally,
  occlude one another and change depth as the vertical progress scalar advances.
  The carrier remains the stable connective axis.
- **Exact rejection:** no Locomotive Scroll, smooth-scroll engine, source code,
  image, type treatment, layout, easing, custom inertia or demo behavior is
  copied. No horizontal scrollbar, drag gesture, swipe carousel, wheel
  interception or touch interception is permitted.
- **Native-scroll, accessibility and performance consequence:** the document
  keeps its native vertical scroll and semantic order. Visual displacement uses
  bounded transforms/opacity where practical; meaningful copy and links are not
  placed in inaccessible off-screen planes. Mobile becomes an authored vertical
  passage, not a miniature horizontal rail.

### 3. MDN — `position: sticky`

- **Source/date:** MDN contributors, [`position`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/position),
  last modified 2026-07-26; reviewed 2026-09-03.
- **Reference technology:** standards-based CSS positioned layout.
- **Reusable behavioral lesson:** a sticky element participates in normal flow
  until an inset threshold is reached, then remains constrained by its nearest
  relevant scrolling/containing ancestor. Sticky positioning creates a stacking
  context and needs a non-`auto` inset on the relevant axis.
- **Phase 7C adaptation:** one explicit Territory Traverse wrapper owns the
  wide-layout sticky field, its duration and its release. Entry and exit remain
  visible normal-flow transitions, with breathing space from the accepted
  METHOD sticky chapter. Ancestor overflow and stacking contexts must be audited
  because they can change the sticky containing block.
- **Exact rejection:** no fixed full-page takeover, nested scroll container,
  indefinite pinning or sticky scene outside the single authorized Phase 7C
  chapter. Sticky behavior must never become an input trap.
- **Native-scroll, accessibility and performance consequence:** CSS supplies
  the spatial constraint while JavaScript only projects native document
  progress. Semantic territory content stays in document order. The bounded
  wrapper prevents an unending runway and no per-frame layout mutation is
  required to keep the field pinned.

### 4. MDN — `prefers-reduced-motion`

- **Source/date:** MDN contributors, [`prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion),
  last modified 2026-06-10; reviewed 2026-09-03.
- **Reference technology:** the widely available CSS media feature reflects the
  user's operating-system motion preference.
- **Reusable behavioral lesson:** nonessential movement should be removed,
  reduced or replaced. Large panning and scaling can be vestibular triggers;
  replacing a motion treatment may be more appropriate than merely shortening
  it.
- **Phase 7C adaptation:** reduced motion exposes six strong resolved
  compositions: DECIDE release, the four territories and documentary Proof.
  Continuity is carried by repeated geometry and the unchanged carrier rather
  than viewport-scale travel. Restrained opacity or small local transitions may
  clarify a state change.
- **Exact rejection:** no long lateral pan, large zoom, perspective journey,
  animated film transport or essential information available only during a
  transition. Reduced motion is not a blank frozen frame.
- **Native-scroll, accessibility and performance consequence:** native reading
  order and every semantic link remain intact; the Maradin record remains fully
  available. Removing continuous projection lowers visual and runtime work, and
  requires no library or media substitute.

### 5. Chrome for Developers — NRK documentary scrollytelling

- **Source/date:** Una Kravets and NRK contributors, [How NRK uses
  scroll-driven animations to bring stories to life](https://developer.chrome.com/blog/nrk-casestudy),
  published 2025-02-26; reviewed 2026-09-03.
- **Reference technology:** CSS scroll-driven animation, Web Animations and
  progressively enhanced editorial components; the case study also discusses
  richer techniques used by individual stories.
- **Reusable behavioral lesson:** scroll lets the reader control editorial
  progression, but keyboard navigation, assistive technology or fast movement
  may skip intermediate frames. Therefore essential facts must remain available
  and each endpoint must be meaningful without witnessing every transition.
- **Phase 7C adaptation:** every territory and Proof endpoint is directly
  reconstructible from current document position. The same state specification
  must support forward, reverse, fast skip, restoration, mobile and reduced
  motion. Documentary authority increases by quieting the interface around one
  truthful record, not by adding spectacle.
- **Exact rejection:** no NRK component, story treatment, source code, polyfill,
  illustration, media, Lottie asset, Three.js scene or performance number is
  imported or claimed for Quantum-Hub. Large contrast flashes are also rejected
  at the abstraction-to-documentary threshold.
- **Native-scroll, accessibility and performance consequence:** content remains
  present in semantic DOM regardless of sampled animation frames. The latest
  scroll position wins and no queued playback catches up. Performance is
  measured against this repository's own budgets; a source case study's timing
  is context, not evidence.

### 6. Chrome for Developers — ecommerce scroll-driven case studies

- **Source/date:** Swetha Gopalakrishnan and Saurabh Rajpal,
  [Scroll-driven animations case studies](https://developer.chrome.com/blog/css-ui-ecommerce-sda),
  last updated 2024-05-07; reviewed 2026-09-03.
- **Reference technology:** CSS Scroll Timelines and View Timelines integrated
  with CSS Animations/WAAPI, with optional feature detection and polyfill paths.
- **Reusable behavioral lesson:** tying presentation to scroll progress can
  avoid a main-thread scroll-event animation loop, and transforms/opacity are
  useful low-cost projection tools. Mobile and desktop may need distinct visual
  behavior.
- **Phase 7C adaptation:** use the underlying progress-and-range model to define
  bounded territory states and favor compositable properties. The existing
  cross-engine one-RAF controller remains authoritative; supported declarative
  features may be progressive enhancement only if they preserve exact reverse
  and restoration behavior.
- **Exact rejection:** no product card, commerce bar, gallery, cover-flow,
  styled-component sample, source code, company branding, benchmark claim or
  polyfill is reused. The published CPU and code-size improvements belong to
  the cited implementations and are not Quantum-Hub results.
- **Native-scroll, accessibility and performance consequence:** no new
  dependency is added to obtain an animation API. Semantic text is never made
  conditional on timeline support. Unsupported engines and reduced motion
  receive complete resolved states rather than a degraded blank runway.

### 7. W3C — WCAG 2.2 Target Size (Minimum)

- **Source/date:** W3C Web Accessibility Initiative,
  [Understanding Success Criterion 2.5.8: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum),
  WCAG 2.2 guidance; reviewed 2026-09-03.
- **Reference technology:** WCAG 2.2 Level AA defines a 24 by 24 CSS-pixel
  minimum or a spacing-based alternative, subject to listed exceptions.
- **Reusable behavioral lesson:** adequate pointer targets and separation reduce
  accidental activation for people with limited dexterity and for coarse-input
  users; larger targets remain beneficial beyond the conformance floor.
- **Phase 7C adaptation:** retain Quantum-Hub's stronger 44 by 44 CSS-pixel
  project authority for the Maradin link, any Proof link and Field Map controls.
  Record computed target dimensions in the responsive, fallback-font and native
  200% evidence matrices.
- **Exact rejection:** spacing exceptions are not a routine way to shrink
  controls. Decorative carrier and territory geometry will not be made
  interactive or focusable to imitate an interface.
- **Native-scroll, accessibility and performance consequence:** ordinary anchors
  remain keyboard- and touch-usable without JavaScript or hover. Larger targets
  are achieved through CSS layout, with no listener, animation or dependency
  cost.

### 8. Kodak — Essential Reference Guide for Filmmakers

- **Source/date:** Eastman Kodak Company,
  [The Essential Reference Guide for Filmmakers](https://www.kodak.com/content/products-brochures/Film/kodak-essential-reference-guide-for-filmmakers.pdf),
  undated edition; reviewed 2026-09-03.
- **Reference technology:** a technical reference to motion-picture film,
  cameras, lighting, laboratory/post-production workflow, exposure and visual
  continuity.
- **Reusable behavioral lesson:** film is a governed physical chain in which
  capture, transport, exposure, handling and later processing affect the
  authority of the recorded frame. Documentary credibility comes from a
  controlled material path, not an ornamental film look.
- **Phase 7C adaptation:** Energy's load-bearing conduit narrows into one precise
  evidence line; abstract planes settle into an aperture/registration system;
  one governed Maradin record receives authority. Finer grain and quieter
  geometry signal increasing exactness without claiming literal film capture.
- **Exact rejection:** no Kodak diagram, table, illustration, wording, film-stock
  identity, trademark treatment or technical/product claim is copied. Phase 7C
  will not fabricate a film reel, archive, shoot, camera, exposure result or
  documentary provenance.
- **Native-scroll, accessibility and performance consequence:** the metaphor is
  CSS/SVG structure around semantic Proof content, not a new media sequence.
  Reduced motion shows the registered endpoint directly; no-JavaScript presents
  the same Maradin-only record in normal flow; no asset or dependency is added
  merely to look photographic.

### 9. Kodak — Glossary of Motion Picture Terms

- **Source/date:** Eastman Kodak Company,
  [Glossary of Motion Picture Terms](https://www.kodak.com/en/motion/page/glossary-of-motion-picture-terms/),
  living web glossary; reviewed 2026-09-03.
- **Reference technology:** the glossary distinguishes the film gate/aperture,
  individual frame and regular perforations engaged during film transport.
- **Reusable behavioral lesson:** a gate constrains what receives exposure or
  projection authority, while regular transport and registration hold a frame
  in the correct position. These are functional relationships rather than a
  decorative row of sprocket holes.
- **Phase 7C adaptation:** the persistent carrier becomes a registration axis;
  the Energy structure constrains a single documentary aperture; the approved
  Maradin record settles into exact alignment. Any grain/dither transition
  describes interface material becoming quieter, not a factual claim about the
  source medium.
- **Exact rejection:** no glossary text is reproduced beyond ordinary technical
  terms, and no Kodak branding, diagram, perforation artwork or simulated archive
  is used. The design must not imply that Maradin was captured or certified on
  motion-picture film unless separate evidence establishes that fact.
- **Native-scroll, accessibility and performance consequence:** the registered
  endpoint must exist as semantic text and an ordinary link. Film-like movement
  is optional presentation, never required for comprehension, and is absent in
  reduced-motion/no-JavaScript modes. No video decoder is needed by the metaphor.

### 10. CSS Working Group — Scroll-driven Animations Level 1

- **Source/date:** CSS Working Group,
  [Scroll-driven Animations Module Level 1](https://drafts.csswg.org/scroll-animations-1/),
  living Editor's Draft; reviewed 2026-09-03.
- **Reference technology:** scroll progress and view progress timelines derive
  animation progress from a scroll container's position rather than elapsed
  clock time and are designed to coexist with asynchronous scrolling.
- **Reusable behavioral lesson:** scroll-driven state is position-addressed,
  unlike a scroll-triggered timeline that begins time-based playback. The same
  position should resolve to the same visual result, independent of direction
  or how many intermediate samples occurred.
- **Phase 7C adaptation:** territory state is a deterministic function of one
  bounded document-progress scalar. Stopping scroll freezes the projected state;
  reverse reconstructs Proof → Energy → Manufacturing → Logistics → Automotive
  → DECIDE; fast jumps render the destination immediately without catch-up.
- **Exact rejection:** the evolving draft API is not made a mandatory runtime
  prerequisite, and no timeline polyfill is added. No timer, autonomous
  animation, snap point, nested scroller or programmatic position write is used
  to simulate compliance.
- **Native-scroll, accessibility and performance consequence:** the accepted
  scroll/resize/restoration → dirty → one RAF → read → project → stop controller
  remains the cross-engine baseline. It performs one bounded read/write pass,
  leaves no perpetual RAF or interval at rest, and preserves complete semantic
  and fallback content.

### 11. The Pudding — responsive scrollytelling

- **Source/date:** Russell Samora,
  [Responsive scrollytelling best practices](https://pudding.cool/process/responsive-scrollytelling/),
  published 2017-04; reviewed 2026-09-03.
- **Reference technology:** responsive HTML/CSS/JavaScript scrollytelling with
  mobile-specific layout and viewport handling.
- **Reusable behavioral lesson:** mobile behavior must be planned rather than
  inherited accidentally; a sticky transformation should remain only when it
  adds meaning. Swipe/tap stepping can conflict with expected browser scrolling,
  hover cannot be essential, and mobile viewport chrome makes unexamined
  viewport-height assumptions fragile.
- **Phase 7C adaptation:** narrow viewports receive an authored vertical passage
  with one continuous carrier, distinct resolved territory geometry and shorter
  transitions. Dynamic viewport changes, 320px, portrait and short-landscape
  sizes are evidence targets. The full Manufacturing title and Proof link remain
  visible and usable.
- **Exact rejection:** no source code, D3 technique, device-sniffing rule, story
  layout, stepper, card stack, swipe interaction or `100vh` recipe is copied.
  Mobile is neither a cropped desktop rail nor four conventional sections.
- **Native-scroll, accessibility and performance consequence:** touch retains
  native vertical scroll, all content remains in reading order, and essential
  states do not rely on hover. Responsive geometry is authored with CSS and
  bounded resize invalidation, without continuous measurement or a new runtime
  dependency. No-JavaScript removes the sticky runway and exposes all states in
  normal flow.

## Adopted Phase 7C mechanic ledger

| Mechanic | Decision | Quantum-Hub implementation |
| --- | --- | --- |
| Persistent Territory Carrier | Adopt | One recognisable DECIDE signal changes role through four territories and Proof |
| Lateral/spatial perception from vertical progress | Adopt on capable wide layouts | One bounded sticky visual field; native vertical document scroll remains sole authority |
| Layered displacement and occlusion | Adopt behavior only | Authored DOM/SVG/CSS depth layers tied directly to current progress |
| Continuous inheritance | Adopt | Horizon becomes transfer rail, fixture axis, conduit and registration line without full-scene resets |
| Film gate and registration | Adopt as a restrained functional metaphor | One precise aperture grants authority to one governed Maradin record |
| Position-addressed progress | Adopt | Latest document position wins; reverse and fast skip reconstruct directly |
| Authored mobile passage | Adopt | Vertical resolved territorial states, one carrier, reduced simultaneous geometry |
| Resolved reduced-motion states | Adopt | Six complete static compositions with restrained local change |
| No-JavaScript normal flow | Adopt | All four territories and Maradin-only Proof remain semantic and visible; no sticky runway |
| 44px project target authority | Retain | Ordinary links and Field Map controls meet the stronger project threshold |
| Smooth scrolling / horizontal input capture | Reject | No Lenis, Locomotive, inertia, wheel/touch cancellation or horizontal scroller |
| Time-based catch-up / perpetual rendering | Reject | One dirty RAF at most, then stop; no interval or queued transition sequence |
| 3D engine / animation framework / polyfill | Reject | Existing DOM, SVG, CSS and small controller; zero new runtime dependency |
| Cards, galleries, dashboards and fake archives | Reject | One continuous environmental traverse and one truthful Proof record |
| Third-party visual/source reuse | Reject | References inform behavior only; all production geometry, copy and material are original or already governed |

## Implementation and evidence consequences

- The sticky wrapper must have measured, bounded entry and release points and a
  normal-flow interval from METHOD. No ancestor may accidentally create a nested
  scroll authority.
- Territory projection must be idempotent from current document position. Tests
  must cover complete forward/reverse, stop states, fast skip, immediate reverse,
  resize and restoration into each territory.
- Semantic DOM must contain exactly the four approved industries and the single
  Maradin Proof record in meaningful order. Decorative SVG receives no false
  interaction or semantic authority.
- Off-screen visual planes must not expose invisible focus targets. The Maradin
  link and any Proof link remain ordinary anchors, visible on focus and at least
  44 by 44 CSS pixels.
- Wide-layout visual authority cannot substitute for mobile, fallback-font,
  short-landscape, native 200%, reduced-motion or no-JavaScript evidence.
- Performance reporting must measure this implementation's own JS/CSS/HTML and
  asset deltas, DOM/SVG counts, listeners, observers, RAF/interval state, long
  tasks, cycle-attributable CLS and repeated-cycle stability. Reference-project
  benchmark numbers are never reused as Quantum-Hub evidence.
- The documentary transition cannot attach media before user intent. If no
  explicitly accepted production-governed asset is suitable, the approved
  implementation is a neutral documentary aperture and semantic Maradin link,
  not scraped, stock or generated evidence.
- Every adopted mechanic is implementable with the existing DOM/SVG/CSS
  substrate and bounded controller. This study authorizes no new dependency and
  no copied third-party production material.

