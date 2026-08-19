# Quantum Asset Register

Status: controlled register for production assets and frozen Phase 0 review evidence
Last verified: 2026-08-19

## Classification model

| Class | Meaning | Publication rule |
| --- | --- | --- |
| A | Official Quantum identity owned or explicitly authorized for public use | May ship when its exact registered hash is present |
| B | Record- or programme-specific public material with explicit approval | May ship only in the approved context and without expanding its claims |
| R | Original Quantum Phase 0 review artifact or implementation evidence | May be committed and reviewed on the non-production branch; not accepted production creative or launch media until its human gate |
| F | Open-source production font with preserved license and authoritative provenance | May ship only at the registered hash with its license notice |
| C | Internal, private or review-only evidence | Must not enter `public/`, generated output or a public preview |
| D | Prohibited, unapproved, third-party-reference or placeholder material | Must not be committed as a production asset or published |

Original Quantum Phase 0 creative artifacts are owned work rather than Q-HUB imports. They are registered below as review artifacts, not as an accepted production cinematic opening.

## Frozen Q-HUB imports

All source rows below use repository `https://github.com/AmirNatan1/Q-HUB.git` at frozen SHA `70d8b5cc193311b9548c49399dde6a014583e13a`. Source and destination are identical Git-object bytes; no crop, rewrite, recolour, transcode, recompression or metadata edit occurred.

| Asset ID | Destination | Type | Bytes | SHA-256 | Class | Approval and permitted use |
| --- | --- | --- | ---: | --- | --- | --- |
| `QH-BRAND-001` | `public/brand/quantum-full-logo-colors.svg` | SVG | 5,837 | `3b978e3a639d38e5d869afdae02d5e01eea706829ba95f1b9ee82710ffb19196` | A | Approved official full-colour identity |
| `QH-BRAND-002` | `public/brand/quantum-full-logo-white.svg` | SVG | 5,834 | `244f2bb9a95af7ce6d337e1946dedac3ace6cf01feab53c1b0c2d75e58a68032` | A | Approved official reversed identity |
| `QH-BRAND-003` | `public/brand/quantum-icon-color.svg` | SVG | 788 | `04dc37965b33587fea5f4664660f8a7f9a81ec7904d39925b41c6826b80cded9` | A | Approved official compact colour identity |
| `QH-BRAND-004` | `public/brand/quantum-icon-white.svg` | SVG | 785 | `c660ed87bc5293bfbffa662e523343a7e83bc86cb94848912494e85e0dc9d4ff` | A | Approved official compact reversed identity |
| `MARADIN-VID-001` | `public/media/maradin/maradin-field-aperture-approved.mp4` | MP4 | 3,962,341 | `daaec510c528bd7f72a97cfce1d9ede3359ec1339e28e26f524d127f09bf247c` | B | Approved Maradin proof media; no inferred result or metric |
| `MARADIN-IMG-001` | `public/media/maradin/maradin-field-aperture-poster-approved.jpg` | JPEG | 86,343 | `6afc1a69570f2541b89b4f6a5074bec04a5d607743d91670321f550b4d6364bd` | B | Approved poster for the same proof context |
| `MARADIN-VID-002` | `public/media/maradin/maradin-test-contact-approved.mp4` | MP4 | 4,133,483 | `076aecf40d9e67ac29eb0b8e2d34ffc374619862a9679a6e44bc08ccfd2c113d` | B | Approved field-test media; silent presentation; no inferred outcome |
| `MARADIN-IMG-002` | `public/media/maradin/maradin-prove-field-frame-approved.jpg` | JPEG | 169,156 | `b85f1bd5413b6fe7da235e5217e16b106ae4ff0763e8deb9db6e509dbc0b8b8c` | B | Approved proof frame; factual adjacent caption required when published |
| `MARADIN-IMG-003` | `public/media/maradin/maradin-real-field-still-approved.jpg` | JPEG | 961,699 | `49ab9aca0d2e3ef9e9ce164f43f9dbd1514ef815179626bef2bb4217827a6741` | B | Approved field still; frozen binary retains EXIF Orientation 6 and is intentionally presented with a portrait crop; no expanded relationship claim |

See `QHUB_IMPORT_LEDGER.md` for source paths, Git-object verification and the independently authored Phase 1 Maradin mapping.

## Phase 1 self-hosted fonts

The Latin WOFF2 assets below were obtained from versioned `fonts.gstatic.com` delivery URLs returned by the official Google Fonts CSS API. Their SIL Open Font License notices were obtained from the official `google/fonts` repository. Exact URLs, license-object IDs and retrieval details are recorded in `FONT_PROVENANCE.md`.

| Asset ID | Destination | Type | Bytes | SHA-256 | Class | Approval and permitted use |
| --- | --- | --- | ---: | --- | --- | --- |
| `FONT-SYNE-800` | `public/fonts/syne-latin-800.woff2` | WOFF2 | 13,684 | `1a340e84b78c7e1e7ed24306d682fdcd6dc8cc6cb52b158fbaf22c03f7f001c3` | F | Syne display, normal 800, Latin |
| `FONT-NEWSREADER-400` | `public/fonts/newsreader-latin-400.woff2` | WOFF2 | 22,480 | `e66067814f1c672d33a457e4f4d102c818b481420e2234cf685ebdbf2f443904` | F | Newsreader editorial, normal 400, Latin |
| `FONT-INTER-400-600` | `public/fonts/inter-latin-400-600.woff2` | WOFF2 | 48,256 | `3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62` | F | Inter UI, variable normal 400–600, Latin |

The three license notices under `public/fonts/licenses/` are required distribution companions and are governed by `FONT_PROVENANCE.md`.

## Original Quantum Phase 0 creative sources

All rows were authored as repository-native SVG. They contain no third-party reference capture, stock model, scraped product, fabricated photograph, Q-HUB visual system, or required public meaning available only in the artwork.

| Asset ID | Committed path | Dimensions | Bytes | SHA-256 | Class | Approval state and generation |
| --- | --- | ---: | ---: | --- | --- | --- |
| `Q0-CREATIVE-001` | `artifacts/original/phase-0/spiral-geometry-study.svg` | 1800×1000 | 9,673 | `94a7995f59db85f65c7210012ebf972a4695628cea14bcb5e1fb159714d0530d` | R | Original browser-native vector; Phase 0 geometry review only |
| `Q0-CREATIVE-002` | `artifacts/original/phase-0/field-unit-concept-01-dormant-arrival.svg` | 2048×2048 | 5,562 | `e3e0bb1613ee3e4eb1eb95caeb7f69aec86aebbeed9cf5ef315fad36a56f1a42` | R | Original browser-native vector; creative gate pending |
| `Q0-CREATIVE-003` | `artifacts/original/phase-0/field-unit-concept-02-mid-conduction.svg` | 2048×2048 | 5,913 | `0bdba2f20979ededee4f939a9c99a49a495f5931f3a0c718fd4b336d503edee3` | R | Original browser-native vector; creative gate pending |
| `Q0-CREATIVE-004` | `artifacts/original/phase-0/field-unit-concept-03-activation-portal.svg` | 2048×2048 | 7,080 | `ceb7ce81fe85308dca94b217038180ad7c2a0138bb0cda3b07c10d30fcbfb1ee` | R | Original browser-native vector; creative gate pending |
| `Q0-CREATIVE-005` | `artifacts/original/phase-0/proving-ground-style-frame.svg` | 1920×1200 | 4,509 | `0049736f989df9a89c7db55eed8410e89da76b96e5d11c99fbf2f5bf2e734c55` | R | Original browser-native vector; final-intent style study only |
| `Q0-CREATIVE-006` | `artifacts/original/phase-0/spiral-conduction-contact-sheet.svg` | 2700×1800 | 9,596 | `7b3f3d56fd07a87aac0a864d67b249f9f8b01a0e08520e4293a715f28fcdfe4a` | R | Original nine-state browser-native vector; creative gate pending |
| `Q0-CREATIVE-007` | `artifacts/original/phase-0/portal-alignment-study.svg` | 1920×1200 | 5,229 | `0759ed1d5d177328aacac7ae3a365420778f1bfaa8165919406bf67972dd1463` | R | Original browser-native alignment vector; creative gate pending |
| `Q0-CREATIVE-008` | `artifacts/original/phase-0/mobile-composition-study.svg` | 1440×1600 | 5,077 | `74e6de5e86c341200d46b93a73eb336bc3950a96888fcd8cb67a11e5f24006ab` | R | Original separately authored mobile vector; creative gate pending |
| `Q0-CREATIVE-009` | `artifacts/original/phase-0/reduced-motion-poster-desktop.svg` | 1600×1000 | 3,457 | `7473a7a8613aa12d54b5609391466360933842bcecd48f975ce981bdea08c53f` | R | Original static dormant poster; accessibility review pending |
| `Q0-CREATIVE-010` | `artifacts/original/phase-0/reduced-motion-poster-mobile.svg` | 720×1600 | 3,503 | `11566823499cab4fbf641cf54fd68aef5eb2549b0f19bd1f866d7fdc500383ac` | R | Original static dormant poster; accessibility review pending |

## Original Quantum Phase 0 3D repair package

The package at `artifacts/original/phase-0-3d-repair/` is classified as **original Quantum creative evidence** with approval state **pending human creative review**. Every item in this section is Class R: it may remain on the non-production review branch, but it is not an accepted launch asset and cannot enter production without the Field Unit + Spiral Conduction + Portal creative ACCEPT.

The grouped records below account for all 64 unignored original binary files in the package: one Blender source, 45 rendered PNGs, six encoded media variants, and 12 binary review derivatives. Their combined physical size is 113,509,958 bytes. The review bundle also contains one JSON record and one Markdown guide, bringing the five governed sets to 113,514,139 bytes. Exact member paths, dimensions, byte counts and SHA-256 values are governed by the named canonical manifests or, for the five diagnostic renders, by the explicit resolution table immediately below.

