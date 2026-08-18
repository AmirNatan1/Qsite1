"""Normalize Phase 0.3 in-app-browser screenshots and bind their lineage.

The browser evidence path emits full-page JPEGs. This script preserves those
raw files and crops the runner's rendered outer-frame bounds from top-left
(0, 0). Capture scale 1 writes a same-size PNG without resampling. A wide
viewport whose evidence-only outer frame was scaled below 1 is resized back to
the exact requested CSS dimensions with Lanczos. The inner iframe always keeps
its exact requested CSS layout. Both files and the complete scale/crop lineage
are bound into the Phase 0.3 browser matrix.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

try:
    from PIL import Image
except ImportError as error:  # pragma: no cover - environment diagnostic
    raise SystemExit(
        "Pillow is required by this evidence-only normalizer; no application runtime dependency was added."
    ) from error


ROOT = Path(__file__).resolve().parents[1]
PLAN_PATH = ROOT / "prototypes/phase-0-portal-layout-qa/capture-plan-v3.json"
MATRIX_PATH = ROOT / "artifacts/evidence/phase-0-3d-repair-v3/browser-matrix-report.json"


def read_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise SystemExit(f"Required input is missing: {path.relative_to(ROOT).as_posix()}") from error


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def expand_required_captures(plan: dict[str, Any]) -> list[dict[str, Any]]:
    viewports = {item["id"]: item for item in plan.get("viewports", [])}
    required: list[dict[str, Any]] = []
    for template in plan.get("caseTemplates", []):
        viewport_ids = list(viewports) if template.get("viewportIds") == "all" else template.get("viewportIds", [])
        capture_ids = viewport_ids if template.get("captureViewportIds") == "all" else template.get("captureViewportIds", [])
        capture_set = set(capture_ids)
        for viewport_id in viewport_ids:
            if viewport_id not in capture_set:
                continue
            required.append(
                {
                    "id": f'{template["idPrefix"]}--{viewport_id}',
                    "viewport": viewports[viewport_id],
                }
            )
    return required


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="validate raw and normalized captures plus bound lineage without writing",
    )
    arguments = parser.parse_args()

    plan = read_json(PLAN_PATH)
    matrix = read_json(MATRIX_PATH)
    if plan.get("sceneFreeze", {}).get("status") != "frozen":
        raise SystemExit("Phase 0.3 capture normalization is locked until sceneFreeze.status is frozen.")
    capture_config = plan["capture"]
    raw_directory = ROOT / capture_config["rawDirectory"]
    normalized_directory = ROOT / capture_config["normalizedDirectory"]
    records = {record.get("id"): record for record in matrix.get("cases", [])}
    failures: list[str] = []
    normalized_count = 0

    expected_method = "top-left-rendered-frame-crop-lanczos-when-scaled"
    if capture_config.get("normalizationMethod") != expected_method:
        raise SystemExit(f"Capture plan normalization method is not {expected_method}")

    if not arguments.check:
        normalized_directory.mkdir(parents=True, exist_ok=True)

    for expected in expand_required_captures(plan):
        case_id = expected["id"]
        viewport = expected["viewport"]
        record = records.get(case_id)
        if record is None:
            failures.append(f"matrix case missing: {case_id}")
            continue

        raw_path = raw_directory / f"{case_id}.jpg"
        normalized_path = normalized_directory / f"{case_id}.png"
        if not raw_path.is_file():
            failures.append(f"raw capture missing: {relative(raw_path)}")
            continue

        try:
            with Image.open(raw_path) as source:
                source.load()
                raw_width, raw_height = source.size
                requested_width = int(viewport["width"])
                requested_height = int(viewport["height"])
                expected_scale = float(viewport["captureScale"])
                runner = record.get("runner", {})
                actual_scale = float(runner.get("captureScale", 0))
                rendered_bounds = runner.get("captureRenderedBounds", {})
                crop_width = int(rendered_bounds.get("rasterWidth", 0))
                crop_height = int(rendered_bounds.get("rasterHeight", 0))
                expected_crop_width = round(requested_width * expected_scale)
                expected_crop_height = round(requested_height * expected_scale)
                if source.format != "JPEG":
                    failures.append(f"raw capture is not JPEG: {relative(raw_path)}")
                    continue
                if abs(actual_scale - expected_scale) > 0.000001:
                    failures.append(
                        f"runner capture scale disagrees with the plan for {case_id}: "
                        f"{actual_scale} != {expected_scale}"
                    )
                    continue
                if runner.get("captureBoundsMatch") is not True:
                    failures.append(f"runner rendered bounds did not pass for {case_id}")
                    continue
                if crop_width != expected_crop_width or crop_height != expected_crop_height:
                    failures.append(
                        f"runner rendered raster bounds disagree with the plan for {case_id}: "
                        f"{crop_width}x{crop_height} != {expected_crop_width}x{expected_crop_height}"
                    )
                    continue
                if raw_width < crop_width or raw_height < crop_height:
                    failures.append(
                        f"raw capture cannot contain requested crop for {case_id}: "
                        f"{raw_width}x{raw_height} < {crop_width}x{crop_height}"
                    )
                    continue

                if not arguments.check:
                    normalized = source.crop((0, 0, crop_width, crop_height)).convert("RGB")
                    if expected_scale < 1:
                        normalized = normalized.resize(
                            (requested_width, requested_height),
                            resample=Image.Resampling.LANCZOS,
                        )
                    normalized.save(normalized_path, format="PNG", optimize=False)
        except OSError as error:
            failures.append(f"raw capture cannot be decoded for {case_id}: {error}")
            continue

        raw_digest = sha256(raw_path)
        actual_dpr = record.get("runner", {}).get("iframeViewport", {}).get("devicePixelRatio")
        resampled = expected_scale < 1

        if arguments.check:
            if not normalized_path.is_file():
                failures.append(f"normalized capture missing: {relative(normalized_path)}")
                continue
            try:
                with Image.open(normalized_path) as normalized:
                    normalized.load()
                    if normalized.format != "PNG" or normalized.size != (requested_width, requested_height):
                        failures.append(
                            f"normalized capture format/dimensions are invalid for {case_id}: "
                            f"{normalized.format} {normalized.size}"
                        )
                        continue
            except OSError as error:
                failures.append(f"normalized capture cannot be decoded for {case_id}: {error}")
                continue
            bound = record.get("capture", {})
            if bound.get("sha256") != sha256(normalized_path) or bound.get("bytes") != normalized_path.stat().st_size:
                failures.append(f"normalized capture lineage mismatch for {case_id}")
                continue
            raw_bound = bound.get("raw", {})
            if raw_bound.get("sha256") != raw_digest or raw_bound.get("bytes") != raw_path.stat().st_size:
                failures.append(f"raw capture lineage mismatch for {case_id}")
                continue
            normalized_count += 1
            continue

        normalized_digest = sha256(normalized_path)
        record["capture"] = {
            "path": relative(normalized_path),
            "sha256": normalized_digest,
            "bytes": normalized_path.stat().st_size,
            "width": requested_width,
            "height": requested_height,
            "normalization": {
                "method": "top-left-crop-lanczos-resample" if resampled else "top-left-crop-no-resample",
                "origin": {"x": 0, "y": 0},
                "sourceCrop": {"width": crop_width, "height": crop_height},
                "captureScale": expected_scale,
                "resampled": resampled,
                "resampleFilter": "Lanczos" if resampled else None,
                "sourceRawSha256": raw_digest,
            },
            "raw": {
                "path": relative(raw_path),
                "sha256": raw_digest,
                "bytes": raw_path.stat().st_size,
                "width": raw_width,
                "height": raw_height,
                "devicePixelRatio": actual_dpr,
                "rasterPolicy": "actual browser full-page JPEG; no CSS-by-DPR relationship asserted",
            },
        }
        normalized_count += 1

    if failures:
        for failure in failures:
            print(f"- {failure}")
        raise SystemExit(f"Phase 0.3 capture normalization stopped with {len(failures)} issue(s).")

    if not arguments.check:
        scene_classifications: dict[str, set[str]] = {}
        for record in matrix.get("cases", []):
            assets = record.get("report", {}).get("assets", {})
            scene_path = str(assets.get("scene", "")).lstrip("/")
            if not scene_path:
                failures.append(f'matrix case lacks its scene path: {record.get("id", "<unknown>")}')
                continue
            scene_classifications.setdefault(scene_path, set()).add(str(assets.get("sceneClassification", "unknown")))
        scene_sources = []
        for scene_path, classifications in sorted(scene_classifications.items()):
            source = ROOT / scene_path
            if not source.is_file():
                failures.append(f"matrix scene source is missing: {scene_path}")
                continue
            try:
                with Image.open(source) as scene:
                    scene.load()
                    if scene.format != "PNG":
                        failures.append(f"matrix scene source is not PNG: {scene_path}")
                        continue
                    width, height = scene.size
            except OSError as error:
                failures.append(f"matrix scene source cannot be decoded: {scene_path}: {error}")
                continue
            scene_sources.append(
                {
                    "path": scene_path,
                    "sha256": sha256(source),
                    "bytes": source.stat().st_size,
                    "width": width,
                    "height": height,
                    "classifications": sorted(classifications),
                }
            )
        if failures:
            for failure in failures:
                print(f"- {failure}")
            raise SystemExit(f"Phase 0.3 capture normalization stopped with {len(failures)} issue(s).")
        matrix["sceneSources"] = scene_sources
        MATRIX_PATH.write_text(json.dumps(matrix, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    action = "Validated" if arguments.check else "Normalized and bound"
    print(f"{action} {normalized_count} required Phase 0.3 browser captures.")


if __name__ == "__main__":
    main()
