"""Machine-validate the final Phase 0.2 Blender source contract.

Run with Blender 5.2.0 LTS against the final `.blend`. The validator performs
semantic scene checks and writes the repository-relative validation manifest;
it does not render, mutate the source file, or create animation/video output.
"""

from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import bpy

sys.dont_write_bytecode = True

SCRIPT = Path(__file__).resolve()
PACKAGE = SCRIPT.parents[1]
FINAL_BLEND = PACKAGE / "source" / "field-unit-v2-integrated-aperture-chassis.blend"
PORTAL_LAYOUT = PACKAGE / "portal-layout.json"
OUTPUT = PACKAGE / "manifests" / "blender-source-validation.json"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rel(path: Path) -> str:
    return path.relative_to(PACKAGE).as_posix()


def driver_refresh() -> None:
    control = bpy.data.objects["CTRL_V2_StillStates"]
    for prop in ("conduction", "connector", "mechanical", "screen", "portal"):
        control[prop] = 0.0
    control.update_tag(refresh={"OBJECT"})
    bpy.context.scene.frame_set(bpy.context.scene.frame_current)
    bpy.context.view_layer.update()


def material_emission_strength(name: str) -> float:
    material = bpy.data.materials[name]
    shader = material.node_tree.nodes.get("Principled BSDF")
    socket = shader.inputs.get("Emission Strength")
    return float(socket.default_value) if socket else 0.0


def check(name: str, passed: bool, evidence: dict | str) -> dict:
    return {"name": name, "pass": bool(passed), "evidence": evidence}


