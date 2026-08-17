# Phase 0 Asset Register

Status: controlled register for committed Phase 0 assets
Last verified: 2026-08-18

## Classification model

| Class | Meaning | Publication rule |
| --- | --- | --- |
| A | Official Quantum identity owned or explicitly authorized for public use | May ship when its exact registered hash is present |
| B | Record- or programme-specific public material with explicit approval | May ship only in the approved context and without expanding its claims |
| R | Original Quantum Phase 0 review artifact or implementation evidence | May be committed and reviewed on the non-production branch; not accepted production creative or launch media until its human gate |
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
| `MARADIN-IMG-003` | `public/media/maradin/maradin-real-field-still-approved.jpg` | JPEG | 961,699 | `49ab9aca0d2e3ef9e9ce164f43f9dbd1514ef815179626bef2bb4217827a6741` | B | Approved field still; no expanded relationship claim |

See `QHUB_IMPORT_LEDGER.md` for source paths, Git-object verification and the registered-but-unimported Maradin content source.

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
