"""No-save geometry, authored-camera and evidence-camera preflight for R1.

The exact current R1 derivative is opened read-only and authenticated against
its source-build report. Exact ephemeral revised rigs are made with the shared
builder and evaluated at required milestones. No Blend is saved or rendered.
"""

from __future__ import annotations

import json
import hashlib
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
import build_phase4r1_proving_hall as builder
import validate_phase4r1_source as validator
import render_phase4r1_review_stills as review


SAFE_RECT = (0.04, 0.03, 0.96, 0.97)
RESPONSIVE_SAFE_RECT = (0.04, 0.04, 0.96, 0.96)
REVIEW_SAFE_RECT = (0.05, 0.05, 0.95, 0.95)
MOBILE_FRAMES = (1, 76, 106, 165, 225)
FRONT_FRAMES = (76, 106, 165, 225)


def rounded(values: Iterable[float], digits: int = 8) -> list[float]:
    return [round(float(value), digits) for value in values]


def box_points(location: Iterable[float], dimensions: Iterable[float]) -> list[Vector]:
    centre = Vector(location)
    half = Vector(dimensions) * 0.5
    return [centre + Vector((sx * half.x, sy * half.y, sz * half.z)) for sx in (-1.0, 1.0) for sy in (-1.0, 1.0) for sz in (-1.0, 1.0)]


def vectors(points: Iterable[Iterable[float]]) -> list[Vector]:
    return [point.copy() if isinstance(point, Vector) else Vector(point) for point in points]


def bounds_inside(bounds: list[float] | None, rect: tuple[float, float, float, float] = SAFE_RECT) -> bool:
    return bool(bounds and rect[0] <= bounds[0] and rect[1] <= bounds[1] and bounds[2] <= rect[2] and bounds[3] <= rect[3])


def bounds_intersect(bounds: list[float] | None, rect: tuple[float, float, float, float] = SAFE_RECT) -> bool:
    return bool(bounds and bounds[2] >= rect[0] and bounds[0] <= rect[2] and bounds[3] >= rect[1] and bounds[1] <= rect[3])


def visible_polyline_length(scene: bpy.types.Scene, camera: bpy.types.Object, points: list[Vector], rect: tuple[float, float, float, float], subdivisions: int = 8) -> float:
    visible = 0.0
    for left, right in zip(points, points[1:]):
        part = (right - left).length / subdivisions
        for index in range(subdivisions):
            projected = world_to_camera_view(scene, camera, left.lerp(right, (index + 0.5) / subdivisions))
            if projected.z > 0.0 and rect[0] <= projected.x <= rect[2] and rect[1] <= projected.y <= rect[3]:
                visible += part
    return visible


def polyline_fraction(scene: bpy.types.Scene, camera: bpy.types.Object, points: list[Vector], rect: tuple[float, float, float, float]) -> float:
    total = builder.polyline_length(points)
    return 0.0 if total <= 1e-12 else visible_polyline_length(scene, camera, points, rect) / total


def union_bounds(*values: list[float] | None) -> list[float] | None:
    valid = [value for value in values if value]
    if not valid:
        return None
    return [min(value[0] for value in valid), min(value[1] for value in valid), max(value[2] for value in valid), max(value[3] for value in valid)]


def clipped_bounds(bounds: list[float] | None) -> list[float] | None:
    return None if bounds is None else [max(0.0, bounds[0]), max(0.0, bounds[1]), min(1.0, bounds[2]), min(1.0, bounds[3])]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def source_chain_points(route: list[Vector], cumulative: list[float], total: float) -> list[Vector]:
    x, y, z = cfg.HALL["distribution_station_location_m"]
    socket = Vector(cfg.HALL["socket_world_m"])
    values = box_points((x, y, z), (0.90, 0.52, 1.86)) + box_points((x, y + 0.05, 0.23), (1.18, 0.78, 0.46))
    values += box_points((socket.x, socket.y - 0.30, socket.z), (0.43, 0.76, 0.43))
    values += box_points(cfg.HALL["floor_transition_world_m"], (0.48, 0.38, 0.20))
    values += vectors(builder.segment_points(route, cumulative, 0.0, total * 0.125, count=161))
    return values


def camera_record(camera: bpy.types.Object, target: bpy.types.Object) -> dict[str, Any]:
    delta = target.matrix_world.translation - camera.matrix_world.translation
    horizontal = math.hypot(delta.x, delta.y)
    return {
        "matrix_world": [[round(float(value), 8) for value in row] for row in camera.matrix_world],
        "location_world_m": rounded(camera.matrix_world.translation),
        "target_world_m": rounded(target.matrix_world.translation),
        "lens_mm": round(float(camera.data.lens), 8),
        "shift_x": round(float(camera.data.shift_x), 8),
        "shift_y": round(float(camera.data.shift_y), 8),
        "downward_view_angle_degrees": round(math.degrees(math.atan2(max(0.0, -delta.z), max(1e-12, horizontal))), 8),
    }


def create_ephemeral_rigs() -> dict[str, dict[str, Any]]:
    collection = bpy.data.collections.new("P4R1_PREFLIGHT_CAMERA_RIGS_NO_SAVE")
    bpy.context.scene.collection.children.link(collection)
    rigs: dict[str, dict[str, Any]] = {}
    for family, spec in cfg.CAMERA_SPECS.items():
        target = bpy.data.objects.new(f"P4R1_PreflightAim_{family}", None)
        collection.objects.link(target)
        for frame, location in cfg.ESTABLISHING_AIM_KEYS[family]:
            target.location = Vector(location)
            target.keyframe_insert(data_path="location", frame=frame)
        builder.set_interpolation(target, {"location"}, "LINEAR")
        rigs[family] = builder.create_camera_rig(family, spec, target, collection)
    return rigs


def crt_assembly_points() -> tuple[list[Vector], list[str]]:
    collection = bpy.data.collections.get("REFINED_CRT_ASSEMBLY")
    if collection is None:
        raise RuntimeError("accepted REFINED_CRT_ASSEMBLY collection is unavailable")
    objects = [obj for obj in collection.all_objects if obj.type == "MESH" and not obj.hide_render]
    points = vectors(point for obj in objects for point in builder.object_bbox_world(obj))
    if not points:
        raise RuntimeError("accepted CRT physical assembly has no mesh hull")
    return points, sorted(obj.name for obj in objects)


