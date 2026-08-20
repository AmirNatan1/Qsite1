# Phase 3 CRT Production Pipeline

Status: validated Phase 3 Blender derivative and implemented offline pipeline; final production media is pending generation and review
Branch: `feature/phase-3-crt-opening-production`
Accepted parent: `b54f3a83b6180466127589a8d028f94dab892d17`

## Purpose and production boundary

This document defines the reproducible offline pipeline for the isolated Phase 3 physical cinematic. It covers source verification, derivative preparation, deterministic rendering, outside-Git intermediates, web encoding, probing, and evidence identity.

It does not authorize:

- modifying the accepted CRT master;
- changing Phase 2B production choreography;
- adding runtime Blender, WebGL, Three.js, React Three Fiber, or another 3D runtime;
- connecting the cinematic to live scroll;
- committing raw frame sequences, render caches, raw masters, or redundant encode experiments.

## Accepted source lineage

| Authority | Value |
| --- | --- |
| Accepted CRT master | `artifacts/original/phase-0-4-crt-television/source/quantum-signal-television-v1.blend` |
| Bytes | `1,516,222` |
| SHA-256 | `3027c4c46e2b829fd97ee9a3a47558e43adda47abcc488420faa0f087bd720a7` |
| Git introduction | `9aec62c1d89ebb2095bbc8903a718f77bbb6dbda` |
| Accepted Phase 2B tree | `b54f3a83b6180466127589a8d028f94dab892d17` |
| Validation authority | `artifacts/original/phase-0-4-crt-television/manifests/blender-source-validation.json` — PASS 49/49 |
| Blender source version | Blender `5.2.0 LTS` |
| Dependency state | zero linked libraries, external images, packed files, external paths, missing files, image textures, and third-party models |

The Phase 0.4R-prefixed manifests and the current validation, refined-source, material/asset, keepout, and package-inventory manifests are the source authorities. The unprefixed historical Phase 0.4 render, power, portal, and review manifests bind the superseded SHA `9980c054...` and must not be used as Phase 3 source authority.

The accepted master is immutable. Existing Phase 0.4 scripts also target frozen Phase 0.4 files and manifests; they must not be run with their in-place defaults during Phase 3.

## Derivative-source contract and current authority

Phase 3 begins by opening the exact accepted master on Blender's command line. `build_phase3_crt_opening.py` verifies its SHA-256 and filepath before making any in-memory change, rejects an output path equal to the master, and writes only a new derivative with `save_as_mainfile`. It does not remodel the accepted television or write back to the Phase 0.4 package.

The current validated derivative is:

| Field | Current value |
| --- | --- |
| Repository path | `artifacts/original/phase-3-crt-opening/source/quantum-signal-television-phase3-opening.blend` |
| Bytes | `2,182,647` |
| SHA-256 | `bbde82220f500c6f047c2e2d33a8580c08a40e65800615dd7256bebc2f4472ba` |
| Blender | `5.2.0 LTS` |
| Build ledger | `artifacts/original/phase-3-crt-opening/manifests/phase-3-source-build.json` |
| Validation ledger | `artifacts/original/phase-3-crt-opening/manifests/phase-3-source-validation.json` — PASS 28/28 |

The derivative contract is:

1. Verify the accepted master SHA-256 and opened filepath before authoring.
2. Save all Phase 3 scene, environment, animation, camera, and render changes only into the derivative path above.
3. Maintain the machine-readable build and validation ledgers after every derivative rebuild.
4. Do not change recognizable CRT proportions, cabinet identity, material identity, glass construction, controls, speaker region, rear connection, or strain relief without human approval.
5. Keep the derivative self-contained: zero linked libraries, external images, movie clips, fonts, sequence-editor strips, cache files, absolute external file paths, or missing dependencies.
6. Preserve the accepted master byte-for-byte and never run the Phase 0.4 scripts with their in-place output defaults.
7. Commit only the selected reproducibility derivative; raw frame sequences and render caches remain outside Git.

## Authorized local toolchain

### Blender

```text
<blender>
```

