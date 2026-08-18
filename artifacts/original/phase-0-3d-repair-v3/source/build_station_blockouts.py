"""Build three original, ground-anchored Quantum Aperture Station families.

The file uses procedural Blender primitives only. It loads no external image,
font, texture, linked library, reference render, or add-on.
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


def cli_args() -> argparse.Namespace:
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=cfg.BLOCKOUT_BLEND)
    return parser.parse_args(raw)


def clear_scene() -> None:
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


def new_collection(name: str, parent: bpy.types.Collection | bpy.types.Scene) -> bpy.types.Collection:
    result = bpy.data.collections.new(name)
    (parent.collection if isinstance(parent, bpy.types.Scene) else parent).children.link(result)
    return result


def move(obj: bpy.types.Object, destination: bpy.types.Collection) -> bpy.types.Object:
    for collection in tuple(obj.users_collection):
        collection.objects.unlink(obj)
    destination.objects.link(obj)
    return obj


def material(name: str, color: Sequence[float], roughness: float, metallic: float = 0.0) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return mat


def bevel(obj: bpy.types.Object, width: float, segments: int = 6) -> None:
    mod = obj.modifiers.new("Manufactured edge radius", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"


def rounded_box(
    name: str,
    dims: Sequence[float],
    loc: Sequence[float],
    radius: float,
    mat: bpy.types.Material,
    destination: bpy.types.Collection,
    rotation: Sequence[float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel(obj, radius)
    obj.data.materials.append(mat)
    return move(obj, destination)


def tapered_prism(
    name: str,
    bottom_width: float,
    top_width: float,
    depth: float,
    height: float,
    loc: Sequence[float],
    top_shift_x: float,
    top_shift_y: float,
    mat: bpy.types.Material,
    destination: bpy.types.Collection,
    edge: float = 0.05,
) -> bpy.types.Object:
    bx = bottom_width / 2.0
    tx = top_width / 2.0
    dy = depth / 2.0
    sx, sy = top_shift_x, top_shift_y
    verts = [
        (-bx, -dy, 0.0), (bx, -dy, 0.0), (bx, dy, 0.0), (-bx, dy, 0.0),
        (sx - tx, sy - dy, height), (sx + tx, sy - dy, height),
        (sx + tx, sy + dy, height), (sx - tx, sy + dy, height),
    ]
    faces = [
        (0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1),
        (1, 5, 6, 2), (2, 6, 7, 3), (4, 0, 3, 7),
    ]
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    destination.objects.link(obj)
    obj.data.materials.append(mat)
    bevel(obj, edge, 8)
    return obj


def profile_prism(
    name: str,
    profile_xz: Sequence[Sequence[float]],
    depth: float,
    mat: bpy.types.Material,
    destination: bpy.types.Collection,
    edge: float = 0.035,
    y_offset: float = 0.0,
) -> bpy.types.Object:
    """Extrude an editable, potentially concave X/Z industrial profile.

    This avoids the rounded-product-box vocabulary of the rejected studies and
    makes load paths and aperture boundaries legible in the front silhouette.
    """
    count = len(profile_xz)
    front_y = y_offset - depth / 2.0
    back_y = y_offset + depth / 2.0
    verts = [(x, front_y, z) for x, z in profile_xz] + [(x, back_y, z) for x, z in profile_xz]
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    destination.objects.link(obj)
    obj.data.materials.append(mat)
    bevel(obj, edge, 6)
    obj["manufacturing_logic"] = "extruded asymmetric structural profile"
    return obj


def buried_foundation(
    prefix: str,
    dims: Sequence[float],
    center_x: float,
    mats: dict[str, bpy.types.Material],
    destination: bpy.types.Collection,
) -> bpy.types.Object:
    """Create a mostly below-grade service mass with only a flush datum visible."""
    obj = rounded_box(
        f"{prefix}_BelowGradeIntegratedFoundation",
        dims,
        (center_x, 0.06, -(dims[2] / 2.0) - 0.015),
        0.028,
        mats["foundation"],
        destination,
    )
    obj["ground_relation"] = "entirely below grade; no presentation plinth, rail, or feet"
    return obj


def recessed_glass_panel(
    prefix: str,
    dims: Sequence[float],
    loc: Sequence[float],
    mats: dict[str, bpy.types.Material],
    destination: bpy.types.Collection,
) -> bpy.types.Object:
    panel = rounded_box(
        f"{prefix}_DeepSmokedDormantGlass",
        dims,
        loc,
        0.035,
        mats["glass"],
        destination,
    )
    panel["dormant_state"] = "optically black; zero emission"
    panel["aperture_relation"] = "deep plane visible only through structural negative space"
    return panel


def cut_offset_aperture_with_wedge(
    prefix: str,
    shell: bpy.types.Object,
    center_x: float,
    center_z: float,
    radius_x: float,
    radius_z: float,
    shell_depth: float,
    wedge_profile: Sequence[Sequence[float]],
    glass_dims: Sequence[float],
    glass_loc: Sequence[float],
    mats: dict[str, bpy.types.Material],
    destination: bpy.types.Collection,
) -> None:
    """Carve an offset ellipse and a broad structural lower-right release."""
    cutter = ellipse_cutter(
        f"{prefix}_OffsetEllipseCutter",
        (center_x, 0.0, center_z),
        radius_x,
        radius_z,
        shell_depth * 2.8,
        destination,
    )
    ellipse_boolean = shell.modifiers.new("Deep offset optical recess", "BOOLEAN")
    ellipse_boolean.operation = "DIFFERENCE"
    ellipse_boolean.solver = "EXACT"
    ellipse_boolean.object = cutter
    wedge = profile_prism(
        f"{prefix}_StructuralLowerRightReleaseCutter",
        wedge_profile,
        shell_depth * 2.8,
        mats["cavity"],
        destination,
        edge=0.006,
    )
    wedge.display_type = "WIRE"
    wedge.hide_render = True
    wedge["role"] = "broad structural release; prevents complete ring, lens, or literal Q"
    release_boolean = shell.modifiers.new("Structural lower-right aperture release", "BOOLEAN")
    release_boolean.operation = "DIFFERENCE"
    release_boolean.solver = "EXACT"
    release_boolean.object = wedge
    recessed_glass_panel(prefix, glass_dims, glass_loc, mats, destination)


def ellipse_disc(
    name: str,
    center: Sequence[float],
    radius_x: float,
    radius_z: float,
    depth: float,
    mat: bpy.types.Material,
    destination: bpy.types.Collection,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=128,
        radius=1.0,
        depth=depth,
        location=center,
        rotation=(math.radians(90.0), 0.0, 0.0),
    )
    obj = bpy.context.object
    obj.name = name
    # Local X/Y are the visible ellipse radii after the X-axis rotation;
    # local Z remains the shallow physical depth into the station face.
    obj.scale = (radius_x, radius_z, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.materials.append(mat)
    bevel(obj, min(radius_x, radius_z) * 0.035, 4)
    return move(obj, destination)


def ellipse_cutter(
    name: str,
    center: Sequence[float],
    radius_x: float,
    radius_z: float,
    depth: float,
    destination: bpy.types.Collection,
) -> bpy.types.Object:
    """Create an editable elliptical boolean cutter running through Y."""
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=128,
        radius=1.0,
        depth=depth,
        location=center,
        rotation=(math.radians(90.0), 0.0, 0.0),
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = (radius_x, radius_z, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    move(obj, destination)
    obj.display_type = "WIRE"
    obj.hide_render = True
    obj["role"] = "editable recessed aperture boolean cutter"
    return obj


def cut_recessed_aperture(
    prefix: str,
    shell: bpy.types.Object,
    center_x: float,
    center_z: float,
    radius_x: float,
    radius_z: float,
    shell_depth: float,
    gap_center: Sequence[float],
    gap_dims: Sequence[float],
    gap_rotation_z: float,
    glass_y: float,
    mats: dict[str, bpy.types.Material],
    destination: bpy.types.Collection,
) -> None:
    """Cut a deep ellipse plus a lower-right channel through the shell.

    The second cutter makes the recess a true negative-space interruption, not
    a complete rim, applied badge, disc, Q logo, or attached portal ring.
    """
    cutter = ellipse_cutter(
        f"{prefix}_ApertureEllipseCutter",
        (center_x, 0.0, center_z),
        radius_x,
        radius_z,
        shell_depth * 2.8,
        destination,
    )
    boolean = shell.modifiers.new("Physically recessed incomplete aperture", "BOOLEAN")
    boolean.operation = "DIFFERENCE"
    boolean.solver = "EXACT"
    boolean.object = cutter

    bpy.ops.mesh.primitive_cube_add(
        location=gap_center,
        rotation=(0.0, 0.0, gap_rotation_z),
    )
    gap = bpy.context.object
    gap.name = f"{prefix}_LowerRightInterruptionCutter"
    gap.dimensions = gap_dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    move(gap, destination)
    gap.display_type = "WIRE"
    gap.hide_render = True
    gap["role"] = "lower-right shell interruption; prevents complete ring/logo"
    gap_boolean = shell.modifiers.new("Lower-right aperture interruption", "BOOLEAN")
    gap_boolean.operation = "DIFFERENCE"
    gap_boolean.solver = "EXACT"
    gap_boolean.object = gap

    glass = rounded_box(
        f"{prefix}_DeepSmokedDormantGlassPanel",
        (radius_x * 2.45, 0.028, radius_z * 2.45),
        (center_x, glass_y, center_z),
        min(radius_x, radius_z) * 0.10,
        mats["glass"],
        destination,
    )
    glass["dormant_state"] = "deep smoked black; zero emission"
    glass["aperture_relation"] = "recessed behind physically interrupted shell"


def cut_shared_aperture(
    prefix: str,
    shells: Sequence[bpy.types.Object],
    center_x: float,
    center_z: float,
    radius_x: float,
    radius_z: float,
    shell_depth: float,
    gap_center: Sequence[float],
    gap_dims: Sequence[float],
    gap_rotation_z: float,
    glass_y: float,
    mats: dict[str, bpy.types.Material],
    destination: bpy.types.Collection,
) -> None:
    """Carve one interrupted void jointly from two interlocking masses."""
    cutter = ellipse_cutter(
        f"{prefix}_SharedApertureEllipseCutter",
        (center_x, 0.0, center_z),
        radius_x,
        radius_z,
        shell_depth * 2.8,
        destination,
    )
    bpy.ops.mesh.primitive_cube_add(location=gap_center, rotation=(0.0, 0.0, gap_rotation_z))
    gap = bpy.context.object
    gap.name = f"{prefix}_SharedLowerRightInterruptionCutter"
    gap.dimensions = gap_dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    move(gap, destination)
    gap.display_type = "WIRE"
    gap.hide_render = True
    gap["role"] = "shared lower-right interruption across interlocking masses"
    for index, shell in enumerate(shells, 1):
        boolean = shell.modifiers.new(f"Shared aperture cut {index}", "BOOLEAN")
        boolean.operation = "DIFFERENCE"
        boolean.solver = "EXACT"
        boolean.object = cutter
        gap_boolean = shell.modifiers.new(f"Shared lower-right interruption {index}", "BOOLEAN")
        gap_boolean.operation = "DIFFERENCE"
        gap_boolean.solver = "EXACT"
        gap_boolean.object = gap
    glass = rounded_box(
        f"{prefix}_DeepSmokedDormantGlassPanel",
        (radius_x * 2.45, 0.028, radius_z * 2.45),
        (center_x, glass_y, center_z),
        min(radius_x, radius_z) * 0.10,
        mats["glass"],
        destination,
    )
    glass["dormant_state"] = "deep smoked black; zero emission"
    glass["aperture_relation"] = "recessed behind void shared by two masses"


def curve_path(
    name: str,
    points: Iterable[Sequence[float]],
    bevel_depth: float,
    mat: bpy.types.Material,
    destination: bpy.types.Collection,
    resolution: int = 4,
) -> bpy.types.Object:
    pts = list(points)
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = resolution
    curve.bevel_resolution = 4
    curve.bevel_depth = bevel_depth
    spline = curve.splines.new("NURBS")
    spline.points.add(len(pts) - 1)
    for point, co in zip(spline.points, pts):
        point.co = (*co, 1.0)
    spline.order_u = min(3, len(pts))
    spline.use_endpoint_u = True
    obj = bpy.data.objects.new(name, curve)
    destination.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def partial_ellipse(
    name: str,
    center_x: float,
    front_y: float,
    center_z: float,
    radius_x: float,
    radius_z: float,
    mat: bpy.types.Material,
    destination: bpy.types.Collection,
) -> bpy.types.Object:
    # A broad 120-degree lower-right interruption prevents a ring/Q/logo read.
    angles = [math.radians(35.0 + index * (240.0 / 64.0)) for index in range(65)]
    points = [
        (
            center_x + radius_x * math.cos(angle),
            front_y,
            center_z + radius_z * math.sin(angle),
        )
        for angle in angles
    ]
    obj = curve_path(name, points, 0.012, mat, destination, resolution=2)
    obj["aperture_form"] = "incomplete ellipse with lower-right interruption"
    return obj


def cable_to_foundation(
    prefix: str,
    port: Sequence[float],
    approach: Sequence[Sequence[float]],
    mats: dict[str, bpy.types.Material],
    destination: bpy.types.Collection,
) -> None:
    points = [*approach, (port[0], port[1] - 0.016, port[2])]
    cable = curve_path(f"{prefix}_DormantPhysicalCable", points, 0.022, mats["cable"], destination)
    cable["dormant_state"] = "graphite sheath; zero emission"
    rounded_box(
        f"{prefix}_RecessedFoundationEntry",
        (0.18, 0.022, 0.060),
        port,
        0.010,
        mats["cavity"],
        destination,
    )["role"] = "recessed conductor entry; not an external plug"


def cable_under_foundation(
    prefix: str,
    points: Sequence[Sequence[float]],
    mats: dict[str, bpy.types.Material],
    destination: bpy.types.Collection,
) -> None:
    cable = curve_path(f"{prefix}_DormantBuriedEntryCable", points, 0.020, mats["cable"], destination)
    cable["dormant_state"] = "graphite sheath; zero emission"
    cable["entry"] = "disappears beneath rear or side foundation; no exposed plug"


def option_a(destination: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    buried_foundation("A", (1.82, 0.70, 0.27), 0.02, mats, destination)
    blade_profile = (
        (-0.83, 0.015), (-0.80, 0.38), (-0.66, 1.08), (-0.42, 1.25),
        (0.08, 1.20), (0.50, 1.03), (0.68, 0.66), (0.57, 0.24),
        (0.34, 0.075), (-0.18, 0.015),
    )
    blade = profile_prism("A_AsymmetricInclinedOpticalBlade", blade_profile, 0.48, mats["body"], destination, 0.052, -0.07)
    spine_profile = (
        (0.32, 0.015), (0.72, 0.015), (0.78, 0.75), (0.63, 1.02),
        (0.47, 0.92), (0.39, 0.48),
    )
    spine = profile_prism("A_LoadBearingServiceSpine", spine_profile, 0.70, mats["secondary"], destination, 0.050, 0.10)
    spine["load_path"] = "interlocks blade and transfers optical mass into buried foundation"
    cut_offset_aperture_with_wedge(
        "A", blade, -0.32, 0.72, 0.36, 0.225, 0.48,
        ((-0.08, 0.61), (0.64, 0.39), (0.67, 0.20), (-0.13, 0.51)),
        (0.94, 0.028, 0.67), (-0.29, -0.19, 0.69), mats, destination,
    )
    cable_under_foundation("A", ((1.46, 0.96, 0.012), (1.08, 0.68, 0.008), (0.76, 0.45, -0.004), (0.54, 0.29, -0.045)), mats, destination)


def option_b(destination: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    buried_foundation("B", (1.90, 0.80, 0.28), -0.01, mats, destination)
    center_x, center_z, radius_x, radius_z = -0.06, 0.58, 0.40, 0.265
    left_inner = [
        (center_x + radius_x * math.cos(math.radians(angle)), center_z + radius_z * math.sin(math.radians(angle)))
        for angle in range(92, 271, 18)
    ]
    left_profile = [(-0.94, 0.02), (-0.91, 0.74), (-0.72, 1.00), (-0.30, 0.96), *left_inner, (-0.22, 0.02)]
    left = profile_prism("B_InterlockingCalibrationMass", left_profile, 0.65, mats["body"], destination, 0.050, -0.03)
    right_inner = [
        (center_x + radius_x * math.cos(math.radians(angle)), center_z + radius_z * math.sin(math.radians(angle)))
        for angle in range(90, -31, -15)
    ]
    right_profile = [(0.18, 0.02), (0.94, 0.02), (0.92, 0.72), (0.74, 1.09), (0.36, 1.16), *right_inner, (0.40, 0.16)]
    right = profile_prism("B_InterlockingServiceMass", right_profile, 0.79, mats["secondary"], destination, 0.052, 0.07)
    left["aperture_logic"] = "left half of shared elliptical negative space"
    right["aperture_logic"] = "upper-right half with open lower-right release"
    recessed_glass_panel("B", (1.05, 0.026, 0.78), (-0.05, -0.09, 0.58), mats, destination)
    cable_under_foundation("B", ((-1.52, 0.98, 0.012), (-1.10, 0.71, 0.005), (-0.78, 0.47, -0.009), (-0.56, 0.31, -0.048)), mats, destination)


def option_c(destination: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    buried_foundation("C", (1.76, 0.76, 0.29), 0.03, mats, destination)
    aperture_center_x, aperture_center_z = 0.22, 0.64
    inner_upper = [
        (aperture_center_x + 0.40 * math.cos(math.radians(angle)), aperture_center_z + 0.24 * math.sin(math.radians(angle)))
        for angle in range(18, 171, 17)
    ]
    upper_profile = [
        (-0.78, 0.02), (-0.77, 0.86), (-0.56, 1.09), (-0.14, 1.22),
        (0.67, 1.12), (0.88, 0.90), (0.83, 0.67), *inner_upper, (-0.27, 0.19),
    ]
    upper = profile_prism("C_IntegratedPylonCantilever", upper_profile, 0.70, mats["body"], destination, 0.052, 0.02)
    upper["load_path"] = "pylon and cantilever are one continuous structural extrusion"
    lower_profile = ((-0.30, 0.02), (0.67, 0.02), (0.73, 0.24), (0.56, 0.39), (0.17, 0.37), (-0.17, 0.17))
    lower = profile_prism("C_IntegratedLowerServiceButtress", lower_profile, 0.62, mats["secondary"], destination, 0.045, 0.08)
    lower["load_path"] = "grounded buttress intersects rear pylon; no floating pad"
    recessed_glass_panel("C", (1.08, 0.026, 0.74), (0.20, -0.11, 0.61), mats, destination)
    cable_under_foundation("C", ((-1.43, 1.04, 0.010), (-1.07, 0.77, 0.003), (-0.78, 0.51, -0.012), (-0.57, 0.33, -0.050)), mats, destination)


def point_at(obj: bpy.types.Object, target: Sequence[float]) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def camera(name: str, spec: dict, destination: bpy.types.Collection) -> bpy.types.Object:
    data = bpy.data.cameras.new(name)
    data.type = "ORTHO"
    data.ortho_scale = spec["ortho_scale"]
    obj = bpy.data.objects.new(name, data)
    obj.location = spec["location"]
    point_at(obj, spec["target"])
    destination.objects.link(obj)
    return obj


def area_light(name: str, location: Sequence[float], energy: float, color: Sequence[float], size: float, target: Sequence[float], destination: bpy.types.Collection) -> None:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.color = color
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    point_at(obj, target)
    destination.objects.link(obj)


def build() -> None:
    args = cli_args()
    clear_scene()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = cfg.BLOCKOUT_RESOLUTION
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 45
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.world.use_nodes = True
    world = scene.world.node_tree.nodes.get("Background")
    world.inputs["Color"].default_value = (0.004, 0.006, 0.007, 1.0)
    world.inputs["Strength"].default_value = 0.20

    root = new_collection("PHASE_0_3_APERTURE_STATION_BLOCKOUTS", scene)
    studio = new_collection("STUDIO", root)
    options = {
        key: new_collection(f"OPTION_{key}_{spec['name'].replace(' ', '_')}", root)
        for key, spec in cfg.OPTIONS.items()
    }
    cameras = new_collection("CAMERAS", root)

    mats = {
        "body": material("Blockout_Blade_Graphite", (0.050, 0.062, 0.066), 0.38, 0.50),
        "secondary": material("Blockout_Service_Charcoal", (0.024, 0.030, 0.032), 0.48, 0.34),
        "foundation": material("Blockout_Anchored_Foundation", (0.012, 0.016, 0.017), 0.58, 0.24),
        "edge": material("Blockout_Recess_Edge", (0.030, 0.037, 0.039), 0.50, 0.26),
        "glass": material("Blockout_Optically_Black_Glass", (0.0001, 0.0001, 0.0001), 0.82, 0.0),
        "cavity": material("Blockout_Recess_Cavity", (0.004, 0.005, 0.005), 0.28, 0.20),
        "cable": material("Blockout_Dormant_Graphite_Cable", (0.018, 0.021, 0.022), 0.62, 0.12),
        "ground": material("Neutral_Review_Ground", (0.016, 0.020, 0.021), 0.66, 0.10),
    }
    glass_shader = mats["glass"].node_tree.nodes.get("Principled BSDF")
    if glass_shader and "IOR Level" in glass_shader.inputs:
        glass_shader.inputs["IOR Level"].default_value = 0.0

    option_a(options["A"], mats)
    option_b(options["B"], mats)
    option_c(options["C"], mats)

    rounded_box("ReviewGround", (9.0, 9.0, 0.08), (0.0, 0.0, -0.04), 0.015, mats["ground"], studio)
    rounded_box("ReviewRear", (9.0, 0.08, 4.5), (0.0, 2.6, 2.0), 0.02, mats["ground"], studio)
    area_light("NeutralKey", (-3.7, -4.3, 5.4), 700.0, (0.78, 0.84, 0.85), 3.4, (0.0, 0.0, 0.65), studio)
    area_light("NeutralEdge", (4.0, 1.6, 3.1), 560.0, (0.70, 0.79, 0.81), 2.6, (0.0, 0.0, 0.68), studio)
    area_light("NeutralFill", (0.0, -3.0, 1.7), 260.0, (0.62, 0.67, 0.68), 3.5, (0.0, 0.0, 0.58), studio)

    for view, spec in cfg.VIEWS.items():
        camera(f"Camera_Blockout_{view.replace('-', '_').title()}", spec, cameras)

    scene.camera = bpy.data.objects["Camera_Blockout_Three_Quarter"]
    scene["phase"] = "Phase 0.3 ground-anchored aperture station silhouette gate"
    scene["recommendation_pending_gate"] = cfg.RECOMMENDED_OPTION
    scene["external_assets"] = False
    scene["linked_libraries"] = False
    scene["reference_binaries"] = False
    scene["dormant_emission"] = 0.0
    scene["aperture_rule"] = "incomplete elliptical recess; lower-right interruption; never a complete ring or logo"

    args.output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output.resolve()), compress=True, relative_remap=True, copy=True)
    print(f"QH_V3_BLOCKOUT_SOURCE={args.output.resolve()}")
    print(f"QH_V3_BLOCKOUT_OBJECTS={len(bpy.data.objects)}")


if __name__ == "__main__":
    build()
