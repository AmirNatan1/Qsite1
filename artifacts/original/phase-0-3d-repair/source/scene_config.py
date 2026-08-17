"""Authoritative dimensions, timing and output contract for the Phase 0 3D repair."""

from __future__ import annotations

from pathlib import Path


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = PACKAGE_ROOT / "source"
RENDER_DIR = PACKAGE_ROOT / "renders"
REVIEW_DIR = PACKAGE_ROOT / "review"
MANIFEST_DIR = PACKAGE_ROOT / "manifests"
WORK_DIR = PACKAGE_ROOT / "work"
BLEND_PATH = SOURCE_DIR / "quantum-field-unit.blend"

FPS = 24
FRAME_START = 1
FRAME_END = 192
DURATION_SECONDS = (FRAME_END - FRAME_START + 1) / FPS


def frame_at(progress: float) -> int:
    """Map accepted normalized scroll/media progress to the nearest timeline frame."""
    clamped = min(1.0, max(0.0, float(progress)))
    return round(FRAME_START + clamped * (FRAME_END - FRAME_START))


TIMELINE = {
    "dormant_end": frame_at(0.08),
    "conduction_established": frame_at(0.16),
    "camera_major_end": frame_at(0.68),
    "camera_align_end": frame_at(0.76),
    "connector_arrival": frame_at(0.80),
    "power_end": frame_at(0.87),
    "screen_start": frame_at(0.84),
    "screen_end": frame_at(0.91),
    "portal_start": frame_at(0.89),
    "portal_end": frame_at(0.97),
    "dom_owned": FRAME_END,
}

CONTROL_KEYS = {
    "conduction": (
        (FRAME_START, 0.0),
        (TIMELINE["dormant_end"], 0.0),
        (TIMELINE["connector_arrival"], 1.0),
    ),
    "connector_response": (
        (FRAME_START, 0.0),
        (TIMELINE["camera_align_end"], 0.0),
        (TIMELINE["connector_arrival"] + 4, 1.0),
    ),
    "mechanical_wake": (
        (FRAME_START, 0.0),
        (TIMELINE["connector_arrival"], 0.0),
        (TIMELINE["power_end"], 1.0),
    ),
    "screen_wake": (
        (FRAME_START, 0.0),
        (TIMELINE["screen_start"], 0.0),
        (TIMELINE["screen_end"], 1.0),
    ),
    # The physical glass/interface is readable before entry, then yields to the
    # matched native operating surface. This prevents enlarged device copy from
    # lingering in front of the portal camera.
    "physical_ui": (
        (FRAME_START, 0.0),
        (TIMELINE["screen_start"], 0.0),
        (TIMELINE["screen_end"], 1.0),
        (frame_at(0.925), 1.0),
        (TIMELINE["portal_end"], 0.0),
        (FRAME_END, 0.0),
    ),
    "portal": (
        (FRAME_START, 0.0),
        (TIMELINE["portal_start"], 0.0),
        (TIMELINE["portal_end"], 1.0),
        (FRAME_END, 1.0),
    ),
}

CONDUCTION_MASTER_FRAMES = {
    "conduction-10": frame_at(0.10),
    "conduction-25": frame_at(0.25),
    "conduction-40": frame_at(0.40),
    "conduction-55": frame_at(0.55),
    "conduction-70": frame_at(0.70),
    "conduction-78": frame_at(0.78),
}

ACTIVATION_FRAMES = {
    "activation-01-connector-arrival": frame_at(0.80),
    "activation-02-internal-response": frame_at(0.83),
    "activation-03-mechanical-wake": frame_at(0.865),
    "activation-04-interface-visible": frame_at(0.91),
    "activation-05-portal-ready": frame_at(0.93),
}

PORTAL_FRAMES = {
    "portal-00": frame_at(0.89),
    "portal-25": frame_at(0.91),
    "portal-50": frame_at(0.93),
    "portal-75": frame_at(0.95),
    "portal-100": frame_at(0.97),
    "first-dom-reference": FRAME_END,
}

MOBILE_FRAMES = {
    "mobile-dormant": FRAME_START,
    # Portrait framing reveals the energized inner approach later than desktop;
    # this checkpoint keeps the unit off while making cumulative current legible.
    "mobile-mid-conduction": frame_at(0.70),
    "mobile-activation": frame_at(0.86),
    # The authored mobile portal occurs sooner and is reviewed at physical-screen
    # takeover, before a wide desktop DOM line would be cropped in portrait.
    "mobile-portal": frame_at(0.93),
}

DESIGN_CAMERAS = {
    "field-unit-front": "Camera_Studio_Front",
    "field-unit-rear": "Camera_Studio_Rear",
    "field-unit-left": "Camera_Studio_Left",
    "field-unit-right": "Camera_Studio_Right",
    "field-unit-three-quarter-front": "Camera_Studio_ThreeQuarterFront",
    "field-unit-three-quarter-rear": "Camera_Studio_ThreeQuarterRear",
}

MATERIAL_CAMERAS = {
    "material-coated-metal": "Camera_Material_Shell",
    "material-smoked-glass": "Camera_Material_Glass",
    "material-cable": "Camera_Material_Cable",
    "material-connector": "Camera_Material_Connector",
    "material-base-contact": "Camera_Material_Base",
    "material-precision-detail": "Camera_Material_Detail",
}

DESKTOP_RESOLUTION = (1920, 1200)
ANIMATIC_RESOLUTION = (1920, 1080)
MOBILE_RESOLUTIONS = {
    "390x844": (390, 844),
    "360x800": (360, 800),
}
DESIGN_RESOLUTION = (2048, 1536)
MATERIAL_RESOLUTION = (1600, 1200)

REQUIRED_COLLECTIONS = (
    "SCENE_ROOT",
    "ENVIRONMENT",
    "TERRAIN",
    "DISTANT_INDUSTRY",
    "FIELD_UNIT",
    "SHELL",
    "APERTURE",
    "GLASS",
    "CONNECTOR",
    "MECHANICAL_WAKE",
    "DETAILS",
    "SPIRAL",
    "SHEATH",
    "CONDUCTION",
    "LIGHTING",
    "ATMOSPHERE",
    "CAMERA",
    "STUDIO",
)

REQUIRED_OBJECTS = (
    "CTRL_SpiralConduction",
    "Cable_Sheath",
    "Cable_ConductionCore",
    "Cable_ConductionFront",
    "FieldUnit_Base",
    "FieldUnit_MainShell",
    "FieldUnit_ApertureGlass",
    "FieldUnit_MechanicalRing",
    "FieldUnit_ConnectorHousing",
    "Portal_DOMMatchSurface",
    "Camera_Desktop",
    "Camera_Mobile",
)

EXPECTED_EXTERNAL_FILES: tuple[str, ...] = ()
