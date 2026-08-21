"""Build the narrow Phase 3-R CRT screen-authenticity derivative.

The exact accepted Phase 3 derivative must be opened on Blender's command
line. This script changes only allowlisted optical screen channels and saves a
new derivative. It never overwrites either historical Blender authority.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any, Iterable

import bpy

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import phase3r_config as cfg


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
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_record(path: Path) -> dict[str, Any]:
    resolved = path.resolve()
    try:
        identity = {"package_relative_path": resolved.relative_to(cfg.PACKAGE_DIR.resolve()).as_posix()}
    except ValueError:
        identity = {"repository_relative_path": resolved.relative_to(cfg.REPOSITORY_ROOT.resolve()).as_posix()}
    return {**identity, "bytes": path.stat().st_size, "sha256": sha256(path)}


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
    """Return legacy or layered Blender action curves with stable slot labels."""
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
        for slot, curve in sorted(action_curves(action), key=lambda item: (item[0], item[1].data_path, item[1].array_index))
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
            record: dict[str, Any] = {
                "type": spline.type,
                "cyclic": bool(spline.use_cyclic_u),
            }
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


def material_signature(mat: bpy.types.Material) -> dict[str, Any]:
    if mat.node_tree is None:
        return {"name": mat.name, "use_nodes": False, "diffuse": rounded(mat.diffuse_color)}
    nodes = []
    for node in sorted(mat.node_tree.nodes, key=lambda item: item.name):
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
        (
            link.from_node.name,
            link.from_socket.name,
            link.to_node.name,
            link.to_socket.name,
        )
        for link in mat.node_tree.links
    )
    return {
        "name": mat.name,
        "use_nodes": True,
        "nodes": nodes,
        "links": links,
        "animation": action_signature(mat.node_tree),
        "properties": primitive_properties(mat),
    }


def is_screen_object(obj: bpy.types.Object) -> bool:
    return obj.name in SCREEN_OBJECTS or obj.name.startswith(SCREEN_OBJECT_PREFIXES)


def is_screen_material(mat: bpy.types.Material) -> bool:
    return mat.name in SCREEN_MATERIALS or mat.name.startswith("Phase3R_")


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
        material_signature(mat)
        for mat in sorted(bpy.data.materials, key=lambda item: item.name)
        if not is_screen_material(mat)
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
    encoded = json.dumps(snapshot, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def object_required(name: str) -> bpy.types.Object:
    obj = bpy.data.objects.get(name)
    if obj is None:
        raise RuntimeError(f"missing Phase 3 object: {name}")
    return obj


def ensure_collection(name: str) -> bpy.types.Collection:
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(collection)
    return collection


def assign_material(obj: bpy.types.Object, mat: bpy.types.Material) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def hex_linear(value: str) -> tuple[float, float, float, float]:
    value = value.lstrip("#")
    channels = [int(value[index : index + 2], 16) / 255.0 for index in (0, 2, 4)]

    def convert(channel: float) -> float:
        return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4

    return tuple(convert(channel) for channel in channels) + (1.0,)


def keyframe_default(socket: Any, frame: int, value: Any) -> None:
    socket.default_value = value
    socket.keyframe_insert(data_path="default_value", frame=int(frame))


def keyframe_object(obj: bpy.types.Object, data_path: str, frame: int, value: Any) -> None:
    setattr(obj, data_path, value)
    obj.keyframe_insert(data_path=data_path, frame=int(frame))


def set_curve_policy(owner: Any, data_paths: Iterable[str], interpolation: str) -> None:
    animation = getattr(owner, "animation_data", None)
    action = None if animation is None else animation.action
    if action is None:
        return
    wanted = set(data_paths)
    for _slot, curve in action_curves(action):
        if "*" not in wanted and curve.data_path not in wanted:
            continue
        for point in curve.keyframe_points:
            point.interpolation = interpolation
            if interpolation == "BEZIER":
                point.handle_left_type = "AUTO_CLAMPED"
                point.handle_right_type = "AUTO_CLAMPED"


def create_modulated_emission_material(
    name: str,
    *,
    band_count: float,
    raster_keys: list[tuple[int, float]],
    strength_keys: list[tuple[int, float]],
    tone_keys: list[tuple[int, tuple[float, float, float, float]]],
    base_keys: list[tuple[int, tuple[float, float, float, float]]],
    noise_range: tuple[float, float],
    roughness: float,
    field_mask_keys: list[tuple[int, float]] | None = None,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_fake_user = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.name = "Material Output"
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.name = "Principled BSDF"
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = 0.0

    coordinates = nodes.new("ShaderNodeTexCoord")
    coordinates.name = "Generated Screen Coordinates"
    wave = nodes.new("ShaderNodeTexWave")
    wave.name = "Fine Physical Raster"
    wave.wave_type = "BANDS"
    wave.bands_direction = "Z"
    wave.inputs["Scale"].default_value = band_count
    wave.inputs["Distortion"].default_value = 0.18
    wave.inputs["Detail"].default_value = 2.0
    wave.inputs["Detail Scale"].default_value = 1.6
    contrast = nodes.new("ShaderNodeValue")
    contrast.name = "Phase3R Raster Contrast"
    raster_product = nodes.new("ShaderNodeMath")
    raster_product.name = "Raster Contrast Product"
    raster_product.operation = "MULTIPLY"
    raster_modulation = nodes.new("ShaderNodeMath")
    raster_modulation.name = "Continuous Field First"
    raster_modulation.operation = "SUBTRACT"
    raster_modulation.inputs[0].default_value = 1.0

    noise = nodes.new("ShaderNodeTexNoise")
    noise.name = "Maintained Phosphor Variation"
    noise.noise_dimensions = "3D"
    noise.inputs["Scale"].default_value = 5.2
    noise.inputs["Detail"].default_value = 2.1
    noise.inputs["Roughness"].default_value = 0.48
    noise.inputs["Distortion"].default_value = 0.06
    noise_ramp = nodes.new("ShaderNodeValToRGB")
    noise_ramp.name = "Restrained Static Intensity Range"
    noise_ramp.color_ramp.elements[0].position = 0.16
    noise_ramp.color_ramp.elements[0].color = (noise_range[0],) * 3 + (1.0,)
    noise_ramp.color_ramp.elements[1].position = 0.84
    noise_ramp.color_ramp.elements[1].color = (noise_range[1],) * 3 + (1.0,)
    combined = nodes.new("ShaderNodeMath")
    combined.name = "Physical Raster Modulation"
    combined.operation = "MULTIPLY"

    modulation_output = combined.outputs["Value"]
    if field_mask_keys is not None:
        separate = nodes.new("ShaderNodeSeparateXYZ")
        separate.name = "Picture Field Vertical Coordinate"
        centered = nodes.new("ShaderNodeMath")
        centered.name = "Picture Field Distance From Center"
        centered.operation = "SUBTRACT"
        centered.inputs[1].default_value = 0.5
        absolute = nodes.new("ShaderNodeMath")
        absolute.name = "Picture Field Absolute Distance"
        absolute.operation = "ABSOLUTE"
        half_height = nodes.new("ShaderNodeValue")
        half_height.name = "Phase3R Picture Field Half Height"
        lower = nodes.new("ShaderNodeMath")
        lower.name = "Picture Field Feather Inner"
        lower.operation = "SUBTRACT"
        lower.inputs[1].default_value = 0.018
        upper = nodes.new("ShaderNodeMath")
        upper.name = "Picture Field Feather Outer"
        upper.operation = "ADD"
        upper.inputs[1].default_value = 0.018
        mask = nodes.new("ShaderNodeMapRange")
        mask.name = "Soft Vertical Picture Formation"
        mask.interpolation_type = "SMOOTHERSTEP"
        mask.clamp = True
        mask.inputs["To Min"].default_value = 1.0
        mask.inputs["To Max"].default_value = 0.0
        masked = nodes.new("ShaderNodeMath")
        masked.name = "Soft Field With Internal Raster"
        masked.operation = "MULTIPLY"
        links.new(coordinates.outputs["Generated"], separate.inputs["Vector"])
        links.new(separate.outputs["Z"], centered.inputs[0])
        links.new(centered.outputs["Value"], absolute.inputs[0])
        links.new(half_height.outputs["Value"], lower.inputs[0])
        links.new(half_height.outputs["Value"], upper.inputs[0])
        links.new(absolute.outputs["Value"], mask.inputs["Value"])
        links.new(lower.outputs["Value"], mask.inputs["From Min"])
        links.new(upper.outputs["Value"], mask.inputs["From Max"])
        links.new(combined.outputs["Value"], masked.inputs[0])
        links.new(mask.outputs["Result"], masked.inputs[1])
        modulation_output = masked.outputs["Value"]
        for frame, value in field_mask_keys:
            keyframe_default(half_height.outputs["Value"], frame, float(value))

    tone = nodes.new("ShaderNodeRGB")
    tone.name = "Phase3R Phosphor Tone"
    tone_mix = nodes.new("ShaderNodeMixRGB")
    tone_mix.name = "Tone Through Phosphor Structure"
    tone_mix.blend_type = "MULTIPLY"
    tone_mix.inputs[0].default_value = 1.0
    base = nodes.new("ShaderNodeRGB")
    base.name = "Phase3R Physical Black"

    links.new(coordinates.outputs["Generated"], wave.inputs["Vector"])
    links.new(coordinates.outputs["Generated"], noise.inputs["Vector"])
    links.new(wave.outputs["Fac"], raster_product.inputs[0])
    links.new(contrast.outputs["Value"], raster_product.inputs[1])
    links.new(raster_product.outputs["Value"], raster_modulation.inputs[1])
    links.new(noise.outputs["Fac"], noise_ramp.inputs["Fac"])
    links.new(raster_modulation.outputs["Value"], combined.inputs[0])
    links.new(noise_ramp.outputs["Color"], combined.inputs[1])
    links.new(tone.outputs["Color"], tone_mix.inputs[1])
    links.new(modulation_output, tone_mix.inputs[2])
    links.new(base.outputs["Color"], shader.inputs["Base Color"])
    links.new(tone_mix.outputs["Color"], shader.inputs["Emission Color"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    for frame, value in raster_keys:
        keyframe_default(contrast.outputs["Value"], frame, float(value))
    for frame, value in strength_keys:
        keyframe_default(shader.inputs["Emission Strength"], frame, float(value))
    for frame, value in tone_keys:
        keyframe_default(tone.outputs["Color"], frame, value)
    for frame, value in base_keys:
        keyframe_default(base.outputs["Color"], frame, value)
    set_curve_policy(mat.node_tree, {"*"}, "BEZIER")
    mat.diffuse_color = tone_keys[0][1]
    mat["phase3r_picture_field_first"] = True
    mat["phase3r_raster_bands"] = band_count
    mat["phase3r_noise_temporal"] = False
    return mat


def create_wake_material(name: str, peak: float) -> bpy.types.Material:
    tone = hex_linear("#d9d7d0")
    black = hex_linear("#050606")
    return create_modulated_emission_material(
        name,
        band_count=1.0,
        raster_keys=[(1, 0.0), (270, 0.0)],
        strength_keys=[
            (120, 0.0),
            (121, peak * 0.18),
            (124, peak * 0.64),
            (126, peak),
            (130, peak * 0.78),
            (132, peak * 0.50),
            (136, 0.0),
        ],
        tone_keys=[(1, tone), (270, tone)],
        base_keys=[(1, black), (270, black)],
        noise_range=(0.82, 1.0),
        roughness=0.42,
    )


def phosphor_face_y(x: float, z: float, optical_offset: float = -0.0010) -> float:
    u = max(-1.0, min(1.0, x / (0.566 * 0.5)))
    v = max(-1.0, min(1.0, (z - 0.425) / (0.4245 * 0.5)))
    shape = (1.0 - u * u) * (1.0 - v * v)
    return -0.337 - 0.032 * shape + optical_offset


def glass_mediated_mark_y(x: float, z: float, inset: float = 0.0040) -> float:
    """Seat optical marks just within the accepted glass, never on its face."""
    u = max(-1.0, min(1.0, x / (0.584 * 0.5)))
    v = max(-1.0, min(1.0, (z - 0.425) / (0.436 * 0.5)))
    shape = (1.0 - u * u) * (1.0 - v * v)
    return -0.352 - 0.034 * shape + inset


def poly_curve(
    name: str,
    points: list[tuple[float, float, float]],
    radius: float,
    mat: bpy.types.Material,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 3
    curve.bevel_resolution = 6
    curve.bevel_depth = radius
    curve.use_fill_caps = True
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for index, (point, coordinate) in enumerate(zip(spline.points, points)):
        point.co = (*coordinate, 1.0)
        edge = min(index, len(points) - 1 - index) / max(1.0, (len(points) - 1) * 0.10)
        phase = index / max(1, len(points) - 1)
        maintained = 0.92 + 0.045 * math.sin(math.tau * phase * 2.3 + 0.2) + 0.025 * math.sin(math.tau * phase * 5.1)
        point.radius = max(0.12, min(1.0, edge)) * maintained
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    obj.parent = object_required("CRT_ASSEMBLY_ROOT")
    assign_material(obj, mat)
    return obj


def disable_legacy_line_geometry() -> None:
    object_required("CRT_WakeHorizontalPhosphorLine").animation_data_clear()
    object_required("CRT_WakeHorizontalPhosphorLine").hide_render = True
    for collection_name in ("CRT_STARTUP_RASTER_EXPANSION", "CRT_SCANLINE_GEOMETRY"):
        collection = bpy.data.collections.get(collection_name)
        if collection is None:
            raise RuntimeError(f"missing legacy screen collection: {collection_name}")
        for obj in list(collection.all_objects):
            obj.animation_data_clear()
            obj.hide_render = True


def create_neutral_wake() -> None:
    collection = ensure_collection("PHASE3R_CRT_SCREEN_REPAIR")
    points = []
    for index in range(65):
        phase = index / 64.0
        x = -0.178 + 0.356 * phase
        bow = 0.0048 * (1.0 - (x / 0.178) ** 2)
        maintained_variation = 0.00022 * math.sin(math.tau * phase + 0.35)
        z = 0.425 + bow + maintained_variation
        points.append((x, glass_mediated_mark_y(x, z, 0.00045), z))
    layers = (
        ("Phase3R_WakePhosphorHalo", 0.0035, create_wake_material("Phase3R_WakeHalo_Neutral", 0.320)),
        ("Phase3R_WakePhosphorBody", 0.00135, create_wake_material("Phase3R_WakeBody_Neutral", 0.620)),
        ("Phase3R_WakePhosphorCore", 0.00050, create_wake_material("Phase3R_WakeCore_Neutral", 1.600)),
    )
    for name, radius, mat in layers:
        obj = poly_curve(name, points, radius, mat, collection)
        obj["phase3r_role"] = "neutral maintained-phosphor wake behind accepted convex glass"
        keyframe_object(obj, "hide_render", 1, True)
        keyframe_object(obj, "hide_render", 120, True)
        keyframe_object(obj, "hide_render", 121, False)
        keyframe_object(obj, "hide_render", 136, False)
        keyframe_object(obj, "hide_render", 137, True)
        obj.scale = (0.88, 1.0, 1.0)
        obj.keyframe_insert(data_path="scale", frame=121)
        obj.scale = (0.98, 1.0, 1.0)
        obj.keyframe_insert(data_path="scale", frame=126)
        obj.scale = (1.0, 1.0, 1.0)
        obj.keyframe_insert(data_path="scale", frame=132)
        set_curve_policy(obj, {"hide_render"}, "CONSTANT")
        set_curve_policy(obj, {"scale"}, "BEZIER")


def animate_field_object(phosphor: bpy.types.Object) -> None:
    phosphor.animation_data_clear()
    scale_keys = (
        (1, (1.0, 1.0, 1.0)),
        (154, (1.0, 1.0, 1.000)),
        (158, (1.0035, 1.0, 0.9975)),
        (162, (0.9980, 1.0, 1.0025)),
        (167, (1.0010, 1.0, 0.9995)),
        (176, (1.0, 1.0, 1.0)),
        (270, (1.0, 1.0, 1.0)),
    )
    for frame, scale in scale_keys:
        phosphor.scale = scale
        phosphor.location = (0.0, 0.0, 0.425 * (1.0 - scale[2]))
        phosphor.keyframe_insert(data_path="scale", frame=frame)
        phosphor.keyframe_insert(data_path="location", frame=frame)
    set_curve_policy(phosphor, {"scale", "location"}, "BEZIER")


def create_field_materials() -> tuple[bpy.types.Material, bpy.types.Material]:
    warm = hex_linear("#d8d2c6")
    warm_late = hex_linear("#c5c3bb")
    neutral_late = hex_linear("#7f8583")
    dark_late = hex_linear("#30383a")
    page = hex_linear(cfg.PAGE_BASE)
    physical_black = hex_linear("#080a0a")
    raster = [
        (1, 0.0),
        (133, 0.0),
        (144, 0.010),
        (154, 0.075),
        (162, 0.085),
        (176, 0.085),
        (210, 0.075),
        (232, 0.060),
        (247, 0.030),
        (255, 0.010),
        (262, 0.004),
        (270, 0.001),
    ]
    strength = [
        (1, 0.0),
        (131, 0.0),
        (132, 0.035),
        (133, 0.080),
        (137, 0.220),
        (144, 0.520),
        (150, 0.600),
        (154, 0.560),
        (162, 0.420),
        (176, 0.300),
        (210, 0.280),
        (232, 0.235),
        (247, 0.180),
        (250, 0.145),
        (255, 0.100),
        (262, 0.050),
        (270, 0.015),
    ]
    tone = [(1, warm), (247, warm), (250, warm_late), (255, neutral_late), (262, dark_late), (270, page)]
    base = [(1, physical_black), (247, physical_black), (262, hex_linear("#0b0e0f")), (270, page)]
    desktop = create_modulated_emission_material(
        "Phase3R_PhosphorField_Desktop",
        band_count=cfg.DESKTOP_RASTER_BANDS,
        raster_keys=raster,
        strength_keys=strength,
        tone_keys=tone,
        base_keys=base,
        noise_range=(0.955, 1.015),
        roughness=0.58,
        field_mask_keys=[(1, 0.0), (131, 0.0), (132, 0.006), (133, 0.010), (137, 0.075), (144, 0.280), (150, 0.430), (154, 0.520), (270, 0.520)],
    )
    mobile = create_modulated_emission_material(
        "Phase3R_PhosphorField_Mobile",
        band_count=cfg.MOBILE_RASTER_BANDS,
        raster_keys=[(frame, value * 0.72) for frame, value in raster],
        strength_keys=[(frame, value * (0.94 if 132 <= frame <= 247 else 1.0)) for frame, value in strength],
        tone_keys=tone,
        base_keys=base,
        noise_range=(0.965, 1.010),
        roughness=0.58,
        field_mask_keys=[(1, 0.0), (131, 0.0), (132, 0.006), (133, 0.010), (137, 0.075), (144, 0.280), (150, 0.430), (154, 0.520), (270, 0.520)],
    )
    return desktop, mobile


def interface_schedule(stage: str) -> list[tuple[int, float]]:
    return {
        "brand": [(174, 0.0), (180, 1.00), (190, 0.94), (197, 0.0)],
        "route": [(187, 0.0), (193, 0.90), (203, 0.84), (213, 0.0)],
        "ready": [(198, 0.0), (204, 0.80), (213, 0.74), (222, 0.0)],
    }[stage]


def create_interface_material(stage: str, variant: str) -> bpy.types.Material:
    schedule = interface_schedule(stage)
    band_count = {"brand": 22.0, "route": 9.0, "ready": 11.0}[stage]
    mobile = variant == "mobile"
    warm = hex_linear("#d9d4c9")
    black = hex_linear("#080a0a")
    first, last = schedule[0][0], schedule[-1][0]
    return create_modulated_emission_material(
        f"Phase3R_Interface_{stage.title()}_{variant.title()}",
        band_count=band_count * (0.74 if mobile else 1.0),
        raster_keys=[(1, 0.0), (first, 0.020 if mobile else 0.032), (last, 0.018 if mobile else 0.028), (270, 0.001)],
        strength_keys=[(frame, value * (0.94 if mobile else 1.0)) for frame, value in schedule],
        tone_keys=[(1, warm), (270, warm)],
        base_keys=[(1, black), (270, black)],
        noise_range=(0.94, 1.0),
        roughness=0.44,
    )


def text_xz_digest(objects: list[bpy.types.Object]) -> str:
    payload = []
    for obj in objects:
        payload.append(
            {
                "name": obj.name,
                "vertices": [(round(vertex.co.x, 9), round(vertex.co.z, 9)) for vertex in obj.data.vertices],
                "edges": [list(edge.vertices) for edge in obj.data.edges],
                "polygons": [list(polygon.vertices) for polygon in obj.data.polygons],
            }
        )
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def repair_interface() -> dict[str, Any]:
    collection = bpy.data.collections.get("CRT_PHYSICAL_SIGNAL_INTERFACE")
    if collection is None:
        raise RuntimeError("missing accepted physical interface")
    objects = [
        obj
        for obj in collection.all_objects
        if str(obj.get("interface_stage", "none")) in {"brand", "route", "ready"}
    ]
    before = text_xz_digest(objects)
    materials: dict[tuple[str, str], bpy.types.Material] = {}
    for stage in ("brand", "route", "ready"):
        for variant in ("desktop", "mobile"):
            materials[(stage, variant)] = create_interface_material(stage, variant)
    for obj in objects:
        stage = str(obj.get("interface_stage"))
        for vertex in obj.data.vertices:
            vertex.co.y = glass_mediated_mark_y(float(vertex.co.x), float(vertex.co.z), 0.0048)
        obj.data.update()
        assign_material(obj, materials[(stage, "desktop")])
        obj["phase3r_optical_depth"] = "curved 4.8 mm within accepted convex glass; never on outer face"
    after = text_xz_digest(objects)
    if before != after:
        raise RuntimeError("interface x/z topology or accepted typography changed")
    return {"before": before, "after": after, "object_count": len(objects)}


def rebalance_screen_spill() -> None:
    light = object_required("Phase3_ScreenSpill")
    light.data.color = (0.72, 0.67, 0.59)
    light.data.animation_data_clear()
    for frame, energy in ((132, 0.0), (154, 31.0), (176, 24.0), (210, 26.0), (245, 14.0), (255, 7.0), (270, 2.0)):
        light.data.energy = energy
        light.data.keyframe_insert(data_path="energy", frame=frame)
    set_curve_policy(light.data, {"energy"}, "BEZIER")
    light["phase3r_screen_only_compensation"] = "neutral warm spill balanced for continuous phosphor field"


def repair_portal_cue_material() -> None:
    """Keep accepted cue geometry but prevent black carriers before approach."""
    collection = bpy.data.collections.get("CRT_PORTAL_TAKEOVER_CUES")
    if collection is None:
        raise RuntimeError("missing accepted portal continuity cues")
    source = bpy.data.materials.get("Phase3_TextFreePortalContinuityCue")
    if source is None or source.node_tree is None:
        raise RuntimeError("missing accepted portal continuity material")
    mat = source.copy()
    mat.name = "Phase3R_TextFreePortalContinuityCue"
    tree = mat.node_tree
    tree.animation_data_clear()
    nodes = tree.nodes
    links = tree.links
    shader = nodes.get("Principled BSDF")
    output = nodes.get("Material Output")
    if shader is None or output is None:
        raise RuntimeError("portal continuity material is not Principled")
    for link in list(output.inputs["Surface"].links):
        links.remove(link)
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    transparent.name = "Phase3R Transparent Before Portal Approach"
    mix = nodes.new("ShaderNodeMixShader")
    mix.name = "Phase3R Portal Cue Optical Entry"
    links.new(transparent.outputs["BSDF"], mix.inputs[1])
    links.new(shader.outputs["BSDF"], mix.inputs[2])
    links.new(mix.outputs["Shader"], output.inputs["Surface"])
    for frame, factor in ((1, 0.0), (220, 0.0), (238, 1.0), (270, 1.0)):
        keyframe_default(mix.inputs[0], frame, factor)
    for frame, strength in ((1, 0.0), (220, 0.0), (238, 0.12), (255, 0.09), (270, 0.035)):
        keyframe_default(shader.inputs["Emission Strength"], frame, strength)
    set_curve_policy(tree, {"*"}, "BEZIER")
    mat["phase3r_geometry_changed"] = False
    mat["phase3r_role"] = "accepted portal geometry optically silent until approach"
    for obj in collection.all_objects:
        assign_material(obj, mat)


def main() -> None:
    opened = Path(bpy.data.filepath).resolve()
    if opened != cfg.PHASE3_DERIVATIVE_SOURCE.resolve():
        raise RuntimeError("repair builder must open the exact accepted Phase 3 derivative")
    parent_hash = sha256(cfg.PHASE3_DERIVATIVE_SOURCE)
    if parent_hash != cfg.PHASE3_DERIVATIVE_SHA256:
        raise RuntimeError(
            f"Phase 3 derivative hash mismatch: expected {cfg.PHASE3_DERIVATIVE_SHA256}, got {parent_hash}"
        )
    if cfg.DERIVATIVE_SOURCE.resolve() in {cfg.PHASE3_DERIVATIVE_SOURCE.resolve(), cfg.ACCEPTED_SOURCE.resolve()}:
        raise RuntimeError("Phase 3-R output would overwrite a historical source authority")

    before_snapshot = frozen_snapshot()
    before_hash = snapshot_hash(before_snapshot)
    phosphor_geometry_before = geometry_signature(object_required("CRT_InternalPhosphorLayer"))

    disable_legacy_line_geometry()
    create_neutral_wake()
    desktop_field, _mobile_field = create_field_materials()
    phosphor = object_required("CRT_InternalPhosphorLayer")
    assign_material(phosphor, desktop_field)
    animate_field_object(phosphor)
    text_topology = repair_interface()
    rebalance_screen_spill()
    repair_portal_cue_material()

    if phosphor_geometry_before != geometry_signature(phosphor):
        raise RuntimeError("accepted internal phosphor mesh geometry changed")
    after_snapshot = frozen_snapshot()
    after_hash = snapshot_hash(after_snapshot)
    if before_hash != after_hash:
        raise RuntimeError(f"frozen Phase 3 signature changed: {before_hash} != {after_hash}")

    scene = bpy.context.scene
    scene["phase3r_schema"] = "quantum-hub.phase-3-r-crt-authenticity.production-source.v1"
    scene["phase3r_repair_parent"] = cfg.REPAIR_PARENT
    scene["phase3r_phase3_derivative_sha256"] = cfg.PHASE3_DERIVATIVE_SHA256
    scene["phase3r_frozen_signature_sha256"] = before_hash
    scene["phase3r_timeline_changed"] = False
    scene["phase3r_random_events"] = 0
    scene["phase3r_scope"] = "phosphor/raster/startup only"
    scene.frame_set(cfg.FRAME_START)
    bpy.data.collections["DESKTOP_2_5_TURN_SPIRAL_CABLE"].hide_render = False
    bpy.data.collections["MOBILE_2_25_TURN_SPIRAL_CABLE"].hide_render = True
    scene.camera = object_required("Phase3_Camera_Desktop")

    cfg.MANIFEST_ROOT.mkdir(parents=True, exist_ok=True)
    cfg.DERIVATIVE_SOURCE.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(cfg.DERIVATIVE_SOURCE), check_existing=False)
    derivative = file_record(cfg.DERIVATIVE_SOURCE)
    manifest = {
        "schema": "quantum-hub.phase-3-r-crt-authenticity.source-build.v1",
        "status": "PASS",
        "repair_parent": cfg.REPAIR_PARENT,
        "blender_version": bpy.app.version_string,
        "accepted_phase0_source": file_record(cfg.ACCEPTED_SOURCE),
        "accepted_phase3_derivative": file_record(cfg.PHASE3_DERIVATIVE_SOURCE),
        "phase3r_derivative": derivative,
        "timeline_changed": False,
        "frozen_signature": {
            "before_sha256": before_hash,
            "after_sha256": after_hash,
            "exact_match": before_hash == after_hash,
        },
        "screen_content_xz_topology": text_topology,
        "legacy_geometry": {
            "startup_expansion_objects_hidden": len(bpy.data.collections["CRT_STARTUP_RASTER_EXPANSION"].all_objects),
            "coarse_scanline_objects_hidden": len(bpy.data.collections["CRT_SCANLINE_GEOMETRY"].all_objects),
        },
        "repair": {
            "startup_line": "neutral warm-white 0.50 mm core, 1.35 mm body, and 3.5 mm low-energy halo with static variation within glass",
            "picture_field": "continuous vertically expanding phosphor surface; no separately revealed bars",
            "desktop_raster_bands": cfg.DESKTOP_RASTER_BANDS,
            "mobile_raster_bands": cfg.MOBILE_RASTER_BANDS,
            "raster_dark_gap_floor": "minimum modulation remains above 0.915 during stable picture",
            "settling": "deterministic <=0.35 percent geometry breath; no random or temporal noise",
            "content": "accepted typography/topology/schedules, curved to phosphor depth, reduced emission",
            "late_suppression": "desktop raster contrast 0.030 at frame 247 to 0.001 at frame 270; mobile uses the documented 0.72 multiplier",
            "screen_spill": "screen-only neutral-warm compensation; accepted lighting philosophy preserved",
            "portal_cues": "accepted geometry unchanged; transparent carriers until frame 220, original late strengths retained",
        },
        "dependencies": {
            "external_images": len(bpy.data.images),
            "linked_libraries": len(bpy.data.libraries),
            "audio": len(bpy.data.sounds),
            "movie_clips": len(bpy.data.movieclips),
            "cache_files": len(bpy.data.cache_files),
            "external_paths": sorted(set(bpy.utils.blend_paths(absolute=True, packed=False, local=False))),
        },
    }
    target = cfg.MANIFEST_ROOT / "phase-3-r-source-build.json"
    target.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"QH_PHASE3R_DERIVATIVE={cfg.DERIVATIVE_SOURCE}")
    print(f"QH_PHASE3R_DERIVATIVE_SHA256={derivative['sha256']}")
    print(f"QH_PHASE3R_FROZEN_SIGNATURE={before_hash}")


if __name__ == "__main__":
    main()
