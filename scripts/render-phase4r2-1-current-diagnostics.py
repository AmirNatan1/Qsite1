"""Render bounded, non-authoritative diagnostics for the R2.1 current repair.

The opened derivative is never saved.  The diagnostic removes environmental
occlusion and compositor effects in memory, retains the real graphite sheath
and repaired current material, and adds only a broad neutral inspection light.
It also writes an unwrapped F285 segment-coverage SVG so route ordering and
alpha coverage can be checked independently of any camera.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import sys
from pathlib import Path
from typing import Any

import bpy
import numpy as np
from mathutils import Vector


FAMILIES = {
    "desktop": {
        "label": "Desktop",
        "camera": "Phase4R1_Camera_Desktop",
        "collection": "PHASE4R1V2_CABLE_DESKTOP",
        "currentPrefix": "Phase4R1V2_Desktop_Current_",
        "resolution": (960, 600),
    },
    "portrait": {
        "label": "Portrait / mobile",
        "camera": "Phase4R1_Camera_Mobile",
        "collection": "PHASE4R1V2_CABLE_MOBILE",
        "currentPrefix": "Phase4R1V2_Mobile_Current_",
        "resolution": (390, 844),
    },
    "landscape": {
        "label": "Landscape",
        "camera": "Phase4R1_Camera_Landscape",
        "collection": "PHASE4R1V2_CABLE_LANDSCAPE",
        "currentPrefix": "Phase4R1V2_Landscape_Current_",
        "resolution": (844, 390),
    },
}
DIAGNOSTIC_FRAME = 285
DESKTOP_CLOSE_FRAMES = (284, 285, 286)
SAMPLES = 48
CURRENT_OVERLAY_DIAMETER_M = 0.061


def parse_args() -> argparse.Namespace:
    separator = sys.argv.index("--") if "--" in sys.argv else len(sys.argv)
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-root", required=True)
    parser.add_argument("--report", required=True)
    return parser.parse_args(sys.argv[separator + 1 :])


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_hash(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def configure_device(scene: bpy.types.Scene) -> dict[str, Any]:
    addon = bpy.context.preferences.addons.get("cycles")
    if addon is None:
        raise RuntimeError("Cycles preferences are unavailable")
    preferences = addon.preferences
    attempts = []
    for backend in ("OPTIX", "CUDA"):
        try:
            preferences.compute_device_type = backend
            preferences.get_devices()
            candidates = [device for device in preferences.devices if device.type == backend]
            attempts.append({"backend": backend, "deviceCount": len(candidates)})
            if candidates:
                for device in preferences.devices:
                    device.use = device.type == backend
                scene.cycles.device = "GPU"
                return {
                    "backend": backend,
                    "sceneDevice": "GPU",
                    "devices": [
                        {"name": device.name, "type": device.type, "use": bool(device.use)}
                        for device in preferences.devices
                    ],
                    "attempts": attempts,
                }
        except Exception as error:
            attempts.append({"backend": backend, "error": type(error).__name__})
    raise RuntimeError(f"Cycles GPU unavailable: {attempts}")


def configure_scene() -> tuple[bpy.types.Scene, dict[str, Any]]:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = 1.0
    scene.render.pixel_aspect_y = 1.0
    scene.render.film_transparent = False
    scene.render.use_border = False
    scene.render.use_crop_to_border = False
    scene.render.use_file_extension = False
    scene.render.use_motion_blur = False
    scene.render.use_persistent_data = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "16"
    scene.render.image_settings.compression = 30
    if hasattr(scene.render.image_settings, "color_management"):
        scene.render.image_settings.color_management = "FOLLOW_SCENE"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 1.35
    scene.cycles.samples = SAMPLES
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.035
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
    # The diagnostic must not inherit fades, glare, or threshold compositing.
    scene.use_nodes = False
    return scene, configure_device(scene)


def install_neutral_world(scene: bpy.types.Scene) -> None:
    world = bpy.data.worlds.new("Phase4R21_DiagnosticNeutralWorld")
    world.use_nodes = True
    nodes = world.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputWorld")
    background = nodes.new("ShaderNodeBackground")
    background.inputs["Color"].default_value = (0.012, 0.014, 0.018, 1.0)
    background.inputs["Strength"].default_value = 0.28
    world.node_tree.links.new(background.outputs["Background"], output.inputs["Surface"])
    scene.world = world


def install_inspection_lights() -> list[bpy.types.Object]:
    lights = []
    for name, location, energy, size, color in (
        (
            "Phase4R21_DiagnosticTop",
            (0.0, 0.0, 8.0),
            1700.0,
            10.0,
            (0.70, 0.76, 0.86),
        ),
        (
            "Phase4R21_DiagnosticFill",
            (0.0, -5.0, 3.5),
            900.0,
            8.0,
            (0.52, 0.58, 0.68),
        ),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        data.color = color
        obj = bpy.data.objects.new(name, data)
        bpy.context.scene.collection.objects.link(obj)
        obj.location = location
        if "Fill" in name:
            direction = Vector((0.0, 0.0, 0.25)) - obj.location
            obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        lights.append(obj)
    return lights


def family_objects(spec: dict[str, Any]) -> set[bpy.types.Object]:
    collection = bpy.data.collections.get(spec["collection"])
    if collection is None:
        raise RuntimeError(f"missing cable collection {spec['collection']}")
    collection.hide_render = False
    objects = set(collection.all_objects)
    if not any(obj.name.startswith(spec["currentPrefix"]) for obj in objects):
        raise RuntimeError(f"current segments missing from {spec['collection']}")
    if not any("ContinuousGraphiteSheath" in obj.name for obj in objects):
        raise RuntimeError(f"graphite sheath missing from {spec['collection']}")
    return objects


def set_current_only_visibility(
    spec: dict[str, Any], lights: list[bpy.types.Object]
) -> None:
    keep = family_objects(spec) | set(lights)
    camera = bpy.data.objects.get(spec["camera"])
    if camera is None:
        raise RuntimeError(f"missing camera {spec['camera']}")
    keep.add(camera)
    for collection in bpy.data.collections:
        collection.hide_render = False
    for obj in bpy.data.objects:
        obj.hide_render = obj not in keep


def image_statistics(path: Path) -> dict[str, Any]:
    image = bpy.data.images.load(str(path), check_existing=False)
    try:
        values = np.empty(len(image.pixels), dtype=np.float32)
        image.pixels.foreach_get(values)
        rgb = values.reshape((-1, 4))[:, :3]
        return {
            "width": int(image.size[0]),
            "height": int(image.size[1]),
            "minimumRgb": round(float(np.min(rgb)), 10),
            "maximumRgb": round(float(np.max(rgb)), 10),
            "nonBlackRgbSamples": int(np.count_nonzero(rgb > (1.0 / 65535.0))),
            "totalRgbSamples": int(rgb.size),
        }
    finally:
        bpy.data.images.remove(image)


def write_render_record(
    scene: bpy.types.Scene,
    output_root: Path,
    relative_path: str,
    frame: int,
    family: str,
    diagnostic: str,
) -> dict[str, Any]:
    output = output_root / relative_path
    output.parent.mkdir(parents=True, exist_ok=True)
    scene.frame_set(frame, subframe=0.0)
    bpy.context.view_layer.update()
    scene.render.filepath = str(output)
    print(f"PHASE4R2_1_CURRENT_DIAGNOSTIC={family}:F{frame:03d}:{diagnostic}")
    bpy.ops.render.render(write_still=True)
    if not output.is_file():
        raise RuntimeError(f"diagnostic did not create {output}")
    return {
        "family": family,
        "frame": frame,
        "diagnostic": diagnostic,
        "relativePath": relative_path,
        "bytes": output.stat().st_size,
        "sha256": sha256_file(output),
        "pixels": image_statistics(output),
    }


def ordered_currents(spec: dict[str, Any]) -> list[bpy.types.Object]:
    currents = [
        obj for obj in bpy.data.objects if obj.name.startswith(spec["currentPrefix"])
    ]
    currents.sort(key=lambda obj: int(obj.name.rsplit("_", 1)[1]))
    if not currents:
        raise RuntimeError(f"no currents found for {spec['label']}")
    expected_names = [f"{spec['currentPrefix']}{index:03d}" for index in range(len(currents))]
    if [obj.name for obj in currents] != expected_names:
        raise RuntimeError(f"non-contiguous current ordering for {spec['label']}")
    return currents


def curve_endpoints_world(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    if obj.type != "CURVE" or len(obj.data.splines) != 1:
        raise RuntimeError(f"unexpected current geometry on {obj.name}")
    spline = obj.data.splines[0]
    if len(spline.points) >= 2:
        start = obj.matrix_world @ Vector(spline.points[0].co[:3])
        end = obj.matrix_world @ Vector(spline.points[-1].co[:3])
    elif len(spline.bezier_points) >= 2:
        start = obj.matrix_world @ spline.bezier_points[0].co
        end = obj.matrix_world @ spline.bezier_points[-1].co
    else:
        raise RuntimeError(f"current segment has fewer than two points: {obj.name}")
    return start, end


def coverage_record(scene: bpy.types.Scene, family: str, spec: dict[str, Any]) -> dict[str, Any]:
    scene.frame_set(DIAGNOSTIC_FRAME, subframe=0.0)
    bpy.context.view_layer.update()
    currents = ordered_currents(spec)
    alphas = [round(float(obj.color[3]), 8) for obj in currents]
    gaps = []
    endpoints = [curve_endpoints_world(obj) for obj in currents]
    for index in range(len(endpoints) - 1):
        gaps.append(float((endpoints[index][1] - endpoints[index + 1][0]).length))
    lengths = [float((end - start).length) for start, end in endpoints]
    maximum_centerline_delta = max(gaps, default=0.0)
    maximum_surface_separation = max(
        0.0, maximum_centerline_delta - CURRENT_OVERLAY_DIAMETER_M
    )
    record = {
        "family": family,
        "frame": DIAGNOSTIC_FRAME,
        "segmentCount": len(currents),
        "orderedIndices": list(range(len(currents))),
        "alphas": alphas,
        "energizedCount": sum(alpha > 0.0 for alpha in alphas),
        "darkCount": sum(alpha <= 0.0 for alpha in alphas),
        "trailOrBrighterCount": sum(alpha >= 0.44 - 1e-6 for alpha in alphas),
        "minimumAlpha": min(alphas),
        "maximumAlpha": max(alphas),
        "maximumAdjacentCenterlineEndpointDeltaMeters": round(maximum_centerline_delta, 10),
        "currentOverlayDiameterMeters": CURRENT_OVERLAY_DIAMETER_M,
        "maximumAdjacentSurfaceSeparationMeters": round(maximum_surface_separation, 10),
        "minimumSegmentChordMeters": round(min(lengths), 10),
        "maximumSegmentChordMeters": round(max(lengths), 10),
        "allSegmentsEnergized": all(alpha > 0.0 for alpha in alphas),
        "allSegmentsTrailOrBrighter": all(alpha >= 0.44 - 1e-6 for alpha in alphas),
        "routeOrderContiguous": True,
    }
    if (
        not record["allSegmentsTrailOrBrighter"]
        or record["maximumAdjacentSurfaceSeparationMeters"] > 1e-6
    ):
        raise RuntimeError(f"F285 coverage validation failed for {family}: {record}")
    return record


def coverage_svg(records: list[dict[str, Any]]) -> str:
    width = 1200
    height = 120 + len(records) * 160
    left = 205
    right = 55
    usable = width - left - right
    rows = []
    for row_index, record in enumerate(records):
        y = 120 + row_index * 160
        count = record["segmentCount"]
        segment_width = usable / count
        rows.append(
            f'<text x="28" y="{y + 5}" class="family">{html.escape(record["family"])}</text>'
        )
        rows.append(
            f'<line x1="{left}" y1="{y}" x2="{left + usable}" y2="{y}" '
            'stroke="#090b10" stroke-width="26" stroke-linecap="round"/>'
        )
        for index, alpha in enumerate(record["alphas"]):
            x1 = left + index * segment_width
            x2 = left + (index + 1) * segment_width + 0.25
            intensity = int(round(96 + 159 * min(1.0, max(0.0, alpha))))
            color = f"#{intensity:02x}20{min(255, intensity + 18):02x}"
            rows.append(
                f'<line x1="{x1:.3f}" y1="{y}" x2="{x2:.3f}" y2="{y}" '
                f'stroke="{color}" stroke-width="7"/>'
            )
        rows.append(
            f'<text x="{left}" y="{y + 46}" class="detail">'
            f'{count}/{count} segments energized; min alpha {record["minimumAlpha"]:.2f}; '
            f'max surface separation {record["maximumAdjacentSurfaceSeparationMeters"]:.10f} m '
            f'(centerline delta {record["maximumAdjacentCenterlineEndpointDeltaMeters"]:.6f} m)</text>'
        )
        rows.append(
            f'<text x="{left}" y="{y - 27}" class="axis">origin / segment 0</text>'
        )
        rows.append(
            f'<text x="{left + usable}" y="{y - 27}" text-anchor="end" class="axis">'
            f'connection / segment {count - 1}</text>'
        )
    body = "\n    ".join(rows)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <rect width="100%" height="100%" fill="#11151d"/>
  <style>
    text {{ font-family: "Segoe UI", Arial, sans-serif; fill: #d8dee9; }}
    .title {{ font-size: 25px; font-weight: 650; }}
    .subtitle {{ font-size: 14px; fill: #9ba8bb; }}
    .family {{ font-size: 17px; font-weight: 600; }}
    .detail {{ font-size: 13px; fill: #aeb8c8; }}
    .axis {{ font-size: 12px; fill: #7f8ca0; }}
  </style>
  <text x="28" y="38" class="title">R2.1 F285 unwrapped current coverage</text>
  <text x="28" y="64" class="subtitle">Exact ordered segments; graphite housing shown wide, world-up energy channel shown narrow. This is analytic coverage, not a production frame.</text>
  {body}
</svg>
'''


def main() -> None:
    args = parse_args()
    source = Path(bpy.data.filepath).resolve()
    source_before = {
        "path": source.name,
        "bytes": source.stat().st_size,
        "sha256": sha256_file(source),
    }
    output_root = Path(args.output_root).resolve()
    report_path = Path(args.report).resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)

    scene, device = configure_scene()
    install_neutral_world(scene)
    lights = install_inspection_lights()
    outputs = []
    coverage = []
    for family, spec in FAMILIES.items():
        scene.camera = bpy.data.objects[spec["camera"]]
        scene.render.resolution_x, scene.render.resolution_y = spec["resolution"]
        scene.render.use_border = False
        scene.render.use_crop_to_border = False
        set_current_only_visibility(spec, lights)
        outputs.append(
            write_render_record(
                scene,
                output_root,
                f"current-sheath/{family}/F285.png",
                DIAGNOSTIC_FRAME,
                family,
                "actual-material-current-plus-graphite-sheath; hall/CRT/spill/compositor suppressed",
            )
        )
        coverage.append(coverage_record(scene, family, spec))

    # Temporal close evidence for the arrival boundary.  This is the lower 64%
    # of the authored desktop camera, where the large foreground turn and inner
    # connection are otherwise most ambiguous at intended exposure.
    desktop = FAMILIES["desktop"]
    scene.camera = bpy.data.objects[desktop["camera"]]
    scene.render.resolution_x, scene.render.resolution_y = desktop["resolution"]
    set_current_only_visibility(desktop, lights)
    scene.render.use_border = True
    scene.render.use_crop_to_border = True
    scene.render.border_min_x = 0.0
    scene.render.border_max_x = 1.0
    scene.render.border_min_y = 0.0
    scene.render.border_max_y = 0.64
    for frame in DESKTOP_CLOSE_FRAMES:
        outputs.append(
            write_render_record(
                scene,
                output_root,
                f"arrival-close/desktop/F{frame:03d}.png",
                frame,
                "desktop",
                "lower-64-percent current/sheath arrival close; hall/CRT/spill/compositor suppressed",
            )
        )

    svg_relative = "coverage/F285-unwrapped-coverage.svg"
    svg_path = output_root / svg_relative
    svg_path.parent.mkdir(parents=True, exist_ok=True)
    svg_path.write_text(coverage_svg(coverage), encoding="utf-8", newline="\n")
    svg_record = {
        "relativePath": svg_relative,
        "bytes": svg_path.stat().st_size,
        "sha256": sha256_file(svg_path),
        "purpose": "analytic ordered-segment F285 coverage independent of camera and exposure",
    }

    source_after = {
        "path": source.name,
        "bytes": source.stat().st_size,
        "sha256": sha256_file(source),
    }
    if source_after != source_before:
        raise RuntimeError("diagnostic renderer changed the derivative blend")
    report = {
        "schema": "quantum-hub.phase-4-r2-1.current-diagnostic.v1",
        "status": "PASS",
        "source": source_before,
        "settings": {
            "engine": "CYCLES",
            "samples": SAMPLES,
            "adaptiveThreshold": 0.035,
            "denoiser": "OPENIMAGEDENOISE",
            "motionBlur": False,
            "compositorSuppressed": True,
            "hallSuppressed": True,
            "crtSuppressed": True,
            "localResponseLightsSuppressed": True,
            "actualCurrentMaterialRetained": True,
            "actualGraphiteSheathMaterialRetained": True,
            "neutralInspectionLightingOnly": True,
            "device": device,
        },
        "coverage": coverage,
        "coverageSha256": canonical_hash(coverage),
        "outputs": outputs,
        "outputsSha256": canonical_hash(outputs),
        "coverageGraphic": svg_record,
        "visualScope": {
            "acceptedAuthority": False,
            "purpose": "diagnostic isolation of channel continuity and sheath visibility",
            "productionRenderStarted": False,
            "encodingStarted": False,
            "sourceSavedByRenderer": False,
        },
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"PHASE4R2_1_CURRENT_DIAGNOSTIC_REPORT={report_path}")


if __name__ == "__main__":
    main()
