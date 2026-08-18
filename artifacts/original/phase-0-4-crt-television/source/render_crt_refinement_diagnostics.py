"""Render the four-frame visual gate for the selected CRT refinement."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import bpy

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import crt_refined_config as cfg


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def material(name: str) -> bpy.types.Material:
    result = bpy.data.materials.get(name)
    if result is None:
        raise KeyError(name)
    return result


def set_material(obj: bpy.types.Object, mat: bpy.types.Material) -> None:
    if len(obj.data.materials) == 0:
        obj.data.materials.append(mat)
    else:
        obj.data.materials[0] = mat


def set_state(state: dict) -> None:
    inactive = material("SpiralCable_InactiveInternalChannel")
    active = material("SpiralCable_EnergizedTrail")
    front = material("SpiralCable_ModestlyBrighterFront")
    progress = float(state["conduction_progress"])
    segments = sorted(
        (obj for obj in bpy.data.objects if obj.name.startswith("SpiralCable_InternalChannel_")),
        key=lambda obj: float(obj.get("progress_start", 0.0)),
    )
    leading_index = None
    for index, obj in enumerate(segments):
        start = float(obj.get("progress_start", 0.0))
        end = float(obj.get("progress_end", 0.0))
        if end <= progress + 1e-9:
            set_material(obj, active)
        elif start < progress < end or (progress >= 1.0 and index == len(segments) - 1):
            set_material(obj, front)
            leading_index = index
        else:
            set_material(obj, inactive)
    if progress > 0.0 and leading_index is None:
        leading_index = min(len(segments) - 1, max(0, round(progress * (len(segments) - 1))))
        set_material(segments[leading_index], front)

    indicator = bpy.data.objects["CRT_DormantPowerIndicator"]
    set_material(indicator, material("CRT_PowerIndicatorWarmMagenta") if state["indicator"] else material("CRT_PowerIndicatorOff"))
    indicator["emission_strength"] = 1.4 if state["indicator"] else 0.0

    phosphor = bpy.data.objects["CRT_InternalPhosphorLayer"]
    phosphor_state = state["phosphor"]
    set_material(phosphor, material("CRT_PhosphorLowGrey") if phosphor_state != "off" else material("CRT_PhosphorOff"))
    phosphor["state"] = phosphor_state
    wake = bpy.data.objects["CRT_WakeHorizontalPhosphorLine"]
    wake.hide_render = phosphor_state != "wake-line"
    for obj in bpy.data.collections["CRT_SCANLINE_GEOMETRY"].all_objects:
        if obj is not None:
            obj.hide_render = phosphor_state not in ("raster", "interface")
    for obj in bpy.data.collections["CRT_PHYSICAL_SIGNAL_INTERFACE"].all_objects:
        if obj is not None:
            obj.hide_render = not bool(state["interface"])
    proof_light = bpy.data.objects.get("Scene_GlassProofAccent")
    if proof_light is not None:
        proof_light.hide_render = not bool(state.get("glass_proof", False))


def main() -> None:
    scene = bpy.context.scene
    scene.render.engine = cfg.ITERATION_ENGINE
    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = cfg.ITERATION_SAMPLES
    scene.render.resolution_x, scene.render.resolution_y = cfg.DIAGNOSTIC_RESOLUTION
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 48
    cfg.DIAGNOSTIC_DIR.mkdir(parents=True, exist_ok=True)
    cfg.MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    records = []
    for state_id, state in cfg.DIAGNOSTIC_STATES.items():
        set_state(state)
        scene.camera = bpy.data.objects[state["camera"]]
        output = cfg.DIAGNOSTIC_DIR / f"diagnostic-{state_id}.png"
        scene.render.filepath = str(output.resolve())
        bpy.ops.render.render(write_still=True)
        records.append(
            {
                "state_id": state_id,
                "camera": state["camera"],
                "conduction_progress": state["conduction_progress"],
                "indicator": state["indicator"],
                "phosphor": state["phosphor"],
                "interface": state["interface"],
                "package_relative_path": output.relative_to(cfg.PACKAGE_DIR).as_posix(),
                "width": cfg.DIAGNOSTIC_RESOLUTION[0],
                "height": cfg.DIAGNOSTIC_RESOLUTION[1],
                "bytes": output.stat().st_size,
                "sha256": sha256(output),
                "approval_state": "diagnostic visual gate only",
            }
        )
    source = cfg.REFINED_BLEND
    manifest = {
        "schema": "quantum-hub.phase-0-4-crt-television.refinement-diagnostics.v1",
        "script_version": cfg.SCRIPT_VERSION,
        "source": {
            "package_relative_path": source.relative_to(cfg.PACKAGE_DIR).as_posix(),
            "bytes": source.stat().st_size,
            "sha256": sha256(source),
        },
        "render": {
            "engine": cfg.ITERATION_ENGINE,
            "samples": cfg.ITERATION_SAMPLES,
            "resolution": {"width": cfg.DIAGNOSTIC_RESOLUTION[0], "height": cfg.DIAGNOSTIC_RESOLUTION[1]},
            "color_management": cfg.COLOR_MANAGEMENT,
        },
        "full_animatic_created": False,
        "records": records,
    }
    target = cfg.MANIFEST_DIR / "crt-refinement-diagnostic-render-manifest.json"
    target.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"QH_PHASE04_CRT_DIAGNOSTICS={len(records)}")
    print(f"QH_PHASE04_CRT_DIAGNOSTIC_MANIFEST={target.resolve()}")


if __name__ == "__main__":
    main()
