"""Render and finalize the fresh Phase 4-R1 v2 sparse Eevee proof.

This producer has two deliberately separate transactions::

    blender refined.blend --background --python this_file.py -- \
        --mode render --output NEW_EMPTY_EXTERNAL_DIRECTORY

    blender refined.blend --background --python this_file.py -- \
        --mode finalize --output EXISTING_RENDER_DIRECTORY \
        --native-audit EXTERNAL_NATIVE_VISUAL_AUDIT_JSON

``render`` creates only new sparse Eevee frames, nine deterministic contact
sheets, measured pixel evidence, six role audits, and an immutable render-stage
report.  It never emits the final sparse manifest.  ``finalize`` accepts only
an independently authored native-render inspection whose nine findings PASS;
it then publishes that audit and the exhaustive manifest without overwriting
anything.  A PASS manifest is evidence-integrity status, never human creative
acceptance, full-film authorization, runtime-integration authorization, or
Phase 5 authorization.

Recovered R1 visual bytes are never read or copied by this producer.  The
source derivative, source-build report, source-validation report, exact-Q
provenance, all source role audits, and every tracked producer are hash-bound
before either transaction may proceed.
"""

from __future__ import annotations

import binascii
import hashlib
import json
import math
import os
import re
import struct
import subprocess
import sys
import tempfile
import time
import uuid
import zlib
from collections import Counter, deque
from pathlib import Path
from typing import Any, Iterable

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
import phase4r1_refined_config as cfg


SPARSE_MANIFEST_NAME = "phase4r1-refined-sparse-proof-manifest.json"
STAGE_REPORT_NAME = "phase4r1-refined-sparse-render-stage.json"
NATIVE_AUDIT_NAME = "native-visual-audit.json"
MANIFEST_SCHEMA = "quantum-hub.phase-4-r1.refined-proving-hall.sparse-proof.v2"
STAGE_SCHEMA = "quantum-hub.phase-4-r1.refined-proving-hall.sparse-render-stage.v2"
NATIVE_AUDIT_SCHEMA = "quantum-hub.phase-4-r1.refined-proving-hall.native-visual-audit.v2"

AUTHORIZATION_KEYS = (
    "full540FrameCyclesProductionFilmStarted",
    "full540FrameCyclesProductionFilmResumed",
    "refinedPhysicalMediaRuntimeIntegrationStarted",
    "chromeStatePolicyImplementationEvidenced",
    "humanAccepted",
    "phase5Authorized",
)
RETIRED_AUTHORITY_KEYS = {
    "productionRenderingStarted",
    "productionRenderingResumed",
    "runtimeIntegrationStarted",
    "runtimeIntegrationAuthorized",
    "full540CyclesProductionFilmStarted",
    "full540CyclesProductionFilmResumed",
}

ROLE_TO_AUDIT_KEY = {
    "central-floor-object-audit": "centralFloor",
    "palette-audit": "palette",
    "cable-geometry-audit": "cable",
    "current-continuity-audit": "current",
    "exact-q-fidelity-audit": "q",
    "camera-audit": "camera",
}

SHEET_ROLES = (
    "dark-dormant-factory-sheet",
    "wide-to-tight-cable-sheet",
    "central-floor-object-audit-sheet",
    "perimeter-wall-detail-sheet",
    "shadow-composition-sheet",
    "cable-origin-sheet",
    "simple-rear-connection-closeup",
    "continuous-current-sheet",
    "camera-path-evidence-sheet",
)

# Every normal proof frame is rendered at the exact authored family resolution
# from cfg.PREVIEW_RESOLUTIONS.  Contact sheets use the exact desktop review
# resolution from that same authority; no upscaling of sparse source frames is
# used as evidence for another family.
NORMAL_FRAMES = {
    "desktop": (1, 46, 76, 106, 165, 225, 285, 355, 460),
    "mobile": (1, 165, 285),
    "landscape": (1, 165, 285),
}
CURRENT_ISOLATION_FRAMES = {
    "desktop": (76, 165, 225, 285),
    "mobile": (165,),
    "landscape": (165,),
}
SHEET_SPECS = {
    "dark-dormant-factory-sheet": (3, (("desktop", 1), ("mobile", 1), ("landscape", 1))),
    "wide-to-tight-cable-sheet": (3, (("desktop", 1), ("mobile", 1), ("landscape", 1))),
    "central-floor-object-audit-sheet": (3, (("desktop", 1), ("desktop", 165), ("desktop", 285))),
    "perimeter-wall-detail-sheet": (3, (("desktop", 1), ("desktop", 106), ("desktop", 225))),
    "shadow-composition-sheet": (3, (("desktop", 1), ("desktop", 106), ("desktop", 225))),
    "cable-origin-sheet": (3, (("desktop", 76), ("mobile", 76), ("landscape", 76))),
    "simple-rear-connection-closeup": (3, (("desktop", 285), ("mobile", 285), ("landscape", 285))),
    "continuous-current-sheet": (3, (("desktop", 46), ("desktop", 76), ("desktop", 106), ("desktop", 165), ("desktop", 225), ("desktop", 285))),
    "camera-path-evidence-sheet": (4, (("desktop", 1), ("desktop", 76), ("desktop", 106), ("desktop", 165), ("desktop", 225), ("desktop", 285), ("desktop", 355), ("desktop", 460))),
}

