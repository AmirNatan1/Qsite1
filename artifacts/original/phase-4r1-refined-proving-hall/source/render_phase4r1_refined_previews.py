"""Render fresh external F001-F500 refined Eevee physical frame roots.

This producer never creates the semantic/black F501-F540 assembly and never
uses recovered R1 visual bytes.  The v2 packager owns forward/reverse encoding
and the exact threshold -> black -> semantic ENTRY aggregate gates.
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


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def repo_record(path: Path) -> dict[str, Any]:
    return {"path": path.resolve().relative_to(cfg.REPOSITORY_ROOT.resolve()).as_posix(), "bytes": path.stat().st_size, "sha256": sha256(path)}


def parse_args() -> dict[str, Any]:
    values: dict[str, Any] = {"family": None, "output": None, "frames": "1-500"}
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    index = 0
    while index < len(argv):
        token = argv[index]
        if not token.startswith("--") or index + 1 >= len(argv):
            raise RuntimeError(f"invalid preview argument: {token}")
        key = token[2:].replace("-", "_")
        if key not in values:
            raise RuntimeError(f"unknown preview argument: {token}")
        values[key] = argv[index + 1]
        index += 2
    if values["family"] not in cfg.CABLE_FAMILIES:
        raise RuntimeError("--family must be desktop, mobile, or landscape")
    if values["output"] is None:
        raise RuntimeError("--output is required")
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
    if not frames or any(frame < 1 or frame > 500 for frame in frames):
        raise RuntimeError("refined physical preview frames must stay within F001-F500")
    return frames


def external_empty_root(value: str) -> Path:
    output = Path(value).resolve()
    repository = cfg.REPOSITORY_ROOT.resolve()
    if output == repository or repository in output.parents:
        raise RuntimeError("refined preview frames must remain external to Git")
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise RuntimeError("refined preview output must be a new empty root; old visual evidence may not be reused")
    return output


def verify_source() -> tuple[dict[str, Any], dict[str, Any]]:
    opened = Path(bpy.data.filepath).resolve()
    if opened != cfg.DERIVATIVE_SOURCE.resolve():
        raise RuntimeError("preview producer requires the exact refined derivative open")
    build = json.loads(cfg.BUILD_REPORT.read_text(encoding="utf-8"))
    validation = json.loads(cfg.VALIDATION_REPORT.read_text(encoding="utf-8"))
    if build.get("status") != "PASS" or validation.get("status") != "PASS":
        raise RuntimeError("refined source build and validation must PASS before preview rendering")
    actual = repo_record(opened)
    if actual != build["sourceAuthorities"]["refinedDerivative"] or actual != validation["sourceAuthorities"]["derivative"]:
        raise RuntimeError("refined derivative hash/size binding is stale")
    producer = repo_record(Path(__file__).resolve())
    if build["producerAuthorities"].get("preview-renderer") != producer or validation["producerAuthorities"].get("preview-renderer") != producer:
        raise RuntimeError("preview producer is not exact-hash-bound by build and validation")
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
        raise RuntimeError("preview global hall visual authority is absent or stale")
    return build, validation


def configure_family(family: str) -> None:
    scene = bpy.context.scene
    scene.camera = bpy.data.objects[cfg.CAMERAS[family]]
    for candidate, spec in cfg.CABLE_FAMILIES.items():
        bpy.data.collections[spec["collection"]].hide_render = candidate != family


def main() -> None:
    args = parse_args()
    build, validation = verify_source()
    output = external_empty_root(str(args["output"]))
    family = str(args["family"])
    frames = parse_frames(str(args["frames"]))
    complete = frames == list(range(1, 501))
    width, height = cfg.PREVIEW_RESOLUTIONS[family]
    configure_family(family)
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
    scene.view_settings.view_transform = cfg.HALL_VISUAL_AUTHORITY["viewTransform"]
    scene.view_settings.look = cfg.HALL_VISUAL_AUTHORITY["look"]
    scene.view_settings.exposure = float(cfg.HALL_VISUAL_AUTHORITY["exposureStops"])
    files = []
    for order, frame in enumerate(frames, 1):
        scene.frame_set(frame)
        target = output / f"F{frame:03d}.png"
        scene.render.filepath = str(target)
        started = time.perf_counter()
        bpy.ops.render.render(write_still=True)
        files.append({"role": "physical-frame", "path": target.name, "bytes": target.stat().st_size, "sha256": sha256(target), "width": width, "height": height, "mediaType": "image/png", "family": family, "frame": frame, "renderSeconds": round(time.perf_counter() - started, 6)})
        print(f"QH_PHASE4R1_REFINED_PREVIEW={family}:F{frame:03d} ORDER={order}/{len(frames)}")
    source_authorities = {
        "derivative": repo_record(cfg.DERIVATIVE_SOURCE),
        "sourceBuild": repo_record(cfg.BUILD_REPORT),
        "sourceValidation": repo_record(cfg.VALIDATION_REPORT),
        "assetLedger": repo_record(cfg.ASSET_LEDGER),
        "exactQProvenance": repo_record(cfg.Q_PROVENANCE_REPORT),
    }
    report = {
        "schema": f"quantum-hub.phase-4-r1.refined-proving-hall.{family}-physical-frames.v2",
        "status": "PASS" if complete else "PARTIAL",
        "generatedAt": cfg.GENERATED_AT,
        "family": family,
        "timeline": {"fps": 30, "frameStart": 1, "frameEnd": 500, "physicalOnly": True},
        "expectedFrameCount": 500,
        "renderedFrameCount": len(files),
        "sourceAuthorities": source_authorities,
        "producerAuthorities": build["producerAuthorities"],
        "renderSettings": {"engine": "BLENDER_EEVEE", "resolution": [width, height], "resolutionPercentage": 100, "pixelAspect": [1.0, 1.0], "viewTransform": scene.view_settings.view_transform, "look": scene.view_settings.look, "exposureStops": float(scene.view_settings.exposure), "globalVisualAuthority": cfg.HALL_VISUAL_AUTHORITY},
        "files": files,
        "reusedRecoveredOldVisualEvidence": False,
        **cfg.AUTHORIZATION,
        "authorization": cfg.AUTHORIZATION,
    }
    manifest = output / f"phase4r1-refined-{family}-physical-frame-manifest.json"
    manifest.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"QH_PHASE4R1_REFINED_PREVIEW_MANIFEST={manifest}")


if __name__ == "__main__":
    main()
