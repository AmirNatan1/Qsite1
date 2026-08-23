"""Render deterministic Phase 4-R1 physical preproduction frames.

All output must be external to the repository.  Eevee supports the three full
F1-F500 blockout families.  Cycles is intentionally restricted to benchmark
stills or the two authorized 90-frame motion ranges; the full Cycles film is
rejected by this renderer.
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
import phase4r1_config as cfg


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def authority_record(path: Path) -> dict[str, Any]:
    return {"path": path.resolve().relative_to(cfg.REPOSITORY_ROOT.resolve()).as_posix(), "bytes": path.stat().st_size, "sha256": sha256(path)}


def parse_args() -> dict[str, Any]:
    values: dict[str, Any] = {
        "variant": "desktop",
        "frames": "1,46,106,165,225,285,356,405,460,480,500",
        "output": None,
        "engine": "eevee",
        "percentage": 100,
        "samples": None,
        "sample_id": None,
    }
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    index = 0
    while index < len(argv):
        token = argv[index]
        if not token.startswith("--") or index + 1 >= len(argv):
            raise RuntimeError(f"invalid renderer argument: {token}")
        key = token[2:].replace("-", "_")
        if key not in values:
            raise RuntimeError(f"unknown renderer argument: {token}")
        values[key] = argv[index + 1]
        index += 2
    if values["variant"] not in cfg.CAMERA_SPECS:
        raise RuntimeError("--variant must be desktop, mobile or landscape")
    if values["engine"] not in {"eevee", "cycles"}:
        raise RuntimeError("--engine must be eevee or cycles")
    if values["output"] is None:
        raise RuntimeError("--output is required")
    values["percentage"] = int(values["percentage"])
    values["samples"] = None if values["samples"] is None else int(values["samples"])
    return values


def parse_frames(value: str) -> list[int]:
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
    invalid = [frame for frame in frames if not 1 <= frame <= 500]
    if invalid or not frames:
        raise RuntimeError(f"physical render frames must be in F1-F500: {invalid}")
    return frames


def configure_variant(variant: str) -> None:
    scene = bpy.context.scene
    scene.camera = bpy.data.objects[cfg.CAMERA_SPECS[variant]["camera"]]
    for family, spec in cfg.CABLE_SPECS.items():
        bpy.data.collections[spec["collection"]].hide_render = family != variant
    lights = bpy.data.collections["PHASE4R1_CABLE_LOCAL_RESPONSE_LIGHTS"]
    for obj in lights.objects:
        obj.hide_render = obj.get("phase4r1_family") != variant


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


def configure_render(args: dict[str, Any], frame_count: int) -> tuple[int, int]:
    scene = bpy.context.scene
    width, height = cfg.CAMERA_SPECS[args["variant"]]["resolution"]
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = args["percentage"]
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 35
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.render.fps = 30
    scene.view_settings.exposure = 0.0
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    if args["engine"] == "eevee":
        scene.render.engine = "BLENDER_EEVEE"
        scene.render.use_motion_blur = False
    else:
        # The only authorized multi-frame Cycles renders are the exact 90-frame
        # current and Q/threshold samples.  Individual benchmark stills are
        # also permitted.  A full physical or production film is not.
        allowed_ranges = {tuple(range(46, 136)), tuple(range(391, 481))}
        requested = tuple(parse_frames(str(args["frames"])))
        if frame_count > 1 and requested not in allowed_ranges:
            raise RuntimeError("Cycles motion is restricted to F46-F135 or F391-F480; full production rendering is unauthorized")
        if frame_count > 1 and args["samples"] not in {None, 96}:
            raise RuntimeError("authorized Cycles motion samples are fixed at 96 samples")
        scene.render.engine = "CYCLES"
        args["compute_device"] = configure_cycles_device(scene)
        scene.cycles.samples = 96 if frame_count > 1 else (args["samples"] or 192)
        scene.cycles.use_denoising = True
        scene.cycles.denoiser = "OPENIMAGEDENOISE"
        scene.cycles.use_adaptive_sampling = True
        scene.render.use_motion_blur = frame_count > 1
        current = bpy.data.materials["Phase4R1_EnergizedInnerConductor"]
        current.node_tree.nodes["Phase4R1 Current Strength Multiplier"].inputs[1].default_value = cfg.CURRENT["front_strength_cycles"]
    return int(width * args["percentage"] / 100), int(height * args["percentage"] / 100)


def telemetry(frame: int, variant: str) -> dict[str, Any]:
    scene = bpy.context.scene
    scene.frame_set(frame)
    camera = scene.camera
    rig = bpy.data.objects[cfg.CAMERA_SPECS[variant]["rig"]]
    world = camera.matrix_world.translation
    dx = world.x - cfg.ORBIT_TARGET[0]
    dy = world.y - cfg.ORBIT_TARGET[1]
    radius = math.hypot(dx, dy)
    elevation = world.z - cfg.ORBIT_TARGET[2]
    constraint = camera.constraints.get("Phase4R1_AuditableLookAtAcceptedCRT")
    if constraint is None or constraint.target is None:
        raise RuntimeError(f"{variant} authored look-at target is missing")
    aim = constraint.target.matrix_world.translation
    delta = aim - world
    downward = math.degrees(math.atan2(max(0.0, -delta.z), max(1e-9, math.hypot(delta.x, delta.y))))
    return {
        "frame": frame,
        "normalized_film": round(cfg.normalized(frame), 8),
        "camera_world": [round(float(value), 8) for value in world],
        "angle_degrees": round(math.degrees(rig.rotation_euler.z), 8),
        "horizontal_radius": round(radius, 8),
        "elevation": round(elevation, 8),
        "downward_view_angle_degrees": round(downward, 8),
        "camera_to_target_distance": round(delta.length, 8),
        "focal_length_mm": round(float(camera.data.lens), 8),
    }


def main() -> None:
    args = parse_args()
    opened = Path(bpy.data.filepath).resolve()
    if opened != cfg.DERIVATIVE_SOURCE.resolve():
        raise RuntimeError("renderer must open the exact Phase 4-R1 derivative")
    build = json.loads(cfg.BUILD_REPORT.read_text(encoding="utf-8"))
    validation = json.loads(cfg.VALIDATION_REPORT.read_text(encoding="utf-8"))
    producer_authority = authority_record(Path(__file__).resolve())
    if validation.get("producer_authorities", {}).get("preproduction_renderer") != producer_authority:
        raise RuntimeError("preproduction renderer producer authority is not bound by current source validation")
    if validation.get("source_build_sha256") != sha256(cfg.BUILD_REPORT):
        raise RuntimeError("preproduction renderer source validation is stale against current source build")
    if sha256(opened) != build["phase4r1_derivative"]["sha256"]:
        raise RuntimeError("Phase 4-R1 derivative hash does not match source-build authority")
    frames = parse_frames(str(args["frames"]))
    output = Path(str(args["output"])).resolve()
    repository = cfg.REPOSITORY_ROOT.resolve()
    if output == repository or repository in output.parents:
        raise RuntimeError("raw Phase 4-R1 frames must remain outside the repository")
    output.mkdir(parents=True, exist_ok=True)
    configure_variant(str(args["variant"]))
    width, height = configure_render(args, len(frames))
    records = []
    for order, frame in enumerate(frames, 1):
        started = time.perf_counter()
        data = telemetry(frame, str(args["variant"]))
        target = output / f"phase4r1-{args['variant']}-{frame:04d}.png"
        bpy.context.scene.render.filepath = str(target)
        bpy.ops.render.render(write_still=True)
        data.update({"path": target.name, "bytes": target.stat().st_size, "sha256": sha256(target), "render_seconds": round(time.perf_counter() - started, 6)})
        records.append(data)
        print(f"QH_PHASE4R1_FRAME={frame} VARIANT={args['variant']} ORDER={order}/{len(frames)}")
    evidence_class = "FRESH_BLENDER_EEVEE_PREVISUALIZATION" if args["engine"] == "eevee" else "FRESH_BLENDER_CYCLES_PREPRODUCTION"
    report = {
        "schema": "quantum-hub.phase-4-r1-proving-hall.render-report.v1",
        "status": "PASS",
        "evidence_class": evidence_class,
        "production_rendering": False,
        "full_production_rendering": False,
        "runtime_integration": False,
        "phase5_authorized": False,
        "source": build["phase4r1_derivative"],
        "source_build_sha256": sha256(cfg.BUILD_REPORT),
        "producer_authority": producer_authority,
        "variant": args["variant"],
        "family": args["variant"],
        "engine": bpy.context.scene.render.engine,
        "requested_engine": args["engine"],
        "resolution": [width, height],
        "fps": 30,
        "sample_id": args["sample_id"],
        "frame_start": frames[0],
        "frame_end": frames[-1],
        "frame_count": len(frames),
        "frames": records,
        "settings": {
            "engine": "CYCLES" if args["engine"] == "cycles" else "BLENDER_EEVEE",
            "samples": bpy.context.scene.cycles.samples if args["engine"] == "cycles" else None,
            "adaptive_sampling": bool(bpy.context.scene.cycles.use_adaptive_sampling) if args["engine"] == "cycles" else None,
            "denoiser": bpy.context.scene.cycles.denoiser if args["engine"] == "cycles" else None,
            "view_transform": bpy.context.scene.view_settings.view_transform,
            "look": bpy.context.scene.view_settings.look,
            "compute_device": args.get("compute_device"),
        },
    }
    if args["sample_id"]:
        report_path = output / f"phase4r1-motion-{args['sample_id']}-manifest.json"
    else:
        report_path = output / f"phase4r1-{args['variant']}-render-report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    if args["engine"] == "cycles" and args["sample_id"]:
        required_samples = {"current-proving-hall": [46, 135], "q-threshold": [391, 480]}
        manifests = {sample_id: output / f"phase4r1-motion-{sample_id}-manifest.json" for sample_id in required_samples}
        if all(path.exists() for path in manifests.values()):
            sample_records = []
            for sample_id, expected in required_samples.items():
                path = manifests[sample_id]
                sample = json.loads(path.read_text(encoding="utf-8"))
                if [sample["frame_start"], sample["frame_end"]] != expected or sample["frame_count"] != 90 or len(sample["frames"]) != 90:
                    raise RuntimeError(f"Cycles motion sample contract mismatch: {sample_id}")
                if (
                    sample.get("status") != "PASS"
                    or sample.get("source", {}).get("sha256") != report["source"]["sha256"]
                    or sample.get("source_build_sha256") != report["source_build_sha256"]
                    or sample.get("producer_authority") != producer_authority
                    or sample.get("requested_engine") != "cycles"
                    or sample.get("settings", {}).get("engine") != "CYCLES"
                    or sample.get("settings", {}).get("samples") != 96
                    or sample.get("settings", {}).get("denoiser") != "OPENIMAGEDENOISE"
                    or sample.get("settings", {}).get("view_transform") != "AgX"
                ):
                    raise RuntimeError(f"Cycles motion sample authority/settings mismatch: {sample_id}")
                paths = [frame["path"] for frame in sample["frames"]]
                hashes = [frame["sha256"] for frame in sample["frames"]]
                if len(set(paths)) != 90 or len(set(hashes)) < 70:
                    raise RuntimeError(f"Cycles motion sample lacks 90 unique paths or 70 meaningfully distinct frames: {sample_id}")
                sequence_digest = hashlib.sha256()
                for frame in sample["frames"]:
                    sequence_digest.update(f"{int(frame['frame']):06d}".encode("utf-8"))
                    sequence_digest.update(b"\0")
                    sequence_digest.update(str(frame["sha256"]).lower().encode("utf-8"))
                    sequence_digest.update(b"\0")
                settings = {"engine": "CYCLES", "samples": 96, "adaptive_sampling": True, "denoiser": "OPENIMAGEDENOISE", "view_transform": "AgX", "look": "AgX - Medium High Contrast", "compute_device": sample.get("settings", {}).get("compute_device")}
                sample_records.append(
                    {
                        "id": sample_id,
                        "status": "PASS",
                        "family": "desktop",
                        "renderer": "CYCLES",
                        "frame_start": expected[0],
                        "frame_end": expected[1],
                        "frameStart": expected[0],
                        "frameEnd": expected[1],
                        "frame_count": 90,
                        "fps": 30,
                        "duration_seconds": 3.0,
                        "settings": settings,
                        "render_report": {"path": path.name, "bytes": path.stat().st_size, "sha256": sha256(path)},
                        "sequenceSha256": sequence_digest.hexdigest(),
                        "sequence_sha256": sequence_digest.hexdigest(),
                        "frames": sample["frames"],
                    }
                )
            aggregate = {
                "schema": "quantum-hub.phase-4-r1-proving-hall.cycles-motion.v1",
                "status": "PASS",
                "production_rendering": False,
                "full_production_rendering": False,
                "source": report["source"],
                "source_build_sha256": report["source_build_sha256"],
                "producer_authority": producer_authority,
                "settings": {
                    "engine": "CYCLES",
                    "samples": 96,
                    "adaptive_sampling": True,
                    "denoiser": "OPENIMAGEDENOISE",
                    "view_transform": "AgX",
                    "look": "AgX - Medium High Contrast",
                    "fps": 30,
                    "compute_device": report["settings"].get("compute_device"),
                },
                "sample_count": 2,
                "samples": sample_records,
            }
            aggregate_path = output / "phase4r1-cycles-motion-manifest.json"
            aggregate_path.write_text(json.dumps(aggregate, indent=2) + "\n", encoding="utf-8")
            print(f"QH_PHASE4R1_CYCLES_MOTION_MANIFEST={aggregate_path}")
    print(f"QH_PHASE4R1_RENDER_REPORT={report_path}")


if __name__ == "__main__":
    main()
