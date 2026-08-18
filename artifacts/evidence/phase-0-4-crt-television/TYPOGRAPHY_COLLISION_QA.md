# Phase 0.4 CRT Portal Typography and Collision QA

Audit date: 2026-08-18  
Status: **final local browser, creative and package authorities complete; immutable pushed SHA, branch-preview verification and human creative acceptance pending**  
Authority: `artifacts/original/phase-0-4-crt-television/crt-portal-layout.json`  
Plan: `prototypes/phase-0-4-crt-portal-qa/capture-plan.json`

## Evidence boundary

This document records the QA contract and completed repository-native browser evidence. It binds the frozen scene/keepout release and final normalized matrix, but does not claim human creative acceptance or a physical/DOM pixel identity beyond the governed anchor and takeover checks.

The private creative reference is intentionally outside the repository:

```text
private reference: user-supplied CRT television photograph
purpose: proportion and era reference
repository status: intentionally uncommitted
```

No third-party reference screenshot, video, television mesh or reference photograph is present in this evidence directory.

## Current authority state

| Authority | State | Evidence |
|---|---|---|
| Additive CRT portal layout | Authored | SHA-256 `255c5b1499857ab8a2409adf368543efa0d6f9bfe3171e8a0a0a680e2caf31cc`; new 4:3 physical-screen and semantic-DOM takeover contract |
| Historical portal contract | Preserved | SHA-256 `25666cf071afe7564dc051cbec770ead325cdf19ef1f4926e43d793a2a053bc5` |
| Phase 0.4 browser case topology | Verified | 46 cases / 36 normalized visual captures |
| Executable browser harness | Final authority | `phase04-scaffold-v19`; reports bind the exact six source hashes and keepout authority |
| Frozen desktop/mobile/reduced/portal scenes | Frozen | Six exact plan records; no placeholder source |
| Evaluated cabinet/screen/cable keepouts | Frozen / accepted | 1,225,841 bytes; SHA-256 `c2d371d4eb3d3bfafe82ad67728c2df48ef7e38b09b2d1306d5accd2c955ac3d` |
| Browser collision matrix | PASS | 1,149,989 bytes; SHA-256 `5411220869170f0290423d2f235aba2dc659aa1820e6eb2a3680bbe179d073d7`; 46/46 reports and 36/36 normalized captures |
| Direct full-size visual audit | PASS | Every normalized source opened individually at its target size; human creative acceptance remains pending |

## Required matrix

The bound topology was `46 cases / 36 intended visual captures`; the completed authority contains all 46 reports and all 36 normalized captures.

The final matrix covers 1440×900, 1366×650, 1280×800, 1024×768, 768×1024, 390×844, 360×800, 320×800 and 844×390.

The 46 cases comprise:

- 18 actual hero/portal viewport cases;
- 10 cases at 200% text;
- 10 approximately 25%-longer support-copy cases;
- 6 reduced-motion cases;
- 2 explicit keyboard-focus cases.

Thirty-six normalized captures were produced and opened individually for direct inspection. Evidence records the real browser DPR and uses exact-byte modal raster selection with 11 successive JPEGs and a unique winner of at least 7/11. The observed minimum winner was 8/11; there were zero weak cases, ties or discarded weak attempts. Readiness timing is not presented as a raster-stability claim.

The repository-native capture runner processed at most ten pending cases, wrote an atomic checkpoint after every case, and treated reruns as implicit resume. A case was skipped only when its report and raw bytes still matched the plan, contract, harness, frozen scene and keepout authority fingerprint. When that authority changed, stale evidence was copied into a deterministic recovery subtree and was never promoted into the replacement matrix. The final checkpoint is `complete-local-authority-normalized`, 41,841 bytes, SHA-256 `30dae639b65cf56f0699ebe2ba3c3a7dba427d1a2e5d6872b27b9de15713c591`.

The ten long-copy cases also set `font=fallback`. This replaces all three live preferred stacks, compares normalized computed stacks to the documented display/editorial/UI fallbacks, and requires the preferred-family tokens to be absent. All 10/10 cases record and pass `forcedFallbackRequested`, `forcedFallbackActive`, `computedFallbackStackMatches`, `preferredTokensAbsent`, and `fallbackFontPass`; a query flag without the computed-stack proof is not accepted.

## Required machine results

Every case must report:

- `pass === true` for both exact-viewport runner and child report;
- exact CRT portal authority and frozen scene/keepout hashes;
- physical CRT glass and active raster at exactly 4:3 before takeover;
- `wordFragmentationOffenders === 0`;
- computed `word-break: normal`, `overflow-wrap: normal`, and `hyphens: none` for every visible H1/H2;
- a non-empty human line-break report;
- no page, route, component or nested-scroller horizontal overflow;
- no fixed-height text clipping;
- no content collision or decorative-rule intersection;
- every visible target at least 44×44 CSS pixels;
- focus outline at least 2 CSS pixels in explicit focus cases and no focus residue in neutral cases;
- no copy/control intersection with visible source-projected CRT cabinet, CRT screen or spiral-cable geometry; the exact post-bezel takeover must report those three roles explicitly out of frame and collision-non-applicable;
- no identical text-bearing physical raster behind semantic DOM;
- correct reduced-motion semantics and composition.

