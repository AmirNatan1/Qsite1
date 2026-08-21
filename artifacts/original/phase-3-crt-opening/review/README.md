# Phase 3-R CRT Authenticity — Human Review

This compact package is the narrow screen-only repair. The accepted proving
field, cable conduction, CRT object, camera path, portal geometry, mobile
composition, reduced-motion art direction, and Phase 2B runtime remain frozen.
It contains no raw PNG sequence and does not begin Phase 4.

## Review order

1. `phase-3-r-crt-startup-contact-sheet.png` — inspect F126 as physical neutral phosphor and F144 as a filled picture field.
2. `phase-3-r-crt-before-after-comparison.png` — direct old/repaired comparison at F126, F144, F196, F250, and F270.
3. `phase-3-r-to-phase-2b-handoff-comparison.png` — F250/F262/F270 against the frozen Phase 2B ENTRY target.
4. `phase-3-r-mobile-startup-portal-contact-sheet.png` — 390, 360, 320, and 844×390 startup/portal risk views.
5. `phase-3-r-codec-comparison.png` — source PNG against decoded H.264 and VP9 at five compression-sensitive states.
6. `full-resolution-stills/` — all twelve mandatory 1920×1080 repaired frames.
7. `phase-3-r-desktop-forward-review.mp4` and `phase-3-r-desktop-reverse-review.mp4` — complete 9-second desktop traversal in both directions.
8. `phase-3-r-media-qa-report.json` and `phase-3-r-media-lab-scrub-evidence.webm` — actual complete Chromium QA and its hash-bound headed interaction recording.
9. `phase-3-r-render-determinism-report.json` — fresh-process desktop/mobile production checkpoint determinism.
10. `phase-3-r-desktop-scrub-simulation-review.mp4` — synthetic deterministic timeline simulation only; it is not browser evidence.
11. `phase-3-r-mobile-reverse-review.mp4` — compact portrait reverse/moiré inspection.

## Authority

- Repair parent: `ae6cd4c0c664a275c077bd37207efde01e9caa29`
- Repaired derivative SHA-256: `4341a3fb7ae29ef9be4472ea23ca9235e36f9609893bc2f37de32e5847d36f26`
- Timeline: 270 frames, 30 fps, 9 seconds; no cue frames changed.
- Delivery: silent H.264 and VP9, YUV 4:2:0, fixed 12-frame / 400 ms keyframe cadence.
- The external ZIP includes all four selected production candidates as actual codec motion evidence.
- Exact hashes, sizes, probes, decoded-frame metrics, raw-sequence identities, and evidence provenance are in `phase-3-r-review-manifest.json`.

## Human gates

At normal size, judge picture field before scan structure. Reject visible bar
stacks, countable scanlines, pasted-on text, codec shimmer/moiré, raster popping
in reverse, or a late handoff that still reads as an obvious CRT shader.
