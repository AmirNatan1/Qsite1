"""Render a bounded, external R1.1 checkpoint diagnostic matrix.

This producer never saves the Blender file and never publishes into Git.  Its
normal views use the accepted physical camera families at the intended Dark V2
exposure.  Three temporary cameras provide secondary wall/header detail only.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import time
from typing import Any

import bpy
from mathutils import Vector

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
import phase4r1_1_repair_config as cfg


FAMILIES = {
    "desktop": {
        "camera": "Phase4R1_Camera_Desktop",
        "collection": "PHASE4R1V2_CABLE_DESKTOP",
        "resolution": (1440, 900),
    },
    "mobile": {
        "camera": "Phase4R1_Camera_Mobile",
        "collection": "PHASE4R1V2_CABLE_MOBILE",
        "resolution": (390, 844),
    },
    "landscape": {
        "camera": "Phase4R1_Camera_Landscape",
        "collection": "PHASE4R1V2_CABLE_LANDSCAPE",
        "resolution": (844, 390),
    },
}

NORMAL_MATRIX = (
    ("desktop", 1),
    ("desktop", 76),
    ("desktop", 165),
    ("desktop", 225),
    ("desktop", 370),
    ("mobile", 1),
    ("mobile", 165),
    ("landscape", 1),
)

DETAIL_MATRIX = (
    {
        "role": "service-wall-detail",
        "location": (-4.75, 4.65, 3.85),
        "target": (-10.05, 11.10, 2.75),
        "lens": 52.0,
    },
    {
        "role": "vent-recess-detail",
        "location": (2.60, 4.85, 3.70),
        "target": (6.75, 11.12, 2.85),
        "lens": 54.0,
    },
    {
        "role": "opening-header-detail",
        "location": (0.65, -12.00, 4.45),
        "target": (0.00, -6.40, 6.48),
        "lens": 42.0,
    },
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def record(path: Path) -> dict[str, Any]:
    return {"bytes": path.stat().st_size, "sha256": sha256(path)}


def atomic_json(path: Path, value: dict[str, Any]) -> None:
    pending = path.with_name(path.stem + ".pending.json")
    if pending.exists():
        raise RuntimeError(f"stale diagnostic JSON staging file: {pending.name}")
    try:
        pending.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
        parsed = json.loads(pending.read_text(encoding="utf-8"))
        if parsed.get("status") != value.get("status"):
            raise RuntimeError(f"diagnostic JSON self-validation failed: {path.name}")
        os.replace(pending, path)
    finally:
        pending.unlink(missing_ok=True)


def png_dimensions(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise RuntimeError(f"invalid PNG authority: {path.name}")
    return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", choices=("periphery",), required=True)
    parser.add_argument("--output-root", required=True)
    return parser.parse_args(argv)


def external_fresh_root(value: str) -> Path:
    output = Path(value).resolve()
    repository = cfg.REPO_ROOT.resolve()
    if output == repository or repository in output.parents:
        raise RuntimeError("R1.1 diagnostic output must remain external to Git")
    if output.exists():
        raise RuntimeError("R1.1 diagnostic output root must not already exist")
    output.mkdir(parents=True)
    return output


def verify_authority() -> tuple[dict[str, Any], dict[str, Any]]:
    opened = Path(bpy.data.filepath).resolve()
    if opened != cfg.DERIVATIVE.resolve():
        raise RuntimeError("R1.1 diagnostic requires the exact isolated derivative")
    build = json.loads(cfg.BUILD_REPORT.read_text(encoding="utf-8"))
    if build.get("status") != "PASS" or build.get("throughStage") != "periphery":
        raise RuntimeError("R1.1 periphery source-build authority is absent or stale")
    actual = {"bytes": opened.stat().st_size, "sha256": sha256(opened)}
    expected = {key: build["derivative"][key] for key in ("bytes", "sha256")}
    if actual != expected:
        raise RuntimeError("R1.1 derivative differs from the source-build authority")
    for key in ("builder", "config"):
        producer_path = cfg.REPO_ROOT / build["producerAuthorities"][key]["path"]
        producer_actual = {"bytes": producer_path.stat().st_size, "sha256": sha256(producer_path)}
        producer_expected = {name: build["producerAuthorities"][key][name] for name in ("bytes", "sha256")}
        if producer_actual != producer_expected:
            raise RuntimeError(f"R1.1 {key} producer authority is stale")
    return build, actual


def configure_family(family: str) -> None:
    scene = bpy.context.scene
    scene.camera = bpy.data.objects[FAMILIES[family]["camera"]]
    for candidate, spec in FAMILIES.items():
        bpy.data.collections[spec["collection"]].hide_render = candidate != family


def configure_render(width: int, height: int) -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = 1.0
    scene.render.pixel_aspect_y = 1.0
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 35
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.render.use_motion_blur = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 1.0


def scene_state(scene: bpy.types.Scene) -> dict[str, Any]:
    return {
        "camera": None if scene.camera is None else scene.camera.name,
        "frame": int(scene.frame_current),
        "filepath": scene.render.filepath,
        "engine": scene.render.engine,
        "resolution": [scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage],
        "pixelAspect": [float(scene.render.pixel_aspect_x), float(scene.render.pixel_aspect_y)],
        "imageSettings": {
            "fileFormat": scene.render.image_settings.file_format,
            "colorMode": scene.render.image_settings.color_mode,
            "colorDepth": scene.render.image_settings.color_depth,
            "compression": int(scene.render.image_settings.compression),
        },
        "filmTransparent": bool(scene.render.film_transparent),
        "useFileExtension": bool(scene.render.use_file_extension),
        "useMotionBlur": bool(scene.render.use_motion_blur),
        "viewSettings": {
            "viewTransform": scene.view_settings.view_transform,
            "look": scene.view_settings.look,
            "exposure": float(scene.view_settings.exposure),
        },
        "familyVisibility": {
            name: bool(bpy.data.collections[spec["collection"]].hide_render)
            for name, spec in FAMILIES.items()
        },
    }


def restore_scene_state(scene: bpy.types.Scene, state: dict[str, Any]) -> None:
    scene.camera = None if state["camera"] is None else bpy.data.objects[state["camera"]]
    scene.frame_set(state["frame"])
    scene.render.filepath = state["filepath"]
    scene.render.engine = state["engine"]
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = state["resolution"]
    scene.render.pixel_aspect_x, scene.render.pixel_aspect_y = state["pixelAspect"]
    scene.render.image_settings.file_format = state["imageSettings"]["fileFormat"]
    scene.render.image_settings.color_mode = state["imageSettings"]["colorMode"]
    scene.render.image_settings.color_depth = state["imageSettings"]["colorDepth"]
    scene.render.image_settings.compression = state["imageSettings"]["compression"]
    scene.render.film_transparent = state["filmTransparent"]
    scene.render.use_file_extension = state["useFileExtension"]
    scene.render.use_motion_blur = state["useMotionBlur"]
    scene.view_settings.view_transform = state["viewSettings"]["viewTransform"]
    scene.view_settings.look = state["viewSettings"]["look"]
    scene.view_settings.exposure = state["viewSettings"]["exposure"]
    for name, hidden in state["familyVisibility"].items():
        bpy.data.collections[FAMILIES[name]["collection"]].hide_render = hidden


def render_frame(output: Path, filename: str, family: str, frame: int, role: str) -> dict[str, Any]:
    width, height = FAMILIES[family]["resolution"]
    configure_family(family)
    configure_render(width, height)
    scene = bpy.context.scene
    scene.frame_set(frame)
    target = output / filename
    scene.render.filepath = str(target)
    started = time.perf_counter()
    if bpy.ops.render.render(write_still=True) != {"FINISHED"}:
        raise RuntimeError(f"R1.1 render operator failed: {filename}")
    actual_width, actual_height = png_dimensions(target)
    if (actual_width, actual_height) != (width, height):
        raise RuntimeError(f"R1.1 diagnostic dimension mismatch: {filename}")
    return {
        "role": role,
        "path": filename,
        "family": family,
        "frame": frame,
        "width": width,
        "height": height,
        "renderSeconds": round(time.perf_counter() - started, 6),
        **record(target),
    }


def add_audit_camera() -> bpy.types.Object:
    object_name = "Phase4R11_DiagnosticCamera_TEMP"
    data_name = object_name + "_Data"
    if bpy.data.objects.get(object_name) is not None or bpy.data.cameras.get(data_name) is not None:
        raise RuntimeError("temporary R1.1 diagnostic camera already exists")
    data = bpy.data.cameras.new(data_name)
    data.sensor_fit = "AUTO"
    data.clip_start = 0.05
    data.clip_end = 200.0
    obj = bpy.data.objects.new(object_name, data)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def render_detail(output: Path, camera: bpy.types.Object, spec: dict[str, Any]) -> dict[str, Any]:
    configure_family("desktop")
    configure_render(960, 600)
    scene = bpy.context.scene
    scene.frame_set(1)
    camera.location = spec["location"]
    direction = Vector(spec["target"]) - Vector(spec["location"])
    if direction.length <= 1e-9:
        raise RuntimeError(f"zero diagnostic direction: {spec['role']}")
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = float(spec["lens"])
    scene.camera = camera
    filename = f"detail-{spec['role']}.png"
    target = output / filename
    scene.render.filepath = str(target)
    started = time.perf_counter()
    if bpy.ops.render.render(write_still=True) != {"FINISHED"}:
        raise RuntimeError(f"R1.1 detail render operator failed: {filename}")
    if png_dimensions(target) != (960, 600):
        raise RuntimeError(f"R1.1 detail dimension mismatch: {filename}")
    return {
        "role": spec["role"],
        "path": filename,
        "family": "diagnostic-desktop-physical",
        "frame": 1,
        "width": 960,
        "height": 600,
        "camera": {
            "location": list(spec["location"]),
            "target": list(spec["target"]),
            "lensMillimeters": spec["lens"],
        },
        "renderSeconds": round(time.perf_counter() - started, 6),
        **record(target),
    }


def main() -> None:
    args = parse_args()
    build, source_record = verify_authority()
    output = external_fresh_root(args.output_root)
    scene = bpy.context.scene
    original_state = scene_state(scene)
    original_counts = {"objects": len(bpy.data.objects), "cameras": len(bpy.data.cameras), "actions": len(bpy.data.actions)}
    files: list[dict[str, Any]] = []
    temporary_camera = None
    try:
        try:
            for family, frame in NORMAL_MATRIX:
                filename = f"normal-{family}-F{frame:03d}.png"
                files.append(render_frame(output, filename, family, frame, "normal-exposure-physical"))
                print(f"PHASE4R1_1_DIAGNOSTIC={filename}")
            temporary_camera = add_audit_camera()
            for spec in DETAIL_MATRIX:
                files.append(render_detail(output, temporary_camera, spec))
                print(f"PHASE4R1_1_DIAGNOSTIC=detail-{spec['role']}.png")
        finally:
            if temporary_camera is not None:
                data = temporary_camera.data
                bpy.data.objects.remove(temporary_camera, do_unlink=True)
                bpy.data.cameras.remove(data)
            restore_scene_state(scene, original_state)
        final_counts = {"objects": len(bpy.data.objects), "cameras": len(bpy.data.cameras), "actions": len(bpy.data.actions)}
        restored_state = scene_state(scene)
        if final_counts != original_counts or restored_state != original_state:
            raise RuntimeError("R1.1 diagnostic did not exactly restore its temporary state")
        if {"bytes": cfg.DERIVATIVE.stat().st_size, "sha256": sha256(cfg.DERIVATIVE)} != source_record:
            raise RuntimeError("R1.1 diagnostic changed the derivative on disk")
        report = {
            "schema": "quantum-hub.phase-4-r1-1.periphery-checkpoint-diagnostic.v1",
            "status": "PASS",
            "stage": args.stage,
            "source": {
                "path": cfg.DERIVATIVE.relative_to(cfg.REPO_ROOT).as_posix(),
                **source_record,
            },
            "sourceBuild": {
                "path": cfg.BUILD_REPORT.relative_to(cfg.REPO_ROOT).as_posix(),
                **record(cfg.BUILD_REPORT),
            },
            "producer": {
                "path": Path(__file__).resolve().relative_to(cfg.REPO_ROOT).as_posix(),
                **record(Path(__file__).resolve()),
            },
            "renderSettings": {
                "engine": "BLENDER_EEVEE",
                "viewTransform": "AgX",
                "look": "AgX - Medium High Contrast",
                "exposureStops": 1.0,
                "motionBlur": False,
                "primaryEvidenceUsesAcceptedCameras": True,
                "detailViewsAreSecondary": True,
            },
            "files": files,
            "restoration": {
                "beforeState": original_state,
                "afterState": restored_state,
                "beforeCounts": original_counts,
                "afterCounts": final_counts,
                "passes": True,
            },
            "authorization": cfg.AUTHORIZATION,
            "humanReviewGate": None,
            "reusedRecoveredOldVisualEvidence": False,
        }
        report_path = output / "phase4r1-1-periphery-checkpoint-diagnostic.json"
        atomic_json(report_path, report)
    except BaseException as error:
        failure = {
            "schema": "quantum-hub.phase-4-r1-1.periphery-checkpoint-diagnostic-failure.v1",
            "status": "FAIL",
            "stage": args.stage,
            "errorType": type(error).__name__,
            "error": str(error),
            "completedFiles": files,
            "authorization": cfg.AUTHORIZATION,
            "humanReviewGate": None,
        }
        atomic_json(output / "phase4r1-1-periphery-checkpoint-diagnostic-failure.json", failure)
        raise
    print("PHASE4R1_1_DIAGNOSTIC_STATUS=PASS")
    print(f"PHASE4R1_1_DIAGNOSTIC_REPORT={report_path}")


if __name__ == "__main__":
    main()
