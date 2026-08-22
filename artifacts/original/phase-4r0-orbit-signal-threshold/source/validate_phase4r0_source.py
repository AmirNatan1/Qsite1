"""Fail-closed Blender 5.2 validation for the Phase 4-R0 source derivative.

The validator is intentionally source-only.  It opens no renderer, writes no
Blender data, and saves no ``.blend`` file.  Its sole output is the adjacent
``phase4r0-source-validation.json`` report.  After capturing the derivative
state it opens the exact hashed Phase 3-R source in memory so all 421 inherited
layered Actions and the accepted proving-ground authority can be compared
independently rather than trusted from the build report.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
import traceback
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Iterable

import bpy
from mathutils import Vector

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import phase4r0_config as cfg


VALIDATION_REPORT = SCRIPT_DIR / "phase4r0-source-validation.json"
EXPECTED_SCHEMA = "quantum-hub.phase-4-r0-orbit-signal-threshold.previsualization-source.v1"
EXPECTED_BUILD_SCHEMA = "quantum-hub.phase-4-r0-orbit-signal-threshold.source-build.v1"
EXPECTED_VALIDATION_SCHEMA = "quantum-hub.phase-4-r0-orbit-signal-threshold.source-validation.v1"
EXPECTED_BLENDER = (5, 2)
EXPECTED_INHERITED_ACTIONS = 421
EXPECTED_INHERITED_KEYFRAMES = 17266
EXPECTED_CONDUCTION_FACTORS = {"desktop": 6.0, "mobile": 30.0}
EXPECTED_LANDSCAPE_ELEVATION_PROFILE = {
    46: 3.2,
    106: 3.6,
    165: 5.4,
    225: 3.2,
    285: 0.55,
}
EXPECTED_RETIME_POINTS = (
    (1.0, 1.0),
    (30.0, 45.0),
    (31.0, 46.0),
    (72.0, 165.0),
    (112.0, 285.0),
    (116.0, 292.0),
    (121.0, 300.0),
    (126.0, 308.0),
    (132.0, 315.0),
    (133.0, 316.0),
    (154.0, 335.0),
    (155.0, 336.0),
    (176.0, 355.0),
    (177.0, 356.0),
    (190.0, 370.0),
    (201.0, 390.0),
    (210.0, 405.0),
    (211.0, 406.0),
    (232.0, 430.0),
    (246.0, 460.0),
    (252.0, 480.0),
    (255.0, 486.0),
    (270.0, 500.0),
)
EXPECTED_Q_OBJECTS = ("Phase4R0_QuantumQ_Body", "Phase4R0_QuantumQ_Accent")
EXPECTED_SUPERSEDED_COLLECTIONS = (
    "CRT_PHYSICAL_SIGNAL_INTERFACE",
    "CRT_PORTAL_TAKEOVER_CUES",
)
EXPECTED_RASTER_KEYS = (
    (315, 0.0),
    (316, 0.10),
    (320, 0.46),
    (325, 1.08),
    (330, 1.34),
    (335, 1.15),
    (342, 0.72),
    (350, 0.28),
    (355, 0.10),
    (356, 0.08),
    (370, 0.06),
    (405, 0.04),
    (460, 0.02),
    (480, 0.01),
    (500, 0.0),
)
EXPECTED_Q_EMISSION_KEYS = (
    (355, 0.0),
    (356, 0.85),
    (370, 2.15),
    (405, 2.05),
    (460, 1.45),
    (480, 0.82),
    (500, 0.20),
)


class ValidationFailure(RuntimeError):
    """Raised only after a complete FAIL report has been written."""


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
        "path": portable_path(path),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def rounded(value: Any, digits: int = 9) -> Any:
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        return round(value, digits)
    if isinstance(value, dict):
        return {str(key): rounded(item, digits) for key, item in value.items()}
    if hasattr(value, "__len__"):
        try:
            return [rounded(item, digits) for item in value]
        except (TypeError, ValueError):
            pass
    return str(value)


def close(actual: float | None, expected: float, tolerance: float = 1e-5) -> bool:
    return actual is not None and math.isclose(float(actual), float(expected), rel_tol=0.0, abs_tol=tolerance)


def check(
    records: list[dict[str, Any]], identifier: str, passed: bool, actual: Any, expected: Any
) -> None:
    records.append(
        {
            "id": identifier,
            "status": "PASS" if passed else "FAIL",
            "pass": bool(passed),
            "actual": rounded(actual),
            "expected": rounded(expected),
        }
    )


def primitive_properties(owner: Any) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key in sorted(owner.keys()):
        value = owner.get(key)
        if value is None or isinstance(value, (bool, int, float, str)):
            result[str(key)] = rounded(value)
    return result


def action_curves(action: Any) -> list[tuple[str, Any]]:
    """Return legacy or Blender 5.2 layered Action F-curves with slot identity."""

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


def action_snapshot(action: Any) -> list[dict[str, Any]]:
    return [
        {
            "slot": slot,
            "path": str(curve.data_path),
            "index": int(curve.array_index),
            "points": [
                {
                    "frame": float(point.co.x),
                    "value": float(point.co.y),
                    "left_frame": float(point.handle_left.x),
                    "right_frame": float(point.handle_right.x),
                    "interpolation": str(point.interpolation),
                }
                for point in curve.keyframe_points
            ],
        }
        for slot, curve in sorted(
            action_curves(action), key=lambda item: (item[0], item[1].data_path, item[1].array_index)
        )
    ]


def snapshot_point_count(snapshot: list[dict[str, Any]]) -> int:
    return sum(len(curve["points"]) for curve in snapshot)


def remap_frame(frame: float) -> float:
    if frame <= EXPECTED_RETIME_POINTS[0][0]:
        return EXPECTED_RETIME_POINTS[0][1] + (frame - EXPECTED_RETIME_POINTS[0][0])
    for (old_a, new_a), (old_b, new_b) in zip(EXPECTED_RETIME_POINTS, EXPECTED_RETIME_POINTS[1:]):
        if frame <= old_b:
            fraction = (frame - old_a) / (old_b - old_a)
            return new_a + fraction * (new_b - new_a)
    old_a, new_a = EXPECTED_RETIME_POINTS[-1]
    return new_a + (frame - old_a)


def curve_shape_signature(obj: bpy.types.Object) -> dict[str, Any]:
    splines: list[dict[str, Any]] = []
    for spline in obj.data.splines:
        record: dict[str, Any] = {
            "type": spline.type,
            "cyclic": bool(spline.use_cyclic_u),
            "resolution": int(spline.resolution_u),
        }
        if spline.type == "BEZIER":
            record["points"] = [
                {
                    "co": rounded(point.co),
                    "left": rounded(point.handle_left),
                    "right": rounded(point.handle_right),
                    "left_type": point.handle_left_type,
                    "right_type": point.handle_right_type,
                }
                for point in spline.bezier_points
            ]
        else:
            record["points"] = [rounded(point.co) for point in spline.points]
        splines.append(record)
    return {"splines": splines}


def payload_hash(payload: Any) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def svg_contract(path: Path) -> dict[str, Any]:
    root = ET.parse(path).getroot()
    elements = list(root.iter())
    paths = [item for item in elements if item.tag.rsplit("}", 1)[-1] == "path"]
    text_elements = [item for item in elements if item.tag.rsplit("}", 1)[-1] == "text"]
    style_text = "".join(
        item.text or "" for item in elements if item.tag.rsplit("}", 1)[-1] == "style"
    ).replace(" ", "").lower()
    return {
        "viewBox": root.get("viewBox"),
        "path_count": len(paths),
        "path_classes": [item.get("class") for item in paths],
        "path_geometry": [item.get("d") for item in paths],
        "text_element_count": len(text_elements),
        "transform_attributes": [item.get("transform") for item in elements if item.get("transform")],
        "style": style_text,
    }


def fresh_q_geometry() -> tuple[list[dict[str, Any]], list[str]]:
    """Import the hashed SVG in memory, capture geometry, then remove it."""

    before_objects = set(bpy.data.objects)
    before_curves = set(bpy.data.curves)
    before_materials = set(bpy.data.materials)
    before_collections = set(bpy.data.collections)
    bpy.ops.import_curve.svg(filepath=str(cfg.Q_REVERSED_SOURCE))
    imported = sorted(
        set(bpy.data.objects) - before_objects,
        key=lambda obj: float(obj.dimensions.x * obj.dimensions.y),
        reverse=True,
    )
    names = [obj.name for obj in imported]
    signatures = [curve_shape_signature(obj) for obj in imported if obj.type == "CURVE"]
    for obj in list(set(bpy.data.objects) - before_objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for curve in list(set(bpy.data.curves) - before_curves):
        if curve.users == 0:
            bpy.data.curves.remove(curve)
    for material in list(set(bpy.data.materials) - before_materials):
        if material.users == 0:
            bpy.data.materials.remove(material)
    for collection in list(set(bpy.data.collections) - before_collections):
        bpy.data.collections.remove(collection)
    return signatures, names


def socket_value(material: Any, node_name: str, socket_name: str) -> Any:
    if material is None or material.node_tree is None:
        return None
    node = material.node_tree.nodes.get(node_name)
    if node is None:
        return None
    socket = node.inputs.get(socket_name)
    if socket is None:
        socket = node.outputs.get(socket_name)
    if socket is None or not hasattr(socket, "default_value"):
        return None
    value = socket.default_value
    if hasattr(value, "__len__") and not isinstance(value, str):
        return tuple(float(item) for item in value)
    return float(value)


def world_bounds(obj: bpy.types.Object) -> dict[str, list[float]]:
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return {
        "min": [min(float(point[index]) for point in corners) for index in range(3)],
        "max": [max(float(point[index]) for point in corners) for index in range(3)],
    }


def material_signature(material: bpy.types.Material) -> dict[str, Any]:
    record: dict[str, Any] = {
        "name": material.name,
        "use_nodes": material.node_tree is not None,
        "diffuse_color": rounded(material.diffuse_color),
        "properties": primitive_properties(material),
    }
    if material.node_tree is None:
        return record
    nodes: list[dict[str, Any]] = []
    for node in sorted(material.node_tree.nodes, key=lambda item: item.name):
        node_record: dict[str, Any] = {
            "name": node.name,
            "type": node.bl_idname,
            "inputs": {
                socket.name: rounded(socket.default_value)
                for socket in node.inputs
                if hasattr(socket, "default_value")
            },
            "outputs": {
                socket.name: rounded(socket.default_value)
                for socket in node.outputs
                if hasattr(socket, "default_value")
            },
        }
        for attribute in (
            "blend_type",
            "operation",
            "noise_dimensions",
            "wave_type",
            "bands_direction",
            "interpolation_type",
        ):
            if hasattr(node, attribute):
                node_record[attribute] = rounded(getattr(node, attribute))
        if hasattr(node, "color_ramp"):
            node_record["color_ramp"] = {
                "interpolation": node.color_ramp.interpolation,
                "elements": [
                    {"position": rounded(element.position), "color": rounded(element.color)}
                    for element in node.color_ramp.elements
                ],
            }
        nodes.append(node_record)
    record["nodes"] = nodes
    record["links"] = sorted(
        [link.from_node.name, link.from_socket.name, link.to_node.name, link.to_socket.name]
        for link in material.node_tree.links
    )
    return record


def normalized_terrain_material_signature(material: bpy.types.Material) -> dict[str, Any]:
    signature = material_signature(material)
    signature["name"] = "<terrain-material>"
    for node in signature.get("nodes", []):
        if node["name"] == "Procedural ABS microtexture" and "Scale" in node.get("inputs", {}):
            node["inputs"]["Scale"] = "<allowed-scale-override>"
    return signature


def mesh_signature(mesh: bpy.types.Mesh) -> dict[str, Any]:
    return {
        "vertices": [rounded(vertex.co) for vertex in mesh.vertices],
        "edges": [list(edge.vertices) for edge in mesh.edges],
        "polygons": [list(polygon.vertices) for polygon in mesh.polygons],
    }


def terrain_authority_signature(obj: bpy.types.Object) -> dict[str, Any]:
    return {
        "name": obj.name,
        "type": obj.type,
        "parent": None if obj.parent is None else obj.parent.name,
        "collections": sorted(collection.name for collection in obj.users_collection),
        "location": rounded(obj.location),
        "rotation": rounded(obj.rotation_euler),
        "scale": rounded(obj.scale),
        "hide_render": bool(obj.hide_render),
        "hide_viewport": bool(obj.hide_viewport),
        "properties": primitive_properties(obj),
        "mesh": mesh_signature(obj.data),
        "modifiers": [
            {
                "name": modifier.name,
                "type": modifier.type,
                "width": rounded(getattr(modifier, "width", None)),
                "segments": rounded(getattr(modifier, "segments", None)),
                "limit_method": rounded(getattr(modifier, "limit_method", None)),
            }
            for modifier in obj.modifiers
        ],
        "materials": [material_signature(material) for material in obj.data.materials if material is not None],
    }


def linear_animation(owner: Any, paths: set[str]) -> bool:
    animation = getattr(owner, "animation_data", None)
    action = None if animation is None else animation.action
    if action is None:
        return False
    matched = False
    for _slot, curve in action_curves(action):
        if curve.data_path not in paths:
            continue
        matched = True
        if any(point.interpolation != "LINEAR" for point in curve.keyframe_points):
            return False
    return matched


def monotonic(values: list[float], direction: str, tolerance: float = 1e-5) -> bool:
    if direction == "increasing":
        return all(right + tolerance >= left for left, right in zip(values, values[1:]))
    return all(right <= left + tolerance for left, right in zip(values, values[1:]))


def string_provenance_hits(token: str) -> list[str]:
    needle = token.casefold()
    hits: list[str] = []
    groups: Iterable[tuple[str, Iterable[Any]]] = (
        ("object", bpy.data.objects),
        ("collection", bpy.data.collections),
        ("material", bpy.data.materials),
        ("action", bpy.data.actions),
        ("curve", bpy.data.curves),
        ("mesh", bpy.data.meshes),
        ("camera", bpy.data.cameras),
        ("light", bpy.data.lights),
        ("scene", bpy.data.scenes),
    )
    for group, items in groups:
        for item in items:
            if needle in item.name.casefold():
                hits.append(f"{group}-name:{item.name}")
            for key in item.keys():
                value = item.get(key)
                if needle in str(key).casefold() or (isinstance(value, str) and needle in value.casefold()):
                    hits.append(f"{group}-property:{item.name}:{key}={value}")
    for material in bpy.data.materials:
        if material.node_tree is None:
            continue
        for node in material.node_tree.nodes:
            if needle in node.name.casefold() or needle in node.label.casefold():
                hits.append(f"material-node:{material.name}:{node.name}")
    return sorted(hits)


def dependency_state(scene: bpy.types.Scene) -> dict[str, Any]:
    editor = scene.sequence_editor
    if editor is None:
        strips: list[str] = []
    else:
        sequence_items = getattr(editor, "sequences_all", getattr(editor, "strips", ()))
        strips = [f"{strip.type}:{strip.name}" for strip in sequence_items]
    external_fonts = [font.filepath for font in bpy.data.fonts if font.filepath not in {"", "<builtin>"}]
    volumes = [volume.filepath for volume in bpy.data.volumes if volume.filepath]
    return {
        "images": len(bpy.data.images),
        "libraries": len(bpy.data.libraries),
        "sounds": len(bpy.data.sounds),
        "speakers": len(bpy.data.speakers),
        "movie_clips": len(bpy.data.movieclips),
        "cache_files": len(bpy.data.cache_files),
        "external_fonts": external_fonts,
        "external_volumes": volumes,
        "external_paths": sorted(set(bpy.utils.blend_paths(absolute=True, packed=False, local=False))),
        "sequence_strips": strips,
    }


def compare_inherited_actions(
    derivative_snapshots: dict[str, list[dict[str, Any]]],
    reported_records: list[dict[str, Any]],
) -> dict[str, Any]:
    source_snapshots = {
        action.name: action_snapshot(action)
        for action in bpy.data.actions
        if snapshot_point_count(action_snapshot(action)) > 0
    }
    source_keyframes = sum(snapshot_point_count(snapshot) for snapshot in source_snapshots.values())
    report_counts = {str(item.get("action")): int(item.get("keyframes", -1)) for item in reported_records}
    missing_frames: list[dict[str, Any]] = []
    value_mismatches: list[dict[str, Any]] = []
    missing_curves: list[dict[str, Any]] = []
    matched_points = 0
    compared_values = 0
    boost_curves: set[tuple[str, str, int]] = set()
    boosted_positive_points = 0
    boost_curves_by_family: dict[str, set[tuple[str, str, int]]] = {
        family: set() for family in EXPECTED_CONDUCTION_FACTORS
    }
    boosted_positive_points_by_family = {family: 0 for family in EXPECTED_CONDUCTION_FACTORS}

    for action_name, source_curves in source_snapshots.items():
        derivative_curves = derivative_snapshots.get(action_name, [])
        derivative_map: dict[tuple[str, str, int], list[dict[str, Any]]] = {}
        for curve in derivative_curves:
            key = (curve["slot"], curve["path"], int(curve["index"]))
            derivative_map.setdefault(key, []).append(curve)
        for source_curve in source_curves:
            key = (source_curve["slot"], source_curve["path"], int(source_curve["index"]))
            candidates = derivative_map.get(key, [])
            if not candidates:
                if len(missing_curves) < 25:
                    missing_curves.append({"action": action_name, "curve": key})
                continue
            derivative_curve = max(candidates, key=lambda curve: len(curve["points"]))
            conductor_boost = action_name.startswith(("Phase3_DesktopConductor_", "Phase3_MobileConductor_")) and "inputs[29].default_value" in source_curve["path"]
            contact_boost = action_name.startswith(("Phase3_DesktopContactLight_", "Phase3_MobileContactLight_")) and source_curve["path"] == "energy"
            raster_override = action_name in {
                "Phase3R_PhosphorField_DesktopAction",
                "Phase3R_PhosphorField_MobileAction",
            } and "inputs[29].default_value" in source_curve["path"]
            if conductor_boost or contact_boost:
                boost_curves.add((action_name, source_curve["path"], int(source_curve["index"])))
                boost_family = "mobile" if "_Mobile" in action_name else "desktop"
                boost_curves_by_family[boost_family].add(
                    (action_name, source_curve["path"], int(source_curve["index"]))
                )
            for source_point in source_curve["points"]:
                expected_frame = remap_frame(float(source_point["frame"]))
                matches = sorted(
                    derivative_curve["points"],
                    key=lambda point: abs(float(point["frame"]) - expected_frame),
                )
                if not matches or abs(float(matches[0]["frame"]) - expected_frame) > 0.001:
                    if len(missing_frames) < 25:
                        missing_frames.append(
                            {
                                "action": action_name,
                                "curve": key,
                                "source_frame": source_point["frame"],
                                "expected_frame": expected_frame,
                            }
                        )
                    continue
                matched_points += 1
                if raster_override:
                    continue
                expected_value = float(source_point["value"])
                if (conductor_boost or contact_boost) and expected_value > 0.0:
                    boost_family = "mobile" if "_Mobile" in action_name else "desktop"
                    expected_value *= EXPECTED_CONDUCTION_FACTORS[boost_family]
                    boosted_positive_points += 1
                    boosted_positive_points_by_family[boost_family] += 1
                actual_value = float(matches[0]["value"])
                compared_values += 1
                if not close(actual_value, expected_value, 5e-5) and len(value_mismatches) < 25:
                    value_mismatches.append(
                        {
                            "action": action_name,
                            "curve": key,
                            "frame": expected_frame,
                            "actual": actual_value,
                            "expected": expected_value,
                        }
                    )

    count_mismatches = {
        name: {"reported": report_counts.get(name), "source": snapshot_point_count(snapshot)}
        for name, snapshot in source_snapshots.items()
        if report_counts.get(name) != snapshot_point_count(snapshot)
    }
    missing_actions = sorted(
        name for name in source_snapshots if snapshot_point_count(derivative_snapshots.get(name, [])) == 0
    )
    return {
        "source_action_count": len(source_snapshots),
        "source_keyframe_count": source_keyframes,
        "source_action_names": sorted(source_snapshots),
        "reported_action_names": sorted(report_counts),
        "reported_count_mismatches": dict(list(count_mismatches.items())[:25]),
        "derivative_nonempty": not missing_actions,
        "missing_or_empty_derivative_actions": missing_actions,
        "matched_retimed_points": matched_points,
        "compared_values": compared_values,
        "missing_curves": missing_curves,
        "missing_frames": missing_frames,
        "value_mismatches": value_mismatches,
        "boost_curve_count": len(boost_curves),
        "boosted_positive_point_count": boosted_positive_points,
        "boost_curve_count_by_family": {
            family: len(curves) for family, curves in boost_curves_by_family.items()
        },
        "boosted_positive_point_count_by_family": boosted_positive_points_by_family,
    }


def main() -> None:
    records: list[dict[str, Any]] = []
    if not cfg.BUILD_REPORT.is_file():
        raise RuntimeError(f"missing source-build report: {cfg.BUILD_REPORT}")
    build = json.loads(cfg.BUILD_REPORT.read_text(encoding="utf-8"))
    scene = bpy.context.scene
    opened = Path(bpy.data.filepath).resolve()
    derivative_record = file_record(cfg.DERIVATIVE_SOURCE)
    accepted_record = file_record(cfg.ACCEPTED_PHASE3R_SOURCE)
    q_color_record = file_record(cfg.Q_COLOR_SOURCE)
    q_reversed_record = file_record(cfg.Q_REVERSED_SOURCE)

    check(records, "blender_5_2_runtime", tuple(bpy.app.version[:2]) == EXPECTED_BLENDER, list(bpy.app.version), [5, 2, "x"])
    check(records, "opened_exact_derivative", opened == cfg.DERIVATIVE_SOURCE.resolve(), portable_path(opened), portable_path(cfg.DERIVATIVE_SOURCE))
    check(records, "accepted_source_hash", accepted_record["sha256"] == cfg.ACCEPTED_PHASE3R_SHA256, accepted_record["sha256"], cfg.ACCEPTED_PHASE3R_SHA256)
    check(records, "accepted_source_distinct", cfg.ACCEPTED_PHASE3R_SOURCE.resolve() != cfg.DERIVATIVE_SOURCE.resolve(), [portable_path(cfg.ACCEPTED_PHASE3R_SOURCE), portable_path(cfg.DERIVATIVE_SOURCE)], "two distinct files")
    check(records, "q_color_authority_hash", q_color_record["sha256"] == cfg.Q_COLOR_SHA256, q_color_record["sha256"], cfg.Q_COLOR_SHA256)
    check(records, "q_reversed_authority_hash", q_reversed_record["sha256"] == cfg.Q_REVERSED_SHA256, q_reversed_record["sha256"], cfg.Q_REVERSED_SHA256)

    build_derivative = build.get("phase4r0_derivative", {})
    build_accepted = build.get("accepted_phase3r_source", {})
    build_q = build.get("quantum_q", {})
    check(records, "build_schema_status", build.get("schema") == EXPECTED_BUILD_SCHEMA and build.get("status") == "PASS", {"schema": build.get("schema"), "status": build.get("status")}, {"schema": EXPECTED_BUILD_SCHEMA, "status": "PASS"})
    check(records, "build_parent_commit", build.get("accepted_phase4_parent") == cfg.ACCEPTED_PHASE4_PARENT, build.get("accepted_phase4_parent"), cfg.ACCEPTED_PHASE4_PARENT)
    check(records, "build_accepted_source_binding", build_accepted == accepted_record, build_accepted, accepted_record)
    check(records, "build_derivative_binding", build_derivative == derivative_record, build_derivative, derivative_record)
    check(records, "build_q_reversed_binding", build_q.get("source") == q_reversed_record, build_q.get("source"), q_reversed_record)
    check(records, "build_q_color_binding", build_q.get("color_authority") == q_color_record, build_q.get("color_authority"), q_color_record)
    check(records, "build_production_rendering_false", build.get("production_rendering_started") is False, build.get("production_rendering_started"), False)

    check(records, "scene_schema", scene.get("phase4r0_schema") == EXPECTED_SCHEMA, scene.get("phase4r0_schema"), EXPECTED_SCHEMA)
    check(records, "scene_parent_commit", scene.get("phase4r0_parent_commit") == cfg.ACCEPTED_PHASE4_PARENT, scene.get("phase4r0_parent_commit"), cfg.ACCEPTED_PHASE4_PARENT)
    check(records, "scene_previsualization_only", scene.get("phase4r0_not_production_render") is True, scene.get("phase4r0_not_production_render"), True)
    check(records, "timeline_540f_30fps", scene.frame_start == 1 and scene.frame_end == 540 and scene.render.fps == 30 and close(float(scene.render.fps_base), 1.0), {"start": scene.frame_start, "end": scene.frame_end, "fps": scene.render.fps, "fps_base": scene.render.fps_base}, {"start": 1, "end": 540, "fps": 30, "fps_base": 1.0})
    build_timeline = build.get("timeline", {})
    check(records, "build_timeline_contract", build_timeline.get("fps") == cfg.FPS and build_timeline.get("frames") == [cfg.FRAME_START, cfg.FRAME_END] and build_timeline.get("events") == dict(cfg.EVENTS), {"fps": build_timeline.get("fps"), "frames": build_timeline.get("frames"), "events": build_timeline.get("events")}, {"fps": cfg.FPS, "frames": [cfg.FRAME_START, cfg.FRAME_END], "events": dict(cfg.EVENTS)})

    derivative_action_snapshots = {action.name: action_snapshot(action) for action in bpy.data.actions}
    retime_report = build_timeline.get("retimed_inherited_actions", {})
    reported_action_records = retime_report.get("actions", [])
    reported_names = [str(item.get("action")) for item in reported_action_records]
    check(records, "build_reports_421_inherited_actions", retime_report.get("action_count") == EXPECTED_INHERITED_ACTIONS and len(reported_action_records) == EXPECTED_INHERITED_ACTIONS and len(set(reported_names)) == EXPECTED_INHERITED_ACTIONS, {"declared": retime_report.get("action_count"), "records": len(reported_action_records), "unique": len(set(reported_names))}, EXPECTED_INHERITED_ACTIONS)
    check(records, "build_reports_inherited_keyframes", retime_report.get("keyframe_count") == EXPECTED_INHERITED_KEYFRAMES, retime_report.get("keyframe_count"), EXPECTED_INHERITED_KEYFRAMES)
    report_actions_present = all(snapshot_point_count(derivative_action_snapshots.get(name, [])) > 0 for name in reported_names)
    check(records, "reported_inherited_actions_present_nonempty", report_actions_present, {"present_nonempty": sum(snapshot_point_count(derivative_action_snapshots.get(name, [])) > 0 for name in reported_names), "reported": len(reported_names)}, {"present_nonempty": EXPECTED_INHERITED_ACTIONS, "reported": EXPECTED_INHERITED_ACTIONS})

    reversed_svg = svg_contract(cfg.Q_REVERSED_SOURCE)
    color_svg = svg_contract(cfg.Q_COLOR_SOURCE)
    svg_structure_ok = (
        reversed_svg["viewBox"] == "0 0 109.09 109.09"
        and color_svg["viewBox"] == "0 0 109.09 109.09"
        and reversed_svg["path_count"] == color_svg["path_count"] == 2
        and reversed_svg["path_geometry"] == color_svg["path_geometry"]
        and reversed_svg["text_element_count"] == color_svg["text_element_count"] == 0
        and not reversed_svg["transform_attributes"]
        and not color_svg["transform_attributes"]
    )
    check(records, "q_svg_two_path_geometry_authority", svg_structure_ok, {"reversed": reversed_svg, "color": color_svg}, "same exact two path d attributes, square viewBox, no text or transforms")
    svg_colors_ok = (
        ".cls-1{fill:#fff;}" in reversed_svg["style"]
        and ".cls-2{fill:#d82b72;}" in reversed_svg["style"]
        and reversed_svg["path_classes"] == ["cls-1", "cls-2"]
        and ".cls-1{fill:#d82b72;}" in color_svg["style"]
        and ".cls-2{fill:#515151;}" in color_svg["style"]
        and color_svg["path_classes"] == ["cls-2", "cls-1"]
    )
    check(records, "q_svg_authored_color_contract", svg_colors_ok, {"reversed_style": reversed_svg["style"], "reversed_classes": reversed_svg["path_classes"], "color_style": color_svg["style"], "color_classes": color_svg["path_classes"]}, {"reversed_body": "#FFFFFF", "color_body": "#515151", "accent_both": "#D82B72"})

    q_collection = bpy.data.collections.get("PHASE4R0_Q_SIGNAL")
    q_root = bpy.data.objects.get("Phase4R0_ApprovedQuantumQ_Root")
    q_objects = [bpy.data.objects.get(name) for name in EXPECTED_Q_OBJECTS]
    q_members = [] if q_collection is None else sorted(obj.name for obj in q_collection.all_objects)
    check(records, "q_collection_exact_allowlist", q_collection is not None and q_members == sorted(["Phase4R0_ApprovedQuantumQ_Root", *EXPECTED_Q_OBJECTS]), q_members, sorted(["Phase4R0_ApprovedQuantumQ_Root", *EXPECTED_Q_OBJECTS]))
    q_objects_exact = all(obj is not None and obj.type == "CURVE" for obj in q_objects)
    check(records, "q_exactly_two_curve_objects", q_objects_exact and sum(obj.name.startswith("Phase4R0_QuantumQ_") and obj.type == "CURVE" for obj in bpy.data.objects) == 2, [None if obj is None else {"name": obj.name, "type": obj.type} for obj in q_objects], list(EXPECTED_Q_OBJECTS))
    root_authority_ok = q_root is not None and q_root.type == "EMPTY" and q_root.get("phase4r0_q_authority") == cfg.Q_REVERSED_SOURCE.name and q_root.get("phase4r0_q_authority_sha256") == cfg.Q_REVERSED_SHA256
    check(records, "q_root_exact_provenance", root_authority_ok, None if q_root is None else {"type": q_root.type, "source": q_root.get("phase4r0_q_authority"), "sha256": q_root.get("phase4r0_q_authority_sha256")}, {"type": "EMPTY", "source": cfg.Q_REVERSED_SOURCE.name, "sha256": cfg.Q_REVERSED_SHA256})
    q_object_contract = q_objects_exact and q_root is not None and all(
        obj.parent == q_root
        and obj.get("phase4r0_svg_geometry_edited") is False
        and len(obj.users_collection) == 1
        and obj.users_collection[0] == q_collection
        for obj in q_objects if obj is not None
    )
    check(records, "q_objects_direct_import_provenance", q_object_contract, [None if obj is None else {"parent": None if obj.parent is None else obj.parent.name, "geometry_edited": obj.get("phase4r0_svg_geometry_edited"), "collections": [collection.name for collection in obj.users_collection]} for obj in q_objects], "both parented to approved root, geometry_edited=false, exclusively in Q collection")
    q_roles = {} if not q_objects_exact else {obj.name: obj.get("phase4r0_svg_role") for obj in q_objects if obj is not None}
    check(records, "q_exact_authored_roles", q_roles == {"Phase4R0_QuantumQ_Body": "main body", "Phase4R0_QuantumQ_Accent": "authored lower-right accent"}, q_roles, {"Phase4R0_QuantumQ_Body": "main body", "Phase4R0_QuantumQ_Accent": "authored lower-right accent"})

    fresh_signatures, fresh_names = fresh_q_geometry()
    current_signatures = [] if not q_objects_exact else [curve_shape_signature(obj) for obj in q_objects if obj is not None]
    fresh_exact = len(fresh_signatures) == 2 and len(current_signatures) == 2 and all(payload_hash(current) == payload_hash(fresh) for current, fresh in zip(current_signatures, fresh_signatures))
    check(records, "q_geometry_matches_fresh_blender52_import", fresh_exact, {"current": [payload_hash(item) for item in current_signatures], "fresh": [payload_hash(item) for item in fresh_signatures], "fresh_objects": fresh_names}, "body and accent raw spline geometry exactly match fresh import of hashed reversed SVG")

    white = bpy.data.materials.get("Phase4R0_Q_WhitePhosphor")
    magenta = bpy.data.materials.get("Phase4R0_Q_MagentaPhosphor")
    q_material_assignment = q_objects_exact and q_objects[0].data.materials[:] == [white] and q_objects[1].data.materials[:] == [magenta]
    check(records, "q_exact_material_assignment", q_material_assignment, [None if obj is None else [material.name for material in obj.data.materials] for obj in q_objects], [["Phase4R0_Q_WhitePhosphor"], ["Phase4R0_Q_MagentaPhosphor"]])
    q_fill_actual = {
        "body": None if white is None else socket_value(white, "Approved SVG Fill", "Color"),
        "accent": None if magenta is None else socket_value(magenta, "Approved SVG Fill", "Color"),
        "body_property": None if white is None else white.get("phase4r0_source_fill"),
        "accent_property": None if magenta is None else magenta.get("phase4r0_source_fill"),
    }
    q_fill_ok = (
        white is not None
        and magenta is not None
        and all(close(value, target, 2e-6) for value, target in zip(q_fill_actual["body"][:3], (1.0, 1.0, 1.0)))
        and all(close(value, target, 2e-6) for value, target in zip(q_fill_actual["accent"][:3], (216 / 255, 43 / 255, 114 / 255)))
        and q_fill_actual["body_property"] == "#FFFFFF"
        and q_fill_actual["accent_property"] == "#D82B72"
    )
    check(records, "q_no_recolor_authored_reversed_variant", q_fill_ok, q_fill_actual, {"body": "#FFFFFF", "accent": "#D82B72"})
    qfund_hits = string_provenance_hits("qfund")
    phase4_q_font_objects = [obj.name for obj in bpy.data.objects if obj.name.startswith("Phase4R0_") and obj.type == "FONT"]
    check(records, "q_no_font_redraw_or_qfund", not qfund_hits and not phase4_q_font_objects and fresh_exact, {"qfund_hits": qfund_hits[:25], "phase4_font_objects": phase4_q_font_objects, "fresh_import_exact": fresh_exact}, {"qfund_hits": [], "phase4_font_objects": [], "fresh_import_exact": True})

    target = bpy.data.objects.get("Phase4R0_CRT_OrbitTarget")
    target_ok = target is not None and target.type == "EMPTY" and all(close(float(actual), expected) for actual, expected in zip(target.location, cfg.ORBIT_TARGET)) and target.hide_render
    check(records, "camera_orbit_target_exact", target_ok, None if target is None else {"type": target.type, "location": list(target.location), "hide_render": target.hide_render}, {"type": "EMPTY", "location": list(cfg.ORBIT_TARGET), "hide_render": True})
    camera_metrics: dict[str, Any] = {}
    cameras_ok = True
    for family, spec in cfg.CAMERA_SPECS.items():
        rig = bpy.data.objects.get(spec["rig"])
        camera = bpy.data.objects.get(spec["camera"])
        valid_structure = (
            rig is not None
            and rig.type == "EMPTY"
            and camera is not None
            and camera.type == "CAMERA"
            and camera.parent == rig
            and all(close(float(actual), expected) for actual, expected in zip(rig.location, cfg.ORBIT_TARGET))
            and len(camera.constraints) == 1
            and camera.constraints[0].type == "TRACK_TO"
            and camera.constraints[0].target == target
            and camera.constraints[0].track_axis == "TRACK_NEGATIVE_Z"
            and camera.constraints[0].up_axis == "UP_Y"
        )
        samples: list[dict[str, float]] = []
        if rig is not None and camera is not None:
            for frame in range(cfg.EVENTS["conduction_start"], cfg.EVENTS["orbit_complete_current_arrival"] + 1):
                scene.frame_set(frame)
                world = camera.matrix_world.translation
                samples.append(
                    {
                        "angle": math.degrees(float(rig.rotation_euler.z)),
                        "radius": math.hypot(float(world.x) - cfg.ORBIT_TARGET[0], float(world.y) - cfg.ORBIT_TARGET[1]),
                        "elevation": float(world.z) - cfg.ORBIT_TARGET[2],
                        "lens": float(camera.data.lens),
                    }
                )
        angles = [sample["angle"] for sample in samples]
        radii = [sample["radius"] for sample in samples]
        elevations = [sample["elevation"] for sample in samples]
        lenses = [sample["lens"] for sample in samples]
        elevation_monotonic = monotonic(elevations, "decreasing") if elevations else False
        if family == "landscape" and elevations:
            first_frame = cfg.EVENTS["conduction_start"]
            profile_actual = {
                frame: elevations[frame - first_frame]
                for frame in EXPECTED_LANDSCAPE_ELEVATION_PROFILE
            }
            peak_value = max(elevations)
            peak_frames = [
                first_frame + index
                for index, value in enumerate(elevations)
                if close(value, peak_value, 1e-6)
            ]
            peak_index = cfg.EVENTS["conduction_50"] - first_frame
            elevation_contract_ok = (
                all(
                    close(profile_actual[frame], expected, 1e-4)
                    for frame, expected in EXPECTED_LANDSCAPE_ELEVATION_PROFILE.items()
                )
                and peak_frames == [cfg.EVENTS["conduction_50"]]
                and monotonic(elevations[: peak_index + 1], "increasing")
                and monotonic(elevations[peak_index:], "decreasing")
            )
            elevation_contract = {
                "kind": "exact single-crest rear-quadrant clearance",
                "waypoints": profile_actual,
                "peak_frames": peak_frames,
                "rise_monotonic": monotonic(elevations[: peak_index + 1], "increasing"),
                "descent_monotonic": monotonic(elevations[peak_index:], "decreasing"),
            }
        else:
            elevation_contract_ok = elevation_monotonic
            elevation_contract = {
                "kind": "monotonic descent",
                "monotonic": elevation_monotonic,
            }
        orbit_ok = (
            len(samples) == 240
            and monotonic(angles, "increasing")
            and monotonic(radii, "decreasing")
            and elevation_contract_ok
            and monotonic(lenses, "increasing")
            and close(angles[0], cfg.START_ANGLE_DEGREES, 0.001)
            and close(angles[-1], cfg.END_ANGLE_DEGREES, 0.001)
            and close(angles[-1] - angles[0], 360.0, 0.002)
            and close(radii[0], spec["start_radius"], 1e-4)
            and close(radii[-1], spec["completion_radius"], 1e-4)
            and close(elevations[0], spec["start_elevation"], 1e-4)
            and close(elevations[-1], spec["completion_elevation"], 1e-4)
            and close(lenses[0], spec["start_lens_mm"], 1e-4)
            and close(lenses[-1], spec["completion_lens_mm"], 1e-4)
        )
        push_samples: list[dict[str, float]] = []
        if rig is not None and camera is not None:
            for frame in range(cfg.EVENTS["orbit_complete_current_arrival"], cfg.EVENTS["threshold_crossing"] + 1):
                scene.frame_set(frame)
                world = camera.matrix_world.translation
                push_samples.append(
                    {
                        "angle": math.degrees(float(rig.rotation_euler.z)),
                        "radius": math.hypot(float(world.x) - cfg.ORBIT_TARGET[0], float(world.y) - cfg.ORBIT_TARGET[1]),
                        "elevation": float(world.z) - cfg.ORBIT_TARGET[2],
                        "lens": float(camera.data.lens),
                    }
                )
        push_radii = [sample["radius"] for sample in push_samples]
        push_elevations = [sample["elevation"] for sample in push_samples]
        push_angles = [sample["angle"] for sample in push_samples]
        late_lenses = [push_samples[index]["lens"] for index, frame in enumerate(range(cfg.EVENTS["orbit_complete_current_arrival"], cfg.EVENTS["threshold_crossing"] + 1)) if frame >= cfg.EVENTS["q_hold_end"]]
        push_ok = (
            bool(push_samples)
            and max(push_angles) - min(push_angles) <= 0.002
            and monotonic(push_radii, "decreasing")
            and monotonic(push_elevations, "decreasing")
            and monotonic(late_lenses, "decreasing")
            and close(push_radii[-1], 0.018, 1e-4)
            and close(push_elevations[-1], 0.0, 1e-4)
            and close(push_samples[-1]["lens"], spec["push_lens_mm"], 1e-4)
        )
        linear_ok = rig is not None and camera is not None and linear_animation(rig, {"rotation_euler"}) and linear_animation(camera, {"location"}) and linear_animation(camera.data, {"lens"})
        path_obj = bpy.data.objects.get(f"Phase4R0_Path_{family.title()}")
        path_ok = path_obj is not None and path_obj.type == "CURVE" and path_obj.hide_render and path_obj.hide_viewport and path_obj.get("phase4r0_diagnostic_only") is True and len(path_obj.data.splines) == 1 and len(path_obj.data.splines[0].points) == 121
        family_ok = valid_structure and orbit_ok and push_ok and linear_ok and path_ok
        cameras_ok = cameras_ok and family_ok
        camera_metrics[family] = {
            "structure": valid_structure,
            "samples": len(samples),
            "angle_start_degrees": None if not angles else angles[0],
            "angle_end_degrees": None if not angles else angles[-1],
            "angular_travel_degrees": None if not angles else angles[-1] - angles[0],
            "angle_monotonic": monotonic(angles, "increasing") if angles else False,
            "radius_start": None if not radii else radii[0],
            "radius_completion": None if not radii else radii[-1],
            "radius_monotonic": monotonic(radii, "decreasing") if radii else False,
            "elevation_start": None if not elevations else elevations[0],
            "elevation_completion": None if not elevations else elevations[-1],
            "elevation_monotonic": elevation_monotonic,
            "elevation_contract": elevation_contract,
            "lens_start_mm": None if not lenses else lenses[0],
            "lens_completion_mm": None if not lenses else lenses[-1],
            "lens_monotonic": monotonic(lenses, "increasing") if lenses else False,
            "post_orbit_push": push_ok,
            "linear_keyframes": linear_ok,
            "diagnostic_path_121_samples_hidden": path_ok,
        }
    check(records, "three_camera_rigs_360_motion_contract", cameras_ok and set(camera_metrics) == set(cfg.CAMERA_SPECS), camera_metrics, "three exact rigs; monotonic CCW 360 degrees/radius/lens; desktop/mobile descending elevation; landscape exact 3.2/3.6/5.4/3.2/0.55 m single crest at F165; frontal push; hidden 121-point diagnostic paths")
    check(records, "desktop_camera_selected", scene.camera is not None and scene.camera.name == cfg.CAMERA_SPECS["desktop"]["camera"], None if scene.camera is None else scene.camera.name, cfg.CAMERA_SPECS["desktop"]["camera"])
    build_camera = build.get("camera_motion", {})
    camera_report_ok = all(
        family in build_camera
        and close(build_camera[family].get("total_angular_travel_degrees"), 360.0, 0.002)
        and build_camera[family].get("monotonic_angle") is True
        and build_camera[family].get("monotonic_contracting_radius") is True
        and close(build_camera[family].get("radius_start"), cfg.CAMERA_SPECS[family]["start_radius"], 1e-4)
        and close(build_camera[family].get("radius_completion"), cfg.CAMERA_SPECS[family]["completion_radius"], 1e-4)
        for family in cfg.CAMERA_SPECS
    )
    check(records, "build_camera_report_matches_contract", camera_report_ok, build_camera, camera_metrics)

    conductor_metrics: dict[str, Any] = {}
    conductor_objects: dict[str, list[bpy.types.Object]] = {}
    conductor_ok = True
    for family, collection_name in (
        ("desktop", "SPIRALCABLE_RECESSED_CONDUCTOR_SEGMENTS"),
        ("mobile", "MOBILESPIRALCABLE_RECESSED_CONDUCTOR_SEGMENTS"),
    ):
        collection = bpy.data.collections.get(collection_name)
        objects = [] if collection is None else list(collection.all_objects)
        active = [obj for obj in objects if not bool(obj.get("entry_hidden", False))]
        entry_hidden = [obj for obj in objects if bool(obj.get("entry_hidden", False))]
        conductor_objects[family] = active
        arrival_errors: list[dict[str, Any]] = []
        ordered: list[tuple[float, int, str]] = []
        for obj in active:
            progress = float(obj.get("progress_start", -1.0))
            expected_arrival = round(cfg.EVENTS["conduction_start"] + progress * (cfg.EVENTS["orbit_complete_current_arrival"] - cfg.EVENTS["conduction_start"]))
            actual_arrival = int(obj.get("phase4r0_conduction_arrival_frame", -1))
            ordered.append((progress, actual_arrival, obj.name))
            if not 0.0 <= progress <= 1.0 or actual_arrival != expected_arrival:
                arrival_errors.append({"object": obj.name, "progress": progress, "actual": actual_arrival, "expected": expected_arrival})
        ordered.sort()
        arrivals = [item[1] for item in ordered]
        sample_frames = (1, 45, 46, 106, 165, 225, 285, 335, 336, 355, 540)
        forward: dict[str, list[str]] = {}
        expected: dict[str, list[str]] = {}
        for frame in sample_frames:
            scene.frame_set(frame)
            forward[str(frame)] = sorted(obj.name for obj in active if not obj.hide_render)
            expected[str(frame)] = sorted(
                obj.name
                for obj in active
                if frame < cfg.EVENTS["settling_start"]
                and int(obj.get("phase4r0_conduction_arrival_frame", -1)) <= frame
            )
        reverse: dict[str, list[str]] = {}
        for frame in reversed(sample_frames):
            scene.frame_set(frame)
            reverse[str(frame)] = sorted(obj.name for obj in active if not obj.hide_render)
        entry_hidden_states: dict[str, bool] = {}
        for frame in (1, 285, 335, 336, 540):
            scene.frame_set(frame)
            entry_hidden_states[str(frame)] = all(obj.hide_render for obj in entry_hidden)
        materials = {material for obj in active for material in getattr(obj.data, "materials", ()) if material is not None}
        authored_magenta = (216 / 255, 43 / 255, 114 / 255)
        material_color_ok = bool(materials) and all(all(close(float(channel), target, 2e-6) for channel, target in zip(material.diffuse_color[:3], authored_magenta)) for material in materials)
        family_ok = (
            collection is not None
            and len(active) == 180
            and len(entry_hidden) == 5
            and not arrival_errors
            and monotonic([float(value) for value in arrivals], "increasing", 0.0)
            and forward == expected
            and reverse == forward
            and all(entry_hidden_states.values())
            and material_color_ok
        )
        conductor_ok = conductor_ok and family_ok
        conductor_metrics[family] = {
            "active_segments": len(active),
            "entry_hidden_segments": len(entry_hidden),
            "arrival_min": None if not arrivals else min(arrivals),
            "arrival_max": None if not arrivals else max(arrivals),
            "arrival_monotonic": monotonic([float(value) for value in arrivals], "increasing", 0.0) if arrivals else False,
            "arrival_errors": arrival_errors[:25],
            "visible_counts_forward": {frame: len(names) for frame, names in forward.items()},
            "visible_counts_expected": {frame: len(names) for frame, names in expected.items()},
            "reverse_exact": reverse == forward,
            "entry_hidden_all_samples": entry_hidden_states,
            "workbench_materials_magenta": material_color_ok,
        }
    check(records, "conductor_progression_and_reverse_visibility", conductor_ok, conductor_metrics, "desktop/mobile each 180 active + 5 entry-hidden; progress-derived arrival; exact forward/reverse visibility; hidden at settling; authored magenta signal")

    indicator = bpy.data.objects.get("CRT_DormantPowerIndicator")
    indicator_expected = {1: True, 285: True, 291: True, 292: False, 540: False}
    indicator_forward: dict[str, bool | None] = {}
    for frame in indicator_expected:
        scene.frame_set(frame)
        indicator_forward[str(frame)] = None if indicator is None else bool(indicator.hide_render)
    indicator_reverse: dict[str, bool | None] = {}
    for frame in reversed(tuple(indicator_expected)):
        scene.frame_set(frame)
        indicator_reverse[str(frame)] = None if indicator is None else bool(indicator.hide_render)
    check(records, "indicator_response_and_reverse_visibility", indicator is not None and indicator_forward == {str(frame): value for frame, value in indicator_expected.items()} and indicator_reverse == indicator_forward, {"forward": indicator_forward, "reverse": indicator_reverse}, {str(frame): value for frame, value in indicator_expected.items()})

    build_signal = build_timeline.get("workbench_signal_visibility", {})
    build_signal_ok = all(build_signal.get(family, {}).get("active_segments") == 180 and build_signal.get(family, {}).get("entry_hidden_segments") == 5 for family in ("desktop", "mobile")) and build_signal.get("indicator", {}).get("response_frame") == 292
    check(records, "build_conductor_report_matches_scene", build_signal_ok, build_signal, {"desktop": {"active_segments": 180, "entry_hidden_segments": 5}, "mobile": {"active_segments": 180, "entry_hidden_segments": 5}, "indicator_response": 292})

    phosphor = bpy.data.objects.get("CRT_InternalPhosphorLayer")
    desktop_field = bpy.data.materials.get("Phase3R_PhosphorField_Desktop")
    mobile_field = bpy.data.materials.get("Phase3R_PhosphorField_Mobile")
    original_field = None if phosphor is None or not phosphor.data.materials else phosphor.data.materials[0]
    desktop_samples: dict[str, float | None] = {}
    if phosphor is not None and desktop_field is not None:
        phosphor.data.materials[0] = desktop_field
        for frame, _value in EXPECTED_RASTER_KEYS:
            scene.frame_set(frame)
            desktop_samples[str(frame)] = socket_value(desktop_field, "Principled BSDF", "Emission Strength")
    mobile_samples: dict[str, float | None] = {}
    if phosphor is not None and mobile_field is not None:
        phosphor.data.materials[0] = mobile_field
        for frame, _value in EXPECTED_RASTER_KEYS:
            scene.frame_set(frame)
            mobile_samples[str(frame)] = socket_value(mobile_field, "Principled BSDF", "Emission Strength")
    if phosphor is not None and original_field is not None:
        phosphor.data.materials[0] = original_field
    raster_ok = (
        len(desktop_samples) == len(EXPECTED_RASTER_KEYS)
        and len(mobile_samples) == len(EXPECTED_RASTER_KEYS)
        and all(close(desktop_samples.get(str(frame)), expected, 5e-5) for frame, expected in EXPECTED_RASTER_KEYS)
        and all(close(mobile_samples.get(str(frame)), expected * 0.94, 5e-5) for frame, expected in EXPECTED_RASTER_KEYS)
    )
    check(records, "raster_expansion_settling_events", raster_ok, {"desktop": desktop_samples, "mobile": mobile_samples}, {"desktop": {str(frame): value for frame, value in EXPECTED_RASTER_KEYS}, "mobile": {str(frame): value * 0.94 for frame, value in EXPECTED_RASTER_KEYS}})

    wake_objects = [bpy.data.objects.get(name) for name in ("Phase3R_WakePhosphorHalo", "Phase3R_WakePhosphorBody", "Phase3R_WakePhosphorCore")]
    wake_materials = [bpy.data.materials.get(name) for name in ("Phase3R_WakeHalo_Neutral", "Phase3R_WakeBody_Neutral", "Phase3R_WakeCore_Neutral")]
    wake_frames = (299, 300, 308, 315, 320)
    wake_state: dict[str, Any] = {}
    for frame in wake_frames:
        scene.frame_set(frame)
        wake_state[str(frame)] = {
            "hidden": [None if obj is None else bool(obj.hide_render) for obj in wake_objects],
            "strengths": [None if material is None else socket_value(material, "Principled BSDF", "Emission Strength") for material in wake_materials],
        }
    wake_ok = (
        all(obj is not None for obj in wake_objects)
        and all(material is not None for material in wake_materials)
        and wake_state["299"]["hidden"] == [True, True, True]
        and wake_state["300"]["hidden"] == [False, False, False]
        and wake_state["308"]["hidden"] == [False, False, False]
        and all(close(actual, expected, 5e-5) for actual, expected in zip(wake_state["308"]["strengths"], (0.32, 0.62, 1.60)))
        and wake_state["315"]["hidden"] == [False, False, False]
        and all(close(actual, expected, 5e-5) for actual, expected in zip(wake_state["315"]["strengths"], (0.16, 0.31, 0.80)))
        and wake_state["320"]["hidden"] == [True, True, True]
        and all(close(actual, 0.0, 5e-5) for actual in wake_state["320"]["strengths"])
    )
    check(records, "horizontal_line_to_raster_event", wake_ok, wake_state, "hidden F299; visible F300; neutral three-layer peak F308; transition F315; zero and hidden by F320")

    q_materials = [white, magenta]
    q_emission_samples: dict[str, list[float | None]] = {}
    q_visibility_samples: dict[str, list[bool | None]] = {}
    q_scale_samples: dict[str, Any] = {}
    for frame in (355, 356, 361, 370, 405, 460, 480, 500, 501):
        scene.frame_set(frame)
        q_emission_samples[str(frame)] = [None if material is None else socket_value(material, "Phase4R0 Approved Q Phosphor", "Emission Strength") for material in q_materials]
        q_visibility_samples[str(frame)] = [None if obj is None else bool(obj.hide_render) for obj in q_objects]
        q_scale_samples[str(frame)] = None if q_root is None else [float(value) for value in q_root.scale]
    q_events_ok = (
        all(all(close(actual, expected, 5e-5) for actual in q_emission_samples[str(frame)]) for frame, expected in EXPECTED_Q_EMISSION_KEYS)
        and q_visibility_samples["355"] == [True, True]
        and all(q_visibility_samples[str(frame)] == [False, False] for frame in (356, 361, 370, 405, 460, 480, 500))
        and q_visibility_samples["501"] == [True, True]
        and all(close(value, 11.57, 5e-4) for value in q_scale_samples["356"])
        and all(close(value, 11.78, 5e-4) for value in q_scale_samples["361"])
        and all(close(value, 11.70, 5e-4) for value in q_scale_samples["370"])
    )
    check(records, "q_readable_hold_threshold_events", q_events_ok, {"emission": q_emission_samples, "visibility": q_visibility_samples, "root_scale": q_scale_samples}, "hidden/zero F355; first readable F356; restrained settle by F370; hold through F405; attenuate to F500; hidden F501")

    extension_collection = bpy.data.collections.get("PHASE4R0_PROVING_FIELD_EXTENSION")
    extension = bpy.data.objects.get("P4R0_ProvingGround_FieldExtension")
    extension_material = bpy.data.materials.get("P4R0_ProvingGround_DarkAggregateTerrain_Extension")
    accepted_terrain = bpy.data.objects.get("ProvingGround_Terrain")
    accepted_material = bpy.data.materials.get("ProvingGround_DarkAggregateTerrain")
    extension_members = [] if extension_collection is None else sorted(obj.name for obj in extension_collection.all_objects)
    extension_allowlist_ok = (
        extension_collection is not None
        and not list(extension_collection.children)
        and extension_members == ["P4R0_ProvingGround_FieldExtension"]
        and extension is not None
        and extension.type == "MESH"
        and [material.name for material in extension.data.materials] == ["P4R0_ProvingGround_DarkAggregateTerrain_Extension"]
        and extension.get("phase4r0_accepted_terrain_edited") is False
        and extension.animation_data is None
    )
    check(records, "proving_extension_exact_allowlist", extension_allowlist_ok, {"members": extension_members, "children": [] if extension_collection is None else [child.name for child in extension_collection.children], "material_slots": [] if extension is None else [material.name for material in extension.data.materials], "accepted_terrain_edited": None if extension is None else extension.get("phase4r0_accepted_terrain_edited")}, {"members": ["P4R0_ProvingGround_FieldExtension"], "children": [], "material": "P4R0_ProvingGround_DarkAggregateTerrain_Extension", "accepted_terrain_edited": False})
    accepted_bounds = None if accepted_terrain is None else world_bounds(accepted_terrain)
    extension_bounds = None if extension is None else world_bounds(extension)
    bounds_ok = (
        accepted_bounds is not None
        and extension_bounds is not None
        and all(close(actual, expected, 1e-5) for actual, expected in zip(accepted_bounds["min"], (-5.0, -5.0, -0.06)))
        and all(close(actual, expected, 1e-5) for actual, expected in zip(accepted_bounds["max"], (5.0, 5.0, 0.0)))
        and all(close(actual, expected, 1e-5) for actual, expected in zip(extension_bounds["min"], (-15.0, -15.0, -0.061)))
        and all(close(actual, expected, 1e-5) for actual, expected in zip(extension_bounds["max"], (15.0, 15.0, -0.001)))
        and close(accepted_bounds["min"][2] - extension_bounds["max"][2], -0.059, 1e-5)
        and close(accepted_bounds["min"][2] - extension_bounds["min"][2], 0.001, 1e-5)
    )
    check(records, "proving_extension_exact_bounds_and_separation", bounds_ok, {"accepted": accepted_bounds, "extension": extension_bounds}, {"accepted": {"min": [-5, -5, -0.06], "max": [5, 5, 0]}, "extension": {"min": [-15, -15, -0.061], "max": [15, 15, -0.001]}, "bottom_separation_m": 0.001})
    extension_modifier_ok = extension is not None and len(extension.modifiers) == 1 and extension.modifiers[0].type == "BEVEL" and close(float(extension.modifiers[0].width), 0.01) and int(extension.modifiers[0].segments) == 6 and extension.modifiers[0].limit_method == "ANGLE"
    check(records, "proving_extension_exact_bevel", extension_modifier_ok, [] if extension is None else [{"type": modifier.type, "width": getattr(modifier, "width", None), "segments": getattr(modifier, "segments", None), "limit": getattr(modifier, "limit_method", None)} for modifier in extension.modifiers], [{"type": "BEVEL", "width": 0.01, "segments": 6, "limit": "ANGLE"}])
    material_clone_ok = accepted_material is not None and extension_material is not None and normalized_terrain_material_signature(accepted_material) == normalized_terrain_material_signature(extension_material)
    material_values = {
        "accepted_noise_scale": None if accepted_material is None else socket_value(accepted_material, "Procedural ABS microtexture", "Scale"),
        "extension_noise_scale": None if extension_material is None else socket_value(extension_material, "Procedural ABS microtexture", "Scale"),
        "base_color": None if extension_material is None else socket_value(extension_material, "Principled BSDF", "Base Color"),
        "roughness": None if extension_material is None else socket_value(extension_material, "Principled BSDF", "Roughness"),
        "bump_strength": None if extension_material is None else socket_value(extension_material, "Moulded ABS micro-bump", "Strength"),
        "bump_distance": None if extension_material is None else socket_value(extension_material, "Moulded ABS micro-bump", "Distance"),
    }
    material_values_ok = (
        close(material_values["accepted_noise_scale"], 240.0)
        and close(material_values["extension_noise_scale"], 720.0)
        and material_values["base_color"] is not None
        and all(close(actual, expected, 2e-6) for actual, expected in zip(material_values["base_color"][:3], (0.014, 0.017, 0.018)))
        and close(material_values["roughness"], 0.82)
        and close(material_values["bump_strength"], 0.11)
        and close(material_values["bump_distance"], 0.00045)
        and extension_material is not None
        and not any(node.bl_idname == "ShaderNodeTexImage" for node in extension_material.node_tree.nodes)
    )
    check(records, "proving_extension_material_exact_clone_override", material_clone_ok and material_values_ok, {"normalized_clone_exact": material_clone_ok, "values": material_values}, {"normalized_clone_exact": True, "accepted_noise_scale": 240, "extension_noise_scale": 720, "base_color": [0.014, 0.017, 0.018], "roughness": 0.82, "bump_strength": 0.11, "bump_distance": 0.00045, "image_textures": 0})
    extension_name_hits = sorted(
        [item.name for item in bpy.data.objects if item.name.startswith("P4R0_ProvingGround_")]
        + [item.name for item in bpy.data.meshes if item.name.startswith("P4R0_ProvingGround_")]
        + [item.name for item in bpy.data.materials if item.name.startswith("P4R0_ProvingGround_")]
    )
    check(records, "proving_extension_named_datablock_allowlist", extension_name_hits == sorted(["P4R0_ProvingGround_FieldExtension", "P4R0_ProvingGround_FieldExtension_Mesh", "P4R0_ProvingGround_DarkAggregateTerrain_Extension"]), extension_name_hits, sorted(["P4R0_ProvingGround_FieldExtension", "P4R0_ProvingGround_FieldExtension_Mesh", "P4R0_ProvingGround_DarkAggregateTerrain_Extension"]))
    derivative_terrain_signature = None if accepted_terrain is None else terrain_authority_signature(accepted_terrain)

    hidden_collections: dict[str, Any] = {}
    hidden_ok = True
    expected_reason = "superseded screen-content/portal hierarchy hidden only in Phase 4-R0 derivative"
    for name in EXPECTED_SUPERSEDED_COLLECTIONS:
        collection = bpy.data.collections.get(name)
        state = None if collection is None else {"hide_render": bool(collection.hide_render), "hide_viewport": bool(collection.hide_viewport), "reason": collection.get("phase4r0_reason")}
        hidden_collections[name] = state
        hidden_ok = hidden_ok and collection is not None and collection.hide_render and collection.hide_viewport and collection.get("phase4r0_reason") == expected_reason
    check(records, "superseded_interface_portal_collections_hidden", hidden_ok, hidden_collections, {name: {"hide_render": True, "hide_viewport": True, "reason": expected_reason} for name in EXPECTED_SUPERSEDED_COLLECTIONS})

    deps = dependency_state(scene)
    no_external = (
        all(deps[key] == 0 for key in ("images", "libraries", "sounds", "speakers", "movie_clips", "cache_files"))
        and not deps["external_fonts"]
        and not deps["external_volumes"]
        and not deps["external_paths"]
        and not deps["sequence_strips"]
    )
    check(records, "no_external_images_libraries_audio_or_cache", no_external, deps, "zero image/library/sound/speaker/movie-clip/cache datablocks; no external fonts/volumes/paths; no sequence strips")

    production_state = {
        "validator_render_calls": 0,
        "build_production_rendering_started": build.get("production_rendering_started"),
        "scene_not_production_render": scene.get("phase4r0_not_production_render"),
        "engine": scene.render.engine,
        "resolution": [scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage],
    }
    production_false = (
        production_state["build_production_rendering_started"] is False
        and production_state["scene_not_production_render"] is True
        and production_state["resolution"] == [960, 600, 100]
        and scene.render.engine in {"BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"}
    )
    check(records, "production_rendering_false", production_false, production_state, {"validator_render_calls": 0, "build_production_rendering_started": False, "scene_not_production_render": True, "engine": "EEVEE previsualization", "resolution": [960, 600, 100]})

    derivative_object_count = len(bpy.data.objects)
    scene.frame_set(cfg.FRAME_START)
    bpy.ops.wm.open_mainfile(filepath=str(cfg.ACCEPTED_PHASE3R_SOURCE), load_ui=False)
    source_scene = bpy.context.scene
    action_comparison = compare_inherited_actions(derivative_action_snapshots, reported_action_records)
    actions_exact = (
        action_comparison["source_action_count"] == EXPECTED_INHERITED_ACTIONS
        and action_comparison["source_keyframe_count"] == EXPECTED_INHERITED_KEYFRAMES
        and action_comparison["source_action_names"] == action_comparison["reported_action_names"]
        and not action_comparison["reported_count_mismatches"]
        and action_comparison["derivative_nonempty"]
        and action_comparison["matched_retimed_points"] == EXPECTED_INHERITED_KEYFRAMES
        and not action_comparison["missing_curves"]
        and not action_comparison["missing_frames"]
        and not action_comparison["value_mismatches"]
    )
    check(records, "independent_421_layered_actions_retimed_nonempty", actions_exact, {key: value for key, value in action_comparison.items() if key not in {"source_action_names", "reported_action_names"}}, {"source_action_count": 421, "source_keyframe_count": 17266, "matched_retimed_points": 17266, "missing_curves": [], "missing_frames": [], "value_mismatches": [], "reported_count_mismatches": {}, "derivative_nonempty": True})
    boost_report = build_timeline.get("previsualization_conduction_legibility", {})
    boost_exact = action_comparison["boost_curve_count"] == 384 and action_comparison["boosted_positive_point_count"] == 1152 and boost_report.get("factors") == EXPECTED_CONDUCTION_FACTORS and boost_report.get("curve_count") == 384 and boost_report.get("positive_keyframe_count") == 1152
    check(records, "independent_conduction_boost_scope", boost_exact, {"independent_curve_count": action_comparison["boost_curve_count"], "independent_positive_points": action_comparison["boosted_positive_point_count"], "independent_curve_count_by_family": action_comparison["boost_curve_count_by_family"], "independent_positive_points_by_family": action_comparison["boosted_positive_point_count_by_family"], "build_report": boost_report}, {"factors": EXPECTED_CONDUCTION_FACTORS, "curve_count": 384, "positive_keyframes": 1152, "scope": "conductor emission and local contact-light energy only"})

    source_terrain = bpy.data.objects.get("ProvingGround_Terrain")
    source_terrain_signature = None if source_terrain is None else terrain_authority_signature(source_terrain)
    terrain_exact = derivative_terrain_signature is not None and source_terrain_signature is not None and payload_hash(derivative_terrain_signature) == payload_hash(source_terrain_signature)
    check(records, "accepted_proving_terrain_unchanged_from_hashed_source", terrain_exact, {"derivative_signature_sha256": None if derivative_terrain_signature is None else payload_hash(derivative_terrain_signature), "accepted_source_signature_sha256": None if source_terrain_signature is None else payload_hash(source_terrain_signature)}, "exact object/mesh/modifier/material authority signature match")
    preserved_report = build.get("preserved_authority", {})
    preserved_ok = (
        terrain_exact
        and preserved_report.get("cabinet_and_cable_inherited_from_exact_hashed_source") is True
        and preserved_report.get("object_count_before") == len(bpy.data.objects)
        and preserved_report.get("object_count_after") == derivative_object_count
        and preserved_report.get("accepted_source_overwritten") is False
    )
    check(records, "build_preservation_counts_and_source_safety", preserved_ok, {"build": preserved_report, "accepted_objects": len(bpy.data.objects), "derivative_objects": derivative_object_count}, {"exact_hashed_source": True, "object_count_before": len(bpy.data.objects), "object_count_after": derivative_object_count, "accepted_source_overwritten": False})

    failed = [record for record in records if not record["pass"]]
    report = {
        "schema": EXPECTED_VALIDATION_SCHEMA,
        "status": "PASS" if not failed else "FAIL",
        "production_rendering": False,
        "validation_scope": "read-only Blender 5.2 source validation; no frame or production rendering",
        "blender_version": bpy.app.version_string,
        "accepted_phase4_parent": cfg.ACCEPTED_PHASE4_PARENT,
        "source_build_report": file_record(cfg.BUILD_REPORT),
        "accepted_phase3r_source": accepted_record,
        "phase4r0_derivative": derivative_record,
        "quantum_q_authorities": {
            "reversed": q_reversed_record,
            "color": q_color_record,
            "isolation": "exact two-path reversed SVG imported directly and independently geometry-matched; no font, redraw, path edit, or qFund source",
            "color_constraints": {
                "reversed_body": "#FFFFFF",
                "color_master_body": "#515151",
                "authored_accent": "#D82B72",
                "geometry_recolor_or_redraw_permitted": False,
            },
        },
        "metrics": {
            "derivative_object_count": derivative_object_count,
            "derivative_action_count": len(derivative_action_snapshots),
            "inherited_actions": {key: value for key, value in action_comparison.items() if key not in {"source_action_names", "reported_action_names"}},
            "camera_motion": camera_metrics,
            "conductor_visibility": conductor_metrics,
            "external_dependencies": deps,
        },
        "check_count": len(records),
        "failed_count": len(failed),
        "checks": records,
    }
    VALIDATION_REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"QH_PHASE4R0_SOURCE_VALIDATION={report['status']}")
    print(f"QH_PHASE4R0_SOURCE_VALIDATION_CHECKS={report['check_count']}")
    print(f"QH_PHASE4R0_SOURCE_VALIDATION_FAILURES={report['failed_count']}")
    print(f"QH_PHASE4R0_SOURCE_VALIDATION_REPORT={VALIDATION_REPORT.resolve()}")
    if failed:
        raise ValidationFailure(f"Phase 4-R0 source validation failed: {[record['id'] for record in failed]}")


def emergency_report(exc: BaseException) -> None:
    report = {
        "schema": EXPECTED_VALIDATION_SCHEMA,
        "status": "FAIL",
        "production_rendering": False,
        "validation_scope": "read-only Blender 5.2 source validation; no frame or production rendering",
        "blender_version": bpy.app.version_string,
        "check_count": 1,
        "failed_count": 1,
        "checks": [
            {
                "id": "validator_unhandled_exception",
                "status": "FAIL",
                "pass": False,
                "actual": {"type": type(exc).__name__, "message": str(exc), "traceback": traceback.format_exc().splitlines()[-20:]},
                "expected": "validator completes all fail-closed checks",
            }
        ],
    }
    VALIDATION_REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("QH_PHASE4R0_SOURCE_VALIDATION=FAIL")
    print(f"QH_PHASE4R0_SOURCE_VALIDATION_REPORT={VALIDATION_REPORT.resolve()}")


if __name__ == "__main__":
    try:
        main()
    except ValidationFailure:
        raise
    except BaseException as error:
        emergency_report(error)
        raise
