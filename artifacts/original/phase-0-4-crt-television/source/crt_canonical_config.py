"""Deterministic still-only Phase 0.4 canonical render specification."""

from __future__ import annotations

from pathlib import Path

import crt_refined_config as refined


SOURCE_DIR = Path(__file__).resolve().parent
PACKAGE_DIR = SOURCE_DIR.parent
RENDER_ROOT = PACKAGE_DIR / "renders" / "refined"
MANIFEST_DIR = PACKAGE_DIR / "manifests"
PORTAL_LAYOUT = refined.PORTAL_LAYOUT
PORTAL_LAYOUT_SHA256 = refined.PORTAL_LAYOUT_SHA256
REFINED_BLEND = refined.REFINED_BLEND

DESKTOP_RESOLUTION = (1920, 1200)
PORTRAIT_RESOLUTION = (1080, 1800)
EEVEE_ENGINE = "BLENDER_EEVEE"
EEVEE_SAMPLES = 128
RENDER_ENGINE_DECISION = (
    "The eight named Phase 0.4R material-quality masters use deterministic 64-sample "
    "CPU Cycles with OIDN and AgX Medium High Contrast. Eevee 128-sample rendering is "
    "retained only for the authorized supplemental camera, cable, causal-state, and "
    "browser-scene source evidence where rapid exact-state coverage is required."
)
COLOR_MANAGEMENT = "AgX / Medium High Contrast"

POWER_STATE_IDS = [
    "power-01-completely-dormant",
    "power-02-current-reaches-connection",
    "power-03-power-indicator-response",
    "power-04-crt-electrical-wake",
    "power-05-raster-phosphor-appears",
    "power-06-quantum-interface-stabilizes",
    "power-07-portal-ready",
]

PORTAL_STATE_IDS = [
    "portal-01-television-in-scene",
    "portal-02-screen-active",
    "portal-03-close-approach",
    "portal-04-glass-almost-fills",
    "portal-05-bezel-exits",
    "portal-06-distortion-reduces",
    "portal-07-dom-takes-ownership",
    "portal-08-full-semantic-surface",
]


def still(
    group: str,
    camera: str,
    *,
    progress: float = 0.0,
    indicator: bool = False,
    phosphor: str = "off",
    interface: bool = False,
    interface_stage: str = "none",
    cable: str = "desktop",
    glass_proof: bool = False,
    connector_response: bool = False,
    startup_vertical_fill_ratio: float | None = None,
    degaussing_ripple: str | None = None,
    resolution: tuple[int, int] = DESKTOP_RESOLUTION,
    engine: str = EEVEE_ENGINE,
    classification: str = "Phase 0.4 still-based creative evidence",
) -> dict:
    resolved_interface_stage = interface_stage if interface_stage != "none" else ("ready" if interface else "none")
    if startup_vertical_fill_ratio is None:
        startup_vertical_fill_ratio = (
            0.48 if phosphor == "raster-expansion" else (1.0 if phosphor in ("raster", "interface", "takeover") else 0.0)
        )
    if degaussing_ripple is None:
        degaussing_ripple = (
            "active" if phosphor == "raster-expansion" else ("settled" if phosphor in ("raster", "interface", "takeover") else "not yet visible")
        )
    return {
        "group": group,
        "camera": camera,
        "conduction_progress": progress,
        "indicator": indicator,
        "phosphor": phosphor,
        "interface": resolved_interface_stage != "none",
        "interface_stage": resolved_interface_stage,
        "cable": cable,
        "glass_proof": glass_proof,
        "connector_response": connector_response,
        "startup_vertical_fill_ratio": startup_vertical_fill_ratio,
        "degaussing_ripple": degaussing_ripple,
        "resolution": resolution,
        "engine": engine,
        "classification": classification,
        "approval_state": "candidate for direct human Phase 0.4 review",
    }


