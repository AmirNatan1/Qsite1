"""Render the seven authorized physical Cycles benchmark stills and bind ENTRY."""

from __future__ import annotations

import hashlib
import json
import shutil
import sys
import time
from pathlib import Path
from typing import Any

import bpy

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
import phase4r1_config as cfg


BENCHMARKS = (
    ("desktop-dormant-wide", "desktop", 1),
    ("desktop-early-current", "desktop", 76),
    ("desktop-mid-conduction", "desktop", 165),
    ("desktop-side-back-orbit", "desktop", 195),
    ("desktop-q-activation", "desktop", 370),
    ("desktop-late-approach", "desktop", 460),
    ("mobile-mid-conduction", "mobile", 165),
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def authority_record(path: Path) -> dict[str, Any]:
    return {"path": path.resolve().relative_to(cfg.REPOSITORY_ROOT.resolve()).as_posix(), "bytes": path.stat().st_size, "sha256": sha256(path)}


def parse_args() -> dict[str, Any]:
    result: dict[str, Any] = {"output": None, "semantic_entry_plate": None, "samples": 192}
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    index = 0
    while index < len(argv):
        key = argv[index][2:].replace("-", "_")
        if key not in result or index + 1 >= len(argv):
            raise RuntimeError(f"invalid benchmark argument: {argv[index]}")
        result[key] = argv[index + 1]
        index += 2
    if result["output"] is None or result["semantic_entry_plate"] is None:
        raise RuntimeError("--output and --semantic-entry-plate are required")
    result["samples"] = int(result["samples"])
    if result["samples"] != 192:
        raise RuntimeError("Phase 4-R1 benchmark stills are fixed at 192 Cycles samples")
    return result


def configure_family(family: str) -> None:
    scene = bpy.context.scene
    scene.camera = bpy.data.objects[cfg.CAMERA_SPECS[family]["camera"]]
    for candidate, spec in cfg.CABLE_SPECS.items():
        bpy.data.collections[spec["collection"]].hide_render = candidate != family
    for obj in bpy.data.collections["PHASE4R1_CABLE_LOCAL_RESPONSE_LIGHTS"].objects:
        obj.hide_render = obj.get("phase4r1_family") != family
    if family == "mobile":
        scene.render.resolution_x, scene.render.resolution_y = 780, 1688
    else:
        scene.render.resolution_x, scene.render.resolution_y = 1600, 1000


def configure_cycles_device(scene: bpy.types.Scene) -> dict[str, Any]:
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
                return {"backend": backend, "scene_device": "GPU", "devices": [{"name": device.name, "type": device.type, "use": bool(device.use)} for device in preferences.devices], "attempts": attempts}
        except Exception as error:
            attempts.append({"backend": backend, "error": str(error)})
    scene.cycles.device = "CPU"
    preferences.get_devices()
    for device in preferences.devices:
        device.use = device.type == "CPU"
    return {"backend": "CPU", "scene_device": "CPU", "devices": [{"name": device.name, "type": device.type, "use": bool(device.use)} for device in preferences.devices], "attempts": attempts}


def main() -> None:
    args = parse_args()
    opened = Path(bpy.data.filepath).resolve()
    build = json.loads(cfg.BUILD_REPORT.read_text(encoding="utf-8"))
    validation = json.loads(cfg.VALIDATION_REPORT.read_text(encoding="utf-8"))
    producer_authority = authority_record(Path(__file__).resolve())
    if validation.get("producer_authorities", {}).get("cycles_benchmarks_renderer") != producer_authority:
        raise RuntimeError("Cycles benchmark producer authority is not bound by current source validation")
    if validation.get("source_build_sha256") != sha256(cfg.BUILD_REPORT):
        raise RuntimeError("Cycles benchmark source validation is stale against current source build")
    if opened != cfg.DERIVATIVE_SOURCE.resolve() or sha256(opened) != build["phase4r1_derivative"]["sha256"]:
        raise RuntimeError("benchmark renderer must open the authenticated R1 derivative")
    output = Path(str(args["output"])).resolve()
    repository = cfg.REPOSITORY_ROOT.resolve()
    if output == repository or repository in output.parents:
        raise RuntimeError("Cycles benchmarks must remain external to the repository")
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise RuntimeError("Cycles benchmark output must be a new empty directory so the authenticated root contains exactly 16 files")
    semantic_source = Path(str(args["semantic_entry_plate"])).resolve()
    if not semantic_source.is_file():
        raise RuntimeError("authenticated semantic ENTRY plate is missing")
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    compute_device = configure_cycles_device(scene)
    scene.cycles.samples = args["samples"]
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
    scene.cycles.use_adaptive_sampling = True
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 30
    scene.render.film_transparent = False
    scene.render.use_motion_blur = False
    scene.view_settings.exposure = 0.0
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    bpy.data.materials["Phase4R1_EnergizedInnerConductor"].node_tree.nodes["Phase4R1 Current Strength Multiplier"].inputs[1].default_value = cfg.CURRENT["front_strength_cycles"]
    stills = []
    for benchmark_id, family, frame in BENCHMARKS:
        configure_family(family)
        scene.frame_set(frame)
        target = output / f"phase4r1-cycles-{benchmark_id}.png"
        scene.render.filepath = str(target)
        started = time.perf_counter()
        bpy.ops.render.render(write_still=True)
        elapsed = round(time.perf_counter() - started, 6)
        image_record = {"frame": frame, "path": target.name, "bytes": target.stat().st_size, "sha256": sha256(target), "render_seconds": elapsed}
        render_record = {
            "schema": "quantum-hub.phase-4-r1-proving-hall.render-report.v1",
            "status": "PASS",
            "evidence_class": "FRESH_BLENDER_CYCLES_BENCHMARK",
            "production_rendering": False,
            "full_production_rendering": False,
            "runtime_integration": False,
            "phase5_authorized": False,
            "engine": "CYCLES",
            "requested_engine": "cycles",
            "source": build["phase4r1_derivative"],
            "source_build_sha256": sha256(cfg.BUILD_REPORT),
            "producer_authority": producer_authority,
            "id": benchmark_id,
            "family": family,
            "variant": family,
            "frame": frame,
            "frame_start": frame,
            "frame_end": frame,
            "frame_count": 1,
            "fps": 30,
            "resolution": [scene.render.resolution_x, scene.render.resolution_y],
            "settings": {"engine": "CYCLES", "samples": scene.cycles.samples, "adaptive_sampling": True, "denoiser": "OPENIMAGEDENOISE", "view_transform": "AgX", "look": "AgX - Medium High Contrast", "compute_device": compute_device},
            "frames": [image_record],
        }
        render_report_path = output / f"phase4r1-cycles-{benchmark_id}-render-report.json"
        render_report_path.write_text(json.dumps(render_record, indent=2) + "\n", encoding="utf-8")
        stills.append(
            {
                "id": benchmark_id, "category": "cycles-benchmark", "status": "PASS", "renderer": "CYCLES",
                "family": family, "frame": frame, "width": scene.render.resolution_x, "height": scene.render.resolution_y,
                "path": target.name, "bytes": target.stat().st_size, "sha256": sha256(target),
                "render_seconds": elapsed,
                "settings": render_record["settings"],
                "render_report": {"path": render_report_path.name, "bytes": render_report_path.stat().st_size, "sha256": sha256(render_report_path)},
            }
        )
        print(f"QH_PHASE4R1_CYCLES_BENCHMARK={benchmark_id}")
    semantic_target = output / "phase4r1-landscape-entry-regression.png"
    shutil.copy2(semantic_source, semantic_target)
    stills.append(
        {
            "id": "landscape-entry-regression", "category": "semantic-regression", "status": "PASS",
            "renderer": "BROWSER_SEMANTIC", "family": "landscape", "frame": None,
            "width": 844, "height": 390, "path": semantic_target.name, "bytes": semantic_target.stat().st_size,
            "sha256": sha256(semantic_target), "source_path": semantic_source.name, "source_sha256": sha256(semantic_source),
        }
    )
    manifest = {
        "schema": "quantum-hub.phase-4-r1-proving-hall.cycles-benchmarks.v1",
        "status": "PASS",
        "production_rendering": False,
        "full_production_rendering": False,
        "source": build["phase4r1_derivative"],
        "source_build_sha256": sha256(cfg.BUILD_REPORT),
        "producer_authority": producer_authority,
        "settings": {"engine": "CYCLES", "samples": scene.cycles.samples, "adaptive_sampling": True, "denoiser": "OPENIMAGEDENOISE", "view_transform": "AgX", "look": "AgX - Medium High Contrast", "compute_device": compute_device},
        "still_count": len(stills),
        "stills": stills,
    }
    manifest_path = output / "phase4r1-cycles-benchmarks-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"QH_PHASE4R1_CYCLES_BENCHMARKS_MANIFEST={manifest_path}")


if __name__ == "__main__":
    main()
