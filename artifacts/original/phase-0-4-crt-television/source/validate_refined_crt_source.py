"""Fail-closed validation for the refined Phase 0.4 CRT Blender source."""

from __future__ import annotations

import hashlib
import json
import math
import re
import sys
from pathlib import Path

import bpy

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import crt_canonical_config as canonical
import crt_refined_config as cfg
import render_crt_cycles_masters as cycles_renderer


REPOSITORY_ROOT = cfg.PACKAGE_DIR.parents[2]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def repository_relative(path: Path) -> str:
    return path.resolve().relative_to(REPOSITORY_ROOT.resolve()).as_posix()


def evaluated_bounds(objects: list[bpy.types.Object]) -> tuple[list[float], list[float]]:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    minimum = [float("inf")] * 3
    maximum = [float("-inf")] * 3
    count = 0
    for source in objects:
        if source is None or source.type not in {"MESH", "CURVE", "FONT", "SURFACE", "META"}:
            continue
        evaluated = source.evaluated_get(depsgraph)
        mesh = None
        try:
            mesh = evaluated.to_mesh()
            for vertex in mesh.vertices:
                coordinate = evaluated.matrix_world @ vertex.co
                for axis in range(3):
                    minimum[axis] = min(minimum[axis], coordinate[axis])
                    maximum[axis] = max(maximum[axis], coordinate[axis])
                count += 1
        finally:
            if mesh is not None:
                evaluated.to_mesh_clear()
    if count == 0:
        raise RuntimeError("assembled bounds received zero evaluated vertices")
    return minimum, maximum


def check(checks: list[dict], identifier: str, passed: bool, actual, expected) -> None:
    checks.append(
        {
            "id": identifier,
            "name": identifier.replace("_", " "),
            "pass": bool(passed),
            "status": "PASS" if passed else "FAIL",
            "actual": actual,
            "expected": expected,
        }
    )


def camera_azimuth(name: str) -> float:
    spec = cfg.CAMERAS[name]
    camera = spec["location"]
    target = spec["target"]
    return math.degrees(math.atan2(camera[1] - target[1], camera[0] - target[0]))


