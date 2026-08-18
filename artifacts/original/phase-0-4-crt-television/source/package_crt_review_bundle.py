"""Seal the Phase 0.4 CRT human-review bundle and package inventory.

The review archive is deliberately compact and deterministic: it contains only
the exact sixteen governed review PNGs plus an in-archive README. PNG bytes are
copied verbatim; no review raster is decoded, resampled or repainted here.
"""

from __future__ import annotations

import hashlib
import json
import sys
import zipfile
from pathlib import Path

from PIL import Image


sys.dont_write_bytecode = True
SCRIPT = Path(__file__).resolve()
PACKAGE = SCRIPT.parents[1]
ROOT = SCRIPT.parents[4]
PACKAGE_RELATIVE = "artifacts/original/phase-0-4-crt-television"
MANIFESTS = PACKAGE / "manifests"
REVIEW_MANIFEST = MANIFESTS / "review-bundle-manifest.json"
INVENTORY = MANIFESTS / "package-inventory.json"
ZIP_PATH = PACKAGE / "phase-0-4-crt-television-review.zip"
REFINED_SOURCE = PACKAGE / "source/quantum-signal-television-v1.blend"

REVIEW_FILES = (
    "crt-television-proportion-options.png",
    "crt-television-recommended-design-sheet.png",
    "crt-cabinet-material-sheet.png",
    "crt-screen-glass-and-phosphor-sheet.png",
    "crt-controls-speaker-rear-detail-sheet.png",
    "crt-cable-and-connection-sheet.png",
    "crt-proving-ground-style-frame.png",
    "crt-camera-path-study.png",
    "crt-power-on-contact-sheet.png",
    "crt-portal-transition-sheet.png",
    "crt-physical-dom-alignment-sheet.png",
    "crt-desktop-hero-composition.png",
    "crt-mobile-hero-composition.png",
    "crt-text-zoom-and-fallback.png",
    "crt-reduced-motion-desktop.png",
    "crt-reduced-motion-mobile.png",
)


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def repository_relative(path: Path) -> str:
    return path.resolve().relative_to(ROOT).as_posix()


def package_relative(path: Path) -> str:
    return path.resolve().relative_to(PACKAGE).as_posix()