def main() -> None:
    scene = bpy.context.scene
    driver_refresh()
    checks: list[dict] = []

    shell = bpy.data.objects.get("Chassis_IntegratedMonocoque")
    glass = bpy.data.objects.get("Aperture_OpticallyBlackGlass")
    shell_height = float(shell.dimensions.z) if shell else 0.0
    shell_width = float(shell.dimensions.x) if shell else 0.0
    aperture_diameter = float(glass.dimensions.x) if glass else 0.0
    aperture_ratio = aperture_diameter / shell_height if shell_height else 0.0
    checks.append(
        check(
            "integrated aperture and low-wide silhouette",
            bool(shell and glass and 0.40 <= aperture_ratio <= 0.55 and shell_width / shell_height >= 4.0),
            {
                "shell": shell.name if shell else None,
                "shell_width": round(shell_width, 6),
                "shell_height": round(shell_height, 6),
                "width_height_ratio": round(shell_width / shell_height, 6) if shell_height else None,
                "optical_glass_diameter": round(aperture_diameter, 6),
                "aperture_to_visible_front_height": round(aperture_ratio, 6),
                "target_aperture_ratio": [0.40, 0.55],
            },
        )
    )

    forbidden_names = ("torus", "bumper", "handle", "frontplug", "front_plug")
    forbidden_objects = [obj.name for obj in bpy.data.objects if any(token in obj.name.lower() for token in forbidden_names)]
    checks.append(check("no external torus, bumper, handle, or front plug", not forbidden_objects, {"matches": forbidden_objects}))

    sheath = bpy.data.objects.get("Cable_PhysicalGraphiteSheath")
    sheath_count = len([obj for obj in bpy.data.objects if obj.name.startswith("Cable_PhysicalGraphiteSheath")])
    checks.append(
        check(
            "one continuous 2.5-turn physical desktop cable",
            bool(sheath and sheath_count == 1 and abs(float(sheath.get("turns", 0.0)) - 2.5) < 1e-6 and sheath.get("outer_to_inner") is True),
            {
                "count": sheath_count,
                "turns": float(sheath.get("turns", 0.0)) if sheath else None,
                "outer_to_inner": bool(sheath.get("outer_to_inner")) if sheath else None,
            },
        )
    )

    fronts = [obj.name for obj in bpy.data.objects if obj.name.startswith("Cable_SingleConductionFront")]
    cores = [obj.name for obj in bpy.data.objects if obj.name.startswith("Cable_CumulativeConductor")]
    checks.append(check("one cumulative core and one cable-resident leading front", len(fronts) == 1 and len(cores) == 1, {"fronts": fronts, "cores": cores}))

    dormant_materials = [
        "Cable_WarmMagenta_Core",
        "Cable_SingleFront_Highlight",
        "Connector_Response_Light",
        "InternalTransfer_RestrainedLight",
        "PhysicalScreen_RestrainedWake",
        "PhysicalScreen_ChallengeWake",
        "PhysicalScreen_RouteWake",
        "PhysicalScreen_ReadyWake",
        "InnerOpticalRing_NeutralWake",
    ]
    dormant_values = {name: material_emission_strength(name) for name in dormant_materials}
    glass_material = bpy.data.materials.get("Aperture_DormantBlack_Glass")
    checks.append(
        check(
            "dormant state has zero authored emission and black optical glass",
            all(abs(value) <= 1e-9 for value in dormant_values.values()) and glass_material is not None,
            {"emission_strengths": dormant_values, "glass_material": glass_material.name if glass_material else None},
        )
    )

    mechanical = [obj.name for obj in bpy.data.objects if obj.name.startswith("MechanicalResponse_")]
    checks.append(
        check(
            "exactly one permitted mechanical response",
            mechanical == ["MechanicalResponse_InnerOpticalPartialRing"],
            {"count": len(mechanical), "objects": mechanical, "response": "recessed interrupted inner optical partial ring"},
        )
    )

    arc_cameras = []
    for index in range(1, 5):
        camera = bpy.data.objects.get(f"Camera_Arc_{index:02d}")
        if camera:
            arc_cameras.append({"name": camera.name, "degrees": float(camera.get("arc_degrees"))})
    degrees = [item["degrees"] for item in arc_cameras]
    arc = max(degrees) - min(degrees) if degrees else 0.0
    checks.append(check("four still cameras span a 27-degree arc", len(arc_cameras) == 4 and abs(arc - 27.0) < 1e-6, {"cameras": arc_cameras, "span_degrees": arc}))

    portal_sha = sha256(PORTAL_LAYOUT)
    checks.append(
        check(
            "shared authoritative portal layout is bound by SHA-256",
            scene.get("portal_layout_sha256") == portal_sha,
            {"scene_sha256": scene.get("portal_layout_sha256"), "file_sha256": portal_sha, "path": rel(PORTAL_LAYOUT)},
        )
    )

    linked_libraries = [library.filepath for library in bpy.data.libraries]
    external_images = [image.filepath for image in bpy.data.images if image.source == "FILE" and image.filepath]
    external_fonts = [font.filepath for font in bpy.data.fonts if font.filepath and font.filepath not in {"<builtin>", ""}]
    checks.append(
        check(
            "no external libraries, file images, or external fonts",
            not linked_libraries and not external_images and not external_fonts,
            {"libraries": linked_libraries, "file_images": external_images, "external_fonts": external_fonts},
        )
    )

    action_keyframes = 0
    for action in bpy.data.actions:
        for layer in action.layers:
            for strip in layer.strips:
                channelbag = getattr(strip, "channelbag", None)
                if channelbag:
                    for fcurve in channelbag.fcurves:
                        action_keyframes += len(fcurve.keyframe_points)
    sequence_count = 0
    if scene.sequence_editor:
        # Blender 5.2 renamed the sequence collection to `strips`; retain a
        # compatibility fallback so the validator is also readable by 4.x.
        sequence_collection = getattr(scene.sequence_editor, "strips", None)
        if sequence_collection is None:
            sequence_collection = getattr(scene.sequence_editor, "sequences_all", ())
        sequence_count = len(sequence_collection)
    checks.append(
        check(
            "still-only source has no keyframed animatic, VSE sequence, or video output",
            action_keyframes == 0 and sequence_count == 0 and scene.render.image_settings.file_format == "PNG",
            {
                "action_keyframes": action_keyframes,
                "sequence_count": sequence_count,
                "render_format": scene.render.image_settings.file_format,
                "frame_end_not_used_as_deliverable": scene.frame_end,
                "full_animatic_created": False,
            },
        )
    )

    volume = scene.world.node_tree.nodes.get("Neutral_ProvingGround_Depth") if scene.world and scene.world.use_nodes else None
    checks.append(
        check(
            "restrained neutral atmosphere is present",
            bool(volume and float(volume.inputs["Density"].default_value) <= 0.01),
            {
                "node": volume.name if volume else None,
                "density": float(volume.inputs["Density"].default_value) if volume else None,
                "color": list(volume.inputs["Color"].default_value) if volume else None,
            },
        )
    )

    checks.append(
        check(
            "EEVEE still contract",
            scene.render.engine == "BLENDER_EEVEE" and scene.eevee.taa_render_samples == 48,
            {
                "engine": scene.render.engine,
                "taa_render_samples": scene.eevee.taa_render_samples,
                "volumetric_samples": scene.eevee.volumetric_samples,
                "cycles_comparison_claimed": False,
                "selection_rationale": "smooth/subdivided/beveled principal surfaces showed no review-resolution faceting; a Cycles pass was not materially necessary for this still gate",
            },
        )
    )

    passed = all(item["pass"] for item in checks)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    manifest = {
        "schema": "quantum-hub.phase-0-3d-repair-v2.blender-source-validation.v1",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "pass": passed,
        "source": {"path": rel(FINAL_BLEND), "bytes": FINAL_BLEND.stat().st_size, "sha256": sha256(FINAL_BLEND)},
        "validator": {"path": rel(SCRIPT), "sha256": sha256(SCRIPT)},
        "blender": {
            "version": bpy.app.version_string,
            "build_hash": bpy.app.build_hash.decode("utf-8"),
            "engine": scene.render.engine,
        },
        "checks": checks,
    }
    OUTPUT.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"QH_V2_VALIDATION_PASS={passed}")
    print(f"QH_V2_VALIDATION_CHECKS={len(checks)}")
    print(f"QH_V2_VALIDATION_MANIFEST={OUTPUT.resolve()}")
    if not passed:
        for item in checks:
            if not item["pass"]:
                print(f"FAILED: {item['name']}: {item['evidence']}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
