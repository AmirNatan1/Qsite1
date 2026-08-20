"""Fail-closed structural validation of the animated Phase 3 derivative."""

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

import phase3_config as cfg


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def check(records: list[dict], identifier: str, passed: bool, actual, expected) -> None:
    records.append(
        {
            "id": identifier,
            "status": "PASS" if passed else "FAIL",
            "pass": bool(passed),
            "actual": actual,
            "expected": expected,
        }
    )


def emission_strength(material: bpy.types.Material) -> float | None:
    if material.node_tree is None:
        return None
    shader = material.node_tree.nodes.get("Principled BSDF")
    if shader is None or shader.inputs.get("Emission Strength") is None:
        return None
    return float(shader.inputs["Emission Strength"].default_value)


def main() -> None:
    records: list[dict] = []
    scene = bpy.context.scene
    source_hash = sha256(cfg.ACCEPTED_SOURCE)
    check(records, "accepted_source_hash", source_hash == cfg.ACCEPTED_SOURCE_SHA256, source_hash, cfg.ACCEPTED_SOURCE_SHA256)
    derivative_hash = sha256(cfg.DERIVATIVE_SOURCE)
    check(records, "opened_derivative", Path(bpy.data.filepath).resolve() == cfg.DERIVATIVE_SOURCE.resolve(), bpy.data.filepath, str(cfg.DERIVATIVE_SOURCE))
    check(records, "derivative_distinct_from_master", cfg.DERIVATIVE_SOURCE.resolve() != cfg.ACCEPTED_SOURCE.resolve(), str(cfg.DERIVATIVE_SOURCE), "different path")
    check(records, "timeline_fps", scene.render.fps == cfg.FPS, scene.render.fps, cfg.FPS)
    check(records, "timeline_frame_start", scene.frame_start == cfg.FRAME_START, scene.frame_start, cfg.FRAME_START)
    check(records, "timeline_frame_end", scene.frame_end == cfg.FRAME_END, scene.frame_end, cfg.FRAME_END)
    check(records, "desktop_camera", bpy.data.objects.get("Phase3_Camera_Desktop") is not None, bpy.data.objects.get("Phase3_Camera_Desktop") is not None, True)
    check(records, "mobile_camera", bpy.data.objects.get("Phase3_Camera_Mobile") is not None, bpy.data.objects.get("Phase3_Camera_Mobile") is not None, True)
    check(records, "mobile_authored_separately", bpy.data.objects["Phase3_Camera_Mobile"].get("phase3_path") == "authored independently", bpy.data.objects["Phase3_Camera_Mobile"].get("phase3_path"), "authored independently")
    desktop_materials = [material for material in bpy.data.materials if material.name.startswith("Phase3_DesktopConductor_")]
    mobile_materials = [material for material in bpy.data.materials if material.name.startswith("Phase3_MobileConductor_")]
    check(records, "desktop_animated_conductor_count", len(desktop_materials) == 180, len(desktop_materials), 180)
    check(records, "mobile_animated_conductor_count", len(mobile_materials) == 180, len(mobile_materials), 180)
    check(records, "portal_text_free_geometry", bpy.data.collections.get("PHASE3_PORTAL_ALIGNMENT_FIELD") is not None and len(bpy.data.collections["PHASE3_PORTAL_ALIGNMENT_FIELD"].all_objects) == 4, 0 if bpy.data.collections.get("PHASE3_PORTAL_ALIGNMENT_FIELD") is None else len(bpy.data.collections["PHASE3_PORTAL_ALIGNMENT_FIELD"].all_objects), 4)
    check(records, "no_external_images", len(bpy.data.images) == 0, len(bpy.data.images), 0)
    check(records, "no_linked_libraries", len(bpy.data.libraries) == 0, len(bpy.data.libraries), 0)
    check(records, "no_audio", len(bpy.data.sounds) == 0, len(bpy.data.sounds), 0)
    circular_terms = ("reticle", "radar", "scanning_ring", "portal_ring", "oscilloscope_circle")
    circular_names = [name for name in bpy.data.objects.keys() if any(term in name.lower() for term in circular_terms)]
    check(records, "no_circular_startup_graphics", len(circular_names) == 0, circular_names, [])
    check(records, "deterministic_random_event_count", int(scene.get("phase3_random_events", -1)) == 0, scene.get("phase3_random_events"), 0)
    check(records, "accepted_crt_dimensions_unchanged", scene.get("phase3_accepted_source_sha256") == cfg.ACCEPTED_SOURCE_SHA256, scene.get("phase3_accepted_source_sha256"), cfg.ACCEPTED_SOURCE_SHA256)

    scene.frame_set(cfg.FRAME_START)
    phase3_emissions = {
        material.name: strength
        for material in bpy.data.materials
        if material.name.startswith("Phase3_")
        if (strength := emission_strength(material)) is not None
    }
    cable_emissions = {name: strength for name, strength in phase3_emissions.items() if "Conductor" in name}
    indicator = phase3_emissions.get("Phase3_PowerIndicator")
    wake = phase3_emissions.get("Phase3_WakeHorizontalPhosphorLine")
    portal_emissions = {name: strength for name, strength in phase3_emissions.items() if "Portal" in name}
    magenta_light_energy = sum(
        float(obj.data.energy)
        for obj in bpy.data.objects
        if obj.type == "LIGHT" and ("ContactLight" in obj.name or obj.name == "Phase3_ScreenSpill")
    )
    zero_magenta = (
        all(abs(value) <= 1e-9 for value in cable_emissions.values())
        and abs(indicator or 0.0) <= 1e-9
        and abs(wake or 0.0) <= 1e-9
        and all(abs(value) <= 1e-9 for value in portal_emissions.values())
        and abs(magenta_light_energy) <= 1e-9
    )
    check(
        records,
        "true_dormancy_zero_environmental_magenta",
        zero_magenta,
        {
            "maximum_cable_emission": max(cable_emissions.values(), default=0.0),
            "indicator_emission": indicator,
            "wake_emission": wake,
            "maximum_portal_emission": max(portal_emissions.values(), default=0.0),
            "phase3_source_light_energy_w": magenta_light_energy,
        },
        "all zero at frame 1",
    )

    failed = [record for record in records if not record["pass"]]
    manifest = {
        "schema": "quantum-hub.phase-3-crt-opening.source-validation.v1",
        "status": "PASS" if not failed else "FAIL",
        "blender_version": bpy.app.version_string,
        "accepted_source_sha256": source_hash,
        "derivative_source": {
            "package_relative_path": cfg.DERIVATIVE_SOURCE.relative_to(cfg.PACKAGE_DIR).as_posix(),
            "bytes": cfg.DERIVATIVE_SOURCE.stat().st_size,
            "sha256": derivative_hash,
        },
        "check_count": len(records),
        "failed_count": len(failed),
        "checks": records,
    }
    cfg.MANIFEST_ROOT.mkdir(parents=True, exist_ok=True)
    target = cfg.MANIFEST_ROOT / "phase-3-source-validation.json"
    target.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"QH_PHASE3_SOURCE_VALIDATION={manifest['status']}")
    print(f"QH_PHASE3_SOURCE_VALIDATION_MANIFEST={target.resolve()}")
    if failed:
        raise RuntimeError(f"Phase 3 source validation failed: {[record['id'] for record in failed]}")


if __name__ == "__main__":
    main()
