# Phase 0.2 Integrated Aperture Chassis repair

This additive package preserves every Phase 0 and Phase 0.1 artifact. It contains the bounded still-only repair for the original Quantum Field Unit, Spiral Conduction, proving ground, activation causality, and portal alignment. It does not contain a new animatic, frame sequence, production route, deployment, or runtime dependency.

## Creative decision

Option A, the Recessed Optical Chassis, is the selected direction. The source models a low, wide, asymmetric monocoque whose optical aperture is recessed within the front shell rather than attached as an external ring. The lower-side port, service panel, hidden footing, tapered shell, and protected optical cavity distinguish it from a laptop, projector, speaker, console, or generic appliance.

The dormant state is materially black and contains no active screen meaning. A single interrupted inner optical partial ring is the sole mechanical response. The five activation stills show connector arrival, localized internal transfer, ring movement, interface visibility, and portal readiness as distinct causal states.

## Editable source

- `source/field-unit-v2-blockouts.blend` — three option families used for the silhouette gate.
- `source/field-unit-v2-integrated-aperture-chassis.blend` — selected procedural scene.
- `source/build_blockouts.py` and `source/render_blockouts.py` — blockout generation and views.
- `source/build_final_scene.py` and `source/render_final_stills.py` — final scene generation and still groups.
- `source/compose_blockout_comparison.py`, `source/compose_portal_surfaces.py`, and `source/compose_final_review.py` — deterministic Blender-derived review-sheet composition.
- `source/compose_browser_review.py` — three browser-derived sheets with matrix-bound source lineage and no additional capture resampling.
- `source/finalize_review_bundle.py` — exact 11-compositor-original plus separate-silhouette review authority and final 12-sheet bundle.
- `source/refresh_package_manifests.py` — post-scrub hash, byte, and dimension refresh for governing render/review manifests.
- `source/validate_final_scene.py` — executable Blender semantic validation.
- `source/sanitize_png_metadata.py` — pixel-preserving ancillary PNG metadata removal.
- `source/scene_config.py` — shared resolutions, palette, paths, and authoritative browser viewport set.

All geometry, materials, cameras, lighting, environment layers, cable curves, screen datums, and review compositions are original. No external models, image textures, add-ons, font binaries, reference screenshots, or reference binary assets are linked or packed. Blender's built-in font is used only for small physical-device datums; essential public meaning remains a semantic HTML responsibility.

The final editable scene is 306,735 bytes with SHA-256 `ebb41dd813c36639660f26b5ac444eec39d62e7658019db7a76808899c1fe9e4`.

## Shared portal authority

`portal-layout.json` is the single physical-screen and semantic-DOM layout authority. Its SHA-256 is `25666cf071afe7564dc051cbec770ead325cdf19ef1f4926e43d793a2a053bc5`. The physical, DOM, and overlay surfaces consume those coordinates directly. The binding portal heading is `WHERE DO YOU ENTER?`.

## Toolchain provenance

The scene was authored and rendered with Blender 5.2.0 LTS, release build `fbe6228777e7`, GPL-3.0-or-later. The official portable archive is:

- URL: `https://download.blender.org/release/Blender5.2/blender-5.2.0-windows-x64.zip`
- bytes: `404954661`
- SHA-256: `2d184b626c001692c362291911293b6a297179d618d95e9e9192c3a80318adc4`

The portable application and its per-user configuration remain outside Git. No tool was bundled into this package.

The already audited FFmpeg toolchain remains FFmpeg 9.0.1 essentials static, GPLv3, with libx264 and libvpx-vp9 available. Its official chain is `https://ffmpeg.org/download.html` to `https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.1-essentials_build.zip`; archive bytes `111253802`, SHA-256 `fec81ae03971d9dd4be3ebe02e263bd2ec1d789483f931bdba5f5715e65da2e9`. Phase 0.2 deliberately creates no new encoded media.

## Render decision and settings

EEVEE was retained for this selected-still gate. Smooth, subdivided, and beveled principal surfaces showed no review-resolution faceting, so a Cycles pass was not materially necessary. No Cycles comparison is claimed.

- engine: Blender EEVEE
- temporal anti-aliasing samples: 48
- volumetric samples: 24
- color: RGB PNG
- final-intent/style frame: 1920 × 1200
- canonical scene stills: 1920 × 1200
- mobile scene bases: 720 × 1600
- blockout views: 1400 × 1050
- review long edge: at least 2048 where credible
- reduced desktop poster: 1600 × 1000
- reduced mobile poster: 720 × 1600
- camera evidence: four still checkpoints spanning 27 degrees
- animation/video output: none