FONT_5X7 = {
    " ": ("00000",) * 7,
    "-": ("00000", "00000", "00000", "11111", "00000", "00000", "00000"),
    ":": ("00000", "00100", "00100", "00000", "00100", "00100", "00000"),
    "/": ("00001", "00010", "00100", "01000", "10000", "00000", "00000"),
    ".": ("00000", "00000", "00000", "00000", "00000", "00110", "00110"),
    "0": ("01110", "10001", "10011", "10101", "11001", "10001", "01110"),
    "1": ("00100", "01100", "00100", "00100", "00100", "00100", "01110"),
    "2": ("01110", "10001", "00001", "00010", "00100", "01000", "11111"),
    "3": ("11110", "00001", "00001", "01110", "00001", "00001", "11110"),
    "4": ("00010", "00110", "01010", "10010", "11111", "00010", "00010"),
    "5": ("11111", "10000", "10000", "11110", "00001", "00001", "11110"),
    "6": ("01110", "10000", "10000", "11110", "10001", "10001", "01110"),
    "7": ("11111", "00001", "00010", "00100", "01000", "01000", "01000"),
    "8": ("01110", "10001", "10001", "01110", "10001", "10001", "01110"),
    "9": ("01110", "10001", "10001", "01111", "00001", "00001", "01110"),
    "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
    "B": ("11110", "10001", "10001", "11110", "10001", "10001", "11110"),
    "C": ("01111", "10000", "10000", "10000", "10000", "10000", "01111"),
    "D": ("11110", "10001", "10001", "10001", "10001", "10001", "11110"),
    "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
    "F": ("11111", "10000", "10000", "11110", "10000", "10000", "10000"),
    "G": ("01111", "10000", "10000", "10111", "10001", "10001", "01111"),
    "H": ("10001", "10001", "10001", "11111", "10001", "10001", "10001"),
    "I": ("01110", "00100", "00100", "00100", "00100", "00100", "01110"),
    "J": ("00111", "00010", "00010", "00010", "10010", "10010", "01100"),
    "K": ("10001", "10010", "10100", "11000", "10100", "10010", "10001"),
    "L": ("10000", "10000", "10000", "10000", "10000", "10000", "11111"),
    "M": ("10001", "11011", "10101", "10101", "10001", "10001", "10001"),
    "N": ("10001", "11001", "10101", "10011", "10001", "10001", "10001"),
    "O": ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
    "P": ("11110", "10001", "10001", "11110", "10000", "10000", "10000"),
    "Q": ("01110", "10001", "10001", "10001", "10101", "10010", "01101"),
    "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
    "S": ("01111", "10000", "10000", "01110", "00001", "00001", "11110"),
    "T": ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
    "U": ("10001", "10001", "10001", "10001", "10001", "10001", "01110"),
    "V": ("10001", "10001", "10001", "10001", "10001", "01010", "00100"),
    "W": ("10001", "10001", "10001", "10101", "10101", "10101", "01010"),
    "X": ("10001", "10001", "01010", "00100", "01010", "10001", "10001"),
    "Y": ("10001", "10001", "01010", "00100", "00100", "00100", "00100"),
    "Z": ("11111", "00001", "00010", "00100", "01000", "10000", "11111"),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_json_bytes(value: Any) -> bytes:
    return (json.dumps(value, indent=2, sort_keys=True) + "\n").encode("utf-8")


def safe_relative_posix(path: Path, root: Path) -> str:
    relative = path.resolve().relative_to(root.resolve()).as_posix()
    parts = relative.split("/")
    if not relative or relative.startswith("/") or "\\" in relative or ":" in relative or any(part in {"", ".", ".."} for part in parts):
        raise RuntimeError(f"unsafe evidence-relative path: {relative!r}")
    if any(ord(character) < 32 for character in relative):
        raise RuntimeError("control character in evidence-relative path")
    return relative


def repo_record(path: Path) -> dict[str, Any]:
    path = path.resolve()
    return {
        "path": safe_relative_posix(path, cfg.REPOSITORY_ROOT.resolve()),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def is_git_tracked(repo_path: str) -> bool:
    result = subprocess.run(
        ["git", "ls-files", "--error-unmatch", "--", repo_path],
        cwd=cfg.REPOSITORY_ROOT,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise RuntimeError(f"JSON authority must be an object: {path.name}")
    return value


def reject_private_paths(value: Any, context: str) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            reject_private_paths(key, context)
            reject_private_paths(item, context)
    elif isinstance(value, (list, tuple)):
        for item in value:
            reject_private_paths(item, context)
    elif isinstance(value, str):
        lowered = value.lower()
        if "c:\\users\\" in lowered or "c:/users/" in lowered or "file://" in lowered or re.search(r"[a-zA-Z]:[\\/]", value):
            raise RuntimeError(f"private or absolute host path rejected in {context}")


def reject_retired_authority_keys(value: Any, context: str) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            if key in RETIRED_AUTHORITY_KEYS or key.startswith("productionRendering") or key.startswith("full540Cycles"):
                raise RuntimeError(f"retired authorization key {key!r} rejected in {context}")
            reject_retired_authority_keys(item, context)
    elif isinstance(value, (list, tuple)):
        for item in value:
            reject_retired_authority_keys(item, context)


def validate_authorization(value: dict[str, Any], context: str) -> None:
    if tuple(value.keys()) != AUTHORIZATION_KEYS and set(value.keys()) != set(AUTHORIZATION_KEYS):
        raise RuntimeError(f"{context} authorization keys are not the exact v2 authority set")
    if value != cfg.AUTHORIZATION:
        raise RuntimeError(f"{context} authorization truth differs from frozen config")
    reject_retired_authority_keys(value, context)


def report_authorization() -> dict[str, Any]:
    validate_authorization(cfg.AUTHORIZATION, "config")
    return {**cfg.AUTHORIZATION, "authorization": dict(cfg.AUTHORIZATION)}


def publish_bytes_exclusive(target: Path, payload: bytes) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        raise RuntimeError(f"refusing to overwrite evidence: {target.name}")
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.", suffix=".pending", dir=str(target.parent))
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.link(temporary, target)
        if target.stat().st_size != len(payload) or sha256(target) != hashlib.sha256(payload).hexdigest():
            raise RuntimeError(f"exclusive publication verification failed: {target.name}")
    finally:
        if temporary.is_file():
            temporary.unlink()


def publish_json_exclusive(target: Path, value: dict[str, Any]) -> None:
    reject_private_paths(value, target.name)
    reject_retired_authority_keys(value, target.name)
    publish_bytes_exclusive(target, canonical_json_bytes(value))


def publish_file_exclusive(source: Path, target: Path) -> None:
    expected_size = source.stat().st_size
    expected_hash = sha256(source)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        raise RuntimeError(f"refusing to overwrite evidence: {target.name}")
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.", suffix=".pending", dir=str(target.parent))
    temporary = Path(temporary_name)
    try:
        with source.open("rb") as source_handle, os.fdopen(descriptor, "wb") as target_handle:
            for chunk in iter(lambda: source_handle.read(1024 * 1024), b""):
                target_handle.write(chunk)
            target_handle.flush()
            os.fsync(target_handle.fileno())
        if temporary.stat().st_size != expected_size or sha256(temporary) != expected_hash:
            raise RuntimeError(f"staged evidence copy changed bytes: {source.name}")
        os.link(temporary, target)
        if target.stat().st_size != expected_size or sha256(target) != expected_hash:
            raise RuntimeError(f"exclusive evidence publication changed bytes: {target.name}")
    finally:
        if temporary.is_file():
            temporary.unlink()


def acquire_lock(root: Path, mode: str) -> tuple[Path, tuple[int, int, int]]:
    lock = root / f".phase4r1-sparse-{mode}.lock"
    descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    payload = f"phase4r1-sparse-{mode}\n".encode("ascii")
    with os.fdopen(descriptor, "wb") as handle:
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())
    stat = lock.stat()
    return lock, (int(stat.st_dev), int(stat.st_ino), int(stat.st_size))


def release_owned_lock(lock: Path, identity: tuple[int, int, int]) -> None:
    if not lock.is_file():
        return
    stat = lock.stat()
    actual = (int(stat.st_dev), int(stat.st_ino), int(stat.st_size))
    if actual != identity:
        raise RuntimeError(f"refusing to remove concurrently replaced lock: {lock.name}")
    lock.unlink()


def parse_args() -> dict[str, Any]:
    values: dict[str, Any] = {"mode": None, "output": None, "native_audit": None}
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    index = 0
    while index < len(argv):
        token = argv[index]
        if not token.startswith("--") or index + 1 >= len(argv):
            raise RuntimeError(f"invalid sparse-proof argument: {token}")
        key = token[2:].replace("-", "_")
        if key not in values:
            raise RuntimeError(f"unknown sparse-proof argument: {token}")
        values[key] = argv[index + 1]
        index += 2
    if values["mode"] not in {"render", "finalize"}:
        raise RuntimeError("--mode must be render or finalize")
    if values["output"] is None:
        raise RuntimeError("--output is required")
    if values["mode"] == "render" and values["native_audit"] is not None:
        raise RuntimeError("--native-audit is accepted only by explicit finalize mode")
    if values["mode"] == "finalize" and values["native_audit"] is None:
        raise RuntimeError("finalize requires --native-audit")
    return values


def external_root(value: str, require_empty: bool) -> Path:
    output = Path(value).resolve()
    repository = cfg.REPOSITORY_ROOT.resolve()
    if output == repository or repository in output.parents:
        raise RuntimeError("sparse visual proof must remain external to Git")
    if require_empty:
        output.mkdir(parents=True, exist_ok=True)
        if any(output.iterdir()):
            raise RuntimeError("sparse render output must be a new empty root; old visual evidence may not be reused")
    elif not output.is_dir():
        raise RuntimeError("finalize requires the existing sparse render-stage directory")
    return output


def verify_sources() -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, dict[str, Any]]]:
    opened = Path(bpy.data.filepath).resolve()
    if opened != cfg.DERIVATIVE_SOURCE.resolve():
        raise RuntimeError("sparse producer requires the exact refined derivative open")
    build = read_json(cfg.BUILD_REPORT)
    validation = read_json(cfg.VALIDATION_REPORT)
    q_provenance = read_json(cfg.Q_PROVENANCE_REPORT)
    asset_ledger = read_json(cfg.ASSET_LEDGER)
    if build.get("schema") != "quantum-hub.phase-4-r1.refined-proving-hall.source-build.v2" or build.get("status") != "PASS":
        raise RuntimeError("refined source-build authority is not PASS v2")
    if validation.get("schema") != "quantum-hub.phase-4-r1.refined-proving-hall.source-validation.v2" or validation.get("status") != "PASS":
        raise RuntimeError("refined source-validation authority is not PASS v2")
    if q_provenance.get("schema") != "quantum-hub.phase-4-r1.exact-q-provenance.v2" or q_provenance.get("status") != "PASS":
        raise RuntimeError("exact-Q provenance authority is not PASS v2")
    if asset_ledger.get("schema") != "quantum-hub.phase-4-r1.refined-proving-hall.asset-ledger.v2" or asset_ledger.get("status") != "PASS":
        raise RuntimeError("refined asset-ledger authority is not PASS v2")
    actual_derivative = repo_record(opened)
    if actual_derivative != build.get("sourceAuthorities", {}).get("refinedDerivative"):
        raise RuntimeError("refined derivative differs from source-build binding")
    if actual_derivative != validation.get("sourceAuthorities", {}).get("derivative"):
        raise RuntimeError("refined derivative differs from source-validation binding")
    actual_build = repo_record(cfg.BUILD_REPORT)
    actual_q_provenance = repo_record(cfg.Q_PROVENANCE_REPORT)
    actual_asset_ledger = repo_record(cfg.ASSET_LEDGER)
    if validation.get("sourceAuthorities", {}).get("build") != actual_build:
        raise RuntimeError("source-build bytes differ from source-validation binding")
    if validation.get("sourceAuthorities", {}).get("qProvenance") != actual_q_provenance:
        raise RuntimeError("exact-Q provenance bytes differ from source-validation binding")
    if build.get("sourceAuthorities", {}).get("exactQProvenance") != actual_q_provenance:
        raise RuntimeError("exact-Q provenance bytes differ from source-build binding")
    if validation.get("sourceAuthorities", {}).get("ledger") != actual_asset_ledger:
        raise RuntimeError("asset-ledger bytes differ from source-validation binding")
    ledger_sources = asset_ledger.get("sourceAuthorities", {})
    if ledger_sources.get("refinedDerivative") != actual_derivative or ledger_sources.get("exactQProvenance") != actual_q_provenance:
        raise RuntimeError("asset ledger does not bind the exact refined derivative and exact-Q provenance")
    ledger_assets = {row.get("id"): row for row in asset_ledger.get("assets", []) if isinstance(row, dict)}
    if ledger_assets.get("exact-quantum-q", {}).get("provenance") != actual_q_provenance:
        raise RuntimeError("asset ledger exact-Q asset does not bind the exact provenance bytes")
    visual_authority = cfg.HALL_VISUAL_AUTHORITY
    try:
        scene_visual_authority = json.loads(str(bpy.context.scene.get("phase4r1v2_hall_visual_authority_json", "")))
    except (TypeError, ValueError, json.JSONDecodeError):
        scene_visual_authority = None
    if (
        build.get("design", {}).get("environment", {}).get("visualAuthority") != visual_authority
        or validation.get("livePreflight", {}).get("audits", {}).get("hallVisualAuthority", {}).get("authority") != visual_authority
        or validation.get("livePreflight", {}).get("audits", {}).get("hallVisualAuthority", {}).get("passes") is not True
        or scene_visual_authority != visual_authority
        or bpy.context.scene.view_settings.view_transform != visual_authority["viewTransform"]
        or bpy.context.scene.view_settings.look != visual_authority["look"]
        or abs(float(bpy.context.scene.view_settings.exposure) - float(visual_authority["exposureStops"])) > 1e-9
    ):
        raise RuntimeError("sparse producer global hall visual authority is absent, stale, or differs from the saved source")
    producer_authorities = build.get("producerAuthorities")
    if not isinstance(producer_authorities, dict) or producer_authorities != validation.get("producerAuthorities"):
        raise RuntimeError("source build/validation producer authorities differ")
    actual_sparse_producer = repo_record(Path(__file__).resolve())
    if producer_authorities.get("sparse-proof-renderer") != actual_sparse_producer:
        raise RuntimeError("sparse-proof producer is not exact-hash-bound by source build and validation")
    if q_provenance.get("producerAuthority") != producer_authorities.get("exact-q-generator"):
        raise RuntimeError("exact-Q provenance producer differs from the tracked build authority")
    for producer_id, expected in sorted(producer_authorities.items()):
        if not isinstance(expected, dict) or set(expected) != {"path", "bytes", "sha256"}:
            raise RuntimeError(f"malformed producer authority: {producer_id}")
        producer_path = cfg.REPOSITORY_ROOT / expected["path"]
        if not producer_path.is_file() or repo_record(producer_path) != expected or not is_git_tracked(expected["path"]):
            raise RuntimeError(f"producer is absent, stale, or untracked: {producer_id}")
    source_authorities = {
        "derivative": actual_derivative,
        "sourceBuild": actual_build,
        "sourceValidation": repo_record(cfg.VALIDATION_REPORT),
        "exactQProvenance": actual_q_provenance,
        "assetLedger": actual_asset_ledger,
    }
    source_audits: dict[str, dict[str, Any]] = {}
    validation_audit_records = validation.get("auditReports", {})
    for role, path in cfg.AUDIT_REPORTS.items():
        report = read_json(path)
        expected_schema = f"quantum-hub.phase-4-r1.refined-proving-hall.{role}.v2"
        if report.get("schema") != expected_schema or report.get("status") != "PASS":
            raise RuntimeError(f"source audit is not PASS v2: {role}")
        if validation_audit_records.get(role) != repo_record(path):
            raise RuntimeError(f"source audit differs from validation binding: {role}")
        if report.get("producerAuthorities") != producer_authorities:
            raise RuntimeError(f"source audit producer binding differs: {role}")
        validate_authorization(report.get("authorization", {}), f"source audit {role}")
        source_audits[role] = report
    validate_authorization(build.get("authorization", {}), "source build")
    validate_authorization(validation.get("authorization", {}), "source validation")
    validate_authorization(q_provenance.get("authorization", {}), "exact-Q provenance")
    validate_authorization(asset_ledger.get("authorization", {}), "asset ledger")
    reject_private_paths(source_authorities, "source authorities")
    reject_retired_authority_keys((build, validation, q_provenance, asset_ledger, source_audits), "source authorities")
    return build, validation, q_provenance, source_authorities, producer_authorities, source_audits


def png_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as handle:
        header = handle.read(24)
    if len(header) != 24 or header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        raise RuntimeError(f"not a PNG authority: {path.name}")
    width, height = struct.unpack(">II", header[16:24])
    if width <= 0 or height <= 0:
        raise RuntimeError(f"invalid PNG dimensions: {path.name}")
    return width, height


