# Phase 0.2 typography and collision QA

Status: keepout-aware v12 deterministic matrix complete; 46/46 cases and 36/36 capture lineages pass; every normalized source directly audited at full size; human typography and creative review pending

## Scope

This evidence record covers the non-public hero-composition and shared portal-DOM typography surfaces only. It does not change the public Phase 0 root, claim preferred-font delivery, integrate cinematic media, or authorize Phase 1.

## Shared source

| Item | Evidence |
|---|---|
| Portal contract | `artifacts/original/phase-0-3d-repair-v2/portal-layout.json` |
| Contract schema | `quantum-hub.phase-0-3d-repair-v2.portal-layout.v1` |
| Portal H1 | `WHERE DO YOU ENTER?` |
| Reference viewport | 1920x1200 |
| Anchor tolerance | At most 3 CSS pixels |
| Glyph/rule clearance | 12 reference pixels |
| Decorative rules | One audience divider below the H1 |
| Visual copy box | None; editorial negative space preserved |
| Projection honesty | `cover`/max and anchor deltas only for exact 16:10 actual-copy reference mode; all other cases report responsive DOM flow and anchors not applicable |
| Doubled-copy prevention | Every live DOM-owned portal state, including exact 16:10, uses the text-free physical glass base; the text-bearing physical/DOM/overlay comparison remains separate evidence |

The frozen contract SHA-256 is `25666cf071afe7564dc051cbec770ead325cdf19ef1f4926e43d793a2a053bc5`. Every browser result records this digest, and the physical screen, semantic DOM reference, overlay, browser matrix and additive verifier bind the same authority.

## Font evidence

Syne, Newsreader, and Inter were not present in the normal host font registry during the Phase 0.2 audit. No font binary, `@font-face`, remote font request, or font package was added.

The browser matrix deliberately forces:

- display: Arial Black, Arial, sans-serif;
- editorial: Georgia, Times New Roman, serif;
- UI: Arial, Helvetica, sans-serif.

This is fallback QA, not a preferred-font delivery claim.

## Matrix

Machine plan:

```text
prototypes/phase-0-portal-layout-qa/capture-plan.json
```

The official runner is `prototypes/phase-0-portal-layout-qa/runner.html`. It creates a same-origin iframe at the requested CSS `vw` and `vh`, records the browser's actual DPR without claiming control, and relays the child report through `window.phase02RunnerReport`. The child iframe never scales. For evidence only, the outer capture frame uses an explicit plan-bound scale: 1 through 1200px wide, otherwise `1200 / requested width`. This keeps visible pixels inside the in-app browser's reliable raster region while preserving exact inner media queries and measurements. The full-page raw JPEG and actual dimensions are preserved. Normalization crops the recorded outer-frame bounds from top-left `0,0`; scale-1 crops are not resampled, while scaled wide crops use Lanczos to return to the requested CSS dimensions. No CSS-by-DPR raster relationship is claimed.

The plan expands to 46 cases:

- normal hero at all nine required viewports;
- normal portal at all nine required viewports;
- 200% hero and portal text stress at wide, short, mobile, narrow and mobile-landscape viewports;
- 25%-longer non-public hero and portal fixtures at the same stress viewports;
- reduced-motion hero and portal cases;
- visible-focus hero and portal cases.

Required viewport set:

```text
1440x900
1366x650
1280x800
1024x768
768x1024
390x844
360x800
320x800
844x390 mobile landscape
```

## Required checks per browser case

- report schema and portal-contract SHA-256;
- forced fallback-family resolution;
- exact or bounded H1 line count for the state;
- non-public long-fixture ratio of at least 1.25;
- no pairwise content-block collision;
- every hero state and reduced-portal stress state clears source-pixel-derived Field Unit and spiral-cable keepouts by at least 16 CSS pixels;
- no page horizontal overflow;
- no text-block scroll overflow or descendant glyph rectangle outside the viewport, with offender IDs recorded;
- no route-carrier overflow or nested horizontal scroller;
- every visible layout block inside the horizontal viewport;
- audience controls at least 44x44 CSS pixels;
- visible focus outline at least 2 CSS pixels;
- audience divider outside every glyph bound expanded by 12 reference pixels;
- reference-mode portal anchors within 3 CSS pixels;
- explicit projection/source classification with no text-bearing raster behind live DOM copy;
- reduced-motion state with no video, canvas or cinematic sequence;
- successfully loaded original scene image.

## Hero and reduced-portal scene-safety method

