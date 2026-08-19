"""Build the selected rounded 1990s CRT, cable, and bounded proving-ground scene.

Everything is authored from procedural Blender primitives and node materials.
No external model, image, texture, font file, linked library, or add-on is used.
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

import build_crt_proportion_options as gate
import crt_canonical_config as canonical
import crt_refined_config as cfg


def cli_args() -> argparse.Namespace:
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=cfg.REFINED_BLEND)
    return parser.parse_args(raw)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def emitted_material(
    name: str,
    base: Sequence[float],
    emission: Sequence[float],
    strength: float,
    roughness: float,
) -> bpy.types.Material:
    mat = gate.material(name, base, roughness)
    # Several authored state materials are swapped in only by the deterministic
    # renderers. Keep those zero-user materials in the editable source.
    mat.use_fake_user = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    if "Emission Color" in shader.inputs:
        shader.inputs["Emission Color"].default_value = (*emission, 1.0)
        shader.inputs["Emission Strength"].default_value = strength
    else:
        shader.inputs["Emission"].default_value = (*emission, 1.0)
        shader.inputs["Emission Strength"].default_value = strength
    return mat


def refine_abs_material(mat: bpy.types.Material) -> None:
    """Add large- and micro-scale variation characteristic of cared-for moulded ABS."""
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    shader = nodes.get("Principled BSDF")
    if shader is None:
        raise RuntimeError(f"missing Principled shader for {mat.name}")
    macro = nodes.new("ShaderNodeTexNoise")
    macro.name = "Subtle mould-flow variation"
    macro.inputs["Scale"].default_value = 5.5
    macro.inputs["Detail"].default_value = 3.2
    macro.inputs["Roughness"].default_value = 0.68
    macro.inputs["Distortion"].default_value = 0.08
    color = nodes.new("ShaderNodeValToRGB")
    color.name = "Near-black ABS tonal range"
    color.color_ramp.elements[0].position = 0.18
    color.color_ramp.elements[0].color = (0.0060, 0.0072, 0.0075, 1.0)
    color.color_ramp.elements[1].position = 0.84
    color.color_ramp.elements[1].color = (0.0110, 0.0130, 0.0134, 1.0)
    rough = nodes.new("ShaderNodeValToRGB")
    rough.name = "Injection-moulded roughness range"
    rough.color_ramp.elements[0].position = 0.12
    rough.color_ramp.elements[0].color = (0.48, 0.48, 0.48, 1.0)
    rough.color_ramp.elements[1].position = 0.90
    rough.color_ramp.elements[1].color = (0.55, 0.55, 0.55, 1.0)
    links.new(macro.outputs["Fac"], color.inputs["Fac"])
    links.new(macro.outputs["Fac"], rough.inputs["Fac"])
    links.new(color.outputs["Color"], shader.inputs["Base Color"])
    links.new(rough.outputs["Color"], shader.inputs["Roughness"])
    mat["manufacturing_finish"] = "subtle near-black ABS mould-flow and micro-grain; no bitmap texture"


def poly_curve(
    name: str,
    points: Sequence[Sequence[float]],
    radius: float,
    mat: bpy.types.Material,
    destination: bpy.types.Collection,
    cyclic: bool = False,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 3
    curve.bevel_resolution = 5
    curve.bevel_depth = radius
    curve.use_fill_caps = True
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, coordinate in zip(spline.points, points):
        point.co = (*coordinate, 1.0)
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    destination.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def apply_modifier(obj: bpy.types.Object, modifier_name: str) -> None:
    """Apply one deterministic modelling modifier with an explicit active object."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.hide_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier_name)
    obj.select_set(False)


def apply_pending_modifiers(obj: bpy.types.Object) -> None:
    """Freeze manufactured edge radii before subtractive detail is authored."""
    for modifier in list(obj.modifiers):
        apply_modifier(obj, modifier.name)


def boolean_openings(
    target: bpy.types.Object,
    cutters: Sequence[bpy.types.Object],
    *,
    modifier_name: str,
) -> None:
    """Subtract a batch of disconnected cutters in one exact Boolean operation."""
    if not cutters:
        return
    apply_pending_modifiers(target)
    for cutter in cutters:
        apply_pending_modifiers(cutter)
    bpy.ops.object.select_all(action="DESELECT")
    for cutter in cutters:
        cutter.hide_set(False)
        cutter.select_set(True)
    bpy.context.view_layer.objects.active = cutters[0]
    bpy.ops.object.join()
    joined = cutters[0]
    joined.name = f"{target.name}_{modifier_name}_Cutters"
    modifier = target.modifiers.new(modifier_name, "BOOLEAN")
    modifier.operation = "DIFFERENCE"
    modifier.solver = "EXACT"
    modifier.object = joined
    apply_modifier(target, modifier.name)
    bpy.data.objects.remove(joined, do_unlink=True)