- Version: Blender `5.2.0 LTS`
- Build hash: `fbe6228777e7`
- Executable SHA-256: `0060916d6921eb4d46c57254609d805a2ea711917399051391a52ba14beb6327`
- Role: offline scene preparation, validation, and frame rendering only

### FFmpeg and ffprobe

```text
<ffmpeg>
<ffprobe>
```

- Version: FFmpeg/ffprobe `9.0.1-essentials_build-www.gyan.dev`
- FFmpeg SHA-256: `72a489eccd008c2ec2c0a5856c5c75bc3d8bbfa90166c4566865c246445e6aa3`
- ffprobe SHA-256: `19202b23c0043f15ad1b7bce2344f406fd52bd6efd8f995ce02e7392a1cec52f`
- Required encoders present: `libx264`, `libvpx-vp9`; `libaom-av1` is optional evaluation only

These tools are intentionally outside Git and are not on the user `PATH`. Reproducible commands must use explicit executable paths or task-scoped variables.

### Evidence packager and browser QA runtimes

```text
<python>
<node>
```

- Python: `3.12.13`; executable SHA-256 `d8e3f0adf246db00358c0c4ed349cf714898178f9558fb0e944f79f5c07f8eaa`
- Pillow: `12.3.0`
- Node.js: `v24.19.0`; executable SHA-256 `3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237`
- Roles: deterministic encoding/evidence/ZIP packaging and isolated ffprobe/Chromium media QA; neither runtime enters the production site or `dist`

## Render profile

The historical accepted material-quality profile is the starting authority:

| Setting | Accepted value / Phase 3 rule |
| --- | --- |
| Blender | 5.2.0 LTS build `fbe6228777e7` |
| Engine | Cycles |
| Historical render device | CPU |
| Phase 3 qualified device | NVIDIA GeForce RTX 4050 Laptop GPU through OptiX |
| Samples | 48 adaptive production samples; 16-sample previews are review-only |
| Seed | `2404` |
| Adaptive sampling | enabled |
| Historical adaptive threshold | `0.02` |
| Phase 3 adaptive threshold | `0.018` |
| Denoising | enabled |
| Denoiser | OpenImageDenoise / OIDN, including when OptiX is the render device |
| Maximum bounces | 8 |
| Diffuse / glossy bounces | 4 / 4 |
| Transmission / transparent bounces | 8 / 8 |
| Volume bounces | 0 |
| View transform | AgX |
| Look | AgX — Medium High Contrast |
| Film transparency | false |
| Timeline | frames 1–270 at 30 fps |
| Desktop production / preview | 1920×1080 / 1280×720 |
| Mobile production / preview | 720×1280 / 540×960 |
| Image master | 8-bit RGB PNG, compression setting 42, AgX applied once in Blender |

### Documented render-device change

Phase 3 changes the rendering device from the accepted CPU evidence profile to local OptiX GPU rendering for production throughput. This is a device change only. It does not authorize changes to modeled geometry, animation, materials, lighting, exposure, camera, color management, seed, denoiser, or timeline.

Before full rendering, produce bounded OptiX spot frames from the same derivative at 16 preview samples and 48 adaptive production samples. Include dormant, conduction, arrival, line, raster, interface, cabinet-close, and handoff checkpoints. Inspect glass, phosphor, cable, ground response, dark gradients, thin raster typography, cabinet roughness, and final black-level alignment.

The Phase 0.4R evidence used Cycles CPU stills. Phase 3 deliberately qualifies OptiX for the 270-frame production sequence; device outputs are not assumed to be byte-identical. The gate is authored-state identity plus acceptable visual quality. Record the selected device, driver-visible device name, Blender build, actual settings, render times, and final output hashes. If the device gate exposes a material or denoising defect, use CPU for the affected production render or repair the pipeline explicitly; do not silently alter the accepted look.

### Production-quality sampling and resolution gate

The historical 64-sample CPU setting is a still-evidence reference, not an automatic animation requirement. Phase 3 selects 48 adaptive OptiX samples with OIDN after bounded checkpoint comparison against the 16-sample preview. Render bounded quality comparisons before the full sequence:

- 16 versus 48 samples using the same seed, OIDN, AgX, and authored scene;
- 1920×1080 versus a higher master only if downsampling materially improves glass, cable, dark gradients, scanlines, and thin typography;
- representative dormant, conductor, phosphor, cabinet-close, and final-handoff frames.

