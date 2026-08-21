# Phase 3-R CRT Authenticity Production Pipeline

Status: screen-only repair rendering, two-stage packaging, full-size visual self-review, fresh-process determinism, and retry-hardened isolated browser QA complete; direct human review pending
Branch: `feature/phase-3-crt-opening-production`
Accepted Phase 2B parent: `b54f3a83b6180466127589a8d028f94dab892d17`
Phase 3-R repair parent: `ae6cd4c0c664a275c077bd37207efde01e9caa29`

## Purpose and production boundary

This document defines the reproducible offline pipeline for the isolated Phase 3-R CRT-screen repair. It covers accepted-derivative verification, screen-only repair authoring, deterministic rendering, outside-Git intermediates, hash-bound encoding and browser QA, compact evidence replacement, and external review identity. The accepted Phase 3 physical cinematic remains the environmental authority.

It does not authorize:

- modifying the accepted CRT master;
- modifying the accepted Phase 3 derivative in place;
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
| Accepted Phase 3 derivative | `artifacts/original/phase-3-crt-opening/source/quantum-signal-television-phase3-opening.blend` — 2,182,647 bytes, SHA-256 `bbde82220f500c6f047c2e2d33a8580c08a40e65800615dd7256bebc2f4472ba` |
| Accepted Phase 2B tree | `b54f3a83b6180466127589a8d028f94dab892d17` |
| Validation authority | `artifacts/original/phase-0-4-crt-television/manifests/blender-source-validation.json` — PASS 49/49 |
| Blender source version | Blender `5.2.0 LTS` |
| Dependency state | zero linked libraries, external images, packed files, external paths, missing files, image textures, and third-party models |

The Phase 0.4R-prefixed manifests and the current validation, refined-source, material/asset, keepout, and package-inventory manifests are the source authorities. The unprefixed historical Phase 0.4 render, power, portal, and review manifests bind the superseded SHA `9980c054...` and must not be used as Phase 3 source authority.

The accepted master is immutable. Existing Phase 0.4 scripts also target frozen Phase 0.4 files and manifests; they must not be run with their in-place defaults during Phase 3.

## Derivative-source contract and current authority

Phase 3-R begins by opening the exact accepted Phase 3 derivative on Blender's command line. `repair_phase3r_crt_authenticity.py` verifies its SHA-256 and filepath before making any in-memory change, rejects either historical authority as an output, and writes only a new Phase 3-R derivative with `save_as_mainfile`. It does not rebuild the environment, remodel the television, or write back to the Phase 0 or accepted Phase 3 sources.

The current validated derivative is:

| Field | Current value |
| --- | --- |
| Repository path | `artifacts/original/phase-3-crt-opening/source/quantum-signal-television-phase3-r-crt-authenticity.blend` |
| Bytes | `2,222,662` |
| SHA-256 | `4341a3fb7ae29ef9be4472ea23ca9235e36f9609893bc2f37de32e5847d36f26` |
| Blender | `5.2.0 LTS` |
| Build ledger | `artifacts/original/phase-3-crt-opening/manifests/phase-3-r-source-build.json` |
| Validation ledger | `artifacts/original/phase-3-crt-opening/manifests/phase-3-r-source-validation.json` — PASS 51/51 |

The derivative contract is:

1. Verify the accepted Phase 0 master, accepted Phase 3 derivative, repair parent, and opened filepath before authoring.
2. Save only the allowlisted Phase 3-R screen repair into the distinct derivative path above.
3. Maintain the machine-readable build and validation ledgers after every derivative rebuild.
4. Do not change recognizable CRT proportions, cabinet identity, material identity, glass construction, controls, speaker region, rear connection, or strain relief without human approval.
5. Keep the derivative self-contained: zero linked libraries, external images, movie clips, fonts, sequence-editor strips, cache files, absolute external file paths, or missing dependencies.
6. Preserve the accepted master byte-for-byte and never run the Phase 0.4 scripts with their in-place output defaults.
7. Require exact before/after frozen-scene and independent accepted-Phase-3 snapshot matches.
8. Commit only the selected reproducibility derivative; raw frame sequences and render caches remain outside Git.

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

- Python: `3.12.13`; executable identity is verified locally before packaging
- Pillow: `12.3.0`
- Node.js: `v24.18.0` in the final browser-QA report; executable identity is verified locally before QA
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

### Phase 3-R screen-render delta