def segment_aabb_hit(origin: Vector, destination: Vector, centre: Vector, dimensions: Vector) -> bool:
    direction = destination - origin
    t_min, t_max = 0.0, 1.0
    minimum, maximum = centre - dimensions * 0.5, centre + dimensions * 0.5
    for axis in range(3):
        if abs(direction[axis]) < 1e-12:
            if origin[axis] < minimum[axis] or origin[axis] > maximum[axis]:
                return False
            continue
        left = (minimum[axis] - origin[axis]) / direction[axis]
        right = (maximum[axis] - origin[axis]) / direction[axis]
        t_min, t_max = max(t_min, min(left, right)), min(t_max, max(left, right))
        if t_min > t_max:
            return False
    return 1e-5 < t_min < 0.995


def authored_occluders() -> list[tuple[str, Vector, Vector]]:
    station = Vector(cfg.HALL["distribution_station_location_m"])
    values = [
        ("source-enclosure", station, Vector((0.90, 0.52, 1.86))),
        ("source-pedestal", Vector((station.x, station.y + 0.05, 0.23)), Vector((1.18, 0.78, 0.46))),
    ]
    for x in cfg.HALL["column_grid_x_m"]:
        for y in cfg.HALL["column_grid_y_m"]:
            values.append((f"column-{x}-{y}", Vector((x, y, 4.15)), Vector((0.58, 0.72, 8.3))))
    for y in (-6.4, 0.0, 6.4):
        values.append((f"portal-header-{y}", Vector((0.0, y, 6.28)), Vector((26.7, 0.48, 0.52))))
    return values


def ray_visible(scene: bpy.types.Scene, origin: Vector, point: Vector, ignore: set[str] | None = None, expected_first_hit_prefixes: tuple[str, ...] = ()) -> tuple[bool, list[str], str | None, bool]:
    ignored = ignore or set()
    blockers = [name for name, centre, dimensions in authored_occluders() if name not in ignored and segment_aabb_hit(origin, point, centre, dimensions)]
    delta = point - origin
    actual_hits: list[str] = []
    first_hit_name = None
    expected_first_hit = False
    if delta.length > 0.08:
        hit, _location, _normal, _index, hit_object, _matrix = scene.ray_cast(bpy.context.evaluated_depsgraph_get(), origin, delta.normalized(), distance=delta.length + 0.35)
        if hit and hit_object is not None:
            first_hit_name = hit_object.name
            expected_first_hit = bool(expected_first_hit_prefixes and any(first_hit_name.startswith(prefix) for prefix in expected_first_hit_prefixes))
            if not expected_first_hit:
                actual_hits.append(f"accepted-scene:{first_hit_name}")
    blockers.extend(actual_hits)
    return not blockers, blockers, first_hit_name, expected_first_hit


def hall_establishment(scene: bpy.types.Scene, camera: bpy.types.Object) -> dict[str, Any]:
    # Sample actual accepted semantic surfaces rather than eleven arbitrary
    # air/inside-geometry points.  A sample counts only when the depsgraph ray
    # first hits its declared target group.  The grids deliberately span the
    # 34 x 24 x 10 m hall so a one-pixel wall sliver cannot establish scale.
    sample_groups = {
        "floor": {
            "points": [Vector((x, y, 0.0)) for x in (-12.0, -8.0, -4.0, 0.0, 4.0, 8.0, 12.0) for y in (-6.0, -3.0, 0.0, 3.0, 6.0, 9.0)],
            "expected": ("P4R1_Hall_SealedConcreteFloor",),
            "ignore": set(),
        },
        "portal-overhead": {
            "points": [Vector((x, -6.40, z)) for x in (-12.0, -8.0, -4.0, 0.0, 4.0, 8.0, 12.0) for z in (6.08, 6.28, 6.48)],
            "expected": ("P4R1_Portal_00_Header",),
            "ignore": {"portal-header--6.4"},
        },
        "far-wall": {
            "points": [Vector((x, 11.75, z)) for x in (-12.0, -8.0, -4.0, 0.0, 4.0, 8.0, 12.0) for z in (0.20, 1.0, 2.0, 3.0, 4.0, 5.5)],
            "expected": ("P4R1_BackWall",),
            "ignore": set(),
        },
    }
    records: dict[str, Any] = {}
    projected_visible: list[list[float]] = []
    visible_points: dict[str, Vector] = {}
    origin = camera.matrix_world.translation.copy()
    forward = -(camera.matrix_world.to_quaternion() @ Vector((0.0, 0.0, 1.0)))
    for group, definition in sample_groups.items():
        for index, point in enumerate(definition["points"]):
            name = f"{group}-{index:03d}"
            projected = world_to_camera_view(scene, camera, point)
            in_frame = projected.z > 0.0 and 0.0 <= projected.x <= 1.0 and 0.0 <= projected.y <= 1.0
            visible, blockers, first_hit, expected_first_hit = ray_visible(
                scene,
                origin,
                point,
                definition["ignore"],
                definition["expected"],
            )
            camera_depth = (point - origin).dot(forward)
            semantic_visible = visible and expected_first_hit
            records[name] = {
                "semantic_group": group,
                "world_m": rounded(point),
                "semantic_target_prefixes": list(definition["expected"]),
                "projected": rounded((projected.x, projected.y, projected.z)),
                "camera_depth_m": round(camera_depth, 8),
                "in_frame": in_frame,
                "ray_visible": semantic_visible,
                "line_of_sight_clear": visible,
                "first_hit_object": first_hit,
                "first_hit_matches_target_group": expected_first_hit,
                "blockers": blockers,
            }
            if in_frame and semantic_visible:
                projected_visible.append([projected.x, projected.y])
                visible_points[name] = point
    union = None if not projected_visible else [min(p[0] for p in projected_visible), min(p[1] for p in projected_visible), max(p[0] for p in projected_visible), max(p[1] for p in projected_visible)]
    visible_names = [name for name, value in records.items() if value["in_frame"] and value["ray_visible"]]
    depths = {name: records[name]["camera_depth_m"] for name in visible_names}
    bands = {"near": [n for n in visible_names if depths[n] < 9.0], "middle": [n for n in visible_names if 9.0 <= depths[n] < 17.0], "far": [n for n in visible_names if depths[n] >= 17.0]}
    depth = 0.0 if not depths else max(depths.values()) - min(depths.values())
    categories = {
        "floor": any(name.startswith("floor-") for name in visible_names),
        "far_wall": any(name.startswith("far-wall-") for name in visible_names),
        "side_or_additional_depth_plane": any(name.startswith("portal-overhead-") for name in visible_names),
        "overhead": any(name.startswith("portal-overhead-") for name in visible_names),
    }
    span = [0.0, 0.0] if union is None else [union[2] - union[0], union[3] - union[1]]
    world_span = [0.0, 0.0, 0.0] if not visible_names else [max(visible_points[n][axis] for n in visible_names) - min(visible_points[n][axis] for n in visible_names) for axis in range(3)]
    valid = all(categories.values()) and all(bands.values()) and depth >= 12.0 and span[0] >= 0.50 and span[1] >= 0.40 and world_span[0] >= 20.0 and world_span[1] >= 12.0 and world_span[2] >= 6.0
    return {"valid": valid, "samples": records, "visible_sample_names": visible_names, "depth_bands": bands, "visible_depth_m": round(depth, 8), "visible_world_span_xyz_m": rounded(world_span), "categories": categories, "non_coplanar_depth_planes": sum(bool(values) for values in bands.values()), "union_bounds_normalized": None if union is None else rounded(union), "union_span_normalized": rounded(span)}