| Asset ID | Committed path or governed set | Records | Bytes | Integrity authority | Class | Approval and publication state |
| --- | --- | ---: | ---: | --- | --- | --- |
| `Q0-3D-SOURCE-001` | `artifacts/original/phase-0-3d-repair/source/quantum-field-unit.blend` | 1 | 360,021 | SHA-256 `91601d8c0fec51744df4e4cca510556559e7f5c542b9bcc84ca83ae650c16adc`; `manifests/blender-source-validation.json` | R | Original procedural Blender source; pending human creative review; not a launch asset |
| `Q0-3D-RENDER-001` | `artifacts/original/phase-0-3d-repair/renders/` canonical set excluding `diagnostics/` | 40 PNG | 70,710,190 | `manifests/render-manifest-all.json` | R | Original Blender renders; pending human creative review; not launch media |
| `Q0-3D-RENDER-002` | `artifacts/original/phase-0-3d-repair/renders/diagnostics/` | 5 PNG | 2,763,157 | Explicit final-file table below | R | Original diagnostic evidence; review-only and not launch media |
| `Q0-3D-MEDIA-001` | `artifacts/original/phase-0-3d-repair/media/` | 6 videos | 9,873,220 | `manifests/encode-manifest.json` and `manifests/ffprobe-manifest.json` | R | Original 960×540 Blender animatic encodes; pending human creative review; not launch media |
| `Q0-3D-REVIEW-001` | `artifacts/original/phase-0-3d-repair/review/` | 14 records: 11 PNG, 1 WebM, 1 JSON, 1 Markdown | 29,807,551 | `manifests/review-bundle-manifest.json` | R | Compact original review bundle; pending human creative review; not a public-launch surface |

### Final diagnostic-render resolution

The diagnostic files were generated across successive repair passes, so no superseded stage manifest is treated as a blanket final authority. These five rows are the final physical-file record. The cited matching manifest is the stage record whose member SHA-256 agrees with the current file.

| Path | Bytes | SHA-256 | Matching stage manifest |
| --- | ---: | --- | --- |
| `artifacts/original/phase-0-3d-repair/renders/diagnostics/diagnostic-dormant.png` | 533,086 | `3d206fcc7db49fd5196faec1764749d004365aee2d7f5bb3a4f9ccd4a452380e` | `render-manifest-diagnostics.json` |
| `artifacts/original/phase-0-3d-repair/renders/diagnostics/diagnostic-mid-conduction.png` | 547,501 | `7a6b39bc4212a501d1d0e1b6b4c3d1a4d10313280283908f5ce0b2b85ca978c5` | `render-manifest-diagnostics.json` |
| `artifacts/original/phase-0-3d-repair/renders/diagnostics/diagnostic-interface.png` | 648,013 | `4b5d15a7ebe2d073f8fc570d848e797ea78fe2ca3c0352c00b96fd70c62e6522` | `render-manifest-qa-repair.json` |
| `artifacts/original/phase-0-3d-repair/renders/diagnostics/diagnostic-portal-end.png` | 516,512 | `2965071a2fa53c67ae6e7e4379a221300902f099aa279ba794d6dee3198c85cd` | `render-manifest-portal-diagnostics.json` |
| `artifacts/original/phase-0-3d-repair/renders/diagnostics/diagnostic-dom-match.png` | 518,045 | `f4efc6a8f5fd250fcc37d020f6df0449b3dcd4cb3838594852f9d3923a3d0240` | `render-manifest-portal-diagnostics.json` |

### 3D repair manifest register

Every committed manifest and machine-readable report in the package is registered here. Stage-specific render manifests remain provenance evidence; `render-manifest-all.json`, `encode-manifest.json`, `review-bundle-manifest.json`, and `blender-source-validation.json` are the canonical authorities for their final governed sets.

| Manifest or report | Bytes | SHA-256 | Classification and approval |
| --- | ---: | --- | --- |
| `artifacts/original/phase-0-3d-repair/manifests/blender-source-validation.json` | 819 | `905adcc72a8e035698f60a14f86bd4374071c373dba76c4d81a10fd5c4bc5e78` | Original Quantum production evidence; pending human creative review |
| `artifacts/original/phase-0-3d-repair/manifests/browser-seek-report.json` | 27,491 | `e9ec93b2204a5da20ea865e3a6373d58c68427429211fb897aa10b6f2bcdbada` | Original Quantum performance evidence; pending human creative review |
| `artifacts/original/phase-0-3d-repair/manifests/encode-manifest.json` | 16,785 | `f4e24e7636ea8f1938d25e8cd63e8ef143ab928a2807811bd407bbdd107c69a2` | Original Quantum media evidence; pending human creative review |
| `artifacts/original/phase-0-3d-repair/manifests/ffprobe-manifest.json` | 12,651 | `e9ec288b11c2d56ce78847a9baa53d5de1fccef36e2771a664897162a5a0ffb4` | Original Quantum stream evidence; pending human creative review |
| `artifacts/original/phase-0-3d-repair/manifests/portal-alignment-report.json` | 715 | `e44edeec81b57f3775f551249f3ec93046c71a1c3ad3f1c6617e571aba5f6dc4` | Original Quantum alignment evidence; pending human creative review |
| `artifacts/original/phase-0-3d-repair/manifests/render-manifest-all.json` | 13,175 | `fc66e3b87262ee983e9ea5cf7549a06a1eb9b1ee95b508ca28ef24fcd1f9d10a` | Canonical original Quantum render inventory; pending human creative review |
| `artifacts/original/phase-0-3d-repair/manifests/render-manifest-animatic.json` | 60,024 | `4977d04f5c00547c07feaf85bb92ff2adeb09b285f1c083f1166fc61e0c53715` | Reproducibility record for removed working frames; review-only |
| `artifacts/original/phase-0-3d-repair/manifests/render-manifest-cable-study.json` | 928 | `d3b0f8605d184776adf40e37c410161fb6275ad82d2be1ef0d140d40317ad843` | Original Quantum stage evidence; review-only |
| `artifacts/original/phase-0-3d-repair/manifests/render-manifest-diagnostics.json` | 2,194 | `705c7d3398c2cee4a12ee418ec3d70038e05ec45f77837b96d1301fca2f7cb20` | Original Quantum stage evidence; superseded members resolved above |
| `artifacts/original/phase-0-3d-repair/manifests/render-manifest-mobile.json` | 3,082 | `01b6c2f88f3a1eb5adac97033bb87c5908e264ba9c246da8db8890a941cd541b` | Original Quantum mobile stage evidence; review-only |
| `artifacts/original/phase-0-3d-repair/manifests/render-manifest-portal-diagnostics.json` | 1,582 | `51ced4cbbfcc33e151e041f10f15e7fe1f61f96e7ba6f8f7f09043b14c37200c` | Original Quantum portal stage evidence; review-only |
| `artifacts/original/phase-0-3d-repair/manifests/render-manifest-qa-repair.json` | 5,332 | `e45ce8bef3054a453fd3fac9410e23ff96fff3aa1ca643861c9e637253d02444` | Original Quantum QA-repair evidence; review-only |
| `artifacts/original/phase-0-3d-repair/manifests/review-bundle-manifest.json` | 3,588 | `6701af57f10d805b0493d20fdb21a3b162c86453af69c8add5fad6589632ec89` | Canonical original Quantum review inventory; pending human creative review |

### 3D authoring and package-support records

These repository-native text files are not launch assets, but they are registered so the package can be reproduced and audited without relying on uncommitted machinery.

| Path | Bytes | SHA-256 | Classification and approval |
| --- | ---: | --- | --- |
| `artifacts/original/phase-0-3d-repair/README.md` | 7,944 | `c88a1dcbdc413ad74bfab2f0a7d2ee0946c449c69f8bb8c17b81f76891aef61e` | Original Quantum production record; review-only |
| `artifacts/original/phase-0-3d-repair/source/build_scene.py` | 49,266 | `f2a7e051b618f0fb58dc24003076d5121c656bc253fdb0bd2acd66cd1dd71aa3` | Original procedural authoring source; review-only |
| `artifacts/original/phase-0-3d-repair/source/compose_review.py` | 19,664 | `21f8f9b7e97acdd18bbf8f3bfc4b1452de6a425bfee8273881d6ba8ad88429b1` | Original review-composition source; review-only |
| `artifacts/original/phase-0-3d-repair/source/render_deliverables.py` | 14,612 | `32517be392e4cb9bb5777403f9fb68e2cc542ac88b1534ff44102f51c8781e82` | Original render-orchestration source; review-only |
| `artifacts/original/phase-0-3d-repair/source/scene_config.py` | 5,308 | `13bfab63ab181d92d50f1262cf17ed188ca36fa11d605f18ba62850165ba1642` | Original scene configuration; review-only |
| `artifacts/original/phase-0-3d-repair/source/validate_scene.py` | 4,958 | `299fbbe6071889beb856fe1b0b3c86288476064cf75c3c31b8e388ed0fd5f0e9` | Original scene-validation source; review-only |
| `artifacts/original/phase-0-3d-repair/work/.gitignore` | 14 | `240a3e0d37d2e86b614063f5347eb02d4f99ca6c254de6b82871ff8d95532a7d` | Work-directory exclusion control; not an asset |

The verified temporary 192-frame sequence and caches were removed after encoding. They remain reproducible from the registered Blender source and scripts; only `work/.gitignore` remains in that directory. No Blender or FFmpeg executable, archive, library, external add-on, model, texture, font, reference-site binary, or third-party capture is included in the package.

## Original Quantum Phase 0.2 3D repair-v2 package

The additive package at `artifacts/original/phase-0-3d-repair-v2/` is classified as **original Quantum creative evidence** with approval state **pending human creative review**. It does not replace or modify the accepted Phase 0 package above. Every record in this section is Class R and is excluded from launch use unless the Field Unit + Spiral Conduction + Portal creative gate is accepted.

The package contains 88 unignored files and 73,083,534 bytes. Its 61 original binary files comprise two editable Blender sources and 59 sanitized PNGs, totalling 72,805,959 bytes. The 47 canonical render PNGs total 52,807,472 bytes; the 12 required review PNGs total 19,559,617 bytes. The remaining 27 records are 11 manifests and 16 repository-native source, contract, guide or exclusion-control files totalling 277,575 bytes. No video, animatic, numbered frame sequence, `.blend1`, cache, executable, archive, font binary, external model, image texture, add-on, reference binary or third-party capture is present.

### Phase 0.2 binary register

