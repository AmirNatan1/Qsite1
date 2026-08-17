# Phase 0 toolchain and encoded-media audit

Status: **historical pre-authorization baseline; not the current toolchain state**

Current-state authority: [TOOLCHAIN_3D_REPAIR.md](./TOOLCHAIN_3D_REPAIR.md). The findings below accurately record the initial environment before the authorized portable repair installation and are retained as decision history.

Audit date: 2026-08-17

Scope: read-only installed-tool discovery plus one original browser-native encode/seek spike
System-level installs performed during this baseline audit: none

## Initial installed-tool result

| Capability | Result | Evidence |
| --- | --- | --- |
| Blender or equivalent DCC | Not found | No matching command; no Blender executable in audited common locations; no Blender, Cinema 4D, Maya, Houdini, 3ds Max, DaVinci Resolve, or HandBrake entry in the audited uninstall registries |
| FFmpeg | Not found | No `ffmpeg` command or executable in audited common locations |
| ffprobe | Not found | No `ffprobe` command |
| H.264 system encoder | Baseline: not established | Baseline FFmpeg/equivalent absent; no system encode claim was made |
| VP9 system encoder | Baseline: not established | Baseline FFmpeg/equivalent absent; no system encode claim was made |
| Browser MediaRecorder | Available in the tested in-app Chromium runtime | Runtime capability test returned `true` |
| Canvas capture | Available in the tested in-app Chromium runtime | `HTMLCanvasElement.captureStream()` capability test returned `true` |
| Browser VP9 WebM | Available in the tested runtime | `MediaRecorder.isTypeSupported("video/webm;codecs=vp9")` returned `true` |
| Browser VP8 WebM | Available in the tested runtime | `MediaRecorder.isTypeSupported("video/webm;codecs=vp8")` returned `true` |
| Browser H.264 MP4 | Available in the tested runtime | `MediaRecorder.isTypeSupported("video/mp4;codecs=avc1.42E01E")` returned `true`; no H.264 artifact was produced |
| glTF tooling | Not found | No `gltfpack`, glTF Transform CLI, `toktx`, KTX CLI, or `basisu` command |
| General image CLI tools | Not found | No ImageMagick, `cwebp`, `avifenc`, or `pngquant` command |
| Build-time image library | Available transitively | Astro 7.2.2 resolves Sharp 0.35.3; no separate image integration is installed |
| Git LFS | Installed, not configured for this repository | Git LFS 3.7.1; no `.gitattributes`; remote upload/download access reported as none |
| Node/npm | Available | Node 24.18.0 and npm 11.16.0 in the implementation environment |

## Real browser-native encode and seek spike

This audit does not substitute a browser recording for a production 3D/codec pipeline. The resulting file is the required low-resolution desktop animatic and real seek spike: it proves that the premium 2.5D fallback can be authored, captured, encoded, loaded, and bidirectionally sought with the already available browser runtime.

| Field | Result |
| --- | --- |
| Source | Original deterministic 640 × 400 Canvas rendering of the Spiral Conduction study |
| Capture | Canvas capture stream at 24fps |
| Encoder | Browser `MediaRecorder` |
| Output | VP9 WebM |
| Authored duration | 3,000ms |
| Encoded duration | 2.967s |
| Encoded bytes | 123,712 |
| Seek order | 0%, 25%, 50%, 75%, 99%, 50%, 10% |
| Maximum `seeked` event latency | 52.0ms |
| Display callback observation | 2 of 7 paused seeks produced a video-frame callback before the explicit 500ms timeout |
| Maximum observed display callback latency | 50.5ms |

The missing five video-frame callbacks are not reported as display-latency measurements. Their display values are `null` in the machine-readable record. All seven seek targets emitted `seeked`. This result is a low-resolution feasibility observation in one Chromium runtime, not a production performance budget, multi-browser result, keyframe-cadence validation, or mobile-memory claim.

Committed evidence:

- `encoded-seek-spike-vp9.webm`
- `encoded-seek-spike-report.json`
- `encoded-seek-spike-browser.png`
- reproducible source at `prototypes/phase-0-spiral-field/media-spike.html` and `media-spike.js`

At the time of this baseline audit, `ffprobe` was unavailable, so codec/container facts for the browser-native spike were taken from the browser encoder declaration and successful browser playback. The later 3D repair supplied a verified portable ffprobe and controlled encode pipeline; its current evidence is recorded separately in `TOOLCHAIN_3D_REPAIR.md` and `artifacts/original/phase-0-3d-repair/manifests/`.

## Repository and hosting limits

- GitHub recommends a 1MB maximum single object, enforces a 100MB single-object limit, recommends a repository under 10GB on disk, and enforces a 2GB push limit: <https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits>.
- Cloudflare Pages currently permits at most 25MiB per static asset and 20,000 files on the Free plan (up to 100,000 files on eligible paid plans): <https://developers.cloudflare.com/pages/platform/limits/>.
- Phase 0 imported media remain below 4.2MB per file. The real seek spike remains below 125KB. Git LFS is not required for the committed Phase 0 set.

## Historical missing-toolchain finding and superseded pinned request

At the time of this baseline audit, a production-quality original 3D Field Unit, rendered animatic, controlled H.264/VP9 encode matrix, and independent ffprobe verification were not feasible in the then-installed environment.

The baseline therefore proposed the following versions. This request is retained only as historical decision evidence and must not be used as current installation guidance; the later authorized repair instead verified portable Blender 5.2.0 LTS and FFmpeg/ffprobe 9.0.1 Essentials.

1. **Blender 4.5.12 LTS, Windows x64 portable build** — GNU GPL; use one LTS line for the project. Reserve approximately 400MB for the download and 1.5GB extracted. Verify the publisher checksum before use. Blender documentation recommends one LTS version for a production project and notes two years of LTS fixes: <https://docs.blender.org/manual/en/4.5/advanced/deploying_blender.html>.
2. **FFmpeg 8.1.2, Windows x64 build with ffprobe, libx264, and libvpx-vp9** — FFmpeg core is LGPL 2.1-or-later, while a build with GPL components such as libx264 is distributed under the applicable GPL terms. Reserve up to 250MB for a compressed build and 1GB extracted; confirm the actual provider artifact and license configuration before installation. The official source release is: <https://ffmpeg.org/download.html>.

The footprint numbers above were conservative planning allocations, not observed installs. No download or installation occurred during this baseline audit.

## Historical feasibility classification

- Original production 3D at baseline: **unverified and blocked by the then-absent DCC/FFmpeg toolchain or an external producer**.
- Production controlled multi-codec encode/ffprobe matrix at baseline: **blocked by the then-absent FFmpeg/ffprobe**.
- Premium browser-native 2.5D: **feasible and shippable in principle without a system-level installation**, subject to the human creative gate and later cross-browser, mobile-memory, lifecycle, accessibility, and performance validation.

Current Phase 0 classification: the portable production toolchain, original Blender source, 40 canonical renders, six H.264/VP9 encodes, independent ffprobe records, and deterministic browser seek evidence are verified. The creative package remains pending human review and is not accepted launch media.
