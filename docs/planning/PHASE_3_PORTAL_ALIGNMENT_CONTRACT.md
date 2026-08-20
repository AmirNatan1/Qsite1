# Phase 3 Portal Alignment Contract

Status: frozen handoff geometry and review contract
Phase 3 branch: `feature/phase-3-crt-opening-production`
Accepted Phase 2B tree: `b54f3a83b6180466127589a8d028f94dab892d17`
Measurement state: `/` at `scrollY = 0`, accepted local fonts loaded, CSS pixels

## Purpose and boundary

This document binds the final physical side of the Phase 3 **Quantum Signal Television** opening to the already accepted Phase 2B homepage ENTRY. Phase 3 must fit the frozen ENTRY; it must not redesign, resize, reflow, or otherwise modify the homepage to fit the cinematic.

Phase 3 owns the physical approach, bezel exit, late raster flattening, text retirement, and a text-free final handoff frame. Phase 4 will own the actual media-to-DOM opacity crossover and scroll mapping. This contract does not authorize production-homepage integration.

All rectangles below use `x, y, width, height`, with the viewport's top-left as `(0, 0)`. Values retain browser sub-pixel precision. They are measured rendered geometry, not reconstructed design estimates.

## Frozen authorities

| Authority | Path / value | Use |
| --- | --- | --- |
| Accepted Phase 2B tree | `b54f3a83b6180466127589a8d028f94dab892d17` | Byte and layout freeze |
| ENTRY semantics | `src/components/home/EntryField.astro` | Exact label, H1, route order, links, and route copy |
| ENTRY visual system | `src/styles/routes/home.css` | Base geometry, colors, typography, route rules |
| ENTRY responsive system | `src/styles/routes/home-responsive.css` | Breakpoints, short-height mode, portrait and narrow behavior |
| Global tokens | `src/styles/tokens.css` | Theme colors, fonts, gutter, nominal header token |
| Font declarations | `src/styles/typography.css` | Local Syne, Newsreader, and Inter faces |
| Header geometry | `src/components/SiteHeader.astro`, `src/styles/navigation.css` | Actual navigation-safe exclusion |
| Physical-screen layout | `artifacts/original/phase-0-4-crt-television/crt-portal-layout.json` | Physical 4:3 content and handoff rules |
| Physical layout SHA-256 | `255c5b1499857ab8a2409adf368543efa0d6f9bfe3171e8a0a0a680e2caf31cc` | Exact authority identity |
| Phase 2B visual ledger | `artifacts/evidence/phase-2b/review/phase-2b-visual-evidence-manifest.json` | Accepted comparison-image bytes, source bytes, and capture provenance |

The visual evidence was captured at repository head `304599071fc65725e8394dd9df9f69d15cee937f`. The accepted Phase 2B tree is `b54f3a8...`; the later evidence reconciliation did not change the production ENTRY source. The final comparison must use the accepted Phase 2B pixels, not an older Phase 0 semantic mockup.

## Navigation-safe exclusion

The header's accepted rendered height is greater than the nominal `--header-height` value because the brand SVG has a `242 × 181.98` viewBox, a responsive CSS width, and `height: auto`. The handoff must therefore reserve the measured header band, not assume the `88px` desktop or `76px` compact token is the visible boundary.

| Viewport | Excluded header band | First ENTRY y | Rule |
| --- | ---: | ---: | --- |
| 1440 × 900 | `y = 0–121.31` | `121.31` | Keep semantic alignment guides below `121.31` |
| 1366 × 650 | `y = 0–121.31` | `121.31` | Same accepted desktop header |
| 1280 × 800 | `y = 0–116.48` | `116.48` | Use measured boundary, not `88` |
| 1024 × 768 | `y = 0–100.25` | `100.25` | Use measured boundary |
| 844 × 390 | `y = 0–100.25` | `100.25` | Short landscape still owns the full header band |
| 768 × 1024 | `y = 0–100.25` | `100.25` | Compact header |
| 390 × 844 | `y = 0–100.25` | `100.25` | Compact header |
| 360 × 800 | `y = 0–100.25` | `100.25` | Compact header |
| 320 × 800 | `y = 0–100.25` | `100.25` | Compact header |

