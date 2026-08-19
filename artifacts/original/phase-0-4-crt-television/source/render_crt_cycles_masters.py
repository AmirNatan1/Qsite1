"""Render the bounded Phase 0.4R Cycles quality-master stills.

The script opens only the already-selected editable CRT source supplied on the
Blender command line.  It creates eight governed stills; it never creates a
frame sequence, animation, external texture, or packed dependency.
"""

from __future__ import annotations

import hashlib
import json
import sys
from collections import OrderedDict
from pathlib import Path

import bpy
from mathutils import Vector

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import crt_canonical_config as cfg
import render_crt_canonical_stills as canonical_renderer


OUTPUT_DIR = cfg.PACKAGE_DIR / "renders" / "repair-masters"
MANIFEST_PATH = cfg.MANIFEST_DIR / "crt-phase-0-4r-cycles-master-render-manifest.json"
SPOT_MANIFEST_PATH = cfg.PACKAGE_DIR / "work" / "crt-phase-0-4r-cycles-spot-gate.json"

CYCLES_SETTINGS = {
    "engine": "BLENDER_CYCLES",
    "blender_engine_enum": "CYCLES",
    "device": "CPU",
    "samples": 64,
    "seed": 2404,
    "adaptive_sampling": True,
    "adaptive_threshold": 0.020,
    "denoising": True,
    "denoiser": "OPENIMAGEDENOISE",
    "film_transparent": False,
    "max_bounces": 8,
    "diffuse_bounces": 4,
    "glossy_bounces": 4,
    "transmission_bounces": 8,
    "transparent_bounces": 8,
    "volume_bounces": 0,
    "view_transform": "AgX",
    "look": "AgX - Medium High Contrast",
    "resolution_percentage": 100,
    "image_format": "PNG RGB 8-bit",
}

CYCLES_LIGHTING_PROFILE = {
    "name": "Phase 0.4R restrained CRT glass reflection",
    "primary_light_specular_factor": 0.0,
    "glass_grazing_light_energy_w": 55.0,
    "glass_grazing_light_shape": "RECTANGLE",
    "glass_grazing_light_size_m": 0.22,
    "glass_grazing_light_size_y_m": 0.012,
    "glass_grazing_light_location_m": [0.00, -1.90, 1.45],
    "glass_grazing_light_target_m": [0.58, -0.35, 0.58],
    "portal_ready_grazing_light_energy_w": 0.0,
    "portal_ready_grazing_light_size_m": 0.006,
    "portal_ready_grazing_light_size_y_m": 0.001,
    "portal_ready_grazing_light_target_m": [0.88, -0.35, 0.62],
    "glass_grazing_light_specular_factor": 1.0,
    "glass_grazing_light_diffuse_factor": 0.0,
    "glass_specular_ior_level": 0.32,
    "glass_coat_weight": 0.0,
    "glass_roughness": 0.14,
    "glass_dormant_transmission_weight": 0.58,
    "glass_powered_transmission_weight": 0.72,
    "glass_reflected_base_color": [0.0018, 0.0040, 0.0048, 1.0],
    "phosphor_reflected_base_color": [0.0, 0.0, 0.0, 1.0],
    "phosphor_specular_ior_level": 0.0,
    "main_light_linking": "all renderable scene objects except CRT optical layers and screen-owned emission geometry",
    "glass_accent_light_linking": "CRT_ConvexThickSmokedGlass only",
    "intent": "retain diffuse cabinet legibility while replacing broad white tube glare with an edge-biased narrow bent Fresnel cue",
}


