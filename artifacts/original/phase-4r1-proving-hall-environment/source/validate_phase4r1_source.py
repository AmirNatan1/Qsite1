"""Fail-closed source validation for the Phase 4-R1 Proving Hall derivative."""

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
import phase4r1_config as cfg


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def record(path: Path) -> dict[str, Any]:
    return {"path": path.resolve().relative_to(cfg.REPOSITORY_ROOT.resolve()).as_posix(), "bytes": path.stat().st_size, "sha256": sha256(path)}


def rounded(value: Any, digits: int = 9) -> Any:
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        return round(value, digits)
    if isinstance(value, dict):
        return {str(key): rounded(item, digits) for key, item in value.items()}
    if hasattr(value, "__len__"):
        try:
            return [rounded(item, digits) for item in value]
        except (TypeError, ValueError):
            pass
    return str(value)


def payload_hash(payload: Any) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")).hexdigest()


def canonical_payload_hash(payload: Any) -> str:
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


def curve_shape_signature(obj: bpy.types.Object) -> dict[str, Any]:
    splines = []
    for spline in obj.data.splines:
        item: dict[str, Any] = {"type": spline.type, "cyclic": bool(spline.use_cyclic_u), "resolution": int(spline.resolution_u)}
        if spline.type == "BEZIER":
            item["points"] = [
                {"co": rounded(point.co), "left": rounded(point.handle_left), "right": rounded(point.handle_right), "left_type": point.handle_left_type, "right_type": point.handle_right_type}
                for point in spline.bezier_points
            ]
        else:
            item["points"] = [rounded(point.co) for point in spline.points]
        splines.append(item)
    return {"splines": splines}


def curve_points(obj: bpy.types.Object) -> list[Vector]:
    return [obj.matrix_world @ Vector(point.co[:3]) for spline in obj.data.splines for point in spline.points]


def world_bounds(obj: bpy.types.Object) -> dict[str, list[float]]:
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return {
        "min": [min(point[index] for point in points) for index in range(3)],
        "max": [max(point[index] for point in points) for index in range(3)],
    }


def iter_action_fcurves(action: bpy.types.Action):
    legacy = getattr(action, "fcurves", None)
    if legacy is not None:
        yield from legacy
        return
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", ()):
                yield from channelbag.fcurves


def action_inventory_signature(action_names: set[str]) -> dict[str, Any]:
    actions = sorted([action for action in bpy.data.actions if action.name in action_names], key=lambda action: action.name)
    digest = hashlib.sha256()
    point_count = 0
    curve_count = 0
    for action in actions:
        digest.update(f"ACTION\0{action.name}\n".encode("utf-8"))
        for curve in sorted(list(iter_action_fcurves(action)), key=lambda item: (item.data_path, item.array_index)):
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
    return {"action_names": [action.name for action in actions], "action_count": len(actions), "curve_count": curve_count, "keyframe_point_count": point_count, "sha256": digest.hexdigest()}


def curve_length(points: list[Vector]) -> float:
    return sum((right - left).length for left, right in zip(points, points[1:]))


def cumulative_lengths(points: list[Vector]) -> list[float]:
    values = [0.0]
    for left, right in zip(points, points[1:]):
        values.append(values[-1] + (right - left).length)
    return values


def point_at_distance(points: list[Vector], cumulative: list[float], distance: float) -> Vector:
    distance = max(0.0, min(distance, cumulative[-1]))
    for index in range(1, len(cumulative)):
        if cumulative[index] >= distance:
            span = cumulative[index] - cumulative[index - 1]
            fraction = 0.0 if span <= 1e-12 else (distance - cumulative[index - 1]) / span
            return points[index - 1].lerp(points[index], fraction)
    return points[-1].copy()


def bounds_overlap(left: dict[str, list[float]], right: dict[str, list[float]], tolerance: float = 1e-5) -> bool:
    return all(left["max"][axis] + tolerance >= right["min"][axis] and right["max"][axis] + tolerance >= left["min"][axis] for axis in range(3))


def projected_bounds(scene: bpy.types.Scene, camera: bpy.types.Object, points: list[Vector]) -> list[float] | None:
    values = [world_to_camera_view(scene, camera, point) for point in points]
    values = [point for point in values if point.z > 0.0]
    if not values:
        return None
    return [min(point.x for point in values), min(point.y for point in values), max(point.x for point in values), max(point.y for point in values)]


def bounds_inside_rect(bounds: list[float] | None, rect: tuple[float, float, float, float]) -> bool:
    return bool(bounds and rect[0] <= bounds[0] and rect[1] <= bounds[1] and bounds[2] <= rect[2] and bounds[3] <= rect[3])


def polyline_section(points: list[Vector], cumulative: list[float], start: float, end: float) -> list[Vector]:
    start, end = max(0.0, start), min(cumulative[-1], end)
    values = [point_at_distance(points, cumulative, start)]
    values.extend(point for point, distance in zip(points, cumulative) if start < distance < end)
    values.append(point_at_distance(points, cumulative, end))
    return values


def visible_length_in_rect(scene: bpy.types.Scene, camera: bpy.types.Object, points: list[Vector], rect: tuple[float, float, float, float], subdivisions: int = 6) -> float:
    visible = 0.0
    for left, right in zip(points, points[1:]):
        part = (right - left).length / subdivisions
        for index in range(subdivisions):
            projected = world_to_camera_view(scene, camera, left.lerp(right, (index + 0.5) / subdivisions))
            if projected.z > 0.0 and rect[0] <= projected.x <= rect[2] and rect[1] <= projected.y <= rect[3]:
                visible += part
    return visible


