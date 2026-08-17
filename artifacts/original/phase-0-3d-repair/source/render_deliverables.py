"""Render named Phase 0 review evidence from quantum-field-unit.blend.

Example low-cost diagnostic:

    blender --background source/quantum-field-unit.blend --python source/render_deliverables.py -- \
      --group diagnostics --samples 24 --scale 0.5
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import bpy

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import scene_config as cfg


def cli_args() -> argparse.Namespace:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--group",
        choices=("diagnostics", "portal-diagnostics", "qa-repair", "cable-study", "design", "materials", "desktop", "activation", "portal", "mobile", "reduced", "animatic", "all"),
        default="diagnostics",
    )
    parser.add_argument("--engine", choices=("eevee", "cycles"), default="eevee")
    parser.add_argument("--samples", type=int, default=48)
    parser.add_argument("--scale", type=float, default=1.0)
    parser.add_argument("--frame-step", type=int, default=1)
    return parser.parse_args(args)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def configure_engine(scene: bpy.types.Scene, engine: str, samples: int) -> None:
    if engine == "cycles":
        scene.render.engine = "CYCLES"
        scene.cycles.samples = samples
        scene.cycles.use_denoising = True
    else:
        scene.render.engine = "BLENDER_EEVEE"
        scene.eevee.taa_render_samples = samples
        scene.eevee.volumetric_samples = max(8, min(48, samples))
        scene.eevee.volumetric_shadow_samples = max(4, min(16, samples // 3))


def set_collection_visible(name: str, visible: bool) -> None:
    collection = bpy.data.collections.get(name)
    if collection is None:
        raise RuntimeError(f"Required collection missing: {name}")
    collection.hide_render = not visible


def set_mode(mode: str) -> None:
    studio = bpy.data.collections["STUDIO"]
    if mode == "studio":
        for name in ("ENVIRONMENT", "SPIRAL", "LIGHTING", "ATMOSPHERE"):
            set_collection_visible(name, False)
        set_collection_visible("STUDIO", True)
        for obj in studio.all_objects:
            if obj is not None:
                obj.hide_render = False
    else:
        for name in ("ENVIRONMENT", "SPIRAL", "LIGHTING", "ATMOSPHERE"):
            set_collection_visible(name, True)
        set_collection_visible("STUDIO", False)
        for obj in studio.all_objects:
            if obj is not None:
                obj.hide_render = True


def resolution(scene: bpy.types.Scene, width: int, height: int, scale: float) -> tuple[int, int]:
    resolved = (max(64, round(width * scale)), max(64, round(height * scale)))
    scene.render.resolution_x = resolved[0]
    scene.render.resolution_y = resolved[1]
    scene.render.resolution_percentage = 100
    return resolved


def render_still(
    scene: bpy.types.Scene,
    output: Path,
    camera_name: str,
    frame: int,
    dimensions: tuple[int, int],
    evidence: list[dict],
    group: str,
) -> None:
    camera = bpy.data.objects.get(camera_name)
    if camera is None or camera.type != "CAMERA":
        raise RuntimeError(f"Required camera missing: {camera_name}")
    scene.camera = camera
    scene.frame_set(frame)
    resolution(scene, *dimensions, 1.0)
    output.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(output.resolve())
    bpy.ops.render.render(write_still=True)
    if not output.exists() or output.stat().st_size == 0:
        raise RuntimeError(f"Render was not written: {output}")
    evidence.append(
        {
            "group": group,
            "path": output.relative_to(cfg.PACKAGE_ROOT).as_posix(),
            "frame": frame,
            "camera": camera_name,
            "width": dimensions[0],
            "height": dimensions[1],
            "bytes": output.stat().st_size,
            "sha256": sha256(output),
        }
    )
    print(f"QH_RENDER={output}|{output.stat().st_size}")


def scaled(base: tuple[int, int], factor: float) -> tuple[int, int]:
    return max(64, round(base[0] * factor)), max(64, round(base[1] * factor))


def render_diagnostics(scene: bpy.types.Scene, scale: float, evidence: list[dict]) -> None:
    set_mode("environment")
    dimensions = scaled((1920, 1200), scale)
    for name, frame in (
        ("diagnostic-dormant", cfg.FRAME_START),
        ("diagnostic-mid-conduction", cfg.frame_at(0.55)),
        ("diagnostic-interface", cfg.frame_at(0.91)),
        ("diagnostic-portal-end", cfg.frame_at(0.97)),
        ("diagnostic-dom-match", cfg.FRAME_END),
    ):
        render_still(scene, cfg.RENDER_DIR / "diagnostics" / f"{name}.png", "Camera_Desktop", frame, dimensions, evidence, "diagnostics")


def render_portal_diagnostics(scene: bpy.types.Scene, scale: float, evidence: list[dict]) -> None:
    """Render only the creative-gate frames affected by portal continuity repairs."""
    set_mode("environment")
    dimensions = scaled((1920, 1200), scale)
    for name, frame in (
        ("diagnostic-interface", cfg.frame_at(0.91)),
        ("diagnostic-portal-end", cfg.frame_at(0.97)),
        ("diagnostic-dom-match", cfg.FRAME_END),
    ):
        render_still(scene, cfg.RENDER_DIR / "diagnostics" / f"{name}.png", "Camera_Desktop", frame, dimensions, evidence, "portal-diagnostics")


def render_qa_repair(scene: bpy.types.Scene, scale: float, evidence: list[dict]) -> None:
    """Render only the physical-row, cable-study and authored-mobile QA repairs."""
    set_mode("environment")
    render_still(
        scene,
        cfg.RENDER_DIR / "materials" / "material-cable.png",
        "Camera_Material_Cable",
        cfg.frame_at(0.55),
        scaled(cfg.MATERIAL_RESOLUTION, scale),
        evidence,
        "materials",
    )
    desktop_dimensions = scaled(cfg.DESKTOP_RESOLUTION, scale)
    render_still(
        scene,
        cfg.RENDER_DIR / "conduction" / "conduction-10.png",
        "Camera_Desktop_EarlyConduction",
        cfg.frame_at(0.10),
        desktop_dimensions,
        evidence,
        "conduction",
    )
    for output_name, frame in (
        ("activation-04-interface-visible", cfg.frame_at(0.91)),
        ("activation-05-portal-ready", cfg.frame_at(0.93)),
    ):
        render_still(scene, cfg.RENDER_DIR / "activation" / f"{output_name}.png", "Camera_Desktop", frame, desktop_dimensions, evidence, "activation")
    for output_name, frame in (
        ("portal-25", cfg.frame_at(0.91)),
        ("portal-50", cfg.frame_at(0.93)),
    ):
        render_still(scene, cfg.RENDER_DIR / "portal" / f"{output_name}.png", "Camera_Desktop", frame, desktop_dimensions, evidence, "portal")
    render_still(
        scene,
        cfg.RENDER_DIR / "diagnostics" / "diagnostic-interface.png",
        "Camera_Desktop",
        cfg.frame_at(0.91),
        scaled((1920, 1200), scale * 0.5),
        evidence,
        "diagnostics",
    )
    render_mobile(scene, scale, evidence)


def render_cable_study(scene: bpy.types.Scene, scale: float, evidence: list[dict]) -> None:
    set_mode("environment")
    render_still(
        scene,
        cfg.RENDER_DIR / "materials" / "material-cable.png",
        "Camera_Material_Cable",
        cfg.frame_at(0.55),
        scaled(cfg.MATERIAL_RESOLUTION, scale),
        evidence,
        "materials",
    )


def render_design(scene: bpy.types.Scene, scale: float, evidence: list[dict]) -> None:
    set_mode("studio")
    dimensions = scaled(cfg.DESIGN_RESOLUTION, scale)
    for output_name, camera_name in cfg.DESIGN_CAMERAS.items():
        render_still(scene, cfg.RENDER_DIR / "design" / f"{output_name}.png", camera_name, cfg.FRAME_START, dimensions, evidence, "design")


def render_materials(scene: bpy.types.Scene, scale: float, evidence: list[dict]) -> None:
    dimensions = scaled(cfg.MATERIAL_RESOLUTION, scale)
    for output_name, camera_name in cfg.MATERIAL_CAMERAS.items():
        set_mode("environment" if output_name == "material-cable" else "studio")
        frame = cfg.frame_at(0.55) if output_name == "material-cable" else cfg.FRAME_START
        render_still(scene, cfg.RENDER_DIR / "materials" / f"{output_name}.png", camera_name, frame, dimensions, evidence, "materials")


def render_desktop(scene: bpy.types.Scene, scale: float, evidence: list[dict]) -> None:
    set_mode("environment")
    dimensions = scaled(cfg.DESKTOP_RESOLUTION, scale)
    render_still(scene, cfg.RENDER_DIR / "desktop" / "dormant-master.png", "Camera_Desktop", cfg.FRAME_START, dimensions, evidence, "desktop")
    for output_name, frame in cfg.CONDUCTION_MASTER_FRAMES.items():
        camera_name = "Camera_Desktop_EarlyConduction" if output_name == "conduction-10" else "Camera_Desktop"
        render_still(scene, cfg.RENDER_DIR / "conduction" / f"{output_name}.png", camera_name, frame, dimensions, evidence, "conduction")


def render_activation(scene: bpy.types.Scene, scale: float, evidence: list[dict]) -> None:
    set_mode("environment")
    dimensions = scaled(cfg.DESKTOP_RESOLUTION, scale)
    for output_name, frame in cfg.ACTIVATION_FRAMES.items():
        render_still(scene, cfg.RENDER_DIR / "activation" / f"{output_name}.png", "Camera_Desktop", frame, dimensions, evidence, "activation")


def render_portal(scene: bpy.types.Scene, scale: float, evidence: list[dict]) -> None:
    set_mode("environment")
    dimensions = scaled(cfg.DESKTOP_RESOLUTION, scale)
    for output_name, frame in cfg.PORTAL_FRAMES.items():
        render_still(scene, cfg.RENDER_DIR / "portal" / f"{output_name}.png", "Camera_Desktop", frame, dimensions, evidence, "portal")


def render_mobile(scene: bpy.types.Scene, scale: float, evidence: list[dict]) -> None:
    set_mode("environment")
    authored_cameras = {
        "mobile-dormant": "Camera_Mobile",
        "mobile-mid-conduction": "Camera_Mobile_Conduction",
        "mobile-activation": "Camera_Mobile",
        "mobile-portal": "Camera_Mobile_PortalEntry",
    }
    for resolution_name, base_dimensions in cfg.MOBILE_RESOLUTIONS.items():
        dimensions = scaled(base_dimensions, scale)
        for output_name, frame in cfg.MOBILE_FRAMES.items():
            render_still(
                scene,
                cfg.RENDER_DIR / "mobile" / resolution_name / f"{output_name}.png",
                authored_cameras[output_name],
                frame,
                dimensions,
                evidence,
                "mobile",
            )


def render_reduced(scene: bpy.types.Scene, scale: float, evidence: list[dict]) -> None:
    set_mode("environment")
    render_still(
        scene,
        cfg.RENDER_DIR / "reduced" / "reduced-motion-desktop.png",
        "Camera_Desktop",
        cfg.FRAME_START,
        scaled((1600, 1000), scale),
        evidence,
        "reduced",
    )
    render_still(
        scene,
        cfg.RENDER_DIR / "reduced" / "reduced-motion-mobile.png",
        "Camera_Mobile",
        cfg.FRAME_START,
        scaled((720, 1600), scale),
        evidence,
        "reduced",
    )


def render_animatic(scene: bpy.types.Scene, scale: float, frame_step: int, evidence: list[dict]) -> None:
    set_mode("environment")
    dimensions = scaled(cfg.ANIMATIC_RESOLUTION, scale)
    for frame in range(cfg.FRAME_START, cfg.FRAME_END + 1, max(1, frame_step)):
        render_still(
            scene,
            cfg.WORK_DIR / "animatic-frames" / f"frame-{frame:04d}.png",
            "Camera_Desktop",
            frame,
            dimensions,
            evidence,
            "animatic-frame",
        )


def write_manifest(scene: bpy.types.Scene, args: argparse.Namespace, evidence: list[dict]) -> Path:
    cfg.MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    path = cfg.MANIFEST_DIR / f"render-manifest-{args.group}.json"
    payload = {
        "schema": "quantum-hub.phase-0-3d-render-manifest.v1",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "original_artwork": True,
        "reference_site_binary_used": False,
        "blender_version": bpy.app.version_string,
        "blender_build_hash": bpy.app.build_hash.decode("ascii", errors="replace") if isinstance(bpy.app.build_hash, bytes) else str(bpy.app.build_hash),
        "blend_source": cfg.BLEND_PATH.relative_to(cfg.PACKAGE_ROOT).as_posix(),
        "blend_source_sha256": sha256(cfg.BLEND_PATH),
        "engine": scene.render.engine,
        "samples": args.samples,
        "render_scale": args.scale,
        "frame_step": args.frame_step,
        "timeline": {"fps": cfg.FPS, "frame_start": cfg.FRAME_START, "frame_end": cfg.FRAME_END},
        "renders": evidence,
    }
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"QH_MANIFEST={path}")
    return path


def main() -> None:
    args = cli_args()
    scene = bpy.context.scene
    configure_engine(scene, args.engine, max(1, args.samples))
    evidence: list[dict] = []
    selected = {args.group} if args.group != "all" else {"design", "materials", "desktop", "activation", "portal", "mobile", "reduced"}
    if "diagnostics" in selected:
        render_diagnostics(scene, args.scale, evidence)
    if "portal-diagnostics" in selected:
        render_portal_diagnostics(scene, args.scale, evidence)
    if "qa-repair" in selected:
        render_qa_repair(scene, args.scale, evidence)
    if "cable-study" in selected:
        render_cable_study(scene, args.scale, evidence)
    if "design" in selected:
        render_design(scene, args.scale, evidence)
    if "materials" in selected:
        render_materials(scene, args.scale, evidence)
    if "desktop" in selected:
        render_desktop(scene, args.scale, evidence)
    if "activation" in selected:
        render_activation(scene, args.scale, evidence)
    if "portal" in selected:
        render_portal(scene, args.scale, evidence)
    if "mobile" in selected:
        render_mobile(scene, args.scale, evidence)
    if "reduced" in selected:
        render_reduced(scene, args.scale, evidence)
    if "animatic" in selected:
        render_animatic(scene, args.scale, args.frame_step, evidence)
    write_manifest(scene, args, evidence)


if __name__ == "__main__":
    main()