The six frozen-source records are `source-desktop-dormant`, `source-mobile-dormant`, `source-reduced-desktop-dormant`, `source-reduced-mobile-dormant`, `source-physical-portal-close`, and `source-text-free-portal-takeover`. The evaluated manifest binds each ID as its `sourceRole`, exact repository-relative path, dimensions, bytes and SHA-256. Five physical roles expose positive cabinet/screen polygons and cable segment rectangles. The exact text-free takeover role records all three as out of frame with null bounds, zero projected/visible points and empty normalized projections; they remain provenance-bound but collision-non-applicable after bezel exit. Every visible-geometry collision test adds at least 16 CSS pixels of semantic clearance.

## Completed browser results

The final normalized authority was generated at `2026-08-18T16:02:05.640Z`:

- 46/46 exact-viewport runner and child reports pass;
- 36/36 normalized PNGs pass file hash and target-dimension validation, totalling 9,842,163 bytes;
- 36 modal raw JPEG winners total 3,103,960 bytes; 46 per-case reports total 1,092,311 bytes;
- zero whole-word fragmentation, page/route/text overflow, content collisions, target failures, rule/divider failures, keepout failures, focus failures or portal-continuity failures;
- 10/10 forced-fallback cases, 6/6 reduced-motion cases and both explicit focus cases pass;
- all 44 neutral-focus cases remain neutral;
- the exact reference portal reports at most 3px anchor displacement and the governed divider/glyph clearance;
- post-bezel portal states bind explicit out-of-frame physical geometry rather than false full-frame keepouts.

The full-size visual audit found no clipped or mid-word-split display copy, doubled portal text, raster crop/scale race, CRT/cable intersection with semantic copy, opaque reduced-motion copy card, unintended focus residue or missing explicit focus ring. Short and 200%-text states that exceed the first viewport continue through the single native document flow; they are not clipped or placed in a nested scroller.

## Required human review

Every normalized capture must be opened at its full target size. Contact sheets alone are insufficient. Human review must confirm:

- `WHERE`, `DO`, `YOU`, `ENTER`, `PROVE`, and `WORK` never split mid-word;
- the CRT remains recognizable, appropriately composed and free of accidental copy overlap;
- the visible spiral cable remains a physical object and does not pass behind text or controls;
- the 4:3 physical-screen composition moves into a crisp native-aspect DOM surface without a snap or permanent letterbox;
- text-bearing CRT pixels are absent behind identical live DOM copy;
- 320×800 has no horizontal clipping, clipped heading or clipped controls;
- mobile uses an authored composition rather than a desktop crop and preserves approximately 2.25 turns;
- reduced-motion television and cable are dormant and visible, with no glow, cinematic media, large rounded panel or opaque copy card;
- explicit focus evidence shows a clear focus ring and neutral captures do not retain it.

## Evidence ledger

