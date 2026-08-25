"""Render the bounded Phase 4-R1.1 cable-material checkpoint evidence.

The producer is deliberately external, fail closed, and no-save.  It binds the
cumulative ``--through cable`` derivative to its source-build and producer
authorities, verifies the accepted R1 comparison frames without copying them,
renders a small Eevee matrix, and publishes an exhaustive PNG ledger.  Native
visual judgment remains a separate human gate.
"""

from __future__ import annotations

import argparse
import binascii
from collections import deque
import hashlib
import json
import math
import os
from pathlib import Path
import statistics
import struct
import sys
import tempfile
import time
from typing import Any, Iterable
import zlib

import bpy
from mathutils import Matrix, Vector

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
import phase4r1_1_repair_config as cfg


REPORT_NAME = "phase4r1-1-cable-diagnostic.json"
FAILURE_NAME = "phase4r1-1-cable-diagnostic-failure.json"
DESKTOP_CAMERA = "Phase4R1_Camera_Desktop"
DESKTOP_COLLECTION = "PHASE4R1V2_CABLE_DESKTOP"
MOBILE_COLLECTION = "PHASE4R1V2_CABLE_MOBILE"
LANDSCAPE_COLLECTION = "PHASE4R1V2_CABLE_LANDSCAPE"
DESKTOP_SHEATH = "Phase4R1V2_Desktop_ContinuousGraphiteSheath"
CURRENT_PREFIX = "Phase4R1V2_Desktop_Current_"
CURRENT_SEGMENT_COUNT = 160
CABLE_DIAMETER_METERS = 0.054
FULL_FRAMES = (1, 46, 47, 70, 106, 166, 225, 261, 285)
SOURCE_BUILD_STATE_FRAMES = (1, 46, 70, 106, 166, 225, 261, 285)
ISOLATION_FRAMES = (70, 106, 166, 225, 261, 285)
FIRST_VISIBLE_CANDIDATES = (47, 48, 49, 50)
FRAME_PROGRESS = {
    frame: None if frame < 46 else round((frame - 46) / (285 - 46), 10)
    for frame in (*FULL_FRAMES, *FIRST_VISIBLE_CANDIDATES)
}

ACCEPTED_R1_ROOT_ID = "qsite-phase4r1-preview-a0a122ba-desktop-20260825"
ACCEPTED_R1_MANIFEST = "phase4r1-refined-desktop-physical-frame-manifest.json"
ACCEPTED_R1_MANIFEST_RECORD = {
    "bytes": 180_147,
    "sha256": "f523815bbc99f2fc4196c399ac59356e9e49922feb09cc5341515daaf718eb38",
}
ACCEPTED_R1_FRAMES = {
    46: {"bytes": 926_585, "sha256": "962e8a9746746c6be988cbc96ddcbc90a319d9459c23013bc91110392a9d1e4d"},
    47: {"bytes": 926_925, "sha256": "cf61da0f141c1271816ef6861d716ac95cecfb8fd309276d18f69f2514d52421"},
    70: {"bytes": 948_333, "sha256": "66572553d9a5fd2d8e262733a424a5245d5e9b36c99078e2d32318430b35964f"},
    106: {"bytes": 955_553, "sha256": "71d8c3e666e9aec74620783d4be37d78e00555c331d5ebd690d9f839b981758b"},
    166: {"bytes": 759_751, "sha256": "91e097e98d4a45d626b05357773c1cd5d7ed97da2483d3a2c38d211ef85b3a53"},
    225: {"bytes": 916_195, "sha256": "144e47b4a203f633f95012438c5b23f5c669b8b59b3d9ebd9ccc95dceeae7f46"},
    261: {"bytes": 1_031_906, "sha256": "21390cc17288cbede8731a924692ef3e657856ef963904de4939cc63a6fe0a8f"},
    285: {"bytes": 977_770, "sha256": "c284c721bf6e0cafbafc0bc0077436ce535a02eceb2bf57bf39a61fdcc8cb4d3"},
}

HUMAN_REVIEW_GATES = {
    "peripheralProvingHallAuthority": None,
    "physicalGraphiteCurrent": None,
    "mobileCameraOpticalContinuity": None,
    "exactQAndCrtPhosphorAuthority": None,
    "responsivePhysicalCinematicEvidence": None,
    "acceptedR1Regression": None,
}

