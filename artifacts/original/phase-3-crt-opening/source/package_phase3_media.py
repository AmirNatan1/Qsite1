r"""Deterministic Phase 3 delivery, evidence, and review-ZIP packager.

The production PNG sequences are deliberately consumed from outside the Git
worktree.  Only compressed delivery candidates and compact review evidence are
written into the isolated Phase 3 package.  The external ZIP never contains a
raw frame sequence.

Example (PowerShell)::

    python .\artifacts\original\phase-3-crt-opening\source\package_phase3_media.py `
      --desktop-frames C:\render\phase3\desktop `
      --mobile-frames C:\render\phase3\mobile `
      --ffmpeg C:\tools\ffmpeg\bin\ffmpeg.exe `
      --ffprobe C:\tools\ffmpeg\bin\ffprobe.exe `
      --review-zip C:\review\phase-3-crt-opening-human-review.zip

After the generated artifacts are committed and pushed, finalize the external
review identity without touching tracked files::

    python .\artifacts\original\phase-3-crt-opening\source\package_phase3_media.py `
      --finalize-external-only `
      --review-zip C:\review\phase-3-crt-opening-human-review.zip

Requires Pillow.  The expected input names are ``phase3-desktop-%04d.png`` and
``phase3-mobile-%04d.png`` for frames 1 through 270 inclusive.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import textwrap
import zipfile
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from typing import Any, Iterable, Sequence

try:
    from PIL import (
        Image,
        ImageChops,
        ImageDraw,
        ImageEnhance,
        ImageFilter,
        ImageFont,
        ImageOps,
        ImageStat,
    )
except ImportError as exc:  # pragma: no cover - environment guidance
    raise SystemExit(
        "Pillow is required to build Phase 3 review evidence. Install Pillow "
        "in the selected Python runtime, then rerun this script."
    ) from exc


FPS = 30
FRAME_START = 1
FRAME_END = 270
FRAME_COUNT = FRAME_END - FRAME_START + 1
DURATION_SECONDS = FRAME_COUNT / FPS
GOP = 12
RAW_SEQUENCE_FILENAME = re.compile(r"^phase3-(desktop|mobile)-\d{4}\.png$", re.IGNORECASE)

DESKTOP_SIZE = (1920, 1080)
MOBILE_SIZE = (720, 1280)
DESKTOP_REVIEW_SIZE = (1280, 720)
MOBILE_REVIEW_SIZE = (360, 640)

ACCEPTED_CRT_SHA256 = "3027c4c46e2b829fd97ee9a3a47558e43adda47abcc488420faa0f087bd720a7"
ACCEPTED_CRT_RELATIVE = Path(
    "artifacts/original/phase-0-4-crt-television/source/quantum-signal-television-v1.blend"
)
DERIVATIVE_CRT_RELATIVE = Path(
    "artifacts/original/phase-3-crt-opening/source/quantum-signal-television-phase3-opening.blend"
)
PHASE2B_ENTRY_SHEET_RELATIVE = Path(
    "artifacts/evidence/phase-2b/review/phase-2b-desktop-production-keyframes.png"
)
PHASE2B_ENTRY_SHEET_SHA256 = "a3a1d38a88771d31c03839c82cf5f9e6163057925ed7f5cbe5dc5cdc70bce2bd"

EVENTS = {
    1: "DORMANCY",
    31: "CONDUCTION START",
    72: "CONDUCTION MIDPOINT",
    104: "CURRENT NEAR CRT",
    112: "CURRENT ARRIVAL",
    116: "INDICATOR ON",
    121: "HORIZONTAL LINE START",
    126: "HORIZONTAL LINE PEAK",
    133: "RASTER EXPANSION START",
    144: "RASTER EXPANSION",
    154: "RASTER EXPANSION END",
    162: "SETTLING / DEGAUSS",
    167: "SCANLINES VISIBLE",
    176: "BLACK STABILIZED",
    182: "QUANTUM BRAND",
    196: "QUANTUM ROUTE",
    201: "STATUS START",
    210: "SIGNAL STABILIZED",
    218: "CAMERA EARLY APPROACH",
    232: "FRONT ALIGNMENT",
    236: "CAMERA MID APPROACH",
    246: "CABINET NEAR EXIT",
    250: "CRT FILLS VIEWPORT",
    252: "BEZEL EXIT",
    258: "LATE FLATTENING",
    262: "PORTAL NEAR-FINAL",
    270: "PORTAL HANDOFF",
}

CONDUCTION_FRAMES = (1, 31, 42, 60, 72, 90, 104, 112)
STARTUP_FRAMES = (112, 116, 126, 144, 162, 167, 176, 182)
CAMERA_PORTAL_FRAMES = (201, 210, 218, 232, 246, 252, 262, 270)
PORTAL_ALIGNMENT_FRAMES = (218, 232, 246, 258, 270)
MOBILE_FRAMES = (1, 72, 126, 222, 270)
MOBILE_HIGH_RISK_FRAMES = (1, 126, 270)
DESKTOP_FULL_RES_FRAMES = (1, 42, 72, 104, 116, 126, 144, 162, 182, 196, 218, 236, 250, 262, 270)
MOBILE_FULL_RES_FRAMES = (1, 72, 126, 222, 270)

CODEC_RISK_FRAMES: dict[str, tuple[tuple[int, str], ...]] = {
    "desktop": (
        (1, "DORMANT / DARK GRADIENT"),
        (72, "CONDUCTION / MAGENTA"),
        (196, "SCANLINE / TYPE"),
        (236, "CLOSE APPROACH"),
        (270, "HANDOFF"),
    ),
    "mobile": (
        (1, "DORMANT / DARK GRADIENT"),
        (72, "CONDUCTION / MAGENTA"),
        (196, "SCANLINE / TYPE"),
        (222, "CLOSE APPROACH"),
        (270, "HANDOFF"),
    ),
}

SCRUB_SEGMENTS: tuple[tuple[str, tuple[int, ...]], ...] = (
    ("FORWARD SCRUB", (1, 31, 61, 91, 121, 151, 181, 211, 241, 270)),
    ("FAST FORWARD JUMP", (1, 90, 180, 270)),
    ("REVERSE SCRUB", (270, 240, 210, 180, 150, 120, 90, 60, 31, 1)),
    ("RAPID ALTERNATING SEEK", (31, 240, 60, 262, 104, 218, 42, 270)),
    ("JUMP DIRECTLY TO PORTAL", (270,)),
    ("JUMP BACK TO CONDUCTION", (72,)),
)

# Exact frozen Phase 2B DOM rectangles from PHASE_3_PORTAL_ALIGNMENT_CONTRACT.md.
# Values are x, y, width, height in CSS pixels at scrollY=0.
VIEWPORT_ZONES: tuple[dict[str, Any], ...] = (
    {
        "size": (1440, 900),
        "variant": "desktop",
        "header": 121.31,
        "h1": (48.0, 347.41, 1344.0, 316.73),
        "routes": (48.0, 802.13, 1344.0, 86.19),
    },
    {
        "size": (1366, 650),
        "variant": "desktop",
        "header": 121.31,
        "h1": (48.0, 327.39, 1270.0, 149.75),
        "routes": (48.0, 627.13, 1270.0, 86.19),
    },
    {
        "size": (1280, 800),
        "variant": "desktop",
        "header": 116.48,
        "h1": (48.0, 308.67, 1184.0, 281.53),
        "routes": (48.0, 702.30, 1184.0, 86.19),
    },
    {
        "size": (1024, 768),
        "variant": "desktop",
        "header": 100.25,
        "h1": (40.95, 241.02, 942.08, 351.44),
        "routes": (40.95, 655.67, 942.08, 86.19),
    },
    {
        "size": (390, 844),
        "variant": "mobile",
        "header": 100.25,
        "h1": (16.0, 315.23, 370.08, 184.81),
        "routes": (16.0, 661.88, 370.08, 182.38),
    },
    {
        "size": (360, 800),
        "variant": "mobile",
        "header": 100.25,
        "h1": (16.0, 290.44, 341.61, 170.63),
        "routes": (16.0, 598.09, 341.61, 202.16),
    },
    {
        "size": (320, 800),
        "variant": "mobile",
        "header": 100.25,
        "h1": (16.0, 303.22, 295.56, 147.63),
        "routes": (16.0, 600.66, 295.56, 199.59),
    },
    {
        "size": (844, 390),
        "variant": "mobile",
        "header": 100.25,
        "h1": (33.77, 272.14, 373.75, 184.31),
        "routes": (455.52, 277.42, 354.72, 173.77),
    },
)

BG = "#050708"
PANEL_BG = "#090c0d"
LABEL_BG = "#101516"
TEXT = "#f3f5f4"
MUTED = "#9da8a6"
LINE = "#394443"
MAGENTA = "#d82b72"


@dataclass(frozen=True)
class Panel:
    image: Image.Image
    label: str


def normalized_progress(frame: int) -> float:
    return round((frame - FRAME_START) / (FRAME_END - FRAME_START), 6)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def atomic_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.stem}.phase3-tmp{path.suffix}")
    temporary.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    os.replace(temporary, path)


def atomic_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.stem}.phase3-tmp{path.suffix}")
    temporary.write_text(content, encoding="utf-8", newline="\n")
    os.replace(temporary, path)


def atomic_save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.stem}.phase3-tmp.png")
    image.convert("RGB").save(temporary, "PNG", compress_level=9, optimize=False)
    os.replace(temporary, path)


def run(command: Sequence[str], cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        [str(part) for part in command],
        cwd=str(cwd) if cwd else None,
        check=False,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if completed.returncode != 0:
        rendered = subprocess.list2cmdline([str(part) for part in command])
        raise RuntimeError(
            f"Command failed ({completed.returncode}): {rendered}\n"
            f"STDOUT:\n{completed.stdout[-6000:]}\nSTDERR:\n{completed.stderr[-6000:]}"
        )
    return completed


def ensure_outside_repository(path: Path, repository: Path, label: str) -> None:
    resolved = path.resolve()
    repo = repository.resolve()
    if resolved == repo or repo in resolved.parents:
        raise ValueError(f"{label} must remain outside the Git worktree: {resolved}")


def frame_path(root: Path, variant: str, frame: int) -> Path:
    return root / f"phase3-{variant}-{frame:04d}.png"


def validate_sequence(
    root: Path,
    variant: str,
    expected_size: tuple[int, int],
) -> dict[str, Any]:
    if not root.is_dir():
        raise FileNotFoundError(f"Missing {variant} frame directory: {root}")

    sequence_digest = hashlib.sha256()
    boundary: dict[str, dict[str, Any]] = {}
    total_bytes = 0
    for frame in range(FRAME_START, FRAME_END + 1):
        path = frame_path(root, variant, frame)
        if not path.is_file():
            raise FileNotFoundError(f"Missing required {variant} frame {frame}: {path}")
        with Image.open(path) as image:
            if image.format != "PNG":
                raise ValueError(f"Expected PNG input, got {image.format!r}: {path}")
            if image.size != expected_size:
                raise ValueError(
                    f"{variant} frame {frame} is {image.size}, expected {expected_size}: {path}"
                )
        frame_hash = sha256_file(path)
        size = path.stat().st_size
        total_bytes += size
        sequence_digest.update(path.name.encode("utf-8"))
        sequence_digest.update(b"\0")
        sequence_digest.update(frame_hash.encode("ascii"))
        sequence_digest.update(b"\0")
        sequence_digest.update(str(size).encode("ascii"))
        sequence_digest.update(b"\n")
        if frame in (FRAME_START, FRAME_END):
            boundary[str(frame)] = {"filename": path.name, "bytes": size, "sha256": frame_hash}

    expected_names = {f"phase3-{variant}-{frame:04d}.png" for frame in range(1, 271)}
    actual_names = {path.name for path in root.glob(f"phase3-{variant}-*.png")}
    extras = sorted(actual_names - expected_names)
    if extras:
        raise ValueError(
            f"Unexpected {variant} sequence files would make source identity ambiguous: {extras[:10]}"
        )

    return {
        "externalRoot": str(root.resolve()),
        "filenamePattern": f"phase3-{variant}-%04d.png",
        "dimensions": {"width": expected_size[0], "height": expected_size[1]},
        "fps": FPS,
        "frameStart": FRAME_START,
        "frameEnd": FRAME_END,
        "frameCount": FRAME_COUNT,
        "totalBytes": total_bytes,
        "sequenceSha256": sequence_digest.hexdigest(),
        "boundaryFrames": boundary,
    }


def ffmpeg_version(binary: Path) -> str:
    return run([str(binary), "-version"]).stdout.splitlines()[0].strip()


def encode_atomic(ffmpeg: Path, arguments: Sequence[str], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(f"{output.stem}.phase3-tmp{output.suffix}")
    if temporary.exists():
        temporary.unlink()
    try:
        run([str(ffmpeg), "-hide_banner", "-loglevel", "error", "-y", *arguments, str(temporary)])
        os.replace(temporary, output)
    finally:
        if temporary.exists():
            temporary.unlink()


def input_sequence_arguments(root: Path, variant: str) -> list[str]:
    return [
        "-framerate",
        str(FPS),
        "-start_number",
        str(FRAME_START),
        "-i",
        str(root / f"phase3-{variant}-%04d.png"),
        "-frames:v",
        str(FRAME_COUNT),
        "-an",
        "-map_metadata",
        "-1",
    ]


def h264_arguments(crf: int, scale: tuple[int, int] | None = None) -> list[str]:
    filters = []
    if scale:
        filters.append(f"scale={scale[0]}:{scale[1]}:flags=lanczos")
    filters.append("format=yuv420p")
    return [
        "-vf",
        ",".join(filters),
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        str(crf),
        "-g",
        str(GOP),
        "-keyint_min",
        str(GOP),
        "-sc_threshold",
        "0",
        "-flags",
        "+cgop",
        "-x264-params",
        f"keyint={GOP}:min-keyint={GOP}:scenecut=0:open-gop=0",
        "-movflags",
        "+faststart",
        "-color_primaries",
        "bt709",
        "-color_trc",
        "bt709",
        "-colorspace",
        "bt709",
        "-color_range",
        "tv",
        "-fps_mode",
        "cfr",
        "-r",
        str(FPS),
    ]


def vp9_arguments(crf: int) -> list[str]:
    return [
        "-vf",
        "format=yuv420p",
        "-c:v",
        "libvpx-vp9",
        "-crf",
        str(crf),
        "-b:v",
        "0",
        "-deadline",
        "good",
        "-cpu-used",
        "2",
        "-row-mt",
        "1",
        "-tile-columns",
        "2",
        "-g",
        str(GOP),
        "-keyint_min",
        str(GOP),
        "-lag-in-frames",
        "0",
        "-auto-alt-ref",
        "0",
        "-color_primaries",
        "bt709",
        "-color_trc",
        "bt709",
        "-colorspace",
        "bt709",
        "-color_range",
        "tv",
        "-fps_mode",
        "cfr",
        "-r",
        str(FPS),
    ]


def probe_media(ffprobe: Path, path: Path) -> dict[str, Any]:
    result = run(
        [
            str(ffprobe),
            "-v",
            "error",
            "-count_frames",
            "-show_entries",
            (
                "stream=index,codec_type,codec_name,width,height,pix_fmt,r_frame_rate,"
                "avg_frame_rate,nb_frames,nb_read_frames,bit_rate:"
                "format=format_name,duration,size,bit_rate"
            ),
            "-of",
            "json",
            str(path),
        ]
    )
    data = json.loads(result.stdout)
    videos = [stream for stream in data.get("streams", []) if stream.get("codec_type") == "video"]
    audios = [stream for stream in data.get("streams", []) if stream.get("codec_type") == "audio"]
    if len(videos) != 1:
        raise ValueError(f"Expected exactly one video stream in {path}, found {len(videos)}")
    stream = videos[0]
    keys_data = json.loads(
        run(
            [
                str(ffprobe),
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_frames",
                "-show_entries",
                "frame=key_frame,best_effort_timestamp_time",
                "-of",
                "json",
                str(path),
            ]
        ).stdout
    )
    keyframes: list[int] = []
    for frame in keys_data.get("frames", []):
        if int(frame.get("key_frame", 0)) != 1:
            continue
        timestamp = float(frame.get("best_effort_timestamp_time", 0.0))
        keyframes.append(round(timestamp * FPS) + 1)
    intervals = [right - left for left, right in zip(keyframes, keyframes[1:])]
    frame_count = stream.get("nb_read_frames") or stream.get("nb_frames")
    return {
        "codec": stream.get("codec_name"),
        "width": int(stream.get("width", 0)),
        "height": int(stream.get("height", 0)),
        "pixelFormat": stream.get("pix_fmt"),
        "averageFrameRate": stream.get("avg_frame_rate"),
        "reportedFrameRate": stream.get("r_frame_rate"),
        "frameCount": int(frame_count) if frame_count not in (None, "N/A") else None,
        "durationSeconds": float(data.get("format", {}).get("duration", 0.0)),
        "bitrateBitsPerSecond": int(
            stream.get("bit_rate")
            or data.get("format", {}).get("bit_rate")
            or 0
        ),
        "containerFormats": data.get("format", {}).get("format_name"),
        "audioStreamCount": len(audios),
        "keyframeFrames": keyframes,
        "keyframeIntervals": intervals,
        "maximumKeyframeInterval": max(intervals, default=0),
    }


def verify_candidate(
    ffprobe: Path,
    path: Path,
    expected_size: tuple[int, int],
    expected_codec: str,
) -> dict[str, Any]:
    probe = probe_media(ffprobe, path)
    if (probe["width"], probe["height"]) != expected_size:
        raise ValueError(f"Incorrect dimensions for {path}: {probe}")
    if probe["codec"] != expected_codec:
        raise ValueError(f"Incorrect codec for {path}: {probe['codec']} != {expected_codec}")
    if probe["audioStreamCount"] != 0:
        raise ValueError(f"Audio is prohibited in Phase 3 media: {path}")
    if probe["frameCount"] != FRAME_COUNT:
        raise ValueError(f"Incorrect frame count for {path}: {probe['frameCount']} != {FRAME_COUNT}")
    if abs(probe["durationSeconds"] - DURATION_SECONDS) > 0.04:
        raise ValueError(f"Incorrect duration for {path}: {probe['durationSeconds']}")
    rate = Fraction(probe["averageFrameRate"])
    if rate != Fraction(FPS, 1):
        raise ValueError(f"Incorrect frame rate for {path}: {rate}")
    if not probe["keyframeFrames"] or probe["keyframeFrames"][0] != 1:
        raise ValueError(f"Candidate lacks an initial keyframe: {path}")
    expected_keyframes = list(range(FRAME_START, FRAME_END + 1, GOP))
    if probe["keyframeFrames"] != expected_keyframes:
        raise ValueError(
            f"Candidate does not use the required fixed {GOP}-frame GOP: {path}; "
            f"keyframes={probe['keyframeFrames']}"
        )
    return {
        **probe,
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
        "decodedFrameBytesRGBA": expected_size[0] * expected_size[1] * 4,
    }


def load_font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    candidates = [
        Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts" / ("arialbd.ttf" if bold else "arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for candidate in candidates:
        if candidate.is_file():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def cover(image: Image.Image, size: tuple[int, int], centering: tuple[float, float] = (0.5, 0.5)) -> Image.Image:
    return ImageOps.fit(
        image.convert("RGB"),
        size,
        method=Image.Resampling.LANCZOS,
        centering=centering,
    )


def contain(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    canvas = Image.new("RGB", size, PANEL_BG)
    fitted = ImageOps.contain(image.convert("RGB"), size, method=Image.Resampling.LANCZOS)
    left = (size[0] - fitted.width) // 2
    top = (size[1] - fitted.height) // 2
    canvas.paste(fitted, (left, top))
    return canvas


def frame_label(frame: int, prefix: str | None = None) -> str:
    event = EVENTS.get(frame, "TIMELINE STATE")
    base = (
        f"F{frame:03d} · {(frame - FRAME_START) / FPS:05.2f}s · "
        f"P{normalized_progress(frame):.4f} · {event}"
    )
    return f"{prefix} · {base}" if prefix else base


def compose_sheet(
    destination: Path,
    title: str,
    subtitle: str,
    panels: Sequence[Panel],
    columns: int,
    panel_size: tuple[int, int],
) -> None:
    margin = 24
    gap = 16
    header_height = 104
    label_height = 58
    rows = math.ceil(len(panels) / columns)
    width = margin * 2 + columns * panel_size[0] + (columns - 1) * gap
    height = (
        header_height
        + margin
        + rows * (panel_size[1] + label_height)
        + (rows - 1) * gap
        + margin
    )
    canvas = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(canvas)
    title_font = load_font(26, bold=True)
    subtitle_font = load_font(14)
    label_font = load_font(13, bold=True)
    draw.rectangle((0, 0, width, header_height), fill="#070a0b")
    draw.text((24, 22), title, font=title_font, fill=TEXT)
    draw.text((24, 62), subtitle, font=subtitle_font, fill=MUTED)
    draw.rectangle((24, 88, 134, 91), fill=MAGENTA)

    for index, panel in enumerate(panels):
        column = index % columns
        row = index // columns
        left = margin + column * (panel_size[0] + gap)
        top = header_height + margin + row * (panel_size[1] + label_height + gap)
        fitted = contain(panel.image, panel_size)
        canvas.paste(fitted, (left, top))
        draw.rectangle(
            (left, top, left + panel_size[0] - 1, top + panel_size[1] + label_height - 1),
            outline=LINE,
            width=1,
        )
        draw.rectangle(
            (
                left,
                top + panel_size[1],
                left + panel_size[0] - 1,
                top + panel_size[1] + label_height - 1,
            ),
            fill=LABEL_BG,
        )
        wrapped = textwrap.wrap(panel.label, width=max(32, panel_size[0] // 8))[:2]
        for line_index, line in enumerate(wrapped):
            draw.text(
                (left + 12, top + panel_size[1] + 10 + line_index * 18),
                line,
                font=label_font,
                fill=TEXT if line_index == 0 else MUTED,
            )
    atomic_save_png(canvas, destination)


def load_frames(root: Path, variant: str, frames: Iterable[int]) -> list[Panel]:
    panels = []
    for frame in frames:
        with Image.open(frame_path(root, variant, frame)) as source:
            panels.append(Panel(source.convert("RGB"), frame_label(frame)))
    return panels


def phase2b_entry_image(reference: Path) -> Image.Image:
    with Image.open(reference) as sheet:
        if sheet.size != (1504, 3680):
            raise ValueError(f"Unexpected accepted Phase 2B reference dimensions: {sheet.size}")
        # The accepted Phase 2B evidence compositor uses margin=24, header=92,
        # panel=720x450.  Crop only the first panel, never its review label.
        return sheet.convert("RGB").crop((24, 116, 744, 566))


def add_alignment_guides(image: Image.Image) -> Image.Image:
    target = cover(image, (1440, 900))
    overlay = Image.new("RGBA", target.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    guide = (240, 107, 160, 210)
    route = (216, 43, 114, 220)
    font = load_font(16, bold=True)
    draw.line((0, 121, 1440, 121), fill=guide, width=2)
    draw.rectangle((48, 347, 1392, 664), outline=guide, width=2)
    draw.rectangle((48, 802, 1392, 888), outline=route, width=2)
    draw.line((720, 121, 720, 900), fill=(220, 220, 220, 80), width=1)
    draw.text((58, 132), "NAV SAFE DATUM", font=font, fill=(245, 245, 245, 210))
    draw.text((58, 354), "FUTURE H1 ZONE", font=font, fill=(245, 245, 245, 210))
    draw.text((58, 808), "ROUTE-CHOICE ZONE", font=font, fill=(245, 245, 245, 210))
    return Image.alpha_composite(target.convert("RGBA"), overlay).convert("RGB")


def add_viewport_guides(image: Image.Image, authority: dict[str, Any]) -> Image.Image:
    size = tuple(authority["size"])
    centering = (0.53, 0.5) if authority["variant"] == "mobile" else (0.5, 0.5)
    target = cover(image, size, centering)
    overlay = Image.new("RGBA", target.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    header = float(authority["header"])
    h1_x, h1_y, h1_width, h1_height = authority["h1"]
    route_x, route_y, route_width, route_height = authority["routes"]
    label_size = max(10, round(min(size) * 0.018))
    font = load_font(label_size, bold=True)
    draw.rectangle((0, 0, size[0], header), fill=(4, 7, 8, 92))
    draw.line((0, header, size[0], header), fill=(225, 225, 225, 220), width=2)
    draw.rectangle(
        (h1_x, h1_y, h1_x + h1_width, h1_y + h1_height),
        outline=(240, 107, 160, 230),
        width=2,
    )
    draw.rectangle(
        (route_x, route_y, route_x + route_width, route_y + route_height),
        outline=(216, 43, 114, 235),
        width=2,
    )
    draw.text((8, max(4, header - label_size - 7)), "NAV EXCLUSION", font=font, fill=(245, 245, 245, 220))
    draw.text((h1_x + 5, h1_y + 4), "H1 SAFE", font=font, fill=(245, 245, 245, 225))
    draw.text((route_x + 5, route_y + 4), "ROUTES", font=font, fill=(245, 245, 245, 225))
    return Image.alpha_composite(target.convert("RGBA"), overlay).convert("RGB")


def percentile_from_histogram(histogram: Sequence[int], quantile: float) -> int:
    target = sum(histogram) * quantile
    running = 0
    for value, count in enumerate(histogram):
        running += count
        if running >= target:
            return value
    return len(histogram) - 1


def validate_dormant_screen(source: Path, variant: str) -> dict[str, Any]:
    # Interior-only regions avoid the bezel. A bright/high-frequency interior at
    # frame 1 indicates ghosted physical copy or a powered phosphor layer and is
    # not acceptable as a reduced-motion source.
    relative_roi = {
        "desktop": (0.49, 0.28, 0.69, 0.58),
        "mobile": (0.355, 0.415, 0.915, 0.59),
    }[variant]
    with Image.open(source) as raw:
        grayscale = raw.convert("L")
        box = (
            round(relative_roi[0] * grayscale.width),
            round(relative_roi[1] * grayscale.height),
            round(relative_roi[2] * grayscale.width),
            round(relative_roi[3] * grayscale.height),
        )
        interior = grayscale.crop(box)
    p95 = percentile_from_histogram(interior.histogram(), 0.95)
    edges = interior.filter(ImageFilter.FIND_EDGES)
    edge_histogram = edges.histogram()
    edge_ratio = sum(edge_histogram[12:]) / max(1, sum(edge_histogram))
    if p95 > 18 or edge_ratio > 0.025:
        raise ValueError(
            f"Dormant {variant} frame has a bright/textured screen interior "
            f"(p95={p95}, edgeRatio={edge_ratio:.6f}); hide physical CRT interface "
            "layers at frame 1 before packaging reduced-motion posters."
        )
    return {
        "relativeInteriorROI": list(relative_roi),
        "luminanceP95": p95,
        "edgePixelRatioAt12": round(edge_ratio, 9),
        "interfaceGhostingGate": "PASS",
    }


def art_direct_poster(
    source: Image.Image,
    size: tuple[int, int],
    centering: tuple[float, float],
    scrim_side: str,
) -> Image.Image:
    poster = cover(source, size, centering)
    poster = ImageEnhance.Contrast(poster).enhance(1.035)
    width, height = size
    pixels = poster.load()
    # Neutral directional scrim and vignette: multiplication cannot introduce
    # magenta into the dormant source.  It reserves real DOM breathing room.
    for y in range(height):
        vertical = abs((y + 0.5) / height - 0.5) * 2.0
        for x in range(width):
            horizontal = (x + 0.5) / width
            side = 1.0 - horizontal if scrim_side == "left" else horizontal
            scrim = 1.0 - 0.34 * max(0.0, (side - 0.28) / 0.72) ** 1.5
            vignette = 1.0 - 0.16 * max(vertical - 0.42, 0.0) / 0.58
            factor = max(0.48, min(1.0, scrim * vignette))
            r, g, b = pixels[x, y]
            pixels[x, y] = (round(r * factor), round(g * factor), round(b * factor))
    return poster


def magenta_dominant_ratio(image: Image.Image) -> float:
    sample = image.convert("RGB").resize((max(1, image.width // 4), max(1, image.height // 4)))
    magenta = 0
    total = sample.width * sample.height
    for red, green, blue in sample.getdata():
        if red >= 96 and red - green >= 32 and blue - green >= 8:
            magenta += 1
    return magenta / total


def copy_full_resolution_stills(
    root: Path,
    variant: str,
    frames: Sequence[int],
    destination: Path,
) -> list[Path]:
    destination.mkdir(parents=True, exist_ok=True)
    outputs = []
    for frame in frames:
        source = frame_path(root, variant, frame)
        output = destination / (
            f"phase-3-{variant}-f{frame:03d}-p{normalized_progress(frame):.4f}-full-resolution.png"
        )
        temporary = output.with_name(f"{output.stem}.phase3-tmp.png")
        shutil.copyfile(source, temporary)
        os.replace(temporary, output)
        outputs.append(output)
    return outputs


def link_or_copy(source: Path, destination: Path) -> None:
    try:
        os.link(source, destination)
    except OSError:
        shutil.copyfile(source, destination)


def annotate_scrub_frame(source: Path, destination: Path, label: str, frame: int) -> None:
    with Image.open(source) as raw:
        image = cover(raw, DESKTOP_REVIEW_SIZE)
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rectangle((0, 0, image.width, 86), fill=(4, 7, 8, 225))
    draw.rectangle((0, image.height - 52, image.width, image.height), fill=(4, 7, 8, 215))
    draw.rectangle((28, 68, 250, 72), fill=MAGENTA)
    draw.text((28, 18), label, font=load_font(23, bold=True), fill=TEXT)
    draw.text((28, 48), frame_label(frame), font=load_font(14), fill=MUTED)
    progress_width = round((image.width - 56) * normalized_progress(frame))
    draw.rectangle((28, image.height - 30, image.width - 28, image.height - 24), fill=(70, 78, 78, 210))
    draw.rectangle((28, image.height - 30, 28 + progress_width, image.height - 24), fill=MAGENTA)
    final = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")
    final.save(destination, "PNG", compress_level=6, optimize=False)


def build_scrub_sequence(desktop_root: Path, destination: Path) -> int:
    output_index = 1
    hold = 6
    for label, frames in SCRUB_SEGMENTS:
        for frame in frames:
            annotated = destination / f"annotated-{output_index:04d}.png"
            annotate_scrub_frame(frame_path(desktop_root, "desktop", frame), annotated, label, frame)
            for repetition in range(hold):
                link_or_copy(
                    annotated,
                    destination / f"scrub-{(output_index - 1) * hold + repetition + 1:04d}.png",
                )
            output_index += 1
    return (output_index - 1) * hold


def decode_selected_frames(
    ffmpeg: Path,
    candidate: Path,
    frames: Sequence[int],
    destination: Path,
    prefix: str,
) -> list[Path]:
    destination.mkdir(parents=True, exist_ok=True)
    select_expression = "+".join(f"eq(n\\,{frame - FRAME_START})" for frame in frames)
    output_pattern = destination / f"{prefix}-%02d.png"
    run(
        [
            str(ffmpeg),
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(candidate),
            "-map",
            "0:v:0",
            "-vf",
            f"select={select_expression}",
            "-frames:v",
            str(len(frames)),
            "-fps_mode",
            "vfr",
            "-an",
            "-sn",
            "-dn",
            "-map_metadata",
            "-1",
            "-pix_fmt",
            "rgb24",
            "-compression_level",
            "9",
            "-threads",
            "1",
            "-start_number",
            "1",
            str(output_pattern),
        ]
    )
    outputs = [destination / f"{prefix}-{index:02d}.png" for index in range(1, len(frames) + 1)]
    missing = [path for path in outputs if not path.is_file()]
    extras = sorted(
        path for path in destination.glob(f"{prefix}-*.png") if path not in set(outputs)
    )
    if missing or extras:
        raise ValueError(
            f"Decoded risk-frame set is incomplete or ambiguous for {candidate}: "
            f"missing={[path.name for path in missing]}, extras={[path.name for path in extras]}"
        )
    return outputs


def pixel_difference_metrics(source: Image.Image, decoded: Image.Image) -> dict[str, Any]:
    source_rgb = source.convert("RGB")
    decoded_rgb = decoded.convert("RGB")
    if source_rgb.size != decoded_rgb.size:
        raise ValueError(
            f"Codec decode dimensions {decoded_rgb.size} do not match source {source_rgb.size}"
        )
    pixel_count = source_rgb.width * source_rgb.height
    difference = ImageChops.difference(source_rgb, decoded_rgb)
    statistics = ImageStat.Stat(difference)
    channel_means = [float(value) for value in statistics.mean]
    channel_rms = [float(value) for value in statistics.rms]
    overall_mae = sum(channel_means) / 3.0
    overall_rmse = math.sqrt(sum(value * value for value in channel_rms) / 3.0)
    psnr = None if overall_rmse == 0 else 20.0 * math.log10(255.0 / overall_rmse)

    channel_histograms = [channel.histogram() for channel in difference.split()]
    combined_histogram = [
        sum(histogram[value] for histogram in channel_histograms) for value in range(256)
    ]
    p95_channels = [
        percentile_from_histogram(histogram, 0.95) for histogram in channel_histograms
    ]
    threshold_lut = [0 if value <= 12 else 255 for value in range(256)]
    threshold_masks = [channel.point(threshold_lut) for channel in difference.split()]
    any_over_12 = ImageChops.lighter(
        ImageChops.lighter(threshold_masks[0], threshold_masks[1]), threshold_masks[2]
    )
    any_over_histogram = any_over_12.histogram()
    pixels_over_12 = sum(any_over_histogram[1:])

    source_luma = source_rgb.convert("L")
    decoded_luma = decoded_rgb.convert("L")
    luma_difference = ImageChops.difference(source_luma, decoded_luma)
    luma_statistics = ImageStat.Stat(luma_difference)
    dark_mask = source_luma.point([255 if value < 32 else 0 for value in range(256)])
    dark_statistics = ImageStat.Stat(difference, mask=dark_mask)
    dark_count = int(dark_statistics.count[0]) if dark_statistics.count else 0

    source_red, source_green, source_blue = source_rgb.split()
    red_floor_mask = source_red.point([255 if value >= 80 else 0 for value in range(256)])
    red_over_green = ImageChops.subtract(source_red, source_green).point(
        [255 if value >= 32 else 0 for value in range(256)]
    )
    blue_over_green = ImageChops.subtract(source_blue, source_green).point(
        [255 if value >= 8 else 0 for value in range(256)]
    )
    magenta_mask = ImageChops.multiply(
        ImageChops.multiply(red_floor_mask, red_over_green), blue_over_green
    )
    magenta_statistics = ImageStat.Stat(difference, mask=magenta_mask)
    magenta_count = int(magenta_statistics.count[0]) if magenta_statistics.count else 0

    source_edges = source_luma.filter(ImageFilter.FIND_EDGES)
    decoded_edges = decoded_luma.filter(ImageFilter.FIND_EDGES)
    edge_difference = ImageChops.difference(source_edges, decoded_edges)
    edge_statistics = ImageStat.Stat(edge_difference)

    return {
        "metricDomain": "full-frame decoded RGB8 unless otherwise stated",
        "pixelCount": pixel_count,
        "meanAbsoluteError8bit": round(overall_mae, 6),
        "meanAbsoluteErrorPerChannelRGB": [round(value, 6) for value in channel_means],
        "rootMeanSquareError8bit": round(overall_rmse, 6),
        "rootMeanSquareErrorPerChannelRGB": [round(value, 6) for value in channel_rms],
        "peakSignalToNoiseRatioDb": round(psnr, 6) if psnr is not None else None,
        "absoluteDifferenceP95": percentile_from_histogram(combined_histogram, 0.95),
        "absoluteDifferenceP95PerChannelRGB": p95_channels,
        "maximumAbsoluteDifference8bit": max(
            maximum for _minimum, maximum in statistics.extrema
        ),
        "pixelsWithAnyChannelDeltaOver12Ratio": round(pixels_over_12 / pixel_count, 9),
        "lumaMeanAbsoluteError8bit": round(float(luma_statistics.mean[0]), 6),
        "lumaRootMeanSquareError8bit": round(float(luma_statistics.rms[0]), 6),
        "darkSourcePixelRatio": round(dark_count / pixel_count, 9),
        "darkSourceMeanAbsoluteErrorPerChannelRGB": [
            round(float(value), 6) for value in dark_statistics.mean
        ],
        "magentaSourcePixelRatio": round(magenta_count / pixel_count, 9),
        "magentaSourceMeanAbsoluteErrorPerChannelRGB": [
            round(float(value), 6) for value in magenta_statistics.mean
        ],
        "edgeMapMeanAbsoluteError8bit": round(float(edge_statistics.mean[0]), 6),
    }


def build_codec_comparison_evidence(
    ffmpeg: Path,
    repository: Path,
    source_root: Path,
    variant: str,
    candidate_records: dict[str, dict[str, Any]],
    destination: Path,
) -> tuple[tuple[int, ...], list[dict[str, Any]]]:
    risk_states = CODEC_RISK_FRAMES[variant]
    frames = tuple(frame for frame, _risk in risk_states)
    h264_record = candidate_records[f"{variant}-h264"]
    vp9_record = candidate_records[f"{variant}-vp9"]
    h264_path = repository / h264_record["repositoryRelativePath"]
    vp9_path = repository / vp9_record["repositoryRelativePath"]
    panels: list[Panel] = []
    metric_records: list[dict[str, Any]] = []

    with tempfile.TemporaryDirectory(prefix=f"phase3-{variant}-codec-risk-") as temporary_text:
        temporary_root = Path(temporary_text)
        h264_decoded = decode_selected_frames(
            ffmpeg, h264_path, frames, temporary_root / "h264", "h264"
        )
        vp9_decoded = decode_selected_frames(
            ffmpeg, vp9_path, frames, temporary_root / "vp9", "vp9"
        )
        for index, (frame, risk) in enumerate(risk_states):
            source_path = frame_path(source_root, variant, frame)
            with (
                Image.open(source_path) as source_image,
                Image.open(h264_decoded[index]) as h264_image,
                Image.open(vp9_decoded[index]) as vp9_image,
            ):
                source_rgb = source_image.convert("RGB")
                h264_rgb = h264_image.convert("RGB")
                vp9_rgb = vp9_image.convert("RGB")
                h264_metrics = pixel_difference_metrics(source_rgb, h264_rgb)
                vp9_metrics = pixel_difference_metrics(source_rgb, vp9_rgb)
                h264_psnr = h264_metrics["peakSignalToNoiseRatioDb"]
                vp9_psnr = vp9_metrics["peakSignalToNoiseRatioDb"]
                h264_psnr_label = "LOSSLESS" if h264_psnr is None else f"{h264_psnr:.2f} dB"
                vp9_psnr_label = "LOSSLESS" if vp9_psnr is None else f"{vp9_psnr:.2f} dB"
                panels.extend(
                    [
                        Panel(
                            source_rgb,
                            f"{risk} · F{frame:03d} P{normalized_progress(frame):.4f} · SOURCE PNG",
                        ),
                        Panel(
                            h264_rgb,
                            f"{risk} · H.264 · MAE {h264_metrics['meanAbsoluteError8bit']:.2f} · "
                            f"PSNR {h264_psnr_label}",
                        ),
                        Panel(
                            vp9_rgb,
                            f"{risk} · VP9 · MAE {vp9_metrics['meanAbsoluteError8bit']:.2f} · "
                            f"PSNR {vp9_psnr_label}",
                        ),
                    ]
                )
            metric_records.append(
                {
                    "risk": risk,
                    "sourceFrame": frame,
                    "normalizedProgress": normalized_progress(frame),
                    "sourcePNG": {
                        "filename": source_path.name,
                        "bytes": source_path.stat().st_size,
                        "sha256": sha256_file(source_path),
                    },
                    "h264": {
                        "candidateId": h264_record["id"],
                        "candidateSha256": h264_record["verification"]["sha256"],
                        "decodedPNGBytes": h264_decoded[index].stat().st_size,
                        "decodedPNGSha256": sha256_file(h264_decoded[index]),
                        "metrics": h264_metrics,
                    },
                    "vp9": {
                        "candidateId": vp9_record["id"],
                        "candidateSha256": vp9_record["verification"]["sha256"],
                        "decodedPNGBytes": vp9_decoded[index].stat().st_size,
                        "decodedPNGSha256": sha256_file(vp9_decoded[index]),
                        "metrics": vp9_metrics,
                    },
                }
            )

        if variant == "desktop":
            panel_size = (432, 243)
            title = "PHASE 3 · DESKTOP CODEC RISK COMPARISON"
            subtitle = "Source PNG vs decoded H.264 vs decoded VP9 · five high-risk production states"
        else:
            panel_size = (230, 409)
            title = "PHASE 3 · MOBILE CODEC RISK COMPARISON"
            subtitle = "Authored portrait source vs decoded H.264 vs decoded VP9 · five high-risk states"
        compose_sheet(
            destination,
            title,
            subtitle,
            panels,
            columns=3,
            panel_size=panel_size,
        )
    return frames, metric_records


def image_record(path: Path) -> dict[str, Any]:
    with Image.open(path) as image:
        return {
            "filename": path.name,
            "dimensions": {"width": image.width, "height": image.height},
            "format": image.format,
            "bytes": path.stat().st_size,
            "sha256": sha256_file(path),
        }


def file_record(path: Path) -> dict[str, Any]:
    return {"filename": path.name, "bytes": path.stat().st_size, "sha256": sha256_file(path)}


def repository_identity(repository: Path, override_sha: str | None) -> dict[str, Any]:
    branch = run(["git", "branch", "--show-current"], cwd=repository).stdout.strip()
    head = run(["git", "rev-parse", "HEAD"], cwd=repository).stdout.strip()
    selected = override_sha or head
    if len(selected) != 40 or any(character not in "0123456789abcdefABCDEF" for character in selected):
        raise ValueError(f"Invalid branch SHA: {selected!r}")
    return {
        "branch": branch,
        "repositoryHeadAtPackaging": head,
        "branchShaDeclaredForReview": selected.lower(),
    }


def deterministic_zip(destination: Path, files: Sequence[tuple[Path, str]]) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f"{destination.stem}.phase3-tmp.zip")
    if temporary.exists():
        temporary.unlink()
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for source, arcname in sorted(files, key=lambda item: item[1]):
                info = zipfile.ZipInfo(arcname, date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                info.create_system = 3
                archive.writestr(info, source.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        os.replace(temporary, destination)
    finally:
        if temporary.exists():
            temporary.unlink()


def resolve_recorded_path(
    repository: Path,
    relative_text: str,
    allowed_root: Path,
    label: str,
) -> Path:
    relative = Path(relative_text)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError(f"Unsafe {label} path in tracked manifest: {relative_text!r}")
    resolved = (repository / relative).resolve()
    repository_resolved = repository.resolve()
    allowed_resolved = allowed_root.resolve()
    if repository_resolved not in resolved.parents:
        raise ValueError(f"{label} escapes the repository: {relative_text!r}")
    if resolved != allowed_resolved and allowed_resolved not in resolved.parents:
        raise ValueError(f"{label} is outside its isolated package root: {relative_text!r}")
    return resolved


def verify_recorded_file(path: Path, record: dict[str, Any], label: str) -> dict[str, Any]:
    if not path.is_file():
        raise FileNotFoundError(f"Missing {label}: {path}")
    expected_bytes = int(record["bytes"])
    actual_bytes = path.stat().st_size
    if actual_bytes != expected_bytes:
        raise ValueError(
            f"{label} byte mismatch for {path}: {actual_bytes} != {expected_bytes}"
        )
    expected_hash = str(record["sha256"]).lower()
    actual_hash = sha256_file(path)
    if actual_hash != expected_hash:
        raise ValueError(f"{label} SHA-256 mismatch for {path}: {actual_hash} != {expected_hash}")
    dimensions = record.get("dimensions")
    if dimensions:
        with Image.open(path) as image:
            expected_size = (int(dimensions["width"]), int(dimensions["height"]))
            if image.size != expected_size:
                raise ValueError(
                    f"{label} dimension mismatch for {path}: {image.size} != {expected_size}"
                )
    return {"bytes": actual_bytes, "sha256": actual_hash}


def final_push_identity(repository: Path, declared_sha: str | None) -> dict[str, str]:
    tracked_status = run(
        ["git", "status", "--porcelain=v1", "--untracked-files=no"], cwd=repository
    ).stdout.strip()
    if tracked_status:
        raise ValueError(
            "External-only finalization requires a clean tracked worktree. Commit and push "
            f"the generated Phase 3 artifacts first. Tracked status:\n{tracked_status}"
        )

    branch = run(["git", "branch", "--show-current"], cwd=repository).stdout.strip()
    head = run(["git", "rev-parse", "HEAD"], cwd=repository).stdout.strip().lower()
    if not branch:
        raise ValueError("External-only finalization requires a named branch, not detached HEAD")
    if declared_sha and declared_sha.lower() != head:
        raise ValueError(
            f"Declared final SHA {declared_sha.lower()} does not equal current HEAD {head}"
        )
    try:
        upstream_ref = run(
            ["git", "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
            cwd=repository,
        ).stdout.strip()
        upstream_sha = run(["git", "rev-parse", "@{u}"], cwd=repository).stdout.strip().lower()
    except RuntimeError as exc:
        raise ValueError(
            "External-only finalization requires a configured upstream. Push the final branch "
            "with upstream tracking, then rerun."
        ) from exc
    if upstream_sha != head:
        raise ValueError(
            f"Current HEAD {head} is not the locally recorded pushed upstream {upstream_ref} "
            f"at {upstream_sha}. Push first, then finalize."
        )
    return {
        "branch": branch,
        "finalPushedSha": head,
        "upstreamRef": upstream_ref,
        "upstreamSha": upstream_sha,
        "trackedWorktree": "CLEAN",
    }


def finalize_external_review(
    repository: Path,
    review_zip: Path,
    declared_sha: str | None,
) -> None:
    package_root = repository / "artifacts/original/phase-3-crt-opening"
    media_root = package_root / "media"
    review_root = package_root / "review"
    manifest_path = package_root / "manifests/phase-3-post-production-manifest.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(
            "Tracked post-production manifest is missing. Run the full packaging mode, review "
            "the outputs, commit them, and push before external-only finalization."
        )
    tracked_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if tracked_manifest.get("schema") != "quantum-hub.phase-3-crt-opening.post-production.v1":
        raise ValueError(f"Unexpected tracked post-production schema: {manifest_path}")
    if tracked_manifest.get("status") != "PASS":
        raise ValueError(f"Tracked post-production manifest is not PASS: {manifest_path}")
    policy = tracked_manifest.get("deliveryPolicy", {})
    if policy.get("rawFramesCommitted") is not False:
        raise ValueError("Tracked post-production manifest does not prove rawFramesCommitted=false")

    identity = final_push_identity(repository, declared_sha)
    tracked_manifest_record = {
        "repositoryRelativePath": manifest_path.relative_to(repository).as_posix(),
        "bytes": manifest_path.stat().st_size,
        "sha256": sha256_file(manifest_path),
        "recordedPackagingRepository": tracked_manifest.get("repository"),
    }

    archive_files: list[tuple[Path, str]] = []
    verified_review: list[dict[str, Any]] = []
    archive_names: set[str] = set()
    reserved_archive_names = {
        "README.md",
        "phase-3-review-manifest.json",
        "manifests/phase-3-post-production-manifest.json",
    }
    for record in tracked_manifest.get("reviewArtifacts", []):
        relative_text = str(record.get("repositoryRelativePath", ""))
        path = resolve_recorded_path(repository, relative_text, review_root, "review artifact")
        relative_to_review = path.relative_to(review_root).as_posix()
        relative_parts = [part.lower() for part in Path(relative_to_review).parts]
        if RAW_SEQUENCE_FILENAME.fullmatch(path.name) or "renders" in relative_parts:
            raise ValueError(f"Raw render material is prohibited from the review ZIP: {path}")
        verification = verify_recorded_file(path, record, "review artifact")
        if relative_to_review in reserved_archive_names:
            raise ValueError(f"Review artifact collides with a reserved ZIP path: {relative_to_review}")
        if relative_to_review in archive_names:
            raise ValueError(f"Duplicate review ZIP archive name: {relative_to_review}")
        archive_names.add(relative_to_review)
        archive_files.append((path, relative_to_review))
        verified_review.append({**record, "externalFinalizationVerification": verification})
    if not verified_review:
        raise ValueError("Tracked manifest contains no review artifacts")

    verified_candidates: list[dict[str, Any]] = []
    for candidate in tracked_manifest.get("deliveryCandidates", []):
        relative_text = str(candidate.get("repositoryRelativePath", ""))
        path = resolve_recorded_path(repository, relative_text, media_root, "delivery candidate")
        verification_record = candidate.get("verification", {})
        verification = verify_recorded_file(path, verification_record, "delivery candidate")
        verified_candidates.append(
            {
                "id": candidate.get("id"),
                "variant": candidate.get("variant"),
                "codec": candidate.get("codec"),
                "repositoryRelativePath": relative_text,
                "bytes": verification["bytes"],
                "sha256": verification["sha256"],
                "width": verification_record.get("width"),
                "height": verification_record.get("height"),
                "frameCount": verification_record.get("frameCount"),
                "durationSeconds": verification_record.get("durationSeconds"),
                "selectedGopFrames": candidate.get("settings", {}).get("selectedGopFrames"),
                "selectedGopMilliseconds": candidate.get("settings", {}).get(
                    "selectedGopMilliseconds"
                ),
                "gopStrategy": candidate.get("gopStrategy"),
                "status": candidate.get("status"),
            }
        )
    if len(verified_candidates) != 4:
        raise ValueError(
            f"Expected four selected delivery candidates, found {len(verified_candidates)}"
        )

    tracked_readme_record = tracked_manifest.get("reviewReadme", {})
    tracked_readme_path = resolve_recorded_path(
        repository,
        str(tracked_readme_record.get("repositoryRelativePath", "")),
        review_root,
        "tracked review README",
    )
    verify_recorded_file(tracked_readme_path, tracked_readme_record, "tracked review README")

    external_manifest_path = review_zip.with_name(f"{review_zip.stem}.manifest.json")
    ensure_outside_repository(external_manifest_path, repository, "External review manifest")
    zip_sidecar = review_zip.with_suffix(review_zip.suffix + ".sha256")
    external_manifest = {
        "schema": "quantum-hub.phase-3-crt-opening.external-review.v1",
        "status": "PASS",
        "mode": "FINALIZE_EXTERNAL_ONLY",
        "trackedFilesWritten": [],
        "finalPush": identity,
        "trackedPostProductionManifest": tracked_manifest_record,
        "timeline": tracked_manifest.get("timeline"),
        "sourceMasters": tracked_manifest.get("sourceMasters"),
        "deliveryPolicy": {
            **policy,
            "productionCandidatesIncludedInZip": False,
            "productionCandidateHashesRecorded": True,
        },
        "deliveryCandidates": verified_candidates,
        "reviewArtifacts": verified_review,
        "trackedReviewReadme": tracked_readme_record,
        "externalOutputs": {
            "reviewZipFilename": review_zip.name,
            "reviewManifestFilename": external_manifest_path.name,
            "reviewZipSha256SidecarFilename": zip_sidecar.name,
        },
        "zipPolicy": {
            "containsRawFrameSequences": False,
            "containsProductionDeliveryCandidates": False,
            "containsCompactReviewEvidence": True,
            "manifestBindsFinalPushedShaWithoutChangingTrackedArtifacts": True,
        },
        "zipContents": [
            "README.md",
            "phase-3-review-manifest.json",
            "manifests/phase-3-post-production-manifest.json",
            *sorted(archive_names),
        ],
    }
    atomic_json(external_manifest_path, external_manifest)

    candidate_lines = "\n".join(
        f"- `{candidate['id']}`: `{candidate['repositoryRelativePath']}` — "
        f"SHA-256 `{candidate['sha256']}`"
        for candidate in verified_candidates
    )
    review_lines = "\n".join(
        f"- `{record['repositoryRelativePath']}`" for record in verified_review
    )
    external_readme = f"""# Phase 3 CRT Opening — Final Pushed Human Review

