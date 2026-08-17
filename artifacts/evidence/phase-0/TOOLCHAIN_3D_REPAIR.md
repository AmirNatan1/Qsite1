# Phase 0 3D Repair Toolchain Evidence

Status: verified offline production toolchain
Retrieval and verification date: 2026-08-17
Scope: Phase 0 Field Unit and cinematic art-direction repair only

## Boundary

Blender, FFmpeg and ffprobe are installed as per-user portable production tools outside the Qsite1 repository. They are not website runtime dependencies, npm dependencies, Cloudflare dependencies or committed binaries. No system-wide installer, package manager, registry integration, file association, user/system `PATH` change, Worker runtime or deployment service was added.

Paths in this record use `%LOCALAPPDATA%` deliberately. No private username or absolute user-profile path is stored in Git.

## Blender

| Field | Verified value |
| --- | --- |
| Product | Blender 5.2.0 LTS |
| Build reference | `fbe6228777e7` |
| Release status | Stable long-term-support release; no nightly or unofficial repack |
| Architecture/package | Windows x64 portable ZIP |
| Archive | `%LOCALAPPDATA%\QuantumHubTools\downloads\blender-5.2.0-windows-x64.zip` |
| Archive bytes | 404,954,661 |
| Archive SHA-256 | `2d184b626c001692c362291911293b6a297179d618d95e9e9192c3a80318adc4` |
| Executable | `%LOCALAPPDATA%\QuantumHubTools\blender-5.2.0\blender-5.2.0-windows-x64\blender.exe` |
| Executable SHA-256 | `0060916d6921eb4d46c57254609d805a2ea711917399051391a52ba14beb6327` |
| Authenticode | Valid; signer/publisher `Blender Foundation` |
| Portable configuration | `portable` directory present beside `blender.exe` |
| Extracted footprint | 6,947 files; 954,423,854 bytes |
| License | GNU GPL 3.0 or later for the binary distribution |
| CLI/render verification | Exact executable launches headlessly; factory-startup EEVEE render succeeded |

### Blender provenance chain

1. [Blender 5.2 LTS official release page](https://www.blender.org/download/releases/5-2/) identifies the stable LTS release, released 14 July 2026 and supported until July 2028.
2. The archive came from Blender Foundation's [official Windows x64 ZIP](https://download.blender.org/release/Blender5.2/blender-5.2.0-windows-x64.zip).
3. The expected hash came from Blender Foundation's [official 5.2.0 SHA-256 manifest](https://download.blender.org/release/Blender5.2/blender-5.2.0.sha256).
4. The downloaded archive's computed SHA-256 matched the official manifest before extraction.
5. The extracted executable's Authenticode signature and SHA-256 were recorded before production use.
6. Blender's [official Windows installation documentation](https://docs.blender.org/manual/en/5.2/getting_started/installing/windows.html) supports the non-admin ZIP installation, and its [portable-layout documentation](https://docs.blender.org/manual/en/5.2/advanced/blender_directory_layout.html#portable-installation) specifies a `portable` directory beside the executable.

### Blender license caveat

Blender's [official license page](https://www.blender.org/about/license/) states that binary distributions use GNU GPL 3.0 or later and that artwork, rendered images and movie files, `.blend` files and other authored data remain the creator's property. Python scripts published against Blender's integral `bpy` API require a GPL-compatible licensing review. No Blender binary or bundled library is redistributed by Qsite1.

## FFmpeg and ffprobe

| Field | Verified value |
| --- | --- |
| Product | FFmpeg 9.0.1 Essentials build |
| Provider | Gyan Doshi / gyan.dev, reached from FFmpeg's official Windows-download channel |
| Build type | Stable release; Windows x64; static UCRT64 build |
| Archive | `%LOCALAPPDATA%\QuantumHubTools\downloads\ffmpeg-9.0.1-essentials_build.zip` |
| Archive bytes | 111,253,802 |
| Archive SHA-256 | `fec81ae03971d9dd4be3ebe02e263bd2ec1d789483f931bdba5f5715e65da2e9` |
| FFmpeg executable | `%LOCALAPPDATA%\QuantumHubTools\ffmpeg-9.0.1\ffmpeg-9.0.1-essentials_build\bin\ffmpeg.exe` |
| FFmpeg executable SHA-256 | `72a489eccd008c2ec2c0a5856c5c75bc3d8bbfa90166c4566865c246445e6aa3` |
| ffprobe executable | `%LOCALAPPDATA%\QuantumHubTools\ffmpeg-9.0.1\ffmpeg-9.0.1-essentials_build\bin\ffprobe.exe` |
| ffprobe executable SHA-256 | `19202b23c0043f15ad1b7bce2344f406fd52bd6efd8f995ce02e7392a1cec52f` |
| Authenticode | Unsigned provider binaries; integrity anchored to the version-pinned archive checksum |
| Extracted footprint | 45 files; 321,521,840 bytes |
| License | GPLv3 for this static Essentials distribution |
| H.264 encoder | `libx264` verified |
| VP9 encoder | `libvpx-vp9` verified |
| Non-free configuration | `--enable-nonfree` absent |
| CLI verification | `ffmpeg -version`, `ffprobe -version`, build configuration and encoder inventory succeeded |

### FFmpeg provenance chain

1. FFmpeg's [official download page](https://ffmpeg.org/download.html) identified 9.0.1 as the current stable release on the retrieval date and explicitly linked gyan.dev as a Windows binary provider.
2. The [FFmpeg-linked gyan.dev build page](https://www.gyan.dev/ffmpeg/builds/) identified the 9.0.1 release Essentials package as sufficient for Blender-style production and reported a 64-bit static GPLv3 build.
3. The download resolved to the provider's version-pinned [9.0.1 Essentials ZIP](https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.1-essentials_build.zip), not a nightly alias.
4. The expected hash came from the matching [version-pinned SHA-256 record](https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.1-essentials_build.zip.sha256).
5. The downloaded archive's computed SHA-256 matched that provider record before extraction.
6. The provider associated the build with FFmpeg source commit `bf1b838f2ab88b4f8fd83443325c782ea0e0f7fa`.
7. The extracted binaries independently reported 9.0.1, GPLv3, their build configuration and the required encoders.

### FFmpeg license and codec caveat

This static package is GPLv3 because it enables GPL components including libx264. It remains an offline production tool outside Git and is not redistributed with the site. Encoded output does not automatically inherit the FFmpeg binary's GPL, but codec patent and commercial-use considerations are separate from copyright licensing; FFmpeg's [official legal guidance](https://ffmpeg.org/legal.html) specifically calls out H.264 patent considerations. This record is technical provenance, not legal advice.

## Footprint and isolation summary

| Measure | Verified value |
| --- | ---: |
| Download archives retained outside Git | 2 files; 516,208,463 bytes |
| Extracted portable installations outside Git | 6,992 files; 1,275,945,694 bytes |
| Combined archive plus extracted footprint outside Git | 1,792,154,157 bytes |
| Tool binaries committed to Qsite1 | 0 |
| Tool binaries published by Astro/Cloudflare | 0 |
| System or user `PATH` mutations | 0 |
| Runtime website dependencies | 0 |

Production commands invoke exact executable paths or process-local variables. The installation is isolated from Qsite1, retains the provider documentation and licenses, and introduces no package, add-on, asset-store or online-library dependency.
