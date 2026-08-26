"""Finalize privacy-clean Phase 4-R1.1 physical evidence.

This ordinary-Python companion never imports or launches Blender.  It accepts
only the complete receipt-authenticated external raw root produced by
``render_phase4r1_1_final_physical_evidence.py``.  It encodes exactly F001-F500
as a 390x844, 30 fps H.264/yuv420p video with no audio or inherited metadata;
publishes privacy-sanitized milestone PNGs for the full mobile sequence and
all three responsive portrait viewports; and creates public reports and a
hash/size manifest.  The 521 raw Blender PNGs are never copied wholesale.

No operation performs refined-media integration, renders F501-F540, creates a
540-frame Cycles film, authorizes production, or begins Phase 5.
"""

from __future__ import annotations

import argparse
from fractions import Fraction
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import tempfile
from typing import Any, Iterable
import uuid
import zlib


sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
import phase4r1_1_repair_config as cfg
import render_phase4r1_1_final_physical_evidence as raw


FINALIZATION_SCHEMA = "quantum-hub.phase-4-r1-1.final-physical-finalization.v1"
PUBLIC_MANIFEST_SCHEMA = "quantum-hub.phase-4-r1-1.final-physical-public-manifest.v1"
PUBLIC_VERIFICATION_SCHEMA = "quantum-hub.phase-4-r1-1.final-physical-public-verification.v1"
SOURCE_SUMMARY_SCHEMA = "quantum-hub.phase-4-r1-1.final-source-summary.v1"
FAILURE_SCHEMA = "quantum-hub.phase-4-r1-1.final-physical-finalizer-failure.v1"

METADATA_CHUNKS = {"tEXt", "zTXt", "iTXt", "eXIf"}
PUBLIC_DIR = "public"
VIDEO_PATH = "video/mobile-390x844-physical-F001-F500.mp4"
SOURCE_SUMMARY_PATH = "reports/final-source-summary.json"
VERIFICATION_PATH = "reports/final-physical-public-verification.json"
FINALIZATION_PATH = "reports/final-physical-finalization.json"
MANIFEST_PATH = "manifests/final-physical-public-manifest.json"
EXPECTED_PUBLIC_PNG_COUNT = len(raw.MILESTONES) * (1 + len(raw.RESPONSIVE_VIEWPORTS))
EXPECTED_PUBLIC_VIDEO_COUNT = 1
EXPECTED_PUBLIC_REPORT_COUNT = 3


def public_mobile_still(frame: int, role: str) -> str:
    return f"stills/mobile-390x844/F{frame:03d}-{role}.png"


def public_responsive_still(viewport: str, frame: int, role: str) -> str:
    return f"stills/responsive/{viewport}/F{frame:03d}-{role}.png"


def resolve_executable(value: str) -> Path:
    candidate = Path(value)
    located = shutil.which(value) if candidate.parent == Path(".") else None
    path = Path(located).resolve() if located else candidate.expanduser().resolve()
    if not path.is_file():
        raise RuntimeError(f"required executable is missing: {candidate.name}")
    return path


def executable_record(path: Path, role: str) -> dict[str, Any]:
    result = subprocess.run(
        [str(path), "-version"], check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, encoding="utf-8", errors="replace",
    )
    first_line = result.stdout.splitlines()[0].strip() if result.stdout else ""
    value = {"role": role, "name": path.name, **raw.file_record(path), "version": first_line}
    raw.assert_no_private_strings(value, f"{role} executable record")
    return value


def run_tool(command: list[str], label: str) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode != 0:
        tail = "\n".join(result.stderr.splitlines()[-12:])
        for pattern in raw.PRIVATE_PATTERNS:
            tail = pattern.sub("[redacted]/", tail)
        raise RuntimeError(f"{label} failed with exit {result.returncode}: {tail[:1800]}")
    return result


def public_relative_record(public_root: Path, path: Path, **metadata: Any) -> dict[str, Any]:
    return {
        "path": path.resolve().relative_to(public_root.resolve()).as_posix(),
        **raw.file_record(path),
        **metadata,
    }