def output_record(root: Path, path: Path, metadata: dict[str, Any]) -> dict[str, Any]:
    role = metadata.get("role")
    if not isinstance(role, str) or not role:
        raise RuntimeError(f"missing evidence role: {path.name}")
    suffix = path.suffix.lower()
    if suffix == ".png":
        width, height = png_dimensions(path)
        family = metadata.get("family")
        frame = metadata.get("frame")
        if not isinstance(family, str) or not family or not isinstance(frame, int):
            raise RuntimeError(f"every image requires family/frame metadata: {path.name}")
        record: dict[str, Any] = {
            "role": role,
            "path": safe_relative_posix(path, root),
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
            "width": width,
            "height": height,
            "mediaType": "image/png",
            "family": family,
            "frame": frame,
        }
        for key in ("families", "frames", "isolation"):
            if key in metadata:
                record[key] = metadata[key]
        return record
    if suffix == ".json":
        return {
            "role": role,
            "path": safe_relative_posix(path, root),
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
            "width": 0,
            "height": 0,
            "mediaType": "application/json",
        }
    raise RuntimeError(f"unsupported sparse evidence media type: {path.name}")


def choose_eevee_engine(scene: bpy.types.Scene) -> str:
    engine_property = scene.render.bl_rna.properties["engine"]
    identifiers = {item.identifier for item in engine_property.enum_items}
    for candidate in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        if candidate in identifiers:
            return candidate
    raise RuntimeError(f"Eevee render engine is unavailable: {sorted(identifiers)}")


class SceneState:
    """Restore every render/visibility mutation; this producer never saves."""

    def __init__(self) -> None:
        scene = bpy.context.scene
        render = scene.render
        image = render.image_settings
        view = scene.view_settings
        self.scene = scene
        self.frame = scene.frame_current
        self.camera = scene.camera
        self.render_values = {
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
        self.image_values = {
            "file_format": image.file_format,
            "color_mode": image.color_mode,
            "color_depth": image.color_depth,
            "compression": image.compression,
        }
        self.view_values = {"view_transform": view.view_transform, "look": view.look, "exposure": view.exposure}
        self.collection_visibility = {collection.name: bool(collection.hide_render) for collection in bpy.data.collections}
        self.object_visibility = {obj.name: bool(obj.hide_render) for obj in bpy.data.objects}
        self.world_color = None if scene.world is None else tuple(scene.world.color)
        self.world_backgrounds: list[tuple[Any, tuple[float, ...], float]] = []
        world = scene.world
        if world is not None and world.use_nodes and world.node_tree is not None:
            for node in world.node_tree.nodes:
                if node.bl_idname == "ShaderNodeBackground":
                    self.world_backgrounds.append((node, tuple(node.inputs["Color"].default_value), float(node.inputs["Strength"].default_value)))
        self.created_objects: list[bpy.types.Object] = []
        self.created_cameras: list[bpy.types.Camera] = []

    def restore_visibility_and_world(self) -> None:
        scene = self.scene
        for name, value in self.object_visibility.items():
            obj = bpy.data.objects.get(name)
            if obj is not None:
                obj.hide_render = value
        for node, color, strength in self.world_backgrounds:
            if node.id_data is not None:
                node.inputs["Color"].default_value = color
                node.inputs["Strength"].default_value = strength
        if scene.world is not None and self.world_color is not None:
            scene.world.color = self.world_color

    def restore(self) -> None:
        scene = self.scene
        for key, value in self.render_values.items():
            setattr(scene.render, key, value)
        for key, value in self.image_values.items():
            setattr(scene.render.image_settings, key, value)
        for key, value in self.view_values.items():
            setattr(scene.view_settings, key, value)
        for name, value in self.collection_visibility.items():
            collection = bpy.data.collections.get(name)
            if collection is not None:
                collection.hide_render = value
        self.restore_visibility_and_world()
        scene.camera = self.camera
        scene.frame_set(self.frame)
        for obj in self.created_objects:
            if obj.name in bpy.data.objects:
                bpy.data.objects.remove(obj, do_unlink=True)
        for camera in self.created_cameras:
            if camera.name in bpy.data.cameras:
                bpy.data.cameras.remove(camera)


def configure_common_render(scene: bpy.types.Scene, width: int, height: int, engine: str) -> None:
    scene.render.engine = engine
    scene.render.resolution_x = int(width)
    scene.render.resolution_y = int(height)
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
    scene.view_settings.view_transform = cfg.HALL_VISUAL_AUTHORITY["viewTransform"]
    scene.view_settings.look = cfg.HALL_VISUAL_AUTHORITY["look"]
    scene.view_settings.exposure = float(cfg.HALL_VISUAL_AUTHORITY["exposureStops"])


def configure_family(family: str) -> None:
    scene = bpy.context.scene
    camera = bpy.data.objects.get(cfg.CAMERAS[family])
    if camera is None or camera.type != "CAMERA":
        raise RuntimeError(f"missing authored camera for {family}")
    scene.camera = camera
    for candidate, spec in cfg.CABLE_FAMILIES.items():
        collection = bpy.data.collections.get(spec["collection"])
        if collection is None:
            raise RuntimeError(f"missing refined cable collection: {spec['collection']}")
        collection.hide_render = candidate != family


def render_to_exclusive_png(root: Path, target: Path) -> float:
    temporary_dir = root / f".render-{uuid.uuid4().hex}"
    temporary_dir.mkdir(parents=False, exist_ok=False)
    temporary = temporary_dir / "frame.png"
    try:
        bpy.context.scene.render.filepath = str(temporary)
        started = time.perf_counter()
        bpy.ops.render.render(write_still=True)
        elapsed = round(time.perf_counter() - started, 6)
        if not temporary.is_file() or temporary.stat().st_size <= 32:
            raise RuntimeError(f"Blender did not produce a valid sparse frame: {target.name}")
        png_dimensions(temporary)
        publish_file_exclusive(temporary, target)
        return elapsed
    finally:
        if temporary.is_file():
            temporary.unlink()
        if temporary_dir.is_dir() and not any(temporary_dir.iterdir()):
            temporary_dir.rmdir()


def curve_world_points(obj: bpy.types.Object) -> Iterable[Vector]:
    if obj.type != "CURVE":
        return
    for spline in obj.data.splines:
        if spline.type == "BEZIER":
            for point in spline.bezier_points:
                yield obj.matrix_world @ point.co
        else:
            for point in spline.points:
                yield obj.matrix_world @ Vector(point.co[:3])


def current_objects(family: str) -> list[bpy.types.Object]:
    objects = sorted(
        (
            obj
            for obj in bpy.data.objects
            if obj.get("phase4r1v2_current_segment") is True and obj.get("phase4r1v2_family") == family
        ),
        key=lambda obj: int(obj.get("phase4r1v2_segment_index", -1)),
    )
    expected = int(cfg.CABLE_FAMILIES[family]["segments"])
    if len(objects) != expected:
        raise RuntimeError(f"{family} current isolation expected {expected} segments, found {len(objects)}")
    return objects


def set_world_black() -> None:
    world = bpy.context.scene.world
    if world is None:
        return
    world.color = (0.0, 0.0, 0.0)
    if world.use_nodes and world.node_tree is not None:
        for node in world.node_tree.nodes:
            if node.bl_idname == "ShaderNodeBackground":
                node.inputs["Color"].default_value = (0.0, 0.0, 0.0, 1.0)
                node.inputs["Strength"].default_value = 0.0


def evaluated_current_vertices_world(family: str) -> list[Vector]:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    vertices: list[Vector] = []
    for obj in current_objects(family):
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            vertices.extend(evaluated.matrix_world @ vertex.co for vertex in mesh.vertices)
        finally:
            evaluated.to_mesh_clear()
    return vertices


def make_overhead_current_camera(state: SceneState, family: str, width: int, height: int, frames: tuple[int, ...]) -> tuple[bpy.types.Object, dict[str, Any]]:
    scene = bpy.context.scene
    frame_vertices: dict[int, list[Vector]] = {}
    for frame in frames:
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        frame_vertices[frame] = evaluated_current_vertices_world(family)
        if not frame_vertices[frame]:
            raise RuntimeError(f"no evaluated current-isolation geometry for {family} F{frame:03d}")
    points = [point for vertices in frame_vertices.values() for point in vertices]
    minimum_x = min(point.x for point in points)
    maximum_x = max(point.x for point in points)
    minimum_y = min(point.y for point in points)
    maximum_y = max(point.y for point in points)
    minimum_z = min(point.z for point in points)
    maximum_z = max(point.z for point in points)
    centre_x = (minimum_x + maximum_x) * 0.5
    centre_y = (minimum_y + maximum_y) * 0.5
    extent_x = max(0.1, maximum_x - minimum_x)
    extent_y = max(0.1, maximum_y - minimum_y)
    aspect = width / height
    fit_inset = float(cfg.CURRENT_ISOLATION_PIXEL_AUTHORITY["fitInsetNdc"])
    ortho_scale = max(extent_y, extent_x / aspect) / (1.0 - 2.0 * fit_inset)
    camera_data = bpy.data.cameras.new(f"Phase4R1V2_SparseCurrentAudit_{family.title()}_Data")
    camera_data.type = "ORTHO"
    camera_data.sensor_fit = "VERTICAL"
    camera_data.ortho_scale = ortho_scale
    camera_data.lens = 50.0
    camera_data.clip_start = 0.01
    camera_data.clip_end = 100.0
    camera = bpy.data.objects.new(f"Phase4R1V2_SparseCurrentAudit_{family.title()}", camera_data)
    camera.location = (centre_x, centre_y, maximum_z + 30.0)
    camera.rotation_euler = (0.0, 0.0, 0.0)
    scene.collection.objects.link(camera)
    state.created_objects.append(camera)
    state.created_cameras.append(camera_data)
    scene.camera = camera
    bpy.context.view_layer.update()
    required_inset = float(cfg.CURRENT_ISOLATION_PIXEL_AUTHORITY["minimumEvaluatedGeometryInsetNdc"])
    projection_records: dict[str, Any] = {}
    for frame, vertices in frame_vertices.items():
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        projected = [world_to_camera_view(scene, camera, point) for point in vertices]
        bounds = {
            "x": [min(float(point.x) for point in projected), max(float(point.x) for point in projected)],
            "y": [min(float(point.y) for point in projected), max(float(point.y) for point in projected)],
            "z": [min(float(point.z) for point in projected), max(float(point.z) for point in projected)],
        }
        minimum_inset = min(bounds["x"][0], bounds["y"][0], 1.0 - bounds["x"][1], 1.0 - bounds["y"][1])
        passed = bounds["z"][0] > 0.0 and minimum_inset + 1e-9 >= required_inset
        projection_records[f"F{frame:03d}"] = {
            "evaluatedVertexCount": len(vertices),
            "ndcBounds": {axis: [round(value, 9) for value in values] for axis, values in bounds.items()},
            "minimumInsetNdc": round(minimum_inset, 9),
            "requiredMinimumInsetNdc": required_inset,
            "allDepthsPositive": bounds["z"][0] > 0.0,
            "passes": passed,
        }
    framing = {
        "family": family,
        "camera": camera.name,
        "cameraData": camera_data.name,
        "cameraType": camera_data.type,
        "sensorFit": camera_data.sensor_fit,
        "resolution": [width, height],
        "fitInsetNdc": fit_inset,
        "orthoScale": float(camera_data.ortho_scale),
        "evaluatedGeometryBoundsWorldMeters": {
            "x": [round(minimum_x, 9), round(maximum_x, 9)],
            "y": [round(minimum_y, 9), round(maximum_y, 9)],
            "z": [round(minimum_z, 9), round(maximum_z, 9)],
        },
        "evaluatedGeometryFrameProjections": projection_records,
        "passes": camera_data.sensor_fit == "VERTICAL" and all(record["passes"] for record in projection_records.values()),
    }
    if not framing["passes"]:
        raise RuntimeError({"message": f"{family} evaluated current geometry violates the fail-closed camera inset", "framing": framing})
    return camera, framing


def make_perspective_audit_camera(state: SceneState, name: str, location: Vector, target: Vector, lens_millimeters: float) -> bpy.types.Object:
    camera_data = bpy.data.cameras.new(f"{name}_Data")
    camera_data.type = "PERSP"
    camera_data.lens = lens_millimeters
    camera_data.clip_start = 0.02
    camera_data.clip_end = 500.0
    camera = bpy.data.objects.new(name, camera_data)
    camera.location = location
    direction = target - location
    if direction.length <= 1e-9:
        raise RuntimeError(f"audit camera {name} has a zero-length aim")
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(camera)
    state.created_objects.append(camera)
    state.created_cameras.append(camera_data)
    return camera


def render_normal_frames(root: Path, engine: str, metadata: dict[str, dict[str, Any]]) -> dict[tuple[str, int], Path]:
    scene = bpy.context.scene
    paths: dict[tuple[str, int], Path] = {}
    for family in ("desktop", "mobile", "landscape"):
        configure_family(family)
        width, height = cfg.PREVIEW_RESOLUTIONS[family]
        configure_common_render(scene, width, height, engine)
        for frame in NORMAL_FRAMES[family]:
            scene.frame_set(frame)
            target = root / "raw" / family / f"F{frame:03d}.png"
            elapsed = render_to_exclusive_png(root, target)
            metadata[safe_relative_posix(target, root)] = {
                "role": f"sparse-eevee-{family}-F{frame:03d}",
                "family": family,
                "frame": frame,
                "renderSeconds": elapsed,
            }
            paths[(family, frame)] = target
            print(f"QH_PHASE4R1_REFINED_SPARSE_FRAME={family}:F{frame:03d}")
    return paths


def render_environment_isolation(root: Path, engine: str, metadata: dict[str, dict[str, Any]]) -> Path:
    scene = bpy.context.scene
    configure_family("desktop")
    width, height = cfg.PREVIEW_RESOLUTIONS["desktop"]
    configure_common_render(scene, width, height, engine)
    hidden_names: set[str] = set()
    cable_collection_names = tuple(
        name
        for spec in cfg.CABLE_FAMILIES.values()
        for name in (spec["collection"], spec["source_collection"])
    )
    for collection_name in (*cfg.ACCEPTED_CRT_COLLECTIONS, *cable_collection_names):
        collection = bpy.data.collections.get(collection_name)
        if collection is not None:
            hidden_names.update(obj.name for obj in collection.all_objects)
    hidden_names.update(spec["source_object"] for spec in cfg.CABLE_FAMILIES.values())
    for name in hidden_names:
        obj = bpy.data.objects.get(name)
        if obj is not None:
            obj.hide_render = True
    scene.frame_set(1)
    target = root / "isolation" / "environment-desktop-F001.png"
    elapsed = render_to_exclusive_png(root, target)
    metadata[safe_relative_posix(target, root)] = {
        "role": "environment-isolation-desktop-F001",
        "family": "desktop",
        "frame": 1,
        "isolation": "non-CRT/non-current proving-hall environment",
        "renderSeconds": elapsed,
    }
    return target


def render_current_isolations(root: Path, engine: str, state: SceneState, metadata: dict[str, dict[str, Any]]) -> tuple[dict[tuple[str, int], Path], dict[str, Any]]:
    scene = bpy.context.scene
    width, height = cfg.PREVIEW_RESOLUTIONS["desktop"]
    paths: dict[tuple[str, int], Path] = {}
    framing: dict[str, Any] = {}
    for family in ("desktop", "mobile", "landscape"):
        configure_family(family)
        configure_common_render(scene, width, height, engine)
        for obj in bpy.data.objects:
            obj.hide_render = True
        active = current_objects(family)
        for obj in active:
            obj.hide_render = False
        set_world_black()
        camera, framing[family] = make_overhead_current_camera(state, family, width, height, CURRENT_ISOLATION_FRAMES[family])
        camera.hide_render = False
        scene.camera = camera
        for frame in CURRENT_ISOLATION_FRAMES[family]:
            scene.frame_set(frame)
            target = root / "isolation" / f"current-{family}-F{frame:03d}.png"
            elapsed = render_to_exclusive_png(root, target)
            metadata[safe_relative_posix(target, root)] = {
                "role": f"current-isolation-{family}-F{frame:03d}",
                "family": family,
                "frame": frame,
                "isolation": "orthographic full-route emission-only current proof",
                "renderSeconds": elapsed,
            }
            paths[(family, frame)] = target
    return paths, framing


def render_detail_audit_views(root: Path, engine: str, state: SceneState, metadata: dict[str, dict[str, Any]]) -> dict[tuple[str, str, int], Path]:
    scene = bpy.context.scene
    width, height = cfg.PREVIEW_RESOLUTIONS["desktop"]
    source = Vector(cfg.PERIMETER_SOURCE_WORLD_M)
    floor_entry = Vector(cfg.PERIMETER_FLOOR_ENTRY_WORLD_M)
    origin_target = source.lerp(floor_entry, 0.38) + Vector((0.0, 0.0, 0.14))
    rear_target = Vector(cfg.ACCEPTED_REAR_COLLAR_WORLD_M) + Vector((0.0, 0.0, 0.16))
    cameras = {
        "cable-origin": make_perspective_audit_camera(
            state,
            "Phase4R1V2_SparseCableOriginAudit",
            origin_target + Vector((2.55, 2.35, 1.30)),
            origin_target,
            58.0,
        ),
        "rear-connection": make_perspective_audit_camera(
            state,
            "Phase4R1V2_SparseRearConnectionAudit",
            rear_target + Vector((1.38, 2.05, 0.82)),
            rear_target,
            68.0,
        ),
    }
    requests = (
        ("cable-origin", 76, "perimeter flush service mouth and weighted lead"),
        ("rear-connection", 285, "restrained lower-rear collar, terminal lift, and axial seat"),
    )
    paths: dict[tuple[str, str, int], Path] = {}
    configure_common_render(scene, width, height, engine)
    for view, frame, purpose in requests:
        for family in ("desktop", "mobile", "landscape"):
            configure_family(family)
            scene.camera = cameras[view]
            scene.frame_set(frame)
            target = root / "audit-views" / f"{view}-{family}-F{frame:03d}.png"
            elapsed = render_to_exclusive_png(root, target)
            metadata[safe_relative_posix(target, root)] = {
                "role": f"{view}-audit-view-{family}-F{frame:03d}",
                "family": family,
                "frame": frame,
                "isolation": f"fresh render-only perspective helper: {purpose}; accepted authored cameras/actions untouched",
                "renderSeconds": elapsed,
            }
            paths[(view, family, frame)] = target
    return paths


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
        chunk_type = payload[cursor + 4 : cursor + 8]
        data = payload[cursor + 8 : cursor + 8 + length]
        expected_crc = struct.unpack(">I", payload[cursor + 8 + length : cursor + 12 + length])[0]
        if binascii.crc32(chunk_type + data) & 0xFFFFFFFF != expected_crc:
            raise RuntimeError(f"PNG CRC failure: {path.name}")
        cursor += 12 + length
        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type, compression, filter_method, interlace = struct.unpack(">IIBBBBB", data)
            if compression != 0 or filter_method != 0:
                raise RuntimeError(f"unsupported PNG encoding: {path.name}")
        elif chunk_type == b"IDAT":
            compressed.extend(data)
        elif chunk_type == b"IEND":
            break
    if width is None or height is None or bit_depth != 8 or color_type not in {2, 6} or interlace != 0:
        raise RuntimeError(f"sparse proof requires non-interlaced 8-bit RGB/RGBA PNG: {path.name}")
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


def png_chunk(kind: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", binascii.crc32(kind + payload) & 0xFFFFFFFF)


def encode_png_rgb(width: int, height: int, rgb: bytearray) -> bytes:
    if len(rgb) != width * height * 3:
        raise RuntimeError("RGB payload length does not match PNG dimensions")
    scanlines = bytearray()
    stride = width * 3
    for y in range(height):
        scanlines.append(0)
        scanlines.extend(rgb[y * stride : (y + 1) * stride])
    return b"".join(
        (
            b"\x89PNG\r\n\x1a\n",
            png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)),
            png_chunk(b"IDAT", zlib.compress(bytes(scanlines), 9)),
            png_chunk(b"IEND", b""),
        )
    )