def refined_shell(mat: bpy.types.Material, destination: bpy.types.Collection) -> bpy.types.Object:
    width = cfg.DIMENSIONS_M["width"]
    height = 0.675
    front_y, rear_y = -0.325, 0.360
    section_count = 37
    section_size = 64
    vertices: list[tuple[float, float, float]] = []
    for section in range(section_count):
        t = section / (section_count - 1)
        taper = gate.smoothstep((t - 0.22) / 0.78)
        # A quiet front shoulder and slightly fuller rear keep the cabinet
        # unmistakably domestic CRT rather than a faceted projector wedge.
        shoulder = 0.006 * math.sin(math.pi * min(1.0, t / 0.30))
        current_width = width * (1.0 - 0.45 * taper) + shoulder
        current_height = height * (1.0 - 0.29 * taper) + shoulder * 0.45
        current_center_z = 0.015 + current_height * 0.5 + 0.108 * taper
        current_radius = 0.110 * (1.0 - 0.31 * taper)
        ring = gate.rounded_rect_ring(current_width, current_height, current_radius, current_center_z, 16)
        y = front_y + (rear_y - front_y) * t
        vertices.extend((x, y, z) for x, z in ring)

    faces: list[tuple[int, ...]] = []
    for section in range(section_count - 1):
        base = section * section_size
        nxt_base = (section + 1) * section_size
        for index in range(section_size):
            nxt = (index + 1) % section_size
            faces.append((base + index, base + nxt, nxt_base + nxt, nxt_base + index))
    faces.append(tuple(reversed(range(section_size))))
    last = (section_count - 1) * section_size
    faces.append(tuple(last + index for index in range(section_size)))
    mesh = bpy.data.meshes.new("CRT_RefinedCabinetShell_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("CRT_RefinedDeepMouldedCabinetShell", mesh)
    destination.objects.link(obj)
    obj.data.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    gate.bevel(obj, 0.0045, 5)
    obj["manufacturing_logic"] = "37-section injection-moulded ABS enclosure with calm front shoulder and deep CRT taper"
    obj["selected_proportion"] = "0.84 W x 0.69 H x 0.76 D m; 29-inch screen class"
    return obj


def convex_ellipsoid(
    name: str,
    dims: Sequence[float],
    location: Sequence[float],
    mat: bpy.types.Material,
    destination: bpy.types.Collection,
    segments: int = 192,
    rings: int = 96,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (dims[0] * 0.5, dims[1] * 0.5, dims[2] * 0.5)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.materials.append(mat)
    destination.objects.link(obj)
    for collection in tuple(obj.users_collection):
        if collection != destination:
            collection.objects.unlink(obj)
    return obj


def rounded_rect_frame(
    name: str,
    outer_width: float,
    outer_height: float,
    outer_radius: float,
    inner_width: float,
    inner_height: float,
    inner_radius: float,
    front_y: float,
    depth: float,
    center_z: float,
    mat: bpy.types.Material,
    destination: bpy.types.Collection,
    segments_per_corner: int = 32,
) -> bpy.types.Object:
    """Create a manufactured rounded frame with a real open center.

    The earlier diagnostic blockout used rounded boxes for the bezel and
    gasket.  Those solids masked the glass except where its bulge crossed the
    box front, which produced the misleading centered dark rectangle.  This
    closed annular mesh leaves the entire intended screen opening unobstructed.
    """
    outer = gate.rounded_rect_ring(
        outer_width, outer_height, outer_radius, center_z, segments_per_corner
    )
    inner = gate.rounded_rect_ring(
        inner_width, inner_height, inner_radius, center_z, segments_per_corner
    )
    count = len(outer)
    back_y = front_y + depth
    vertices = (
        [(x, front_y, z) for x, z in outer]
        + [(x, front_y, z) for x, z in inner]
        + [(x, back_y, z) for x, z in outer]
        + [(x, back_y, z) for x, z in inner]
    )
    outer_front = 0
    inner_front = count
    outer_back = count * 2
    inner_back = count * 3
    faces: list[tuple[int, ...]] = []
    for index in range(count):
        nxt = (index + 1) % count
        # Front and rear annuli, plus outer and opening walls.
        faces.append(
            (
                outer_front + index,
                outer_front + nxt,
                inner_front + nxt,
                inner_front + index,
            )
        )
        faces.append(
            (
                outer_back + index,
                inner_back + index,
                inner_back + nxt,
                outer_back + nxt,
            )
        )
        faces.append(
            (
                outer_front + index,
                outer_back + index,
                outer_back + nxt,
                outer_front + nxt,
            )
        )
        faces.append(
            (
                inner_front + index,
                inner_front + nxt,
                inner_back + nxt,
                inner_back + index,
            )
        )

    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    destination.objects.link(obj)
    obj.data.materials.append(mat)
    gate.bevel(obj, min(0.0022, depth * 0.16), 4)
    obj["construction"] = "closed rounded-rectangle annular frame with unobstructed center"
    obj["opening_m"] = f"{inner_width:.4f} W x {inner_height:.4f} H"
    return obj


def curved_rounded_screen_patch(
    name: str,
    width: float,
    height: float,
    radius: float,
    edge_y: float,
    outward_bulge: float,
    thickness: float,
    center_z: float,
    mat: bpy.types.Material,
    destination: bpy.types.Collection,
    radial_steps: int = 28,
    boundary_segments_per_corner: int = 32,
) -> bpy.types.Object:
    """Create a dense Cartesian convex face plus perimeter-only thickness.

    There is intentionally no transparent rear cap.  Thickness is expressed
    only around the glass edge, avoiding a second optical surface projecting
    through the dormant screen while retaining a measurable 12 mm edge wall.
    The smooth biquadratic face avoids the radial-fan reflection sectors seen
    in the earlier diagnostic.  Rounded bezel and gasket openings mask its
    rectangular perimeter into the authentic CRT 4:3 visible shape.
    """
    x_steps = max(48, boundary_segments_per_corner * 2)
    z_steps = max(36, radial_steps * 2)
    row = x_steps + 1
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for z_index in range(z_steps + 1):
        v = -1.0 + 2.0 * z_index / z_steps
        for x_index in range(x_steps + 1):
            u = -1.0 + 2.0 * x_index / x_steps
            shape = (1.0 - u * u) * (1.0 - v * v)
            vertices.append(
                (
                    width * 0.5 * u,
                    edge_y - outward_bulge * shape,
                    center_z + height * 0.5 * v,
                )
            )
    for z_index in range(z_steps):
        for x_index in range(x_steps):
            lower_left = z_index * row + x_index
            lower_right = lower_left + 1
            upper_left = lower_left + row
            upper_right = upper_left + 1
            faces.append((lower_left, lower_right, upper_right, upper_left))

    # Clockwise front-edge loop, starting along the lower edge.  Only this
    # boundary is duplicated rearward; there is no optical rear surface.
    perimeter_front: list[int] = []
    perimeter_front.extend(range(0, row))
    perimeter_front.extend(z_index * row + x_steps for z_index in range(1, z_steps + 1))
    perimeter_front.extend(z_steps * row + x_index for x_index in range(x_steps - 1, -1, -1))
    perimeter_front.extend(z_index * row for z_index in range(z_steps - 1, 0, -1))
    perimeter_back: list[int] = []
    for front_index in perimeter_front:
        x, _, z = vertices[front_index]
        perimeter_back.append(len(vertices))
        vertices.append((x, edge_y + thickness, z))
    for index in range(len(perimeter_front)):
        nxt = (index + 1) % len(perimeter_front)
        faces.append(
            (
                perimeter_front[index],
                perimeter_back[index],
                perimeter_back[nxt],
                perimeter_front[nxt],
            )
        )

    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    destination.objects.link(obj)
    obj.data.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    gate.bevel(obj, min(0.0012, max(0.00015, thickness * 0.25)), 3)
    obj["geometry"] = "dense Cartesian convex CRT face; rounded visible boundary defined by gasket"
    obj["masked_corner_radius_m"] = radius
    obj["outward_bulge_m"] = outward_bulge
    obj["physical_thickness_m"] = thickness
    return obj


def closed_shell_seam(mat: bpy.types.Material, destination: bpy.types.Collection) -> bpy.types.Object:
    # A restrained cabinet-parting seam around the body, inset from the maximum shell envelope.
    ring = gate.rounded_rect_ring(0.712, 0.605, 0.083, 0.340, 18)
    points = [(x, -0.105, z) for x, z in ring]
    obj = poly_curve("CRT_CabinetPartingSeam", points, 0.0016, mat, destination, cyclic=True)
    obj["manufacturing_logic"] = "front/rear moulding parting seam"
    return obj


def screen_and_bezel(mats: dict[str, bpy.types.Material], destination: bpy.types.Collection) -> None:
    def screen_face_y(x: float, z: float, optical_offset: float = -0.0008) -> float:
        """Return the convex glass-front Y at a screen-local X/Z position.

        Optical phosphor marks are conformed to this face so the 34 mm CRT
        crown cannot occlude their centre, as happened with the earlier flat
        diagnostic planes. ``optical_offset`` is toward the camera and reads
        as light emerging at the smoked-glass surface.
        """
        u = max(-1.0, min(1.0, x / (cfg.SCREEN_VISIBLE_M["width"] * 0.5)))
        v = max(
            -1.0,
            min(1.0, (z - 0.425) / (cfg.SCREEN_VISIBLE_M["height"] * 0.5)),
        )
        shape = (1.0 - u * u) * (1.0 - v * v)
        return -0.352 - 0.034 * shape + optical_offset

    rounded_rect_frame(
        "CRT_ThickProtectiveBezel",
        0.745,
        0.545,
        0.071,
        0.642,
        0.488,
        0.052,
        -0.370,
        0.050,
        0.425,
        mats["bezel"],
        destination,
    )["wall_thickness_m"] = 0.028
    rounded_rect_frame(
        "CRT_RecessedGlassGasket",
        0.626,
        0.479,
        0.051,
        0.584,
        0.436,
        0.041,
        -0.379,
        0.024,
        0.425,
        mats["gasket"],
        destination,
    )["role"] = "thick resilient perimeter gasket separating glass and ABS bezel"
    glass = curved_rounded_screen_patch(
        "CRT_ConvexThickSmokedGlass",
        cfg.SCREEN_VISIBLE_M["width"],
        cfg.SCREEN_VISIBLE_M["height"],
        0.060,
        -0.352,
        0.034,
        0.012,
        0.425,
        mats["glass"],
        destination,
    )
    glass["aspect_ratio"] = "4:3"
    glass["physical_thickness_m"] = 0.012
    glass["phosphor_air_gap_m"] = 0.005
    glass["dormant_state"] = "smoked reflective glass; zero emission"
    phosphor = curved_rounded_screen_patch(
        "CRT_InternalPhosphorLayer",
        0.566,
        0.4245,
        0.052,
        -0.337,
        0.032,
        0.001,
        0.425,
        mats["phosphor_off"],
        destination,
        radial_steps=24,
        boundary_segments_per_corner=28,
    )
    phosphor["layer_relation"] = "separate internal phosphor layer behind 12 mm smoked glass"
    phosphor["ordered_optical_stack"] = "bezel > gasket > convex smoked glass > 5 mm air gap > phosphor"
    phosphor["dormant_emission_strength"] = 0.0
    phosphor["state"] = "dormant"

    wake_points = []
    for index in range(33):
        x = -0.178 + index * (0.356 / 32.0)
        # The first electrical response is a brief, gently bowed horizontal
        # line, not a modern flat-panel fade.
        bowed_z = 0.425 + 0.0048 * (1.0 - (x / 0.178) ** 2)
        wake_points.append((x, screen_face_y(x, bowed_z), bowed_z))
    wake = poly_curve("CRT_WakeHorizontalPhosphorLine", wake_points, 0.0018, mats["wake_line"], destination)
    wake.hide_render = True
    wake["activation_role"] = "brief bowed horizontal CRT wake line; hidden while dormant"

    startup_expansion = gate.new_collection("CRT_STARTUP_RASTER_EXPANSION", destination)
    startup_expansion["vertical_fill_ratio"] = 0.48
    startup_expansion["expands_from"] = "CRT_WakeHorizontalPhosphorLine"
    startup_expansion["degaussing_ripple_present"] = True
    startup_expansion["degaussing_state"] = "active and visibly settling"
    startup_expansion["shape"] = "partial-height rounded rectangular 4:3 raster; never elliptical"
    startup_height = 0.390 * float(startup_expansion["vertical_fill_ratio"])
    for index in range(18):
        z_base = 0.425 - startup_height * 0.5 + index * (startup_height / 17.0)
        vertical = abs((z_base - 0.425) / max(startup_height * 0.5, 1e-6))
        edge_rounding = max(0.0, (vertical - 0.80) / 0.20)
        width = 0.508 * (1.0 - 0.035 * edge_rounding * edge_rounding)
        scan_points = []
        for point_index in range(41):
            x = -width * 0.5 + width * point_index / 40.0
            phase = point_index / 40.0
            ripple = 0.0038 * math.sin(math.tau * phase + index * 0.21) * (0.90 - 0.35 * vertical)
            z = z_base + ripple
            scan_points.append((x, screen_face_y(x, z, -0.00045), z))
        line = poly_curve(
            f"CRT_StartupExpansionScanline_{index + 1:02d}",
            scan_points,
            0.00082,
            mats["raster_warming"],
            startup_expansion,
        )
        line.hide_render = True
        line["vertical_fill_ratio"] = float(startup_expansion["vertical_fill_ratio"])
        line["degaussing_ripple_amplitude_m"] = 0.0038

    scanline_parent = gate.new_collection("CRT_SCANLINE_GEOMETRY", destination)
    scanline_parent["active_raster_width_m"] = 0.520
    scanline_parent["active_raster_height_m"] = 0.390
    scanline_parent["active_raster_aspect"] = round(0.520 / 0.390, 6)
    scanline_parent["shape"] = "rounded rectangular 4:3-class overscan field; never elliptical"
    for index in range(32):
        z = 0.425 - 0.195 + index * (0.390 / 31.0)
        vertical = abs((z - 0.425) / 0.195)
        # A real CRT raster expands as a rounded 4:3 rectangle. Only the
        # outermost lines shorten slightly for overscan; they never collapse
        # into the ellipse/target produced by the prior square-root profile.
        edge_rounding = max(0.0, (vertical - 0.82) / 0.18)
        width = 0.520 * (1.0 - 0.045 * edge_rounding * edge_rounding)
        scan_points = []
        for point_index in range(33):
            x = -width * 0.5 + width * point_index / 32.0
            scan_points.append((x, screen_face_y(x, z, -0.0006), z))
        line = poly_curve(
            f"CRT_Scanline_{index + 1:02d}",
            scan_points,
            0.0010,
            mats["scanline"],
            scanline_parent,
        )
        line.hide_render = True

    interface = gate.new_collection("CRT_PHYSICAL_SIGNAL_INTERFACE", destination)
    portal_layout = json.loads(cfg.PORTAL_LAYOUT.read_text(encoding="utf-8"))
    physical = portal_layout["physicalScreenLayout"]
    surface_width = 0.566
    surface_height = 0.4245

    def surface_x(pixel_x: float) -> float:
        return -surface_width * 0.5 + (pixel_x / 1600.0) * surface_width

    def surface_z(pixel_y: float) -> float:
        return 0.425 + (0.5 - pixel_y / 1200.0) * surface_height

    brand = portal_layout["copyOwnership"]["physicalScreen"]["brand"]
    status = portal_layout["copyOwnership"]["physicalScreen"]["approvedStatus"]
    brand_anchor = physical["brandBaseline"]
    status_anchor = physical["statusBaseline"]
    text_specs = [
        (
            "CRT_InterfaceTitle",
            brand,
            0.052,
            (surface_x(brand_anchor["x"]), -0.3910, surface_z(brand_anchor["y"])),
            (brand_anchor["x"], brand_anchor["y"]),
            "brand",
        ),
        (
            "CRT_InterfaceStatus",
            status,
            0.026,
            (surface_x(status_anchor["x"]), -0.3910, surface_z(status_anchor["y"])),
            (status_anchor["x"], status_anchor["y"]),
            "ready",
        ),
    ]
    route_words = portal_layout["copyOwnership"]["physicalScreen"]["route"]
    route_anchor = physical["routeBaseline"]
    route_carrier = "      ".join(route_words)
    text_specs.append(
        (
            "CRT_InterfaceRouteCarrier",
            route_carrier,
            0.018,
            (surface_x(route_anchor["x"]), -0.3910, surface_z(route_anchor["y"])),
            (route_anchor["x"], route_anchor["y"]),
            "route",
        )
    )
    for name, body, size, location, pixel_anchor, interface_stage in text_specs:
        curve = bpy.data.curves.new(name, "FONT")
        curve.body = body
        curve.align_x = "LEFT"
        curve.align_y = "BOTTOM_BASELINE"
        curve.size = size
        curve.extrude = 0.0
        curve.resolution_u = 8
        obj = bpy.data.objects.new(name, curve)
        obj.location = location
        obj.rotation_euler = (math.radians(90.0), 0.0, 0.0)
        interface.objects.link(obj)
        obj.data.materials.append(mats["interface"])
        bpy.ops.object.select_all(action="DESELECT")
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.convert(target="MESH")
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        obj.select_set(False)
        if hasattr(obj, "visible_shadow"):
            obj.visible_shadow = False
        if hasattr(obj, "visible_glossy"):
            obj.visible_glossy = False
        obj.hide_render = True
        obj["font_source"] = "Blender built-in Bfont; no external font file"
        obj["source_body"] = body
        obj["optical_projection_relation"] = (
            "owned vector glyphs projected at the smoked-glass crown plane; X/Z anchors derive from shared JSON"
        )
        obj["portal_layout_sha256"] = cfg.PORTAL_LAYOUT_SHA256
        obj["physical_screen_anchor_px"] = f"{pixel_anchor[0]},{pixel_anchor[1]}"
        obj["interface_stage"] = interface_stage
        if name == "CRT_InterfaceRouteCarrier":
            obj["route_words_json"] = json.dumps(route_words, separators=(",", ":"))
            obj["route_item_starts_px_json"] = json.dumps(
                physical["routeRegion"]["itemStarts"], separators=(",", ":")
            )

    takeover = gate.new_collection("CRT_PORTAL_TAKEOVER_CUES", destination)
    route_z = surface_z(route_anchor["y"])
    carrier = poly_curve(
        "CRT_TextFreeRouteCarrierContinuity",
        (
            (surface_x(route_anchor["x"]), screen_face_y(surface_x(route_anchor["x"]), route_z, -0.0007), route_z),
            (surface_x(1460.0), screen_face_y(surface_x(1460.0), route_z, -0.0007), route_z),
        ),
        0.00065,
        mats["portal_cue"],
        takeover,
    )
    carrier.hide_render = True
    carrier["continuity_role"] = "text-free persistence of the accepted route-carrier baseline"
    for index, z in enumerate((0.248, 0.602), 1):
        line = poly_curve(
            f"CRT_TextFreeOverscanCue_{index:02d}",
            (
                (-0.268, screen_face_y(-0.268, z, -0.00065), z),
                (0.268, screen_face_y(0.268, z, -0.00065), z),
            ),
            0.00045,
            mats["portal_cue"],
            takeover,
        )
        line.hide_render = True
        line["continuity_role"] = "diminishing rectangular overscan boundary cue"


def speaker_controls(mats: dict[str, bpy.types.Material], destination: bpy.types.Collection) -> None:
    band = gate.rounded_box(
        "CRT_LowerSpeakerControlBand",
        (0.772, 0.050, 0.112),
        (0.0, -0.345, 0.070),
        0.015,
        mats["secondary_abs"],
        destination,
    )
    band["manufacturing_logic"] = "integrated lower ABS speaker/control moulding with subtractive grille and sparse period controls"
    band["speaker_open_depth_m"] = 0.050
    band["speaker_plenum_depth_m"] = 0.029
    band["control_count"] = 2
    band["control_taxonomy"] = "round latching power button; horizontal tuning rocker"
    seam = poly_curve(
        "CRT_LowerBandUpperShadowSeam",
        ((-0.357, -0.373, 0.130), (0.357, -0.373, 0.130)),
        0.0012,
        mats["seam"],
        destination,
    )
    seam["manufacturing_logic"] = "controlled shadow seam between bezel apron and lower moulding"

    # Genuine through-openings: cutters are unioned, subtracted from the band,
    # and deleted. A dark backing volume sits behind the resulting wall depth.
    grille = gate.new_collection("CRT_SPEAKER_PERFORATIONS", destination)
    cutters: list[bpy.types.Object] = []
    columns, rows = 14, 4
    for row in range(rows):
        for column in range(columns):
            x = -0.326 + column * 0.028 + (0.014 if row % 2 else 0.0)
            z = 0.046 + row * 0.0165
            if x > 0.070:
                continue
            cutters.append(gate.cylinder(
                f"CRT_SpeakerOpeningCutter_{row + 1:02d}_{column + 1:02d}",
                0.0038,
                0.075,
                (x, -0.345, z),
                (math.radians(90.0), 0.0, 0.0),
                mats["cavity"],
                grille,
            ))

    controls = gate.new_collection("CRT_PHYSICAL_CONTROLS", destination)
    power_recess = gate.cylinder(
        "CRT_PowerControlWellCutter",
        0.021,
        0.075,
        (0.202, -0.345, 0.070),
        (math.radians(90.0), 0.0, 0.0),
        mats["cavity"],
        controls,
    )
    rocker_recess = gate.rounded_box(
        "CRT_TuningRockerWellCutter",
        (0.083, 0.075, 0.035),
        (0.292, -0.345, 0.070),
        0.007,
        mats["cavity"],
        controls,
    )
    cutters.extend((power_recess, rocker_recess))
    boolean_openings(band, cutters, modifier_name="True recessed speaker and control openings")
    gate.bevel(band, 0.0012, 3)

    backing = gate.rounded_box(
        "CRT_SpeakerGrilleDarkInterior",
        (0.405, 0.006, 0.082),
        (-0.125, -0.316, 0.070),
        0.010,
        mats["cavity"],
        grille,
    )
    backing["construction"] = "dark internal acoustic cavity visible through real perforations"

    power = gate.cylinder(
        "CRT_RecessedRoundPowerButton",
        0.0145,
        0.007,
        (0.202, -0.371, 0.070),
        (math.radians(90.0), 0.0, 0.0),
        mats["control"],
        controls,
    )
    power["interaction"] = "sparse late-analogue round latching power control"
    power["recess_depth_m"] = 0.004
    power["travel_m"] = 0.0025
    rocker = gate.rounded_box(
        "CRT_RecessedTuningRocker",
        (0.069, 0.007, 0.022),
        (0.292, -0.371, 0.070),
        0.005,
        mats["control"],
        controls,
    )
    rocker["interaction"] = "single restrained era tuning rocker; no dashboard cluster"
    rocker["recess_depth_m"] = 0.004
    rocker["travel_m"] = 0.0018
    poly_curve(
        "CRT_TuningRockerCenterSeam",
        ((0.292, -0.3755, 0.061), (0.292, -0.3755, 0.079)),
        0.00065,
        mats["seam"],
        controls,
    )
    indicator = gate.cylinder(
        "CRT_DormantPowerIndicator",
        0.0042,
        0.005,
        (0.353, -0.372, 0.070),
        (math.radians(90.0), 0.0, 0.0),
        mats["indicator_off"],
        controls,
    )
    indicator["emission_strength"] = 0.0


def rear_and_side_details(mats: dict[str, bpy.types.Material], destination: bpy.types.Collection) -> None:
    rear = gate.new_collection("CRT_REAR_SERVICE_DETAIL", destination)
    gate.rounded_box(
        "CRT_RearServicePanelGasket",
        (0.346, 0.010, 0.257),
        (0.0, 0.366, 0.360),
        0.022,
        mats["cavity"],
        rear,
    )
    panel = gate.rounded_box(
        "CRT_RearRemovableServicePanel",
        (0.332, 0.012, 0.243),
        (0.0, 0.373, 0.360),
        0.018,
        mats["secondary_abs"],
        rear,
    )
    panel["manufacturing_logic"] = "single removable rear service panel with gasket and restrained fasteners"
    panel["rear_vent_open_depth_m"] = 0.012
    panel["rear_vent_plenum_depth_m"] = 0.010
    for x in (-0.143, 0.143):
        for z in (0.265, 0.455):
            screw = gate.cylinder(
                f"CRT_RearServiceFastener_{'L' if x < 0 else 'R'}_{'L' if z < 0.36 else 'U'}",
                0.005,
                0.005,
                (x, 0.380, z),
                (math.radians(90.0), 0.0, 0.0),
                mats["fastener"],
                rear,
            )
            screw["detail_scale"] = "tertiary restrained fastener"

    rear_cutters: list[bpy.types.Object] = []
    for row in range(2):
        for column in range(10):
            x = -0.126 + column * 0.028
            z = 0.411 + row * 0.026
            rear_cutters.append(gate.rounded_box(
                f"CRT_RearVentOpeningCutter_{row + 1:02d}_{column + 1:02d}",
                (0.018, 0.040, 0.010),
                (x, 0.373, z),
                0.003,
                mats["cavity"],
                rear,
            ))
    boolean_openings(panel, rear_cutters, modifier_name="Open rear ventilation slots")
    gate.bevel(panel, 0.0010, 3)
    gate.rounded_box(
        "CRT_RearVentDarkInterior",
        (0.292, 0.006, 0.070),
        (0.0, 0.363, 0.424),
        0.010,
        mats["cavity"],
        rear,
    )["construction"] = "open vent wall with dark internal plenum"

    side = gate.new_collection("CRT_SIDE_VENT_DETAIL", destination)
    side_cutters: list[bpy.types.Object] = []
    shell = bpy.data.objects["CRT_RefinedDeepMouldedCabinetShell"]
    for row in range(2):
        for column in range(7):
            y = -0.020 + column * 0.031
            z = 0.486 + row * 0.024
            t = (y + 0.325) / (0.360 + 0.325)
            taper = gate.smoothstep((t - 0.22) / 0.78)
            shoulder = 0.006 * math.sin(math.pi * min(1.0, t / 0.30))
            surface_x = (cfg.DIMENSIONS_M["width"] * (1.0 - 0.45 * taper) + shoulder) * 0.5
            side_cutters.append(gate.rounded_box(
                f"CRT_SideVentOpeningCutter_{row + 1:02d}_{column + 1:02d}",
                (0.075, 0.020, 0.010),
                (surface_x, y, z),
                0.0025,
                mats["cavity"],
                side,
            ))
    boolean_openings(shell, side_cutters, modifier_name="Open side ventilation slots")
    gate.bevel(shell, 0.0010, 3)
    shell["side_vent_open_depth_m"] = 0.018
    shell["side_vent_plenum_depth_m"] = 0.045
    gate.rounded_box(
        "CRT_SideVentDarkPlenum",
        (0.014, 0.240, 0.075),
        (0.255, 0.073, 0.499),
        0.006,
        mats["cavity"],
        side,
    )["construction"] = "dark internal side-vent plenum behind true shell openings"

    connection = gate.new_collection("CRT_CABLE_CONNECTION", destination)
    collar = gate.cylinder(
        "CRT_IntegratedCableCollar",
        0.030,
        0.020,
        (0.205, 0.352, 0.135),
        (math.radians(90.0), 0.0, 0.0),
        mats["cable"],
        connection,
    )
    collar["manufacturing_logic"] = "integrated rear-lower moulded cable entry"
    collar["connector_response_before_arrival"] = 0.0
    collar["connector_response_after_arrival"] = "localized recessed collar response only"
    response_points = []
    for index in range(40):
        angle = math.radians(35.0 + (145.0 - 35.0) * index / 39.0)
        response_points.append(
            (
                0.205 + 0.0285 * math.cos(angle),
                0.3645,
                0.135 + 0.0285 * math.sin(angle),
            )
        )
    response = poly_curve(
        "CRT_ConnectorArrivalResponseRing",
        response_points,
        0.00090,
        mats["connector_response"],
        connection,
        cyclic=False,
    )
    response.hide_render = True
    response["response_before_arrival"] = 0.0
    response["response_after_arrival"] = 1.0
    response["response_locality"] = "restrained 110-degree inner-collar seam only; no cabinet-wide illumination"
    shroud = gate.rounded_box(
        "CRT_ProtectedCableEntryShroud",
        (0.092, 0.030, 0.034),
        (0.205, 0.350, 0.174),
        0.010,
        mats["secondary_abs"],
        connection,
    )
    shroud["manufacturing_logic"] = "restrained upper shroud hides the internal conductor transition"
    for index in range(6):
        radius = 0.026 - index * 0.0022
        y = 0.365 + index * 0.0025
        rib = gate.cylinder(
            f"CRT_StrainReliefRib_{index + 1:02d}",
            radius,
            0.004,
            (0.205, y, 0.135),
            (math.radians(90.0), 0.0, 0.0),
            mats["cable"],
            connection,
        )
        rib["role"] = "flexible ribbed strain relief"


def hidden_feet(mats: dict[str, bpy.types.Material], destination: bpy.types.Collection) -> None:
    index = 0
    for y in (-0.125, 0.125):
        for x in (-0.245, 0.245):
            index += 1
            foot = gate.rounded_box(
                f"CRT_RestrainedHiddenFoot_{index:02d}",
                (0.056, 0.042, 0.009),
                (x, y, 0.0045),
                0.004,
                mats["foot"],
                destination,
            )
            foot["ground_contact"] = "short tucked load pad; direct heavy contact; visually subordinate"


def spiral_points(
    turns: float = cfg.DESKTOP_SPIRAL_TURNS,
    outer_radius: float = 2.35,
) -> list[tuple[float, float, float]]:
    center_x, center_y = cfg.TV_OFFSET[0], cfg.TV_OFFSET[1]
    port_x = center_x + 0.205
    port_y = center_y + 0.380
    # Finish the ground run slightly outboard so its moulded transition can
    # follow the incoming tangent and rise diagonally into the rear collar.
    # This removes the former camera-visible vertical stump/U-section.
    ground_x = port_x + 0.105
    ground_y = port_y
    dx, dy = ground_x - center_x, ground_y - center_y
    end_angle = math.atan2(dy, dx)
    start_angle = end_angle - turns * math.tau
    inner_radius = math.hypot(dx, dy)
    samples = 181
    result = []
    for index in range(samples):
        t = index / (samples - 1)
        angle = start_angle + turns * math.tau * t
        radius = outer_radius + (inner_radius - outer_radius) * t
        result.append((center_x + radius * math.cos(angle), center_y + radius * math.sin(angle), 0.031))
    result.extend(
        (
            (ground_x - 0.025, ground_y - 0.004, 0.042),
            (ground_x - 0.050, ground_y - 0.010, 0.061),
            (ground_x - 0.075, ground_y - 0.018, 0.086),
            (ground_x - 0.095, ground_y - 0.026, 0.112),
            # The round sheathed section ends inside the 20 mm-deep rear collar;
            # no cut end or detached plug remains visible in review cameras.
            (port_x, port_y - 0.034, 0.135),
        )
    )
    return result


def offset_path(points: Sequence[Sequence[float]], offset: float, z: float) -> list[tuple[float, float, float]]:
    result = []
    for index, point in enumerate(points):
        prior = points[max(0, index - 1)]
        following = points[min(len(points) - 1, index + 1)]
        dx = following[0] - prior[0]
        dy = following[1] - prior[1]
        length = max(math.hypot(dx, dy), 1e-6)
        nx, ny = -dy / length, dx / length
        result.append((point[0] + nx * offset, point[1] + ny * offset, max(point[2], z)))
    return result


def path_frames(
    points: Sequence[Sequence[float]],
) -> list[tuple[Vector, Vector]]:
    """Return stable lateral/up frames for a mostly-grounded 3D cable path."""
    result: list[tuple[Vector, Vector]] = []
    previous_lateral = Vector((1.0, 0.0, 0.0))
    for index, point in enumerate(points):
        prior = Vector(points[max(0, index - 1)])
        following = Vector(points[min(len(points) - 1, index + 1)])
        tangent = following - prior
        if tangent.length < 1e-8:
            tangent = Vector((0.0, 0.0, 1.0))
        tangent.normalize()
        lateral = Vector((-tangent.y, tangent.x, 0.0))
        if lateral.length < 1e-5:
            lateral = previous_lateral.copy()
        else:
            lateral.normalize()
            if lateral.dot(previous_lateral) < 0.0:
                lateral.negate()
        up = tangent.cross(lateral)
        if up.length < 1e-5:
            up = Vector((0.0, 0.0, 1.0))
        else:
            up.normalize()
        previous_lateral = lateral.copy()
        result.append((lateral, up))
    return result


def swept_grooved_sheath(
    name: str,
    points: Sequence[Sequence[float]],
    radius: float,
    groove_half_width: float,
    groove_depth: float,
    mat: bpy.types.Material,
    cavity_mat: bpy.types.Material,
    destination: bpy.types.Collection,
    outer_samples: int = 58,
) -> bpy.types.Object:
    """Sweep one continuous graphite sheath with a true recessed top channel."""
    shoulder_z = math.sqrt(max(radius * radius - groove_half_width * groove_half_width, 0.0))
    floor_z = radius - groove_depth
    right_angle = math.atan2(shoulder_z, groove_half_width)
    left_angle = math.pi - right_angle
    cross_section: list[tuple[float, float]] = []
    # Long outer arc from left shoulder, around the grounded underside, to the
    # right shoulder. The final two vertices form the inset U-channel floor.
    for index in range(outer_samples):
        t = index / (outer_samples - 1)
        angle = left_angle + (right_angle + math.tau - left_angle) * t
        cross_section.append((radius * math.cos(angle), radius * math.sin(angle)))
    cross_section.extend(((groove_half_width, floor_z), (-groove_half_width, floor_z)))
    cross_count = len(cross_section)
    frames = path_frames(points)
    vertices: list[tuple[float, float, float]] = []
    for point, (lateral, up) in zip(points, frames):
        center = Vector(point)
        for cross_x, cross_z in cross_section:
            vertex = center + lateral * cross_x + up * cross_z
            vertices.append(tuple(vertex))

    faces: list[tuple[int, ...]] = []
    side_face_cross_index: list[int] = []
    for path_index in range(len(points) - 1):
        base = path_index * cross_count
        following = (path_index + 1) * cross_count
        for cross_index in range(cross_count):
            nxt = (cross_index + 1) % cross_count
            faces.append((base + cross_index, base + nxt, following + nxt, following + cross_index))
            side_face_cross_index.append(cross_index)
    faces.append(tuple(reversed(range(cross_count))))
    last = (len(points) - 1) * cross_count
    faces.append(tuple(last + index for index in range(cross_count)))

    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    destination.objects.link(obj)
    obj.data.materials.append(mat)
    obj.data.materials.append(cavity_mat)
    round_face_limit = outer_samples - 1
    for polygon, cross_index in zip(mesh.polygons, side_face_cross_index):
        polygon.use_smooth = cross_index < round_face_limit
        if cross_index >= outer_samples - 1:
            polygon.material_index = 1
    obj["construction"] = "single swept graphite sheath with concave U-channel cross-section"
    obj["outer_radius_m"] = radius
    obj["groove_half_width_m"] = groove_half_width
    obj["groove_depth_m"] = groove_depth
    obj["groove_floor_relative_m"] = floor_z
    obj["shoulder_crown_relative_m"] = shoulder_z
    obj["path_point_count"] = len(points)
    obj["cross_section_vertex_count"] = cross_count
    return obj


def swept_round_transition(
    name: str,
    points: Sequence[Sequence[float]],
    radii: Sequence[float],
    mat: bpy.types.Material,
    destination: bpy.types.Collection,
    radial_samples: int = 36,
) -> bpy.types.Object:
    """Create a closed, tapered moulded transition into the rear collar."""
    if len(points) != len(radii) or len(points) < 2:
        raise ValueError("transition points/radii must have matching lengths >= 2")
    frames = path_frames(points)
    vertices: list[tuple[float, float, float]] = []
    for point, radius, (lateral, up) in zip(points, radii, frames):
        center = Vector(point)
        for radial_index in range(radial_samples):
            angle = math.tau * radial_index / radial_samples
            vertex = center + lateral * (math.cos(angle) * radius) + up * (math.sin(angle) * radius)
            vertices.append(tuple(vertex))

    faces: list[tuple[int, ...]] = []
    for path_index in range(len(points) - 1):
        base = path_index * radial_samples
        following = (path_index + 1) * radial_samples
        for radial_index in range(radial_samples):
            nxt = (radial_index + 1) % radial_samples
            faces.append((base + radial_index, base + nxt, following + nxt, following + radial_index))
    faces.append(tuple(reversed(range(radial_samples))))
    last = (len(points) - 1) * radial_samples
    faces.append(tuple(last + radial_index for radial_index in range(radial_samples)))

    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    destination.objects.link(obj)
    obj.data.materials.append(mat)
    for polygon in mesh.polygons[:-2]:
        polygon.use_smooth = True
    obj["construction"] = "closed round tapered overmould overlapping the grooved sheath and terminating inside the rear collar"
    obj["start_radius_m"] = float(radii[0])
    obj["end_radius_m"] = float(radii[-1])
    obj["path_point_count"] = len(points)
    return obj


def build_spiral_variant(
    mats: dict[str, bpy.types.Material],
    destination: bpy.types.Collection,
    *,
    points: Sequence[Sequence[float]],
    turns: float,
    name_prefix: str,
) -> None:
    sheath_name = f"{name_prefix}ContinuousGraphiteSheath"
    # The final four points are enclosed by the moulded round transition.  The
    # two-point overlap hides the grooved sheath cap while preserving a single
    # physical cable path into the cabinet.
    sheath = swept_grooved_sheath(
        sheath_name,
        points[:-4],
        0.028,
        0.0060,
        0.0120,
        mats["cable"],
        mats["channel_cavity"],
        destination,
    )
    sheath["turns"] = turns
    sheath["physical_continuity"] = "one continuous outer-to-inner cable ending inside the rear strain relief"
    sheath["dormant_state"] = "graphite sheath; zero emission"
    transition_points = points[-6:]
    transition_radii = (0.0294, 0.0292, 0.0270, 0.0240, 0.0210, 0.0185)
    entry_overmould = swept_round_transition(
        f"{name_prefix}ProtectedEntryOvermould",
        transition_points,
        transition_radii,
        mats["cable"],
        destination,
    )
    entry_overmould["construction"] = (
        "closed tapered protective overmould enclosing the final grooved-sheath transition; overlaps the same continuous cable path"
    )
    entry_overmould["endpoint_inside_collar"] = True
    entry_overmould["exposed_cut_end"] = False
    frames = path_frames(points)
    # The 2.3 mm signal core sits on the centreline of the U-channel, well
    # below both enclosing graphite shoulders.
    # The final rising segments remain physically sheathed but optically hidden
    # beneath the protected cabinet entry, preventing a vertical hot strip.
    signal_centerline = []
    for point, (_, up) in zip(points, frames):
        signal_centerline.append(tuple(Vector(point) + up * 0.0176))
    channel = gate.new_collection(f"{name_prefix.upper()}RECESSED_CONDUCTOR_SEGMENTS", destination)
    segment_count = len(points) - 1
    for index in range(segment_count):
        start = signal_centerline[index]
        end = signal_centerline[index + 1]
        segment = poly_curve(
            f"{name_prefix}InternalChannel_{index + 1:03d}",
            (start, end),
            0.00115,
            mats["channel_inactive"],
            channel,
        )
        segment["progress_start"] = index / segment_count
        segment["progress_end"] = (index + 1) / segment_count
        segment["recessed"] = True
        segment["core_diameter_m"] = 0.0023
        segment["core_lateral_offset_m"] = 0.0
        segment["core_crown_below_sheath_shoulders_m"] = 0.0086
        segment["entry_hidden"] = index >= segment_count - 5


def build_spiral_cable(mats: dict[str, bpy.types.Material], destination: bpy.types.Collection) -> None:
    build_spiral_variant(
        mats,
        destination,
        points=spiral_points(cfg.DESKTOP_SPIRAL_TURNS, 2.35),
        turns=cfg.DESKTOP_SPIRAL_TURNS,
        name_prefix="SpiralCable_",
    )


def build_mobile_spiral_cable(mats: dict[str, bpy.types.Material], destination: bpy.types.Collection) -> None:
    build_spiral_variant(
        mats,
        destination,
        points=spiral_points(cfg.MOBILE_SPIRAL_TURNS, 1.62),
        turns=cfg.MOBILE_SPIRAL_TURNS,
        name_prefix="MobileSpiralCable_",
    )


def proving_ground(mats: dict[str, bpy.types.Material], destination: bpy.types.Collection) -> None:
    gate.rounded_box("ProvingGround_Terrain", (10.0, 10.0, 0.06), (0.0, 0.0, -0.03), 0.010, mats["terrain"], destination)
    install = gate.rounded_box(
        "ProvingGround_FlushCRTInstallationZone",
        (1.36, 1.18, 0.010),
        (cfg.TV_OFFSET[0], cfg.TV_OFFSET[1] + 0.02, 0.001),
        0.018,
        mats["installation"],
        destination,
    )
    install["scale_cue"] = "flush 1.36 x 1.18 m maintenance zone; never a product plinth"
    for index, (dims, location) in enumerate(
        (
            ((1.40, 0.009, 0.006), (cfg.TV_OFFSET[0], cfg.TV_OFFSET[1] - 0.575, 0.007)),
            ((1.40, 0.009, 0.006), (cfg.TV_OFFSET[0], cfg.TV_OFFSET[1] + 0.615, 0.007)),
            ((0.009, 1.18, 0.006), (cfg.TV_OFFSET[0] - 0.695, cfg.TV_OFFSET[1] + 0.02, 0.007)),
            ((0.009, 1.18, 0.006), (cfg.TV_OFFSET[0] + 0.695, cfg.TV_OFFSET[1] + 0.02, 0.007)),
        ),
        1,
    ):
        gate.rounded_box(
            f"ProvingGround_InstallationSeam_{index:02d}", dims, location, 0.002,
            mats["cavity"], destination,
        )
    entry_channel = gate.rounded_box(
        "ProvingGround_ProtectedCableEntryChannel",
        (0.115, 0.46, 0.012),
        (cfg.TV_OFFSET[0] + 0.205, cfg.TV_OFFSET[1] + 0.475, 0.003),
        0.012,
        mats["cavity"],
        destination,
    )
    entry_channel["installation_logic"] = "flush ground chase aligned to the protected rear cable entry"
    plate = gate.rounded_box(
        "ProvingGround_ForegroundServicePlate",
        (1.25, 0.72, 0.018),
        (-1.78, -1.18, 0.003),
        0.012,
        mats["plate"],
        destination,
        rotation=(0.0, 0.0, math.radians(-12.0)),
    )
    plate["depth_anchor"] = "quiet foreground service plate flush with terrain"
    for index, x in enumerate((-2.22, -1.34), 1):
        gate.cylinder(
            f"ProvingGround_ServicePlateAnchor_{index:02d}",
            0.018,
            0.009,
            (x, -1.18, 0.014),
            (0.0, 0.0, 0.0),
            mats["fastener"],
            destination,
        )
    gate.rounded_box("ProvingGround_DrainageSeam", (0.040, 4.2, 0.010), (-2.65, 0.25, 0.004), 0.006, mats["cavity"], destination)
    gate.rounded_box("ProvingGround_MaterialTransition", (5.2, 0.018, 0.006), (0.35, 2.35, 0.005), 0.003, mats["cavity"], destination)

    for index in range(7):
        y = -1.05 + index * 0.125
        gate.rounded_box(
            f"ProvingGround_DrainageSlot_{index + 1:02d}",
            (0.020, 0.076, 0.010),
            (-2.65, y, 0.006),
            0.003,
            mats["cavity"],
            destination,
        )

    distance = gate.new_collection("PROVING_GROUND_DISTANCE", destination)
    for index, (x, width, height) in enumerate(((-3.0, 0.45, 1.15), (-1.9, 0.82, 0.72), (2.7, 1.35, 0.88)), 1):
        gate.rounded_box(
            f"Distance_IndustrialMass_{index:02d}",
            (width, 0.52, height),
            (x, 4.20 + index * 0.08, height * 0.5 - 0.01),
            0.025,
            mats["distance"],
            distance,
        )
    for x in (-3.6, 3.6):
        gate.rounded_box(f"Distance_GantryPost_{'L' if x < 0 else 'R'}", (0.10, 0.12, 1.55), (x, 3.75, 0.775), 0.012, mats["distance"], distance)
    gate.rounded_box("Distance_GantryBeam", (7.30, 0.12, 0.10), (0.0, 3.75, 1.46), 0.012, mats["distance"], distance)
    gate.cylinder("Distance_UtilityPipe_Low", 0.075, 5.8, (-1.2, 4.0, 0.25), (0.0, math.radians(90.0), 0.0), mats["distance"], distance)
    gate.cylinder("Distance_UtilityPipe_High", 0.062, 5.8, (-1.2, 4.0, 0.43), (0.0, math.radians(90.0), 0.0), mats["distance"], distance)
    for index, x in enumerate((-2.9, -1.45, 0.0, 1.45, 2.9), 1):
        gate.rounded_box(
            f"Distance_PipeSupport_{index:02d}",
            (0.075, 0.18, 0.48),
            (x, 4.0, 0.24),
            0.008,
            mats["distance"],
            distance,
        )
    gate.rounded_box(
        "Distance_LowWarehouseDatum",
        (4.8, 0.72, 0.52),
        (0.8, 4.65, 0.25),
        0.020,
        mats["distance"],
        distance,
    )["depth_role"] = "subordinate low industrial horizon and installation scale cue"


def add_camera(name: str, spec: dict, destination: bpy.types.Collection) -> bpy.types.Object:
    data = bpy.data.cameras.new(name)
    data.type = "PERSP"
    data.lens = spec["lens"]
    data.sensor_width = 36.0
    obj = bpy.data.objects.new(name, data)
    obj.location = spec["location"]
    gate.point_at(obj, spec["target"])
    destination.objects.link(obj)
    return obj


def build() -> None:
    args = cli_args()
    output = args.output.resolve()
    script = Path(__file__).resolve()
    refined_config = Path(cfg.__file__).resolve()
    canonical_config = Path(canonical.__file__).resolve()
    gate.clear_scene()
    scene = bpy.context.scene
    scene.render.engine = cfg.ITERATION_ENGINE
    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = cfg.ITERATION_SAMPLES
    scene.render.resolution_x, scene.render.resolution_y = cfg.CANONICAL_RESOLUTION
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 48
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.world.use_nodes = True
    world = scene.world.node_tree.nodes.get("Background")
    world.inputs["Color"].default_value = (0.006, 0.008, 0.009, 1.0)
    world.inputs["Strength"].default_value = 0.13

    root = gate.new_collection("PHASE_0_4_REFINED_QUANTUM_SIGNAL_TELEVISION", scene)
    assembly = gate.new_collection("REFINED_CRT_ASSEMBLY", root)
    cable = gate.new_collection("DESKTOP_2_5_TURN_SPIRAL_CABLE", root)
    mobile_cable = gate.new_collection("MOBILE_2_25_TURN_SPIRAL_CABLE", root)
    environment = gate.new_collection("INDUSTRIAL_PROVING_GROUND", root)
    cameras = gate.new_collection("CAMERAS", root)
    lighting = gate.new_collection("NEUTRAL_CONTROLLED_LIGHTING", root)

    mats = {
        "cabinet": gate.material("CRT_CaredForCharcoalABS", (0.008, 0.010, 0.011), 0.50, microtexture=True),
        "secondary_abs": gate.material("CRT_SecondaryMouldedABS", (0.006, 0.008, 0.009), 0.56, microtexture=True),
        "bezel": gate.material("CRT_ThickProtectiveBezelABS", (0.004, 0.006, 0.007), 0.43, microtexture=True),
        "gasket": gate.material("CRT_GlassPerimeterGasket", (0.004, 0.005, 0.005), 0.73),
        "glass": gate.material("CRT_ThickSmokedGlass", (0.0018, 0.0040, 0.0048), 0.14),
        "phosphor_off": emitted_material("CRT_PhosphorOff", (0.007, 0.011, 0.010), (0.0, 0.0, 0.0), 0.0, 0.32),
        "phosphor_low": emitted_material("CRT_PhosphorLowGrey", (0.046, 0.049, 0.047), (0.30, 0.31, 0.29), 0.75, 0.36),
        "phosphor_takeover": emitted_material("CRT_PhosphorTakeoverField", (0.042, 0.044, 0.043), (0.28, 0.25, 0.265), 0.88, 0.38),
        "wake_line": emitted_material("CRT_WakeLineEmission", (0.090, 0.070, 0.072), (0.48, 0.19, 0.29), 0.82, 0.36),
        "raster_warming": emitted_material("CRT_StartupRasterWarming", (0.036, 0.034, 0.033), (0.22, 0.14, 0.17), 0.48, 0.42),
        "scanline": emitted_material("CRT_SubtleScanline", (0.016, 0.015, 0.015), (0.15, 0.13, 0.14), 0.38, 0.58),
        "interface": emitted_material("CRT_PhysicalSignalInterface", (0.26, 0.25, 0.23), (0.84, 0.72, 0.77), 0.72, 0.36),
        "portal_cue": emitted_material("CRT_TextFreePortalContinuityCue", (0.040, 0.038, 0.037), (0.28, 0.20, 0.22), 0.55, 0.54),
        "control": gate.material("CRT_EraPhysicalControlCaps", (0.018, 0.021, 0.021), 0.58, microtexture=True),
        "indicator_off": emitted_material("CRT_PowerIndicatorOff", (0.025, 0.004, 0.002), (0.0, 0.0, 0.0), 0.0, 0.28),
        "indicator_on": emitted_material("CRT_PowerIndicatorWarmMagenta", (0.18, 0.025, 0.055), (0.90, 0.16, 0.38), 1.4, 0.25),
        "cavity": gate.material("CRT_VentSpeakerCavity", (0.002, 0.003, 0.003), 0.76),
        "fastener": gate.material("CRT_RestrainedFastener", (0.075, 0.078, 0.075), 0.38, 0.35),
        "foot": gate.material("CRT_RestrainedHiddenFoot", (0.006, 0.007, 0.007), 0.77),
        "seam": gate.material("CRT_ControlledCabinetSeam", (0.006, 0.007, 0.007), 0.65),
        "cable": gate.material("SpiralCable_GraphiteSheath", (0.011, 0.013, 0.013), 0.64, microtexture=True),
        "channel_cavity": gate.material("SpiralCable_RecessedChannelCavity", (0.001, 0.001, 0.001), 0.72),
        "channel_inactive": gate.material("SpiralCable_InactiveInternalChannel", (0.004, 0.001, 0.002), 0.38),
        "channel_active": emitted_material("SpiralCable_EnergizedTrail", (0.060, 0.003, 0.016), (0.25, 0.009, 0.061), 0.28, 0.44),
        "channel_front": emitted_material("SpiralCable_ModestlyBrighterFront", (0.105, 0.006, 0.029), (0.42, 0.021, 0.115), 0.48, 0.38),
        "connector_response": emitted_material("CRT_LocalConnectorArrivalResponse", (0.052, 0.003, 0.015), (0.27, 0.009, 0.057), 0.45, 0.48),
        "terrain": gate.material("ProvingGround_DarkAggregateTerrain", (0.014, 0.017, 0.018), 0.82, microtexture=True),
        "plate": gate.material("ProvingGround_ServicePlate", (0.027, 0.031, 0.032), 0.66, 0.18, microtexture=True),
        "installation": gate.material("ProvingGround_FlushInstallationSurface", (0.019, 0.022, 0.023), 0.76, 0.04, microtexture=True),
        "distance": gate.material("ProvingGround_AtmosphericInfrastructure", (0.007, 0.010, 0.011), 0.90, 0.0),
    }
    for key in ("cabinet", "secondary_abs", "bezel", "control"):
        refine_abs_material(mats[key])
    # State-only materials are switched in deterministic still render scripts;
    # retain them even when the saved dormant source has no direct user.
    for key in ("phosphor_low", "indicator_on", "channel_active", "channel_front"):
        mats[key].use_fake_user = True
    glass_shader = mats["glass"].node_tree.nodes.get("Principled BSDF")
    glass_shader.inputs["Roughness"].default_value = 0.14
    if "Transmission Weight" in glass_shader.inputs:
        # Smoked CRT glass remains physically transmissive while the phosphor
        # behind it is optically black.  The earlier 0.08 value behaved like
        # opaque glossy plastic under Cycles.
        glass_shader.inputs["Transmission Weight"].default_value = 0.58
    if "IOR" in glass_shader.inputs:
        glass_shader.inputs["IOR"].default_value = 1.52
    for input_name in ("Specular IOR Level", "IOR Level"):
        if input_name in glass_shader.inputs:
            glass_shader.inputs[input_name].default_value = 0.32
    if "Coat Weight" in glass_shader.inputs:
        glass_shader.inputs["Coat Weight"].default_value = 0.0
    if "Coat Roughness" in glass_shader.inputs:
        glass_shader.inputs["Coat Roughness"].default_value = 0.14
    mats["glass"]["phase_0_4r_smoked_glass_contract"] = (
        "0.58 dormant transmission; 0.14 roughness; IOR 1.52; explicit Specular IOR Level 0.32; no coat"
    )

    refined_shell(mats["cabinet"], assembly)
    closed_shell_seam(mats["seam"], assembly)
    screen_and_bezel(mats, assembly)
    speaker_controls(mats, assembly)
    rear_and_side_details(mats, assembly)
    hidden_feet(mats, assembly)

    tv_root = bpy.data.objects.new("CRT_ASSEMBLY_ROOT", None)
    assembly.objects.link(tv_root)
    for obj in list(assembly.all_objects):
        if obj != tv_root and obj.parent is None:
            obj.parent = tv_root
    tv_root.location = cfg.TV_OFFSET
    tv_root["assembled_working_dimensions_m"] = "0.84 W x 0.69 H x 0.76 D"
    tv_root["screen_class"] = "29-inch 4:3"
    tv_root["modelled_from_scratch"] = True

    build_spiral_cable(mats, cable)
    build_mobile_spiral_cable(mats, mobile_cable)
    mobile_cable.hide_render = True
    proving_ground(mats, environment)
    for name, spec in cfg.CAMERAS.items():
        add_camera(name, spec, cameras)

    gate.area_light("Scene_NeutralKey", (-3.6, -4.8, 4.4), 520.0, (0.82, 0.84, 0.81), 1.7, (0.3, 0.2, 0.3), lighting)
    gate.area_light("Scene_GrazingRim", (4.8, 2.6, 3.2), 450.0, (0.66, 0.70, 0.69), 2.2, (0.7, 0.3, 0.4), lighting)
    gate.area_light("Scene_FrontFill", (-0.2, -3.0, 1.5), 180.0, (0.61, 0.63, 0.60), 2.0, (0.6, 0.2, 0.35), lighting)
    gate.area_light("Scene_BackServiceFill", (1.8, 3.8, 1.9), 250.0, (0.58, 0.62, 0.62), 1.8, (0.7, 0.4, 0.32), lighting)
    gate.area_light("Scene_GlassProofAccent", (-2.35, -2.35, 1.72), 105.0, (0.72, 0.74, 0.70), 0.30, (0.65, -0.10, 0.425), lighting)
    for light_name, factor in (
        ("Scene_NeutralKey", 0.08),
        ("Scene_GrazingRim", 0.22),
        ("Scene_FrontFill", 0.05),
        ("Scene_BackServiceFill", 0.08),
    ):
        light = bpy.data.objects[light_name]
        if hasattr(light.data, "specular_factor"):
            light.data.specular_factor = factor
    glass_accent = bpy.data.objects["Scene_GlassProofAccent"]
    if hasattr(glass_accent.data, "specular_factor"):
        glass_accent.data.specular_factor = 1.0
    bpy.data.objects["Scene_GlassProofAccent"].hide_render = True

    scene.camera = bpy.data.objects["Camera_Dormant_Hero"]
    scene["phase"] = "Phase 0.4R bounded CRT quality repair"
    scene["selected_variant"] = "A / Rounded 1990s domestic CRT"
    scene["proportion_gate_released"] = True
    scene["full_animatic_created"] = False
    scene["modelled_from_scratch"] = True
    scene["third_party_models"] = 0
    scene["external_assets"] = False
    scene["external_libraries"] = 0
    scene["external_images"] = 0
    scene["packed_files"] = 0
    scene["private_reference_loaded_in_blender"] = False
    scene["procedural_materials_only"] = True
    scene["desktop_spiral_turns"] = cfg.DESKTOP_SPIRAL_TURNS
    scene["mobile_spiral_turns"] = cfg.MOBILE_SPIRAL_TURNS
    scene["mobile_composition_authored_separately"] = True
    scene["screen_aspect"] = "4:3"
    scene["physical_screen_content_stages_json"] = json.dumps(
        ["QUANTUM HUB", "FRAME SOURCE ASSESS TEST DECIDE", "TEST ROUTE AVAILABLE"],
        separators=(",", ":"),
    )
    scene["crt_startup_sequence"] = (
        "brief bowed horizontal line > vertically expanding 4:3 partial raster with degaussing ripple > "
        "full rounded 4:3 raster with ripple settled"
    )
    scene["connector_response_contract"] = (
        "zero before cable arrival; localized recessed collar response only after arrival; no cabinet-wide light"
    )
    scene["portal_takeover_continuity"] = (
        "same phosphor field, 4:3 rectangular scanlines, route baseline and overscan cues; "
        "no blank frame and no doubled semantic copy"
    )
    scene["portal_layout_package_relative"] = cfg.PORTAL_LAYOUT.relative_to(cfg.PACKAGE_DIR).as_posix()
    scene["portal_layout_sha256"] = cfg.PORTAL_LAYOUT_SHA256
    scene["source_generator_sha256"] = sha256(script)
    scene["refined_config_sha256"] = sha256(refined_config)
    scene["canonical_config_sha256"] = sha256(canonical_config)
    scene["canonical_state_authority_schema"] = (
        "quantum-hub.phase-0-4-crt-television.canonical-still-render-inventory.v1"
    )
    scene["power_state_ids_json"] = json.dumps(canonical.POWER_STATE_IDS)
    scene["portal_state_ids_json"] = json.dumps(canonical.PORTAL_STATE_IDS)

    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output), compress=True, relative_remap=True, copy=True)
    source_manifest = {
        "schema": "quantum-hub.phase-0-4-crt-television.refined-source-build.v1",
        "script_version": cfg.SCRIPT_VERSION,
        "source": {
            "package_relative_path": output.relative_to(cfg.PACKAGE_DIR).as_posix(),
            "bytes": output.stat().st_size,
            "sha256": sha256(output),
        },
        "generator": {
            "package_relative_path": script.relative_to(cfg.PACKAGE_DIR).as_posix(),
            "bytes": script.stat().st_size,
            "sha256": sha256(script),
        },
        "configuration_authority": [
            {
                "package_relative_path": refined_config.relative_to(cfg.PACKAGE_DIR).as_posix(),
                "bytes": refined_config.stat().st_size,
                "sha256": sha256(refined_config),
            },
            {
                "package_relative_path": canonical_config.relative_to(cfg.PACKAGE_DIR).as_posix(),
                "bytes": canonical_config.stat().st_size,
                "sha256": sha256(canonical_config),
            },
        ],
        "layout_authority": {
            "package_relative_path": cfg.PORTAL_LAYOUT.relative_to(cfg.PACKAGE_DIR).as_posix(),
            "bytes": cfg.PORTAL_LAYOUT.stat().st_size,
            "sha256": cfg.PORTAL_LAYOUT_SHA256,
        },
        "selected_variant": "A / Rounded 1990s domestic CRT",
        "dimensions_m": cfg.DIMENSIONS_M,
        "screen_class_inches": cfg.SCREEN_CLASS_INCHES,
        "screen_visible_m": cfg.SCREEN_VISIBLE_M,
        "desktop_spiral_turns": cfg.DESKTOP_SPIRAL_TURNS,
        "mobile_spiral_turns": cfg.MOBILE_SPIRAL_TURNS,
        "mobile_composition_authored_separately": True,
        "desktop_cable_collection": "DESKTOP_2_5_TURN_SPIRAL_CABLE",
        "mobile_cable_collection": "MOBILE_2_25_TURN_SPIRAL_CABLE",
        "portal_layout_sha256": cfg.PORTAL_LAYOUT_SHA256,
        "canonical_state_authority": {
            "schema": "quantum-hub.phase-0-4-crt-television.canonical-still-render-inventory.v1",
            "power_state_ids": canonical.POWER_STATE_IDS,
            "portal_state_ids": canonical.PORTAL_STATE_IDS,
        },
        "creative_boundary": {
            "modelled_from_scratch": True,
            "procedural_materials_only": True,
            "third_party_models": 0,
            "external_images": 0,
            "packed_files": 0,
            "private_reference_loaded": False,
            "full_animatic_created": False,
        },
    }
    cfg.MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    (cfg.MANIFEST_DIR / "crt-refined-source-build.json").write_text(
        json.dumps(source_manifest, indent=2) + "\n", encoding="utf-8"
    )
    print(f"QH_PHASE04_CRT_REFINED_SOURCE={output}")
    print(f"QH_PHASE04_CRT_REFINED_OBJECTS={len(bpy.data.objects)}")
    print(f"QH_PHASE04_CRT_REFINED_IMAGES={len(bpy.data.images)}")
    print(f"QH_PHASE04_CRT_REFINED_LIBRARIES={len(bpy.data.libraries)}")


if __name__ == "__main__":
    build()
