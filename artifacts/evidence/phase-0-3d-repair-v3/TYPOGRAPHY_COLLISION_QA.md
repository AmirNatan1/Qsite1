# Phase 0.3 portal typography and responsive QA

Status: authoritative Phase 0.3 matrix, exact 13-image review bundle, validation, sanitation, inventory, complete checks, and static build pass locally; human typography and creative review pending; Phase 1 locked

## Scope

This record covers the additive Phase 0.3 portal typography and responsive repair only. It does not change the accepted portal geometry, the physical/semantic crossover authority, the v2 evidence history, the public Phase 0 root, the static Astro architecture, the production branch, or the Phase 1 lock.

## Preserved authority

The coordinate and copy authority remains:

```text
artifacts/original/phase-0-3d-repair-v2/portal-layout.json
```

Its schema remains `quantum-hub.phase-0-3d-repair-v2.portal-layout.v1` and its current SHA-256 is `25666cf071afe7564dc051cbec770ead325cdf19ef1f4926e43d793a2a053bc5`. Phase 0.3 may repair responsive CSS and evidence instrumentation; it may not rewrite the reference coordinates, portal H1, carrier stages, audience paths, anchor tolerance, or 12-pixel glyph/rule clearance.

## Whole-word display gate

Every visible `h1` and `h2`, including each authored `.heading-line`, must compute:

```text
word-break: normal
overflow-wrap: normal
hyphens: none
```

The browser report exposes:

- `copy.wordFragmentationOffenders`, which must equal `0`;
- `layout.wordIntegrity.wordFragmentationDetails`, which must be empty;
- `layout.wordIntegrity.cssOffenders`, which must be empty;
- `copy.humanLineBreakReport`, which records the actual rendered line text and top coordinate for direct human review.

The machine check measures each non-whitespace word with a DOM `Range`. A word is an offender if its glyph range occupies more than one rendered line. The normal line-count gate remains separate: a heading can use a valid responsive number of whole-word lines and still fail if any word fragments.

## Reduced-motion composition

Reduced motion remains semantic and still-only. It instantiates no video, canvas, frame sequence, cinematic controller, smooth scrolling, or animated portal.

The Phase 0.3 composition uses a directional full-frame scrim to create a quiet reading field. It must not use a large floating rounded glass panel. The browser report therefore records:

- strategy `directional-scrim-quiet-field`;
- whether a full-frame linear-gradient scrim is active;
- any large rounded surface with a backdrop, shadow, or opaque background;
- a pass only when the scrim is active and the rounded-panel offender list is empty.

This is not a license to hide collisions. Copy, target size, overflow, divider, focus, and scene-safety gates remain active in reduced motion.

The required reduced-motion hero evidence is compositionally distinct from the semantic portal stress state. Desktop and authored-mobile hero captures must retain the frozen v3 Aperture Station opposite the copy, keep the physical cable visible, and pass the source-projected Aperture Station/cable keepouts. The portal reduced-motion state may move decorative scene geometry beyond its isolated crop to protect the semantic operating surface; that exception does not apply to either hero poster.

## Deterministic matrix plan

Plan:

```text
prototypes/phase-0-portal-layout-qa/capture-plan-v3.json
```

The plan expands to 46 cases:

- actual hero and portal states at all nine accepted viewports;
- 200% hero and portal text at the five stress viewports;
- longer non-public hero and portal fixtures at the same five stress viewports;
- desktop/mobile/narrow reduced-motion states;
- visible keyboard-focus states.

The accepted viewport set remains 1440x900, 1366x650, 1280x800, 1024x768, 768x1024, 390x844, 360x800, 320x800, and 844x390.

Every case must retain:

- exact inner CSS viewport measurement;
- fallback-only font resolution;
- minimum 44x44 CSS-pixel audience targets;
- zero page and route horizontal overflow;
- zero text-scroll or glyph-rectangle overflow;
- zero pairwise content collisions;
- valid sole-divider thickness, length, and 12-pixel reference clearance;
- at least a 2 CSS-pixel visible focus outline;
- no text-bearing overflow clipping or nested horizontal scroller;
- zero word-fragmentation offenders and a populated human line-break report.

