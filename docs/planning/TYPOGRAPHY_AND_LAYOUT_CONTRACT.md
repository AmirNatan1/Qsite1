# Phase 0.2–0.3 typography and layout contract

Status: binding shared-source contract; Phase 0.2 evidence remains frozen and passing; authoritative Phase 0.3 matrix, exact 13-image bundle, validation, sanitation, inventory, checks, and static build complete locally; human typography and portal review pending; Phase 1 locked

## Scope and separation

This contract governs two related but distinct non-production review surfaces:

1. the final physical Aperture Station screen and the first semantic portal DOM frame;
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

## Phase 0.3 additive responsive repair

Phase 0.3 preserves the accepted portal geometry and v2 systems. It changes only the non-public responsive typography harness, evidence plan, and additive verification in order to:

- prohibit fragmentation inside every displayed H1/H2 word;
- expose a numeric machine offender count and human-readable rendered line report;
- retain the existing 44px target, collision, overflow, divider, fallback, 200%, longer-copy, focus, and reduced-motion gates;
- replace any large floating rounded reduced-motion panel with a directional full-frame scrim and quiet composition;
- bind the next browser matrix to frozen v3 scene paths and hashes before capture.

The Phase 0.2 matrix and captures remain historical authorities for that accepted run. They are not rewritten by Phase 0.3.

The first v3 scene-ledger candidate was retracted before browser capture because the portrait cable did not expose enough visible turns. The bounded repair is now released: mobile and reduced-mobile use an independently authored 2.25-turn cable, with Blender-projected evidence of approximately 2.171694 visible turns (781.81 degrees) against a 2.15 minimum. Replacement hashes and the regenerated source-keepout authority are frozen in `capture-plan-v3.json`; desktop and portal pixels remained unchanged. This releases the Phase 0.3 evidence capture only, not Phase 1.

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

## Whole-word display safety

Every visible `h1` and `h2`, and every authored line span inside them, must compute:

```text
word-break: normal
overflow-wrap: normal
hyphens: none
```

Responsive wrapping may add lines only between words. The browser report measures every non-whitespace word with a DOM range. `copy.wordFragmentationOffenders` must equal `0`, its detailed offender list must be empty, and `copy.humanLineBreakReport` must record the actual rendered text of each line for human review. This gate is independent of the permitted H1 line-count range: a line-count pass cannot excuse a split word.

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
- a 16 CSS-pixel exclusion around source-pixel-derived Aperture Station and spiral-cable keepouts for every hero state and reduced-portal stress state.

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
calibrated Aperture Station and spiral-cable source-pixel bounds through the live
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

Reduced-motion cases use a dormant proving-ground still. The harness contains no video element, canvas, frame sequence, animated portal, or cinematic controller. Motion and smooth scrolling are disabled both by an explicit deterministic state and by the `prefers-reduced-motion` media query.

For the reduced-motion portal review states, semantic portal copy owns the frame and the dormant decorative scene is translated fully beyond its isolated crop. The same source-pixel Aperture Station and spiral-cable projection used by the hero gate remains applicable: both keepouts must be outside the viewport and every semantic portal block must record zero intersections. This is a collision-safety composition rule, not a claim that reduced-motion users receive cinematic media.

Phase 0.3 adds a visual-composition rule: the copy field may be supported by a directional full-frame scrim, but never by a large floating rounded glass panel. The browser report identifies any viewport-significant rounded surface with a backdrop, shadow, or opaque fill and fails reduced motion if an offender is present. This composition rule does not weaken the normal copy/scene collision, 44px target, overflow, divider, focus, or whole-word gates.

The Phase 0.3 reduced-motion hero evidence must preserve the dormant v3 Aperture Station opposite the copy and keep its physical cable visible in both desktop and authored-mobile compositions. Those hero posters remain subject to the source-projected Aperture Station/cable keepouts. Only the separate reduced portal stress state may translate decorative scene geometry beyond its isolated crop so semantic portal copy owns the frame; that portal treatment is not a precedent for hiding the hero subject.

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

Phase 0.3 additive plan:

