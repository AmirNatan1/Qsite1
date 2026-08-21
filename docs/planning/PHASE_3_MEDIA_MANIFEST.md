# Phase 3-R CRT Opening Media Manifest

Status: repaired production renders, four delivery encodes, full-size visual self-review, fresh-process determinism, retry-hardened four-candidate browser certification, and recorded isolated-media-lab review complete; direct human review pending

Branch: `feature/phase-3-crt-opening-production`

Accepted Phase 2B parent: `b54f3a83b6180466127589a8d028f94dab892d17`

Phase 3-R repair parent: `ae6cd4c0c664a275c077bd37207efde01e9caa29`

This manifest records the isolated, screen-only Phase 3-R repair. None of the candidates is integrated into the homepage or shipped from `public` or `dist`. The proving field, conduction, CRT object, camera, portal geometry, mobile composition, reduced-motion art direction, and Phase 2B runtime remain frozen. Human acceptance remains required before Phase 4 may consume a candidate.

## Source and reproducibility authority

| Authority | Repository path | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Accepted CRT master | `artifacts/original/phase-0-4-crt-television/source/quantum-signal-television-v1.blend` | 1,516,222 | `3027c4c46e2b829fd97ee9a3a47558e43adda47abcc488420faa0f087bd720a7` |
| Accepted Phase 3 derivative before repair | `artifacts/original/phase-3-crt-opening/source/quantum-signal-television-phase3-opening.blend` | 2,182,647 | `bbde82220f500c6f047c2e2d33a8580c08a40e65800615dd7256bebc2f4472ba` |
| Phase 3-R derivative | `artifacts/original/phase-3-crt-opening/source/quantum-signal-television-phase3-r-crt-authenticity.blend` | 2,222,662 | `4341a3fb7ae29ef9be4472ea23ca9235e36f9609893bc2f37de32e5847d36f26` |

The Phase 3-R builder opens only the exact accepted Phase 3 derivative and writes the distinct repaired derivative. The accepted Phase 0 and Phase 3 sources remain historical byte authorities. The repair replaces only CRT emission/raster materials, startup-screen animation, screen-content optical integration, late texture suppression, and the strictly necessary neutral screen-spill compensation.

The tracked Phase 3-R validator reports `PASS` for 51 of 51 checks with zero failures. The canonical frozen-scene signature is an exact before/after match at `3294b48a0a8e36d07daffb511bf0a59ef8fe25969cd8db686a31c9b1b98658f1`; the independent source-only frozen snapshot is also exact at `94f7bf5e2cf8b87b005fcf654b419bc9111504db9c0cf9f9d6d02def4bb1c61a`. Linked libraries, external images, movie clips, audio, cache files, external fonts and paths, and sequence strips are all zero.

| Production setting | Frozen value |
| --- | --- |
| Blender | 5.2.0 LTS, build `fbe6228777e7` |
| Renderer | Cycles GPU, NVIDIA GeForce RTX 4050 Laptop GPU through OptiX |
| Samples | 48 adaptive samples; threshold `0.018` |
| Denoiser | OpenImageDenoise / OIDN |
| Seed | `2404` |
| Bounces | 8 maximum; diffuse/glossy `4/4`; transmission/transparent `8/8`; volume `0` |
| Color | AgX, Medium High Contrast |
| Image master | 8-bit RGB PNG, display transform applied once in Blender |
| Timeline | Frames 1–270 inclusive, 30 fps, 9.0 seconds; no cue or boundary changed |

The accepted 48-sample production profile remains unchanged. Phase 3-R adds no external runtime or render dependency.

## Outside-Git production masters

Raw PNG sequences and render reports remain outside Git. Tracked evidence records their identities without recording host paths.

| Variant | Dimensions | Frames | Total bytes | Sequence SHA-256 | Render time |
| --- | ---: | ---: | ---: | --- | ---: |
| Desktop | 1920 × 1080 | 270 | 395,176,245 | `c46099f11ee7e42b2b0e5476ff13afa90a449276aef1c949b89c8b2e2dc92160` | 2,854.7167 s |
| Mobile | 720 × 1280 | 270 | 174,339,205 | `511d325d98ae3a029d811cbc2a2d45c5acfa36df9346a6163f4de1be667be0ac` | 1,332.5903 s |