MASTER_SPECS = OrderedDict(
    [
        (
            "cycles-design-three-quarter-front",
            {
                "state_id": "design-three-quarter-front",
                "camera": "Camera_ThreeQuarter_Front_Design",
                "resolution": (1600, 1000),
                "role": "selected front three-quarter hero / shell, bezel, lower-band and grounded proportion proof",
            },
        ),
        (
            "cycles-cabinet-material-closeup",
            {
                "state_id": "cabinet-three-quarter",
                "camera": "Camera_Cabinet_Material",
                "resolution": (1600, 1000),
                "role": "specific near-black injection-moulded ABS and controlled grazing response",
            },
        ),
        (
            "cycles-speaker-controls-closeup",
            {
                "state_id": "detail-controls",
                "camera": "Camera_Controls_Macro",
                "resolution": (1600, 1000),
                "role": "true recessed speaker perforations and distinct period control taxonomy",
            },
        ),
        (
            "cycles-rear-strain-relief-closeup",
            {
                "state_id": "detail-connector",
                "camera": "Camera_Connector_Macro",
                "resolution": (1600, 1000),
                "role": "rear cable collar, strain relief and hidden load-bearing connection close-up",
            },
        ),
        (
            "cycles-dormant-glass-closeup",
            {
                "state_id": "glass-dormant-front",
                "camera": "Camera_Raster_Close",
                "resolution": (1600, 1000),
                "role": "dormant convex smoked glass, gasket, air-gap and zero-emission proof",
            },
        ),
        (
            "cycles-powered-glass-phosphor-closeup",
            {
                "state_id": "power-06-quantum-interface-stabilizes",
                "camera": "Camera_Raster_Close",
                "resolution": (1600, 1000),
                "role": "settled powered 4:3 raster, phosphor separation and scanline continuity",
            },
        ),
        (
            "cycles-proving-ground-master",
            {
                "state_id": "proving-ground-master",
                "camera": "Camera_Path_Arrival",
                "resolution": (1920, 1200),
                "role": "installed proving-ground master with lower, larger CRT arrival framing",
            },
        ),
        (
            "cycles-portal-ready-closeup",
            {
                "state_id": "portal-04-glass-almost-fills",
                "camera": "Camera_Portal_04_GlassAlmostFills",
                "resolution": (1600, 1000),
                "role": "portal-ready physical 4:3 screen close-up before semantic DOM ownership",
            },
        ),
    ]
)


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


