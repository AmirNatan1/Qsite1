"""Fail-closed validation for the refined Phase 0.4 CRT Blender source."""

from __future__ import annotations

import hashlib
import json
import math
import re
import sys
from pathlib import Path

import bpy

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import crt_canonical_config as canonical
import crt_refined_config as cfg


REPOSITORY_ROOT = cfg.PACKAGE_DIR.parents[2]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def repository_relative(path: Path) -> str:
    return path.resolve().relative_to(REPOSITORY_ROOT.resolve()).as_posix()


def evaluated_bounds(objects: list[bpy.types.Object]) -> tuple[list[float], list[float]]:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    minimum = [float("inf")] * 3
    maximum = [float("-inf")] * 3
    count = 0
    for source in objects:
        if source is None or source.type not in {"MESH", "CURVE", "FONT", "SURFACE", "META"}:
            continue
        evaluated = source.evaluated_get(depsgraph)
        mesh = None
        try:
            mesh = evaluated.to_mesh()
            for vertex in mesh.vertices:
                coordinate = evaluated.matrix_world @ vertex.co
                for axis in range(3):
                    minimum[axis] = min(minimum[axis], coordinate[axis])
                    maximum[axis] = max(maximum[axis], coordinate[axis])
                count += 1
        finally:
            if mesh is not None:
                evaluated.to_mesh_clear()
    if count == 0:
        raise RuntimeError("assembled bounds received zero evaluated vertices")
    return minimum, maximum


def check(checks: list[dict], identifier: str, passed: bool, actual, expected) -> None:
    checks.append(
        {
            "id": identifier,
            "name": identifier.replace("_", " "),
            "pass": bool(passed),
            "status": "PASS" if passed else "FAIL",
            "actual": actual,
            "expected": expected,
        }
    )


def camera_azimuth(name: str) -> float:
    spec = cfg.CAMERAS[name]
    camera = spec["location"]
    target = spec["target"]
    return math.degrees(math.atan2(camera[1] - target[1], camera[0] - target[0]))


