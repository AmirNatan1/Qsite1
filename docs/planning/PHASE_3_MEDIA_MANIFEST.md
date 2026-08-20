# Phase 3 CRT Opening Media Manifest

Status: production renders, delivery encodes, visual self-review, four-candidate browser certification, and recorded isolated-media-lab review complete; direct human review pending

Branch: `feature/phase-3-crt-opening-production`

Accepted parent: `b54f3a83b6180466127589a8d028f94dab892d17`

This manifest records the isolated Phase 3 production system. None of these files is integrated into the homepage or shipped from `public` or `dist`. Human acceptance remains required before Phase 4 may consume a candidate.

## Source and reproducibility authority

| Authority | Path | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Accepted CRT master | `artifacts/original/phase-0-4-crt-television/source/quantum-signal-television-v1.blend` | 1,516,222 | `3027c4c46e2b829fd97ee9a3a47558e43adda47abcc488420faa0f087bd720a7` |
| Phase 3 derivative | `artifacts/original/phase-3-crt-opening/source/quantum-signal-television-phase3-opening.blend` | 2,182,647 | `bbde82220f500c6f047c2e2d33a8580c08a40e65800615dd7256bebc2f4472ba` |

The derivative adds only the authored proving field, desktop and mobile spiral conductors, restrained source-driven lighting, eight-step CRT wake animation, deterministic raster/interface animation, separate desktop/mobile cameras, and production render configuration. It does not remodel the accepted CRT or change its recognizable proportions or material identity. The accepted master remains byte-identical.

The tracked source validator reports `PASS` for 28 of 28 checks: no linked libraries, external images, movie clips, audio, cache files, external fonts, external file paths, sequence-editor strips, circular startup graphics, frame-dependent random events, or baked review guides. Frame 1 has zero source-driven magenta and hidden scanlines. Frame 270 has black, non-emissive and hidden physical interface text plus retired physical magenta sources.

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
| Timeline | Frames 1–270 inclusive, 30 fps, 9.0 seconds |

The bounded 16-versus-48-sample gate selected the 48-sample production profile for glass, fine scanlines, dark gradients, conductor response, and raster type. The decision and comparison sheets are recorded in `artifacts/evidence/phase-3/render-quality/phase-3-render-quality-report.json`.

## Outside-Git production masters

Raw PNG sequences and their render reports remain outside Git. Their local paths are intentionally omitted from tracked evidence.

| Variant | Dimensions | Frames | Total bytes | Sequence SHA-256 | Render time |
| --- | ---: | ---: | ---: | --- | ---: |
| Desktop | 1920 × 1080 | 270 | 403,349,433 | `c7031afd60e8cdef4526cf7058511bd3d295efdc86c459f2efdc9425e3e79085` | 2,810.3649 s |
| Mobile | 720 × 1280 | 270 | 178,301,384 | `cac98645bbb12d39048cd700982007c0f5df11c150b4b443247ac72b47221545` | 1,292.7851 s |

Fresh Blender processes rerendered seven sparse checkpoints per variant in non-sequential order. All 14 comparisons passed: decoded p95 channel delta `0`, maximum channel delta `1/255`, and maximum changed-channel ratio `0.000034079`, below the `0.0001` gate. PNG byte identity is not claimed across fresh OptiX/OIDN processes; visual authored-state identity is.

## Delivery candidates

Every candidate is encoded from the corresponding approved PNG sequence, contains 270 frames at 30 fps for 9.0 seconds, uses 8-bit `yuv420p` BT.709 video, contains no audio, and has deterministic keyframes at frames 1, 13, 25, …, 265. The maximum keyframe interval is 12 frames / 400 ms.

| Candidate | Codec and settings | Dimensions | Average bitrate | Bytes | SHA-256 |
| --- | --- | ---: | ---: | ---: | --- |
| Desktop H.264 | `libx264`, CRF 18, slow, closed GOP 12, fast-start MP4 | 1920 × 1080 | 3,321,669 bps | 3,740,952 | `7a8598ba53becd7e8fc5e3773979a19f6b7f872f421c60d29f7c29021439d29d` |
| Desktop VP9 | `libvpx-vp9`, CRF 27, good/cpu-used 2, GOP 12, lag/alt-ref disabled, WebM | 1920 × 1080 | 1,932,072 bps | 2,173,582 | `2128aba7909818ed0b25ee032930ba7b0bd8a04a153540ff1b660b5e041fc376` |
| Mobile H.264 | `libx264`, CRF 19, slow, closed GOP 12, fast-start MP4 | 720 × 1280 | 1,307,906 bps | 1,475,411 | `8bdc3163cef7c8f1e32f6e1a1637cfd7e0758279672eb5d373ccac63dd5e9590` |
| Mobile VP9 | `libvpx-vp9`, CRF 28, good/cpu-used 2, GOP 12, lag/alt-ref disabled, WebM | 720 × 1280 | 897,266 bps | 1,009,425 | `7b5a96f7771824c3db182727188fe77da3c242ab9b8d0c829c47501265896aca` |

The candidate files live under `artifacts/original/phase-3-crt-opening/media/`. They remain isolated production candidates, not deployed website assets.