If the Phase 3 raster occupies the full viewport, the header band is still excluded from the semantic anchor fit. It may carry continuous background grade, but no critical physical-screen text or alignment feature may depend on that band surviving under the native header.

## Accepted desktop and tablet geometry

| Viewport | ENTRY section | Nominal content shell | H1 layout box | Route-choice block | Route orientation |
| --- | --- | --- | --- | --- | --- |
| 1440 × 900 | `0, 121.31, 1440, 812` | `48, 121.31, 1344, 812` | `48, 347.41, 1344, 316.73` | `48, 802.13, 1344, 86.19` | Two equal columns |
| 1366 × 650 | `0, 121.31, 1366, 624` | `48, 121.31, 1270, 624` | `48, 327.39, 1270, 149.75` | `48, 627.13, 1270, 86.19` | Two equal columns; most route copy is below the fold |
| 1280 × 800 | `0, 116.48, 1280, 712` | `48, 116.48, 1184, 712` | `48, 308.67, 1184, 281.53` | `48, 702.30, 1184, 86.19` | Two equal columns |
| 1024 × 768 | `0, 100.25, 1024, 680` | `40.95, 100.25, 942.08, 680` | `40.95, 241.02, 942.08, 351.44` | `40.95, 655.67, 942.08, 86.19` | Two equal columns |

The `1366 × 650` route block runs from `y = 627.13` to approximately `713.32`; only its first approximately `22.9px` is visible in the initial `650px` viewport. This is accepted behavior and must not be “fixed” for Phase 3.

## Accepted compact, portrait, and mobile-landscape geometry

| Viewport | ENTRY section | Nominal content shell | Actual H1 layout box | Actual route-choice block | Route orientation |
| --- | --- | --- | --- | --- | --- |
| 768 × 1024 | `0, 100.25, 768, 948` | `48, 100.25, 672, 948` | `48, 375.98, 672, 243.31` | `48, 841.88, 672, 182.38` | Stacked |
| 390 × 844 | `0, 100.25, 390, 768` | `16, 100.25, 358, 768` | `16, 315.23, 370.08, 184.81` | `16, 661.88, 370.08, 182.38` | Stacked |
| 360 × 800 | `0, 100.25, 360, 724` | `16, 100.25, 328, 724` | `16, 290.44, 341.61, 170.63` | `16, 598.09, 341.61, 202.16` | Stacked |
| 320 × 800 | `0, 100.25, 320, 724` | `16, 100.25, 288, 724` | `16, 303.22, 295.56, 147.63` | `16, 600.66, 295.56, 199.59` | Stacked |
| 844 × 390 | `0, 100.25, 844, 496` | `33.77, 100.25, 776.47, 496` | `33.77, 272.14, 373.75, 184.31` | `455.52, 277.42, 354.72, 173.77` | H1 left; two route columns right |

At `390`, `360`, and `320px` widths, whole-word min-content sizing expands the accepted H1 and route grid beyond the nominal shell width. The measured accepted right edges are `386.08`, `357.61`, and `311.56` respectively. A handoff overlay must use the actual DOM boxes above; applying only the nominal gutter would produce a false alignment result.

The portrait route blocks end at approximately `viewport height + 0.25px`. The `844 × 390` H1 and routes also continue materially below the first fold. These are accepted consequences of the minimum ENTRY height and short-landscape composition.

## Shell and text-safe-zone rules

The nominal shell is governed by:

```text
gutter = clamp(16px, 4vw, 48px)
shell width = min(100% - 2 × gutter, 90rem)
compact shell cap at width <= 768px = 42rem
```

Use the following zones in alignment evidence:

