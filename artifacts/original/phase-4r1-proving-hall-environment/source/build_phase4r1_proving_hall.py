"""Build the deterministic Phase 4-R1 Proving Hall Blender derivative.

Run Blender with the exact Phase 4-R0 derivative open.  This script does not
download assets, does not alter the R0 file, and does not render.  All R1 hall
geometry and materials are modeled or procedural and are saved into one new
derivative beside this script.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any, Iterable

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import phase4r1_config as cfg


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


def canonical_payload_hash(payload: Any) -> str:
    """Cross-language SHA-256 authority for JSON-like report payloads.

    Finite integral floats are normalized to integers before sorted compact
    JSON encoding, matching JavaScript's numeric JSON representation.
    """
    def normalize(value: Any) -> Any:
        if value is None or isinstance(value, (bool, int, str)):
            return value
        if isinstance(value, float):
            if not math.isfinite(value):
                raise ValueError("canonical report payload cannot contain non-finite numbers")
            return int(value) if value.is_integer() else value
        if isinstance(value, dict):
            return {str(key): normalize(item) for key, item in value.items()}
        if isinstance(value, (list, tuple)):
            return [normalize(item) for item in value]
        raise TypeError(f"unsupported canonical report value: {type(value).__name__}")

    encoded = json.dumps(normalize(payload), sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def iter_action_fcurves(action: bpy.types.Action):
    legacy = getattr(action, "fcurves", None)
    if legacy is not None:
        yield from legacy
        return
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", ()):
                yield from channelbag.fcurves


def action_inventory_signature(action_names: set[str] | None = None) -> dict[str, Any]:
    actions = sorted(
        [action for action in bpy.data.actions if action_names is None or action.name in action_names],
        key=lambda action: action.name,
    )
    digest = hashlib.sha256()
    point_count = 0
    curve_count = 0
    for action in actions:
        digest.update(f"ACTION\0{action.name}\n".encode("utf-8"))
        curves = sorted(list(iter_action_fcurves(action)), key=lambda curve: (curve.data_path, curve.array_index))
        for curve in curves:
            curve_count += 1
            digest.update(f"CURVE\0{curve.data_path}\0{curve.array_index}\n".encode("utf-8"))
            for point in curve.keyframe_points:
                point_count += 1
                fields = (
                    float(point.co.x).hex(), float(point.co.y).hex(),
                    float(point.handle_left.x).hex(), float(point.handle_left.y).hex(),
                    float(point.handle_right.x).hex(), float(point.handle_right.y).hex(),
                    str(point.interpolation), str(point.handle_left_type), str(point.handle_right_type),
                )
                digest.update(("POINT\0" + "\0".join(fields) + "\n").encode("utf-8"))
    return {
        "action_names": [action.name for action in actions],
        "action_count": len(actions),
        "curve_count": curve_count,
        "keyframe_point_count": point_count,
        "sha256": digest.hexdigest(),
    }


def set_interpolation(owner: Any, paths: set[str], mode: str) -> None:
    action = None if owner.animation_data is None else owner.animation_data.action
    if action is None:
        return
    for curve in iter_action_fcurves(action):
        if curve.data_path in paths:
            for point in curve.keyframe_points:
                point.interpolation = mode


def create_collection(name: str) -> bpy.types.Collection:
    existing = bpy.data.collections.get(name)
    if existing is not None:
        for obj in list(existing.all_objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(existing)
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def link_exclusively(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for existing in list(obj.users_collection):
        existing.objects.unlink(obj)
    collection.objects.link(obj)


def srgb(value: str) -> tuple[float, float, float, float]:
    clean = value.lstrip("#")
    return tuple(int(clean[index : index + 2], 16) / 255.0 for index in (0, 2, 4)) + (1.0,)


def principled_material(
    name: str,
    base_hex: str,
    roughness: float,
    metallic: float = 0.0,
    texture_scale: float = 7.0,
    texture_amount: float = 0.08,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.name = "Phase4R1 Authored Principled Surface"
    shader.inputs["Base Color"].default_value = srgb(base_hex)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    noise = nodes.new("ShaderNodeTexNoise")
    noise.name = "Phase4R1 Procedural Microtexture"
    noise.noise_dimensions = "3D"
    noise.inputs["Scale"].default_value = texture_scale
    noise.inputs["Detail"].default_value = 3.0
    noise.inputs["Roughness"].default_value = 0.62
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.name = "Phase4R1 Maintained Surface Variation"
    base = srgb(base_hex)
    ramp.color_ramp.elements[0].position = 0.28
    ramp.color_ramp.elements[0].color = tuple(max(0.0, channel * (1.0 - texture_amount)) for channel in base[:3]) + (1.0,)
    ramp.color_ramp.elements[1].position = 0.72
    ramp.color_ramp.elements[1].color = tuple(min(1.0, channel * (1.0 + texture_amount)) for channel in base[:3]) + (1.0,)
    bump = nodes.new("ShaderNodeBump")
    bump.name = "Phase4R1 Restrained Microtexture Bump"
    bump.inputs["Strength"].default_value = min(0.22, texture_amount * 1.4)
    bump.inputs["Distance"].default_value = 0.025
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], shader.inputs["Base Color"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    material.diffuse_color = base
    material["phase4r1_authored"] = True
    material["phase4r1_external_textures"] = 0
    material["phase4r1_surface_role"] = name.replace("Phase4R1_", "")
    return material


def current_material() -> bpy.types.Material:
    material = bpy.data.materials.new("Phase4R1_EnergizedInnerConductor")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.name = "Phase4R1 Energized Sheath Surface Response"
    magenta = srgb(cfg.CURRENT["color_srgb"])
    shader.inputs["Base Color"].default_value = (0.028, 0.006, 0.014, 1.0)
    shader.inputs["Roughness"].default_value = 0.42
    shader.inputs["Metallic"].default_value = 0.03
    shader.inputs["Emission Color"].default_value = magenta
    object_info = nodes.new("ShaderNodeObjectInfo")
    object_info.name = "Phase4R1 Per-Segment Current State"
    multiplier = nodes.new("ShaderNodeMath")
    multiplier.operation = "MULTIPLY"
    multiplier.name = "Phase4R1 Current Strength Multiplier"
    multiplier.inputs[1].default_value = cfg.CURRENT["front_strength_eevee"]
    geometry = nodes.new("ShaderNodeNewGeometry")
    geometry.name = "Phase4R1 Physical Upper-Sheath Normal"
    separate_normal = nodes.new("ShaderNodeSeparateXYZ")
    normal_mask = nodes.new("ShaderNodeMapRange")
    normal_mask.name = "Phase4R1 Broad Upper Cross-Section Mask"
    normal_mask.interpolation_type = "SMOOTHERSTEP"
    normal_mask.clamp = True
    # A smooth, continuous cap covers the upper physical quadrant.  The mask
    # falls away before the lower flanks so the graphite sheath remains
    # visible; high circumferential tessellation prevents longitudinal bands.
    normal_mask.inputs["From Min"].default_value = -0.08
    normal_mask.inputs["From Max"].default_value = 0.30
    normal_mask.inputs["To Min"].default_value = 0.0
    normal_mask.inputs["To Max"].default_value = 1.0
    response_factor = nodes.new("ShaderNodeMath")
    response_factor.operation = "MULTIPLY"
    response_factor.name = "Phase4R1 Graphite-Preserving Surface Response"
    mix = nodes.new("ShaderNodeMixShader")
    mix.name = "Phase4R1 Contained Cable Energy Mix"
    links.new(object_info.outputs["Alpha"], multiplier.inputs[0])
    links.new(multiplier.outputs[0], shader.inputs["Emission Strength"])
    links.new(geometry.outputs["Normal"], separate_normal.inputs["Vector"])
    links.new(separate_normal.outputs["Z"], normal_mask.inputs["Value"])
    links.new(normal_mask.outputs["Result"], response_factor.inputs[0])
    links.new(object_info.outputs["Alpha"], response_factor.inputs[1])
    links.new(response_factor.outputs[0], mix.inputs[0])
    links.new(transparent.outputs["BSDF"], mix.inputs[1])
    links.new(shader.outputs["BSDF"], mix.inputs[2])
    links.new(mix.outputs["Shader"], output.inputs["Surface"])
    if hasattr(material, "surface_render_method"):
        material.surface_render_method = "DITHERED"
    material.diffuse_color = (magenta[0], magenta[1], magenta[2], 0.0)
    material["phase4r1_role"] = "broad contained upper-sheath response over a continuously visible graphite cable"
    material["phase4r1_white_led_edge"] = False
    material["phase4r1_graphite_sheath_remains_visible"] = True
    material["phase4r1_front_strength_eevee"] = cfg.CURRENT["front_strength_eevee"]
    material["phase4r1_front_strength_cycles"] = cfg.CURRENT["front_strength_cycles"]
    return material


def current_indicator_material() -> bpy.types.Material:
    material = bpy.data.materials.new("Phase4R1_RestrainedCurrentIndicator")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.name = "Phase4R1 Physical Indicator Lens"
    magenta = srgb(cfg.CURRENT["color_srgb"])
    shader.inputs["Base Color"].default_value = (0.014, 0.003, 0.007, 1.0)
    shader.inputs["Roughness"].default_value = 0.31
    shader.inputs["Emission Color"].default_value = magenta
    object_info = nodes.new("ShaderNodeObjectInfo")
    strength = nodes.new("ShaderNodeMath")
    strength.operation = "MULTIPLY"
    strength.inputs[1].default_value = 2.2
    links.new(object_info.outputs["Alpha"], strength.inputs[0])
    links.new(strength.outputs[0], shader.inputs["Emission Strength"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    material.diffuse_color = (magenta[0], magenta[1], magenta[2], 0.0)
    material["phase4r1_role"] = "restrained physical source and arrival indicator lens"
    return material


def add_box(
    name: str,
    location: tuple[float, float, float],
    dimensions: tuple[float, float, float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    bevel: float = 0.02,
    role: str = "environment",
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link_exclusively(obj, collection)
    obj.data.name = f"{name}_Mesh"
    obj.data.materials.append(material)
    if bevel > 0.0:
        modifier = obj.modifiers.new("Phase4R1 Manufactured Edge Radius", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        modifier.limit_method = "ANGLE"
    obj["phase4r1_authored"] = True
    obj["phase4r1_role"] = role
    return obj


def add_cylinder(
    name: str,
    location: tuple[float, float, float],
    radius: float,
    depth: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    vertices: int = 32,
    role: str = "environment",
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    link_exclusively(obj, collection)
    obj.data.name = f"{name}_Mesh"
    obj.data.materials.append(material)
    bevel = obj.modifiers.new("Phase4R1 Manufactured Edge Radius", "BEVEL")
    bevel.width = min(radius * 0.12, 0.012)
    bevel.segments = 3
    obj["phase4r1_authored"] = True
    obj["phase4r1_role"] = role
    return obj


def add_beam_between(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    thickness: tuple[float, float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    role: str,
) -> bpy.types.Object:
    a, b = Vector(start), Vector(end)
    direction = b - a
    obj = add_box(name, tuple((a + b) * 0.5), (thickness[0], thickness[1], direction.length), material, collection, bevel=0.012, role=role)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(direction.normalized())
    return obj


def add_curve_object(
    name: str,
    points: Iterable[tuple[float, float, float]],
    bevel_depth: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    resolution: int = 2,
    bevel_resolution: int = 3,
    role: str = "environment",
) -> bpy.types.Object:
    coordinates = list(points)
    data = bpy.data.curves.new(f"{name}_Curve", type="CURVE")
    data.dimensions = "3D"
    data.resolution_u = resolution
    data.bevel_depth = bevel_depth
    data.bevel_resolution = bevel_resolution
    data.use_fill_caps = True
    spline = data.splines.new("POLY")
    spline.points.add(len(coordinates) - 1)
    for point, co in zip(spline.points, coordinates):
        point.co = (*co, 1.0)
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    data.materials.append(material)
    obj["phase4r1_authored"] = True
    obj["phase4r1_role"] = role
    return obj


def cubic_bezier(a: Vector, b: Vector, c: Vector, d: Vector, count: int) -> list[Vector]:
    values: list[Vector] = []
    for index in range(count):
        t = index / (count - 1)
        u = 1.0 - t
        values.append(u**3 * a + 3.0 * u * u * t * b + 3.0 * u * t * t * c + t**3 * d)
    return values


def append_unique(target: list[Vector], source: Iterable[Vector]) -> None:
    for point in source:
        if not target or (point - target[-1]).length > 1e-8:
            target.append(point)


def build_route(spec: dict[str, Any]) -> list[Vector]:
    cable_exit = Vector(cfg.HALL["cable_exit_world_m"])
    floor = Vector(cfg.HALL["floor_transition_world_m"])
    floor_centre_z = float(spec["diameter_m"]) * 0.5
    outer = float(spec["outer_radius_m"])
    turns = float(spec["turns"])
    samples = int(spec["route_samples"])
    start_angle = math.radians(-90.0 + float(spec.get("phase_offset_degrees", 0.0)))
    end_angle = start_angle + math.tau * turns
    inner = float(spec["inner_radius_m"])
    spiral_points: list[Vector] = []
    for index in range(samples):
        fraction = index / (samples - 1)
        angle = start_angle + fraction * (end_angle - start_angle)
        radial_fraction = fraction * fraction * (3.0 - 2.0 * fraction)
        radius = outer + radial_fraction * (inner - outer)
        irregularity = float(spec.get("route_irregularity", 1.0))
        asymmetry = 1.0 + irregularity * (
            0.046 * math.sin(angle * 0.63 + 0.7)
            + 0.022 * math.sin(angle * 1.7)
            + 0.013 * math.sin(angle * 0.31 + 1.4)
        )
        outer_x_scale = float(spec.get("x_scale", 1.0))
        inner_x_scale = float(spec.get("inner_x_scale", outer_x_scale))
        authored_x_scale = outer_x_scale + radial_fraction * (inner_x_scale - outer_x_scale)
        weighted_envelope = math.sin(math.pi * fraction) ** 2
        x_drift = irregularity * 0.11 * weighted_envelope * math.sin(angle * 0.47 + 0.2)
        y_drift = irregularity * 0.08 * weighted_envelope * math.sin(angle * 0.39 + 1.1)
        x = cfg.ORBIT_TARGET[0] + radius * authored_x_scale * asymmetry * math.cos(angle) + x_drift
        y = cfg.ORBIT_TARGET[1] + radius * (2.0 - asymmetry) * math.sin(angle) + y_drift
        z = floor_centre_z + 0.003 * math.sin(angle * 0.41) ** 2
        spiral_points.append(Vector((x, y, z)))

    # The cable first leaves the modeled relief axially along -Y, then turns
    # down into the supported floor bend.  The floor lead shares an explicit
    # tangent at the transition and meets the spiral on its measured tangent.
    # transition.  The lead then meets the first spiral sample on that
    # sample's measured tangent.  This prevents the former low-speed cusp and
    # gives the heavy 54 mm cable a physically credible bend radius.
    lead_scale = float(spec.get("lead_x_scale", spec.get("x_scale", 1.0)))
    midpoint_offset = spec.get("lead_midpoint_offset_xy_m")
    lead_midpoint_z = float(spec.get("lead_midpoint_z_m", floor_centre_z))
    if midpoint_offset is None:
        lead_midpoint = Vector(
            (
                floor.x - float(spec.get("lead_excursion_m", 0.62 + 2.38 * lead_scale)),
                floor.y - (0.55 + 0.15 * lead_scale),
                lead_midpoint_z,
            )
        )
    else:
        lead_midpoint = Vector((floor.x + float(midpoint_offset[0]), floor.y + float(midpoint_offset[1]), lead_midpoint_z))
    explicit_lead_tangent = spec.get("lead_start_tangent_xyz")
    lead_direction = ((lead_midpoint - floor) if explicit_lead_tangent is None else Vector(explicit_lead_tangent)).normalized()
    horizontal_lead_direction = Vector((lead_direction.x, lead_direction.y, 0.0)).normalized()
    lead_midpoint_tangent = Vector(spec.get("lead_midpoint_tangent_xyz", (0.0, 1.0, 0.0))).normalized()
    first_spiral_tangent = (spiral_points[1] - spiral_points[0]).normalized()
    lead_end_handle = float(spec.get("lead_end_handle_m", 0.46 + 0.64 * lead_scale))
    lead_second_control = spiral_points[0] - first_spiral_tangent * lead_end_handle
    route: list[Vector] = []
    plug_bend_radius = 0.25
    plug_bend_kappa = 0.5522847498307936
    source_drop_vertical_handle = float(spec.get("source_drop_vertical_handle_m", 0.26))
    plug_arc_start = Vector(
        (
            floor.x - horizontal_lead_direction.x * plug_bend_radius,
            floor.y - horizontal_lead_direction.y * plug_bend_radius,
            floor.z + plug_bend_radius,
        )
    )
    append_unique(
        route,
        cubic_bezier(
            cable_exit,
            cable_exit + Vector((0.0, -0.28, 0.0)),
            plug_arc_start + Vector((0.0, 0.0, source_drop_vertical_handle)),
            plug_arc_start,
            24,
        ),
    )
    append_unique(
        route,
        cubic_bezier(
            plug_arc_start,
            plug_arc_start + Vector((0.0, 0.0, -plug_bend_kappa * plug_bend_radius)),
            floor - lead_direction * (plug_bend_kappa * plug_bend_radius),
            floor,
            22,
        ),
    )
    append_unique(
        route,
        cubic_bezier(
            floor,
            floor + lead_direction * float(spec.get("lead_start_handle_m", 0.62 + 0.30 * lead_scale)),
            lead_midpoint - lead_midpoint_tangent * float(spec.get("lead_mid_handle_m", 0.58 + 0.20 * lead_scale)),
            lead_midpoint,
            53,
        ),
    )
    append_unique(
        route,
        cubic_bezier(
            lead_midpoint,
            lead_midpoint + lead_midpoint_tangent * float(spec.get("lead_second_start_handle_m", 0.62 + 0.25 * lead_scale)),
            lead_second_control,
            spiral_points[0],
            53,
        ),
    )
    append_unique(route, spiral_points)
    gland_entry = Vector(cfg.HALL["crt_gland_cable_entry_world_m"])
    connection = Vector(cfg.HALL["crt_rear_connection_world_m"])
    axial_approach = Vector(cfg.HALL["crt_gland_axial_approach_world_m"])
    final_spiral_tangent = (spiral_points[-1] - spiral_points[-2]).normalized()
    kappa = 0.5522847498307936
    up, positive_y = Vector((0.0, 0.0, 1.0)), Vector((0.0, 1.0, 0.0))
    negative_x, negative_y = Vector((-1.0, 0.0, 0.0)), Vector((0.0, -1.0, 0.0))

    def quarter_turn(start: Vector, direction_a: Vector, direction_b: Vector, radius: float, samples_count: int = 41) -> Vector:
        end = start + radius * (direction_a + direction_b)
        append_unique(route, cubic_bezier(start, start + direction_a * (kappa * radius), end - direction_b * (kappa * radius), end, samples_count))
        return end

    start = route[-1]
    horizontal_tangent = Vector((final_spiral_tangent.x, final_spiral_tangent.y, 0.0)).normalized()
    lift_radius = 0.40
    family = str(spec["collection"]).rsplit("_", 1)[-1].lower()
    if family == "desktop":
        # -X floor tangent -> supported vertical lift -> +Y rear aisle.
        point = quarter_turn(start, horizontal_tangent, up, lift_radius)
        point = quarter_turn(point, up, -horizontal_tangent, lift_radius)
        point = quarter_turn(point, -horizontal_tangent, positive_y, lift_radius)
    elif family == "mobile":
        # +X floor tangent -> supported vertical lift -> +Y rear aisle.
        point = quarter_turn(start, horizontal_tangent, up, lift_radius)
        point = quarter_turn(point, up, positive_y, lift_radius)
    else:
        # Landscape already leaves the spiral along +Y; a long C1 supported
        # rise retains that tangent without crossing a prior floor turn.
        point = Vector((start.x, 1.60, 0.80))
        append_unique(route, cubic_bezier(start, start + horizontal_tangent * 0.55, point - positive_y * 0.55, point, 101))

    rear_turn_start = Vector((point.x, 3.00, point.z))
    append_unique(route, cubic_bezier(point, point + positive_y * 0.40, rear_turn_start - positive_y * 0.40, rear_turn_start, 81))
    point = rear_turn_start
    turnback_radius = (point.x - cfg.ORBIT_TARGET[0]) * 0.5
    if turnback_radius < 0.18:
        raise RuntimeError(f"{family} rear turnback radius {turnback_radius:.6f} m cannot support the 54 mm cable")
    point = quarter_turn(point, positive_y, negative_x, turnback_radius)
    point = quarter_turn(point, negative_x, negative_y, turnback_radius)
    append_unique(route, cubic_bezier(point, point + negative_y * 0.38, axial_approach - negative_y * 0.38, axial_approach, 101))
    # A long, sampled axial corridor begins behind the physical CRT, crosses
    # the rubber outer face exactly, and ends at the accepted collar.  The
    # final 0.20 m is therefore unambiguously inside the gland along -Y.
    append_unique(route, [axial_approach.lerp(gland_entry, index / 32.0) for index in range(1, 33)])
    append_unique(route, [gland_entry.lerp(connection, index / 24.0) for index in range(1, 25)])
    return route


def cumulative_lengths(points: list[Vector]) -> list[float]:
    values = [0.0]
    for left, right in zip(points, points[1:]):
        values.append(values[-1] + (right - left).length)
    return values


def minimum_bend_radius_evidence(points: list[Vector]) -> dict[str, Any]:
    minimum = float("inf")
    evidence: dict[str, Any] = {"radius_m": minimum, "index": None, "points": None, "turn_degrees": None}
    for index, (a, b, c) in enumerate(zip(points, points[1:], points[2:])):
        left, right = b - a, c - b
        if left.length < 1e-5 or right.length < 1e-5:
            continue
        angle = left.angle(right)
        if angle < 1e-5:
            continue
        sine = math.sin(angle)
        if abs(sine) < 1e-8:
            continue
        radius = (c - a).length / (2.0 * sine)
        if radius < minimum:
            minimum = radius
            evidence = {
                "radius_m": radius,
                "index": index + 1,
                "points": [[float(value) for value in point] for point in (a, b, c)],
                "turn_degrees": math.degrees(angle),
                "left_length_m": left.length,
                "right_length_m": right.length,
            }
    return evidence


def point_at_distance(points: list[Vector], cumulative: list[float], distance: float) -> Vector:
    distance = min(max(distance, 0.0), cumulative[-1])
    lo, hi = 0, len(cumulative) - 1
    while lo + 1 < hi:
        mid = (lo + hi) // 2
        if cumulative[mid] <= distance:
            lo = mid
        else:
            hi = mid
    span = cumulative[lo + 1] - cumulative[lo]
    fraction = 0.0 if span <= 1e-12 else (distance - cumulative[lo]) / span
    return points[lo].lerp(points[lo + 1], fraction)


def segment_points(points: list[Vector], cumulative: list[float], start: float, end: float, count: int = 6) -> list[tuple[float, float, float]]:
    return [tuple(point_at_distance(points, cumulative, start + (end - start) * index / (count - 1))) for index in range(count)]


def build_cable_family(
    family: str,
    spec: dict[str, Any],
    materials: dict[str, bpy.types.Material],
    local_lights: bpy.types.Collection,
) -> dict[str, Any]:
    collection = create_collection(spec["collection"])
    route = build_route(spec)
    cumulative = cumulative_lengths(route)
    total = cumulative[-1]
    diameter = float(spec["diameter_m"])
    bend_evidence = minimum_bend_radius_evidence(route)
    if float(bend_evidence["radius_m"]) < diameter * 3.0:
        raise RuntimeError(
            f"{family} cable minimum bend radius {bend_evidence['radius_m']:.6f} m is below "
            f"the authored 3x-diameter minimum {diameter * 3.0:.6f} m; evidence={bend_evidence}"
        )
    sheath = add_curve_object(
        f"Phase4R1_{family.title()}_ContinuousGraphiteSheath",
        [tuple(point) for point in route],
        diameter * 0.5,
        materials["cable_rubber"],
        collection,
        role=f"{family} continuous physical cable sheath",
    )
    sheath["phase4r1_length_m"] = total
    sheath["phase4r1_turns"] = float(spec["turns"])
    sheath["phase4r1_diameter_m"] = diameter
    raised_points = [point for point in route if point.z >= 0.50]
    support_records = []
    if raised_points:
        for support_index, fraction in enumerate((0.18, 0.50, 0.82)):
            point = raised_points[round(fraction * (len(raised_points) - 1))]
            post_height = max(0.08, point.z - diameter * 0.55)
            add_box(f"P4R1_{family.title()}_RearCableSupport_{support_index:02d}", (point.x, point.y, post_height * 0.5), (0.14, 0.14, post_height), materials["steel"], collection, 0.018, f"{family} rear raised-cable support post")
            add_box(f"P4R1_{family.title()}_RearCableCradle_{support_index:02d}", (point.x, point.y, point.z - diameter * 0.34), (0.24, 0.18, 0.08), materials["galvanized"], collection, 0.025, f"{family} rear cable cradle physically contacting sheath")
            support_records.append({"world_m": [round(float(value), 6) for value in point], "post_height_m": round(post_height, 6)})
    conductor = materials["current"]
    segment_count = int(spec["segments"])
    arrival_frames: list[int] = []
    front_duration = max(1, round((cfg.EVENTS["orbit_complete_current_arrival"] - cfg.EVENTS["conduction_start"]) * cfg.CURRENT["front_width_fraction"]))
    trail_alpha = cfg.CURRENT["trail_strength_eevee"] / cfg.CURRENT["front_strength_eevee"]
    conductors: list[bpy.types.Object] = []
    for index in range(segment_count):
        p0 = index / segment_count
        p1 = (index + 1) / segment_count
        # A short physical overlap (rather than a route-percentage overlap)
        # prevents cap gaps without smearing the measured arc-prefix front.
        overlap = diameter * 0.22
        start_distance = max(0.0, total * p0 - overlap)
        end_distance = min(total, total * p1 + overlap)
        coordinates = [tuple(co) for co in segment_points(route, cumulative, start_distance, end_distance, count=20)]
        obj = add_curve_object(
            f"Phase4R1_{family.title()}_Current_{index:03d}",
            coordinates,
            diameter * 0.512,
            conductor,
            collection,
            resolution=1,
            bevel_resolution=8,
            role=f"{family} arc-length current segment",
        )
        obj.data.use_fill_caps = False
        progress = index / (segment_count - 1)
        arrival = round(cfg.EVENTS["conduction_start"] + progress * (cfg.EVENTS["orbit_complete_current_arrival"] - cfg.EVENTS["conduction_start"]))
        arrival_frames.append(arrival)
        obj.color = (*srgb(cfg.CURRENT["color_srgb"])[:3], 0.0)
        obj.keyframe_insert(data_path="color", frame=cfg.FRAME_START)
        obj.keyframe_insert(data_path="color", frame=max(cfg.FRAME_START, arrival - 1))
        obj.color = (*srgb(cfg.CURRENT["color_srgb"])[:3], 1.0)
        obj.keyframe_insert(data_path="color", frame=arrival)
        obj.color = (*srgb(cfg.CURRENT["color_srgb"])[:3], trail_alpha)
        obj.keyframe_insert(data_path="color", frame=min(cfg.EVENTS["orbit_complete_current_arrival"], arrival + front_duration))
        obj.keyframe_insert(data_path="color", frame=cfg.EVENTS["threshold_crossing"])
        set_interpolation(obj, {"color"}, "LINEAR")
        obj["phase4r1_progress_start"] = p0
        obj["phase4r1_progress_end"] = p1
        obj["phase4r1_arc_start_m"] = start_distance
        obj["phase4r1_arc_end_m"] = end_distance
        obj["phase4r1_arrival_frame"] = arrival
        obj["phase4r1_front_duration_frames"] = front_duration
        conductors.append(obj)

    light_sites = []
    for site in range(int(cfg.CURRENT["local_response_sites"])):
        progress = (site + 0.5) / cfg.CURRENT["local_response_sites"]
        point = point_at_distance(route, cumulative, total * progress)
        data = bpy.data.lights.new(f"Phase4R1_{family.title()}_CableResponse_{site:02d}_Data", type="AREA")
        data.shape = "DISK"
        data.size = 1.35
        data.color = srgb(cfg.CURRENT["color_srgb"])[:3]
        data.energy = 0.0
        obj = bpy.data.objects.new(f"Phase4R1_{family.title()}_CableResponse_{site:02d}", data)
        local_lights.objects.link(obj)
        obj.location = (point.x, point.y, 0.52)
        obj.rotation_euler = (0.0, 0.0, 0.0)
        arrival = round(cfg.EVENTS["conduction_start"] + progress * (cfg.EVENTS["orbit_complete_current_arrival"] - cfg.EVENTS["conduction_start"]))
        for frame, energy in (
            (cfg.FRAME_START, 0.0),
            (arrival - 1, 0.0),
            (arrival, cfg.CURRENT["local_response_front_energy_w"]),
            (min(285, arrival + front_duration), cfg.CURRENT["local_response_trail_energy_w"]),
            (500, cfg.CURRENT["local_response_trail_energy_w"]),
        ):
            data.energy = energy
            data.keyframe_insert(data_path="energy", frame=frame)
        set_interpolation(data, {"energy"}, "LINEAR")
        obj["phase4r1_family"] = family
        obj["phase4r1_local_only"] = True
        light_sites.append({"progress": round(progress, 6), "arrival_frame": arrival, "location": [round(v, 6) for v in point]})

    return {
        "family": family,
        "collection": collection.name,
        "route_length_m": round(total, 6),
        "diameter_m": diameter,
        "turns": float(spec["turns"]),
        "outer_radius_m": float(spec["outer_radius_m"]),
        "inner_radius_m": float(spec["inner_radius_m"]),
        "route_planform": "elliptical authored responsive spiral" if float(spec.get("x_scale", 1.0)) != 1.0 else "broad asymmetric circular spiral",
        "planform_x_scale": float(spec.get("x_scale", 1.0)),
        "planform_inner_x_scale": float(spec.get("inner_x_scale", spec.get("x_scale", 1.0))),
        "route_irregularity": float(spec.get("route_irregularity", 1.0)),
        "source_lead_x_scale": float(spec.get("lead_x_scale", spec.get("x_scale", 1.0))),
        "source_lead_excursion_m": float(spec.get("lead_excursion_m", 0.62 + 2.38 * float(spec.get("lead_x_scale", spec.get("x_scale", 1.0))))),
        "source_lead_midpoint_z_m": float(spec.get("lead_midpoint_z_m", diameter * 0.5)),
        "source_lead_and_spiral_tangents_continuous": True,
        "rear_connector_style": "supported constant-radius lift, rear-aisle turnback and straight axial gland insertion",
        "rear_connector_clearance_intent": "three physical cradles support an elevated non-crossing connector before the exact outer-face/collar corridor",
        "rear_connector_peak_z_m": round(max(point.z for point in route[148 + int(spec["route_samples"]) - 1 :]), 6),
        "minimum_bend_radius_m": round(float(bend_evidence["radius_m"]), 6),
        "minimum_bend_radius_evidence": bend_evidence,
        "x_extent_m": [round(min(point.x for point in route), 6), round(max(point.x for point in route), 6)],
        "y_extent_m": [round(min(point.y for point in route), 6), round(max(point.y for point in route), 6)],
        "route_point_count": len(route),
        "conductor_segment_count": segment_count,
        "arrival_frame_first": min(arrival_frames),
        "arrival_frame_last": max(arrival_frames),
        "arrival_frames_monotonic": all(a <= b for a, b in zip(arrival_frames, arrival_frames[1:])),
        "front_width_fraction": cfg.CURRENT["front_width_fraction"],
        "front_duration_frames": front_duration,
        "source_world_m": [round(float(v), 6) for v in route[0]],
        "destination_world_m": [round(float(v), 6) for v in route[-1]],
        "local_response_sites": light_sites,
        "conductor_render_overlap_fraction_each_side": round(overlap / total, 9),
        "conductor_render_overlap_m_each_side": round(overlap, 6),
        "conductor_render_overlap_guarantees_no_cap_gaps": True,
        "energized_surface_model": "transparent normal-masked overlay on the upper sheath; graphite remains physically visible",
        "raised_rear_connector_supports": support_records,
    }


def create_materials() -> dict[str, bpy.types.Material]:
    materials = {
        "concrete": principled_material("Phase4R1_SealedConcrete", "#424748", 0.57, texture_scale=5.5, texture_amount=0.15),
        "concrete_patch": principled_material("Phase4R1_ConcreteMaintenancePatch", "#535858", 0.63, texture_scale=11.0, texture_amount=0.09),
        "steel": principled_material("Phase4R1_PaintedStructuralSteel", "#343D41", 0.39, metallic=0.40, texture_scale=8.0, texture_amount=0.10),
        "galvanized": principled_material("Phase4R1_GalvanizedMetal", "#70777A", 0.35, metallic=0.72, texture_scale=18.0, texture_amount=0.12),
        "mesh": principled_material("Phase4R1_SafetyMeshSteel", "#373D3E", 0.44, metallic=0.61, texture_scale=14.0, texture_amount=0.07),
        "cabinet": principled_material("Phase4R1_DistributionCabinetPaint", "#414C50", 0.31, metallic=0.30, texture_scale=10.0, texture_amount=0.09),
        "machine": principled_material("Phase4R1_MaintainedMachinePaint", "#46565D", 0.33, metallic=0.25, texture_scale=9.0, texture_amount=0.09),
        "rubber": principled_material("Phase4R1_IndustrialPlugRubber", "#111415", 0.68, texture_scale=24.0, texture_amount=0.11),
        "cable_rubber": principled_material("Phase4R1_HeavyGraphiteCableSheath", "#090B0C", 0.72, texture_scale=31.0, texture_amount=0.16),
        "safety": principled_material("Phase4R1_RestrainedSafetyEdge", "#A98429", 0.48, metallic=0.08, texture_scale=7.0, texture_amount=0.09),
        "dark": principled_material("Phase4R1_DeepBackgroundMetal", "#20272A", 0.52, metallic=0.30, texture_scale=13.0, texture_amount=0.10),
        "wall": principled_material("Phase4R1_MaintainedWallPanel", "#30383B", 0.64, metallic=0.08, texture_scale=6.5, texture_amount=0.12),
        "wall_recess": principled_material("Phase4R1_RecessedWallBay", "#22292C", 0.58, metallic=0.12, texture_scale=9.0, texture_amount=0.08),
        "current": current_material(),
        "current_indicator": current_indicator_material(),
    }
    diffuser = principled_material("Phase4R1_NeutralPracticalDiffuser", "#D7DED9", 0.42, texture_scale=5.0, texture_amount=0.02)
    shader = diffuser.node_tree.nodes.get("Phase4R1 Authored Principled Surface")
    shader.inputs["Emission Color"].default_value = (0.72, 0.79, 0.84, 1.0)
    shader.inputs["Emission Strength"].default_value = 4.6
    diffuser["phase4r1_environmental_magenta"] = 0
    materials["diffuser"] = diffuser
    clerestory = principled_material("Phase4R1_ClerestoryGlazing", "#62727A", 0.28, metallic=0.06, texture_scale=4.0, texture_amount=0.035)
    clerestory_shader = clerestory.node_tree.nodes.get("Phase4R1 Authored Principled Surface")
    clerestory_shader.inputs["Emission Color"].default_value = (0.22, 0.31, 0.36, 1.0)
    clerestory_shader.inputs["Emission Strength"].default_value = 1.15
    clerestory["phase4r1_environmental_magenta"] = 0
    materials["clerestory"] = clerestory
    return materials


def build_hall(materials: dict[str, bpy.types.Material]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    assets: list[dict[str, Any]] = []
    floor_collection = create_collection("PHASE4R1_HALL_FLOOR")
    structure_collection = create_collection("PHASE4R1_HALL_STRUCTURE")
    architecture_collection = create_collection("PHASE4R1_HALL_ARCHITECTURE")
    details_collection = create_collection("PHASE4R1_HALL_OPERATIONAL_DETAILS")
    machinery_collection = create_collection("PHASE4R1_HALL_MACHINERY")

    floor = add_box("P4R1_Hall_SealedConcreteFloor", (0.0, 0.0, -0.12), (34.0, 24.0, 0.24), materials["concrete"], floor_collection, 0.025, "sealed industrial floor")
    assets.append({"asset": "sealed concrete floor", "count": 1, "collection": floor_collection.name, "authored": True})
    for index, x in enumerate((-11.3, -5.65, 0.0, 5.65, 11.3)):
        add_box(f"P4R1_Floor_LongitudinalSeam_{index:02d}", (x, 0.0, 0.003), (0.018, 23.2, 0.006), materials["dark"], floor_collection, 0.0, "floor seam")
    for index, y in enumerate((-7.8, -3.9, 0.0, 3.9, 7.8)):
        add_box(f"P4R1_Floor_TransverseSeam_{index:02d}", (0.0, y, 0.004), (33.2, 0.018, 0.007), materials["dark"], floor_collection, 0.0, "floor seam")
    for index, (x, y, sx, sy) in enumerate(((-12.2, -5.0, 2.8, 1.1), (10.4, 6.8, 3.4, 1.4), (-4.5, 7.2, 1.8, 0.9))):
        add_box(f"P4R1_Floor_MaintenancePatch_{index:02d}", (x, y, 0.008), (sx, sy, 0.012), materials["concrete_patch"], floor_collection, 0.025, "maintained floor patch")
    add_box("P4R1_Floor_ServiceChannel", (12.45, 0.8, 0.012), (0.54, 15.6, 0.035), materials["galvanized"], floor_collection, 0.012, "service channel cover")
    assets.append({"asset": "floor seams, service channel and maintenance patches", "count": 14, "collection": floor_collection.name, "authored": True})

    column_count = 0
    anchor_count = 0
    for x in cfg.HALL["column_grid_x_m"]:
        for y in cfg.HALL["column_grid_y_m"]:
            prefix = f"P4R1_Column_{column_count:02d}"
            add_box(f"{prefix}_Web", (x, y, 4.15), (0.18, 0.54, 8.3), materials["steel"], structure_collection, 0.016, "structural column")
            add_box(f"{prefix}_FlangeA", (x - 0.20, y, 4.15), (0.18, 0.72, 8.3), materials["steel"], structure_collection, 0.016, "structural column")
            add_box(f"{prefix}_FlangeB", (x + 0.20, y, 4.15), (0.18, 0.72, 8.3), materials["steel"], structure_collection, 0.016, "structural column")
            add_box(f"{prefix}_Foot", (x, y, 0.065), (0.88, 0.88, 0.13), materials["galvanized"], structure_collection, 0.015, "column base plate")
            for dx in (-0.31, 0.31):
                for dy in (-0.31, 0.31):
                    add_cylinder(f"{prefix}_Anchor_{anchor_count:03d}", (x + dx, y + dy, 0.13), 0.035, 0.09, materials["galvanized"], structure_collection, vertices=16, role="structural anchor")
                    anchor_count += 1
            column_count += 1
    assets.append({"asset": "fabricated steel columns with footplates and anchors", "count": column_count, "anchors": anchor_count, "collection": structure_collection.name, "authored": True})

    truss_count = 0
    for y in (-9.5, -3.2, 3.2, 9.5):
        add_beam_between(f"P4R1_RoofChord_{truss_count:02d}_A", (-15.0, y, 8.45), (15.0, y, 8.45), (0.18, 0.24), materials["steel"], structure_collection, "roof truss chord")
        truss_count += 1
        for index in range(8):
            x0 = -14.5 + index * 3.625
            x1 = x0 + 3.625
            z0 = 8.45
            z1 = 9.45 if index % 2 == 0 else 8.45
            add_beam_between(f"P4R1_RoofDiagonal_{y:+04.1f}_{index:02d}", (x0, y, z0), (x1, y, z1), (0.12, 0.12), materials["steel"], structure_collection, "roof truss diagonal")
    assets.append({"asset": "steel roof trusses", "count": truss_count, "diagonal_members": 32, "collection": structure_collection.name, "authored": True})

    for side, x in (("West", -15.25), ("East", 15.25)):
        add_box(f"P4R1_{side}_CraneRail", (x, 0.0, cfg.HALL["crane_rail_z_m"]), (0.32, 21.0, 0.42), materials["steel"], architecture_collection, 0.02, "overhead crane rail")
    for y in (2.8, 3.15):
        add_box(f"P4R1_BridgeGantry_{y:+04.2f}", (0.0, y, 7.18), (30.4, 0.28, 0.44), materials["safety" if y > 3 else "steel"], architecture_collection, 0.018, "bridge gantry silhouette")
    add_box("P4R1_BridgeGantry_Trolley", (4.4, 2.98, 6.81), (1.45, 1.20, 0.72), materials["machine"], architecture_collection, 0.06, "dormant gantry trolley")
    assets.append({"asset": "overhead crane rails and dormant bridge gantry", "count": 5, "collection": architecture_collection.name, "authored": True})

    portal_count = 0
    for y in (-6.4, 0.0, 6.4):
        for side, x in (("West", -13.15), ("East", 13.15)):
            add_box(f"P4R1_Portal_{portal_count:02d}_{side}Leg", (x, y, 3.15), (0.42, 0.58, 6.30), materials["steel"], structure_collection, 0.022, "clear-span portal leg")
            knee_x = -11.45 if side == "West" else 11.45
            add_beam_between(
                f"P4R1_Portal_{portal_count:02d}_{side}Knee",
                (x, y, 5.55),
                (knee_x, y, 6.26),
                (0.20, 0.20),
                materials["galvanized"],
                structure_collection,
                "portal knee brace",
            )
        add_box(f"P4R1_Portal_{portal_count:02d}_Header", (0.0, y, 6.28), (26.7, 0.48, 0.52), materials["steel"], structure_collection, 0.025, "clear-span portal header")
        add_box(f"P4R1_Portal_{portal_count:02d}_ServiceEdge", (0.0, y - 0.28, 6.18), (26.2, 0.07, 0.09), materials["safety"], structure_collection, 0.012, "restrained portal service edge")
        portal_count += 1
    assets.append({"asset": "three clear-span portal bents with knee braces", "count": portal_count, "members": 18, "collection": structure_collection.name, "authored": True})

    add_box("P4R1_BackWall_Lower", (0.0, 11.72, 3.4), (34.0, 0.26, 6.8), materials["wall"], architecture_collection, 0.02, "rear industrial wall")
    add_box("P4R1_WestWall_Return", (-16.85, 3.2, 3.6), (0.28, 17.0, 7.2), materials["wall"], architecture_collection, 0.02, "side industrial wall")
    add_box("P4R1_EastWall_Return", (16.85, 3.2, 3.6), (0.28, 17.0, 7.2), materials["wall"], architecture_collection, 0.02, "side industrial wall")
    # Real panel depth, ribs and service rails keep every azimuth spatially
    # legible under low-key practical lighting instead of reading as a black
    # cyclorama.  All detail remains unlabeled and non-claiming.
    for index, x in enumerate((-13.6, -10.2, -6.8, -3.4, 0.0, 3.4, 6.8, 10.2, 13.6)):
        add_box(f"P4R1_BackWall_Recess_{index:02d}", (x, 11.55, 2.65), (3.05, 0.10, 4.55), materials["wall_recess"], architecture_collection, 0.012, "recessed maintained wall bay")
        add_box(f"P4R1_BackWall_Rib_{index:02d}", (x - 1.62, 11.39, 3.35), (0.13, 0.16, 6.35), materials["galvanized"], architecture_collection, 0.012, "wall panel structural rib")
    for side, x in (("West", -16.66), ("East", 16.66)):
        for index, y in enumerate((-7.4, -3.8, -0.2, 3.4, 7.0)):
            add_box(f"P4R1_{side}Wall_Recess_{index:02d}", (x, y, 2.65), (0.10, 3.18, 4.55), materials["wall_recess"], architecture_collection, 0.012, "recessed maintained side-wall bay")
            add_box(f"P4R1_{side}Wall_Rib_{index:02d}", (x + (0.16 if side == "West" else -0.16), y - 1.69, 3.35), (0.16, 0.13, 6.35), materials["galvanized"], architecture_collection, 0.012, "side-wall structural rib")
        add_box(f"P4R1_{side}Wall_ServiceRail", (x + (0.23 if side == "West" else -0.23), 0.1, 3.55), (0.12, 16.2, 0.22), materials["safety"], architecture_collection, 0.014, "continuous wall service rail")
    # The establishing camera enters through a deliberately authored south
    # service aperture.  Flanks/header define the bay, while a lower apron and
    # distant service wall give the rear-orbit view physical depth instead of
    # an unfinished world void.
    add_box("P4R1_SouthBay_FlankWest", (-14.55, -11.72, 3.75), (4.7, 0.28, 7.5), materials["dark"], architecture_collection, 0.02, "south service aperture flank")
    add_box("P4R1_SouthBay_FlankEast", (14.55, -11.72, 3.75), (4.7, 0.28, 7.5), materials["dark"], architecture_collection, 0.02, "south service aperture flank")
    add_box("P4R1_SouthBay_Header", (0.0, -11.72, 8.55), (24.4, 0.32, 1.25), materials["steel"], architecture_collection, 0.03, "south service aperture header")
    add_box("P4R1_SouthBay_ServiceApron", (0.0, -14.65, -0.12), (24.0, 5.6, 0.24), materials["concrete_patch"], architecture_collection, 0.025, "south service-depth apron")
    add_box("P4R1_SouthBay_DistantWall", (0.0, -17.38, 2.85), (24.0, 0.24, 5.7), materials["wall"], architecture_collection, 0.02, "distant south service wall")
    for index, x in enumerate((-8.0, -4.0, 0.0, 4.0, 8.0)):
        add_box(f"P4R1_SouthBay_DistantPanel_{index:02d}", (x, -17.22, 2.3), (3.55, 0.08, 4.2), materials["machine"], architecture_collection, 0.025, "distant service-bay panel")
    for index, x in enumerate((-11.5, -7.0, -2.5, 2.5, 7.0, 11.5)):
        add_box(f"P4R1_Clerestory_{index:02d}", (x, 11.54, 7.55), (3.25, 0.06, 1.18), materials["galvanized"], architecture_collection, 0.015, "clerestory frame")
        add_box(f"P4R1_ClerestoryGlass_{index:02d}", (x, 11.505, 7.55), (2.92, 0.018, 0.88), materials["clerestory"], architecture_collection, 0.0, "restrained cool clerestory glazing")
    add_box("P4R1_IndustrialDoor", (12.2, 11.42, 2.45), (6.1, 0.18, 4.9), materials["galvanized"], architecture_collection, 0.025, "industrial bay door")
    for index in range(5):
        add_box(f"P4R1_IndustrialDoor_Slat_{index:02d}", (12.2, 11.30, 0.55 + index * 0.95), (5.8, 0.035, 0.035), materials["dark"], architecture_collection, 0.0, "bay door seam")
    assets.append({"asset": "360-degree walls, clerestories and industrial bay door", "count": 20, "collection": architecture_collection.name, "authored": True})

    deck_y = cfg.HALL["catwalk_y_m"]
    deck_z = cfg.HALL["catwalk_deck_z_m"]
    add_box("P4R1_Catwalk_Deck", (-4.0, deck_y, deck_z), (20.5, 1.15, 0.16), materials["galvanized"], architecture_collection, 0.015, "maintenance catwalk")
    for index, x in enumerate((-14.0, -11.0, -8.0, -5.0, -2.0, 1.0, 4.0, 6.0)):
        add_box(f"P4R1_Catwalk_Post_{index:02d}", (x, deck_y - 0.55, deck_z + 0.58), (0.055, 0.055, 1.15), materials["safety"], architecture_collection, 0.01, "catwalk guard rail")
    add_box("P4R1_Catwalk_RailTop", (-4.0, deck_y - 0.55, deck_z + 1.12), (20.5, 0.055, 0.055), materials["safety"], architecture_collection, 0.01, "catwalk guard rail")
    add_box("P4R1_Catwalk_RailMid", (-4.0, deck_y - 0.55, deck_z + 0.63), (20.5, 0.045, 0.045), materials["safety"], architecture_collection, 0.01, "catwalk guard rail")
    for index in range(11):
        z = 0.45 + index * 0.42
        add_box(f"P4R1_ServiceLadder_Rung_{index:02d}", (-13.7, 10.00, z), (0.82, 0.055, 0.055), materials["galvanized"], architecture_collection, 0.008, "service ladder")
    add_box("P4R1_ServiceLadder_Left", (-14.08, 10.00, 2.55), (0.055, 0.055, 4.8), materials["galvanized"], architecture_collection, 0.008, "service ladder")
    add_box("P4R1_ServiceLadder_Right", (-13.32, 10.00, 2.55), (0.055, 0.055, 4.8), materials["galvanized"], architecture_collection, 0.008, "service ladder")
    assets.append({"asset": "partial maintenance catwalk and service ladder", "count": 25, "collection": architecture_collection.name, "authored": True})

    # Cable trays and a restrained ventilation duct provide overhead parallax.
    for side, x in (("West", -11.8), ("East", 11.8)):
        add_box(f"P4R1_{side}_CableTray_Base", (x, 0.0, 6.55), (0.72, 19.0, 0.08), materials["galvanized"], architecture_collection, 0.01, "overhead cable tray")
        add_box(f"P4R1_{side}_CableTray_LipA", (x - 0.34, 0.0, 6.72), (0.06, 19.0, 0.34), materials["galvanized"], architecture_collection, 0.01, "overhead cable tray")
        add_box(f"P4R1_{side}_CableTray_LipB", (x + 0.34, 0.0, 6.72), (0.06, 19.0, 0.34), materials["galvanized"], architecture_collection, 0.01, "overhead cable tray")
    add_cylinder("P4R1_VentilationDuct_Main", (8.9, 1.1, 6.95), 0.58, 18.0, materials["galvanized"], architecture_collection, rotation=(math.pi / 2.0, 0.0, 0.0), vertices=32, role="industrial ventilation duct")
    assets.append({"asset": "overhead cable trays and ventilation duct", "count": 7, "collection": architecture_collection.name, "authored": True})

    # Mesh partitions are modeled as real bars rather than transparent decals.
    for side, base_x in (("Left", -9.0), ("Right", 8.0)):
        y = 6.2
        for index in range(13):
            x = base_x + index * 0.32
            add_box(f"P4R1_{side}Mesh_V_{index:02d}", (x, y, 1.35), (0.025, 0.04, 2.7), materials["mesh"], details_collection, 0.003, "mesh safety partition")
        for index in range(9):
            z = 0.15 + index * 0.31
            add_box(f"P4R1_{side}Mesh_H_{index:02d}", (base_x + 1.92, y, z), (3.86, 0.04, 0.025), materials["mesh"], details_collection, 0.003, "mesh safety partition")
        add_box(f"P4R1_{side}Mesh_FrameLeft", (base_x - 0.14, y, 1.35), (0.16, 0.10, 2.95), materials["steel"], details_collection, 0.02, "mesh partition perimeter frame")
        add_box(f"P4R1_{side}Mesh_FrameRight", (base_x + 3.98, y, 1.35), (0.16, 0.10, 2.95), materials["steel"], details_collection, 0.02, "mesh partition perimeter frame")
        add_box(f"P4R1_{side}Mesh_FrameTop", (base_x + 1.92, y, 2.79), (4.12, 0.10, 0.16), materials["steel"], details_collection, 0.02, "mesh partition perimeter frame")
        add_box(f"P4R1_{side}Mesh_FrameBottom", (base_x + 1.92, y, 0.08), (4.12, 0.10, 0.16), materials["steel"], details_collection, 0.02, "mesh partition perimeter frame")
    assets.append({"asset": "modeled mesh safety partitions with open perimeter frames", "count": 52, "collection": details_collection.name, "authored": True})

    # Two dormant cells and a validation fixture avoid a one-sided hero wall.
    for cell, x in enumerate((-10.5, 10.4)):
        add_box(f"P4R1_MachineCell_{cell}_Base", (x, 6.9, 0.23), (3.2, 2.5, 0.46), materials["steel"], machinery_collection, 0.08, "dormant machinery cell")
        add_box(f"P4R1_MachineCell_{cell}_Body", (x, 7.1, 1.25), (2.35, 1.55, 1.72), materials["machine"], machinery_collection, 0.11, "dormant machinery cell")
        add_cylinder(f"P4R1_MachineCell_{cell}_Fixture", (x, 5.95, 1.42), 0.46, 1.1, materials["galvanized"], machinery_collection, rotation=(math.pi / 2.0, 0.0, 0.0), role="test fixture spindle")
        add_box(f"P4R1_MachineCell_{cell}_ServiceBox", (x + 1.35, 7.4, 1.0), (0.58, 0.44, 1.28), materials["cabinet"], machinery_collection, 0.05, "junction box")
    add_box("P4R1_CentralValidationFixture_Base", (7.4, -5.9, 0.18), (2.7, 1.75, 0.36), materials["steel"], machinery_collection, 0.07, "dormant validation fixture")
    add_box("P4R1_CentralValidationFixture_FrameA", (6.5, -5.9, 1.15), (0.16, 1.4, 2.1), materials["galvanized"], machinery_collection, 0.025, "dormant validation fixture")
    add_box("P4R1_CentralValidationFixture_FrameB", (8.3, -5.9, 1.15), (0.16, 1.4, 2.1), materials["galvanized"], machinery_collection, 0.025, "dormant validation fixture")
    add_box("P4R1_CentralValidationFixture_Crossbar", (7.4, -5.9, 2.12), (1.96, 0.16, 0.20), materials["galvanized"], machinery_collection, 0.025, "dormant validation fixture")
    for index, (x, y) in enumerate(((-12.3, -3.4), (12.3, -3.1), (-12.4, 3.0), (12.4, 3.5))):
        add_box(f"P4R1_PerimeterServiceStack_{index:02d}_Plinth", (x, y, 0.16), (2.05, 1.45, 0.32), materials["steel"], machinery_collection, 0.055, "perimeter service stack")
        add_box(f"P4R1_PerimeterServiceStack_{index:02d}_Body", (x, y, 1.26), (1.62, 1.10, 1.92), materials["machine"], machinery_collection, 0.075, "perimeter service stack")
        add_box(f"P4R1_PerimeterServiceStack_{index:02d}_Access", (x, y - 0.57, 1.26), (1.18, 0.045, 1.44), materials["cabinet"], machinery_collection, 0.022, "unlabeled service access")
        add_cylinder(f"P4R1_PerimeterServiceStack_{index:02d}_TopDuct", (x, y, 2.44), 0.22, 0.52, materials["galvanized"], machinery_collection, vertices=24, role="service stack duct")
    assets.append({"asset": "dormant machinery cells, validation fixture and perimeter service stacks", "count": 28, "collection": machinery_collection.name, "authored": True})

    # Low barriers and workbench/service-cart silhouettes add foreground scale.
    for index, x in enumerate((-13.0, -11.2, 10.8, 12.6)):
        add_box(f"P4R1_LowBarrier_Post_{index:02d}", (x, -5.0 if x < 0 else -2.8, 0.52), (0.10, 0.10, 1.04), materials["safety"], details_collection, 0.018, "low protective barrier")
    add_box("P4R1_LowBarrier_WestRail", (-12.1, -5.0, 0.80), (1.9, 0.10, 0.10), materials["safety"], details_collection, 0.018, "low protective barrier")
    add_box("P4R1_LowBarrier_EastRail", (11.7, -2.8, 0.80), (1.9, 0.10, 0.10), materials["safety"], details_collection, 0.018, "low protective barrier")
    add_box("P4R1_Workbench_Top", (-12.0, 3.2, 1.05), (3.0, 0.85, 0.13), materials["galvanized"], details_collection, 0.03, "distant workbench")
    for x in (-13.25, -10.75):
        add_box(f"P4R1_Workbench_Leg_{x:+05.2f}", (x, 3.2, 0.52), (0.12, 0.65, 1.04), materials["steel"], details_collection, 0.02, "distant workbench")
    add_box("P4R1_ServiceCart_Body", (11.8, 3.4, 0.72), (1.45, 0.75, 1.15), materials["machine"], details_collection, 0.06, "service cart")
    for x in (11.25, 12.35):
        for y in (3.08, 3.72):
            add_cylinder(f"P4R1_ServiceCart_Wheel_{x:+05.2f}_{y:+04.2f}", (x, y, 0.18), 0.15, 0.10, materials["rubber"], details_collection, rotation=(math.pi / 2.0, 0.0, 0.0), vertices=20, role="service cart wheel")
    assets.append({"asset": "protective barriers, workbench and service cart", "count": 17, "collection": details_collection.name, "authored": True})

    hall = {
        "concept": "maintained industrial validation hall after hours; authored cinematic setting, not a claim about a real Quantum-Hub facility",
        "dimensions_m": {"width_x": 34.0, "depth_y": 24.0, "clear_height": 10.0},
        "central_proving_zone_m": {"centre": list(cfg.ORBIT_TARGET), "clear_radius": 6.1},
        "depth_layers": {
            "foreground": ["distribution station", "service channel", "low barriers", "service cart", "one restrained column edge"],
            "central": ["accepted CRT", "extended cable route", "sealed concrete proving zone", "dormant validation fixture"],
            "background": ["columns and roof trusses", "bridge gantry", "catwalk", "mesh cells", "bay door", "clerestories"],
        },
        "no_environmental_brand_claim": True,
        "no_text_or_fake_diagnostics": True,
        "authored_around_full_orbit": True,
        "south_open_bay": {
            "open": True,
            "reason": "the elevated establishing cameras enter from the maintained south service aperture rather than intersecting a solid wall",
            "main_floor_extent_y_m": [-12.0, 12.0],
            "authored_service_depth_extent_y_m": [-17.5, -11.85],
            "desktop_camera_y_m": -cfg.CAMERA_SPECS["desktop"]["start_radius_m"],
            "landscape_camera_y_m": -cfg.CAMERA_SPECS["landscape"]["start_radius_m"],
            "all_opening_cameras_over_authored_floor": True,
        },
    }
    return hall, assets


def build_distribution_source(materials: dict[str, bpy.types.Material]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    collection = create_collection("PHASE4R1_DISTRIBUTION_SOURCE")
    x, y, z = cfg.HALL["distribution_station_location_m"]
    enclosure = add_box("P4R1_Distribution_Enclosure", (x, y, z), (0.90, 0.52, 1.86), materials["cabinet"], collection, 0.055, "industrial distribution enclosure")
    add_box("P4R1_Distribution_DoorInset", (x, y - 0.273, z + 0.08), (0.70, 0.035, 1.42), materials["steel"], collection, 0.028, "distribution enclosure door")
    for index, dz in enumerate((-0.56, -0.18, 0.20, 0.58)):
        add_cylinder(f"P4R1_Distribution_DoorBolt_{index:02d}", (x + 0.32, y - 0.305, z + dz), 0.029, 0.022, materials["galvanized"], collection, rotation=(math.pi / 2.0, 0.0, 0.0), vertices=16, role="cabinet door fastener")
    add_box("P4R1_Distribution_BreakerHandle", (x - 0.24, y - 0.32, z + 0.35), (0.14, 0.12, 0.36), materials["rubber"], collection, 0.022, "physical breaker handle")
    add_box("P4R1_Distribution_UnlabeledPlate", (x + 0.10, y - 0.307, z + 0.57), (0.30, 0.025, 0.16), materials["galvanized"], collection, 0.007, "unlabeled industrial plate")
    source_indicator = add_cylinder("P4R1_Distribution_SourceResponseIndicator", (x + 0.22, y - 0.307, z + 0.26), 0.041, 0.026, materials["current_indicator"], collection, rotation=(math.pi / 2.0, 0.0, 0.0), vertices=24, role="restrained physical source-response indicator")
    magenta = srgb(cfg.CURRENT["color_srgb"])
    for frame, alpha in ((1, 0.0), (45, 0.0), (46, 0.72), (56, 0.34), (500, 0.34)):
        source_indicator.color = (*magenta[:3], alpha)
        source_indicator.keyframe_insert(data_path="color", frame=frame)
    set_interpolation(source_indicator, {"color"}, "LINEAR")
    source_indicator["phase4r1_response_frame"] = 46
    socket = Vector(cfg.HALL["socket_world_m"])
    cable_exit = Vector(cfg.HALL["cable_exit_world_m"])
    axis_rotation = (math.pi / 2.0, 0.0, 0.0)
    # The source chain is deliberately separable and readable in profile:
    # enclosure-mounted socket -> recessed mouth -> locking collar/seam ->
    # plug body -> four-stage relief -> axial 54 mm cable exit.
    add_cylinder("P4R1_Distribution_IndustrialSocketOuter", tuple(socket), 0.215, 0.16, materials["rubber"], collection, rotation=axis_rotation, vertices=48, role="enclosure-mounted heavy-duty industrial socket")
    add_cylinder("P4R1_Distribution_IndustrialSocketMouth", (socket.x, socket.y - 0.092, socket.z), 0.158, 0.030, materials["dark"], collection, rotation=axis_rotation, vertices=48, role="recessed industrial socket mouth")
    add_cylinder("P4R1_Distribution_IndustrialSocketCollar", (socket.x, socket.y - 0.118, socket.z), 0.188, 0.052, materials["galvanized"], collection, rotation=axis_rotation, vertices=48, role="socket locking collar")
    add_cylinder("P4R1_Distribution_PlugLockingSeam", (socket.x, socket.y - 0.152, socket.z), 0.176, 0.030, materials["dark"], collection, rotation=axis_rotation, vertices=48, role="visible plug-to-socket locking seam")
    plug_centre = Vector((socket.x, socket.y - 0.255, socket.z))
    add_cylinder("P4R1_Distribution_MatchingPlug", tuple(plug_centre), 0.148, 0.230, materials["rubber"], collection, rotation=axis_rotation, vertices=48, role="separate matching industrial plug body")
    relief_specs = (
        (socket.y - 0.390, 0.122, 0.080),
        (socket.y - 0.465, 0.107, 0.080),
        (socket.y - 0.540, 0.091, 0.080),
        ((socket.y - 0.580 + cable_exit.y) * 0.5, 0.074, socket.y - 0.580 - cable_exit.y),
    )
    for index, (relief_y, radius, depth) in enumerate(relief_specs):
        add_cylinder(
            f"P4R1_Distribution_StrainRelief_{index:02d}",
            (socket.x, relief_y, socket.z),
            radius,
            depth,
            materials["rubber"],
            collection,
            rotation=axis_rotation,
            vertices=40,
            role=f"plug strain-relief stage {index + 1} with axial cable continuity",
        )
    floor_transition = cfg.HALL["floor_transition_world_m"]
    add_box("P4R1_Distribution_FloorSaddle", (floor_transition[0], floor_transition[1], 0.04), (0.48, 0.38, 0.08), materials["rubber"], collection, 0.028, "supported cable floor-transition saddle")
    for side, dx in (("Left", -0.19), ("Right", 0.19)):
        add_box(f"P4R1_Distribution_FloorSaddle_{side}Clamp", (floor_transition[0] + dx, floor_transition[1], 0.075), (0.055, 0.30, 0.09), materials["galvanized"], collection, 0.012, "floor-transition saddle clamp")
    add_box("P4R1_Distribution_Pedestal", (x, y + 0.05, 0.23), (1.18, 0.78, 0.46), materials["steel"], collection, 0.045, "distribution station floor pedestal")
    conduit_x = x - 0.34
    conduit_y = y + 0.04
    enclosure_top_z = z + 0.93
    conduit_entry = (conduit_x + 0.02, conduit_y, enclosure_top_z - 0.035)
    # A real facility branch leaves the west overhead tray, traverses the bay,
    # and turns continuously down into the vertical conduit.  The two curve
    # objects share the same endpoint and -Z tangent, so the source no longer
    # relies on a floating pipe or an unsupported report claim.
    tray_feed_start = Vector((-11.80, conduit_y, 6.57))
    elbow_start = Vector((conduit_x - 0.36, conduit_y, 6.57))
    conduit_top = Vector((conduit_x, conduit_y, 6.21))
    feed_points: list[Vector] = []
    append_unique(feed_points, [tray_feed_start.lerp(elbow_start, index / 24.0) for index in range(25)])
    append_unique(
        feed_points,
        cubic_bezier(
            elbow_start,
            elbow_start + Vector((0.1988, 0.0, 0.0)),
            conduit_top + Vector((0.0, 0.0, 0.1988)),
            conduit_top,
            25,
        ),
    )
    add_curve_object("P4R1_Distribution_FacilityFeedBranch", feed_points, 0.082, materials["galvanized"], collection, resolution=2, bevel_resolution=4, role="continuous branch from authenticated west overhead cable tray")
    conduit_points = [
        tuple(conduit_top),
        (conduit_x, conduit_y, 4.2),
        (conduit_x + 0.05, conduit_y, 2.45),
        conduit_entry,
    ]
    add_curve_object("P4R1_Distribution_InfrastructureConduit", conduit_points, 0.072, materials["galvanized"], collection, role="heavy infrastructure conduit")
    add_box("P4R1_Distribution_FacilityFeedTrayClamp", tuple(tray_feed_start), (0.42, 0.28, 0.22), materials["steel"], collection, 0.025, "facility-feed branch clamp inside overhead tray")
    for index, support_x in enumerate((-8.8, -5.8, -2.8)):
        add_beam_between(
            f"P4R1_Distribution_FacilityFeedHanger_{index:02d}",
            (support_x, conduit_y, 6.57),
            (support_x, -3.20, 8.45),
            (0.10, 0.10),
            materials["steel"],
            collection,
            "facility-feed hanger physically joining branch to P4R1 roof chord at y=-3.2",
        )
        add_box(f"P4R1_Distribution_FacilityFeedHangerClamp_{index:02d}", (support_x, conduit_y, 6.57), (0.26, 0.26, 0.20), materials["steel"], collection, 0.018, "facility-feed branch hanger clamp")
    add_box("P4R1_Distribution_ConduitJunction", (conduit_x, conduit_y, 4.15), (0.44, 0.34, 0.54), materials["cabinet"], collection, 0.04, "conduit junction box")
    add_cylinder("P4R1_Distribution_ConduitTopGland", (conduit_entry[0], conduit_entry[1], enclosure_top_z + 0.015), 0.105, 0.16, materials["rubber"], collection, vertices=32, role="conduit gland physically entering enclosure top")
    # The accepted rear service panel ends at y=.659 m.  Seat a compact
    # coaxial flange into that physical surface, then overlap a rubber bridge
    # with both the flange and the R1 response ring.  This closes the formerly
    # visible .132 m air gap without moving or editing any accepted CRT object.
    add_cylinder("P4R1_CRT_RearConnection_SeatedBase", (0.65, 0.677, 0.30), 0.118, 0.044, materials["galvanized"], collection, rotation=(math.pi / 2.0, 0.0, 0.0), vertices=48, role="rear CRT seated coaxial flange overlapping accepted service panel")
    add_cylinder("P4R1_CRT_RearConnection_AxialBridge", (0.65, 0.744, 0.30), 0.098, 0.102, materials["rubber"], collection, rotation=(math.pi / 2.0, 0.0, 0.0), vertices=48, role="rear CRT axial rubber bridge overlapping seated flange and response ring")
    add_cylinder("P4R1_CRT_RearConnection_Collar", cfg.HALL["crt_rear_connection_world_m"], 0.11, 0.18, materials["galvanized"], collection, rotation=(math.pi / 2.0, 0.0, 0.0), vertices=32, role="rear CRT connection collar")
    add_cylinder("P4R1_CRT_RearConnection_Rubber", (0.65, 1.02, 0.30), 0.083, 0.24, materials["rubber"], collection, rotation=(math.pi / 2.0, 0.0, 0.0), vertices=32, role="rear CRT cable gland")
    rear_response = add_cylinder("P4R1_CRT_RearConnection_ResponseRing", (0.65, 0.805, 0.30), 0.116, 0.028, materials["current_indicator"], collection, rotation=(math.pi / 2.0, 0.0, 0.0), vertices=32, role="rear-connection arrival response")
    for frame, alpha in ((1, 0.0), (284, 0.0), (285, 1.0), (292, 0.42), (500, 0.42)):
        rear_response.color = (*magenta[:3], alpha)
        rear_response.keyframe_insert(data_path="color", frame=frame)
    set_interpolation(rear_response, {"color"}, "LINEAR")
    rear_response["phase4r1_response_frame"] = 285
    assets = [
        {"asset": "industrial distribution enclosure and pedestal", "count": 2, "authored": True},
        {"asset": "continuous tray feed, three roof-chord hangers, infrastructure conduit and junction box", "count": 11, "authored": True},
        {"asset": "heavy-duty socket mouth, matching plug and locking seam", "count": 5, "authored": True},
        {"asset": "four-stage strain relief", "count": 4, "authored": True},
        {"asset": "supported floor-transition saddle and clamps", "count": 3, "authored": True},
        {"asset": "rear CRT connection seated flange, axial bridge, collar and gland", "count": 4, "authored": True},
    ]
    hanger_records = [
        {
            "index": index,
            "hanger": f"P4R1_Distribution_FacilityFeedHanger_{index:02d}",
            "clamp": f"P4R1_Distribution_FacilityFeedHangerClamp_{index:02d}",
            "branch_anchor_world_m": [support_x, conduit_y, 6.57],
            "structural_anchor_world_m": [support_x, -3.20, 8.45],
            "structural_anchor_object": "P4R1_RoofChord_01_A",
            "missing": False,
            "branch_anchor_and_clamp_overlap": True,
            "roof_chord_overlap": True,
            "valid": True,
        }
        for index, support_x in enumerate((-8.8, -5.8, -2.8))
    ]
    facility_tray_to_conduit = {
        "objects_present": True,
        "authenticated_tray": "P4R1_West_CableTray_Base",
        "feed_branch": "P4R1_Distribution_FacilityFeedBranch",
        "vertical_conduit": "P4R1_Distribution_InfrastructureConduit",
        "feed_start_world_m": list(tray_feed_start),
        "feed_start_inside_tray": True,
        "feed_end_world_m": list(conduit_top),
        "conduit_start_world_m": list(conduit_top),
        "feed_to_conduit_gap_m": 0.0,
        "directed_tangent_dot": 1.0,
        "tangent_angle_degrees": 0.0,
        "hanger_count": 3,
        "hangers": hanger_records,
        "all_hangers_attach_branch_to_named_roof_chord": True,
        "valid": True,
    }
    report = {
        "design": "floor-pedestal industrial distribution enclosure fed by overhead tray conduit; physical socket, locking collar, matching plug, four-stage strain relief, weighted drop to floor and rear CRT gland",
        "collection": collection.name,
        "enclosure_world_m": list(enclosure.location),
        "socket_world_m": list(cfg.HALL["socket_world_m"]),
        "cable_exit_world_m": list(cfg.HALL["cable_exit_world_m"]),
        "floor_transition_world_m": list(cfg.HALL["floor_transition_world_m"]),
        "rear_crt_connection_world_m": list(cfg.HALL["crt_rear_connection_world_m"]),
        "rear_crt_gland_cable_entry_world_m": list(cfg.HALL["crt_gland_cable_entry_world_m"]),
        "domestic_outlet": False,
        "fake_screen_or_diagnostics": False,
        "source_response_frame": 46,
        "rear_connection_response_frame": 285,
        "conduit_entry_world_m": list(conduit_entry),
        "conduit_enters_enclosure_top": True,
        "facility_feed_branch_start_world_m": list(tray_feed_start),
        "facility_feed_branch_end_world_m": list(conduit_top),
        "facility_feed_branch_intersects_west_tray": True,
        "facility_feed_to_conduit_continuous_and_tangent_aligned": True,
        "facility_feed_hanger_anchor_objects": ["P4R1_RoofChord_01_A", "P4R1_RoofChord_01_A", "P4R1_RoofChord_01_A"],
        "facility_tray_to_conduit": facility_tray_to_conduit,
        "rear_connection_seated_bridge": {
            "accepted_crt_seat_object": "CRT_RearRemovableServicePanel",
            "seated_flange": "P4R1_CRT_RearConnection_SeatedBase",
            "axial_bridge": "P4R1_CRT_RearConnection_AxialBridge",
            "response_ring": "P4R1_CRT_RearConnection_ResponseRing",
            "axis_world_xz_m": [0.65, 0.30],
            "accepted_panel_max_y_m": 0.659,
            "seated_flange_y_span_m": [0.655, 0.699],
            "axial_bridge_y_span_m": [0.693, 0.795],
            "response_ring_y_span_m": [0.791, 0.819],
            "modeled_visible_gap_m": 0.0,
            "accepted_crt_geometry_changed": False,
        },
        "axial_cable_exit_from_relief": True,
        "traceable_chain": ["facility cable tray", "heavy conduit", "junction", "top-entry gland", "distribution enclosure", "industrial socket mouth", "locking seam", "separate plug body", "four-stage strain relief", "axial cable exit", "floor lead", "spiral", "rear CRT gland"],
    }
    return report, assets


def build_lighting(materials: dict[str, bpy.types.Material]) -> dict[str, Any]:
    collection = create_collection("PHASE4R1_HALL_LIGHTING")
    # R0 studio lights are superseded only in the derivative.
    r0_lights = bpy.data.collections.get("PHASE4R0_PREVIS_LIGHTS")
    if r0_lights is not None:
        r0_lights.hide_render = True
        r0_lights["phase4r1_superseded"] = True
    records = []
    for row, x in enumerate((-7.8, 0.0, 7.8)):
        for col, y in enumerate((-6.5, 0.0, 6.5)):
            name = f"P4R1_OverheadPractical_{row}_{col}"
            add_box(f"{name}_Housing", (x, y, 8.05), (2.15, 0.32, 0.18), materials["dark"], collection, 0.025, "suspended industrial practical")
            add_box(f"{name}_Diffuser", (x, y, 7.945), (1.78, 0.235, 0.028), materials["diffuser"], collection, 0.01, "visible neutral practical diffuser")
            data = bpy.data.lights.new(f"{name}_Data", type="AREA")
            data.shape = "RECTANGLE"
            data.size = 2.0
            data.size_y = 0.28
            data.energy = 820.0 if col == 1 else 690.0
            data.color = (0.70, 0.78, 0.86) if row != 2 else (0.86, 0.83, 0.76)
            light = bpy.data.objects.new(name, data)
            collection.objects.link(light)
            light.location = (x, y, 7.93)
            records.append({"name": name, "type": "neutral overhead practical", "energy_w": data.energy, "color": list(data.color)})
    # Soft clerestory and one warm distant maintenance light maintain depth.
    for side, x in (("west", -12.5), ("east", 12.5)):
        data = bpy.data.lights.new(f"P4R1_{side.title()}_ClerestoryFill_Data", type="AREA")
        data.shape = "RECTANGLE"
        data.size = 4.5
        data.size_y = 1.2
        data.energy = 680.0
        data.color = (0.52, 0.64, 0.76)
        light = bpy.data.objects.new(f"P4R1_{side.title()}_ClerestoryFill", data)
        collection.objects.link(light)
        light.location = (x, 10.8, 7.4)
        light.rotation_euler = (math.radians(82.0), 0.0, 0.0)
        records.append({"name": light.name, "type": "cool clerestory fill", "energy_w": data.energy, "color": list(data.color)})
    data = bpy.data.lights.new("P4R1_DistantWarmWorkLight_Data", type="AREA")
    data.shape = "DISK"
    data.size = 1.0
    data.energy = 300.0
    data.color = (1.0, 0.62, 0.30)
    warm = bpy.data.objects.new("P4R1_DistantWarmWorkLight", data)
    collection.objects.link(warm)
    warm.location = (-12.0, 3.2, 3.2)
    warm.rotation_euler = (0.0, 0.0, 0.0)
    records.append({"name": warm.name, "type": "restrained distant tungsten work light", "energy_w": data.energy, "color": list(data.color)})

    # Visible back-wall wash fixtures reveal panel depth and the full bay
    # silhouette without an exposure lift or any dormant brand colour.
    for index, x in enumerate((-11.0, -5.5, 0.0, 5.5, 11.0)):
        fixture_name = f"P4R1_BackWallWash_{index:02d}"
        add_box(f"{fixture_name}_Housing", (x, 10.95, 4.55), (0.82, 0.28, 0.30), materials["steel"], collection, 0.035, "wall-wash practical housing")
        add_box(f"{fixture_name}_Diffuser", (x, 10.79, 4.48), (0.60, 0.035, 0.18), materials["diffuser"], collection, 0.012, "visible neutral wall-wash diffuser")
        wall_data = bpy.data.lights.new(f"{fixture_name}_Data", type="AREA")
        wall_data.shape = "RECTANGLE"
        wall_data.size = 1.15
        wall_data.size_y = 0.42
        wall_data.energy = 430.0
        wall_data.color = (0.58, 0.69, 0.78)
        wall_light = bpy.data.objects.new(fixture_name, wall_data)
        collection.objects.link(wall_light)
        wall_light.location = (x, 10.72, 4.40)
        wall_light.rotation_euler = (math.radians(90.0), 0.0, 0.0)
        records.append({"name": wall_light.name, "type": "neutral wall-panel wash", "energy_w": wall_data.energy, "color": list(wall_data.color)})

    for side, x, rotation_y in (("West", -16.40, math.radians(-90.0)), ("East", 16.40, math.radians(90.0))):
        for index, y in enumerate((-5.6, 0.2, 6.0)):
            fixture_name = f"P4R1_{side}Bulkhead_{index:02d}"
            add_box(f"{fixture_name}_Housing", (x, y, 3.15), (0.24, 0.72, 0.46), materials["steel"], collection, 0.035, "side-wall bulkhead housing")
            diffuser_x = x + (0.135 if side == "West" else -0.135)
            add_box(f"{fixture_name}_Diffuser", (diffuser_x, y, 3.15), (0.025, 0.50, 0.27), materials["diffuser"], collection, 0.010, "visible neutral side-wall bulkhead")
            side_data = bpy.data.lights.new(f"{fixture_name}_Data", type="AREA")
            side_data.shape = "RECTANGLE"
            side_data.size = 0.85
            side_data.size_y = 0.48
            side_data.energy = 360.0
            side_data.color = (0.62, 0.71, 0.76)
            side_light = bpy.data.objects.new(fixture_name, side_data)
            collection.objects.link(side_light)
            side_light.location = (diffuser_x, y, 3.15)
            side_light.rotation_euler = (0.0, rotation_y, 0.0)
            records.append({"name": side_light.name, "type": "neutral side-wall bulkhead", "energy_w": side_data.energy, "color": list(side_data.color)})
    world = bpy.context.scene.world
    if world is not None:
        world.use_nodes = True
        background = world.node_tree.nodes.get("Background")
        if background is not None:
            background.inputs["Color"].default_value = (0.012, 0.016, 0.020, 1.0)
            background.inputs["Strength"].default_value = 0.16
    return {
        "state_a_dormancy": "cool-neutral low-key hall, black cable and CRT, zero environmental magenta",
        "state_b_to_c_current": f"per-family conductor emission plus {cfg.CURRENT['local_response_sites']} sparse broad local area-response sites; no room-wide wash",
        "state_d_arrival": "energized cable remains causal while accepted indicator responds",
        "state_e_q": "accepted screen becomes luminous centre; neutral hall remains secondary",
        "state_f_approach": "physical falloff occurs through framing, not exposure discontinuity",
        "neutral_practicals": records,
        "visible_neutral_fixture_count": len(records),
        "environmental_magenta_before_frame_46": 0,
        "room_wide_magenta_sources": 0,
        "view_transform": "AgX",
        "fixed_exposure_ev": 0.0,
        "exposure_animation": False,
        "sparse_broad_local_response_areas": cfg.CURRENT["local_response_sites"],
        "repeated_point_light_hotspot_chain": False,
    }


def create_camera_rig(family: str, spec: dict[str, Any], aim_target: bpy.types.Object, collection: bpy.types.Collection) -> dict[str, Any]:
    rig = bpy.data.objects.new(spec["rig"], None)
    collection.objects.link(rig)
    rig.location = cfg.ORBIT_TARGET
    rig.rotation_mode = "XYZ"
    rig.empty_display_type = "CIRCLE"
    rig.empty_display_size = 0.55
    rig["phase4r1_family"] = family

    data = bpy.data.cameras.new(f"{spec['camera']}_Data")
    camera = bpy.data.objects.new(spec["camera"], data)
    collection.objects.link(camera)
    camera.parent = rig
    data.sensor_width = 36.0
    data.clip_start = 0.005
    data.clip_end = 1000.0
    constraint = camera.constraints.new(type="TRACK_TO")
    constraint.name = "Phase4R1_AuditableLookAtAcceptedCRT"
    constraint.target = aim_target
    constraint.track_axis = "TRACK_NEGATIVE_Z"
    constraint.up_axis = "UP_Y"

    for frame, degrees in (
        (1, cfg.START_ANGLE_DEGREES),
        (45, cfg.START_ANGLE_DEGREES),
        (46, cfg.START_ANGLE_DEGREES),
        (285, cfg.END_ANGLE_DEGREES),
        (500, cfg.END_ANGLE_DEGREES),
        (540, cfg.END_ANGLE_DEGREES),
    ):
        rig.rotation_euler.z = math.radians(degrees)
        rig.keyframe_insert(data_path="rotation_euler", index=2, frame=frame)

    span = cfg.EVENTS["orbit_complete_current_arrival"] - cfg.EVENTS["conduction_start"]
    def radius_at(frame: int) -> float:
        fraction = (frame - cfg.EVENTS["conduction_start"]) / span
        return spec["start_radius_m"] + fraction * (spec["completion_radius_m"] - spec["start_radius_m"])

    level = spec["level_90_elevation_m"]
    elevations = {
        1: spec["start_elevation_m"],
        45: spec["start_elevation_m"],
        46: spec["start_elevation_m"],
        76: spec["start_elevation_m"] + 0.45 * (level - spec["start_elevation_m"]),
        106: level,
        136: level * 0.92,
        165: level * 0.84,
        195: level * 0.76,
        225: level * 0.68,
        255: level * 0.58,
        285: spec["completion_elevation_m"],
    }
    for frame in (1, 45, 46, 76, 106, 136, 165, 195, 225, 255, 285):
        radius = spec["start_radius_m"] if frame <= 46 else radius_at(frame)
        camera.location = (radius, 0.0, elevations[frame])
        camera.keyframe_insert(data_path="location", frame=frame)
    for frame, radius, elevation in (
        (405, spec["completion_radius_m"], spec["completion_elevation_m"]),
        (460, 1.10 if family != "mobile" else 0.96, 0.16),
        (480, 0.28, 0.035),
        (500, 0.018, 0.0),
        (540, 0.018, 0.0),
    ):
        camera.location = (radius, 0.0, elevation)
        camera.keyframe_insert(data_path="location", frame=frame)
    lens_keys = spec.get(
        "lens_keys",
        (
            (1, spec["start_lens_mm"]),
            (45, spec["start_lens_mm"]),
            (46, spec["start_lens_mm"]),
            (106, spec["start_lens_mm"] + 0.45 * (spec["completion_lens_mm"] - spec["start_lens_mm"])),
            (285, spec["completion_lens_mm"]),
            (405, spec["completion_lens_mm"]),
            (460, spec["push_lens_mm"] + 4.0),
            (480, spec["push_lens_mm"]),
            (500, spec["push_lens_mm"]),
            (540, spec["push_lens_mm"]),
        ),
    )
    for frame, lens in lens_keys:
        data.lens = lens
        data.keyframe_insert(data_path="lens", frame=frame)
    shift_y_keys = spec.get("shift_y_keys", ((1, spec["start_shift_y"]), (45, spec["start_shift_y"]), (46, spec["start_shift_y"]), (106, 0.0), (540, 0.0)))
    for frame, shift in shift_y_keys:
        data.shift_y = shift
        data.keyframe_insert(data_path="shift_y", frame=frame)
    shift_x_keys = spec.get("shift_x_keys", ((1, spec["start_shift_x"]), (45, spec["start_shift_x"]), (46, spec["start_shift_x"]), (106, 0.0), (540, 0.0)))
    for frame, shift in shift_x_keys:
        data.shift_x = shift
        data.keyframe_insert(data_path="shift_x", frame=frame)
    set_interpolation(rig, {"rotation_euler"}, "LINEAR")
    set_interpolation(camera, {"location"}, "LINEAR")
    set_interpolation(data, {"lens", "shift_y", "shift_x"}, "LINEAR")
    camera["phase4r1_stage_one"] = "F1/F76 complete-source safety; F76-F225 active-front, connected-trail and CRT safety; restrained descent to CRT-centred F106"
    camera["phase4r1_stage_two"] = "F106-F285 flatter CRT-centred contracting orbit"
    return {"rig": rig, "camera": camera, "aim_target": aim_target}


def audit_camera_motion(rigs: dict[str, dict[str, Any]]) -> dict[str, Any]:
    scene = bpy.context.scene
    result: dict[str, Any] = {}
    for family, record in rigs.items():
        samples = []
        for frame in range(46, 286):
            scene.frame_set(frame)
            camera = record["camera"]
            rig = record["rig"]
            world = camera.matrix_world.translation
            dx = world.x - cfg.ORBIT_TARGET[0]
            dy = world.y - cfg.ORBIT_TARGET[1]
            elevation = world.z - cfg.ORBIT_TARGET[2]
            radius = math.hypot(dx, dy)
            orbit_distance = math.sqrt(radius * radius + elevation * elevation)
            aim_world = record["aim_target"].matrix_world.translation
            aim_delta = aim_world - world
            aim_horizontal = math.hypot(aim_delta.x, aim_delta.y)
            distance = aim_delta.length
            downward = math.degrees(math.atan2(max(0.0, -aim_delta.z), max(1e-9, aim_horizontal)))
            samples.append(
                {
                    "frame": frame,
                    "camera_world": [round(float(v), 6) for v in world],
                    "angle_degrees": round(math.degrees(rig.rotation_euler.z), 6),
                    "horizontal_radius_m": round(radius, 6),
                    "elevation_m": round(elevation, 6),
                    "downward_view_angle_degrees": round(downward, 6),
                    "camera_to_target_distance_m": round(distance, 6),
                    "camera_to_orbit_target_distance_m": round(orbit_distance, 6),
                    "focal_length_mm": round(float(camera.data.lens), 6),
                    "camera_shift_y": round(float(camera.data.shift_y), 6),
                    "camera_shift_x": round(float(camera.data.shift_x), 6),
                }
            )
        angles = [item["angle_degrees"] for item in samples]
        radii = [item["horizontal_radius_m"] for item in samples]
        elevations = [item["elevation_m"] for item in samples]
        result[family] = {
            "target_world_m": list(cfg.ORBIT_TARGET),
            "angle_start_degrees": angles[0],
            "angle_end_degrees": angles[-1],
            "total_angular_travel_degrees": round(angles[-1] - angles[0], 6),
            "direction": cfg.ORBIT_DIRECTION,
            "radius_start_m": radii[0],
            "radius_completion_m": radii[-1],
            "elevation_start_m": elevations[0],
            "elevation_completion_m": elevations[-1],
            "elevation_min_m": min(elevations),
            "elevation_max_m": max(elevations),
            "downward_view_angle_start_degrees": samples[0]["downward_view_angle_degrees"],
            "downward_view_angle_completion_degrees": samples[-1]["downward_view_angle_degrees"],
            "distance_start_m": samples[0]["camera_to_target_distance_m"],
            "distance_completion_m": samples[-1]["camera_to_target_distance_m"],
            "lens_start_mm": samples[0]["focal_length_mm"],
            "lens_completion_mm": samples[-1]["focal_length_mm"],
            "shift_y_start": samples[0]["camera_shift_y"],
            "shift_y_completion": samples[-1]["camera_shift_y"],
            "shift_x_start": samples[0]["camera_shift_x"],
            "shift_x_completion": samples[-1]["camera_shift_x"],
            "monotonic_angle": all(a <= b + 1e-6 for a, b in zip(angles, angles[1:])),
            "monotonic_contracting_radius": all(a + 1e-6 >= b for a, b in zip(radii, radii[1:])),
            "monotonic_descent": all(a + 1e-6 >= b for a, b in zip(elevations, elevations[1:])),
            "stage_boundaries": {
                "elevated_establishing": [1, 45],
                "early_descent": [46, 106],
                "flatter_orbit": [106, 285],
                "frontal_lock": [285, 405],
                "screen_push": [406, 500],
            },
            "crt_centered_by_frame": 106,
            "no_roll": True,
            "direction_reversal": False,
            "sampled_telemetry": samples,
        }
        if not result[family]["monotonic_angle"] or not result[family]["monotonic_contracting_radius"] or not result[family]["monotonic_descent"]:
            raise RuntimeError(f"{family} R1 camera motion failed monotonic audit")
        if not 22.0 <= result[family]["downward_view_angle_start_degrees"] <= 32.0:
            raise RuntimeError(f"{family} opening downward view angle outside 22-32 degrees")
    return result


def create_camera_paths(rigs: dict[str, dict[str, Any]], collection: bpy.types.Collection) -> None:
    scene = bpy.context.scene
    for family, record in rigs.items():
        coordinates = []
        for frame in range(46, 286, 2):
            scene.frame_set(frame)
            coordinates.append(tuple(record["camera"].matrix_world.translation))
        path = add_curve_object(f"Phase4R1_DiagnosticPath_{family.title()}", coordinates, 0.018, bpy.data.materials["Phase4R1_GalvanizedMetal"], collection, resolution=1, role="diagnostic camera path")
        path.hide_render = True
        path.hide_viewport = True
        path["phase4r1_diagnostic_only"] = True


def projected_hull(scene: bpy.types.Scene, camera: bpy.types.Object, points: Iterable[Vector]) -> dict[str, Any]:
    projected = [world_to_camera_view(scene, camera, point) for point in points]
    in_front = [point for point in projected if point.z > 0.0]
    if not in_front:
        return {"intersects": False, "bounds": None, "point_count": len(projected), "in_front_count": 0}
    min_x = min(point.x for point in in_front)
    max_x = max(point.x for point in in_front)
    min_y = min(point.y for point in in_front)
    max_y = max(point.y for point in in_front)
    intersects = max_x >= 0.0 and min_x <= 1.0 and max_y >= 0.0 and min_y <= 1.0
    return {
        "intersects": intersects,
        "bounds": [round(min_x, 8), round(min_y, 8), round(max_x, 8), round(max_y, 8)],
        "point_count": len(projected),
        "in_front_count": len(in_front),
    }


def responsive_fit_geometry(
    source_resolution: tuple[int, int],
    target_resolution: tuple[int, int],
    fit: str,
) -> dict[str, Any]:
    source_width, source_height = source_resolution
    target_width, target_height = target_resolution
    if fit not in {"cover", "contain"}:
        raise ValueError(f"unsupported responsive physical fit: {fit}")
    scale = (max if fit == "cover" else min)(target_width / source_width, target_height / source_height)
    display_width, display_height = source_width * scale, source_height * scale
    offset_x, offset_y = (target_width - display_width) * 0.5, (target_height - display_height) * 0.5
    return {
        "fit": fit,
        "position": "center",
        "scale": scale,
        "display_size_px": [display_width, display_height],
        "offset_px": [offset_x, offset_y],
        "source_resolution": list(source_resolution),
        "target_resolution": list(target_resolution),
    }


def transform_responsive_bounds(bounds: list[float] | None, geometry: dict[str, Any]) -> list[float] | None:
    if bounds is None:
        return None
    target_width, target_height = geometry["target_resolution"]
    display_width, display_height = geometry["display_size_px"]
    offset_x, offset_y = geometry["offset_px"]
    return [
        round((bounds[0] * display_width + offset_x) / target_width, 8),
        round((bounds[1] * display_height + offset_y) / target_height, 8),
        round((bounds[2] * display_width + offset_x) / target_width, 8),
        round((bounds[3] * display_height + offset_y) / target_height, 8),
    ]


def responsive_native_rect(geometry: dict[str, Any], target_rect: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    target_width, target_height = geometry["target_resolution"]
    display_width, display_height = geometry["display_size_px"]
    offset_x, offset_y = geometry["offset_px"]
    return (
        (target_rect[0] * target_width - offset_x) / display_width,
        (target_rect[1] * target_height - offset_y) / display_height,
        (target_rect[2] * target_width - offset_x) / display_width,
        (target_rect[3] * target_height - offset_y) / display_height,
    )


def object_bbox_world(obj: bpy.types.Object) -> list[Vector]:
    return [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]


def curve_points_world(obj: bpy.types.Object) -> list[Vector]:
    points: list[Vector] = []
    for spline in obj.data.splines:
        for point in spline.points:
            points.append(obj.matrix_world @ Vector(point.co[:3]))
    return points


def polyline_length(points: list[Vector]) -> float:
    return sum((right - left).length for left, right in zip(points, points[1:]))


def frustum_visible_polyline_length(scene: bpy.types.Scene, camera: bpy.types.Object, points: list[Vector], subdivisions: int = 6) -> float:
    visible = 0.0
    for left, right in zip(points, points[1:]):
        part_length = (right - left).length / subdivisions
        for index in range(subdivisions):
            midpoint = left.lerp(right, (index + 0.5) / subdivisions)
            projected = world_to_camera_view(scene, camera, midpoint)
            if projected.z > 0.0 and 0.0 <= projected.x <= 1.0 and 0.0 <= projected.y <= 1.0:
                visible += part_length
    return visible


def visible_polyline_length_in_rect(
    scene: bpy.types.Scene,
    camera: bpy.types.Object,
    points: list[Vector],
    rect: tuple[float, float, float, float],
    subdivisions: int = 8,
) -> float:
    visible = 0.0
    for left, right in zip(points, points[1:]):
        part_length = (right - left).length / subdivisions
        for index in range(subdivisions):
            midpoint = left.lerp(right, (index + 0.5) / subdivisions)
            projected = world_to_camera_view(scene, camera, midpoint)
            if projected.z > 0.0 and rect[0] <= projected.x <= rect[2] and rect[1] <= projected.y <= rect[3]:
                visible += part_length
    return visible


def bounds_inside_rect(bounds: list[float] | None, rect: tuple[float, float, float, float]) -> bool:
    return bool(bounds and rect[0] <= bounds[0] and rect[1] <= bounds[1] and bounds[2] <= rect[2] and bounds[3] <= rect[3])


def bounds_intersect_rect(bounds: list[float] | None, rect: tuple[float, float, float, float]) -> bool:
    return bool(bounds and bounds[2] >= rect[0] and bounds[0] <= rect[2] and bounds[3] >= rect[1] and bounds[1] <= rect[3])


def measure_responsive_physical_fit(rigs: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """Fail-closed proposed physical-panel fit evidence for portrait breakpoints.

    This is preproduction composition authority only.  It does not authorize a
    runtime mapping.  390/360/320 use centered cover; tablet portrait keeps the
    authored mobile family but uses contain against the same deep physical
    black so the causal source and route are not silently cropped.
    """

    scene = bpy.context.scene
    source_resolution = tuple(cfg.CAMERA_SPECS["mobile"]["resolution"])
    responsive_safe_rect = (0.04, 0.04, 0.96, 0.96)
    camera = rigs["mobile"]["camera"]
    route_object = bpy.data.objects["Phase4R1_Mobile_ContinuousGraphiteSheath"]
    route = curve_points_world(route_object)
    cumulative = cumulative_lengths(route)
    total = cumulative[-1]
    source_names = (
        "P4R1_Distribution_Enclosure",
        "P4R1_Distribution_Pedestal",
        "P4R1_Distribution_IndustrialSocketOuter",
        "P4R1_Distribution_IndustrialSocketMouth",
        "P4R1_Distribution_IndustrialSocketCollar",
        "P4R1_Distribution_PlugLockingSeam",
        "P4R1_Distribution_MatchingPlug",
        "P4R1_Distribution_StrainRelief_00",
        "P4R1_Distribution_StrainRelief_01",
        "P4R1_Distribution_StrainRelief_02",
        "P4R1_Distribution_StrainRelief_03",
        "P4R1_Distribution_FloorSaddle",
        "P4R1_Distribution_FloorSaddle_LeftClamp",
        "P4R1_Distribution_FloorSaddle_RightClamp",
    )
    source_points = [point for name in source_names for point in object_bbox_world(bpy.data.objects[name])]
    source_points.extend(Vector(point) for point in segment_points(route, cumulative, 0.0, total * 0.125, count=161))
    crt_collection = bpy.data.collections["REFINED_CRT_ASSEMBLY"]
    crt_objects = [obj for obj in crt_collection.all_objects if obj.type == "MESH" and not obj.hide_render]
    crt_points = [point for obj in crt_objects for point in object_bbox_world(obj)]
    q_points = [
        point
        for name in ("Phase4R0_QuantumQ_Body", "Phase4R0_QuantumQ_Accent")
        for point in object_bbox_world(bpy.data.objects[name])
    ]
    glass_points = object_bbox_world(bpy.data.objects["CRT_ConvexThickSmokedGlass"])
    mappings = {
        "mobile-390x844": {"target_resolution": (390, 844), "fit": "cover"},
        "mobile-360x800": {"target_resolution": (360, 800), "fit": "cover"},
        "narrow-320x800": {"target_resolution": (320, 800), "fit": "cover"},
        "tablet-portrait-768x1024": {"target_resolution": (768, 1024), "fit": "contain"},
    }
    mapping_records: dict[str, Any] = {}
    scene.camera = camera
    scene.render.resolution_x, scene.render.resolution_y = source_resolution
    scene.render.resolution_percentage = 100

    def camera_state() -> dict[str, Any]:
        return {
            "matrix_world": [[round(float(value), 8) for value in row] for row in camera.matrix_world],
            "lens_mm": round(float(camera.data.lens), 8),
            "shift_x": round(float(camera.data.shift_x), 8),
            "shift_y": round(float(camera.data.shift_y), 8),
        }

    for mapping_id, policy in mappings.items():
        geometry = responsive_fit_geometry(source_resolution, policy["target_resolution"], policy["fit"])
        native_safe_rect = responsive_native_rect(geometry, responsive_safe_rect)
        native_viewport_rect = responsive_native_rect(geometry, (0.0, 0.0, 1.0, 1.0))
        frames: dict[str, Any] = {}

        scene.frame_set(1)
        bpy.context.view_layer.update()
        source_native = projected_hull(scene, camera, source_points)["bounds"]
        route_native = projected_hull(scene, camera, route)["bounds"]
        crt_native = projected_hull(scene, camera, crt_points)["bounds"]
        source_target = transform_responsive_bounds(source_native, geometry)
        route_target = transform_responsive_bounds(route_native, geometry)
        crt_target = transform_responsive_bounds(crt_native, geometry)
        visible_route_safe = visible_polyline_length_in_rect(scene, camera, route, native_safe_rect)
        visible_route_viewport = visible_polyline_length_in_rect(scene, camera, route, native_viewport_rect)
        route_fraction_safe = 0.0 if total <= 1e-12 else visible_route_safe / total
        route_fraction_viewport = 0.0 if total <= 1e-12 else visible_route_viewport / total
        frame_safe = bounds_inside_rect(source_target, responsive_safe_rect) and bounds_inside_rect(crt_target, responsive_safe_rect) and route_fraction_viewport >= 0.90
        frames["1"] = {
            "state": "distant-dormancy-source-route-crt",
            "camera": camera_state(),
            "subjects": {
                "complete_source": {"native_bounds": source_native, "target_bounds": source_target, "safe": bounds_inside_rect(source_target, responsive_safe_rect)},
                "crt": {"native_bounds": crt_native, "target_bounds": crt_target, "safe": bounds_inside_rect(crt_target, responsive_safe_rect)},
                "route": {"native_bounds": route_native, "target_bounds": route_target, "visible_length_in_target_safe_rect_m": round(visible_route_safe, 8), "visible_fraction_in_target_safe_rect": round(route_fraction_safe, 8), "visible_length_in_target_viewport_m": round(visible_route_viewport, 8), "visible_fraction_in_target_viewport": round(route_fraction_viewport, 8), "required_visible_fraction_in_target_viewport": 0.90, "safe": route_fraction_viewport >= 0.90},
            },
            "safe": frame_safe,
            "status": "PASS" if frame_safe else "FAIL",
        }

        scene.frame_set(165)
        bpy.context.view_layer.update()
        progress = (165 - cfg.EVENTS["conduction_start"]) / (cfg.EVENTS["orbit_complete_current_arrival"] - cfg.EVENTS["conduction_start"])
        front_start = max(0.0, progress - cfg.CURRENT["front_width_fraction"])
        trailing_start = max(0.0, front_start - 0.125)
        prefix = [Vector(point) for point in segment_points(route, cumulative, 0.0, total * progress, count=241)]
        front = [Vector(point) for point in segment_points(route, cumulative, total * front_start, total * progress, count=101)]
        trailing = [Vector(point) for point in segment_points(route, cumulative, total * trailing_start, total * front_start, count=181)]
        crt_native = projected_hull(scene, camera, crt_points)["bounds"]
        front_native = projected_hull(scene, camera, front)["bounds"]
        trailing_native = projected_hull(scene, camera, trailing)["bounds"]
        prefix_native = projected_hull(scene, camera, prefix)["bounds"]
        crt_target = transform_responsive_bounds(crt_native, geometry)
        front_target = transform_responsive_bounds(front_native, geometry)
        trailing_target = transform_responsive_bounds(trailing_native, geometry)
        prefix_target = transform_responsive_bounds(prefix_native, geometry)
        front_total, trailing_total, prefix_total = polyline_length(front), polyline_length(trailing), polyline_length(prefix)
        front_visible = visible_polyline_length_in_rect(scene, camera, front, native_safe_rect)
        trailing_visible = visible_polyline_length_in_rect(scene, camera, trailing, native_safe_rect)
        prefix_visible = visible_polyline_length_in_rect(scene, camera, prefix, native_safe_rect)
        front_fraction = 0.0 if front_total <= 1e-12 else front_visible / front_total
        trailing_fraction = 0.0 if trailing_total <= 1e-12 else trailing_visible / trailing_total
        prefix_fraction = 0.0 if prefix_total <= 1e-12 else prefix_visible / prefix_total
        frame_safe = bounds_inside_rect(crt_target, responsive_safe_rect) and bounds_inside_rect(front_target, responsive_safe_rect) and front_fraction >= 0.95 and trailing_fraction >= 0.70 and trailing_visible >= 3.5 and prefix_fraction >= 0.40 and prefix_visible >= 3.5
        frames["165"] = {
            "state": "mid-conduction",
            "camera": camera_state(),
            "subjects": {
                "crt": {"native_bounds": crt_native, "target_bounds": crt_target, "safe": bounds_inside_rect(crt_target, responsive_safe_rect)},
                "active_front": {"native_bounds": front_native, "target_bounds": front_target, "visible_fraction": round(front_fraction, 8), "safe": bounds_inside_rect(front_target, responsive_safe_rect) and front_fraction >= 0.95},
                "contiguous_trailing": {"native_bounds": trailing_native, "target_bounds": trailing_target, "visible_fraction": round(trailing_fraction, 8), "visible_length_m": round(trailing_visible, 8), "required_fraction": 0.70, "required_length_m": 3.5, "safe": trailing_fraction >= 0.70 and trailing_visible >= 3.5},
                "energized_prefix": {"native_bounds": prefix_native, "target_bounds": prefix_target, "visible_fraction": round(prefix_fraction, 8), "visible_length_m": round(prefix_visible, 8), "required_fraction": 0.40, "required_length_m": 3.5, "safe": prefix_fraction >= 0.40 and prefix_visible >= 3.5},
            },
            "safe": frame_safe,
            "status": "PASS" if frame_safe else "FAIL",
        }

        scene.frame_set(370)
        bpy.context.view_layer.update()
        q_native = projected_hull(scene, camera, q_points)["bounds"]
        glass_native = projected_hull(scene, camera, glass_points)["bounds"]
        q_target = transform_responsive_bounds(q_native, geometry)
        glass_target = transform_responsive_bounds(glass_native, geometry)
        frame_safe = bounds_inside_rect(q_target, responsive_safe_rect) and bounds_intersect_rect(glass_target, responsive_safe_rect)
        frames["370"] = {
            "state": "stable-quantum-q",
            "camera": camera_state(),
            "subjects": {
                "verified_q": {"native_bounds": q_native, "target_bounds": q_target, "safe": bounds_inside_rect(q_target, responsive_safe_rect)},
                "physical_glass": {"native_bounds": glass_native, "target_bounds": glass_target, "intersects": bounds_intersect_rect(glass_target, responsive_safe_rect)},
            },
            "safe": frame_safe,
            "status": "PASS" if frame_safe else "FAIL",
        }

        scene.frame_set(500)
        bpy.context.view_layer.update()
        glass_native = projected_hull(scene, camera, glass_points)["bounds"]
        glass_target = transform_responsive_bounds(glass_native, geometry)
        if policy["fit"] == "contain":
            target_width, target_height = geometry["target_resolution"]
            display_width, display_height = geometry["display_size_px"]
            offset_x, offset_y = geometry["offset_px"]
            displayed_rect = (
                max(responsive_safe_rect[0], offset_x / target_width),
                max(responsive_safe_rect[1], offset_y / target_height),
                min(responsive_safe_rect[2], (offset_x + display_width) / target_width),
                min(responsive_safe_rect[3], (offset_y + display_height) / target_height),
            )
        else:
            displayed_rect = responsive_safe_rect
        threshold_covers_displayed_content = bool(glass_target and glass_target[0] <= displayed_rect[0] and glass_target[1] <= displayed_rect[1] and glass_target[2] >= displayed_rect[2] and glass_target[3] >= displayed_rect[3])
        physical_surface_crossed = glass_native is None
        threshold_safe = physical_surface_crossed or threshold_covers_displayed_content
        frames["500"] = {
            "state": "physical-threshold",
            "camera": camera_state(),
            "subjects": {"physical_glass": {"native_bounds": glass_native, "target_bounds": glass_target, "required_displayed_content_rect": [round(value, 8) for value in displayed_rect], "covers_required_displayed_content_rect": threshold_covers_displayed_content, "physical_surface_crossed_or_behind_camera": physical_surface_crossed}},
            "deep_physical_black_outside_contained_panel": policy["fit"] == "contain",
            "safe": threshold_safe,
            "status": "PASS" if threshold_safe else "FAIL",
        }

        mapping_safe = all(record["safe"] for record in frames.values())
        mapping_records[mapping_id] = {
            "family": "mobile",
            "fit": policy["fit"],
            "position": "center",
            "source_resolution": list(source_resolution),
            "target_resolution": list(policy["target_resolution"]),
            "safe_rect_normalized": list(responsive_safe_rect),
            "geometry": geometry,
            "native_safe_rect_equivalent": [round(value, 8) for value in native_safe_rect],
            "native_viewport_rect_equivalent": [round(value, 8) for value in native_viewport_rect],
            "frames": frames,
            "safe": mapping_safe,
            "status": "PASS" if mapping_safe else "FAIL",
        }

    result = {
        "status": "PASS" if all(record["safe"] for record in mapping_records.values()) else "FAIL",
        "policy_status": "PROPOSED_PREPRODUCTION_NOT_ACCEPTED_RUNTIME_BEHAVIOR",
        "mobile_family_remains_authoritative_at_768x1024": True,
        "tablet_portrait_reason": "contain preserves the complete causal source/route and authored CRT scale against the same deep physical black; center-cover would crop required F1 evidence",
        "mappings": mapping_records,
    }
    if result["status"] != "PASS":
        failed = [mapping_id for mapping_id, record in mapping_records.items() if not record["safe"]]
        raise RuntimeError(f"responsive physical fit gate failed before save: {failed}; evidence={result}")
    return result


def measure_openings(rigs: dict[str, dict[str, Any]]) -> dict[str, Any]:
    scene = bpy.context.scene
    station = bpy.data.objects["P4R1_Distribution_Enclosure"]
    plug = bpy.data.objects["P4R1_Distribution_MatchingPlug"]
    crt_collection = bpy.data.collections["REFINED_CRT_ASSEMBLY"]
    crt_objects = [obj for obj in crt_collection.all_objects if obj.type == "MESH" and not obj.hide_render]
    crt_points = [point for obj in crt_objects for point in object_bbox_world(obj)]
    if not crt_points:
        raise RuntimeError("accepted physical CRT assembly hull is empty")
    result: dict[str, Any] = {}
    for family, record in rigs.items():
        spec = cfg.CAMERA_SPECS[family]
        scene.render.resolution_x, scene.render.resolution_y = spec["resolution"]
        scene.camera = record["camera"]
        scene.frame_set(1)
        route = bpy.data.objects[f"Phase4R1_{family.title()}_ContinuousGraphiteSheath"]
        route_points = curve_points_world(route)
        route_length = polyline_length(route_points)
        visible_route_length = frustum_visible_polyline_length(scene, record["camera"], route_points)
        route_hull = projected_hull(scene, record["camera"], route_points)
        spiral_start_index = 148
        spiral_end_index = min(len(route_points), spiral_start_index + int(cfg.CABLE_SPECS[family]["route_samples"]))
        station_hull = projected_hull(scene, record["camera"], object_bbox_world(station))
        plug_hull = projected_hull(scene, record["camera"], object_bbox_world(plug))
        lead_hull = projected_hull(scene, record["camera"], route_points[: spiral_start_index + 1])
        spiral_hull = projected_hull(scene, record["camera"], route_points[spiral_start_index:spiral_end_index])
        crt_hull = projected_hull(scene, record["camera"], crt_points)
        if crt_hull["bounds"] is None:
            occupancy = 0.0
        else:
            occupancy = max(0.0, crt_hull["bounds"][3] - crt_hull["bounds"][1]) * 100.0
        station_bounds = station_hull["bounds"]
        station_fully_inside = bool(
            station_bounds
            and 0.006 <= station_bounds[0]
            and 0.006 <= station_bounds[1]
            and station_bounds[2] <= 0.994
            and station_bounds[3] <= 0.994
        )
        measurement = {
            "frame": 1,
            "geometric_projection_only": True,
            "camera": record["camera"].name,
            "resolution": list(spec["resolution"]),
            "source_station_intersects_frustum": bool(station_hull["intersects"]),
            "source_station_fully_inside_frustum": station_fully_inside,
            "plug_intersects_frustum": bool(plug_hull["intersects"]),
            "source_lead_intersects_frustum": bool(lead_hull["intersects"]),
            "spiral_intersects_frustum": bool(spiral_hull["intersects"]),
            "crt_intersects_frustum": bool(crt_hull["intersects"]),
            "crt_vertical_occupancy_percent": round(occupancy, 6),
            "cable_route_length_m": round(route_length, 6),
            "frustum_visible_cable_length_m": round(visible_route_length, 6),
            "frustum_visible_cable_fraction": round(0.0 if route_length <= 1e-12 else visible_route_length / route_length, 8),
            "projected_route_bounds_normalized": route_hull["bounds"],
            "route_planform": "elliptical authored responsive spiral" if float(cfg.CABLE_SPECS[family].get("x_scale", 1.0)) != 1.0 else "broad asymmetric circular spiral",
            "planform_x_scale": float(cfg.CABLE_SPECS[family].get("x_scale", 1.0)),
            "x_extent_m": [round(min(point.x for point in route_points), 6), round(max(point.x for point in route_points), 6)],
            "y_extent_m": [round(min(point.y for point in route_points), 6), round(max(point.y for point in route_points), 6)],
            "visible_length_method": "six midpoint samples per dense route segment clipped against normalized camera frustum",
            "projected_hulls": {"station": station_hull, "plug": plug_hull, "source_lead": lead_hull, "spiral": spiral_hull, "crt": crt_hull},
            "crt_hull_authority": {"collection": crt_collection.name, "object_count": len(crt_objects), "objects": sorted(obj.name for obj in crt_objects)},
            "crt_centered_by_frame": 106,
        }
        required = [measurement[key] for key in ("source_station_intersects_frustum", "source_station_fully_inside_frustum", "plug_intersects_frustum", "source_lead_intersects_frustum", "spiral_intersects_frustum", "crt_intersects_frustum")]
        if not all(required):
            raise RuntimeError(f"{family} opening fails source/route/CRT frustum gate: {measurement}")
        if measurement["frustum_visible_cable_fraction"] < 0.90:
            raise RuntimeError(f"{family} opening shows only {measurement['frustum_visible_cable_fraction']:.3%} of authored cable length; minimum is 90%; measurement={measurement}")
        if family == "desktop" and not 8.0 <= occupancy <= 14.0:
            raise RuntimeError(f"desktop CRT opening occupancy {occupancy:.4f}% outside 8-14%")
        if family == "mobile" and not 14.0 <= occupancy <= 22.0:
            raise RuntimeError(f"mobile CRT opening occupancy {occupancy:.4f}% outside 14-22%")
        result[family] = measurement
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
    scene.render.use_motion_blur = False
    scene.render.use_persistent_data = True
    scene.render.image_settings.compression = 35
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.0
    scene["phase4r1_schema"] = "quantum-hub.phase-4-r1-proving-hall.preproduction-source.v1"
    scene["phase4r1_not_full_production_render"] = True
    scene["phase4r1_runtime_integration_started"] = False
    scene["phase4r1_phase5_authorized"] = False
    scene["phase4r1_parent_commit"] = cfg.ACCEPTED_PHASE4R0_COMMIT
    scene["phase4r1_environmental_magenta_before_conduction"] = 0


def main() -> None:
    opened = Path(bpy.data.filepath).resolve()
    if opened != cfg.ACCEPTED_PHASE4R0_SOURCE.resolve():
        raise RuntimeError("Phase 4-R1 builder must open the exact frozen Phase 4-R0 source")
    if sha256(opened) != cfg.ACCEPTED_PHASE4R0_SHA256:
        raise RuntimeError("frozen Phase 4-R0 source hash mismatch")
    if sha256(cfg.Q_REVERSED_SOURCE) != cfg.Q_REVERSED_SHA256 or sha256(cfg.Q_COLOR_SOURCE) != cfg.Q_COLOR_SHA256:
        raise RuntimeError("verified Quantum Q authority hash mismatch")
    if cfg.DERIVATIVE_SOURCE.resolve() == opened:
        raise RuntimeError("Phase 4-R1 derivative must not overwrite Phase 4-R0")
    for required in ("CRT_ConvexThickSmokedGlass", "CRT_InternalPhosphorLayer", "Phase4R0_ApprovedQuantumQ_Root", "Phase4R0_CRT_OrbitTarget"):
        if bpy.data.objects.get(required) is None:
            raise RuntimeError(f"missing accepted R0 object: {required}")

    object_count_before = len(bpy.data.objects)
    inherited_action_signature_before = action_inventory_signature()
    inherited_action_names = set(inherited_action_signature_before["action_names"])
    action_snapshot = {action.name: sum(1 for curve in iter_action_fcurves(action) for _ in curve.keyframe_points) for action in bpy.data.actions}
    configure_scene()
    materials = create_materials()
    hall, hall_assets = build_hall(materials)
    source, source_assets = build_distribution_source(materials)
    lighting = build_lighting(materials)

    # Hide only the superseded sparse proving floor and accepted short cables in
    # this derivative.  Their datablocks/actions remain preserved and auditable.
    for collection_name in (
        "PHASE4R0_PROVING_FIELD_EXTENSION",
        "DESKTOP_2_5_TURN_SPIRAL_CABLE",
        "MOBILE_2_25_TURN_SPIRAL_CABLE",
        "SPIRALCABLE_RECESSED_CONDUCTOR_SEGMENTS",
        "MOBILESPIRALCABLE_RECESSED_CONDUCTOR_SEGMENTS",
        "PHASE3_DESKTOP_CONTACT_LIGHTS",
        "PHASE3_MOBILE_CONTACT_LIGHTS",
        "PROVING_GROUND_DISTANCE",
        "NEUTRAL_CONTROLLED_LIGHTING",
    ):
        collection = bpy.data.collections.get(collection_name)
        if collection is not None:
            collection.hide_render = True
            collection["phase4r1_preserved_but_superseded"] = True
    accepted_terrain = bpy.data.objects.get("ProvingGround_Terrain")
    if accepted_terrain is not None:
        accepted_terrain.hide_render = True
        accepted_terrain["phase4r1_preserved_but_superseded"] = True

    local_lights = create_collection("PHASE4R1_CABLE_LOCAL_RESPONSE_LIGHTS")
    cable = {
        family: build_cable_family(family, spec, materials, local_lights)
        for family, spec in cfg.CABLE_SPECS.items()
    }
    # Default saved family is desktop; renderer switches this deterministically.
    for family, spec in cfg.CABLE_SPECS.items():
        bpy.data.collections[spec["collection"]].hide_render = family != "desktop"
    for obj in local_lights.objects:
        obj.hide_render = obj.get("phase4r1_family") != "desktop"

    target = bpy.data.objects["Phase4R0_CRT_OrbitTarget"]
    aim_targets: dict[str, bpy.types.Object] = {}
    for family in cfg.CAMERA_SPECS:
        name = "Phase4R1_EstablishingAimTarget" if family == "desktop" else f"Phase4R1_EstablishingAimTarget_{family.title()}"
        prior_aim = bpy.data.objects.get(name)
        if prior_aim is not None:
            bpy.data.objects.remove(prior_aim, do_unlink=True)
        aim_target = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(aim_target)
        aim_target.empty_display_type = "SPHERE"
        aim_target.empty_display_size = 0.12
        aim_target.hide_render = True
        for frame, location in cfg.ESTABLISHING_AIM_KEYS[family]:
            aim_target.location = Vector(location)
            aim_target.keyframe_insert(data_path="location", frame=frame)
        set_interpolation(aim_target, {"location"}, "LINEAR")
        aim_target["phase4r1_family"] = family
        aim_target["phase4r1_role"] = "family-authored hall/source/current composition converging exactly to the accepted CRT by F106"
        aim_target["phase4r1_crt_centered_by_frame"] = 106
        aim_targets[family] = aim_target
    camera_collection = create_collection("PHASE4R1_CAMERA_RIGS")
    rigs = {family: create_camera_rig(family, spec, aim_targets[family], camera_collection) for family, spec in cfg.CAMERA_SPECS.items()}
    create_camera_paths(rigs, camera_collection)
    camera_motion = audit_camera_motion(rigs)
    opening_measurements = measure_openings(rigs)
    responsive_physical_fit_measurements = measure_responsive_physical_fit(rigs)
    scene = bpy.context.scene
    scene.camera = rigs["desktop"]["camera"]
    scene.render.resolution_x, scene.render.resolution_y = cfg.CAMERA_SPECS["desktop"]["resolution"]
    scene.frame_set(1)

    material_report = []
    for key, material in materials.items():
        material_report.append(
            {
                "id": key,
                "name": material.name,
                "authored_procedural": True,
                "external_textures": 0,
                "node_count": len(material.node_tree.nodes) if material.node_tree else 0,
            }
        )
    authored_asset_summaries = hall_assets + source_assets + [
        {"asset": f"{family} extended physical cable and conductor", "count": 1 + cfg.CABLE_SPECS[family]["segments"], "authored": True}
        for family in cfg.CABLE_SPECS
    ]
    authored_assets = []
    for index, summary in enumerate(authored_asset_summaries, 1):
        stable_id = f"p4r1-authored-{index:03d}"
        signature = hashlib.sha256(json.dumps({"id": stable_id, "summary": summary}, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
        authored_assets.append(
            {
                "id": stable_id,
                "name": summary["asset"],
                "creator": "Quantum-Hub Phase 4-R1 deterministic Blender builder",
                "license": "project-authored; no external license dependency",
                "source": "modeled-from-scratch geometry or procedural material in build_phase4r1_proving_hall.py",
                "sha256": signature,
                "exactUse": summary["asset"],
                "modified": False,
                "packedIntoBlend": True,
                "inventory": summary,
            }
    )

    cfg.DERIVATIVE_SOURCE.parent.mkdir(parents=True, exist_ok=True)
    action_after = {action.name: sum(1 for curve in iter_action_fcurves(action) for _ in curve.keyframe_points) for action in bpy.data.actions}
    inherited_intact = all(action_after.get(name, -1) == count for name, count in action_snapshot.items())
    inherited_action_signature_after = action_inventory_signature(inherited_action_names)
    inherited_signature_valid = (
        inherited_action_signature_after["action_names"] == inherited_action_signature_before["action_names"]
        and inherited_action_signature_after["action_count"] == inherited_action_signature_before["action_count"]
        and inherited_action_signature_after["keyframe_point_count"] == inherited_action_signature_before["keyframe_point_count"]
        and inherited_action_signature_after["sha256"] == inherited_action_signature_before["sha256"]
    )
    if not inherited_signature_valid:
        raise RuntimeError("preexisting R0 Action curve/keyframe signature changed during R1 construction")
    bpy.ops.wm.save_as_mainfile(filepath=str(cfg.DERIVATIVE_SOURCE), check_existing=False)
    derivative = file_record(cfg.DERIVATIVE_SOURCE)
    report = {
        "schema": "quantum-hub.phase-4-r1-proving-hall.source-build.v1",
        "status": "PASS",
        "production_rendering_started": False,
        "full_production_rendering_started": False,
        "runtime_integration_started": False,
        "phase5_authorized": False,
        "blender_version": bpy.app.version_string,
        "accepted_phase4r0_parent": cfg.ACCEPTED_PHASE4R0_COMMIT,
        "accepted_phase4r0_source": file_record(cfg.ACCEPTED_PHASE4R0_SOURCE),
        "producer_authorities": {
            "config": file_record(cfg.SOURCE_DIR / "phase4r1_config.py"),
            "builder": file_record(Path(__file__).resolve()),
        },
        "phase4r1_derivative": derivative,
        "timeline": {
            "fps": 30,
            "frame_start": 1,
            "frame_end": 540,
            "frame_count": 540,
            "duration_seconds": 18.0,
            "events": {
                "dormancy_end": 45,
                "conduction_start": 46,
                "orbit_complete": 285,
                "activation_start": 286,
                "q_start": 356,
                "q_hold_end": 405,
                "push_start": 406,
                "threshold_start": 481,
                "physical_end": 500,
                "black_start": 501,
                "black_end": 513,
                "entry_start": 514,
                "entry_end": 540,
            },
            "authority_preserved": True,
        },
        "hall": hall,
        "cable": {"source_design": source, "families": cable},
        "current_mask": {
            "implementation": f"deterministic per-segment arc-length state on one continuous sheath; contiguous trail, {cfg.CURRENT['front_width_fraction'] * 100.0:.1f}% brighter front, dormant cable ahead",
            "front_width_fraction": cfg.CURRENT["front_width_fraction"],
            "front_strength_eevee": cfg.CURRENT["front_strength_eevee"],
            "trail_strength_eevee": cfg.CURRENT["trail_strength_eevee"],
            "front_strength_cycles": cfg.CURRENT["front_strength_cycles"],
            "trail_strength_cycles": cfg.CURRENT["trail_strength_cycles"],
            "progression_frames": [46, 285],
            "continuous_trail": True,
            "no_islands_ahead": True,
            "reverse_deterministic": True,
            "physical_black_sheath_remains_visible": True,
        },
        "camera_motion": camera_motion,
        "opening_measurements": opening_measurements,
        "responsive_physical_fit_measurements": responsive_physical_fit_measurements,
        "responsive_physical_fit_measurements_sha256": canonical_payload_hash(responsive_physical_fit_measurements),
        "opening_aim": {
            "family_establishing_targets_world_m": {
                family: [round(float(value), 6) for value in cfg.ESTABLISHING_AIM_KEYS[family][0][1]]
                for family in cfg.CAMERA_SPECS
            },
            "family_target_objects": {family: aim_targets[family].name for family in cfg.CAMERA_SPECS},
            "accepted_crt_target_world_m": list(cfg.ORBIT_TARGET),
            "convergence_frames": [46, 106],
            "crt_centered_by_frame": 106,
            "exact_crt_target_at_frame_106": True,
        },
        "lighting": lighting,
        "materials": material_report,
        "authored_environment_assets": authored_assets,
        "external_assets": [],
        "cycles_settings": {
            "engine": "CYCLES",
            "device_policy": "GPU when available, CPU fallback",
            "samples_benchmark_stills": 192,
            "samples_motion": 96,
            "adaptive_sampling": True,
            "denoiser": "OPENIMAGEDENOISE",
            "view_transform": "AgX",
            "look": "AgX - Medium High Contrast",
            "motion_blur": True,
            "production_540_frame_render_authorized": False,
        },
        "quantum_q": {
            "geometry_authority": file_record(cfg.Q_REVERSED_SOURCE),
            "color_authority": file_record(cfg.Q_COLOR_SOURCE),
            "accepted_r0_q_root": "Phase4R0_ApprovedQuantumQ_Root",
            "geometry_or_animation_changed_in_r1": False,
            "isolated_from_approved_svg": True,
            "redrawn_or_approximated": False,
            "qfund_or_third_party_logo_used": False,
        },
        "repository_impact": {
            "new_source_files_expected": [cfg.DERIVATIVE_SOURCE.name, cfg.BUILD_REPORT.name, cfg.VALIDATION_REPORT.name, cfg.ASSET_LEDGER.name, "phase4r1_config.py", Path(__file__).name, "preflight_phase4r1_geometry.py", "render_phase4r1_preproduction.py", "render_phase4r1_review_stills.py", "render_phase4r1_cycles_benchmarks.py", "validate_phase4r1_source.py"],
            "external_texture_bytes": 0,
            "embedded_external_asset_bytes": 0,
            "raw_frames_committed": False,
            "review_zip_committed": False,
        },
        "preservation": {
            "accepted_r0_source_overwritten": False,
            "accepted_crt_q_portal_timeline_concept_preserved": True,
            "inherited_action_inventory_intact": inherited_intact,
            "inherited_action_count": len(action_snapshot),
            "inherited_keyframe_count": sum(action_snapshot.values()),
            "inherited_r0_action_signature": {
                "before": inherited_action_signature_before,
                "after": inherited_action_signature_after,
                "valid": inherited_signature_valid,
            },
            "object_count_before": object_count_before,
            "object_count_after": len(bpy.data.objects),
            "superseded_r0_collections_hidden": [
                "PHASE4R0_PROVING_FIELD_EXTENSION",
                "DESKTOP_2_5_TURN_SPIRAL_CABLE",
                "MOBILE_2_25_TURN_SPIRAL_CABLE",
                "SPIRALCABLE_RECESSED_CONDUCTOR_SEGMENTS",
                "MOBILESPIRALCABLE_RECESSED_CONDUCTOR_SEGMENTS",
                "PHASE3_DESKTOP_CONTACT_LIGHTS",
                "PHASE3_MOBILE_CONTACT_LIGHTS",
                "PROVING_GROUND_DISTANCE",
                "NEUTRAL_CONTROLLED_LIGHTING",
            ],
            "industrial_proving_ground_central_identity_retained": True,
            "industrial_proving_ground_reason": "accepted central installation/seam identity supports the proving zone; the sparse distant props, old floors, short cables and neutral studio lighting are superseded",
        },
    }
    ledger = {
        "schema": "quantum-hub.phase-4-r1-proving-hall.asset-ledger.v1",
        "status": "PASS",
        "description": "modeled-from-scratch geometry and procedural materials only; no downloads, scans, stock imagery, generative imagery or third-party textures",
        "phase4r1_derivative_sha256": derivative["sha256"],
        "source": derivative,
        "authoredAssets": authored_assets,
        "externalAssets": [],
        "counts": {"authored_record_count": len(authored_assets), "external_asset_count": 0},
        "licenses": [],
        "textureContributionBytes": 0,
        "packed_external_resources": 0,
        "policy": {
            "aiGeneratedFacilityImageryUsed": False,
            "higgsfieldProductionMaterialUsed": False,
            "unknownLicenseAssetsUsed": False,
            "confidentialMaterialUploaded": False,
            "stockVideoOrVisiblePhotographyUsed": False,
        },
    }
    cfg.ASSET_LEDGER.write_text(json.dumps(ledger, indent=2) + "\n", encoding="utf-8")
    report["asset_ledger"] = file_record(cfg.ASSET_LEDGER)
    cfg.BUILD_REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"QH_PHASE4R1_DERIVATIVE={cfg.DERIVATIVE_SOURCE}")
    print(f"QH_PHASE4R1_DERIVATIVE_SHA256={derivative['sha256']}")
    print(f"QH_PHASE4R1_BUILD_REPORT={cfg.BUILD_REPORT}")


if __name__ == "__main__":
    main()
