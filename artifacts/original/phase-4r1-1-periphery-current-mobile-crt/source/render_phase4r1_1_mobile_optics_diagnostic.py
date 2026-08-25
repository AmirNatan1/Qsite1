"""Produce bounded Phase 4-R1.1 mobile-optics evidence outside Git.

The audit mode measures the exact thirteen-object physical CRT cabinet from
F001 through F500 at the native 390x844 mobile raster.  It compares the saved
R1.1 lens against an exact R1 counterfactual by temporarily assigning an
unanimated clone of the authored camera data; camera, rig, target, geometry,
and scene time are therefore identical in both measurements.

The animatic modes are deliberately physical-only.  They render resumable
Eevee still chunks in F001-F500 and can encode either F001-F500 or F001-F285
from those authenticated stills.  No mode renders or encodes F501-F540, saves
the Blend file, integrates media, authorizes production, or starts Phase 5.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import io
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from typing import Any, Iterable, Sequence

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
import phase4r1_1_repair_config as cfg


SCHEMA = "quantum-hub.phase-4-r1-1.mobile-optics-diagnostic.v1"
PLAN_SCHEMA = "quantum-hub.phase-4-r1-1.mobile-physical-animatic-plan.v1"
FRAME_MANIFEST_SCHEMA = "quantum-hub.phase-4-r1-1.mobile-physical-frame-manifest.v1"
FINALIZATION_SCHEMA = "quantum-hub.phase-4-r1-1.mobile-physical-animatic-finalization.v1"
EXPECTED_BLENDER = (5, 2, 0)
WIDTH = 390
HEIGHT = 844
FPS = 30
AUDIT_FRAME_START = 1
AUDIT_FRAME_END = 500
PHYSICAL_FRAME_START = 1
PHYSICAL_FRAME_END = 500
MAX_CHUNK_FRAMES = 60
EARLY_PULLAWAY_START = 46
EARLY_PULLAWAY_END = 106
ORBIT_START = 46
ORBIT_END = 285
OPTICAL_PROGRESS_END = 405
FLOAT_TOLERANCE = 2e-5
SCHEDULE_EQUALITY_TOLERANCE = 1e-12

EXPECTED_CAMERA_OBJECT = "Phase4R1_Camera_Mobile"
EXPECTED_CAMERA_DATA = "Phase4R1_Camera_Mobile_Data"
EXPECTED_CAMERA_ACTION = "Phase4R1_Camera_MobileAction"
EXPECTED_AIM_OBJECT = "Phase4R1_EstablishingAimTarget_Mobile"
EXPECTED_ORBIT_RIG = "Phase4R1_OrbitRig_Mobile"
EXPECTED_R1_LENS_KEYS = (
    (1, 74.0),
    (45, 74.0),
    (46, 74.0),
    (76, 24.0),
    (106, 24.0),
    (165, 24.0),
    (225, 24.0),
    (255, 40.0),
    (285, 56.0),
    (405, 56.0),
    (460, 39.0),
    (480, 35.0),
    (500, 35.0),
    (540, 35.0),
)
EXPECTED_R11_LENS_KEYS = (
    (1, 42.0),
    (45, 42.0),
    (46, 42.0),
    (76, 42.0),
    (106, 42.0),
    (165, 42.0),
    (225, 44.0),
    (255, 50.0),
    (285, 56.0),
    (405, 56.0),
    (460, 39.0),
    (480, 35.0),
    (500, 35.0),
    (540, 35.0),
)
EXPECTED_MILESTONES = (1, 46, 76, 106, 135, 165, 195, 225, 255, 285, 356, 405, 450)
VISUAL_EVIDENCE_FRAMES = tuple(sorted((*EXPECTED_MILESTONES, 370, 480, 500)))
VISUAL_EVIDENCE_ROLES = {
    356: "projected-scale milestone; first-readable Q",
    370: "stable-Q",
    480: "portal/push",
    500: "terminal physical threshold boundary",
}
EXPECTED_CAMERA_OBJECT_SLOT_IDENTIFIER = "OBPhase4R1_Camera_Mobile"
EXPECTED_CAMERA_DATA_SLOT_IDENTIFIER = "CAPhase4R1_Camera_Mobile_Data"

ACCEPTED_R1_MOBILE_MANIFEST_BASENAME = "phase4r1-refined-mobile-physical-frame-manifest.json"
ACCEPTED_R1_MOBILE_MANIFEST_BYTES = 179_104
ACCEPTED_R1_MOBILE_MANIFEST_SHA256 = "84dca1c2439c5b23837053298470570015435361911a8adf87d35620cef66699"
ACCEPTED_R1_MOBILE_MANIFEST_SCHEMA = "quantum-hub.phase-4-r1.refined-proving-hall.mobile-physical-frames.v2"
ACCEPTED_R1_MOBILE_SELECTED_FRAMES = {
    1: (253_378, "7d744acaa1376cd347ca7d17164d621ef741d19f21bceda1930113799fb642dc"),
    46: (253_378, "8a5f955213ae04b6a0b19ce31e8c95979e4bf2e26c72747bd9bfad8dfb426c45"),
    76: (258_365, "b557954c326d243893b3efc1c28e3b6eba2288769300de459d83465903e312e2"),
    106: (206_413, "49293d90c12031125ba1f3c684b7445686c24985e64f161ddfc98ce5461ff6fe"),
    135: (235_647, "c8bf2407d25539409f687adb18a20e67e70b08d8ec0e200d6dbeeeb6badf1390"),
    165: (202_888, "d31f6ba3e7dab1f5ad6c5b30a878369d2ea93e4be7c1c69fc20d6333acb50712"),
    195: (243_630, "7bfd6c19b6789399bfb5440b3a2a802eca82186d99d802ecb8a3903392f9d004"),
    225: (229_763, "0a72bf224e1804338662e4a78953dbde1a2e7262ab67664568fb6019bbeba7ef"),
    255: (266_209, "9c415c3945dde70895abba28b5cd97f51fbd05f64ed83f170704741db38ebed4"),
    285: (222_762, "b512a5e260f1c7bcb52772f9ddafc3fa1377fb9b7e2cce23dc961ac72301f319"),
    356: (232_802, "685260cc8b4b76b2f598c2247c88eebc8d623ff7f208084c4862c7e9566c483f"),
    370: (233_014, "1de9889916d194b92ab5a7c8de342dd9689864dc44d8de4835995038cd49f607"),
    405: (232_879, "ba6e0ec4508af17a7623e39aa494cbdfef7dd7d2733d419f590b2aff904cac41"),
    450: (200_354, "41022b37f01d6e5a43faf18ac2d943c6ae3e4e72e2fa6ffde9cdbe812c9a8da4"),
    480: (117_660, "1c431302d1f086334a2937cf3f4fb06ce0a7ccbf446922d5b6eb2dbe2256b953"),
    500: (53_761, "a040930490201bee401061c31d981ee6106e53eb6f9d1871d20e0aabbdf651c1"),
}

# These are the exact thirteen geometry objects directly linked to the
# accepted REFINED_CRT_ASSEMBLY collection.  The empty assembly root and all
# nested detail collections are intentionally excluded from this cabinet-scale
# authority.  Thirteen objects x eight evaluated bound-box corners = 104
# projected points per frame and per optical state.
CRT_GEOMETRY_OBJECTS = (
    "CRT_CabinetPartingSeam",
    "CRT_ConvexThickSmokedGlass",
    "CRT_InternalPhosphorLayer",
    "CRT_LowerBandUpperShadowSeam",
    "CRT_LowerSpeakerControlBand",
    "CRT_RecessedGlassGasket",
    "CRT_RefinedDeepMouldedCabinetShell",
    "CRT_RestrainedHiddenFoot_01",
    "CRT_RestrainedHiddenFoot_02",
    "CRT_RestrainedHiddenFoot_03",
    "CRT_RestrainedHiddenFoot_04",
    "CRT_ThickProtectiveBezel",
    "CRT_WakeHorizontalPhosphorLine",
)

MOBILE_CABLE_COLLECTION = "PHASE4R1V2_CABLE_MOBILE"
CABLE_COLLECTIONS = {
    "desktop": "PHASE4R1V2_CABLE_DESKTOP",
    "mobile": MOBILE_CABLE_COLLECTION,
    "landscape": "PHASE4R1V2_CABLE_LANDSCAPE",
}
FRAME_NAME = re.compile(r"^F(?P<frame>\d{3})\.png$")

CAMERA_NON_LENS_PROJECTION_FIELDS = (
    "type",
    "sensor_fit",
    "sensor_width",
    "sensor_height",
    "shift_x",
    "shift_y",
    "clip_start",
    "clip_end",
    "ortho_scale",
    "lens_unit",
    "panorama_type",
    "fisheye_fov",
    "fisheye_lens",
    "fisheye_polynomial_k0",
    "fisheye_polynomial_k1",
    "fisheye_polynomial_k2",
    "fisheye_polynomial_k3",
    "fisheye_polynomial_k4",
    "latitude_min",
    "latitude_max",
    "longitude_min",
    "longitude_max",
    "central_cylindrical_range_u_min",
    "central_cylindrical_range_u_max",
    "central_cylindrical_range_v_min",
    "central_cylindrical_range_v_max",
    "central_cylindrical_radius",
    "custom_mode",
    "custom_filepath",
)
FINALIZATION_MODES = {
    "physical-f001-f500": {
        "start": 1,
        "end": 500,
        "filename": "mobile-390x844-physical-F001-F500.mp4",
        "role": "complete physical-only mobile review animatic; excludes F501-F540",
    },
    "orbit-f001-f285": {
        "start": 1,
        "end": 285,
        "filename": "mobile-390x844-orbit-F001-F285.mp4",
        "role": "focused opening and complete authored mobile orbit excerpt",
    },
}


def rounded(value: float, digits: int = 8) -> float:
    return round(float(value), digits)


def vector(values: Iterable[float], digits: int = 8) -> list[float]:
    return [rounded(value, digits) for value in values]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_record(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise RuntimeError(f"missing file authority: {path}")
    return {"bytes": path.stat().st_size, "sha256": sha256(path)}


def canonical_hash(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("ascii")
    return hashlib.sha256(payload).hexdigest()


def atomic_text(path: Path, value: str) -> None:
    pending = path.with_name(path.name + ".pending")
    if pending.exists():
        raise RuntimeError(f"stale text staging file: {pending.name}")
    try:
        pending.write_text(value, encoding="utf-8", newline="\n")
        if pending.read_text(encoding="utf-8") != value:
            raise RuntimeError(f"text staging self-validation failed: {path.name}")
        os.replace(pending, path)
    finally:
        pending.unlink(missing_ok=True)


def atomic_json(path: Path, value: dict[str, Any]) -> None:
    pending = path.with_name(path.name + ".pending")
    if pending.exists():
        raise RuntimeError(f"stale JSON staging file: {pending.name}")
    serialized = json.dumps(value, indent=2, sort_keys=True) + "\n"
    try:
        pending.write_text(serialized, encoding="utf-8", newline="\n")
        parsed = json.loads(pending.read_text(encoding="utf-8"))
        if parsed != value:
            raise RuntimeError(f"JSON staging self-validation failed: {path.name}")
        os.replace(pending, path)
    finally:
        pending.unlink(missing_ok=True)


def png_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as handle:
        header = handle.read(24)
    if len(header) != 24 or header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        raise RuntimeError(f"invalid PNG authority: {path.name}")
    return int.from_bytes(header[16:20], "big"), int.from_bytes(header[20:24], "big")


def mp4_header_valid(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 1024:
        return False
    with path.open("rb") as handle:
        header = handle.read(16)
    return len(header) >= 12 and header[4:8] == b"ftyp"


def relative_output_path(root: Path, path: Path) -> str:
    resolved = path.resolve()
    if resolved != root and root not in resolved.parents:
        raise RuntimeError(f"output escaped its external root: {path}")
    return resolved.relative_to(root).as_posix()


def output_record(root: Path, path: Path, **metadata: Any) -> dict[str, Any]:
    record = {"path": relative_output_path(root, path), **file_record(path), **metadata}
    if path.suffix.lower() == ".png":
        width, height = png_dimensions(path)
        record.update({"mediaType": "image/png", "width": width, "height": height})
    elif path.suffix.lower() == ".svg":
        record["mediaType"] = "image/svg+xml"
    elif path.suffix.lower() == ".html":
        record["mediaType"] = "text/html"
    elif path.suffix.lower() == ".csv":
        record["mediaType"] = "text/csv"
    elif path.suffix.lower() == ".json":
        record["mediaType"] = "application/json"
    elif path.suffix.lower() == ".mp4":
        record["mediaType"] = "video/mp4"
    return record


def ensure_external(path: Path) -> Path:
    output = path.resolve()
    repository = cfg.REPO_ROOT.resolve()
    if output == repository or repository in output.parents:
        raise RuntimeError("mobile diagnostic output must remain external to Git")
    if output == output.anchor or len(output.parts) < 3:
        raise RuntimeError("refusing a broad mobile diagnostic output root")
    return output


def create_fresh_root(value: str) -> Path:
    output = ensure_external(Path(value))
    if output.exists():
        raise RuntimeError("audit output root must be fresh and absent")
    output.mkdir(parents=True)
    return output


def require_existing_root(value: str) -> Path:
    output = ensure_external(Path(value))
    if not output.is_dir():
        raise RuntimeError("animatic continuation requires an existing audited output root")
    return output


def visual_evidence_role(frame: int) -> str:
    return VISUAL_EVIDENCE_ROLES.get(frame, "projected-scale milestone")


def validate_accepted_r1_mobile_root(value: str) -> dict[str, Any]:
    """Validate the external accepted R1 frames without serializing their root."""
    root = ensure_external(Path(value))
    if not root.is_dir():
        raise RuntimeError("accepted R1 mobile physical-frame root is absent")
    expected_names = {ACCEPTED_R1_MOBILE_MANIFEST_BASENAME}
    expected_names.update(f"F{frame:03d}.png" for frame in range(1, 501))
    entries = list(root.iterdir())
    if (
        len(entries) != 501
        or any(entry.is_symlink() or not entry.is_file() for entry in entries)
        or {entry.name for entry in entries} != expected_names
    ):
        raise RuntimeError("accepted R1 mobile root is not the exhaustive 500-frame plus manifest authority")

    manifest_path = root / ACCEPTED_R1_MOBILE_MANIFEST_BASENAME
    payload = manifest_path.read_bytes()
    manifest_file = {"bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest()}
    if manifest_file != {
        "bytes": ACCEPTED_R1_MOBILE_MANIFEST_BYTES,
        "sha256": ACCEPTED_R1_MOBILE_MANIFEST_SHA256,
    }:
        raise RuntimeError("accepted R1 mobile manifest byte authority differs")
    try:
        manifest = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("accepted R1 mobile manifest is not valid UTF-8 JSON") from error
    if (
        manifest.get("schema") != ACCEPTED_R1_MOBILE_MANIFEST_SCHEMA
        or manifest.get("status") != "PASS"
        or manifest.get("family") != "mobile"
        or manifest.get("expectedFrameCount") != 500
        or manifest.get("renderedFrameCount") != 500
        or manifest.get("timeline") != {
            "fps": 30,
            "frameEnd": 500,
            "frameStart": 1,
            "physicalOnly": True,
        }
    ):
        raise RuntimeError("accepted R1 mobile manifest PASS/schema/timeline authority differs")
    expected_source = {
        "path": cfg.ACCEPTED_R1_SOURCE.relative_to(cfg.REPO_ROOT).as_posix(),
        "bytes": cfg.ACCEPTED_R1_BYTES,
        "sha256": cfg.ACCEPTED_R1_SHA256,
    }
    if manifest.get("sourceAuthorities", {}).get("derivative") != expected_source:
        raise RuntimeError("accepted R1 mobile manifest binds the wrong source derivative")

    manifest_files = manifest.get("files")
    if not isinstance(manifest_files, list) or len(manifest_files) != 500:
        raise RuntimeError("accepted R1 mobile manifest is not exhaustive")
    records_by_frame: dict[int, dict[str, Any]] = {}
    for record in manifest_files:
        if not isinstance(record, dict) or isinstance(record.get("frame"), bool):
            raise RuntimeError("accepted R1 mobile manifest contains a malformed frame record")
        try:
            frame = int(record["frame"])
        except (KeyError, TypeError, ValueError) as error:
            raise RuntimeError("accepted R1 mobile manifest contains a malformed frame number") from error
        required = {
            "frame": frame,
            "path": f"F{frame:03d}.png",
            "family": "mobile",
            "role": "physical-frame",
            "mediaType": "image/png",
            "width": WIDTH,
            "height": HEIGHT,
        }
        if frame in records_by_frame or any(record.get(key) != expected for key, expected in required.items()):
            raise RuntimeError(f"accepted R1 mobile manifest frame topology differs at F{frame:03d}")
        if not isinstance(record.get("bytes"), int) or record["bytes"] <= 0:
            raise RuntimeError(f"accepted R1 mobile manifest byte record differs at F{frame:03d}")
        if not re.fullmatch(r"[0-9a-f]{64}", str(record.get("sha256", ""))):
            raise RuntimeError(f"accepted R1 mobile manifest hash record differs at F{frame:03d}")
        disk_path = root / required["path"]
        if file_record(disk_path) != {"bytes": record["bytes"], "sha256": record["sha256"]}:
            raise RuntimeError(f"accepted R1 mobile disk bytes differ at F{frame:03d}")
        if png_dimensions(disk_path) != (WIDTH, HEIGHT):
            raise RuntimeError(f"accepted R1 mobile disk raster differs at F{frame:03d}")
        records_by_frame[frame] = record
    if set(records_by_frame) != set(range(1, 501)):
        raise RuntimeError("accepted R1 mobile manifest does not cover exactly F001-F500")

    if set(ACCEPTED_R1_MOBILE_SELECTED_FRAMES) != set(VISUAL_EVIDENCE_FRAMES):
        raise RuntimeError("internal accepted R1 visual-evidence authority is incomplete")
    selected: list[dict[str, Any]] = []
    for frame in VISUAL_EVIDENCE_FRAMES:
        expected_bytes, expected_sha = ACCEPTED_R1_MOBILE_SELECTED_FRAMES[frame]
        record = records_by_frame[frame]
        if record.get("bytes") != expected_bytes or record.get("sha256") != expected_sha:
            raise RuntimeError(f"accepted R1 mobile selected manifest record differs at F{frame:03d}")
        disk_path = root / f"F{frame:03d}.png"
        if file_record(disk_path) != {"bytes": expected_bytes, "sha256": expected_sha}:
            raise RuntimeError(f"accepted R1 mobile selected disk bytes differ at F{frame:03d}")
        if png_dimensions(disk_path) != (WIDTH, HEIGHT):
            raise RuntimeError(f"accepted R1 mobile selected raster differs at F{frame:03d}")
        selected.append({
            "frame": frame,
            "path": f"F{frame:03d}.png",
            "role": visual_evidence_role(frame),
            "bytes": expected_bytes,
            "sha256": expected_sha,
            "width": WIDTH,
            "height": HEIGHT,
        })
    authority = {
        "role": "accepted R1 mobile physical-frame authority",
        "schema": ACCEPTED_R1_MOBILE_MANIFEST_SCHEMA,
        "status": "PASS",
        "manifest": {
            "basename": ACCEPTED_R1_MOBILE_MANIFEST_BASENAME,
            **manifest_file,
        },
        "source": {
            "role": "accepted R1 derivative",
            "bytes": cfg.ACCEPTED_R1_BYTES,
            "sha256": cfg.ACCEPTED_R1_SHA256,
        },
        "inventory": {"frameCount": 500, "fileCount": 501, "directoryCount": 0},
        "selectedFrames": selected,
        "absoluteRootStored": False,
    }
    validate_sanitized_accepted_r1_mobile_authority(authority)
    return authority


def validate_sanitized_accepted_r1_mobile_authority(authority: Any) -> None:
    if not isinstance(authority, dict) or set(authority) != {
        "role",
        "schema",
        "status",
        "manifest",
        "source",
        "inventory",
        "selectedFrames",
        "absoluteRootStored",
    }:
        raise RuntimeError("sanitized accepted R1 mobile authority topology differs")
    if (
        authority.get("role") != "accepted R1 mobile physical-frame authority"
        or authority.get("schema") != ACCEPTED_R1_MOBILE_MANIFEST_SCHEMA
        or authority.get("status") != "PASS"
        or authority.get("manifest") != {
            "basename": ACCEPTED_R1_MOBILE_MANIFEST_BASENAME,
            "bytes": ACCEPTED_R1_MOBILE_MANIFEST_BYTES,
            "sha256": ACCEPTED_R1_MOBILE_MANIFEST_SHA256,
        }
        or authority.get("source") != {
            "role": "accepted R1 derivative",
            "bytes": cfg.ACCEPTED_R1_BYTES,
            "sha256": cfg.ACCEPTED_R1_SHA256,
        }
        or authority.get("inventory") != {"frameCount": 500, "fileCount": 501, "directoryCount": 0}
        or authority.get("absoluteRootStored") is not False
    ):
        raise RuntimeError("sanitized accepted R1 mobile authority differs")
    expected_selected = []
    for frame in VISUAL_EVIDENCE_FRAMES:
        size, digest = ACCEPTED_R1_MOBILE_SELECTED_FRAMES[frame]
        expected_selected.append({
            "frame": frame,
            "path": f"F{frame:03d}.png",
            "role": visual_evidence_role(frame),
            "bytes": size,
            "sha256": digest,
            "width": WIDTH,
            "height": HEIGHT,
        })
    if authority.get("selectedFrames") != expected_selected:
        raise RuntimeError("sanitized accepted R1 mobile selected-frame authority differs")


def normalized_keys(value: Sequence[Sequence[float]]) -> tuple[tuple[int, float], ...]:
    try:
        result = tuple((int(frame), float(lens)) for frame, lens in value)
    except (TypeError, ValueError) as error:
        raise RuntimeError("malformed mobile lens-key authority") from error
    if any(frame < 1 or frame > 540 for frame, _ in result):
        raise RuntimeError("mobile lens key falls outside the accepted 540-frame timeline")
    if any(right[0] <= left[0] for left, right in zip(result, result[1:])):
        raise RuntimeError("mobile lens keys are not strictly frame ordered")
    return result


def validate_config_authority() -> dict[str, Any]:
    expected_scalars = {
        "MOBILE_CAMERA_OBJECT": EXPECTED_CAMERA_OBJECT,
        "MOBILE_CAMERA_DATA": EXPECTED_CAMERA_DATA,
        "MOBILE_CAMERA_ACTION": EXPECTED_CAMERA_ACTION,
        "MOBILE_AIM_OBJECT": EXPECTED_AIM_OBJECT,
        "MOBILE_ORBIT_RIG": EXPECTED_ORBIT_RIG,
        "MOBILE_CAMERA_OBJECT_SLOT_IDENTIFIER": EXPECTED_CAMERA_OBJECT_SLOT_IDENTIFIER,
        "MOBILE_CAMERA_DATA_SLOT_IDENTIFIER": EXPECTED_CAMERA_DATA_SLOT_IDENTIFIER,
    }
    for name, expected in expected_scalars.items():
        if not hasattr(cfg, name) or getattr(cfg, name) != expected:
            raise RuntimeError(f"missing or divergent exact config authority: {name}")
    if not hasattr(cfg, "MOBILE_R1_LENS_KEYS") or normalized_keys(cfg.MOBILE_R1_LENS_KEYS) != EXPECTED_R1_LENS_KEYS:
        raise RuntimeError("exact accepted R1 mobile focal curve is absent or divergent")
    if not hasattr(cfg, "MOBILE_R1_1_LENS_KEYS") or normalized_keys(cfg.MOBILE_R1_1_LENS_KEYS) != EXPECTED_R11_LENS_KEYS:
        raise RuntimeError("exact R1.1 mobile focal curve is absent or divergent")
    if not hasattr(cfg, "MOBILE_SCALE_MILESTONE_FRAMES") or tuple(cfg.MOBILE_SCALE_MILESTONE_FRAMES) != EXPECTED_MILESTONES:
        raise RuntimeError("exact thirteen-frame mobile projected-scale authority is absent or divergent")
    if "mobile" not in tuple(getattr(cfg, "STAGE_ORDER", ())):
        raise RuntimeError("mobile is absent from the cumulative source-build stage order")
    return {
        **expected_scalars,
        "r1LensKeys": [list(item) for item in EXPECTED_R1_LENS_KEYS],
        "r1_1LensKeys": [list(item) for item in EXPECTED_R11_LENS_KEYS],
        "milestoneFrames": list(EXPECTED_MILESTONES),
        "visualEvidenceFrames": list(VISUAL_EVIDENCE_FRAMES),
    }


def validate_source_build_mobile_stage(build: dict[str, Any]) -> dict[str, Any]:
    stage = build.get("stages", {}).get("mobile")
    if not isinstance(stage, dict):
        raise RuntimeError("source-build lacks the exact mobile-stage record")
    expected_before = [{"frame": frame, "millimeters": lens} for frame, lens in EXPECTED_R1_LENS_KEYS]
    expected_after = [{"frame": frame, "millimeters": lens} for frame, lens in EXPECTED_R11_LENS_KEYS]
    exact_values = {
        "repair": "mobile camera lens F-curve values only",
        "cameraObject": EXPECTED_CAMERA_OBJECT,
        "cameraData": EXPECTED_CAMERA_DATA,
        "action": EXPECTED_CAMERA_ACTION,
        "aimObject": EXPECTED_AIM_OBJECT,
        "orbitRig": EXPECTED_ORBIT_RIG,
        "milestoneFrames": list(EXPECTED_MILESTONES),
        "actionExceptLensUnchanged": True,
        "mobileCameraFullChanged": True,
        "mobileCameraExceptLensUnchanged": True,
        "exactChangedPreservationAuthorities": ["mobileCameraFull"],
        "sceneFrameRestored": True,
        "postSaveAuthorityExact": True,
    }
    divergent = [name for name, expected in exact_values.items() if stage.get(name) != expected]
    if divergent:
        raise RuntimeError(f"through-mobile source-build stage is divergent: {divergent}")
    before = stage.get("lensKeysBefore")
    after = stage.get("lensKeysAfter")
    post_save = stage.get("postSaveLensKeys")
    for label, record, expected in (
        ("lensKeysBefore", before, expected_before),
        ("lensKeysAfter", after, expected_after),
        ("postSaveLensKeys", post_save, expected_after),
    ):
        if (
            not isinstance(record, dict)
            or record.get("dataPath") != "lens"
            or record.get("arrayIndex") != 0
            or record.get("extrapolation") != "CONSTANT"
            or record.get("interpolation") != "LINEAR"
            or record.get("handleType") != "AUTO_CLAMPED"
            or record.get("modifierCount") != 0
            or record.get("keys") != expected
        ):
            raise RuntimeError(f"source-build {label} is not the exact focal authority")
    if stage.get("actionExceptLensBefore") != stage.get("actionExceptLensAfter"):
        raise RuntimeError("source-build changed shared action topology or a non-lens mobile channel")
    if stage.get("postSaveActionExceptLensAuthority") != stage.get("actionExceptLensAfter"):
        raise RuntimeError("post-save shared mobile action authority is stale")
    if stage.get("postSaveActionAuthority") != stage.get("actionAuthorityAfter"):
        raise RuntimeError("post-save full repaired mobile action authority is stale")
    if stage.get("postSaveLensEvaluations") != stage.get("lensEvaluationsAfter"):
        raise RuntimeError("post-save repaired mobile focal evaluations are stale")
    for label in ("lensEvaluationsBefore", "lensEvaluationsAfter", "postSaveLensEvaluations"):
        if stage.get(label, {}).get("allEvaluationsExact") is not True:
            raise RuntimeError(f"source-build {label} is not exact")
    preservation = build.get("preservation", {})
    unchanged = preservation.get("unchanged", {})
    if (
        unchanged.get("mobileCameraFull") is not False
        or unchanged.get("mobileCameraExceptLens") is not True
        or unchanged.get("desktopCamera") is not True
        or unchanged.get("landscapeCamera") is not True
    ):
        raise RuntimeError("source-build camera-family preservation allowlist is divergent")
    return stage


def authority_snapshot() -> tuple[dict[str, Any], dict[str, Any]]:
    if tuple(bpy.app.version) != EXPECTED_BLENDER:
        raise RuntimeError(f"mobile diagnostic requires Blender 5.2.0, got {bpy.app.version_string}")
    config_authority = validate_config_authority()
    opened = Path(bpy.data.filepath).resolve()
    if opened != cfg.DERIVATIVE.resolve():
        raise RuntimeError("mobile diagnostic must open the exact isolated R1.1 derivative")
    build = json.loads(cfg.BUILD_REPORT.read_text(encoding="utf-8"))
    if build.get("status") != "PASS" or build.get("throughStage") != "mobile":
        raise RuntimeError("exact PASS through-mobile source-build authority is absent or stale")
    validate_source_build_mobile_stage(build)
    derivative_actual = file_record(opened)
    derivative_expected = {key: build.get("derivative", {}).get(key) for key in ("bytes", "sha256")}
    if derivative_actual != derivative_expected:
        raise RuntimeError("opened derivative differs from the through-mobile source-build authority")
    accepted_actual = file_record(cfg.ACCEPTED_R1_SOURCE)
    if accepted_actual != {"bytes": cfg.ACCEPTED_R1_BYTES, "sha256": cfg.ACCEPTED_R1_SHA256}:
        raise RuntimeError("accepted R1 counterfactual source bytes are absent or divergent")
    producer_records: dict[str, Any] = {}
    for role in ("builder", "config"):
        expected = build.get("producerAuthorities", {}).get(role)
        if not isinstance(expected, dict) or set(expected) != {"path", "bytes", "sha256"}:
            raise RuntimeError(f"malformed source-build producer binding: {role}")
        path = cfg.REPO_ROOT / expected["path"]
        actual = {"path": expected["path"], **file_record(path)}
        if actual != expected:
            raise RuntimeError(f"stale source-build producer authority: {role}")
        producer_records[role] = actual
    if build.get("authorization") != cfg.AUTHORIZATION or any(bool(value) for value in cfg.AUTHORIZATION.values()):
        raise RuntimeError("mobile diagnostic authorization boundary is divergent or expanded")
    timeline = {
        "frameStart": int(bpy.context.scene.frame_start),
        "frameEnd": int(bpy.context.scene.frame_end),
        "fps": int(bpy.context.scene.render.fps),
        "fpsBase": rounded(bpy.context.scene.render.fps_base),
    }
    if timeline != {"frameStart": 1, "frameEnd": 540, "fps": 30, "fpsBase": 1.0}:
        raise RuntimeError(f"accepted 540-frame timeline authority changed: {timeline}")
    completed = json.loads(str(bpy.context.scene.get("phase4r1_1_completed_stages", "[]")))
    if not isinstance(completed, list) or not {"periphery", "cable", "mobile"}.issubset(set(completed)):
        raise RuntimeError("saved derivative does not identify the cumulative mobile stage as complete")
    files = {
        "acceptedR1Source": {"path": cfg.ACCEPTED_R1_SOURCE.relative_to(cfg.REPO_ROOT).as_posix(), **accepted_actual},
        "derivative": {"path": cfg.DERIVATIVE.relative_to(cfg.REPO_ROOT).as_posix(), **derivative_actual},
        "sourceBuild": {"path": cfg.BUILD_REPORT.relative_to(cfg.REPO_ROOT).as_posix(), **file_record(cfg.BUILD_REPORT)},
        "builder": producer_records["builder"],
        "config": producer_records["config"],
        "producer": {"path": Path(__file__).resolve().relative_to(cfg.REPO_ROOT).as_posix(), **file_record(Path(__file__).resolve())},
    }
    return build, {
        "files": files,
        "config": config_authority,
        "timeline": timeline,
        "blender": {"version": bpy.app.version_string, "versionTuple": list(bpy.app.version)},
    }


def records_unchanged(authorities: dict[str, Any]) -> bool:
    for role, expected in authorities["files"].items():
        path = cfg.REPO_ROOT / expected["path"]
        if file_record(path) != {key: expected[key] for key in ("bytes", "sha256")}:
            raise RuntimeError(f"diagnostic changed or outlived its bound source authority: {role}")
    return True


def iter_action_fcurves(action: bpy.types.Action):
    legacy = getattr(action, "fcurves", None)
    if legacy is not None:
        try:
            values = list(legacy)
        except (AttributeError, RuntimeError, TypeError):
            values = []
        if values:
            yield from values
            return
    seen: set[int] = set()
    for layer in getattr(action, "layers", ()):
        for strip in getattr(layer, "strips", ()):
            for channelbag in getattr(strip, "channelbags", ()):
                for curve in getattr(channelbag, "fcurves", ()):
                    identity = id(curve)
                    if identity not in seen:
                        seen.add(identity)
                        yield curve


def exact_mobile_action_topology(
    camera: bpy.types.Object,
    data: bpy.types.Camera,
) -> tuple[dict[str, Any], Any]:
    object_animation = camera.animation_data
    data_animation = data.animation_data
    action = bpy.data.actions.get(cfg.MOBILE_CAMERA_ACTION)
    if (
        action is None
        or object_animation is None
        or data_animation is None
        or object_animation.action is not action
        or data_animation.action is not action
        or object_animation.action_slot is None
        or data_animation.action_slot is None
    ):
        raise RuntimeError("mobile camera object/data do not share the exact layered action")
    if list(getattr(object_animation, "nla_tracks", ())) or list(getattr(data_animation, "nla_tracks", ())):
        raise RuntimeError("mobile camera object/data have unexpected NLA tracks")
    object_slot = object_animation.action_slot
    data_slot = data_animation.action_slot
    slots = list(action.slots)
    expected_slots = {
        (EXPECTED_CAMERA_OBJECT_SLOT_IDENTIFIER, "OBJECT"),
        (EXPECTED_CAMERA_DATA_SLOT_IDENTIFIER, "CAMERA"),
    }
    if (
        len(slots) != 2
        or {(str(slot.identifier), str(slot.target_id_type)) for slot in slots} != expected_slots
        or str(object_slot.identifier) != EXPECTED_CAMERA_OBJECT_SLOT_IDENTIFIER
        or str(object_slot.target_id_type) != "OBJECT"
        or str(data_slot.identifier) != EXPECTED_CAMERA_DATA_SLOT_IDENTIFIER
        or str(data_slot.target_id_type) != "CAMERA"
        or int(object_slot.handle) == int(data_slot.handle)
    ):
        raise RuntimeError("mobile camera layered-action two-slot topology differs")
    layers = list(action.layers)
    if len(layers) != 1:
        raise RuntimeError("mobile camera action does not have exactly one layer")
    strips = list(layers[0].strips)
    if len(strips) != 1 or strips[0].type != "KEYFRAME":
        raise RuntimeError("mobile camera action does not have exactly one KEYFRAME strip")
    bags = list(strips[0].channelbags)
    expected_handles = {int(object_slot.handle), int(data_slot.handle)}
    if len(bags) != 2 or {int(bag.slot_handle) for bag in bags} != expected_handles:
        raise RuntimeError("mobile camera action does not have the exact two channelbags")
    by_handle = {int(bag.slot_handle): bag for bag in bags}
    object_bag = by_handle[int(object_slot.handle)]
    data_bag = by_handle[int(data_slot.handle)]
    object_curve_keys = sorted((curve.data_path, int(curve.array_index)) for curve in object_bag.fcurves)
    data_curve_keys = sorted((curve.data_path, int(curve.array_index)) for curve in data_bag.fcurves)
    if object_curve_keys != [("location", 0), ("location", 1), ("location", 2)]:
        raise RuntimeError(f"mobile object channel topology differs: {object_curve_keys}")
    if data_curve_keys != [("lens", 0), ("shift_x", 0), ("shift_y", 0)]:
        raise RuntimeError(f"mobile camera-data channel topology differs: {data_curve_keys}")
    curves = [*object_bag.fcurves, *data_bag.fcurves]
    point_count = sum(len(curve.keyframe_points) for curve in curves)
    if len(curves) != 6 or point_count != 82:
        raise RuntimeError(f"mobile action must have exactly 6 curves and 82 points, got {len(curves)}/{point_count}")
    lens_curves = [
        curve
        for curve in data_bag.fcurves
        if curve.data_path == "lens" and int(curve.array_index) == 0
    ]
    if len(lens_curves) != 1:
        raise RuntimeError("mobile camera action does not contain exactly one lens F-curve")
    topology = {
        "action": action.name,
        "slotCount": len(slots),
        "slots": sorted(
            ({"identifier": str(slot.identifier), "targetIdType": str(slot.target_id_type)} for slot in slots),
            key=lambda item: item["identifier"],
        ),
        "layerCount": len(layers),
        "stripCount": len(strips),
        "stripType": strips[0].type,
        "channelbagCount": len(bags),
        "curveCount": len(curves),
        "keyframePointCount": point_count,
        "objectCurves": [{"dataPath": path, "arrayIndex": index} for path, index in object_curve_keys],
        "dataCurves": [{"dataPath": path, "arrayIndex": index} for path, index in data_curve_keys],
    }
    return topology, lens_curves[0]


def exact_mobile_objects() -> tuple[
    bpy.types.Object,
    bpy.types.Camera,
    bpy.types.Object,
    bpy.types.Object,
    dict[str, Any],
]:
    camera = bpy.data.objects.get(cfg.MOBILE_CAMERA_OBJECT)
    data = bpy.data.cameras.get(cfg.MOBILE_CAMERA_DATA)
    aim = bpy.data.objects.get(cfg.MOBILE_AIM_OBJECT)
    rig = bpy.data.objects.get(cfg.MOBILE_ORBIT_RIG)
    if camera is None or camera.type != "CAMERA" or data is None or camera.data != data:
        raise RuntimeError("exact mobile camera object/data binding is missing")
    if (
        aim is None
        or rig is None
        or camera.parent is None
        or camera.parent.as_pointer() != rig.as_pointer()
        or camera.parent_type != "OBJECT"
        or camera.parent_bone != ""
    ):
        raise RuntimeError("exact mobile aim/rig/parent binding is missing")
    topology, curve = exact_mobile_action_topology(camera, data)
    object_animation = camera.animation_data
    data_animation = data.animation_data
    assert object_animation is not None and data_animation is not None
    object_drivers = list(getattr(object_animation, "drivers", ()))
    data_drivers = list(getattr(data_animation, "drivers", ()))
    if object_drivers or data_drivers:
        raise RuntimeError("mobile camera object/data must have zero drivers")
    if (
        data.type != "PERSP"
        or data.sensor_fit != "AUTO"
        or abs(float(data.sensor_width) - 36.0) > 1e-9
        or abs(float(data.sensor_height) - 24.0) > 1e-9
        or abs(float(data.clip_start) - 0.005) > 1e-9
        or abs(float(data.clip_end) - 1000.0) > 1e-9
    ):
        raise RuntimeError("mobile saved perspective/sensor/clip authority differs")
    constraints = list(camera.constraints)
    constraint = camera.constraints.get("Phase4R1_AuditableLookAtAcceptedCRT")
    if (
        len(constraints) != 1
        or constraint is None
        or constraints[0].as_pointer() != constraint.as_pointer()
        or constraint.name != "Phase4R1_AuditableLookAtAcceptedCRT"
        or constraint.type != "TRACK_TO"
        or constraint.target is None
        or constraint.target.as_pointer() != aim.as_pointer()
        or constraint.track_axis != "TRACK_NEGATIVE_Z"
        or constraint.up_axis != "UP_Y"
        or constraint.owner_space != "WORLD"
        or constraint.target_space != "WORLD"
        or abs(float(constraint.influence) - 1.0) > 1e-9
        or bool(constraint.mute)
        or constraint.subtarget != ""
        or bool(constraint.use_target_z)
    ):
        raise RuntimeError("mobile saved auditable TRACK_TO authority differs")
    topology["savedCamera"] = {
        "object": camera.name,
        "data": data.name,
        "parent": rig.name,
        "parentType": camera.parent_type,
        "parentBone": camera.parent_bone,
        "objectDriverCount": len(object_drivers),
        "cameraDataDriverCount": len(data_drivers),
        "objectNlaTrackCount": len(object_animation.nla_tracks),
        "cameraDataNlaTrackCount": len(data_animation.nla_tracks),
        "projection": {
            "type": data.type,
            "sensorFit": data.sensor_fit,
            "sensorWidthMillimeters": rounded(data.sensor_width),
            "sensorHeightMillimeters": rounded(data.sensor_height),
            "clipStartMeters": rounded(data.clip_start),
            "clipEndMeters": rounded(data.clip_end),
        },
        "constraints": [{
            "name": constraint.name,
            "type": constraint.type,
            "target": constraint.target.name,
            "trackAxis": constraint.track_axis,
            "upAxis": constraint.up_axis,
            "ownerSpace": constraint.owner_space,
            "targetSpace": constraint.target_space,
            "influence": rounded(constraint.influence),
            "mute": bool(constraint.mute),
            "subtarget": constraint.subtarget,
            "useTargetZ": bool(constraint.use_target_z),
        }],
    }
    keys = tuple((int(round(point.co.x)), float(point.co.y)) for point in curve.keyframe_points)
    if any(abs(point.co.x - round(point.co.x)) > 1e-6 for point in curve.keyframe_points):
        raise RuntimeError("mobile lens curve contains a non-integral keyframe")
    if len(keys) != len(EXPECTED_R11_LENS_KEYS) or any(
        actual[0] != expected[0] or abs(actual[1] - expected[1]) > FLOAT_TOLERANCE
        for actual, expected in zip(keys, EXPECTED_R11_LENS_KEYS)
    ):
        raise RuntimeError(f"saved mobile lens keys differ from exact R1.1 authority: {keys}")
    if curve.extrapolation != "CONSTANT" or curve.mute or curve.lock or curve.group is not None or list(curve.modifiers):
        raise RuntimeError("mobile lens curve extrapolation/mute/modifier authority changed")
    if any(
        point.interpolation != "LINEAR"
        or point.easing != "AUTO"
        or point.handle_left_type != "AUTO_CLAMPED"
        or point.handle_right_type != "AUTO_CLAMPED"
        for point in curve.keyframe_points
    ):
        raise RuntimeError("mobile lens curve interpolation/easing/handle authority changed")
    return camera, data, aim, rig, topology


def exact_crt_geometry() -> list[bpy.types.Object]:
    collection = bpy.data.collections.get("REFINED_CRT_ASSEMBLY")
    if collection is None:
        raise RuntimeError("accepted direct CRT assembly collection is missing")
    geometry = sorted(
        (obj for obj in collection.objects if obj.type in {"MESH", "CURVE", "SURFACE", "META", "FONT"}),
        key=lambda item: item.name,
    )
    if tuple(obj.name for obj in geometry) != CRT_GEOMETRY_OBJECTS:
        raise RuntimeError(f"exact thirteen-object CRT geometry authority changed: {[obj.name for obj in geometry]}")
    return geometry


def lens_at(keys: Sequence[tuple[int, float]], frame: int) -> float:
    if frame <= keys[0][0]:
        return float(keys[0][1])
    if frame >= keys[-1][0]:
        return float(keys[-1][1])
    for (left_frame, left_value), (right_frame, right_value) in zip(keys, keys[1:]):
        if left_frame <= frame <= right_frame:
            if right_frame == left_frame:
                return float(right_value)
            factor = (frame - left_frame) / (right_frame - left_frame)
            return float(left_value + (right_value - left_value) * factor)
    raise RuntimeError(f"could not evaluate focal authority at F{frame:03d}")


def stable_projection_value(value: Any) -> Any:
    if isinstance(value, float):
        return rounded(value, 10)
    if isinstance(value, (bool, int, str)) or value is None:
        return value
    if hasattr(value, "__len__"):
        try:
            return [stable_projection_value(item) for item in value]
        except (TypeError, ValueError):
            pass
    return str(value)


def non_lens_projection_record(data: bpy.types.Camera) -> dict[str, Any]:
    record: dict[str, Any] = {}
    for name in CAMERA_NON_LENS_PROJECTION_FIELDS:
        prop = data.bl_rna.properties.get(name)
        if prop is None or not hasattr(data, name):
            raise RuntimeError(f"Blender 5.2 camera lacks required non-lens projection field: {name}")
        record[name] = stable_projection_value(getattr(data, name))
    return record


def synchronize_non_lens_projection(source: bpy.types.Camera, target: bpy.types.Camera) -> dict[str, Any]:
    source_record = non_lens_projection_record(source)
    for name in CAMERA_NON_LENS_PROJECTION_FIELDS:
        prop = target.bl_rna.properties.get(name)
        if prop is None:
            raise RuntimeError(f"counterfactual camera lacks required projection field: {name}")
        if not prop.is_readonly:
            setattr(target, name, getattr(source, name))
    target_record = non_lens_projection_record(target)
    if target_record != source_record:
        divergent = sorted(name for name in source_record if source_record[name] != target_record.get(name))
        raise RuntimeError(f"R1 counterfactual non-lens projection fields diverged: {divergent}")
    return source_record


def matrix_values(matrix: Any) -> tuple[float, ...]:
    return tuple(float(value) for row in matrix for value in row)


def maximum_vector_delta(first: Sequence[float], second: Sequence[float]) -> float:
    if len(first) != len(second):
        return math.inf
    return max((abs(float(left) - float(right)) for left, right in zip(first, second)), default=0.0)


def evaluated_crt_points(objects: Sequence[bpy.types.Object]) -> tuple[list[Vector], list[dict[str, Any]]]:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points: list[Vector] = []
    records: list[dict[str, Any]] = []
    for source in objects:
        evaluated = source.evaluated_get(depsgraph)
        corners = [evaluated.matrix_world @ Vector(corner) for corner in evaluated.bound_box]
        if len(corners) != 8 or any(not all(math.isfinite(float(value)) for value in point) for point in corners):
            raise RuntimeError(f"invalid evaluated bound box: {source.name}")
        points.extend(corners)
        records.append({"object": source.name, "type": source.type, "evaluatedCornerCount": len(corners)})
    if len(points) != 104:
        raise RuntimeError(f"exact CRT projection must use 104 evaluated corners, got {len(points)}")
    return points, records


def projection_record(scene: bpy.types.Scene, camera: bpy.types.Object, points: Sequence[Vector]) -> dict[str, Any]:
    projected = [world_to_camera_view(scene, camera, point) for point in points]
    in_front = [point for point in projected if float(point.z) > 0.0]
    if not in_front:
        raise RuntimeError("all exact CRT cabinet corners project behind the mobile camera")
    minimum_x = min(float(point.x) for point in in_front)
    maximum_x = max(float(point.x) for point in in_front)
    minimum_y = min(float(point.y) for point in in_front)
    maximum_y = max(float(point.y) for point in in_front)
    clipped_minimum_y = max(0.0, minimum_y)
    clipped_maximum_y = min(1.0, maximum_y)
    raw_height = max(0.0, maximum_y - minimum_y)
    viewport_height = max(0.0, clipped_maximum_y - clipped_minimum_y)
    visible = [point for point in in_front if 0.0 <= point.x <= 1.0 and 0.0 <= point.y <= 1.0]
    return {
        "pointCount": len(projected),
        "inFrontCount": len(in_front),
        "visibleCornerCount": len(visible),
        "rawNdcBounds": [rounded(minimum_x), rounded(minimum_y), rounded(maximum_x), rounded(maximum_y)],
        "projectedCrtHeightPixels": rounded(raw_height * HEIGHT),
        "projectedCrtHeightPercent": rounded(raw_height * 100.0),
        "projectedCrtHeightViewportPixels": rounded(viewport_height * HEIGHT),
        "projectedCrtHeightViewportPercent": rounded(viewport_height * 100.0),
    }


def unwrap_angles(rows: list[dict[str, Any]]) -> None:
    prior_raw: float | None = None
    unwrapped: float | None = None
    for row in rows:
        raw = float(row.pop("_rawOrbitAngleDegrees"))
        if prior_raw is None:
            unwrapped = raw
        else:
            delta = raw - prior_raw
            while delta > 180.0:
                delta -= 360.0
            while delta < -180.0:
                delta += 360.0
            unwrapped = float(unwrapped) + delta
        prior_raw = raw
        row["orbitAngleDegreesUnwrapped"] = rounded(float(unwrapped))


def measure_optics(
    scene: bpy.types.Scene,
    camera: bpy.types.Object,
    repaired_data: bpy.types.Camera,
    baseline_data: bpy.types.Camera,
    aim: bpy.types.Object,
    geometry: Sequence[bpy.types.Object],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if baseline_data.animation_data is not None:
        raise RuntimeError("R1 counterfactual camera-data clone is not animation-free")
    sensor_fit = mobile_sensor_fit_proof(repaired_data)
    fixed_target = Vector((float(cfg.CENTRAL_ZONE_CENTRE_XY[0]), float(cfg.CENTRAL_ZONE_CENTRE_XY[1]), 0.425))
    rows: list[dict[str, Any]] = []
    max_counterfactual_transform_delta = 0.0
    object_records: list[dict[str, Any]] | None = None
    non_lens_projection_hashes: set[str] = set()
    converged_saved_evaluation_frames: list[int] = []
    for frame in range(AUDIT_FRAME_START, AUDIT_FRAME_END + 1):
        if camera.data != repaired_data:
            camera.data = repaired_data
        scene.frame_set(frame, subframe=0.0)
        bpy.context.view_layer.update()
        expected_r1_lens = lens_at(EXPECTED_R1_LENS_KEYS, frame)
        expected_repaired_lens = lens_at(EXPECTED_R11_LENS_KEYS, frame)
        schedules_identical = (
            frame >= 285
            and abs(expected_r1_lens - expected_repaired_lens) <= SCHEDULE_EQUALITY_TOLERANCE
        )
        actual_repaired_lens = float(repaired_data.lens)
        if abs(actual_repaired_lens - expected_repaired_lens) > FLOAT_TOLERANCE:
            raise RuntimeError(
                f"saved R1.1 focal evaluation diverges at F{frame:03d}: "
                f"{actual_repaired_lens} != {expected_repaired_lens}"
            )
        points, current_object_records = evaluated_crt_points(geometry)
        if object_records is None:
            object_records = current_object_records
        elif object_records != current_object_records:
            raise RuntimeError("evaluated CRT geometry-object inventory changed during sampling")
        camera_matrix_before = matrix_values(camera.matrix_world)
        aim_matrix_before = matrix_values(aim.matrix_world)
        position = camera.matrix_world.translation.copy()
        target_position = aim.matrix_world.translation.copy()
        relative = position - fixed_target
        live_non_lens_projection = non_lens_projection_record(repaired_data)
        repaired_projection = projection_record(scene, camera, points)

        camera.data = baseline_data
        synchronized_non_lens_projection = synchronize_non_lens_projection(repaired_data, baseline_data)
        if synchronized_non_lens_projection != live_non_lens_projection:
            raise RuntimeError(f"counterfactual projection synchronization changed live fields at F{frame:03d}")
        if schedules_identical:
            # The accepted and repaired schedules are mathematically identical
            # here.  Reuse Blender's saved float evaluation so the
            # counterfactual differs by no Python-double/property-rounding
            # artifact while retaining a strictly identical optical schedule.
            baseline_data.lens = actual_repaired_lens
            converged_saved_evaluation_frames.append(frame)
        else:
            baseline_data.lens = expected_r1_lens
        bpy.context.view_layer.update()
        if non_lens_projection_record(baseline_data) != live_non_lens_projection:
            raise RuntimeError(f"counterfactual non-lens projection fields changed after update at F{frame:03d}")
        camera_matrix_counterfactual = matrix_values(camera.matrix_world)
        aim_matrix_counterfactual = matrix_values(aim.matrix_world)
        transform_delta = max(
            maximum_vector_delta(camera_matrix_before, camera_matrix_counterfactual),
            maximum_vector_delta(aim_matrix_before, aim_matrix_counterfactual),
        )
        max_counterfactual_transform_delta = max(max_counterfactual_transform_delta, transform_delta)
        if transform_delta > 1e-10:
            raise RuntimeError(f"R1 counterfactual changed camera/target transform at F{frame:03d}")
        baseline_projection = projection_record(scene, camera, points)

        camera.data = repaired_data
        bpy.context.view_layer.update()
        if maximum_vector_delta(camera_matrix_before, matrix_values(camera.matrix_world)) > 1e-10:
            raise RuntimeError(f"restoring repaired camera data changed transform at F{frame:03d}")
        if non_lens_projection_record(repaired_data) != live_non_lens_projection:
            raise RuntimeError(f"restoring repaired camera data changed projection fields at F{frame:03d}")
        projection_hash = canonical_hash(live_non_lens_projection)
        non_lens_projection_hashes.add(projection_hash)
        row = {
            "frame": frame,
            "cameraWorldMeters": vector(position),
            "targetWorldMeters": vector(target_position),
            "orbitRadiusMeters": rounded(math.hypot(relative.x, relative.y)),
            "elevationAboveCrtReferenceMeters": rounded(relative.z),
            "targetDistanceMeters": rounded((position - target_position).length),
            "_rawOrbitAngleDegrees": math.degrees(math.atan2(relative.y, relative.x)),
            "r1": {"lensMillimeters": rounded(baseline_data.lens), **baseline_projection},
            "r1_1": {"lensMillimeters": rounded(actual_repaired_lens), **repaired_projection},
            "counterfactualTransformDelta": rounded(transform_delta, 12),
            "r1R1_1SchedulesMathematicallyIdentical": schedules_identical,
            "r1CounterfactualLensSource": (
                "saved-r1_1-Blender-evaluation"
                if schedules_identical
                else "exact-R1-counterfactual-schedule"
            ),
            "r1R1_1ScheduleDeltaMillimeters": rounded(
                abs(expected_r1_lens - expected_repaired_lens),
                12,
            ),
            "nonLensProjection": live_non_lens_projection,
            "nonLensProjectionSha256": projection_hash,
        }
        rows.append(row)
    unwrap_angles(rows)
    return rows, {
        "objects": object_records or [],
        "objectCount": len(object_records or []),
        "evaluatedCornersPerFrame": 104,
        "counterfactualCameraData": baseline_data.name,
        "counterfactualAnimationData": None,
        "maximumCounterfactualTransformDelta": rounded(max_counterfactual_transform_delta, 12),
        "nonLensProjectionFieldsCopiedEveryFrame": list(CAMERA_NON_LENS_PROJECTION_FIELDS),
        "uniqueEvaluatedNonLensProjectionStateCount": len(non_lens_projection_hashes),
        "allCounterfactualNonLensProjectionFieldsExact": True,
        "sensorFitAuthority": sensor_fit,
        "convergedSavedBlenderEvaluation": {
            "frameRange": [285, 500],
            "frameCount": len(converged_saved_evaluation_frames),
            "frames": converged_saved_evaluation_frames,
            "strictScheduleEqualityToleranceMillimeters": SCHEDULE_EQUALITY_TOLERANCE,
            "reason": "accepted R1 and R1.1 schedules are mathematically identical; saved Blender float evaluation prevents counterfactual assignment-rounding artifacts",
        },
    }


def maximum_drawdown(rows: Sequence[dict[str, Any]], revision: str) -> dict[str, Any]:
    peak = -math.inf
    peak_frame = -1
    worst = -math.inf
    worst_record: tuple[int, int, float, float] | None = None
    for row in rows:
        value = float(row[revision]["projectedCrtHeightPixels"])
        if value > peak:
            peak = value
            peak_frame = int(row["frame"])
        fraction = 0.0 if peak <= 1e-12 else (peak - value) / peak
        if fraction > worst:
            worst = fraction
            worst_record = (peak_frame, int(row["frame"]), peak, value)
    assert worst_record is not None
    return {
        "fraction": rounded(worst),
        "percent": rounded(worst * 100.0),
        "peakFrame": worst_record[0],
        "troughFrame": worst_record[1],
        "peakPixels": rounded(worst_record[2]),
        "troughPixels": rounded(worst_record[3]),
    }


def exact_row(rows: Sequence[dict[str, Any]], frame: int) -> dict[str, Any]:
    row = rows[frame - AUDIT_FRAME_START]
    if row["frame"] != frame:
        raise RuntimeError("per-frame mobile optics row ordering changed")
    return row


def audit_gates(
    rows: list[dict[str, Any]],
    source_build: dict[str, Any],
    action_topology: dict[str, Any],
) -> dict[str, Any]:
    early = [row for row in rows if EARLY_PULLAWAY_START <= row["frame"] <= EARLY_PULLAWAY_END]
    orbit = [row for row in rows if ORBIT_START <= row["frame"] <= ORBIT_END]
    optical = [row for row in rows if AUDIT_FRAME_START <= row["frame"] <= OPTICAL_PROGRESS_END]
    converged = [row for row in rows if 285 <= row["frame"] <= PHYSICAL_FRAME_END]
    repaired_drawdown = maximum_drawdown(early, "r1_1")
    baseline_drawdown = maximum_drawdown(early, "r1")
    frame46 = exact_row(rows, 46)
    frame76 = exact_row(rows, 76)
    frame106 = exact_row(rows, 106)
    repaired_76_ratio = frame76["r1_1"]["projectedCrtHeightPixels"] / frame46["r1_1"]["projectedCrtHeightPixels"]
    repaired_106_ratio = frame106["r1_1"]["projectedCrtHeightPixels"] / frame46["r1_1"]["projectedCrtHeightPixels"]
    improvement_76 = frame76["r1_1"]["projectedCrtHeightPixels"] / frame76["r1"]["projectedCrtHeightPixels"]
    improvement_106 = frame106["r1_1"]["projectedCrtHeightPixels"] / frame106["r1"]["projectedCrtHeightPixels"]
    radius_increases = [
        {"leftFrame": left["frame"], "rightFrame": right["frame"], "deltaMeters": rounded(right["orbitRadiusMeters"] - left["orbitRadiusMeters"])}
        for left, right in zip(orbit, orbit[1:])
        if right["orbitRadiusMeters"] > left["orbitRadiusMeters"] + 2e-6
    ]
    elevation_increases = [
        {"leftFrame": left["frame"], "rightFrame": right["frame"], "deltaMeters": rounded(right["elevationAboveCrtReferenceMeters"] - left["elevationAboveCrtReferenceMeters"])}
        for left, right in zip(orbit, orbit[1:])
        if right["elevationAboveCrtReferenceMeters"] > left["elevationAboveCrtReferenceMeters"] + 2e-6
    ]
    angular_deltas = [right["orbitAngleDegreesUnwrapped"] - left["orbitAngleDegreesUnwrapped"] for left, right in zip(orbit, orbit[1:])]
    angular_travel = orbit[-1]["orbitAngleDegreesUnwrapped"] - orbit[0]["orbitAngleDegreesUnwrapped"]
    adjacent_lens_delta = max(
        abs(right["r1_1"]["lensMillimeters"] - left["r1_1"]["lensMillimeters"])
        for left, right in zip(optical, optical[1:])
    )
    early_key_deltas = [
        abs(right[1] - left[1])
        for left, right in zip(EXPECTED_R11_LENS_KEYS, EXPECTED_R11_LENS_KEYS[1:])
        if right[0] <= OPTICAL_PROGRESS_END
    ]
    validate_source_build_mobile_stage(source_build)
    gates = {
        "exactSharedActionTwoSlotSixCurveEightyTwoPointTopology": (
            action_topology.get("slotCount") == 2
            and action_topology.get("slots") == [
                {"identifier": EXPECTED_CAMERA_DATA_SLOT_IDENTIFIER, "targetIdType": "CAMERA"},
                {"identifier": EXPECTED_CAMERA_OBJECT_SLOT_IDENTIFIER, "targetIdType": "OBJECT"},
            ]
            and action_topology.get("layerCount") == 1
            and action_topology.get("stripCount") == 1
            and action_topology.get("stripType") == "KEYFRAME"
            and action_topology.get("channelbagCount") == 2
            and action_topology.get("curveCount") == 6
            and action_topology.get("keyframePointCount") == 82
            and action_topology.get("objectCurves") == [
                {"dataPath": "location", "arrayIndex": 0},
                {"dataPath": "location", "arrayIndex": 1},
                {"dataPath": "location", "arrayIndex": 2},
            ]
            and action_topology.get("dataCurves") == [
                {"dataPath": "lens", "arrayIndex": 0},
                {"dataPath": "shift_x", "arrayIndex": 0},
                {"dataPath": "shift_y", "arrayIndex": 0},
            ]
            and action_topology.get("savedCamera") == {
                "object": EXPECTED_CAMERA_OBJECT,
                "data": EXPECTED_CAMERA_DATA,
                "parent": EXPECTED_ORBIT_RIG,
                "parentType": "OBJECT",
                "parentBone": "",
                "objectDriverCount": 0,
                "cameraDataDriverCount": 0,
                "objectNlaTrackCount": 0,
                "cameraDataNlaTrackCount": 0,
                "projection": {
                    "type": "PERSP",
                    "sensorFit": "AUTO",
                    "sensorWidthMillimeters": 36.0,
                    "sensorHeightMillimeters": 24.0,
                    "clipStartMeters": 0.005,
                    "clipEndMeters": 1000.0,
                },
                "constraints": [{
                    "name": "Phase4R1_AuditableLookAtAcceptedCRT",
                    "type": "TRACK_TO",
                    "target": EXPECTED_AIM_OBJECT,
                    "trackAxis": "TRACK_NEGATIVE_Z",
                    "upAxis": "UP_Y",
                    "ownerSpace": "WORLD",
                    "targetSpace": "WORLD",
                    "influence": 1.0,
                    "mute": False,
                    "subtarget": "",
                    "useTargetZ": False,
                }],
            }
        ),
        "exactSavedLensCurve": all(
            abs(row["r1_1"]["lensMillimeters"] - lens_at(EXPECTED_R11_LENS_KEYS, row["frame"])) <= FLOAT_TOLERANCE
            for row in rows
        ),
        "exactR1CounterfactualCurve": all(
            abs(row["r1"]["lensMillimeters"] - lens_at(EXPECTED_R1_LENS_KEYS, row["frame"])) <= FLOAT_TOLERANCE
            for row in rows
        ),
        "counterfactualTransformsIdentical": max(row["counterfactualTransformDelta"] for row in rows) <= 1e-10,
        "counterfactualNonLensProjectionFieldsExactAtEveryFrame": all(
            isinstance(row.get("nonLensProjection"), dict)
            and row.get("nonLensProjectionSha256") == canonical_hash(row["nonLensProjection"])
            for row in rows
        ),
        "authoredAutoSensorFitResolvesVerticalAt390x844": WIDTH < HEIGHT and all(
            row.get("nonLensProjection", {}).get("sensor_fit") == "AUTO" for row in rows
        ),
        "allEarlyCrtCornersInFrontR1": all(row["r1"]["inFrontCount"] == 104 for row in early),
        "allEarlyCrtCornersInFrontR1_1": all(row["r1_1"]["inFrontCount"] == 104 for row in early),
        "repairedEarlyMaximumDrawdownAtMostEightPercent": repaired_drawdown["fraction"] <= 0.08 + 1e-9,
        "repairedF76ScaleAtLeastNinetyTwoPercentOfF46": repaired_76_ratio >= 0.92 - 1e-9,
        "repairedF106ScaleAtLeastNinetyTwoPercentOfF46": repaired_106_ratio >= 0.92 - 1e-9,
        "r1CounterfactualContainsRejectedEarlyCollapse": baseline_drawdown["fraction"] >= 0.20,
        "repairedEarlyDrawdownImprovesR1ByAtLeastTwelvePoints": baseline_drawdown["fraction"] - repaired_drawdown["fraction"] >= 0.12,
        "repairedF76ScaleAtLeastTwentyFivePercentLargerThanR1": improvement_76 >= 1.25,
        "repairedF106ScaleAtLeastTwentyFivePercentLargerThanR1": improvement_106 >= 1.25,
        "orbitRadiusMonotonicInward": not radius_increases,
        "orbitElevationMonotonicDescent": not elevation_increases,
        "orbitCounterClockwise": all(delta >= -2e-6 for delta in angular_deltas),
        "orbitAngularTravelApproximately360Degrees": abs(angular_travel - 360.0) <= 0.01,
        "maximumPerFrameFocalChangeAtMostOneMillimeterThroughF405": adjacent_lens_delta <= 1.0 + 1e-9,
        "maximumAuthoredKeyChangeAtMostSixMillimetersThroughF405": max(early_key_deltas) <= 6.0 + 1e-9,
        "focalProgressionNondecreasingThroughF405": all(
            right["r1_1"]["lensMillimeters"] + FLOAT_TOLERANCE >= left["r1_1"]["lensMillimeters"]
            for left, right in zip(optical, optical[1:])
        ),
        "exactR1AndR1_1OpticalEqualityF285ThroughF500": len(converged) == 216 and all(
            row["r1"] == row["r1_1"] for row in converged
        ),
        "convergedFramesUseSavedEvaluationOnlyForIdenticalSchedules": len(converged) == 216 and all(
            row["r1R1_1SchedulesMathematicallyIdentical"] is True
            and row["r1CounterfactualLensSource"] == "saved-r1_1-Blender-evaluation"
            and row["r1R1_1ScheduleDeltaMillimeters"] <= SCHEDULE_EQUALITY_TOLERANCE
            for row in converged
        ),
        "sourceBuildExactMobileLensOnlyDelta": True,
    }
    failed = sorted(name for name, passed in gates.items() if not passed)
    if failed:
        raise RuntimeError(f"mobile optical continuity gates failed: {failed}")
    return {
        "status": "PASS",
        "gates": gates,
        "repairedEarlyDrawdown": repaired_drawdown,
        "r1CounterfactualEarlyDrawdown": baseline_drawdown,
        "f76ScaleRatioToF46": rounded(repaired_76_ratio),
        "f106ScaleRatioToF46": rounded(repaired_106_ratio),
        "f76RepairedToR1ScaleRatio": rounded(improvement_76),
        "f106RepairedToR1ScaleRatio": rounded(improvement_106),
        "maximumPerFrameFocalDeltaThroughF405": rounded(adjacent_lens_delta),
        "maximumAuthoredKeyDeltaThroughF405": rounded(max(early_key_deltas)),
        "orbitAngularTravelDegrees": rounded(angular_travel),
        "exactR1R1_1EqualityRange": [285, 500],
        "exactR1R1_1EqualityFrameCount": len(converged),
        "radiusIncreases": radius_increases,
        "elevationIncreases": elevation_increases,
        "machinePassDoesNotConstituteHumanAcceptance": True,
    }


def choose_eevee_engine(scene: bpy.types.Scene) -> str:
    engine_property = scene.render.bl_rna.properties["engine"]
    identifiers = {item.identifier for item in engine_property.enum_items}
    for candidate in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        if candidate in identifiers:
            return candidate
    raise RuntimeError(f"Eevee is unavailable: {sorted(identifiers)}")


def scene_signature(scene: bpy.types.Scene) -> dict[str, Any]:
    render = scene.render
    image = render.image_settings
    view = scene.view_settings
    return {
        "camera": None if scene.camera is None else scene.camera.name,
        "mobileCameraData": None if bpy.data.objects.get(EXPECTED_CAMERA_OBJECT) is None else bpy.data.objects[EXPECTED_CAMERA_OBJECT].data.name,
        "frame": int(scene.frame_current),
        "subframe": rounded(scene.frame_subframe),
        "frameRange": [int(scene.frame_start), int(scene.frame_end)],
        "render": {
            "engine": render.engine,
            "resolution": [int(render.resolution_x), int(render.resolution_y), int(render.resolution_percentage)],
            "pixelAspect": [rounded(render.pixel_aspect_x), rounded(render.pixel_aspect_y)],
            "filepath": render.filepath,
            "filmTransparent": bool(render.film_transparent),
            "useFileExtension": bool(render.use_file_extension),
            "useMotionBlur": bool(render.use_motion_blur),
            "image": {
                "fileFormat": image.file_format,
                "colorMode": image.color_mode,
                "colorDepth": image.color_depth,
                "compression": int(image.compression),
            },
        },
        "view": {
            "viewTransform": view.view_transform,
            "look": view.look,
            "exposure": rounded(view.exposure),
        },
        "cableCollectionVisibility": {
            family: bool(bpy.data.collections[name].hide_render)
            for family, name in CABLE_COLLECTIONS.items()
        },
    }


class SceneState:
    """Restore every in-memory diagnostic mutation; this producer never saves."""

    def __init__(self, camera: bpy.types.Object) -> None:
        self.scene = bpy.context.scene
        self.camera_object = camera
        self.camera_data = camera.data
        self.scene_camera = self.scene.camera
        self.frame = int(self.scene.frame_current)
        self.subframe = float(self.scene.frame_subframe)
        render = self.scene.render
        image = render.image_settings
        view = self.scene.view_settings
        self.render = {
            "engine": render.engine,
            "resolution_x": render.resolution_x,
            "resolution_y": render.resolution_y,
            "resolution_percentage": render.resolution_percentage,
            "pixel_aspect_x": render.pixel_aspect_x,
            "pixel_aspect_y": render.pixel_aspect_y,
            "filepath": render.filepath,
            "film_transparent": render.film_transparent,
            "use_file_extension": render.use_file_extension,
            "use_motion_blur": render.use_motion_blur,
        }
        self.image = {
            "file_format": image.file_format,
            "color_mode": image.color_mode,
            "color_depth": image.color_depth,
            "compression": image.compression,
        }
        self.view = {"view_transform": view.view_transform, "look": view.look, "exposure": view.exposure}
        self.collection_visibility = {collection.name: bool(collection.hide_render) for collection in bpy.data.collections}
        self.created_camera_data: list[bpy.types.Camera] = []

    def restore(self) -> None:
        if self.camera_object.data != self.camera_data:
            self.camera_object.data = self.camera_data
        for key, value in self.render.items():
            setattr(self.scene.render, key, value)
        for key, value in self.image.items():
            setattr(self.scene.render.image_settings, key, value)
        for key, value in self.view.items():
            setattr(self.scene.view_settings, key, value)
        for name, hidden in self.collection_visibility.items():
            collection = bpy.data.collections.get(name)
            if collection is not None:
                collection.hide_render = hidden
        self.scene.camera = self.scene_camera
        self.scene.frame_set(self.frame, subframe=self.subframe)
        bpy.context.view_layer.update()
        for data in self.created_camera_data:
            if bpy.data.cameras.get(data.name) is data and data.users == 0:
                bpy.data.cameras.remove(data)


def configure_mobile_render(scene: bpy.types.Scene, camera: bpy.types.Object) -> str:
    engine = choose_eevee_engine(scene)
    scene.camera = camera
    for family, name in CABLE_COLLECTIONS.items():
        collection = bpy.data.collections.get(name)
        if collection is None:
            raise RuntimeError(f"missing exact cable-family collection: {name}")
        collection.hide_render = family != "mobile"
    scene.render.engine = engine
    scene.render.resolution_x = WIDTH
    scene.render.resolution_y = HEIGHT
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
    mobile_sensor_fit_proof(camera.data)
    return engine


def mobile_sensor_fit_proof(data: bpy.types.Camera) -> dict[str, Any]:
    authored = str(data.sensor_fit)
    weighted_width = float(WIDTH)
    weighted_height = float(HEIGHT)
    resolved = (
        "HORIZONTAL" if weighted_width >= weighted_height else "VERTICAL"
    ) if authored == "AUTO" else authored
    proof = {
        "authored": authored,
        "autoResolutionRule": "HORIZONTAL when pixel-aspect-weighted width >= height; otherwise VERTICAL",
        "pixelAspectWeightedRaster": [weighted_width, weighted_height],
        "resolved": resolved,
        "portraitAutoResolvesVertical": authored == "AUTO" and resolved == "VERTICAL",
    }
    if not proof["portraitAutoResolvesVertical"]:
        raise RuntimeError(f"mobile camera sensor fit must prove AUTO->VERTICAL at {WIDTH}x{HEIGHT}")
    return proof


def render_settings_record(engine: str) -> dict[str, Any]:
    return {
        "engine": engine,
        "resolution": [WIDTH, HEIGHT],
        "resolutionPercentage": 100,
        "pixelAspect": [1.0, 1.0],
        "format": "PNG",
        "colorMode": "RGB",
        "colorDepth": "8",
        "compression": 35,
        "viewTransform": "AgX",
        "look": "AgX - Medium High Contrast",
        "exposureStops": 1.0,
        "motionBlur": False,
        "camera": EXPECTED_CAMERA_OBJECT,
        "sensorFit": {
            "authored": "AUTO",
            "resolvedAt390x844": "VERTICAL",
            "portraitAutoResolutionAsserted": True,
        },
        "cableFamily": "mobile",
        "physicalFrameRangeOnly": [PHYSICAL_FRAME_START, PHYSICAL_FRAME_END],
    }


def frame_path(root: Path, frame: int) -> Path:
    if not PHYSICAL_FRAME_START <= frame <= PHYSICAL_FRAME_END:
        raise RuntimeError(f"refusing non-physical mobile frame F{frame:03d}")
    return root / "animatic" / "frames" / f"F{frame:03d}.png"


def frame_receipt_path(path: Path) -> Path:
    return path.with_suffix(".receipt.json")


def make_frame_record(
    root: Path,
    path: Path,
    receipt: Path,
    frame: int,
    plan: dict[str, Any],
    elapsed: float | None = None,
) -> dict[str, Any]:
    width, height = png_dimensions(path)
    if (width, height) != (WIDTH, HEIGHT):
        raise RuntimeError(f"mobile frame dimensions changed at F{frame:03d}: {(width, height)}")
    result = output_record(
        root,
        path,
        role="physical-only mobile Eevee animatic frame",
        frame=frame,
        family="mobile",
        engine=plan["renderSettings"]["engine"],
        sourceSha256=plan["source"]["sha256"],
    )
    result["receipt"] = {"path": relative_output_path(root, receipt), **file_record(receipt)}
    if frame in VISUAL_EVIDENCE_FRAMES:
        result["visualEvidenceRole"] = visual_evidence_role(frame)
    if elapsed is not None:
        result["renderSeconds"] = rounded(elapsed, 6)
    return result


def validate_frame_receipt(root: Path, path: Path, frame: int, plan: dict[str, Any]) -> dict[str, Any] | None:
    receipt_path = frame_receipt_path(path)
    if not path.is_file() or not receipt_path.is_file():
        return None
    try:
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    expected = {
        "schema": "quantum-hub.phase-4-r1-1.mobile-physical-frame-receipt.v1",
        "status": "PASS",
        "frame": frame,
        "path": relative_output_path(root, path),
        "source": plan["source"],
        "producer": plan["producer"],
        "renderSettingsSha256": canonical_hash(plan["renderSettings"]),
    }
    if any(receipt.get(key) != value for key, value in expected.items()):
        return None
    if png_dimensions(path) != (WIDTH, HEIGHT):
        return None
    actual = file_record(path)
    if receipt.get("file") != actual:
        return None
    return make_frame_record(root, path, receipt_path, frame, plan, receipt.get("renderSeconds"))


def render_frame_atomic(
    root: Path,
    scene: bpy.types.Scene,
    camera: bpy.types.Object,
    frame: int,
    plan: dict[str, Any],
) -> tuple[dict[str, Any], bool]:
    target = frame_path(root, frame)
    target.parent.mkdir(parents=True, exist_ok=True)
    existing = validate_frame_receipt(root, target, frame, plan)
    if existing is not None:
        return existing, False
    pending = target.with_name(target.stem + ".pending.png")
    if pending.exists():
        raise RuntimeError(f"stale unpublished frame transaction exists: {pending.name}")
    receipt_path = frame_receipt_path(target)
    try:
        if camera.data.name != EXPECTED_CAMERA_DATA:
            raise RuntimeError("animatic render camera is not bound to the exact repaired data")
        scene.frame_set(frame, subframe=0.0)
        bpy.context.view_layer.update()
        expected_lens = lens_at(EXPECTED_R11_LENS_KEYS, frame)
        if abs(float(camera.data.lens) - expected_lens) > FLOAT_TOLERANCE:
            raise RuntimeError(f"animatic focal authority mismatch at F{frame:03d}")
        scene.render.filepath = str(pending)
        started = time.perf_counter()
        result = bpy.ops.render.render(write_still=True)
        elapsed = time.perf_counter() - started
        if result != {"FINISHED"} or not pending.is_file():
            raise RuntimeError(f"Eevee still render did not finish at F{frame:03d}: {result}")
        if png_dimensions(pending) != (WIDTH, HEIGHT):
            raise RuntimeError(f"staged Eevee frame has wrong dimensions at F{frame:03d}")
        os.replace(pending, target)
        receipt = {
            "schema": "quantum-hub.phase-4-r1-1.mobile-physical-frame-receipt.v1",
            "status": "PASS",
            "frame": frame,
            "path": relative_output_path(root, target),
            "file": file_record(target),
            "source": plan["source"],
            "producer": plan["producer"],
            "renderSettingsSha256": canonical_hash(plan["renderSettings"]),
            "lensMillimeters": rounded(camera.data.lens),
            "renderSeconds": rounded(elapsed, 6),
            "physicalOnly": True,
            "frame501Through540Rendered": False,
        }
        atomic_json(receipt_path, receipt)
        return make_frame_record(root, target, receipt_path, frame, plan, elapsed), True
    finally:
        pending.unlink(missing_ok=True)


def compact_ranges(frames: Sequence[int]) -> list[list[int]]:
    values = sorted(set(int(value) for value in frames))
    if not values:
        return []
    ranges: list[list[int]] = []
    start = prior = values[0]
    for value in values[1:]:
        if value == prior + 1:
            prior = value
            continue
        ranges.append([start, prior])
        start = prior = value
    ranges.append([start, prior])
    return ranges


def manifest_value(root: Path, plan: dict[str, Any], files: dict[int, dict[str, Any]]) -> dict[str, Any]:
    complete = sorted(files)
    missing = [frame for frame in range(PHYSICAL_FRAME_START, PHYSICAL_FRAME_END + 1) if frame not in files]
    return {
        "schema": FRAME_MANIFEST_SCHEMA,
        "status": "COMPLETE" if not missing else "IN_PROGRESS",
        "source": plan["source"],
        "sourceBuild": plan["sourceBuild"],
        "producer": plan["producer"],
        "plan": {"path": "animatic/mobile-animatic-plan.json", **file_record(root / "animatic" / "mobile-animatic-plan.json")},
        "physicalFrameRange": [PHYSICAL_FRAME_START, PHYSICAL_FRAME_END],
        "frameCountExpected": PHYSICAL_FRAME_END - PHYSICAL_FRAME_START + 1,
        "frameCountComplete": len(complete),
        "frameCountMissing": len(missing),
        "completeFrames": complete,
        "missingFrames": missing,
        "completeRanges": compact_ranges(complete),
        "missingRanges": compact_ranges(missing),
        "files": [files[frame] for frame in complete],
        "frame501Through540Present": False,
        "complete540FrameFilmRendered": False,
        "finalRefinedMediaIntegrationStarted": False,
        "phase5Authorized": False,
    }


def write_frame_manifest(root: Path, plan: dict[str, Any], files: dict[int, dict[str, Any]]) -> dict[str, Any]:
    manifest = manifest_value(root, plan, files)
    atomic_json(root / "animatic" / "mobile-animatic-frame-manifest.json", manifest)
    return manifest


def recover_interrupted_frame_receipt(root: Path, path: Path, frame: int, plan: dict[str, Any]) -> dict[str, Any]:
    """Fail closed: dimensions/hash alone can never authenticate an orphan PNG."""
    del root, plan
    raise RuntimeError(
        f"orphan frame {path.name} has no pre-existing authenticated receipt; "
        f"refusing recovery for F{frame:03d} (remove it explicitly, then rerender)"
    )


def scan_frame_files(root: Path, plan: dict[str, Any]) -> dict[int, dict[str, Any]]:
    frames_dir = root / "animatic" / "frames"
    files: dict[int, dict[str, Any]] = {}
    if not frames_dir.is_dir():
        return files
    unexpected = []
    for path in sorted(frames_dir.iterdir()):
        if path.name.endswith(".receipt.json"):
            continue
        if re.fullmatch(r"F\d{3}\.pending\.png", path.name):
            raise RuntimeError(f"stale unpublished frame transaction exists: {path.name}")
        match = FRAME_NAME.fullmatch(path.name)
        if match is None:
            unexpected.append(path.name)
            continue
        frame = int(match.group("frame"))
        if not PHYSICAL_FRAME_START <= frame <= PHYSICAL_FRAME_END:
            raise RuntimeError(f"forbidden F501-F540 or out-of-range frame exists: {path.name}")
        record = validate_frame_receipt(root, path, frame, plan)
        if record is None and not frame_receipt_path(path).exists():
            record = recover_interrupted_frame_receipt(root, path, frame, plan)
        if record is None:
            raise RuntimeError(f"unauthenticated or stale animatic frame exists: {path.name}")
        files[frame] = record
    if unexpected:
        raise RuntimeError(f"unexpected files in authenticated frame directory: {unexpected}")
    receipts = sorted(frames_dir.glob("F*.receipt.json"))
    expected_receipts = {frame_receipt_path(frame_path(root, frame)).name for frame in files}
    orphaned = [path.name for path in receipts if path.name not in expected_receipts]
    if orphaned:
        raise RuntimeError(f"orphaned frame receipts exist: {orphaned}")
    return files


def validate_plan(root: Path, authorities: dict[str, Any]) -> dict[str, Any]:
    path = root / "animatic" / "mobile-animatic-plan.json"
    if not path.is_file():
        raise RuntimeError("mobile animatic plan is absent; run audit mode first")
    plan = json.loads(path.read_text(encoding="utf-8"))
    expected_source = authorities["files"]["derivative"]
    expected_build = authorities["files"]["sourceBuild"]
    expected_producer = authorities["files"]["producer"]
    if (
        plan.get("schema") != PLAN_SCHEMA
        or plan.get("status") != "PASS"
        or plan.get("source") != expected_source
        or plan.get("sourceBuild") != expected_build
        or plan.get("producer") != expected_producer
        or plan.get("physicalFrameRange") != [1, 500]
        or plan.get("forbiddenFrameRange") != [501, 540]
        or plan.get("maximumChunkFrames") != 60
        or plan.get("framePattern") != "animatic/frames/F%03d.png"
        or plan.get("receiptPattern") != "animatic/frames/F%03d.receipt.json"
        or plan.get("scaleMilestoneFrames") != list(EXPECTED_MILESTONES)
        or plan.get("visualEvidenceFramesInitiallyRendered") != list(VISUAL_EVIDENCE_FRAMES)
        or plan.get("finalizationModes") != FINALIZATION_MODES
        or plan.get("resolution") != [WIDTH, HEIGHT]
        or plan.get("fps") != FPS
    ):
        raise RuntimeError("mobile animatic plan is stale or divergent")
    validate_sanitized_accepted_r1_mobile_authority(plan.get("acceptedR1MobilePhysicalFrames"))
    report_path = root / "phase4r1-1-mobile-optics-diagnostic.json"
    report = json.loads(report_path.read_text(encoding="utf-8")) if report_path.is_file() else None
    if (
        not isinstance(report, dict)
        or report.get("schema") != SCHEMA
        or report.get("status") != "PASS"
        or report.get("acceptedR1MobilePhysicalFrames") != plan.get("acceptedR1MobilePhysicalFrames")
    ):
        raise RuntimeError("PASS mobile optics audit is required before animatic continuation")
    return plan


def csv_text(rows: Sequence[dict[str, Any]]) -> str:
    buffer = io.StringIO(newline="")
    fieldnames = (
        "frame",
        "cameraX",
        "cameraY",
        "cameraZ",
        "targetX",
        "targetY",
        "targetZ",
        "orbitRadiusMeters",
        "elevationAboveCrtReferenceMeters",
        "targetDistanceMeters",
        "orbitAngleDegreesUnwrapped",
        "r1LensMillimeters",
        "r1ProjectedCrtHeightPixels",
        "r1ProjectedCrtHeightPercent",
        "r1ProjectedCrtHeightViewportPixels",
        "r1ProjectedCrtHeightViewportPercent",
        "r1_1LensMillimeters",
        "r1_1ProjectedCrtHeightPixels",
        "r1_1ProjectedCrtHeightPercent",
        "r1_1ProjectedCrtHeightViewportPixels",
        "r1_1ProjectedCrtHeightViewportPercent",
        "counterfactualTransformDelta",
    )
    writer = csv.DictWriter(buffer, fieldnames=fieldnames, lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({
            "frame": row["frame"],
            "cameraX": row["cameraWorldMeters"][0],
            "cameraY": row["cameraWorldMeters"][1],
            "cameraZ": row["cameraWorldMeters"][2],
            "targetX": row["targetWorldMeters"][0],
            "targetY": row["targetWorldMeters"][1],
            "targetZ": row["targetWorldMeters"][2],
            "orbitRadiusMeters": row["orbitRadiusMeters"],
            "elevationAboveCrtReferenceMeters": row["elevationAboveCrtReferenceMeters"],
            "targetDistanceMeters": row["targetDistanceMeters"],
            "orbitAngleDegreesUnwrapped": row["orbitAngleDegreesUnwrapped"],
            "r1LensMillimeters": row["r1"]["lensMillimeters"],
            "r1ProjectedCrtHeightPixels": row["r1"]["projectedCrtHeightPixels"],
            "r1ProjectedCrtHeightPercent": row["r1"]["projectedCrtHeightPercent"],
            "r1ProjectedCrtHeightViewportPixels": row["r1"]["projectedCrtHeightViewportPixels"],
            "r1ProjectedCrtHeightViewportPercent": row["r1"]["projectedCrtHeightViewportPercent"],
            "r1_1LensMillimeters": row["r1_1"]["lensMillimeters"],
            "r1_1ProjectedCrtHeightPixels": row["r1_1"]["projectedCrtHeightPixels"],
            "r1_1ProjectedCrtHeightPercent": row["r1_1"]["projectedCrtHeightPercent"],
            "r1_1ProjectedCrtHeightViewportPixels": row["r1_1"]["projectedCrtHeightViewportPixels"],
            "r1_1ProjectedCrtHeightViewportPercent": row["r1_1"]["projectedCrtHeightViewportPercent"],
            "counterfactualTransformDelta": row["counterfactualTransformDelta"],
        })
    return buffer.getvalue()


def svg_polyline(
    rows: Sequence[dict[str, Any]],
    getter: Any,
    x: float,
    y: float,
    width: float,
    height: float,
    minimum: float,
    maximum: float,
    color: str,
) -> str:
    span = maximum - minimum
    if span <= 1e-12:
        span = 1.0
    points = []
    for row in rows:
        px = x + (row["frame"] - AUDIT_FRAME_START) / (AUDIT_FRAME_END - AUDIT_FRAME_START) * width
        py = y + height - (float(getter(row)) - minimum) / span * height
        points.append(f"{px:.2f},{py:.2f}")
    return f'<polyline fill="none" stroke="{color}" stroke-width="2" vector-effect="non-scaling-stroke" points="{" ".join(points)}"/>'


def optics_svg(rows: Sequence[dict[str, Any]]) -> str:
    panels = (
        ("Focal length (mm)", ((lambda row: row["r1"]["lensMillimeters"], "#8b9294", "R1"), (lambda row: row["r1_1"]["lensMillimeters"], "#ef4d9a", "R1.1"))),
        ("Orbit radius (m)", ((lambda row: row["orbitRadiusMeters"], "#78b7c5", "shared transform"),)),
        ("Elevation above CRT reference (m)", ((lambda row: row["elevationAboveCrtReferenceMeters"], "#d1a56f", "shared transform"),)),
        ("Camera-to-authored-target distance (m)", ((lambda row: row["targetDistanceMeters"], "#9bb982", "shared transform"),)),
        ("Projected physical CRT height (px)", ((lambda row: row["r1"]["projectedCrtHeightPixels"], "#8b9294", "R1"), (lambda row: row["r1_1"]["projectedCrtHeightPixels"], "#ef4d9a", "R1.1"))),
        ("Projected physical CRT height (% of 844px)", ((lambda row: row["r1"]["projectedCrtHeightPercent"], "#8b9294", "R1"), (lambda row: row["r1_1"]["projectedCrtHeightPercent"], "#ef4d9a", "R1.1"))),
    )
    document_width = 1440
    document_height = 1120
    panel_x = 110.0
    panel_width = 1240.0
    panel_height = 120.0
    panel_gap = 42.0
    first_y = 142.0
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{document_width}" height="{document_height}" viewBox="0 0 {document_width} {document_height}">',
        '<rect width="100%" height="100%" fill="#0e1112"/>',
        '<style>text{font-family:Arial,sans-serif;fill:#d8dddd}.small{font-size:13px;fill:#9ba3a5}.label{font-size:17px;font-weight:600}.title{font-size:27px;font-weight:700}</style>',
        '<text x="70" y="55" class="title">Phase 4-R1.1 mobile optical continuity — exact physical CRT projection</text>',
        '<text x="70" y="84" class="small">390×844 · F001–F500 · 13 exact evaluated geometry objects · 104 bounding corners/frame · grey R1 counterfactual · magenta R1.1</text>',
    ]
    for panel_index, (title, series) in enumerate(panels):
        panel_y = first_y + panel_index * (panel_height + panel_gap)
        values = [float(getter(row)) for getter, _, _ in series for row in rows]
        minimum = min(values)
        maximum = max(values)
        padding = max((maximum - minimum) * 0.08, 0.01)
        minimum -= padding
        maximum += padding
        parts.extend([
            f'<text x="{panel_x:.0f}" y="{panel_y - 14:.0f}" class="label">{html.escape(title)}</text>',
            f'<rect x="{panel_x:.0f}" y="{panel_y:.0f}" width="{panel_width:.0f}" height="{panel_height:.0f}" fill="#131819" stroke="#394143"/>',
            f'<line x1="{panel_x:.0f}" y1="{panel_y + panel_height / 2:.1f}" x2="{panel_x + panel_width:.0f}" y2="{panel_y + panel_height / 2:.1f}" stroke="#252d2e"/>',
            f'<text x="{panel_x - 12:.0f}" y="{panel_y + 5:.0f}" text-anchor="end" class="small">{maximum:.2f}</text>',
            f'<text x="{panel_x - 12:.0f}" y="{panel_y + panel_height:.0f}" text-anchor="end" class="small">{minimum:.2f}</text>',
        ])
        for frame in VISUAL_EVIDENCE_FRAMES:
            marker_x = panel_x + (frame - AUDIT_FRAME_START) / (AUDIT_FRAME_END - AUDIT_FRAME_START) * panel_width
            parts.append(f'<line x1="{marker_x:.2f}" y1="{panel_y:.0f}" x2="{marker_x:.2f}" y2="{panel_y + panel_height:.0f}" stroke="#283032" stroke-width="1"/>')
        for getter, color, _ in series:
            parts.append(svg_polyline(rows, getter, panel_x, panel_y, panel_width, panel_height, minimum, maximum, color))
        legend_x = panel_x + panel_width - 230
        for index, (_, color, label) in enumerate(series):
            legend_y = panel_y - 15
            offset = index * 115
            parts.append(f'<line x1="{legend_x + offset:.0f}" y1="{legend_y - 5:.0f}" x2="{legend_x + offset + 25:.0f}" y2="{legend_y - 5:.0f}" stroke="{color}" stroke-width="3"/>')
            parts.append(f'<text x="{legend_x + offset + 31:.0f}" y="{legend_y:.0f}" class="small">{html.escape(label)}</text>')
        if panel_index == len(panels) - 1:
            for frame in VISUAL_EVIDENCE_FRAMES:
                marker_x = panel_x + (frame - AUDIT_FRAME_START) / (AUDIT_FRAME_END - AUDIT_FRAME_START) * panel_width
                parts.append(f'<text x="{marker_x:.2f}" y="{panel_y + panel_height + 22:.0f}" text-anchor="middle" class="small">{frame}</text>')
    parts.extend([
        '<text x="720" y="1100" text-anchor="middle" class="small">Frame (machine PASS supports, but does not replace, the MOBILE CAMERA OPTICAL CONTINUITY human gate)</text>',
        '</svg>',
    ])
    return "\n".join(parts) + "\n"


def milestone_html(rows: Sequence[dict[str, Any]]) -> str:
    cards = []
    table_rows = []
    for frame in VISUAL_EVIDENCE_FRAMES:
        row = exact_row(rows, frame)
        evidence_role = visual_evidence_role(frame)
        cards.append(
            '<figure>'
            f'<img src="animatic/frames/F{frame:03d}.png" width="195" height="422" alt="Mobile physical frame {frame}">'
            f'<figcaption>F{frame:03d} · {html.escape(evidence_role)} · {row["r1_1"]["lensMillimeters"]:.2f} mm · '
            f'{row["r1_1"]["projectedCrtHeightPixels"]:.1f}px raw CRT height</figcaption>'
            '</figure>'
        )
        table_rows.append(
            f'<tr><td>F{frame:03d}</td><td>{html.escape(evidence_role)}</td><td>{row["r1"]["lensMillimeters"]:.2f}</td>'
            f'<td>{row["r1_1"]["lensMillimeters"]:.2f}</td>'
            f'<td>{row["r1"]["projectedCrtHeightPixels"]:.3f}</td>'
            f'<td>{row["r1_1"]["projectedCrtHeightPixels"]:.3f}</td>'
            f'<td>{row["orbitRadiusMeters"]:.4f}</td><td>{row["elevationAboveCrtReferenceMeters"]:.4f}</td>'
            f'<td>{row["targetDistanceMeters"]:.4f}</td></tr>'
        )
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Phase 4-R1.1 mobile milestones</title>
<style>
html{{background:#0e1112;color:#d8dddd;font:14px/1.45 Arial,sans-serif}}body{{margin:24px auto;max-width:1420px}}
h1{{font-size:25px}}p{{color:#aeb6b8}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(195px,1fr));gap:18px}}
figure{{margin:0;background:#151a1b;padding:10px;border:1px solid #343c3e}}img{{display:block;width:100%;height:auto;background:#050707}}
figcaption{{margin-top:8px;color:#c8ced0}}table{{width:100%;border-collapse:collapse;margin-top:28px}}th,td{{padding:7px;border:1px solid #343c3e;text-align:right}}th:first-child,td:first-child{{text-align:left}}
</style></head><body>
<h1>Phase 4-R1.1 mobile optical milestones</h1>
<p>Native 390×844 physical Eevee frames. Scale uses the exact thirteen-object CRT cabinet and 104 evaluated bounding corners. Human optical-continuity acceptance remains pending.</p>
<section class="grid">{''.join(cards)}</section>
<table><thead><tr><th>Frame</th><th>Evidence role</th><th>R1 mm</th><th>R1.1 mm</th><th>R1 CRT px</th><th>R1.1 CRT px</th><th>Radius m</th><th>Elevation m</th><th>Target distance m</th></tr></thead>
<tbody>{''.join(table_rows)}</tbody></table>
</body></html>'''


def create_plan(
    root: Path,
    authorities: dict[str, Any],
    accepted_r1_mobile: dict[str, Any],
    engine: str,
) -> dict[str, Any]:
    animatic = root / "animatic"
    (animatic / "frames").mkdir(parents=True)
    render_settings = render_settings_record(engine)
    plan = {
        "schema": PLAN_SCHEMA,
        "status": "PASS",
        "source": authorities["files"]["derivative"],
        "sourceBuild": authorities["files"]["sourceBuild"],
        "producer": authorities["files"]["producer"],
        "acceptedR1MobilePhysicalFrames": accepted_r1_mobile,
        "renderSettings": render_settings,
        "renderSettingsSha256": canonical_hash(render_settings),
        "resolution": [WIDTH, HEIGHT],
        "fps": FPS,
        "physicalFrameRange": [PHYSICAL_FRAME_START, PHYSICAL_FRAME_END],
        "forbiddenFrameRange": [501, 540],
        "maximumChunkFrames": MAX_CHUNK_FRAMES,
        "framePattern": "animatic/frames/F%03d.png",
        "receiptPattern": "animatic/frames/F%03d.receipt.json",
        "scaleMilestoneFrames": list(EXPECTED_MILESTONES),
        "visualEvidenceFramesInitiallyRendered": list(VISUAL_EVIDENCE_FRAMES),
        "finalizationModes": FINALIZATION_MODES,
        "authorization": cfg.AUTHORIZATION,
        "complete540FrameCyclesFilmStarted": False,
        "finalRefinedMediaIntegrationStarted": False,
        "phase5Authorized": False,
    }
    atomic_json(animatic / "mobile-animatic-plan.json", plan)
    return plan


def data_counts() -> dict[str, int]:
    return {
        "objects": len(bpy.data.objects),
        "cameras": len(bpy.data.cameras),
        "actions": len(bpy.data.actions),
        "collections": len(bpy.data.collections),
        "scenes": len(bpy.data.scenes),
    }


def run_audit(
    root: Path,
    source_build: dict[str, Any],
    authorities: dict[str, Any],
    accepted_r1_mobile: dict[str, Any],
) -> Path:
    scene = bpy.context.scene
    camera, repaired_data, aim, rig, action_topology = exact_mobile_objects()
    geometry = exact_crt_geometry()
    state = SceneState(camera)
    before_signature = scene_signature(scene)
    before_counts = data_counts()
    baseline_data: bpy.types.Camera | None = None
    rows: list[dict[str, Any]] = []
    measurements: dict[str, Any] = {}
    gates: dict[str, Any] = {}
    artifacts: list[dict[str, Any]] = []
    frame_records: dict[int, dict[str, Any]] = {}
    plan: dict[str, Any] | None = None
    engine = ""
    try:
        engine = configure_mobile_render(scene, camera)
        baseline_data = repaired_data.copy()
        baseline_data.name = "Phase4R11_R1CounterfactualCameraData_TEMP"
        if baseline_data.animation_data is not None:
            baseline_data.animation_data_clear()
        state.created_camera_data.append(baseline_data)
        rows, measurements = measure_optics(scene, camera, repaired_data, baseline_data, aim, geometry)
        gates = audit_gates(rows, source_build, action_topology)

        csv_path = root / "mobile-optics-F001-F500.csv"
        svg_path = root / "mobile-optics-graph.svg"
        html_path = root / "mobile-optics-milestones.html"
        atomic_text(csv_path, csv_text(rows))
        atomic_text(svg_path, optics_svg(rows))
        plan = create_plan(root, authorities, accepted_r1_mobile, engine)
        write_frame_manifest(root, plan, frame_records)
        for frame in VISUAL_EVIDENCE_FRAMES:
            record, rendered = render_frame_atomic(root, scene, camera, frame, plan)
            if not rendered:
                raise RuntimeError(f"fresh audit unexpectedly reused F{frame:03d}")
            frame_records[frame] = record
            write_frame_manifest(root, plan, frame_records)
            print(f"PHASE4R1_1_MOBILE_EVIDENCE=F{frame:03d}:{visual_evidence_role(frame)}")
        atomic_text(html_path, milestone_html(rows))
        artifacts.extend([
            output_record(root, csv_path, role="per-frame exact R1/R1.1 mobile optics data", frameRange=[1, 500]),
            output_record(root, svg_path, role="mobile focal/transform/projected-scale comparison graph", frameRange=[1, 500]),
            output_record(root, html_path, role="sixteen-frame native mobile evidence index", frames=list(VISUAL_EVIDENCE_FRAMES)),
            output_record(root, root / "animatic" / "mobile-animatic-plan.json", role="physical-only resumable animatic plan"),
            output_record(root, root / "animatic" / "mobile-animatic-frame-manifest.json", role="initial exact physical-frame manifest"),
            *[frame_records[frame] for frame in sorted(frame_records)],
        ])
    finally:
        if camera.data != repaired_data:
            camera.data = repaired_data
        state.restore()
    after_signature = scene_signature(scene)
    after_counts = data_counts()
    if after_signature != before_signature or after_counts != before_counts:
        raise RuntimeError("mobile audit did not exactly restore scene state and temporary datablocks")
    if not records_unchanged(authorities):
        raise RuntimeError("mobile audit source immutability failed")
    if plan is None:
        raise RuntimeError("mobile animatic plan was not created")
    milestone_rows = [exact_row(rows, frame) for frame in EXPECTED_MILESTONES]
    report = {
        "schema": SCHEMA,
        "status": "PASS",
        "mode": "audit",
        "sourceAuthorities": authorities,
        "acceptedR1MobilePhysicalFrames": accepted_r1_mobile,
        "sourceBuildMobileStage": source_build["stages"]["mobile"],
        "producer": authorities["files"]["producer"],
        "measurementAuthority": {
            **measurements,
            "collection": "REFINED_CRT_ASSEMBLY",
            "exactGeometryObjectNames": list(CRT_GEOMETRY_OBJECTS),
            "resolution": [WIDTH, HEIGHT],
            "frameRange": [AUDIT_FRAME_START, AUDIT_FRAME_END],
            "frameCount": len(rows),
            "projection": "bpy_extras.object_utils.world_to_camera_view over evaluated per-object bound-box corners",
            "rawProjectedHeight": "unclipped union bound height times 844 pixels",
            "viewportProjectedHeight": "vertical union bound clipped to [0,1] times 844 pixels",
            "r1Counterfactual": "same camera object, rig, aim, geometry, frame, and transforms; every live evaluated non-lens projection field (including animated shift_x/shift_y) copied and asserted exact each frame; before convergence only lens is replaced on an unanimated camera-data clone with the exact accepted R1 linear focal curve; at F285-F500 the schedules are strictly identical and the clone receives the saved Blender-evaluated lens to exclude Python-double/property-rounding artifacts",
            "postConvergenceProof": "R1 and R1.1 schedules are mathematically identical and use the same saved Blender focal evaluation, leaving exact projected CRT records identical for every frame F285-F500",
            "mobileActionTopology": action_topology,
            "savedMobileCameraTopologyRequired": True,
        },
        "focalAuthorities": {
            "acceptedR1": [list(item) for item in EXPECTED_R1_LENS_KEYS],
            "repairedR1_1": [list(item) for item in EXPECTED_R11_LENS_KEYS],
            "savedCurveAction": cfg.MOBILE_CAMERA_ACTION,
            "interpolation": "LINEAR",
            "counterfactualCloneHasAnimation": False,
        },
        "gates": gates,
        "milestones": milestone_rows,
        "visualEvidence": [
            {"role": visual_evidence_role(frame), **exact_row(rows, frame)}
            for frame in VISUAL_EVIDENCE_FRAMES
        ],
        "perFrameF001ThroughF500": rows,
        "renderSettings": render_settings_record(engine),
        "artifacts": artifacts,
        "animatic": {
            "plan": output_record(root, root / "animatic" / "mobile-animatic-plan.json", role="resumable physical-only plan"),
            "initialManifest": output_record(root, root / "animatic" / "mobile-animatic-frame-manifest.json", role="initial exact frame manifest"),
            "initialCompletedFrames": sorted(frame_records),
            "physicalFrameRange": [1, 500],
            "forbiddenFrameRange": [501, 540],
            "maximumChunkFrames": MAX_CHUNK_FRAMES,
            "finalizationModes": FINALIZATION_MODES,
        },
        "restoration": {
            "beforeState": before_signature,
            "afterState": after_signature,
            "beforeCounts": before_counts,
            "afterCounts": after_counts,
            "passes": True,
        },
        "sourceImmutability": {"passes": True, "boundFiles": authorities["files"]},
        "authorization": cfg.AUTHORIZATION,
        "complete540FrameCyclesFilmStarted": False,
        "complete540FrameEeveeFilmRendered": False,
        "frame501Through540RenderedOrEncoded": False,
        "finalRefinedMediaIntegrationStarted": False,
        "phase5Authorized": False,
        "humanReview": {
            "gate": "MOBILE CAMERA OPTICAL CONTINUITY",
            "decision": None,
            "machinePassIsNotHumanAcceptance": True,
        },
    }
    report_path = root / "phase4r1-1-mobile-optics-diagnostic.json"
    atomic_json(report_path, report)
    return report_path


def run_chunk(
    root: Path,
    start: int,
    end: int,
    authorities: dict[str, Any],
) -> Path:
    if start < PHYSICAL_FRAME_START or end > PHYSICAL_FRAME_END or start > end:
        raise RuntimeError("animatic chunks are strictly bounded to F001-F500")
    if end - start + 1 > MAX_CHUNK_FRAMES:
        raise RuntimeError(f"animatic chunk exceeds the {MAX_CHUNK_FRAMES}-frame bound")
    plan = validate_plan(root, authorities)
    camera, repaired_data, _, _, _ = exact_mobile_objects()
    exact_crt_geometry()
    scene = bpy.context.scene
    state = SceneState(camera)
    before_signature = scene_signature(scene)
    before_counts = data_counts()
    rendered_frames: list[int] = []
    reused_frames: list[int] = []
    manifest: dict[str, Any] | None = None
    try:
        engine = configure_mobile_render(scene, camera)
        if render_settings_record(engine) != plan["renderSettings"]:
            raise RuntimeError("live Eevee render settings differ from the authenticated animatic plan")
        files = scan_frame_files(root, plan)
        manifest = write_frame_manifest(root, plan, files)
        for frame in range(start, end + 1):
            record, rendered = render_frame_atomic(root, scene, camera, frame, plan)
            files[frame] = record
            if rendered:
                rendered_frames.append(frame)
            else:
                reused_frames.append(frame)
            manifest = write_frame_manifest(root, plan, files)
            print(f"PHASE4R1_1_MOBILE_ANIMATIC=F{frame:03d}:{'RENDERED' if rendered else 'VERIFIED'}")
    finally:
        if camera.data != repaired_data:
            camera.data = repaired_data
        state.restore()
    after_signature = scene_signature(scene)
    after_counts = data_counts()
    if after_signature != before_signature or after_counts != before_counts:
        raise RuntimeError("mobile animatic chunk did not exactly restore the Blender scene")
    records_unchanged(authorities)
    if manifest is None:
        raise RuntimeError("animatic chunk did not update the exact frame manifest")
    report = {
        "schema": "quantum-hub.phase-4-r1-1.mobile-physical-animatic-chunk.v1",
        "status": "PASS",
        "requestedRange": [start, end],
        "renderedFrames": rendered_frames,
        "verifiedExistingFrames": reused_frames,
        "manifest": output_record(root, root / "animatic" / "mobile-animatic-frame-manifest.json", role="updated exact physical-frame manifest"),
        "manifestStatus": manifest["status"],
        "frameCountComplete": manifest["frameCountComplete"],
        "frameCountMissing": manifest["frameCountMissing"],
        "sourceImmutability": True,
        "sceneRestoration": True,
        "frame501Through540Rendered": False,
        "complete540FrameCyclesFilmStarted": False,
        "finalRefinedMediaIntegrationStarted": False,
        "phase5Authorized": False,
    }
    chunks = root / "animatic" / "chunks"
    chunks.mkdir(exist_ok=True)
    report_path = chunks / f"chunk-F{start:03d}-F{end:03d}.json"
    atomic_json(report_path, report)
    return report_path


def require_tool(path_value: str | None, role: str) -> Path:
    if not path_value:
        raise RuntimeError(f"{role} executable path is required for MP4 finalization")
    path = Path(path_value).resolve()
    if not path.is_file():
        raise RuntimeError(f"{role} executable is missing or is not a regular file")
    return path


def sanitized_private_text(value: Any) -> str:
    text = str(value).replace("\r", " ").replace("\n", " ")
    for private in (str(cfg.REPO_ROOT.resolve()), str(Path(__file__).resolve().parent)):
        text = text.replace(private, "<private-path>")
        text = text.replace(private.replace("\\", "/"), "<private-path>")
    text = re.sub(r"(?i)(?<![A-Za-z0-9_])[A-Z]:[\\/][^\r\n]*", "<private-path>", text)
    return text[:600]


def assert_no_absolute_path_strings(value: Any, label: str) -> None:
    stack = [value]
    while stack:
        current = stack.pop()
        if isinstance(current, dict):
            stack.extend(current.keys())
            stack.extend(current.values())
        elif isinstance(current, (list, tuple)):
            stack.extend(current)
        elif isinstance(current, str):
            normalized = current.strip()
            if re.search(r"(?i)(?<![A-Za-z0-9_])[A-Z]:[\\/]", normalized) or normalized.startswith(("/", "\\\\")):
                raise RuntimeError(f"{label} contains forbidden absolute path material")


def tool_authority(path: Path, role: str) -> dict[str, Any]:
    process = subprocess.run([str(path), "-version"], check=False, capture_output=True, text=True)
    if process.returncode != 0:
        raise RuntimeError(f"{role} version probe failed with return code {process.returncode}")
    lines = (process.stdout or process.stderr).splitlines()
    if not lines:
        raise RuntimeError(f"{role} version probe returned no version line")
    version = sanitized_private_text(lines[0])
    if "<private-path>" in version:
        raise RuntimeError(f"{role} version line contains private path material")
    return {"basename": path.name, **file_record(path), "version": version}


def probe_video(ffprobe: Path, path: Path, expected_frames: int) -> dict[str, Any]:
    command = [
        str(ffprobe),
        "-v", "error",
        "-count_frames",
        "-show_entries", "stream=index,codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,nb_frames,nb_read_frames,duration,pix_fmt",
        "-of", "json",
        str(path),
    ]
    process = subprocess.run(command, check=False, capture_output=True, text=True)
    if process.returncode != 0:
        raise RuntimeError(f"ffprobe failed with return code {process.returncode}")
    try:
        value = json.loads(process.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError("ffprobe returned invalid JSON") from error
    streams = value.get("streams")
    if not isinstance(streams, list) or len(streams) != 1:
        raise RuntimeError("finalized animatic must contain exactly one stream and no audio/data extras")
    stream = streams[0]
    count_value = stream.get("nb_read_frames", stream.get("nb_frames"))
    try:
        frame_count = int(count_value)
    except (TypeError, ValueError) as error:
        raise RuntimeError(f"ffprobe did not return an exact decoded frame count: {count_value}") from error
    if (
        stream.get("codec_type") != "video"
        or stream.get("codec_name") != "h264"
        or int(stream.get("width", 0)) != WIDTH
        or int(stream.get("height", 0)) != HEIGHT
        or stream.get("r_frame_rate") != "30/1"
        or frame_count != expected_frames
        or stream.get("pix_fmt") != "yuv420p"
    ):
        raise RuntimeError(f"finalized animatic stream authority mismatch: {stream}")
    expected_duration = expected_frames / FPS
    try:
        duration = float(stream.get("duration"))
    except (TypeError, ValueError) as error:
        raise RuntimeError("ffprobe did not return a numeric duration") from error
    if abs(duration - expected_duration) > 1.0 / FPS + 1e-6:
        raise RuntimeError(f"finalized animatic duration mismatch: {duration} != {expected_duration}")
    return {
        "streamCount": 1,
        "noExtraStreams": True,
        "codecType": stream.get("codec_type"),
        "codec": stream.get("codec_name"),
        "width": int(stream["width"]),
        "height": int(stream["height"]),
        "rFrameRate": stream["r_frame_rate"],
        "averageFrameRate": stream.get("avg_frame_rate"),
        "pixelFormat": stream["pix_fmt"],
        "decodedFrameCount": frame_count,
        "durationSeconds": rounded(duration, 6),
    }


def load_finalization_manifest(
    root: Path,
    plan: dict[str, Any],
    current_source_frames_manifest: dict[str, Any],
) -> dict[str, Any]:
    path = root / "animatic" / "mobile-animatic-finalization.json"
    if path.is_file():
        value = json.loads(path.read_text(encoding="utf-8"))
        modes = value.get("modes")
        mode_names = set(modes) if isinstance(modes, dict) else set()
        expected_status = "COMPLETE" if mode_names == set(FINALIZATION_MODES) else "IN_PROGRESS"
        if (
            value.get("schema") != FINALIZATION_SCHEMA
            or value.get("status") != expected_status
            or value.get("source") != plan["source"]
            or value.get("sourceBuild") != plan["sourceBuild"]
            or value.get("producer") != plan["producer"]
            or value.get("sourceFramesManifest") != current_source_frames_manifest
            or value.get("physicalFrameRange") != [1, 500]
            or value.get("forbiddenFrameRange") != [501, 540]
            or value.get("authorization") != cfg.AUTHORIZATION
            or not isinstance(modes, dict)
            or not mode_names.issubset(FINALIZATION_MODES)
            or value.get("frame501Through540Encoded") is not False
            or value.get("complete540FrameCyclesFilmStarted") is not False
            or value.get("finalRefinedMediaIntegrationStarted") is not False
            or value.get("phase5Authorized") is not False
        ):
            raise RuntimeError("existing animatic finalization manifest is stale or malformed")
        assert_no_absolute_path_strings(value, "existing finalization manifest")
        return value
    return {
        "schema": FINALIZATION_SCHEMA,
        "status": "IN_PROGRESS",
        "source": plan["source"],
        "sourceBuild": plan["sourceBuild"],
        "producer": plan["producer"],
        "sourceFramesManifest": current_source_frames_manifest,
        "physicalFrameRange": [1, 500],
        "forbiddenFrameRange": [501, 540],
        "authorization": cfg.AUTHORIZATION,
        "modes": {},
        "frame501Through540Encoded": False,
        "complete540FrameCyclesFilmStarted": False,
        "finalRefinedMediaIntegrationStarted": False,
        "phase5Authorized": False,
    }


def finalization_mode_record_valid(
    root: Path,
    record: dict[str, Any],
    mode: str,
    current_source_frames_manifest: dict[str, Any],
    plan: dict[str, Any],
    ffprobe: Path,
) -> bool:
    spec = FINALIZATION_MODES[mode]
    target = root / "animatic" / spec["filename"]
    if not mp4_header_valid(target):
        return False
    expected_file = record.get("file")
    tool_keys = {"basename", "bytes", "sha256", "version"}
    tools_sanitized = all(
        isinstance(record.get(role), dict)
        and set(record[role]) == tool_keys
        and not Path(str(record[role]["basename"])).is_absolute()
        and "<private-path>" not in str(record[role]["version"])
        for role in ("ffmpeg", "ffprobe")
    )
    frame_count = spec["end"] - spec["start"] + 1
    expected_command = {
        "tool": record.get("ffmpeg", {}).get("basename"),
        "inputPattern": "animatic/frames/F%03d.png",
        "startNumber": spec["start"],
        "frameCount": frame_count,
        "frameRate": FPS,
        "audio": "none",
        "videoCodec": "libx264",
        "preset": "slow",
        "crf": 18,
        "pixelFormat": "yuv420p",
        "metadata": "stripped",
        "output": relative_output_path(root, target),
    }
    fresh_probe = probe_video(ffprobe, target, frame_count)
    return (
        record.get("status") == "PASS"
        and record.get("mode") == mode
        and record.get("role") == spec["role"]
        and record.get("source") == plan["source"]
        and record.get("sourceBuild") == plan["sourceBuild"]
        and record.get("producer") == plan["producer"]
        and record.get("sourceFramesManifest") == current_source_frames_manifest
        and record.get("physicalFrameRange") == [1, 500]
        and record.get("forbiddenFrameRange") == [501, 540]
        and record.get("frameRange") == [spec["start"], spec["end"]]
        and record.get("encodedFrameCount") == frame_count
        and record.get("path") == relative_output_path(root, target)
        and expected_file == file_record(target)
        and tools_sanitized
        and record.get("commandDescription") == expected_command
        and record.get("probe") == fresh_probe
        and record.get("authorization") == cfg.AUTHORIZATION
        and record.get("reviewAnimaticOnly") is True
        and record.get("finalRefinedMedia") is False
        and record.get("frame501Through540Encoded") is False
        and record.get("complete540FrameCyclesFilmStarted") is False
        and record.get("finalRefinedMediaIntegrationStarted") is False
        and record.get("phase5Authorized") is False
        and "command" not in record
    )


def run_finalize(
    root: Path,
    mode: str,
    ffmpeg_value: str | None,
    ffprobe_value: str | None,
    authorities: dict[str, Any],
) -> Path:
    if mode not in FINALIZATION_MODES:
        raise RuntimeError(f"unknown bounded MP4 mode: {mode}")
    plan = validate_plan(root, authorities)
    files = scan_frame_files(root, plan)
    current_manifest_path = root / "animatic" / "mobile-animatic-frame-manifest.json"
    current_manifest = json.loads(current_manifest_path.read_text(encoding="utf-8"))
    rebuilt_manifest = manifest_value(root, plan, files)
    if current_manifest != rebuilt_manifest:
        raise RuntimeError("stored physical-frame manifest differs from a full receipt/hash rescan")
    spec = FINALIZATION_MODES[mode]
    required = list(range(spec["start"], spec["end"] + 1))
    missing = [frame for frame in required if frame not in files]
    if missing:
        raise RuntimeError(f"cannot finalize {mode}; authenticated frames are missing: {compact_ranges(missing)}")
    if any(frame > PHYSICAL_FRAME_END for frame in files):
        raise RuntimeError("forbidden F501-F540 frames are present")

    ffmpeg = require_tool(ffmpeg_value, "ffmpeg")
    ffprobe = require_tool(ffprobe_value or str(ffmpeg.with_name("ffprobe.exe")), "ffprobe")
    ffmpeg_authority = tool_authority(ffmpeg, "ffmpeg")
    ffprobe_authority = tool_authority(ffprobe, "ffprobe")
    current_manifest_authority = {
        "path": relative_output_path(root, current_manifest_path),
        **file_record(current_manifest_path),
    }
    finalization = load_finalization_manifest(root, plan, current_manifest_authority)
    for existing_mode, existing_record in finalization["modes"].items():
        if not isinstance(existing_record, dict) or not finalization_mode_record_valid(
            root,
            existing_record,
            existing_mode,
            current_manifest_authority,
            plan,
            ffprobe,
        ):
            raise RuntimeError(f"existing {existing_mode} finalization authority is stale or divergent")
    existing = finalization["modes"].get(mode)
    if isinstance(existing, dict):
        return root / "animatic" / "mobile-animatic-finalization.json"

    target = root / "animatic" / spec["filename"]
    if target.exists():
        raise RuntimeError(f"refusing to overwrite an unauthenticated existing MP4: {target.name}")
    pending = target.with_name(target.stem + ".pending.mp4")
    if pending.exists():
        raise RuntimeError(f"stale MP4 staging file exists: {pending.name}")
    frame_count = spec["end"] - spec["start"] + 1
    pattern = root / "animatic" / "frames" / "F%03d.png"
    command = [
        str(ffmpeg),
        "-hide_banner",
        "-loglevel", "error",
        "-nostdin",
        "-n",
        "-framerate", str(FPS),
        "-start_number", str(spec["start"]),
        "-i", str(pattern),
        "-frames:v", str(frame_count),
        "-an",
        "-c:v", "libx264",
        "-preset", "slow",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-map_metadata", "-1",
        str(pending),
    ]
    process = subprocess.run(command, check=False, capture_output=True, text=True)
    if process.returncode != 0:
        pending.unlink(missing_ok=True)
        raise RuntimeError(f"ffmpeg failed with return code {process.returncode}")
    if not mp4_header_valid(pending):
        pending.unlink(missing_ok=True)
        raise RuntimeError("ffmpeg did not emit a valid staged MP4")
    probe = probe_video(ffprobe, pending, frame_count)
    os.replace(pending, target)
    if not mp4_header_valid(target):
        raise RuntimeError("published MP4 failed its container-header check")
    record = {
        "status": "PASS",
        "mode": mode,
        "role": spec["role"],
        "source": plan["source"],
        "sourceBuild": plan["sourceBuild"],
        "producer": plan["producer"],
        "path": relative_output_path(root, target),
        "file": file_record(target),
        "physicalFrameRange": [1, 500],
        "forbiddenFrameRange": [501, 540],
        "frameRange": [spec["start"], spec["end"]],
        "encodedFrameCount": frame_count,
        "sourceFramesManifest": current_manifest_authority,
        "ffmpeg": ffmpeg_authority,
        "ffprobe": ffprobe_authority,
        "commandDescription": {
            "tool": ffmpeg.name,
            "inputPattern": "animatic/frames/F%03d.png",
            "startNumber": spec["start"],
            "frameCount": frame_count,
            "frameRate": FPS,
            "audio": "none",
            "videoCodec": "libx264",
            "preset": "slow",
            "crf": 18,
            "pixelFormat": "yuv420p",
            "metadata": "stripped",
            "output": relative_output_path(root, target),
        },
        "probe": probe,
        "authorization": cfg.AUTHORIZATION,
        "reviewAnimaticOnly": True,
        "finalRefinedMedia": False,
        "frame501Through540Encoded": False,
        "complete540FrameCyclesFilmStarted": False,
        "finalRefinedMediaIntegrationStarted": False,
        "phase5Authorized": False,
    }
    finalization["modes"][mode] = record
    finalization["status"] = "COMPLETE" if set(finalization["modes"]) == set(FINALIZATION_MODES) else "IN_PROGRESS"
    finalization_path = root / "animatic" / "mobile-animatic-finalization.json"
    assert_no_absolute_path_strings(finalization, "finalization manifest")
    atomic_json(finalization_path, finalization)
    records_unchanged(authorities)
    return finalization_path


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("audit", "animatic-chunk", "animatic-finalize"), required=True)
    parser.add_argument("--output-root", required=True)
    parser.add_argument("--accepted-r1-mobile-root")
    parser.add_argument("--start", type=int)
    parser.add_argument("--end", type=int)
    parser.add_argument("--finalization-mode", choices=tuple(FINALIZATION_MODES))
    parser.add_argument("--ffmpeg")
    parser.add_argument("--ffprobe")
    args = parser.parse_args(argv)
    if args.mode == "animatic-chunk" and (args.start is None or args.end is None):
        parser.error("animatic-chunk requires --start and --end")
    if args.mode == "audit" and args.accepted_r1_mobile_root is None:
        parser.error("audit requires --accepted-r1-mobile-root")
    if args.mode != "audit" and args.accepted_r1_mobile_root is not None:
        parser.error("--accepted-r1-mobile-root is valid only for audit")
    if args.mode != "animatic-chunk" and (args.start is not None or args.end is not None):
        parser.error("--start/--end are valid only for animatic-chunk")
    if args.mode == "animatic-finalize" and (args.finalization_mode is None or args.ffmpeg is None):
        parser.error("animatic-finalize requires --finalization-mode and --ffmpeg")
    if args.mode != "animatic-finalize" and any(value is not None for value in (args.finalization_mode, args.ffmpeg, args.ffprobe)):
        parser.error("finalization arguments are valid only for animatic-finalize")
    return args


def failure_path(root: Path, mode: str) -> Path:
    safe_mode = mode.replace("-", "_")
    return root / f"phase4r1-1-mobile-optics-{safe_mode}-failure.json"


def main() -> None:
    args = parse_args()
    root = create_fresh_root(args.output_root) if args.mode == "audit" else require_existing_root(args.output_root)
    try:
        source_build, authorities = authority_snapshot()
        if args.mode == "audit":
            accepted_r1_mobile = validate_accepted_r1_mobile_root(args.accepted_r1_mobile_root)
            report_path = run_audit(root, source_build, authorities, accepted_r1_mobile)
        elif args.mode == "animatic-chunk":
            report_path = run_chunk(root, args.start, args.end, authorities)
        else:
            report_path = run_finalize(root, args.finalization_mode, args.ffmpeg, args.ffprobe, authorities)
    except BaseException as error:
        failure = {
            "schema": "quantum-hub.phase-4-r1-1.mobile-optics-diagnostic-failure.v1",
            "status": "FAIL",
            "mode": args.mode,
            "errorType": type(error).__name__,
            "error": sanitized_private_text(error),
            "outputRoot": ".",
            "frame501Through540RenderedOrEncoded": False,
            "complete540FrameCyclesFilmStarted": False,
            "finalRefinedMediaIntegrationStarted": False,
            "phase5Authorized": False,
            "humanReviewDecision": None,
        }
        atomic_json(failure_path(root, args.mode), failure)
        raise
    print("PHASE4R1_1_MOBILE_OPTICS_STATUS=PASS")
    print(f"PHASE4R1_1_MOBILE_OPTICS_MODE={args.mode}")
    print(f"PHASE4R1_1_MOBILE_OPTICS_REPORT={report_path}")


if __name__ == "__main__":
    main()