The reduced-motion desktop and mobile hero captures additionally require the frozen v3 Aperture Station and cable to remain visible opposite the semantic copy while the scene-safety report records zero intersections.

Visual cases retain the established exact-byte modal capture policy: 11 successive full-page JPEGs, an untied modal winner of at least 7/11, raw evidence preserved, and conditional Lanczos restoration only when the evidence-only outer capture scale is below 1. Timing alone is never claimed to stabilize the raster.

### Resumable local-authority runner

`scripts/capture-phase03-browser-matrix.mjs` is the repository-native, resumable evidence authority. It expands this exact plan, reads the real serialized runner DOM report, and processes at most 10 cases per invocation. It writes a hash-bound report after each case and atomically checkpoints progress. A completed case is skipped only after its plan SHA, report SHA/bytes, raw JPEG SHA/bytes where required, schemas, and browser pass are revalidated.

The recovered browser-control checkpoint and its 19 historical raw JPEGs are not silently promoted. On first migration, the checkpoint is copied byte-for-byte under the evidence `recovery/` directory, every JPEG is copied byte-for-byte into a deterministic `recovery/raw/` subtree, and a companion report binds both sides by path, bytes, and SHA-256. New local-authority capture begins from an empty authority ledger. Resume is implicit on rerun and skips only locally authoritative cases whose report and raw hashes still validate; no separate resume flag exists.

The targeted-stress mode forces modal screenshots for the six user-bound cases into an isolated `targeted/` subtree. It includes the repaired 1366x650 portal at 200% text, whose machine gate requires the measured `portal-heading` scroll width to fit its client width, whole words, zero page/route overflow, and the passing content-driven one-column reflow. Targeted diagnostics do not count toward the 46-case matrix.

## Scene freeze and evidence authority

The first v3 scene-ledger candidate was retracted before capture because the portrait cable exposed fewer visible turns than required. Its evidence was never promoted into a browser matrix. The replacement mobile and reduced-mobile sources are now frozen with an independently authored 2.25-turn cable; Blender-projected visibility evidence records approximately 2.171694 visible turns (781.81 degrees) against the 2.15 minimum. Desktop and portal pixels remained unchanged through this bounded repair.

Final browser capture is authorized only against the ledger now frozen in `capture-plan-v3.json`, which records all of the following for every required v3 scene:

- repository-relative path;
- width and height;
- byte count;
- SHA-256;
- responsive/reduced-motion classification;
- explicit frozen status.

Current state:

| Gate | State |
|---|---|
| Portal shared-layout authority | Preserved |
| Whole-word CSS and browser instrumentation | Implemented |
| Directional-scrim/no-floating-panel instrumentation | Implemented |
| 46-case deterministic plan | Implemented |
| Frozen Phase 0.3 scene source ledger | Passed; provenance released |
| Blender-derived Station/cable keepout authority | Passed; exact source SHA bound |
| Mobile cable visibility | Passed; 2.171694 visible turns >= 2.15 |
| Browser matrix | Passed; 46/46 runner and child reports |
| Raw and normalized Phase 0.3 captures | Passed; 36/36 hash-bound capture lineages |
| Direct visual inspection | Passed; all 36 normalized sources opened at full target size |
| Human line-break review | Passed as evidence; 46/46 reports populated, zero fragmented-word offenders |

## Final browser evidence — 18 August 2026

The sole current Phase 0.3 browser authority is:

```text
artifacts/evidence/phase-0-3d-repair-v3/browser-matrix-report.json
```

It was generated at `2026-08-18T10:20:47.772Z`, is 1,785,125 bytes, and has SHA-256 `8272764a01ac18b4aed7b8b0ebffdca812a5f235e51d6c2c2ea6ae744c6ac4fc`. It binds capture-plan SHA-256 `26cf9fc7088d3102b1214c6f8c0c5f1864d02d3d04c52a047b2b17b8ca7db2d5`, harness cache `phase03-layout-v11`, and harness aggregate SHA-256 `c306bd2b33cbc116c60e6171ebf6f1e47a29892d7d8ef57697292d379e178d65`.

Measured results:

- 46/46 runner reports and 46/46 child reports pass;
- 36/36 planned visual cases have raw-plus-normalized SHA-256 lineage;
- all 36 normalized PNGs were opened and inspected independently at their full target dimensions; no crop/scale race, clipping, word split, focus residue, opaque copy panel, scene collision, rule collision, or horizontal truncation was observed;
- all 46 cases have a populated human line-break report and `wordFragmentationOffenders: 0`;
- zero page/route horizontal overflow, text overflow, content collision, target-size, rule-clearance, divider, semantic, scene-readiness, doubled-copy, or reduced-motion failures are present;
- 26 scene-safety cases apply Blender-derived Aperture Station/cable keepouts and all 26 pass with zero semantic-copy intersections;
- all six reduced-motion cases pass, with no animated media and no floating rounded-panel offender;
- the 44 neutral-focus cases record `requested: false`, `activeReviewControlId: null`, and `pass: true`; the two explicit focus captures bind `hero-industry` and `portal-industry` respectively and retain the visible 3px warm-magenta outline;
- the two exact-reference portal cases retain a maximum anchor delta of 0 CSS pixels;
- forced metric-conscious system fallbacks are recorded honestly; no preferred font binary or remote font is loaded.

Raster stabilization used 11 successive full-page JPEGs for every visual case. Every saved winner is the unique exact-byte mode; the observed minimum was 10/11, with zero weak cases, zero ties, and zero discarded attempts. Eleven wide captures use declared Lanczos restoration from the scaled outer evidence frame; 25 scale-1 captures use no resampling. Timing alone is not claimed as evidence of raster stability.

The focus repair is part of the bound harness authority. Measurement restores the pre-audit active element or blurs to a neutral state; it leaves focus active only when the plan explicitly supplies a focus selector. The repository-native runner validates the exact six-file harness ledger before resume. When the harness changed, it preserved the superseded checkpoint, 36 raw JPEGs, 46 per-case reports, and prior matrix under a deterministic `recovery/` authority before creating the fresh v11 checkpoint. The earlier browser-control migration separately preserves its checkpoint and 19 historical JPEGs. Preserved evidence cannot satisfy current resume or matrix completion.

## Final creative-review package

The exact Phase 0.3 review set contains these 13 PNGs and no missing required review image:

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

Final authorities:

- browser-derived composition manifest: SHA-256 `f5a7f5908aee8b65969fcbaf3d5143dd8d52a0b7be3ca2f26565a6153279e074`;
- Blender source validation: 6,193 bytes, SHA-256 `9f1f3ddc4ac0c4b8b9e10c749b805decbfa3be76cadda2fccdce2c2e5174bb91`, 13/13 checks passed;
- review-originals manifest: SHA-256 `1783a3e2218bf93150807b10ca27db9edd217520832880f076b1d04d89cb493b`;
- review-bundle manifest: SHA-256 `8a73fc5eae08a405f8a96cc2d93dc3fd30b888d77da2fa5d4feec377260fe3fe`;
- PNG sanitation manifest: SHA-256 `bba8b813f18d4a332067982696a68bd44c57bc0a9664ee15f175fe7b14c866bb`, 83/83 records;
- package inventory: SHA-256 `ec8fc58217b80be850be9fe98a94a549ea8cf5d83eea00883fb6a66654d46104`.

Final `npm run check` passes with Astro diagnostics 0/0/0, 13/13 Node tests, and all creative/layout/integrity verifiers. Final `npm run build` emits one static page and 11 files totaling 9,333,433 bytes with no server runtime.

## Additive verifier

```text
scripts/verify-phase0-3d-repair-v3-layout.mjs
```

The verifier validates the preserved contract, exact frozen scene ledger, six-file harness authority, exact viewports, 46-case plan, target/overflow/collision/focus/rule requirements, fallback-only boundary, reduced-motion quiet-composition gate, current matrix and every raw/normalized capture lineage. It rejects a stale cache or harness hash, a missing or incomplete matrix, any neutral focus residue, a mismatched requested-focus target, and any nonzero word-fragmentation offender count.

## Stop condition

The completed browser evidence is evidence for human review, not typography or creative acceptance. It does not authorize Phase 1, production cinematic integration, a production-branch change, or deployment.
