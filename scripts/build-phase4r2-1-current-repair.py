"""Build and validate the cumulative Phase 4-R2.1 current-only Blender repair.

Run with Blender 5.2 after opening the immutable R1.1 authority::

    blender -b <r1.1.blend> --python scripts/build-phase4r2-1-current-repair.py -- \
      --output-blend <r2.1.blend> --report <build-report.json>

The script refuses any input whose SHA-256 differs from the accepted R1.1
authority.  It mutates only the current overlay cross-section/material, the
post-arrival front fade, and the twelve local-response lights.  It saves to a
new path, reopens that derivative, and repeats the frozen-state audit.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path
from typing import Any, Iterable

import bpy


SCHEMA = "quantum-hub.phase-4-r2-1.current-source-build.v1"
EXPECTED_SOURCE_SHA256 = "b0c9c7c1cf5a1642870cf03a36791cc50ec31ac207aeae794fbea83c856a79c0"
EXPECTED_SOURCE_NAME = "quantum-signal-television-phase4r1-1-periphery-current-mobile-crt.blend"
CURRENT_MATERIAL = "Phase4R1V2_ExactArcLengthCurrentSurface"
# Physical current authority.  Keep the accepted 0.0305 m round overlay and
# reveal only a narrow world-up cap.  Unlike the rejected offset bevel, this
# mask does not rotate with curve tilt.  A raised, view-facing fallback is
# restricted to the short terminal lift where a world-up normal is undefined.
OVERLAY_RADIUS_M = 0.0305
SHEATH_TOP_OFFSET_M = 0.029
CAP_VISIBILITY_NORMAL_Z = (0.90, 0.985)
CAP_CORE_NORMAL_Z = (0.955, 0.998)
TERMINAL_RAISED_Z_M = (0.075, 0.15)
TERMINAL_VIEW_VISIBILITY = (0.72, 0.92)
TERMINAL_VIEW_CORE = (0.88, 0.98)

EMISSION_STRENGTH = 1.15
CHANNEL_HOUSING_COLOR = "#030505"
CHANNEL_HOUSING_ROUGHNESS = 0.82
OBJECT_COLOR_TINT = (0.86, 0.58, 0.82, 1.0)

# Every original arrival remains unchanged.  Only the fade to the accepted
# 0.44 trail state is brought forward from arrival+13 to arrival+6.
FRONT_DURATION_FRAMES = 6
TRAIL_ALPHA = 0.44

# The point lights now provide a small floor response within one cable turn;
# they cannot illuminate neighbouring spiral turns.
LOCAL_RESPONSE_PEAK_W = 6.0
LOCAL_RESPONSE_TRAIL_W = 0.65
LOCAL_RESPONSE_CUTOFF_M = 0.55
LOCAL_RESPONSE_SOFT_SIZE_M = 0.12

FAMILY_LABEL = {
    "desktop": "desktop",
    "mobile": "portrait",
    "landscape": "landscape",
}


def parse_args() -> argparse.Namespace:
    separator = sys.argv.index("--") if "--" in sys.argv else len(sys.argv)
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-blend", required=True)
    parser.add_argument("--report", required=True)
    return parser.parse_args(sys.argv[separator + 1 :])


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_hash(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def rounded(value: float, digits: int = 8) -> float:
    return round(float(value), digits)


def vector(values: Iterable[float]) -> list[float]:
    return [rounded(value) for value in values]


def srgb(hex_value: str) -> tuple[float, float, float, float]:
    value = hex_value.lstrip("#")
    channels = [int(value[index : index + 2], 16) / 255.0 for index in (0, 2, 4)]
    return (*channels, 1.0)


def load_r11_module(repo_root: Path):
    source_dir = repo_root / "artifacts" / "original" / "phase-4r1-1-periphery-current-mobile-crt" / "source"
    module_path = source_dir / "build_phase4r1_1_targeted_repair.py"
    sys.path.insert(0, str(source_dir))
    spec = importlib.util.spec_from_file_location("phase4r1_1_authority", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load the cumulative R1.1 authority helpers")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def action_curves(r11: Any, owner: Any) -> list[Any]:
    animation = getattr(owner, "animation_data", None)
    action = None if animation is None else animation.action
    return [] if action is None else list(r11.iter_action_fcurves(action))


def current_route_record(inventory: dict[str, Any]) -> dict[str, Any]:
    families: dict[str, Any] = {}
    for family, record in inventory["families"].items():
        objects = []
        for obj in record["currents"]:
            splines = []
            for spline in obj.data.splines:
                if spline.type == "BEZIER":
                    points = [
                        {
                            "co": vector(point.co),
                            "left": vector(point.handle_left),
                            "right": vector(point.handle_right),
                            "tilt": rounded(point.tilt),
                            "radius": rounded(point.radius),
                        }
                        for point in spline.bezier_points
                    ]
                else:
                    points = [
                        {
                            "co": vector(point.co),
                            "tilt": rounded(point.tilt),
                            "radius": rounded(point.radius),
                            "weight": rounded(point.weight),
                        }
                        for point in spline.points
                    ]
                splines.append(
                    {
                        "type": spline.type,
                        "cyclic": bool(spline.use_cyclic_u),
                        "points": points,
                    }
                )
            objects.append(
                {
                    "name": obj.name,
                    "data": obj.data.name,
                    "matrixWorld": [vector(row) for row in obj.matrix_world],
                    "segmentIndex": int(obj["phase4r1v2_segment_index"]),
                    "arrivalFrame": int(obj["phase4r1v2_arrival_frame"]),
                    "arcStartM": rounded(obj["phase4r1v2_arc_start_m"]),
                    "arcEndM": rounded(obj["phase4r1v2_arc_end_m"]),
                    "splines": splines,
                }
            )
        families[family] = objects
    return families


def arrival_authority(r11: Any, inventory: dict[str, Any]) -> dict[str, Any]:
    families: dict[str, Any] = {}
    for family, record in inventory["families"].items():
        rows = []
        for obj in record["currents"]:
            arrival = int(obj["phase4r1v2_arrival_frame"])
            alpha_curve = next(
                (
                    curve
                    for curve in action_curves(r11, obj)
                    if curve.data_path == "color" and int(curve.array_index) == 3
                ),
                None,
            )
            if alpha_curve is None:
                raise RuntimeError(f"missing alpha animation on {obj.name}")
            keys = {rounded(point.co.x): rounded(point.co.y) for point in alpha_curve.keyframe_points}
            if keys.get(float(arrival)) != 1.0 or keys.get(float(max(45, arrival - 1))) != 0.0:
                raise RuntimeError(f"{obj.name} lost its exact arrival edge")
            rows.append(
                {
                    "name": obj.name,
                    "segmentIndex": int(obj["phase4r1v2_segment_index"]),
                    "arrivalFrame": arrival,
                    "preArrivalAlpha": keys[float(max(45, arrival - 1))],
                    "arrivalAlpha": keys[float(arrival)],
                }
            )
        arrivals = [row["arrivalFrame"] for row in rows]
        families[family] = {
            "count": len(rows),
            "first": min(arrivals),
            "last": max(arrivals),
            "monotonic": arrivals == sorted(arrivals),
            "rowsSha256": canonical_hash(rows),
        }
    return families


def node_tree_record(r11: Any, tree: Any) -> Any:
    if tree is None:
        return None
    nodes = []
    for node in sorted(tree.nodes, key=lambda item: item.name):
        nodes.append(
            {
                "name": node.name,
                "type": node.bl_idname,
                "properties": r11.rna_simple_properties(node),
                "inputs": [r11.node_socket_record(socket) for socket in node.inputs],
                "outputs": [r11.node_socket_record(socket) for socket in node.outputs],
            }
        )
    links = sorted(
        (
            link.from_node.name,
            link.from_socket.identifier,
            link.to_node.name,
            link.to_socket.identifier,
        )
        for link in tree.links
    )
    return {"name": tree.name, "nodes": nodes, "links": links}


def world_record(r11: Any, world: Any) -> dict[str, Any]:
    return {
        "name": world.name,
        "properties": r11.rna_simple_properties(world),
        "custom": r11.all_custom_properties(world),
        "nodeTree": node_tree_record(r11, world.node_tree if world.use_nodes else None),
    }


def frozen_snapshot(
    r11: Any,
    inventory: dict[str, Any],
    original_collection_names: set[str],
    original_object_names: set[str],
) -> dict[str, str]:
    allowed_objects = {obj.name for obj in inventory["currents"] + inventory["responses"]}
    allowed_actions = set()
    for obj in inventory["currents"]:
        if obj.animation_data and obj.animation_data.action:
            allowed_actions.add(obj.animation_data.action.name)
    for obj in inventory["responses"]:
        if obj.data.animation_data and obj.data.animation_data.action:
            allowed_actions.add(obj.data.animation_data.action.name)

    object_records = [
        r11.object_signature(bpy.data.objects[name])
        for name in sorted(original_object_names - allowed_objects)
    ]
    material_records = r11.material_records(
        name for name in sorted(bpy.data.materials.keys()) if name != CURRENT_MATERIAL
    )
    action_records = {
        action.name: r11.action_datablock_record(action, exclude_target_mobile_lens=False)
        for action in sorted(bpy.data.actions, key=lambda item: item.name)
        if action.name not in allowed_actions
    }
    collection_records = []
    for name in sorted(original_collection_names):
        collection = bpy.data.collections[name]
        collection_records.append(
            {
                "name": name,
                "hideRender": bool(collection.hide_render),
                "hideViewport": bool(collection.hide_viewport),
                "objects": sorted(obj.name for obj in collection.objects),
                "children": sorted(child.name for child in collection.children),
            }
        )
    scenes = []
    for scene in sorted(bpy.data.scenes, key=lambda item: item.name):
        scenes.append(
            {
                "name": scene.name,
                "camera": None if scene.camera is None else scene.camera.name,
                "world": None if scene.world is None else scene.world.name,
                "timeline": r11.timeline_record(scene),
                "frame": r11.scene_frame_record(scene),
                "render": {
                    "engine": scene.render.engine,
                    "resolution": [scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage],
                    "fps": scene.render.fps,
                    "filmTransparent": bool(scene.render.film_transparent),
                },
                "view": {
                    "transform": scene.view_settings.view_transform,
                    "look": scene.view_settings.look,
                    "exposure": rounded(scene.view_settings.exposure),
                    "gamma": rounded(scene.view_settings.gamma),
                },
            }
        )
    worlds = [world_record(r11, world) for world in sorted(bpy.data.worlds, key=lambda item: item.name)]
    return {
        "nonCurrentObjects": canonical_hash(object_records),
        "nonCurrentMaterials": canonical_hash(material_records),
        "nonCurrentActions": canonical_hash(action_records),
        "originalCollections": canonical_hash(collection_records),
        "scenes": canonical_hash(scenes),
        "worlds": canonical_hash(worlds),
        # Save-As necessarily rebases the unpacked fallback spelling when the
        # derivative lives in a sibling artifact directory.  The packed path,
        # byte count, and byte hash are the immutable Q authority.
        "exactQ": canonical_hash(
            {
                key: value
                for key, value in r11.packed_q_record().items()
                if key in {"name", "packedFilepath", "bytes", "sha256"}
            }
        ),
        "periphery": canonical_hash(r11.periphery_authority_snapshot()),
        "cameras": canonical_hash(
            {
                "desktop": r11.camera_family_hash("desktop"),
                "portrait": r11.camera_family_hash("mobile"),
                "landscape": r11.camera_family_hash("landscape"),
            }
        ),
    }


def data_inventory() -> dict[str, list[str]]:
    return {
        "objects": sorted(bpy.data.objects.keys()),
        "collections": sorted(bpy.data.collections.keys()),
        "curves": sorted(bpy.data.curves.keys()),
        "materials": sorted(bpy.data.materials.keys()),
        "lights": sorted(bpy.data.lights.keys()),
        "actions": sorted(bpy.data.actions.keys()),
        "cameras": sorted(bpy.data.cameras.keys()),
        "images": sorted(bpy.data.images.keys()),
        "scenes": sorted(bpy.data.scenes.keys()),
        "worlds": sorted(bpy.data.worlds.keys()),
    }


def exact_q_record(r11: Any) -> dict[str, Any]:
    packed = r11.packed_q_record()
    image = bpy.data.images[packed["name"]]
    repo_root = Path(__file__).resolve().parents[1]
    resolved = Path(bpy.path.abspath(image.filepath)).resolve()
    try:
        fallback_authority = resolved.relative_to(repo_root).as_posix()
    except ValueError:
        fallback_authority = "<REPO_ROOT>/" + resolved.name
    return {
        **packed,
        "repositoryRelativeFallbackAuthority": fallback_authority,
    }


def accepted_overlay_authority(inventory: dict[str, Any]) -> dict[str, Any]:
    records = []
    for obj in inventory["currents"]:
        curve = obj.data
        record = {
            "object": obj.name,
            "data": curve.name,
            "bevelMode": curve.bevel_mode,
            "bevelDepthMeters": rounded(curve.bevel_depth),
            "bevelResolution": int(curve.bevel_resolution),
            "bevelObject": None if curve.bevel_object is None else curve.bevel_object.name,
            "fillCaps": bool(curve.use_fill_caps),
        }
        if (
            record["bevelMode"] != "ROUND"
            or abs(record["bevelDepthMeters"] - OVERLAY_RADIUS_M) > 1e-8
            or record["bevelResolution"] != 8
            or record["bevelObject"] is not None
            or record["fillCaps"]
        ):
            raise RuntimeError(f"accepted round current overlay changed on {obj.name}")
        records.append(record)
    return {
        "curveCount": len(records),
        "overlayRadiusMeters": OVERLAY_RADIUS_M,
        "bevelResolution": 8,
        "sha256": canonical_hash(records),
    }


def rebuild_current_material() -> bpy.types.Material:
    material = bpy.data.materials.get(CURRENT_MATERIAL)
    if material is None or material.node_tree is None:
        raise RuntimeError("accepted current material is missing")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.name = "Phase4R21_Current_Output"
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    transparent.name = "Phase4R21_Current_DormantTransparent"
    housing = nodes.new("ShaderNodeBsdfPrincipled")
    housing.name = "Phase4R21_Current_PhysicalChannelHousing"
    housing.inputs["Base Color"].default_value = srgb(CHANNEL_HOUSING_COLOR)
    housing.inputs["Roughness"].default_value = CHANNEL_HOUSING_ROUGHNESS
    housing.inputs["Metallic"].default_value = 0.0
    housing.inputs["Emission Strength"].default_value = 0.0
    housing.inputs["Transmission Weight"].default_value = 0.0
    emission = nodes.new("ShaderNodeEmission")
    emission.name = "Phase4R21_Current_ContainedEmission"
    emission.inputs["Strength"].default_value = EMISSION_STRENGTH
    info = nodes.new("ShaderNodeObjectInfo")
    info.name = "Phase4R21_Current_ExactAnimatedObjectInfo"
    tint = nodes.new("ShaderNodeMixRGB")
    tint.name = "Phase4R21_Current_DeepMagentaTint"
    tint.blend_type = "MULTIPLY"
    tint.inputs[0].default_value = 1.0
    tint.inputs[2].default_value = OBJECT_COLOR_TINT
    add = nodes.new("ShaderNodeAddShader")
    add.name = "Phase4R21_Current_HousingPlusSignal"
    visible = nodes.new("ShaderNodeMixShader")
    visible.name = "Phase4R21_Current_ExactAlphaVisibility"

    geometry = nodes.new("ShaderNodeNewGeometry")
    geometry.name = "Phase4R21_Current_WorldGeometry"
    normal_components = nodes.new("ShaderNodeSeparateXYZ")
    normal_components.name = "Phase4R21_Current_WorldNormalComponents"
    position_components = nodes.new("ShaderNodeSeparateXYZ")
    position_components.name = "Phase4R21_Current_WorldPositionComponents"

    def float_map(name: str, minimum: float, maximum: float) -> Any:
        node = nodes.new("ShaderNodeMapRange")
        node.name = name
        node.data_type = "FLOAT"
        node.interpolation_type = "SMOOTHERSTEP"
        node.clamp = True
        enabled = lambda socket_name: next(
            socket for socket in node.inputs if socket.name == socket_name and socket.enabled
        )
        enabled("From Min").default_value = minimum
        enabled("From Max").default_value = maximum
        enabled("To Min").default_value = 0.0
        enabled("To Max").default_value = 1.0
        return node

    cap_visibility = float_map(
        "Phase4R21_Current_GlobalUpCapVisibility",
        *CAP_VISIBILITY_NORMAL_Z,
    )
    cap_core = float_map("Phase4R21_Current_GlobalUpCapCore", *CAP_CORE_NORMAL_Z)
    raised_gate = float_map("Phase4R21_Current_RaisedTerminalGate", *TERMINAL_RAISED_Z_M)
    facing_dot = nodes.new("ShaderNodeVectorMath")
    facing_dot.name = "Phase4R21_Current_RaisedTerminalFacingDot"
    facing_dot.operation = "DOT_PRODUCT"
    facing_absolute = nodes.new("ShaderNodeMath")
    facing_absolute.name = "Phase4R21_Current_RaisedTerminalFacingAbsolute"
    facing_absolute.operation = "ABSOLUTE"
    terminal_visibility_window = float_map(
        "Phase4R21_Current_RaisedTerminalVisibility",
        *TERMINAL_VIEW_VISIBILITY,
    )
    terminal_core_window = float_map(
        "Phase4R21_Current_RaisedTerminalCore",
        *TERMINAL_VIEW_CORE,
    )
    terminal_visibility = nodes.new("ShaderNodeMath")
    terminal_visibility.name = "Phase4R21_Current_RaisedTerminalVisibilityGate"
    terminal_visibility.operation = "MULTIPLY"
    terminal_core = nodes.new("ShaderNodeMath")
    terminal_core.name = "Phase4R21_Current_RaisedTerminalCoreGate"
    terminal_core.operation = "MULTIPLY"
    combined_visibility = nodes.new("ShaderNodeMath")
    combined_visibility.name = "Phase4R21_Current_GlobalUpOrRaisedTerminalVisibility"
    combined_visibility.operation = "MAXIMUM"
    combined_core = nodes.new("ShaderNodeMath")
    combined_core.name = "Phase4R21_Current_GlobalUpOrRaisedTerminalCore"
    combined_core.operation = "MAXIMUM"
    alpha_visibility = nodes.new("ShaderNodeMath")
    alpha_visibility.name = "Phase4R21_Current_CapTimesExactAlpha"
    alpha_visibility.operation = "MULTIPLY"
    restrained_emission = nodes.new("ShaderNodeMath")
    restrained_emission.name = "Phase4R21_Current_CoreEmissionStrength"
    restrained_emission.operation = "MULTIPLY"
    restrained_emission.inputs[1].default_value = EMISSION_STRENGTH

    links.new(info.outputs["Color"], tint.inputs[1])
    links.new(tint.outputs["Color"], emission.inputs["Color"])
    links.new(geometry.outputs["Normal"], normal_components.inputs["Vector"])
    links.new(geometry.outputs["Position"], position_components.inputs["Vector"])
    links.new(normal_components.outputs["Z"], next(socket for socket in cap_visibility.inputs if socket.name == "Value" and socket.enabled))
    links.new(normal_components.outputs["Z"], next(socket for socket in cap_core.inputs if socket.name == "Value" and socket.enabled))
    links.new(position_components.outputs["Z"], next(socket for socket in raised_gate.inputs if socket.name == "Value" and socket.enabled))
    links.new(geometry.outputs["Normal"], facing_dot.inputs[0])
    links.new(geometry.outputs["Incoming"], facing_dot.inputs[1])
    links.new(facing_dot.outputs["Value"], facing_absolute.inputs[0])
    links.new(facing_absolute.outputs[0], next(socket for socket in terminal_visibility_window.inputs if socket.name == "Value" and socket.enabled))
    links.new(facing_absolute.outputs[0], next(socket for socket in terminal_core_window.inputs if socket.name == "Value" and socket.enabled))
    links.new(raised_gate.outputs["Result"], terminal_visibility.inputs[0])
    links.new(terminal_visibility_window.outputs["Result"], terminal_visibility.inputs[1])
    links.new(raised_gate.outputs["Result"], terminal_core.inputs[0])
    links.new(terminal_core_window.outputs["Result"], terminal_core.inputs[1])
    links.new(cap_visibility.outputs["Result"], combined_visibility.inputs[0])
    links.new(terminal_visibility.outputs[0], combined_visibility.inputs[1])
    links.new(cap_core.outputs["Result"], combined_core.inputs[0])
    links.new(terminal_core.outputs[0], combined_core.inputs[1])
    links.new(combined_visibility.outputs[0], alpha_visibility.inputs[0])
    links.new(info.outputs["Alpha"], alpha_visibility.inputs[1])
    links.new(combined_core.outputs[0], restrained_emission.inputs[0])
    links.new(restrained_emission.outputs[0], emission.inputs["Strength"])
    links.new(housing.outputs["BSDF"], add.inputs[0])
    links.new(emission.outputs["Emission"], add.inputs[1])
    links.new(alpha_visibility.outputs[0], visible.inputs[0])
    links.new(transparent.outputs["BSDF"], visible.inputs[1])
    links.new(add.outputs[0], visible.inputs[2])
    links.new(visible.outputs[0], output.inputs["Surface"])

    material.surface_render_method = "DITHERED"
    material.use_backface_culling = False
    material.diffuse_color = (*srgb(CHANNEL_HOUSING_COLOR)[:3], 0.0)
    for key in list(material.keys()):
        if key.startswith("phase4r1_1_") or key.startswith("phase4r1v2_"):
            del material[key]
    material["phase4r2_1_material_role"] = "continuous global-up physical current channel within accepted round overlay"
    material["phase4r2_1_global_up_cap_visibility_normal_z"] = list(CAP_VISIBILITY_NORMAL_Z)
    material["phase4r2_1_global_up_cap_core_normal_z"] = list(CAP_CORE_NORMAL_Z)
    material["phase4r2_1_terminal_raised_z_m"] = list(TERMINAL_RAISED_Z_M)
    material["phase4r2_1_terminal_view_fallback_only"] = True
    material["phase4r2_1_emission_strength"] = EMISSION_STRENGTH
    material["phase4r2_1_housing_color"] = CHANNEL_HOUSING_COLOR
    material["phase4r2_1_housing_roughness"] = CHANNEL_HOUSING_ROUGHNESS
    material["phase4r2_1_exact_object_alpha_progression"] = True
    return material


def insert_or_replace(curve: Any, frame: float, value: float) -> None:
    existing = next((point for point in curve.keyframe_points if abs(point.co.x - frame) <= 1e-6), None)
    point = existing if existing is not None else curve.keyframe_points.insert(frame, value, options={"FAST"})
    point.co.y = value
    point.interpolation = "LINEAR"
    point.handle_left_type = "AUTO_CLAMPED"
    point.handle_right_type = "AUTO_CLAMPED"
    curve.update()


def narrow_front_actions(r11: Any, inventory: dict[str, Any]) -> dict[str, Any]:
    changed = []
    for obj in inventory["currents"]:
        arrival = int(obj["phase4r1v2_arrival_frame"])
        curves = [curve for curve in action_curves(r11, obj) if curve.data_path == "color"]
        if sorted(int(curve.array_index) for curve in curves) != [0, 1, 2, 3]:
            raise RuntimeError(f"unexpected color action on {obj.name}")
        for curve in curves:
            trail_point = next((point for point in curve.keyframe_points if abs(point.co.x - 500.0) <= 1e-6), None)
            if trail_point is None:
                raise RuntimeError(f"missing F500 trail key on {obj.name}")
            insert_or_replace(curve, arrival + FRONT_DURATION_FRAMES, float(trail_point.co.y))
        obj["phase4r2_1_front_duration_frames"] = FRONT_DURATION_FRAMES
        changed.append({"object": obj.name, "arrival": arrival, "trailReached": arrival + FRONT_DURATION_FRAMES})
    return {
        "changedObjectCount": len(changed),
        "frontDurationBefore": 13,
        "frontDurationAfter": FRONT_DURATION_FRAMES,
        "changedSha256": canonical_hash(changed),
    }


def constrain_response_lights(r11: Any, inventory: dict[str, Any]) -> dict[str, Any]:
    records = []
    for obj in inventory["responses"]:
        light = obj.data
        curves = [curve for curve in action_curves(r11, light) if curve.data_path == "energy"]
        if len(curves) != 1:
            raise RuntimeError(f"unexpected local-response action on {obj.name}")
        curve = curves[0]
        positive = [point for point in curve.keyframe_points if point.co.y > 0.0]
        if not positive:
            raise RuntimeError(f"missing local-response arrival on {obj.name}")
        arrival = int(round(min(point.co.x for point in positive)))
        insert_or_replace(curve, arrival, LOCAL_RESPONSE_PEAK_W)
        insert_or_replace(curve, arrival + FRONT_DURATION_FRAMES, LOCAL_RESPONSE_TRAIL_W)
        for point in curve.keyframe_points:
            if point.co.x > arrival + FRONT_DURATION_FRAMES:
                point.co.y = LOCAL_RESPONSE_TRAIL_W
                point.interpolation = "LINEAR"
        curve.update()
        light.energy = 0.0
        light.shadow_soft_size = LOCAL_RESPONSE_SOFT_SIZE_M
        light.use_custom_distance = True
        light.cutoff_distance = LOCAL_RESPONSE_CUTOFF_M
        light["phase4r2_1_spill_constrained"] = True
        light["phase4r2_1_peak_w"] = LOCAL_RESPONSE_PEAK_W
        light["phase4r2_1_trail_w"] = LOCAL_RESPONSE_TRAIL_W
        light["phase4r2_1_cutoff_m"] = LOCAL_RESPONSE_CUTOFF_M
        records.append(
            {
                "object": obj.name,
                "arrival": arrival,
                "peakW": LOCAL_RESPONSE_PEAK_W,
                "trailW": LOCAL_RESPONSE_TRAIL_W,
                "cutoffM": LOCAL_RESPONSE_CUTOFF_M,
            }
        )
    return {"changedLightCount": len(records), "records": records, "sha256": canonical_hash(records)}


def frame_coverage(inventory: dict[str, Any]) -> dict[str, Any]:
    scene = bpy.context.scene
    original = (scene.frame_current, scene.frame_subframe)
    result: dict[str, Any] = {}
    try:
        for family, record in inventory["families"].items():
            rows = []
            for frame in (45, 46, 225, 261, 284, 285, 286, 370, 494, 495, 500):
                scene.frame_set(frame)
                bpy.context.view_layer.update()
                alphas = [float(obj.color[3]) for obj in record["currents"]]
                energized = [value > 1e-7 for value in alphas]
                bright = [value > TRAIL_ALPHA + 0.01 for value in alphas]
                rows.append(
                    {
                        "frame": frame,
                        "energized": sum(energized),
                        "dark": len(energized) - sum(energized),
                        "brightFront": sum(bright),
                        "minimumEnergizedAlpha": rounded(min((value for value in alphas if value > 1e-7), default=0.0)),
                        "maximumAlpha": rounded(max(alphas)),
                        "origin": energized[0],
                        "connection": energized[-1],
                    }
                )
            result[FAMILY_LABEL[family]] = rows
    finally:
        scene.frame_set(original[0], subframe=original[1])
        bpy.context.view_layer.update()
    return result


def inventory_delta(before: dict[str, list[str]], after: dict[str, list[str]]) -> dict[str, Any]:
    result = {}
    for key in before:
        result[key] = {
            "added": sorted(set(after[key]) - set(before[key])),
            "removed": sorted(set(before[key]) - set(after[key])),
        }
    return result


def assert_equal(label: str, before: Any, after: Any) -> None:
    if before != after:
        raise RuntimeError(f"frozen authority changed: {label}")


def main() -> None:
    args = parse_args()
    script_path = Path(__file__).resolve()
    repo_root = script_path.parents[1]
    source = Path(bpy.data.filepath).resolve()
    output = Path(args.output_blend).resolve()
    report_path = Path(args.report).resolve()
    if source == output:
        raise RuntimeError("R2.1 output may not overwrite the immutable R1.1 authority")
    if source.name != EXPECTED_SOURCE_NAME or sha256_file(source) != EXPECTED_SOURCE_SHA256:
        raise RuntimeError("opened Blender source is not the exact accepted R1.1 authority")

    output.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    r11 = load_r11_module(repo_root)
    scene = bpy.context.scene
    original_frame = (scene.frame_current, scene.frame_subframe)
    scene.frame_set(1, subframe=0.0)
    bpy.context.view_layer.update()

    inventory = r11.configured_cable_inventory()
    original_collection_names = set(bpy.data.collections.keys())
    original_object_names = set(bpy.data.objects.keys())
    inventory_before = data_inventory()
    route_before = current_route_record(inventory)
    route_before_sha = canonical_hash(route_before)
    arrival_before = arrival_authority(r11, inventory)
    q_before = exact_q_record(r11)
    overlay_before = accepted_overlay_authority(inventory)
    frozen_before = frozen_snapshot(r11, inventory, original_collection_names, original_object_names)
    cable_before = r11.cable_authority_snapshot()

    material = rebuild_current_material()
    front_mutation = narrow_front_actions(r11, inventory)
    light_mutation = constrain_response_lights(r11, inventory)
    scene.frame_set(1, subframe=0.0)
    bpy.context.view_layer.update()

    route_after = current_route_record(inventory)
    route_after_sha = canonical_hash(route_after)
    arrival_after = arrival_authority(r11, inventory)
    overlay_after = accepted_overlay_authority(inventory)
    frozen_after = frozen_snapshot(r11, inventory, original_collection_names, original_object_names)
    inventory_after = data_inventory()
    assert_equal("current route points/order", route_before_sha, route_after_sha)
    assert_equal("arrival timing", arrival_before, arrival_after)
    assert_equal("accepted round current overlay", overlay_before, overlay_after)
    assert_equal("all non-current categories", frozen_before, frozen_after)

    delta = inventory_delta(inventory_before, inventory_after)
    expected_added: dict[str, list[str]] = {}
    for key, record in delta.items():
        if record["removed"]:
            raise RuntimeError(f"R2.1 removed datablocks from {key}: {record['removed']}")
        if record["added"] != expected_added.get(key, []):
            raise RuntimeError(f"unexpected R2.1 datablock additions in {key}: {record['added']}")

    coverage_after = frame_coverage(inventory)
    for family, rows in coverage_after.items():
        arrival = next(row for row in rows if row["frame"] == 285)
        if arrival["dark"] != 0 or not arrival["origin"] or not arrival["connection"]:
            raise RuntimeError(f"{family} no longer has complete F285 signal coverage")

    material_record = r11.material_graph_record(material)
    material_sha = canonical_hash(material_record)
    scene.frame_set(original_frame[0], subframe=original_frame[1])
    bpy.context.view_layer.update()
    # The derivative is reproducible authority, not an interactive edit.  Do
    # not leave Blender's redundant .blend1 backup beside it.
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(output), check_existing=False)
    saved_record = {"path": output.name, "bytes": output.stat().st_size, "sha256": sha256_file(output)}

    bpy.ops.wm.open_mainfile(filepath=str(output))
    scene = bpy.context.scene
    scene.frame_set(1, subframe=0.0)
    bpy.context.view_layer.update()
    reopened_inventory = r11.configured_cable_inventory()
    reopened_route_sha = canonical_hash(current_route_record(reopened_inventory))
    reopened_arrival = arrival_authority(r11, reopened_inventory)
    q_reopened = exact_q_record(r11)
    reopened_overlay = accepted_overlay_authority(reopened_inventory)
    reopened_frozen = frozen_snapshot(r11, reopened_inventory, original_collection_names, original_object_names)
    reopened_material_sha = canonical_hash(r11.material_graph_record(bpy.data.materials[CURRENT_MATERIAL]))
    reopened_coverage = frame_coverage(reopened_inventory)
    assert_equal("reopened current route", route_after_sha, reopened_route_sha)
    assert_equal("reopened arrival timing", arrival_after, reopened_arrival)
    assert_equal("reopened accepted round overlay", overlay_after, reopened_overlay)
    assert_equal("reopened packed Q bytes", q_before["bytes"], q_reopened["bytes"])
    assert_equal("reopened packed Q hash", q_before["sha256"], q_reopened["sha256"])
    assert_equal("reopened packed Q logical path", q_before["packedFilepath"], q_reopened["packedFilepath"])
    assert_equal(
        "reopened Q fallback authority",
        q_before["repositoryRelativeFallbackAuthority"],
        q_reopened["repositoryRelativeFallbackAuthority"],
    )
    if frozen_after != reopened_frozen:
        changed_frozen = {
            key: {"after": frozen_after.get(key), "reopened": reopened_frozen.get(key)}
            for key in sorted(set(frozen_after) | set(reopened_frozen))
            if frozen_after.get(key) != reopened_frozen.get(key)
        }
        print("PHASE4R2_1_REOPEN_FROZEN_DIFF=" + json.dumps(changed_frozen, sort_keys=True))
        raise RuntimeError("frozen authority changed: reopened frozen categories")
    assert_equal("reopened current material", material_sha, reopened_material_sha)

    final_file_record = {"path": output.name, "bytes": output.stat().st_size, "sha256": sha256_file(output)}
    if final_file_record != saved_record:
        raise RuntimeError("save/reopen changed the derivative file bytes")

    report = {
        "schema": SCHEMA,
        "status": "PASS",
        "source": {"path": source.name, "bytes": source.stat().st_size, "sha256": EXPECTED_SOURCE_SHA256},
        "derivative": final_file_record,
        "timeline": r11.timeline_record(scene),
        "parameters": {
            "channelSurface": {
                "type": "narrow global-up cap on the accepted round current overlay",
                "overlayRadiusMeters": OVERLAY_RADIUS_M,
                "sheathTopOffsetMeters": SHEATH_TOP_OFFSET_M,
                "radialSeparationMeters": rounded(OVERLAY_RADIUS_M - SHEATH_TOP_OFFSET_M),
                "visibilityNormalZ": list(CAP_VISIBILITY_NORMAL_Z),
                "coreNormalZ": list(CAP_CORE_NORMAL_Z),
                "curveTiltDependent": False,
                "raisedTerminalFallback": {
                    "positionZMeters": list(TERMINAL_RAISED_Z_M),
                    "viewVisibility": list(TERMINAL_VIEW_VISIBILITY),
                    "viewCore": list(TERMINAL_VIEW_CORE),
                },
            },
            "material": {
                "name": CURRENT_MATERIAL,
                "emissionStrength": EMISSION_STRENGTH,
                "housingColor": CHANNEL_HOUSING_COLOR,
                "housingRoughness": CHANNEL_HOUSING_ROUGHNESS,
                "objectColorTint": list(OBJECT_COLOR_TINT),
                "backfaceCulling": False,
                "globalUpCap": True,
            },
            "front": {
                "arrivalTimingPreserved": True,
                "firstArrival": 46,
                "lastArrival": 285,
                "durationBeforeFrames": 13,
                "durationAfterFrames": FRONT_DURATION_FRAMES,
                "trailAlphaPreserved": TRAIL_ALPHA,
            },
            "localResponse": {
                "peakBeforeWatts": 18.0,
                "trailBeforeWatts": 4.0,
                "peakAfterWatts": LOCAL_RESPONSE_PEAK_W,
                "trailAfterWatts": LOCAL_RESPONSE_TRAIL_W,
                "cutoffMeters": LOCAL_RESPONSE_CUTOFF_M,
                "softSizeMeters": LOCAL_RESPONSE_SOFT_SIZE_M,
            },
        },
        "mutations": {
            "whitelist": [
                "the existing current material node graph",
                "one post-arrival trail key per color channel on each current object action",
                "energy curve and attenuation properties on the twelve accepted local-response lights",
            ],
            "acceptedRoundOverlay": {
                "before": overlay_before,
                "after": overlay_after,
                "reopened": reopened_overlay,
                "unchanged": True,
            },
            "front": front_mutation,
            "lights": light_mutation,
            "inventoryDelta": delta,
        },
        "validation": {
            "routeAuthority": {"before": route_before_sha, "after": route_after_sha, "reopened": reopened_route_sha, "unchanged": True},
            "arrivalAuthority": {"before": arrival_before, "after": arrival_after, "reopened": reopened_arrival, "unchanged": True},
            "frozenCategories": {"before": frozen_before, "after": frozen_after, "reopened": reopened_frozen, "unchanged": True},
            "materialGraphSha256": {"after": material_sha, "reopened": reopened_material_sha, "unchangedAfterReopen": True},
            "exactQ": {
                "before": q_before,
                "reopened": q_reopened,
                "packedBytesUnchanged": True,
                "packedSha256Unchanged": True,
                "resolvedFallbackAuthorityUnchanged": True,
                "saveAsPathRebase": {
                    "occurred": q_before["filepath"] != q_reopened["filepath"],
                    "reason": "Blender rebases the blend-relative unpacked fallback spelling when Save-As moves the derivative to a sibling artifact directory; the packed payload and resolved fallback authority are unchanged.",
                },
            },
            "logicalCoverageAfter": coverage_after,
            "logicalCoverageReopened": reopened_coverage,
            "saveReopen": "PASS",
        },
        "priorCableAuthority": cable_before,
        "affectedFrameProof": {
            "F1ToF45": "unchanged: all current alphas and local-response energies remain zero",
            "F46ToF494": "potentially changed by the repaired current surface/front/local floor response",
            "F495ToF500": "requires compositor-black pilot/pixel proof before reuse is authorized",
            "productionRenderStarted": False,
        },
        "authorization": {
            "fullOrPartialProductionRenderStarted": False,
            "encodingStarted": False,
            "runtimeIntegrationStartedByThisScript": False,
            "phase5Authorized": False,
        },
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"PHASE4R2_1_DERIVATIVE={output}")
    print(f"PHASE4R2_1_BUILD_REPORT={report_path}")
    print(f"PHASE4R2_1_DERIVATIVE_SHA256={final_file_record['sha256']}")


if __name__ == "__main__":
    main()
