"""Compact Phase 3-R delivery and human-review packager.

The two 270-frame production PNG sequences are consumed from explicit paths
outside Git.  The script writes only the four selected delivery candidates,
compact review evidence, and a portable outside-Git ZIP.  It deliberately
reuses the accepted Phase 3 packager's media/probe/compositor primitives while
binding every Phase 3-R input to the repaired derivative, source-build report,
source-validation report, and historical Phase 3 before-frame hashes.

Expected raw names are ``phase3r-desktop-%04d.png`` and
``phase3r-mobile-%04d.png`` for frames 1..270.  Each root must also contain the
production render report written by ``render_phase3r_frames.py``.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any, Sequence

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover - environment guidance
    raise SystemExit("Pillow is required to package Phase 3-R review evidence.") from exc

# Keep the proven Phase 3 encoding, probing, typography, image-difference, and
# deterministic-ZIP implementation as one authority instead of forking it.
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
import package_phase3_media as base  # noqa: E402
import phase3r_config as cfg  # noqa: E402


FPS = 30
FRAME_START = 1
FRAME_END = 270
FRAME_COUNT = 270
DURATION_SECONDS = 9.0
GOP = 12
DESKTOP_SIZE = (1920, 1080)
MOBILE_SIZE = (720, 1280)
DESKTOP_REVIEW_SIZE = (1280, 720)
MOBILE_REVERSE_SIZE = (360, 640)
MAX_REVIEW_ZIP_BYTES = 64 * 1024 * 1024

REPAIR_PARENT = "ae6cd4c0c664a275c077bd37207efde01e9caa29"
ACCEPTED_PHASE0_SHA256 = (
    "3027c4c46e2b829fd97ee9a3a47558e43adda47abcc488420faa0f087bd720a7"
)
ACCEPTED_PHASE3_SHA256 = (
    "bbde82220f500c6f047c2e2d33a8580c08a40e65800615dd7256bebc2f4472ba"
)
PHASE2B_ENTRY_SHA256 = (
    "a3a1d38a88771d31c03839c82cf5f9e6163057925ed7f5cbe5dc5cdc70bce2bd"
)

ACCEPTED_PHASE0_RELATIVE = Path(
    "artifacts/original/phase-0-4-crt-television/source/quantum-signal-television-v1.blend"
)
ACCEPTED_PHASE3_RELATIVE = Path(
    "artifacts/original/phase-3-crt-opening/source/quantum-signal-television-phase3-opening.blend"
)
PHASE3R_DERIVATIVE_RELATIVE = Path(
    "artifacts/original/phase-3-crt-opening/source/"
    "quantum-signal-television-phase3-r-crt-authenticity.blend"
)
SOURCE_BUILD_RELATIVE = Path(
    "artifacts/original/phase-3-crt-opening/manifests/phase-3-r-source-build.json"
)
SOURCE_VALIDATION_RELATIVE = Path(
    "artifacts/original/phase-3-crt-opening/manifests/phase-3-r-source-validation.json"
)
OLD_POST_PRODUCTION_RELATIVE = Path(
    "artifacts/original/phase-3-crt-opening/manifests/phase-3-post-production-manifest.json"
)
PHASE2B_ENTRY_RELATIVE = Path(
    "artifacts/evidence/phase-2b/review/phase-2b-desktop-production-keyframes.png"
)

FULL_RESOLUTION_FRAMES = (121, 126, 132, 144, 154, 162, 182, 196, 218, 250, 262, 270)
STARTUP_FRAMES = (116, 121, 126, 136, 144, 154, 162, 182, 196)
BEFORE_AFTER_FRAMES = (126, 144, 196, 250, 270)
HANDOFF_FRAMES = (250, 262, 270)
CODEC_RISK_FRAMES = (126, 144, 196, 250, 270)

SCRUB_SEGMENTS: tuple[tuple[str, tuple[int, ...]], ...] = (
    ("NEARBY SEEKS", (121, 126, 132, 136, 144, 154, 162)),
    ("DETERMINISTIC RANDOM SEEKS", (1, 196, 72, 250, 126, 218, 270, 154)),
    ("RAPID ALTERNATING SEEKS", (126, 250, 132, 262, 144, 270, 121, 196)),
    ("PORTAL JUMP", (196, 218, 250, 262, 270)),
    ("REVERSE INTO CRT STARTUP", (196, 182, 162, 154, 144, 136, 132, 126, 121, 116)),
)

RAW_NAME = re.compile(r"^phase3r-(desktop|mobile)-\d{4}\.png$", re.IGNORECASE)

MEDIA_FILENAMES = {
    "desktop-h264": "phase-3-crt-opening-desktop-h264.mp4",
    "desktop-vp9": "phase-3-crt-opening-desktop-vp9.webm",
    "mobile-h264": "phase-3-crt-opening-mobile-h264.mp4",
    "mobile-vp9": "phase-3-crt-opening-mobile-vp9.webm",
}

REVIEW_FILENAMES = {
    "startup": "phase-3-r-crt-startup-contact-sheet.png",
    "beforeAfter": "phase-3-r-crt-before-after-comparison.png",
    "handoff": "phase-3-r-to-phase-2b-handoff-comparison.png",
    "mobile": "phase-3-r-mobile-startup-portal-contact-sheet.png",
    "codec": "phase-3-r-codec-comparison.png",
    "forward": "phase-3-r-desktop-forward-review.mp4",
    "reverse": "phase-3-r-desktop-reverse-review.mp4",
    "scrub": "phase-3-r-desktop-scrub-simulation-review.mp4",
    "mobileReverse": "phase-3-r-mobile-reverse-review.mp4",
    "mediaQa": "phase-3-r-media-qa-report.json",
    "mediaLab": "phase-3-r-media-lab-scrub-evidence.webm",
    "determinism": "phase-3-r-render-determinism-report.json",
    "readme": "README.md",
}

CANDIDATE_AUTHORITY_FILENAME = "phase-3-r-candidate-authority.json"
POST_PRODUCTION_FILENAME = "phase-3-r-post-production-manifest.json"

RETAINED_FROZEN_REVIEW = frozenset(
    {
        "phase-3-desktop-conduction-contact-sheet.png",
        "phase-3-reduced-motion-desktop-1440x900.png",
        "phase-3-reduced-motion-mobile-390x844.png",
        "phase-3-reduced-motion-mobile-320x800.png",
    }
)

TOOL_SOURCE_FILENAMES = (
    "package_phase3r_media.py",
    "package_phase3_media.py",
    "render_phase3r_frames.py",
    "repair_phase3r_crt_authenticity.py",
    "validate_phase3r_source.py",
    "phase3r_config.py",
    "phase3_config.py",
    "verify-phase3r-render-determinism.mjs",
)

DETERMINISM_VERIFIER_RELATIVE = Path("scripts/verify-phase3r-render-determinism.mjs")

QA_ID_TO_CANDIDATE_ID = {
    "desktop-mp4": "desktop-h264",
    "desktop-webm": "desktop-vp9",
    "mobile-mp4": "mobile-h264",
    "mobile-webm": "mobile-vp9",
}


def sha256_file(path: Path) -> str:
    return base.sha256_file(path)


def atomic_json(path: Path, payload: Any) -> None:
    base.atomic_json(path, payload)


def atomic_text(path: Path, content: str) -> None:
    base.atomic_text(path, content)


def frame_path(root: Path, variant: str, frame: int) -> Path:
    return root / f"phase3r-{variant}-{frame:04d}.png"


def normalized_progress(frame: int) -> float:
    return round((frame - FRAME_START) / (FRAME_END - FRAME_START), 6)


def full_resolution_name(frame: int) -> str:
    return (
        f"phase-3-r-desktop-f{frame:03d}-p{normalized_progress(frame):.4f}-"
        "full-resolution.png"
    )


def file_record(path: Path) -> dict[str, Any]:
    return {
        "filename": path.name,
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
    }


def image_record(path: Path) -> dict[str, Any]:
    with Image.open(path) as image:
        return {
            **file_record(path),
            "format": image.format,
            "dimensions": {"width": image.width, "height": image.height},
        }


def python_ast_sha256(path: Path) -> str:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=path.name)
    canonical = ast.dump(
        tree, annotate_fields=True, include_attributes=False, indent=None
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def tool_source_authority(repository: Path) -> dict[str, dict[str, Any]]:
    records: dict[str, dict[str, Any]] = {}
    for filename in TOOL_SOURCE_FILENAMES:
        path = (
            repository / DETERMINISM_VERIFIER_RELATIVE
            if filename == DETERMINISM_VERIFIER_RELATIVE.name
            else SCRIPT_DIR / filename
        )
        if not path.is_file():
            raise FileNotFoundError(f"Missing Phase 3-R protocol source: {path}")
        record = {
            "repositoryRelativePath": path.relative_to(repository).as_posix(),
            **file_record(path),
        }
        if path.suffix.lower() == ".py":
            record["pythonAstSha256"] = python_ast_sha256(path)
        records[filename] = record
    return records


def git_blob_bytes(repository: Path, revision: str, relative: str, label: str) -> bytes:
    relative_path = PurePosixPath(relative)
    if relative_path.is_absolute() or ".." in relative_path.parts or "\\" in relative:
        raise ValueError(f"Unsafe {label} Git path: {relative!r}")
    completed = subprocess.run(
        ["git", "show", f"{revision}:{relative}"],
        cwd=str(repository),
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if completed.returncode != 0:
        raise ValueError(
            f"Cannot read {label} from {revision}:{relative}: "
            f"{completed.stderr.decode('utf-8', errors='replace')[-2000:]}"
        )
    return completed.stdout


def git_tree_footprint(repository: Path, revision: str, relative_root: str) -> dict[str, int]:
    output = base.run(
        ["git", "ls-tree", "-r", "-l", revision, "--", relative_root], cwd=repository
    ).stdout
    count = 0
    total = 0
    for line in output.splitlines():
        metadata, _separator, _path = line.partition("\t")
        parts = metadata.split()
        if len(parts) < 4 or parts[1] != "blob":
            continue
        count += 1
        total += int(parts[3])
    return {"fileCount": count, "bytes": total}


def filesystem_footprint(root: Path) -> dict[str, int]:
    files = [
        path
        for path in root.rglob("*")
        if path.is_file()
        and "__pycache__" not in path.parts
        and path.suffix.lower() not in {".pyc", ".blend1"}
    ]
    return {"fileCount": len(files), "bytes": sum(path.stat().st_size for path in files)}


def atomic_copy(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if source.resolve() == destination.resolve():
        return
    temporary = destination.with_name(f"{destination.stem}.phase3r-tmp{destination.suffix}")
    shutil.copyfile(source, temporary)
    os.replace(temporary, destination)


def verify_recorded_file(path: Path, record: dict[str, Any], label: str) -> dict[str, Any]:
    if not path.is_file():
        raise FileNotFoundError(f"Missing {label}: {path}")
    if path.is_symlink():
        raise ValueError(f"Symlinks are prohibited for {label}: {path}")
    actual = file_record(path)
    if int(record.get("bytes", -1)) != actual["bytes"]:
        raise ValueError(f"{label} byte mismatch: {path}")
    if str(record.get("sha256", "")).lower() != actual["sha256"]:
        raise ValueError(f"{label} SHA-256 mismatch: {path}")
    dimensions = record.get("dimensions")
    if isinstance(dimensions, dict):
        with Image.open(path) as image:
            if image.size != (int(dimensions["width"]), int(dimensions["height"])):
                raise ValueError(f"{label} dimensions mismatch: {path}")
    return actual


def load_json(path: Path, label: str) -> dict[str, Any]:
    if not path.is_file():
        raise FileNotFoundError(f"Missing {label}: {path}")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Invalid {label}: {path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise ValueError(f"{label} must contain a JSON object: {path}")
    return payload


def ensure_pass(payload: dict[str, Any], label: str) -> None:
    if str(payload.get("status", "")).upper() != "PASS":
        raise ValueError(f"{label} is not PASS")


def assert_validation_has_no_failures(validation: dict[str, Any]) -> None:
    """Accept evolving validation layouts but fail on any explicit failure."""
    for key, value in validation.items():
        lowered = str(key).lower()
        normalized_key = re.sub(r"[^a-z0-9]", "", lowered)
        if normalized_key in {
            "failure",
            "failures",
            "failed",
            "failurecount",
            "failedcount",
            "failedchecks",
        }:
            if isinstance(value, bool) and value:
                raise ValueError(f"Source validation explicitly reports {key}={value!r}")
            if isinstance(value, (int, float)) and value != 0:
                raise ValueError(f"Source validation explicitly reports {key}={value!r}")
            if isinstance(value, (list, dict)) and len(value) != 0:
                raise ValueError(f"Source validation explicitly reports non-empty {key}")
            if isinstance(value, str) and value.strip().lower() not in {"", "0", "none", "pass"}:
                raise ValueError(f"Source validation explicitly reports {key}={value!r}")
        if lowered == "status" and isinstance(value, str) and value.strip().upper() in {
            "FAIL",
            "FAILED",
            "ERROR",
        }:
            raise ValueError("Source validation contains a failed/error status")
        if lowered == "pass" and isinstance(value, bool) and not value:
            raise ValueError("Source validation contains pass=false")
        if isinstance(value, dict):
            assert_validation_has_no_failures(value)
        elif isinstance(value, list):
            for nested in value:
                if isinstance(nested, dict):
                    assert_validation_has_no_failures(nested)
                elif isinstance(nested, str) and nested.strip().upper() in {"FAIL", "FAILED"}:
                    raise ValueError("Source validation contains a failed check")


def source_authority(repository: Path) -> dict[str, Any]:
    accepted_phase0 = repository / ACCEPTED_PHASE0_RELATIVE
    accepted_phase3 = repository / ACCEPTED_PHASE3_RELATIVE
    derivative = repository / PHASE3R_DERIVATIVE_RELATIVE
    source_build_path = repository / SOURCE_BUILD_RELATIVE
    validation_path = repository / SOURCE_VALIDATION_RELATIVE
    phase2b = repository / PHASE2B_ENTRY_RELATIVE

    for path, expected_hash, label in (
        (accepted_phase0, ACCEPTED_PHASE0_SHA256, "accepted Phase 0 CRT master"),
        (accepted_phase3, ACCEPTED_PHASE3_SHA256, "accepted Phase 3 derivative"),
        (phase2b, PHASE2B_ENTRY_SHA256, "accepted Phase 2B ENTRY evidence"),
    ):
        if not path.is_file() or sha256_file(path) != expected_hash:
            raise ValueError(f"{label} hash mismatch: {path}")

    source_build = load_json(source_build_path, "Phase 3-R source-build report")
    ensure_pass(source_build, "Phase 3-R source-build report")
    if source_build.get("repair_parent") != REPAIR_PARENT:
        raise ValueError("Source-build repair parent drift")
    if source_build.get("timeline_changed") is not False:
        raise ValueError("Source-build report does not preserve the accepted timeline")
    frozen = source_build.get("frozen_signature", {})
    if not isinstance(frozen, dict) or frozen.get("exact_match") is not True:
        raise ValueError("Source-build report does not prove an exact frozen signature match")
    if frozen.get("before_sha256") != frozen.get("after_sha256"):
        raise ValueError("Source-build frozen before/after signatures differ")
    dependencies = source_build.get("dependencies", {})
    if not isinstance(dependencies, dict):
        raise ValueError("Source-build dependency record is missing")
    for key in ("external_images", "linked_libraries", "audio", "movie_clips", "cache_files"):
        if dependencies.get(key) != 0:
            raise ValueError(f"Source-build dependency {key} is not zero")
    if dependencies.get("external_paths") not in ([], None):
        raise ValueError("Source-build contains external paths")

    derivative_record = source_build.get("phase3r_derivative")
    if not isinstance(derivative_record, dict):
        raise ValueError("Source-build Phase 3-R derivative record is missing")
    derivative_hash = str(derivative_record.get("sha256", "")).lower()
    if len(derivative_hash) != 64:
        raise ValueError("Source-build Phase 3-R derivative hash is invalid")
    expected_package_path = (
        Path("source") / PHASE3R_DERIVATIVE_RELATIVE.name
    ).as_posix()
    if derivative_record.get("package_relative_path") != expected_package_path:
        raise ValueError("Source-build Phase 3-R derivative path drift")
    if not derivative.is_file():
        raise FileNotFoundError(f"Missing Phase 3-R derivative: {derivative}")
    actual_derivative = file_record(derivative)
    if actual_derivative["sha256"] != derivative_hash:
        raise ValueError("Phase 3-R derivative bytes do not match source-build authority")
    if actual_derivative["bytes"] != derivative_record.get("bytes"):
        raise ValueError("Phase 3-R derivative size does not match source-build authority")

    validation = load_json(validation_path, "Phase 3-R source-validation report")
    ensure_pass(validation, "Phase 3-R source-validation report")
    schema = str(validation.get("schema", ""))
    if not schema.startswith("quantum-hub.phase-3-r-crt-authenticity.source-validation"):
        raise ValueError(f"Unexpected Phase 3-R source-validation schema: {schema!r}")
    assert_validation_has_no_failures(validation)
    checks = validation.get("checks")
    if not isinstance(checks, list) or not checks:
        raise ValueError("Source-validation report has no explicit checks")
    if "check_count" in validation and int(validation["check_count"]) != len(checks):
        raise ValueError("Source-validation check_count does not match its checks array")
    if "failed_count" in validation and int(validation["failed_count"]) != 0:
        raise ValueError("Source-validation failed_count is not zero")
    if any(
        not isinstance(record, dict)
        or record.get("pass") is not True
        or str(record.get("status", "")).upper() != "PASS"
        for record in checks
    ):
        raise ValueError("Source-validation contains a non-PASS check")
    validation_derivative = validation.get("phase3r_derivative")
    expected_validation_derivative = {
        "filename": PHASE3R_DERIVATIVE_RELATIVE.name,
        "repository_relative_path": PHASE3R_DERIVATIVE_RELATIVE.as_posix(),
        "bytes": actual_derivative["bytes"],
        "sha256": derivative_hash,
    }
    if not isinstance(validation_derivative, dict) or any(
        validation_derivative.get(key) != value
        for key, value in expected_validation_derivative.items()
    ):
        raise ValueError(
            "Source-validation derivative path/bytes/SHA do not exactly match source-build authority"
        )

    return {
        "acceptedPhase0": {
            "repositoryRelativePath": ACCEPTED_PHASE0_RELATIVE.as_posix(),
            **file_record(accepted_phase0),
        },
        "acceptedPhase3BeforeRepair": {
            "repositoryRelativePath": ACCEPTED_PHASE3_RELATIVE.as_posix(),
            **file_record(accepted_phase3),
        },
        "phase3rDerivative": {
            "repositoryRelativePath": PHASE3R_DERIVATIVE_RELATIVE.as_posix(),
            **actual_derivative,
        },
        "sourceBuild": {
            "repositoryRelativePath": SOURCE_BUILD_RELATIVE.as_posix(),
            **file_record(source_build_path),
        },
        "sourceValidation": {
            "repositoryRelativePath": SOURCE_VALIDATION_RELATIVE.as_posix(),
            **file_record(validation_path),
        },
        "phase2bEntryEvidence": {
            "repositoryRelativePath": PHASE2B_ENTRY_RELATIVE.as_posix(),
            **file_record(phase2b),
        },
        "sourceBuildPayload": source_build,
    }


def validate_render_report(
    root: Path,
    variant: str,
    expected_size: tuple[int, int],
) -> dict[str, Any]:
    path = root / f"phase3r-{variant}-production-render-report.json"
    if path.is_symlink():
        raise ValueError(f"{variant} production render report may not be a symlink")
    report = load_json(path, f"{variant} production render report")
    if report.get("schema") != "quantum-hub.phase-3-r-crt-authenticity.raw-render-report.v1":
        raise ValueError(f"Unexpected {variant} render-report schema")
    if report.get("variant") != variant or report.get("quality") != "production":
        raise ValueError(f"{variant} render report is not the production variant")
    if report.get("resolution") != list(expected_size):
        raise ValueError(f"{variant} render-report resolution mismatch")
    expected_config_size = cfg.DESKTOP_MASTER if variant == "desktop" else cfg.MOBILE_MASTER
    if tuple(expected_config_size) != expected_size:
        raise ValueError(f"{variant} packager dimensions drift from phase3r_config")
    if report.get("engine") != "CYCLES" or int(report.get("samples", 0)) != int(
        cfg.CYCLES["samples"]
    ):
        raise ValueError(f"{variant} render report does not match the configured Cycles samples")
    if report.get("source") != PHASE3R_DERIVATIVE_RELATIVE.name:
        raise ValueError(f"{variant} render report source drift")
    frames = report.get("frames")
    if not isinstance(frames, list) or len(frames) != FRAME_COUNT:
        raise ValueError(f"{variant} render report does not contain all 270 frames")
    for expected_frame, record in enumerate(frames, FRAME_START):
        if not isinstance(record, dict):
            raise ValueError(f"{variant} render report frame record is invalid")
        if record.get("frame") != expected_frame:
            raise ValueError(f"{variant} render report frame order mismatch at {expected_frame}")
        expected_name = frame_path(root, variant, expected_frame).name
        if record.get("path") != expected_name:
            raise ValueError(f"{variant} render report filename mismatch at {expected_frame}")
    if cfg.FPS != FPS or cfg.FRAME_START != FRAME_START or cfg.FRAME_END != FRAME_END:
        raise ValueError("Phase 3-R packager timeline drifts from phase3r_config")
    if cfg.DERIVATIVE_SOURCE.resolve() != (SCRIPT_DIR / PHASE3R_DERIVATIVE_RELATIVE.name).resolve():
        raise ValueError("phase3r_config derivative path drifts from the packager authority")
    return {
        "repositoryPolicy": "OUTSIDE_GIT",
        "requiredBasename": path.name,
        **file_record(path),
        "configurationBinding": {
            "configFilename": "phase3r_config.py",
            "configSha256": sha256_file(SCRIPT_DIR / "phase3r_config.py"),
            "derivativeFilename": PHASE3R_DERIVATIVE_RELATIVE.name,
            "derivativeSha256": sha256_file(cfg.DERIVATIVE_SOURCE),
            "rendererFilename": "render_phase3r_frames.py",
            "rendererSha256": sha256_file(SCRIPT_DIR / "render_phase3r_frames.py"),
            "rendererPythonAstSha256": python_ast_sha256(
                SCRIPT_DIR / "render_phase3r_frames.py"
            ),
            "rendererRawByteIdentityAtLaunchClaimed": False,
            "rendererLaunchBinding": (
                "CANONICAL_PYTHON_AST_PLUS_CURRENT_FILE_HASH; trailing-whitespace-only "
                "post-render normalization is semantics-neutral"
            ),
        },
        "payload": report,
    }


def validate_sequence(
    root: Path,
    variant: str,
    expected_size: tuple[int, int],
) -> dict[str, Any]:
    if not root.is_dir():
        raise FileNotFoundError(f"Missing {variant} frame root: {root}")
    report_record = validate_render_report(root, variant, expected_size)
    report_frames = report_record["payload"]["frames"]
    digest = hashlib.sha256()
    total_bytes = 0
    boundary: dict[str, Any] = {}
    for frame in range(FRAME_START, FRAME_END + 1):
        path = frame_path(root, variant, frame)
        if not path.is_file():
            raise FileNotFoundError(f"Missing {variant} production frame {frame}: {path}")
        if path.is_symlink():
            raise ValueError(f"{variant} production frame may not be a symlink: {path}")
        with Image.open(path) as image:
            if image.format != "PNG" or image.size != expected_size:
                raise ValueError(
                    f"Invalid {variant} frame {frame}: format={image.format}, size={image.size}"
                )
            image.verify()
        record = file_record(path)
        reported = report_frames[frame - FRAME_START]
        if reported.get("bytes") != record["bytes"]:
            raise ValueError(f"{variant} render-report byte mismatch at frame {frame}")
        if abs(float(reported.get("normalized_progress", -1)) - normalized_progress(frame)) > 1e-6:
            raise ValueError(f"{variant} render-report progress mismatch at frame {frame}")
        total_bytes += record["bytes"]
        digest.update(path.name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(record["sha256"].encode("ascii"))
        digest.update(b"\0")
        digest.update(str(record["bytes"]).encode("ascii"))
        digest.update(b"\n")
        if frame in (FRAME_START, FRAME_END):
            boundary[str(frame)] = record
    expected_names = {
        f"phase3r-{variant}-{frame:04d}.png"
        for frame in range(FRAME_START, FRAME_END + 1)
    }
    actual_names = {path.name for path in root.glob(f"phase3r-{variant}-*.png")}
    if actual_names != expected_names:
        raise ValueError(
            f"Ambiguous {variant} raw sequence; missing={sorted(expected_names - actual_names)[:8]}, "
            f"extra={sorted(actual_names - expected_names)[:8]}"
        )
    return {
        "storagePolicy": "OUTSIDE_GIT_LOCAL_PATH_INTENTIONALLY_OMITTED",
        "filenamePattern": f"phase3r-{variant}-%04d.png",
        "dimensions": {"width": expected_size[0], "height": expected_size[1]},
        "fps": FPS,
        "frameStart": FRAME_START,
        "frameEnd": FRAME_END,
        "frameCount": FRAME_COUNT,
        "durationSeconds": DURATION_SECONDS,
        "totalBytes": total_bytes,
        "sequenceSha256": digest.hexdigest(),
        "boundaryFrames": boundary,
        "renderReport": report_record,
    }


def old_before_frames(repository: Path) -> tuple[dict[int, Image.Image], dict[str, Any]]:
    manifest_relative = OLD_POST_PRODUCTION_RELATIVE.as_posix()
    manifest_bytes = git_blob_bytes(
        repository, REPAIR_PARENT, manifest_relative, "historical Phase 3 post-production manifest"
    )
    try:
        manifest = json.loads(manifest_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Repair-parent Phase 3 post-production manifest is invalid") from exc
    ensure_pass(manifest, "historical Phase 3 post-production manifest")
    if manifest.get("schema") != "quantum-hub.phase-3-crt-opening.post-production.v1":
        raise ValueError("Historical Phase 3 post-production schema drift")
    derivative = manifest.get("sourceMasters", {}).get("phase3DerivativeCRT", {})
    if derivative.get("sha256") != ACCEPTED_PHASE3_SHA256:
        raise ValueError("Historical Phase 3 manifest is not bound to the repair parent source")

    records = {
        record.get("repositoryRelativePath"): record
        for record in manifest.get("reviewArtifacts", [])
        if isinstance(record, dict)
    }
    images: dict[int, Image.Image] = {}
    authorities = []
    for frame in BEFORE_AFTER_FRAMES:
        relative = (
            "artifacts/original/phase-3-crt-opening/review/full-resolution-stills/"
            f"phase-3-desktop-f{frame:03d}-p{base.normalized_progress(frame):.4f}-"
            "full-resolution.png"
        )
        record = records.get(relative)
        if not isinstance(record, dict):
            raise ValueError(f"Historical before-frame is absent from old manifest: {relative}")
        blob = git_blob_bytes(repository, REPAIR_PARENT, relative, f"historical before-frame {frame}")
        blob_hash = hashlib.sha256(blob).hexdigest()
        if len(blob) != record.get("bytes") or blob_hash != record.get("sha256"):
            raise ValueError(f"Historical before-frame repair-parent blob mismatch: {relative}")
        with Image.open(io.BytesIO(blob)) as image:
            if image.size != DESKTOP_SIZE or image.format != "PNG":
                raise ValueError(f"Historical before-frame geometry mismatch: {relative}")
            images[frame] = image.convert("RGB").copy()
        authorities.append(
            {
                "frame": frame,
                "normalizedProgress": normalized_progress(frame),
                "repositoryRelativePath": relative,
                "bytes": record["bytes"],
                "sha256": record["sha256"],
            }
        )
    return images, {
        "manifest": {
            "gitRevision": REPAIR_PARENT,
            "repositoryRelativePath": manifest_relative,
            "bytes": len(manifest_bytes),
            "sha256": hashlib.sha256(manifest_bytes).hexdigest(),
        },
        "loadPolicy": "REPAIR_PARENT_GIT_BLOBS_NOT_WORKTREE_REVIEW_FILES",
        "frames": authorities,
    }


def validate_retained_frozen_review(repository: Path, review_root: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    review_relative_root = review_root.relative_to(repository).as_posix()
    for filename in sorted(RETAINED_FROZEN_REVIEW):
        relative = f"{review_relative_root}/{filename}"
        blob = git_blob_bytes(repository, REPAIR_PARENT, relative, f"retained review {filename}")
        path = review_root / filename
        if not path.is_file():
            raise FileNotFoundError(f"Missing retained frozen Phase 3 evidence: {path}")
        if path.is_symlink():
            raise ValueError(f"Retained frozen evidence may not be a symlink: {path}")
        actual = file_record(path)
        expected_hash = hashlib.sha256(blob).hexdigest()
        if actual["bytes"] != len(blob) or actual["sha256"] != expected_hash:
            raise ValueError(f"Retained frozen Phase 3 evidence drift: {filename}")
        records.append(
            {
                "repositoryRelativePath": relative,
                "repairParent": REPAIR_PARENT,
                **actual,
            }
        )
    return records


def input_sequence_arguments(root: Path, variant: str) -> list[str]:
    return [
        "-framerate",
        str(FPS),
        "-start_number",
        str(FRAME_START),
        "-i",
        str(root / f"phase3r-{variant}-%04d.png"),
        "-frames:v",
        str(FRAME_COUNT),
        "-an",
        "-map_metadata",
        "-1",
    ]


def repository_identity(repository: Path) -> dict[str, Any]:
    branch = base.run(["git", "branch", "--show-current"], cwd=repository).stdout.strip()
    head = base.run(["git", "rev-parse", "HEAD"], cwd=repository).stdout.strip()
    if branch != "feature/phase-3-crt-opening-production":
        raise ValueError(f"Phase 3-R must package on the production feature branch, got {branch!r}")
    ancestry = base.run(
        ["git", "merge-base", "--is-ancestor", REPAIR_PARENT, "HEAD"], cwd=repository
    )
    if ancestry.returncode != 0:
        raise ValueError("Repair parent is not an ancestor of packaging HEAD")
    return {"branch": branch, "headAtPackaging": head, "repairParent": REPAIR_PARENT}


def candidate_specs(media_root: Path) -> list[dict[str, Any]]:
    return [
        {
            "id": "desktop-h264",
            "variant": "desktop",
            "codec": "h264",
            "expectedSize": DESKTOP_SIZE,
            "path": media_root / MEDIA_FILENAMES["desktop-h264"],
            "settings": {"encoder": "libx264", "crf": 18, "preset": "slow"},
        },
        {
            "id": "desktop-vp9",
            "variant": "desktop",
            "codec": "vp9",
            "expectedSize": DESKTOP_SIZE,
            "path": media_root / MEDIA_FILENAMES["desktop-vp9"],
            "settings": {"encoder": "libvpx-vp9", "crf": 27, "cpuUsed": 2},
        },
        {
            "id": "mobile-h264",
            "variant": "mobile",
            "codec": "h264",
            "expectedSize": MOBILE_SIZE,
            "path": media_root / MEDIA_FILENAMES["mobile-h264"],
            "settings": {"encoder": "libx264", "crf": 19, "preset": "slow"},
        },
        {
            "id": "mobile-vp9",
            "variant": "mobile",
            "codec": "vp9",
            "expectedSize": MOBILE_SIZE,
            "path": media_root / MEDIA_FILENAMES["mobile-vp9"],
            "settings": {"encoder": "libvpx-vp9", "crf": 28, "cpuUsed": 2},
        },
    ]


def candidate_media_inventory(media_root: Path) -> set[str]:
    if not media_root.is_dir():
        raise FileNotFoundError(f"Missing Phase 3 candidate media root: {media_root}")
    symlinks = [path for path in media_root.rglob("*") if path.is_symlink()]
    if symlinks:
        raise ValueError(f"Candidate media symlinks are prohibited: {symlinks[:4]}")
    return {
        path.relative_to(media_root).as_posix()
        for path in media_root.rglob("*")
        if path.is_file()
    }


def encode_candidates(
    ffmpeg: Path,
    ffprobe: Path,
    repository: Path,
    desktop_root: Path,
    mobile_root: Path,
    desktop_source: dict[str, Any],
    mobile_source: dict[str, Any],
    media_root: Path,
    reuse: bool,
) -> list[dict[str, Any]]:
    outputs: list[dict[str, Any]] = []
    for spec in candidate_specs(media_root):
        root = desktop_root if spec["variant"] == "desktop" else mobile_root
        source = desktop_source if spec["variant"] == "desktop" else mobile_source
        if not reuse:
            codec_args = (
                base.h264_arguments(spec["settings"]["crf"])
                if spec["codec"] == "h264"
                else base.vp9_arguments(spec["settings"]["crf"])
            )
            base.encode_atomic(
                ffmpeg,
                [*input_sequence_arguments(root, spec["variant"]), *codec_args],
                spec["path"],
            )
        elif not spec["path"].is_file():
            raise FileNotFoundError(f"Cannot reuse missing candidate: {spec['path']}")
        verification = base.verify_candidate(
            ffprobe, spec["path"], spec["expectedSize"], spec["codec"]
        )
        outputs.append(
            {
                "id": spec["id"],
                "variant": spec["variant"],
                "codec": spec["codec"],
                "repositoryRelativePath": spec["path"].relative_to(repository).as_posix(),
                "sourceSequenceSha256": source["sequenceSha256"],
                "settings": {
                    **spec["settings"],
                    "fps": FPS,
                    "selectedGopFrames": GOP,
                    "selectedGopMilliseconds": 400,
                    "pixelFormat": "yuv420p",
                    "audio": False,
                    "colorMetadata": "BT.709 limited range",
                },
                "verification": verification,
                "status": "PHASE 3-R PRODUCTION CANDIDATE — HUMAN REVIEW REQUIRED",
            }
        )
    return outputs


def raw_sequence_binding(source: dict[str, Any]) -> dict[str, Any]:
    report = source["renderReport"]
    return {
        "storagePolicy": source["storagePolicy"],
        "filenamePattern": source["filenamePattern"],
        "dimensions": source["dimensions"],
        "fps": source["fps"],
        "frameStart": source["frameStart"],
        "frameEnd": source["frameEnd"],
        "frameCount": source["frameCount"],
        "durationSeconds": source["durationSeconds"],
        "totalBytes": source["totalBytes"],
        "sequenceSha256": source["sequenceSha256"],
        "boundaryFrames": source["boundaryFrames"],
        "renderReport": {
            key: value for key, value in report.items() if key != "payload"
        },
    }


def source_binding(authority: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in authority.items() if key != "sourceBuildPayload"}


def expected_encoding_protocol() -> dict[str, Any]:
    return {
        "fps": FPS,
        "frameStart": FRAME_START,
        "frameEnd": FRAME_END,
        "frameCount": FRAME_COUNT,
        "durationSeconds": DURATION_SECONDS,
        "gopFrames": GOP,
        "gopMilliseconds": 400,
        "audioStreams": 0,
        "pixelFormat": "yuv420p",
        "colorMetadata": "BT.709 limited range",
        "candidateIds": sorted(MEDIA_FILENAMES),
    }


def renderer_launch_provenance(
    tools: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    renderer = tools["render_phase3r_frames.py"]
    return {
        "canonicalPythonAstSha256": renderer["pythonAstSha256"],
        "currentFileSha256": renderer["sha256"],
        "rawByteIdentityAtProductionLaunchClaimed": False,
        "semanticIdentityAuthority": "CANONICAL_PYTHON_AST",
        "derivativeAndConfigUnchangedDuringRender": True,
        "note": (
            "The authoritative render processes loaded the same canonical Python AST. "
            "The current raw file also records a trailing-whitespace-only post-render "
            "normalization; raw-byte identity at process launch is intentionally not claimed."
        ),
    }


def write_candidate_authority(
    repository: Path,
    manifest_path: Path,
    identity: dict[str, Any],
    authority: dict[str, Any],
    tools: dict[str, dict[str, Any]],
    desktop_source: dict[str, Any],
    mobile_source: dict[str, Any],
    candidates: list[dict[str, Any]],
    ffmpeg: Path,
    ffprobe: Path,
) -> dict[str, Any]:
    payload = {
        "schema": "quantum-hub.phase-3-r-crt-authenticity.candidate-authority.v1",
        "status": "PASS",
        "stage": "ENCODE_ONLY",
        "repository": identity,
        "sourceAuthority": source_binding(authority),
        "protocolSources": tools,
        "rendererLaunchProvenance": renderer_launch_provenance(tools),
        "rawProductionSequences": {
            "desktop": raw_sequence_binding(desktop_source),
            "mobile": raw_sequence_binding(mobile_source),
        },
        "encodingProtocol": expected_encoding_protocol(),
        "toolchain": {
            "ffmpeg": base.ffmpeg_version(ffmpeg),
            "ffprobe": base.ffmpeg_version(ffprobe),
        },
        "deliveryCandidates": candidates,
        "candidateInventory": sorted(
            candidate["repositoryRelativePath"] for candidate in candidates
        ),
        "rawFramesCommitted": False,
    }
    atomic_json(manifest_path, payload)
    return payload


def verify_candidate_authority(
    repository: Path,
    manifest_path: Path,
    declared_manifest_sha256: str,
    authority: dict[str, Any],
    tools: dict[str, dict[str, Any]],
    desktop_source: dict[str, Any],
    mobile_source: dict[str, Any],
    ffmpeg: Path,
    ffprobe: Path,
    media_root: Path,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    declared_hash = declared_manifest_sha256.strip().lower()
    if not re.fullmatch(r"[0-9a-f]{64}", declared_hash):
        raise ValueError("--candidate-authority-sha256 must be a lowercase/uppercase SHA-256")
    actual_manifest_hash = sha256_file(manifest_path)
    if actual_manifest_hash != declared_hash:
        raise ValueError(
            "Candidate-authority file does not match the explicit encode-only SHA-256; "
            "refusing candidate reuse"
        )
    manifest = load_json(manifest_path, "Phase 3-R candidate-authority manifest")
    if manifest.get("schema") != "quantum-hub.phase-3-r-crt-authenticity.candidate-authority.v1":
        raise ValueError("Unexpected Phase 3-R candidate-authority schema")
    ensure_pass(manifest, "Phase 3-R candidate-authority manifest")
    if manifest.get("stage") != "ENCODE_ONLY" or manifest.get("rawFramesCommitted") is not False:
        raise ValueError("Candidate authority is not a valid ENCODE_ONLY result")
    recorded_repository = manifest.get("repository", {})
    if recorded_repository.get("branch") != "feature/phase-3-crt-opening-production":
        raise ValueError("Candidate authority branch drift")
    if recorded_repository.get("repairParent") != REPAIR_PARENT:
        raise ValueError("Candidate authority repair-parent drift")
    if manifest.get("sourceAuthority") != source_binding(authority):
        raise ValueError("Candidate authority source/derivative/source-build binding drift")
    if manifest.get("protocolSources") != tools:
        raise ValueError("Candidate authority packager/renderer/repair/validator/config hash drift")
    expected_renderer_provenance = renderer_launch_provenance(tools)
    if manifest.get("rendererLaunchProvenance") != expected_renderer_provenance:
        raise ValueError("Candidate authority renderer AST/current-byte provenance drift")
    if manifest.get("encodingProtocol") != expected_encoding_protocol():
        raise ValueError("Candidate authority encoding settings drift")
    expected_raw = {
        "desktop": raw_sequence_binding(desktop_source),
        "mobile": raw_sequence_binding(mobile_source),
    }
    if manifest.get("rawProductionSequences") != expected_raw:
        raise ValueError("Candidate authority raw sequence/render-report binding drift")
    expected_toolchain = {
        "ffmpeg": base.ffmpeg_version(ffmpeg),
        "ffprobe": base.ffmpeg_version(ffprobe),
    }
    if manifest.get("toolchain") != expected_toolchain:
        raise ValueError("Candidate authority encoder/probe toolchain drift")

    records = manifest.get("deliveryCandidates")
    if not isinstance(records, list) or len(records) != 4:
        raise ValueError("Candidate authority must record exactly four delivery candidates")
    by_id = {record.get("id"): record for record in records if isinstance(record, dict)}
    if set(by_id) != set(MEDIA_FILENAMES):
        raise ValueError("Candidate authority IDs are incomplete or duplicated")
    verified: list[dict[str, Any]] = []
    for spec in candidate_specs(media_root):
        recorded = by_id[spec["id"]]
        expected_relative = spec["path"].relative_to(repository).as_posix()
        if recorded.get("repositoryRelativePath") != expected_relative:
            raise ValueError(f"Candidate authority path drift for {spec['id']}")
        expected_source = desktop_source if spec["variant"] == "desktop" else mobile_source
        if recorded.get("sourceSequenceSha256") != expected_source["sequenceSha256"]:
            raise ValueError(f"Candidate authority source sequence drift for {spec['id']}")
        expected_settings = {
            **spec["settings"],
            "fps": FPS,
            "selectedGopFrames": GOP,
            "selectedGopMilliseconds": 400,
            "pixelFormat": "yuv420p",
            "audio": False,
            "colorMetadata": "BT.709 limited range",
        }
        if recorded.get("settings") != expected_settings:
            raise ValueError(f"Candidate authority exact settings drift for {spec['id']}")
        actual_verification = base.verify_candidate(
            ffprobe, spec["path"], spec["expectedSize"], spec["codec"]
        )
        recorded_verification = recorded.get("verification", {})
        if recorded_verification != actual_verification:
            raise ValueError(
                f"Candidate bytes/probe do not match candidate authority for {spec['id']}; "
                "refusing historical Phase 3 or re-encoded media"
            )
        if recorded.get("variant") != spec["variant"] or recorded.get("codec") != spec["codec"]:
            raise ValueError(f"Candidate authority variant/codec drift for {spec['id']}")
        verified.append(recorded)
    expected_inventory = sorted(
        candidate["repositoryRelativePath"] for candidate in verified
    )
    if manifest.get("candidateInventory") != expected_inventory:
        raise ValueError("Candidate authority inventory drift")
    return verified, {
        "repositoryRelativePath": manifest_path.relative_to(repository).as_posix(),
        **file_record(manifest_path),
    }


def validate_media_qa(
    qa_path: Path,
    recording_path: Path,
    candidates: list[dict[str, Any]],
    ffprobe: Path,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    report = load_json(qa_path, "Phase 3-R media QA report")
    if report.get("schema") != "quantum-hub.phase-3-media-qa.v1":
        raise ValueError("Unexpected media QA schema")
    summary = report.get("summary")
    if not isinstance(summary, dict):
        raise ValueError("Media QA summary is missing")
    required_summary = {
        "status": "passed",
        "passed": True,
        "commandSucceeded": True,
        "browserEvidenceComplete": True,
        "probeCandidatesPassed": 4,
        "probeCandidatesTotal": 4,
        "chromiumExecuted": True,
        "recordedMediaLabVideoRequested": True,
        "recordedMediaLabVideoStatus": "passed",
    }
    for key, expected in required_summary.items():
        if summary.get(key) != expected:
            raise ValueError(f"Media QA summary is incomplete: {key}={summary.get(key)!r}")
    for key in ("probeFailureIds", "chromiumFailureIds", "chromiumPartialIds"):
        if summary.get(key) != []:
            raise ValueError(f"Media QA summary contains {key}: {summary.get(key)!r}")
    expectations = report.get("expectations")
    if expectations != {
        "fps": FPS,
        "durationSeconds": DURATION_SECONDS,
        "frames": FRAME_COUNT,
        "gopFrames": GOP,
        "desktop": {"width": DESKTOP_SIZE[0], "height": DESKTOP_SIZE[1]},
        "mobile": {"width": MOBILE_SIZE[0], "height": MOBILE_SIZE[1]},
        "audioStreams": 0,
    }:
        raise ValueError("Media QA expectations do not match the Phase 3-R delivery contract")

    expected_by_id = {candidate["id"]: candidate for candidate in candidates}
    qa_candidates = report.get("candidates")
    if not isinstance(qa_candidates, list) or len(qa_candidates) != 4:
        raise ValueError("Media QA must contain exactly four candidate results")
    resolved_ids: set[str] = set()
    for qa_candidate in qa_candidates:
        if not isinstance(qa_candidate, dict):
            raise ValueError("Media QA candidate record is invalid")
        qa_id = str(qa_candidate.get("id", ""))
        candidate_id = QA_ID_TO_CANDIDATE_ID.get(qa_id, qa_id)
        if candidate_id not in expected_by_id or candidate_id in resolved_ids:
            raise ValueError(f"Media QA candidate ID is unexpected or duplicated: {qa_id!r}")
        resolved_ids.add(candidate_id)
        expected = expected_by_id[candidate_id]
        qa_file = qa_candidate.get("file", {})
        if qa_candidate.get("status") != "passed" or qa_file.get("exists") is not True:
            raise ValueError(f"Media QA candidate did not pass: {qa_id}")
        if qa_file.get("sha256") != expected["verification"]["sha256"]:
            raise ValueError(f"Media QA candidate hash mismatch: {qa_id}")
        if int(qa_file.get("bytes", -1)) != expected["verification"]["bytes"]:
            raise ValueError(f"Media QA candidate byte mismatch: {qa_id}")
        chromium = qa_candidate.get("compatibility", {}).get("chromium", {})
        if not (
            chromium.get("status") == "tested"
            and chromium.get("tested") is True
            and chromium.get("passed") is True
            and chromium.get("supported") is True
            and chromium.get("conclusion") == "passed"
        ):
            raise ValueError(f"Media QA Chromium result is incomplete: {qa_id}")
    if resolved_ids != set(expected_by_id):
        raise ValueError("Media QA does not bind all four selected candidates")

    browser = report.get("browser")
    if not isinstance(browser, dict) or not (
        browser.get("tested") is True
        and browser.get("status") == "passed"
        and browser.get("complete") is True
        and browser.get("required") is True
    ):
        raise ValueError("Media QA browser evidence is not complete PASS")
    native_visibility = browser.get("nativeVisibilityProfile")
    if not isinstance(native_visibility, dict) or not (
        native_visibility.get("tested") is True
        and native_visibility.get("status") == "passed"
    ):
        raise ValueError("Media QA native Page Visibility profile is not complete PASS")
    harness = browser.get("harness")
    if not isinstance(harness, dict) or not (
        harness.get("productionRoutesEntered") is False
        and harness.get("productionDirectoriesServed") is False
        and harness.get("mediaSources") == "only the four explicit candidate files"
        and harness.get("mediaLabSurfaceServed") is True
    ):
        raise ValueError("Media QA browser harness isolation is incomplete")
    browser_results = browser.get("candidateResults")
    if not isinstance(browser_results, dict) or len(browser_results) != 4:
        raise ValueError("Media QA browser candidate results are incomplete")
    browser_resolved_ids: set[str] = set()
    for qa_id, result in browser_results.items():
        candidate_id = QA_ID_TO_CANDIDATE_ID.get(str(qa_id), str(qa_id))
        if (
            candidate_id not in expected_by_id
            or candidate_id in browser_resolved_ids
            or not isinstance(result, dict)
        ):
            raise ValueError(f"Unexpected browser QA candidate: {qa_id}")
        browser_resolved_ids.add(candidate_id)
        if not (
            result.get("tested") is True
            and result.get("status") == "passed"
            and result.get("passed") is True
            and result.get("partial") is False
            and result.get("supported") is True
        ):
            raise ValueError(f"Incomplete browser QA result: {qa_id}")
        if result.get("visibleFailures") not in ([], None):
            raise ValueError(f"Browser QA visible failures: {qa_id}")
        if result.get("consoleErrors") not in ([], None) or result.get("pageErrors") not in (
            [],
            None,
        ):
            raise ValueError(f"Browser QA console/page failures: {qa_id}")
        hidden_tab = result.get("hiddenTab")
        if not isinstance(hidden_tab, dict) or not (
            hidden_tab.get("status") == "complete-pass"
            and hidden_tab.get("passed") is True
        ):
            raise ValueError(f"Browser QA hidden-tab evidence is incomplete: {qa_id}")
        if result.get("seeks", {}).get("failedCount") != 0:
            raise ValueError(f"Browser QA reports failed seeks: {qa_id}")
    if browser_resolved_ids != set(expected_by_id):
        raise ValueError("Media QA browser evidence does not bind all four candidates")

    review_video = browser.get("reviewVideo")
    if not isinstance(review_video, dict) or not (
        review_video.get("requested") is True and review_video.get("status") == "passed"
    ):
        raise ValueError("Media QA headed media-lab recording did not pass")
    if review_video.get("errors") != [] or review_video.get("hiddenTab", {}).get(
        "status"
    ) != "recorded":
        raise ValueError("Media QA headed recording contains errors/incomplete visibility evidence")
    output = review_video.get("output")
    if not isinstance(output, dict):
        raise ValueError("Media QA recording output authority is missing")
    if not recording_path.is_file():
        raise FileNotFoundError(f"Missing explicit media-lab recording: {recording_path}")
    recording_record = file_record(recording_path)
    if output.get("sha256") != recording_record["sha256"] or int(
        output.get("bytes", -1)
    ) != recording_record["bytes"]:
        raise ValueError("Explicit media-lab recording does not match the QA report hash/bytes")
    required_interactions = {
        "first-frame",
        "final-frame",
        "random-10",
        "rapid-alternating",
        "forward-reverse",
    }
    interactions = review_video.get("interactions")
    if not isinstance(interactions, list):
        raise ValueError("Media QA recording interaction ledger is missing")
    passed_interactions = {
        str(item.get("action"))
        for item in interactions
        if isinstance(item, dict) and item.get("status") in {"passed", "completed"}
    }
    if not required_interactions.issubset(passed_interactions):
        raise ValueError("Media QA recording is missing required scrub/seek interactions")
    media_probe = base.probe_media(ffprobe, recording_path)
    if (
        media_probe.get("audioStreamCount") != 0
        or media_probe.get("codec") not in {"vp8", "vp9"}
        or "webm" not in set(str(media_probe.get("containerFormats", "")).split(","))
        or media_probe.get("width", 0) <= 0
        or media_probe.get("height", 0) <= 0
        or media_probe.get("durationSeconds", 0) <= 0
    ):
        raise ValueError("Explicit media-lab recording is not a valid silent WebM")
    return report, recording_record, media_probe


def validate_render_determinism_report(
    report_path: Path,
    repository: Path,
    authority: dict[str, Any],
    tools: dict[str, dict[str, Any]],
    desktop_root: Path,
    mobile_root: Path,
) -> dict[str, Any]:
    report = load_json(report_path, "Phase 3-R render-determinism report")
    if report.get("schema") != "quantum-hub.phase-3-r-render-determinism.v1":
        raise ValueError("Unexpected Phase 3-R render-determinism schema")
    if report.get("status") != "PASS":
        raise ValueError("Phase 3-R render-determinism report is not PASS")
    source = report.get("sourceAuthority")
    if not isinstance(source, dict):
        raise ValueError("Render-determinism source authority is missing")
    def same_core_record(left: Any, right: Any) -> bool:
        return isinstance(left, dict) and isinstance(right, dict) and all(
            left.get(key) == right.get(key)
            for key in ("repositoryRelativePath", "bytes", "sha256")
        )

    if not same_core_record(source.get("derivative"), authority["phase3rDerivative"]):
        raise ValueError("Render-determinism derivative does not match selected authority")
    if not same_core_record(source.get("sourceBuildManifest"), authority["sourceBuild"]):
        raise ValueError("Render-determinism source-build manifest binding drift")
    if not same_core_record(source.get("renderer"), tools["render_phase3r_frames.py"]):
        raise ValueError("Render-determinism renderer hash binding drift")
    if (
        source.get("repairParent") != REPAIR_PARENT
        or source.get("timelineChanged") is not False
        or source.get("frozenSignatureExactMatch") is not True
    ):
        raise ValueError("Render-determinism source repair/frozen authority drift")
    verifier = report.get("verifier")
    if not same_core_record(verifier, tools[DETERMINISM_VERIFIER_RELATIVE.name]):
        raise ValueError("Render-determinism verifier hash binding drift")
    protocol = report.get("deterministicProtocol", {})
    if not (
        protocol.get("desktopFreshBlenderProcess") is True
        and protocol.get("mobileFreshBlenderProcess") is True
        and protocol.get("processesAreSeparate") is True
        and protocol.get("randomFrameDependentEvents") is False
    ):
        raise ValueError("Render-determinism fresh-process protocol is incomplete")
    output_policy = report.get("outputPolicy")
    if not isinstance(output_policy, dict) or not (
        output_policy.get("reportOutsideGit") is True
        and output_policy.get("rawRerendersOutsideGit") is True
        and output_policy.get("historicalManifestsWritten") is False
        and output_policy.get("absoluteExternalPathsOmittedForPortability") is True
    ):
        raise ValueError("Render-determinism output/isolation policy is incomplete")

    expected_frames = [1, 126, 144, 162, 196, 250, 262, 270]
    variants = report.get("variants")
    if not isinstance(variants, dict) or set(variants) != {"desktop", "mobile"}:
        raise ValueError("Render-determinism report must contain desktop and mobile")
    for variant, root, dimensions in (
        ("desktop", desktop_root, DESKTOP_SIZE),
        ("mobile", mobile_root, MOBILE_SIZE),
    ):
        result = variants[variant]
        if not isinstance(result, dict) or result.get("status") != "PASS":
            raise ValueError(f"Render-determinism {variant} result is not PASS")
        if result.get("expectedDimensions") != list(dimensions):
            raise ValueError(f"Render-determinism {variant} dimensions drift")
        if result.get("sampleFrames") != expected_frames:
            raise ValueError(f"Render-determinism {variant} checkpoints drift")
        process = result.get("freshRenderProcess", {})
        if not (
            process.get("freshProcess") is True
            and process.get("separateFromOtherVariant") is True
            and process.get("exitCode") == 0
            and process.get("quality") == "production"
            and process.get("requestedFrames") == expected_frames
            and process.get("stdoutEndedWithRenderReport") is True
        ):
            raise ValueError(f"Render-determinism {variant} process authority is incomplete")
        records = result.get("records")
        if not isinstance(records, list) or [item.get("frame") for item in records] != expected_frames:
            raise ValueError(f"Render-determinism {variant} record coverage drift")
        for item in records:
            frame = int(item["frame"])
            reference_path = frame_path(root, variant, frame)
            with Image.open(reference_path) as image:
                current_reference = {
                    "bytes": reference_path.stat().st_size,
                    "sha256": sha256_file(reference_path),
                    "width": image.width,
                    "height": image.height,
                }
            if item.get("filename") != reference_path.name or item.get("reference") != current_reference:
                raise ValueError(
                    f"Render-determinism {variant} checkpoint {frame} is not bound to selected sequence"
                )
            pixel = item.get("pixelComparison", {})
            if not (
                item.get("status") == "PASS"
                and item.get("dimensionsPassed") is True
                and pixel.get("comparable") is True
                and pixel.get("visualStateIdentityPassed") is True
            ):
                raise ValueError(f"Render-determinism {variant} checkpoint {frame} failed")
    return report


def load_panels(root: Path, variant: str, frames: Sequence[int]) -> list[base.Panel]:
    panels: list[base.Panel] = []
    for frame in frames:
        with Image.open(frame_path(root, variant, frame)) as image:
            panels.append(base.Panel(image.convert("RGB").copy(), base.frame_label(frame)))
    return panels


def screen_closeup(image: Image.Image, frame: int) -> Image.Image:
    rgb = image.convert("RGB")
    if frame >= 232:
        return base.cover(rgb, (960, 540), (0.5, 0.5))
    left = round(rgb.width * 0.405)
    top = round(rgb.height * 0.235)
    right = round(rgb.width * 0.765)
    bottom = round(rgb.height * 0.775)
    return base.cover(rgb.crop((left, top, right, bottom)), (960, 540), (0.5, 0.5))


def build_startup_sheet(desktop_root: Path, destination: Path) -> None:
    panels: list[base.Panel] = []
    for frame in STARTUP_FRAMES:
        with Image.open(frame_path(desktop_root, "desktop", frame)) as image:
            rgb = image.convert("RGB")
            panels.append(base.Panel(rgb.copy(), f"FULL COMPOSITION · {base.frame_label(frame)}"))
            panels.append(
                base.Panel(
                    screen_closeup(rgb, frame),
                    f"NATIVE SCREEN DETAIL · F{frame:03d} · P{normalized_progress(frame):.4f}",
                )
            )
    base.compose_sheet(
        destination,
        "PHASE 3-R · CRT PHOSPHOR / PICTURE FORMATION",
        "Full composition plus screen closeup · neutral line → filled field → fine raster → integrated signal",
        panels,
        columns=4,
        panel_size=(480, 270),
    )


def build_before_after_sheet(
    before: dict[int, Image.Image], desktop_root: Path, destination: Path
) -> None:
    state_names = {
        126: "HORIZONTAL PHOSPHOR EVENT",
        144: "PICTURE-FIELD EXPANSION",
        196: "SETTLED QUANTUM CONTENT",
        250: "LATE APPROACH",
        270: "TEXT-FREE HANDOFF",
    }
    panels: list[base.Panel] = []
    for frame in BEFORE_AFTER_FRAMES:
        old = before[frame]
        with Image.open(frame_path(desktop_root, "desktop", frame)) as repaired:
            new = repaired.convert("RGB")
            panels.extend(
                (
                    base.Panel(old.copy(), f"BEFORE FULL · {state_names[frame]} · F{frame:03d}"),
                    base.Panel(new.copy(), f"PHASE 3-R FULL · {state_names[frame]} · F{frame:03d}"),
                    base.Panel(screen_closeup(old, frame), f"BEFORE SCREEN DETAIL · F{frame:03d}"),
                    base.Panel(screen_closeup(new, frame), f"PHASE 3-R SCREEN DETAIL · F{frame:03d}"),
                )
            )
    base.compose_sheet(
        destination,
        "PHASE 3-R · CRT AUTHENTICITY BEFORE / AFTER",
        "Per state: historical/repaired full composition, then historical/repaired native screen detail",
        panels,
        columns=4,
        panel_size=(480, 270),
    )


def build_handoff_sheet(
    desktop_root: Path, phase2b_reference: Path, destination: Path
) -> None:
    panels = load_panels(desktop_root, "desktop", HANDOFF_FRAMES)
    panels.append(base.Panel(base.phase2b_entry_image(phase2b_reference), "FROZEN PHASE 2B · ENTRY TARGET"))
    base.compose_sheet(
        destination,
        "PHASE 3-R · CRT TO OPERATING FIELD HANDOFF",
        "F250 faint CRT identity → F262 near-flat picture black → F270 almost digital → frozen Phase 2B ENTRY",
        panels,
        columns=2,
        panel_size=(640, 360),
    )


def build_mobile_sheet(mobile_root: Path, destination: Path) -> list[dict[str, Any]]:
    frames = (126, 144, 196, 250, 270)
    viewports = (
        ((390, 844), (0.54, 0.5), "390×844"),
        ((360, 800), (0.54, 0.5), "360×800"),
        ((320, 800), (0.55, 0.5), "320×800"),
        ((844, 390), (0.53, 0.48), "844×390 LANDSCAPE"),
    )
    records: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="phase3r-mobile-native-sheets-") as temporary_text:
        temporary = Path(temporary_text)
        sections: list[Path] = []
        for index, (viewport, center, label) in enumerate(viewports, 1):
            panels: list[base.Panel] = []
            for frame in frames:
                with Image.open(frame_path(mobile_root, "mobile", frame)) as image:
                    extraction = base.cover(image, viewport, center)
                panels.append(
                    base.Panel(
                        extraction,
                        f"{label} · F{frame:03d} · P{normalized_progress(frame):.4f}",
                    )
                )
                records.append(
                    {
                        "frame": frame,
                        "normalizedProgress": normalized_progress(frame),
                        "inspectionViewport": {"width": viewport[0], "height": viewport[1]},
                        "acceptedCentering": {"x": center[0], "y": center[1]},
                        "renderedAtNativeViewportDetail": True,
                        "source": "authored 720×1280 mobile production frame",
                    }
                )
            section = temporary / f"section-{index}.png"
            base.compose_sheet(
                section,
                f"PHASE 3-R · MOBILE CRT · {label}",
                "F126 line · F144 field · F196 content · F250 receding texture · F270 handoff",
                panels,
                columns=5,
                panel_size=viewport,
            )
            sections.append(section)
        stack_images(sections, destination)
    return records


def decode_codec_section(
    ffmpeg: Path,
    repository: Path,
    root: Path,
    variant: str,
    candidate_by_id: dict[str, dict[str, Any]],
    destination: Path,
) -> list[dict[str, Any]]:
    h264 = candidate_by_id[f"{variant}-h264"]
    vp9 = candidate_by_id[f"{variant}-vp9"]
    h264_path = repository / h264["repositoryRelativePath"]
    vp9_path = repository / vp9["repositoryRelativePath"]
    records: list[dict[str, Any]] = []
    panels: list[base.Panel] = []
    with tempfile.TemporaryDirectory(prefix=f"phase3r-{variant}-decode-") as temporary_text:
        temporary = Path(temporary_text)
        h264_decoded = base.decode_selected_frames(
            ffmpeg, h264_path, CODEC_RISK_FRAMES, temporary / "h264", "h264"
        )
        vp9_decoded = base.decode_selected_frames(
            ffmpeg, vp9_path, CODEC_RISK_FRAMES, temporary / "vp9", "vp9"
        )
        for index, frame in enumerate(CODEC_RISK_FRAMES):
            with (
                Image.open(frame_path(root, variant, frame)) as source_image,
                Image.open(h264_decoded[index]) as h264_image,
                Image.open(vp9_decoded[index]) as vp9_image,
            ):
                source = source_image.convert("RGB")
                h264_rgb = h264_image.convert("RGB")
                vp9_rgb = vp9_image.convert("RGB")
                h264_metrics = base.pixel_difference_metrics(source, h264_rgb)
                vp9_metrics = base.pixel_difference_metrics(source, vp9_rgb)
                panels.extend(
                    (
                        base.Panel(source.copy(), f"F{frame:03d} · SOURCE PNG"),
                        base.Panel(
                            h264_rgb.copy(),
                            f"F{frame:03d} · H.264 · MAE {h264_metrics['meanAbsoluteError8bit']:.2f}",
                        ),
                        base.Panel(
                            vp9_rgb.copy(),
                            f"F{frame:03d} · VP9 · MAE {vp9_metrics['meanAbsoluteError8bit']:.2f}",
                        ),
                    )
                )
            records.append(
                {
                    "variant": variant,
                    "frame": frame,
                    "normalizedProgress": normalized_progress(frame),
                    "h264": {
                        "candidateSha256": h264["verification"]["sha256"],
                        "decodedFrameSha256": sha256_file(h264_decoded[index]),
                        "metrics": h264_metrics,
                    },
                    "vp9": {
                        "candidateSha256": vp9["verification"]["sha256"],
                        "decodedFrameSha256": sha256_file(vp9_decoded[index]),
                        "metrics": vp9_metrics,
                    },
                }
            )
    if variant == "desktop":
        panel_size = (384, 216)
        title = "PHASE 3-R · DESKTOP CODEC RISK"
    else:
        panel_size = (216, 384)
        title = "PHASE 3-R · MOBILE CODEC RISK"
    base.compose_sheet(
        destination,
        title,
        "Source PNG vs decoded H.264 vs decoded VP9 · line / field / text / flattening / handoff",
        panels,
        columns=3,
        panel_size=panel_size,
    )
    return records


def stack_images(paths: Sequence[Path], destination: Path) -> None:
    images: list[Image.Image] = []
    try:
        for path in paths:
            with Image.open(path) as image:
                images.append(image.convert("RGB").copy())
        gap = 20
        width = max(image.width for image in images)
        height = sum(image.height for image in images) + gap * (len(images) - 1)
        canvas = Image.new("RGB", (width, height), base.BG)
        top = 0
        for image in images:
            left = (width - image.width) // 2
            canvas.paste(image, (left, top))
            top += image.height + gap
        base.atomic_save_png(canvas, destination)
    finally:
        for image in images:
            image.close()


def build_codec_comparison(
    ffmpeg: Path,
    repository: Path,
    desktop_root: Path,
    mobile_root: Path,
    candidates: list[dict[str, Any]],
    destination: Path,
) -> list[dict[str, Any]]:
    by_id = {candidate["id"]: candidate for candidate in candidates}
    with tempfile.TemporaryDirectory(prefix="phase3r-codec-sheet-") as temporary_text:
        temporary = Path(temporary_text)
        desktop_sheet = temporary / "desktop.png"
        mobile_sheet = temporary / "mobile.png"
        records = decode_codec_section(
            ffmpeg, repository, desktop_root, "desktop", by_id, desktop_sheet
        )
        records.extend(
            decode_codec_section(ffmpeg, repository, mobile_root, "mobile", by_id, mobile_sheet)
        )
        stack_images((desktop_sheet, mobile_sheet), destination)
    return records


def copy_full_resolution_stills(
    desktop_root: Path, still_root: Path
) -> list[tuple[Path, int]]:
    still_root.mkdir(parents=True, exist_ok=True)
    outputs: list[tuple[Path, int]] = []
    for frame in FULL_RESOLUTION_FRAMES:
        source = frame_path(desktop_root, "desktop", frame)
        destination = still_root / full_resolution_name(frame)
        temporary = destination.with_name(f"{destination.stem}.phase3r-tmp.png")
        shutil.copyfile(source, temporary)
        os.replace(temporary, destination)
        if sha256_file(source) != sha256_file(destination):
            raise ValueError(f"Full-resolution still copy mismatch at frame {frame}")
        outputs.append((destination, frame))
    return outputs


def encode_review_sequence(
    ffmpeg: Path,
    ffprobe: Path,
    input_root: Path,
    input_pattern: str,
    frame_count: int,
    output: Path,
    size: tuple[int, int],
    crf: int,
) -> dict[str, Any]:
    base.encode_atomic(
        ffmpeg,
        [
            "-framerate",
            str(FPS),
            "-start_number",
            "1",
            "-i",
            str(input_root / input_pattern),
            "-frames:v",
            str(frame_count),
            "-an",
            "-map_metadata",
            "-1",
            *base.h264_arguments(crf, size),
        ],
        output,
    )
    probe = base.probe_media(ffprobe, output)
    if (probe["width"], probe["height"]) != size:
        raise ValueError(f"Review video dimensions mismatch: {output}: {probe}")
    if probe["codec"] != "h264" or probe["audioStreamCount"] != 0:
        raise ValueError(f"Review video codec/audio verification failed: {output}: {probe}")
    if probe["frameCount"] != frame_count:
        raise ValueError(f"Review video frame count mismatch: {output}: {probe}")
    if probe["averageFrameRate"] != "30/1":
        raise ValueError(f"Review video fps mismatch: {output}: {probe}")
    return {**probe, "bytes": output.stat().st_size, "sha256": sha256_file(output)}


def encode_forward_review(
    ffmpeg: Path, ffprobe: Path, desktop_root: Path, output: Path
) -> dict[str, Any]:
    base.encode_atomic(
        ffmpeg,
        [
            *input_sequence_arguments(desktop_root, "desktop"),
            *base.h264_arguments(23, DESKTOP_REVIEW_SIZE),
        ],
        output,
    )
    return base.verify_candidate(ffprobe, output, DESKTOP_REVIEW_SIZE, "h264")


def encode_reverse_review(
    ffmpeg: Path,
    ffprobe: Path,
    source_root: Path,
    variant: str,
    output: Path,
    size: tuple[int, int],
    crf: int,
) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix=f"phase3r-{variant}-reverse-") as temporary_text:
        temporary = Path(temporary_text)
        for output_frame, source_frame in enumerate(
            range(FRAME_END, FRAME_START - 1, -1), start=1
        ):
            base.link_or_copy(
                frame_path(source_root, variant, source_frame),
                temporary / f"reverse-{output_frame:04d}.png",
            )
        return encode_review_sequence(
            ffmpeg,
            ffprobe,
            temporary,
            "reverse-%04d.png",
            FRAME_COUNT,
            output,
            size,
            crf,
        )


def build_scrub_sequence(desktop_root: Path, destination: Path) -> int:
    output_index = 1
    hold = 4
    for label, frames in SCRUB_SEGMENTS:
        for frame in frames:
            annotated = destination / f"annotated-{output_index:04d}.png"
            base.annotate_scrub_frame(
                frame_path(desktop_root, "desktop", frame), annotated, label, frame
            )
            for repetition in range(hold):
                base.link_or_copy(
                    annotated,
                    destination / f"scrub-{(output_index - 1) * hold + repetition + 1:04d}.png",
                )
            output_index += 1
    return (output_index - 1) * hold


def encode_scrub_review(
    ffmpeg: Path, ffprobe: Path, desktop_root: Path, output: Path
) -> tuple[dict[str, Any], int]:
    with tempfile.TemporaryDirectory(prefix="phase3r-scrub-") as temporary_text:
        temporary = Path(temporary_text)
        frame_count = build_scrub_sequence(desktop_root, temporary)
        probe = encode_review_sequence(
            ffmpeg,
            ffprobe,
            temporary,
            "scrub-%04d.png",
            frame_count,
            output,
            DESKTOP_REVIEW_SIZE,
            23,
        )
    return probe, frame_count


def inspect_zip(path: Path) -> dict[str, Any]:
    with zipfile.ZipFile(path, "r") as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Review ZIP contains duplicate paths")
        if len({name.casefold() for name in names}) != len(names):
            raise ValueError("Review ZIP contains case-colliding paths")
        for name in names:
            validate_archive_name(name)
        raw = [name for name in names if RAW_NAME.match(Path(name).name)]
        if raw:
            raise ValueError(f"Raw render frames leaked into review ZIP: {raw[:4]}")
        for member in archive.infolist():
            if member.is_dir():
                continue
            with archive.open(member) as handle:
                while handle.read(1024 * 1024):
                    pass
    return {
        "filename": path.name,
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
        "entryCount": len(names),
        "entries": names,
        "containsRawFrameSequences": False,
        "containsProductionCandidates": any(name.startswith("media/") for name in names),
    }


def validate_archive_name(name: str) -> None:
    if not name or "\\" in name or "\0" in name or re.match(r"^[A-Za-z]:", name):
        raise ValueError(f"Unsafe non-POSIX ZIP path: {name!r}")
    pure = PurePosixPath(name)
    if pure.is_absolute() or any(part in {"", ".", ".."} for part in pure.parts):
        raise ValueError(f"Unsafe traversing ZIP path: {name!r}")
    if pure.as_posix() != name:
        raise ValueError(f"Non-normalized ZIP path: {name!r}")


def validate_archive_files(files: Sequence[tuple[Path, str]]) -> None:
    names: list[str] = []
    for source, arcname in files:
        if not source.is_file():
            raise FileNotFoundError(f"Missing ZIP input: {source}")
        validate_archive_name(arcname)
        names.append(arcname)
    if len(names) != len(set(names)) or len(names) != len({name.casefold() for name in names}):
        raise ValueError("ZIP input inventory contains duplicate/case-colliding paths")


def verify_zip_matches_files(path: Path, files: Sequence[tuple[Path, str]]) -> None:
    expected = {arcname: sha256_file(source) for source, arcname in files}
    with zipfile.ZipFile(path, "r") as archive:
        if set(archive.namelist()) != set(expected):
            raise ValueError("ZIP member inventory differs from selected source files")
        for arcname, expected_hash in expected.items():
            digest = hashlib.sha256()
            with archive.open(arcname, "r") as handle:
                for block in iter(lambda: handle.read(1024 * 1024), b""):
                    digest.update(block)
            if digest.hexdigest() != expected_hash:
                raise ValueError(f"ZIP member hash mismatch: {arcname}")


def resolve_repository_path(
    repository: Path, relative_text: str, allowed_root: Path, label: str
) -> Path:
    if not relative_text or "\\" in relative_text:
        raise ValueError(f"Unsafe {label} repository path: {relative_text!r}")
    pure = PurePosixPath(relative_text)
    if pure.is_absolute() or ".." in pure.parts or pure.as_posix() != relative_text:
        raise ValueError(f"Unsafe {label} repository path: {relative_text!r}")
    resolved = (repository / Path(*pure.parts)).resolve()
    allowed = allowed_root.resolve()
    if resolved != allowed and allowed not in resolved.parents:
        raise ValueError(f"{label} escapes its allowed root: {relative_text!r}")
    return resolved


def verify_tracked_head_file(repository: Path, path: Path, record: dict[str, Any], label: str) -> None:
    relative = path.resolve().relative_to(repository.resolve()).as_posix()
    base.run(["git", "ls-files", "--error-unmatch", "--", relative], cwd=repository)
    blob = git_blob_bytes(repository, "HEAD", relative, label)
    worktree = path.read_bytes()
    if blob != worktree:
        raise ValueError(f"{label} worktree bytes differ from HEAD: {relative}")
    if len(blob) != int(record.get("bytes", -1)) or hashlib.sha256(blob).hexdigest() != str(
        record.get("sha256", "")
    ).lower():
        raise ValueError(f"{label} tracked hash/bytes differ from manifest: {relative}")


def final_push_identity(
    repository: Path, declared_sha: str, package_root: Path
) -> dict[str, Any]:
    tracked_status = base.run(
        ["git", "status", "--porcelain=v1", "--untracked-files=no"], cwd=repository
    ).stdout.strip()
    if tracked_status:
        raise ValueError(f"Finalization requires a clean tracked worktree:\n{tracked_status}")
    relative_package = package_root.relative_to(repository).as_posix()
    untracked = set(
        base.run(
            ["git", "ls-files", "--others", "--exclude-standard", "--", relative_package],
            cwd=repository,
        ).stdout.splitlines()
    )
    untracked.update(
        base.run(
            [
                "git",
                "ls-files",
                "--others",
                "--ignored",
                "--exclude-standard",
                "--",
                relative_package,
            ],
            cwd=repository,
        ).stdout.splitlines()
    )
    if untracked:
        raise ValueError(f"Finalization rejects untracked/ignored package paths: {sorted(untracked)[:20]}")
    branch = base.run(["git", "branch", "--show-current"], cwd=repository).stdout.strip()
    if branch != "feature/phase-3-crt-opening-production":
        raise ValueError(f"Finalization branch drift: {branch!r}")
    head = base.run(["git", "rev-parse", "HEAD"], cwd=repository).stdout.strip().lower()
    if not re.fullmatch(r"[0-9a-f]{40}", declared_sha.lower()) or declared_sha.lower() != head:
        raise ValueError(f"--branch-sha must exactly equal final HEAD {head}")
    upstream_ref = base.run(
        ["git", "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
        cwd=repository,
    ).stdout.strip()
    upstream_sha = base.run(["git", "rev-parse", "@{u}"], cwd=repository).stdout.strip().lower()
    if upstream_sha != head:
        raise ValueError(f"Local upstream {upstream_ref} is {upstream_sha}, not HEAD {head}")
    if "/" not in upstream_ref:
        raise ValueError(f"Cannot resolve upstream remote/branch: {upstream_ref!r}")
    remote, remote_branch = upstream_ref.split("/", 1)
    live = base.run(
        ["git", "ls-remote", "--heads", remote, f"refs/heads/{remote_branch}"],
        cwd=repository,
    ).stdout.strip().splitlines()
    live_shas = {line.split()[0].lower() for line in live if line.split()}
    if live_shas != {head}:
        raise ValueError(
            f"Live remote {remote}/{remote_branch} does not resolve uniquely to HEAD: {sorted(live_shas)}"
        )
    return {
        "branch": branch,
        "finalPushedSha": head,
        "upstreamRef": upstream_ref,
        "upstreamSha": upstream_sha,
        "liveRemote": remote,
        "liveRemoteBranch": remote_branch,
        "liveRemoteSha": head,
        "trackedWorktree": "CLEAN",
        "packageUntrackedPaths": "NONE",
    }


def finalize_external_review(
    repository: Path, review_zip: Path, declared_sha: str
) -> None:
    package_root = repository / "artifacts/original/phase-3-crt-opening"
    review_root = package_root / "review"
    media_root = package_root / "media"
    source_root = package_root / "source"
    manifest_path = package_root / "manifests" / POST_PRODUCTION_FILENAME
    candidate_authority_path = package_root / "manifests" / CANDIDATE_AUTHORITY_FILENAME
    tracked = load_json(manifest_path, "Phase 3-R post-production manifest")
    if tracked.get("schema") != "quantum-hub.phase-3-r-crt-authenticity.post-production.v1":
        raise ValueError("Unexpected tracked Phase 3-R post-production schema")
    ensure_pass(tracked, "Phase 3-R post-production manifest")
    identity = final_push_identity(repository, declared_sha, package_root)
    if tracked.get("repository", {}).get("branch") != identity["branch"]:
        raise ValueError("Tracked packaging branch differs from final branch")
    verify_tracked_head_file(repository, manifest_path, file_record(manifest_path), "post-production manifest")

    candidate_authority_record = tracked.get("candidateAuthority")
    if not isinstance(candidate_authority_record, dict):
        raise ValueError("Tracked post-production manifest lacks candidate authority")
    verify_recorded_file(candidate_authority_path, candidate_authority_record, "candidate authority")
    verify_tracked_head_file(
        repository, candidate_authority_path, candidate_authority_record, "candidate authority"
    )
    candidate_authority_payload = load_json(
        candidate_authority_path, "tracked Phase 3-R candidate authority"
    )
    if (
        candidate_authority_payload.get("schema")
        != "quantum-hub.phase-3-r-crt-authenticity.candidate-authority.v1"
        or candidate_authority_payload.get("status") != "PASS"
        or candidate_authority_payload.get("stage") != "ENCODE_ONLY"
        or candidate_authority_payload.get("sourceAuthority") != tracked.get("sourceAuthority")
        or candidate_authority_payload.get("deliveryCandidates")
        != tracked.get("deliveryCandidates")
    ):
        raise ValueError("Tracked candidate authority does not exactly bind final sources/candidates")
    tracked_source_authority = tracked.get("sourceAuthority")
    if not isinstance(tracked_source_authority, dict) or set(tracked_source_authority) != {
        "acceptedPhase0",
        "acceptedPhase3BeforeRepair",
        "phase3rDerivative",
        "sourceBuild",
        "sourceValidation",
        "phase2bEntryEvidence",
    }:
        raise ValueError("Tracked final source-authority inventory is incomplete")
    for source_id, record in tracked_source_authority.items():
        if not isinstance(record, dict):
            raise ValueError(f"Invalid final source-authority record: {source_id}")
        source_path = resolve_repository_path(
            repository,
            str(record.get("repositoryRelativePath", "")),
            repository,
            f"source authority {source_id}",
        )
        verify_recorded_file(source_path, record, f"source authority {source_id}")
        verify_tracked_head_file(repository, source_path, record, f"source authority {source_id}")
    protocol_sources = tracked.get("protocolSources")
    if not isinstance(protocol_sources, dict) or set(protocol_sources) != set(
        TOOL_SOURCE_FILENAMES
    ):
        raise ValueError("Tracked manifest protocol-source inventory is incomplete")
    if candidate_authority_payload.get("protocolSources") != protocol_sources:
        raise ValueError("Candidate authority protocol-source hashes differ from final manifest")
    expected_renderer_provenance = renderer_launch_provenance(protocol_sources)
    if (
        tracked.get("rendererLaunchProvenance") != expected_renderer_provenance
        or candidate_authority_payload.get("rendererLaunchProvenance")
        != expected_renderer_provenance
    ):
        raise ValueError("Final renderer canonical-AST/current-byte provenance drift")
    if candidate_authority_payload.get("encodingProtocol") != expected_encoding_protocol():
        raise ValueError("Candidate authority final encoding protocol drift")
    tracked_raw = tracked.get("rawProductionSequences")
    if not isinstance(tracked_raw, dict) or tracked_raw.get("committedToGit") is not False:
        raise ValueError("Tracked final raw-sequence authority is incomplete")
    expected_raw_binding = {
        "desktop": raw_sequence_binding(tracked_raw.get("desktop", {})),
        "mobile": raw_sequence_binding(tracked_raw.get("mobile", {})),
    }
    if candidate_authority_payload.get("rawProductionSequences") != expected_raw_binding:
        raise ValueError("Candidate authority raw sequence/render-report binding drift")
    for filename, record in protocol_sources.items():
        if not isinstance(record, dict):
            raise ValueError(f"Invalid protocol-source record: {filename}")
        source_path = resolve_repository_path(
            repository,
            str(record.get("repositoryRelativePath", "")),
            repository if filename == DETERMINISM_VERIFIER_RELATIVE.name else source_root,
            f"protocol source {filename}",
        )
        if source_path.name != filename:
            raise ValueError(f"Protocol-source basename drift: {filename}")
        verify_recorded_file(source_path, record, f"protocol source {filename}")
        verify_tracked_head_file(repository, source_path, record, f"protocol source {filename}")
    packager_record = protocol_sources.get("package_phase3r_media.py")
    if not isinstance(packager_record, dict):
        raise ValueError("Tracked manifest lacks packager authority")
    packager_path = resolve_repository_path(
        repository,
        str(packager_record.get("repositoryRelativePath", "")),
        source_root,
        "packager",
    )
    if packager_path != Path(__file__).resolve():
        raise ValueError("External finalization must use the exact tracked Phase 3-R packager")
    verify_tracked_head_file(repository, packager_path, packager_record, "packager")

    archive_files: list[tuple[Path, str]] = []
    verified_review: list[dict[str, Any]] = []
    expected_review_paths: set[str] = set()
    for record in [*tracked.get("retainedFrozenReview", []), *tracked.get("reviewArtifacts", [])]:
        if not isinstance(record, dict):
            raise ValueError("Invalid tracked review artifact record")
        path = resolve_repository_path(
            repository,
            str(record.get("repositoryRelativePath", "")),
            review_root,
            "review artifact",
        )
        verify_recorded_file(path, record, "review artifact")
        verify_tracked_head_file(repository, path, record, "review artifact")
        relative_review = path.relative_to(review_root).as_posix()
        expected_review_paths.add(relative_review)
        archive_files.append((path, relative_review))
        verified_review.append(record)
    readme_record = tracked.get("reviewReadme")
    if not isinstance(readme_record, dict):
        raise ValueError("Tracked review README record is missing")
    readme_path = resolve_repository_path(
        repository,
        str(readme_record.get("repositoryRelativePath", "")),
        review_root,
        "review README",
    )
    verify_recorded_file(readme_path, readme_record, "review README")
    verify_tracked_head_file(repository, readme_path, readme_record, "review README")
    expected_review_paths.add(readme_path.relative_to(review_root).as_posix())
    actual_review_paths = {
        path.relative_to(review_root).as_posix()
        for path in review_root.rglob("*")
        if path.is_file()
    }
    if actual_review_paths != expected_review_paths:
        raise ValueError("Tracked final review tree does not exactly match its manifest")

    verified_candidates: list[dict[str, Any]] = []
    expected_media: set[str] = set()
    for candidate in tracked.get("deliveryCandidates", []):
        path = resolve_repository_path(
            repository,
            str(candidate.get("repositoryRelativePath", "")),
            media_root,
            "delivery candidate",
        )
        verification = candidate.get("verification", {})
        verify_recorded_file(path, verification, "delivery candidate")
        verify_tracked_head_file(repository, path, verification, "delivery candidate")
        relative_media = path.relative_to(media_root).as_posix()
        expected_media.add(relative_media)
        archive_files.append((path, f"media/{relative_media}"))
        verified_candidates.append(candidate)
    if len(verified_candidates) != 4 or expected_media != set(MEDIA_FILENAMES.values()):
        raise ValueError("Tracked final candidate inventory is not exactly four selected files")
    if candidate_authority_payload.get("candidateInventory") != sorted(
        candidate["repositoryRelativePath"] for candidate in verified_candidates
    ):
        raise ValueError("Candidate-authority final candidate inventory drift")
    actual_media = candidate_media_inventory(media_root)
    if actual_media != expected_media:
        raise ValueError("Final media root differs from the tracked selected inventory")
    footprint = tracked.get("packageFootprint", {})
    if footprint.get("baselineRepairParentPackage") != git_tree_footprint(
        repository, REPAIR_PARENT, package_root.relative_to(repository).as_posix()
    ):
        raise ValueError("Tracked baseline package footprint drift")
    if footprint.get("baselineRepairParentReview") != git_tree_footprint(
        repository, REPAIR_PARENT, review_root.relative_to(repository).as_posix()
    ):
        raise ValueError("Tracked baseline review footprint drift")
    if footprint.get("finalPackage") != filesystem_footprint(package_root):
        raise ValueError("Tracked final package footprint does not match final HEAD worktree")
    if footprint.get("finalReview") != filesystem_footprint(review_root):
        raise ValueError("Tracked final review footprint does not match final HEAD worktree")

    external_manifest_path = review_zip.with_name(f"{review_zip.stem}.manifest.json")
    sidecar = review_zip.with_suffix(review_zip.suffix + ".sha256")
    for output, label in (
        (external_manifest_path, "external review manifest"),
        (sidecar, "external review sidecar"),
    ):
        base.ensure_outside_repository(output, repository, label)
    external_manifest = {
        "schema": "quantum-hub.phase-3-r-crt-authenticity.external-review.v1",
        "status": "PASS",
        "mode": "FINALIZE_EXTERNAL_ONLY",
        "trackedFilesWritten": [],
        "finalPush": identity,
        "trackedPostProductionManifest": {
            "repositoryRelativePath": manifest_path.relative_to(repository).as_posix(),
            **file_record(manifest_path),
        },
        "candidateAuthority": candidate_authority_record,
        "timeline": tracked.get("timeline"),
        "sourceAuthority": tracked.get("sourceAuthority"),
        "packageFootprint": tracked.get("packageFootprint"),
        "deliveryCandidates": verified_candidates,
        "reviewArtifacts": verified_review,
        "trackedReviewReadme": readme_record,
        "zipPolicy": {
            "containsRawFrameSequences": False,
            "containsFourProductionCandidates": True,
            "containsActualBrowserQaAndMediaLabRecording": True,
            "posixTraversalSafePaths": True,
            "maximumBytes": MAX_REVIEW_ZIP_BYTES,
        },
    }
    atomic_json(external_manifest_path, external_manifest)

    external_readme = (
        "# Phase 3-R CRT Authenticity — Final Pushed Human Review\n\n"
        f"Branch: `{identity['branch']}`\n\n"
        f"Final pushed SHA: `{identity['finalPushedSha']}`\n\n"
        "This external-only package contains the four selected production candidates, "
        "actual headed browser/media-lab evidence, compact visual evidence, and no raw frames. "
        "No tracked file was changed during finalization. Phase 4 remains unauthorized.\n\n"
        "---\n\n"
        + readme_path.read_text(encoding="utf-8")
    )
    with tempfile.TemporaryDirectory(prefix="phase3r-final-external-") as temporary_text:
        temporary = Path(temporary_text)
        external_readme_path = temporary / "README.md"
        atomic_text(external_readme_path, external_readme)
        zip_files = [
            *archive_files,
            (external_readme_path, "README.md"),
            (external_manifest_path, "phase-3-r-review-manifest.json"),
            (manifest_path, f"manifests/{POST_PRODUCTION_FILENAME}"),
            (candidate_authority_path, f"manifests/{CANDIDATE_AUTHORITY_FILENAME}"),
        ]
        validate_archive_files(zip_files)
        base.deterministic_zip(review_zip, zip_files)
        verify_zip_matches_files(review_zip, zip_files)
    zip_record = inspect_zip(review_zip)
    if zip_record["bytes"] > MAX_REVIEW_ZIP_BYTES:
        raise ValueError(f"Final external review ZIP exceeds 64 MiB: {zip_record['bytes']}")
    atomic_text(sidecar, f"{zip_record['sha256']}  {review_zip.name}\n")
    print(
        json.dumps(
            {
                "status": "PASS",
                "mode": "FINALIZE_EXTERNAL_ONLY",
                "finalPushedSha": identity["finalPushedSha"],
                "trackedFilesWritten": [],
                "externalReviewManifest": {
                    "path": str(external_manifest_path),
                    **file_record(external_manifest_path),
                },
                "externalReviewZip": {"path": str(review_zip), **zip_record},
                "sidecar": str(sidecar),
            },
            indent=2,
        )
    )


def parse_args() -> argparse.Namespace:
    default_repository = Path(__file__).resolve().parents[4]
    parser = argparse.ArgumentParser(
        description="Encode Phase 3-R candidates and build compact CRT-authenticity evidence."
    )
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument(
        "--encode-only",
        action="store_true",
        help="Stage 1: encode four candidates and write the tracked candidate authority only.",
    )
    modes.add_argument(
        "--finalize-external-only",
        action="store_true",
        help="Stage 3: after commit/push, rebuild only external ZIP/manifest/sidecar.",
    )
    parser.add_argument("--desktop-frames", type=Path)
    parser.add_argument("--mobile-frames", type=Path)
    parser.add_argument("--ffmpeg", type=Path)
    parser.add_argument("--ffprobe", type=Path)
    parser.add_argument("--repo-root", type=Path, default=default_repository)
    parser.add_argument("--review-zip", type=Path)
    parser.add_argument("--media-qa-report", type=Path)
    parser.add_argument("--media-lab-recording", type=Path)
    parser.add_argument("--render-determinism-report", type=Path)
    parser.add_argument(
        "--candidate-authority-sha256",
        help="Stage-1 candidate-authority SHA-256 required for full safe reuse.",
    )
    parser.add_argument("--branch-sha")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    repository = args.repo_root.resolve()
    if not (repository / ".git").exists():
        raise ValueError(f"Not a Git worktree root: {repository}")
    package_root = repository / "artifacts/original/phase-3-crt-opening"
    media_root = package_root / "media"
    review_root = package_root / "review"
    still_root = review_root / "full-resolution-stills"
    manifest_path = package_root / "manifests" / POST_PRODUCTION_FILENAME
    candidate_authority_path = package_root / "manifests" / CANDIDATE_AUTHORITY_FILENAME
    readme_path = review_root / REVIEW_FILENAMES["readme"]

    if args.finalize_external_only:
        forbidden = {
            "--desktop-frames": args.desktop_frames,
            "--mobile-frames": args.mobile_frames,
            "--ffmpeg": args.ffmpeg,
            "--ffprobe": args.ffprobe,
            "--media-qa-report": args.media_qa_report,
            "--media-lab-recording": args.media_lab_recording,
            "--render-determinism-report": args.render_determinism_report,
            "--candidate-authority-sha256": args.candidate_authority_sha256,
        }
        supplied = [name for name, value in forbidden.items() if value is not None]
        if supplied:
            raise ValueError(f"External-only finalization rejects full-mode inputs: {supplied}")
        if args.review_zip is None or args.branch_sha is None:
            raise ValueError("--finalize-external-only requires --review-zip and --branch-sha")
        review_zip = args.review_zip.resolve()
        base.ensure_outside_repository(review_zip, repository, "external review ZIP")
        if review_zip.name != "phase-3-r-crt-authenticity-human-review.zip":
            raise ValueError("Unexpected Phase 3-R review ZIP filename")
        finalize_external_review(repository, review_zip, args.branch_sha)
        return

    required_common = {
        "--desktop-frames": args.desktop_frames,
        "--mobile-frames": args.mobile_frames,
        "--ffmpeg": args.ffmpeg,
        "--ffprobe": args.ffprobe,
    }
    missing_common = [name for name, value in required_common.items() if value is None]
    if missing_common:
        raise ValueError(f"Encode/full packaging requires: {missing_common}")
    if args.branch_sha is not None:
        raise ValueError("--branch-sha is valid only with --finalize-external-only")
    desktop_root = args.desktop_frames.resolve()
    mobile_root = args.mobile_frames.resolve()
    ffmpeg = args.ffmpeg.resolve()
    ffprobe = args.ffprobe.resolve()
    for path, label in (
        (desktop_root, "desktop raw-frame root"),
        (mobile_root, "mobile raw-frame root"),
    ):
        base.ensure_outside_repository(path, repository, label)
    for binary, label in ((ffmpeg, "ffmpeg"), (ffprobe, "ffprobe")):
        if not binary.is_file():
            raise FileNotFoundError(f"Missing {label}: {binary}")

    if args.encode_only:
        if any(
            value is not None
            for value in (
                args.review_zip,
                args.media_qa_report,
                args.media_lab_recording,
                args.render_determinism_report,
                args.candidate_authority_sha256,
            )
        ):
            raise ValueError(
                "--encode-only rejects review/QA/determinism/candidate-authority inputs"
            )
    else:
        required_full = {
            "--review-zip": args.review_zip,
            "--media-qa-report": args.media_qa_report,
            "--media-lab-recording": args.media_lab_recording,
            "--render-determinism-report": args.render_determinism_report,
            "--candidate-authority-sha256": args.candidate_authority_sha256,
        }
        missing_full = [name for name, value in required_full.items() if value is None]
        if missing_full:
            raise ValueError(f"Final full packaging requires: {missing_full}")
        review_zip = args.review_zip.resolve()
        base.ensure_outside_repository(review_zip, repository, "external review ZIP")
        if review_zip.name != "phase-3-r-crt-authenticity-human-review.zip":
            raise ValueError("Unexpected Phase 3-R review ZIP filename")

    leaked_raw = [
        path.relative_to(repository).as_posix()
        for path in package_root.rglob("*.png")
        if RAW_NAME.match(path.name)
    ]
    if leaked_raw:
        raise ValueError(f"Raw Phase 3-R render frames already exist inside Git scope: {leaked_raw[:8]}")

    identity = repository_identity(repository)
    authority = source_authority(repository)
    tools = tool_source_authority(repository)
    desktop_source = validate_sequence(desktop_root, "desktop", DESKTOP_SIZE)
    mobile_source = validate_sequence(mobile_root, "mobile", MOBILE_SIZE)
    if args.encode_only:
        candidates = encode_candidates(
            ffmpeg,
            ffprobe,
            repository,
            desktop_root,
            mobile_root,
            desktop_source,
            mobile_source,
            media_root,
            False,
        )
        actual_media_inventory = candidate_media_inventory(media_root)
        if actual_media_inventory != set(MEDIA_FILENAMES.values()):
            raise ValueError(
                "Encode-only candidate directory is not the exact four-file inventory: "
                f"{sorted(actual_media_inventory)}"
            )
        candidate_manifest = write_candidate_authority(
            repository,
            candidate_authority_path,
            identity,
            authority,
            tools,
            desktop_source,
            mobile_source,
            candidates,
            ffmpeg,
            ffprobe,
        )
        print(
            json.dumps(
                {
                    "status": "PASS",
                    "mode": "ENCODE_ONLY",
                    "candidateAuthority": {
                        "path": str(candidate_authority_path),
                        **file_record(candidate_authority_path),
                    },
                    "candidateHashes": {
                        candidate["id"]: candidate["verification"]["sha256"]
                        for candidate in candidate_manifest["deliveryCandidates"]
                    },
                },
                indent=2,
            )
        )
        return

    candidates, candidate_authority_record = verify_candidate_authority(
        repository,
        candidate_authority_path,
        args.candidate_authority_sha256,
        authority,
        tools,
        desktop_source,
        mobile_source,
        ffmpeg,
        ffprobe,
        media_root,
    )
    before_images, before_authority = old_before_frames(repository)
    retained_frozen = validate_retained_frozen_review(repository, review_root)
    qa_input = args.media_qa_report.resolve()
    media_lab_input = args.media_lab_recording.resolve()
    determinism_input = args.render_determinism_report.resolve()
    for external_input, label in (
        (qa_input, "explicit media QA report"),
        (media_lab_input, "explicit media-lab recording"),
        (determinism_input, "explicit render-determinism report"),
    ):
        base.ensure_outside_repository(external_input, repository, label)
    qa_payload, media_lab_source_record, media_lab_probe = validate_media_qa(
        qa_input, media_lab_input, candidates, ffprobe
    )
    determinism_payload = validate_render_determinism_report(
        determinism_input,
        repository,
        authority,
        tools,
        desktop_root,
        mobile_root,
    )

    evidence: list[dict[str, Any]] = []
    zip_files: list[tuple[Path, str]] = []

    def register_image(
        path: Path, role: str, variant: str, frames: Sequence[int], **extra: Any
    ) -> None:
        evidence.append(
            {
                **image_record(path),
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
        zip_files.append((path, path.relative_to(review_root).as_posix()))

    def register_video(
        path: Path, role: str, variant: str, source: Any, probe: dict[str, Any]
    ) -> None:
        evidence.append(
            {
                **file_record(path),
                "repositoryRelativePath": path.relative_to(repository).as_posix(),
                "role": role,
                "sourceVariant": variant,
                "source": source,
                "mediaProbe": probe,
            }
        )
        zip_files.append((path, path.relative_to(review_root).as_posix()))

    qa_review_path = review_root / REVIEW_FILENAMES["mediaQa"]
    media_lab_review_path = review_root / REVIEW_FILENAMES["mediaLab"]
    determinism_review_path = review_root / REVIEW_FILENAMES["determinism"]
    atomic_copy(qa_input, qa_review_path)
    atomic_copy(media_lab_input, media_lab_review_path)
    atomic_copy(determinism_input, determinism_review_path)
    if (
        qa_review_path.stat().st_size != qa_input.stat().st_size
        or sha256_file(qa_review_path) != sha256_file(qa_input)
    ):
        raise ValueError("Tracked media QA copy differs from explicit QA input")
    if (
        media_lab_review_path.stat().st_size != media_lab_source_record["bytes"]
        or sha256_file(media_lab_review_path) != media_lab_source_record["sha256"]
    ):
        raise ValueError("Tracked media-lab copy differs from explicit recording input")
    if (
        determinism_review_path.stat().st_size != determinism_input.stat().st_size
        or sha256_file(determinism_review_path) != sha256_file(determinism_input)
    ):
        raise ValueError("Tracked render-determinism copy differs from explicit report input")
    evidence.append(
        {
            **file_record(qa_review_path),
            "repositoryRelativePath": qa_review_path.relative_to(repository).as_posix(),
            "role": "actual headed Chromium seek/scrub QA report",
            "evidenceClass": "ACTUAL_BROWSER_EXECUTION_NOT_SIMULATION",
            "schema": qa_payload["schema"],
            "summary": qa_payload["summary"],
            "candidateHashes": {
                candidate["id"]: candidate["verification"]["sha256"]
                for candidate in candidates
            },
        }
    )
    zip_files.append((qa_review_path, qa_review_path.relative_to(review_root).as_posix()))
    evidence.append(
        {
            **file_record(determinism_review_path),
            "repositoryRelativePath": determinism_review_path.relative_to(repository).as_posix(),
            "role": "fresh-process sparse production-render determinism report",
            "evidenceClass": "ACTUAL_FRESH_BLENDER_PROCESS_CHECKPOINT_COMPARISON",
            "schema": determinism_payload["schema"],
            "status": determinism_payload["status"],
            "checkpointFrames": [1, 126, 144, 162, 196, 250, 262, 270],
            "variants": ["desktop", "mobile"],
        }
    )
    zip_files.append(
        (determinism_review_path, determinism_review_path.relative_to(review_root).as_posix())
    )
    register_video(
        media_lab_review_path,
        "actual headed isolated media-lab interaction recording",
        "isolated-media-lab",
        {
            "captureAuthority": "QA_REPORT_BOUND_HEADED_BROWSER_RECORDING",
            "synthetic": False,
            "sha256BoundByQaReport": media_lab_source_record["sha256"],
        },
        {**media_lab_probe, **media_lab_source_record},
    )

    startup_path = review_root / REVIEW_FILENAMES["startup"]
    build_startup_sheet(desktop_root, startup_path)
    register_image(
        startup_path,
        "nine-state full-scale CRT phosphor startup review",
        "desktop",
        STARTUP_FRAMES,
    )

    before_after_path = review_root / REVIEW_FILENAMES["beforeAfter"]
    build_before_after_sheet(before_images, desktop_root, before_after_path)
    for image in before_images.values():
        image.close()
    register_image(
        before_after_path,
        "historical Phase 3 versus repaired Phase 3-R CRT comparison",
        "desktop",
        BEFORE_AFTER_FRAMES,
        beforeAuthority=before_authority,
    )

    handoff_path = review_root / REVIEW_FILENAMES["handoff"]
    build_handoff_sheet(desktop_root, repository / PHASE2B_ENTRY_RELATIVE, handoff_path)
    register_image(
        handoff_path,
        "progressive physical-CRT to frozen Phase 2B ENTRY comparison",
        "desktop-and-phase2b",
        HANDOFF_FRAMES,
        phase2bReferenceSha256=PHASE2B_ENTRY_SHA256,
    )

    mobile_path = review_root / REVIEW_FILENAMES["mobile"]
    mobile_viewports = build_mobile_sheet(mobile_root, mobile_path)
    register_image(
        mobile_path,
        "mobile startup, content, moire, landscape, and portal review",
        "mobile",
        tuple(record["frame"] for record in mobile_viewports),
        viewportInspections=mobile_viewports,
    )

    codec_path = review_root / REVIEW_FILENAMES["codec"]
    codec_metrics = build_codec_comparison(
        ffmpeg,
        repository,
        desktop_root,
        mobile_root,
        candidates,
        codec_path,
    )
    register_image(
        codec_path,
        "decoded H.264/VP9 risk comparison for desktop and mobile",
        "desktop-and-mobile",
        CODEC_RISK_FRAMES,
        decodedRiskMetrics=codec_metrics,
        humanInspectionRequired=(
            "scanline shimmer, crawling, moire, ringing, dark banding, and camera-motion stability"
        ),
    )

    for path, frame in copy_full_resolution_stills(desktop_root, still_root):
        register_image(path, "repaired full-resolution desktop still", "desktop", (frame,))

    forward_path = review_root / REVIEW_FILENAMES["forward"]
    forward_probe = encode_forward_review(ffmpeg, ffprobe, desktop_root, forward_path)
    register_video(
        forward_path,
        "complete compact desktop forward review",
        "desktop",
        {"order": "forward", "frameStart": 1, "frameEnd": 270},
        forward_probe,
    )

    reverse_path = review_root / REVIEW_FILENAMES["reverse"]
    reverse_probe = encode_reverse_review(
        ffmpeg,
        ffprobe,
        desktop_root,
        "desktop",
        reverse_path,
        DESKTOP_REVIEW_SIZE,
        24,
    )
    register_video(
        reverse_path,
        "complete compact desktop reverse-authenticity review",
        "desktop",
        {"order": "reverse", "frameStart": 270, "frameEnd": 1},
        reverse_probe,
    )

    scrub_path = review_root / REVIEW_FILENAMES["scrub"]
    scrub_probe, scrub_frame_count = encode_scrub_review(
        ffmpeg, ffprobe, desktop_root, scrub_path
    )
    register_video(
        scrub_path,
        "synthetic deterministic scrub simulation — not browser QA evidence",
        "desktop",
        {
            "evidenceClass": "SYNTHETIC_TIMELINE_SIMULATION_NOT_BROWSER_EXECUTION",
            "frameCount": scrub_frame_count,
            "holdFramesPerSeek": 4,
            "segments": [
                {
                    "label": label,
                    "frames": list(frames),
                    "normalizedProgress": [normalized_progress(frame) for frame in frames],
                }
                for label, frames in SCRUB_SEGMENTS
            ],
        },
        scrub_probe,
    )

    mobile_reverse_path = review_root / REVIEW_FILENAMES["mobileReverse"]
    mobile_reverse_probe = encode_reverse_review(
        ffmpeg,
        ffprobe,
        mobile_root,
        "mobile",
        mobile_reverse_path,
        MOBILE_REVERSE_SIZE,
        25,
    )
    register_video(
        mobile_reverse_path,
        "compact mobile reverse-authenticity / moire review",
        "mobile",
        {"order": "reverse", "frameStart": 270, "frameEnd": 1},
        mobile_reverse_probe,
    )

    readme = f"""# Phase 3-R CRT Authenticity — Human Review

