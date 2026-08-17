"""Render the bounded still-only Phase 0.2 evidence from the selected scene."""

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
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--group", choices=("diagnostic", "desktop", "design-rear", "activation", "portal-glass", "all"), default="all")
    parser.add_argument("--scale", type=float, default=1.0)
    return parser.parse_args(raw)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def set_state(conduction: float = 0.0, connector: float = 0.0, mechanical: float = 0.0, screen: float = 0.0, portal: float = 0.0) -> dict[str, float]:
    values = {
        "conduction": conduction,
        "connector": connector,
        "mechanical": mechanical,
        "screen": screen,
        "portal": portal,
    }
    control = bpy.data.objects["CTRL_V2_StillStates"]
    for key, value in values.items():
        control[key] = max(0.0, min(1.0, float(value)))
    # Blender 5.2 does not eagerly invalidate driver dependencies after direct
    # ID-property writes in background mode. Explicitly tag and re-evaluate so
    # every still reflects its declared deterministic state.
    control.update_tag(refresh={"OBJECT"})
    bpy.context.scene.frame_set(bpy.context.scene.frame_current)
    bpy.context.view_layer.update()
    return values


def render(records: list[dict], group: str, name: str, camera: str, resolution: tuple[int, int], state: dict[str, float], scale: float) -> None:
    scene = bpy.context.scene
    scene.camera = bpy.data.objects[camera]
    width = max(240, round(resolution[0] * scale))
    height = max(240, round(resolution[1] * scale))
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    output = cfg.RENDER_DIR / group / f"{name}.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(output.resolve())
    bpy.ops.render.render(write_still=True)
    records.append(
        {
            "group": group,
            "name": name,
            "path": output.relative_to(cfg.PACKAGE_ROOT).as_posix(),
            "camera": camera,
            "state": state,
            "width": width,
            "height": height,
            "bytes": output.stat().st_size,
            "sha256": sha256(output),
        }
    )


def diagnostic(records: list[dict], scale: float) -> None:
    render(records, "diagnostics", "dormant", "Camera_Hero", (1280, 800), set_state(), scale)
    render(records, "diagnostics", "mid-conduction", "Camera_Arc_02", (1280, 800), set_state(conduction=0.56), scale)
    render(records, "diagnostics", "activation", "Camera_ActivationClose", (1280, 800), set_state(1.0, 1.0, 1.0, 1.0), scale)
    render(records, "diagnostics", "portal-physical-base", "Camera_PortalPhysical", (1280, 800), set_state(1.0, 1.0, 1.0, 1.0), scale)


def desktop_diagnostic(records: list[dict], scale: float) -> None:
    render(records, "diagnostics", "desktop-safe-area", "Camera_DesktopHero", cfg.CANONICAL_STILL_RESOLUTION, set_state(), scale)


def set_rear_environment_hidden(hidden: bool) -> None:
    prefixes = ("RearWall_", "IndustrialColumn_", "DistantProcessTank_")
    for obj in bpy.data.objects:
        if obj.name.startswith(prefixes):
            obj.hide_render = hidden
    bpy.context.view_layer.update()


def set_physical_ui_hidden(hidden: bool) -> None:
    """Hide only physical status glyphs/datums for the DOM overlay glass plate."""
    exact_names = {
        "PhysicalScreen_ChallengeDetected",
        "PhysicalScreen_OperatingRoute",
        "PhysicalScreen_TestRouteAvailable",
    }
    for obj in bpy.data.objects:
        if obj.name in exact_names or obj.name.startswith("PhysicalScreen_RouteDatum_"):
            obj.hide_render = hidden
    bpy.context.view_layer.update()


def portal_glass_still(records: list[dict], scale: float) -> None:
    set_physical_ui_hidden(True)
    try:
        render(
            records,
            "portal",
            "physical-glass-base",
            "Camera_PortalPhysical",
            cfg.CANONICAL_STILL_RESOLUTION,
            set_state(1.0, 1.0, 1.0, 1.0),
            scale,
        )
    finally:
        set_physical_ui_hidden(False)


def design_rear(records: list[dict], scale: float) -> None:
    set_rear_environment_hidden(True)
    try:
        render(records, "design", "rear", "Camera_DesignRear", cfg.DESIGN_RESOLUTION, set_state(), scale)
        render(records, "design", "rear-three-quarter", "Camera_DesignRearThreeQuarter", cfg.DESIGN_RESOLUTION, set_state(), scale)
    finally:
        set_rear_environment_hidden(False)


