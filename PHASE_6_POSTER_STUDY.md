# Phase 6 dormant-poster optimization study

Date: 2026-08-30
Baseline HEAD: `005a36860ecbfd6fedb3d3f2223f168c1edfbb05`

## Decision

**NO PRODUCTION POSTER CHANGE — CURRENT AUTHORITY RETAINED**

Lossless WebP is the only candidate that merits further testing: it reproduced every decoded RGB byte and reduced each response by 11.76–13.54%. That saving is not yet sufficient evidence for adoption because the local decoder proxy was about 1.8–2.2 times slower than the current PNGs, Firefox browser evidence was unavailable, and slow-network/paint/request-fallback behavior has not been compared across all target engines. Lossless AVIF saved slightly more bytes but had a much larger local decode penalty. Lossy candidates do not yet meet the indistinguishable-image standard.

No production source, manifest, active media, or accepted Blender authority was changed. All candidates were generated outside the repository.

## Active authority inventory

The tracked runtime authority is `artifacts/original/phase-4r2-1-causal-signal-scroll-stability/production`. `scripts/stage-phase4r2-runtime-media.mjs` validates it and projects exact copies into the ignored runtime directory `public/media/cinematic/phase-4r2`. Exact historical duplicates also exist under `artifacts/original/phase-4r2-final-cinematic-production/posters`; they are not the manifest imported by the current Home build.

| Family | Tracked authority file | Runtime URL | Dimensions | Bytes | SHA-256 |
|---|---|---|---:|---:|---|
| Desktop | `posters/phase-4r2-desktop-poster-8dc538810811.png` | `/media/cinematic/phase-4r2/posters/phase-4r2-desktop-poster-8dc538810811.png` | 1920×1200 | 2,096,854 | `8dc5388108116da7202a6b8b24ea8fccb42ebc4cdfb50b861427488436e35979` |
| Portrait | `posters/phase-4r2-portrait-poster-e104fe5e3d0e.png` | `/media/cinematic/phase-4r2/posters/phase-4r2-portrait-poster-e104fe5e3d0e.png` | 780×1688 | 1,146,148 | `e104fe5e3d0e471df2059919eb26eca7bb493929eca1000d8ab6ce95a611dee9` |
| Mobile landscape | `posters/phase-4r2-landscape-poster-5692f67493fa.png` | `/media/cinematic/phase-4r2/posters/phase-4r2-landscape-poster-5692f67493fa.png` | 1688×780 | 1,212,306 | `5692f67493faf34844a6e2eaa838999babbaaf6d1c7d10e51505587daeb1d679` |

The three files total 4,455,308 bytes, but a fresh Home load selects one family. All are non-interlaced, 8-bit RGB PNGs in sRGB, with no alpha or ICC profile. Each has only 226 bytes of ancillary PNG chunks (`pHYs`, `eXIf`, `sRGB`, `cHRM`, and `gAMA`), so metadata removal cannot produce a meaningful saving. The active manifest binds each poster to its family F1 master and records PNG compression level 9 with mixed row prediction.

## Request and fallback behavior

`src/pages/index.astro` emits one responsive `<picture>` with an empty alt inside an `aria-hidden` wrapper. Its `<img>` is `loading="eager"`, `decoding="sync"`, and `fetchpriority="high"`.

| Selected family | HTML media condition |
|---|---|
| Portrait | `(max-width: 800px) and (orientation: portrait)` |
| Mobile landscape | `(max-width: 900px) and (max-height: 480px) and (orientation: landscape)` |
| Desktop | `<img>` fallback for all other viewports |

Consequences verified from source and the current local preview:

- normal enhanced Home requests the selected poster before the manifest/video path and fades it only after a usable video frame;
- reduced motion retains the selected poster and bypasses video;
- no JavaScript retains the same responsive poster in normal document flow;
- capability, codec, typography, deep-link, restored-scroll, controller, and other pre-commit fallback paths retain a compact static poster;
- post-commit media/decode/timeout failure releases the media payload and restores the poster while retaining runway geometry;
- `/#entry` still contains and eagerly requests the poster even while the physical stage is initially concealed;
- supporting routes do not reference these cinematic posters;
- poster responses use `Cache-Control: public, max-age=31556952, immutable`.

Chromium `151.0.7922.34` and Playwright WebKit `26.5` each requested one portrait poster on a fresh 390×844 reduced-motion load. Resizing that page to 844×390 selected and requested the landscape poster, producing two unique poster requests in the document lifetime. Returning to portrait reused the cached first response. A live orientation transition therefore does not preserve a literal one-poster-request lifetime invariant, although each viewport state has one selected source.

At baseline, exactly 800×800 selected the portrait poster while the inline JavaScript classified the cinematic media cohort as desktop because it required `innerHeight > innerWidth`. Phase 6 repaired that selection-boundary mismatch by aligning JavaScript with the CSS portrait rule (`height >= width`); the poster assets themselves remain unchanged.

## Temporary candidate comparison

Candidates were generated under `<EXTERNAL_TEMP_ROOT>/qsite1-poster-study-20260830` with project devDependency Sharp `0.35.3`/libvips `8.18.3`. They remain untracked. Pixel comparison decoded every candidate to three-channel sRGB. Decode figures are nine-run warm medians from the local libvips decoder with cache disabled; they are a relative diagnostic, not browser main-thread attribution.