1. **Navigation-safe zone:** the measured header band in the table above. It is excluded from the ENTRY fit.
2. **H1-safe zone:** the measured H1 layout rectangle for the exact viewport, with the real Syne glyph ink checked separately.
3. **Route-safe zone:** the measured route-choice rectangle, including both top rules, audiences, statements, and `Explore` labels.
4. **Physical keepout zone:** any still-visible cabinet, convex-screen edge, bezel, or cable projection plus `16 CSS px` minimum clearance from semantic text and controls.
5. **Text-free raster field:** after cabinet and bezel exit, the raster may underlay the future DOM only if all physical-screen text has already been retired and no residual glyph-shaped phosphor remains.

The `16px` clearance is the current physical-geometry/semantic-content rule from the keepout contract. The historical `12px` glyph/rule value in the Phase 0.4 portal scaffold does not replace this stricter clearance. Where all collision geometry is effectively out of frame, record the clearance check as not applicable with that reason; do not fabricate a passing distance.

### Actual display-ink extents

Syne's glyph ink extends differently from its CSS line box. These measured ink bounds are useful for visual overlays and must not be replaced with a manually typeset approximation.

| Viewport | Accepted H1 ink bounds |
| --- | --- |
| 1440 × 900 | `x = 109.80–1330.21`, `y = 318.41–691.56` |
| 390 × 844 | `x = 16.00–386.08`, `y = 303.23–511.84` |
| 320 × 800 | `x = 16.00–311.56`, `y = 293.22–459.94` |

The DOM capture or a derived alpha/edge overlay is the glyph authority. Recreating `WHERE DO YOU ENTER?` in Blender, an image editor, or a contact-sheet script is not an acceptable alignment proxy.

## Responsive route and headline contract

| Condition | ENTRY arrangement | Route behavior |
| --- | --- | --- |
| Width `> 768px`, normal height | One centered H1 region above routes | Two equal horizontal columns with `clamp(2rem, 13vw, 12rem)` gap |
| Width `<= 768px` | H1 remains centered in native flow | Routes stack on a vertical spine; industry is first/left-aligned, startup second/right-aligned; startup `Explore` moves to the left column |
| Height `< 30rem` and width `>= 36rem` | Field label spans both columns; H1 is left; routes are right | At `844 × 390`, the route group itself remains two columns |
| Height `< 43.999rem` and width `>= 49rem` | Short desktop sizing and padding | Routes remain two columns; below-fold continuation is allowed |

Route choices are native links with top rules, not cards. Their minimum heights are `4.75rem` in the base layout and `5.7rem` in the compact stacked layout.

Accepted H1 line groupings are:

| Viewport/state | Visible lines |
| --- | --- |
| 1440 × 900 | `WHERE DO` / `YOU` / `ENTER?` |
| 1366 × 650 short desktop | `WHERE DO` / `YOU ENTER?` |
| 1280 × 800 | `WHERE DO` / `YOU` / `ENTER?` |
| 1024 × 768 | `WHERE` / `DO` / `YOU` / `ENTER?` |
| 768 portrait and 390/360/320 portrait | `WHERE` / `DO` / `YOU` / `ENTER?` |
| 844 × 390 short landscape | `WHERE` / `DO` / `YOU` / `ENTER?` in the left column |

Whole words must remain whole: `overflow-wrap: normal`, `word-break: normal`, and `hyphens: none`. Do not add hand-authored line breaks to imitate one viewport.

## Typography authority

| Role | Family / weight | ENTRY use |
| --- | --- | --- |
| Display | Syne 800 | Uppercase H1; `letter-spacing: -0.075em`; line-height `0.78` base and `0.79` compact |
| Editorial | Newsreader 400 | Route statements and supporting editorial text |
| UI | Inter 400–600 | Field label, route audience, route direction, navigation |

The accepted H1 size rules are:

```text
base:                         clamp(4.4rem, 9.4vw, 9rem)
width <= 69.999rem:           clamp(3.8rem, 11vw, 7.2rem)
width <= 48rem:               clamp(50px, 15vw, 77px)
width <= 22rem:               clamp(45px, 14.6vw, 54px)
short desktop:                clamp(3.8rem, 8vw, 6rem)
short landscape <= 30rem high: clamp(3rem, 7vw, 4.5rem)
```

All final comparison captures must wait for the repository-local fonts. System fallback metrics are not an accepted substitute for Phase 2B handoff evidence.