def activation_stills(records: list[dict], scale: float) -> None:
    activation_states = [
        ("01-connector-arrival", (1.0, 0.0, 0.0, 0.0)),
        ("02-internal-energy-transfer", (1.0, 1.0, 0.0, 0.0)),
        ("03-mechanical-movement-begins", (1.0, 1.0, 0.45, 0.0)),
        ("04-interface-visible", (1.0, 1.0, 1.0, 0.62)),
        ("05-portal-ready", (1.0, 1.0, 1.0, 1.0)),
    ]
    for name, state_args in activation_states:
        render(records, "activation", name, "Camera_ActivationClose", cfg.CANONICAL_STILL_RESOLUTION, set_state(*state_args), scale)


def all_stills(records: list[dict], scale: float) -> None:
    set_state()
    for name, camera in [
        ("front", "Camera_DesignFront"),
        ("side", "Camera_DesignSide"),
        ("top", "Camera_DesignTop"),
        ("three-quarter", "Camera_DesignThreeQuarter"),
        ("rear", "Camera_DesignRear"),
        ("low", "Camera_DesignLow"),
        ("rear-three-quarter", "Camera_DesignRearThreeQuarter"),
    ]:
        rear_view = name in {"rear", "rear-three-quarter"}
        set_rear_environment_hidden(rear_view)
        try:
            render(records, "design", name, camera, cfg.DESIGN_RESOLUTION, set_state(), scale)
        finally:
            if rear_view:
                set_rear_environment_hidden(False)

    for name, camera, state_args in [
        ("shell", "Camera_MaterialShell", ()),
        ("glass", "Camera_MaterialGlass", ()),
        ("connector", "Camera_MaterialConnector", (1.0, 1.0)),
        ("cable", "Camera_MaterialCable", (0.58,)),
    ]:
        render(records, "materials", name, camera, cfg.MATERIAL_RESOLUTION, set_state(*state_args), scale)

    render(records, "environment", "proving-ground-style-frame", "Camera_DesktopHero", cfg.CANONICAL_STILL_RESOLUTION, set_state(), scale)

    camera_states = [
        ("01-arrival", "Camera_Arc_01", ()),
        ("02-conduction-35", "Camera_Arc_02", (0.35,)),
        ("03-conduction-70", "Camera_Arc_03", (0.70,)),
        ("04-frontal-activation", "Camera_Arc_04", (1.0, 1.0, 1.0, 1.0)),
    ]
    # Apply each state immediately before its still; avoid pre-evaluating all
    # state controls and accidentally flattening the four authored checkpoints.
    for name, camera_name, state_args in camera_states:
        render(records, "camera-study", name, camera_name, cfg.CANONICAL_STILL_RESOLUTION, set_state(*state_args), scale)

    activation_stills(records, scale)

    portal_glass_still(records, scale)
    render(records, "hero", "desktop-dormant-base", "Camera_DesktopHero", cfg.CANONICAL_STILL_RESOLUTION, set_state(), scale)
    render(records, "hero", "desktop-mid-base", "Camera_DesktopHero", cfg.CANONICAL_STILL_RESOLUTION, set_state(conduction=0.56), scale)
    render(records, "hero", "mobile-dormant-base", "Camera_MobileHero", (720, 1600), set_state(), scale)
    render(records, "hero", "mobile-mid-base", "Camera_MobileHero", (720, 1600), set_state(conduction=0.56), scale)


def main() -> None:
    args = cli_args()
    records: list[dict] = []
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.compression = 42
    if args.group == "diagnostic":
        diagnostic(records, args.scale)
    elif args.group == "desktop":
        desktop_diagnostic(records, args.scale)
    elif args.group == "design-rear":
        design_rear(records, args.scale)
    elif args.group == "activation":
        activation_stills(records, args.scale)
    elif args.group == "portal-glass":
        portal_glass_still(records, args.scale)
    else:
        all_stills(records, args.scale)
    manifest = {
        "schema": "quantum-hub.phase-0-3d-repair-v2.final-still-renders.v1",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "source": cfg.FINAL_BLEND.relative_to(cfg.PACKAGE_ROOT).as_posix(),
        "source_sha256": sha256(cfg.FINAL_BLEND),
        "portal_layout_sha256": scene["portal_layout_sha256"],
        "blender_version": bpy.app.version_string,
        "blender_build_hash": bpy.app.build_hash.decode("utf-8"),
        "engine": scene.render.engine,
        "samples": 48,
        "render_scale": args.scale,
        "still_only": True,
        "full_animatic": False,
        "camera_study_arc_degrees": 27,
        "mechanical_response_count": 1,
        "original_artwork": True,
        "reference_binary_used": False,
        "renders": records,
    }
    cfg.MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    target = cfg.MANIFEST_DIR / f"final-render-manifest-{args.group}.json"
    target.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"QH_V2_FINAL_RENDERS={len(records)}")
    print(f"QH_V2_FINAL_RENDER_MANIFEST={target.resolve()}")


if __name__ == "__main__":
    main()
