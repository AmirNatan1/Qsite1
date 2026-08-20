# Phase 3 CRT Opening — Human Review Package

This compact package contains review evidence only. It never contains the raw
desktop or mobile PNG sequences and it is not a Phase 4 integration.

## Review order

1. `phase-3-desktop-conduction-contact-sheet.png`
2. `phase-3-crt-startup-contact-sheet.png`
3. `phase-3-desktop-codec-comparison-contact-sheet.png`
4. `phase-3-mobile-codec-comparison-contact-sheet.png`
5. `phase-3-camera-portal-contact-sheet.png`
6. `phase-3-portal-alignment-contact-sheet.png`
7. `phase-3-portal-safe-zone-matrix.png`
8. `phase-3-to-phase-2b-handoff-comparison.png`
9. mobile 390/360/320 px, landscape, and reduced-motion evidence
10. selected full-resolution stills
11. `phase-3-desktop-forward-review.mp4` and `phase-3-desktop-reverse-review.mp4`
12. `phase-3-mobile-forward-review.mp4` and `phase-3-mobile-reverse-review.mp4`
13. `phase-3-desktop-scrub-simulation-review.mp4`
14. `phase-3-media-lab-scrub-evidence.webm` — verified silent headed interaction capture

The portal guides exist only in evidence. They are not baked into production
media. Each Phase 2B ENTRY panel is a reproduction crop from the frozen
accepted evidence sheet—not a new headed capture—with SHA-256
`a3a1d38a88771d31c03839c82cf5f9e6163057925ed7f5cbe5dc5cdc70bce2bd`.

## Identity

- Timeline: 270 frames at 30 fps (9.0 seconds)
- Selected candidate seek cadence: 12-frame (400 ms) closed/independent GOP
- Accepted CRT source SHA-256: `3027c4c46e2b829fd97ee9a3a47558e43adda47abcc488420faa0f087bd720a7`
- Review branch: `feature/phase-3-crt-opening-production`
- Review SHA: `193a2fb993bc119d2e0dcb5817ae62f1afa3d55f`
- Reproducibility scope: fixed source selection, settings, output names, atomic
  replacement, and ZIP metadata for the recorded toolchain/font inputs.
- Cross-host encoder bit identity is not claimed; trust the recorded artifact
  hashes and rerun comparisons rather than assuming different hosts encode identically.
- Exact file dimensions, byte sizes, hashes, source frames, normalized progress,
  and production-candidate hashes: `phase-3-review-manifest.json`

## Final pushed SHA binding

The full packaging pass necessarily precedes the commit that contains its
tracked outputs. After that commit is pushed, rerun this same script with only
`--finalize-external-only` and the outside-Git `--review-zip` path. That mode
requires `HEAD == upstream`, the same branch recorded during packaging, every
package file tracked in `HEAD`, and no untracked Phase 3 package paths. It writes
no tracked files and emits exactly:

- `phase-3-crt-opening-human-review.zip`
- `phase-3-crt-opening-human-review.manifest.json`
- `phase-3-crt-opening-human-review.zip.sha256`

## Human gates

Judge the physical proving field and spiral conduction, authentic CRT startup,
camera-to-portal transition, authored mobile composition including the 320 px
gate, and the reduced-motion dormant composition. Phase 2B is frozen; repair
Phase 3 if the handoff does not feel inevitable.