This ZIP was finalized in external-only mode after the Phase 3 branch was
committed and pushed. No tracked file was changed during finalization.

## Final push identity

- Branch: `{identity['branch']}`
- Final pushed SHA: `{identity['finalPushedSha']}`
- Upstream: `{identity['upstreamRef']}` at `{identity['upstreamSha']}`
- Tracked post-production manifest: `{tracked_manifest_record['repositoryRelativePath']}`
- Tracked manifest SHA-256: `{tracked_manifest_record['sha256']}`

## Selected delivery candidates

The candidates remain isolated in the repository and are not duplicated in
this ZIP. Their exact paths and hashes are:

{candidate_lines}

## Included compact review artifacts

{review_lines}

`phase-3-review-manifest.json` records exact dimensions, byte sizes, SHA-256
hashes, source frames, normalized progress, candidate identities, and the final
pushed SHA. `manifests/phase-3-post-production-manifest.json` preserves the
full render/source provenance captured before commit.

Raw desktop/mobile PNG sequences are not included.
"""

    with tempfile.TemporaryDirectory(prefix="phase3-final-review-") as temporary_text:
        temporary_root = Path(temporary_text)
        external_readme_path = temporary_root / "README.md"
        atomic_text(external_readme_path, external_readme)
        zip_files = [
            *archive_files,
            (external_readme_path, "README.md"),
            (external_manifest_path, "phase-3-review-manifest.json"),
            (manifest_path, "manifests/phase-3-post-production-manifest.json"),
        ]
        deterministic_zip(review_zip, zip_files)

    zip_hash = sha256_file(review_zip)
    atomic_text(zip_sidecar, f"{zip_hash}  {review_zip.name}\n")
    summary = {
        "status": "PASS",
        "mode": "FINALIZE_EXTERNAL_ONLY",
        "finalPushedSha": identity["finalPushedSha"],
        "trackedFilesWritten": [],
        "deliveryCandidatePaths": [
            {
                "id": candidate["id"],
                "path": str(repository / candidate["repositoryRelativePath"]),
                "sha256": candidate["sha256"],
            }
            for candidate in verified_candidates
        ],
        "externalReviewManifest": {
            "path": str(external_manifest_path),
            "bytes": external_manifest_path.stat().st_size,
            "sha256": sha256_file(external_manifest_path),
        },
        "externalReviewZip": {
            "path": str(review_zip),
            "bytes": review_zip.stat().st_size,
            "sha256": zip_hash,
            "sidecar": str(zip_sidecar),
        },
    }
    print(json.dumps(summary, indent=2))


def parse_args() -> argparse.Namespace:
    script = Path(__file__).resolve()
    default_repository = script.parents[4]
    parser = argparse.ArgumentParser(
        description="Encode Phase 3 delivery candidates and create deterministic compact review evidence."
    )
    parser.add_argument(
        "--finalize-external-only",
        action="store_true",
        help=(
            "After commit/push, verify tracked Phase 3 evidence and rebuild only the external "
            "manifest/ZIP. Requires a clean branch whose HEAD equals its upstream; does not "
            "read raw sequences or write tracked files."
        ),
    )
    parser.add_argument(
        "--desktop-frames",
        type=Path,
        help="Outside-Git desktop PNG sequence root; required for full packaging mode.",
    )
    parser.add_argument(
        "--mobile-frames",
        type=Path,
        help="Outside-Git mobile PNG sequence root; required for full packaging mode.",
    )
    parser.add_argument("--ffmpeg", type=Path, help="ffmpeg binary; required for full mode.")
    parser.add_argument("--ffprobe", type=Path, help="ffprobe binary; required for full mode.")
    parser.add_argument(
        "--review-zip",
        type=Path,
        required=True,
        help=(
            "Outside-Git output path. Filename must be "
            "phase-3-crt-opening-human-review.zip."
        ),
    )
    parser.add_argument("--repo-root", type=Path, default=default_repository)
    parser.add_argument(
        "--branch-sha",
        help=(
            "Full mode: optional review-capture SHA. External-only mode: optional asserted final "
            "pushed SHA, which must equal both HEAD and its configured upstream."
        ),
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    repository = args.repo_root.resolve()
    review_zip = args.review_zip.resolve()

    if not (repository / ".git").exists():
        raise ValueError(f"Not a Git worktree root: {repository}")
    ensure_outside_repository(review_zip, repository, "Review ZIP")
    if review_zip.name != "phase-3-crt-opening-human-review.zip":
        raise ValueError(
            "The external review ZIP must be named phase-3-crt-opening-human-review.zip"
        )
    if args.finalize_external_only:
        finalize_external_review(repository, review_zip, args.branch_sha)
        return

    required_full_mode = {
        "--desktop-frames": args.desktop_frames,
        "--mobile-frames": args.mobile_frames,
        "--ffmpeg": args.ffmpeg,
        "--ffprobe": args.ffprobe,
    }
    missing = [name for name, value in required_full_mode.items() if value is None]
    if missing:
        raise ValueError(
            "Full packaging mode requires "
            + ", ".join(missing)
            + ". Use --finalize-external-only only after the generated artifacts are committed "
            "and pushed."
        )
    desktop_root = args.desktop_frames.resolve()
    mobile_root = args.mobile_frames.resolve()
    ffmpeg = args.ffmpeg.resolve()
    ffprobe = args.ffprobe.resolve()
    for binary, label in ((ffmpeg, "ffmpeg"), (ffprobe, "ffprobe")):
        if not binary.is_file():
            raise FileNotFoundError(f"Missing {label}: {binary}")
    ensure_outside_repository(desktop_root, repository, "Desktop raw frame root")
    ensure_outside_repository(mobile_root, repository, "Mobile raw frame root")

    package_root = repository / "artifacts/original/phase-3-crt-opening"
    media_root = package_root / "media"
    review_root = package_root / "review"
    still_root = review_root / "full-resolution-stills"
    manifest_root = package_root / "manifests"
    source_root = package_root / "source"
    manifest_path = manifest_root / "phase-3-post-production-manifest.json"
    readme_path = review_root / "README.md"

    phase2b_reference = repository / PHASE2B_ENTRY_SHEET_RELATIVE
    accepted_crt = repository / ACCEPTED_CRT_RELATIVE
    derivative_crt = repository / DERIVATIVE_CRT_RELATIVE
    if sha256_file(accepted_crt) != ACCEPTED_CRT_SHA256:
        raise ValueError("Accepted CRT source hash mismatch; refusing source-authority drift")
    if not derivative_crt.is_file():
        raise FileNotFoundError(f"Missing Phase 3 derivative source: {derivative_crt}")
    if sha256_file(phase2b_reference) != PHASE2B_ENTRY_SHEET_SHA256:
        raise ValueError("Accepted Phase 2B ENTRY reference hash mismatch; refusing comparison drift")

    desktop_source = validate_sequence(desktop_root, "desktop", DESKTOP_SIZE)
    mobile_source = validate_sequence(mobile_root, "mobile", MOBILE_SIZE)
    for variant, root, source_record in (
        ("desktop", desktop_root, desktop_source),
        ("mobile", mobile_root, mobile_source),
    ):
        dormant_path = frame_path(root, variant, 1)
        screen_gate = validate_dormant_screen(dormant_path, variant)
        with Image.open(dormant_path) as dormant:
            magenta_ratio = magenta_dominant_ratio(dormant)
        if magenta_ratio > 0.0005:
            raise ValueError(
                f"Dormant {variant} frame contains meaningful magenta-dominant pixels: "
                f"ratio={magenta_ratio:.9f}"
            )
        source_record["dormancyGate"] = {
            **screen_gate,
            "magentaDominantPixelRatio": round(magenta_ratio, 9),
            "magentaGate": "PASS",
            "physicalInterfaceTextVisible": False,
            "scanlinesVisible": False,
        }
    identity = repository_identity(repository, args.branch_sha)
    ffmpeg_build = ffmpeg_version(ffmpeg)
    ffprobe_build = ffmpeg_version(ffprobe)

    candidates = [
        {
            "id": "desktop-h264",
            "variant": "desktop",
            "path": media_root / "phase-3-crt-opening-desktop-h264.mp4",
            "size": DESKTOP_SIZE,
            "codec": "h264",
            "settings": {"encoder": "libx264", "crf": 18, "preset": "slow"},
        },
        {
            "id": "desktop-vp9",
            "variant": "desktop",
            "path": media_root / "phase-3-crt-opening-desktop-vp9.webm",
            "size": DESKTOP_SIZE,
            "codec": "vp9",
            "settings": {"encoder": "libvpx-vp9", "crf": 27, "deadline": "good", "cpuUsed": 2},
        },
        {
            "id": "mobile-h264",
            "variant": "mobile",
            "path": media_root / "phase-3-crt-opening-mobile-h264.mp4",
            "size": MOBILE_SIZE,
            "codec": "h264",
            "settings": {"encoder": "libx264", "crf": 19, "preset": "slow"},
        },
        {
            "id": "mobile-vp9",
            "variant": "mobile",
            "path": media_root / "phase-3-crt-opening-mobile-vp9.webm",
            "size": MOBILE_SIZE,
            "codec": "vp9",
            "settings": {"encoder": "libvpx-vp9", "crf": 28, "deadline": "good", "cpuUsed": 2},
        },
    ]

    for candidate in candidates:
        root = desktop_root if candidate["variant"] == "desktop" else mobile_root
        input_args = input_sequence_arguments(root, candidate["variant"])
        codec_args = (
            h264_arguments(candidate["settings"]["crf"])
            if candidate["codec"] == "h264"
            else vp9_arguments(candidate["settings"]["crf"])
        )
        encode_atomic(ffmpeg, [*input_args, *codec_args], candidate["path"])
        candidate["verification"] = verify_candidate(
            ffprobe, candidate["path"], candidate["size"], candidate["codec"]
        )
        candidate["repositoryRelativePath"] = candidate["path"].relative_to(repository).as_posix()
        candidate["status"] = "PRODUCTION CANDIDATE — visual/browser acceptance pending"
        source_identity = desktop_source if candidate["variant"] == "desktop" else mobile_source
        candidate["sourceSequenceSha256"] = source_identity["sequenceSha256"]
        candidate["sourceFrameRange"] = {
            "frameStart": FRAME_START,
            "frameEnd": FRAME_END,
            "normalizedProgressStart": 0.0,
            "normalizedProgressEnd": 1.0,
        }
        candidate["settings"]["selectedGopFrames"] = GOP
        candidate["settings"]["selectedGopMilliseconds"] = round(GOP / FPS * 1000)
        candidate["gopStrategy"] = (
            "12-frame (400 ms) closed GOP; fixed scene-cut-free keyframes; no audio"
            if candidate["codec"] == "h264"
            else "12-frame (400 ms) independent keyframe cadence; alt-ref/lag disabled; no audio"
        )
        del candidate["path"]
        del candidate["size"]

    review_outputs: list[dict[str, Any]] = []
    review_zip_files: list[tuple[Path, str]] = []

    def register_image(path: Path, role: str, variant: str, frames: Sequence[int], **extra: Any) -> None:
        record = image_record(path)
        record.update(
            {
                "repositoryRelativePath": path.relative_to(repository).as_posix(),
                "role": role,
                "sourceVariant": variant,
                "sourceFrames": [
                    {"frame": frame, "normalizedProgress": normalized_progress(frame)}
                    for frame in frames
                ],
                **extra,
            }
        )
        review_outputs.append(record)
        review_zip_files.append((path, path.relative_to(review_root).as_posix()))

    def register_video(
        path: Path,
        role: str,
        variant: str,
        frames: Any,
        probe: dict[str, Any],
        progress: Any,
    ) -> None:
        record = file_record(path)
        record.update(
            {
                "repositoryRelativePath": path.relative_to(repository).as_posix(),
                "role": role,
                "sourceVariant": variant,
                "sourceFrames": frames,
                "sourceNormalizedProgress": progress,
                "mediaProbe": probe,
            }
        )
        review_outputs.append(record)
        review_zip_files.append((path, path.relative_to(review_root).as_posix()))

    media_lab_recording = review_root / "phase-3-media-lab-scrub-evidence.webm"
    media_lab_recording_registered = False
    if media_lab_recording.is_file():
        media_lab_probe = probe_media(ffprobe, media_lab_recording)
        container_formats = set((media_lab_probe.get("containerFormats") or "").split(","))
        if "webm" not in container_formats:
            raise ValueError(
                f"Isolated media-lab evidence is not a WebM container: {media_lab_probe}"
            )
        if media_lab_probe["audioStreamCount"] != 0:
            raise ValueError(
                f"Isolated media-lab evidence must be silent: {media_lab_recording}"
            )
        if (
            media_lab_probe["width"] <= 0
            or media_lab_probe["height"] <= 0
            or media_lab_probe["durationSeconds"] <= 0
            or not media_lab_probe["frameCount"]
        ):
            raise ValueError(
                f"Isolated media-lab evidence has invalid video geometry/duration: {media_lab_probe}"
            )
        register_video(
            media_lab_recording,
            "actual isolated media-lab interaction recording",
            "isolated-media-lab",
            {
                "captureType": "headed browser interaction recording",
                "testedBehaviors": [
                    "forward scrub",
                    "fast forward jump",
                    "reverse scrub",
                    "rapid alternating seek",
                    "direct portal jump",
                    "return to conduction",
                ],
            },
            media_lab_probe,
            "non-linear user/media timeline interaction; visual source progress is shown in capture",
        )
        media_lab_recording_registered = True

    candidate_records = {candidate["id"]: candidate for candidate in candidates}
    for variant, source_sequence_root in (
        ("desktop", desktop_root),
        ("mobile", mobile_root),
    ):
        codec_sheet = review_root / f"phase-3-{variant}-codec-comparison-contact-sheet.png"
        codec_frames, codec_metrics = build_codec_comparison_evidence(
            ffmpeg,
            repository,
            source_sequence_root,
            variant,
            candidate_records,
            codec_sheet,
        )
        register_image(
            codec_sheet,
            f"{variant} source-vs-H.264-vs-VP9 decoded risk comparison",
            variant,
            codec_frames,
            codecComparison={
                "decodeTool": ffmpeg_build,
                "decodeSelection": "zero-based exact decoded frame index via FFmpeg select filter",
                "columnOrder": ["source PNG", "decoded H.264", "decoded VP9"],
                "riskStates": codec_metrics,
            },
        )

    conduction_sheet = review_root / "phase-3-desktop-conduction-contact-sheet.png"
    compose_sheet(
        conduction_sheet,
        "PHASE 3 · DESKTOP CONDUCTION",
        "Physical cable continuity · leading edge · energized trail · ground reflection · frame 1 zero-magenta gate",
        load_frames(desktop_root, "desktop", CONDUCTION_FRAMES),
        columns=4,
        panel_size=(432, 243),
    )
    register_image(conduction_sheet, "desktop conduction contact sheet", "desktop", CONDUCTION_FRAMES)

    startup_sheet = review_root / "phase-3-crt-startup-contact-sheet.png"
    compose_sheet(
        startup_sheet,
        "PHASE 3 · EIGHT-STEP CRT STARTUP",
        "Current arrival → indicator → horizontal phosphor line → raster expansion → stabilization",
        load_frames(desktop_root, "desktop", STARTUP_FRAMES),
        columns=4,
        panel_size=(432, 243),
    )
    register_image(startup_sheet, "eight-step CRT startup contact sheet", "desktop", STARTUP_FRAMES)

    camera_sheet = review_root / "phase-3-camera-portal-contact-sheet.png"
    compose_sheet(
        camera_sheet,
        "PHASE 3 · CAMERA / PORTAL",
        "Approach · frontal alignment · bezel exit · curvature reduction · raster handoff",
        load_frames(desktop_root, "desktop", CAMERA_PORTAL_FRAMES),
        columns=4,
        panel_size=(432, 243),
    )
    register_image(camera_sheet, "camera and portal contact sheet", "desktop", CAMERA_PORTAL_FRAMES)

    accepted_entry = phase2b_entry_image(phase2b_reference)
    alignment_panels = []
    for frame in PORTAL_ALIGNMENT_FRAMES[:-1]:
        with Image.open(frame_path(desktop_root, "desktop", frame)) as raw:
            alignment_panels.append(Panel(add_alignment_guides(raw), frame_label(frame)))
    alignment_panels.append(Panel(add_alignment_guides(accepted_entry), "ACCEPTED PHASE 2B ENTRY · DOM ALIGNMENT TARGET"))
    with Image.open(frame_path(desktop_root, "desktop", PORTAL_ALIGNMENT_FRAMES[-1])) as raw:
        alignment_panels.append(Panel(add_alignment_guides(raw), frame_label(270)))
    alignment_sheet = review_root / "phase-3-portal-alignment-contact-sheet.png"
    compose_sheet(
        alignment_sheet,
        "PHASE 3 · PHYSICAL / DOM PORTAL ALIGNMENT",
        "Review-only guides · navigation datum · future H1 zone · route-choice zone · never baked into production media",
        alignment_panels,
        columns=3,
        panel_size=(480, 300),
    )
    register_image(
        alignment_sheet,
        "portal alignment contact sheet with review-only guides",
        "desktop + accepted Phase 2B",
        PORTAL_ALIGNMENT_FRAMES,
        acceptedPhase2BReference={
            "path": PHASE2B_ENTRY_SHEET_RELATIVE.as_posix(),
            "sha256": PHASE2B_ENTRY_SHEET_SHA256,
        },
    )

    safe_zone_panels = []
    for authority in VIEWPORT_ZONES:
        variant = authority["variant"]
        root = desktop_root if variant == "desktop" else mobile_root
        with Image.open(frame_path(root, variant, 270)) as raw:
            guided = add_viewport_guides(raw, authority)
        width, height = authority["size"]
        safe_zone_panels.append(
            Panel(
                guided,
                f"{width}×{height} · F270 · H1 + ROUTES + NAV AUTHORITY",
            )
        )
    safe_zone_sheet = review_root / "phase-3-portal-safe-zone-matrix.png"
    compose_sheet(
        safe_zone_sheet,
        "PHASE 3 · RESPONSIVE PORTAL SAFE-ZONE MATRIX",
        "Exact frozen Phase 2B geometry · 8 required viewports · review-only guides · frame 270 text-free raster",
        safe_zone_panels,
        columns=4,
        panel_size=(360, 420),
    )
    register_image(
        safe_zone_sheet,
        "responsive portal safe-zone matrix with exact frozen DOM rectangles",
        "desktop + mobile",
        (270,),
        viewportAuthorities=[
            {
                "width": authority["size"][0],
                "height": authority["size"][1],
                "sourceVariant": authority["variant"],
                "headerExclusionY": authority["header"],
                "h1RectXYWH": list(authority["h1"]),
                "routeRectXYWH": list(authority["routes"]),
            }
            for authority in VIEWPORT_ZONES
        ],
    )

    comparison_panels = []
    for frame, label in ((258, "FINAL PHYSICAL RASTER"), (262, "NEAR-FINAL PORTAL")):
        with Image.open(frame_path(desktop_root, "desktop", frame)) as raw:
            comparison_panels.append(Panel(cover(raw, (1440, 900)), frame_label(frame, label)))
    comparison_panels.append(Panel(accepted_entry.resize((1440, 900), Image.Resampling.LANCZOS), "ACCEPTED PHASE 2B ENTRY"))
    comparison = review_root / "phase-3-to-phase-2b-handoff-comparison.png"
    compose_sheet(
        comparison,
        "PHASE 3 → PHASE 2B HANDOFF",
        "Physical raster · near-final portal · frozen accepted Operating Field ENTRY",
        comparison_panels,
        columns=3,
        panel_size=(480, 300),
    )
    register_image(
        comparison,
        "Phase 3 to accepted Phase 2B handoff comparison",
        "desktop + accepted Phase 2B",
        (258, 262, 270),
        acceptedPhase2BReference={
            "path": PHASE2B_ENTRY_SHEET_RELATIVE.as_posix(),
            "sha256": PHASE2B_ENTRY_SHEET_SHA256,
        },
    )

    mobile_panels = []
    for frame in MOBILE_FRAMES:
        with Image.open(frame_path(mobile_root, "mobile", frame)) as raw:
            mobile_panels.append(Panel(cover(raw, (390, 844), (0.53, 0.5)), frame_label(frame, "390×844")))
    mobile_sheet = review_root / "phase-3-mobile-contact-sheet.png"
    compose_sheet(
        mobile_sheet,
        "PHASE 3 · AUTHORED MOBILE · 390×844",
        "Dormancy · conduction · power-on · approach · handoff from the independent portrait camera path",
        mobile_panels,
        columns=5,
        panel_size=(260, 563),
    )
    register_image(mobile_sheet, "mobile 390x844 contact sheet", "mobile", MOBILE_FRAMES)

    narrow_panels = []
    landscape_panels = []
    for frame in MOBILE_HIGH_RISK_FRAMES:
        with Image.open(frame_path(mobile_root, "mobile", frame)) as raw:
            narrow_panels.append(Panel(cover(raw, (320, 800), (0.54, 0.5)), frame_label(frame, "320×800")))
            landscape_panels.append(Panel(cover(raw, (844, 390), (0.53, 0.48)), frame_label(frame, "844×390")))
    narrow_sheet = review_root / "phase-3-mobile-320-contact-sheet.png"
    compose_sheet(
        narrow_sheet,
        "PHASE 3 · NARROW-MOBILE HARD GATE · 320×800",
        "Dormancy · CRT startup · handoff · independently authored mobile source",
        narrow_panels,
        columns=3,
        panel_size=(240, 600),
    )
    register_image(narrow_sheet, "narrow mobile 320x800 contact sheet", "mobile", MOBILE_HIGH_RISK_FRAMES)

    mobile360_panels = []
    for frame in MOBILE_HIGH_RISK_FRAMES:
        with Image.open(frame_path(mobile_root, "mobile", frame)) as raw:
            mobile360_panels.append(
                Panel(cover(raw, (360, 800), (0.54, 0.5)), frame_label(frame, "360×800"))
            )
    mobile360_sheet = review_root / "phase-3-mobile-360-contact-sheet.png"
    compose_sheet(
        mobile360_sheet,
        "PHASE 3 · MOBILE INTERMEDIATE · 360×800",
        "Dormancy · CRT startup · handoff · authored mobile source",
        mobile360_panels,
        columns=3,
        panel_size=(270, 600),
    )
    register_image(
        mobile360_sheet,
        "mobile 360x800 contact sheet",
        "mobile",
        MOBILE_HIGH_RISK_FRAMES,
    )

    landscape_sheet = review_root / "phase-3-mobile-landscape-844x390-contact-sheet.png"
    compose_sheet(
        landscape_sheet,
        "PHASE 3 · MOBILE LANDSCAPE RISK · 844×390",
        "Dormancy · CRT startup · handoff · center-priority extraction from authored mobile camera",
        landscape_panels,
        columns=3,
        panel_size=(422, 195),
    )
    register_image(landscape_sheet, "mobile landscape 844x390 contact sheet", "mobile", MOBILE_HIGH_RISK_FRAMES)

    poster_specs = [
        ("desktop", desktop_root, (1440, 900), (0.48, 0.5), "left"),
        ("mobile", mobile_root, (390, 844), (0.54, 0.5), "left"),
        ("mobile", mobile_root, (320, 800), (0.55, 0.5), "left"),
    ]
    poster_records = []
    for name, root, size, centering, scrim_side in poster_specs:
        variant = "desktop" if name == "desktop" else "mobile"
        source_record = desktop_source if variant == "desktop" else mobile_source
        with Image.open(frame_path(root, variant, 1)) as dormant:
            poster = art_direct_poster(dormant, size, centering, scrim_side)
        magenta_ratio = magenta_dominant_ratio(poster)
        if magenta_ratio > 0.0005:
            raise ValueError(
                f"Reduced-motion poster {name} contains meaningful magenta-dominant pixels: "
                f"ratio={magenta_ratio:.8f}"
            )
        poster_path = review_root / f"phase-3-reduced-motion-{name}-{size[0]}x{size[1]}.png"
        atomic_save_png(poster, poster_path)
        register_image(
            poster_path,
            "purpose-built reduced-motion dormant poster",
            variant,
            (1,),
            artDirection={
                "exactViewport": {"width": size[0], "height": size[1]},
                "directionalNeutralScrim": scrim_side,
                "magentaAdded": False,
                "magentaDominantPixelRatio": round(magenta_ratio, 9),
                "validatedDormantSourceGate": source_record["dormancyGate"],
                "poweredScreen": False,
                "conduction": False,
                "interfaceOrScanlineDetailAddedByPosterTransform": False,
            },
        )
        poster_records.append(poster_path)

    full_res_outputs = []
    full_res_outputs.extend(
        (path, "desktop", DESKTOP_FULL_RES_FRAMES[index])
        for index, path in enumerate(
            copy_full_resolution_stills(
                desktop_root, "desktop", DESKTOP_FULL_RES_FRAMES, still_root
            )
        )
    )
    full_res_outputs.extend(
        (path, "mobile", MOBILE_FULL_RES_FRAMES[index])
        for index, path in enumerate(
            copy_full_resolution_stills(mobile_root, "mobile", MOBILE_FULL_RES_FRAMES, still_root)
        )
    )
    for path, variant, frame in full_res_outputs:
        register_image(path, "selected full-resolution still", variant, (frame,))

    forward_review = review_root / "phase-3-desktop-forward-review.mp4"
    encode_atomic(
        ffmpeg,
        [*input_sequence_arguments(desktop_root, "desktop"), *h264_arguments(23, DESKTOP_REVIEW_SIZE)],
        forward_review,
    )
    forward_probe = verify_candidate(ffprobe, forward_review, DESKTOP_REVIEW_SIZE, "h264")
    register_video(
        forward_review,
        "complete compact forward desktop review",
        "desktop",
        {"order": "forward", "frameStart": 1, "frameEnd": 270},
        forward_probe,
        {"start": 0.0, "end": 1.0},
    )

    with tempfile.TemporaryDirectory(prefix="phase3-reverse-") as temporary_text:
        temporary = Path(temporary_text)
        for output_frame, source_frame in enumerate(range(FRAME_END, FRAME_START - 1, -1), start=1):
            link_or_copy(
                frame_path(desktop_root, "desktop", source_frame),
                temporary / f"phase3-reverse-{output_frame:04d}.png",
            )
        reverse_review = review_root / "phase-3-desktop-reverse-review.mp4"
        encode_atomic(
            ffmpeg,
            [
                *input_sequence_arguments(temporary, "reverse"),
                *h264_arguments(24, DESKTOP_REVIEW_SIZE),
            ],
            reverse_review,
        )
    reverse_probe = verify_candidate(ffprobe, reverse_review, DESKTOP_REVIEW_SIZE, "h264")
    register_video(
        reverse_review,
        "complete compact reverse desktop review",
        "desktop",
        {"order": "reverse", "frameStart": 270, "frameEnd": 1},
        reverse_probe,
        {"start": 1.0, "end": 0.0},
    )

    mobile_forward_review = review_root / "phase-3-mobile-forward-review.mp4"
    encode_atomic(
        ffmpeg,
        [
            *input_sequence_arguments(mobile_root, "mobile"),
            *h264_arguments(24, MOBILE_REVIEW_SIZE),
        ],
        mobile_forward_review,
    )
    mobile_forward_probe = verify_candidate(
        ffprobe, mobile_forward_review, MOBILE_REVIEW_SIZE, "h264"
    )
    register_video(
        mobile_forward_review,
        "complete transferable forward mobile review derived from the authored 720x1280 source",
        "mobile",
        {
            "order": "forward",
            "frameStart": FRAME_START,
            "frameEnd": FRAME_END,
            "frameCount": FRAME_COUNT,
            "sourceDimensions": {"width": MOBILE_SIZE[0], "height": MOBILE_SIZE[1]},
        },
        mobile_forward_probe,
        {
            "start": 0.0,
            "end": 1.0,
            "formula": "(frame - 1) / 269",
        },
    )

    with tempfile.TemporaryDirectory(prefix="phase3-mobile-reverse-") as temporary_text:
        temporary = Path(temporary_text)
        for output_frame, source_frame in enumerate(
            range(FRAME_END, FRAME_START - 1, -1), start=1
        ):
            link_or_copy(
                frame_path(mobile_root, "mobile", source_frame),
                temporary / f"phase3-reverse-{output_frame:04d}.png",
            )
        mobile_reverse_review = review_root / "phase-3-mobile-reverse-review.mp4"
        encode_atomic(
            ffmpeg,
            [
                *input_sequence_arguments(temporary, "reverse"),
                *h264_arguments(25, MOBILE_REVIEW_SIZE),
            ],
            mobile_reverse_review,
        )
    mobile_reverse_probe = verify_candidate(
        ffprobe, mobile_reverse_review, MOBILE_REVIEW_SIZE, "h264"
    )
    register_video(
        mobile_reverse_review,
        "complete transferable reverse mobile review derived from the authored 720x1280 source",
        "mobile",
        {
            "order": "reverse",
            "frameStart": FRAME_END,
            "frameEnd": FRAME_START,
            "frameCount": FRAME_COUNT,
            "sourceDimensions": {"width": MOBILE_SIZE[0], "height": MOBILE_SIZE[1]},
        },
        mobile_reverse_probe,
        {
            "start": 1.0,
            "end": 0.0,
            "formula": "(frame - 1) / 269",
        },
    )

    with tempfile.TemporaryDirectory(prefix="phase3-scrub-") as temporary_text:
        temporary = Path(temporary_text)
        scrub_frames = build_scrub_sequence(desktop_root, temporary)
        scrub_review = review_root / "phase-3-desktop-scrub-simulation-review.mp4"
        encode_atomic(
            ffmpeg,
            [
                "-framerate",
                str(FPS),
                "-start_number",
                "1",
                "-i",
                str(temporary / "scrub-%04d.png"),
                "-frames:v",
                str(scrub_frames),
                "-an",
                "-map_metadata",
                "-1",
                *h264_arguments(23),
            ],
            scrub_review,
        )
    scrub_probe = probe_media(ffprobe, scrub_review)
    if scrub_probe["audioStreamCount"] != 0 or (
        scrub_probe["width"], scrub_probe["height"]
    ) != DESKTOP_REVIEW_SIZE:
        raise ValueError(f"Scrub review verification failed: {scrub_probe}")
    register_video(
        scrub_review,
        "deterministic scrub simulation: forward/jump/reverse/alternating/portal/conduction",
        "desktop",
        [
            {
                "label": label,
                "frames": list(frames),
                "normalizedProgress": [normalized_progress(frame) for frame in frames],
            }
            for label, frames in SCRUB_SEGMENTS
        ],
        scrub_probe,
        "non-linear authored seek pattern; exact values recorded with each segment",
    )

    media_lab_readme_line = (
        "14. `phase-3-media-lab-scrub-evidence.webm` — verified silent headed interaction capture"
        if media_lab_recording_registered
        else (
            "14. Optional `phase-3-media-lab-scrub-evidence.webm` was not present; "
            "no synthetic headed-interaction evidence was substituted"
        )
    )

    readme = f"""# Phase 3 CRT Opening — Human Review Package

