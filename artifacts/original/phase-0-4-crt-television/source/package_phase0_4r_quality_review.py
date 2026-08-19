"""Seal the additive Phase 0.4R CRT quality-review package.

This finalizer is deliberately separate from the historical Phase 0.4 packager.
It never rewrites the protected Phase 0.4 review ZIP.  The Phase 0.4R archive is
created under the ignored ``work`` directory and contains only the exact 17
repair deliverables.  All committed manifests bind the individual governed
files, their truthful Cycles/Eevee/browser lineage, and the accepted parent.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import zipfile
from pathlib import Path
from typing import Any

from PIL import Image


sys.dont_write_bytecode = True
SCRIPT = Path(__file__).resolve()
PACKAGE = SCRIPT.parents[1]
ROOT = SCRIPT.parents[4]
PACKAGE_RELATIVE = "artifacts/original/phase-0-4-crt-television"
ACCEPTED_PARENT = "fec1f0e9243a9cda188c539ab1b79e4a99c30623"

MANIFESTS = PACKAGE / "manifests"
REPAIR_MANIFEST = MANIFESTS / "crt-phase-0-4r-repair-manifest.json"
REVIEW_BUNDLE = MANIFESTS / "review-bundle-manifest.json"
INVENTORY = MANIFESTS / "package-inventory.json"
EXTERNAL_ZIP = PACKAGE / "work/phase-0-4r-crt-quality-review.zip"
HISTORICAL_ZIP = PACKAGE / "phase-0-4-crt-television-review.zip"

CREATIVE_COMPOSITION = MANIFESTS / "crt-phase-0-4r-review-composition-manifest.json"
BROWSER_COMPOSITION = MANIFESTS / "phase-0-4r-browser-review-composition-manifest.json"
CANONICAL_INVENTORY = MANIFESTS / "crt-phase-0-4r-canonical-render-inventory.json"
POWER_AUTHORITY = MANIFESTS / "crt-phase-0-4r-power-on-state-authority.json"
PHYSICAL_PORTAL_AUTHORITY = MANIFESTS / "crt-phase-0-4r-portal-physical-state-authority.json"
FINAL_PORTAL_AUTHORITY = MANIFESTS / "crt-phase-0-4r-portal-transition-state-authority.json"
CYCLES_AUTHORITY = MANIFESTS / "crt-phase-0-4r-cycles-master-render-manifest.json"
TURNTABLE_AUTHORITY = MANIFESTS / "crt-model-turntable-manifest.json"
VALIDATION_AUTHORITY = MANIFESTS / "blender-source-validation.json"
KEEPOUT_AUTHORITY = MANIFESTS / "crt-scene-source-keepouts.json"
MATERIAL_AUTHORITY = MANIFESTS / "crt-material-and-asset-manifest.json"
SANITIZER_AUTHORITY = MANIFESTS / "png-metadata-sanitization.json"

REPAIR_PNGS = (
    "crt-cabinet-material-sheet.png",
    "crt-cable-and-connection-sheet.png",
    "crt-camera-path-study.png",
    "crt-controls-speaker-rear-detail-sheet.png",
    "crt-desktop-hero-composition.png",
    "crt-mobile-hero-composition.png",
    "crt-physical-dom-alignment-sheet.png",
    "crt-portal-transition-sheet.png",
    "crt-power-on-contact-sheet.png",
    "crt-proving-ground-style-frame.png",
    "crt-reduced-motion-desktop.png",
    "crt-reduced-motion-mobile.png",
    "crt-screen-glass-and-phosphor-sheet.png",
    "crt-television-recommended-design-sheet.png",
    "crt-text-zoom-and-fallback.png",
)
CLOSEUPS = "crt-model-quality-closeups.png"
TURNTABLE = "crt-model-turntable.webm"
REPAIR_DELIVERABLES = (*REPAIR_PNGS, CLOSEUPS, TURNTABLE)
TOP_LEVEL_REVIEW_PNGS = ("crt-television-proportion-options.png", *REPAIR_PNGS, CLOSEUPS)

BASELINE_PNGS: dict[str, dict[str, int | str]] = {
    "crt-cabinet-material-sheet.png": {"bytes": 1105801, "sha256": "f7b81ddf7a0b031f1b3d84c0aff76bbb34bf20fd16106a21c6a149cf0e4beb93"},
    "crt-cable-and-connection-sheet.png": {"bytes": 2593236, "sha256": "7a5322ec0b88d73ec67ded6f64097320b3cc6aede20b03f10f65dafbd7262be4"},
    "crt-camera-path-study.png": {"bytes": 1813944, "sha256": "1ef0766083ffdde4e6062374580cf29767c2605a59a8a22ebfca760f09f84232"},
    "crt-controls-speaker-rear-detail-sheet.png": {"bytes": 3441617, "sha256": "0224be4cf40afcfbadd699445d4146594af236186ebda9881e38b03817451dec"},
    "crt-desktop-hero-composition.png": {"bytes": 1758336, "sha256": "b8123eca4d6c9ce05adfb16e29177604acb48730a6d49b6c7cc7821e8d81cfc0"},
    "crt-mobile-hero-composition.png": {"bytes": 859548, "sha256": "6880496b2341e6dd3e29824a528a6411518c664e9b8853f9cf602936e44569d3"},
    "crt-physical-dom-alignment-sheet.png": {"bytes": 4447353, "sha256": "e733948ae7d4b534eea5ef7becb858c776628376ce0954c24c168cc506bc7252"},
    "crt-portal-transition-sheet.png": {"bytes": 10703351, "sha256": "ce7e80d633f66a48454593fbb3a459c994177f5c3b8a25480bb9b9c7e1c14515"},
    "crt-power-on-contact-sheet.png": {"bytes": 2357483, "sha256": "b61535e954881a7dd9e263241e62cfd6e14adae8be3e4e634ce17ed4adbac583"},
    "crt-proving-ground-style-frame.png": {"bytes": 2320530, "sha256": "f06437722067b3bb1e55355c18ff9f7d5d4aada66666052d69daebb2e612aff5"},
    "crt-reduced-motion-desktop.png": {"bytes": 877291, "sha256": "7324db6378a9820c2ef930cff0eed3a5744030ed01aaadaaa29533ab75ab7b0f"},
    "crt-reduced-motion-mobile.png": {"bytes": 412148, "sha256": "79a1373ccea650441777c3ad598bf0bcf50f57c6d5f82f1bea27d610c8a89785"},
    "crt-screen-glass-and-phosphor-sheet.png": {"bytes": 3158471, "sha256": "f08ce94db324b70b1bdc0b6fc65990be03799ec28d230e1597e660766529c25d"},
    "crt-television-recommended-design-sheet.png": {"bytes": 1542628, "sha256": "fee6271b2b5453a6228830e57e5481c67922d3fd2610aa88e79756224c656e4c"},
    "crt-text-zoom-and-fallback.png": {"bytes": 1383021, "sha256": "1db1a05290a81b9a929c241fd7983a468c097e7e51751b6e24ff809de8119ec9"},
}

CREATIVE_KINDS = {
    "crt-television-recommended-design-sheet.png": "cycles-eevee-composition",
    "crt-cabinet-material-sheet.png": "cycles-composition",
    "crt-screen-glass-and-phosphor-sheet.png": "cycles-eevee-composition",
    "crt-controls-speaker-rear-detail-sheet.png": "cycles-composition",
    "crt-cable-and-connection-sheet.png": "supplemental-eevee-composition",
    "crt-proving-ground-style-frame.png": "cycles-composition",
    "crt-camera-path-study.png": "supplemental-eevee-composition",
    "crt-power-on-contact-sheet.png": "supplemental-eevee-composition",
}
BROWSER_KINDS = {
    "crt-portal-transition-sheet.png": "cycles-browser-composition",
    "crt-physical-dom-alignment-sheet.png": "browser-composition",
    "crt-desktop-hero-composition.png": "browser-composition",
    "crt-mobile-hero-composition.png": "browser-composition",
    "crt-text-zoom-and-fallback.png": "browser-composition",
    "crt-reduced-motion-desktop.png": "browser-composition",
    "crt-reduced-motion-mobile.png": "browser-composition",
}


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def package_relative(path: Path) -> str:
    return path.resolve().relative_to(PACKAGE).as_posix()


def repository_relative(path: Path) -> str:
    return path.resolve().relative_to(ROOT).as_posix()


def file_record(path: Path, *, include_repository: bool = True) -> dict[str, Any]:
    if not path.is_file():
        raise RuntimeError(f"missing governed file: {path}")
    record: dict[str, Any] = {
        "package_relative_path": package_relative(path),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }
    if include_repository:
        record["repository_relative_path"] = repository_relative(path)
    return record


def read_json(path: Path, *, schema: str | None = None, status: str | None = None) -> dict[str, Any]:
    if not path.is_file():
        raise RuntimeError(f"missing required authority: {path}")
    value = json.loads(path.read_text(encoding="utf-8"))
    if schema is not None and value.get("schema") != schema:
        raise RuntimeError(f"authority schema mismatch: {path}")
    if status is not None and value.get("status") != status:
        raise RuntimeError(f"authority status mismatch: {path}")
    return value


def normalize_source_record(source: dict[str, Any]) -> dict[str, Any]:
    relative = str(
        source.get("package_relative_path")
        or source.get("repository_relative_path")
        or source.get("path")
        or ""
    ).replace("\\", "/")
    if not relative:
        raise RuntimeError("source lineage record has no path")
    inside_package = False
    if relative.startswith(f"{PACKAGE_RELATIVE}/"):
        absolute = ROOT / relative
        package_path = relative[len(PACKAGE_RELATIVE) + 1 :]
        inside_package = True
    elif (ROOT / relative).is_file():
        absolute = ROOT / relative
        package_path = None
    else:
        absolute = PACKAGE / relative
        package_path = relative
        inside_package = True
    if not absolute.is_file():
        raise RuntimeError(f"lineage source is missing: {relative}")
    expected_bytes = int(source.get("bytes", absolute.stat().st_size))
    expected_sha = str(source.get("sha256", sha256(absolute))).lower()
    if absolute.stat().st_size != expected_bytes or sha256(absolute) != expected_sha:
        raise RuntimeError(f"lineage source changed: {relative}")
    record = {
        "repository_relative_path": repository_relative(absolute),
        "bytes": absolute.stat().st_size,
        "sha256": expected_sha,
    }
    if inside_package and package_path is not None:
        record["package_relative_path"] = package_path
    for key in ("stateId", "captureId", "sourceId", "width", "height"):
        if key in source:
            record[key] = source[key]
    return record


def png_record(path: Path) -> dict[str, Any]:
    with Image.open(path) as opened:
        opened.load()
        image = opened.convert("RGBA")
        width, height = image.size
        pixel_sha256 = sha256_bytes(image.tobytes())
    return {
        **file_record(path),
        "width": width,
        "height": height,
        "pixel_sha256": pixel_sha256,
        "classification": "Phase 0.4R governed human-review evidence raster",
        "approval_state": "bounded visual, source-lineage and browser QA passed; direct human review pending",
        "intendedCommit": True,
    }


def basename_from_record(record: dict[str, Any]) -> str:
    relative = str(
        record.get("package_relative_path")
        or record.get("repository_relative_path")
        or record.get("path")
        or record.get("filename")
        or ""
    ).replace("\\", "/")
    return Path(relative).name


def composition_records(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {basename_from_record(record): record for record in manifest.get("sheets", manifest.get("records", []))}


def zip_info(name: str) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.create_system = 3
    info.external_attr = 0o100644 << 16
    info.extra = b""
    info.comment = b""
    return info


def create_external_zip() -> None:
    EXTERNAL_ZIP.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(
        EXTERNAL_ZIP,
        mode="w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=9,
        strict_timestamps=True,
    ) as archive:
        for filename in REPAIR_DELIVERABLES:
            path = PACKAGE / filename
            if not path.is_file():
                raise RuntimeError(f"missing repair deliverable: {filename}")
            archive.writestr(
                zip_info(filename),
                path.read_bytes(),
                compress_type=zipfile.ZIP_DEFLATED,
                compresslevel=9,
            )


def authority_record(path: Path, schema: str | None = None) -> dict[str, Any]:
    record = file_record(path)
    if schema:
        record["schema"] = schema
    return record


def classification(relative: str) -> str:
    suffix = Path(relative).suffix.lower()
    if relative in TOP_LEVEL_REVIEW_PNGS:
        return "governed Phase 0.4/0.4R human-review evidence raster"
    if suffix == ".blend":
        return "editable Blender source"
    if suffix == ".py":
        return "deterministic generation, validation, composition or packaging source"
    if suffix == ".png":
        return "governed render or bounded diagnostic evidence raster"
    if suffix == ".webm":
        return "governed review-only model turntable"
    if suffix == ".json":
        return "machine-readable evidence, layout or provenance authority"
    if suffix == ".md":
        return "planning or evidence documentation"
    if suffix == ".zip":
        return "protected historical review archive"
    return "governed Phase 0.4 CRT package asset"


def intended_repository_files() -> list[Path]:
    completed = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "--", PACKAGE_RELATIVE],
        cwd=ROOT,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
    )
    paths = []
    inventory_repository_path = repository_relative(INVENTORY)
    for line in completed.stdout.splitlines():
        relative = line.strip().replace("\\", "/")
        if not relative or relative == inventory_repository_path:
            continue
        absolute = ROOT / relative
        if not absolute.is_file():
            raise RuntimeError(f"git candidate is not a file: {relative}")
        paths.append(absolute)
    return sorted(paths, key=repository_relative)


def main() -> None:
    if not HISTORICAL_ZIP.is_file():
        raise RuntimeError("protected historical Phase 0.4 ZIP is missing")
    creative = read_json(
        CREATIVE_COMPOSITION,
        schema="quantum-hub.phase-0-4r-crt-television.review-composition.v1",
    )
    browser = read_json(
        BROWSER_COMPOSITION,
        schema="quantum-hub.phase-0-4r-crt-television.browser-review-composition.v1",
        status="PASS",
    )
    read_json(FINAL_PORTAL_AUTHORITY, status="PASS")

    creative_by_name = composition_records(creative)
    browser_by_name = composition_records(browser)
    repair_records: list[dict[str, Any]] = []
    for filename in REPAIR_PNGS:
        output = png_record(PACKAGE / filename)
        output["before"] = BASELINE_PNGS[filename]
        if filename in CREATIVE_KINDS:
            composed = creative_by_name.get(filename)
            if not composed:
                raise RuntimeError(f"creative composition omits {filename}")
            sources = [normalize_source_record(record) for record in composed.get("source_renders", [])]
            if not sources:
                raise RuntimeError(f"creative composition has no source lineage: {filename}")
            output["lineage"] = {
                "kind": CREATIVE_KINDS[filename],
                "composition_authority": authority_record(CREATIVE_COMPOSITION),
                "sources": sources,
            }
        else:
            composed = browser_by_name.get(filename)
            if not composed:
                raise RuntimeError(f"browser composition omits {filename}")
            source_records = composed.get("sources", [])
            sources = [normalize_source_record(record) for record in source_records]
            if not sources:
                raise RuntimeError(f"browser composition has no source lineage: {filename}")
            output["lineage"] = {
                "kind": BROWSER_KINDS[filename],
                "composition_authority": authority_record(BROWSER_COMPOSITION),
                "sources": sources,
            }
            if "sourceCaseIds" in composed:
                output["sourceCaseIds"] = composed["sourceCaseIds"]
            if "stateIds" in composed:
                output["stateIds"] = composed["stateIds"]
        repair_records.append(output)

    quality = png_record(PACKAGE / CLOSEUPS)
    quality_source = creative.get("quality_closeups", {})
    quality_sources = [normalize_source_record(record) for record in quality_source.get("source_renders", [])]
    if len(quality_sources) != 8:
        raise RuntimeError(f"quality closeups bind {len(quality_sources)}/8 Cycles masters")
    quality["lineage"] = {
        "kind": "cycles-composition",
        "composition_authority": authority_record(CREATIVE_COMPOSITION),
        "sources": quality_sources,
    }
    repair_records.append(quality)

    turntable = file_record(PACKAGE / TURNTABLE)
    turntable.update(
        {
            "classification": "Phase 0.4R review-only neutral-studio CRT turntable",
            "approval_state": "technical and bounded visual review passed; direct human review pending",
            "intendedCommit": True,
            "lineage": {
                "kind": "blender-turntable",
                "turntable_authority": authority_record(TURNTABLE_AUTHORITY),
                "sources": [
                    normalize_source_record(read_json(TURNTABLE_AUTHORITY).get("source", {})),
                    normalize_source_record(read_json(TURNTABLE_AUTHORITY).get("renderer", {})),
                ],
            },
        }
    )
    repair_records.append(turntable)
    if len(repair_records) != len(REPAIR_DELIVERABLES):
        raise RuntimeError("repair deliverable roster changed")

    create_external_zip()
    repair_manifest = {
        "schema": "quantum-hub.phase-0-4r-crt-television.repair-package.v1",
        "status": "PASS",
        "accepted_parent": ACCEPTED_PARENT,
        "baseline": {"head": ACCEPTED_PARENT},
        "selected_option": "A",
        "selected_design": "Rounded 1990s domestic CRT",
        "record_count": len(repair_records),
        "records": repair_records,
        "packager": file_record(SCRIPT),
        "review_composition_authority": authority_record(CREATIVE_COMPOSITION),
        "browser_review_composition_authority": authority_record(BROWSER_COMPOSITION),
        "canonical_inventory": authority_record(CANONICAL_INVENTORY),
        "power_state_authority": authority_record(POWER_AUTHORITY),
        "physical_portal_state_authority": authority_record(PHYSICAL_PORTAL_AUTHORITY),
        "portal_state_authority": authority_record(FINAL_PORTAL_AUTHORITY),
        "cycles_master_authority": authority_record(CYCLES_AUTHORITY),
        "turntable_authority": authority_record(TURNTABLE_AUTHORITY),
        "blender_validation_authority": authority_record(VALIDATION_AUTHORITY),
        "scene_keepout_authority": authority_record(KEEPOUT_AUTHORITY),
        "material_asset_authority": authority_record(MATERIAL_AUTHORITY),
        "png_sanitizer_authority": authority_record(SANITIZER_AUTHORITY),
        "external_review_zip": {
            "local_relative_path": f"{PACKAGE_RELATIVE}/work/{EXTERNAL_ZIP.name}",
            "bytes": EXTERNAL_ZIP.stat().st_size,
            "sha256": sha256(EXTERNAL_ZIP),
            "member_count": len(REPAIR_DELIVERABLES),
            "members": list(REPAIR_DELIVERABLES),
            "intentionally_uncommitted": True,
            "repository_status": "intentionally uncommitted",
        },
        "historical_phase_0_4_archive": {
            **file_record(HISTORICAL_ZIP),
            "preserved_byte_exact": True,
        },
        "privacy": {
            "private_reference_loaded": False,
            "private_reference_committed": False,
            "private_reference_used_as_texture": False,
            "external_texture_count": 0,
            "external_model_count": 0,
            "third_party_model_count": 0,
        },
        "production_boundary": {
            "full_animatic_created": False,
            "production_cinematic_created": False,
            "turntable_review_only": True,
        },
    }
    REPAIR_MANIFEST.write_text(json.dumps(repair_manifest, indent=2) + "\n", encoding="utf-8")

    review_records = [png_record(PACKAGE / filename) for filename in TOP_LEVEL_REVIEW_PNGS]
    review_bundle = {
        "schema": "quantum-hub.phase-0-4-crt-television.review-bundle.v1",
        "status": "PASS",
        "selected_option": "A",
        "selected_design": "Rounded 1990s domestic CRT",
        "record_count": len(review_records),
        "records": review_records,
        "repair_manifest": authority_record(REPAIR_MANIFEST),
        "generator": file_record(SCRIPT),
        "historical_archive": {
            **file_record(HISTORICAL_ZIP),
            "preserved_byte_exact": True,
        },
    }
    REVIEW_BUNDLE.write_text(json.dumps(review_bundle, indent=2) + "\n", encoding="utf-8")

    inventory_records = []
    for path in intended_repository_files():
        relative = package_relative(path)
        inventory_records.append(
            {
                **file_record(path),
                "classification": classification(relative),
                "approval_state": "intended Phase 0.4R repair candidate package",
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

    print(f"QH_PHASE04R_REPAIR_DELIVERABLES={len(repair_records)}")
    print(f"QH_PHASE04R_REVIEW_PNGS={len(review_records)}")
    print(f"QH_PHASE04R_EXTERNAL_ZIP_BYTES={EXTERNAL_ZIP.stat().st_size}")
    print(f"QH_PHASE04R_EXTERNAL_ZIP_SHA256={sha256(EXTERNAL_ZIP)}")
    print(f"QH_PHASE04R_REPAIR_MANIFEST_SHA256={sha256(REPAIR_MANIFEST)}")
    print(f"QH_PHASE04R_PACKAGE_INVENTORY_FILES={len(inventory_records)}")


if __name__ == "__main__":
    main()