These grouped records explicitly account for every original binary in the package. The render row is the union of 12 blockouts, 26 final canonical stills, four final diagnostics and four portal-surface outputs governed by the cited manifests, plus the separately resolved desktop safe-area diagnostic. The review row is governed by the exact 12-record review-bundle manifest. `png-metadata-sanitization.json` independently binds all 59 PNG paths, decoded-pixel-preservation results, byte counts and final SHA-256 values.

| Asset ID | Committed path or governed set | Records | Bytes | Integrity authority | Class | Approval and publication state |
| --- | --- | ---: | ---: | --- | --- | --- |
| `Q0-3D-V2-SOURCE-001` | `artifacts/original/phase-0-3d-repair-v2/source/field-unit-v2-blockouts.blend` | 1 | 132,135 | SHA-256 `ca8d17e065feb15c46d26147b2b16f3d758f45876862c0819955eb54dda01e96` | R | Original procedural Blender blockout source; pending human creative review; not a launch asset |
| `Q0-3D-V2-SOURCE-002` | `artifacts/original/phase-0-3d-repair-v2/source/field-unit-v2-integrated-aperture-chassis.blend` | 1 | 306,735 | SHA-256 `ebb41dd813c36639660f26b5ac444eec39d62e7658019db7a76808899c1fe9e4`; `manifests/blender-source-validation.json` | R | Original final editable Blender source; validator PASS 12/12; pending human creative review; not a launch asset |
| `Q0-3D-V2-RENDER-001` | `artifacts/original/phase-0-3d-repair-v2/renders/` | 47 PNG | 52,807,472 | `blockout-render-manifest.json`; `final-render-manifest-all.json`; `final-render-manifest-diagnostic.json`; `portal-surface-manifest.json`; explicit safe-area resolution below; all final bytes also bound by `png-metadata-sanitization.json` | R | Original Blender and shared-authority portal stills; pending human creative review; not launch media |
| `Q0-3D-V2-REVIEW-001` | `artifacts/original/phase-0-3d-repair-v2/review/` | 12 PNG | 19,559,617 | `review-bundle-manifest.json`; `review-originals-manifest.json`; `browser-review-composition-manifest.json`; `png-metadata-sanitization.json` | R | Original review sheets; pending human creative review; not a public-launch surface |
| `Q0-3D-V2-MEDIA-001` | Package encoded-media set | 0 | 0 | `blender-source-validation.json`; dedicated asset verifier | R | Intentionally still-only; no new media encode or full animatic was created |

The only render outside the four canonical render-output arrays is retained as an explicit safe-area diagnostic and is therefore resolved directly rather than hidden behind a blanket manifest claim.

| Path | Dimensions | Bytes | SHA-256 | Classification and approval |
| --- | ---: | ---: | --- | --- |
| `artifacts/original/phase-0-3d-repair-v2/renders/diagnostics/desktop-safe-area.png` | 1920×1200 | 1,414,799 | `a16dea1f9ae72a40cd1b0d2d3f45396db394e69a64270ce3316ae4eb8af1e49d` | Original Quantum safe-area evidence; pending human creative review; not launch media |

### Phase 0.2 manifest register

These are the 11 canonical or supporting machine-readable authorities in the package. Their combined size is 117,569 bytes.

| Manifest or report | Bytes | SHA-256 | Classification and approval |
| --- | ---: | --- | --- |
| `artifacts/original/phase-0-3d-repair-v2/manifests/blender-source-validation.json` | 5,017 | `6f11055580dd00bf25d1d1c508a5c9e3d62311638df555351c59ee1299fceda1` | Original Quantum Blender integrity evidence; PASS 12/12; pending human creative review |
| `artifacts/original/phase-0-3d-repair-v2/manifests/blockout-render-manifest.json` | 4,176 | `a87f8c18594352c2564be5d8dc52b930388459785f9e889cefcf7e3bcbb701f9` | Canonical 12-render blockout inventory; review-only |
| `artifacts/original/phase-0-3d-repair-v2/manifests/browser-review-composition-manifest.json` | 15,347 | `239f875a3b8dac7621dfbdc9d7a7f226fea191f22a76b6b56174f33f04c8c8a8` | Canonical three-sheet browser-capture lineage; review-only |
| `artifacts/original/phase-0-3d-repair-v2/manifests/final-render-manifest-all.json` | 13,276 | `a530bd6978b1249e94eec9a75a0816dc6b5c0deabe0f674f8bcbc1e0cc440bff` | Canonical 26-render final-still inventory; pending human creative review |
| `artifacts/original/phase-0-3d-repair-v2/manifests/final-render-manifest-diagnostic.json` | 2,669 | `31fde5a2a23cae48904324ad8f277656ec775c63f4bfb81907bcc5e782faa9b3` | Canonical four-render diagnostic inventory; review-only |
| `artifacts/original/phase-0-3d-repair-v2/manifests/png-metadata-sanitization.json` | 34,389 | `74dc0b36c0e0ff339b983eea6a85cff4ffcf3ca86f5031108d2f4f763949a86d` | Canonical 59-PNG metadata and decoded-pixel-preservation evidence; PASS; review-only |
| `artifacts/original/phase-0-3d-repair-v2/manifests/portal-surface-manifest.json` | 2,043 | `897bc776c62e6f5f76d71cd4f0b8d809a626b9cf3781f43318022957d5df6941` | Canonical four-output shared portal-layout inventory; pending human creative review |
| `artifacts/original/phase-0-3d-repair-v2/manifests/review-bundle-manifest.json` | 4,140 | `c2414cf2a202f76d517f70b6a4b0800a36227da78fd5407a5d6689703ed7394b` | Canonical exact 12-sheet review bundle; pending human creative review |
| `artifacts/original/phase-0-3d-repair-v2/manifests/review-composition-manifest.json` | 7,680 | `32ad79ed8a0ae8496e6c1e00bd1bae9f2374fd9970ddf544ede237886172d5e9` | Canonical nine-sheet non-browser composition lineage; review-only |
| `artifacts/original/phase-0-3d-repair-v2/manifests/review-originals-manifest.json` | 23,198 | `ddc1b9665765adb602348ad3df443fc209d4ceaf640837f3ff9d142d56811684` | Canonical 11-compositor-output inventory; review-only |
| `artifacts/original/phase-0-3d-repair-v2/manifests/silhouette-decision-manifest.json` | 5,634 | `4b2b20f4e2d6602758f33b779bd8097419bf45dc2ee1227518d0e15b2cd32ecd` | Canonical silhouette decision evidence; pending human creative review |

### Phase 0.2 authoring and package-support records

The following 16 repository-native text and control files total 160,006 bytes. They are not launch assets; they preserve reproducibility, layout authority and package hygiene without any runtime dependency on Blender, Q-HUB or an external source repository.

| Path | Bytes | SHA-256 | Classification and approval |
| --- | ---: | --- | --- |
| `artifacts/original/phase-0-3d-repair-v2/README.md` | 9,347 | `f1606e961a3b0a929152c247a0a5b5d6f0bfbf727deb46adee715029290077df` | Original Quantum production record; review-only |
| `artifacts/original/phase-0-3d-repair-v2/portal-layout.json` | 6,675 | `25666cf071afe7564dc051cbec770ead325cdf19ef1f4926e43d793a2a053bc5` | Shared physical/DOM portal-layout authority; pending human creative review |
| `artifacts/original/phase-0-3d-repair-v2/source/build_blockouts.py` | 13,001 | `39b8b21b2c565ff275926d795706438cfa14355639365a1a0adf4753f30a73d6` | Original procedural authoring source; review-only |
| `artifacts/original/phase-0-3d-repair-v2/source/build_final_scene.py` | 35,826 | `c4dc01e724f0d54458e9e290081ed50ef864f71aa0078629eb10e92a2354bc8d` | Original procedural authoring source; review-only |
| `artifacts/original/phase-0-3d-repair-v2/source/compose_blockout_comparison.py` | 8,818 | `79ec43c4c73cf91e989b21d4d7dc5ace8a5b5b88cc72d77c3d8b1c6bb1570017` | Original review-composition source; review-only |
| `artifacts/original/phase-0-3d-repair-v2/source/compose_browser_review.py` | 11,024 | `e34d258af89f2f16e62f68e7f2e65a3105b6e9f7663ec1d4befd637db181a9f8` | Original browser-review composition source; review-only |
| `artifacts/original/phase-0-3d-repair-v2/source/compose_final_review.py` | 23,626 | `226850e1084d3173f69119d22ae4c248ed95e9b235a0637a3ca924b4bf02c09a` | Original review-composition source; review-only |
| `artifacts/original/phase-0-3d-repair-v2/source/compose_portal_surfaces.py` | 8,363 | `4f7ff16cb0cf0585dd2b51c1522f3300ec04c962c3a2b7eb55b65fc010a121c2` | Original shared-authority portal compositor; review-only |
| `artifacts/original/phase-0-3d-repair-v2/source/finalize_review_bundle.py` | 8,232 | `499d407bc533bd7b7e546c9ac507fad06b091f39ca547dea7ea49408fdd11488` | Original review-bundle finalizer; review-only |
| `artifacts/original/phase-0-3d-repair-v2/source/refresh_package_manifests.py` | 3,506 | `6ba2e110d4adddb021bac1696e4e745df6143bbf9268be789ce207a30810cb82` | Original manifest refresh source; review-only |
| `artifacts/original/phase-0-3d-repair-v2/source/render_blockouts.py` | 3,235 | `8aeaa6024cb10a81ed4a41651c1a317164d3a721bc749b92fe9f7d815b8a6be3` | Original blockout render orchestration; review-only |
| `artifacts/original/phase-0-3d-repair-v2/source/render_final_stills.py` | 9,994 | `6c5527d12fce68d98a6c6a7f694f90334b013e395a79fc69d9094e9d40fb7b9d` | Original still-render orchestration; review-only |
| `artifacts/original/phase-0-3d-repair-v2/source/sanitize_png_metadata.py` | 5,295 | `320536a6fa8788c0dd7ae3d8d6872fd3c173e2cffcf0645102f64bd146c80252` | Original metadata sanitizer; review-only |
| `artifacts/original/phase-0-3d-repair-v2/source/scene_config.py` | 2,241 | `6099d3c7db949e92d5c69de6447e0c060b4fb6e2454e44928f287ce984622da0` | Original scene configuration; review-only |
| `artifacts/original/phase-0-3d-repair-v2/source/validate_final_scene.py` | 10,809 | `d3a5be6815b18d39a186f54d56a59050d8597f93e5dd655ec2c751f5d7933f00` | Original Blender integrity validator; review-only |
| `artifacts/original/phase-0-3d-repair-v2/work/.gitignore` | 14 | `240a3e0d37d2e86b614063f5347eb02d4f99ca6c254de6b82871ff8d95532a7d` | Work-directory exclusion control; not an asset |