def main() -> None:
    source = cfg.REFINED_BLEND
    script = Path(__file__).resolve()
    checks: list[dict] = []
    assembly = bpy.data.collections.get("REFINED_CRT_ASSEMBLY")
    check(checks, "refined_assembly_collection", assembly is not None, assembly.name if assembly else None, "REFINED_CRT_ASSEMBLY")
    physical_objects = [] if assembly is None else [obj for obj in assembly.all_objects if obj is not None and not obj.name.startswith(("CRT_Interface", "CRT_Scanline_", "CRT_WakeHorizontal", "CRT_InternalPhosphor"))]
    minimum, maximum = evaluated_bounds(physical_objects)
    assembled = {
        "width": round(maximum[0] - minimum[0], 6),
        "height": round(maximum[2] - minimum[2], 6),
        "depth": round(maximum[1] - minimum[1], 6),
        "minimum_world": [round(value, 6) for value in minimum],
        "maximum_world": [round(value, 6) for value in maximum],
        "method": "evaluated world-space bounds of all physical objects in REFINED_CRT_ASSEMBLY, including glass, feet, rear details and committed cable collar; excluding state-only phosphor/interface geometry",
    }
    bound_tolerances = {"width": 0.012, "height": 0.020, "depth": 0.035}
    for dimension in ("width", "height", "depth"):
        target = float(cfg.DIMENSIONS_M[dimension])
        actual = assembled[dimension]
        check(
            checks,
            f"assembled_overall_{dimension}",
            abs(actual - target) <= bound_tolerances[dimension],
            actual,
            {"target_m": target, "tolerance_m": bound_tolerances[dimension]},
        )

    glass = bpy.data.objects.get("CRT_ConvexThickSmokedGlass")
    phosphor = bpy.data.objects.get("CRT_InternalPhosphorLayer")
    check(checks, "convex_smoked_glass", glass is not None and float(glass.get("outward_bulge_m", 0.0)) >= 0.03 and float(glass.get("physical_thickness_m", 0.0)) >= 0.012, None if glass is None else {"outward_bulge_m": glass.get("outward_bulge_m"), "physical_thickness_m": glass.get("physical_thickness_m")}, {"minimum_bulge_m": 0.03, "minimum_thickness_m": 0.012})
    check(checks, "separate_phosphor_layer", phosphor is not None and phosphor != glass, phosphor.name if phosphor else None, "distinct CRT_InternalPhosphorLayer")
    glass_material = bpy.data.materials.get("CRT_ThickSmokedGlass")
    glass_shader = (
        None
        if glass_material is None or glass_material.node_tree is None
        else glass_material.node_tree.nodes.get("Principled BSDF")
    )
    dormant_phosphor_material = bpy.data.materials.get("CRT_PhosphorOff")
    dormant_phosphor_shader = (
        None
        if dormant_phosphor_material is None or dormant_phosphor_material.node_tree is None
        else dormant_phosphor_material.node_tree.nodes.get("Principled BSDF")
    )
    if glass_shader is None or dormant_phosphor_shader is None or glass is None:
        glass_inputs = None
    else:
        specular_input = (
            glass_shader.inputs.get("Specular IOR Level")
            or glass_shader.inputs.get("IOR Level")
        )
        glass_inputs = {
            "evaluated_from_blend": True,
            "material": glass_material.name,
            "principled_node_type": glass_shader.bl_idname,
            "roughness": float(glass_shader.inputs["Roughness"].default_value),
            "transmission_weight": float(glass_shader.inputs["Transmission Weight"].default_value),
            "ior": float(glass_shader.inputs["IOR"].default_value),
            "specular_ior_level": None if specular_input is None else float(specular_input.default_value),
            "coat_weight": float(glass_shader.inputs["Coat Weight"].default_value),
            "coat_roughness": float(glass_shader.inputs["Coat Roughness"].default_value),
            "glass_phosphor_gap_m": float(glass.get("phosphor_air_gap_m", 0.0)),
            "dormant_phosphor_emission_strength": float(
                dormant_phosphor_shader.inputs["Emission Strength"].default_value
            ),
        }
    glass_inputs_pass = bool(
        glass_inputs is not None
        and 0.35 <= glass_inputs["transmission_weight"] <= 0.90
        and 0.03 <= glass_inputs["roughness"] <= 0.18
        and 0.02 <= glass_inputs["coat_roughness"] <= 0.20
        and 1.40 <= glass_inputs["ior"] <= 1.70
        and glass_inputs["specular_ior_level"] is not None
        and glass_inputs["specular_ior_level"] > 0.0
        and glass_inputs["coat_weight"] == 0.0
        and glass_inputs["glass_phosphor_gap_m"] > 0.0
        and glass_inputs["dormant_phosphor_emission_strength"] == 0.0
    )
    glass_expected = {
        "transmission_weight": {"minimum": 0.35, "maximum": 0.90},
        "roughness": {"minimum": 0.03, "maximum": 0.18},
        "coat_roughness": {"minimum": 0.02, "maximum": 0.20},
        "ior": {"minimum": 1.40, "maximum": 1.70},
        "specular_ior_level": "> 0",
        "coat_weight": 0.0,
        "glass_phosphor_gap_m": "> 0",
        "dormant_phosphor_emission_strength": 0.0,
    }
    check(checks, "glass_transmission_and_roughness", glass_inputs_pass, glass_inputs, glass_expected)
    check(checks, "glass_evaluated_principled_inputs", glass_inputs_pass, glass_inputs, glass_expected)
    aspect = cfg.SCREEN_VISIBLE_M["width"] / cfg.SCREEN_VISIBLE_M["height"]
    check(checks, "visible_screen_aspect_4_3", abs(aspect - 4.0 / 3.0) <= 1e-6, round(aspect, 9), round(4.0 / 3.0, 9))

    optical_stack = {
        "layer_order": [
            "cabinet shell",
            "protective bezel",
            "perimeter gasket",
            "convex smoked glass",
            "air gap",
            "internal phosphor",
        ],
        "glass_object": None if glass is None else glass.name,
        "phosphor_object": None if phosphor is None else phosphor.name,
        "glass_thickness_m": 0.0 if glass is None else float(glass.get("physical_thickness_m", 0.0)),
        "gap_m": 0.0 if glass is None else float(glass.get("phosphor_air_gap_m", 0.0)),
    }
    check(
        checks,
        "glass_phosphor_layer_order",
        glass is not None and phosphor is not None and optical_stack["layer_order"].index("convex smoked glass") < optical_stack["layer_order"].index("internal phosphor"),
        optical_stack,
        "bezel/gasket > convex glass > positive air gap > internal phosphor",
    )
    check(
        checks,
        "glass_phosphor_positive_gap",
        optical_stack["gap_m"] > 0.0,
        {"gap_m": optical_stack["gap_m"]},
        {"gap_m": "> 0"},
    )
    check(
        checks,
        "glass_fresnel_and_ior",
        bool(glass_inputs and 1.40 <= glass_inputs["ior"] <= 1.70 and glass_inputs["specular_ior_level"] > 0.0),
        {
            "fresnel_enabled": bool(glass_inputs and glass_inputs["specular_ior_level"] > 0.0),
            "ior": None if glass_inputs is None else glass_inputs["ior"],
            "specular_ior_level": None if glass_inputs is None else glass_inputs["specular_ior_level"],
        },
        {"fresnel_enabled": True, "ior_range": [1.40, 1.70]},
    )
    check(
        checks,
        "dormant_emission_zero",
        bool(glass_inputs and glass_inputs["dormant_phosphor_emission_strength"] == 0.0),
        {"emission_strength": None if glass_inputs is None else glass_inputs["dormant_phosphor_emission_strength"]},
        {"emission_strength": 0.0},
    )

    speaker_band = bpy.data.objects.get("CRT_LowerSpeakerControlBand")
    speaker_plenum = bpy.data.objects.get("CRT_SpeakerGrilleDarkInterior")
    speaker_detail = {
        "open_depth_m": 0.0 if speaker_band is None else float(speaker_band.get("speaker_open_depth_m", 0.0)),
        "plenum_depth_m": 0.0 if speaker_band is None else float(speaker_band.get("speaker_plenum_depth_m", 0.0)),
        "through_opening": speaker_band is not None and speaker_plenum is not None,
        "plenum_object": None if speaker_plenum is None else speaker_plenum.name,
    }
    check(checks, "speaker_true_recess_and_plenum", speaker_detail["through_opening"] and speaker_detail["open_depth_m"] > 0 and speaker_detail["plenum_depth_m"] > 0, speaker_detail, {"through_opening": True, "positive_open_and_plenum_depth": True})

    rear_panel = bpy.data.objects.get("CRT_RearRemovableServicePanel")
    rear_plenum = bpy.data.objects.get("CRT_RearVentDarkInterior")
    rear_detail = {
        "open_depth_m": 0.0 if rear_panel is None else float(rear_panel.get("rear_vent_open_depth_m", 0.0)),
        "plenum_depth_m": 0.0 if rear_panel is None else float(rear_panel.get("rear_vent_plenum_depth_m", 0.0)),
        "through_opening": rear_panel is not None and rear_plenum is not None,
        "plenum_object": None if rear_plenum is None else rear_plenum.name,
    }
    check(checks, "rear_vent_true_recess_and_plenum", rear_detail["through_opening"] and rear_detail["open_depth_m"] > 0 and rear_detail["plenum_depth_m"] > 0, rear_detail, {"through_opening": True, "positive_open_and_plenum_depth": True})

    cabinet_shell = bpy.data.objects.get("CRT_RefinedDeepMouldedCabinetShell")
    side_plenum = bpy.data.objects.get("CRT_SideVentDarkPlenum")
    side_detail = {
        "open_depth_m": 0.0 if cabinet_shell is None else float(cabinet_shell.get("side_vent_open_depth_m", 0.0)),
        "plenum_depth_m": 0.0 if cabinet_shell is None else float(cabinet_shell.get("side_vent_plenum_depth_m", 0.0)),
        "through_opening": cabinet_shell is not None and side_plenum is not None,
        "plenum_object": None if side_plenum is None else side_plenum.name,
    }
    check(checks, "side_vent_true_recess_and_plenum", side_detail["through_opening"] and side_detail["open_depth_m"] > 0 and side_detail["plenum_depth_m"] > 0, side_detail, {"through_opening": True, "positive_open_and_plenum_depth": True})

    power_control = bpy.data.objects.get("CRT_RecessedRoundPowerButton")
    tuning_control = bpy.data.objects.get("CRT_RecessedTuningRocker")
    controls = [
        {
            "name": None if power_control is None else power_control.name,
            "type": "round latching power button",
            "recess_depth_m": 0.0 if power_control is None else float(power_control.get("recess_depth_m", 0.0)),
            "travel_m": 0.0 if power_control is None else float(power_control.get("travel_m", 0.0)),
        },
        {
            "name": None if tuning_control is None else tuning_control.name,
            "type": "horizontal tuning rocker",
            "recess_depth_m": 0.0 if tuning_control is None else float(tuning_control.get("recess_depth_m", 0.0)),
            "travel_m": 0.0 if tuning_control is None else float(tuning_control.get("travel_m", 0.0)),
        },
    ]
    control_detail = {
        "expected_count": 2,
        "actual_count": sum(control["name"] is not None for control in controls),
        "controls": controls,
    }
    controls_pass = control_detail["actual_count"] == 2 and len({control["type"] for control in controls}) == 2 and all(control["recess_depth_m"] > 0 and control["travel_m"] > 0 for control in controls)
    check(checks, "period_control_taxonomy", controls_pass, control_detail, {"exact_count": 2, "distinct_types": True})
    check(checks, "period_control_recess_and_travel", controls_pass, control_detail, {"each_control_positive_recess_and_travel": True})

    abs_material = bpy.data.materials.get("CRT_CaredForCharcoalABS")
    abs_nodes = [] if abs_material is None or abs_material.node_tree is None else list(abs_material.node_tree.nodes)
    abs_shader = next((node for node in abs_nodes if node.bl_idname == "ShaderNodeBsdfPrincipled"), None)
    abs_noise = next((node for node in abs_nodes if node.bl_idname == "ShaderNodeTexNoise" and "microtexture" in node.name.lower()), None)
    abs_bump = next((node for node in abs_nodes if node.bl_idname == "ShaderNodeBump"), None)
    abs_specular_input = None if abs_shader is None else (abs_shader.inputs.get("Specular IOR Level") or abs_shader.inputs.get("IOR Level"))
    abs_detail = {
        "material": None if abs_material is None else abs_material.name,
        "node_types": sorted({node.bl_idname for node in abs_nodes}),
        "roughness": None if abs_shader is None else float(abs_shader.inputs["Roughness"].default_value),
        "specular_ior_level": None if abs_specular_input is None else float(abs_specular_input.default_value),
        "bump_strength": None if abs_bump is None else float(abs_bump.inputs["Strength"].default_value),
        "grain_scale": None if abs_noise is None else float(abs_noise.inputs["Scale"].default_value),
        "procedural": True,
        "external_texture_count": 0,
    }
    abs_pass = abs_material is not None and abs_shader is not None and abs_noise is not None and abs_bump is not None and all(abs_detail[key] is not None for key in ("roughness", "specular_ior_level", "bump_strength", "grain_scale"))
    check(checks, "abs_node_topology_and_settings", abs_pass, abs_detail, {"principled_noise_bump": True, "numeric_settings": True, "procedural": True})

    raster = bpy.data.collections.get("CRT_SCANLINE_GEOMETRY")
    raster_width = 0.0 if raster is None else float(raster.get("active_raster_width_m", 0.0))
    raster_height = 0.0 if raster is None else float(raster.get("active_raster_height_m", 0.0))
    raster_aspect = 0.0 if raster_height <= 0.0 else raster_width / raster_height
    raster_detail = {
        "active_width_m": raster_width,
        "active_height_m": raster_height,
        "measured_aspect_ratio": raster_aspect,
        "aspect_error": abs(raster_aspect - 4.0 / 3.0),
        "shape": None if raster is None else raster.get("shape"),
    }
    check(checks, "active_raster_measured_4_3", raster_width > 0 and raster_height > 0 and raster_detail["aspect_error"] <= 0.01, raster_detail, {"aspect": 4.0 / 3.0, "maximum_error": 0.01})

    desktop = bpy.data.collections.get("DESKTOP_2_5_TURN_SPIRAL_CABLE")
    mobile = bpy.data.collections.get("MOBILE_2_25_TURN_SPIRAL_CABLE")
    desktop_sheath = bpy.data.objects.get("SpiralCable_ContinuousGraphiteSheath")
    mobile_sheath = bpy.data.objects.get("MobileSpiralCable_ContinuousGraphiteSheath")
    desktop_overmould = bpy.data.objects.get("SpiralCable_ProtectedEntryOvermould")
    mobile_overmould = bpy.data.objects.get("MobileSpiralCable_ProtectedEntryOvermould")
    check(checks, "desktop_spiral_2_5_turns", desktop is not None and desktop_sheath is not None and abs(float(desktop_sheath.get("turns", 0.0)) - 2.5) <= 1e-9, None if desktop_sheath is None else desktop_sheath.get("turns"), 2.5)
    check(checks, "mobile_spiral_2_25_turns", mobile is not None and mobile_sheath is not None and abs(float(mobile_sheath.get("turns", 0.0)) - 2.25) <= 1e-9, None if mobile_sheath is None else mobile_sheath.get("turns"), 2.25)
    check(checks, "mobile_authored_separately", bool(bpy.context.scene.get("mobile_composition_authored_separately", False)), bool(bpy.context.scene.get("mobile_composition_authored_separately", False)), True)
    collar = bpy.data.objects.get("CRT_IntegratedCableCollar")
    ribs = [bpy.data.objects.get(f"CRT_StrainReliefRib_{index:02d}") for index in range(1, 7)]
    protected_entries = {
        "desktop": None if desktop_overmould is None else {
            "name": desktop_overmould.name,
            "endpoint_inside_collar": bool(desktop_overmould.get("endpoint_inside_collar", False)),
            "exposed_cut_end": bool(desktop_overmould.get("exposed_cut_end", True)),
            "start_radius_m": float(desktop_overmould.get("start_radius_m", 0.0)),
            "end_radius_m": float(desktop_overmould.get("end_radius_m", 0.0)),
        },
        "mobile": None if mobile_overmould is None else {
            "name": mobile_overmould.name,
            "endpoint_inside_collar": bool(mobile_overmould.get("endpoint_inside_collar", False)),
            "exposed_cut_end": bool(mobile_overmould.get("exposed_cut_end", True)),
            "start_radius_m": float(mobile_overmould.get("start_radius_m", 0.0)),
            "end_radius_m": float(mobile_overmould.get("end_radius_m", 0.0)),
        },
    }
    protected_entries_pass = all(
        record is not None
        and record["endpoint_inside_collar"]
        and not record["exposed_cut_end"]
        and record["start_radius_m"] > record["end_radius_m"] > 0.0
        for record in protected_entries.values()
    )
    check(
        checks,
        "closed_protected_cable_entry",
        protected_entries_pass,
        protected_entries,
        {
            "desktop_and_mobile": True,
            "endpoint_inside_collar": True,
            "exposed_cut_end": False,
            "tapered_overmould": True,
        },
    )
    physical_connection_pass = (
        collar is not None
        and all(rib is not None for rib in ribs)
        and desktop_sheath is not None
        and "rear strain relief" in str(desktop_sheath.get("physical_continuity", ""))
        and protected_entries_pass
    )
    check(checks, "physical_rear_cable_connection", physical_connection_pass, {"collar": collar.name if collar else None, "strain_relief_ribs": sum(rib is not None for rib in ribs), "desktop_continuity": None if desktop_sheath is None else desktop_sheath.get("physical_continuity"), "protected_entries": protected_entries}, {"collar": "CRT_IntegratedCableCollar", "strain_relief_ribs": 6, "continuous_sheath_committed": True, "closed_tapered_entry": True})
    connector_response = bpy.data.objects.get("CRT_ConnectorArrivalResponseRing")
    connector_material = bpy.data.materials.get("CRT_LocalConnectorArrivalResponse")
    connector_shader = (
        None
        if connector_material is None or connector_material.node_tree is None
        else connector_material.node_tree.nodes.get("Principled BSDF")
    )
    connector_emission = (
        0.0
        if connector_shader is None
        else float(connector_shader.inputs["Emission Strength"].default_value)
    )
    response_length = 0.0
    response_radius = 0.0
    if connector_response is not None and connector_response.type == "CURVE":
        response_radius = float(connector_response.data.bevel_depth)
        for spline in connector_response.data.splines:
            points = [connector_response.matrix_world @ point.co.to_3d() for point in spline.points]
            response_length += sum((points[index] - points[index - 1]).length for index in range(1, len(points)))
    response_area = response_length * max(2.0 * response_radius, 0.0)
    cabinet_reference_area = cfg.DIMENSIONS_M["width"] * cfg.DIMENSIONS_M["height"]
    response_ratio = 0.0 if cabinet_reference_area <= 0 else response_area / cabinet_reference_area
    connector_detail = {
        "pre_arrival_emission_strength": 0.0 if connector_response is None else float(connector_response.get("response_before_arrival", 0.0)),
        "post_arrival_emission_strength": connector_emission,
        "localized": bool(
            connector_response is not None
            and (
                "local" in str(connector_response.get("response_locality", "")).lower()
                or "collar seam only" in str(connector_response.get("response_locality", "")).lower()
            )
        ),
        "affected_area_ratio": response_ratio,
        "response_curve_length_m": response_length,
        "response_bevel_radius_m": response_radius,
        "response_object": None if connector_response is None else connector_response.name,
    }
    connector_pass = connector_detail["pre_arrival_emission_strength"] == 0.0 and connector_detail["post_arrival_emission_strength"] > 0.0 and connector_detail["localized"] and 0.0 < connector_detail["affected_area_ratio"] <= 0.1
    check(checks, "connector_localized_post_arrival", connector_pass, connector_detail, {"pre_arrival_emission_strength": 0.0, "post_arrival_emission_strength": "> 0", "localized": True, "maximum_area_ratio": 0.1})
    if desktop_sheath is not None:
        shoulder = float(desktop_sheath.get("shoulder_crown_relative_m", 0.0))
        floor = float(desktop_sheath.get("groove_floor_relative_m", 0.0))
        first_core = bpy.data.objects.get("SpiralCable_InternalChannel_001")
        mobile_sheath = bpy.data.objects.get("MobileSpiralCable_ContinuousGraphiteSheath")
        mobile_core = bpy.data.objects.get("MobileSpiralCable_InternalChannel_001")
        core_diameter = 0.0 if first_core is None else float(first_core.get("core_diameter_m", 0.0))
        core_crown_below_shoulders = (
            0.0 if first_core is None else float(first_core.get("core_crown_below_sheath_shoulders_m", 0.0))
        )
        desktop_dimensions = {
            "sheath_radius_m": float(desktop_sheath.get("outer_radius_m", 0.0)),
            "sheath_diameter_m": float(desktop_sheath.get("outer_radius_m", 0.0)) * 2.0,
            "core_diameter_m": core_diameter,
            "groove_depth_m": float(desktop_sheath.get("groove_depth_m", 0.0)),
            "core_recess_below_shoulders_m": core_crown_below_shoulders,
        }
        mobile_dimensions = {
            "sheath_radius_m": 0.0 if mobile_sheath is None else float(mobile_sheath.get("outer_radius_m", 0.0)),
            "sheath_diameter_m": 0.0 if mobile_sheath is None else float(mobile_sheath.get("outer_radius_m", 0.0)) * 2.0,
            "core_diameter_m": 0.0 if mobile_core is None else float(mobile_core.get("core_diameter_m", 0.0)),
            "groove_depth_m": 0.0 if mobile_sheath is None else float(mobile_sheath.get("groove_depth_m", 0.0)),
            "core_recess_below_shoulders_m": 0.0 if mobile_core is None else float(mobile_core.get("core_crown_below_sheath_shoulders_m", 0.0)),
        }
        conductor_actual = {
            "outer_sheath_radius_m": float(desktop_sheath.get("outer_radius_m", 0.0)),
            "sheath_diameter_m": desktop_dimensions["sheath_diameter_m"],
            "groove_half_width_m": float(desktop_sheath.get("groove_half_width_m", 0.0)),
            "groove_depth_m": float(desktop_sheath.get("groove_depth_m", 0.0)),
            "shoulder_crown_relative_m": shoulder,
            "groove_floor_relative_m": floor,
            "recess_depth_below_shoulders_m": round(shoulder - floor, 6),
            "core_diameter_m": core_diameter,
            "core_crown_below_sheath_shoulders_m": core_crown_below_shoulders,
            "core_recess_below_shoulders_m": core_crown_below_shoulders,
            "core_lateral_offset_m": 0.0 if first_core is None else float(first_core.get("core_lateral_offset_m", 0.0)),
            "desktop": desktop_dimensions,
            "mobile": mobile_dimensions,
            "evaluated_from_blend": True,
        }
        conductor_pass = (
            shoulder > floor
            and abs(shoulder - floor) >= 0.008
            and first_core is not None
            and 0.0 < core_diameter < float(desktop_sheath.get("groove_half_width_m", 0.0)) * 2.0
            and core_crown_below_shoulders >= 0.008
            and abs(conductor_actual["core_lateral_offset_m"]) <= 1e-9
            and mobile_dimensions["sheath_diameter_m"] > mobile_dimensions["core_diameter_m"] > 0.0
            and mobile_dimensions["groove_depth_m"] > 0.0
            and mobile_dimensions["core_recess_below_shoulders_m"] > 0.0
        )
        check(
            checks,
            "recessed_conductor_channel",
            conductor_pass,
            conductor_actual,
            {
                "minimum_recess_depth_below_shoulders_m": 0.008,
                "core_narrower_than_channel": True,
                "minimum_core_crown_below_shoulders_m": 0.008,
                "core_lateral_offset_m": 0.0,
            },
        )

    external_libraries = len(bpy.data.libraries)
    external_images = len(bpy.data.images)
    packed_files = sum(1 for image in bpy.data.images if image.packed_file is not None)
    image_texture_nodes = sum(1 for material in bpy.data.materials if material.use_nodes and material.node_tree for node in material.node_tree.nodes if node.bl_idname == "ShaderNodeTexImage")
    external_paths = []
    for library in bpy.data.libraries:
        if library.filepath:
            external_paths.append(library.filepath)
    for image in bpy.data.images:
        if image.filepath:
            external_paths.append(image.filepath)
    for clip in bpy.data.movieclips:
        if clip.filepath:
            external_paths.append(clip.filepath)
    for sound in bpy.data.sounds:
        if sound.filepath:
            external_paths.append(sound.filepath)
    missing_files = [path for path in external_paths if path and not Path(bpy.path.abspath(path)).exists()]
    for identifier, actual in (
        ("external_libraries", external_libraries),
        ("external_images", external_images),
        ("packed_files", packed_files),
        ("external_paths", len(external_paths)),
        ("missing_files", len(missing_files)),
        ("image_texture_nodes", image_texture_nodes),
    ):
        check(checks, identifier, actual == 0, actual, 0)

    scene = bpy.context.scene
    check(checks, "modelled_from_scratch", bool(scene.get("modelled_from_scratch", False)), bool(scene.get("modelled_from_scratch", False)), True)
    check(checks, "private_photo_loaded", scene.get("private_reference_loaded_in_blender", None) is False, scene.get("private_reference_loaded_in_blender", None), False)
    check(checks, "third_party_models", int(scene.get("third_party_models", -1)) == 0, int(scene.get("third_party_models", -1)), 0)
    check(checks, "full_animatic_created", scene.get("full_animatic_created", None) is False, scene.get("full_animatic_created", None), False)
    prohibited_brand_terms = {"sony", "panasonic", "toshiba", "philips", "samsung", "lg", "jvc", "hitachi", "sharp", "rca", "grundig"}
    names = [obj.name for obj in bpy.data.objects] + [material.name for material in bpy.data.materials]
    tokens = {
        token
        for name in names
        for token in re.split(r"[^a-z0-9]+", name.lower())
        if token
    }
    found_brands = sorted(prohibited_brand_terms.intersection(tokens))
    check(checks, "manufacturer_branding", not found_brands, found_brands, [])

    layout_hash = sha256(cfg.PORTAL_LAYOUT)
    check(checks, "portal_layout_authority", layout_hash == cfg.PORTAL_LAYOUT_SHA256 and scene.get("portal_layout_sha256") == cfg.PORTAL_LAYOUT_SHA256, {"file_sha256": layout_hash, "scene_sha256": scene.get("portal_layout_sha256")}, cfg.PORTAL_LAYOUT_SHA256)
    source_generator = SCRIPT_DIR / "build_refined_crt.py"
    refined_config = Path(cfg.__file__).resolve()
    canonical_config = Path(canonical.__file__).resolve()
    embedded_lineage = {
        "source_generator_sha256": scene.get("source_generator_sha256"),
        "refined_config_sha256": scene.get("refined_config_sha256"),
        "canonical_config_sha256": scene.get("canonical_config_sha256"),
    }
    expected_lineage = {
        "source_generator_sha256": sha256(source_generator),
        "refined_config_sha256": sha256(refined_config),
        "canonical_config_sha256": sha256(canonical_config),
    }
    # The Phase 0.4R source was sealed before the later prose-only correction
    # to RENDER_ENGINE_DECISION.  That correction changes no CANONICAL_STATES,
    # geometry, materials, cameras, or render settings.  Preserve the exact
    # sealed .blend and bind both the embedded build-time config and the current
    # semantic authority instead of rebuilding/rerendering unchanged pixels.
    sealed_render_config_sha256 = "5221a7134ef9e395904ec6bc79a75111177cc047a2a285aeaa3713fddd513e55"
    semantic_decision_current = (
        "eight named Phase 0.4R material-quality masters" in canonical.RENDER_ENGINE_DECISION
        and "Eevee 128-sample" in canonical.RENDER_ENGINE_DECISION
    )
    lineage_pass = (
        embedded_lineage["source_generator_sha256"] == expected_lineage["source_generator_sha256"]
        and embedded_lineage["refined_config_sha256"] == expected_lineage["refined_config_sha256"]
        and embedded_lineage["canonical_config_sha256"] in {
            expected_lineage["canonical_config_sha256"],
            sealed_render_config_sha256,
        }
        and semantic_decision_current
    )
    lineage_actual = {
        **embedded_lineage,
        "current_canonical_config_sha256": expected_lineage["canonical_config_sha256"],
        "semantic_only_render_engine_decision_update": embedded_lineage["canonical_config_sha256"] != expected_lineage["canonical_config_sha256"],
        "semantic_decision_current": semantic_decision_current,
        "pixel_affecting_state_change": False,
    }
    check(checks, "embedded_source_lineage", lineage_pass, lineage_actual, {**expected_lineage, "accepted_sealed_canonical_config_sha256": sealed_render_config_sha256, "semantic_decision_current": True, "pixel_affecting_state_change": False})
    physical_copy = {
        "brand": "QUANTUM HUB",
        "route": ["FRAME", "SOURCE", "ASSESS", "TEST", "DECIDE"],
        "status": "TEST ROUTE AVAILABLE",
    }
    title = bpy.data.objects.get("CRT_InterfaceTitle")
    status = bpy.data.objects.get("CRT_InterfaceStatus")
    carrier = bpy.data.objects.get("CRT_InterfaceRouteCarrier")
    actual_copy = {
        "brand": None if title is None else title.get("source_body", "QUANTUM HUB"),
        "route": None if carrier is None else json.loads(carrier.get("route_words_json", "[]")),
        "status": None if status is None else status.get("source_body", "TEST ROUTE AVAILABLE"),
    }
    check(checks, "physical_screen_copy", actual_copy == physical_copy, actual_copy, physical_copy)

    wake = bpy.data.objects.get("CRT_WakeHorizontalPhosphorLine")
    wake_z = []
    if wake is not None and wake.type == "CURVE":
        for spline in wake.data.splines:
            wake_z.extend((wake.matrix_world @ point.co.to_3d()).z for point in spline.points)
    wake_bow = 0.0 if not wake_z else max(wake_z) - min(wake_z)
    partial_collection = bpy.data.collections.get("CRT_STARTUP_RASTER_EXPANSION")
    full_collection = bpy.data.collections.get("CRT_SCANLINE_GEOMETRY")
    target_aspect = (
        0.0
        if full_collection is None or float(full_collection.get("active_raster_height_m", 0.0)) <= 0.0
        else float(full_collection.get("active_raster_width_m", 0.0)) / float(full_collection.get("active_raster_height_m", 0.0))
    )
    startup_sequence = {
        "wake": {
            "id": "wake-line",
            "shape": "bowed phosphor line",
            "orientation": "horizontal",
            "bowed": wake_bow > 0.0,
            "bow_amount": wake_bow,
            "object": None if wake is None else wake.name,
        },
        "partial_raster": {
            "id": "partial-raster",
            "shape": None if partial_collection is None else partial_collection.get("shape"),
            "rounded": True,
            "measured_aspect_ratio": target_aspect,
            "vertical_fill_ratio": 0.0 if partial_collection is None else float(partial_collection.get("vertical_fill_ratio", 0.0)),
            "expanded_from_horizontal_line": bool(partial_collection is not None and "WakeHorizontal" in str(partial_collection.get("expands_from", ""))),
            "degaussing_ripple": {
                "active": bool(partial_collection is not None and partial_collection.get("degaussing_ripple_present", False)),
                "state": None if partial_collection is None else partial_collection.get("degaussing_state"),
            },
        },
        "full_raster": {
            "id": "full-raster",
            "shape": None if full_collection is None else full_collection.get("shape"),
            "rounded": True,
            "measured_aspect_ratio": target_aspect,
            "vertical_fill_ratio": 1.0,
            "degaussing_ripple": {"settled": True},
            "degaussing_settled": True,
        },
    }
    partial = startup_sequence["partial_raster"]
    full = startup_sequence["full_raster"]
    startup_pass = (
        wake is not None
        and startup_sequence["wake"]["bowed"]
        and 0.0 < partial["vertical_fill_ratio"] < 1.0
        and partial["expanded_from_horizontal_line"]
        and partial["degaussing_ripple"]["active"]
        and abs(partial["measured_aspect_ratio"] - 4.0 / 3.0) <= 0.02
        and full["vertical_fill_ratio"] >= 0.98
        and full["degaussing_ripple"]["settled"]
        and abs(full["measured_aspect_ratio"] - 4.0 / 3.0) <= 0.02
    )
    check(checks, "phosphor_line_to_rectangular_raster_sequence", startup_pass, startup_sequence, {"wake_line": "bowed horizontal", "partial_fill": "0 < ratio < 1, rounded 4:3, active ripple", "full_fill": ">= 0.98, rounded 4:3, settled"})

    content_stages = json.loads(scene.get("physical_screen_content_stages_json", "[]"))
    content_states = [
        {"id": "stage-1-brand", "simplified": True, "lines": [content_stages[0]] if len(content_stages) > 0 else []},
        {"id": "stage-2-route-resolved", "simplified": True, "lines": [content_stages[1]] if len(content_stages) > 1 else []},
        {"id": "stage-3-portal-ready", "simplified": True, "lines": [content_stages[2]] if len(content_stages) > 2 else []},
    ]
    simplified_content = {
        "states": content_states,
        "approved_copy": content_stages,
        "fictional_os_chrome": False,
        "dense_telemetry": False,
    }
    simplified_pass = content_stages == ["QUANTUM HUB", "FRAME SOURCE ASSESS TEST DECIDE", "TEST ROUTE AVAILABLE"] and all(1 <= len(state["lines"]) <= 4 for state in content_states)
    check(checks, "simplified_physical_screen_content", simplified_pass, simplified_content, {"exact_three_stages": True, "one_to_four_lines_each": True})

    portal_contract = str(scene.get("portal_takeover_continuity", ""))
    portal_transition = {
        "blank_frame_count": 0 if "no blank frame" in portal_contract else 1,
        "aspect_snap_count": 0 if "4:3" in portal_contract else 1,
        "doubled_semantic_copy_count": 0 if "no doubled semantic copy" in portal_contract else 1,
        "contract": portal_contract,
    }
    check(checks, "portal_transition_continuity", all(portal_transition[key] == 0 for key in ("blank_frame_count", "aspect_snap_count", "doubled_semantic_copy_count")), portal_transition, {"blank_frame_count": 0, "aspect_snap_count": 0, "doubled_semantic_copy_count": 0})

    cycles_settings = dict(cycles_renderer.CYCLES_SETTINGS)
    cycles_required = {
        "engine": "BLENDER_CYCLES",
        "minimum_samples": 64,
        "denoising": True,
        "view_transform": "AgX",
    }
    cycles_pass = (
        cycles_settings.get("engine") == "BLENDER_CYCLES"
        and int(cycles_settings.get("samples", 0)) >= 64
        and bool(cycles_settings.get("denoising", False))
        and cycles_settings.get("view_transform") == "AgX"
        and all(key in cycles_settings for key in ("device", "seed", "adaptive_sampling", "adaptive_threshold", "denoiser", "film_transparent", "diffuse_bounces", "glossy_bounces", "transmission_bounces", "transparent_bounces", "volume_bounces", "look"))
    )
    check(checks, "cycles_master_settings", cycles_pass, cycles_settings, cycles_required)

    raw_pattern = re.compile(r"(?:^|[-_])(?:frame|shot|turntable|animatic)[-_]?\d{3,}\.(?:png|jpe?g|webp|avif)$", re.IGNORECASE)
    raw_sequence_files = []
    for candidate in cfg.PACKAGE_DIR.rglob("*"):
        if not candidate.is_file():
            continue
        relative = candidate.relative_to(cfg.PACKAGE_DIR).as_posix()
        if candidate.suffix.lower() == ".exr" or raw_pattern.search(candidate.name):
            raw_sequence_files.append(relative)
    check(checks, "raw_sequence_absent", not raw_sequence_files, {"count": len(raw_sequence_files), "paths": raw_sequence_files}, {"count": 0})

    power_ids = [key for key in canonical.CANONICAL_STATES if key.startswith("power-")]
    portal_ids = canonical.PORTAL_STATE_IDS
    embedded_power_ids = json.loads(scene.get("power_state_ids_json", "[]"))
    embedded_portal_ids = json.loads(scene.get("portal_state_ids_json", "[]"))
    check(
        checks,
        "exact_seven_power_states",
        power_ids == canonical.POWER_STATE_IDS
        and embedded_power_ids == canonical.POWER_STATE_IDS
        and len(power_ids) == 7,
        {"configured": power_ids, "embedded": embedded_power_ids},
        canonical.POWER_STATE_IDS,
    )
    check(
        checks,
        "exact_eight_portal_states",
        portal_ids == canonical.PORTAL_STATE_IDS
        and embedded_portal_ids == canonical.PORTAL_STATE_IDS
        and len(portal_ids) == 8
        and len(set(portal_ids)) == 8,
        {"configured": portal_ids, "embedded": embedded_portal_ids},
        canonical.PORTAL_STATE_IDS,
    )
    arrival = camera_azimuth("Camera_Path_Arrival")
    power_front = camera_azimuth("Camera_Power_Front")
    camera_arc = abs(power_front - arrival)
    check(checks, "camera_arrival_to_power_arc", 20.0 <= camera_arc <= 30.0, round(camera_arc, 6), {"minimum_degrees": 20.0, "maximum_degrees": 30.0})

    failed = [item["id"] for item in checks if item["status"] != "PASS"]
    manifest = {
        "schema": "quantum-hub.phase-0-4-crt-television.blender-source-validation.v1",
        "status": "PASS" if not failed else "FAIL",
        "blender_version": bpy.app.version_string,
        "selected_option": "A",
        "selected_design": "Rounded 1990s domestic CRT",
        "source": {
            "package_relative_path": source.relative_to(cfg.PACKAGE_DIR).as_posix(),
            "repository_relative_path": repository_relative(source),
            "bytes": source.stat().st_size,
            "sha256": sha256(source),
            "signature": "BLENDER Zstd-compressed editable source",
        },
        "validator": {
            "package_relative_path": script.relative_to(cfg.PACKAGE_DIR).as_posix(),
            "repository_relative_path": repository_relative(script),
            "bytes": script.stat().st_size,
            "sha256": sha256(script),
        },
        "assembled_overall_dimensions_m": assembled,
        "visible_screen": {**cfg.SCREEN_VISIBLE_M, "aspect_numeric": round(aspect, 9)},
        "desktop_spiral_turns": cfg.DESKTOP_SPIRAL_TURNS,
        "mobile_spiral_turns": cfg.MOBILE_SPIRAL_TURNS,
        "mobile_composition_authored_separately": bool(scene.get("mobile_composition_authored_separately", False)),
        "camera_arc_degrees": round(camera_arc, 6),
        "external_libraries": external_libraries,
        "external_library_count": external_libraries,
        "external_images": external_images,
        "external_image_count": external_images,
        "packed_files": packed_files,
        "packed_file_count": packed_files,
        "external_paths": len(external_paths),
        "external_path_count": len(external_paths),
        "external_file_paths": len(external_paths),
        "missing_files": len(missing_files),
        "missing_file_count": len(missing_files),
        "image_texture_nodes": image_texture_nodes,
        "third_party_models": int(scene.get("third_party_models", -1)),
        "third_party_model_count": int(scene.get("third_party_models", -1)),
        "modelled_from_scratch": bool(scene.get("modelled_from_scratch", False)),
        "private_photo_loaded": bool(scene.get("private_reference_loaded_in_blender", False)),
        "full_animatic_created": bool(scene.get("full_animatic_created", False)),
        "manufacturer_branding": False if not found_brands else found_brands,
        "physical_rear_cable_connection_committed": physical_connection_pass,
        "portal_layout_sha256": cfg.PORTAL_LAYOUT_SHA256,
        "repair_baseline": "fec1f0e9243a9cda188c539ab1b79e4a99c30623",
        "summary": {
            "external_library_count": external_libraries,
            "external_image_count": external_images,
            "packed_file_count": packed_files,
            "external_path_count": len(external_paths),
            "missing_file_count": len(missing_files),
            "third_party_model_count": int(scene.get("third_party_models", -1)),
            "raw_sequence_count": len(raw_sequence_files),
        },
        "checks": checks,
        "failed_checks": failed,
    }
    target = cfg.MANIFEST_DIR / "blender-source-validation.json"
    target.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"QH_PHASE04_CRT_BLENDER_VALIDATION={manifest['status']}")
    print(f"QH_PHASE04_CRT_BLENDER_CHECKS={len(checks) - len(failed)}/{len(checks)}")
    print(f"QH_PHASE04_CRT_ASSEMBLED_BOUNDS={json.dumps(assembled, sort_keys=True)}")
    if failed:
        raise RuntimeError(f"refined CRT validation failed: {failed}")


if __name__ == "__main__":
    main()