def canonical_json_sha256(value: dict) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def configure_cycles(scene: bpy.types.Scene) -> None:
    scene.render.engine = CYCLES_SETTINGS["blender_engine_enum"]
    scene.cycles.device = CYCLES_SETTINGS["device"]
    scene.cycles.samples = CYCLES_SETTINGS["samples"]
    scene.cycles.seed = CYCLES_SETTINGS["seed"]
    scene.cycles.use_adaptive_sampling = CYCLES_SETTINGS["adaptive_sampling"]
    scene.cycles.adaptive_threshold = CYCLES_SETTINGS["adaptive_threshold"]
    scene.cycles.use_denoising = CYCLES_SETTINGS["denoising"]
    scene.cycles.denoiser = CYCLES_SETTINGS["denoiser"]
    scene.cycles.max_bounces = CYCLES_SETTINGS["max_bounces"]
    scene.cycles.diffuse_bounces = CYCLES_SETTINGS["diffuse_bounces"]
    scene.cycles.glossy_bounces = CYCLES_SETTINGS["glossy_bounces"]
    scene.cycles.transmission_bounces = CYCLES_SETTINGS["transmission_bounces"]
    scene.cycles.transparent_max_bounces = CYCLES_SETTINGS["transparent_bounces"]
    scene.cycles.volume_bounces = CYCLES_SETTINGS["volume_bounces"]
    scene.render.film_transparent = CYCLES_SETTINGS["film_transparent"]
    scene.render.resolution_percentage = CYCLES_SETTINGS["resolution_percentage"]
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 48
    scene.view_settings.view_transform = CYCLES_SETTINGS["view_transform"]
    try:
        scene.view_settings.look = CYCLES_SETTINGS["look"]
    except TypeError:
        # Blender builds differ only in the human-readable prefix for this
        # accepted AgX look.  Fail closed below if the resolved look is not a
        # medium-high-contrast AgX variant.
        candidates = [
            item.name
            for item in scene.bl_rna.properties["view_settings"].fixed_type.properties["look"].enum_items
        ]
        match = next((item for item in candidates if "Medium High Contrast" in item), None)
        if match is None:
            raise
        scene.view_settings.look = match
    if "Medium High Contrast" not in scene.view_settings.look:
        raise RuntimeError(f"unexpected AgX look: {scene.view_settings.look}")

    # Physical screen glyphs are emissive raster-owned content.  They must not
    # cast plastic-letter shadows in the Cycles quality masters.
    interface = bpy.data.collections.get("CRT_PHYSICAL_SIGNAL_INTERFACE")
    if interface is not None:
        for obj in list(interface.all_objects):
            if obj is not None and hasattr(obj, "visible_shadow"):
                obj.visible_shadow = False

    # Cycles light linking makes the main scene lights diffuse cabinet/world
    # sources only; they never become broad reflected cards on the CRT glass.
    # The narrow accent below is the glass's sole direct-light receiver.
    main_receivers = bpy.data.collections.get("CYCLES_MAIN_LIGHT_RECEIVERS")
    if main_receivers is None:
        main_receivers = bpy.data.collections.new("CYCLES_MAIN_LIGHT_RECEIVERS")
        scene.collection.children.link(main_receivers)
    optical_names = {
        "CRT_ConvexThickSmokedGlass",
        "CRT_InternalPhosphorLayer",
        "CRT_WakeHorizontalPhosphorLine",
    }
    optical_prefixes = (
        "CRT_StartupExpansionScanline_",
        "CRT_Scanline_",
        "CRT_Interface",
        "CRT_PortalTakeover",
    )
    for obj in list(bpy.data.objects):
        if obj.type in {"LIGHT", "CAMERA"}:
            continue
        if obj.name in optical_names or obj.name.startswith(optical_prefixes):
            continue
        if main_receivers.objects.get(obj.name) is None:
            main_receivers.objects.link(obj)
    for name in (
        "Scene_NeutralKey",
        "Scene_GrazingRim",
        "Scene_FrontFill",
        "Scene_BackServiceFill",
    ):
        light = bpy.data.objects.get(name)
        if light is not None:
            light.light_linking.receiver_collection = main_receivers

    glass_receivers = bpy.data.collections.get("CYCLES_GLASS_ACCENT_RECEIVER")
    if glass_receivers is None:
        glass_receivers = bpy.data.collections.new("CYCLES_GLASS_ACCENT_RECEIVER")
        scene.collection.children.link(glass_receivers)
    glass_object = bpy.data.objects.get("CRT_ConvexThickSmokedGlass")
    if glass_object is None:
        raise RuntimeError("missing CRT glass for Cycles light linking")
    if glass_receivers.objects.get(glass_object.name) is None:
        glass_receivers.objects.link(glass_object)
    accent = bpy.data.objects.get("Scene_GlassProofAccent")
    if accent is not None:
        accent.light_linking.receiver_collection = glass_receivers