| Family | Current PNG | Exact PNG re-encode | Exact lossless WebP | Exact lossless AVIF | Warm decode median: PNG / WebP / AVIF |
|---|---:|---:|---:|---:|---:|
| Desktop | 2,096,854 B | 2,070,879 B (−1.24%) | 1,816,932 B (−13.35%) | 1,755,873 B (−16.26%) | 42.39 / 76.68 / 471.85 ms |
| Portrait | 1,146,148 B | 1,134,025 B (−1.06%) | 1,011,362 B (−11.76%) | 971,122 B (−15.27%) | 22.19 / 48.20 / 253.84 ms |
| Mobile landscape | 1,212,306 B | 1,197,014 B (−1.26%) | 1,048,136 B (−13.54%) | 1,021,446 B (−15.74%) | 24.44 / 46.27 / 261.84 ms |
| Aggregate | 4,455,308 B | 4,401,918 B (−1.20%) | 3,876,430 B (−12.99%) | 3,748,441 B (−15.87%) | — |

Lossless candidate SHA-256 values:

| Family | Lossless WebP SHA-256 | Lossless AVIF SHA-256 |
|---|---|---|
| Desktop | `93f619c5afab971fe5cdcfd2a6a41ae728d57ce6d08c4fe277fc21e1ecfad5e2` | `5bee0068da66d9737453edf74bc9218f2504093259c28f56a0a0c449562cc3e7` |
| Portrait | `1da6d59f6d6b5d87d14335858eb2db986daab4b48ed628ce271e0f0c00c13678` | `6b607a7affdf071bed8782df793c06480cf998091b0909ce02655aa87b49c14a` |
| Mobile landscape | `ae41b67e759c5bf999696bd078e250627189aac350696ce387404a4f4be80653` | `695baf8a89ebb48597c6c83295b1dd9fe162c31a0e34cc9af904b7278a078081` |

The PNG re-encode is pixel-exact but saves only 53,390 aggregate bytes. Lossless WebP and AVIF are also pixel-exact, so they preserve composition, black level, cable visibility, CRT silhouette, shadow detail, and edge geometry at the decoded-pixel level.

Lossy WebP quality 95 reduced the three files to 82,234, 35,512, and 51,562 bytes, but changed 93.85%, 90.99%, and 94.02% of pixels respectively. Maximum per-channel errors were 8, 8, and 9; global luma SSIM values were `0.997265839`, `0.997932347`, and `0.996982259`. An amplified difference image showed changes following dark gradients and the cable/CRT edges. Lossy AVIF quality 90 produced similar approximately `0.997` global luma SSIM. These measurements and an ordinary on-screen comparison do not prove freedom from banding or visible calibrated-display loss.

## Tool availability and limitations

Available locally: Sharp `0.35.3`, libvips `8.18.3`, libpng `1.6.58`, libwebp `1.6.0`, libheif `1.23.0`, libaom `3.14.1`, imagequant `2.4.1`, Node `24.18.0`, and Playwright Chromium/WebKit. `ffmpeg`, `ffprobe`, ImageMagick, `pngquant`, `oxipng`, `zopflipng`, `optipng`, `pngcrush`, standalone WebP/AVIF tools, ExifTool, and Python were not available on `PATH`; Windows `convert.exe` is not ImageMagick.

Limitations:

- the candidate decode benchmark is libvips-only and does not establish browser decode, paint, LCP, long-task, or memory behavior;
- Firefox poster-request testing was inconclusive because the local Playwright Firefox context failed while creating a page;
- no physical device or calibrated/HDR display review was performed;
- no high-latency, low-bandwidth, failed-response, offline, BFCache, or format-fallback candidate matrix was run;
- no 1×/2× responsive-dimension candidate was adopted because the accepted portrait and mobile-landscape authorities are deliberately 2× at 390×844 and 844×390, and a lower intrinsic size could soften cable/CRT detail on high-density displays;
- the current manifest schema, filename validators, staging contract, and tests explicitly require exactly three PNG posters. A format migration is not a safe file-only replacement.

## Evidence required before reconsidering replacement

1. Chromium, WebKit, and Firefox cold/warm browser-native decode, paint/LCP, main-thread, memory, and transfer measurements for all three families.
2. High-latency and low-bandwidth comparisons proving that the 134,786–279,922 byte lossless-WebP saving per selected response improves time-to-visible more than its decode cost harms it.
3. Native-resolution and rendered-size side-by-side plus zero-difference evidence, with calibrated review of dark-gradient banding, wall shadows, cable visibility, CRT silhouette, and high-density presentation.
4. Normal, reduced-motion, no-JS, failed/blocked media, image failure, offline, Back/Forward, and orientation tests proving one selected request, no competing fallback request, and coherent fallback behavior.
5. Retention of the repaired 800×800 family boundary and explicit acceptance or rejection of the documented second request during a live orientation change.
6. If accepted, new explicit filenames and hashes plus a controlled manifest/staging/test migration that preserves the original authority and Phase 4 media hashes.

Until that evidence exists, the production-safe result remains:

**NO PRODUCTION POSTER CHANGE — CURRENT AUTHORITY RETAINED**