### Phase 0.2 browser evidence lineage

The non-production evidence tree at `artifacts/evidence/phase-0-3d-repair-v2/` contains 74 files and 9,720,419 bytes: 36 raw browser JPEGs, 36 viewport-exact normalized PNGs, one matrix report and one Markdown audit. The 72 capture binaries total 8,856,651 bytes and are governed member-by-member by the matrix report. They are Class R implementation evidence, not launch assets.

| Evidence authority | Records | Bytes | SHA-256 | Classification and approval |
| --- | ---: | ---: | --- | --- |
| `artifacts/evidence/phase-0-3d-repair-v2/browser-matrix-report.json` | 46 cases; 36 capture lineages | 850,178 | `0e0cdf7e578eb24514146ba3826a1ded4191de740b54ce050ada82a676f71905` | Original browser layout, collision, scene-safety and capture-lineage evidence; PASS; review-only |
| `artifacts/evidence/phase-0-3d-repair-v2/TYPOGRAPHY_COLLISION_QA.md` | 1 | 13,590 | `18cf5aee008e91371b0d5db66b836760b0263c487e5959fa1662a54d9a1ee164` | Original human-readable QA record; review-only |

## Original Quantum Phase 0.3 Aperture Station package

The additive package at `artifacts/original/phase-0-3d-repair-v3/` is **original Quantum creative evidence** with approval state **pending human creative review**. It does not overwrite the Phase 0 or Phase 0.2 packages. Every record is Class R and remains excluded from launch use unless the `APERTURE STATION ART DIRECTION` and `PORTAL TYPOGRAPHY REPAIR` human gates are accepted.

The package contains 118 files and 104,517,134 bytes. Its 85 original binary files comprise two editable Blender sources and 83 sanitized PNGs, totalling 104,035,955 bytes. The PNG set contains 68 original still renders, the exact 13-sheet final review bundle, and two explicitly superseded silhouette-iteration sheets retained as decision provenance. The remaining 33 repository-native records comprise 16 manifests, 15 deterministic Python sources, one README and one shared portal-layout contract. No video, animatic, numbered frame sequence, `.blend1`, cache, executable, archive, font binary, external model, image texture, add-on, reference binary or third-party capture is present.

`manifests/package-inventory.json` is the package-wide authority. It self-excludes its own hash and binds the other 117 intended files and 104,456,458 bytes; adding the 60,676-byte inventory itself gives the complete 118-file total above. Every inventory record includes its repository-relative and package-relative path, byte count, SHA-256, classification, approval state and `intendedCommit: true`.

### Phase 0.3 binary register

These grouped records account for every original binary in the package. Final review membership is the exact 13-name set in `review-bundle-manifest.json`; the two earlier silhouette sheets are governed separately and are not members of that final bundle. `png-metadata-sanitization.json` independently binds all 83 PNGs and records decoded-pixel preservation.

| Asset ID | Committed path or governed set | Records | Bytes | Integrity authority | Class | Approval and publication state |
| --- | --- | ---: | ---: | --- | --- | --- |
| `Q0-3D-V3-SOURCE-001` | `artifacts/original/phase-0-3d-repair-v3/source/quantum-aperture-station-v3-blockouts.blend` | 1 | 121,240 | SHA-256 `dc3cd4e1eba70150b73013d00727fb072213a4017df4efbc80bb8ebea81d1932`; `blockout-render-manifest.json` | R | Original editable Blender blockout source; superseded design-decision evidence; not a launch asset |
| `Q0-3D-V3-SOURCE-002` | `artifacts/original/phase-0-3d-repair-v3/source/quantum-aperture-station-v3.blend` | 1 | 310,905 | SHA-256 `5dde7731b366a1fd19f8f3cc93d338754b9536c6141b2819f4c123bc1a2af676`; `blender-source-validation.json` | R | Original final editable Blender source; validator PASS 13/13; pending human creative review; not a launch asset |
| `Q0-3D-V3-RENDER-001` | `artifacts/original/phase-0-3d-repair-v3/renders/` | 68 PNG | 64,461,417 | `blockout-render-manifest.json`; `final-render-manifest-all.json`; `final-render-manifest-diagnostic.json`; `final-render-manifest-mobile.json`; `portal-surface-manifest.json`; `scene-source-keepouts.json`; `png-metadata-sanitization.json` | R | Original Blender and shared-authority portal stills; pending human creative review; not launch media |
| `Q0-3D-V3-REVIEW-001` | `artifacts/original/phase-0-3d-repair-v3/review/` exact final top-level set | 13 PNG | 28,211,065 | `review-bundle-manifest.json`; `review-originals-manifest.json`; `review-composition-manifest.json`; `browser-review-composition-manifest.json`; `png-metadata-sanitization.json` | R | Exact final human-review package; pending human creative review; not a public-launch surface |
| `Q0-3D-V3-REVIEW-002` | `artifacts/original/phase-0-3d-repair-v3/review/iterations/` | 2 PNG | 10,931,328 | `silhouette-iteration-1-decision-manifest.json`; `manifests/iterations/silhouette-iteration-2-decision-manifest.json`; `png-metadata-sanitization.json` | R | Superseded silhouette-gate evidence retained for decision provenance; never a launch asset |
| `Q0-3D-V3-MEDIA-001` | Package encoded-media set | 0 | 0 | `blender-source-validation.json`; dedicated Phase 0.3 asset verifier | R | Intentionally still-only; no video variant or full animatic was created |

The final 13-sheet bundle is: `aperture-station-silhouette-options.png`, `aperture-station-recommended-design-sheet.png`, `aperture-station-material-sheet.png`, `cable-conductor-v3-sheet.png`, `proving-ground-v3-style-frame.png`, `camera-path-v3-study.png`, `activation-v3-contact-sheet.png`, `portal-typography-v3-sheet.png`, `desktop-hero-composition-v3.png`, `mobile-hero-composition-v3.png`, `text-zoom-and-fallback-v3.png`, `reduced-motion-v3-desktop.png`, and `reduced-motion-v3-mobile.png`.

### Phase 0.3 manifest register

These 16 machine-readable authorities total 276,638 bytes. Stage and silhouette manifests remain provenance evidence; the package inventory, final render authorities, Blender validation, PNG sanitation, browser-review lineage and review-bundle manifest govern the settled package.

| Manifest or report | Bytes | SHA-256 | Classification and approval |
| --- | ---: | --- | --- |
| `artifacts/original/phase-0-3d-repair-v3/manifests/blender-source-validation.json` | 6,193 | `9f1f3ddc4ac0c4b8b9e10c749b805decbfa3be76cadda2fccdce2c2e5174bb91` | Original Quantum Blender integrity evidence; PASS 13/13; pending human creative review |
| `artifacts/original/phase-0-3d-repair-v3/manifests/blockout-render-manifest.json` | 3,798 | `2c9e25333da4fd32537fda43daf33ca41ad26ca69e6eca34bb39a7b89fb9ae3a` | Original blockout render inventory; superseded design-decision evidence |
| `artifacts/original/phase-0-3d-repair-v3/manifests/browser-review-composition-manifest.json` | 22,299 | `f5a7f5908aee8b65969fcbaf3d5143dd8d52a0b7be3ca2f26565a6153279e074` | Canonical four-sheet browser-capture lineage; review-only |
| `artifacts/original/phase-0-3d-repair-v3/manifests/final-render-manifest-all.json` | 15,533 | `ed09b1722a5354d29b0d29c99a485ac4bfd7dea0718127ff9712803a94ece26e` | Canonical final-still inventory; pending human creative review |
| `artifacts/original/phase-0-3d-repair-v3/manifests/final-render-manifest-diagnostic.json` | 6,116 | `b28d58f92966e33c1ce79d9614f5b1e4db29dd88bf8e17fcfaa1ae28f81a855c` | Canonical diagnostic-still inventory; review-only |
| `artifacts/original/phase-0-3d-repair-v3/manifests/final-render-manifest-mobile.json` | 2,617 | `9aaddf823f75dad7c1ecc2feb3a193b9819db37499193617d137fe417364b0e5` | Canonical independently authored mobile-render inventory; pending human creative review |
| `artifacts/original/phase-0-3d-repair-v3/manifests/iterations/silhouette-iteration-2-decision-manifest.json` | 7,070 | `0d35f76f6b3e452dac6eb846af905a7b453c8a73d3b4f867927e7e235a14b1cf` | Superseded iteration-2 silhouette decision evidence; review-only |
| `artifacts/original/phase-0-3d-repair-v3/manifests/package-inventory.json` | 60,676 | `ec8fc58217b80be850be9fe98a94a549ea8cf5d83eea00883fb6a66654d46104` | Canonical package-wide 117-record self-excluded inventory; review-only |
| `artifacts/original/phase-0-3d-repair-v3/manifests/png-metadata-sanitization.json` | 48,564 | `bba8b813f18d4a332067982696a68bd44c57bc0a9664ee15f175fe7b14c866bb` | Canonical 83-PNG sanitation and decoded-pixel-preservation evidence; PASS; review-only |
| `artifacts/original/phase-0-3d-repair-v3/manifests/portal-surface-manifest.json` | 2,267 | `40369605cb2cd4e5792ae39b9f76598251f629a52321360d46e44bc3ccf9eb4b` | Canonical shared physical/DOM portal-surface inventory; pending human creative review |
| `artifacts/original/phase-0-3d-repair-v3/manifests/review-bundle-manifest.json` | 4,437 | `8a73fc5eae08a405f8a96cc2d93dc3fd30b888d77da2fa5d4feec377260fe3fe` | Canonical exact 13-sheet review bundle; pending human creative review |
| `artifacts/original/phase-0-3d-repair-v3/manifests/review-composition-manifest.json` | 6,667 | `d82140ebcb3615f7891623e885c11e1befb4af6eebff76dfc585b886540b2ca0` | Canonical eight-sheet static composition lineage; review-only |
| `artifacts/original/phase-0-3d-repair-v3/manifests/review-originals-manifest.json` | 30,306 | `1783a3e2218bf93150807b10ca27db9edd217520832880f076b1d04d89cb493b` | Canonical 12-compositor-output inventory; review-only |
| `artifacts/original/phase-0-3d-repair-v3/manifests/scene-source-keepouts.json` | 44,663 | `3ac16456b5a4a9e5a57755206f135684eca12fcfb7b1aafe30fb3cf86e862b8a` | Canonical camera, scene-safety and spiral-visibility authority; PASS; review-only |
| `artifacts/original/phase-0-3d-repair-v3/manifests/silhouette-decision-manifest.json` | 8,521 | `dfdc9eae1a13da3bb3af78f95c6cdcfb987f1c1bc0192ec3a2c2f65ddb845a80` | Canonical accepted-for-refinement silhouette decision evidence; creative gate still pending |
| `artifacts/original/phase-0-3d-repair-v3/manifests/silhouette-iteration-1-decision-manifest.json` | 6,911 | `b0cefba5f79daaaf73c30870e2341361029e9681364069f5ddfa13ab404606f2` | Superseded iteration-1 silhouette decision evidence; review-only |