## Black and color targets

| Role | Value | Interpretation |
| --- | --- | --- |
| Global/page black token | `#0e1112` | Theme and Phase 3 grading intent; the common “Operating Field black” target named by the Phase 3 brief |
| Accepted homepage field black | `#080b0c` | `.home-page --field-black` and accepted chapter surface pixels |
| Accepted ENTRY residual/base black | `#090c0d` | ENTRY residual and header-adjacent base, composed with directional gradients |
| Quantum magenta | `#d82b72` | Primary Quantum current/accent relationship |
| Soft/current magenta | `#f06ba0` | Active current and interaction accent |
| H1 | `#f7f8f7` | Accepted ENTRY display white |
| Route audience | `#ffffff` | Primary route label |
| Route statement | `#b6c0bf` | Editorial route copy |
| Route direction | `#7f8a89` | `Explore` |
| Route rule | `rgba(255, 255, 255, 0.22)` | Native link threshold line |

`#0e1112` and the accepted ENTRY pixels are related authorities, not interchangeable measurements. `#0e1112` is the declared token and the correct late-CRT grade target. The accepted rendered ENTRY is not a flat `#0e1112` plate: it visibly composes `#080b0c`, `#090c0d`, directional near-black gradients, raster lines, and residual field structure.

Therefore the black-level gate has two parts:

1. Grade the late CRT raster toward the `#0e1112` token relationship so it does not become crushed pure black or elevated gray.
2. Compare the rendered late raster side by side and in overlay with the actual accepted ENTRY pixels, especially the composed `#080b0c`/`#090c0d` regions. Passing a flat `#0e1112` swatch alone is insufficient.

The same side-by-side review must cover H1 white and both magentas. No sudden grade change, gray flash, black crush, or saturation jump is acceptable at the future Phase 4 crossover.

## Physical 4:3 screen authority

The physical raster is authored on a `1600 × 1200` local screen. These coordinates remain authoritative for the text-bearing physical phase before the camera crop and late flattening:

| Physical region | Local-screen geometry |
| --- | --- |
| Safe margins | left/right `112`; top/bottom `96` |
| Brand bounds | `112, 190, 1050, 112` |
| Five-stage route region | `112, 566, 1376, 112` |
| Route item starts | `112, 376, 650, 936, 1164` |
| Status bounds | `112, 842, 760, 86` |

The physical screen may contain only:

- `QUANTUM HUB`
- `FRAME   SOURCE   ASSESS   TEST   DECIDE`
- one status: `TEST ROUTE AVAILABLE`

`WHERE DO YOU ENTER?` is explicitly prohibited on the physical raster. The old `1920 × 1200` semantic coordinates in the Phase 0.4 scaffold are planning history, not the frozen Phase 2B target. Current alignment evidence must use the measured viewport tables in this document.

## No duplicated semantic text

| State | Text owner | Required copy state |
| --- | --- | --- |
| Physical wake and stable signal | Physical CRT | Only the approved brand, five-stage route, and one approved status may appear |
| Camera approach | Physical CRT | Approved physical copy may remain while no matching live DOM copy is visible |
| Late flattening | Physical CRT transitioning to field | Remove brand, route, and status completely; no ghost glyphs, burn-in-like remnants, or duplicated raster text |
| Final Phase 3 handoff | Text-free raster | No text-bearing physical pixels; cabinet/bezel/cable effectively out of frame; curvature nearly absent; scanlines/phosphor only faint |
| Phase 4 semantic takeover | Native DOM | `Two ways in`, `Where do you enter?`, and both route links/copy are owned by the accepted DOM |

The physical raster and live DOM may never show identical visible copy simultaneously. A “faint enough” duplicate is still a duplicate. The transition must move directly from a text-free physical field to native semantic ownership, without a blank frame, generic fade-to-black bridge, loader, or CSS recreation of the CRT text.

## Alignment tolerances

Two independent thresholds apply:

| Threshold | Requirement |
| --- | --- |
| Mapped anchor delta | Maximum `3 CSS px` per applicable structural anchor after the authored camera crop and viewport projection |
| Physical keepout clearance | Minimum `16 CSS px` between visible cabinet/screen-edge/cable geometry and semantic text or controls |

The `3px` rule applies to review-only mapped guides, not to forcing obsolete Phase 0 semantic coordinates into current responsive layouts. At each viewport, the guide set must use the measured header boundary, actual shell edges, H1 layout-box origin/extents, and route-block origin/extents from this contract. Record each anchor's signed x/y delta and the maximum absolute delta. Any applicable delta over `3px` fails.

At narrow widths, test against the actual expanded H1/route rectangles, not just the nominal shell. At `844 × 390`, use the short-landscape split as its own mode; do not scale a portrait guide set. If a structural mapping is genuinely inapplicable after the bezel/cabinet/cable have exited, mark it not applicable and preserve the visual overlay for human review.

Anchor math is necessary but not sufficient. Human review must also judge continuous 4:3 cover, the absence of letterbox bars or an aspect snap, bezel exit, curvature reduction, raster grade, and the first accepted DOM frame.

## Alignment handoff procedure

1. Verify the physical layout JSON hash and the accepted Phase 2B visual-manifest hash before producing evidence.
2. Render/capture the Phase 3 approach states from the deterministic master: physical approach, bezel nearly out, raster dominant, late flattening, and the exact final handoff.
3. Retire every text-bearing physical raster element before the semantic target is introduced. The late comparison source must be text-free.
4. For each reference viewport, capture the exact `b54f3a8...` Phase 2B homepage at `/`, `scrollY = 0`, with local fonts loaded. Do not alter ENTRY CSS for the capture.
5. Project the Phase 3 late raster into that exact viewport using the authored camera/crop strategy. Preserve continuous cover; do not introduce a permanent letterbox, hard 4:3-to-viewport snap, or extra gesture.
6. Create a review-only overlay containing the measured header exclusion, shell, H1 box, H1 ink where available, route block, raster boundary, and any visible physical keepouts. Do not bake guides into production media.
7. Record `3px` mapped-anchor results. While physical geometry remains visible, also record `16px` minimum copy/control clearance.
8. Compare late raster black against both the `#0e1112` token target and the accepted composed `#080b0c`/`#090c0d` ENTRY pixels. Include white and magenta comparisons.
9. Produce `phase-3-portal-alignment-contact-sheet.png` with, in order: physical approach; cabinet nearly out; raster dominant; late flattened raster; Phase 2B ENTRY overlay target; final text-free handoff.
10. Produce `phase-3-to-phase-2b-handoff-comparison.png` with the final physical raster, near-final portal frame, and accepted Phase 2B ENTRY. A guide version may be separate; the clean comparison is mandatory.
11. Review forward and reverse. Reverse traversal must restore curvature, bezel, cabinet, and physical copy without a discontinuity or a duplicated semantic layer.
12. Phase 3 stops after proving the physical geometry and deliverable media. Phase 4 owns the actual opacity crossover and runtime integration.

The intended late timeline relationship is consistent with `PHASE_3_CRT_TIMELINE.md`: frames `247–258` begin flattening, `259–264` make the raster viewport-dominant and the cabinet effectively absent, `265–269` lock alignment and retire physical copy, and frame `270` is the text-free handoff.

## Accepted comparison assets

The first panel of each retained Phase 2B sheet below is usable as the named ENTRY comparison authority:

| Use | Retained asset | Sheet dimensions | SHA-256 |
| --- | --- | ---: | --- |
| Desktop ENTRY | `artifacts/evidence/phase-2b/review/phase-2b-desktop-production-keyframes.png` | `1504 × 3680` | `a3a1d38a88771d31c03839c82cf5f9e6163057925ed7f5cbe5dc5cdc70bce2bd` |
| Short-height ENTRY | `artifacts/evidence/phase-2b/review/phase-2b-short-height-keyframes.png` | `1073 × 3946` | `aa401ab0cb24f4523cdcfa6802857e7fe54a8039f41f936d1bf1d489148f696b` |
| 390px mobile ENTRY | `artifacts/evidence/phase-2b/review/phase-2b-mobile-390-keyframes.png` | `844 × 3732` | `2ad0d2f95a1a03563c9d0f4974a5ce143f3e79f0915e21b56b2af11994304f4f` |
| Reduced-motion desktop ENTRY | `artifacts/evidence/phase-2b/review/phase-2b-reduced-motion-keyframes.png` | `1504 × 1648` | `ddf9c0d995629eeac321547071f4c324374603dee6826860141883aa18f1cf0c` |