The hero repair uses geometry, not an opaque copy box. A subtle full-frame grade
remains, while the scene is translated/scaled inside a decorative-only crop and
the semantic copy reflows into the complementary quiet region. The report
chooses `wide`, `portrait`, or `short-landscape` from the exact iframe viewport;
it does not depend on the outer browser orientation.

The Field Unit and spiral cable are calibrated as source-pixel bounds on the
frozen desktop and independently authored mobile scenes. The harness projects
those bounds through the actual `object-fit`, computed `object-position`, and
CSS transform. Every applicable report records:

- both non-empty projected keepouts;
- the frozen scene source and source dimensions;
- a 16 CSS-pixel clearance;
- the permitted semantic-copy region;
- bounds for the eyebrow, H1, supporting copy, and audience actions;
- a zero-length keepout-intersection list for every copy block.

Wide and short-landscape modes preserve a quiet-left/right-device composition.
Portrait mode uses the authored mobile scene and places the semantic copy above
the visible Field Unit and cable. The decorative scene crop is the only
`overflow: hidden` boundary; text-bearing containers remain measurable and
unclipped. Automated results are accepted only after the nine actual hero
captures are inspected visually.

The keepout assertion applies to every hero case. Normal, reduced-motion and
keyboard-focus states retain visible scene keepouts. For 200% text-zoom and
25%-longer non-public fixtures, the decorative scene is translated fully beyond
the isolated clipped crop while enlarged/long text remains unchanged. Both raw
projected keepouts must report `outsideViewport: true` and every semantic block
must report zero intersections. No accessibility stress state may shrink text or
claim an exception merely to preserve decorative imagery.

The reduced-motion portal states also apply the source-pixel gate. Their five
semantic blocks retain normal typography while the dormant decorative scene is
translated beyond its isolated crop. Both projected keepouts must be outside
the viewport, and the portal blocks must report zero intersections. This closes
the prior reduced-portal collision without shrinking copy or hiding overflow.

## Browser result

The matrix generated at `2026-08-17T21:36:42.899Z` and its associated review
sheets are superseded. Although its DOM-only checks reported 46/46 passes,
human visual inspection found unresolved hero-copy overlap with the Field Unit
and cable.

The table below records the clean v12 keepout-aware replacement run. Every one
of the 36 normalized sources was opened and inspected directly at full target
size after final normalization; the review did not rely on a thumbnail contact
sheet. Normal hero compositions keep copy geometrically separated from the
visible Field Unit/cable without an opaque matte. Zoom/long hero and
reduced-portal stress states contain no scene pixels because the full decorative
image is displaced beyond the isolated crop without shrinking text.

The final in-app browser run is recorded at:

```text
artifacts/evidence/phase-0-3d-repair-v2/browser-matrix-report.json
```

Expected matrix schema:

```text
quantum-hub.phase-0-3d-repair-v2.typography-collision-matrix.v1
```

| Result | Final evidence |
|---|---:|
| Browser cases | 46 |
| Passing cases | 46 |
| Failing cases | 0 |
| Matrix generated at | `2026-08-17T23:12:38.906Z` |
| Matrix SHA-256 | `0e0cdf7e578eb24514146ba3826a1ded4191de740b54ce050ada82a676f71905` |
| Matrix bytes | 850,178 |
| Required raw JPEG captures | 36/36 |
| Normalized PNG derivatives | 36/36 |
| Scale-1, no-resample derivatives | 25 |
| Scaled, Lanczos-restored derivatives | 11 |
| Actual browser DPR | 2.5 in every case; recorded, not controlled |
| Reference-anchor cases | 2 exact 16:10 portal cases |
| Maximum reference-anchor delta | 0 CSS px |
| Observed H1 line-count range | 1–6 |
| Minimum audience-control width | 136 CSS px |
| Minimum audience-control height | 44 CSS px |
| Pairwise collisions | 0 |
| Descendant text-overflow offenders | 0 |
| Horizontal-overflow failures | 0 |
| Glyph/rule-clearance failures | 0 |
| Responsive audience-divider failures | 0 |
| Raster text-ink/coverage failures | 0 |
| Focus failures | 0 |
| Reduced-motion semantic failures | 0 |
| Doubled portal-copy failures | 0 |
| Reports carrying scene-safety state | 46 |
| Applicable Field Unit/cable scene-safety cases | 26 |
| Passing scene-safety cases | 26 |
| Visible-scene hero cases | 13 |
| Stress-displaced hero cases | 10 |
| Reduced-portal displaced cases | 3 |
| Displaced keepouts outside viewport | 26/26 |
| Field Unit/cable keepout intersections | 0 |
| Normal hero viewports visually inspected | 9/9 |
| Required normalized captures visually inspected | 36/36 |
| Hero support-only long-fixture ratio | 148/118 characters; report `1.254` |
| Modal capture winner floor | 7/11; final weak cases 0 |
| Discarded weak capture attempts | 1 (6/11 rejected; replacement reached 8/11) |

