"""Measure Phase 4-R0 F001 opening composition from frozen Blender geometry.

Run with Blender, not ordinary Python::

    blender --background --python measure_phase4r0_opening_composition.py -- \
      --output C:/external/phase4r0-opening-composition.json

The script opens (when necessary) and SHA-gates the frozen Phase 4-R0
derivative, evaluates the three real F001 cameras, and writes one external JSON
report.  Measurements are geometric projections.  They are deliberately not
pixel masks, render segmentation, visibility-through-occluders, or human
acceptance claims.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Sequence

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector


SCRIPT_PATH = Path(__file__).resolve()
SOURCE_DIR = SCRIPT_PATH.parent
DEFAULT_SOURCE = SOURCE_DIR / "quantum-signal-television-phase4r0-orbit-signal-threshold.blend"
EXPECTED_DERIVATIVE_SHA256 = "838f304a0f029f5570c1ede2b4ce20c7e7475571f1e7e4fb7d6286e5536e72d3"
EXPECTED_BLENDER_MAJOR_MINOR = (5, 2)
EXPECTED_FRAME = 1
CRT_COLLECTION = "REFINED_CRT_ASSEMBLY"
CLASSIFICATION = (
    "PHASE 4-R0 PREVISUALIZATION · NOT PRODUCTION · "
    "HUMAN UNACCEPTED · PHASE 5 UNAUTHORIZED"
)
FIXED_EPOCH = "1980-01-01T00:00:00.000Z"

FAMILIES: dict[str, dict[str, Any]] = {
    "desktop": {
        "camera": "Phase4R0_Camera_Desktop",
        "rig": "Phase4R0_OrbitRig_Desktop",
        "cable_collection": "DESKTOP_2_5_TURN_SPIRAL_CABLE",
        "cable_authorship": "desktop 2.5-turn accepted cable",
        "render_resolution": [960, 600],
        "presentation_viewport": [1440, 900],
        "f001_lens_mm": 40.0,
        "segment_count": 185,
        "entry_hidden_segment_count": 5,
    },
    "mobile": {
        "camera": "Phase4R0_Camera_Mobile",
        "rig": "Phase4R0_OrbitRig_Mobile",
        "cable_collection": "MOBILE_2_25_TURN_SPIRAL_CABLE",
        "cable_authorship": "mobile 2.25-turn accepted cable",
        "render_resolution": [390, 844],
        "presentation_viewport": [390, 844],
        "f001_lens_mm": 50.0,
        "segment_count": 185,
        "entry_hidden_segment_count": 5,
    },
    "landscape": {
        "camera": "Phase4R0_Camera_Landscape",
        "rig": "Phase4R0_OrbitRig_Landscape",
        "cable_collection": "MOBILE_2_25_TURN_SPIRAL_CABLE",
        "cable_authorship": "mobile 2.25-turn accepted cable, as selected by the landscape renderer",
        "render_resolution": [844, 390],
        "presentation_viewport": [844, 390],
        "f001_lens_mm": 36.0,
        "segment_count": 185,
        "entry_hidden_segment_count": 5,
    },
}


def parse_args() -> argparse.Namespace:
    tail = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args(tail)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def repository_root() -> Path:
    for candidate in (SOURCE_DIR, *SOURCE_DIR.parents):
        if (candidate / ".git").exists():
            return candidate.resolve()
    raise RuntimeError("cannot locate repository root from measurement script")


def is_within(parent: Path, candidate: Path) -> bool:
    try:
        candidate.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def generated_at() -> str:
    raw = os.environ.get("SOURCE_DATE_EPOCH")
    if raw is None:
        return FIXED_EPOCH
    try:
        seconds = int(raw)
    except ValueError as error:
        raise RuntimeError("SOURCE_DATE_EPOCH must be an integer Unix timestamp") from error
    if seconds < 315532800:
        raise RuntimeError("SOURCE_DATE_EPOCH must be no earlier than 1980-01-01")
    return datetime.fromtimestamp(seconds, tz=timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def rounded(value: float, digits: int = 8) -> float:
    return round(float(value), digits)


def rounded_vector(value: Sequence[float], digits: int = 8) -> list[float]:
    return [rounded(component, digits) for component in value]


def required_collection(name: str) -> bpy.types.Collection:
    collection = bpy.data.collections.get(name)
    if collection is None:
        raise RuntimeError(f"missing required collection: {name}")
    return collection


def required_object(name: str) -> bpy.types.Object:
    obj = bpy.data.objects.get(name)
    if obj is None:
        raise RuntimeError(f"missing required object: {name}")
    return obj


def open_and_verify_source(source: Path) -> dict[str, Any]:
    source = source.resolve()
    if not source.is_file():
        raise RuntimeError(f"frozen derivative is missing: {source}")
    digest = sha256_file(source)
    if digest != EXPECTED_DERIVATIVE_SHA256:
        raise RuntimeError(f"frozen derivative SHA-256 mismatch: {digest} != {EXPECTED_DERIVATIVE_SHA256}")
    opened = Path(bpy.data.filepath).resolve() if bpy.data.filepath else None
    if opened != source:
        bpy.ops.wm.open_mainfile(filepath=str(source))
        opened = Path(bpy.data.filepath).resolve() if bpy.data.filepath else None
    if opened != source:
        raise RuntimeError(f"Blender did not open the frozen derivative: {opened} != {source}")
    return {
        "basename": source.name,
        "bytes": source.stat().st_size,
        "sha256": digest,
        "openedByBlender": True,
    }


def camera_contract(family: str, spec: dict[str, Any]) -> tuple[bpy.types.Object, dict[str, Any]]:
    camera = required_object(spec["camera"])
    if camera.type != "CAMERA" or camera.data.type != "PERSP":
        raise RuntimeError(f"{family} camera must be a real perspective Blender camera")
    if camera.parent is None or camera.parent.name != spec["rig"]:
        raise RuntimeError(f"{family} camera is not parented to {spec['rig']}")
    if abs(float(camera.data.lens) - float(spec["f001_lens_mm"])) > 1e-5:
        raise RuntimeError(f"{family} F001 lens mismatch: {camera.data.lens} != {spec['f001_lens_mm']}")
    constraints = [constraint for constraint in camera.constraints if constraint.type == "TRACK_TO"]
    if len(constraints) != 1 or constraints[0].name != "Phase4R0_AuditableLookAtCRT":
        raise RuntimeError(f"{family} camera must have exactly one auditable CRT TRACK_TO constraint")
    target = constraints[0].target
    if target is None or target.name != "Phase4R0_CRT_OrbitTarget":
        raise RuntimeError(f"{family} camera TRACK_TO target is not Phase4R0_CRT_OrbitTarget")
    record = {
        "object": camera.name,
        "data": camera.data.name,
        "type": camera.data.type,
        "rig": camera.parent.name,
        "constraint": constraints[0].name,
        "target": target.name,
        "worldLocation": rounded_vector(camera.matrix_world.translation),
        "lensMm": rounded(camera.data.lens),
        "sensorWidthMm": rounded(camera.data.sensor_width),
        "clipStartM": rounded(camera.data.clip_start),
        "clipEndM": rounded(camera.data.clip_end),
        "matrixWorld": [rounded_vector(row) for row in camera.matrix_world],
    }
    return camera, record


def curve_segment_points(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    if obj.type != "CURVE" or len(obj.data.splines) != 1:
        raise RuntimeError(f"accepted conductor segment is not one curve spline: {obj.name}")
    spline = obj.data.splines[0]
    if spline.type == "BEZIER":
        points = [point.co for point in spline.bezier_points]
    else:
        points = [point.co.to_3d() for point in spline.points]
    if len(points) != 2:
        raise RuntimeError(f"accepted conductor segment must contain exactly two points: {obj.name}")
    return obj.matrix_world @ points[0], obj.matrix_world @ points[1]


def projection_matrix(
    scene: bpy.types.Scene,
    camera: bpy.types.Object,
    width: int,
    height: int,
) -> Matrix:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    camera_eval = camera.evaluated_get(depsgraph)
    projection = camera_eval.calc_matrix_camera(
        depsgraph,
        x=width,
        y=height,
        scale_x=scene.render.pixel_aspect_x,
        scale_y=scene.render.pixel_aspect_y,
    )
    return projection @ camera_eval.matrix_world.inverted()


def homogeneous_clip_fraction(matrix: Matrix, start: Vector, end: Vector) -> float:
    """Exact straight-segment fraction inside the homogeneous camera frustum."""

    a = matrix @ Vector((start.x, start.y, start.z, 1.0))
    b = matrix @ Vector((end.x, end.y, end.z, 1.0))
    constraints = (
        (a.w + a.x, b.w + b.x),
        (a.w - a.x, b.w - b.x),
        (a.w + a.y, b.w + b.y),
        (a.w - a.y, b.w - b.y),
        (a.w + a.z, b.w + b.z),
        (a.w - a.z, b.w - b.z),
        (a.w - 1e-12, b.w - 1e-12),
    )
    low = 0.0
    high = 1.0
    for value_start, value_end in constraints:
        delta = value_end - value_start
        if abs(delta) <= 1e-15:
            if value_start < 0.0:
                return 0.0
            continue
        crossing = -value_start / delta
        if delta > 0.0:
            low = max(low, crossing)
        else:
            high = min(high, crossing)
        if low >= high:
            return 0.0
    return max(0.0, min(1.0, high) - max(0.0, low))


def cable_measurement(
    scene: bpy.types.Scene,
    camera: bpy.types.Object,
    collection_name: str,
    width: int,
    height: int,
) -> dict[str, Any]:
    collection = required_collection(collection_name)
    segments: list[dict[str, Any]] = []
    for obj in collection.all_objects:
        if "progress_start" not in obj or "progress_end" not in obj:
            continue
        start, end = curve_segment_points(obj)
        segments.append(
            {
                "object": obj,
                "start": start,
                "end": end,
                "progress_start": float(obj["progress_start"]),
                "progress_end": float(obj["progress_end"]),
                "entry_hidden": bool(obj.get("entry_hidden", False)),
            }
        )
    segments.sort(key=lambda record: (record["progress_start"], record["object"].name))
    if not segments:
        raise RuntimeError(f"no accepted conductor progress segments found in {collection_name}")
    if abs(segments[0]["progress_start"]) > 1e-8 or abs(segments[-1]["progress_end"] - 1.0) > 1e-8:
        raise RuntimeError(f"{collection_name} conductor progress does not cover 0→1")
    for left, right in zip(segments, segments[1:]):
        if abs(left["progress_end"] - right["progress_start"]) > 1e-8:
            raise RuntimeError(f"{collection_name} conductor progress contains a gap or overlap")

    matrix = projection_matrix(scene, camera, width, height)
    total_length = 0.0
    total_visible = 0.0
    reviewable_length = 0.0
    reviewable_visible = 0.0
    visible_segments = 0
    for record in segments:
        length = (record["end"] - record["start"]).length
        fraction = homogeneous_clip_fraction(matrix, record["start"], record["end"])
        visible = length * fraction
        total_length += length
        total_visible += visible
        if fraction > 0.0:
            visible_segments += 1
        if not record["entry_hidden"]:
            reviewable_length += length
            reviewable_visible += visible
    if total_length <= 0.0 or reviewable_length <= 0.0:
        raise RuntimeError(f"{collection_name} conductor has zero measurable length")
    hidden_count = sum(1 for record in segments if record["entry_hidden"])
    return {
        "collection": collection_name,
        "sourceGeometry": "accepted two-point recessed-conductor centreline curves with progress metadata",
        "method": (
            "world-length-weighted exact homogeneous frustum clipping of each straight accepted conductor "
            "segment; no render pixels, depth buffer, or occlusion test"
        ),
        "segmentCount": len(segments),
        "segmentsIntersectingFrustum": visible_segments,
        "intentionallyEntryHiddenSegmentCount": hidden_count,
        "allConductorLengthM": rounded(total_length),
        "allConductorFrustumVisibleLengthM": rounded(total_visible),
        "allConductorFrustumVisiblePercent": rounded(100.0 * total_visible / total_length, 6),
        "reviewableSpiralLengthM": rounded(reviewable_length),
        "reviewableSpiralFrustumVisibleLengthM": rounded(reviewable_visible),
        "spiralVisiblePercent": rounded(100.0 * reviewable_visible / reviewable_length, 6),
        "spiralVisiblePercentDenominator": (
            "all accepted recessed-conductor centreline segments except the explicitly entry_hidden terminal segments"
        ),
        "occlusionSegmentationPerformed": False,
    }


def evaluated_collection_vertices(collection_name: str) -> tuple[list[Vector], list[str]]:
    collection = required_collection(collection_name)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    vertices: list[Vector] = []
    names: list[str] = []
    for obj in sorted(collection.all_objects, key=lambda item: item.name):
        if obj.type not in {"MESH", "CURVE", "SURFACE", "FONT", "META"}:
            continue
        evaluated = obj.evaluated_get(depsgraph)
        try:
            mesh = evaluated.to_mesh()
        except RuntimeError as error:
            raise RuntimeError(f"cannot evaluate CRT geometry object {obj.name}: {error}") from error
        if mesh is None:
            continue
        try:
            if len(mesh.vertices) == 0:
                continue
            names.append(obj.name)
            matrix = evaluated.matrix_world
            vertices.extend(matrix @ vertex.co for vertex in mesh.vertices)
        finally:
            evaluated.to_mesh_clear()
    if not vertices:
        raise RuntimeError(f"no evaluated geometric vertices found in {collection_name}")
    return vertices, names


def cross(origin: tuple[float, float], left: tuple[float, float], right: tuple[float, float]) -> float:
    return (left[0] - origin[0]) * (right[1] - origin[1]) - (left[1] - origin[1]) * (right[0] - origin[0])


def convex_hull(points: Iterable[tuple[float, float]]) -> list[tuple[float, float]]:
    ordered = sorted(set(points))
    if len(ordered) <= 1:
        return ordered
    lower: list[tuple[float, float]] = []
    for point in ordered:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0.0:
            lower.pop()
        lower.append(point)
    upper: list[tuple[float, float]] = []
    for point in reversed(ordered):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0.0:
            upper.pop()
        upper.append(point)
    return lower[:-1] + upper[:-1]


def clip_polygon_axis(
    polygon: list[tuple[float, float]],
    axis: int,
    boundary: float,
    keep_greater: bool,
) -> list[tuple[float, float]]:
    if not polygon:
        return []

    def inside(point: tuple[float, float]) -> bool:
        return point[axis] >= boundary if keep_greater else point[axis] <= boundary

    result: list[tuple[float, float]] = []
    previous = polygon[-1]
    previous_inside = inside(previous)
    for current in polygon:
        current_inside = inside(current)
        if current_inside != previous_inside:
            delta = current[axis] - previous[axis]
            if abs(delta) <= 1e-15:
                intersection = previous
            else:
                fraction = (boundary - previous[axis]) / delta
                intersection = (
                    previous[0] + fraction * (current[0] - previous[0]),
                    previous[1] + fraction * (current[1] - previous[1]),
                )
            result.append(intersection)
        if current_inside:
            result.append(current)
        previous = current
        previous_inside = current_inside
    return result


def clip_to_viewport(polygon: list[tuple[float, float]]) -> list[tuple[float, float]]:
    result = polygon
    for axis, boundary, keep_greater in ((0, 0.0, True), (0, 1.0, False), (1, 0.0, True), (1, 1.0, False)):
        result = clip_polygon_axis(result, axis, boundary, keep_greater)
    return result


def polygon_area(polygon: Sequence[tuple[float, float]]) -> float:
    if len(polygon) < 3:
        return 0.0
    return abs(
        sum(
            left[0] * right[1] - right[0] * left[1]
            for left, right in zip(polygon, (*polygon[1:], polygon[0]))
        )
    ) / 2.0


def crt_measurement(
    scene: bpy.types.Scene,
    camera: bpy.types.Object,
    vertices: Sequence[Vector],
    object_names: Sequence[str],
) -> dict[str, Any]:
    inverse = camera.matrix_world.inverted()
    projected: list[tuple[float, float]] = []
    for world in vertices:
        camera_space = inverse @ world
        depth = -camera_space.z
        if depth <= camera.data.clip_start or depth >= camera.data.clip_end:
            continue
        ndc = world_to_camera_view(scene, camera, world)
        if math.isfinite(ndc.x) and math.isfinite(ndc.y):
            projected.append((float(ndc.x), float(ndc.y)))
    if len(projected) < 3:
        raise RuntimeError("CRT assembly has fewer than three projectable vertices")
    hull = convex_hull(projected)
    clipped = clip_to_viewport(hull)
    if len(clipped) < 3:
        raise RuntimeError("CRT assembly projected convex hull does not intersect the F001 viewport")
    minimum_x = min(point[0] for point in clipped)
    maximum_x = max(point[0] for point in clipped)
    minimum_y = min(point[1] for point in clipped)
    maximum_y = max(point[1] for point in clipped)
    hull_area = polygon_area(clipped)
    return {
        "collection": CRT_COLLECTION,
        "sourceGeometry": "all evaluated mesh-convertible objects in the accepted REFINED_CRT_ASSEMBLY collection",
        "method": (
            "project all evaluated CRT geometry vertices through the real F001 camera, form a 2D convex hull, "
            "clip that hull to the viewport, then measure its vertical span and normalized area"
        ),
        "geometricObjectCount": len(object_names),
        "geometricObjectNamesSha256": sha256_text("\n".join(object_names) + "\n"),
        "evaluatedVertexCount": len(vertices),
        "projectedVertexCount": len(projected),
        "projectedConvexHullVertexCount": len(hull),
        "viewportClippedHullVertexCount": len(clipped),
        "viewportClippedBoundsNormalized": {
            "left": rounded(minimum_x),
            "right": rounded(maximum_x),
            "bottom": rounded(minimum_y),
            "top": rounded(maximum_y),
        },
        "viewportClippedConvexHullNormalized": [rounded_vector(point) for point in clipped],
        "crtVerticalViewportOccupancyPercent": rounded(100.0 * (maximum_y - minimum_y), 6),
        "crtViewportAreaPercent": rounded(100.0 * hull_area, 6),
        "areaDefinition": "viewport-clipped convex-hull area divided by normalized viewport area",
        "occlusionSegmentationPerformed": False,
    }


def configure_projection_viewport(scene: bpy.types.Scene, width: int, height: int) -> None:
    scene.render.resolution_x = int(width)
    scene.render.resolution_y = int(height)
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = 1.0
    scene.render.pixel_aspect_y = 1.0


def write_external_report(output: Path, report: dict[str, Any]) -> tuple[int, str]:
    root = repository_root()
    output = output.resolve()
    if output.suffix.lower() != ".json":
        raise RuntimeError("--output must name a .json report")
    if is_within(root, output):
        raise RuntimeError("opening-composition report output must remain outside the repository and accepted evidence roots")
    if output.exists():
        raise RuntimeError("--output already exists; choose a fresh external report path")
    output.parent.mkdir(parents=True, exist_ok=True)
    payload = (json.dumps(report, indent=2, sort_keys=True) + "\n").encode("utf-8")
    temporary = output.with_name(f".{output.name}.{os.getpid()}.tmp")
    temporary.write_bytes(payload)
    temporary.replace(output)
    return len(payload), hashlib.sha256(payload).hexdigest()


def main() -> None:
    args = parse_args()
    if tuple(bpy.app.version[:2]) != EXPECTED_BLENDER_MAJOR_MINOR:
        raise RuntimeError(
            "opening-composition measurement requires Blender "
            f"{EXPECTED_BLENDER_MAJOR_MINOR[0]}.{EXPECTED_BLENDER_MAJOR_MINOR[1]}.x; "
            f"received {bpy.app.version_string}"
        )
    source = args.source.resolve()
    output = args.output.resolve()
    if output == source:
        raise RuntimeError("measurement report output cannot overwrite the frozen derivative")
    source_record = open_and_verify_source(source)
    scene = bpy.context.scene
    scene.frame_set(EXPECTED_FRAME)
    if scene.frame_current != EXPECTED_FRAME:
        raise RuntimeError("Blender did not resolve F001")
    vertices, crt_object_names = evaluated_collection_vertices(CRT_COLLECTION)

    families: dict[str, Any] = {}
    for family, spec in FAMILIES.items():
        width, height = spec["presentation_viewport"]
        configure_projection_viewport(scene, width, height)
        scene.frame_set(EXPECTED_FRAME)
        camera, camera_record = camera_contract(family, spec)
        cable = cable_measurement(scene, camera, spec["cable_collection"], width, height)
        if cable["segmentCount"] != spec["segment_count"]:
            raise RuntimeError(
                f"{family} conductor segment count mismatch: "
                f"{cable['segmentCount']} != {spec['segment_count']}"
            )
        if cable["intentionallyEntryHiddenSegmentCount"] != spec["entry_hidden_segment_count"]:
            raise RuntimeError(
                f"{family} entry_hidden segment count mismatch: "
                f"{cable['intentionallyEntryHiddenSegmentCount']} != {spec['entry_hidden_segment_count']}"
            )
        crt = crt_measurement(scene, camera, vertices, crt_object_names)
        families[family] = {
            "status": "PASS",
            "frame": EXPECTED_FRAME,
            "family": family,
            "authoredRenderResolution": spec["render_resolution"],
            "measurementViewport": spec["presentation_viewport"],
            "cableAuthorship": spec["cable_authorship"],
            "camera": camera_record,
            "spiral": cable,
            "crt": crt,
        }

    report = {
        "schema": "quantum-hub.phase-4-r0.opening-composition-geometry.v1",
        "status": "PASS",
        "generatedAt": generated_at(),
        "classification": CLASSIFICATION,
        "authorization": {
            "productionAuthorized": False,
            "humanAccepted": False,
            "phase5Authorized": False,
        },
        "source": source_record,
        "script": {
            "basename": SCRIPT_PATH.name,
            "bytes": SCRIPT_PATH.stat().st_size,
            "sha256": sha256_file(SCRIPT_PATH),
        },
        "runtime": {
            "blenderVersion": bpy.app.version_string,
            "blenderVersionTuple": list(bpy.app.version),
            "pythonVersion": sys.version.split()[0],
            "frame": EXPECTED_FRAME,
        },
        "measurementContract": {
            "spiralVisiblePercent": (
                "world-length-weighted homogeneous-frustum-visible fraction of actual accepted conductor "
                "centreline segments, excluding only segments explicitly tagged entry_hidden"
            ),
            "crtVerticalViewportOccupancyPercent": (
                "vertical span of the viewport-clipped convex hull of projected evaluated accepted CRT vertices"
            ),
            "crtViewportAreaPercent": (
                "area of the viewport-clipped convex hull of projected evaluated accepted CRT vertices"
            ),
            "geometricProjectionOnly": True,
            "occlusionSegmentationPerformed": False,
            "pixelSegmentationPerformed": False,
            "humanVisibilityOrAcceptanceInferred": False,
        },
        "familyOrder": list(FAMILIES),
        "families": families,
    }
    bytes_written, digest = write_external_report(output, report)
    print(f"QH_PHASE4R0_OPENING_COMPOSITION_REPORT={output}")
    print(f"QH_PHASE4R0_OPENING_COMPOSITION_BYTES={bytes_written}")
    print(f"QH_PHASE4R0_OPENING_COMPOSITION_SHA256={digest}")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"QH_PHASE4R0_OPENING_COMPOSITION_FAIL={type(error).__name__}: {error}", file=sys.stderr)
        raise
