"""Build three original Integrated Aperture Chassis silhouette blockouts.

Run with the verified portable Blender executable. No external assets, add-ons,
textures, images, fonts, or linked libraries are used.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path
from typing import Sequence

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


def material(name: str, color: Sequence[float], roughness: float, metallic: float = 0.0) -> bpy.types.Material:
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1.0)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return result


def bevel(obj: bpy.types.Object, width: float, segments: int = 6) -> None:
    modifier = obj.modifiers.new("Industrial edge radius", "BEVEL")
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


def cylinder(name: str, radius: float, depth: float, loc: Sequence[float], mat: bpy.types.Material, destination: bpy.types.Collection, rotation=(math.radians(90), 0.0, 0.0), vertices: int = 128, edge: float = 0.0) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    if edge:
        bevel(obj, edge, 4)
    obj.data.materials.append(mat)
    return move(obj, destination)


def aperture_body(name: str, dims: Sequence[float], loc: Sequence[float], aperture: tuple[float, float, float], mat: bpy.types.Material, cavity: bpy.types.Material, glass: bpy.types.Material, destination: bpy.types.Collection, edge: float = 0.22) -> bpy.types.Object:
    """Create an editable chassis with a physically recessed circular cavity."""
    x, z, radius = aperture
    bpy.ops.mesh.primitive_cube_add(location=loc)
    body = bpy.context.object
    body.name = name
    body.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    body.data.materials.append(mat)
    move(body, destination)

    front_y = loc[1] - dims[1] / 2
    cutter = cylinder(
        f"{name}_ApertureCutter",
        radius,
        dims[1] * 0.74,
        (x, front_y - dims[1] * 0.08, z),
        cavity,
        destination,
        edge=0.0,
    )
    cutter.display_type = "WIRE"
    cutter.hide_render = True
    cutter["role"] = "editable recessed aperture boolean cutter"
    boolean = body.modifiers.new("Integrated recessed aperture", "BOOLEAN")
    boolean.operation = "DIFFERENCE"
    boolean.solver = "EXACT"
    boolean.object = cutter
    bevel(body, edge, 8)

    # A dark cavity barrel and optically black glass sit behind the physical cut.
    cavity_depth = dims[1] * 0.28
    cylinder(
        f"{name}_CavityWall",
        radius * 0.985,
        cavity_depth,
        (x, front_y + cavity_depth * 0.70, z),
        cavity,
        destination,
        edge=0.035,
    )
    cylinder(
        f"{name}_DormantOpticalGlass",
        radius * 0.81,
        0.055,
        (x, front_y + cavity_depth * 0.89, z),
        glass,
        destination,
        edge=0.02,
    )["dormant_state"] = "optically black; zero emission"
    return body


def create_option_a(destination: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    rounded_box("A_UndersideDatum", (6.35, 2.82, 0.24), (0.0, 0.04, 0.25), 0.09, mats["base"], destination)
    aperture_body(
        "A_ContinuousOpticalChassis",
        (5.95, 2.42, 1.46),
        (-0.05, 0.0, 1.05),
        (-0.76, 1.09, 0.72),
        mats["body"],
        mats["cavity"],
        mats["glass"],
        destination,
        0.24,
    )
    # One integrated asymmetric shoulder, not a bumper or attached handle.
    rounded_box("A_RightCalibrationShoulder", (2.02, 2.56, 0.48), (1.82, -0.01, 0.57), 0.15, mats["secondary"], destination, rotation=(0.0, math.radians(-4.0), 0.0))
    rounded_box("A_RearServiceSpine", (4.65, 0.34, 0.22), (0.44, 1.08, 1.50), 0.07, mats["detail"], destination)
    rounded_box("A_FrontConductorDock", (0.68, 0.30, 0.30), (-1.42, -1.26, 0.48), 0.07, mats["detail"], destination, rotation=(0.0, 0.0, math.radians(-12.0)))


def create_option_b(destination: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    rounded_box("B_UndersideDatum", (6.45, 2.88, 0.26), (0.0, 0.0, 0.25), 0.09, mats["base"], destination)
    rounded_box("B_LowInstrumentBed", (6.08, 2.54, 0.70), (0.0, 0.04, 0.59), 0.20, mats["secondary"], destination)
    # The drum is embedded below its equator and captured by a continuous hood.
    cylinder("B_EmbeddedCalibrationDrum", 0.96, 2.18, (-0.64, -0.02, 1.12), mats["body"], destination, edge=0.06)
    cylinder("B_DeepDrumCavity", 0.73, 0.30, (-0.64, -1.20, 1.12), mats["cavity"], destination, edge=0.04)
    cylinder("B_DormantOpticalGlass", 0.60, 0.055, (-0.64, -1.37, 1.12), mats["glass"], destination, edge=0.02)["dormant_state"] = "optically black; zero emission"
    rounded_box("B_CaptureHood", (3.65, 2.42, 0.50), (-0.72, 0.04, 1.47), 0.18, mats["body"], destination)
    rounded_box("B_RightControlMass", (2.28, 2.48, 0.94), (1.77, 0.03, 0.85), 0.22, mats["body"], destination)
    rounded_box("B_RearCalibrationRail", (5.22, 0.34, 0.20), (0.27, 1.11, 1.28), 0.06, mats["detail"], destination)


def create_option_c(destination: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    rounded_box("C_UndersideDatum", (6.42, 2.90, 0.24), (0.0, 0.0, 0.24), 0.09, mats["base"], destination)
    aperture = (-0.40, 1.05, 0.70)
    aperture_body("C_LeftUpperShell", (3.62, 2.42, 1.34), (-1.20, 0.06, 1.08), aperture, mats["body"], mats["cavity"], mats["glass"], destination, 0.24)
    aperture_body("C_RightLowerShell", (3.45, 2.55, 0.93), (1.35, -0.03, 0.77), aperture, mats["secondary"], mats["cavity"], mats["glass"], destination, 0.20)
    rounded_box("C_DiagonalDatum", (3.35, 0.24, 0.15), (0.94, -1.30, 1.23), 0.05, mats["detail"], destination, rotation=(0.0, 0.0, math.radians(-9.0)))
    rounded_box("C_RearSplitSpine", (4.40, 0.34, 0.20), (0.55, 1.16, 1.40), 0.06, mats["detail"], destination, rotation=(0.0, 0.0, math.radians(-4.0)))


def point_camera(camera: bpy.types.Object, target: Sequence[float]) -> None:
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()


def camera(name: str, spec: dict, destination: bpy.types.Collection) -> bpy.types.Object:
    data = bpy.data.cameras.new(name)
    data.type = "ORTHO"
    data.ortho_scale = spec["ortho_scale"]
    data.sensor_width = 36.0
    data.dof.use_dof = False
    obj = bpy.data.objects.new(name, data)
    obj.location = spec["location"]
    point_camera(obj, spec["target"])
    destination.objects.link(obj)
    return obj


def area_light(name: str, loc: Sequence[float], energy: float, color: Sequence[float], size: float, target: Sequence[float], destination: bpy.types.Collection) -> None:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.color = color
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    point_camera(obj, target)
    destination.objects.link(obj)


def build() -> None:
    args = cli_args()
    clear_scene()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.resolution_x, scene.render.resolution_y = cfg.BLOCKOUT_RESOLUTION
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 45
    scene.render.use_file_extension = True
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.world.color = (0.004, 0.005, 0.006)
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.005, 0.007, 0.008, 1.0)
    background.inputs["Strength"].default_value = 0.18
    scene.view_settings.look = "AgX - Medium High Contrast"

    root = new_collection("BLOCKOUT_ROOT", scene)
    studio = new_collection("STUDIO", root)
    options = {key: new_collection(f"OPTION_{key}_{cfg.BLOCKOUT_OPTIONS[key]['name'].replace(' ', '_')}", root) for key in cfg.BLOCKOUT_OPTIONS}
    cameras = new_collection("CAMERAS", root)

    mats = {
        "body": material("Blockout_Chassis_Graphite", (0.12, 0.145, 0.15), 0.34, 0.58),
        "secondary": material("Blockout_Secondary_Charcoal", (0.07, 0.086, 0.091), 0.43, 0.40),
        "base": material("Blockout_Underside", (0.025, 0.031, 0.033), 0.50, 0.35),
        "detail": material("Blockout_Precision_Edge", (0.30, 0.35, 0.36), 0.25, 0.72),
        "cavity": material("Blockout_Optical_Cavity", (0.003, 0.004, 0.004), 0.24, 0.25),
        "glass": material("Blockout_Optically_Black_Glass", (0.001, 0.002, 0.002), 0.08, 0.20),
        "ground": material("Studio_Ground", (0.018, 0.023, 0.024), 0.62, 0.12),
    }
    create_option_a(options["A"], mats)
    create_option_b(options["B"], mats)
    create_option_c(options["C"], mats)

    rounded_box("StudioGround", (18.0, 18.0, 0.12), (0.0, 0.0, -0.06), 0.02, mats["ground"], studio)
    rounded_box("StudioRear", (18.0, 0.12, 8.0), (0.0, 4.1, 3.6), 0.03, mats["ground"], studio)
    area_light("Key_Softbox", (-5.4, -5.0, 7.0), 940.0, (0.78, 0.86, 0.88), 4.0, (0.0, 0.0, 0.8), studio)
    area_light("Edge_Softbox", (5.7, 2.2, 4.3), 720.0, (0.72, 0.82, 0.85), 3.0, (0.0, 0.0, 1.0), studio)
    area_light("Front_Fill", (0.0, -4.8, 2.4), 360.0, (0.62, 0.68, 0.70), 4.5, (0.0, 0.0, 0.8), studio)

    for view, spec in cfg.BLOCKOUT_VIEWS.items():
        camera(f"Camera_Blockout_{view.replace('-', '_').title()}", spec, cameras)

    scene.camera = bpy.data.objects["Camera_Blockout_Three_Quarter"]
    scene["phase"] = "Phase 0.2 silhouette comparison"
    scene["selected_after_review"] = cfg.SELECTED_OPTION
    scene["external_assets"] = False
    scene["reference_binaries"] = False
    scene["emission_at_dormant"] = 0.0
    scene["blockout_options"] = "A recessed optical chassis; B calibration drum; C split-shell instrument"

    args.output.parent.mkdir(parents=True, exist_ok=True)
    # Save as a copy from the factory-startup session so the portable source
    # does not persist the operator's private absolute workspace path.
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output.resolve()), compress=True, relative_remap=True, copy=True)
    print(f"QH_V2_BLOCKOUT_SOURCE={args.output.resolve()}")
    print(f"QH_V2_BLOCKOUT_OBJECTS={len(bpy.data.objects)}")


if __name__ == "__main__":
    build()
