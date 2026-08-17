"""Build the selected Phase 0.2 Integrated Aperture Chassis scene.

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


UNIT_X = 1.85
UNIT_Z = 0.36
APERTURE_X = UNIT_X - 0.92
APERTURE_Z = 1.14
FRONT_Y = -1.30


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


def tapered_shell(name: str, destination: bpy.types.Collection, mat: bpy.types.Material) -> bpy.types.Object:
    """A low, wide, asymmetric monocoque with deliberate planar taper."""
    x0, x1 = UNIT_X - 3.08, UNIT_X + 3.32
    yf, yr = -1.30, 1.30
    zb = 0.42
    vertices = [
        (x0, yf, zb), (x1, yf, zb), (x1 - 0.18, yr, zb), (x0 + 0.10, yr, zb),
        (x0 + 0.10, yf + 0.08, 1.68), (x1 - 0.36, yf + 0.08, 1.50),
        (x1 - 0.62, yr - 0.04, 1.31), (x0 + 0.34, yr - 0.04, 1.48),
    ]
    faces = [
        (0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1),
        (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0),
    ]
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    destination.objects.link(obj)
    obj.data.materials.append(mat)
    bevel(obj, 0.18, 10)
    obj["design"] = "selected A; tapered integrated optical monocoque"
    return obj


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
    control = bpy.data.objects.new("CTRL_V2_StillStates", None)
    destination.objects.link(control)
    for prop in ("conduction", "connector", "mechanical", "screen", "portal"):
        control[prop] = 0.0
        control.id_properties_ui(prop).update(min=0.0, max=1.0, description=f"Phase 0.2 {prop} still-state control")
    control["state_contract"] = "still-only direct controls; no full animatic"
    control["mechanical_response_count"] = 1
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
    # Dark layered industrial depth: walls, beams, pipes and distant service masses.
    rounded_box("RearWall_Left", (10.0, 0.45, 5.7), (-6.3, 7.2, 2.5), 0.08, mats["background"], destination)
    rounded_box("RearWall_Right", (9.2, 0.55, 4.5), (6.2, 8.4, 2.0), 0.08, mats["background2"], destination)
    for index, x in enumerate((-7.2, -1.0, 5.4), 1):
        rounded_box(f"IndustrialColumn_{index}", (0.46, 0.46, 5.9), (x, 4.9 + index * 0.45, 2.8), 0.05, mats["background2"], destination)
    # No uninterrupted bright cross-bar: from the arrival camera that form
    # could read as an ornamental handle attached to the unit. Layering comes
    # from the wall breaks, columns, and process masses instead.
    for index, x in enumerate((-4.8, -3.9, 4.3, 5.3), 1):
        cylinder(f"DistantProcessTank_{index}", 0.68 if index % 2 else 0.52, 2.4 + 0.3 * index, (x, 6.7 + 0.35 * index, 1.2), (0.0, 0.0, 0.0), mats["background"], destination, vertices=96, edge=0.04)


def create_field_unit(destination: bpy.types.Collection, control: bpy.types.Object, mats: dict[str, bpy.types.Material]) -> None:
    # Hidden, credible footing inside the projected chassis footprint.
    for index, (x, y) in enumerate(((UNIT_X - 2.55, -0.86), (UNIT_X + 2.55, -0.86), (UNIT_X - 2.45, 0.84), (UNIT_X + 2.45, 0.84)), 1):
        rounded_box(f"HiddenFoot_{index}", (0.44, 0.54, 0.22), (x, y, 0.16), 0.10, mats["rubber"], destination)
    rounded_box("Chassis_UndersideDatum", (5.72, 2.08, 0.14), (UNIT_X + 0.08, 0.08, 0.36), 0.05, mats["base"], destination)
    shell = tapered_shell("Chassis_IntegratedMonocoque", destination, mats["body"])

    cutter = cylinder("Aperture_RecessCutter", 0.42, 2.60, (APERTURE_X, -1.45, APERTURE_Z), (math.radians(90), 0.0, 0.0), mats["cavity"], destination, vertices=192)
    cutter.display_type = "WIRE"
    cutter.hide_render = True
    cutter["role"] = "editable deep aperture boolean cutter"
    boolean = shell.modifiers.new("Integrated aperture void", "BOOLEAN")
    boolean.operation = "DIFFERENCE"
    boolean.solver = "EXACT"
    boolean.object = cutter

    hollow_cylinder_y("Aperture_RecessSleeve", 0.405, 0.340, -1.15, -0.18, APERTURE_X, APERTURE_Z, mats["cavity"], destination)
    glass = cylinder("Aperture_OpticallyBlackGlass", 0.333, 0.024, (APERTURE_X, -0.192, APERTURE_Z), (math.radians(90), 0.0, 0.0), mats["glass"], destination, vertices=192, edge=0.008)
    glass["dormant"] = "zero emission; optically black"

    # Coherent service-side volume and seams remain flush with the chassis.
    rounded_box("ServiceSide_InsetPanel", (1.92, 0.065, 0.52), (UNIT_X + 1.83, -1.302, 0.77), 0.08, mats["secondary"], destination, rotation=(0.0, 0.0, math.radians(-2.5)))
    rounded_box("ServiceSide_LowerDatum", (1.82, 0.025, 0.035), (UNIT_X + 1.74, -1.296, 0.48), 0.010, mats["vent"], destination)
    for index, x in enumerate((UNIT_X + 0.72, UNIT_X + 1.20, UNIT_X + 1.68, UNIT_X + 2.16), 1):
        rounded_box(f"ServiceVent_{index}", (0.20, 0.05, 0.29), (x, -1.345, 0.88), 0.025, mats["vent"], destination)

    # Lower-side port: no front plug and no external bumper.
    connector_x = UNIT_X + 3.12
    cylinder("Connector_Recess", 0.18, 0.24, (connector_x, -0.74, 0.42), (0.0, math.radians(90), 0.0), mats["cavity"], destination, vertices=128, edge=0.025)
    cylinder("Connector_Response", 0.060, 0.025, (connector_x + 0.13, -0.74, 0.42), (0.0, math.radians(90), 0.0), mats["connector_live"], destination, vertices=128, edge=0.010)
    rounded_box("Connector_ProtectiveRecess", (0.24, 0.66, 0.50), (connector_x - 0.14, -0.74, 0.44), 0.08, mats["secondary"], destination)

    # One restrained, non-mechanical internal transfer datum. It is a narrow
    # recessed service path, not an animated seam system; it simply becomes
    # visible after the lower-side connector responds and stays on thereafter.
    internal_points = [
        (connector_x - 0.16, -1.345, 0.52),
        (UNIT_X + 2.72, -1.345, 0.52),
        (UNIT_X + 2.20, -1.345, 0.54),
    ]
    internal = curve_object("InternalEnergyTransfer_RecessedDatum", internal_points, 0.010, mats["internal_live"], destination)
    internal["behavior"] = "single restrained non-mechanical connector-to-aperture transfer datum"

    # Exactly one permitted mechanical response: a deeply recessed inner optical
    # partial ring rotates slightly. Its lower-right interruption makes the
    # orientation change visible without adding a shutter, iris, or glass clear.
    ring_points = []
    for index in range(181):
        angle = math.radians(5.0 + (295.0 * index / 180.0))
        ring_points.append((0.267 * math.cos(angle), 0.0, 0.267 * math.sin(angle)))
    ring = curve_object("MechanicalResponse_InnerOpticalPartialRing", ring_points, 0.017, mats["mechanical_live"], destination)
    ring.location = (APERTURE_X, -0.17, APERTURE_Z)
    ring.rotation_mode = "XYZ"
    add_driver(ring, "rotation_euler", control, "mechanical", "radians(-5.0 + value*14.0)", index=1)
    ring["mechanical_response"] = "sole moving chassis element; recessed partial ring with lower-right interruption"

    # Sparse physical screen carrier; semantic portal copy is applied from the shared JSON compositor.
    screen = cylinder("PhysicalScreen_Carrier", 0.292, 0.020, (APERTURE_X, -0.145, APERTURE_Z), (math.radians(90), 0.0, 0.0), mats["cavity"], destination, vertices=192)
    screen["portal_layout_source"] = "portal-layout.json"
    for index, offset in enumerate((-0.15, -0.075, 0.0, 0.075, 0.15), 1):
        rounded_box(f"PhysicalScreen_RouteDatum_{index}", (0.050, 0.012, 0.024), (APERTURE_X + offset, -0.168, APERTURE_Z - 0.15), 0.005, mats["screen_live"], destination)
    screen_text(
        "PhysicalScreen_ChallengeDetected",
        "CHALLENGE DETECTED",
        (APERTURE_X, -0.168, APERTURE_Z + 0.105),
        0.025,
        mats["screen_challenge"],
        destination,
    )
    screen_text(
        "PhysicalScreen_OperatingRoute",
        "FRAME  SOURCE  ASSESS  TEST  DECIDE",
        (APERTURE_X, -0.168, APERTURE_Z - 0.068),
        0.0135,
        mats["screen_route"],
        destination,
    )
    screen_text(
        "PhysicalScreen_TestRouteAvailable",
        "TEST ROUTE AVAILABLE",
        (APERTURE_X, -0.168, APERTURE_Z + 0.018),
        0.021,
        mats["screen_ready"],
        destination,
    )


def spiral_points() -> list[tuple[float, float, float]]:
    points = []
    rotations = 2.5
    count = 480
    end_angle = math.atan2(-0.74, 3.12)
    start_angle = end_angle - rotations * math.tau
    for index in range(count):
        progress = index / (count - 1)
        angle = start_angle + progress * rotations * math.tau
        radius = 8.55 + (3.20 - 8.55) * progress
        x = UNIT_X + radius * math.cos(angle)
        y = radius * math.sin(angle)
        z = terrain_height(x, y) + 0.065
        points.append((x, y, z))
    # Credible tangent and short rise into the lower-side port.
    points.extend(
        [
            (UNIT_X + 3.04, -0.84, 0.075),
            (UNIT_X + 3.15, -0.78, 0.16),
            (UNIT_X + 3.18, -0.74, 0.38),
        ]
    )
    return points


def create_cable(destination: bpy.types.Collection, control: bpy.types.Object, mats: dict[str, bpy.types.Material]) -> None:
    points = spiral_points()
    sheath = curve_object("Cable_PhysicalGraphiteSheath", points, 0.055, mats["cable"], destination)
    groove_points = [(x, y, z + 0.036) for x, y, z in points]
    groove = curve_object("Cable_RecessedConductorChannel", groove_points, 0.026, mats["groove"], destination)
    # Layer a narrow visible cap above the wider black channel.  The energetic
    # material remains physically surrounded by graphite shoulders instead of
    # becoming an exposed luminous tube.
    core_points = [(x, y, z + 0.053) for x, y, z in points]
    front_points = [(x, y, z + 0.058) for x, y, z in points]
    core = curve_object("Cable_CumulativeConductor", core_points, 0.016, mats["cable_live"], destination)
    front = curve_object("Cable_SingleConductionFront", front_points, 0.009, mats["front_live"], destination)
    core.data.bevel_factor_end = 0.0
    front.data.bevel_factor_start = 0.0
    front.data.bevel_factor_end = 0.0
    add_driver(core.data, "bevel_factor_end", control, "conduction", "max(0,min(1,value))")
    add_driver(front.data, "bevel_factor_start", control, "conduction", "max(0,min(1,value-0.004))")
    add_driver(front.data, "bevel_factor_end", control, "conduction", "max(0,min(1,value))")
    sheath["construction"] = "physical graphite sheath against terrain"
    sheath["turns"] = 2.5
    sheath["continuous_cable_count"] = 1
    sheath["outer_to_inner"] = True
    groove["construction"] = "recessed channel within sheath crown"
    core["behavior"] = "single cumulative outer-to-inner conduction"
    front["behavior"] = "one cable-resident advancing edge; never a floating particle"


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
    add_driver(data, "energy", control, "conduction", f"48*max(0,min(1,(value-{threshold:.4f})*8))")
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    destination.objects.link(obj)
    obj["purpose"] = "low-opacity cable-local ground response; light source not visible"


def create_lighting(destination: bpy.types.Collection, control: bpy.types.Object) -> None:
    target = (UNIT_X, 0.0, 0.8)
    area_light("Neutral_Key", (-5.5, -5.8, 7.5), target, 720.0, (0.72, 0.82, 0.84), 5.0, destination)
    area_light("Neutral_Edge", (7.8, 2.4, 5.0), target, 610.0, (0.65, 0.76, 0.79), 3.4, destination)
    area_light("Low_FrontFill", (0.8, -5.8, 1.8), target, 250.0, (0.54, 0.60, 0.62), 5.0, destination)
    area_light("Environment_Separation", (-8.0, 6.0, 5.5), (0.0, 6.0, 2.0), 390.0, (0.48, 0.55, 0.57), 5.5, destination)
    points = spiral_points()
    for index, threshold in enumerate((0.10, 0.22, 0.34, 0.46, 0.58, 0.70, 0.82), 1):
        point = points[min(len(points) - 1, round(threshold * (len(points) - 1)))]
        point_light(f"CableGroundResponse_{index:02d}", (point[0], point[1], point[2] + 0.18), threshold, control, destination)


def create_cameras(destination: bpy.types.Collection) -> None:
    target = (UNIT_X, 0.0, 0.82)
    camera("Camera_Hero", (12.8, -16.2, 4.8), (UNIT_X + 0.45, 0.0, 0.72), 49.0, destination)
    # Desktop publication composition: the Field Unit occupies the lower-right
    # / right-middle while the left 46% remains structurally quiet for real DOM
    # typography. The scene itself, not an opaque overlay, creates the safe area.
    camera("Camera_DesktopHero", (13.4, -17.5, 4.5), (UNIT_X - 2.70, 0.0, 1.48), 52.0, destination)
    camera("Camera_MobileHero", (7.2, -13.4, 4.4), (UNIT_X, 0.0, 0.76), 46.0, destination)
    camera("Camera_DesignFront", (UNIT_X, -11.8, 2.25), target, 60.0, destination, ortho=7.5)
    camera("Camera_DesignSide", (UNIT_X + 11.8, 0.0, 2.15), target, 60.0, destination, ortho=7.5)
    camera("Camera_DesignTop", (UNIT_X, 0.0, 12.0), (UNIT_X, 0.0, 0.3), 60.0, destination, ortho=7.5)
    camera("Camera_DesignThreeQuarter", (UNIT_X + 8.0, -8.8, 4.5), target, 58.0, destination, ortho=8.2)
    camera("Camera_DesignRear", (UNIT_X, 11.5, 2.3), target, 60.0, destination, ortho=7.5)
    camera("Camera_DesignLow", (UNIT_X + 7.6, -9.5, 2.1), (UNIT_X, 0.0, 0.55), 64.0, destination, ortho=8.0)
    camera("Camera_DesignRearThreeQuarter", (UNIT_X + 8.0, 8.8, 4.5), target, 58.0, destination, ortho=8.2)
    # Four still cameras span a meaningful 27-degree arc, not an implied animation.
    radius = 16.2
    for index, degrees in enumerate((-14.0, -5.0, 4.0, 13.0), 1):
        angle = math.radians(-36.0 + degrees)
        loc = (UNIT_X + radius * math.sin(-angle), -radius * math.cos(angle), 4.3 - 0.10 * index)
        camera(f"Camera_Arc_{index:02d}", loc, (UNIT_X + 0.3, 0.0, 0.72), 51.0, destination)
        bpy.data.objects[f"Camera_Arc_{index:02d}"]["arc_degrees"] = degrees
    camera("Camera_MaterialShell", (UNIT_X + 5.0, -5.0, 2.7), (UNIT_X + 1.5, -0.9, 0.9), 82.0, destination)
    camera("Camera_MaterialGlass", (APERTURE_X + 0.2, -4.4, 1.45), (APERTURE_X, -0.42, APERTURE_Z), 92.0, destination)
    camera("Camera_MaterialConnector", (UNIT_X - 5.4, -3.2, 1.25), (UNIT_X - 3.12, -0.74, 0.4), 86.0, destination)
    camera("Camera_MaterialCable", (UNIT_X - 4.6, -7.0, 0.68), (UNIT_X - 3.2, -4.0, 0.08), 92.0, destination)
    camera("Camera_PortalPhysical", (APERTURE_X, -2.7, APERTURE_Z), (APERTURE_X, -0.4, APERTURE_Z), 58.0, destination)
    camera("Camera_ActivationClose", (UNIT_X + 0.58, -10.5, 2.55), (UNIT_X + 0.18, -0.42, 0.88), 58.0, destination)


def build() -> None:
    args = cli_args()
    clear_scene()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 48
    scene.eevee.volumetric_samples = 24
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

    root = new_collection("PHASE_0_2_ROOT", scene)
    environment = new_collection("LAYERED_PROVING_GROUND", root)
    field = new_collection("INTEGRATED_APERTURE_CHASSIS", root)
    cable = new_collection("PHYSICAL_SPIRAL_CONDUCTOR", root)
    lighting = new_collection("NEUTRAL_LIGHTING", root)
    cameras = new_collection("CAMERAS", root)
    controls = new_collection("CONTROLS", root)
    control = create_control(controls)

    mats = {
        "body": material("Chassis_Graphite_Coating", (0.035, 0.046, 0.049), 0.39, 0.48, 36.0),
        "secondary": material("Chassis_Secondary_Charcoal", (0.030, 0.039, 0.041), 0.44, 0.34, 44.0),
        "base": material("Chassis_Underside_Black", (0.012, 0.016, 0.017), 0.48, 0.38),
        "rubber": material("HiddenFoot_Rubber", (0.006, 0.008, 0.008), 0.72, 0.02),
        "edge": material("Precision_Neutral_Edge", (0.26, 0.31, 0.32), 0.25, 0.72),
        "vent": material("ServiceVent_Black", (0.004, 0.006, 0.006), 0.46, 0.32),
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
    # At conductor arrival the glass remains materially opaque-black.  Only
    # the following localized internal-transfer stage opens enough optical
    # transmission to reveal the one internal datum and later screen wake.
    add_driver(glass_alpha, "default_value", control, "connector", "1.0-0.78*max(0,min(1,value))")
    add_driver(glass_transmission, "default_value", control, "connector", "0.58*max(0,min(1,value))")
    add_driver(glass_roughness, "default_value", control, "connector", "0.95-0.855*max(0,min(1,value))")
    add_driver(glass_metallic, "default_value", control, "connector", "0.20*max(0,min(1,value))")
    add_driver(glass_coat, "default_value", control, "connector", "0.12*max(0,min(1,value))")
    add_driver(glass_ior, "default_value", control, "connector", "1.0+0.46*max(0,min(1,value))")
    if glass_ior_level is not None:
        add_driver(glass_ior_level, "default_value", control, "connector", "0.05+0.45*max(0,min(1,value))")
    mats["cable_live"] = emission_material("Cable_WarmMagenta_Core", (0.69, 0.024, 0.168), 0.88, control, "conduction", "0.88*max(0,min(1,value*4))")
    mats["front_live"] = emission_material("Cable_SingleFront_Highlight", (0.74, 0.026, 0.172), 0.14, control, "conduction", "0.14*max(0,min(1,value*4))")
    mats["connector_live"] = emission_material("Connector_Response_Light", (0.69, 0.024, 0.168), 0.90, control, "connector", "value*0.90")
    mats["internal_live"] = emission_material("InternalTransfer_RestrainedLight", (0.63, 0.020, 0.145), 0.72, control, "connector", "value*0.72")
    internal_shader = mats["internal_live"].node_tree.nodes.get("Principled BSDF")
    assign(internal_shader, ("Alpha",), 0.0)
    add_driver(internal_shader.inputs.get("Alpha"), "default_value", control, "connector", "max(0,min(1,value))")
    mats["internal_live"].surface_render_method = "DITHERED"
    mats["internal_live"].use_transparency_overlap = False
    mats["screen_live"] = emission_material("PhysicalScreen_RestrainedWake", (0.82, 0.075, 0.29), 3.0, control, "screen", "value*3.0")
    mats["screen_challenge"] = emission_material("PhysicalScreen_ChallengeWake", (0.82, 0.075, 0.29), 2.6, control, "screen", "2.6*max(0,min(1,(value-0.12)*5))")
    mats["screen_route"] = emission_material("PhysicalScreen_RouteWake", (0.82, 0.075, 0.29), 2.4, control, "screen", "2.4*max(0,min(1,(value-0.45)*5))")
    mats["screen_ready"] = emission_material("PhysicalScreen_ReadyWake", (0.82, 0.075, 0.29), 2.7, control, "screen", "2.7*max(0,min(1,(value-0.78)*5))")
    driven_visibility(mats["screen_live"], control, "screen", "max(0,min(1,value*4))")
    driven_visibility(mats["screen_challenge"], control, "screen", "max(0,min(1,(value-0.12)*5))")
    driven_visibility(mats["screen_route"], control, "screen", "max(0,min(1,(value-0.45)*5))")
    driven_visibility(mats["screen_ready"], control, "screen", "max(0,min(1,(value-0.78)*5))")
    mats["mechanical_live"] = emission_material("InnerOpticalRing_NeutralWake", (0.26, 0.31, 0.32), 0.70, control, "mechanical", "value*0.70")

    create_environment(environment, mats)
    create_field_unit(field, control, mats)
    create_cable(cable, control, mats)
    create_lighting(lighting, control)
    create_cameras(cameras)
    scene.camera = bpy.data.objects["Camera_Hero"]
    scene.render.resolution_x, scene.render.resolution_y = cfg.CANONICAL_STILL_RESOLUTION

    portal_path = cfg.PACKAGE_ROOT / "portal-layout.json"
    portal = json.loads(portal_path.read_text(encoding="utf-8"))
    scene["phase"] = "Phase 0.2 bounded still repair"
    scene["selected_option"] = "A / Recessed Optical Chassis"
    scene["portal_layout_schema"] = portal["schema"]
    scene["portal_layout_sha256"] = sha256(portal_path)
    scene["portal_heading"] = portal["copy"]["heading"]
    scene["original_artwork"] = True
    scene["reference_binary_used"] = False
    scene["external_assets"] = False
    scene["full_animatic_present"] = False
    scene["mechanical_response_count"] = 1
    scene["camera_study_arc_degrees"] = 27.0

    args.output.parent.mkdir(parents=True, exist_ok=True)
    # Save as a copy from the factory-startup session so the portable source
    # does not persist the operator's private absolute workspace path.
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output.resolve()), compress=True, relative_remap=True, copy=True)
    print(f"QH_V2_FINAL_SOURCE={args.output.resolve()}")
    print(f"QH_V2_FINAL_OBJECTS={len(bpy.data.objects)}")
    print(f"QH_V2_PORTAL_LAYOUT_SHA256={scene['portal_layout_sha256']}")


if __name__ == "__main__":
    build()
