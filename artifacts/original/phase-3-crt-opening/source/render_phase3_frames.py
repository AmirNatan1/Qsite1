"""Render deterministic Phase 3 frames from the derivative Blender source.

Raw frame sequences must be directed outside the repository. The script keeps
one Blender process alive so Cycles persistent data can amortize scene setup.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

optix_cache = Path(os.environ.get("TEMP", str(Path.home()))) / "QuantumPhase3OptixCache"
optix_cache.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("OPTIX_CACHE_PATH", str(optix_cache))

import bpy

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import phase3_config as cfg


def parse_args() -> dict:
    tail = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    result = {
        "variant": "desktop",
        "quality": "preview",
        "frames": ",".join(str(frame) for frame in cfg.REVIEW_FRAMES.values()),
        "output": None,
        "samples": None,
    }
    for name in ("variant", "quality", "frames", "output", "samples"):
        flag = f"--{name}"
        if flag in tail:
            index = tail.index(flag) + 1
            if index >= len(tail):
                raise RuntimeError(f"{flag} requires a value")
            result[name] = tail[index]
    if result["variant"] not in {"desktop", "mobile"}:
        raise RuntimeError("--variant must be desktop or mobile")
    if result["quality"] not in {"preview", "production"}:
        raise RuntimeError("--quality must be preview or production")
    if result["output"] is None:
        raise RuntimeError("--output is required and must be outside Git for raw frame sequences")
    result["samples"] = None if result["samples"] is None else int(result["samples"])
    return result


def parse_frames(value: str) -> list[int]:
    if value == "all":
        return list(range(cfg.FRAME_START, cfg.FRAME_END + 1))
    frames = []
    for item in value.split(","):
        item = item.strip()
        if not item:
            continue
        if "-" in item:
            start, end = (int(part) for part in item.split("-", 1))
            frames.extend(range(start, end + 1))
        else:
            frames.append(int(item))
    frames = sorted(set(frames))
    invalid = [frame for frame in frames if not cfg.FRAME_START <= frame <= cfg.FRAME_END]
    if invalid:
        raise RuntimeError(f"frames outside production range: {invalid}")
    if not frames:
        raise RuntimeError("no frames requested")
    return frames


def configure_optix() -> list[dict]:
    preferences = bpy.context.preferences.addons["cycles"].preferences
    devices = []
    try:
        preferences.refresh_devices()
    except AttributeError:
        pass
    try:
        preferences.compute_device_type = cfg.CYCLES["compute_backend"]
    except TypeError:
        # Fail over to CUDA only if OptiX is unavailable on the local host.
        preferences.compute_device_type = "CUDA"
    try:
        preferences.get_devices()
    except Exception:
        pass
    for device in preferences.devices:
        enabled = device.type in {"OPTIX", "CUDA"}
        device.use = enabled
        devices.append({"name": device.name, "type": device.type, "enabled": bool(enabled)})
    if not any(record["enabled"] for record in devices):
        raise RuntimeError(f"no OptiX/CUDA Cycles device available: {devices}")
    return devices


def configure_light_linking() -> None:
    scene = bpy.context.scene
    main_receivers = bpy.data.collections.get("PHASE3_CYCLES_MAIN_LIGHT_RECEIVERS")
    if main_receivers is None:
        main_receivers = bpy.data.collections.new("PHASE3_CYCLES_MAIN_LIGHT_RECEIVERS")
        scene.collection.children.link(main_receivers)
    optical_names = {
        "CRT_ConvexThickSmokedGlass",
        "CRT_InternalPhosphorLayer",
        "CRT_WakeHorizontalPhosphorLine",
    }
    optical_prefixes = (
        "CRT_StartupExpansionScanline_",
        "CRT_Scanline_",
        "CRT_Interface",
        "CRT_TextFree",
        "Phase3_Portal",
    )
    for obj in list(bpy.data.objects):
        if obj.type in {"LIGHT", "CAMERA"}:
            continue
        if obj.name in optical_names or obj.name.startswith(optical_prefixes):
            continue
        if main_receivers.objects.get(obj.name) is None:
            main_receivers.objects.link(obj)
    for name in ("Scene_NeutralKey", "Scene_GrazingRim", "Scene_FrontFill", "Scene_BackServiceFill"):
        light = bpy.data.objects.get(name)
        if light is not None:
            if hasattr(light.data, "specular_factor"):
                light.data.specular_factor = 0.0
            light.light_linking.receiver_collection = main_receivers

    for obj in bpy.data.objects:
        if obj.type == "LIGHT" and "ContactLight" in obj.name:
            obj.light_linking.receiver_collection = main_receivers

    accent = bpy.data.objects.get("Scene_GlassProofAccent")
    if accent is not None:
        accent.hide_render = True

    spill = bpy.data.objects.get("Phase3_ScreenSpill")
    if spill is not None:
        spill.light_linking.receiver_collection = main_receivers


def configure_variant(variant: str) -> None:
    desktop = variant == "desktop"
    bpy.data.collections["DESKTOP_2_5_TURN_SPIRAL_CABLE"].hide_render = not desktop
    bpy.data.collections["MOBILE_2_25_TURN_SPIRAL_CABLE"].hide_render = desktop
    bpy.data.collections["PHASE3_DESKTOP_CONTACT_LIGHTS"].hide_render = not desktop
    bpy.data.collections["PHASE3_MOBILE_CONTACT_LIGHTS"].hide_render = desktop
    bpy.context.scene.camera = bpy.data.objects[
        "Phase3_Camera_Desktop" if desktop else "Phase3_Camera_Mobile"
    ]


def configure_render(variant: str, quality: str, samples: int | None) -> list[dict]:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "GPU"
    scene.cycles.samples = int(
        samples
        if samples is not None
        else (cfg.CYCLES["preview_samples"] if quality == "preview" else cfg.CYCLES["samples"])
    )
    scene.cycles.seed = cfg.CYCLES["seed"]
    scene.cycles.use_adaptive_sampling = cfg.CYCLES["adaptive_sampling"]
    scene.cycles.adaptive_threshold = cfg.CYCLES["adaptive_threshold"]
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = cfg.CYCLES["denoiser"]
    scene.cycles.max_bounces = cfg.CYCLES["max_bounces"]
    scene.cycles.diffuse_bounces = cfg.CYCLES["diffuse_bounces"]
    scene.cycles.glossy_bounces = cfg.CYCLES["glossy_bounces"]
    scene.cycles.transmission_bounces = cfg.CYCLES["transmission_bounces"]
    scene.cycles.transparent_max_bounces = cfg.CYCLES["transparent_bounces"]
    scene.cycles.volume_bounces = cfg.CYCLES["volume_bounces"]
    scene.render.use_persistent_data = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 42
    scene.render.resolution_percentage = 100
    if variant == "desktop":
        width, height = cfg.DESKTOP_REVIEW if quality == "preview" else cfg.DESKTOP_MASTER
    else:
        width, height = cfg.MOBILE_REVIEW if quality == "preview" else cfg.MOBILE_MASTER
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    configure_variant(variant)
    configure_light_linking()
    return configure_optix()


def main() -> None:
    args = parse_args()
    frames = parse_frames(str(args["frames"]))
    output = Path(str(args["output"])).resolve()
    repository_root = cfg.REPOSITORY_ROOT.resolve()
    if len(frames) > 20 and (output == repository_root or repository_root in output.parents):
        raise RuntimeError("raw frame sequences must be rendered outside Git")
    output.mkdir(parents=True, exist_ok=True)
    devices = configure_render(args["variant"], args["quality"], args["samples"])
    scene = bpy.context.scene
    records = []
    started = time.perf_counter()
    for order, frame in enumerate(frames, 1):
        frame_started = time.perf_counter()
        scene.frame_set(frame)
        path = output / f"phase3-{args['variant']}-{frame:04d}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        elapsed = time.perf_counter() - frame_started
        records.append(
            {
                "frame": frame,
                "normalized_progress": round(cfg.normalized(frame), 6),
                "path": path.as_posix(),
                "bytes": path.stat().st_size,
                "render_seconds": round(elapsed, 4),
            }
        )
        print(
            f"QH_PHASE3_FRAME={frame} VARIANT={args['variant']} "
            f"ORDER={order}/{len(frames)} SECONDS={elapsed:.3f}"
        )
    report = {
        "schema": "quantum-hub.phase-3-crt-opening.raw-render-report.v1",
        "variant": args["variant"],
        "quality": args["quality"],
        "resolution": [scene.render.resolution_x, scene.render.resolution_y],
        "samples": scene.cycles.samples,
        "engine": scene.render.engine,
        "devices": devices,
        "frames": records,
        "total_seconds": round(time.perf_counter() - started, 4),
    }
    report_path = output / f"phase3-{args['variant']}-{args['quality']}-render-report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"QH_PHASE3_RENDER_REPORT={report_path}")


if __name__ == "__main__":
    main()