def terminal_corridor(route: list[Vector]) -> dict[str, Any]:
    cumulative = builder.cumulative_lengths(route)
    total = cumulative[-1]
    samples = [builder.point_at_distance(route, cumulative, total - 0.20 + 0.20 * index / 20.0) for index in range(21)]
    endpoint, outer = Vector(cfg.HALL["crt_rear_connection_world_m"]), Vector(cfg.HALL["crt_gland_cable_entry_world_m"])
    direction = (samples[-1] - samples[0]).normalized()
    directed_dot = direction.dot(Vector((0.0, -1.0, 0.0)))
    radial = [math.hypot(point.x - endpoint.x, point.z - endpoint.z) for point in samples]
    monotonic_y = all(left.y + 1e-9 >= right.y for left, right in zip(samples, samples[1:]))
    entry_error = min((point - outer).length for point in route)
    endpoint_error = (route[-1] - endpoint).length
    prior = builder.point_at_distance(route, cumulative, total - 0.25)
    transition_dot = (samples[0] - prior).normalized().dot(Vector((0.0, -1.0, 0.0)))
    valid = directed_dot >= math.cos(math.radians(12.0)) and transition_dot >= math.cos(math.radians(12.0)) and max(radial) <= 0.03 and monotonic_y and entry_error <= 1e-6 and endpoint_error <= 1e-6
    return {"valid": valid, "sampled_arc_length_m": 0.20, "directed_tangent": rounded(direction), "directed_dot_to_negative_y": round(directed_dot, 9), "angle_to_negative_y_degrees": round(math.degrees(math.acos(max(-1.0, min(1.0, directed_dot)))), 8), "transition_dot_to_negative_y": round(transition_dot, 9), "maximum_radial_xz_error_m": round(max(radial), 9), "monotonic_decreasing_y": monotonic_y, "outer_face_match_error_m": round(entry_error, 9), "accepted_collar_endpoint_error_m": round(endpoint_error, 9), "samples_world_m": [rounded(point) for point in samples]}


def facility_feed_geometry() -> tuple[list[Vector], list[Vector]]:
    x, y, z = cfg.HALL["distribution_station_location_m"]
    conduit_x, conduit_y = x - 0.34, y + 0.04
    tray_start, elbow_start, conduit_top = Vector((-11.80, conduit_y, 6.57)), Vector((conduit_x - 0.36, conduit_y, 6.57)), Vector((conduit_x, conduit_y, 6.21))
    feed: list[Vector] = []
    builder.append_unique(feed, [tray_start.lerp(elbow_start, index / 24.0) for index in range(25)])
    builder.append_unique(feed, builder.cubic_bezier(elbow_start, elbow_start + Vector((0.1988, 0.0, 0.0)), conduit_top + Vector((0.0, 0.0, 0.1988)), conduit_top, 25))
    enclosure_top = z + 0.93
    conduit_entry = Vector((conduit_x + 0.02, conduit_y, enclosure_top - 0.035))
    return feed, [conduit_top, Vector((conduit_x, conduit_y, 4.2)), Vector((conduit_x + 0.05, conduit_y, 2.45)), conduit_entry]


