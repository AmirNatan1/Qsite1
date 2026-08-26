"""Finalize privacy-clean, package-sized Phase 4-R1.1 CRT evidence.

This ordinary-Python companion never imports or launches Blender.  It consumes
only a complete, receipt-authenticated external raw root produced by
``render_phase4r1_1_crt_phosphor_diagnostic.py``.  It strips Blender text
metadata from the five public PNG stills without changing IDAT or decoded
pixels, encodes exactly F345-F464 as one four-second H.264 sample, creates one
compact sheet, and publishes an independently verifiable public manifest.

The 120 raw motion PNGs are never copied into the public tree or review ZIP.
"""

from __future__ import annotations

import argparse
from fractions import Fraction
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
from typing import Any
import uuid
import zlib


sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
import phase4r1_1_repair_config as cfg
import render_phase4r1_1_crt_phosphor_diagnostic as raw


PUBLIC_MANIFEST_SCHEMA = "quantum-hub.phase-4-r1-1.crt-phosphor-public-manifest.v1"
FINALIZATION_SCHEMA = "quantum-hub.phase-4-r1-1.crt-phosphor-finalization.v1"
SOURCE_DIFFERENCE_SCHEMA = "quantum-hub.phase-4-r1-1.crt-phosphor-source-difference.v1"
MACHINE_REVIEW_SCHEMA = "quantum-hub.phase-4-r1-1.crt-phosphor-machine-review.v1"
FAILURE_SCHEMA = "quantum-hub.phase-4-r1-1.crt-phosphor-finalization-failure.v1"

METADATA_CHUNKS = {"tEXt", "zTXt", "iTXt", "eXIf"}
PUBLIC_MANIFEST = "public/reports/crt-phosphor-public-manifest.json"
FINALIZATION_PATH = "authority/crt-phosphor-finalization.json"
SOURCE_DIFFERENCE_PATH = "public/reports/exact-q-source-difference.json"
MACHINE_REVIEW_PATH = "public/reports/crt-phosphor-machine-review.json"
SHEET_PATH = "public/sheets/phase4r1-1-exact-q-crt-phosphor-sheet.jpg"
VIDEO_PATH = "public/video/phase4r1-1-q-phosphor-motion-F345-F464.mp4"
Q_SOURCE_PUBLIC_PATH = "public/source/quantum-icon-pre-crt-effect.png"


def public_still_path(frame: int, role: str) -> str:
    return f"public/stills/phase4r1-1-crt-{role}-F{frame:03d}.png"


def resolve_executable(value: str) -> Path:
    candidate = Path(value)
    if candidate.is_file():
        return candidate.resolve()
    found = shutil.which(value)
    if found is None:
        raise RuntimeError(f"required executable was not found: {Path(value).name}")
    return Path(found).resolve()


def executable_record(path: Path, role: str) -> dict[str, Any]:
    record = raw.file_record(path)
    return {"role": role, "name": path.name, **record}


def run_tool(command: list[str], label: str) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        command,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode != 0:
        detail = raw.safe_error_text(RuntimeError(result.stderr.strip() or result.stdout.strip()))
        raise RuntimeError(f"{label} failed with exit code {result.returncode}: {detail}")
    return result


def path_record(root: Path, path: Path) -> dict[str, Any]:
    return {"path": path.relative_to(root).as_posix(), **raw.file_record(path)}


def logical_public_record(root: Path, public_staging: Path, path: Path) -> dict[str, Any]:
    return {"path": f"public/{path.relative_to(public_staging).as_posix()}", **raw.file_record(path)}


def receipt_contract(receipt: dict[str, Any], kind: str, frame: int, role: str, plan_record: dict[str, Any]) -> None:
    expected = {
        "schema": raw.RECEIPT_SCHEMA,
        "status": "PASS",
        "kind": kind,
        "frame": frame,
        "role": role,
        "sourcePlan": plan_record,
        "authorization": cfg.AUTHORIZATION,
    }
    for key, value in expected.items():
        if receipt.get(key) != value:
            raise RuntimeError(f"raw receipt contract differs at {kind} F{frame:03d}: {key}")
    settings = receipt.get("renderSettings", {})
    width, height, samples, motion_blur = (
        (raw.STILL_WIDTH, raw.STILL_HEIGHT, raw.STILL_SAMPLES, False)
        if kind == "still"
        else (raw.MOTION_WIDTH, raw.MOTION_HEIGHT, raw.MOTION_SAMPLES, True)
    )
    fixed_settings = {
        "engine": "CYCLES",
        "family": "desktop",
        "camera": raw.DESKTOP_CAMERA,
        "width": width,
        "height": height,
        "samples": samples,
        "adaptiveSampling": True,
        "denoising": True,
        "denoiser": "OPENIMAGEDENOISE",
        "motionBlur": motion_blur,
        "fps": raw.MOTION_FPS,
        "viewTransform": "AgX",
        "look": "AgX - Medium High Contrast",
        "exposureStops": 1.0,
        "filmTransparent": False,
        "pixelAspect": [1.0, 1.0],
        "png": {"colorMode": "RGB", "colorDepth": 8, "compression": 30},
    }
    for key, value in fixed_settings.items():
        if settings.get(key) != value:
            raise RuntimeError(f"raw render settings differ at {kind} F{frame:03d}: {key}")
    if settings.get("computeDevice", {}).get("sceneDevice") not in {"CPU", "GPU"}:
        raise RuntimeError(f"raw receipt lacks a valid compute-device record at F{frame:03d}")
    raw.assert_no_private_strings(receipt, f"receipt F{frame:03d}")