All 46 cases used the forced metric-conscious fallback stacks. Raw browser JPEGs are retained under `captures/raw/`; normalized viewport-exact PNG derivatives are under `captures/normalized/`. A readiness marker and two-frame paint barrier precede capture, but timing alone did not eliminate the in-app compositor's occasional alternate raster state. Each required visual case therefore uses 11 successive full-page JPEGs and saves only the exact-byte modal winner. The acceptance floor is 7/11 matching bytes; a tied mode or a weaker winner fails. One initial 6/11 batch was honestly discarded and recaptured with an 8/11 winner; the final matrix records one discarded weak attempt, minimum accepted winner 7/11, zero weak final cases, and no timing claim. The matrix binds every required raw and normalized artifact by path, dimensions, bytes and SHA-256, including the outer evidence scale, rendered crop bounds, conditional Lanczos state, top-left lineage and actual DPR observation. Source-pixel keepouts apply to every hero case—nine normal, five 200% zoom, five support-only long-copy, three reduced-motion and one keyboard-focus case—and to three reduced-portal states. Thirteen hero cases retain visible `wide`, `portrait`, or `short-landscape` geometry; ten hero zoom/long cases report `stress-displaced`; three reduced-portal cases report `portal-reduced-displaced`. The 13 displaced cases place 26/26 keepouts outside the viewport.

The frozen scene authorities are:

| Scene source | Dimensions | SHA-256 |
|---|---:|---|
| `renders/hero/desktop-dormant-base.png` | 1920x1200 | `3af63e9700d15ec36f0c1bfcb44b47e4694b4692d07d633738d0042e7c94824f` |
| `renders/hero/mobile-dormant-base.png` | 720x1600 | `a39259f332e4481a9ca9dc86c2d52a8b92630c4fc3fa0748c41c7265bc20dc10` |
| `renders/portal/physical-glass-base.png` | 1920x1200 | `cb6b3b2f649a4b7ef547704e17d234a01719c118500d038d31f109ab2ac19847` |
| `renders/portal/physical-layout.png` | 1920x1200 | `ff1f9e99ff18402ae54aec4e6968250ca2b7605824371d594bac73a130ded1f0` |

All paths in this table are relative to `artifacts/original/phase-0-3d-repair-v2/`. The machine matrix carries the complete repository-relative form, bytes, dimensions, classifications and hashes for its three live scene sources. `physical-layout.png` is listed as the separate physical/DOM/overlay alignment authority and is intentionally never loaded behind live semantic portal copy.

## Human-review compositions

The browser evidence is composed into:

```text
desktop-hero-composition-v2.png
mobile-hero-composition-v2.png
text-zoom-and-fallback-v2.png
```

These are review summaries, not substitutes for the individual viewport captures or machine results. Their final composition manifest binds every used normalized capture back to the v12 matrix by capture ID, path, dimensions and SHA-256. Final authorities are: browser-review `239f875a3b8dac7621dfbdc9d7a7f226fea191f22a76b6b56174f33f04c8c8a8`, review-originals `ddc1b9665765adb602348ad3df443fc209d4ceaf640837f3ff9d142d56811684`, and review-bundle `c2414cf2a202f76d517f70b6a4b0800a36227da78fd5407a5d6689703ed7394b`.

## Creative-package integrity companion

`scripts/verify-phase0-3d-repair-v2-assets.mjs` independently binds the exact 12-PNG review bundle, editable Blender source and its machine validation report, canonical source lineages, per-file size ceiling, still-only boundary, and dependency boundary. It performs byte-level private-path scans across binary and text artifacts. `png-metadata-sanitization.json` must cover every PNG and prove pixel preservation after ancillary metadata removal. This companion gate must pass alongside the 46-case browser matrix; neither substitutes for human creative review.

## Stop condition

Automated collision success does not constitute creative or typography acceptance. Human review remains required, and Phase 1 stays locked.