This compact package contains review evidence only. It never contains the raw
desktop or mobile PNG sequences and it is not a Phase 4 integration.

## Review order

1. `phase-3-desktop-conduction-contact-sheet.png`
2. `phase-3-crt-startup-contact-sheet.png`
3. `phase-3-desktop-codec-comparison-contact-sheet.png`
4. `phase-3-mobile-codec-comparison-contact-sheet.png`
5. `phase-3-camera-portal-contact-sheet.png`
6. `phase-3-portal-alignment-contact-sheet.png`
7. `phase-3-portal-safe-zone-matrix.png`
8. `phase-3-to-phase-2b-handoff-comparison.png`
9. mobile 390/360/320 px, landscape, and reduced-motion evidence
10. selected full-resolution stills
11. `phase-3-desktop-forward-review.mp4` and `phase-3-desktop-reverse-review.mp4`
12. `phase-3-mobile-forward-review.mp4` and `phase-3-mobile-reverse-review.mp4`
13. `phase-3-desktop-scrub-simulation-review.mp4`
{media_lab_readme_line}

The portal guides exist only in evidence. They are not baked into production
media. The Phase 2B ENTRY panel is cropped from the frozen accepted evidence
sheet with SHA-256 `{PHASE2B_ENTRY_SHEET_SHA256}`.

