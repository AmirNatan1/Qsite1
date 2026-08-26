"""Build the isolated Phase 4-R1.1 targeted repair derivative.

Each requested stage is cumulative: Checkpoint 2 deterministically reapplies
the accepted peripheral-authority repair before the material-only cable repair,
Checkpoint 3 then changes only the accepted mobile lens-key values, and
Checkpoint 4 changes only the two accepted CRT phosphor/glass material graphs.
Every run starts from the exact accepted R1 source, never from the recovered
pre-R1 blend or an earlier derivative.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import sys
from typing import Any, Iterable

import bpy
from bpy_extras.anim_utils import animdata_get_channelbag_for_assigned_slot
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
import phase4r1_1_repair_config as cfg


CRT_COLLECTIONS = (
    "REFINED_CRT_ASSEMBLY",
    "CRT_CABLE_CONNECTION",
    "CRT_PHYSICAL_CONTROLS",
    "CRT_PHYSICAL_SIGNAL_INTERFACE",
    "CRT_REAR_SERVICE_DETAIL",
    "CRT_SCANLINE_GEOMETRY",
    "CRT_SIDE_VENT_DETAIL",
    "CRT_SPEAKER_PERFORATIONS",
    "CRT_STARTUP_RASTER_EXPANSION",
    "CRT_PORTAL_TAKEOVER_CUES",
    "PHASE3R_CRT_SCREEN_REPAIR",
    "PHASE4R1V2_EXACT_Q_SCREEN",
)


def includes_stage(through: str, stage: str) -> bool:
    return cfg.STAGE_ORDER.index(through) >= cfg.STAGE_ORDER.index(stage)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_record(path: Path) -> dict[str, Any]:
    data = path.read_bytes()
    return {"bytes": len(data), "sha256": sha256_bytes(data)}


def canonical_hash(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("ascii")
    return sha256_bytes(encoded)


def rounded(value: float, digits: int = 8) -> float:
    return round(float(value), digits)


def vector(values: Iterable[float]) -> list[float]:
    return [rounded(value) for value in values]


def srgb(value: str) -> tuple[float, float, float, float]:
    clean = value.lstrip("#")
    return tuple(int(clean[index : index + 2], 16) / 255.0 for index in (0, 2, 4)) + (1.0,)


def stable_rna_value(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        return rounded(value)
    if isinstance(value, bpy.types.ID):
        return {"idType": value.bl_rna.identifier, "name": value.name}
    if hasattr(value, "__len__") and not isinstance(value, (bytes, bytearray, str)):
        try:
            return [stable_rna_value(item) for item in value]
        except (AttributeError, RuntimeError, TypeError, ValueError):
            pass
    if hasattr(value, "bl_rna"):
        try:
            path = str(value.path_from_id()) if hasattr(value, "path_from_id") else ""
        except (AttributeError, RuntimeError, TypeError, ValueError):
            path = "<unsupported>"
        return {
            "rnaType": value.bl_rna.identifier,
            "name": str(getattr(value, "name", "")),
            "path": path,
        }
    return {"pythonType": type(value).__name__}


def rna_simple_properties(owner: Any) -> dict[str, Any]:
    record: dict[str, Any] = {}
    for prop in owner.bl_rna.properties:
        if prop.identifier in {"rna_type", "session_uid"} or prop.type in {"POINTER", "COLLECTION"}:
            continue
        try:
            record[prop.identifier] = stable_rna_value(getattr(owner, prop.identifier))
        except (AttributeError, RuntimeError, TypeError, ValueError):
            record[prop.identifier] = "<unreadable>"
    return record


def rna_pointer_properties(owner: Any) -> dict[str, Any]:
    record: dict[str, Any] = {}
    for prop in owner.bl_rna.properties:
        if prop.identifier == "rna_type" or prop.type != "POINTER":
            continue
        try:
            record[prop.identifier] = stable_rna_value(getattr(owner, prop.identifier))
        except (AttributeError, RuntimeError, TypeError, ValueError):
            record[prop.identifier] = "<unreadable>"
    return record


def all_custom_properties(owner: Any) -> dict[str, Any]:
    if not hasattr(owner, "keys"):
        return {}
    return {
        str(key): stable_rna_value(owner[key])
        for key in sorted(owner.keys())
        if str(key) != "_RNA_UI"
    }


def node_socket_record(socket: Any) -> dict[str, Any]:
    default = None
    if hasattr(socket, "default_value"):
        try:
            default = stable_rna_value(socket.default_value)
        except (AttributeError, RuntimeError, TypeError, ValueError):
            default = "<unreadable>"
    return {
        "name": socket.name,
        "identifier": socket.identifier,
        "rnaType": socket.bl_rna.identifier,
        "enabled": bool(socket.enabled),
        "linked": bool(socket.is_linked),
        "hide": bool(socket.hide),
        "default": default,
        "properties": rna_simple_properties(socket),
    }


def material_graph_record(material: bpy.types.Material) -> dict[str, Any]:
    nodes = []
    links = []
    if material.use_nodes and material.node_tree is not None:
        for node in sorted(material.node_tree.nodes, key=lambda item: item.name):
            nodes.append({
                "name": node.name,
                "label": node.label,
                "type": node.bl_idname,
                "mute": bool(node.mute),
                "hide": bool(node.hide),
                "properties": rna_simple_properties(node),
                "pointers": rna_pointer_properties(node),
                "customProperties": all_custom_properties(node),
                "inputs": [node_socket_record(socket) for socket in node.inputs],
                "outputs": [node_socket_record(socket) for socket in node.outputs],
            })
        for link in material.node_tree.links:
            links.append({
                "fromNode": link.from_node.name,
                "fromSocket": link.from_socket.identifier,
                "fromSocketIndex": list(link.from_node.outputs).index(link.from_socket),
                "toNode": link.to_node.name,
                "toSocket": link.to_socket.identifier,
                "toSocketIndex": list(link.to_node.inputs).index(link.to_socket),
                "muted": bool(link.is_muted),
                "valid": bool(link.is_valid),
            })
    record = {
        "name": material.name,
        "diffuseColor": vector(material.diffuse_color),
        "useNodes": bool(material.use_nodes),
        "surfaceRenderMethod": str(getattr(material, "surface_render_method", "")),
        "properties": rna_simple_properties(material),
        "pointers": rna_pointer_properties(material),
        "customProperties": all_custom_properties(material),
        "nodeTree": None if material.node_tree is None else material.node_tree.name,
        "nodes": nodes,
        "links": sorted(
            links,
            key=lambda item: (
                item["fromNode"], item["fromSocketIndex"], item["toNode"], item["toSocketIndex"]
            ),
        ),
    }
    if "<unreadable>" in json.dumps(record, sort_keys=True):
        raise RuntimeError(f"material graph signature contains unreadable RNA: {material.name}")
    record["sha256"] = canonical_hash(record)
    return record


def material_records(names: Iterable[str]) -> dict[str, dict[str, Any]]:
    records: dict[str, dict[str, Any]] = {}
    for name in sorted(names):
        material = bpy.data.materials.get(name)
        if material is None:
            raise RuntimeError(f"missing accepted material authority: {name}")
        records[name] = material_graph_record(material)
    return records


def material_user_inventory(material_name: str) -> list[dict[str, Any]]:
    users = []
    for obj in sorted(bpy.data.objects, key=lambda item: item.name):
        data = obj.data
        if data is None or not hasattr(data, "materials"):
            continue
        for index, material in enumerate(data.materials):
            if material is not None and material.name == material_name:
                users.append({"object": obj.name, "data": data.name, "slot": index})
    return users


def iter_action_fcurves(action: bpy.types.Action):
    legacy = getattr(action, "fcurves", None)
    if legacy is not None:
        try:
            legacy_curves = list(legacy)
        except (AttributeError, RuntimeError, TypeError):
            legacy_curves = []
        if legacy_curves:
            yield from legacy_curves
            return
    seen: set[int] = set()
    for layer in getattr(action, "layers", ()):
        for strip in getattr(layer, "strips", ()):
            for channelbag in getattr(strip, "channelbags", ()):
                for curve in getattr(channelbag, "fcurves", ()):
                    identity = id(curve)
                    if identity not in seen:
                        seen.add(identity)
                        yield curve


def action_signature(owner: Any, excluded_paths: set[str] | None = None) -> Any:
    animation = getattr(owner, "animation_data", None)
    action = None if animation is None else animation.action
    if action is None:
        return None
    excluded_paths = excluded_paths or set()
    curves = []
    for curve in sorted(iter_action_fcurves(action), key=lambda item: (item.data_path, item.array_index)):
        if curve.data_path in excluded_paths:
            continue
        curves.append({
            "dataPath": curve.data_path,
            "arrayIndex": int(curve.array_index),
            "extrapolation": curve.extrapolation,
            "mute": bool(curve.mute),
            "lock": bool(curve.lock),
            "group": None if curve.group is None else curve.group.name,
            "keyframes": [
                {
                    "frame": rounded(point.co.x),
                    "value": rounded(point.co.y),
                    "interpolation": point.interpolation,
                    "easing": point.easing,
                    "handleLeft": vector(point.handle_left),
                    "handleRight": vector(point.handle_right),
                    "handleLeftType": point.handle_left_type,
                    "handleRightType": point.handle_right_type,
                }
                for point in curve.keyframe_points
            ],
        })
    return {"name": action.name, "curves": curves}


def fcurve_authority_record(curve: Any, *, exclude_key_values: bool = False) -> dict[str, Any]:
    keyframes = []
    for point in curve.keyframe_points:
        record = {
            "frame": rounded(point.co.x),
            "interpolation": point.interpolation,
            "easing": point.easing,
            "amplitude": rounded(point.amplitude),
            "back": rounded(point.back),
            "period": rounded(point.period),
            "handleLeftType": point.handle_left_type,
            "handleRightType": point.handle_right_type,
        }
        if exclude_key_values:
            record.update({
                "handleLeftFrame": rounded(point.handle_left.x),
                "handleRightFrame": rounded(point.handle_right.x),
            })
        else:
            record.update({
                "value": rounded(point.co.y),
                "handleLeft": vector(point.handle_left),
                "handleRight": vector(point.handle_right),
            })
        keyframes.append(record)
    return {
        "dataPath": curve.data_path,
        "arrayIndex": int(curve.array_index),
        "extrapolation": curve.extrapolation,
        "mute": bool(curve.mute),
        "lock": bool(curve.lock),
        "group": None if curve.group is None else curve.group.name,
        "modifiers": [
            {
                "type": modifier.type,
                "properties": rna_simple_properties(modifier),
            }
            for modifier in curve.modifiers
        ],
        "keyframes": keyframes,
        "keyValuesExcluded": bool(exclude_key_values),
    }


def action_slot_record(slot: Any) -> dict[str, Any]:
    return {
        "handle": int(slot.handle),
        "identifier": str(slot.identifier),
        "targetIdType": str(slot.target_id_type),
    }


def mobile_camera_action_authority(*, exclude_lens_key_values: bool = False) -> tuple[dict[str, Any], Any]:
    camera_object = bpy.data.objects.get(cfg.MOBILE_CAMERA_OBJECT)
    camera_data = bpy.data.cameras.get(cfg.MOBILE_CAMERA_DATA)
    action = bpy.data.actions.get(cfg.MOBILE_CAMERA_ACTION)
    if (
        camera_object is None
        or camera_object.type != "CAMERA"
        or camera_object.data is not camera_data
        or camera_data is None
        or action is None
    ):
        raise RuntimeError("missing exact accepted mobile camera/action authority")
    object_animation = camera_object.animation_data
    data_animation = camera_data.animation_data
    if (
        object_animation is None
        or data_animation is None
        or object_animation.action is not action
        or data_animation.action is not action
        or object_animation.action_slot is None
        or data_animation.action_slot is None
    ):
        raise RuntimeError("mobile camera object/data do not share the exact layered action authority")
    object_slot = object_animation.action_slot
    data_slot = data_animation.action_slot
    expected_slots = {
        (cfg.MOBILE_CAMERA_OBJECT_SLOT_IDENTIFIER, "OBJECT"),
        (cfg.MOBILE_CAMERA_DATA_SLOT_IDENTIFIER, "CAMERA"),
    }
    slots = list(action.slots)
    if (
        len(slots) != 2
        or {(str(slot.identifier), str(slot.target_id_type)) for slot in slots} != expected_slots
        or str(object_slot.identifier) != cfg.MOBILE_CAMERA_OBJECT_SLOT_IDENTIFIER
        or str(object_slot.target_id_type) != "OBJECT"
        or str(data_slot.identifier) != cfg.MOBILE_CAMERA_DATA_SLOT_IDENTIFIER
        or str(data_slot.target_id_type) != "CAMERA"
        or int(object_slot.handle) == int(data_slot.handle)
    ):
        raise RuntimeError("mobile camera layered-action slot topology mismatch")
    layers = list(action.layers)
    if len(layers) != 1:
        raise RuntimeError("mobile camera action must have exactly one layer")
    strips = list(layers[0].strips)
    if len(strips) != 1 or strips[0].type != "KEYFRAME":
        raise RuntimeError("mobile camera action must have exactly one KEYFRAME strip")
    channelbags = list(strips[0].channelbags)
    if len(channelbags) != 2 or {int(bag.slot_handle) for bag in channelbags} != {
        int(object_slot.handle),
        int(data_slot.handle),
    }:
        raise RuntimeError("mobile camera action channelbag topology mismatch")
    bag_by_handle = {int(bag.slot_handle): bag for bag in channelbags}
    object_bag = bag_by_handle[int(object_slot.handle)]
    data_bag = bag_by_handle[int(data_slot.handle)]
    assigned_object_bag = animdata_get_channelbag_for_assigned_slot(object_animation)
    assigned_data_bag = animdata_get_channelbag_for_assigned_slot(data_animation)
    if (
        assigned_object_bag is None
        or assigned_data_bag is None
        or int(assigned_object_bag.slot_handle) != int(object_slot.handle)
        or int(assigned_data_bag.slot_handle) != int(data_slot.handle)
    ):
        raise RuntimeError("mobile camera assigned channelbags do not match their action slots")
    object_curve_keys = sorted((curve.data_path, int(curve.array_index)) for curve in object_bag.fcurves)
    data_curve_keys = sorted((curve.data_path, int(curve.array_index)) for curve in data_bag.fcurves)
    if object_curve_keys != [("location", 0), ("location", 1), ("location", 2)]:
        raise RuntimeError(f"mobile camera object-channel topology mismatch: {object_curve_keys}")
    if data_curve_keys != [("lens", 0), ("shift_x", 0), ("shift_y", 0)]:
        raise RuntimeError(f"mobile camera data-channel topology mismatch: {data_curve_keys}")
    lens_curves = [
        curve
        for curve in data_bag.fcurves
        if curve.data_path == "lens" and int(curve.array_index) == 0
    ]
    if len(lens_curves) != 1:
        raise RuntimeError("mobile camera action does not contain exactly one lens F-curve")
    lens_curve = lens_curves[0]
    channelbag_records = []
    for bag in sorted(channelbags, key=lambda item: int(item.slot_handle)):
        curves = []
        for curve in sorted(bag.fcurves, key=lambda item: (item.data_path, int(item.array_index))):
            is_lens = (
                int(bag.slot_handle) == int(data_slot.handle)
                and curve.data_path == "lens"
                and int(curve.array_index) == 0
            )
            curves.append(fcurve_authority_record(
                curve,
                exclude_key_values=bool(exclude_lens_key_values and is_lens),
            ))
        channelbag_records.append({
            "slotHandle": int(bag.slot_handle),
            "curves": curves,
        })
    record = {
        "action": action.name,
        "slots": [action_slot_record(slot) for slot in sorted(slots, key=lambda item: int(item.handle))],
        "objectBinding": {
            "object": camera_object.name,
            "data": camera_data.name,
            "slot": action_slot_record(object_slot),
        },
        "dataBinding": {
            "data": camera_data.name,
            "slot": action_slot_record(data_slot),
        },
        "layers": [{
            "name": layers[0].name,
            "stripType": strips[0].type,
            "channelbags": channelbag_records,
        }],
        "lensKeyValuesExcluded": bool(exclude_lens_key_values),
    }
    record["sha256"] = canonical_hash(record)
    return record, lens_curve


def action_datablock_record(action: bpy.types.Action, *, exclude_target_mobile_lens: bool) -> dict[str, Any]:
    slots = list(getattr(action, "slots", ()))
    slot_identifiers = {int(slot.handle): str(slot.identifier) for slot in slots}
    layers = []
    for layer in getattr(action, "layers", ()):
        strips = []
        for strip in getattr(layer, "strips", ()):
            channelbags = []
            for bag in getattr(strip, "channelbags", ()):
                curves = []
                for curve in sorted(bag.fcurves, key=lambda item: (item.data_path, int(item.array_index))):
                    is_target_lens = (
                        action.name == cfg.MOBILE_CAMERA_ACTION
                        and slot_identifiers.get(int(bag.slot_handle)) == cfg.MOBILE_CAMERA_DATA_SLOT_IDENTIFIER
                        and curve.data_path == "lens"
                        and int(curve.array_index) == 0
                    )
                    curves.append(fcurve_authority_record(
                        curve,
                        exclude_key_values=bool(exclude_target_mobile_lens and is_target_lens),
                    ))
                channelbags.append({
                    "slotHandle": int(bag.slot_handle),
                    "curves": curves,
                })
            strips.append({
                "type": str(strip.type),
                "channelbags": channelbags,
            })
        layers.append({"name": str(layer.name), "strips": strips})
    legacy_curves = []
    if not layers:
        legacy_curves = [
            fcurve_authority_record(curve)
            for curve in sorted(iter_action_fcurves(action), key=lambda item: (item.data_path, int(item.array_index)))
        ]
    return {
        "name": action.name,
        "slots": [action_slot_record(slot) for slot in sorted(slots, key=lambda item: int(item.handle))],
        "layers": layers,
        "legacyCurves": legacy_curves,
    }


def global_actions_except_target_lens_authority() -> dict[str, Any]:
    records = [
        action_datablock_record(action, exclude_target_mobile_lens=True)
        for action in sorted(bpy.data.actions, key=lambda item: item.name)
    ]
    names = [record["name"] for record in records]
    return {
        "actionCount": len(records),
        "actionNamesSha256": canonical_hash(names),
        "allActionsExceptTargetLensSha256": canonical_hash(records),
    }


def validate_mobile_lens_curve(curve: Any, expected_keys: Iterable[tuple[int, float]], label: str) -> dict[str, Any]:
    expected = [(int(frame), float(value)) for frame, value in expected_keys]
    points = list(curve.keyframe_points)
    if (
        curve.data_path != "lens"
        or int(curve.array_index) != 0
        or curve.extrapolation != "CONSTANT"
        or bool(curve.mute)
        or bool(curve.lock)
        or curve.group is not None
        or len(curve.modifiers) != 0
        or len(points) != len(expected)
    ):
        raise RuntimeError(f"{label} mobile lens F-curve topology mismatch")
    observed = []
    for point, (expected_frame, expected_value) in zip(points, expected):
        frame = float(point.co.x)
        value = float(point.co.y)
        if (
            abs(frame - expected_frame) > cfg.FLOAT_TOLERANCE
            or abs(value - expected_value) > cfg.FLOAT_TOLERANCE
            or point.interpolation != "LINEAR"
            or point.easing != "AUTO"
            or point.handle_left_type != "AUTO_CLAMPED"
            or point.handle_right_type != "AUTO_CLAMPED"
        ):
            raise RuntimeError(
                f"{label} mobile lens key mismatch at expected F{expected_frame}: "
                f"observed frame={frame:.9f}, value={value:.9f}"
            )
        observed.append({"frame": expected_frame, "millimeters": rounded(value)})
    return {
        "dataPath": curve.data_path,
        "arrayIndex": int(curve.array_index),
        "extrapolation": curve.extrapolation,
        "interpolation": "LINEAR",
        "handleType": "AUTO_CLAMPED",
        "modifierCount": len(curve.modifiers),
        "keys": observed,
        "sha256": canonical_hash(observed),
    }


def linear_key_value(keys: Iterable[tuple[int, float]], frame: int) -> float:
    ordered = [(int(key_frame), float(value)) for key_frame, value in keys]
    if frame <= ordered[0][0]:
        return ordered[0][1]
    for (left_frame, left_value), (right_frame, right_value) in zip(ordered, ordered[1:]):
        if frame <= right_frame:
            fraction = (frame - left_frame) / (right_frame - left_frame)
            return left_value + fraction * (right_value - left_value)
    return ordered[-1][1]


def mobile_lens_evaluation_record(
    scene: bpy.types.Scene,
    curve: Any,
    expected_keys: Iterable[tuple[int, float]],
) -> dict[str, Any]:
    original = scene_frame_record(scene)
    frames = sorted({
        *(int(frame) for frame, _value in expected_keys),
        *(int(frame) for frame in cfg.MOBILE_SCALE_MILESTONE_FRAMES),
    })
    camera_data = bpy.data.cameras[cfg.MOBILE_CAMERA_DATA]
    records = []
    try:
        for frame in frames:
            expected = linear_key_value(expected_keys, frame)
            evaluated_curve = float(curve.evaluate(frame))
            scene.frame_set(frame, subframe=0.0)
            bpy.context.view_layer.update()
            evaluated_data = float(camera_data.lens)
            if (
                abs(evaluated_curve - expected) > 2e-5
                or abs(evaluated_data - expected) > 2e-5
            ):
                raise RuntimeError(
                    f"mobile lens evaluation mismatch at F{frame}: "
                    f"expected={expected:.9f}, curve={evaluated_curve:.9f}, data={evaluated_data:.9f}"
                )
            records.append({
                "frame": frame,
                "expectedMillimeters": rounded(expected),
                "curveMillimeters": rounded(evaluated_curve),
                "cameraDataMillimeters": rounded(evaluated_data),
            })
    finally:
        scene.frame_set(original["frame"], subframe=original["subframe"])
        bpy.context.view_layer.update()
    if scene_frame_record(scene) != original:
        raise RuntimeError("mobile lens sampling failed to restore the accepted scene frame/subframe")
    return {
        "records": records,
        "allEvaluationsExact": True,
        "sha256": canonical_hash(records),
    }


def build_mobile_optics(scene: bpy.types.Scene) -> dict[str, Any]:
    global_actions_before = global_actions_except_target_lens_authority()
    before_full, lens_curve = mobile_camera_action_authority()
    before_except_lens, _ = mobile_camera_action_authority(exclude_lens_key_values=True)
    before_keys = validate_mobile_lens_curve(lens_curve, cfg.MOBILE_R1_LENS_KEYS, "accepted R1")
    before_evaluations = mobile_lens_evaluation_record(scene, lens_curve, cfg.MOBILE_R1_LENS_KEYS)
    original = scene_frame_record(scene)
    for point, (expected_frame, repaired_value) in zip(lens_curve.keyframe_points, cfg.MOBILE_R1_1_LENS_KEYS):
        if abs(float(point.co.x) - float(expected_frame)) > cfg.FLOAT_TOLERANCE:
            raise RuntimeError("mobile lens keyframe order changed before mutation")
        point.co[1] = float(repaired_value)
    lens_curve.update()
    scene.frame_set(original["frame"], subframe=original["subframe"])
    bpy.context.view_layer.update()
    after_full, repaired_curve = mobile_camera_action_authority()
    after_except_lens, _ = mobile_camera_action_authority(exclude_lens_key_values=True)
    after_keys = validate_mobile_lens_curve(repaired_curve, cfg.MOBILE_R1_1_LENS_KEYS, "R1.1 repaired")
    after_evaluations = mobile_lens_evaluation_record(scene, repaired_curve, cfg.MOBILE_R1_1_LENS_KEYS)
    changed_frames = [
        int(before_frame)
        for (before_frame, before_value), (after_frame, after_value) in zip(
            cfg.MOBILE_R1_LENS_KEYS,
            cfg.MOBILE_R1_1_LENS_KEYS,
        )
        if int(before_frame) != int(after_frame) or abs(float(before_value) - float(after_value)) > cfg.FLOAT_TOLERANCE
    ]
    if changed_frames != list(cfg.MOBILE_CHANGED_LENS_KEY_FRAMES):
        raise RuntimeError(f"mobile optics changed the wrong lens-key set: {changed_frames}")
    global_actions_after = global_actions_except_target_lens_authority()
    if before_full["sha256"] == after_full["sha256"]:
        raise RuntimeError("mobile optics stage did not change the exact full mobile camera authority")
    if before_except_lens != after_except_lens:
        raise RuntimeError("mobile optics stage changed shared action topology or a non-lens camera channel")
    if global_actions_before != global_actions_after:
        raise RuntimeError("mobile optics stage changed an action authority outside the target lens payload")
    if scene_frame_record(scene) != original:
        raise RuntimeError("mobile optics stage failed to restore the accepted scene frame/subframe")
    return {
        "repair": "mobile camera lens F-curve values only",
        "cameraObject": cfg.MOBILE_CAMERA_OBJECT,
        "cameraData": cfg.MOBILE_CAMERA_DATA,
        "action": cfg.MOBILE_CAMERA_ACTION,
        "aimObject": cfg.MOBILE_AIM_OBJECT,
        "orbitRig": cfg.MOBILE_ORBIT_RIG,
        "actionAuthorityBefore": before_full,
        "actionAuthorityAfter": after_full,
        "actionExceptLensBefore": before_except_lens,
        "actionExceptLensAfter": after_except_lens,
        "actionExceptLensUnchanged": before_except_lens == after_except_lens,
        "lensKeysBefore": before_keys,
        "lensKeysAfter": after_keys,
        "lensEvaluationsBefore": before_evaluations,
        "lensEvaluationsAfter": after_evaluations,
        "changedLensKeyFrames": changed_frames,
        "expectedChangedLensKeyFrames": list(cfg.MOBILE_CHANGED_LENS_KEY_FRAMES),
        "globalActionsExceptTargetLensBefore": global_actions_before,
        "globalActionsExceptTargetLensAfter": global_actions_after,
        "globalActionsExceptTargetLensUnchanged": global_actions_before == global_actions_after,
        "onlyExistingMobileDataSlotLensCurveChanged": True,
        "milestoneFrames": list(cfg.MOBILE_SCALE_MILESTONE_FRAMES),
        "sceneFrameRestored": True,
    }


def custom_properties(owner: Any) -> dict[str, Any]:
    records = {}
    for key in sorted(owner.keys()):
        if key == "_RNA_UI" or key.startswith("phase4r1_1"):
            continue
        value = owner[key]
        if isinstance(value, (bool, int, float, str)):
            records[key] = rounded(value) if isinstance(value, float) else value
        elif hasattr(value, "__len__"):
            try:
                records[key] = [rounded(item) if isinstance(item, float) else item for item in value]
            except Exception:
                records[key] = repr(value)
    return records


def data_payload(obj: bpy.types.Object, include_camera_lens: bool = True) -> Any:
    data = obj.data
    if data is None:
        return None
    record: dict[str, Any] = {
        "name": data.name,
        "materials": [] if not hasattr(data, "materials") else [material.name for material in data.materials if material is not None],
        "customProperties": custom_properties(data),
    }
    if obj.type == "MESH":
        record.update({
            "vertices": [vector(vertex.co) for vertex in data.vertices],
            "edges": [list(edge.vertices) for edge in data.edges],
            "polygons": [list(polygon.vertices) for polygon in data.polygons],
            "uvLayers": {
                layer.name: [[rounded(loop.uv.x), rounded(loop.uv.y)] for loop in layer.data]
                for layer in data.uv_layers
            },
        })
    elif obj.type == "CURVE":
        splines = []
        for spline in data.splines:
            if spline.type == "BEZIER":
                points = [
                    {
                        "co": vector(point.co),
                        "left": vector(point.handle_left),
                        "right": vector(point.handle_right),
                        "leftType": point.handle_left_type,
                        "rightType": point.handle_right_type,
                        "radius": rounded(point.radius),
                        "tilt": rounded(point.tilt),
                        "weightSoftbody": rounded(getattr(point, "weight_softbody", 0.0)),
                    }
                    for point in spline.bezier_points
                ]
            else:
                points = [
                    {
                        "co": vector(point.co),
                        "radius": rounded(point.radius),
                        "tilt": rounded(point.tilt),
                        "weight": rounded(getattr(point, "weight", 0.0)),
                        "weightSoftbody": rounded(getattr(point, "weight_softbody", 0.0)),
                    }
                    for point in spline.points
                ]
            splines.append({
                "type": spline.type,
                "cyclic": bool(spline.use_cyclic_u),
                "endpoint": bool(getattr(spline, "use_endpoint_u", False)),
                "bezierEndpoint": bool(getattr(spline, "use_bezier_u", False)),
                "orderU": int(getattr(spline, "order_u", 0)),
                "resolutionU": int(getattr(spline, "resolution_u", 0)),
                "tiltInterpolation": str(getattr(spline, "tilt_interpolation", "")),
                "radiusInterpolation": str(getattr(spline, "radius_interpolation", "")),
                "points": points,
            })
        record.update({
            "dimensions": data.dimensions,
            "resolutionU": int(data.resolution_u),
            "renderResolutionU": int(data.render_resolution_u),
            "resolutionV": int(data.resolution_v),
            "renderResolutionV": int(getattr(data, "render_resolution_v", 0)),
            "bevelDepth": rounded(data.bevel_depth),
            "bevelResolution": int(data.bevel_resolution),
            "bevelMode": data.bevel_mode,
            "bevelObject": None if data.bevel_object is None else data.bevel_object.name,
            "taperObject": None if data.taper_object is None else data.taper_object.name,
            "fillMode": data.fill_mode,
            "useFillCaps": bool(data.use_fill_caps),
            "twistMode": data.twist_mode,
            "twistSmooth": rounded(getattr(data, "twist_smooth", 0.0)),
            "extrude": rounded(data.extrude),
            "offset": rounded(data.offset),
            "bevelFactorStart": rounded(data.bevel_factor_start),
            "bevelFactorEnd": rounded(data.bevel_factor_end),
            "bevelFactorMappingStart": data.bevel_factor_mapping_start,
            "bevelFactorMappingEnd": data.bevel_factor_mapping_end,
            "splines": splines,
        })
    elif obj.type == "CAMERA":
        record.update({
            "sensorFit": data.sensor_fit,
            "sensorWidth": rounded(data.sensor_width),
            "sensorHeight": rounded(data.sensor_height),
            "shiftX": rounded(data.shift_x),
            "shiftY": rounded(data.shift_y),
            "clipStart": rounded(data.clip_start),
            "clipEnd": rounded(data.clip_end),
        })
        if include_camera_lens:
            record["lens"] = rounded(data.lens)
    elif obj.type == "LIGHT":
        record.update({
            "type": data.type,
            "energy": rounded(data.energy),
            "color": vector(data.color),
            "shadowSoftSize": rounded(data.shadow_soft_size),
            "spotSize": rounded(getattr(data, "spot_size", 0.0)),
            "spotBlend": rounded(getattr(data, "spot_blend", 0.0)),
        })
    return record


def object_signature(
    obj: bpy.types.Object,
    *,
    include_hide_render: bool = True,
    include_camera_lens: bool = True,
    excluded_action_paths: set[str] | None = None,
) -> dict[str, Any]:
    record = {
        "name": obj.name,
        "type": obj.type,
        "location": vector(obj.location),
        "rotationEuler": vector(obj.rotation_euler),
        "scale": vector(obj.scale),
        "color": vector(obj.color),
        "collections": sorted(collection.name for collection in obj.users_collection),
        "parent": None if obj.parent is None else obj.parent.name,
        "parentType": obj.parent_type,
        "hideViewport": bool(obj.hide_viewport),
        "visibleCamera": bool(getattr(obj, "visible_camera", True)),
        "visibleDiffuse": bool(getattr(obj, "visible_diffuse", True)),
        "visibleGlossy": bool(getattr(obj, "visible_glossy", True)),
        "visibleShadow": bool(getattr(obj, "visible_shadow", True)),
        "modifiers": [
            {
                "name": modifier.name,
                "type": modifier.type,
                "showRender": bool(modifier.show_render),
                "showViewport": bool(modifier.show_viewport),
            }
            for modifier in obj.modifiers
        ],
        "constraints": [
            {
                "name": constraint.name,
                "type": constraint.type,
                "mute": bool(constraint.mute),
                "influence": rounded(constraint.influence),
                "target": None if not hasattr(constraint, "target") or constraint.target is None else constraint.target.name,
            }
            for constraint in obj.constraints
        ],
        "customProperties": custom_properties(obj),
        "objectAction": action_signature(obj, excluded_action_paths),
        "dataAction": None if obj.data is None else action_signature(obj.data, excluded_action_paths),
        "data": data_payload(obj, include_camera_lens),
    }
    if include_hide_render:
        record["hideRender"] = bool(obj.hide_render)
    return record


def collection_hash(names: Iterable[str], excluded_objects: set[str] | None = None) -> str:
    excluded_objects = excluded_objects or set()
    records = []
    seen = set()
    for name in names:
        collection = bpy.data.collections.get(name)
        if collection is None:
            raise RuntimeError(f"missing accepted collection: {name}")
        for obj in collection.objects:
            if obj.name in excluded_objects or obj.name in seen:
                continue
            seen.add(obj.name)
            records.append(object_signature(obj))
    return canonical_hash(sorted(records, key=lambda item: item["name"]))


def camera_family_hash(family: str, exclude_lens: bool = False) -> str:
    family_title = family.title()
    names = (
        f"Phase4R1_Camera_{family_title}",
        f"Phase4R1_OrbitRig_{family_title}",
        "Phase4R1_EstablishingAimTarget" if family == "desktop" else f"Phase4R1_EstablishingAimTarget_{family_title}",
    )
    records = []
    for name in names:
        obj = bpy.data.objects.get(name)
        if obj is None:
            raise RuntimeError(f"missing accepted camera-family object: {name}")
        records.append(object_signature(
            obj,
            include_camera_lens=not exclude_lens,
            excluded_action_paths={"lens"} if exclude_lens else None,
        ))
    return canonical_hash(records)


def packed_q_record() -> dict[str, Any]:
    image = bpy.data.images.get(cfg.EXACT_Q_IMAGE_NAME)
    if image is None or len(image.packed_files) != 1 or image.packed_files[0].packed_file is None:
        raise RuntimeError("accepted exact-Q packed image authority is missing")
    data = bytes(image.packed_files[0].packed_file.data)
    filepath = str(image.filepath or "").replace("\\", "/")
    packed_path = str(image.packed_files[0].filepath or "").replace("\\", "/")
    return {
        "name": image.name,
        "filepath": filepath,
        "packedFilepath": packed_path,
        "bytes": len(data),
        "sha256": sha256_bytes(data),
    }


def timeline_record(scene: bpy.types.Scene) -> dict[str, Any]:
    return {
        "frameStart": int(scene.frame_start),
        "frameEnd": int(scene.frame_end),
        "fps": int(scene.render.fps),
        "fpsBase": rounded(scene.render.fps_base),
    }


def scene_frame_record(scene: bpy.types.Scene) -> dict[str, Any]:
    return {
        "frame": int(scene.frame_current),
        "subframe": rounded(scene.frame_subframe),
    }


def configured_cable_inventory() -> dict[str, Any]:
    families: dict[str, Any] = {}
    all_sheaths: list[bpy.types.Object] = []
    all_currents: list[bpy.types.Object] = []
    all_responses: list[bpy.types.Object] = []
    for family, spec in cfg.CABLE_FAMILY_AUTHORITY.items():
        collection = bpy.data.collections.get(spec["collection"])
        if collection is None:
            raise RuntimeError(f"missing accepted cable collection: {spec['collection']}")
        sheath = bpy.data.objects.get(spec["sheath"])
        if sheath is None or collection.objects.get(sheath.name) is None or sheath.type != "CURVE":
            raise RuntimeError(f"missing accepted {family} sheath authority")
        currents = sorted(
            (obj for obj in collection.objects if obj.name.startswith(spec["currentPrefix"])),
            key=lambda obj: int(obj.get("phase4r1v2_segment_index", -1)),
        )
        responses = sorted(
            (obj for obj in collection.objects if obj.name.startswith(spec["localResponsePrefix"])),
            key=lambda obj: obj.name,
        )
        if len(currents) != spec["currentCount"]:
            raise RuntimeError(f"accepted {family} current-segment count mismatch: {len(currents)}")
        if [int(obj.get("phase4r1v2_segment_index", -1)) for obj in currents] != list(range(spec["currentCount"])):
            raise RuntimeError(f"accepted {family} current segment indices are not exact and contiguous")
        expected_response_names = [f"{spec['localResponsePrefix']}{index:02d}" for index in range(spec["localResponseCount"])]
        if [obj.name for obj in responses] != expected_response_names or any(obj.type != "LIGHT" for obj in responses):
            raise RuntimeError(f"accepted {family} local-response inventory mismatch")
        families[family] = {
            "collection": collection,
            "sheath": sheath,
            "currents": currents,
            "responses": responses,
        }
        all_sheaths.append(sheath)
        all_currents.extend(currents)
        all_responses.extend(responses)
    if len(all_sheaths) != cfg.CABLE_EXPECTED_SHEATH_USERS:
        raise RuntimeError("accepted sheath-object count mismatch")
    if len(all_currents) != cfg.CABLE_EXPECTED_CURRENT_USERS:
        raise RuntimeError("accepted current-object count mismatch")
    if len(all_responses) != cfg.CABLE_EXPECTED_LOCAL_RESPONSE_LIGHTS:
        raise RuntimeError("accepted local-response-light count mismatch")
    return {
        "families": families,
        "sheaths": all_sheaths,
        "currents": all_currents,
        "responses": all_responses,
    }


def source_corridor_axis_audit() -> dict[str, Any]:
    spec = cfg.CABLE_MATERIAL_AUTHORITY["current"]
    axis = tuple(float(value) for value in spec["sourceCorridorAxisWorld"])
    if axis != (1.0, 0.0, 0.0):
        raise RuntimeError("source-corridor shader authority is not the exact fixed +X axis")
    surface_reach_y = float(spec["sourceCorridorGateZeroY"]) + float(spec["sourceCorridorOverlayRadiusMeters"])
    minimum_required = float(spec["sourceCorridorMinimumAbsoluteTangentX"])
    inventory = configured_cable_inventory()
    families: dict[str, Any] = {}
    for family, record in inventory["families"].items():
        edge_count = 0
        minimum_absolute_tangent_x = 1.0
        worst_edge: dict[str, Any] | None = None
        for obj in record["currents"]:
            for spline_index, spline in enumerate(obj.data.splines):
                if spline.type == "BEZIER":
                    points = [obj.matrix_world @ point.co for point in spline.bezier_points]
                else:
                    points = [obj.matrix_world @ Vector(point.co[:3]) for point in spline.points]
                for edge_index, (first, second) in enumerate(zip(points, points[1:])):
                    if min(float(first.y), float(second.y)) > surface_reach_y:
                        continue
                    delta = second - first
                    if delta.length <= 1e-9:
                        raise RuntimeError(f"zero-length {family} current edge enters the source-corridor gate")
                    edge_count += 1
                    absolute_tangent_x = abs(float(delta.normalized().x))
                    if absolute_tangent_x < minimum_absolute_tangent_x:
                        minimum_absolute_tangent_x = absolute_tangent_x
                        worst_edge = {
                            "object": obj.name,
                            "spline": spline_index,
                            "edge": edge_index,
                            "minimumEndpointY": round(min(float(first.y), float(second.y)), 8),
                            "maximumEndpointY": round(max(float(first.y), float(second.y)), 8),
                            "absoluteTangentX": round(absolute_tangent_x, 8),
                        }
        if edge_count == 0 or minimum_absolute_tangent_x < minimum_required:
            raise RuntimeError(
                f"{family} source-corridor current axis is not safely +X-aligned: "
                f"edges={edge_count}, minimum |Tx|={minimum_absolute_tangent_x:.9f}"
            )
        families[family] = {
            "surfaceEligibleEdgeCount": edge_count,
            "minimumAbsoluteTangentX": round(minimum_absolute_tangent_x, 8),
            "worstEligibleEdge": worst_edge,
            "passesMinimum": True,
        }
    return {
        "axisWorld": list(axis),
        "gateFullY": float(spec["sourceCorridorGateFullY"]),
        "gateZeroY": float(spec["sourceCorridorGateZeroY"]),
        "overlayRadiusMeters": float(spec["sourceCorridorOverlayRadiusMeters"]),
        "surfaceEligibilityMaximumCenterlineY": round(surface_reach_y, 8),
        "minimumAbsoluteTangentXRequired": minimum_required,
        "families": families,
        "allFamiliesPass": True,
    }


def cable_authority_snapshot() -> dict[str, str]:
    inventory = configured_cable_inventory()
    collection_records = []
    geometry_records = []
    progression_records = []
    binding_records = []
    local_response_records = []
    for family, record in inventory["families"].items():
        collection = record["collection"]
        collection_records.append({
            "family": family,
            "name": collection.name,
            "hideRender": bool(collection.hide_render),
            "hideViewport": bool(collection.hide_viewport),
            "objects": sorted(obj.name for obj in collection.objects),
        })
    for obj in sorted(inventory["sheaths"] + inventory["currents"], key=lambda item: item.name):
        signature = object_signature(obj)
        signature.pop("objectAction", None)
        signature.pop("dataAction", None)
        signature.pop("color", None)
        if isinstance(signature.get("data"), dict):
            signature["data"].pop("materials", None)
        geometry_records.append(signature)
        binding_records.append({
            "object": obj.name,
            "data": obj.data.name,
            "materials": [material.name if material is not None else None for material in obj.data.materials],
        })
    for obj in sorted(inventory["currents"], key=lambda item: item.name):
        progression_records.append({
            "object": obj.name,
            "segmentIndex": int(obj["phase4r1v2_segment_index"]),
            "arrivalFrame": int(obj["phase4r1v2_arrival_frame"]),
            "action": action_signature(obj),
        })
    for obj in sorted(inventory["responses"], key=lambda item: item.name):
        local_response_records.append(object_signature(obj))
    contact = bpy.data.objects.get(cfg.CABLE_CONTACT_PROFILE_OBJECT)
    if contact is None or contact.type != "CURVE":
        raise RuntimeError("accepted weighted sheath contact-profile geometry is missing")
    return {
        "cableFamilyCollectionState": canonical_hash(collection_records),
        "cableContactProfileGeometry": canonical_hash(object_signature(contact)),
        "cableRouteGeometryAndTopology": canonical_hash(geometry_records),
        "cableCurrentProgressionActions": canonical_hash(progression_records),
        "cableMaterialBindings": canonical_hash(binding_records),
        "cableLocalResponseAuthority": canonical_hash(local_response_records),
    }


def current_state_hashes(scene: bpy.types.Scene) -> dict[str, str]:
    inventory = configured_cable_inventory()
    original = scene_frame_record(scene)
    hashes: dict[str, str] = {}
    try:
        for frame in cfg.CABLE_CURRENT_STATE_FRAMES:
            scene.frame_set(int(frame), subframe=0.0)
            bpy.context.view_layer.update()
            records = [
                {
                    "object": obj.name,
                    "segmentIndex": int(obj["phase4r1v2_segment_index"]),
                    "arrivalFrame": int(obj["phase4r1v2_arrival_frame"]),
                    "color": vector(obj.color),
                }
                for obj in sorted(inventory["currents"], key=lambda item: item.name)
            ]
            hashes[str(frame)] = canonical_hash(records)
    finally:
        scene.frame_set(original["frame"], subframe=original["subframe"])
        bpy.context.view_layer.update()
    if scene_frame_record(scene) != original:
        raise RuntimeError("current-state sampling failed to restore the accepted scene frame/subframe")
    return hashes


def preservation_snapshot() -> dict[str, str]:
    q_plane = bpy.data.objects.get("Phase4R1V2_ExactQuantumQ_PicturePlane")
    screen_spill = bpy.data.objects.get("Phase3_ScreenSpill")
    if q_plane is None or screen_spill is None:
        raise RuntimeError("missing accepted exact-Q plane or ScreenSpill object")
    accepted_lights = [
        object_signature(obj)
        for obj in sorted((item for item in bpy.data.objects if item.type == "LIGHT" and not item.name.startswith("Phase4R11_")), key=lambda item: item.name)
    ]
    cable = cable_authority_snapshot()
    return {
        "hallExceptOpeningHeaders": collection_hash(
            ("PHASE4R1_HALL_ARCHITECTURE", "PHASE4R1_HALL_STRUCTURE"),
            set(cfg.SUPPRESSED_OPENING_HEADER_OBJECTS),
        ),
        "centralFloor": collection_hash(("PHASE4R1_HALL_FLOOR",)),
        "cableOriginAndDistributionSource": collection_hash(("PHASE4R1_DISTRIBUTION_SOURCE",)),
        **cable,
        "connections": collection_hash(("PHASE4R1V2_RESTRAINED_CONNECTIONS",)),
        "crtGeometryActionsAndMaterialBindings": collection_hash(CRT_COLLECTIONS),
        "desktopCamera": camera_family_hash("desktop"),
        "landscapeCamera": camera_family_hash("landscape"),
        "mobileCameraFull": camera_family_hash("mobile"),
        "mobileCameraExceptLens": camera_family_hash("mobile", exclude_lens=True),
        "exactQ": canonical_hash({"image": packed_q_record(), "plane": object_signature(q_plane)}),
        "acceptedLights": canonical_hash(accepted_lights),
        "screenSpill": canonical_hash(object_signature(screen_spill)),
    }


def periphery_authority_snapshot() -> dict[str, Any]:
    collection = bpy.data.collections.get(cfg.COLLECTION)
    if collection is None:
        raise RuntimeError("missing cumulative R1.1 periphery collection")
    objects = sorted(collection.objects, key=lambda item: item.name)
    object_records = [object_signature(obj) for obj in objects]
    material_names = sorted(spec["name"] for spec in cfg.MATERIALS.values())
    materials = material_records(material_names)
    header_records = {
        name: object_signature(bpy.data.objects[name])
        for name in cfg.SUPPRESSED_OPENING_HEADER_OBJECTS
        if bpy.data.objects.get(name) is not None
    }
    if (
        len(header_records) != len(cfg.SUPPRESSED_OPENING_HEADER_OBJECTS)
        or not all(record["hideRender"] for record in header_records.values())
    ):
        raise RuntimeError("cumulative periphery does not retain both exact suppressed opening headers")
    record = {
        "collection": collection.name,
        "collectionHideRender": bool(collection.hide_render),
        "collectionHideViewport": bool(collection.hide_viewport),
        "objectCount": len(objects),
        "objectNames": [obj.name for obj in objects],
        "objectAuthoritySha256": canonical_hash(object_records),
        "materialNames": material_names,
        "materialAuthoritySha256": canonical_hash(materials),
        "openingHeaderAuthoritySha256": canonical_hash(header_records),
    }
    record["sha256"] = canonical_hash(record)
    return record


def enabled_input(node: bpy.types.Node, name: str):
    sockets = [
        socket
        for socket in node.inputs
        if socket.name == name
        and socket.enabled
        and socket.bl_idname.startswith("NodeSocketFloat")
    ]
    visible = [socket for socket in sockets if not socket.hide]
    if len(visible) == 1:
        return visible[0]
    if len(sockets) != 1:
        raise RuntimeError(f"expected one enabled float {node.name}.{name} input, got {len(sockets)}")
    return sockets[0]


def required_node(material: bpy.types.Material, name: str, bl_idname: str) -> bpy.types.Node:
    if not material.use_nodes or material.node_tree is None:
        raise RuntimeError(f"material lacks a writable node tree: {material.name}")
    node = material.node_tree.nodes.get(name)
    if node is None or node.bl_idname != bl_idname:
        observed = None if node is None else node.bl_idname
        raise RuntimeError(
            f"material node authority mismatch for {material.name}.{name}: "
            f"expected {bl_idname}, got {observed}"
        )
    return node


def required_input(node: bpy.types.Node, name: str):
    sockets = [socket for socket in node.inputs if socket.name == name and socket.enabled]
    if len(sockets) != 1:
        raise RuntimeError(f"expected one enabled {node.name}.{name} input, got {len(sockets)}")
    return sockets[0]


def required_output(node: bpy.types.Node, name: str):
    sockets = [socket for socket in node.outputs if socket.name == name and socket.enabled]
    if len(sockets) != 1:
        raise RuntimeError(f"expected one enabled {node.name}.{name} output, got {len(sockets)}")
    return sockets[0]


def rna_pointer(value: Any) -> int:
    pointer = getattr(value, "as_pointer", None)
    if pointer is None:
        raise RuntimeError(f"RNA authority lacks as_pointer(): {type(value).__name__}")
    return int(pointer())


def required_link(
    tree: bpy.types.NodeTree,
    from_socket: Any,
    to_socket: Any,
    label: str,
):
    from_pointer = rna_pointer(from_socket)
    to_pointer = rna_pointer(to_socket)
    matches = [
        link
        for link in tree.links
        if rna_pointer(link.from_socket) == from_pointer and rna_pointer(link.to_socket) == to_pointer
    ]
    if len(matches) != 1:
        raise RuntimeError(f"expected one exact {label} link, got {len(matches)}")
    return matches[0]


def has_exact_link(tree: bpy.types.NodeTree, from_socket: Any, to_socket: Any) -> bool:
    from_pointer = rna_pointer(from_socket)
    to_pointer = rna_pointer(to_socket)
    return any(
        rna_pointer(link.from_socket) == from_pointer and rna_pointer(link.to_socket) == to_pointer
        for link in tree.links
    )


def require_float(actual: float, expected: float, label: str) -> None:
    if abs(float(actual) - float(expected)) > cfg.FLOAT_TOLERANCE:
        raise RuntimeError(f"{label} mismatch: expected {expected}, got {actual}")


def node_authority_record(material: bpy.types.Material, node_name: str) -> dict[str, Any]:
    material_record = material_graph_record(material)
    matches = [node for node in material_record["nodes"] if node["name"] == node_name]
    if len(matches) != 1:
        raise RuntimeError(f"expected one material-node record for {material.name}.{node_name}")
    return matches[0]


def data_block_inventory() -> dict[str, dict[str, Any]]:
    inventories = {
        "actions": bpy.data.actions,
        "cameras": bpy.data.cameras,
        "collections": bpy.data.collections,
        "curves": bpy.data.curves,
        "images": bpy.data.images,
        "lights": bpy.data.lights,
        "materials": bpy.data.materials,
        "meshes": bpy.data.meshes,
        "nodeGroups": bpy.data.node_groups,
        "objects": bpy.data.objects,
    }
    record: dict[str, dict[str, Any]] = {}
    for key, values in inventories.items():
        names = sorted(value.name for value in values)
        record[key] = {
            "count": len(names),
            "namesSha256": canonical_hash(names),
        }
    return record


def global_object_authority_hash() -> str:
    records = [object_signature(obj) for obj in sorted(bpy.data.objects, key=lambda item: item.name)]
    return canonical_hash(records)


def validate_crt_material_users() -> dict[str, list[dict[str, Any]]]:
    q_material = bpy.data.materials.get(cfg.CRT_Q_PHOSPHOR_MATERIAL)
    glass_material = bpy.data.materials.get(cfg.CRT_GLASS_MATERIAL)
    if q_material is None or glass_material is None:
        raise RuntimeError("accepted CRT phosphor or glass material is missing")
    q_users = material_user_inventory(cfg.CRT_Q_PHOSPHOR_MATERIAL)
    glass_users = material_user_inventory(cfg.CRT_GLASS_MATERIAL)
    if (
        len(q_users) != cfg.CRT_EXPECTED_Q_MATERIAL_USERS
        or q_users[0]["object"] != cfg.CRT_Q_PLANE_OBJECT
        or q_users[0]["slot"] != 0
    ):
        raise RuntimeError(f"exact-Q phosphor material user authority mismatch: {q_users}")
    if (
        len(glass_users) != cfg.CRT_EXPECTED_GLASS_MATERIAL_USERS
        or glass_users[0]["object"] != cfg.CRT_GLASS_OBJECT
        or glass_users[0]["slot"] != 0
    ):
        raise RuntimeError(f"animated CRT glass material user authority mismatch: {glass_users}")
    if int(q_material.users) != cfg.CRT_EXPECTED_Q_MATERIAL_USERS:
        raise RuntimeError("exact-Q phosphor material datablock user count is not exactly one")
    if int(glass_material.users) != cfg.CRT_EXPECTED_GLASS_MATERIAL_USERS:
        raise RuntimeError("animated CRT glass material datablock user count is not exactly one")
    return {"qPhosphor": q_users, "glass": glass_users}


def exact_q_source_material_record() -> dict[str, Any]:
    material = bpy.data.materials.get(cfg.CRT_Q_PHOSPHOR_MATERIAL)
    plane = bpy.data.objects.get(cfg.CRT_Q_PLANE_OBJECT)
    image = bpy.data.images.get(cfg.EXACT_Q_IMAGE_NAME)
    if (
        material is None
        or material.library is not None
        or material.override_library is not None
        or plane is None
        or plane.type != "MESH"
        or image is None
    ):
        raise RuntimeError("exact-Q phosphor source authority is missing or not local")
    if len(plane.data.materials) != 1 or rna_pointer(plane.data.materials[0]) != rna_pointer(material):
        raise RuntimeError("exact-Q plane material binding is not the exact accepted single slot")
    if len(plane.data.vertices) != 4 or len(plane.data.edges) != 4 or len(plane.data.polygons) != 1:
        raise RuntimeError("exact-Q plane is not the accepted four-vertex, four-edge, one-polygon geometry")
    if list(image.size) != [2048, 2048] or image.colorspace_settings.name != "sRGB":
        raise RuntimeError("exact-Q packed image dimensions or colorspace authority changed")
    xs = [float(vertex.co.x) for vertex in plane.data.vertices]
    zs = [float(vertex.co.z) for vertex in plane.data.vertices]
    require_float(max(xs) - min(xs), 0.358, "exact-Q local width")
    require_float(max(zs) - min(zs), 0.358, "exact-Q local height")
    uv_layers = list(plane.data.uv_layers)
    if len(uv_layers) != 1 or uv_layers[0].name != "ExactQ_UV" or not uv_layers[0].active_render:
        raise RuntimeError("exact-Q plane lost its single active-render ExactQ_UV authority")
    observed_uv = [[rounded(loop.uv.x), rounded(loop.uv.y)] for loop in uv_layers[0].data]
    expected_uv = [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]]
    if observed_uv != expected_uv:
        raise RuntimeError(f"exact-Q UV authority mismatch: {observed_uv}")

    output = required_node(material, "Material Output", "ShaderNodeOutputMaterial")
    transparent = required_node(material, "Transparent BSDF", "ShaderNodeBsdfTransparent")
    emission = required_node(material, "Emission", "ShaderNodeEmission")
    texture = required_node(material, "Image Texture", "ShaderNodeTexImage")
    info = required_node(material, "Object Info", "ShaderNodeObjectInfo")
    alpha = required_node(material, "Math", "ShaderNodeMath")
    mix = required_node(material, "Mix Shader", "ShaderNodeMixShader")
    strength = required_node(material, "Math.001", "ShaderNodeMath")
    tree = material.node_tree
    if tree is None or texture.image is None or rna_pointer(texture.image) != rna_pointer(image) or texture.inputs["Vector"].is_linked:
        raise RuntimeError("exact-Q image node binding or unlinked Vector authority changed")
    if texture.interpolation != "Linear":
        raise RuntimeError("exact-Q accepted Linear image interpolation changed")
    if alpha.operation != "MULTIPLY" or strength.operation != "MULTIPLY":
        raise RuntimeError("exact-Q accepted alpha/strength multiply topology changed")
    require_float(strength.inputs[1].default_value, cfg.CRT_MATERIAL_AUTHORITY["qPhosphor"]["baseEmissionStrength"], "exact-Q base emission strength")
    required_link(tree, texture.outputs["Color"], emission.inputs["Color"], "exact-Q texture Color to Emission Color")
    required_link(tree, texture.outputs["Alpha"], alpha.inputs[0], "exact-Q texture Alpha to alpha gate")
    required_link(tree, info.outputs["Alpha"], alpha.inputs[1], "exact-Q Object Alpha to alpha gate")
    required_link(tree, alpha.outputs[0], mix.inputs[0], "exact-Q alpha gate to surface mix")
    required_link(tree, transparent.outputs["BSDF"], mix.inputs[1], "exact-Q transparent surface branch")
    required_link(tree, emission.outputs["Emission"], mix.inputs[2], "exact-Q emission surface branch")
    surface_add = tree.nodes.get("Phase4R11_Q_CorePlusScatterSurface")
    if surface_add is None:
        required_link(tree, mix.outputs["Shader"], output.inputs["Surface"], "exact-Q accepted final surface")
    else:
        if surface_add.bl_idname != "ShaderNodeAddShader":
            raise RuntimeError("exact-Q downstream physical surface node has the wrong type")
        required_link(tree, mix.outputs["Shader"], surface_add.inputs[0], "exact-Q core surface into downstream physical add")
        required_link(tree, surface_add.outputs[0], output.inputs["Surface"], "exact-Q downstream physical surface")
    required_link(tree, info.outputs["Alpha"], strength.inputs[0], "exact-Q Object Alpha to base strength")
    plane_signature = object_signature(plane)
    plane_action = action_signature(plane)
    plane_animation = plane.animation_data
    if (
        plane_action is None
        or plane_action["name"] != cfg.CRT_Q_PLANE_ACTION
        or plane_animation is None
        or len(plane_animation.drivers) != 0
        or len(plane_animation.nla_tracks) != 0
    ):
        raise RuntimeError("exact-Q picture-plane opacity action, driver, or NLA authority changed")
    return {
        "packedImage": packed_q_record(),
        "imageNode": texture.name,
        "imageNodeBoundToExactPackedDatablock": True,
        "imageSize": list(image.size),
        "imageColorSpace": image.colorspace_settings.name,
        "imageInterpolation": texture.interpolation,
        "imageVectorInputUnlinked": not texture.inputs["Vector"].is_linked,
        "textureColorToEmissionColor": True,
        "textureAlphaTimesObjectAlphaGate": True,
        "objectAlphaTimesBaseStrength": True,
        "acceptedCoreSurfaceClosurePreserved": True,
        "planeObject": plane.name,
        "planeData": plane.data.name,
        "planeVertexCount": len(plane.data.vertices),
        "planeEdgeCount": len(plane.data.edges),
        "planePolygonCount": len(plane.data.polygons),
        "planeWidthMeters": rounded(max(xs) - min(xs)),
        "planeHeightMeters": rounded(max(zs) - min(zs)),
        "uvLayer": uv_layers[0].name,
        "uvCoordinates": observed_uv,
        "planeAuthoritySha256": canonical_hash(plane_signature),
        "planeOpacityActionAuthority": plane_action,
        "planeOpacityActionSha256": canonical_hash(plane_action),
        "planeDriverCount": len(plane_animation.drivers),
        "planeNlaTrackCount": len(plane_animation.nla_tracks),
    }


def exact_q_image_reference_record(expected_sampler_count: int) -> dict[str, Any]:
    material = bpy.data.materials.get(cfg.CRT_Q_PHOSPHOR_MATERIAL)
    image = bpy.data.images.get(cfg.EXACT_Q_IMAGE_NAME)
    if material is None or material.node_tree is None or image is None:
        raise RuntimeError("exact-Q material, node tree, or packed image is missing")
    samplers = sorted(
        (node for node in material.node_tree.nodes if node.bl_idname == "ShaderNodeTexImage"),
        key=lambda node: node.name,
    )
    references = [
        {
            "node": node.name,
            "image": None if node.image is None else node.image.name,
            "samePackedImagePointer": node.image is not None and rna_pointer(node.image) == rna_pointer(image),
            "interpolation": node.interpolation,
            "extension": node.extension,
        }
        for node in samplers
    ]
    if len(samplers) != expected_sampler_count:
        raise RuntimeError(
            f"exact-Q image sampler count mismatch: expected {expected_sampler_count}, got {len(samplers)}"
        )
    if int(image.users) != expected_sampler_count:
        raise RuntimeError(
            f"exact-Q packed image user count mismatch: expected {expected_sampler_count}, got {int(image.users)}"
        )
    if not all(item["samePackedImagePointer"] for item in references):
        raise RuntimeError("an exact-Q image sampler references a different image datablock")
    return {
        "packedImage": packed_q_record(),
        "samplerCount": len(samplers),
        "imageUsers": int(image.users),
        "allSamplersReferenceSamePackedImagePointer": True,
        "samplers": references,
    }


def animated_glass_source_record() -> dict[str, Any]:
    material = bpy.data.materials.get(cfg.CRT_GLASS_MATERIAL)
    glass = bpy.data.objects.get(cfg.CRT_GLASS_OBJECT)
    if (
        material is None
        or material.library is not None
        or material.override_library is not None
        or glass is None
        or glass.type != "MESH"
        or not material.use_nodes
        or material.node_tree is None
    ):
        raise RuntimeError("accepted animated CRT glass authority is missing or not local")
    if len(glass.data.materials) != 1 or rna_pointer(glass.data.materials[0]) != rna_pointer(material):
        raise RuntimeError("accepted CRT glass material binding is not the exact single slot")
    inherited = required_node(material, "Principled BSDF", "ShaderNodeBsdfPrincipled")
    output = required_node(material, "Material Output", "ShaderNodeOutputMaterial")
    action = action_signature(material.node_tree)
    animation = material.node_tree.animation_data
    if (
        action is None
        or action["name"] != cfg.CRT_GLASS_ACTION
        or animation is None
        or len(animation.drivers) != 0
        or len(animation.nla_tracks) != 0
    ):
        raise RuntimeError("accepted animated CRT glass action, driver, or NLA authority changed")
    if output.inputs["Volume"].is_linked or output.inputs["Displacement"].is_linked:
        raise RuntimeError("accepted CRT glass unexpectedly uses volume or displacement")
    return {
        "object": glass.name,
        "objectAuthoritySha256": canonical_hash(object_signature(glass)),
        "material": material.name,
        "diffuseColor": vector(material.diffuse_color),
        "surfaceRenderMethod": str(getattr(material, "surface_render_method", "")),
        "inheritedPrincipledNodeSha256": canonical_hash(node_authority_record(material, inherited.name)),
        "nodeTreeAction": action["name"],
        "nodeTreeActionAuthority": action,
        "nodeTreeActionSha256": canonical_hash(action),
        "nodeTreeDriverCount": len(animation.drivers),
        "nodeTreeNlaTrackCount": len(animation.nla_tracks),
        "volumeUnlinked": not output.inputs["Volume"].is_linked,
        "displacementUnlinked": not output.inputs["Displacement"].is_linked,
    }


def dormant_legacy_crt_scan_record() -> dict[str, Any]:
    scan_collection = bpy.data.collections.get("CRT_SCANLINE_GEOMETRY")
    startup_collection = bpy.data.collections.get("CRT_STARTUP_RASTER_EXPANSION")
    wake = bpy.data.objects.get("CRT_WakeHorizontalPhosphorLine")
    if scan_collection is None or startup_collection is None or wake is None:
        raise RuntimeError("accepted dormant CRT scan/startup/wake authority is missing")
    scanlines = sorted(scan_collection.objects, key=lambda item: item.name)
    startup_bars = sorted(startup_collection.objects, key=lambda item: item.name)
    if len(scanlines) != 32 or len(startup_bars) != 18:
        raise RuntimeError(
            f"accepted dormant CRT coarse-geometry counts changed: "
            f"scanlines={len(scanlines)}, startupBars={len(startup_bars)}"
        )
    participants = scanlines + startup_bars + [wake]
    if any(not obj.hide_render for obj in participants):
        raise RuntimeError("a rejected legacy CRT scan/startup/wake object is render-visible")
    if any(action_signature(obj) is not None for obj in participants):
        raise RuntimeError("a rejected legacy CRT scan/startup/wake object is animated")
    return {
        "coarseScanlineCount": len(scanlines),
        "startupExpansionBarCount": len(startup_bars),
        "wakeLineCount": 1,
        "allHideRender": True,
        "allUnanimated": True,
        "objectAuthoritySha256": canonical_hash([
            object_signature(obj) for obj in participants
        ]),
    }


def crt_fixed_authority_snapshot() -> dict[str, Any]:
    global_actions = global_actions_except_target_lens_authority()
    return {
        "exactQSource": exact_q_source_material_record(),
        "animatedGlassSource": animated_glass_source_record(),
        "dormantLegacyCrtScanGeometry": dormant_legacy_crt_scan_record(),
        "materialUsers": validate_crt_material_users(),
        "globalObjectAuthoritySha256": global_object_authority_hash(),
        "globalActionsExceptTargetMobileLensSha256": canonical_hash(global_actions),
        "dataBlockInventory": data_block_inventory(),
    }


def configure_map_range(
    node: bpy.types.Node,
    *,
    from_minimum: float,
    from_maximum: float,
    to_minimum: float,
    to_maximum: float,
) -> None:
    node.data_type = "FLOAT"
    node.interpolation_type = "SMOOTHERSTEP"
    node.clamp = True
    enabled_input(node, "From Min").default_value = from_minimum
    enabled_input(node, "From Max").default_value = from_maximum
    enabled_input(node, "To Min").default_value = to_minimum
    enabled_input(node, "To Max").default_value = to_maximum


def rebuild_exact_q_phosphor_material() -> dict[str, Any]:
    spec = cfg.CRT_MATERIAL_AUTHORITY["qPhosphor"]
    material = bpy.data.materials.get(spec["name"])
    if material is None or material.library is not None or material.override_library is not None:
        raise RuntimeError("exact-Q phosphor material is missing or not a local writable authority")
    if material.animation_data is not None or material.node_tree is None or material.node_tree.animation_data is not None:
        raise RuntimeError("refusing to alter animated exact-Q material or node tree")
    expected_source_nodes = {
        "Emission": "ShaderNodeEmission",
        "Image Texture": "ShaderNodeTexImage",
        "Material Output": "ShaderNodeOutputMaterial",
        "Math": "ShaderNodeMath",
        "Math.001": "ShaderNodeMath",
        "Mix Shader": "ShaderNodeMixShader",
        "Object Info": "ShaderNodeObjectInfo",
        "Transparent BSDF": "ShaderNodeBsdfTransparent",
    }
    observed_source_nodes = {
        node.name: node.bl_idname
        for node in material.node_tree.nodes
        if node.name in expected_source_nodes
    }
    if (
        observed_source_nodes != expected_source_nodes
        or len(material.node_tree.nodes) != len(expected_source_nodes)
        or len(material.node_tree.links) != 9
    ):
        raise RuntimeError("exact-Q accepted source topology is not the exact eight-node, nine-link authority")
    source_before = exact_q_source_material_record()
    image_references_before = exact_q_image_reference_record(spec["acceptedImageSamplerCount"])
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    emission = required_node(material, "Emission", "ShaderNodeEmission")
    texture = required_node(material, "Image Texture", "ShaderNodeTexImage")
    core_surface = required_node(material, "Mix Shader", "ShaderNodeMixShader")
    output = required_node(material, "Material Output", "ShaderNodeOutputMaterial")
    strength = required_node(material, "Math.001", "ShaderNodeMath")
    if texture.image is None:
        raise RuntimeError("exact-Q accepted source image sampler lost its packed image")
    exact_image = texture.image
    old_strength_link = required_link(
        material.node_tree,
        strength.outputs[0],
        emission.inputs["Strength"],
        "exact-Q accepted base strength to emission",
    )
    links.remove(old_strength_link)

    coordinates = nodes.new("ShaderNodeTexCoord")
    coordinates.name = "Phase4R11_Q_UVCoordinates"
    wave = nodes.new("ShaderNodeTexWave")
    wave.name = "Phase4R11_Q_FineScanBands"
    wave.wave_type = spec["scanBands"]["waveType"]
    wave.bands_direction = spec["scanBands"]["bandsDirection"]
    wave.inputs["Scale"].default_value = spec["scanBands"]["scale"]
    scan_range = nodes.new("ShaderNodeMapRange")
    scan_range.name = "Phase4R11_Q_FineScanMultiplier"
    configure_map_range(
        scan_range,
        from_minimum=0.0,
        from_maximum=1.0,
        to_minimum=spec["scanBands"]["minimumMultiplier"],
        to_maximum=spec["scanBands"]["maximumMultiplier"],
    )

    camera_data = nodes.new("ShaderNodeCameraData")
    camera_data.name = "Phase4R11_Q_CameraData"
    distance_fade = nodes.new("ShaderNodeMapRange")
    distance_fade.name = "Phase4R11_Q_ScanContrastDistanceFade"
    configure_map_range(
        distance_fade,
        from_minimum=spec["scanContrastDistanceFade"]["nearMeters"],
        from_maximum=spec["scanContrastDistanceFade"]["farMeters"],
        to_minimum=spec["scanContrastDistanceFade"]["nearContrastMultiplier"],
        to_maximum=spec["scanContrastDistanceFade"]["farContrastMultiplier"],
    )

    noise = nodes.new("ShaderNodeTexNoise")
    noise.name = "Phase4R11_Q_StaticPhosphorNoise"
    noise.noise_dimensions = spec["staticPhosphorVariation"]["dimensions"]
    noise.inputs["Scale"].default_value = spec["staticPhosphorVariation"]["scale"]
    noise.inputs["Detail"].default_value = spec["staticPhosphorVariation"]["detail"]
    noise.inputs["Roughness"].default_value = spec["staticPhosphorVariation"]["roughness"]
    noise_range = nodes.new("ShaderNodeMapRange")
    noise_range.name = "Phase4R11_Q_StaticPhosphorVariation"
    configure_map_range(
        noise_range,
        from_minimum=0.0,
        from_maximum=1.0,
        to_minimum=spec["staticPhosphorVariation"]["minimumMultiplier"],
        to_maximum=spec["staticPhosphorVariation"]["maximumMultiplier"],
    )

    scan_delta = nodes.new("ShaderNodeMath")
    scan_delta.name = "Phase4R11_Q_ScanDeltaFromUnity"
    scan_delta.operation = "SUBTRACT"
    scan_delta.inputs[1].default_value = 1.0
    faded_scan_delta = nodes.new("ShaderNodeMath")
    faded_scan_delta.name = "Phase4R11_Q_FadedScanDelta"
    faded_scan_delta.operation = "MULTIPLY"
    scan_envelope = nodes.new("ShaderNodeMath")
    scan_envelope.name = "Phase4R11_Q_ScanEnvelope"
    scan_envelope.operation = "ADD"
    scan_envelope.inputs[0].default_value = 1.0
    strength_times_scan = nodes.new("ShaderNodeMath")
    strength_times_scan.name = "Phase4R11_Q_StrengthTimesScanEnvelope"
    strength_times_scan.operation = "MULTIPLY"
    final_strength = nodes.new("ShaderNodeMath")
    final_strength.name = "Phase4R11_Q_FinalPhysicalStrength"
    final_strength.operation = "MULTIPLY"

    core_calibration = nodes.new("ShaderNodeMath")
    core_calibration.name = "Phase4R11_Q_CorePhysicalCalibration"
    core_calibration.operation = "MULTIPLY"
    core_calibration.inputs[1].default_value = spec["emissionCalibration"]
    core_split = nodes.new("ShaderNodeMath")
    core_split.name = "Phase4R11_Q_CoreEnergySplit"
    core_split.operation = "MULTIPLY"
    core_split.inputs[1].default_value = spec["energySplit"]["core"]

    scatter_calibration = nodes.new("ShaderNodeMath")
    scatter_calibration.name = "Phase4R11_Q_ScatterPhysicalCalibration"
    scatter_calibration.operation = "MULTIPLY"
    scatter_calibration.inputs[1].default_value = spec["emissionCalibration"]
    scatter_split = nodes.new("ShaderNodeMath")
    scatter_split.name = "Phase4R11_Q_ScatterEnergySplit"
    scatter_split.operation = "MULTIPLY"
    scatter_split.inputs[1].default_value = spec["energySplit"]["scatter"]
    scatter_average = nodes.new("ShaderNodeMath")
    scatter_average.name = "Phase4R11_Q_ScatterTapAverage"
    scatter_average.operation = "MULTIPLY"
    scatter_average.inputs[1].default_value = spec["scatterRing"]["tapAverageMultiplier"]

    scatter_taps = []
    scatter_premultiplies = []
    for label, offset_x, offset_y in spec["scatterRing"]["offsets"]:
        offset = nodes.new("ShaderNodeVectorMath")
        offset.name = f"Phase4R11_Q_ScatterOffset_{label}"
        offset.operation = "ADD"
        offset.inputs[1].default_value = (offset_x, offset_y, 0.0)
        tap = nodes.new("ShaderNodeTexImage")
        tap.name = f"Phase4R11_Q_ScatterTap_{label}"
        tap.image = exact_image
        tap.interpolation = spec["scatterRing"]["interpolation"]
        tap.extension = spec["scatterRing"]["extension"]
        premultiply = nodes.new("ShaderNodeVectorMath")
        premultiply.name = f"Phase4R11_Q_ScatterPremultiply_{label}"
        premultiply.operation = "SCALE"
        links.new(coordinates.outputs["UV"], offset.inputs[0])
        links.new(offset.outputs["Vector"], tap.inputs["Vector"])
        links.new(tap.outputs["Color"], premultiply.inputs[0])
        links.new(tap.outputs["Alpha"], enabled_input(premultiply, "Scale"))
        scatter_taps.append(tap)
        scatter_premultiplies.append(premultiply)

    scatter_sums = []
    scatter_color = scatter_premultiplies[0].outputs["Vector"]
    for index, premultiply in enumerate(scatter_premultiplies[1:], start=2):
        sum_node = nodes.new("ShaderNodeVectorMath")
        sum_node.name = f"Phase4R11_Q_ScatterSum_{index:02d}"
        sum_node.operation = "ADD"
        links.new(scatter_color, sum_node.inputs[0])
        links.new(premultiply.outputs["Vector"], sum_node.inputs[1])
        scatter_color = sum_node.outputs["Vector"]
        scatter_sums.append(sum_node)

    scatter_emission = nodes.new("ShaderNodeEmission")
    scatter_emission.name = "Phase4R11_Q_ScatterEmission"
    surface_add = nodes.new("ShaderNodeAddShader")
    surface_add.name = "Phase4R11_Q_CorePlusScatterSurface"

    links.new(coordinates.outputs["UV"], wave.inputs["Vector"])
    links.new(wave.outputs["Fac"], enabled_input(scan_range, "Value"))
    links.new(coordinates.outputs["UV"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], enabled_input(noise_range, "Value"))
    links.new(camera_data.outputs["View Distance"], enabled_input(distance_fade, "Value"))
    links.new(scan_range.outputs["Result"], scan_delta.inputs[0])
    links.new(scan_delta.outputs[0], faded_scan_delta.inputs[0])
    links.new(distance_fade.outputs["Result"], faded_scan_delta.inputs[1])
    links.new(faded_scan_delta.outputs[0], scan_envelope.inputs[1])
    links.new(strength.outputs[0], strength_times_scan.inputs[0])
    links.new(scan_envelope.outputs[0], strength_times_scan.inputs[1])
    links.new(strength_times_scan.outputs[0], final_strength.inputs[0])
    links.new(noise_range.outputs["Result"], final_strength.inputs[1])
    links.new(final_strength.outputs[0], core_calibration.inputs[0])
    links.new(core_calibration.outputs[0], core_split.inputs[0])
    links.new(core_split.outputs[0], emission.inputs["Strength"])
    links.new(strength.outputs[0], scatter_calibration.inputs[0])
    links.new(scatter_calibration.outputs[0], scatter_split.inputs[0])
    links.new(scatter_split.outputs[0], scatter_average.inputs[0])
    links.new(scatter_average.outputs[0], scatter_emission.inputs["Strength"])
    links.new(scatter_color, scatter_emission.inputs["Color"])
    old_surface_link = required_link(
        material.node_tree,
        core_surface.outputs["Shader"],
        output.inputs["Surface"],
        "exact-Q accepted core surface",
    )
    links.remove(old_surface_link)
    links.new(core_surface.outputs["Shader"], surface_add.inputs[0])
    links.new(scatter_emission.outputs["Emission"], surface_add.inputs[1])
    links.new(surface_add.outputs[0], output.inputs["Surface"])

    source_after = exact_q_source_material_record()
    if source_after != source_before:
        raise RuntimeError("exact-Q phosphor treatment changed the image, plane, UV, color, alpha, or opacity-action source authority")
    image_references_after = exact_q_image_reference_record(spec["repairedImageSamplerCount"])
    if (
        image_references_after["samplerCount"] - image_references_before["samplerCount"] != 8
        or image_references_after["imageUsers"] - image_references_before["imageUsers"] != 8
    ):
        raise RuntimeError("exact-Q scatter repair did not add exactly eight same-image sampler references")
    return audit_exact_q_physical_treatment()


def audit_exact_q_physical_treatment() -> dict[str, Any]:
    spec = cfg.CRT_MATERIAL_AUTHORITY["qPhosphor"]
    material = bpy.data.materials[spec["name"]]
    tree = material.node_tree
    if tree is None:
        raise RuntimeError("exact-Q phosphor treatment lost its material node tree")
    output = required_node(material, "Material Output", "ShaderNodeOutputMaterial")
    transparent = required_node(material, "Transparent BSDF", "ShaderNodeBsdfTransparent")
    core_surface = required_node(material, "Mix Shader", "ShaderNodeMixShader")
    info = required_node(material, "Object Info", "ShaderNodeObjectInfo")
    alpha = required_node(material, "Math", "ShaderNodeMath")
    strength = required_node(material, "Math.001", "ShaderNodeMath")
    emission = required_node(material, "Emission", "ShaderNodeEmission")
    texture = required_node(material, "Image Texture", "ShaderNodeTexImage")
    coordinates = required_node(material, "Phase4R11_Q_UVCoordinates", "ShaderNodeTexCoord")
    wave = required_node(material, "Phase4R11_Q_FineScanBands", "ShaderNodeTexWave")
    scan_range = required_node(material, "Phase4R11_Q_FineScanMultiplier", "ShaderNodeMapRange")
    camera_data = required_node(material, "Phase4R11_Q_CameraData", "ShaderNodeCameraData")
    distance_fade = required_node(material, "Phase4R11_Q_ScanContrastDistanceFade", "ShaderNodeMapRange")
    noise = required_node(material, "Phase4R11_Q_StaticPhosphorNoise", "ShaderNodeTexNoise")
    noise_range = required_node(material, "Phase4R11_Q_StaticPhosphorVariation", "ShaderNodeMapRange")
    scan_delta = required_node(material, "Phase4R11_Q_ScanDeltaFromUnity", "ShaderNodeMath")
    faded_scan_delta = required_node(material, "Phase4R11_Q_FadedScanDelta", "ShaderNodeMath")
    scan_envelope = required_node(material, "Phase4R11_Q_ScanEnvelope", "ShaderNodeMath")
    strength_times_scan = required_node(material, "Phase4R11_Q_StrengthTimesScanEnvelope", "ShaderNodeMath")
    final_strength = required_node(material, "Phase4R11_Q_FinalPhysicalStrength", "ShaderNodeMath")
    core_calibration = required_node(material, "Phase4R11_Q_CorePhysicalCalibration", "ShaderNodeMath")
    core_split = required_node(material, "Phase4R11_Q_CoreEnergySplit", "ShaderNodeMath")
    scatter_calibration = required_node(material, "Phase4R11_Q_ScatterPhysicalCalibration", "ShaderNodeMath")
    scatter_split = required_node(material, "Phase4R11_Q_ScatterEnergySplit", "ShaderNodeMath")
    scatter_average = required_node(material, "Phase4R11_Q_ScatterTapAverage", "ShaderNodeMath")
    scatter_emission = required_node(material, "Phase4R11_Q_ScatterEmission", "ShaderNodeEmission")
    surface_add = required_node(material, "Phase4R11_Q_CorePlusScatterSurface", "ShaderNodeAddShader")

    expected_offsets = (
        ("E", 0.0065, 0.0),
        ("W", -0.0065, 0.0),
        ("N", 0.0, 0.0065),
        ("S", 0.0, -0.0065),
        ("NE", 0.0045961941, 0.0045961941),
        ("NW", -0.0045961941, 0.0045961941),
        ("SE", 0.0045961941, -0.0045961941),
        ("SW", -0.0045961941, -0.0045961941),
    )
    configured_offsets = tuple(spec["scatterRing"]["offsets"])
    if len(configured_offsets) != len(expected_offsets):
        raise RuntimeError("exact-Q scatter ring does not contain exactly eight taps")
    for configured, expected in zip(configured_offsets, expected_offsets):
        if configured[0] != expected[0]:
            raise RuntimeError("exact-Q scatter ring tap label or order changed")
        require_float(configured[1], expected[1], f"exact-Q {expected[0]} scatter U offset")
        require_float(configured[2], expected[2], f"exact-Q {expected[0]} scatter V offset")
        require_float(math.hypot(configured[1], configured[2]), 0.0065, f"exact-Q {expected[0]} scatter radius")
    require_float(spec["emissionCalibration"], 0.43, "exact-Q common physical emission calibration")
    require_float(spec["energySplit"]["core"], 0.74, "exact-Q core energy split")
    require_float(spec["energySplit"]["scatter"], 0.26, "exact-Q scatter energy split")
    require_float(
        spec["energySplit"]["core"] + spec["energySplit"]["scatter"],
        1.0,
        "exact-Q energy-conserving split sum",
    )
    require_float(spec["scatterRing"]["radiusUv"], 0.0065, "exact-Q scatter ring radius")
    require_float(spec["scatterRing"]["diagonalOffsetUv"], 0.0045961941, "exact-Q scatter diagonal offset")
    if spec["scatterRing"]["tapCount"] != 8:
        raise RuntimeError("exact-Q scatter tap-count authority changed")
    require_float(spec["scatterRing"]["tapAverageMultiplier"], 0.125, "exact-Q scatter tap average")
    require_float(
        spec["scatterRing"]["tapCount"] * spec["scatterRing"]["tapAverageMultiplier"],
        1.0,
        "exact-Q scatter average normalization",
    )

    accepted_node_types = {
        "Emission": "ShaderNodeEmission",
        "Image Texture": "ShaderNodeTexImage",
        "Material Output": "ShaderNodeOutputMaterial",
        "Math": "ShaderNodeMath",
        "Math.001": "ShaderNodeMath",
        "Mix Shader": "ShaderNodeMixShader",
        "Object Info": "ShaderNodeObjectInfo",
        "Transparent BSDF": "ShaderNodeBsdfTransparent",
    }
    physical_node_types = {
        "Phase4R11_Q_UVCoordinates": "ShaderNodeTexCoord",
        "Phase4R11_Q_FineScanBands": "ShaderNodeTexWave",
        "Phase4R11_Q_FineScanMultiplier": "ShaderNodeMapRange",
        "Phase4R11_Q_CameraData": "ShaderNodeCameraData",
        "Phase4R11_Q_ScanContrastDistanceFade": "ShaderNodeMapRange",
        "Phase4R11_Q_StaticPhosphorNoise": "ShaderNodeTexNoise",
        "Phase4R11_Q_StaticPhosphorVariation": "ShaderNodeMapRange",
        "Phase4R11_Q_ScanDeltaFromUnity": "ShaderNodeMath",
        "Phase4R11_Q_FadedScanDelta": "ShaderNodeMath",
        "Phase4R11_Q_ScanEnvelope": "ShaderNodeMath",
        "Phase4R11_Q_StrengthTimesScanEnvelope": "ShaderNodeMath",
        "Phase4R11_Q_FinalPhysicalStrength": "ShaderNodeMath",
    }
    scatter_node_types = {
        "Phase4R11_Q_CorePhysicalCalibration": "ShaderNodeMath",
        "Phase4R11_Q_CoreEnergySplit": "ShaderNodeMath",
        "Phase4R11_Q_ScatterPhysicalCalibration": "ShaderNodeMath",
        "Phase4R11_Q_ScatterEnergySplit": "ShaderNodeMath",
        "Phase4R11_Q_ScatterTapAverage": "ShaderNodeMath",
        "Phase4R11_Q_ScatterEmission": "ShaderNodeEmission",
        "Phase4R11_Q_CorePlusScatterSurface": "ShaderNodeAddShader",
    }
    for label, _offset_x, _offset_y in expected_offsets:
        scatter_node_types[f"Phase4R11_Q_ScatterOffset_{label}"] = "ShaderNodeVectorMath"
        scatter_node_types[f"Phase4R11_Q_ScatterTap_{label}"] = "ShaderNodeTexImage"
        scatter_node_types[f"Phase4R11_Q_ScatterPremultiply_{label}"] = "ShaderNodeVectorMath"
    for index in range(2, 9):
        scatter_node_types[f"Phase4R11_Q_ScatterSum_{index:02d}"] = "ShaderNodeVectorMath"
    expected_node_types = accepted_node_types | physical_node_types | scatter_node_types
    observed_node_types = {node.name: node.bl_idname for node in tree.nodes}
    if len(tree.nodes) != len(expected_node_types) or observed_node_types != expected_node_types:
        raise RuntimeError(
            f"exact-Q repaired node topology mismatch: expected {expected_node_types}, got {observed_node_types}"
        )
    if sum(node.bl_idname == "ShaderNodeBsdfTransparent" for node in tree.nodes) != 1:
        raise RuntimeError("exact-Q scatter repair introduced an additional Transparent BSDF")
    if sum(node.bl_idname == "ShaderNodeMixShader" for node in tree.nodes) != 1:
        raise RuntimeError("exact-Q scatter repair introduced an additional Mix Shader")

    if wave.wave_type != spec["scanBands"]["waveType"] or wave.bands_direction != spec["scanBands"]["bandsDirection"]:
        raise RuntimeError("exact-Q fine scan-band topology changed")
    require_float(wave.inputs["Scale"].default_value, spec["scanBands"]["scale"], "exact-Q scan scale")
    if spec["scanBands"].get("actualBandFormula") != "20 * scale / (2 * pi)":
        raise RuntimeError("exact-Q scan-band scale formula authority changed")
    require_float(
        20.0 * wave.inputs["Scale"].default_value / (2.0 * math.pi),
        spec["scanBands"]["actualBandCount"],
        "exact-Q actual scan-band count",
    )
    if noise.noise_dimensions != spec["staticPhosphorVariation"]["dimensions"]:
        raise RuntimeError("exact-Q static phosphor noise dimensionality changed")
    require_float(noise.inputs["Scale"].default_value, spec["staticPhosphorVariation"]["scale"], "exact-Q phosphor noise scale")
    require_float(noise.inputs["Detail"].default_value, spec["staticPhosphorVariation"]["detail"], "exact-Q phosphor noise detail")
    require_float(noise.inputs["Roughness"].default_value, spec["staticPhosphorVariation"]["roughness"], "exact-Q phosphor noise roughness")
    for node, minimum, maximum, label in (
        (scan_range, spec["scanBands"]["minimumMultiplier"], spec["scanBands"]["maximumMultiplier"], "scan"),
        (distance_fade, spec["scanContrastDistanceFade"]["nearContrastMultiplier"], spec["scanContrastDistanceFade"]["farContrastMultiplier"], "scan-contrast distance"),
        (noise_range, spec["staticPhosphorVariation"]["minimumMultiplier"], spec["staticPhosphorVariation"]["maximumMultiplier"], "noise"),
    ):
        if node.data_type != "FLOAT" or node.interpolation_type != "SMOOTHERSTEP" or not node.clamp:
            raise RuntimeError(f"exact-Q {label} map-range configuration changed")
        require_float(enabled_input(node, "To Min").default_value, minimum, f"exact-Q {label} minimum multiplier")
        require_float(enabled_input(node, "To Max").default_value, maximum, f"exact-Q {label} maximum multiplier")
    for node, label in ((scan_range, "scan"), (noise_range, "noise")):
        require_float(enabled_input(node, "From Min").default_value, 0.0, f"exact-Q {label} source minimum")
        require_float(enabled_input(node, "From Max").default_value, 1.0, f"exact-Q {label} source maximum")
    require_float(enabled_input(distance_fade, "From Min").default_value, spec["scanContrastDistanceFade"]["nearMeters"], "exact-Q near camera distance")
    require_float(enabled_input(distance_fade, "From Max").default_value, spec["scanContrastDistanceFade"]["farMeters"], "exact-Q far camera distance")
    if (
        alpha.operation != "MULTIPLY"
        or strength.operation != "MULTIPLY"
        or scan_delta.operation != "SUBTRACT"
        or faded_scan_delta.operation != "MULTIPLY"
        or scan_envelope.operation != "ADD"
        or strength_times_scan.operation != "MULTIPLY"
        or final_strength.operation != "MULTIPLY"
    ):
        raise RuntimeError("exact-Q contrast-only scan envelope or physical strength operations changed")
    for node, factor, label in (
        (core_calibration, spec["emissionCalibration"], "core physical calibration"),
        (core_split, spec["energySplit"]["core"], "core energy split"),
        (scatter_calibration, spec["emissionCalibration"], "scatter physical calibration"),
        (scatter_split, spec["energySplit"]["scatter"], "scatter energy split"),
        (scatter_average, spec["scatterRing"]["tapAverageMultiplier"], "scatter tap average"),
    ):
        if node.operation != "MULTIPLY":
            raise RuntimeError(f"exact-Q {label} is not a multiplier")
        require_float(node.inputs[1].default_value, factor, f"exact-Q {label}")
    require_float(scan_delta.inputs[1].default_value, 1.0, "exact-Q scan unity subtraction")
    require_float(scan_envelope.inputs[0].default_value, 1.0, "exact-Q scan unity restoration")
    require_float(strength.inputs[1].default_value, spec["baseEmissionStrength"], "exact-Q accepted base emission strength")
    required_link(tree, texture.outputs["Color"], emission.inputs["Color"], "exact-Q accepted texture Color to core Emission Color")
    required_link(tree, texture.outputs["Alpha"], alpha.inputs[0], "exact-Q accepted texture Alpha gate")
    required_link(tree, info.outputs["Alpha"], alpha.inputs[1], "exact-Q accepted Object Alpha gate")
    required_link(tree, alpha.outputs[0], core_surface.inputs[0], "exact-Q accepted alpha gate to core surface")
    required_link(tree, transparent.outputs["BSDF"], core_surface.inputs[1], "exact-Q accepted transparent core branch")
    required_link(tree, emission.outputs["Emission"], core_surface.inputs[2], "exact-Q accepted emission core branch")
    required_link(tree, info.outputs["Alpha"], strength.inputs[0], "exact-Q accepted Object Alpha to base strength")
    required_link(tree, coordinates.outputs["UV"], wave.inputs["Vector"], "exact-Q UV to scan bands")
    required_link(tree, wave.outputs["Fac"], enabled_input(scan_range, "Value"), "exact-Q scan bands to multiplier")
    required_link(tree, coordinates.outputs["UV"], noise.inputs["Vector"], "exact-Q UV to static phosphor noise")
    required_link(tree, noise.outputs["Fac"], enabled_input(noise_range, "Value"), "exact-Q phosphor noise to variation")
    required_link(tree, camera_data.outputs["View Distance"], enabled_input(distance_fade, "Value"), "exact-Q camera distance fade")
    required_link(tree, scan_range.outputs["Result"], scan_delta.inputs[0], "exact-Q scan multiplier to delta")
    required_link(tree, scan_delta.outputs[0], faded_scan_delta.inputs[0], "exact-Q scan delta")
    required_link(tree, distance_fade.outputs["Result"], faded_scan_delta.inputs[1], "exact-Q scan-contrast distance fade")
    required_link(tree, faded_scan_delta.outputs[0], scan_envelope.inputs[1], "exact-Q faded scan delta")
    required_link(tree, strength.outputs[0], strength_times_scan.inputs[0], "exact-Q base strength preserved before scan envelope")
    required_link(tree, scan_envelope.outputs[0], strength_times_scan.inputs[1], "exact-Q contrast-only scan envelope")
    required_link(tree, strength_times_scan.outputs[0], final_strength.inputs[0], "exact-Q scan-adjusted base strength")
    required_link(tree, noise_range.outputs["Result"], final_strength.inputs[1], "exact-Q static variation multiplier")
    required_link(tree, final_strength.outputs[0], core_calibration.inputs[0], "exact-Q final scan/noise strength to common core calibration")
    required_link(tree, core_calibration.outputs[0], core_split.inputs[0], "exact-Q calibrated core strength to core split")
    required_link(tree, core_split.outputs[0], emission.inputs["Strength"], "exact-Q split core emission strength")
    required_link(tree, strength.outputs[0], scatter_calibration.inputs[0], "exact-Q accepted base strength to scatter calibration")
    required_link(tree, scatter_calibration.outputs[0], scatter_split.inputs[0], "exact-Q calibrated scatter strength")
    required_link(tree, scatter_split.outputs[0], scatter_average.inputs[0], "exact-Q scatter energy split")
    required_link(tree, scatter_average.outputs[0], scatter_emission.inputs["Strength"], "exact-Q averaged scatter emission strength")

    exact_image = bpy.data.images.get(cfg.EXACT_Q_IMAGE_NAME)
    if exact_image is None:
        raise RuntimeError("exact-Q packed image disappeared during scatter audit")
    taps = []
    premultiplies = []
    for label, offset_x, offset_y in expected_offsets:
        offset = required_node(material, f"Phase4R11_Q_ScatterOffset_{label}", "ShaderNodeVectorMath")
        tap = required_node(material, f"Phase4R11_Q_ScatterTap_{label}", "ShaderNodeTexImage")
        premultiply = required_node(material, f"Phase4R11_Q_ScatterPremultiply_{label}", "ShaderNodeVectorMath")
        if offset.operation != "ADD":
            raise RuntimeError(f"exact-Q {label} scatter offset is not vector addition")
        for component, expected in zip(offset.inputs[1].default_value, (offset_x, offset_y, 0.0)):
            require_float(component, expected, f"exact-Q {label} scatter offset component")
        if (
            tap.image is None
            or rna_pointer(tap.image) != rna_pointer(exact_image)
            or tap.interpolation != spec["scatterRing"]["interpolation"]
            or tap.extension != spec["scatterRing"]["extension"]
        ):
            raise RuntimeError(f"exact-Q {label} scatter tap image, interpolation, or extension changed")
        if premultiply.operation != "SCALE":
            raise RuntimeError(f"exact-Q {label} scatter tap is not alpha-premultiplied")
        required_link(tree, coordinates.outputs["UV"], offset.inputs[0], f"exact-Q UV to {label} scatter offset")
        required_link(tree, offset.outputs["Vector"], tap.inputs["Vector"], f"exact-Q {label} offset to tap Vector")
        required_link(tree, tap.outputs["Color"], premultiply.inputs[0], f"exact-Q {label} tap Color to premultiply")
        required_link(tree, tap.outputs["Alpha"], enabled_input(premultiply, "Scale"), f"exact-Q {label} tap Alpha to premultiply")
        taps.append(tap)
        premultiplies.append(premultiply)

    sums = []
    scatter_color = premultiplies[0].outputs["Vector"]
    for index, premultiply in enumerate(premultiplies[1:], start=2):
        sum_node = required_node(material, f"Phase4R11_Q_ScatterSum_{index:02d}", "ShaderNodeVectorMath")
        if sum_node.operation != "ADD":
            raise RuntimeError("exact-Q scatter color reduction contains a non-add operation")
        required_link(tree, scatter_color, sum_node.inputs[0], f"exact-Q scatter running sum {index:02d}")
        required_link(tree, premultiply.outputs["Vector"], sum_node.inputs[1], f"exact-Q scatter premultiply into sum {index:02d}")
        scatter_color = sum_node.outputs["Vector"]
        sums.append(sum_node)
    required_link(tree, scatter_color, scatter_emission.inputs["Color"], "exact-Q averaged premultiplied scatter color")
    required_link(tree, core_surface.outputs["Shader"], surface_add.inputs[0], "exact-Q preserved core surface into additive physical surface")
    required_link(tree, scatter_emission.outputs["Emission"], surface_add.inputs[1], "exact-Q scatter emission into additive physical surface")
    required_link(tree, surface_add.outputs[0], output.inputs["Surface"], "exact-Q final core-plus-scatter physical surface")

    if has_exact_link(tree, strength.outputs[0], emission.inputs["Strength"]):
        raise RuntimeError("exact-Q physical treatment left the bypass strength link active")
    if has_exact_link(tree, final_strength.outputs[0], emission.inputs["Strength"]):
        raise RuntimeError("exact-Q scatter repair left the pre-calibration core-strength bypass active")
    if has_exact_link(tree, core_surface.outputs["Shader"], output.inputs["Surface"]):
        raise RuntimeError("exact-Q scatter repair left the pre-scatter surface bypass active")
    if texture.inputs["Vector"].is_linked:
        raise RuntimeError("exact-Q physical treatment changed the pre-effects image Vector input")
    if len(tree.links) != 77:
        raise RuntimeError(f"exact-Q repaired link topology mismatch: expected 77, got {len(tree.links)}")
    image_references = exact_q_image_reference_record(spec["repairedImageSamplerCount"])
    return {
        "material": material.name,
        "authority": spec,
        "nodeCount": len(tree.nodes),
        "linkCount": len(tree.links),
        "newNodeNames": sorted(set(physical_node_types) | set(scatter_node_types)),
        "scatterRepairNodeNames": sorted(scatter_node_types),
        "imageReferences": image_references,
        "imageReferenceChange": {
            "acceptedSamplerCount": spec["acceptedImageSamplerCount"],
            "repairedSamplerCount": spec["repairedImageSamplerCount"],
            "addedSamplerReferences": spec["repairedImageSamplerCount"] - spec["acceptedImageSamplerCount"],
            "samePackedImageDatablock": True,
        },
        "sourceImageVectorInputUnchanged": True,
        "sourceTextureColorAndAlphaBranchesUnchanged": True,
        "objectAlphaGateUnchanged": True,
        "animatedInputsAdded": False,
        "cameraDistanceModulatesOnlyScanContrast": True,
        "baseEmissionStrengthPreservedAtAllDistances": True,
        "upstreamBaseEmissionStrengthPreserved": True,
        "scanNoiseTopologyAndValuesFrozen": True,
        "coreStrengthFormula": "FinalPhysicalStrength * 0.43 * 0.74",
        "scatterStrengthFormula": "Math.001 * 0.43 * 0.26 * 0.125",
        "scatterBypassesScanAndNoise": True,
        "coreScatterEnergySplitSum": rounded(spec["energySplit"]["core"] + spec["energySplit"]["scatter"]),
        "tapColorsPremultipliedByTapAlpha": True,
        "outsideSampledCoverageExactBlackByConstruction": True,
        "additionalTransparentBsdfCount": 0,
        "additionalMixShaderCount": 0,
        "singleScatterEmission": True,
        "singleAddShader": True,
        "physicalStrengthChainValid": True,
    }


def configure_glass_principled(node: bpy.types.Node, source: bpy.types.Node, spec: dict[str, Any]) -> None:
    node.inputs["Base Color"].default_value = tuple(source.inputs["Base Color"].default_value)
    node.inputs["Metallic"].default_value = 0.0
    node.inputs["Roughness"].default_value = spec["roughness"]
    required_input(node, "IOR").default_value = spec["ior"]
    required_input(node, "Transmission Weight").default_value = spec["transmissionWeight"]
    required_input(node, "Specular IOR Level").default_value = spec["specularIorLevel"]
    required_input(node, "Coat Weight").default_value = cfg.CRT_MATERIAL_AUTHORITY["glass"]["coatWeight"]
    required_input(node, "Emission Strength").default_value = 0.0


def rebuild_animated_smoked_glass_material() -> dict[str, Any]:
    spec = cfg.CRT_MATERIAL_AUTHORITY["glass"]
    material = bpy.data.materials.get(spec["name"])
    if material is None or material.library is not None or material.override_library is not None:
        raise RuntimeError("animated CRT glass material is missing or not a local writable authority")
    if material.animation_data is not None or material.node_tree is None or material.node_tree.animation_data is None:
        raise RuntimeError("refusing to alter missing or non-node-tree-animated CRT glass")
    expected_source_nodes = {
        "Material Output": "ShaderNodeOutputMaterial",
        "Principled BSDF": "ShaderNodeBsdfPrincipled",
    }
    observed_source_nodes = {node.name: node.bl_idname for node in material.node_tree.nodes}
    if observed_source_nodes != expected_source_nodes:
        raise RuntimeError(f"accepted animated glass source topology mismatch: {observed_source_nodes}")
    source_before = animated_glass_source_record()
    inherited = required_node(material, "Principled BSDF", "ShaderNodeBsdfPrincipled")
    output = required_node(material, "Material Output", "ShaderNodeOutputMaterial")
    tree = material.node_tree
    old_surface_link = required_link(tree, inherited.outputs["BSDF"], output.inputs["Surface"], "accepted animated glass surface")
    tree.links.remove(old_surface_link)

    rough_transmission = tree.nodes.new("ShaderNodeBsdfPrincipled")
    rough_transmission.name = "Phase4R11_Glass_RoughTransmission"
    configure_glass_principled(rough_transmission, inherited, spec["roughTransmission"])
    inherited_mix = tree.nodes.new("ShaderNodeMixShader")
    inherited_mix.name = "Phase4R11_Glass_InheritedPlusTransmission"
    inherited_mix.inputs[0].default_value = spec["roughTransmissionMix"]

    dark_reflection = tree.nodes.new("ShaderNodeBsdfPrincipled")
    dark_reflection.name = "Phase4R11_Glass_DarkReflection"
    configure_glass_principled(dark_reflection, inherited, spec["darkReflection"])
    fresnel = tree.nodes.new("ShaderNodeFresnel")
    fresnel.name = "Phase4R11_Glass_Fresnel"
    fresnel.inputs["IOR"].default_value = spec["fresnelIor"]
    fresnel_scale = tree.nodes.new("ShaderNodeMath")
    fresnel_scale.name = "Phase4R11_Glass_RestrainedFresnelScale"
    fresnel_scale.operation = "MULTIPLY"
    fresnel_scale.inputs[1].default_value = spec["fresnelMixScale"]
    reflection_mix = tree.nodes.new("ShaderNodeMixShader")
    reflection_mix.name = "Phase4R11_Glass_PhysicalSurface"

    tree.links.new(inherited.outputs["BSDF"], inherited_mix.inputs[1])
    tree.links.new(rough_transmission.outputs["BSDF"], inherited_mix.inputs[2])
    tree.links.new(fresnel.outputs["Fac"], fresnel_scale.inputs[0])
    tree.links.new(fresnel_scale.outputs[0], reflection_mix.inputs[0])
    tree.links.new(inherited_mix.outputs["Shader"], reflection_mix.inputs[1])
    tree.links.new(dark_reflection.outputs["BSDF"], reflection_mix.inputs[2])
    tree.links.new(reflection_mix.outputs["Shader"], output.inputs["Surface"])

    source_after = animated_glass_source_record()
    if source_after != source_before:
        raise RuntimeError("CRT glass treatment changed the inherited Principled node, action, object, or material binding")
    return audit_animated_glass_physical_treatment()


def audit_animated_glass_physical_treatment() -> dict[str, Any]:
    spec = cfg.CRT_MATERIAL_AUTHORITY["glass"]
    material = bpy.data.materials[spec["name"]]
    tree = material.node_tree
    if tree is None:
        raise RuntimeError("animated CRT glass treatment lost its material node tree")
    inherited = required_node(material, "Principled BSDF", "ShaderNodeBsdfPrincipled")
    output = required_node(material, "Material Output", "ShaderNodeOutputMaterial")
    rough_transmission = required_node(material, "Phase4R11_Glass_RoughTransmission", "ShaderNodeBsdfPrincipled")
    inherited_mix = required_node(material, "Phase4R11_Glass_InheritedPlusTransmission", "ShaderNodeMixShader")
    dark_reflection = required_node(material, "Phase4R11_Glass_DarkReflection", "ShaderNodeBsdfPrincipled")
    fresnel = required_node(material, "Phase4R11_Glass_Fresnel", "ShaderNodeFresnel")
    fresnel_scale = required_node(material, "Phase4R11_Glass_RestrainedFresnelScale", "ShaderNodeMath")
    reflection_mix = required_node(material, "Phase4R11_Glass_PhysicalSurface", "ShaderNodeMixShader")
    require_float(required_input(inherited, "Coat Weight").default_value, spec["coatWeight"], "inherited CRT glass coat")
    if inherited.inputs["Normal"].is_linked:
        raise RuntimeError("inherited CRT glass unexpectedly uses bump or normal input")
    require_float(inherited_mix.inputs[0].default_value, spec["roughTransmissionMix"], "CRT glass rough-transmission mix")
    require_float(fresnel.inputs["IOR"].default_value, spec["fresnelIor"], "CRT glass Fresnel IOR")
    if fresnel_scale.operation != "MULTIPLY":
        raise RuntimeError("CRT glass restrained Fresnel node is not a multiplier")
    require_float(fresnel_scale.inputs[1].default_value, spec["fresnelMixScale"], "CRT glass Fresnel mix scale")
    for node, values, label in (
        (rough_transmission, spec["roughTransmission"], "rough transmission"),
        (dark_reflection, spec["darkReflection"], "dark reflection"),
    ):
        require_float(node.inputs["Roughness"].default_value, values["roughness"], f"CRT glass {label} roughness")
        require_float(required_input(node, "Transmission Weight").default_value, values["transmissionWeight"], f"CRT glass {label} transmission")
        require_float(required_input(node, "IOR").default_value, values["ior"], f"CRT glass {label} IOR")
        require_float(required_input(node, "Specular IOR Level").default_value, values["specularIorLevel"], f"CRT glass {label} specular")
        require_float(required_input(node, "Coat Weight").default_value, spec["coatWeight"], f"CRT glass {label} coat")
        require_float(required_input(node, "Emission Strength").default_value, 0.0, f"CRT glass {label} emission")
        if node.inputs["Normal"].is_linked:
            raise RuntimeError(f"CRT glass {label} unexpectedly uses bump or normal input")
        if vector(node.inputs["Base Color"].default_value) != vector(inherited.inputs["Base Color"].default_value):
            raise RuntimeError(f"CRT glass {label} base color diverged from the inherited smoked-black authority")
    required_link(tree, inherited.outputs["BSDF"], inherited_mix.inputs[1], "inherited animated glass branch")
    required_link(tree, rough_transmission.outputs["BSDF"], inherited_mix.inputs[2], "rough transmission glass branch")
    required_link(tree, fresnel.outputs["Fac"], fresnel_scale.inputs[0], "CRT glass Fresnel response")
    required_link(tree, fresnel_scale.outputs[0], reflection_mix.inputs[0], "restrained CRT glass Fresnel factor")
    required_link(tree, inherited_mix.outputs["Shader"], reflection_mix.inputs[1], "CRT glass base physical surface")
    required_link(tree, dark_reflection.outputs["BSDF"], reflection_mix.inputs[2], "CRT glass dark reflection branch")
    required_link(tree, reflection_mix.outputs["Shader"], output.inputs["Surface"], "CRT glass final surface")
    if has_exact_link(tree, inherited.outputs["BSDF"], output.inputs["Surface"]):
        raise RuntimeError("CRT glass treatment left the direct inherited-surface bypass active")
    if output.inputs["Volume"].is_linked or output.inputs["Displacement"].is_linked:
        raise RuntimeError("CRT glass treatment added forbidden volume or displacement")
    return {
        "material": material.name,
        "authority": spec,
        "newNodeNames": sorted(node.name for node in (
            rough_transmission,
            inherited_mix,
            dark_reflection,
            fresnel,
            fresnel_scale,
            reflection_mix,
        )),
        "inheritedPrincipledPreserved": True,
        "inheritedNodeTreeActionPreserved": True,
        "noVolume": True,
        "noBumpOrDisplacement": True,
        "noCoat": True,
        "physicalSurfaceChainValid": True,
    }


def build_crt_material() -> dict[str, Any]:
    users_before = validate_crt_material_users()
    fixed_before = crt_fixed_authority_snapshot()
    image_references_before = exact_q_image_reference_record(
        cfg.CRT_MATERIAL_AUTHORITY["qPhosphor"]["acceptedImageSamplerCount"]
    )
    q_treatment = rebuild_exact_q_phosphor_material()
    glass_treatment = rebuild_animated_smoked_glass_material()
    users_after = validate_crt_material_users()
    fixed_after = crt_fixed_authority_snapshot()
    image_references_after = exact_q_image_reference_record(
        cfg.CRT_MATERIAL_AUTHORITY["qPhosphor"]["repairedImageSamplerCount"]
    )
    if users_after != users_before:
        raise RuntimeError("CRT material repair changed an exact material binding or user")
    if fixed_after != fixed_before:
        raise RuntimeError("CRT material repair changed an object, geometry, image, action, collection, or datablock authority")
    image_reference_delta = {
        "samplers": image_references_after["samplerCount"] - image_references_before["samplerCount"],
        "imageUsers": image_references_after["imageUsers"] - image_references_before["imageUsers"],
    }
    if image_reference_delta != {"samplers": 8, "imageUsers": 8}:
        raise RuntimeError(f"exact-Q packed-image reference delta is not exactly eight: {image_reference_delta}")
    return {
        "repair": "two existing CRT material node graphs only",
        "materialNames": [cfg.CRT_Q_PHOSPHOR_MATERIAL, cfg.CRT_GLASS_MATERIAL],
        "materialAuthority": cfg.CRT_MATERIAL_AUTHORITY,
        "materialUsersBefore": users_before,
        "materialUsersAfter": users_after,
        "materialUsersUnchanged": users_before == users_after,
        "fixedAuthorityBefore": fixed_before,
        "fixedAuthorityAfter": fixed_after,
        "fixedAuthorityUnchanged": fixed_before == fixed_after,
        "dataBlockInventoryUnchanged": fixed_before["dataBlockInventory"] == fixed_after["dataBlockInventory"],
        "onlyAuthorizedMaterialGraphDelta": True,
        "imageReferenceAuthority": {
            "before": image_references_before,
            "after": image_references_after,
            "delta": image_reference_delta,
            "onlyAdditionalReferencesToSamePackedImage": True,
        },
        "qPhosphorTreatment": q_treatment,
        "glassTreatment": glass_treatment,
        "cyclesEvidenceFrames": cfg.CRT_CYCLES_EVIDENCE_FRAMES,
        "stableQCyclesAuthority": cfg.CRT_STABLE_Q_CYCLES_AUTHORITY,
        "qMotionAuthority": cfg.CRT_Q_MOTION_AUTHORITY,
        "maximumAuthorizedEvidenceFrame": cfg.CRT_MAXIMUM_AUTHORIZED_EVIDENCE_FRAME,
        "forbiddenProductionFrameRange": list(cfg.CRT_FORBIDDEN_PRODUCTION_FRAME_RANGE),
        "complete540FrameCyclesFilmStarted": False,
        "finalRefinedMediaIntegrationStarted": False,
        "phase5Authorized": False,
    }


def reset_existing_cable_material(name: str) -> bpy.types.Material:
    material = bpy.data.materials.get(name)
    if material is None or material.library is not None or material.override_library is not None:
        raise RuntimeError(f"cable material is missing or not a local writable authority: {name}")
    if material.animation_data is not None:
        raise RuntimeError(f"refusing to clear animated cable material: {name}")
    if not material.use_nodes or material.node_tree is None or material.node_tree.animation_data is not None:
        raise RuntimeError(f"refusing to clear missing or animated cable node tree: {name}")
    material.node_tree.nodes.clear()
    return material


def rebuild_graphite_sheath_material() -> bpy.types.Material:
    spec = cfg.CABLE_MATERIAL_AUTHORITY["sheath"]
    material = reset_existing_cable_material(spec["name"])
    nodes = material.node_tree.nodes
    links = material.node_tree.links

    output = nodes.new("ShaderNodeOutputMaterial")
    output.name = "Phase4R11_Sheath_Output"
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.name = "Phase4R11_Sheath_PhysicalRubber"
    shader.inputs["Base Color"].default_value = srgb(spec["baseColor"])
    shader.inputs["Metallic"].default_value = 0.0
    shader.inputs["Emission Strength"].default_value = spec["emissionStrength"]
    shader.inputs["Transmission Weight"].default_value = spec["transmissionWeight"]

    coordinates = nodes.new("ShaderNodeTexCoord")
    coordinates.name = "Phase4R11_Sheath_ObjectCoordinates"
    noise = nodes.new("ShaderNodeTexNoise")
    noise.name = "Phase4R11_Sheath_RubberMicrotexture"
    noise.noise_dimensions = "3D"
    noise.inputs["Scale"].default_value = spec["noiseScale"]
    noise.inputs["Detail"].default_value = spec["noiseDetail"]
    noise.inputs["Roughness"].default_value = spec["noiseRoughness"]
    noise.inputs["Distortion"].default_value = spec["noiseDistortion"]
    roughness = nodes.new("ShaderNodeMapRange")
    roughness.name = "Phase4R11_Sheath_RoughnessRange"
    roughness.data_type = "FLOAT"
    roughness.interpolation_type = "SMOOTHERSTEP"
    roughness.clamp = True
    enabled_input(roughness, "From Min").default_value = 0.0
    enabled_input(roughness, "From Max").default_value = 1.0
    enabled_input(roughness, "To Min").default_value = spec["roughnessMinimum"]
    enabled_input(roughness, "To Max").default_value = spec["roughnessMaximum"]
    bump = nodes.new("ShaderNodeBump")
    bump.name = "Phase4R11_Sheath_RubberMicroBump"
    bump.inputs["Strength"].default_value = spec["bumpStrength"]
    bump.inputs["Distance"].default_value = spec["bumpDistanceMeters"]

    links.new(coordinates.outputs["Object"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], enabled_input(roughness, "Value"))
    links.new(roughness.outputs["Result"], shader.inputs["Roughness"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    material.diffuse_color = srgb(spec["baseColor"])
    material["phase4r1v2_palette_hex"] = spec["baseColor"]
    material["phase4r1v2_no_emission"] = True
    material["phase4r1_1_material_role"] = "opaque graphite-rubber cable sheath"
    material["phase4r1_1_roughness_range"] = [spec["roughnessMinimum"], spec["roughnessMaximum"]]
    material["phase4r1_1_bump_distance_m"] = spec["bumpDistanceMeters"]
    return material


def configure_float_map_range(node: bpy.types.Node, minimum: float, maximum: float) -> None:
    node.data_type = "FLOAT"
    node.interpolation_type = "SMOOTHERSTEP"
    node.clamp = True
    enabled_input(node, "From Min").default_value = minimum
    enabled_input(node, "From Max").default_value = maximum
    enabled_input(node, "To Min").default_value = 0.0
    enabled_input(node, "To Max").default_value = 1.0


def rebuild_internal_current_material() -> bpy.types.Material:
    spec = cfg.CABLE_MATERIAL_AUTHORITY["current"]
    if tuple(float(value) for value in spec["sourceCorridorAxisWorld"]) != (1.0, 0.0, 0.0):
        raise RuntimeError("current shader requires the exact fixed +X source-corridor axis")
    material = reset_existing_cable_material(spec["name"])
    nodes = material.node_tree.nodes
    links = material.node_tree.links

    output = nodes.new("ShaderNodeOutputMaterial")
    output.name = "Phase4R11_Current_Output"
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    transparent.name = "Phase4R11_Current_TransparentAhead"
    housing = nodes.new("ShaderNodeBsdfPrincipled")
    housing.name = "Phase4R11_Current_BlackChannelHousing"
    housing.inputs["Base Color"].default_value = srgb(spec["channelHousingColor"])
    housing.inputs["Roughness"].default_value = spec["channelHousingRoughness"]
    housing.inputs["Metallic"].default_value = 0.0
    housing.inputs["Emission Strength"].default_value = 0.0
    housing.inputs["Transmission Weight"].default_value = 0.0
    emission = nodes.new("ShaderNodeEmission")
    emission.name = "Phase4R11_Current_InternalEmission"
    add = nodes.new("ShaderNodeAddShader")
    add.name = "Phase4R11_Current_HousingPlusSignal"
    final_mix = nodes.new("ShaderNodeMixShader")
    final_mix.name = "Phase4R11_Current_AnimatedVisibility"

    info = nodes.new("ShaderNodeObjectInfo")
    info.name = "Phase4R11_Current_ExactAnimatedObjectInfo"
    tint = nodes.new("ShaderNodeMixRGB")
    tint.name = "Phase4R11_Current_DeepWarmMagentaTint"
    tint.blend_type = "MULTIPLY"
    tint.inputs[0].default_value = 1.0
    tint.inputs[2].default_value = spec["objectColorTint"]

    geometry = nodes.new("ShaderNodeNewGeometry")
    geometry.name = "Phase4R11_Current_SurfaceAuthority"
    facing_dot = nodes.new("ShaderNodeVectorMath")
    facing_dot.name = "Phase4R11_Current_ViewFacingDot"
    facing_dot.operation = "DOT_PRODUCT"
    facing_absolute = nodes.new("ShaderNodeMath")
    facing_absolute.name = "Phase4R11_Current_ViewFacingAbsolute"
    facing_absolute.operation = "ABSOLUTE"

    position_components = nodes.new("ShaderNodeSeparateXYZ")
    position_components.name = "Phase4R11_Current_WorldPositionComponents"
    corridor_gate = nodes.new("ShaderNodeMapRange")
    corridor_gate.name = "Phase4R11_Current_SourceCorridorGate"
    corridor_gate.data_type = "FLOAT"
    corridor_gate.interpolation_type = "SMOOTHERSTEP"
    corridor_gate.clamp = True
    enabled_input(corridor_gate, "From Min").default_value = spec["sourceCorridorGateFullY"]
    enabled_input(corridor_gate, "From Max").default_value = spec["sourceCorridorGateZeroY"]
    enabled_input(corridor_gate, "To Min").default_value = 1.0
    enabled_input(corridor_gate, "To Max").default_value = 0.0

    incoming_normalized = nodes.new("ShaderNodeVectorMath")
    incoming_normalized.name = "Phase4R11_Current_NormalizedIncoming"
    incoming_normalized.operation = "NORMALIZE"
    incoming_components = nodes.new("ShaderNodeSeparateXYZ")
    incoming_components.name = "Phase4R11_Current_IncomingComponents"
    incoming_perpendicular = nodes.new("ShaderNodeCombineXYZ")
    incoming_perpendicular.name = "Phase4R11_Current_IncomingPerpendicularToSourceAxis"
    incoming_perpendicular.inputs["X"].default_value = 0.0
    incoming_perpendicular_length = nodes.new("ShaderNodeVectorMath")
    incoming_perpendicular_length.name = "Phase4R11_Current_SourceCorridorPerpendicularLength"
    incoming_perpendicular_length.operation = "LENGTH"
    corridor_denominator = nodes.new("ShaderNodeMath")
    corridor_denominator.name = "Phase4R11_Current_SourceCorridorSafeDenominator"
    corridor_denominator.operation = "MAXIMUM"
    corridor_denominator.inputs[1].default_value = spec["sourceCorridorCrossSectionDenominatorMinimum"]
    normal_normalized = nodes.new("ShaderNodeVectorMath")
    normal_normalized.name = "Phase4R11_Current_NormalizedSurfaceNormal"
    normal_normalized.operation = "NORMALIZE"
    corridor_dot = nodes.new("ShaderNodeVectorMath")
    corridor_dot.name = "Phase4R11_Current_SourceCorridorCrossSectionDot"
    corridor_dot.operation = "DOT_PRODUCT"
    corridor_absolute = nodes.new("ShaderNodeMath")
    corridor_absolute.name = "Phase4R11_Current_SourceCorridorCrossSectionAbsolute"
    corridor_absolute.operation = "ABSOLUTE"
    corridor_divide = nodes.new("ShaderNodeMath")
    corridor_divide.name = "Phase4R11_Current_SourceCorridorNormalizedCosine"
    corridor_divide.operation = "DIVIDE"
    corridor_clamp = nodes.new("ShaderNodeClamp")
    corridor_clamp.name = "Phase4R11_Current_SourceCorridorCosineClamp"
    corridor_clamp.clamp_type = "MINMAX"
    corridor_clamp.inputs["Min"].default_value = 0.0
    corridor_clamp.inputs["Max"].default_value = 1.0

    one_minus_corridor = nodes.new("ShaderNodeMath")
    one_minus_corridor.name = "Phase4R11_Current_OutsideSourceCorridor"
    one_minus_corridor.operation = "SUBTRACT"
    one_minus_corridor.inputs[0].default_value = 1.0
    raw_weighted = nodes.new("ShaderNodeMath")
    raw_weighted.name = "Phase4R11_Current_RawViewFacingWeighted"
    raw_weighted.operation = "MULTIPLY"
    corridor_weighted = nodes.new("ShaderNodeMath")
    corridor_weighted.name = "Phase4R11_Current_SourceCorridorWeighted"
    corridor_weighted.operation = "MULTIPLY"
    corrected_add = nodes.new("ShaderNodeMath")
    corrected_add.name = "Phase4R11_Current_CorrectedViewFacingAdd"
    corrected_add.operation = "ADD"
    corrected_clamp = nodes.new("ShaderNodeClamp")
    corrected_clamp.name = "Phase4R11_Current_CorrectedViewFacingClamp"
    corrected_clamp.clamp_type = "MINMAX"
    corrected_clamp.inputs["Min"].default_value = 0.0
    corrected_clamp.inputs["Max"].default_value = 1.0

    outer = nodes.new("ShaderNodeMapRange")
    outer.name = "Phase4R11_Current_OuterViewFacingWindow"
    configure_float_map_range(outer, spec["outerViewFacingMinimum"], spec["outerViewFacingMaximum"])
    outer_visibility = nodes.new("ShaderNodeMath")
    outer_visibility.name = "Phase4R11_Current_OuterAlphaVisibility"
    outer_visibility.operation = "MULTIPLY"
    front_facing = nodes.new("ShaderNodeMath")
    front_facing.name = "Phase4R11_Current_FrontFacing"
    front_facing.operation = "SUBTRACT"
    front_facing.inputs[0].default_value = 1.0
    front_visibility = nodes.new("ShaderNodeMath")
    front_visibility.name = "Phase4R11_Current_FrontFacingVisibility"
    front_visibility.operation = "MULTIPLY"

    core = nodes.new("ShaderNodeMapRange")
    core.name = "Phase4R11_Current_InternalCoreViewFacingWindow"
    configure_float_map_range(core, spec["coreViewFacingMinimum"], spec["coreViewFacingMaximum"])
    emission_strength = nodes.new("ShaderNodeMath")
    emission_strength.name = "Phase4R11_Current_RestrainedEmissionStrength"
    emission_strength.operation = "MULTIPLY"
    emission_strength.inputs[1].default_value = spec["emissionStrength"]

    links.new(info.outputs["Color"], tint.inputs[1])
    links.new(tint.outputs["Color"], emission.inputs["Color"])
    links.new(geometry.outputs["Normal"], facing_dot.inputs[0])
    links.new(geometry.outputs["Incoming"], facing_dot.inputs[1])
    links.new(facing_dot.outputs["Value"], facing_absolute.inputs[0])
    links.new(geometry.outputs["Position"], position_components.inputs["Vector"])
    links.new(position_components.outputs["Y"], enabled_input(corridor_gate, "Value"))
    links.new(geometry.outputs["Incoming"], incoming_normalized.inputs[0])
    links.new(incoming_normalized.outputs["Vector"], incoming_components.inputs["Vector"])
    links.new(incoming_components.outputs["Y"], incoming_perpendicular.inputs["Y"])
    links.new(incoming_components.outputs["Z"], incoming_perpendicular.inputs["Z"])
    links.new(incoming_perpendicular.outputs["Vector"], incoming_perpendicular_length.inputs[0])
    links.new(incoming_perpendicular_length.outputs["Value"], corridor_denominator.inputs[0])
    links.new(geometry.outputs["Normal"], normal_normalized.inputs[0])
    links.new(normal_normalized.outputs["Vector"], corridor_dot.inputs[0])
    links.new(incoming_perpendicular.outputs["Vector"], corridor_dot.inputs[1])
    links.new(corridor_dot.outputs["Value"], corridor_absolute.inputs[0])
    links.new(corridor_absolute.outputs[0], corridor_divide.inputs[0])
    links.new(corridor_denominator.outputs[0], corridor_divide.inputs[1])
    links.new(corridor_divide.outputs[0], corridor_clamp.inputs["Value"])
    links.new(corridor_gate.outputs["Result"], one_minus_corridor.inputs[1])
    links.new(facing_absolute.outputs[0], raw_weighted.inputs[0])
    links.new(one_minus_corridor.outputs[0], raw_weighted.inputs[1])
    links.new(corridor_clamp.outputs["Result"], corridor_weighted.inputs[0])
    links.new(corridor_gate.outputs["Result"], corridor_weighted.inputs[1])
    links.new(raw_weighted.outputs[0], corrected_add.inputs[0])
    links.new(corridor_weighted.outputs[0], corrected_add.inputs[1])
    links.new(corrected_add.outputs[0], corrected_clamp.inputs["Value"])
    links.new(corrected_clamp.outputs["Result"], enabled_input(outer, "Value"))
    links.new(corrected_clamp.outputs["Result"], enabled_input(core, "Value"))
    links.new(outer.outputs["Result"], outer_visibility.inputs[0])
    links.new(info.outputs["Alpha"], outer_visibility.inputs[1])
    links.new(geometry.outputs["Backfacing"], front_facing.inputs[1])
    links.new(outer_visibility.outputs[0], front_visibility.inputs[0])
    links.new(front_facing.outputs[0], front_visibility.inputs[1])
    links.new(core.outputs["Result"], emission_strength.inputs[0])
    links.new(emission_strength.outputs[0], emission.inputs["Strength"])
    links.new(housing.outputs["BSDF"], add.inputs[0])
    links.new(emission.outputs["Emission"], add.inputs[1])
    links.new(front_visibility.outputs[0], final_mix.inputs[0])
    links.new(transparent.outputs["BSDF"], final_mix.inputs[1])
    links.new(add.outputs[0], final_mix.inputs[2])
    links.new(final_mix.outputs[0], output.inputs["Surface"])

    if not hasattr(material, "surface_render_method"):
        raise RuntimeError("Blender 5.2 current material lacks surface_render_method")
    material.surface_render_method = spec["surfaceRenderMethod"]
    material.use_backface_culling = spec["useBackfaceCulling"]
    material.diffuse_color = (*srgb(spec["channelHousingColor"])[0:3], 0.0)
    material["phase4r1v2_emission_multiplier"] = spec["emissionStrength"]
    material["phase4r1v2_broad_upper_sheath_cap"] = False
    material["phase4r1_1_material_role"] = "black channel housing with contained internal current"
    material["phase4r1_1_object_color_tint"] = list(spec["objectColorTint"])
    material["phase4r1_1_transmission_basis"] = spec["transmissionBasis"]
    material["phase4r1_1_source_corridor_axis_world"] = list(spec["sourceCorridorAxisWorld"])
    material["phase4r1_1_source_corridor_gate_y"] = [spec["sourceCorridorGateFullY"], spec["sourceCorridorGateZeroY"]]
    material["phase4r1_1_source_corridor_denominator_minimum"] = spec["sourceCorridorCrossSectionDenominatorMinimum"]
    material["phase4r1_1_source_corridor_overlay_radius_m"] = spec["sourceCorridorOverlayRadiusMeters"]
    material["phase4r1_1_source_corridor_minimum_absolute_tangent_x"] = spec["sourceCorridorMinimumAbsoluteTangentX"]
    material["phase4r1_1_outer_view_facing_window"] = [spec["outerViewFacingMinimum"], spec["outerViewFacingMaximum"]]
    material["phase4r1_1_core_view_facing_window"] = [spec["coreViewFacingMinimum"], spec["coreViewFacingMaximum"]]
    material["phase4r1_1_front_facing_only"] = spec["frontFacingOnly"]
    material["phase4r1_1_use_backface_culling"] = spec["useBackfaceCulling"]
    material["phase4r1_1_exact_object_alpha_progression"] = True
    return material


def validate_cable_material_users() -> dict[str, list[dict[str, Any]]]:
    inventory = configured_cable_inventory()
    expected_sheaths = sorted(obj.name for obj in inventory["sheaths"])
    expected_currents = sorted(obj.name for obj in inventory["currents"])
    sheath_users = material_user_inventory(cfg.CABLE_SHEATH_MATERIAL)
    current_users = material_user_inventory(cfg.CABLE_CURRENT_MATERIAL)
    if [row["object"] for row in sheath_users] != expected_sheaths or any(row["slot"] != 0 for row in sheath_users):
        raise RuntimeError("graphite sheath material user inventory is not the exact three accepted sheath objects")
    if [row["object"] for row in current_users] != expected_currents or any(row["slot"] != 0 for row in current_users):
        raise RuntimeError("current material user inventory is not the exact 456 accepted current segments")
    if len(sheath_users) != cfg.CABLE_EXPECTED_SHEATH_USERS or len(current_users) != cfg.CABLE_EXPECTED_CURRENT_USERS:
        raise RuntimeError("accepted cable material user counts do not match config authority")
    if int(bpy.data.materials[cfg.CABLE_SHEATH_MATERIAL].users) != cfg.CABLE_EXPECTED_SHEATH_USERS:
        raise RuntimeError("graphite sheath material datablock user count is not exactly three")
    if int(bpy.data.materials[cfg.CABLE_CURRENT_MATERIAL].users) != cfg.CABLE_EXPECTED_CURRENT_USERS:
        raise RuntimeError("current material datablock user count is not exactly 456")
    return {"sheath": sheath_users, "current": current_users}


def build_cable_material() -> dict[str, Any]:
    users_before = validate_cable_material_users()
    source_corridor_before = source_corridor_axis_audit()
    rebuild_graphite_sheath_material()
    rebuild_internal_current_material()
    users_after = validate_cable_material_users()
    source_corridor_after = source_corridor_axis_audit()
    if users_after != users_before:
        raise RuntimeError("cable material repair changed an accepted material binding or user")
    if source_corridor_after != source_corridor_before:
        raise RuntimeError("cable material repair changed the source-corridor route-axis authority")
    return {
        "materialNames": [cfg.CABLE_SHEATH_MATERIAL, cfg.CABLE_CURRENT_MATERIAL],
        "materialAuthority": cfg.CABLE_MATERIAL_AUTHORITY,
        "materialUsersBefore": users_before,
        "materialUsersAfter": users_after,
        "materialUsersUnchanged": users_before == users_after,
        "sourceCorridorAxisAuditBefore": source_corridor_before,
        "sourceCorridorAxisAuditAfter": source_corridor_after,
        "sourceCorridorAxisAuditUnchanged": source_corridor_before == source_corridor_after,
        "responseLightsChanged": False,
        "currentOrLightActionsChanged": False,
    }


def make_material(key: str, spec: dict[str, Any]) -> bpy.types.Material:
    if bpy.data.materials.get(spec["name"]) is not None:
        raise RuntimeError(f"R1.1 material already exists: {spec['name']}")
    material = bpy.data.materials.new(spec["name"])
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    output.name = "Phase4R11_MaterialOutput"
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.name = "Phase4R11_PhysicalSurface"
    shader.inputs["Base Color"].default_value = srgb(spec["color"])
    shader.inputs["Roughness"].default_value = float(spec["roughness"])
    shader.inputs["Metallic"].default_value = float(spec["metallic"])
    noise = nodes.new("ShaderNodeTexNoise")
    noise.name = "Phase4R11_Microvariation"
    noise.noise_dimensions = "3D"
    noise.inputs["Scale"].default_value = float(spec["noiseScale"])
    noise.inputs["Detail"].default_value = 3.0
    noise.inputs["Roughness"].default_value = 0.62
    bump = nodes.new("ShaderNodeBump")
    bump.name = "Phase4R11_MicroBump"
    bump.inputs["Strength"].default_value = float(spec["bumpStrength"])
    bump.inputs["Distance"].default_value = 0.001
    coordinates = nodes.new("ShaderNodeTexCoord")
    coordinates.name = "Phase4R11_ObjectCoordinates"
    links.new(coordinates.outputs["Generated"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    material.diffuse_color = srgb(spec["color"])
    material["phase4r1_1_material_role"] = key
    material["phase4r1_1_palette_hex"] = spec["color"]
    material["phase4r1_1_no_emission"] = True
    return material


def create_collection() -> bpy.types.Collection:
    if bpy.data.collections.get(cfg.COLLECTION) is not None:
        raise RuntimeError(f"R1.1 collection already exists: {cfg.COLLECTION}")
    collection = bpy.data.collections.new(cfg.COLLECTION)
    bpy.context.scene.collection.children.link(collection)
    collection["phase4r1_1_role"] = "two composed perimeter anchors plus restrained split opening header"
    collection["phase4r1_1_central_floor_objects"] = 0
    return collection


def cube_geometry(dimensions: tuple[float, float, float]) -> tuple[list[tuple[float, float, float]], list[tuple[int, ...]]]:
    x, y, z = (value * 0.5 for value in dimensions)
    vertices = [
        (-x, -y, -z), (x, -y, -z), (x, y, -z), (-x, y, -z),
        (-x, -y, z), (x, -y, z), (x, y, z), (-x, y, z),
    ]
    faces = [
        (0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1),
        (1, 5, 6, 2), (2, 6, 7, 3), (4, 0, 3, 7),
    ]
    return vertices, faces


def add_box(
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
    *,
    name: str,
    location: tuple[float, float, float],
    dimensions: tuple[float, float, float],
    material: str,
    zone: str,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel: float = 0.022,
) -> bpy.types.Object:
    data_name = f"{name}_Data"
    if bpy.data.objects.get(name) is not None or bpy.data.meshes.get(data_name) is not None:
        raise RuntimeError(f"R1.1 object or mesh data already exists: {name}")
    mesh = bpy.data.meshes.new(data_name)
    vertices, faces = cube_geometry(dimensions)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    obj.rotation_euler = rotation
    mesh.materials.append(materials[material])
    collection.objects.link(obj)
    if bevel > 0.0:
        modifier = obj.modifiers.new("Phase4R11_RestrainedEdgeBevel", "BEVEL")
        modifier.width = min(bevel, min(dimensions) * 0.22)
        modifier.segments = 3
        modifier.limit_method = "ANGLE"
    obj["phase4r1_1_role"] = "peripheral industrial authority"
    obj["phase4r1_1_zone"] = zone
    obj["phase4r1_1_non_hero"] = True
    return obj


def add_curve(
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
    *,
    name: str,
    points: Iterable[tuple[float, float, float]],
    radius: float,
    material: str,
    zone: str,
) -> bpy.types.Object:
    data_name = f"{name}_Data"
    if bpy.data.objects.get(name) is not None or bpy.data.curves.get(data_name) is not None:
        raise RuntimeError(f"R1.1 object or curve data already exists: {name}")
    values = list(points)
    curve = bpy.data.curves.new(data_name, type="CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = radius
    curve.bevel_resolution = 4
    curve.resolution_u = 2
    curve.use_fill_caps = True
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(values) - 1)
    for point, value in zip(spline.bezier_points, values):
        point.co = value
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    curve.materials.append(materials[material])
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    obj["phase4r1_1_role"] = "controlled perimeter conduit"
    obj["phase4r1_1_zone"] = zone
    obj["phase4r1_1_non_hero"] = True
    return obj


def add_spot(collection: bpy.types.Collection, spec: dict[str, Any]) -> bpy.types.Object:
    if bpy.data.objects.get(spec["name"]) is not None or bpy.data.lights.get(spec["data"]) is not None:
        raise RuntimeError(f"R1.1 light already exists: {spec['name']}")
    data = bpy.data.lights.new(spec["data"], type="SPOT")
    data.energy = float(spec["energyWatts"])
    data.color = tuple(spec["color"])
    data.spot_size = math.radians(float(spec["coneDegrees"]))
    data.spot_blend = float(spec["blend"])
    data.shadow_soft_size = float(spec["softRadiusMeters"])
    obj = bpy.data.objects.new(spec["name"], data)
    obj.location = tuple(spec["location"])
    direction = Vector(spec["target"]) - Vector(spec["location"])
    if direction.length <= 1e-9:
        raise RuntimeError(f"zero-length R1.1 SPOT direction: {spec['name']}")
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    collection.objects.link(obj)
    obj["phase4r1_1_role"] = "low-level shaped perimeter articulation; no luminous source mesh"
    obj["phase4r1_1_zone"] = spec["zone"]
    obj["phase4r1_1_non_hero"] = True
    return obj


def add_frame(
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
    prefix: str,
    centre: tuple[float, float, float],
    width: float,
    height: float,
    depth: float,
    member: float,
    zone: str,
) -> list[bpy.types.Object]:
    x, y, z = centre
    return [
        add_box(collection, materials, name=f"{prefix}_Left", location=(x - width * 0.5, y, z), dimensions=(member, depth, height), material="paintedSteel", zone=zone),
        add_box(collection, materials, name=f"{prefix}_Right", location=(x + width * 0.5, y, z), dimensions=(member, depth, height), material="paintedSteel", zone=zone),
        add_box(collection, materials, name=f"{prefix}_Top", location=(x, y, z + height * 0.5), dimensions=(width + member, depth, member), material="paintedSteel", zone=zone),
        add_box(collection, materials, name=f"{prefix}_Bottom", location=(x, y, z - height * 0.5), dimensions=(width + member, depth, member), material="paintedSteel", zone=zone),
    ]


def world_aabb(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return (
        Vector((min(point.x for point in corners), min(point.y for point in corners), min(point.z for point in corners))),
        Vector((max(point.x for point in corners), max(point.y for point in corners), max(point.z for point in corners))),
    )


def aabb_overlaps(first: tuple[Vector, Vector], second: tuple[Vector, Vector], tolerance: float = 1e-4) -> bool:
    return all(
        first[0][axis] < second[1][axis] - tolerance
        and first[1][axis] > second[0][axis] + tolerance
        for axis in range(3)
    )


def build_periphery() -> dict[str, Any]:
    collection = create_collection()
    materials = {key: make_material(key, spec) for key, spec in cfg.MATERIALS.items()}
    hidden_headers = []
    for name in cfg.SUPPRESSED_OPENING_HEADER_OBJECTS:
        obj = bpy.data.objects.get(name)
        if obj is None or obj.hide_render:
            raise RuntimeError(f"accepted opening header authority is missing or already hidden: {name}")
        obj.hide_render = True
        hidden_headers.append(name)

    objects: list[bpy.types.Object] = []
    for spec in cfg.OPENING_HEADER_REPLACEMENTS:
        objects.append(add_box(collection, materials, **spec, bevel=0.018))

    # Zone A: an asymmetric three-cabinet service wall with a real recessed
    # backdrop, controlled conduit bends, a tray and restrained blank plates.
    objects.append(add_box(collection, materials, name="Phase4R11_ServiceWall_RecessBack", location=(-10.15, 11.43, 2.80), dimensions=(2.65, 0.12, 4.80), material="recess", zone="service-wall", bevel=0.01))
    objects.extend(add_frame(collection, materials, "Phase4R11_ServiceWall_Frame", (-10.15, 11.22, 2.80), 2.65, 4.80, 0.18, 0.15, "service-wall"))
    for spec in cfg.ZONE_A_CABINETS:
        body = add_box(collection, materials, **spec, material="cabinet", zone="service-wall", bevel=0.045)
        objects.append(body)
        width, depth, height = spec["dimensions"]
        x, y, z = spec["location"]
        objects.append(add_box(collection, materials, name=f"{spec['name']}_Door", location=(x, y - depth * 0.5 - 0.035, z), dimensions=(width * 0.88, 0.060, height * 0.88), material="paintedSteel", zone="service-wall", bevel=0.025))
        objects.append(add_box(collection, materials, name=f"{spec['name']}_Handle", location=(x + width * 0.34, y - depth * 0.5 - 0.078, z + height * 0.02), dimensions=(0.045, 0.040, min(0.42, height * 0.22)), material="conduit", zone="service-wall", bevel=0.008))
        objects.append(add_box(collection, materials, name=f"{spec['name']}_BlankPlate", location=(x - width * 0.21, y - depth * 0.5 - 0.078, z + height * 0.29), dimensions=(width * 0.28, 0.028, 0.13), material="plate", zone="service-wall", bevel=0.006))
        for index, sign in enumerate((-1.0, 1.0)):
            objects.append(add_box(collection, materials, name=f"{spec['name']}_Hinge_{index}", location=(x - width * 0.42, y - depth * 0.5 - 0.071, z + sign * height * 0.29), dimensions=(0.045, 0.035, 0.16), material="conduit", zone="service-wall", bevel=0.006))

    objects.append(add_box(collection, materials, name="Phase4R11_ServiceWall_CableTray_Lower", location=(-10.00, 10.81, 5.17), dimensions=(8.30, 0.16, 0.11), material="conduit", zone="service-wall", bevel=0.012))
    objects.append(add_box(collection, materials, name="Phase4R11_ServiceWall_CableTray_Upper", location=(-10.00, 10.81, 5.42), dimensions=(8.30, 0.16, 0.11), material="conduit", zone="service-wall", bevel=0.012))
    for index in range(12):
        x = -13.75 + index * 0.68
        objects.append(add_box(collection, materials, name=f"Phase4R11_ServiceWall_CableTray_Rung_{index:02d}", location=(x, 10.81, 5.295), dimensions=(0.055, 0.16, 0.31), material="conduit", zone="service-wall", bevel=0.006))
    for spec in cfg.ZONE_A_CONDUIT_PATHS:
        objects.append(add_curve(collection, materials, **spec, material="conduit", zone="service-wall"))

    # Zone B: a single deep ventilation/utility anchor with physical louvers,
    # plenum and return duct. The open band behind the CRT remains untouched.
    objects.append(add_box(collection, materials, name="Phase4R11_VentRecess_Back", location=(6.80, 11.43, 2.80), dimensions=(2.70, 0.12, 4.80), material="recess", zone="vent-recess", bevel=0.01))
    objects.extend(add_frame(collection, materials, "Phase4R11_VentRecess_Frame", (6.80, 11.22, 2.80), 2.70, 4.80, 0.18, 0.16, "vent-recess"))
    objects.append(add_box(collection, materials, name="Phase4R11_VentRecess_Plenum", location=(6.80, 11.20, 5.70), dimensions=(2.35, 0.24, 0.42), material="paintedSteel", zone="vent-recess", bevel=0.035))
    for index in range(8):
        z = 1.28 + index * 0.42
        objects.append(add_box(collection, materials, name=f"Phase4R11_VentRecess_Louver_{index:02d}", location=(6.20, 11.08, z), dimensions=(1.65, 0.18, 0.105), material="vent", zone="vent-recess", rotation=(math.radians(-12.0), 0.0, 0.0), bevel=0.008))
    objects.append(add_box(collection, materials, name="Phase4R11_VentRecess_ReturnDuct", location=(7.65, 11.08, 3.55), dimensions=(0.62, 0.25, 2.35), material="paintedSteel", zone="vent-recess", bevel=0.035))
    objects.append(add_box(collection, materials, name="Phase4R11_VentRecess_ReturnCollar", location=(7.65, 10.94, 2.55), dimensions=(0.76, 0.10, 0.24), material="conduit", zone="vent-recess", bevel=0.015))
    objects.append(add_box(collection, materials, name="Phase4R11_VentRecess_BlankPlate", location=(7.64, 10.91, 4.55), dimensions=(0.38, 0.030, 0.16), material="plate", zone="vent-recess", bevel=0.006))

    lights = [add_spot(collection, spec) for spec in cfg.PERIMETER_LIGHTS]
    bpy.context.view_layer.update()

    central_violations = []
    object_records = []
    centre = Vector((*cfg.CENTRAL_ZONE_CENTRE_XY, 0.0))
    for obj in sorted(objects + lights, key=lambda item: item.name):
        if obj.type in {"MESH", "CURVE"}:
            corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
            minimum_z = min(corner.z for corner in corners)
            minimum_radius = min(math.hypot(corner.x - centre.x, corner.y - centre.y) for corner in corners)
            if minimum_z < 6.1 and minimum_radius <= cfg.CENTRAL_ZONE_RADIUS_METERS:
                central_violations.append({"object": obj.name, "minimumRadiusMeters": minimum_radius, "minimumZMeters": minimum_z})
        object_records.append({
            "name": obj.name,
            "type": obj.type,
            "zone": obj.get("phase4r1_1_zone"),
            "materials": [] if obj.data is None or not hasattr(obj.data, "materials") else [material.name for material in obj.data.materials if material is not None],
        })
    if central_violations:
        raise RuntimeError(f"R1.1 periphery intrudes into the accepted central zone: {central_violations}")
    structural_blockers = [
        *(f"P4R1_BackWall_Rib_{index:02d}" for index in range(9)),
        "P4R1_Catwalk_Deck",
    ]
    blocker_bounds = {}
    for name in structural_blockers:
        blocker = bpy.data.objects.get(name)
        if blocker is None:
            raise RuntimeError(f"missing accepted structural obstruction authority: {name}")
        blocker_bounds[name] = world_aabb(blocker)
    obstruction_overlaps = []
    for obj in objects:
        bounds = world_aabb(obj)
        for name, accepted_bounds in blocker_bounds.items():
            if aabb_overlaps(bounds, accepted_bounds):
                obstruction_overlaps.append({"newObject": obj.name, "acceptedObject": name})
    if obstruction_overlaps:
        raise RuntimeError(f"R1.1 periphery intersects retained ribs or catwalk: {obstruction_overlaps}")
    if len(objects) < 40:
        raise RuntimeError("R1.1 periphery did not create the intended composed object authority")
    return {
        "collection": collection.name,
        "hiddenOpeningHeaders": hidden_headers,
        "objectCount": len(objects),
        "lightCount": len(lights),
        "materialCount": len(materials),
        "centralZoneViolations": central_violations,
        "acceptedStructuralObstructionOverlaps": obstruction_overlaps,
        "zones": {
            "serviceWall": sorted(obj.name for obj in objects if obj.get("phase4r1_1_zone") == "service-wall"),
            "ventRecess": sorted(obj.name for obj in objects if obj.get("phase4r1_1_zone") == "vent-recess"),
            "openingOverhead": sorted(obj.name for obj in objects if obj.get("phase4r1_1_zone") == "opening-overhead"),
        },
        "lights": [
            {
                "object": light.name,
                "data": light.data.name,
                "type": light.data.type,
                "energyWatts": rounded(light.data.energy),
                "color": vector(light.data.color),
                "coneDegrees": rounded(math.degrees(light.data.spot_size)),
                "softRadiusMeters": rounded(light.data.shadow_soft_size),
            }
            for light in lights
        ],
        "materialAuthority": cfg.MATERIALS,
        "objectInventory": object_records,
    }


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--through", choices=cfg.STAGE_ORDER, required=True)
    parser.add_argument("--output", default=str(cfg.DERIVATIVE))
    return parser.parse_args(argv)


def main() -> None:
    args = parse_args()
    source = Path(bpy.data.filepath).resolve()
    output = Path(args.output).resolve()
    if source != cfg.ACCEPTED_R1_SOURCE.resolve():
        raise RuntimeError("R1.1 builder must open the exact tracked accepted R1 source path")
    source_record = file_record(source)
    if source_record != {"bytes": cfg.ACCEPTED_R1_BYTES, "sha256": cfg.ACCEPTED_R1_SHA256}:
        raise RuntimeError("accepted R1 source byte authority mismatch")
    if output != cfg.DERIVATIVE.resolve() or output == source or output.parent != cfg.SOURCE_DIR:
        raise RuntimeError("R1.1 output must be the exact isolated derivative path")
    pending = output.with_name(output.stem + ".pending.blend")
    report_pending = cfg.BUILD_REPORT.with_name(cfg.BUILD_REPORT.stem + ".pending.json")
    restore_output = output.with_name(output.stem + ".restore.pending.blend")
    restore_report = cfg.BUILD_REPORT.with_name(cfg.BUILD_REPORT.stem + ".restore.pending.json")
    residue = [path for path in (pending, report_pending, restore_output, restore_report) if path.exists()]
    if residue:
        raise RuntimeError(f"R1.1 staged/restore residue exists: {[path.name for path in residue]}")
    if tuple(bpy.app.version) != (5, 2, 0):
        raise RuntimeError(f"R1.1 builder requires Blender 5.2.0, got {bpy.app.version_string}")
    if bpy.data.collections.get(cfg.COLLECTION) is not None:
        raise RuntimeError("accepted R1 source unexpectedly contains the R1.1 repair collection")

    producer_records = {
        "builder": {"path": str(Path(__file__).resolve().relative_to(cfg.REPO_ROOT)).replace("\\", "/"), **file_record(Path(__file__).resolve())},
        "config": {"path": str(Path(cfg.__file__).resolve().relative_to(cfg.REPO_ROOT)).replace("\\", "/"), **file_record(Path(cfg.__file__).resolve())},
    }
    scene = bpy.context.scene
    timeline_before = timeline_record(scene)
    if timeline_before != {"frameStart": 1, "frameEnd": 540, "fps": 30, "fpsBase": 1.0}:
        raise RuntimeError(f"accepted R1 timeline authority mismatch: {timeline_before}")
    frame_before = scene_frame_record(scene)
    accepted_material_names = sorted(material.name for material in bpy.data.materials)
    allowed_cable_material_names = {cfg.CABLE_SHEATH_MATERIAL, cfg.CABLE_CURRENT_MATERIAL}
    allowed_crt_material_names = {cfg.CRT_Q_PHOSPHOR_MATERIAL, cfg.CRT_GLASS_MATERIAL}
    target_material_names = allowed_cable_material_names | allowed_crt_material_names
    if not target_material_names.issubset(accepted_material_names):
        raise RuntimeError("accepted R1 source is missing one or more exact cable/CRT target materials")
    accepted_material_records_before = material_records(accepted_material_names)
    accepted_material_hashes_before = {
        name: record["sha256"] for name, record in accepted_material_records_before.items()
    }
    target_material_records_before = {
        name: accepted_material_records_before[name] for name in sorted(target_material_names)
    }
    cable_material_users_before = validate_cable_material_users()
    crt_material_users_before = validate_crt_material_users()
    before = preservation_snapshot()
    expected_q = packed_q_record()
    if expected_q != {
        "name": cfg.EXACT_Q_IMAGE_NAME,
        "filepath": cfg.EXACT_Q_CANONICAL_PATH,
        "packedFilepath": cfg.EXACT_Q_CANONICAL_PATH,
        "bytes": cfg.EXACT_Q_BYTES,
        "sha256": cfg.EXACT_Q_SHA256,
    }:
        raise RuntimeError("accepted exact-Q authority is not canonical before the R1.1 build")
    header_before = {
        name: canonical_hash(object_signature(bpy.data.objects[name], include_hide_render=False))
        for name in cfg.SUPPRESSED_OPENING_HEADER_OBJECTS
    }
    periphery = build_periphery()
    after_periphery = preservation_snapshot()
    timeline_after_periphery = timeline_record(scene)
    if timeline_after_periphery != timeline_before:
        raise RuntimeError(f"periphery stage changed the accepted timeline authority: {timeline_after_periphery}")
    periphery_unchanged = {key: before[key] == after_periphery[key] for key in before}
    if not all(periphery_unchanged.values()):
        raise RuntimeError(f"periphery stage changed an accepted non-periphery authority: {[key for key, passed in periphery_unchanged.items() if not passed]}")
    header_after = {
        name: canonical_hash(object_signature(bpy.data.objects[name], include_hide_render=False))
        for name in cfg.SUPPRESSED_OPENING_HEADER_OBJECTS
    }
    if header_before != header_after or not all(bpy.data.objects[name].hide_render for name in cfg.SUPPRESSED_OPENING_HEADER_OBJECTS):
        raise RuntimeError("opening header repair changed more than the two exact render-visibility flags")
    periphery_authority_after_periphery = periphery_authority_snapshot()
    periphery["authorityAfterPeriphery"] = periphery_authority_after_periphery

    stages: dict[str, Any] = {"periphery": periphery}
    completed_stages = ["periphery"]
    cable_authority_before = cable_authority_snapshot()
    current_states_before = current_state_hashes(scene)
    after_cable_preservation = after_periphery
    if includes_stage(args.through, "cable"):
        cable_stage = build_cable_material()
        completed_stages.append("cable")
        stages["cable"] = cable_stage
        after_cable_preservation = preservation_snapshot()
        changed_after_cable = sorted(
            key for key in before if before[key] != after_cable_preservation[key]
        )
        if changed_after_cable:
            raise RuntimeError(f"cumulative cable stage changed a fixed authority: {changed_after_cable}")
        periphery_authority_after_cable = periphery_authority_snapshot()
        if periphery_authority_after_cable != periphery_authority_after_periphery:
            raise RuntimeError("cumulative cable stage changed the R1.1 periphery authority")
        stages["cable"].update({
            "preservationAfterCable": after_cable_preservation,
            "changedPreservationAuthoritiesAfterCable": changed_after_cable,
            "peripheryAuthorityAfterCable": periphery_authority_after_cable,
            "peripheryAuthorityUnchanged": True,
        })
    if includes_stage(args.through, "mobile"):
        mobile_stage = build_mobile_optics(scene)
        completed_stages.append("mobile")
        stages["mobile"] = mobile_stage
    after_mobile_preservation = preservation_snapshot()
    if includes_stage(args.through, "crt"):
        crt_stage = build_crt_material()
        completed_stages.append("crt")
        stages["crt"] = crt_stage
        after_crt_preservation = preservation_snapshot()
        expected_after_crt = ["mobileCameraFull"]
        changed_after_crt = sorted(
            key for key in before if before[key] != after_crt_preservation[key]
        )
        if changed_after_crt != expected_after_crt:
            raise RuntimeError(
                "cumulative CRT stage changed an authority outside its two material graphs: "
                f"observed={changed_after_crt}, expected={expected_after_crt}"
            )
        if periphery_authority_snapshot() != periphery_authority_after_periphery:
            raise RuntimeError("cumulative CRT stage changed the R1.1 periphery authority")
        stages["crt"].update({
            "preservationAfterCrt": after_crt_preservation,
            "changedPreservationAuthoritiesAfterCrt": changed_after_crt,
            "expectedChangedPreservationAuthoritiesAfterCrt": expected_after_crt,
            "peripheryAuthorityUnchanged": True,
        })
    else:
        after_crt_preservation = after_mobile_preservation
    after = preservation_snapshot()
    cable_authority_after = cable_authority_snapshot()
    current_states_after = current_state_hashes(scene)
    timeline_after = timeline_record(scene)
    frame_after = scene_frame_record(scene)
    periphery_authority_after = periphery_authority_snapshot()
    if periphery_authority_after != periphery_authority_after_periphery:
        raise RuntimeError("targeted repair changed the cumulative R1.1 periphery authority")
    if timeline_after != timeline_before:
        raise RuntimeError(f"targeted repair changed the accepted timeline authority: {timeline_after}")
    if frame_after != frame_before:
        raise RuntimeError(f"targeted repair changed the accepted scene frame/subframe: {frame_after}")
    unchanged = {key: before[key] == after[key] for key in before}
    changed_preservation_authorities = sorted(key for key, passed in unchanged.items() if not passed)
    expected_changed_preservation_authorities = (
        ["mobileCameraFull"] if includes_stage(args.through, "mobile") else []
    )
    if changed_preservation_authorities != expected_changed_preservation_authorities:
        raise RuntimeError(
            "targeted repair changed an authority outside the exact stage allowlist: "
            f"observed={changed_preservation_authorities}, "
            f"expected={expected_changed_preservation_authorities}"
        )
    cable_stage_unchanged = {
        key: cable_authority_before[key] == cable_authority_after[key]
        for key in cable_authority_before
    }
    if not all(cable_stage_unchanged.values()):
        raise RuntimeError(f"cable material stage changed cable geometry, progression, bindings, contact profile, collection state, or local response: {[key for key, passed in cable_stage_unchanged.items() if not passed]}")
    if current_states_before != current_states_after:
        raise RuntimeError("cable material stage changed accepted current state at a diagnostic frame")

    accepted_material_records_after = material_records(accepted_material_names)
    accepted_material_hashes_after = {
        name: record["sha256"] for name, record in accepted_material_records_after.items()
    }
    target_material_records_after = {
        name: accepted_material_records_after[name] for name in sorted(target_material_names)
    }
    changed_accepted_materials = sorted(
        name
        for name in accepted_material_names
        if accepted_material_hashes_before[name] != accepted_material_hashes_after[name]
    )
    authorized_material_names: set[str] = set()
    if includes_stage(args.through, "cable"):
        authorized_material_names.update(allowed_cable_material_names)
    if includes_stage(args.through, "crt"):
        authorized_material_names.update(allowed_crt_material_names)
    expected_material_changes = sorted(authorized_material_names)
    if changed_accepted_materials != expected_material_changes:
        raise RuntimeError(
            f"accepted material graph delta is not the exact stage allowlist: {changed_accepted_materials}"
        )
    accepted_except_authorized_before = {
        name: value for name, value in accepted_material_hashes_before.items() if name not in authorized_material_names
    }
    accepted_except_authorized_after = {
        name: value for name, value in accepted_material_hashes_after.items() if name not in authorized_material_names
    }
    if accepted_except_authorized_before != accepted_except_authorized_after:
        raise RuntimeError("a global accepted material outside the cumulative stage allowlist changed")
    new_material_names = sorted(set(material.name for material in bpy.data.materials) - set(accepted_material_names))
    expected_new_material_names = sorted(spec["name"] for spec in cfg.MATERIALS.values())
    if new_material_names != expected_new_material_names:
        raise RuntimeError(f"targeted repair created an unexpected material datablock: {new_material_names}")
    cable_material_users_after = validate_cable_material_users()
    if cable_material_users_after != cable_material_users_before:
        raise RuntimeError("targeted repair changed exact cable material users")
    crt_material_users_after = validate_crt_material_users()
    if crt_material_users_after != crt_material_users_before:
        raise RuntimeError("targeted repair changed exact CRT material users")
    cable_material_records_before = {
        name: target_material_records_before[name] for name in sorted(allowed_cable_material_names)
    }
    cable_material_records_after = {
        name: target_material_records_after[name] for name in sorted(allowed_cable_material_names)
    }
    crt_material_records_before = {
        name: target_material_records_before[name] for name in sorted(allowed_crt_material_names)
    }
    crt_material_records_after = {
        name: target_material_records_after[name] for name in sorted(allowed_crt_material_names)
    }
    changed_cable_materials = sorted(
        name
        for name in allowed_cable_material_names
        if accepted_material_hashes_before[name] != accepted_material_hashes_after[name]
    )
    changed_crt_materials = sorted(
        name
        for name in allowed_crt_material_names
        if accepted_material_hashes_before[name] != accepted_material_hashes_after[name]
    )
    if includes_stage(args.through, "cable"):
        stages["cable"].update({
            "fixedAuthorityBefore": cable_authority_before,
            "fixedAuthorityAfter": cable_authority_after,
            "fixedAuthorityUnchanged": cable_stage_unchanged,
            "currentStateHashesBefore": current_states_before,
            "currentStateHashesAfter": current_states_after,
            "currentStateHashesUnchanged": current_states_before == current_states_after,
            "materialGraphsBefore": cable_material_records_before,
            "materialGraphsAfter": cable_material_records_after,
            "changedAcceptedMaterials": changed_cable_materials,
            "expectedChangedAcceptedMaterials": sorted(allowed_cable_material_names),
            "exactlyTwoAllowedMaterialGraphsChanged": changed_cable_materials == sorted(allowed_cable_material_names),
        })
    if includes_stage(args.through, "crt"):
        q_source_before = stages["crt"]["fixedAuthorityBefore"]["exactQSource"]
        q_source_after = stages["crt"]["fixedAuthorityAfter"]["exactQSource"]
        stages["crt"].update({
            "materialGraphsBefore": crt_material_records_before,
            "materialGraphsAfter": crt_material_records_after,
            "changedAcceptedMaterials": changed_crt_materials,
            "expectedChangedAcceptedMaterials": sorted(allowed_crt_material_names),
            "exactlyTwoAllowedMaterialGraphsChanged": changed_crt_materials == sorted(allowed_crt_material_names),
            "cumulativeChangedAcceptedMaterials": changed_accepted_materials,
            "preEffectsSourceDifference": {
                "packedBefore": q_source_before["packedImage"],
                "packedAfter": q_source_after["packedImage"],
                "packedByteDifferenceCount": 0 if q_source_before["packedImage"] == q_source_after["packedImage"] else None,
                "planeAuthorityBeforeSha256": q_source_before["planeAuthoritySha256"],
                "planeAuthorityAfterSha256": q_source_after["planeAuthoritySha256"],
                "planeGeometryUvOpacityActionDifference": 0 if q_source_before == q_source_after else None,
                "zeroDifference": q_source_before == q_source_after,
            },
        })
    if includes_stage(args.through, "mobile"):
        if unchanged["mobileCameraFull"] or not unchanged["mobileCameraExceptLens"]:
            raise RuntimeError("mobile optics delta is not isolated to the full mobile-camera lens authority")
        stages["mobile"].update({
            "preservationBefore": {
                "mobileCameraFull": before["mobileCameraFull"],
                "mobileCameraExceptLens": before["mobileCameraExceptLens"],
            },
            "preservationAfter": {
                "mobileCameraFull": after["mobileCameraFull"],
                "mobileCameraExceptLens": after["mobileCameraExceptLens"],
            },
            "mobileCameraFullChanged": before["mobileCameraFull"] != after["mobileCameraFull"],
            "mobileCameraExceptLensUnchanged": before["mobileCameraExceptLens"] == after["mobileCameraExceptLens"],
            "exactChangedPreservationAuthorities": changed_preservation_authorities,
            "peripheryAuthorityAfterMobile": periphery_authority_after,
            "peripheryAuthorityUnchanged": periphery_authority_after == periphery_authority_after_periphery,
        })

    scene["phase4r1_1_schema"] = cfg.SCHEMA
    scene["phase4r1_1_parent_sha256"] = cfg.ACCEPTED_R1_SHA256
    scene["phase4r1_1_completed_stages"] = json.dumps(completed_stages, separators=(",", ":"))
    scene["phase4r1_1_periphery_collection"] = cfg.COLLECTION
    scene["phase4r1_1_authorization"] = json.dumps(cfg.AUTHORIZATION, sort_keys=True, separators=(",", ":"))
    scene["phase4r1_1_builder_sha256"] = producer_records["builder"]["sha256"]
    scene["phase4r1_1_config_sha256"] = producer_records["config"]["sha256"]
    previous_output = output.read_bytes() if output.is_file() else None
    previous_report = cfg.BUILD_REPORT.read_bytes() if cfg.BUILD_REPORT.is_file() else None
    publication_started = False
    bpy.context.preferences.filepaths.save_version = 0
    try:
        save_result = bpy.ops.wm.save_as_mainfile(
            filepath=str(pending),
            check_existing=False,
            compress=True,
            relative_remap=False,
        )
        if save_result != {"FINISHED"}:
            raise RuntimeError(f"Blender staged-save operator did not finish: {save_result}")
        if not pending.is_file():
            raise RuntimeError("Blender did not emit the staged R1.1 derivative")
        if Path(bpy.data.filepath).resolve() != pending.resolve():
            raise RuntimeError("Blender staged save did not bind the exact pending derivative path")
        reopen_result = bpy.ops.wm.open_mainfile(filepath=str(pending), load_ui=False)
        if reopen_result != {"FINISHED"}:
            raise RuntimeError(f"Blender staged derivative reopen did not finish: {reopen_result}")
        if Path(bpy.data.filepath).resolve() != pending.resolve():
            raise RuntimeError("reopened Blender data is not bound to the exact pending derivative")
        scene = bpy.context.scene
        if (
            scene.get("phase4r1_1_schema") != cfg.SCHEMA
            or scene.get("phase4r1_1_parent_sha256") != cfg.ACCEPTED_R1_SHA256
            or scene.get("phase4r1_1_completed_stages") != json.dumps(completed_stages, separators=(",", ":"))
            or scene.get("phase4r1_1_periphery_collection") != cfg.COLLECTION
            or scene.get("phase4r1_1_authorization") != json.dumps(cfg.AUTHORIZATION, sort_keys=True, separators=(",", ":"))
            or scene.get("phase4r1_1_builder_sha256") != producer_records["builder"]["sha256"]
            or scene.get("phase4r1_1_config_sha256") != producer_records["config"]["sha256"]
        ):
            raise RuntimeError("reopened staged derivative lost its exact R1.1 scene authority properties")
        post_save_q = packed_q_record()
        if post_save_q != expected_q:
            raise RuntimeError("staged save changed the exact-Q logical path or packed byte authority")
        if cable_authority_snapshot() != cable_authority_after:
            raise RuntimeError("staged save changed fixed cable geometry, progression, bindings, contact profile, collection state, or local response")
        if includes_stage(args.through, "cable") and source_corridor_axis_audit() != stages["cable"]["sourceCorridorAxisAuditAfter"]:
            raise RuntimeError("staged save changed the source-corridor route-axis authority")
        if material_records(sorted(target_material_names)) != target_material_records_after:
            raise RuntimeError("staged save changed an exact target material graph")
        if validate_cable_material_users() != cable_material_users_after:
            raise RuntimeError("reopened staged derivative changed exact cable material users")
        if validate_crt_material_users() != crt_material_users_after:
            raise RuntimeError("reopened staged derivative changed exact CRT material users")
        post_save_periphery_authority = periphery_authority_snapshot()
        if post_save_periphery_authority != periphery_authority_after:
            raise RuntimeError("reopened staged derivative changed the cumulative R1.1 periphery authority")
        post_save_preservation = preservation_snapshot()
        if post_save_preservation != after:
            raise RuntimeError("staged save changed an accepted preservation authority")
        if includes_stage(args.through, "mobile"):
            post_save_action, post_save_lens_curve = mobile_camera_action_authority()
            post_save_except_lens, _ = mobile_camera_action_authority(exclude_lens_key_values=True)
            post_save_lens_keys = validate_mobile_lens_curve(
                post_save_lens_curve,
                cfg.MOBILE_R1_1_LENS_KEYS,
                "post-save R1.1 repaired",
            )
            post_save_lens_evaluations = mobile_lens_evaluation_record(
                scene,
                post_save_lens_curve,
                cfg.MOBILE_R1_1_LENS_KEYS,
            )
            post_save_global_actions = global_actions_except_target_lens_authority()
            if (
                post_save_action != stages["mobile"]["actionAuthorityAfter"]
                or post_save_except_lens != stages["mobile"]["actionExceptLensAfter"]
                or post_save_lens_keys != stages["mobile"]["lensKeysAfter"]
                or post_save_lens_evaluations != stages["mobile"]["lensEvaluationsAfter"]
                or post_save_global_actions != stages["mobile"]["globalActionsExceptTargetLensAfter"]
            ):
                raise RuntimeError("staged save changed the exact repaired mobile lens/action authority")
            stages["mobile"].update({
                "postSaveActionAuthority": post_save_action,
                "postSaveActionExceptLensAuthority": post_save_except_lens,
                "postSaveLensKeys": post_save_lens_keys,
                "postSaveLensEvaluations": post_save_lens_evaluations,
                "postSaveGlobalActionsExceptTargetLens": post_save_global_actions,
                "postSaveAuthorityExact": True,
            })
        if includes_stage(args.through, "crt"):
            post_save_crt_fixed = crt_fixed_authority_snapshot()
            post_save_q_treatment = audit_exact_q_physical_treatment()
            post_save_glass_treatment = audit_animated_glass_physical_treatment()
            post_save_image_references = exact_q_image_reference_record(
                cfg.CRT_MATERIAL_AUTHORITY["qPhosphor"]["repairedImageSamplerCount"]
            )
            if (
                post_save_crt_fixed != stages["crt"]["fixedAuthorityAfter"]
                or post_save_q_treatment != stages["crt"]["qPhosphorTreatment"]
                or post_save_glass_treatment != stages["crt"]["glassTreatment"]
                or post_save_image_references != stages["crt"]["imageReferenceAuthority"]["after"]
            ):
                raise RuntimeError("staged save changed the exact CRT material or fixed-source authority")
            stages["crt"].update({
                "postSaveFixedAuthority": post_save_crt_fixed,
                "postSaveQPhosphorTreatment": post_save_q_treatment,
                "postSaveGlassTreatment": post_save_glass_treatment,
                "postSaveImageReferences": post_save_image_references,
                "postSaveAuthorityExact": True,
            })
        if timeline_record(scene) != timeline_after:
            raise RuntimeError("reopened staged derivative changed the accepted timeline authority")
        if scene_frame_record(scene) != frame_after:
            raise RuntimeError("staged save changed the restored scene frame/subframe")
        derivative_record = file_record(pending)
        report = {
            "schema": "quantum-hub.phase-4-r1-1.targeted-repair.source-build.v1",
            "status": "PASS",
            "throughStage": args.through,
            "acceptedR1Source": {
                "path": str(cfg.ACCEPTED_R1_SOURCE.relative_to(cfg.REPO_ROOT)).replace("\\", "/"),
                **source_record,
            },
            "derivative": {
                "path": str(output.relative_to(cfg.REPO_ROOT)).replace("\\", "/"),
                **derivative_record,
            },
            "producerAuthorities": producer_records,
            "blender": {"version": bpy.app.version_string, "versionTuple": list(bpy.app.version)},
            "timeline": {"before": timeline_before, "after": timeline_after, "unchanged": timeline_before == timeline_after},
            "stages": stages,
            "preservation": {
                "before": before,
                "afterPeriphery": after_periphery,
                "afterCable": after_cable_preservation,
                "afterMobile": after_mobile_preservation,
                "afterCrt": after_crt_preservation,
                "after": after,
                "unchanged": unchanged,
                "changedAuthorities": changed_preservation_authorities,
                "expectedChangedAuthorities": expected_changed_preservation_authorities,
                "exactChangedAuthoritySet": changed_preservation_authorities == expected_changed_preservation_authorities,
                "peripheryUnchanged": periphery_unchanged,
                "cumulativePeripheryAuthority": {
                    "afterPeriphery": periphery_authority_after_periphery,
                    "afterFinalStage": periphery_authority_after,
                    "unchanged": periphery_authority_after_periphery == periphery_authority_after,
                },
                "sceneFrame": {
                    "before": frame_before,
                    "after": frame_after,
                    "unchanged": frame_before == frame_after,
                },
                "cableFixedAuthority": {
                    "before": cable_authority_before,
                    "after": cable_authority_after,
                    "unchanged": cable_stage_unchanged,
                },
                "currentStateHashes": {
                    "frames": list(cfg.CABLE_CURRENT_STATE_FRAMES),
                    "before": current_states_before,
                    "after": current_states_after,
                    "unchanged": current_states_before == current_states_after,
                },
                "materialGraphs": {
                    "allowedCableMaterialNames": sorted(allowed_cable_material_names),
                    "allowedCrtMaterialNames": sorted(allowed_crt_material_names),
                    "cumulativeAuthorizedMaterialNames": sorted(authorized_material_names),
                    "changedAcceptedMaterials": changed_accepted_materials,
                    "expectedChangedAcceptedMaterials": expected_material_changes,
                    "targetBefore": target_material_records_before,
                    "targetAfter": target_material_records_after,
                    "acceptedExceptAuthorizedBeforeSha256": canonical_hash(accepted_except_authorized_before),
                    "acceptedExceptAuthorizedAfterSha256": canonical_hash(accepted_except_authorized_after),
                    "acceptedExceptAuthorizedUnchanged": accepted_except_authorized_before == accepted_except_authorized_after,
                    "newPeripheryMaterials": new_material_names,
                    "cableUsersBefore": cable_material_users_before,
                    "cableUsersAfter": cable_material_users_after,
                    "cableUsersUnchanged": cable_material_users_before == cable_material_users_after,
                    "crtUsersBefore": crt_material_users_before,
                    "crtUsersAfter": crt_material_users_after,
                    "crtUsersUnchanged": crt_material_users_before == crt_material_users_after,
                },
                "openingHeaderGeometryAndMaterialBindingsUnchanged": header_before == header_after,
                "onlyOpeningHeaderRenderVisibilitySuppressed": all(bpy.data.objects[name].hide_render for name in cfg.SUPPRESSED_OPENING_HEADER_OBJECTS),
            },
            "exactQ": post_save_q,
            "authorization": cfg.AUTHORIZATION,
        }
        report_pending.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
        staged_report = json.loads(report_pending.read_text(encoding="utf-8"))
        if staged_report.get("status") != "PASS" or staged_report.get("derivative") != report["derivative"]:
            raise RuntimeError("staged build report failed its self-validation")
        staged_report_record = file_record(report_pending)
        publication_started = True
        os.replace(pending, output)
        os.replace(report_pending, cfg.BUILD_REPORT)
        if file_record(output) != derivative_record:
            raise RuntimeError("published derivative differs from its staged authority")
        if file_record(cfg.BUILD_REPORT) != staged_report_record:
            raise RuntimeError("published build report differs from its staged authority")
        published_report = json.loads(cfg.BUILD_REPORT.read_text(encoding="utf-8"))
        if (
            published_report.get("status") != "PASS"
            or published_report.get("throughStage") != args.through
            or published_report.get("derivative") != report["derivative"]
        ):
            raise RuntimeError("published build report failed its final binding check")
    except BaseException as failure:
        rollback_errors = []
        if publication_started:
            restoration_jobs = (
                ("derivative", output, restore_output, previous_output),
                ("build report", cfg.BUILD_REPORT, restore_report, previous_report),
            )
            for label, target, restore_path, previous_bytes in restoration_jobs:
                try:
                    if previous_bytes is None:
                        target.unlink(missing_ok=True)
                        if target.exists():
                            raise RuntimeError(f"{label} still exists after rollback removal")
                    else:
                        restore_path.write_bytes(previous_bytes)
                        os.replace(restore_path, target)
                        if not target.is_file() or target.read_bytes() != previous_bytes:
                            raise RuntimeError(f"{label} rollback bytes do not match the prior authority")
                except BaseException as rollback_failure:
                    rollback_errors.append(f"{label}: {rollback_failure!r}")
        if rollback_errors:
            raise RuntimeError(
                "R1.1 publication failed and rollback was incomplete: " + "; ".join(rollback_errors)
            ) from failure
        raise
    finally:
        pending.unlink(missing_ok=True)
        report_pending.unlink(missing_ok=True)
        restore_output.unlink(missing_ok=True)
        restore_report.unlink(missing_ok=True)
    print("PHASE4R1_1_BUILD_STATUS=PASS")
    print(f"PHASE4R1_1_DERIVATIVE={output}")
    print(f"PHASE4R1_1_BUILD_REPORT={cfg.BUILD_REPORT}")


if __name__ == "__main__":
    main()