The repair does not change the renderer, cameras, environment, cable, conduction, portal geometry, or accepted timeline. It changes only the following render-facing screen properties:

- a neutral warm-white, three-layer phosphor wake behind the convex glass;
- one continuously illuminated picture field with 160 desktop raster bands and 112 mobile bands;
- maximum settled desktop raster contrast `0.085`, with mobile at 72% of desktop;
- deterministic, reversible settling without random or temporal noise;
- accepted Quantum typography conformed to phosphor depth with variant-specific low-bloom materials;
- late raster contrast suppression from `0.030` at frame 247 to `0.001` at frame 270;
- neutral screen-output compensation through `Phase3_ScreenSpill` only.

`phase3r_config.py`, the source-build ledger, and `PHASE_3_R_CRT_AUTHENTICITY_REPAIR.md` are the exact property authorities. The timeline and portal-alignment contracts remain byte-unchanged.

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

Candidate production encodes may enter the isolated artifact package only after deterministic encode, ffprobe, transfer-size, seek, browser, visual-self-review, and publication-boundary gates. Their manifest status remains `PHASE 3-R PRODUCTION CANDIDATE — HUMAN REVIEW REQUIRED`; no candidate is selected for integration until direct human acceptance. The outside-Git human-review ZIP includes the exact four hash-bound candidates as motion evidence but must not contain raw render sequences, raw masters, or redundant experiments.

The selected `.blend` derivative is the small repository authority named above; it is not a raw render intermediate. `render_phase3r_frames.py` also places its OptiX cache under the system temporary directory as `QuantumPhase3ROptixCache`, never under the worktree.

## Frame-render strategy

1. Verify source and tool hashes.
2. Prepare the derivative without touching the accepted master.
3. Validate dependencies, frame range, fps, camera, color management, deterministic seeds, and exact timeline markers.
4. Run the OptiX checkpoint and 16-versus-48-sample quality gate.
5. Run the sample/resolution quality gate.
6. Freeze the inherited render profile and repaired screen parameters in the Phase 3-R configuration authority.
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

Record dimensions, fps, nominal duration, frame count, stream bitrate, bytes, GOP strategy, codec profile, pixel format, SHA-256, first-usable-frame latency, seek measurements, and browser results in the Phase 3-R media manifest. No output may contain audio, subtitle, data, or attachment streams.

## Reproducible command templates

The following PowerShell templates match the implemented Phase 3-R interfaces. Bind every angle-bracket placeholder locally. Raw frames, QA intermediates, determinism rerenders, and the external ZIP must resolve outside Git; host-specific absolute paths must never enter tracked evidence.

### Task-scoped paths

```powershell
$Phase3RRepoRoot = '<repository-root>'
$Phase3RWorkRoot = '<outside-git-work-root>'
$Phase3RSourceDir = Join-Path $Phase3RRepoRoot 'artifacts\original\phase-3-crt-opening\source'
$Phase3RMediaRoot = Join-Path $Phase3RRepoRoot 'artifacts\original\phase-3-crt-opening\media'
$Phase3RManifestRoot = Join-Path $Phase3RRepoRoot 'artifacts\original\phase-3-crt-opening\manifests'
$Phase3RBlenderExe = '<blender-executable>'
$Phase3RFfmpegExe = '<ffmpeg-executable>'
$Phase3RFfprobeExe = '<ffprobe-executable>'
$Phase3RPythonExe = '<python-executable>'
$Phase3RNodeExe = '<node-executable>'
$Phase3RAcceptedPhase3 = Join-Path $Phase3RSourceDir 'quantum-signal-television-phase3-opening.blend'
$Phase3RDerivative = Join-Path $Phase3RSourceDir 'quantum-signal-television-phase3-r-crt-authenticity.blend'
$Phase3RRepair = Join-Path $Phase3RSourceDir 'repair_phase3r_crt_authenticity.py'
$Phase3RValidator = Join-Path $Phase3RSourceDir 'validate_phase3r_source.py'
$Phase3RRenderer = Join-Path $Phase3RSourceDir 'render_phase3r_frames.py'
$Phase3RPackager = Join-Path $Phase3RSourceDir 'package_phase3r_media.py'
$Phase3RQaScript = Join-Path $Phase3RRepoRoot 'scripts\qa-phase3-media.mjs'
$Phase3RDeterminismScript = Join-Path $Phase3RRepoRoot 'scripts\verify-phase3r-render-determinism.mjs'
$Phase3RDesktopFrames = Join-Path $Phase3RWorkRoot 'desktop-production-final'
$Phase3RMobileFrames = Join-Path $Phase3RWorkRoot 'mobile-production-final'
$Phase3RQaReport = Join-Path $Phase3RWorkRoot 'phase-3-r-media-qa-report.json'
$Phase3RLabRecording = Join-Path $Phase3RWorkRoot 'phase-3-r-media-lab-scrub-evidence.webm'
$Phase3RDeterminismReport = Join-Path $Phase3RWorkRoot 'phase-3-r-render-determinism.json'
$Phase3RReviewZip = Join-Path $Phase3RWorkRoot 'phase-3-r-crt-authenticity-human-review.zip'
$Phase3RCandidateAuthority = Join-Path $Phase3RManifestRoot 'phase-3-r-candidate-authority.json'
```

