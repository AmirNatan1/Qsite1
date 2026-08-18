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
    shader = mat.node_tree.nodes.get("Principled BSDF")
    if "Emission Color" in shader.inputs:
        shader.inputs["Emission Color"].default_value = (*emission, 1.0)
        shader.inputs["Emission Strength"].default_value = strength
    else:
        shader.inputs["Emission"].default_value = (*emission, 1.0)
        shader.inputs["Emission Strength"].default_value = strength
    return mat


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


def refined_shell(mat: bpy.types.Material, destination: bpy.types.Collection) -> bpy.types.Object:
    width = cfg.DIMENSIONS_M["width"]
    height = 0.675
    front_y, rear_y = -0.325, 0.360
    section_count = 37
    section_size = 64
    vertices: list[tuple[float, float, float]] = []
    for section in range(section_count):
        t = section / (section_count - 1)
        taper = gate.smoothstep((t - 0.18) / 0.82)
        current_width = width * (1.0 - 0.47 * taper)
        current_height = height * (1.0 - 0.31 * taper)
        current_center_z = 0.015 + current_height * 0.5 + 0.115 * taper
        current_radius = 0.105 * (1.0 - 0.34 * taper)
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
    obj["manufacturing_logic"] = "37-section injection-moulded ABS enclosure with deep CRT taper"
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
    phosphor["state"] = "dormant"

    wake_points = []
    for index in range(33):
        x = -0.178 + index * (0.356 / 32.0)
        wake_points.append((x, screen_face_y(x, 0.425), 0.425))
    wake = poly_curve("CRT_WakeHorizontalPhosphorLine", wake_points, 0.0026, mats["wake_line"], destination)
    wake.hide_render = True
    wake["activation_role"] = "single authentic CRT wake line; hidden while dormant"

    scanline_parent = gate.new_collection("CRT_SCANLINE_GEOMETRY", destination)
    for index in range(30):
        z = 0.425 - 0.194 + index * (0.388 / 29.0)
        half = max(0.0, 1.0 - ((z - 0.425) / 0.225) ** 2) ** 0.5
        width = 0.535 * half
        scan_points = []
        for point_index in range(33):
            x = -width * 0.5 + width * point_index / 32.0
            scan_points.append((x, screen_face_y(x, z, -0.0006), z))
        line = poly_curve(
            f"CRT_Scanline_{index + 1:02d}",
            scan_points,
            0.0008,
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
        ),
        (
            "CRT_InterfaceStatus",
            status,
            0.026,
            (surface_x(status_anchor["x"]), -0.3910, surface_z(status_anchor["y"])),
            (status_anchor["x"], status_anchor["y"]),
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
        )
    )
    for name, body, size, location, pixel_anchor in text_specs:
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
        if name == "CRT_InterfaceRouteCarrier":
            obj["route_words_json"] = json.dumps(route_words, separators=(",", ":"))
            obj["route_item_starts_px_json"] = json.dumps(
                physical["routeRegion"]["itemStarts"], separators=(",", ":")
            )


