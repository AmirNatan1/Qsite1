# CRT Portal and Typography Contract

Status: Phase 0.4R final local browser and sheets 10–16 authorities complete; package seal, immutable pushed SHA, branch-preview verification and human acceptance pending
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
| `source-desktop-dormant` | 1920×1200 | 1,169,534 | `9b637bf010231ebd2efcb898d20e6b60b23d299c5a2aa9651e58e077c0715652` |
| `source-mobile-dormant` | 1080×1800 | 996,525 | `526e89ceed44aa870c4842ce2e608e044d1b0bc8c413f8514135d515a055090b` |
| `source-reduced-desktop-dormant` | 1920×1200 | 1,161,188 | `3d80543ae17891320107686b5a1c063fc91d30070685b9d1a8aae79829ac2725` |
| `source-reduced-mobile-dormant` | 1080×1800 | 996,830 | `ed0d62e872fa7a3982a21e26907366471a7eccb4dafe5259b888a8cf2cef727b` |
| `source-physical-portal-close` | 1920×1200 | 1,205,903 | `0974e72295eb1fe0530cafd6f6c686dbc7196c3741fc91dba3300af6cfa8219c` |
| `source-text-free-portal-takeover` | 1920×1200 | 1,096,906 | `0b42ee33b5bc8743335bb441e3c4d845e7a43e36ab6810fa3a3f8329ad8dd537` |

The manifest at `artifacts/original/phase-0-4-crt-television/manifests/crt-scene-source-keepouts.json` is frozen/PASS at 1,157,579 bytes with SHA-256 `4dcf0d9b6e7e583682b8d148178634fabb54b331f02ab31e7d7e9358ff6cd26c`. It uses those IDs as both record keys and `sourceRole` values. The five visibly physical roles bind positive evaluated cabinet/screen polygons and cable segment rectangles, pixel bounds, source padding and object lineage. The post-bezel text-free takeover binds the same lineage and padding but records each geometry as `visible:false`, `out-of-frame/no-visible-geometry`, null bounds, zero projected/visible points and empty normalized projections. Browser projection adds the binding 16 CSS-pixel semantic clearance only to visible geometry.

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

Across those viewports the completed 46-case plan includes 18 actual hero/portal cases, ten 200%-text cases, ten approximately 25%-longer support-copy cases, six reduced-motion cases and two explicit keyboard-focus cases. Thirty-six cases yield direct normalized visual evidence. Fallback-font assertions are exercised by the final harness.

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

The frozen legacy Phase 0.4 authority is the Git tree at SHA `fec1f0e9243a9cda188c539ab1b79e4a99c30623`. The Phase 0.4R repair intentionally replaces governed package bytes at their existing paths, so active candidate verification uses the exact Phase 0.4R layout and asset gates. The legacy Phase 0.4 verifier scripts and evidence remain unchanged for use against an exact historical checkout; their old-byte expectations are not weakened or reinterpreted.

The additive case topology and assertions are defined in `prototypes/phase-0-4r-crt-portal-qa/capture-plan.json`. Its immutable ready-for-capture snapshot is `artifacts/evidence/phase-0-4r-crt-television/capture-plan-authority.json`. The final matrix path is `artifacts/evidence/phase-0-4r-crt-television/browser-matrix-report.json`.

Repository-native capture and normalization are implemented in `scripts/capture-phase04r-browser-matrix.mjs` and `scripts/normalize-phase04r-captures.py`. Capture ran in resumable batches of no more than ten cases, accepted only an exact-byte modal JPEG winner of at least 7/11, atomically checkpointed each case, validated hashes before skipping it on a later run, and preserved stale-authority evidence under a recovery subtree. The normalizer binds the measured crop, any evidence-only resampling, raw and normalized SHA-256 values back into the matrix.

The final normalized matrix is `artifacts/evidence/phase-0-4r-crt-television/browser-matrix-report.json`, generated `2026-08-18T23:54:49.079Z`, 1,159,197 bytes, SHA-256 `82ae5672fba028f813bc98754038e0deb9ab2b022bb199e3e2dcb1a8b272b00d`. It contains 46/46 passing reports and 36/36 hash-verified normalized captures. Modal winners are 31 cases at 11/11, four at 10/11 and one at 8/11; no weak or tied round was admitted. The normalized checkpoint is `complete-local-authority-normalized`, 43,161 bytes, SHA-256 `39f49f65347beca0c7e203df6a08e243a8455e9d77e899973ea14602a4c4d598`. All 36 captures were opened individually at their governed viewport dimensions; the direct visual audit passes. Human creative acceptance remains a separate pending gate.

Portal sheet 10 and review outputs 11–16 are browser-governed. Portal states 1–6 bind canonical physical renders. State 7 binds normalized case `portal-actual--desktop-1440x900` with the text-free takeover raster behind the semantic DOM; state 8 is a separately captured 1440×900 JPEG after that decorative raster exits. Exact-byte hashes and decoded pixels prove states 7–8 are distinct. The plan names the exact final-matrix case IDs for sheets 11–16. Normalization binds each named case's path, dimensions, bytes and SHA-256 into the matrix; the compositor manifest binds the external SHA-256 of that finalized matrix and adds labels/metadata without repainting source pixels.

The browser evidence finalizer uses a non-circular authority chain: immutable ready-plan snapshot → normalized matrix → reconstructed evidence core → PASS 8/8 portal authority → browser evidence and review-composition lineage. The completed mutable plan points back to the snapshot and forward to completion evidence; the snapshot itself contains no completion-era pointer. The ready-plan snapshot is 43,077 bytes, SHA-256 `dfd21e2e70fddd02285c8f00979d8cb95aacca43462ef079fff063aafa0d3f08`. The completed plan is 46,456 bytes, SHA-256 `3039c7ad2ff66c953298820c2ca7fe1bc2cca5e7790960458c1712dffc3f3438`. The eight-state PASS portal authority is 56,690 bytes, SHA-256 `3d3df7884f78cd9ee573a82f5961013d038c390324fb4b95efd109f3ccf236cb`.

The complete stage has passed. Browser evidence is PASS at 15,829 bytes with SHA-256 `741b1e351a367324a4ad5f1a4f372df591d7f6c79a1518a225404264533fd724`; browser review composition is PASS for exact sheets 10–16 at 17,615 bytes with SHA-256 `82a338594cac6f56e1c36dafaddd929d54b9c7b91c1710bae538a3770cddeca4`. The mutable current plan is final `PASS`, while the matrix continues to bind the byte-frozen ready-plan snapshot. Strict browser verification requires and passes 46 cases, 36 normalized captures, all seven power states, all eight portal states and every browser-sheet output hash; none is optional. It records zero blank bridges, aspect snaps and doubled-copy violations.

Final package inventory, repository-impact and external-ZIP hashes are governed separately by the Phase 0.4R asset register and final asset verifier. This typography contract does not duplicate those mutable package-seal values.

At this browser-authority stage:

- all six scene sources and their exact hashes are frozen;
- the evaluated six-record keepout manifest is frozen/accepted;
- the Phase 0.4R additive QA harness is final-capture-authoritative against those inputs;
- the final 46/36 browser matrix, machine gates and full-size direct visual audit pass;
- the one-way browser authority and sheets 10–16 are complete and sealed against the final matrix;
- package inventory, review ZIP and repository-impact values remain governed separately by the final Phase 0.4R asset verifier and asset register;
- human creative acceptance and Phase 1 authorization remain pending.
