"""Build the original Quantum Field Unit and Spiral Conduction Blender scene.

Run with Blender, not system Python:

    blender --background --python source/build_scene.py -- --output source/quantum-field-unit.blend

The script is deterministic, uses no external assets, and creates maintainable geometry,
materials, lights, cameras and animation controls from first principles.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path
from typing import Iterable, Sequence

import bpy
from mathutils import Vector

sys.dont_write_bytecode = True

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import scene_config as cfg


TAU = math.tau


def cli_args() -> argparse.Namespace:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=cfg.BLEND_PATH)
    parser.add_argument("--engine", choices=("eevee", "cycles"), default="eevee")
    return parser.parse_args(args)


def clear_scene() -> None:
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.curves,
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)


def collection(name: str, parent: bpy.types.Collection | bpy.types.Scene) -> bpy.types.Collection:
    result = bpy.data.collections.new(name)
    if isinstance(parent, bpy.types.Scene):
        parent.collection.children.link(result)
    else:
        parent.children.link(result)
    return result


def move_to_collection(obj: bpy.types.Object, destination: bpy.types.Collection) -> bpy.types.Object:
    for existing in tuple(obj.users_collection):
        existing.objects.unlink(obj)
    destination.objects.link(obj)
    return obj


def set_smooth(obj: bpy.types.Object) -> None:
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True


def add_bevel(obj: bpy.types.Object, width: float, segments: int = 4) -> None:
    modifier = obj.modifiers.new(name="Purposeful edge radius", type="BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"


def rounded_box(
    name: str,
    dimensions: Sequence[float],
    location: Sequence[float],
    bevel: float,
    material: bpy.types.Material,
    destination: bpy.types.Collection,
    rotation: Sequence[float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    add_bevel(obj, bevel)
    obj.data.materials.append(material)
    return move_to_collection(obj, destination)


def cylinder(
    name: str,
    radius: float,
    depth: float,
    location: Sequence[float],
    rotation: Sequence[float],
    material: bpy.types.Material,
    destination: bpy.types.Collection,
    vertices: int = 64,
    bevel: float = 0.0,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    if bevel:
        add_bevel(obj, bevel, 3)
    set_smooth(obj)
    obj.data.materials.append(material)
    return move_to_collection(obj, destination)


def uv_sphere(
    name: str,
    radius: float,
    location: Sequence[float],
    material: bpy.types.Material,
    destination: bpy.types.Collection,
    segments: int = 48,
    rings: int = 24,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        radius=radius,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    set_smooth(obj)
    obj.data.materials.append(material)
    return move_to_collection(obj, destination)


def torus(
    name: str,
    major_radius: float,
    minor_radius: float,
    location: Sequence[float],
    rotation: Sequence[float],
    material: bpy.types.Material,
    destination: bpy.types.Collection,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=96,
        minor_segments=16,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    set_smooth(obj)
    obj.data.materials.append(material)
    return move_to_collection(obj, destination)


def curve_object(
    name: str,
    points: Iterable[Sequence[float]],
    bevel_depth: float,
    material: bpy.types.Material,
    destination: bpy.types.Collection,
    bevel_resolution: int = 4,
    cyclic: bool = False,
) -> bpy.types.Object:
    curve_data = bpy.data.curves.new(name=f"{name}_Curve", type="CURVE")
    curve_data.dimensions = "3D"
    curve_data.resolution_u = 8
    curve_data.bevel_depth = bevel_depth
    curve_data.bevel_resolution = bevel_resolution
    curve_data.resolution_u = 16
    spline = curve_data.splines.new(type="POLY")
    materialized = tuple(points)
    spline.points.add(len(materialized) - 1)
    for point, coordinate in zip(spline.points, materialized, strict=True):
        point.co = (*coordinate, 1.0)
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve_data)
    curve_data.materials.append(material)
    destination.objects.link(obj)
    return obj


def polygon_slab(
    name: str,
    footprint: Sequence[Sequence[float]],
    z: float,
    material: bpy.types.Material,
    destination: bpy.types.Collection,
) -> bpy.types.Object:
    """Create one restrained engineered ground patch without a circular platform read."""
    thickness = 0.035
    count = len(footprint)
    vertices = [(x, y, z) for x, y in footprint] + [(x, y, z - thickness) for x, y in footprint]
    faces = [tuple(range(count)), tuple(range(count, count * 2))[::-1]]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    destination.objects.link(obj)
    add_bevel(obj, 0.018, 2)
    return obj


def text_object(
    name: str,
    body: str,
    location: Sequence[float],
    size: float,
    material: bpy.types.Material,
    destination: bpy.types.Collection,
    align: str = "LEFT",
) -> bpy.types.Object:
    curve_data = bpy.data.curves.new(name=f"{name}_Text", type="FONT")
    curve_data.body = body
    curve_data.align_x = align
    curve_data.align_y = "CENTER"
    curve_data.size = size
    curve_data.extrude = 0.001
    curve_data.bevel_depth = 0.0004
    curve_data.space_character = 1.1
    curve_data.materials.append(material)
    obj = bpy.data.objects.new(name, curve_data)
    obj.location = location
    obj.rotation_euler = (math.radians(90), 0.0, 0.0)
    destination.objects.link(obj)
    return obj


def assign_principled_value(shader: bpy.types.Node, names: Sequence[str], value) -> None:
    for name in names:
        socket = shader.inputs.get(name)
        if socket is not None:
            socket.default_value = value
            return


def principled_material(
    name: str,
    base_color: Sequence[float],
    roughness: float,
    metallic: float = 0.0,
    microtexture: float | None = None,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    assign_principled_value(shader, ("Base Color",), (*base_color, 1.0))
    assign_principled_value(shader, ("Roughness",), roughness)
    assign_principled_value(shader, ("Metallic",), metallic)
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    if microtexture:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = microtexture
        noise.inputs["Detail"].default_value = 3.0
        noise.inputs["Roughness"].default_value = 0.68
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.13
        bump.inputs["Distance"].default_value = 0.025
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    return material


def smoked_glass_material(name: str) -> bpy.types.Material:
    material = principled_material(name, (0.006, 0.009, 0.010), roughness=0.15, metallic=0.12)
    shader = material.node_tree.nodes.get("Principled BSDF")
    if shader:
        assign_principled_value(shader, ("Transmission Weight", "Transmission"), 0.32)
        assign_principled_value(shader, ("Coat Weight", "Clearcoat"), 0.22)
        assign_principled_value(shader, ("Coat Roughness", "Clearcoat Roughness"), 0.08)
        assign_principled_value(shader, ("IOR",), 1.46)
    return material


def emission_material(
    name: str,
    color: Sequence[float],
    strength: float,
    control: bpy.types.Object | None = None,
    property_name: str | None = None,
    expression: str = "value",
) -> bpy.types.Material:
    material = principled_material(name, (0.004, 0.004, 0.005), roughness=0.24, metallic=0.18)
    shader = material.node_tree.nodes.get("Principled BSDF")
    if shader is None:
        raise RuntimeError(f"Missing Principled shader in {name}")
    emission_color = shader.inputs.get("Emission Color") or shader.inputs.get("Emission")
    emission_strength = shader.inputs.get("Emission Strength")
    if emission_color is None or emission_strength is None:
        raise RuntimeError("Blender Principled emission sockets are unavailable")
    emission_color.default_value = (*color, 1.0)
    emission_strength.default_value = strength if control is None else 0.0
    if control is not None and property_name:
        add_driver(emission_strength, "default_value", control, property_name, expression)
    return material


def volume_material(name: str) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    volume = nodes.new("ShaderNodeVolumePrincipled")
    volume.inputs["Color"].default_value = (0.11, 0.14, 0.15, 1.0)
    volume.inputs["Density"].default_value = 0.0035
    volume.inputs["Anisotropy"].default_value = 0.22
    links.new(volume.outputs["Volume"], output.inputs["Volume"])
    return material


def add_driver(
    target,
    data_path: str,
    control: bpy.types.Object,
    property_name: str,
    expression: str,
    index: int | None = None,
) -> None:
    fcurve = target.driver_add(data_path) if index is None else target.driver_add(data_path, index)
    driver = fcurve.driver
    driver.type = "SCRIPTED"
    variable = driver.variables.new()
    variable.name = "value"
    variable.targets[0].id = control
    variable.targets[0].data_path = f'["{property_name}"]'
    driver.expression = expression


def action_fcurves(animated_id) -> tuple:
    """Return F-curves for both legacy and Blender 5 layered actions."""
    animation_data = getattr(animated_id, "animation_data", None)
    action = getattr(animation_data, "action", None)
    if action is None:
        return ()
    legacy = getattr(action, "fcurves", None)
    if legacy is not None:
        return tuple(legacy)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", ()):
                curves.extend(channelbag.fcurves)
    return tuple(curves)


def create_control(destination: bpy.types.Collection) -> bpy.types.Object:
    control = bpy.data.objects.new("CTRL_SpiralConduction", None)
    control.empty_display_type = "CIRCLE"
    control.empty_display_size = 0.6
    destination.objects.link(control)
    for property_name, keyframes in cfg.CONTROL_KEYS.items():
        control[property_name] = 0.0
        control.id_properties_ui(property_name).update(min=0.0, max=1.0, description=property_name.replace("_", " "))
        for frame, value in keyframes:
            control[property_name] = value
            control.keyframe_insert(data_path=f'["{property_name}"]', frame=frame)
    for fcurve in action_fcurves(control):
        for keyframe in fcurve.keyframe_points:
            keyframe.interpolation = "LINEAR"
    control["design_intent"] = "Original Quantum industrial field-testing instrument"
    control["conduction_direction"] = "outside-in cumulative single front"
    return control


def terrain_height(x: float, y: float) -> float:
    radius = math.hypot(x, y)
    flatten = max(0.0, min(1.0, (radius - 2.0) / 2.8))
    broad = 0.032 * math.sin(x * 0.47) + 0.024 * math.cos(y * 0.58)
    fine = 0.010 * math.sin((x + y) * 1.73) + 0.007 * math.cos((x - y) * 2.21)
    return (broad + fine) * (0.25 + 0.75 * flatten)


def create_terrain(destination: bpy.types.Collection, materials: dict[str, bpy.types.Material]) -> None:
    size = 30.0
    divisions = 60
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int, int]] = []
    for row in range(divisions + 1):
        y = -size / 2 + size * row / divisions
        for column in range(divisions + 1):
            x = -size / 2 + size * column / divisions
            vertices.append((x, y, terrain_height(x, y)))
    stride = divisions + 1
    for row in range(divisions):
        for column in range(divisions):
            index = row * stride + column
            faces.append((index, index + 1, index + stride + 1, index + stride))
    mesh = bpy.data.meshes.new("ProvingGround_EngineeredTerrain_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("ProvingGround_EngineeredTerrain", mesh)
    destination.objects.link(obj)
    obj.data.materials.append(materials["terrain"])
    set_smooth(obj)

    rounded_box(
        "Foreground_ServicePlate",
        (4.1, 1.75, 0.07),
        (-5.3, -5.7, 0.012),
        0.035,
        materials["plate"],
        destination,
        rotation=(0.0, 0.0, math.radians(-7)),
    )
    polygon_slab(
        "GroundPatch_Left",
        ((-11.5, -7.4), (-6.8, -7.9), (-5.9, -3.2), (-10.7, -2.5)),
        0.026,
        materials["slab_a"],
        destination,
    )
    polygon_slab(
        "GroundPatch_Right",
        ((2.9, -7.7), (10.8, -7.0), (10.1, -2.7), (3.7, -2.9)),
        0.022,
        materials["slab_b"],
        destination,
    )
    polygon_slab(
        "GroundPatch_Back",
        ((-7.4, 3.0), (-1.8, 3.5), (-2.1, 7.6), (-8.2, 7.0)),
        0.018,
        materials["slab_b"],
        destination,
    )
    rounded_box(
        "Foreground_DrainageChannel",
        (0.22, 10.0, 0.07),
        (5.9, -3.8, 0.015),
        0.025,
        materials["drain"],
        destination,
        rotation=(0.0, 0.0, math.radians(12)),
    )
    crack_sets = (
        ((-8.2, -1.8, 0.03), (-5.3, -0.9, 0.03), (-3.7, -1.25, 0.03)),
        ((3.1, -6.3, 0.03), (2.6, -3.5, 0.03), (3.3, -1.0, 0.03)),
        ((-1.7, 4.0, 0.03), (0.2, 5.1, 0.03), (2.7, 4.8, 0.03)),
    )
    for index, points in enumerate(crack_sets, 1):
        curve_object(
            f"Terrain_Seam_{index:02d}",
            points,
            0.015,
            materials["seam"],
            destination,
            bevel_resolution=2,
        )


def create_distant_industry(destination: bpy.types.Collection, materials: dict[str, bpy.types.Material]) -> None:
    silhouette = materials["silhouette"]
    # One restrained gantry, a low warehouse volume, two tanks and a single pipe run.
    for x in (-6.5, 4.8):
        rounded_box(f"Gantry_Post_{x:+.1f}", (0.28, 0.34, 4.8), (x, 8.8, 2.4), 0.03, silhouette, destination)
    rounded_box("Gantry_Beam", (11.6, 0.34, 0.32), (-0.85, 8.8, 4.65), 0.04, silhouette, destination)
    rounded_box("Distant_Warehouse", (8.5, 3.8, 2.6), (4.8, 12.0, 1.25), 0.08, silhouette, destination)
    for index, x in enumerate((-6.8, -4.8), 1):
        cylinder(
            f"Distant_Tank_{index}",
            radius=0.82,
            depth=2.9,
            location=(x, 12.4, 1.45),
            rotation=(0.0, 0.0, 0.0),
            material=silhouette,
            destination=destination,
            vertices=48,
        )
    cylinder(
        "Distant_PipeRun",
        radius=0.12,
        depth=8.2,
        location=(-2.4, 10.0, 2.4),
        rotation=(0.0, math.radians(90), 0.0),
        material=silhouette,
        destination=destination,
        vertices=32,
    )


def spiral_points(turns: float = 2.5, count: int = 360) -> tuple[tuple[float, float, float], ...]:
    points: list[tuple[float, float, float]] = []
    outer_radius = 8.8
    inner_radius = 2.10
    for index in range(count):
        t = index / (count - 1)
        radius = outer_radius + (inner_radius - outer_radius) * t
        angle = turns * TAU * t
        x = radius * math.cos(angle)
        y = radius * math.sin(angle)
        ground_z = terrain_height(x, y)
        lift_t = max(0.0, min(1.0, (t - 0.88) / 0.12))
        lift_t = lift_t * lift_t * (3.0 - 2.0 * lift_t)
        z = ground_z + 0.068 + lift_t * 0.52
        points.append((x, y, z))
    return tuple(points)


def create_spiral(
    sheath_collection: bpy.types.Collection,
    conduction_collection: bpy.types.Collection,
    detail_collection: bpy.types.Collection,
    control: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> tuple[bpy.types.Object, ...]:
    points = spiral_points()
    ridge_points = tuple((x, y, z + 0.049) for x, y, z in points)
    core_points = tuple((x, y, z + 0.058) for x, y, z in points)
    front_points = tuple((x, y, z + 0.063) for x, y, z in points)
    sheath = curve_object("Cable_Sheath", points, 0.052, materials["cable"], sheath_collection, bevel_resolution=6)
    ridge = curve_object("Cable_GrazingRidge", ridge_points, 0.004, materials["cable_ridge"], sheath_collection, bevel_resolution=3)
    core = curve_object("Cable_ConductionCore", core_points, 0.007, materials["current"], conduction_collection, bevel_resolution=5)
    front = curve_object("Cable_ConductionFront", front_points, 0.012, materials["current_front"], conduction_collection, bevel_resolution=5)
    for curve in (core, front):
        curve.data.bevel_factor_start = 0.0
        curve.data.bevel_factor_end = 0.0
        curve.data.bevel_factor_mapping_start = "SPLINE"
        curve.data.bevel_factor_mapping_end = "SPLINE"
    add_driver(core.data, "bevel_factor_end", control, "conduction", "value")
    add_driver(front.data, "bevel_factor_start", control, "conduction", "max(0.0, value - 0.032)")
    add_driver(front.data, "bevel_factor_end", control, "conduction", "value")

    outer = points[0]
    terminus = rounded_box(
        "Cable_OuterTerminus",
        (0.32, 0.22, 0.15),
        (outer[0] + 0.13, outer[1], outer[2]),
        0.045,
        materials["precision"],
        detail_collection,
    )
    terminus.rotation_euler.z = math.radians(2)
    for index in range(14):
        t = (index + 0.5) / 14
        point = points[round(t * (len(points) - 1))]
        light_data = bpy.data.lights.new(name=f"ConductionGroundResponse_{index + 1:02d}", type="POINT")
        light_data.color = (1.0, 0.16, 0.42)
        light_data.energy = 0.0
        light_data.shadow_soft_size = 0.32
        light = bpy.data.objects.new(light_data.name, light_data)
        light.location = (point[0], point[1], point[2] + 0.15)
        conduction_collection.objects.link(light)
        add_driver(
            light_data,
            "energy",
            control,
            "conduction",
            f"max(0.0, min(1.0, (value - {t:.6f}) * 45.0)) * 3.5",
        )
    return sheath, ridge, core, front


def create_field_unit(
    collections: dict[str, bpy.types.Collection],
    control: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> None:
    shell = collections["SHELL"]
    aperture = collections["APERTURE"]
    glass = collections["GLASS"]
    connector = collections["CONNECTOR"]
    wake = collections["MECHANICAL_WAKE"]
    details = collections["DETAILS"]

    rounded_box("FieldUnit_Base", (4.35, 2.42, 0.34), (0.0, 0.0, 0.30), 0.18, materials["base"], shell)
    rounded_box("FieldUnit_MainShell", (3.58, 2.02, 0.82), (0.0, 0.02, 0.80), 0.26, materials["coated_metal"], shell)
    rounded_box("FieldUnit_LeftShoulder", (1.02, 1.90, 0.72), (-1.46, 0.05, 0.87), 0.24, materials["panel_dark"], shell, rotation=(0.0, math.radians(-4), 0.0))
    rounded_box("FieldUnit_RightShoulder", (1.06, 1.90, 0.72), (1.44, 0.05, 0.87), 0.24, materials["panel_dark"], shell, rotation=(0.0, math.radians(4), 0.0))
    cylinder(
        "FieldUnit_CentralArchitecture",
        radius=1.02,
        depth=1.88,
        location=(0.0, -0.02, 1.12),
        rotation=(math.radians(90), 0.0, 0.0),
        material=materials["coated_metal"],
        destination=shell,
        vertices=96,
        bevel=0.045,
    )
    rounded_box("FieldUnit_TopSpine", (1.34, 1.80, 0.20), (0.0, 0.06, 1.94), 0.08, materials["precision"], shell)

    # Protective corners and grounded rubber feet give the instrument credible mass.
    for index, (x, y) in enumerate(((-1.94, -0.96), (1.94, -0.96), (-1.94, 0.96), (1.94, 0.96)), 1):
        rounded_box(
            f"FieldUnit_ProtectiveCorner_{index:02d}",
            (0.46, 0.46, 0.48),
            (x, y, 0.49),
            0.14,
            materials["rubber"],
            details,
        )
        cylinder(
            f"FieldUnit_RubberFoot_{index:02d}",
            0.14,
            0.14,
            (x * 0.86, y * 0.80, 0.10),
            (0.0, 0.0, 0.0),
            materials["rubber"],
            details,
            vertices=32,
            bevel=0.025,
        )

    # Front aperture: circular architecture with an intentional lower-right interruption.
    aperture_center = (0.0, -1.055, 1.18)
    aperture_points = []
    start_angle = math.radians(-38)
    sweep = math.radians(310)
    for index in range(180):
        angle = start_angle + sweep * index / 179
        aperture_points.append(
            (
                aperture_center[0] + 0.91 * math.cos(angle),
                aperture_center[1],
                aperture_center[2] + 0.91 * math.sin(angle),
            )
        )
    curve_object("FieldUnit_InterruptedAperture", aperture_points, 0.115, materials["panel_dark"], aperture, bevel_resolution=6)
    rounded_box(
        "FieldUnit_ApertureInterruption",
        (0.46, 0.18, 0.22),
        (0.76, -1.04, 0.56),
        0.08,
        materials["precision"],
        aperture,
        rotation=(0.0, math.radians(-31), 0.0),
    )
    cylinder(
        "FieldUnit_ApertureGlass",
        radius=0.735,
        depth=0.055,
        location=aperture_center,
        rotation=(math.radians(90), 0.0, 0.0),
        material=materials["glass"],
        destination=glass,
        vertices=128,
        bevel=0.012,
    )
    torus(
        "FieldUnit_OpticalWellRing",
        major_radius=0.76,
        minor_radius=0.050,
        location=(0.0, -0.985, 1.18),
        rotation=(math.radians(90), 0.0, 0.0),
        material=materials["optical_well"],
        destination=aperture,
    )

    wake_empty = bpy.data.objects.new("FieldUnit_MechanicalWake", None)
    wake_empty.location = aperture_center
    wake_empty.empty_display_type = "CIRCLE"
    wake_empty.empty_display_size = 0.76
    wake.objects.link(wake_empty)
    add_driver(
        wake_empty,
        "rotation_euler",
        control,
        "mechanical_wake",
        "radians(7.0) * value",
        index=1,
    )
    ring = torus(
        "FieldUnit_MechanicalRing",
        major_radius=0.59,
        minor_radius=0.035,
        location=(0.0, -1.09, 1.18),
        rotation=(math.radians(90), 0.0, 0.0),
        material=materials["precision"],
        destination=wake,
    )
    ring.parent = wake_empty
    ring.matrix_parent_inverse = wake_empty.matrix_world.inverted()
    blade = rounded_box(
        "FieldUnit_OffAxisOpticalElement",
        (0.105, 0.035, 0.34),
        (0.52, -1.105, 0.76),
        0.035,
        materials["precision_dark"],
        wake,
        rotation=(0.0, math.radians(-42), 0.0),
    )
    blade.parent = wake_empty
    blade.matrix_parent_inverse = wake_empty.matrix_world.inverted()

    # Real left-side cable connector and a single internal transfer route.
    rounded_box(
        "FieldUnit_ConnectorGuard",
        (0.52, 0.62, 0.62),
        (-2.03, 0.0, 0.69),
        0.16,
        materials["panel_dark"],
        connector,
    )
    cylinder(
        "FieldUnit_ConnectorHousing",
        radius=0.22,
        depth=0.36,
        location=(-2.18, 0.0, 0.68),
        rotation=(0.0, math.radians(90), 0.0),
        material=materials["precision"],
        destination=connector,
        vertices=48,
        bevel=0.025,
    )
    cylinder(
        "FieldUnit_ConnectorCore",
        radius=0.105,
        depth=0.37,
        location=(-2.20, 0.0, 0.68),
        rotation=(0.0, math.radians(90), 0.0),
        material=materials["connector_response"],
        destination=connector,
        vertices=48,
    )
    internal_route = (
        (-1.98, 0.0, 0.68),
        (-1.62, 0.0, 0.70),
        (-1.30, -0.15, 0.80),
        (-1.02, -0.40, 0.96),
        (-0.80, -0.72, 1.10),
    )
    curve_object("FieldUnit_InternalTransfer", internal_route, 0.018, materials["internal_power"], connector, bevel_resolution=4)

    # Screen geometry remains sparse: three causal statuses and the five-stage route.
    interface_ring_points = []
    for index in range(160):
        angle = math.radians(-35) + math.radians(305) * index / 159
        interface_ring_points.append((0.56 * math.cos(angle), -1.092, 1.18 + 0.56 * math.sin(angle)))
    curve_object("Interface_InterruptedRing", interface_ring_points, 0.018, materials["screen_emission"], glass, bevel_resolution=4)
    curve_object(
        "Interface_OffAxisRoute",
        ((0.35, -1.092, 0.84), (0.54, -1.092, 0.66), (0.68, -1.092, 0.58)),
        0.016,
        materials["screen_emission"],
        glass,
        bevel_resolution=4,
    )
    text_object("UI_ChallengeDetected", "CHALLENGE DETECTED", (-0.37, -1.092, 1.43), 0.075, materials["screen_emission"], glass)
    text_object("UI_ContextReceived", "CONTEXT RECEIVED", (-0.37, -1.092, 1.29), 0.060, materials["screen_emission_muted"], glass)
    text_object("UI_TestRouteAvailable", "TEST ROUTE AVAILABLE", (-0.37, -1.092, 1.15), 0.060, materials["screen_emission"], glass)
    text_object("UI_FiveStageRoute", "FRAME   SOURCE   ASSESS   TEST   DECIDE", (-0.44, -1.092, 0.94), 0.040, materials["screen_emission_muted"], glass)

    # Purposeful service details: sparse fasteners, vents, rear panel and recessed handles.
    rounded_box("FieldUnit_RearServicePanel", (2.46, 0.065, 0.72), (0.0, 1.045, 0.91), 0.08, materials["panel_dark"], details)
    for index, x in enumerate((-0.90, -0.60, -0.30, 0.0, 0.30, 0.60, 0.90), 1):
        rounded_box(
            f"FieldUnit_RearVent_{index:02d}",
            (0.13, 0.035, 0.46),
            (x, 1.085, 0.92),
            0.035,
            materials["optical_well"],
            details,
        )
    for side, x in (("Left", -1.76), ("Right", 1.76)):
        rounded_box(f"FieldUnit_{side}HandleRecess", (0.12, 0.74, 0.30), (x, 0.18, 0.89), 0.05, materials["optical_well"], details)
        rounded_box(f"FieldUnit_{side}HandleBar", (0.16, 0.46, 0.10), (x * 1.015, 0.18, 0.90), 0.04, materials["precision"], details)
    for index, (x, z) in enumerate(((-1.45, 0.46), (1.45, 0.46), (-1.45, 1.16), (1.45, 1.16)), 1):
        cylinder(
            f"FieldUnit_Fastener_{index:02d}",
            0.045,
            0.025,
            (x, -1.035, z),
            (math.radians(90), 0.0, 0.0),
            materials["precision"],
            details,
            vertices=24,
        )
    text_object("FieldUnit_MicroMark", "QH // FU-01", (0.70, 1.085, 0.42), 0.055, materials["engraving"], details)

    # Portal plane continues the physical interface structure rather than using a generic mask.
    # It is deliberately an operating surface, not a simulated HUD: one navigational
    # safe zone, one spatial heading and two plain audience entries.
    rounded_box(
        "Portal_DOMMatchSurface",
        (1.86, 0.045, 1.42),
        (0.0, 0.24, 1.18),
        0.0,
        materials["portal_surface"],
        glass,
    )
    # Top navigation-safe zone and consistent structural crop guides.
    rounded_box(
        "Portal_TopRule",
        (1.48, 0.018, 0.008),
        (0.0, 0.205, 1.49),
        0.0,
        materials["portal_line"],
        glass,
    )
    for index, x in enumerate((-0.70, 0.0, 0.70), 1):
        rounded_box(
            f"Portal_StructureLine_{index:02d}",
            (0.006, 0.018, 0.94),
            (x, 0.205, 1.00),
            0.0,
            materials["portal_line"],
            glass,
        )
    rounded_box(
        "Portal_EntryRule",
        (1.40, 0.018, 0.006),
        (0.0, 0.205, 0.93),
        0.0,
        materials["portal_line"],
        glass,
    )
    rounded_box(
        "Portal_QuantumAccent",
        (0.10, 0.019, 0.012),
        (-0.65, 0.195, 1.49),
        0.0,
        materials["portal_accent"],
        glass,
    )
    text_object("Portal_Brand", "QUANTUM HUB", (-0.69, 0.192, 1.58), 0.038, materials["portal_copy"], glass)
    text_object(
        "Portal_Navigation",
        "FOR INDUSTRY     FOR STARTUPS",
        (0.69, 0.192, 1.58),
        0.032,
        materials["portal_copy_muted"],
        glass,
        align="RIGHT",
    )
    text_object("Portal_Eyebrow", "OPERATING SURFACE", (-0.67, 0.192, 1.39), 0.032, materials["portal_copy_muted"], glass)
    text_object("Portal_DOMHeading", "WHERE DO YOU ENTER?", (-0.67, 0.192, 1.24), 0.102, materials["portal_copy"], glass)
    text_object(
        "Portal_Route",
        "FRAME   SOURCE   ASSESS   TEST   DECIDE",
        (-0.67, 0.192, 1.08),
        0.034,
        materials["portal_copy_muted"],
        glass,
    )
    text_object("Portal_Industry", "FOR INDUSTRY", (-0.64, 0.192, 0.83), 0.058, materials["portal_copy"], glass)
    text_object("Portal_Startups", "FOR STARTUPS", (0.07, 0.192, 0.83), 0.058, materials["portal_copy"], glass)

    # Once the camera has crossed the activated aperture, the physical housing
    # deterministically yields to the matched DOM surface. The threshold occurs
    # only after the interface has filled the frame, avoiding an interior view of
    # solid shell geometry while keeping reverse playback exact and immediate.
    for physical_object in tuple(collections["FIELD_UNIT"].all_objects):
        if not physical_object.name.startswith("Portal_"):
            add_driver(physical_object, "hide_render", control, "portal", "value >= 0.62")


def light_object(
    name: str,
    light_type: str,
    location: Sequence[float],
    color: Sequence[float],
    energy: float,
    destination: bpy.types.Collection,
    size: float = 1.0,
    target: Sequence[float] | None = None,
) -> bpy.types.Object:
    data = bpy.data.lights.new(name=name, type=light_type)
    data.color = color
    data.energy = energy
    if light_type == "AREA":
        data.shape = "DISK"
        data.size = size
    elif light_type in {"POINT", "SPOT"}:
        data.shadow_soft_size = size
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    destination.objects.link(obj)
    if target is not None:
        direction = Vector(target) - obj.location
        obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return obj


def create_lighting(
    lighting: bpy.types.Collection,
    atmosphere: bpy.types.Collection,
    studio: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> None:
    light_object("Light_MoonKey", "AREA", (-6.5, -4.0, 8.5), (0.66, 0.76, 0.82), 850.0, lighting, 5.5, (0.0, 0.0, 0.7))
    light_object("Light_Rim", "AREA", (6.5, 4.8, 5.2), (0.84, 0.89, 0.90), 1050.0, lighting, 4.0, (0.0, 0.0, 1.0))
    light_object("Light_FrontFill", "AREA", (-1.0, -7.5, 3.6), (0.56, 0.63, 0.65), 280.0, lighting, 5.0, (0.0, 0.0, 0.8))
    light_object("Light_DeviceEdge", "AREA", (4.2, -5.4, 3.0), (0.72, 0.78, 0.79), 360.0, lighting, 2.2, (0.3, 0.0, 0.9))
    for index, location in enumerate(((-6.5, 8.5, 3.9), (4.8, 8.5, 3.9), (-4.8, 12.0, 2.9)), 1):
        light_object(f"Light_DistantPractical_{index:02d}", "POINT", location, (0.78, 0.83, 0.82), 42.0, lighting, 0.18)

    rounded_box("Atmosphere_Volume", (34.0, 34.0, 15.0), (0.0, 2.0, 6.5), 0.0, materials["atmosphere"], atmosphere)

    studio_key = light_object("Studio_Key", "AREA", (-4.5, -5.5, 6.5), (0.82, 0.88, 0.90), 980.0, studio, 4.0, (0.0, 0.0, 0.9))
    studio_rim = light_object("Studio_Rim", "AREA", (5.5, 3.0, 5.0), (0.90, 0.91, 0.88), 1180.0, studio, 3.0, (0.0, 0.0, 0.9))
    studio_fill = light_object("Studio_Fill", "AREA", (0.0, -2.8, 2.5), (0.68, 0.72, 0.72), 260.0, studio, 3.0, (0.0, 0.0, 0.8))
    rounded_box("Studio_Floor", (18.0, 18.0, 0.10), (0.0, 0.0, -0.08), 0.03, materials["studio"], studio)
    # Place the neutral backdrop behind every studio camera so front, rear and
    # three-quarter design views remain unobstructed.
    rounded_box("Studio_Backdrop", (18.0, 0.10, 9.0), (0.0, 10.5, 4.4), 0.03, materials["studio"], studio)
    for obj in (studio_key, studio_rim, studio_fill):
        obj.hide_render = True
    for obj in studio.objects:
        obj.hide_render = True


def camera_object(
    name: str,
    location: Sequence[float],
    target: Sequence[float],
    lens: float,
    destination: bpy.types.Collection,
    sensor_width: float = 36.0,
) -> tuple[bpy.types.Object, bpy.types.Object]:
    data = bpy.data.cameras.new(name=name)
    data.lens = lens
    data.sensor_width = sensor_width
    camera = bpy.data.objects.new(name, data)
    camera.location = location
    destination.objects.link(camera)
    target_empty = bpy.data.objects.new(f"{name}_Target", None)
    target_empty.location = target
    target_empty.empty_display_type = "PLAIN_AXES"
    target_empty.empty_display_size = 0.25
    destination.objects.link(target_empty)
    constraint = camera.constraints.new(type="TRACK_TO")
    constraint.target = target_empty
    constraint.track_axis = "TRACK_NEGATIVE_Z"
    constraint.up_axis = "UP_Y"
    return camera, target_empty


def keyframe_camera(
    camera: bpy.types.Object,
    target: bpy.types.Object,
    keyframes: Sequence[tuple[int, Sequence[float], Sequence[float], float]],
) -> None:
    for frame, location, target_location, lens in keyframes:
        camera.location = location
        camera.data.lens = lens
        target.location = target_location
        camera.keyframe_insert(data_path="location", frame=frame)
        camera.data.keyframe_insert(data_path="lens", frame=frame)
        target.keyframe_insert(data_path="location", frame=frame)
    for animated in (camera, camera.data, target):
        for fcurve in action_fcurves(animated):
            for keyframe in fcurve.keyframe_points:
                keyframe.interpolation = "BEZIER"
                keyframe.easing = "EASE_IN_OUT"


def create_cameras(destination: bpy.types.Collection) -> None:
    desktop, desktop_target = camera_object("Camera_Desktop", (9.3, -12.0, 3.65), (0.0, 0.0, 0.90), 50.0, destination)
    desktop.data.shift_x = -0.13
    keyframe_camera(
        desktop,
        desktop_target,
        (
            (cfg.FRAME_START, (9.3, -12.0, 3.65), (0.0, 0.0, 0.82), 50.0),
            (cfg.TIMELINE["conduction_established"], (8.8, -11.8, 3.58), (0.0, 0.0, 0.88), 51.0),
            (cfg.TIMELINE["camera_major_end"], (3.8, -10.9, 3.15), (0.0, 0.0, 1.02), 55.0),
            (cfg.TIMELINE["camera_align_end"], (0.75, -9.1, 2.65), (0.0, 0.0, 1.09), 58.0),
            (cfg.TIMELINE["connector_arrival"], (0.28, -8.05, 2.35), (0.0, 0.0, 1.12), 60.0),
            (cfg.TIMELINE["portal_start"], (0.08, -7.0, 2.10), (0.0, 0.0, 1.16), 58.0),
            (cfg.TIMELINE["screen_end"], (0.04, -5.6, 1.78), (0.0, 0.0, 1.18), 56.0),
            (cfg.TIMELINE["portal_end"], (0.0, -0.98, 1.18), (0.0, 0.32, 1.18), 26.0),
            (cfg.FRAME_END, (0.0, -0.55, 1.18), (0.0, 0.65, 1.18), 17.0),
        ),
    )
    desktop.data.shift_x = -0.13
    desktop.data.keyframe_insert(data_path="shift_x", frame=cfg.FRAME_START)
    desktop.data.keyframe_insert(data_path="shift_x", frame=cfg.TIMELINE["portal_start"])
    desktop.data.shift_x = 0.0
    desktop.data.keyframe_insert(data_path="shift_x", frame=cfg.TIMELINE["portal_end"])
    desktop.data.keyframe_insert(data_path="shift_x", frame=cfg.FRAME_END)
    for fcurve in action_fcurves(desktop.data):
        for keyframe in fcurve.keyframe_points:
            keyframe.interpolation = "BEZIER"
            keyframe.easing = "EASE_IN_OUT"

    camera_object(
        "Camera_Desktop_EarlyConduction",
        (12.5, -17.0, 4.8),
        (1.0, 0.0, 0.80),
        44.0,
        destination,
    )

    mobile, mobile_target = camera_object("Camera_Mobile", (5.8, -11.3, 3.3), (0.0, 0.0, 0.82), 57.0, destination)
    mobile.data.shift_y = 0.13
    keyframe_camera(
        mobile,
        mobile_target,
        (
            (cfg.FRAME_START, (5.8, -11.3, 3.3), (0.0, 0.0, 0.78), 57.0),
            (cfg.frame_at(0.55), (3.7, -9.5, 2.75), (0.0, 0.0, 0.98), 59.0),
            (cfg.frame_at(0.80), (1.15, -7.2, 2.25), (0.0, 0.0, 1.08), 61.0),
            (cfg.frame_at(0.91), (0.2, -4.7, 1.65), (0.0, 0.0, 1.15), 61.0),
            (cfg.frame_at(0.97), (0.0, -1.00, 1.28), (0.0, 0.42, 1.18), 24.0),
            (cfg.FRAME_END, (0.0, -0.62, 1.28), (0.0, 0.65, 1.18), 18.0),
        ),
    )

    # Portrait evidence uses intentionally authored compositions, not a crop of
    # the desktop orbit. The conduction view retains enough terrain to show the
    # energized spiral; the portal-entry view keeps the complete physical status
    # hierarchy inside the Q-derived aperture.
    camera_object(
        "Camera_Mobile_Conduction",
        (6.4, -12.8, 4.20),
        (0.0, 0.0, 0.72),
        43.0,
        destination,
    )
    camera_object(
        "Camera_Mobile_PortalEntry",
        (0.18, -5.05, 1.76),
        (0.0, -0.20, 1.18),
        27.0,
        destination,
    )

    studio_specs = {
        "Camera_Studio_Front": ((0.0, -8.2, 2.15), (0.0, 0.0, 0.92), 70.0),
        "Camera_Studio_Rear": ((0.0, 8.2, 2.15), (0.0, 0.0, 0.92), 70.0),
        "Camera_Studio_Left": ((-8.0, 0.0, 2.05), (0.0, 0.0, 0.85), 72.0),
        "Camera_Studio_Right": ((8.0, 0.0, 2.05), (0.0, 0.0, 0.85), 72.0),
        "Camera_Studio_ThreeQuarterFront": ((6.3, -7.6, 3.6), (0.0, 0.0, 0.92), 68.0),
        "Camera_Studio_ThreeQuarterRear": ((-6.5, 7.3, 3.5), (0.0, 0.0, 0.92), 68.0),
        "Camera_Material_Shell": ((3.8, -4.0, 2.8), (1.2, -0.35, 0.95), 92.0),
        "Camera_Material_Glass": ((0.75, -3.5, 1.65), (0.0, -0.9, 1.18), 104.0),
        # At 55% scene progress the conduction front is near (-3.1, -3.1).
        # This low grazing view crosses the front so dormant sheath, energized
        # recessed core and contact response remain visible together.
        "Camera_Material_Cable": ((0.0, -5.00, 0.28), (0.0, -4.20, 0.085), 85.0),
        "Camera_Material_Connector": ((-4.0, -2.3, 1.4), (-2.05, 0.0, 0.68), 105.0),
        "Camera_Material_Base": ((3.2, -3.7, 1.0), (1.75, -0.75, 0.28), 105.0),
        "Camera_Material_Detail": ((-3.5, -3.8, 2.0), (-1.45, -0.85, 0.75), 105.0),
    }
    for name, (location, target, lens) in studio_specs.items():
        camera_object(name, location, target, lens, destination)


def create_materials(control: bpy.types.Object) -> dict[str, bpy.types.Material]:
    materials = {
        "terrain": principled_material("MAT_Terrain_Compacted", (0.028, 0.036, 0.037), 0.78, 0.04, 46.0),
        "slab_a": principled_material("MAT_EngineeredSlab_A", (0.033, 0.041, 0.042), 0.72, 0.10, 62.0),
        "slab_b": principled_material("MAT_EngineeredSlab_B", (0.023, 0.030, 0.031), 0.80, 0.06, 74.0),
        "plate": principled_material("MAT_EngineeredPlate", (0.045, 0.052, 0.053), 0.62, 0.42, 85.0),
        "drain": principled_material("MAT_Drainage", (0.010, 0.014, 0.015), 0.70, 0.30, 70.0),
        "seam": principled_material("MAT_TerrainSeam", (0.005, 0.006, 0.007), 0.92, 0.0),
        "silhouette": principled_material("MAT_DistantIndustry", (0.018, 0.024, 0.025), 0.72, 0.30, 52.0),
        "base": principled_material("MAT_FieldUnit_Base", (0.020, 0.026, 0.027), 0.58, 0.48, 110.0),
        "coated_metal": principled_material("MAT_FieldUnit_CoatedMetal", (0.032, 0.040, 0.041), 0.48, 0.62, 145.0),
        "panel_dark": principled_material("MAT_FieldUnit_PanelDark", (0.014, 0.019, 0.020), 0.64, 0.42, 118.0),
        "precision": principled_material("MAT_PrecisionMetal", (0.15, 0.18, 0.18), 0.31, 0.86, 180.0),
        "precision_dark": principled_material("MAT_PrecisionDark", (0.025, 0.030, 0.031), 0.28, 0.78, 165.0),
        "rubber": principled_material("MAT_BlackRubber", (0.009, 0.011, 0.012), 0.86, 0.0, 95.0),
        "optical_well": principled_material("MAT_OpticalWell", (0.002, 0.003, 0.004), 0.24, 0.28),
        "glass": smoked_glass_material("MAT_SmokedOpticalGlass"),
        "cable": principled_material("MAT_Cable_GraphiteSheath", (0.012, 0.016, 0.017), 0.74, 0.06, 130.0),
        "cable_ridge": principled_material("MAT_Cable_GrazingRidge", (0.075, 0.085, 0.086), 0.52, 0.10),
        "current": emission_material("MAT_ConductionCore", (1.0, 0.055, 0.31), 2.8),
        "current_front": emission_material("MAT_ConductionFront", (1.0, 0.18, 0.46), 8.5),
        "connector_response": emission_material(
            "MAT_ConnectorResponse",
            (1.0, 0.10, 0.36),
            1.0,
            control,
            "connector_response",
            "value * 7.0",
        ),
        "internal_power": emission_material(
            "MAT_InternalPower",
            (1.0, 0.08, 0.34),
            1.0,
            control,
            "mechanical_wake",
            "value * 4.0",
        ),
        "screen_emission": emission_material(
            "MAT_ScreenInterface",
            (1.0, 0.12, 0.40),
            1.0,
            control,
            "physical_ui",
            "value * 3.5",
        ),
        "screen_emission_muted": emission_material(
            "MAT_ScreenInterfaceMuted",
            (0.46, 0.58, 0.59),
            1.0,
            control,
            "physical_ui",
            "value * 1.8",
        ),
        "portal_surface": emission_material(
            "MAT_PortalSurface",
            (0.028, 0.039, 0.040),
            1.0,
            control,
            "portal",
            "max(0.0, min(1.0, (value - 0.18) * 1.22)) * 0.72",
        ),
        "portal_line": emission_material(
            "MAT_PortalStructure",
            (0.16, 0.21, 0.21),
            1.0,
            control,
            "portal",
            "max(0.0, min(1.0, (value - 0.35) * 1.54)) * 1.1",
        ),
        "portal_copy": emission_material(
            "MAT_PortalCopy",
            (0.72, 0.80, 0.78),
            1.0,
            control,
            "portal",
            "max(0.0, min(1.0, (value - 0.35) * 1.54)) * 1.65",
        ),
        "portal_copy_muted": emission_material(
            "MAT_PortalCopyMuted",
            (0.30, 0.39, 0.38),
            1.0,
            control,
            "portal",
            "max(0.0, min(1.0, (value - 0.35) * 1.54)) * 1.05",
        ),
        "portal_accent": emission_material(
            "MAT_PortalAccent",
            (1.0, 0.08, 0.34),
            1.0,
            control,
            "portal",
            "max(0.0, min(1.0, (value - 0.55) * 2.22)) * 1.4",
        ),
        "engraving": principled_material("MAT_Engraving", (0.12, 0.14, 0.14), 0.48, 0.50),
        "studio": principled_material("MAT_StudioNeutral", (0.055, 0.064, 0.065), 0.68, 0.03, 42.0),
        "atmosphere": volume_material("MAT_Atmosphere"),
    }
    return materials


def configure_scene(scene: bpy.types.Scene, engine: str) -> None:
    scene.frame_start = cfg.FRAME_START
    scene.frame_end = cfg.FRAME_END
    scene.render.fps = cfg.FPS
    scene.render.resolution_x = cfg.DESKTOP_RESOLUTION[0]
    scene.render.resolution_y = cfg.DESKTOP_RESOLUTION[1]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.film_transparent = False
    scene.render.engine = "CYCLES" if engine == "cycles" else "BLENDER_EEVEE"
    if scene.render.engine == "CYCLES":
        scene.cycles.samples = 96
        scene.cycles.use_denoising = True
        scene.cycles.preview_samples = 24
    else:
        scene.eevee.taa_render_samples = 48
        scene.eevee.volumetric_samples = 32
        scene.eevee.volumetric_shadow_samples = 8
        scene.render.image_settings.color_depth = "8"
    scene.render.use_file_extension = True
    scene.render.use_overwrite = True
    scene.render.use_placeholder = False
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except (TypeError, ValueError):
        pass
    scene.view_settings.exposure = -0.15
    scene.view_settings.gamma = 1.0
    world = bpy.data.worlds.new("World_ProvingField")
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.004, 0.006, 0.007, 1.0)
    background.inputs["Strength"].default_value = 0.10
    scene.world = world
    scene["original_artwork"] = True
    scene["reference_binary_used"] = False
    scene["spiral_turns_desktop"] = 2.5
    scene["spiral_turns_mobile"] = 2.25
    scene["timeline_contract"] = "dormancy-conduction-awakening-alignment-entry"


def build() -> Path:
    args = cli_args()
    clear_scene()
    scene = bpy.context.scene
    scene.name = "SCENE_QuantumProvingField"
    configure_scene(scene, args.engine)

    root = collection("SCENE_ROOT", scene)
    environment = collection("ENVIRONMENT", root)
    terrain = collection("TERRAIN", environment)
    distant = collection("DISTANT_INDUSTRY", environment)
    field_unit = collection("FIELD_UNIT", root)
    shell = collection("SHELL", field_unit)
    aperture = collection("APERTURE", field_unit)
    glass = collection("GLASS", field_unit)
    connector = collection("CONNECTOR", field_unit)
    wake = collection("MECHANICAL_WAKE", field_unit)
    details = collection("DETAILS", field_unit)
    spiral = collection("SPIRAL", root)
    sheath = collection("SHEATH", spiral)
    conduction = collection("CONDUCTION", spiral)
    lighting = collection("LIGHTING", root)
    atmosphere = collection("ATMOSPHERE", root)
    cameras = collection("CAMERA", root)
    studio = collection("STUDIO", root)

    control = create_control(root)
    materials = create_materials(control)
    create_terrain(terrain, materials)
    create_distant_industry(distant, materials)
    create_spiral(sheath, conduction, details, control, materials)
    create_field_unit(
        {
            "FIELD_UNIT": field_unit,
            "SHELL": shell,
            "APERTURE": aperture,
            "GLASS": glass,
            "CONNECTOR": connector,
            "MECHANICAL_WAKE": wake,
            "DETAILS": details,
        },
        control,
        materials,
    )
    create_lighting(lighting, atmosphere, studio, materials)
    # Native-surface takeover is self-lit. Environmental lights and volume yield
    # at the same deterministic threshold as the physical housing so they cannot
    # cast glare or doubled text shadows onto the DOM-match plane.
    for portal_environment_object in tuple(lighting.all_objects) + tuple(atmosphere.all_objects):
        add_driver(portal_environment_object, "hide_render", control, "portal", "value >= 0.62")
    create_cameras(cameras)
    scene.camera = bpy.data.objects["Camera_Desktop"]
    scene.frame_set(cfg.FRAME_START)

    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output), check_existing=False)
    print(f"QH_SCENE_SAVED={output}")
    print(f"QH_OBJECTS={len(bpy.data.objects)}")
    print(f"QH_MATERIALS={len(bpy.data.materials)}")
    return output


if __name__ == "__main__":
    build()