Freeze the smallest profile that clears the visual bar. Record the final samples, adaptive threshold, resolution, render device, and comparison evidence in `docs/planning/PHASE_3_MEDIA_MANIFEST.md`. Do not call an untested provisional value the production master.

## Deterministic scene requirements

- Every rendered state must be recoverable by opening the derivative and setting a single frame.
- Use fixed seeds and frame-derived drivers. Avoid stateful playback handlers and previous-frame assumptions.
- No uncontrolled particles, sparks, animated random noise, physics history, stochastic glitches, or temporary caches may affect final frames.
- Motion blur is disabled because scroll will traverse frames in both directions; the validator enforces this state.
- Render a non-sequential frame order during validation and compare it with the same frames from a sequential render.
- The derivative must open cleanly with zero linked libraries, external images, packed files, missing files, absolute external paths, and required caches.

## Asset and privacy policy

The production scene may use only the accepted internal CRT model, newly authored procedural/material work, newly authored environment geometry, and approved project-owned assets.

It must not contain or depend on:

- third-party models, stock environments, purchased packs, scraped textures, HDRIs, or random internet imagery;
- AI-generated industrial environment imagery;
- the private user CRT reference photograph;
- manufacturer logos or copied model-specific markings;
- external font, texture, library, movie, sound, or cache paths;
- runtime network access.

If a project-owned font is temporarily used while authoring raster content, convert the final needed glyphs to internal curve/mesh data and remove the font path before validation. The final derivative remains self-contained and procedural.

## Outside-Git workspace

All heavy work products for a local production run live under a task-scoped absolute directory outside the repository.

```text
<outside-git-render-root>/
  frames/
    desktop-master/
    mobile-master/
    spot-gates/
  candidate-experiments/
    h264/
    vp9/
    optional-av1/
  probes/
  logs/
  review-transfer/
```

Never commit:

- EXR or PNG frame sequences;
- render caches or Blender temporary caches;
- raw or lossless video masters;
- intermediate mezzanine files;
- redundant codec experiments;
- OptiX preview/production comparison frames beyond compact, explicitly selected review evidence.

Candidate production encodes may enter the isolated artifact package only after deterministic encode, ffprobe, transfer-size, seek, browser, visual-self-review, and publication-boundary gates. Their manifest status remains `PRODUCTION CANDIDATE — visual/browser acceptance pending`; no candidate is selected for integration until direct human acceptance. The outside-Git human-review ZIP must not contain raw render sequences or production delivery candidates.

The selected `.blend` derivative is the small repository authority named above; it is not a raw render intermediate. `render_phase3_frames.py` also places its OptiX cache under the system temporary directory as `QuantumPhase3OptixCache`, never under the worktree.

## Frame-render strategy

1. Verify source and tool hashes.
2. Prepare the derivative without touching the accepted master.
3. Validate dependencies, frame range, fps, camera, color management, deterministic seeds, and exact timeline markers.
4. Run the OptiX checkpoint and 16-versus-48-sample quality gate.
5. Run the sample/resolution quality gate.
6. Freeze the render profile in a Phase 3 configuration authority.
7. Render frames 1–270 to a fresh outside-Git directory. An 8-bit RGB PNG sequence is the selected display-referred web master because the final delivery is 8-bit `yuv420p`; the deterministic AgX transform is applied once in Blender. EXR may be used only for a separately documented grading experiment and remains outside Git.
8. Re-render a deterministic non-sequential sample after the full render and verify visual/state identity.
9. Encode every delivery candidate from the same approved frame sequence.
10. Probe and hash every candidate before browser/media-lab testing.

Partial renders, retries, and resumed work must use explicit frame ranges and must not overwrite a previously approved sequence without a new output directory or manifest revision.

## Desktop encoding strategy

Create at least two practical browser candidates from the same approved 270-frame master:

1. H.264 MP4 using `libx264`, `yuv420p`, fast-start metadata, and no audio.
2. VP9 WebM using `libvpx-vp9`, `yuv420p`, and no audio.