def apply_quality_lighting(master_id: str) -> None:
    """Apply a Cycles-only reflection profile without mutating the source file."""

    for name in (
        "Scene_NeutralKey",
        "Scene_GrazingRim",
        "Scene_FrontFill",
        "Scene_BackServiceFill",
    ):
        light = bpy.data.objects.get(name)
        if light is not None and hasattr(light.data, "specular_factor"):
            light.data.specular_factor = CYCLES_LIGHTING_PROFILE["primary_light_specular_factor"]

    accent = bpy.data.objects.get("Scene_GlassProofAccent")
    if accent is None:
        raise RuntimeError("missing Cycles glass-grazing light")
    glass_sensitive = master_id in {
        "cycles-design-three-quarter-front",
        "cycles-dormant-glass-closeup",
        "cycles-powered-glass-phosphor-closeup",
        "cycles-portal-ready-closeup",
    }
    accent.hide_render = not glass_sensitive
    portal_ready = master_id == "cycles-portal-ready-closeup"
    accent.data.energy = CYCLES_LIGHTING_PROFILE[
        "portal_ready_grazing_light_energy_w" if portal_ready else "glass_grazing_light_energy_w"
    ]
    accent.data.shape = CYCLES_LIGHTING_PROFILE["glass_grazing_light_shape"]
    accent.data.size = CYCLES_LIGHTING_PROFILE[
        "portal_ready_grazing_light_size_m" if portal_ready else "glass_grazing_light_size_m"
    ]
    accent.data.size_y = CYCLES_LIGHTING_PROFILE[
        "portal_ready_grazing_light_size_y_m" if portal_ready else "glass_grazing_light_size_y_m"
    ]
    accent.location = CYCLES_LIGHTING_PROFILE["glass_grazing_light_location_m"]
    direction = Vector(
        CYCLES_LIGHTING_PROFILE[
            "portal_ready_grazing_light_target_m" if portal_ready else "glass_grazing_light_target_m"
        ]
    ) - accent.location
    accent.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    if hasattr(accent.data, "specular_factor"):
        accent.data.specular_factor = CYCLES_LIGHTING_PROFILE["glass_grazing_light_specular_factor"]
    if hasattr(accent.data, "diffuse_factor"):
        accent.data.diffuse_factor = CYCLES_LIGHTING_PROFILE["glass_grazing_light_diffuse_factor"]

    glass = bpy.data.materials.get("CRT_ThickSmokedGlass")
    shader = None if glass is None or glass.node_tree is None else glass.node_tree.nodes.get("Principled BSDF")
    if shader is None:
        raise RuntimeError("missing Cycles smoked-glass shader")
    shader.inputs["Roughness"].default_value = CYCLES_LIGHTING_PROFILE["glass_roughness"]
    shader.inputs["Base Color"].default_value = CYCLES_LIGHTING_PROFILE["glass_reflected_base_color"]
    for input_name in ("Specular IOR Level", "IOR Level"):
        if input_name in shader.inputs:
            shader.inputs[input_name].default_value = CYCLES_LIGHTING_PROFILE["glass_specular_ior_level"]
    if "Coat Weight" in shader.inputs:
        shader.inputs["Coat Weight"].default_value = CYCLES_LIGHTING_PROFILE["glass_coat_weight"]
    if "Transmission Weight" in shader.inputs:
        shader.inputs["Transmission Weight"].default_value = (
            CYCLES_LIGHTING_PROFILE["glass_powered_transmission_weight"]
            if master_id in {"cycles-powered-glass-phosphor-closeup", "cycles-portal-ready-closeup"}
            else CYCLES_LIGHTING_PROFILE["glass_dormant_transmission_weight"]
        )

    # The internal phosphor is self-luminous when powered and optically black
    # when dormant.  In Cycles its tiny Principled base component otherwise
    # catches the large scene key through the glass and reads as a studio blob.
    # Preserve emission but eliminate that unrelated reflected component.
    phosphor = bpy.data.objects.get("CRT_InternalPhosphorLayer")
    if phosphor is None or not phosphor.data.materials:
        raise RuntimeError("missing internal phosphor material")
    phosphor_shader = phosphor.data.materials[0].node_tree.nodes.get("Principled BSDF")
    if phosphor_shader is None:
        raise RuntimeError("missing Cycles phosphor shader")
    phosphor_shader.inputs["Base Color"].default_value = CYCLES_LIGHTING_PROFILE["phosphor_reflected_base_color"]
    for input_name in ("Specular IOR Level", "IOR Level"):
        if input_name in phosphor_shader.inputs:
            phosphor_shader.inputs[input_name].default_value = CYCLES_LIGHTING_PROFILE["phosphor_specular_ior_level"]


def parse_requested() -> tuple[list[str], bool, bool]:
    tail = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    manifest_only = "--manifest-only" in tail
    spot = "--spot" in tail
    requested = list(MASTER_SPECS)
    if "--only" in tail:
        index = tail.index("--only") + 1
        if index >= len(tail):
            raise RuntimeError("--only requires comma-separated master IDs")
        requested = [item.strip() for item in tail[index].split(",") if item.strip()]
    unknown = [item for item in requested if item not in MASTER_SPECS]
    if unknown:
        raise RuntimeError(f"unknown Cycles master IDs: {unknown}")
    return requested, manifest_only, spot


def render_master(scene: bpy.types.Scene, master_id: str, spec: dict) -> Path:
    state = dict(cfg.CANONICAL_STATES[spec["state_id"]])
    state["camera"] = spec["camera"]
    canonical_renderer.set_state(state)
    apply_quality_lighting(master_id)
    scene.camera = bpy.data.objects[spec["camera"]]
    width, height = spec["resolution"]
    scene.render.resolution_x = int(width)
    scene.render.resolution_y = int(height)
    output = OUTPUT_DIR / f"{master_id}.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(output.resolve())
    bpy.ops.render.render(write_still=True)
    return output