The environment uses a neutral, very low-density volumetric depth layer, engineered slabs, terrain microvariation, walls, columns, and process masses. Distant environment objects are hidden only for the neutral rear product-review cameras so the chassis remains inspectable; the proving-ground and hero environment are unchanged.

## Cable construction and review crops

The 2.5-turn continuous cable has a graphite sheath, a wider black recessed channel, a narrower warm-magenta conductor cap, and one cable-resident leading front. The energized portion is cumulative from the outer terminus inward. Immediately adjacent ground response is supplied by low-energy, shadowless local sources; it is not a broad glow.

The cable panels in `review/field-unit-v2-material-and-cable-sheet.png` are pixel-preserving crops from the final dormant, mid-conduction, 70-percent, and activation stills. Crop coordinates and source hashes are recorded in `manifests/review-composition-manifest.json`. No cable, glow, connector, or device geometry was painted into the review sheet.

## Browser-derived review evidence

The final normalized HTML/CSS browser matrix passed 46 of 46 cases and supplied 36 hash-bound captures. Those captures produce the three responsive review sheets:

- `review/desktop-hero-composition-v2.png`
- `review/mobile-hero-composition-v2.png`
- `review/text-zoom-and-fallback-v2.png`

The compositor pastes each normalized capture at 1:1 and adds labels only outside capture bounds. It performs no additional resampling or repainting. The browser matrix remains authoritative for source normalization: wide evidence uses its declared capture-scale and Lanczos-restoration lineage, while scale-1 captures remain unresampled. The exact desktop/tablet set is 1440×900, 1366×650, 1280×800, 1024×768, and 768×1024. The exact mobile set is 390×844, 360×800, 320×800, and 844×390. Text evidence uses real 200-percent zoom and forced metric-conscious system fallbacks. `manifests/browser-review-composition-manifest.json` binds every panel by repository-relative path, capture identifier, dimensions, normalization facts, and SHA-256.

`renders/portal/physical-glass-base.png` is intentionally text-free so semantic portal copy is never doubled over physical device text. Its sanitized SHA-256 is `cb6b3b2f649a4b7ef547704e17d234a01719c118500d038d31f109ab2ac19847`.

## Reproducible commands

Run these from the repository root with the verified portable Blender executable substituted for `<blender>` and an existing Python with Pillow substituted for `<python>`:

```text
<blender> --background --python artifacts/original/phase-0-3d-repair-v2/source/build_blockouts.py
<blender> --background --python artifacts/original/phase-0-3d-repair-v2/source/build_final_scene.py
<blender> --background artifacts/original/phase-0-3d-repair-v2/source/field-unit-v2-integrated-aperture-chassis.blend --python artifacts/original/phase-0-3d-repair-v2/source/render_final_stills.py -- --group all --scale 1.0
<blender> --background artifacts/original/phase-0-3d-repair-v2/source/field-unit-v2-integrated-aperture-chassis.blend --python artifacts/original/phase-0-3d-repair-v2/source/validate_final_scene.py
<python> artifacts/original/phase-0-3d-repair-v2/source/compose_portal_surfaces.py
<python> artifacts/original/phase-0-3d-repair-v2/source/compose_blockout_comparison.py
<python> artifacts/original/phase-0-3d-repair-v2/source/compose_final_review.py
<python> artifacts/original/phase-0-3d-repair-v2/source/compose_browser_review.py
<python> artifacts/original/phase-0-3d-repair-v2/source/sanitize_png_metadata.py
<python> artifacts/original/phase-0-3d-repair-v2/source/refresh_package_manifests.py
<python> artifacts/original/phase-0-3d-repair-v2/source/finalize_review_bundle.py
node scripts/verify-phase0-3d-repair-v2-layout.mjs
node scripts/verify-phase0-3d-repair-v2-assets.mjs
```

## Privacy and package hygiene

Blender PNG ancillary text chunks can contain local working paths. All 59 retained package PNGs are covered by the final metadata audit; any PNG needing cleanup is re-encoded without ancillary metadata. The sanitizer verifies identical decoded mode, dimensions, and pixel bytes before replacement and byte-preserves files already clean. The package is then scanned byte-for-byte for private user-profile and workspace markers. Backup scene files, bytecode caches, temporary render frames, and superseded activation/camera states are intentionally excluded.