def responsive_fit_geometry(source_resolution: tuple[int, int], target_resolution: tuple[int, int], fit: str) -> dict[str, Any]:
    source_width, source_height = source_resolution
    target_width, target_height = target_resolution
    if fit not in {"cover", "contain"}:
        raise ValueError(f"unsupported responsive physical fit: {fit}")
    scale = (max if fit == "cover" else min)(target_width / source_width, target_height / source_height)
    display_width, display_height = source_width * scale, source_height * scale
    return {
        "fit": fit,
        "position": "center",
        "scale": scale,
        "display_size_px": [display_width, display_height],
        "offset_px": [(target_width - display_width) * 0.5, (target_height - display_height) * 0.5],
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


def bounds_intersect_rect(bounds: list[float] | None, rect: tuple[float, float, float, float]) -> bool:
    return bool(bounds and bounds[2] >= rect[0] and bounds[0] <= rect[2] and bounds[3] >= rect[1] and bounds[1] <= rect[3])


def sampled_polyline_section(points: list[Vector], cumulative: list[float], start: float, end: float, count: int) -> list[Vector]:
    return [point_at_distance(points, cumulative, start + (end - start) * index / (count - 1)) for index in range(count)]


def independently_validate_responsive_fit(
    scene: bpy.types.Scene,
    camera: bpy.types.Object,
    route: list[Vector],
    source_points: list[Vector],
    crt_points: list[Vector],
    source_build_payload: dict[str, Any],
) -> dict[str, Any]:
    source_resolution = tuple(cfg.CAMERA_SPECS["mobile"]["resolution"])
    safe_rect = (0.04, 0.04, 0.96, 0.96)
    cumulative = cumulative_lengths(route)
    total = cumulative[-1]
    q_points = [
        bpy.data.objects[name].matrix_world @ Vector(corner)
        for name in ("Phase4R0_QuantumQ_Body", "Phase4R0_QuantumQ_Accent")
        for corner in bpy.data.objects[name].bound_box
    ]
    glass = bpy.data.objects["CRT_ConvexThickSmokedGlass"]
    glass_points = [glass.matrix_world @ Vector(corner) for corner in glass.bound_box]
    mappings = {
        "mobile-390x844": {"target_resolution": (390, 844), "fit": "cover"},
        "mobile-360x800": {"target_resolution": (360, 800), "fit": "cover"},
        "narrow-320x800": {"target_resolution": (320, 800), "fit": "cover"},
        "tablet-portrait-768x1024": {"target_resolution": (768, 1024), "fit": "contain"},
    }
    records: dict[str, Any] = {}
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
        native_safe_rect = responsive_native_rect(geometry, safe_rect)
        native_viewport_rect = responsive_native_rect(geometry, (0.0, 0.0, 1.0, 1.0))
        frames: dict[str, Any] = {}

        scene.frame_set(1)
        bpy.context.view_layer.update()
        source_native = projected_bounds(scene, camera, source_points)
        route_native = projected_bounds(scene, camera, route)
        crt_native = projected_bounds(scene, camera, crt_points)
        source_target = transform_responsive_bounds(source_native, geometry)
        route_target = transform_responsive_bounds(route_native, geometry)
        crt_target = transform_responsive_bounds(crt_native, geometry)
        route_visible_safe = visible_length_in_rect(scene, camera, route, native_safe_rect, subdivisions=8)
        route_visible_viewport = visible_length_in_rect(scene, camera, route, native_viewport_rect, subdivisions=8)
        route_fraction_safe = 0.0 if total <= 1e-12 else route_visible_safe / total
        route_fraction_viewport = 0.0 if total <= 1e-12 else route_visible_viewport / total
        frame_safe = bounds_inside_rect(source_target, safe_rect) and bounds_inside_rect(crt_target, safe_rect) and route_fraction_viewport >= 0.90
        frames["1"] = {
            "state": "distant-dormancy-source-route-crt",
            "camera": camera_state(),
            "subjects": {
                "complete_source": {"native_bounds": rounded(source_native, 8), "target_bounds": source_target, "safe": bounds_inside_rect(source_target, safe_rect)},
                "crt": {"native_bounds": rounded(crt_native, 8), "target_bounds": crt_target, "safe": bounds_inside_rect(crt_target, safe_rect)},
                "route": {"native_bounds": rounded(route_native, 8), "target_bounds": route_target, "visible_length_in_target_safe_rect_m": round(route_visible_safe, 8), "visible_fraction_in_target_safe_rect": round(route_fraction_safe, 8), "visible_length_in_target_viewport_m": round(route_visible_viewport, 8), "visible_fraction_in_target_viewport": round(route_fraction_viewport, 8), "required_visible_fraction_in_target_viewport": 0.90, "safe": route_fraction_viewport >= 0.90},
            },
            "safe": frame_safe,
            "status": "PASS" if frame_safe else "FAIL",
        }

        scene.frame_set(165)
        bpy.context.view_layer.update()
        progress = (165 - cfg.EVENTS["conduction_start"]) / (cfg.EVENTS["orbit_complete_current_arrival"] - cfg.EVENTS["conduction_start"])
        front_start = max(0.0, progress - cfg.CURRENT["front_width_fraction"])
        trailing_start = max(0.0, front_start - 0.125)
        prefix = sampled_polyline_section(route, cumulative, 0.0, total * progress, 241)
        front = sampled_polyline_section(route, cumulative, total * front_start, total * progress, 101)
        trailing = sampled_polyline_section(route, cumulative, total * trailing_start, total * front_start, 181)
        crt_native = projected_bounds(scene, camera, crt_points)
        front_native = projected_bounds(scene, camera, front)
        trailing_native = projected_bounds(scene, camera, trailing)
        prefix_native = projected_bounds(scene, camera, prefix)
        crt_target = transform_responsive_bounds(crt_native, geometry)
        front_target = transform_responsive_bounds(front_native, geometry)
        trailing_target = transform_responsive_bounds(trailing_native, geometry)
        prefix_target = transform_responsive_bounds(prefix_native, geometry)
        totals = {"front": curve_length(front), "trailing": curve_length(trailing), "prefix": curve_length(prefix)}
        visibles = {
            "front": visible_length_in_rect(scene, camera, front, native_safe_rect, subdivisions=8),
            "trailing": visible_length_in_rect(scene, camera, trailing, native_safe_rect, subdivisions=8),
            "prefix": visible_length_in_rect(scene, camera, prefix, native_safe_rect, subdivisions=8),
        }
        fractions = {key: 0.0 if totals[key] <= 1e-12 else visibles[key] / totals[key] for key in totals}
        frame_safe = bounds_inside_rect(crt_target, safe_rect) and bounds_inside_rect(front_target, safe_rect) and fractions["front"] >= 0.95 and fractions["trailing"] >= 0.70 and visibles["trailing"] >= 3.5 and fractions["prefix"] >= 0.40 and visibles["prefix"] >= 3.5
        frames["165"] = {
            "state": "mid-conduction",
            "camera": camera_state(),
            "subjects": {
                "crt": {"native_bounds": rounded(crt_native, 8), "target_bounds": crt_target, "safe": bounds_inside_rect(crt_target, safe_rect)},
                "active_front": {"native_bounds": rounded(front_native, 8), "target_bounds": front_target, "visible_fraction": round(fractions["front"], 8), "safe": bounds_inside_rect(front_target, safe_rect) and fractions["front"] >= 0.95},
                "contiguous_trailing": {"native_bounds": rounded(trailing_native, 8), "target_bounds": trailing_target, "visible_fraction": round(fractions["trailing"], 8), "visible_length_m": round(visibles["trailing"], 8), "required_fraction": 0.70, "required_length_m": 3.5, "safe": fractions["trailing"] >= 0.70 and visibles["trailing"] >= 3.5},
                "energized_prefix": {"native_bounds": rounded(prefix_native, 8), "target_bounds": prefix_target, "visible_fraction": round(fractions["prefix"], 8), "visible_length_m": round(visibles["prefix"], 8), "required_fraction": 0.40, "required_length_m": 3.5, "safe": fractions["prefix"] >= 0.40 and visibles["prefix"] >= 3.5},
            },
            "safe": frame_safe,
            "status": "PASS" if frame_safe else "FAIL",
        }

        scene.frame_set(370)
        bpy.context.view_layer.update()
        q_native = projected_bounds(scene, camera, q_points)
        glass_native = projected_bounds(scene, camera, glass_points)
        q_target = transform_responsive_bounds(q_native, geometry)
        glass_target = transform_responsive_bounds(glass_native, geometry)
        frame_safe = bounds_inside_rect(q_target, safe_rect) and bounds_intersect_rect(glass_target, safe_rect)
        frames["370"] = {
            "state": "stable-quantum-q",
            "camera": camera_state(),
            "subjects": {
                "verified_q": {"native_bounds": rounded(q_native, 8), "target_bounds": q_target, "safe": bounds_inside_rect(q_target, safe_rect)},
                "physical_glass": {"native_bounds": rounded(glass_native, 8), "target_bounds": glass_target, "intersects": bounds_intersect_rect(glass_target, safe_rect)},
            },
            "safe": frame_safe,
            "status": "PASS" if frame_safe else "FAIL",
        }

        scene.frame_set(500)
        bpy.context.view_layer.update()
        glass_native = projected_bounds(scene, camera, glass_points)
        glass_target = transform_responsive_bounds(glass_native, geometry)
        if policy["fit"] == "contain":
            target_width, target_height = geometry["target_resolution"]
            display_width, display_height = geometry["display_size_px"]
            offset_x, offset_y = geometry["offset_px"]
            displayed_rect = (
                max(safe_rect[0], offset_x / target_width),
                max(safe_rect[1], offset_y / target_height),
                min(safe_rect[2], (offset_x + display_width) / target_width),
                min(safe_rect[3], (offset_y + display_height) / target_height),
            )
        else:
            displayed_rect = safe_rect
        threshold_covers_displayed_content = bool(glass_target and glass_target[0] <= displayed_rect[0] and glass_target[1] <= displayed_rect[1] and glass_target[2] >= displayed_rect[2] and glass_target[3] >= displayed_rect[3])
        physical_surface_crossed = glass_native is None
        threshold_safe = physical_surface_crossed or threshold_covers_displayed_content
        frames["500"] = {
            "state": "physical-threshold",
            "camera": camera_state(),
            "subjects": {"physical_glass": {"native_bounds": rounded(glass_native, 8), "target_bounds": glass_target, "required_displayed_content_rect": rounded(displayed_rect, 8), "covers_required_displayed_content_rect": threshold_covers_displayed_content, "physical_surface_crossed_or_behind_camera": physical_surface_crossed}},
            "deep_physical_black_outside_contained_panel": policy["fit"] == "contain",
            "safe": threshold_safe,
            "status": "PASS" if threshold_safe else "FAIL",
        }

        mapping_safe = all(frame_record["safe"] for frame_record in frames.values())
        records[mapping_id] = {
            "family": "mobile",
            "fit": policy["fit"],
            "position": "center",
            "source_resolution": list(source_resolution),
            "target_resolution": list(policy["target_resolution"]),
            "safe_rect_normalized": list(safe_rect),
            "geometry": rounded(geometry, 8),
            "native_safe_rect_equivalent": rounded(native_safe_rect, 8),
            "native_viewport_rect_equivalent": rounded(native_viewport_rect, 8),
            "frames": frames,
            "safe": mapping_safe,
            "status": "PASS" if mapping_safe else "FAIL",
        }

    status = "PASS" if all(mapping["safe"] for mapping in records.values()) else "FAIL"
    return {
        "status": status,
        "policy_status": "PROPOSED_PREPRODUCTION_NOT_ACCEPTED_RUNTIME_BEHAVIOR",
        "mobile_family_remains_authoritative_at_768x1024": True,
        "tablet_portrait_reason": "contain preserves the complete causal source/route and authored CRT scale against the same deep physical black; center-cover would crop required F1 evidence",
        "independently_resampled_from_saved_derivative": True,
        "canonical_hash_algorithm": "SHA-256(sorted compact ASCII JSON; every finite integral float normalized to integer)",
        "source_build_payload_sha256": canonical_payload_hash(source_build_payload),
        "mappings": records,
    }


def segments_intersect_2d(a: Vector, b: Vector, c: Vector, d: Vector, epsilon: float = 1e-8) -> bool:
    def cross(p: Vector, q: Vector, r: Vector) -> float:
        return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
    ab_c, ab_d = cross(a, b, c), cross(a, b, d)
    cd_a, cd_b = cross(c, d, a), cross(c, d, b)
    return ((ab_c > epsilon and ab_d < -epsilon) or (ab_c < -epsilon and ab_d > epsilon)) and ((cd_a > epsilon and cd_b < -epsilon) or (cd_a < -epsilon and cd_b > epsilon))


def self_intersections(points: list[Vector]) -> list[list[int]]:
    hits: list[list[int]] = []
    for left in range(len(points) - 1):
        a, b = points[left], points[left + 1]
        min_ax, max_ax = sorted((a.x, b.x))
        min_ay, max_ay = sorted((a.y, b.y))
        for right in range(left + 4, len(points) - 1):
            c, d = points[right], points[right + 1]
            if abs(a.z - c.z) > 0.08 and abs(b.z - d.z) > 0.08:
                continue
            min_cx, max_cx = sorted((c.x, d.x))
            min_cy, max_cy = sorted((c.y, d.y))
            if max_ax < min_cx or max_cx < min_ax or max_ay < min_cy or max_cy < min_ay:
                continue
            if segments_intersect_2d(a, b, c, d):
                hits.append([left, right])
                if len(hits) >= 20:
                    return hits
    return hits


def separated_planform_crossings(points: list[Vector]) -> list[dict[str, Any]]:
    crossings: list[dict[str, Any]] = []
    for left in range(len(points) - 1):
        a, b = points[left], points[left + 1]
        r = b - a
        for right in range(left + 4, len(points) - 1):
            c, d = points[right], points[right + 1]
            if not segments_intersect_2d(a, b, c, d):
                continue
            s = d - c
            denominator = r.x * s.y - r.y * s.x
            if abs(denominator) < 1e-10:
                continue
            ca = c - a
            t = (ca.x * s.y - ca.y * s.x) / denominator
            u = (ca.x * r.y - ca.y * r.x) / denominator
            left_z = a.z + t * (b.z - a.z)
            right_z = c.z + u * (d.z - c.z)
            crossings.append(
                {
                    "segments": [left, right],
                    "left_parameter": t,
                    "right_parameter": u,
                    "left_z_m": left_z,
                    "right_z_m": right_z,
                    "centreline_vertical_clearance_m": abs(left_z - right_z),
                }
            )
    return crossings


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
        chord = (c - a).length
        sine = math.sin(angle)
        if abs(sine) < 1e-8:
            continue
        radius = chord / (2.0 * sine)
        if radius < minimum:
            minimum = radius
            evidence = {
                "radius_m": radius,
                "index": index + 1,
                "points": [list(a), list(b), list(c)],
                "turn_degrees": math.degrees(angle),
                "left_length_m": left.length,
                "right_length_m": right.length,
            }
    return evidence


def main() -> None:
    opened = Path(bpy.data.filepath).resolve()
    build = json.loads(cfg.BUILD_REPORT.read_text(encoding="utf-8"))
    build_record = record(cfg.BUILD_REPORT)
    expected_build_producers = {
        "config": record(cfg.SOURCE_DIR / "phase4r1_config.py"),
        "builder": record(cfg.SOURCE_DIR / "build_phase4r1_proving_hall.py"),
    }
    if build.get("producer_authorities") != expected_build_producers:
        raise RuntimeError(f"source-build producer authority is stale: expected={expected_build_producers} actual={build.get('producer_authorities')}")
    expected_responsive_digest = canonical_payload_hash(build["responsive_physical_fit_measurements"])
    if build.get("responsive_physical_fit_measurements_sha256") != expected_responsive_digest:
        raise RuntimeError("source-build responsive physical-fit payload digest is stale or non-canonical")
    producer_authorities = {
        **expected_build_producers,
        "validator": record(Path(__file__).resolve()),
        "preflight": record(cfg.SOURCE_DIR / "preflight_phase4r1_geometry.py"),
        "preproduction_renderer": record(cfg.SOURCE_DIR / "render_phase4r1_preproduction.py"),
        "review_stills_renderer": record(cfg.SOURCE_DIR / "render_phase4r1_review_stills.py"),
        "cycles_benchmarks_renderer": record(cfg.SOURCE_DIR / "render_phase4r1_cycles_benchmarks.py"),
    }
    checks: list[dict[str, Any]] = []

    def check(identifier: str, condition: bool, evidence: Any) -> None:
        checks.append({"id": identifier, "status": "PASS" if condition else "FAIL", "evidence": evidence})

    check("exact_derivative_open", opened == cfg.DERIVATIVE_SOURCE.resolve(), record(opened))
    derivative_hash = sha256(opened)
    check("derivative_bound_to_source_build", derivative_hash == build["phase4r1_derivative"]["sha256"], {"actual": derivative_hash, "reported": build["phase4r1_derivative"]["sha256"]})
    check("r0_authority_unchanged", sha256(cfg.ACCEPTED_PHASE4R0_SOURCE) == cfg.ACCEPTED_PHASE4R0_SHA256, record(cfg.ACCEPTED_PHASE4R0_SOURCE))
    check("verified_q_geometry", sha256(cfg.Q_REVERSED_SOURCE) == cfg.Q_REVERSED_SHA256, record(cfg.Q_REVERSED_SOURCE))
    check("verified_q_color", sha256(cfg.Q_COLOR_SOURCE) == cfg.Q_COLOR_SHA256, record(cfg.Q_COLOR_SOURCE))
    q_collection = bpy.data.collections.get("PHASE4R0_Q_SIGNAL")
    q_expected_names = ["Phase4R0_ApprovedQuantumQ_Root", "Phase4R0_QuantumQ_Accent", "Phase4R0_QuantumQ_Body"]
    q_actual_names = sorted(obj.name for obj in q_collection.objects) if q_collection is not None else []
    q_root = bpy.data.objects.get("Phase4R0_ApprovedQuantumQ_Root")
    q_body = bpy.data.objects.get("Phase4R0_QuantumQ_Body")
    q_accent = bpy.data.objects.get("Phase4R0_QuantumQ_Accent")
    q_hashes = {
        "body": None if q_body is None or q_body.type != "CURVE" else payload_hash(curve_shape_signature(q_body)),
        "accent": None if q_accent is None or q_accent.type != "CURVE" else payload_hash(curve_shape_signature(q_accent)),
    }
    qfund_hits = sorted(name for name in [obj.name for obj in bpy.data.objects] + [material.name for material in bpy.data.materials] + [image.name for image in bpy.data.images] if "qfund" in name.casefold())
    phase4_font_objects = sorted(obj.name for obj in bpy.data.objects if obj.type == "FONT" and "phase4" in obj.name.casefold())
    q_scene_valid = (
        q_actual_names == q_expected_names
        and q_root is not None and q_root.type == "EMPTY"
        and q_root.get("phase4r0_q_authority") == cfg.Q_REVERSED_SOURCE.name
        and q_root.get("phase4r0_q_authority_sha256") == cfg.Q_REVERSED_SHA256
        and q_body is not None and q_body.type == "CURVE" and q_body.parent == q_root and q_body.get("phase4r0_svg_geometry_edited") is False
        and q_accent is not None and q_accent.type == "CURVE" and q_accent.parent == q_root and q_accent.get("phase4r0_svg_geometry_edited") is False
        and q_hashes == {"body": "e6e460a052da7994818add244bedc938f3a1093f452ae70c024dce214e27f55c", "accent": "d4267dcfa756bf76bbd238ed467564adf3ccf4fef1be54f9b96a57adf5c39523"}
        and [material.name for material in q_body.data.materials] == ["Phase4R0_Q_WhitePhosphor"]
        and [material.name for material in q_accent.data.materials] == ["Phase4R0_Q_MagentaPhosphor"]
        and not qfund_hits and not phase4_font_objects
    )
    check("derivative_exact_q_scene_authority", q_scene_valid, {"collection": q_actual_names, "root_source": None if q_root is None else q_root.get("phase4r0_q_authority"), "root_sha256": None if q_root is None else q_root.get("phase4r0_q_authority_sha256"), "geometry_hashes": q_hashes, "qfund_hits": qfund_hits, "phase4_font_objects": phase4_font_objects})
    check("timeline_frozen", bpy.context.scene.frame_start == 1 and bpy.context.scene.frame_end == 540 and bpy.context.scene.render.fps == 30, [bpy.context.scene.frame_start, bpy.context.scene.frame_end, bpy.context.scene.render.fps])

    required_collections = [
        "PHASE4R1_HALL_FLOOR", "PHASE4R1_HALL_STRUCTURE", "PHASE4R1_HALL_ARCHITECTURE",
        "PHASE4R1_HALL_OPERATIONAL_DETAILS", "PHASE4R1_HALL_MACHINERY", "PHASE4R1_DISTRIBUTION_SOURCE",
        "PHASE4R1_HALL_LIGHTING", "PHASE4R1_CABLE_LOCAL_RESPONSE_LIGHTS", "PHASE4R1_CAMERA_RIGS",
    ] + [spec["collection"] for spec in cfg.CABLE_SPECS.values()]
    missing_collections = [name for name in required_collections if bpy.data.collections.get(name) is None]
    check("required_r1_collections", not missing_collections, {"missing": missing_collections})
    superseded = build["preservation"]["superseded_r0_collections_hidden"]
    not_hidden = [name for name in superseded if bpy.data.collections.get(name) is not None and not bpy.data.collections[name].hide_render]
    check("superseded_r0_collections_hidden", not not_hidden, {"not_hidden": not_hidden, "inventory": superseded})
    check("accepted_central_identity_retained", bpy.data.collections.get("INDUSTRIAL_PROVING_GROUND") is not None and not bpy.data.collections["INDUSTRIAL_PROVING_GROUND"].hide_render, "INDUSTRIAL_PROVING_GROUND")

    images = []
    broken_paths = []
    for image in bpy.data.images:
        if image.source == "FILE" and not image.packed_file:
            path = Path(bpy.path.abspath(image.filepath))
            images.append(str(path))
            if not path.exists():
                broken_paths.append(str(path))
    libraries = [library.filepath for library in bpy.data.libraries]
    movie_clips = [clip.filepath for clip in bpy.data.movieclips]
    sounds = [sound.filepath for sound in bpy.data.sounds]
    missing_textures = list(broken_paths)
    unresolved_libraries = [path for path in libraries if not Path(bpy.path.abspath(path)).exists()]
    check("no_missing_textures", not missing_textures, missing_textures)
    check("no_unresolved_libraries", not unresolved_libraries, unresolved_libraries)
    check("no_external_media_dependencies", not movie_clips and not sounds, {"movie_clips": movie_clips, "sounds": sounds})
    used_unpacked_external = [str(Path(bpy.path.abspath(image.filepath))) for image in bpy.data.images if image.source == "FILE" and image.users > 0 and not image.packed_file]
    used_packed = [image.name for image in bpy.data.images if image.users > 0 and image.packed_file]
    unused_packed = [image.name for image in bpy.data.images if image.users == 0 and image.packed_file]
    packed_resource_state = {
        "used_assets_packed": not used_unpacked_external,
        "unused_assets_packed": bool(unused_packed),
        "proof": {"used_unpacked_external": used_unpacked_external, "used_packed_images": used_packed, "unused_packed_images": unused_packed, "external_library_count": len(libraries), "external_movie_clip_count": len(movie_clips), "external_sound_count": len(sounds), "zero_external_resources": not images and not libraries and not movie_clips and not sounds},
    }
    check("packed_resource_state", packed_resource_state["used_assets_packed"] and not packed_resource_state["unused_assets_packed"], packed_resource_state)

    unsupported_caches = []
    for obj in bpy.data.objects:
        for modifier in obj.modifiers:
            if modifier.type in {"FLUID", "CLOTH", "DYNAMIC_PAINT", "PARTICLE_SYSTEM", "OCEAN"}:
                unsupported_caches.append(f"{obj.name}:{modifier.name}:{modifier.type}")
    check("no_unsupported_caches", not unsupported_caches, unsupported_caches)
    r1_materials = [material for material in bpy.data.materials if material.name.startswith("Phase4R1_")]
    image_nodes = [f"{material.name}:{node.name}" for material in r1_materials if material.node_tree for node in material.node_tree.nodes if node.bl_idname == "ShaderNodeTexImage"]
    check("r1_materials_procedural", not image_nodes, {"materials": len(r1_materials), "image_texture_nodes": image_nodes})

    opening = build["opening_measurements"]
    for family, measurement in opening.items():
        check(f"{family}_opening_required_objects", all(measurement[key] for key in ("source_station_intersects_frustum", "plug_intersects_frustum", "source_lead_intersects_frustum", "spiral_intersects_frustum", "crt_intersects_frustum")), measurement)
        check(f"{family}_opening_route_visibility", measurement["frustum_visible_cable_fraction"] >= 0.90, measurement["frustum_visible_cable_fraction"])
    check("desktop_crt_occupancy", 8.0 <= opening["desktop"]["crt_vertical_occupancy_percent"] <= 14.0, opening["desktop"]["crt_vertical_occupancy_percent"])
    # Independently resample the actual saved portrait rig and keyed current at
    # every required milestone. This binds the no-save composition intent to
    # the derivative rather than trusting config parameters or build claims.
    safe_rect = (0.04, 0.03, 0.96, 0.97)
    mobile_camera = bpy.data.objects[cfg.CAMERA_SPECS["mobile"]["camera"]]
    mobile_sheath = bpy.data.objects["Phase4R1_Mobile_ContinuousGraphiteSheath"]
    mobile_route = curve_points(mobile_sheath)
    mobile_cumulative = cumulative_lengths(mobile_route)
    mobile_total = mobile_cumulative[-1]
    crt_collection = bpy.data.collections["REFINED_CRT_ASSEMBLY"]
    crt_objects = [obj for obj in crt_collection.all_objects if obj.type == "MESH" and not obj.hide_render]
    crt_points = [obj.matrix_world @ Vector(corner) for obj in crt_objects for corner in obj.bound_box]
    source_object_names = [
        "P4R1_Distribution_Enclosure", "P4R1_Distribution_Pedestal", "P4R1_Distribution_IndustrialSocketOuter",
        "P4R1_Distribution_IndustrialSocketMouth", "P4R1_Distribution_IndustrialSocketCollar", "P4R1_Distribution_PlugLockingSeam",
        "P4R1_Distribution_MatchingPlug", "P4R1_Distribution_StrainRelief_00", "P4R1_Distribution_StrainRelief_01",
        "P4R1_Distribution_StrainRelief_02", "P4R1_Distribution_StrainRelief_03", "P4R1_Distribution_FloorSaddle",
        "P4R1_Distribution_FloorSaddle_LeftClamp", "P4R1_Distribution_FloorSaddle_RightClamp",
    ]
    source_points = [bpy.data.objects[name].matrix_world @ Vector(corner) for name in source_object_names for corner in bpy.data.objects[name].bound_box]
    source_points.extend(polyline_section(mobile_route, mobile_cumulative, 0.0, mobile_total * 0.125))
    plug_points = [bpy.data.objects["P4R1_Distribution_MatchingPlug"].matrix_world @ Vector(corner) for corner in bpy.data.objects["P4R1_Distribution_MatchingPlug"].bound_box]
    mobile_segments = sorted([obj for obj in bpy.data.collections[cfg.CABLE_SPECS["mobile"]["collection"]].objects if obj.name.startswith("Phase4R1_Mobile_Current_")], key=lambda obj: float(obj.get("phase4r1_progress_start", -1.0)))
    expected_mobile_active_counts = {76: 19, 106: 37, 165: 72, 225: 108}
    mobile_milestones: dict[str, Any] = {}
    mobile_valid = True
    for frame in (1, 76, 106, 165, 225):
        bpy.context.scene.frame_set(frame)
        bpy.context.scene.camera = mobile_camera
        bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y = cfg.CAMERA_SPECS["mobile"]["resolution"]
        bpy.context.scene.render.resolution_percentage = 100
        bpy.context.view_layer.update()
        crt_bounds = projected_bounds(bpy.context.scene, mobile_camera, crt_points)
        source_bounds = projected_bounds(bpy.context.scene, mobile_camera, source_points)
        plug_bounds = projected_bounds(bpy.context.scene, mobile_camera, plug_points)
        target_projected = world_to_camera_view(bpy.context.scene, mobile_camera, Vector(cfg.ORBIT_TARGET))
        record_data: dict[str, Any] = {"camera_world_m": list(mobile_camera.matrix_world.translation), "lens_mm": mobile_camera.data.lens, "shift_x": mobile_camera.data.shift_x, "shift_y": mobile_camera.data.shift_y, "crt_bounds_normalized": crt_bounds, "crt_inside_safe_rect": bounds_inside_rect(crt_bounds, safe_rect), "source_chain_bounds_normalized": source_bounds, "source_chain_inside_safe_rect": bounds_inside_rect(source_bounds, safe_rect), "plug_bounds_normalized": plug_bounds, "plug_inside_safe_rect": bounds_inside_rect(plug_bounds, safe_rect), "accepted_target_projected": [target_projected.x, target_projected.y, target_projected.z]}
        if frame >= 46:
            progress = (frame - 46) / (285 - 46)
            front_start = max(0.0, progress - cfg.CURRENT["front_width_fraction"])
            trailing_start = max(0.0, front_start - 0.125)
            prefix = polyline_section(mobile_route, mobile_cumulative, 0.0, mobile_total * progress)
            front = polyline_section(mobile_route, mobile_cumulative, mobile_total * front_start, mobile_total * progress)
            trailing = polyline_section(mobile_route, mobile_cumulative, mobile_total * trailing_start, mobile_total * front_start)
            prefix_visible = visible_length_in_rect(bpy.context.scene, mobile_camera, prefix, safe_rect)
            front_visible = visible_length_in_rect(bpy.context.scene, mobile_camera, front, safe_rect)
            trailing_visible = visible_length_in_rect(bpy.context.scene, mobile_camera, trailing, safe_rect)
            prefix_length, front_length, trailing_length = curve_length(prefix), curve_length(front), curve_length(trailing)
            active_indices = [index for index, obj in enumerate(mobile_segments) if obj.color[3] > 0.005]
            bright_indices = [index for index, obj in enumerate(mobile_segments) if obj.color[3] > (cfg.CURRENT["trail_strength_eevee"] / cfg.CURRENT["front_strength_eevee"] + 0.05)]
            expected_active_count = expected_mobile_active_counts[frame]
            expected_bright_indices = list(range(expected_active_count - 8, expected_active_count))
            trailing_requirement_m = 2.5 if frame == 76 else 3.5
            current_data = {"progress": progress, "prefix_bounds_normalized": projected_bounds(bpy.context.scene, mobile_camera, prefix), "prefix_visible_length_m": prefix_visible, "prefix_visible_fraction": 0.0 if prefix_length <= 1e-12 else prefix_visible / prefix_length, "active_front_bounds_normalized": projected_bounds(bpy.context.scene, mobile_camera, front), "active_front_visible_fraction": 0.0 if front_length <= 1e-12 else front_visible / front_length, "contiguous_trailing_excludes_active_front": True, "contiguous_trailing_progress_range": [trailing_start, front_start], "contiguous_trailing_bounds_normalized": projected_bounds(bpy.context.scene, mobile_camera, trailing), "contiguous_trailing_total_length_m": trailing_length, "contiguous_trailing_visible_length_m": trailing_visible, "contiguous_trailing_visible_fraction": 0.0 if trailing_length <= 1e-12 else trailing_visible / trailing_length, "absolute_length_requirement_m": trailing_requirement_m, "requirement_is_explicit_not_self_relaxing": True, "f76_available_pre_front_trail_m": trailing_length if frame == 76 else None, "f76_full_3_5m_mathematically_unavailable": frame == 76 and trailing_length < 3.5, "keyed_active_count": len(active_indices), "expected_keyed_active_count": expected_active_count, "keyed_active_indices": active_indices, "keyed_active_prefix_contiguous": active_indices == list(range(expected_active_count)), "keyed_bright_suffix_count": len(bright_indices), "expected_keyed_bright_suffix_count": 8, "keyed_bright_indices": bright_indices, "expected_keyed_bright_indices": expected_bright_indices, "keyed_bright_is_exact_active_suffix": bright_indices == expected_bright_indices}
            record_data["current"] = current_data
            current_valid = bounds_inside_rect(current_data["active_front_bounds_normalized"], safe_rect) and current_data["active_front_visible_fraction"] >= 0.95 and current_data["contiguous_trailing_visible_fraction"] >= 0.70 and current_data["contiguous_trailing_visible_length_m"] + 1e-6 >= current_data["absolute_length_requirement_m"] and current_data["prefix_visible_fraction"] >= 0.40 and current_data["prefix_visible_length_m"] >= 3.5 and current_data["keyed_active_count"] == expected_active_count and current_data["keyed_active_prefix_contiguous"] and current_data["keyed_bright_suffix_count"] == 8 and current_data["keyed_bright_is_exact_active_suffix"]
            mobile_valid = mobile_valid and current_valid
        mobile_valid = mobile_valid and record_data["crt_inside_safe_rect"]
        if frame == 1:
            mobile_valid = mobile_valid and record_data["source_chain_inside_safe_rect"]
        if frame == 76:
            mobile_valid = mobile_valid and record_data["plug_inside_safe_rect"] and bounds_inside_rect(source_bounds, (-0.02, -0.02, 1.02, 1.02))
        if frame == 106:
            mobile_valid = mobile_valid and abs(target_projected.x - 0.5) <= 0.01 and abs(target_projected.y - 0.5) <= 0.01
        mobile_milestones[str(frame)] = record_data
    mobile_f1_occupancy = 0.0 if mobile_milestones["1"]["crt_bounds_normalized"] is None else (mobile_milestones["1"]["crt_bounds_normalized"][3] - mobile_milestones["1"]["crt_bounds_normalized"][1]) * 100.0
    mobile_valid = mobile_valid and 14.0 <= mobile_f1_occupancy <= 22.0
    responsive_physical_fit_measurements = independently_validate_responsive_fit(
        bpy.context.scene,
        mobile_camera,
        mobile_route,
        source_points,
        crt_points,
        build["responsive_physical_fit_measurements"],
    )
    mobile_valid = mobile_valid and responsive_physical_fit_measurements["status"] == "PASS" and build["responsive_physical_fit_measurements"]["status"] == "PASS"
    check("mobile_crt_occupancy", mobile_valid, {"f1_occupancy_percent": mobile_f1_occupancy, "safe_rect": safe_rect, "milestones": mobile_milestones, "responsive_physical_fit_measurements": responsive_physical_fit_measurements, "source_build_responsive_status": build["responsive_physical_fit_measurements"]["status"]})

    # Independently prove the solid source hardware between the enclosure and
    # the animated cable centreline.  The socket itself is not the cable
    # origin: a distinct mouth/collar/seam/plug/relief chain carries the same
    # axis to the configured cable exit with no modeled gap.
    hardware_names = [
        "P4R1_Distribution_IndustrialSocketOuter",
        "P4R1_Distribution_IndustrialSocketMouth",
        "P4R1_Distribution_IndustrialSocketCollar",
        "P4R1_Distribution_PlugLockingSeam",
        "P4R1_Distribution_MatchingPlug",
        "P4R1_Distribution_StrainRelief_00",
        "P4R1_Distribution_StrainRelief_01",
        "P4R1_Distribution_StrainRelief_02",
        "P4R1_Distribution_StrainRelief_03",
    ]
    missing_hardware = [name for name in hardware_names if bpy.data.objects.get(name) is None]
    hardware_objects = [] if missing_hardware else [bpy.data.objects[name] for name in hardware_names]
    centres = [obj.matrix_world.translation.copy() for obj in hardware_objects]
    axial_order = bool(centres) and all(left.y > right.y for left, right in zip(centres, centres[1:]))
    axis_reference = Vector(cfg.HALL["socket_world_m"])
    axis_errors = [math.hypot(centre.x - axis_reference.x, centre.z - axis_reference.z) for centre in centres]
    spans = [world_bounds(obj) for obj in hardware_objects]
    adjacent_gaps = [max(0.0, left["min"][1] - right["max"][1]) for left, right in zip(spans, spans[1:])]
    cable_exit = Vector(cfg.HALL["cable_exit_world_m"])
    relief_exit_error = float("inf") if not spans else math.sqrt(
        (centres[-1].x - cable_exit.x) ** 2
        + (spans[-1]["min"][1] - cable_exit.y) ** 2
        + (centres[-1].z - cable_exit.z) ** 2
    )
    enclosure = bpy.data.objects.get("P4R1_Distribution_Enclosure")
    conduit = bpy.data.objects.get("P4R1_Distribution_InfrastructureConduit")
    gland = bpy.data.objects.get("P4R1_Distribution_ConduitTopGland")
    conduit_evidence: dict[str, Any] = {"objects_present": enclosure is not None and conduit is not None and gland is not None}
    conduit_top_intersection = False
    if enclosure is not None and conduit is not None and gland is not None:
        enclosure_bounds = world_bounds(enclosure)
        gland_bounds = world_bounds(gland)
        conduit_endpoint = curve_points(conduit)[-1]
        enclosure_top = enclosure_bounds["max"][2]
        endpoint_inside_top = (
            enclosure_bounds["min"][0] <= conduit_endpoint.x <= enclosure_bounds["max"][0]
            and enclosure_bounds["min"][1] <= conduit_endpoint.y <= enclosure_bounds["max"][1]
            and enclosure_top - 0.10 <= conduit_endpoint.z <= enclosure_top
        )
        gland_crosses_top = (
            gland_bounds["min"][2] <= enclosure_top <= gland_bounds["max"][2]
            and gland_bounds["max"][0] >= enclosure_bounds["min"][0]
            and gland_bounds["min"][0] <= enclosure_bounds["max"][0]
            and gland_bounds["max"][1] >= enclosure_bounds["min"][1]
            and gland_bounds["min"][1] <= enclosure_bounds["max"][1]
        )
        conduit_top_intersection = endpoint_inside_top and gland_crosses_top
        conduit_evidence = {
            "objects_present": True,
            "endpoint_world_m": list(conduit_endpoint),
            "enclosure_top_z_m": enclosure_top,
            "endpoint_depth_below_top_m": enclosure_top - conduit_endpoint.z,
            "endpoint_inside_enclosure_top": endpoint_inside_top,
            "gland_crosses_enclosure_top": gland_crosses_top,
            "enclosure_bounds": enclosure_bounds,
            "gland_bounds": gland_bounds,
        }
    feed_branch = bpy.data.objects.get("P4R1_Distribution_FacilityFeedBranch")
    west_tray = bpy.data.objects.get("P4R1_West_CableTray_Base")
    roof_chord = bpy.data.objects.get("P4R1_RoofChord_01_A")
    top_feed_objects_present = feed_branch is not None and conduit is not None and west_tray is not None and roof_chord is not None
    top_feed_valid = False
    top_feed_evidence: dict[str, Any] = {"objects_present": top_feed_objects_present}
    if top_feed_objects_present:
        feed_points = curve_points(feed_branch)
        conduit_points = curve_points(conduit)
        tray_bounds = world_bounds(west_tray)
        feed_start = feed_points[0]
        feed_end, conduit_start = feed_points[-1], conduit_points[0]
        feed_start_inside_tray = all(tray_bounds["min"][axis] - 1e-6 <= feed_start[axis] <= tray_bounds["max"][axis] + 1e-6 for axis in range(3))
        feed_conduit_gap = (feed_end - conduit_start).length
        feed_tangent = (feed_points[-1] - feed_points[-2]).normalized()
        conduit_tangent = (conduit_points[1] - conduit_points[0]).normalized()
        directed_tangent_dot = feed_tangent.dot(conduit_tangent)
        hanger_records = []
        hangers_valid = True
        roof_bounds = world_bounds(roof_chord)
        for index, support_x in enumerate((-8.8, -5.8, -2.8)):
            hanger = bpy.data.objects.get(f"P4R1_Distribution_FacilityFeedHanger_{index:02d}")
            clamp = bpy.data.objects.get(f"P4R1_Distribution_FacilityFeedHangerClamp_{index:02d}")
            if hanger is None or clamp is None:
                hangers_valid = False
                hanger_records.append({"index": index, "missing": True, "missing_objects": [name for name, obj in (("hanger", hanger), ("clamp", clamp)) if obj is None], "valid": False})
                continue
            hanger_bounds, clamp_bounds = world_bounds(hanger), world_bounds(clamp)
            branch_anchor = Vector((support_x, cfg.HALL["distribution_station_location_m"][1] + 0.04, 6.57))
            roof_anchor = Vector((support_x, -3.20, 8.45))
            branch_anchor_on_feed = min(point.x for point in feed_points) - 1e-6 <= branch_anchor.x <= max(point.x for point in feed_points) + 1e-6 and abs(branch_anchor.y - feed_start.y) <= 1e-6 and abs(branch_anchor.z - feed_start.z) <= 1e-6
            branch_anchor_inside = branch_anchor_on_feed and all(hanger_bounds["min"][axis] - 0.02 <= branch_anchor[axis] <= hanger_bounds["max"][axis] + 0.02 for axis in range(3)) and bounds_overlap(hanger_bounds, clamp_bounds)
            roof_anchor_inside = all(hanger_bounds["min"][axis] - 0.02 <= roof_anchor[axis] <= hanger_bounds["max"][axis] + 0.02 for axis in range(3)) and bounds_overlap(hanger_bounds, roof_bounds)
            valid_hanger = branch_anchor_inside and roof_anchor_inside
            hangers_valid = hangers_valid and valid_hanger
            hanger_records.append({"index": index, "missing": False, "hanger": hanger.name, "clamp": clamp.name, "branch_anchor_object": feed_branch.name, "structural_anchor_object": roof_chord.name, "roof_anchor_object": roof_chord.name, "branch_anchor_world_m": list(branch_anchor), "roof_anchor_world_m": list(roof_anchor), "branch_anchor_on_feed_axis": branch_anchor_on_feed, "branch_anchor_and_clamp_overlap": branch_anchor_inside, "roof_chord_overlap": roof_anchor_inside, "valid": valid_hanger})
        top_feed_valid = feed_start_inside_tray and feed_conduit_gap <= 1e-6 and directed_tangent_dot >= math.cos(math.radians(5.0)) and hangers_valid
        top_feed_evidence = {"objects_present": True, "feed_branch": feed_branch.name, "authenticated_tray": west_tray.name, "vertical_conduit": conduit.name, "feed_start_world_m": list(feed_start), "feed_start_inside_tray": feed_start_inside_tray, "tray_bounds": tray_bounds, "feed_end_world_m": list(feed_end), "conduit_start_world_m": list(conduit_start), "feed_to_conduit_gap_m": feed_conduit_gap, "directed_tangent_dot": directed_tangent_dot, "tangent_angle_degrees": math.degrees(math.acos(max(-1.0, min(1.0, directed_tangent_dot)))), "hanger_count": len(hanger_records), "hangers": hanger_records, "all_hangers_attach_branch_to_named_roof_chord": hangers_valid, "valid": top_feed_valid}
    hardware_chain_evidence = {
        "required_objects": hardware_names,
        "missing_objects": missing_hardware,
        "centres_world_m": {obj.name: list(centre) for obj, centre in zip(hardware_objects, centres)},
        "strict_negative_y_axial_order": axial_order,
        "axis_errors_m": axis_errors,
        "maximum_axis_error_m": max(axis_errors, default=float("inf")),
        "adjacent_y_gaps_m": adjacent_gaps,
        "maximum_adjacent_gap_m": max(adjacent_gaps, default=float("inf")),
        "final_relief_to_cable_exit_error_m": relief_exit_error,
        "cable_exit_world_m": list(cable_exit),
        "conduit_to_enclosure": conduit_evidence,
        "facility_tray_to_conduit": top_feed_evidence,
    }
    hardware_chain_valid = (
        not missing_hardware
        and axial_order
        and max(axis_errors, default=float("inf")) <= 1e-6
        and max(adjacent_gaps, default=float("inf")) <= 1e-5
        and relief_exit_error <= 1e-5
        and conduit_top_intersection
        and top_feed_valid
    )
    check("source_hardware_chain_continuity", hardware_chain_valid, hardware_chain_evidence)

    rear_bridge_names = [
        "CRT_RearRemovableServicePanel",
        "P4R1_CRT_RearConnection_SeatedBase",
        "P4R1_CRT_RearConnection_AxialBridge",
        "P4R1_CRT_RearConnection_ResponseRing",
    ]
    rear_bridge_missing = [name for name in rear_bridge_names if bpy.data.objects.get(name) is None]
    rear_bridge_objects = [] if rear_bridge_missing else [bpy.data.objects[name] for name in rear_bridge_names]
    if rear_bridge_missing:
        rear_bridge_evidence = {
            "required_objects": rear_bridge_names,
            "missing_objects": rear_bridge_missing,
            "valid": False,
        }
        rear_bridge_valid = False
    else:
        accepted_panel, seated_base, axial_bridge, response_ring = rear_bridge_objects
        accepted_bounds = world_bounds(accepted_panel)
        base_bounds = world_bounds(seated_base)
        axial_bounds = world_bounds(axial_bridge)
        response_bounds = world_bounds(response_ring)
        axis_x, _, axis_z = cfg.HALL["crt_rear_connection_world_m"]
        bridge_axis_errors = {
            obj.name: math.hypot(obj.matrix_world.translation.x - axis_x, obj.matrix_world.translation.z - axis_z)
            for obj in (seated_base, axial_bridge, response_ring)
        }
        axial_gaps = {
            "accepted_panel_to_seated_base_m": max(0.0, base_bounds["min"][1] - accepted_bounds["max"][1]),
            "seated_base_to_axial_bridge_m": max(0.0, axial_bounds["min"][1] - base_bounds["max"][1]),
            "axial_bridge_to_response_ring_m": max(0.0, response_bounds["min"][1] - axial_bounds["max"][1]),
        }
        accepted_panel_overlap = bounds_overlap(accepted_bounds, base_bounds)
        rear_bridge_valid = accepted_panel_overlap and max(bridge_axis_errors.values()) <= 1e-6 and max(axial_gaps.values()) <= 1e-6
        rear_bridge_evidence = {
            "required_objects": rear_bridge_names,
            "missing_objects": [],
            "axis_world_xz_m": [axis_x, axis_z],
            "axis_errors_m": bridge_axis_errors,
            "maximum_axis_error_m": max(bridge_axis_errors.values()),
            "world_bounds": {
                accepted_panel.name: accepted_bounds,
                seated_base.name: base_bounds,
                axial_bridge.name: axial_bounds,
                response_ring.name: response_bounds,
            },
            "axial_visible_gaps_m": axial_gaps,
            "maximum_visible_gap_m": max(axial_gaps.values()),
            "accepted_panel_and_seated_base_bounds_overlap": accepted_panel_overlap,
            "accepted_crt_object_mutated": False,
            "valid": rear_bridge_valid,
        }

    cable_metrics: dict[str, Any] = {}
    for family, spec in cfg.CABLE_SPECS.items():
        sheath = bpy.data.objects[f"Phase4R1_{family.title()}_ContinuousGraphiteSheath"]
        points = curve_points(sheath)
        length = curve_length(points)
        intersections = self_intersections(points)
        planform_crossings = separated_planform_crossings(points)
        insufficient_clearance = [item for item in planform_crossings if item["centreline_vertical_clearance_m"] < spec["diameter_m"]]
        bend_evidence = minimum_bend_radius_evidence(points)
        bend_radius = float(bend_evidence["radius_m"])
        spiral_floor_points = points[148 : 148 + int(spec["route_samples"])]
        contact_error = max(abs((point.z - spec["diameter_m"] * 0.5)) for point in spiral_floor_points)
        cable_exit_error = (points[0] - Vector(cfg.HALL["cable_exit_world_m"])).length
        source_error = cable_exit_error
        destination_error = (points[-1] - Vector(cfg.HALL["crt_rear_connection_world_m"])).length
        cumulative = cumulative_lengths(points)
        total_length = cumulative[-1]
        terminal_samples = [point_at_distance(points, cumulative, total_length - 0.20 + 0.20 * index / 20.0) for index in range(21)]
        terminal_direction = (terminal_samples[-1] - terminal_samples[0]).normalized()
        terminal_dot = terminal_direction.dot(Vector((0.0, -1.0, 0.0)))
        terminal_radial_errors = [math.hypot(point.x - cfg.HALL["crt_rear_connection_world_m"][0], point.z - cfg.HALL["crt_rear_connection_world_m"][2]) for point in terminal_samples]
        terminal_monotonic_y = all(left.y + 1e-9 >= right.y for left, right in zip(terminal_samples, terminal_samples[1:]))
        outer_face_error = min((point - Vector(cfg.HALL["crt_gland_cable_entry_world_m"])).length for point in points)
        transition_start = point_at_distance(points, cumulative, total_length - 0.25)
        transition_dot = (terminal_samples[0] - transition_start).normalized().dot(Vector((0.0, -1.0, 0.0)))
        terminal_valid = terminal_dot >= math.cos(math.radians(12.0)) and transition_dot >= math.cos(math.radians(12.0)) and max(terminal_radial_errors) <= 0.03 and terminal_monotonic_y and outer_face_error <= 1e-6 and destination_error <= 1e-6 and rear_bridge_valid
        terminal_evidence = {"sampled_arc_length_m": 0.20, "directed_tangent": list(terminal_direction), "directed_dot_to_negative_y": terminal_dot, "angle_to_negative_y_degrees": math.degrees(math.acos(max(-1.0, min(1.0, terminal_dot)))), "transition_dot_to_negative_y": transition_dot, "maximum_radial_xz_error_m": max(terminal_radial_errors), "monotonic_decreasing_y": terminal_monotonic_y, "outer_face_error_m": outer_face_error, "accepted_collar_endpoint_error_m": destination_error, "seated_hardware_bridge": rear_bridge_evidence, "samples_world_m": [list(point) for point in terminal_samples], "valid": terminal_valid}
        segments = sorted([obj for obj in bpy.data.collections[spec["collection"]].objects if obj.name.startswith(f"Phase4R1_{family.title()}_Current_")], key=lambda obj: float(obj.get("phase4r1_progress_start", -1.0)))
        arrivals = [int(obj["phase4r1_arrival_frame"]) for obj in segments]
        progression: dict[str, Any] = {}
        contiguous = True
        for frame in (1, 45, 46, 106, 165, 225, 285, 405, 500):
            bpy.context.scene.frame_set(frame)
            active = [index for index, obj in enumerate(segments) if obj.color[3] > 0.005]
            prefix = list(range(len(active))) if active else []
            frame_contiguous = active == prefix
            contiguous = contiguous and frame_contiguous
            progression[str(frame)] = {"active_count": len(active), "contiguous_prefix": frame_contiguous, "first": active[0] if active else None, "last": active[-1] if active else None}
        cable_metrics[family] = {
            "length_m": round(length, 6), "diameter_m": spec["diameter_m"], "turns": spec["turns"],
            "route_planform": build["cable"]["families"][family]["route_planform"],
            "source_error_m": source_error, "cable_exit_error_m": cable_exit_error, "destination_error_m": destination_error,
            "rear_terminal_corridor": terminal_evidence,
            "self_intersections": intersections, "minimum_bend_radius_m": round(bend_radius, 6),
            "planform_crossings": planform_crossings,
            "planform_crossings_with_insufficient_sheath_clearance": insufficient_clearance,
            "minimum_bend_radius_evidence": bend_evidence,
            "spiral_floor_contact_max_centre_error_m": round(contact_error, 8),
            "segment_count": len(segments), "arrival_first": min(arrivals), "arrival_last": max(arrivals),
            "arrival_monotonic": all(a <= b for a, b in zip(arrivals, arrivals[1:])),
            "progression": progression,
        }
        check(f"{family}_route_source_destination_continuity", source_error <= 1e-5 and destination_error <= 1e-5 and terminal_valid, cable_metrics[family])
        check(f"{family}_no_planform_self_intersections", not intersections, intersections)
        check(f"{family}_planform_crossings_physically_separated", not insufficient_clearance, {"diameter_m": spec["diameter_m"], "crossings": planform_crossings, "insufficient": insufficient_clearance})
        check(f"{family}_minimum_bend_radius", bend_radius >= spec["diameter_m"] * 3.0, {"actual_m": bend_radius, "minimum_m": spec["diameter_m"] * 3.0, "diagnostic": bend_evidence})
        check(f"{family}_floor_contact", contact_error <= 0.0031, contact_error)
        check(f"{family}_arc_length_current_contract", len(segments) == spec["segments"] and min(arrivals) == 46 and max(arrivals) == 285 and all(a <= b for a, b in zip(arrivals, arrivals[1:])) and contiguous, cable_metrics[family])
        check(f"{family}_energized_through_q", progression["405"]["active_count"] == len(segments), progression["405"])

    bpy.context.scene.frame_set(1)
    current_objects = [obj for family, spec in cfg.CABLE_SPECS.items() for obj in bpy.data.collections[spec["collection"]].objects if obj.name.startswith(f"Phase4R1_{family.title()}_Current_")]
    magenta_alpha = [obj.name for obj in current_objects if obj.color[3] > 0.0]
    response_lights = [obj for obj in bpy.data.collections["PHASE4R1_CABLE_LOCAL_RESPONSE_LIGHTS"].objects if obj.data.energy > 0.0]
    source_alpha = bpy.data.objects["P4R1_Distribution_SourceResponseIndicator"].color[3]
    rear_alpha = bpy.data.objects["P4R1_CRT_RearConnection_ResponseRing"].color[3]
    check("f1_dormancy_zero_magenta", not magenta_alpha and not response_lights and source_alpha == 0.0 and rear_alpha == 0.0, {"active_conductors": magenta_alpha, "active_response_lights": [obj.name for obj in response_lights], "source_alpha": source_alpha, "rear_alpha": rear_alpha})
    bpy.context.scene.frame_set(46)
    check("source_response_exact_f46", bpy.data.objects["P4R1_Distribution_SourceResponseIndicator"].color[3] > 0.0, bpy.data.objects["P4R1_Distribution_SourceResponseIndicator"].color[3])
    bpy.context.scene.frame_set(285)
    check("rear_connection_response_exact_f285", bpy.data.objects["P4R1_CRT_RearConnection_ResponseRing"].color[3] > 0.0, bpy.data.objects["P4R1_CRT_RearConnection_ResponseRing"].color[3])

    camera_metrics: dict[str, Any] = {}
    for family, spec in cfg.CAMERA_SPECS.items():
        camera = bpy.data.objects[spec["camera"]]
        rig = bpy.data.objects[spec["rig"]]
        constraint = camera.constraints.get("Phase4R1_AuditableLookAtAcceptedCRT")
        bpy.context.scene.frame_set(46)
        start_angle = math.degrees(rig.rotation_euler.z)
        start_world = camera.matrix_world.translation.copy()
        bpy.context.scene.frame_set(106)
        expected_target_name = "Phase4R1_EstablishingAimTarget" if family == "desktop" else f"Phase4R1_EstablishingAimTarget_{family.title()}"
        family_target = bpy.data.objects.get(expected_target_name)
        aim_at_106 = Vector((float("inf"),) * 3) if family_target is None else family_target.matrix_world.translation.copy()
        bpy.context.scene.frame_set(165)
        rear_world = camera.matrix_world.translation.copy()
        rear_radius = math.hypot(rear_world.x - cfg.ORBIT_TARGET[0], rear_world.y - cfg.ORBIT_TARGET[1])
        rear_elevation = rear_world.z - cfg.ORBIT_TARGET[2]
        rear_down = math.degrees(math.atan2(rear_elevation, rear_radius))
        bpy.context.scene.frame_set(285)
        end_angle = math.degrees(rig.rotation_euler.z)
        end_world = camera.matrix_world.translation.copy()
        audit = build["camera_motion"][family]
        camera_metrics[family] = {"start_world": list(start_world), "end_world": list(end_world), "start_angle": start_angle, "end_angle": end_angle, "rear_world": list(rear_world), "rear_downward_angle": rear_down, "build_audit": audit}
        zero_manual_camera_rotation = sum(abs(float(value)) for value in camera.rotation_euler) < 1e-7
        check(f"{family}_camera_structure", constraint is not None and constraint.target is not None and constraint.target.name == expected_target_name and family_target is not None and zero_manual_camera_rotation and abs(rig.rotation_euler.x) < 1e-7 and abs(rig.rotation_euler.y) < 1e-7, {**camera_metrics[family], "expected_target": expected_target_name, "actual_target": None if constraint is None or constraint.target is None else constraint.target.name})
        check(f"{family}_camera_360_monotonic", abs((end_angle - start_angle) - 360.0) <= 0.001 and audit["monotonic_angle"] and audit["monotonic_contracting_radius"] and audit["monotonic_descent"] and audit["no_roll"], audit)
        check(f"{family}_opening_pitch_22_32", 22.0 <= audit["downward_view_angle_start_degrees"] <= 32.0, audit["downward_view_angle_start_degrees"])
        check(f"{family}_crt_centered_by_f106", (aim_at_106 - Vector(cfg.ORBIT_TARGET)).length <= 1e-6 and audit["crt_centered_by_frame"] <= 106, list(aim_at_106))
        check(f"{family}_rear_mass_view_not_roof", rear_world.y > cfg.ORBIT_TARGET[1] and rear_down <= 15.0, {"rear_world": list(rear_world), "downward_angle": rear_down})

    quadrants = {"southwest": 0, "southeast": 0, "northwest": 0, "northeast": 0}
    for obj in bpy.data.objects:
        if not obj.get("phase4r1_authored", False) or obj.hide_render:
            continue
        x, y = obj.matrix_world.translation.x - cfg.ORBIT_TARGET[0], obj.matrix_world.translation.y - cfg.ORBIT_TARGET[1]
        quadrants[("north" if y >= 0 else "south") + ("east" if x >= 0 else "west")] += 1
    check("environment_authored_in_all_orbit_quadrants", all(count >= 12 for count in quadrants.values()), quadrants)
    check("fixed_exposure", bpy.context.scene.view_settings.exposure == 0.0, bpy.context.scene.view_settings.exposure)

    signature_authority = build["preservation"]["inherited_r0_action_signature"]
    expected_action_names = set(signature_authority["before"]["action_names"])
    recomputed_signature = action_inventory_signature(expected_action_names)
    missing_actions = sorted(expected_action_names - set(recomputed_signature["action_names"]))
    signature_matches = (
        not missing_actions
        and recomputed_signature["action_count"] == signature_authority["before"]["action_count"]
        and recomputed_signature["keyframe_point_count"] == signature_authority["before"]["keyframe_point_count"]
        and recomputed_signature["sha256"] == signature_authority["before"]["sha256"]
    )
    value_mismatches = [] if signature_matches else [{"expected_sha256": signature_authority["before"]["sha256"], "actual_sha256": recomputed_signature["sha256"]}]
    inherited_crt_actions = {
        "source_action_count": 421,
        "source_keyframe_count": 17266,
        "valid": signature_matches and bool(signature_authority["valid"]),
        "missing_actions": missing_actions,
        "value_mismatches": value_mismatches,
        "complete_r0_inventory": {"expected_action_count": signature_authority["before"]["action_count"], "expected_keyframe_point_count": signature_authority["before"]["keyframe_point_count"], "expected_sha256": signature_authority["before"]["sha256"], "recomputed": recomputed_signature},
        "evidence_chain": "exact hashed R0 source and prior R0 54/54 proof for 421 inherited CRT Actions/17,266 points, plus independent byte-stable signature of every preexisting R0 Action curve/keyframe field through R1 construction",
    }
    check("inherited_crt_action_integrity", inherited_crt_actions["valid"], inherited_crt_actions)
    check("full_production_not_started", not build["full_production_rendering_started"] and not build["runtime_integration_started"] and not build["phase5_authorized"], {key: build[key] for key in ("full_production_rendering_started", "runtime_integration_started", "phase5_authorized")})

    failed = [item for item in checks if item["status"] != "PASS"]
    quantum_q = {
        "geometry_authority": record(cfg.Q_REVERSED_SOURCE),
        "color_authority": record(cfg.Q_COLOR_SOURCE),
        "accepted_r0_q_root": "Phase4R0_ApprovedQuantumQ_Root",
        "geometry_or_animation_changed_in_r1": False,
        "isolated_from_approved_svg": True,
        "redrawn_or_approximated": False,
        "qfund_or_third_party_logo_used": False,
    }
    report = {
        "schema": "quantum-hub.phase-4-r1-proving-hall.source-validation.v1",
        "status": "PASS" if not failed else "FAIL",
        "blender_version": bpy.app.version_string,
        "accepted_phase4r0_parent": cfg.ACCEPTED_PHASE4R0_COMMIT,
        "accepted_phase4r0_source": record(cfg.ACCEPTED_PHASE4R0_SOURCE),
        "phase4r1_derivative": record(opened),
        "source_build": build_record,
        "source_build_report": build_record,
        "source_build_sha256": build_record["sha256"],
        "producer_authorities": producer_authorities,
        "asset_ledger": record(cfg.ASSET_LEDGER),
        "check_count": len(checks),
        "failed_count": len(failed),
        "checks": checks,
        "missing_textures": missing_textures,
        "unresolved_libraries": unresolved_libraries,
        "broken_paths": broken_paths,
        "unsupported_caches": unsupported_caches,
        "packed_resource_state": packed_resource_state,
        "inherited_crt_actions": inherited_crt_actions,
        "quantum_q": quantum_q,
        "quantum_q_authorities": {"geometry": quantum_q["geometry_authority"], "color": quantum_q["color_authority"], "valid": q_scene_valid},
        "opening_measurements": opening,
        "responsive_physical_fit_measurements": responsive_physical_fit_measurements,
        "responsive_physical_fit_measurements_sha256": canonical_payload_hash(responsive_physical_fit_measurements),
        "source_build_responsive_physical_fit_measurements_sha256": canonical_payload_hash(build["responsive_physical_fit_measurements"]),
        "cable_metrics": cable_metrics,
        "camera_metrics": camera_metrics,
        "external_assets": [],
        "full_production_rendering_started": False,
        "runtime_integration_started": False,
        "phase5_authorized": False,
    }
    cfg.VALIDATION_REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"QH_PHASE4R1_VALIDATION_STATUS={report['status']}")
    print(f"QH_PHASE4R1_VALIDATION_CHECKS={len(checks)} FAILED={len(failed)}")
    print(f"QH_PHASE4R1_VALIDATION_REPORT={cfg.VALIDATION_REPORT}")
    if failed:
        raise RuntimeError(f"Phase 4-R1 source validation failed: {[item['id'] for item in failed]}")


if __name__ == "__main__":
    main()
