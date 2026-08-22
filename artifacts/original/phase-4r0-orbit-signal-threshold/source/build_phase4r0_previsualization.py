"""Build the Phase 4-R0 orbit previsualization Blender derivative.

The builder opens the accepted Phase 3-R authority, verifies its bytes, then
saves a new derivative.  Cabinet/cable geometry and accepted materials remain
inherited.  Only draft camera rigs, timeline retiming, preview illumination,
and the approved isolated Quantum Q are introduced for the creative gate.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any

import bpy
from mathutils import Vector

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import phase4r0_config as cfg


OLD_TO_NEW_TIMELINE = (
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


def required_collection(name: str) -> bpy.types.Collection:
    collection = bpy.data.collections.get(name)
    if collection is None:
        raise RuntimeError(f"missing accepted collection: {name}")
    return collection


def required_object(name: str) -> bpy.types.Object:
    obj = bpy.data.objects.get(name)
    if obj is None:
        raise RuntimeError(f"missing accepted object: {name}")
    return obj


def remap_frame(frame: float) -> float:
    points = OLD_TO_NEW_TIMELINE
    if frame <= points[0][0]:
        return points[0][1] + (frame - points[0][0])
    for (old_a, new_a), (old_b, new_b) in zip(points, points[1:]):
        if frame <= old_b:
            fraction = (frame - old_a) / (old_b - old_a)
            return new_a + fraction * (new_b - new_a)
    old_a, new_a = points[-1]
    return new_a + (frame - old_a)


def iter_action_fcurves(action: bpy.types.Action):
    legacy = getattr(action, "fcurves", None)
    if legacy is not None:
        yield from legacy
        return
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", ()):
                yield from channelbag.fcurves


def retime_inherited_actions() -> dict[str, Any]:
    records: list[dict[str, Any]] = []
    total = 0
    for action in bpy.data.actions:
        action_count = 0
        for curve in iter_action_fcurves(action):
            for point in curve.keyframe_points:
                point.co.x = remap_frame(float(point.co.x))
                point.handle_left.x = remap_frame(float(point.handle_left.x))
                point.handle_right.x = remap_frame(float(point.handle_right.x))
                action_count += 1
        if action_count:
            # Several accepted legacy interface Actions have no current owner.
            # Preserve them in the saved derivative so the retimed inherited
            # animation inventory remains auditable after Blender reloads it.
            action.use_fake_user = True
            records.append({"action": action.name, "keyframes": action_count})
            total += action_count
    return {"actions": records, "action_count": len(records), "keyframe_count": total}


def boost_conduction_for_previsualization() -> dict[str, Any]:
    # The production-authored conductor energy is calibrated for close final
    # shots.  In the much wider orbit animatic it became illegible at the 25,
    # 50 and 75 percent review gates.  Boost only the existing local conductor
    # emission and its contact lights for the draft; dormancy remains black and
    # no environmental material or brand colour is changed.
    factors = {"desktop": 6.0, "mobile": 30.0}
    boosted_curves = 0
    boosted_points = 0
    for action in bpy.data.actions:
        conductor = action.name.startswith(("Phase3_DesktopConductor_", "Phase3_MobileConductor_"))
        contact = action.name.startswith(("Phase3_DesktopContactLight_", "Phase3_MobileContactLight_"))
        if not conductor and not contact:
            continue
        family = "mobile" if "_Mobile" in action.name else "desktop"
        factor = factors[family]
        for curve in iter_action_fcurves(action):
            is_strength = conductor and 'inputs[29].default_value' in curve.data_path
            is_energy = contact and curve.data_path == "energy"
            if not is_strength and not is_energy:
                continue
            boosted_curves += 1
            for point in curve.keyframe_points:
                if point.co.y <= 0.0:
                    continue
                point.co.y *= factor
                point.handle_left.y *= factor
                point.handle_right.y *= factor
                boosted_points += 1
    return {
        "factors": factors,
        "curve_count": boosted_curves,
        "positive_keyframe_count": boosted_points,
        "scope": "conductor emission strength and local contact-light energy only; geometry and authored color unchanged",
    }


def link_exclusively(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for existing in list(obj.users_collection):
        existing.objects.unlink(obj)
    collection.objects.link(obj)


def create_collection(name: str) -> bpy.types.Collection:
    existing = bpy.data.collections.get(name)
    if existing is not None:
        for obj in list(existing.all_objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(existing)
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def keyframe_value(owner: Any, data_path: str, frame: int, value: Any) -> None:
    setattr(owner, data_path, value)
    owner.keyframe_insert(data_path=data_path, frame=frame)


def set_linear_animation(owner: Any, paths: set[str]) -> None:
    action = None if owner.animation_data is None else owner.animation_data.action
    if action is None:
        return
    for curve in iter_action_fcurves(action):
        if curve.data_path in paths:
            for point in curve.keyframe_points:
                point.interpolation = "LINEAR"


def set_constant_animation(owner: Any, paths: set[str]) -> None:
    action = None if owner.animation_data is None else owner.animation_data.action
    if action is None:
        return
    for curve in iter_action_fcurves(action):
        if curve.data_path in paths:
            for point in curve.keyframe_points:
                point.interpolation = "CONSTANT"


def srgb(hex_color: str) -> tuple[float, float, float, float]:
    value = hex_color.lstrip("#")
    return tuple(int(value[index : index + 2], 16) / 255.0 for index in (0, 2, 4)) + (1.0,)


def emission_material(name: str, color_hex: str) -> tuple[bpy.types.Material, Any]:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.name = "Phase4R0 Approved Q Phosphor"
    color = srgb(color_hex)
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = 0.46
    authored_color = nodes.new("ShaderNodeRGB")
    authored_color.name = "Approved SVG Fill"
    authored_color.outputs[0].default_value = color
    wave = nodes.new("ShaderNodeTexWave")
    wave.name = "Restrained CRT Scan Structure"
    wave.wave_type = "BANDS"
    wave.bands_direction = "Y"
    wave.inputs["Scale"].default_value = 150.0
    wave.inputs["Distortion"].default_value = 0.0
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.name = "Scan Modulation 0.88 to 1.00"
    ramp.color_ramp.elements[0].color = (0.88, 0.88, 0.88, 1.0)
    ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    multiply = nodes.new("ShaderNodeMixRGB")
    multiply.name = "Approved Fill Times Scan Structure"
    multiply.blend_type = "MULTIPLY"
    multiply.inputs[0].default_value = 1.0
    material.node_tree.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    material.node_tree.links.new(authored_color.outputs[0], multiply.inputs[1])
    material.node_tree.links.new(ramp.outputs["Color"], multiply.inputs[2])
    material.node_tree.links.new(multiply.outputs["Color"], shader.inputs["Emission Color"])
    material.diffuse_color = color
    shader.inputs["Emission Strength"].default_value = 0.0
    material.node_tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    for frame, strength in (
        (cfg.EVENTS["black_stabilized"], 0.0),
        (cfg.EVENTS["q_first_readable"], 0.85),
        (cfg.EVENTS["q_stable"], 2.15),
        (cfg.EVENTS["q_hold_end"], 2.05),
        (cfg.EVENTS["late_approach"], 1.45),
        (cfg.EVENTS["glass_fill"], 0.82),
        (cfg.EVENTS["threshold_crossing"], 0.20),
    ):
        shader.inputs["Emission Strength"].default_value = strength
        shader.inputs["Emission Strength"].keyframe_insert("default_value", frame=frame)
    action = material.node_tree.animation_data.action
    if action is not None:
        for curve in iter_action_fcurves(action):
            for point in curve.keyframe_points:
                point.interpolation = "BEZIER"
    material["phase4r0_source_fill"] = color_hex.upper()
    material["phase4r0_role"] = "approved SVG geometry emitted through accepted CRT glass"
    return material, shader


def prepare_workbench_signal_visibility() -> dict[str, Any]:
    magenta = srgb("#D82B72")
    records: dict[str, Any] = {}
    for family, collection_name in (
        ("desktop", "SPIRALCABLE_RECESSED_CONDUCTOR_SEGMENTS"),
        ("mobile", "MOBILESPIRALCABLE_RECESSED_CONDUCTOR_SEGMENTS"),
    ):
        collection = required_collection(collection_name)
        active = 0
        permanently_hidden = 0
        for obj in list(collection.all_objects):
            if obj is None:
                continue
            if bool(obj.get("entry_hidden", False)):
                obj.hide_render = True
                obj["phase4r0_workbench_visibility"] = "accepted entry-hidden segment"
                permanently_hidden += 1
                continue
            progress = float(obj.get("progress_start", -1.0))
            if not 0.0 <= progress <= 1.0:
                raise RuntimeError(f"missing accepted cable progress metadata on {obj.name}")
            arrival = round(
                cfg.EVENTS["conduction_start"]
                + progress * (cfg.EVENTS["orbit_complete_current_arrival"] - cfg.EVENTS["conduction_start"])
            )
            for frame, hidden in (
                (cfg.FRAME_START, True),
                (max(cfg.FRAME_START, arrival - 1), True),
                (arrival, False),
                (cfg.EVENTS["raster_expansion_end"], False),
                (cfg.EVENTS["settling_start"], True),
            ):
                obj.hide_render = hidden
                obj.keyframe_insert(data_path="hide_render", frame=frame)
            set_constant_animation(obj, {"hide_render"})
            obj["phase4r0_conduction_arrival_frame"] = arrival
            obj["phase4r0_workbench_visibility"] = "outer-to-inner progressive current; reverse-safe"
            for material in obj.data.materials:
                if material is not None:
                    material.diffuse_color = magenta
            active += 1
        records[family] = {"active_segments": active, "entry_hidden_segments": permanently_hidden}

    indicator = required_object("CRT_DormantPowerIndicator")
    for frame, hidden in (
        (cfg.FRAME_START, True),
        (cfg.EVENTS["orbit_complete_current_arrival"], True),
        (cfg.EVENTS["indicator_response"], False),
        (cfg.FRAME_END, False),
    ):
        indicator.hide_render = hidden
        indicator.keyframe_insert(data_path="hide_render", frame=frame)
    set_constant_animation(indicator, {"hide_render"})
    records["indicator"] = {
        "object": indicator.name,
        "response_frame": cfg.EVENTS["indicator_response"],
    }
    return records


def strengthen_draft_raster_expansion() -> dict[str, Any]:
    keys = (
        (cfg.EVENTS["horizontal_line_end"], 0.0),
        (cfg.EVENTS["raster_expansion_start"], 0.10),
        (320, 0.46),
        (325, 1.08),
        (330, 1.34),
        (cfg.EVENTS["raster_expansion_end"], 1.15),
        (342, 0.72),
        (350, 0.28),
        (cfg.EVENTS["black_stabilized"], 0.10),
        (cfg.EVENTS["q_first_readable"], 0.08),
        (cfg.EVENTS["q_stable"], 0.06),
        (cfg.EVENTS["q_hold_end"], 0.04),
        (cfg.EVENTS["late_approach"], 0.02),
        (cfg.EVENTS["glass_fill"], 0.01),
        (cfg.EVENTS["threshold_crossing"], 0.0),
    )
    materials = []
    for family in ("Desktop", "Mobile"):
        material = bpy.data.materials.get(f"Phase3R_PhosphorField_{family}")
        if material is None or material.node_tree is None:
            raise RuntimeError(f"missing accepted {family} phosphor field")
        socket = material.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"]
        multiplier = 0.94 if family == "Mobile" else 1.0
        for frame, strength in keys:
            socket.default_value = strength * multiplier
            socket.keyframe_insert("default_value", frame=frame)
        action = material.node_tree.animation_data.action
        if action is not None:
            for curve in iter_action_fcurves(action):
                for point in curve.keyframe_points:
                    point.interpolation = "BEZIER"
                    point.handle_left_type = "AUTO_CLAMPED"
                    point.handle_right_type = "AUTO_CLAMPED"
        materials.append(material.name)
    return {
        "materials": materials,
        "keys": [{"frame": frame, "desktop_strength": strength, "mobile_strength": round(strength * 0.94, 6)} for frame, strength in keys],
        "scope": "draft phosphor emission only; accepted screen/glass geometry, warm-neutral tone, raster modulation, and physical startup line remain unchanged",
    }


def create_quantum_q() -> dict[str, Any]:
    collection = create_collection("PHASE4R0_Q_SIGNAL")
    before = set(bpy.data.objects)
    bpy.ops.import_curve.svg(filepath=str(cfg.Q_REVERSED_SOURCE))
    imported = sorted(set(bpy.data.objects) - before, key=lambda obj: obj.name)
    if len(imported) != 2 or any(obj.type != "CURVE" for obj in imported):
        raise RuntimeError(f"approved Q import must create exactly two curve objects: {[obj.name for obj in imported]}")

    root = bpy.data.objects.new("Phase4R0_ApprovedQuantumQ_Root", None)
    collection.objects.link(root)
    root.empty_display_type = "PLAIN_AXES"
    root.location = (0.65, -0.0915, 0.425)
    root.rotation_euler = (math.pi / 2.0, 0.0, 0.0)
    root.scale = (11.7, 11.7, 11.7)
    root["phase4r0_q_authority"] = cfg.Q_REVERSED_SOURCE.name
    root["phase4r0_q_authority_sha256"] = cfg.Q_REVERSED_SHA256

    white_material, _ = emission_material("Phase4R0_Q_WhitePhosphor", "#FFFFFF")
    magenta_material, _ = emission_material("Phase4R0_Q_MagentaPhosphor", "#D82B72")
    dimensions = []
    ordered = sorted(imported, key=lambda obj: obj.dimensions.x * obj.dimensions.y, reverse=True)
    for index, obj in enumerate(ordered):
        link_exclusively(obj, collection)
        obj.parent = root
        obj.location = (-0.0153925, -0.0153925, 0.0)
        obj.name = "Phase4R0_QuantumQ_Body" if index == 0 else "Phase4R0_QuantumQ_Accent"
        obj.data.name = f"{obj.name}_Curve"
        obj.data.dimensions = "2D"
        obj.data.extrude = 0.00018
        obj.data.bevel_depth = 0.00008
        obj.data.bevel_resolution = 2
        obj.data.materials.clear()
        obj.data.materials.append(white_material if index == 0 else magenta_material)
        obj["phase4r0_svg_geometry_edited"] = False
        obj["phase4r0_svg_role"] = "main body" if index == 0 else "authored lower-right accent"
        for frame, hidden in (
            (cfg.EVENTS["black_stabilized"], True),
            (cfg.EVENTS["q_first_readable"], False),
            (cfg.EVENTS["threshold_crossing"], False),
            (cfg.EVENTS["threshold_crossing"] + 1, True),
        ):
            obj.hide_render = hidden
            obj.keyframe_insert(data_path="hide_render", frame=frame)
        dimensions.append({"object": obj.name, "imported_dimensions_m": [round(float(obj.dimensions.x), 9), round(float(obj.dimensions.y), 9)]})

    for frame, scale in (
        (cfg.EVENTS["q_first_readable"], 11.57),
        (cfg.EVENTS["q_first_readable"] + 5, 11.78),
        (cfg.EVENTS["q_stable"], 11.70),
        (cfg.EVENTS["q_hold_end"], 11.70),
        (cfg.EVENTS["threshold_crossing"], 11.70),
    ):
        root.scale = (scale, scale, scale)
        root.keyframe_insert(data_path="scale", frame=frame)
    set_linear_animation(root, {"scale"})
    return {
        "source": file_record(cfg.Q_REVERSED_SOURCE),
        "color_authority": file_record(cfg.Q_COLOR_SOURCE),
        "isolation": "approved isolated two-path SVG imported directly; no trace, font, redraw, path edit, or qFund asset",
        "objects": dimensions,
    }


def create_draft_raster_surface() -> dict[str, Any]:
    collection = create_collection("PHASE4R0_DRAFT_RASTER")
    source = required_object("CRT_InternalPhosphorLayer")
    raster = source.copy()
    raster.data = source.data.copy()
    # The accepted phosphor object is animated.  A Blender object copy inherits
    # that animation-data pointer, which would evaluate this derivative layer at
    # the accepted object's transform and also share newly inserted scale keys.
    # Give the review-only raster its own clean transform animation instead.
    raster.animation_data_clear()
    raster.name = "Phase4R0_ConvexDraftRasterSurface"
    raster.data.name = "Phase4R0_ConvexDraftRasterSurface_Mesh"
    collection.objects.link(raster)
    raster.parent = source.parent
    raster.location = (0.0, 0.0, 0.425)
    source_y_min = min(vertex.co.y for vertex in raster.data.vertices)
    source_y_max = max(vertex.co.y for vertex in raster.data.vertices)
    source_y_span = source_y_max - source_y_min
    # Preserve a restrained convex bow while moving the entire review-only
    # phosphor surface just in front of the very dark Eevee glass.  Leaving the
    # copied 33 mm source depth intact put its edge vertices behind the opaque
    # draft glass and made the raster expansion impossible to judge.  This
    # six-millimetre bow remains behind the cabinet bezel and is explicitly a
    # previsualization legibility treatment, never an accepted-geometry edit.
    draft_y_front = -0.394
    draft_y_back = -0.388
    for vertex in raster.data.vertices:
        vertex.co.z -= 0.425
        fraction = 0.0 if source_y_span == 0.0 else (vertex.co.y - source_y_min) / source_y_span
        vertex.co.y = draft_y_front + fraction * (draft_y_back - draft_y_front)
    raster.data.update()

    material = bpy.data.materials.new("Phase4R0_NeutralWarmDraftRaster")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.name = "Phase4R0 Neutral Warm Physical Raster"
    black = srgb("#050606")
    warm = srgb("#D8D2C6")
    shader.inputs["Base Color"].default_value = black
    shader.inputs["Roughness"].default_value = 0.56
    coordinates = nodes.new("ShaderNodeTexCoord")
    wave = nodes.new("ShaderNodeTexWave")
    wave.name = "Fine Horizontal Raster"
    wave.wave_type = "BANDS"
    wave.bands_direction = "Z"
    wave.inputs["Scale"].default_value = 160.0
    wave.inputs["Distortion"].default_value = 0.12
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.name = "Restrained Raster Contrast"
    ramp.color_ramp.elements[0].color = (0.84, 0.84, 0.84, 1.0)
    ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    authored = nodes.new("ShaderNodeRGB")
    authored.name = "Neutral Warm Phosphor Authority"
    authored.outputs[0].default_value = warm
    multiply = nodes.new("ShaderNodeMixRGB")
    multiply.blend_type = "MULTIPLY"
    multiply.inputs[0].default_value = 1.0
    material.node_tree.links.new(coordinates.outputs["Generated"], wave.inputs["Vector"])
    material.node_tree.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    material.node_tree.links.new(authored.outputs[0], multiply.inputs[1])
    material.node_tree.links.new(ramp.outputs["Color"], multiply.inputs[2])
    material.node_tree.links.new(multiply.outputs["Color"], shader.inputs["Emission Color"])
    material.node_tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    material.diffuse_color = warm
    raster.data.materials.clear()
    raster.data.materials.append(material)

    scale_keys = (
        (cfg.EVENTS["horizontal_line_end"], (0.88, 1.0, 0.002)),
        (cfg.EVENTS["raster_expansion_start"], (0.89, 1.0, 0.008)),
        (320, (0.92, 1.0, 0.15)),
        (325, (0.96, 1.0, 0.45)),
        (330, (0.99, 1.0, 0.75)),
        (cfg.EVENTS["raster_expansion_end"], (1.0, 1.0, 1.0)),
        (cfg.EVENTS["black_stabilized"], (1.0, 1.0, 1.0)),
        (cfg.EVENTS["threshold_crossing"], (1.0, 1.0, 1.0)),
    )
    strength_keys = (
        (cfg.EVENTS["horizontal_line_end"], 0.0),
        (cfg.EVENTS["raster_expansion_start"], 0.30),
        (320, 1.00),
        (325, 2.00),
        (330, 2.60),
        (cfg.EVENTS["raster_expansion_end"], 2.00),
        (342, 1.20),
        (350, 0.50),
        (cfg.EVENTS["black_stabilized"], 0.15),
        (cfg.EVENTS["q_first_readable"], 0.06),
        (cfg.EVENTS["q_stable"], 0.04),
        (cfg.EVENTS["q_hold_end"], 0.015),
        (cfg.EVENTS["late_approach"], 0.008),
        (cfg.EVENTS["glass_fill"], 0.003),
        (cfg.EVENTS["threshold_crossing"], 0.0),
    )
    for frame, scale in scale_keys:
        raster.scale = scale
        raster.keyframe_insert(data_path="scale", frame=frame)
    set_linear_animation(raster, {"scale"})
    visibility_keys = (
        (cfg.EVENTS["dormancy_start"], True),
        (cfg.EVENTS["horizontal_line_end"], True),
        (cfg.EVENTS["raster_expansion_start"], False),
        (cfg.EVENTS["black_stabilized"], False),
        (cfg.EVENTS["q_first_readable"], True),
        (cfg.EVENTS["threshold_crossing"], True),
    )
    for frame, hidden in visibility_keys:
        raster.hide_render = hidden
        raster.keyframe_insert(data_path="hide_render", frame=frame)
    set_constant_animation(raster, {"hide_render"})
    for frame, strength in strength_keys:
        shader.inputs["Emission Strength"].default_value = strength
        shader.inputs["Emission Strength"].keyframe_insert("default_value", frame=frame)
    action = material.node_tree.animation_data.action
    if action is not None:
        for curve in iter_action_fcurves(action):
            for point in curve.keyframe_points:
                point.interpolation = "BEZIER"
                point.handle_left_type = "AUTO_CLAMPED"
                point.handle_right_type = "AUTO_CLAMPED"
    raster["phase4r0_role"] = "derivative-only convex warm-white raster legibility layer"
    raster["phase4r0_accepted_phosphor_edited"] = False
    return {
        "object": raster.name,
        "material": material.name,
        "source_mesh": source.name,
        "source_mesh_edited": False,
        "screen_depth_local_bounds_m": [draft_y_front, draft_y_back],
        "screen_depth_world_bounds_m": [draft_y_front + 0.28, draft_y_back + 0.28],
        "draft_only_front_of_glass_legibility_surface": True,
        "raster_bands": 160.0,
        "tone": "neutral warm-white #D8D2C6",
        "scale_keys": [{"frame": frame, "scale": list(scale)} for frame, scale in scale_keys],
        "visibility_keys": [{"frame": frame, "hide_render": hidden} for frame, hidden in visibility_keys],
        "strength_keys": [{"frame": frame, "strength": strength} for frame, strength in strength_keys],
    }


def create_target() -> bpy.types.Object:
    target = bpy.data.objects.get("Phase4R0_CRT_OrbitTarget")
    if target is not None:
        bpy.data.objects.remove(target, do_unlink=True)
    target = bpy.data.objects.new("Phase4R0_CRT_OrbitTarget", None)
    bpy.context.scene.collection.objects.link(target)
    target.location = cfg.ORBIT_TARGET
    target.empty_display_type = "SPHERE"
    target.empty_display_size = 0.08
    target.hide_render = True
    target["phase4r0_role"] = "accepted CRT screen/cabinet centre and camera aim authority"
    return target


def create_camera_rig(family: str, spec: dict[str, Any], target: bpy.types.Object, collection: bpy.types.Collection) -> dict[str, Any]:
    rig = bpy.data.objects.new(spec["rig"], None)
    collection.objects.link(rig)
    rig.location = cfg.ORBIT_TARGET
    rig.rotation_mode = "XYZ"
    rig.empty_display_type = "CIRCLE"
    rig.empty_display_size = 0.45
    rig["phase4r0_family"] = family
    rig["phase4r0_angle_start_degrees"] = cfg.START_ANGLE_DEGREES
    rig["phase4r0_angle_end_degrees"] = cfg.END_ANGLE_DEGREES

    data = bpy.data.cameras.new(f"{spec['camera']}_Data")
    camera = bpy.data.objects.new(spec["camera"], data)
    collection.objects.link(camera)
    camera.parent = rig
    camera.location = (spec["start_radius"], 0.0, spec["start_elevation"])
    data.lens = spec["start_lens_mm"]
    data.sensor_width = 36.0
    data.clip_start = 0.005
    data.clip_end = 1000.0
    constraint = camera.constraints.new(type="TRACK_TO")
    constraint.name = "Phase4R0_AuditableLookAtCRT"
    constraint.target = target
    constraint.track_axis = "TRACK_NEGATIVE_Z"
    constraint.up_axis = "UP_Y"

    for frame, degrees in (
        (cfg.FRAME_START, cfg.START_ANGLE_DEGREES),
        (cfg.EVENTS["dormancy_hold_end"], cfg.START_ANGLE_DEGREES),
        (cfg.EVENTS["conduction_start"], cfg.START_ANGLE_DEGREES),
        (cfg.EVENTS["orbit_complete_current_arrival"], cfg.END_ANGLE_DEGREES),
        (cfg.EVENTS["threshold_crossing"], cfg.END_ANGLE_DEGREES),
        (cfg.FRAME_END, cfg.END_ANGLE_DEGREES),
    ):
        rig.rotation_euler.z = math.radians(degrees)
        rig.keyframe_insert(data_path="rotation_euler", index=2, frame=frame)

    span = cfg.EVENTS["orbit_complete_current_arrival"] - cfg.EVENTS["conduction_start"]
    def radius_at(frame: int) -> float:
        fraction = (frame - cfg.EVENTS["conduction_start"]) / span
        return spec["start_radius"] + fraction * (spec["completion_radius"] - spec["start_radius"])

    elevation_waypoints = {
        "desktop": (4.70, 4.50, 3.10),
        "mobile": (4.48, 4.20, 2.90),
        # The short-landscape rear quadrant needs a higher authored boom than
        # portrait: at the lower draft elevation the proving-field service rail
        # crossed the CRT and cable near 180 degrees.  This restrained crest
        # clears that physical occluder while keeping the same monotonic orbit,
        # contracting radius, target, and final frontal lock.
        "landscape": (3.60, 5.40, 3.20),
    }[family]
    local_positions = (
        (cfg.FRAME_START, spec["start_radius"], spec["start_elevation"]),
        (cfg.EVENTS["dormancy_hold_end"], spec["start_radius"], spec["start_elevation"]),
        (cfg.EVENTS["conduction_start"], spec["start_radius"], spec["start_elevation"]),
        (cfg.EVENTS["conduction_25"], radius_at(cfg.EVENTS["conduction_25"]), elevation_waypoints[0]),
        (cfg.EVENTS["conduction_50"], radius_at(cfg.EVENTS["conduction_50"]), elevation_waypoints[1]),
        (cfg.EVENTS["conduction_75"], radius_at(cfg.EVENTS["conduction_75"]), elevation_waypoints[2]),
        (cfg.EVENTS["orbit_complete_current_arrival"], spec["completion_radius"], spec["completion_elevation"]),
        (cfg.EVENTS["q_hold_end"], spec["completion_radius"], spec["completion_elevation"]),
        (cfg.EVENTS["late_approach"], 1.10 if family != "mobile" else 0.95, 0.16),
        (cfg.EVENTS["glass_fill"], 0.28, 0.035),
        (cfg.EVENTS["threshold_crossing"], 0.018, 0.0),
        (cfg.FRAME_END, 0.018, 0.0),
    )
    for frame, radius, elevation in local_positions:
        camera.location = (radius, 0.0, elevation)
        camera.keyframe_insert(data_path="location", frame=frame)
    for frame, lens in (
        (cfg.FRAME_START, spec["start_lens_mm"]),
        (cfg.EVENTS["conduction_start"], spec["start_lens_mm"]),
        (cfg.EVENTS["orbit_complete_current_arrival"], spec["completion_lens_mm"]),
        (cfg.EVENTS["q_hold_end"], spec["completion_lens_mm"]),
        (cfg.EVENTS["late_approach"], spec["push_lens_mm"] + 4.0),
        (cfg.EVENTS["glass_fill"], spec["push_lens_mm"]),
        (cfg.EVENTS["threshold_crossing"], spec["push_lens_mm"]),
        (cfg.FRAME_END, spec["push_lens_mm"]),
    ):
        data.lens = lens
        data.keyframe_insert(data_path="lens", frame=frame)
    set_linear_animation(rig, {"rotation_euler"})
    set_linear_animation(camera, {"location"})
    set_linear_animation(data, {"lens"})

    return {"rig": rig, "camera": camera, "data": data}


def create_path_curves(rigs: dict[str, dict[str, Any]], collection: bpy.types.Collection) -> dict[str, Any]:
    scene = bpy.context.scene
    result: dict[str, Any] = {}
    for family, record in rigs.items():
        points: list[tuple[float, float, float]] = []
        for index in range(121):
            frame = round(cfg.EVENTS["conduction_start"] + index * (cfg.EVENTS["orbit_complete_current_arrival"] - cfg.EVENTS["conduction_start"]) / 120)
            scene.frame_set(frame)
            points.append(tuple(float(value) for value in record["camera"].matrix_world.translation))
        curve_data = bpy.data.curves.new(f"Phase4R0_Path_{family.title()}_Data", type="CURVE")
        curve_data.dimensions = "3D"
        spline = curve_data.splines.new("POLY")
        spline.points.add(len(points) - 1)
        for point, coordinates in zip(spline.points, points):
            point.co = (*coordinates, 1.0)
        curve_obj = bpy.data.objects.new(f"Phase4R0_Path_{family.title()}", curve_data)
        collection.objects.link(curve_obj)
        curve_obj.hide_render = True
        curve_obj.hide_viewport = True
        curve_obj["phase4r0_diagnostic_only"] = True
        result[family] = {
            "samples": len(points),
            "start": [round(value, 6) for value in points[0]],
            "end": [round(value, 6) for value in points[-1]],
        }
    return result


def add_neutral_preview_lighting(target: bpy.types.Object) -> dict[str, Any]:
    collection = create_collection("PHASE4R0_PREVIS_LIGHTS")
    specs = (
        ("North", (0.65, 5.8, 5.4), 460.0, 5.0, (1.0, 0.93, 0.84)),
        ("South", (0.65, -5.8, 4.8), 390.0, 5.0, (0.72, 0.80, 0.88)),
        ("East", (6.5, 0.0, 4.0), 330.0, 4.0, (0.88, 0.92, 1.0)),
        ("West", (-5.2, 0.0, 3.8), 300.0, 4.0, (1.0, 0.86, 0.72)),
    )
    records = []
    for label, location, energy, size, color in specs:
        data = bpy.data.lights.new(f"Phase4R0_{label}_NeutralArea_Data", type="AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        data.color = color
        obj = bpy.data.objects.new(f"Phase4R0_{label}_NeutralArea", data)
        collection.objects.link(obj)
        obj.location = location
        constraint = obj.constraints.new(type="TRACK_TO")
        constraint.target = target
        constraint.track_axis = "TRACK_NEGATIVE_Z"
        constraint.up_axis = "UP_Y"
        records.append({"name": obj.name, "energy_w": energy, "color": list(color)})
    accent = bpy.data.objects.get("Scene_GlassProofAccent")
    if accent is not None:
        accent.hide_render = True
    world = bpy.context.scene.world
    if world is not None:
        world.use_nodes = True
        background = world.node_tree.nodes.get("Background")
        if background is not None:
            background.inputs["Color"].default_value = (0.003, 0.004, 0.004, 1.0)
            background.inputs["Strength"].default_value = 0.06
    return {"environmental_magenta": 0, "lights": records}


def create_proving_field_extension() -> dict[str, Any]:
    accepted = required_object("ProvingGround_Terrain")
    accepted_material = bpy.data.materials.get("ProvingGround_DarkAggregateTerrain")
    if accepted_material is None:
        raise RuntimeError("missing accepted proving-ground material")
    collection = create_collection("PHASE4R0_PROVING_FIELD_EXTENSION")
    bpy.ops.mesh.primitive_cube_add(size=2.0, location=(0.0, 0.0, -0.031))
    extension = bpy.context.object
    extension.name = "P4R0_ProvingGround_FieldExtension"
    extension.scale = (15.0, 15.0, 0.03)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link_exclusively(extension, collection)
    extension.data.name = "P4R0_ProvingGround_FieldExtension_Mesh"
    material = accepted_material.copy()
    material.name = "P4R0_ProvingGround_DarkAggregateTerrain_Extension"
    if material.node_tree is not None:
        noise = material.node_tree.nodes.get("Procedural ABS microtexture")
        if noise is not None and noise.inputs.get("Scale") is not None:
            noise.inputs["Scale"].default_value = 720.0
    extension.data.materials.append(material)
    bevel = extension.modifiers.new("P4R0 Manufactured edge radius", "BEVEL")
    bevel.width = 0.01
    bevel.segments = 6
    bevel.limit_method = "ANGLE"
    extension["phase4r0_role"] = "derivative-only underlay extending the accepted proving field for the circular orbit"
    extension["phase4r0_accepted_terrain_edited"] = False
    accepted_bounds = [tuple(round(float(value), 6) for value in accepted.matrix_world @ Vector(corner)) for corner in accepted.bound_box]
    extension_bounds = [tuple(round(float(value), 6) for value in extension.matrix_world @ Vector(corner)) for corner in extension.bound_box]
    return {
        "accepted_object": accepted.name,
        "accepted_object_edited": False,
        "extension_collection": collection.name,
        "extension_object": extension.name,
        "extension_material": material.name,
        "accepted_bounds": accepted_bounds,
        "extension_bounds": extension_bounds,
        "z_separation_m": 0.001,
        "external_textures": 0,
    }


def audit_camera_motion(rigs: dict[str, dict[str, Any]]) -> dict[str, Any]:
    scene = bpy.context.scene
    result: dict[str, Any] = {}
    for family, record in rigs.items():
        samples = []
        for frame in range(cfg.EVENTS["conduction_start"], cfg.EVENTS["orbit_complete_current_arrival"] + 1):
            scene.frame_set(frame)
            camera = record["camera"]
            rig = record["rig"]
            world = camera.matrix_world.translation
            radius = math.hypot(world.x - cfg.ORBIT_TARGET[0], world.y - cfg.ORBIT_TARGET[1])
            distance = (world - Vector(cfg.ORBIT_TARGET)).length
            samples.append(
                {
                    "frame": frame,
                    "angle_degrees": math.degrees(rig.rotation_euler.z),
                    "radius": radius,
                    "distance": distance,
                    "elevation": world.z - cfg.ORBIT_TARGET[2],
                    "lens_mm": camera.data.lens,
                }
            )
        angles = [sample["angle_degrees"] for sample in samples]
        radii = [sample["radius"] for sample in samples]
        if any(right + 1e-6 < left for left, right in zip(angles, angles[1:])):
            raise RuntimeError(f"{family} orbit angle is not monotonic")
        if any(right - 1e-6 > left for left, right in zip(radii, radii[1:])):
            raise RuntimeError(f"{family} orbit radius does not contract monotonically")
        result[family] = {
            "angle_start_degrees": round(angles[0], 6),
            "angle_end_degrees": round(angles[-1], 6),
            "total_angular_travel_degrees": round(angles[-1] - angles[0], 6),
            "direction": cfg.ORBIT_DIRECTION,
            "radius_start": round(radii[0], 6),
            "radius_completion": round(radii[-1], 6),
            "elevation_start": round(samples[0]["elevation"], 6),
            "elevation_completion": round(samples[-1]["elevation"], 6),
            "distance_start": round(samples[0]["distance"], 6),
            "distance_completion": round(samples[-1]["distance"], 6),
            "focal_length_start_mm": round(samples[0]["lens_mm"], 6),
            "focal_length_completion_mm": round(samples[-1]["lens_mm"], 6),
            "monotonic_angle": True,
            "monotonic_contracting_radius": True,
        }
    return result


def configure_scene() -> None:
    scene = bpy.context.scene
    scene.frame_start = cfg.FRAME_START
    scene.frame_end = cfg.FRAME_END
    scene.render.fps = cfg.FPS
    scene.render.fps_base = 1.0
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.resolution_x, scene.render.resolution_y = cfg.CAMERA_SPECS["desktop"]["resolution"]
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.render.image_settings.compression = 30
    scene.render.use_motion_blur = False
    scene.render.use_persistent_data = True
    scene.render.engine = "BLENDER_EEVEE"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene["phase4r0_schema"] = "quantum-hub.phase-4-r0-orbit-signal-threshold.previsualization-source.v1"
    scene["phase4r0_not_production_render"] = True
    scene["phase4r0_parent_commit"] = cfg.ACCEPTED_PHASE4_PARENT
    scene["phase4r0_total_angular_travel_degrees"] = 360.0
    scene["phase4r0_latest_document_position_authoritative"] = True


def main() -> None:
    opened = Path(bpy.data.filepath).resolve()
    if opened != cfg.ACCEPTED_PHASE3R_SOURCE.resolve():
        raise RuntimeError("builder must open the exact accepted Phase 3-R CRT source")
    if sha256(opened) != cfg.ACCEPTED_PHASE3R_SHA256:
        raise RuntimeError("accepted Phase 3-R CRT source hash mismatch")
    if sha256(cfg.Q_COLOR_SOURCE) != cfg.Q_COLOR_SHA256:
        raise RuntimeError("approved Quantum color icon hash mismatch")
    if sha256(cfg.Q_REVERSED_SOURCE) != cfg.Q_REVERSED_SHA256:
        raise RuntimeError("approved Quantum reversed icon hash mismatch")
    if cfg.DERIVATIVE_SOURCE.resolve() == opened:
        raise RuntimeError("Phase 4-R0 derivative must not overwrite the accepted CRT master")

    required_collection("DESKTOP_2_5_TURN_SPIRAL_CABLE")
    required_collection("MOBILE_2_25_TURN_SPIRAL_CABLE")
    required_object("CRT_ConvexThickSmokedGlass")
    required_object("CRT_InternalPhosphorLayer")
    object_count_before = len(bpy.data.objects)
    configure_scene()
    retiming = retime_inherited_actions()
    conduction_boost = boost_conduction_for_previsualization()
    workbench_signal = prepare_workbench_signal_visibility()
    raster_preview = strengthen_draft_raster_expansion()

    for name in ("CRT_PHYSICAL_SIGNAL_INTERFACE", "CRT_PORTAL_TAKEOVER_CUES"):
        collection = required_collection(name)
        collection.hide_render = True
        collection.hide_viewport = True
        collection["phase4r0_reason"] = "superseded screen-content/portal hierarchy hidden only in Phase 4-R0 derivative"

    q_report = create_quantum_q()
    raster_surface = create_draft_raster_surface()
    target = create_target()
    camera_collection = create_collection("PHASE4R0_CAMERA_RIGS")
    rigs = {
        family: create_camera_rig(family, spec, target, camera_collection)
        for family, spec in cfg.CAMERA_SPECS.items()
    }
    path_report = create_path_curves(rigs, camera_collection)
    lighting = add_neutral_preview_lighting(target)
    field_extension = create_proving_field_extension()
    camera_audit = audit_camera_motion(rigs)

    scene = bpy.context.scene
    required_collection("DESKTOP_2_5_TURN_SPIRAL_CABLE").hide_render = False
    required_collection("MOBILE_2_25_TURN_SPIRAL_CABLE").hide_render = True
    desktop_contacts = bpy.data.collections.get("PHASE3_DESKTOP_CONTACT_LIGHTS")
    mobile_contacts = bpy.data.collections.get("PHASE3_MOBILE_CONTACT_LIGHTS")
    if desktop_contacts is not None:
        desktop_contacts.hide_render = False
    if mobile_contacts is not None:
        mobile_contacts.hide_render = True
    scene.camera = rigs["desktop"]["camera"]
    scene.frame_set(cfg.FRAME_START)

    cfg.DERIVATIVE_SOURCE.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(cfg.DERIVATIVE_SOURCE), check_existing=False)
    derivative = file_record(cfg.DERIVATIVE_SOURCE)
    report = {
        "schema": "quantum-hub.phase-4-r0-orbit-signal-threshold.source-build.v1",
        "status": "PASS",
        "production_rendering_started": False,
        "blender_version": bpy.app.version_string,
        "accepted_phase4_parent": cfg.ACCEPTED_PHASE4_PARENT,
        "accepted_phase3r_source": file_record(cfg.ACCEPTED_PHASE3R_SOURCE),
        "phase4r0_derivative": derivative,
        "quantum_q": q_report,
        "draft_raster_surface": raster_surface,
        "timeline": {
            "fps": cfg.FPS,
            "frames": [cfg.FRAME_START, cfg.FRAME_END],
            "duration_seconds": cfg.DURATION_SECONDS,
            "events": dict(cfg.EVENTS),
            "retimed_inherited_actions": retiming,
            "previsualization_conduction_legibility": conduction_boost,
            "workbench_signal_visibility": workbench_signal,
            "draft_raster_legibility": raster_preview,
        },
        "camera_motion": camera_audit,
        "camera_path_objects": path_report,
        "lighting": lighting,
        "proving_field_extension": field_extension,
        "preserved_authority": {
            "cabinet_and_cable_inherited_from_exact_hashed_source": True,
            "object_count_before": object_count_before,
            "object_count_after": len(bpy.data.objects),
            "accepted_source_overwritten": False,
        },
        "changed_categories": [
            "camera rig and responsive camera family",
            "timeline and inherited signal retiming",
            "approved isolated Quantum Q screen content",
            "neutral orbit-preview lighting",
            "threshold preparation after physical frame 500",
        ],
        "unchanged_categories": [
            "accepted CRT cabinet geometry and period identity",
            "accepted cabinet materials, speaker and control band",
            "accepted convex glass and phosphor structure",
            "accepted desktop/mobile cable geometry and connection",
            "Phase 2B Operating Field and supporting-route architecture",
        ],
    }
    cfg.BUILD_REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"QH_PHASE4R0_DERIVATIVE={cfg.DERIVATIVE_SOURCE}")
    print(f"QH_PHASE4R0_DERIVATIVE_SHA256={derivative['sha256']}")
    print(f"QH_PHASE4R0_BUILD_REPORT={cfg.BUILD_REPORT}")


if __name__ == "__main__":
    main()