### Source and tool verification

```powershell
(Get-FileHash -Algorithm SHA256 -LiteralPath $Phase3RAcceptedPhase3).Hash.ToLowerInvariant()
(Get-FileHash -Algorithm SHA256 -LiteralPath $Phase3RBlenderExe).Hash.ToLowerInvariant()
(Get-FileHash -Algorithm SHA256 -LiteralPath $Phase3RFfmpegExe).Hash.ToLowerInvariant()
(Get-FileHash -Algorithm SHA256 -LiteralPath $Phase3RFfprobeExe).Hash.ToLowerInvariant()
(Get-FileHash -Algorithm SHA256 -LiteralPath $Phase3RPythonExe).Hash.ToLowerInvariant()
(Get-FileHash -Algorithm SHA256 -LiteralPath $Phase3RNodeExe).Hash.ToLowerInvariant()
& $Phase3RBlenderExe --version
& $Phase3RFfmpegExe -version
& $Phase3RFfprobeExe -version
& $Phase3RPythonExe --version
& $Phase3RNodeExe --version
```

The accepted Phase 3 source must return `bbde82220f500c6f047c2e2d33a8580c08a40e65800615dd7256bebc2f4472ba`. After repair and validation, the Phase 3-R derivative must return `4341a3fb7ae29ef9be4472ea23ca9235e36f9609893bc2f37de32e5847d36f26`. Any intentional source rebuild requires the build ledger, validation ledger, derivative authority, and every downstream candidate binding to advance together.

### Screen repair and source validation

```powershell
& $Phase3RBlenderExe --background $Phase3RAcceptedPhase3 --python $Phase3RRepair
& $Phase3RBlenderExe --background $Phase3RDerivative --python $Phase3RValidator
```

The repair script verifies the exact accepted source and writes only the configured Phase 3-R derivative. The validator is fail-closed: all 51 screen and frozen-area checks must pass, both frozen signatures must match exactly, the 270-frame/30-fps timeline must remain unchanged, and all dependency counts must be zero.

### Desktop and mobile production rendering

```powershell
& $Phase3RBlenderExe --background $Phase3RDerivative --python $Phase3RRenderer -- --variant desktop --quality production --frames all --output $Phase3RDesktopFrames --samples 48
& $Phase3RBlenderExe --background $Phase3RDerivative --python $Phase3RRenderer -- --variant mobile --quality production --frames all --output $Phase3RMobileFrames --samples 48
```

`render_phase3r_frames.py` accepts `desktop|mobile`, `preview|production`, explicit frames, an output path, and an optional sample override. It rejects an in-repository destination for sequences longer than 20 frames, applies the frozen camera and render settings in memory, selects the correct desktop/mobile raster material, and records the actual device and settings.

### Fresh-process determinism

```powershell
& $Phase3RNodeExe $Phase3RDeterminismScript `
  --blender $Phase3RBlenderExe `
  --desktop-reference $Phase3RDesktopFrames `
  --mobile-reference $Phase3RMobileFrames `
  --work-root (Join-Path $Phase3RWorkRoot 'determinism-work') `
  --output $Phase3RDeterminismReport
```

Desktop and mobile use separate fresh Blender processes and frames `1,126,144,162,196,250,262,270`. PASS requires exact dimensions, decoded p95 channel delta `0`, maximum delta at most `1/255`, and changed-channel ratio at most `0.0001` for every comparison.

### Stage 1 — encode and freeze candidate authority

```powershell
& $Phase3RPythonExe -B $Phase3RPackager `
  --encode-only `
  --desktop-frames $Phase3RDesktopFrames `
  --mobile-frames $Phase3RMobileFrames `
  --ffmpeg $Phase3RFfmpegExe `
  --ffprobe $Phase3RFfprobeExe `
  --repo-root $Phase3RRepoRoot