This compact package is the narrow screen-only repair. The accepted proving
field, cable conduction, CRT object, camera path, portal geometry, mobile
composition, reduced-motion art direction, and Phase 2B runtime remain frozen.
It contains no raw PNG sequence and does not begin Phase 4.

## Review order

1. `{REVIEW_FILENAMES['startup']}` — inspect F126 as physical neutral phosphor and F144 as a filled picture field.
2. `{REVIEW_FILENAMES['beforeAfter']}` — direct old/repaired comparison at F126, F144, F196, F250, and F270.
3. `{REVIEW_FILENAMES['handoff']}` — F250/F262/F270 against the frozen Phase 2B ENTRY target.
4. `{REVIEW_FILENAMES['mobile']}` — 390, 360, 320, and 844×390 startup/portal risk views.
5. `{REVIEW_FILENAMES['codec']}` — source PNG against decoded H.264 and VP9 at five compression-sensitive states.
6. `full-resolution-stills/` — all twelve mandatory 1920×1080 repaired frames.
7. `{REVIEW_FILENAMES['forward']}` and `{REVIEW_FILENAMES['reverse']}` — complete 9-second desktop traversal in both directions.
8. `{REVIEW_FILENAMES['mediaQa']}` and `{REVIEW_FILENAMES['mediaLab']}` — actual complete Chromium QA and its hash-bound headed interaction recording.
9. `{REVIEW_FILENAMES['determinism']}` — fresh-process desktop/mobile production checkpoint determinism.
10. `{REVIEW_FILENAMES['scrub']}` — synthetic deterministic timeline simulation only; it is not browser evidence.
11. `{REVIEW_FILENAMES['mobileReverse']}` — compact portrait reverse/moiré inspection.

