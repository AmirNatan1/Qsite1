"""Render only the authorized refined Cycles stills or short motion samples.

The complete F001-F540 Cycles production film is rejected by construction.
Every output root must be new and external, so recovered R1 visual evidence
cannot be copied forward as refined proof.
"""

from __future__ import annotations

import hashlib
import json
import sys
import time
from pathlib import Path
from typing import Any

import bpy

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
import phase4r1_refined_config as cfg


BENCHMARKS = (
    ("desktop-dark-dormancy", "desktop", 1),
    ("desktop-early-current", "desktop", 76),
    ("desktop-mid-current", "desktop", 165),
    ("desktop-rear-mass", "desktop", 225),
    ("desktop-cable-arrival", "desktop", 285),
    ("desktop-exact-q", "desktop", 355),
    ("desktop-screen-approach", "desktop", 460),
    ("mobile-mid-current", "mobile", 165),
    ("landscape-dark-dormancy", "landscape", 1),
)

MOTION_MODES = {
    "current-sample": ("desktop", 46, 135),
    "q-threshold-sample": ("desktop", 391, 480),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def repo_record(path: Path) -> dict[str, Any]:
    return {"path": path.resolve().relative_to(cfg.REPOSITORY_ROOT.resolve()).as_posix(), "bytes": path.stat().st_size, "sha256": sha256(path)}


def parse_args() -> dict[str, Any]:
    values: dict[str, Any] = {"mode": None, "output": None, "samples": None}
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    index = 0
    while index < len(argv):
        token = argv[index]
        if not token.startswith("--") or index + 1 >= len(argv):
            raise RuntimeError(f"invalid Cycles argument: {token}")
        key = token[2:].replace("-", "_")
        if key not in values:
            raise RuntimeError(f"unknown Cycles argument: {token}")
        values[key] = argv[index + 1]
        index += 2
    if values["mode"] not in {"benchmarks", *MOTION_MODES}:
        raise RuntimeError("--mode must be benchmarks, current-sample, or q-threshold-sample")
    if values["output"] is None:
        raise RuntimeError("--output is required")
    expected_samples = 192 if values["mode"] == "benchmarks" else 96
    values["samples"] = expected_samples if values["samples"] is None else int(values["samples"])
    if values["samples"] != expected_samples:
        raise RuntimeError(f"{values['mode']} is fixed at {expected_samples} Cycles samples")
    return values


def external_empty_root(value: str) -> Path:
    output = Path(value).resolve()
    repository = cfg.REPOSITORY_ROOT.resolve()
    if output == repository or repository in output.parents:
        raise RuntimeError("refined Cycles evidence must remain external to Git")
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise RuntimeError("refined Cycles output must be a new empty root; recovered visual evidence is ineligible")
    return output


def verify_source() -> tuple[dict[str, Any], dict[str, Any]]:
    opened = Path(bpy.data.filepath).resolve()
    if opened != cfg.DERIVATIVE_SOURCE.resolve():
        raise RuntimeError("Cycles producer requires the exact refined derivative open")
    build = json.loads(cfg.BUILD_REPORT.read_text(encoding="utf-8"))
    validation = json.loads(cfg.VALIDATION_REPORT.read_text(encoding="utf-8"))
    actual = repo_record(opened)
    if build.get("status") != "PASS" or validation.get("status") != "PASS" or actual != build["sourceAuthorities"]["refinedDerivative"] or actual != validation["sourceAuthorities"]["derivative"]:
        raise RuntimeError("refined Cycles source authorities are missing, stale, or not PASS")
    producer = repo_record(Path(__file__).resolve())
    if build["producerAuthorities"].get("cycles-benchmarks-renderer") != producer or validation["producerAuthorities"].get("cycles-benchmarks-renderer") != producer:
        raise RuntimeError("Cycles producer is not exact-hash-bound by build and validation")
    try:
        scene_visual_authority = json.loads(str(bpy.context.scene.get("phase4r1v2_hall_visual_authority_json", "")))
    except (TypeError, ValueError, json.JSONDecodeError):
        scene_visual_authority = None
    if (
        build.get("design", {}).get("environment", {}).get("visualAuthority") != cfg.HALL_VISUAL_AUTHORITY
        or validation.get("livePreflight", {}).get("audits", {}).get("hallVisualAuthority", {}).get("authority") != cfg.HALL_VISUAL_AUTHORITY
        or validation.get("livePreflight", {}).get("audits", {}).get("hallVisualAuthority", {}).get("passes") is not True
        or scene_visual_authority != cfg.HALL_VISUAL_AUTHORITY
    ):
        raise RuntimeError("Cycles global hall visual authority is absent or stale")
    return build, validation


def configure_family(family: str) -> None:
    scene = bpy.context.scene
    scene.camera = bpy.data.objects[cfg.CAMERAS[family]]
    for candidate, spec in cfg.CABLE_FAMILIES.items():
        bpy.data.collections[spec["collection"]].hide_render = candidate != family


def configure_device(scene: bpy.types.Scene) -> dict[str, Any]:
    preferences = bpy.context.preferences.addons["cycles"].preferences
    attempts = []
    for backend in ("OPTIX", "CUDA"):
        try:
            preferences.compute_device_type = backend
            preferences.get_devices()
            devices = [device for device in preferences.devices if device.type == backend]
            attempts.append({"backend": backend, "devices": [device.name for device in devices]})
            if devices:
                for device in preferences.devices:
                    device.use = device.type == backend
                scene.cycles.device = "GPU"
                return {"backend": backend, "sceneDevice": "GPU", "devices": [{"name": device.name, "type": device.type, "use": bool(device.use)} for device in preferences.devices], "attempts": attempts}
        except Exception as error:
            attempts.append({"backend": backend, "error": str(error)})
    preferences.get_devices()
    for device in preferences.devices:
        device.use = device.type == "CPU"
    scene.cycles.device = "CPU"
    return {"backend": "CPU", "sceneDevice": "CPU", "devices": [{"name": device.name, "type": device.type, "use": bool(device.use)} for device in preferences.devices], "attempts": attempts}


def render_one(target: Path, family: str, frame: int, width: int, height: int, role: str) -> dict[str, Any]:
    scene = bpy.context.scene
    configure_family(family)
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.frame_set(frame)
    scene.render.filepath = str(target)
    started = time.perf_counter()
    bpy.ops.render.render(write_still=True)
    return {"role": role, "path": target.name, "bytes": target.stat().st_size, "sha256": sha256(target), "width": width, "height": height, "mediaType": "image/png", "family": family, "frame": frame, "renderSeconds": round(time.perf_counter() - started, 6)}


def main() -> None:
    args = parse_args()
    build, validation = verify_source()
    output = external_empty_root(str(args["output"]))
    mode = str(args["mode"])
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    device = configure_device(scene)
    scene.cycles.samples = int(args["samples"])
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
    scene.cycles.use_adaptive_sampling = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 30
    scene.render.film_transparent = False
    scene.render.pixel_aspect_x = 1.0
    scene.render.pixel_aspect_y = 1.0
    scene.render.use_motion_blur = mode != "benchmarks"
    scene.view_settings.view_transform = cfg.HALL_VISUAL_AUTHORITY["viewTransform"]
    scene.view_settings.look = cfg.HALL_VISUAL_AUTHORITY["look"]
    scene.view_settings.exposure = float(cfg.HALL_VISUAL_AUTHORITY["exposureStops"])
    files = []
    if mode == "benchmarks":
        for order, (benchmark_id, family, frame) in enumerate(BENCHMARKS, 1):
            width, height = cfg.CYCLES_BENCHMARK_RESOLUTIONS[family]
            target = output / f"phase4r1-refined-cycles-{benchmark_id}.png"
            files.append(render_one(target, family, frame, width, height, "cycles-benchmark"))
            files[-1]["benchmarkId"] = benchmark_id
            print(f"QH_PHASE4R1_REFINED_CYCLES_BENCHMARK={benchmark_id} ORDER={order}/{len(BENCHMARKS)}")
        schema_role = "cycles-benchmarks"
    else:
        family, start, end = MOTION_MODES[mode]
        width, height = cfg.PROJECTION_RESOLUTIONS[family]
        for order, frame in enumerate(range(start, end + 1), 1):
            target = output / f"F{frame:03d}.png"
            files.append(render_one(target, family, frame, width, height, "cycles-motion-frame"))
            print(f"QH_PHASE4R1_REFINED_CYCLES_MOTION={mode}:F{frame:03d} ORDER={order}/{end-start+1}")
        schema_role = f"cycles-{mode}"
    source_authorities = {
        "derivative": repo_record(cfg.DERIVATIVE_SOURCE),
        "sourceBuild": repo_record(cfg.BUILD_REPORT),
        "sourceValidation": repo_record(cfg.VALIDATION_REPORT),
        "assetLedger": repo_record(cfg.ASSET_LEDGER),
        "exactQProvenance": repo_record(cfg.Q_PROVENANCE_REPORT),
    }
    report = {
        "schema": f"quantum-hub.phase-4-r1.refined-proving-hall.{schema_role}.v2",
        "status": "PASS",
        "generatedAt": cfg.GENERATED_AT,
        "mode": mode,
        "sourceAuthorities": source_authorities,
        "producerAuthorities": build["producerAuthorities"],
        "renderSettings": {"engine": "CYCLES", "samples": scene.cycles.samples, "adaptiveSampling": True, "denoiser": scene.cycles.denoiser, "motionBlur": bool(scene.render.use_motion_blur), "viewTransform": scene.view_settings.view_transform, "look": scene.view_settings.look, "exposureStops": float(scene.view_settings.exposure), "globalVisualAuthority": cfg.HALL_VISUAL_AUTHORITY, "computeDevice": device},
        "files": files,
        "reusedRecoveredOldVisualEvidence": False,
        **cfg.AUTHORIZATION,
        "authorization": cfg.AUTHORIZATION,
    }
    manifest = output / f"phase4r1-refined-{schema_role}-manifest.json"
    manifest.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"QH_PHASE4R1_REFINED_CYCLES_MANIFEST={manifest}")


if __name__ == "__main__":
    main()