## Identity

- Timeline: {FRAME_COUNT} frames at {FPS} fps ({DURATION_SECONDS:.1f} seconds)
- Selected candidate seek cadence: {GOP}-frame ({round(GOP / FPS * 1000)} ms) closed/independent GOP
- Accepted CRT source SHA-256: `{ACCEPTED_CRT_SHA256}`
- Review branch: `{identity['branch']}`
- Review SHA: `{identity['branchShaDeclaredForReview']}`
- Exact file dimensions, byte sizes, hashes, source frames, normalized progress,
  and production-candidate hashes: `phase-3-review-manifest.json`

## Final pushed SHA binding

The full packaging pass necessarily precedes the commit that contains its
tracked outputs. After that commit is pushed, rerun this same script with only
`--finalize-external-only` and the outside-Git `--review-zip` path. That mode
requires `HEAD == upstream`, writes no tracked files, and emits exactly:

- `phase-3-crt-opening-human-review.zip`
- `phase-3-crt-opening-human-review.manifest.json`
- `phase-3-crt-opening-human-review.zip.sha256`

## Human gates

Judge the physical proving field and spiral conduction, authentic CRT startup,
camera-to-portal transition, authored mobile composition including the 320 px
gate, and the reduced-motion dormant composition. Phase 2B is frozen; repair
Phase 3 if the handoff does not feel inevitable.
"""
    atomic_text(readme_path, readme)

    script_path = Path(__file__).resolve()
    manifest = {
        "schema": "quantum-hub.phase-3-crt-opening.post-production.v1",
        "status": "PASS",
        "deterministic": True,
        "repository": identity,
        "timeline": {
            "fps": FPS,
            "frameStart": FRAME_START,
            "frameEnd": FRAME_END,
            "frameCount": FRAME_COUNT,
            "durationSeconds": DURATION_SECONDS,
            "normalizedProgressFormula": "(frame - 1) / 269",
        },
        "sourceMasters": {
            "acceptedCRT": {
                "repositoryRelativePath": ACCEPTED_CRT_RELATIVE.as_posix(),
                "bytes": accepted_crt.stat().st_size,
                "sha256": ACCEPTED_CRT_SHA256,
            },
            "phase3DerivativeCRT": {
                "repositoryRelativePath": DERIVATIVE_CRT_RELATIVE.as_posix(),
                "bytes": derivative_crt.stat().st_size,
                "sha256": sha256_file(derivative_crt),
            },
            "desktopPNGSequence": desktop_source,
            "mobilePNGSequence": mobile_source,
            "acceptedPhase2BEntryEvidence": {
                "repositoryRelativePath": PHASE2B_ENTRY_SHEET_RELATIVE.as_posix(),
                "bytes": phase2b_reference.stat().st_size,
                "sha256": PHASE2B_ENTRY_SHEET_SHA256,
                "entryCrop": {"left": 24, "top": 116, "width": 720, "height": 450},
            },
        },
        "toolchain": {"ffmpeg": ffmpeg_build, "ffprobe": ffprobe_build, "pillow": Image.__version__},
        "packager": {
            "repositoryRelativePath": script_path.relative_to(repository).as_posix(),
            "bytes": script_path.stat().st_size,
            "sha256": sha256_file(script_path),
        },
        "deliveryCandidates": candidates,
        "deliveryPolicy": {
            "integrationStatus": "ISOLATED — not copied into public/ and not connected to production routes",
            "selectionStatus": "Human visual, seek, and browser acceptance required before Phase 4 recommendation",
            "rawFramesCommitted": False,
            "audioTracks": 0,
            "selectedGopFrames": GOP,
            "selectedGopMilliseconds": round(GOP / FPS * 1000),
        },
        "mediaLabEvidence": {
            "optionalRepositoryRelativePath": media_lab_recording.relative_to(repository).as_posix(),
            "registered": media_lab_recording_registered,
            "syntheticHeadedInteractionSubstituteCreated": False,
        },
        "reviewArtifacts": review_outputs,
        "reviewReadme": {
            **file_record(readme_path),
            "repositoryRelativePath": readme_path.relative_to(repository).as_posix(),
        },
        "externalReviewPackage": {
            "filename": review_zip.name,
            "containsRawFrameSequences": False,
            "containsProductionDeliveryCandidates": False,
            "productionCandidateHashesAreRecorded": True,
            "shaBindingAtFullPackaging": "REVIEW CAPTURE HEAD — not the later evidence commit",
            "postPushExternalFinalizationRequired": True,
            "postPushFinalizationWritesTrackedFiles": False,
            "postPushOutputNames": [
                "phase-3-crt-opening-human-review.zip",
                "phase-3-crt-opening-human-review.manifest.json",
                "phase-3-crt-opening-human-review.zip.sha256",
            ],
        },
    }
    atomic_json(manifest_path, manifest)

    review_zip_files.append((readme_path, "README.md"))
    review_zip_files.append((manifest_path, "phase-3-review-manifest.json"))
    deterministic_zip(review_zip, review_zip_files)
    zip_hash = sha256_file(review_zip)
    zip_sidecar = review_zip.with_suffix(review_zip.suffix + ".sha256")
    atomic_text(zip_sidecar, f"{zip_hash}  {review_zip.name}\n")

    summary = {
        "status": "PASS",
        "deliveryCandidates": [
            {
                "id": candidate["id"],
                "path": str(repository / candidate["repositoryRelativePath"]),
                "bytes": candidate["verification"]["bytes"],
                "sha256": candidate["verification"]["sha256"],
            }
            for candidate in candidates
        ],
        "reviewManifest": str(manifest_path),
        "reviewArtifactCount": len(review_outputs),
        "postPushExternalFinalizationRequired": True,
        "postPushCommand": (
            f"{sys.executable} {Path(__file__).resolve()} --finalize-external-only "
            f"--review-zip {review_zip}"
        ),
        "externalReviewZip": {
            "path": str(review_zip),
            "bytes": review_zip.stat().st_size,
            "sha256": zip_hash,
            "sidecar": str(zip_sidecar),
        },
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
