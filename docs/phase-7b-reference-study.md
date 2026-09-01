# Phase 7B reference study — one Workpiece changes state

Status: pre-implementation research recorded on 2026-09-01. All references are
behavioral only. No third-party source, branding, asset, copy, library or
runtime dependency is authorized for reuse.

## Research decision

Phase 7B will keep one semantic DOM/SVG Workpiece mounted for the complete
`FRAME → SOURCE → ASSESS → TEST → DECIDE` passage. Its presentation will be a
direct, deterministic projection of current document position. Geometry is
pre-authored, all candidate routes are fixed, previous states remain as quiet
history layers, and stopping document scroll stops METHOD state change.

The research rejects smooth-scroll engines, time-based catch-up, runtime
randomness, card/grid endpoints, copied motion source, WebGL and a new animation
dependency. The accepted Quantum substrate remains DOM, SVG and CSS with one
bounded native-scroll controller.

## Adopted reference mechanics

### 1. CSSWG — Scroll-driven Animations Level 1

- **Source:** [CSS Scroll-driven Animations specification](https://drafts.csswg.org/scroll-animations-1/)
- **Observed behavior:** scroll-driven motion derives progress from scroll
  position, unlike a scroll-triggered animation whose progress is clock-driven.
- **Relevance:** establishes the correct authority for immediate forward and
  reverse reconstruction: the latest document position wins.
- **Adaptation:** one non-sticky chapter wrapper defines a normalized METHOD
  progress value consumed by a bounded sticky visual field.
- **Quantum difference:** no nested scroller, scroll snap, inertial smoothing or
  scroll-triggered playback is introduced.
- **Implementation and performance:** one scalar feeds pre-authored CSS/SVG
  variables. A single requestAnimationFrame may batch a scroll/resize sample,
  but it clears after the write and never interpolates toward an older target.
- **Reduced-motion alternative:** five explicit resolved endpoint compositions,
  not an arbitrary frozen in-between frame.

### 2. MDN — scroll-driven timelines and bounded ranges

- **Source:** [MDN: Scroll-driven animation timelines](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations/Timelines)
- **Observed behavior:** view and scroll timelines can attach presentation to
  bounded ranges and pause or reverse with scroll position.
- **Relevance:** OPEN FIELD, the five METHOD states and RELEASE can be normalized
  inside one chapter rather than tied to fragile page-wide pixel constants.
- **Adaptation:** each state has an explicit start, transition and resolved end;
  semantic copy remains ordinary document content.
- **Quantum difference:** declarative timelines are not the sole cross-browser
  authority. The controller uses the same model with a bounded fallback where
  support or evidence requires it.
- **Implementation and performance:** one chapter measurement on init/resize;
  no observer per stage and no repeated layout read after style writes.
- **Reduced-motion alternative:** detach continuous movement and expose the five
  authored static state compositions in normal document flow.

### 3. NRK — documentary scroll-driven storytelling

- **Source:** [Chrome for Developers: How NRK uses scroll-driven animations to bring stories to life](https://developer.chrome.com/blog/nrk-casestudy)
- **Observed behavior:** stable editorial layers use scroll progress as
  progressive enhancement, with a meaningful resolved representation for
  reduced motion.
- **Relevance:** TEST must cross from abstraction into governed documentary
  authority without changing interaction grammar.
- **Adaptation:** a neutral material/contact surface appears through the existing
  Workpiece aperture while surrounding interference quiets.
- **Quantum difference:** no invented facility, person, machine, result or
  measurement is depicted; no project-specific performance claim is reused.
- **Implementation and performance:** keep the documentary surface CSS-authored
  and bounded inside the existing aperture; avoid a new media request.
- **Reduced-motion alternative:** show the resolved TEST contact registration
  directly, without a large pan, zoom or brightness change.

### 4. Annnimate — Multi Flip disorder to order

- **Source:** [Annnimate: Multi Flip](https://annnimate.com/animations/multi-flip/html)
- **Observed behavior:** overlapped, varied elements reorganize from a disordered
  pile into a legible aligned composition as scroll advances.
- **Relevance:** behavioral reference for SOURCE becoming ASSESS.
- **Adaptation:** fixed candidate signal paths begin misaligned and differently
  weighted; unsupported routes lose structural support, collapse and remain as
  faint memory while viable geometry aligns around the Workpiece.
- **Quantum difference:** no cards, random angles, product grid, copied source,
  GSAP, Flip or ScrollTrigger.
- **Implementation and performance:** a small fixed SVG route inventory changes
  only transform, opacity, stroke width and dash treatment; nodes are not added
  or removed during scroll.
- **Reduced-motion alternative:** SOURCE shows the resolved disorder state and
  ASSESS shows the resolved pruned alignment as separate static compositions.

### 5. Codrops — on-scroll layout formation

- **Source:** [Codrops: Exploration of On-Scroll Layout Formations](https://tympanus.net/codrops/2024/09/18/exploration-of-on-scroll-layout-formations/)
- **Observed behavior:** elements arrive from different origins while a pinned
  composition gradually assembles into one coherent layout.
- **Relevance:** candidate routes can acquire or fail structural registration
  around one persistent centre.
- **Adaptation:** perimeter traces enter the field, meet the FRAME aperture and
  leave route memory whether selected or rejected.
- **Quantum difference:** the endpoint is not a gallery or grid; it is one
  constrained evidence architecture.
- **Implementation and performance:** every route start and endpoint is authored
  ahead of time; no live FLIP measurement or responsive DOM rebuilding.
- **Reduced-motion alternative:** separate resolved SOURCE and ASSESS states in
  normal vertical flow.

### 6. Codrops — persistent identity across layout change

- **Source:** [Codrops: Scroll-Based Layout Animations](https://tympanus.net/codrops/2023/07/20/scroll-based-layout-animations/)
- **Observed behavior:** a visually persistent element can retain identity while
  its spatial relationship changes between markedly different endpoints.
- **Relevance:** Phase 7B succeeds only if the visitor perceives one Workpiece
  changing state rather than five replacement scenes.
- **Adaptation:** one Workpiece subtree remains mounted; constraints, paths,
  aperture, contact and registration accumulate within it.
- **Quantum difference:** no image gallery, layout-swapping plugin, class-timed
  playback, GSAP or Flip dependency.
- **Implementation and performance:** use CSS/SVG variables, transforms,
  opacity and strokes; avoid width/height animation and per-scroll layout reads.
- **Reduced-motion alternative:** preserve the same central outline across all
  five static state compositions.

### 7. Codrops — SVG shape morphing

- **Source:** [Codrops: How to Animate SVG Shapes on Scroll](https://tympanus.net/codrops/2022/06/08/how-to-animate-svg-shapes-on-scroll/)
- **Observed behavior:** compatible SVG path endpoints can change a persistent
  aperture and reveal clipped material without a 3D engine.
- **Relevance:** supplies the conceptual shift from abstract possibility to
  physical contact at TEST.
- **Adaptation:** the FRAME aperture hardens into a restrained documentary
  registration while the same outer boundary remains visible.
- **Quantum difference:** no wave motif, image sequence, Lenis, ScrollTrigger or
  perpetual morph. Quantum uses authored structural geometry.
- **Implementation and performance:** peripheral layers use compositable
  transforms/opacity; repaint-heavy shape change is limited to the central
  aperture and only sampled when document position changes.
- **Reduced-motion alternative:** switch directly to the resolved TEST aperture.

### 8. The Pudding — reconstructible fast-scroll states

- **Source:** [The Pudding: Making Internet Things, Part 3 — Storytelling](https://pudding.cool/process/how-to-make-dope-shit-part-3/)
- **Observed behavior:** one persistent visual responds to semantic narrative
  positions, and skipped steps require every visual state to be reconstructible.
- **Relevance:** directly supports fast-forward, immediate reverse and no queued
  METHOD playback.
- **Adaptation:** `render(progress)` is idempotent. DECIDE renders correctly even
  if no intermediate state was sampled.
- **Quantum difference:** semantic sections locate the story but never launch a
  time-based stage timeline.
- **Implementation and performance:** one read phase and one bounded write phase
  per requested frame; no delayed callbacks, chained promises or catch-up tween.
- **Reduced-motion alternative:** the same state specification selects discrete
  endpoints instead of continuous values.

### 9. The Pudding — responsive scrollytelling

- **Source:** [The Pudding: Responsive scrollytelling best practices](https://pudding.cool/process/responsive-scrollytelling/)
- **Observed behavior:** mobile should keep a sticky transformation only when it
  carries meaning; otherwise resolved states stack in native flow. Hover cannot
  carry essential information.
- **Relevance:** Phase 7B explicitly requires an authored mobile system rather
  than a crop of desktop.
- **Adaptation:** desktop and tablet use one bounded sticky Workpiece. Narrow and
  reduced/no-JS modes use fewer simultaneous routes and stronger vertical
  resolved states while preserving the same central outline and history.
- **Quantum difference:** no custom touch behavior or overridden native scroll.
- **Implementation and performance:** reduce path density, blur and simultaneous
  occlusion on narrow screens without rebuilding the visual tree.
- **Reduced-motion alternative:** the same stacked resolved semantic treatment.

### 10. Imagine This — persistent central product precedent

- **Source:** [Imagine This: Dopo immersive portfolio case study](https://imaginethisagency.com/dopo-casestudy)
- **Observed behavior:** a central object remains the perceptual anchor while its
  spatial relationships change, with screen-family-specific presentation.
- **Relevance:** supports Workpiece identity and accumulated history.
- **Adaptation:** boundaries, route memory, contact registration and signal
  precision accumulate around one stable 2D/SVG condition.
- **Quantum difference:** no literal product, camera fly-through, frame sequence,
  WebGL or 3D engine.
- **Implementation and performance:** one stable DOM/SVG tree and responsive
  endpoint rules; zero added asset or runtime-dependency bytes.
- **Reduced-motion alternative:** retain the same central silhouette and traces
  across five resolved compositions.

## Adopted Phase 7B mechanic ledger

| Mechanic | Adoption | Quantum implementation |
| --- | --- | --- |
| Direct scroll authority | Adopt | One bounded document-progress scalar; no time interpolation |
| Persistent central identity | Adopt | One mounted Workpiece subtree from OPEN FIELD through DECIDE |
| Disorder to order | Adopt behavior only | Deterministic candidate paths reorganize and ghost |
| Bounded sticky field | Adopt on capable wide/tablet layouts | Semantic passages remain in normal document order |
| Documentary aperture | Adopt without new media | Neutral governed CSS material/contact surface |
| History retention | Adopt | FRAME boundary, route memory, alignment and contact registration persist |
| FLIP/GSAP/ScrollTrigger | Reject | Original CSS/SVG transforms and path treatments |
| Smooth scroll / catch-up | Reject | Native document scroll; latest position wins |
| WebGL / 3D engine | Reject | Existing DOM/SVG/CSS substrate is sufficient |
| Runtime randomness | Reject | Fixed candidate inventory and authored geometry |
| Large mobile sticky crop | Reject | Authored narrow composition and resolved fallback states |