def validate_complete_raw_root(root: Path) -> tuple[dict[str, Any], dict[str, Any], dict[tuple[str, int], dict[str, Any]]]:
    root = raw.validate_external_root_path(root, must_exist=True)
    raw.assert_no_staging_files(root)
    plan, audit = raw.load_plan(root)
    plan_path = root / "authority/evidence-plan.json"
    plan_record = {"path": "authority/evidence-plan.json", **raw.file_record(plan_path)}
    expected = raw.expected_paths(root)
    expected_pngs = {entry[0].resolve() for entry in expected.values()}
    expected_receipts = {entry[1].resolve() for entry in expected.values()}
    actual_pngs = {path.resolve() for path in (root / "raw").rglob("*.png")}
    actual_receipts = {path.resolve() for path in (root / "raw").rglob("*.receipt.json")}
    if actual_pngs != expected_pngs or actual_receipts != expected_receipts:
        raise RuntimeError(
            "raw root is not the exact 125-image/125-receipt topology: "
            f"png={len(actual_pngs)}, receipts={len(actual_receipts)}"
        )
    receipts: dict[tuple[str, int], dict[str, Any]] = {}
    manifest_files = []
    for (kind, frame), (image, receipt_path, width, height, samples, motion_blur, role) in sorted(expected.items()):
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        receipt_contract(receipt, kind, frame, role, plan_record)
        png = raw.validate_raw_png(image, width, height)
        expected_file = {**path_record(root, image), **png}
        if receipt.get("file") != expected_file:
            raise RuntimeError(f"raw image/receipt bytes or PNG authority differ at F{frame:03d}")
        if receipt["renderSettings"]["samples"] != samples or receipt["renderSettings"]["motionBlur"] != motion_blur:
            raise RuntimeError(f"raw image sample/motion-blur authority differs at F{frame:03d}")
        receipts[(kind, frame)] = receipt
        manifest_files.append(receipt["file"] | {"kind": kind, "frame": frame, "role": role})
    expected_chunks = []
    for index, (start, end) in enumerate(raw.MOTION_CHUNKS, 1):
        path = root / "raw/chunks" / f"chunk-F{start:03d}-F{end:03d}.json"
        if not path.is_file():
            raise RuntimeError(f"raw motion chunk report is missing: F{start:03d}-F{end:03d}")
        chunk = json.loads(path.read_text(encoding="utf-8"))
        expected_frames = [
            receipts[("motion", frame)]["file"] | {"frame": frame}
            for frame in range(start, end + 1)
        ]
        expected_value = {
            "schema": raw.CHUNK_SCHEMA,
            "status": "PASS",
            "chunkIndex": index,
            "frameStart": start,
            "frameEnd": end,
            "frameCount": 30,
            "frames": expected_frames,
            "sourcePlan": plan_record,
            "authorization": cfg.AUTHORIZATION,
        }
        if chunk != expected_value:
            raise RuntimeError(f"raw chunk report differs: {path.name}")
        expected_chunks.append({"path": path.relative_to(root).as_posix(), **raw.file_record(path)})
    chunk_paths = {path.resolve() for path in (root / "raw/chunks").glob("*.json")}
    expected_chunk_paths = {
        (root / "raw/chunks" / f"chunk-F{start:03d}-F{end:03d}.json").resolve()
        for start, end in raw.MOTION_CHUNKS
    }
    if chunk_paths != expected_chunk_paths:
        raise RuntimeError("raw chunk directory contains an unexpected JSON file")
    manifest_path = root / "raw/phase4r1-1-crt-phosphor-raw-manifest.json"
    stored_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    expected_manifest = {
        "schema": raw.RAW_MANIFEST_SCHEMA,
        "status": "PASS",
        "sourcePlan": plan_record,
        "expectedPngCount": raw.EXPECTED_RAW_PNG_COUNT,
        "completedPngCount": raw.EXPECTED_RAW_PNG_COUNT,
        "missingPngCount": 0,
        "missing": [],
        "files": manifest_files,
        "rawPackageEligible": False,
        "authorization": cfg.AUTHORIZATION,
        "humanReviewDecision": "PENDING",
    }
    if stored_manifest != expected_manifest:
        raise RuntimeError("stored raw manifest differs from a complete receipt/hash rescan")
    raw.assert_no_private_strings(stored_manifest, "raw manifest")
    authority = {
        "plan": plan_record,
        "sourceAudit": {"path": "authority/source-audit.json", **raw.file_record(root / "authority/source-audit.json")},
        "rawManifest": {"path": "raw/phase4r1-1-crt-phosphor-raw-manifest.json", **raw.file_record(manifest_path)},
        "chunks": expected_chunks,
    }
    return plan, authority, receipts


def paeth(a: int, b: int, c: int) -> int:
    estimate = a + b - c
    da = abs(estimate - a)
    db = abs(estimate - b)
    dc = abs(estimate - c)
    if da <= db and da <= dc:
        return a
    if db <= dc:
        return b
    return c


def decoded_pixels(path: Path) -> bytes:
    parsed = raw.parse_png(path)
    if parsed["bitDepth"] != 8 or parsed["colorType"] not in {2, 6} or parsed["interlace"] != 0:
        raise RuntimeError(f"pixel decoder supports only non-interlaced 8-bit RGB/RGBA: {path.name}")
    channels = 3 if parsed["colorType"] == 2 else 4
    stride = parsed["width"] * channels
    compressed = b"".join(chunk["data"] for chunk in parsed["chunks"] if chunk["type"] == "IDAT")
    scanlines = zlib.decompress(compressed)
    expected_bytes = (stride + 1) * parsed["height"]
    if len(scanlines) != expected_bytes:
        raise RuntimeError(f"unexpected decompressed PNG scanline length: {path.name}")
    rows: list[bytes] = []
    offset = 0
    previous = bytearray(stride)
    for _ in range(parsed["height"]):
        filter_type = scanlines[offset]
        source = scanlines[offset + 1 : offset + 1 + stride]
        offset += stride + 1
        row = bytearray(stride)
        for index, encoded in enumerate(source):
            left = row[index - channels] if index >= channels else 0
            up = previous[index]
            up_left = previous[index - channels] if index >= channels else 0
            if filter_type == 0:
                predictor = 0
            elif filter_type == 1:
                predictor = left
            elif filter_type == 2:
                predictor = up
            elif filter_type == 3:
                predictor = (left + up) // 2
            elif filter_type == 4:
                predictor = paeth(left, up, up_left)
            else:
                raise RuntimeError(f"unsupported PNG row filter {filter_type}: {path.name}")
            row[index] = (encoded + predictor) & 0xFF
        rows.append(bytes(row))
        previous = row
    return b"".join(rows)