AV1 may be tested but cannot be the sole deliverable. A 10-bit candidate may be evaluated for dark-gradient quality but cannot replace the compatibility candidates without browser evidence.

Seekability is more important than linear streaming efficiency. The production candidates use a fixed 12-frame keyframe cadence with scene-cut insertion disabled, giving 400 ms maximum nominal keyframe spacing at 30 fps. H.264 additionally enforces a closed GOP; VP9 disables lag and alternate-reference frames. Shorter-GOP experiments may remain outside Git when a seek defect needs diagnosis; the committed candidate stays at GOP 12 unless measured browser evidence requires a revision. Select the smallest candidate that preserves:

- fast arbitrary and nearby-frame seeking;
- repeated forward/reverse seeks;
- rapid alternating jumps;
- first-frame and final-frame access;
- dark gradients without objectionable banding or blocking;
- stable scanlines, phosphor softness, and thin typography without shimmer or moiré.

Record dimensions, fps, nominal duration, frame count, average bitrate, bytes, GOP strategy, codec profile, pixel format, SHA-256, first-usable-frame latency, seek measurements, and browser results in the Phase 3 media manifest. No output may contain audio, subtitle, data, or attachment streams.

## Reproducible command templates

The following PowerShell commands match the implemented script interfaces and frozen settings. Bind each documented placeholder to the verified local executable or directory before running them. Raw frame roots and the external review ZIP must resolve outside Git.

### Task-scoped paths

```powershell
$Phase3RepoRoot = '<repo>'
$Phase3WorkRoot = '<outside-git-render-root>'
$Phase3SourceDir = Join-Path $Phase3RepoRoot 'artifacts\original\phase-3-crt-opening\source'
$Phase3BlenderExe = '<blender>'
$Phase3FfmpegExe = '<ffmpeg>'
$Phase3FfprobeExe = '<ffprobe>'
$Phase3PythonExe = '<python>'
$Phase3NodeExe = '<node>'
$Phase3ChromeExe = '<chromium>'
$Phase3AcceptedBlend = Join-Path $Phase3RepoRoot 'artifacts\original\phase-0-4-crt-television\source\quantum-signal-television-v1.blend'
$Phase3DerivativeBlend = Join-Path $Phase3SourceDir 'quantum-signal-television-phase3-opening.blend'
$Phase3Builder = Join-Path $Phase3SourceDir 'build_phase3_crt_opening.py'
$Phase3Validator = Join-Path $Phase3SourceDir 'validate_phase3_source.py'
$Phase3Renderer = Join-Path $Phase3SourceDir 'render_phase3_frames.py'
$Phase3Packager = Join-Path $Phase3SourceDir 'package_phase3_media.py'
$Phase3QaScript = Join-Path $Phase3RepoRoot 'scripts\qa-phase3-media.mjs'
$Phase3DesktopFrames = Join-Path $Phase3WorkRoot 'frames\desktop-master'
$Phase3MobileFrames = Join-Path $Phase3WorkRoot 'frames\mobile-master'
$Phase3ReviewZip = Join-Path $Phase3WorkRoot 'review-transfer\phase-3-crt-opening-human-review.zip'
$Phase3QaReport = Join-Path $Phase3RepoRoot 'artifacts\evidence\phase-3\reports\phase-3-media-qa.json'
$Phase3MediaRoot = Join-Path $Phase3RepoRoot 'artifacts\original\phase-3-crt-opening\media'
```

### Source and tool verification

```powershell
(Get-FileHash -Algorithm SHA256 -LiteralPath $Phase3AcceptedBlend).Hash.ToLowerInvariant()
(Get-FileHash -Algorithm SHA256 -LiteralPath $Phase3DerivativeBlend).Hash.ToLowerInvariant()
(Get-FileHash -Algorithm SHA256 -LiteralPath $Phase3BlenderExe).Hash.ToLowerInvariant()
(Get-FileHash -Algorithm SHA256 -LiteralPath $Phase3FfmpegExe).Hash.ToLowerInvariant()
(Get-FileHash -Algorithm SHA256 -LiteralPath $Phase3FfprobeExe).Hash.ToLowerInvariant()
(Get-FileHash -Algorithm SHA256 -LiteralPath $Phase3PythonExe).Hash.ToLowerInvariant()
(Get-FileHash -Algorithm SHA256 -LiteralPath $Phase3NodeExe).Hash.ToLowerInvariant()
& $Phase3BlenderExe --version
& $Phase3FfmpegExe -version
& $Phase3FfprobeExe -version
& $Phase3PythonExe --version
& $Phase3NodeExe --version
```