```text
prototypes/phase-0-portal-layout-qa/capture-plan-v3.json
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

The Phase 0.3 report additionally records computed whole-word styles, numeric word-fragmentation offender count, offender details, human-readable line breaks, directional-scrim state, and floating rounded-panel offenders.

The official matrix runs through `runner.html`. It creates a borderless same-origin iframe with exact `vw` and `vh` query dimensions, waits for `window.phase02RunnerReady`, and exposes `window.phase02RunnerReport`. The runner must report an exact CSS iframe viewport match. Device-pixel ratio is recorded honestly from the browser and is not treated as controllable. Because the in-app browser clips visually reliable evidence beyond 1200px, an explicit `captureScale` affects only the outer capture frame: scale 1 through 1200px and `1200 / requested width` above it. The child iframe, media queries, DOM layout and measurements remain at the exact requested CSS viewport. The report records the scale and rendered bounds. The available browser path emits a full-page JPEG and does not expose element screenshots. Its actual raster dimensions are recorded without asserting a CSS-by-DPR relationship. Normalization crops the rendered outer-frame bounds from top-left `0,0`; scale-1 cases are not resampled, while scaled wide cases use Lanczos to restore the requested viewport dimensions. Both hashes and the complete source/crop/resampling relationship are preserved.

Readiness and a two-frame paint barrier are necessary but are not represented as sufficient to stabilize the compositor. Every required visual case takes 11 successive full-page JPEGs and retains the unique exact-byte modal winner. A valid winner must account for at least 7/11 attempts and may not be tied. The current Phase 0.3 matrix records an observed minimum of 10/11, zero weak cases, zero ties, zero discarded attempts, and no timing-based determinism claim. The earlier Phase 0.2 authority separately records its own rejected 6/11 round and valid retry as historical evidence; that history is not attributed to Phase 0.3. This modal policy is a raster-evidence control; it does not change the exact child viewport, page layout, or semantic report.

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

The Phase 0.3 additive verifier is:

```text
scripts/verify-phase0-3d-repair-v3-layout.mjs
```

It treats the accepted v2 portal-layout JSON as immutable authority, validates the frozen v3 scene ledger, 46-case plan, whole-word/reduced-motion instrumentation, exact six-file harness ledger, matrix and capture lineage. The current gate rejects any stale harness/cache authority, neutral focus residue, requested-focus mismatch, missing or incomplete matrix, or nonzero case-level offender count.

The rejected matrix generated at `2026-08-17T21:36:42.899Z` is retained only as
superseded process evidence: its DOM-only checks passed, but human inspection
found hero copy overlapping the visible Aperture Station and cable.

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

The authoritative Phase 0.3 matrix was generated at `2026-08-18T10:20:47.772Z`; its SHA-256 is `8272764a01ac18b4aed7b8b0ebffdca812a5f235e51d6c2c2ea6ae744c6ac4fc` and its size is 1,785,125 bytes. It contains 46/46 passing runner and child reports and 36/36 raw-plus-normalized capture lineages. It binds plan SHA-256 `26cf9fc7088d3102b1214c6f8c0c5f1864d02d3d04c52a047b2b17b8ca7db2d5`, harness cache `phase03-layout-v11`, and harness aggregate SHA-256 `c306bd2b33cbc116c60e6171ebf6f1e47a29892d7d8ef57697292d379e178d65`.

All 46 reports contain human-readable line records and zero word-fragmentation offenders. They also record zero horizontal overflow, text offender, collision, undersized-control, rule-clearance, divider, reduced-motion, semantic, scene-readiness, or doubled-copy failure. All 26 applicable Blender-derived Aperture Station/cable scene-safety cases pass with zero copy intersections. Six reduced-motion cases use no animated media and have zero floating rounded-panel offenders. Forty-four neutral states bind `activeReviewControlId: null`; the two requested-focus states bind the exact first audience control and preserve its visible 3px outline. The two exact-reference portal cases retain a 0 CSS-pixel maximum anchor delta.

All 36 normalized Phase 0.3 sources were opened independently at full target size. Direct inspection found no compositor scale/crop race, clipped or fragmented word, neutral-focus residue, opaque copy panel, scene/cable collision, rule collision, horizontal truncation, or partial-layer defect. Eleven wide derivatives have declared Lanczos restoration; the remaining 25 are scale-1 crops without resampling.

The capture authority is harness-sensitive. The runner hashes the exact six-file harness ledger before resume and refuses to reuse a checkpoint when that aggregate changes. Before the v11 focus repair began a fresh authority ledger, it byte-preserved the superseded checkpoint, 36 raw JPEGs, 46 reports, and prior matrix under deterministic `recovery/` paths. The earlier browser-control migration likewise preserves its checkpoint and 19 historical JPEGs. These records remain process provenance and cannot satisfy the current matrix.

The companion creative-package gate is:

```text
scripts/verify-phase0-3d-repair-v2-assets.mjs
```

It requires the editable Blender source and bound machine validation report, generation and validation scripts, canonical render/portal/review manifest hashes, source lineage, the still-only boundary, every file below 100 MiB, no video or full-frame sequence, no backup/cache/working output, and no unapproved runtime dependency. Its privacy scan reads raw bytes—including PNG and `.blend` binaries—and tests UTF-8, Latin-1, UTF-16LE and UTF-16BE representations. The PNG sanitation manifest must account for every package PNG, preserve decoded pixels, and agree with each final sanitized file.

The frozen Phase 0.2 historical review bundle is exactly these 12 PNGs and no other PNG in its `review/` directory:

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

For that historical v2 bundle, `review-bundle-manifest.json` binds all 12 hashes, byte counts and dimensions to `review-originals-manifest.json` or `silhouette-decision-manifest.json`, and three browser-derived hero/typography sheets are governed by its v2 `browser-review-composition-manifest.json`.

The additive Phase 0.3 review bundle is exactly these 13 PNGs:

```text
aperture-station-silhouette-options.png
aperture-station-recommended-design-sheet.png
aperture-station-material-sheet.png
cable-conductor-v3-sheet.png
proving-ground-v3-style-frame.png
camera-path-v3-study.png
activation-v3-contact-sheet.png
portal-typography-v3-sheet.png
desktop-hero-composition-v3.png
mobile-hero-composition-v3.png
text-zoom-and-fallback-v3.png
reduced-motion-v3-desktop.png
reduced-motion-v3-mobile.png
```

The v3 `review-bundle-manifest.json` binds all 13 hashes, byte counts, and dimensions at SHA-256 `8a73fc5eae08a405f8a96cc2d93dc3fd30b888d77da2fa5d4feec377260fe3fe`; `review-originals-manifest.json` SHA-256 is `1783a3e2218bf93150807b10ca27db9edd217520832880f076b1d04d89cb493b`. Its four browser-derived sheets—portal typography, desktop hero, mobile hero, and text zoom/fallback—are governed by `browser-review-composition-manifest.json` SHA-256 `f5a7f5908aee8b65969fcbaf3d5143dd8d52a0b7be3ca2f26565a6153279e074`; every declared source matches a normalized Phase 0.3 matrix capture by capture ID, path, SHA-256, and dimensions.

The final `blender-source-validation.json` is 6,193 bytes, has SHA-256 `9f1f3ddc4ac0c4b8b9e10c749b805decbfa3be76cadda2fccdce2c2e5174bb91`, and records a 13/13 pass from the exact final Blender validator rerun. PNG sanitation SHA-256 `bba8b813f18d4a332067982696a68bd44c57bc0a9664ee15f175fe7b14c866bb` accounts for 83/83 package PNGs; package inventory SHA-256 is `ec8fc58217b80be850be9fe98a94a549ea8cf5d83eea00883fb6a66654d46104`. The repository verifier binds these authorities without reimplementing Blender semantics.

Final `npm run check` passes with Astro diagnostics 0 errors/0 warnings/0 hints, 13/13 Node tests, and every creative/layout/integrity verifier. Final `npm run build` emits one static page and 11 files totaling 9,333,433 bytes with no server runtime.

Automated success does not constitute typography or creative acceptance. The physical screen, semantic DOM surface, hero composition, and final responsive typography remain subject to explicit human review. Phase 1 stays locked.