def sanitize_png(source: Path, target: Path) -> dict[str, Any]:
    before = raw.parse_png(source)
    before_pixels = decoded_pixels(source)
    kept = []
    removed = []
    for chunk in before["chunks"]:
        if chunk["type"] in METADATA_CHUNKS:
            removed.append({"type": chunk["type"], "bytes": chunk["bytes"]})
        else:
            kept.append(chunk["raw"])
    payload = raw.PNG_SIGNATURE + b"".join(kept)
    raw.atomic_bytes_new(target, payload)
    after = raw.parse_png(target)
    after_pixels = decoded_pixels(target)
    if (
        (before["width"], before["height"], before["bitDepth"], before["colorType"], before["interlace"])
        != (after["width"], after["height"], after["bitDepth"], after["colorType"], after["interlace"])
        or before["idatSha256"] != after["idatSha256"]
        or before_pixels != after_pixels
        or any(chunk["type"] in METADATA_CHUNKS for chunk in after["chunks"])
    ):
        raise RuntimeError(f"privacy sanitation changed PNG pixels or left metadata: {source.name}")
    return {
        "source": raw.file_record(source),
        "public": raw.file_record(target),
        "width": before["width"],
        "height": before["height"],
        "bitDepth": before["bitDepth"],
        "colorType": before["colorType"],
        "removedChunks": removed,
        "idatSha256Before": before["idatSha256"],
        "idatSha256After": after["idatSha256"],
        "idatUnchanged": True,
        "decodedPixelSha256Before": raw.sha256_bytes(before_pixels),
        "decodedPixelSha256After": raw.sha256_bytes(after_pixels),
        "decodedPixelsUnchanged": True,
        "privateMetadataRemoved": True,
    }


def write_exact_q_source(target: Path) -> dict[str, Any]:
    payload = raw.Q_TRACKED_PATH.read_bytes()
    if len(payload) != cfg.EXACT_Q_BYTES or raw.sha256_bytes(payload) != cfg.EXACT_Q_SHA256:
        raise RuntimeError("tracked pre-effects Q changed before public copy")
    raw.atomic_bytes_new(target, payload)
    if raw.file_record(target) != {"bytes": cfg.EXACT_Q_BYTES, "sha256": cfg.EXACT_Q_SHA256}:
        raise RuntimeError("public pre-effects Q copy is not byte-exact")
    parsed = raw.parse_png(target)
    if (parsed["width"], parsed["height"]) != (2048, 2048):
        raise RuntimeError("public pre-effects Q dimensions differ")
    return {
        "bytes": cfg.EXACT_Q_BYTES,
        "sha256": cfg.EXACT_Q_SHA256,
        "width": 2048,
        "height": 2048,
        "byteExactCopy": True,
    }


