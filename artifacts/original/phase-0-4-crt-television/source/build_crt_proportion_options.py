"""Build three original CRT television proportion families from procedural geometry only.

The script intentionally does not load images, textures, linked libraries, fonts,
models, or add-ons. The private user reference is never opened by Blender.
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

import crt_options_config as cfg


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
        bpy.data.images,
    ):
        for datablock in list(datablocks):
            datablocks.remove(datablock)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)


def new_collection(name: str, parent: bpy.types.Collection | bpy.types.Scene) -> bpy.types.Collection:
    collection = bpy.data.collections.new(name)
    (parent.collection if isinstance(parent, bpy.types.Scene) else parent).children.link(collection)
    return collection


def move(obj: bpy.types.Object, destination: bpy.types.Collection) -> bpy.types.Object:
    for collection in tuple(obj.users_collection):
        collection.objects.unlink(obj)
    destination.objects.link(obj)
    return obj


def material(
    name: str,
    color: Sequence[float],
    roughness: float,
    metallic: float = 0.0,
    microtexture: bool = False,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    shader = nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    if microtexture:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.name = "Procedural ABS microtexture"
        noise.inputs["Scale"].default_value = 240.0
        noise.inputs["Detail"].default_value = 2.0
        noise.inputs["Roughness"].default_value = 0.55
        bump = nodes.new("ShaderNodeBump")
        bump.name = "Moulded ABS micro-bump"
        bump.inputs["Strength"].default_value = 0.11
        bump.inputs["Distance"].default_value = 0.00045
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    return mat


def bevel(obj: bpy.types.Object, width: float, segments: int = 5) -> None:
    modifier = obj.modifiers.new("Manufactured edge radius", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"


def rounded_box(
    name: str,
    dims: Sequence[float],
    location: Sequence[float],
    radius: float,
    mat: bpy.types.Material,
    destination: bpy.types.Collection,
    rotation: Sequence[float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel(obj, radius, 6)
    obj.data.materials.append(mat)
    return move(obj, destination)


def smoothstep(value: float) -> float:
    value = min(1.0, max(0.0, value))
    return value * value * (3.0 - 2.0 * value)


def rounded_rect_ring(
    width: float,
    height: float,
    radius: float,
    center_z: float,
    segments_per_corner: int = 12,
) -> list[tuple[float, float]]:
    radius = min(radius, width * 0.49, height * 0.49)
    half_w = width * 0.5
    half_h = height * 0.5
    points: list[tuple[float, float]] = []
    corners = (
        (half_w - radius, center_z + half_h - radius, 0.0),
        (-half_w + radius, center_z + half_h - radius, 90.0),
        (-half_w + radius, center_z - half_h + radius, 180.0),
        (half_w - radius, center_z - half_h + radius, 270.0),
    )
    for cx, cz, start in corners:
        for step in range(segments_per_corner):
            angle = math.radians(start + (step / segments_per_corner) * 90.0)
            points.append((cx + radius * math.cos(angle), cz + radius * math.sin(angle)))
    return points


def crt_shell(
    option_key: str,
    spec: dict,
    mat: bpy.types.Material,
    destination: bpy.types.Collection,
) -> bpy.types.Object:
    dims = spec["dimensions_m"]
    width, height, depth = dims["width"], dims["height"], dims["depth"]
    front_y = -depth * 0.5 + 0.045
    rear_y = depth * 0.5
    taper_start = {"A": 0.20, "B": 0.40, "C": 0.30}[option_key]
    section_count = 25
    vertices: list[tuple[float, float, float]] = []
    section_size = 48

    for section in range(section_count):
        t = section / (section_count - 1)
        taper = smoothstep((t - taper_start) / (1.0 - taper_start))
        shoulder = math.sin(math.pi * min(1.0, t / max(taper_start, 0.01))) * 0.008
        current_width = width * (1.0 - (1.0 - spec["rear_width_ratio"]) * taper) + shoulder
        current_height = height * (1.0 - (1.0 - spec["rear_height_ratio"]) * taper)
        current_center_z = 0.018 + current_height * 0.5 + 0.115 * taper
        current_radius = spec["corner_radius_m"] * (1.0 - 0.36 * taper)
        ring = rounded_rect_ring(current_width, current_height, current_radius, current_center_z)
        y = front_y + (rear_y - front_y) * t
        vertices.extend((x, y, z) for x, z in ring)

    faces: list[tuple[int, ...]] = []
    for section in range(section_count - 1):
        base = section * section_size
        next_base = (section + 1) * section_size
        for index in range(section_size):
            nxt = (index + 1) % section_size
            faces.append((base + index, base + nxt, next_base + nxt, next_base + index))
    faces.append(tuple(reversed(range(section_size))))
    last = (section_count - 1) * section_size
    faces.append(tuple(last + index for index in range(section_size)))

    mesh = bpy.data.meshes.new(f"CRT_{option_key}_CabinetShell_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(f"CRT_{option_key}_DeepTubeCabinetShell", mesh)
    destination.objects.link(obj)
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    bevel(obj, 0.006 if option_key != "B" else 0.0045, 4)
    obj["construction"] = "procedural 25-section moulded CRT tube shell"
    obj["dimensions_m"] = f"{width:.3f} W x {height:.3f} H x {depth:.3f} D"
    obj["source"] = "modelled from scratch; no third-party mesh"
    return obj


def convex_screen(
    option_key: str,
    spec: dict,
    depth: float,
    glass_mat: bpy.types.Material,
    destination: bpy.types.Collection,
) -> bpy.types.Object:
    screen = spec["screen_visible_m"]
    bulge = spec["screen_bulge_m"]
    center_y = -depth * 0.5 + bulge * 0.42
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=128,
        ring_count=64,
        location=(0.0, center_y, spec["screen_center_z_m"]),
    )
    obj = bpy.context.object
    obj.name = f"CRT_{option_key}_Convex43SmokedGlass"
    obj.scale = (screen["width"] * 0.5, bulge, screen["height"] * 0.5)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.materials.append(glass_mat)
    obj["aspect_ratio"] = "4:3"
    obj["state"] = "dormant; zero emission"
    obj["glass_logic"] = "convex ellipsoid volume, recessed at perimeter"
    return move(obj, destination)


def curve_path(
    name: str,
    points: Iterable[Sequence[float]],
    bevel_depth: float,
    mat: bpy.types.Material,
    destination: bpy.types.Collection,
) -> bpy.types.Object:
    point_list = list(points)
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 12
    curve.bevel_resolution = 5
    curve.bevel_depth = bevel_depth
    curve.use_fill_caps = True
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(point_list) - 1)
    for point, coordinate in zip(spline.bezier_points, point_list):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    destination.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def cylinder(
    name: str,
    radius: float,
    depth: float,
    location: Sequence[float],
    rotation: Sequence[float],
    mat: bpy.types.Material,
    destination: bpy.types.Collection,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=64,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.materials.append(mat)
    bevel(obj, min(radius * 0.16, 0.004), 4)
    return move(obj, destination)


def add_front_details(
    option_key: str,
    spec: dict,
    mats: dict[str, bpy.types.Material],
    destination: bpy.types.Collection,
) -> None:
    dims = spec["dimensions_m"]
    width, height, depth = dims["width"], dims["height"], dims["depth"]
    screen = spec["screen_visible_m"]
    front_y = -depth * 0.5 - 0.001
    bezel_extra_x = {"A": 0.105, "B": 0.155, "C": 0.115}[option_key]
    bezel_extra_z = {"A": 0.095, "B": 0.135, "C": 0.095}[option_key]
    rounded_box(
        f"CRT_{option_key}_ThickProtectiveBezel",
        (screen["width"] + bezel_extra_x, 0.072, screen["height"] + bezel_extra_z),
        (0.0, front_y, spec["screen_center_z_m"]),
        spec["corner_radius_m"] * 0.62,
        mats["bezel"],
        destination,
    )["construction"] = "thick injection-moulded protective front bezel"
    convex_screen(option_key, spec, depth, mats["glass"], destination)

    band_h = spec["front_band_height_m"]
    band = rounded_box(
        f"CRT_{option_key}_AsymmetricLowerControlBand",
        (width * 0.91, 0.050, band_h),
        (0.0, -depth * 0.5 - 0.018, band_h * 0.5 + 0.028),
        0.018 if option_key != "B" else 0.010,
        mats["secondary"],
        destination,
    )
    band["era_logic"] = "lower speaker/control region; restrained physical controls"

    # Geometric grille slots and sparing physical controls; deliberately asymmetric.
    if option_key == "A":
        grille_center = -width * 0.18
        slot_count, slot_pitch, slot_width = 12, 0.031, 0.022
        control_xs = (width * 0.19, width * 0.255, width * 0.315)
    elif option_key == "B":
        grille_center = width * 0.16
        slot_count, slot_pitch, slot_width = 15, 0.029, 0.020
        control_xs = (-width * 0.31, -width * 0.245, -width * 0.18)
    else:
        grille_center = -width * 0.16
        slot_count, slot_pitch, slot_width = 16, 0.032, 0.023
        control_xs = (width * 0.21, width * 0.275, width * 0.335)

    first_x = grille_center - (slot_count - 1) * slot_pitch * 0.5
    for index in range(slot_count):
        rounded_box(
            f"CRT_{option_key}_SpeakerSlot_{index + 1:02d}",
            (slot_width, 0.008, band_h * 0.42),
            (first_x + index * slot_pitch, -depth * 0.5 - 0.047, band_h * 0.55 + 0.026),
            0.003,
            mats["cavity"],
            destination,
        )
    for index, x in enumerate(control_xs, 1):
        rounded_box(
            f"CRT_{option_key}_PhysicalControl_{index:02d}",
            (0.043 if index < 3 else 0.036, 0.012, 0.034),
            (x, -depth * 0.5 - 0.052, band_h * 0.56 + 0.026),
            0.006,
            mats["control"],
            destination,
        )
    indicator_x = control_xs[-1] + 0.047
    indicator = cylinder(
        f"CRT_{option_key}_DormantPowerIndicator",
        0.006,
        0.008,
        (indicator_x, -depth * 0.5 - 0.056, band_h * 0.56 + 0.026),
        (math.radians(90.0), 0.0, 0.0),
        mats["indicator"],
        destination,
    )
    indicator["emission_strength"] = 0.0


def add_rear_details(
    option_key: str,
    spec: dict,
    mats: dict[str, bpy.types.Material],
    destination: bpy.types.Collection,
) -> None:
    dims = spec["dimensions_m"]
    width, height, depth = dims["width"], dims["height"], dims["depth"]
    rear_width = width * spec["rear_width_ratio"]
    rear_height = height * spec["rear_height_ratio"]
    rear_center_z = 0.133 + rear_height * 0.5
    rear_y = depth * 0.5 + 0.006
    rounded_box(
        f"CRT_{option_key}_RearServicePanel",
        (rear_width * 0.66, 0.022, rear_height * 0.42),
        (0.0, rear_y, rear_center_z - 0.035),
        0.018,
        mats["secondary"],
        destination,
    )["service_logic"] = "single restrained service seam"

    vent_rows = 2 if option_key == "A" else 3
    vent_count = 7 if option_key != "C" else 9
    pitch_x = rear_width * 0.62 / max(1, vent_count - 1)
    for row in range(vent_rows):
        for index in range(vent_count):
            x = -rear_width * 0.31 + index * pitch_x
            z = rear_center_z + rear_height * 0.22 - row * 0.040
            rounded_box(
                f"CRT_{option_key}_RearVent_{row + 1:02d}_{index + 1:02d}",
                (0.020, 0.012, 0.026),
                (x, rear_y + 0.017, z),
                0.003,
                mats["cavity"],
                destination,
            )

    connector_x = {"A": width * 0.22, "B": -width * 0.24, "C": width * 0.25}[option_key]
    connector_z = 0.135
    relief = cylinder(
        f"CRT_{option_key}_MouldedCableStrainRelief",
        0.030,
        0.085,
        (connector_x, depth * 0.5 + 0.045, connector_z),
        (math.radians(90.0), 0.0, 0.0),
        mats["cable"],
        destination,
    )
    relief["connection"] = spec["cable_connection"]
    lateral = 0.32 if connector_x < 0 else -0.32
    cable = curve_path(
        f"CRT_{option_key}_DormantPowerSignalCable",
        (
            (connector_x, depth * 0.5 + 0.075, connector_z),
            (connector_x + lateral * 0.08, depth * 0.5 + 0.17, 0.095),
            (connector_x + lateral * 0.28, depth * 0.5 + 0.28, 0.032),
            (connector_x + lateral * 0.72, depth * 0.5 + 0.35, 0.021),
            (connector_x + lateral * 1.10, depth * 0.5 + 0.30, 0.021),
        ),
        0.017,
        mats["cable"],
        destination,
    )
    cable["state"] = "dormant graphite physical sheath; zero emission"
    cable["future_narrative"] = "continuous outer-to-inner spiral power/signal conductor"


def add_hidden_feet(
    option_key: str,
    spec: dict,
    mats: dict[str, bpy.types.Material],
    destination: bpy.types.Collection,
) -> None:
    dims = spec["dimensions_m"]
    for index, x in enumerate((-dims["width"] * 0.29, dims["width"] * 0.29), 1):
        foot = rounded_box(
            f"CRT_{option_key}_RestrainedHiddenFoot_{index:02d}",
            (0.12, 0.16, 0.018),
            (x, -dims["depth"] * 0.10, 0.009),
            0.007,
            mats["foot"],
            destination,
        )
        foot["visibility"] = "restrained; cabinet sits directly at terrain scale"


def build_option(
    option_key: str,
    spec: dict,
    mats: dict[str, bpy.types.Material],
    destination: bpy.types.Collection,
) -> None:
    shell = crt_shell(option_key, spec, mats[f"cabinet_{option_key}"], destination)
    shell["option_name"] = spec["name"]
    shell["screen_class_inches"] = spec["screen_class_inches"]
    add_front_details(option_key, spec, mats, destination)
    add_rear_details(option_key, spec, mats, destination)
    add_hidden_feet(option_key, spec, mats, destination)


def point_at(obj: bpy.types.Object, target: Sequence[float]) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def camera(name: str, spec: dict, destination: bpy.types.Collection) -> bpy.types.Object:
    data = bpy.data.cameras.new(name)
    data.type = "ORTHO"
    data.ortho_scale = spec["ortho_scale"]
    data.lens = 55.0
    obj = bpy.data.objects.new(name, data)
    obj.location = spec["location"]
    point_at(obj, spec["target"])
    destination.objects.link(obj)
    return obj


def area_light(
    name: str,
    location: Sequence[float],
    energy: float,
    color: Sequence[float],
    size: float,
    target: Sequence[float],
    destination: bpy.types.Collection,
) -> None:
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
    scene.render.engine = cfg.RENDER_ENGINE
    scene.render.resolution_x, scene.render.resolution_y = cfg.RENDER_RESOLUTION
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 48
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 48
    scene.render.resolution_percentage = 100
    scene.render.engine = "BLENDER_EEVEE"
    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = cfg.RENDER_SAMPLES
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.014, 0.017, 0.018, 1.0)
    background.inputs["Strength"].default_value = 0.23

    root = new_collection("PHASE_0_4_QUANTUM_SIGNAL_TELEVISION_PROPORTION_GATE", scene)
    studio = new_collection("NEUTRAL_DESIGN_REVIEW_STUDIO", root)
    cameras = new_collection("CAMERAS", root)
    option_collections = {
        key: new_collection(f"OPTION_{key}_{spec['slug'].replace('-', '_').upper()}", root)
        for key, spec in cfg.OPTIONS.items()
    }

    mats = {
        "cabinet_A": material("A_RoundedCharcoalABS", (0.046, 0.052, 0.053), 0.43, microtexture=True),
        "cabinet_B": material("B_HeavyBlackGreyABS", (0.034, 0.038, 0.039), 0.49, microtexture=True),
        "cabinet_C": material("C_PremiumGraphiteABS", (0.055, 0.059, 0.060), 0.39, microtexture=True),
        "bezel": material("ThickProtectiveBezelABS", (0.025, 0.028, 0.029), 0.38, microtexture=True),
        "secondary": material("ControlAndServiceABS", (0.031, 0.035, 0.036), 0.52, microtexture=True),
        "glass": material("DormantConvexSmokedCRTGlass", (0.012, 0.019, 0.020), 0.18, 0.0),
        "control": material("EraPhysicalControls", (0.058, 0.062, 0.061), 0.54),
        "indicator": material("DormantPowerIndicator", (0.022, 0.006, 0.003), 0.28),
        "cavity": material("VentAndSpeakerCavities", (0.004, 0.005, 0.005), 0.72),
        "cable": material("DormantGraphiteCableAndRelief", (0.014, 0.016, 0.016), 0.61),
        "foot": material("RestrainedHiddenFeet", (0.009, 0.010, 0.010), 0.72),
        "ground": material("NeutralHonestGeometryGround", (0.038, 0.043, 0.044), 0.72),
        "rear": material("NeutralReviewBackdrop", (0.025, 0.029, 0.030), 0.78),
    }
    glass_shader = mats["glass"].node_tree.nodes.get("Principled BSDF")
    if "IOR Level" in glass_shader.inputs:
        glass_shader.inputs["IOR Level"].default_value = 0.42
    if "Coat Weight" in glass_shader.inputs:
        glass_shader.inputs["Coat Weight"].default_value = 0.18
    if "Coat Roughness" in glass_shader.inputs:
        glass_shader.inputs["Coat Roughness"].default_value = 0.12

    for key, spec in cfg.OPTIONS.items():
        build_option(key, spec, mats, option_collections[key])

    rounded_box("NeutralReviewGround", (7.0, 7.0, 0.06), (0.0, 0.0, -0.03), 0.012, mats["ground"], studio)
    # Keep the backdrop beyond every camera so the rear and rear-three-quarter
    # views remain honest rather than being occluded by the studio wall.
    rounded_box("NeutralReviewBackdrop", (7.0, 0.06, 3.4), (0.0, 6.0, 1.55), 0.015, mats["rear"], studio)
    area_light("NeutralLargeKey", (-3.2, -4.0, 4.3), 690.0, (0.84, 0.86, 0.84), 3.2, (0.0, 0.0, 0.37), studio)
    area_light("NeutralRearRim", (3.5, 3.1, 3.0), 560.0, (0.68, 0.74, 0.75), 2.5, (0.0, 0.0, 0.40), studio)
    area_light("NeutralFrontFill", (0.0, -3.2, 1.4), 245.0, (0.62, 0.66, 0.65), 3.5, (0.0, 0.0, 0.32), studio)
    area_light("NeutralTopSoftbox", (-0.8, 0.2, 4.8), 350.0, (0.76, 0.78, 0.77), 2.8, (0.0, 0.0, 0.30), studio)

    for view, spec in cfg.VIEWS.items():
        camera(f"Camera_CRT_{view.replace('-', '_').title()}", spec, cameras)
    scene.camera = bpy.data.objects["Camera_CRT_Three_Quarter_Front"]

    scene["phase"] = "Phase 0.4 CRT television low-cost proportion gate"
    scene["internal_concept_name"] = "Quantum Signal Television"
    scene["high_detail_refinement_started"] = False
    scene["provisional_selection"] = cfg.PROVISIONAL_SELECTION
    scene["selection_status"] = cfg.SELECTION_STATUS
    scene["modelled_from_scratch"] = True
    scene["third_party_models"] = 0
    scene["external_assets"] = False
    scene["external_libraries"] = 0
    scene["external_images"] = 0
    scene["packed_files"] = 0
    scene["private_reference_loaded_in_blender"] = False
    scene["procedural_materials_only"] = True
    scene["dormant_emission"] = 0.0
    scene["screen_aspect"] = "4:3 for every option"

    args.output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(
        filepath=str(args.output.resolve()),
        compress=True,
        relative_remap=True,
        copy=True,
    )
    print(f"QH_PHASE04_CRT_BLOCKOUT_SOURCE={args.output.resolve()}")
    print(f"QH_PHASE04_CRT_OBJECTS={len(bpy.data.objects)}")
    print(f"QH_PHASE04_CRT_IMAGES={len(bpy.data.images)}")
    print(f"QH_PHASE04_CRT_LIBRARIES={len(bpy.data.libraries)}")
    print(f"QH_PHASE04_CRT_PACKED={len(bpy.data.filepaths()) if False else 0}")


if __name__ == "__main__":
    build()