The accepted source command must return `3027c4c46e2b829fd97ee9a3a47558e43adda47abcc488420faa0f087bd720a7` before derivative work begins. After a build and validation pass, the current derivative command must return `bbde82220f500c6f047c2e2d33a8580c08a40e65800615dd7256bebc2f4472ba`; if the derivative is intentionally rebuilt, the build ledger, validation ledger, and this authority must be updated together.

### Scene preparation and validation

```powershell
& $Phase3BlenderExe --background $Phase3AcceptedBlend --python $Phase3Builder
& $Phase3BlenderExe --background $Phase3DerivativeBlend --python $Phase3Validator
```

The builder verifies the accepted source hash and exact opened filepath before changing the in-memory scene, then saves only the configured derivative. The validator is the fail-closed source prerequisite: it checks the accepted and derivative identities, timeline, cameras, self-containment, dormancy, text retirement, review-guide exclusion, and other authored-state invariants, and writes the tracked validation ledger.

### Desktop and mobile master frame rendering

```powershell
& $Phase3BlenderExe --background $Phase3DerivativeBlend --python $Phase3Renderer -- --variant desktop --quality production --frames all --output $Phase3DesktopFrames --samples 48
& $Phase3BlenderExe --background $Phase3DerivativeBlend --python $Phase3Renderer -- --variant mobile --quality production --frames all --output $Phase3MobileFrames --samples 48
```

`render_phase3_frames.py` accepts only `desktop|mobile`, `preview|production`, explicit frames, an output path, and an optional sample override. It applies the frozen render configuration and variant-specific camera in memory, rejects repository destinations for sequences longer than 20 frames, and records the actual device/settings in a render report. It attempts OptiX and falls back to CUDA only when OptiX is unavailable. It does not replace the validator's source-identity and dependency checks, so a PASS validation ledger is required before these commands run.

### Deterministic encoding and compact evidence packaging

```powershell
& $Phase3PythonExe $Phase3Packager --desktop-frames $Phase3DesktopFrames --mobile-frames $Phase3MobileFrames --ffmpeg $Phase3FfmpegExe --ffprobe $Phase3FfprobeExe --review-zip $Phase3ReviewZip --repo-root $Phase3RepoRoot
```

The packager verifies both 270-frame sequences, encodes desktop H.264 CRF 18 and VP9 CRF 27 plus mobile H.264 CRF 19 and VP9 CRF 28, enforces 30 fps/9 seconds/8-bit `yuv420p`/BT.709/no audio and a fixed 12-frame cadence, writes the isolated candidate media and compact tracked review evidence, and creates the outside-Git ZIP without raw frames or delivery media.

### Isolated ffprobe and Chromium QA

```powershell
& $Phase3NodeExe $Phase3QaScript `
  --ffprobe $Phase3FfprobeExe `
  --output $Phase3QaReport `
  --desktop-mp4 (Join-Path $Phase3MediaRoot 'phase-3-crt-opening-desktop-h264.mp4') `
  --desktop-webm (Join-Path $Phase3MediaRoot 'phase-3-crt-opening-desktop-vp9.webm') `
  --mobile-mp4 (Join-Path $Phase3MediaRoot 'phase-3-crt-opening-mobile-h264.mp4') `
  --mobile-webm (Join-Path $Phase3MediaRoot 'phase-3-crt-opening-mobile-vp9.webm') `
  --browser-executable $Phase3ChromeExe `
  --headed `
  --require-browser `
  --expected-gop 12
```

The QA harness serves only the supplied media through an in-memory loopback server, rejects candidate/report paths inside `src`, `public`, or `dist`, and covers deterministic probe gates, start/end/random/nearby/forward/reverse/rapid seeks, linear playback, and real hidden-tab resume. A headless hidden-tab result is intentionally incomplete; final evidence uses `--headed --require-browser`.

