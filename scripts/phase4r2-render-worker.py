"""Fail-closed Phase 4-R2 Cycles production worker.

Run only from Blender 5.2 against the exact human-accepted R1.1 source.  The
worker changes camera/family visibility, render settings, frame and output path
in memory.  It never saves the .blend.  Master frames, receipts and the live
ledger are external to Git and are written atomically.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import stat as stat_module
import struct
import sys
import time
from typing import Any
import zlib

import bpy


SCHEMA = "quantum-hub.phase-4-r2.production-render-ledger.v1"
RECEIPT_SCHEMA = "quantum-hub.phase-4-r2.production-frame-receipt.v1"
PREFLIGHT_SCHEMA = "quantum-hub.phase-4-r2.production-source-preflight.v1"
EXPECTED_SOURCE_SHA256 = "b0c9c7c1cf5a1642870cf03a36791cc50ec31ac207aeae794fbea83c856a79c0"
EXPECTED_SOURCE_BYTES = 3_600_194
EXPECTED_BLENDER = (5, 2, 0)
EXPECTED_Q_NAME = "Phase4R1V2_ExactQuantumQ_PreCRTEffect_2048"
EXPECTED_Q_SHA256 = "009c494df3b301470ab539f23e02b375f0c1fcec9b4b18cf07fc853b95fd03c5"
PHYSICAL_START = 1
PHYSICAL_END = 500
CONCEPTUAL_END = 540
FPS = 30

FAMILIES: dict[str, dict[str, Any]] = {
    "desktop": {
        "camera": "Phase4R1_Camera_Desktop",
        "cableCollection": "PHASE4R1V2_CABLE_DESKTOP",
        "resolution": [1920, 1200],
    },
    "portrait": {
        "camera": "Phase4R1_Camera_Mobile",
        "cableCollection": "PHASE4R1V2_CABLE_MOBILE",
        "resolution": [780, 1688],
    },
    "landscape": {
        "camera": "Phase4R1_Camera_Landscape",
        "cableCollection": "PHASE4R1V2_CABLE_LANDSCAPE",
        "resolution": [1688, 780],
    },
}
CABLE_COLLECTIONS = tuple(value["cableCollection"] for value in FAMILIES.values())


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def canonical_hash(value: Any) -> str:
    return sha256_bytes(json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8"))


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + f".tmp-{os.getpid()}")
    payload = json.dumps(value, indent=2, sort_keys=True, ensure_ascii=True) + "\n"
    with temporary.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def is_read_only(path: Path) -> bool:
    return bool(getattr(path.stat(), "st_file_attributes", 0) & stat_module.FILE_ATTRIBUTE_READONLY)


def parse_png(path: Path) -> dict[str, int]:
    """Validate the complete PNG stream, chunk CRCs, zlib payload and row shape."""
    header: dict[str, int] | None = None
    compressed = bytearray()
    saw_iend = False
    with path.open("rb") as handle:
        signature = handle.read(8)
        if signature != b"\x89PNG\r\n\x1a\n":
            raise RuntimeError(f"not a PNG: {path}")
        chunk_index = 0
        while not saw_iend:
            length_bytes = handle.read(4)
            if len(length_bytes) != 4:
                raise RuntimeError(f"truncated PNG chunk length: {path}")
            length = struct.unpack(">I", length_bytes)[0]
            chunk_type = handle.read(4)
            data = handle.read(length)
            crc_bytes = handle.read(4)
            if len(chunk_type) != 4 or len(data) != length or len(crc_bytes) != 4:
                raise RuntimeError(f"truncated PNG chunk: {path}")
            actual_crc = zlib.crc32(chunk_type)
            actual_crc = zlib.crc32(data, actual_crc) & 0xFFFFFFFF
            expected_crc = struct.unpack(">I", crc_bytes)[0]
            if actual_crc != expected_crc:
                raise RuntimeError(f"PNG CRC mismatch in {chunk_type!r}: {path}")
            if chunk_index == 0 and chunk_type != b"IHDR":
                raise RuntimeError(f"PNG IHDR is not first: {path}")
            if chunk_type == b"IHDR":
                if header is not None or length != 13:
                    raise RuntimeError(f"invalid PNG IHDR: {path}")
                width, height, bit_depth, color_type, compression, filtering, interlace = struct.unpack(
                    ">IIBBBBB", data
                )
                if compression != 0 or filtering != 0 or interlace != 0:
                    raise RuntimeError(f"unsupported PNG header: {path}")
                header = {
                    "width": width,
                    "height": height,
                    "bitDepth": bit_depth,
                    "colorType": color_type,
                    "interlaced": interlace,
                }
            elif chunk_type == b"IDAT":
                if header is None:
                    raise RuntimeError(f"PNG IDAT precedes IHDR: {path}")
                compressed.extend(data)
            elif chunk_type == b"IEND":
                if length != 0:
                    raise RuntimeError(f"invalid PNG IEND: {path}")
                saw_iend = True
            chunk_index += 1
        if handle.read(1) != b"":
            raise RuntimeError(f"PNG has trailing bytes: {path}")
    if header is None or not compressed or not saw_iend:
        raise RuntimeError(f"PNG is incomplete: {path}")
    channels = {0: 1, 2: 3, 4: 2, 6: 4}.get(header["colorType"])
    if channels is None:
        raise RuntimeError(f"unsupported PNG color type: {path}")
    try:
        inflater = zlib.decompressobj()
        decoded = inflater.decompress(bytes(compressed)) + inflater.flush()
    except zlib.error as error:
        raise RuntimeError(f"PNG zlib decode failed: {path}: {error}") from error
    if not inflater.eof or inflater.unused_data or inflater.unconsumed_tail:
        raise RuntimeError(f"PNG zlib stream is incomplete or has trailing data: {path}")
    row_bytes = (header["width"] * channels * header["bitDepth"] + 7) // 8
    expected_decoded = (row_bytes + 1) * header["height"]
    if len(decoded) != expected_decoded:
        raise RuntimeError(f"PNG decoded byte count mismatch: {path}")
    if any(decoded[row * (row_bytes + 1)] > 4 for row in range(header["height"])):
        raise RuntimeError(f"PNG row filter is invalid: {path}")
    return header


def source_authority() -> tuple[Path, dict[str, Any]]:
    path = Path(bpy.data.filepath).resolve()
    if not path.is_file():
        raise RuntimeError("Blender did not open a source file")
    size = path.stat().st_size
    digest = sha256_file(path)
    if size != EXPECTED_SOURCE_BYTES or digest != EXPECTED_SOURCE_SHA256:
        raise RuntimeError(f"frozen source mismatch: bytes={size} sha256={digest}")
    if not is_read_only(path):
        raise RuntimeError("frozen source must have the Windows read-only attribute")
    return path, {
        "repositoryRelativePath": "artifacts/original/phase-4r1-1-periphery-current-mobile-crt/source/quantum-signal-television-phase4r1-1-periphery-current-mobile-crt.blend",
        "bytes": size,
        "sha256": digest,
    }


def validate_backup(path: Path) -> dict[str, Any]:
    path = path.resolve()
    if not path.is_file():
        raise RuntimeError(f"immutable backup is missing: {path}")
    size = path.stat().st_size
    digest = sha256_file(path)
    if size != EXPECTED_SOURCE_BYTES or digest != EXPECTED_SOURCE_SHA256:
        raise RuntimeError(f"immutable backup mismatch: bytes={size} sha256={digest}")
    read_only = is_read_only(path)
    if not read_only:
        raise RuntimeError("immutable backup must have the Windows read-only attribute")
    return {
        "basename": path.name,
        "rootBasename": path.parent.name,
        "bytes": size,
        "sha256": digest,
        "readOnly": read_only,
    }


def validate_resources() -> dict[str, Any]:
    q_image = bpy.data.images.get(EXPECTED_Q_NAME)
    if q_image is None or len(q_image.packed_files) != 1 or q_image.packed_files[0].packed_file is None:
        raise RuntimeError("exact packed Q authority is missing")
    q_payload = bytes(q_image.packed_files[0].packed_file.data)
    q_hash = sha256_bytes(q_payload)
    if q_hash != EXPECTED_Q_SHA256:
        raise RuntimeError(f"packed Q hash mismatch: {q_hash}")

    missing_images: list[str] = []
    packed_images: list[str] = []
    for image in sorted(bpy.data.images, key=lambda item: item.name):
        if len(image.packed_files) > 0:
            packed_images.append(image.name)
            continue
        filepath = str(image.filepath or "")
        if not filepath or image.source not in {"FILE", "SEQUENCE", "MOVIE"}:
            continue
        if not Path(bpy.path.abspath(filepath)).exists():
            missing_images.append(image.name)

    missing_libraries: list[str] = []
    for library in sorted(bpy.data.libraries, key=lambda item: item.name):
        filepath = str(library.filepath or "")
        if filepath and not Path(bpy.path.abspath(filepath)).exists():
            missing_libraries.append(library.name)
    if missing_images or missing_libraries:
        raise RuntimeError(f"missing resources: images={missing_images} libraries={missing_libraries}")

    cameras: dict[str, Any] = {}
    for family, authority in FAMILIES.items():
        camera = bpy.data.objects.get(authority["camera"])
        collection = bpy.data.collections.get(authority["cableCollection"])
        if camera is None or camera.type != "CAMERA" or camera.data is None:
            raise RuntimeError(f"camera authority missing for {family}")
        if collection is None:
            raise RuntimeError(f"cable collection authority missing for {family}")
        cameras[family] = {
            "object": camera.name,
            "data": camera.data.name,
            "sensorFit": str(camera.data.sensor_fit),
            "cableCollection": collection.name,
        }

    if bpy.context.scene.frame_end < CONCEPTUAL_END or bpy.context.scene.render.fps != FPS:
        raise RuntimeError("accepted 540-frame/30-fps conceptual authority is missing")
    return {
        "exactQ": {
            "name": q_image.name,
            "packedBytes": len(q_payload),
            "packedSha256": q_hash,
            "packedFilepath": str(q_image.packed_files[0].filepath or "").replace("\\", "/"),
        },
        "packedImageCount": len(packed_images),
        "missingImages": missing_images,
        "libraryCount": len(bpy.data.libraries),
        "missingLibraries": missing_libraries,
        "cameras": cameras,
        "actions": {"count": len(bpy.data.actions), "names": sorted(action.name for action in bpy.data.actions)},
        "conceptualTimeline": {"start": 1, "end": 540, "fps": 30},
    }


def configure_device(scene: Any) -> dict[str, Any]:
    addon = bpy.context.preferences.addons.get("cycles")
    if addon is None:
        raise RuntimeError("Cycles preferences are unavailable")
    preferences = addon.preferences
    attempts: list[dict[str, Any]] = []
    for backend in ("OPTIX", "CUDA"):
        try:
            preferences.compute_device_type = backend
            preferences.get_devices()
            candidates = [device for device in preferences.devices if device.type == backend]
            attempts.append({"backend": backend, "deviceCount": len(candidates)})
            if candidates:
                for device in preferences.devices:
                    device.use = device.type == backend
                scene.cycles.device = "GPU"
                return {
                    "backend": backend,
                    "sceneDevice": "GPU",
                    "devices": [
                        {"name": device.name, "type": device.type, "use": bool(device.use)}
                        for device in preferences.devices
                    ],
                    "attempts": attempts,
                }
        except Exception as error:
            attempts.append({"backend": backend, "errorType": type(error).__name__})
    raise RuntimeError(f"Cycles GPU is unavailable: {attempts}")


def configure_family(family: str) -> tuple[dict[str, Any], dict[str, Any]]:
    authority = FAMILIES[family]
    scene = bpy.context.scene
    camera = bpy.data.objects[authority["camera"]]
    scene.camera = camera
    for name in CABLE_COLLECTIONS:
        bpy.data.collections[name].hide_render = name != authority["cableCollection"]

    width, height = authority["resolution"]
    scene.render.engine = "CYCLES"
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = 1.0
    scene.render.pixel_aspect_y = 1.0
    scene.render.film_transparent = False
    scene.render.use_border = False
    scene.render.use_crop_to_border = False
    scene.render.use_file_extension = False
    scene.render.use_motion_blur = True
    scene.render.use_persistent_data = True
    scene.render.fps = FPS
    scene.render.frame_map_old = 100
    scene.render.frame_map_new = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "16"
    scene.render.image_settings.compression = 30
    if hasattr(scene.render.image_settings, "color_management"):
        scene.render.image_settings.color_management = "FOLLOW_SCENE"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 1.0
    scene.cycles.samples = 192
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.018
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
    device = configure_device(scene)
    if device["sceneDevice"] != "GPU":
        raise RuntimeError("production Cycles render did not select a GPU")

    settings = {
        "engine": "CYCLES",
        "family": family,
        "camera": authority["camera"],
        "cableCollection": authority["cableCollection"],
        "resolution": [width, height],
        "fps": FPS,
        "physicalFrames": [PHYSICAL_START, PHYSICAL_END],
        "samples": 192,
        "adaptiveSampling": True,
        "adaptiveThreshold": 0.018,
        "denoising": True,
        "denoiser": "OPENIMAGEDENOISE",
        "motionBlur": True,
        "persistentData": True,
        "viewTransform": "AgX",
        "look": "AgX - Medium High Contrast",
        "exposureStops": 1.0,
        "filmTransparent": False,
        "borderRender": False,
        "cropToBorder": False,
        "png": {"colorMode": "RGB", "colorDepth": 16, "compression": 30},
        "device": device,
    }
    stable_settings = {**settings, "device": {"backend": device["backend"], "sceneDevice": "GPU"}}
    if (
        scene.render.engine != "CYCLES"
        or scene.camera != camera
        or scene.render.resolution_x != width
        or scene.render.resolution_y != height
        or scene.cycles.samples != 192
        or not scene.cycles.use_adaptive_sampling
        or abs(float(scene.cycles.adaptive_threshold) - 0.018) > 1e-9
        or not scene.cycles.use_denoising
        or scene.cycles.denoiser != "OPENIMAGEDENOISE"
        or scene.view_settings.view_transform != "AgX"
        or scene.view_settings.look != "AgX - Medium High Contrast"
        or abs(float(scene.view_settings.exposure) - 1.0) > 1e-9
        or scene.render.image_settings.file_format != "PNG"
        or scene.render.image_settings.color_mode != "RGB"
        or scene.render.image_settings.color_depth != "16"
        or scene.render.use_border
        or scene.render.use_crop_to_border
    ):
        raise RuntimeError(f"production settings failed live verification for {family}")
    return settings, {"value": stable_settings, "sha256": canonical_hash(stable_settings)}


def new_ledger(source: dict[str, Any], backup: dict[str, Any]) -> dict[str, Any]:
    families: dict[str, Any] = {}
    for family, authority in FAMILIES.items():
        families[family] = {
            "camera": authority["camera"],
            "cableCollection": authority["cableCollection"],
            "resolution": authority["resolution"],
            "expectedFrames": 500,
            "validFrames": 0,
            "missingFrames": list(range(1, 501)),
            "corruptFrames": [],
            "activeChunk": None,
            "completedChunks": [],
            "cumulativeRenderSeconds": 0.0,
            "settingsSha256": None,
            "frames": {},
        }
    return {
        "schema": SCHEMA,
        "createdAt": utc_now(),
        "updatedAt": utc_now(),
        "status": "PREPARED",
        "source": source,
        "immutableBackup": backup,
        "timeline": {
            "conceptualFrames": [1, 540],
            "physicalCyclesFrames": [1, 500],
            "digitalBlackEquivalent": [501, 513],
            "semanticEntryEquivalent": [514, 540],
            "fps": 30,
        },
        "families": families,
        "authorization": {
            "phase4r1HumanAccepted": True,
            "physicalCyclesProductionAuthorized": True,
            "finalRuntimeIntegrationAuthorized": True,
            "mergeMainAuthorized": False,
            "phase5Authorized": False,
        },
    }


def load_ledger(path: Path, source: dict[str, Any], backup: dict[str, Any]) -> dict[str, Any]:
    if path.exists():
        ledger = json.loads(path.read_text(encoding="utf-8"))
        if ledger.get("schema") != SCHEMA:
            raise RuntimeError("production ledger schema mismatch")
        if ledger.get("source", {}).get("sha256") != EXPECTED_SOURCE_SHA256:
            raise RuntimeError("production ledger source mismatch")
        if ledger.get("immutableBackup", {}).get("sha256") != EXPECTED_SOURCE_SHA256:
            raise RuntimeError("production ledger backup mismatch")
        return ledger
    ledger = new_ledger(source, backup)
    write_json_atomic(path, ledger)
    return ledger


def receipt_ledger_record(receipt: dict[str, Any], family: str, frame: int) -> dict[str, Any]:
    return {
        "bytes": receipt["file"]["bytes"],
        "sha256": receipt["file"]["sha256"],
        "renderSeconds": receipt["renderSeconds"],
        "settingsSha256": receipt["settingsSha256"],
        "receipt": f"masters/{family}/receipts/F{frame:03d}.json",
    }


def refresh_incremental_summary(family_state: dict[str, Any], completed_frame: int | None = None) -> None:
    if completed_frame is not None:
        family_state["missingFrames"] = [frame for frame in family_state["missingFrames"] if frame != completed_frame]
        family_state["corruptFrames"] = [
            record for record in family_state["corruptFrames"] if int(record["frame"]) != completed_frame
        ]
    family_state["validFrames"] = len(family_state["frames"])
    family_state["cumulativeRenderSeconds"] = round(
        sum(float(record.get("renderSeconds", 0.0)) for record in family_state["frames"].values()), 6
    )


def validate_frame_pair(
    frame_path: Path,
    receipt_path: Path,
    family: str,
    frame: int,
    settings_sha: str,
) -> dict[str, Any]:
    if not frame_path.is_file():
        raise RuntimeError("frame file is missing")
    if not receipt_path.is_file():
        raise RuntimeError("frame receipt is missing")
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    if (
        receipt.get("schema") != RECEIPT_SCHEMA
        or receipt.get("status") != "PASS"
        or receipt.get("sourceSha256") != EXPECTED_SOURCE_SHA256
        or receipt.get("family") != family
        or receipt.get("frame") != frame
        or receipt.get("settingsSha256") != settings_sha
    ):
        raise RuntimeError("frame receipt authority mismatch")
    header = parse_png(frame_path)
    width, height = FAMILIES[family]["resolution"]
    if header != {"width": width, "height": height, "bitDepth": 16, "colorType": 2, "interlaced": 0}:
        raise RuntimeError(f"frame PNG authority mismatch: {header}")
    size = frame_path.stat().st_size
    digest = sha256_file(frame_path)
    expected_relative = f"masters/{family}/frames/F{frame:03d}.png"
    if (
        receipt.get("file", {}).get("relativePath") != expected_relative
        or receipt.get("file", {}).get("bytes") != size
        or receipt.get("file", {}).get("sha256") != digest
    ):
        raise RuntimeError("frame bytes/hash differ from receipt")
    return receipt


def validate_existing_frame(
    frame_path: Path,
    receipt_path: Path,
    family: str,
    frame: int,
    settings_sha: str,
) -> dict[str, Any] | None:
    try:
        return validate_frame_pair(frame_path, receipt_path, family, frame, settings_sha)
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError, RuntimeError):
        return None


def reconcile_family(output_root: Path, ledger: dict[str, Any], family: str, settings_sha: str) -> None:
    state = ledger["families"][family]
    prior_settings_sha = state.get("settingsSha256")
    if prior_settings_sha not in (None, settings_sha):
        raise RuntimeError(f"settings authority changed for {family}")
    state["settingsSha256"] = settings_sha
    frames_dir = output_root / "masters" / family / "frames"
    receipts_dir = output_root / "masters" / family / "receipts"
    valid: dict[str, Any] = {}
    missing: list[int] = []
    corrupt: list[dict[str, Any]] = []
    for frame in range(PHYSICAL_START, PHYSICAL_END + 1):
        frame_path = frames_dir / f"F{frame:03d}.png"
        receipt_path = receipts_dir / f"F{frame:03d}.json"
        if not frame_path.exists() and not receipt_path.exists():
            missing.append(frame)
            continue
        try:
            receipt = validate_frame_pair(frame_path, receipt_path, family, frame, settings_sha)
        except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError, RuntimeError) as error:
            corrupt.append({"frame": frame, "reason": f"{type(error).__name__}: {error}"})
            continue
        valid[str(frame)] = receipt_ledger_record(receipt, family, frame)
    state["frames"] = valid
    state["validFrames"] = len(valid)
    state["missingFrames"] = missing
    state["corruptFrames"] = corrupt
    state["cumulativeRenderSeconds"] = round(
        sum(float(record.get("renderSeconds", 0.0)) for record in valid.values()), 6
    )
    state["lastReconciledAt"] = utc_now()


def archive_active_chunk(family_state: dict[str, Any], status: str, reason: str) -> None:
    active = family_state.get("activeChunk")
    if active is None:
        return
    family_state["completedChunks"].append(
        {
            **active,
            "status": status,
            "reason": reason,
            "recoveredAt": utc_now(),
        }
    )
    family_state["activeChunk"] = None


def family_is_complete(state: dict[str, Any]) -> bool:
    return (
        state.get("validFrames") == 500
        and state.get("missingFrames") == []
        and state.get("corruptFrames") == []
        and len(state.get("frames", {})) == 500
    )


def salvage_pending_frame(
    output_root: Path,
    final_path: Path,
    receipt_path: Path,
    family: str,
    frame: int,
    settings_sha: str,
) -> dict[str, Any] | None:
    receipts_dir = receipt_path.parent
    candidates = sorted(receipts_dir.glob(f"F{frame:03d}.pending-*.json")) if receipts_dir.exists() else []
    for pending_receipt in candidates:
        try:
            receipt = json.loads(pending_receipt.read_text(encoding="utf-8"))
            partial_relative = receipt.get("pendingFileRelativePath")
            if not isinstance(partial_relative, str):
                raise RuntimeError("pending receipt lacks partial path")
            partial_path = (output_root / partial_relative).resolve()
            try:
                partial_path.relative_to(output_root)
            except ValueError as error:
                raise RuntimeError("pending frame escapes output root") from error
            candidate_frame = final_path if final_path.is_file() else partial_path
            validated = validate_frame_pair(candidate_frame, pending_receipt, family, frame, settings_sha)
            if not final_path.is_file():
                if not partial_path.is_file():
                    raise RuntimeError("pending frame file is absent")
                os.replace(partial_path, final_path)
            os.replace(pending_receipt, receipt_path)
            return validated
        except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError, RuntimeError):
            continue
    return None


def quarantine_frame_artifacts(
    output_root: Path,
    family: str,
    frame: int,
    paths: list[Path],
    reason: str,
) -> None:
    existing = sorted({candidate.resolve() for candidate in paths if candidate.exists()}, key=str)
    if not existing:
        return
    quarantine = (
        output_root
        / "quarantine"
        / family
        / f"F{frame:03d}-{utc_now().replace(':', '').replace('.', '')}-{os.getpid()}"
    )
    quarantine.mkdir(parents=True, exist_ok=False)
    write_json_atomic(
        quarantine / "quarantine-reason.json",
        {
            "schema": "quantum-hub.phase-4-r2.quarantined-frame-artifacts.v1",
            "quarantinedAt": utc_now(),
            "family": family,
            "frame": frame,
            "reason": reason,
            "files": [candidate.name for candidate in existing],
        },
    )
    for candidate in existing:
        try:
            candidate.relative_to(output_root)
        except ValueError as error:
            raise RuntimeError("refusing to quarantine an artifact outside the production root") from error
        destination = quarantine / candidate.name
        if destination.exists():
            raise RuntimeError(f"quarantine destination already exists: {destination}")
        os.replace(candidate, destination)


def render_frame(
    output_root: Path,
    family: str,
    frame: int,
    phase: str,
    settings: dict[str, Any],
    settings_sha: str,
    source_path: Path,
) -> dict[str, Any]:
    frames_dir = output_root / "masters" / family / "frames"
    receipts_dir = output_root / "masters" / family / "receipts"
    frames_dir.mkdir(parents=True, exist_ok=True)
    receipts_dir.mkdir(parents=True, exist_ok=True)
    final_path = frames_dir / f"F{frame:03d}.png"
    receipt_path = receipts_dir / f"F{frame:03d}.json"
    salvaged = salvage_pending_frame(output_root, final_path, receipt_path, family, frame, settings_sha)
    if salvaged is not None:
        quarantine_frame_artifacts(
            output_root,
            family,
            frame,
            [
                *frames_dir.glob(f"F{frame:03d}.partial-*.png"),
                *receipts_dir.glob(f"F{frame:03d}.pending-*.json"),
                *receipts_dir.glob(f"F{frame:03d}.pending-*.json.tmp-*"),
            ],
            "valid pending frame was salvaged; leftover pending artifacts were superseded",
        )
        salvaged["reused"] = True
        salvaged["salvagedPendingWrite"] = True
        return salvaged
    existing = validate_existing_frame(final_path, receipt_path, family, frame, settings_sha)
    if existing is not None:
        existing["reused"] = True
        return existing

    quarantine_frame_artifacts(
        output_root,
        family,
        frame,
        [
            final_path,
            receipt_path,
            *frames_dir.glob(f"F{frame:03d}.partial-*.png"),
            *receipts_dir.glob(f"F{frame:03d}.pending-*.json"),
            *receipts_dir.glob(f"F{frame:03d}.pending-*.json.tmp-*"),
        ],
        "frame/receipt pair failed validation or pending write could not be salvaged",
    )

    if sha256_file(source_path) != EXPECTED_SOURCE_SHA256:
        raise RuntimeError("source changed before frame render")
    partial_path = frames_dir / f"F{frame:03d}.partial-{os.getpid()}.png"
    if partial_path.exists():
        raise RuntimeError("fresh partial render path unexpectedly already exists after quarantine")

    scene = bpy.context.scene
    scene.frame_set(frame)
    scene.render.filepath = str(partial_path)
    started = time.perf_counter()
    bpy.ops.render.render(write_still=True)
    render_seconds = time.perf_counter() - started
    if not partial_path.is_file():
        raise RuntimeError(f"Blender did not write frame F{frame:03d}")
    header = parse_png(partial_path)
    width, height = FAMILIES[family]["resolution"]
    expected_header = {"width": width, "height": height, "bitDepth": 16, "colorType": 2, "interlaced": 0}
    if header != expected_header:
        raise RuntimeError(f"frame F{frame:03d} PNG mismatch: {header}")
    digest = sha256_file(partial_path)
    size = partial_path.stat().st_size
    receipt = {
        "schema": RECEIPT_SCHEMA,
        "status": "PASS",
        "completedAt": utc_now(),
        "phase": phase,
        "family": family,
        "frame": frame,
        "sourceSha256": EXPECTED_SOURCE_SHA256,
        "settingsSha256": settings_sha,
        "renderSeconds": round(render_seconds, 6),
        "settings": settings,
        "file": {
            "relativePath": final_path.relative_to(output_root).as_posix(),
            "bytes": size,
            "sha256": digest,
            **header,
        },
        "pendingFileRelativePath": partial_path.relative_to(output_root).as_posix(),
        "authorization": {"physicalFrameMaximum": 500, "phase5Authorized": False},
    }
    pending_receipt_path = receipts_dir / f"F{frame:03d}.pending-{os.getpid()}.json"
    write_json_atomic(pending_receipt_path, receipt)
    os.replace(partial_path, final_path)
    os.replace(pending_receipt_path, receipt_path)
    return receipt


def parse_frames(args: argparse.Namespace) -> list[int]:
    frames: list[int] = []
    if args.frames:
        for value in args.frames.split(","):
            value = value.strip()
            if value:
                frames.append(int(value))
    if args.start is not None or args.end is not None:
        if args.start is None or args.end is None or args.start > args.end:
            raise RuntimeError("start/end must be supplied as an ordered pair")
        frames.extend(range(args.start, args.end + 1))
    frames = sorted(set(frames))
    if not frames:
        raise RuntimeError("no frames requested")
    if frames[0] < PHYSICAL_START or frames[-1] > PHYSICAL_END:
        raise RuntimeError("R2 Cycles worker is hard-limited to physical F1-F500")
    return frames


def validate_invocation_lock(args: argparse.Namespace, output_root: Path) -> dict[str, Any]:
    lock_path = Path(args.lock_file).resolve()
    expected_lock = (output_root / ".phase4r2-production.lock").resolve()
    if lock_path != expected_lock or not lock_path.is_file():
        raise RuntimeError("exclusive production lock is missing or misplaced")
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    if lock.get("token") != args.lock_token or lock.get("sourceSha256") != EXPECTED_SOURCE_SHA256:
        raise RuntimeError("exclusive production lock authority mismatch")
    lock["blenderProcessId"] = os.getpid()
    lock["blenderStartedAt"] = lock.get("blenderStartedAt") or utc_now()
    write_json_atomic(lock_path, lock)
    stamped = json.loads(lock_path.read_text(encoding="utf-8"))
    if stamped.get("token") != args.lock_token or stamped.get("blenderProcessId") != os.getpid():
        raise RuntimeError("exclusive production lock Blender-child stamp failed")
    return stamped


def assert_source_unchanged(source_path: Path, original_size: int) -> None:
    if (
        source_path.stat().st_size != original_size
        or sha256_file(source_path) != EXPECTED_SOURCE_SHA256
        or not is_read_only(source_path)
    ):
        raise RuntimeError("frozen source changed or lost read-only protection")


def update_overall_status(ledger: dict[str, Any], incomplete_status: str = "PARTIAL") -> None:
    ledger["status"] = (
        "RENDERING_COMPLETE"
        if all(family_is_complete(state) for state in ledger["families"].values())
        else incomplete_status
    )


def run_preflight(args: argparse.Namespace) -> None:
    source_path, source = source_authority()
    source_stat = source_path.stat()
    backup = validate_backup(Path(args.backup))
    resources = validate_resources()
    output_root = Path(args.output_root).resolve()
    invocation_lock = validate_invocation_lock(args, output_root)
    ledger_path = output_root / "phase-4r2-production-render-ledger.json"
    ledger = load_ledger(ledger_path, source, backup)
    saved_source_state = {
        "scene": bpy.context.scene.name,
        "savedEngine": bpy.context.scene.render.engine,
        "savedResolution": [bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y],
        "savedFrameRange": [bpy.context.scene.frame_start, bpy.context.scene.frame_end],
        "savedCamera": None if bpy.context.scene.camera is None else bpy.context.scene.camera.name,
        "savedSamples": int(bpy.context.scene.cycles.samples),
        "savedDevice": str(bpy.context.scene.cycles.device),
        "savedColorMode": str(bpy.context.scene.render.image_settings.color_mode),
        "savedColorDepth": str(bpy.context.scene.render.image_settings.color_depth),
    }
    production_settings: dict[str, Any] = {}
    for family in FAMILIES:
        settings, authority = configure_family(family)
        if settings["device"]["backend"] not in {"OPTIX", "CUDA"}:
            raise RuntimeError(f"unsupported production GPU backend for {family}")
        production_settings[family] = {"settings": settings, "settingsSha256": authority["sha256"]}
        ledger["families"][family]["settingsSha256"] = authority["sha256"]
        archive_active_chunk(
            ledger["families"][family],
            "INTERRUPTED",
            "preflight exclusive-lock recovery found a stale active chunk",
        )
        reconcile_family(output_root, ledger, family, authority["sha256"])
    report = {
        "schema": PREFLIGHT_SCHEMA,
        "status": "PASS",
        "completedAt": utc_now(),
        "blender": {"version": bpy.app.version_string, "versionTuple": list(bpy.app.version[:3])},
        "source": source,
        "immutableBackup": backup,
        "resources": resources,
        "savedSourceState": saved_source_state,
        "productionSettings": production_settings,
        "invocationLock": {"token": invocation_lock["token"], "command": invocation_lock["command"]},
        "productionPolicy": {
            "sourceMayBeSaved": False,
            "runtimeOverridesAreInMemoryOnly": True,
            "physicalFrames": [1, 500],
            "semanticFramesExcludedFromCycles": [501, 540],
        },
    }
    write_json_atomic(output_root / "reports" / "phase-4r2-source-preflight.json", report)
    ledger["preflight"] = {
        "status": "PASS",
        "completedAt": report["completedAt"],
        "report": "reports/phase-4r2-source-preflight.json",
    }
    ledger["status"] = "PREFLIGHT_PASS"
    ledger["updatedAt"] = utc_now()
    write_json_atomic(ledger_path, ledger)
    assert_source_unchanged(source_path, source_stat.st_size)
    print("QH_PHASE4R2_PREFLIGHT=PASS")


def run_reconcile(args: argparse.Namespace) -> None:
    source_path, source = source_authority()
    source_stat = source_path.stat()
    backup = validate_backup(Path(args.backup))
    validate_resources()
    output_root = Path(args.output_root).resolve()
    validate_invocation_lock(args, output_root)
    ledger_path = output_root / "phase-4r2-production-render-ledger.json"
    ledger = load_ledger(ledger_path, source, backup)
    if ledger.get("preflight", {}).get("status") != "PASS":
        raise RuntimeError("production preflight has not passed")
    families = tuple(FAMILIES) if args.family == "all" else (args.family,)
    for family in families:
        settings, authority = configure_family(family)
        if settings["device"]["backend"] not in {"OPTIX", "CUDA"}:
            raise RuntimeError(f"unsupported production GPU backend for {family}")
        state = ledger["families"][family]
        archive_active_chunk(state, "INTERRUPTED", "exclusive-lock recovery found a stale active chunk")
        reconcile_family(output_root, ledger, family, authority["sha256"])
    update_overall_status(ledger)
    ledger["updatedAt"] = utc_now()
    write_json_atomic(ledger_path, ledger)
    assert_source_unchanged(source_path, source_stat.st_size)
    counts = " ".join(f"{family}={ledger['families'][family]['validFrames']}/500" for family in families)
    print(f"QH_PHASE4R2_RECONCILE=PASS {counts}", flush=True)


def run_render(args: argparse.Namespace) -> None:
    if args.family not in FAMILIES:
        raise RuntimeError(f"unknown family: {args.family}")
    frames = parse_frames(args)
    source_path, source = source_authority()
    source_stat = source_path.stat()
    backup = validate_backup(Path(args.backup))
    validate_resources()
    output_root = Path(args.output_root).resolve()
    validate_invocation_lock(args, output_root)
    ledger_path = output_root / "phase-4r2-production-render-ledger.json"
    ledger = load_ledger(ledger_path, source, backup)
    if ledger.get("preflight", {}).get("status") != "PASS":
        raise RuntimeError("production preflight has not passed")

    settings, settings_authority = configure_family(args.family)
    settings_sha = settings_authority["sha256"]
    family_state = ledger["families"][args.family]
    prior_settings_sha = family_state.get("settingsSha256")
    if prior_settings_sha not in (None, settings_sha):
        raise RuntimeError(f"settings authority changed for {args.family}")
    archive_active_chunk(family_state, "INTERRUPTED", "exclusive-lock recovery found a stale active chunk")
    reconcile_family(output_root, ledger, args.family, settings_sha)
    family_state = ledger["families"][args.family]
    chunk_id = f"{args.phase}-{args.family}-F{frames[0]:03d}-F{frames[-1]:03d}-{settings_sha[:8]}"
    family_state["activeChunk"] = {
        "id": chunk_id,
        "phase": args.phase,
        "frames": frames,
        "startedAt": utc_now(),
        "processId": os.getpid(),
        "log": args.log_relative,
        "settingsSha256": settings_sha,
        "sourceSha256": EXPECTED_SOURCE_SHA256,
    }
    ledger["status"] = "RENDERING"
    ledger["updatedAt"] = utc_now()
    write_json_atomic(ledger_path, ledger)

    invocation_started = time.perf_counter()
    rendered = 0
    reused = 0
    try:
        for order, frame in enumerate(frames, start=1):
            receipt = render_frame(output_root, args.family, frame, args.phase, settings, settings_sha, source_path)
            if receipt.pop("reused", False):
                reused += 1
            else:
                rendered += 1
            family_state["frames"][str(frame)] = receipt_ledger_record(receipt, args.family, frame)
            refresh_incremental_summary(family_state, frame)
            family_state["activeChunk"]["lastCompletedFrame"] = frame
            family_state["activeChunk"]["completedCount"] = order
            ledger["updatedAt"] = utc_now()
            write_json_atomic(ledger_path, ledger)
            print(
                f"QH_PHASE4R2_FRAME=F{frame:03d} FAMILY={args.family} "
                f"ORDER={order}/{len(frames)} RENDERED={rendered} REUSED={reused}",
                flush=True,
            )
    except BaseException as error:
        active = family_state.get("activeChunk") or {"id": chunk_id, "frames": frames}
        family_state["completedChunks"].append(
            {
                **active,
                "status": "FAILED",
                "completedAt": utc_now(),
                "elapsedSeconds": round(time.perf_counter() - invocation_started, 6),
                "renderedFrames": rendered,
                "reusedFrames": reused,
                "errorType": type(error).__name__,
                "error": str(error),
            }
        )
        family_state["activeChunk"] = None
        try:
            reconcile_family(output_root, ledger, args.family, settings_sha)
        except BaseException as reconcile_error:
            family_state["reconcileFailure"] = {
                "at": utc_now(),
                "errorType": type(reconcile_error).__name__,
                "error": str(reconcile_error),
            }
        ledger["status"] = "FAILED"
        ledger["updatedAt"] = utc_now()
        write_json_atomic(ledger_path, ledger)
        assert_source_unchanged(source_path, source_stat.st_size)
        raise

    completed = {
        **family_state["activeChunk"],
        "completedAt": utc_now(),
        "elapsedSeconds": round(time.perf_counter() - invocation_started, 6),
        "renderedFrames": rendered,
        "reusedFrames": reused,
        "status": "PASS",
    }
    family_state["completedChunks"].append(completed)
    family_state["activeChunk"] = None
    reconcile_family(output_root, ledger, args.family, settings_sha)
    update_overall_status(ledger)
    ledger["updatedAt"] = utc_now()
    write_json_atomic(ledger_path, ledger)
    assert_source_unchanged(source_path, source_stat.st_size)
    print(f"QH_PHASE4R2_SETTINGS_SHA256={settings_sha}", flush=True)
    print(f"QH_PHASE4R2_CHUNK={chunk_id} STATUS=PASS", flush=True)


def main() -> None:
    if tuple(int(value) for value in bpy.app.version[:3]) != EXPECTED_BLENDER:
        raise RuntimeError(f"Blender 5.2.0 is required, got {bpy.app.version_string}")
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("preflight", "reconcile", "render"), required=True)
    parser.add_argument("--output-root", required=True)
    parser.add_argument("--backup", required=True)
    parser.add_argument("--family", choices=(*tuple(FAMILIES), "all"), default="desktop")
    parser.add_argument("--frames")
    parser.add_argument("--start", type=int)
    parser.add_argument("--end", type=int)
    parser.add_argument("--phase", choices=("pilot", "temporal", "master"), default="master")
    parser.add_argument("--required-source-sha", required=True)
    parser.add_argument("--settings-authority", required=True)
    parser.add_argument("--expected-width", type=int)
    parser.add_argument("--expected-height", type=int)
    parser.add_argument("--lock-file", required=True)
    parser.add_argument("--lock-token", required=True)
    parser.add_argument("--log-relative", required=True)
    args = parser.parse_args(argv)
    if args.required_source_sha != EXPECTED_SOURCE_SHA256:
        raise RuntimeError("required source SHA does not equal the frozen R1.1 authority")
    if args.settings_authority != "phase4r2-production-v1":
        raise RuntimeError("render settings authority identifier mismatch")
    source_path, _source = source_authority()
    output_root = Path(args.output_root).resolve()
    repo_root = Path(__file__).resolve().parents[1]
    try:
        output_root.relative_to(repo_root)
    except ValueError:
        pass
    else:
        raise RuntimeError("raw production output root must remain outside the repository")
    if args.family in FAMILIES and args.expected_width is not None and args.expected_height is not None:
        if [args.expected_width, args.expected_height] != FAMILIES[args.family]["resolution"]:
            raise RuntimeError("requested resolution differs from the frozen family authority")
    if args.mode == "preflight":
        run_preflight(args)
    elif args.mode == "reconcile":
        run_reconcile(args)
    else:
        run_render(args)


if __name__ == "__main__":
    main()