FROZEN_PRESERVATION_KEYS = (
    "hallExceptOpeningHeaders",
    "centralFloor",
    "cableOriginAndDistributionSource",
    "connections",
    "crtGeometryActionsAndMaterialBindings",
    "desktopCamera",
    "landscapeCamera",
    "mobileCameraFull",
    "mobileCameraExceptLens",
    "exactQ",
    "screenSpill",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_record(path: Path) -> dict[str, Any]:
    return {"bytes": path.stat().st_size, "sha256": sha256(path)}


def canonical_hash(value: Any) -> str:
    data = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("ascii")
    return hashlib.sha256(data).hexdigest()


def safe_repo_record(path: Path) -> dict[str, Any]:
    resolved = path.resolve()
    try:
        relative = resolved.relative_to(cfg.REPO_ROOT.resolve()).as_posix()
    except ValueError as error:
        raise RuntimeError(f"producer authority is outside the repository: {path.name}") from error
    if relative.startswith("../") or ":" in relative:
        raise RuntimeError(f"unsafe repository-relative producer authority: {relative}")
    return {"path": relative, **file_record(resolved)}


def atomic_json(path: Path, value: dict[str, Any]) -> None:
    pending = path.with_name(path.stem + ".pending.json")
    if path.exists() or pending.exists():
        raise RuntimeError(f"refusing to overwrite diagnostic JSON authority: {path.name}")
    try:
        pending.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
        parsed = json.loads(pending.read_text(encoding="utf-8"))
        if parsed.get("status") != value.get("status"):
            raise RuntimeError(f"diagnostic JSON self-validation failed: {path.name}")
        os.replace(pending, path)
    finally:
        pending.unlink(missing_ok=True)


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--through", choices=("cable",), required=True)
    parser.add_argument("--output-root", required=True)
    parser.add_argument(
        "--accepted-r1-root",
        default=str(Path(tempfile.gettempdir()) / ACCEPTED_R1_ROOT_ID),
    )
    return parser.parse_args(argv)


def external_fresh_root(value: str) -> Path:
    output = Path(value).resolve()
    repository = cfg.REPO_ROOT.resolve()
    if output == repository or repository in output.parents:
        raise RuntimeError("cable diagnostic output must remain external to Git")
    if output.exists():
        raise RuntimeError("cable diagnostic output root must be new and absent")
    output.mkdir(parents=True, exist_ok=False)
    return output


def png_dimensions(path: Path) -> tuple[int, int]:
    payload = path.read_bytes()
    if len(payload) < 24 or payload[:8] != b"\x89PNG\r\n\x1a\n" or payload[12:16] != b"IHDR":
        raise RuntimeError(f"invalid PNG authority: {path.name}")
    return int.from_bytes(payload[16:20], "big"), int.from_bytes(payload[20:24], "big")


def read_png_rgb(path: Path) -> tuple[int, int, bytearray]:
    payload = path.read_bytes()
    if payload[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError(f"invalid PNG signature: {path.name}")
    cursor = 8
    width = height = bit_depth = color_type = interlace = None
    compressed = bytearray()
    while cursor < len(payload):
        if cursor + 12 > len(payload):
            raise RuntimeError(f"truncated PNG chunk: {path.name}")
        length = struct.unpack(">I", payload[cursor : cursor + 4])[0]
        end = cursor + 12 + length
        if end > len(payload):
            raise RuntimeError(f"truncated PNG payload: {path.name}")
        chunk_type = payload[cursor + 4 : cursor + 8]
        data = payload[cursor + 8 : cursor + 8 + length]
        expected_crc = struct.unpack(">I", payload[cursor + 8 + length : end])[0]
        if binascii.crc32(chunk_type + data) & 0xFFFFFFFF != expected_crc:
            raise RuntimeError(f"PNG CRC failure: {path.name}")
        cursor = end
        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type, compression, filter_method, interlace = struct.unpack(">IIBBBBB", data)
            if compression != 0 or filter_method != 0:
                raise RuntimeError(f"unsupported PNG encoding: {path.name}")
        elif chunk_type == b"IDAT":
            compressed.extend(data)
        elif chunk_type == b"IEND":
            break
    if width is None or height is None or bit_depth != 8 or color_type not in {2, 6} or interlace != 0:
        raise RuntimeError(f"diagnostic requires non-interlaced 8-bit RGB/RGBA PNG: {path.name}")
    channels = 3 if color_type == 2 else 4
    stride = width * channels
    decompressed = zlib.decompress(bytes(compressed))
    if len(decompressed) != height * (stride + 1):
        raise RuntimeError(f"PNG scanline size mismatch: {path.name}")
    rows: list[bytearray] = []
    offset = 0
    for _ in range(height):
        filter_type = decompressed[offset]
        source = decompressed[offset + 1 : offset + 1 + stride]
        offset += stride + 1
        previous = rows[-1] if rows else bytearray(stride)
        row = bytearray(stride)
        for index, raw in enumerate(source):
            left = row[index - channels] if index >= channels else 0
            above = previous[index]
            upper_left = previous[index - channels] if index >= channels else 0
            if filter_type == 0:
                value = raw
            elif filter_type == 1:
                value = raw + left
            elif filter_type == 2:
                value = raw + above
            elif filter_type == 3:
                value = raw + ((left + above) >> 1)
            elif filter_type == 4:
                predictor = left + above - upper_left
                distance_left = abs(predictor - left)
                distance_above = abs(predictor - above)
                distance_upper_left = abs(predictor - upper_left)
                paeth = left if distance_left <= distance_above and distance_left <= distance_upper_left else above if distance_above <= distance_upper_left else upper_left
                value = raw + paeth
            else:
                raise RuntimeError(f"unsupported PNG filter {filter_type}: {path.name}")
            row[index] = value & 0xFF
        rows.append(row)
    rgb = bytearray(width * height * 3)
    destination = 0
    for row in rows:
        if channels == 3:
            rgb[destination : destination + width * 3] = row
            destination += width * 3
        else:
            for source_index in range(0, len(row), 4):
                alpha = row[source_index + 3] / 255.0
                rgb[destination] = round(row[source_index] * alpha)
                rgb[destination + 1] = round(row[source_index + 1] * alpha)
                rgb[destination + 2] = round(row[source_index + 2] * alpha)
                destination += 3
    return width, height, rgb


LINEAR_SRGB = tuple(
    value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4
    for value in (index / 255.0 for index in range(256))
)


def linear_luminance(red: int, green: int, blue: int) -> float:
    return 0.2126 * LINEAR_SRGB[red] + 0.7152 * LINEAR_SRGB[green] + 0.0722 * LINEAR_SRGB[blue]


def magenta_like(red: int, green: int, blue: int) -> bool:
    return red >= 26 and blue >= 20 and green * 100 < min(red, blue) * 58 and red > blue * 0.72


def magenta_metrics(path: Path) -> dict[str, Any]:
    width, height, rgb = read_png_rgb(path)
    count = 0
    for offset in range(0, len(rgb), 3):
        if magenta_like(rgb[offset], rgb[offset + 1], rgb[offset + 2]):
            count += 1
    pixels = width * height
    return {
        "resolution": [width, height],
        "magentaLikePixelCount": count,
        "magentaLikePixelFraction": round(count / pixels, 10),
    }


def early_current_visibility_metrics(accepted_path: Path, repaired_path: Path) -> dict[str, Any]:
    accepted_width, accepted_height, accepted_rgb = read_png_rgb(accepted_path)
    repaired_width, repaired_height, repaired_rgb = read_png_rgb(repaired_path)
    if (accepted_width, accepted_height) != (1440, 900) or (repaired_width, repaired_height) != (1440, 900):
        raise RuntimeError("F106 early-current comparison requires exact native desktop dimensions")

    def strict_mask(rgb: bytearray) -> bytearray:
        result = bytearray(len(rgb) // 3)
        for pixel in range(len(result)):
            offset = pixel * 3
            if magenta_like(rgb[offset], rgb[offset + 1], rgb[offset + 2]):
                result[pixel] = 1
        return result

    accepted_mask = strict_mask(accepted_rgb)
    repaired_mask = strict_mask(repaired_rgb)
    accepted_pixels = [pixel for pixel, active in enumerate(accepted_mask) if active]
    if not accepted_pixels:
        raise RuntimeError("accepted R1 F106 comparator unexpectedly contains no current pixels")
    accepted_bbox = {
        "minX": min(pixel % accepted_width for pixel in accepted_pixels),
        "minY": min(pixel // accepted_width for pixel in accepted_pixels),
        "maxX": max(pixel % accepted_width for pixel in accepted_pixels),
        "maxY": max(pixel // accepted_width for pixel in accepted_pixels),
    }
    expected_accepted = {
        "pixelCount": 316,
        "bbox": {"minX": 0, "minY": 306, "maxX": 322, "maxY": 471},
    }
    accepted_authority_exact = (
        len(accepted_pixels) == expected_accepted["pixelCount"]
        and accepted_bbox == expected_accepted["bbox"]
    )
    if not accepted_authority_exact:
        raise RuntimeError("accepted R1 F106 pixel comparator differs from its frozen native authority")

    roi_pixels: list[int] = []
    occupied_columns: set[int] = set()
    peak_luminance = 0.0
    for y in range(accepted_bbox["minY"], accepted_bbox["maxY"] + 1):
        for x in range(accepted_bbox["minX"], accepted_bbox["maxX"] + 1):
            pixel = y * repaired_width + x
            if not repaired_mask[pixel]:
                continue
            roi_pixels.append(pixel)
            occupied_columns.add(x)
            offset = pixel * 3
            peak_luminance = max(
                peak_luminance,
                linear_luminance(repaired_rgb[offset], repaired_rgb[offset + 1], repaired_rgb[offset + 2]),
            )
    roi_width = accepted_bbox["maxX"] - accepted_bbox["minX"] + 1
    occupied_fraction = len(occupied_columns) / roi_width
    empty_columns = [
        x
        for x in range(accepted_bbox["minX"], accepted_bbox["maxX"] + 1)
        if x not in occupied_columns
    ]
    maximum_empty_run = max((run[2] for run in contiguous_runs(empty_columns)), default=0)
    strict_column_widths: list[int] = []
    two_sided_dark_columns = 0
    for x in sorted(occupied_columns):
        strict_rows = [
            y
            for y in range(accepted_bbox["minY"] - 6, accepted_bbox["maxY"] + 7)
            if 0 <= y < repaired_height and repaired_mask[y * repaired_width + x]
        ]
        if not strict_rows:
            continue
        minimum_y, maximum_y = min(strict_rows), max(strict_rows)
        strict_column_widths.append(maximum_y - minimum_y + 1)
        upper_luminance = [
            linear_luminance(*repaired_rgb[(y * repaired_width + x) * 3 : (y * repaired_width + x) * 3 + 3])
            for y in range(max(0, minimum_y - 4), minimum_y)
        ]
        lower_luminance = [
            linear_luminance(*repaired_rgb[(y * repaired_width + x) * 3 : (y * repaired_width + x) * 3 + 3])
            for y in range(maximum_y + 1, min(repaired_height, maximum_y + 5))
        ]
        if upper_luminance and lower_luminance and min(upper_luminance) < 0.01 and min(lower_luminance) < 0.01:
            two_sided_dark_columns += 1
    median_strict_width = 0.0 if not strict_column_widths else float(statistics.median(strict_column_widths))
    maximum_strict_width = max(strict_column_widths, default=0)
    two_sided_dark_fraction = 0.0 if not strict_column_widths else two_sided_dark_columns / len(strict_column_widths)
    total_repaired = sum(repaired_mask)
    repaired_pixels = [pixel for pixel, active in enumerate(repaired_mask) if active]
    repaired_bbox = None if not repaired_pixels else {
        "minX": min(pixel % repaired_width for pixel in repaired_pixels),
        "minY": min(pixel // repaired_width for pixel in repaired_pixels),
        "maxX": max(pixel % repaired_width for pixel in repaired_pixels),
        "maxY": max(pixel // repaired_width for pixel in repaired_pixels),
    }
    roi_fraction = 0.0 if total_repaired == 0 else len(roi_pixels) / total_repaired
    connected = connected_components(dilate(repaired_mask, repaired_width, repaired_height, 1), repaired_width, repaired_height, 1)
    dominant = 0.0 if total_repaired == 0 or not connected else connected[0]["pixels"] / sum(item["pixels"] for item in connected)
    passes = {
        "acceptedComparatorExact": accepted_authority_exact,
        "repairedLeadPixelCount": len(roi_pixels) >= 190,
        "repairedLeadColumnOccupancy": occupied_fraction >= 0.90,
        "repairedLeadInteriorGap": maximum_empty_run <= 2,
        "repairedLeadPeakLuminance": peak_luminance >= 0.008,
        "repairedSignalPrimarilyInAcceptedLead": roi_fraction >= 0.90,
        "repairedLeadConnected": len(connected) <= 2 and dominant >= 0.98,
        "repairedLeadRemainsNarrow": median_strict_width <= 5.0 and maximum_strict_width <= 6,
        "repairedLeadRetainsTwoSidedDarkSheath": two_sided_dark_fraction >= 0.90,
        "repairedSignalInsideBoundedLeadSupport": (
            repaired_bbox is not None
            and repaired_bbox["minX"] >= 0
            and repaired_bbox["maxX"] <= 329
            and repaired_bbox["minY"] >= 300
            and repaired_bbox["maxY"] <= 479
        ),
    }
    return {
        "status": "PASS" if all(passes.values()) else "FAIL",
        "acceptedR1": {
            "pathStored": False,
            "pixelCount": len(accepted_pixels),
            "bbox": accepted_bbox,
            "authorityExact": accepted_authority_exact,
        },
        "repairedR1_1": {
            "strictPixelCountTotal": total_repaired,
            "strictPixelBoundingBox": repaired_bbox,
            "strictPixelCountInsideAcceptedLeadRoi": len(roi_pixels),
            "acceptedLeadRoiFractionOfRepairedSignal": round(roi_fraction, 8),
            "occupiedXColumnFractionInsideAcceptedLeadRoi": round(occupied_fraction, 8),
            "maximumEmptyInteriorXRunPixels": maximum_empty_run,
            "medianStrictSignalWidthPixels": round(median_strict_width, 4),
            "maximumStrictSignalWidthPixels": maximum_strict_width,
            "twoSidedDarkSheathColumnFraction": round(two_sided_dark_fraction, 8),
            "peakLinearLuminanceInsideAcceptedLeadRoi": round(peak_luminance, 8),
            "dilatedConnectedComponentCount": len(connected),
            "dilatedDominantComponentFraction": round(dominant, 8),
        },
        "passes": passes,
        "thresholds": {
            "minimumStrictPixelsInsideAcceptedLeadRoi": 190,
            "minimumOccupiedXColumnFraction": 0.90,
            "maximumEmptyInteriorXRunPixels": 2,
            "minimumPeakLinearLuminance": 0.008,
            "minimumSignalFractionInsideAcceptedLeadRoi": 0.90,
            "maximumDilatedConnectedComponents": 2,
            "minimumDilatedDominantComponentFraction": 0.98,
            "maximumMedianStrictSignalWidthPixels": 5.0,
            "maximumStrictSignalWidthPixels": 6,
            "minimumTwoSidedDarkSheathColumnFraction": 0.90,
            "boundedLeadSupport": {"minX": 0, "minY": 300, "maxX": 329, "maxY": 479},
        },
    }


def connected_components(mask: bytearray, width: int, height: int, minimum_size: int) -> list[dict[str, int]]:
    components: list[dict[str, int]] = []
    for start in range(width * height):
        if not mask[start]:
            continue
        mask[start] = 0
        queue: deque[int] = deque((start,))
        size = 0
        minimum_x = maximum_x = start % width
        minimum_y = maximum_y = start // width
        while queue:
            current = queue.popleft()
            x, y = current % width, current // width
            size += 1
            minimum_x, maximum_x = min(minimum_x, x), max(maximum_x, x)
            minimum_y, maximum_y = min(minimum_y, y), max(maximum_y, y)
            for neighbor_y in range(max(0, y - 1), min(height, y + 2)):
                for neighbor_x in range(max(0, x - 1), min(width, x + 2)):
                    neighbor = neighbor_y * width + neighbor_x
                    if mask[neighbor]:
                        mask[neighbor] = 0
                        queue.append(neighbor)
        if size >= minimum_size:
            components.append({"pixels": size, "minX": minimum_x, "minY": minimum_y, "maxX": maximum_x, "maxY": maximum_y})
    return sorted(components, key=lambda component: component["pixels"], reverse=True)


def binary_luminance_mask(rgb: bytearray, threshold: float) -> bytearray:
    mask = bytearray(len(rgb) // 3)
    for pixel in range(len(mask)):
        offset = pixel * 3
        if linear_luminance(rgb[offset], rgb[offset + 1], rgb[offset + 2]) >= threshold:
            mask[pixel] = 1
    return mask


def dilate(mask: bytearray, width: int, height: int, radius: int) -> bytearray:
    result = bytearray(mask)
    for _ in range(radius):
        source = result
        result = bytearray(source)
        for pixel, active in enumerate(source):
            if not active:
                continue
            x, y = pixel % width, pixel // width
            for neighbor_y in range(max(0, y - 1), min(height, y + 2)):
                for neighbor_x in range(max(0, x - 1), min(width, x + 2)):
                    result[neighbor_y * width + neighbor_x] = 1
    return result


def contiguous_runs(indices: Iterable[int]) -> list[tuple[int, int, int]]:
    values = list(indices)
    if not values:
        return []
    runs: list[tuple[int, int, int]] = []
    start = previous = values[0]
    for value in values[1:]:
        if value != previous + 1:
            runs.append((start, previous, previous - start + 1))
            start = value
        previous = value
    runs.append((start, previous, previous - start + 1))
    return runs


def isolation_metrics(path: Path) -> dict[str, Any]:
    width, height, rgb = read_png_rgb(path)
    maximum = 0.0
    for offset in range(0, len(rgb), 3):
        maximum = max(maximum, linear_luminance(rgb[offset], rgb[offset + 1], rgb[offset + 2]))
    threshold = max(0.008, maximum * 0.06)
    mask = binary_luminance_mask(rgb, threshold)
    active = sum(mask)
    components = connected_components(bytearray(mask), width, height, max(6, width * height // 250_000))
    dominant = 0.0 if active == 0 or not components else components[0]["pixels"] / active
    passed = active > 0 and len(components) == 1 and dominant >= 0.98
    return {
        "status": "PASS" if passed else "FAIL",
        "resolution": [width, height],
        "activePixelThresholdLinearLuminance": round(threshold, 8),
        "activePixelCount": active,
        "connectedComponents": components,
        "activeEnergizedIntervalCount": len(components),
        "dominantConnectedComponentFraction": round(dominant, 8),
        "passes": {
            "nonEmpty": active > 0,
            "oneActiveInterval": len(components) == 1,
            "dominantComponent": dominant >= 0.98,
        },
        "thresholds": {"activeIntervals": 1, "dominantComponentFractionMinimum": 0.98},
    }


def macro_metrics(beauty: Path, sheath_path: Path, signal_path: Path) -> dict[str, Any]:
    width, height, beauty_rgb = read_png_rgb(beauty)
    sheath_width, sheath_height, sheath_rgb = read_png_rgb(sheath_path)
    signal_width, signal_height, signal_rgb = read_png_rgb(signal_path)
    if (sheath_width, sheath_height) != (width, height) or (signal_width, signal_height) != (width, height):
        raise RuntimeError("macro beauty and analysis masks do not share exact native dimensions")
    sheath_mask = binary_luminance_mask(sheath_rgb, 0.10)
    maximum_signal = max(
        (linear_luminance(signal_rgb[offset], signal_rgb[offset + 1], signal_rgb[offset + 2]) for offset in range(0, len(signal_rgb), 3)),
        default=0.0,
    )
    signal_threshold = max(0.008, maximum_signal * 0.06)
    signal_mask = binary_luminance_mask(signal_rgb, signal_threshold)
    sheath_pixels = sum(sheath_mask)
    signal_pixels = sum(signal_mask)
    dilated_sheath = dilate(sheath_mask, width, height, 2)
    outside = sum(1 for pixel, active in enumerate(signal_mask) if active and not dilated_sheath[pixel])
    signal_to_sheath = 0.0 if sheath_pixels == 0 else signal_pixels / sheath_pixels
    outside_fraction = 0.0 if signal_pixels == 0 else outside / signal_pixels
    near_white = 0
    for pixel, active in enumerate(signal_mask):
        if not active:
            continue
        offset = pixel * 3
        if min(signal_rgb[offset], signal_rgb[offset + 1], signal_rgb[offset + 2]) >= 245:
            near_white += 1
    near_white_fraction = 0.0 if signal_pixels == 0 else near_white / signal_pixels

    dilated_signal = dilate(signal_mask, width, height, 1)
    boundary_pixels = [pixel for pixel, active in enumerate(sheath_mask) if active and not dilated_signal[pixel]]
    dark_boundary = 0
    for pixel in boundary_pixels:
        offset = pixel * 3
        if linear_luminance(beauty_rgb[offset], beauty_rgb[offset + 1], beauty_rgb[offset + 2]) <= 0.08:
            dark_boundary += 1
    boundary_fraction = 0.0 if sheath_pixels == 0 else len(boundary_pixels) / sheath_pixels
    dark_boundary_fraction = 0.0 if not boundary_pixels else dark_boundary / len(boundary_pixels)

    sheath_diameters: list[int] = []
    longest_signal_run_ratios: list[float] = []
    left_margins: list[int] = []
    right_margins: list[int] = []
    two_sided = 0
    valid_rows = 0
    rows_with_disjoint_signal_lobes = 0
    for y in range(height):
        row_offset = y * width
        sheath_runs = contiguous_runs(x for x in range(width) if sheath_mask[row_offset + x])
        signal_runs = contiguous_runs(x for x in range(width) if signal_mask[row_offset + x])
        if not sheath_runs or not signal_runs:
            continue
        if len(signal_runs) > 1:
            rows_with_disjoint_signal_lobes += 1
        signal_start, signal_end, signal_length = max(
            signal_runs,
            key=lambda run: (run[2], -run[0]),
        )
        sheath_start, sheath_end, sheath_diameter = max(
            sheath_runs,
            key=lambda run: (
                max(0, min(run[1], signal_end) - max(run[0], signal_start) + 1),
                run[2],
                -run[0],
            ),
        )
        overlap = max(0, min(sheath_end, signal_end) - max(sheath_start, signal_start) + 1)
        if overlap == 0:
            continue
        if sheath_diameter < 8:
            continue
        valid_rows += 1
        sheath_diameters.append(sheath_diameter)
        longest_signal_run_ratios.append(signal_length / sheath_diameter)
        left_margin = signal_start - sheath_start
        right_margin = sheath_end - signal_end
        left_margins.append(left_margin)
        right_margins.append(right_margin)
        required_margin = max(2, math.ceil(sheath_diameter * 0.06))
        if left_margin >= required_margin and right_margin >= required_margin:
            two_sided += 1
    median_sheath_diameter = 0.0 if not sheath_diameters else float(statistics.median(sheath_diameters))
    median_signal_ratio = 1.0 if not longest_signal_run_ratios else float(statistics.median(longest_signal_run_ratios))
    median_left_margin = 0.0 if not left_margins else float(statistics.median(left_margins))
    median_right_margin = 0.0 if not right_margins else float(statistics.median(right_margins))
    two_sided_fraction = 0.0 if valid_rows == 0 else two_sided / valid_rows
    segmentation_confident = sheath_pixels >= 1_000 and signal_pixels >= 50 and valid_rows >= 32 and median_sheath_diameter >= 48.0
    passes = {
        "segmentationConfident": segmentation_confident,
        "nativeCableDiameterAtLeast48Pixels": median_sheath_diameter >= 48.0,
        "signalNotWholeCircumference": signal_to_sheath <= 0.75 and median_signal_ratio <= 0.78,
        "explicitLeftAndRightSheathMargins": two_sided_fraction >= 0.60,
        "signalContainedBySheathSupport": outside_fraction <= 0.08,
        "blackBoundaryAreaRetained": boundary_fraction >= 0.10 and dark_boundary_fraction >= 0.45,
        "nearWhiteCoreBounded": near_white_fraction <= 0.02,
    }
    passed = all(passes.values())
    return {
        "status": "PASS" if passed else "FAIL",
        "resolution": [width, height],
        "segmentationMethod": "same-camera white sheath plus temporary semantic emission-only signal isolation; image-X cross-sections use the longest contiguous signal run and explicit left/right sheath margins so disjoint lobes cannot inflate signal width",
        "sheathPixelCount": sheath_pixels,
        "signalPixelCount": signal_pixels,
        "signalThresholdLinearLuminance": round(signal_threshold, 8),
        "signalToSheathPixelFraction": round(signal_to_sheath, 8),
        "signalOutsideTwoPixelDilatedSheathFraction": round(outside_fraction, 8),
        "nearWhiteSignalPixelCount": near_white,
        "nearWhiteSignalPixelFraction": round(near_white_fraction, 8),
        "boundaryPixelCount": len(boundary_pixels),
        "boundaryPixelFractionOfSheath": round(boundary_fraction, 8),
        "darkBoundaryPixelFraction": round(dark_boundary_fraction, 8),
        "crossSectionScanAxis": "image-X within each image row; diagnostic route tangent is aligned to image-Y",
        "validCrossSectionRowCount": valid_rows,
        "rowsWithDisjointSignalLobes": rows_with_disjoint_signal_lobes,
        "medianNativeSheathDiameterPixels": round(median_sheath_diameter, 4),
        "medianLongestContiguousSignalRunToSheathRatio": round(median_signal_ratio, 8),
        "medianLeftSheathMarginPixels": round(median_left_margin, 4),
        "medianRightSheathMarginPixels": round(median_right_margin, 4),
        "twoSidedSheathMarginRowFraction": round(two_sided_fraction, 8),
        "nativeArbitration": {
            "required": True,
            "reason": "two-sided physical reading, front softness, and trail character remain perceptual judgments even after conservative mask gates",
            "machineMeasurementIsNotHumanAcceptance": True,
        },
        "passes": passes,
        "thresholds": {
            "minimumSheathPixels": 1_000,
            "minimumSignalPixels": 50,
            "minimumValidCrossSectionRows": 32,
            "minimumNativeSheathDiameterPixels": 48,
            "maximumSignalToSheathPixelFraction": 0.75,
            "maximumMedianLongestContiguousSignalRunToSheathRatio": 0.78,
            "minimumTwoSidedSheathMarginRowFraction": 0.60,
            "perSideSheathMarginMinimum": "max(2 pixels, ceil(6% of native sheath diameter))",
            "maximumSignalOutsideTwoPixelDilatedSheathFraction": 0.08,
            "minimumBoundaryPixelFractionOfSheath": 0.10,
            "minimumDarkBoundaryPixelFraction": 0.45,
            "maximumNearWhiteSignalPixelFraction": 0.02,
        },
    }


def macro_baseline_regression(metrics: dict[str, Any]) -> dict[str, Any]:
    baselines = {
        "trailF166": {
            "signalToSheathPixelFraction": 0.41529867,
            "medianLongestContiguousSignalRunToSheathRatio": 0.40963855,
            "medianLeftSheathMarginPixels": 26.0,
            "medianRightSheathMarginPixels": 23.0,
            "boundaryPixelFractionOfSheath": 0.55951277,
        },
        "frontF261": {
            "signalToSheathPixelFraction": 0.42700598,
            "medianLongestContiguousSignalRunToSheathRatio": 0.42528736,
            "medianLeftSheathMarginPixels": 27.0,
            "medianRightSheathMarginPixels": 23.0,
            "boundaryPixelFractionOfSheath": 0.54959643,
        },
    }
    records: dict[str, Any] = {}
    for role, baseline in baselines.items():
        measured = metrics[role]
        passes = {
            "signalAreaNotWidened": measured["signalToSheathPixelFraction"] <= baseline["signalToSheathPixelFraction"] + 0.03,
            "medianRunNotWidened": measured["medianLongestContiguousSignalRunToSheathRatio"] <= baseline["medianLongestContiguousSignalRunToSheathRatio"] + 0.03,
            "leftMarginRetained": measured["medianLeftSheathMarginPixels"] >= baseline["medianLeftSheathMarginPixels"] - 2.0,
            "rightMarginRetained": measured["medianRightSheathMarginPixels"] >= baseline["medianRightSheathMarginPixels"] - 2.0,
            "boundaryAreaRetained": measured["boundaryPixelFractionOfSheath"] >= baseline["boundaryPixelFractionOfSheath"] - 0.03,
            "noDisjointSignalLobes": measured["rowsWithDisjointSignalLobes"] == 0,
        }
        records[role] = {
            "status": "PASS" if all(passes.values()) else "FAIL",
            "baseline": baseline,
            "tolerances": {"maximumWidthOrAreaIncrease": 0.03, "maximumMedianMarginLossPixels": 2.0},
            "passes": passes,
        }
    return {
        "status": "PASS" if all(record["status"] == "PASS" for record in records.values()) else "FAIL",
        "baselineAuthority": "prior full-authority centered view-facing PASS diagnostic; exact native metrics embedded here, no baseline images copied",
        "records": records,
    }


def source_build_structural_checks(build: dict[str, Any]) -> dict[str, Any]:
    exact_timeline = {"frameStart": 1, "frameEnd": 540, "fps": 30, "fpsBase": 1.0}
    timeline = build.get("timeline", {})
    if timeline.get("before") != exact_timeline or timeline.get("after") != exact_timeline or timeline.get("unchanged") is not True:
        raise RuntimeError("cable source-build does not preserve the exact 540-frame/30-fps timeline")
    stages = build.get("stages")
    if (
        not isinstance(stages, dict)
        or set(stages) != {"periphery", "cable"}
        or not isinstance(stages.get("periphery"), dict)
        or not isinstance(stages.get("cable"), dict)
    ):
        raise RuntimeError("cumulative source-build does not contain the exact periphery/cable stage set")
    preservation = build.get("preservation")
    if not isinstance(preservation, dict):
        raise RuntimeError("cable source-build lacks preservation evidence")
    unchanged = preservation.get("unchanged")
    if not isinstance(unchanged, dict):
        raise RuntimeError("cable source-build lacks explicit unchanged gates")
    frozen = {key: unchanged.get(key) is True for key in FROZEN_PRESERVATION_KEYS}
    if not all(frozen.values()):
        raise RuntimeError(f"cable source-build changed a frozen authority: {[key for key, passed in frozen.items() if not passed]}")

    if not unchanged or any(value is not True for value in unchanged.values()):
        raise RuntimeError("cable source-build contains a non-passing accepted-authority preservation gate")
    periphery_unchanged = preservation.get("peripheryUnchanged")
    if not isinstance(periphery_unchanged, dict) or not periphery_unchanged or any(
        value is not True for value in periphery_unchanged.values()
    ):
        raise RuntimeError("cumulative cable source-build does not prove the preceding periphery stage preserved accepted authority")

    fixed_keys = {
        "cableFamilyCollectionState",
        "cableContactProfileGeometry",
        "cableRouteGeometryAndTopology",
        "cableCurrentProgressionActions",
        "cableMaterialBindings",
        "cableLocalResponseAuthority",
    }
    fixed = preservation.get("cableFixedAuthority")
    if not isinstance(fixed, dict):
        raise RuntimeError("cable source-build lacks fixed cable-authority evidence")
    fixed_before = fixed.get("before")
    fixed_after = fixed.get("after")
    fixed_unchanged = fixed.get("unchanged")
    if not all(isinstance(value, dict) for value in (fixed_before, fixed_after, fixed_unchanged)):
        raise RuntimeError("fixed cable-authority evidence is malformed")
    if set(fixed_before) != fixed_keys or set(fixed_after) != fixed_keys or set(fixed_unchanged) != fixed_keys:
        raise RuntimeError("fixed cable-authority evidence does not contain the exact six bounded signatures")
    if fixed_before != fixed_after or any(fixed_unchanged.get(key) is not True for key in fixed_keys):
        raise RuntimeError("cable source-build changed cable geometry, topology, progression, bindings, collection state, or local response")
    if any(
        not isinstance(fixed_before[key], str)
        or len(fixed_before[key]) != 64
        or any(character not in "0123456789abcdef" for character in fixed_before[key])
        for key in fixed_keys
    ):
        raise RuntimeError("fixed cable-authority evidence contains a non-SHA-256 signature")

    before = preservation.get("before")
    after = preservation.get("after")
    if not isinstance(before, dict) or not isinstance(after, dict):
        raise RuntimeError("cable source-build lacks before/after accepted-authority snapshots")
    if any(before.get(key) != fixed_before[key] or after.get(key) != fixed_after[key] for key in fixed_keys):
        raise RuntimeError("fixed cable-authority evidence disagrees with the source-build preservation snapshots")

    current_states = preservation.get("currentStateHashes")
    expected_state_frames = list(SOURCE_BUILD_STATE_FRAMES)
    if not isinstance(current_states, dict) or current_states.get("frames") != expected_state_frames:
        raise RuntimeError("cable source-build lacks the exact bounded current-state frame schedule")
    current_before = current_states.get("before")
    current_after = current_states.get("after")
    expected_state_keys = {str(frame) for frame in expected_state_frames}
    if (
        not isinstance(current_before, dict)
        or not isinstance(current_after, dict)
        or set(current_before) != expected_state_keys
        or set(current_after) != expected_state_keys
        or current_before != current_after
        or current_states.get("unchanged") is not True
    ):
        raise RuntimeError("cable source-build changed or incompletely sampled the accepted current progression")
    if any(
        not isinstance(value, str)
        or len(value) != 64
        or any(character not in "0123456789abcdef" for character in value)
        for value in current_before.values()
    ):
        raise RuntimeError("current-state evidence contains a non-SHA-256 signature")

    cable_stage = stages["cable"]
    if (
        cable_stage.get("fixedAuthorityBefore") != fixed_before
        or cable_stage.get("fixedAuthorityAfter") != fixed_after
        or cable_stage.get("fixedAuthorityUnchanged") != fixed_unchanged
        or cable_stage.get("currentStateHashesBefore") != current_before
        or cable_stage.get("currentStateHashesAfter") != current_after
        or cable_stage.get("currentStateHashesUnchanged") is not True
    ):
        raise RuntimeError("cable stage structural evidence disagrees with preservation authority")

    expected_materials = sorted((cfg.CABLE_CURRENT_MATERIAL, cfg.CABLE_SHEATH_MATERIAL))
    live_source_corridor = source_corridor_axis_audit()
    if (
        sorted(cable_stage.get("materialNames", [])) != expected_materials
        or canonical_hash(cable_stage.get("materialAuthority")) != canonical_hash(cfg.CABLE_MATERIAL_AUTHORITY)
        or cable_stage.get("materialUsersBefore") != cable_stage.get("materialUsersAfter")
        or cable_stage.get("materialUsersUnchanged") is not True
        or cable_stage.get("responseLightsChanged") is not False
        or cable_stage.get("currentOrLightActionsChanged") is not False
        or cable_stage.get("changedAcceptedMaterials") != expected_materials
        or cable_stage.get("exactlyTwoAllowedMaterialGraphsChanged") is not True
        or cable_stage.get("sourceCorridorAxisAuditBefore") != live_source_corridor
        or cable_stage.get("sourceCorridorAxisAuditAfter") != live_source_corridor
        or cable_stage.get("sourceCorridorAxisAuditUnchanged") is not True
    ):
        raise RuntimeError("cable source-build material delta is not the exact bounded two-material repair")

    scene_frame = preservation.get("sceneFrame")
    if (
        not isinstance(scene_frame, dict)
        or scene_frame.get("before") != scene_frame.get("after")
        or scene_frame.get("unchanged") is not True
    ):
        raise RuntimeError("cable source-build did not restore its source frame/subframe")

    structural_claim_paths = {
        "geometryAndTopology": "preservation.cableFixedAuthority.unchanged.cableRouteGeometryAndTopology",
        "contactProfile": "preservation.cableFixedAuthority.unchanged.cableContactProfileGeometry",
        "progressionActionsAndTiming": "preservation.cableFixedAuthority.unchanged.cableCurrentProgressionActions",
        "materialBindings": "preservation.cableFixedAuthority.unchanged.cableMaterialBindings",
        "localResponse": "preservation.cableFixedAuthority.unchanged.cableLocalResponseAuthority",
        "sampledCurrentContinuity": "preservation.currentStateHashes.unchanged",
    }
    return {
        "timelineExactAndUnchanged": True,
        "frozenAuthorities": frozen,
        "allAcceptedAuthorityGatesTrue": True,
        "precedingPeripheryAuthorityGatesTrue": True,
        "fixedCableAuthoritySha256": fixed_before,
        "sampledCurrentStateFrames": expected_state_frames,
        "sampledCurrentStateHashesSha256": current_before,
        "structuralClaimPaths": structural_claim_paths,
        "exactTwoMaterialDelta": expected_materials,
        "sourceCorridorAxisAudit": live_source_corridor,
        "cableStageCanonicalSha256": canonical_hash(cable_stage),
    }


def verify_accepted_r1(root: Path) -> dict[str, Any]:
    if root.name != ACCEPTED_R1_ROOT_ID or not root.is_dir():
        raise RuntimeError("accepted R1 desktop raw authority root is missing or misidentified")
    manifest_path = root / ACCEPTED_R1_MANIFEST
    if not manifest_path.is_file():
        raise RuntimeError("accepted R1 desktop raw manifest is missing")
    manifest_payload = manifest_path.read_bytes()
    manifest_record = {
        "bytes": len(manifest_payload),
        "sha256": hashlib.sha256(manifest_payload).hexdigest(),
    }
    if manifest_record != ACCEPTED_R1_MANIFEST_RECORD:
        raise RuntimeError("accepted R1 desktop raw manifest byte authority mismatch")
    manifest = json.loads(manifest_payload.decode("utf-8"))
    if manifest.get("status") != "PASS" or manifest.get("family") != "desktop":
        raise RuntimeError("accepted R1 desktop raw manifest is not PASS desktop authority")
    derivative = manifest.get("sourceAuthorities", {}).get("derivative", {})
    if derivative.get("sha256") != cfg.ACCEPTED_R1_SHA256 or derivative.get("bytes") != cfg.ACCEPTED_R1_BYTES:
        raise RuntimeError("accepted R1 raw manifest binds the wrong derivative")
    records_by_frame = {int(item["frame"]): item for item in manifest.get("files", []) if "frame" in item}
    selected = []
    for frame, expected in ACCEPTED_R1_FRAMES.items():
        item = records_by_frame.get(frame)
        if not isinstance(item, dict):
            raise RuntimeError(f"accepted R1 raw manifest lacks F{frame:03d}")
        required = {
            "path": f"F{frame:03d}.png",
            "frame": frame,
            "family": "desktop",
            "width": 1440,
            "height": 900,
            **expected,
        }
        if any(item.get(key) != value for key, value in required.items()):
            raise RuntimeError(f"accepted R1 raw manifest record differs at F{frame:03d}")
        actual_path = root / required["path"]
        if not actual_path.is_file() or file_record(actual_path) != expected or png_dimensions(actual_path) != (1440, 900):
            raise RuntimeError(f"accepted R1 raw PNG byte authority differs at F{frame:03d}")
        selected.append(required)
    return {
        "authorityId": ACCEPTED_R1_ROOT_ID,
        "absolutePathStored": False,
        "manifest": {"filename": ACCEPTED_R1_MANIFEST, **ACCEPTED_R1_MANIFEST_RECORD},
        "sourceDerivative": {"bytes": cfg.ACCEPTED_R1_BYTES, "sha256": cfg.ACCEPTED_R1_SHA256},
        "selectedFrames": selected,
        "rawFramesCopiedIntoDiagnostic": False,
    }


def verify_authority(accepted_root: Path) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    if tuple(bpy.app.version) != (5, 2, 0):
        raise RuntimeError(f"cable diagnostic requires exact Blender 5.2.0, got {bpy.app.version_string}")
    opened = Path(bpy.data.filepath).resolve()
    if opened != cfg.DERIVATIVE.resolve():
        raise RuntimeError("cable diagnostic requires the exact isolated R1.1 derivative")
    build_payload = cfg.BUILD_REPORT.read_bytes()
    build_record = {
        "bytes": len(build_payload),
        "sha256": hashlib.sha256(build_payload).hexdigest(),
    }
    build = json.loads(build_payload.decode("utf-8"))
    if (
        build.get("schema") != "quantum-hub.phase-4-r1-1.targeted-repair.source-build.v1"
        or build.get("status") != "PASS"
        or build.get("throughStage") != "cable"
        or build.get("blender", {}).get("versionTuple") != [5, 2, 0]
    ):
        raise RuntimeError("cumulative through-cable source-build authority is absent or stale")
    source_record = file_record(opened)
    expected_derivative = {
        "path": cfg.DERIVATIVE.relative_to(cfg.REPO_ROOT).as_posix(),
        **source_record,
    }
    if build.get("derivative") != expected_derivative:
        raise RuntimeError("opened derivative differs from through-cable source-build authority")
    accepted_source = {
        "path": cfg.ACCEPTED_R1_SOURCE.relative_to(cfg.REPO_ROOT).as_posix(),
        "bytes": cfg.ACCEPTED_R1_BYTES,
        "sha256": cfg.ACCEPTED_R1_SHA256,
    }
    if build.get("acceptedR1Source") != accepted_source or file_record(cfg.ACCEPTED_R1_SOURCE) != {
        "bytes": cfg.ACCEPTED_R1_BYTES,
        "sha256": cfg.ACCEPTED_R1_SHA256,
    }:
        raise RuntimeError("source-build does not bind the exact refined accepted R1 source authority")
    producer_actual: dict[str, Any] = {}
    for key in ("builder", "config"):
        authority = build.get("producerAuthorities", {}).get(key)
        if not isinstance(authority, dict) or not isinstance(authority.get("path"), str):
            raise RuntimeError(f"source-build lacks {key} producer authority")
        producer_path = (cfg.REPO_ROOT / authority["path"]).resolve()
        actual = safe_repo_record(producer_path)
        if actual != authority:
            raise RuntimeError(f"source-build {key} producer authority is stale")
        producer_actual[key] = actual
    if build.get("authorization") != cfg.AUTHORIZATION or any(bool(value) for value in cfg.AUTHORIZATION.values()):
        raise RuntimeError("source-build authorization boundary is not exact and fully denied")
    structural = source_build_structural_checks(build)
    accepted = verify_accepted_r1(accepted_root.resolve())
    return build, source_record, producer_actual, {
        "structural": structural,
        "acceptedR1": accepted,
        "sourceBuildRecord": build_record,
    }


def compositor_tree(scene: bpy.types.Scene):
    """Return the exact Blender 5.2 compositor group without creating one."""
    if not hasattr(scene, "compositing_node_group"):
        raise RuntimeError("Blender 5.2 scene lacks compositing_node_group")
    return scene.compositing_node_group


def compositor_node_rows(scene: bpy.types.Scene) -> list[tuple[str, Any]]:
    root = compositor_tree(scene)
    if root is None:
        return []
    rows: list[tuple[str, Any]] = []
    visited: set[int] = set()

    def visit(tree: Any, prefix: str) -> None:
        pointer = int(tree.as_pointer())
        if pointer in visited:
            return
        visited.add(pointer)
        for node in sorted(tree.nodes, key=lambda item: item.name):
            path = f"{prefix}/{node.name}"
            rows.append((path, node))
            child = getattr(node, "node_tree", None)
            if child is not None and getattr(child, "bl_idname", None) == "CompositorNodeTree":
                visit(child, path)

    visit(root, root.name)
    return rows


def serializable_socket_default(socket: Any) -> dict[str, Any]:
    if not hasattr(socket, "default_value"):
        return {"stored": False}
    value = socket.default_value
    if value is None or isinstance(value, (bool, int, float, str)):
        return {"stored": True, "value": value}
    try:
        sequence = list(value)
    except (TypeError, ValueError):
        return {"stored": False, "valueType": type(value).__name__}
    if all(item is None or isinstance(item, (bool, int, float, str)) for item in sequence):
        return {"stored": True, "value": sequence}
    return {"stored": False, "valueType": type(value).__name__}


def bloom_inventory(scene: bpy.types.Scene) -> dict[str, Any]:
    glare = []
    compositing_enabled = bool(scene.render.use_compositing)
    tree = compositor_tree(scene)
    for path, node in compositor_node_rows(scene):
        if node.bl_idname == "CompositorNodeGlare" or getattr(node, "type", "") == "GLARE":
            glare.append({
                "path": path,
                "name": node.name,
                "mute": bool(node.mute),
                "effective": compositing_enabled and not bool(node.mute),
                "inputs": {
                    socket.name: serializable_socket_default(socket)
                    for socket in node.inputs
                },
            })
    engine_controls = []
    for owner_name, owner in (("scene", scene), ("scene.eevee", getattr(scene, "eevee", None))):
        if owner is not None and hasattr(owner, "use_bloom"):
            engine_controls.append({"owner": owner_name, "property": "use_bloom", "value": bool(getattr(owner, "use_bloom"))})
    active = [item["path"] for item in glare if item["effective"]]
    active.extend(f"{item['owner']}.{item['property']}" for item in engine_controls if item["value"])
    return {
        "renderUseCompositing": compositing_enabled,
        "compositingNodeGroup": None if tree is None else tree.name,
        "compositorGlareNodes": glare,
        "engineControls": engine_controls,
        "activeControlCount": len(active),
        "activeControls": active,
    }


def scene_state(scene: bpy.types.Scene) -> dict[str, Any]:
    world = scene.world
    world_backgrounds = {}
    if world is not None and world.use_nodes and world.node_tree is not None:
        for node in world.node_tree.nodes:
            if node.bl_idname == "ShaderNodeBackground":
                world_backgrounds[node.name] = {
                    "color": [float(value) for value in node.inputs["Color"].default_value],
                    "strength": float(node.inputs["Strength"].default_value),
                }
    return {
        "camera": None if scene.camera is None else scene.camera.name,
        "frame": {
            "frame": int(scene.frame_current),
            "subframe": float(scene.frame_subframe),
        },
        "render": {
            "filepath": scene.render.filepath,
            "engine": scene.render.engine,
            "resolution": [scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage],
            "pixelAspect": [float(scene.render.pixel_aspect_x), float(scene.render.pixel_aspect_y)],
            "filmTransparent": bool(scene.render.film_transparent),
            "useFileExtension": bool(scene.render.use_file_extension),
            "useMotionBlur": bool(scene.render.use_motion_blur),
            "image": {
                "fileFormat": scene.render.image_settings.file_format,
                "colorMode": scene.render.image_settings.color_mode,
                "colorDepth": scene.render.image_settings.color_depth,
                "compression": int(scene.render.image_settings.compression),
            },
        },
        "view": {
            "transform": scene.view_settings.view_transform,
            "look": scene.view_settings.look,
            "exposure": float(scene.view_settings.exposure),
        },
        "objects": {obj.name: bool(obj.hide_render) for obj in bpy.data.objects},
        "collections": {collection.name: bool(collection.hide_render) for collection in bpy.data.collections},
        "world": {
            "name": None if world is None else world.name,
            "color": None if world is None else [float(value) for value in world.color],
            "backgrounds": world_backgrounds,
        },
        "compositor": {
            "renderUseCompositing": bool(scene.render.use_compositing),
            "nodeGroup": None if compositor_tree(scene) is None else compositor_tree(scene).name,
            "nodeMutes": {path: bool(node.mute) for path, node in compositor_node_rows(scene)},
        },
        "bloom": bloom_inventory(scene),
    }


def restore_scene_state(scene: bpy.types.Scene, state: dict[str, Any]) -> None:
    scene.camera = None if state["camera"] is None else bpy.data.objects[state["camera"]]
    scene.frame_set(state["frame"]["frame"], subframe=state["frame"]["subframe"])
    render = state["render"]
    scene.render.filepath = render["filepath"]
    scene.render.engine = render["engine"]
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = render["resolution"]
    scene.render.pixel_aspect_x, scene.render.pixel_aspect_y = render["pixelAspect"]
    scene.render.film_transparent = render["filmTransparent"]
    scene.render.use_file_extension = render["useFileExtension"]
    scene.render.use_motion_blur = render["useMotionBlur"]
    scene.render.image_settings.file_format = render["image"]["fileFormat"]
    scene.render.image_settings.color_mode = render["image"]["colorMode"]
    scene.render.image_settings.color_depth = render["image"]["colorDepth"]
    scene.render.image_settings.compression = render["image"]["compression"]
    scene.view_settings.view_transform = state["view"]["transform"]
    scene.view_settings.look = state["view"]["look"]
    scene.view_settings.exposure = state["view"]["exposure"]
    for name, hidden in state["objects"].items():
        if bpy.data.objects.get(name) is not None:
            bpy.data.objects[name].hide_render = hidden
    for name, hidden in state["collections"].items():
        if bpy.data.collections.get(name) is not None:
            bpy.data.collections[name].hide_render = hidden
    world_state = state["world"]
    world = None if world_state["name"] is None else bpy.data.worlds.get(world_state["name"])
    if world is not None:
        world.color = world_state["color"]
        if world.use_nodes and world.node_tree is not None:
            for name, values in world_state["backgrounds"].items():
                node = world.node_tree.nodes.get(name)
                if node is not None:
                    node.inputs["Color"].default_value = values["color"]
                    node.inputs["Strength"].default_value = values["strength"]
    scene.render.use_compositing = state["compositor"]["renderUseCompositing"]
    current_compositor_nodes = dict(compositor_node_rows(scene))
    for path, muted in state["compositor"]["nodeMutes"].items():
        node = current_compositor_nodes.get(path)
        if node is None:
            raise RuntimeError(f"compositor node disappeared during diagnostic restoration: {path}")
        node.mute = muted
    for control in state["bloom"]["engineControls"]:
        owner = scene if control["owner"] == "scene" else getattr(scene, "eevee", None)
        if owner is not None and hasattr(owner, control["property"]):
            setattr(owner, control["property"], control["value"])


def restore_visibility_and_world(scene: bpy.types.Scene, state: dict[str, Any]) -> None:
    for name, hidden in state["objects"].items():
        if bpy.data.objects.get(name) is not None:
            bpy.data.objects[name].hide_render = hidden
    for name, hidden in state["collections"].items():
        if bpy.data.collections.get(name) is not None:
            bpy.data.collections[name].hide_render = hidden
    world_state = state["world"]
    world = None if world_state["name"] is None else bpy.data.worlds.get(world_state["name"])
    if world is not None:
        world.color = world_state["color"]
        if world.use_nodes and world.node_tree is not None:
            for name, values in world_state["backgrounds"].items():
                node = world.node_tree.nodes.get(name)
                if node is not None:
                    node.inputs["Color"].default_value = values["color"]
                    node.inputs["Strength"].default_value = values["strength"]


def configure_render(width: int, height: int) -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = 1.0
    scene.render.pixel_aspect_y = 1.0
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 35
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.render.use_motion_blur = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 1.0


def configure_desktop_family() -> None:
    for name in (DESKTOP_COLLECTION, MOBILE_COLLECTION, LANDSCAPE_COLLECTION):
        if bpy.data.collections.get(name) is None:
            raise RuntimeError(f"missing accepted cable-family collection: {name}")
    bpy.data.collections[DESKTOP_COLLECTION].hide_render = False
    bpy.data.collections[MOBILE_COLLECTION].hide_render = True
    bpy.data.collections[LANDSCAPE_COLLECTION].hide_render = True


def set_world_black(scene: bpy.types.Scene) -> None:
    world = scene.world
    if world is None:
        return
    world.color = (0.0, 0.0, 0.0)
    if world.use_nodes and world.node_tree is not None:
        for node in world.node_tree.nodes:
            if node.bl_idname == "ShaderNodeBackground":
                node.inputs["Color"].default_value = (0.0, 0.0, 0.0, 1.0)
                node.inputs["Strength"].default_value = 0.0


def render_png(
    output: Path,
    relative_path: str,
    *,
    role: str,
    frame: int,
    width: int,
    height: int,
    source_sha256: str,
    bloom_state: str,
    analysis_only: bool = False,
    camera_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    target = output / relative_path
    if target.exists():
        raise RuntimeError(f"refusing to overwrite diagnostic PNG: {relative_path}")
    target.parent.mkdir(parents=True, exist_ok=True)
    pending = target.with_name(target.stem + ".pending.png")
    if pending.exists():
        raise RuntimeError(f"stale diagnostic PNG staging file: {pending.name}")
    scene = bpy.context.scene
    configure_render(width, height)
    scene.frame_set(frame)
    scene.render.filepath = str(pending)
    started = time.perf_counter()
    try:
        if bpy.ops.render.render(write_still=True) != {"FINISHED"}:
            raise RuntimeError(f"Blender render operator failed: {relative_path}")
        if not pending.is_file() or png_dimensions(pending) != (width, height):
            raise RuntimeError(f"diagnostic PNG dimension mismatch: {relative_path}")
        os.replace(pending, target)
    finally:
        pending.unlink(missing_ok=True)
    result = {
        "role": role,
        "path": relative_path,
        "mediaType": "image/png",
        "family": "desktop",
        "frame": frame,
        "conductionProgress": FRAME_PROGRESS.get(frame),
        "width": width,
        "height": height,
        "renderEngine": "BLENDER_EEVEE",
        "bloomState": bloom_state,
        "analysisOnly": analysis_only,
        "sourceSha256": source_sha256,
        "renderSeconds": round(time.perf_counter() - started, 6),
        **file_record(target),
    }
    if camera_metadata is not None:
        result["camera"] = camera_metadata
    return result


def current_objects() -> list[bpy.types.Object]:
    objects = sorted(
        (
            obj
            for obj in bpy.data.objects
            if obj.get("phase4r1v2_current_segment") is True
            and obj.get("phase4r1v2_family") == "desktop"
            and obj.name.startswith(CURRENT_PREFIX)
        ),
        key=lambda obj: int(obj.get("phase4r1v2_segment_index", -1)),
    )
    indices = [int(obj.get("phase4r1v2_segment_index", -1)) for obj in objects]
    if len(objects) != CURRENT_SEGMENT_COUNT or indices != list(range(CURRENT_SEGMENT_COUNT)):
        raise RuntimeError("desktop current segment inventory is not the exact contiguous 160-segment authority")
    return objects


def source_corridor_axis_audit() -> dict[str, Any]:
    spec = cfg.CABLE_MATERIAL_AUTHORITY["current"]
    axis = tuple(float(value) for value in spec["sourceCorridorAxisWorld"])
    if axis != (1.0, 0.0, 0.0):
        raise RuntimeError("diagnostic requires the exact fixed +X source-corridor axis")
    surface_reach_y = float(spec["sourceCorridorGateZeroY"]) + float(spec["sourceCorridorOverlayRadiusMeters"])
    minimum_required = float(spec["sourceCorridorMinimumAbsoluteTangentX"])
    families: dict[str, Any] = {}
    for family, family_spec in cfg.CABLE_FAMILY_AUTHORITY.items():
        collection = bpy.data.collections.get(family_spec["collection"])
        if collection is None:
            raise RuntimeError(f"missing accepted {family} cable collection during source-corridor audit")
        currents = sorted(
            (obj for obj in collection.objects if obj.name.startswith(family_spec["currentPrefix"])),
            key=lambda obj: int(obj.get("phase4r1v2_segment_index", -1)),
        )
        if len(currents) != family_spec["currentCount"]:
            raise RuntimeError(f"accepted {family} current inventory differs during source-corridor audit")
        edge_count = 0
        minimum_absolute_tangent_x = 1.0
        worst_edge: dict[str, Any] | None = None
        for obj in currents:
            for spline_index, spline in enumerate(obj.data.splines):
                if spline.type == "BEZIER":
                    points = [obj.matrix_world @ point.co for point in spline.bezier_points]
                else:
                    points = [obj.matrix_world @ Vector(point.co[:3]) for point in spline.points]
                for edge_index, (first, second) in enumerate(zip(points, points[1:])):
                    if min(float(first.y), float(second.y)) > surface_reach_y:
                        continue
                    delta = second - first
                    if delta.length <= 1e-9:
                        raise RuntimeError(f"zero-length {family} current edge enters the source-corridor gate")
                    edge_count += 1
                    absolute_tangent_x = abs(float(delta.normalized().x))
                    if absolute_tangent_x < minimum_absolute_tangent_x:
                        minimum_absolute_tangent_x = absolute_tangent_x
                        worst_edge = {
                            "object": obj.name,
                            "spline": spline_index,
                            "edge": edge_index,
                            "minimumEndpointY": round(min(float(first.y), float(second.y)), 8),
                            "maximumEndpointY": round(max(float(first.y), float(second.y)), 8),
                            "absoluteTangentX": round(absolute_tangent_x, 8),
                        }
        if edge_count == 0 or minimum_absolute_tangent_x < minimum_required:
            raise RuntimeError(
                f"{family} source-corridor current axis is unsafe: "
                f"edges={edge_count}, minimum |Tx|={minimum_absolute_tangent_x:.9f}"
            )
        families[family] = {
            "surfaceEligibleEdgeCount": edge_count,
            "minimumAbsoluteTangentX": round(minimum_absolute_tangent_x, 8),
            "worstEligibleEdge": worst_edge,
            "passesMinimum": True,
        }
    return {
        "axisWorld": list(axis),
        "gateFullY": float(spec["sourceCorridorGateFullY"]),
        "gateZeroY": float(spec["sourceCorridorGateZeroY"]),
        "overlayRadiusMeters": float(spec["sourceCorridorOverlayRadiusMeters"]),
        "surfaceEligibilityMaximumCenterlineY": round(surface_reach_y, 8),
        "minimumAbsoluteTangentXRequired": minimum_required,
        "families": families,
        "allFamiliesPass": True,
    }


def progression_snapshot(objects: list[bpy.types.Object], frames: Iterable[int]) -> dict[str, Any]:
    scene = bpy.context.scene
    records = {}
    prior_count = -1
    for frame in frames:
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        active = [
            int(obj.get("phase4r1v2_segment_index"))
            for obj in objects
            if float(obj.color[3]) > 1e-6
        ]
        contiguous = active == list(range(len(active)))
        nondecreasing = len(active) >= prior_count
        records[f"F{frame:03d}"] = {
            "activeSegmentCount": len(active),
            "firstActiveSegment": None if not active else active[0],
            "lastActiveSegment": None if not active else active[-1],
            "activeIndicesFormOneContiguousPrefix": contiguous,
            "activeCountNondecreasing": nondecreasing,
            "maximumEvaluatedAlpha": round(max((float(obj.color[3]) for obj in objects), default=0.0), 8),
        }
        if not contiguous or not nondecreasing:
            raise RuntimeError(f"current progression is not one nondecreasing contiguous interval at F{frame:03d}")
        prior_count = len(active)
    if records["F001"]["activeSegmentCount"] != 0 or records["F285"]["activeSegmentCount"] != CURRENT_SEGMENT_COUNT:
        raise RuntimeError("current evaluated progression does not preserve dormant start and complete arrival")
    return {
        "status": "PASS",
        "method": "evaluated Object Info alpha schedule across the exact indexed desktop current objects",
        "segmentCount": len(objects),
        "frames": records,
        "oneNondecreasingContiguousPrefixAtEveryFrame": True,
    }


def curve_world_points(obj: bpy.types.Object) -> list[Vector]:
    if obj.type != "CURVE":
        raise RuntimeError(f"expected curve authority for {obj.name}")
    points: list[Vector] = []
    for spline in obj.data.splines:
        if spline.type == "BEZIER":
            points.extend(obj.matrix_world @ point.co for point in spline.bezier_points)
        else:
            points.extend(obj.matrix_world @ Vector(point.co[:3]) for point in spline.points)
    if len(points) < 3:
        raise RuntimeError(f"insufficient deterministic route points for {obj.name}")
    return points


def route_sample(points: list[Vector], fraction: float) -> tuple[Vector, Vector]:
    cumulative = [0.0]
    for first, second in zip(points, points[1:]):
        cumulative.append(cumulative[-1] + (second - first).length)
    total = cumulative[-1]
    if total <= 1e-9:
        raise RuntimeError("desktop cable route has zero length")
    target = max(0.0, min(1.0, fraction)) * total
    for index in range(len(points) - 1):
        if target <= cumulative[index + 1] or index == len(points) - 2:
            span = cumulative[index + 1] - cumulative[index]
            factor = 0.0 if span <= 1e-12 else (target - cumulative[index]) / span
            tangent = points[index + 1] - points[index]
            if tangent.length <= 1e-9:
                continue
            return points[index].lerp(points[index + 1], factor), tangent.normalized()
    raise RuntimeError("unable to sample deterministic desktop cable route")


def add_orthographic_camera(
    name: str,
    point: Vector,
    tangent: Vector,
    elevation_degrees: float,
    ortho_scale: float,
) -> tuple[bpy.types.Object, dict[str, Any]]:
    if bpy.data.objects.get(name) is not None or bpy.data.cameras.get(name + "_Data") is not None:
        raise RuntimeError(f"temporary diagnostic camera already exists: {name}")
    vertical = Vector((0.0, 0.0, 1.0))
    horizontal_tangent = Vector((tangent.x, tangent.y, 0.0))
    if horizontal_tangent.length <= 1e-9:
        raise RuntimeError(f"macro route tangent is vertical: {name}")
    right = horizontal_tangent.normalized()
    side = vertical.cross(right).normalized()
    elevation = math.radians(elevation_degrees)
    view_direction = (-side * math.cos(elevation) - vertical * math.sin(elevation)).normalized()
    local_z = -view_direction
    local_x = right.cross(local_z).normalized()
    rotation = Matrix((local_x, right, local_z)).transposed()
    data: bpy.types.Camera | None = None
    camera: bpy.types.Object | None = None
    try:
        data = bpy.data.cameras.new(name + "_Data")
        data.type = "ORTHO"
        data.sensor_fit = "VERTICAL"
        data.ortho_scale = ortho_scale
        data.clip_start = 0.01
        data.clip_end = 100.0
        camera = bpy.data.objects.new(name, data)
        camera.location = point - view_direction * 1.0
        camera.rotation_euler = rotation.to_euler()
        bpy.context.scene.collection.objects.link(camera)
        nominal_pixels = CABLE_DIAMETER_METERS / ortho_scale * 600.0
        if nominal_pixels < 48.0:
            raise RuntimeError(f"macro camera does not meet the 48-pixel cable-diameter contract: {name}")
        return camera, {
            "name": name,
            "type": "ORTHO",
            "location": [round(float(value), 8) for value in camera.location],
            "target": [round(float(value), 8) for value in point],
            "routeTangent": [round(float(value), 8) for value in right],
            "elevationDegrees": elevation_degrees,
            "orthoScaleMeters": ortho_scale,
            "nominalCableDiameterPixels": round(nominal_pixels, 4),
            "routeTangentAlignedToImageY": True,
            "imageXIsCableCrossSectionAxis": True,
        }
    except BaseException:
        if camera is not None and bpy.data.objects.get(camera.name) is not None:
            bpy.data.objects.remove(camera, do_unlink=True)
        if data is not None and bpy.data.cameras.get(data.name) is not None:
            bpy.data.cameras.remove(data)
        raise


def evaluated_current_vertices(objects: list[bpy.types.Object]) -> list[Vector]:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    vertices: list[Vector] = []
    for obj in objects:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            vertices.extend(evaluated.matrix_world @ vertex.co for vertex in mesh.vertices)
        finally:
            evaluated.to_mesh_clear()
    if not vertices:
        raise RuntimeError("no evaluated current vertices for isolation camera")
    return vertices


def add_isolation_camera(objects: list[bpy.types.Object]) -> tuple[bpy.types.Object, dict[str, Any]]:
    scene = bpy.context.scene
    scene.frame_set(285)
    bpy.context.view_layer.update()
    vertices = evaluated_current_vertices(objects)
    minimum_x, maximum_x = min(point.x for point in vertices), max(point.x for point in vertices)
    minimum_y, maximum_y = min(point.y for point in vertices), max(point.y for point in vertices)
    minimum_z, maximum_z = min(point.z for point in vertices), max(point.z for point in vertices)
    extent_x = max(0.1, maximum_x - minimum_x)
    extent_y = max(0.1, maximum_y - minimum_y)
    aspect = 1440 / 900
    ortho_scale = max(extent_y, extent_x / aspect) / 0.90
    name = "Phase4R11_CableDiagnosticIsolation_TEMP"
    if bpy.data.objects.get(name) is not None or bpy.data.cameras.get(name + "_Data") is not None:
        raise RuntimeError("temporary isolation camera already exists")
    data: bpy.types.Camera | None = None
    camera: bpy.types.Object | None = None
    try:
        data = bpy.data.cameras.new(name + "_Data")
        data.type = "ORTHO"
        data.sensor_fit = "VERTICAL"
        data.ortho_scale = ortho_scale
        data.clip_start = 0.01
        data.clip_end = 100.0
        camera = bpy.data.objects.new(name, data)
        camera.location = ((minimum_x + maximum_x) * 0.5, (minimum_y + maximum_y) * 0.5, maximum_z + 30.0)
        camera.rotation_euler = (0.0, 0.0, 0.0)
        scene.collection.objects.link(camera)
        return camera, {
            "name": name,
            "type": "ORTHO",
            "sensorFit": "VERTICAL",
            "orthoScaleMeters": round(ortho_scale, 8),
            "fitInsetFraction": 0.05,
            "evaluatedGeometryBoundsWorldMeters": {
                "x": [round(minimum_x, 8), round(maximum_x, 8)],
                "y": [round(minimum_y, 8), round(maximum_y, 8)],
                "z": [round(minimum_z, 8), round(maximum_z, 8)],
            },
        }
    except BaseException:
        if camera is not None and bpy.data.objects.get(camera.name) is not None:
            bpy.data.objects.remove(camera, do_unlink=True)
        if data is not None and bpy.data.cameras.get(data.name) is not None:
            bpy.data.cameras.remove(data)
        raise


def authored_current_graph_contract(material: bpy.types.Material) -> dict[str, Any]:
    tree = material.node_tree
    if tree is None:
        raise RuntimeError("authored current material has no node tree")
    expected_names = {
        "Phase4R11_Current_Output",
        "Phase4R11_Current_TransparentAhead",
        "Phase4R11_Current_BlackChannelHousing",
        "Phase4R11_Current_InternalEmission",
        "Phase4R11_Current_HousingPlusSignal",
        "Phase4R11_Current_AnimatedVisibility",
        "Phase4R11_Current_ExactAnimatedObjectInfo",
        "Phase4R11_Current_DeepWarmMagentaTint",
        "Phase4R11_Current_SurfaceAuthority",
        "Phase4R11_Current_ViewFacingDot",
        "Phase4R11_Current_ViewFacingAbsolute",
        "Phase4R11_Current_WorldPositionComponents",
        "Phase4R11_Current_SourceCorridorGate",
        "Phase4R11_Current_NormalizedIncoming",
        "Phase4R11_Current_IncomingComponents",
        "Phase4R11_Current_IncomingPerpendicularToSourceAxis",
        "Phase4R11_Current_SourceCorridorPerpendicularLength",
        "Phase4R11_Current_SourceCorridorSafeDenominator",
        "Phase4R11_Current_NormalizedSurfaceNormal",
        "Phase4R11_Current_SourceCorridorCrossSectionDot",
        "Phase4R11_Current_SourceCorridorCrossSectionAbsolute",
        "Phase4R11_Current_SourceCorridorNormalizedCosine",
        "Phase4R11_Current_SourceCorridorCosineClamp",
        "Phase4R11_Current_OutsideSourceCorridor",
        "Phase4R11_Current_RawViewFacingWeighted",
        "Phase4R11_Current_SourceCorridorWeighted",
        "Phase4R11_Current_CorrectedViewFacingAdd",
        "Phase4R11_Current_CorrectedViewFacingClamp",
        "Phase4R11_Current_OuterViewFacingWindow",
        "Phase4R11_Current_OuterAlphaVisibility",
        "Phase4R11_Current_FrontFacing",
        "Phase4R11_Current_FrontFacingVisibility",
        "Phase4R11_Current_InternalCoreViewFacingWindow",
        "Phase4R11_Current_RestrainedEmissionStrength",
    }
    actual_names = {node.name for node in tree.nodes}
    if actual_names != expected_names or len(tree.nodes) != 34 or len(tree.links) != 43:
        raise RuntimeError(
            f"authored current graph topology differs: nodes={len(tree.nodes)}, links={len(tree.links)}, "
            f"missing={sorted(expected_names - actual_names)}, extra={sorted(actual_names - expected_names)}"
        )
    forbidden_types = {"ShaderNodeTangent", "ShaderNodeTexCoord", "ShaderNodeAttribute"}
    if any(node.bl_idname in forbidden_types for node in tree.nodes):
        raise RuntimeError("authored current graph contains a forbidden tangent/coordinate/attribute basis")
    if any("Floor" in node.name or "MinimumResponse" in node.name for node in tree.nodes):
        raise RuntimeError("authored current graph contains a forbidden nonzero response floor")

    by_name = {node.name: node for node in tree.nodes}
    operation_contract = {
        "Phase4R11_Current_ViewFacingDot": "DOT_PRODUCT",
        "Phase4R11_Current_ViewFacingAbsolute": "ABSOLUTE",
        "Phase4R11_Current_NormalizedIncoming": "NORMALIZE",
        "Phase4R11_Current_SourceCorridorPerpendicularLength": "LENGTH",
        "Phase4R11_Current_SourceCorridorSafeDenominator": "MAXIMUM",
        "Phase4R11_Current_NormalizedSurfaceNormal": "NORMALIZE",
        "Phase4R11_Current_SourceCorridorCrossSectionDot": "DOT_PRODUCT",
        "Phase4R11_Current_SourceCorridorCrossSectionAbsolute": "ABSOLUTE",
        "Phase4R11_Current_SourceCorridorNormalizedCosine": "DIVIDE",
        "Phase4R11_Current_OutsideSourceCorridor": "SUBTRACT",
        "Phase4R11_Current_RawViewFacingWeighted": "MULTIPLY",
        "Phase4R11_Current_SourceCorridorWeighted": "MULTIPLY",
        "Phase4R11_Current_CorrectedViewFacingAdd": "ADD",
        "Phase4R11_Current_OuterAlphaVisibility": "MULTIPLY",
        "Phase4R11_Current_FrontFacing": "SUBTRACT",
        "Phase4R11_Current_FrontFacingVisibility": "MULTIPLY",
        "Phase4R11_Current_RestrainedEmissionStrength": "MULTIPLY",
    }
    if any(getattr(by_name[name], "operation", None) != operation for name, operation in operation_contract.items()):
        raise RuntimeError("authored current graph contains a wrong math/vector operation")
    spec = cfg.CABLE_MATERIAL_AUTHORITY["current"]
    gate = by_name["Phase4R11_Current_SourceCorridorGate"]
    outer = by_name["Phase4R11_Current_OuterViewFacingWindow"]
    core = by_name["Phase4R11_Current_InternalCoreViewFacingWindow"]
    for node, minimum, maximum, to_minimum, to_maximum in (
        (gate, spec["sourceCorridorGateFullY"], spec["sourceCorridorGateZeroY"], 1.0, 0.0),
        (outer, spec["outerViewFacingMinimum"], spec["outerViewFacingMaximum"], 0.0, 1.0),
        (core, spec["coreViewFacingMinimum"], spec["coreViewFacingMaximum"], 0.0, 1.0),
    ):
        if node.data_type != "FLOAT" or node.interpolation_type != "SMOOTHERSTEP" or not node.clamp:
            raise RuntimeError(f"authored current map-range mode differs: {node.name}")
        values = (
            float(enabled_node_input(node, "From Min").default_value),
            float(enabled_node_input(node, "From Max").default_value),
            float(enabled_node_input(node, "To Min").default_value),
            float(enabled_node_input(node, "To Max").default_value),
        )
        expected_values = (float(minimum), float(maximum), float(to_minimum), float(to_maximum))
        if not all(
            math.isclose(actual, expected, rel_tol=0.0, abs_tol=5e-7)
            for actual, expected in zip(values, expected_values)
        ):
            raise RuntimeError(f"authored current map-range values differ: {node.name} {values}")
    if float(by_name["Phase4R11_Current_IncomingPerpendicularToSourceAxis"].inputs["X"].default_value) != 0.0:
        raise RuntimeError("source-corridor fixed-X projection does not zero the exact incoming X component")
    if not math.isclose(
        float(by_name["Phase4R11_Current_SourceCorridorSafeDenominator"].inputs[1].default_value),
        float(spec["sourceCorridorCrossSectionDenominatorMinimum"]),
        rel_tol=0.0,
        abs_tol=5e-10,
    ):
        raise RuntimeError("source-corridor safe denominator differs from config")
    if not math.isclose(
        float(by_name["Phase4R11_Current_RestrainedEmissionStrength"].inputs[1].default_value),
        float(spec["emissionStrength"]),
        rel_tol=0.0,
        abs_tol=5e-7,
    ):
        raise RuntimeError("authored current emission strength differs from config")

    links = {(link.from_node.name, link.from_socket.name, link.to_node.name, link.to_socket.name) for link in tree.links}
    required_links = {
        ("Phase4R11_Current_SurfaceAuthority", "Position", "Phase4R11_Current_WorldPositionComponents", "Vector"),
        ("Phase4R11_Current_WorldPositionComponents", "Y", "Phase4R11_Current_SourceCorridorGate", "Value"),
        ("Phase4R11_Current_SurfaceAuthority", "Incoming", "Phase4R11_Current_NormalizedIncoming", "Vector"),
        ("Phase4R11_Current_IncomingComponents", "Y", "Phase4R11_Current_IncomingPerpendicularToSourceAxis", "Y"),
        ("Phase4R11_Current_IncomingComponents", "Z", "Phase4R11_Current_IncomingPerpendicularToSourceAxis", "Z"),
        ("Phase4R11_Current_CorrectedViewFacingClamp", "Result", "Phase4R11_Current_OuterViewFacingWindow", "Value"),
        ("Phase4R11_Current_CorrectedViewFacingClamp", "Result", "Phase4R11_Current_InternalCoreViewFacingWindow", "Value"),
        ("Phase4R11_Current_ExactAnimatedObjectInfo", "Alpha", "Phase4R11_Current_OuterAlphaVisibility", "Value"),
        ("Phase4R11_Current_SurfaceAuthority", "Backfacing", "Phase4R11_Current_FrontFacing", "Value"),
    }
    if not required_links.issubset(links):
        raise RuntimeError(f"authored current graph lacks critical corridor/alpha/front links: {sorted(required_links - links)}")
    return {
        "nodeCount": len(tree.nodes),
        "linkCount": len(tree.links),
        "nodeNamesSha256": canonical_hash(sorted(actual_names)),
        "linkEndpointsSha256": canonical_hash(sorted(links)),
        "forbiddenBasisNodeCount": 0,
        "nonzeroResponseFloorNodeCount": 0,
        "criticalLinksPresent": True,
    }


def current_signal_mask_authority() -> dict[str, Any]:
    expected = {
        "name": cfg.CABLE_CURRENT_MATERIAL,
        "channelHousingColor": "#030505",
        "channelHousingRoughness": 0.90,
        "objectColorTint": (0.82, 0.45, 0.76, 1.0),
        "emissionStrength": 0.78,
        "transmissionBasis": "SOURCE_CORRIDOR_FIXED_X_CROSS_SECTION_ELSE_ABS_DOT_GEOMETRY_NORMAL_INCOMING",
        "sourceCorridorAxisWorld": (1.0, 0.0, 0.0),
        "sourceCorridorGateFullY": -5.50,
        "sourceCorridorGateZeroY": -5.20,
        "sourceCorridorCrossSectionDenominatorMinimum": 0.0001,
        "sourceCorridorOverlayRadiusMeters": 0.0305,
        "sourceCorridorMinimumAbsoluteTangentX": 0.90,
        "outerViewFacingMinimum": 0.64,
        "outerViewFacingMaximum": 0.80,
        "coreViewFacingMinimum": 0.88,
        "coreViewFacingMaximum": 0.96,
        "frontFacingOnly": True,
        "useBackfaceCulling": True,
        "surfaceRenderMethod": "DITHERED",
    }
    spec = cfg.CABLE_MATERIAL_AUTHORITY.get("current")
    if not isinstance(spec, dict) or canonical_hash(spec) != canonical_hash(expected):
        raise RuntimeError("diagnostic current-mask authority does not match the exact revised no-floor front-facing config")
    material = bpy.data.materials.get(cfg.CABLE_CURRENT_MATERIAL)
    if material is None or not material.use_nodes or material.node_tree is None:
        raise RuntimeError("authored current material required for semantic mask isolation is missing")
    authored_graph = authored_current_graph_contract(material)
    authored_properties = {
        "transmissionBasis": material.get("phase4r1_1_transmission_basis"),
        "sourceCorridorAxisWorld": list(material.get("phase4r1_1_source_corridor_axis_world", [])),
        "sourceCorridorGateY": list(material.get("phase4r1_1_source_corridor_gate_y", [])),
        "sourceCorridorDenominatorMinimum": material.get("phase4r1_1_source_corridor_denominator_minimum"),
        "sourceCorridorOverlayRadiusMeters": material.get("phase4r1_1_source_corridor_overlay_radius_m"),
        "sourceCorridorMinimumAbsoluteTangentX": material.get("phase4r1_1_source_corridor_minimum_absolute_tangent_x"),
        "outerViewFacingWindow": list(material.get("phase4r1_1_outer_view_facing_window", [])),
        "coreViewFacingWindow": list(material.get("phase4r1_1_core_view_facing_window", [])),
        "frontFacingOnly": material.get("phase4r1_1_front_facing_only"),
        "useBackfaceCulling": material.get("phase4r1_1_use_backface_culling"),
        "materialUseBackfaceCulling": bool(material.use_backface_culling),
        "exactObjectAlphaProgression": material.get("phase4r1_1_exact_object_alpha_progression"),
    }
    expected_properties = {
        "transmissionBasis": spec["transmissionBasis"],
        "sourceCorridorAxisWorld": list(spec["sourceCorridorAxisWorld"]),
        "sourceCorridorGateY": [spec["sourceCorridorGateFullY"], spec["sourceCorridorGateZeroY"]],
        "sourceCorridorDenominatorMinimum": spec["sourceCorridorCrossSectionDenominatorMinimum"],
        "sourceCorridorOverlayRadiusMeters": spec["sourceCorridorOverlayRadiusMeters"],
        "sourceCorridorMinimumAbsoluteTangentX": spec["sourceCorridorMinimumAbsoluteTangentX"],
        "outerViewFacingWindow": [spec["outerViewFacingMinimum"], spec["outerViewFacingMaximum"]],
        "coreViewFacingWindow": [spec["coreViewFacingMinimum"], spec["coreViewFacingMaximum"]],
        "frontFacingOnly": spec["frontFacingOnly"],
        "useBackfaceCulling": spec["useBackfaceCulling"],
        "materialUseBackfaceCulling": spec["useBackfaceCulling"],
        "exactObjectAlphaProgression": True,
    }
    if authored_properties != expected_properties:
        raise RuntimeError("authored current material custom authority does not match the revised signal-mask formula")
    formula = {
        "rawViewFacing": "absolute dot product of Geometry.Normal and Geometry.Incoming",
        "sourceCorridorGate": "1 at world Position.Y <= -5.50, SMOOTHERSTEP transition to 0 through -5.20, and 0 at or above -5.20",
        "sourceCorridorViewFacing": "clamp(abs(dot(normalize(Geometry.Normal), (0, normalize(Geometry.Incoming).Y, normalize(Geometry.Incoming).Z))) / max(length((0, normalize(Geometry.Incoming).Y, normalize(Geometry.Incoming).Z)), 0.0001), 0, 1)",
        "correctedViewFacing": "clamp((1 - sourceCorridorGate) * rawViewFacing + sourceCorridorGate * sourceCorridorViewFacing, 0, 1)",
        "outer": "SMOOTHERSTEP clamp corrected view-facing cosine through configured outer transmission window; no response floor",
        "animatedFrontVisibility": "outer * ObjectInfo.Alpha * (1 - Geometry.Backfacing)",
        "core": "SMOOTHERSTEP clamp corrected view-facing cosine through configured internal-core window; no response floor",
        "emissionColor": "ObjectInfo.Color * configured objectColorTint",
        "emissionStrength": "core * configured emissionStrength",
        "surface": "Mix Transparent to emission-only signal by animatedFrontVisibility",
    }
    return {
        "configuredCurrentSpec": json.loads(json.dumps(spec)),
        "authoredMaterialProperties": authored_properties,
        "authoredMaterialGraph": authored_graph,
        "temporaryMaskFormula": formula,
        "formulaSha256": canonical_hash({"spec": spec, "formula": formula}),
        "sourceCorridorAxisAudit": source_corridor_axis_audit(),
        "housingExcludedFromSignalMask": True,
        "temporaryOnly": True,
    }


def enabled_node_input(node: bpy.types.Node, name: str):
    sockets = [socket for socket in node.inputs if socket.name == name and socket.enabled]
    if len(sockets) != 1:
        raise RuntimeError(f"expected one enabled {node.name}.{name} input, got {len(sockets)}")
    return sockets[0]


def configure_signal_map_range(node: bpy.types.Node, minimum: float, maximum: float) -> None:
    node.data_type = "FLOAT"
    node.interpolation_type = "SMOOTHERSTEP"
    node.clamp = True
    enabled_node_input(node, "From Min").default_value = minimum
    enabled_node_input(node, "From Max").default_value = maximum
    enabled_node_input(node, "To Min").default_value = 0.0
    enabled_node_input(node, "To Max").default_value = 1.0


def make_signal_mask_material() -> bpy.types.Material:
    spec = cfg.CABLE_MATERIAL_AUTHORITY["current"]
    name = "Phase4R11_CableDiagnosticSemanticSignalMask_TEMP"
    if bpy.data.materials.get(name) is not None:
        raise RuntimeError("temporary semantic cable signal-mask material already exists")
    material: bpy.types.Material | None = None
    try:
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        nodes.clear()

        output = nodes.new("ShaderNodeOutputMaterial")
        output.name = "DiagnosticSignal_Output"
        transparent = nodes.new("ShaderNodeBsdfTransparent")
        transparent.name = "DiagnosticSignal_Transparent"
        emission = nodes.new("ShaderNodeEmission")
        emission.name = "DiagnosticSignal_EmissionOnly"
        surface = nodes.new("ShaderNodeMixShader")
        surface.name = "DiagnosticSignal_ExactVisibility"
        info = nodes.new("ShaderNodeObjectInfo")
        info.name = "DiagnosticSignal_ExactObjectInfo"
        tint = nodes.new("ShaderNodeMixRGB")
        tint.name = "DiagnosticSignal_ExactObjectColorTint"
        tint.blend_type = "MULTIPLY"
        tint.inputs[0].default_value = 1.0
        tint.inputs[2].default_value = spec["objectColorTint"]
        geometry = nodes.new("ShaderNodeNewGeometry")
        geometry.name = "DiagnosticSignal_SurfaceAuthority"
        facing_dot = nodes.new("ShaderNodeVectorMath")
        facing_dot.name = "DiagnosticSignal_ViewFacingDot"
        facing_dot.operation = "DOT_PRODUCT"
        facing_absolute = nodes.new("ShaderNodeMath")
        facing_absolute.name = "DiagnosticSignal_ViewFacingAbsolute"
        facing_absolute.operation = "ABSOLUTE"

        position_components = nodes.new("ShaderNodeSeparateXYZ")
        position_components.name = "DiagnosticSignal_WorldPositionComponents"
        corridor_gate = nodes.new("ShaderNodeMapRange")
        corridor_gate.name = "DiagnosticSignal_SourceCorridorGate"
        corridor_gate.data_type = "FLOAT"
        corridor_gate.interpolation_type = "SMOOTHERSTEP"
        corridor_gate.clamp = True
        enabled_node_input(corridor_gate, "From Min").default_value = spec["sourceCorridorGateFullY"]
        enabled_node_input(corridor_gate, "From Max").default_value = spec["sourceCorridorGateZeroY"]
        enabled_node_input(corridor_gate, "To Min").default_value = 1.0
        enabled_node_input(corridor_gate, "To Max").default_value = 0.0
        incoming_normalized = nodes.new("ShaderNodeVectorMath")
        incoming_normalized.name = "DiagnosticSignal_NormalizedIncoming"
        incoming_normalized.operation = "NORMALIZE"
        incoming_components = nodes.new("ShaderNodeSeparateXYZ")
        incoming_components.name = "DiagnosticSignal_IncomingComponents"
        incoming_perpendicular = nodes.new("ShaderNodeCombineXYZ")
        incoming_perpendicular.name = "DiagnosticSignal_IncomingPerpendicularToSourceAxis"
        incoming_perpendicular.inputs["X"].default_value = 0.0
        incoming_perpendicular_length = nodes.new("ShaderNodeVectorMath")
        incoming_perpendicular_length.name = "DiagnosticSignal_SourceCorridorPerpendicularLength"
        incoming_perpendicular_length.operation = "LENGTH"
        corridor_denominator = nodes.new("ShaderNodeMath")
        corridor_denominator.name = "DiagnosticSignal_SourceCorridorSafeDenominator"
        corridor_denominator.operation = "MAXIMUM"
        corridor_denominator.inputs[1].default_value = spec["sourceCorridorCrossSectionDenominatorMinimum"]
        normal_normalized = nodes.new("ShaderNodeVectorMath")
        normal_normalized.name = "DiagnosticSignal_NormalizedSurfaceNormal"
        normal_normalized.operation = "NORMALIZE"
        corridor_dot = nodes.new("ShaderNodeVectorMath")
        corridor_dot.name = "DiagnosticSignal_SourceCorridorCrossSectionDot"
        corridor_dot.operation = "DOT_PRODUCT"
        corridor_absolute = nodes.new("ShaderNodeMath")
        corridor_absolute.name = "DiagnosticSignal_SourceCorridorCrossSectionAbsolute"
        corridor_absolute.operation = "ABSOLUTE"
        corridor_divide = nodes.new("ShaderNodeMath")
        corridor_divide.name = "DiagnosticSignal_SourceCorridorNormalizedCosine"
        corridor_divide.operation = "DIVIDE"
        corridor_clamp = nodes.new("ShaderNodeClamp")
        corridor_clamp.name = "DiagnosticSignal_SourceCorridorCosineClamp"
        corridor_clamp.clamp_type = "MINMAX"
        corridor_clamp.inputs["Min"].default_value = 0.0
        corridor_clamp.inputs["Max"].default_value = 1.0
        one_minus_corridor = nodes.new("ShaderNodeMath")
        one_minus_corridor.name = "DiagnosticSignal_OutsideSourceCorridor"
        one_minus_corridor.operation = "SUBTRACT"
        one_minus_corridor.inputs[0].default_value = 1.0
        raw_weighted = nodes.new("ShaderNodeMath")
        raw_weighted.name = "DiagnosticSignal_RawViewFacingWeighted"
        raw_weighted.operation = "MULTIPLY"
        corridor_weighted = nodes.new("ShaderNodeMath")
        corridor_weighted.name = "DiagnosticSignal_SourceCorridorWeighted"
        corridor_weighted.operation = "MULTIPLY"
        corrected_add = nodes.new("ShaderNodeMath")
        corrected_add.name = "DiagnosticSignal_CorrectedViewFacingAdd"
        corrected_add.operation = "ADD"
        corrected_clamp = nodes.new("ShaderNodeClamp")
        corrected_clamp.name = "DiagnosticSignal_CorrectedViewFacingClamp"
        corrected_clamp.clamp_type = "MINMAX"
        corrected_clamp.inputs["Min"].default_value = 0.0
        corrected_clamp.inputs["Max"].default_value = 1.0

        outer = nodes.new("ShaderNodeMapRange")
        outer.name = "DiagnosticSignal_OuterViewFacingWindow"
        configure_signal_map_range(outer, spec["outerViewFacingMinimum"], spec["outerViewFacingMaximum"])
        outer_alpha = nodes.new("ShaderNodeMath")
        outer_alpha.name = "DiagnosticSignal_OuterObjectAlpha"
        outer_alpha.operation = "MULTIPLY"
        front_facing = nodes.new("ShaderNodeMath")
        front_facing.name = "DiagnosticSignal_FrontFacing"
        front_facing.operation = "SUBTRACT"
        front_facing.inputs[0].default_value = 1.0
        final_visibility = nodes.new("ShaderNodeMath")
        final_visibility.name = "DiagnosticSignal_FinalVisibility"
        final_visibility.operation = "MULTIPLY"

        core = nodes.new("ShaderNodeMapRange")
        core.name = "DiagnosticSignal_CoreViewFacingWindow"
        configure_signal_map_range(core, spec["coreViewFacingMinimum"], spec["coreViewFacingMaximum"])
        strength = nodes.new("ShaderNodeMath")
        strength.name = "DiagnosticSignal_ExactEmissionStrength"
        strength.operation = "MULTIPLY"
        strength.inputs[1].default_value = spec["emissionStrength"]

        links.new(info.outputs["Color"], tint.inputs[1])
        links.new(tint.outputs["Color"], emission.inputs["Color"])
        links.new(geometry.outputs["Normal"], facing_dot.inputs[0])
        links.new(geometry.outputs["Incoming"], facing_dot.inputs[1])
        links.new(facing_dot.outputs["Value"], facing_absolute.inputs[0])
        links.new(geometry.outputs["Position"], position_components.inputs["Vector"])
        links.new(position_components.outputs["Y"], enabled_node_input(corridor_gate, "Value"))
        links.new(geometry.outputs["Incoming"], incoming_normalized.inputs[0])
        links.new(incoming_normalized.outputs["Vector"], incoming_components.inputs["Vector"])
        links.new(incoming_components.outputs["Y"], incoming_perpendicular.inputs["Y"])
        links.new(incoming_components.outputs["Z"], incoming_perpendicular.inputs["Z"])
        links.new(incoming_perpendicular.outputs["Vector"], incoming_perpendicular_length.inputs[0])
        links.new(incoming_perpendicular_length.outputs["Value"], corridor_denominator.inputs[0])
        links.new(geometry.outputs["Normal"], normal_normalized.inputs[0])
        links.new(normal_normalized.outputs["Vector"], corridor_dot.inputs[0])
        links.new(incoming_perpendicular.outputs["Vector"], corridor_dot.inputs[1])
        links.new(corridor_dot.outputs["Value"], corridor_absolute.inputs[0])
        links.new(corridor_absolute.outputs[0], corridor_divide.inputs[0])
        links.new(corridor_denominator.outputs[0], corridor_divide.inputs[1])
        links.new(corridor_divide.outputs[0], corridor_clamp.inputs["Value"])
        links.new(corridor_gate.outputs["Result"], one_minus_corridor.inputs[1])
        links.new(facing_absolute.outputs[0], raw_weighted.inputs[0])
        links.new(one_minus_corridor.outputs[0], raw_weighted.inputs[1])
        links.new(corridor_clamp.outputs["Result"], corridor_weighted.inputs[0])
        links.new(corridor_gate.outputs["Result"], corridor_weighted.inputs[1])
        links.new(raw_weighted.outputs[0], corrected_add.inputs[0])
        links.new(corridor_weighted.outputs[0], corrected_add.inputs[1])
        links.new(corrected_add.outputs[0], corrected_clamp.inputs["Value"])
        links.new(corrected_clamp.outputs["Result"], enabled_node_input(outer, "Value"))
        links.new(corrected_clamp.outputs["Result"], enabled_node_input(core, "Value"))
        links.new(outer.outputs["Result"], outer_alpha.inputs[0])
        links.new(info.outputs["Alpha"], outer_alpha.inputs[1])
        links.new(geometry.outputs["Backfacing"], front_facing.inputs[1])
        links.new(outer_alpha.outputs[0], final_visibility.inputs[0])
        links.new(front_facing.outputs[0], final_visibility.inputs[1])
        links.new(core.outputs["Result"], strength.inputs[0])
        links.new(strength.outputs[0], emission.inputs["Strength"])
        links.new(final_visibility.outputs[0], surface.inputs[0])
        links.new(transparent.outputs["BSDF"], surface.inputs[1])
        links.new(emission.outputs["Emission"], surface.inputs[2])
        links.new(surface.outputs[0], output.inputs["Surface"])

        if not hasattr(material, "surface_render_method"):
            raise RuntimeError("Blender 5.2 semantic signal mask lacks surface_render_method")
        material.surface_render_method = spec["surfaceRenderMethod"]
        material.use_backface_culling = spec["useBackfaceCulling"]
        material.diffuse_color = (0.0, 0.0, 0.0, 0.0)
        material["phase4r1_1_analysis_only"] = True
        material["phase4r1_1_formula_sha256"] = current_signal_mask_authority()["formulaSha256"]
        return material
    except BaseException:
        if material is not None and bpy.data.materials.get(material.name) is not None:
            bpy.data.materials.remove(material)
        raise


def make_mask_material() -> bpy.types.Material:
    name = "Phase4R11_CableDiagnosticWhiteMask_TEMP"
    if bpy.data.materials.get(name) is not None:
        raise RuntimeError("temporary cable mask material already exists")
    material: bpy.types.Material | None = None
    try:
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        nodes.clear()
        output = nodes.new("ShaderNodeOutputMaterial")
        emission = nodes.new("ShaderNodeEmission")
        emission.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
        emission.inputs["Strength"].default_value = 1.0
        links.new(emission.outputs["Emission"], output.inputs["Surface"])
        return material
    except BaseException:
        if material is not None and bpy.data.materials.get(material.name) is not None:
            bpy.data.materials.remove(material)
        raise


def material_slot_names(obj: bpy.types.Object) -> list[str | None]:
    if obj.data is None or not hasattr(obj.data, "materials"):
        raise RuntimeError(f"object has no material slots: {obj.name}")
    return [None if material is None else material.name for material in obj.data.materials]


def restore_material_slots(obj: bpy.types.Object, names: list[str | None]) -> None:
    materials = obj.data.materials
    materials.clear()
    for name in names:
        materials.append(None if name is None else bpy.data.materials[name])


def restore_material_inventory(inventory: dict[str, list[str | None]]) -> None:
    for object_name in sorted(inventory):
        obj = bpy.data.objects.get(object_name)
        if obj is None:
            raise RuntimeError(f"material-bound object disappeared during diagnostic: {object_name}")
        restore_material_slots(obj, inventory[object_name])
    stale = [
        object_name
        for object_name, names in inventory.items()
        if material_slot_names(bpy.data.objects[object_name]) != names
    ]
    if stale:
        raise RuntimeError(f"diagnostic failed to restore exact material slots: {sorted(stale)}")


def hide_everything_except(objects: Iterable[bpy.types.Object]) -> None:
    allowed = {obj.name for obj in objects}
    for obj in bpy.data.objects:
        obj.hide_render = obj.name not in allowed


def disable_bloom(scene: bpy.types.Scene) -> dict[str, Any]:
    before = bloom_inventory(scene)
    for _path, node in compositor_node_rows(scene):
        if node.bl_idname == "CompositorNodeGlare" or getattr(node, "type", "") == "GLARE":
            node.mute = True
    for owner in (scene, getattr(scene, "eevee", None)):
        if owner is not None and hasattr(owner, "use_bloom"):
            setattr(owner, "use_bloom", False)
    after = bloom_inventory(scene)
    if after["activeControlCount"] != 0:
        raise RuntimeError("bloom-disabled diagnostic still has an active glare or bloom control")
    mode = "authored-controls-disabled" if before["activeControlCount"] else "engine-native-no-bloom-control"
    return {
        "mode": mode,
        "inventedEffect": False,
        "before": before,
        "afterDisable": after,
    }


def data_counts() -> dict[str, int]:
    return {
        "objects": len(bpy.data.objects),
        "cameras": len(bpy.data.cameras),
        "actions": len(bpy.data.actions),
        "materials": len(bpy.data.materials),
    }


def remove_temporary_data(objects: list[bpy.types.Object], cameras: list[bpy.types.Camera], materials: list[bpy.types.Material]) -> None:
    for obj in reversed(objects):
        if bpy.data.objects.get(obj.name) is not None:
            bpy.data.objects.remove(obj, do_unlink=True)
    for camera in reversed(cameras):
        if bpy.data.cameras.get(camera.name) is not None:
            bpy.data.cameras.remove(camera)
    for material in reversed(materials):
        if bpy.data.materials.get(material.name) is not None:
            bpy.data.materials.remove(material)


def validate_ledger(output: Path, files: list[dict[str, Any]]) -> None:
    paths = [item["path"] for item in files]
    roles = [item["role"] for item in files]
    if len(paths) != len(set(paths)) or len(roles) != len(set(roles)):
        raise RuntimeError("diagnostic PNG ledger contains a duplicate path or role")
    actual = {path.relative_to(output).as_posix() for path in output.rglob("*.png")}
    expected = set(paths)
    if actual != expected:
        raise RuntimeError(f"diagnostic PNG ledger is not exhaustive: missing={sorted(expected - actual)}, unexpected={sorted(actual - expected)}")
    for item in files:
        path = output / item["path"]
        if file_record(path) != {key: item[key] for key in ("bytes", "sha256")} or png_dimensions(path) != (item["width"], item["height"]):
            raise RuntimeError(f"diagnostic PNG ledger record is stale: {item['path']}")


def public_error(error: BaseException, output: Path) -> str:
    value = str(error)
    replacements = (
        (str(cfg.REPO_ROOT.resolve()), "<repository>"),
        (str(output.resolve()), "<external-output>"),
        (str(Path(tempfile.gettempdir()).resolve()), "<temporary-root>"),
    )
    for private, public in replacements:
        value = value.replace(private, public)
    return value


def main() -> None:
    args = parse_args()
    output = external_fresh_root(args.output_root)
    diagnostic_record = safe_repo_record(Path(__file__).resolve())
    files: list[dict[str, Any]] = []
    scene = bpy.context.scene
    original_state: dict[str, Any] | None = None
    original_counts: dict[str, int] | None = None
    source_record: dict[str, Any] | None = None
    build: dict[str, Any] | None = None
    authority_evidence: dict[str, Any] | None = None
    producer_authorities: dict[str, Any] | None = None
    temporary_objects: list[bpy.types.Object] = []
    temporary_cameras: list[bpy.types.Camera] = []
    temporary_materials: list[bpy.types.Material] = []
    diagnostic_measurements: dict[str, Any] = {}
    sheath_materials: list[str | None] | None = None
    current_materials: dict[str, list[str | None]] | None = None
    sheath: bpy.types.Object | None = None
    restoration: dict[str, Any] | None = None
    report_path = output / REPORT_NAME
    try:
        build, source_record, producer_authorities, authority_evidence = verify_authority(Path(args.accepted_r1_root))
        original_state = scene_state(scene)
        original_counts = data_counts()
        state_hash_before = canonical_hash(original_state)
        current = current_objects()
        signal_mask_authority = current_signal_mask_authority()
        diagnostic_measurements["semanticSignalMaskAuthority"] = signal_mask_authority
        progression = progression_snapshot(current, FULL_FRAMES)
        sheath = bpy.data.objects.get(DESKTOP_SHEATH)
        if sheath is None:
            raise RuntimeError("desktop continuous graphite sheath authority is missing")
        route = curve_world_points(sheath)
        configure_desktop_family()
        scene.camera = bpy.data.objects.get(DESKTOP_CAMERA)
        if scene.camera is None or scene.camera.type != "CAMERA":
            raise RuntimeError("accepted desktop physical camera authority is missing")

        for frame in FULL_FRAMES:
            files.append(render_png(
                output,
                f"full/desktop/F{frame:03d}.png",
                role=f"cable-full-desktop-F{frame:03d}",
                frame=frame,
                width=1440,
                height=900,
                source_sha256=source_record["sha256"],
                bloom_state="authored",
            ))

        dormant_metrics = magenta_metrics(output / "full/desktop/F001.png")
        onset_metrics = magenta_metrics(output / "full/desktop/F046.png")
        diagnostic_measurements["onsetPixelChecks"] = {
            "F001": dormant_metrics,
            "F046": onset_metrics,
            "zeroMagentaAtF001AndF046": (
                dormant_metrics["magentaLikePixelCount"] == 0
                and onset_metrics["magentaLikePixelCount"] == 0
            ),
            "firstVisibleProbeRange": list(FIRST_VISIBLE_CANDIDATES),
            "firstVisibleProbeMetrics": {},
            "firstVisibleCurrentFrame": None,
        }
        if dormant_metrics["magentaLikePixelCount"] != 0 or onset_metrics["magentaLikePixelCount"] != 0:
            raise RuntimeError("F001 or exact F046 onset contains active magenta pixels")

        early_visibility = early_current_visibility_metrics(
            Path(args.accepted_r1_root).resolve() / "F106.png",
            output / "full/desktop/F106.png",
        )
        diagnostic_measurements["earlyCurrentNormalCamera"] = early_visibility
        if early_visibility["status"] != "PASS":
            raise RuntimeError("normal-exposure desktop F106 current is absent, misplaced, fragmented, or no longer bounded")

        probe_point, probe_tangent = route_sample(route, 0.005)
        probe_camera, probe_camera_record = add_orthographic_camera(
            "Phase4R11_CableDiagnosticFirstVisible_TEMP", probe_point, probe_tangent, 55.0, 0.60
        )
        temporary_objects.append(probe_camera)
        temporary_cameras.append(probe_camera.data)
        first_visible = None
        first_visible_metrics = None
        first_visible_probe_metrics: dict[str, Any] = {}
        restore_visibility_and_world(scene, original_state)
        configure_desktop_family()
        hide_everything_except((*current, probe_camera))
        set_world_black(scene)
        probe_bloom = disable_bloom(scene)
        scene.camera = probe_camera
        for frame in FIRST_VISIBLE_CANDIDATES:
            relative = f"analysis/first-visible-probe-F{frame:03d}.png"
            files.append(render_png(
                output,
                relative,
                role=f"cable-first-visible-probe-F{frame:03d}",
                frame=frame,
                width=960,
                height=600,
                source_sha256=source_record["sha256"],
                bloom_state=probe_bloom["mode"],
                analysis_only=True,
                camera_metadata=probe_camera_record,
            ))
            measured = magenta_metrics(output / relative)
            first_visible_probe_metrics[f"F{frame:03d}"] = measured
            if measured["magentaLikePixelCount"] > 0:
                first_visible = frame
                first_visible_metrics = measured
                break
        diagnostic_measurements["onsetPixelChecks"].update({
            "firstVisibleProbeMetrics": first_visible_probe_metrics,
            "firstVisibleCurrentFrame": first_visible,
            "firstVisibleCurrentMetrics": first_visible_metrics,
        })
        if first_visible is None:
            raise RuntimeError("no first visible current was detected in the bounded F047-F050 probe")

        restore_scene_state(scene, original_state)

        trail_point, trail_tangent = route_sample(route, 0.25)
        front_point, front_tangent = route_sample(route, 0.885)
        trail_camera, trail_camera_record = add_orthographic_camera(
            "Phase4R11_CableDiagnosticTrail_TEMP", trail_point, trail_tangent, 55.0, 0.45
        )
        temporary_objects.append(trail_camera)
        temporary_cameras.append(trail_camera.data)
        front_camera, front_camera_record = add_orthographic_camera(
            "Phase4R11_CableDiagnosticFront_TEMP", front_point, front_tangent, 18.0, 0.42
        )
        temporary_objects.append(front_camera)
        temporary_cameras.append(front_camera.data)

        configure_desktop_family()
        scene.camera = trail_camera
        files.append(render_png(
            output,
            "macro/trail-F166.png",
            role="cable-material-macro-trail-F166",
            frame=166,
            width=960,
            height=600,
            source_sha256=source_record["sha256"],
            bloom_state="authored",
            camera_metadata=trail_camera_record,
        ))
        scene.camera = front_camera
        files.append(render_png(
            output,
            "macro/front-F261.png",
            role="cable-material-macro-front-F261",
            frame=261,
            width=960,
            height=600,
            source_sha256=source_record["sha256"],
            bloom_state="authored",
            camera_metadata=front_camera_record,
        ))
        bloom_disabled = disable_bloom(scene)
        diagnostic_measurements["bloomDisabledProof"] = bloom_disabled
        files.append(render_png(
            output,
            "macro/front-F261-bloom-disabled.png",
            role="cable-material-macro-front-F261-bloom-disabled",
            frame=261,
            width=960,
            height=600,
            source_sha256=source_record["sha256"],
            bloom_state=bloom_disabled["mode"],
            camera_metadata=front_camera_record,
        ))
        restore_scene_state(scene, original_state)
        configure_desktop_family()

        mask_material = make_mask_material()
        temporary_materials.append(mask_material)
        sheath_materials = material_slot_names(sheath)
        sheath.data.materials.clear()
        sheath.data.materials.append(mask_material)
        analysis_bloom = disable_bloom(scene)
        for frame, camera, camera_record, label in (
            (166, trail_camera, trail_camera_record, "trail"),
            (261, front_camera, front_camera_record, "front"),
        ):
            restore_visibility_and_world(scene, original_state)
            configure_desktop_family()
            hide_everything_except((sheath, camera))
            set_world_black(scene)
            scene.camera = camera
            files.append(render_png(
                output,
                f"analysis/mask-sheath-{label}-F{frame:03d}.png",
                role=f"cable-analysis-sheath-mask-{label}-F{frame:03d}",
                frame=frame,
                width=960,
                height=600,
                source_sha256=source_record["sha256"],
                bloom_state=analysis_bloom["mode"],
                analysis_only=True,
                camera_metadata=camera_record,
            ))
        restore_material_slots(sheath, sheath_materials)
        sheath_materials = None

        signal_mask_material = make_signal_mask_material()
        temporary_materials.append(signal_mask_material)
        current_materials = {obj.name: material_slot_names(obj) for obj in current}
        for obj in current:
            obj.data.materials.clear()
            obj.data.materials.append(signal_mask_material)
        if any(material_slot_names(obj) != [signal_mask_material.name] for obj in current):
            raise RuntimeError("temporary semantic signal mask did not bind every desktop current object exactly once")
        for frame, camera, camera_record, label in (
            (166, trail_camera, trail_camera_record, "trail"),
            (261, front_camera, front_camera_record, "front"),
        ):
            restore_visibility_and_world(scene, original_state)
            configure_desktop_family()
            hide_everything_except((*current, camera))
            set_world_black(scene)
            scene.camera = camera
            files.append(render_png(
                output,
                f"analysis/mask-signal-{label}-F{frame:03d}.png",
                role=f"cable-analysis-signal-mask-{label}-F{frame:03d}",
                frame=frame,
                width=960,
                height=600,
                source_sha256=source_record["sha256"],
                bloom_state=analysis_bloom["mode"],
                analysis_only=True,
                camera_metadata=camera_record,
            ))
        restore_material_inventory(current_materials)
        restored_current_materials = {
            obj.name: material_slot_names(obj)
            for obj in current
        }
        diagnostic_measurements["semanticSignalMaskBindingRestoration"] = {
            "objectCount": len(current_materials),
            "beforeSha256": canonical_hash(current_materials),
            "afterSha256": canonical_hash(restored_current_materials),
            "passes": restored_current_materials == current_materials,
        }
        if not diagnostic_measurements["semanticSignalMaskBindingRestoration"]["passes"]:
            raise RuntimeError("temporary semantic signal mask did not restore exact current material bindings")
        current_materials = None

        isolation_camera, isolation_camera_record = add_isolation_camera(current)
        temporary_objects.append(isolation_camera)
        temporary_cameras.append(isolation_camera.data)
        restore_visibility_and_world(scene, original_state)
        configure_desktop_family()
        hide_everything_except((*current, isolation_camera))
        set_world_black(scene)
        scene.camera = isolation_camera
        isolation_paths: dict[int, Path] = {}
        for frame in ISOLATION_FRAMES:
            relative = f"analysis/current-isolation-F{frame:03d}.png"
            files.append(render_png(
                output,
                relative,
                role=f"cable-current-isolation-F{frame:03d}",
                frame=frame,
                width=1440,
                height=900,
                source_sha256=source_record["sha256"],
                bloom_state=analysis_bloom["mode"],
                analysis_only=True,
                camera_metadata=isolation_camera_record,
            ))
            isolation_paths[frame] = output / relative

        isolation_results = {f"F{frame:03d}": isolation_metrics(path) for frame, path in isolation_paths.items()}
        diagnostic_measurements["continuityIsolation"] = isolation_results
        if not all(item["status"] == "PASS" for item in isolation_results.values()):
            raise RuntimeError("one or more current-isolation continuity gates failed")
        macro_results = {
            "trailF166": macro_metrics(
                output / "macro/trail-F166.png",
                output / "analysis/mask-sheath-trail-F166.png",
                output / "analysis/mask-signal-trail-F166.png",
            ),
            "frontF261": macro_metrics(
                output / "macro/front-F261-bloom-disabled.png",
                output / "analysis/mask-sheath-front-F261.png",
                output / "analysis/mask-signal-front-F261.png",
            ),
        }
        diagnostic_measurements["physicalMacro"] = macro_results
        if not all(item["status"] == "PASS" for item in macro_results.values()):
            raise RuntimeError("one or more conservative physical cable macro gates failed")
        macro_regression = macro_baseline_regression(macro_results)
        diagnostic_measurements["physicalMacroBaselineRegression"] = macro_regression
        if macro_regression["status"] != "PASS":
            raise RuntimeError("source-corridor correction widened or displaced an accepted physical cable macro")

        restore_scene_state(scene, original_state)
        remove_temporary_data(temporary_objects, temporary_cameras, temporary_materials)
        temporary_objects.clear()
        temporary_cameras.clear()
        temporary_materials.clear()
        restored_state = scene_state(scene)
        final_counts = data_counts()
        state_hash_after = canonical_hash(restored_state)
        restoration = {
            "beforeStateSha256": state_hash_before,
            "afterStateSha256": state_hash_after,
            "beforeCounts": original_counts,
            "afterCounts": final_counts,
            "passes": restored_state == original_state and final_counts == original_counts,
        }
        if not restoration["passes"]:
            raise RuntimeError("cable diagnostic did not exactly restore scene state and temporary datablocks")
        if file_record(cfg.DERIVATIVE) != source_record:
            raise RuntimeError("cable diagnostic changed the derivative on disk")
        if file_record(cfg.BUILD_REPORT) != authority_evidence["sourceBuildRecord"]:
            raise RuntimeError("cable source-build report changed during diagnostic rendering")
        for key, authority in producer_authorities.items():
            producer_path = (cfg.REPO_ROOT / authority["path"]).resolve()
            if safe_repo_record(producer_path) != authority:
                raise RuntimeError(f"{key} producer changed during diagnostic rendering")
        if safe_repo_record(Path(__file__).resolve()) != diagnostic_record:
            raise RuntimeError("cable diagnostic producer changed during its own execution")
        if verify_accepted_r1(Path(args.accepted_r1_root).resolve()) != authority_evidence["acceptedR1"]:
            raise RuntimeError("accepted R1 comparison authority changed during diagnostic rendering")
        validate_ledger(output, files)

        report = {
            "schema": "quantum-hub.phase-4-r1-1.cable-material-diagnostic.v1",
            "status": "PASS",
            "throughStage": args.through,
            "blender": {"version": bpy.app.version_string, "versionTuple": list(bpy.app.version)},
            "source": {"path": cfg.DERIVATIVE.relative_to(cfg.REPO_ROOT).as_posix(), **source_record},
            "sourceBuild": {
                "path": cfg.BUILD_REPORT.relative_to(cfg.REPO_ROOT).as_posix(),
                **authority_evidence["sourceBuildRecord"],
            },
            "producerAuthorities": {
                **producer_authorities,
                "cableDiagnostic": diagnostic_record,
            },
            "acceptedR1ComparisonAuthority": authority_evidence["acceptedR1"],
            "sourceBuildStructuralChecks": authority_evidence["structural"],
            "evaluatedProgression": progression,
            "onsetPixelChecks": diagnostic_measurements["onsetPixelChecks"],
            "earlyCurrentNormalCamera": early_visibility,
            "bloomDisabledProof": bloom_disabled,
            "pixelGates": {
                "method": "native decoded PNG pixels; same-camera white sheath and temporary config-bound emission-only signal masks; exact world-position source-corridor fixed-X cross-sectional correction blended into the raw ABS(DOT(Geometry.Normal, Geometry.Incoming)) view-facing basis, unchanged outer/core windows, ObjectInfo color/alpha, and front-facing gate; no housing contribution, material-value proxy, or brightened beauty authority",
                "semanticSignalMaskAuthority": signal_mask_authority,
                "continuityIsolation": isolation_results,
                "physicalMacro": macro_results,
                "physicalMacroBaselineRegression": macro_regression,
                "allHardMachineGatesPass": True,
                "nativePhysicalCharacterArbitrationStillRequired": True,
            },
            "renderSettings": {
                "engine": "BLENDER_EEVEE",
                "fullResolution": [1440, 900],
                "macroResolution": [960, 600],
                "viewTransform": "AgX",
                "look": "AgX - Medium High Contrast",
                "exposureStops": 1.0,
                "motionBlur": False,
                "primaryViewsUseAcceptedDesktopCamera": True,
                "macroViewsUseNoHelperLightsOrExposureLift": True,
                "analysisMasksAreNotAestheticEvidence": True,
            },
            "boundedNextRenderRecommendation": {
                "authorizedNow": False,
                "engine": "CYCLES",
                "durationSeconds": [2, 4],
                "purpose": "human review of graphite sheath, contained moving front, softer trail, and local floor response after Eevee checkpoint acceptance",
                "complete540FrameFilmIncluded": False,
                "mustUseExternalResumableRange": True,
            },
            "files": files,
            "pngLedgerExhaustive": True,
            "restoration": restoration,
            "renderOperationSavedBlend": False,
            "externalOutputAbsolutePathStored": False,
            "authorization": cfg.AUTHORIZATION,
            "humanReviewGates": HUMAN_REVIEW_GATES,
            "humanAccepted": False,
            "reusedAcceptedR1ComparisonEvidence": True,
            "reusedRecoveredOldVisualEvidence": False,
        }
        atomic_json(report_path, report)
    except BaseException as error:
        cleanup_errors: list[str] = []
        try:
            if sheath is not None and sheath_materials is not None:
                restore_material_slots(sheath, sheath_materials)
                sheath_materials = None
        except BaseException as cleanup_error:
            cleanup_errors.append(f"sheath material restoration: {type(cleanup_error).__name__}: {cleanup_error}")
        try:
            if current_materials is not None:
                saved_current_materials = current_materials
                restore_material_inventory(current_materials)
                restored_current_materials = {
                    object_name: material_slot_names(bpy.data.objects[object_name])
                    for object_name in saved_current_materials
                }
                diagnostic_measurements["semanticSignalMaskBindingRestoration"] = {
                    "objectCount": len(saved_current_materials),
                    "beforeSha256": canonical_hash(saved_current_materials),
                    "afterSha256": canonical_hash(restored_current_materials),
                    "passes": restored_current_materials == saved_current_materials,
                }
                current_materials = None
        except BaseException as cleanup_error:
            cleanup_errors.append(f"current material restoration: {type(cleanup_error).__name__}: {cleanup_error}")
        try:
            if original_state is not None:
                restore_scene_state(scene, original_state)
        except BaseException as cleanup_error:
            cleanup_errors.append(f"scene restoration: {type(cleanup_error).__name__}: {cleanup_error}")
        try:
            remove_temporary_data(temporary_objects, temporary_cameras, temporary_materials)
        except BaseException as cleanup_error:
            cleanup_errors.append(f"temporary datablock removal: {type(cleanup_error).__name__}: {cleanup_error}")
        existing_pngs = []
        for path in sorted(output.rglob("*.png")):
            width, height = png_dimensions(path)
            existing_pngs.append({
                "path": path.relative_to(output).as_posix(),
                "width": width,
                "height": height,
                **file_record(path),
            })
        failure = {
            "schema": "quantum-hub.phase-4-r1-1.cable-material-diagnostic-failure.v1",
            "status": "FAIL",
            "throughStage": args.through,
            "errorType": type(error).__name__,
            "error": public_error(error, output),
            "cleanupErrors": [public_error(RuntimeError(value), output) for value in cleanup_errors],
            "completedPngInventory": existing_pngs,
            "completedRoleRecords": files,
            "diagnosticMeasurements": diagnostic_measurements,
            "source": None if source_record is None else {"path": cfg.DERIVATIVE.relative_to(cfg.REPO_ROOT).as_posix(), **source_record},
            "sourceBuild": None if authority_evidence is None else {
                "path": cfg.BUILD_REPORT.relative_to(cfg.REPO_ROOT).as_posix(),
                **authority_evidence["sourceBuildRecord"],
            },
            "externalOutputAbsolutePathStored": False,
            "authorization": cfg.AUTHORIZATION,
            "humanReviewGates": HUMAN_REVIEW_GATES,
            "humanAccepted": False,
        }
        try:
            atomic_json(output / FAILURE_NAME, failure)
        except BaseException:
            pass
        raise
    print("PHASE4R1_1_CABLE_DIAGNOSTIC_STATUS=PASS")
    print(f"PHASE4R1_1_CABLE_DIAGNOSTIC_REPORT={report_path}")


if __name__ == "__main__":
    main()
