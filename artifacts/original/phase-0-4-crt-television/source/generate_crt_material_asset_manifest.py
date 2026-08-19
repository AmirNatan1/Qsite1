"""Generate the governed material and asset inventory for the refined CRT source."""

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


ROLE_MATERIALS = {
    "cabinet": "CRT_CaredForCharcoalABS",
    "secondary cabinet": "CRT_SecondaryMouldedABS",
    "bezel": "CRT_ThickProtectiveBezelABS",
    "gasket": "CRT_GlassPerimeterGasket",
    "glass": "CRT_ThickSmokedGlass",
    "phosphor dormant": "CRT_PhosphorOff",
    "phosphor active": "CRT_PhosphorLowGrey",
    "wake": "CRT_WakeLineEmission",
    "interface": "CRT_PhysicalSignalInterface",
    "controls": "CRT_EraPhysicalControlCaps",
    "indicator dormant": "CRT_PowerIndicatorOff",
    "indicator active": "CRT_PowerIndicatorWarmMagenta",
    "speaker and vent cavity": "CRT_VentSpeakerCavity",
    "graphite sheath": "SpiralCable_GraphiteSheath",
    "conductor cavity": "SpiralCable_InactiveInternalChannel",
    "conductor inactive": "SpiralCable_InactiveInternalChannel",
    "conductor energized trail": "SpiralCable_EnergizedTrail",
    "conductor advancing front": "SpiralCable_ModestlyBrighterFront",
    "terrain": "ProvingGround_DarkAggregateTerrain",
    "service plate": "ProvingGround_ServicePlate",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_record(path: Path) -> dict:
    return {
        "package_relative_path": path.relative_to(cfg.PACKAGE_DIR).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def input_value(node, names: tuple[str, ...], default: float = 0.0) -> float:
    for name in names:
        if name in node.inputs:
            return float(node.inputs[name].default_value)
    return default


def main() -> None:
    records = []
    missing = []
    for role, name in ROLE_MATERIALS.items():
        material = bpy.data.materials.get(name)
        if material is None:
            missing.append(name)
            continue
        image_nodes = (
            [node for node in material.node_tree.nodes if node.bl_idname == "ShaderNodeTexImage"]
            if material.use_nodes and material.node_tree
            else []
        )
        assigned_objects = sorted(
            obj.name
            for obj in bpy.data.objects
            if any(slot.material == material for slot in obj.material_slots)
        )
        records.append(
            {
                "role": role,
                "name": name,
                "node_based": bool(material.use_nodes),
                "procedural": len(image_nodes) == 0,
                "external_texture_count": len(image_nodes),
                "image_texture_nodes": len(image_nodes),
                "assigned_object_count": len(assigned_objects),
                "assigned_objects": assigned_objects,
            }
        )

    if missing:
        raise RuntimeError(f"required governed materials are missing: {missing}")
    external_images = len(bpy.data.images)
    image_texture_nodes = sum(item["image_texture_nodes"] for item in records)
    cabinet = bpy.data.materials["CRT_CaredForCharcoalABS"]
    cabinet_nodes = cabinet.node_tree.nodes
    cabinet_shader = cabinet_nodes.get("Principled BSDF")
    noise = next((node for node in cabinet_nodes if node.bl_idname == "ShaderNodeTexNoise"), None)
    bump = next((node for node in cabinet_nodes if node.bl_idname == "ShaderNodeBump"), None)
    if cabinet_shader is None or noise is None or bump is None:
        raise RuntimeError("evaluated ABS material omits required Principled/noise/bump topology")
    abs_quality = {
        "status": "PASS",
        "pass": True,
        "material": cabinet.name,
        "evaluated_from_blend": True,
        "node_types": sorted({node.bl_idname for node in cabinet_nodes}),
        "roughness": input_value(cabinet_shader, ("Roughness",)),
        "specular_ior_level": input_value(cabinet_shader, ("Specular IOR Level", "IOR Level", "Specular")),
        "bump_strength": input_value(bump, ("Strength",)),
        "bump_distance": input_value(bump, ("Distance",)),
        "grain_scale": input_value(noise, ("Scale",)),
        "grain_detail": input_value(noise, ("Detail",)),
        "grain_roughness": input_value(noise, ("Roughness",)),
    }
    manifest = {
        "schema": "quantum-hub.phase-0-4-crt-television.material-and-asset.v1",
        "status": "PASS",
        "repair_baseline": "fec1f0e9243a9cda188c539ab1b79e4a99c30623",
        "selected_option": "A",
        "selected_design": "Rounded 1990s domestic CRT",
        "source": file_record(cfg.REFINED_BLEND),
        "builder": file_record(SCRIPT_DIR / "build_refined_crt.py"),
        "renderer": file_record(SCRIPT_DIR / "render_crt_canonical_stills.py"),
        "cycles_renderer": file_record(SCRIPT_DIR / "render_crt_cycles_masters.py"),
        "validator": file_record(SCRIPT_DIR / "validate_refined_crt_source.py"),
        "manifest_generator": file_record(Path(__file__).resolve()),
        "procedural_only": external_images == 0 and image_texture_nodes == 0,
        "external_texture_count": external_images,
        "external_model_count": int(bpy.context.scene.get("third_party_models", -1)),
        "private_reference_loaded": bool(
            bpy.context.scene.get("private_reference_loaded_in_blender", False)
        ),
        "material_count": len(records),
        "materials": records,
        "phase_0_4r_quality": {
            "abs_node_topology": abs_quality,
            "material_quality_authority": "eight exact-source deterministic Cycles masters",
            "supplemental_state_authority": "Eevee camera/cable/power/browser-source stills",
        },
    }
    if (
        not manifest["procedural_only"]
        or manifest["external_texture_count"] != 0
        or manifest["external_model_count"] != 0
        or manifest["private_reference_loaded"]
    ):
        raise RuntimeError("material or asset provenance boundary failed")
    target = cfg.MANIFEST_DIR / "crt-material-and-asset-manifest.json"
    target.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"QH_PHASE04_CRT_MATERIALS={len(records)}")
    print("QH_PHASE04_CRT_PROCEDURAL_ONLY=True")
    print(f"QH_PHASE04_CRT_MATERIAL_ASSET_MANIFEST={target.resolve()}")


if __name__ == "__main__":
    main()
