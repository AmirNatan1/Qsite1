"""Produce bounded raw Cycles evidence for the Phase 4-R1.1 CRT repair.

This producer is deliberately incapable of rendering the complete timeline.
It can audit the exact Checkpoint 4 source, render five fixed 192-sample stills,
or render one of four fixed 30-frame chunks of the authorized 120-frame
F345-F464 sample.  It never saves the Blender file and never performs media
integration.  Raw Blender PNGs remain external and are not package eligible;
the companion finalizer creates privacy-clean public derivatives.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import struct
import sys
import tempfile
import time
from typing import Any, Iterable, Iterator
import uuid
import zlib

# The companion finalizer imports this module for its immutable contracts and
# pure validators.  Import Blender only when this file is itself the active
# Blender-side program; even an environment that happens to provide `bpy`
# cannot make the ordinary-Python finalizer import it transitively.
if __name__ == "__main__" and "--self-test" not in sys.argv:
    try:
        import bpy  # type: ignore
    except ModuleNotFoundError:  # pragma: no cover - defensive launcher error
        bpy = None  # type: ignore
else:
    bpy = None  # type: ignore


sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
import phase4r1_1_repair_config as cfg


PLAN_SCHEMA = "quantum-hub.phase-4-r1-1.crt-phosphor-evidence-plan.v1"
AUDIT_SCHEMA = "quantum-hub.phase-4-r1-1.crt-phosphor-source-audit.v1"
RECEIPT_SCHEMA = "quantum-hub.phase-4-r1-1.crt-phosphor-frame-receipt.v1"
CHUNK_SCHEMA = "quantum-hub.phase-4-r1-1.crt-phosphor-chunk.v1"
RAW_MANIFEST_SCHEMA = "quantum-hub.phase-4-r1-1.crt-phosphor-raw-manifest.v1"
FAILURE_SCHEMA = "quantum-hub.phase-4-r1-1.crt-phosphor-diagnostic-failure.v1"

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

BUILDER_PATH = SCRIPT_DIR / "build_phase4r1_1_targeted_repair.py"
FINALIZER_PATH = SCRIPT_DIR / "finalize_phase4r1_1_crt_phosphor_evidence.py"
Q_TRACKED_PATH = (
    cfg.REPO_ROOT
    / "artifacts/original/phase-4r1-refined-proving-hall/source/q-fidelity/quantum-icon-pre-crt-effect.png"
)
Q_WHITE_PATH = cfg.REPO_ROOT / "public/brand/quantum-icon-white.svg"
Q_COLOR_PATH = cfg.REPO_ROOT / "public/brand/quantum-icon-color.svg"

STILLS = (
    (356, "first-readable"),
    (370, "stable-primary"),
    (405, "late-hold"),
    (406, "push-start"),
    (480, "glass-close"),
)
STILL_WIDTH = 1440
STILL_HEIGHT = 900
STILL_SAMPLES = 192
MOTION_START = 345
MOTION_END = 464
MOTION_FRAMES = tuple(range(MOTION_START, MOTION_END + 1))
MOTION_WIDTH = 960
MOTION_HEIGHT = 600
MOTION_SAMPLES = 96
MOTION_FPS = 30
MOTION_CHUNKS = (
    (345, 374),
    (375, 404),
    (405, 434),
    (435, 464),
)
MAXIMUM_AUTHORIZED_FRAME = 500
FORBIDDEN_RANGE = (501, 540)
EXPECTED_RAW_PNG_COUNT = len(STILLS) + len(MOTION_FRAMES)
DESKTOP_CAMERA = "Phase4R1_Camera_Desktop"
DESKTOP_CABLE_COLLECTION = "PHASE4R1V2_CABLE_DESKTOP"
CABLE_COLLECTIONS = (
    "PHASE4R1V2_CABLE_DESKTOP",
    "PHASE4R1V2_CABLE_MOBILE",
    "PHASE4R1V2_CABLE_LANDSCAPE",
)

GLASS_SCHEDULE = {
    "roughness": ((1, 0.14), (335, 0.12), (430, 0.10), (486, 0.065), (500, 0.035)),
    "transmissionWeight": ((1, 0.58), (335, 0.72), (430, 0.78), (486, 0.88), (500, 0.94)),
    "specularIorLevel": ((1, 0.32), (335, 0.20), (430, 0.15), (486, 0.10), (500, 0.07)),
}
GLASS_ACTION_INPUT_INDEX = {
    "roughness": 2,
    "transmissionWeight": 19,
    "specularIorLevel": 14,
}
Q_OPACITY_KEYS = ((1, 0.0), (335, 0.0), (355, 1.0), (405, 1.0), (500, 1.0))
Q_SOURCE_NODE_TYPES = {
    "Emission": "ShaderNodeEmission",
    "Image Texture": "ShaderNodeTexImage",
    "Material Output": "ShaderNodeOutputMaterial",
    "Math": "ShaderNodeMath",
    "Math.001": "ShaderNodeMath",
    "Mix Shader": "ShaderNodeMixShader",
    "Object Info": "ShaderNodeObjectInfo",
    "Transparent BSDF": "ShaderNodeBsdfTransparent",
}
Q_PHYSICAL_NODE_TYPES = {
    "Phase4R11_Q_CameraData": "ShaderNodeCameraData",
    "Phase4R11_Q_FadedScanDelta": "ShaderNodeMath",
    "Phase4R11_Q_FinalPhysicalStrength": "ShaderNodeMath",
    "Phase4R11_Q_FineScanBands": "ShaderNodeTexWave",
    "Phase4R11_Q_FineScanMultiplier": "ShaderNodeMapRange",
    "Phase4R11_Q_ScanContrastDistanceFade": "ShaderNodeMapRange",
    "Phase4R11_Q_ScanDeltaFromUnity": "ShaderNodeMath",
    "Phase4R11_Q_ScanEnvelope": "ShaderNodeMath",
    "Phase4R11_Q_StaticPhosphorNoise": "ShaderNodeTexNoise",
    "Phase4R11_Q_StaticPhosphorVariation": "ShaderNodeMapRange",
    "Phase4R11_Q_StrengthTimesScanEnvelope": "ShaderNodeMath",
    "Phase4R11_Q_UVCoordinates": "ShaderNodeTexCoord",
}
Q_SCATTER_OFFSETS = (
    ("E", 0.0065, 0.0),
    ("W", -0.0065, 0.0),
    ("N", 0.0, 0.0065),
    ("S", 0.0, -0.0065),
    ("NE", 0.0045961941, 0.0045961941),
    ("NW", -0.0045961941, 0.0045961941),
    ("SE", 0.0045961941, -0.0045961941),
    ("SW", -0.0045961941, -0.0045961941),
)
Q_SCATTER_NODE_TYPES = {
    "Phase4R11_Q_CoreEnergySplit": "ShaderNodeMath",
    "Phase4R11_Q_CorePhysicalCalibration": "ShaderNodeMath",
    "Phase4R11_Q_CorePlusScatterSurface": "ShaderNodeAddShader",
    "Phase4R11_Q_ScatterEmission": "ShaderNodeEmission",
    "Phase4R11_Q_ScatterEnergySplit": "ShaderNodeMath",
    "Phase4R11_Q_ScatterPhysicalCalibration": "ShaderNodeMath",
    "Phase4R11_Q_ScatterTapAverage": "ShaderNodeMath",
    **{
        f"Phase4R11_Q_ScatterOffset_{label}": "ShaderNodeVectorMath"
        for label, _offset_x, _offset_y in Q_SCATTER_OFFSETS
    },
    **{
        f"Phase4R11_Q_ScatterTap_{label}": "ShaderNodeTexImage"
        for label, _offset_x, _offset_y in Q_SCATTER_OFFSETS
    },
    **{
        f"Phase4R11_Q_ScatterPremultiply_{label}": "ShaderNodeVectorMath"
        for label, _offset_x, _offset_y in Q_SCATTER_OFFSETS
    },
    **{
        f"Phase4R11_Q_ScatterSum_{index:02d}": "ShaderNodeVectorMath"
        for index in range(2, 9)
    },
}
Q_EXPECTED_NODE_COUNT = 58
Q_EXPECTED_LINK_COUNT = 77
Q_EXPECTED_IMAGE_REFERENCE_COUNT = 9
GLASS_NODE_TYPES = {
    "Material Output": "ShaderNodeOutputMaterial",
    "Principled BSDF": "ShaderNodeBsdfPrincipled",
    "Phase4R11_Glass_DarkReflection": "ShaderNodeBsdfPrincipled",
    "Phase4R11_Glass_Fresnel": "ShaderNodeFresnel",
    "Phase4R11_Glass_InheritedPlusTransmission": "ShaderNodeMixShader",
    "Phase4R11_Glass_PhysicalSurface": "ShaderNodeMixShader",
    "Phase4R11_Glass_RestrainedFresnelScale": "ShaderNodeMath",
    "Phase4R11_Glass_RoughTransmission": "ShaderNodeBsdfPrincipled",
}

ROOT_PREFIX = "qsite-phase4r1-1-crt-phosphor"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
PRIVATE_PATTERNS = (
    re.compile(r"(?i)[a-z]:[/\\]+users[/\\]+"),
    re.compile(r"(?i)file://"),
    re.compile(r"(?i)[a-z]:[/\\]+.*[/\\]+appdata[/\\]+local[/\\]+temp"),
    re.compile(r"(?i)onedrive[/\\]+documents[/\\]+quantum-hub"),
)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_record(path: Path) -> dict[str, Any]:
    payload = path.read_bytes()
    return {"bytes": len(payload), "sha256": sha256_bytes(payload)}


def repo_record(path: Path) -> dict[str, Any]:
    resolved = path.resolve()
    return {
        "path": resolved.relative_to(cfg.REPO_ROOT.resolve()).as_posix(),
        **file_record(resolved),
    }


def canonical_hash(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("ascii")
    return sha256_bytes(payload)


def utc_now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def rounded(value: float, digits: int = 8) -> float:
    return round(float(value), digits)


def vector(values: Iterable[float]) -> list[float]:
    return [rounded(value) for value in values]


def assert_close(actual: float, expected: float, label: str, tolerance: float = 2e-6) -> None:
    if not math.isclose(float(actual), float(expected), rel_tol=0.0, abs_tol=tolerance):
        raise RuntimeError(f"{label} mismatch: expected {expected}, got {actual}")


def assert_no_private_strings(value: Any, label: str) -> None:
    encoded = json.dumps(value, sort_keys=True, ensure_ascii=False)
    for pattern in PRIVATE_PATTERNS:
        if pattern.search(encoded):
            raise RuntimeError(f"{label} contains a private absolute-path string")


def safe_error_text(error: BaseException) -> str:
    text = f"{type(error).__name__}: {error}"
    replacements = {
        str(cfg.REPO_ROOT.resolve()): "<REPO_ROOT>",
        str(SCRIPT_DIR.resolve()): "<SOURCE_DIR>",
        str(Path.home().resolve()): "<USER_HOME>",
        str(Path(tempfile.gettempdir()).resolve()): "<TEMP_ROOT>",
    }
    for private, token in sorted(replacements.items(), key=lambda item: len(item[0]), reverse=True):
        text = text.replace(private, token).replace(private.replace("\\", "/"), token)
    if any(pattern.search(text) for pattern in PRIVATE_PATTERNS):
        return f"{type(error).__name__}: private diagnostic detail suppressed"
    return text[:2000]


def atomic_bytes_new(path: Path, payload: bytes) -> None:
    if path.exists():
        raise RuntimeError(f"refusing to overwrite immutable evidence file: {path.name}")
    path.parent.mkdir(parents=True, exist_ok=True)
    pending = path.with_name(f".{path.name}.pending-{uuid.uuid4().hex}")
    if pending.exists():
        raise RuntimeError(f"stale evidence staging file: {pending.name}")
    try:
        with pending.open("xb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        if pending.read_bytes() != payload:
            raise RuntimeError(f"evidence staging self-check failed: {path.name}")
        os.replace(pending, path)
    except BaseException:
        # Do not delete a possibly useful interrupted artifact.  A subsequent
        # run refuses all staging files and requires explicit quarantine.
        raise


def atomic_json_new(path: Path, value: dict[str, Any]) -> None:
    assert_no_private_strings(value, path.name)
    payload = (json.dumps(value, indent=2, sort_keys=True) + "\n").encode("utf-8")
    normalized = json.loads(payload.decode("utf-8"))
    atomic_bytes_new(path, payload)
    if path.read_bytes() != payload:
        raise RuntimeError(f"JSON publication byte self-check failed: {path.name}")
    if json.loads(path.read_text(encoding="utf-8")) != normalized:
        raise RuntimeError(f"JSON publication self-check failed: {path.name}")


def atomic_json_replace(path: Path, value: dict[str, Any]) -> None:
    """Atomically replace only a reconstructable rolling manifest."""

    assert_no_private_strings(value, path.name)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = (json.dumps(value, indent=2, sort_keys=True) + "\n").encode("utf-8")
    normalized = json.loads(payload.decode("utf-8"))
    pending = path.with_name(f".{path.name}.pending-{uuid.uuid4().hex}")
    with pending.open("xb") as handle:
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())
    if pending.read_bytes() != payload:
        raise RuntimeError(f"rolling manifest staging byte self-check failed: {path.name}")
    if json.loads(pending.read_text(encoding="utf-8")) != normalized:
        raise RuntimeError(f"rolling manifest staging self-check failed: {path.name}")
    os.replace(pending, path)
    if path.read_bytes() != payload:
        raise RuntimeError(f"rolling manifest publication byte self-check failed: {path.name}")


def parse_png(path: Path) -> dict[str, Any]:
    payload = path.read_bytes()
    if not payload.startswith(PNG_SIGNATURE):
        raise RuntimeError(f"not a PNG: {path.name}")
    offset = len(PNG_SIGNATURE)
    chunks: list[dict[str, Any]] = []
    width = height = bit_depth = color_type = interlace = None
    saw_iend = False
    while offset < len(payload):
        if offset + 12 > len(payload):
            raise RuntimeError(f"truncated PNG chunk header: {path.name}")
        length = struct.unpack(">I", payload[offset : offset + 4])[0]
        kind = payload[offset + 4 : offset + 8]
        end = offset + 12 + length
        if end > len(payload):
            raise RuntimeError(f"truncated PNG chunk body: {path.name}")
        data = payload[offset + 8 : offset + 8 + length]
        expected_crc = struct.unpack(">I", payload[offset + 8 + length : end])[0]
        actual_crc = zlib.crc32(kind + data) & 0xFFFFFFFF
        if expected_crc != actual_crc:
            raise RuntimeError(f"PNG CRC mismatch in {kind!r}: {path.name}")
        chunks.append({"type": kind.decode("latin1"), "bytes": length, "data": data, "raw": payload[offset:end]})
        if kind == b"IHDR":
            if length != 13:
                raise RuntimeError(f"invalid PNG IHDR: {path.name}")
            width, height, bit_depth, color_type, compression, filtering, interlace = struct.unpack(">IIBBBBB", data)
            if compression != 0 or filtering != 0:
                raise RuntimeError(f"unsupported PNG compression/filter method: {path.name}")
        if kind == b"IEND":
            saw_iend = True
            if end != len(payload):
                raise RuntimeError(f"bytes follow PNG IEND: {path.name}")
        offset = end
    if not saw_iend or None in {width, height, bit_depth, color_type, interlace}:
        raise RuntimeError(f"incomplete PNG structure: {path.name}")
    return {
        "width": int(width),
        "height": int(height),
        "bitDepth": int(bit_depth),
        "colorType": int(color_type),
        "interlace": int(interlace),
        "chunks": chunks,
        "idatSha256": sha256_bytes(b"".join(chunk["data"] for chunk in chunks if chunk["type"] == "IDAT")),
    }


def validate_raw_png(path: Path, width: int, height: int) -> dict[str, Any]:
    parsed = parse_png(path)
    if (parsed["width"], parsed["height"]) != (width, height):
        raise RuntimeError(
            f"PNG dimensions differ for {path.name}: "
            f"{parsed['width']}x{parsed['height']} != {width}x{height}"
        )
    if parsed["bitDepth"] != 8 or parsed["colorType"] not in {2, 6} or parsed["interlace"] != 0:
        raise RuntimeError(f"PNG must be non-interlaced 8-bit RGB/RGBA: {path.name}")
    return {
        "width": width,
        "height": height,
        "bitDepth": parsed["bitDepth"],
        "colorType": parsed["colorType"],
        "interlaced": False,
        "idatSha256": parsed["idatSha256"],
    }


def expected_root_prefix() -> str:
    renderer = file_record(Path(__file__).resolve())
    return f"{ROOT_PREFIX}-{EXPECTED_DERIVATIVE['sha256'][:8]}-{renderer['sha256'][:8]}-"


def validate_external_root_path(path: Path, *, must_exist: bool) -> Path:
    absolute = path.absolute()
    for candidate in (absolute, *absolute.parents):
        is_junction = getattr(candidate, "is_junction", lambda: False)
        if candidate.exists() and (candidate.is_symlink() or bool(is_junction())):
            raise RuntimeError("CRT evidence root may not traverse a symlink or junction")
    root = absolute.resolve()
    repo = cfg.REPO_ROOT.resolve()
    if root == repo or repo in root.parents:
        raise RuntimeError("CRT evidence root must remain external to Git")
    if root == Path(root.anchor) or root == Path.home().resolve() or root == Path(tempfile.gettempdir()).resolve():
        raise RuntimeError("refusing a broad CRT evidence root")
    if not root.name.startswith(expected_root_prefix()):
        raise RuntimeError(f"CRT evidence root basename must start with {expected_root_prefix()}")
    if not re.fullmatch(re.escape(expected_root_prefix()) + r"\d{8}-\d{4}", root.name):
        raise RuntimeError("CRT evidence root must end in YYYYMMDD-HHMM")
    if must_exist:
        if not root.is_dir() or root.is_symlink():
            raise RuntimeError("existing CRT evidence root is absent, non-directory, or a link")
    elif root.exists():
        raise RuntimeError("CRT evidence audit requires a new absent output root")
    elif any(root.parent.glob(f".{root.name}.pending-*")):
        raise RuntimeError("stale CRT audit-root staging directory requires explicit quarantine")
    return root


def assert_no_staging_files(root: Path) -> None:
    stale = sorted(path.relative_to(root).as_posix() for path in root.rglob("*.pending-*") if path.is_file())
    stale += sorted(path.relative_to(root).as_posix() for path in root.rglob(".*.pending-*") if path.is_file())
    if stale:
        raise RuntimeError(f"stale staging files require explicit quarantine: {stale[:8]}")


def expected_build_contract() -> dict[str, Any]:
    return {
        "cyclesEvidenceFrames": dict(cfg.CRT_CYCLES_EVIDENCE_FRAMES),
        "stableQCyclesAuthority": {
            **cfg.CRT_STABLE_Q_CYCLES_AUTHORITY,
            "resolution": list(cfg.CRT_STABLE_Q_CYCLES_AUTHORITY["resolution"]),
        },
        "qMotionAuthority": {
            **cfg.CRT_Q_MOTION_AUTHORITY,
            "resolution": list(cfg.CRT_Q_MOTION_AUTHORITY["resolution"]),
        },
        "maximumAuthorizedEvidenceFrame": cfg.CRT_MAXIMUM_AUTHORIZED_EVIDENCE_FRAME,
        "forbiddenProductionFrameRange": list(cfg.CRT_FORBIDDEN_PRODUCTION_FRAME_RANGE),
    }


def expected_build_q_image_references(*, repaired: bool) -> dict[str, Any]:
    packed = {
        "name": cfg.EXACT_Q_IMAGE_NAME,
        "filepath": cfg.EXACT_Q_CANONICAL_PATH,
        "packedFilepath": cfg.EXACT_Q_CANONICAL_PATH,
        "bytes": cfg.EXACT_Q_BYTES,
        "sha256": cfg.EXACT_Q_SHA256,
    }
    names = ["Image Texture"]
    if repaired:
        names.extend(f"Phase4R11_Q_ScatterTap_{label}" for label, _x, _y in Q_SCATTER_OFFSETS)
    samplers = []
    for name in sorted(names):
        samplers.append(
            {
                "node": name,
                "image": cfg.EXACT_Q_IMAGE_NAME,
                "samePackedImagePointer": True,
                "interpolation": "Linear",
                "extension": "REPEAT" if name == "Image Texture" else "CLIP",
            }
        )
    return {
        "packedImage": packed,
        "samplerCount": len(samplers),
        "imageUsers": len(samplers),
        "allSamplersReferenceSamePackedImagePointer": True,
        "samplers": samplers,
    }


def verify_fixed_files() -> dict[str, Any]:
    authorities = {
        "derivative": repo_record(cfg.DERIVATIVE),
        "sourceBuild": repo_record(cfg.BUILD_REPORT),
        "builder": repo_record(BUILDER_PATH),
        "config": repo_record(Path(cfg.__file__).resolve()),
        "renderer": repo_record(Path(__file__).resolve()),
        "finalizer": repo_record(FINALIZER_PATH),
        "exactQTracked": repo_record(Q_TRACKED_PATH),
        "officialWhiteSvg": repo_record(Q_WHITE_PATH),
        "officialColorSvg": repo_record(Q_COLOR_PATH),
    }
    for key, expected in (
        ("derivative", EXPECTED_DERIVATIVE),
        ("sourceBuild", EXPECTED_BUILD_REPORT),
        ("builder", EXPECTED_BUILDER),
        ("config", EXPECTED_CONFIG),
    ):
        observed = {name: authorities[key][name] for name in ("bytes", "sha256")}
        if observed != expected:
            raise RuntimeError(f"fixed CP4 {key} authority differs: {observed}")
    if authorities["exactQTracked"] != {
        "path": "artifacts/original/phase-4r1-refined-proving-hall/source/q-fidelity/quantum-icon-pre-crt-effect.png",
        "bytes": cfg.EXACT_Q_BYTES,
        "sha256": cfg.EXACT_Q_SHA256,
    }:
        raise RuntimeError("tracked pre-effects Q authority differs")
    if authorities["officialWhiteSvg"]["sha256"] != cfg.OFFICIAL_Q_WHITE_SHA256:
        raise RuntimeError("official white Q SVG authority differs")
    if authorities["officialColorSvg"]["sha256"] != cfg.OFFICIAL_Q_COLOR_SHA256:
        raise RuntimeError("official color Q SVG authority differs")
    return authorities


def validate_source_build() -> tuple[dict[str, Any], dict[str, Any]]:
    authorities = verify_fixed_files()
    build = json.loads(cfg.BUILD_REPORT.read_text(encoding="utf-8"))
    if (
        build.get("schema") != "quantum-hub.phase-4-r1-1.targeted-repair.source-build.v1"
        or build.get("status") != "PASS"
        or build.get("throughStage") != "crt"
        or build.get("derivative") != authorities["derivative"]
        or build.get("producerAuthorities", {}).get("builder") != authorities["builder"]
        or build.get("producerAuthorities", {}).get("config") != authorities["config"]
    ):
        raise RuntimeError("CP4 source-build identity/status/producer binding differs")
    if build.get("authorization") != cfg.AUTHORIZATION or any(build["authorization"].values()):
        raise RuntimeError("CP4 source-build authorization boundary is divergent or expanded")
    timeline = build.get("timeline", {})
    expected_timeline = {"frameStart": 1, "frameEnd": 540, "fps": 30, "fpsBase": 1.0}
    if timeline != {"before": expected_timeline, "after": expected_timeline, "unchanged": True}:
        raise RuntimeError("CP4 source-build timeline authority differs")
    crt = build.get("stages", {}).get("crt", {})
    expected_contract = expected_build_contract()
    if any(crt.get(key) != value for key, value in expected_contract.items()):
        raise RuntimeError("CP4 source-build evidence contract differs from the fixed producer contract")
    exact_materials = sorted((cfg.CRT_GLASS_MATERIAL, cfg.CRT_Q_PHOSPHOR_MATERIAL))
    if (
        crt.get("repair") != "two existing CRT material node graphs only"
        or crt.get("changedAcceptedMaterials") != exact_materials
        or crt.get("expectedChangedAcceptedMaterials") != exact_materials
        or crt.get("exactlyTwoAllowedMaterialGraphsChanged") is not True
        or crt.get("fixedAuthorityUnchanged") is not True
        or crt.get("materialUsersUnchanged") is not True
        or crt.get("peripheryAuthorityUnchanged") is not True
        or crt.get("postSaveAuthorityExact") is not True
    ):
        raise RuntimeError("CP4 material-only/frozen-authority gates are not all PASS")
    for key in (
        "complete540FrameCyclesFilmStarted",
        "finalRefinedMediaIntegrationStarted",
        "phase5Authorized",
    ):
        if crt.get(key) is not False:
            raise RuntimeError(f"CP4 source-build expanded a closed CRT boundary: {key}")
    difference = crt.get("preEffectsSourceDifference", {})
    if (
        difference.get("zeroDifference") is not True
        or difference.get("packedByteDifferenceCount") != 0
        or difference.get("planeGeometryUvOpacityActionDifference") != 0
        or difference.get("packedBefore") != difference.get("packedAfter")
    ):
        raise RuntimeError("CP4 build does not preserve an exact zero-difference pre-effects Q")
    fixed_before = crt.get("fixedAuthorityBefore", {})
    fixed_after = crt.get("fixedAuthorityAfter", {})
    post_save_fixed = crt.get("postSaveFixedAuthority", {})
    if (
        fixed_before != fixed_after
        or fixed_after != post_save_fixed
        or fixed_after.get("exactQSource") != fixed_before.get("exactQSource")
        or fixed_after.get("animatedGlassSource") != fixed_before.get("animatedGlassSource")
        or fixed_after.get("dormantLegacyCrtScanGeometry")
        != fixed_before.get("dormantLegacyCrtScanGeometry")
    ):
        raise RuntimeError("CP4 fixed Q/UV/action/glass/legacy authority differs after repair or save")
    expected_q_authority = json.loads(json.dumps(cfg.CRT_MATERIAL_AUTHORITY["qPhosphor"]))
    expected_glass_authority = json.loads(json.dumps(cfg.CRT_MATERIAL_AUTHORITY["glass"]))
    if (
        crt.get("qPhosphorTreatment") != crt.get("postSaveQPhosphorTreatment")
        or crt.get("glassTreatment") != crt.get("postSaveGlassTreatment")
        or crt.get("qPhosphorTreatment", {}).get("authority") != expected_q_authority
        or crt.get("glassTreatment", {}).get("authority") != expected_glass_authority
    ):
        raise RuntimeError("CP4 post-save phosphor/glass treatment differs")
    expected_before_references = expected_build_q_image_references(repaired=False)
    expected_after_references = expected_build_q_image_references(repaired=True)
    expected_reference_authority = {
        "before": expected_before_references,
        "after": expected_after_references,
        "delta": {"samplers": 8, "imageUsers": 8},
        "onlyAdditionalReferencesToSamePackedImage": True,
    }
    treatment = crt.get("qPhosphorTreatment", {})
    exact_treatment_values = {
        "nodeCount": Q_EXPECTED_NODE_COUNT,
        "linkCount": Q_EXPECTED_LINK_COUNT,
        "imageReferences": expected_after_references,
        "imageReferenceChange": {
            "acceptedSamplerCount": 1,
            "repairedSamplerCount": 9,
            "addedSamplerReferences": 8,
            "samePackedImageDatablock": True,
        },
        "coreStrengthFormula": "FinalPhysicalStrength * 0.43 * 0.74",
        "scatterStrengthFormula": "Math.001 * 0.43 * 0.26 * 0.125",
        "coreScatterEnergySplitSum": 1.0,
        "sourceImageVectorInputUnchanged": True,
        "sourceTextureColorAndAlphaBranchesUnchanged": True,
        "objectAlphaGateUnchanged": True,
        "scanNoiseTopologyAndValuesFrozen": True,
        "tapColorsPremultipliedByTapAlpha": True,
        "outsideSampledCoverageExactBlackByConstruction": True,
        "scatterBypassesScanAndNoise": True,
        "singleScatterEmission": True,
        "singleAddShader": True,
        "physicalStrengthChainValid": True,
        "animatedInputsAdded": False,
        "additionalTransparentBsdfCount": 0,
        "additionalMixShaderCount": 0,
    }
    if any(treatment.get(key) != value for key, value in exact_treatment_values.items()):
        raise RuntimeError("CP4 source-build exact core/scatter phosphor treatment differs")
    expected_new_nodes = sorted(set(Q_PHYSICAL_NODE_TYPES) | set(Q_SCATTER_NODE_TYPES))
    if (
        treatment.get("newNodeNames") != expected_new_nodes
        or treatment.get("scatterRepairNodeNames") != sorted(Q_SCATTER_NODE_TYPES)
        or crt.get("imageReferenceAuthority") != expected_reference_authority
        or crt.get("postSaveImageReferences") != expected_after_references
    ):
        raise RuntimeError("CP4 same-packed-image scatter reference authority differs")
    graphs_before = crt.get("materialGraphsBefore", {})
    graphs_after = crt.get("materialGraphsAfter", {})
    if set(graphs_before) != set(exact_materials) or set(graphs_after) != set(exact_materials):
        raise RuntimeError("CP4 material graph report contains an unexpected material")
    expected_q_nodes = {**Q_SOURCE_NODE_TYPES, **Q_PHYSICAL_NODE_TYPES, **Q_SCATTER_NODE_TYPES}
    q_before = graphs_before.get(cfg.CRT_Q_PHOSPHOR_MATERIAL, {})
    q_after = graphs_after.get(cfg.CRT_Q_PHOSPHOR_MATERIAL, {})
    glass_before = graphs_before.get(cfg.CRT_GLASS_MATERIAL, {})
    glass_after = graphs_after.get(cfg.CRT_GLASS_MATERIAL, {})
    if (
        len(q_before.get("nodes", [])) != 8
        or len(q_before.get("links", [])) != 9
        or len(q_after.get("nodes", [])) != Q_EXPECTED_NODE_COUNT
        or len(q_after.get("links", [])) != Q_EXPECTED_LINK_COUNT
        or {node.get("name"): node.get("type") for node in q_after.get("nodes", [])}
        != expected_q_nodes
        or len(glass_before.get("nodes", [])) != 2
        or len(glass_before.get("links", [])) != 1
        or len(glass_after.get("nodes", [])) != 8
        or len(glass_after.get("links", [])) != 7
        or {node.get("name"): node.get("type") for node in glass_after.get("nodes", [])}
        != GLASS_NODE_TYPES
        or any(link.get("muted") or link.get("valid") is not True for link in q_after.get("links", []))
        or any(link.get("muted") or link.get("valid") is not True for link in glass_after.get("links", []))
    ):
        raise RuntimeError("CP4 reported Q/glass node-link topology differs")
    return build, authorities


def require_blender() -> None:
    if bpy is None:
        raise RuntimeError("audit/render modes require Blender 5.2.0")
    if tuple(bpy.app.version[:3]) != (5, 2, 0):
        raise RuntimeError(f"CRT diagnostic requires Blender 5.2.0, got {bpy.app.version_string}")


def rna_identity(value: Any) -> int:
    return int(value.as_pointer())


def required_node(material: Any, name: str, node_type: str) -> Any:
    if material is None or not material.use_nodes or material.node_tree is None:
        raise RuntimeError(f"material node tree is missing: {getattr(material, 'name', '<none>')}")
    node = material.node_tree.nodes.get(name)
    if node is None or node.bl_idname != node_type:
        raise RuntimeError(f"required node differs: {material.name}.{name}")
    return node


def input_socket(node: Any, name: str) -> Any:
    matches = [socket for socket in node.inputs if socket.name == name and socket.enabled]
    visible = [socket for socket in matches if not socket.hide]
    if len(visible) == 1:
        return visible[0]
    if len(matches) == 1:
        return matches[0]
    raise RuntimeError(f"expected one enabled socket {node.name}.{name}, got {len(matches)}")


def require_link(tree: Any, from_socket: Any, to_socket: Any, label: str) -> None:
    matches = [
        link
        for link in tree.links
        if rna_identity(link.from_socket) == rna_identity(from_socket)
        and rna_identity(link.to_socket) == rna_identity(to_socket)
    ]
    if len(matches) != 1 or matches[0].is_muted or not matches[0].is_valid:
        raise RuntimeError(f"required material link differs: {label}")


def has_link(tree: Any, from_socket: Any, to_socket: Any) -> bool:
    return any(
        rna_identity(link.from_socket) == rna_identity(from_socket)
        and rna_identity(link.to_socket) == rna_identity(to_socket)
        for link in tree.links
    )


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
                    pointer = rna_identity(curve)
                    if pointer not in seen:
                        seen.add(pointer)
                        yield curve


def action_record(owner: Any) -> dict[str, Any] | None:
    animation = getattr(owner, "animation_data", None)
    action = None if animation is None else animation.action
    if action is None:
        return None
    curves = []
    for curve in sorted(iter_action_fcurves(action), key=lambda item: (item.data_path, item.array_index)):
        curves.append(
            {
                "dataPath": curve.data_path,
                "arrayIndex": int(curve.array_index),
                "extrapolation": curve.extrapolation,
                "mute": bool(curve.mute),
                "lock": bool(curve.lock),
                "keyframes": [
                    {
                        "frame": rounded(point.co.x),
                        "value": rounded(point.co.y),
                        "interpolation": point.interpolation,
                        "handleLeftType": point.handle_left_type,
                        "handleRightType": point.handle_right_type,
                    }
                    for point in curve.keyframe_points
                ],
            }
        )
    return {"name": action.name, "curves": curves}


def data_inventory() -> dict[str, Any]:
    inventories = {
        "actions": bpy.data.actions,
        "cameras": bpy.data.cameras,
        "collections": bpy.data.collections,
        "curves": bpy.data.curves,
        "images": bpy.data.images,
        "lights": bpy.data.lights,
        "materials": bpy.data.materials,
        "meshes": bpy.data.meshes,
        "nodeGroups": bpy.data.node_groups,
        "objects": bpy.data.objects,
    }
    result = {}
    for label, collection in inventories.items():
        names = sorted(
            item.name
            for item in collection
            if not (label == "images" and item.name in {"Render Result", "Viewer Node"})
        )
        result[label] = {"count": len(names), "namesSha256": canonical_hash(names)}
    return result


def material_users(material_name: str) -> list[dict[str, Any]]:
    users = []
    for obj in sorted(bpy.data.objects, key=lambda item: item.name):
        data = obj.data
        if data is None or not hasattr(data, "materials"):
            continue
        for index, material in enumerate(data.materials):
            if material is not None and material.name == material_name:
                users.append({"object": obj.name, "data": data.name, "slot": index})
    return users


def packed_q_record() -> tuple[dict[str, Any], bytes]:
    image = bpy.data.images.get(cfg.EXACT_Q_IMAGE_NAME)
    if image is None or len(image.packed_files) != 1 or image.packed_files[0].packed_file is None:
        raise RuntimeError("exact-Q packed image authority is missing")
    payload = bytes(image.packed_files[0].packed_file.data)
    record = {
        "name": image.name,
        "filepath": str(image.filepath or "").replace("\\", "/"),
        "packedFilepath": str(image.packed_files[0].filepath or "").replace("\\", "/"),
        "bytes": len(payload),
        "sha256": sha256_bytes(payload),
        "size": list(image.size),
        "colorSpace": image.colorspace_settings.name,
    }
    expected = {
        "name": cfg.EXACT_Q_IMAGE_NAME,
        "filepath": cfg.EXACT_Q_CANONICAL_PATH,
        "packedFilepath": cfg.EXACT_Q_CANONICAL_PATH,
        "bytes": cfg.EXACT_Q_BYTES,
        "sha256": cfg.EXACT_Q_SHA256,
        "size": [2048, 2048],
        "colorSpace": "sRGB",
    }
    if record != expected or payload != Q_TRACKED_PATH.read_bytes():
        raise RuntimeError("live packed Q differs byte-for-byte from the tracked pre-effects authority")
    return record, payload


def validate_q_plane_and_action() -> dict[str, Any]:
    plane = bpy.data.objects.get(cfg.CRT_Q_PLANE_OBJECT)
    material = bpy.data.materials.get(cfg.CRT_Q_PHOSPHOR_MATERIAL)
    if plane is None or plane.type != "MESH" or material is None:
        raise RuntimeError("exact-Q plane or phosphor material is missing")
    if len(plane.data.materials) != 1 or rna_identity(plane.data.materials[0]) != rna_identity(material):
        raise RuntimeError("exact-Q plane material binding differs")
    if material_users(material.name) != [
        {"object": cfg.CRT_Q_PLANE_OBJECT, "data": "Phase4R1V2_ExactQuantumQ_PicturePlane_Data", "slot": 0}
    ] or int(material.users) != 1:
        raise RuntimeError("exact-Q material users differ")
    mesh = plane.data
    if len(mesh.vertices) != 4 or len(mesh.edges) != 4 or len(mesh.polygons) != 1:
        raise RuntimeError("exact-Q plane topology differs")
    xs = [float(vertex.co.x) for vertex in mesh.vertices]
    zs = [float(vertex.co.z) for vertex in mesh.vertices]
    assert_close(max(xs) - min(xs), 0.358, "exact-Q plane width")
    assert_close(max(zs) - min(zs), 0.358, "exact-Q plane height")
    layers = list(mesh.uv_layers)
    if len(layers) != 1 or layers[0].name != "ExactQ_UV" or not layers[0].active_render:
        raise RuntimeError("exact-Q UV-layer authority differs")
    observed_uv = [[rounded(item.uv.x), rounded(item.uv.y)] for item in layers[0].data]
    expected_uv = [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]]
    if observed_uv != expected_uv:
        raise RuntimeError("exact-Q UV coordinates differ")
    action = action_record(plane)
    animation = plane.animation_data
    if (
        action is None
        or action["name"] != cfg.CRT_Q_PLANE_ACTION
        or animation is None
        or len(animation.drivers) != 0
        or len(animation.nla_tracks) != 0
        or len(action["curves"]) != 4
    ):
        raise RuntimeError("exact-Q opacity action topology differs")
    for curve in action["curves"]:
        if curve["dataPath"] != "color" or curve["arrayIndex"] not in {0, 1, 2, 3}:
            raise RuntimeError("exact-Q opacity action contains an unexpected curve")
        expected_values = [(frame, 1.0) for frame, _ in Q_OPACITY_KEYS]
        if curve["arrayIndex"] == 3:
            expected_values = list(Q_OPACITY_KEYS)
        observed = [(int(key["frame"]), key["value"]) for key in curve["keyframes"]]
        if observed != expected_values or any(key["interpolation"] != "LINEAR" for key in curve["keyframes"]):
            raise RuntimeError("exact-Q opacity schedule differs")
    return {
        "object": plane.name,
        "data": mesh.name,
        "vertices": 4,
        "edges": 4,
        "polygons": 1,
        "widthMeters": rounded(max(xs) - min(xs)),
        "heightMeters": rounded(max(zs) - min(zs)),
        "uvLayer": layers[0].name,
        "uvCoordinates": observed_uv,
        "materialUsers": material_users(material.name),
        "opacityActionSha256": canonical_hash(action),
        "opacitySchedule": [list(item) for item in Q_OPACITY_KEYS],
        "drivers": 0,
        "nlaTracks": 0,
    }


def validate_map_range(node: Any, from_minimum: float, from_maximum: float, to_minimum: float, to_maximum: float, label: str) -> None:
    if node.data_type != "FLOAT" or node.interpolation_type != "SMOOTHERSTEP" or not node.clamp:
        raise RuntimeError(f"{label} map-range mode differs")
    assert_close(input_socket(node, "From Min").default_value, from_minimum, f"{label} From Min")
    assert_close(input_socket(node, "From Max").default_value, from_maximum, f"{label} From Max")
    assert_close(input_socket(node, "To Min").default_value, to_minimum, f"{label} To Min")
    assert_close(input_socket(node, "To Max").default_value, to_maximum, f"{label} To Max")


def validate_q_material() -> dict[str, Any]:
    material = bpy.data.materials.get(cfg.CRT_Q_PHOSPHOR_MATERIAL)
    if material is None or material.node_tree is None or material.library is not None:
        raise RuntimeError("exact-Q phosphor material is missing or not local")
    expected_nodes = {**Q_SOURCE_NODE_TYPES, **Q_PHYSICAL_NODE_TYPES, **Q_SCATTER_NODE_TYPES}
    observed_nodes = {node.name: node.bl_idname for node in material.node_tree.nodes}
    if observed_nodes != expected_nodes:
        raise RuntimeError("exact-Q phosphor node inventory differs")
    if len(material.node_tree.links) != Q_EXPECTED_LINK_COUNT:
        raise RuntimeError("exact-Q phosphor link count differs")
    tree = material.node_tree
    nodes = {name: required_node(material, name, kind) for name, kind in expected_nodes.items()}
    image, _ = packed_q_record()
    packed_image = bpy.data.images.get(cfg.EXACT_Q_IMAGE_NAME)
    texture = nodes["Image Texture"]
    if (
        packed_image is None
        or texture.image is None
        or rna_identity(texture.image) != rna_identity(packed_image)
        or texture.image.name != image["name"]
        or texture.interpolation != "Linear"
        or texture.extension != "REPEAT"
    ):
        raise RuntimeError("exact-Q image-node binding/interpolation differs")
    if input_socket(texture, "Vector").is_linked:
        raise RuntimeError("exact-Q pre-effects image Vector input is no longer unlinked")
    if nodes["Math"].operation != "MULTIPLY" or nodes["Math.001"].operation != "MULTIPLY":
        raise RuntimeError("exact-Q source alpha/base-strength operations differ")
    assert_close(nodes["Math.001"].inputs[1].default_value, 3.2, "Q base emission")
    require_link(tree, texture.outputs["Color"], nodes["Emission"].inputs["Color"], "texture Color -> Emission Color")
    require_link(tree, texture.outputs["Alpha"], nodes["Math"].inputs[0], "texture Alpha -> alpha gate")
    require_link(tree, nodes["Object Info"].outputs["Alpha"], nodes["Math"].inputs[1], "Object Alpha -> alpha gate")
    require_link(tree, nodes["Math"].outputs[0], nodes["Mix Shader"].inputs[0], "alpha gate -> surface mix")
    require_link(tree, nodes["Transparent BSDF"].outputs[0], nodes["Mix Shader"].inputs[1], "transparent branch")
    require_link(tree, nodes["Emission"].outputs[0], nodes["Mix Shader"].inputs[2], "emission branch")
    require_link(tree, nodes["Object Info"].outputs["Alpha"], nodes["Math.001"].inputs[0], "Object Alpha -> base strength")

    spec = cfg.CRT_MATERIAL_AUTHORITY["qPhosphor"]
    configured_offsets = tuple(
        (str(label), float(offset_x), float(offset_y))
        for label, offset_x, offset_y in spec.get("scatterRing", {}).get("offsets", ())
    )
    if (
        configured_offsets != Q_SCATTER_OFFSETS
        or spec.get("acceptedImageSamplerCount") != 1
        or spec.get("repairedImageSamplerCount") != 9
        or spec.get("preserveImageVectorInput") is not True
        or spec.get("preserveTextureColorAndAlphaBranches") is not True
        or spec.get("preserveObjectAlphaGate") is not True
    ):
        raise RuntimeError("fixed exact-Q scatter/source authority differs")
    assert_close(spec["emissionCalibration"], 0.43, "Q common physical calibration")
    assert_close(spec["energySplit"]["core"], 0.74, "Q core energy split")
    assert_close(spec["energySplit"]["scatter"], 0.26, "Q scatter energy split")
    assert_close(
        spec["energySplit"]["core"] + spec["energySplit"]["scatter"],
        1.0,
        "Q core/scatter split sum",
    )
    assert_close(spec["scatterRing"]["radiusUv"], 0.0065, "Q scatter radius")
    assert_close(spec["scatterRing"]["diagonalOffsetUv"], 0.0045961941, "Q scatter diagonal offset")
    if (
        spec["scatterRing"]["tapCount"] != 8
        or spec["scatterRing"]["interpolation"] != "Linear"
        or spec["scatterRing"]["extension"] != "CLIP"
    ):
        raise RuntimeError("Q scatter tap count/sampling authority differs")
    assert_close(spec["scatterRing"]["tapAverageMultiplier"], 0.125, "Q scatter tap average")
    assert_close(
        spec["scatterRing"]["tapCount"] * spec["scatterRing"]["tapAverageMultiplier"],
        1.0,
        "Q scatter average normalization",
    )
    for label, offset_x, offset_y in Q_SCATTER_OFFSETS:
        assert_close(math.hypot(offset_x, offset_y), 0.0065, f"Q {label} scatter radius")

    wave = nodes["Phase4R11_Q_FineScanBands"]
    noise = nodes["Phase4R11_Q_StaticPhosphorNoise"]
    if wave.wave_type != "BANDS" or wave.bands_direction != "Y":
        raise RuntimeError("fine scan-band axis differs")
    assert_close(wave.inputs["Scale"].default_value, 15.0796447372, "fine scan Wave Texture scale")
    if cfg.CRT_MATERIAL_AUTHORITY["qPhosphor"]["scanBands"].get("actualBandFormula") != "20 * scale / (2 * pi)":
        raise RuntimeError("fine scan-band formula authority differs")
    assert_close(
        20.0 * wave.inputs["Scale"].default_value / (2.0 * math.pi),
        48.0,
        "fine scan actual band count",
    )
    if noise.noise_dimensions != "2D":
        raise RuntimeError("static phosphor noise must remain 2D")
    assert_close(noise.inputs["Scale"].default_value, 7.0, "phosphor noise scale")
    assert_close(noise.inputs["Detail"].default_value, 2.0, "phosphor noise detail")
    assert_close(noise.inputs["Roughness"].default_value, 0.45, "phosphor noise roughness")
    validate_map_range(nodes["Phase4R11_Q_FineScanMultiplier"], 0.0, 1.0, 0.92, 1.0, "fine scan")
    validate_map_range(nodes["Phase4R11_Q_ScanContrastDistanceFade"], 0.30, 2.40, 0.28, 1.0, "distance fade")
    validate_map_range(nodes["Phase4R11_Q_StaticPhosphorVariation"], 0.0, 1.0, 0.985, 1.008, "phosphor variation")
    operations = {
        "Phase4R11_Q_ScanDeltaFromUnity": "SUBTRACT",
        "Phase4R11_Q_FadedScanDelta": "MULTIPLY",
        "Phase4R11_Q_ScanEnvelope": "ADD",
        "Phase4R11_Q_StrengthTimesScanEnvelope": "MULTIPLY",
        "Phase4R11_Q_FinalPhysicalStrength": "MULTIPLY",
        "Phase4R11_Q_CorePhysicalCalibration": "MULTIPLY",
        "Phase4R11_Q_CoreEnergySplit": "MULTIPLY",
        "Phase4R11_Q_ScatterPhysicalCalibration": "MULTIPLY",
        "Phase4R11_Q_ScatterEnergySplit": "MULTIPLY",
        "Phase4R11_Q_ScatterTapAverage": "MULTIPLY",
    }
    for name, operation in operations.items():
        if nodes[name].operation != operation:
            raise RuntimeError(f"Q physical-strength operation differs: {name}")
    assert_close(nodes["Phase4R11_Q_ScanDeltaFromUnity"].inputs[1].default_value, 1.0, "scan unity subtraction")
    assert_close(nodes["Phase4R11_Q_ScanEnvelope"].inputs[0].default_value, 1.0, "scan unity restoration")
    for name, value, label in (
        ("Phase4R11_Q_CorePhysicalCalibration", 0.43, "core physical calibration"),
        ("Phase4R11_Q_CoreEnergySplit", 0.74, "core energy split"),
        ("Phase4R11_Q_ScatterPhysicalCalibration", 0.43, "scatter physical calibration"),
        ("Phase4R11_Q_ScatterEnergySplit", 0.26, "scatter energy split"),
        ("Phase4R11_Q_ScatterTapAverage", 0.125, "scatter tap average"),
    ):
        assert_close(nodes[name].inputs[1].default_value, value, f"Q {label}")
    link_specs = (
        ("Phase4R11_Q_UVCoordinates", "UV", "Phase4R11_Q_FineScanBands", "Vector"),
        ("Phase4R11_Q_FineScanBands", "Fac", "Phase4R11_Q_FineScanMultiplier", "Value"),
        ("Phase4R11_Q_UVCoordinates", "UV", "Phase4R11_Q_StaticPhosphorNoise", "Vector"),
        ("Phase4R11_Q_StaticPhosphorNoise", "Fac", "Phase4R11_Q_StaticPhosphorVariation", "Value"),
        ("Phase4R11_Q_CameraData", "View Distance", "Phase4R11_Q_ScanContrastDistanceFade", "Value"),
    )
    for from_name, from_socket, to_name, to_socket in link_specs:
        require_link(tree, nodes[from_name].outputs[from_socket], input_socket(nodes[to_name], to_socket), f"{from_name}->{to_name}")
    require_link(tree, nodes["Phase4R11_Q_FineScanMultiplier"].outputs["Result"], nodes["Phase4R11_Q_ScanDeltaFromUnity"].inputs[0], "scan multiplier")
    require_link(tree, nodes["Phase4R11_Q_ScanDeltaFromUnity"].outputs[0], nodes["Phase4R11_Q_FadedScanDelta"].inputs[0], "scan delta")
    require_link(tree, nodes["Phase4R11_Q_ScanContrastDistanceFade"].outputs["Result"], nodes["Phase4R11_Q_FadedScanDelta"].inputs[1], "distance fade")
    require_link(tree, nodes["Phase4R11_Q_FadedScanDelta"].outputs[0], nodes["Phase4R11_Q_ScanEnvelope"].inputs[1], "faded scan delta")
    require_link(tree, nodes["Math.001"].outputs[0], nodes["Phase4R11_Q_StrengthTimesScanEnvelope"].inputs[0], "base strength")
    require_link(tree, nodes["Phase4R11_Q_ScanEnvelope"].outputs[0], nodes["Phase4R11_Q_StrengthTimesScanEnvelope"].inputs[1], "scan envelope")
    require_link(tree, nodes["Phase4R11_Q_StrengthTimesScanEnvelope"].outputs[0], nodes["Phase4R11_Q_FinalPhysicalStrength"].inputs[0], "scan-adjusted strength")
    require_link(tree, nodes["Phase4R11_Q_StaticPhosphorVariation"].outputs["Result"], nodes["Phase4R11_Q_FinalPhysicalStrength"].inputs[1], "static variation")
    require_link(
        tree,
        nodes["Phase4R11_Q_FinalPhysicalStrength"].outputs[0],
        nodes["Phase4R11_Q_CorePhysicalCalibration"].inputs[0],
        "final scan/noise strength -> core calibration",
    )
    require_link(
        tree,
        nodes["Phase4R11_Q_CorePhysicalCalibration"].outputs[0],
        nodes["Phase4R11_Q_CoreEnergySplit"].inputs[0],
        "core calibration -> core split",
    )
    require_link(
        tree,
        nodes["Phase4R11_Q_CoreEnergySplit"].outputs[0],
        nodes["Emission"].inputs["Strength"],
        "core split -> core emission",
    )
    require_link(
        tree,
        nodes["Math.001"].outputs[0],
        nodes["Phase4R11_Q_ScatterPhysicalCalibration"].inputs[0],
        "base strength -> scatter calibration",
    )
    require_link(
        tree,
        nodes["Phase4R11_Q_ScatterPhysicalCalibration"].outputs[0],
        nodes["Phase4R11_Q_ScatterEnergySplit"].inputs[0],
        "scatter calibration -> scatter split",
    )
    require_link(
        tree,
        nodes["Phase4R11_Q_ScatterEnergySplit"].outputs[0],
        nodes["Phase4R11_Q_ScatterTapAverage"].inputs[0],
        "scatter split -> tap average",
    )
    require_link(
        tree,
        nodes["Phase4R11_Q_ScatterTapAverage"].outputs[0],
        nodes["Phase4R11_Q_ScatterEmission"].inputs["Strength"],
        "tap average -> scatter emission strength",
    )

    taps = []
    premultiplies = []
    for label, offset_x, offset_y in Q_SCATTER_OFFSETS:
        offset = nodes[f"Phase4R11_Q_ScatterOffset_{label}"]
        tap = nodes[f"Phase4R11_Q_ScatterTap_{label}"]
        premultiply = nodes[f"Phase4R11_Q_ScatterPremultiply_{label}"]
        if offset.operation != "ADD" or premultiply.operation != "SCALE":
            raise RuntimeError(f"Q {label} offset/premultiply operation differs")
        for component, expected in zip(offset.inputs[1].default_value, (offset_x, offset_y, 0.0)):
            assert_close(component, expected, f"Q {label} scatter offset component")
        if (
            tap.image is None
            or rna_identity(tap.image) != rna_identity(packed_image)
            or tap.interpolation != "Linear"
            or tap.extension != "CLIP"
        ):
            raise RuntimeError(f"Q {label} scatter image/interpolation/extension differs")
        require_link(
            tree,
            nodes["Phase4R11_Q_UVCoordinates"].outputs["UV"],
            offset.inputs[0],
            f"UV -> {label} scatter offset",
        )
        require_link(tree, offset.outputs["Vector"], tap.inputs["Vector"], f"{label} offset -> tap")
        require_link(
            tree,
            tap.outputs["Color"],
            premultiply.inputs[0],
            f"{label} tap Color -> premultiply",
        )
        require_link(
            tree,
            tap.outputs["Alpha"],
            input_socket(premultiply, "Scale"),
            f"{label} tap Alpha -> premultiply",
        )
        taps.append(tap)
        premultiplies.append(premultiply)

    scatter_color = premultiplies[0].outputs["Vector"]
    for index, premultiply in enumerate(premultiplies[1:], start=2):
        sum_node = nodes[f"Phase4R11_Q_ScatterSum_{index:02d}"]
        if sum_node.operation != "ADD":
            raise RuntimeError(f"Q scatter sum {index:02d} operation differs")
        require_link(tree, scatter_color, sum_node.inputs[0], f"scatter running sum {index:02d}")
        require_link(
            tree,
            premultiply.outputs["Vector"],
            sum_node.inputs[1],
            f"scatter premultiply -> sum {index:02d}",
        )
        scatter_color = sum_node.outputs["Vector"]
    require_link(
        tree,
        scatter_color,
        nodes["Phase4R11_Q_ScatterEmission"].inputs["Color"],
        "premultiplied scatter average -> scatter emission Color",
    )
    require_link(
        tree,
        nodes["Mix Shader"].outputs[0],
        nodes["Phase4R11_Q_CorePlusScatterSurface"].inputs[0],
        "preserved core surface -> additive surface",
    )
    require_link(
        tree,
        nodes["Phase4R11_Q_ScatterEmission"].outputs[0],
        nodes["Phase4R11_Q_CorePlusScatterSurface"].inputs[1],
        "scatter emission -> additive surface",
    )
    require_link(
        tree,
        nodes["Phase4R11_Q_CorePlusScatterSurface"].outputs[0],
        nodes["Material Output"].inputs["Surface"],
        "core plus scatter -> Q surface",
    )
    if has_link(tree, nodes["Math.001"].outputs[0], nodes["Emission"].inputs["Strength"]):
        raise RuntimeError("Q physical-strength bypass remains connected")
    if has_link(tree, nodes["Phase4R11_Q_FinalPhysicalStrength"].outputs[0], nodes["Emission"].inputs["Strength"]):
        raise RuntimeError("Q pre-calibration core-strength bypass remains connected")
    if has_link(tree, nodes["Mix Shader"].outputs[0], nodes["Material Output"].inputs["Surface"]):
        raise RuntimeError("Q pre-scatter surface bypass remains connected")
    image_nodes = sorted(
        (node for node in tree.nodes if node.bl_idname == "ShaderNodeTexImage"),
        key=lambda node: node.name,
    )
    expected_image_names = sorted(
        ["Image Texture", *(f"Phase4R11_Q_ScatterTap_{label}" for label, _x, _y in Q_SCATTER_OFFSETS)]
    )
    if (
        [node.name for node in image_nodes] != expected_image_names
        or int(packed_image.users) != Q_EXPECTED_IMAGE_REFERENCE_COUNT
        or any(node.image is None or rna_identity(node.image) != rna_identity(packed_image) for node in image_nodes)
    ):
        raise RuntimeError("Q exact packed-image nine-reference authority differs")
    return {
        "material": material.name,
        "nodeCount": len(expected_nodes),
        "linkCount": len(tree.links),
        "authority": spec,
        "imageSamplerCount": len(image_nodes),
        "packedImageUsers": int(packed_image.users),
        "addedSamePackedImageSamplers": 8,
        "scatterOffsets": [list(item) for item in Q_SCATTER_OFFSETS],
        "coreStrengthFormula": "FinalPhysicalStrength * 0.43 * 0.74",
        "scatterStrengthFormula": "Math.001 * 0.43 * 0.26 * 0.125",
        "coreScatterEnergySplitSum": 1.0,
        "sourceColorDirect": True,
        "sourceAlphaGateExact": True,
        "sourceVectorUnlinked": True,
        "tapColorsPremultipliedByTapAlpha": True,
        "outsideSampledCoverageExactBlackByConstruction": True,
        "scatterBypassesScanAndNoise": True,
        "coreScatterPhysicalTreatment": True,
        "animatedInputsAdded": False,
    }


def principled_values(node: Any) -> dict[str, float]:
    return {
        "roughness": float(node.inputs["Roughness"].default_value),
        "transmissionWeight": float(input_socket(node, "Transmission Weight").default_value),
        "ior": float(input_socket(node, "IOR").default_value),
        "specularIorLevel": float(input_socket(node, "Specular IOR Level").default_value),
        "coatWeight": float(input_socket(node, "Coat Weight").default_value),
        "emissionStrength": float(input_socket(node, "Emission Strength").default_value),
    }


def validate_glass_material(scene: Any) -> dict[str, Any]:
    material = bpy.data.materials.get(cfg.CRT_GLASS_MATERIAL)
    glass = bpy.data.objects.get(cfg.CRT_GLASS_OBJECT)
    if material is None or material.node_tree is None or glass is None or material.library is not None:
        raise RuntimeError("animated CRT glass authority is missing or not local")
    if material_users(material.name) != [
        {"object": cfg.CRT_GLASS_OBJECT, "data": "CRT_ConvexThickSmokedGlass_Mesh", "slot": 0}
    ] or int(material.users) != 1:
        raise RuntimeError("CRT glass material users differ")
    observed_nodes = {node.name: node.bl_idname for node in material.node_tree.nodes}
    if observed_nodes != GLASS_NODE_TYPES or len(material.node_tree.links) != 7:
        raise RuntimeError("CRT glass node/link inventory differs")
    nodes = {name: required_node(material, name, kind) for name, kind in GLASS_NODE_TYPES.items()}
    tree = material.node_tree
    output = nodes["Material Output"]
    inherited = nodes["Principled BSDF"]
    rough = nodes["Phase4R11_Glass_RoughTransmission"]
    dark = nodes["Phase4R11_Glass_DarkReflection"]
    inherited_mix = nodes["Phase4R11_Glass_InheritedPlusTransmission"]
    fresnel = nodes["Phase4R11_Glass_Fresnel"]
    fresnel_scale = nodes["Phase4R11_Glass_RestrainedFresnelScale"]
    surface = nodes["Phase4R11_Glass_PhysicalSurface"]
    if output.inputs["Volume"].is_linked or output.inputs["Displacement"].is_linked:
        raise RuntimeError("CRT glass has forbidden volume or displacement")
    if inherited.inputs["Normal"].is_linked or rough.inputs["Normal"].is_linked or dark.inputs["Normal"].is_linked:
        raise RuntimeError("CRT glass has forbidden bump/normal input")
    assert_close(input_socket(inherited, "Coat Weight").default_value, 0.0, "inherited glass coat")
    assert_close(inherited_mix.inputs[0].default_value, 0.14, "rough transmission mix")
    assert_close(fresnel.inputs["IOR"].default_value, 1.52, "glass Fresnel IOR")
    if fresnel_scale.operation != "MULTIPLY":
        raise RuntimeError("glass Fresnel scale operation differs")
    assert_close(fresnel_scale.inputs[1].default_value, 0.14, "glass Fresnel scale")
    expected_principled = {
        "Phase4R11_Glass_RoughTransmission": {
            "roughness": 0.12,
            "transmissionWeight": 1.0,
            "ior": 1.52,
            "specularIorLevel": 0.18,
            "coatWeight": 0.0,
            "emissionStrength": 0.0,
        },
        "Phase4R11_Glass_DarkReflection": {
            "roughness": 0.18,
            "transmissionWeight": 0.0,
            "ior": 1.52,
            "specularIorLevel": 0.32,
            "coatWeight": 0.0,
            "emissionStrength": 0.0,
        },
    }
    for name, expected in expected_principled.items():
        observed = principled_values(nodes[name])
        for key, value in expected.items():
            assert_close(observed[key], value, f"{name}.{key}")
        if vector(nodes[name].inputs["Base Color"].default_value) != vector(inherited.inputs["Base Color"].default_value):
            raise RuntimeError(f"{name} base color differs from inherited smoked glass")
    require_link(tree, inherited.outputs["BSDF"], inherited_mix.inputs[1], "inherited animated glass")
    require_link(tree, rough.outputs["BSDF"], inherited_mix.inputs[2], "rough transmission")
    require_link(tree, fresnel.outputs["Fac"], fresnel_scale.inputs[0], "glass Fresnel")
    require_link(tree, fresnel_scale.outputs[0], surface.inputs[0], "restrained Fresnel")
    require_link(tree, inherited_mix.outputs[0], surface.inputs[1], "base glass surface")
    require_link(tree, dark.outputs["BSDF"], surface.inputs[2], "dark reflection")
    require_link(tree, surface.outputs[0], output.inputs["Surface"], "final glass surface")
    if has_link(tree, inherited.outputs["BSDF"], output.inputs["Surface"]):
        raise RuntimeError("direct inherited-glass bypass remains connected")

    action = action_record(tree)
    animation = tree.animation_data
    if (
        action is None
        or action["name"] != cfg.CRT_GLASS_ACTION
        or animation is None
        or len(animation.drivers) != 0
        or len(animation.nla_tracks) != 0
        or len(action["curves"]) != 3
    ):
        raise RuntimeError("inherited glass action/driver/NLA authority differs")
    expected_by_path = {
        f'nodes["Principled BSDF"].inputs[{index}].default_value': list(GLASS_SCHEDULE[label])
        for label, index in GLASS_ACTION_INPUT_INDEX.items()
    }
    for curve in action["curves"]:
        expected = expected_by_path.get(curve["dataPath"])
        observed = [(int(key["frame"]), key["value"]) for key in curve["keyframes"]]
        if expected is None or len(observed) != len(expected):
            raise RuntimeError(f"unexpected inherited glass action curve: {curve['dataPath']}")
        for (observed_frame, observed_value), (expected_frame, expected_value) in zip(observed, expected):
            if observed_frame != expected_frame:
                raise RuntimeError("inherited glass keyframe schedule differs")
            assert_close(observed_value, expected_value, f"glass action {curve['dataPath']} F{expected_frame}")
        if any(key["interpolation"] != "BEZIER" for key in curve["keyframes"]):
            raise RuntimeError("inherited glass action interpolation differs")
    original_frame = (int(scene.frame_current), float(scene.frame_subframe))
    live_schedule: dict[str, Any] = {}
    try:
        for frame in (1, 335, 430, 486, 500):
            scene.frame_set(frame, subframe=0.0)
            bpy.context.view_layer.update()
            values = principled_values(inherited)
            record = {
                "roughness": rounded(values["roughness"]),
                "transmissionWeight": rounded(values["transmissionWeight"]),
                "specularIorLevel": rounded(values["specularIorLevel"]),
            }
            for label in record:
                expected = dict(GLASS_SCHEDULE[label])[frame]
                assert_close(record[label], expected, f"live glass {label} F{frame}")
            live_schedule[str(frame)] = record
    finally:
        scene.frame_set(original_frame[0], subframe=original_frame[1])
        bpy.context.view_layer.update()
    return {
        "material": material.name,
        "object": glass.name,
        "nodeCount": len(GLASS_NODE_TYPES),
        "linkCount": len(tree.links),
        "materialUsers": material_users(material.name),
        "actionSha256": canonical_hash(action),
        "actionCurveCount": 3,
        "liveSchedule": live_schedule,
        "liveScheduleFrames": [1, 335, 430, 486, 500],
        "noVolume": True,
        "noDisplacementOrBump": True,
        "noCoat": True,
        "inheritedPrincipledAndActionPreserved": True,
    }


def validate_hidden_legacy_scan() -> dict[str, Any]:
    scan_collection = bpy.data.collections.get("CRT_SCANLINE_GEOMETRY")
    startup_collection = bpy.data.collections.get("CRT_STARTUP_RASTER_EXPANSION")
    wake = bpy.data.objects.get("CRT_WakeHorizontalPhosphorLine")
    if scan_collection is None or startup_collection is None or wake is None:
        raise RuntimeError("legacy CRT scan/startup/wake authority is missing")
    scanlines = sorted(scan_collection.objects, key=lambda item: item.name)
    startup = sorted(startup_collection.objects, key=lambda item: item.name)
    if [obj.name for obj in scanlines] != [f"CRT_Scanline_{index:02d}" for index in range(1, 33)]:
        raise RuntimeError("legacy coarse scanline inventory differs")
    if [obj.name for obj in startup] != [f"CRT_StartupExpansionScanline_{index:02d}" for index in range(1, 19)]:
        raise RuntimeError("legacy startup-bar inventory differs")
    participants = [*scanlines, *startup, wake]
    if any(not obj.hide_render for obj in participants) or any(action_record(obj) is not None for obj in participants):
        raise RuntimeError("legacy CRT scan/startup/wake geometry is visible or animated")
    return {
        "coarseScanlines": 32,
        "startupBars": 18,
        "wakeLines": 1,
        "allRenderHidden": True,
        "allUnanimated": True,
    }


def missing_resource_audit() -> dict[str, Any]:
    missing_libraries = []
    for library in bpy.data.libraries:
        path = Path(bpy.path.abspath(library.filepath))
        if not path.is_file():
            missing_libraries.append(library.name)
    missing_images = []
    for image in bpy.data.images:
        if image.name in {"Render Result", "Viewer Node"} or image.source not in {"FILE", "SEQUENCE", "MOVIE"}:
            continue
        if len(image.packed_files) > 0:
            continue
        path = Path(bpy.path.abspath(image.filepath))
        if not path.is_file():
            missing_images.append(image.name)
    if missing_libraries or missing_images:
        raise RuntimeError(f"missing Blender resources: libraries={missing_libraries}, images={missing_images}")
    return {
        "libraries": len(bpy.data.libraries),
        "images": len([item for item in bpy.data.images if item.name not in {"Render Result", "Viewer Node"}]),
        "missingLibraries": [],
        "missingImages": [],
        "passes": True,
    }


def scene_authority_properties(scene: Any) -> dict[str, Any]:
    try:
        completed = json.loads(str(scene.get("phase4r1_1_completed_stages", "")))
        authorization = json.loads(str(scene.get("phase4r1_1_authorization", "")))
    except (TypeError, ValueError, json.JSONDecodeError) as error:
        raise RuntimeError("R1.1 scene authority properties are not valid JSON") from error
    expected_completed = list(cfg.STAGE_ORDER)
    if (
        scene.get("phase4r1_1_schema") != cfg.SCHEMA
        or scene.get("phase4r1_1_parent_sha256") != cfg.ACCEPTED_R1_SHA256
        or completed != expected_completed
        or authorization != cfg.AUTHORIZATION
        or any(authorization.values())
        or scene.get("phase4r1_1_builder_sha256") != EXPECTED_BUILDER["sha256"]
        or scene.get("phase4r1_1_config_sha256") != EXPECTED_CONFIG["sha256"]
    ):
        raise RuntimeError("R1.1 live scene authority/authorization properties differ")
    if (scene.frame_start, scene.frame_end, scene.render.fps, float(scene.render.fps_base)) != (1, 540, 30, 1.0):
        raise RuntimeError("live scene timeline differs")
    return {
        "schema": cfg.SCHEMA,
        "parentSha256": cfg.ACCEPTED_R1_SHA256,
        "completedStages": completed,
        "authorization": authorization,
        "builderSha256": EXPECTED_BUILDER["sha256"],
        "configSha256": EXPECTED_CONFIG["sha256"],
        "timeline": {"frameStart": 1, "frameEnd": 540, "fps": 30, "fpsBase": 1.0},
    }


def live_source_audit(build: dict[str, Any], authorities: dict[str, Any]) -> dict[str, Any]:
    require_blender()
    opened = Path(bpy.data.filepath).resolve()
    if opened != cfg.DERIVATIVE.resolve() or repo_record(opened) != authorities["derivative"]:
        raise RuntimeError("CRT diagnostic must open the exact CP4 derivative")
    scene = bpy.context.scene
    q_packed, payload = packed_q_record()
    q_plane = validate_q_plane_and_action()
    q_material = validate_q_material()
    glass = validate_glass_material(scene)
    legacy = validate_hidden_legacy_scan()
    resources = missing_resource_audit()
    properties = scene_authority_properties(scene)
    crt = build["stages"]["crt"]
    return {
        "blender": {"version": bpy.app.version_string, "versionTuple": list(bpy.app.version[:3])},
        "sourceAuthorities": authorities,
        "sceneAuthority": properties,
        "exactQ": {
            "packed": q_packed,
            "tracked": authorities["exactQTracked"],
            "packedEqualsTrackedBytes": payload == Q_TRACKED_PATH.read_bytes(),
            "differentBytes": 0,
            "encodedShaEqual": True,
            "decodedPixelDifference": 0,
            "decodedPixelDifferenceBasis": "encoded byte identity",
            "plane": q_plane,
            "material": q_material,
        },
        "glass": glass,
        "legacyCoarseScanGeometry": legacy,
        "resources": resources,
        "checkpoint4BuildGates": {
            "fixedAuthorityUnchanged": crt["fixedAuthorityUnchanged"],
            "materialUsersUnchanged": crt["materialUsersUnchanged"],
            "peripheryAuthorityUnchanged": crt["peripheryAuthorityUnchanged"],
            "exactlyTwoAllowedMaterialGraphsChanged": crt["exactlyTwoAllowedMaterialGraphsChanged"],
            "postSaveAuthorityExact": crt["postSaveAuthorityExact"],
            "preEffectsZeroDifference": crt["preEffectsSourceDifference"]["zeroDifference"],
            "postSaveFixedAuthoritySha256": canonical_hash(crt["postSaveFixedAuthority"]),
            "preservationAfterCrtSha256": canonical_hash(crt["preservationAfterCrt"]),
        },
        "dataBlockInventory": data_inventory(),
        "machineStatus": "PASS",
        "humanReviewDecision": "PENDING",
        "humanReviewRequired": True,
    }


def simple_value(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        return rounded(value)
    try:
        return [simple_value(item) for item in value]
    except (TypeError, AttributeError):
        return str(value)


def capture_scene_state(scene: Any) -> dict[str, Any]:
    render = scene.render
    cycles = scene.cycles
    image = render.image_settings
    state = {
        "camera": None if scene.camera is None else scene.camera.name,
        "frame": int(scene.frame_current),
        "subframe": rounded(scene.frame_subframe),
        "engine": render.engine,
        "filepath": render.filepath,
        "resolutionX": int(render.resolution_x),
        "resolutionY": int(render.resolution_y),
        "resolutionPercentage": int(render.resolution_percentage),
        "pixelAspectX": rounded(render.pixel_aspect_x),
        "pixelAspectY": rounded(render.pixel_aspect_y),
        "filmTransparent": bool(render.film_transparent),
        "useFileExtension": bool(render.use_file_extension),
        "useMotionBlur": bool(render.use_motion_blur),
        "imageSettings": {
            "fileFormat": image.file_format,
            "colorMode": image.color_mode,
            "colorDepth": image.color_depth,
            "compression": int(image.compression),
        },
        "viewSettings": {
            "viewTransform": scene.view_settings.view_transform,
            "look": scene.view_settings.look,
            "exposure": rounded(scene.view_settings.exposure),
            "gamma": rounded(scene.view_settings.gamma),
        },
        "cycles": {
            "samples": int(cycles.samples),
            "useAdaptiveSampling": bool(cycles.use_adaptive_sampling),
            "adaptiveThreshold": rounded(cycles.adaptive_threshold),
            "useDenoising": bool(cycles.use_denoising),
            "denoiser": cycles.denoiser,
            "device": cycles.device,
            "seed": int(cycles.seed),
        },
        "cableCollections": {
            name: {
                "hideRender": bool(bpy.data.collections[name].hide_render),
                "hideViewport": bool(bpy.data.collections[name].hide_viewport),
            }
            for name in CABLE_COLLECTIONS
        },
        "dataInventory": data_inventory(),
    }
    return state


def restore_scene_state(scene: Any, state: dict[str, Any]) -> None:
    render = scene.render
    cycles = scene.cycles
    image = render.image_settings
    scene.camera = None if state["camera"] is None else bpy.data.objects[state["camera"]]
    render.engine = state["engine"]
    render.filepath = state["filepath"]
    render.resolution_x = state["resolutionX"]
    render.resolution_y = state["resolutionY"]
    render.resolution_percentage = state["resolutionPercentage"]
    render.pixel_aspect_x = state["pixelAspectX"]
    render.pixel_aspect_y = state["pixelAspectY"]
    render.film_transparent = state["filmTransparent"]
    render.use_file_extension = state["useFileExtension"]
    render.use_motion_blur = state["useMotionBlur"]
    image.file_format = state["imageSettings"]["fileFormat"]
    image.color_mode = state["imageSettings"]["colorMode"]
    image.color_depth = state["imageSettings"]["colorDepth"]
    image.compression = state["imageSettings"]["compression"]
    scene.view_settings.view_transform = state["viewSettings"]["viewTransform"]
    scene.view_settings.look = state["viewSettings"]["look"]
    scene.view_settings.exposure = state["viewSettings"]["exposure"]
    scene.view_settings.gamma = state["viewSettings"]["gamma"]
    cycles.samples = state["cycles"]["samples"]
    cycles.use_adaptive_sampling = state["cycles"]["useAdaptiveSampling"]
    cycles.adaptive_threshold = state["cycles"]["adaptiveThreshold"]
    cycles.use_denoising = state["cycles"]["useDenoising"]
    cycles.denoiser = state["cycles"]["denoiser"]
    cycles.device = state["cycles"]["device"]
    cycles.seed = state["cycles"]["seed"]
    for name, values in state["cableCollections"].items():
        collection = bpy.data.collections[name]
        collection.hide_render = values["hideRender"]
        collection.hide_viewport = values["hideViewport"]
    scene.frame_set(state["frame"], subframe=state["subframe"])
    bpy.context.view_layer.update()


def capture_cycles_preferences() -> dict[str, Any] | None:
    addon = bpy.context.preferences.addons.get("cycles")
    if addon is None:
        return None
    preferences = addon.preferences
    try:
        preferences.get_devices()
    except Exception:
        pass
    return {
        "computeDeviceType": str(getattr(preferences, "compute_device_type", "")),
        "devices": [
            {"name": device.name, "type": device.type, "use": bool(device.use)}
            for device in preferences.devices
        ],
    }


def restore_cycles_preferences(state: dict[str, Any] | None) -> None:
    if state is None:
        return
    addon = bpy.context.preferences.addons.get("cycles")
    if addon is None:
        raise RuntimeError("Cycles preferences disappeared during diagnostic")
    preferences = addon.preferences
    if state["computeDeviceType"]:
        preferences.compute_device_type = state["computeDeviceType"]
    preferences.get_devices()
    expected = {(item["name"], item["type"]): item["use"] for item in state["devices"]}
    for device in preferences.devices:
        key = (device.name, device.type)
        if key in expected:
            device.use = expected[key]


class SceneTransaction:
    def __init__(self, scene: Any):
        self.scene = scene
        self.scene_state: dict[str, Any] | None = None
        self.preference_state: dict[str, Any] | None = None
        self.authority_before: dict[str, Any] | None = None

    def __enter__(self) -> "SceneTransaction":
        self.scene_state = capture_scene_state(self.scene)
        self.preference_state = capture_cycles_preferences()
        self.authority_before = verify_fixed_files()
        return self

    def __exit__(self, error_type: Any, error: Any, traceback: Any) -> bool:
        restore_errors = []
        try:
            assert self.scene_state is not None
            restore_scene_state(self.scene, self.scene_state)
        except BaseException as restore_error:
            restore_errors.append(f"scene restore: {restore_error}")
        try:
            restore_cycles_preferences(self.preference_state)
        except BaseException as restore_error:
            restore_errors.append(f"Cycles preference restore: {restore_error}")
        try:
            if capture_cycles_preferences() != self.preference_state:
                restore_errors.append("Cycles preference signature differs after restoration")
        except BaseException as restore_error:
            restore_errors.append(f"Cycles preference signature: {restore_error}")
        try:
            assert self.scene_state is not None
            after = capture_scene_state(self.scene)
            if after != self.scene_state:
                restore_errors.append("scene signature differs after restoration")
        except BaseException as restore_error:
            restore_errors.append(f"scene signature: {restore_error}")
        try:
            if verify_fixed_files() != self.authority_before:
                restore_errors.append("source/producer authority changed during diagnostic")
        except BaseException as restore_error:
            restore_errors.append(f"file authority: {restore_error}")
        if restore_errors:
            raise RuntimeError("; ".join(restore_errors)) from error
        return False


def configure_cycles(scene: Any, *, width: int, height: int, samples: int, motion_blur: bool) -> dict[str, Any]:
    scene.camera = bpy.data.objects.get(DESKTOP_CAMERA)
    if scene.camera is None or scene.camera.type != "CAMERA":
        raise RuntimeError("accepted desktop camera is missing")
    for name in CABLE_COLLECTIONS:
        collection = bpy.data.collections.get(name)
        if collection is None:
            raise RuntimeError(f"cable-family collection is missing: {name}")
        collection.hide_render = name != DESKTOP_CABLE_COLLECTION
    scene.render.engine = "CYCLES"
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = 1.0
    scene.render.pixel_aspect_y = 1.0
    scene.render.film_transparent = False
    scene.render.use_file_extension = False
    scene.render.use_motion_blur = motion_blur
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 30
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 1.0
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
    device = configure_cycles_device(scene)
    return {
        "engine": "CYCLES",
        "family": "desktop",
        "camera": DESKTOP_CAMERA,
        "width": width,
        "height": height,
        "samples": samples,
        "adaptiveSampling": True,
        "adaptiveThreshold": rounded(scene.cycles.adaptive_threshold),
        "denoising": True,
        "denoiser": "OPENIMAGEDENOISE",
        "motionBlur": motion_blur,
        "fps": MOTION_FPS,
        "viewTransform": "AgX",
        "look": "AgX - Medium High Contrast",
        "exposureStops": 1.0,
        "filmTransparent": False,
        "pixelAspect": [1.0, 1.0],
        "png": {"colorMode": "RGB", "colorDepth": 8, "compression": 30},
        "computeDevice": device,
    }


def configure_cycles_device(scene: Any) -> dict[str, Any]:
    addon = bpy.context.preferences.addons.get("cycles")
    if addon is None:
        scene.cycles.device = "CPU"
        return {"backend": "CPU", "sceneDevice": "CPU", "devices": []}
    preferences = addon.preferences
    attempts = []
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
                    "devices": [{"name": item.name, "type": item.type, "use": bool(item.use)} for item in preferences.devices],
                    "attempts": attempts,
                }
        except Exception as error:
            attempts.append({"backend": backend, "errorType": type(error).__name__})
    preferences.get_devices()
    for device in preferences.devices:
        device.use = device.type == "CPU"
    scene.cycles.device = "CPU"
    return {
        "backend": "CPU",
        "sceneDevice": "CPU",
        "devices": [{"name": item.name, "type": item.type, "use": bool(item.use)} for item in preferences.devices],
        "attempts": attempts,
    }


def plan_value(authorities: dict[str, Any]) -> dict[str, Any]:
    contract = {
        "stills": [
            {"frame": frame, "role": role, "resolution": [STILL_WIDTH, STILL_HEIGHT], "samples": STILL_SAMPLES}
            for frame, role in STILLS
        ],
        "motion": {
            "frameStart": MOTION_START,
            "frameEnd": MOTION_END,
            "frameCount": len(MOTION_FRAMES),
            "fps": MOTION_FPS,
            "durationSeconds": len(MOTION_FRAMES) / MOTION_FPS,
            "resolution": [MOTION_WIDTH, MOTION_HEIGHT],
            "samples": MOTION_SAMPLES,
            "chunks": [list(item) for item in MOTION_CHUNKS],
        },
        "common": {
            "engine": "CYCLES",
            "family": "desktop",
            "camera": DESKTOP_CAMERA,
            "adaptiveSampling": True,
            "denoiser": "OPENIMAGEDENOISE",
            "viewTransform": "AgX",
            "look": "AgX - Medium High Contrast",
            "exposureStops": 1.0,
        },
        "maximumAuthorizedFrame": MAXIMUM_AUTHORIZED_FRAME,
        "forbiddenProductionRange": list(FORBIDDEN_RANGE),
        "expectedRawPngCount": EXPECTED_RAW_PNG_COUNT,
    }
    value = {
        "schema": PLAN_SCHEMA,
        "status": "PASS",
        "sourceAuthorities": authorities,
        "renderContract": contract,
        "rootPolicy": {
            "externalAndUntracked": True,
            "newRootRequiredForAudit": True,
            "resumeRequiresExactPlan": True,
            "immutableFramesAndReceipts": True,
            "stagingFilesRequireExplicitQuarantine": True,
        },
        "privacyPolicy": {
            "rawBlenderPngsPackageEligible": False,
            "reason": "Blender PNG text chunks may expose the absolute source path",
            "publicFinalizerRequired": True,
            "publicPathsRelativeOnly": True,
        },
        "authorization": cfg.AUTHORIZATION,
        "humanReviewDecision": "PENDING",
        "complete540FrameCyclesFilmStarted": False,
        "complete540FrameCyclesFilmResumed": False,
        "finalRefinedMediaIntegrationStarted": False,
        "phase5Authorized": False,
        "generativeVideoAuthorized": False,
    }
    assert_no_private_strings(value, "evidence plan")
    return value


def expected_paths(root: Path) -> dict[tuple[str, int], tuple[Path, Path, int, int, int, bool, str]]:
    values: dict[tuple[str, int], tuple[Path, Path, int, int, int, bool, str]] = {}
    for frame, role in STILLS:
        image = root / "raw/stills" / f"crt-{role}-F{frame:03d}.png"
        receipt = image.with_suffix(".receipt.json")
        values[("still", frame)] = (image, receipt, STILL_WIDTH, STILL_HEIGHT, STILL_SAMPLES, False, role)
    for frame in MOTION_FRAMES:
        image = root / "raw/motion" / f"F{frame:03d}.png"
        receipt = image.with_suffix(".receipt.json")
        values[("motion", frame)] = (image, receipt, MOTION_WIDTH, MOTION_HEIGHT, MOTION_SAMPLES, True, "q-motion")
    return values


def load_plan(root: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    plan_path = root / "authority/evidence-plan.json"
    audit_path = root / "authority/source-audit.json"
    if not plan_path.is_file() or not audit_path.is_file():
        raise RuntimeError("CRT evidence root lacks its immutable plan/source audit")
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    audit = json.loads(audit_path.read_text(encoding="utf-8"))
    build, authorities = validate_source_build()
    expected_plan = plan_value(authorities)
    if plan != expected_plan:
        raise RuntimeError("stored CRT evidence plan is stale or divergent")
    if (
        audit.get("schema") != AUDIT_SCHEMA
        or audit.get("status") != "PASS"
        or audit.get("sourceAuthorities") != authorities
        or audit.get("plan") != {"path": "authority/evidence-plan.json", **file_record(plan_path)}
        or audit.get("humanReviewDecision") != "PENDING"
    ):
        raise RuntimeError("stored CRT source audit is stale or malformed")
    assert_no_private_strings(plan, "stored plan")
    assert_no_private_strings(audit, "stored audit")
    return plan, audit


def output_record(root: Path, path: Path) -> dict[str, Any]:
    return {"path": path.relative_to(root).as_posix(), **file_record(path)}


def expected_receipt_core(root: Path, plan_path: Path, kind: str, frame: int, settings: dict[str, Any], role: str) -> dict[str, Any]:
    return {
        "schema": RECEIPT_SCHEMA,
        "status": "PASS",
        "kind": kind,
        "frame": frame,
        "role": role,
        "sourcePlan": {"path": "authority/evidence-plan.json", **file_record(plan_path)},
        "renderSettings": settings,
        "authorization": cfg.AUTHORIZATION,
    }


def receipt_is_reusable(root: Path, image: Path, receipt_path: Path, expected_core: dict[str, Any], width: int, height: int) -> bool:
    if not image.exists() and not receipt_path.exists():
        return False
    if not image.is_file() or not receipt_path.is_file():
        raise RuntimeError(f"orphan raw image/receipt pair: {image.name}")
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    core = {key: receipt.get(key) for key in expected_core}
    if core != expected_core:
        raise RuntimeError(f"stale raw receipt authority: {receipt_path.name}")
    png = validate_raw_png(image, width, height)
    if receipt.get("file") != {**output_record(root, image), **png}:
        raise RuntimeError(f"raw image hash/dimension differs from receipt: {image.name}")
    assert_no_private_strings(receipt, receipt_path.name)
    return True


def render_frame(root: Path, kind: str, frame: int, role: str, width: int, height: int, samples: int, motion_blur: bool) -> dict[str, Any]:
    plan_path = root / "authority/evidence-plan.json"
    image, receipt_path, *_ = expected_paths(root)[(kind, frame)]
    settings = configure_cycles(
        bpy.context.scene,
        width=width,
        height=height,
        samples=samples,
        motion_blur=motion_blur,
    )
    expected_core = expected_receipt_core(root, plan_path, kind, frame, settings, role)
    if receipt_is_reusable(root, image, receipt_path, expected_core, width, height):
        return json.loads(receipt_path.read_text(encoding="utf-8"))
    image.parent.mkdir(parents=True, exist_ok=True)
    pending = image.with_name(f".{image.stem}.pending-{uuid.uuid4().hex}.png")
    if any(image.parent.glob(f".{image.stem}.pending-*.png")):
        raise RuntimeError(f"stale raw PNG staging file requires quarantine: {image.name}")
    scene = bpy.context.scene
    scene.frame_set(frame, subframe=0.0)
    bpy.context.view_layer.update()
    scene.render.filepath = str(pending)
    started = time.perf_counter()
    result = bpy.ops.render.render(write_still=True)
    elapsed = round(time.perf_counter() - started, 6)
    if result != {"FINISHED"} or not pending.is_file():
        raise RuntimeError(f"Cycles render did not finish at F{frame:03d}")
    png = validate_raw_png(pending, width, height)
    if image.exists():
        raise RuntimeError(f"refusing to replace raw frame: {image.name}")
    os.replace(pending, image)
    receipt = {
        **expected_core,
        "file": {**output_record(root, image), **png},
        "renderSeconds": elapsed,
        "rawPrivacy": {
            "packageEligible": False,
            "reason": "raw Blender PNG metadata is not privacy-sanitized",
        },
    }
    atomic_json_new(receipt_path, receipt)
    return receipt


def rebuild_raw_manifest(root: Path) -> dict[str, Any]:
    plan_path = root / "authority/evidence-plan.json"
    expected = expected_paths(root)
    allowed_pngs = {item[0].resolve() for item in expected.values()}
    allowed_receipts = {item[1].resolve() for item in expected.values()}
    actual_pngs = {path.resolve() for path in (root / "raw").rglob("*.png")}
    actual_receipts = {path.resolve() for path in (root / "raw").rglob("*.receipt.json")}
    if actual_pngs - allowed_pngs or actual_receipts - allowed_receipts:
        raise RuntimeError("raw evidence tree contains unexpected image/receipt files")
    files = []
    missing = []
    for (kind, frame), (image, receipt_path, width, height, samples, motion_blur, role) in sorted(expected.items()):
        if image.is_file() and receipt_path.is_file():
            receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
            settings = receipt.get("renderSettings")
            core = expected_receipt_core(root, plan_path, kind, frame, settings, role)
            if not receipt_is_reusable(root, image, receipt_path, core, width, height):
                raise RuntimeError(f"receipt unexpectedly not reusable: {receipt_path.name}")
            if settings.get("samples") != samples or settings.get("motionBlur") != motion_blur:
                raise RuntimeError(f"receipt render contract differs at F{frame:03d}")
            files.append(receipt["file"] | {"kind": kind, "frame": frame, "role": role})
        elif image.exists() or receipt_path.exists():
            raise RuntimeError(f"orphan evidence pair at F{frame:03d}")
        else:
            missing.append({"kind": kind, "frame": frame})
    manifest = {
        "schema": RAW_MANIFEST_SCHEMA,
        "status": "PASS" if not missing else "IN_PROGRESS",
        "sourcePlan": {"path": "authority/evidence-plan.json", **file_record(plan_path)},
        "expectedPngCount": EXPECTED_RAW_PNG_COUNT,
        "completedPngCount": len(files),
        "missingPngCount": len(missing),
        "missing": missing,
        "files": files,
        "rawPackageEligible": False,
        "authorization": cfg.AUTHORIZATION,
        "humanReviewDecision": "PENDING",
    }
    atomic_json_replace(root / "raw/phase4r1-1-crt-phosphor-raw-manifest.json", manifest)
    return manifest


def write_chunk_report(root: Path, chunk_index: int, receipts: list[dict[str, Any]]) -> dict[str, Any]:
    start, end = MOTION_CHUNKS[chunk_index]
    path = root / "raw/chunks" / f"chunk-F{start:03d}-F{end:03d}.json"
    value = {
        "schema": CHUNK_SCHEMA,
        "status": "PASS",
        "chunkIndex": chunk_index + 1,
        "frameStart": start,
        "frameEnd": end,
        "frameCount": end - start + 1,
        "frames": [receipt["file"] | {"frame": receipt["frame"]} for receipt in receipts],
        "sourcePlan": {"path": "authority/evidence-plan.json", **file_record(root / "authority/evidence-plan.json")},
        "authorization": cfg.AUTHORIZATION,
    }
    if path.is_file():
        if json.loads(path.read_text(encoding="utf-8")) != value:
            raise RuntimeError(f"existing chunk report differs: {path.name}")
    else:
        atomic_json_new(path, value)
    return value


def initialize_audit(root: Path) -> None:
    build, authorities = validate_source_build()
    root = validate_external_root_path(root, must_exist=False)
    staging = root.with_name(f".{root.name}.pending-{uuid.uuid4().hex}")
    if staging.exists():
        raise RuntimeError("audit root staging path unexpectedly exists")
    staging.mkdir(parents=False)
    try:
        for path in (
            staging / "authority",
            staging / "raw/stills",
            staging / "raw/motion",
            staging / "raw/chunks",
        ):
            path.mkdir(parents=True, exist_ok=False)
        plan = plan_value(authorities)
        plan_path = staging / "authority/evidence-plan.json"
        atomic_json_new(plan_path, plan)
        scene = bpy.context.scene
        with SceneTransaction(scene):
            audit_body = live_source_audit(build, authorities)
        audit = {
            "schema": AUDIT_SCHEMA,
            "status": "PASS",
            "generatedAt": utc_now(),
            "plan": {"path": "authority/evidence-plan.json", **file_record(plan_path)},
            **audit_body,
            "sourceUnchangedAfterAudit": verify_fixed_files() == authorities,
            "restorationExact": True,
            "authorization": cfg.AUTHORIZATION,
            "humanReviewDecision": "PENDING",
        }
        atomic_json_new(staging / "authority/source-audit.json", audit)
        os.replace(staging, root)
    except BaseException:
        # Preserve the staged root for forensic inspection; never delete it.
        raise
    print(f"QH_PHASE4R11_CRT_AUDIT_ROOT={root}")


def render_stills(root: Path) -> None:
    root = validate_external_root_path(root, must_exist=True)
    assert_no_staging_files(root)
    plan, stored_audit = load_plan(root)
    build, authorities = validate_source_build()
    scene = bpy.context.scene
    with SceneTransaction(scene):
        live = live_source_audit(build, authorities)
        if canonical_hash(live) != canonical_hash({key: stored_audit[key] for key in live}):
            raise RuntimeError("live CRT source audit differs from the root's pinned audit")
        receipts = []
        for order, (frame, role) in enumerate(STILLS, 1):
            receipts.append(render_frame(root, "still", frame, role, STILL_WIDTH, STILL_HEIGHT, STILL_SAMPLES, False))
            print(f"QH_PHASE4R11_CRT_STILL=F{frame:03d} ORDER={order}/{len(STILLS)}")
    manifest = rebuild_raw_manifest(root)
    print(f"QH_PHASE4R11_CRT_RAW_STATUS={manifest['status']} COMPLETED={manifest['completedPngCount']}/{EXPECTED_RAW_PNG_COUNT}")


def render_motion_chunk(root: Path, chunk_number: int) -> None:
    if not 1 <= chunk_number <= len(MOTION_CHUNKS):
        raise RuntimeError(f"motion chunk must be one of 1..{len(MOTION_CHUNKS)}")
    root = validate_external_root_path(root, must_exist=True)
    assert_no_staging_files(root)
    plan, stored_audit = load_plan(root)
    build, authorities = validate_source_build()
    start, end = MOTION_CHUNKS[chunk_number - 1]
    if end - start + 1 != 30 or start < MOTION_START or end > MOTION_END or end > MAXIMUM_AUTHORIZED_FRAME:
        raise RuntimeError("fixed motion chunk violates the bounded authorization contract")
    scene = bpy.context.scene
    with SceneTransaction(scene):
        live = live_source_audit(build, authorities)
        if canonical_hash(live) != canonical_hash({key: stored_audit[key] for key in live}):
            raise RuntimeError("live CRT source audit differs from the root's pinned audit")
        receipts = []
        for order, frame in enumerate(range(start, end + 1), 1):
            receipts.append(render_frame(root, "motion", frame, "q-motion", MOTION_WIDTH, MOTION_HEIGHT, MOTION_SAMPLES, True))
            print(f"QH_PHASE4R11_CRT_MOTION=F{frame:03d} CHUNK={chunk_number}/4 ORDER={order}/30")
    write_chunk_report(root, chunk_number - 1, receipts)
    manifest = rebuild_raw_manifest(root)
    print(f"QH_PHASE4R11_CRT_RAW_STATUS={manifest['status']} COMPLETED={manifest['completedPngCount']}/{EXPECTED_RAW_PNG_COUNT}")


def failure_report(root: Path | None, mode: str, error: BaseException) -> None:
    if root is None or not root.is_dir():
        return
    value = {
        "schema": FAILURE_SCHEMA,
        "status": "FAIL",
        "generatedAt": utc_now(),
        "mode": mode,
        "error": safe_error_text(error),
        "authorization": cfg.AUTHORIZATION,
        "humanReviewDecision": "PENDING",
    }
    name = f"failure-{mode}-{time.strftime('%Y%m%d-%H%M%S')}.json"
    try:
        atomic_json_new(root / "authority" / name, value)
    except BaseException:
        pass


def pure_self_test() -> dict[str, Any]:
    if len(MOTION_FRAMES) != 120 or MOTION_FRAMES[0] != 345 or MOTION_FRAMES[-1] != 464:
        raise RuntimeError("motion frame contract self-test failed")
    flattened = tuple(frame for start, end in MOTION_CHUNKS for frame in range(start, end + 1))
    if flattened != MOTION_FRAMES or any(end - start + 1 != 30 for start, end in MOTION_CHUNKS):
        raise RuntimeError("motion chunk partition self-test failed")
    all_frames = {frame for frame, _ in STILLS} | set(MOTION_FRAMES)
    if max(all_frames) > 500 or any(501 <= frame <= 540 for frame in all_frames) or len(STILLS) != 5:
        raise RuntimeError("render authorization self-test failed")
    expected_q_nodes = {**Q_SOURCE_NODE_TYPES, **Q_PHYSICAL_NODE_TYPES, **Q_SCATTER_NODE_TYPES}
    if (
        len(expected_q_nodes) != Q_EXPECTED_NODE_COUNT
        or len(Q_SOURCE_NODE_TYPES) != 8
        or len(Q_PHYSICAL_NODE_TYPES) != 12
        or len(Q_SCATTER_NODE_TYPES) != 38
        or len(Q_SCATTER_OFFSETS) != 8
        or any(not math.isclose(math.hypot(x, y), 0.0065, rel_tol=0.0, abs_tol=2e-6) for _label, x, y in Q_SCATTER_OFFSETS)
        or expected_build_q_image_references(repaired=False)["imageUsers"] != 1
        or expected_build_q_image_references(repaired=True)["imageUsers"] != Q_EXPECTED_IMAGE_REFERENCE_COUNT
    ):
        raise RuntimeError("exact 58-node/77-link scatter contract self-test failed")
    build, authorities = validate_source_build()
    plan = plan_value(authorities)
    assert_no_private_strings(plan, "self-test plan")
    unsafe_values = [r"C:\Users\example\source.blend", "file:///private/source.blend"]
    for unsafe in unsafe_values:
        try:
            assert_no_private_strings({"value": unsafe}, "unsafe self-test")
        except RuntimeError:
            pass
        else:
            raise RuntimeError("private-path rejection self-test failed")
    # A minimal valid 1x1 RGB PNG proves CRC/IHDR parsing without Pillow.
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    png = (
        PNG_SIGNATURE
        + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(b"\x00\x10\x20\x30"))
        + chunk(b"IEND", b"")
    )
    with tempfile.TemporaryDirectory(prefix="qsite-crt-producer-selftest-") as temporary:
        path = Path(temporary) / "pixel.png"
        path.write_bytes(png)
        record = validate_raw_png(path, 1, 1)
        value = {
            "schema": "self-test",
            "status": "PASS",
            "nested": {
                "tuple": (("E", 0.0065, 0.0), ("SW", -0.0045961941, -0.0045961941)),
                "listContainingTuple": [1, (2, 3)],
            },
        }
        target = Path(temporary) / "atomic.json"
        atomic_json_new(target, value)
        normalized_value = json.loads(json.dumps(value))
        if json.loads(target.read_text(encoding="utf-8")) != normalized_value:
            raise RuntimeError("atomic JSON tuple/list normalization self-test failed")
        replacement = {
            "schema": "self-test",
            "status": "PASS",
            "nested": {"tuple": (("N", 0.0, 0.0065),)},
        }
        atomic_json_replace(target, replacement)
        if json.loads(target.read_text(encoding="utf-8")) != json.loads(json.dumps(replacement)):
            raise RuntimeError("atomic JSON replacement normalization self-test failed")
    result = {
        "status": "PASS",
        "renderer": repo_record(Path(__file__).resolve()),
        "finalizer": repo_record(FINALIZER_PATH),
        "fixedSourceAuthorities": authorities,
        "sourceBuildThroughStage": build["throughStage"],
        "motionFrameCount": len(MOTION_FRAMES),
        "chunkCount": len(MOTION_CHUNKS),
        "stillCount": len(STILLS),
        "expectedRawPngCount": EXPECTED_RAW_PNG_COUNT,
        "qMaterialNodeCount": Q_EXPECTED_NODE_COUNT,
        "qMaterialLinkCount": Q_EXPECTED_LINK_COUNT,
        "qPackedImageReferenceCount": Q_EXPECTED_IMAGE_REFERENCE_COUNT,
        "pngParser": record,
        "blenderLaunched": False,
        "renderStarted": False,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return result


def parse_blender_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("audit", "stills", "motion-chunk"), required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--chunk", type=int)
    args = parser.parse_args(argv)
    if args.mode == "motion-chunk" and args.chunk is None:
        parser.error("--chunk is required for motion-chunk")
    if args.mode != "motion-chunk" and args.chunk is not None:
        parser.error("--chunk is only valid for motion-chunk")
    return args


def main() -> None:
    if "--self-test" in sys.argv:
        if any(token in sys.argv for token in ("--mode", "--output", "--chunk")):
            raise RuntimeError("--self-test cannot be combined with render arguments")
        pure_self_test()
        return
    require_blender()
    args = parse_blender_args()
    root = Path(args.output)
    try:
        if args.mode == "audit":
            initialize_audit(root)
        elif args.mode == "stills":
            render_stills(root)
        elif args.mode == "motion-chunk":
            render_motion_chunk(root, int(args.chunk))
        else:  # argparse makes this unreachable.
            raise RuntimeError(f"unsupported mode: {args.mode}")
    except BaseException as error:
        failure_report(root.resolve() if root else None, args.mode, error)
        raise


if __name__ == "__main__":
    main()
