# Phase 0.2 typography and layout contract

Status: binding Phase 0.2 shared-source contract; keepout-aware v12 browser gate passes 46/46 cases with 36/36 captures directly audited; human typography and portal review pending; Phase 1 locked

## Scope and separation

This contract governs two related but distinct non-production review surfaces:

1. the final physical Field Unit screen and the first semantic portal DOM frame;
2. the separate cinematic hero-composition typography study.

They must not be conflated. The portal H1 is exactly:

```text
WHERE DO YOU ENTER?
```

The public hero H1 remains:

```text
Prove it where it has to work.
```

The hero copy is used only in the responsive composition harness. It is not permitted in the authoritative portal-layout JSON or on the physical screen.

This remains Phase 0 work. It does not change the public Phase 0 root, create a public route, integrate production cinematic media, authorize Phase 1, or change the accepted one-scroll-root architecture.

## Authoritative shared source

The sole coordinate and copy authority for the physical portal screen, semantic portal DOM reference, and alignment overlay is:

```text
artifacts/original/phase-0-3d-repair-v2/portal-layout.json
```

Schema:

```text
quantum-hub.phase-0-3d-repair-v2.portal-layout.v1
```

Consumers must read that file directly or record its exact SHA-256 in a generated manifest. Hand-copied coordinates are not authoritative.

The reference coordinate system is 1920x1200 pixels, with a top-left origin, X increasing rightward, and Y increasing downward. Boxes are `x, y, width, height`; baselines are `x, y`; rules are endpoint pairs. Exact 16:10 actual-copy reference mode uses the serialized `cover`/maximum-scale transform and retains sub-pixel precision until raster output. Other aspect ratios and every zoom, long-copy, reduced-motion, or mobile stress state use responsive DOM flow; a reference-anchor delta is explicitly not applicable there.

The text-bearing `physical-layout.png`, `dom-layout.png` and 50% overlay are reserved for the separate shared-spec alignment sheet. Every live DOM-owned portal state—including exact 16:10 reference projection—uses the text-free `physical-glass-base.png`, so no raster headline or route label can sit behind semantic copy. Exact 16:10 still applies the JSON projection and anchor checks to the DOM layer. The browser report records projection mode, scene classification, source path, and a doubled-copy assertion that requires the text-free live scene rather than trusting classification alone.

## Portal editorial composition

The portal surface is an editorial negative-space composition, not a dashboard panel or full copy box. It contains only:

- the Quantum-Hub navigation baseline;
- the sparse signal line `test route available`;
- the eyebrow `industrial innovation · herzliya`;
- the H1 `WHERE DO YOU ENTER?`;
- the five-stage carrier `Frame / Source / Assess / Test / Decide`;
- the audience paths `For industry` and `For startups`;
- one restrained divider inside the audience region, below the H1.

There is no decorative rule near the signal line or H1, no box around the copy cluster, and no second audience divider.

## Reference anchors

All coordinates below are reference pixels and are serialized in the shared JSON.

| Anchor | X | Y | Meaning |
|---|---:|---:|---|
| Navigation baseline | 120 | 112 | Quantum-Hub wordmark baseline |
| Signal-line baseline | 120 | 234 | Sparse operating signal |
| Eyebrow baseline | 120 | 302 | Editorial eyebrow |
| H1 top-left | 120 | 338 | Reference H1 box origin |
| H1 line-one baseline | 120 | 420 | `WHERE DO YOU ENTER?` baseline |
| Route baseline | 120 | 558 | Five-stage carrier baseline |
| Audience-region top-left | 120 | 660 | Audience choice region |
| Audience-divider top | 690 | 690 | Sole divider start |
| Audience-divider bottom | 690 | 804 | Sole divider end |
| Industry baseline | 120 | 760 | First audience path |
| Startups baseline | 810 | 760 | Second audience path |

The physical-screen and semantic-DOM anchor centers may differ by no more than 3 CSS pixels after both are projected into the same raster viewport.

## H1 line breaks

Reference and wide mode uses one exact line:

```text
WHERE DO YOU ENTER?
```

Compact and mobile portal modes use two explicit lines:

```text
WHERE DO YOU
ENTER?
```

The separate hero-composition QA uses the same three authored lines at wide,
portrait and mobile sizes so the semantic copy can reflow around the scene
without changing words:

```text
Prove it
where it has
to work.
```

The 25%-longer fixture is explicitly non-public and may wrap further within the bounds recorded by the browser report. It must never replace the approved copy in a production source.

## Rule and glyph safety

Every declared glyph bound is expanded by 12 reference pixels on every side. The audience divider must not intersect any expanded bound. The static verifier checks the serialized geometry, and the browser harness repeats the check from the same JSON.

The divider is valid only when:

- it remains entirely below the H1 region;
- its endpoints match the audience-region coordinates;
- it clears both audience labels and every other glyph by at least 12 reference pixels;
- it is the only decorative rule.

## Typography and font delivery

The intended roles remain Syne for display, Newsreader for editorial text, and Inter for UI. No approved binaries are present, and the host font audit did not find these families in the normal operating-system font registry. Phase 0.2 therefore makes no preferred-font delivery claim.

The shared JSON records metric-conscious fallbacks:

| Role | Preferred future family | Phase 0.2 fallback QA stack |
|---|---|---|
| Display | Syne | Arial Black, Arial, sans-serif |
| Editorial | Newsreader | Georgia, Times New Roman, serif |
| UI | Inter | Arial, Helvetica, sans-serif |

The harness deliberately forces the fallback stacks. It contains no `@font-face`, font binary, remote font URL, or font-package dependency. Any later approved font delivery must rerun the complete matrix before acceptance.

## Responsive and stress matrix

The deterministic viewport list is:

| ID | Viewport |
|---|---:|
| desktop-1440x900 | 1440x900 |
| short-desktop-1366x650 | 1366x650 |
| desktop-1280x800 | 1280x800 |
| tablet-landscape-1024x768 | 1024x768 |
| tablet-portrait-768x1024 | 768x1024 |
| mobile-390x844 | 390x844 |
| mobile-360x800 | 360x800 |
| narrow-320x800 | 320x800 |
| mobile-landscape-844x390 | 844x390 |

Normal hero and portal states are measured at every viewport. The short-desktop, 390px mobile, 320px narrow, and 844x390 mobile-landscape modes additionally exercise:

- 200% text zoom;
- the non-public fixture whose visible copy is at least 25% longer;
- forced fallback fonts;
- keyboard focus evidence;
- reduced motion;
- responsive H1 line-count bounds;
- minimum 44x44 CSS-pixel audience controls;
- page and route horizontal-overflow checks;
- per-text-block `scrollWidth`/`clientWidth` and descendant glyph-rectangle overflow checks with offender IDs;
- pairwise content-block collision checks.
- a 16 CSS-pixel exclusion around source-pixel-derived Field Unit and spiral-cable keepouts for every hero state and reduced-portal stress state.

The route carrier wraps into a no-scroll grid. The harness may not mask a defect with `overflow: hidden`, `overflow-x: clip`, or a nested horizontal scroller.

## Hero scene-safety geometry

The copy and scene must be separated by composition, not by an opaque text box.
The normal full-frame grade may remain, but no quiet-left matte or local copy panel
is permitted. The decorative scene alone is clipped inside `.scene-crop`; no
text-bearing container clips overflow.

The exact inner viewport assigns one of three deterministic modes:

- `wide`: the desktop scene is scaled and translated toward the right while all four semantic copy blocks reflow within a quiet-left column no wider than 38vw;
- `portrait`: the independently authored mobile scene is used through the 768px portrait viewport and moved below a compact full-width copy flow;
- `short-landscape`: the desktop scene remains visible at right and low in frame while the complete copy stays in the quiet-left field.

The browser report does not use an arbitrary half-screen rectangle. It projects
calibrated Field Unit and spiral-cable source-pixel bounds through the live
`object-fit`, computed `object-position`, and CSS transform. It records both
non-empty projected keepouts, a 16 CSS-pixel clearance, the permitted copy
region, and per-copy-block intersections. All four blocks—eyebrow, H1,
supporting copy and audience actions—must remain in the permitted region and
must report zero keepout intersections. Automated success remains subordinate
to inspection of the nine actual viewport captures.

