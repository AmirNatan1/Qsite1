# CRT Portal and Typography Contract

Status: Phase 0.4 final local browser, creative and package authorities complete; immutable pushed SHA, branch-preview verification and human acceptance pending  
Normative source: `artifacts/original/phase-0-4-crt-television/crt-portal-layout.json`  
Current normative SHA-256: `255c5b1499857ab8a2409adf368543efa0d6f9bfe3171e8a0a0a680e2caf31cc`

## Ownership model

The portal has three distinct owners. Their responsibilities may overlap in time only when their visible copy does not duplicate:

| Stage | Owner | Geometry | Text treatment |
|---|---|---|---|
| Physical wake | rendered CRT | convex 4:3 glass inside cabinet | `QUANTUM HUB`, route, and `TEST ROUTE AVAILABLE` only |
| Entry bridge | rendered, then text-free transition surface | continuous camera crop from 4:3 toward actual viewport | physical copy fades fully before semantic copy appears |
| Operating surface | semantic DOM | native responsive browser geometry | full `WHERE DO YOU ENTER?`, route, audience paths and navigation |

Live semantic text is never barrel-distorted, softened, scanned, bloomed or placed over an identical text-bearing raster. The physical screen's CRT effects end before semantic DOM takes ownership.

## Coordinate authority

The normative JSON contains three coordinate systems:

- a 1920×1200 physical camera frame;
- a 1600×1200 unwarped 4:3 physical screen surface;
- a 1920×1200 semantic DOM reference frame.

The physical camera frame defines a 1440×1080 glass area and a 1344×1008 active raster, both exactly 4:3. The semantic reference retains the accepted navigation, signal, heading, route and audience placement while remaining responsive outside the exact reference ratio.

The maximum reference anchor delta is 3 pixels after the authored camera/takeover projection. The sole audience divider must clear every expanded glyph bound by at least 12 reference pixels. Human comparison remains mandatory; numeric anchor agreement alone cannot prove a visually continuous portal.

## Aspect transition

The five normalized checkpoints in the authority enforce this order:

1. Physical 4:3 CRT fully owns the image inside a visible cabinet.
2. Glass grows while bezel approaches the frame edge.
3. Bezel exits and curvature/scanlines diminish continuously.
4. The text-bearing physical raster is gone; crisp semantic DOM begins takeover.
5. Native DOM owns the actual viewport aspect ratio with no remaining letterbox.

All values are direct functions of document progress. Reverse scrolling evaluates the same checkpoints in reverse without a queued animation, delay, second gesture or nested scroller.

## Whole-word typography

Every display H1/H2 must compute to:

```css
word-break: normal;
overflow-wrap: normal;
hyphens: none;
```

`WHERE`, `DO`, `YOU`, `ENTER`, `PROVE`, and `WORK` may not fragment. Required machine evidence is `wordFragmentationOffenders === 0`; required human evidence names every rendered display line. A smaller heading is not an acceptable substitute for responsive reflow.

Text-bearing containers may not use fixed heights that clip content. Routes and audience choices use native document flow without nested horizontal scrolling. Every visible control is at least 44×44 CSS pixels and explicit keyboard focus has a visible outline at least 2 CSS pixels thick.

Preferred font families remain Syne, Newsreader and Inter. No font files are bundled and no remote font dependency is introduced. The complete matrix must pass the documented metric-conscious system fallback stacks.

Forced fallback is a real live-element state, not a label. Every `font=fallback` case replaces the display, editorial and UI stacks with `Arial Black, Arial, sans-serif`, `Georgia, Times New Roman, serif`, and `Arial, Helvetica, sans-serif` respectively. The report records the three computed stacks, proves that the preferred family tokens are absent, and requires every normalized computed stack to match its documented fallback. Both long-copy families exercise this mode across ten cases.

## Keepout contract

Final QA requires evaluated-geometry projections for:

- the full CRT cabinet, including deep rear mass where visible;
- the convex 4:3 screen and active raster;
- the visible spiral cable represented as segment rectangles rather than one broad union box.

Copy and controls require at least 16 CSS pixels of clearance from projected keepouts wherever physical geometry remains visible. The gate applies to actual, longer-copy, 200%-text, focus and reduced-motion evidence. Stress cases may reflow copy or displace/de-emphasize decorative imagery; they may not shrink, clip or fragment text to preserve the scene. The exact `source-text-free-portal-takeover` role is a documented post-bezel exception: the cabinet, screen and cable have exited the visible camera frame, so their evaluated records remain provenance-bound but are explicitly collision-non-applicable rather than being clamped into false full-frame keepouts.