def fill_rect(rgb: bytearray, width: int, height: int, x: int, y: int, rectangle_width: int, rectangle_height: int, color: tuple[int, int, int]) -> None:
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(width, x + rectangle_width), min(height, y + rectangle_height)
    if x0 >= x1 or y0 >= y1:
        return
    row = bytes(color) * (x1 - x0)
    for target_y in range(y0, y1):
        start = (target_y * width + x0) * 3
        rgb[start : start + len(row)] = row


def draw_text(rgb: bytearray, width: int, height: int, x: int, y: int, text: str, color: tuple[int, int, int], scale: int = 2) -> None:
    cursor = x
    for character in text.upper():
        glyph = FONT_5X7.get(character, FONT_5X7[" "])
        for glyph_y, row in enumerate(glyph):
            for glyph_x, value in enumerate(row):
                if value == "1":
                    fill_rect(rgb, width, height, cursor + glyph_x * scale, y + glyph_y * scale, scale, scale, color)
        cursor += 6 * scale


def copy_letterboxed_nearest(source: tuple[int, int, bytearray], destination: bytearray, destination_width: int, destination_height: int, x: int, y: int, width: int, height: int) -> None:
    source_width, source_height, source_rgb = source
    scale = min(width / source_width, height / source_height)
    rendered_width = max(1, int(source_width * scale))
    rendered_height = max(1, int(source_height * scale))
    offset_x = x + (width - rendered_width) // 2
    offset_y = y + (height - rendered_height) // 2
    for target_y in range(rendered_height):
        source_y = min(source_height - 1, int(target_y * source_height / rendered_height))
        for target_x in range(rendered_width):
            source_x = min(source_width - 1, int(target_x * source_width / rendered_width))
            source_offset = (source_y * source_width + source_x) * 3
            target_offset = ((offset_y + target_y) * destination_width + offset_x + target_x) * 3
            destination[target_offset : target_offset + 3] = source_rgb[source_offset : source_offset + 3]