$Phase3RCandidateAuthoritySha = (Get-FileHash -Algorithm SHA256 -LiteralPath $Phase3RCandidateAuthority).Hash.ToLowerInvariant()
```

Stage 1 verifies both exact 270-frame source sequences, encodes the four candidates once, probes every stream and keyframe, binds the source/config/renderer/tool hashes, and writes only `phase-3-r-candidate-authority.json` as the reuse authority. The selected authority for this run is SHA-256 `6e4795de2c232769e535931337fc4c3ebe4e84c7279559e6aec3c79cc9fe57ae`.

### Hash-bound isolated browser QA

```powershell
& $Phase3RNodeExe $Phase3RQaScript `
  --ffprobe $Phase3RFfprobeExe `
  --output $Phase3RQaReport `
  --desktop-mp4 (Join-Path $Phase3RMediaRoot 'phase-3-crt-opening-desktop-h264.mp4') `
  --desktop-webm (Join-Path $Phase3RMediaRoot 'phase-3-crt-opening-desktop-vp9.webm') `
  --mobile-mp4 (Join-Path $Phase3RMediaRoot 'phase-3-crt-opening-mobile-h264.mp4') `
  --mobile-webm (Join-Path $Phase3RMediaRoot 'phase-3-crt-opening-mobile-vp9.webm') `
  --headed `
  --record-candidate desktop-webm `
  --record-video $Phase3RLabRecording `
  --require-browser `
  --expected-gop 12
```

The harness serves only the supplied media through an in-memory loopback server and separates three authorities: managed Chromium for deterministic seek/decode measurements, normal non-debugged Chrome for Page Visibility and focused playback, and a headed Chromium context for the recorded media-lab controls. Native visibility is retry-hardened: at most three attempts, retry only after partial-inconclusive telemetry, and a fresh temporary profile for every attempt.

The final report is a complete PASS: 4/4 probes, 4/4 Chromium candidates, 160/160 measured seeks, four genuine visible → hidden → visible transitions, focused presentation of 29.977–30.266 fps, and zero displayed dropped or corrupted frames. The actual media-lab run passes 33 measurements and 284 presented-frame deltas with zero drops or corruption.

### Stage 2 — safe reuse and compact final packaging

```powershell
& $Phase3RPythonExe -B $Phase3RPackager `
  --desktop-frames $Phase3RDesktopFrames `
  --mobile-frames $Phase3RMobileFrames `
  --ffmpeg $Phase3RFfmpegExe `
  --ffprobe $Phase3RFfprobeExe `
  --candidate-authority-sha256 $Phase3RCandidateAuthoritySha `
  --media-qa-report $Phase3RQaReport `
  --media-lab-recording $Phase3RLabRecording `
  --render-determinism-report $Phase3RDeterminismReport `
  --review-zip $Phase3RReviewZip `
  --repo-root $Phase3RRepoRoot
```

Stage 2 never silently re-encodes. It re-verifies the raw sequences, exact four candidates, Stage-1 authority, source/protocol hashes, QA report, headed recording, and determinism report. It replaces obsolete CRT-specific evidence, retains only the accepted conduction sheet and three posters, builds the 29-file tracked review tree, writes the post-production manifest, and creates a 35-entry outside-Git ZIP containing all four candidates but no raw sequence.

### Stage 3 — post-push external review identity

```powershell
$Phase3RFinalPushedSha = (& git -C $Phase3RRepoRoot rev-parse HEAD).Trim()
& $Phase3RPythonExe -B $Phase3RPackager `
  --finalize-external-only `
  --review-zip $Phase3RReviewZip `
  --repo-root $Phase3RRepoRoot `
  --branch-sha $Phase3RFinalPushedSha
```

Run Stage 3 only after the artifact commit is pushed with an upstream. It requires a clean tracked worktree, local/upstream/remote SHA parity, exact tracked-file identity, and the exact Stage-2 source/candidate/review inventory. It rewrites only the external ZIP, external manifest, and SHA-256 sidecar, and cannot change a tracked file.

## Validation gates

### Before full rendering

