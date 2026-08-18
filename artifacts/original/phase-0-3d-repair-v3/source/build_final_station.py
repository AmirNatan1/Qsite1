"""Build the selected Phase 0.3 Quantum Aperture Station scene.

The scene is procedural, editable, deterministic, and intentionally still-based.
It uses no external assets, linked libraries, add-ons, image textures, or fonts.
"""

from __future__ import annotations

import argparse
import hashlib
import json
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


UNIT_X = 1.65
UNIT_Z = 0.0
APERTURE_X = UNIT_X - 0.32
APERTURE_Z = 0.72
APERTURE_RX = 0.36
APERTURE_RZ = 0.225
FRONT_Y = -0.31


def cli_args() -> argparse.Namespace:
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=cfg.FINAL_BLEND)
    return parser.parse_args(raw)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.curves, bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)
    for existing in list(bpy.data.collections):
        bpy.data.collections.remove(existing)


def new_collection(name: str, parent: bpy.types.Collection | bpy.types.Scene) -> bpy.types.Collection:
    result = bpy.data.collections.new(name)
    (parent.collection if isinstance(parent, bpy.types.Scene) else parent).children.link(result)
    return result


def move(obj: bpy.types.Object, destination: bpy.types.Collection) -> bpy.types.Object:
    for existing in tuple(obj.users_collection):
        existing.objects.unlink(obj)
    destination.objects.link(obj)
    return obj


def assign(shader: bpy.types.Node, names: Sequence[str], value) -> None:
    for name in names:
        socket = shader.inputs.get(name)
        if socket is not None:
            socket.default_value = value
            return


def material(name: str, color: Sequence[float], roughness: float, metallic: float = 0.0, microtexture: float | None = None) -> bpy.types.Material:
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    nodes = result.node_tree.nodes
    links = result.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    assign(shader, ("Base Color",), (*color, 1.0))
    assign(shader, ("Roughness",), roughness)
    assign(shader, ("Metallic",), metallic)
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    if microtexture:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = microtexture
        noise.inputs["Detail"].default_value = 2.4
        noise.inputs["Roughness"].default_value = 0.65
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.075
        bump.inputs["Distance"].default_value = 0.018
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    return result


def emission_material(name: str, color: Sequence[float], strength: float, control: bpy.types.Object, prop: str, expression: str) -> bpy.types.Material:
    result = material(name, (0.003, 0.004, 0.004), 0.26, 0.20)
    shader = result.node_tree.nodes.get("Principled BSDF")
    emission = shader.inputs.get("Emission Color") or shader.inputs.get("Emission")
    emission.default_value = (*color, 1.0)
    emission_strength = shader.inputs.get("Emission Strength")
    emission_strength.default_value = 0.0
    add_driver(emission_strength, "default_value", control, prop, expression)
    result["maximum_authored_strength"] = strength
    return result


def driven_visibility(result: bpy.types.Material, control: bpy.types.Object, prop: str, expression: str) -> None:
    """Keep authored internal datums physically absent until their stage begins."""

    shader = result.node_tree.nodes.get("Principled BSDF")
    alpha = shader.inputs.get("Alpha")
    alpha.default_value = 0.0
    add_driver(alpha, "default_value", control, prop, expression)
    result.surface_render_method = "DITHERED"
    result.use_transparency_overlap = False


def smoked_glass(name: str) -> bpy.types.Material:
    result = material(name, (0.0012, 0.0018, 0.0019), 0.095, 0.20)
    shader = result.node_tree.nodes.get("Principled BSDF")
    # The glass remains optically black while dormant, but allows the authored
    # internal wake state to become legible once its zero-at-rest emissive
    # datums turn on behind the recess.
    assign(shader, ("Transmission Weight", "Transmission"), 0.58)
    assign(shader, ("Alpha",), 0.22)
    assign(shader, ("Coat Weight", "Clearcoat"), 0.12)
    assign(shader, ("Coat Roughness", "Clearcoat Roughness"), 0.10)
    assign(shader, ("IOR",), 1.46)
    result.surface_render_method = "DITHERED"
    result.use_transparency_overlap = False
    return result


def add_driver(target, data_path: str, control: bpy.types.Object, prop: str, expression: str, index: int | None = None) -> None:
    fcurve = target.driver_add(data_path) if index is None else target.driver_add(data_path, index)
    driver = fcurve.driver
    driver.type = "SCRIPTED"
    variable = driver.variables.new()
    variable.name = "value"
    variable.targets[0].id = control
    variable.targets[0].data_path = f'["{prop}"]'
    driver.expression = expression