### Phase 0.3 authoring, geometry and integrity notes

The package-wide inventory governs the 15 deterministic Python sources (193,394 bytes), `README.md` (4,472 bytes; SHA-256 `dc1026d1fa2c5243fa07fc08d6ac0e2ba36170f1e17b3a5cc6b2f5d914ed49cc`) and `portal-layout.json` (6,675 bytes; SHA-256 `25666cf071afe7564dc051cbec770ead325cdf19ef1f4926e43d793a2a053bc5`). These are reproducibility and review records, not launch assets or runtime dependencies.

The final geometry authorities agree on a five-checkpoint 28-degree camera arc. Desktop uses an authored approximately 2.5-turn spiral. The independent portrait composition uses one physical 2.25-turn cable and exposes approximately 2.171694 turns (781.810 degrees), exceeding the registered 2.15-turn visibility threshold. The conductor terminates below the foundation without a visible plug or disconnected cap.

The largest package file is the 5,538,004-byte superseded iteration-1 silhouette sheet; no package member approaches the 100 MiB GitHub per-file boundary. The package has no Git LFS pointer or LFS dependency.

### Phase 0.3 browser evidence lineage

The non-production evidence tree at `artifacts/evidence/phase-0-3d-repair-v3/` contains 241 files and 25,595,166 bytes. It is Class R implementation and accessibility evidence, not launch media. The canonical matrix governs 46 passing cases and 36 raw/normalized capture lineages. Recovery and targeted records preserve the bounded reconciliation history; they are explicitly non-authoritative and must not be substituted for the canonical captures.

| Evidence authority or governed set | Records | Bytes | SHA-256 or authority | Classification and approval |
| --- | ---: | ---: | --- | --- |
| `artifacts/evidence/phase-0-3d-repair-v3/browser-matrix-report.json` | 46 cases; 36 capture lineages | 1,785,125 | `8272764a01ac18b4aed7b8b0ebffdca812a5f235e51d6c2c2ea6ae744c6ac4fc` | Canonical layout, collision, focus, reduced-motion, scene-safety and capture-lineage evidence; PASS; review-only |
| `artifacts/evidence/phase-0-3d-repair-v3/captures/` | 72: 36 raw JPEG + 36 normalized PNG | 12,837,839 | Member hashes and dimensions in `browser-matrix-report.json` | Canonical original browser captures; review-only |
| `artifacts/evidence/phase-0-3d-repair-v3/reports/` | 46 JSON | 1,680,887 | Case authorities consolidated by `browser-matrix-report.json` | Canonical machine-readable browser reports; review-only |
| `artifacts/evidence/phase-0-3d-repair-v3/capture-checkpoint.json` | 1 | 43,112 | `2e29544c25477fc05a81ce2ef87a3baaa5030fbfbb6ac2b8b235c81654f6f090` | Canonical capture-state checkpoint; review-only |
| `artifacts/evidence/phase-0-3d-repair-v3/TYPOGRAPHY_COLLISION_QA.md` | 1 | 13,279 | `852394748d895117ebc622df6da6b819ffdfb8b1c5c6ba081532c74327d3027b` | Human-readable final visual-audit record; review-only |
| `artifacts/evidence/phase-0-3d-repair-v3/README.md` | 1 | 5,233 | `6f285e4eac59cff7815c5e3ca5289ab17a6f580a728e65246180527502639ac7` | Evidence-scope, authority and recovery-lineage guide; review-only |
| `artifacts/evidence/phase-0-3d-repair-v3/recovery/` | 106 | 8,465,353 | Directory inventory at candidate commit | Retained stale-state reconciliation evidence; non-authoritative; review-only |
| `artifacts/evidence/phase-0-3d-repair-v3/targeted/` | 13 | 764,338 | Directory inventory at candidate commit | Bounded pre-seal repair evidence; non-authoritative; review-only |

The final 36 normalized captures were inspected at full size. Actual, keyboard-focus, long-copy, reduced-motion and 200% text-zoom states preserve whole words, visible focus only where requested, zero horizontal overflow and zero measured semantic-copy/Aperture Station/cable intersections. Desktop retains a quiet left copy field with the Aperture Station lower-right; the independently authored mobile composition keeps the station and spiral legible without cropping the desktop scene.

## Original Quantum Phase 0.4 CRT television package

The additive package at `artifacts/original/phase-0-4-crt-television/` is **original Quantum creative evidence** with approval state **pending human creative review**. It preserves the Phase 0 through Phase 0.3 packages unchanged. Every record is Class R and remains excluded from launch use unless the `CRT TELEVISION ART DIRECTION`, `CRT POWER-ON + SCREEN PORTAL`, and `TYPOGRAPHY + RESPONSIVE SAFETY` human gates are accepted.

This Phase 0.4 subsection is the frozen accepted-package snapshot at commit `fec1f0e9243a9cda188c539ab1b79e4a99c30623`. A path prefixed `accepted Phase 0.4 snapshot:` records the accepted historical blob at that path rather than claiming the current Phase 0.4R working-tree byte. The additive Phase 0.4R section below is authoritative for current repaired bytes.

The package contains 119 files and 160,409,837 bytes. Its 82 binary records comprise 79 sanitized PNGs, two editable Blender sources and one compact review ZIP, totalling 158,547,998 bytes. The PNG set contains 63 source/canonical still renders and the exact 16-sheet review set. The other 37 records comprise 16 JSON authorities or contracts, 20 deterministic Python sources and one work-directory exclusion control, totalling 1,861,839 bytes. No video, audio, full animatic, numbered frame sequence, `.blend1`, cache, executable, font binary, external model, image texture, add-on, reference binary or third-party capture is present.

`manifests/package-inventory.json` is the package-wide authority. It self-excludes its own hash and binds the other 118 intended files and 160,349,367 bytes; adding the 60,470-byte inventory itself gives the complete 119-file total above. Every inventory record includes its repository-relative and package-relative path, byte count, SHA-256, classification, approval state and `intendedCommit: true`.

The user-supplied CRT television photograph informed broad era and proportion only. It remains intentionally uncommitted, is not embedded or packed, was never loaded as a Blender image or texture, and is represented in committed records only by that opaque classification. The final Blender validation reports zero external libraries, images, paths, packed files, missing files, image-texture nodes and third-party models.

### Phase 0.4 binary register

| Asset ID | Committed path or governed set | Records | Bytes | Integrity authority | Class | Approval and publication state |
| --- | --- | ---: | ---: | --- | --- | --- |
| `Q0-CRT04-SOURCE-001` | `artifacts/original/phase-0-4-crt-television/source/quantum-signal-television-proportion-options.blend` | 1 | 745,661 | SHA-256 `18bc895f5d94a30186c50e989e99d6a94bdcbd939909ef9a87026f1a1d3d5087`; `crt-proportion-source-validation.json` | R | Original editable proportion-gate source; selected Variant A decision provenance; not a launch asset |
| `Q0-CRT04-SOURCE-002` | `accepted Phase 0.4 snapshot: artifacts/original/phase-0-4-crt-television/source/quantum-signal-television-v1.blend` | 1 | 1,049,052 | SHA-256 `9980c054e0db0b04fb238aced3bf149589dffb555a1f018ba58b521c1ad89a5d`; `blender-source-validation.json` | R | Original accepted Phase 0.4 editable Blender source snapshot; validator PASS 29/29; superseded in place by the governed Phase 0.4R repair; not a launch asset |
| `Q0-CRT04-RENDER-001` | `artifacts/original/phase-0-4-crt-television/renders/` | 63 PNG | 69,762,801 | `crt-proportion-render-manifest.json`; `crt-canonical-render-manifest.json`; `png-metadata-sanitization.json` | R | Original still-only Blender evidence; pending human creative review; not launch media |
| `Q0-CRT04-REVIEW-001` | `artifacts/original/phase-0-4-crt-television/` exact top-level PNG set | 16 PNG | 43,686,887 | `review-bundle-manifest.json`; `crt-review-composition-manifest.json`; `browser-review-composition-manifest.json`; `png-metadata-sanitization.json` | R | Exact final human-review package; pending human creative review; not a public-launch surface |
| `Q0-CRT04-REVIEW-002` | `artifacts/original/phase-0-4-crt-television/phase-0-4-crt-television-review.zip` | 17 top-level members: 16 PNG + 1 Markdown | 43,303,597 | SHA-256 `8eeec33182ad476d5dd78d5635a5dcb2cdfbeb96c97092462bd1af6227f642c7`; strict ZIP and README validation | R | Compact exact review copy; pending human creative review; not launch media |
| `Q0-CRT04-MEDIA-001` | Package video, audio and full-animatic set | 0 | 0 | `blender-source-validation.json`; dedicated Phase 0.4 asset verifier | R | Intentionally still-only; no cinematic encode or full animatic was created |

