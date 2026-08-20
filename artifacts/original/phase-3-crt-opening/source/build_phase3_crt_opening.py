"""Build the deterministic Phase 3 animated derivative from the accepted CRT master.

The accepted Phase 0.4R `.blend` must be supplied on Blender's command line.
This script verifies its exact hash, adds animation and Phase 3-only geometry,
and saves to a new file. It never overwrites the accepted source.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import phase3_config as cfg


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_record(path: Path) -> dict:
    return {
        "package_relative_path": path.resolve().relative_to(cfg.PACKAGE_DIR.resolve()).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def repository_record(path: Path) -> dict:
    return {
        "repository_relative_path": path.resolve().relative_to(cfg.REPOSITORY_ROOT.resolve()).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def material(name: str) -> bpy.types.Material:
    result = bpy.data.materials.get(name)
    if result is None:
        raise RuntimeError(f"missing accepted material: {name}")
    return result


def object_required(name: str) -> bpy.types.Object:
    result = bpy.data.objects.get(name)
    if result is None:
        raise RuntimeError(f"missing accepted object: {name}")
    return result


def principled(mat: bpy.types.Material):
    if mat.node_tree is None:
        raise RuntimeError(f"material has no node tree: {mat.name}")
    result = mat.node_tree.nodes.get("Principled BSDF")
    if result is None:
        raise RuntimeError(f"material has no Principled BSDF: {mat.name}")
    return result


def assign_material(obj: bpy.types.Object, mat: bpy.types.Material) -> None:
    if not hasattr(obj.data, "materials"):
        return
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def keyframe_socket(socket, frame: int, value) -> None:
    socket.default_value = value
    socket.keyframe_insert(data_path="default_value", frame=int(frame))


def keyframe_property(owner, data_path: str, frame: int, value) -> None:
    setattr(owner, data_path, value)
    owner.keyframe_insert(data_path=data_path, frame=int(frame))


def set_linear_interpolation(id_block) -> None:
    animation_data = getattr(id_block, "animation_data", None)
    action = None if animation_data is None else animation_data.action
    if action is None:
        return
    try:
        curves = action.fcurves
    except AttributeError:
        return
    for curve in curves:
        for point in curve.keyframe_points:
            point.interpolation = "LINEAR"


def bounds_center(obj: bpy.types.Object) -> Vector:
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return sum(points, Vector()) / len(points)


def ensure_collection(name: str) -> bpy.types.Collection:
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(collection)
    return collection


def hex_linear(value: str) -> tuple[float, float, float, float]:
    value = value.lstrip("#")
    channels = [int(value[index : index + 2], 16) / 255.0 for index in (0, 2, 4)]

    def convert(channel: float) -> float:
        return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4

    return tuple(convert(channel) for channel in channels) + (1.0,)


def animate_camera(name: str, keys: list[tuple], *, portrait: bool) -> bpy.types.Object:
    source = object_required("Camera_Dormant_Hero")
    data = source.data.copy()
    data.name = f"{name}_Data"
    data.sensor_fit = "VERTICAL" if portrait else "HORIZONTAL"
    data.dof.use_dof = False
    data.lens = float(keys[0][3])
    data.clip_start = 0.005
    data.clip_end = 100.0
    camera = bpy.data.objects.new(name, data)
    ensure_collection("PHASE3_CAMERAS").objects.link(camera)
    camera["phase3_variant"] = "mobile" if portrait else "desktop"
    camera["phase3_path"] = "authored independently" if portrait else "production desktop approach"
    for frame, location, target, lens in keys:
        camera.location = location
        direction = Vector(target) - camera.location
        camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        camera.data.lens = float(lens)
        camera.keyframe_insert(data_path="location", frame=int(frame))
        camera.keyframe_insert(data_path="rotation_euler", frame=int(frame))
        camera.data.keyframe_insert(data_path="lens", frame=int(frame))
    return camera


def cable_segments(prefix: str) -> list[bpy.types.Object]:
    return sorted(
        (
            obj
            for obj in bpy.data.objects
            if obj.name.startswith(prefix) and not bool(obj.get("entry_hidden", False))
        ),
        key=lambda obj: float(obj.get("progress_start", 0.0)),
    )


def animate_cable(prefix: str, variant: str) -> list[bpy.types.Object]:
    inactive = principled(material("SpiralCable_InactiveInternalChannel"))
    trail = principled(material("SpiralCable_EnergizedTrail"))
    front = principled(material("SpiralCable_ModestlyBrighterFront"))
    segments = cable_segments(prefix)
    if len(segments) != 180:
        raise RuntimeError(f"expected 180 {variant} conductor segments, got {len(segments)}")
    start = cfg.EVENTS["conduction_start"]
    end = cfg.EVENTS["current_arrival"]
    for index, obj in enumerate(segments, 1):
        mat = material("SpiralCable_EnergizedTrail").copy()
        mat.name = f"Phase3_{variant.title()}Conductor_{index:03d}"
        shader = principled(mat)
        assign_material(obj, mat)
        progress = float(obj.get("progress_start", (index - 1) / len(segments)))
        arrival = start + round(progress * (end - start))
        pre = max(cfg.FRAME_START, arrival - 1)
        settle = min(end + 4, arrival + 3)
        keyframe_socket(shader.inputs["Base Color"], pre, inactive.inputs["Base Color"].default_value)
        keyframe_socket(shader.inputs["Emission Color"], pre, trail.inputs["Emission Color"].default_value)
        keyframe_socket(shader.inputs["Emission Strength"], pre, 0.0)
        keyframe_socket(shader.inputs["Base Color"], arrival, front.inputs["Base Color"].default_value)
        keyframe_socket(shader.inputs["Emission Color"], arrival, front.inputs["Emission Color"].default_value)
        keyframe_socket(shader.inputs["Emission Strength"], arrival, 0.58)
        keyframe_socket(shader.inputs["Base Color"], settle, trail.inputs["Base Color"].default_value)
        keyframe_socket(shader.inputs["Emission Color"], settle, trail.inputs["Emission Color"].default_value)
        keyframe_socket(shader.inputs["Emission Strength"], settle, 0.27)
        keyframe_socket(shader.inputs["Emission Strength"], cfg.FRAME_END, 0.27)
        obj["phase3_variant"] = variant
        obj["phase3_arrival_frame"] = arrival
    for obj in bpy.data.objects:
        if obj.name.startswith(prefix) and bool(obj.get("entry_hidden", False)):
            obj.hide_render = True
    return segments


def animate_contact_lights(segments: list[bpy.types.Object], variant: str) -> None:
    collection = ensure_collection(f"PHASE3_{variant.upper()}_CONTACT_LIGHTS")
    color = hex_linear(cfg.QUANTUM_MAGENTA)[:3]
    count = 12
    for sample_index in range(count):
        index = round(sample_index * (len(segments) - 1) / (count - 1))
        segment = segments[index]
        center = bounds_center(segment)
        data = bpy.data.lights.new(f"Phase3_{variant.title()}ContactLight_{sample_index + 1:02d}_Data", "POINT")
        data.color = color
        data.energy = 0.0
        data.shadow_soft_size = 0.11
        data.use_custom_distance = True
        data.cutoff_distance = 0.42
        light = bpy.data.objects.new(f"Phase3_{variant.title()}ContactLight_{sample_index + 1:02d}", data)
        light.location = (center.x, center.y, center.z + 0.028)
        light["phase3_physical_source"] = "energized recessed cable conductor"
        collection.objects.link(light)
        progress = float(segment.get("progress_start", index / len(segments)))
        arrival = cfg.EVENTS["conduction_start"] + round(
            progress * (cfg.EVENTS["current_arrival"] - cfg.EVENTS["conduction_start"])
        )
        keyframe_property(data, "energy", max(cfg.FRAME_START, arrival - 1), 0.0)
        keyframe_property(data, "energy", arrival, 5.0)
        keyframe_property(data, "energy", min(arrival + 4, cfg.FRAME_END), 2.1)
        keyframe_property(data, "energy", cfg.FRAME_END, 1.25)


def animate_power_sequence() -> None:
    indicator = object_required("CRT_DormantPowerIndicator")
    indicator_mat = material("CRT_PowerIndicatorWarmMagenta").copy()
    indicator_mat.name = "Phase3_PowerIndicator"
    indicator_shader = principled(indicator_mat)
    indicator_base = indicator_shader.inputs["Base Color"].default_value[:]
    indicator_emission = indicator_shader.inputs["Emission Color"].default_value[:]
    assign_material(indicator, indicator_mat)
    keyframe_socket(indicator_shader.inputs["Base Color"], cfg.FRAME_START, (0.0, 0.0, 0.0, 1.0))
    keyframe_socket(indicator_shader.inputs["Base Color"], cfg.EVENTS["current_arrival"], (0.0, 0.0, 0.0, 1.0))
    keyframe_socket(indicator_shader.inputs["Base Color"], cfg.EVENTS["indicator_on"], indicator_base)
    keyframe_socket(indicator_shader.inputs["Emission Color"], cfg.FRAME_START, (0.0, 0.0, 0.0, 1.0))
    keyframe_socket(indicator_shader.inputs["Emission Color"], cfg.EVENTS["current_arrival"], (0.0, 0.0, 0.0, 1.0))
    keyframe_socket(indicator_shader.inputs["Emission Color"], cfg.EVENTS["indicator_on"], indicator_emission)
    keyframe_socket(indicator_shader.inputs["Emission Strength"], cfg.EVENTS["current_arrival"], 0.0)
    keyframe_socket(indicator_shader.inputs["Emission Strength"], cfg.EVENTS["indicator_on"], 1.4)
    keyframe_socket(indicator_shader.inputs["Emission Strength"], cfg.FRAME_END, 0.72)

    connector = object_required("CRT_ConnectorArrivalResponseRing")
    connector.hide_render = False
    if not connector.data.materials:
        raise RuntimeError("connector response has no accepted material")
    connector_mat = connector.data.materials[0].copy()
    connector_mat.name = "Phase3_ConnectorArrivalResponse"
    connector_shader = principled(connector_mat)
    connector_base = connector_shader.inputs["Base Color"].default_value[:]
    connector_emission = connector_shader.inputs["Emission Color"].default_value[:]
    assign_material(connector, connector_mat)
    keyframe_socket(connector_shader.inputs["Base Color"], cfg.FRAME_START, (0.0, 0.0, 0.0, 1.0))
    keyframe_socket(connector_shader.inputs["Base Color"], cfg.EVENTS["current_arrival"] - 1, (0.0, 0.0, 0.0, 1.0))
    keyframe_socket(connector_shader.inputs["Base Color"], cfg.EVENTS["current_arrival"], connector_base)
    keyframe_socket(connector_shader.inputs["Emission Color"], cfg.FRAME_START, (0.0, 0.0, 0.0, 1.0))
    keyframe_socket(connector_shader.inputs["Emission Color"], cfg.EVENTS["current_arrival"] - 1, (0.0, 0.0, 0.0, 1.0))
    keyframe_socket(connector_shader.inputs["Emission Color"], cfg.EVENTS["current_arrival"], connector_emission)
    keyframe_socket(connector_shader.inputs["Emission Strength"], cfg.EVENTS["current_arrival"] - 1, 0.0)
    keyframe_socket(connector_shader.inputs["Emission Strength"], cfg.EVENTS["current_arrival"], 0.52)
    keyframe_socket(connector_shader.inputs["Emission Strength"], cfg.EVENTS["indicator_on"] + 3, 0.12)
    keyframe_socket(connector_shader.inputs["Emission Strength"], cfg.EVENTS["horizontal_line_start"], 0.0)

    wake = object_required("CRT_WakeHorizontalPhosphorLine")
    wake.hide_render = False
    wake_mat = material("CRT_WakeLineEmission").copy()
    wake_mat.name = "Phase3_WakeHorizontalPhosphorLine"
    wake_shader = principled(wake_mat)
    wake_base = wake_shader.inputs["Base Color"].default_value[:]
    wake_emission = wake_shader.inputs["Emission Color"].default_value[:]
    assign_material(wake, wake_mat)
    keyframe_socket(wake_shader.inputs["Base Color"], cfg.FRAME_START, (0.0, 0.0, 0.0, 1.0))
    keyframe_socket(wake_shader.inputs["Base Color"], cfg.EVENTS["horizontal_line_start"] - 1, (0.0, 0.0, 0.0, 1.0))
    keyframe_socket(wake_shader.inputs["Base Color"], cfg.EVENTS["horizontal_line_start"], wake_base)
    keyframe_socket(wake_shader.inputs["Emission Color"], cfg.FRAME_START, (0.0, 0.0, 0.0, 1.0))
    keyframe_socket(wake_shader.inputs["Emission Color"], cfg.EVENTS["horizontal_line_start"] - 1, (0.0, 0.0, 0.0, 1.0))
    keyframe_socket(wake_shader.inputs["Emission Color"], cfg.EVENTS["horizontal_line_start"], wake_emission)
    keyframe_socket(wake_shader.inputs["Emission Strength"], cfg.EVENTS["horizontal_line_start"] - 1, 0.0)
    keyframe_socket(wake_shader.inputs["Emission Strength"], cfg.EVENTS["horizontal_line_peak"], 0.86)
    keyframe_socket(wake_shader.inputs["Emission Strength"], cfg.EVENTS["horizontal_line_end"], 0.48)
    keyframe_socket(wake_shader.inputs["Emission Strength"], cfg.EVENTS["raster_expansion_start"] + 3, 0.0)

    expansion_collection = bpy.data.collections.get("CRT_STARTUP_RASTER_EXPANSION")
    if expansion_collection is None:
        raise RuntimeError("missing accepted startup-raster collection")
    expansion = list(expansion_collection.all_objects)
    expansion_mat = material("CRT_StartupRasterWarming").copy()
    expansion_mat.name = "Phase3_StartupRasterWarming"
    expansion_shader = principled(expansion_mat)
    for obj in expansion:
        assign_material(obj, expansion_mat)
        obj.hide_render = True
    ordered = sorted(expansion, key=lambda obj: abs(bounds_center(obj).z - 0.425))
    for index, obj in enumerate(ordered):
        show = cfg.EVENTS["raster_expansion_start"] + round(index * 14 / max(1, len(ordered) - 1))
        keyframe_property(obj, "hide_render", max(cfg.FRAME_START, show - 1), True)
        keyframe_property(obj, "hide_render", show, False)
        keyframe_property(obj, "hide_render", cfg.EVENTS["raster_expansion_end"], False)
        keyframe_property(obj, "hide_render", cfg.EVENTS["settling_start"], True)
    keyframe_socket(expansion_shader.inputs["Emission Strength"], cfg.EVENTS["raster_expansion_start"] - 1, 0.0)
    keyframe_socket(expansion_shader.inputs["Emission Strength"], cfg.EVENTS["raster_expansion_start"] + 5, 0.78)
    keyframe_socket(expansion_shader.inputs["Emission Strength"], cfg.EVENTS["raster_expansion_end"], 0.54)
    keyframe_socket(expansion_shader.inputs["Emission Strength"], cfg.EVENTS["settling_start"], 0.0)

    scan_collection = bpy.data.collections.get("CRT_SCANLINE_GEOMETRY")
    if scan_collection is None:
        raise RuntimeError("missing accepted scanline collection")
    scanlines = list(scan_collection.all_objects)
    scan_mat = material("CRT_SubtleScanline").copy()
    scan_mat.name = "Phase3_SubtleScanline"
    scan_shader = principled(scan_mat)
    scan_base = scan_shader.inputs["Base Color"].default_value[:]
    scan_emission = scan_shader.inputs["Emission Color"].default_value[:]
    for obj in scanlines:
        assign_material(obj, scan_mat)
        obj.hide_render = False
    keyframe_socket(scan_shader.inputs["Base Color"], cfg.FRAME_START, (0.0, 0.0, 0.0, 1.0))
    keyframe_socket(scan_shader.inputs["Base Color"], cfg.EVENTS["raster_expansion_start"], (0.0, 0.0, 0.0, 1.0))
    keyframe_socket(scan_shader.inputs["Base Color"], cfg.EVENTS["raster_expansion_end"], scan_base)
    keyframe_socket(scan_shader.inputs["Emission Color"], cfg.FRAME_START, (0.0, 0.0, 0.0, 1.0))
    keyframe_socket(scan_shader.inputs["Emission Color"], cfg.EVENTS["raster_expansion_start"], (0.0, 0.0, 0.0, 1.0))
    keyframe_socket(scan_shader.inputs["Emission Color"], cfg.EVENTS["raster_expansion_end"], scan_emission)
    keyframe_socket(scan_shader.inputs["Emission Strength"], cfg.EVENTS["raster_expansion_start"], 0.0)
    keyframe_socket(scan_shader.inputs["Emission Strength"], cfg.EVENTS["raster_expansion_end"], 0.34)
    keyframe_socket(scan_shader.inputs["Emission Strength"], cfg.EVENTS["black_stabilized"], 0.26)
    keyframe_socket(scan_shader.inputs["Emission Strength"], cfg.EVENTS["signal_stabilized"], 0.22)
    keyframe_socket(scan_shader.inputs["Emission Strength"], cfg.EVENTS["late_flattening"], 0.12)
    keyframe_socket(scan_shader.inputs["Emission Strength"], cfg.EVENTS["handoff"], 0.045)

    phosphor = object_required("CRT_InternalPhosphorLayer")
    phosphor_mat = material("CRT_PhosphorLowGrey").copy()
    phosphor_mat.name = "Phase3_AnimatedPhosphor"
    phosphor_shader = principled(phosphor_mat)
    assign_material(phosphor, phosphor_mat)
    off = principled(material("CRT_PhosphorOff"))
    takeover = principled(material("CRT_PhosphorTakeoverField"))
    page_black = hex_linear(cfg.PAGE_BASE)
    keyframe_socket(phosphor_shader.inputs["Base Color"], cfg.FRAME_START, off.inputs["Base Color"].default_value)
    keyframe_socket(phosphor_shader.inputs["Emission Color"], cfg.FRAME_START, (0.0, 0.0, 0.0, 1.0))
    keyframe_socket(phosphor_shader.inputs["Emission Strength"], cfg.FRAME_START, 0.0)
    keyframe_socket(phosphor_shader.inputs["Emission Strength"], cfg.EVENTS["horizontal_line_end"], 0.0)
    keyframe_socket(phosphor_shader.inputs["Base Color"], cfg.EVENTS["raster_expansion_start"] + 4, phosphor_shader.inputs["Base Color"].default_value)
    keyframe_socket(phosphor_shader.inputs["Emission Color"], cfg.EVENTS["raster_expansion_start"] + 4, phosphor_shader.inputs["Emission Color"].default_value)
    keyframe_socket(phosphor_shader.inputs["Emission Strength"], cfg.EVENTS["raster_expansion_end"], 0.66)
    keyframe_socket(phosphor_shader.inputs["Emission Strength"], cfg.EVENTS["black_stabilized"], 0.52)
    keyframe_socket(phosphor_shader.inputs["Emission Strength"], cfg.EVENTS["signal_stabilized"], 0.44)
    keyframe_socket(phosphor_shader.inputs["Base Color"], cfg.EVENTS["late_flattening"], takeover.inputs["Base Color"].default_value)
    keyframe_socket(phosphor_shader.inputs["Emission Color"], cfg.EVENTS["late_flattening"], takeover.inputs["Emission Color"].default_value)
    keyframe_socket(phosphor_shader.inputs["Emission Strength"], cfg.EVENTS["late_flattening"], 0.20)
    keyframe_socket(phosphor_shader.inputs["Base Color"], cfg.EVENTS["handoff"], page_black)
    keyframe_socket(phosphor_shader.inputs["Emission Color"], cfg.EVENTS["handoff"], page_black)
    keyframe_socket(phosphor_shader.inputs["Emission Strength"], cfg.EVENTS["handoff"], 0.12)

    # Restrained, deterministic degaussing breath; no random glitch or shake.
    for frame, scale in (
        (cfg.EVENTS["raster_expansion_end"], (1.0, 1.0, 1.0)),
        (158, (1.008, 1.0, 0.994)),
        (162, (0.996, 1.0, 1.004)),
        (167, (1.002, 1.0, 0.999)),
        (cfg.EVENTS["black_stabilized"], (1.0, 1.0, 1.0)),
    ):
        phosphor.scale = scale
        phosphor.keyframe_insert(data_path="scale", frame=frame)


def animate_interface() -> None:
    collection = bpy.data.collections.get("CRT_PHYSICAL_SIGNAL_INTERFACE")
    if collection is None:
        raise RuntimeError("missing accepted physical signal interface")
    schedules = {
        "brand": [(174, 0.0), (180, 0.70), (190, 0.68), (197, 0.0)],
        "route": [(187, 0.0), (193, 0.64), (203, 0.62), (213, 0.0)],
        "ready": [(198, 0.0), (204, 0.58), (213, 0.54), (222, 0.0)],
    }
    for stage, schedule in schedules.items():
        mat = material("CRT_PhysicalSignalInterface").copy()
        mat.name = f"Phase3_Interface_{stage.title()}"
        shader = principled(mat)
        interface_base = shader.inputs["Base Color"].default_value[:]
        interface_emission = shader.inputs["Emission Color"].default_value[:]
        for obj in list(collection.all_objects):
            if str(obj.get("interface_stage", "none")) == stage:
                assign_material(obj, mat)
                obj.hide_render = False
                if hasattr(obj, "visible_shadow"):
                    obj.visible_shadow = False
        keyframe_socket(shader.inputs["Base Color"], cfg.FRAME_START, (0.0, 0.0, 0.0, 1.0))
        keyframe_socket(shader.inputs["Base Color"], schedule[0][0], (0.0, 0.0, 0.0, 1.0))
        keyframe_socket(shader.inputs["Base Color"], schedule[1][0], interface_base)
        keyframe_socket(shader.inputs["Emission Color"], cfg.FRAME_START, (0.0, 0.0, 0.0, 1.0))
        keyframe_socket(shader.inputs["Emission Color"], schedule[0][0], (0.0, 0.0, 0.0, 1.0))
        keyframe_socket(shader.inputs["Emission Color"], schedule[1][0], interface_emission)
        for frame, strength in schedule:
            keyframe_socket(shader.inputs["Emission Strength"], frame, strength)


def create_emissive_material(name: str, color: str, strength_keys: list[tuple[int, float]]) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = principled(mat)
    rgba = hex_linear(color)
    shader.inputs["Base Color"].default_value = hex_linear(cfg.PAGE_BASE)
    shader.inputs["Roughness"].default_value = 0.52
    shader.inputs["Emission Color"].default_value = rgba
    for frame, strength in strength_keys:
        keyframe_socket(shader.inputs["Emission Strength"], frame, float(strength))
    return mat


def create_screen_polygon(name: str, coordinates: list[tuple[float, float]], y: float, mat: bpy.types.Material) -> bpy.types.Object:
    vertices = [(x, y, z) for x, z in coordinates]
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], [list(range(len(vertices)))])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    ensure_collection("PHASE3_PORTAL_ALIGNMENT_FIELD").objects.link(obj)
    assign_material(obj, mat)
    obj["phase3_role"] = "text-free alignment geometry for frozen Phase 2B ENTRY"
    if hasattr(obj, "visible_shadow"):
        obj.visible_shadow = False
    return obj


def create_portal_alignment_field() -> None:
    # These low-energy planes mirror only ENTRY's spatial split. Semantic copy
    # remains absent so Phase 4 can transfer ownership to native DOM exactly once.
    dark_slate = create_emissive_material(
        "Phase3_PortalDarkSlate",
        "#1a2325",
        [(226, 0.0), (244, 0.08), (260, 0.18), (270, 0.22)],
    )
    dark_magenta = create_emissive_material(
        "Phase3_PortalDarkMagenta",
        "#2b111c",
        [(226, 0.0), (244, 0.06), (260, 0.16), (270, 0.20)],
    )
    route_accent = create_emissive_material(
        "Phase3_PortalRouteAccent",
        cfg.QUANTUM_MAGENTA,
        [(232, 0.0), (252, 0.05), (266, 0.11), (270, 0.12)],
    )
    y = -0.1095
    create_screen_polygon(
        "Phase3_PortalLeftField",
        [(0.385, 0.230), (0.590, 0.230), (0.665, 0.620), (0.385, 0.620)],
        y,
        dark_slate,
    )
    create_screen_polygon(
        "Phase3_PortalRightField",
        [(0.695, 0.230), (0.915, 0.230), (0.915, 0.620), (0.755, 0.620)],
        y - 0.0002,
        dark_magenta,
    )
    create_screen_polygon(
        "Phase3_PortalLeftRouteDatum",
        [(0.405, 0.270), (0.630, 0.270), (0.630, 0.273), (0.405, 0.273)],
        y - 0.0004,
        route_accent,
    )
    create_screen_polygon(
        "Phase3_PortalRightRouteDatum",
        [(0.670, 0.270), (0.895, 0.270), (0.895, 0.273), (0.670, 0.273)],
        y - 0.0004,
        route_accent,
    )

    cue_collection = bpy.data.collections.get("CRT_PORTAL_TAKEOVER_CUES")
    if cue_collection is not None:
        cue_mat = material("CRT_TextFreePortalContinuityCue").copy()
        cue_mat.name = "Phase3_TextFreePortalContinuityCue"
        cue_shader = principled(cue_mat)
        for obj in list(cue_collection.all_objects):
            assign_material(obj, cue_mat)
            obj.hide_render = False
        for frame, strength in ((220, 0.0), (238, 0.12), (255, 0.09), (270, 0.035)):
            keyframe_socket(cue_shader.inputs["Emission Strength"], frame, strength)


def animate_glass_and_screen_spill() -> None:
    glass = material("CRT_ThickSmokedGlass").copy()
    glass.name = "Phase3_AnimatedSmokedGlass"
    assign_material(object_required("CRT_ConvexThickSmokedGlass"), glass)
    shader = principled(glass)
    roughness = shader.inputs["Roughness"]
    transmission = shader.inputs.get("Transmission Weight")
    specular = shader.inputs.get("Specular IOR Level") or shader.inputs.get("IOR Level")
    for frame, value in ((1, 0.14), (154, 0.12), (232, 0.10), (255, 0.065), (270, 0.035)):
        keyframe_socket(roughness, frame, value)
    if transmission is not None:
        for frame, value in ((1, 0.58), (154, 0.72), (232, 0.78), (255, 0.88), (270, 0.94)):
            keyframe_socket(transmission, frame, value)
    if specular is not None:
        for frame, value in ((1, 0.32), (154, 0.20), (232, 0.15), (255, 0.10), (270, 0.07)):
            keyframe_socket(specular, frame, value)
    if shader.inputs.get("Coat Weight") is not None:
        shader.inputs["Coat Weight"].default_value = 0.0

    data = bpy.data.lights.new("Phase3_ScreenSpill_Data", "AREA")
    data.shape = "RECTANGLE"
    data.size = 0.48
    data.size_y = 0.34
    data.color = (0.64, 0.46, 0.52)
    data.energy = 0.0
    light = bpy.data.objects.new("Phase3_ScreenSpill", data)
    light.location = (0.65, -0.18, 0.44)
    direction = Vector((0.65, -0.95, 0.08)) - light.location
    light.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    light["phase3_physical_source"] = "activated CRT raster"
    ensure_collection("PHASE3_SCREEN_LIGHTING").objects.link(light)
    for frame, energy in ((132, 0.0), (154, 38.0), (176, 28.0), (210, 34.0), (245, 22.0), (270, 8.0)):
        keyframe_property(data, "energy", frame, energy)


def configure_scene() -> None:
    scene = bpy.context.scene
    scene.frame_start = cfg.FRAME_START
    scene.frame_end = cfg.FRAME_END
    scene.render.fps = cfg.FPS
    scene.render.fps_base = 1.0
    scene.render.resolution_x = cfg.DESKTOP_MASTER[0]
    scene.render.resolution_y = cfg.DESKTOP_MASTER[1]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 42
    scene.render.film_transparent = False
    scene.view_settings.view_transform = cfg.CYCLES["view_transform"]
    try:
        scene.view_settings.look = cfg.CYCLES["look"]
    except TypeError:
        scene.view_settings.look = next(
            look for look in ("AgX - Medium High Contrast", "Medium High Contrast")
            if "Medium High Contrast" in look
        )
    scene.render.engine = cfg.CYCLES["engine"]
    scene.cycles.samples = cfg.CYCLES["samples"]
    scene.cycles.seed = cfg.CYCLES["seed"]
    scene.cycles.use_adaptive_sampling = cfg.CYCLES["adaptive_sampling"]
    scene.cycles.adaptive_threshold = cfg.CYCLES["adaptive_threshold"]
    scene.cycles.use_denoising = cfg.CYCLES["denoising"]
    scene.cycles.denoiser = cfg.CYCLES["denoiser"]
    scene.cycles.max_bounces = cfg.CYCLES["max_bounces"]
    scene.cycles.diffuse_bounces = cfg.CYCLES["diffuse_bounces"]
    scene.cycles.glossy_bounces = cfg.CYCLES["glossy_bounces"]
    scene.cycles.transmission_bounces = cfg.CYCLES["transmission_bounces"]
    scene.cycles.transparent_max_bounces = cfg.CYCLES["transparent_bounces"]
    scene.cycles.volume_bounces = cfg.CYCLES["volume_bounces"]
    scene.render.use_persistent_data = True
    if scene.world is not None:
        scene.world.color = (0.0015, 0.0018, 0.0019)

    scene["phase3_schema"] = "quantum-hub.phase-3-crt-opening.production-source.v1"
    scene["phase3_normalized_timeline"] = "0.000-1.000"
    scene["phase3_accepted_source_sha256"] = cfg.ACCEPTED_SOURCE_SHA256
    scene["phase3_page_black"] = cfg.PAGE_BASE
    scene["phase3_quantum_magenta"] = cfg.QUANTUM_MAGENTA
    scene["phase3_external_models"] = 0
    scene["phase3_external_images"] = 0
    scene["phase3_private_reference_loaded"] = False
    scene["phase3_random_events"] = 0
    scene["phase3_audio_tracks"] = 0


def add_compositor() -> None:
    # Blender 5.2's compositor API is intentionally not serialized here. The
    # physically small emission values and OIDN render are the production
    # authority; no post-render fog/bloom layer is required.
    bpy.context.scene["phase3_post_bloom"] = "none; restrained physical emission only"


def clean_animation() -> None:
    for obj in bpy.data.objects:
        obj.animation_data_clear()
        if getattr(obj, "data", None) is not None and hasattr(obj.data, "animation_data_clear"):
            obj.data.animation_data_clear()
    for mat in bpy.data.materials:
        if mat.node_tree is not None:
            mat.node_tree.animation_data_clear()


def main() -> None:
    accepted_hash = sha256(cfg.ACCEPTED_SOURCE)
    if accepted_hash != cfg.ACCEPTED_SOURCE_SHA256:
        raise RuntimeError(
            f"accepted CRT source hash mismatch: expected {cfg.ACCEPTED_SOURCE_SHA256}, got {accepted_hash}"
        )
    if Path(bpy.data.filepath).resolve() != cfg.ACCEPTED_SOURCE.resolve():
        raise RuntimeError("builder must be run with the exact accepted source opened on Blender's command line")
    if cfg.DERIVATIVE_SOURCE.resolve() == cfg.ACCEPTED_SOURCE.resolve():
        raise RuntimeError("derivative path would overwrite accepted source")

    cfg.SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    cfg.MANIFEST_ROOT.mkdir(parents=True, exist_ok=True)
    clean_animation()
    configure_scene()
    desktop_camera = animate_camera("Phase3_Camera_Desktop", cfg.DESKTOP_CAMERA_KEYS, portrait=False)
    animate_camera("Phase3_Camera_Mobile", cfg.MOBILE_CAMERA_KEYS, portrait=True)
    bpy.context.scene.camera = desktop_camera
    desktop_segments = animate_cable("SpiralCable_InternalChannel_", "desktop")
    mobile_segments = animate_cable("MobileSpiralCable_InternalChannel_", "mobile")
    animate_contact_lights(desktop_segments, "desktop")
    animate_contact_lights(mobile_segments, "mobile")
    animate_power_sequence()
    animate_interface()
    create_portal_alignment_field()
    animate_glass_and_screen_spill()
    add_compositor()

    # Default saved state is the true dormant desktop frame.
    bpy.data.collections["DESKTOP_2_5_TURN_SPIRAL_CABLE"].hide_render = False
    bpy.data.collections["MOBILE_2_25_TURN_SPIRAL_CABLE"].hide_render = True
    bpy.data.collections["PHASE3_DESKTOP_CONTACT_LIGHTS"].hide_render = False
    bpy.data.collections["PHASE3_MOBILE_CONTACT_LIGHTS"].hide_render = True
    bpy.context.scene.frame_set(cfg.FRAME_START)

    bpy.ops.wm.save_as_mainfile(filepath=str(cfg.DERIVATIVE_SOURCE.resolve()))
    manifest = {
        "schema": "quantum-hub.phase-3-crt-opening.source-build.v1",
        "status": "PASS",
        "accepted_source": repository_record(cfg.ACCEPTED_SOURCE),
        "derivative_source": file_record(cfg.DERIVATIVE_SOURCE),
        "builder": file_record(Path(__file__).resolve()),
        "configuration": file_record(Path(cfg.__file__).resolve()),
        "blender_version": bpy.app.version_string,
        "timeline": {
            "fps": cfg.FPS,
            "frame_start": cfg.FRAME_START,
            "frame_end": cfg.FRAME_END,
            "duration_seconds": cfg.DURATION_SECONDS,
            "events": {key: {"frame": frame, "progress": round(cfg.normalized(frame), 6)} for key, frame in cfg.EVENTS.items()},
        },
        "render_authority": cfg.CYCLES,
        "animation": {
            "desktop_camera_keys": cfg.DESKTOP_CAMERA_KEYS,
            "mobile_camera_keys": cfg.MOBILE_CAMERA_KEYS,
            "desktop_conductor_segments": len(desktop_segments),
            "mobile_conductor_segments": len(mobile_segments),
            "contact_lights_per_variant": 12,
            "deterministic": True,
            "random_events": 0,
            "audio_tracks": 0,
        },
        "creative_boundaries": {
            "accepted_crt_remodelled": False,
            "accepted_master_modified": False,
            "phase2b_homepage_modified": False,
            "external_models": 0,
            "external_images": 0,
            "third_party_textures": 0,
            "private_reference_loaded": False,
            "circular_startup_graphics": 0,
        },
    }
    target = cfg.MANIFEST_ROOT / "phase-3-source-build.json"
    target.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"QH_PHASE3_DERIVATIVE={cfg.DERIVATIVE_SOURCE.resolve()}")
    print(f"QH_PHASE3_DERIVATIVE_SHA256={manifest['derivative_source']['sha256']}")
    print(f"QH_PHASE3_SOURCE_BUILD_MANIFEST={target.resolve()}")


if __name__ == "__main__":
    main()