CANONICAL_STATES = {
    # Selected design views.
    "design-front": still("design", "Camera_Front_Design"),
    "design-side": still("design", "Camera_Side_Design"),
    "design-rear": still("design", "Camera_Rear_Design"),
    "design-three-quarter-front": still("design", "Camera_ThreeQuarter_Front_Design"),
    "design-three-quarter-rear": still("design", "Camera_ThreeQuarter_Rear_Design"),
    # Cabinet/material and manufacturing detail.
    "cabinet-three-quarter": still("materials", "Camera_Cabinet_Material"),
    "cabinet-front-material": still("materials", "Camera_ThreeQuarter_Front_Design"),
    "cabinet-rear-material": still("materials", "Camera_ThreeQuarter_Rear_Design"),
    "glass-dormant-front": still("materials", "Camera_Raster_Close"),
    "glass-grazing-proof": still("materials", "Camera_Glass_Grazing", glass_proof=True),
    "glass-electrical-wake": still(
        "materials", "Camera_Raster_Close", progress=1.0, indicator=True, phosphor="wake-line"
    ),
    "glass-raster-warm": still(
        "materials", "Camera_Raster_Close", progress=1.0, indicator=True, phosphor="raster-expansion",
        startup_vertical_fill_ratio=0.48, degaussing_ripple="active"
    ),
    "detail-controls": still("details", "Camera_Controls_Macro"),
    "detail-speaker": still("details", "Camera_Speaker_Macro"),
    "detail-rear": still("details", "Camera_Rear_Detail"),
    "detail-connector": still("details", "Camera_Connector_Macro"),
    # Cable physical/conduction evidence.
    "cable-dormant": still("cable", "Camera_Conductor_Macro"),
    "cable-conduction-boundary": still("cable", "Camera_Conductor_Macro", progress=0.40),
    "cable-rear-arrival": still("cable", "Camera_Rear_Arrival", progress=0.985),
    "cable-connected-powered": still(
        "cable", "Camera_Connector_Macro", progress=1.0, indicator=True, connector_response=True
    ),
    # Environment and camera path.
    "proving-ground-master": still("environment", "Camera_Path_Arrival"),
    "camera-01-arrival": still("camera-study", "Camera_Path_Arrival"),
    "camera-02-thirty-percent": still("camera-study", "Camera_Path_30", progress=0.30),
    "camera-03-sixty-percent": still("camera-study", "Camera_Path_60", progress=0.60),
    "camera-04-near-frontal": still("camera-study", "Camera_Path_NearFrontal", progress=0.94),
    "camera-05-portal-ready": still(
        "camera-study", "Camera_Portal_03_CloseApproach", progress=1.0, indicator=True,
        phosphor="interface", interface_stage="ready"
    ),
    # Exact seven-state power-on authority.
    "power-01-completely-dormant": still("power-on", "Camera_Path_Arrival"),
    "power-02-current-reaches-connection": still(
        "power-on", "Camera_Rear_Arrival", progress=0.985, connector_response=False
    ),
    "power-03-power-indicator-response": still(
        "power-on", "Camera_Power_Front", progress=1.0, indicator=True, connector_response=True
    ),
    "power-04-crt-electrical-wake": still(
        "power-on", "Camera_Power_Front", progress=1.0, indicator=True, phosphor="wake-line"
    ),
    "power-05-raster-phosphor-appears": still(
        "power-on", "Camera_Raster_Close", progress=1.0, indicator=True,
        phosphor="raster-expansion", startup_vertical_fill_ratio=0.48, degaussing_ripple="active"
    ),
    "power-06-quantum-interface-stabilizes": still(
        "power-on", "Camera_Raster_Close", progress=1.0, indicator=True,
        phosphor="interface", interface_stage="brand",
        startup_vertical_fill_ratio=1.0, degaussing_ripple="settled"
    ),
    "power-07-portal-ready": still(
        "power-on", "Camera_Portal_03_CloseApproach", progress=1.0, indicator=True,
        phosphor="interface", interface_stage="route"
    ),
    # Physical portion of the exact eight-state portal authority. States 7–8
    # are supplied by the repository browser harness after the source freeze.
    "portal-01-television-in-scene": still(
        "portal", "Camera_Path_60", progress=1.0, indicator=True,
        phosphor="interface", interface_stage="route"
    ),
    "portal-02-screen-active": still(
        "portal", "Camera_Power_Front", progress=1.0, indicator=True,
        phosphor="interface", interface_stage="ready"
    ),
    "portal-03-close-approach": still(
        "portal", "Camera_Portal_03_CloseApproach", progress=1.0, indicator=True,
        phosphor="interface", interface_stage="ready"
    ),
    "portal-04-glass-almost-fills": still(
        "portal", "Camera_Portal_04_GlassAlmostFills", progress=1.0, indicator=True,
        phosphor="interface", interface_stage="ready"
    ),
    "portal-05-bezel-exits": still(
        "portal", "Camera_Portal_05_BezelExits", progress=1.0, indicator=True,
        phosphor="interface", interface_stage="ready"
    ),
    "portal-06-distortion-reduces": still(
        "portal", "Camera_Portal_06_TextFree", progress=1.0, indicator=True,
        phosphor="takeover", interface_stage="none"
    ),
    # Six frozen browser/keepout source roles.
    "source-desktop-dormant": still(
        "sources", "Camera_Dormant_Hero", classification="frozen desktop dormant browser-composition source"
    ),
    "source-mobile-dormant": still(
        "sources", "Camera_Mobile_Dormant", cable="mobile", resolution=PORTRAIT_RESOLUTION,
        classification="frozen separately authored mobile dormant browser-composition source",
    ),
    "source-reduced-desktop-dormant": still(
        "sources", "Camera_Reduced_Desktop", classification="frozen reduced-motion desktop dormant source"
    ),
    "source-reduced-mobile-dormant": still(
        "sources", "Camera_Reduced_Mobile", cable="mobile", resolution=PORTRAIT_RESOLUTION,
        classification="frozen reduced-motion separately authored mobile dormant source",
    ),
    "source-physical-portal-close": still(
        "sources", "Camera_Portal_04_GlassAlmostFills", progress=1.0, indicator=True,
        phosphor="interface", interface_stage="ready", classification="frozen physical portal close source",
    ),
    "source-text-free-portal-takeover": still(
        "sources", "Camera_Portal_06_TextFree", progress=1.0, indicator=True,
        phosphor="takeover", interface_stage="none", classification="frozen text-free portal takeover source",
    ),
}


SOURCE_ROLE_MAP = {
    "source-desktop-dormant": "desktop dormant scene",
    "source-mobile-dormant": "authored mobile dormant scene",
    "source-reduced-desktop-dormant": "reduced-motion desktop dormant scene",
    "source-reduced-mobile-dormant": "reduced-motion authored mobile dormant scene",
    "source-physical-portal-close": "physical portal close frame",
    "source-text-free-portal-takeover": "text-free portal takeover frame",
}
