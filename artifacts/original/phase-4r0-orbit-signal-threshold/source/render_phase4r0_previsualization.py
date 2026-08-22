"""Render deterministic, low-cost Phase 4-R0 previsualization frames.

Raw sequences are external-only.  This renderer deliberately stops at the
physical threshold frame; the bounded black beat and real semantic ENTRY plate
are composited by the review packager without modifying production runtime.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
import time
from pathlib import Path
from typing import Any

import bpy

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import phase4r0_config as cfg


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_args() -> dict[str, Any]:
    tail = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    result: dict[str, Any] = {
        "variant": "desktop",
        "frames": "1,106,165,225,285,356,370,405,460,480,500",
        "output": None,
        "width": None,
        "height": None,
        "percentage": 100,
        "engine": "eevee",
    }
    for name in tuple(result):
        flag = f"--{name}"
        if flag in tail:
            index = tail.index(flag) + 1
            if index >= len(tail):
                raise RuntimeError(f"{flag} requires a value")
            result[name] = tail[index]
    if result["variant"] not in cfg.CAMERA_SPECS:
        raise RuntimeError(f"--variant must be one of {sorted(cfg.CAMERA_SPECS)}")
    if result["engine"] not in {"eevee", "workbench"}:
        raise RuntimeError("--engine must be eevee or workbench")
    if result["output"] is None:
        raise RuntimeError("--output is required")
    for name in ("width", "height", "percentage"):
        if result[name] is not None:
            result[name] = int(result[name])
    if (result["width"] is None) != (result["height"] is None):
        raise RuntimeError("--width and --height must be supplied together")
    return result


def parse_frames(value: str) -> list[int]:
    if value in {"all", "all-physical"}:
        return list(range(cfg.FRAME_START, cfg.EVENTS["threshold_crossing"] + 1))
    frames: list[int] = []
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
    invalid = [frame for frame in frames if not cfg.FRAME_START <= frame <= cfg.EVENTS["threshold_crossing"]]
    if invalid:
        raise RuntimeError(f"physical renderer frames outside 1..{cfg.EVENTS['threshold_crossing']}: {invalid}")
    if not frames:
        raise RuntimeError("no frames requested")
    return frames


def assign_material(obj_name: str, material_name: str) -> None:
    obj = bpy.data.objects.get(obj_name)
    material = bpy.data.materials.get(material_name)
    if obj is None or material is None:
        raise RuntimeError(f"missing material binding {obj_name} -> {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)


def configure_variant(variant: str) -> None:
    desktop = variant == "desktop"
    bpy.data.collections["DESKTOP_2_5_TURN_SPIRAL_CABLE"].hide_render = not desktop
    bpy.data.collections["MOBILE_2_25_TURN_SPIRAL_CABLE"].hide_render = desktop
    desktop_contacts = bpy.data.collections.get("PHASE3_DESKTOP_CONTACT_LIGHTS")
    mobile_contacts = bpy.data.collections.get("PHASE3_MOBILE_CONTACT_LIGHTS")
    if desktop_contacts is not None:
        desktop_contacts.hide_render = not desktop
    if mobile_contacts is not None:
        mobile_contacts.hide_render = desktop
    field_family = "Desktop" if desktop else "Mobile"
    assign_material("CRT_InternalPhosphorLayer", f"Phase3R_PhosphorField_{field_family}")
    bpy.context.scene.camera = bpy.data.objects[cfg.CAMERA_SPECS[variant]["camera"]]


def configure_render(args: dict[str, Any]) -> tuple[int, int]:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE" if args["engine"] == "eevee" else "BLENDER_WORKBENCH"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 30
    scene.render.resolution_percentage = args["percentage"]
    width, height = (
        (args["width"], args["height"])
        if args["width"] is not None
        else cfg.CAMERA_SPECS[args["variant"]]["resolution"]
    )
    scene.render.resolution_x = int(width)
    scene.render.resolution_y = int(height)
    scene.render.film_transparent = False
    scene.render.use_motion_blur = False
    scene.render.use_persistent_data = True
    scene.render.fps = cfg.FPS
    scene.render.fps_base = 1.0
    configure_variant(args["variant"])
    if args["engine"] == "workbench":
        shading = scene.display.shading
        shading.light = "STUDIO"
        shading.color_type = "MATERIAL"
        shading.show_shadows = True
        shading.show_cavity = True
        shading.cavity_type = "WORLD"
        shading.show_specular_highlight = True
        shading.background_type = "WORLD"
        shading.background_color = (0.005, 0.006, 0.006)
    return int(width), int(height)


def camera_telemetry(frame: int, variant: str) -> dict[str, Any]:
    scene = bpy.context.scene
    scene.frame_set(frame)
    camera = scene.camera
    rig = bpy.data.objects[cfg.CAMERA_SPECS[variant]["rig"]]
    world = camera.matrix_world.translation
    dx = world.x - cfg.ORBIT_TARGET[0]
    dy = world.y - cfg.ORBIT_TARGET[1]
    dz = world.z - cfg.ORBIT_TARGET[2]
    return {
        "frame": frame,
        "normalized_film": round(cfg.normalized(frame), 8),
        "camera_world": [round(float(world.x), 8), round(float(world.y), 8), round(float(world.z), 8)],
        "angle_degrees": round(math.degrees(rig.rotation_euler.z), 8),
        "horizontal_radius": round(math.hypot(dx, dy), 8),
        "elevation": round(dz, 8),
        "camera_to_target_distance": round(math.sqrt(dx * dx + dy * dy + dz * dz), 8),
        "focal_length_mm": round(float(camera.data.lens), 8),
    }


def main() -> None:
    if Path(bpy.data.filepath).resolve() != cfg.DERIVATIVE_SOURCE.resolve():
        raise RuntimeError("renderer must open the Phase 4-R0 derivative")
    build = json.loads(cfg.BUILD_REPORT.read_text(encoding="utf-8"))
    expected_hash = build["phase4r0_derivative"]["sha256"]
    actual_hash = sha256(cfg.DERIVATIVE_SOURCE)
    if actual_hash != expected_hash:
        raise RuntimeError(f"derivative hash mismatch: {actual_hash} != {expected_hash}")

    args = parse_args()
    frames = parse_frames(str(args["frames"]))
    output = Path(str(args["output"])).resolve()
    repository = cfg.REPOSITORY_ROOT.resolve()
    if output == repository or repository in output.parents:
        raise RuntimeError("all Phase 4-R0 raw preview frames must remain outside the repository")
    output.mkdir(parents=True, exist_ok=True)
    width, height = configure_render(args)

    scene = bpy.context.scene
    records = []
    started = time.perf_counter()
    for order, frame in enumerate(frames, 1):
        frame_started = time.perf_counter()
        telemetry = camera_telemetry(frame, args["variant"])
        target = output / f"phase4r0-{args['variant']}-{frame:04d}.png"
        scene.render.filepath = str(target)
        bpy.ops.render.render(write_still=True)
        elapsed = time.perf_counter() - frame_started
        records.append(
            {
                **telemetry,
                "path": target.name,
                "bytes": target.stat().st_size,
                "sha256": sha256(target),
                "render_seconds": round(elapsed, 4),
            }
        )
        print(
            f"QH_PHASE4R0_FRAME={frame} VARIANT={args['variant']} "
            f"ORDER={order}/{len(frames)} SECONDS={elapsed:.3f}"
        )
    report = {
        "schema": "quantum-hub.phase-4-r0-orbit-signal-threshold.raw-preview-render.v1",
        "status": "PASS",
        "evidence_class": "FRESH_BLENDER_EEVEE_PREVISUALIZATION",
        "production_rendering": False,
        "variant": args["variant"],
        "resolution": [width, height],
        "resolution_percentage": args["percentage"],
        "fps": cfg.FPS,
        "engine": scene.render.engine,
        "requested_engine": args["engine"],
        "source": {
            "path": cfg.DERIVATIVE_SOURCE.name,
            "bytes": cfg.DERIVATIVE_SOURCE.stat().st_size,
            "sha256": actual_hash,
        },
        "frames": records,
        "total_seconds": round(time.perf_counter() - started, 4),
    }
    report_path = output / f"phase4r0-{args['variant']}-render-report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"QH_PHASE4R0_RENDER_REPORT={report_path}")


if __name__ == "__main__":
    main()