The exact 16-sheet review set is: `crt-television-proportion-options.png`, `crt-television-recommended-design-sheet.png`, `crt-cabinet-material-sheet.png`, `crt-screen-glass-and-phosphor-sheet.png`, `crt-controls-speaker-rear-detail-sheet.png`, `crt-cable-and-connection-sheet.png`, `crt-proving-ground-style-frame.png`, `crt-camera-path-study.png`, `crt-power-on-contact-sheet.png`, `crt-portal-transition-sheet.png`, `crt-physical-dom-alignment-sheet.png`, `crt-desktop-hero-composition.png`, `crt-mobile-hero-composition.png`, `crt-text-zoom-and-fallback.png`, `crt-reduced-motion-desktop.png`, and `crt-reduced-motion-mobile.png`.

### Phase 0.4 manifest register

These 15 machine-readable authorities total 1,601,780 bytes. `package-inventory.json`, the final source and material validation, canonical render inventory, exact power and portal state authorities, browser/static composition lineage, PNG sanitation and review-bundle manifest govern the settled package.

| Manifest or report | Bytes | SHA-256 | Classification and approval |
| --- | ---: | --- | --- |
| `accepted Phase 0.4 snapshot: artifacts/original/phase-0-4-crt-television/manifests/blender-source-validation.json` | 12,051 | `e77fd738cba7bd7dbe5a8e9b7a1ee1ea507e7dbe4d55060f7f0f8ce3a5ff38ce` | Original Blender integrity snapshot; PASS 29/29; superseded by Phase 0.4R validation |
| `artifacts/original/phase-0-4-crt-television/manifests/browser-review-composition-manifest.json` | 16,341 | `00a51a6c9e5708ecbc64955687946cbc7400886bc001d56f73b4900f8741bcc9` | Canonical seven-sheet browser composition lineage; review-only |
| `accepted Phase 0.4 snapshot: artifacts/original/phase-0-4-crt-television/manifests/crt-canonical-render-manifest.json` | 103,931 | `35022c438e3a64e1a6d86b8e7232533c161f1f7cbe47f7499573999e7ca77ff9` | Accepted exact 45-still refined-render inventory snapshot; superseded in place by Phase 0.4R |
| `accepted Phase 0.4 snapshot: artifacts/original/phase-0-4-crt-television/manifests/crt-material-and-asset-manifest.json` | 47,991 | `8c24c24423c99b891f06e1f3398ac9f049883b3215c2f06fbb14961ebba3a9de` | Accepted 20-material procedural-only snapshot; PASS with zero external assets; superseded in place by Phase 0.4R |
| `artifacts/original/phase-0-4-crt-television/manifests/crt-portal-transition-state-authority.json` | 18,552 | `629a2b65c29e0e176c3f5952a7b519678142dfed5acbafedb4460ccb3fa666b7` | Canonical exact eight-state physical-to-DOM authority; PASS; pending human creative review |
| `artifacts/original/phase-0-4-crt-television/manifests/crt-power-on-state-authority.json` | 13,176 | `735a891cc1d5b14a67f2f920302de541230a1a7e3e12437553444c4eae1ac8ce` | Canonical exact seven-state power authority; FROZEN; pending human creative review |
| `artifacts/original/phase-0-4-crt-television/manifests/crt-proportion-decision-manifest.json` | 10,284 | `783984b2ef0658a74c381750966acf3d513bf5d5e4cce598375b1fa4a2084dc7` | Frozen proportion-gate decision snapshot; Variant A selected for refinement; review-only |
| `artifacts/original/phase-0-4-crt-television/manifests/crt-proportion-render-manifest.json` | 9,931 | `92a909912cfbee9ce5f0fc175855d939c52bc73422b28f7264960b243e7224bc` | Canonical 18-render A/B/C proportion inventory; review-only |
| `artifacts/original/phase-0-4-crt-television/manifests/crt-proportion-source-validation.json` | 7,139 | `c1eea6ef88b3d6a0d322ab437a4c2ed8e35de3b39df4af4d7bdb0e3b24c986d7` | Proportion-source integrity and private-reference isolation evidence; PASS; review-only |
| `accepted Phase 0.4 snapshot: artifacts/original/phase-0-4-crt-television/manifests/crt-refined-source-build.json` | 2,781 | `2b7bd6fc3e0f0897132fd057e856a24cbf8c4ac17373573169540e387cef5748` | Accepted deterministic refined-source build lineage snapshot; superseded in place by Phase 0.4R |
| `artifacts/original/phase-0-4-crt-television/manifests/crt-review-composition-manifest.json` | 14,440 | `32b5ef685cc322f89ee8f36e525bcc85b1f319d65d3cd469c8e6265f1fe37ca9` | Canonical sheets 2–9 static composition lineage; review-only |
| `accepted Phase 0.4 snapshot: artifacts/original/phase-0-4-crt-television/manifests/crt-scene-source-keepouts.json` | 1,225,841 | `c2d371d4eb3d3bfafe82ad67728c2df48ef7e38b09b2d1306d5accd2c955ac3d` | Accepted six-source CRT, screen and cable geometry/scene-safety snapshot; PASS; superseded in place by Phase 0.4R |
| `accepted Phase 0.4 snapshot: artifacts/original/phase-0-4-crt-television/manifests/package-inventory.json` | 60,470 | `ee6564cb3a72c13b5385e9f2e66a5d59461b30c7981bfe81a7a857e5707103ef` | Accepted package-wide 118-record self-excluded inventory snapshot; superseded in place by Phase 0.4R |
| `accepted Phase 0.4 snapshot: artifacts/original/phase-0-4-crt-television/manifests/png-metadata-sanitization.json` | 51,196 | `5ad92428b8216b32d4786e7014812586c904062d04a5c5f56b769463ab255ef7` | Accepted 79-PNG sanitation and decoded-pixel-preservation snapshot; PASS; superseded in place by Phase 0.4R |
| `accepted Phase 0.4 snapshot: artifacts/original/phase-0-4-crt-television/manifests/review-bundle-manifest.json` | 7,656 | `0cb59ecbe15c6adf423ccaa7794c37e8c19b20cf37f86c25e279568b2d6f7993` | Accepted exact 16-sheet review-bundle snapshot; superseded in place by Phase 0.4R |

### Phase 0.4 authoring, geometry and integrity notes

The package inventory governs 20 deterministic Python sources (243,797 bytes), `crt-portal-layout.json` (16,248 bytes; SHA-256 `255c5b1499857ab8a2409adf368543efa0d6f9bfe3171e8a0a0a680e2caf31cc`) and `work/.gitignore` (14 bytes). These are reproducibility and review controls, not launch assets or runtime dependencies.

The final geometry authorities agree on a 27.782636-degree arrival-to-power camera arc; the close portal checkpoint is 28.110717 degrees from arrival. Desktop uses one physical 2.5-turn spiral and mobile uses a separately authored physical 2.25-turn spiral. The refined CRT assembly measures 0.841 × 0.6975 × 0.7685 metres and retains a 4:3 visible tube. The review evidence proves convex smoked glass and gasket/bezel depth, a recessed conductor below both graphite shoulders, physical rear strain relief, exact seven-state power causality, and an exact eight-state physical-to-semantic portal handoff.

The largest package member is the 43,303,597-byte review ZIP; no package member approaches the 100 MiB GitHub per-file boundary. The package has no Git LFS pointer, attribute or dependency.

### Phase 0.4 browser and repository evidence lineage

The non-production evidence tree at `artifacts/evidence/phase-0-4-crt-television/` is Class R implementation, accessibility and provenance evidence, not launch media. Its final file and byte totals include the self-describing repository-impact report below. The canonical browser matrix governs 46 passing cases and 36 raw/normalized capture lineages. Recovery records preserve failed or superseded capture attempts as explicitly historical, non-promotable evidence and cannot replace the canonical captures.

| Evidence authority or governed set | Records | Bytes | SHA-256 or authority | Classification and approval |
| --- | ---: | ---: | --- | --- |
| `artifacts/evidence/phase-0-4-crt-television/browser-matrix-report.json` | 46 cases; 36 capture lineages | 1,149,989 | `5411220869170f0290423d2f235aba2dc659aa1820e6eb2a3680bbe179d073d7` | Canonical responsive, collision, focus, reduced-motion, scene-safety and capture-lineage evidence; PASS; review-only |
| `artifacts/evidence/phase-0-4-crt-television/browser-evidence-manifest.json` | 7 review outputs; exact 7 power and 8 portal states | 30,259 | `0ad595af087867134b7199f1d92855209a7dfd18205bef45efb2e64675c04a58` | Final browser-to-creative lineage authority; PASS; review-only |
| `artifacts/evidence/phase-0-4-crt-television/capture-plan-authority.json` | 46 planned cases | 24,767 | `db2e7feddceba5ca80be22d5f8d0c97bf5ff11810a92de57478db816c6e68f0d` | Preserved capture-ready plan snapshot; review-only |
| `artifacts/evidence/phase-0-4-crt-television/captures/` | 72: 36 raw JPEG + 36 normalized PNG | 12,946,123 | Member hashes and dimensions in `browser-matrix-report.json` | Canonical original browser captures; review-only |
| `artifacts/evidence/phase-0-4-crt-television/reports/` | 46 JSON | 1,092,311 | Case authorities consolidated by `browser-matrix-report.json` | Canonical machine-readable browser reports; review-only |
| `artifacts/evidence/phase-0-4-crt-television/capture-checkpoint.json` | 1 | 41,841 | `30dae639b65cf56f0699ebe2ba3c3a7dba427d1a2e5d6872b27b9de15713c591` | Final resumable-capture checkpoint; review-only |
| `artifacts/evidence/phase-0-4-crt-television/recovery/` | 135 | 6,611,623 | Per-directory recovery manifests and preserved-member SHA-256 records | Historical failed/superseded capture evidence; non-authoritative; review-only |
| `artifacts/evidence/phase-0-4-crt-television/TYPOGRAPHY_COLLISION_QA.md` | 1 | 13,984 | `f8f673ff305f7471d067e2e018d931eefaa32fb9c22b6ad530d722ef44b2f8cf` | Human-readable final visual and browser audit; PASS; review-only |
| `artifacts/evidence/phase-0-4-crt-television/README.md` | 1 | 8,026 | `a6f04ccf9b98651c4f4430e0d189311e4a8dc6e6e3d3e990006e4f1360a69abf` | Evidence-scope, authority and recovery-lineage guide; review-only |
| `artifacts/evidence/phase-0-4-crt-television/repository-impact-report.json` | 1 | 4,898 | `12e4750aa3925ddc0f2807145f80a4ae0bce9f010855501e354b6ac8ce2f7fc6` | Projected candidate-tree, repository-size, privacy and delivery-state evidence; review-only |