The creative source ledger is frozen and the evaluated keepout authority is accepted. It records repository-relative paths, dimensions, bytes, SHA-256 and evaluated source geometry for the exact six roles below. No inferred or placeholder hash is authoritative.

| Source ID | Dimensions | Bytes | SHA-256 |
|---|---:|---:|---|
| `source-desktop-dormant` | 1920×1200 | 1,266,764 | `0381200448c99d592a7d616a664badbeefa3a364f3e0f3a01801df77842bb928` |
| `source-mobile-dormant` | 1080×1800 | 1,039,559 | `6c7e6237028e5f7bddd65c7e304d9b70b141a09051dc7c8e4e38d22a06340fdf` |
| `source-reduced-desktop-dormant` | 1920×1200 | 1,266,709 | `6dcce22f73395f2d55591d9fe4b7422246623372283628eee419f8b75221ea4f` |
| `source-reduced-mobile-dormant` | 1080×1800 | 1,045,309 | `b4d6c7fb50c98108a43ddbfc94040b5c7e8c277dca90ae85a05d6d3dbc6ecc4b` |
| `source-physical-portal-close` | 1920×1200 | 1,653,343 | `c864568cee3d0171bdc89c88a5b18ad56050da0e97c6a693fccb1c2386fd79b6` |
| `source-text-free-portal-takeover` | 1920×1200 | 1,448,324 | `2d11b4c7809fe943ffe90268c752ac2de37bdc9f2ebf8418e810de40b2a1bae4` |

The manifest at `artifacts/original/phase-0-4-crt-television/manifests/crt-scene-source-keepouts.json` is frozen/accepted at 1,225,841 bytes with SHA-256 `c2d371d4eb3d3bfafe82ad67728c2df48ef7e38b09b2d1306d5accd2c955ac3d`. It uses those IDs as both record keys and `sourceRole` values. The five visibly physical roles bind positive evaluated cabinet/screen polygons and cable segment rectangles, pixel bounds, source padding and object lineage. The post-bezel text-free takeover binds the same lineage and padding but records each geometry as `visible:false`, `out-of-frame/no-visible-geometry`, null bounds, zero projected/visible points and empty normalized projections. Browser projection adds the binding 16 CSS-pixel semantic clearance only to visible geometry.

The layout JSON remains byte-frozen at its pre-freeze closed capture gate because every creative source and keepout record binds that exact hash. Capture release is additive: the current plan must say `sceneFreeze.status: frozen`, bind all six source hashes plus the accepted keepout hash, and set `captureAllowed: true`. Editing the layout JSON merely to change its gate label would invalidate the creative authority.

## Required responsive matrix

The planned matrix covers:

| ID | CSS viewport |
|---|---:|
| desktop | 1440×900 |
| short desktop | 1366×650 |
| desktop compact | 1280×800 |
| tablet landscape | 1024×768 |
| tablet portrait | 768×1024 |
| mobile | 390×844 |
| mobile compact | 360×800 |
| narrow mobile | 320×800 |
| mobile landscape | 844×390 |

Across those viewports the 46-case plan includes 18 actual hero/portal cases, ten 200%-text cases, ten approximately 25%-longer support-copy cases, six reduced-motion cases and two explicit keyboard-focus cases. Thirty-six cases are intended to yield direct normalized visual evidence. Fallback-font assertions apply across the matrix and must be explicitly exercised by the final harness.

Required gates:

- whole words and reported line breaks;
- zero page, route or component horizontal overflow;
- zero fixed-height clipping and zero nested scroll surfaces;
- zero unintentional copy/control intersections with cabinet, screen or cable;
- rule clearance and responsive divider validity;
- 44×44 CSS-pixel targets and visible focus;
- physical 4:3 geometry and continuous aspect takeover;
- no doubled physical/DOM copy;
- an independently authored mobile composition with approximately 2.25 visible spiral turns;
- a static reduced-motion composition with dormant television and cable, no cinematic media, directional scrim and no large floating rounded panel.

## Reduced motion

Reduced motion loads no video, cinematic frame sequence or animated CRT effect. The television is off, its screen does not glow, and the cable is dormant. Semantic hero content and controls are immediately available. The recognizable CRT and cable remain meaningfully composed without intersecting copy. The quiet field uses directional grading, not an opaque copy card or generic glass panel.

## Evidence state

The case topology and assertions are defined in `prototypes/phase-0-4-crt-portal-qa/capture-plan.json`. The planned final matrix path is `artifacts/evidence/phase-0-4-crt-television/browser-matrix-report.json`.

