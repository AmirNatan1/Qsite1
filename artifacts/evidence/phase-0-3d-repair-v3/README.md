# Phase 0.3 evidence index

Status: local Phase 0.3 evidence complete; immutable pushed SHA, Cloudflare branch-preview verification, and human creative/typography acceptance pending; Phase 1 locked

This directory contains non-public review evidence for the Phase 0.3 Aperture Station, portal typography, responsive hero, focus, reduced-motion, and scene-safety repair. It is not a public route or production cinematic integration.

## Browser authority

| Authority | Final value |
|---|---|
| Matrix | `browser-matrix-report.json`; 1,785,125 bytes; SHA-256 `8272764a01ac18b4aed7b8b0ebffdca812a5f235e51d6c2c2ea6ae744c6ac4fc`; generated `2026-08-18T10:20:47.772Z` |
| Capture plan | `prototypes/phase-0-portal-layout-qa/capture-plan-v3.json`; SHA-256 `26cf9fc7088d3102b1214c6f8c0c5f1864d02d3d04c52a047b2b17b8ca7db2d5` |
| Harness | cache `phase03-layout-v11`; six-file aggregate SHA-256 `c306bd2b33cbc116c60e6171ebf6f1e47a29892d7d8ef57697292d379e178d65` |
| Shared portal layout | `artifacts/original/phase-0-3d-repair-v2/portal-layout.json`; SHA-256 `25666cf071afe7564dc051cbec770ead325cdf19ef1f4926e43d793a2a053bc5` |
| Scene keepouts | `artifacts/original/phase-0-3d-repair-v3/manifests/scene-source-keepouts.json`; SHA-256 `3ac16456b5a4a9e5a57755206f135684eca12fcfb7b1aafe30fb3cf86e862b8a` |

The matrix passes 46/46 runner and child reports and binds 36/36 raw-plus-normalized visual lineages. All 36 normalized sources were opened at full target size. There are zero word-fragmentation, horizontal-overflow, text-offender, collision, target-size, rule-clearance, divider, focus-state, reduced-motion, scene-safety, semantic, scene-readiness, or doubled-copy failures. All 26 applicable Aperture Station/cable keepout cases have zero copy intersections.

Every visual case used 11 successive full-page JPEGs. The saved image is the unique exact-byte modal winner; the observed minimum was 10/11, with no weak, tied, or discarded rounds and no timing-only stability claim.

## Directory map and resume boundary

- `reports/`: one complete serialized runner/child report per planned case;
- `captures/raw/`: accepted exact-byte modal JPEG winners;
- `captures/normalized/`: review PNGs at the requested CSS viewport dimensions, with raw-source hash and normalization lineage in the matrix;
- `targeted/`: isolated diagnostic captures that never satisfy final matrix completion;
- `capture-checkpoint.json`: atomic repository-native resume ledger bound to the exact plan and harness authorities;
- `recovery/`: byte-preserved superseded checkpoints, raw images, reports, and matrices that remain process provenance and cannot satisfy current resume or completion.

The capture runner validates plan, harness, report, and raw hashes before skipping a completed case. A harness change preserves the old authority under deterministic recovery paths before beginning a fresh checkpoint.

## Final 13-sheet lineage

The final review images live in `artifacts/original/phase-0-3d-repair-v3/review/`:

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

Lineage authorities under `artifacts/original/phase-0-3d-repair-v3/manifests/`:

- `browser-review-composition-manifest.json`: SHA-256 `f5a7f5908aee8b65969fcbaf3d5143dd8d52a0b7be3ca2f26565a6153279e074`;
- `review-originals-manifest.json`: SHA-256 `1783a3e2218bf93150807b10ca27db9edd217520832880f076b1d04d89cb493b`;
- `review-bundle-manifest.json`: SHA-256 `8a73fc5eae08a405f8a96cc2d93dc3fd30b888d77da2fa5d4feec377260fe3fe`;
- `blender-source-validation.json`: 6,193 bytes, SHA-256 `9f1f3ddc4ac0c4b8b9e10c749b805decbfa3be76cadda2fccdce2c2e5174bb91`, final validator PASS 13/13;
- `png-metadata-sanitization.json`: SHA-256 `bba8b813f18d4a332067982696a68bd44c57bc0a9664ee15f175fe7b14c866bb`, 83/83 PNGs accounted for;
- `package-inventory.json`: SHA-256 `ec8fc58217b80be850be9fe98a94a549ea8cf5d83eea00883fb6a66654d46104`.

## Verification and typography caveat

Final `npm run check` passes with Astro diagnostics 0 errors/0 warnings/0 hints, 13/13 Node tests, and all creative, layout, privacy, and integrity verifiers. Final `npm run build` emits one static page and 11 files totaling 9,333,433 bytes with no server runtime.

The browser matrix intentionally forces documented metric-conscious system fallbacks. It does not claim that Syne, Newsreader, or Inter binaries are delivered. Once approved, licensed production font files are available, the exact viewport, 200% text, longer-copy, focus, reduced-motion, collision, overflow, word-integrity, and visual matrix must be rerun before intended-font typography can receive human acceptance. No remote font dependency or unlicensed binary may be introduced to satisfy that future gate.

Automated evidence does not equal human acceptance. Phase 1, production cinematic integration, a production-branch update, and deployment remain unauthorized.