## Authority

- Repair parent: `{REPAIR_PARENT}`
- Repaired derivative SHA-256: `{authority['phase3rDerivative']['sha256']}`
- Timeline: 270 frames, 30 fps, 9 seconds; no cue frames changed.
- Delivery: silent H.264 and VP9, YUV 4:2:0, fixed 12-frame / 400 ms keyframe cadence.
- The external ZIP includes all four selected production candidates as actual codec motion evidence.
- Exact hashes, sizes, probes, decoded-frame metrics, raw-sequence identities, and evidence provenance are in `phase-3-r-review-manifest.json`.

## Human gates

At normal size, judge picture field before scan structure. Reject visible bar
stacks, countable scanlines, pasted-on text, codec shimmer/moiré, raster popping
in reverse, or a late handoff that still reads as an obvious CRT shader.
"""
    atomic_text(readme_path, readme)

    selected_media = candidate_media_inventory(media_root)
    if selected_media != set(MEDIA_FILENAMES.values()):
        raise ValueError(
            "Phase 3 media root is not the exact four-candidate inventory: "
            f"{sorted(selected_media)}"
        )
    expected_final_review = {
        (repository / record["repositoryRelativePath"]).relative_to(review_root).as_posix()
        for record in evidence
    } | set(RETAINED_FROZEN_REVIEW) | {readme_path.relative_to(review_root).as_posix()}
    actual_final_review = {
        path.relative_to(review_root).as_posix()
        for path in review_root.rglob("*")
        if (path.is_file() or path.is_symlink())
    }
    if actual_final_review != expected_final_review:
        raise ValueError(
            "Final review tree must contain only retained conduction/posters, compact "
            "Phase 3-R evidence, and README; remove stale Phase 3 CRT evidence first: "
            f"missing={sorted(expected_final_review - actual_final_review)}, "
            f"stale={sorted(actual_final_review - expected_final_review)}"
        )

    generated_evidence_bytes = sum(record["bytes"] for record in evidence)
    package_relative = package_root.relative_to(repository).as_posix()
    review_relative = review_root.relative_to(repository).as_posix()
    baseline_package = git_tree_footprint(repository, REPAIR_PARENT, package_relative)
    baseline_review = git_tree_footprint(repository, REPAIR_PARENT, review_relative)
    final_review = filesystem_footprint(review_root)
    manifest = {
        "schema": "quantum-hub.phase-3-r-crt-authenticity.post-production.v1",
        "status": "PASS",
        "scope": "SCREEN_ONLY_CRT_AUTHENTICITY_REPAIR",
        "repository": identity,
        "timeline": {
            "changed": False,
            "frameStart": FRAME_START,
            "frameEnd": FRAME_END,
            "frameCount": FRAME_COUNT,
            "fps": FPS,
            "durationSeconds": DURATION_SECONDS,
            "normalizedProgressFormula": "(frame - 1) / 269",
        },
        "sourceAuthority": source_binding(authority),
        "sourceBuildRepair": authority["sourceBuildPayload"].get("repair"),
        "protocolSources": tools,
        "rendererLaunchProvenance": renderer_launch_provenance(tools),
        "candidateAuthority": candidate_authority_record,
        "historicalBeforeAuthority": before_authority,
        "retainedFrozenReview": retained_frozen,
        "rawProductionSequences": {
            "desktop": desktop_source,
            "mobile": mobile_source,
            "committedToGit": False,
        },
        "toolchain": {
            "ffmpeg": base.ffmpeg_version(ffmpeg),
            "ffprobe": base.ffmpeg_version(ffprobe),
            "pillow": Image.__version__,
            "reviewTypography": base.font_provenance(),
        },
        "deliveryCandidates": candidates,
        "deliveryPolicy": {
            "integrationTarget": "ISOLATED_PHASE_3_PACKAGE_ONLY",
            "distIsolationVerification": "REQUIRED_SEPARATE_PRODUCTION_QA",
            "audioStreams": 0,
            "gopFrames": GOP,
            "gopMilliseconds": 400,
            "browserSeekAndScrubQa": "COMPLETE_PASS_EXPLICIT_HASH_BOUND_REPORT",
            "browserQaReportSha256": sha256_file(qa_review_path),
            "mediaLabRecordingSha256": sha256_file(media_lab_review_path),
            "renderDeterminism": "COMPLETE_PASS_EXPLICIT_SEQUENCE_BOUND_REPORT",
            "renderDeterminismReportSha256": sha256_file(determinism_review_path),
            "humanCodecArtifactReviewRequired": True,
        },
        "reviewArtifacts": evidence,
        "reviewReadme": {
            **file_record(readme_path),
            "repositoryRelativePath": readme_path.relative_to(repository).as_posix(),
        },
        "compactEvidence": {
            "artifactCountExcludingReadmeAndManifest": len(evidence),
            "artifactBytesExcludingReadmeAndManifest": generated_evidence_bytes,
            "rawFramesIncluded": False,
            "productionCandidatesIncludedInExternalZip": True,
            "actualBrowserQaIncluded": True,
            "syntheticScrubClearlyLabeled": True,
        },
        "externalReviewPackage": {
            "filename": review_zip.name,
            "portablePathsOnly": True,
            "containsRawFrameSequences": False,
            "containsProductionCandidates": True,
            "containsActualBrowserQaAndRecording": True,
            "candidateHashesRecordedInManifest": True,
            "maximumBytes": MAX_REVIEW_ZIP_BYTES,
        },
        "packageFootprint": {
            "baselineRepairParentPackage": baseline_package,
            "baselineRepairParentReview": baseline_review,
            "finalPackage": {"fileCount": 0, "bytes": 0},
            "finalReview": final_review,
            "packageDeltaBytes": 0,
            "reviewDeltaBytes": final_review["bytes"] - baseline_review["bytes"],
        },
        "humanReview": {
            "automatedPackagingPassIsNotVisualAcceptance": True,
            "mandatoryFrames": {
                "oldCrtPhosphor": 126,
                "expandingPictureField": 144,
                "integratedQuantumContent": [182, 196],
                "textureReceding": 250,
                "nearlyDigitalHandoff": 270,
            },
        },
    }
    for _attempt in range(10):
        atomic_json(manifest_path, manifest)
        final_package = filesystem_footprint(package_root)
        recorded = manifest["packageFootprint"]["finalPackage"]
        expected_delta = final_package["bytes"] - baseline_package["bytes"]
        if recorded == final_package and manifest["packageFootprint"]["packageDeltaBytes"] == expected_delta:
            break
        manifest["packageFootprint"]["finalPackage"] = final_package
        manifest["packageFootprint"]["packageDeltaBytes"] = expected_delta
    else:
        raise RuntimeError("Post-production manifest package-footprint fixed point did not stabilize")

    zip_files.append((readme_path, "README.md"))
    zip_files.append((manifest_path, "phase-3-r-review-manifest.json"))
    zip_files.append(
        (candidate_authority_path, f"manifests/{CANDIDATE_AUTHORITY_FILENAME}")
    )
    for record in retained_frozen:
        retained_path = repository / record["repositoryRelativePath"]
        zip_files.append((retained_path, retained_path.relative_to(review_root).as_posix()))
    for candidate in candidates:
        candidate_path = repository / candidate["repositoryRelativePath"]
        zip_files.append((candidate_path, f"media/{candidate_path.name}"))
    validate_archive_files(zip_files)
    base.deterministic_zip(review_zip, zip_files)
    verify_zip_matches_files(review_zip, zip_files)
    zip_record = inspect_zip(review_zip)
    if zip_record["bytes"] > MAX_REVIEW_ZIP_BYTES:
        raise ValueError(
            "Review ZIP exceeds the fixed 64 MiB transfer gate: "
            f"{zip_record['bytes']} bytes"
        )
    expected_zip_entries = len(evidence) + 2 + 1 + len(retained_frozen) + len(candidates)
    if zip_record["entryCount"] != expected_zip_entries:
        raise ValueError(
            f"Review ZIP inventory mismatch: {zip_record['entryCount']} != {expected_zip_entries}"
        )
    expected_entry_names = {arcname for _path, arcname in zip_files}
    if set(zip_record["entries"]) != expected_entry_names:
        raise ValueError("Review ZIP paths do not match the compact evidence selection")
    sidecar = review_zip.with_suffix(review_zip.suffix + ".sha256")
    atomic_text(sidecar, f"{zip_record['sha256']}  {review_zip.name}\n")

    print(
        json.dumps(
            {
                "status": "PASS",
                "manifest": str(manifest_path),
                "candidates": [
                    {
                        "id": candidate["id"],
                        "path": str(repository / candidate["repositoryRelativePath"]),
                        "bytes": candidate["verification"]["bytes"],
                        "sha256": candidate["verification"]["sha256"],
                    }
                    for candidate in candidates
                ],
                "reviewArtifactCount": len(evidence),
                "reviewArtifactBytes": generated_evidence_bytes,
                "externalReviewZip": {**zip_record, "path": str(review_zip)},
                "sidecar": str(sidecar),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