def file_record(path: Path) -> dict[str, object]:
    return {
        "package_relative_path": package_relative(path),
        "repository_relative_path": repository_relative(path),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def png_record(filename: str) -> dict[str, object]:
    path = PACKAGE / filename
    if not path.is_file():
        raise RuntimeError(f"missing required review PNG: {filename}")
    with Image.open(path) as image:
        image.load()
        width, height = image.size
        mode = image.mode
    if mode != "RGB":
        raise RuntimeError(f"review PNG must be RGB: {filename} / {mode}")
    return {
        "path": filename,
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
        "width": width,
        "height": height,
        "classification": "intermediate human-review evidence raster",
        "approval_state": "review-candidate; automated and bounded visual QA passed",
    }


def readme(records: list[dict[str, object]]) -> bytes:
    lines = [
        "# Quantum-Hub Phase 0.4 CRT Television Review",
        "",
        "Selected CRT variant: A — Rounded 1990s domestic CRT.",
        "Assembled dimensions: 0.84 × 0.69 × 0.76 m (W × H × D).",
        "Visible screen: 29-inch class, 4:3.",
        "Blender version: 5.2.0 LTS.",
        f"Refined Blender source SHA-256: {sha256(REFINED_SOURCE)}",
        "",
        "## Render settings",
        "",
        "Engine: Blender Eevee. Samples: 128. Denoising: not applicable; no denoiser used.",
        "Resolution: 1920×1200 for 43 desktop/physical stills and 1080×1800 for 2 authored mobile stills.",
        "Colour management: AgX / Medium High Contrast. Image format: RGB 8-bit PNG.",
        "",
        "## Provenance and privacy",
        "",
        "The television was modelled from scratch with procedural materials.",
        "Private reference: user-supplied CRT television photograph, used only for broad era and proportion guidance.",
        "Repository status: intentionally uncommitted. It was never used as a texture and was never embedded or linked.",
        "No third-party model, texture, or external image dependency was used.",
        "",
        "## Known visual risks",
        "",
        "This is a still-based intermediate art-direction gate; no full animatic or production-performance claim exists.",
        "The neutral dormant-glass highlight is intentionally prominent enough to prove convexity while remaining powered off.",
        "Dense speaker perforations should be reviewed at full resolution, where their recessed construction is clearest.",
        "Final human creative acceptance remains pending.",
        "",
        "## Governed review files",
        "",
    ]
    for record in records:
        lines.append(f"- `{record['path']}` — SHA-256 `{record['sha256']}`")
    lines.append("")
    return ("\n".join(lines)).encode("utf-8")


def zip_info(name: str) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(filename=name, date_time=(1980, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.create_system = 3
    info.external_attr = 0o100644 << 16
    info.extra = b""
    info.comment = b""
    return info


def classification(relative: str) -> str:
    suffix = Path(relative).suffix.lower()
    if relative in REVIEW_FILES:
        return "intermediate human-review evidence raster"
    if relative == ZIP_PATH.name:
        return "compact human-review archive"
    if suffix == ".blend":
        return "editable Blender source"
    if suffix == ".py":
        return "deterministic generation, composition, validation or packaging source"
    if suffix == ".png":
        return "governed render or diagnostic evidence raster"
    if suffix == ".json":
        return "machine-readable evidence, layout or provenance authority"
    if suffix == ".md":
        return "planning or evidence documentation"
    return "governed Phase 0.4 package asset"


def approval_state(relative: str) -> str:
    if relative in REVIEW_FILES:
        return "review-candidate; automated and bounded visual QA passed"
    if relative.startswith("renders/refined/"):
        return "frozen canonical evidence source"
    if relative.startswith("renders/proportion-options/"):
        return "preserved proportion-gate evidence"
    if relative.startswith("work/"):
        return "preserved bounded diagnostic evidence"
    return "intended Phase 0.4 candidate package"


def main() -> None:
    MANIFESTS.mkdir(parents=True, exist_ok=True)
    records = [png_record(filename) for filename in REVIEW_FILES]
    readme_bytes = readme(records)

    with zipfile.ZipFile(
        ZIP_PATH,
        mode="w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=9,
        strict_timestamps=True,
    ) as archive:
        archive.writestr(zip_info("README.md"), readme_bytes, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        for record in records:
            filename = str(record["path"])
            archive.writestr(
                zip_info(filename),
                (PACKAGE / filename).read_bytes(),
                compress_type=zipfile.ZIP_DEFLATED,
                compresslevel=9,
            )

    review_manifest = {
        "schema": "quantum-hub.phase-0-4-crt-television.review-bundle.v1",
        "status": "PASS",
        "selected_option": "A",
        "selected_design": "Rounded 1990s domestic CRT",
        "record_count": len(records),
        "records": records,
        "readme": {
            "path": "README.md",
            "bytes": len(readme_bytes),
            "sha256": sha256_bytes(readme_bytes),
        },
        "archive": {
            "path": ZIP_PATH.name,
            "bytes": ZIP_PATH.stat().st_size,
            "sha256": sha256(ZIP_PATH),
            "member_count": len(records) + 1,
            "members": ["README.md", *REVIEW_FILES],
        },
        "generator": file_record(SCRIPT),
    }
    REVIEW_MANIFEST.write_text(json.dumps(review_manifest, indent=2) + "\n", encoding="utf-8")

    inventory_files = sorted(
        (
            path
            for path in PACKAGE.rglob("*")
            if path.is_file() and path.resolve() != INVENTORY.resolve()
        ),
        key=lambda path: package_relative(path),
    )
    inventory_records = []
    for path in inventory_files:
        relative = package_relative(path)
        inventory_records.append(
            {
                "package_relative_path": relative,
                "repository_relative_path": repository_relative(path),
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
                "classification": classification(relative),
                "approval_state": approval_state(relative),
                "intendedCommit": True,
            }
        )
    inventory = {
        "schema": "quantum-hub.phase-0-4-crt-television.package-inventory.v1",
        "status": "PASS",
        "scope": PACKAGE_RELATIVE,
        "intended_commit_only": True,
        "exclusions": ["manifests/package-inventory.json"],
        "file_count": len(inventory_records),
        "total_bytes": sum(int(record["bytes"]) for record in inventory_records),
        "records": inventory_records,
    }
    INVENTORY.write_text(json.dumps(inventory, indent=2) + "\n", encoding="utf-8")

    print(f"QH_PHASE04_CRT_REVIEW_PNGS={len(records)}")
    print(f"QH_PHASE04_CRT_REVIEW_ZIP_MEMBERS={len(records) + 1}")
    print(f"QH_PHASE04_CRT_REVIEW_ZIP_SHA256={sha256(ZIP_PATH)}")
    print(f"QH_PHASE04_CRT_PACKAGE_FILES={len(inventory_records) + 1}")
    print(f"QH_PHASE04_CRT_PACKAGE_INVENTORY_SHA256={sha256(INVENTORY)}")


if __name__ == "__main__":
    main()