def main() -> None:
    source = cfg.REFINED_BLEND
    script = Path(__file__).resolve()
    checks: list[dict] = []
    assembly = bpy.data.collections.get("REFINED_CRT_ASSEMBLY")
    check(checks, "refined_assembly_collection", assembly is not None, assembly.name if assembly else None, "REFINED_CRT_ASSEMBLY")
    physical_objects = [] if assembly is None else [obj for obj in assembly.all_objects if obj is not None and not obj.name.startswith(("CRT_Interface", "CRT_Scanline_", "CRT_WakeHorizontal", "CRT_InternalPhosphor"))]
    minimum, maximum = evaluated_bounds(physical_objects)
    assembled = {
        "width": round(maximum[0] - minimum[0], 6),
        "height": round(maximum[2] - minimum[2], 6),
        "depth": round(maximum[1] - minimum[1], 6),
        "minimum_world": [round(value, 6) for value in minimum],
        "maximum_world": [round(value, 6) for value in maximum],
        "method": "evaluated world-space bounds of all physical objects in REFINED_CRT_ASSEMBLY, including glass, feet, rear details and committed cable collar; excluding state-only phosphor/interface geometry",
    }
    bound_tolerances = {"width": 0.012, "height": 0.020, "depth": 0.035}
    for dimension in ("width", "height", "depth"):
        target = float(cfg.DIMENSIONS_M[dimension])
        actual = assembled[dimension]
        check(
            checks,
            f"assembled_overall_{dimension}",
            abs(actual - target) <= bound_tolerances[dimension],
            actual,
            {"target_m": target, "tolerance_m": bound_tolerances[dimension]},
        )

    glass = bpy.data.objects.get("CRT_ConvexThickSmokedGlass")
    phosphor = bpy.data.objects.get("CRT_InternalPhosphorLayer")
    check(checks, "convex_smoked_glass", glass is not None and float(glass.get("outward_bulge_m", 0.0)) >= 0.03 and float(glass.get("physical_thickness_m", 0.0)) >= 0.012, None if glass is None else {"outward_bulge_m": glass.get("outward_bulge_m"), "physical_thickness_m": glass.get("physical_thickness_m")}, {"minimum_bulge_m": 0.03, "minimum_thickness_m": 0.012})
    check(checks, "separate_phosphor_layer", phosphor is not None and phosphor != glass, phosphor.name if phosphor else None, "distinct CRT_InternalPhosphorLayer")
    aspect = cfg.SCREEN_VISIBLE_M["width"] / cfg.SCREEN_VISIBLE_M["height"]
    check(checks, "visible_screen_aspect_4_3", abs(aspect - 4.0 / 3.0) <= 1e-6, round(aspect, 9), round(4.0 / 3.0, 9))

    desktop = bpy.data.collections.get("DESKTOP_2_5_TURN_SPIRAL_CABLE")
    mobile = bpy.data.collections.get("MOBILE_2_25_TURN_SPIRAL_CABLE")
    desktop_sheath = bpy.data.objects.get("SpiralCable_ContinuousGraphiteSheath")
    mobile_sheath = bpy.data.objects.get("MobileSpiralCable_ContinuousGraphiteSheath")
    check(checks, "desktop_spiral_2_5_turns", desktop is not None and desktop_sheath is not None and abs(float(desktop_sheath.get("turns", 0.0)) - 2.5) <= 1e-9, None if desktop_sheath is None else desktop_sheath.get("turns"), 2.5)
    check(checks, "mobile_spiral_2_25_turns", mobile is not None and mobile_sheath is not None and abs(float(mobile_sheath.get("turns", 0.0)) - 2.25) <= 1e-9, None if mobile_sheath is None else mobile_sheath.get("turns"), 2.25)
    check(checks, "mobile_authored_separately", bool(bpy.context.scene.get("mobile_composition_authored_separately", False)), bool(bpy.context.scene.get("mobile_composition_authored_separately", False)), True)
    collar = bpy.data.objects.get("CRT_IntegratedCableCollar")
    ribs = [bpy.data.objects.get(f"CRT_StrainReliefRib_{index:02d}") for index in range(1, 7)]
    check(checks, "physical_rear_cable_connection", collar is not None and all(rib is not None for rib in ribs) and desktop_sheath is not None and "rear strain relief" in str(desktop_sheath.get("physical_continuity", "")), {"collar": collar.name if collar else None, "strain_relief_ribs": sum(rib is not None for rib in ribs), "desktop_continuity": None if desktop_sheath is None else desktop_sheath.get("physical_continuity")}, {"collar": "CRT_IntegratedCableCollar", "strain_relief_ribs": 6, "continuous_sheath_committed": True})
    if desktop_sheath is not None:
        shoulder = float(desktop_sheath.get("shoulder_crown_relative_m", 0.0))
        floor = float(desktop_sheath.get("groove_floor_relative_m", 0.0))
        check(checks, "recessed_conductor_channel", shoulder > floor and abs(shoulder - floor) >= 0.008, {"shoulder_crown_relative_m": shoulder, "groove_floor_relative_m": floor, "recess_depth_below_shoulders_m": round(shoulder - floor, 6)}, {"minimum_recess_depth_below_shoulders_m": 0.008})

    external_libraries = len(bpy.data.libraries)
    external_images = len(bpy.data.images)
    packed_files = sum(1 for image in bpy.data.images if image.packed_file is not None)
    image_texture_nodes = sum(1 for material in bpy.data.materials if material.use_nodes and material.node_tree for node in material.node_tree.nodes if node.bl_idname == "ShaderNodeTexImage")
    external_paths = []
    for library in bpy.data.libraries:
        if library.filepath:
            external_paths.append(library.filepath)
    for image in bpy.data.images:
        if image.filepath:
            external_paths.append(image.filepath)
    for clip in bpy.data.movieclips:
        if clip.filepath:
            external_paths.append(clip.filepath)
    for sound in bpy.data.sounds:
        if sound.filepath:
            external_paths.append(sound.filepath)
    missing_files = [path for path in external_paths if path and not Path(bpy.path.abspath(path)).exists()]
    for identifier, actual in (
        ("external_libraries", external_libraries),
        ("external_images", external_images),
        ("packed_files", packed_files),
        ("external_paths", len(external_paths)),
        ("missing_files", len(missing_files)),
        ("image_texture_nodes", image_texture_nodes),
    ):
        check(checks, identifier, actual == 0, actual, 0)

    scene = bpy.context.scene
    check(checks, "modelled_from_scratch", bool(scene.get("modelled_from_scratch", False)), bool(scene.get("modelled_from_scratch", False)), True)
    check(checks, "private_photo_loaded", scene.get("private_reference_loaded_in_blender", None) is False, scene.get("private_reference_loaded_in_blender", None), False)
    check(checks, "third_party_models", int(scene.get("third_party_models", -1)) == 0, int(scene.get("third_party_models", -1)), 0)
    check(checks, "full_animatic_created", scene.get("full_animatic_created", None) is False, scene.get("full_animatic_created", None), False)
    prohibited_brand_terms = {"sony", "panasonic", "toshiba", "philips", "samsung", "lg", "jvc", "hitachi", "sharp", "rca", "grundig"}
    names = [obj.name for obj in bpy.data.objects] + [material.name for material in bpy.data.materials]
    tokens = {
        token
        for name in names
        for token in re.split(r"[^a-z0-9]+", name.lower())
        if token
    }
    found_brands = sorted(prohibited_brand_terms.intersection(tokens))
    check(checks, "manufacturer_branding", not found_brands, found_brands, [])

    layout_hash = sha256(cfg.PORTAL_LAYOUT)
    check(checks, "portal_layout_authority", layout_hash == cfg.PORTAL_LAYOUT_SHA256 and scene.get("portal_layout_sha256") == cfg.PORTAL_LAYOUT_SHA256, {"file_sha256": layout_hash, "scene_sha256": scene.get("portal_layout_sha256")}, cfg.PORTAL_LAYOUT_SHA256)
    source_generator = SCRIPT_DIR / "build_refined_crt.py"
    refined_config = Path(cfg.__file__).resolve()
    canonical_config = Path(canonical.__file__).resolve()
    embedded_lineage = {
        "source_generator_sha256": scene.get("source_generator_sha256"),
        "refined_config_sha256": scene.get("refined_config_sha256"),
        "canonical_config_sha256": scene.get("canonical_config_sha256"),
    }
    expected_lineage = {
        "source_generator_sha256": sha256(source_generator),
        "refined_config_sha256": sha256(refined_config),
        "canonical_config_sha256": sha256(canonical_config),
    }
    check(checks, "embedded_source_lineage", embedded_lineage == expected_lineage, embedded_lineage, expected_lineage)
    physical_copy = {
        "brand": "QUANTUM HUB",
        "route": ["FRAME", "SOURCE", "ASSESS", "TEST", "DECIDE"],
        "status": "TEST ROUTE AVAILABLE",
    }
    title = bpy.data.objects.get("CRT_InterfaceTitle")
    status = bpy.data.objects.get("CRT_InterfaceStatus")
    carrier = bpy.data.objects.get("CRT_InterfaceRouteCarrier")
    actual_copy = {
        "brand": None if title is None else title.get("source_body", "QUANTUM HUB"),
        "route": None if carrier is None else json.loads(carrier.get("route_words_json", "[]")),
        "status": None if status is None else status.get("source_body", "TEST ROUTE AVAILABLE"),
    }
    check(checks, "physical_screen_copy", actual_copy == physical_copy, actual_copy, physical_copy)

    power_ids = [key for key in canonical.CANONICAL_STATES if key.startswith("power-")]
    portal_ids = canonical.PORTAL_STATE_IDS
    embedded_power_ids = json.loads(scene.get("power_state_ids_json", "[]"))
    embedded_portal_ids = json.loads(scene.get("portal_state_ids_json", "[]"))
    check(
        checks,
        "exact_seven_power_states",
        power_ids == canonical.POWER_STATE_IDS
        and embedded_power_ids == canonical.POWER_STATE_IDS
        and len(power_ids) == 7,
        {"configured": power_ids, "embedded": embedded_power_ids},
        canonical.POWER_STATE_IDS,
    )
    check(
        checks,
        "exact_eight_portal_states",
        portal_ids == canonical.PORTAL_STATE_IDS
        and embedded_portal_ids == canonical.PORTAL_STATE_IDS
        and len(portal_ids) == 8
        and len(set(portal_ids)) == 8,
        {"configured": portal_ids, "embedded": embedded_portal_ids},
        canonical.PORTAL_STATE_IDS,
    )
    arrival = camera_azimuth("Camera_Path_Arrival")
    power_front = camera_azimuth("Camera_Power_Front")
    camera_arc = abs(power_front - arrival)
    check(checks, "camera_arrival_to_power_arc", 20.0 <= camera_arc <= 30.0, round(camera_arc, 6), {"minimum_degrees": 20.0, "maximum_degrees": 30.0})

    failed = [item["id"] for item in checks if item["status"] != "PASS"]
    manifest = {
        "schema": "quantum-hub.phase-0-4-crt-television.blender-source-validation.v1",
        "status": "PASS" if not failed else "FAIL",
        "selected_option": "A",
        "selected_design": "Rounded 1990s domestic CRT",
        "source": {
            "package_relative_path": source.relative_to(cfg.PACKAGE_DIR).as_posix(),
            "repository_relative_path": repository_relative(source),
            "bytes": source.stat().st_size,
            "sha256": sha256(source),
            "signature": "BLENDER Zstd-compressed editable source",
        },
        "validator": {
            "package_relative_path": script.relative_to(cfg.PACKAGE_DIR).as_posix(),
            "repository_relative_path": repository_relative(script),
            "bytes": script.stat().st_size,
            "sha256": sha256(script),
        },
        "assembled_overall_dimensions_m": assembled,
        "visible_screen": {**cfg.SCREEN_VISIBLE_M, "aspect_numeric": round(aspect, 9)},
        "desktop_spiral_turns": cfg.DESKTOP_SPIRAL_TURNS,
        "mobile_spiral_turns": cfg.MOBILE_SPIRAL_TURNS,
        "mobile_composition_authored_separately": bool(scene.get("mobile_composition_authored_separately", False)),
        "camera_arc_degrees": round(camera_arc, 6),
        "external_libraries": external_libraries,
        "external_images": external_images,
        "packed_files": packed_files,
        "external_paths": len(external_paths),
        "external_file_paths": len(external_paths),
        "missing_files": len(missing_files),
        "image_texture_nodes": image_texture_nodes,
        "third_party_models": int(scene.get("third_party_models", -1)),
        "modelled_from_scratch": bool(scene.get("modelled_from_scratch", False)),
        "private_photo_loaded": bool(scene.get("private_reference_loaded_in_blender", False)),
        "full_animatic_created": bool(scene.get("full_animatic_created", False)),
        "manufacturer_branding": False if not found_brands else found_brands,
        "physical_rear_cable_connection_committed": collar is not None and all(rib is not None for rib in ribs),
        "portal_layout_sha256": cfg.PORTAL_LAYOUT_SHA256,
        "checks": checks,
        "failed_checks": failed,
    }
    target = cfg.MANIFEST_DIR / "blender-source-validation.json"
    target.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"QH_PHASE04_CRT_BLENDER_VALIDATION={manifest['status']}")
    print(f"QH_PHASE04_CRT_BLENDER_CHECKS={len(checks) - len(failed)}/{len(checks)}")
    print(f"QH_PHASE04_CRT_ASSEMBLED_BOUNDS={json.dumps(assembled, sort_keys=True)}")
    if failed:
        raise RuntimeError(f"refined CRT validation failed: {failed}")


if __name__ == "__main__":
    main()