def load_sheet_font(pixel_size: int) -> tuple[Any, dict[str, Any]]:
    try:
        from PIL import ImageFont
    except ModuleNotFoundError as error:
        raise RuntimeError("Pillow is required to load a readable CRT sheet font") from error

    windows_root = Path(os.environ.get("WINDIR", r"C:\Windows"))
    candidates = (
        ("system-segoe-ui", windows_root / "Fonts/segoeui.ttf"),
        ("system-arial", windows_root / "Fonts/arial.ttf"),
        ("system-dejavu-sans", Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")),
        ("system-liberation-sans", Path("/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf")),
        ("system-macos-arial", Path("/Library/Fonts/Arial.ttf")),
    )
    attempts: list[tuple[str, Any]] = []
    for source, path in candidates:
        if path.is_file():
            attempts.append((source, path))
    attempts.append(("pillow-dejavu-sans", "DejaVuSans.ttf"))
    for source, value in attempts:
        try:
            font = ImageFont.truetype(str(value), size=pixel_size)
        except (OSError, ValueError):
            continue
        bounds = font.getbbox("Readable Ag")
        glyph_height = int(bounds[3] - bounds[1])
        if glyph_height < max(16, int(pixel_size * 0.55)):
            continue
        family, style = font.getname()
        return font, {
            "source": source,
            "family": str(family),
            "style": str(style),
            "pixelSize": pixel_size,
            "measuredGlyphHeight": glyph_height,
        }
    try:
        fallback = ImageFont.load_default(size=pixel_size)
    except TypeError:  # Pillow before scalable built-in fonts.
        fallback = ImageFont.load_default()
    bounds = fallback.getbbox("Readable Ag")
    glyph_height = int(bounds[3] - bounds[1])
    if glyph_height < max(16, int(pixel_size * 0.55)):
        raise RuntimeError("no dependency-free font is large enough for readable CRT sheet captions")
    family, style = fallback.getname()
    return fallback, {
        "source": "pillow-scalable-default",
        "family": str(family),
        "style": str(style),
        "pixelSize": pixel_size,
        "measuredGlyphHeight": glyph_height,
    }


def create_sheet(public_staging: Path, still_paths: dict[int, Path], q_source: Path, target: Path) -> dict[str, Any]:
    try:
        from PIL import Image, ImageDraw, ImageOps
    except ModuleNotFoundError as error:
        raise RuntimeError("Pillow is required to compose the CRT comparison sheet") from error

    width, height = 2400, 1600
    columns, rows = 4, 2
    cell_width, cell_height = width // columns, height // rows
    canvas = Image.new("RGB", (width, height), "#0e1112")
    draw = ImageDraw.Draw(canvas)
    caption_font, caption_font_record = load_sheet_font(28)
    panel_font, panel_font_record = load_sheet_font(30)
    panel_small_font, panel_small_font_record = load_sheet_font(24)

    def wrap_caption(label: str, maximum_width: int) -> str:
        lines: list[str] = []
        current = ""
        for word in label.split():
            candidate = word if not current else f"{current} {word}"
            bounds = draw.textbbox((0, 0), candidate, font=caption_font)
            if current and bounds[2] - bounds[0] > maximum_width:
                lines.append(current)
                current = word
            else:
                current = candidate
        if current:
            lines.append(current)
        return "\n".join(lines)

    def place_image(index: int, image: Any, label: str, *, crop: bool = False) -> None:
        column = index % columns
        row = index // columns
        x0, y0 = column * cell_width, row * cell_height
        draw.rectangle((x0, y0, x0 + cell_width - 1, y0 + cell_height - 1), outline="#343a3b", width=2)
        caption_height = 112
        area = (cell_width - 36, cell_height - caption_height - 28)
        source = image.convert("RGB")
        if crop:
            source = ImageOps.fit(source, area, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
        else:
            source.thumbnail(area, Image.Resampling.LANCZOS)
        px = x0 + (cell_width - source.width) // 2
        py = y0 + 14 + (cell_height - caption_height - 28 - source.height) // 2
        canvas.paste(source, (px, py))
        caption_top = y0 + cell_height - caption_height
        draw.rectangle((x0 + 1, caption_top, x0 + cell_width - 2, y0 + cell_height - 2), fill="#111718")
        wrapped = wrap_caption(label, cell_width - 36)
        bounds = draw.multiline_textbbox((0, 0), wrapped, font=caption_font, spacing=5)
        text_height = bounds[3] - bounds[1]
        draw.multiline_text(
            (x0 + 18, caption_top + (caption_height - text_height) // 2 - bounds[1]),
            wrapped,
            fill="#e7e9e8",
            font=caption_font,
            spacing=5,
        )

    with Image.open(q_source) as image:
        place_image(0, image.copy(), "Exact pre-effects Q — 69,348 B — SHA 009c494d…")
    difference = Image.new("RGB", (560, 690), "#090c0d")
    diff_draw = ImageDraw.Draw(difference)
    diff_draw.rectangle((36, 36, 524, 654), outline="#2b8c78", width=4)
    diff_draw.text((72, 160), "PACKED vs TRACKED", fill="#d7dbda", font=panel_font)
    diff_draw.text((72, 245), "DIFFERENT BYTES: 0", fill="#7ee0bd", font=panel_font)
    diff_draw.text((72, 305), "DIFFERENT PIXELS: 0", fill="#7ee0bd", font=panel_font)
    diff_draw.text((72, 390), "PRE-EFFECTS SOURCE EXACT", fill="#d7dbda", font=panel_font)
    diff_draw.text(
        (72, 480),
        "Physical render intentionally differs",
        fill="#a9b1af",
        font=panel_small_font,
    )
    place_image(1, difference, "Zero-difference source authority")
    labels = {
        356: "F356 — first readable Q — Cycles 192 spp",
        370: "F370 — stable Q primary — Cycles 192 spp",
        405: "F405 — late Q hold — Cycles 192 spp",
        406: "F406 — beginning of push — Cycles 192 spp",
        480: "F480 — close physical glass — Cycles 192 spp",
    }
    for index, frame in enumerate((356, 370, 405, 406, 480), start=2):
        with Image.open(still_paths[frame]) as image:
            place_image(index, image.copy(), labels[frame])
    with Image.open(still_paths[480]) as image:
        source = image.convert("RGB")
        left = int(source.width * 0.18)
        top = int(source.height * 0.12)
        right = max(left + 1, int(source.width * 0.82))
        bottom = max(top + 1, int(source.height * 0.88))
        place_image(7, source.crop((left, top, right, bottom)), "F480 — unbrightened glass crop", crop=True)

    target.parent.mkdir(parents=True, exist_ok=True)
    pending = target.with_name(f".{target.stem}.pending-{uuid.uuid4().hex}{target.suffix}")
    canvas.save(
        pending,
        format="JPEG",
        quality=92,
        optimize=True,
        progressive=True,
        exif=b"",
    )
    with Image.open(pending) as check:
        if check.size != (width, height) or check.mode != "RGB" or len(check.getexif()) != 0:
            raise RuntimeError("CRT sheet dimensions/mode/metadata self-check failed")
    if target.exists():
        raise RuntimeError("refusing to overwrite CRT comparison sheet")
    os.replace(pending, target)
    return {
        "width": width,
        "height": height,
        "mediaType": "image/jpeg",
        "quality": 92,
        "exifEntries": 0,
        "exposureAdjusted": False,
        "captionFont": caption_font_record,
        "panelFont": panel_font_record,
        "panelSmallFont": panel_small_font_record,
        "captionsClearlyReadable": caption_font_record["measuredGlyphHeight"] >= 16,
        "panels": [
            "exact pre-effects Q",
            "zero-difference source authority",
            "F356 first readable Q",
            "F370 stable Q primary",
            "F405 late Q hold",
            "F406 beginning of push",
            "F480 close physical glass",
            "F480 unbrightened glass crop",
        ],
    }


def parse_ratio(value: str) -> Fraction:
    try:
        return Fraction(value)
    except (ValueError, ZeroDivisionError) as error:
        raise RuntimeError(f"invalid ffprobe frame-rate ratio: {value}") from error


def probe_video(ffprobe: Path, video: Path) -> dict[str, Any]:
    command = [
        str(ffprobe),
        "-v",
        "error",
        "-count_frames",
        "-show_entries",
        "stream=index,codec_name,codec_type,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_frames,nb_read_frames,duration:format=format_name,duration,nb_streams",
        "-of",
        "json",
        str(video),
    ]
    result = run_tool(command, "ffprobe")
    try:
        value = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError("ffprobe did not return valid JSON") from error
    streams = value.get("streams", [])
    if len(streams) != 1 or streams[0].get("codec_type") != "video":
        raise RuntimeError("Q motion sample must have exactly one video stream and no audio/data streams")
    stream = streams[0]
    if (
        stream.get("codec_name") != "h264"
        or (int(stream.get("width", 0)), int(stream.get("height", 0))) != (raw.MOTION_WIDTH, raw.MOTION_HEIGHT)
        or stream.get("pix_fmt") != "yuv420p"
        or parse_ratio(stream.get("r_frame_rate", "0/1")) != Fraction(30, 1)
        or parse_ratio(stream.get("avg_frame_rate", "0/1")) != Fraction(30, 1)
    ):
        raise RuntimeError("Q motion codec/dimensions/pixel-format/frame-rate authority differs")
    frame_values = [stream.get("nb_read_frames"), stream.get("nb_frames")]
    observed_counts = [int(item) for item in frame_values if item not in {None, "N/A"}]
    if not observed_counts or any(item != 120 for item in observed_counts):
        raise RuntimeError(f"Q motion must contain exactly 120 frames, got {frame_values}")
    format_record = value.get("format", {})
    duration = float(format_record.get("duration", stream.get("duration", 0.0)))
    if abs(duration - 4.0) > 1e-6 or int(format_record.get("nb_streams", 0)) != 1:
        raise RuntimeError(f"Q motion duration/stream count differs: duration={duration}")
    return {
        "codec": "h264",
        "pixelFormat": "yuv420p",
        "width": raw.MOTION_WIDTH,
        "height": raw.MOTION_HEIGHT,
        "frameRate": "30/1",
        "frameCount": 120,
        "durationSeconds": duration,
        "streamCount": 1,
        "audioStreams": 0,
        "dataStreams": 0,
        "subtitleStreams": 0,
    }


def encode_video(root: Path, public_staging: Path, ffmpeg: Path, ffprobe: Path, target: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    target.parent.mkdir(parents=True, exist_ok=True)
    pending = target.with_name(f".{target.stem}.pending-{uuid.uuid4().hex}{target.suffix}")
    input_pattern = root / "raw/motion/F%03d.png"
    command = [
        str(ffmpeg),
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-n",
        "-framerate",
        "30",
        "-start_number",
        str(raw.MOTION_START),
        "-i",
        str(input_pattern),
        "-frames:v",
        str(len(raw.MOTION_FRAMES)),
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-an",
        "-map_metadata",
        "-1",
        "-metadata",
        "encoder=",
        "-movflags",
        "+faststart",
        str(pending),
    ]
    run_tool(command, "ffmpeg Q motion encode")
    if not pending.is_file() or pending.stat().st_size <= 0:
        raise RuntimeError("ffmpeg did not emit the bounded Q motion sample")
    probe = probe_video(ffprobe, pending)
    if target.exists():
        raise RuntimeError("refusing to overwrite Q motion sample")
    os.replace(pending, target)
    if probe_video(ffprobe, target) != probe:
        raise RuntimeError("Q motion authority changed during atomic publication")
    command_record = {
        "template": "<FFMPEG> -hide_banner -loglevel error -nostdin -n -framerate 30 -start_number 345 -i <RAW_MOTION>/F%03d.png -frames:v 120 -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -an -map_metadata -1 -metadata encoder= -movflags +faststart <OUTPUT>",
        "inputFrameRange": [345, 464],
        "inputFrameCount": 120,
        "outputContainsRawFrames": False,
    }
    raw.assert_no_private_strings(command_record, "ffmpeg command record")
    return probe, command_record


def binary_privacy_scan(path: Path) -> dict[str, Any]:
    payload = path.read_bytes()
    views = [payload.decode("latin1", errors="ignore")]
    if len(payload) % 2:
        padded = payload + b"\x00"
    else:
        padded = payload
    views.append(padded.decode("utf-16le", errors="ignore"))
    private_literals = [
        str(cfg.REPO_ROOT.resolve()),
        str(Path.home().resolve()),
        str(Path(tempfile.gettempdir()).resolve()),
        str(cfg.DERIVATIVE.resolve()),
    ]
    hits = []
    for view in views:
        folded = view.casefold().replace("/", "\\")
        for literal in private_literals:
            normalized = literal.casefold().replace("/", "\\")
            if normalized and normalized in folded:
                hits.append("private-literal")
        for pattern in raw.PRIVATE_PATTERNS:
            if pattern.search(view):
                hits.append("private-pattern")
    if hits:
        raise RuntimeError(f"public asset contains private-path material: {path.name}")
    return {"path": path.name, "bytesScanned": len(payload), "privatePathHits": 0}


def privacy_scan_tree(public_root: Path) -> dict[str, Any]:
    files = sorted(path for path in public_root.rglob("*") if path.is_file())
    results = [binary_privacy_scan(path) for path in files]
    return {
        "fileCount": len(files),
        "byteCount": sum(path.stat().st_size for path in files),
        "privatePathHits": 0,
        "files": [{"path": path.relative_to(public_root).as_posix(), "bytesScanned": result["bytesScanned"]} for path, result in zip(files, results)],
        "passes": True,
    }


def purpose_for(path: str) -> dict[str, Any]:
    if path.startswith("public/stills/"):
        frame = int(path.rsplit("F", 1)[1].split(".", 1)[0])
        role = dict(raw.STILLS)[frame]
        return {
            "purpose": f"privacy-clean {role} final-quality Cycles still",
            "family": "desktop",
            "frame": frame,
            "renderEngine": "CYCLES",
            "samples": 192,
            "viewport": "1440x900",
        }
    if path == VIDEO_PATH:
        return {
            "purpose": "bounded final-quality Q settling, hold, and push sample",
            "family": "desktop",
            "frameRange": [345, 464],
            "renderEngine": "CYCLES",
            "samples": 96,
            "viewport": "960x600",
        }
    if path == SHEET_PATH:
        return {"purpose": "compact exact-Q and physical CRT comparison sheet", "viewport": "2400x1600"}
    if path == Q_SOURCE_PUBLIC_PATH:
        return {"purpose": "byte-exact pre-effects Q source authority", "viewport": "2048x2048"}
    if path == SOURCE_DIFFERENCE_PATH:
        return {"purpose": "zero-difference pre-effects Q proof"}
    if path == MACHINE_REVIEW_PATH:
        return {"purpose": "CRT evidence machine-gate and human-pending report"}
    raise RuntimeError(f"public purpose is not defined: {path}")


def build_public_tree(
    root: Path,
    public_staging: Path,
    plan: dict[str, Any],
    raw_authority: dict[str, Any],
    receipts: dict[tuple[str, int], dict[str, Any]],
    ffmpeg: Path,
    ffprobe: Path,
) -> tuple[dict[str, Any], dict[str, Any]]:
    for relative in ("stills", "video", "sheets", "source", "reports"):
        (public_staging / relative).mkdir(parents=True, exist_ok=False)
    still_paths: dict[int, Path] = {}
    sanitation = []
    for frame, role in raw.STILLS:
        source = root / "raw/stills" / f"crt-{role}-F{frame:03d}.png"
        target = public_staging / "stills" / f"phase4r1-1-crt-{role}-F{frame:03d}.png"
        record = sanitize_png(source, target)
        record["frame"] = frame
        record["role"] = role
        sanitation.append(record)
        still_paths[frame] = target
    q_target = public_staging / "source/quantum-icon-pre-crt-effect.png"
    q_copy = write_exact_q_source(q_target)
    sheet_target = public_staging / "sheets/phase4r1-1-exact-q-crt-phosphor-sheet.jpg"
    sheet = create_sheet(public_staging, still_paths, q_target, sheet_target)
    video_target = public_staging / "video/phase4r1-1-q-phosphor-motion-F345-F464.mp4"
    video_probe, command = encode_video(root, public_staging, ffmpeg, ffprobe, video_target)

    audit = json.loads((root / "authority/source-audit.json").read_text(encoding="utf-8"))
    difference = {
        "schema": SOURCE_DIFFERENCE_SCHEMA,
        "status": "PASS",
        "trackedPreEffectsQ": plan["sourceAuthorities"]["exactQTracked"],
        "livePackedQ": audit["exactQ"]["packed"],
        "publicPreEffectsQ": {
            "path": Q_SOURCE_PUBLIC_PATH,
            **raw.file_record(q_target),
            "width": q_copy["width"],
            "height": q_copy["height"],
        },
        "packedVsTracked": {
            "differentBytes": 0,
            "encodedShaEqual": True,
            "decodedDifferentPixels": 0,
            "decodedDifferenceBasis": "packed and tracked encoded bytes are identical",
            "planeGeometryUvOpacityActionDifference": 0,
            "zeroDifference": True,
        },
        "interpretation": {
            "preEffectsGeometryAndPixelsRemainExact": True,
            "physicalGlassAndPhosphorIntentionallyAlterRenderedPixels": True,
            "physicalEffectsDoNotReplaceRedrawOrReshapeTheSource": True,
        },
        "humanReviewDecision": "PENDING",
        "authorization": cfg.AUTHORIZATION,
    }
    raw.atomic_json_new(public_staging / "reports/exact-q-source-difference.json", difference)
    machine_review = {
        "schema": MACHINE_REVIEW_SCHEMA,
        "status": "PASS",
        "sourceAuthorities": plan["sourceAuthorities"],
        "rawAuthorities": raw_authority,
        "machineGates": {
            "checkpoint4SourceBuildThroughCrt": True,
            "exactQPackedVsTrackedZeroDifference": True,
            "exactQPlaneUvOpacityActionExact": True,
            "exactTwoMaterialDelta": True,
            "glassInheritedActionAndLiveScheduleExact": True,
            "glassLiveScheduleFrames": [1, 335, 430, 486, 500],
            "legacyCoarseScanGeometryHidden": True,
            "frozenAuthoritiesAndTimelinePreserved": True,
            "fiveFixedFinalQualityStillsComplete": True,
            "boundedMotionFramesComplete": True,
            "publicStillPixelsUnchangedByPrivacyStrip": all(item["decodedPixelsUnchanged"] for item in sanitation),
            "videoContractExact": True,
            "authorizationBoundaryClosed": True,
        },
        "renderEvidence": {
            "stills": [
                {
                    "frame": frame,
                    "role": role,
                    "path": public_still_path(frame, role),
                    "resolution": [1440, 900],
                    "samples": 192,
                    "engine": "CYCLES",
                }
                for frame, role in raw.STILLS
            ],
            "motion": {
                "path": VIDEO_PATH,
                "frameRange": [345, 464],
                "frameCount": 120,
                "durationSeconds": 4.0,
                "resolution": [960, 600],
                "samples": 96,
                "engine": "CYCLES",
                "probe": video_probe,
            },
            "sheet": {"path": SHEET_PATH, **sheet},
        },
        "privacySanitation": sanitation,
        "ffmpegCommand": command,
        "limitations": {
            "visualPhosphorGlassQualityRequiresHumanJudgment": True,
            "machinePassIsNotHumanAcceptance": True,
            "responsivePhysicalEvidenceGateClosedHere": False,
            "acceptedR1RegressionGateClosedHere": False,
            "rawMotionFramesPackageEligible": False,
        },
        "humanReviewDecision": "PENDING",
        "authorization": cfg.AUTHORIZATION,
        "complete540FrameCyclesFilmStarted": False,
        "complete540FrameCyclesFilmResumed": False,
        "finalRefinedMediaIntegrationStarted": False,
        "phase5Authorized": False,
        "generativeVideoAuthorized": False,
    }
    raw.atomic_json_new(public_staging / "reports/crt-phosphor-machine-review.json", machine_review)

    paths = sorted(path for path in public_staging.rglob("*") if path.is_file())
    expected_relative = {
        *(f"stills/phase4r1-1-crt-{role}-F{frame:03d}.png" for frame, role in raw.STILLS),
        "video/phase4r1-1-q-phosphor-motion-F345-F464.mp4",
        "sheets/phase4r1-1-exact-q-crt-phosphor-sheet.jpg",
        "source/quantum-icon-pre-crt-effect.png",
        "reports/exact-q-source-difference.json",
        "reports/crt-phosphor-machine-review.json",
    }
    observed_relative = {path.relative_to(public_staging).as_posix() for path in paths}
    if observed_relative != expected_relative:
        raise RuntimeError("public staging tree has an unexpected pre-manifest payload topology")
    files = []
    for path in paths:
        logical = f"public/{path.relative_to(public_staging).as_posix()}"
        files.append({**logical_public_record(root, public_staging, path), **purpose_for(logical)})
    manifest = {
        "schema": PUBLIC_MANIFEST_SCHEMA,
        "status": "PASS",
        "sourceAuthorities": plan["sourceAuthorities"],
        "rawAuthorities": raw_authority,
        "payloadFileCountExcludingManifest": len(files),
        "payloadByteCountExcludingManifest": sum(item["bytes"] for item in files),
        "files": files,
        "rawMotionFramesIncluded": False,
        "rawBlenderPngsIncluded": False,
        "privacySanitized": True,
        "humanReviewDecision": "PENDING",
        "authorization": cfg.AUTHORIZATION,
    }
    manifest_path = public_staging / "reports/crt-phosphor-public-manifest.json"
    raw.atomic_json_new(manifest_path, manifest)
    privacy = privacy_scan_tree(public_staging)
    return manifest, {
        "sanitation": sanitation,
        "qSource": q_copy,
        "sheet": sheet,
        "videoProbe": video_probe,
        "privacy": privacy,
        "ffmpegCommand": command,
    }


def validate_public_tree(root: Path, ffprobe: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    public = root / "public"
    manifest_path = root / PUBLIC_MANIFEST
    if not public.is_dir() or not manifest_path.is_file():
        raise RuntimeError("public CRT evidence tree or manifest is missing")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if (
        manifest.get("schema") != PUBLIC_MANIFEST_SCHEMA
        or manifest.get("status") != "PASS"
        or manifest.get("rawMotionFramesIncluded") is not False
        or manifest.get("rawBlenderPngsIncluded") is not False
        or manifest.get("privacySanitized") is not True
        or manifest.get("authorization") != cfg.AUTHORIZATION
        or manifest.get("humanReviewDecision") != "PENDING"
    ):
        raise RuntimeError("public CRT manifest status/boundaries differ")
    actual_paths = {
        path.relative_to(root).as_posix(): path
        for path in public.rglob("*")
        if path.is_file() and path.resolve() != manifest_path.resolve()
    }
    records = manifest.get("files", [])
    if len(records) != len(actual_paths) or {item["path"] for item in records} != set(actual_paths):
        raise RuntimeError("public CRT manifest is not exhaustive")
    for item in records:
        path = actual_paths[item["path"]]
        if {"bytes": item["bytes"], "sha256": item["sha256"]} != raw.file_record(path):
            raise RuntimeError(f"public CRT payload differs from manifest: {item['path']}")
        expected_purpose = purpose_for(item["path"])
        if any(item.get(key) != value for key, value in expected_purpose.items()):
            raise RuntimeError(f"public CRT purpose metadata differs: {item['path']}")
    if manifest["payloadFileCountExcludingManifest"] != len(records) or manifest["payloadByteCountExcludingManifest"] != sum(item["bytes"] for item in records):
        raise RuntimeError("public CRT manifest aggregate differs")
    # Prove every public still remains pixel-identical to its raw authority.
    pixel_checks = []
    for frame, role in raw.STILLS:
        source = root / "raw/stills" / f"crt-{role}-F{frame:03d}.png"
        target = root / public_still_path(frame, role)
        before = raw.parse_png(source)
        after = raw.parse_png(target)
        before_pixels = decoded_pixels(source)
        after_pixels = decoded_pixels(target)
        if (
            before["idatSha256"] != after["idatSha256"]
            or before_pixels != after_pixels
            or any(chunk["type"] in METADATA_CHUNKS for chunk in after["chunks"])
        ):
            raise RuntimeError(f"public still sanitation proof differs at F{frame:03d}")
        pixel_checks.append({"frame": frame, "idatUnchanged": True, "decodedPixelsUnchanged": True})
    if raw.file_record(root / Q_SOURCE_PUBLIC_PATH) != {"bytes": cfg.EXACT_Q_BYTES, "sha256": cfg.EXACT_Q_SHA256}:
        raise RuntimeError("public exact-Q source is no longer byte-exact")
    probe = probe_video(ffprobe, root / VIDEO_PATH)
    privacy = privacy_scan_tree(public)
    raw.assert_no_private_strings(manifest, "public manifest")
    return manifest, {"pixelChecks": pixel_checks, "videoProbe": probe, "privacy": privacy}


def finalization_value(
    root: Path,
    plan: dict[str, Any],
    raw_authority: dict[str, Any],
    manifest: dict[str, Any],
    verification: dict[str, Any],
    ffmpeg_record: dict[str, Any],
    ffprobe_record: dict[str, Any],
) -> dict[str, Any]:
    manifest_path = root / PUBLIC_MANIFEST
    public_files = sorted(path for path in (root / "public").rglob("*") if path.is_file())
    return {
        "schema": FINALIZATION_SCHEMA,
        "status": "PASS",
        "sourceAuthorities": plan["sourceAuthorities"],
        "rawAuthorities": raw_authority,
        "publicManifest": {"path": PUBLIC_MANIFEST, **raw.file_record(manifest_path)},
        "publicFileCountIncludingManifest": len(public_files),
        "publicByteCountIncludingManifest": sum(path.stat().st_size for path in public_files),
        "video": {
            "path": VIDEO_PATH,
            **raw.file_record(root / VIDEO_PATH),
            **verification["videoProbe"],
        },
        "stableQPrimary": {
            "path": public_still_path(370, "stable-primary"),
            **raw.file_record(root / public_still_path(370, "stable-primary")),
            "frame": 370,
            "resolution": [1440, 900],
            "samples": 192,
            "engine": "CYCLES",
        },
        "tools": {"ffmpeg": ffmpeg_record, "ffprobe": ffprobe_record},
        "privacy": verification["privacy"],
        "publicStillPixelsUnchanged": all(item["decodedPixelsUnchanged"] for item in verification["pixelChecks"]),
        "machineStatus": "PASS",
        "humanReviewDecision": "PENDING",
        "machinePassIsHumanAcceptance": False,
        "packageEligible": True,
        "rawMotionFramesPackageEligible": False,
        "authorization": cfg.AUTHORIZATION,
        "complete540FrameCyclesFilmStarted": False,
        "complete540FrameCyclesFilmResumed": False,
        "finalRefinedMediaIntegrationStarted": False,
        "phase5Authorized": False,
        "generativeVideoAuthorized": False,
    }


def finalize(root: Path, ffmpeg_value: str, ffprobe_value: str) -> dict[str, Any]:
    root = raw.validate_external_root_path(root, must_exist=True)
    plan, raw_authority, receipts = validate_complete_raw_root(root)
    current_finalizer = raw.repo_record(Path(__file__).resolve())
    if plan["sourceAuthorities"]["finalizer"] != current_finalizer:
        raise RuntimeError("evidence plan binds a different finalizer")
    ffmpeg = resolve_executable(ffmpeg_value)
    ffprobe = resolve_executable(ffprobe_value)
    ffmpeg_record = executable_record(ffmpeg, "bounded H.264 encoder")
    ffprobe_record = executable_record(ffprobe, "independent media verifier")
    public = root / "public"
    if public.exists():
        manifest, verification = validate_public_tree(root, ffprobe)
    else:
        pending = root / f".public.pending-{uuid.uuid4().hex}"
        if pending.exists() or any(path.name.startswith(".public.pending-") for path in root.iterdir()):
            raise RuntimeError("stale public-tree staging directory requires explicit quarantine")
        pending.mkdir(parents=False)
        try:
            manifest, build_details = build_public_tree(
                root,
                pending,
                plan,
                raw_authority,
                receipts,
                ffmpeg,
                ffprobe,
            )
            if public.exists():
                raise RuntimeError("public CRT evidence tree appeared during finalization")
            os.replace(pending, public)
        except BaseException:
            # Preserve pending outputs for inspection; never delete them.
            raise
        manifest, verification = validate_public_tree(root, ffprobe)
    value = finalization_value(
        root,
        plan,
        raw_authority,
        manifest,
        verification,
        ffmpeg_record,
        ffprobe_record,
    )
    path = root / FINALIZATION_PATH
    if path.is_file():
        existing = json.loads(path.read_text(encoding="utf-8"))
        if existing != value:
            raise RuntimeError("existing CRT finalization authority is stale or divergent")
    else:
        raw.atomic_json_new(path, value)
    raw.assert_no_private_strings(value, "CRT finalization")
    print(json.dumps({"status": "PASS", "finalization": path_record(root, path), "publicManifest": value["publicManifest"], "video": value["video"]}, indent=2, sort_keys=True))
    return value


def verify(root: Path, ffprobe_value: str) -> dict[str, Any]:
    root = raw.validate_external_root_path(root, must_exist=True)
    plan, raw_authority, receipts = validate_complete_raw_root(root)
    ffprobe = resolve_executable(ffprobe_value)
    manifest, verification = validate_public_tree(root, ffprobe)
    path = root / FINALIZATION_PATH
    if not path.is_file():
        raise RuntimeError("CRT finalization authority is missing")
    value = json.loads(path.read_text(encoding="utf-8"))
    if (
        value.get("schema") != FINALIZATION_SCHEMA
        or value.get("status") != "PASS"
        or value.get("sourceAuthorities") != plan["sourceAuthorities"]
        or value.get("rawAuthorities") != raw_authority
        or value.get("publicManifest") != {"path": PUBLIC_MANIFEST, **raw.file_record(root / PUBLIC_MANIFEST)}
        or value.get("video", {}).get("sha256") != raw.file_record(root / VIDEO_PATH)["sha256"]
        or value.get("humanReviewDecision") != "PENDING"
        or value.get("packageEligible") is not True
        or value.get("authorization") != cfg.AUTHORIZATION
    ):
        raise RuntimeError("stored CRT finalization authority differs")
    if value.get("video", {}).get("frameCount") != verification["videoProbe"]["frameCount"]:
        raise RuntimeError("stored CRT video probe differs from a fresh probe")
    raw.assert_no_private_strings(value, "stored CRT finalization")
    print(json.dumps({"status": "PASS", "finalization": path_record(root, path), "publicManifest": value["publicManifest"], "privacy": verification["privacy"]}, indent=2, sort_keys=True))
    return value


def write_failure(root: Path, mode: str, error: BaseException) -> None:
    if not root.is_dir():
        return
    value = {
        "schema": FAILURE_SCHEMA,
        "status": "FAIL",
        "mode": mode,
        "error": raw.safe_error_text(error),
        "authorization": cfg.AUTHORIZATION,
        "humanReviewDecision": "PENDING",
    }
    path = root / "authority" / f"finalization-failure-{mode}-{uuid.uuid4().hex[:12]}.json"
    try:
        raw.atomic_json_new(path, value)
    except BaseException:
        pass


def pure_self_test() -> dict[str, Any]:
    build, authorities = raw.validate_source_build()
    if tuple(frame for start, end in raw.MOTION_CHUNKS for frame in range(start, end + 1)) != raw.MOTION_FRAMES:
        raise RuntimeError("finalizer motion partition self-test failed")
    if len(raw.MOTION_FRAMES) != 120 or len(raw.STILLS) != 5 or raw.EXPECTED_RAW_PNG_COUNT != 125:
        raise RuntimeError("finalizer bounded-count self-test failed")
    _font, font_record = load_sheet_font(28)
    if font_record["pixelSize"] != 28 or font_record["measuredGlyphHeight"] < 16:
        raise RuntimeError("comparison-sheet readable-font self-test failed")

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    private_text = b"File\x00C:\\Users\\example\\source.blend"
    png = (
        raw.PNG_SIGNATURE
        + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
        + chunk(b"tEXt", private_text)
        + chunk(b"IDAT", zlib.compress(b"\x00\x10\x20\x30"))
        + chunk(b"IEND", b"")
    )
    with tempfile.TemporaryDirectory(prefix="qsite-crt-finalizer-selftest-") as temporary:
        source = Path(temporary) / "raw.png"
        target = Path(temporary) / "public.png"
        source.write_bytes(png)
        before = decoded_pixels(source)
        sanitation = sanitize_png(source, target)
        after = decoded_pixels(target)
        if before != after or not sanitation["idatUnchanged"] or not sanitation["decodedPixelsUnchanged"]:
            raise RuntimeError("PNG sanitation pixel-invariance self-test failed")
        if any(chunk_record["type"] in METADATA_CHUNKS for chunk_record in raw.parse_png(target)["chunks"]):
            raise RuntimeError("PNG sanitation metadata-removal self-test failed")
        binary_privacy_scan(target)
        try:
            binary_privacy_scan(source)
        except RuntimeError:
            pass
        else:
            raise RuntimeError("binary privacy rejection self-test failed")
        sheet_path = Path(temporary) / "sheet.jpg"
        sheet_record = create_sheet(
            Path(temporary),
            {frame: target for frame, _role in raw.STILLS},
            target,
            sheet_path,
        )
        if (
            not sheet_path.is_file()
            or sheet_record["captionFont"] != font_record
            or sheet_record["captionsClearlyReadable"] is not True
            or sheet_record["width"] != 2400
            or sheet_record["height"] != 1600
        ):
            raise RuntimeError("comparison-sheet layout/font self-test failed")
    result = {
        "status": "PASS",
        "finalizer": raw.repo_record(Path(__file__).resolve()),
        "renderer": raw.repo_record(Path(raw.__file__).resolve()),
        "fixedSourceAuthorities": authorities,
        "sourceBuildThroughStage": build["throughStage"],
        "stillCount": 5,
        "motionFrameCount": 120,
        "expectedRawPngCount": 125,
        "sheetCaptionFont": font_record,
        "sheetLayout": sheet_record,
        "pngSanitation": sanitation,
        "blenderImported": False,
        "blenderLaunched": False,
        "ffmpegLaunched": False,
        "renderStarted": False,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("finalize", "verify"), required=True)
    parser.add_argument("--root", required=True)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--ffprobe", default="ffprobe")
    return parser.parse_args()


def main() -> None:
    if "--self-test" in sys.argv:
        if any(token in sys.argv for token in ("--mode", "--root", "--ffmpeg", "--ffprobe")):
            raise RuntimeError("--self-test cannot be combined with finalization arguments")
        pure_self_test()
        return
    args = parse_args()
    root = Path(args.root).resolve()
    try:
        if args.mode == "finalize":
            finalize(root, args.ffmpeg, args.ffprobe)
        elif args.mode == "verify":
            verify(root, args.ffprobe)
        else:
            raise RuntimeError(f"unsupported finalizer mode: {args.mode}")
    except BaseException as error:
        write_failure(root, args.mode, error)
        raise


if __name__ == "__main__":
    main()
