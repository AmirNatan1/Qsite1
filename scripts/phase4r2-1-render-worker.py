"""Fail-closed Phase 4-R2.1 affected-frame Cycles worker.

This worker is intentionally incapable of rendering outside F46-F494. It is
launched by ``phase4r2-1-production.mjs`` against an external, hash-locked copy
of the accepted R2.1 Blender source. Runtime overrides are in-memory only; the
worker never saves the blend file and never writes raw frames inside Git.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import struct
import sys
import time
from typing import Any
import zlib

import bpy


SOURCE_SHA256 = "58f5479484dd8da342556abad1e58c96a660f30e6a9d6d5215927056b5cbc516"
SOURCE_BYTES = 3_619_698
BOUNDARY_REPORT_SHA256 = "f182b35dc533878a7c70b7f1327e8d92c5438fd3984b6223d520fd5b83abc9df"
EXPECTED_BLENDER = (5, 2, 0)
EXPECTED_Q_NAME = "Phase4R1V2_ExactQuantumQ_PreCRTEffect_2048"
EXPECTED_Q_SHA256 = "009c494df3b301470ab539f23e02b375f0c1fcec9b4b18cf07fc853b95fd03c5"
LEDGER_SCHEMA = "quantum-hub.phase-4-r2-1.partial-production-ledger.v1"
LOCK_SCHEMA = "quantum-hub.phase-4-r2-1.production-lock.v1"
RECEIPT_SCHEMA = "quantum-hub.phase-4-r2-1.production-frame-receipt.v1"
PREFLIGHT_SCHEMA = "quantum-hub.phase-4-r2-1.production-source-preflight.v1"
AFFECTED_START = 46
AFFECTED_END = 494
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


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def canonical_hash(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + f".tmp-{os.getpid()}")
    payload = json.dumps(value, indent=2, sort_keys=True, ensure_ascii=True) + "\n"
    with temporary.open("x", encoding="utf-8", newline="\n") as handle:
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def privacy_safe_error(error: BaseException, output_root: Path, source_path: Path) -> str:
    value = str(error)
    replacements = (
        (str(output_root), "<R2_1_EXTERNAL_ROOT>"),
        (str(source_path), "<IMMUTABLE_SOURCE>"),
        (str(Path.home()), "<USER_HOME>"),
    )
    for needle, replacement in replacements:
        value = value.replace(needle, replacement)
        value = value.replace(needle.replace("\\", "/"), replacement)
    return value


def parse_png(path: Path) -> dict[str, int]:
    """Validate chunk CRCs, complete zlib data, row sizes and PNG header."""
    header: dict[str, int] | None = None
    compressed = bytearray()
    saw_iend = False
    with path.open("rb") as handle:
        if handle.read(8) != b"\x89PNG\r\n\x1a\n":
            raise RuntimeError(f"not a PNG: {path.name}")
        chunk_index = 0
        while not saw_iend:
            length_bytes = handle.read(4)
            if len(length_bytes) != 4:
                raise RuntimeError(f"truncated PNG: {path.name}")
            length = struct.unpack(">I", length_bytes)[0]
            chunk_type = handle.read(4)
            data = handle.read(length)
            crc_bytes = handle.read(4)
            if len(chunk_type) != 4 or len(data) != length or len(crc_bytes) != 4:
                raise RuntimeError(f"truncated PNG chunk: {path.name}")
            actual_crc = zlib.crc32(data, zlib.crc32(chunk_type)) & 0xFFFFFFFF
            if actual_crc != struct.unpack(">I", crc_bytes)[0]:
                raise RuntimeError(f"PNG CRC mismatch: {path.name}")
            if chunk_index == 0 and chunk_type != b"IHDR":
                raise RuntimeError(f"PNG IHDR is not first: {path.name}")
            if chunk_type == b"IHDR":
                if header is not None or length != 13:
                    raise RuntimeError(f"invalid PNG IHDR: {path.name}")
                width, height, depth, color_type, compression, filtering, interlace = struct.unpack(
                    ">IIBBBBB", data
                )
                if compression != 0 or filtering != 0 or interlace != 0:
                    raise RuntimeError(f"unsupported PNG header: {path.name}")
                header = {
                    "width": width,
                    "height": height,
                    "bitDepth": depth,
                    "colorType": color_type,
                    "interlaced": interlace,
                }
            elif chunk_type == b"IDAT":
                compressed.extend(data)
            elif chunk_type == b"IEND":
                if length != 0:
                    raise RuntimeError(f"invalid PNG IEND: {path.name}")
                saw_iend = True
            chunk_index += 1
        if handle.read(1):
            raise RuntimeError(f"PNG has trailing bytes: {path.name}")
    if header is None or not compressed or not saw_iend:
        raise RuntimeError(f"incomplete PNG: {path.name}")
    channels = {0: 1, 2: 3, 4: 2, 6: 4}.get(header["colorType"])
    if channels is None:
        raise RuntimeError(f"unsupported PNG color type: {path.name}")
    inflater = zlib.decompressobj()
    decoded = inflater.decompress(bytes(compressed)) + inflater.flush()
    if not inflater.eof or inflater.unused_data or inflater.unconsumed_tail:
        raise RuntimeError(f"incomplete PNG zlib stream: {path.name}")
    row_bytes = (header["width"] * channels * header["bitDepth"] + 7) // 8
    if len(decoded) != (row_bytes + 1) * header["height"]:
        raise RuntimeError(f"PNG decoded byte count mismatch: {path.name}")
    if any(decoded[row * (row_bytes + 1)] > 4 for row in range(header["height"])):
        raise RuntimeError(f"invalid PNG row filter: {path.name}")
    return header


def validate_source() -> tuple[Path, dict[str, Any]]:
    source = Path(bpy.data.filepath).resolve()
    if not source.is_file():
        raise RuntimeError("Blender did not open a source file")
    size = source.stat().st_size
    digest = sha256_file(source)
    if size != SOURCE_BYTES or digest != SOURCE_SHA256:
        raise RuntimeError(f"R2.1 source mismatch: bytes={size} sha256={digest}")
    image = bpy.data.images.get(EXPECTED_Q_NAME)
    if image is None or len(image.packed_files) != 1 or image.packed_files[0].packed_file is None:
        raise RuntimeError("exact packed Q authority is missing")
    q_payload = bytes(image.packed_files[0].packed_file.data)
    if hashlib.sha256(q_payload).hexdigest() != EXPECTED_Q_SHA256:
        raise RuntimeError("exact packed Q hash mismatch")
    missing_images = []
    for candidate in bpy.data.images:
        if candidate.packed_files or candidate.source not in {"FILE", "SEQUENCE", "MOVIE"}:
            continue
        if candidate.filepath and not Path(bpy.path.abspath(candidate.filepath)).exists():
            missing_images.append(candidate.name)
    missing_libraries = [
        library.name for library in bpy.data.libraries
        if library.filepath and not Path(bpy.path.abspath(library.filepath)).exists()
    ]
    if missing_images or missing_libraries:
        raise RuntimeError(f"missing resources: images={missing_images} libraries={missing_libraries}")
    if bpy.context.scene.frame_end < 540 or bpy.context.scene.render.fps != FPS:
        raise RuntimeError("accepted 540-frame/30-fps conceptual authority is missing")
    for family, authority in FAMILIES.items():
        camera = bpy.data.objects.get(authority["camera"])
        collection = bpy.data.collections.get(authority["cableCollection"])
        if camera is None or camera.type != "CAMERA" or collection is None:
            raise RuntimeError(f"camera/cable family authority missing for {family}")
    return source, {
        "basename": source.name,
        "bytes": size,
        "sha256": digest,
        "exactQ": {"name": image.name, "packedBytes": len(q_payload), "sha256": EXPECTED_Q_SHA256},
        "missingImages": [],
        "missingLibraries": [],
    }


def validate_lock(args: argparse.Namespace, output_root: Path) -> dict[str, Any]:
    lock_path = Path(args.lock_file).resolve()
    expected = (output_root / ".phase4r2-1-production.lock").resolve()
    if lock_path != expected or not lock_path.is_file():
        raise RuntimeError("R2.1 exclusive production lock is missing or misplaced")
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    if (
        lock.get("schema") != LOCK_SCHEMA
        or lock.get("token") != args.lock_token
        or lock.get("sourceSha256") != SOURCE_SHA256
        or lock.get("boundaryReportSha256") != BOUNDARY_REPORT_SHA256
        or lock.get("childProcessId") != os.getpid()
        or lock.get("command") != args.mode
    ):
        raise RuntimeError("R2.1 exclusive production lock authority mismatch")
    lock["blenderProcessId"] = os.getpid()
    lock["blenderStartedAt"] = lock.get("blenderStartedAt") or utc_now()
    write_json_atomic(lock_path, lock)
    return lock


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
                return {"backend": backend, "sceneDevice": "GPU", "attempts": attempts}
        except Exception as error:  # Blender backend failures vary by driver.
            attempts.append({"backend": backend, "errorType": type(error).__name__})
    raise RuntimeError(f"Cycles GPU is unavailable: {attempts}")


def configure_family(family: str) -> tuple[dict[str, Any], str]:
    authority = FAMILIES[family]
    scene = bpy.context.scene
    scene.camera = bpy.data.objects[authority["camera"]]
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
    settings = {
        "authority": "phase4r2-1-partial-production-v1",
        "engine": "CYCLES",
        "family": family,
        "camera": authority["camera"],
        "cableCollection": authority["cableCollection"],
        "resolution": [width, height],
        "fps": FPS,
        "renderedFrames": [AFFECTED_START, AFFECTED_END],
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
        "device": {"backend": device["backend"], "sceneDevice": "GPU"},
    }
    if (
        scene.render.engine != "CYCLES"
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
    return settings, canonical_hash(settings)


def load_ledger(output_root: Path) -> tuple[Path, dict[str, Any]]:
    path = output_root / "phase-4r2-1-production-ledger.json"
    if not path.is_file():
        raise RuntimeError("R2.1 production ledger has not been initialized")
    ledger = json.loads(path.read_text(encoding="utf-8"))
    if (
        ledger.get("schema") != LEDGER_SCHEMA
        or ledger.get("source", {}).get("sha256") != SOURCE_SHA256
        or ledger.get("blackBoundaryProof", {}).get("sha256") != BOUNDARY_REPORT_SHA256
    ):
        raise RuntimeError("R2.1 production ledger authority mismatch")
    return path, ledger


def parse_frames(raw: str | None) -> list[int]:
    if not raw:
        raise RuntimeError("no affected frames requested")
    frames = sorted({int(value.strip()) for value in raw.split(",") if value.strip()})
    if not frames or frames[0] < AFFECTED_START or frames[-1] > AFFECTED_END:
        raise RuntimeError("R2.1 worker is hard-limited to affected physical F46-F494")
    return frames


def quarantine(output_root: Path, family: str, frame: int, paths: list[Path], reason: str) -> None:
    existing = sorted({path.resolve() for path in paths if path.exists()}, key=str)
    if not existing:
        return
    directory = output_root / "quarantine" / family / f"F{frame:03d}-{int(time.time())}-{os.getpid()}"
    directory.mkdir(parents=True, exist_ok=False)
    write_json_atomic(directory / "reason.json", {
        "schema": "quantum-hub.phase-4-r2-1.quarantine-record.v1",
        "family": family,
        "frame": frame,
        "reason": reason,
        "files": [path.name for path in existing],
    })
    for candidate in existing:
        try:
            candidate.relative_to(output_root)
        except ValueError as error:
            raise RuntimeError("refusing to quarantine outside the external production root") from error
        os.replace(candidate, directory / candidate.name)


def validate_existing(
    frame_path: Path,
    receipt_path: Path,
    family: str,
    frame: int,
    settings_sha: str,
) -> dict[str, Any] | None:
    if not frame_path.is_file() or not receipt_path.is_file():
        return None
    try:
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        header = parse_png(frame_path)
    except Exception:
        return None
    width, height = FAMILIES[family]["resolution"]
    size = frame_path.stat().st_size
    digest = sha256_file(frame_path)
    if (
        receipt.get("schema") != RECEIPT_SCHEMA
        or receipt.get("status") != "PASS"
        or receipt.get("family") != family
        or receipt.get("frame") != frame
        or receipt.get("sourceSha256") != SOURCE_SHA256
        or receipt.get("blackBoundaryReportSha256") != BOUNDARY_REPORT_SHA256
        or receipt.get("settingsSha256") != settings_sha
        or receipt.get("file", {}).get("bytes") != size
        or receipt.get("file", {}).get("sha256") != digest
        or header != {"width": width, "height": height, "bitDepth": 16, "colorType": 2, "interlaced": 0}
    ):
        return None
    return receipt


def render_one(
    output_root: Path,
    family: str,
    frame: int,
    settings: dict[str, Any],
    settings_sha: str,
    source_path: Path,
) -> tuple[dict[str, Any], bool]:
    frames_dir = output_root / "masters" / family / "frames"
    receipts_dir = output_root / "masters" / family / "receipts"
    frames_dir.mkdir(parents=True, exist_ok=True)
    receipts_dir.mkdir(parents=True, exist_ok=True)
    final_path = frames_dir / f"F{frame:03d}.png"
    receipt_path = receipts_dir / f"F{frame:03d}.json"
    existing = validate_existing(final_path, receipt_path, family, frame, settings_sha)
    if existing is not None:
        return existing, True
    quarantine(
        output_root,
        family,
        frame,
        [final_path, receipt_path, *frames_dir.glob(f"F{frame:03d}.partial-*.png"),
         *receipts_dir.glob(f"F{frame:03d}.pending-*.json")],
        "incomplete or invalid affected-frame authority",
    )
    if sha256_file(source_path) != SOURCE_SHA256:
        raise RuntimeError("R2.1 source changed before render")
    partial_path = frames_dir / f"F{frame:03d}.partial-{os.getpid()}.png"
    scene = bpy.context.scene
    scene.frame_set(frame)
    scene.render.filepath = str(partial_path)
    started = time.perf_counter()
    bpy.ops.render.render(write_still=True)
    elapsed = time.perf_counter() - started
    if not partial_path.is_file():
        raise RuntimeError(f"Blender did not write F{frame:03d}")
    header = parse_png(partial_path)
    width, height = FAMILIES[family]["resolution"]
    expected = {"width": width, "height": height, "bitDepth": 16, "colorType": 2, "interlaced": 0}
    if header != expected:
        raise RuntimeError(f"F{frame:03d} PNG authority mismatch: {header}")
    receipt = {
        "schema": RECEIPT_SCHEMA,
        "status": "PASS",
        "family": family,
        "frame": frame,
        "sourceSha256": SOURCE_SHA256,
        "blackBoundaryReportSha256": BOUNDARY_REPORT_SHA256,
        "settingsSha256": settings_sha,
        "renderSeconds": round(elapsed, 6),
        "file": {
            "relativePath": f"masters/{family}/frames/F{frame:03d}.png",
            "bytes": partial_path.stat().st_size,
            "sha256": sha256_file(partial_path),
            **header,
        },
        "authorization": {"affectedFramesOnly": [AFFECTED_START, AFFECTED_END], "phase5": False},
    }
    pending = receipts_dir / f"F{frame:03d}.pending-{os.getpid()}.json"
    write_json_atomic(pending, receipt)
    os.replace(partial_path, final_path)
    os.replace(pending, receipt_path)
    return receipt, False


def run_preflight(args: argparse.Namespace, output_root: Path) -> None:
    source_path, source = validate_source()
    _lock = validate_lock(args, output_root)
    ledger_path, ledger = load_ledger(output_root)
    settings: dict[str, Any] = {}
    for family in FAMILIES:
        value, digest = configure_family(family)
        settings[family] = {"settings": value, "sha256": digest}
        prior = ledger["families"][family].get("settingsSha256")
        if prior not in (None, digest):
            raise RuntimeError(f"settings authority changed for {family}")
        ledger["families"][family]["settingsSha256"] = digest
    report = {
        "schema": PREFLIGHT_SCHEMA,
        "status": "PASS",
        "blender": {"version": bpy.app.version_string, "versionTuple": list(bpy.app.version[:3])},
        "source": source,
        "blackBoundaryReportSha256": BOUNDARY_REPORT_SHA256,
        "productionSettings": settings,
        "policy": {
            "sourceSaved": False,
            "runtimeOverridesInMemoryOnly": True,
            "renderedFrames": [AFFECTED_START, AFFECTED_END],
            "reusedFrames": [[1, 45], [495, 500]],
            "fullRerenderProhibited": True,
            "phase5": False,
        },
    }
    write_json_atomic(output_root / "reports" / "phase-4r2-1-source-preflight.json", report)
    ledger["preflight"] = {"status": "PASS", "report": "reports/phase-4r2-1-source-preflight.json"}
    ledger["status"] = "PREFLIGHT_PASS"
    write_json_atomic(ledger_path, ledger)
    if source_path.stat().st_size != SOURCE_BYTES or sha256_file(source_path) != SOURCE_SHA256:
        raise RuntimeError("R2.1 source changed during preflight")
    print("QH_PHASE4R2_1_PREFLIGHT=PASS", flush=True)


def run_render(args: argparse.Namespace, output_root: Path) -> None:
    source_path, _source = validate_source()
    _lock = validate_lock(args, output_root)
    ledger_path, ledger = load_ledger(output_root)
    if ledger.get("preflight", {}).get("status") != "PASS":
        raise RuntimeError("R2.1 production preflight has not passed")
    family = args.family
    frames = parse_frames(args.frames)
    settings, settings_sha = configure_family(family)
    if ledger["families"][family].get("settingsSha256") != settings_sha:
        raise RuntimeError(f"settings authority mismatch for {family}")
    state = ledger["families"][family]
    state["activeChunk"] = {
        "family": family,
        "frames": frames,
        "sourceSha256": SOURCE_SHA256,
        "settingsSha256": settings_sha,
        "processId": os.getpid(),
    }
    ledger["status"] = "RENDERING_AFFECTED_ONLY"
    write_json_atomic(ledger_path, ledger)
    rendered = 0
    reused = 0
    try:
        for index, frame in enumerate(frames, start=1):
            receipt, was_reused = render_one(output_root, family, frame, settings, settings_sha, source_path)
            rendered += 0 if was_reused else 1
            reused += 1 if was_reused else 0
            state["frames"][str(frame)] = {
                "bytes": receipt["file"]["bytes"],
                "sha256": receipt["file"]["sha256"],
                "receipt": f"masters/{family}/receipts/F{frame:03d}.json",
                "renderSeconds": receipt["renderSeconds"],
            }
            state["validAffectedFrames"] = len(state["frames"])
            state["activeChunk"]["lastCompletedFrame"] = frame
            state["activeChunk"]["completedCount"] = index
            write_json_atomic(ledger_path, ledger)
            print(
                f"QH_PHASE4R2_1_FRAME=F{frame:03d} FAMILY={family} "
                f"ORDER={index}/{len(frames)} RENDERED={rendered} REUSED={reused}",
                flush=True,
            )
    except BaseException as error:
        state["completedChunks"].append({
            **(state.get("activeChunk") or {}),
            "status": "FAILED",
            "renderedFrames": rendered,
            "reusedFrames": reused,
            "errorType": type(error).__name__,
            "error": privacy_safe_error(error, output_root, source_path),
        })
        state["activeChunk"] = None
        ledger["status"] = "FAILED"
        write_json_atomic(ledger_path, ledger)
        raise
    state["completedChunks"].append({
        **state["activeChunk"],
        "status": "PASS",
        "renderedFrames": rendered,
        "reusedFrames": reused,
    })
    state["activeChunk"] = None
    ledger["status"] = "AFFECTED_RENDER_PARTIAL"
    write_json_atomic(ledger_path, ledger)
    if source_path.stat().st_size != SOURCE_BYTES or sha256_file(source_path) != SOURCE_SHA256:
        raise RuntimeError("R2.1 source changed during render")
    print(f"QH_PHASE4R2_1_CHUNK={family}-F{frames[0]:03d}-F{frames[-1]:03d} STATUS=PASS", flush=True)


def main() -> None:
    if tuple(int(value) for value in bpy.app.version[:3]) != EXPECTED_BLENDER:
        raise RuntimeError(f"Blender 5.2.0 is required, got {bpy.app.version_string}")
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("preflight", "render"), required=True)
    parser.add_argument("--output-root", required=True)
    parser.add_argument("--family", choices=tuple(FAMILIES), default="desktop")
    parser.add_argument("--frames")
    parser.add_argument("--required-source-sha", required=True)
    parser.add_argument("--required-boundary-report-sha", required=True)
    parser.add_argument("--lock-file", required=True)
    parser.add_argument("--lock-token", required=True)
    args = parser.parse_args(argv)
    if args.required_source_sha != SOURCE_SHA256:
        raise RuntimeError("required R2.1 source SHA mismatch")
    if args.required_boundary_report_sha != BOUNDARY_REPORT_SHA256:
        raise RuntimeError("required black-boundary report SHA mismatch")
    output_root = Path(args.output_root).resolve()
    repo_root = Path(__file__).resolve().parents[1]
    try:
        output_root.relative_to(repo_root)
    except ValueError:
        pass
    else:
        raise RuntimeError("raw R2.1 production root must remain outside Git")
    if args.mode == "preflight":
        run_preflight(args, output_root)
    else:
        run_render(args, output_root)


if __name__ == "__main__":
    main()