## Timeline authority

Normalized progress for an inclusive frame is `(frame - 1) / 269`.

| Phase | Inclusive frames | Normalized range |
| --- | ---: | ---: |
| Dormancy | 1–30 | 0.000000–0.107807 |
| Spiral conduction | 31–112 | 0.111524–0.412639 |
| Arrival and indicator response | 113–120 | 0.416357–0.442379 |
| Bowed horizontal phosphor line | 121–132 | 0.446097–0.486989 |
| Rectangular raster expansion | 133–154 | 0.490706–0.568773 |
| Instability settling and black stabilization | 155–176 | 0.572491–0.650558 |
| Restrained Quantum content | 177–210 | 0.654275–0.776952 |
| Camera entry and portal approach | 211–270 | 0.780669–1.000000 |
| Late flattening envelope | 247–264 | 0.914498–0.977695 |
| Alignment lock and text-free handoff | 265–270 | 0.981413–1.000000 |

Exact event markers, endpoint-safe still-progress values, sub-cues, and reverse-traversal behavior are defined in `docs/planning/PHASE_3_CRT_TIMELINE.md`.

## Visual and responsive review

The tracked review package includes desktop conduction, eight-step CRT startup, camera/portal, portal-alignment, safe-zone, Phase 3-to-Phase 2B, mobile, narrow-mobile, landscape, and codec-comparison sheets; selected full-resolution stills; forward and reverse review videos; reduced-motion posters; and real isolated-media-lab interaction evidence.

Human visual review checked the source and both H.264/VP9 decodes at dormant, conduction, line/raster, content, close approach, and handoff checkpoints. The selected settings preserve near-black material texture and the restrained magenta front without visible macroblocking, gradient banding, magenta smearing, mosquito noise, scanline shimmer, raster-type ringing, or a 4:3 aspect snap. The final faint central glass/room gradient is non-emissive and non-magenta; it is residual physical depth rather than a startup circle, portal ring, reticle, or duplicated interface graphic.

The mobile master uses an independently keyed portrait camera and approximately 2.25-turn spiral; it is not a crop of desktop. Evidence covers 390 × 844, 360 × 800, 320 × 800, and 844 × 390 landscape. The safe-zone matrix also covers 1440 × 900, 1366 × 650, 1280 × 800, and 1024 × 768. All mapped Phase 3-to-ENTRY guide anchors record signed x/y deltas of `0px`, within the `3 CSS px` contract. The final mapped state has no visible cabinet, bezel, convex-screen edge, or cable projection, so the 16px physical keepout test is explicitly not applicable rather than fabricated.

The Phase 2B ENTRY captures are labeled `REPRODUCTION`, bind repository SHA `b54f3a83b6180466127589a8d028f94dab892d17`, wait for Syne/Newsreader/Inter, remain at `scrollY = 0`, and pass dimensions and horizontal-overflow checks at all eight viewports. Phase 2B source and runtime were not changed to fit Phase 3.

## Reduced-motion authority

Reduced motion uses a deliberately dormant, zero-magenta, powered-off composition rather than an arbitrary active video frame.

| Poster | Dimensions | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| Desktop | 1440 × 900 | 726,026 | `03f5490ab11a628eb00c20fa6fc96f72a72593b9ca9da0e8735e55f1c5ffe465` |
| Mobile | 390 × 844 | 209,543 | `9d5c19b1a5e294bc82822f44a11b94940829e67162c55783bb55bc5f5c02caad` |
| Narrow mobile | 320 × 800 | 162,832 | `451d05bcc3d53a8c451e01751bdbb5dc3ddd7d68d9cd6e208a69dc58e4684366` |

Automated dormancy gates find zero magenta-dominant pixels and no screen/interface/scanline ghosting above the recorded global and localized thresholds. Human review confirms a quiet, materially readable off-state with negative space for future semantic DOM.

## Decoded-memory findings

An RGBA decoded frame costs `width × height × 4` bytes:

| Variant | One decoded frame | Three simultaneous surfaces | All 270 frames if naively retained |
| --- | ---: | ---: | ---: |
| Desktop 1920 × 1080 | 8,294,400 B / 7.91 MiB | 23.73 MiB | 2,239,488,000 B / 2.086 GiB |
| Mobile 720 × 1280 | 3,686,400 B / 3.516 MiB | 10.55 MiB | 995,328,000 B / 949.22 MiB |

These costs reject a production frame-sequence delivery. Phase 4 should load one compact video candidate for the active viewport, keep poster-first behavior, and avoid duplicate decoder surfaces.

## Browser and media-lab certification

The final report at `artifacts/evidence/phase-3/reports/phase-3-media-qa.json` is `PASS`, 286,096 bytes, SHA-256 `a0877b30bab1eec95674fe297e7fd436ea408eb1167fdce7773baea6d0fad0f2`. All four candidates pass exact ffprobe/container/dimensions/fps/duration/frame-count/no-audio/GOP-12 checks and Chromium execution. Each candidate passed 40 of 40 measured first/final, seeded-random, rapid-alternating, rapid-burst, nearby, forward, and reverse seeks; total result: 160 of 160, with no failed labels.