| Evidence | Expected path | State |
|---|---|---|
| Frozen scene ledger | Phase 0.4 original manifests | Frozen / bound in plan |
| Evaluated keepout authority | `artifacts/original/phase-0-4-crt-television/manifests/crt-scene-source-keepouts.json` | Frozen / accepted |
| Browser matrix | `artifacts/evidence/phase-0-4-crt-television/browser-matrix-report.json` | PASS; 46/46, 36/36; SHA-256 `5411220869170f0290423d2f235aba2dc659aa1820e6eb2a3680bbe179d073d7` |
| Raw visual captures | `artifacts/evidence/phase-0-4-crt-television/captures/raw/` | 36 modal JPEG winners; 3,103,960 bytes |
| Normalized visual captures | `artifacts/evidence/phase-0-4-crt-television/captures/normalized/` | 36 PNGs; 9,842,163 bytes; direct audit PASS |
| Per-case reports | `artifacts/evidence/phase-0-4-crt-television/reports/` | 46 JSON reports; 1,092,311 bytes |
| Matrix-bound ready-plan snapshot | `artifacts/evidence/phase-0-4-crt-television/capture-plan-authority.json` | Prepared; 24,767 bytes; SHA-256 `db2e7feddceba5ca80be22d5f8d0c97bf5ff11810a92de57478db816c6e68f0d` |
| Browser evidence manifest | `artifacts/evidence/phase-0-4-crt-television/browser-evidence-manifest.json` | PASS; 30,259 bytes; SHA-256 `0ad595af087867134b7199f1d92855209a7dfd18205bef45efb2e64675c04a58` |
| Canonical render inventory | `artifacts/original/phase-0-4-crt-television/manifests/crt-canonical-render-manifest.json` | PASS; 45 canonical records, seven power states and eight portal states; SHA-256 `35022c438e3a64e1a6d86b8e7232533c161f1f7cbe47f7499573999e7ca77ff9` |
| Portal transition authority | `artifacts/original/phase-0-4-crt-television/manifests/crt-portal-transition-state-authority.json` | PASS 8/8; SHA-256 `629a2b65c29e0e176c3f5952a7b519678142dfed5acbafedb4460ccb3fa666b7` |
| Browser review composition | `artifacts/original/phase-0-4-crt-television/manifests/browser-review-composition-manifest.json` | PASS 7/7 sheets 10–16; 16,341 bytes; SHA-256 `00a51a6c9e5708ecbc64955687946cbc7400886bc001d56f73b4900f8741bcc9` |
| Material and asset authority | `artifacts/original/phase-0-4-crt-television/manifests/crt-material-and-asset-manifest.json` | PASS; 47,991 bytes; SHA-256 `8c24c24423c99b891f06e1f3398ac9f049883b3215c2f06fbb14961ebba3a9de` |
| PNG sanitation | `artifacts/original/phase-0-4-crt-television/manifests/png-metadata-sanitization.json` | 79/79 PNGs, pixels preserved; 51,196 bytes; SHA-256 `5ad92428b8216b32d4786e7014812586c904062d04a5c5f56b769463ab255ef7` |
| Package inventory | `artifacts/original/phase-0-4-crt-television/manifests/package-inventory.json` | PASS; 118 self-excluded records / 160,349,367 bytes; manifest 60,470 bytes; SHA-256 `ee6564cb3a72c13b5385e9f2e66a5d59461b30c7981bfe81a7a857e5707103ef` |
| Final review bundle | `artifacts/original/phase-0-4-crt-television/manifests/review-bundle-manifest.json` | PASS; exact 16 PNGs; 7,656 bytes; SHA-256 `0cb59ecbe15c6adf423ccaa7794c37e8c19b20cf37f86c25e279568b2d6f7993` |
| Compact review ZIP | `artifacts/original/phase-0-4-crt-television/phase-0-4-crt-television-review.zip` | Exact 17-member copy: 16 PNGs plus one README; 43,303,597 bytes; SHA-256 `8eeec33182ad476d5dd78d5635a5dcb2cdfbeb96c97092462bd1af6227f642c7` |
| Repository impact | `artifacts/evidence/phase-0-4-crt-television/repository-impact-report.json` | PASS_PRECOMMIT; candidate size, protected-tree, privacy, LFS and delivery state measured after the documentation seal |

Portal sheet 10 and review sheets 11–16 have exact state/case source lists in the plan. The matrix binds every selected case's normalized path, dimensions, bytes and SHA-256. The PASS browser-review composition manifest binds the external SHA-256 of that finalized matrix; no sheet is sourced from an unlisted or report-only case.

| Review | Output | Bound final-matrix case IDs |
|---:|---|---|
| 10 | `crt-portal-transition-sheet.png` | six canonical physical portal states plus states 7–8 from `portal-actual--desktop-1440x900` |
| 11 | `crt-physical-dom-alignment-sheet.png` | `portal-actual--desktop-1440x900`, `portal-actual--tablet-landscape-1024x768`, `portal-actual--mobile-390x844` |
| 12 | `crt-desktop-hero-composition.png` | `hero-actual--desktop-1440x900`, `hero-actual--short-desktop-1366x650`, `hero-actual--desktop-1280x800`, `hero-actual--tablet-landscape-1024x768` |
| 13 | `crt-mobile-hero-composition.png` | `hero-actual--mobile-390x844`, `hero-actual--mobile-360x800`, `hero-actual--narrow-320x800`, `hero-actual--mobile-landscape-844x390` |
| 14 | `crt-text-zoom-and-fallback.png` | `hero-zoom-200--desktop-1440x900`, `portal-zoom-200--narrow-320x800`, `hero-long-copy--mobile-390x844`, `portal-long-copy--desktop-1440x900` |
| 15 | `crt-reduced-motion-desktop.png` | `hero-reduced-motion--desktop-1440x900`, `portal-reduced-motion--desktop-1440x900` |
| 16 | `crt-reduced-motion-mobile.png` | `hero-reduced-motion--mobile-390x844`, `portal-reduced-motion--mobile-390x844` |

## Gate

The frozen source/keepout release, static contract, complete 46/36 matrix, machine gates, direct full-size visual audit, browser-evidence authority, all 16 review sheets, exact package inventory, review bundle and compact ZIP pass. Portal states 7–8 bind the exact normalized reference capture and matrix authority. The current plan is sealed as a complete local browser authority; the preserved ready-plan snapshot keeps the matrix chain non-circular. The strict Phase 0.4 asset verifier passes the final 119-file / 160,409,837-byte package. Immutable pushed-SHA and Cloudflare branch-preview verification plus the human creative gate remain pending.

Phase 1 remains locked.