def bevel(obj: bpy.types.Object, width: float, segments: int = 8) -> None:
    modifier = obj.modifiers.new("Precision edge radius", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"


def rounded_box(name: str, dims: Sequence[float], loc: Sequence[float], radius: float, mat: bpy.types.Material, destination: bpy.types.Collection, rotation=(0.0, 0.0, 0.0)) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel(obj, radius)
    obj.data.materials.append(mat)
    return move(obj, destination)


def cylinder(name: str, radius: float, depth: float, loc: Sequence[float], rotation: Sequence[float], mat: bpy.types.Material, destination: bpy.types.Collection, vertices: int = 160, edge: float = 0.0) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    if edge:
        bevel(obj, edge, 5)
    obj.data.materials.append(mat)
    return move(obj, destination)


def profile_prism(
    name: str,
    profile_xz: Sequence[Sequence[float]],
    depth: float,
    mat: bpy.types.Material,
    destination: bpy.types.Collection,
    edge: float = 0.035,
    y_offset: float = 0.0,
) -> bpy.types.Object:
    """Extrude an editable asymmetric X/Z machine profile through Y."""
    count = len(profile_xz)
    front_y = y_offset - depth / 2.0
    back_y = y_offset + depth / 2.0
    vertices = [(x, front_y, z) for x, z in profile_xz] + [(x, back_y, z) for x, z in profile_xz]
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    destination.objects.link(obj)
    obj.data.materials.append(mat)
    bevel(obj, edge, 8)
    obj["manufacturing_logic"] = "faceted structural extrusion; no rounded appliance cabinet"
    return obj


def ellipse_cutter(name: str, center: Sequence[float], rx: float, rz: float, depth: float, destination: bpy.types.Collection) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=192,
        radius=1.0,
        depth=depth,
        location=center,
        rotation=(math.radians(90.0), 0.0, 0.0),
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = (rx, rz, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    move(obj, destination)
    obj.display_type = "WIRE"
    obj.hide_render = True
    return obj


def selected_station_shell(destination: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> tuple[bpy.types.Object, bpy.types.Object]:
    """Build accepted A as an installed faceted blade plus load-bearing spine."""
    p = lambda x: UNIT_X + x
    blade_profile = (
        (p(-0.83), 0.015), (p(-0.80), 0.38), (p(-0.66), 1.08), (p(-0.42), 1.25),
        (p(0.08), 1.20), (p(0.50), 1.03), (p(0.68), 0.66), (p(0.57), 0.24),
        (p(0.34), 0.075), (p(-0.18), 0.015),
    )
    blade = profile_prism("Station_AsymmetricOpticalBlade", blade_profile, 0.50, mats["body"], destination, 0.045, -0.055)
    blade["selected_family"] = "A / Inclined Optical Blade"
    blade["outline_contract"] = "faceted, asymmetric, installed-machine silhouette"

    spine_profile = (
        (p(0.31), 0.015), (p(0.72), 0.015), (p(0.78), 0.74), (p(0.63), 1.02),
        (p(0.47), 0.92), (p(0.39), 0.47),
    )
    spine = profile_prism("Station_LoadBearingServiceSpine", spine_profile, 0.74, mats["secondary"], destination, 0.045, 0.11)
    spine["role"] = "subordinate structural carrier interlocking blade with below-grade foundation; never a control box"

    aperture = ellipse_cutter(
        "Station_OffsetHorizontalApertureCutter",
        (APERTURE_X, -0.05, APERTURE_Z),
        APERTURE_RX,
        APERTURE_RZ,
        1.30,
        destination,
    )
    aperture_cut = blade.modifiers.new("Deep offset horizontal optical recess", "BOOLEAN")
    aperture_cut.operation = "DIFFERENCE"
    aperture_cut.solver = "EXACT"
    aperture_cut.object = aperture

    # A solid stepped transfer rib crosses and interrupts the lower-right edge
    # of the recess. It is load-bearing material, not a long void or logo tail.
    rib_profile = (
        (UNIT_X - 0.08, 0.595), (UNIT_X + 0.34, 0.515),
        (UNIT_X + 0.33, 0.405), (UNIT_X - 0.12, 0.495),
    )
    rib = profile_prism("Station_LowerRightStructuralInterruptor", rib_profile, 0.22, mats["secondary"], destination, 0.012, -0.195)
    rib["role"] = "solid stepped service/load transfer interrupting aperture; not a carved Q tail"
    foundation = rounded_box(
        "Station_BelowGradeIntegratedFoundation",
        (1.84, 0.76, 0.28),
        (UNIT_X + 0.02, 0.06, -0.155),
        0.025,
        mats["base"],
        destination,
    )
    foundation["ground_relation"] = "entirely below grade; no feet, plinth, base rail, or external plug"
    return blade, spine


def hollow_cylinder_y(name: str, outer: float, inner: float, y0: float, y1: float, center_x: float, center_z: float, mat: bpy.types.Material, destination: bpy.types.Collection, segments: int = 160) -> bpy.types.Object:
    vertices = []
    for y in (y0, y1):
        for radius in (outer, inner):
            for index in range(segments):
                angle = math.tau * index / segments
                vertices.append((center_x + radius * math.cos(angle), y, center_z + radius * math.sin(angle)))
    # layer indexes: y0 outer 0, y0 inner 1, y1 outer 2, y1 inner 3
    def idx(layer: int, i: int) -> int:
        return layer * segments + (i % segments)
    faces = []
    for index in range(segments):
        nxt = index + 1
        faces.extend(
            [
                (idx(0, index), idx(0, nxt), idx(2, nxt), idx(2, index)),
                (idx(1, index), idx(3, index), idx(3, nxt), idx(1, nxt)),
                (idx(0, index), idx(1, index), idx(1, nxt), idx(0, nxt)),
                (idx(2, index), idx(2, nxt), idx(3, nxt), idx(3, index)),
            ]
        )
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    destination.objects.link(obj)
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    bevel(obj, 0.018, 3)
    return obj


def curve_object(name: str, points: Iterable[Sequence[float]], radius: float, mat: bpy.types.Material, destination: bpy.types.Collection) -> bpy.types.Object:
    data = bpy.data.curves.new(f"{name}_Curve", "CURVE")
    data.dimensions = "3D"
    data.resolution_u = 12
    data.bevel_depth = radius
    data.bevel_resolution = 5
    spline = data.splines.new("POLY")
    materialized = tuple(points)
    spline.points.add(len(materialized) - 1)
    for point, coordinate in zip(spline.points, materialized, strict=True):
        point.co = (*coordinate, 1.0)
    data.materials.append(mat)
    obj = bpy.data.objects.new(name, data)
    destination.objects.link(obj)
    return obj


def screen_text(name: str, body: str, loc: Sequence[float], scale: float, mat: bpy.types.Material, destination: bpy.types.Collection) -> bpy.types.Object:
    """Create editable built-in-font copy on the recessed physical screen.

    Blender's bundled Bfont is used; no font binary is installed, copied, or
    distributed. The text remains geometry in the maintainable source.
    """
    data = bpy.data.curves.new(f"{name}_Curve", "FONT")
    data.body = body
    data.align_x = "CENTER"
    data.align_y = "CENTER"
    data.size = 1.0
    data.extrude = 0.0
    data.bevel_depth = 0.0
    data.materials.append(mat)
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    obj.rotation_euler = (math.radians(90), 0.0, 0.0)
    obj.scale = (scale, scale, scale)
    destination.objects.link(obj)
    obj["font_source"] = "Blender bundled Bfont; no redistributed font binary"
    return obj


def create_control(destination: bpy.types.Collection) -> bpy.types.Object:
    control = bpy.data.objects.new("CTRL_V3_StillStates", None)
    destination.objects.link(control)
    for prop in ("conduction", "foundation", "internal", "iris", "screen", "portal"):
        control[prop] = 0.0
        control.id_properties_ui(prop).update(min=0.0, max=1.0, description=f"Phase 0.3 {prop} still-state control")
    control["state_contract"] = "still-only direct controls; no full animatic"
    control["mechanical_response_count"] = 1
    control["mechanical_response"] = "internal iris only"
    return control


def terrain_height(x: float, y: float) -> float:
    return 0.022 * math.sin(x * 0.41) + 0.017 * math.cos(y * 0.49) + 0.006 * math.sin((x - y) * 1.4)


def create_terrain(destination: bpy.types.Collection, mat: bpy.types.Material) -> None:
    size, divisions = 32.0, 64
    vertices = []
    faces = []
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
    mesh = bpy.data.meshes.new("LayeredProvingGround_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("LayeredProvingGround", mesh)
    destination.objects.link(obj)
    obj.data.materials.append(mat)


def create_engineered_slabs(destination: bpy.types.Collection, mat: bpy.types.Material) -> None:
    specs = [
        ((-5.8, -0.8, 0.015), (6.0, 5.8, 0.035), -4.0),
        ((4.9, 2.7, 0.012), (7.8, 4.1, 0.030), 5.0),
        ((0.4, -6.2, 0.018), (9.4, 3.3, 0.032), -2.5),
    ]
    for index, (loc, dims, angle) in enumerate(specs, 1):
        rounded_box(f"EngineeredSlab_{index:02d}", dims, loc, 0.025, mat, destination, rotation=(0.0, 0.0, math.radians(angle)))


def create_environment(destination: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    create_terrain(destination, mats["terrain"])
    create_engineered_slabs(destination, mats["slab"])
    # Dark layered infrastructure at subordinate scale; no giant blank stage wall.
    rounded_box("RearWall_Left", (5.4, 0.38, 3.2), (-4.4, 7.4, 1.48), 0.06, mats["background"], destination)
    rounded_box("RearWall_Middle", (3.1, 0.52, 2.4), (0.2, 8.5, 1.08), 0.06, mats["background2"], destination)
    rounded_box("RearWall_Right", (4.8, 0.46, 3.0), (4.9, 7.9, 1.38), 0.06, mats["background"], destination)
    for index, x in enumerate((-5.8, -2.0, 2.8, 5.9), 1):
        rounded_box(f"IndustrialColumn_{index}", (0.34, 0.38, 3.8 + 0.25 * (index % 2)), (x, 5.8 + index * 0.42, 1.85), 0.04, mats["background2"], destination)
    # No uninterrupted bright cross-bar: from the arrival camera that form
    # could read as an ornamental handle attached to the unit. Layering comes
    # from the wall breaks, columns, and process masses instead.
    for index, x in enumerate((-4.8, -3.9, 4.3, 5.3), 1):
        cylinder(f"DistantProcessTank_{index}", 0.68 if index % 2 else 0.52, 2.4 + 0.3 * index, (x, 6.7 + 0.35 * index, 1.2), (0.0, 0.0, 0.0), mats["background"], destination, vertices=96, edge=0.04)
    drain_z = terrain_height(-0.7, -3.5) + 0.010
    rounded_box("Foreground_DrainageDatum", (2.8, 0.075, 0.018), (-0.7, -3.5, drain_z), 0.010, mats["background"], destination, rotation=(0.0, 0.0, math.radians(-5.0)))
    rounded_box("Foreground_ServicePlate", (1.05, 0.58, 0.022), (3.45, -3.15, terrain_height(3.45, -3.15) + 0.010), 0.035, mats["slab"], destination, rotation=(0.0, 0.0, math.radians(7.0)))


def create_field_unit(destination: bpy.types.Collection, control: bpy.types.Object, mats: dict[str, bpy.types.Material]) -> None:
    selected_station_shell(destination, mats)

    seam_points_raw = (
        (UNIT_X - 0.82, -0.37), (UNIT_X + 0.74, -0.39),
        (UNIT_X + 0.79, 0.39), (UNIT_X - 0.82, 0.37), (UNIT_X - 0.82, -0.37),
    )
    seam_points = [(x, y, terrain_height(x, y) + 0.014) for x, y in seam_points_raw]
    seam = curve_object("InstalledFoundation_PerimeterSeam", seam_points, 0.008, mats["groove"], destination)
    seam["role"] = "flush installed foundation seam; never a plinth or rail"
    for index, (x, y) in enumerate(((UNIT_X - 0.66, -0.31), (UNIT_X + 0.66, 0.31)), 1):
        anchor = rounded_box(
            f"GroundAnchor_RecessedSlot_{index}",
            (0.095, 0.030, 0.010),
            (x, y, terrain_height(x, y) + 0.012),
            0.006,
            mats["base"],
            destination,
        )
        anchor["role"] = "recessed installed-scale ground anchor slot"
    # Deep optically black glass is an elliptical plane behind the carved
    # opening. There is no applied rim, lens barrel, ring, logo, or front plug.
    glass = cylinder(
        "Aperture_OpticallyBlackDormantGlass",
        1.0,
        0.018,
        (APERTURE_X, -0.112, APERTURE_Z),
        (math.radians(90), 0.0, 0.0),
        mats["glass"],
        destination,
        vertices=192,
        edge=0.006,
    )
    glass.scale = (APERTURE_RX * 0.93, APERTURE_RZ * 0.93, 1.0)
    bpy.context.view_layer.objects.active = glass
    glass.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    glass.select_set(False)
    glass["dormant"] = "optically black, materially inactive, zero emission"

    # Current first arrives through a protected below-grade raceway. The short
    # response stays flush with the ground seam and never protrudes as a rod,
    # plug, connector, or additional mechanism.
    foundation_points = [
        (UNIT_X + 0.67, -0.335, 0.008),
        (UNIT_X + 0.58, -0.335, 0.008),
        (UNIT_X + 0.49, -0.315, 0.008),
    ]
    foundation = curve_object("Foundation_FlushCurrentArrivalSeam", foundation_points, 0.006, mats["foundation_live"], destination)
    foundation["behavior"] = "small localized flush seam response above a protected below-grade raceway; never a protruding plug"

    internal_points = [
        (UNIT_X + 0.39, -0.265, 0.18),
        (UNIT_X + 0.19, -0.235, 0.36),
        (APERTURE_X + 0.20, -0.195, APERTURE_Z - 0.12),
    ]
    internal = curve_object("InternalTransfer_RecessedServicePath", internal_points, 0.008, mats["internal_live"], destination)
    internal["behavior"] = "one restrained non-mechanical foundation-to-aperture transfer path"

    # Exactly one activation mechanism: five linked internal iris blades. Every
    # blade carries the same mechanism id and is driven only by CTRL iris.
    iris_angles = (35.0, 105.0, 175.0, 245.0, 285.0)
    for index, angle_degrees in enumerate(iris_angles):
        angle = math.radians(angle_degrees)
        ca, sa = math.cos(angle), math.sin(angle)
        pivot_x = APERTURE_RX * 0.76 * ca
        pivot_z = APERTURE_RZ * 0.76 * sa
        tangent_x = -sa
        tangent_z = ca
        inward_x = -ca
        inward_z = -sa
        local = (
            (tangent_x * 0.058, tangent_z * 0.038),
            (inward_x * 0.082 + tangent_x * 0.052, inward_z * 0.052 + tangent_z * 0.034),
            (inward_x * 0.090 - tangent_x * 0.046, inward_z * 0.057 - tangent_z * 0.030),
            (-tangent_x * 0.046, -tangent_z * 0.030),
        )
        blade_profile = tuple((x, z) for x, z in local)
        blade = profile_prism(
            f"MechanicalResponse_InternalIrisBlade_{index + 1:02d}",
            blade_profile,
            0.016,
            mats["iris"],
            destination,
            0.006,
            -0.072,
        )
        base_x = APERTURE_X + pivot_x
        base_z = APERTURE_Z + pivot_z
        blade.location = (base_x, 0.0, base_z)
        blade.rotation_mode = "XYZ"
        add_driver(blade, "location", control, "iris", f"{base_x:.7f}+value*{(APERTURE_RX * 0.16 * ca):.7f}", index=0)
        add_driver(blade, "location", control, "iris", f"{base_z:.7f}+value*{(APERTURE_RZ * 0.16 * sa):.7f}", index=2)
        add_driver(blade, "rotation_euler", control, "iris", "radians(value*14.0)", index=1)
        blade["mechanism_id"] = "internal-iris"
        blade["mechanical_response"] = "sole permitted mechanism; linked iris blade"

    # Sparse physical screen carrier; exact portal typography remains generated
    # directly from the accepted shared portal-layout.json.
    screen = cylinder("PhysicalScreen_Carrier", 1.0, 0.014, (APERTURE_X, -0.048, APERTURE_Z), (math.radians(90), 0.0, 0.0), mats["cavity"], destination, vertices=192)
    screen.scale = (APERTURE_RX * 0.78, APERTURE_RZ * 0.78, 1.0)
    bpy.context.view_layer.objects.active = screen
    screen.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    screen.select_set(False)
    screen["portal_layout_source"] = "portal-layout.json"
    for index, offset in enumerate((-0.15, -0.075, 0.0, 0.075, 0.15), 1):
        rounded_box(f"PhysicalScreen_RouteDatum_{index}", (0.050, 0.010, 0.018), (APERTURE_X + offset, -0.058, APERTURE_Z - 0.120), 0.004, mats["screen_live"], destination)
    screen_text(
        "PhysicalScreen_ChallengeDetected",
        "CHALLENGE DETECTED",
        (APERTURE_X, -0.058, APERTURE_Z + 0.088),
        0.018,
        mats["screen_challenge"],
        destination,
    )
    screen_text(
        "PhysicalScreen_OperatingRoute",
        "FRAME  SOURCE  ASSESS  TEST  DECIDE",
        (APERTURE_X, -0.058, APERTURE_Z - 0.050),
        0.0090,
        mats["screen_route"],
        destination,
    )
    screen_text(
        "PhysicalScreen_TestRouteAvailable",
        "TEST ROUTE AVAILABLE",
        (APERTURE_X, -0.058, APERTURE_Z + 0.015),
        0.0145,
        mats["screen_ready"],
        destination,
    )


def spiral_points() -> list[tuple[float, float, float]]:
    points = []
    rotations = 2.5
    count = 480
    port_dx, port_dy = 0.58, 0.24
    end_angle = math.atan2(port_dy, port_dx)
    start_angle = end_angle - rotations * math.tau
    for index in range(count):
        progress = index / (count - 1)
        angle = start_angle + progress * rotations * math.tau
        radius = 6.20 + (0.64 - 6.20) * progress
        x = UNIT_X + radius * math.cos(angle)
        y = radius * math.sin(angle)
        z = terrain_height(x, y) + 0.043
        points.append((x, y, z))
    # Credible tangent disappears below grade into the service spine. No plug.
    points.extend(
        [
            (UNIT_X + 0.61, 0.25, 0.043),
            (UNIT_X + 0.59, 0.245, 0.012),
            (UNIT_X + 0.58, 0.24, -0.055),
        ]
    )
    return points


def create_cable(destination: bpy.types.Collection, control: bpy.types.Object, mats: dict[str, bpy.types.Material]) -> None:
    points = spiral_points()
    sheath = curve_object("Cable_PhysicalGraphiteSheath", points, 0.030, mats["cable"], destination)

    def lateral_path(offset: float, z_lift: float) -> list[tuple[float, float, float]]:
        result: list[tuple[float, float, float]] = []
        for index, (x, y, z) in enumerate(points):
            previous = points[max(0, index - 1)]
            following = points[min(len(points) - 1, index + 1)]
            dx, dy = following[0] - previous[0], following[1] - previous[1]
            length = max(1e-6, math.hypot(dx, dy))
            nx, ny = -dy / length, dx / length
            result.append((x + nx * offset, y + ny * offset, z + z_lift))
        return result

    # Two explicit graphite shoulders sit above the narrow internal core. This
    # cross-section cannot read as an LED strip applied to the sheath surface.
    left_shoulder = curve_object("Cable_GraphiteShoulder_Left", lateral_path(-0.020, 0.025), 0.013, mats["cable"], destination)
    right_shoulder = curve_object("Cable_GraphiteShoulder_Right", lateral_path(0.020, 0.025), 0.013, mats["cable"], destination)
    groove_points = lateral_path(0.0, 0.025)
    groove = curve_object("Cable_RecessedConductorChannel", groove_points, 0.011, mats["groove"], destination)
    core_points = lateral_path(0.0, 0.032)
    front_points = lateral_path(0.0, 0.0325)
    core = curve_object("Cable_CumulativeConductor", core_points, 0.0055, mats["cable_live"], destination)
    front = curve_object("Cable_SingleConductionFront", front_points, 0.0065, mats["front_live"], destination)
    core.data.bevel_factor_end = 0.0
    front.data.bevel_factor_start = 0.0
    front.data.bevel_factor_end = 0.0
    add_driver(core.data, "bevel_factor_end", control, "conduction", "max(0,min(1,value))")
    add_driver(front.data, "bevel_factor_start", control, "conduction", "max(0,min(1,value-0.008))")
    add_driver(front.data, "bevel_factor_end", control, "conduction", "max(0,min(1,value))")
    sheath["construction"] = "physical graphite sheath against terrain"
    sheath["turns"] = 2.5
    sheath["spiral_point_count"] = 480
    sheath["continuous_cable_count"] = 1
    sheath["outer_to_inner"] = True
    groove["construction"] = "recessed channel within sheath crown"
    left_shoulder["construction"] = "graphite shoulder visibly above recessed core"
    right_shoulder["construction"] = "graphite shoulder visibly above recessed core"
    core["behavior"] = "single cumulative outer-to-inner conduction"
    front["behavior"] = "one cable-resident advancing edge; never a floating particle"
    trench_points = [(x, y, z - 0.018) for x, y, z in points[-34:-3]]
    trench = curve_object("Cable_ProtectedFoundationTrench", trench_points, 0.047, mats["groove"], destination)
    trench["role"] = "short protected approach into below-grade foundation; no exposed plug"


def create_mobile_cable(destination: bpy.types.Collection, control: bpy.types.Object, mats: dict[str, bpy.types.Material]) -> None:
    """Create the independent portrait-safe 2.25-turn physical conductor.

    It shares the station centre and protected foundation entry but uses a
    tighter authored radius/spacing so the complete spiral remains legible in
    the 720×1600 camera. The render controller guarantees it is never visible
    alongside the desktop 2.5-turn conductor.
    """
    rotations = 2.25
    count = 432
    port_dx, port_dy = 0.58, 0.24
    end_angle = math.atan2(port_dy, port_dx)
    start_angle = end_angle - rotations * math.tau
    points = []
    for index in range(count):
        progress = index / (count - 1)
        angle = start_angle + progress * rotations * math.tau
        radius = 1.12 + (0.61 - 1.12) * progress
        x = UNIT_X + radius * math.cos(angle)
        y = radius * math.sin(angle)
        z = terrain_height(x, y) + 0.043
        if progress > 0.96:
            # The portrait-authored conductor enters the installed foundation
            # through a graded below-grade tangent. Bury the final fraction of
            # the inner turn so no exposed bevel cap can read as a plug.
            entry = (progress - 0.96) / 0.04
            z -= 0.10 * entry * entry
        points.append((x, y, z))
    points.extend(
        [
            (UNIT_X + 0.61, 0.25, -0.060),
            (UNIT_X + 0.59, 0.245, -0.105),
            (UNIT_X + 0.58, 0.24, -0.160),
        ]
    )

    def lateral_path(offset: float, z_lift: float) -> list[tuple[float, float, float]]:
        result: list[tuple[float, float, float]] = []
        for index, (x, y, z) in enumerate(points):
            previous = points[max(0, index - 1)]
            following = points[min(len(points) - 1, index + 1)]
            dx, dy = following[0] - previous[0], following[1] - previous[1]
            length = max(1e-6, math.hypot(dx, dy))
            nx, ny = -dy / length, dx / length
            result.append((x + nx * offset, y + ny * offset, z + z_lift))
        return result

    objects = []
    sheath = curve_object("MobileCable_PhysicalGraphiteSheath", points, 0.030, mats["cable"], destination)
    objects.append(sheath)
    left = curve_object("MobileCable_GraphiteShoulder_Left", lateral_path(-0.020, 0.025), 0.013, mats["cable"], destination)
    right = curve_object("MobileCable_GraphiteShoulder_Right", lateral_path(0.020, 0.025), 0.013, mats["cable"], destination)
    groove = curve_object("MobileCable_RecessedConductorChannel", lateral_path(0.0, 0.025), 0.011, mats["groove"], destination)
    core = curve_object("MobileCable_CumulativeConductor", lateral_path(0.0, 0.032), 0.0055, mats["cable_live"], destination)
    front = curve_object("MobileCable_SingleConductionFront", lateral_path(0.0, 0.0325), 0.0065, mats["front_live"], destination)
    objects.extend((left, right, groove, core, front))
    core.data.bevel_factor_end = 0.0
    front.data.bevel_factor_start = 0.0
    front.data.bevel_factor_end = 0.0
    add_driver(core.data, "bevel_factor_end", control, "conduction", "max(0,min(1,value))")
    add_driver(front.data, "bevel_factor_start", control, "conduction", "max(0,min(1,value-0.008))")
    add_driver(front.data, "bevel_factor_end", control, "conduction", "max(0,min(1,value))")
    # Continue the protected portrait trench through the full below-grade
    # tangent so its bevel cap is buried beneath the installed foundation.
    # Stopping at the last surface point creates a misleading exposed plug.
    trench_points = [(x, y, z - 0.018) for x, y, z in points[-34:]]
    trench = curve_object("MobileCable_ProtectedFoundationTrench", trench_points, 0.047, mats["groove"], destination)
    objects.append(trench)

    sheath["construction"] = "portrait-authored physical graphite sheath against terrain"
    sheath["turns"] = rotations
    sheath["spiral_point_count"] = count
    sheath["continuous_cable_count"] = 1
    sheath["outer_to_inner"] = True
    sheath["composition"] = "mobile-only"
    groove["construction"] = "recessed channel within sheath crown"
    left["construction"] = "graphite shoulder visibly above recessed core"
    right["construction"] = "graphite shoulder visibly above recessed core"
    core["behavior"] = "single cumulative outer-to-inner conduction"
    front["behavior"] = "one cable-resident advancing edge; never a floating particle"
    trench["role"] = "short protected approach into below-grade foundation; no exposed plug"
    for obj in objects:
        obj["composition"] = "mobile-only"
        obj.hide_render = True


def point_at(obj: bpy.types.Object, target: Sequence[float]) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def camera(name: str, loc: Sequence[float], target: Sequence[float], lens: float, destination: bpy.types.Collection, ortho: float | None = None) -> bpy.types.Object:
    data = bpy.data.cameras.new(name)
    if ortho:
        data.type = "ORTHO"
        data.ortho_scale = ortho
    else:
        data.lens = lens
    data.sensor_width = 36.0
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    point_at(obj, target)
    destination.objects.link(obj)
    return obj


def area_light(name: str, loc: Sequence[float], target: Sequence[float], energy: float, color: Sequence[float], size: float, destination: bpy.types.Collection) -> None:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.color = color
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    point_at(obj, target)
    destination.objects.link(obj)


def point_light(name: str, loc: Sequence[float], threshold: float, control: bpy.types.Object, destination: bpy.types.Collection) -> None:
    data = bpy.data.lights.new(name, "POINT")
    data.color = (1.0, 0.12, 0.34)
    data.energy = 0.0
    data.shadow_soft_size = 0.50
    # These low-energy sources only provide a restrained local ground response;
    # they do not need shadow maps. Disabling their shadows prevents EEVEE's
    # shadow-pool limit from being exceeded by the long procedural cable.
    data.use_shadow = False
    add_driver(data, "energy", control, "conduction", f"28*max(0,min(1,(value-{threshold:.4f})*8))")
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    destination.objects.link(obj)
    obj["purpose"] = "low-opacity cable-local ground response; light source not visible"


def create_lighting(destination: bpy.types.Collection, control: bpy.types.Object) -> None:
    target = (UNIT_X, 0.0, 0.65)
    area_light("Neutral_Key", (-4.5, -4.8, 6.5), target, 660.0, (0.72, 0.82, 0.84), 4.5, destination)
    area_light("Neutral_Edge", (6.6, 2.1, 4.3), target, 560.0, (0.65, 0.76, 0.79), 3.0, destination)
    area_light("Low_FrontFill", (0.6, -4.8, 1.6), target, 230.0, (0.54, 0.60, 0.62), 4.3, destination)
    area_light("Environment_Separation", (-8.0, 6.0, 5.5), (0.0, 6.0, 2.0), 390.0, (0.48, 0.55, 0.57), 5.5, destination)
    points = spiral_points()
    for index, threshold in enumerate((0.10, 0.22, 0.34, 0.46, 0.58, 0.70, 0.82), 1):
        point = points[min(len(points) - 1, round(threshold * (len(points) - 1)))]
        point_light(f"CableGroundResponse_{index:02d}", (point[0], point[1], point[2] + 0.18), threshold, control, destination)


def create_cameras(destination: bpy.types.Collection) -> None:
    target = (UNIT_X, 0.0, 0.64)
    camera("Camera_Hero", (6.25, -7.35, 1.82), (UNIT_X - 1.18, -0.02, 0.76), 58.0, destination)
    # Station lives right-middle; the left field remains physically quiet for
    # actual semantic DOM copy. No opaque copy plate is baked into the scene.
    camera("Camera_DesktopHero", (6.65, -8.15, 2.02), (UNIT_X - 1.58, -0.05, 0.84), 58.0, destination)
    camera("Camera_MobileHero", (4.55, -7.50, 2.35), (UNIT_X - 0.18, -0.02, 0.57), 55.0, destination)
    camera("Camera_DesignFront", (UNIT_X, -5.6, 1.25), target, 60.0, destination, ortho=2.55)
    camera("Camera_DesignSide", (UNIT_X + 5.6, 0.0, 1.18), target, 60.0, destination, ortho=2.55)
    camera("Camera_DesignTop", (UNIT_X, 0.0, 5.8), (UNIT_X, 0.0, 0.15), 60.0, destination, ortho=2.65)
    camera("Camera_DesignThreeQuarter", (UNIT_X + 4.1, -4.6, 2.5), target, 58.0, destination, ortho=2.75)
    camera("Camera_DesignRear", (UNIT_X, 5.6, 1.25), target, 60.0, destination, ortho=2.55)
    camera("Camera_DesignLow", (UNIT_X + 3.8, -4.8, 1.15), (UNIT_X, 0.0, 0.50), 64.0, destination, ortho=2.70)
    camera("Camera_DesignRearThreeQuarter", (UNIT_X + 4.1, 4.6, 2.5), target, 58.0, destination, ortho=2.75)
    # Five still checkpoints span the authorized maximum 28-degree arc.
    radius = 7.8
    for index, degrees in enumerate((-14.0, -7.0, 0.0, 7.0, 14.0), 1):
        angle = math.radians(-28.0 + degrees)
        loc = (UNIT_X + radius * math.sin(-angle), -radius * math.cos(angle), 3.15 - 0.06 * index)
        camera(f"Camera_Arc_{index:02d}", loc, (UNIT_X + 0.05, 0.0, 0.60), 54.0, destination)
        bpy.data.objects[f"Camera_Arc_{index:02d}"]["arc_degrees"] = degrees
    camera("Camera_MaterialShell", (UNIT_X + 2.8, -3.4, 1.75), (UNIT_X + 0.28, -0.12, 0.67), 78.0, destination)
    camera("Camera_MaterialGlass", (APERTURE_X + 0.10, -2.2, 0.92), (APERTURE_X, -0.09, APERTURE_Z), 88.0, destination)
    camera("Camera_MaterialFoundation", (UNIT_X + 2.3, -2.8, 0.55), (UNIT_X + 0.48, -0.08, 0.10), 82.0, destination)
    camera("Camera_MaterialCable", (UNIT_X - 2.9, -4.6, 0.42), (UNIT_X - 2.05, -2.65, 0.06), 96.0, destination)
    camera("Camera_PortalPhysical", (APERTURE_X, -1.72, APERTURE_Z), (APERTURE_X, -0.06, APERTURE_Z), 66.0, destination)
    camera("Camera_ActivationClose", (UNIT_X + 0.16, -4.7, 1.55), (UNIT_X - 0.02, -0.05, 0.67), 70.0, destination)


def build() -> None:
    args = cli_args()
    clear_scene()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 42
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.world.color = (0.003, 0.004, 0.004)
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.006, 0.009, 0.010, 1.0)
    background.inputs["Strength"].default_value = 0.10
    # Restrained neutral atmospheric depth: enough to separate the foreground,
    # mid-ground chassis, and distant industrial layers without blue haze,
    # cyberpunk color, or any dormant magenta contribution.
    world_output = scene.world.node_tree.nodes.get("World Output")
    volume = scene.world.node_tree.nodes.new("ShaderNodeVolumeScatter")
    volume.name = "Neutral_ProvingGround_Depth"
    volume.inputs["Color"].default_value = (0.11, 0.13, 0.13, 1.0)
    volume.inputs["Density"].default_value = 0.006
    volume.inputs["Anisotropy"].default_value = 0.16
    scene.world.node_tree.links.new(volume.outputs["Volume"], world_output.inputs["Volume"])

    root = new_collection("PHASE_0_3_APERTURE_STATION_ROOT", scene)
    environment = new_collection("LAYERED_PROVING_GROUND", root)
    field = new_collection("SELECTED_A_INCLINED_OPTICAL_BLADE", root)
    cable = new_collection("PHYSICAL_SPIRAL_CONDUCTOR", root)
    lighting = new_collection("NEUTRAL_LIGHTING", root)
    cameras = new_collection("CAMERAS", root)
    controls = new_collection("CONTROLS", root)
    control = create_control(controls)

    mats = {
        "body": material("Chassis_Graphite_Coating", (0.035, 0.046, 0.049), 0.39, 0.48, 36.0),
        "secondary": material("Chassis_Secondary_Charcoal", (0.030, 0.039, 0.041), 0.44, 0.34, 44.0),
        "base": material("Chassis_Underside_Black", (0.012, 0.016, 0.017), 0.48, 0.38),
        "cavity": material("Aperture_OpticalBlack_Cavity", (0.0015, 0.0020, 0.0021), 0.21, 0.20),
        "glass": smoked_glass("Aperture_DormantBlack_Glass"),
        "terrain": material("ProvingGround_Terrain", (0.014, 0.019, 0.020), 0.68, 0.12, 28.0),
        "slab": material("EngineeredSlab", (0.022, 0.029, 0.030), 0.63, 0.16, 48.0),
        "background": material("Industrial_Background", (0.010, 0.014, 0.015), 0.58, 0.22, 20.0),
        "background2": material("Industrial_Background_Secondary", (0.017, 0.023, 0.024), 0.51, 0.28, 32.0),
        "cable": material("Cable_Graphite_Sheath", (0.009, 0.012, 0.012), 0.52, 0.22, 64.0),
        "groove": material("Cable_Recessed_Channel", (0.002, 0.003, 0.003), 0.30, 0.30),
    }
    glass_shader = mats["glass"].node_tree.nodes.get("Principled BSDF")
    glass_alpha = glass_shader.inputs.get("Alpha")
    glass_transmission = glass_shader.inputs.get("Transmission Weight") or glass_shader.inputs.get("Transmission")
    glass_roughness = glass_shader.inputs.get("Roughness")
    glass_metallic = glass_shader.inputs.get("Metallic")
    glass_coat = glass_shader.inputs.get("Coat Weight") or glass_shader.inputs.get("Clearcoat")
    glass_ior = glass_shader.inputs.get("IOR")
    glass_ior_level = glass_shader.inputs.get("IOR Level")
    # Foundation arrival leaves the aperture wholly black. Internal transfer
    # opens only enough material response to reveal the authored iris/screen.
    add_driver(glass_alpha, "default_value", control, "internal", "1.0-0.72*max(0,min(1,value))")
    add_driver(glass_transmission, "default_value", control, "internal", "0.46*max(0,min(1,value))")
    add_driver(glass_roughness, "default_value", control, "internal", "0.94-0.76*max(0,min(1,value))")
    add_driver(glass_metallic, "default_value", control, "internal", "0.14*max(0,min(1,value))")
    add_driver(glass_coat, "default_value", control, "internal", "0.10*max(0,min(1,value))")
    add_driver(glass_ior, "default_value", control, "internal", "1.0+0.44*max(0,min(1,value))")
    if glass_ior_level is not None:
        add_driver(glass_ior_level, "default_value", control, "internal", "0.05+0.40*max(0,min(1,value))")
    mats["cable_live"] = emission_material("Cable_WarmMagenta_RecessedCore", (0.74, 0.035, 0.20), 0.90, control, "conduction", "0.90*max(0,min(1,value*4))")
    mats["front_live"] = emission_material("Cable_SingleFront_ModestHighlight", (0.78, 0.045, 0.22), 0.22, control, "conduction", "0.22*max(0,min(1,value*4))")
    mats["foundation_live"] = emission_material("Foundation_LocalArrival", (0.70, 0.030, 0.18), 1.0, control, "foundation", "value*1.0")
    mats["internal_live"] = emission_material("InternalTransfer_RestrainedLight", (0.64, 0.022, 0.15), 0.82, control, "internal", "value*0.82")
    internal_shader = mats["internal_live"].node_tree.nodes.get("Principled BSDF")
    assign(internal_shader, ("Alpha",), 0.0)
    add_driver(internal_shader.inputs.get("Alpha"), "default_value", control, "internal", "max(0,min(1,value))")
    mats["internal_live"].surface_render_method = "DITHERED"
    mats["internal_live"].use_transparency_overlap = False
    mats["iris"] = emission_material("InternalIris_DarkMechanical", (0.10, 0.13, 0.14), 0.24, control, "iris", "0.06+value*0.18")
    mats["screen_live"] = emission_material("PhysicalScreen_RestrainedWake", (0.82, 0.075, 0.29), 3.0, control, "screen", "value*3.0")
    mats["screen_challenge"] = emission_material("PhysicalScreen_ChallengeWake", (0.82, 0.075, 0.29), 2.6, control, "screen", "2.6*max(0,min(1,(value-0.12)*5))")
    mats["screen_route"] = emission_material("PhysicalScreen_RouteWake", (0.82, 0.075, 0.29), 2.4, control, "screen", "2.4*max(0,min(1,(value-0.45)*5))")
    mats["screen_ready"] = emission_material("PhysicalScreen_ReadyWake", (0.82, 0.075, 0.29), 2.7, control, "screen", "2.7*max(0,min(1,(value-0.78)*5))")
    driven_visibility(mats["screen_live"], control, "screen", "max(0,min(1,value*4))")
    driven_visibility(mats["screen_challenge"], control, "screen", "max(0,min(1,(value-0.12)*5))")
    driven_visibility(mats["screen_route"], control, "screen", "max(0,min(1,(value-0.45)*5))")
    driven_visibility(mats["screen_ready"], control, "screen", "max(0,min(1,(value-0.78)*5))")

    create_environment(environment, mats)
    create_field_unit(field, control, mats)
    create_cable(cable, control, mats)
    create_mobile_cable(cable, control, mats)
    create_lighting(lighting, control)
    create_cameras(cameras)
    scene.camera = bpy.data.objects["Camera_Hero"]
    scene.render.resolution_x, scene.render.resolution_y = cfg.CANONICAL_STILL_RESOLUTION

    portal_path = cfg.PACKAGE_ROOT / "portal-layout.json"
    portal = json.loads(portal_path.read_text(encoding="utf-8"))
    scene["phase"] = "Phase 0.3 bounded still repair"
    scene["selected_option"] = "A / Inclined Optical Blade"
    scene["portal_layout_schema"] = portal["schema"]
    scene["portal_layout_sha256"] = sha256(portal_path)
    scene["portal_heading"] = portal["copy"]["heading"]
    scene["original_artwork"] = True
    scene["reference_binary_used"] = False
    scene["external_assets"] = False
    scene["full_animatic_present"] = False
    scene["mechanical_response_count"] = 1
    scene["camera_study_arc_degrees"] = 28.0
    scene["camera_checkpoint_count"] = 5
    scene["desktop_cable_turns"] = 2.5
    scene["mobile_cable_turns"] = 2.25
    scene["mobile_cable_contract"] = "portrait-authored, mobile-only, never rendered alongside desktop conductor"
    scene["mechanical_response"] = "internal iris only"
    scene["aperture_contract"] = "offset deep horizontal ellipse with structural lower-right interruption; no ring, lens, or logo"
    scene["foundation_contract"] = "integrated below grade; no feet, plinth, rails, plug, vents, buttons, or appliance seams"
    scene["video_or_frame_sequence_present"] = False

    args.output.parent.mkdir(parents=True, exist_ok=True)
    # Save as a copy from the factory-startup session so the portable source
    # does not persist the operator's private absolute workspace path.
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output.resolve()), compress=True, relative_remap=True, copy=True)
    print(f"QH_V3_FINAL_SOURCE={args.output.resolve()}")
    print(f"QH_V3_FINAL_OBJECTS={len(bpy.data.objects)}")
    print(f"QH_V3_PORTAL_LAYOUT_SHA256={scene['portal_layout_sha256']}")


if __name__ == "__main__":
    build()

