"""Produce final-source Phase 4-R1.1 physical evidence outside Git.

This Blender-side producer is intentionally narrow.  It audits the exact final
cumulative R1.1 Blend authority, renders the native 390x844 physical cinematic
only from F001 through F500 in ten fixed chunks of at most fifty frames, and
renders seven fixed physical milestones at each of three portrait viewports.

Every portrait render uses the repaired Mobile camera and mobile cable family;
the authored AUTO sensor fit is proved to resolve VERTICAL at 320x800,
360x800, and 768x1024.  No mode can render F501-F540, save the Blend file,
integrate refined media, authorize production, or begin Phase 5.  Raw Blender
PNGs stay in a fresh external evidence root.  The companion finalizer creates
privacy-clean public derivatives.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import sys
import tempfile
import time
from typing import Any, Iterable, Iterator, Sequence
import uuid
import zlib


if __name__ == "__main__" and "--self-test" not in sys.argv:
    try:
        import bpy  # type: ignore
    except ModuleNotFoundError:  # pragma: no cover - launcher error
        bpy = None  # type: ignore
else:
    bpy = None  # type: ignore


sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
import phase4r1_1_repair_config as cfg


PLAN_SCHEMA = "quantum-hub.phase-4-r1-1.final-physical-evidence-plan.v1"
AUDIT_SCHEMA = "quantum-hub.phase-4-r1-1.final-physical-source-audit.v1"
RECEIPT_SCHEMA = "quantum-hub.phase-4-r1-1.final-physical-frame-receipt.v1"
SEQUENCE_MANIFEST_SCHEMA = "quantum-hub.phase-4-r1-1.final-physical-sequence-manifest.v1"
RESPONSIVE_MANIFEST_SCHEMA = "quantum-hub.phase-4-r1-1.final-physical-responsive-manifest.v1"
CHUNK_SCHEMA = "quantum-hub.phase-4-r1-1.final-physical-chunk.v1"
RESPONSIVE_RUN_SCHEMA = "quantum-hub.phase-4-r1-1.final-physical-responsive-run.v1"
VERIFICATION_SCHEMA = "quantum-hub.phase-4-r1-1.final-physical-raw-verification.v1"
FAILURE_SCHEMA = "quantum-hub.phase-4-r1-1.final-physical-failure.v1"

EXPECTED_BLENDER = (5, 2, 0)
EXPECTED_DERIVATIVE = {
    "bytes": 3_600_194,
    "sha256": "b0c9c7c1cf5a1642870cf03a36791cc50ec31ac207aeae794fbea83c856a79c0",
}
EXPECTED_BUILD_REPORT = {
    "bytes": 4_193_952,
    "sha256": "16e76af00707f7590920c4989b24c6a8506bf949f08de5a74e03c6cd75e61108",
}
EXPECTED_BUILDER = {
    "bytes": 179_480,
    "sha256": "aa90839630295cc05905aba668f214e33a956b34292f8193d0cd6980cc71608d",
}
EXPECTED_CONFIG = {
    "bytes": 13_129,
    "sha256": "f50305e3930a9026dc13aa87f18c201da46df507a2c1609c49557d89e7b9ee8c",
}

FINALIZER_PATH = SCRIPT_DIR / "finalize_phase4r1_1_final_physical_evidence.py"
BUILDER_PATH = SCRIPT_DIR / "build_phase4r1_1_targeted_repair.py"
ROOT_PREFIX = "qsite-phase4r1-1-final-physical"
FPS = 30
FRAME_START = 1
FRAME_END = 500
FORBIDDEN_RANGE = (501, 540)
FULL_VIEWPORT = "390x844"
FULL_WIDTH = 390
FULL_HEIGHT = 844
MAX_CHUNK_FRAMES = 50
FULL_CHUNKS = tuple((start, min(start + 49, FRAME_END)) for start in range(FRAME_START, FRAME_END + 1, 50))
RESPONSIVE_VIEWPORTS = {
    "320x800": (320, 800),
    "360x800": (360, 800),
    "768x1024": (768, 1024),
}
MILESTONES = (
    (1, "dormancy"),
    (76, "early-current"),
    (165, "mid-current"),
    (225, "side-rear-orbit"),
    (370, "stable-q"),
    (450, "late-approach"),
    (480, "threshold"),
)
MILESTONE_ROLE_BY_FRAME = dict(MILESTONES)
EXPECTED_LENS_KEYS = tuple((int(frame), float(value)) for frame, value in cfg.MOBILE_R1_1_LENS_KEYS)
CAMERA_OBJECT_SLOT = cfg.MOBILE_CAMERA_OBJECT_SLOT_IDENTIFIER
CAMERA_DATA_SLOT = cfg.MOBILE_CAMERA_DATA_SLOT_IDENTIFIER
CABLE_COLLECTIONS = {
    family: authority["collection"] for family, authority in cfg.CABLE_FAMILY_AUTHORITY.items()
}
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
SEQUENCE_NAME = re.compile(r"^F(?P<frame>\d{3})\.png$")
RESPONSIVE_NAME = re.compile(r"^F(?P<frame>\d{3})-(?P<role>[a-z0-9-]+)\.png$")
PRIVATE_PATTERNS = (
    re.compile(r"(?i)[a-z]:[/\\]+users[/\\]+"),
    re.compile(r"(?i)onedrive[/\\]+documents[/\\]+quantum-hub"),
    re.compile(r"(?i)[a-z]:[/\\]+.*[/\\]+appdata[/\\]+"),
    re.compile(r"(?i)file://"),
    re.compile(r"(?i)/users/[^/]+/"),
)


def normalized(value: Any) -> Any:
    return json.loads(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False))


def canonical_bytes(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode("utf-8")


def canonical_hash(value: Any) -> str:
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_record(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise RuntimeError(f"missing bound file: {path.name}")
    return {"bytes": path.stat().st_size, "sha256": sha256(path)}


def repo_record(path: Path) -> dict[str, Any]:
    resolved = path.resolve()
    try:
        relative = resolved.relative_to(cfg.REPO_ROOT.resolve()).as_posix()
    except ValueError as error:
        raise RuntimeError(f"bound authority is outside the repository: {path.name}") from error
    return {"path": relative, **file_record(resolved)}


def relative_record(root: Path, path: Path, **metadata: Any) -> dict[str, Any]:
    return {"path": path.resolve().relative_to(root.resolve()).as_posix(), **file_record(path), **metadata}


def assert_no_private_strings(value: Any, label: str) -> None:
    text = json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else value
    for pattern in PRIVATE_PATTERNS:
        if pattern.search(text):
            raise RuntimeError(f"private path rejected from {label}")


def safe_error(error: BaseException) -> str:
    value = f"{type(error).__name__}: {error}"
    for pattern in PRIVATE_PATTERNS:
        value = pattern.sub("[redacted]/", value)
    return value[:1200]


def atomic_bytes_new(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pending = path.with_name(f".{path.name}.{uuid.uuid4().hex}.pending")
    try:
        with pending.open("xb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        if path.exists():
            raise FileExistsError(f"refusing to replace immutable audit artifact: {path.name}")
        os.replace(pending, path)
    finally:
        pending.unlink(missing_ok=True)


def atomic_bytes_replace(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pending = path.with_name(f".{path.name}.{uuid.uuid4().hex}.pending")
    try:
        with pending.open("xb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(pending, path)
    finally:
        pending.unlink(missing_ok=True)


def atomic_json_new(path: Path, value: dict[str, Any]) -> None:
    assert_no_private_strings(value, path.name)
    atomic_bytes_new(path, canonical_bytes(value))


def atomic_json_replace(path: Path, value: dict[str, Any]) -> None:
    assert_no_private_strings(value, path.name)
    atomic_bytes_replace(path, canonical_bytes(value))


def parse_png(path: Path) -> dict[str, Any]:
    payload = path.read_bytes()
    if not payload.startswith(PNG_SIGNATURE):
        raise RuntimeError(f"invalid PNG signature: {path.name}")
    offset = len(PNG_SIGNATURE)
    chunks: list[str] = []
    width = height = bit_depth = color_type = None
    saw_idat = False
    saw_iend = False
    while offset < len(payload):
        if offset + 12 > len(payload):
            raise RuntimeError(f"truncated PNG chunk: {path.name}")
        length = struct.unpack(">I", payload[offset : offset + 4])[0]
        kind = payload[offset + 4 : offset + 8]
        end = offset + 12 + length
        if end > len(payload):
            raise RuntimeError(f"truncated PNG payload: {path.name}")
        data = payload[offset + 8 : offset + 8 + length]
        expected_crc = struct.unpack(">I", payload[offset + 8 + length : end])[0]
        actual_crc = zlib.crc32(kind + data) & 0xFFFFFFFF
        if expected_crc != actual_crc:
            raise RuntimeError(f"PNG CRC failure: {path.name}")
        name = kind.decode("ascii", errors="strict")
        chunks.append(name)
        if kind == b"IHDR":
            if length != 13:
                raise RuntimeError(f"invalid PNG IHDR: {path.name}")
            width, height, bit_depth, color_type = struct.unpack(">IIBB", data[:10])
        elif kind == b"IDAT":
            saw_idat = True
        elif kind == b"IEND":
            saw_iend = True
            if end != len(payload):
                raise RuntimeError(f"bytes follow PNG IEND: {path.name}")
        offset = end
    if not saw_idat or not saw_iend or width is None or height is None:
        raise RuntimeError(f"incomplete PNG: {path.name}")
    return {
        "width": int(width),
        "height": int(height),
        "bitDepth": int(bit_depth),
        "colorType": int(color_type),
        "chunks": chunks,
    }


def validate_png(path: Path, width: int, height: int) -> dict[str, Any]:
    parsed = parse_png(path)
    if (parsed["width"], parsed["height"]) != (width, height):
        raise RuntimeError(f"wrong PNG dimensions for {path.name}: {(parsed['width'], parsed['height'])}")
    return {**file_record(path), **parsed}


def expected_root_prefix() -> str:
    producer = file_record(Path(__file__).resolve())
    return f"{ROOT_PREFIX}-{EXPECTED_DERIVATIVE['sha256'][:8]}-{producer['sha256'][:8]}-"


def validate_external_root(path: Path, *, must_exist: bool) -> Path:
    root = path.expanduser().resolve()
    repo = cfg.REPO_ROOT.resolve()
    try:
        root.relative_to(repo)
    except ValueError:
        pass
    else:
        raise RuntimeError("evidence root must remain external and untracked")
    if not root.name.startswith(expected_root_prefix()):
        raise RuntimeError(f"evidence root must begin with {expected_root_prefix()}")
    if must_exist:
        if not root.is_dir():
            raise RuntimeError("existing external evidence root is required")
    elif root.exists():
        raise RuntimeError("audit requires a fresh nonexistent evidence root")
    return root


def create_fresh_root(value: str) -> Path:
    root = validate_external_root(Path(value), must_exist=False)
    if not root.parent.is_dir():
        raise RuntimeError("evidence-root parent must already exist")
    root.mkdir()
    for relative in (
        "reports",
        "manifests",
        f"sequence/{FULL_VIEWPORT}/frames",
        "sequence/chunks",
        "responsive/runs",
        *(f"responsive/raw/{viewport}" for viewport in RESPONSIVE_VIEWPORTS),
    ):
        (root / relative).mkdir(parents=True, exist_ok=False)
    return root


def require_existing_root(value: str) -> Path:
    return validate_external_root(Path(value), must_exist=True)


def authorization_denials() -> dict[str, bool]:
    return {
        "complete540FrameCyclesFilmStarted": False,
        "complete540FrameCyclesFilmResumed": False,
        "complete540FrameEeveeFilmRendered": False,
        "frame501Through540RenderedOrEncoded": False,
        "finalRefinedMediaIntegrationStarted": False,
        "generativeVideoAuthorized": False,
        "phase5Authorized": False,
        "humanAccepted": False,
    }


def validate_build_contract(build: dict[str, Any], derivative: dict[str, Any]) -> dict[str, Any]:
    if build.get("status") != "PASS" or build.get("throughStage") != "crt":
        raise RuntimeError("final cumulative source build is not PASS through CRT")
    if build.get("derivative") != derivative:
        raise RuntimeError("source-build derivative binding differs")
    if build.get("authorization") != normalized(cfg.AUTHORIZATION):
        raise RuntimeError("source-build authorization denials differ")
    timeline = build.get("timeline")
    if not isinstance(timeline, dict) or timeline.get("unchanged") is not True:
        raise RuntimeError("540-frame/30fps timeline preservation is not proved")
    expected_timeline = {"frameStart": 1, "frameEnd": 540, "fps": 30, "fpsBase": 1.0}
    if timeline.get("after") != expected_timeline or timeline.get("before") != expected_timeline:
        raise RuntimeError("source timeline differs from accepted R1")
    stages = build.get("stages")
    if not isinstance(stages, dict) or set(stages) != {"periphery", "cable", "mobile", "crt"}:
        raise RuntimeError("source-build repair-stage set differs")
    periphery = stages["periphery"]
    cable = stages["cable"]
    mobile = stages["mobile"]
    crt = stages["crt"]
    if (
        periphery.get("collection") != cfg.COLLECTION
        or periphery.get("objectCount") != 61
        or periphery.get("lightCount") != 2
        or periphery.get("authorityAfterPeriphery", {}).get("objectCount") != 63
    ):
        raise RuntimeError("peripheral proving-hall authority differs")
    if (
        cable.get("exactlyTwoAllowedMaterialGraphsChanged") is not True
        or cable.get("fixedAuthorityUnchanged") != {
            "cableContactProfileGeometry": True,
            "cableCurrentProgressionActions": True,
            "cableFamilyCollectionState": True,
            "cableLocalResponseAuthority": True,
            "cableMaterialBindings": True,
            "cableRouteGeometryAndTopology": True,
        }
        or cable.get("currentStateHashesUnchanged") is not True
        or cable.get("sourceCorridorAxisAuditUnchanged") is not True
    ):
        raise RuntimeError("physical graphite-current authority differs")
    if (
        mobile.get("postSaveAuthorityExact") is not True
        or mobile.get("onlyExistingMobileDataSlotLensCurveChanged") is not True
        or mobile.get("postSaveLensKeys", {}).get("keys")
        != [{"frame": frame, "millimeters": value} for frame, value in EXPECTED_LENS_KEYS]
    ):
        raise RuntimeError("repaired mobile optical authority differs")
    q_treatment = crt.get("postSaveQPhosphorTreatment")
    if (
        crt.get("postSaveAuthorityExact") is not True
        or crt.get("onlyAuthorizedMaterialGraphDelta") is not True
        or crt.get("preEffectsSourceDifference", {}).get("zeroDifference") is not True
        or not isinstance(q_treatment, dict)
        or q_treatment.get("authority") != normalized(cfg.CRT_MATERIAL_AUTHORITY["qPhosphor"])
        or q_treatment.get("nodeCount") != 58
        or q_treatment.get("linkCount") != 77
        or q_treatment.get("imageReferences", {}).get("samplerCount") != 9
    ):
        raise RuntimeError("final exact-Q CRT material authority differs")
    if any(value is not False for value in build["authorization"].values()):
        raise RuntimeError("an unauthorized production flag is set")
    return {
        "status": "PASS",
        "throughStage": "crt",
        "repairCategories": ["periphery", "graphite-current", "mobile-optics", "crt-phosphor-glass"],
        "timeline": timeline["after"],
        "exactQ": build.get("exactQ"),
        "preEffectsQDifferenceZero": True,
        "crtCalibration": q_treatment["authority"],
        "mobileLensKeys": mobile["postSaveLensKeys"]["keys"],
    }


def authority_snapshot() -> tuple[dict[str, Any], dict[str, Any]]:
    if bpy is None:
        raise RuntimeError("this mode must run inside Blender")
    if tuple(int(value) for value in bpy.app.version[:3]) != EXPECTED_BLENDER:
        raise RuntimeError(f"Blender {EXPECTED_BLENDER} is required")
    opened = Path(bpy.data.filepath).resolve()
    if opened != cfg.DERIVATIVE.resolve():
        raise RuntimeError("Blender did not open the exact final cumulative source")
    derivative = repo_record(cfg.DERIVATIVE)
    source_build = repo_record(cfg.BUILD_REPORT)
    producer = repo_record(Path(__file__).resolve())
    finalizer = repo_record(FINALIZER_PATH)
    if {key: derivative[key] for key in ("bytes", "sha256")} != EXPECTED_DERIVATIVE:
        raise RuntimeError("final cumulative source bytes/hash differ")
    if {key: source_build[key] for key in ("bytes", "sha256")} != EXPECTED_BUILD_REPORT:
        raise RuntimeError("source-build bytes/hash differ")
    build = json.loads(cfg.BUILD_REPORT.read_text(encoding="utf-8"))
    builder = repo_record(BUILDER_PATH)
    config = repo_record(Path(cfg.__file__).resolve())
    if {key: builder[key] for key in ("bytes", "sha256")} != EXPECTED_BUILDER:
        raise RuntimeError("source builder bytes/hash differ")
    if {key: config[key] for key in ("bytes", "sha256")} != EXPECTED_CONFIG:
        raise RuntimeError("source config bytes/hash differ")
    if build.get("producerAuthorities") != {"builder": builder, "config": config}:
        raise RuntimeError("source-build builder/config authority binding differs")
    summary = validate_build_contract(build, derivative)
    authorities = {
        "source": derivative,
        "sourceBuild": source_build,
        "sourceBuilder": builder,
        "sourceConfig": config,
        "producer": producer,
        "finalizer": finalizer,
    }
    assert_no_private_strings(authorities, "authority snapshot")
    return summary, authorities


def records_unchanged(authorities: dict[str, Any]) -> bool:
    expected = {
        "source": cfg.DERIVATIVE,
        "sourceBuild": cfg.BUILD_REPORT,
        "sourceBuilder": BUILDER_PATH,
        "sourceConfig": Path(cfg.__file__).resolve(),
        "producer": Path(__file__).resolve(),
        "finalizer": FINALIZER_PATH,
    }
    for key, path in expected.items():
        if repo_record(path) != authorities[key]:
            raise RuntimeError(f"bound authority changed during evidence production: {key}")
    return True


def iter_action_fcurves(action: Any) -> Iterator[Any]:
    legacy = getattr(action, "fcurves", None)
    if legacy is not None:
        try:
            curves = list(legacy)
        except (AttributeError, RuntimeError, TypeError):
            curves = []
        if curves:
            yield from curves
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


def exact_mobile_camera() -> tuple[Any, dict[str, Any]]:
    camera = bpy.data.objects.get(cfg.MOBILE_CAMERA_OBJECT)
    data = bpy.data.cameras.get(cfg.MOBILE_CAMERA_DATA)
    action = bpy.data.actions.get(cfg.MOBILE_CAMERA_ACTION)
    rig = bpy.data.objects.get(cfg.MOBILE_ORBIT_RIG)
    aim = bpy.data.objects.get(cfg.MOBILE_AIM_OBJECT)
    if camera is None or camera.type != "CAMERA" or data is None or camera.data != data:
        raise RuntimeError("exact repaired Mobile camera object/data binding is missing")
    if (
        rig is None
        or aim is None
        or camera.parent is None
        or camera.parent.as_pointer() != rig.as_pointer()
    ):
        raise RuntimeError("exact repaired Mobile rig/aim binding is missing")
    object_animation = camera.animation_data
    data_animation = data.animation_data
    if (
        action is None
        or object_animation is None
        or data_animation is None
        or object_animation.action is not action
        or data_animation.action is not action
        or object_animation.action_slot is None
        or data_animation.action_slot is None
    ):
        raise RuntimeError("Mobile object/data do not share the exact layered action")
    if list(object_animation.nla_tracks) or list(data_animation.nla_tracks):
        raise RuntimeError("Mobile camera has unexpected NLA tracks")
    slots = list(action.slots)
    if (
        len(slots) != 2
        or {(str(slot.identifier), str(slot.target_id_type)) for slot in slots}
        != {(CAMERA_OBJECT_SLOT, "OBJECT"), (CAMERA_DATA_SLOT, "CAMERA")}
    ):
        raise RuntimeError("Mobile camera layered-action slots differ")
    curves = list(iter_action_fcurves(action))
    lens_curves = [curve for curve in curves if curve.data_path == "lens" and int(curve.array_index) == 0]
    if len(curves) != 6 or sum(len(curve.keyframe_points) for curve in curves) != 82 or len(lens_curves) != 1:
        raise RuntimeError("Mobile action curve topology differs")
    curve = lens_curves[0]
    keys = tuple((int(round(point.co.x)), float(point.co.y)) for point in curve.keyframe_points)
    if len(keys) != len(EXPECTED_LENS_KEYS) or any(
        frame != expected_frame or abs(value - expected_value) > 2e-5
        for (frame, value), (expected_frame, expected_value) in zip(keys, EXPECTED_LENS_KEYS)
    ):
        raise RuntimeError("saved Mobile focal curve differs")
    if curve.extrapolation != "CONSTANT" or curve.mute or curve.lock or list(curve.modifiers):
        raise RuntimeError("Mobile focal-curve state differs")
    if any(point.interpolation != "LINEAR" for point in curve.keyframe_points):
        raise RuntimeError("Mobile focal curve is not linear")
    if (
        data.type != "PERSP"
        or data.sensor_fit != "AUTO"
        or abs(float(data.sensor_width) - 36.0) > 1e-9
        or abs(float(data.sensor_height) - 24.0) > 1e-9
        or abs(float(data.clip_start) - 0.005) > 1e-9
        or abs(float(data.clip_end) - 1000.0) > 1e-9
    ):
        raise RuntimeError("Mobile projection authority differs")
    return camera, {
        "object": camera.name,
        "data": data.name,
        "action": action.name,
        "rig": rig.name,
        "aim": aim.name,
        "sensorFitAuthored": data.sensor_fit,
        "lensKeys": [[frame, value] for frame, value in EXPECTED_LENS_KEYS],
        "actionCurveCount": len(curves),
        "actionKeyframePointCount": sum(len(item.keyframe_points) for item in curves),
    }


def lens_at(frame: int) -> float:
    if frame <= EXPECTED_LENS_KEYS[0][0]:
        return EXPECTED_LENS_KEYS[0][1]
    if frame >= EXPECTED_LENS_KEYS[-1][0]:
        return EXPECTED_LENS_KEYS[-1][1]
    for (left_frame, left_value), (right_frame, right_value) in zip(EXPECTED_LENS_KEYS, EXPECTED_LENS_KEYS[1:]):
        if left_frame <= frame <= right_frame:
            if right_frame == left_frame:
                return left_value
            fraction = (frame - left_frame) / (right_frame - left_frame)
            return left_value + (right_value - left_value) * fraction
    raise RuntimeError("unreachable focal interpolation")


def choose_eevee_engine(scene: Any) -> str:
    identifiers = {item.identifier for item in scene.render.bl_rna.properties["engine"].enum_items}
    for candidate in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        if candidate in identifiers:
            return candidate
    raise RuntimeError("Eevee is unavailable")


def camera_family_proof(width: int, height: int) -> dict[str, Any]:
    if width >= height:
        raise RuntimeError("final physical producer accepts portrait viewports only")
    return {
        "cameraFamily": "mobile",
        "camera": cfg.MOBILE_CAMERA_OBJECT,
        "authoredSensorFit": "AUTO",
        "autoResolutionRule": "HORIZONTAL when pixel-aspect-weighted width >= height; otherwise VERTICAL",
        "pixelAspectWeightedRaster": [float(width), float(height)],
        "resolvedSensorFit": "VERTICAL",
        "portraitAutoResolvesVertical": True,
        "why768x1024UsesMobile": "768x1024 is portrait; AUTO resolves VERTICAL, so the authored Mobile camera/media family is authoritative",
    }


def render_settings(width: int, height: int, engine: str) -> dict[str, Any]:
    return {
        "engine": engine,
        "resolution": [width, height],
        "resolutionPercentage": 100,
        "pixelAspect": [1.0, 1.0],
        "format": "PNG",
        "colorMode": "RGB",
        "colorDepth": "8",
        "compression": 35,
        "viewTransform": "AgX",
        "look": "AgX - Medium High Contrast",
        "intendedExposureStops": 1.0,
        "motionBlur": False,
        "camera": cfg.MOBILE_CAMERA_OBJECT,
        "cableFamily": "mobile",
        "physicalFrameRangeOnly": [1, 500],
        "forbiddenFrameRange": [501, 540],
        "cameraFamilyProof": camera_family_proof(width, height),
    }


def scene_signature(scene: Any) -> dict[str, Any]:
    render = scene.render
    image = render.image_settings
    view = scene.view_settings
    return {
        "camera": None if scene.camera is None else scene.camera.name,
        "frame": int(scene.frame_current),
        "subframe": round(float(scene.frame_subframe), 8),
        "frameRange": [int(scene.frame_start), int(scene.frame_end)],
        "render": {
            "engine": render.engine,
            "resolution": [int(render.resolution_x), int(render.resolution_y), int(render.resolution_percentage)],
            "pixelAspect": [float(render.pixel_aspect_x), float(render.pixel_aspect_y)],
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
        "view": {"viewTransform": view.view_transform, "look": view.look, "exposure": float(view.exposure)},
        "cableVisibility": {family: bool(bpy.data.collections[name].hide_render) for family, name in CABLE_COLLECTIONS.items()},
    }


class SceneTransaction:
    """Restore every in-memory producer mutation; this script never saves."""

    def __init__(self) -> None:
        self.scene = bpy.context.scene
        self.signature = scene_signature(self.scene)
        self.camera = self.scene.camera
        self.frame = int(self.scene.frame_current)
        self.subframe = float(self.scene.frame_subframe)
        self.collection_visibility = {collection.name: bool(collection.hide_render) for collection in bpy.data.collections}

    def restore(self) -> None:
        scene = self.scene
        saved = self.signature
        scene.camera = self.camera
        render = scene.render
        render.engine = saved["render"]["engine"]
        render.resolution_x, render.resolution_y, render.resolution_percentage = saved["render"]["resolution"]
        render.pixel_aspect_x, render.pixel_aspect_y = saved["render"]["pixelAspect"]
        render.filepath = saved["render"]["filepath"]
        render.film_transparent = saved["render"]["filmTransparent"]
        render.use_file_extension = saved["render"]["useFileExtension"]
        render.use_motion_blur = saved["render"]["useMotionBlur"]
        for key, value in {
            "file_format": saved["render"]["image"]["fileFormat"],
            "color_mode": saved["render"]["image"]["colorMode"],
            "color_depth": saved["render"]["image"]["colorDepth"],
            "compression": saved["render"]["image"]["compression"],
        }.items():
            setattr(render.image_settings, key, value)
        scene.view_settings.view_transform = saved["view"]["viewTransform"]
        scene.view_settings.look = saved["view"]["look"]
        scene.view_settings.exposure = saved["view"]["exposure"]
        for name, hidden in self.collection_visibility.items():
            collection = bpy.data.collections.get(name)
            if collection is not None:
                collection.hide_render = hidden
        scene.frame_set(self.frame, subframe=self.subframe)
        bpy.context.view_layer.update()
        if scene_signature(scene) != self.signature:
            raise RuntimeError("producer did not exactly restore scene state")


def configure_render(scene: Any, camera: Any, width: int, height: int) -> dict[str, Any]:
    proof = camera_family_proof(width, height)
    if camera.data.sensor_fit != "AUTO":
        raise RuntimeError("saved Mobile camera sensor fit is not AUTO")
    engine = choose_eevee_engine(scene)
    scene.camera = camera
    for family, name in CABLE_COLLECTIONS.items():
        collection = bpy.data.collections.get(name)
        if collection is None:
            raise RuntimeError(f"missing exact cable collection: {name}")
        collection.hide_render = family != "mobile"
    scene.render.engine = engine
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
    settings = render_settings(width, height, engine)
    if settings["cameraFamilyProof"] != proof:
        raise RuntimeError("camera-family proof diverged")
    return settings


def plan_path(root: Path) -> Path:
    return root / "phase4r1-1-final-physical-plan.json"


def source_audit_path(root: Path) -> Path:
    return root / "reports" / "final-physical-source-audit.json"


def sequence_manifest_path(root: Path) -> Path:
    return root / "manifests" / "sequence-390x844-raw-manifest.json"


def responsive_manifest_path(root: Path) -> Path:
    return root / "manifests" / "responsive-raw-manifest.json"


def sequence_frame_path(root: Path, frame: int) -> Path:
    if not FRAME_START <= frame <= FRAME_END:
        raise RuntimeError(f"refusing forbidden/out-of-range sequence frame F{frame:03d}")
    return root / "sequence" / FULL_VIEWPORT / "frames" / f"F{frame:03d}.png"


def responsive_frame_path(root: Path, viewport: str, frame: int, role: str) -> Path:
    if viewport not in RESPONSIVE_VIEWPORTS or MILESTONE_ROLE_BY_FRAME.get(frame) != role:
        raise RuntimeError("refusing non-authoritative responsive frame request")
    return root / "responsive" / "raw" / viewport / f"F{frame:03d}-{role}.png"


def receipt_path(image: Path) -> Path:
    return image.with_suffix(".receipt.json")


def make_plan(authorities: dict[str, Any], source_summary: dict[str, Any], engine: str, camera: dict[str, Any]) -> dict[str, Any]:
    full_settings = render_settings(FULL_WIDTH, FULL_HEIGHT, engine)
    responsive_settings = {
        viewport: render_settings(width, height, engine)
        for viewport, (width, height) in RESPONSIVE_VIEWPORTS.items()
    }
    plan = {
        "schema": PLAN_SCHEMA,
        "status": "PASS",
        "authorities": authorities,
        "sourceSummary": source_summary,
        "camera": camera,
        "fps": FPS,
        "fullSequence": {
            "viewport": FULL_VIEWPORT,
            "resolution": [FULL_WIDTH, FULL_HEIGHT],
            "frameRange": [FRAME_START, FRAME_END],
            "frameCount": FRAME_END - FRAME_START + 1,
            "chunks": [list(chunk) for chunk in FULL_CHUNKS],
            "maximumChunkFrames": MAX_CHUNK_FRAMES,
            "framePattern": f"sequence/{FULL_VIEWPORT}/frames/F%03d.png",
            "receiptPattern": f"sequence/{FULL_VIEWPORT}/frames/F%03d.receipt.json",
            "renderSettings": full_settings,
            "renderSettingsSha256": canonical_hash(full_settings),
        },
        "responsive": {
            "viewports": {viewport: list(size) for viewport, size in RESPONSIVE_VIEWPORTS.items()},
            "milestones": [{"frame": frame, "role": role} for frame, role in MILESTONES],
            "frameCount": len(RESPONSIVE_VIEWPORTS) * len(MILESTONES),
            "cameraFamily": "mobile",
            "allPortraitAutoResolveVertical": True,
            "renderSettings": responsive_settings,
            "renderSettingsSha256": {viewport: canonical_hash(value) for viewport, value in responsive_settings.items()},
        },
        "forbiddenFrameRange": list(FORBIDDEN_RANGE),
        "rawPngsAreNotPublicPackagePayloads": True,
        "authorization": authorization_denials(),
        "humanReviewDecision": None,
    }
    assert_no_private_strings(plan, "plan")
    return plan


def validate_plan(root: Path, authorities: dict[str, Any]) -> dict[str, Any]:
    path = plan_path(root)
    audit_path = source_audit_path(root)
    if not path.is_file() or not audit_path.is_file():
        raise RuntimeError("PASS source audit and immutable plan are required")
    plan = json.loads(path.read_text(encoding="utf-8"))
    audit = json.loads(audit_path.read_text(encoding="utf-8"))
    if (
        plan.get("schema") != PLAN_SCHEMA
        or plan.get("status") != "PASS"
        or plan.get("authorities") != authorities
        or plan.get("forbiddenFrameRange") != [501, 540]
        or plan.get("fullSequence", {}).get("chunks") != [list(value) for value in FULL_CHUNKS]
        or plan.get("fullSequence", {}).get("maximumChunkFrames") != 50
        or plan.get("responsive", {}).get("viewports") != {key: list(value) for key, value in RESPONSIVE_VIEWPORTS.items()}
        or plan.get("responsive", {}).get("milestones") != [{"frame": frame, "role": role} for frame, role in MILESTONES]
        or plan.get("authorization") != authorization_denials()
    ):
        raise RuntimeError("final physical evidence plan is stale or divergent")
    if audit.get("schema") != AUDIT_SCHEMA or audit.get("status") != "PASS" or audit.get("planSha256") != canonical_hash(plan):
        raise RuntimeError("PASS final physical source audit is missing or stale")
    assert_no_private_strings(plan, "loaded plan")
    return plan


def expected_receipt_core(
    root: Path,
    plan: dict[str, Any],
    *,
    kind: str,
    viewport: str,
    frame: int,
    role: str,
    path: Path,
) -> dict[str, Any]:
    if kind == "sequence":
        settings = plan["fullSequence"]["renderSettings"]
    elif kind == "responsive":
        settings = plan["responsive"]["renderSettings"][viewport]
    else:
        raise RuntimeError("unknown receipt kind")
    return {
        "schema": RECEIPT_SCHEMA,
        "status": "PASS",
        "kind": kind,
        "viewport": viewport,
        "frame": frame,
        "role": role,
        "path": path.resolve().relative_to(root.resolve()).as_posix(),
        "authorities": plan["authorities"],
        "plan": relative_record(root, plan_path(root)),
        "renderSettings": settings,
        "renderSettingsSha256": canonical_hash(settings),
        "physicalOnly": True,
        "authorization": authorization_denials(),
    }


def validate_receipt(
    root: Path,
    plan: dict[str, Any],
    *,
    kind: str,
    viewport: str,
    frame: int,
    role: str,
    path: Path,
    width: int,
    height: int,
) -> dict[str, Any] | None:
    receipt = receipt_path(path)
    if not path.is_file() or not receipt.is_file():
        return None
    try:
        value = json.loads(receipt.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    expected = expected_receipt_core(root, plan, kind=kind, viewport=viewport, frame=frame, role=role, path=path)
    if any(value.get(key) != expected_value for key, expected_value in expected.items()):
        return None
    if value.get("file") != {key: validate_png(path, width, height)[key] for key in ("bytes", "sha256")}:
        return None
    return relative_record(
        root,
        path,
        receipt={"path": receipt.resolve().relative_to(root.resolve()).as_posix(), **file_record(receipt)},
        kind=kind,
        viewport=viewport,
        frame=frame,
        role=role,
        engine=value["renderSettings"]["engine"],
        sourceSha256=plan["authorities"]["source"]["sha256"],
        renderSeconds=value.get("renderSeconds"),
    )


def render_frame_atomic(
    root: Path,
    scene: Any,
    camera: Any,
    plan: dict[str, Any],
    *,
    kind: str,
    viewport: str,
    frame: int,
    role: str,
    path: Path,
    width: int,
    height: int,
) -> tuple[dict[str, Any], bool]:
    if not FRAME_START <= frame <= FRAME_END:
        raise RuntimeError("render request is outside the physical F001-F500 boundary")
    existing = validate_receipt(
        root, plan, kind=kind, viewport=viewport, frame=frame, role=role,
        path=path, width=width, height=height,
    )
    if existing is not None:
        return existing, False
    if path.exists() or receipt_path(path).exists():
        raise RuntimeError(f"orphaned or unauthenticated render artifact blocks resume: {path.name}")
    path.parent.mkdir(parents=True, exist_ok=True)
    pending = path.with_name(f".{path.stem}.{uuid.uuid4().hex}.pending.png")
    try:
        scene.frame_set(frame, subframe=0.0)
        bpy.context.view_layer.update()
        expected_lens = lens_at(frame)
        if abs(float(camera.data.lens) - expected_lens) > 2e-5:
            raise RuntimeError(f"Mobile focal authority mismatch at F{frame:03d}")
        scene.render.filepath = str(pending)
        started = time.perf_counter()
        result = bpy.ops.render.render(write_still=True)
        elapsed = time.perf_counter() - started
        if result != {"FINISHED"} or not pending.is_file():
            raise RuntimeError(f"Eevee render did not finish at F{frame:03d}: {result}")
        validate_png(pending, width, height)
        os.replace(pending, path)
        core = expected_receipt_core(root, plan, kind=kind, viewport=viewport, frame=frame, role=role, path=path)
        receipt = {
            **core,
            "file": file_record(path),
            "lensMillimeters": round(float(camera.data.lens), 8),
            "renderSeconds": round(elapsed, 6),
            "frame501Through540Rendered": False,
        }
        atomic_json_new(receipt_path(path), receipt)
        record = validate_receipt(
            root, plan, kind=kind, viewport=viewport, frame=frame, role=role,
            path=path, width=width, height=height,
        )
        if record is None:
            raise RuntimeError(f"new frame receipt failed authentication: {path.name}")
        return record, True
    finally:
        pending.unlink(missing_ok=True)


def compact_ranges(frames: Iterable[int]) -> list[list[int]]:
    values = sorted(set(int(frame) for frame in frames))
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


def scan_sequence(root: Path, plan: dict[str, Any]) -> dict[int, dict[str, Any]]:
    directory = root / "sequence" / FULL_VIEWPORT / "frames"
    records: dict[int, dict[str, Any]] = {}
    expected_receipts: set[str] = set()
    for path in sorted(directory.iterdir()):
        if path.name.startswith(".") or ".pending" in path.name:
            raise RuntimeError(f"stale sequence transaction exists: {path.name}")
        if path.name.endswith(".receipt.json"):
            continue
        match = SEQUENCE_NAME.fullmatch(path.name)
        if match is None:
            raise RuntimeError(f"unexpected sequence payload: {path.name}")
        frame = int(match.group("frame"))
        if not FRAME_START <= frame <= FRAME_END:
            raise RuntimeError(f"forbidden frame exists: {path.name}")
        record = validate_receipt(
            root, plan, kind="sequence", viewport=FULL_VIEWPORT, frame=frame,
            role="complete-forward-physical-cinematic", path=path, width=FULL_WIDTH, height=FULL_HEIGHT,
        )
        if record is None:
            raise RuntimeError(f"unauthenticated sequence frame exists: {path.name}")
        records[frame] = record
        expected_receipts.add(receipt_path(path).name)
    actual_receipts = {path.name for path in directory.glob("*.receipt.json")}
    if actual_receipts != expected_receipts:
        raise RuntimeError("orphaned or missing sequence receipts exist")
    return records


def scan_responsive(root: Path, plan: dict[str, Any]) -> dict[tuple[str, int], dict[str, Any]]:
    records: dict[tuple[str, int], dict[str, Any]] = {}
    for viewport, (width, height) in RESPONSIVE_VIEWPORTS.items():
        directory = root / "responsive" / "raw" / viewport
        expected_receipts: set[str] = set()
        for path in sorted(directory.iterdir()):
            if path.name.startswith(".") or ".pending" in path.name:
                raise RuntimeError(f"stale responsive transaction exists: {path.name}")
            if path.name.endswith(".receipt.json"):
                continue
            match = RESPONSIVE_NAME.fullmatch(path.name)
            if match is None:
                raise RuntimeError(f"unexpected responsive payload: {viewport}/{path.name}")
            frame = int(match.group("frame"))
            role = match.group("role")
            if MILESTONE_ROLE_BY_FRAME.get(frame) != role:
                raise RuntimeError(f"non-authoritative responsive milestone: {viewport}/{path.name}")
            record = validate_receipt(
                root, plan, kind="responsive", viewport=viewport, frame=frame,
                role=role, path=path, width=width, height=height,
            )
            if record is None:
                raise RuntimeError(f"unauthenticated responsive still: {viewport}/{path.name}")
            records[(viewport, frame)] = record
            expected_receipts.add(receipt_path(path).name)
        actual_receipts = {path.name for path in directory.glob("*.receipt.json")}
        if actual_receipts != expected_receipts:
            raise RuntimeError(f"orphaned or missing responsive receipts: {viewport}")
    return records


def sequence_manifest_value(root: Path, plan: dict[str, Any], records: dict[int, dict[str, Any]]) -> dict[str, Any]:
    complete = sorted(records)
    missing = [frame for frame in range(1, 501) if frame not in records]
    return {
        "schema": SEQUENCE_MANIFEST_SCHEMA,
        "status": "COMPLETE" if not missing else "IN_PROGRESS",
        "authorities": plan["authorities"],
        "plan": relative_record(root, plan_path(root)),
        "viewport": FULL_VIEWPORT,
        "resolution": [FULL_WIDTH, FULL_HEIGHT],
        "frameRange": [1, 500],
        "frameCountExpected": 500,
        "frameCountComplete": len(complete),
        "frameCountMissing": len(missing),
        "completeRanges": compact_ranges(complete),
        "missingRanges": compact_ranges(missing),
        "files": [records[frame] for frame in complete],
        "authorization": authorization_denials(),
    }


def responsive_manifest_value(
    root: Path,
    plan: dict[str, Any],
    records: dict[tuple[str, int], dict[str, Any]],
) -> dict[str, Any]:
    expected = [(viewport, frame) for viewport in RESPONSIVE_VIEWPORTS for frame, _role in MILESTONES]
    missing = [{"viewport": viewport, "frame": frame} for viewport, frame in expected if (viewport, frame) not in records]
    return {
        "schema": RESPONSIVE_MANIFEST_SCHEMA,
        "status": "COMPLETE" if not missing else "IN_PROGRESS",
        "authorities": plan["authorities"],
        "plan": relative_record(root, plan_path(root)),
        "viewports": {key: list(value) for key, value in RESPONSIVE_VIEWPORTS.items()},
        "cameraFamily": "mobile",
        "allPortraitAutoResolveVertical": True,
        "frameCountExpected": len(expected),
        "frameCountComplete": len(records),
        "missing": missing,
        "files": [records[key] for key in expected if key in records],
        "authorization": authorization_denials(),
    }


def write_manifests(root: Path, plan: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    sequence = sequence_manifest_value(root, plan, scan_sequence(root, plan))
    responsive = responsive_manifest_value(root, plan, scan_responsive(root, plan))
    atomic_json_replace(sequence_manifest_path(root), sequence)
    atomic_json_replace(responsive_manifest_path(root), responsive)
    return sequence, responsive


def run_audit(root: Path, source_summary: dict[str, Any], authorities: dict[str, Any]) -> Path:
    scene = bpy.context.scene
    camera, camera_authority = exact_mobile_camera()
    transaction = SceneTransaction()
    before_counts = {"objects": len(bpy.data.objects), "materials": len(bpy.data.materials), "images": len(bpy.data.images)}
    source_before = file_record(cfg.DERIVATIVE)
    settings: dict[str, Any]
    try:
        settings = configure_render(scene, camera, FULL_WIDTH, FULL_HEIGHT)
        if settings["engine"] != "BLENDER_EEVEE":
            raise RuntimeError("the Blender 5.2 BLENDER_EEVEE authority is required for final physical evidence")
        for viewport, (width, height) in RESPONSIVE_VIEWPORTS.items():
            proof = camera_family_proof(width, height)
            if proof["resolvedSensorFit"] != "VERTICAL" or proof["cameraFamily"] != "mobile":
                raise RuntimeError(f"camera family proof failed for {viewport}")
        for frame in (1, 76, 165, 225, 370, 450, 480, 500):
            scene.frame_set(frame, subframe=0.0)
            bpy.context.view_layer.update()
            if abs(float(camera.data.lens) - lens_at(frame)) > 2e-5:
                raise RuntimeError(f"saved focal evaluation differs at F{frame:03d}")
    finally:
        transaction.restore()
    after_counts = {"objects": len(bpy.data.objects), "materials": len(bpy.data.materials), "images": len(bpy.data.images)}
    if before_counts != after_counts or file_record(cfg.DERIVATIVE) != source_before:
        raise RuntimeError("source audit mutated the source or datablock inventory")
    records_unchanged(authorities)
    plan = make_plan(authorities, source_summary, settings["engine"], camera_authority)
    atomic_json_new(plan_path(root), plan)
    audit = {
        "schema": AUDIT_SCHEMA,
        "status": "PASS",
        "authorities": authorities,
        "plan": relative_record(root, plan_path(root)),
        "planSha256": canonical_hash(plan),
        "sourceSummary": source_summary,
        "cameraAuthority": camera_authority,
        "responsiveCameraFamily": {
            viewport: camera_family_proof(width, height)
            for viewport, (width, height) in RESPONSIVE_VIEWPORTS.items()
        },
        "renderIntent": {
            "engine": settings["engine"],
            "intendedExposureStops": 1.0,
            "fullPhysicalSequence": {"viewport": FULL_VIEWPORT, "frameRange": [1, 500], "frameCount": 500},
            "responsivePhysicalStills": {"viewports": list(RESPONSIVE_VIEWPORTS), "frames": [frame for frame, _ in MILESTONES]},
            "noResizeOrPostScale": True,
        },
        "sourceImmutability": {"before": source_before, "after": file_record(cfg.DERIVATIVE), "passes": True},
        "datablockCounts": {"before": before_counts, "after": after_counts, "passes": True},
        "authorization": authorization_denials(),
        "humanReviewDecision": None,
    }
    atomic_json_new(source_audit_path(root), audit)
    atomic_json_new(sequence_manifest_path(root), sequence_manifest_value(root, plan, {}))
    atomic_json_new(responsive_manifest_path(root), responsive_manifest_value(root, plan, {}))
    return source_audit_path(root)


def run_sequence_chunk(root: Path, chunk_number: int, authorities: dict[str, Any]) -> Path:
    if not 1 <= chunk_number <= len(FULL_CHUNKS):
        raise RuntimeError("sequence chunk number must be 1 through 10")
    start, end = FULL_CHUNKS[chunk_number - 1]
    if end - start + 1 > MAX_CHUNK_FRAMES or start < 1 or end > 500:
        raise RuntimeError("fixed sequence chunk escaped its bounded contract")
    plan = validate_plan(root, authorities)
    scene = bpy.context.scene
    camera, _camera_authority = exact_mobile_camera()
    transaction = SceneTransaction()
    rendered: list[int] = []
    reused: list[int] = []
    try:
        settings = configure_render(scene, camera, FULL_WIDTH, FULL_HEIGHT)
        if settings != plan["fullSequence"]["renderSettings"]:
            raise RuntimeError("live full-sequence render settings differ from the immutable plan")
        for frame in range(start, end + 1):
            record, created = render_frame_atomic(
                root, scene, camera, plan,
                kind="sequence", viewport=FULL_VIEWPORT, frame=frame,
                role="complete-forward-physical-cinematic",
                path=sequence_frame_path(root, frame), width=FULL_WIDTH, height=FULL_HEIGHT,
            )
            (rendered if created else reused).append(frame)
            print(f"PHASE4R1_1_FINAL_PHYSICAL_FRAME=F{frame:03d}:{'rendered' if created else 'reused'}")
    finally:
        transaction.restore()
    sequence, _responsive = write_manifests(root, plan)
    records_unchanged(authorities)
    report = {
        "schema": CHUNK_SCHEMA,
        "status": "PASS",
        "chunk": chunk_number,
        "frameRange": [start, end],
        "frameCount": end - start + 1,
        "rendered": rendered,
        "reused": reused,
        "sequenceManifest": relative_record(root, sequence_manifest_path(root)),
        "sequenceProgress": {
            "status": sequence["status"],
            "frameCountComplete": sequence["frameCountComplete"],
            "frameCountMissing": sequence["frameCountMissing"],
        },
        "authorities": authorities,
        "authorization": authorization_denials(),
    }
    path = root / "sequence" / "chunks" / f"chunk-{chunk_number:02d}-F{start:03d}-F{end:03d}.json"
    atomic_json_replace(path, report)
    return path


def run_responsive(root: Path, viewport: str, authorities: dict[str, Any]) -> Path:
    if viewport not in RESPONSIVE_VIEWPORTS:
        raise RuntimeError("responsive viewport is not authorized")
    width, height = RESPONSIVE_VIEWPORTS[viewport]
    plan = validate_plan(root, authorities)
    scene = bpy.context.scene
    camera, _camera_authority = exact_mobile_camera()
    transaction = SceneTransaction()
    rendered: list[int] = []
    reused: list[int] = []
    try:
        settings = configure_render(scene, camera, width, height)
        if settings != plan["responsive"]["renderSettings"][viewport]:
            raise RuntimeError("live responsive render settings differ from the immutable plan")
        for frame, role in MILESTONES:
            record, created = render_frame_atomic(
                root, scene, camera, plan,
                kind="responsive", viewport=viewport, frame=frame, role=role,
                path=responsive_frame_path(root, viewport, frame, role), width=width, height=height,
            )
            (rendered if created else reused).append(frame)
            print(f"PHASE4R1_1_FINAL_RESPONSIVE={viewport}:F{frame:03d}:{'rendered' if created else 'reused'}")
    finally:
        transaction.restore()
    _sequence, responsive = write_manifests(root, plan)
    records_unchanged(authorities)
    report = {
        "schema": RESPONSIVE_RUN_SCHEMA,
        "status": "PASS",
        "viewport": viewport,
        "resolution": [width, height],
        "cameraFamily": "mobile",
        "cameraFamilyProof": camera_family_proof(width, height),
        "frames": [frame for frame, _role in MILESTONES],
        "rendered": rendered,
        "reused": reused,
        "responsiveManifest": relative_record(root, responsive_manifest_path(root)),
        "responsiveProgress": {
            "status": responsive["status"],
            "frameCountComplete": responsive["frameCountComplete"],
            "frameCountExpected": responsive["frameCountExpected"],
        },
        "authorities": authorities,
        "authorization": authorization_denials(),
    }
    path = root / "responsive" / "runs" / f"{viewport}.json"
    atomic_json_replace(path, report)
    return path


def run_verify(root: Path, authorities: dict[str, Any]) -> Path:
    plan = validate_plan(root, authorities)
    sequence_records = scan_sequence(root, plan)
    responsive_records = scan_responsive(root, plan)
    sequence = sequence_manifest_value(root, plan, sequence_records)
    responsive = responsive_manifest_value(root, plan, responsive_records)
    if sequence["status"] != "COMPLETE" or len(sequence_records) != 500:
        raise RuntimeError("complete F001-F500 physical sequence is absent")
    if responsive["status"] != "COMPLETE" or len(responsive_records) != 21:
        raise RuntimeError("complete 3x7 responsive physical evidence is absent")
    stored_sequence = json.loads(sequence_manifest_path(root).read_text(encoding="utf-8"))
    stored_responsive = json.loads(responsive_manifest_path(root).read_text(encoding="utf-8"))
    if stored_sequence != sequence or stored_responsive != responsive:
        raise RuntimeError("stored raw manifests are stale")
    forbidden = [
        path.resolve().relative_to(root.resolve()).as_posix()
        for path in root.rglob("*.png")
        if (match := re.search(r"F(\d{3})", path.name)) and 501 <= int(match.group(1)) <= 540
    ]
    if forbidden:
        raise RuntimeError("forbidden F501-F540 PNGs exist")
    records_unchanged(authorities)
    report = {
        "schema": VERIFICATION_SCHEMA,
        "status": "PASS",
        "authorities": authorities,
        "plan": relative_record(root, plan_path(root)),
        "sequenceManifest": relative_record(root, sequence_manifest_path(root)),
        "responsiveManifest": relative_record(root, responsive_manifest_path(root)),
        "sequenceFrameCount": 500,
        "responsiveStillCount": 21,
        "rawPngCount": 521,
        "forbiddenFramesPresent": [],
        "allImagesDecodeAndCrcPass": True,
        "allReceiptsHashAndSizeMatch": True,
        "sourceAuthoritiesRemainExact": True,
        "authorization": authorization_denials(),
        "humanReviewDecision": None,
    }
    path = root / "reports" / "final-physical-raw-verification.json"
    atomic_json_replace(path, report)
    return path


def write_failure(root: Path | None, mode: str, error: BaseException) -> None:
    if root is None or not root.is_dir():
        return
    value = {
        "schema": FAILURE_SCHEMA,
        "status": "FAIL",
        "mode": mode,
        "error": safe_error(error),
        "outputRoot": ".",
        "authorization": authorization_denials(),
        "humanReviewDecision": None,
    }
    atomic_json_replace(root / "reports" / f"failure-{mode}.json", value)


def pure_self_test() -> dict[str, Any]:
    flattened = [frame for start, end in FULL_CHUNKS for frame in range(start, end + 1)]
    if len(FULL_CHUNKS) != 10 or flattened != list(range(1, 501)):
        raise RuntimeError("fixed full-sequence chunk partition self-test failed")
    if any(end - start + 1 > 50 for start, end in FULL_CHUNKS):
        raise RuntimeError("maximum 50-frame chunk self-test failed")
    if any(frame > 500 for frame, _role in MILESTONES) or set(RESPONSIVE_VIEWPORTS) != {"320x800", "360x800", "768x1024"}:
        raise RuntimeError("responsive contract self-test failed")
    if any(camera_family_proof(width, height)["resolvedSensorFit"] != "VERTICAL" for width, height in RESPONSIVE_VIEWPORTS.values()):
        raise RuntimeError("portrait AUTO->VERTICAL self-test failed")
    if any(authorization_denials().values()):
        raise RuntimeError("authorization denial self-test failed")
    for frame in (1, 46, 76, 106, 165, 195, 225, 255, 285, 356, 405, 450, 480, 500):
        if not 1 <= frame <= 500 or lens_at(frame) <= 0:
            raise RuntimeError("focal interpolation self-test failed")
    try:
        assert_no_private_strings({"bad": "C:/Users/example/AppData/Local/Temp/file"}, "unsafe self-test")
    except RuntimeError:
        pass
    else:
        raise RuntimeError("private-path rejection self-test failed")
    with tempfile.TemporaryDirectory(prefix="phase4r1-1-final-physical-self-test-") as temp:
        root = Path(temp)
        target = root / "atomic.json"
        atomic_json_new(target, {"schema": "self-test", "tuple": normalized((1, 2)), "status": "PASS"})
        if json.loads(target.read_text(encoding="utf-8"))["tuple"] != [1, 2]:
            raise RuntimeError("atomic JSON normalization self-test failed")
        atomic_json_replace(target, {"schema": "self-test", "status": "REPLACED"})
        if json.loads(target.read_text(encoding="utf-8"))["status"] != "REPLACED":
            raise RuntimeError("atomic JSON replacement self-test failed")
    return {
        "schema": "quantum-hub.phase-4-r1-1.final-physical-producer-self-test.v1",
        "status": "PASS",
        "fullChunks": [list(value) for value in FULL_CHUNKS],
        "fullFrameCount": len(flattened),
        "responsiveViewportCount": len(RESPONSIVE_VIEWPORTS),
        "responsiveStillCount": len(RESPONSIVE_VIEWPORTS) * len(MILESTONES),
        "maximumAuthorizedFrame": 500,
        "forbiddenFrameRange": [501, 540],
        "authorization": authorization_denials(),
    }


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("audit", "sequence-chunk", "responsive", "verify"), required=True)
    parser.add_argument("--output-root", required=True)
    parser.add_argument("--chunk", type=int)
    parser.add_argument("--viewport", choices=tuple(RESPONSIVE_VIEWPORTS))
    args = parser.parse_args(argv)
    if args.mode == "sequence-chunk" and args.chunk is None:
        parser.error("sequence-chunk requires --chunk 1..10")
    if args.mode != "sequence-chunk" and args.chunk is not None:
        parser.error("--chunk is valid only for sequence-chunk")
    if args.mode == "responsive" and args.viewport is None:
        parser.error("responsive requires --viewport")
    if args.mode != "responsive" and args.viewport is not None:
        parser.error("--viewport is valid only for responsive")
    return args


def main() -> None:
    if "--self-test" in sys.argv:
        if len(sys.argv) != 2 or sys.argv[1] != "--self-test":
            raise RuntimeError("--self-test cannot be combined with render arguments")
        print(json.dumps(pure_self_test(), sort_keys=True, indent=2))
        return
    args = parse_args()
    root: Path | None = None
    try:
        root = create_fresh_root(args.output_root) if args.mode == "audit" else require_existing_root(args.output_root)
        source_summary, authorities = authority_snapshot()
        if args.mode == "audit":
            report = run_audit(root, source_summary, authorities)
        elif args.mode == "sequence-chunk":
            report = run_sequence_chunk(root, args.chunk, authorities)
        elif args.mode == "responsive":
            report = run_responsive(root, args.viewport, authorities)
        else:
            report = run_verify(root, authorities)
    except BaseException as error:
        write_failure(root, args.mode, error)
        raise
    print("PHASE4R1_1_FINAL_PHYSICAL_STATUS=PASS")
    print(f"PHASE4R1_1_FINAL_PHYSICAL_MODE={args.mode}")
    print(f"PHASE4R1_1_FINAL_PHYSICAL_REPORT={report}")


if __name__ == "__main__":
    main()