def compose_sheet(
    role: str,
    columns: int,
    panels: tuple[tuple[str, int], ...],
    normal_paths: dict[tuple[str, int], Path],
    detail_paths: dict[tuple[str, str, int], Path],
) -> bytes:
    width, height = cfg.PREVIEW_RESOLUTIONS["desktop"]
    background = tuple(int(cfg.PALETTE["primary_black"][index : index + 2], 16) for index in (1, 3, 5))
    canvas = bytearray(bytes(background) * (width * height))
    header_height = 48
    gutter = 8
    rows = math.ceil(len(panels) / columns)
    cell_width = (width - gutter * (columns + 1)) // columns
    cell_height = (height - header_height - gutter * (rows + 1)) // rows
    label_height = 24
    title = role.replace("-", " ")
    fill_rect(canvas, width, height, 0, 0, width, header_height, (20, 9, 15))
    fill_rect(canvas, width, height, 0, header_height - 3, width, 3, (216, 43, 114))
    draw_text(canvas, width, height, 16, 14, title[:100], (240, 107, 160), 2)
    decoded_cache: dict[Path, tuple[int, int, bytearray]] = {}
    for index, (family, frame) in enumerate(panels):
        row, column = divmod(index, columns)
        cell_x = gutter + column * (cell_width + gutter)
        cell_y = header_height + gutter + row * (cell_height + gutter)
        fill_rect(canvas, width, height, cell_x, cell_y, cell_width, cell_height, (14, 17, 18))
        detail_view = "cable-origin" if role == "cable-origin-sheet" else "rear-connection" if role == "simple-rear-connection-closeup" else None
        path = detail_paths[(detail_view, family, frame)] if detail_view is not None else normal_paths[(family, frame)]
        source = decoded_cache.setdefault(path, read_png_rgb(path))
        copy_letterboxed_nearest(source, canvas, width, height, cell_x, cell_y, cell_width, cell_height - label_height)
        fill_rect(canvas, width, height, cell_x, cell_y + cell_height - label_height, cell_width, label_height, (26, 32, 32))
        draw_text(canvas, width, height, cell_x + 8, cell_y + cell_height - label_height + 5, f"{family} / F{frame:03d}", (183, 174, 163), 2)
    return encode_png_rgb(width, height, canvas)


LINEAR_SRGB = tuple(value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4 for value in (index / 255.0 for index in range(256)))


def linear_luminance(red: int, green: int, blue: int) -> float:
    return 0.2126 * LINEAR_SRGB[red] + 0.7152 * LINEAR_SRGB[green] + 0.0722 * LINEAR_SRGB[blue]


def histogram_quantile(histogram: list[int], fraction: float) -> float:
    total = sum(histogram)
    if total <= 0:
        return 0.0
    target = max(1, math.ceil(total * fraction))
    cumulative = 0
    for index, count in enumerate(histogram):
        cumulative += count
        if cumulative >= target:
            return index / (len(histogram) - 1)
    return 1.0


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


