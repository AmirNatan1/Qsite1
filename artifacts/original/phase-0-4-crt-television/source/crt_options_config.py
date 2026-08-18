"""Deterministic configuration for the Phase 0.4 CRT proportion gate."""

from __future__ import annotations

from pathlib import Path


SOURCE_DIR = Path(__file__).resolve().parent
PACKAGE_DIR = SOURCE_DIR.parent
RENDER_DIR = PACKAGE_DIR / "renders" / "proportion-options"
MANIFEST_DIR = PACKAGE_DIR / "manifests"

BLOCKOUT_BLEND = SOURCE_DIR / "quantum-signal-television-proportion-options.blend"
COMPARISON_SHEET = PACKAGE_DIR / "crt-television-proportion-options.png"
RENDER_MANIFEST = MANIFEST_DIR / "crt-proportion-render-manifest.json"
DECISION_MANIFEST = MANIFEST_DIR / "crt-proportion-decision-manifest.json"
VALIDATION_MANIFEST = MANIFEST_DIR / "crt-proportion-source-validation.json"

BLENDER_VERSION = "5.2.0 LTS"
BLENDER_BUILD = "fbe6228777e7"
SCRIPT_VERSION = "phase-0.4-crt-proportion-gate-v1"
RENDER_RESOLUTION = (760, 570)
RENDER_ENGINE = "BLENDER_EEVEE"
RENDER_SAMPLES = 48
COLOR_MANAGEMENT = "AgX / Medium High Contrast"

PROVISIONAL_SELECTION = "A"
SELECTION_STATUS = (
    "provisional proportion-gate recommendation only; selected high-detail modelling is held "
    "for independent provenance and creative approval"
)
SELECTION_REASON = (
    "A most directly preserves the requested familiar 1990s domestic CRT character while its "
    "deep tube body, restrained asymmetry, and legible rear connection support the planned orbit."
)

OPTIONS = {
    "A": {
        "slug": "rounded-1990s-domestic-crt",
        "name": "Rounded 1990s domestic CRT",
        "dimensions_m": {"width": 0.84, "height": 0.69, "depth": 0.76},
        "screen_class_inches": 29,
        "screen_visible_m": {"width": 0.590, "height": 0.4425, "aspect": "4:3"},
        "corner_radius_m": 0.105,
        "rear_width_ratio": 0.53,
        "rear_height_ratio": 0.69,
        "screen_center_z_m": 0.425,
        "screen_bulge_m": 0.048,
        "front_band_height_m": 0.125,
        "cable_connection": "rear-lower right strain relief; custom power/signal cable drops directly to terrain",
        "strongest_quality": "Immediate recognition, generous curved glass, and soft deep-shell character closest to the requested era.",
        "strongest_risk": "Its familiar domestic softness could feel generic unless the final materials and rear silhouette are exceptionally resolved.",
        "scores": {
            "recognition": 5,
            "beauty": 4,
            "physical_weight": 4,
            "proving_ground_fit": 4,
            "camera_orbit": 5,
            "close_entry": 5,
        },
    },
    "B": {
        "slug": "heavy-late-1980s-box-crt",
        "name": "Heavier late-1980s box CRT",
        "dimensions_m": {"width": 0.90, "height": 0.74, "depth": 0.82},
        "screen_class_inches": 28,
        "screen_visible_m": {"width": 0.569, "height": 0.42675, "aspect": "4:3"},
        "corner_radius_m": 0.062,
        "rear_width_ratio": 0.62,
        "rear_height_ratio": 0.72,
        "screen_center_z_m": 0.455,
        "screen_bulge_m": 0.042,
        "front_band_height_m": 0.155,
        "cable_connection": "recessed rear-lower left service bay with broad moulded strain relief",
        "strongest_quality": "Most convincing mass and era-specific heft, with a rear volume that reads strongly from distance.",
        "strongest_risk": "The heavier bezel can suppress the screen and drift toward institutional equipment rather than cinematic domestic mystery.",
        "scores": {
            "recognition": 5,
            "beauty": 3,
            "physical_weight": 5,
            "proving_ground_fit": 5,
            "camera_orbit": 4,
            "close_entry": 3,
        },
    },
    "C": {
        "slug": "large-premium-floor-set-crt",
        "name": "Large premium floor-set CRT",
        "dimensions_m": {"width": 0.95, "height": 0.77, "depth": 0.78},
        "screen_class_inches": 32,
        "screen_visible_m": {"width": 0.650, "height": 0.4875, "aspect": "4:3"},
        "corner_radius_m": 0.090,
        "rear_width_ratio": 0.60,
        "rear_height_ratio": 0.70,
        "screen_center_z_m": 0.475,
        "screen_bulge_m": 0.055,
        "front_band_height_m": 0.145,
        "cable_connection": "protected side-rear lower channel feeding a compact integrated strain relief",
        "strongest_quality": "Largest portal destination and strongest premium front composition, with excellent final-approach screen presence.",
        "strongest_risk": "The wider integrated lower band could imply a modern media console unless final detailing remains firmly period-authentic.",
        "scores": {
            "recognition": 5,
            "beauty": 5,
            "physical_weight": 5,
            "proving_ground_fit": 4,
            "camera_orbit": 4,
            "close_entry": 5,
        },
    },
}

CRITERIA = (
    "recognition",
    "beauty",
    "physical_weight",
    "proving_ground_fit",
    "camera_orbit",
    "close_entry",
)

VIEWS = {
    "front": {
        "location": (0.0, -4.8, 0.53),
        "target": (0.0, 0.0, 0.36),
        "ortho_scale": 1.34,
    },
    "side": {
        "location": (4.8, 0.0, 0.53),
        "target": (0.0, 0.0, 0.36),
        "ortho_scale": 1.34,
    },
    "rear": {
        "location": (0.0, 4.8, 0.53),
        "target": (0.0, 0.0, 0.36),
        "ortho_scale": 1.34,
    },
    "top": {
        "location": (0.0, 0.0, 5.0),
        "target": (0.0, 0.0, 0.0),
        "ortho_scale": 1.42,
    },
    "three-quarter-front": {
        "location": (3.4, -4.3, 2.35),
        "target": (0.0, 0.0, 0.34),
        "ortho_scale": 1.48,
    },
    "three-quarter-rear": {
        "location": (-3.4, 4.3, 2.25),
        "target": (0.0, 0.0, 0.34),
        "ortho_scale": 1.48,
    },
}
