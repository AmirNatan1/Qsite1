"""Render bounded Cycles pilots from the validated R2.1 current derivative.

This is deliberately not a production renderer: it accepts an explicit small
frame plan, renders at 50% linear resolution / 64 samples, never saves the
opened blend, and verifies that the source blend hash is unchanged.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

import bpy
import numpy as np


FAMILIES = {
    "desktop": {
        "camera": "Phase4R1_Camera_Desktop",
        "collection": "PHASE4R1V2_CABLE_DESKTOP",
        "pilotResolution": (960, 600),
        "productionResolution": (1920, 1200),
    },
    "portrait": {
        "camera": "Phase4R1_Camera_Mobile",
        "collection": "PHASE4R1V2_CABLE_MOBILE",
        "pilotResolution": (390, 844),
        "productionResolution": (780, 1688),
    },
    "landscape": {
        "camera": "Phase4R1_Camera_Landscape",
        "collection": "PHASE4R1V2_CABLE_LANDSCAPE",
        "pilotResolution": (844, 390),
        "productionResolution": (1688, 780),
    },
}
SAMPLES = 64
ADAPTIVE_THRESHOLD = 0.03


def parse_args() -> argparse.Namespace:
    separator = sys.argv.index("--") if "--" in sys.argv else len(sys.argv)
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-root", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument(
        "--plan",
        required=True,
        help="semicolon-separated family:frame,frame entries, e.g. desktop:225,261,285;landscape:285",
    )
    parser.add_argument("--production-boundary", action="store_true")
    parser.add_argument("--master-root")
    return parser.parse_args(sys.argv[separator + 1 :])


def parse_plan(value: str) -> dict[str, list[int]]:
    result: dict[str, list[int]] = {}
    for group in value.split(";"):
        family, raw_frames = group.split(":", 1)
        family = family.strip()
        if family not in FAMILIES:
            raise RuntimeError(f"unknown pilot family: {family}")
        frames = sorted({int(frame) for frame in raw_frames.split(",") if frame.strip()})
        if not frames or any(frame < 1 or frame > 500 for frame in frames):
            raise RuntimeError(f"invalid bounded pilot frames for {family}")
        result[family] = frames
    if not result or sum(len(frames) for frames in result.values()) > 18:
        raise RuntimeError("pilot plan must contain between 1 and 18 bounded frames")
    return result


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


def configure_scene(production_boundary: bool) -> tuple[bpy.types.Scene, dict[str, Any]]:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = 1.0
    scene.render.pixel_aspect_y = 1.0
    scene.render.film_transparent = False
    scene.render.use_border = False
    scene.render.use_crop_to_border = False
    scene.render.use_file_extension = False
    scene.render.use_motion_blur = True
    scene.render.use_persistent_data = True
    scene.render.fps = 30
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "16"
    scene.render.image_settings.compression = 30
    if hasattr(scene.render.image_settings, "color_management"):
        scene.render.image_settings.color_management = "FOLLOW_SCENE"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 1.0
    scene.cycles.samples = 192 if production_boundary else SAMPLES
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.018 if production_boundary else ADAPTIVE_THRESHOLD
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
    device = configure_device(scene)
    return scene, device


def image_statistics(path: Path) -> dict[str, Any]:
    image = bpy.data.images.load(str(path), check_existing=False)
    try:
        values = np.empty(len(image.pixels), dtype=np.float32)
        image.pixels.foreach_get(values)
        rgb = values.reshape((-1, 4))[:, :3]
        threshold = 1.0 / 65535.0
        return {
            "width": int(image.size[0]),
            "height": int(image.size[1]),
            "minimumRgb": round(float(np.min(rgb)), 10),
            "maximumRgb": round(float(np.max(rgb)), 10),
            "nonBlackRgbSamples": int(np.count_nonzero(rgb > threshold)),
            "totalRgbSamples": int(rgb.size),
            "exactBlackRgb": bool(np.all(rgb == 0.0)),
        }
    finally:
        bpy.data.images.remove(image)


def decoded_rgb_comparison(rendered_path: Path, master_path: Path, master_label: str) -> dict[str, Any]:
    rendered = bpy.data.images.load(str(rendered_path), check_existing=False)
    master = bpy.data.images.load(str(master_path), check_existing=False)
    try:
        if tuple(rendered.size) != tuple(master.size):
            raise RuntimeError(f"boundary resolution mismatch: {rendered_path} vs {master_path}")
        rendered_values = np.empty(len(rendered.pixels), dtype=np.float32)
        master_values = np.empty(len(master.pixels), dtype=np.float32)
        rendered.pixels.foreach_get(rendered_values)
        master.pixels.foreach_get(master_values)
        rendered_rgb = rendered_values.reshape((-1, 4))[:, :3]
        master_rgb = master_values.reshape((-1, 4))[:, :3]
        difference = np.abs(rendered_rgb - master_rgb)
        return {
            "masterRelativePath": master_label,
            "masterBytes": master_path.stat().st_size,
            "masterSha256": sha256_file(master_path),
            "decodedRgbSamples": int(rendered_rgb.size),
            "differentRgbSamples": int(np.count_nonzero(difference)),
            "maximumAbsoluteRgbDifference": round(float(np.max(difference)), 10),
            "zeroPixelDifference": bool(np.all(difference == 0.0)),
        }
    finally:
        bpy.data.images.remove(rendered)
        bpy.data.images.remove(master)


def main() -> None:
    args = parse_args()
    plan = parse_plan(args.plan)
    if args.production_boundary:
        if args.master_root is None:
            raise RuntimeError("production-boundary pilots require --master-root")
        if any(frame < 495 for frames in plan.values() for frame in frames):
            raise RuntimeError("production-boundary pilots are restricted to F495-F500")
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

    master_root = None if args.master_root is None else Path(args.master_root).resolve()
    scene, device = configure_scene(args.production_boundary)
    cable_collections = {spec["collection"] for spec in FAMILIES.values()}
    outputs = []
    for family, frames in plan.items():
        spec = FAMILIES[family]
        scene.camera = bpy.data.objects[spec["camera"]]
        for name in cable_collections:
            bpy.data.collections[name].hide_render = name != spec["collection"]
        resolution_key = "productionResolution" if args.production_boundary else "pilotResolution"
        scene.render.resolution_x, scene.render.resolution_y = spec[resolution_key]
        family_dir = output_root / family
        family_dir.mkdir(parents=True, exist_ok=True)
        for frame in frames:
            output = family_dir / f"F{frame:03d}.png"
            scene.frame_set(frame, subframe=0.0)
            bpy.context.view_layer.update()
            scene.render.filepath = str(output)
            print(f"PHASE4R2_1_PILOT_RENDER={family}:F{frame:03d}:{output}")
            bpy.ops.render.render(write_still=True)
            if not output.is_file():
                raise RuntimeError(f"pilot render did not create {output}")
            output_record = {
                    "family": family,
                    "frame": frame,
                    "relativePath": output.relative_to(output_root).as_posix(),
                    "bytes": output.stat().st_size,
                    "sha256": sha256_file(output),
                    "pixels": image_statistics(output),
                }
            if args.production_boundary:
                master = master_root / family / "frames" / f"F{frame:03d}.png"
                if not master.is_file():
                    raise RuntimeError(f"missing production master for boundary comparison: {master}")
                output_record["masterComparison"] = decoded_rgb_comparison(
                    output,
                    master,
                    f"{family}/frames/F{frame:03d}.png",
                )
            outputs.append(output_record)

    source_after = {
        "path": source.name,
        "bytes": source.stat().st_size,
        "sha256": sha256_file(source),
    }
    if source_after != source_before:
        raise RuntimeError("bounded pilot renderer changed the derivative blend")
    report = {
        "schema": "quantum-hub.phase-4-r2-1.current-pilot-render.v1",
        "status": "PASS",
        "source": source_before,
        "plan": plan,
        "settings": {
            "engine": "CYCLES",
            "mode": "exact-production-black-boundary" if args.production_boundary else "bounded-creative-pilot",
            "samples": 192 if args.production_boundary else SAMPLES,
            "adaptiveThreshold": 0.018 if args.production_boundary else ADAPTIVE_THRESHOLD,
            "denoiser": "OPENIMAGEDENOISE",
            "motionBlur": True,
            "viewTransform": "AgX",
            "look": "AgX - Medium High Contrast",
            "exposure": 1.0,
            "image": {"format": "PNG", "mode": "RGB", "depth": 16},
            "resolutions": {
                family: list(spec["productionResolution" if args.production_boundary else "pilotResolution"])
                for family, spec in FAMILIES.items()
            },
            "device": device,
        },
        "outputs": outputs,
        "outputsSha256": canonical_hash(outputs),
        "authorization": {
            "boundedPilotsOnly": True,
            "productionRenderStarted": False,
            "encodingStarted": False,
            "sourceSavedByRenderer": False,
        },
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"PHASE4R2_1_PILOT_REPORT={report_path}")


if __name__ == "__main__":
    main()
