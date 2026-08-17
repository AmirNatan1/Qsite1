# Phase 0 toolchain and encoded-media audit

Audit date: 2026-08-17

Scope: read-only installed-tool discovery plus one original browser-native encode/seek spike
System-level installs performed: none

## Installed-tool result

| Capability | Result | Evidence |
| --- | --- | --- |
| Blender or equivalent DCC | Not found | No matching command; no Blender executable in audited common locations; no Blender, Cinema 4D, Maya, Houdini, 3ds Max, DaVinci Resolve, or HandBrake entry in the audited uninstall registries |
| FFmpeg | Not found | No `ffmpeg` command or executable in audited common locations |
| ffprobe | Not found | No `ffprobe` command |
| H.264 system encoder | Not established | FFmpeg/equivalent absent; no system encode claim is made |
| VP9 system encoder | Not established | FFmpeg/equivalent absent; no system encode claim is made |
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

`ffprobe` is unavailable, so codec/container facts are taken from the browser encoder declaration and successful browser playback. A later production-media phase still requires an external probe and controlled encode pipeline.

## Repository and hosting limits

- GitHub recommends a 1MB maximum single object, enforces a 100MB single-object limit, recommends a repository under 10GB on disk, and enforces a 2GB push limit: <https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits>.
- Cloudflare Pages currently permits at most 25MiB per static asset and 20,000 files on the Free plan (up to 100,000 files on eligible paid plans): <https://developers.cloudflare.com/pages/platform/limits/>.
- Phase 0 imported media remain below 4.2MB per file. The real seek spike remains below 125KB. Git LFS is not required for the committed Phase 0 set.

## Missing production toolchain and pinned request

A production-quality original 3D Field Unit, rendered animatic, controlled H.264/VP9 encode matrix, and independent ffprobe verification are not feasible in the current installed environment.

If the human creative gate selects original 3D production, request a separately authorized installation or external-producer contract pinned to:

1. **Blender 4.5.12 LTS, Windows x64 portable build** — GNU GPL; use one LTS line for the project. Reserve approximately 400MB for the download and 1.5GB extracted. Verify the publisher checksum before use. Blender documentation recommends one LTS version for a production project and notes two years of LTS fixes: <https://docs.blender.org/manual/en/4.5/advanced/deploying_blender.html>.
2. **FFmpeg 8.1.2, Windows x64 build with ffprobe, libx264, and libvpx-vp9** — FFmpeg core is LGPL 2.1-or-later, while a build with GPL components such as libx264 is distributed under the applicable GPL terms. Reserve up to 250MB for a compressed build and 1GB extracted; confirm the actual provider artifact and license configuration before installation. The official source release is: <https://ffmpeg.org/download.html>.

The footprint numbers are conservative planning allocations, not observed installs. No download or installation occurred in Phase 0.

## Feasibility classification

- Original production 3D: **unverified and blocked by the absent DCC/FFmpeg toolchain or an external producer**.
- Production controlled multi-codec encode/ffprobe matrix: **blocked by absent FFmpeg/ffprobe**.
- Premium browser-native 2.5D: **feasible and shippable in principle without a system-level installation**, subject to the human creative gate and later cross-browser, mobile-memory, lifecycle, accessibility, and performance validation.
