# Phase 0 3D creative repair — final evidence package

Status: **production source, canonical stills, genuine Blender animatic, review derivatives and integrity manifests complete; pending human creative review**.

This package is a new, original 3D feasibility repair for the accepted Proving Field and Spiral Conduction concept. It preserves the earlier browser-native evidence under `artifacts/original/phase-0/` and `prototypes/phase-0-spiral-field/` without modifying it.

## Creative result

The Field Unit is a low, dense industrial sensing and calibration instrument. Its circular aperture, interrupted ring, asymmetric connector, protective shoulders, service panels and off-axis mechanical element imply Q-derived geometry without becoming a logo sculpture or generic laptop.

The sequence is causally ordered:

```text
DORMANCY → CONDUCTION → AWAKENING → ALIGNMENT → ENTRY
```

- Frame 1 has no magenta illumination on the ground, cable, connector or device.
- One conduction front advances outer-to-inner through a recessed core in a continuous graphite cable.
- Cable behind the front remains energized; cable ahead remains dormant.
- The device responds only after the front reaches the physical connector.
- The mechanical wake is restrained, after which the sparse five-stage interface becomes readable.
- The final physical-glass composition and the crisp semantic-DOM reference share structural bounds without claiming pixel identity.
- Every animated property is keyed from the 192-frame timeline, so reverse playback reconstructs the same states directly.

## Authoritative source

| Record | Value |
|---|---|
| Blender source | `source/quantum-field-unit.blend` |
| Source bytes | `360021` |
| Source SHA-256 | `91601d8c0fec51744df4e4cca510556559e7f5c542b9bcc84ca83ae650c16adc` |
| Validation | `manifests/blender-source-validation.json` |
| Scene contents | 18 named collections, 145 objects, 31 materials |
| Linked libraries | none |
| External images | none |

Maintainable source files:

```text
source/
├── scene_config.py          # dimensions, timing, checkpoints and output contract
├── build_scene.py           # deterministic procedural scene authoring
├── render_deliverables.py   # named still and animatic render groups
├── compose_review.py        # review-only sheets, derivatives and integrity records
├── validate_scene.py        # source integrity and dependency audit
└── quantum-field-unit.blend # generated, editable production scene
```

`CTRL_SpiralConduction` exposes six normalized controls: `conduction`, `connector_response`, `mechanical_wake`, `screen_wake`, `physical_ui`, and `portal`. Curve drivers expose the cumulative cable core and its single leading front. The scene contains no hand-queued repeated pulse.

Temporary numbered animatic frames are generated only in ignored `work/`. The verified 192-frame set was removed after encoding; it remains reproducible from the committed Blender source and render scripts and is not part of the review commit.

## Blender organization

```text
SCENE_ROOT
├── ENVIRONMENT
├── TERRAIN
├── DISTANT_INDUSTRY
├── FIELD_UNIT
│   ├── SHELL
│   ├── APERTURE
│   ├── GLASS
│   ├── CONNECTOR
│   ├── MECHANICAL_WAKE
│   └── DETAILS
├── SPIRAL
│   ├── SHEATH
│   └── CONDUCTION
├── LIGHTING
├── ATMOSPHERE
├── CAMERA
└── STUDIO
```

## Timeline and frame mapping

The authored timeline is 192 frames at 24fps: exactly 8 seconds with no audio.

| Normalized progress | Frames | State |
|---:|---:|---|
| `0.00–0.08` | 1–16 | fully dormant |
| `0.08–0.16` | 16–32 | current enters outer terminus |
| `0.16–0.68` | 32–131 | cumulative conduction plus controlled camera arc |
| `0.68–0.76` | 131–147 | near-frontal alignment and final inner turn |
| `0.76–0.80` | 147–154 | connector arrival |
| `0.80–0.87` | 154–168 | mechanical and internal power-on |
| `0.84–0.91` | 162–176 | physical interface wake |
| `0.89–0.97` | 171–187 | interface entry and portal takeover |
| `0.97–1.00` | 187–192 | first semantic-DOM reference owns the frame |

## Render contract

- Engine: Blender Eevee (`BLENDER_EEVEE`), CPU-compatible.
- Canonical still settings: 48 temporal samples, full render scale, PNG, standard display transform.
- Design views: 2048 × 1536.
- Material views: 1600 × 1200.
- Desktop scene, conduction, activation and portal stills: 1920 × 1200.
- Mobile: separately authored 390 × 844 and 360 × 800 compositions.
- Reduced motion: 1600 × 1000 desktop and 720 × 1600 mobile.
- Suggested 1920 × 1080 animatic framing contract is preserved in scene configuration. The genuine review encode uses the explicitly permitted lower-resolution 960 × 540 iteration target, at 24fps for all 192 frames.
- Canonical render dimensions, byte counts and SHA-256 values: `manifests/render-manifest-all.json`.
- Review artifact dimensions, byte counts and SHA-256 values: `manifests/review-bundle-manifest.json`.

The dedicated raw cable camera output is preserved as `renders/materials/material-cable.png`, including its limitations. The review material sheet instead uses a declared tight crop from the canonical `renders/conduction/conduction-70.png` master so the physical graphite sheath, recessed current, leading front and ground contact can be assessed. The crop coordinates and source hash lineage are recorded in `manifests/review-bundle-manifest.json`; no geometry or material was painted into that derivative.

## Media variants

The genuine 960 × 540, 24fps, 8-second Blender sequence is encoded without audio as VP9/WebM and H.264/MP4 at requested keyframe intervals 1, 6 and 12. `review/field-unit-animatic.webm` is a byte-identical copy of the VP9 interval-6 review candidate.

- Encode arguments, dimensions, frame count, byte counts, hashes and observed keyframes: `manifests/encode-manifest.json`.
- Independent stream metadata: `manifests/ffprobe-manifest.json`.
- Browser seek, presentation and dropped-frame observations: `manifests/browser-seek-report.json`.

## Toolchain provenance and licenses

| Tool | Exact version | Provenance | Archive integrity | License / use |
|---|---|---|---|---|
| Blender | 5.2.0 LTS, release build `fbe6228777e7` | `https://download.blender.org/release/Blender5.2/blender-5.2.0-windows-x64.zip` | 404954661 bytes; SHA-256 `2d184b626c001692c362291911293b6a297179d618d95e9e9192c3a80318adc4` | GPL-3.0-or-later; per-user portable tool outside Git |
| FFmpeg / ffprobe | 9.0.1 essentials static | official `ffmpeg.org/download.html` chain to `https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.1-essentials_build.zip` | 111253802 bytes; SHA-256 `fec81ae03971d9dd4be3ebe02e263bd2ec1d789483f931bdba5f5715e65da2e9` | GPLv3; `libx264` and `libvpx-vp9` verified; binaries outside Git |

No tool binary, archive, external add-on, asset pack, model, texture, screenshot, video or font file is distributed in this repository package.

## Artwork provenance and production boundaries

All geometry, materials, lighting, animation, cameras and review compositions in this directory are original Quantum artwork produced for this Phase 0 feasibility review. No reference-site binary was used. No third-party model, texture, screenshot, video, product render or scraped asset was used.

Blender and FFmpeg are offline production tools only. They are not application dependencies and are not invoked by the site’s normal development, build or preview scripts. There is no runtime WebGL, Three.js, React Three Fiber, GSAP, asset pack or external font dependency in this package.

The review bundle is described by `review/README.md`. Portal alignment is recorded in `manifests/portal-alignment-report.json`. The review package remains subject to the Field Unit + Spiral Conduction + Portal human creative gate.