The gate has no zoom or fixture exemption. Normal, reduced-motion and
keyboard-focus states retain visible source-projected keepouts and clear them by
at least 16 CSS pixels. In 200% text-zoom and 25%-longer non-public hero states,
the semantic content retains its full enlarged/long dimensions while the
complete decorative scene is translated beyond its isolated clipped crop. The
report must still project both raw source-pixel keepouts, prove that each is
wholly outside the viewport, and record zero text intersections. Text may never
be shrunk merely to preserve scene framing.

## Reduced motion

Reduced-motion cases use the dormant proving-ground still. The harness contains no video element, canvas, frame sequence, animated portal, or cinematic controller. Motion and smooth scrolling are disabled both by an explicit deterministic state and by the `prefers-reduced-motion` media query.

For the reduced-motion portal review states, semantic portal copy owns the frame and the dormant decorative scene is translated fully beyond its isolated crop. The same source-pixel Field Unit and spiral-cable projection used by the hero gate remains applicable: both keepouts must be outside the viewport and every semantic portal block must record zero intersections. This is a collision-safety composition rule, not a claim that reduced-motion users receive cinematic media.

## Non-public compositor and browser API

Harness:

```text
prototypes/phase-0-portal-layout-qa/
```

Local command:

```text
npm run prototype
```

Capture plan:

```text
prototypes/phase-0-portal-layout-qa/capture-plan.json
```

The harness supports deterministic query parameters:

```text
surface=hero|portal
fixture=actual|long
zoom=100|200
motion=no-preference|reduce
chrome=0|1
```

Browser automation waits for:

```js
await window.phase02Ready
```

then reads a fresh measurement from:

```js
await window.runPhase02TypographyCheck()
```

The same result is exposed as `window.phase02TypographyReport` with schema:

```text
quantum-hub.phase-0-3d-repair-v2.typography-collision-browser-report.v1
```

The report records the contract SHA-256, viewport, state, fallback stack, H1 line count, copy-length ratio, collisions, page and route overflow, element bounds, button sizes, rule clearance, reference-mode anchors, focus, reduced motion, and loaded scene dimensions.

The official matrix runs through `runner.html`. It creates a borderless same-origin iframe with exact `vw` and `vh` query dimensions, waits for `window.phase02RunnerReady`, and exposes `window.phase02RunnerReport`. The runner must report an exact CSS iframe viewport match. Device-pixel ratio is recorded honestly from the browser and is not treated as controllable. Because the in-app browser clips visually reliable evidence beyond 1200px, an explicit `captureScale` affects only the outer capture frame: scale 1 through 1200px and `1200 / requested width` above it. The child iframe, media queries, DOM layout and measurements remain at the exact requested CSS viewport. The report records the scale and rendered bounds. The available browser path emits a full-page JPEG and does not expose element screenshots. Its actual raster dimensions are recorded without asserting a CSS-by-DPR relationship. Normalization crops the rendered outer-frame bounds from top-left `0,0`; scale-1 cases are not resampled, while scaled wide cases use Lanczos to restore the requested viewport dimensions. Both hashes and the complete source/crop/resampling relationship are preserved.

Readiness and a two-frame paint barrier are necessary but are not represented as sufficient to stabilize the in-app compositor. Every required visual case takes 11 successive full-page JPEGs and retains the exact-byte modal winner. A valid winner must account for at least 7/11 attempts and may not be tied. The final matrix records the observed minimum and weak-case count. One initial batch reached only 6/11, was rejected rather than promoted, and was recaptured with a valid 8/11 winner; the final matrix records `discardedWeakCaptureAttempts: 1`, `weakCases: 0`, and makes no timing-based determinism claim. This modal policy is a raster-evidence control; it does not change the exact child viewport, page layout, or semantic report.

The evidence-only crop command is `python scripts/normalize-phase02-captures.py`. It uses locally available Pillow without adding an application dependency and updates the machine matrix with both artifacts' integrity metadata.

## Evidence and gate

Human-readable browser evidence belongs in:

```text
artifacts/evidence/phase-0-3d-repair-v2/TYPOGRAPHY_COLLISION_QA.md
```

Machine-readable results belong in:

```text
artifacts/evidence/phase-0-3d-repair-v2/browser-matrix-report.json
```

Original screenshots belong under:

```text
artifacts/evidence/phase-0-3d-repair-v2/captures/
```

The additive verifier is:

```text
scripts/verify-phase0-3d-repair-v2-layout.mjs
```