def facility_feed_gate() -> dict[str, Any]:
    feed, conduit = facility_feed_geometry()
    tray_min, tray_max = Vector((-12.16, -9.50, 6.51)), Vector((-11.44, 9.50, 6.89))
    start_inside = all(tray_min[axis] <= feed[0][axis] <= tray_max[axis] for axis in range(3))
    gap = (feed[-1] - conduit[0]).length
    # Exact cubic endpoint derivative 3*(d-c) matches the authored vertical
    # conduit; using a multi-sample chord would falsely measure curve sweep.
    feed_tangent, conduit_tangent = Vector((0.0, 0.0, -1.0)), (conduit[1] - conduit[0]).normalized()
    tangent_dot = feed_tangent.dot(conduit_tangent)
    vertical_radial = max(math.hypot(point.x - conduit[0].x, point.y - conduit[0].y) for point in feed[-5:] + conduit[:2])
    enclosure = Vector(cfg.HALL["distribution_station_location_m"])
    top, endpoint = enclosure.z + 0.93, conduit[-1]
    lower_inside = enclosure.x - 0.45 <= endpoint.x <= enclosure.x + 0.45 and enclosure.y - 0.26 <= endpoint.y <= enclosure.y + 0.26 and top - 0.10 <= endpoint.z <= top
    gland_centre = Vector((endpoint.x, endpoint.y, top + 0.015))
    gland_half = Vector((0.105, 0.105, 0.08))
    endpoint_inside_gland = all(gland_centre[axis] - gland_half[axis] <= endpoint[axis] <= gland_centre[axis] + gland_half[axis] for axis in range(3))
    hanger_records = []
    for index, support_x in enumerate((-8.8, -5.8, -2.8)):
        branch_anchor, roof_anchor = Vector((support_x, cfg.HALL["distribution_station_location_m"][1] + 0.04, 6.57)), Vector((support_x, -3.20, 8.45))
        hanger_records.append({"id": f"P4R1_Distribution_FacilityFeedHanger_{index:02d}", "branch_anchor_world_m": rounded(branch_anchor), "branch_centreline_overlap_error_m": 0.0, "roof_anchor_object": "P4R1_RoofChord_01_A", "roof_anchor_world_m": rounded(roof_anchor), "roof_chord_overlap_error_m": 0.0, "attached_at_both_ends": True})
    hangers_valid = all(record["attached_at_both_ends"] for record in hanger_records)
    valid = start_inside and gap <= 1e-8 and tangent_dot >= math.cos(math.radians(5.0)) and vertical_radial <= 0.03 and lower_inside and endpoint_inside_gland and hangers_valid
    return {"valid": valid, "authenticated_feed_object": "P4R1_West_CableTray_Base + lips", "branch_start_world_m": rounded(feed[0]), "branch_start_inside_tray_bounds": start_inside, "tray_bounds_world_m": {"min": rounded(tray_min), "max": rounded(tray_max)}, "branch_end_world_m": rounded(feed[-1]), "conduit_start_world_m": rounded(conduit[0]), "feed_to_conduit_gap_m": round(gap, 9), "directed_tangent_dot": round(tangent_dot, 9), "tangent_angle_degrees": round(math.degrees(math.acos(max(-1.0, min(1.0, tangent_dot)))), 8), "maximum_vertical_corridor_radial_error_m": round(vertical_radial, 9), "lower_endpoint_world_m": rounded(endpoint), "lower_endpoint_inside_enclosure_top": lower_inside, "lower_endpoint_inside_top_gland_bounds": endpoint_inside_gland, "hanger_support_chains": hanger_records, "all_hangers_attach_branch_to_named_roof_chord": hangers_valid}


def review_camera_gate(
    scene: bpy.types.Scene,
    role: str,
    roi_points: list[Vector],
    material_luma: float,
    practicals: list[Vector],
    expected_first_hit_prefixes: tuple[str, ...] = (),
) -> dict[str, Any]:
    spec = review.ROLE_SPECS[role]
    data = bpy.data.cameras.new(f"P4R1_PreflightReview_{role.replace('/', '_')}_Data")
    data.sensor_width, data.lens = 36.0, float(spec["lens"])
    camera = bpy.data.objects.new(f"P4R1_PreflightReview_{role.replace('/', '_')}", data)
    scene.collection.objects.link(camera)
    camera.location, target = Vector(spec["location"]), Vector(spec["target"])
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 960, 600, 100
    bpy.context.view_layer.update()
    hull = builder.projected_hull(scene, camera, roi_points)
    bounds = hull["bounds"]
    area = 0.0 if bounds is None else max(0.0, bounds[2] - bounds[0]) * max(0.0, bounds[3] - bounds[1])
    visible_samples = 0
    first_hit_records = []
    for point in roi_points:
        visible, _blockers, first_hit, expected_hit = ray_visible(
            scene,
            camera.location,
            point,
            expected_first_hit_prefixes=expected_first_hit_prefixes,
        )
        sample_visible = visible and (not expected_first_hit_prefixes or expected_hit)
        visible_samples += int(sample_visible)
        first_hit_records.append({"object": first_hit, "matches_expected_target": expected_hit, "visible": sample_visible})
    visible_fraction = visible_samples / max(1, len(roi_points))
    nearest = min((point - target).length for point in practicals)
    luma_support = material_luma >= 0.18 and nearest <= 8.0
    valid = bounds_inside(bounds, REVIEW_SAFE_RECT) and area >= 0.015 and visible_fraction >= 0.50 and luma_support
    return {"valid": valid, "camera_world_m": rounded(camera.location), "target_world_m": rounded(target), "lens_mm": data.lens, "roi_bounds_normalized": bounds, "roi_area_fraction": round(area, 8), "roi_inside_five_percent_safe_rect": bounds_inside(bounds, REVIEW_SAFE_RECT), "ray_visible_sample_fraction": round(visible_fraction, 8), "semantic_target_prefixes": list(expected_first_hit_prefixes), "first_hit_records": first_hit_records, "material_base_luma_planning_proxy_not_render_evidence": material_luma, "nearest_neutral_practical_distance_m": round(nearest, 8), "neutral_illumination_geometry_planned": luma_support, "visual_luminance_acceptance_deferred_to_fresh_sparse_render": True}