def record(master_id: str, spec: dict) -> dict:
    output = OUTPUT_DIR / f"{master_id}.png"
    if not output.is_file():
        raise RuntimeError(f"missing Cycles master: {output}")
    state = cfg.CANONICAL_STATES[spec["state_id"]]
    width, height = spec["resolution"]
    item = file_record(output)
    item.update(
        {
            "id": master_id,
            "filename": output.name,
            "width": int(width),
            "height": int(height),
            "state_id": spec["state_id"],
            "camera": spec["camera"],
            "material_role": spec["role"],
            "phosphor": state["phosphor"],
            "conduction_progress": float(state["conduction_progress"]),
            "connector_response": bool(state.get("connector_response", False)),
            "engine": "BLENDER_CYCLES",
            "render_settings": dict(CYCLES_SETTINGS),
            "lighting_profile": dict(CYCLES_LIGHTING_PROFILE),
            "approval_state": "Phase 0.4R Cycles quality master candidate",
        }
    )
    return item


def write_manifest(requested: list[str], *, spot: bool) -> Path:
    records = [record(master_id, MASTER_SPECS[master_id]) for master_id in requested]
    source = cfg.REFINED_BLEND
    script = Path(__file__).resolve()
    builder = SCRIPT_DIR / "build_refined_crt.py"
    validator = SCRIPT_DIR / "validate_refined_crt_source.py"
    canonical_config = SCRIPT_DIR / "crt_canonical_config.py"
    refined_config = SCRIPT_DIR / "crt_refined_config.py"
    complete = len(requested) == len(MASTER_SPECS) and requested == list(MASTER_SPECS)
    source_record = file_record(source)
    renderer_record = file_record(script)
    settings_sha256 = canonical_json_sha256(CYCLES_SETTINGS)
    for item in records:
        item.update(
            {
                "source_sha256": source_record["sha256"],
                "renderer_sha256": renderer_record["sha256"],
                "render_settings_sha256": settings_sha256,
                "lineage": {
                    "source_sha256": source_record["sha256"],
                    "renderer_sha256": renderer_record["sha256"],
                    "render_settings_sha256": settings_sha256,
                },
            }
        )
    manifest = {
        "schema": "quantum-hub.phase-0-4r-crt-television.cycles-master-render.v1",
        "status": "PASS" if complete and not spot else "SPOT_GATE_VISUAL_REVIEW_REQUIRED",
        "selected_option": "A",
        "source": source_record,
        "builder": file_record(builder),
        "renderer": renderer_record,
        "validator": file_record(validator),
        "configuration_authority": [file_record(canonical_config), file_record(refined_config)],
        "layout_authority": {
            **file_record(cfg.PORTAL_LAYOUT),
            "sha256": cfg.PORTAL_LAYOUT_SHA256,
        },
        "render_settings": dict(CYCLES_SETTINGS),
        "render_settings_sha256": settings_sha256,
        "lighting_profile": dict(CYCLES_LIGHTING_PROFILE),
        "master_count": len(records),
        "expected_master_count": len(MASTER_SPECS),
        "exact_master_ids": list(MASTER_SPECS),
        "records": records,
        "private_reference_loaded": False,
        "external_textures": 0,
        "external_models": 0,
        "full_animatic_created": False,
        "frame_sequence_created": False,
    }
    target = SPOT_MANIFEST_PATH if spot else MANIFEST_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return target


def main() -> None:
    requested, manifest_only, spot = parse_requested()
    if sha256(cfg.REFINED_BLEND) != "3027c4c46e2b829fd97ee9a3a47558e43adda47abcc488420faa0f087bd720a7":
        raise RuntimeError("sealed Phase 0.4R Blender source hash changed")
    scene = bpy.context.scene
    configure_cycles(scene)
    if not manifest_only:
        for master_id in requested:
            render_master(scene, master_id, MASTER_SPECS[master_id])
    target = write_manifest(requested, spot=spot)
    print(f"QH_PHASE04R_CYCLES_MASTER_COUNT={len(requested)}")
    print(f"QH_PHASE04R_CYCLES_MANIFEST={target.resolve()}")


if __name__ == "__main__":
    main()
