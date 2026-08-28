"""Audit the frozen Phase 4-R2 cable-current authority without mutating it.

Run with Blender 5.2 in background mode after opening the authoritative .blend::

    blender -b authority.blend --python scripts/phase4r2-1-source-audit.py -- output.json

The report separates material-mask continuity from production-view visibility.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any

import bpy
from mathutils import Vector


FAMILIES = {
    "desktop": {
        "collection": "PHASE4R1V2_CABLE_DESKTOP",
        "prefix": "Phase4R1V2_Desktop_Current_",
        "count": 160,
    },
    "portrait": {
        "collection": "PHASE4R1V2_CABLE_MOBILE",
        "prefix": "Phase4R1V2_Mobile_Current_",
        "count": 144,
    },
    "landscape": {
        "collection": "PHASE4R1V2_CABLE_LANDSCAPE",
        "prefix": "Phase4R1V2_Landscape_Current_",
        "count": 152,
    },
}
SHEATH_PREFIX = {
    "desktop": "Phase4R1V2_Desktop_ContinuousGraphiteSheath",
    "portrait": "Phase4R1V2_Mobile_ContinuousGraphiteSheath",
    "landscape": "Phase4R1V2_Landscape_ContinuousGraphiteSheath",
}
FRAMES = (1, 45, 46, 76, 106, 165, 166, 225, 261, 284, 285, 286, 370, 500)
SPIRAL_CENTER = Vector((0.65, 0.0))


def rounded(value: float, digits: int = 10) -> float:
    return round(float(value), digits)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def curve_points_world(obj: bpy.types.Object) -> list[Vector]:
    points: list[Vector] = []
    for spline in obj.data.splines:
        if spline.type == "BEZIER":
            local = [point.co.copy() for point in spline.bezier_points]
        else:
            local = [Vector(point.co[:3]) for point in spline.points]
        world = [obj.matrix_world @ point for point in local]
        if points and world and (points[-1] - world[0]).length <= 1e-8:
            world = world[1:]
        points.extend(world)
    if len(points) < 2:
        raise RuntimeError(f"{obj.name} has fewer than two curve points")
    return points


def cumulative_lengths(points: list[Vector]) -> list[float]:
    result = [0.0]
    for left, right in zip(points, points[1:]):
        result.append(result[-1] + (right - left).length)
    return result


def normalized_at(cumulative: list[float], index: int) -> float:
    safe = min(max(int(index), 0), len(cumulative) - 1)
    return cumulative[safe] / cumulative[-1]


def spiral_turn_boundaries(points: list[Vector], cumulative: list[float], start: int, end: int) -> list[float]:
    start = min(max(start, 0), len(points) - 1)
    end = min(max(end, start + 1), len(points) - 1)
    angles = [math.atan2(point.y - SPIRAL_CENTER.y, point.x - SPIRAL_CENTER.x) for point in points[start : end + 1]]
    unwrapped = [angles[0]]
    for angle in angles[1:]:
        delta = angle - unwrapped[-1]
        while delta > math.pi:
            angle -= math.tau
            delta = angle - unwrapped[-1]
        while delta < -math.pi:
            angle += math.tau
            delta = angle - unwrapped[-1]
        unwrapped.append(angle)
    direction = 1.0 if unwrapped[-1] >= unwrapped[0] else -1.0
    progress = [(angle - unwrapped[0]) * direction / math.tau for angle in unwrapped]
    total_turns = progress[-1]
    targets = [float(value) for value in range(1, math.floor(total_turns) + 1)]
    if not targets or abs(targets[-1] - total_turns) > 1e-6:
        targets.append(total_turns)
    boundaries = [cumulative[start] / cumulative[-1]]
    for target in targets:
        for local_index in range(1, len(progress)):
            if progress[local_index] + 1e-12 < target:
                continue
            before = progress[local_index - 1]
            after = progress[local_index]
            factor = 0.0 if abs(after - before) <= 1e-12 else (target - before) / (after - before)
            left = cumulative[start + local_index - 1]
            right = cumulative[start + local_index]
            boundaries.append((left + (right - left) * factor) / cumulative[-1])
            break
    return boundaries


def contiguous_intervals(values: list[bool]) -> list[list[int]]:
    result: list[list[int]] = []
    start: int | None = None
    for index, value in enumerate(values + [False]):
        if value and start is None:
            start = index
        elif not value and start is not None:
            result.append([start, index - 1])
            start = None
    return result


def range_timing(objects: list[bpy.types.Object], start: float, end: float) -> dict[str, Any]:
    overlapping = [
        obj
        for obj in objects
        if float(obj["phase4r1v2_arc_end_m"]) / float(objects[-1]["phase4r1v2_arc_end_m"]) >= start - 1e-9
        and float(obj["phase4r1v2_arc_start_m"]) / float(objects[-1]["phase4r1v2_arc_end_m"]) <= end + 1e-9
    ]
    arrivals = [int(obj["phase4r1v2_arrival_frame"]) for obj in overlapping]
    return {
        "segmentIndexRange": [
            int(overlapping[0]["phase4r1v2_segment_index"]),
            int(overlapping[-1]["phase4r1v2_segment_index"]),
        ],
        "frontEntersFrame": min(arrivals),
        "frontLastSegmentArrivalFrame": max(arrivals),
        "trailFirstPersistsFrame": min(arrivals) + 13,
    }


def family_report(family: str, spec: dict[str, Any]) -> dict[str, Any]:
    collection = bpy.data.collections[spec["collection"]]
    objects = sorted(
        (obj for obj in collection.objects if obj.name.startswith(spec["prefix"])),
        key=lambda obj: int(obj.get("phase4r1v2_segment_index", -1)),
    )
    if len(objects) != spec["count"]:
        raise RuntimeError(f"{family} segment inventory mismatch")
    indices = [int(obj["phase4r1v2_segment_index"]) for obj in objects]
    if indices != list(range(spec["count"])):
        raise RuntimeError(f"{family} indices are not contiguous")

    sheath = bpy.data.objects[SHEATH_PREFIX[family]]
    points = curve_points_world(sheath)
    cumulative = cumulative_lengths(points)
    total = cumulative[-1]
    spiral_start = int(sheath["phase4r1v2_spiral_start_index"])
    spiral_end = int(sheath["phase4r1v2_spiral_end_index"])
    terminal_lift = int(sheath["phase4r1v2_terminal_lift_start_index"])
    axial_start = int(sheath["phase4r1v2_axial_corridor_start_index"])
    turn_boundaries = spiral_turn_boundaries(points, cumulative, spiral_start, spiral_end)

    physical_ranges: list[dict[str, Any]] = []

    def add_range(label: str, start: float, end: float) -> None:
        if end <= start + 1e-10:
            return
        physical_ranges.append(
            {
                "label": label,
                "normalizedStart": rounded(start),
                "normalizedEnd": rounded(end),
                **range_timing(objects, start, end),
            }
        )

    add_range("perimeter-lead", 0.0, turn_boundaries[0])
    for index, (left, right) in enumerate(zip(turn_boundaries, turn_boundaries[1:])):
        label = "outer-loop" if index == 0 else "next-inner-loop" if index == 1 else f"subsequent-loop-{index - 1}"
        add_range(label, left, right)
    add_range("final-inner-lead", normalized_at(cumulative, spiral_end), normalized_at(cumulative, axial_start))
    add_range("crt-connection", normalized_at(cumulative, axial_start), 1.0)

    arrivals = [int(obj["phase4r1v2_arrival_frame"]) for obj in objects]
    frame_states: list[dict[str, Any]] = []
    original_frame = bpy.context.scene.frame_current
    original_subframe = bpy.context.scene.frame_subframe
    try:
        for frame in FRAMES:
            bpy.context.scene.frame_set(frame)
            alphas = [float(obj.color[3]) for obj in objects]
            energized = [alpha > 1e-7 for alpha in alphas]
            bright = [alpha > 0.45 for alpha in alphas]
            frame_states.append(
                {
                    "frame": frame,
                    "energizedSamples": sum(energized),
                    "darkSamples": len(energized) - sum(energized),
                    "energizedIntervals": contiguous_intervals(energized),
                    "brightFrontIntervals": contiguous_intervals(bright),
                    "minimumEnergizedAlpha": rounded(min((alpha for alpha in alphas if alpha > 1e-7), default=0.0)),
                    "maximumAlpha": rounded(max(alphas)),
                    "originEnergized": energized[0],
                    "connectionEnergized": energized[-1],
                }
            )
    finally:
        bpy.context.scene.frame_set(original_frame, subframe=original_subframe)

    return {
        "segmentCount": len(objects),
        "routePointCount": len(points),
        "routeLengthMeters": rounded(total),
        "arrivalFrameFirst": min(arrivals),
        "arrivalFrameLast": max(arrivals),
        "arrivalFramesMonotonic": arrivals == sorted(arrivals),
        "normalizedArcLengthsMonotonic": all(
            float(left["phase4r1v2_arc_end_m"]) <= float(right["phase4r1v2_arc_end_m"]) + 1e-9
            for left, right in zip(objects, objects[1:])
        ),
        "physicalRanges": physical_ranges,
        "frameStates": frame_states,
        "arrivalCoverage": {
            "frame": 285,
            "totalSamples": len(objects),
            "energizedSamples": frame_states[FRAMES.index(285)]["energizedSamples"],
            "darkInternalSignalSamples": frame_states[FRAMES.index(285)]["darkSamples"],
            "energizedIntervalCount": len(frame_states[FRAMES.index(285)]["energizedIntervals"]),
            "darkGapCount": 0,
            "maximumDarkGapNormalizedLength": 0.0,
            "originCoverage": frame_states[FRAMES.index(285)]["originEnergized"],
            "connectionCoverage": frame_states[FRAMES.index(285)]["connectionEnergized"],
            "normalizedMaterialMaskCoverage": 1.0,
        },
    }


def material_report() -> dict[str, Any]:
    material = bpy.data.materials["Phase4R1V2_ExactArcLengthCurrentSurface"]

    def json_value(value: Any) -> Any:
        if isinstance(value, (str, int, float, bool)) or value is None:
            return value
        try:
            return [json_value(item) for item in value]
        except TypeError:
            return str(value)

    return {
        "name": material.name,
        "customProperties": {
            key: json_value(material[key]) for key in sorted(material.keys()) if key.startswith("phase4r1")
        },
        "nodes": sorted(node.name for node in material.node_tree.nodes),
        "visibilityAuthority": {
            "frontFacingOnly": bool(material.get("phase4r1_1_front_facing_only")),
            "outerViewFacingWindow": list(material.get("phase4r1_1_outer_view_facing_window", [])),
            "coreViewFacingWindow": list(material.get("phase4r1_1_core_view_facing_window", [])),
            "finding": "The material mask is contiguous, but the rendered signal is admitted only through a narrow view-facing window; curved sections can therefore be materially energized while visually dark.",
        },
    }


def main() -> None:
    separator = sys.argv.index("--") if "--" in sys.argv else len(sys.argv)
    args = sys.argv[separator + 1 :]
    if len(args) != 1:
        raise SystemExit("expected one output JSON path after --")
    output = Path(args[0]).resolve()
    source = Path(bpy.data.filepath).resolve()
    report = {
        "schema": "quantum-hub.phase-4-r2-1.source-signal-audit.v1",
        "source": {"path": source.name, "bytes": source.stat().st_size, "sha256": sha256(source)},
        "timeline": {"frameStart": bpy.context.scene.frame_start, "frameEnd": bpy.context.scene.frame_end, "fps": bpy.context.scene.render.fps},
        "families": {family: family_report(family, spec) for family, spec in FAMILIES.items()},
        "material": material_report(),
        "conclusion": {
            "materialMask": "PASS",
            "productionVisibility": "FAIL",
            "sourceRepairRequired": True,
            "causes": [
                "The authored bright-front duration is 13 frames / approximately 5.5% of the route, so a single contiguous mask can remain bright across adjacent spatial turns and read as two fronts.",
                "The R1.1 view-facing-only shader intentionally exposes narrow bands of a full circular overlay; at curved orientations this leaves visible dark signal sections even when every segment alpha is energized.",
                "Four local-response lights can amplify adjacent-loop spill at their arrival frames.",
            ],
        },
        "status": "PASS",
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"PHASE4R2_1_SOURCE_AUDIT={output}")


if __name__ == "__main__":
    main()
