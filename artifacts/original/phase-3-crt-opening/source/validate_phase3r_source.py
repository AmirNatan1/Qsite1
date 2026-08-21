"""Fail-closed independent validation of the Phase 3-R CRT derivative.

The validator is intentionally run with the repaired derivative open. It binds
that file to the hash written by the source-build manifest, validates the
screen-only repair contract, then opens the accepted Phase 3 parent in the same
Blender process and independently compares the complete frozen-scene snapshot.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any

import bpy

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import phase3r_config as cfg


ACCEPTED_PHASE0_SHA256 = "3027c4c46e2b829fd97ee9a3a47558e43adda47abcc488420faa0f087bd720a7"
ACCEPTED_PHASE3_SHA256 = "bbde82220f500c6f047c2e2d33a8580c08a40e65800615dd7256bebc2f4472ba"
SOURCE_BUILD_MANIFEST = cfg.MANIFEST_ROOT / "phase-3-r-source-build.json"
VALIDATION_MANIFEST = cfg.MANIFEST_ROOT / "phase-3-r-source-validation.json"

SCREEN_OBJECTS = {
    "CRT_WakeHorizontalPhosphorLine",
    "CRT_InternalPhosphorLayer",
    "CRT_InterfaceTitle",
    "CRT_InterfaceRouteCarrier",
    "CRT_InterfaceStatus",
    "Phase3_ScreenSpill",
}
SCREEN_OBJECT_PREFIXES = (
    "CRT_StartupExpansionScanline_",
    "CRT_Scanline_",
    "Phase3R_",
)
SCREEN_MATERIALS = {
    "Phase3_WakeHorizontalPhosphorLine",
    "Phase3_StartupRasterWarming",
    "Phase3_SubtleScanline",
    "Phase3_AnimatedPhosphor",
    "Phase3_Interface_Brand",
    "Phase3_Interface_Route",
    "Phase3_Interface_Ready",
    # The accepted carrier material becomes unused when the permitted optical
    # portal-cue repair assigns its Phase3R replacement. Blender drops that
    # zero-user material on save/reload, so both are screen allowlist members.
    "Phase3_TextFreePortalContinuityCue",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def portable_path(path: Path) -> str:
    resolved = path.resolve()
    try:
        return resolved.relative_to(cfg.REPOSITORY_ROOT.resolve()).as_posix()
    except ValueError:
        return f"<outside-repository>/{resolved.name}"


def file_record(path: Path) -> dict[str, Any]:
    return {
        "filename": path.name,
        "repository_relative_path": portable_path(path),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def check(records: list[dict[str, Any]], identifier: str, passed: bool, actual: Any, expected: Any) -> None:
    records.append(
        {
            "id": identifier,
            "status": "PASS" if passed else "FAIL",
            "pass": bool(passed),
            "actual": actual,
            "expected": expected,
        }
    )


def close(actual: float | None, expected: float, tolerance: float = 1e-6) -> bool:
    return actual is not None and math.isclose(actual, expected, rel_tol=0.0, abs_tol=tolerance)


def rounded(value: Any) -> Any:
    if isinstance(value, bool) or value is None or isinstance(value, str):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return round(value, 9)
    if hasattr(value, "__len__"):
        try:
            return [rounded(item) for item in value]
        except TypeError:
            return str(value)
    return str(value)


def primitive_properties(owner: Any) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key in sorted(owner.keys()):
        value = owner.get(key)
        if isinstance(value, (bool, int, float, str)) or value is None:
            result[str(key)] = rounded(value)
    return result


def action_curves(action: Any) -> list[tuple[str, Any]]:
    legacy = getattr(action, "fcurves", None)
    if legacy is not None:
        return [("legacy", curve) for curve in legacy]
    result: list[tuple[str, Any]] = []
    for layer in getattr(action, "layers", ()):
        for strip in getattr(layer, "strips", ()):
            for channelbag in getattr(strip, "channelbags", ()):
                slot = getattr(channelbag, "slot", None)
                label = str(getattr(slot, "identifier", getattr(slot, "name", "slot")))
                result.extend((label, curve) for curve in channelbag.fcurves)
    return result


def action_signature(owner: Any) -> list[dict[str, Any]]:
    animation = getattr(owner, "animation_data", None)
    action = None if animation is None else animation.action
    if action is None:
        return []
    return [
        {
            "slot": slot,
            "path": curve.data_path,
            "index": int(curve.array_index),
            "points": [
                {
                    "co": rounded(point.co),
                    "interpolation": point.interpolation,
                    "left": rounded(point.handle_left),
                    "right": rounded(point.handle_right),
                }
                for point in curve.keyframe_points
            ],
        }
        for slot, curve in sorted(
            action_curves(action), key=lambda item: (item[0], item[1].data_path, item[1].array_index)
        )
    ]


def geometry_signature(obj: bpy.types.Object) -> dict[str, Any]:
    data = obj.data
    if obj.type == "MESH":
        return {
            "vertices": [rounded(vertex.co) for vertex in data.vertices],
            "edges": [list(edge.vertices) for edge in data.edges],
            "polygons": [list(polygon.vertices) for polygon in data.polygons],
        }
    if obj.type == "CURVE":
        splines = []
        for spline in data.splines:
            record: dict[str, Any] = {"type": spline.type, "cyclic": bool(spline.use_cyclic_u)}
            if spline.type == "BEZIER":
                record["bezier"] = [
                    {
                        "co": rounded(point.co),
                        "left": rounded(point.handle_left),
                        "right": rounded(point.handle_right),
                    }
                    for point in spline.bezier_points
                ]
            else:
                record["points"] = [rounded(point.co) for point in spline.points]
            splines.append(record)
        return {
            "dimensions": data.dimensions,
            "bevel_depth": rounded(data.bevel_depth),
            "bevel_resolution": int(data.bevel_resolution),
            "splines": splines,
        }
    if obj.type == "LIGHT":
        return {
            "light_type": data.type,
            "color": rounded(data.color),
            "energy": rounded(data.energy),
            "shape": getattr(data, "shape", None),
            "size": rounded(getattr(data, "size", 0.0)),
            "size_y": rounded(getattr(data, "size_y", 0.0)),
        }
    if obj.type == "CAMERA":
        return {
            "lens": rounded(data.lens),
            "sensor_fit": data.sensor_fit,
            "sensor_width": rounded(data.sensor_width),
            "sensor_height": rounded(data.sensor_height),
            "clip_start": rounded(data.clip_start),
            "clip_end": rounded(data.clip_end),
            "dof": bool(data.dof.use_dof),
        }
    return {"data_name": getattr(data, "name", None)}


def socket_default(socket: Any) -> Any:
    if not hasattr(socket, "default_value"):
        return None
    return rounded(socket.default_value)


def material_signature(material: bpy.types.Material) -> dict[str, Any]:
    if material.node_tree is None:
        return {"name": material.name, "use_nodes": False, "diffuse": rounded(material.diffuse_color)}
    nodes = []
    for node in sorted(material.node_tree.nodes, key=lambda item: item.name):
        nodes.append(
            {
                "name": node.name,
                "type": node.bl_idname,
                "inputs": {
                    socket.name: socket_default(socket)
                    for socket in node.inputs
                    if hasattr(socket, "default_value")
                },
                "outputs": {
                    socket.name: socket_default(socket)
                    for socket in node.outputs
                    if hasattr(socket, "default_value")
                },
            }
        )
    links = sorted(
        (link.from_node.name, link.from_socket.name, link.to_node.name, link.to_socket.name)
        for link in material.node_tree.links
    )
    return {
        "name": material.name,
        "use_nodes": True,
        "nodes": nodes,
        "links": links,
        "animation": action_signature(material.node_tree),
        "properties": primitive_properties(material),
    }


def is_screen_object(obj: bpy.types.Object) -> bool:
    return obj.name in SCREEN_OBJECTS or obj.name.startswith(SCREEN_OBJECT_PREFIXES)


def is_screen_material(material: bpy.types.Material) -> bool:
    return material.name in SCREEN_MATERIALS or material.name.startswith("Phase3R_")


def frozen_snapshot() -> dict[str, Any]:
    scene = bpy.context.scene
    scene.frame_set(cfg.FRAME_START)
    objects = []
    for obj in sorted(bpy.data.objects, key=lambda item: item.name):
        if is_screen_object(obj):
            continue
        objects.append(
            {
                "name": obj.name,
                "type": obj.type,
                "parent": None if obj.parent is None else obj.parent.name,
                "collections": sorted(collection.name for collection in obj.users_collection),
                "location": rounded(obj.location),
                "rotation": rounded(obj.rotation_euler),
                "scale": rounded(obj.scale),
                "hide_render": bool(obj.hide_render),
                "materials": (
                    ["<screen-material-allowlist>"]
                    if obj.name.startswith("CRT_TextFree")
                    else [material.name for material in getattr(obj.data, "materials", ())]
                ),
                "properties": primitive_properties(obj),
                "geometry": geometry_signature(obj),
                "object_animation": action_signature(obj),
                "data_animation": action_signature(obj.data),
            }
        )
    materials = [
        material_signature(material)
        for material in sorted(bpy.data.materials, key=lambda item: item.name)
        if not is_screen_material(material)
    ]
    collections = [
        {
            "name": collection.name,
            "hide_render": bool(collection.hide_render),
            "objects": sorted(obj.name for obj in collection.objects if not is_screen_object(obj)),
            "children": sorted(child.name for child in collection.children),
            "properties": primitive_properties(collection),
        }
        for collection in sorted(bpy.data.collections, key=lambda item: item.name)
        if not collection.name.startswith("PHASE3R_")
    ]
    return {
        "timeline": {
            "fps": scene.render.fps,
            "fps_base": rounded(scene.render.fps_base),
            "start": scene.frame_start,
            "end": scene.frame_end,
            "events": list(cfg.EVENTS.items()),
        },
        "objects": objects,
        "materials": materials,
        "collections": collections,
        "external": {
            "images": len(bpy.data.images),
            "libraries": len(bpy.data.libraries),
            "sounds": len(bpy.data.sounds),
            "movieclips": len(bpy.data.movieclips),
            "cache_files": len(bpy.data.cache_files),
            "paths": sorted(set(bpy.utils.blend_paths(absolute=True, packed=False, local=False))),
        },
    }


def snapshot_hash(snapshot: dict[str, Any]) -> str:
    payload = json.dumps(snapshot, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def material_value(material: bpy.types.Material | None, node_name: str, socket_name: str) -> float | None:
    if material is None or material.node_tree is None:
        return None
    node = material.node_tree.nodes.get(node_name)
    if node is None:
        return None
    socket = node.outputs.get(socket_name)
    if socket is None:
        socket = node.inputs.get(socket_name)
    if socket is None or not hasattr(socket, "default_value"):
        return None
    return float(socket.default_value)


def material_color(
    material: bpy.types.Material | None, node_name: str, socket_name: str
) -> tuple[float, float, float] | None:
    if material is None or material.node_tree is None:
        return None
    node = material.node_tree.nodes.get(node_name)
    if node is None:
        return None
    socket = node.outputs.get(socket_name)
    if socket is None or not hasattr(socket, "default_value"):
        return None
    return tuple(float(channel) for channel in socket.default_value[:3])


def hidden_state(objects: list[bpy.types.Object], frames: tuple[int, ...]) -> dict[str, bool]:
    scene = bpy.context.scene
    result: dict[str, bool] = {}
    for frame in frames:
        scene.frame_set(frame)
        result[str(frame)] = all(obj.hide_render for obj in objects)
    return result


def no_object_animation(objects: list[bpy.types.Object]) -> bool:
    return all(
        obj.animation_data is None or obj.animation_data.action is None
        for obj in objects
    )


def main() -> None:
    records: list[dict[str, Any]] = []
    if not SOURCE_BUILD_MANIFEST.is_file():
        raise RuntimeError(f"missing Phase 3-R source-build manifest: {SOURCE_BUILD_MANIFEST}")
    build_manifest = json.loads(SOURCE_BUILD_MANIFEST.read_text(encoding="utf-8"))
    build_derivative = build_manifest.get("phase3r_derivative", {})
    expected_new_hash = str(build_derivative.get("sha256", ""))
    expected_new_bytes = int(build_derivative.get("bytes", -1))
    expected_package_path = cfg.DERIVATIVE_SOURCE.relative_to(cfg.PACKAGE_DIR).as_posix()

    opened_source = Path(bpy.data.filepath).resolve()
    phase0_hash = sha256(cfg.ACCEPTED_SOURCE)
    phase3_hash = sha256(cfg.PHASE3_DERIVATIVE_SOURCE)
    derivative_hash = sha256(cfg.DERIVATIVE_SOURCE)
    derivative_bytes = cfg.DERIVATIVE_SOURCE.stat().st_size
    scene = bpy.context.scene

    check(records, "accepted_phase0_hash", phase0_hash == ACCEPTED_PHASE0_SHA256, phase0_hash, ACCEPTED_PHASE0_SHA256)
    check(records, "accepted_phase3_parent_hash", phase3_hash == ACCEPTED_PHASE3_SHA256, phase3_hash, ACCEPTED_PHASE3_SHA256)
    check(records, "config_phase3_parent_hash", cfg.PHASE3_DERIVATIVE_SHA256 == ACCEPTED_PHASE3_SHA256, cfg.PHASE3_DERIVATIVE_SHA256, ACCEPTED_PHASE3_SHA256)
    check(records, "source_build_status", build_manifest.get("status") == "PASS", build_manifest.get("status"), "PASS")
    check(
        records,
        "source_build_derivative_path",
        build_derivative.get("package_relative_path") == expected_package_path,
        build_derivative.get("package_relative_path"),
        expected_package_path,
    )
    check(records, "source_build_derivative_hash_bound", bool(expected_new_hash) and derivative_hash == expected_new_hash, derivative_hash, expected_new_hash)
    check(records, "source_build_derivative_bytes_bound", derivative_bytes == expected_new_bytes, derivative_bytes, expected_new_bytes)
    check(records, "opened_phase3r_derivative", opened_source == cfg.DERIVATIVE_SOURCE.resolve(), portable_path(opened_source), portable_path(cfg.DERIVATIVE_SOURCE))
    check(
        records,
        "historical_sources_not_overwritten",
        len({cfg.ACCEPTED_SOURCE.resolve(), cfg.PHASE3_DERIVATIVE_SOURCE.resolve(), cfg.DERIVATIVE_SOURCE.resolve()}) == 3,
        [portable_path(path) for path in (cfg.ACCEPTED_SOURCE, cfg.PHASE3_DERIVATIVE_SOURCE, cfg.DERIVATIVE_SOURCE)],
        "three distinct source authorities",
    )

    check(records, "phase3r_schema", scene.get("phase3r_schema") == "quantum-hub.phase-3-r-crt-authenticity.production-source.v1", scene.get("phase3r_schema"), "quantum-hub.phase-3-r-crt-authenticity.production-source.v1")
    check(records, "repair_parent", scene.get("phase3r_repair_parent") == cfg.REPAIR_PARENT, scene.get("phase3r_repair_parent"), cfg.REPAIR_PARENT)
    check(records, "parent_derivative_property", scene.get("phase3r_phase3_derivative_sha256") == ACCEPTED_PHASE3_SHA256, scene.get("phase3r_phase3_derivative_sha256"), ACCEPTED_PHASE3_SHA256)
    check(records, "repair_scope", scene.get("phase3r_scope") == "phosphor/raster/startup only", scene.get("phase3r_scope"), "phosphor/raster/startup only")
    check(records, "timeline_changed_false", scene.get("phase3r_timeline_changed") is False and build_manifest.get("timeline_changed") is False, {"scene": scene.get("phase3r_timeline_changed"), "manifest": build_manifest.get("timeline_changed")}, {"scene": False, "manifest": False})
    check(records, "timeline_fps", scene.render.fps == 30 and close(float(scene.render.fps_base), 1.0), {"fps": scene.render.fps, "fps_base": scene.render.fps_base}, {"fps": 30, "fps_base": 1.0})
    check(records, "timeline_frames", scene.frame_start == 1 and scene.frame_end == 270, {"start": scene.frame_start, "end": scene.frame_end}, {"start": 1, "end": 270})
    check(records, "deterministic_no_random_events", int(scene.get("phase3r_random_events", -1)) == 0, scene.get("phase3r_random_events"), 0)

    build_frozen = build_manifest.get("frozen_signature", {})
    build_before = str(build_frozen.get("before_sha256", ""))
    build_after = str(build_frozen.get("after_sha256", ""))
    stored_frozen = str(scene.get("phase3r_frozen_signature_sha256", ""))
    check(records, "source_build_frozen_exact", bool(build_before) and build_before == build_after and build_frozen.get("exact_match") is True, build_frozen, "non-empty before == after and exact_match true")
    check(records, "frozen_signature_derivative_property", stored_frozen == build_before, stored_frozen, build_before)

    legacy_frames = (1, 121, 126, 132, 144, 154, 182, 250, 265, 270)
    expansion_collection = bpy.data.collections.get("CRT_STARTUP_RASTER_EXPANSION")
    expansion_objects = [] if expansion_collection is None else list(expansion_collection.all_objects)
    expansion_hidden = hidden_state(expansion_objects, legacy_frames) if expansion_objects else {}
    check(records, "legacy_expansion_object_count", len(expansion_objects) == 18, len(expansion_objects), 18)
    check(records, "legacy_expansion_hidden_all_representative_frames", bool(expansion_hidden) and all(expansion_hidden.values()), expansion_hidden, "all true")
    check(records, "legacy_expansion_animation_removed", no_object_animation(expansion_objects), no_object_animation(expansion_objects), True)

    scan_collection = bpy.data.collections.get("CRT_SCANLINE_GEOMETRY")
    scan_objects = [] if scan_collection is None else list(scan_collection.all_objects)
    scan_hidden = hidden_state(scan_objects, legacy_frames) if scan_objects else {}
    check(records, "legacy_coarse_scanline_object_count", len(scan_objects) == 32, len(scan_objects), 32)
    check(records, "legacy_coarse_scanlines_hidden_all_representative_frames", bool(scan_hidden) and all(scan_hidden.values()), scan_hidden, "all true")
    check(records, "legacy_coarse_scanline_animation_removed", no_object_animation(scan_objects), no_object_animation(scan_objects), True)

    legacy_wake = bpy.data.objects.get("CRT_WakeHorizontalPhosphorLine")
    legacy_wake_state = hidden_state([legacy_wake], legacy_frames) if legacy_wake is not None else {}
    check(records, "legacy_magenta_wake_retired", legacy_wake is not None and all(legacy_wake_state.values()) and no_object_animation([legacy_wake]), {"frames": legacy_wake_state, "animation_removed": False if legacy_wake is None else no_object_animation([legacy_wake])}, "hidden and unanimated")

    wake_names = ("Phase3R_WakePhosphorHalo", "Phase3R_WakePhosphorBody", "Phase3R_WakePhosphorCore")
    wake_objects = [bpy.data.objects.get(name) for name in wake_names]
    wake_complete = all(obj is not None for obj in wake_objects)
    check(records, "neutral_wake_three_layer_geometry", wake_complete, [None if obj is None else obj.name for obj in wake_objects], list(wake_names))
    wake_collection = bpy.data.collections.get("PHASE3R_CRT_SCREEN_REPAIR")
    check(records, "repair_collection_screen_only", wake_collection is not None and sorted(obj.name for obj in wake_collection.all_objects) == sorted(wake_names), [] if wake_collection is None else sorted(obj.name for obj in wake_collection.all_objects), sorted(wake_names))

    wake_material_names = ("Phase3R_WakeHalo_Neutral", "Phase3R_WakeBody_Neutral", "Phase3R_WakeCore_Neutral")
    wake_materials = [bpy.data.materials.get(name) for name in wake_material_names]
    expected_tone = (0.693871761, 0.679542469, 0.630757137)
    wake_tones = {name: material_color(material, "Phase3R Phosphor Tone", "Color") for name, material in zip(wake_material_names, wake_materials)}
    tones_neutral = all(
        tone is not None and all(close(channel, target, 2e-6) for channel, target in zip(tone, expected_tone))
        for tone in wake_tones.values()
    )
    check(records, "startup_line_neutral_warm_white", tones_neutral, wake_tones, {name: expected_tone for name in wake_material_names})
    check(records, "startup_line_not_magenta", all(tone is not None and abs(tone[0] - tone[2]) < 0.08 and abs(tone[0] - tone[1]) < 0.03 for tone in wake_tones.values()), wake_tones, "warm-neutral channel separation, not Quantum magenta")

    wake_visibility: dict[str, dict[str, bool]] = {}
    if wake_complete:
        for frame in (120, 121, 126, 132, 136, 137, 270):
            scene.frame_set(frame)
            wake_visibility[str(frame)] = {obj.name: bool(obj.hide_render) for obj in wake_objects if obj is not None}
    expected_visibility = {"120": True, "121": False, "126": False, "132": False, "136": False, "137": True, "270": True}
    wake_visibility_pass = wake_complete and all(
        all(hidden == expected_visibility[frame] for hidden in states.values())
        for frame, states in wake_visibility.items()
    ) and set(wake_visibility) == set(expected_visibility)
    check(records, "startup_line_visibility_window", wake_visibility_pass, wake_visibility, {frame: {"all_hidden": hidden} for frame, hidden in expected_visibility.items()})

    scene.frame_set(126)
    wake_strengths = {
        name: material_value(material, "Principled BSDF", "Emission Strength")
        for name, material in zip(wake_material_names, wake_materials)
    }
    expected_strengths = {"Phase3R_WakeHalo_Neutral": 0.320, "Phase3R_WakeBody_Neutral": 0.620, "Phase3R_WakeCore_Neutral": 1.600}
    check(records, "startup_line_restrained_layered_emission", all(close(wake_strengths[name], expected) for name, expected in expected_strengths.items()), wake_strengths, expected_strengths)

    bow_actual: dict[str, float] = {}
    depth_pass = wake_complete
    if wake_complete:
        for obj in wake_objects:
            assert obj is not None
            points = list(obj.data.splines[0].points)
            center = float(points[len(points) // 2].co.z)
            edge = 0.5 * (float(points[0].co.z) + float(points[-1].co.z))
            bow_actual[obj.name] = center - edge
            depth_pass = depth_pass and all(-0.390 < float(point.co.y) < -0.330 for point in points)
    check(records, "startup_line_modest_bow", wake_complete and all(0.0040 <= bow <= 0.0055 for bow in bow_actual.values()), bow_actual, "0.0040 to 0.0055 metres")
    check(records, "startup_line_within_glass_depth", depth_pass, {"y_range": "-0.390 < y < -0.330", "roles": [None if obj is None else obj.get("phase3r_role") for obj in wake_objects]}, "all points seated within accepted convex-glass depth")
    check(records, "startup_noise_static", all(material is not None and material.get("phase3r_noise_temporal") is False for material in wake_materials), {name: None if material is None else material.get("phase3r_noise_temporal") for name, material in zip(wake_material_names, wake_materials)}, {name: False for name in wake_material_names})

    phosphor = bpy.data.objects.get("CRT_InternalPhosphorLayer")
    desktop_field = bpy.data.materials.get("Phase3R_PhosphorField_Desktop")
    mobile_field = bpy.data.materials.get("Phase3R_PhosphorField_Mobile")
    assigned_field = None if phosphor is None or not phosphor.data.materials else phosphor.data.materials[0].name
    check(records, "continuous_field_assigned", assigned_field == "Phase3R_PhosphorField_Desktop", assigned_field, "Phase3R_PhosphorField_Desktop")
    field_nodes = [] if desktop_field is None or desktop_field.node_tree is None else sorted(node.name for node in desktop_field.node_tree.nodes)
    required_field_nodes = {
        "Fine Physical Raster",
        "Continuous Field First",
        "Phase3R Picture Field Half Height",
        "Soft Vertical Picture Formation",
        "Soft Field With Internal Raster",
    }
    check(records, "continuous_picture_field_node_topology", required_field_nodes.issubset(field_nodes), field_nodes, sorted(required_field_nodes))
    check(records, "picture_field_first_properties", desktop_field is not None and mobile_field is not None and desktop_field.get("phase3r_picture_field_first") is True and mobile_field.get("phase3r_picture_field_first") is True, {"desktop": None if desktop_field is None else desktop_field.get("phase3r_picture_field_first"), "mobile": None if mobile_field is None else mobile_field.get("phase3r_picture_field_first")}, {"desktop": True, "mobile": True})
    raster_bands = {"desktop": None if desktop_field is None else desktop_field.get("phase3r_raster_bands"), "mobile": None if mobile_field is None else mobile_field.get("phase3r_raster_bands")}
    check(records, "variant_specific_raster_density", close(raster_bands["desktop"], 160.0) and close(raster_bands["mobile"], 112.0), raster_bands, {"desktop": 160.0, "mobile": 112.0})
    check(records, "mobile_field_persisted", mobile_field is not None and mobile_field.use_fake_user, None if mobile_field is None else mobile_field.use_fake_user, True)
    check(records, "field_noise_static", desktop_field is not None and mobile_field is not None and desktop_field.get("phase3r_noise_temporal") is False and mobile_field.get("phase3r_noise_temporal") is False, {"desktop": None if desktop_field is None else desktop_field.get("phase3r_noise_temporal"), "mobile": None if mobile_field is None else mobile_field.get("phase3r_noise_temporal")}, {"desktop": False, "mobile": False})

    field_sample_frames = (1, 132, 144, 154, 162, 176, 210, 247, 255, 262, 270)
    desktop_field_samples: dict[str, dict[str, float | None]] = {}
    mobile_field_samples: dict[str, dict[str, float | None]] = {}
    for frame in field_sample_frames:
        scene.frame_set(frame)
        desktop_field_samples[str(frame)] = {
            "emission": material_value(desktop_field, "Principled BSDF", "Emission Strength"),
            "raster_contrast": material_value(desktop_field, "Phase3R Raster Contrast", "Value"),
            "field_half_height": material_value(desktop_field, "Phase3R Picture Field Half Height", "Value"),
        }

    # Blender does not evaluate animation on an otherwise-unused fake-user
    # node tree. Assign the mobile material temporarily, exactly as the mobile
    # render driver does, sample it, and restore the desktop authority without
    # saving the file.
    if phosphor is not None and mobile_field is not None:
        phosphor.data.materials[0] = mobile_field
    for frame in field_sample_frames:
        scene.frame_set(frame)
        mobile_field_samples[str(frame)] = {
            "emission": material_value(mobile_field, "Principled BSDF", "Emission Strength"),
            "raster_contrast": material_value(mobile_field, "Phase3R Raster Contrast", "Value"),
            "field_half_height": material_value(mobile_field, "Phase3R Picture Field Half Height", "Value"),
        }
    if phosphor is not None and desktop_field is not None:
        phosphor.data.materials[0] = desktop_field
    scene.frame_set(cfg.FRAME_START)
    formation_pass = (
        close(desktop_field_samples["1"]["emission"], 0.0)
        and close(desktop_field_samples["132"]["field_half_height"], 0.006)
        and close(desktop_field_samples["144"]["field_half_height"], 0.280)
        and close(desktop_field_samples["154"]["field_half_height"], 0.520)
        and close(desktop_field_samples["144"]["emission"], 0.520)
        and close(desktop_field_samples["154"]["emission"], 0.560)
    )
    check(records, "continuous_field_vertical_formation", formation_pass, desktop_field_samples, "0.006 at 132, 0.280 at 144, 0.520 at 154 with continuous emission field")
    stable_contrasts = [desktop_field_samples[str(frame)]["raster_contrast"] for frame in (154, 162, 176, 210)]
    check(records, "raster_contrast_restrained", all(value is not None and 0.0 <= value <= 0.085001 for value in stable_contrasts), stable_contrasts, "0.0 through 0.085")
    late_values = [desktop_field_samples[str(frame)]["raster_contrast"] for frame in (247, 255, 262, 270)]
    check(records, "late_raster_suppression_curve", all(value is not None for value in late_values) and late_values == sorted(late_values, reverse=True) and all(close(value, expected) for value, expected in zip(late_values, (0.030, 0.010, 0.004, 0.001))), late_values, [0.030, 0.010, 0.004, 0.001])
    check(records, "mobile_raster_strength_scaled_for_compression", all(desktop_field_samples[str(frame)]["raster_contrast"] is not None and mobile_field_samples[str(frame)]["raster_contrast"] is not None and close(mobile_field_samples[str(frame)]["raster_contrast"], desktop_field_samples[str(frame)]["raster_contrast"] * 0.72) for frame in (144, 154, 162, 176, 210, 247, 255, 262, 270)), {frame: {"desktop": desktop_field_samples[frame]["raster_contrast"], "mobile": mobile_field_samples[frame]["raster_contrast"]} for frame in desktop_field_samples}, "mobile raster contrast == desktop * 0.72")

    interface_collection = bpy.data.collections.get("CRT_PHYSICAL_SIGNAL_INTERFACE")
    interface_objects = [] if interface_collection is None else [obj for obj in interface_collection.all_objects if str(obj.get("interface_stage", "none")) in {"brand", "route", "ready"}]
    interface_stages = sorted(str(obj.get("interface_stage")) for obj in interface_objects)
    check(records, "accepted_content_hierarchy_only", len(interface_objects) == 3 and interface_stages == ["brand", "ready", "route"], {"count": len(interface_objects), "stages": interface_stages}, {"count": 3, "stages": ["brand", "ready", "route"]})
    text_free_state: dict[str, dict[str, bool]] = {}
    for frame in range(265, 271):
        scene.frame_set(frame)
        text_free_state[str(frame)] = {obj.name: bool(obj.hide_render) for obj in interface_objects}
    check(records, "handoff_frames_265_270_text_free", len(interface_objects) == 3 and all(all(states.values()) for states in text_free_state.values()), text_free_state, "all three accepted interface stages hidden at every frame 265-270")
    interface_materials = [material for material in bpy.data.materials if material.name.startswith("Phase3R_Interface_")]
    check(records, "interface_variant_material_count", len(interface_materials) == 6 and all(material.get("phase3r_picture_field_first") is True and material.get("phase3r_noise_temporal") is False for material in interface_materials), {"count": len(interface_materials), "materials": sorted(material.name for material in interface_materials)}, "six deterministic phosphor-integrated desktop/mobile materials")
    check(records, "interface_optical_depth", len(interface_objects) == 3 and all(str(obj.get("phase3r_optical_depth", "")).startswith("curved 4.8 mm within accepted convex glass") for obj in interface_objects), {obj.name: obj.get("phase3r_optical_depth") for obj in interface_objects}, "all content curved within accepted glass")

    external_fonts = [font.filepath for font in bpy.data.fonts if font.filepath not in {"", "<builtin>"}]
    external_paths = sorted(set(bpy.utils.blend_paths(absolute=True, packed=False, local=False)))
    strips = [] if scene.sequence_editor is None else [strip.name for strip in scene.sequence_editor.strips]
    dependency_state = {
        "images": len(bpy.data.images),
        "libraries": len(bpy.data.libraries),
        "audio": len(bpy.data.sounds),
        "movie_clips": len(bpy.data.movieclips),
        "cache_files": len(bpy.data.cache_files),
        "external_fonts": external_fonts,
        "external_paths": external_paths,
        "sequence_strips": strips,
    }
    check(records, "no_external_assets", all(value == 0 for key, value in dependency_state.items() if key in {"images", "libraries", "audio", "movie_clips", "cache_files"}) and not external_fonts and not external_paths and not strips, dependency_state, "all counts zero and all path lists empty")

    current_snapshot = frozen_snapshot()
    current_frozen_hash = snapshot_hash(current_snapshot)
    # Reopen the exact accepted Phase 3 parent only after every repaired-screen
    # check has been captured. This makes the source-only comparison independent
    # of the build manifest's claim and does not save either source.
    bpy.ops.wm.open_mainfile(filepath=str(cfg.PHASE3_DERIVATIVE_SOURCE), load_ui=False)
    accepted_snapshot = frozen_snapshot()
    accepted_frozen_hash = snapshot_hash(accepted_snapshot)
    check(records, "independent_source_only_frozen_snapshot", accepted_frozen_hash == current_frozen_hash, {"accepted_phase3": accepted_frozen_hash, "phase3r": current_frozen_hash}, "exact match")

    failed = [record for record in records if not record["pass"]]
    manifest = {
        "schema": "quantum-hub.phase-3-r-crt-authenticity.source-validation.v1",
        "status": "PASS" if not failed else "FAIL",
        "blender_version": bpy.app.version_string,
        "repair_parent": cfg.REPAIR_PARENT,
        "source_build_manifest": {
            "repository_relative_path": portable_path(SOURCE_BUILD_MANIFEST),
            "bytes": SOURCE_BUILD_MANIFEST.stat().st_size,
            "sha256": sha256(SOURCE_BUILD_MANIFEST),
        },
        "accepted_phase0_source": file_record(cfg.ACCEPTED_SOURCE),
        "accepted_phase3_derivative": file_record(cfg.PHASE3_DERIVATIVE_SOURCE),
        "phase3r_derivative": file_record(cfg.DERIVATIVE_SOURCE),
        "independent_frozen_snapshot": {
            "accepted_phase3_sha256": accepted_frozen_hash,
            "phase3r_sha256": current_frozen_hash,
            "exact_match": accepted_frozen_hash == current_frozen_hash,
        },
        "check_count": len(records),
        "failed_count": len(failed),
        "checks": records,
    }
    cfg.MANIFEST_ROOT.mkdir(parents=True, exist_ok=True)
    VALIDATION_MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"QH_PHASE3R_SOURCE_VALIDATION={manifest['status']}")
    print(f"QH_PHASE3R_SOURCE_VALIDATION_CHECKS={manifest['check_count']}")
    print(f"QH_PHASE3R_SOURCE_VALIDATION_MANIFEST={VALIDATION_MANIFEST.resolve()}")
    if failed:
        raise RuntimeError(f"Phase 3-R source validation failed: {[record['id'] for record in failed]}")


if __name__ == "__main__":
    main()