Fresh, separate Blender processes rerendered frames `1, 126, 144, 162, 196, 250, 262, 270` for each variant. All 16 comparisons pass: decoded p95 channel delta `0`, maximum channel delta `1/255`, desktop maximum changed-channel ratio `0.00003215`, and mobile maximum `0.000033637`, both below the `0.0001` gate. PNG byte identity is not claimed across independent OptiX/OIDN processes; exact authored-state access and visual identity are.

## Delivery candidates

All four candidates derive from the corresponding authoritative Phase 3-R sequence. Each contains exactly 270 frames at 30 fps for 9.0 seconds, one 8-bit `yuv420p` BT.709 video stream, no audio, and deterministic keyframes at frames 1, 13, 25, …, 265. The maximum interval is 12 frames / 400 ms.

| Candidate | Codec and settings | Dimensions | Stream bitrate | Bytes | SHA-256 |
| --- | --- | ---: | ---: | ---: | --- |
| Desktop H.264 | `libx264`, CRF 18, slow, closed GOP 12, fast-start MP4 | 1920 × 1080 | 3,107,080 bps | 3,499,571 | `a73be0bb989077551c0b3405cee2c3fa435b67049bf02b523df20baf0a4fb59e` |
| Desktop VP9 | `libvpx-vp9`, CRF 27, good/cpu-used 2, GOP 12, lag/alt-ref disabled, WebM | 1920 × 1080 | 1,474,039 bps | 1,658,294 | `ae83dc3207815696e1043423af325a64ca4633f7189a1180c5c35935d7596386` |
| Mobile H.264 | `libx264`, CRF 19, slow, closed GOP 12, fast-start MP4 | 720 × 1280 | 1,100,632 bps | 1,242,276 | `34319f80ae397758a3f7d4f192c572cee76c11ba5118a6fadb65c0374b4c99b2` |
| Mobile VP9 | `libvpx-vp9`, CRF 28, good/cpu-used 2, GOP 12, lag/alt-ref disabled, WebM | 720 × 1280 | 575,787 bps | 647,761 | `53760b5787421da6497aed7a1086efd5b2ad245207843b7f8524887918d510c9` |

The files remain under `artifacts/original/phase-3-crt-opening/media/` with status `PHASE 3-R PRODUCTION CANDIDATE — HUMAN REVIEW REQUIRED`.

## Codec artifact self-review

The production self-review independently accepts all four encodes as faithful review candidates. This objective and visual self-review is distinct from direct human acceptance.

| Candidate | Full-sequence SSIM | Full-sequence PSNR | Temporal-delta PSNR |
| --- | ---: | ---: | ---: |
| Desktop H.264 | 0.996172 | 51.53 dB | 50.59 dB |
| Desktop VP9 | 0.996497 | 51.80 dB | 50.96 dB |
| Mobile H.264 | 0.996011 | 51.78 dB | 51.14 dB |
| Mobile VP9 | 0.996352 | 52.08 dB | 51.56 dB |

Worst transition PSNR remains within 47.33–47.88 dB, while the late-flattening window is approximately 56.5–56.7 dB. At frame 144 the luminance row-profile correlation is at least `0.998995`, including at least `0.999713` on mobile. Frame 196 text-edge p99 error is 6–7 luma levels; frames 250, 262, and 270 dark-field p99 error is at most 2. At normal size, neither codec shows visible scanline shimmer, crawling, moiré, text ringing, dark-field banding, or phosphor flicker. Brightness-stressed inspection reveals only expected minor compression smoothing/blocking, slightly stronger in VP9; it is not visible in the intended dark presentation.

## Timeline authority

Normalized progress for an inclusive frame is `(frame - 1) / 269`.

| Phase | Inclusive frames | Normalized range |
| --- | ---: | ---: |
| Dormancy | 1–30 | 0.000000–0.107807 |
| Spiral conduction | 31–112 | 0.111524–0.412639 |
| Arrival and indicator response | 113–120 | 0.416357–0.442379 |
| Bowed horizontal phosphor line | 121–132 | 0.446097–0.486989 |
| Continuous picture-field expansion | 133–154 | 0.490706–0.568773 |
| Maintained-tube settling and black stabilization | 155–176 | 0.572491–0.650558 |
| Restrained Quantum content | 177–210 | 0.654275–0.776952 |
| Camera entry and portal approach | 211–270 | 0.780669–1.000000 |
| Late flattening envelope | 247–264 | 0.914498–0.977695 |
| Alignment lock and text-free handoff | 265–270 | 0.981413–1.000000 |