def mask_bounds(mask: bytearray, width: int, height: int) -> dict[str, int] | None:
    indices = [index for index, active in enumerate(mask) if active]
    if not indices:
        return None
    xs = [index % width for index in indices]
    ys = [index // width for index in indices]
    return {"pixels": len(indices), "minX": min(xs), "minY": min(ys), "maxX": max(xs), "maxY": max(ys)}


def boundary_clearance(bounds: dict[str, int] | None, width: int, height: int) -> int | None:
    if bounds is None:
        return None
    return min(bounds["minX"], bounds["minY"], width - 1 - bounds["maxX"], height - 1 - bounds["maxY"])


def dormant_pixel_metrics(path: Path, family: str, context: str) -> dict[str, Any]:
    if family not in cfg.CABLE_FAMILIES or context not in {"family-dormant", "environment-isolation"}:
        raise RuntimeError(f"invalid dormant pixel audit scope: {family} / {context}")
    authority = cfg.DORMANT_PIXEL_AUTHORITY
    width, height, rgb = read_png_rgb(path)
    pixel_count = width * height
    histogram = [0] * 65537
    palette = Counter()
    magenta_count = 0
    bright_neutral_mask = bytearray(pixel_count)
    total_luminance = 0.0
    maximum_luminance = -1.0
    maximum_location = (0, 0)
    four_bit_black_bin_count = 0
    for pixel in range(pixel_count):
        offset = pixel * 3
        red, green, blue = rgb[offset], rgb[offset + 1], rgb[offset + 2]
        luminance = linear_luminance(red, green, blue)
        total_luminance += luminance
        histogram[min(65536, round(luminance * 65536))] += 1
        if all(channel < int(authority["fourBitBlackBinChannelMaximumExclusive8Bit"]) for channel in (red, green, blue)):
            four_bit_black_bin_count += 1
        if luminance > maximum_luminance:
            maximum_luminance = luminance
            maximum_location = (pixel % width, pixel // width)
        palette[((red >> 4) << 4, (green >> 4) << 4, (blue >> 4) << 4)] += 1
        if red >= 26 and blue >= 20 and green * 100 < min(red, blue) * 58 and red > blue * 0.72:
            magenta_count += 1
        if luminance >= float(authority["brightNeutralMinimumLinearLuminance"]) and max(red, green, blue) - min(red, green, blue) <= int(authority["brightNeutralMaximumChannelSpread8Bit"]):
            bright_neutral_mask[pixel] = 1
    bright_neutral_count = sum(bright_neutral_mask)
    components = connected_components(bright_neutral_mask, width, height, max(8, pixel_count // 250000))
    largest_component = components[0]["pixels"] if components else 0
    dominant = [
        {"hex": f"#{red:02x}{green:02x}{blue:02x}", "pixelCount": count, "fraction": round(count / pixel_count, 8)}
        for (red, green, blue), count in palette.most_common(8)
    ]
    mean = total_luminance / pixel_count
    p90 = histogram_quantile(histogram, 0.90)
    p99 = histogram_quantile(histogram, 0.99)
    four_bit_black_bin_fraction = four_bit_black_bin_count / pixel_count
    bright_neutral_fraction = bright_neutral_count / pixel_count
    largest_bright_neutral_fraction = largest_component / pixel_count
    mean_pass = float(authority["meanLinearLuminanceRange"][0]) <= mean <= float(authority["meanLinearLuminanceRange"][1])
    p90_pass = float(authority["p90LinearLuminanceRange"][0]) <= p90 <= float(authority["p90LinearLuminanceRange"][1])
    p99_range = authority["p99LinearLuminanceRangeByFamily"][family]
    p99_pass = float(p99_range[0]) <= p99 <= float(p99_range[1])
    black_bin_pass = four_bit_black_bin_fraction <= float(authority["fourBitBlackBinFractionMaximumByFamily"][family])
    magenta_pass = magenta_count <= int(authority["magentaLikePixelCountMaximum"])
    bright_neutral_fraction_pass = bright_neutral_fraction <= float(authority["brightNeutralPixelFractionMaximum"])
    bright_neutral_component_pass = largest_bright_neutral_fraction <= float(authority["largestBrightNeutralConnectedAreaFractionMaximum"])
    environment_maximum_pass = context != "environment-isolation" or maximum_luminance <= float(authority["environmentMaximumLinearLuminance"])
    no_bright_white_panels = bright_neutral_fraction_pass and bright_neutral_component_pass
    passed = mean_pass and p90_pass and p99_pass and black_bin_pass and magenta_pass and no_bright_white_panels and environment_maximum_pass
    return {
        "status": "PASS" if passed else "FAIL",
        "authority": authority,
        "family": family,
        "context": context,
        "resolution": [width, height],
        "meanLinearLuminance": round(mean, 8),
        "p90LinearLuminance": round(p90, 8),
        "practicalLightP99LinearLuminance": round(p99, 8),
        "familyP99LinearLuminanceRange": p99_range,
        "brightestLinearLuminance": round(maximum_luminance, 8),
        "brightestPixelNormalizedXY": [round(maximum_location[0] / max(1, width - 1), 8), round(maximum_location[1] / max(1, height - 1), 8)],
        "fourBitBlackBinPixelCount": four_bit_black_bin_count,
        "fourBitBlackBinFraction": round(four_bit_black_bin_fraction, 10),
        "dominantQuantizedPalette": dominant,
        "magentaLikePixelCount": magenta_count,
        "magentaLikePixelFraction": round(magenta_count / pixel_count, 10),
        "brightNeutralPixelCount": bright_neutral_count,
        "brightNeutralPixelFraction": round(bright_neutral_fraction, 10),
        "largestBrightNeutralConnectedAreaPixels": largest_component,
        "largestBrightNeutralConnectedAreaFraction": round(largest_bright_neutral_fraction, 10),
        "dominantDarkPalettePasses": mean_pass and p90_pass and p99_pass and black_bin_pass,
        "magentaAbsentPasses": magenta_pass,
        "noBrightWhiteFactoryPanelPasses": no_bright_white_panels,
        "environmentMaximumLuminancePasses": environment_maximum_pass,
        "passes": {"meanLowerAndUpperBound": mean_pass, "p90LowerAndUpperBound": p90_pass, "p99LowerAndUpperBound": p99_pass, "fourBitBlackBinFraction": black_bin_pass, "magentaAbsent": magenta_pass, "brightNeutralPixelFraction": bright_neutral_fraction_pass, "brightNeutralConnectedComponent": bright_neutral_component_pass, "environmentMaximumLuminance": environment_maximum_pass},
        "thresholds": authority,
    }


def f355_screen_projection_authority(width: int, height: int) -> dict[str, Any]:
    authority = cfg.F355_OUTSIDE_SCREEN_PIXEL_AUTHORITY
    scene = bpy.context.scene
    camera = bpy.data.objects.get(cfg.CAMERAS[authority["family"]])
    if camera is None or camera.type != "CAMERA":
        raise RuntimeError("F355 outside-screen audit lacks the exact authored desktop camera")
    scene.camera = camera
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = 1.0
    scene.render.pixel_aspect_y = 1.0
    scene.frame_set(int(authority["frame"]))
    bpy.context.view_layer.update()
    objects_by_name: dict[str, bpy.types.Object] = {}
    for collection_name in ("REFINED_CRT_ASSEMBLY", "PHASE3R_CRT_SCREEN_REPAIR"):
        collection = bpy.data.collections.get(collection_name)
        if collection is None:
            continue
        for obj in collection.all_objects:
            if obj.type in {"MESH", "CURVE", "SURFACE", "META", "FONT"} and any(token in obj.name.lower() for token in ("phosphor", "screenglass", "screen_glass")):
                objects_by_name[obj.name] = obj
    q_plane = bpy.data.objects.get("Phase4R1V2_ExactQuantumQ_PicturePlane")
    if q_plane is not None:
        objects_by_name[q_plane.name] = q_plane
    depsgraph = bpy.context.evaluated_depsgraph_get()
    world_points: list[Vector] = []
    vertex_counts: dict[str, int] = {}
    for name, obj in sorted(objects_by_name.items()):
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            points = [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
        finally:
            evaluated.to_mesh_clear()
        if not points:
            points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        vertex_counts[name] = len(points)
        world_points.extend(points)
    if not world_points:
        raise RuntimeError("F355 outside-screen audit found no evaluated screen geometry")
    projected = [world_to_camera_view(scene, camera, point) for point in world_points]
    ndc = {
        "x": [min(float(point.x) for point in projected), max(float(point.x) for point in projected)],
        "y": [min(float(point.y) for point in projected), max(float(point.y) for point in projected)],
        "z": [min(float(point.z) for point in projected), max(float(point.z) for point in projected)],
    }
    padding = int(authority["screenMaskPaddingPixels"])
    pixel_bounds = {
        "minX": max(0, math.floor(ndc["x"][0] * width) - padding),
        "maxX": min(width - 1, math.ceil(ndc["x"][1] * width) + padding),
        "minY": max(0, math.floor((1.0 - ndc["y"][1]) * height) - padding),
        "maxY": min(height - 1, math.ceil((1.0 - ndc["y"][0]) * height) + padding),
    }
    evidence = {
        "family": authority["family"],
        "frame": authority["frame"],
        "camera": camera.name,
        "resolution": [width, height],
        "screenObjects": sorted(objects_by_name),
        "evaluatedVertexCounts": vertex_counts,
        "ndcBounds": {axis: [round(value, 9) for value in values] for axis, values in ndc.items()},
        "pixelBoundsWithPadding": pixel_bounds,
        "screenMaskPaddingPixels": padding,
    }
    evidence["passes"] = (
        ndc["z"][0] > 0.0
        and pixel_bounds["minX"] < pixel_bounds["maxX"]
        and pixel_bounds["minY"] < pixel_bounds["maxY"]
        and pixel_bounds["minX"] > 0
        and pixel_bounds["maxX"] < width - 1
        and pixel_bounds["minY"] > 0
        and pixel_bounds["maxY"] < height - 1
    )
    if not evidence["passes"]:
        raise RuntimeError({"message": "F355 screen projection is not a finite interior mask", "projection": evidence})
    return evidence


def f355_outside_screen_no_pool_metrics(path: Path, projection: dict[str, Any]) -> dict[str, Any]:
    width, height, rgb = read_png_rgb(path)
    if projection["resolution"] != [width, height] or projection["passes"] is not True:
        raise RuntimeError("F355 screen-mask projection does not bind the rendered PNG dimensions")
    authority = cfg.F355_OUTSIDE_SCREEN_PIXEL_AUTHORITY
    bounds = projection["pixelBoundsWithPadding"]
    pixel_count = width * height
    outside_count = 0
    high_luminance_count = 0
    bright_neutral_mask = bytearray(pixel_count)
    for pixel in range(pixel_count):
        x, y = pixel % width, pixel // width
        if bounds["minX"] <= x <= bounds["maxX"] and bounds["minY"] <= y <= bounds["maxY"]:
            continue
        outside_count += 1
        offset = pixel * 3
        red, green, blue = rgb[offset], rgb[offset + 1], rgb[offset + 2]
        luminance = linear_luminance(red, green, blue)
        if luminance >= float(authority["outsideScreenHighLuminanceThreshold"]):
            high_luminance_count += 1
        if luminance >= float(authority["brightNeutralMinimumLinearLuminance"]) and max(red, green, blue) - min(red, green, blue) <= int(authority["neutralMaximumChannelSpread8Bit"]):
            bright_neutral_mask[pixel] = 1
    minimum_component = max(8, pixel_count // 250000)
    components = connected_components(bytearray(bright_neutral_mask), width, height, minimum_component)
    largest = components[0] if components else None
    largest_area_fraction = 0.0 if largest is None else largest["pixels"] / pixel_count
    largest_width_fraction = 0.0 if largest is None else (largest["maxX"] - largest["minX"] + 1) / width
    largest_height_fraction = 0.0 if largest is None else (largest["maxY"] - largest["minY"] + 1) / height
    significant_minimum_pixels = math.ceil(pixel_count * float(authority["significantPoolAreaFractionMinimum"]))
    significant = [component for component in components if component["pixels"] >= significant_minimum_pixels]
    left_pools = [component for component in significant if component["maxX"] < bounds["minX"]]
    right_pools = [component for component in significant if component["minX"] > bounds["maxX"]]
    both_screen_sides = bool(left_pools and right_pools)
    high_luminance_fraction = 0.0 if outside_count == 0 else high_luminance_count / outside_count
    pool_size_pass = (
        largest_area_fraction <= float(authority["largestComponentAreaFractionMaximum"])
        and largest_width_fraction <= float(authority["largestComponentWidthFractionMaximum"])
        and largest_height_fraction <= float(authority["largestComponentHeightFractionMaximum"])
    )
    both_sides_pass = not both_screen_sides if authority["significantPoolsMayOccupyBothScreenSides"] is False else True
    high_luminance_pass = high_luminance_fraction <= float(authority["outsideScreenHighLuminanceFractionMaximum"])
    passed = outside_count > 0 and pool_size_pass and both_sides_pass and high_luminance_pass
    return {
        "status": "PASS" if passed else "FAIL",
        "authority": authority,
        "file": path.name,
        "resolution": [width, height],
        "screenProjection": projection,
        "outsideScreenPixelCount": outside_count,
        "brightNeutralOutsideScreenPixelCount": sum(bright_neutral_mask),
        "outsideScreenHighLuminancePixelCount": high_luminance_count,
        "outsideScreenHighLuminanceFraction": round(high_luminance_fraction, 10),
        "connectedBrightNeutralComponents": components,
        "largestComponentAreaFraction": round(largest_area_fraction, 10),
        "largestComponentWidthFraction": round(largest_width_fraction, 10),
        "largestComponentHeightFraction": round(largest_height_fraction, 10),
        "significantPoolMinimumPixels": significant_minimum_pixels,
        "significantPools": significant,
        "significantLeftPoolCount": len(left_pools),
        "significantRightPoolCount": len(right_pools),
        "significantPoolsOccupyBothScreenSides": both_screen_sides,
        "passes": {"outsideRegionNonEmpty": outside_count > 0, "noOversizedNeutralPool": pool_size_pass, "noSignificantPoolsOnBothScreenSides": both_sides_pass, "outsideScreenHighLuminanceBounded": high_luminance_pass},
    }


def current_pixel_metrics(path: Path) -> dict[str, Any]:
    width, height, rgb = read_png_rgb(path)
    pixel_count = width * height
    luminance_histogram = [0] * 2049
    maximum_luminance = 0.0
    magenta_count = 0
    for offset in range(0, len(rgb), 3):
        red, green, blue = rgb[offset], rgb[offset + 1], rgb[offset + 2]
        luminance = linear_luminance(red, green, blue)
        maximum_luminance = max(maximum_luminance, luminance)
        if red >= 26 and blue >= 20 and green * 100 < min(red, blue) * 65:
            magenta_count += 1
    threshold = max(0.008, maximum_luminance * 0.06)
    mask = bytearray(pixel_count)
    active_pixels = 0
    for pixel in range(pixel_count):
        offset = pixel * 3
        luminance = linear_luminance(rgb[offset], rgb[offset + 1], rgb[offset + 2])
        if luminance >= threshold:
            mask[pixel] = 1
            active_pixels += 1
            luminance_histogram[min(2048, round(luminance * 2048))] += 1
    raw_mask = bytearray(mask)
    raw_bounds = mask_bounds(raw_mask, width, height)
    minimum_component = max(6, pixel_count // 250000)
    components = connected_components(bytearray(mask), width, height, minimum_component)
    retained_component_pixels = sum(component["pixels"] for component in components)
    dominant_component_fraction = 0.0 if active_pixels == 0 or not components else components[0]["pixels"] / active_pixels
    dominant_component_bounds = None if not components else components[0]
    raw_boundary_clearance = boundary_clearance(raw_bounds, width, height)
    retained_boundary_clearance = boundary_clearance(dominant_component_bounds, width, height)
    trail_luminance = histogram_quantile(luminance_histogram, 0.50)
    lower_trail = histogram_quantile(luminance_histogram, 0.30)
    front_luminance = histogram_quantile(luminance_histogram, 0.98)
    seam_uniformity = 0.0 if trail_luminance <= 1e-12 else lower_trail / trail_luminance
    front_to_trail = 0.0 if trail_luminance <= 1e-12 else front_luminance / trail_luminance
    interval_count = len(components)
    authority = cfg.CURRENT_ISOLATION_PIXEL_AUTHORITY
    minimum_boundary = int(authority["minimumPixelBoundaryClearance"])
    boundary_pass = raw_boundary_clearance is not None and retained_boundary_clearance is not None and raw_boundary_clearance >= minimum_boundary and retained_boundary_clearance >= minimum_boundary
    contrast_pass = float(authority["frontToTrailContrastMinimum"]) <= front_to_trail <= float(authority["frontToTrailContrastMaximum"])
    passed = (
        active_pixels > 0
        and interval_count == 1
        and dominant_component_fraction >= float(authority["dominantComponentFractionMinimum"])
        and seam_uniformity >= float(authority["seamUniformityRatioMinimum"])
        and contrast_pass
        and magenta_count > 0
        and boundary_pass
    )
    return {
        "status": "PASS" if passed else "FAIL",
        "resolution": [width, height],
        "analysisView": "orthographic full-route emission-only top-surface render",
        "activePixelThresholdLinearLuminance": round(threshold, 8),
        "activePixelCount": active_pixels,
        "retainedConnectedComponentPixelCount": retained_component_pixels,
        "magentaLikePixelCount": magenta_count,
        "activeEnergizedIntervalCount": interval_count,
        "connectedComponents": components,
        "allActivePixelBounds": raw_bounds,
        "dominantConnectedComponentBounds": dominant_component_bounds,
        "allActivePixelBoundaryClearance": raw_boundary_clearance,
        "dominantComponentBoundaryClearance": retained_boundary_clearance,
        "dominantConnectedComponentFraction": round(dominant_component_fraction, 8),
        "trailMedianLinearLuminance": round(trail_luminance, 8),
        "trailLowerLinearLuminance": round(lower_trail, 8),
        "frontP98LinearLuminance": round(front_luminance, 8),
        "seamUniformityLowerToMedianRatio": round(seam_uniformity, 8),
        "frontToTrailContrastRatio": round(front_to_trail, 8),
        "passes": {"nonEmpty": active_pixels > 0, "oneContinuousInterval": interval_count == 1, "dominantComponent": dominant_component_fraction >= float(authority["dominantComponentFractionMinimum"]), "seamUniformity": seam_uniformity >= float(authority["seamUniformityRatioMinimum"]), "frontBrighterThanTrail": contrast_pass, "frontToTrailContrastBounded": contrast_pass, "magentaCurrentPresent": magenta_count > 0, "rawAndDominantComponentBoundaryInset": boundary_pass},
        "thresholds": {"expectedActiveEnergizedIntervalCount": 1, **authority},
    }


def base_role_audit(role: str, source_audits: dict[str, dict[str, Any]], source_authorities: dict[str, Any], producers: dict[str, Any], sparse_evidence: dict[str, Any], passed: bool) -> dict[str, Any]:
    return {
        "schema": f"quantum-hub.phase-4-r1.refined-proving-hall.{role}.v2",
        "status": "PASS" if passed else "FAIL",
        "generatedAt": cfg.GENERATED_AT,
        "sourceAuthorities": source_authorities,
        "producerAuthorities": producers,
        "audit": source_audits[role]["audit"],
        "freshSparseEvidence": sparse_evidence,
        "reusedRecoveredOldVisualEvidence": False,
        **report_authorization(),
    }


def build_role_audits(
    root: Path,
    source_audits: dict[str, dict[str, Any]],
    source_authorities: dict[str, Any],
    producers: dict[str, Any],
    metadata: dict[str, dict[str, Any]],
    palette_metrics: dict[str, Any],
    current_metrics: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    sheet_records = {
        role: output_record(root, root / f"{role}.png", metadata[f"{role}.png"])
        for role in SHEET_ROLES
    }
    sparse_evidence = {
        "central-floor-object-audit": {"sheet": sheet_records["central-floor-object-audit-sheet"], "visualInspectionDeferredToNativeAudit": True},
        "palette-audit": {"sheet": sheet_records["dark-dormant-factory-sheet"], "pixelAudit": palette_metrics},
        "cable-geometry-audit": {"wideToTightSheet": sheet_records["wide-to-tight-cable-sheet"], "originSheet": sheet_records["cable-origin-sheet"], "rearConnectionSheet": sheet_records["simple-rear-connection-closeup"], "visualInspectionDeferredToNativeAudit": True},
        "current-continuity-audit": {"sheet": sheet_records["continuous-current-sheet"], "pixelAudit": current_metrics},
        "camera-audit": {"sheet": sheet_records["camera-path-evidence-sheet"], "visualInspectionDeferredToNativeAudit": True},
        "exact-q-fidelity-audit": {"exactQProvenance": source_authorities["exactQProvenance"], "visualInspectionDeferredToNativeAudit": True},
    }
    reports: dict[str, dict[str, Any]] = {}
    for role in ROLE_TO_AUDIT_KEY:
        pixel_pass = True
        if role == "palette-audit":
            pixel_pass = palette_metrics["status"] == "PASS"
        elif role == "current-continuity-audit":
            pixel_pass = current_metrics["status"] == "PASS"
        passed = source_audits[role]["status"] == "PASS" and pixel_pass
        report = base_role_audit(role, source_audits, source_authorities, producers, sparse_evidence[role], passed)
        target = root / f"phase4r1-{role}.json"
        publish_json_exclusive(target, report)
        metadata[safe_relative_posix(target, root)] = {"role": role}
        reports[role] = report
    return reports


def render_transaction(output_value: str) -> None:
    root = external_root(output_value, require_empty=True)
    lock, lock_identity = acquire_lock(root, "render")
    state: SceneState | None = None
    metadata: dict[str, dict[str, Any]] = {}
    try:
        state = SceneState()
        build, validation, q_provenance, source_authorities, producers, source_audits = verify_sources()
        scene = bpy.context.scene
        engine = choose_eevee_engine(scene)
        normal_paths = render_normal_frames(root, engine, metadata)
        # Restore object visibility before the environment-isolation mutation,
        # because normal-family rendering intentionally changed only collections.
        for name, value in state.object_visibility.items():
            obj = bpy.data.objects.get(name)
            if obj is not None:
                obj.hide_render = value
        environment_path = render_environment_isolation(root, engine, metadata)
        for name, value in state.object_visibility.items():
            obj = bpy.data.objects.get(name)
            if obj is not None:
                obj.hide_render = value
        current_paths, current_framing = render_current_isolations(root, engine, state, metadata)
        state.restore_visibility_and_world()
        detail_paths = render_detail_audit_views(root, engine, state, metadata)

        for role in SHEET_ROLES:
            columns, panels = SHEET_SPECS[role]
            target = root / f"{role}.png"
            publish_bytes_exclusive(target, compose_sheet(role, columns, panels, normal_paths, detail_paths))
            metadata[safe_relative_posix(target, root)] = {
                "role": role,
                "family": panels[0][0],
                "frame": panels[0][1],
                "families": list(dict.fromkeys(family for family, _ in panels)),
                "frames": [frame for _, frame in panels],
            }

        dormant_frames: dict[str, Any] = {}
        for family in ("desktop", "mobile", "landscape"):
            path = normal_paths[(family, 1)]
            dormant_frames[family] = {
                "file": output_record(root, path, metadata[safe_relative_posix(path, root)]),
                "metrics": dormant_pixel_metrics(path, family, "family-dormant"),
            }
        environment_metrics = dormant_pixel_metrics(environment_path, "desktop", "environment-isolation")
        f355_path = normal_paths[(cfg.F355_OUTSIDE_SCREEN_PIXEL_AUTHORITY["family"], int(cfg.F355_OUTSIDE_SCREEN_PIXEL_AUTHORITY["frame"]))]
        f355_width, f355_height = png_dimensions(f355_path)
        f355_projection = f355_screen_projection_authority(f355_width, f355_height)
        f355_no_pool = f355_outside_screen_no_pool_metrics(f355_path, f355_projection)
        palette_pass = all(row["metrics"]["status"] == "PASS" for row in dormant_frames.values()) and environment_metrics["status"] == "PASS" and f355_no_pool["status"] == "PASS"
        palette_metrics = {
            "status": "PASS" if palette_pass else "FAIL",
            "method": "native 8-bit rendered-pixel gates at true dormancy plus desktop F355 outside the evaluated screen projection, all measured in linear-light luminance; no material-value proxy",
            "dormantFamilyFrames": dormant_frames,
            "nonCrtNonCurrentEnvironment": {"file": output_record(root, environment_path, metadata[safe_relative_posix(environment_path, root)]), "metrics": environment_metrics},
            "desktopF355OutsideScreenNoPool": {"file": output_record(root, f355_path, metadata[safe_relative_posix(f355_path, root)]), "metrics": f355_no_pool},
            "magentaAbsentAtTrueDormancy": all(row["metrics"]["magentaLikePixelCount"] == 0 for row in dormant_frames.values()),
            "noBrightWhiteFactoryPanels": environment_metrics["noBrightWhiteFactoryPanelPasses"],
            "f355OutsideScreenNoPoolPasses": f355_no_pool["status"] == "PASS",
        }

        current_rows: dict[str, Any] = {}
        for family in ("desktop", "mobile", "landscape"):
            current_rows[family] = {}
            for frame in CURRENT_ISOLATION_FRAMES[family]:
                path = current_paths[(family, frame)]
                current_rows[family][f"F{frame:03d}"] = {
                    "file": output_record(root, path, metadata[safe_relative_posix(path, root)]),
                    "metrics": current_pixel_metrics(path),
                }
        all_current_metrics = [row["metrics"] for family_rows in current_rows.values() for row in family_rows.values()]
        current_pass = bool(all_current_metrics) and all(row["status"] == "PASS" for row in all_current_metrics)
        current_metrics = {
            "status": "PASS" if current_pass else "FAIL",
            "method": "fresh Eevee evaluated-geometry VERTICAL-fit orthographic emission-only analysis with fail-closed NDC/pixel boundary, connected-component, seam-uniformity, and bounded front-to-trail contrast gates",
            "evaluatedGeometryVerticalFit": current_framing,
            "families": current_rows,
            "allActiveFramesHaveExactlyOneEnergizedInterval": all(row["activeEnergizedIntervalCount"] == 1 for row in all_current_metrics),
            "allFramesPassSeamUniformity": all(row["passes"]["seamUniformity"] for row in all_current_metrics),
            "allFramesPassFrontToTrailContrast": all(row["passes"]["frontBrighterThanTrail"] for row in all_current_metrics),
            "allFramesPassRawAndDominantBoundaryInset": all(row["passes"]["rawAndDominantComponentBoundaryInset"] for row in all_current_metrics),
        }

        role_reports = build_role_audits(root, source_audits, source_authorities, producers, metadata, palette_metrics, current_metrics)
        staged_records = [
            output_record(root, root / relative, entry)
            for relative, entry in sorted(metadata.items())
        ]
        if len({record["role"] for record in staged_records}) != len(staged_records):
            raise RuntimeError("every staged sparse artifact must have a globally unique role")
        staged_paths = {record["path"] for record in staged_records}
        actual_staged_paths = {
            safe_relative_posix(path, root)
            for path in root.rglob("*")
            if path.is_file() and path != lock
        }
        if actual_staged_paths != staged_paths:
            raise RuntimeError(f"sparse render-stage inventory mismatch: missing={sorted(staged_paths - actual_staged_paths)}, unexpected={sorted(actual_staged_paths - staged_paths)}")
        failed_roles = sorted(role for role, report in role_reports.items() if report["status"] != "PASS")
        stage_status = "PASS" if not failed_roles else "FAIL"
        sheet_authorities = {
            record["role"]: {key: record[key] for key in ("role", "path", "bytes", "sha256", "width", "height", "mediaType", "family", "frame")}
            for record in staged_records
            if record["role"] in SHEET_ROLES
        }
        native_contract = {
            "schema": NATIVE_AUDIT_SCHEMA,
            "requiredStatusAfterInspection": "PASS",
            "requiredGeneratedAt": cfg.GENERATED_AT,
            "requiredAssertions": {
                "inspectionPerformed": True,
                "inspectionMethod": "native-render-inspection",
                "nativeDimensionsInspected": True,
                "technicalReviewOnly": True,
                "humanReviewDecision": "PENDING",
                "reusedRecoveredOldVisualEvidence": False,
            },
            "inspectedSheetsMustEqual": sheet_authorities,
            "requiredFindingRoles": list(SHEET_ROLES),
            "eachFindingMustContain": {"status": "PASS", "notes": "a non-empty observation written after native inspection"},
            "sourceAuthoritiesMustEqual": source_authorities,
            "producerAuthoritiesMustEqual": producers,
            "authorizationMustEqual": dict(cfg.AUTHORIZATION),
        }
        stage_report = {
            "schema": STAGE_SCHEMA,
            "status": stage_status,
            "generatedAt": cfg.GENERATED_AT,
            "renderEngine": engine,
            "renderSettings": {"normalFamilyResolutions": {family: list(cfg.PREVIEW_RESOLUTIONS[family]) for family in ("desktop", "mobile", "landscape")}, "currentIsolationResolution": list(cfg.PREVIEW_RESOLUTIONS["desktop"]), "contactSheetResolution": list(cfg.PREVIEW_RESOLUTIONS["desktop"]), "resolutionPercentage": 100, "pixelAspect": [1.0, 1.0], "imageFormat": "PNG/RGB/8", "viewTransform": cfg.HALL_VISUAL_AUTHORITY["viewTransform"], "look": cfg.HALL_VISUAL_AUTHORITY["look"], "exposureStops": cfg.HALL_VISUAL_AUTHORITY["exposureStops"], "globalVisualAuthority": cfg.HALL_VISUAL_AUTHORITY, "motionBlur": False},
            "sourceAuthorities": source_authorities,
            "producerAuthorities": producers,
            "audits": {ROLE_TO_AUDIT_KEY[role]: source_audits[role]["audit"] for role in ROLE_TO_AUDIT_KEY},
            "pixelAudits": {"palette": palette_metrics, "current": current_metrics},
            "requiredSheetRoles": list(SHEET_ROLES),
            "failedAuditRoles": failed_roles,
            "files": staged_records,
            "nativeVisualAuditRequiredBeforeManifest": True,
            "nativeVisualAuditContract": native_contract,
            "externalOutputAbsolutePathStored": False,
            "reusedRecoveredOldVisualEvidence": False,
            **report_authorization(),
        }
        publish_json_exclusive(root / STAGE_REPORT_NAME, stage_report)
        print(f"QH_PHASE4R1_REFINED_SPARSE_STAGE_STATUS={stage_status}")
        print(f"QH_PHASE4R1_REFINED_SPARSE_STAGE_REPORT={root / STAGE_REPORT_NAME}")
        print("QH_PHASE4R1_REFINED_SPARSE_MANIFEST_EMITTED=FALSE")
        print("QH_PHASE4R1_REFINED_NATIVE_VISUAL_AUDIT_REQUIRED=TRUE")
        if stage_status != "PASS":
            raise RuntimeError(f"sparse render/pixel stage failed closed: {failed_roles}")
    finally:
        try:
            if state is not None:
                state.restore()
        finally:
            release_owned_lock(lock, lock_identity)


def exact_base_record(record: dict[str, Any]) -> dict[str, Any]:
    return {key: record[key] for key in ("role", "path", "bytes", "sha256", "width", "height", "mediaType", "family", "frame")}


def verify_stage_files(root: Path, stage: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    if stage.get("schema") != STAGE_SCHEMA or stage.get("status") != "PASS":
        raise RuntimeError("finalize requires a PASS sparse render-stage report")
    validate_authorization(stage.get("authorization", {}), "sparse render stage")
    records = stage.get("files")
    if not isinstance(records, list):
        raise RuntimeError("sparse render stage has no file inventory")
    by_path: dict[str, dict[str, Any]] = {}
    sheets: dict[str, dict[str, Any]] = {}
    for record in records:
        if not isinstance(record, dict) or any(key not in record for key in ("role", "path", "bytes", "sha256", "width", "height", "mediaType")):
            raise RuntimeError("malformed staged file record")
        relative = record["path"]
        if not isinstance(relative, str) or relative in by_path:
            raise RuntimeError("duplicate or non-string staged path")
        path = root / Path(relative)
        if safe_relative_posix(path, root) != relative or not path.is_file():
            raise RuntimeError(f"missing or unsafe staged evidence: {relative}")
        actual = output_record(root, path, record)
        if actual != record:
            raise RuntimeError(f"staged evidence hash/dimensions changed: {relative}")
        by_path[relative] = record
        if record["role"] in SHEET_ROLES:
            if record["role"] in sheets:
                raise RuntimeError(f"duplicate sheet role: {record['role']}")
            sheets[record["role"]] = exact_base_record(record)
    if set(sheets) != set(SHEET_ROLES):
        raise RuntimeError(f"stage sheet roles differ: {sorted(sheets)}")
    actual_before_native = {
        safe_relative_posix(path, root)
        for path in root.rglob("*")
        if path.is_file() and not path.name.startswith(".phase4r1-sparse-finalize.lock")
    }
    expected_before_native = set(by_path) | {STAGE_REPORT_NAME}
    if (root / NATIVE_AUDIT_NAME).is_file():
        expected_before_native.add(NATIVE_AUDIT_NAME)
    if actual_before_native != expected_before_native:
        raise RuntimeError(f"unexpected, missing, or reused file in sparse stage: missing={sorted(expected_before_native - actual_before_native)}, unexpected={sorted(actual_before_native - expected_before_native)}")
    return by_path, sheets


def validate_native_audit(native: dict[str, Any], stage: dict[str, Any], sheets: dict[str, dict[str, Any]]) -> None:
    if native.get("schema") != NATIVE_AUDIT_SCHEMA or native.get("status") != "PASS":
        raise RuntimeError("native visual audit must be PASS with the exact v2 schema")
    if native.get("generatedAt") != cfg.GENERATED_AT:
        raise RuntimeError("native visual audit generatedAt differs from deterministic authority")
    if native.get("inspectionPerformed") is not True or native.get("inspectionMethod") != "native-render-inspection" or native.get("nativeDimensionsInspected") is not True:
        raise RuntimeError("native visual audit does not assert native-render inspection")
    if native.get("technicalReviewOnly") is not True or native.get("humanReviewDecision") != "PENDING":
        raise RuntimeError("native audit must remain technical-only with human review PENDING")
    if native.get("sourceAuthorities") != stage.get("sourceAuthorities") or native.get("producerAuthorities") != stage.get("producerAuthorities"):
        raise RuntimeError("native audit source/producer authorities differ from render stage")
    if native.get("inspectedSheets") != sheets:
        raise RuntimeError("native audit did not inspect the exact nine sheet byte authorities")
    findings = native.get("findings")
    if not isinstance(findings, dict) or set(findings) != set(SHEET_ROLES):
        raise RuntimeError("native audit findings must cover exactly the nine sheet roles")
    for role, finding in findings.items():
        if not isinstance(finding, dict) or finding.get("status") != "PASS" or not isinstance(finding.get("notes"), str) or not finding["notes"].strip():
            raise RuntimeError(f"native audit finding is not a substantiated PASS: {role}")
    if native.get("reusedRecoveredOldVisualEvidence") is not False:
        raise RuntimeError("native audit may not reuse recovered old visual evidence")
    validate_authorization(native.get("authorization", {}), "native visual audit")
    for key in AUTHORIZATION_KEYS:
        if native.get(key) is not cfg.AUTHORIZATION[key]:
            raise RuntimeError(f"native audit top-level authorization differs: {key}")
    reject_private_paths(native, "native visual audit")
    reject_retired_authority_keys(native, "native visual audit")


def finalize_transaction(output_value: str, native_audit_value: str) -> None:
    root = external_root(output_value, require_empty=False)
    if (root / SPARSE_MANIFEST_NAME).exists():
        raise RuntimeError("refusing to overwrite an existing sparse proof manifest")
    lock, lock_identity = acquire_lock(root, "finalize")
    try:
        build, validation, q_provenance, source_authorities, producers, source_audits = verify_sources()
        stage_path = root / STAGE_REPORT_NAME
        if not stage_path.is_file():
            raise RuntimeError("missing sparse render-stage report")
        stage = read_json(stage_path)
        if stage.get("sourceAuthorities") != source_authorities or stage.get("producerAuthorities") != producers:
            raise RuntimeError("sparse render stage is stale against current source authorities")
        by_path, sheets = verify_stage_files(root, stage)
        native_input = Path(native_audit_value).resolve()
        if not native_input.is_file() or native_input == (root / NATIVE_AUDIT_NAME).resolve() or root in native_input.parents:
            raise RuntimeError("--native-audit must be an external JSON file, not a staged output path")
        native = read_json(native_input)
        validate_native_audit(native, stage, sheets)
        native_target = root / NATIVE_AUDIT_NAME
        if native_target.exists():
            if native_target.stat().st_size != native_input.stat().st_size or sha256(native_target) != sha256(native_input):
                raise RuntimeError("refusing to replace an existing different native visual audit")
        else:
            publish_file_exclusive(native_input, native_target)

        metadata: dict[str, dict[str, Any]] = {relative: dict(record) for relative, record in by_path.items()}
        metadata[STAGE_REPORT_NAME] = {"role": "sparse-render-stage-report"}
        metadata[NATIVE_AUDIT_NAME] = {"role": "native-visual-audit"}
        actual_paths = sorted(
            safe_relative_posix(path, root)
            for path in root.rglob("*")
            if path.is_file() and path.name != ".phase4r1-sparse-finalize.lock" and path.name != SPARSE_MANIFEST_NAME
        )
        expected_paths = sorted(metadata)
        if actual_paths != expected_paths:
            raise RuntimeError(f"final sparse inventory is not exhaustive: missing={sorted(set(expected_paths) - set(actual_paths))}, unexpected={sorted(set(actual_paths) - set(expected_paths))}")
        files = [output_record(root, root / relative, metadata[relative]) for relative in actual_paths]
        if len({record["path"] for record in files}) != len(files):
            raise RuntimeError("duplicate file path in final sparse inventory")
        if len({record["role"] for record in files}) != len(files):
            raise RuntimeError("duplicate role in final sparse inventory")
        if sum(record["role"] in SHEET_ROLES for record in files) != len(SHEET_ROLES):
            raise RuntimeError("final sparse inventory does not contain exactly nine sheet roles")
        if {record["role"] for record in files if record["role"] in ROLE_TO_AUDIT_KEY} != set(ROLE_TO_AUDIT_KEY):
            raise RuntimeError("final sparse inventory does not contain all six audit JSON roles")
        audit_reports = {
            role: read_json(root / f"phase4r1-{role}.json")
            for role in ROLE_TO_AUDIT_KEY
        }
        if any(report.get("schema") != f"quantum-hub.phase-4-r1.refined-proving-hall.{role}.v2" or report.get("status") != "PASS" for role, report in audit_reports.items()):
            raise RuntimeError("one or more sparse role audits are not PASS v2")
        manifest = {
            "schema": MANIFEST_SCHEMA,
            "status": "PASS",
            "generatedAt": cfg.GENERATED_AT,
            "audits": {ROLE_TO_AUDIT_KEY[role]: source_audits[role]["audit"] for role in ROLE_TO_AUDIT_KEY},
            "sparseVisualAudits": {ROLE_TO_AUDIT_KEY[role]: audit_reports[role]["freshSparseEvidence"] for role in ROLE_TO_AUDIT_KEY},
            "sourceAuthorities": source_authorities,
            "producerAuthorities": producers,
            "nativeVisualAudit": output_record(root, native_target, metadata[NATIVE_AUDIT_NAME]),
            "nativeTechnicalVisualAuditStatus": "PASS",
            "humanReviewStatus": "PENDING",
            "manifestSelfExcludedFromFiles": True,
            "files": files,
            "fileCountExcludingManifest": len(files),
            "externalOutputAbsolutePathStored": False,
            "reusedRecoveredOldVisualEvidence": False,
            **report_authorization(),
        }
        manifest_path = root / SPARSE_MANIFEST_NAME
        publish_json_exclusive(manifest_path, manifest)
        listed = {record["path"] for record in files}
        actual_after = {safe_relative_posix(path, root) for path in root.rglob("*") if path.is_file() and path.name != ".phase4r1-sparse-finalize.lock"}
        if actual_after != listed | {SPARSE_MANIFEST_NAME}:
            raise RuntimeError("post-publication sparse inventory violates sole manifest self-exclusion")
        print(f"QH_PHASE4R1_REFINED_SPARSE_MANIFEST={manifest_path}")
        print("QH_PHASE4R1_REFINED_SPARSE_STATUS=PASS")
        print("QH_PHASE4R1_REFINED_HUMAN_REVIEW_STATUS=PENDING")
    finally:
        release_owned_lock(lock, lock_identity)


def main() -> None:
    args = parse_args()
    if args["mode"] == "render":
        render_transaction(str(args["output"]))
    else:
        finalize_transaction(str(args["output"]), str(args["native_audit"]))


if __name__ == "__main__":
    main()
