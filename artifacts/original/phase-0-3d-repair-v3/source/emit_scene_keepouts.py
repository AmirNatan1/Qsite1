"""Project authored Phase 0.3 station/cable geometry into frozen scene pixels.

The output is a deterministic source-space authority for browser collision QA.
It uses evaluated Blender geometry at the dormant state, never image thresholding
or hand-drawn estimates. Coordinates use a top-left origin in source pixels.
"""

from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view

sys.dont_write_bytecode = True

SCRIPT = Path(__file__).resolve()
PACKAGE = SCRIPT.parents[1]
BLEND = PACKAGE / "source" / "quantum-aperture-station-v3.blend"
OUTPUT = PACKAGE / "manifests" / "scene-source-keepouts.json"

STATION_PREFIXES = (
    "Aperture_",
    "Foundation_",
    "GroundAnchor_",
    "InstalledFoundation_",
    "InternalTransfer_",
    "MechanicalResponse_",
    "PhysicalScreen_",
    "Station_",
)

SOURCES = (
    ("desktop-dormant", "renders/hero/desktop-dormant-base.png", "Camera_DesktopHero", 1920, 1200),
    ("mobile-dormant", "renders/hero/mobile-dormant-base.png", "Camera_MobileHero", 720, 1600),
    ("reduced-desktop", "renders/hero/reduced-desktop-base.png", "Camera_DesktopHero", 1600, 1000),
    ("reduced-mobile", "renders/hero/reduced-mobile-base.png", "Camera_MobileHero", 720, 1600),
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def convex_hull(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    unique = sorted(set(points))
    if len(unique) <= 1:
        return unique

    def cross(origin, a, b):
        return (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0])

    lower: list[tuple[float, float]] = []
    for point in unique:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)
    upper: list[tuple[float, float]] = []
    for point in reversed(unique):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)
    return lower[:-1] + upper[:-1]


def project(scene, camera, point, width: int, height: int) -> tuple[float, float] | None:
    ndc = world_to_camera_view(scene, camera, point)
    if ndc.z <= 0:
        return None
    return (ndc.x * width, (1.0 - ndc.y) * height)


def evaluated_vertices(obj, depsgraph):
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        matrix = evaluated.matrix_world
        return [matrix @ vertex.co for vertex in mesh.vertices]
    finally:
        evaluated.to_mesh_clear()


def clamp(value: float, maximum: int) -> int:
    return max(0, min(maximum, round(value)))


def bbox(points: list[tuple[float, float]], width: int, height: int, padding: int) -> dict:
    x0 = clamp(min(point[0] for point in points) - padding, width)
    y0 = clamp(min(point[1] for point in points) - padding, height)
    x1 = clamp(max(point[0] for point in points) + padding, width)
    y1 = clamp(max(point[1] for point in points) + padding, height)
    return {"x": x0, "y": y0, "w": max(0, x1 - x0), "h": max(0, y1 - y0)}


def dormant_state(scene) -> None:
    control = bpy.data.objects["CTRL_V3_StillStates"]
    for name in ("conduction", "foundation", "internal", "iris", "screen", "portal"):
        control[name] = 0.0
    control.update_tag(refresh={"OBJECT"})
    scene.frame_set(scene.frame_current)
    bpy.context.view_layer.update()


