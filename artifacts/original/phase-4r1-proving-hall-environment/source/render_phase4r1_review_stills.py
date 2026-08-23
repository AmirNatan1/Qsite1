"""Render the authenticated 24-role Phase 4-R1 review-still set externally."""

from __future__ import annotations

import hashlib
import json
import sys
import time
from pathlib import Path
from typing import Any

import bpy
from mathutils import Vector

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
    result: dict[str, Any] = {"output": None, "engine": "eevee", "percentage": 100, "samples": 64, "roles": "all"}
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    index = 0
    while index < len(argv):
        key = argv[index][2:].replace("-", "_")
        if key not in result or index + 1 >= len(argv):
            raise RuntimeError(f"invalid argument: {argv[index]}")
        result[key] = argv[index + 1]
        index += 2
    if result["output"] is None:
        raise RuntimeError("--output is required")
    if result["engine"] not in {"eevee", "cycles"}:
        raise RuntimeError("--engine must be eevee or cycles")
    result["percentage"] = int(result["percentage"])
    result["samples"] = int(result["samples"])
    return result


ROLE_SPECS: dict[str, dict[str, Any]] = {
    # Bounded three-quarter cameras sit between structural bays and below the
    # roof lattice.  They reveal the modeled hall instead of hiding columns.
    "environment/front": {"frame": 1, "location": (4.2, -10.7, 4.25), "target": (0.2, 1.8, 2.10), "lens": 25.0},
    "environment/left": {"frame": 165, "location": (-11.8, -6.8, 3.75), "target": (1.2, 1.5, 1.75), "lens": 24.0},
    "environment/rear": {"frame": 225, "location": (4.8, 9.0, 3.65), "target": (0.0, -1.5, 1.45), "lens": 24.0},
    "environment/right": {"frame": 106, "location": (11.0, -6.7, 3.75), "target": (0.0, 1.5, 1.70), "lens": 24.0},
    "environment/overhead": {"frame": 1, "location": (-4.8, -5.0, 7.35), "target": (0.5, 1.0, 0.55), "lens": 27.0},
    "environment/camera-opening": {"frame": 1, "family_camera": "desktop"},
    "environment/crt-level": {"frame": 285, "location": (0.65, -5.35, 1.58), "target": cfg.ORBIT_TARGET, "lens": 40.0},
    "environment/power-source-closeup": {"frame": 46, "location": (-2.6, -4.25, 2.55), "target": (-0.10, -1.80, 1.55), "lens": 44.0},
    "cable-source/infrastructure-conduit": {"frame": 1, "location": (2.80, -10.80, 5.30), "target": (-5.60, -1.61, 4.05), "lens": 18.0},
    "cable-source/distribution-enclosure": {"frame": 1, "location": (-2.55, -4.05, 2.20), "target": (-0.15, -1.65, 1.20), "lens": 52.0},
    "cable-source/socket": {"frame": 46, "location": (1.55, -3.15, 1.50), "target": (0.22, -2.04, 0.95), "lens": 62.0},
    "cable-source/plug": {"frame": 46, "location": (-1.25, -3.45, 1.35), "target": (0.22, -2.19, 0.95), "lens": 64.0},
    "cable-source/strain-relief": {"frame": 46, "location": (1.10, -3.45, 1.13), "target": (0.22, -2.48, 0.95), "lens": 68.0},
    "cable-source/floor-transition": {"frame": 56, "location": (-1.60, -5.20, 0.95), "target": cfg.HALL["floor_transition_world_m"], "lens": 54.0},
    "cable-source/full-route": {"frame": 165, "location": (5.8, -10.5, 7.1), "target": (0.35, -0.25, 0.35), "lens": 28.0},
    "cable-source/rear-crt-connection": {"frame": 292, "location": (3.00, 0.94, 0.72), "target": (0.65, 0.98, 0.34), "lens": 62.0},
    "material/concrete-floor": {"frame": 1, "location": (-9.8, -7.0, 1.18), "target": (-12.2, -5.0, 0.01), "lens": 50.0},
    "material/structural-steel": {"frame": 1, "location": (10.00, -5.50, 2.15), "target": (7.00, -9.50, 0.90), "lens": 35.0},
    "material/power-cabinet": {"frame": 1, "location": (-2.45, -3.95, 2.08), "target": (-0.15, -1.65, 1.18), "lens": 54.0},
    "material/plug": {"frame": 46, "location": (-1.10, -3.35, 1.38), "target": (0.22, -2.20, 0.95), "lens": 66.0},
    "material/cable-sheath": {"frame": 1, "location": (2.2, -4.55, 0.58), "target": (0.65, -5.42, 0.03), "lens": 68.0},
    "material/energized-cable": {"frame": 165, "target_object": "Phase4R1_Desktop_Current_079", "offset": (-1.80, -2.20, 0.92), "lens": 62.0},
    "material/test-fixture": {"frame": 165, "location": (11.20, -2.80, 2.30), "target": (7.40, -5.90, 0.70), "lens": 28.0},
    "material/crt-environment-interaction": {"frame": 370, "location": (0.65, -4.0, 1.25), "target": cfg.ORBIT_TARGET, "lens": 55.0},
}


def configure_desktop_family() -> None:
    for family, spec in cfg.CABLE_SPECS.items():
        bpy.data.collections[spec["collection"]].hide_render = family != "desktop"
    for obj in bpy.data.collections["PHASE4R1_CABLE_LOCAL_RESPONSE_LIGHTS"].objects:
        obj.hide_render = obj.get("phase4r1_family") != "desktop"


def create_review_camera() -> bpy.types.Object:
    data = bpy.data.cameras.new("Phase4R1_ReviewStillCamera_Data")
    data.sensor_width = 36.0
    data.clip_start = 0.01
    data.clip_end = 1000.0
    camera = bpy.data.objects.new("Phase4R1_ReviewStillCamera", data)
    bpy.context.scene.collection.objects.link(camera)
    return camera