- Accepted Phase 0 and Phase 3 source hashes match exactly.
- Phase 3-R change ledger exists, stays inside the screen allowlist, and contains no silent CRT or cinematic redesign.
- Blender version/build and selected device are recorded.
- Cycles, OIDN, AgX, look, seed, samples, bounces, fps, frames, and resolution are exact.
- External libraries, images, paths, missing files, third-party assets, private references, and cache dependencies are zero.
- The validator passes 51/51, the canonical frozen signature is exact before/after, and the independent accepted-Phase-3 snapshot matches exactly.
- Frames 1, 116, 121, 126, 132, 144, 154, 162, 182, 196, 218, 250, 262, 265, and 270 match the unchanged timeline contract.

### After rendering

- Exactly 270 contiguous frames exist; no duplicate, missing, or zero-byte frame is present.
- Fresh-process frames `1,126,144,162,196,250,262,270` match each master in authored state for both variants.
- Forward and reverse reviews are coherent.
- Frame 1 has zero environmental magenta.
- Frame 126 reads as neutral physical phosphor rather than a pink vector line.
- Frame 144 reads as a filled picture field rather than separate glowing bars.
- Frames 182/196 integrate readable Quantum content within the phosphor and glass.
- Frame 250 retains faint but receding CRT texture; frame 270 is nearly digital, text-free black with barely perceptible scan structure.
- Frame 270 matches the byte-unchanged Phase 3 portal-alignment contract and contains no blank bridge or duplicate semantic text.
- Frame dimensions, color transform, byte sizes, and hashes are recorded.

### After encoding

- H.264 and VP9 candidates derive from the same approved master frames.
- ffprobe reports exactly one video stream and zero audio/subtitle/data/attachment streams.
- Dimensions, 30 fps cadence, 270 frames, duration, pixel format, codec, GOP, bitrate, bytes, and hashes match the manifest.
- Browser tests cover first frame, final frame, 10 random seeks, nearby seeks, repeated forward/reverse seeks, rapid alternating seeks, and hidden-tab resume.
- Native-visibility retries occur only for partial-inconclusive telemetry, use a fresh profile, and stop after at most three attempts.
- Focused native playback presents at least 90% of the authored frame rate and records zero corrupted frames; decoder drop counters remain evidence rather than an impossible zero-drop machine claim.
- Dark gradients, fine raster texture, phosphor softness, thin type, and final black level survive H.264 and VP9 without visible shimmer, moiré, ringing, or banding at normal size.
- The final report passes all four candidates, and its file hashes match both the post-production manifest and the actual media bytes.
- Isolated candidates retain the manifest label `PHASE 3-R PRODUCTION CANDIDATE — HUMAN REVIEW REQUIRED`; no candidate is selected for integration.

## Completed production records

The Phase 3-R build and validation ledgers bind the current repair authority. The isolated package now includes, without retroactively changing accepted Phase 0 or Phase 3 evidence:

- `docs/planning/PHASE_3_MEDIA_MANIFEST.md` with measured production values;
- render configuration, full frame inventories, and sparse fresh-process determinism evidence;
- exact candidate settings, ffprobe records, sizes, and SHA-256 identities;
- isolated Chromium, native Page Visibility, focused playback, and real media-lab measurements;
- forward and reverse review evidence;
- codec-decoded comparisons and the Phase 3-to-Phase 2B handoff comparison;
- a compact outside-Git human-review transfer package with the exact four selected candidates and no raw frame sequence.

After the artifact commit is pushed, the external-only finalizer must bind the review ZIP manifest and hash sidecar to that exact upstream SHA. This operational step writes no tracked files. Direct human visual review remains required; none of these machine or self-review records authorizes integration or Phase 4.

## Required final human-gate wording

The Phase 3-R handoff must end with the following lines exactly, with no self-authorization of Phase 4 and no text after the completion line:

```text
PROVING FIELD + SPIRAL CONDUCTION:
ACCEPT

CRT POWER-ON + SCREEN AUTHENTICITY:
ACCEPT / REPAIR / REDIRECT

CAMERA + PORTAL ALIGNMENT:
ACCEPT

MOBILE + REDUCED-MOTION CONTINUITY:
ACCEPT / REPAIR / REDIRECT

MEDIA PERFORMANCE + PRODUCTION SAFETY:
ACCEPT / REPAIR / REDIRECT

PHASE 3-R CRT AUTHENTICITY REPAIR COMPLETE — AWAITING HUMAN REVIEW
```
