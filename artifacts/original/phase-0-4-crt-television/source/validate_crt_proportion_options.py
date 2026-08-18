"""Validate the editable Phase 0.4 CRT proportion source and privacy boundary."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import bpy

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import crt_options_config as cfg


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def check(name: str, passed: bool, actual, expected) -> dict:
    return {"name": name, "pass": bool(passed), "actual": actual, "expected": expected}


def main() -> None:
    source = Path(bpy.data.filepath).resolve()
    repository_root = cfg.PACKAGE_DIR.parents[2]
    external_libraries = len(bpy.data.libraries)
    external_images = len(bpy.data.images)
    packed_files = sum(
        1
        for image in bpy.data.images
        if getattr(image, "packed_file", None) is not None or len(getattr(image, "packed_files", [])) > 0
    )
    external_paths = sorted(set(bpy.utils.blend_paths(absolute=True, packed=False, local=False)))
    missing_files = sum(1 for value in external_paths if value and not Path(value).exists())
    image_texture_nodes = sum(
        1
        for material in bpy.data.materials
        if material.use_nodes
        for node in material.node_tree.nodes
        if node.type == "TEX_IMAGE"
    )
    option_collections = sorted(collection.name for collection in bpy.data.collections if collection.name.startswith("OPTION_"))
    screen_objects = sorted(
        (obj for obj in bpy.data.objects if obj.name.endswith("Convex43SmokedGlass")),
        key=lambda obj: obj.name,
    )
    cabinet_objects = sorted(
        (obj for obj in bpy.data.objects if obj.name.endswith("DeepTubeCabinetShell")),
        key=lambda obj: obj.name,
    )
    camera_objects = sorted((obj for obj in bpy.data.objects if obj.type == "CAMERA"), key=lambda obj: obj.name)
    dormant_indicators = sorted(
        (obj for obj in bpy.data.objects if obj.name.endswith("DormantPowerIndicator")),
        key=lambda obj: obj.name,
    )
    cables = sorted(
        (obj for obj in bpy.data.objects if obj.name.endswith("DormantPowerSignalCable")),
        key=lambda obj: obj.name,
    )
    object_names = "\n".join(obj.name.lower() for obj in bpy.data.objects)
    prohibited_brand_tokens = ("sony", "panasonic", "toshiba", "philips", "samsung", "jvc", "grundig")
    brand_hits = sorted(token for token in prohibited_brand_tokens if token in object_names)

    screen_measurements = []
    screen_ratio_pass = True
    for obj in screen_objects:
        ratio = obj.dimensions.x / obj.dimensions.z
        screen_measurements.append(
            {
                "object": obj.name,
                "width_m": round(obj.dimensions.x, 6),
                "height_m": round(obj.dimensions.z, 6),
                "ratio": round(ratio, 6),
            }
        )
        screen_ratio_pass = screen_ratio_pass and abs(ratio - (4.0 / 3.0)) <= 0.002

    cabinet_measurements = []
    cabinet_dimension_pass = True
    for key, spec in cfg.OPTIONS.items():
        obj = bpy.data.objects.get(f"CRT_{key}_DeepTubeCabinetShell")
        if obj is None:
            cabinet_dimension_pass = False
            continue
        expected = spec["dimensions_m"]
        measured = {"width": obj.dimensions.x, "height": obj.dimensions.z, "depth": obj.dimensions.y}
        cabinet_measurements.append(
            {
                "option": key,
                "object": obj.name,
                "measured_m": {axis: round(value, 6) for axis, value in measured.items()},
                "working_dimensions_m": expected,
            }
        )
        cabinet_dimension_pass = cabinet_dimension_pass and abs(measured["width"] - expected["width"]) <= 0.02
        cabinet_dimension_pass = cabinet_dimension_pass and abs(measured["height"] - expected["height"]) <= 0.02
        cabinet_dimension_pass = cabinet_dimension_pass and abs(measured["depth"] - (expected["depth"] - 0.045)) <= 0.02

    scene = bpy.context.scene
    checks = [
        check("Blender version", bpy.app.version[:2] == (5, 2), bpy.app.version_string, cfg.BLENDER_VERSION),
        check("editable source exists", source.exists(), source.name, cfg.BLOCKOUT_BLEND.name),
        check("three option collections", len(option_collections) == 3, len(option_collections), 3),
        check("three procedural cabinet shells", len(cabinet_objects) == 3, len(cabinet_objects), 3),
        check("three convex 4:3 screens", len(screen_objects) == 3, len(screen_objects), 3),
        check("screen ratios", screen_ratio_pass, screen_measurements, "4:3 within 0.002"),
        check("working cabinet dimensions", cabinet_dimension_pass, cabinet_measurements, "within 0.02 m"),
        check("six review cameras", len(camera_objects) == 6, len(camera_objects), 6),
        check("three dormant cable objects", len(cables) == 3, len(cables), 3),
        check("three dormant power indicators", len(dormant_indicators) == 3, len(dormant_indicators), 3),
        check(
            "indicator emission is zero",
            all(float(obj.get("emission_strength", -1.0)) == 0.0 for obj in dormant_indicators),
            [obj.get("emission_strength") for obj in dormant_indicators],
            [0.0, 0.0, 0.0],
        ),
        check("external libraries", external_libraries == 0, external_libraries, 0),
        check("external images", external_images == 0, external_images, 0),
        check("packed files", packed_files == 0, packed_files, 0),
        check("external file paths", len(external_paths) == 0, len(external_paths), 0),
        check("missing files", missing_files == 0, missing_files, 0),
        check("image texture nodes", image_texture_nodes == 0, image_texture_nodes, 0),
        check("private reference never loaded", scene.get("private_reference_loaded_in_blender") is False, scene.get("private_reference_loaded_in_blender"), False),
        check("modelled from scratch", scene.get("modelled_from_scratch") is True, scene.get("modelled_from_scratch"), True),
        check("procedural materials only", scene.get("procedural_materials_only") is True, scene.get("procedural_materials_only"), True),
        check("no third-party models", int(scene.get("third_party_models", -1)) == 0, scene.get("third_party_models"), 0),
        check("high-detail refinement held", scene.get("high_detail_refinement_started") is False, scene.get("high_detail_refinement_started"), False),
        check("no manufacturer branding", len(brand_hits) == 0, brand_hits, []),
    ]
    passed = all(item["pass"] for item in checks)
    source_record = {
        "package_relative_path": source.relative_to(cfg.PACKAGE_DIR).as_posix(),
        "repository_relative_path": source.relative_to(repository_root).as_posix(),
        "bytes": source.stat().st_size,
        "sha256": sha256(source),
        "classification": "editable procedural CRT proportion-gate Blender source",
        "approval_state": "awaiting creative gate",
        "intendedCommit": True,
    }
    result = {
        "schema": "quantum-hub.phase-0-4-crt-television.proportion-source-validation.v1",
        "script_version": cfg.SCRIPT_VERSION,
        "status": "PASS" if passed else "FAIL",
        "source": source_record,
        "counts": {
            "objects": len(bpy.data.objects),
            "collections": len(bpy.data.collections),
            "materials": len(bpy.data.materials),
            "cameras": len(camera_objects),
            "external_libraries": external_libraries,
            "external_images": external_images,
            "packed_files": packed_files,
            "external_file_paths": len(external_paths),
            "missing_files": missing_files,
            "image_texture_nodes": image_texture_nodes,
        },
        "option_collections": option_collections,
        "screen_measurements": screen_measurements,
        "cabinet_measurements": cabinet_measurements,
        "checks": checks,
    }
    cfg.MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    cfg.VALIDATION_MANIFEST.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"QH_PHASE04_CRT_SOURCE_VALIDATION={result['status']}")
    print(f"QH_PHASE04_CRT_EXTERNAL_LIBRARIES={external_libraries}")
    print(f"QH_PHASE04_CRT_EXTERNAL_IMAGES={external_images}")
    print(f"QH_PHASE04_CRT_PACKED_FILES={packed_files}")
    print(f"QH_PHASE04_CRT_MISSING_FILES={missing_files}")
    if not passed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
