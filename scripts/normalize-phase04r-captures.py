"""Normalize and verify Phase 0.4R repository-native browser captures.

The exact-viewport runner may scale only its outer evidence frame so wide CSS
viewports fit the browser raster. The iframe retains the requested CSS layout.
This script crops the measured outer frame and uses Lanczos only when the
evidence scale is below 1, then binds raw/normalized hashes and crop lineage to
the final 46-case matrix. It cannot run before the frozen CRT scene release.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import tempfile
from pathlib import Path
from typing import Any

try:
    from PIL import Image
except ImportError as error:  # pragma: no cover - environment diagnostic
    raise SystemExit(
        "Pillow is required by this evidence-only normalizer; no application runtime dependency was added."
    ) from error


ROOT = Path(__file__).resolve().parents[1]
PLAN_PATH = ROOT / "prototypes/phase-0-4r-crt-portal-qa/capture-plan.json"
EVIDENCE_PATH = ROOT / "artifacts/evidence/phase-0-4r-crt-television"
MATRIX_PATH = EVIDENCE_PATH / "browser-matrix-report.json"
CHECKPOINT_PATH = EVIDENCE_PATH / "capture-checkpoint.json"
PLAN_SNAPSHOT_PATH = EVIDENCE_PATH / "capture-plan-authority.json"
PLAN_SCHEMA = "quantum-hub.phase-0-4r-crt-television.typography-capture-plan.v1"
MATRIX_SCHEMA = "quantum-hub.phase-0-4r-crt-television.typography-collision-matrix.v1"
CHECKPOINT_SCHEMA = "quantum-hub.phase-0-4r-crt-television.capture-checkpoint.v1"


def read_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise SystemExit(f"Required input is missing: {relative(path)}") from error
    except json.JSONDecodeError as error:
        raise SystemExit(f"Invalid JSON in {relative(path)}: {error}") from error


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def repo_path(value: str) -> Path:
    normalized = str(value).replace("\\", "/")
    if not normalized or normalized.startswith("/") or "../" in normalized:
        raise SystemExit(f"Unsafe repository-relative path: {value}")
    result = (ROOT / normalized).resolve()
    try:
        result.relative_to(ROOT)
    except ValueError as error:
        raise SystemExit(f"Path escapes repository root: {value}") from error
    return result


def atomic_json(path: Path, value: dict[str, Any]) -> None:
    serialized = json.dumps(value, indent=2, ensure_ascii=False) + "\n"
    if re.search(r'(?:^|["\'\s])[A-Za-z]:(?:\\\\|/)|(?:^|["\'\s])/(?:Users|home)/', serialized):
        raise SystemExit("Refusing to write evidence containing an absolute private path")
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as destination:
            destination.write(serialized)
            destination.flush()
            os.fsync(destination.fileno())
        temporary.replace(path)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise


def expand_required_captures(plan: dict[str, Any]) -> list[dict[str, Any]]:
    viewports = {item["id"]: item for item in plan.get("viewports", [])}
    required: list[dict[str, Any]] = []
    all_ids = list(viewports)
    for template in plan.get("caseTemplates", []):
        viewport_ids = all_ids if template.get("viewportIds") == "all" else template.get("viewportIds", [])
        capture_ids = all_ids if template.get("captureViewportIds") == "all" else template.get("captureViewportIds", [])
        for viewport_id in viewport_ids:
            if viewport_id in set(capture_ids):
                required.append({"id": f'{template["idPrefix"]}--{viewport_id}', "viewport": viewports[viewport_id]})
    return required


def validate_authority(plan: dict[str, Any], matrix: dict[str, Any], *, check_only: bool) -> None:
    if plan.get("schema") != PLAN_SCHEMA:
        raise SystemExit(f"Unexpected Phase 0.4R plan schema: {plan.get('schema')}")
    if plan.get("repairPhase") != "Phase 0.4R" or plan.get("repairMode") != "additive-source-rebind":
        raise SystemExit("Phase 0.4R normalization requires the additive source-rebind authority.")
    if plan.get("status") not in {"ready-for-capture", "complete"}:
        raise SystemExit("Phase 0.4R normalization is locked until the repair plan is explicitly released.")
    freeze = plan.get("sceneFreeze", {})
    if freeze.get("status") != "frozen" or freeze.get("captureAllowed") is not True:
        raise SystemExit("Phase 0.4R normalization is locked until the CRT scene/keepout authority is frozen.")
    matrix_status = freeze.get("matrixStatus")
    if not check_only and matrix_status != "ready-for-capture":
        raise SystemExit("Phase 0.4R normalization writes are allowed only while matrixStatus is ready-for-capture.")
    if check_only and matrix_status not in {"ready-for-capture", "complete"}:
        raise SystemExit("Phase 0.4R normalization checks require a ready-for-capture or complete authority.")
    if matrix.get("schema") != MATRIX_SCHEMA:
        raise SystemExit(f"Unexpected Phase 0.4R matrix schema: {matrix.get('schema')}")
    plan_authority = PLAN_PATH if matrix_status == "ready-for-capture" else PLAN_SNAPSHOT_PATH
    if matrix.get("plan", {}).get("path") != relative(PLAN_PATH):
        raise SystemExit("Browser matrix plan path is not the original ready-for-capture plan path")
    if matrix.get("plan", {}).get("sha256") != sha256(plan_authority):
        raise SystemExit("Browser matrix was produced from a different capture plan authority")
    contract_path = repo_path(plan["contractPath"])
    if matrix.get("contract", {}).get("sha256") != sha256(contract_path):
        raise SystemExit("Browser matrix was produced from a different CRT portal authority")
    keepout = freeze.get("keepoutAuthority", {})
    keepout_path = repo_path(keepout.get("path", ""))
    if matrix.get("keepout", {}).get("sha256") != sha256(keepout_path):
        raise SystemExit("Browser matrix was produced from a different CRT keepout authority")
    if not matrix.get("authorityFingerprint"):
        raise SystemExit("Browser matrix lacks its aggregate authority fingerprint")


def source_crop(runner: dict[str, Any], requested_width: int, requested_height: int, scale: float) -> tuple[int, int, int, int]:
    bounds = runner.get("captureRenderedBounds", {})
    x = round(float(bounds.get("rasterX", bounds.get("x", 0))))
    y = round(float(bounds.get("rasterY", bounds.get("y", 0))))
    width = int(bounds.get("rasterWidth", 0))
    height = int(bounds.get("rasterHeight", 0))
    expected_width = round(requested_width * scale)
    expected_height = round(requested_height * scale)
    if runner.get("captureBoundsMatch") is not True:
        raise ValueError("runner captureRenderedBounds did not pass")
    if width != expected_width or height != expected_height:
        raise ValueError(f"rendered bounds {width}x{height} differ from expected {expected_width}x{expected_height}")
    if x < 0 or y < 0:
        raise ValueError(f"negative crop origin {x},{y}")
    return x, y, width, height


def validate_scene_sources(matrix: dict[str, Any]) -> list[str]:
    failures: list[str] = []
    for source in matrix.get("sceneSources", []):
        path = repo_path(source.get("path", ""))
        if not path.is_file():
            failures.append(f"frozen scene source missing: {relative(path)}")
            continue
        if source.get("sha256") != sha256(path) or source.get("bytes") != path.stat().st_size:
            failures.append(f"frozen scene source lineage mismatch: {relative(path)}")
    return failures


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="validate bound raw/normalized evidence without writing")
    arguments = parser.parse_args()

    plan = read_json(PLAN_PATH)
    freeze = plan.get("sceneFreeze", {})
    if freeze.get("status") != "frozen" or freeze.get("captureAllowed") is not True:
        raise SystemExit("Phase 0.4R normalization is locked until the CRT scene/keepout authority is frozen.")
    matrix = read_json(MATRIX_PATH)
    validate_authority(plan, matrix, check_only=arguments.check)
    if plan.get("capture", {}).get("normalizationMethod") != (
        "crop exact rendered frame and use high-quality resampling only where captureScale is below 1"
    ):
        raise SystemExit("Unexpected Phase 0.4R normalization method")

    records = {record.get("id"): record for record in matrix.get("cases", [])}
    required = expand_required_captures(plan)
    failures = validate_scene_sources(matrix)
    normalized_count = 0
    if len(matrix.get("cases", [])) != 46:
        failures.append(f"matrix has {len(matrix.get('cases', []))}/46 cases")
    if len(required) != 36:
        failures.append(f"plan selects {len(required)}/36 captures")

    for expected in required:
        case_id = expected["id"]
        viewport = expected["viewport"]
        record = records.get(case_id)
        if record is None:
            failures.append(f"matrix case missing: {case_id}")
            continue
        capture = record.get("capture") or {}
        raw_record = capture.get("raw") or {}
        try:
            raw_path = repo_path(raw_record.get("path", ""))
        except SystemExit as error:
            failures.append(f"invalid raw path for {case_id}: {error}")
            continue
        normalized_path = repo_path(f'{plan["capture"]["normalizedDirectory"]}/{case_id}.png')
        if not raw_path.is_file():
            failures.append(f"raw capture missing: {relative(raw_path)}")
            continue
        if raw_record.get("sha256") != sha256(raw_path) or raw_record.get("bytes") != raw_path.stat().st_size:
            failures.append(f"raw capture lineage mismatch before normalization: {case_id}")
            continue
        modal = capture.get("modal") or {}
        if modal.get("pass") is not True or int((modal.get("winner") or {}).get("votes", 0)) < 7:
            failures.append(f"raw capture lacks a passing >=7/11 modal winner: {case_id}")
            continue

        requested_width = int(viewport["width"])
        requested_height = int(viewport["height"])
        expected_scale = float(viewport["captureScale"])
        runner = record.get("runner", {})
        actual_scale = float(runner.get("captureScale", 0))
        if abs(actual_scale - expected_scale) > 0.000001:
            failures.append(f"runner capture scale mismatch for {case_id}: {actual_scale} != {expected_scale}")
            continue
        try:
            x, y, crop_width, crop_height = source_crop(
                runner, requested_width, requested_height, expected_scale
            )
        except (TypeError, ValueError) as error:
            failures.append(f"invalid runner crop for {case_id}: {error}")
            continue

        try:
            with Image.open(raw_path) as source:
                source.load()
                raw_width, raw_height = source.size
                if source.format != "JPEG":
                    failures.append(f"raw capture is not JPEG: {relative(raw_path)}")
                    continue
                if raw_width < x + crop_width or raw_height < y + crop_height:
                    failures.append(
                        f"raw capture cannot contain crop for {case_id}: "
                        f"{raw_width}x{raw_height} < {x + crop_width}x{y + crop_height}"
                    )
                    continue
                if not arguments.check:
                    normalized = source.crop((x, y, x + crop_width, y + crop_height)).convert("RGB")
                    if expected_scale < 1:
                        normalized = normalized.resize(
                            (requested_width, requested_height), resample=Image.Resampling.LANCZOS
                        )
                    normalized_path.parent.mkdir(parents=True, exist_ok=True)
                    normalized.save(normalized_path, format="PNG", optimize=False)
        except OSError as error:
            failures.append(f"raw capture cannot be decoded for {case_id}: {error}")
            continue

        if arguments.check:
            if not normalized_path.is_file():
                failures.append(f"normalized capture missing: {relative(normalized_path)}")
                continue
            try:
                with Image.open(normalized_path) as normalized:
                    normalized.load()
                    if normalized.format != "PNG" or normalized.size != (requested_width, requested_height):
                        failures.append(
                            f"normalized capture invalid for {case_id}: {normalized.format} {normalized.size}"
                        )
                        continue
            except OSError as error:
                failures.append(f"normalized capture cannot be decoded for {case_id}: {error}")
                continue
            if capture.get("sha256") != sha256(normalized_path) or capture.get("bytes") != normalized_path.stat().st_size:
                failures.append(f"normalized capture lineage mismatch: {case_id}")
                continue
            if capture.get("width") != requested_width or capture.get("height") != requested_height:
                failures.append(f"normalized capture dimensions not bound in matrix: {case_id}")
                continue
            normalized_count += 1
            continue

        resampled = expected_scale < 1
        record["capture"] = {
            "path": relative(normalized_path),
            "sha256": sha256(normalized_path),
            "bytes": normalized_path.stat().st_size,
            "width": requested_width,
            "height": requested_height,
            "normalization": {
                "method": "measured-frame-crop-lanczos-resample" if resampled else "measured-frame-crop-no-resample",
                "sourceOrigin": {"x": x, "y": y},
                "sourceCrop": {"width": crop_width, "height": crop_height},
                "captureScale": expected_scale,
                "resampled": resampled,
                "resampleFilter": "Lanczos" if resampled else None,
                "sourceRawSha256": sha256(raw_path),
            },
            "raw": {
                **raw_record,
                "width": raw_width,
                "height": raw_height,
                "devicePixelRatio": runner.get("iframeViewport", {}).get("devicePixelRatio"),
                "rasterPolicy": "actual browser full-page JPEG; no CSS-by-DPR relationship asserted",
            },
            "modal": modal,
        }
        normalized_count += 1

    if failures:
        for failure in failures:
            print(f"- {failure}")
        raise SystemExit(f"Phase 0.4 capture normalization stopped with {len(failures)} issue(s).")

    review_sheets = matrix.get("browserDerivedReviewSheets", [])
    if len(review_sheets) != 6:
        raise SystemExit(f"Phase 0.4 matrix has {len(review_sheets)}/6 browser-derived review-sheet records")
    for sheet in review_sheets:
        source_case_ids = sheet.get("sourceCaseIds", [])
        source_cases: list[dict[str, Any]] = []
        for case_id in source_case_ids:
            capture = records.get(case_id, {}).get("capture") or {}
            if not capture.get("path") or not capture.get("sha256"):
                raise SystemExit(f"Review-sheet lineage source is not normalized: {sheet.get('filename')} -> {case_id}")
            source_cases.append(
                {
                    "id": case_id,
                    "path": capture["path"],
                    "width": capture["width"],
                    "height": capture["height"],
                    "bytes": capture["bytes"],
                    "sha256": capture["sha256"],
                }
            )
        expected_source_cases = sheet.get("sourceCases")
        if arguments.check:
            if expected_source_cases != source_cases:
                raise SystemExit(f"Review-sheet normalized lineage mismatch: {sheet.get('filename')}")
        else:
            sheet["sourceCases"] = source_cases
            sheet["lineageStatus"] = (
                "normalized case authorities bound; the review compositor must additionally bind "
                "the external SHA-256 of this finalized matrix"
            )

    if not arguments.check:
        atomic_json(MATRIX_PATH, matrix)
        checkpoint = read_json(CHECKPOINT_PATH)
        if checkpoint.get("schema") != CHECKPOINT_SCHEMA:
            raise SystemExit("Phase 0.4 checkpoint schema changed before normalization")
        if checkpoint.get("authorityFingerprint") != matrix.get("authorityFingerprint"):
            raise SystemExit("Phase 0.4 checkpoint and matrix authority fingerprints differ")
        checkpoint["status"] = "complete-local-authority-normalized"
        checkpoint["matrix"] = {
            "path": relative(MATRIX_PATH),
            "bytes": MATRIX_PATH.stat().st_size,
            "sha256": sha256(MATRIX_PATH),
            "cases": 46,
            "captures": 36,
            "normalized": True,
        }
        atomic_json(CHECKPOINT_PATH, checkpoint)

    action = "Validated" if arguments.check else "Normalized and bound"
    print(f"{action} {normalized_count} required Phase 0.4 browser captures.")


if __name__ == "__main__":
    main()
