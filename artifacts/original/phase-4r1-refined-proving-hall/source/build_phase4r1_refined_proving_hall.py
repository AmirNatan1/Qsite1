"""Build one deterministic, non-destructive refined Phase 4-R1 derivative.

Run with the recovered e24ccf source already open.  The script verifies that
authority, builds the v2 environment/cable/Q track, invokes the fail-closed
preflight *before* the only save, then writes reports beside the new blend.
It never renders and it never modifies the recovered file.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Iterable

import bpy
from mathutils import Vector

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
import phase4r1_refined_config as cfg
import preflight_phase4r1_refined_geometry as preflight


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_record(path: Path) -> dict[str, Any]:
    return {
        "path": path.resolve().relative_to(cfg.REPOSITORY_ROOT.resolve()).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def decode_blender_byte_string(value: Any) -> str:
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="surrogateescape")
    return str(value or "")


def audit_file_browser_ui_state() -> dict[str, Any]:
    private_tokens = ("c:\\users\\amir", "c:/users/amir")
    records: list[dict[str, Any]] = []
    for screen in sorted(bpy.data.screens, key=lambda item: item.name):
        for area_index, area in enumerate(screen.areas):
            if area.type != "FILE_BROWSER":
                continue
            params = getattr(area.spaces.active, "params", None)
            if params is None:
                raise RuntimeError(f"file-browser area has no readable parameters: {screen.name}[{area_index}]")
            directory = decode_blender_byte_string(params.directory)
            filename = decode_blender_byte_string(params.filename)
            has_private_path = any(token in directory.lower() or token in filename.lower() for token in private_tokens)
            records.append(
                {
                    "screen": screen.name,
                    "areaIndex": area_index,
                    "title": str(params.title or ""),
                    "directory": None if has_private_path else directory,
                    "filename": None if has_private_path else filename,
                    "hasPrivatePath": has_private_path,
                    "passes": directory == cfg.CANONICAL_FILE_BROWSER_DIRECTORY and filename == "" and not has_private_path,
                }
            )
    buffer_overwrite_realized_bytes = int(bpy.context.scene.get("phase4r1v2_file_browser_buffer_overwrite_realized_bytes", 0))
    return {
        "canonicalDirectory": cfg.CANONICAL_FILE_BROWSER_DIRECTORY,
        "bufferOverwriteMinimumBytes": cfg.FILE_BROWSER_DIRECTORY_BUFFER_OVERWRITE_MINIMUM_BYTES,
        "bufferOverwriteRealizedBytes": buffer_overwrite_realized_bytes,
        "fileBrowserAreaCount": len(records),
        "records": records,
        "passes": bool(records) and buffer_overwrite_realized_bytes >= cfg.FILE_BROWSER_DIRECTORY_BUFFER_OVERWRITE_MINIMUM_BYTES and all(record["passes"] for record in records),
    }


def sanitize_file_browser_ui_state() -> dict[str, Any]:
    private_tokens = ("c:\\users\\amir", "c:/users/amir")
    before_private_path_detected = False
    realized_overwrite_lengths: list[int] = []
    overwrite_filler = cfg.FILE_BROWSER_DIRECTORY_BUFFER_OVERWRITE_PREFIX.encode("utf-8") + b"x" * 2000
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type != "FILE_BROWSER":
                continue
            params = getattr(area.spaces.active, "params", None)
            if params is None:
                raise RuntimeError(f"file-browser area has no writable parameters: {screen.name}")
            directory_before = decode_blender_byte_string(params.directory)
            filename_before = decode_blender_byte_string(params.filename)
            before_private_path_detected = before_private_path_detected or any(
                token in directory_before.lower() or token in filename_before.lower() for token in private_tokens
            )
            params.directory = overwrite_filler
            realized_overwrite = bytes(params.directory)
            realized_overwrite_lengths.append(len(realized_overwrite))
            if (
                len(realized_overwrite) < cfg.FILE_BROWSER_DIRECTORY_BUFFER_OVERWRITE_MINIMUM_BYTES
                or realized_overwrite != overwrite_filler[: len(realized_overwrite)]
            ):
                raise RuntimeError("file-browser directory buffer did not accept the full nonprivate overwrite authority")
            params.directory = cfg.CANONICAL_FILE_BROWSER_DIRECTORY.encode("utf-8")
            params.filename = ""
    bpy.context.scene["phase4r1v2_file_browser_buffer_overwrite_realized_bytes"] = min(realized_overwrite_lengths, default=0)
    audit = audit_file_browser_ui_state()
    if not audit["passes"]:
        raise RuntimeError(f"file-browser UI-state privacy sanitization failed: {audit}")
    return {**audit, "beforePrivatePathDetected": before_private_path_detected, "sanitized": True}


def required_producer_authorities(require_git_tracked: bool) -> dict[str, Any]:
    paths = {
        "config": SCRIPT_DIR / "phase4r1_refined_config.py",
        "builder": Path(__file__).resolve(),
        "preflight": SCRIPT_DIR / "preflight_phase4r1_refined_geometry.py",
        "validator": SCRIPT_DIR / "validate_phase4r1_refined_source.py",
        "exact-q-generator": SCRIPT_DIR / "generate_phase4r1_exact_q.mjs",
        "sparse-proof-renderer": SCRIPT_DIR / "render_phase4r1_refined_sparse_proof.py",
        "preview-renderer": SCRIPT_DIR / "render_phase4r1_refined_previews.py",
        "cycles-benchmarks-renderer": SCRIPT_DIR / "render_phase4r1_refined_cycles_benchmarks.py",
    }
    missing = [path.name for path in paths.values() if not path.is_file()]
    if missing:
        raise RuntimeError(f"required refined producer files are missing before save authorization: {missing}")
    records = {producer_id: file_record(path) for producer_id, path in paths.items()}
    if require_git_tracked:
        untracked = []
        for producer_id, record in records.items():
            result = subprocess.run(["git", "ls-files", "--error-unmatch", "--", record["path"]], cwd=cfg.REPOSITORY_ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
            if result.returncode != 0:
                untracked.append({"id": producer_id, "path": record["path"]})
        if untracked:
            raise RuntimeError(f"required refined producers must be staged/tracked before the only save: {untracked}")
    return records


def canonical_hash(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def srgb(value: str) -> tuple[float, float, float, float]:
    clean = value.lstrip("#")
    return tuple(int(clean[index : index + 2], 16) / 255.0 for index in (0, 2, 4)) + (1.0,)


def iter_action_fcurves(action: bpy.types.Action):
    legacy = getattr(action, "fcurves", None)
    if legacy is not None:
        yield from legacy
        return
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", ()):
                yield from channelbag.fcurves


def safe_rna_path(value: Any) -> str:
    if not hasattr(value, "path_from_id"):
        return ""
    try:
        return str(value.path_from_id())
    except (AttributeError, RuntimeError, TypeError, ValueError):
        return "<path-unsupported>"


def rna_scalar_record(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        return float(value).hex()
    if isinstance(value, dict):
        return {str(key): rna_scalar_record(item) for key, item in sorted(value.items(), key=lambda row: str(row[0]))}
    if isinstance(value, (set, frozenset)):
        return [rna_scalar_record(item) for item in sorted(value, key=str)]
    if isinstance(value, bpy.types.ID):
        return {"idType": value.bl_rna.identifier, "name": value.name}
    if hasattr(value, "to_dict"):
        try:
            return {str(key): rna_scalar_record(item) for key, item in sorted(value.to_dict().items(), key=lambda row: str(row[0]))}
        except (AttributeError, RuntimeError, TypeError, ValueError):
            return "<unreadable>"
    if hasattr(value, "bl_rna"):
        # Never fall back to bpy_struct.__str__ here: some Blender RNA
        # representations contain process-local pointer addresses.  A stable
        # RNA identity keeps preservation hashes deterministic.
        return {
            "rnaType": value.bl_rna.identifier,
            "name": str(getattr(value, "name", "")),
            "path": safe_rna_path(value),
        }
    if hasattr(value, "__len__") and not isinstance(value, (bytes, bytearray)):
        try:
            return [rna_scalar_record(item) for item in value]
        except (TypeError, ValueError):
            pass
    return str(value)


def rna_simple_properties(owner: Any) -> dict[str, Any]:
    record: dict[str, Any] = {}
    volatile_runtime_properties = set(cfg.PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY["properties"])
    for prop in owner.bl_rna.properties:
        if prop.identifier == "rna_type" or prop.identifier in volatile_runtime_properties or prop.type in {"POINTER", "COLLECTION"}:
            continue
        try:
            record[prop.identifier] = rna_scalar_record(getattr(owner, prop.identifier))
        except (AttributeError, RuntimeError, TypeError, ValueError):
            record[prop.identifier] = "<unreadable>"
    return record


def id_custom_properties(owner: Any) -> dict[str, Any]:
    """Serialize custom properties without UI metadata or pointer reprs."""
    if not hasattr(owner, "keys"):
        return {}
    record: dict[str, Any] = {}
    for key in sorted(str(value) for value in owner.keys() if str(value) != "_RNA_UI"):
        try:
            record[key] = rna_scalar_record(owner[key])
        except (AttributeError, KeyError, RuntimeError, TypeError, ValueError):
            record[key] = "<unreadable>"
    return record


def rna_pointer_properties(owner: Any, excluded: set[str] | None = None) -> dict[str, Any]:
    excluded = excluded or set()
    record: dict[str, Any] = {}
    for prop in owner.bl_rna.properties:
        if prop.identifier == "rna_type" or prop.identifier in excluded or prop.type != "POINTER":
            continue
        try:
            value = getattr(owner, prop.identifier)
            record[prop.identifier] = None if value is None else rna_scalar_record(value)
        except (AttributeError, RuntimeError, TypeError, ValueError):
            record[prop.identifier] = "<unreadable>"
    return record


def embedded_rna_signature(owner: Any, depth: int = 3, visiting: set[tuple[str, str]] | None = None) -> Any:
    """Capture nested RNA structs such as ColorRamp and CurveMapping.

    ID datablocks are referenced by stable type/name and are serialized by
    their owning signature track.  Non-ID embedded structs and their bounded
    collections are captured recursively; cycles fail closed to a stable
    reference instead of a process pointer.
    """
    if owner is None:
        return None
    if isinstance(owner, bpy.types.ID):
        return rna_scalar_record(owner)
    visiting = set() if visiting is None else visiting
    identity = (owner.bl_rna.identifier, safe_rna_path(owner))
    if identity in visiting:
        return {"recursiveReference": {"rnaType": identity[0], "path": identity[1]}}
    visiting.add(identity)
    record: dict[str, Any] = {
        "rnaType": owner.bl_rna.identifier,
        "path": identity[1],
        "properties": rna_simple_properties(owner),
        "pointers": {},
        "collections": {},
    }
    if depth > 0:
        for prop in owner.bl_rna.properties:
            if prop.identifier == "rna_type":
                continue
            if prop.type == "POINTER":
                try:
                    value = getattr(owner, prop.identifier)
                    record["pointers"][prop.identifier] = embedded_rna_signature(value, depth - 1, visiting)
                except (AttributeError, RuntimeError, TypeError, ValueError):
                    record["pointers"][prop.identifier] = "<unreadable>"
            elif prop.type == "COLLECTION":
                try:
                    values = getattr(owner, prop.identifier)
                    record["collections"][prop.identifier] = [embedded_rna_signature(value, depth - 1, visiting) for value in values]
                except (AttributeError, RuntimeError, TypeError, ValueError):
                    record["collections"][prop.identifier] = "<unreadable>"
    visiting.remove(identity)
    return record


def embedded_pointer_state(owner: Any, depth: int = 3) -> dict[str, Any]:
    record: dict[str, Any] = {}
    for prop in owner.bl_rna.properties:
        if prop.identifier == "rna_type" or prop.type != "POINTER":
            continue
        try:
            value = getattr(owner, prop.identifier)
            if value is not None and not isinstance(value, bpy.types.ID):
                record[prop.identifier] = embedded_rna_signature(value, depth)
        except (AttributeError, RuntimeError, TypeError, ValueError):
            record[prop.identifier] = "<unreadable>"
    return record


def rna_collection_state(owner: Any, depth: int = 2, excluded: set[str] | None = None) -> dict[str, Any]:
    excluded = set() if excluded is None else excluded
    record: dict[str, Any] = {}
    for prop in owner.bl_rna.properties:
        if prop.identifier == "rna_type" or prop.type != "COLLECTION" or prop.identifier in excluded:
            continue
        try:
            record[prop.identifier] = [embedded_rna_signature(value, depth) for value in getattr(owner, prop.identifier)]
        except (AttributeError, RuntimeError, TypeError, ValueError):
            record[prop.identifier] = "<unreadable>"
    return record


def assert_signature_readable(value: Any, label: str) -> None:
    if value == "<unreadable>":
        raise RuntimeError(f"preservation signature contains unreadable RNA state: {label}")
    if isinstance(value, dict):
        for key, item in value.items():
            assert_signature_readable(item, f"{label}.{key}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            assert_signature_readable(item, f"{label}[{index}]")


def nla_signature(owner: Any) -> dict[str, Any]:
    animation = getattr(owner, "animation_data", None)
    if animation is None:
        return {"activeAction": None, "tracks": []}
    tracks = []
    for track in animation.nla_tracks:
        strips = []
        for strip in track.strips:
            strips.append(
                {
                    "name": strip.name,
                    "type": strip.type,
                    "action": None if strip.action is None else strip.action.name,
                    "frameStart": float(strip.frame_start).hex(),
                    "frameEnd": float(strip.frame_end).hex(),
                    "actionFrameStart": float(strip.action_frame_start).hex(),
                    "actionFrameEnd": float(strip.action_frame_end).hex(),
                    "scale": float(strip.scale).hex(),
                    "repeat": float(strip.repeat).hex(),
                    "blendType": strip.blend_type,
                    "extrapolation": strip.extrapolation,
                    "influence": float(strip.influence).hex(),
                    "mute": bool(strip.mute),
                    "useAnimatedInfluence": bool(strip.use_animated_influence),
                    "useAnimatedTime": bool(strip.use_animated_time),
                    "useAnimatedTimeCyclic": bool(strip.use_animated_time_cyclic),
                }
            )
        tracks.append({"name": track.name, "mute": bool(track.mute), "isSolo": bool(track.is_solo), "strips": strips})
    return {"activeAction": None if animation.action is None else animation.action.name, "tracks": tracks}


def action_signature(actions: Iterable[bpy.types.Action]) -> dict[str, Any]:
    unique = sorted({action.name: action for action in actions}.values(), key=lambda action: action.name)
    curve_count = 0
    point_count = 0
    action_records = []
    for action in unique:
        curve_records = []
        for curve in sorted(iter_action_fcurves(action), key=lambda row: (row.data_path, row.array_index)):
            curve_count += 1
            point_records = []
            for point in curve.keyframe_points:
                point_count += 1
                point_records.append(
                    {
                        "co": [float(point.co.x).hex(), float(point.co.y).hex()],
                        "handleLeft": [float(point.handle_left.x).hex(), float(point.handle_left.y).hex()],
                        "handleRight": [float(point.handle_right.x).hex(), float(point.handle_right.y).hex()],
                        "interpolation": str(point.interpolation),
                        "handleLeftType": str(point.handle_left_type),
                        "handleRightType": str(point.handle_right_type),
                        "easing": str(point.easing),
                        "amplitude": float(point.amplitude).hex(),
                        "back": float(point.back).hex(),
                        "period": float(point.period).hex(),
                    }
                )
            curve_records.append(
                {
                    "dataPath": curve.data_path,
                    "arrayIndex": int(curve.array_index),
                    "group": None if curve.group is None else curve.group.name,
                    "extrapolation": curve.extrapolation,
                    "mute": bool(curve.mute),
                    "lock": bool(curve.lock),
                    "modifiers": [{"type": modifier.type, "properties": rna_simple_properties(modifier)} for modifier in curve.modifiers],
                    "points": point_records,
                }
            )
        action_records.append({"name": action.name, "frameRange": [float(value).hex() for value in action.frame_range], "curves": curve_records})
    digest = canonical_hash(action_records)
    return {
        "actionNames": [action.name for action in unique],
        "actionCount": len(unique),
        "curveCount": curve_count,
        "keyframePointCount": point_count,
        "records": action_records,
        "sha256": digest,
    }


def actions_for_owner(owner: Any) -> list[bpy.types.Action]:
    animation = getattr(owner, "animation_data", None)
    if animation is None:
        return []
    actions = [] if animation.action is None else [animation.action]
    actions.extend(strip.action for track in animation.nla_tracks for strip in track.strips if strip.action is not None)
    return actions


def constraint_signature(constraint: bpy.types.Constraint) -> dict[str, Any]:
    return {
        "name": constraint.name,
        "type": constraint.type,
        "mute": bool(constraint.mute),
        "influence": float(constraint.influence).hex(),
        "target": None if not hasattr(constraint, "target") or constraint.target is None else constraint.target.name,
        "subtarget": str(getattr(constraint, "subtarget", "")),
        "ownerSpace": str(getattr(constraint, "owner_space", "")),
        "targetSpace": str(getattr(constraint, "target_space", "")),
        "properties": rna_simple_properties(constraint),
        "embeddedPointerState": embedded_pointer_state(constraint),
        "collectionState": rna_collection_state(constraint),
    }


def driver_signature(owner: Any) -> dict[str, Any]:
    animation = getattr(owner, "animation_data", None)
    curves = [] if animation is None else list(getattr(animation, "drivers", ()))
    records: list[dict[str, Any]] = []
    for curve in sorted(curves, key=lambda row: (row.data_path, row.array_index)):
        driver = curve.driver
        variables = []
        for variable in driver.variables:
            targets = []
            for target in variable.targets:
                target_id = getattr(target, "id", None)
                targets.append(
                    {
                        "id": None if target_id is None else rna_scalar_record(target_id),
                        "idType": str(getattr(target, "id_type", "")),
                        "dataPath": str(getattr(target, "data_path", "")),
                        "boneTarget": str(getattr(target, "bone_target", "")),
                        "transformType": str(getattr(target, "transform_type", "")),
                        "transformSpace": str(getattr(target, "transform_space", "")),
                        "rotationMode": str(getattr(target, "rotation_mode", "")),
                    }
                )
            variables.append({"name": variable.name, "type": variable.type, "targets": targets})
        records.append(
            {
                "dataPath": curve.data_path,
                "arrayIndex": int(curve.array_index),
                "mute": bool(curve.mute),
                "extrapolation": curve.extrapolation,
                "modifiers": [
                    {"type": modifier.type, "properties": rna_simple_properties(modifier), "pointers": rna_pointer_properties(modifier)}
                    for modifier in curve.modifiers
                ],
                "driver": {
                    "type": driver.type,
                    "expression": driver.expression,
                    "useSelf": bool(driver.use_self),
                    "variables": variables,
                },
            }
        )
    record = {"count": len(records), "records": records}
    record["sha256"] = canonical_hash(record)
    return record


def modifier_signature(modifier: bpy.types.Modifier) -> dict[str, Any]:
    record: dict[str, Any] = {
        "name": modifier.name,
        "type": modifier.type,
        "showViewport": bool(modifier.show_viewport),
        "showRender": bool(modifier.show_render),
        "showInEditmode": bool(modifier.show_in_editmode),
        "showOnCage": bool(modifier.show_on_cage),
        "properties": rna_simple_properties(modifier),
        "pointers": rna_pointer_properties(modifier),
        "embeddedPointerState": embedded_pointer_state(modifier),
        "collectionState": rna_collection_state(modifier),
    }
    node_group = getattr(modifier, "node_group", None)
    if node_group is not None:
        record["nodeGroupDependency"] = node_tree_signature(node_group, set())
    record["sha256"] = canonical_hash(record)
    return record


def owner_signature_record(owner: Any) -> dict[str, Any]:
    record: dict[str, Any] = {
        "name": owner.name,
        "idType": owner.bl_rna.identifier,
        "properties": rna_simple_properties(owner),
        "pointerProperties": rna_pointer_properties(owner),
        "embeddedPointerState": embedded_pointer_state(owner),
        "customProperties": id_custom_properties(owner),
        "animation": nla_signature(owner),
        "actions": action_signature(actions_for_owner(owner)),
        "drivers": driver_signature(owner),
    }
    if isinstance(owner, bpy.types.Object):
        record.update(
            {
                "objectType": owner.type,
                "parent": None if owner.parent is None else owner.parent.name,
                "parentType": owner.parent_type,
                "parentBone": owner.parent_bone,
                "matrixWorld": [[float(value).hex() for value in row] for row in owner.matrix_world],
                "matrixBasis": [[float(value).hex() for value in row] for row in owner.matrix_basis],
                "matrixParentInverse": [[float(value).hex() for value in row] for row in owner.matrix_parent_inverse],
                "rotationMode": owner.rotation_mode,
                "constraints": [constraint_signature(constraint) for constraint in owner.constraints],
                "modifiers": [modifier_signature(modifier) for modifier in owner.modifiers],
                "hideViewport": bool(owner.hide_viewport),
                "hideRender": bool(owner.hide_render),
                "hideSelect": bool(owner.hide_select),
                "instanceType": owner.instance_type,
                "instanceCollection": None if owner.instance_collection is None else owner.instance_collection.name,
                "vertexGroups": [
                    {"name": group.name, "index": int(group.index), "lockWeight": bool(group.lock_weight)}
                    for group in owner.vertex_groups
                ],
            }
        )
    elif isinstance(owner, bpy.types.Camera):
        record.update(
            {
                "cameraType": owner.type,
                "lens": float(owner.lens).hex(),
                "sensorFit": owner.sensor_fit,
                "sensorWidth": float(owner.sensor_width).hex(),
                "sensorHeight": float(owner.sensor_height).hex(),
                "shiftX": float(owner.shift_x).hex(),
                "shiftY": float(owner.shift_y).hex(),
                "clipStart": float(owner.clip_start).hex(),
                "clipEnd": float(owner.clip_end).hex(),
                "dofUse": bool(owner.dof.use_dof),
                "dofFocusObject": None if owner.dof.focus_object is None else owner.dof.focus_object.name,
                "dofFocusDistance": float(owner.dof.focus_distance).hex(),
            }
        )
    record["sha256"] = canonical_hash(record)
    return record


def camera_path_signature() -> dict[str, Any]:
    owners: list[Any] = []
    for family, camera_name in cfg.CAMERAS.items():
        camera = bpy.data.objects[camera_name]
        rig = bpy.data.objects[f"Phase4R1_OrbitRig_{family.title()}"]
        owners.extend((camera, camera.data, rig))
    action = action_signature(action for owner in owners for action in actions_for_owner(owner))
    owner_records = [owner_signature_record(owner) for owner in owners]
    signature = {key: value for key, value in action.items() if key != "sha256"}
    signature["actionSha256"] = action["sha256"]
    signature["owners"] = [owner.name for owner in owners]
    signature["ownerRecords"] = owner_records
    signature["signatureFrame"] = int(bpy.context.scene.frame_current)
    signature["signatureSchema"] = cfg.PRESERVATION_SIGNATURE_SCHEMA
    signature["persistenceVolatileRnaPropertyExclusionAuthority"] = cfg.PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY
    signature["coverage"] = "persistent authored object/data RNA, transforms, parenting, constraints, modifiers, NLA, actions, fcurve modifiers, drivers, custom properties, and node-group dependencies; only Blender runtime session_uid is inventoried and excluded from persistence hashing"
    assert_signature_readable(signature, "camera-path")
    signature["sha256"] = canonical_hash({"actionSha256": action["sha256"], "owners": owner_records, "signatureFrame": signature["signatureFrame"], "signatureSchema": signature["signatureSchema"], "persistenceVolatileRnaPropertyExclusionAuthority": signature["persistenceVolatileRnaPropertyExclusionAuthority"]})
    return signature


def establishing_aim_signature() -> dict[str, Any]:
    owners = [
        bpy.data.objects["Phase4R1_EstablishingAimTarget"],
        bpy.data.objects["Phase4R1_EstablishingAimTarget_Mobile"],
        bpy.data.objects["Phase4R1_EstablishingAimTarget_Landscape"],
    ]
    action = action_signature(action for owner in owners for action in actions_for_owner(owner))
    owner_records = [owner_signature_record(owner) for owner in owners]
    signature = {key: value for key, value in action.items() if key != "sha256"}
    signature["actionSha256"] = action["sha256"]
    signature["owners"] = [owner.name for owner in owners]
    signature["ownerRecords"] = owner_records
    signature["signatureFrame"] = int(bpy.context.scene.frame_current)
    signature["signatureSchema"] = cfg.PRESERVATION_SIGNATURE_SCHEMA
    signature["persistenceVolatileRnaPropertyExclusionAuthority"] = cfg.PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY
    signature["coverage"] = "persistent authored object/data RNA, transforms, parenting, constraints, modifiers, NLA, actions, fcurve modifiers, drivers, and custom properties; only Blender runtime session_uid is inventoried and excluded from persistence hashing"
    assert_signature_readable(signature, "establishing-aim")
    signature["sha256"] = canonical_hash({"actionSha256": action["sha256"], "owners": owner_records, "signatureFrame": signature["signatureFrame"], "signatureSchema": signature["signatureSchema"], "persistenceVolatileRnaPropertyExclusionAuthority": signature["persistenceVolatileRnaPropertyExclusionAuthority"]})
    return signature


def attribute_layer_signature(layer: Any) -> dict[str, Any]:
    data_records = [
        {"properties": rna_simple_properties(item), "pointers": rna_pointer_properties(item)}
        for item in layer.data
    ]
    return {
        "name": layer.name,
        "rnaType": layer.bl_rna.identifier,
        "properties": rna_simple_properties(layer),
        "pointers": rna_pointer_properties(layer),
        "dataCount": len(data_records),
        "data": data_records,
    }


def shape_key_signature(data: Any) -> Any:
    shape_keys = getattr(data, "shape_keys", None)
    if shape_keys is None:
        return None
    blocks = []
    for block in shape_keys.key_blocks:
        blocks.append(
            {
                "name": block.name,
                "value": float(block.value).hex(),
                "sliderMin": float(block.slider_min).hex(),
                "sliderMax": float(block.slider_max).hex(),
                "mute": bool(block.mute),
                "interpolation": block.interpolation,
                "vertexGroup": block.vertex_group,
                "relativeKey": None if block.relative_key is None else block.relative_key.name,
                "properties": rna_simple_properties(block),
                "data": [rna_simple_properties(point) for point in block.data],
            }
        )
    return {
        "owner": owner_signature_record(shape_keys),
        "useRelative": bool(shape_keys.use_relative),
        "evalTime": float(shape_keys.eval_time).hex(),
        "referenceKey": None if shape_keys.reference_key is None else shape_keys.reference_key.name,
        "blocks": blocks,
    }


def curve_spline_signature(spline: Any) -> dict[str, Any]:
    points = []
    if spline.type == "BEZIER":
        for point in spline.bezier_points:
            points.append(
                {
                    "properties": rna_simple_properties(point),
                    "co": rna_scalar_record(point.co),
                    "handleLeft": rna_scalar_record(point.handle_left),
                    "handleRight": rna_scalar_record(point.handle_right),
                    "handleLeftType": point.handle_left_type,
                    "handleRightType": point.handle_right_type,
                    "tilt": float(point.tilt).hex(),
                    "radius": float(point.radius).hex(),
                }
            )
    else:
        for point in spline.points:
            points.append(
                {
                    "properties": rna_simple_properties(point),
                    "co": rna_scalar_record(point.co),
                    "tilt": float(point.tilt).hex(),
                    "radius": float(point.radius).hex(),
                    "weight": float(point.weight).hex(),
                }
            )
    return {
        "type": spline.type,
        "properties": rna_simple_properties(spline),
        "cyclicU": bool(spline.use_cyclic_u),
        "cyclicV": bool(getattr(spline, "use_cyclic_v", False)),
        "points": points,
    }


def curve_dependency_signature(obj: bpy.types.Object | None) -> Any:
    if obj is None:
        return None
    data = obj.data
    return {
        "owner": owner_signature_record(obj),
        "data": None
        if data is None
        else {
            "name": data.name,
            "rnaType": data.bl_rna.identifier,
            "properties": rna_simple_properties(data),
            "pointerProperties": rna_pointer_properties(data),
            "customProperties": id_custom_properties(data),
            "splines": [] if not hasattr(data, "splines") else [curve_spline_signature(spline) for spline in data.splines],
        },
    }


def data_signature_payload(obj: bpy.types.Object) -> Any:
    data = obj.data
    if data is None:
        return None
    common: dict[str, Any] = {
        "name": data.name,
        "rnaType": data.bl_rna.identifier,
        "properties": rna_simple_properties(data),
        "pointerProperties": rna_pointer_properties(data),
        "customProperties": id_custom_properties(data),
        "materials": [] if not hasattr(data, "materials") else [None if material is None else material.name for material in data.materials],
        "shapeKeys": shape_key_signature(data),
    }
    if obj.type == "MESH":
        common.update(
            {
                "vertices": [
                    {
                        "co": rna_scalar_record(vertex.co),
                        "normal": rna_scalar_record(vertex.normal),
                        "undeformedCo": rna_scalar_record(vertex.undeformed_co),
                        "groups": [rna_simple_properties(group) for group in vertex.groups],
                    }
                    for vertex in data.vertices
                ],
                "edges": [
                    {"vertices": list(edge.vertices), "properties": rna_simple_properties(edge)}
                    for edge in data.edges
                ],
                "loops": [rna_simple_properties(loop) for loop in data.loops],
                "polygons": [
                    {"vertices": list(poly.vertices), "loopIndices": list(poly.loop_indices), "materialIndex": int(poly.material_index), "properties": rna_simple_properties(poly)}
                    for poly in data.polygons
                ],
                "uvLayers": [attribute_layer_signature(layer) for layer in data.uv_layers],
                "activeUvLayer": None if data.uv_layers.active is None else data.uv_layers.active.name,
                "activeRenderUvLayers": sorted(layer.name for layer in data.uv_layers if layer.active_render),
                "colorAttributes": [attribute_layer_signature(layer) for layer in data.color_attributes],
                "activeColorAttribute": None if getattr(data.color_attributes, "active_color", None) is None else data.color_attributes.active_color.name,
                "defaultColorAttributeName": str(getattr(data.color_attributes, "default_color_name", "")),
                "attributes": [attribute_layer_signature(layer) for layer in data.attributes],
                "activeAttribute": None if getattr(data.attributes, "active", None) is None else data.attributes.active.name,
            }
        )
    elif obj.type in {"CURVE", "FONT", "SURFACE"}:
        common.update(
            {
                "dimensions": str(getattr(data, "dimensions", "")),
                "resolutionU": int(getattr(data, "resolution_u", 0)),
                "renderResolutionU": int(getattr(data, "render_resolution_u", 0)),
                "twistMode": str(getattr(data, "twist_mode", "")),
                "twistSmooth": float(getattr(data, "twist_smooth", 0.0)).hex(),
                "fillMode": str(getattr(data, "fill_mode", "")),
                "bevelMode": str(getattr(data, "bevel_mode", "")),
                "bevelDepth": float(getattr(data, "bevel_depth", 0.0)).hex(),
                "bevelResolution": int(getattr(data, "bevel_resolution", 0)),
                "bevelObject": None if getattr(data, "bevel_object", None) is None else data.bevel_object.name,
                "taperObject": None if getattr(data, "taper_object", None) is None else data.taper_object.name,
                "bevelObjectDependency": curve_dependency_signature(getattr(data, "bevel_object", None)),
                "taperObjectDependency": curve_dependency_signature(getattr(data, "taper_object", None)),
                "extrude": float(getattr(data, "extrude", 0.0)).hex(),
                "offset": float(getattr(data, "offset", 0.0)).hex(),
                "splines": [curve_spline_signature(spline) for spline in data.splines],
            }
        )
    elif obj.type == "META":
        common["elements"] = [rna_simple_properties(element) for element in data.elements]
    common["sha256"] = canonical_hash(common)
    return common


def image_signature(image: bpy.types.Image) -> dict[str, Any]:
    packed_bytes = b"" if image.packed_file is None else bytes(image.packed_file.data)
    return {
        "name": image.name,
        "source": image.source,
        "filepath": str(image.filepath),
        "colorspace": image.colorspace_settings.name,
        "alphaMode": image.alpha_mode,
        "size": list(image.size),
        "packedBytes": len(packed_bytes),
        "packedSha256": None if not packed_bytes else hashlib.sha256(packed_bytes).hexdigest(),
    }


def node_socket_signature(socket: Any) -> dict[str, Any]:
    value: Any = None
    if hasattr(socket, "default_value"):
        try:
            value = rna_scalar_record(socket.default_value)
        except (AttributeError, RuntimeError, TypeError, ValueError):
            value = "<unreadable>"
    return {
        "name": socket.name,
        "identifier": socket.identifier,
        "rnaType": socket.bl_rna.identifier,
        "linked": bool(socket.is_linked),
        "enabled": bool(socket.enabled),
        "hide": bool(socket.hide),
        "default": value,
        "properties": rna_simple_properties(socket),
    }


def node_tree_signature(tree: bpy.types.NodeTree, visiting: set[tuple[str, str]]) -> dict[str, Any]:
    identity = (tree.bl_rna.identifier, tree.name)
    if identity in visiting:
        return {"recursiveReference": {"rnaType": identity[0], "name": identity[1]}}
    visiting.add(identity)
    nodes = []
    for node in sorted(tree.nodes, key=lambda value: value.name):
        dependency = None
        child_tree = getattr(node, "node_tree", None)
        if child_tree is not None:
            dependency = node_tree_signature(child_tree, visiting)
        image = getattr(node, "image", None)
        nodes.append(
            {
                "name": node.name,
                "label": node.label,
                "type": node.bl_idname,
                "mute": bool(node.mute),
                "hide": bool(node.hide),
                "isActiveOutput": bool(getattr(node, "is_active_output", False)),
                "properties": rna_simple_properties(node),
                "pointerProperties": rna_pointer_properties(node),
                "embeddedPointerState": embedded_pointer_state(node),
                "collectionState": rna_collection_state(node, excluded={"inputs", "outputs"}),
                "customProperties": id_custom_properties(node),
                "inputs": [node_socket_signature(socket) for socket in node.inputs],
                "outputs": [node_socket_signature(socket) for socket in node.outputs],
                "image": None if image is None else image_signature(image),
                "nodeGroupDependency": dependency,
            }
        )
    links = sorted(
        [
            {
                "fromNode": link.from_node.name,
                "fromSocket": link.from_socket.identifier,
                "toNode": link.to_node.name,
                "toSocket": link.to_socket.identifier,
                "isMuted": bool(link.is_muted),
                "isValid": bool(link.is_valid),
            }
            for link in tree.links
        ],
        key=lambda row: (row["fromNode"], row["fromSocket"], row["toNode"], row["toSocket"]),
    )
    interface = []
    items_tree = getattr(getattr(tree, "interface", None), "items_tree", ())
    for item in items_tree:
        interface.append(
            {
                "name": item.name,
                "itemType": str(getattr(item, "item_type", "")),
                "inOut": str(getattr(item, "in_out", "")),
                "socketType": str(getattr(item, "socket_type", "")),
                "properties": rna_simple_properties(item),
                "pointerProperties": rna_pointer_properties(item),
            }
        )
    record = {
        "name": tree.name,
        "rnaType": tree.bl_rna.identifier,
        "properties": rna_simple_properties(tree),
        "pointerProperties": rna_pointer_properties(tree, excluded={"interface"}),
        "customProperties": id_custom_properties(tree),
        "animation": nla_signature(tree),
        "actions": action_signature(actions_for_owner(tree)),
        "drivers": driver_signature(tree),
        "interface": interface,
        "nodes": nodes,
        "links": links,
    }
    visiting.remove(identity)
    record["sha256"] = canonical_hash(record)
    return record


def material_signature_payload(material: bpy.types.Material) -> dict[str, Any]:
    record: dict[str, Any] = {
        "name": material.name,
        "properties": rna_simple_properties(material),
        "pointerProperties": rna_pointer_properties(material),
        "customProperties": id_custom_properties(material),
        "diffuseColor": [float(value).hex() for value in material.diffuse_color],
        "useNodes": bool(material.use_nodes),
        "surfaceRenderMethod": str(getattr(material, "surface_render_method", "")),
        "animation": nla_signature(material),
        "actions": action_signature(actions_for_owner(material)),
        "drivers": driver_signature(material),
        "nodeTree": None if not material.use_nodes or material.node_tree is None else node_tree_signature(material.node_tree, set()),
    }
    assert_signature_readable(record, f"material:{material.name}")
    record["sha256"] = canonical_hash(record)
    return record


def accepted_collection_signature() -> dict[str, Any]:
    selected: dict[str, bpy.types.Collection] = {}

    def visit(collection: bpy.types.Collection) -> None:
        if collection.name in selected:
            return
        selected[collection.name] = collection
        for child in collection.children:
            visit(child)

    for root_name in cfg.ACCEPTED_CRT_COLLECTIONS:
        root = bpy.data.collections.get(root_name)
        if root is None:
            raise RuntimeError(f"missing accepted CRT collection: {root_name}")
        visit(root)

    parents: dict[str, list[str]] = {name: [] for name in selected}
    for parent in bpy.data.collections:
        for child in parent.children:
            if child.name in parents:
                parents[child.name].append(parent.name)
    for child in bpy.context.scene.collection.children:
        if child.name in parents:
            parents[child.name].append("<SCENE_MASTER>")

    records = []
    for collection in sorted(selected.values(), key=lambda row: row.name):
        records.append(
            {
                "name": collection.name,
                "parents": sorted(set(parents[collection.name])),
                "children": sorted(child.name for child in collection.children),
                "directObjects": sorted(obj.name for obj in collection.objects),
                "allObjects": sorted(obj.name for obj in collection.all_objects),
                "hideViewport": bool(collection.hide_viewport),
                "hideRender": bool(collection.hide_render),
                "hideSelect": bool(collection.hide_select),
                "instanceOffset": rna_scalar_record(collection.instance_offset),
                "properties": rna_simple_properties(collection),
                "pointerProperties": rna_pointer_properties(collection),
                "customProperties": id_custom_properties(collection),
                "animation": nla_signature(collection),
                "actions": action_signature(actions_for_owner(collection)),
                "drivers": driver_signature(collection),
            }
        )

    layer_states: list[dict[str, Any]] = []
    accepted_names = set(selected)
    for view_layer in bpy.context.scene.view_layers:
        def walk(layer_collection: bpy.types.LayerCollection, path: list[str]) -> None:
            name = layer_collection.collection.name
            next_path = [*path, name]
            if name in accepted_names:
                layer_states.append(
                    {
                        "viewLayer": view_layer.name,
                        "collection": name,
                        "path": next_path,
                        "exclude": bool(layer_collection.exclude),
                        "hideViewport": bool(layer_collection.hide_viewport),
                        "holdout": bool(layer_collection.holdout),
                        "indirectOnly": bool(layer_collection.indirect_only),
                    }
                )
            for child in layer_collection.children:
                walk(child, next_path)

        walk(view_layer.layer_collection, [])
    signature = {
        "rootCollectionNames": list(cfg.ACCEPTED_CRT_COLLECTIONS),
        "records": records,
        "layerCollectionStates": sorted(layer_states, key=lambda row: (row["viewLayer"], row["collection"], row["path"])),
    }
    assert_signature_readable(signature, "accepted-collections")
    signature["sha256"] = canonical_hash(signature)
    return signature


def accepted_crt_signature() -> dict[str, Any]:
    superseded_q_names = {"Phase4R0_QuantumQ_Body", "Phase4R0_QuantumQ_Accent"}
    objects: dict[str, bpy.types.Object] = {}
    for collection_name in cfg.ACCEPTED_CRT_COLLECTIONS:
        collection = bpy.data.collections.get(collection_name)
        if collection is None:
            raise RuntimeError(f"missing accepted CRT collection: {collection_name}")
        for obj in collection.all_objects:
            objects[obj.name] = obj
    records = []
    superseded_q_visibility = []
    for obj in sorted(objects.values(), key=lambda row: row.name):
        record = {
            "name": obj.name,
            "type": obj.type,
            "owner": owner_signature_record(obj),
            "dataOwner": None if obj.data is None else owner_signature_record(obj.data),
            "collections": sorted(collection.name for collection in obj.users_collection),
            "hideViewport": bool(obj.hide_viewport),
            "hideRender": bool(obj.hide_render),
            "materials": [] if obj.data is None or not hasattr(obj.data, "materials") else [material_signature_payload(material) for material in obj.data.materials if material is not None],
            "data": data_signature_payload(obj),
        }
        if obj.name in superseded_q_names:
            superseded_q_visibility.append({"name": obj.name, "hideRender": bool(obj.hide_render), "reason": "superseded approximate Q curve; recovered authority is already hidden and must remain unchanged"})
        record["sha256"] = canonical_hash(record)
        records.append(record)
    collection_authority = accepted_collection_signature()
    physical_summary = {
        "signatureSchema": cfg.PRESERVATION_SIGNATURE_SCHEMA,
        "persistenceVolatileRnaPropertyExclusionAuthority": cfg.PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY,
        "objectCount": len(records),
        "objectNames": [row["name"] for row in records],
        "objectHashes": {row["name"]: row["sha256"] for row in records},
        "collectionAuthority": collection_authority,
    }
    summary = {**physical_summary, "signatureFrame": int(bpy.context.scene.frame_current), "supersededOldQVisibilityState": superseded_q_visibility}
    assert_signature_readable(summary, "accepted-crt")
    summary["sha256"] = canonical_hash(physical_summary)
    return summary


def create_collection(name: str) -> bpy.types.Collection:
    if bpy.data.collections.get(name) is not None:
        raise RuntimeError(f"refusing to overwrite existing v2 collection {name}")
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def make_principled(name: str, color_hex: str, roughness: float, metallic: float = 0.0) -> bpy.types.Material:
    if bpy.data.materials.get(name) is not None:
        raise RuntimeError(f"refusing to overwrite material {name}")
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Base Color"].default_value = srgb(color_hex)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    noise = nodes.new("ShaderNodeTexNoise")
    noise.noise_dimensions = "3D"
    noise.inputs["Scale"].default_value = 18.0
    noise.inputs["Detail"].default_value = 2.0
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.08
    bump.inputs["Distance"].default_value = 0.018
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    material.diffuse_color = srgb(color_hex)
    material["phase4r1v2_palette_hex"] = color_hex.lower()
    material["phase4r1v2_no_emission"] = True
    return material


def make_current_material() -> bpy.types.Material:
    material = bpy.data.materials.new("Phase4R1V2_ExactArcLengthCurrentSurface")
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    emission = nodes.new("ShaderNodeEmission")
    info = nodes.new("ShaderNodeObjectInfo")
    normal = nodes.new("ShaderNodeNewGeometry")
    separate = nodes.new("ShaderNodeSeparateXYZ")
    mask = nodes.new("ShaderNodeMapRange")
    mask.interpolation_type = "SMOOTHERSTEP"
    mask.clamp = True
    mask.inputs["From Min"].default_value = -0.10
    mask.inputs["From Max"].default_value = 0.34
    mask.inputs["To Min"].default_value = 0.0
    mask.inputs["To Max"].default_value = 1.0
    response = nodes.new("ShaderNodeMath")
    response.operation = "MULTIPLY"
    mix = nodes.new("ShaderNodeMixShader")
    strength = nodes.new("ShaderNodeMath")
    strength.operation = "MULTIPLY"
    strength.inputs[1].default_value = 1.60
    links.new(info.outputs["Color"], emission.inputs["Color"])
    links.new(info.outputs["Alpha"], strength.inputs[0])
    links.new(strength.outputs[0], emission.inputs["Strength"])
    links.new(normal.outputs["Normal"], separate.inputs["Vector"])
    links.new(separate.outputs["Z"], mask.inputs["Value"])
    links.new(mask.outputs["Result"], response.inputs[0])
    links.new(info.outputs["Alpha"], response.inputs[1])
    links.new(response.outputs[0], mix.inputs[0])
    links.new(transparent.outputs["BSDF"], mix.inputs[1])
    links.new(emission.outputs["Emission"], mix.inputs[2])
    links.new(mix.outputs["Shader"], output.inputs["Surface"])
    if hasattr(material, "surface_render_method"):
        material.surface_render_method = "DITHERED"
    material.diffuse_color = (*srgb(cfg.PALETTE["quantum_magenta"])[:3], 0.0)
    material["phase4r1v2_palette_hex"] = cfg.PALETTE["quantum_magenta"]
    material["phase4r1v2_emission_multiplier"] = 1.60
    material["phase4r1v2_broad_upper_sheath_cap"] = True
    return material


def assign_material(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    if obj.data is not None and hasattr(obj.data, "materials"):
        obj.data.materials.clear()
        obj.data.materials.append(material)


def add_box(name: str, location: tuple[float, float, float], dimensions: tuple[float, float, float], material: bpy.types.Material, collection: bpy.types.Collection, role: str) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign_material(obj, material)
    for prior in list(obj.users_collection):
        prior.objects.unlink(obj)
    collection.objects.link(obj)
    obj["phase4r1v2_role"] = role
    return obj


def add_cylinder(name: str, location: tuple[float, float, float], radius: float, depth: float, rotation: tuple[float, float, float], material: bpy.types.Material, collection: bpy.types.Collection, role: str) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    assign_material(obj, material)
    for prior in list(obj.users_collection):
        prior.objects.unlink(obj)
    collection.objects.link(obj)
    obj["phase4r1v2_role"] = role
    return obj


def add_annular_x_mesh(
    name: str,
    axis_origin: tuple[float, float, float],
    x_offsets: list[float],
    outer_radius: float,
    inner_radius: float,
    segments: int,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    role: str,
) -> bpy.types.Object:
    if segments < 3 or outer_radius <= inner_radius or inner_radius <= 0.0 or len(x_offsets) != 2 or x_offsets[1] <= x_offsets[0]:
        raise RuntimeError(f"invalid annular mesh authority for {name}")
    vertices: list[tuple[float, float, float]] = []
    for index in range(segments):
        angle = math.tau * index / segments
        cosine, sine = math.cos(angle), math.sin(angle)
        vertices.extend(
            (
                (x_offsets[0], outer_radius * cosine, outer_radius * sine),
                (x_offsets[1], outer_radius * cosine, outer_radius * sine),
                (x_offsets[0], inner_radius * cosine, inner_radius * sine),
                (x_offsets[1], inner_radius * cosine, inner_radius * sine),
            )
        )
    faces: list[tuple[int, int, int, int]] = []
    for index in range(segments):
        current = index * 4
        following = ((index + 1) % segments) * 4
        back_outer, front_outer, back_inner, front_inner = current, current + 1, current + 2, current + 3
        next_back_outer, next_front_outer, next_back_inner, next_front_inner = following, following + 1, following + 2, following + 3
        faces.extend(
            (
                (back_outer, next_back_outer, next_front_outer, front_outer),
                (back_inner, front_inner, next_front_inner, next_back_inner),
                (front_outer, next_front_outer, next_front_inner, front_inner),
                (back_outer, back_inner, next_back_inner, next_back_outer),
            )
        )
    mesh = bpy.data.meshes.new(name + "_Data")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = axis_origin
    collection.objects.link(obj)
    mesh.materials.append(material)
    obj["phase4r1v2_role"] = role
    obj["phase4r1v2_annular_axis"] = "+X"
    obj["phase4r1v2_annular_segments"] = segments
    obj["phase4r1v2_annular_outer_radius_m"] = outer_radius
    obj["phase4r1v2_annular_inner_radius_m"] = inner_radius
    obj["phase4r1v2_annular_x_min_offset_m"] = x_offsets[0]
    obj["phase4r1v2_annular_x_max_offset_m"] = x_offsets[1]
    return obj


def add_curve(name: str, points: list[Vector], bevel_depth: float, material: bpy.types.Material, collection: bpy.types.Collection, role: str) -> bpy.types.Object:
    data = bpy.data.curves.new(name + "_Data", type="CURVE")
    data.dimensions = "3D"
    data.resolution_u = 1
    data.bevel_depth = bevel_depth
    data.bevel_resolution = 5
    data.resolution_u = 1
    data.use_fill_caps = True
    spline = data.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for target, point in zip(spline.points, points):
        target.co = (*point, 1.0)
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    data.materials.append(material)
    obj["phase4r1v2_role"] = role
    return obj


def contact_bevel_profile() -> bpy.types.Object:
    """Return one Z-up 54 mm sheath profile with a real flat underside."""
    existing = bpy.data.objects.get("Phase4R1V2_WeightedSheathContactProfile")
    if existing is not None:
        return existing
    collection = create_collection("PHASE4R1V2_INVISIBLE_TECHNICAL_HELPERS")
    data = bpy.data.curves.new("Phase4R1V2_WeightedSheathContactProfile_Data", type="CURVE")
    data.dimensions = "2D"
    data.resolution_u = 1
    spline = data.splines.new("POLY")
    # Profile X is lateral width and Y is world-up under Z_UP curve twist.
    # The two bottom vertices form a physical 28 mm contact flat at -29 mm.
    coordinates = (
        (-0.014, -0.029),
        (0.014, -0.029),
        (0.022, -0.024),
        (0.027, -0.012),
        (0.027, 0.008),
        (0.021, 0.021),
        (0.010, 0.027),
        (0.000, 0.029),
        (-0.010, 0.027),
        (-0.021, 0.021),
        (-0.027, 0.008),
        (-0.027, -0.012),
        (-0.022, -0.024),
    )
    spline.points.add(len(coordinates) - 1)
    for point, (x_value, y_value) in zip(spline.points, coordinates):
        point.co = (x_value, y_value, 0.0, 1.0)
    spline.use_cyclic_u = True
    obj = bpy.data.objects.new("Phase4R1V2_WeightedSheathContactProfile", data)
    collection.objects.link(obj)
    obj.hide_render = True
    obj.hide_viewport = True
    obj["phase4r1v2_invisible_helper"] = True
    obj["phase4r1v2_profile_flat_width_m"] = 0.028
    obj["phase4r1v2_profile_bottom_offset_m"] = -0.029
    obj["phase4r1v2_profile_top_offset_m"] = 0.029
    return obj


def cubic(a: Vector, b: Vector, c: Vector, d: Vector, count: int) -> list[Vector]:
    values: list[Vector] = []
    for index in range(count):
        t = index / (count - 1)
        u = 1.0 - t
        values.append(a * (u ** 3) + b * (3.0 * u * u * t) + c * (3.0 * u * t * t) + d * (t ** 3))
    return values


def append_unique(target: list[Vector], values: Iterable[Vector]) -> None:
    for value in values:
        if not target or (target[-1] - value).length > 1e-9:
            target.append(value.copy())


def original_spiral(family: str, spec: dict[str, Any]) -> list[Vector]:
    obj = bpy.data.objects[spec["source_object"]]
    spline = obj.data.splines[0]
    start = int(spec["spiral_start_index"])
    end = start + int(spec["spiral_samples"])
    if spline.type != "POLY" or len(spline.points) < end:
        raise RuntimeError(f"{family} recovered spiral authority is incomplete")
    return [obj.matrix_world @ Vector(point.co[:3]) for point in spline.points[start:end]]


def rounded_coordinate_authority(points: list[Vector]) -> dict[str, Any]:
    payload = [[round(float(value), 8) for value in point] for point in points]
    encoded = json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return {
        "pointCount": len(points),
        "bytes": len(encoded),
        "sha256": hashlib.sha256(encoded).hexdigest(),
        "method": "compact JSON array of world XYZ coordinates rounded to 8 decimals",
    }


def rounded_coordinate_authority_at_precision(points: list[Vector], decimals: int) -> dict[str, Any]:
    payload = [[round(float(value), decimals) for value in point] for point in points]
    encoded = json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return {
        "pointCount": len(points),
        "bytes": len(encoded),
        "sha256": hashlib.sha256(encoded).hexdigest(),
        "method": f"compact JSON array of world XYZ coordinates rounded to {decimals} decimals",
    }


def mobile_floor_lead(entry: Vector, spiral: list[Vector]) -> tuple[list[Vector], dict[str, Any]]:
    authority = cfg.MOBILE_FLOOR_LEAD_AUTHORITY
    first_controls = [Vector(values) for values in authority["firstCubicControlsWorldMeters"]]
    second_controls = [Vector(values) for values in authority["secondCubicControlsWorldMeters"]]
    realization_tolerance = float(cfg.MOBILE_REFINED_ROUTE["requiredMaximumBlenderRealizationErrorMeters"])
    endpoint_errors = {
        "floorEntryMeters": (first_controls[0] - entry).length,
        "sharedWaypointMeters": (first_controls[3] - second_controls[0]).length,
        "spiralStartMeters": (second_controls[3] - spiral[0]).length,
    }
    if any(not math.isfinite(value) or value > realization_tolerance for value in endpoint_errors.values()):
        raise RuntimeError({"message": "mobile two-cubic floor-lead endpoints do not match the live route authority", "errorsMeters": endpoint_errors})
    left_waypoint_handle = first_controls[3] - first_controls[2]
    right_waypoint_handle = second_controls[1] - second_controls[0]
    expected_waypoint_handle = Vector(authority["waypointTangentControlVectorMeters"])
    c1_continuity_error = (left_waypoint_handle - right_waypoint_handle).length
    left_handle_authority_error = (left_waypoint_handle - expected_waypoint_handle).length
    right_handle_authority_error = (right_waypoint_handle - expected_waypoint_handle).length
    if max(c1_continuity_error, left_handle_authority_error, right_handle_authority_error) > realization_tolerance:
        raise RuntimeError("mobile two-cubic floor-lead C1 waypoint authority did not reproduce")
    first_count = int(authority["firstCubicInclusiveSampleCount"])
    second_count = int(authority["secondCubicInclusiveSampleCount"])
    first_points = cubic(*first_controls, first_count)
    second_points = cubic(*second_controls, second_count)
    lead = [*first_points, *second_points[1:]]
    coordinate_authority = rounded_coordinate_authority_at_precision(lead, 12)
    if (
        len(lead) != int(authority["deduplicatedLeadPointCount"])
        or coordinate_authority["bytes"] != int(authority["leadCoordinateBytes"])
        or coordinate_authority["sha256"] != authority["leadCoordinateSha256"]
    ):
        raise RuntimeError({"message": "mobile two-cubic floor-lead coordinates did not reproduce", "actual": coordinate_authority, "expected": authority})
    entry_tangent = (first_controls[1] - first_controls[0]).normalized()
    spiral_tangent = (spiral[1] - spiral[0]).normalized()
    terminal_handle = (second_controls[3] - second_controls[2]).normalized()
    return lead, {
        "schema": authority["schema"],
        "topology": authority["topology"],
        "stage2CandidateDigestSha256": authority["stage2CandidateDigestSha256"],
        "controlPointsWorldMeters": {
            "firstCubic": [[float(value) for value in point] for point in first_controls],
            "secondCubic": [[float(value) for value in point] for point in second_controls],
        },
        "inclusiveSampleCounts": [first_count, second_count],
        "deduplicatedLeadPointCount": len(lead),
        "waypointLeadLocalIndex": int(authority["waypointLeadLocalIndex"]),
        "waypointWorldMeters": [float(value) for value in first_controls[3]],
        "waypointTangentControlVectorMeters": [float(value) for value in right_waypoint_handle],
        "c1ContinuityErrorMeters": c1_continuity_error,
        "leftWaypointHandleAuthorityErrorMeters": left_handle_authority_error,
        "rightWaypointHandleAuthorityErrorMeters": right_handle_authority_error,
        "entryTangentDotPositiveX": entry_tangent.dot(Vector((1.0, 0.0, 0.0))),
        "spiralApproachTangentDot": terminal_handle.dot(spiral_tangent),
        "endpointRealizationErrorsMeters": endpoint_errors,
        "leadCoordinateAuthority": coordinate_authority,
        "verifiedVisibleLeadArcLengthMeters": float(authority["verifiedVisibleLeadArcLengthMeters"]),
        "requiredMinimumVisibleLeadArcLengthMeters": float(authority["requiredMinimumVisibleLeadArcLengthMeters"]),
        "stage2VerificationAuthority": {
            "externalRecoveryId": authority["stage2EvidenceExternalRecoveryId"],
            "evidenceEnvelopeBytes": int(authority["stage2EvidenceEnvelopeBytes"]),
            "evidenceEnvelopeSha256": authority["stage2EvidenceEnvelopeSha256"],
            "minimumClearanceMeters": float(authority["stage2VerifiedMinimumClearanceMeters"]),
            "minimumBendRadiusMeters": float(authority["stage2VerifiedMinimumBendRadiusMeters"]),
            "contactCount": int(authority["stage2VerifiedContactCount"]),
            "properPlanarCrossingCount": int(authority["stage2VerifiedProperPlanarCrossingCount"]),
            "routePointCount": int(authority["stage2VerifiedRoutePointCount"]),
            "minimumClearanceSegmentPair": [int(value) for value in authority["stage2VerifiedMinimumClearanceSegmentPair"]],
        },
    }


def rotate_xy(vector: Vector, angle: float) -> Vector:
    cosine, sine = math.cos(angle), math.sin(angle)
    return Vector((vector.x * cosine - vector.y * sine, vector.x * sine + vector.y * cosine, 0.0))


def left_arc_points(start: Vector, direction: Vector, radius: float, angle: float, count: int) -> tuple[list[Vector], Vector]:
    heading = Vector((direction.x, direction.y, 0.0)).normalized()
    centre = Vector((start.x, start.y, 0.0)) + Vector((-heading.y, heading.x, 0.0)) * radius
    radial = Vector((start.x, start.y, 0.0)) - centre
    points = [centre + rotate_xy(radial, angle * index / (count - 1)) for index in range(count)]
    return points, rotate_xy(heading, angle).normalized()


def mobile_lsl_floor_transition(spiral: list[Vector]) -> tuple[list[list[Vector]], dict[str, Any]]:
    authority = cfg.MOBILE_REFINED_ROUTE
    prefix_count = int(authority["preservedPrefixPointCount"])
    if len(spiral) < prefix_count:
        raise RuntimeError("recovered mobile spiral is shorter than the approved preserved prefix")
    prefix = [point.copy() for point in spiral[:prefix_count]]
    prefix_record = rounded_coordinate_authority(prefix)
    if (
        prefix_record["bytes"] != authority["preservedPrefixRoundedCoordinateBytes"]
        or prefix_record["sha256"] != authority["preservedPrefixRoundedCoordinateSha256"]
    ):
        raise RuntimeError({"message": "live recovered mobile prefix differs from the exact approved authority", "actual": prefix_record, "expected": authority})
    start = prefix[-1]
    retained_tangent = (prefix[-1] - prefix[-2]).normalized()
    radius = float(authority["floorTransitionRadiusMeters"])
    turn1, straight_parameter, turn2 = (float(value) for value in authority["floorTransitionParameters"])
    count1, count_straight, count2 = (int(value) for value in authority["floorTransitionInclusivePrimitiveSampleCounts"])
    arc1, middle_heading = left_arc_points(start, retained_tangent, radius, turn1, count1)
    straight_length = radius * straight_parameter
    analytic_primitive_lengths = [radius * turn1, straight_length, radius * turn2]
    straight_end = arc1[-1] + middle_heading * straight_length
    straight = [arc1[-1].lerp(straight_end, index / (count_straight - 1)) for index in range(count_straight)]
    arc2, end_heading = left_arc_points(straight[-1], middle_heading, radius, turn2, count2)
    combined = [*arc1, *straight[1:], *arc2[1:]]
    expected_end = Vector(authority["floorTransitionEndWorldMeters"])
    expected_heading = Vector((math.cos(math.radians(float(authority["floorTransitionEndYawDegrees"]))), math.sin(math.radians(float(authority["floorTransitionEndYawDegrees"]))), 0.0))
    analytic_endpoint_xy_error = (Vector((combined[-1].x, combined[-1].y, 0.0)) - Vector((expected_end.x, expected_end.y, 0.0))).length
    analytic_terminal_heading_dot = end_heading.dot(expected_heading)
    required_maximum_analytic_endpoint_xy_error = float(authority["requiredMaximumAnalyticEndpointXYErrorMeters"])
    if analytic_endpoint_xy_error > required_maximum_analytic_endpoint_xy_error or analytic_terminal_heading_dot < 0.999999999:
        raise RuntimeError("approved mobile LSL analytic endpoint or terminal heading did not reproduce")
    combined[-1].x = expected_end.x
    combined[-1].y = expected_end.y
    xy_cumulative = [0.0]
    for left, right in zip(combined, combined[1:]):
        xy_cumulative.append(xy_cumulative[-1] + math.hypot(right.x - left.x, right.y - left.y))
    sampled_length = xy_cumulative[-1]
    start_z, end_z = float(start.z), float(expected_end.z)
    start_slope = float(retained_tangent.z)
    for point, distance in zip(combined, xy_cumulative):
        u = distance / sampled_length
        h00 = 2.0 * u ** 3 - 3.0 * u ** 2 + 1.0
        h10 = u ** 3 - 2.0 * u ** 2 + u
        h01 = -2.0 * u ** 3 + 3.0 * u ** 2
        point.z = h00 * start_z + h10 * start_slope * sampled_length + h01 * end_z
    combined[0] = start.copy()
    combined[-1] = expected_end.copy()
    if len(combined) != int(authority["floorTransitionExpectedSampledPointCount"]):
        raise RuntimeError("approved mobile LSL sample schedule did not reproduce")
    join1 = count1 - 1
    join2 = join1 + count_straight - 1
    primitives = [combined[: join1 + 1], combined[join1 : join2 + 1], combined[join2:]]
    sampled_z_values = [float(point.z) for point in combined]
    floor_transition_absolute_turns = float(preflight.polar_angular_travel(combined)["absoluteTurns"])
    expected_floor_transition_absolute_turns = float(authority["floorTransitionExpectedAbsoluteTurns"])
    floor_transition_absolute_turn_error = abs(floor_transition_absolute_turns - expected_floor_transition_absolute_turns)
    return primitives, {
        "preservedPrefix": prefix_record,
        "preservedPrefixExpectedAbsoluteTurns": authority["preservedPrefixExpectedAbsoluteTurns"],
        "floorTransitionType": authority["floorTransitionType"],
        "radiusMeters": radius,
        "parameters": [turn1, straight_parameter, turn2],
        "analyticPrimitiveLengthsMeters": analytic_primitive_lengths,
        "analyticTotalLengthMeters": sum(analytic_primitive_lengths),
        "inclusivePrimitiveSampleCounts": [count1, count_straight, count2],
        "deduplicatedPointCount": len(combined),
        "sampledLengthMeters": sampled_length,
        "maximumChordMeters": max((right - left).length for left, right in zip(combined, combined[1:])),
        "sampledMinimumZMeters": min(sampled_z_values),
        "sampledMaximumZMeters": max(sampled_z_values),
        "maximumFloorCentreErrorMeters": max(abs(value - float(expected_end.z)) for value in sampled_z_values),
        "floorTransitionAbsoluteTurns": floor_transition_absolute_turns,
        "expectedFloorAbsoluteTurns": expected_floor_transition_absolute_turns,
        "floorTransitionAbsoluteTurnRealizationErrorTurns": floor_transition_absolute_turn_error,
        "requiredMaximumFloorTransitionAbsoluteTurnRealizationErrorTurns": float(authority["requiredMaximumFloorTransitionAbsoluteTurnRealizationErrorTurns"]),
        "expectedFloorSignedTurns": authority["floorTransitionExpectedSignedTurns"],
        "expectedFinishedReadableMinimumAbsoluteTurns": authority["finishedReadableMinimumAbsoluteTurns"],
        "retainedPrefixTerminalWorldMeters": [float(value) for value in start],
        "retainedPrefixTerminalUnitTangent": [float(value) for value in retained_tangent],
        "floorTransitionEndWorldMeters": [float(value) for value in expected_end],
        "floorTransitionEndYawDegrees": authority["floorTransitionEndYawDegrees"],
        "analyticEndpointXYErrorMeters": analytic_endpoint_xy_error,
        "analyticTerminalHeadingDot": analytic_terminal_heading_dot,
        "requiredMaximumAnalyticEndpointXYErrorMeters": required_maximum_analytic_endpoint_xy_error,
        "requiredMaximumBlenderRealizationErrorMeters": float(authority["requiredMaximumBlenderRealizationErrorMeters"]),
        "zInterpolation": "cubic Hermite over sampled cumulative XY length; recovered seam dz/ds and zero terminal dz/ds",
        "zInterpolationSampledTotalLengthMeters": sampled_length,
        "zInterpolationStartDzDs": start_slope,
    }


def authored_floor_tail_and_lift(family: str, spiral: list[Vector], rear_endpoint: Vector) -> tuple[list[Vector], dict[str, Any]]:
    """Return the independently clearance-tested floor tail and short CRT lift.

    Desktop and landscape use their complete recovered spirals.  Mobile keeps
    the exact approved 482-point recovered prefix and continues through the
    exact clearance-verified 180 mm LSL floor transition.  No elevated
    recovered cradle tail is reused.
    """
    floor = cfg.FLOOR_CABLE_CENTRE_Z_M
    values: list[Vector] = []
    joins: list[int] = []
    segments: list[dict[str, Any]] = []
    mobile_route_authority: dict[str, Any] | None = None
    spiral_endpoint = spiral[-1]

    def add_segment(kind: str, points: Iterable[Vector], support: str) -> None:
        start_index = 0 if not values else len(values) - 1
        append_unique(values, points)
        end_index = len(values) - 1
        joins.append(end_index)
        segments.append({"kind": kind, "startIndex": start_index, "endIndex": end_index, "support": support})

    if family == "desktop":
        first = Vector((-0.170186996, 0.807071984, floor))
        lift_start = Vector((0.614999950, 1.141999960, floor))
        add_segment("desktop-floor-bend-1", cubic(spiral_endpoint, Vector((-0.423159838, 1.444236636, 0.028536964)), Vector((-0.436519682, 0.880933940, floor)), first, 129), "floor")
        add_segment("desktop-floor-bend-2", cubic(first, Vector((0.117910206, 0.727174044, floor)), Vector((0.172081947, 1.141999960, floor)), lift_start, 97), "floor")
        lift_end = Vector((rear_endpoint.x, 0.902000010, rear_endpoint.z))
        add_segment("desktop-terminal-lift", cubic(lift_start, Vector((0.747548282, 1.141999960, floor)), Vector((rear_endpoint.x, 1.034548402, rear_endpoint.z)), lift_end, 81), "accepted CRT cabinet")
    elif family == "landscape":
        first = Vector((1.161921978, 0.358927995, floor))
        lift_start = Vector((0.614999950, 1.141999960, floor))
        add_segment("landscape-floor-bend-1", cubic(spiral_endpoint, Vector((1.979273200, 0.422950834, 0.030048231)), Vector((1.679182887, 0.363597512, floor)), first, 129), "floor")
        add_segment("landscape-floor-bend-2", cubic(first, Vector((0.259390771, 0.350780517, floor)), Vector((0.285902947, 1.141999960, floor)), lift_start, 129), "floor")
        lift_end = Vector((rear_endpoint.x, 0.902000010, rear_endpoint.z))
        add_segment("landscape-terminal-lift", cubic(lift_start, Vector((0.747548282, 1.141999960, floor)), Vector((rear_endpoint.x, 1.034548402, rear_endpoint.z)), lift_end, 81), "accepted CRT cabinet")
    elif family == "mobile":
        primitives, mobile_route_authority = mobile_lsl_floor_transition(spiral)
        for kind, primitive in zip(("mobile-lsl-left-arc-1", "mobile-lsl-straight", "mobile-lsl-left-arc-2"), primitives):
            add_segment(kind, primitive, "floor")
        lift_start = Vector(cfg.MOBILE_REFINED_ROUTE["floorTransitionEndWorldMeters"])
        lift_end = Vector(cfg.MOBILE_REFINED_ROUTE["axialSeatStartWorldMeters"])
        lift_control1 = Vector(cfg.MOBILE_REFINED_ROUTE["terminalLiftControl1WorldMeters"])
        lift_control2 = Vector(cfg.MOBILE_REFINED_ROUTE["terminalLiftControl2WorldMeters"])
        add_segment("mobile-terminal-lift", cubic(lift_start, lift_control1, lift_control2, lift_end, int(cfg.MOBILE_REFINED_ROUTE["terminalLiftInclusiveSampleCount"])), "accepted CRT cabinet")
    else:
        raise RuntimeError(f"unknown refined cable family: {family}")
    axial_start_index = len(values) - 1
    axial_samples = int(cfg.MOBILE_REFINED_ROUTE["axialSeatInclusiveSampleCount"]) if family == "mobile" else 49
    add_segment(f"{family}-terminal-axial-corridor", [lift_end.lerp(rear_endpoint, index / (axial_samples - 1)) for index in range(axial_samples)], "accepted CRT strain-relief axis")
    if family == "mobile" and mobile_route_authority is not None:
        terminal_start = next(row["startIndex"] for row in segments if row["kind"] == "mobile-terminal-lift")
        terminal_points = values[terminal_start:]
        mobile_route_authority["terminalAuthority"] = {
            "liftStartWorldMeters": [float(value) for value in lift_start],
            "liftControl1WorldMeters": [float(value) for value in lift_control1],
            "liftControl2WorldMeters": [float(value) for value in lift_control2],
            "axialSeatStartWorldMeters": [float(value) for value in lift_end],
            "rearSeatWorldMeters": [float(value) for value in rear_endpoint],
            "liftInclusiveSampleCount": int(cfg.MOBILE_REFINED_ROUTE["terminalLiftInclusiveSampleCount"]),
            "axialInclusiveSampleCount": axial_samples,
            "sampledArcLengthMeters": sum((right - left).length for left, right in zip(terminal_points, terminal_points[1:])),
            "horizontalSpanMeters": math.hypot(terminal_points[-1].x - terminal_points[0].x, terminal_points[-1].y - terminal_points[0].y),
            "riseMeters": max(point.z for point in terminal_points) - cfg.FLOOR_CABLE_CENTRE_Z_M,
            "axialSeatLengthMeters": (rear_endpoint - lift_end).length,
            "endpointUnitTangent": [float(value) for value in (terminal_points[-1] - terminal_points[-2]).normalized()],
        }
    # The last join is the route endpoint, not an interior curvature join.
    return values, {
        "terminalLiftStartLocalIndex": next(row["startIndex"] for row in segments if row["kind"].endswith("terminal-lift")),
        "axialCorridorStartLocalIndex": axial_start_index,
        "interiorJoinLocalIndices": joins[:-1],
        "segments": segments,
        "mobileRefinedRouteAuthority": mobile_route_authority,
    }


def derive_rear_seat() -> dict[str, Any]:
    rib = bpy.data.objects["CRT_StrainReliefRib_06"]
    bounds = preflight.bounds_world(rib)
    center = rib.matrix_world.translation
    endpoint = Vector((center.x, bounds["y"][1] + 0.0025, center.z))
    return {
        "object": rib.name,
        "objectCenterWorldMeters": [float(value) for value in center],
        "objectBoundsWorldMeters": bounds,
        "derivedCableCenterEndpointWorldMeters": [float(value) for value in endpoint],
        "derivation": "accepted rib-06 maxY + 2.5 mm axial centre offset; 27 mm cable radius creates restrained physical overlap",
        "endpoint": endpoint,
    }


def build_route(family: str, spec: dict[str, Any], rear_endpoint: Vector) -> tuple[list[Vector], dict[str, Any]]:
    recovered_spiral = original_spiral(family, spec)
    spiral = recovered_spiral[: int(cfg.MOBILE_REFINED_ROUTE["preservedPrefixPointCount"])] if family == "mobile" else recovered_spiral
    floor = cfg.FLOOR_CABLE_CENTRE_Z_M
    source = Vector(cfg.PERIMETER_SOURCE_WORLD_M)
    entry = Vector(cfg.PERIMETER_FLOOR_ENTRY_WORLD_M)
    entry.z = floor
    route: list[Vector] = []
    append_unique(route, cubic(source, source + Vector((0.34, 0.0, 0.0)), entry - Vector((0.38, 0.0, 0.0)), entry, 49))
    floor_start = len(route) - 1
    tangent = (spiral[1] - spiral[0]).normalized()
    lead_tangent_control = float(cfg.LEAD_APPROACH_TANGENT_CONTROL_M[family])
    lead_topology_authority: dict[str, Any] | None = None
    if family == "mobile":
        lead_points, lead_topology_authority = mobile_floor_lead(entry, spiral)
        append_unique(route, lead_points)
    else:
        append_unique(route, cubic(entry, entry + Vector((4.20, 0.0, 0.0)), spiral[0] - tangent * lead_tangent_control, spiral[0], 121))
    spiral_start = len(route) - 1
    append_unique(route, spiral)
    spiral_end = len(route) - 1
    tail, tail_metadata = authored_floor_tail_and_lift(family, spiral, rear_endpoint)
    tail_base = len(route) - 1
    append_unique(route, tail)
    terminal_lift_start = tail_base + int(tail_metadata["terminalLiftStartLocalIndex"])
    axial_corridor_start_index = tail_base + int(tail_metadata["axialCorridorStartLocalIndex"])
    tail_join_indices = [spiral_end, *(tail_base + int(index) for index in tail_metadata["interiorJoinLocalIndices"])]
    join_indices = (
        [floor_start, floor_start + int(cfg.MOBILE_FLOOR_LEAD_AUTHORITY["waypointLeadLocalIndex"]), spiral_start, *tail_join_indices]
        if family == "mobile"
        else tail_join_indices
    )
    if family == "mobile":
        route_authority = tail_metadata["mobileRefinedRouteAuthority"]
        if route_authority is None or lead_topology_authority is None:
            raise RuntimeError("mobile refined route authority was not emitted")
        coordinate_records = {
            "sourceServiceTransition": rounded_coordinate_authority_at_precision(route[: floor_start + 1], 12),
            "floorLead": rounded_coordinate_authority_at_precision(route[floor_start : spiral_start + 1], 12),
            "preservedSpiralAndTail": rounded_coordinate_authority_at_precision(route[spiral_start:], 12),
            "fullRoute": rounded_coordinate_authority_at_precision(route, 12),
        }
        expected_coordinate_hashes = {
            "sourceServiceTransition": cfg.MOBILE_FLOOR_LEAD_AUTHORITY["sourceServiceTransitionCoordinateSha256"],
            "floorLead": cfg.MOBILE_FLOOR_LEAD_AUTHORITY["leadCoordinateSha256"],
            "preservedSpiralAndTail": cfg.MOBILE_FLOOR_LEAD_AUTHORITY["preservedSpiralAndTailCoordinateSha256"],
            "fullRoute": cfg.MOBILE_FLOOR_LEAD_AUTHORITY["fullRouteCoordinateSha256"],
        }
        coordinate_hash_checks = {key: coordinate_records[key]["sha256"] == expected for key, expected in expected_coordinate_hashes.items()}
        if not all(coordinate_hash_checks.values()):
            raise RuntimeError({"message": "mobile two-cubic route coordinate preservation failed", "records": coordinate_records, "checks": coordinate_hash_checks})
        lead_topology_authority["globalIndexAuthority"] = {
            "floorEntry": floor_start,
            "waypoint": floor_start + int(cfg.MOBILE_FLOOR_LEAD_AUTHORITY["waypointLeadLocalIndex"]),
            "spiralStart": spiral_start,
            "leadPointCount": spiral_start - floor_start + 1,
            "routePointCount": len(route),
            "joinIndices": join_indices,
        }
        lead_topology_authority["coordinateAuthorities"] = coordinate_records
        lead_topology_authority["coordinateAuthorityChecks"] = coordinate_hash_checks
        lead_topology_authority["preservedInvariants"] = {
            "sourceServiceTransitionUnchanged": coordinate_hash_checks["sourceServiceTransition"],
            "preservedSpiralAndTailUnchanged": coordinate_hash_checks["preservedSpiralAndTail"],
            "fullRouteMatchesStage2Authority": coordinate_hash_checks["fullRoute"],
        }
        route_authority["floorLeadTopologyAuthority"] = lead_topology_authority
        route_authority["globalIndexAuthority"] = {
            "sourceLeadPointCountThroughSpiralStartInclusive": spiral_start + 1,
            "sourceLeadPointCountStrictlyBeforeSpiralStart": spiral_start,
            "spiralStart": spiral_start,
            "preservedPrefixEnd": spiral_end,
            "joinIndices": join_indices,
            "fullRoutePointCount": len(route),
        }
    return route, {
        "floorStart": floor_start,
        "floorEnd": terminal_lift_start,
        "spiralStart": spiral_start,
        "spiralEnd": spiral_end,
        "terminalLiftStart": terminal_lift_start,
        "axialCorridorStart": axial_corridor_start_index,
        "joinIndices": join_indices,
        "tailSegments": tail_metadata["segments"],
        "leadApproachTangentControlMeters": lead_tangent_control,
        "leadTopologyAuthority": lead_topology_authority,
        "mobileRefinedRouteAuthority": tail_metadata["mobileRefinedRouteAuthority"],
    }


def cumulative_lengths(points: list[Vector]) -> list[float]:
    values = [0.0]
    for left, right in zip(points, points[1:]):
        values.append(values[-1] + (right - left).length)
    return values


def point_at_distance(points: list[Vector], cumulative: list[float], distance: float) -> tuple[Vector, int]:
    distance = min(max(0.0, distance), cumulative[-1])
    low, high = 0, len(cumulative) - 1
    while low + 1 < high:
        mid = (low + high) // 2
        if cumulative[mid] <= distance:
            low = mid
        else:
            high = mid
    span = cumulative[low + 1] - cumulative[low]
    factor = 0.0 if span <= 1e-12 else (distance - cumulative[low]) / span
    return points[low].lerp(points[low + 1], factor), low


def slice_distance(points: list[Vector], cumulative: list[float], start: float, end: float) -> list[Vector]:
    first, left_index = point_at_distance(points, cumulative, start)
    last, right_index = point_at_distance(points, cumulative, end)
    result = [first]
    for index in range(left_index + 1, right_index + 1):
        if cumulative[index] < end - 1e-10:
            result.append(points[index].copy())
    if (result[-1] - last).length > 1e-9:
        result.append(last)
    if len(result) < 2:
        result.append(last)
    return result


def set_linear(owner: Any, data_paths: set[str]) -> None:
    action = None if owner.animation_data is None else owner.animation_data.action
    if action is None:
        return
    for curve in iter_action_fcurves(action):
        if curve.data_path in data_paths:
            for point in curve.keyframe_points:
                point.interpolation = "LINEAR"


def build_cable_family(family: str, spec: dict[str, Any], materials: dict[str, bpy.types.Material], rear_endpoint: Vector) -> dict[str, Any]:
    collection = create_collection(spec["collection"])
    route, indices = build_route(family, spec, rear_endpoint)
    sheath = add_curve(f"Phase4R1V2_{family.title()}_ContinuousGraphiteSheath", route, cfg.CABLE_DIAMETER_M * 0.5, materials["cable"], collection, f"{family} one continuous perimeter-to-CRT spiral cable")
    sheath.data.bevel_mode = "OBJECT"
    sheath.data.bevel_object = contact_bevel_profile()
    sheath.data.twist_mode = "Z_UP"
    sheath.data.use_fill_caps = True
    sheath["phase4r1v2_family"] = family
    sheath["phase4r1v2_floor_start_index"] = indices["floorStart"]
    sheath["phase4r1v2_floor_end_index"] = indices["floorEnd"]
    sheath["phase4r1v2_spiral_start_index"] = indices["spiralStart"]
    sheath["phase4r1v2_spiral_end_index"] = indices["spiralEnd"]
    sheath["phase4r1v2_terminal_lift_start_index"] = indices["terminalLiftStart"]
    sheath["phase4r1v2_axial_corridor_start_index"] = indices["axialCorridorStart"]
    sheath["phase4r1v2_dense_join_indices"] = indices["joinIndices"]
    sheath["phase4r1v2_lead_approach_tangent_control_m"] = indices["leadApproachTangentControlMeters"]
    sheath["phase4r1v2_tail_segment_authority_json"] = json.dumps(indices["tailSegments"], sort_keys=True, separators=(",", ":"))
    if indices["leadTopologyAuthority"] is not None:
        sheath["phase4r1v2_mobile_floor_lead_topology_authority_json"] = json.dumps(indices["leadTopologyAuthority"], sort_keys=True, separators=(",", ":"))
    if indices["mobileRefinedRouteAuthority"] is not None:
        sheath["phase4r1v2_mobile_refined_route_authority_json"] = json.dumps(indices["mobileRefinedRouteAuthority"], sort_keys=True, separators=(",", ":"))
    sheath["phase4r1v2_contact_profile"] = "54 mm weighted black sheath with real 28 mm flat underside; Z-up custom bevel reaches the proving-hall floor"
    cumulative = cumulative_lengths(route)
    total = cumulative[-1]
    front_duration = max(3, round((cfg.CONDUCTION_END - cfg.CONDUCTION_START) * cfg.CURRENT_FRONT_WIDTH_FRACTION))
    trail_rgb = srgb(cfg.PALETTE["quantum_magenta"])
    front_rgb = srgb(cfg.PALETTE["quantum_accent"])
    for index in range(int(spec["segments"])):
        start = total * index / int(spec["segments"])
        end = total * (index + 1) / int(spec["segments"])
        overlap_per_side = 0.01188
        geometry_start = max(0.0, start - overlap_per_side)
        geometry_end = min(total, end + overlap_per_side)
        segment_points = slice_distance(route, cumulative, geometry_start, geometry_end)
        current = add_curve(f"Phase4R1V2_{family.title()}_Current_{index:03d}", segment_points, cfg.CURRENT_OVERLAY_RADIUS_M, materials["current"], collection, f"{family} exact arc-length overlapping luminous upper-sheath segment")
        current.data.bevel_resolution = cfg.CURRENT_OVERLAY_BEVEL_RESOLUTION
        current.data.use_fill_caps = False
        arrival = round(cfg.CONDUCTION_START + index / max(1, int(spec["segments"]) - 1) * (cfg.CONDUCTION_END - cfg.CONDUCTION_START))
        current["phase4r1v2_family"] = family
        current["phase4r1v2_current_segment"] = True
        current["phase4r1v2_segment_index"] = index
        current["phase4r1v2_arrival_frame"] = arrival
        current["phase4r1v2_arc_start_m"] = start
        current["phase4r1v2_arc_end_m"] = end
        current["phase4r1v2_geometry_arc_start_m"] = geometry_start
        current["phase4r1v2_geometry_arc_end_m"] = geometry_end
        current["phase4r1v2_overlap_per_side_m"] = overlap_per_side
        current["phase4r1v2_overlay_radius_m"] = cfg.CURRENT_OVERLAY_RADIUS_M
        current["phase4r1v2_overlay_bevel_resolution"] = cfg.CURRENT_OVERLAY_BEVEL_RESOLUTION
        current["phase4r1v2_minimum_top_surface_separation_m"] = cfg.CURRENT_OVERLAY_MIN_TOP_SEPARATION_M
        for frame, color in (
            (1, (*trail_rgb[:3], 0.0)),
            (45, (*trail_rgb[:3], 0.0)),
            (max(45, arrival - 1), (*trail_rgb[:3], 0.0)),
            (arrival, (*front_rgb[:3], 1.0)),
            (min(500, arrival + front_duration), (*trail_rgb[:3], 0.44)),
            (500, (*trail_rgb[:3], 0.44)),
        ):
            current.color = color
            current.keyframe_insert(data_path="color", frame=frame)
        set_linear(current, {"color"})
    for site, progress in enumerate((0.18, 0.42, 0.68, 0.90)):
        point, _ = point_at_distance(route, cumulative, total * progress)
        light_data = bpy.data.lights.new(f"Phase4R1V2_{family.title()}_LocalResponse_{site:02d}_Data", type="POINT")
        light_data.color = srgb(cfg.PALETTE["quantum_magenta"])[:3]
        light_data.shadow_soft_size = 0.55
        light_data.energy = 0.0
        light = bpy.data.objects.new(f"Phase4R1V2_{family.title()}_LocalResponse_{site:02d}", light_data)
        light.location = point + Vector((0.0, 0.0, 0.18))
        collection.objects.link(light)
        arrival = round(cfg.CONDUCTION_START + progress * (cfg.CONDUCTION_END - cfg.CONDUCTION_START))
        for frame, energy in ((1, 0.0), (45, 0.0), (arrival - 1, 0.0), (arrival, 18.0), (arrival + front_duration, 4.0), (500, 4.0)):
            light_data.energy = energy
            light_data.keyframe_insert(data_path="energy", frame=frame)
        set_linear(light_data, {"energy"})
        light["phase4r1v2_family"] = family
        light["phase4r1v2_local_reflection_contribution"] = True
    return {
        "family": family,
        "collection": collection.name,
        "routePointCount": len(route),
        "lengthMeters": round(total, 6),
        "spiralSourceObject": spec["source_object"],
        "recoveredSpiralPointCount": spec["spiral_samples"],
        "preservedSpiralPointCount": indices["spiralEnd"] - indices["spiralStart"] + 1,
        "leadApproachTangentControlMeters": indices["leadApproachTangentControlMeters"],
        "leadTopologyAuthority": indices["leadTopologyAuthority"],
        "mobileRefinedRouteAuthority": indices["mobileRefinedRouteAuthority"],
        "currentSegmentCount": spec["segments"],
        "frontWidthNormalized": cfg.CURRENT_FRONT_WIDTH_FRACTION,
        "currentSegmentArcOverlapPerSideMeters": 0.01188,
        "indices": indices,
    }


def build_q_picture_plane(materials: dict[str, bpy.types.Material]) -> dict[str, Any]:
    collection = create_collection("PHASE4R1V2_EXACT_Q_SCREEN")
    image = bpy.data.images.load(str(cfg.Q_TEXTURE_PRE_CRT), check_existing=False)
    image.name = "Phase4R1V2_ExactQuantumQ_PreCRTEffect_2048"
    image.colorspace_settings.name = "sRGB"
    tracked_q_bytes = cfg.Q_TEXTURE_PRE_CRT.read_bytes()
    image_filepath_overwrite = cfg.IMAGE_FILEPATH_BUFFER_OVERWRITE_PREFIX + "x" * 2000
    image.filepath = image_filepath_overwrite
    image_filepath_overwrite_realized = str(image.filepath or "")
    image_filepath_buffer_overwrite_realized_characters = len(image_filepath_overwrite_realized)
    if (
        image_filepath_buffer_overwrite_realized_characters < cfg.IMAGE_FILEPATH_BUFFER_OVERWRITE_MINIMUM_CHARACTERS
        or image_filepath_overwrite_realized != image_filepath_overwrite[:image_filepath_buffer_overwrite_realized_characters]
    ):
        raise RuntimeError("exact-Q Image.filepath buffer did not accept the full nonprivate overwrite authority")
    image.filepath = cfg.CANONICAL_Q_IMAGE_FILEPATH
    if str(image.filepath or "") != cfg.CANONICAL_Q_IMAGE_FILEPATH:
        raise RuntimeError("exact-Q Image.filepath did not accept the canonical repo-relative authority")
    image.pack(data=tracked_q_bytes, data_len=len(tracked_q_bytes))
    if len(image.packed_files) != 1:
        raise RuntimeError("exact-Q image must have exactly one packed-file entry")
    packed_file_entry = image.packed_files[0]
    packed_file_entry.filepath = cfg.CANONICAL_Q_IMAGE_FILEPATH
    image.filepath = cfg.CANONICAL_Q_IMAGE_FILEPATH
    packed_image_filepath_canonical = cfg.canonical_blender_repo_relative_path(
        image.filepath,
        cfg.CANONICAL_Q_IMAGE_FILEPATH,
    )
    packed_file_entry_filepath_raw = str(packed_file_entry.filepath or "")
    packed_file_entry_filepath_canonical = cfg.canonical_blender_repo_relative_path(
        packed_file_entry_filepath_raw,
        cfg.CANONICAL_Q_IMAGE_FILEPATH,
    )
    packed_bytes = bytes(image.packed_file.data)
    packed_sha = hashlib.sha256(packed_bytes).hexdigest()
    if len(packed_bytes) != cfg.Q_TEXTURE_PRE_CRT.stat().st_size or packed_sha != sha256(cfg.Q_TEXTURE_PRE_CRT):
        raise RuntimeError("packed pre-CRT Q bytes differ from tracked dual-authority texture")
    image["phase4r1v2_packed_texture_bytes"] = len(packed_bytes)
    image["phase4r1v2_packed_texture_sha256"] = packed_sha
    image["phase4r1v2_filepath_buffer_overwrite_realized_characters"] = image_filepath_buffer_overwrite_realized_characters
    bpy.context.scene["phase4r1v2_q_filepath_overwrite_chars"] = image_filepath_buffer_overwrite_realized_characters
    material = bpy.data.materials.new("Phase4R1V2_ExactQuantumQ_Phosphor")
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    emission = nodes.new("ShaderNodeEmission")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    texture.interpolation = "Linear"
    info = nodes.new("ShaderNodeObjectInfo")
    alpha = nodes.new("ShaderNodeMath")
    alpha.operation = "MULTIPLY"
    mix = nodes.new("ShaderNodeMixShader")
    strength = nodes.new("ShaderNodeMath")
    strength.operation = "MULTIPLY"
    strength.inputs[1].default_value = 3.2
    links.new(texture.outputs["Color"], emission.inputs["Color"])
    links.new(info.outputs["Alpha"], strength.inputs[0])
    links.new(strength.outputs[0], emission.inputs["Strength"])
    links.new(texture.outputs["Alpha"], alpha.inputs[0])
    links.new(info.outputs["Alpha"], alpha.inputs[1])
    links.new(alpha.outputs[0], mix.inputs[0])
    links.new(transparent.outputs["BSDF"], mix.inputs[1])
    links.new(emission.outputs["Emission"], mix.inputs[2])
    links.new(mix.outputs["Shader"], output.inputs["Surface"])
    if hasattr(material, "surface_render_method"):
        material.surface_render_method = "DITHERED"
    material["phase4r1v2_exact_svg_direct_texture"] = True
    width = 0.358
    half = width * 0.5
    vertices = [(-half, 0.0, -half), (half, 0.0, -half), (half, 0.0, half), (-half, 0.0, half)]
    mesh = bpy.data.meshes.new("Phase4R1V2_ExactQuantumQ_PicturePlane_Data")
    mesh.from_pydata(vertices, [], [(0, 1, 2, 3)])
    mesh.update()
    uv = mesh.uv_layers.new(name="ExactQ_UV")
    for loop, coordinate in zip(mesh.loops, ((0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0))):
        uv.data[loop.index].uv = coordinate
    plane = bpy.data.objects.new("Phase4R1V2_ExactQuantumQ_PicturePlane", mesh)
    collection.objects.link(plane)
    plane.location = (0.65, -0.095, 0.425)
    mesh.materials.append(material)
    for frame, opacity in ((1, 0.0), (335, 0.0), (355, 1.0), (405, 1.0), (500, 1.0)):
        plane.color = (1.0, 1.0, 1.0, opacity)
        plane.keyframe_insert(data_path="color", frame=frame)
    set_linear(plane, {"color"})
    plane["phase4r1v2_role"] = "exact official Quantum-Hub Q picture plane behind accepted CRT glass"
    plane["phase4r1v2_white_svg_sha256"] = cfg.Q_WHITE_SVG_SHA256
    plane["phase4r1v2_color_svg_sha256"] = cfg.Q_COLOR_SVG_SHA256
    plane["phase4r1v2_packed_pre_crt_texture_sha256"] = sha256(cfg.Q_TEXTURE_PRE_CRT)
    for name in ("Phase4R0_QuantumQ_Body", "Phase4R0_QuantumQ_Accent"):
        obj = bpy.data.objects.get(name)
        if obj is None:
            raise RuntimeError(f"missing old Q curve authority {name}")
        obj.hide_render = True
    return {
        "object": plane.name,
        "image": image.name,
        "packed": image.packed_file is not None,
        "packedBytes": len(packed_bytes),
        "packedSha256": packed_sha,
        "packedImageFilepathRaw": str(image.filepath),
        "packedImageFilepath": packed_image_filepath_canonical,
        "imageFilepathBufferOverwriteMinimumCharacters": cfg.IMAGE_FILEPATH_BUFFER_OVERWRITE_MINIMUM_CHARACTERS,
        "imageFilepathBufferOverwriteRealizedCharacters": image_filepath_buffer_overwrite_realized_characters,
        "packedFileEntryCount": len(image.packed_files),
        "packedFileEntryFilepathRaw": packed_file_entry_filepath_raw,
        "packedFileEntryFilepath": packed_file_entry_filepath_canonical,
        "materialImageNodeBound": texture.image is image,
        "worldCenterMeters": list(plane.location),
        "widthMeters": width,
        "officialWhiteSvg": file_record(cfg.Q_WHITE_SVG),
        "officialColorSvg": file_record(cfg.Q_COLOR_SVG),
        "packedPreCrtTexture": file_record(cfg.Q_TEXTURE_PRE_CRT),
    }


def audit_establishing_aims_preserved() -> dict[str, Any]:
    """Audit the recovered establishing targets without mutating their actions."""
    report: dict[str, Any] = {}
    for family, expected_keys in cfg.ESTABLISHING_AIMS.items():
        name = "Phase4R1_EstablishingAimTarget" if family == "desktop" else f"Phase4R1_EstablishingAimTarget_{family.title()}"
        target = bpy.data.objects[name]
        signature = action_signature(actions_for_owner(target))
        observed: list[dict[str, Any]] = []
        for frame, expected in expected_keys:
            bpy.context.scene.frame_set(frame)
            observed_location = [round(float(value), 6) for value in target.location]
            if any(abs(actual - authored) > 1e-5 for actual, authored in zip(observed_location, expected)):
                raise RuntimeError(f"recovered {family} establishing aim differs at F{frame}: {observed_location} vs {expected}")
            observed.append({"frame": frame, "worldMeters": observed_location})
        report[family] = {"object": name, "action": signature, "actionPreserved": True, "keys": observed}
    bpy.context.scene.frame_set(1)
    return report


def object_signature_without_render_visibility(obj: bpy.types.Object) -> dict[str, Any]:
    record = owner_signature_record(obj)
    record.pop("sha256", None)
    record.pop("hideRender", None)
    properties = record.get("properties")
    if isinstance(properties, dict):
        for identifier in ("hide_render", "is_updated", "is_updated_data"):
            properties.pop(identifier, None)
    record["sha256"] = canonical_hash(record)
    return record


def screen_spill_state() -> dict[str, Any]:
    authority = cfg.SCREEN_SPILL_SUPPRESSION_AUTHORITY
    obj = bpy.data.objects.get(authority["object"])
    if obj is None or obj.type != authority["objectType"] or obj.data is None or obj.data.type != authority["lightType"]:
        raise RuntimeError("missing exact recovered Phase3 ScreenSpill light authority")
    collection_states = [
        {
            "name": collection.name,
            "hideRender": bool(collection.hide_render),
            "hideViewport": bool(collection.hide_viewport),
            "hideSelect": bool(collection.hide_select),
        }
        for collection in sorted(obj.users_collection, key=lambda value: value.name)
    ]
    data_actions = action_signature(actions_for_owner(obj.data))
    return {
        "object": obj.name,
        "objectType": obj.type,
        "data": obj.data.name,
        "lightType": obj.data.type,
        "hideRender": bool(obj.hide_render),
        "hideViewport": bool(obj.hide_viewport),
        "collections": collection_states,
        "objectCore": object_signature_without_render_visibility(obj),
        "dataOwner": owner_signature_record(obj.data),
        "dataPayload": data_signature_payload(obj),
        "dataActions": data_actions,
    }


def suppress_recovered_screen_spill() -> dict[str, Any]:
    authority = cfg.SCREEN_SPILL_SUPPRESSION_AUTHORITY
    bpy.context.view_layer.update()
    before = screen_spill_state()
    if (
        before["hideRender"] is not authority["recoveredHideRender"]
        or before["hideViewport"] is not authority["recoveredHideViewport"]
        or [row["name"] for row in before["collections"]] != [authority["collection"]]
        or before["collections"][0]["hideRender"] is not authority["recoveredCollectionHideRender"]
        or before["dataActions"]["actionNames"] != [authority["dataAction"]]
    ):
        raise RuntimeError({"message": "recovered ScreenSpill authority differs before object-only suppression", "state": before, "expected": authority})
    obj = bpy.data.objects[authority["object"]]
    obj.hide_render = authority["requiredHideRender"]
    bpy.context.view_layer.update()
    after = screen_spill_state()
    immutable_keys = ("object", "objectType", "data", "lightType", "hideViewport", "collections", "objectCore", "dataOwner", "dataPayload", "dataActions")
    immutable_state_unchanged = all(before[key] == after[key] for key in immutable_keys)
    prior_frame = int(bpy.context.scene.frame_current)
    try:
        bpy.context.scene.frame_set(int(authority["inspectionFrame"]))
        bpy.context.view_layer.update()
        evaluated_energy = float(obj.data.energy)
        evaluated_size = float(obj.data.size)
    finally:
        bpy.context.scene.frame_set(prior_frame)
        bpy.context.view_layer.update()
    passes = (
        after["hideRender"] is authority["requiredHideRender"]
        and immutable_state_unchanged
        and abs(evaluated_energy - float(authority["evaluatedEnergyWatts"])) <= 1e-6
        and abs(evaluated_size - float(authority["areaSizeMeters"])) <= 1e-6
    )
    if not passes:
        raise RuntimeError("ScreenSpill suppression changed state beyond Object.hide_render or damaged its animated light authority")
    return {
        "status": "PASS",
        "object": obj.name,
        "mutation": {"rnaPath": "Object.hide_render", "before": before["hideRender"], "after": after["hideRender"]},
        "objectCoreSha256Before": before["objectCore"]["sha256"],
        "objectCoreSha256After": after["objectCore"]["sha256"],
        "dataOwnerSha256Before": before["dataOwner"]["sha256"],
        "dataOwnerSha256After": after["dataOwner"]["sha256"],
        "dataPayloadSha256Before": before["dataPayload"]["sha256"],
        "dataPayloadSha256After": after["dataPayload"]["sha256"],
        "dataActionSha256": after["dataActions"]["sha256"],
        "dataActionNames": after["dataActions"]["actionNames"],
        "collections": after["collections"],
        "hideViewportPreserved": before["hideViewport"] == after["hideViewport"],
        "immutableStateUnchanged": immutable_state_unchanged,
        "inspectionFrame": authority["inspectionFrame"],
        "evaluatedEnergyWatts": evaluated_energy,
        "areaSizeMeters": evaluated_size,
        "passes": passes,
    }


def configure_environment(materials: dict[str, bpy.types.Material]) -> dict[str, Any]:
    visual_authority = cfg.HALL_VISUAL_AUTHORITY
    tolerances = visual_authority["float32RealizationTolerances"]
    if visual_authority.get("pendingSelections"):
        raise RuntimeError(f"global hall visual authority remains pending: {visual_authority['pendingSelections']}")
    screen_spill_suppression = suppress_recovered_screen_spill()
    hidden_collections = []
    for name in cfg.MUSEUM_OVERLAY_COLLECTIONS + ("PHASE4R1_HALL_MACHINERY", "PHASE4R1_HALL_OPERATIONAL_DETAILS", "PHASE4R1_HALL_LIGHTING", "PHASE4R1_CABLE_LOCAL_RESPONSE_LIGHTS"):
        collection = bpy.data.collections.get(name)
        if collection is not None:
            collection.hide_render = True
            collection["phase4r1v2_hidden_reason"] = "refined dark hall removes museum overlays, central clutter, or bright-panel lighting"
            hidden_collections.append(name)
    for spec in cfg.CABLE_FAMILIES.values():
        collection = bpy.data.collections[spec["source_collection"]]
        collection.hide_render = True
        collection["phase4r1v2_preserved_but_superseded"] = True
    distribution = bpy.data.collections["PHASE4R1_DISTRIBUTION_SOURCE"]
    hidden_hardware = []
    retained_overhead_records = []
    for obj in distribution.objects:
        obj.hide_render = obj.name not in cfg.RETAINED_OVERHEAD_SOURCE_OBJECTS
        if obj.hide_render:
            hidden_hardware.append(obj.name)
        else:
            assign_material(obj, materials["steel"])
            obj["phase4r1v2_role"] = "subdued overhead/off-screen shadow architecture"
            retained_overhead_records.append({"object": obj.name, "sourceCollection": distribution.name, "worldBoundsMeters": preflight.bounds_world(obj), "material": materials["steel"].name})
    if len(hidden_hardware) != 34:
        raise RuntimeError(f"expected exactly 34 central hardware objects to hide, found {len(hidden_hardware)}")
    retained_perimeter_records = []
    retained_floor_records = []
    for collection_name, material_key in (
        ("PHASE4R1_HALL_FLOOR", "graphite"),
        ("PHASE4R1_HALL_STRUCTURE", "steel"),
        ("PHASE4R1_HALL_ARCHITECTURE", "warm_dark"),
    ):
        collection = bpy.data.collections[collection_name]
        for obj in collection.objects:
            material = materials[material_key]
            if "Floor_" in obj.name or "SealedConcrete" in obj.name or "ServiceApron" in obj.name:
                material = materials["graphite"]
            elif any(token in obj.name for token in ("Column", "Roof", "Portal", "CableTray", "CraneRail", "Gantry", "Catwalk", "Ventilation")):
                material = materials["steel"]
            assign_material(obj, material)
            obj["phase4r1v2_palette_retained_perimeter_architecture"] = True
            record = {"object": obj.name, "sourceCollection": collection_name, "objectType": obj.type, "worldBoundsMeters": preflight.bounds_world(obj), "material": material.name, "retainedFromRecoveredSource": True}
            if collection_name == "PHASE4R1_HALL_FLOOR":
                retained_floor_records.append(record)
            else:
                retained_perimeter_records.append(record)
    lights = create_collection("PHASE4R1V2_LOW_NEUTRAL_LIGHTING")
    records = []
    for index, practical in enumerate(visual_authority["perimeterPointPracticals"]):
        location = tuple(practical["location"])
        energy = float(practical["energyWatts"])
        color = tuple(practical["color"])
        radius = float(practical["softRadiusMeters"])
        data = bpy.data.lights.new(f"Phase4R1V2_PerimeterPractical_{index:02d}_Data", type="POINT")
        data.energy = energy
        data.color = color
        data.shadow_soft_size = radius
        obj = bpy.data.objects.new(f"Phase4R1V2_PerimeterPractical_{index:02d}", data)
        obj.location = location
        lights.objects.link(obj)
        obj["phase4r1v2_role"] = "unseen low neutral perimeter practical"
        records.append({"object": obj.name, "worldMeters": list(location), "energyWatts": energy, "color": list(color), "softRadiusMeters": radius, "type": data.type})
    key_authority = visual_authority["highSoftNeutralKey"]
    area_data = bpy.data.lights.new("Phase4R1V2_HighSoftNeutralKey_Data", type="AREA")
    area_data.energy = float(key_authority["energyWatts"])
    area_data.shape = key_authority["shape"]
    area_data.size = float(key_authority["sizeMeters"])
    area_data.color = tuple(key_authority["color"])
    area = bpy.data.objects.new("Phase4R1V2_HighSoftNeutralKey", area_data)
    area.location = tuple(key_authority["location"])
    area.rotation_euler = (0.0, 0.0, 0.0)
    lights.objects.link(area)
    area["phase4r1v2_role"] = "unseen low neutral high soft practical; no luminous panel mesh"
    records.append({"object": area.name, "worldMeters": list(area.location), "energyWatts": area_data.energy, "color": list(area_data.color), "shape": area_data.shape, "sizeMeters": area_data.size, "type": area_data.type})
    sun_authority = visual_authority["architecturalSun"]
    if sun_authority["energy"] is None:
        raise RuntimeError("architectural SUN energy remains pending the bounded compound native/pixel diagnostic")
    sun_data = bpy.data.lights.new(sun_authority["data"], type="SUN")
    sun_data.energy = float(sun_authority["energy"])
    sun_data.color = tuple(sun_authority["color"])
    sun_data.angle = math.radians(float(sun_authority["angleDegrees"]))
    sun = bpy.data.objects.new(sun_authority["object"], sun_data)
    sun.location = tuple(sun_authority["location"])
    sun.rotation_euler = tuple(math.radians(float(value)) for value in sun_authority["eulerDegrees"])
    lights.objects.link(sun)
    sun["phase4r1v2_role"] = "single authored low-energy neutral architectural sun; directional hall lift only"
    bpy.context.view_layer.update()
    sun_direction = sun.matrix_world.to_quaternion() @ Vector((0.0, 0.0, -1.0))
    expected_sun_direction = Vector(sun_authority["expectedLocalMinusZWorld"])
    sun_direction_error = (sun_direction - expected_sun_direction).length
    if (
        sun.name != sun_authority["object"]
        or sun_data.name != sun_authority["data"]
        or sun.animation_data is not None
        or sun_data.animation_data is not None
        or sun.type != "LIGHT"
        or sun.data.type != "SUN"
        or int(sun.data.users) != 1
        or math.dist(list(sun.location), sun_authority["location"]) > float(tolerances["worldMeters"])
        or max(abs(math.degrees(float(actual)) - float(expected)) for actual, expected in zip(sun.rotation_euler, sun_authority["eulerDegrees"])) > float(tolerances["degrees"])
        or sun_direction_error > float(sun_authority["directionRealizationTolerance"])
        or max(abs(actual - expected) for actual, expected in zip(sun_data.color, sun_authority["color"])) > float(tolerances["colorChannel"])
        or abs(float(sun_data.energy) - float(sun_authority["energy"])) > float(tolerances["sunEnergy"])
        or abs(math.degrees(float(sun_data.angle)) - float(sun_authority["angleDegrees"])) > float(tolerances["degrees"])
    ):
        raise RuntimeError("authored architectural SUN differs from exact global visual authority")
    sun_record = {
        "object": sun.name,
        "data": sun_data.name,
        "objectType": sun.type,
        "lightType": sun_data.type,
        "dataUsers": int(sun_data.users),
        "worldMeters": list(sun.location),
        "eulerDegrees": [math.degrees(value) for value in sun.rotation_euler],
        "localMinusZWorld": list(sun_direction),
        "expectedLocalMinusZWorld": list(expected_sun_direction),
        "directionRealizationError": sun_direction_error,
        "directionRealizationTolerance": sun_authority["directionRealizationTolerance"],
        "energy": sun_data.energy,
        "color": list(sun_data.color),
        "angleDegrees": math.degrees(sun_data.angle),
        "objectAction": None,
        "dataAction": None,
        "mesh": None,
    }
    rear_authority = visual_authority["additionalLocalRearLight"]
    if rear_authority is None:
        raise RuntimeError("additional local rear light remains pending the bounded compound native/pixel diagnostic")
    rear_data = bpy.data.lights.new(rear_authority["data"], type="SPOT")
    rear_data.energy = float(rear_authority["energyWatts"])
    rear_data.color = tuple(rear_authority["color"])
    rear_data.spot_size = math.radians(float(rear_authority["coneDegrees"]))
    rear_data.spot_blend = float(rear_authority["blend"])
    rear_data.shadow_soft_size = float(rear_authority["softRadiusMeters"])
    rear = bpy.data.objects.new(rear_authority["object"], rear_data)
    rear.location = tuple(rear_authority["location"])
    rear_direction_authored = Vector(rear_authority["targetWorldMeters"]) - Vector(rear_authority["location"])
    if rear_direction_authored.length <= 1e-12:
        raise RuntimeError("additional local rear SPOT has a zero-length authored target direction")
    rear.rotation_euler = rear_direction_authored.to_track_quat("-Z", "Y").to_euler()
    lights.objects.link(rear)
    rear["phase4r1v2_role"] = "single restrained neutral rear SPOT; localized cabinet separation without a floor pool"
    bpy.context.view_layer.update()
    rear_direction = rear.matrix_world.to_quaternion() @ Vector((0.0, 0.0, -1.0))
    expected_rear_direction = Vector(rear_authority["expectedLocalMinusZWorld"])
    rear_direction_error = (rear_direction - expected_rear_direction).length
    if (
        rear.name != rear_authority["object"]
        or rear_data.name != rear_authority["data"]
        or rear.type != "LIGHT"
        or rear_data.type != "SPOT"
        or int(rear_data.users) != 1
        or rear.animation_data is not None
        or rear_data.animation_data is not None
        or math.dist(list(rear.location), rear_authority["location"]) > float(tolerances["worldMeters"])
        or rear_direction_error > float(rear_authority["directionRealizationTolerance"])
        or max(abs(actual - expected) for actual, expected in zip(rear_data.color, rear_authority["color"])) > float(tolerances["colorChannel"])
        or abs(float(rear_data.energy) - float(rear_authority["energyWatts"])) > float(tolerances["ordinaryLightEnergy"])
        or abs(math.degrees(float(rear_data.spot_size)) - float(rear_authority["coneDegrees"])) > float(tolerances["degrees"])
        or abs(float(rear_data.spot_blend) - float(rear_authority["blend"])) > float(tolerances["materialScalar"])
        or abs(float(rear_data.shadow_soft_size) - float(rear_authority["softRadiusMeters"])) > float(tolerances["worldMeters"])
    ):
        raise RuntimeError("authored local rear SPOT differs from exact global visual authority")
    rear_record = {
        "object": rear.name,
        "data": rear_data.name,
        "objectType": rear.type,
        "lightType": rear_data.type,
        "dataUsers": int(rear_data.users),
        "worldMeters": [float(value) for value in rear.location],
        "targetWorldMeters": list(rear_authority["targetWorldMeters"]),
        "eulerDegrees": [math.degrees(float(value)) for value in rear.rotation_euler],
        "localMinusZWorld": [float(value) for value in rear_direction],
        "expectedLocalMinusZWorld": [float(value) for value in expected_rear_direction],
        "directionRealizationError": rear_direction_error,
        "directionRealizationTolerance": rear_authority["directionRealizationTolerance"],
        "energyWatts": float(rear_data.energy),
        "color": [float(value) for value in rear_data.color],
        "coneDegrees": math.degrees(float(rear_data.spot_size)),
        "blend": float(rear_data.spot_blend),
        "softRadiusMeters": float(rear_data.shadow_soft_size),
        "objectAction": None,
        "dataAction": None,
        "mesh": None,
    }
    world = bpy.context.scene.world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background is None:
        raise RuntimeError("world node tree lacks exact Background node")
    background.inputs["Color"].default_value = srgb(visual_authority["world"]["colorHex"])
    background.inputs["Strength"].default_value = float(visual_authority["world"]["strength"])
    return {
        "hiddenCollections": hidden_collections,
        "hiddenCentralHardwareCount": len(hidden_hardware),
        "hiddenCentralHardwareObjects": sorted(hidden_hardware),
        "retainedOverheadSourceObjects": list(cfg.RETAINED_OVERHEAD_SOURCE_OBJECTS),
        "retainedOverheadSourceAuthority": sorted(retained_overhead_records, key=lambda row: row["object"]),
        "retainedWallPerimeterObjectCount": len(retained_perimeter_records),
        "retainedWallPerimeterObjects": sorted(retained_perimeter_records, key=lambda row: (row["sourceCollection"], row["object"])),
        "retainedEnvironmentalFloorObjectCount": len(retained_floor_records),
        "retainedEnvironmentalFloorObjects": sorted(retained_floor_records, key=lambda row: row["object"]),
        "lowNeutralPracticals": records,
        "architecturalSun": sun_record,
        "world": {"color": list(background.inputs["Color"].default_value), "strength": float(background.inputs["Strength"].default_value)},
        "visualAuthority": visual_authority,
        "additionalLocalRearLight": rear_record,
        "screenSpillSuppression": screen_spill_suppression,
    }


def build_service_origin_and_rear(materials: dict[str, bpy.types.Material]) -> dict[str, Any]:
    collection = create_collection("PHASE4R1V2_RESTRAINED_CONNECTIONS")
    authority = cfg.SERVICE_MOUTH_AUTHORITY
    flange_spec = authority["flange"]
    sleeve_spec = authority["sleeve"]
    mouth = add_annular_x_mesh(
        flange_spec["object"],
        cfg.PERIMETER_SOURCE_WORLD_M,
        flange_spec["xOffsetsMeters"],
        flange_spec["outerDiameterMeters"] * 0.5,
        flange_spec["innerDiameterMeters"] * 0.5,
        authority["segments"],
        materials["steel"],
        collection,
        "flush non-emissive steel annular west-wall cable service flange",
    )
    mouth["phase4r1v2_inventory_class"] = "perimeter infrastructure"
    sleeve = add_annular_x_mesh(
        sleeve_spec["object"],
        cfg.PERIMETER_SOURCE_WORLD_M,
        sleeve_spec["xOffsetsMeters"],
        sleeve_spec["outerDiameterMeters"] * 0.5,
        sleeve_spec["innerDiameterMeters"] * 0.5,
        authority["segments"],
        materials["rubber"],
        collection,
        "recessed non-emissive rubber cable service sleeve with the measured 72 mm clearance bore",
    )
    sleeve["phase4r1v2_inventory_class"] = "perimeter infrastructure"
    seat = derive_rear_seat()
    endpoint = Vector(seat["derivedCableCenterEndpointWorldMeters"])
    grommet = add_cylinder("P4R1V2_CRT_RearCableGrommet", tuple(endpoint + Vector((0.0, -0.0015, 0.0))), 0.034, 0.014, (math.pi / 2.0, 0.0, 0.0), materials["rubber"], collection, "restrained rubber grommet seated on accepted lower-rear strain-relief axis")
    grommet["phase4r1v2_inventory_class"] = "spiral cable"
    return {
        "serviceMouth": {
            "authority": authority,
            "object": mouth.name,
            "axisOriginWorldMeters": list(mouth.location),
            "flangeDimensionsMeters": [float(value) for value in mouth.dimensions],
            "sleeveObject": sleeve.name,
            "sleeveDimensionsMeters": [float(value) for value in sleeve.dimensions],
            "emissive": False,
        },
        "rearSeat": {key: value for key, value in seat.items() if key != "endpoint"},
        "grommet": {"object": grommet.name, "worldMeters": list(grommet.location), "radiusMeters": 0.034, "depthMeters": 0.014},
        "endpoint": endpoint,
    }


def configure_scene() -> None:
    scene = bpy.context.scene
    visual_authority = cfg.HALL_VISUAL_AUTHORITY
    scene.frame_start = cfg.FRAME_START
    scene.frame_end = cfg.FRAME_END
    scene.render.fps = cfg.FPS
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.render.filepath = cfg.CANONICAL_RENDER_HOLD_FILEPATH
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = visual_authority["viewTransform"]
    scene.view_settings.look = visual_authority["look"]
    scene.view_settings.exposure = float(visual_authority["exposureStops"])
    scene["phase4r1v2_schema"] = "quantum-hub.phase-4-r1.refined-proving-hall.blender-source.v2"
    scene["phase4r1v2_full540_frame_cycles_production_film_started"] = False
    scene["phase4r1v2_full540_frame_cycles_production_film_resumed"] = False
    scene["phase4r1v2_refined_physical_media_runtime_integration_started"] = False
    scene["phase4r1v2_chrome_state_policy_implementation_evidenced"] = True
    scene["phase4r1v2_phase5_authorized"] = False
    scene["phase4r1v2_hall_visual_authority_json"] = json.dumps(visual_authority, sort_keys=True, separators=(",", ":"))


def write_recovery_reports() -> None:
    selected = file_record(cfg.RECOVERED_SOURCE)
    recovery_git_status = {
        "staged": [],
        "unstaged": ["scripts/package-phase4r1-proving-hall-review.mjs"],
        "untracked": [],
        "statusEntries": [
            {
                "indexStatus": " ",
                "worktreeStatus": "M",
                "path": "scripts/package-phase4r1-proving-hall-review.mjs",
                "classification": "intentional interrupted-run package work; preserved",
            }
        ],
    }
    blender_candidates = [
        {"kind": "blend", **selected, "valid": True, "selected": True},
        {"kind": "blend1", "count": 0, "selected": False},
        {"kind": "autosave", "count": 0, "selected": False},
    ]
    recovery = {
        "schema": "quantum-hub.phase-4-r1.recovery-report.v2",
        "status": "PASS",
        "generatedAt": cfg.GENERATED_AT,
        "diagnosis": {"taskEndingCause": "Codex API invalid_request_error after 40,057,456 ms", "message": "prompt_cache_retention is not supported on this model", "blenderOrRenderFailure": False, "strongestSupportedConclusion": "the agent turn ended at the API/model boundary after Blender outputs had completed; recovered Blender/render evidence remained valid"},
        "promptCacheClassification": {"taskEndingCause": True, "projectLocalConfigHitCount": 0, "globalConfigurationModified": False, "blenderFailure": False},
        "errorInvestigation": {
            "promptCacheRetentionWasTaskEndingCause": True,
            "strongestSupportedDiagnosis": "The recorded terminal event is a Codex API invalid_request_error rejecting prompt_cache_retention after the long-running task; Blender itself had already exited successfully and its source/evidence bytes remained readable.",
            "supportLevel": "direct task-ending event plus recovered-file/process inspection; no evidence of a Blender crash",
        },
        "separatePackagePrivacyDiagnosis": {"kind": "scanner false positive inside H.264 IDR bytes plus genuine Blender PNG File metadata", "metadataPathLeakInDiagnosticMp4": False, "diagnosticMp4Sha256": "ea8456e4b2efc517679e7052651a6446a540838072546d7b94e547184a51f798"},
        "git": {
            "branch": "redirect/phase-4r1-proving-hall-environment",
            "startingHead": cfg.STARTING_HEAD,
            "startingParent": cfg.EXACT_PARENT,
            "checkpointHead": cfg.RECOVERY_CHECKPOINT_HEAD,
            "finalHeadAtRefinedSourceBuild": cfg.RECOVERY_CHECKPOINT_HEAD,
            "exactParent": cfg.EXACT_PARENT,
            "main": cfg.MAIN_AUTHORITY,
            "upstreamAtRecovery": cfg.STARTING_HEAD,
            "remoteAtRecovery": cfg.STARTING_HEAD,
            "worktreeAtRecovery": "one intentional unstaged packager change; no staged or untracked files",
            **recovery_git_status,
        },
        "recoveryBackupAlias": "qsite-phase4r1-recovery-20260824-095513",
        "modifiedFilesSinceInterruptedRun": [
            {"path": "artifacts/original/phase-4r1-proving-hall-environment/source/build_phase4r1_proving_hall.py", "state": "committed-r1-source"},
            {"path": "artifacts/original/phase-4r1-proving-hall-environment/source/phase4r1-asset-ledger.json", "state": "committed-r1-source"},
            {"path": "artifacts/original/phase-4r1-proving-hall-environment/source/phase4r1-source-build.json", "state": "committed-r1-source"},
            {"path": "artifacts/original/phase-4r1-proving-hall-environment/source/phase4r1-source-validation.json", "state": "committed-r1-source"},
            {"path": "artifacts/original/phase-4r1-proving-hall-environment/source/phase4r1_config.py", "state": "committed-r1-source"},
            {"path": "artifacts/original/phase-4r1-proving-hall-environment/source/preflight_phase4r1_geometry.py", "state": "committed-r1-source"},
            {"path": "artifacts/original/phase-4r1-proving-hall-environment/source/quantum-signal-television-phase4r1-proving-hall.blend", "state": "committed-r1-source"},
            {"path": "artifacts/original/phase-4r1-proving-hall-environment/source/render_phase4r1_cycles_benchmarks.py", "state": "committed-r1-source"},
            {"path": "artifacts/original/phase-4r1-proving-hall-environment/source/render_phase4r1_preproduction.py", "state": "committed-r1-source"},
            {"path": "artifacts/original/phase-4r1-proving-hall-environment/source/render_phase4r1_review_stills.py", "state": "committed-r1-source"},
            {"path": "artifacts/original/phase-4r1-proving-hall-environment/source/validate_phase4r1_source.py", "state": "committed-r1-source"},
            {"path": "scripts/package-phase4r1-proving-hall-review.mjs", "state": "unstaged-modified-at-recovery", "disposition": "preserved; not used as refined visual authority"},
        ],
        "blenderCandidates": blender_candidates,
        "candidates": blender_candidates,
        "selectedSource": {
            **selected,
            "reason": "newest authoritative R1 derivative; opened successfully in Blender 5.2; original CRT/actions/resources validated; no newer blend1 or autosave existed",
            "validation": {
                "opensSuccessfully": True,
                "sceneObjectsPresent": True,
                "camerasPresent": True,
                "timelineValid": True,
                "materialsPresent": True,
                "resourcesResolved": True,
                "originalCrtIntact": True,
                "officialQAvailable": True,
                "missingLibraries": [],
                "missingTextures": [],
                "lostActions": [],
                "frameBoundsValid": True,
            },
        },
        "renderInventory": {
            "full540CyclesFrameRoots": [],
            "partial540CyclesFrameRoots": [],
            "preproductionReviewOutputsPreservedExternally": True,
            "refinedVisualAuthorityEligible": False,
            "externalRecoveredGroups": [
                {"id": "recovered-eevee-full-review-log", "fileCount": 1535, "bytes": 608923304, "treeSha256": "9bd5c9186ad202d55eedf41374fdc17ec5c29a5e33e3fbf2948093f1e4f68196"},
                {"id": "recovered-cycles-stills", "fileCount": 16, "bytes": 10386206, "treeSha256": "719d7618d8f670ee768910a6e244870848e3e3046a42cbf1bb4fed975b20eaf9"},
                {"id": "recovered-cycles-motion", "fileCount": 183, "bytes": 99530646, "treeSha256": "be8a23e0782f19643e6be6cf776479771a1fd02914823513b2dd188890bba120"},
                {"id": "recovered-entry-evidence", "fileCount": 27, "bytes": 2497133, "treeSha256": "377f7aef450390e7ed6a56217d1f7fce00da54a4a7a40cb49c1b6be482ab7476"},
                {"id": "recovered-rear-proof", "fileCount": 14, "bytes": 4772207, "treeSha256": "a04d0ee8ea9a864c9e700b107900c8fade4445d740bf5ccac18476724dfb3a55"},
                {"id": "recovered-responsive-evidence", "fileCount": 18, "bytes": 4061908, "treeSha256": "5ef65e4cfe234ff58243395825eae43c03ebc042aea3f1554950b77e13f98d04"},
            ],
        },
        "partialRenders": [],
        "processInventory": {
            "blender": [],
            "ffmpeg": [],
            "pythonRenderWorkers": [],
            "activeOutputMutationObserved": False,
        },
        "freeDiskSpace": {
            "bytesAvailableAtFinalRecoveryAudit": 1716990664704,
            "recorded": True,
            "measurementScope": "workspace volume",
        },
        "worktreeInventory": recovery_git_status,
        "partialInventories": {"full540FrameCyclesProductionFilmFound": False, "activeRenderProcessesAtRecovery": [], "recoveredOutputsPreserved": True, "oldVisualEvidenceEligibleForRefinedReview": False},
        "authorization": cfg.AUTHORIZATION,
    }
    cfg.RECOVERY_REPORT.write_text(json.dumps(recovery, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    backup = {
        "schema": "quantum-hub.phase-4-r1.recovery-backup-summary.v2",
        "status": "PASS",
        "generatedAt": cfg.GENERATED_AT,
        "externalRecoveryId": "qsite-phase4r1-recovery-20260824-095513",
        "externalAbsolutePathStored": False,
        "inventorySummary": {"manifestRecordCount": 1820, "manifestRecordBytes": 994730432, "actualBackupFileCountIncludingManifest": 1821, "actualBackupBytesIncludingManifest": 996348783, "exactCopyCount": 1810, "generatedArtifactCount": 9, "liveLogSnapshotCount": 1},
        "files": [
            {"role": "external-recovery-backup-inventory", "originalPath": "logical:recovery-run/inventory", "backupPath": "externalRecoveryId:/recovery-backup-inventory.json", "bytes": 1618351, "mtimeUtc": "2026-08-24T07:00:23.7928053Z", "sha256": "6a22ca38fd8db7b5bf2775ca7c251a4babae19f41bb1217d0fb5e26fd1dfd896"},
            {"role": "external-recovery-frame-inventory", "originalPath": "logical:recovery-run/frame-inventory", "backupPath": "externalRecoveryId:/recovery-frame-inventory.json", "bytes": 2449, "mtimeUtc": "2026-08-24T06:58:14.6106873Z", "sha256": "7a660cc69bc7073e52e3a908d1dcf147e8595baaeed254bdd14b41e6db3d29d7"},
            {"role": "external-recovery-state", "originalPath": "logical:recovery-run/state", "backupPath": "externalRecoveryId:/recovery-state.json", "bytes": 3174, "mtimeUtc": "2026-08-24T06:58:14.6106873Z", "sha256": "cfab14a43d41a0ad57f66663baaee77cc3a7ccd99f562e1bd1c6cb3920ac95df"},
            {"role": "selected-recovered-blender", "originalPath": selected["path"], "backupPath": "externalRecoveryId:/workspace/phase4r1-source/quantum-signal-television-phase4r1-proving-hall.blend", "bytes": selected["bytes"], "mtimeUtc": "2026-08-23T18:43:02.1620372Z", "sha256": selected["sha256"]},
            {"role": "recovered-source-tree", "recordKind": "tree-digest", "originalPath": "artifacts/original/phase-4r1-proving-hall-environment/source", "backupPath": "externalRecoveryId:/workspace/phase4r1-source", "fileCount": 11, "bytes": 5642977, "mtimeUtc": None, "sha256": "2d27c2affafb317b2d4c6b79dfa096570e7e4ea29384cf63703e10d79646f4d0"},
            {"role": "recovered-eevee-full-review-log-tree", "recordKind": "tree-digest", "originalPath": "logical:interrupted-run/eevee-full-review-log", "backupPath": "externalRecoveryId:/evidence/eevee-full-review-log", "fileCount": 1535, "bytes": 608923304, "mtimeUtc": None, "sha256": "9bd5c9186ad202d55eedf41374fdc17ec5c29a5e33e3fbf2948093f1e4f68196"},
            {"role": "recovered-cycles-stills-tree", "recordKind": "tree-digest", "originalPath": "logical:interrupted-run/cycles-stills", "backupPath": "externalRecoveryId:/evidence/cycles-stills", "fileCount": 16, "bytes": 10386206, "mtimeUtc": None, "sha256": "719d7618d8f670ee768910a6e244870848e3e3046a42cbf1bb4fed975b20eaf9"},
            {"role": "recovered-cycles-motion-tree", "recordKind": "tree-digest", "originalPath": "logical:interrupted-run/cycles-motion", "backupPath": "externalRecoveryId:/evidence/cycles-motion", "fileCount": 183, "bytes": 99530646, "mtimeUtc": None, "sha256": "be8a23e0782f19643e6be6cf776479771a1fd02914823513b2dd188890bba120"},
            {"role": "recovered-entry-tree", "recordKind": "tree-digest", "originalPath": "logical:interrupted-run/entry", "backupPath": "externalRecoveryId:/evidence/entry", "fileCount": 27, "bytes": 2497133, "mtimeUtc": None, "sha256": "377f7aef450390e7ed6a56217d1f7fce00da54a4a7a40cb49c1b6be482ab7476"},
            {"role": "recovered-rear-proof-tree", "recordKind": "tree-digest", "originalPath": "logical:interrupted-run/rear-proof", "backupPath": "externalRecoveryId:/evidence/rear-proof", "fileCount": 14, "bytes": 4772207, "mtimeUtc": None, "sha256": "a04d0ee8ea9a864c9e700b107900c8fade4445d740bf5ccac18476724dfb3a55"},
            {"role": "recovered-responsive-tree", "recordKind": "tree-digest", "originalPath": "logical:interrupted-run/responsive", "backupPath": "externalRecoveryId:/evidence/responsive", "fileCount": 18, "bytes": 4061908, "mtimeUtc": None, "sha256": "5ef65e4cfe234ff58243395825eae43c03ebc042aea3f1554950b77e13f98d04"},
            {"role": "recovered-diagnostic-mp4", "originalPath": "logical:interrupted-run/diagnostic-mp4", "backupPath": "externalRecoveryId:/evidence/diagnostic.mp4", "bytes": 2110721, "mtimeUtc": None, "sha256": "ea8456e4b2efc517679e7052651a6446a540838072546d7b94e547184a51f798"},
            {"role": "unstaged-packager", "originalPath": "scripts/package-phase4r1-proving-hall-review.mjs", "backupPath": "externalRecoveryId:/workspace/scripts/package-phase4r1-proving-hall-review.mjs", "bytes": 194136, "mtimeUtc": "2026-08-23T21:33:55.4238563Z", "sha256": "ace061b67927a9d7fd1c33b0f466b7ef898c1fd315bb9e6ef1295117b345fa93"},
            {"role": "recovery-patch", "originalPath": "logical:git/unstaged.patch", "backupPath": "externalRecoveryId:/git/unstaged.patch", "bytes": 25136, "mtimeUtc": None, "sha256": "654f1ab63548540c130ab9b43e204afcac623a144abe44ce2b59a82652a9d260"},
            {"role": "recovery-porcelain", "originalPath": "logical:git/status-porcelain", "backupPath": "externalRecoveryId:/git/status-porcelain.txt", "bytes": 361, "mtimeUtc": None, "sha256": "15ab93bcb157ddc488fe535d8b9dc929b766a2eaa6bb9eb66e7cb883d41d32eb"},
            {"role": "recovery-unstaged-name-status", "originalPath": "logical:git/unstaged-name-status", "backupPath": "externalRecoveryId:/git/unstaged-name-status.txt", "bytes": 51, "mtimeUtc": None, "sha256": "79982253875bbc868f43e5b7c687f97b3f1d42e668caf56618dfdadd629d01a7"},
            {"role": "recovery-recent-history", "originalPath": "logical:git/recent-history", "backupPath": "externalRecoveryId:/git/recent-history.txt", "bytes": 2301, "mtimeUtc": None, "sha256": "351306378b0c7fa4672e29ba59bbefa1826beba313360fd00d78bd91ee508907"},
            {"role": "recovery-staged-diff", "originalPath": "logical:git/staged.diff", "backupPath": "externalRecoveryId:/git/staged.diff", "bytes": 0, "mtimeUtc": None, "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},
            {"role": "recovery-untracked-list", "originalPath": "logical:git/untracked-list", "backupPath": "externalRecoveryId:/git/untracked-list.txt", "bytes": 0, "mtimeUtc": None, "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},
        ],
        "limitations": ["The full 1,820-entry private-path inventory remains external; this tracked summary binds it by exact bytes/SHA without copying private host paths."],
        "authorization": cfg.AUTHORIZATION,
    }
    cfg.RECOVERY_BACKUP_SUMMARY.write_text(json.dumps(backup, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_asset_ledger(derivative: dict[str, Any], build: dict[str, Any]) -> None:
    ledger = {
        "schema": "quantum-hub.phase-4-r1.refined-proving-hall.asset-ledger.v2",
        "status": "PASS",
        "generatedAt": cfg.GENERATED_AT,
        "sourceAuthorities": {"recoveredDerivative": file_record(cfg.RECOVERED_SOURCE), "refinedDerivative": derivative, "exactQProvenance": file_record(cfg.Q_PROVENANCE_REPORT)},
        "assets": [
            {"id": "accepted-crt", "origin": "preserved recovered authority", "physicalGeometryMaterialsActionsChanged": False, "preservationSignatureSchema": cfg.PRESERVATION_SIGNATURE_SCHEMA, "persistenceVolatileRnaPropertyExclusionAuthority": cfg.PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY, "oldApproximateQVisibilityUnchangedHidden": build["preservation"]["oldApproximateQVisibilityUnchangedHidden"], "signature": build["preservation"]["acceptedCrtAfter"]},
            {"id": "dark-v2-hall", "origin": "retained R1 architecture with deterministic local material reassignment", "palette": cfg.PALETTE, "downloads": False},
            {"id": "responsive-spiral-cables", "origin": "desktop/landscape preserve their complete recovered spirals; mobile preserves the exact hash-bound 482-point recovered prefix and uses the independently clearance-verified r=.18 LSL floor transition; all families add authored perimeter leads and restrained lower-rear tails", "families": list(cfg.CABLE_FAMILIES), "mobileRefinedRouteAuthority": build["design"]["cable"]["mobile"].get("mobileRefinedRouteAuthority"), "downloads": False},
            {"id": "exact-quantum-q", "origin": "official repository SVG direct raster", "manualRedraw": False, "approximateGeometry": False, "provenance": file_record(cfg.Q_PROVENANCE_REPORT)},
        ],
        "externalAssetsDownloaded": [],
        "stockOrGenerativeAssetsUsed": False,
        "authorization": cfg.AUTHORIZATION,
    }
    cfg.ASSET_LEDGER.write_text(json.dumps(ledger, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> None:
    blender_args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    preflight_only = "--preflight-only" in blender_args
    if Path(bpy.data.filepath).resolve() != cfg.RECOVERED_SOURCE.resolve():
        raise RuntimeError(f"builder must run with exact recovered source open; got {bpy.data.filepath}")
    if sha256(cfg.RECOVERED_SOURCE) != cfg.RECOVERED_SOURCE_SHA256:
        raise RuntimeError("recovered e24ccf source hash mismatch")
    if (
        cfg.PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY.get("properties") != ["session_uid"]
        or "tag" in cfg.PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY.get("properties", [])
    ):
        raise RuntimeError("persistence hashing may exclude only Blender runtime session_uid; tag and authored fields remain bound")
    if cfg.DERIVATIVE_SOURCE.exists() and not preflight_only:
        raise RuntimeError(f"refusing to overwrite existing refined derivative: {cfg.DERIVATIVE_SOURCE}")
    pending_derivative = cfg.DERIVATIVE_SOURCE.with_name(f"{cfg.DERIVATIVE_SOURCE.stem}.pending.blend")
    if pending_derivative.parent.resolve() != cfg.SOURCE_DIR.resolve() or not pending_derivative.name.endswith(".pending.blend"):
        raise RuntimeError("refusing unsafe refined derivative staging path")
    generated_report_paths = (cfg.PREFLIGHT_REPORT, cfg.RECOVERY_REPORT, cfg.RECOVERY_BACKUP_SUMMARY, cfg.BUILD_REPORT, cfg.ASSET_LEDGER)
    if not preflight_only:
        if pending_derivative.exists():
            raise RuntimeError(f"refusing to overwrite an existing pending derivative: {pending_derivative}")
        existing_reports = [path.name for path in generated_report_paths if path.exists()]
        if existing_reports:
            raise RuntimeError(f"refusing to overwrite pre-existing refined source reports: {existing_reports}")
        producer_authorities = required_producer_authorities(require_git_tracked=True)
    else:
        producer_authorities = {}
    if sha256(cfg.Q_WHITE_SVG) != cfg.Q_WHITE_SVG_SHA256 or sha256(cfg.Q_COLOR_SVG) != cfg.Q_COLOR_SVG_SHA256:
        raise RuntimeError("official Q SVG hash mismatch")
    q_report = json.loads(cfg.Q_PROVENANCE_REPORT.read_text(encoding="utf-8"))
    if q_report.get("status") != "PASS" or q_report["metrics"]["topologyDifferencePixels"] != 0:
        raise RuntimeError("exact-Q provenance must PASS before Blender construction")
    if q_report.get("producerAuthority") != file_record(SCRIPT_DIR / "generate_phase4r1_exact_q.mjs"):
        raise RuntimeError("exact-Q provenance is stale against its tracked deterministic generator")

    privacy_ui_state = sanitize_file_browser_ui_state()

    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    accepted_before = accepted_crt_signature()
    camera_before = camera_path_signature()
    establishing_before = establishing_aim_signature()
    configure_scene()
    material_authority = cfg.HALL_VISUAL_AUTHORITY["materials"]
    materials = {
        "black": make_principled("Phase4R1V2_PrimaryBlack", cfg.PALETTE["primary_black"], 0.72, 0.12),
        "graphite": make_principled(material_authority["graphite"]["name"], material_authority["graphite"]["colorHex"], material_authority["graphite"]["roughness"], material_authority["graphite"]["metallic"]),
        "warm_dark": make_principled(material_authority["warmDark"]["name"], material_authority["warmDark"]["colorHex"], material_authority["warmDark"]["roughness"], material_authority["warmDark"]["metallic"]),
        "steel": make_principled(material_authority["steel"]["name"], material_authority["steel"]["colorHex"], material_authority["steel"]["roughness"], material_authority["steel"]["metallic"]),
        "cable": make_principled("Phase4R1V2_HeavyGraphiteCable", "#070909", 0.79, 0.0),
        "rubber": make_principled("Phase4R1V2_RestrainedRubber", "#080909", 0.84, 0.0),
        "current": make_current_material(),
    }
    environment = configure_environment(materials)
    environment["privacyUiState"] = privacy_ui_state
    connections = build_service_origin_and_rear(materials)
    cable = {family: build_cable_family(family, spec, materials, connections["endpoint"]) for family, spec in cfg.CABLE_FAMILIES.items()}
    for family, spec in cfg.CABLE_FAMILIES.items():
        bpy.data.collections[spec["collection"]].hide_render = family != "desktop"
    q = build_q_picture_plane(materials)
    establishing_aims = audit_establishing_aims_preserved()
    accepted_after = accepted_crt_signature()
    camera_after = camera_path_signature()
    establishing_after = establishing_aim_signature()
    if accepted_before["sha256"] != accepted_after["sha256"]:
        raise RuntimeError("accepted CRT physical/material/action/dependency/collection signature changed")
    old_q_before = {row["name"]: row["hideRender"] for row in accepted_before["supersededOldQVisibilityState"]}
    old_q_after = {row["name"]: row["hideRender"] for row in accepted_after["supersededOldQVisibilityState"]}
    expected_old_q_hidden = {"Phase4R0_QuantumQ_Accent": True, "Phase4R0_QuantumQ_Body": True}
    if old_q_before != expected_old_q_hidden or old_q_after != expected_old_q_hidden:
        raise RuntimeError(f"superseded approximate Q visibility must remain recovered-hidden without mutation: {old_q_before} -> {old_q_after}")
    old_q_unchanged_hidden = {
        "before": old_q_before,
        "after": old_q_after,
        "changed": old_q_before != old_q_after,
        "crtTrackMutationOccurred": False,
    }
    if camera_before["sha256"] != camera_after["sha256"]:
        raise RuntimeError("camera orbit/threshold action signature changed during refined build")
    if establishing_before["sha256"] != establishing_after["sha256"]:
        raise RuntimeError("recovered establishing-aim action signature changed during refined build")
    scene = bpy.context.scene
    scene["phase4r1v2_accepted_crt_signature_before"] = accepted_before["sha256"]
    scene["phase4r1v2_accepted_crt_signature_after"] = accepted_after["sha256"]
    scene["phase4r1v2_accepted_crt_object_count"] = accepted_after["objectCount"]
    scene["phase4r1v2_camera_path_signature_before"] = camera_before["sha256"]
    scene["phase4r1v2_camera_path_signature_after"] = camera_after["sha256"]
    scene["phase4r1v2_establishing_aim_signature_before"] = establishing_before["sha256"]
    scene["phase4r1v2_establishing_aim_signature_after"] = establishing_after["sha256"]
    scene["phase4r1v2_preservation_signature_schema"] = cfg.PRESERVATION_SIGNATURE_SCHEMA
    scene["phase4r1v2_persistence_exclusion_authority_json"] = json.dumps(
        cfg.PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY,
        sort_keys=True,
        separators=(",", ":"),
    )
    scene["phase4r1v2_old_approximate_q_visibility_unchanged_hidden_json"] = json.dumps(old_q_unchanged_hidden, sort_keys=True, separators=(",", ":"))
    scene["phase4r1v2_crt_track_mutation_occurred"] = False
    scene["phase4r1v2_preservation_signature_frame"] = 1
    scene.camera = bpy.data.objects[cfg.CAMERAS["desktop"]]
    scene.frame_set(1)

    preflight_report = preflight.audit_scene()
    if preflight_only:
        dry_run_producers = {
            "config": file_record(SCRIPT_DIR / "phase4r1_refined_config.py"),
            "builder": file_record(Path(__file__).resolve()),
            "preflight": file_record(SCRIPT_DIR / "preflight_phase4r1_refined_geometry.py"),
            "exactQGenerator": file_record(SCRIPT_DIR / "generate_phase4r1_exact_q.mjs"),
            "exactQProvenance": file_record(cfg.Q_PROVENANCE_REPORT),
        }
        dry_run_token = canonical_hash(dry_run_producers)[:16]
        dry_run_report = Path(tempfile.gettempdir()) / f"quantum-hub-phase4r1-refined-preflight-dry-run-{dry_run_token}.json"
        if dry_run_report.exists():
            raise RuntimeError(f"refusing to overwrite preserved versioned dry-run evidence: {dry_run_report}")
        preflight_report["dryRunProducerAuthorities"] = dry_run_producers
        preflight_report["dryRunEvidenceId"] = dry_run_token
        preflight_report["priorFixedNameDryRunPreserved"] = "quantum-hub-phase4r1-refined-preflight-dry-run.json"
        dry_run_report.write_text(json.dumps(preflight_report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"QH_PHASE4R1_REFINED_DRY_RUN_REPORT={dry_run_report}")
        print(f"QH_PHASE4R1_REFINED_DRY_RUN_STATUS={preflight_report['status']}")
        if preflight_report["status"] != "PASS":
            raise RuntimeError(f"in-memory refined source preflight failed: {preflight_report['summary']}")
        print("QH_PHASE4R1_REFINED_DRY_RUN_NO_SAVE=TRUE")
        return
    if preflight_report["status"] != "PASS":
        raise RuntimeError(f"pre-save refined source preflight failed: {preflight_report['summary']}")

    published_final_by_this_run = False
    published_identity: tuple[int, int, int] | None = None
    try:
        preflight.write_report(preflight_report)
        write_recovery_reports()
        # Save to a fail-safe staging filename.  The published derivative is
        # moved into place only after every source report has serialized.
        save_result = bpy.ops.wm.save_as_mainfile(
            filepath=str(pending_derivative),
            check_existing=False,
            relative_remap=False,
        )
        if save_result != {"FINISHED"}:
            raise RuntimeError(f"Blender did not finish the exact one staged save: {save_result}")
        if Path(bpy.data.filepath).resolve() != pending_derivative.resolve() or not pending_derivative.is_file():
            raise RuntimeError("Blender did not create the exact contained pending derivative")
        saved_q_image = bpy.data.images.get(q["image"])
        saved_q_bytes = b"" if saved_q_image is None or saved_q_image.packed_file is None else bytes(saved_q_image.packed_file.data)
        saved_q_filepath_raw = "" if saved_q_image is None else str(saved_q_image.filepath or "")
        saved_q_packed_file_entries = [] if saved_q_image is None else list(saved_q_image.packed_files)
        saved_q_packed_file_entry_raw = "" if len(saved_q_packed_file_entries) != 1 else str(saved_q_packed_file_entries[0].filepath or "")
        saved_q_image_filepath_buffer_overwrite_realized_characters = 0 if saved_q_image is None else int(saved_q_image.get("phase4r1v2_filepath_buffer_overwrite_realized_characters", 0))
        saved_scene_q_image_filepath_buffer_overwrite_realized_characters = int(scene.get("phase4r1v2_q_filepath_overwrite_chars", 0))
        try:
            saved_q_filepath_canonical = cfg.canonical_blender_repo_relative_path(
                saved_q_filepath_raw,
                cfg.CANONICAL_Q_IMAGE_FILEPATH,
            )
            saved_q_packed_file_entry_canonical = cfg.canonical_blender_repo_relative_path(
                saved_q_packed_file_entry_raw,
                cfg.CANONICAL_Q_IMAGE_FILEPATH,
            )
        except ValueError as exc:
            raise RuntimeError("staged one-save changed a canonical packed exact-Q filepath") from exc
        saved_q_sha256 = None if not saved_q_bytes else hashlib.sha256(saved_q_bytes).hexdigest()
        if (
            saved_q_image is None
            or len(saved_q_packed_file_entries) != 1
            or saved_q_filepath_canonical != cfg.CANONICAL_Q_IMAGE_FILEPATH
            or saved_q_packed_file_entry_canonical != cfg.CANONICAL_Q_IMAGE_FILEPATH
            or saved_q_image_filepath_buffer_overwrite_realized_characters < cfg.IMAGE_FILEPATH_BUFFER_OVERWRITE_MINIMUM_CHARACTERS
            or saved_scene_q_image_filepath_buffer_overwrite_realized_characters != saved_q_image_filepath_buffer_overwrite_realized_characters
            or len(saved_q_bytes) != cfg.Q_TEXTURE_PRE_CRT.stat().st_size
            or saved_q_sha256 != sha256(cfg.Q_TEXTURE_PRE_CRT)
        ):
            raise RuntimeError("staged one-save changed a canonical packed exact-Q filepath or bytes")
        post_save_privacy_ui_state = audit_file_browser_ui_state()
        if not post_save_privacy_ui_state["passes"]:
            raise RuntimeError(f"staged one-save retained private file-browser UI state: {post_save_privacy_ui_state}")
        environment["postSavePrivacyUiStateAssertion"] = post_save_privacy_ui_state
        pending_derivative_lowered = pending_derivative.read_bytes().lower()
        if b"c:\\users\\amir" in pending_derivative_lowered or b"c:/users/amir" in pending_derivative_lowered:
            raise RuntimeError("staged one-save retained a private absolute user path")
        q["postSavePackedImageAssertion"] = {
            "rawFilepath": saved_q_filepath_raw,
            "canonicalFilepath": saved_q_filepath_canonical,
            "expectedCanonicalFilepath": cfg.CANONICAL_Q_IMAGE_FILEPATH,
            "imageFilepathBufferOverwriteMinimumCharacters": cfg.IMAGE_FILEPATH_BUFFER_OVERWRITE_MINIMUM_CHARACTERS,
            "imageFilepathBufferOverwriteRealizedCharacters": saved_q_image_filepath_buffer_overwrite_realized_characters,
            "sceneImageFilepathBufferOverwriteRealizedCharacters": saved_scene_q_image_filepath_buffer_overwrite_realized_characters,
            "packedFileEntryCount": len(saved_q_packed_file_entries),
            "packedFileEntryRawFilepath": saved_q_packed_file_entry_raw,
            "packedFileEntryCanonicalFilepath": saved_q_packed_file_entry_canonical,
            "packedBytes": len(saved_q_bytes),
            "packedSha256": saved_q_sha256,
            "stagedDerivativePrivateByteScanPassed": True,
            "passes": True,
        }
        derivative = file_record(pending_derivative)
        derivative["path"] = cfg.DERIVATIVE_SOURCE.resolve().relative_to(cfg.REPOSITORY_ROOT.resolve()).as_posix()
        build = {
            "schema": "quantum-hub.phase-4-r1.refined-proving-hall.source-build.v2",
            "status": "PASS",
            "generatedAt": cfg.GENERATED_AT,
            "blenderVersion": bpy.app.version_string,
            "sourceAuthorities": {"recoveredDerivative": file_record(cfg.RECOVERED_SOURCE), "refinedDerivative": derivative, "recoveredBuild": file_record(cfg.RECOVERED_BUILD_REPORT), "recoveredValidation": file_record(cfg.RECOVERED_VALIDATION_REPORT), "exactQProvenance": file_record(cfg.Q_PROVENANCE_REPORT)},
            "producerAuthorities": producer_authorities,
            "design": {"concept": "dark restrained industrial hall; deliberately empty central floor; one active wide-to-tight spiral and accepted old CRT", "palette": cfg.PALETTE, "environment": environment, "connections": {key: value for key, value in connections.items() if key != "endpoint"}, "cable": cable, "q": q, "establishingAimsPreserved": establishing_aims},
            "preflight": {"authority": file_record(cfg.PREFLIGHT_REPORT), "summary": preflight_report["summary"], "audits": preflight_report["audits"]},
            "preservation": {"preservationSignatureSchema": cfg.PRESERVATION_SIGNATURE_SCHEMA, "persistenceVolatileRnaPropertyExclusionAuthority": cfg.PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY, "acceptedCrtBefore": accepted_before, "acceptedCrtAfter": accepted_after, "acceptedCrtPhysicalMaterialsActionsUnchanged": True, "oldApproximateQVisibilityUnchangedHidden": old_q_unchanged_hidden, "cameraPathBefore": camera_before, "cameraPathAfter": camera_after, "cameraOrbitThresholdActionsAndStaticRigStateUnchanged": True, "establishingAimBefore": establishing_before, "establishingAimAfter": establishing_after, "establishingAimActionsAndStaticStateUnchanged": True, "recoveredSourceOverwritten": False},
            "full540FrameCyclesProductionFilmStarted": False,
            "full540FrameCyclesProductionFilmResumed": False,
            "refinedPhysicalMediaRuntimeIntegrationStarted": False,
            "chromeStatePolicyImplementationEvidenced": True,
            "humanAccepted": False,
            "phase5Authorized": False,
            "authorization": cfg.AUTHORIZATION,
        }
        cfg.BUILD_REPORT.write_text(json.dumps(build, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        write_asset_ledger(derivative, build)
        if cfg.DERIVATIVE_SOURCE.exists():
            raise RuntimeError(f"refusing publication because refined derivative appeared concurrently: {cfg.DERIVATIVE_SOURCE}")
        # Same-volume hard-link publication is atomic and create-only: unlike
        # os.replace(), it cannot overwrite a final path that appears between
        # the absence check above and the filesystem operation.
        try:
            os.link(pending_derivative, cfg.DERIVATIVE_SOURCE, follow_symlinks=False)
        except FileExistsError as exc:
            raise RuntimeError(f"refusing to overwrite concurrently published refined derivative: {cfg.DERIVATIVE_SOURCE}") from exc
        published_final_by_this_run = True
        final_stat = cfg.DERIVATIVE_SOURCE.stat(follow_symlinks=False)
        published_identity = (int(final_stat.st_dev), int(final_stat.st_ino), int(final_stat.st_size))
        if not os.path.samefile(pending_derivative, cfg.DERIVATIVE_SOURCE):
            raise RuntimeError("atomic no-clobber publication did not create the expected hard-linked final")
        published_record = file_record(cfg.DERIVATIVE_SOURCE)
        if published_record != derivative:
            raise RuntimeError({"message": "published refined derivative differs from staged authority", "staged": derivative, "published": published_record})
        pending_derivative.unlink()
    except BaseException:
        if published_final_by_this_run and published_identity is not None and cfg.DERIVATIVE_SOURCE.is_file():
            final_stat = cfg.DERIVATIVE_SOURCE.stat(follow_symlinks=False)
            current_identity = (int(final_stat.st_dev), int(final_stat.st_ino), int(final_stat.st_size))
            if current_identity == published_identity:
                cfg.DERIVATIVE_SOURCE.unlink()
        if pending_derivative.is_file() and pending_derivative.parent.resolve() == cfg.SOURCE_DIR.resolve():
            pending_derivative.unlink()
        for report_path in generated_report_paths:
            if report_path.is_file() and report_path.parent.resolve() == cfg.SOURCE_DIR.resolve():
                report_path.unlink()
        raise
    print(f"QH_PHASE4R1_REFINED_DERIVATIVE={cfg.DERIVATIVE_SOURCE}")
    print(f"QH_PHASE4R1_REFINED_DERIVATIVE_SHA256={derivative['sha256']}")
    print(f"QH_PHASE4R1_REFINED_PREFLIGHT_STATUS={preflight_report['status']}")


if __name__ == "__main__":
    main()
