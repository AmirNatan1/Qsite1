"""Fail-closed geometry/composition preflight for the refined R1 derivative.

The builder imports :func:`audit_scene` and must obtain PASS before its single
save.  Running this file on a saved derivative performs the same checks and
refreshes the tracked preflight report.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
import phase4r1_refined_config as cfg


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def decode_blender_byte_string(value: Any) -> str:
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="surrogateescape")
    return str(value or "")


def file_browser_ui_state_audit() -> dict[str, Any]:
    private_tokens = ("c:\\users\\amir", "c:/users/amir")
    records: list[dict[str, Any]] = []
    for screen in sorted(bpy.data.screens, key=lambda item: item.name):
        for area_index, area in enumerate(screen.areas):
            if area.type != "FILE_BROWSER":
                continue
            params = getattr(area.spaces.active, "params", None)
            if params is None:
                records.append({"screen": screen.name, "areaIndex": area_index, "parametersReadable": False, "passes": False})
                continue
            directory = decode_blender_byte_string(params.directory)
            filename = decode_blender_byte_string(params.filename)
            has_private_path = any(token in directory.lower() or token in filename.lower() for token in private_tokens)
            records.append(
                {
                    "screen": screen.name,
                    "areaIndex": area_index,
                    "title": str(params.title or ""),
                    "directory": None if has_private_path else directory,
                    "filename": None if has_private_path else filename,
                    "hasPrivatePath": has_private_path,
                    "parametersReadable": True,
                    "passes": directory == cfg.CANONICAL_FILE_BROWSER_DIRECTORY and filename == "" and not has_private_path,
                }
            )
    buffer_overwrite_realized_bytes = int(bpy.context.scene.get("phase4r1v2_file_browser_buffer_overwrite_realized_bytes", 0))
    return {
        "canonicalDirectory": cfg.CANONICAL_FILE_BROWSER_DIRECTORY,
        "bufferOverwriteMinimumBytes": cfg.FILE_BROWSER_DIRECTORY_BUFFER_OVERWRITE_MINIMUM_BYTES,
        "bufferOverwriteRealizedBytes": buffer_overwrite_realized_bytes,
        "fileBrowserAreaCount": len(records),
        "records": records,
        "passes": bool(records) and buffer_overwrite_realized_bytes >= cfg.FILE_BROWSER_DIRECTORY_BUFFER_OVERWRITE_MINIMUM_BYTES and all(record["passes"] for record in records),
    }


def repo_record(path: Path) -> dict[str, Any]:
    return {
        "path": path.resolve().relative_to(cfg.REPOSITORY_ROOT.resolve()).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def curve_points_world(obj: bpy.types.Object) -> list[Vector]:
    if obj.type != "CURVE" or len(obj.data.splines) != 1:
        raise RuntimeError(f"{obj.name} must be a one-spline CURVE")
    spline = obj.data.splines[0]
    if spline.type != "POLY":
        raise RuntimeError(f"{obj.name} must use deterministic POLY samples")
    return [obj.matrix_world @ Vector(point.co[:3]) for point in spline.points]


def polyline_length(points: list[Vector]) -> float:
    return sum((right - left).length for left, right in zip(points, points[1:]))


def finite_scalar_abs_delta_within(actual: Any, expected: Any, maximum_delta: float) -> bool:
    try:
        actual_value = float(actual)
        expected_value = float(expected)
        maximum_value = float(maximum_delta)
    except (TypeError, ValueError):
        return False
    return all(math.isfinite(value) for value in (actual_value, expected_value, maximum_value)) and maximum_value >= 0.0 and abs(actual_value - expected_value) <= maximum_value


def finite_vector3_euclidean_within(actual: Any, expected: Any, maximum_delta: float) -> bool:
    if not isinstance(actual, (list, tuple)) or not isinstance(expected, (list, tuple)) or len(actual) != 3 or len(expected) != 3:
        return False
    try:
        actual_values = [float(value) for value in actual]
        expected_values = [float(value) for value in expected]
        maximum_value = float(maximum_delta)
    except (TypeError, ValueError):
        return False
    return all(math.isfinite(value) for value in (*actual_values, *expected_values, maximum_value)) and maximum_value >= 0.0 and math.dist(actual_values, expected_values) <= maximum_value


def polar_angular_travel(points: list[Vector]) -> dict[str, Any]:
    angles = [math.atan2(point.y - cfg.CENTRAL_ZONE_CENTRE_XY[1], point.x - cfg.CENTRAL_ZONE_CENTRE_XY[0]) for point in points]
    deltas: list[float] = []
    for left, right in zip(angles, angles[1:]):
        delta = right - left
        while delta > math.pi:
            delta -= math.tau
        while delta < -math.pi:
            delta += math.tau
        deltas.append(delta)
    signed = sum(deltas)
    absolute = sum(abs(delta) for delta in deltas)
    return {
        "signedRadians": signed,
        "absoluteRadians": absolute,
        "signedTurns": signed / math.tau,
        "absoluteTurns": absolute / math.tau,
    }


def rounded_coordinate_authority(points: list[Vector]) -> dict[str, Any]:
    payload = [[round(float(value), 8) for value in point] for point in points]
    encoded = json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return {
        "pointCount": len(points),
        "bytes": len(encoded),
        "sha256": hashlib.sha256(encoded).hexdigest(),
        "method": "compact JSON array of world XYZ coordinates rounded to 8 decimals",
    }


def rounded_coordinate_authority_at_precision(points: list[Vector], decimals: int) -> dict[str, Any]:
    payload = [[round(float(value), decimals) for value in point] for point in points]
    encoded = json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return {
        "pointCount": len(points),
        "bytes": len(encoded),
        "sha256": hashlib.sha256(encoded).hexdigest(),
        "method": f"compact JSON array of world XYZ coordinates rounded to {decimals} decimals",
    }


def circumradius(a: Vector, b: Vector, c: Vector) -> float:
    ab = (b - a).length
    bc = (c - b).length
    ac = (c - a).length
    twice_area = (b - a).cross(c - a).length
    if twice_area <= 1e-11:
        return float("inf")
    return ab * bc * ac / (2.0 * twice_area)


def min_bend(points: list[Vector]) -> dict[str, Any]:
    candidates = [(circumradius(points[index - 1], points[index], points[index + 1]), index) for index in range(1, len(points) - 1)]
    radius, index = min(candidates, key=lambda item: item[0])
    return {
        "radiusMeters": round(float(radius), 6),
        "sampleIndex": index,
        "requiredMinimumMeters": round(cfg.CABLE_DIAMETER_M * 3.0, 6),
        "passes": radius + 1e-9 >= cfg.CABLE_DIAMETER_M * 3.0,
    }


def orient(a: Vector, b: Vector, c: Vector) -> float:
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)


def proper_intersection(a: Vector, b: Vector, c: Vector, d: Vector) -> bool:
    o1, o2, o3, o4 = orient(a, b, c), orient(a, b, d), orient(c, d, a), orient(c, d, b)
    epsilon = 1e-9
    return ((o1 > epsilon and o2 < -epsilon) or (o1 < -epsilon and o2 > epsilon)) and ((o3 > epsilon and o4 < -epsilon) or (o3 < -epsilon and o4 > epsilon))


def intersection_count(points: list[Vector]) -> tuple[int, list[list[int]]]:
    hits: list[list[int]] = []
    for left in range(len(points) - 1):
        a, b = points[left], points[left + 1]
        min_ax, max_ax = min(a.x, b.x), max(a.x, b.x)
        min_ay, max_ay = min(a.y, b.y), max(a.y, b.y)
        for right in range(left + 2, len(points) - 1):
            if right == left + 1:
                continue
            c, d = points[right], points[right + 1]
            if max_ax < min(c.x, d.x) or max(c.x, d.x) < min_ax or max_ay < min(c.y, d.y) or max(c.y, d.y) < min_ay:
                continue
            # Separate elevated tail/entry crossings in 3-D cannot be counted
            # as cable self-intersections unless their height intervals overlap.
            if max(a.z, b.z) + cfg.CABLE_DIAMETER_M < min(c.z, d.z) or max(c.z, d.z) + cfg.CABLE_DIAMETER_M < min(a.z, b.z):
                continue
            if proper_intersection(a, b, c, d):
                hits.append([left, right])
    return len(hits), hits[:24]


def cumulative_polyline_lengths(points: list[Vector]) -> list[float]:
    values = [0.0]
    for left, right in zip(points, points[1:]):
        values.append(values[-1] + (right - left).length)
    return values


def segment_segment_distance(a: Vector, b: Vector, c: Vector, d: Vector) -> tuple[float, float, float]:
    """Exact closest distance and parameters for two finite 3-D segments."""
    u = b - a
    v = d - c
    w = a - c
    uu = u.dot(u)
    uv = u.dot(v)
    vv = v.dot(v)
    uw = u.dot(w)
    vw = v.dot(w)
    denominator = uu * vv - uv * uv
    epsilon = 1e-15
    s_denominator = denominator
    t_denominator = denominator
    if denominator < epsilon:
        s_numerator = 0.0
        s_denominator = 1.0
        t_numerator = vw
        t_denominator = vv
    else:
        s_numerator = uv * vw - vv * uw
        t_numerator = uu * vw - uv * uw
        if s_numerator < 0.0:
            s_numerator = 0.0
            t_numerator = vw
            t_denominator = vv
        elif s_numerator > s_denominator:
            s_numerator = s_denominator
            t_numerator = vw + uv
            t_denominator = vv
    if t_numerator < 0.0:
        t_numerator = 0.0
        if -uw < 0.0:
            s_numerator = 0.0
        elif -uw > uu:
            s_numerator = s_denominator
        else:
            s_numerator = -uw
            s_denominator = uu
    elif t_numerator > t_denominator:
        t_numerator = t_denominator
        if -uw + uv < 0.0:
            s_numerator = 0.0
        elif -uw + uv > uu:
            s_numerator = s_denominator
        else:
            s_numerator = -uw + uv
            s_denominator = uu
    s = 0.0 if abs(s_numerator) < epsilon else s_numerator / s_denominator
    t = 0.0 if abs(t_numerator) < epsilon else t_numerator / t_denominator
    separation = w + u * s - v * t
    return separation.length, float(s), float(t)


def physical_self_clearance(points: list[Vector]) -> dict[str, Any]:
    """Audit non-local centerline clearance, including tangencies/collinearity."""
    cumulative = cumulative_polyline_lengths(points)
    required = max(cfg.CABLE_DIAMETER_M, 2.0 * cfg.CURRENT_OVERLAY_RADIUS_M)
    local_arc_exclusion = required * 1.5
    minimum = float("inf")
    minimum_pair: dict[str, Any] | None = None
    contacts: list[dict[str, Any]] = []
    planar_crossings = 0
    tested_pairs = 0
    for left in range(len(points) - 1):
        a, b = points[left], points[left + 1]
        for right in range(left + 2, len(points) - 1):
            # Neighboring pieces of the same physical tube are necessarily
            # closer than one diameter.  Exclude only a measured local arc
            # neighborhood, never an arbitrary sample-index window.
            route_arc_gap = cumulative[right] - cumulative[left + 1]
            if route_arc_gap <= local_arc_exclusion:
                continue
            c, d = points[right], points[right + 1]
            axis_gaps = (
                max(0.0, max(min(a.x, b.x), min(c.x, d.x)) - min(max(a.x, b.x), max(c.x, d.x))),
                max(0.0, max(min(a.y, b.y), min(c.y, d.y)) - min(max(a.y, b.y), max(c.y, d.y))),
                max(0.0, max(min(a.z, b.z), min(c.z, d.z)) - min(max(a.z, b.z), max(c.z, d.z))),
            )
            lower_bound = math.sqrt(sum(value * value for value in axis_gaps))
            if lower_bound >= minimum and lower_bound > required:
                continue
            tested_pairs += 1
            distance, left_parameter, right_parameter = segment_segment_distance(a, b, c, d)
            planar = proper_intersection(a, b, c, d)
            if planar:
                planar_crossings += 1
            if distance < minimum:
                minimum = distance
                minimum_pair = {
                    "segments": [left, right],
                    "distanceMeters": round(distance, 10),
                    "routeArcGapMeters": round(route_arc_gap, 10),
                    "segmentParameters": [round(left_parameter, 8), round(right_parameter, 8)],
                    "planarProperCrossing": planar,
                }
            if distance <= required + 1e-6:
                contacts.append(
                    {
                        "segments": [left, right],
                        "distanceMeters": round(distance, 10),
                        "requiredClearanceMeters": required,
                        "routeArcGapMeters": round(route_arc_gap, 10),
                        "segmentParameters": [round(left_parameter, 8), round(right_parameter, 8)],
                        "classification": "non-local tube contact/collision (includes crossing, collinear, and tangent cases)",
                        "planarProperCrossing": planar,
                    }
                )
    if minimum == float("inf"):
        minimum = 0.0
    return {
        "status": "PASS" if not contacts and minimum > required else "FAIL",
        "requiredCenterlineClearanceMeters": required,
        "renderedEnvelopeAuthority": {"graphiteSheathDiameterMeters": cfg.CABLE_DIAMETER_M, "energizedOverlayDiameterMeters": round(2.0 * cfg.CURRENT_OVERLAY_RADIUS_M, 8), "maximumRenderedEnvelopeDiameterMeters": required},
        "localArcNeighborhoodExcludedMeters": round(local_arc_exclusion, 8),
        "minimumNonlocalCenterlineClearanceMeters": round(minimum, 10),
        "minimumPair": minimum_pair,
        "physicalContactOrCollisionCount": len(contacts),
        "physicalContactOrCollisionPairs": contacts[:24],
        "planarProperCrossingCount": planar_crossings,
        "testedExactSegmentPairs": tested_pairs,
        "method": "exact finite 3-D segment distance after measured local-arc exclusion; detects proper crossings, endpoint/tangent contacts, collinear overlaps, and sub-diameter near misses",
    }


def bounds_world(obj: bpy.types.Object) -> dict[str, list[float]]:
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return {
        "x": [min(point.x for point in points), max(point.x for point in points)],
        "y": [min(point.y for point in points), max(point.y for point in points)],
        "z": [min(point.z for point in points), max(point.z for point in points)],
    }


def animation_action_name(owner: Any) -> str | None:
    animation_data = getattr(owner, "animation_data", None)
    action = None if animation_data is None else animation_data.action
    return None if action is None else action.name


def screen_spill_suppression_audit() -> dict[str, Any]:
    authority = cfg.SCREEN_SPILL_SUPPRESSION_AUTHORITY
    obj = bpy.data.objects.get(authority["object"])
    prior_frame = int(bpy.context.scene.frame_current)
    evaluated_energy = None
    evaluated_size = None
    if obj is not None and obj.type == "LIGHT" and obj.data is not None:
        try:
            bpy.context.scene.frame_set(int(authority["inspectionFrame"]))
            bpy.context.view_layer.update()
            evaluated_energy = float(obj.data.energy)
            evaluated_size = float(obj.data.size)
        finally:
            bpy.context.scene.frame_set(prior_frame)
            bpy.context.view_layer.update()
    collections = [] if obj is None else sorted(collection.name for collection in obj.users_collection)
    collection = bpy.data.collections.get(authority["collection"])
    evidence = {
        "authority": authority,
        "object": None if obj is None else obj.name,
        "objectType": None if obj is None else obj.type,
        "lightType": None if obj is None or obj.type != "LIGHT" else obj.data.type,
        "hideRender": None if obj is None else bool(obj.hide_render),
        "hideViewport": None if obj is None else bool(obj.hide_viewport),
        "collections": collections,
        "collectionHideRender": None if collection is None else bool(collection.hide_render),
        "dataAction": None if obj is None or obj.data is None else animation_action_name(obj.data),
        "inspectionFrame": authority["inspectionFrame"],
        "evaluatedEnergyWatts": evaluated_energy,
        "areaSizeMeters": evaluated_size,
    }
    evidence["passes"] = (
        obj is not None
        and obj.type == authority["objectType"]
        and obj.data is not None
        and obj.data.type == authority["lightType"]
        and obj.hide_render is authority["requiredHideRender"]
        and obj.hide_viewport is authority["recoveredHideViewport"]
        and collections == [authority["collection"]]
        and collection is not None
        and collection.hide_render is authority["recoveredCollectionHideRender"]
        and animation_action_name(obj.data) == authority["dataAction"]
        and finite_scalar_abs_delta_within(evaluated_energy, authority["evaluatedEnergyWatts"], 1e-6)
        and finite_scalar_abs_delta_within(evaluated_size, authority["areaSizeMeters"], 1e-6)
    )
    evidence["status"] = "PASS" if evidence["passes"] else "FAIL"
    return evidence


def annular_mesh_audit(spec: dict[str, Any], authority: dict[str, Any]) -> dict[str, Any]:
    obj = bpy.data.objects.get(spec["object"])
    vertices: list[Vector] = []
    polygons: list[Any] = []
    materials: list[str] = []
    if obj is not None and obj.type == "MESH" and obj.data is not None:
        vertices = [vertex.co.copy() for vertex in obj.data.vertices]
        polygons = list(obj.data.polygons)
        materials = [material.name for material in obj.data.materials if material is not None]
    tolerance = float(authority["float32RealizationToleranceMeters"])
    expected_x_planes = [float(value) for value in spec["xOffsetsMeters"]]
    expected_radii = [float(spec["innerDiameterMeters"]) * 0.5, float(spec["outerDiameterMeters"]) * 0.5]
    x_values = [float(vertex.x) for vertex in vertices]
    radial_values = [math.hypot(float(vertex.y), float(vertex.z)) for vertex in vertices]
    x_assignments = [min(range(len(expected_x_planes)), key=lambda index: abs(value - expected_x_planes[index])) for value in x_values]
    radial_assignments = [min(range(len(expected_radii)), key=lambda index: abs(value - expected_radii[index])) for value in radial_values]
    x_clusters = [
        {
            "expectedMeters": expected,
            "vertexCount": sum(assignment == index for assignment in x_assignments),
            "minimumActualMeters": min((value for value, assignment in zip(x_values, x_assignments) if assignment == index), default=None),
            "maximumActualMeters": max((value for value, assignment in zip(x_values, x_assignments) if assignment == index), default=None),
            "maximumAbsoluteErrorMeters": max((abs(value - expected) for value, assignment in zip(x_values, x_assignments) if assignment == index), default=None),
        }
        for index, expected in enumerate(expected_x_planes)
    ]
    radial_clusters = [
        {
            "expectedMeters": expected,
            "vertexCount": sum(assignment == index for assignment in radial_assignments),
            "minimumActualMeters": min((value for value, assignment in zip(radial_values, radial_assignments) if assignment == index), default=None),
            "maximumActualMeters": max((value for value, assignment in zip(radial_values, radial_assignments) if assignment == index), default=None),
            "maximumAbsoluteErrorMeters": max((abs(value - expected) for value, assignment in zip(radial_values, radial_assignments) if assignment == index), default=None),
        }
        for index, expected in enumerate(expected_radii)
    ]
    actual_origin = None if obj is None else [float(value) for value in obj.matrix_world.translation]
    origin_error = None if actual_origin is None else math.dist(actual_origin, [float(value) for value in authority["axisOriginWorldMeters"]])
    object_action = None if obj is None else animation_action_name(obj)
    data_action = None if obj is None or obj.data is None else animation_action_name(obj.data)
    evidence = {
        "object": None if obj is None else obj.name,
        "objectType": None if obj is None else obj.type,
        "axis": authority["axis"],
        "axisOriginWorldMeters": actual_origin,
        "expectedAxisOriginWorldMeters": authority["axisOriginWorldMeters"],
        "axisOriginErrorMeters": origin_error,
        "expectedLocalXPlanesMeters": expected_x_planes,
        "localXClusters": x_clusters,
        "expectedLocalRadiiMeters": expected_radii,
        "localRadiusClusters": radial_clusters,
        "float32RealizationToleranceMeters": tolerance,
        "vertexCount": len(vertices),
        "polygonCount": len(polygons),
        "polygonVertexCounts": sorted({len(polygon.vertices) for polygon in polygons}),
        "materials": materials,
        "modifierCount": 0 if obj is None else len(obj.modifiers),
        "objectAction": object_action,
        "dataAction": data_action,
    }
    evidence["passes"] = (
        obj is not None
        and obj.type == "MESH"
        and origin_error is not None
        and origin_error <= tolerance
        and finite_vector3_euclidean_within(list(obj.scale), (1.0, 1.0, 1.0), tolerance)
        and finite_vector3_euclidean_within(list(obj.rotation_euler), (0.0, 0.0, 0.0), tolerance)
        and all(cluster["vertexCount"] == int(authority["segments"]) * 2 and cluster["maximumAbsoluteErrorMeters"] is not None and cluster["maximumAbsoluteErrorMeters"] <= tolerance for cluster in x_clusters)
        and all(cluster["vertexCount"] == int(authority["segments"]) * 2 and cluster["maximumAbsoluteErrorMeters"] is not None and cluster["maximumAbsoluteErrorMeters"] <= tolerance for cluster in radial_clusters)
        and len(vertices) == int(authority["segments"]) * 4
        and len(polygons) == int(authority["segments"]) * 4
        and evidence["polygonVertexCounts"] == [4]
        and materials == [spec["material"]]
        and evidence["modifierCount"] == 0
        and object_action is None
        and data_action is None
    )
    evidence["status"] = "PASS" if evidence["passes"] else "FAIL"
    return evidence


def service_mouth_geometry_audit() -> dict[str, Any]:
    authority = cfg.SERVICE_MOUTH_AUTHORITY
    flange = annular_mesh_audit(authority["flange"], authority)
    sleeve = annular_mesh_audit(authority["sleeve"], authority)
    cable_diameter = float(cfg.CABLE_DIAMETER_M)
    sheath_radius = cable_diameter * 0.5
    current_overlay_radius = float(cfg.CURRENT_OVERLAY_RADIUS_M)
    maximum_rendered_radius = float(authority["maximumRenderedCableCurrentEnvelopeRadiusMeters"])
    sleeve_clearance = float(authority["sleeve"]["innerDiameterMeters"]) * 0.5 - maximum_rendered_radius
    flange_clearance = float(authority["flange"]["innerDiameterMeters"]) * 0.5 - maximum_rendered_radius
    axial_overlap = min(float(authority["flange"]["xOffsetsMeters"][1]), float(authority["sleeve"]["xOffsetsMeters"][1])) - max(float(authority["flange"]["xOffsetsMeters"][0]), float(authority["sleeve"]["xOffsetsMeters"][0]))
    evidence = {
        "authority": authority,
        "flange": flange,
        "sleeve": sleeve,
        "cableDiameterMeters": cable_diameter,
        "sheathRadiusMeters": sheath_radius,
        "currentOverlayRadiusMeters": current_overlay_radius,
        "maximumRenderedCableCurrentEnvelopeRadiusMeters": maximum_rendered_radius,
        "flangeEnvelopeClearanceMeters": round(flange_clearance, 9),
        "sleeveEnvelopeClearanceMeters": round(sleeve_clearance, 9),
        "flangeSleeveAxialOverlapMeters": round(axial_overlap, 9),
        "outerDiameterMultipleOfCable": round(float(authority["flange"]["outerDiameterMeters"]) / cable_diameter, 9),
    }
    evidence["passes"] = (
        authority["axis"] == "+X"
        and int(authority["segments"]) == 64
        and abs(max(sheath_radius, current_overlay_radius) - maximum_rendered_radius) <= 1e-12
        and flange["passes"]
        and sleeve["passes"]
        and flange_clearance + 1e-12 >= float(authority["minimumEnvelopeClearanceMeters"])
        and sleeve_clearance + 1e-12 >= float(authority["minimumEnvelopeClearanceMeters"])
        and float(authority["sleeve"]["outerDiameterMeters"]) <= float(authority["flange"]["innerDiameterMeters"]) + 1e-12
        and axial_overlap > 0.0
        and float(authority["flange"]["outerDiameterMeters"]) <= cable_diameter * float(authority["maximumOuterDiameterMultipleOfCable"]) + 1e-12
    )
    evidence["status"] = "PASS" if evidence["passes"] else "FAIL"
    return evidence


def polyline_x_plane_crossings(points: list[Vector], plane_x: float) -> list[dict[str, Any]]:
    crossings: list[dict[str, Any]] = []
    for index, (left, right) in enumerate(zip(points, points[1:])):
        delta_x = float(right.x - left.x)
        if abs(delta_x) <= 1e-12:
            continue
        factor = (plane_x - float(left.x)) / delta_x
        if factor < -1e-10 or factor > 1.0 + 1e-10:
            continue
        point = left.lerp(right, min(1.0, max(0.0, factor)))
        if crossings and (point - Vector(crossings[-1]["worldMeters"])).length <= 1e-9:
            continue
        crossings.append({"segmentIndex": index, "factor": round(float(factor), 12), "worldMeters": [float(value) for value in point]})
    return crossings


def service_mouth_aperture_transit(points: list[Vector]) -> dict[str, Any]:
    authority = cfg.SERVICE_MOUTH_AUTHORITY
    origin = Vector(authority["axisOriginWorldMeters"])
    realization_tolerance = float(authority["float32RealizationToleranceMeters"])
    sheath_radius = float(cfg.CABLE_DIAMETER_M) * 0.5
    current_overlay_radius = float(cfg.CURRENT_OVERLAY_RADIUS_M)
    maximum_rendered_radius = float(authority["maximumRenderedCableCurrentEnvelopeRadiusMeters"])
    apertures: list[dict[str, Any]] = []
    for component in ("sleeve", "flange"):
        spec = authority[component]
        inner_radius = float(spec["innerDiameterMeters"]) * 0.5
        for face, offset in zip(("rear", "front"), spec["xOffsetsMeters"]):
            plane_x = origin.x + float(offset)
            crossings = polyline_x_plane_crossings(points, plane_x)
            crossing = crossings[0] if len(crossings) == 1 else None
            radial_offset = None if crossing is None else math.hypot(crossing["worldMeters"][1] - origin.y, crossing["worldMeters"][2] - origin.z)
            clearance = None if radial_offset is None else inner_radius - (radial_offset + maximum_rendered_radius)
            apertures.append(
                {
                    "component": component,
                    "face": face,
                    "planeXWorldMeters": float(plane_x),
                    "innerRadiusMeters": inner_radius,
                    "crossingCount": len(crossings),
                    "crossing": crossing,
                    "centerlineRadialOffsetMeters": radial_offset,
                    "cableEnvelopeClearanceMeters": clearance,
                    "passes": len(crossings) == 1 and clearance is not None and clearance + 1e-12 >= float(authority["minimumEnvelopeClearanceMeters"]),
                }
            )
    maximum_plane_x = max(row["planeXWorldMeters"] for row in apertures)
    initial_transit_points = [point for point in points if point.x <= maximum_plane_x + 1e-9]
    monotonic_positive_x = all(right.x + 1e-10 >= left.x for left, right in zip(initial_transit_points, initial_transit_points[1:]))
    route_start_error = (points[0] - origin).length
    measured_clearances = [float(row["cableEnvelopeClearanceMeters"]) for row in apertures if row["cableEnvelopeClearanceMeters"] is not None]
    evidence = {
        "authority": authority,
        "routeStartWorldMeters": [float(value) for value in points[0]],
        "expectedRouteStartWorldMeters": [float(value) for value in origin],
        "routeStartRealizationErrorMeters": route_start_error,
        "float32RealizationToleranceMeters": realization_tolerance,
        "sheathRadiusMeters": sheath_radius,
        "currentOverlayRadiusMeters": current_overlay_radius,
        "maximumRenderedCableCurrentEnvelopeRadiusMeters": maximum_rendered_radius,
        "beginsOnAxisOrigin": route_start_error <= realization_tolerance,
        "extendsBeyondFrontPlane": max(point.x for point in points) > maximum_plane_x + maximum_rendered_radius,
        "monotonicPositiveXThroughAssembly": monotonic_positive_x,
        "minimumMeasuredEnvelopeClearanceMeters": min(measured_clearances) if measured_clearances else None,
        "requiredMinimumEnvelopeClearanceMeters": float(authority["minimumEnvelopeClearanceMeters"]),
        "apertures": apertures,
    }
    evidence["passes"] = abs(max(sheath_radius, current_overlay_radius) - maximum_rendered_radius) <= 1e-12 and evidence["beginsOnAxisOrigin"] and evidence["extendsBeyondFrontPlane"] and monotonic_positive_x and all(row["passes"] for row in apertures)
    evidence["status"] = "PASS" if evidence["passes"] else "FAIL"
    return evidence


def principled_material_authority_audit(key: str, spec: dict[str, Any]) -> dict[str, Any]:
    tolerances = cfg.HALL_VISUAL_AUTHORITY["float32RealizationTolerances"]
    material = bpy.data.materials.get(spec["name"])
    principled = [] if material is None or not material.use_nodes or material.node_tree is None else [node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"]
    shader = principled[0] if len(principled) == 1 else None
    base = None if shader is None else [float(value) for value in shader.inputs["Base Color"].default_value]
    roughness = None if shader is None else float(shader.inputs["Roughness"].default_value)
    metallic = None if shader is None else float(shader.inputs["Metallic"].default_value)
    expected_base = list(srgb(spec["colorHex"]))
    evidence = {
        "key": key,
        "authority": spec,
        "material": None if material is None else material.name,
        "paletteHex": None if material is None else material_base_hex(material),
        "baseColor": base,
        "expectedBaseColor": expected_base,
        "baseColorMaximumAbsoluteError": None if base is None else max(abs(actual - expected) for actual, expected in zip(base, expected_base)),
        "roughness": roughness,
        "roughnessAbsoluteError": None if roughness is None else abs(roughness - float(spec["roughness"])),
        "metallic": metallic,
        "metallicAbsoluteError": None if metallic is None else abs(metallic - float(spec["metallic"])),
        "principledNodeCount": len(principled),
    }
    evidence["passes"] = (
        material is not None
        and material.name == spec["name"]
        and evidence["paletteHex"] == spec["colorHex"].lower()
        and base is not None
        and all(abs(actual - expected) <= float(tolerances["colorChannel"]) for actual, expected in zip(base, expected_base))
        and finite_scalar_abs_delta_within(roughness, spec["roughness"], tolerances["materialScalar"])
        and finite_scalar_abs_delta_within(metallic, spec["metallic"], tolerances["materialScalar"])
        and len(principled) == 1
    )
    return evidence


def light_authority_record(obj: bpy.types.Object | None) -> dict[str, Any]:
    if obj is None or obj.type != "LIGHT" or obj.data is None:
        return {"object": None, "passesType": False}
    direction = obj.matrix_world.to_quaternion() @ Vector((0.0, 0.0, -1.0))
    return {
        "object": obj.name,
        "data": obj.data.name,
        "objectType": obj.type,
        "lightType": obj.data.type,
        "dataUsers": int(obj.data.users),
        "location": [float(value) for value in obj.location],
        "eulerDegrees": [math.degrees(float(value)) for value in obj.rotation_euler],
        "localMinusZWorld": [float(value) for value in direction],
        "energy": float(obj.data.energy),
        "color": [float(value) for value in obj.data.color],
        "softRadiusMeters": None if not hasattr(obj.data, "shadow_soft_size") else float(obj.data.shadow_soft_size),
        "areaShape": None if not hasattr(obj.data, "shape") else str(obj.data.shape),
        "areaSizeMeters": None if not hasattr(obj.data, "size") else float(obj.data.size),
        "sunAngleDegrees": None if not hasattr(obj.data, "angle") else math.degrees(float(obj.data.angle)),
        "spotConeDegrees": None if obj.data.type != "SPOT" else math.degrees(float(obj.data.spot_size)),
        "spotBlend": None if obj.data.type != "SPOT" else float(obj.data.spot_blend),
        "objectAction": animation_action_name(obj),
        "dataAction": animation_action_name(obj.data),
        "mesh": None,
        "passesType": True,
    }


def hall_visual_authority_audit() -> dict[str, Any]:
    authority = cfg.HALL_VISUAL_AUTHORITY
    tolerances = authority["float32RealizationTolerances"]
    scene = bpy.context.scene
    materials = {key: principled_material_authority_audit(key, spec) for key, spec in authority["materials"].items()}
    world = scene.world
    background = None if world is None or not world.use_nodes or world.node_tree is None else world.node_tree.nodes.get("Background")
    world_color = None if background is None or background.inputs["Color"].is_linked else [float(value) for value in background.inputs["Color"].default_value]
    world_strength = None if background is None or background.inputs["Strength"].is_linked else float(background.inputs["Strength"].default_value)
    point_records: list[dict[str, Any]] = []
    point_passes: list[bool] = []
    for index, spec in enumerate(authority["perimeterPointPracticals"]):
        record = light_authority_record(bpy.data.objects.get(f"Phase4R1V2_PerimeterPractical_{index:02d}"))
        if record["passesType"]:
            record.update(
                {
                    "expected": spec,
                    "locationErrorMeters": math.dist(record["location"], spec["location"]),
                    "colorMaximumAbsoluteError": max(abs(actual - expected) for actual, expected in zip(record["color"], spec["color"])),
                    "energyAbsoluteError": abs(record["energy"] - float(spec["energyWatts"])),
                    "softRadiusAbsoluteErrorMeters": abs(record["softRadiusMeters"] - float(spec["softRadiusMeters"])),
                }
            )
        passed = (
            record["passesType"]
            and record["lightType"] == "POINT"
            and finite_vector3_euclidean_within(record["location"], spec["location"], tolerances["worldMeters"])
            and all(abs(actual - expected) <= float(tolerances["colorChannel"]) for actual, expected in zip(record["color"], spec["color"]))
            and finite_scalar_abs_delta_within(record["energy"], spec["energyWatts"], tolerances["ordinaryLightEnergy"])
            and finite_scalar_abs_delta_within(record["softRadiusMeters"], spec["softRadiusMeters"], tolerances["worldMeters"])
            and record["objectAction"] is None
            and record["dataAction"] is None
        )
        record["passes"] = passed
        point_records.append(record)
        point_passes.append(passed)
    key_spec = authority["highSoftNeutralKey"]
    key_record = light_authority_record(bpy.data.objects.get("Phase4R1V2_HighSoftNeutralKey"))
    if key_record["passesType"]:
        key_record.update(
            {
                "expected": key_spec,
                "locationErrorMeters": math.dist(key_record["location"], key_spec["location"]),
                "colorMaximumAbsoluteError": max(abs(actual - expected) for actual, expected in zip(key_record["color"], key_spec["color"])),
                "energyAbsoluteError": abs(key_record["energy"] - float(key_spec["energyWatts"])),
                "areaSizeAbsoluteErrorMeters": abs(key_record["areaSizeMeters"] - float(key_spec["sizeMeters"])),
            }
        )
    key_record["passes"] = (
        key_record["passesType"]
        and key_record["lightType"] == "AREA"
        and finite_vector3_euclidean_within(key_record["location"], key_spec["location"], tolerances["worldMeters"])
        and all(abs(actual - expected) <= float(tolerances["colorChannel"]) for actual, expected in zip(key_record["color"], key_spec["color"]))
        and finite_scalar_abs_delta_within(key_record["energy"], key_spec["energyWatts"], tolerances["ordinaryLightEnergy"])
        and key_record["areaShape"] == key_spec["shape"]
        and finite_scalar_abs_delta_within(key_record["areaSizeMeters"], key_spec["sizeMeters"], tolerances["worldMeters"])
        and key_record["objectAction"] is None
        and key_record["dataAction"] is None
    )
    sun_spec = authority["architecturalSun"]
    sun_record = light_authority_record(bpy.data.objects.get(sun_spec["object"]))
    sun_record["expectedLocalMinusZWorld"] = sun_spec["expectedLocalMinusZWorld"]
    sun_record["directionRealizationError"] = None if not sun_record["passesType"] else math.dist(sun_record["localMinusZWorld"], sun_spec["expectedLocalMinusZWorld"])
    sun_record["directionRealizationTolerance"] = sun_spec["directionRealizationTolerance"]
    if sun_record["passesType"]:
        sun_record.update(
            {
                "expected": sun_spec,
                "locationErrorMeters": math.dist(sun_record["location"], sun_spec["location"]),
                "eulerMaximumAbsoluteErrorDegrees": max(abs(actual - expected) for actual, expected in zip(sun_record["eulerDegrees"], sun_spec["eulerDegrees"])),
                "colorMaximumAbsoluteError": max(abs(actual - expected) for actual, expected in zip(sun_record["color"], sun_spec["color"])),
                "energyAbsoluteError": None if sun_spec["energy"] is None else abs(sun_record["energy"] - float(sun_spec["energy"])),
                "angleAbsoluteErrorDegrees": abs(sun_record["sunAngleDegrees"] - float(sun_spec["angleDegrees"])),
            }
        )
    sun_record["passes"] = (
        sun_record["passesType"]
        and sun_record["data"] == sun_spec["data"]
        and sun_record["dataUsers"] == 1
        and sun_record["lightType"] == "SUN"
        and finite_vector3_euclidean_within(sun_record["location"], sun_spec["location"], tolerances["worldMeters"])
        and all(abs(actual - expected) <= float(tolerances["degrees"]) for actual, expected in zip(sun_record["eulerDegrees"], sun_spec["eulerDegrees"]))
        and finite_vector3_euclidean_within(sun_record["localMinusZWorld"], sun_spec["expectedLocalMinusZWorld"], sun_spec["directionRealizationTolerance"])
        and all(abs(actual - expected) <= float(tolerances["colorChannel"]) for actual, expected in zip(sun_record["color"], sun_spec["color"]))
        and finite_scalar_abs_delta_within(sun_record["energy"], sun_spec["energy"], tolerances["sunEnergy"])
        and finite_scalar_abs_delta_within(sun_record["sunAngleDegrees"], sun_spec["angleDegrees"], tolerances["degrees"])
        and sun_record["objectAction"] == sun_spec["action"]
        and sun_record["dataAction"] == sun_spec["action"]
        and sun_record["mesh"] == sun_spec["mesh"]
    )
    rear_spec = authority.get("additionalLocalRearLight")
    rear_record = light_authority_record(None if not isinstance(rear_spec, dict) else bpy.data.objects.get(rear_spec["object"]))
    if isinstance(rear_spec, dict):
        target_direction = Vector(rear_spec["targetWorldMeters"]) - Vector(rear_spec["location"])
        target_direction_valid = target_direction.length > 1e-12
        if target_direction_valid:
            target_direction.normalize()
        expected_rear_direction = Vector(rear_spec["expectedLocalMinusZWorld"])
        rear_record["expected"] = rear_spec
        rear_record["targetWorldMeters"] = rear_spec["targetWorldMeters"]
        rear_record["targetDerivedLocalMinusZWorld"] = None if not target_direction_valid else [float(value) for value in target_direction]
        rear_record["targetDirectionAuthorityError"] = None if not target_direction_valid else (target_direction - expected_rear_direction).length
        rear_record["directionRealizationError"] = None if not rear_record["passesType"] else math.dist(rear_record["localMinusZWorld"], rear_spec["expectedLocalMinusZWorld"])
        rear_record["locationErrorMeters"] = None if not rear_record["passesType"] else math.dist(rear_record["location"], rear_spec["location"])
        rear_record["colorMaximumAbsoluteError"] = None if not rear_record["passesType"] else max(abs(actual - expected) for actual, expected in zip(rear_record["color"], rear_spec["color"]))
        rear_record["energyAbsoluteError"] = None if not rear_record["passesType"] else abs(rear_record["energy"] - float(rear_spec["energyWatts"]))
        rear_record["coneAbsoluteErrorDegrees"] = None if not rear_record["passesType"] else abs(rear_record["spotConeDegrees"] - float(rear_spec["coneDegrees"]))
        rear_record["blendAbsoluteError"] = None if not rear_record["passesType"] else abs(rear_record["spotBlend"] - float(rear_spec["blend"]))
        rear_record["softRadiusAbsoluteErrorMeters"] = None if not rear_record["passesType"] else abs(rear_record["softRadiusMeters"] - float(rear_spec["softRadiusMeters"]))
        rear_record["passes"] = (
            rear_record["passesType"]
            and rear_record["data"] == rear_spec["data"]
            and rear_record["dataUsers"] == 1
            and rear_record["lightType"] == "SPOT"
            and target_direction_valid
            and finite_vector3_euclidean_within(rear_record["location"], rear_spec["location"], tolerances["worldMeters"])
            and finite_vector3_euclidean_within([float(value) for value in target_direction], rear_spec["expectedLocalMinusZWorld"], rear_spec["directionRealizationTolerance"])
            and finite_vector3_euclidean_within(rear_record["localMinusZWorld"], rear_spec["expectedLocalMinusZWorld"], rear_spec["directionRealizationTolerance"])
            and all(abs(actual - expected) <= float(tolerances["colorChannel"]) for actual, expected in zip(rear_record["color"], rear_spec["color"]))
            and finite_scalar_abs_delta_within(rear_record["energy"], rear_spec["energyWatts"], tolerances["ordinaryLightEnergy"])
            and finite_scalar_abs_delta_within(rear_record["spotConeDegrees"], rear_spec["coneDegrees"], tolerances["degrees"])
            and finite_scalar_abs_delta_within(rear_record["spotBlend"], rear_spec["blend"], tolerances["materialScalar"])
            and finite_scalar_abs_delta_within(rear_record["softRadiusMeters"], rear_spec["softRadiusMeters"], tolerances["worldMeters"])
            and rear_record["objectAction"] == rear_spec["action"]
            and rear_record["dataAction"] == rear_spec["action"]
            and rear_record["mesh"] == rear_spec["mesh"]
        )
    else:
        rear_record.update({"expected": rear_spec, "passes": False})
    lighting_collection = bpy.data.collections.get("PHASE4R1V2_LOW_NEUTRAL_LIGHTING")
    expected_lighting_objects = [
        *(f"Phase4R1V2_PerimeterPractical_{index:02d}" for index in range(len(authority["perimeterPointPracticals"]))),
        "Phase4R1V2_HighSoftNeutralKey",
        sun_spec["object"],
    ]
    if isinstance(rear_spec, dict):
        expected_lighting_objects.append(rear_spec["object"])
    expected_lighting_objects.sort()
    actual_lighting_objects = [] if lighting_collection is None else sorted(obj.name for obj in lighting_collection.objects)
    stored_authority = None
    try:
        stored_authority = json.loads(str(scene.get("phase4r1v2_hall_visual_authority_json", "")))
    except (TypeError, ValueError, json.JSONDecodeError):
        stored_authority = None
    expected_world_color = list(srgb(authority["world"]["colorHex"]))
    evidence = {
        "authority": authority,
        "scene": {"viewTransform": scene.view_settings.view_transform, "look": scene.view_settings.look, "exposureStops": float(scene.view_settings.exposure), "expectedExposureStops": authority["exposureStops"], "exposureAbsoluteError": abs(float(scene.view_settings.exposure) - float(authority["exposureStops"])), "storedAuthority": stored_authority},
        "materials": materials,
        "world": {"color": world_color, "expectedColor": expected_world_color, "colorMaximumAbsoluteError": None if world_color is None else max(abs(actual - expected) for actual, expected in zip(world_color, expected_world_color)), "strength": world_strength, "expectedStrength": authority["world"]["strength"], "strengthAbsoluteError": None if world_strength is None else abs(world_strength - float(authority["world"]["strength"]))},
        "perimeterPointPracticals": point_records,
        "highSoftNeutralKey": key_record,
        "architecturalSun": sun_record,
        "additionalLocalRearLight": rear_record,
        "expectedLightingCollectionObjects": expected_lighting_objects,
        "actualLightingCollectionObjects": actual_lighting_objects,
    }
    evidence["passes"] = (
        scene.view_settings.view_transform == authority["viewTransform"]
        and scene.view_settings.look == authority["look"]
        and finite_scalar_abs_delta_within(scene.view_settings.exposure, authority["exposureStops"], tolerances["materialScalar"])
        and stored_authority == authority
        and all(record["passes"] for record in materials.values())
        and world_color is not None
        and all(abs(actual - expected) <= float(tolerances["colorChannel"]) for actual, expected in zip(world_color, expected_world_color))
        and finite_scalar_abs_delta_within(world_strength, authority["world"]["strength"], tolerances["worldStrength"])
        and all(point_passes)
        and key_record["passes"]
        and sun_record["passes"]
        and rear_record["passes"]
        and actual_lighting_objects == expected_lighting_objects
    )
    evidence["status"] = "PASS" if evidence["passes"] else "FAIL"
    return evidence


def material_base_hex(material: bpy.types.Material) -> str | None:
    value = material.get("phase4r1v2_palette_hex")
    return None if value is None else str(value).lower()


def rgb_evidence(values: Any) -> dict[str, Any]:
    rgb = [float(values[index]) for index in range(3)]
    maximum, minimum = max(rgb), min(rgb)
    return {
        "rgb": [round(value, 8) for value in rgb],
        "luminance": round(0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2], 8),
        "saturationProxy": round(0.0 if maximum <= 1e-12 else (maximum - minimum) / maximum, 8),
    }


def material_structural_evidence(material: bpy.types.Material) -> dict[str, Any]:
    base_candidates: list[tuple[float, float, float, float]] = [tuple(float(value) for value in material.diffuse_color)]
    emission_candidates: list[dict[str, Any]] = []
    linked_base_sockets: list[dict[str, str]] = []
    linked_emission_sockets: list[dict[str, str]] = []
    emission_short_circuits: list[dict[str, Any]] = []
    if material.use_nodes and material.node_tree is not None:
        surface_nodes: set[bpy.types.Node] = set()
        pending: list[bpy.types.Node] = []
        for node in material.node_tree.nodes:
            if node.type == "OUTPUT_MATERIAL":
                surface = node.inputs.get("Surface")
                if surface is not None:
                    pending.extend(link.from_node for link in surface.links)
        while pending:
            node = pending.pop()
            if node in surface_nodes:
                continue
            surface_nodes.add(node)
            pending.extend(link.from_node for socket in node.inputs for link in socket.links)
        for node in sorted(surface_nodes, key=lambda value: value.name):
            if node.type == "BSDF_PRINCIPLED":
                base = node.inputs.get("Base Color")
                if base is not None:
                    if base.is_linked:
                        linked_base_sockets.extend({"node": node.name, "socket": base.name, "fromNode": link.from_node.name, "fromSocket": link.from_socket.name} for link in base.links)
                    else:
                        base_candidates.append(tuple(float(value) for value in base.default_value))
                emission = node.inputs.get("Emission Color") or node.inputs.get("Emission")
                strength = node.inputs.get("Emission Strength")
                if emission is not None and strength is not None:
                    strength_value = None if strength.is_linked else float(strength.default_value)
                    if strength_value is not None and abs(strength_value) <= 1e-12:
                        emission_short_circuits.append(
                            {
                                "node": node.name,
                                "reason": "unlinked emission-strength socket evaluates exactly zero at the audited frame; any linked color is multiplicatively unable to emit",
                                "strength": round(strength_value, 8),
                                "strengthLinked": False,
                                "colorLinked": bool(emission.is_linked),
                                "colorLinks": [
                                    {"fromNode": link.from_node.name, "fromSocket": link.from_socket.name}
                                    for link in emission.links
                                ],
                            }
                        )
                    elif emission.is_linked or strength.is_linked:
                        linked_emission_sockets.extend(
                            {"node": node.name, "socket": socket.name, "fromNode": link.from_node.name, "fromSocket": link.from_socket.name}
                            for socket in (emission, strength)
                            for link in socket.links
                        )
                    else:
                        emission_candidates.append({"node": node.name, "color": rgb_evidence(emission.default_value), "strength": round(float(strength.default_value), 8)})
            elif node.type == "EMISSION":
                color = node.inputs.get("Color")
                strength = node.inputs.get("Strength")
                if color is not None and strength is not None:
                    strength_value = None if strength.is_linked else float(strength.default_value)
                    if strength_value is not None and abs(strength_value) <= 1e-12:
                        emission_short_circuits.append(
                            {
                                "node": node.name,
                                "reason": "unlinked emission-strength socket evaluates exactly zero at the audited frame; any linked color is multiplicatively unable to emit",
                                "strength": round(strength_value, 8),
                                "strengthLinked": False,
                                "colorLinked": bool(color.is_linked),
                                "colorLinks": [
                                    {"fromNode": link.from_node.name, "fromSocket": link.from_socket.name}
                                    for link in color.links
                                ],
                            }
                        )
                    elif color.is_linked or strength.is_linked:
                        linked_emission_sockets.extend(
                            {"node": node.name, "socket": socket.name, "fromNode": link.from_node.name, "fromSocket": link.from_socket.name}
                            for socket in (color, strength)
                            for link in socket.links
                        )
                    else:
                        emission_candidates.append({"node": node.name, "color": rgb_evidence(color.default_value), "strength": round(float(strength.default_value), 8)})
    base_records = [rgb_evidence(value) for value in base_candidates]
    brightest_base = max(base_records, key=lambda row: row["luminance"])
    maximum_emission = max((row["strength"] * row["color"]["luminance"] for row in emission_candidates), default=0.0)
    return {
        "name": material.name,
        "bases": base_records,
        "brightestBase": brightest_base,
        "emissions": emission_candidates,
        "linkedBaseSockets": linked_base_sockets,
        "linkedEmissionSockets": linked_emission_sockets,
        "emissionShortCircuits": emission_short_circuits,
        "maximumEmissionLuminanceStrength": round(maximum_emission, 8),
    }


def color_is_magenta(record: dict[str, Any]) -> bool:
    red, green, blue = record["rgb"]
    return red >= 0.30 and blue >= 0.15 and green <= min(red, blue) * 0.75 and red >= green * 1.50


def color_is_yellow(record: dict[str, Any]) -> bool:
    red, green, blue = record["rgb"]
    return red >= 0.30 and green >= 0.30 and blue <= min(red, green) * 0.72


def srgb(value: str) -> tuple[float, float, float, float]:
    clean = value.lstrip("#")
    return tuple(int(clean[index : index + 2], 16) / 255.0 for index in (0, 2, 4)) + (1.0,)


def visible_render_objects() -> set[bpy.types.Object]:
    """Resolve collection/object render visibility from the scene root."""
    visible: set[bpy.types.Object] = set()

    def visit(collection: bpy.types.Collection, ancestors_visible: bool) -> None:
        current_visible = ancestors_visible and not collection.hide_render
        if not current_visible:
            return
        for obj in collection.objects:
            if not obj.hide_render:
                visible.add(obj)
        for child in collection.children:
            visit(child, current_visible)

    # The master scene collection is not itself a child and its hide flag is
    # not an authored visibility control, so begin with its direct contents.
    root = bpy.context.scene.collection
    for obj in root.objects:
        if not obj.hide_render:
            visible.add(obj)
    for child in root.children:
        visit(child, True)
    return visible


def aabb_intersects_central_zone(obj: bpy.types.Object, maximum_z: float = 2.25) -> bool:
    if obj.type not in {"MESH", "CURVE", "SURFACE", "META", "FONT"}:
        return False
    bounds = bounds_world(obj)
    if bounds["z"][0] > maximum_z or bounds["z"][1] < -0.25:
        return False
    cx, cy = cfg.CENTRAL_ZONE_CENTRE_XY
    closest_x = min(max(cx, bounds["x"][0]), bounds["x"][1])
    closest_y = min(max(cy, bounds["y"][0]), bounds["y"][1])
    return math.hypot(closest_x - cx, closest_y - cy) <= cfg.CENTRAL_ZONE_RADIUS_M


def accepted_crt_object_names() -> set[str]:
    names: set[str] = set()
    for collection_name in cfg.ACCEPTED_CRT_COLLECTIONS:
        collection = bpy.data.collections.get(collection_name)
        if collection is not None:
            names.update(obj.name for obj in collection.all_objects)
    return names


def current_effective_emission(obj: bpy.types.Object) -> float:
    if not obj.get("phase4r1v2_current_segment"):
        return 0.0
    material = obj.data.materials[0] if obj.data is not None and obj.data.materials else None
    multiplier = 0.0 if material is None else float(material.get("phase4r1v2_emission_multiplier", 0.0))
    return max(0.0, float(obj.color[3])) * multiplier


def central_inventory_for_family(family: str) -> dict[str, Any]:
    prior = {name: bpy.data.collections[spec["collection"]].hide_render for name, spec in cfg.CABLE_FAMILIES.items()}
    try:
        for name, spec in cfg.CABLE_FAMILIES.items():
            bpy.data.collections[spec["collection"]].hide_render = name != family
        bpy.context.scene.frame_set(1)
        visible = sorted((obj for obj in visible_render_objects() if aabb_intersects_central_zone(obj)), key=lambda obj: obj.name)
        crt_names = accepted_crt_object_names()
        active_collection_names = {obj.name for obj in bpy.data.collections[cfg.CABLE_FAMILIES[family]["collection"]].all_objects}
        floor_names = {obj.name for obj in bpy.data.collections["PHASE4R1_HALL_FLOOR"].all_objects}
        perimeter_names: set[str] = set(cfg.RETAINED_OVERHEAD_SOURCE_OBJECTS)
        for collection_name in ("PHASE4R1_HALL_STRUCTURE", "PHASE4R1_HALL_ARCHITECTURE"):
            perimeter_names.update(obj.name for obj in bpy.data.collections[collection_name].all_objects)
        groups = {"crt": [], "spiralCable": [], "environmentalFloorSurface": [], "perimeterShadowArchitecture": [], "transparentDormantSignalGeometry": [], "unclassifiedVisibleNonHero": []}
        for obj in visible:
            if obj.name in crt_names:
                groups["crt"].append(obj.name)
            elif obj.name in active_collection_names:
                if obj.get("phase4r1v2_current_segment") and current_effective_emission(obj) <= 1e-9:
                    groups["transparentDormantSignalGeometry"].append(obj.name)
                elif obj.type == "LIGHT":
                    continue
                else:
                    groups["spiralCable"].append(obj.name)
            elif obj.get("phase4r1v2_inventory_class") == "spiral cable":
                groups["spiralCable"].append(obj.name)
            elif obj.name == "Phase4R1V2_ExactQuantumQ_PicturePlane" and float(obj.color[3]) <= 1e-9:
                groups["transparentDormantSignalGeometry"].append(obj.name)
            elif obj.name in floor_names:
                groups["environmentalFloorSurface"].append(obj.name)
            elif obj.name in perimeter_names:
                groups["perimeterShadowArchitecture"].append(obj.name)
            elif obj.get("phase4r1v2_invisible_helper"):
                continue
            else:
                groups["unclassifiedVisibleNonHero"].append(obj.name)
        heroes = []
        if groups["crt"]:
            heroes.append("CRT")
        if groups["spiralCable"]:
            heroes.append("spiral cable")
        return {"family": family, "frame": 1, "visibleHeroObjects": heroes, "visibleNonHeroObjects": groups["unclassifiedVisibleNonHero"], "derivedRenderParticipants": [obj.name for obj in visible], "classified": groups}
    finally:
        for name, hidden in prior.items():
            bpy.data.collections[cfg.CABLE_FAMILIES[name]["collection"]].hide_render = hidden


def camera_measurements() -> dict[str, Any]:
    target = Vector((cfg.CENTRAL_ZONE_CENTRE_XY[0], cfg.CENTRAL_ZONE_CENTRE_XY[1], 0.425))
    output: dict[str, Any] = {}
    for family, camera_name in cfg.CAMERAS.items():
        camera = bpy.data.objects[camera_name]
        samples = []
        prior_angle = None
        unwrapped = None
        for frame in range(46, 286):
            bpy.context.scene.frame_set(frame)
            location = camera.matrix_world.translation.copy()
            relative = location - target
            angle = math.degrees(math.atan2(relative.y, relative.x))
            if prior_angle is None:
                unwrapped = angle
            else:
                delta = angle - prior_angle
                while delta > 180.0:
                    delta -= 360.0
                while delta < -180.0:
                    delta += 360.0
                unwrapped += delta
            prior_angle = angle
            samples.append({"frame": frame, "worldMeters": [round(float(value), 8) for value in location], "angleDegreesUnwrapped": round(float(unwrapped), 8), "horizontalRadiusMeters": round(math.hypot(relative.x, relative.y), 8), "elevationAboveTargetMeters": round(float(relative.z), 8), "lensMillimeters": round(float(camera.data.lens), 8)})
        radii = [row["horizontalRadiusMeters"] for row in samples]
        elevations = [row["elevationAboveTargetMeters"] for row in samples]
        angles = [row["angleDegreesUnwrapped"] for row in samples]
        output[family] = {
            "camera": camera_name,
            "angleStartDegrees": angles[0],
            "angleEndDegrees": angles[-1],
            "angularTravelDegrees": round(angles[-1] - angles[0], 6),
            "radiusStartMeters": radii[0],
            "radiusEndMeters": radii[-1],
            "elevationStartMeters": elevations[0],
            "elevationEndMeters": elevations[-1],
            "lensStartMillimeters": samples[0]["lensMillimeters"],
            "lensEndMillimeters": samples[-1]["lensMillimeters"],
            "counterClockwise": all(right + 1e-6 >= left for left, right in zip(angles, angles[1:])),
            "monotonicInward": all(right <= left + 1e-6 for left, right in zip(radii, radii[1:])),
            "monotonicDescent": all(right <= left + 1e-6 for left, right in zip(elevations, elevations[1:])),
            "selectedTelemetry": [samples[index] for index in (0, 30, 60, 119, 179, 239)],
        }
    return output


def object_bound_points_world(obj: bpy.types.Object) -> list[Vector]:
    return [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]


def projection_record(scene: bpy.types.Scene, camera: bpy.types.Object, points: list[Vector]) -> dict[str, Any]:
    samples = [world_to_camera_view(scene, camera, point) for point in points]
    in_front = [sample for sample in samples if sample.z > 0.0]
    visible = [sample for sample in in_front if 0.0 <= sample.x <= 1.0 and 0.0 <= sample.y <= 1.0]
    if not in_front:
        return {"pointCount": len(points), "inFrontCount": 0, "visiblePointCount": 0, "visibleFraction": 0.0, "ndcBounds": None, "safeMargin": None}
    minimum_x = min(sample.x for sample in in_front)
    maximum_x = max(sample.x for sample in in_front)
    minimum_y = min(sample.y for sample in in_front)
    maximum_y = max(sample.y for sample in in_front)
    return {
        "pointCount": len(points),
        "inFrontCount": len(in_front),
        "visiblePointCount": len(visible),
        "visibleFraction": round(len(visible) / max(1, len(points)), 8),
        "ndcBounds": [round(minimum_x, 8), round(minimum_y, 8), round(maximum_x, 8), round(maximum_y, 8)],
        "safeMargin": round(min(minimum_x, minimum_y, 1.0 - maximum_x, 1.0 - maximum_y), 8),
        "horizontalOccupancy": round(max(0.0, maximum_x - minimum_x), 8),
        "verticalOccupancy": round(max(0.0, maximum_y - minimum_y), 8),
        "areaOccupancy": round(max(0.0, maximum_x - minimum_x) * max(0.0, maximum_y - minimum_y), 8),
    }


def accepted_crt_objects() -> list[bpy.types.Object]:
    """Physical cabinet hull authority used by the accepted occupancy gates."""
    values: dict[str, bpy.types.Object] = {}
    for collection_name in ("REFINED_CRT_ASSEMBLY",):
        collection = bpy.data.collections.get(collection_name)
        if collection is None:
            continue
        for obj in collection.objects:
            if obj.type in {"MESH", "CURVE", "SURFACE", "META", "FONT"}:
                values[obj.name] = obj
    return [values[name] for name in sorted(values)]


def opening_composition_measurements() -> dict[str, Any]:
    scene = bpy.context.scene
    prior_render_geometry = {
        "resolutionX": int(scene.render.resolution_x),
        "resolutionY": int(scene.render.resolution_y),
        "resolutionPercentage": int(scene.render.resolution_percentage),
        "pixelAspectX": float(scene.render.pixel_aspect_x),
        "pixelAspectY": float(scene.render.pixel_aspect_y),
    }
    crt_objects = accepted_crt_objects()
    crt_points = [point for obj in crt_objects for point in object_bound_points_world(obj)]
    crt_centre = Vector(
        (
            (min(point.x for point in crt_points) + max(point.x for point in crt_points)) * 0.5,
            (min(point.y for point in crt_points) + max(point.y for point in crt_points)) * 0.5,
            (min(point.z for point in crt_points) + max(point.z for point in crt_points)) * 0.5,
        )
    )
    rear_objects_by_name: dict[str, bpy.types.Object] = {}
    for collection_name in ("CRT_REAR_SERVICE_DETAIL", "CRT_CABLE_CONNECTION", "CRT_SIDE_VENT_DETAIL"):
        collection = bpy.data.collections.get(collection_name)
        if collection is not None:
            for obj in collection.all_objects:
                if obj.type in {"MESH", "CURVE", "SURFACE", "META", "FONT"} and not obj.hide_render:
                    rear_objects_by_name[obj.name] = obj
    rear_objects = [rear_objects_by_name[name] for name in sorted(rear_objects_by_name)]
    rear_points = [point for obj in rear_objects for point in object_bound_points_world(obj)]
    screen_objects_by_name: dict[str, bpy.types.Object] = {}
    for collection_name in ("REFINED_CRT_ASSEMBLY", "PHASE3R_CRT_SCREEN_REPAIR"):
        collection = bpy.data.collections.get(collection_name)
        if collection is not None:
            for obj in collection.all_objects:
                if obj.type in {"MESH", "CURVE", "SURFACE", "META", "FONT"} and any(token in obj.name.lower() for token in ("phosphor", "screenglass", "screen_glass")):
                    screen_objects_by_name[obj.name] = obj
    screen_objects = [screen_objects_by_name[name] for name in sorted(screen_objects_by_name)]
    q_plane = bpy.data.objects.get("Phase4R1V2_ExactQuantumQ_PicturePlane")
    screen_points = [point for obj in screen_objects for point in object_bound_points_world(obj)]
    if q_plane is not None:
        screen_points.extend(object_bound_points_world(q_plane))
    mouth = bpy.data.objects.get("P4R1V2_PerimeterCableServiceMouth")
    mouth_points = [] if mouth is None else object_bound_points_world(mouth)
    output: dict[str, Any] = {}
    for family, spec in cfg.CABLE_FAMILIES.items():
        expected_resolution = cfg.PROJECTION_RESOLUTIONS[family]
        scene.render.resolution_x = int(expected_resolution[0])
        scene.render.resolution_y = int(expected_resolution[1])
        scene.render.resolution_percentage = 100
        scene.render.pixel_aspect_x = 1.0
        scene.render.pixel_aspect_y = 1.0
        effective_resolution = {
            "resolutionX": int(scene.render.resolution_x),
            "resolutionY": int(scene.render.resolution_y),
            "resolutionPercentage": int(scene.render.resolution_percentage),
            "pixelAspectX": float(scene.render.pixel_aspect_x),
            "pixelAspectY": float(scene.render.pixel_aspect_y),
        }
        resolution_valid = effective_resolution == {
            "resolutionX": int(expected_resolution[0]),
            "resolutionY": int(expected_resolution[1]),
            "resolutionPercentage": 100,
            "pixelAspectX": 1.0,
            "pixelAspectY": 1.0,
        }
        for selected, selected_spec in cfg.CABLE_FAMILIES.items():
            bpy.data.collections[selected_spec["collection"]].hide_render = selected != family
        camera = bpy.data.objects[cfg.CAMERAS[family]]
        scene.camera = camera
        scene.frame_set(1)
        bpy.context.view_layer.update()
        sheath = bpy.data.objects[f"Phase4R1V2_{family.title()}_ContinuousGraphiteSheath"]
        points = curve_points_world(sheath)
        spiral_start = int(sheath["phase4r1v2_spiral_start_index"])
        spiral_end = int(sheath["phase4r1v2_spiral_end_index"])
        floor_start = int(sheath["phase4r1v2_floor_start_index"])
        complete = projection_record(scene, camera, points)
        spiral = projection_record(scene, camera, points[spiral_start : spiral_end + 1])
        lead_points = points[floor_start : spiral_start + 1]
        lead = projection_record(scene, camera, lead_points)
        lead_projections = [world_to_camera_view(scene, camera, point) for point in lead_points]
        visible_lead_local_indices = [
            index
            for index, sample in enumerate(lead_projections)
            if sample.z > 0.0 and 0.0 <= sample.x <= 1.0 and 0.0 <= sample.y <= 1.0
        ]
        lead_visible_suffix = (
            bool(visible_lead_local_indices)
            and visible_lead_local_indices == list(range(visible_lead_local_indices[0], len(lead_points)))
            and visible_lead_local_indices[-1] == len(lead_points) - 1
        )
        visible_lead_arc_length = 0.0 if not lead_visible_suffix else polyline_length(lead_points[visible_lead_local_indices[0] :])
        crt = projection_record(scene, camera, crt_points)
        screen = projection_record(scene, camera, screen_points)
        service_mouth = projection_record(scene, camera, mouth_points)
        forward = camera.matrix_world.to_quaternion() @ Vector((0.0, 0.0, -1.0))
        downward_pitch = math.degrees(math.asin(max(-1.0, min(1.0, -forward.z))))
        frame1_lens = float(camera.data.lens)
        route_source_projection = world_to_camera_view(scene, camera, points[0])
        source_offscreen_treatment = route_source_projection.z > 0.0 and not (0.0 <= route_source_projection.x <= 1.0 and 0.0 <= route_source_projection.y <= 1.0)
        offscreen_source_causality = {
            "sourceOriginIntentionallyOffscreen": source_offscreen_treatment,
            "visibleLeadLocalPointIndices": visible_lead_local_indices,
            "visibleLeadGlobalPointRange": None if not visible_lead_local_indices else [floor_start + visible_lead_local_indices[0], floor_start + visible_lead_local_indices[-1]],
            "visibleLeadPointCount": len(visible_lead_local_indices),
            "rawVisibleLeadPointFraction": lead["visibleFraction"],
            "visibleLeadFormsOneContiguousSuffix": lead_visible_suffix,
            "visibleSuffixTouchesExactPreservedSpiralStart": lead_visible_suffix and visible_lead_local_indices[-1] == len(lead_points) - 1,
            "visibleLeadArcLengthMeters": round(visible_lead_arc_length, 8),
            "requiredMinimumVisibleLeadArcLengthMeters": 2.0,
            "spiralStartGlobalIndex": spiral_start,
            "spiralStartWorldMeters": [round(float(value), 8) for value in points[spiral_start]],
            "leadApproachTangentControlMeters": float(sheath.get("phase4r1v2_lead_approach_tangent_control_m", cfg.LEAD_APPROACH_TANGENT_CONTROL_M[family])),
        }
        lead_understood = (
            spiral["visibleFraction"] >= 0.90
            and complete["visibleFraction"] >= 0.62
            and crt["visibleFraction"] >= 0.90
            and source_offscreen_treatment
            and lead_visible_suffix
            and visible_lead_arc_length + 1e-9 >= 2.0
        )
        recovered_lens_authorities = {"desktop": 25.3, "mobile": 74.0, "landscape": 20.0}
        recovered_lens = recovered_lens_authorities[family]
        later: dict[str, Any] = {}
        for frame in (165, 285):
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            later[str(frame)] = {
                "crt": projection_record(scene, camera, crt_points),
                "rearMass": projection_record(scene, camera, rear_points),
                "screen": projection_record(scene, camera, screen_points),
                "cabinetCentreNdc": [round(float(value), 8) for value in world_to_camera_view(scene, camera, crt_centre)],
                "cameraWorldMeters": [round(float(value), 8) for value in camera.matrix_world.translation],
            }
        rear_165 = later["165"]
        arrival_285 = later["285"]
        rear_165_valid = (
            rear_165["rearMass"]["visibleFraction"] >= 0.25
            and rear_165["crt"]["visibleFraction"] >= 0.90
            and rear_165["crt"]["safeMargin"] is not None
            and rear_165["crt"]["safeMargin"] >= 0.0
        )
        arrival_bounds = arrival_285["crt"]["ndcBounds"]
        left_overscan = float("inf") if arrival_bounds is None else max(0.0, -float(arrival_bounds[0]))
        right_overscan = float("inf") if arrival_bounds is None else max(0.0, float(arrival_bounds[2]) - 1.0)
        overscan_difference = abs(left_overscan - right_overscan)
        centre_ndc = arrival_285["cabinetCentreNdc"]
        cabinet_centre_safe = centre_ndc[2] > 0.0 and 0.0 <= centre_ndc[0] <= 1.0 and 0.0 <= centre_ndc[1] <= 1.0
        screen_fully_safe = arrival_285["screen"]["visibleFraction"] >= 0.999999 and arrival_285["screen"]["safeMargin"] is not None and arrival_285["screen"]["safeMargin"] >= 0.0
        close_arrival_coverage = {
            "physicalCrtVisibleFraction": arrival_285["crt"]["visibleFraction"],
            "physicalCrtRawNdcBounds": arrival_bounds,
            "leftOverscanNormalized": round(left_overscan, 8),
            "rightOverscanNormalized": round(right_overscan, 8),
            "leftRightOverscanDifferenceNormalized": round(overscan_difference, 8),
            "maximumPerSideOverscanNormalized": 0.012,
            "maximumOverscanAsymmetryNormalized": 0.002,
            "screenFullyVisibleAndSafe": screen_fully_safe,
            "screenProjection": arrival_285["screen"],
            "cabinetCentreNdc": centre_ndc,
            "cabinetCentreSafe": cabinet_centre_safe,
            "nativeSparseArrivalProofRequired": family == "mobile",
            "sourceStageNativeVisualStatus": "DEFERRED" if family == "mobile" else "NOT_REQUIRED",
        }
        if family == "mobile":
            arrival_285_valid = (
                arrival_285["crt"]["visibleFraction"] >= 0.98
                and left_overscan <= 0.012
                and right_overscan <= 0.012
                and overscan_difference <= 0.002
                and screen_fully_safe
                and cabinet_centre_safe
            )
        else:
            arrival_285_valid = (
                arrival_285["crt"]["visibleFraction"] >= 0.999999
                and arrival_285["crt"]["safeMargin"] is not None
                and arrival_285["crt"]["safeMargin"] >= 0.0
                and screen_fully_safe
                and cabinet_centre_safe
            )
        close_arrival_coverage["sourceGeometryPasses"] = arrival_285_valid
        opening_valid = (
            resolution_valid
            and
            complete["visibleFraction"] >= 0.62
            and spiral["visibleFraction"] >= 0.90
            and crt["visibleFraction"] >= 0.90
            and crt["safeMargin"] is not None
            and crt["safeMargin"] >= 0.01
            and spiral["safeMargin"] is not None
            and spiral["safeMargin"] >= -0.04
            and lead_understood
            and abs(frame1_lens - recovered_lens) <= 1e-4
            and rear_165_valid
            and arrival_285_valid
        )
        output[family] = {
            "status": "PASS" if opening_valid else "FAIL",
            "projectionResolution": {"authority": list(expected_resolution), "effective": effective_resolution, "passes": resolution_valid, "purpose": "world-to-camera projection audit only; final preview output uses cfg.PREVIEW_RESOLUTIONS"},
            "frame1": {
                "completeCable": complete,
                "completeSpiral": spiral,
                "perimeterLead": lead,
                "crt": crt,
                "screen": screen,
                "serviceMouth": service_mouth,
                "routeSourceNdc": [round(float(route_source_projection.x), 8), round(float(route_source_projection.y), 8), round(float(route_source_projection.z), 8)],
                "sourceOriginIntentionallyOffscreen": source_offscreen_treatment,
                "leadUnderstood": lead_understood,
                "offscreenSourceCausality": offscreen_source_causality,
                "downwardPitchDegrees": round(downward_pitch, 8),
                "cameraLensMillimeters": round(frame1_lens, 8),
                "recoveredLensAuthorityMillimeters": recovered_lens,
                "crtVerticalOccupancyDescriptive": crt["verticalOccupancy"],
                "screenVerticalOccupancy": screen["verticalOccupancy"],
                "screenToCrtVerticalOccupancyRatio": round(screen["verticalOccupancy"] / max(crt["verticalOccupancy"], 1e-12), 8),
            },
            "laterRearComposition": later,
            "laterCompositionGates": {"frame165RearMassAndCrt": rear_165_valid, "frame285CloseArrivalGeometry": arrival_285_valid},
            "closeArrivalCoverage": close_arrival_coverage,
            "requirements": {"minimumCompleteCableVisibleFraction": 0.62, "minimumSpiralVisibleFraction": 0.90, "minimumVisibleLeadArcLengthMeters": 2.0, "visibleLeadMustBeContiguousSuffixTouchingSpiralStart": True, "minimumCrtVisibleFraction": 0.90, "recoveredLensAuthorityMillimeters": recovered_lens, "crtAndScreenOccupanciesAreDescriptiveNotInventedAcceptanceBounds": True, "frame165MinimumRearMassVisibleFraction": 0.25, "mobileFrame285MinimumPhysicalCrtVisibleFraction": 0.98, "mobileFrame285MaximumPerSideOverscanNormalized": 0.012, "mobileFrame285MaximumOverscanAsymmetryNormalized": 0.002, "frame285ScreenAndCabinetCentreMustBeFullySafe": True},
        }
    for family, spec in cfg.CABLE_FAMILIES.items():
        bpy.data.collections[spec["collection"]].hide_render = family != "desktop"
    scene.camera = bpy.data.objects[cfg.CAMERAS["desktop"]]
    scene.frame_set(1)
    scene.render.resolution_x = prior_render_geometry["resolutionX"]
    scene.render.resolution_y = prior_render_geometry["resolutionY"]
    scene.render.resolution_percentage = prior_render_geometry["resolutionPercentage"]
    scene.render.pixel_aspect_x = prior_render_geometry["pixelAspectX"]
    scene.render.pixel_aspect_y = prior_render_geometry["pixelAspectY"]
    return output


def audit_scene() -> dict[str, Any]:
    checks: list[dict[str, Any]] = []

    def check(name: str, passed: bool, evidence: Any) -> None:
        checks.append({"name": name, "status": "PASS" if passed else "FAIL", "evidence": evidence})

    source_sha = sha256(cfg.RECOVERED_SOURCE)
    check("recovered-source-authority", source_sha == cfg.RECOVERED_SOURCE_SHA256, source_sha)

    screen_spill_suppression = screen_spill_suppression_audit()
    check("phase3-screen-spill-object-only-render-suppression", screen_spill_suppression["passes"], screen_spill_suppression)
    service_mouth_geometry = service_mouth_geometry_audit()
    check("coaxial-annular-service-mouth-geometry", service_mouth_geometry["passes"], service_mouth_geometry)
    hall_visual_authority = hall_visual_authority_audit()
    check("exact-global-hall-visual-authority", hall_visual_authority["passes"], hall_visual_authority)

    distribution = bpy.data.collections.get("PHASE4R1_DISTRIBUTION_SOURCE")
    distribution_objects = [] if distribution is None else sorted(obj.name for obj in distribution.objects)
    retained = sorted(set(distribution_objects) & set(cfg.RETAINED_OVERHEAD_SOURCE_OBJECTS))
    hidden_distribution = sorted(name for name in distribution_objects if name not in cfg.RETAINED_OVERHEAD_SOURCE_OBJECTS)
    actually_hidden = sorted(name for name in hidden_distribution if bpy.data.objects[name].hide_render)
    check("exactly-34-central-hardware-objects-hidden", len(hidden_distribution) == 34 and actually_hidden == hidden_distribution, {"count": len(hidden_distribution), "objects": hidden_distribution})
    check("only-four-subdued-overhead-source-shadow-objects-retained", retained == sorted(cfg.RETAINED_OVERHEAD_SOURCE_OBJECTS), retained)

    overlay_audit: dict[str, Any] = {}
    overlay_total = 0
    for name in cfg.MUSEUM_OVERLAY_COLLECTIONS:
        collection = bpy.data.collections.get(name)
        count = 0 if collection is None else len(collection.all_objects)
        hidden = collection is None or collection.hide_render
        overlay_audit[name] = {"objectCount": count, "hiddenRender": hidden}
        overlay_total += count
    check("museum-overlays-hidden", all(row["hiddenRender"] for row in overlay_audit.values()), {"collections": overlay_audit, "objectCount": overlay_total})

    pruned_collections = ("PHASE4R1_HALL_MACHINERY", "PHASE4R1_HALL_OPERATIONAL_DETAILS", "PHASE4R1_HALL_LIGHTING", "PHASE4R1_CABLE_LOCAL_RESPONSE_LIGHTS")
    check("clutter-and-white-panel-collections-hidden", all(bpy.data.collections.get(name) is None or bpy.data.collections[name].hide_render for name in pruned_collections), list(pruned_collections))

    active_families = [family for family, spec in cfg.CABLE_FAMILIES.items() if not bpy.data.collections[spec["collection"]].hide_render]
    check("one-active-cable-family", active_families == ["desktop"], active_families)
    cable_audits: dict[str, Any] = {}
    for family, spec in cfg.CABLE_FAMILIES.items():
        sheath = bpy.data.objects.get(f"Phase4R1V2_{family.title()}_ContinuousGraphiteSheath")
        if sheath is None:
            cable_audits[family] = {"status": "FAIL", "missing": True}
            check(f"{family}-cable-present", False, None)
            continue
        points = curve_points_world(sheath)
        one_spline = len(sheath.data.splines) == 1
        bend = min_bend(points)
        clearance = physical_self_clearance(points)
        join_indices = [int(value) for value in sheath.get("phase4r1v2_dense_join_indices", [])]
        join_windows: list[dict[str, Any]] = []
        for join_index in join_indices:
            start = max(1, join_index - 12)
            end = min(len(points) - 2, join_index + 12)
            candidates = [(circumradius(points[index - 1], points[index], points[index + 1]), index) for index in range(start, end + 1)]
            radius, radius_index = min(candidates, key=lambda item: item[0])
            join_windows.append(
                {
                    "joinIndex": join_index,
                    "sampleWindow": [start, end],
                    "minimumRadiusMeters": round(float(radius), 8),
                    "minimumRadiusSampleIndex": radius_index,
                    "requiredMinimumMeters": round(cfg.CABLE_DIAMETER_M * 3.0, 8),
                    "passes": radius + 1e-9 >= cfg.CABLE_DIAMETER_M * 3.0,
                }
            )
        dense_join_audit = {
            "joinIndices": join_indices,
            "includesPreservedSpiralToTailSeam": int(sheath["phase4r1v2_spiral_end_index"]) in join_indices,
            "includesMobileFloorLeadTopologySeams": family != "mobile" or all(int(index) in join_indices for index in (cfg.MOBILE_FLOOR_LEAD_AUTHORITY["leadGlobalStartIndex"], cfg.MOBILE_FLOOR_LEAD_AUTHORITY["waypointGlobalIndex"], cfg.MOBILE_FLOOR_LEAD_AUTHORITY["spiralStartGlobalIndex"])),
            "windows": join_windows,
            "minimumJoinWindowRadiusMeters": round(min((row["minimumRadiusMeters"] for row in join_windows), default=0.0), 8),
        }
        dense_join_audit["passes"] = dense_join_audit["includesPreservedSpiralToTailSeam"] and dense_join_audit["includesMobileFloorLeadTopologySeams"] and bool(join_windows) and all(row["passes"] for row in join_windows)
        profile = sheath.data.bevel_object if sheath.data.bevel_mode == "OBJECT" else None
        evaluated = sheath.evaluated_get(bpy.context.evaluated_depsgraph_get())
        evaluated_mesh = evaluated.to_mesh()
        try:
            evaluated_vertices = [evaluated.matrix_world @ vertex.co for vertex in evaluated_mesh.vertices]
            lowest_surface_z = min((point.z for point in evaluated_vertices), default=float("inf"))
            contact_vertex_count = sum(1 for point in evaluated_vertices if point.z <= lowest_surface_z + 0.00035)
        finally:
            evaluated.to_mesh_clear()
        contact_profile = {
            "bevelMode": sheath.data.bevel_mode,
            "bevelObject": None if profile is None else profile.name,
            "twistMode": sheath.data.twist_mode,
            "authoredFlatWidthMeters": None if profile is None else float(profile.get("phase4r1v2_profile_flat_width_m", 0.0)),
            "authoredBottomOffsetMeters": None if profile is None else float(profile.get("phase4r1v2_profile_bottom_offset_m", 0.0)),
            "evaluatedLowestSurfaceZMeters": round(float(lowest_surface_z), 8),
            "evaluatedContactVertexCount": contact_vertex_count,
            "floorContactToleranceMeters": 0.003,
        }
        contact_profile["passes"] = (
            profile is not None
            and sheath.data.twist_mode == "Z_UP"
            and contact_profile["authoredFlatWidthMeters"] >= 0.02
            and -0.003 <= lowest_surface_z <= 0.003
            and contact_vertex_count >= 20
        )
        floor_start = int(sheath["phase4r1v2_floor_start_index"])
        floor_end = int(sheath["phase4r1v2_floor_end_index"])
        terminal_lift_start = int(sheath["phase4r1v2_terminal_lift_start_index"])
        axial_corridor_start_index = int(sheath["phase4r1v2_axial_corridor_start_index"])
        spiral_start = int(sheath["phase4r1v2_spiral_start_index"])
        spiral_end = int(sheath["phase4r1v2_spiral_end_index"])
        spiral_points = points[spiral_start : spiral_end + 1]
        prefix_turns = polar_angular_travel(spiral_points)
        tail_segments = json.loads(str(sheath["phase4r1v2_tail_segment_authority_json"]))
        floor_transition_segments: list[dict[str, Any]] = []
        floor_transition_absolute_turns = 0.0
        floor_transition_signed_turns = 0.0
        if family == "mobile":
            for segment in tail_segments:
                if not str(segment["kind"]).startswith("mobile-lsl-"):
                    continue
                start_index = spiral_end + int(segment["startIndex"])
                end_index = spiral_end + int(segment["endIndex"])
                metrics = polar_angular_travel(points[start_index : end_index + 1])
                floor_transition_absolute_turns += metrics["absoluteTurns"]
                floor_transition_signed_turns += metrics["signedTurns"]
                floor_transition_segments.append(
                    {
                        "kind": segment["kind"],
                        "globalPointRange": [start_index, end_index],
                        "pointCount": end_index - start_index + 1,
                        "absoluteTurns": round(metrics["absoluteTurns"], 12),
                        "signedTurns": round(metrics["signedTurns"], 12),
                    }
                )
        finished_absolute_turns = prefix_turns["absoluteTurns"] + floor_transition_absolute_turns
        finished_signed_turns = prefix_turns["signedTurns"] + floor_transition_signed_turns
        prefix_coordinate_authority = rounded_coordinate_authority(spiral_points)
        if family == "mobile":
            mobile_expected = cfg.MOBILE_REFINED_ROUTE
            mobile_scene_authority = json.loads(str(sheath["phase4r1v2_mobile_refined_route_authority_json"]))
            mobile_lead_expected = cfg.MOBILE_FLOOR_LEAD_AUTHORITY
            scene_lead_authority = mobile_scene_authority.get("floorLeadTopologyAuthority", {})
            custom_lead_authority_raw = sheath.get("phase4r1v2_mobile_floor_lead_topology_authority_json", "")
            try:
                custom_lead_authority = json.loads(str(custom_lead_authority_raw)) if custom_lead_authority_raw else {}
            except (TypeError, ValueError, json.JSONDecodeError):
                custom_lead_authority = {}
            expected_global_indices = {
                "sourceLeadPointCountThroughSpiralStartInclusive": int(mobile_expected["sourceLeadPointCountThroughSpiralStartInclusive"]),
                "sourceLeadPointCountStrictlyBeforeSpiralStart": int(mobile_expected["sourceLeadPointCountStrictlyBeforeSpiralStart"]),
                "spiralStart": int(mobile_expected["sourceLeadPointCountStrictlyBeforeSpiralStart"]),
                "preservedPrefixEnd": int(mobile_expected["sourceLeadPointCountStrictlyBeforeSpiralStart"]) + int(mobile_expected["preservedPrefixPointCount"]) - 1,
                "joinIndices": [int(value) for value in mobile_expected["expectedGlobalJoinIndices"]],
                "fullRoutePointCount": int(mobile_expected["expectedFullRoutePointCount"]),
            }
            scene_terminal = mobile_scene_authority.get("terminalAuthority", {})
            scene_global_indices = mobile_scene_authority.get("globalIndexAuthority", {})
            expected_analytic_lengths = [float(value) for value in mobile_expected["floorTransitionAnalyticPrimitiveLengthsMeters"]]
            blender_realization_tolerance = float(mobile_expected["requiredMaximumBlenderRealizationErrorMeters"])
            floor_transition_turn_tolerance = float(mobile_expected["requiredMaximumFloorTransitionAbsoluteTurnRealizationErrorTurns"])
            expected_floor_transition_absolute_turns = float(mobile_expected["floorTransitionExpectedAbsoluteTurns"])
            floor_transition_absolute_turn_error = abs(floor_transition_absolute_turns - expected_floor_transition_absolute_turns)
            live_lead_coordinate_authority = rounded_coordinate_authority_at_precision(points[floor_start : spiral_start + 1], 12)
            live_route_coordinate_authorities = {
                "sourceServiceTransition": rounded_coordinate_authority_at_precision(points[: floor_start + 1], 12),
                "floorLead": live_lead_coordinate_authority,
                "preservedSpiralAndTail": rounded_coordinate_authority_at_precision(points[spiral_start:], 12),
                "fullRoute": rounded_coordinate_authority_at_precision(points, 12),
            }
            expected_lead_global_indices = {
                "floorEntry": int(mobile_lead_expected["leadGlobalStartIndex"]),
                "waypoint": int(mobile_lead_expected["waypointGlobalIndex"]),
                "spiralStart": int(mobile_lead_expected["spiralStartGlobalIndex"]),
                "leadPointCount": int(mobile_lead_expected["deduplicatedLeadPointCount"]),
                "routePointCount": int(mobile_expected["expectedFullRoutePointCount"]),
                "joinIndices": [int(value) for value in mobile_expected["expectedGlobalJoinIndices"]],
            }
            expected_lead_coordinate_hashes = {
                "sourceServiceTransition": mobile_lead_expected["sourceServiceTransitionCoordinateSha256"],
                "floorLead": mobile_lead_expected["leadCoordinateSha256"],
                "preservedSpiralAndTail": mobile_lead_expected["preservedSpiralAndTailCoordinateSha256"],
                "fullRoute": mobile_lead_expected["fullRouteCoordinateSha256"],
            }
            live_lead_coordinate_hash_checks = {
                key: live_route_coordinate_authorities[key]["sha256"] == expected
                for key, expected in expected_lead_coordinate_hashes.items()
            }
            scene_lead_controls = scene_lead_authority.get("controlPointsWorldMeters", {})
            scene_first_controls = scene_lead_controls.get("firstCubic", ())
            scene_second_controls = scene_lead_controls.get("secondCubic", ())
            expected_first_controls = mobile_lead_expected["firstCubicControlsWorldMeters"]
            expected_second_controls = mobile_lead_expected["secondCubicControlsWorldMeters"]
            first_controls_match = (
                isinstance(scene_first_controls, (list, tuple))
                and len(scene_first_controls) == 4
                and all(
                    finite_vector3_euclidean_within(actual, expected, blender_realization_tolerance)
                    for actual, expected in zip(scene_first_controls, expected_first_controls)
                )
            )
            second_controls_match = (
                isinstance(scene_second_controls, (list, tuple))
                and len(scene_second_controls) == 4
                and all(
                    finite_vector3_euclidean_within(actual, expected, blender_realization_tolerance)
                    for actual, expected in zip(scene_second_controls, expected_second_controls)
                )
            )
            endpoint_realization_errors = scene_lead_authority.get("endpointRealizationErrorsMeters", {})
            expected_endpoint_error_keys = {"floorEntryMeters", "sharedWaypointMeters", "spiralStartMeters"}
            waypoint_global_index = int(mobile_lead_expected["waypointGlobalIndex"])
            sampled_waypoint_left = points[waypoint_global_index] - points[waypoint_global_index - 1]
            sampled_waypoint_right = points[waypoint_global_index + 1] - points[waypoint_global_index]
            sampled_waypoint_tangent_dot = (
                sampled_waypoint_left.normalized().dot(sampled_waypoint_right.normalized())
                if sampled_waypoint_left.length > 1e-12 and sampled_waypoint_right.length > 1e-12
                else -1.0
            )
            expected_coordinate_authority_checks = {key: True for key in expected_lead_coordinate_hashes}
            expected_preserved_invariants = {
                "sourceServiceTransitionUnchanged": True,
                "preservedSpiralAndTailUnchanged": True,
                "fullRouteMatchesStage2Authority": True,
            }
            expected_stage2_verification_authority = {
                "externalRecoveryId": mobile_lead_expected["stage2EvidenceExternalRecoveryId"],
                "evidenceEnvelopeBytes": int(mobile_lead_expected["stage2EvidenceEnvelopeBytes"]),
                "evidenceEnvelopeSha256": mobile_lead_expected["stage2EvidenceEnvelopeSha256"],
                "minimumClearanceMeters": float(mobile_lead_expected["stage2VerifiedMinimumClearanceMeters"]),
                "minimumBendRadiusMeters": float(mobile_lead_expected["stage2VerifiedMinimumBendRadiusMeters"]),
                "contactCount": int(mobile_lead_expected["stage2VerifiedContactCount"]),
                "properPlanarCrossingCount": int(mobile_lead_expected["stage2VerifiedProperPlanarCrossingCount"]),
                "routePointCount": int(mobile_lead_expected["stage2VerifiedRoutePointCount"]),
                "minimumClearanceSegmentPair": [int(value) for value in mobile_lead_expected["stage2VerifiedMinimumClearanceSegmentPair"]],
            }
            route_contract_checks = {
                "prefixPointCount": len(spiral_points) == int(mobile_expected["preservedPrefixPointCount"]),
                "prefixBytes": prefix_coordinate_authority["bytes"] == int(mobile_expected["preservedPrefixRoundedCoordinateBytes"]),
                "prefixSha256": prefix_coordinate_authority["sha256"] == mobile_expected["preservedPrefixRoundedCoordinateSha256"],
                "floorTransitionType": mobile_scene_authority.get("floorTransitionType") == mobile_expected["floorTransitionType"],
                "radius": abs(float(mobile_scene_authority.get("radiusMeters", -1.0)) - float(mobile_expected["floorTransitionRadiusMeters"])) <= 1e-12,
                "parameters": all(abs(float(actual) - float(expected)) <= 1e-12 for actual, expected in zip(mobile_scene_authority.get("parameters", ()), mobile_expected["floorTransitionParameters"])) and len(mobile_scene_authority.get("parameters", ())) == 3,
                "analyticPrimitiveLengths": all(abs(float(actual) - expected) <= 1e-12 for actual, expected in zip(mobile_scene_authority.get("analyticPrimitiveLengthsMeters", ()), expected_analytic_lengths)) and len(mobile_scene_authority.get("analyticPrimitiveLengthsMeters", ())) == 3,
                "analyticTotalLength": abs(float(mobile_scene_authority.get("analyticTotalLengthMeters", -1.0)) - float(mobile_expected["floorTransitionAnalyticTotalLengthMeters"])) <= 1e-12,
                "analyticEndpointXYError": float(mobile_scene_authority.get("analyticEndpointXYErrorMeters", float("inf"))) <= float(mobile_expected["requiredMaximumAnalyticEndpointXYErrorMeters"]),
                "analyticEndpointXYErrorThreshold": float(mobile_scene_authority.get("requiredMaximumAnalyticEndpointXYErrorMeters", -1.0)) == float(mobile_expected["requiredMaximumAnalyticEndpointXYErrorMeters"]),
                "analyticTerminalHeading": float(mobile_scene_authority.get("analyticTerminalHeadingDot", -1.0)) >= 0.999999999,
                "blenderRealizationErrorThreshold": finite_scalar_abs_delta_within(mobile_scene_authority.get("requiredMaximumBlenderRealizationErrorMeters"), blender_realization_tolerance, 0.0),
                "floorTransitionAbsoluteTurns": finite_scalar_abs_delta_within(mobile_scene_authority.get("floorTransitionAbsoluteTurns"), floor_transition_absolute_turns, 1e-12),
                "floorTransitionExpectedAbsoluteTurns": finite_scalar_abs_delta_within(mobile_scene_authority.get("expectedFloorAbsoluteTurns"), expected_floor_transition_absolute_turns, 0.0),
                "floorTransitionAbsoluteTurnRealizationError": finite_scalar_abs_delta_within(mobile_scene_authority.get("floorTransitionAbsoluteTurnRealizationErrorTurns"), floor_transition_absolute_turn_error, 1e-12),
                "floorTransitionAbsoluteTurnRealizationErrorThreshold": finite_scalar_abs_delta_within(mobile_scene_authority.get("requiredMaximumFloorTransitionAbsoluteTurnRealizationErrorTurns"), floor_transition_turn_tolerance, 0.0),
                "sampleSchedule": mobile_scene_authority.get("inclusivePrimitiveSampleCounts") == [int(value) for value in mobile_expected["floorTransitionInclusivePrimitiveSampleCounts"]],
                "deduplicatedPointCount": int(mobile_scene_authority.get("deduplicatedPointCount", -1)) == int(mobile_expected["floorTransitionExpectedSampledPointCount"]),
                "sampledLength": finite_scalar_abs_delta_within(mobile_scene_authority.get("sampledLengthMeters"), mobile_expected["floorTransitionExpectedSampledLengthMeters"], blender_realization_tolerance),
                "maximumChord": float(mobile_scene_authority.get("maximumChordMeters", float("inf"))) <= float(mobile_expected["floorTransitionMaximumChordMeters"]) + 1e-9,
                "zMinimum": abs(float(mobile_scene_authority.get("sampledMinimumZMeters", -1.0)) - float(mobile_expected["floorTransitionExpectedMinimumZMeters"])) <= 1e-8,
                "zMaximum": abs(float(mobile_scene_authority.get("sampledMaximumZMeters", -1.0)) - float(mobile_expected["floorTransitionExpectedMaximumZMeters"])) <= 1e-8,
                "floorCentreError": float(mobile_scene_authority.get("maximumFloorCentreErrorMeters", float("inf"))) <= float(mobile_expected["floorTransitionMaximumFloorCentreErrorMeters"]) + 1e-8,
                "sampledHermiteLengthBound": finite_scalar_abs_delta_within(mobile_scene_authority.get("zInterpolationSampledTotalLengthMeters"), mobile_expected["floorTransitionExpectedSampledLengthMeters"], blender_realization_tolerance),
                "terminalLiftSamples": int(scene_terminal.get("liftInclusiveSampleCount", -1)) == int(mobile_expected["terminalLiftInclusiveSampleCount"]),
                "terminalAxialSamples": int(scene_terminal.get("axialInclusiveSampleCount", -1)) == int(mobile_expected["axialSeatInclusiveSampleCount"]),
                "terminalControls": finite_vector3_euclidean_within(scene_terminal.get("liftControl1WorldMeters"), mobile_expected["terminalLiftControl1WorldMeters"], blender_realization_tolerance) and finite_vector3_euclidean_within(scene_terminal.get("liftControl2WorldMeters"), mobile_expected["terminalLiftControl2WorldMeters"], blender_realization_tolerance),
                "terminalLiftStart": finite_vector3_euclidean_within(scene_terminal.get("liftStartWorldMeters"), mobile_expected["floorTransitionEndWorldMeters"], blender_realization_tolerance),
                "terminalAxialStart": finite_vector3_euclidean_within(scene_terminal.get("axialSeatStartWorldMeters"), mobile_expected["axialSeatStartWorldMeters"], blender_realization_tolerance),
                "terminalArcLength": finite_scalar_abs_delta_within(scene_terminal.get("sampledArcLengthMeters"), mobile_expected["terminalExpectedSampledLengthMeters"], blender_realization_tolerance),
                "terminalHorizontalSpan": finite_scalar_abs_delta_within(scene_terminal.get("horizontalSpanMeters"), mobile_expected["terminalExpectedHorizontalSpanMeters"], blender_realization_tolerance),
                "terminalRise": abs(float(scene_terminal.get("riseMeters", -1.0)) - float(mobile_expected["terminalExpectedRiseMeters"])) <= 1e-8,
                "axialSeatLength": finite_scalar_abs_delta_within(scene_terminal.get("axialSeatLengthMeters"), mobile_expected["axialSeatLengthMeters"], blender_realization_tolerance),
                "endpointNegativeY": scene_terminal.get("endpointUnitTangent") is not None and Vector(scene_terminal["endpointUnitTangent"]).dot(Vector((0.0, -1.0, 0.0))) >= 0.999999,
                "globalIndices": scene_global_indices == expected_global_indices,
                "livePointCount": len(points) == int(mobile_expected["expectedFullRoutePointCount"]),
                "liveJoinIndices": join_indices == [int(value) for value in mobile_expected["expectedGlobalJoinIndices"]],
                "floorLeadCustomAuthorityMatchesNestedAuthority": custom_lead_authority == scene_lead_authority,
                "floorLeadSchema": scene_lead_authority.get("schema") == mobile_lead_expected["schema"],
                "floorLeadTopology": scene_lead_authority.get("topology") == mobile_lead_expected["topology"],
                "floorLeadStage2CandidateDigest": scene_lead_authority.get("stage2CandidateDigestSha256") == mobile_lead_expected["stage2CandidateDigestSha256"],
                "floorLeadFirstCubicControls": first_controls_match,
                "floorLeadSecondCubicControls": second_controls_match,
                "floorLeadInclusiveSampleCounts": scene_lead_authority.get("inclusiveSampleCounts") == [int(mobile_lead_expected["firstCubicInclusiveSampleCount"]), int(mobile_lead_expected["secondCubicInclusiveSampleCount"])],
                "floorLeadDeduplicatedPointCount": int(scene_lead_authority.get("deduplicatedLeadPointCount", -1)) == int(mobile_lead_expected["deduplicatedLeadPointCount"]),
                "floorLeadWaypointLocalIndex": int(scene_lead_authority.get("waypointLeadLocalIndex", -1)) == int(mobile_lead_expected["waypointLeadLocalIndex"]),
                "floorLeadWaypointWorldPosition": finite_vector3_euclidean_within(scene_lead_authority.get("waypointWorldMeters"), mobile_lead_expected["waypointWorldMeters"], blender_realization_tolerance),
                "floorLeadWaypointTangentControl": finite_vector3_euclidean_within(scene_lead_authority.get("waypointTangentControlVectorMeters"), mobile_lead_expected["waypointTangentControlVectorMeters"], blender_realization_tolerance),
                "floorLeadC1Continuity": finite_scalar_abs_delta_within(scene_lead_authority.get("c1ContinuityErrorMeters"), 0.0, blender_realization_tolerance),
                "floorLeadLeftHandleAuthority": finite_scalar_abs_delta_within(scene_lead_authority.get("leftWaypointHandleAuthorityErrorMeters"), 0.0, blender_realization_tolerance),
                "floorLeadRightHandleAuthority": finite_scalar_abs_delta_within(scene_lead_authority.get("rightWaypointHandleAuthorityErrorMeters"), 0.0, blender_realization_tolerance),
                "floorLeadSampledWaypointTangentContinuity": sampled_waypoint_tangent_dot >= 0.999,
                "floorLeadEntryTangent": float(scene_lead_authority.get("entryTangentDotPositiveX", -1.0)) >= 0.999999,
                "floorLeadSpiralApproachTangent": float(scene_lead_authority.get("spiralApproachTangentDot", -1.0)) >= 0.999999,
                "floorLeadEndpointRealizationErrors": set(endpoint_realization_errors) == expected_endpoint_error_keys and all(finite_scalar_abs_delta_within(value, 0.0, blender_realization_tolerance) for value in endpoint_realization_errors.values()),
                "floorLeadGlobalIndices": scene_lead_authority.get("globalIndexAuthority") == expected_lead_global_indices,
                "floorLeadCoordinateMethod": live_lead_coordinate_authority["method"] == mobile_lead_expected["coordinateDigestMethod"],
                "floorLeadCoordinateBytes": live_lead_coordinate_authority["bytes"] == int(mobile_lead_expected["leadCoordinateBytes"]),
                "floorLeadCoordinateHashes": all(live_lead_coordinate_hash_checks.values()),
                "floorLeadSceneCoordinateAuthority": scene_lead_authority.get("leadCoordinateAuthority") == live_lead_coordinate_authority,
                "floorLeadSceneRouteCoordinateAuthorities": scene_lead_authority.get("coordinateAuthorities") == live_route_coordinate_authorities,
                "floorLeadSceneCoordinateAuthorityChecks": scene_lead_authority.get("coordinateAuthorityChecks") == expected_coordinate_authority_checks,
                "floorLeadPreservedInvariants": scene_lead_authority.get("preservedInvariants") == expected_preserved_invariants,
                "floorLeadVerifiedVisibleArcAuthority": finite_scalar_abs_delta_within(scene_lead_authority.get("verifiedVisibleLeadArcLengthMeters"), mobile_lead_expected["verifiedVisibleLeadArcLengthMeters"], 1e-12),
                "floorLeadRequiredVisibleArcAuthority": finite_scalar_abs_delta_within(scene_lead_authority.get("requiredMinimumVisibleLeadArcLengthMeters"), mobile_lead_expected["requiredMinimumVisibleLeadArcLengthMeters"], 0.0),
                "floorLeadStage2VerificationAuthority": scene_lead_authority.get("stage2VerificationAuthority") == expected_stage2_verification_authority,
            }
            mobile_lead_topology_evidence = {
                "sceneAuthority": scene_lead_authority,
                "customPropertyMatchesSceneAuthority": custom_lead_authority == scene_lead_authority,
                "liveCoordinateAuthorities": live_route_coordinate_authorities,
                "liveCoordinateAuthorityChecks": live_lead_coordinate_hash_checks,
                "sampledWaypointTangentDot": sampled_waypoint_tangent_dot,
                "routeContractChecks": {key: value for key, value in route_contract_checks.items() if key.startswith("floorLead")},
            }
            turn_authority_valid = (
                len(spiral_points) == int(mobile_expected["preservedPrefixPointCount"])
                and prefix_coordinate_authority["bytes"] == int(mobile_expected["preservedPrefixRoundedCoordinateBytes"])
                and prefix_coordinate_authority["sha256"] == mobile_expected["preservedPrefixRoundedCoordinateSha256"]
                and prefix_turns["absoluteTurns"] + 1e-9 >= float(mobile_expected["preservedPrefixMinimumAbsoluteTurns"])
                and abs(prefix_turns["absoluteTurns"] - float(mobile_expected["preservedPrefixExpectedAbsoluteTurns"])) <= 1e-7
                and finite_scalar_abs_delta_within(floor_transition_absolute_turns, expected_floor_transition_absolute_turns, floor_transition_turn_tolerance)
                and abs(floor_transition_signed_turns - float(mobile_expected["floorTransitionExpectedSignedTurns"])) <= 1e-7
                and finished_absolute_turns + 1e-9 >= float(mobile_expected["finishedReadableMinimumAbsoluteTurns"])
                and mobile_scene_authority["preservedPrefix"] == prefix_coordinate_authority
                and float(mobile_scene_authority["radiusMeters"]) == float(mobile_expected["floorTransitionRadiusMeters"])
                and all(route_contract_checks.values())
            )
        else:
            mobile_scene_authority = None
            route_contract_checks = None
            mobile_lead_topology_evidence = None
            turn_authority_valid = len(spiral_points) == int(spec["spiral_samples"]) and abs(prefix_turns["absoluteTurns"] - float(spec["turns"])) <= 0.01
        radii = [math.hypot(point.x - cfg.CENTRAL_ZONE_CENTRE_XY[0], point.y - cfg.CENTRAL_ZONE_CENTRE_XY[1]) for point in spiral_points]
        floor_points = points[floor_start : floor_end + 1]
        float_errors = [abs(point.z - cfg.FLOOR_CABLE_CENTRE_Z_M) for point in floor_points]
        terminal_points = points[terminal_lift_start:]
        terminal_length = polyline_length(terminal_points)
        terminal_horizontal_span = math.hypot(terminal_points[-1].x - terminal_points[0].x, terminal_points[-1].y - terminal_points[0].y)
        terminal_maximum_elevation = max(point.z - cfg.FLOOR_CABLE_CENTRE_Z_M for point in terminal_points)
        terminal_maximum_z = max(point.z for point in terminal_points)
        source_transition_points = points[: floor_start + 1]
        source_transition_length = polyline_length(source_transition_points)
        source_transition_horizontal_span = math.hypot(source_transition_points[-1].x - source_transition_points[0].x, source_transition_points[-1].y - source_transition_points[0].y)
        source_transition_y_deviation = max(abs(point.y - source_transition_points[0].y) for point in source_transition_points)
        source_transition_monotonic_descent = all(right.z <= left.z + 1e-8 for left, right in zip(source_transition_points, source_transition_points[1:]))
        origin = bpy.data.objects.get("P4R1V2_PerimeterCableServiceMouth")
        origin_bounds = None if origin is None else bounds_world(origin)
        aperture_transit = service_mouth_aperture_transit(source_transition_points)
        source_transition_supported = (
            aperture_transit["passes"]
            and source_transition_length <= 1.20
            and source_transition_horizontal_span <= 1.00
            and source_transition_y_deviation <= 0.01
            and source_transition_monotonic_descent
            and abs(source_transition_points[-1].z - cfg.FLOOR_CABLE_CENTRE_Z_M) <= 0.003
        )
        floor_supported_indices = {floor_start + index for index, error in enumerate(float_errors) if error <= 0.003}
        terminal_supported = (
            terminal_length <= 0.70
            and terminal_horizontal_span <= 0.70
            and terminal_maximum_elevation <= 0.11
            and min(point.z for point in terminal_points) >= cfg.FLOOR_CABLE_CENTRE_Z_M - 0.003
            and terminal_maximum_z <= points[-1].z + 0.003
            and terminal_lift_start == floor_end
        )
        classifications: list[dict[str, Any]] = []
        unsupported_indices: list[int] = []
        for index, point in enumerate(points):
            if index <= floor_start:
                support_class = "flush-low-wall-service-transition"
                supported = source_transition_supported
            elif index < terminal_lift_start:
                support_class = "physical-floor-contact"
                supported = index in floor_supported_indices
            else:
                support_class = "short-crt-adjacent-terminal-rise"
                supported = terminal_supported
            if not supported:
                unsupported_indices.append(index)
            classifications.append({"index": index, "class": support_class, "supported": supported, "worldMeters": [round(float(value), 8) for value in point]})
        unsupported_runs = 0
        prior_unsupported = False
        unsupported_index_set = set(unsupported_indices)
        for index in range(len(points)):
            unsupported = index in unsupported_index_set
            if unsupported and not prior_unsupported:
                unsupported_runs += 1
            prior_unsupported = unsupported
        unsupported_points = [points[index] for index in unsupported_indices]
        maximum_unsupported_elevation = max((point.z - cfg.FLOOR_CABLE_CENTRE_Z_M for point in unsupported_points), default=0.0)
        maximum_unsupported_horizontal_span = 0.0
        if unsupported_indices:
            run: list[Vector] = []
            previous = None
            for index in unsupported_indices:
                if previous is None or index == previous + 1:
                    run.append(points[index])
                else:
                    maximum_unsupported_horizontal_span = max(maximum_unsupported_horizontal_span, math.hypot(run[-1].x - run[0].x, run[-1].y - run[0].y))
                    run = [points[index]]
                previous = index
            maximum_unsupported_horizontal_span = max(maximum_unsupported_horizontal_span, math.hypot(run[-1].x - run[0].x, run[-1].y - run[0].y))
        support_audit = {
            "perimeterServiceTransition": {"startIndex": 0, "endIndex": floor_start, "pointCount": len(source_transition_points), "arcLengthMeters": round(source_transition_length, 8), "horizontalSpanMeters": round(source_transition_horizontal_span, 8), "maximumYDeviationMeters": round(source_transition_y_deviation, 8), "monotonicDescent": source_transition_monotonic_descent, "apertureTransit": aperture_transit, "serviceMouthBoundsWorldMeters": origin_bounds, "supported": source_transition_supported, "supportedBy": "the 54 mm sheath plus the larger 61 mm rendered current envelope cross all four measured coaxial sleeve/flange aperture planes with fail-closed clearance before one bounded gravity bend to floor contact"},
            "floorContact": {"startIndex": floor_start, "endIndex": terminal_lift_start, "pointCount": len(floor_points), "supportedPointCount": len(floor_supported_indices), "maximumCentreHeightErrorMeters": round(max(float_errors, default=0.0), 8), "supported": len(floor_supported_indices) == len(floor_points)},
            "declaredTerminalLift": {"startIndex": terminal_lift_start, "axialCorridorStartIndex": axial_corridor_start_index, "endIndex": len(points) - 1, "arcLengthMeters": round(terminal_length, 8), "horizontalSpanMeters": round(terminal_horizontal_span, 8), "maximumCentreElevationAboveFloorMeters": round(terminal_maximum_elevation, 8), "maximumCentreZMeters": round(terminal_maximum_z, 8), "supported": terminal_supported, "supportedBy": "one short smooth CRT-adjacent rise into the accepted strain-relief seat; no cradle or freestanding stand"},
            "classifiedPointCount": len(classifications),
            "routePointCount": len(points),
            "unclassifiedUnsupportedPointCount": len(unsupported_indices),
            "unsupportedPointIndices": unsupported_indices,
            "unsupportedRunCount": unsupported_runs,
            "maximumUnsupportedElevationMeters": round(maximum_unsupported_elevation, 8),
            "maximumUnsupportedHorizontalSpanMeters": round(maximum_unsupported_horizontal_span, 8),
            "pointClassifications": classifications,
        }
        support_audit["passes"] = len(classifications) == len(points) and not unsupported_indices and source_transition_supported and len(floor_supported_indices) == len(floor_points) and terminal_supported
        endpoint = points[-1]
        rib = bpy.data.objects["CRT_StrainReliefRib_06"]
        rib_bounds = bounds_world(rib)
        expected_endpoint = Vector((rib.matrix_world.translation.x, rib_bounds["y"][1] + 0.0025, rib.matrix_world.translation.z))
        axis_error = math.hypot(endpoint.x - rib.matrix_world.translation.x, endpoint.z - rib.matrix_world.translation.z)
        endpoint_error = (endpoint - expected_endpoint).length
        end_tangent = (points[-1] - points[-2]).normalized()
        end_tangent_dot = end_tangent.dot(Vector((0.0, -1.0, 0.0)))
        corridor_points = [points[-1]]
        corridor_length = 0.0
        required_corridor_length = float(cfg.AXIAL_SEAT_LENGTHS_M[family])
        for index in range(len(points) - 2, -1, -1):
            corridor_length += (points[index + 1] - points[index]).length
            corridor_points.append(points[index])
            if corridor_length + 1e-9 >= required_corridor_length:
                break
        corridor_axis_error = max(
            math.hypot(point.x - expected_endpoint.x, point.z - expected_endpoint.z)
            for point in corridor_points
        )
        corridor_tangent_dots = [
            (left - right).normalized().dot(Vector((0.0, -1.0, 0.0)))
            for left, right in zip(corridor_points, corridor_points[1:])
            if (left - right).length > 1e-10
        ]
        corridor_min_tangent_dot = min(corridor_tangent_dots, default=-1.0)
        origin_error = float("inf") if origin is None else (points[0] - origin.matrix_world.translation).length
        origin_tangent = (points[1] - points[0]).normalized()
        origin_tangent_dot = origin_tangent.dot(Vector((1.0, 0.0, 0.0)))
        axial_overlap = rib_bounds["y"][1] - (endpoint.y - cfg.CABLE_DIAMETER_M * 0.5)
        intersections = clearance["physicalContactOrCollisionCount"]
        intersection_pairs = [row["segments"] for row in clearance["physicalContactOrCollisionPairs"]]
        floating_sections = unsupported_runs
        record = {
            "status": "PASS" if one_spline and bend["passes"] and dense_join_audit["passes"] and turn_authority_valid and contact_profile["passes"] and support_audit["passes"] and clearance["status"] == "PASS" and intersections == 0 and floating_sections == 0 and axis_error <= 1e-6 and endpoint_error <= 1e-6 and end_tangent_dot >= 0.999999 and corridor_length + 1e-9 >= required_corridor_length and corridor_axis_error <= 1e-6 and corridor_min_tangent_dot >= 0.999999 and origin_error <= 1e-6 and origin_tangent_dot >= 0.995 and axial_overlap > 0.0 else "FAIL",
            "oneContinuousCable": one_spline,
            "pointCount": len(points),
            "totalLengthMeters": round(polyline_length(points), 6),
            "visibleTurnCount": round(finished_absolute_turns, 6),
            "outerRadiusMeters": round(radii[0], 6),
            "innerRadiusMeters": round(radii[-1], 6),
            "spiralAngularTravelDegrees": round(math.degrees(prefix_turns["signedRadians"]), 6),
            "spiralMeasurementSource": {"startIndex": spiral_start, "endIndex": spiral_end, "pointCount": len(spiral_points), "preservedRecoveredObject": spec["source_object"], "roundedCoordinateAuthority": prefix_coordinate_authority},
            "turnEvidence": {
                "semantics": "cumulative absolute polar angular travel about the spiral centre; signed/net travel and per-segment contributions are disclosed separately",
                "preservedPrefixAbsoluteTurns": round(prefix_turns["absoluteTurns"], 12),
                "preservedPrefixSignedTurns": round(prefix_turns["signedTurns"], 12),
                "authoredFloorTransitionAbsoluteTurns": round(floor_transition_absolute_turns, 12),
                "authoredFloorTransitionSignedTurns": round(floor_transition_signed_turns, 12),
                "finishedReadableAbsoluteTurns": round(finished_absolute_turns, 12),
                "finishedSignedNetTurns": round(finished_signed_turns, 12),
                "authoredFloorTransitionSegments": floor_transition_segments,
                "authorityPasses": turn_authority_valid,
                "mobileSceneAuthority": mobile_scene_authority,
                "mobileExactRouteContractChecks": route_contract_checks,
                "mobileFloorLeadTopologyEvidence": mobile_lead_topology_evidence,
            },
            "minimumBendRadiusMeters": bend["radiusMeters"],
            "minimumBendEvidence": bend,
            "denseJoinWindowEvidence": dense_join_audit,
            "physicalFloorContact": contact_profile,
            "fullRouteSupport": support_audit,
            "intersections": intersections,
            "intersectionPairs": intersection_pairs,
            "physicalSelfClearance": clearance,
            "floatingSections": floating_sections,
            "maximumFloorContactCentreErrorMeters": round(max(float_errors, default=0.0), 8),
            "outerOriginTreatment": "one non-emissive 64-segment coaxial annular flange and recessed sleeve at the west perimeter; the measured cable envelope transits every aperture plane from building infrastructure",
            "lowerRearConnectionTreatment": f"54 mm sheath uses a {required_corridor_length * 1000.0:.0f} mm straight axial seat directly into accepted CRT_StrainReliefRib_06 with one restrained rubber grommet; no R1 plug, collar, bridge, cradle, or support stand",
            "rearSeatAuthority": {
                "object": rib.name,
                "boundsWorldMeters": rib_bounds,
                "endpointWorldMeters": [round(float(value), 8) for value in endpoint],
                "expectedEndpointWorldMeters": [round(float(value), 8) for value in expected_endpoint],
                "axisErrorMeters": round(axis_error, 10),
                "endpointErrorMeters": round(endpoint_error, 10),
                "axialTangentDot": round(end_tangent_dot, 10),
                "lastCorridorMeasuredLengthMeters": round(corridor_length, 10),
                "requiredAxialSeatLengthMeters": required_corridor_length,
                "lastCorridorAxisErrorMeters": round(corridor_axis_error, 10),
                "lastCorridorMinimumTangentDot": round(corridor_min_tangent_dot, 10),
                "axialOverlapMeters": round(axial_overlap, 10),
            },
            "originAuthority": {"serviceMouthObject": None if origin is None else origin.name, "serviceSleeveObject": cfg.SERVICE_MOUTH_AUTHORITY["sleeve"]["object"], "routeEndpointErrorMeters": round(origin_error, 10), "outwardTangentDot": round(origin_tangent_dot, 10), "routeStartWorldMeters": [round(float(value), 8) for value in points[0]], "apertureTransit": aperture_transit},
        }
        cable_audits[family] = record
        check(f"{family}-cable-geometry", record["status"] == "PASS", record)

    origin = bpy.data.objects.get("P4R1V2_PerimeterCableServiceMouth")
    origin_radius = None if origin is None else math.hypot(origin.matrix_world.translation.x - cfg.CENTRAL_ZONE_CENTRE_XY[0], origin.matrix_world.translation.y - cfg.CENTRAL_ZONE_CENTRE_XY[1])
    check("perimeter-source-outside-central-zone", origin is not None and origin_radius > cfg.CENTRAL_ZONE_RADIUS_M, {"object": None if origin is None else origin.name, "distanceFromCentralAxisMeters": None if origin_radius is None else round(origin_radius, 6), "dimensionsMeters": None if origin is None else [round(float(v), 6) for v in origin.dimensions]})

    current_audits: dict[str, Any] = {}
    for family, spec in cfg.CABLE_FAMILIES.items():
        prefix = f"Phase4R1V2_{family.title()}_Current_"
        segments = sorted((obj for obj in bpy.data.objects if obj.name.startswith(prefix)), key=lambda obj: int(obj["phase4r1v2_segment_index"]))
        arrivals = [int(obj["phase4r1v2_arrival_frame"]) for obj in segments]
        geometry_starts = [float(obj["phase4r1v2_geometry_arc_start_m"]) for obj in segments]
        geometry_ends = [float(obj["phase4r1v2_geometry_arc_end_m"]) for obj in segments]
        adjacent_overlaps = [left_end - right_start for left_end, right_start in zip(geometry_ends, geometry_starts[1:])]
        minimum_adjacent_overlap = min(adjacent_overlaps, default=0.0)
        maximum_uncovered_gap = max((max(0.0, -overlap) for overlap in adjacent_overlaps), default=0.0)
        all_overlays_uncapped = all(not obj.data.use_fill_caps for obj in segments)
        sheath = bpy.data.objects[f"Phase4R1V2_{family.title()}_ContinuousGraphiteSheath"]
        sheath_profile = sheath.data.bevel_object
        profile_points = [] if sheath_profile is None else [Vector(point.co[:3]) for spline in sheath_profile.data.splines for point in spline.points]
        measured_sheath_top_offset = max((point.y for point in profile_points), default=None)
        overlay_radii = [float(obj.data.bevel_depth) for obj in segments]
        overlay_bevel_resolutions = [int(obj.data.bevel_resolution) for obj in segments]
        representative_overlay = None if not segments else segments[len(segments) // 2]
        evaluated_overlay_top_offset = 0.0
        if representative_overlay is not None:
            overlay_centerline = curve_points_world(representative_overlay)
            evaluated_overlay = representative_overlay.evaluated_get(bpy.context.evaluated_depsgraph_get())
            evaluated_overlay_mesh = evaluated_overlay.to_mesh()
            try:
                evaluated_overlay_vertices = [evaluated_overlay.matrix_world @ vertex.co for vertex in evaluated_overlay_mesh.vertices]
                evaluated_overlay_top_offset = max((point.z for point in evaluated_overlay_vertices), default=0.0) - max((point.z for point in overlay_centerline), default=0.0)
            finally:
                evaluated_overlay.to_mesh_clear()
        current_material = None if not segments or not segments[0].data.materials else segments[0].data.materials[0]
        top_surface_visibility = {
            "sheathProfileObject": None if sheath_profile is None else sheath_profile.name,
            "measuredSheathProfileTopOffsetMeters": None if measured_sheath_top_offset is None else round(measured_sheath_top_offset, 8),
            "overlayBevelModeValues": sorted({obj.data.bevel_mode for obj in segments}),
            "overlayBevelResolutionValues": sorted(set(overlay_bevel_resolutions)),
            "requiredOverlayBevelResolution": cfg.CURRENT_OVERLAY_BEVEL_RESOLUTION,
            "minimumOverlayRadiusMeters": round(min(overlay_radii, default=0.0), 8),
            "maximumOverlayRadiusMeters": round(max(overlay_radii, default=0.0), 8),
            "minimumAuthoredTopSurfaceSeparationMeters": None if measured_sheath_top_offset is None else round(min(overlay_radii, default=0.0) - measured_sheath_top_offset, 8),
            "evaluatedRepresentativeSegment": None if representative_overlay is None else representative_overlay.name,
            "evaluatedRepresentativeTopOffsetFromCenterlineMeters": round(evaluated_overlay_top_offset, 8),
            "evaluatedTopSurfaceSeparationAboveSheathMeters": None if measured_sheath_top_offset is None else round(evaluated_overlay_top_offset - measured_sheath_top_offset, 8),
            "requiredMinimumTopSurfaceSeparationMeters": cfg.CURRENT_OVERLAY_MIN_TOP_SEPARATION_M,
            "broadUpperSheathShaderAuthority": None if current_material is None else bool(current_material.get("phase4r1v2_broad_upper_sheath_cap")),
            "geometrySource": "evaluated representative overlay mesh plus actual weighted-sheath bevel-profile control points; not config echo",
        }
        top_surface_visibility["passes"] = (
            sheath_profile is not None
            and measured_sheath_top_offset is not None
            and bool(overlay_radii)
            and all(obj.data.bevel_mode == "ROUND" for obj in segments)
            and bool(overlay_bevel_resolutions)
            and all(value == cfg.CURRENT_OVERLAY_BEVEL_RESOLUTION for value in overlay_bevel_resolutions)
            and min(overlay_radii) - measured_sheath_top_offset >= cfg.CURRENT_OVERLAY_MIN_TOP_SEPARATION_M
            and evaluated_overlay_top_offset - measured_sheath_top_offset >= cfg.CURRENT_OVERLAY_MIN_TOP_SEPARATION_M
            and top_surface_visibility["broadUpperSheathShaderAuthority"] is True
        )
        overlap_audit = {
            "authoredOverlapPerSideMeters": 0.01188,
            "measuredMinimumAdjacentTotalOverlapMeters": round(minimum_adjacent_overlap, 8),
            "measuredMinimumPerSideEquivalentMeters": round(minimum_adjacent_overlap * 0.5, 8),
            "maximumUncoveredArcGapMeters": round(maximum_uncovered_gap, 10),
            "allCurrentCurvesUncapped": all_overlays_uncapped,
            "adjacentPairCount": len(adjacent_overlaps),
            "evaluatedTopSurfaceVisibility": top_surface_visibility,
        }
        overlap_audit["passes"] = minimum_adjacent_overlap >= 0.02375 and maximum_uncovered_gap <= 1e-9 and all_overlays_uncapped and top_surface_visibility["passes"]
        frame_evidence: list[dict[str, Any]] = []
        maximum_ahead = 0.0
        readable_trails: list[float] = []
        active_interval_counts: list[int] = []
        bright_suffix_valid = True
        local_reflection = 0.0
        total_arc_length = sum(float(obj["phase4r1v2_arc_end_m"]) - float(obj["phase4r1v2_arc_start_m"]) for obj in segments)
        front_duration = max(3, round((cfg.CONDUCTION_END - cfg.CONDUCTION_START) * cfg.CURRENT_FRONT_WIDTH_FRACTION))
        measured_stable_front_fractions: list[float] = []
        contrast_records: list[dict[str, Any]] = []
        normalized_progress_values: list[float] = []
        trail_rgb = Vector(srgb_value[:3]) if (srgb_value := srgb(cfg.PALETTE["quantum_magenta"])) else Vector((0.0, 0.0, 0.0))
        for frame in (1, 46, 76, 165, 225, 285):
            bpy.context.scene.frame_set(frame)
            emissions = [current_effective_emission(obj) for obj in segments]
            energized = [value > 1e-7 for value in emissions]
            intervals = 0
            in_interval = False
            for value in energized:
                if value and not in_interval:
                    intervals += 1
                in_interval = value
            active_interval_counts.append(intervals)
            last = max((index for index, value in enumerate(energized) if value), default=-1)
            ahead = max((emission for emission, arrival in zip(emissions, arrivals) if arrival > frame), default=0.0)
            maximum_ahead = max(maximum_ahead, ahead)
            bright = []
            trail = []
            for index, (obj, emission) in enumerate(zip(segments, emissions)):
                if emission <= 1e-7:
                    continue
                rgb = Vector(obj.color[:3])
                # The actual keyed color remains different from the reached
                # trail color for the complete authored moving-front window.
                if (rgb - trail_rgb).length > 1e-5:
                    bright.append(index)
                else:
                    trail.append(index)
                    readable_trails.append(emission)
            bright_arc_length = sum(
                float(segments[index]["phase4r1v2_arc_end_m"]) - float(segments[index]["phase4r1v2_arc_start_m"])
                for index in bright
            )
            energized_arc_length = sum(
                float(segments[index]["phase4r1v2_arc_end_m"]) - float(segments[index]["phase4r1v2_arc_start_m"])
                for index, value in enumerate(energized)
                if value
            )
            trail_arc_length = sum(
                float(segments[index]["phase4r1v2_arc_end_m"]) - float(segments[index]["phase4r1v2_arc_start_m"])
                for index in trail
            )
            normalized_current_progress = 0.0 if total_arc_length <= 1e-12 else energized_arc_length / total_arc_length
            normalized_progress_values.append(normalized_current_progress)
            bright_fraction = 0.0 if total_arc_length <= 1e-12 else bright_arc_length / total_arc_length
            bright_emissions = [emissions[index] for index in bright]
            trail_emissions = [emissions[index] for index in trail]
            bright_luminance = [emissions[index] * rgb_evidence(segments[index].color)["luminance"] for index in bright]
            trail_luminance = [emissions[index] * rgb_evidence(segments[index].color)["luminance"] for index in trail]
            peak_front_emission = max(bright_emissions, default=0.0)
            maximum_trail_emission = max(trail_emissions, default=0.0)
            peak_front_luminance = max(bright_luminance, default=0.0)
            maximum_trail_luminance = max(trail_luminance, default=0.0)
            contrast_valid = not bright or not trail or (peak_front_emission >= maximum_trail_emission * 1.25 and peak_front_luminance >= maximum_trail_luminance * 1.25)
            if bright and trail:
                contrast_records.append(
                    {
                        "frame": frame,
                        "peakFrontEmission": round(peak_front_emission, 8),
                        "maximumReachedTrailEmission": round(maximum_trail_emission, 8),
                        "frontToTrailEmissionRatio": round(peak_front_emission / max(maximum_trail_emission, 1e-12), 8),
                        "peakFrontLuminanceContribution": round(peak_front_luminance, 8),
                        "maximumReachedTrailLuminanceContribution": round(maximum_trail_luminance, 8),
                        "frontToTrailLuminanceRatio": round(peak_front_luminance / max(maximum_trail_luminance, 1e-12), 8),
                        "passes": contrast_valid,
                    }
                )
            stable_front = frame >= min(arrivals, default=cfg.CONDUCTION_START) + front_duration
            if stable_front and bright:
                measured_stable_front_fractions.append(bright_fraction)
            expected_suffix = list(range(bright[0], last + 1)) if bright else []
            suffix_valid = not bright or (bright == expected_suffix and bright[-1] == last)
            bright_suffix_valid = bright_suffix_valid and suffix_valid
            family_collection = bpy.data.collections[spec["collection"]]
            energies = [float(obj.data.energy) for obj in family_collection.objects if obj.type == "LIGHT" and obj.get("phase4r1v2_local_reflection_contribution")]
            local_frame = sum(energies)
            local_reflection = max(local_reflection, local_frame)
            frame_evidence.append({"frame": frame, "normalizedCurrentProgress": round(normalized_current_progress, 8), "energizedArcLengthMeters": round(energized_arc_length, 8), "continuousTrailLengthMeters": round(trail_arc_length, 8), "energizedSegmentCount": sum(energized), "activeEnergizedIntervalCount": intervals, "firstEnergizedIndex": next((index for index, value in enumerate(energized) if value), None), "lastEnergizedIndex": None if last < 0 else last, "brightFrontIndices": bright, "brightFrontArcLengthMeters": round(bright_arc_length, 8), "brightFrontFractionOfCable": round(bright_fraction, 8), "stableFrontMeasurement": stable_front, "trailSegmentCount": len(trail), "maximumEmissionAheadOfFront": round(ahead, 10), "minimumTrailEmission": None if not trail else round(min(emissions[index] for index in trail), 8), "peakBrightFrontEmission": round(peak_front_emission, 8), "maximumReachedTrailEmission": round(maximum_trail_emission, 8), "peakBrightFrontLuminanceContribution": round(peak_front_luminance, 8), "maximumReachedTrailLuminanceContribution": round(maximum_trail_luminance, 8), "frontBrighterThanReachedTrail": contrast_valid, "brightFrontIsContiguousSuffix": suffix_valid, "localReflectionEnergyWatts": round(local_frame, 6)})
        dormant_max = max((row for row in frame_evidence if row["frame"] == 1), key=lambda row: row["frame"])["energizedSegmentCount"]
        active_frames_valid = all(row["activeEnergizedIntervalCount"] == 1 for row in frame_evidence if row["frame"] >= 46)
        trail_minimum = min(readable_trails, default=0.0)
        front_fraction_minimum = min(measured_stable_front_fractions, default=0.0)
        front_fraction_maximum = max(measured_stable_front_fractions, default=0.0)
        front_fraction_valid = bool(measured_stable_front_fractions) and front_fraction_minimum >= 0.03 and front_fraction_maximum <= 0.06
        readable_trail_threshold = 0.25
        front_trail_contrast_valid = len(contrast_records) >= 3 and all(row["passes"] for row in contrast_records)
        progress_valid = all(right + 1e-9 >= left for left, right in zip(normalized_progress_values, normalized_progress_values[1:])) and bool(normalized_progress_values) and normalized_progress_values[0] == 0.0 and normalized_progress_values[-1] >= 0.999999
        record = {
            "status": "PASS" if len(segments) == spec["segments"] and overlap_audit["passes"] and arrivals == sorted(arrivals) and dormant_max == 0 and active_frames_valid and maximum_ahead <= 1e-6 and trail_minimum >= readable_trail_threshold and bright_suffix_valid and front_fraction_valid and front_trail_contrast_valid and progress_valid and local_reflection > 0.0 else "FAIL",
            "segmentCount": len(segments),
            "spatialCoverage": overlap_audit,
            "arrivalFramesMonotonic": arrivals == sorted(arrivals),
            "arrivalFrameFirst": min(arrivals, default=None),
            "arrivalFrameLast": max(arrivals, default=None),
            "frontWidthNormalized": round((front_fraction_minimum + front_fraction_maximum) * 0.5, 8),
            "authoredFrontWidthNormalized": cfg.CURRENT_FRONT_WIDTH_FRACTION,
            "measuredStableFrontFractionRange": [round(front_fraction_minimum, 8), round(front_fraction_maximum, 8)],
            "requiredStableFrontFractionRange": [0.03, 0.06],
            "activeEnergizedIntervalCount": max(active_interval_counts[1:], default=0),
            "disconnectedEnergizedIntervalCount": max((max(0, value - 1) for value in active_interval_counts[1:]), default=0),
            "maximumEmissionAheadOfFront": round(maximum_ahead, 10),
            "minimumReadableTrailEmission": round(trail_minimum, 8),
            "requiredMinimumReadableTrailEmission": readable_trail_threshold,
            "localReflectionContribution": round(local_reflection, 6),
            "dormancyEnergizedSegmentCount": dormant_max,
            "brightFrontIsContiguousSuffix": bright_suffix_valid,
            "frontBrighterThanReachedTrail": front_trail_contrast_valid,
            "frontTrailContrastFrames": contrast_records,
            "normalizedProgressMonotonicAndComplete": progress_valid,
            "normalizedProgressRepresentativeValues": [round(value, 8) for value in normalized_progress_values],
            "representativeFrames": frame_evidence,
            "implementation": "deterministic arc-length segments; contiguous reached trail #d82b72, 5.5% brighter moving front #f06ba0, transparent dormant cable ahead",
        }
        current_audits[family] = record
        check(f"{family}-current-continuity", record["status"] == "PASS", record)

    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    visible_at_dormancy = sorted(visible_render_objects(), key=lambda obj: obj.name)
    accepted_crt_names = accepted_crt_object_names()
    controlled_current_objects: list[dict[str, Any]] = []
    controlled_current_lights: list[dict[str, Any]] = []
    controlled_q_objects: list[dict[str, Any]] = []
    inspected_materials: list[dict[str, Any]] = []
    inspected_lights: list[dict[str, Any]] = []
    ignored_non_surface_participants: list[dict[str, str]] = []
    missing_material_objects: list[str] = []
    linked_base_unknowns: list[dict[str, Any]] = []
    linked_emission_unknowns: list[dict[str, Any]] = []
    bright_neutral_surfaces: list[dict[str, Any]] = []
    bright_neutral_emitting_geometry: list[dict[str, Any]] = []
    chromatic_light_violations: list[dict[str, Any]] = []
    zero_energy_dormant_lights: list[dict[str, Any]] = []
    magenta_violations: list[dict[str, Any]] = []
    yellow_violations: list[dict[str, Any]] = []
    low_neutral_practicals: list[dict[str, Any]] = []
    explicitly_excluded_crt = sorted(obj.name for obj in visible_at_dormancy if obj.name in accepted_crt_names)
    explicitly_excluded_helpers = sorted(obj.name for obj in bpy.data.objects if obj.get("phase4r1v2_invisible_helper"))
    surface_types = {"MESH", "CURVE", "SURFACE", "META", "FONT"}
    accepted_crt_dormancy: list[dict[str, Any]] = []
    accepted_crt_dormancy_violations: list[dict[str, Any]] = []
    accepted_crt_dormancy_unknowns: list[dict[str, Any]] = []
    visible_name_set = {obj.name for obj in visible_at_dormancy}
    for name in sorted(accepted_crt_names):
        obj = bpy.data.objects.get(name)
        if obj is None or obj.type not in surface_types:
            continue
        render_participating = obj.name in visible_name_set
        materials = [] if obj.data is None or not hasattr(obj.data, "materials") else [material for material in obj.data.materials if material is not None]
        for slot_index, material in enumerate(materials):
            evidence = material_structural_evidence(material)
            effective_emission = evidence["maximumEmissionLuminanceStrength"] if render_participating else 0.0
            record = {
                "object": obj.name,
                "slotIndex": slot_index,
                "renderParticipatingAtF1": render_participating,
                "objectHideRender": bool(obj.hide_render),
                "material": evidence,
                "effectiveEmissionLuminanceStrengthAtF1": round(effective_emission, 8),
                "dormant": not render_participating or (effective_emission <= 1e-8 and not evidence["linkedEmissionSockets"]),
            }
            accepted_crt_dormancy.append(record)
            if render_participating and evidence["linkedEmissionSockets"]:
                accepted_crt_dormancy_unknowns.append(record)
            if render_participating and effective_emission > 1e-8:
                accepted_crt_dormancy_violations.append(record)
    for obj in visible_at_dormancy:
        if obj.name in accepted_crt_names:
            continue
        object_alpha = max(0.0, min(1.0, float(obj.color[3])))
        if obj.get("phase4r1v2_current_segment"):
            material = obj.data.materials[0] if obj.data is not None and obj.data.materials else None
            record = {
                "object": obj.name,
                "objectAlpha": round(object_alpha, 8),
                "effectiveEmission": round(current_effective_emission(obj), 8),
                "material": None if material is None else material_structural_evidence(material),
            }
            controlled_current_objects.append(record)
            if record["effectiveEmission"] > 1e-8:
                magenta_violations.append({"kind": "controlled-current-segment-not-dormant", **record})
            continue
        if obj.name == "Phase4R1V2_ExactQuantumQ_PicturePlane":
            material = obj.data.materials[0] if obj.data is not None and obj.data.materials else None
            record = {
                "object": obj.name,
                "objectAlpha": round(object_alpha, 8),
                "material": None if material is None else material_structural_evidence(material),
                "dormant": object_alpha <= 1e-8,
            }
            controlled_q_objects.append(record)
            if not record["dormant"]:
                magenta_violations.append({"kind": "exact-q-screen-not-dormant", **record})
            continue
        if obj.type == "LIGHT":
            light_color = rgb_evidence(obj.data.color)
            energy = max(0.0, float(obj.data.energy))
            record = {
                "object": obj.name,
                "type": obj.data.type,
                "energyWatts": round(energy, 8),
                "color": light_color,
                "role": str(obj.get("phase4r1v2_role", "")),
            }
            if obj.get("phase4r1v2_local_reflection_contribution"):
                controlled_current_lights.append({**record, "dormant": energy <= 1e-8})
                if energy > 1e-8:
                    magenta_violations.append({"kind": "controlled-current-response-light-not-dormant", **record})
                continue
            inspected_lights.append(record)
            if energy <= 1e-8:
                zero_energy_dormant_lights.append(
                    {
                        **record,
                        "dormant": True,
                        "classification": "zero evaluated F1 energy; raw chromaticity is structurally unable to contribute light",
                    }
                )
                continue
            neutral = light_color["saturationProxy"] <= 0.18
            restrained = energy <= 210.0
            if neutral and restrained and not color_is_magenta(light_color) and not color_is_yellow(light_color):
                low_neutral_practicals.append(record)
            else:
                chromatic_light_violations.append(record)
            if energy > 1e-8 and color_is_magenta(light_color):
                magenta_violations.append({"kind": "visible-non-current-light", **record})
            if energy > 1e-8 and color_is_yellow(light_color):
                yellow_violations.append({"kind": "visible-light", **record})
            continue
        if obj.type not in surface_types:
            ignored_non_surface_participants.append({"object": obj.name, "type": obj.type})
            continue
        materials = [] if obj.data is None or not hasattr(obj.data, "materials") else [material for material in obj.data.materials if material is not None]
        if not materials:
            missing_material_objects.append(obj.name)
            continue
        for slot_index, material in enumerate(materials):
            evidence = material_structural_evidence(material)
            effective_alpha = object_alpha * max(0.0, min(1.0, float(material.diffuse_color[3])))
            record = {
                "object": obj.name,
                "objectType": obj.type,
                "slotIndex": slot_index,
                "effectiveAlpha": round(effective_alpha, 8),
                "material": evidence,
            }
            inspected_materials.append(record)
            if evidence["linkedBaseSockets"]:
                linked_base_unknowns.append(record)
            if evidence["linkedEmissionSockets"]:
                linked_emission_unknowns.append(record)
            bright_bases = [row for row in evidence["bases"] if row["luminance"] >= 0.65 and row["saturationProxy"] <= 0.18]
            bright_emissions = [row for row in evidence["emissions"] if row["color"]["luminance"] >= 0.55 and row["color"]["saturationProxy"] <= 0.18 and row["strength"] * effective_alpha > 0.05]
            magenta_bases = [row for row in evidence["bases"] if color_is_magenta(row)]
            magenta_emissions = [row for row in evidence["emissions"] if color_is_magenta(row["color"]) and row["strength"] * effective_alpha > 1e-8]
            yellow_bases = [row for row in evidence["bases"] if color_is_yellow(row)]
            yellow_emissions = [row for row in evidence["emissions"] if color_is_yellow(row["color"]) and row["strength"] * effective_alpha > 1e-8]
            if effective_alpha > 1e-8 and bright_bases:
                bright_neutral_surfaces.append({**record, "brightBaseCandidates": bright_bases})
            if bright_emissions:
                bright_neutral_emitting_geometry.append({**record, "brightEmissionCandidates": bright_emissions})
            if effective_alpha > 1e-8 and (magenta_bases or magenta_emissions):
                magenta_violations.append({"kind": "visible-non-current-material", **record, "magentaBases": magenta_bases, "magentaEmissions": magenta_emissions})
            if effective_alpha > 1e-8 and (yellow_bases or yellow_emissions):
                yellow_violations.append({"kind": "visible-material", **record, "yellowBases": yellow_bases, "yellowEmissions": yellow_emissions})

    world_records: list[dict[str, Any]] = []
    world_violations: list[dict[str, Any]] = []
    world = bpy.context.scene.world
    if world is not None and world.use_nodes and world.node_tree is not None:
        for node in sorted((node for node in world.node_tree.nodes if node.type == "BACKGROUND"), key=lambda value: value.name):
            color_socket = node.inputs.get("Color")
            strength_socket = node.inputs.get("Strength")
            record = {
                "node": node.name,
                "color": None if color_socket is None or color_socket.is_linked else rgb_evidence(color_socket.default_value),
                "strength": None if strength_socket is None or strength_socket.is_linked else round(float(strength_socket.default_value), 8),
                "linkedColor": False if color_socket is None else color_socket.is_linked,
                "linkedStrength": False if strength_socket is None else strength_socket.is_linked,
            }
            world_records.append(record)
            if record["linkedColor"] or record["linkedStrength"] or record["color"] is None or record["strength"] is None or record["color"]["luminance"] * record["strength"] > 0.01 or color_is_magenta(record["color"]) or color_is_yellow(record["color"]):
                world_violations.append(record)

    palette_materials = sorted({material_base_hex(material) for material in bpy.data.materials if material_base_hex(material) is not None})
    visible_white_panel_objects = sorted({row["object"] for row in bright_neutral_surfaces + bright_neutral_emitting_geometry})
    practical_energy = [row["energyWatts"] for row in low_neutral_practicals]
    palette_audit = {
        "magentaAbsentAtDormancy": not magenta_violations,
        "brightWhiteFactoryPanels": bool(visible_white_panel_objects),
        "dominantPalette": [cfg.PALETTE["primary_black"], cfg.PALETTE["deep_graphite"], cfg.PALETTE["warm_dark"], cfg.PALETTE["muted_dark_steel"]],
        "exactGlobalHallVisualAuthority": hall_visual_authority,
        "phase3ScreenSpillObjectOnlySuppression": screen_spill_suppression,
        "controlledActivationColors": [cfg.PALETTE["quantum_magenta"], cfg.PALETTE["quantum_accent"]],
        "visibleDormantMagentaObjects": sorted({row.get("object", "") for row in magenta_violations if row.get("object")}),
        "visibleWhitePanelObjects": visible_white_panel_objects,
        "yellowMaterialOrLightViolations": yellow_violations,
        "brightNeutralSurfaceViolations": bright_neutral_surfaces,
        "brightNeutralEmittingGeometryViolations": bright_neutral_emitting_geometry,
        "linkedBaseColorInspectionFailures": linked_base_unknowns,
        "linkedEmissionInspectionFailures": linked_emission_unknowns,
        "chromaticOrHighEnergyLightViolations": chromatic_light_violations,
        "zeroEnergyDormantLights": zero_energy_dormant_lights,
        "worldBackgroundViolations": world_violations,
        "acceptedCrtDormancyViolations": accepted_crt_dormancy_violations,
        "acceptedCrtDormancyInspectionFailures": accepted_crt_dormancy_unknowns,
        "missingMaterialObjects": missing_material_objects,
        "practicalEnergyWatts": practical_energy,
        "maximumNeutralPracticalEnergyWatts": max(practical_energy, default=0.0),
        "authoredPaletteMaterials": palette_materials,
        "structuralInspection": {
            "frame": 1,
            "recursiveVisibleParticipantCount": len(visible_at_dormancy),
            "inspectedMaterialAssignments": inspected_materials,
            "inspectedLights": inspected_lights,
            "lowNeutralPracticals": low_neutral_practicals,
            "zeroEnergyDormantLights": zero_energy_dormant_lights,
            "worldBackgrounds": world_records,
            "ignoredNonSurfaceParticipants": ignored_non_surface_participants,
            "allVisibleNonCrtNonCurrentSurfaceMaterialsInspected": not missing_material_objects and not linked_base_unknowns and not linked_emission_unknowns,
        },
        "explicitExclusions": {
            "acceptedCrtObjects": explicitly_excluded_crt,
            "acceptedCrtF1EmissionEvaluation": accepted_crt_dormancy,
            "controlledDormantCurrentSegments": controlled_current_objects,
            "controlledDormantCurrentResponseLights": controlled_current_lights,
            "controlledDormantExactQScreen": controlled_q_objects,
            "invisibleTechnicalHelpers": explicitly_excluded_helpers,
        },
        "nativePixelAuditDeferredToSparseProofRenderer": True,
    }
    palette_valid = (
        palette_audit["magentaAbsentAtDormancy"]
        and not palette_audit["brightWhiteFactoryPanels"]
        and not yellow_violations
        and not linked_base_unknowns
        and not linked_emission_unknowns
        and not chromatic_light_violations
        and all(row["dormant"] and row["energyWatts"] == 0.0 for row in zero_energy_dormant_lights)
        and not world_violations
        and not accepted_crt_dormancy_violations
        and not accepted_crt_dormancy_unknowns
        and not missing_material_objects
        and all(row["dormant"] for row in controlled_current_lights)
        and all(row["dormant"] for row in controlled_q_objects)
        and max(practical_energy, default=0.0) <= 210.0
        and hall_visual_authority["passes"]
        and screen_spill_suppression["passes"]
    )
    check("dark-v2-palette", palette_valid, palette_audit)

    q_plane = bpy.data.objects.get("Phase4R1V2_ExactQuantumQ_PicturePlane")
    q_image = bpy.data.images.get("Phase4R1V2_ExactQuantumQ_PreCRTEffect_2048")
    q_provenance = json.loads(cfg.Q_PROVENANCE_REPORT.read_text(encoding="utf-8"))
    provenance_files = {row["role"]: row for row in q_provenance.get("files", [])}
    source_aspect = float(q_provenance["rasterization"]["sourceAspectRatio"])
    provenance_texture_aspect = float(q_provenance["rasterization"]["textureAspectRatio"])
    actual_texture_aspect = None if q_image is None else q_image.size[0] / q_image.size[1]
    packed_bytes = b"" if q_image is None or q_image.packed_file is None else bytes(q_image.packed_file.data)
    packed_sha256 = None if not packed_bytes else hashlib.sha256(packed_bytes).hexdigest()
    q_image_filepath_raw = "" if q_image is None else str(q_image.filepath or "")
    q_image_filepath_buffer_overwrite_realized_characters = 0 if q_image is None else int(q_image.get("phase4r1v2_filepath_buffer_overwrite_realized_characters", 0))
    scene_q_image_filepath_buffer_overwrite_realized_characters = int(bpy.context.scene.get("phase4r1v2_q_filepath_overwrite_chars", 0))
    q_image_filepath_canonical = None
    q_image_filepath_error = None
    try:
        q_image_filepath_canonical = cfg.canonical_blender_repo_relative_path(
            q_image_filepath_raw,
            cfg.CANONICAL_Q_IMAGE_FILEPATH,
        )
    except ValueError as exc:
        q_image_filepath_error = str(exc)
    q_packed_file_entries = [] if q_image is None else list(q_image.packed_files)
    q_packed_file_entry_filepath_raw = "" if len(q_packed_file_entries) != 1 else str(q_packed_file_entries[0].filepath or "")
    q_packed_file_entry_filepath_canonical = None
    q_packed_file_entry_filepath_error = None
    try:
        q_packed_file_entry_filepath_canonical = cfg.canonical_blender_repo_relative_path(
            q_packed_file_entry_filepath_raw,
            cfg.CANONICAL_Q_IMAGE_FILEPATH,
        )
    except ValueError as exc:
        q_packed_file_entry_filepath_error = str(exc)
    q_material = None if q_plane is None or not q_plane.data.materials else q_plane.data.materials[0]
    active_output = None if q_material is None or not q_material.use_nodes else next((node for node in q_material.node_tree.nodes if node.type == "OUTPUT_MATERIAL" and node.is_active_output), None)
    reachable_q_nodes: set[bpy.types.Node] = set()
    pending_q_nodes: list[bpy.types.Node] = []
    if active_output is not None:
        surface_socket = active_output.inputs.get("Surface")
        if surface_socket is not None:
            pending_q_nodes.extend(link.from_node for link in surface_socket.links)
    while pending_q_nodes:
        node = pending_q_nodes.pop()
        if node in reachable_q_nodes:
            continue
        reachable_q_nodes.add(node)
        pending_q_nodes.extend(link.from_node for socket in node.inputs for link in socket.links)
    bound_image_nodes = sorted(node.name for node in reachable_q_nodes if node.type == "TEX_IMAGE" and node.image is q_image)
    q_uv_layer = None if q_plane is None or q_plane.type != "MESH" or not q_plane.data.uv_layers else q_plane.data.uv_layers.active
    q_uv_records = [] if q_uv_layer is None else [[round(float(value), 8) for value in q_uv_layer.data[loop.index].uv] for loop in q_plane.data.loops]
    expected_uv_records = [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]]
    q_local_vertices = [] if q_plane is None or q_plane.type != "MESH" else [vertex.co.copy() for vertex in q_plane.data.vertices]
    q_plane_width = 0.0 if not q_local_vertices else max(point.x for point in q_local_vertices) - min(point.x for point in q_local_vertices)
    q_plane_height = 0.0 if not q_local_vertices else max(point.z for point in q_local_vertices) - min(point.z for point in q_local_vertices)
    q_plane_aspect = None if q_plane_height <= 1e-12 else q_plane_width / q_plane_height
    q_world_normal = None
    q_forward_dot = None
    if q_plane is not None and q_plane.type == "MESH" and len(q_plane.data.polygons) == 1:
        q_world_normal = (q_plane.matrix_world.to_3x3() @ q_plane.data.polygons[0].normal).normalized()
        q_forward_dot = q_world_normal.dot(Vector((0.0, -1.0, 0.0)))
    q_plane_geometry_valid = (
        q_plane is not None
        and q_plane.type == "MESH"
        and len(q_plane.data.polygons) == 1
        and len(q_plane.data.vertices) == 4
        and q_uv_records == expected_uv_records
        and q_uv_layer is not None
        and bool(q_uv_layer.active_render)
        and q_plane_aspect is not None
        and abs(q_plane_aspect - source_aspect) <= 1e-12
        and q_forward_dot is not None
        and q_forward_dot >= 0.999999
    )
    q_audit = {
        "officialSourcePath": "public/brand/quantum-icon-white.svg",
        "officialSourceSha256": sha256(cfg.Q_WHITE_SVG),
        "officialColorSourcePath": "public/brand/quantum-icon-color.svg",
        "officialColorSourceSha256": sha256(cfg.Q_COLOR_SVG),
        "screenTextureRole": "pre-crt-effect-q",
        "screenTexturePath": cfg.Q_TEXTURE_PRE_CRT.resolve().relative_to(cfg.REPOSITORY_ROOT.resolve()).as_posix(),
        "screenTextureSha256": sha256(cfg.Q_TEXTURE_PRE_CRT),
        "packedImageFilepathRaw": q_image_filepath_raw,
        "packedImageFilepath": q_image_filepath_canonical,
        "packedImageFilepathCanonicalizationError": q_image_filepath_error,
        "imageFilepathBufferOverwriteMinimumCharacters": cfg.IMAGE_FILEPATH_BUFFER_OVERWRITE_MINIMUM_CHARACTERS,
        "imageFilepathBufferOverwriteRealizedCharacters": q_image_filepath_buffer_overwrite_realized_characters,
        "sceneImageFilepathBufferOverwriteRealizedCharacters": scene_q_image_filepath_buffer_overwrite_realized_characters,
        "packedFileEntryCount": len(q_packed_file_entries),
        "packedFileEntryFilepathRaw": q_packed_file_entry_filepath_raw,
        "packedFileEntryFilepath": q_packed_file_entry_filepath_canonical,
        "packedFileEntryFilepathCanonicalizationError": q_packed_file_entry_filepath_error,
        "picturePlane": None if q_plane is None else q_plane.name,
        "imageDatablock": None if q_image is None else q_image.name,
        "imagePacked": q_image is not None and q_image.packed_file is not None,
        "packedImageBytes": len(packed_bytes),
        "packedImageSha256": packed_sha256,
        "material": None if q_material is None else q_material.name,
        "activeMaterialOutput": None if active_output is None else active_output.name,
        "activeOutputReachableNodeNames": sorted(node.name for node in reachable_q_nodes),
        "materialImageNodeNamesBoundToExactDatablock": bound_image_nodes,
        "materialImageBindingValid": active_output is not None and len(bound_image_nodes) == 1,
        "picturePlaneGeometry": {"vertexCount": len(q_local_vertices), "polygonCount": 0 if q_plane is None or q_plane.type != "MESH" else len(q_plane.data.polygons), "uvLayer": None if q_uv_layer is None else q_uv_layer.name, "uvActiveRender": False if q_uv_layer is None else bool(q_uv_layer.active_render), "uvCoordinatesInLoopOrder": q_uv_records, "expectedUvCoordinatesInLoopOrder": expected_uv_records, "localWidthMeters": round(q_plane_width, 8), "localHeightMeters": round(q_plane_height, 8), "localAspectRatio": q_plane_aspect, "worldNormal": None if q_world_normal is None else [round(float(value), 8) for value in q_world_normal], "screenFacingNegativeYDot": None if q_forward_dot is None else round(q_forward_dot, 10), "passes": q_plane_geometry_valid},
        "provenanceAuthority": repo_record(cfg.Q_PROVENANCE_REPORT),
        "sourceViewBox": q_provenance["rasterization"]["sourceViewBox"],
        "sourceAspectRatio": source_aspect,
        "provenanceTextureAspectRatio": provenance_texture_aspect,
        "packedTextureAspectRatio": actual_texture_aspect,
        "provenanceMetrics": q_provenance["metrics"],
        "provenanceScreenTextureRecord": provenance_files.get("pre-crt-effect-q"),
        "preCrtComposition": q_provenance.get("preCrtComposition"),
        "manualRedraw": False,
        "approximateBlenderGeometry": False,
        "oldQCurvesVisible": [name for name in ("Phase4R0_QuantumQ_Body", "Phase4R0_QuantumQ_Accent") if bpy.data.objects.get(name) is not None and not bpy.data.objects[name].hide_render],
    }
    metrics_zero = all(int(value) == 0 for value in q_provenance["metrics"].values())
    texture_hash_bound = provenance_files.get("pre-crt-effect-q", {}).get("sha256") == q_audit["screenTextureSha256"]
    check("exact-q-packed-image-binding", q_plane is not None and q_image is not None and q_image.packed_file is not None and len(q_packed_file_entries) == 1 and q_image_filepath_canonical == cfg.CANONICAL_Q_IMAGE_FILEPATH and q_image_filepath_buffer_overwrite_realized_characters >= cfg.IMAGE_FILEPATH_BUFFER_OVERWRITE_MINIMUM_CHARACTERS and scene_q_image_filepath_buffer_overwrite_realized_characters == q_image_filepath_buffer_overwrite_realized_characters and q_packed_file_entry_filepath_canonical == cfg.CANONICAL_Q_IMAGE_FILEPATH and q_packed_file_entry_filepath_error is None and q_audit["officialSourceSha256"] == cfg.Q_WHITE_SVG_SHA256 and q_audit["officialColorSourceSha256"] == cfg.Q_COLOR_SVG_SHA256 and q_provenance.get("preCrtComposition", {}).get("packedRole") == "pre-crt-effect-q" and q_provenance.get("preCrtComposition", {}).get("bodyColor") == "#ffffff" and q_provenance.get("preCrtComposition", {}).get("nodeColor") == "#d82b72" and abs(source_aspect - provenance_texture_aspect) <= 1e-12 and actual_texture_aspect is not None and abs(actual_texture_aspect - source_aspect) <= 1e-12 and metrics_zero and texture_hash_bound and packed_sha256 == provenance_files.get("pre-crt-effect-q", {}).get("sha256") and len(packed_bytes) == provenance_files.get("pre-crt-effect-q", {}).get("bytes") and active_output is not None and len(bound_image_nodes) == 1 and q_plane_geometry_valid and q_provenance.get("manualRedraw") is False and q_provenance.get("approximateBlenderGeometry") is False and not q_audit["oldQCurvesVisible"], q_audit)

    preservation_signature_schema = bpy.context.scene.get("phase4r1v2_preservation_signature_schema")
    preservation_exclusion_authority_raw = str(bpy.context.scene.get("phase4r1v2_persistence_exclusion_authority_json", ""))
    try:
        preservation_exclusion_authority = json.loads(preservation_exclusion_authority_raw)
    except (json.JSONDecodeError, TypeError, ValueError):
        preservation_exclusion_authority = None
    preservation_signature_authority = {
        "schema": preservation_signature_schema,
        "persistenceVolatileRnaPropertyExclusionAuthority": preservation_exclusion_authority,
        "sceneAuthorityRaw": preservation_exclusion_authority_raw,
    }
    preservation_signature_authority_valid = (
        preservation_signature_schema == cfg.PRESERVATION_SIGNATURE_SCHEMA
        and preservation_exclusion_authority == cfg.PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY
        and preservation_exclusion_authority is not None
        and preservation_exclusion_authority.get("properties") == ["session_uid"]
        and "tag" not in preservation_exclusion_authority.get("properties", [])
    )
    check("preservation-signature-persistence-boundary", preservation_signature_authority_valid, preservation_signature_authority)

    accepted_crt_signature_before = bpy.context.scene.get("phase4r1v2_accepted_crt_signature_before")
    accepted_crt_signature_after = bpy.context.scene.get("phase4r1v2_accepted_crt_signature_after")
    check("accepted-crt-signature-preserved", bool(accepted_crt_signature_before) and accepted_crt_signature_before == accepted_crt_signature_after, {"before": accepted_crt_signature_before, "after": accepted_crt_signature_after})
    camera_signature_before = bpy.context.scene.get("phase4r1v2_camera_path_signature_before")
    camera_signature_after = bpy.context.scene.get("phase4r1v2_camera_path_signature_after")
    check("camera-orbit-threshold-actions-preserved", bool(camera_signature_before) and camera_signature_before == camera_signature_after, {"before": camera_signature_before, "after": camera_signature_after})
    establishing_signature_before = bpy.context.scene.get("phase4r1v2_establishing_aim_signature_before")
    establishing_signature_after = bpy.context.scene.get("phase4r1v2_establishing_aim_signature_after")
    check("establishing-aim-actions-preserved", bool(establishing_signature_before) and establishing_signature_before == establishing_signature_after, {"before": establishing_signature_before, "after": establishing_signature_after})
    camera_audit = camera_measurements()
    camera_valid = all(row["counterClockwise"] and row["monotonicInward"] and row["monotonicDescent"] and abs(row["angularTravelDegrees"] - 360.0) <= 0.01 for row in camera_audit.values())
    check("camera-path-measurements", camera_valid, camera_audit)
    opening_composition = opening_composition_measurements()
    opening_composition_valid = all(row["status"] == "PASS" for row in opening_composition.values())
    check("responsive-opening-composition", opening_composition_valid, opening_composition)

    family_central = {family: central_inventory_for_family(family) for family in cfg.CABLE_FAMILIES}
    visible_hero_objects = family_central["desktop"]["visibleHeroObjects"]
    visible_nonhero_objects = sorted({name for row in family_central.values() for name in row["visibleNonHeroObjects"]})
    central_audit = {
        "centralZone": {"centreXYMeters": list(cfg.CENTRAL_ZONE_CENTRE_XY), "radiusMeters": cfg.CENTRAL_ZONE_RADIUS_M},
        "visibleHeroObjects": visible_hero_objects,
        "visibleNonHeroObjects": visible_nonhero_objects,
        "invisibleTechnicalHelpers": sorted(obj.name for obj in bpy.data.objects if obj.get("phase4r1v2_invisible_helper")),
        "acceptedCrtGroupedObjectCount": int(bpy.context.scene.get("phase4r1v2_accepted_crt_object_count", 0)),
        "activeCableFamily": active_families[0] if len(active_families) == 1 else None,
        "floorIsEnvironmentalSurfaceNotHeroObject": True,
        "perimeterServiceMouth": {"object": None if origin is None else origin.name, "distanceFromCentralAxisMeters": None if origin_radius is None else round(origin_radius, 6)},
        "familyEvaluations": family_central,
        "derivation": "evaluated F1 world bounds and recursive render visibility for every authored family; every central render participant is classified as accepted CRT, active cable, environmental floor surface, perimeter/shadow architecture, or transparent dormant signal geometry",
    }
    all_family_heroes_exact = all(row["visibleHeroObjects"] == ["CRT", "spiral cable"] for row in family_central.values())
    check("central-visible-hero-inventory-exact", all_family_heroes_exact and not visible_nonhero_objects, central_audit)

    privacy_ui_state = file_browser_ui_state_audit()
    check("private-file-browser-ui-state-sanitized", privacy_ui_state["passes"], privacy_ui_state)

    failed = [row for row in checks if row["status"] != "PASS"]
    report = {
        "schema": "quantum-hub.phase-4-r1.refined-proving-hall.preflight.v2",
        "status": "PASS" if not failed else "FAIL",
        "generatedAt": cfg.GENERATED_AT,
        "preSave": Path(bpy.data.filepath).resolve() == cfg.RECOVERED_SOURCE.resolve(),
        "sourceAuthorities": {
            "recoveredDerivative": repo_record(cfg.RECOVERED_SOURCE),
            "exactQProvenance": repo_record(cfg.Q_PROVENANCE_REPORT),
        },
        "preservationSignatureAuthority": preservation_signature_authority,
        "audits": {
            "centralFloor": central_audit,
            "palette": palette_audit,
            "screenSpillSuppressionAuthority": screen_spill_suppression,
            "serviceMouthGeometryAuthority": service_mouth_geometry,
            "hallVisualAuthority": hall_visual_authority,
            "cable": cable_audits,
            "current": current_audits,
            "q": q_audit,
            "privacyUiState": privacy_ui_state,
            "camera": {"pathActionsPreserved": camera_signature_before == camera_signature_after, "signature": camera_signature_after, "establishingAimActionsPreserved": establishing_signature_before == establishing_signature_after, "establishingAimSignature": establishing_signature_after, "families": camera_audit, "openingComposition": opening_composition},
        },
        "checks": checks,
        "summary": {"total": len(checks), "passed": len(checks) - len(failed), "failed": len(failed), "failedNames": [row["name"] for row in failed]},
        "authorization": cfg.AUTHORIZATION,
    }
    return report


def write_report(report: dict[str, Any]) -> None:
    cfg.PREFLIGHT_REPORT.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> None:
    report = audit_scene()
    write_report(report)
    print(f"QH_PHASE4R1_REFINED_PREFLIGHT_STATUS={report['status']}")
    print(f"QH_PHASE4R1_REFINED_PREFLIGHT_REPORT={cfg.PREFLIGHT_REPORT}")
    if report["status"] != "PASS":
        raise RuntimeError(f"refined proving-hall preflight failed: {report['summary']}")


if __name__ == "__main__":
    main()