No editorial frame, event boundary, or microtiming cue changed. `docs/planning/PHASE_3_CRT_TIMELINE.md` remains the byte-unchanged timeline authority.

## Visual and responsive review

Full-size production inspection records the following Phase 3-R results:

| Review frame | Result |
| ---: | --- |
| 126 | Neutral, soft, modestly bowed physical phosphor appears within the glass; the former pink-vector read is gone. |
| 144 | One continuously filled picture field expands vertically; no separate luminous bars are perceived. |
| 182 / 196 | Restrained Quantum content remains readable and is optically integrated behind the convex glass rather than pasted over scanlines. |
| 250 | Fine CRT texture remains faintly perceptible but is clearly receding. |
| 270 | The surface is nearly digital, text-free black; scanlines are barely perceptible and the accepted non-magenta depth remains ambiguous rather than portal-like. |

Forward and reverse evidence is coherent. Both desktop and mobile reverse reviews contain the exact 270 authored states in reverse with no raster pop, sudden scanline reappearance, phosphor discontinuity, or inelegant line reconstruction.

The mobile treatment uses its independently keyed accepted composition with 112 raster bands and 72% of desktop raster contrast. The contact sheet inspects 390 × 844, 360 × 800, 320 × 800, and 844 × 390; the source and decoded encodes show no visible portrait shimmer, moiré, or landscape discontinuity at normal size. Conceptual equivalence is maintained without blindly copying desktop raster strength.

Phase 2B ENTRY evidence and alignment geometry remain frozen. The final surface is text-free at frames 265–270, and neither the Phase 2B runtime nor its semantic interface was changed to fit Phase 3-R.

## Reduced-motion authority

The three accepted dormant, powered-off, zero-magenta posters are retained byte-for-byte and were not regenerated.

| Poster | Dimensions | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| Desktop | 1440 × 900 | 726,026 | `03f5490ab11a628eb00c20fa6fc96f72a72593b9ca9da0e8735e55f1c5ffe465` |
| Mobile | 390 × 844 | 209,543 | `9d5c19b1a5e294bc82822f44a11b94940829e67162c55783bb55bc5f5c02caad` |
| Narrow mobile | 320 × 800 | 162,832 | `451d05bcc3d53a8c451e01751bdbb5dc3ddd7d68d9cd6e208a69dc58e4684366` |

## Decoded-memory findings

An RGBA decoded frame costs `width × height × 4` bytes:

| Variant | One decoded frame | Three simultaneous surfaces | All 270 frames if naively retained |
| --- | ---: | ---: | ---: |
| Desktop 1920 × 1080 | 8,294,400 B / 7.91 MiB | 23.73 MiB | 2,239,488,000 B / 2.086 GiB |
| Mobile 720 × 1280 | 3,686,400 B / 3.516 MiB | 10.55 MiB | 995,328,000 B / 949.22 MiB |

These costs continue to reject frame-sequence delivery. A future authorized integration should load one compact video candidate for the active viewport, keep poster-first behavior, and avoid duplicate decoder surfaces.

## Browser and media-lab certification

The tracked report `artifacts/original/phase-3-crt-opening/review/phase-3-r-media-qa-report.json` is `PASS`, 285,925 bytes, SHA-256 `ba0ae4a503369641b9b125e1f19363ff2bdf8701614e20bcd387d65fe87462b6`. Probe, managed Chromium, native Page Visibility, focused playback, and the headed media-lab recording are complete for all four candidates. Each candidate passes 40 of 40 seeks, for 160 of 160 total, with no failed or partial candidate.

| Candidate | First usable frame | Seek median | Seek p95 | Seek max | Focused displayed fps | Displayed drop / corrupt | Visibility |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Desktop H.264 | 643.4 ms | 1,012.9 ms | 1,025.20 ms | 1,036.7 ms | 29.977 | 0 / 0 | complete pass |
| Desktop VP9 | 657.6 ms | 1,018.7 ms | 1,028.25 ms | 1,030.9 ms | 30.266 | 0 / 0 | complete pass |
| Mobile H.264 | 642.9 ms | 1,008.2 ms | 1,022.65 ms | 1,027.9 ms | 30.118 | 0 / 0 | complete pass |
| Mobile VP9 | 585.1 ms | 1,007.65 ms | 1,021.57 ms | 1,030.1 ms | 30.143 | 0 / 0 | complete pass |