def speaker_controls(mats: dict[str, bpy.types.Material], destination: bpy.types.Collection) -> None:
    band = gate.rounded_box(
        "CRT_LowerSpeakerControlBand",
        (0.785, 0.048, 0.122),
        (0.0, -0.346, 0.078),
        0.017,
        mats["secondary_abs"],
        destination,
    )
    band["manufacturing_logic"] = "integrated lower ABS speaker/control moulding"
    # Actual perforation geometry: five staggered rows of recessed circular cavities.
    grille = gate.new_collection("CRT_SPEAKER_PERFORATIONS", destination)
    columns, rows = 17, 5
    for row in range(rows):
        for column in range(columns):
            x = -0.330 + column * 0.027 + (0.0135 if row % 2 else 0.0)
            z = 0.048 + row * 0.0145
            if x > 0.112:
                continue
            gate.cylinder(
                f"CRT_SpeakerPerforation_{row + 1:02d}_{column + 1:02d}",
                0.0042,
                0.006,
                (x, -0.373, z),
                (math.radians(90.0), 0.0, 0.0),
                mats["cavity"],
                grille,
            )

    controls = gate.new_collection("CRT_PHYSICAL_CONTROLS", destination)
    control_specs = (
        (0.190, 0.052, 0.038),
        (0.252, 0.044, 0.036),
        (0.307, 0.044, 0.036),
    )
    for index, (x, width, height) in enumerate(control_specs, 1):
        gate.rounded_box(
            f"CRT_ControlRecess_{index:02d}",
            (width + 0.010, 0.006, height + 0.010),
            (x, -0.372, 0.076),
            0.007,
            mats["cavity"],
            controls,
        )
        cap = gate.rounded_box(
            f"CRT_ControlButtonCap_{index:02d}",
            (width, 0.010, height),
            (x, -0.376, 0.076),
            0.006,
            mats["control"],
            controls,
        )
        cap["interaction"] = "era-authentic physical push control"
    indicator = gate.cylinder(
        "CRT_DormantPowerIndicator",
        0.0055,
        0.006,
        (0.352, -0.377, 0.076),
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

    for row in range(3):
        for column in range(12):
            x = -0.154 + column * 0.028
            z = 0.482 + row * 0.022
            gate.rounded_box(
                f"CRT_RearVentSlot_{row + 1:02d}_{column + 1:02d}",
                (0.018, 0.006, 0.010),
                (x, 0.379, z),
                0.003,
                mats["cavity"],
                rear,
            )

    side = gate.new_collection("CRT_SIDE_VENT_DETAIL", destination)
    for row in range(2):
        for column in range(9):
            y = 0.045 + column * 0.027
            z = 0.475 + row * 0.021
            gate.rounded_box(
                f"CRT_SideVentSlot_{row + 1:02d}_{column + 1:02d}",
                (0.006, 0.017, 0.010),
                (0.418, y, z),
                0.0025,
                mats["cavity"],
                side,
            )

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
    for y in (-0.155, 0.155):
        for x in (-0.275, 0.275):
            index += 1
            foot = gate.rounded_box(
                f"CRT_RestrainedHiddenFoot_{index:02d}",
                (0.078, 0.056, 0.012),
                (x, y, 0.006),
                0.005,
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
    dx, dy = port_x - center_x, port_y - center_y
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
            (port_x, port_y, 0.034),
            (port_x, port_y, 0.072),
            (port_x, port_y, 0.135),
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
    round_face_limit = outer_samples - 1
    for polygon, cross_index in zip(mesh.polygons, side_face_cross_index):
        polygon.use_smooth = cross_index < round_face_limit
    obj["construction"] = "single swept graphite sheath with concave U-channel cross-section"
    obj["outer_radius_m"] = radius
    obj["groove_half_width_m"] = groove_half_width
    obj["groove_depth_m"] = groove_depth
    obj["groove_floor_relative_m"] = floor_z
    obj["shoulder_crown_relative_m"] = shoulder_z
    obj["path_point_count"] = len(points)
    obj["cross_section_vertex_count"] = cross_count
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
    sheath = swept_grooved_sheath(
        sheath_name,
        points,
        0.028,
        0.0070,
        0.0100,
        mats["cable"],
        destination,
    )
    sheath["turns"] = turns
    sheath["physical_continuity"] = "one continuous outer-to-inner cable ending inside the rear strain relief"
    sheath["dormant_state"] = "graphite sheath; zero emission"
    frames = path_frames(points)
    # The 6 mm-diameter signal core rests inside the 18 mm-high groove floor.
    # Its crown remains about 2.1 mm below both 27.1 mm sheath shoulders.
    signal_centerline = []
    for point, (_, up) in zip(points, frames):
        signal_centerline.append(tuple(Vector(point) + up * 0.0220))
    channel = gate.new_collection(f"{name_prefix.upper()}RECESSED_CONDUCTOR_SEGMENTS", destination)
    segment_count = len(points) - 1
    for index in range(segment_count):
        start = signal_centerline[index]
        end = signal_centerline[index + 1]
        segment = poly_curve(
            f"{name_prefix}InternalChannel_{index + 1:03d}",
            (start, end),
            0.0030,
            mats["channel_inactive"],
            channel,
        )
        segment["progress_start"] = index / segment_count
        segment["progress_end"] = (index + 1) / segment_count
        segment["recessed"] = True
        segment["core_crown_below_sheath_shoulders_m"] = 0.0021


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
    gate.rounded_box("ProvingGround_DrainageSeam", (0.022, 4.2, 0.008), (-2.65, 0.25, 0.006), 0.004, mats["cavity"], destination)
    gate.rounded_box("ProvingGround_MaterialTransition", (5.2, 0.018, 0.006), (0.35, 2.35, 0.005), 0.003, mats["cavity"], destination)

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
    gate.cylinder("Distance_UtilityPipe", 0.13, 5.8, (-1.2, 4.0, 0.34), (0.0, math.radians(90.0), 0.0), mats["distance"], distance)


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
        "glass": gate.material("CRT_ThickSmokedGlass", (0.003, 0.007, 0.008), 0.13),
        "phosphor_off": emitted_material("CRT_PhosphorOff", (0.007, 0.011, 0.010), (0.0, 0.0, 0.0), 0.0, 0.32),
        "phosphor_low": emitted_material("CRT_PhosphorLowGrey", (0.025, 0.028, 0.027), (0.19, 0.20, 0.18), 0.32, 0.34),
        "wake_line": emitted_material("CRT_WakeLineEmission", (0.20, 0.16, 0.15), (0.92, 0.45, 0.62), 1.8, 0.28),
        "scanline": gate.material("CRT_SubtleScanline", (0.002, 0.003, 0.003), 0.72),
        "interface": emitted_material("CRT_PhysicalSignalInterface", (0.26, 0.25, 0.23), (0.84, 0.72, 0.77), 0.72, 0.36),
        "control": gate.material("CRT_EraPhysicalControlCaps", (0.018, 0.021, 0.021), 0.58, microtexture=True),
        "indicator_off": emitted_material("CRT_PowerIndicatorOff", (0.025, 0.004, 0.002), (0.0, 0.0, 0.0), 0.0, 0.28),
        "indicator_on": emitted_material("CRT_PowerIndicatorWarmMagenta", (0.18, 0.025, 0.055), (0.90, 0.16, 0.38), 1.4, 0.25),
        "cavity": gate.material("CRT_VentSpeakerCavity", (0.002, 0.003, 0.003), 0.76),
        "fastener": gate.material("CRT_RestrainedFastener", (0.075, 0.078, 0.075), 0.38, 0.35),
        "foot": gate.material("CRT_RestrainedHiddenFoot", (0.006, 0.007, 0.007), 0.77),
        "seam": gate.material("CRT_ControlledCabinetSeam", (0.006, 0.007, 0.007), 0.65),
        "cable": gate.material("SpiralCable_GraphiteSheath", (0.004, 0.005, 0.005), 0.70),
        "channel_cavity": gate.material("SpiralCable_RecessedChannelCavity", (0.001, 0.001, 0.001), 0.72),
        "channel_inactive": gate.material("SpiralCable_InactiveInternalChannel", (0.004, 0.001, 0.002), 0.38),
        "channel_active": emitted_material("SpiralCable_EnergizedTrail", (0.105, 0.006, 0.028), (0.46, 0.018, 0.12), 0.58, 0.34),
        "channel_front": emitted_material("SpiralCable_ModestlyBrighterFront", (0.18, 0.010, 0.048), (0.72, 0.045, 0.20), 0.92, 0.30),
        "terrain": gate.material("ProvingGround_DarkAggregateTerrain", (0.014, 0.017, 0.018), 0.82, microtexture=True),
        "plate": gate.material("ProvingGround_ServicePlate", (0.027, 0.031, 0.032), 0.66, 0.18, microtexture=True),
        "distance": gate.material("ProvingGround_AtmosphericInfrastructure", (0.007, 0.010, 0.011), 0.90, 0.0),
    }
    # State-only materials are switched in deterministic still render scripts;
    # retain them even when the saved dormant source has no direct user.
    for key in ("phosphor_low", "indicator_on", "channel_active", "channel_front"):
        mats[key].use_fake_user = True
    glass_shader = mats["glass"].node_tree.nodes.get("Principled BSDF")
    if "Transmission Weight" in glass_shader.inputs:
        # The forward cap has no rear ellipsoid silhouette, so a restrained
        # transmission component can reveal the separate phosphor layer.
        glass_shader.inputs["Transmission Weight"].default_value = 0.18
    if "IOR" in glass_shader.inputs:
        glass_shader.inputs["IOR"].default_value = 1.52
    if "Coat Weight" in glass_shader.inputs:
        glass_shader.inputs["Coat Weight"].default_value = 0.28
    if "Coat Roughness" in glass_shader.inputs:
        glass_shader.inputs["Coat Roughness"].default_value = 0.08

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

    gate.area_light("Scene_NeutralKey", (-3.6, -4.8, 4.4), 520.0, (0.82, 0.84, 0.81), 3.4, (0.3, 0.2, 0.3), lighting)
    gate.area_light("Scene_GrazingRim", (4.8, 2.6, 3.2), 420.0, (0.66, 0.70, 0.69), 2.8, (0.7, 0.3, 0.4), lighting)
    gate.area_light("Scene_FrontFill", (-0.2, -3.0, 1.5), 145.0, (0.61, 0.63, 0.60), 3.0, (0.6, 0.2, 0.35), lighting)
    gate.area_light("Scene_BackServiceFill", (1.8, 3.8, 1.9), 195.0, (0.58, 0.62, 0.62), 2.2, (0.7, 0.4, 0.32), lighting)
    gate.area_light("Scene_GlassProofAccent", (-2.0, -2.8, 2.35), 245.0, (0.72, 0.74, 0.70), 1.05, (0.65, -0.10, 0.425), lighting)
    bpy.data.objects["Scene_GlassProofAccent"].hide_render = True

    scene.camera = bpy.data.objects["Camera_Dormant_Hero"]
    scene["phase"] = "Phase 0.4 selected CRT bounded refinement"
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
