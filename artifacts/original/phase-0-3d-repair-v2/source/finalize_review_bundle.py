"""Seal the exact twelve-image Phase 0.2 human-review bundle."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image


PACKAGE = Path(__file__).resolve().parents[1]
REPOSITORY = PACKAGE.parents[2]
MANIFESTS = PACKAGE / "manifests"
EVIDENCE = REPOSITORY / "artifacts" / "evidence" / "phase-0-3d-repair-v2"

REQUIRED = [
    "field-unit-v2-silhouette-options.png",
    "field-unit-v2-recommended-design-sheet.png",
    "field-unit-v2-material-and-cable-sheet.png",
    "proving-ground-v2-style-frame.png",
    "camera-path-v2-study.png",
    "activation-v2-contact-sheet.png",
    "portal-v2-layout-sheet.png",
    "desktop-hero-composition-v2.png",
    "mobile-hero-composition-v2.png",
    "text-zoom-and-fallback-v2.png",
    "reduced-motion-v2-desktop.png",
    "reduced-motion-v2-mobile.png",
]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def package_manifest(name: str) -> Path:
    path = MANIFESTS / name
    if not path.is_file():
        raise FileNotFoundError(path)
    return path


def authority(path: Path, *, repository_relative: bool = False) -> dict:
    relative = (
        path.resolve().relative_to(REPOSITORY.resolve()).as_posix()
        if repository_relative
        else path.resolve().relative_to(PACKAGE.resolve()).as_posix()
    )
    return {"path": relative, "sha256": sha256(path)}


def image_facts(package_path: str) -> dict:
    path = PACKAGE / package_path
    with Image.open(path) as opened:
        width, height = opened.size
    return {
        "path": package_path,
        "width": width,
        "height": height,
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def main() -> None:
    review_composition_path = package_manifest("review-composition-manifest.json")
    silhouette_path = package_manifest("silhouette-decision-manifest.json")
    browser_review_path = package_manifest("browser-review-composition-manifest.json")
    review_composition = load(review_composition_path)
    silhouette = load(silhouette_path)
    browser_review = load(browser_review_path)

    static_by_name = {
        Path(record["path"]).name: record for record in review_composition["records"]
    }
    browser_by_name = {
        Path(record["path"]).name: record for record in browser_review["records"]
    }

    records: list[dict] = []
    silhouette_record: dict | None = None
    for filename in REQUIRED:
        package_path = f"review/{filename}"
        facts = image_facts(package_path)
        if filename == "field-unit-v2-silhouette-options.png":
            record = {
                **facts,
                "sourceManifest": "manifests/silhouette-decision-manifest.json",
                "source_paths": [item["source"] for item in silhouette["source_renders"]],
                "classification": "original Quantum creative review evidence",
                "approvalState": "human creative review required",
            }
            silhouette_record = record
        elif filename in static_by_name:
            source = static_by_name[filename]
            record = {
                **facts,
                "sourceManifest": "manifests/review-composition-manifest.json",
                "source_paths": list(source["source_paths"]),
                "derivation": source["derivation"],
                "classification": "original Quantum creative review evidence",
                "approvalState": "human creative review required",
            }
        elif filename in browser_by_name:
            source = browser_by_name[filename]
            record = {
                **facts,
                "sourceManifest": "manifests/browser-review-composition-manifest.json",
                "sources": list(source["sources"]),
                "derivation": source["derivation"],
                "classification": "original Quantum implementation evidence",
                "approvalState": "human repository and feasibility review required",
            }
        else:
            raise RuntimeError(f"No governing source record for {filename}")
        if filename != "field-unit-v2-silhouette-options.png":
            records.append(record)

    expected_originals = REQUIRED[1:]
    if [Path(record["path"]).name for record in records] != expected_originals:
        raise RuntimeError("Review-original order or membership mismatch")
    if silhouette_record is None:
        raise RuntimeError("Silhouette authority record is missing")

    matrix_path = EVIDENCE / "browser-matrix-report.json"
    authorities = {
        "reviewComposition": authority(review_composition_path),
        "silhouetteDecision": authority(silhouette_path),
        "browserReviewComposition": authority(browser_review_path),
        "finalRender": authority(package_manifest("final-render-manifest-all.json")),
        "diagnosticRender": authority(package_manifest("final-render-manifest-diagnostic.json")),
        "blockoutRender": authority(package_manifest("blockout-render-manifest.json")),
        "portalSurface": authority(package_manifest("portal-surface-manifest.json")),
        "pngSanitization": authority(package_manifest("png-metadata-sanitization.json")),
        "blenderSourceValidation": authority(package_manifest("blender-source-validation.json")),
        "browserMatrix": authority(matrix_path, repository_relative=True),
    }

    originals = {
        "schema": "quantum-hub.phase-0-3d-repair-v2.review-originals.v1",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "required_count": 11,
        "all_required_present": True,
        "creative_boundary": {
            "original_artwork": True,
            "reference_binary_used": False,
            "external_asset_used": False,
            "font_binary_bundled": False,
        },
        "render_contract": {
            "still_only": True,
            "new_animatic_or_video": False,
            "engine": "BLENDER_EEVEE",
        },
        "final_blend": {
            "path": "source/field-unit-v2-integrated-aperture-chassis.blend",
        },
        "portal_layout": {
            "path": "portal-layout.json",
            "sha256": sha256(PACKAGE / "portal-layout.json"),
        },
        "authorities": authorities,
        "records": records,
    }
    blend_path = PACKAGE / originals["final_blend"]["path"]
    originals["final_blend"].update(
        {"bytes": blend_path.stat().st_size, "sha256": sha256(blend_path)}
    )
    originals_path = MANIFESTS / "review-originals-manifest.json"
    originals_path.write_text(
        json.dumps(originals, indent=2, ensure_ascii=True) + "\n", encoding="utf-8"
    )

    bundle_records = [
        {
            key: silhouette_record[key]
            for key in ("path", "width", "height", "bytes", "sha256")
        }
        | {"sourceManifest": "manifests/silhouette-decision-manifest.json"},
        *[
            {
                key: record[key]
                for key in ("path", "width", "height", "bytes", "sha256")
            }
            | {"sourceManifest": "manifests/review-originals-manifest.json"}
            for record in records
        ],
    ]
    bundle = {
        "schema": "quantum-hub.phase-0-3d-repair-v2.review-bundle.v1",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "authorities": {
            "reviewOriginals": authority(originals_path),
            "silhouetteDecision": authority(silhouette_path),
        },
        "records": bundle_records,
        "required_count": 12,
        "all_required_present": len(bundle_records) == 12,
    }
    bundle_path = MANIFESTS / "review-bundle-manifest.json"
    bundle_path.write_text(
        json.dumps(bundle, indent=2, ensure_ascii=True) + "\n", encoding="utf-8"
    )
    print("QH_V2_REVIEW_BUNDLE=PASS")
    print(f"QH_V2_REVIEW_RECORDS={len(bundle_records)}")


if __name__ == "__main__":
    main()