### Post-push external review identity

```powershell
$Phase3FinalPushedSha = (& git -C $Phase3RepoRoot rev-parse HEAD).Trim()
& $Phase3PythonExe $Phase3Packager --finalize-external-only --review-zip $Phase3ReviewZip --repo-root $Phase3RepoRoot --branch-sha $Phase3FinalPushedSha
```

Run this finalization only after the generated isolated artifacts are committed and the branch is pushed with an upstream. It requires a clean tracked worktree, verifies that local `HEAD` equals the upstream SHA, re-verifies every recorded tracked file, and rewrites only the external ZIP, manifest, and hash sidecar. Finalized commands, stdout summaries, probes, hashes, actual encoder/browser versions, and the pushed branch SHA belong in the production evidence, not only in shell history.

## Validation gates

### Before full rendering

- Accepted source hash matches exactly.
- Derivative change ledger exists and contains no silent CRT redesign.
- Blender version/build and selected device are recorded.
- Cycles, OIDN, AgX, look, seed, samples, bounces, fps, frames, and resolution are exact.
- External libraries, images, paths, missing files, third-party assets, private references, and cache dependencies are zero.
- OptiX 16/48 checkpoint and sample/resolution gates pass.
- Frames 1, 30, 31, 72, 112, 113, 116, 120, 121, 126, 132, 133, 154, 155, 167, 176, 177, 190, 201, 210, 211, 232, 252, 255, 269, and 270 match the timeline contract.

### After rendering

- Exactly 270 contiguous frames exist; no duplicate, missing, or zero-byte frame is present.
- Random isolated frames match sequential renders in authored state.
- Forward and reverse reviews are coherent.
- Frame 1 has zero environmental magenta.
- Frame 270 matches the Phase 3 portal-alignment contract and contains no blank bridge or duplicate semantic text.
- Frame dimensions, color transform, byte sizes, and hashes are recorded.

### After encoding

- H.264 and VP9 candidates derive from the same approved master frames.
- ffprobe reports exactly one video stream and zero audio/subtitle/data/attachment streams.
- Dimensions, 30 fps cadence, 270 frames, duration, pixel format, codec, GOP, bitrate, bytes, and hashes match the manifest.
- Browser tests cover first frame, final frame, 10 random seeks, nearby seeks, repeated forward/reverse seeks, rapid alternating seeks, and hidden-tab resume.
- Dark gradients, scanlines, phosphor, thin type, and final black level survive compression.
- Isolated candidates may be committed only with manifest status `PRODUCTION CANDIDATE — visual/browser acceptance pending`; human acceptance is still required before selection or integration.

## Required later records

The derivative build and validation ledgers already exist and bind the current source authority. Production must still add or complete, without retroactively changing accepted Phase 0.4 evidence:

- `docs/planning/PHASE_3_MEDIA_MANIFEST.md` with actual values rather than placeholders;
- render configuration and frame inventory;
- FFmpeg command and ffprobe records;
- isolated Chromium/media-lab measurements;
- reverse-review evidence;
- Phase 3-to-Phase 2B handoff comparison;
- compact outside-Git human-review transfer manifest and post-push SHA-bound ZIP sidecar.

No production candidate is accepted until those records and direct human visual review are complete.

## Required final human-gate wording

The Phase 3 handoff must end with the following lines exactly, with no self-authorization of Phase 4 and no text after the completion line:

```text
PROVING FIELD + SPIRAL CONDUCTION:
ACCEPT / REPAIR / REDIRECT

CRT POWER-ON + SCREEN AUTHENTICITY:
ACCEPT / REPAIR / REDIRECT

CAMERA + PORTAL ALIGNMENT:
ACCEPT / REPAIR / REDIRECT

MOBILE + REDUCED-MOTION CONTINUITY:
ACCEPT / REPAIR / REDIRECT

MEDIA PERFORMANCE + PRODUCTION SAFETY:
ACCEPT / REPAIR / REDIRECT

PHASE 3 PRODUCTION CRT OPENING COMPLETE — AWAITING HUMAN REVIEW
```
