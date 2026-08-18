"""Render the deterministic still-only Phase 0.4 CRT evidence inventory.

This script consumes the shared CRT portal-layout authority through
``crt_canonical_config``. It creates no frame sequence or moving image.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path

import bpy

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import crt_canonical_config as cfg


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_contract() -> dict:
    actual = sha256(cfg.PORTAL_LAYOUT)
    if actual != cfg.PORTAL_LAYOUT_SHA256:
        raise RuntimeError(
            f"portal layout authority changed: expected {cfg.PORTAL_LAYOUT_SHA256}, got {actual}"
        )
    contract = json.loads(cfg.PORTAL_LAYOUT.read_text(encoding="utf-8"))
    if contract.get("schema") != "quantum-hub.phase-0-4-crt-television.crt-portal-layout.v1":
        raise RuntimeError("unexpected CRT portal layout schema")
    return contract


def material(name: str) -> bpy.types.Material:
    result = bpy.data.materials.get(name)
    if result is None:
        raise KeyError(name)
    return result


def set_material(obj: bpy.types.Object, mat: bpy.types.Material) -> None:
    if not hasattr(obj.data, "materials"):
        return
    if len(obj.data.materials) == 0:
        obj.data.materials.append(mat)
    else:
        obj.data.materials[0] = mat


def cable_segments(prefix: str) -> list[bpy.types.Object]:
    return sorted(
        (obj for obj in bpy.data.objects if obj.name.startswith(prefix)),
        key=lambda obj: float(obj.get("progress_start", 0.0)),
    )


def set_conduction(prefix: str, progress: float) -> None:
    inactive = material("SpiralCable_InactiveInternalChannel")
    active = material("SpiralCable_EnergizedTrail")
    front = material("SpiralCable_ModestlyBrighterFront")
    segments = cable_segments(prefix)
    if not segments:
        raise RuntimeError(f"missing cable segments for {prefix}")
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


def set_cable_variant(name: str, progress: float) -> None:
    desktop = bpy.data.collections["DESKTOP_2_5_TURN_SPIRAL_CABLE"]
    mobile = bpy.data.collections["MOBILE_2_25_TURN_SPIRAL_CABLE"]
    desktop.hide_render = name != "desktop"
    mobile.hide_render = name != "mobile"
    if name == "desktop":
        set_conduction("SpiralCable_InternalChannel_", progress)
    elif name == "mobile":
        set_conduction("MobileSpiralCable_InternalChannel_", progress)
    else:
        raise ValueError(f"unknown cable variant: {name}")


def set_state(state: dict) -> None:
    progress = float(state["conduction_progress"])
    set_cable_variant(str(state["cable"]), progress)

    indicator = bpy.data.objects["CRT_DormantPowerIndicator"]
    set_material(
        indicator,
        material("CRT_PowerIndicatorWarmMagenta")
        if state["indicator"]
        else material("CRT_PowerIndicatorOff"),
    )
    indicator["emission_strength"] = 1.4 if state["indicator"] else 0.0

    phosphor_state = str(state["phosphor"])
    glass_shader = material("CRT_ThickSmokedGlass").node_tree.nodes.get("Principled BSDF")
    if glass_shader is None:
        raise RuntimeError("missing CRT smoked-glass shader")
    active_screen = phosphor_state != "off"
    glass_shader.inputs["Roughness"].default_value = 0.22 if active_screen else 0.13
    if "Transmission Weight" in glass_shader.inputs:
        glass_shader.inputs["Transmission Weight"].default_value = 0.72 if active_screen else 0.18
    if "IOR Level" in glass_shader.inputs:
        glass_shader.inputs["IOR Level"].default_value = 0.03 if active_screen else 0.50
    if "Coat Weight" in glass_shader.inputs:
        glass_shader.inputs["Coat Weight"].default_value = 0.0 if active_screen else 0.28
    phosphor = bpy.data.objects["CRT_InternalPhosphorLayer"]
    set_material(
        phosphor,
        material("CRT_PhosphorOff") if phosphor_state == "off" else material("CRT_PhosphorLowGrey"),
    )
    phosphor["state"] = phosphor_state
    bpy.data.objects["CRT_WakeHorizontalPhosphorLine"].hide_render = phosphor_state != "wake-line"

    # Snapshot Blender's collection view before mutating visibility. Iterating
    # the live view while unhiding objects skips members in Blender 5.2.
    for obj in list(bpy.data.collections["CRT_SCANLINE_GEOMETRY"].all_objects):
        if obj is not None:
            obj.hide_render = phosphor_state not in ("raster", "interface")
    for obj in list(bpy.data.collections["CRT_PHYSICAL_SIGNAL_INTERFACE"].all_objects):
        if obj is not None:
            obj.hide_render = not bool(state["interface"])
    proof_light = bpy.data.objects.get("Scene_GlassProofAccent")
    if proof_light is not None:
        proof_light.hide_render = not bool(state.get("glass_proof", False))


def camera_azimuth(camera_name: str) -> float:
    spec = cfg.refined.CAMERAS[camera_name]
    camera = spec["location"]
    target = spec["target"]
    return math.degrees(math.atan2(camera[1] - target[1], camera[0] - target[0]))


def main() -> None:
    contract = require_contract()
    scene = bpy.context.scene
    source = cfg.REFINED_BLEND
    script = Path(__file__).resolve()
    canonical_config = Path(cfg.__file__).resolve()
    refined_config = Path(cfg.refined.__file__).resolve()
    source_sha256 = sha256(source)
    script_sha256 = sha256(script)
    canonical_config_sha256 = sha256(canonical_config)
    refined_config_sha256 = sha256(refined_config)
    record_lineage = {
        "parent": "quantum-hub.phase-0-4-crt-television.canonical-still-render-inventory.v1",
        "refined_source_sha256": source_sha256,
        "render_generator_sha256": script_sha256,
        "canonical_config_sha256": canonical_config_sha256,
        "refined_config_sha256": refined_config_sha256,
        "layout_authority_sha256": cfg.PORTAL_LAYOUT_SHA256,
    }
    scene.render.engine = cfg.EEVEE_ENGINE
    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = cfg.EEVEE_SAMPLES
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 48
    scene.render.film_transparent = False
    cfg.RENDER_ROOT.mkdir(parents=True, exist_ok=True)
    cfg.MANIFEST_DIR.mkdir(parents=True, exist_ok=True)

    actual_power = [key for key in cfg.CANONICAL_STATES if key.startswith("power-")]
    actual_portal = [key for key in cfg.CANONICAL_STATES if key.startswith("portal-")]
    if actual_power != cfg.POWER_STATE_IDS:
        raise RuntimeError(f"seven-state power authority mismatch: {actual_power}")
    if actual_portal != cfg.PORTAL_STATE_IDS[:6]:
        raise RuntimeError(f"physical portal authority mismatch: {actual_portal}")
    if len(cfg.PORTAL_STATE_IDS) != 8 or len(set(cfg.PORTAL_STATE_IDS)) != 8:
        raise RuntimeError("eight-state portal authority must contain eight unique IDs")

    requested = None
    if "--" in sys.argv:
        tail = sys.argv[sys.argv.index("--") + 1 :]
        if "--only" in tail:
            value_index = tail.index("--only") + 1
            if value_index >= len(tail):
                raise RuntimeError("--only requires comma-separated state IDs")
            requested = [item.strip() for item in tail[value_index].split(",") if item.strip()]
            unknown = [item for item in requested if item not in cfg.CANONICAL_STATES]
            if unknown:
                raise RuntimeError(f"unknown canonical state IDs: {unknown}")
    state_items = list(cfg.CANONICAL_STATES.items())
    render_root = cfg.RENDER_ROOT
    if requested is not None:
        state_items = [(key, cfg.CANONICAL_STATES[key]) for key in requested]
        render_root = cfg.PACKAGE_DIR / "work" / "canonical-checks"

    records = []
    for order, (state_id, state) in enumerate(state_items, 1):
        set_state(state)
        scene.camera = bpy.data.objects[state["camera"]]
        width, height = state["resolution"]
        scene.render.resolution_x = int(width)
        scene.render.resolution_y = int(height)
        output = render_root / state["group"] / f"{state_id}.png"
        output.parent.mkdir(parents=True, exist_ok=True)
        scene.render.filepath = str(output.resolve())
        bpy.ops.render.render(write_still=True)
        records.append(
            {
                "id": state_id,
                "order": order,
                "group": state["group"],
                "camera": state["camera"],
                "camera_azimuth_degrees": round(camera_azimuth(state["camera"]), 6),
                "conduction_progress": state["conduction_progress"],
                "indicator": state["indicator"],
                "phosphor": state["phosphor"],
                "interface": state["interface"],
                "cable": state["cable"],
                "classification": state["classification"],
                "approval_state": state["approval_state"],
                "render_settings": {
                    "engine": state["engine"],
                    "samples": cfg.EEVEE_SAMPLES,
                    "denoising": False,
                    "color_management": cfg.COLOR_MANAGEMENT,
                    "resolution": [int(width), int(height)],
                },
                "lineage": record_lineage,
                "package_relative_path": output.relative_to(cfg.PACKAGE_DIR).as_posix(),
                "width": int(width),
                "height": int(height),
                "bytes": output.stat().st_size,
                "sha256": sha256(output),
            }
        )

    arrival = camera_azimuth("Camera_Path_Arrival")
    path_checkpoints = [
        "Camera_Path_Arrival",
        "Camera_Path_30",
        "Camera_Path_60",
        "Camera_Path_NearFrontal",
        "Camera_Power_Front",
        "Camera_Portal_03_CloseApproach",
    ]
    path_measurements = [
        {
            "camera": name,
            "azimuth_degrees": round(camera_azimuth(name), 6),
            "arc_from_arrival_degrees": round(abs(camera_azimuth(name) - arrival), 6),
        }
        for name in path_checkpoints
    ]
    if requested is not None:
        check_manifest = cfg.PACKAGE_DIR / "work" / "crt-canonical-check-manifest.json"
        check_manifest.parent.mkdir(parents=True, exist_ok=True)
        check_manifest.write_text(
            json.dumps(
                {
                    "schema": "quantum-hub.phase-0-4-crt-television.canonical-check.v1",
                    "status": "VISUAL_INSPECTION_REQUIRED",
                    "layout_authority_sha256": cfg.PORTAL_LAYOUT_SHA256,
                    "records": records,
                    "full_animatic_created": False,
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        print(f"QH_PHASE04_CRT_CANONICAL_CHECKS={len(records)}")
        print(f"QH_PHASE04_CRT_CANONICAL_CHECK_MANIFEST={check_manifest.resolve()}")
        return

    power_records = [next(record for record in records if record["id"] == state_id) for state_id in cfg.POWER_STATE_IDS]
    portal_records = []
    for order, state_id in enumerate(cfg.PORTAL_STATE_IDS, 1):
        match = next((record for record in records if record["id"] == state_id), None)
        if match is not None:
            portal_records.append(
                {
                    "id": state_id,
                    "order": order,
                    "owner": "Blender physical CRT",
                    "render": match,
                }
            )
        else:
            portal_records.append(
                {
                    "id": state_id,
                    "order": order,
                    "owner": "repository browser semantic DOM",
                    "render": None,
                    "status": "blocked until frozen scene-source handoff",
                }
            )

    manifest = {
        "schema": "quantum-hub.phase-0-4-crt-television.canonical-still-render-inventory.v1",
        "status": "PASS",
        "source": {
            "package_relative_path": source.relative_to(cfg.PACKAGE_DIR).as_posix(),
            "bytes": source.stat().st_size,
            "sha256": sha256(source),
        },
        "generator": {
            "package_relative_path": script.relative_to(cfg.PACKAGE_DIR).as_posix(),
            "bytes": script.stat().st_size,
            "sha256": sha256(script),
        },
        "configuration_authority": [
            {
                "package_relative_path": canonical_config.relative_to(cfg.PACKAGE_DIR).as_posix(),
                "bytes": canonical_config.stat().st_size,
                "sha256": canonical_config_sha256,
            },
            {
                "package_relative_path": refined_config.relative_to(cfg.PACKAGE_DIR).as_posix(),
                "bytes": refined_config.stat().st_size,
                "sha256": refined_config_sha256,
            },
        ],
        "layout_authority": {
            "package_relative_path": cfg.PORTAL_LAYOUT.relative_to(cfg.PACKAGE_DIR).as_posix(),
            "bytes": cfg.PORTAL_LAYOUT.stat().st_size,
            "sha256": cfg.PORTAL_LAYOUT_SHA256,
            "schema": contract["schema"],
            "consumed_directly": True,
        },
        "render_settings": {
            "engine": cfg.EEVEE_ENGINE,
            "samples": cfg.EEVEE_SAMPLES,
            "denoising": False,
            "denoising_note": "not applicable; no denoiser used by the Eevee still pipeline",
            "color_management": cfg.COLOR_MANAGEMENT,
            "image_format": "PNG RGB 8-bit",
            "engine_decision": cfg.RENDER_ENGINE_DECISION,
        },
        "camera_path": {
            "measurements": path_measurements,
            "arrival_to_near_frontal_power_arc_degrees": round(
                abs(camera_azimuth("Camera_Power_Front") - arrival), 6
            ),
            "arrival_to_portal_close_arc_degrees": round(
                abs(camera_azimuth("Camera_Portal_03_CloseApproach") - arrival), 6
            ),
            "authorized_range_degrees": {"minimum": 20.0, "maximum": 30.0},
            "status": "PASS"
            if 20.0 <= abs(camera_azimuth("Camera_Power_Front") - arrival) <= 30.0
            else "FAIL",
        },
        "mobile_authority": {
            "authored_separately": True,
            "spiral_turns": cfg.refined.MOBILE_SPIRAL_TURNS,
            "collection": "MOBILE_2_25_TURN_SPIRAL_CABLE",
            "source_ids": ["source-mobile-dormant", "source-reduced-mobile-dormant"],
        },
        "power_on_authority": {
            "count": 7,
            "exact_ids": cfg.POWER_STATE_IDS,
            "records": power_records,
            "status": "PASS",
        },
        "portal_transition_authority": {
            "count": 8,
            "exact_ids": cfg.PORTAL_STATE_IDS,
            "records": portal_records,
            "physical_state_count": 6,
            "browser_state_count": 2,
            "status": "PARTIAL_PENDING_BROWSER_CAPTURE",
        },
        "full_animatic_created": False,
        "render_count": len(records),
        "records": records,
    }
    target = cfg.MANIFEST_DIR / "crt-canonical-render-manifest.json"
    target.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"QH_PHASE04_CRT_CANONICAL_RENDERS={len(records)}")
    print(f"QH_PHASE04_CRT_CANONICAL_MANIFEST={target.resolve()}")


if __name__ == "__main__":
    main()