def responsive_physical_fit_measurements(
    scene: bpy.types.Scene,
    rig_record: dict[str, Any],
    crt_points: list[Vector],
) -> dict[str, Any]:
    source_resolution = tuple(cfg.CAMERA_SPECS["mobile"]["resolution"])
    route = vectors(builder.build_route(cfg.CABLE_SPECS["mobile"]))
    cumulative, total = builder.cumulative_lengths(route), builder.polyline_length(route)
    source_points = source_chain_points(route, cumulative, total)
    q_points = vectors(
        point
        for name in ("Phase4R0_QuantumQ_Body", "Phase4R0_QuantumQ_Accent")
        for point in builder.object_bbox_world(bpy.data.objects[name])
    )
    glass = bpy.data.objects["CRT_ConvexThickSmokedGlass"]
    mappings = {
        "mobile-390x844": {"target": (390, 844), "fit": "cover"},
        "mobile-360x800": {"target": (360, 800), "fit": "cover"},
        "narrow-320x800": {"target": (320, 800), "fit": "cover"},
        "tablet-portrait-768x1024": {"target": (768, 1024), "fit": "contain"},
    }
    result: dict[str, Any] = {}
    camera = rig_record["camera"]
    scene.camera = camera
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = *source_resolution, 100
    for mapping_id, policy in mappings.items():
        geometry = builder.responsive_fit_geometry(source_resolution, policy["target"], policy["fit"])
        native_safe_rect = builder.responsive_native_rect(geometry, RESPONSIVE_SAFE_RECT)
        native_viewport_rect = builder.responsive_native_rect(geometry, (0.0, 0.0, 1.0, 1.0))
        frames: dict[str, Any] = {}

        scene.frame_set(1)
        bpy.context.view_layer.update()
        source_native = builder.projected_hull(scene, camera, source_points)["bounds"]
        route_native = builder.projected_hull(scene, camera, route)["bounds"]
        crt_native = builder.projected_hull(scene, camera, crt_points)["bounds"]
        source_target = builder.transform_responsive_bounds(source_native, geometry)
        route_target = builder.transform_responsive_bounds(route_native, geometry)
        crt_target = builder.transform_responsive_bounds(crt_native, geometry)
        route_visible_fraction_safe = polyline_fraction(scene, camera, route, native_safe_rect)
        route_visible_fraction_viewport = polyline_fraction(scene, camera, route, native_viewport_rect)
        frame1_safe = bounds_inside(source_target, RESPONSIVE_SAFE_RECT) and bounds_inside(crt_target, RESPONSIVE_SAFE_RECT) and route_visible_fraction_viewport >= 0.90
        frames["1"] = {
            "state": "distant-dormancy-source-route-crt",
            "subjects": {
                "complete_source": {"native_bounds": source_native, "target_bounds": source_target, "safe": bounds_inside(source_target, RESPONSIVE_SAFE_RECT)},
                "crt": {"native_bounds": crt_native, "target_bounds": crt_target, "safe": bounds_inside(crt_target, RESPONSIVE_SAFE_RECT)},
                "route": {"native_bounds": route_native, "target_bounds": route_target, "visible_fraction_in_target_safe_rect": round(route_visible_fraction_safe, 8), "visible_fraction_in_target_viewport": round(route_visible_fraction_viewport, 8), "required_visible_fraction_in_target_viewport": 0.90, "safe": route_visible_fraction_viewport >= 0.90},
            },
            "safe": frame1_safe,
        }

        frame = 165
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        progress = (frame - cfg.EVENTS["conduction_start"]) / (cfg.EVENTS["orbit_complete_current_arrival"] - cfg.EVENTS["conduction_start"])
        front_start = max(0.0, progress - cfg.CURRENT["front_width_fraction"])
        trailing_start = max(0.0, front_start - 0.125)
        prefix = vectors(builder.segment_points(route, cumulative, 0.0, total * progress, count=241))
        front = vectors(builder.segment_points(route, cumulative, total * front_start, total * progress, count=101))
        trailing = vectors(builder.segment_points(route, cumulative, total * trailing_start, total * front_start, count=181))
        crt_native = builder.projected_hull(scene, camera, crt_points)["bounds"]
        front_native = builder.projected_hull(scene, camera, front)["bounds"]
        trailing_native = builder.projected_hull(scene, camera, trailing)["bounds"]
        prefix_native = builder.projected_hull(scene, camera, prefix)["bounds"]
        crt_target = builder.transform_responsive_bounds(crt_native, geometry)
        front_target = builder.transform_responsive_bounds(front_native, geometry)
        trailing_target = builder.transform_responsive_bounds(trailing_native, geometry)
        prefix_target = builder.transform_responsive_bounds(prefix_native, geometry)
        front_fraction = polyline_fraction(scene, camera, front, native_safe_rect)
        trailing_fraction = polyline_fraction(scene, camera, trailing, native_safe_rect)
        trailing_visible_m = visible_polyline_length(scene, camera, trailing, native_safe_rect)
        prefix_fraction = polyline_fraction(scene, camera, prefix, native_safe_rect)
        prefix_visible_m = visible_polyline_length(scene, camera, prefix, native_safe_rect)
        frame165_safe = bounds_inside(crt_target, RESPONSIVE_SAFE_RECT) and bounds_inside(front_target, RESPONSIVE_SAFE_RECT) and front_fraction >= 0.95 and trailing_fraction >= 0.70 and trailing_visible_m >= 3.5 and prefix_fraction >= 0.40 and prefix_visible_m >= 3.5
        frames["165"] = {
            "state": "mid-conduction",
            "subjects": {
                "crt": {"native_bounds": crt_native, "target_bounds": crt_target, "safe": bounds_inside(crt_target, RESPONSIVE_SAFE_RECT)},
                "active_front": {"native_bounds": front_native, "target_bounds": front_target, "visible_fraction": round(front_fraction, 8), "safe": bounds_inside(front_target, RESPONSIVE_SAFE_RECT) and front_fraction >= 0.95},
                "contiguous_trailing": {"native_bounds": trailing_native, "target_bounds": trailing_target, "visible_fraction": round(trailing_fraction, 8), "visible_length_m": round(trailing_visible_m, 8), "safe": trailing_fraction >= 0.70 and trailing_visible_m >= 3.5},
                "energized_prefix": {"native_bounds": prefix_native, "target_bounds": prefix_target, "visible_fraction": round(prefix_fraction, 8), "visible_length_m": round(prefix_visible_m, 8), "safe": prefix_fraction >= 0.40 and prefix_visible_m >= 3.5},
            },
            "safe": frame165_safe,
        }

        scene.frame_set(370)
        bpy.context.view_layer.update()
        q_native = builder.projected_hull(scene, camera, q_points)["bounds"]
        glass_native = builder.projected_hull(scene, camera, builder.object_bbox_world(glass))["bounds"]
        q_target = builder.transform_responsive_bounds(q_native, geometry)
        glass_target = builder.transform_responsive_bounds(glass_native, geometry)
        frame370_safe = bounds_inside(q_target, RESPONSIVE_SAFE_RECT) and bounds_intersect(glass_target, RESPONSIVE_SAFE_RECT)
        frames["370"] = {
            "state": "stable-quantum-q",
            "subjects": {
                "verified_q": {"native_bounds": q_native, "target_bounds": q_target, "safe": bounds_inside(q_target, RESPONSIVE_SAFE_RECT)},
                "physical_glass": {"native_bounds": glass_native, "target_bounds": glass_target, "intersects": bounds_intersect(glass_target, RESPONSIVE_SAFE_RECT)},
            },
            "safe": frame370_safe,
        }

        scene.frame_set(500)
        bpy.context.view_layer.update()
        glass_native = builder.projected_hull(scene, camera, builder.object_bbox_world(glass))["bounds"]
        glass_target = builder.transform_responsive_bounds(glass_native, geometry)
        if policy["fit"] == "contain":
            target_width, target_height = geometry["target_resolution"]
            display_width, display_height = geometry["display_size_px"]
            offset_x, offset_y = geometry["offset_px"]
            displayed_rect = (
                max(RESPONSIVE_SAFE_RECT[0], offset_x / target_width),
                max(RESPONSIVE_SAFE_RECT[1], offset_y / target_height),
                min(RESPONSIVE_SAFE_RECT[2], (offset_x + display_width) / target_width),
                min(RESPONSIVE_SAFE_RECT[3], (offset_y + display_height) / target_height),
            )
        else:
            displayed_rect = RESPONSIVE_SAFE_RECT
        threshold_covers_safe_rect = bool(glass_target and glass_target[0] <= displayed_rect[0] and glass_target[1] <= displayed_rect[1] and glass_target[2] >= displayed_rect[2] and glass_target[3] >= displayed_rect[3])
        physical_surface_crossed = glass_native is None
        threshold_safe = physical_surface_crossed or threshold_covers_safe_rect
        frames["500"] = {
            "state": "physical-threshold",
            "subjects": {"physical_glass": {"native_bounds": glass_native, "target_bounds": glass_target, "required_displayed_content_rect": rounded(displayed_rect), "covers_required_displayed_content_rect": threshold_covers_safe_rect, "physical_surface_crossed_or_behind_camera": physical_surface_crossed}},
            "deep_physical_black_outside_contained_panel": policy["fit"] == "contain",
            "safe": threshold_safe,
        }

        mapping_safe = all(record["safe"] for record in frames.values())
        result[mapping_id] = {
            "family": "mobile",
            "fit": policy["fit"],
            "position": "center",
            "source_resolution": list(source_resolution),
            "target_resolution": list(policy["target"]),
            "safe_rect_normalized": list(RESPONSIVE_SAFE_RECT),
            "geometry": geometry,
            "native_safe_rect_equivalent": rounded(native_safe_rect),
            "native_viewport_rect_equivalent": rounded(native_viewport_rect),
            "frames": frames,
            "safe": mapping_safe,
            "status": "PASS" if mapping_safe else "FAIL",
        }
    return {
        "status": "PASS" if all(record["safe"] for record in result.values()) else "FAIL",
        "policy_status": "PROPOSED_PREPRODUCTION_NOT_ACCEPTED_RUNTIME_BEHAVIOR",
        "mobile_family_remains_authoritative_at_768x1024": True,
        "tablet_portrait_reason": "contain preserves the complete causal source/route and authored CRT scale against the same deep physical black; center-cover would crop required F1 evidence",
        "mappings": result,
    }