The final 36 normalized captures were independently inspected at full target size. Actual, keyboard-focus, long-copy, reduced-motion and 200% text-zoom states preserve whole words, intentional focus visibility, zero horizontal overflow and zero measured semantic-copy/CRT/cable intersections. Desktop retains a quiet left copy field with the CRT at the right; mobile uses its separately authored 2.25-turn physical cable rather than a desktop crop. Reduced motion instantiates no cinematic media and keeps the television powered off with the cable dormant.

## Original Quantum Phase 0.4R CRT quality repair

Phase 0.4R is an additive, in-place quality repair of the accepted Phase 0.4 CRT family. It preserves the historical proportion sheet, historical review ZIP, accepted Phase 0.4 browser evidence and every Phase 0 through Phase 0.3 package byte. The repaired records remain **Class R original Quantum creative evidence**, **pending direct human creative acceptance**, and are not launch assets. The required human gates remain `CRT TELEVISION ART DIRECTION`, `CRT POWER-ON + SCREEN PORTAL`, and `TYPOGRAPHY + RESPONSIVE SAFETY`.

The complete current creative package contains 145 intended files and 160,550,295 bytes. `manifests/package-inventory.json` self-excludes and binds the other 144 intended files and 160,474,380 bytes; adding the 75,915-byte inventory gives the complete total. The exact Phase 0.4R repair roster contains 17 governed deliverables and 39,122,383 bytes: 15 repaired review PNGs, one new model-quality closeup PNG, and one 6-second VP9 turntable. The unchanged `crt-television-proportion-options.png` remains historical proportion-gate evidence and is not counted again as a repair deliverable.

The private user CRT photograph remains uncommitted and unembedded. The final editable source and validator report zero external libraries, images, packed files, file paths, image-texture nodes, third-party models and private-photo loading. No private absolute path, raw eleven-shot candidate set, retained frame sequence, EXR, `.blend1`, cache, audio stream, external model, LFS pointer or LFS configuration is present in the candidate.

### Phase 0.4R governed asset register

| Asset ID | Committed path or governed set | Records | Bytes | Integrity authority | Class | Approval and publication state |
| --- | --- | ---: | ---: | --- | --- | --- |
| `Q0-CRT04R-SOURCE-001` | `artifacts/original/phase-0-4-crt-television/source/quantum-signal-television-v1.blend` | 1 | 1,516,222 | SHA-256 `3027c4c46e2b829fd97ee9a3a47558e43adda47abcc488420faa0f087bd720a7`; `blender-source-validation.json` PASS 49/49 | R | Original editable repaired CRT source; pending human creative acceptance; not a launch asset |
| `Q0-CRT04R-CYCLES-001` | `artifacts/original/phase-0-4-crt-television/renders/repair-masters/` | 8 PNG | 8,345,187 | `crt-phase-0-4r-cycles-master-render-manifest.json`; exact one-source/one-renderer Cycles lineage | R | Original Cycles quality masters; review-only; not launch media |
| `Q0-CRT04R-CANONICAL-001` | Exact Phase 0.4R canonical refined still roster | 45 PNG | 54,392,013 | `crt-phase-0-4r-canonical-render-inventory.json`; ordered exact roster and state/source lineage | R | Original supplemental Eevee layout/state evidence; review-only; not launch media |
| `Q0-CRT04R-REVIEW-001` | Exact Phase 0.4R repaired top-level deliverable roster | 16 PNG | 38,735,493 | `crt-phase-0-4r-repair-manifest.json`; `review-bundle-manifest.json`; static and browser composition authorities | R | Fifteen repaired sheets plus one model-quality closeup sheet; pending human creative acceptance |
| `Q0-CRT04R-MEDIA-001` | `artifacts/original/phase-0-4-crt-television/crt-model-turntable.webm` | 1 VP9 WebM | 386,890 | SHA-256 `20aa30adb49bf1df7b09278a5fb15dba56409a4256771685ac431a93fc329ee6`; `crt-model-turntable-manifest.json`; local `ffprobe` and decoded-motion proof | R | Original 960×600, 24 fps, 6.000 s, no-audio model turntable; review-only; not launch media |
| `Q0-CRT04R-EXTERNAL-001` | artifacts/original/phase-0-4-crt-television/work/phase-0-4r-crt-quality-review.zip | 17 flat members | 38,798,059 | SHA-256 `a7f1b14f4bb8b05acddee6714b5dd1b28ed1ea0b5f72995a10fd9a821dac93d51`; every member matches the repair manifest | R | Required compact local review output; intentionally ignored and uncommitted; does not duplicate the historical tracked ZIP |

The exact governed repair roster is: `crt-television-recommended-design-sheet.png`, `crt-cabinet-material-sheet.png`, `crt-screen-glass-and-phosphor-sheet.png`, `crt-controls-speaker-rear-detail-sheet.png`, `crt-cable-and-connection-sheet.png`, `crt-proving-ground-style-frame.png`, `crt-camera-path-study.png`, `crt-power-on-contact-sheet.png`, `crt-portal-transition-sheet.png`, `crt-physical-dom-alignment-sheet.png`, `crt-desktop-hero-composition.png`, `crt-mobile-hero-composition.png`, `crt-text-zoom-and-fallback.png`, `crt-reduced-motion-desktop.png`, `crt-reduced-motion-mobile.png`, `crt-model-quality-closeups.png`, and `crt-model-turntable.webm`.

### Phase 0.4R authority register

| Manifest or report | Bytes | SHA-256 | Classification and approval |
| --- | ---: | --- | --- |
| `artifacts/original/phase-0-4-crt-television/manifests/blender-source-validation.json` | 28,963 | `8162fa6b312b51800b320c65798aca1082ee1b8c9335cc806c48529e9f4cadea` | Repaired Blender integrity, geometry, evaluated material and external-dependency evidence; PASS 49/49 |
| `artifacts/original/phase-0-4-crt-television/manifests/crt-material-and-asset-manifest.json` | 44,949 | `8d931e05f0fd0fbc76cd6a7f7dee846f1ddbf34fb15f3b58e6462afb436cfbd1` | Procedural material/asset authority; zero external textures or models |
| `artifacts/original/phase-0-4-crt-television/manifests/crt-phase-0-4r-cycles-master-render-manifest.json` | 35,304 | `e3d225fd44feff1adfeb6e43a30cea9c9ee563d735556549cc475df4ed4f50c9` | Exact eight-master Cycles settings and render lineage; PASS |
| `artifacts/original/phase-0-4-crt-television/manifests/crt-phase-0-4r-canonical-render-inventory.json` | 140,281 | `266075ca1f1b131c477690118a4d7337f9a0666d9b44fb476feb6f85d8d19a8a` | Exact 45-still canonical roster, six source rasters and semantic state map; PASS |
| `artifacts/original/phase-0-4-crt-television/manifests/crt-phase-0-4r-power-on-state-authority.json` | 39,520 | `9b2f1c5ea3c7b777025d4350fc7742bb173f1a285db11b952945f5e33bda4835` | Exact seven-state causal startup sequence; PASS |
| `artifacts/original/phase-0-4-crt-television/manifests/crt-phase-0-4r-portal-transition-state-authority.json` | 56,690 | `3d3df7884f78cd9ee573a82f5961013d038c390324fb4b95efd109f3ccf236cb` | Exact six physical plus two browser-owned portal states; PASS 8/8 |
| `artifacts/original/phase-0-4-crt-television/manifests/crt-scene-source-keepouts.json` | 1,157,579 | `4dcf0d9b6e7e583682b8d148178634fabb54b331f02ab31e7d7e9358ff6cd26c` | Six-role source/cabinet/screen/cable keepout authority; frozen/PASS |
| `artifacts/original/phase-0-4-crt-television/manifests/crt-phase-0-4r-review-composition-manifest.json` | 17,846 | `d454ebc04f0bfd6c6cd2a6cc6efa0d454b6e1417026fc32284c919324143b609` | Truthful mixed Cycles/Eevee source lineage for sheets 2–9 and closeups |
| `artifacts/original/phase-0-4-crt-television/manifests/phase-0-4r-browser-review-composition-manifest.json` | 17,615 | `82a338594cac6f56e1c36dafaddd929d54b9c7b91c1710bae538a3770cddeca4` | Exact native-pixel sheets 10–16 composition lineage; PASS 7/7 |
| `artifacts/original/phase-0-4-crt-television/manifests/crt-model-turntable-manifest.json` | 4,371 | `f9b727262a7caed701a6e753ae79e0ec044f14e2093a7a76e737c2741d4d784a` | VP9/no-audio stream, 110-degree orbit and decoded sample-motion proof; PASS |
| `artifacts/original/phase-0-4-crt-television/manifests/crt-phase-0-4r-repair-manifest.json` | 60,420 | `f694107b2eda05a1a8fb81a83412bb63bc6f2140eea784cccb5ca5874b0a9b9a` | Exact 17-deliverable repair roster and external review-ZIP authority; PASS |
| `artifacts/original/phase-0-4-crt-television/manifests/png-metadata-sanitization.json` | 72,099 | `8fa66734a17484a5a8051c313754141433ceb7a61de7def5cb505ab1d315d821` | 111-record sanitation ledger: 88 intended PNGs plus 23 explicitly ignored work diagnostics; native decoded pixels and privacy markers independently verified |
| `artifacts/original/phase-0-4-crt-television/manifests/review-bundle-manifest.json` | 12,514 | `fc4f29bb5306454037831121ce78c7e773fd3bf145efe8be0ebd2386f4953138` | Exact 17-deliverable human-review bundle; PASS |
| `artifacts/original/phase-0-4-crt-television/manifests/package-inventory.json` | 75,915 | `a0d654ddfe8638b666284a9c4881a2391977a88888b2705c5248b8c437fb0f33` | Exact 144-record self-excluded intended package inventory; PASS |