def source_record(source_id: str, image_path: str, camera_name: str, width: int, height: int) -> dict:
    scene = bpy.context.scene
    # Camera projection depends on the scene pixel aspect. Match the exact
    # authored source before querying world_to_camera_view, especially for the
    # independent 720×1600 portrait camera.
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = 1.0
    scene.render.pixel_aspect_y = 1.0
    camera = bpy.data.objects[camera_name]
    depsgraph = bpy.context.evaluated_depsgraph_get()
    station_points: list[tuple[float, float]] = []
    station_objects: list[str] = []
    for obj in bpy.data.objects:
        if obj.hide_render or not obj.name.startswith(STATION_PREFIXES) or obj.name.endswith("Cutter"):
            continue
        if camera_name == "Camera_MobileHero" and obj.name == "GroundAnchor_RecessedSlot_2":
            continue
        if obj.type not in {"MESH", "CURVE", "FONT"}:
            continue
        projected = [project(scene, camera, point, width, height) for point in evaluated_vertices(obj, depsgraph)]
        projected = [point for point in projected if point is not None]
        if projected:
            station_points.extend(projected)
            station_objects.append(obj.name)

    station_padding = max(5, round(width * 0.0045))
    hull = convex_hull(station_points)
    station_polygon = [[clamp(x, width), clamp(y, height)] for x, y in hull]

    sheath_name = "MobileCable_PhysicalGraphiteSheath" if camera_name == "Camera_MobileHero" else "Cable_PhysicalGraphiteSheath"
    sheath = bpy.data.objects[sheath_name]
    projected_ordered: list[tuple[float, float] | None] = []
    for spline in sheath.data.splines:
        for point in spline.points:
            projected = project(scene, camera, sheath.matrix_world @ point.co.to_3d(), width, height)
            projected_ordered.append(projected)
    centerline = [point for point in projected_ordered if point is not None]
    authored_turns = float(sheath.get("turns", 0.0))
    spiral_point_count = int(sheath.get("spiral_point_count", max(0, len(projected_ordered) - 3)))
    spiral_projected = projected_ordered[:spiral_point_count]
    visible_flags = [
        point is not None and 0.0 <= point[0] <= width and 0.0 <= point[1] <= height
        for point in spiral_projected
    ]
    runs: list[tuple[int, int]] = []
    run_start = None
    for index, visible in enumerate(visible_flags + [False]):
        if visible and run_start is None:
            run_start = index
        elif not visible and run_start is not None:
            runs.append((run_start, index - 1))
            run_start = None
    denominator = max(1, spiral_point_count - 1)
    visible_intervals = [
        {
            "start_progress": round(start / denominator, 6),
            "end_progress": round(end / denominator, 6),
            "turns": round((end - start) / denominator * authored_turns, 6),
        }
        for start, end in runs
    ]
    visible_turns = sum(interval["turns"] for interval in visible_intervals)
    is_mobile = camera_name == "Camera_MobileHero"
    pass_threshold = 2.15 if is_mobile else None
    cable_padding = max(6, round(width * 0.006))
    stride = max(2, len(centerline) // 32)
    rectangles = []
    for start in range(0, len(centerline) - 1, stride):
        segment = centerline[start : min(len(centerline), start + stride + 1)]
        if len(segment) >= 2:
            rectangles.append(bbox(segment, width, height, cable_padding))

    image = PACKAGE / image_path
    return {
        "id": source_id,
        "source": {
            "path": image_path,
            "width": width,
            "height": height,
            "bytes": image.stat().st_size,
            "sha256": sha256(image),
        },
        "camera": camera_name,
        "coordinate_system": "top-left origin; x right; y down; source pixels",
        "station": {
            "objects": sorted(station_objects),
            "padding_px": station_padding,
            "bbox": bbox(station_points, width, height, station_padding),
            "convex_hull_polygon": station_polygon,
        },
        "cable": {
            "object": sheath.name,
            "authored_turns": authored_turns,
            "composition": "portrait-authored" if camera_name == "Camera_MobileHero" else "desktop",
            "padding_px": cable_padding,
            "centerline_point_count": len(centerline),
            "segment_rectangles": rectangles,
            "union_bbox": bbox(centerline, width, height, cable_padding),
            "visibility_evidence": {
                "method": "ordered authored spiral centerline projected through the exact camera/aspect; contiguous in-viewport angular intervals summed before the three-point below-grade tangent; visual occlusion audited separately",
                "viewport": {"width": width, "height": height},
                "spiral_point_count": spiral_point_count,
                "visible_point_count": sum(visible_flags),
                "visible_progress_intervals": visible_intervals,
                "visible_turns_approx": round(visible_turns, 6),
                "visible_angular_span_degrees": round(visible_turns * 360.0, 3),
                "gate_scope": (
                    "mobile-visible-turn-gate"
                    if is_mobile
                    else "informational-desktop-cinematic-crop"
                ),
                "pass_threshold_turns": pass_threshold,
                "pass": visible_turns >= pass_threshold if is_mobile else True,
            },
        },
    }


def main() -> None:
    scene = bpy.context.scene
    dormant_state(scene)
    records = [source_record(*source) for source in SOURCES]
    manifest = {
        "schema": "quantum-hub.phase-0-3d-repair-v3.scene-source-keepouts.v1",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "method": "Blender 5.2 evaluated geometry projection; station convex hull plus cable centerline segment rectangles",
        "source_blend": {"path": BLEND.relative_to(PACKAGE).as_posix(), "bytes": BLEND.stat().st_size, "sha256": sha256(BLEND)},
        "generator": {"path": SCRIPT.relative_to(PACKAGE).as_posix(), "sha256": sha256(SCRIPT)},
        "dormant_state": {"conduction": 0, "foundation": 0, "internal": 0, "iris": 0, "screen": 0, "portal": 0},
        "records": records,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"QH_V3_SOURCE_KEEPOUTS={len(records)}")
    print(f"QH_V3_SOURCE_KEEPOUT_MANIFEST={OUTPUT.resolve()}")


if __name__ == "__main__":
    main()
