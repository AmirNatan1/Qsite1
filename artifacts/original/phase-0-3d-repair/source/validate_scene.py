"""Validate Blender-source organization, animation controls and asset independence."""

from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import bpy

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import scene_config as cfg


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def driver_count(animated_id) -> int:
    animation_data = getattr(animated_id, "animation_data", None)
    drivers = getattr(animation_data, "drivers", ()) if animation_data else ()
    return len(drivers)


def main() -> None:
    errors: list[str] = []
    warnings: list[str] = []
    scene = bpy.context.scene
    missing_collections = [name for name in cfg.REQUIRED_COLLECTIONS if name not in bpy.data.collections]
    missing_objects = [name for name in cfg.REQUIRED_OBJECTS if name not in bpy.data.objects]
    if missing_collections:
        errors.append(f"missing collections: {missing_collections}")
    if missing_objects:
        errors.append(f"missing objects: {missing_objects}")

    control = bpy.data.objects.get("CTRL_SpiralConduction")
    if control:
        for property_name in cfg.CONTROL_KEYS:
            if property_name not in control:
                errors.append(f"missing control property: {property_name}")
        if control.get("conduction_direction") != "outside-in cumulative single front":
            errors.append("conduction direction metadata is missing or wrong")

    core = bpy.data.objects.get("Cable_ConductionCore")
    front = bpy.data.objects.get("Cable_ConductionFront")
    if core and driver_count(core.data) < 1:
        errors.append("conduction core has no parametric reveal driver")
    if front and driver_count(front.data) < 2:
        errors.append("conduction front lacks start/end drivers")

    external_images = []
    for image in bpy.data.images:
        if image.source == "FILE" and image.filepath:
            external_images.append(image.filepath)
    if external_images:
        errors.append(f"external image dependencies found: {external_images}")
    if bpy.data.libraries:
        errors.append(f"linked Blender libraries found: {[library.filepath for library in bpy.data.libraries]}")

    if scene.frame_start != cfg.FRAME_START or scene.frame_end != cfg.FRAME_END or scene.render.fps != cfg.FPS:
        errors.append("timeline does not match the 192-frame/24fps contract")
    if scene.get("reference_binary_used") is not False:
        errors.append("reference-binary independence marker is not false")
    if scene.get("original_artwork") is not True:
        errors.append("original-artwork marker is not true")

    blend_path = Path(bpy.data.filepath).resolve()
    if not blend_path.exists():
        errors.append("blend source path is not saved")
    if blend_path.exists() and blend_path.stat().st_size > 45 * 1024 * 1024:
        warnings.append("blend source exceeds the 45 MiB escalation threshold")

    payload = {
        "schema": "quantum-hub.phase-0-3d-source-validation.v1",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
        "blender_version": bpy.app.version_string,
        "blender_build_hash": bpy.app.build_hash.decode("ascii", errors="replace") if isinstance(bpy.app.build_hash, bytes) else str(bpy.app.build_hash),
        "blend_source": blend_path.relative_to(cfg.PACKAGE_ROOT).as_posix() if blend_path.is_relative_to(cfg.PACKAGE_ROOT) else blend_path.name,
        "blend_bytes": blend_path.stat().st_size if blend_path.exists() else None,
        "blend_sha256": sha256(blend_path) if blend_path.exists() else None,
        "collection_count": len(bpy.data.collections),
        "object_count": len(bpy.data.objects),
        "material_count": len(bpy.data.materials),
        "external_images": external_images,
        "linked_libraries": [library.filepath for library in bpy.data.libraries],
        "control_properties": {name: control.get(name) if control else None for name in cfg.CONTROL_KEYS},
        "driver_counts": {
            "conduction_core": driver_count(core.data) if core else 0,
            "conduction_front": driver_count(front.data) if front else 0,
        },
    }
    cfg.MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    report = cfg.MANIFEST_DIR / "blender-source-validation.json"
    report.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"QH_VALIDATION={report}")
    print(json.dumps(payload, indent=2))
    if errors:
        raise RuntimeError("Blender source validation failed")


if __name__ == "__main__":
    main()