It validates the shared contract, exact portal/hero separation, anchors, line breaks, safe margins, responsive audience-divider geometry, 12px rule clearance, fallback-only harness, no-clipping/no-scroll boundary, capture plan, modal-capture policy, browser matrix, capture hashes, raster glyph-ink/coverage inside every visible text rectangle, reduced-portal scene safety, and every browser case's pass state.

The rejected matrix generated at `2026-08-17T21:36:42.899Z` is retained only as
superseded process evidence: its DOM-only checks passed, but human inspection
found hero copy overlapping the visible Field Unit and cable.

The matrix generated at `2026-08-17T22:09:19.548Z` (SHA-256
`b253c02f744307df0aafb14bca7ab5a63a38a4a4d9c8bdef294fa59355ea3252`)
is also superseded: it passed the visible 100% compositions, but did not apply
the binding keepout gate to hero 200% and long-copy states.

Later candidates closed the all-hero gate but remained superseded when direct
raster inspection found intermittent compositor-scale/crop outliers, a
short-landscape portal fixture defect, or an unresolved reduced-portal scene
collision. They are process history, not review authorities.

The authoritative v12 replacement was generated at
`2026-08-17T23:12:38.906Z`; its SHA-256 is
`0e0cdf7e578eb24514146ba3826a1ded4191de740b54ce050ada82a676f71905`
and its size is 850,178 bytes. It contains 46/46 passing cases and 36/36
required raw-plus-normalized capture pairs: 25 scale-1 derivatives without
resampling and 11 wide derivatives restored with Lanczos. All 46 reports carry
scene-safety state; 26 apply it and record zero copy/keepout intersections.
Thirteen visible-scene hero cases preserve the normal geometry, ten hero
zoom/long cases keep text unchanged while moving the decorative scene beyond
its crop, and three reduced-portal cases likewise place both frozen scene
keepouts outside the semantic frame. Thus 26/52 projected keepouts are outside
the viewport by design and all 52 are intersection-free. The hero long fixture
changes only its support sentence, from 118 to 148 characters (reported ratio
1.254). Direct full-size inspection of all 36 normalized sources found no
unresolved scale, crop, partial-layer, scene, divider, glyph, or copy defect.
The two exact 16:10 portal cases retain a 0 CSS-pixel maximum anchor delta; DPR
2.5 is recorded rather than claimed as controlled; and the matrix has zero
overflow, text-offender, focus, reduced-motion, rule-clearance, divider, raster
glyph-coverage, or doubled-copy failures.

The companion creative-package gate is:

```text
scripts/verify-phase0-3d-repair-v2-assets.mjs
```

It requires the editable Blender source and bound machine validation report, generation and validation scripts, canonical render/portal/review manifest hashes, source lineage, the still-only boundary, every file below 100 MiB, no video or full-frame sequence, no backup/cache/working output, and no unapproved runtime dependency. Its privacy scan reads raw bytes—including PNG and `.blend` binaries—and tests UTF-8, Latin-1, UTF-16LE and UTF-16BE representations. The PNG sanitation manifest must account for every package PNG, preserve decoded pixels, and agree with each final sanitized file.

The review bundle is exactly these 12 PNGs and no other PNG in `review/`:

```text
field-unit-v2-silhouette-options.png
field-unit-v2-recommended-design-sheet.png
field-unit-v2-material-and-cable-sheet.png
proving-ground-v2-style-frame.png
camera-path-v2-study.png
activation-v2-contact-sheet.png
portal-v2-layout-sheet.png
desktop-hero-composition-v2.png
mobile-hero-composition-v2.png
text-zoom-and-fallback-v2.png
reduced-motion-v2-desktop.png
reduced-motion-v2-mobile.png
```

`review-bundle-manifest.json` must bind all 12 hashes, byte counts and dimensions to `review-originals-manifest.json` or `silhouette-decision-manifest.json`. The three browser-derived hero/typography sheets are additionally governed by `browser-review-composition-manifest.json`: every declared source must match a normalized matrix capture by capture ID, path, SHA-256 and dimensions. `blender-source-validation.json` is the semantic scene authority; the repository verifier binds its pass state, source hash and validator hash without reimplementing Blender scene semantics.

Automated success does not constitute typography or creative acceptance. The physical screen, semantic DOM surface, hero composition, and final responsive typography remain subject to explicit human review. Phase 1 stays locked.