The Phase 2A transition storyboard and keyframes are conceptual history only:

- `artifacts/evidence/phase-2a/review/phase-2a-r-transition-storyboard.png`
- `artifacts/evidence/phase-2a/review/phase-2a-r-desktop-keyframes.png`

They must not replace the Phase 2B ENTRY pixel target.

Raw Phase 2B frames were intentionally not retained. The retained `phase-2b-mobile-320-keyframes.png` contains no ENTRY panel, and no accepted `844 × 390` ENTRY image was retained. Produce fresh standalone baseline reproductions from the exact accepted tree for `320 × 800` and `844 × 390` before final alignment review; record their dimensions, byte counts, SHA-256 hashes, repository SHA, font-ready state, and `scrollY = 0`, and label them **reproductions**, not original accepted raw captures. Do the same for any other matrix viewport without a retained ENTRY panel.

## Frozen-byte verification

Phase 3 must not edit the production homepage to obtain a pass.

The direct isolation test is:

```text
node --test tests/phase3-isolation.test.mjs
```

Its byte-integrity gate binds the Phase 2B visual manifest itself to SHA-256 `b3c88d9ffa53592cec812a2a37a382d2899f28a0971cb1ff4c4c4022021f56a6`, requires the manifest to remain `phase: 2B` and `status: PASS`, requires exactly twelve governed homepage source files, and checks each governed file's byte count and SHA-256 against the accepted manifest.

The normal repository gates remain:

```text
npm run check
npm run build
```

`npm run check` includes the Phase 2B source verifier. `npm run build` includes the Phase 2B output verifier after the Astro production build. Run the direct Phase 3 isolation test in addition; the current package scripts do not implicitly make that new isolation test part of `npm run check`.

Before and after Phase 3 production, an empty diff against `b54f3a8...` is required for the frozen surface:

```text
src/pages/index.astro
src/components/home/
src/scripts/home-operating-field.ts
src/styles/routes/home.css
src/styles/routes/home-method.css
src/styles/routes/home-responsive.css
```

Because this alignment contract also depends on global geometry, separately confirm no Phase 3 changes to:

```text
src/components/SiteHeader.astro
src/styles/navigation.css
src/styles/tokens.css
src/styles/typography.css
```

Do not run a capture command that overwrites the accepted Phase 2B evidence ledger merely to create alignment references. New baseline reproductions and Phase 3 contact sheets must write to distinct Phase 3 evidence paths with their own manifest records.

## Acceptance checklist

- Phase 2B ENTRY production files are byte-identical to their accepted authority.
- Every target viewport uses its measured header exclusion and actual DOM rectangles.
- Narrow-screen min-content expansion is preserved, not normalized away.
- Desktop, stacked portrait, short desktop, and `844 × 390` short-landscape orientations each pass independently.
- Physical content uses only the approved brand, five-stage route, and one status.
- `WHERE DO YOU ENTER?` never appears on the physical raster.
- All physical text is gone before native semantic text owns the frame.
- Applicable structural anchors are within `3 CSS px` after projection.
- Visible physical geometry maintains at least `16 CSS px` clearance from semantic copy and controls.
- Late black passes both the `#0e1112` token-grade check and the actual composed `#080b0c`/`#090c0d` pixel comparison.
- No blank bridge, permanent letterbox, aspect snap, baked alignment guide, or duplicated semantic copy exists.
- Phase 3 alignment evidence is reproducible, hash-bound, and clearly distinguishes accepted captures from new reproductions.
- Production homepage integration remains deferred to Phase 4.