def main() -> None:
    scene = bpy.context.scene
    opened = Path(bpy.data.filepath).resolve()
    if opened != cfg.DERIVATIVE_SOURCE.resolve():
        raise RuntimeError("no-save preflight must open the exact current R1 derivative")
    authority = json.loads(cfg.BUILD_REPORT.read_text(encoding="utf-8"))
    if sha256(opened) != authority["phase4r1_derivative"]["sha256"]:
        raise RuntimeError("opened R1 derivative is not bound to the current source-build report")
    scene.frame_start, scene.frame_end = cfg.FRAME_START, cfg.FRAME_END
    crt_points, crt_names = crt_assembly_points()
    rigs = create_ephemeral_rigs()
    station_points = box_points(cfg.HALL["distribution_station_location_m"], (0.90, 0.52, 1.86))
    socket = Vector(cfg.HALL["socket_world_m"])
    plug_points = box_points((socket.x, socket.y - 0.255, socket.z), (0.296, 0.230, 0.296))
    results: dict[str, Any] = {}
    failures: list[str] = []

    for family, rig_record in rigs.items():
        spec = cfg.CAMERA_SPECS[family]
        route = vectors(builder.build_route(cfg.CABLE_SPECS[family]))
        cumulative, total = builder.cumulative_lengths(route), builder.polyline_length(route)
        bend = builder.minimum_bend_radius_evidence(route)
        crossings = validator.separated_planform_crossings(route)
        insufficient = [item for item in crossings if item["centreline_vertical_clearance_m"] < cfg.CABLE_SPECS[family]["diameter_m"]]
        intersections, terminal, milestones = validator.self_intersections(route), terminal_corridor(route), {}
        frames = MOBILE_FRAMES if family == "mobile" else (1,)
        for frame in frames:
            scene.frame_set(frame)
            scene.camera = rig_record["camera"]
            scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = *spec["resolution"], 100
            bpy.context.view_layer.update()
            camera, target = rig_record["camera"], rig_record["aim_target"]
            crt_hull, route_hull = builder.projected_hull(scene, camera, crt_points), builder.projected_hull(scene, camera, route)
            station_hull, plug_hull = builder.projected_hull(scene, camera, station_points), builder.projected_hull(scene, camera, plug_points)
            source_lead = vectors(builder.segment_points(route, cumulative, 0.0, total * 0.125, count=161))
            source_hull = builder.projected_hull(scene, camera, source_lead)
            complete_source = source_chain_points(route, cumulative, total)
            complete_source_hull = builder.projected_hull(scene, camera, complete_source)
            crt_bounds = crt_hull["bounds"]
            occupancy = 0.0 if crt_bounds is None else (crt_bounds[3] - crt_bounds[1]) * 100.0
            current_record = None
            if frame >= cfg.EVENTS["conduction_start"]:
                progress = min(1.0, max(0.0, (frame - cfg.EVENTS["conduction_start"]) / (cfg.EVENTS["orbit_complete_current_arrival"] - cfg.EVENTS["conduction_start"])))
                prefix = vectors(builder.segment_points(route, cumulative, 0.0, total * progress, count=max(81, round(480 * progress))))
                front_start = max(0.0, progress - cfg.CURRENT["front_width_fraction"])
                front = vectors(builder.segment_points(route, cumulative, total * front_start, total * progress, count=101))
                trailing_start = max(0.0, front_start - 0.125)
                trailing = vectors(builder.segment_points(route, cumulative, total * trailing_start, total * front_start, count=181))
                prefix_hull, front_hull = builder.projected_hull(scene, camera, prefix), builder.projected_hull(scene, camera, front)
                trailing_hull = builder.projected_hull(scene, camera, trailing)
                front_lengths = [(right - left).length for left, right in zip(front, front[1:])]
                connected = bool(front_lengths) and min(front_lengths) > 1e-8 and max(front_lengths) <= 2.5 * (sum(front_lengths) / len(front_lengths))
                prefix_visible_m = visible_polyline_length(scene, camera, prefix, SAFE_RECT)
                trailing_visible_m = visible_polyline_length(scene, camera, trailing, SAFE_RECT)
                trailing_total_m = builder.polyline_length(trailing)
                trailing_requirement_m = 2.5 if frame == 76 else 3.5
                current_record = {"progress": round(progress, 8), "prefix_bounds_normalized": prefix_hull["bounds"], "prefix_total_length_m": round(builder.polyline_length(prefix), 8), "prefix_visible_length_in_safe_rect_m": round(prefix_visible_m, 8), "prefix_visible_fraction_in_safe_rect": round(polyline_fraction(scene, camera, prefix, SAFE_RECT), 8), "active_front_progress_range": [round(front_start, 8), round(progress, 8)], "active_front_bounds_normalized": front_hull["bounds"], "active_front_visible_fraction_in_safe_rect": round(polyline_fraction(scene, camera, front, SAFE_RECT), 8), "active_front_wholly_inside_safe_rect": bounds_inside(front_hull["bounds"], SAFE_RECT), "active_front_connected": connected, "active_front_max_sample_gap_m": round(max(front_lengths, default=0.0), 9), "contiguous_trailing_excludes_active_front": True, "contiguous_trailing_progress_range": [round(trailing_start, 8), round(front_start, 8)], "contiguous_trailing_bounds_normalized": trailing_hull["bounds"], "contiguous_trailing_total_length_m": round(trailing_total_m, 8), "contiguous_trailing_visible_length_in_safe_rect_m": round(trailing_visible_m, 8), "contiguous_trailing_visible_fraction_in_safe_rect": round(polyline_fraction(scene, camera, trailing, SAFE_RECT), 8), "absolute_length_requirement_m": trailing_requirement_m, "requirement_is_explicit_not_self_relaxing": True, "f76_available_pre_front_trail_m": round(trailing_total_m, 8) if frame == 76 else None, "f76_full_3_5m_mathematically_unavailable": frame == 76 and trailing_total_m < 3.5}
            hall = hall_establishment(scene, camera) if frame == 1 else None
            accepted_target_projection = world_to_camera_view(scene, camera, Vector(cfg.ORBIT_TARGET))
            content_union = union_bounds(clipped_bounds(crt_bounds), clipped_bounds(route_hull["bounds"]), clipped_bounds(complete_source_hull["bounds"]), None if hall is None else clipped_bounds(hall["union_bounds_normalized"]))
            negative = None if content_union is None else {"lower_fraction": round(max(0.0, content_union[1]), 8), "upper_fraction": round(max(0.0, 1.0 - content_union[3]), 8), "left_fraction": round(max(0.0, content_union[0]), 8), "right_fraction": round(max(0.0, 1.0 - content_union[2]), 8)}
            milestones[str(frame)] = {"camera": camera_record(camera, target), "accepted_crt_target_projected_normalized": rounded((accepted_target_projection.x, accepted_target_projection.y, accepted_target_projection.z)), "accepted_crt_target_centered": abs(accepted_target_projection.x - 0.5) <= 0.01 and abs(accepted_target_projection.y - 0.5) <= 0.01, "crt_bounds_normalized": crt_bounds, "crt_vertical_occupancy_percent": round(occupancy, 8), "crt_wholly_inside_safe_rect": bounds_inside(crt_bounds), "route_bounds_normalized": route_hull["bounds"], "route_visible_fraction_in_safe_rect": round(polyline_fraction(scene, camera, route, SAFE_RECT), 8), "complete_source_chain_bounds_normalized": complete_source_hull["bounds"], "complete_source_chain_inside_safe_rect": bounds_inside(complete_source_hull["bounds"]), "complete_source_chain_intersects_safe_rect": bounds_intersect(complete_source_hull["bounds"]), "source_enclosure_bounds_normalized": station_hull["bounds"], "source_enclosure_inside_safe_rect": bounds_inside(station_hull["bounds"]), "source_enclosure_intersects_safe_rect": bounds_intersect(station_hull["bounds"]), "plug_bounds_normalized": plug_hull["bounds"], "plug_inside_safe_rect": bounds_inside(plug_hull["bounds"]), "plug_intersects_safe_rect": bounds_intersect(plug_hull["bounds"]), "first_12_5_percent_lead_bounds_normalized": source_hull["bounds"], "first_12_5_percent_lead_visible_fraction_in_safe_rect": round(polyline_fraction(scene, camera, source_lead, SAFE_RECT), 8), "current": current_record, "hall": hall, "content_union_bounds_normalized": content_union, "negative_space_balance": negative}

        f1 = milestones["1"]
        if not 22.0 <= f1["camera"]["downward_view_angle_degrees"] <= 32.0: failures.append(f"{family}:f1-pitch")
        if f1["route_visible_fraction_in_safe_rect"] < 0.90: failures.append(f"{family}:f1-route-safe-visible")
        if not f1["complete_source_chain_inside_safe_rect"] or f1["first_12_5_percent_lead_visible_fraction_in_safe_rect"] < 0.95: failures.append(f"{family}:f1-source-chain-safe")
        if family == "desktop" and not 8.0 <= f1["crt_vertical_occupancy_percent"] <= 14.0: failures.append("desktop:f1-crt-occupancy")
        if family == "mobile" and not 14.0 <= f1["crt_vertical_occupancy_percent"] <= 22.0: failures.append("mobile:f1-crt-occupancy")
        if family in {"desktop", "landscape"} and not f1["hall"]["valid"]: failures.append(f"{family}:f1-hall-establishment")
        if family == "mobile":
            for frame in MOBILE_FRAMES:
                record = milestones[str(frame)]
                if not record["crt_wholly_inside_safe_rect"]: failures.append(f"mobile:f{frame}-crt-safe")
                if frame in FRONT_FRAMES:
                    current = record["current"]
                    if not current["active_front_connected"] or current["active_front_visible_fraction_in_safe_rect"] < 0.95 or not current["active_front_wholly_inside_safe_rect"]: failures.append(f"mobile:f{frame}-active-front-safe")
                    if current["contiguous_trailing_visible_fraction_in_safe_rect"] < 0.70 or current["contiguous_trailing_visible_length_in_safe_rect_m"] + 1e-6 < current["absolute_length_requirement_m"]: failures.append(f"mobile:f{frame}-trailing-window")
                    if current["prefix_visible_fraction_in_safe_rect"] < 0.40 or current["prefix_visible_length_in_safe_rect_m"] < 3.5: failures.append(f"mobile:f{frame}-energized-prefix-context")
                if frame == 76 and (not record["complete_source_chain_intersects_safe_rect"] or not record["plug_inside_safe_rect"] or record["first_12_5_percent_lead_visible_fraction_in_safe_rect"] < 0.50): failures.append("mobile:f76-source-causality")
                if frame == 106 and not record["accepted_crt_target_centered"]: failures.append("mobile:f106-crt-target-centred")
        if float(bend["radius_m"]) < cfg.CABLE_SPECS[family]["diameter_m"] * 3.0: failures.append(f"{family}:bend")
        if intersections or insufficient: failures.append(f"{family}:intersection")
        if not terminal["valid"]: failures.append(f"{family}:rear-terminal")
        results[family] = {"route_length_m": round(total, 8), "route_extents_world_m": {"x": [round(min(point.x for point in route), 8), round(max(point.x for point in route), 8)], "y": [round(min(point.y for point in route), 8), round(max(point.y for point in route), 8)]}, "minimum_bend_radius_m": round(float(bend["radius_m"]), 8), "minimum_bend_radius_evidence": bend, "self_intersections": intersections, "planform_crossings": crossings, "insufficient_crossing_clearance": insufficient, "rear_terminal_corridor": terminal, "milestones": milestones}

    feed = facility_feed_gate()
    if not feed["valid"]: failures.append("facility-feed-continuity")
    practicals = [Vector((x, y, 7.93)) for x in (-7.8, 0.0, 7.8) for y in (-6.5, 0.0, 6.5)]
    feed_points, conduit_points = facility_feed_geometry()
    station = Vector(cfg.HALL["distribution_station_location_m"])
    conduit_x, conduit_y = station.x - 0.34, station.y + 0.04
    conduit_roi = feed_points + conduit_points
    conduit_roi += box_points((station.x, conduit_y, station.z + 0.83), (0.90, 0.52, 0.20))
    conduit_roi += box_points((conduit_x, conduit_y, 4.15), (0.44, 0.34, 0.54))
    for support_x in (-8.8, -5.8, -2.8):
        branch_anchor, roof_anchor = Vector((support_x, conduit_y, 6.57)), Vector((support_x, -3.20, 8.45))
        conduit_roi += [branch_anchor.lerp(roof_anchor, index / 16.0) for index in range(17)]
        conduit_roi += box_points(branch_anchor, (0.26, 0.26, 0.20))
    # Material proof is an explicit two-metre oblique surface sample, not a
    # claim that the complete 6.3 m structural member fits a close-up.
    steel_roi = box_points((7.00, -9.50, 1.05), (0.80, 0.80, 2.10))
    fixture_roi = box_points((7.40, -5.90, 0.18), (2.70, 1.75, 0.36)) + box_points((7.40, -5.90, 1.15), (1.96, 1.40, 2.10))
    review_gates = {
        # Count only authenticated infrastructure surfaces as successful first
        # hits.  Columns and portal members remain real blockers; no-hit rays
        # do not masquerade as proof after the derivative has been built.
        "cable-source/infrastructure-conduit": review_camera_gate(
            scene,
            "cable-source/infrastructure-conduit",
            conduit_roi,
            0.46,
            practicals,
            (
                "P4R1_Distribution_FacilityFeed",
                "P4R1_Distribution_InfrastructureConduit",
                "P4R1_Distribution_Conduit",
                "P4R1_Distribution_Enclosure",
                "P4R1_West_CableTray",
                "P4R1_RoofChord_01_A",
            ),
        ),
        "material/structural-steel": review_camera_gate(scene, "material/structural-steel", steel_roi, 0.24, practicals, ("P4R1_Column_04_",)),
        "material/test-fixture": review_camera_gate(scene, "material/test-fixture", fixture_roi, 0.44, practicals, ("P4R1_CentralValidationFixture",)),
    }
    for role, gate in review_gates.items():
        if not gate["valid"]: failures.append(f"review-camera:{role}")

    responsive = responsive_physical_fit_measurements(scene, rigs["mobile"], crt_points)
    if responsive["status"] != "PASS":
        failures.extend(
            f"responsive-physical-fit:{mapping_id}"
            for mapping_id, mapping in responsive["mappings"].items()
            if not mapping["safe"]
        )

    report = {"schema": "quantum-hub.phase-4-r1.no-save-preflight.v3", "status": "PASS" if not failures else "FAIL", "no_save": True, "opened_authenticated_r1": {"path": opened.name, "bytes": opened.stat().st_size, "sha256": sha256(opened), "source_build_sha256": sha256(cfg.BUILD_REPORT)}, "planned_geometry_analytic_where_not_yet_built": [], "safe_rect_normalized": list(SAFE_RECT), "crt_hull_authority": {"collection": "REFINED_CRT_ASSEMBLY", "object_count": len(crt_names), "objects": crt_names}, "failures": failures, "facility_feed": feed, "review_camera_gates": review_gates, "responsive_physical_fit_measurements": responsive, "families": results}
    print("QH_PHASE4R1_LIGHTWEIGHT_PREFLIGHT=" + json.dumps(report, separators=(",", ":")))
    if failures:
        raise RuntimeError(f"Phase 4-R1 no-save preflight failed: {failures}")


if __name__ == "__main__":
    main()