| Candidate | First usable frame | Seek median | Seek p95 | Seek max | Focused displayed fps | Displayed drop/corrupt delta | Visibility |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Desktop H.264 | 497.2 ms | 1,009.2 ms | 1,451.070 ms | 1,470.0 ms | 27.546 | 2 / 0 | complete pass |
| Desktop VP9 | 735.8 ms | 1,018.9 ms | 1,480.645 ms | 1,511.9 ms | 27.496 | 2 / 0 | complete pass |
| Mobile H.264 | 943.1 ms | 1,015.4 ms | 1,473.340 ms | 1,486.5 ms | 27.313 | 2 / 0 | complete pass |
| Mobile VP9 | 811.8 ms | 1,219.15 ms | 1,461.890 ms | 1,477.0 ms | 27.556 | 2 / 0 | complete pass |

The focused displayed-playback gate is at least 90% of the authored 30 fps—27 presented frames per second—with zero corrupted frames. All four pass. Browser drop counters are retained as measured telemetry, not rewritten into an unrealistic zero-drop claim. The separate real media-lab exercise recorded 33 measurements across five passing runs, 252 presented-frame deltas, and zero dropped or corrupted frames.

The automated seek/decode profile and the native Page Visibility profile are deliberately separate. Remote-controlled Chromium is authoritative for deterministic load, seek, presentation, and playback measurements. A normal, temporary, non-debugged Chrome profile is authoritative for natural Page Visibility: PID-scoped native tab switching must produce loopback telemetry showing the candidate target visible, then hidden, then visible again without a media error. The interaction recording demonstrates the real media-lab UI controls; it does not impersonate or synthesize the separate native visibility authority.

Measured authorities were Chromium `151.0.7922.34` for deterministic candidate execution and normal non-debugged Chrome `150.0.7871.187` for Page Visibility and focused display. Every candidate produced a genuine visible→hidden→visible transition with no media error. Safari/iOS and Firefox remain explicitly expected-not-executed rather than implied passes.

The actual headed interaction recording is `artifacts/original/phase-3-crt-opening/review/phase-3-media-lab-scrub-evidence.webm`, 2,373,551 bytes, SHA-256 `b7e362a5accd9999615774229afb468b2222f57348e6fd7bf350557a3a66ac80`. It operates the visible timeline and all five lab exercises through the isolated lab DOM controls; it is not a synthetic replay of the verifier's seek function. Its byte/hash identity agrees across the QA report, post-production manifest, and file on disk.

## Production recommendation

Subject to human acceptance:

- **Practical delivery:** retain both codecs. Offer VP9 WebM first where support is confirmed and H.264 MP4 as the mandatory compatibility fallback. If Phase 4 is constrained to one source, choose H.264 MP4.
- **Desktop tradeoff:** VP9 is 41.9% smaller; local first-usable-frame timing favored H.264 by 238.6 ms, while seek p95 differed by only 29.575 ms. VP9 is the bandwidth recommendation and H.264 is the compatibility/fast-local-start recommendation.
- **Mobile tradeoff:** VP9 is 31.6% smaller and reached first usable frame 131.3 ms sooner in the tested Chromium run; H.264 remains the Safari/iOS fallback.
- **Reduced motion:** use the viewport-appropriate dormant PNG poster with no autoplay or active-video state.

Chromium execution is recorded directly. H.264 MP4 is the expected Safari/iOS strategy and H.264/VP9 are expected Firefox-compatible delivery choices, but Safari/iOS and Firefox execution are not claimed unless separate target-device/browser evidence is added. No candidate is integrated or selected for Phase 4 by this document; the recommendation remains subject to the five human Phase 3 gates.

## Evidence authorities

- Source build: `artifacts/original/phase-3-crt-opening/manifests/phase-3-source-build.json`
- Source validation: `artifacts/original/phase-3-crt-opening/manifests/phase-3-source-validation.json`
- Determinism: `artifacts/evidence/phase-3/phase-3-render-determinism.json`
- Render quality: `artifacts/evidence/phase-3/render-quality/phase-3-render-quality-report.json`
- ENTRY reproductions: `artifacts/evidence/phase-3/phase-2b-entry-browser/phase-3-entry-capture-report.json`
- Post-production identity: `artifacts/original/phase-3-crt-opening/manifests/phase-3-post-production-manifest.json`
- Browser/media QA: `artifacts/evidence/phase-3/reports/phase-3-media-qa.json`

The post-production manifest is the per-file byte/hash/frame/progress authority for compact review assets. Its final full-mode pass reused and re-verified the existing four delivery candidates without invoking their encoders, then registered the exact tested lab recording. The resulting prefinal outside-Git review ZIP is 36,434,580 bytes with SHA-256 `9a53987c440d8b8908e05e525aa9854c28b2272e03034336464455742ec8430d`; it excludes raw frames and delivery candidates. The external-only finalizer regenerates that ZIP after the branch is clean, pushed, and at local/upstream/remote parity so its external manifest and sidecar bind the exact pushed commit without changing the repository.