Repository-native capture and normalization are implemented in `scripts/capture-phase04-browser-matrix.mjs` and `scripts/normalize-phase04-captures.py`. Capture ran in resumable batches of no more than ten cases, accepted only an exact-byte modal JPEG winner of at least 7/11, atomically checkpointed each case, validated hashes before skipping it on a later run, and preserved stale-authority evidence under a recovery subtree. The normalizer binds the measured crop, any evidence-only resampling, raw and normalized SHA-256 values back into the matrix.

The final normalized matrix is `artifacts/evidence/phase-0-4-crt-television/browser-matrix-report.json`, generated `2026-08-18T16:02:05.640Z`, 1,149,989 bytes, SHA-256 `5411220869170f0290423d2f235aba2dc659aa1820e6eb2a3680bbe179d073d7`. It contains 46/46 passing reports and 36/36 hash-verified normalized captures. The exact-byte modal minimum is 8/11 with no weak cases, ties or discarded weak attempts. All 36 captures were opened individually at their full target sizes; the direct visual audit passes. Human creative acceptance remains a separate pending gate.

Portal sheet 10 and review outputs 11–16 are browser-governed. Portal states 1–6 bind canonical physical renders; states 7–8 both bind normalized case `portal-actual--desktop-1440x900`, with state 7 governed against the text-free takeover source and state 8 using the full semantic surface. The plan names the exact final-matrix case IDs for sheets 11–16. Normalization binds each named case's path, dimensions, bytes and SHA-256 into the matrix; the compositor manifest must also bind the external SHA-256 of that finalized matrix and may add labels/metadata only.

The browser evidence finalizer uses a non-circular authority chain. Its prepare stage preserves a byte-identical snapshot of the ready-for-capture plan, patches the canonical semantic portal records for states 7–8, promotes the external portal-state manifest to the final eight-state PASS authority, refreshes the seven-state power manifest's canonical pointer, refreshes the existing sheets 2–9 manifest's canonical/power pointers, and emits composition lineage. These pointer refreshes do not change physical state records or review pixels. The ready-plan snapshot SHA-256 is `db2e7feddceba5ca80be22d5f8d0c97bf5ff11810a92de57478db816c6e68f0d`, canonical inventory SHA-256 is `35022c438e3a64e1a6d86b8e7232533c161f1f7cbe47f7499573999e7ca77ff9`, and the eight-state PASS portal authority SHA-256 is `629a2b65c29e0e176c3f5952a7b519678142dfed5acbafedb4460ccb3fa666b7`.

The complete stage has also passed. Browser evidence is PASS at 30,259 bytes with SHA-256 `0ad595af087867134b7199f1d92855209a7dfd18205bef45efb2e64675c04a58`; browser review composition is PASS for exact sheets 10–16 at 16,341 bytes with SHA-256 `00a51a6c9e5708ecbc64955687946cbc7400886bc001d56f73b4900f8741bcc9`; the material/asset authority is PASS with SHA-256 `8c24c24423c99b891f06e1f3398ac9f049883b3215c2f06fbb14961ebba3a9de`; and sanitation covers 79/79 PNGs with SHA-256 `5ad92428b8216b32d4786e7014812586c904062d04a5c5f56b769463ab255ef7`. The mutable current plan is now `complete`, while the matrix continues to bind the byte-frozen ready-plan snapshot. Strict browser verification requires and passes 46 cases, 36 normalized captures, all seven power states, all eight portal states and every browser-sheet output hash; none is optional.

Final packaging also passes. The 119-file original package totals 160,409,837 bytes. Its self-excluded 118-record inventory is 60,470 bytes with SHA-256 `ee6564cb3a72c13b5385e9f2e66a5d59461b30c7981bfe81a7a857e5707103ef`; the exact 16-sheet review-bundle manifest is 7,656 bytes with SHA-256 `0cb59ecbe15c6adf423ccaa7794c37e8c19b20cf37f86c25e279568b2d6f7993`; and the exact 17-member review ZIP is 43,303,597 bytes with SHA-256 `8eeec33182ad476d5dd78d5635a5dcb2cdfbeb96c97092462bd1af6227f642c7`. The strict Phase 0.4 asset verifier passes this package without altering the matrix, plan, manifests or governed pixels.

At this browser-authority stage:

- all six scene sources and their exact hashes are frozen;
- the evaluated six-record keepout manifest is frozen/accepted;
- the Phase 0.4 QA harness is final-capture-authoritative against those inputs;
- the final 46/36 browser matrix, machine gates and full-size direct visual audit pass;
- the one-way browser authority and sheets 10–16 are complete and sealed against the final matrix;
- the final package inventory, exact 16-sheet review bundle, compact review ZIP and strict package-integrity gate pass;
- human creative acceptance and Phase 1 authorization remain pending.