def png_chunks(path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    payload = path.read_bytes()
    if not payload.startswith(raw.PNG_SIGNATURE):
        raise RuntimeError(f"invalid PNG signature: {path.name}")
    offset = len(raw.PNG_SIGNATURE)
    header: dict[str, Any] | None = None
    chunks: list[dict[str, Any]] = []
    while offset < len(payload):
        if offset + 12 > len(payload):
            raise RuntimeError(f"truncated PNG: {path.name}")
        length = struct.unpack(">I", payload[offset : offset + 4])[0]
        kind = payload[offset + 4 : offset + 8]
        end = offset + 12 + length
        if end > len(payload):
            raise RuntimeError(f"truncated PNG chunk: {path.name}")
        data = payload[offset + 8 : offset + 8 + length]
        expected_crc = struct.unpack(">I", payload[offset + 8 + length : end])[0]
        actual_crc = zlib.crc32(kind + data) & 0xFFFFFFFF
        if expected_crc != actual_crc:
            raise RuntimeError(f"PNG CRC failure: {path.name}")
        name = kind.decode("ascii", errors="strict")
        record = {"type": name, "bytes": length, "data": data, "raw": payload[offset:end]}
        chunks.append(record)
        if kind == b"IHDR":
            if length != 13:
                raise RuntimeError(f"invalid PNG IHDR: {path.name}")
            width, height, bit_depth, color_type, compression, filtering, interlace = struct.unpack(">IIBBBBB", data)
            header = {
                "width": int(width),
                "height": int(height),
                "bitDepth": int(bit_depth),
                "colorType": int(color_type),
                "compression": int(compression),
                "filter": int(filtering),
                "interlace": int(interlace),
            }
        offset = end
    if header is None or not chunks or chunks[-1]["type"] != "IEND" or not any(item["type"] == "IDAT" for item in chunks):
        raise RuntimeError(f"incomplete PNG structure: {path.name}")
    return header, chunks


def paeth(a: int, b: int, c: int) -> int:
    estimate = a + b - c
    distances = (abs(estimate - a), abs(estimate - b), abs(estimate - c))
    if distances[0] <= distances[1] and distances[0] <= distances[2]:
        return a
    if distances[1] <= distances[2]:
        return b
    return c


def decoded_pixels(path: Path) -> bytes:
    header, chunks = png_chunks(path)
    if header["bitDepth"] != 8 or header["colorType"] not in {2, 6} or header["interlace"] != 0:
        raise RuntimeError(f"pixel validator supports non-interlaced 8-bit RGB/RGBA only: {path.name}")
    channels = 3 if header["colorType"] == 2 else 4
    stride = header["width"] * channels
    compressed = b"".join(chunk["data"] for chunk in chunks if chunk["type"] == "IDAT")
    scanlines = zlib.decompress(compressed)
    if len(scanlines) != (stride + 1) * header["height"]:
        raise RuntimeError(f"unexpected decompressed PNG size: {path.name}")
    rows: list[bytes] = []
    previous = bytearray(stride)
    offset = 0
    for _row in range(header["height"]):
        filter_type = scanlines[offset]
        source = scanlines[offset + 1 : offset + 1 + stride]
        offset += stride + 1
        decoded = bytearray(stride)
        for index, encoded in enumerate(source):
            left = decoded[index - channels] if index >= channels else 0
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
            decoded[index] = (encoded + predictor) & 0xFF
        rows.append(bytes(decoded))
        previous = decoded
    return b"".join(rows)


def sanitize_png(source: Path, target: Path) -> dict[str, Any]:
    header_before, chunks_before = png_chunks(source)
    pixels_before = decoded_pixels(source)
    kept: list[bytes] = []
    removed: list[dict[str, Any]] = []
    for chunk in chunks_before:
        if chunk["type"] in METADATA_CHUNKS:
            removed.append({"type": chunk["type"], "bytes": chunk["bytes"]})
        else:
            kept.append(chunk["raw"])
    payload = raw.PNG_SIGNATURE + b"".join(kept)
    raw.atomic_bytes_new(target, payload)
    header_after, chunks_after = png_chunks(target)
    pixels_after = decoded_pixels(target)
    idat_before = hashlib.sha256(b"".join(item["data"] for item in chunks_before if item["type"] == "IDAT")).hexdigest()
    idat_after = hashlib.sha256(b"".join(item["data"] for item in chunks_after if item["type"] == "IDAT")).hexdigest()
    if (
        header_before != header_after
        or idat_before != idat_after
        or pixels_before != pixels_after
        or any(item["type"] in METADATA_CHUNKS for item in chunks_after)
    ):
        raise RuntimeError(f"PNG sanitation changed pixels or left private metadata: {source.name}")
    return {
        "rawSourceLogicalName": source.name,
        "rawSource": raw.file_record(source),
        "public": raw.file_record(target),
        "width": header_before["width"],
        "height": header_before["height"],
        "removedChunks": removed,
        "idatSha256Before": idat_before,
        "idatSha256After": idat_after,
        "decodedPixelSha256Before": hashlib.sha256(pixels_before).hexdigest(),
        "decodedPixelSha256After": hashlib.sha256(pixels_after).hexdigest(),
        "decodedPixelsUnchanged": True,
        "privateMetadataRemoved": True,
    }


def current_authorities() -> dict[str, Any]:
    return {
        "source": raw.repo_record(cfg.DERIVATIVE),
        "sourceBuild": raw.repo_record(cfg.BUILD_REPORT),
        "sourceBuilder": raw.repo_record(raw.BUILDER_PATH),
        "sourceConfig": raw.repo_record(Path(cfg.__file__).resolve()),
        "producer": raw.repo_record(Path(raw.__file__).resolve()),
        "finalizer": raw.repo_record(Path(__file__).resolve()),
    }


def load_complete_raw_root(root: Path) -> tuple[dict[str, Any], dict[int, dict[str, Any]], dict[tuple[str, int], dict[str, Any]], dict[str, Any]]:
    authorities = current_authorities()
    if {key: authorities["source"][key] for key in ("bytes", "sha256")} != raw.EXPECTED_DERIVATIVE:
        raise RuntimeError("final source changed after raw evidence planning")
    if {key: authorities["sourceBuild"][key] for key in ("bytes", "sha256")} != raw.EXPECTED_BUILD_REPORT:
        raise RuntimeError("source-build report changed after raw evidence planning")
    plan = raw.validate_plan(root, authorities)
    sequence = raw.scan_sequence(root, plan)
    responsive = raw.scan_responsive(root, plan)
    if len(sequence) != 500 or sorted(sequence) != list(range(1, 501)):
        raise RuntimeError("complete authenticated F001-F500 sequence is required")
    if len(responsive) != 21:
        raise RuntimeError("complete authenticated three-by-seven responsive still set is required")
    expected_sequence = raw.sequence_manifest_value(root, plan, sequence)
    expected_responsive = raw.responsive_manifest_value(root, plan, responsive)
    stored_sequence = json.loads(raw.sequence_manifest_path(root).read_text(encoding="utf-8"))
    stored_responsive = json.loads(raw.responsive_manifest_path(root).read_text(encoding="utf-8"))
    if stored_sequence != expected_sequence or stored_sequence.get("status") != "COMPLETE":
        raise RuntimeError("stored sequence manifest is incomplete or stale")
    if stored_responsive != expected_responsive or stored_responsive.get("status") != "COMPLETE":
        raise RuntimeError("stored responsive manifest is incomplete or stale")
    chunk_reports = []
    for index, (start, end) in enumerate(raw.FULL_CHUNKS, start=1):
        path = root / "sequence" / "chunks" / f"chunk-{index:02d}-F{start:03d}-F{end:03d}.json"
        value = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None
        if not isinstance(value, dict) or value.get("schema") != raw.CHUNK_SCHEMA or value.get("status") != "PASS" or value.get("frameRange") != [start, end]:
            raise RuntimeError(f"authenticated sequence chunk ledger {index:02d} is missing")
        chunk_reports.append(raw.relative_record(root, path))
    responsive_runs = []
    for viewport in raw.RESPONSIVE_VIEWPORTS:
        path = root / "responsive" / "runs" / f"{viewport}.json"
        value = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None
        if not isinstance(value, dict) or value.get("schema") != raw.RESPONSIVE_RUN_SCHEMA or value.get("status") != "PASS" or value.get("viewport") != viewport:
            raise RuntimeError(f"authenticated responsive run ledger is missing: {viewport}")
        responsive_runs.append(raw.relative_record(root, path))
    raw_verification_path = root / "reports" / "final-physical-raw-verification.json"
    verification = json.loads(raw_verification_path.read_text(encoding="utf-8")) if raw_verification_path.is_file() else None
    if (
        not isinstance(verification, dict)
        or verification.get("schema") != raw.VERIFICATION_SCHEMA
        or verification.get("status") != "PASS"
        or verification.get("authorities") != authorities
        or verification.get("sequenceFrameCount") != 500
        or verification.get("responsiveStillCount") != 21
    ):
        raise RuntimeError("producer verification mode must pass before finalization")
    forbidden = [
        path.name for path in root.rglob("*.png")
        if (match := re.search(r"F(\d{3})", path.name)) and 501 <= int(match.group(1)) <= 540
    ]
    if forbidden:
        raise RuntimeError("forbidden F501-F540 raw evidence exists")
    raw.records_unchanged(authorities)
    audit = {
        "status": "PASS",
        "authorities": authorities,
        "plan": raw.relative_record(root, raw.plan_path(root)),
        "sourceAudit": raw.relative_record(root, raw.source_audit_path(root)),
        "sequenceManifest": raw.relative_record(root, raw.sequence_manifest_path(root)),
        "responsiveManifest": raw.relative_record(root, raw.responsive_manifest_path(root)),
        "rawVerification": raw.relative_record(root, raw_verification_path),
        "chunkReports": chunk_reports,
        "responsiveRuns": responsive_runs,
        "sequenceFrameCount": 500,
        "responsiveStillCount": 21,
        "rawPngCount": 521,
        "forbiddenFrames": [],
        "authorization": raw.authorization_denials(),
    }
    raw.assert_no_private_strings(audit, "raw authority summary")
    return plan, sequence, responsive, audit


def parse_ratio(value: str) -> Fraction:
    try:
        return Fraction(value)
    except (ValueError, ZeroDivisionError) as error:
        raise RuntimeError(f"invalid media ratio: {value}") from error


def validate_probe_payload(value: dict[str, Any]) -> dict[str, Any]:
    streams = value.get("streams", [])
    if not isinstance(streams, list):
        raise RuntimeError("ffprobe stream payload is invalid")
    video_streams = [stream for stream in streams if stream.get("codec_type") == "video"]
    audio_streams = [stream for stream in streams if stream.get("codec_type") == "audio"]
    if len(streams) != 1 or len(video_streams) != 1 or audio_streams:
        raise RuntimeError("final physical video must contain exactly one video stream and no audio/subtitle/data streams")
    stream = video_streams[0]
    frame_count = int(stream.get("nb_read_frames") or stream.get("nb_frames") or 0)
    rate = parse_ratio(stream.get("avg_frame_rate") or stream.get("r_frame_rate") or "0/1")
    format_value = value.get("format", {})
    if not isinstance(format_value, dict):
        raise RuntimeError("ffprobe format payload is invalid")
    if int(format_value.get("nb_streams", len(streams))) != 1:
        raise RuntimeError("ffprobe format stream count differs")
    duration = float(stream.get("duration") or format_value.get("duration") or 0.0)
    format_tags = format_value.get("tags", {})
    stream_tags = stream.get("tags", {})
    if not isinstance(format_tags, dict) or not isinstance(stream_tags, dict):
        raise RuntimeError("ffprobe metadata payload is invalid")
    scoped_tags = [
        *(("format", str(key), item) for key, item in format_tags.items()),
        *(("stream", str(key), item) for key, item in stream_tags.items()),
    ]
    raw.assert_no_private_strings({"format": format_tags, "stream": stream_tags}, "video metadata")
    allowed_structural_tags = {"major_brand", "minor_version", "compatible_brands", "language"}
    user_metadata_keys = sorted(
        f"{scope}.{key}" for scope, key, item in scoped_tags
        if key.casefold() not in allowed_structural_tags and str(item).strip()
    )
    if (
        stream.get("codec_name") != "h264"
        or stream.get("pix_fmt") != "yuv420p"
        or (int(stream.get("width", 0)), int(stream.get("height", 0))) != (390, 844)
        or rate != Fraction(30, 1)
        or frame_count != 500
        or abs(duration - (500 / 30)) > 0.08
        or user_metadata_keys
    ):
        raise RuntimeError("final physical video media contract differs")
    return {
        "status": "PASS",
        "codec": "h264",
        "pixelFormat": "yuv420p",
        "resolution": [390, 844],
        "fps": 30,
        "frameRange": [1, 500],
        "frameCount": 500,
        "durationSeconds": round(duration, 6),
        "streamCount": 1,
        "audioStreamCount": 0,
        "subtitleOrDataStreamCount": 0,
        "presentStructuralMetadataKeys": sorted(
            f"{scope}.{key}" for scope, key, item in scoped_tags
            if key.casefold() in allowed_structural_tags and str(item).strip()
        ),
        "userMetadataKeys": user_metadata_keys,
        "metadataStripped": True,
    }


def probe_video(ffprobe: Path, video: Path) -> dict[str, Any]:
    result = run_tool(
        [
            str(ffprobe), "-v", "error", "-count_frames",
            "-show_entries",
            "format=duration,nb_streams:format_tags:"
            "stream=index,codec_type,codec_name,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_frames,nb_read_frames,duration:"
            "stream_tags",
            "-of", "json", str(video),
        ],
        "ffprobe",
    )
    try:
        value = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError("ffprobe returned invalid JSON") from error
    return validate_probe_payload(value)


def encode_video(root: Path, public_staging: Path, ffmpeg: Path, ffprobe: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    target = public_staging / VIDEO_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    pending = target.with_name(f".{target.stem}.{uuid.uuid4().hex}.pending.mp4")
    input_pattern = root / "sequence" / raw.FULL_VIEWPORT / "frames" / "F%03d.png"
    command = [
        str(ffmpeg), "-hide_banner", "-loglevel", "error", "-nostdin", "-n",
        "-framerate", "30", "-start_number", "1", "-i", str(input_pattern),
        "-frames:v", "500", "-c:v", "libx264", "-preset", "slow", "-crf", "20",
        "-fflags", "+bitexact", "-flags:v", "+bitexact",
        "-pix_fmt", "yuv420p", "-r", "30", "-an", "-map_metadata", "-1",
        "-metadata", "encoder=", "-metadata:s:v:0", "encoder=",
        "-metadata:s:v:0", "handler_name=", "-metadata:s:v:0", "vendor_id=",
        "-movflags", "+faststart", str(pending),
    ]
    try:
        run_tool(command, "final physical H.264 encode")
        if not pending.is_file() or pending.stat().st_size <= 0:
            raise RuntimeError("ffmpeg did not produce the final physical video")
        probe = probe_video(ffprobe, pending)
        run_tool(
            [str(ffmpeg), "-v", "error", "-nostdin", "-i", str(pending), "-map", "0:v:0", "-f", "null", "-"],
            "full video decode",
        )
        os.replace(pending, target)
    finally:
        pending.unlink(missing_ok=True)
    if probe_video(ffprobe, target) != probe:
        raise RuntimeError("video authority changed during atomic publication")
    command_record = {
        "template": "<FFMPEG> -hide_banner -loglevel error -nostdin -n -framerate 30 -start_number 1 -i <RAW>/sequence/390x844/frames/F%03d.png -frames:v 500 -c:v libx264 -preset slow -crf 20 -fflags +bitexact -flags:v +bitexact -pix_fmt yuv420p -r 30 -an -map_metadata -1 <OUTPUT>",
        "inputFrameRange": [1, 500],
        "inputFrameCount": 500,
        "outputContainsRawFrames": False,
        "metadataStripped": True,
        "audioExcluded": True,
    }
    raw.assert_no_private_strings(command_record, "ffmpeg command record")
    return probe, command_record


def binary_privacy_scan(path: Path) -> dict[str, Any]:
    payload = path.read_bytes()
    text_views = [payload.decode("latin1", errors="ignore")]
    padded = payload if len(payload) % 2 == 0 else payload + b"\x00"
    text_views.append(padded.decode("utf-16le", errors="ignore"))
    private_literals = (
        str(cfg.REPO_ROOT.resolve()),
        str(Path.home().resolve()),
        str(Path(tempfile.gettempdir()).resolve()),
        str(cfg.DERIVATIVE.resolve()),
    )
    hits: list[str] = []
    for view in text_views:
        folded = view.casefold().replace("/", "\\")
        for literal in private_literals:
            normalized_literal = literal.casefold().replace("/", "\\")
            if normalized_literal and normalized_literal in folded:
                hits.append("private-literal")
        for pattern in raw.PRIVATE_PATTERNS:
            if pattern.search(view):
                hits.append("private-pattern")
    if hits:
        raise RuntimeError(f"public payload contains private-path material: {path.name}")
    return {"bytesScanned": len(payload), "privatePathHits": 0}


def privacy_scan_tree(public_root: Path, *, exclude_manifest: bool = False) -> dict[str, Any]:
    files = sorted(path for path in public_root.rglob("*") if path.is_file())
    if exclude_manifest:
        files = [path for path in files if path.relative_to(public_root).as_posix() != MANIFEST_PATH]
    records = [
        {
            "path": path.relative_to(public_root).as_posix(),
            **binary_privacy_scan(path),
        }
        for path in files
    ]
    return {
        "status": "PASS",
        "fileCount": len(records),
        "byteCount": sum(record["bytesScanned"] for record in records),
        "privatePathHits": 0,
        "files": records,
    }


def purpose_metadata(path: str) -> dict[str, Any]:
    if path == VIDEO_PATH:
        return {
            "purpose": "complete physical-only repaired-Mobile cinematic; excludes F501-F540",
            "viewport": "390x844",
            "frameOrRange": [1, 500],
            "engine": "BLENDER_EEVEE",
        }
    mobile = re.fullmatch(r"stills/mobile-390x844/F(?P<frame>\d{3})-(?P<role>[a-z0-9-]+)\.png", path)
    if mobile:
        frame = int(mobile.group("frame"))
        return {
            "purpose": f"privacy-clean native mobile physical milestone: {mobile.group('role')}",
            "viewport": "390x844",
            "frameOrRange": frame,
            "engine": "BLENDER_EEVEE",
        }
    responsive = re.fullmatch(r"stills/responsive/(?P<viewport>\d+x\d+)/F(?P<frame>\d{3})-(?P<role>[a-z0-9-]+)\.png", path)
    if responsive:
        return {
            "purpose": f"privacy-clean native responsive physical milestone: {responsive.group('role')}",
            "viewport": responsive.group("viewport"),
            "frameOrRange": int(responsive.group("frame")),
            "engine": "BLENDER_EEVEE",
        }
    report_purposes = {
        SOURCE_SUMMARY_PATH: "compact final cumulative Blender/source-build authority report",
        VERIFICATION_PATH: "public physical evidence sanitation/media/privacy verification",
        FINALIZATION_PATH: "final physical evidence finalization report",
    }
    if path in report_purposes:
        return {"purpose": report_purposes[path], "viewport": None, "frameOrRange": None, "engine": None}
    raise RuntimeError(f"unclassified public payload: {path}")


def manifest_entry(public_root: Path, path: Path, source_sha: str) -> dict[str, Any]:
    relative = path.relative_to(public_root).as_posix()
    authority = raw.file_record(path)
    return {
        "relativePath": relative,
        "byteSize": authority["bytes"],
        "sha256": authority["sha256"],
        **purpose_metadata(relative),
        "finalBlenderSourceHash": source_sha,
    }


def source_summary_value(plan: dict[str, Any]) -> dict[str, Any]:
    summary = plan["sourceSummary"]
    return {
        "schema": SOURCE_SUMMARY_SCHEMA,
        "status": "PASS",
        "finalCumulativeSource": plan["authorities"]["source"],
        "sourceBuildReport": plan["authorities"]["sourceBuild"],
        "sourceBuilder": plan["authorities"]["sourceBuilder"],
        "sourceConfig": plan["authorities"]["sourceConfig"],
        "producer": plan["authorities"]["producer"],
        "finalizer": plan["authorities"]["finalizer"],
        "buildStatus": summary["status"],
        "throughStage": summary["throughStage"],
        "repairCategories": summary["repairCategories"],
        "timeline": summary["timeline"],
        "exactQ": summary["exactQ"],
        "preEffectsQDifferenceZero": summary["preEffectsQDifferenceZero"],
        "crtCalibration": summary["crtCalibration"],
        "mobileLensKeys": summary["mobileLensKeys"],
        "responsiveCameraFamily": {
            "family": "mobile",
            "viewports": list(raw.RESPONSIVE_VIEWPORTS),
            "allPortraitAutoResolveVertical": True,
            "why768x1024UsesMobile": "768x1024 is portrait; the authored AUTO sensor fit resolves VERTICAL",
        },
        "authorization": raw.authorization_denials(),
        "humanReviewDecision": None,
    }


def create_public_tree(
    root: Path,
    plan: dict[str, Any],
    sequence: dict[int, dict[str, Any]],
    responsive: dict[tuple[str, int], dict[str, Any]],
    raw_audit: dict[str, Any],
    ffmpeg: Path,
    ffprobe: Path,
) -> Path:
    public = root / PUBLIC_DIR
    if public.exists():
        raise RuntimeError("public tree already exists; use verify mode or a fresh raw root")
    staging = root / f".public-staging-{uuid.uuid4().hex}"
    staging.mkdir()
    sanitation: list[dict[str, Any]] = []
    try:
        for frame, role in raw.MILESTONES:
            source = raw.sequence_frame_path(root, frame)
            target = staging / public_mobile_still(frame, role)
            record = sanitize_png(source, target)
            sanitation.append({
                "kind": "mobile-milestone",
                "viewport": raw.FULL_VIEWPORT,
                "frame": frame,
                "role": role,
                "publicPath": target.relative_to(staging).as_posix(),
                **record,
            })
        for viewport, (width, height) in raw.RESPONSIVE_VIEWPORTS.items():
            for frame, role in raw.MILESTONES:
                source = raw.responsive_frame_path(root, viewport, frame, role)
                target = staging / public_responsive_still(viewport, frame, role)
                record = sanitize_png(source, target)
                if (record["width"], record["height"]) != (width, height):
                    raise RuntimeError(f"responsive sanitation dimension mismatch: {viewport}/F{frame:03d}")
                sanitation.append({
                    "kind": "responsive-milestone",
                    "viewport": viewport,
                    "frame": frame,
                    "role": role,
                    "publicPath": target.relative_to(staging).as_posix(),
                    **record,
                })
        video_probe, video_command = encode_video(root, staging, ffmpeg, ffprobe)
        source_summary_path = staging / SOURCE_SUMMARY_PATH
        raw.atomic_json_new(source_summary_path, source_summary_value(plan))
        asset_privacy = privacy_scan_tree(staging)
        verification = {
            "schema": PUBLIC_VERIFICATION_SCHEMA,
            "status": "PASS",
            "authorities": plan["authorities"],
            "rawAuthority": raw_audit,
            "rawCounts": {"sequenceFrames": len(sequence), "responsiveStills": len(responsive), "rawPngs": len(sequence) + len(responsive)},
            "publicCounts": {"sanitizedPngs": len(sanitation), "videos": 1},
            "pngSanitation": {
                "count": len(sanitation),
                "allDecodedPixelsUnchanged": all(item["decodedPixelsUnchanged"] for item in sanitation),
                "allPrivateMetadataRemoved": all(item["privateMetadataRemoved"] for item in sanitation),
                "records": sanitation,
            },
            "video": {
                "path": VIDEO_PATH,
                **raw.file_record(staging / VIDEO_PATH),
                "probe": video_probe,
                "fullDecodePass": True,
                "command": video_command,
            },
            "privacyScanBeforeReportsAndManifest": asset_privacy,
            "rawSequenceCopiedToPublic": False,
            "frame501Through540Present": False,
            "authorization": raw.authorization_denials(),
            "humanReviewDecision": None,
        }
        raw.atomic_json_new(staging / VERIFICATION_PATH, verification)
        tool_authorities = {
            "ffmpeg": executable_record(ffmpeg, "encoder/decoder"),
            "ffprobe": executable_record(ffprobe, "media probe"),
        }
        finalization = {
            "schema": FINALIZATION_SCHEMA,
            "status": "PASS",
            "authorities": plan["authorities"],
            "rawAuthority": raw_audit,
            "tools": tool_authorities,
            "video": public_relative_record(staging, staging / VIDEO_PATH, **video_probe),
            "mobileMilestones": [
                public_relative_record(
                    staging,
                    staging / public_mobile_still(frame, role),
                    viewport=raw.FULL_VIEWPORT, frame=frame, role=role, engine="BLENDER_EEVEE",
                )
                for frame, role in raw.MILESTONES
            ],
            "responsiveMilestones": [
                public_relative_record(
                    staging,
                    staging / public_responsive_still(viewport, frame, role),
                    viewport=viewport, frame=frame, role=role, engine="BLENDER_EEVEE",
                    cameraFamily="mobile", sensorFit="AUTO->VERTICAL",
                )
                for viewport in raw.RESPONSIVE_VIEWPORTS
                for frame, role in raw.MILESTONES
            ],
            "sourceSummary": public_relative_record(staging, source_summary_path),
            "verification": public_relative_record(staging, staging / VERIFICATION_PATH),
            "publicPayloadCounts": {
                "png": EXPECTED_PUBLIC_PNG_COUNT,
                "video": EXPECTED_PUBLIC_VIDEO_COUNT,
                "reports": EXPECTED_PUBLIC_REPORT_COUNT,
                "manifestExcludesItselfToAvoidCircularHash": True,
            },
            "limitations": {
                "engine": "Eevee physical review evidence; not final Cycles production film",
                "physicalFrameBoundary": "F001-F500 only; F501-F540 are semantic/browser states and were not physically rendered",
                "responsive": "physical cinematic milestones only; breathing and settled ENTRY are composed later with browser evidence",
                "humanAcceptancePending": True,
            },
            "authorization": raw.authorization_denials(),
            "humanReviewDecision": None,
        }
        raw.atomic_json_new(staging / FINALIZATION_PATH, finalization)
        payloads = sorted(
            path for path in staging.rglob("*")
            if path.is_file() and path.relative_to(staging).as_posix() != MANIFEST_PATH
        )
        entries = [manifest_entry(staging, path, plan["authorities"]["source"]["sha256"]) for path in payloads]
        relative_paths = [entry["relativePath"] for entry in entries]
        if len(relative_paths) != len(set(relative_paths)):
            raise RuntimeError("duplicate public manifest paths")
        manifest = {
            "schema": PUBLIC_MANIFEST_SCHEMA,
            "status": "PASS",
            "finalBlenderSource": plan["authorities"]["source"],
            "sourceBuildReport": plan["authorities"]["sourceBuild"],
            "sourceBuilder": plan["authorities"]["sourceBuilder"],
            "sourceConfig": plan["authorities"]["sourceConfig"],
            "producer": plan["authorities"]["producer"],
            "finalizer": plan["authorities"]["finalizer"],
            "payloadCount": len(entries),
            "payloadByteCount": sum(entry["byteSize"] for entry in entries),
            "entries": entries,
            "manifestPath": MANIFEST_PATH,
            "manifestSelfExcludedToAvoidCircularHash": True,
            "rawFullSequenceIncluded": False,
            "authorization": raw.authorization_denials(),
            "humanReviewDecision": None,
        }
        raw.atomic_json_new(staging / MANIFEST_PATH, manifest)
        validate_public_tree(staging, ffprobe, ffmpeg)
        os.replace(staging, public)
    except BaseException:
        # Preserve a failed staging tree for forensic inspection; it is never public.
        raise
    validate_public_tree(public, ffprobe, ffmpeg)
    return public / MANIFEST_PATH


def validate_public_tree(public_root: Path, ffprobe: Path, ffmpeg: Path) -> dict[str, Any]:
    manifest_path = public_root / MANIFEST_PATH
    if not manifest_path.is_file():
        raise RuntimeError("public manifest is missing")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    expected_authorities = current_authorities()
    if (
        {key: expected_authorities["source"][key] for key in ("bytes", "sha256")} != raw.EXPECTED_DERIVATIVE
        or {key: expected_authorities["sourceBuild"][key] for key in ("bytes", "sha256")} != raw.EXPECTED_BUILD_REPORT
        or {key: expected_authorities["sourceBuilder"][key] for key in ("bytes", "sha256")} != raw.EXPECTED_BUILDER
        or {key: expected_authorities["sourceConfig"][key] for key in ("bytes", "sha256")} != raw.EXPECTED_CONFIG
    ):
        raise RuntimeError("live source authority changed before public verification")
    if (
        manifest.get("schema") != PUBLIC_MANIFEST_SCHEMA
        or manifest.get("status") != "PASS"
        or manifest.get("finalBlenderSource") != expected_authorities["source"]
        or manifest.get("sourceBuildReport") != expected_authorities["sourceBuild"]
        or manifest.get("sourceBuilder") != expected_authorities["sourceBuilder"]
        or manifest.get("sourceConfig") != expected_authorities["sourceConfig"]
        or manifest.get("producer") != expected_authorities["producer"]
        or manifest.get("finalizer") != expected_authorities["finalizer"]
        or manifest.get("authorization") != raw.authorization_denials()
        or manifest.get("humanReviewDecision") is not None
        or manifest.get("manifestSelfExcludedToAvoidCircularHash") is not True
        or manifest.get("rawFullSequenceIncluded") is not False
    ):
        raise RuntimeError("public manifest contract differs")
    entries = manifest.get("entries")
    if not isinstance(entries, list):
        raise RuntimeError("public manifest entries are invalid")
    paths = [entry.get("relativePath") for entry in entries]
    if len(paths) != len(set(paths)) or any(not isinstance(path, str) for path in paths):
        raise RuntimeError("public manifest contains duplicate/invalid paths")
    actual_files = sorted(
        path.relative_to(public_root).as_posix()
        for path in public_root.rglob("*")
        if path.is_file() and path.relative_to(public_root).as_posix() != MANIFEST_PATH
    )
    if sorted(paths) != actual_files:
        raise RuntimeError("public manifest coverage differs from the public tree")
    if manifest.get("payloadCount") != len(entries) or manifest.get("payloadByteCount") != sum(
        int(entry.get("byteSize", -1)) for entry in entries
    ):
        raise RuntimeError("public manifest aggregate counts differ")
    source_sha = manifest.get("finalBlenderSource", {}).get("sha256")
    for entry in entries:
        path = public_root / entry["relativePath"]
        actual = raw.file_record(path)
        if actual != {"bytes": entry.get("byteSize"), "sha256": entry.get("sha256")}:
            raise RuntimeError(f"public manifest hash/size mismatch: {entry['relativePath']}")
        if entry.get("finalBlenderSourceHash") != source_sha or purpose_metadata(entry["relativePath"]) != {
            key: entry.get(key) for key in ("purpose", "viewport", "frameOrRange", "engine")
        }:
            raise RuntimeError(f"public manifest semantic metadata mismatch: {entry['relativePath']}")
    pngs = sorted(public_root.rglob("*.png"))
    videos = sorted(public_root.rglob("*.mp4"))
    reports = sorted((public_root / "reports").glob("*.json"))
    if len(pngs) != EXPECTED_PUBLIC_PNG_COUNT or len(videos) != 1 or len(reports) != EXPECTED_PUBLIC_REPORT_COUNT:
        raise RuntimeError("public payload counts differ")
    source_summary = json.loads((public_root / SOURCE_SUMMARY_PATH).read_text(encoding="utf-8"))
    public_verification = json.loads((public_root / VERIFICATION_PATH).read_text(encoding="utf-8"))
    finalization = json.loads((public_root / FINALIZATION_PATH).read_text(encoding="utf-8"))
    if (
        source_summary.get("schema") != SOURCE_SUMMARY_SCHEMA
        or source_summary.get("status") != "PASS"
        or source_summary.get("finalCumulativeSource") != expected_authorities["source"]
        or source_summary.get("sourceBuildReport") != expected_authorities["sourceBuild"]
        or source_summary.get("sourceBuilder") != expected_authorities["sourceBuilder"]
        or source_summary.get("sourceConfig") != expected_authorities["sourceConfig"]
        or source_summary.get("producer") != expected_authorities["producer"]
        or source_summary.get("finalizer") != expected_authorities["finalizer"]
        or source_summary.get("authorization") != raw.authorization_denials()
        or source_summary.get("humanReviewDecision") is not None
    ):
        raise RuntimeError("public source-summary authority/authorization contract differs")
    if (
        public_verification.get("schema") != PUBLIC_VERIFICATION_SCHEMA
        or public_verification.get("status") != "PASS"
        or public_verification.get("authorities") != expected_authorities
        or public_verification.get("authorization") != raw.authorization_denials()
        or public_verification.get("humanReviewDecision") is not None
        or public_verification.get("rawAuthority", {}).get("authorization") != raw.authorization_denials()
        or public_verification.get("rawCounts") != {"sequenceFrames": 500, "responsiveStills": 21, "rawPngs": 521}
        or public_verification.get("publicCounts") != {"sanitizedPngs": 28, "videos": 1}
        or public_verification.get("rawSequenceCopiedToPublic") is not False
        or public_verification.get("frame501Through540Present") is not False
        or public_verification.get("pngSanitation", {}).get("allDecodedPixelsUnchanged") is not True
        or public_verification.get("pngSanitation", {}).get("allPrivateMetadataRemoved") is not True
        or public_verification.get("video", {}).get("fullDecodePass") is not True
    ):
        raise RuntimeError("public verification authority/authorization contract differs")
    if (
        finalization.get("schema") != FINALIZATION_SCHEMA
        or finalization.get("status") != "PASS"
        or finalization.get("authorities") != expected_authorities
        or finalization.get("authorization") != raw.authorization_denials()
        or finalization.get("humanReviewDecision") is not None
        or finalization.get("rawAuthority", {}).get("authorization") != raw.authorization_denials()
        or finalization.get("publicPayloadCounts", {}).get("png") != 28
        or finalization.get("publicPayloadCounts", {}).get("video") != 1
        or finalization.get("publicPayloadCounts", {}).get("reports") != 3
        or len(finalization.get("mobileMilestones", [])) != 7
        or len(finalization.get("responsiveMilestones", [])) != 21
    ):
        raise RuntimeError("public finalization authority/authorization contract differs")
    for path in pngs:
        _header, chunks = png_chunks(path)
        if any(chunk["type"] in METADATA_CHUNKS for chunk in chunks):
            raise RuntimeError(f"public PNG retains private metadata: {path.name}")
        decoded_pixels(path)
    video_probe = probe_video(ffprobe, public_root / VIDEO_PATH)
    run_tool(
        [str(ffmpeg), "-v", "error", "-nostdin", "-i", str(public_root / VIDEO_PATH), "-map", "0:v:0", "-f", "null", "-"],
        "independent public video decode",
    )
    privacy = privacy_scan_tree(public_root)
    if privacy["privatePathHits"] != 0:
        raise RuntimeError("public privacy scan failed")
    forbidden = [path.name for path in public_root.rglob("*") if path.is_file() and re.search(r"F(?:50[1-9]|5[1-3]\d|540)", path.name)]
    if forbidden:
        raise RuntimeError("public tree contains forbidden F501-F540 payloads")
    return {
        "status": "PASS",
        "manifest": raw.file_record(manifest_path),
        "payloadCount": len(entries),
        "payloadByteCount": sum(entry["byteSize"] for entry in entries),
        "pngCount": len(pngs),
        "videoCount": len(videos),
        "reportCount": len(reports),
        "video": video_probe,
        "privacy": {"fileCount": privacy["fileCount"], "byteCount": privacy["byteCount"], "privatePathHits": 0},
        "duplicatePaths": [],
        "unmanifestedPayloads": [],
        "hashAndSizeMismatches": [],
        "imagesDecode": True,
        "videosDecode": True,
        "forbiddenFramesPresent": [],
        "rawFullSequenceIncluded": False,
        "authorization": raw.authorization_denials(),
    }


def write_failure(root: Path | None, mode: str, error: BaseException) -> None:
    if root is None or not root.is_dir():
        return
    value = {
        "schema": FAILURE_SCHEMA,
        "status": "FAIL",
        "mode": mode,
        "error": raw.safe_error(error),
        "outputRoot": ".",
        "authorization": raw.authorization_denials(),
        "humanReviewDecision": None,
    }
    raw.atomic_json_replace(root / "reports" / f"finalizer-failure-{mode}.json", value)


def make_png(width: int, height: int, rgb: bytes, private_text: bytes | None = None) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    if len(rgb) != width * height * 3:
        raise RuntimeError("self-test RGB length differs")
    scanlines = b"".join(b"\x00" + rgb[row * width * 3 : (row + 1) * width * 3] for row in range(height))
    payload = raw.PNG_SIGNATURE + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    if private_text is not None:
        payload += chunk(b"tEXt", b"Source\x00" + private_text)
    return payload + chunk(b"IDAT", zlib.compress(scanlines)) + chunk(b"IEND", b"")


def pure_self_test() -> dict[str, Any]:
    if EXPECTED_PUBLIC_PNG_COUNT != 28 or raw.FULL_CHUNKS[-1] != (451, 500):
        raise RuntimeError("finalizer fixed-count self-test failed")
    if any(raw.authorization_denials().values()):
        raise RuntimeError("finalizer authorization denial self-test failed")
    expected_paths = {
        *(public_mobile_still(frame, role) for frame, role in raw.MILESTONES),
        *(
            public_responsive_still(viewport, frame, role)
            for viewport in raw.RESPONSIVE_VIEWPORTS
            for frame, role in raw.MILESTONES
        ),
    }
    if len(expected_paths) != 28:
        raise RuntimeError("public still path uniqueness self-test failed")
    with tempfile.TemporaryDirectory(prefix="phase4r1-1-final-physical-finalizer-self-test-") as temp:
        root = Path(temp)
        source = root / "source.png"
        target = root / "target.png"
        source.write_bytes(make_png(2, 1, bytes((255, 0, 32, 0, 128, 255)), b"C:/Users/example/AppData/Local/Temp/raw.blend"))
        before = decoded_pixels(source)
        result = sanitize_png(source, target)
        after = decoded_pixels(target)
        if before != after or not result["privateMetadataRemoved"]:
            raise RuntimeError("PNG sanitation pixel-invariance self-test failed")
        if any(chunk["type"] in METADATA_CHUNKS for chunk in png_chunks(target)[1]):
            raise RuntimeError("PNG sanitation metadata-removal self-test failed")
        binary_privacy_scan(target)
        try:
            binary_privacy_scan(source)
        except RuntimeError:
            pass
        else:
            raise RuntimeError("binary private-path rejection self-test failed")
    for path in expected_paths:
        metadata = purpose_metadata(path)
        if metadata["engine"] != "BLENDER_EEVEE":
            raise RuntimeError("manifest semantic metadata self-test failed")
    valid_probe = {
        "streams": [{
            "codec_type": "video", "codec_name": "h264", "pix_fmt": "yuv420p",
            "width": 390, "height": 844, "avg_frame_rate": "30/1",
            "r_frame_rate": "30/1", "nb_read_frames": "500", "duration": "16.666667",
            "tags": {"language": "und"},
        }],
        "format": {"duration": "16.666667", "nb_streams": 1, "tags": {"major_brand": "isom"}},
    }
    if validate_probe_payload(valid_probe)["metadataStripped"] is not True:
        raise RuntimeError("strict media-probe acceptance self-test failed")
    invalid_probes = []
    encoder_probe = json.loads(json.dumps(valid_probe))
    encoder_probe["streams"][0]["tags"]["encoder"] = "should-have-been-cleared"
    invalid_probes.append(encoder_probe)
    collision_probe = json.loads(json.dumps(valid_probe))
    collision_probe["format"]["tags"]["encoder"] = "should-have-been-cleared"
    collision_probe["streams"][0]["tags"]["encoder"] = ""
    invalid_probes.append(collision_probe)
    extra_stream_probe = json.loads(json.dumps(valid_probe))
    extra_stream_probe["streams"].append({"codec_type": "subtitle", "codec_name": "mov_text"})
    extra_stream_probe["format"]["nb_streams"] = 2
    invalid_probes.append(extra_stream_probe)
    for value in invalid_probes:
        try:
            validate_probe_payload(value)
        except RuntimeError:
            pass
        else:
            raise RuntimeError("strict media metadata/extra-stream rejection self-test failed")
    return {
        "schema": "quantum-hub.phase-4-r1-1.final-physical-finalizer-self-test.v1",
        "status": "PASS",
        "publicPngCount": EXPECTED_PUBLIC_PNG_COUNT,
        "publicVideoCount": 1,
        "videoFrameRange": [1, 500],
        "videoFrameCount": 500,
        "videoContract": {"codec": "h264", "pixelFormat": "yuv420p", "fps": 30, "audio": False},
        "rawFramesCopiedToPublic": False,
        "forbiddenFrameRange": [501, 540],
        "authorization": raw.authorization_denials(),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("finalize", "verify"), required=True)
    parser.add_argument("--output-root", required=True)
    parser.add_argument("--ffmpeg", required=True)
    parser.add_argument("--ffprobe", required=True)
    return parser.parse_args()


def main() -> None:
    if "--self-test" in sys.argv:
        if len(sys.argv) != 2 or sys.argv[1] != "--self-test":
            raise RuntimeError("--self-test cannot be combined with finalization arguments")
        print(json.dumps(pure_self_test(), sort_keys=True, indent=2))
        return
    args = parse_args()
    root: Path | None = None
    try:
        root = raw.require_existing_root(args.output_root)
        ffmpeg = resolve_executable(args.ffmpeg)
        ffprobe = resolve_executable(args.ffprobe)
        plan, sequence, responsive, raw_audit = load_complete_raw_root(root)
        if args.mode == "finalize":
            report = create_public_tree(root, plan, sequence, responsive, raw_audit, ffmpeg, ffprobe)
            verification = validate_public_tree(root / PUBLIC_DIR, ffprobe, ffmpeg)
        else:
            report = root / PUBLIC_DIR / MANIFEST_PATH
            verification = validate_public_tree(root / PUBLIC_DIR, ffprobe, ffmpeg)
    except BaseException as error:
        write_failure(root, args.mode, error)
        raise
    print("PHASE4R1_1_FINAL_PHYSICAL_FINALIZER_STATUS=PASS")
    print(f"PHASE4R1_1_FINAL_PHYSICAL_FINALIZER_MODE={args.mode}")
    print(f"PHASE4R1_1_FINAL_PHYSICAL_PUBLIC_MANIFEST={report}")
    print(json.dumps(verification, sort_keys=True))


if __name__ == "__main__":
    main()