### Phase 0.4R browser, size and repository evidence

The additive browser tree preserves the accepted Phase 0.4 matrix. Its new matrix contains 46/46 passing case reports, 36 exact modal raw winners and 36 normalized PNG captures. All 36 normalized captures and all 16 final review PNGs were independently opened at full governed size. Copy/CRT/cable separation, 320px and 200% reflow, focus-only ring hygiene, reduced motion, portal continuity and fallback states pass. The short 1366×650 arrival viewport naturally scrolls to the complete CTA row; it has no collision, horizontal overflow or hidden content.

| Evidence authority or governed set | Records | Bytes | SHA-256 or authority | Classification and approval |
| --- | ---: | ---: | --- | --- |
| `artifacts/evidence/phase-0-4r-crt-television/browser-matrix-report.json` | 46 cases; 36 normalized capture lineages | 1,159,197 | `82ae5672fba028f813bc98754038e0deb9ab2b022bb199e3e2dcb1a8b272b00d` | Additive responsive, collision, focus, reduced-motion and scene-safety evidence; PASS; review-only |
| `artifacts/evidence/phase-0-4r-crt-television/browser-evidence-manifest.json` | Six frozen sources; seven power states; eight portal states | 15,829 | `741b1e351a367324a4ad5f1a4f372df591d7f6c79a1518a225404264533fd724` | Final browser/creative acyclic lineage authority; PASS; review-only |
| `artifacts/evidence/phase-0-4r-crt-television/capture-plan-authority.json` | 46 planned cases | 43,077 | `dfd21e2e70fddd02285c8f00979d8cb95aacca43462ef079fff063aafa0d3f08` | Immutable ready-for-capture snapshot; review-only |
| `artifacts/evidence/phase-0-4r-crt-television/capture-checkpoint.json` | 46 completed cases | 43,161 | `39f49f65347beca0c7e203df6a08e243a8455e9d77e899973ea14602a4c4d598` | Normalized resumable-capture checkpoint; PASS; review-only |
| `artifacts/evidence/phase-0-4r-crt-television/captures/raw/` | 36 JPEG modal winners | 3,074,136 | Member hashes, dimensions and 11-shot modal votes in the matrix | Exact winning browser captures only; no eleven-shot candidate batches committed |
| `artifacts/evidence/phase-0-4r-crt-television/captures/normalized/` | 36 PNG | 9,428,084 | Member hashes and target dimensions in the matrix | Canonical normalized visual evidence; review-only |
| `artifacts/evidence/phase-0-4r-crt-television/reports/` | 46 JSON | 1,109,230 | Exact case/query/viewport/focus/source lineage bound by the matrix | Canonical machine-readable case evidence; review-only |
| `artifacts/evidence/phase-0-4r-crt-television/README.md` | 1 | 8,356 | SHA-256 `b2343d4693ceaf074c90cf0ffb4a61c2af799c27db147d3229015f1c27f17f82` | Evidence topology, final PASS status, immutable legacy-verifier authority, review boundary and repository-size policy; review-only |
| `artifacts/evidence/phase-0-4r-crt-television/repository-impact-report.json` | 1 | 5,714 | SHA-256 `37cc755063265970d311b7919395e5cc52bbd93dfde6531d866cd9c7ed72073d` | Exact accepted-parent, projected candidate, true-new, privacy and repository-boundary evidence; PASS; review-only |

The accepted parent contains 1,097 files and 520,536,106 blob bytes. The final projected-candidate totals, strict net-tree growth and exact true-new object disclosure are governed by `repository-impact-report.json`. Strict net-tree growth remains below 80,000,000 bytes. True-new bytes exceed that preference because the exact governed Cycles masters, canonical/browser evidence, repaired sheets, source and turntable must remain auditable; the structured exception explicitly forbids deleting required evidence to game the metric. The largest committed candidate file remains the unchanged 43,303,597-byte historical Phase 0.4 review ZIP, below the 100 MiB GitHub file boundary. Git LFS is neither configured nor required.

## Original Phase 0 implementation evidence

The raster dimensions below are the browser-capture dimensions; viewport targets remain encoded in filenames and are separately documented in `artifacts/evidence/phase-0/BROWSER_QA.md`.

| Evidence ID | Committed path | Dimensions/type | Bytes | SHA-256 | Class |
| --- | --- | ---: | ---: | --- | --- |
| `Q0-EVIDENCE-001` | `artifacts/evidence/phase-0/baseline-1440x900.png` | 1425×891 PNG | 55,789 | `90af0e296265e974fdb93a3fad73cd5afef21e9235581ea70fb3461405ee76eb` | R |
| `Q0-EVIDENCE-002` | `artifacts/evidence/phase-0/harness-dormant-1440x900.png` | 1425×891 PNG | 74,075 | `1250d64839f37c590d7d08a5546e27f6ccbb8ca1f5d2c4a0717b3c947e718859` | R |
| `Q0-EVIDENCE-003` | `artifacts/evidence/phase-0/harness-mid-conduction-1440x900.png` | 1425×891 PNG | 52,839 | `43a95bad26e2aa23db950907f69f8440e16139a59a32cec2de0016a9d39cf7dd` | R |
| `Q0-EVIDENCE-004` | `artifacts/evidence/phase-0/harness-activation-1440x900.png` | 1425×891 PNG | 59,659 | `610854bbe1ce849cc735811d3f39cae8f6ef62b6cf819b4a4ff927da06597af5` | R |
| `Q0-EVIDENCE-005` | `artifacts/evidence/phase-0/harness-portal-1440x900.png` | 1425×891 PNG | 46,697 | `036668420442e81ed704395b19a421a7e7f6d015f79ebfdb7a2c283a5763e088` | R |
| `Q0-EVIDENCE-006` | `artifacts/evidence/phase-0/harness-operating-surface-1440x900.png` | 1425×891 PNG | 18,992 | `b8490f86175a2d0178ae0f2e99699e3f3369813e88286a0f5ced37cee798913a` | R |
| `Q0-EVIDENCE-007` | `artifacts/evidence/phase-0/harness-mobile-dormant-390x844.png` | 375×812 PNG | 35,941 | `558f1e86deb65dcc372c0a19d0ecd2ef3279cbb305a7010a68949ad0e92d05c5` | R |
| `Q0-EVIDENCE-008` | `artifacts/evidence/phase-0/harness-mobile-mid-390x844.png` | 375×812 PNG | 20,027 | `6e5b21ba2a7e5d79013d1f5c343766e1571914ea8b083531b8a52625a68377c8` | R |
| `Q0-EVIDENCE-009` | `artifacts/evidence/phase-0/harness-mobile-portal-360x800.png` | 345×767 PNG | 15,108 | `2bb4c61d767e4ad63e1e74999840533ecff068cb5477e4d6d48c31945724965e` | R |
| `Q0-EVIDENCE-010` | `artifacts/evidence/phase-0/harness-reduced-desktop-1600x1000.png` | 1585×991 PNG | 86,453 | `f372adfc7dea8bdcf037165890ba0d39d5a0d7be14923329e9fcb5c76f507d29` | R |
| `Q0-EVIDENCE-011` | `artifacts/evidence/phase-0/harness-reduced-mobile-720x1600.png` | 705×1163 PNG | 53,683 | `d1b3382d20798b5741232b23a03d9853039c6038c8f1dc72a86da160d898d1c6` | R |
| `Q0-EVIDENCE-012` | `artifacts/evidence/phase-0/keyboard-focus-1440x900.png` | 1425×891 PNG | 71,902 | `76904cb0e900f8ac118b675475bb1d145b6b0496f84a88b25ee7ac8a8c768327` | R |
| `Q0-EVIDENCE-013` | `artifacts/evidence/phase-0/static-root-1440x900.png` | 1425×891 PNG | 55,281 | `f208371b3c796aa465ba13dea43ca1a6bd603d36da77eeba5c826efa5aa1c9c6` | R |
| `Q0-EVIDENCE-014` | `artifacts/evidence/phase-0/static-root-focus-1440x900.png` | 1425×891 PNG | 56,996 | `5d371aed0859fd72584d38bd4d3490f711fb2cb5bfa8e9d0b286015937cce369` | R |
| `Q0-EVIDENCE-015` | `artifacts/evidence/phase-0/static-root-390x844.png` | 375×812 PNG | 31,089 | `463d6f3b48a3a70c17270b2c26154157a4ad7d113c94840b187542341947cf3b` | R |
| `Q0-EVIDENCE-016` | `artifacts/evidence/phase-0/encoded-seek-spike-vp9.webm` | 640×400, 2.967s VP9 WebM | 123,712 | `a8a7681ee22af7cdbd9ac2661c8a19469bab8fa03627b8368b36d022205878c2` | R |
| `Q0-EVIDENCE-017` | `artifacts/evidence/phase-0/encoded-seek-spike-report.json` | JSON | 2,283 | `220f43ac9d27bb6c7a4b808048345f218cdb7105e9275b34e08187c47974b942` | R |
| `Q0-EVIDENCE-018` | `artifacts/evidence/phase-0/encoded-seek-spike-browser.png` | 1185×889 PNG | 50,956 | `7c5510f261a686eebab44995e3962fd2986cef53eeb32b19642381c565e7051d` | R |

The Markdown browser/toolchain audit records are committed evidence ledgers but are not treated as visual/media assets. Their integrity is frozen by the final Git commit SHA.

## Explicit exclusions

- No third-party reference screenshot, recording or asset is registered for Git or public use.
- No partner logo is approved at the frozen Q-HUB SHA.
- No font binary is registered; Phase 0 uses documented system fallbacks unless licensed binaries are supplied separately.
- No Q-HUB code, CSS, route, controller, page layout, build artifact, screenshot, test output or review artifact is an asset source.
- No generic laptop, stock device, scraped model, fabricated photograph or placeholder box is permitted.
- No asset may imply a metric, result, relationship, endorsement or current team member beyond separately approved copy.

## Integrity gate

The Phase 0 candidate must recompute every committed asset SHA-256 and compare it with this register. Any unregistered binary, hash mismatch, missing approval state, private-path leak or third-party reference artifact blocks the handoff.
