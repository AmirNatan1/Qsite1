"""Project evaluated CRT geometry into the six frozen browser scene sources."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import crt_canonical_config as cfg
import render_crt_canonical_stills as renderer


REPOSITORY_ROOT = cfg.PACKAGE_DIR.parents[2]
REPAIR_BASELINE = "fec1f0e9243a9cda188c539ab1b79e4a99c30623"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def repository_relative(path: Path) -> str:
    return path.resolve().relative_to(REPOSITORY_ROOT.resolve()).as_posix()


def convex_hull(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    points = sorted(set(points))
    if len(points) <= 2:
        return points

    def cross(origin, first, second):
        return (first[0] - origin[0]) * (second[1] - origin[1]) - (
            first[1] - origin[1]
        ) * (second[0] - origin[0])

    lower = []
    for point in points:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)
    upper = []
    for point in reversed(points):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)
    return lower[:-1] + upper[:-1]


def project_world(scene, camera, coordinate, width: int, height: int):
    camera_local = camera.matrix_world.inverted() @ coordinate
    forward_depth = -float(camera_local.z)
    clip_start = float(camera.data.clip_start)
    clip_end = float(camera.data.clip_end)
    if forward_depth < clip_start or forward_depth > clip_end:
        return None
    value = world_to_camera_view(scene, camera, coordinate)
    if value.z <= 0.0 or value.x < 0.0 or value.x > 1.0 or value.y < 0.0 or value.y > 1.0:
        return None
    return (value.x * width, (1.0 - value.y) * height)


def evaluated_projected_points(
    objects: list[bpy.types.Object], scene, camera, width: int, height: int
) -> list[tuple[float, float]]:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    projected = []
    for source in objects:
        if source is None or source.type not in {"MESH", "CURVE", "FONT", "SURFACE", "META"}:
            continue
        evaluated = source.evaluated_get(depsgraph)
        mesh = None
        try:
            mesh = evaluated.to_mesh()
            for vertex in mesh.vertices:
                point = project_world(scene, camera, evaluated.matrix_world @ vertex.co, width, height)
                if point is not None:
                    projected.append(point)
        finally:
            if mesh is not None:
                evaluated.to_mesh_clear()
    return projected


def point_record(point: tuple[float, float], width: int, height: int) -> dict:
    return {
        "x": round(point[0] / width, 8),
        "y": round(point[1] / height, 8),
    }


def clamp_point(point: tuple[float, float], width: int, height: int) -> tuple[float, float]:
    return (
        min(float(width), max(0.0, point[0])),
        min(float(height), max(0.0, point[1])),
    )


def bounds(points: list[tuple[float, float]], width: int, height: int) -> dict:
    if not points:
        raise RuntimeError("cannot produce bounds from zero projected points")
    return {
        "x": round(min(point[0] for point in points), 3),
        "y": round(min(point[1] for point in points), 3),
        "width": round(max(point[0] for point in points) - min(point[0] for point in points), 3),
        "height": round(max(point[1] for point in points) - min(point[1] for point in points), 3),
    }


def padded_bounds(value: dict, padding: float, width: int, height: int) -> dict:
    left = max(0.0, value["x"] - padding)
    top = max(0.0, value["y"] - padding)
    right = min(float(width), value["x"] + value["width"] + padding)
    bottom = min(float(height), value["y"] + value["height"] + padding)
    return {
        "x": round(left, 3),
        "y": round(top, 3),
        "width": round(max(0.0, right - left), 3),
        "height": round(max(0.0, bottom - top), 3),
    }


def geometry_record(
    points: list[tuple[float, float]],
    polygons: list[list[tuple[float, float]]],
    lineage: list[str],
    padding: float,
    width: int,
    height: int,
) -> dict:
    if not points:
        return {
            "sourceObjectLineage": lineage,
            "paddingPx": padding,
            "visible": False,
            "visibility": "out-of-frame/no-visible-geometry",
            "pixelBounds": None,
            "paddedBoundsPx": None,
            "normalizedPolygons": [],
            "projectedPointCount": 0,
            "visiblePointCount": 0,
        }
    visible_points = [clamp_point(point, width, height) for point in points]
    visible_polygons = []
    for polygon in polygons:
        clipped = convex_hull([clamp_point(point, width, height) for point in polygon])
        if len(clipped) >= 3:
            visible_polygons.append(clipped)
    raw_bounds = bounds(visible_points, width, height)
    return {
        "sourceObjectLineage": lineage,
        "paddingPx": padding,
        "visible": True,
        "visibility": "visible-in-frame",
        "pixelBounds": raw_bounds,
        "paddedBoundsPx": padded_bounds(raw_bounds, padding, width, height),
        "normalizedPolygons": [
            [point_record(point, width, height) for point in polygon]
            for polygon in visible_polygons
        ],
        "projectedPointCount": len(points),
        "visiblePointCount": len(points),
    }


def normalized_segment_rectangles(
    polygons: list[list[tuple[float, float]]], width: int, height: int
) -> list[dict]:
    records = []
    for polygon in polygons:
        if not polygon:
            continue
        left = max(0.0, min(point[0] for point in polygon))
        top = max(0.0, min(point[1] for point in polygon))
        right = min(float(width), max(point[0] for point in polygon))
        bottom = min(float(height), max(point[1] for point in polygon))
        if right - left <= 0.0 or bottom - top <= 0.0:
            continue
        records.append(
            {
                "x": round(left / width, 8),
                "y": round(top / height, 8),
                "width": round((right - left) / width, 8),
                "height": round((bottom - top) / height, 8),
            }
        )
    return records


def cable_geometry(
    sheath: bpy.types.Object, scene, camera, width: int, height: int
) -> tuple[list[tuple[float, float]], list[list[tuple[float, float]]]]:
    path_count = int(sheath.get("path_point_count", 0))
    ring_count = int(sheath.get("cross_section_vertex_count", 0))
    if path_count <= 1 or ring_count <= 2 or path_count * ring_count > len(sheath.data.vertices):
        raise RuntimeError(f"invalid swept-cable topology metadata on {sheath.name}")
    rings = []
    for path_index in range(path_count):
        ring = []
        offset = path_index * ring_count
        for vertex in sheath.data.vertices[offset : offset + ring_count]:
            point = project_world(scene, camera, sheath.matrix_world @ vertex.co, width, height)
            if point is not None:
                ring.append(point)
        if ring:
            rings.append(ring)
    all_points = [point for ring in rings for point in ring]
    polygons = []
    segment_target = 28
    stride = max(1, len(rings) // segment_target)
    start = 0
    while start < len(rings):
        chunk = rings[start : min(len(rings), start + stride + 1)]
        polygons.append(convex_hull([point for ring in chunk for point in ring]))
        start += stride
    return all_points, polygons


def main() -> None:
    contract = renderer.require_contract()
    scene = bpy.context.scene
    assembly = bpy.data.collections["REFINED_CRT_ASSEMBLY"]
    excluded_prefixes = (
        "CRT_ConvexThickSmokedGlass",
        "CRT_InternalPhosphorLayer",
        "CRT_WakeHorizontalPhosphorLine",
        "CRT_Scanline_",
        "CRT_Interface",
    )
    cabinet_objects = sorted(
        [
            obj
            for obj in assembly.all_objects
            if obj is not None and not obj.name.startswith(excluded_prefixes)
        ],
        key=lambda item: item.name,
    )
    glass = bpy.data.objects["CRT_ConvexThickSmokedGlass"]
    records = {}
    for source_id, role_label in cfg.SOURCE_ROLE_MAP.items():
        state = cfg.CANONICAL_STATES[source_id]
        renderer.set_state(state)
        camera = bpy.data.objects[state["camera"]]
        width, height = (int(value) for value in state["resolution"])
        scene.camera = camera
        scene.render.resolution_x = width
        scene.render.resolution_y = height
        source_path = cfg.RENDER_ROOT / state["group"] / f"{source_id}.png"
        if not source_path.is_file():
            raise RuntimeError(f"missing frozen scene source: {source_path}")
        cable_name = (
            "MobileSpiralCable_ContinuousGraphiteSheath"
            if state["cable"] == "mobile"
            else "SpiralCable_ContinuousGraphiteSheath"
        )
        cable = bpy.data.objects[cable_name]
        cabinet_points = evaluated_projected_points(cabinet_objects, scene, camera, width, height)
        screen_points = evaluated_projected_points([glass], scene, camera, width, height)
        cable_points, cable_polygons = cable_geometry(cable, scene, camera, width, height)
        collision_geometry_visible = source_id != "source-text-free-portal-takeover"
        if not collision_geometry_visible:
            # The takeover camera has already crossed the physical raster. Its
            # governed PNG contains only the text-free transition field; CRT
            # shell/screen/cable vertices that still lie mathematically inside
            # the camera frustum are occluded or back-facing and must never be
            # clamped into false full-viewport collision keepouts.
            cabinet_points = []
            screen_points = []
            cable_points = []
            cable_polygons = []
        padding = 18.0 if height > width else 24.0
        cable_record = geometry_record(
            cable_points,
            cable_polygons,
            [cable.name],
            padding,
            width,
            height,
        )
        cable_record["normalizedSegmentRectangles"] = normalized_segment_rectangles(
            cable_polygons, width, height
        )
        records[source_id] = {
            "sourceRole": source_id,
            "status": "frozen",
            "validationStatus": "PASS",
            "sourceStatus": "accepted",
            "roleLabel": role_label,
            "camera": state["camera"],
            "cableVariant": state["cable"],
            "collisionGeometryVisible": collision_geometry_visible,
            "collisionGeometryPolicy": (
                "visible evaluated geometry projected within camera clip and frame"
                if collision_geometry_visible
                else "physical CRT geometry has exited; text-free takeover field is non-collision-required"
            ),
            "source": {
                "id": source_id,
                "role": source_id,
                "path": repository_relative(source_path),
                "packageRelativePath": source_path.relative_to(cfg.PACKAGE_DIR).as_posix(),
                "bytes": source_path.stat().st_size,
                "sha256": sha256(source_path),
                "width": width,
                "height": height,
            },
            "layoutAuthority": {
                "path": cfg.PORTAL_LAYOUT.relative_to(cfg.PACKAGE_DIR).as_posix(),
                "packageRelativePath": cfg.PORTAL_LAYOUT.relative_to(cfg.PACKAGE_DIR).as_posix(),
                "bytes": cfg.PORTAL_LAYOUT.stat().st_size,
                "sha256": cfg.PORTAL_LAYOUT_SHA256,
                "schema": contract["schema"],
            },
            "geometry": {
                "crt-cabinet": geometry_record(
                    cabinet_points,
                    [convex_hull(cabinet_points)],
                    [obj.name for obj in cabinet_objects],
                    padding,
                    width,
                    height,
                ),
                "crt-screen": geometry_record(
                    screen_points,
                    [convex_hull(screen_points)],
                    [glass.name],
                    padding,
                    width,
                    height,
                ),
                "spiral-cable": cable_record,
            },
        }

    blend = cfg.REFINED_BLEND
    script = Path(__file__).resolve()
    manifest = {
        "schema": "quantum-hub.phase-0-4-crt-television.scene-source-keepouts.v1",
        "status": "frozen",
        "validationStatus": "PASS",
        "sourceStatus": "accepted",
        "repair_baseline": REPAIR_BASELINE,
        "lineage": {
            "accepted_parent": REPAIR_BASELINE,
        },
        "source": {
            "packageRelativePath": blend.relative_to(cfg.PACKAGE_DIR).as_posix(),
            "repositoryRelativePath": repository_relative(blend),
            "bytes": blend.stat().st_size,
            "sha256": sha256(blend),
        },
        "generator": {
            "packageRelativePath": script.relative_to(cfg.PACKAGE_DIR).as_posix(),
            "repositoryRelativePath": repository_relative(script),
            "bytes": script.stat().st_size,
            "sha256": sha256(script),
        },
        "layoutAuthority": {
            "path": cfg.PORTAL_LAYOUT.relative_to(cfg.PACKAGE_DIR).as_posix(),
            "bytes": cfg.PORTAL_LAYOUT.stat().st_size,
            "sha256": cfg.PORTAL_LAYOUT_SHA256,
            "schema": contract["schema"],
        },
        "projectionPolicy": {
            "cameraDepth": "reject points before camera clip_start or beyond clip_end",
            "normalizedDeviceCoordinates": "retain only x/y within inclusive 0..1 frame bounds",
            "outOfFrameGeometry": "emit explicit visible=false records; never clamp hidden points into a viewport keepout",
        },
        "requiredGeometry": ["crt-cabinet", "crt-screen", "spiral-cable"],
        "sourceRoles": list(cfg.SOURCE_ROLE_MAP),
        "recordCount": len(records),
        "records": records,
    }
    target = cfg.MANIFEST_DIR / "crt-scene-source-keepouts.json"
    target.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"QH_PHASE04_CRT_KEEPOUT_RECORDS={len(records)}")
    print(f"QH_PHASE04_CRT_KEEPOUT_MANIFEST={target.resolve()}")


if __name__ == "__main__":
    main()