def place_camera(camera: bpy.types.Object, location: tuple[float, float, float], target: tuple[float, float, float], lens: float) -> None:
    camera.location = location
    camera.data.lens = lens
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def object_world_center(name: str) -> Vector:
    obj = bpy.data.objects.get(name)
    if obj is None:
        raise RuntimeError(f"review target object is missing: {name}")
    return sum((obj.matrix_world @ Vector(corner) for corner in obj.bound_box), Vector((0.0, 0.0, 0.0))) / 8.0


def main() -> None:
    args = parse_args()
    opened = Path(bpy.data.filepath).resolve()
    if opened != cfg.DERIVATIVE_SOURCE.resolve():
        raise RuntimeError("review-still renderer must open the exact R1 derivative")
    build = json.loads(cfg.BUILD_REPORT.read_text(encoding="utf-8"))
    validation = json.loads(cfg.VALIDATION_REPORT.read_text(encoding="utf-8"))
    producer_authority = authority_record(Path(__file__).resolve())
    if validation.get("producer_authorities", {}).get("review_stills_renderer") != producer_authority:
        raise RuntimeError("review-stills producer authority is not bound by current source validation")
    if validation.get("source_build_sha256") != sha256(cfg.BUILD_REPORT):
        raise RuntimeError("review-stills source validation is stale against current source build")
    if sha256(opened) != build["phase4r1_derivative"]["sha256"]:
        raise RuntimeError("R1 derivative hash mismatch")
    output = Path(str(args["output"])).resolve()
    repository = cfg.REPOSITORY_ROOT.resolve()
    if output == repository or repository in output.parents:
        raise RuntimeError("review stills must remain external to the repository")
    output.mkdir(parents=True, exist_ok=True)
    requested = list(ROLE_SPECS) if args["roles"] == "all" else [item.strip() for item in str(args["roles"]).split(",") if item.strip()]
    unknown = [role for role in requested if role not in ROLE_SPECS]
    if unknown:
        raise RuntimeError(f"unknown review-still roles: {unknown}")
    if args["roles"] == "all" and any(output.iterdir()):
        raise RuntimeError("complete review-still output must be a new empty directory so its authenticated root contains exactly one manifest and 24 PNGs")
    configure_desktop_family()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE" if args["engine"] == "eevee" else "CYCLES"
    scene.render.resolution_x = 960
    scene.render.resolution_y = 600
    scene.render.resolution_percentage = args["percentage"]
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 35
    scene.render.film_transparent = False
    scene.render.use_motion_blur = False
    scene.view_settings.exposure = 0.0
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    if args["engine"] == "cycles":
        scene.cycles.samples = args["samples"]
        scene.cycles.use_denoising = True
        scene.cycles.use_adaptive_sampling = True
        bpy.data.materials["Phase4R1_EnergizedInnerConductor"].node_tree.nodes["Phase4R1 Current Strength Multiplier"].inputs[1].default_value = cfg.CURRENT["front_strength_cycles"]
    camera = create_review_camera()
    records = []
    for order, role in enumerate(requested, 1):
        spec = ROLE_SPECS[role]
        scene.frame_set(spec["frame"])
        if "family_camera" in spec:
            scene.camera = bpy.data.objects[cfg.CAMERA_SPECS[spec["family_camera"]]["camera"]]
        else:
            if "target_object" in spec:
                target_world = object_world_center(spec["target_object"])
                location = target_world + Vector(spec["offset"])
                place_camera(camera, tuple(location), tuple(target_world), spec["lens"])
            else:
                place_camera(camera, spec["location"], spec["target"], spec["lens"])
            scene.camera = camera
        category, role_id = role.split("/", 1)
        target = output / f"phase4r1-review-{category}-{role_id}.png"
        scene.render.filepath = str(target)
        started = time.perf_counter()
        bpy.ops.render.render(write_still=True)
        records.append(
            {
                "id": role_id,
                "category": category,
                "status": "PASS",
                "renderer": scene.render.engine,
                "width": int(960 * args["percentage"] / 100),
                "height": int(600 * args["percentage"] / 100),
                "role": role_id,
                "role_id": role,
                "frame": spec["frame"],
                "path": target.name,
                "bytes": target.stat().st_size,
                "sha256": sha256(target),
                "render_seconds": round(time.perf_counter() - started, 6),
                "camera": scene.camera.name,
                "camera_world": [round(float(v), 6) for v in scene.camera.matrix_world.translation],
                "focal_length_mm": round(float(scene.camera.data.lens), 6),
            }
        )
        print(f"QH_PHASE4R1_REVIEW_ROLE={role} ORDER={order}/{len(requested)}")
    manifest = {
        "schema": "quantum-hub.phase-4-r1-proving-hall.review-stills.v1",
        "status": "PASS",
        "evidence_class": "FRESH_BLENDER_EEVEE_REVIEW_STILLS" if args["engine"] == "eevee" else "FRESH_BLENDER_CYCLES_REVIEW_STILLS",
        "production_rendering": False,
        "full_production_rendering": False,
        "source": build["phase4r1_derivative"],
        "source_build_sha256": sha256(cfg.BUILD_REPORT),
        "producer_authority": producer_authority,
        "engine": scene.render.engine,
        "resolution": [int(960 * args["percentage"] / 100), int(600 * args["percentage"] / 100)],
        "role_count": len(records),
        "stills": records,
    }
    manifest_path = output / "phase4r1-review-stills-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"QH_PHASE4R1_REVIEW_STILLS_MANIFEST={manifest_path}")


if __name__ == "__main__":
    main()