The native-visibility harness is retry-hardened: a candidate may receive at most three attempts, retries are allowed only for partial-inconclusive telemetry, and each attempt uses a fresh temporary Chrome profile. Final authority for every candidate is a genuine visible → hidden → visible transition in non-debugged Chrome, with no media error, at least 27 presented fps, and zero displayed dropped or corrupted frames.

Managed Chromium `151.0.7922.34` is the deterministic seek/decode authority. Safari/iOS and Firefox remain expected compatibility targets, not claimed executions.

The actual headed interaction recording is `artifacts/original/phase-3-crt-opening/review/phase-3-r-media-lab-scrub-evidence.webm`, 2,040,677 bytes, SHA-256 `8468a7554bce10b904d231066cbf2144d9a95213d524b49b4ca8ea22a834e072`. Its five exercises pass first frame, final frame, 10 random seeks, 10 rapid alternating seeks, and 11 forward/reverse measurements: 33 measurements and 284 presented-frame deltas with zero dropped or corrupted frames. The separate scrub-simulation MP4 is clearly labeled synthetic and is not substituted for browser evidence.

## Production recommendation

Subject to direct human acceptance:

- Retain both codecs. Offer VP9 WebM first where support is confirmed and H.264 MP4 as the compatibility fallback. If a future authorized integration is constrained to one source, choose H.264 MP4.
- Desktop VP9 is 52.6% smaller. H.264 reached the first usable frame 14.2 ms sooner in this run; seek p95 differs by only 3.05 ms.
- Mobile VP9 is 47.9% smaller, reached the first usable frame 57.8 ms sooner, and had a 1.08 ms lower seek p95 in this run. H.264 remains the Safari/iOS fallback.
- Reduced motion continues to use the viewport-appropriate dormant PNG poster with no autoplay or active-video state.

No candidate is integrated or selected for Phase 4 by this document.

## Compact evidence and transfer package

Phase 3-R replaces obsolete CRT-specific review evidence instead of retaining a second large tree. Four accepted frozen assets remain: the conduction contact sheet and three reduced-motion posters. The final tracked review tree contains 29 files / 31,020,757 bytes. Of these, 24 compact Phase 3-R evidence artifacts account for 29,364,935 bytes excluding the README and manifest authority.

The repair-parent package contained 56 files / 47,625,978 bytes; the final package contains 53 files / 43,254,742 bytes, a reduction of 4,371,236 bytes. The review subtree falls from 42 files / 36,740,251 bytes to 29 files / 31,020,757 bytes, a reduction of 5,719,494 bytes.

The prefinal outside-Git transfer is `<outside-git-review-root>/phase-3-r-crt-authenticity-human-review.zip`: 37,446,823 bytes, SHA-256 `0b983030cb7f0ab021dca92a63775898327e3b5e36195fd3f12835b9e36d1bd7`, 35 portable entries. It includes the 12 full-resolution desktop stills, startup/before-after/handoff/mobile/codec sheets, forward and reverse evidence, browser QA and its actual recording, determinism, the four selected delivery candidates, the four retained frozen assets, compact manifests, and a README. It includes no raw render sequence.

After the final artifact commit is pushed, the external-only finalizer must regenerate the ZIP, adjacent external manifest, and hash sidecar against the exact pushed SHA. That operation writes no tracked file; its final byte/hash identity belongs in the human handoff.

## Evidence authorities

- Source build: `artifacts/original/phase-3-crt-opening/manifests/phase-3-r-source-build.json`
- Source validation: `artifacts/original/phase-3-crt-opening/manifests/phase-3-r-source-validation.json`
- Candidate authority: `artifacts/original/phase-3-crt-opening/manifests/phase-3-r-candidate-authority.json`
- Post-production identity: `artifacts/original/phase-3-crt-opening/manifests/phase-3-r-post-production-manifest.json`
- Fresh-process determinism: `artifacts/original/phase-3-crt-opening/review/phase-3-r-render-determinism-report.json`
- Browser/media QA: `artifacts/original/phase-3-crt-opening/review/phase-3-r-media-qa-report.json`
- Actual media-lab recording: `artifacts/original/phase-3-crt-opening/review/phase-3-r-media-lab-scrub-evidence.webm`
- Frozen Phase 2B ENTRY target: `artifacts/evidence/phase-2b/review/phase-2b-desktop-production-keyframes.png`

Automated packaging and production self-review do not constitute direct human visual acceptance. Phase 4 remains unauthorized.
