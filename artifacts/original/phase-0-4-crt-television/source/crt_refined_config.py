"""Deterministic configuration for the selected Phase 0.4 CRT refinement."""

from __future__ import annotations

from pathlib import Path


SOURCE_DIR = Path(__file__).resolve().parent
PACKAGE_DIR = SOURCE_DIR.parent
WORK_DIR = PACKAGE_DIR / "work"
DIAGNOSTIC_DIR = WORK_DIR / "refinement-diagnostics"
RENDER_DIR = PACKAGE_DIR / "renders" / "refined"
REVIEW_DIR = PACKAGE_DIR
MANIFEST_DIR = PACKAGE_DIR / "manifests"

REFINED_BLEND = SOURCE_DIR / "quantum-signal-television-v1.blend"
PORTAL_LAYOUT = PACKAGE_DIR / "crt-portal-layout.json"
PORTAL_LAYOUT_SHA256 = "255c5b1499857ab8a2409adf368543efa0d6f9bfe3171e8a0a0a680e2caf31cc"
SCRIPT_VERSION = "phase-0.4-crt-refinement-v1"

DIMENSIONS_M = {"width": 0.84, "height": 0.69, "depth": 0.76}
SCREEN_CLASS_INCHES = 29
SCREEN_VISIBLE_M = {"width": 0.590, "height": 0.4425, "aspect": "4:3"}
TV_OFFSET = (0.65, 0.28, 0.0)
DESKTOP_SPIRAL_TURNS = 2.5
MOBILE_SPIRAL_TURNS = 2.25

BLENDER_VERSION = "5.2.0 LTS"
BLENDER_BUILD = "fbe6228777e7"
ITERATION_ENGINE = "BLENDER_EEVEE"
ITERATION_SAMPLES = 64
DIAGNOSTIC_RESOLUTION = (1600, 1000)
CANONICAL_RESOLUTION = (1920, 1200)
COLOR_MANAGEMENT = "AgX / Medium High Contrast"

DIAGNOSTIC_STATES = {
    "dormant-hero": {
        "camera": "Camera_Dormant_Hero",
        "conduction_progress": 0.0,
        "indicator": 0.0,
        "phosphor": "off",
        "interface": False,
        "glass_proof": False,
    },
    "conductor-macro": {
        "camera": "Camera_Conductor_Macro",
        "conduction_progress": 0.40,
        "indicator": 0.0,
        "phosphor": "off",
        "interface": False,
        "glass_proof": False,
    },
    "rear-arrival": {
        "camera": "Camera_Rear_Arrival",
        "conduction_progress": 0.985,
        "indicator": 0.0,
        "phosphor": "off",
        "interface": False,
        "glass_proof": False,
    },
    "crt-wake": {
        "camera": "Camera_CRT_Wake",
        "conduction_progress": 1.0,
        "indicator": 1.0,
        "phosphor": "wake-line",
        "interface": False,
        "glass_proof": False,
    },
    "glass-grazing": {
        "camera": "Camera_Glass_Grazing",
        "conduction_progress": 0.0,
        "indicator": 0.0,
        "phosphor": "off",
        "interface": False,
        "glass_proof": True,
    },
}

CAMERAS = {
    "Camera_Dormant_Hero": {
        "location": (3.45, -4.65, 1.52),
        "target": (0.35, 0.16, 0.30),
        "lens": 55.0,
    },
    "Camera_Conductor_Macro": {
        "location": (-1.00, -1.78, 1.85),
        "target": (-0.10, -1.11, 0.052),
        "lens": 98.0,
    },
    "Camera_Rear_Arrival": {
        "location": (3.72, 4.55, 1.50),
        "target": (0.68, 0.39, 0.29),
        "lens": 58.0,
    },
    "Camera_CRT_Wake": {
        "location": (2.28, -3.82, 1.18),
        "target": (0.65, 0.02, 0.39),
        "lens": 66.0,
    },
    "Camera_Glass_Grazing": {
        "location": (3.25, -2.25, 0.76),
        "target": (0.82, -0.140, 0.425),
        "lens": 112.0,
    },
    "Camera_Front_Design": {
        "location": (0.65, -4.8, 0.55),
        "target": (0.65, 0.28, 0.35),
        "lens": 68.0,
    },
    "Camera_Side_Design": {
        "location": (4.9, 0.28, 0.55),
        "target": (0.65, 0.28, 0.35),
        "lens": 68.0,
    },
    "Camera_Rear_Design": {
        "location": (0.65, 5.0, 1.28),
        "target": (0.65, 0.28, 0.35),
        "lens": 68.0,
    },
    "Camera_ThreeQuarter_Front_Design": {
        "location": (3.65, -4.0, 1.82),
        "target": (0.65, 0.28, 0.34),
        "lens": 64.0,
    },
    "Camera_ThreeQuarter_Rear_Design": {
        "location": (-2.35, 4.2, 1.76),
        "target": (0.65, 0.28, 0.34),
        "lens": 64.0,
    },
    "Camera_Cabinet_Material": {
        "location": (3.15, 2.45, 1.28),
        "target": (0.68, 0.34, 0.39),
        "lens": 82.0,
    },
    "Camera_Controls_Macro": {
        "location": (1.48, -1.92, 0.36),
        "target": (0.80, -0.055, 0.105),
        "lens": 104.0,
    },
    "Camera_Speaker_Macro": {
        "location": (-0.48, -1.82, 0.36),
        "target": (0.40, -0.055, 0.105),
        "lens": 108.0,
    },
    "Camera_Rear_Detail": {
        "location": (1.72, 2.28, 0.78),
        "target": (0.74, 0.59, 0.34),
        "lens": 92.0,
    },
    "Camera_Connector_Macro": {
        "location": (1.76, 1.58, 0.42),
        "target": (0.855, 0.66, 0.14),
        "lens": 112.0,
    },
    "Camera_Path_Arrival": {
        "location": (3.45, -4.65, 1.52),
        "target": (0.35, 0.16, 0.30),
        "lens": 55.0,
    },
    "Camera_Path_30": {
        "location": (2.62, -4.72, 1.46),
        "target": (0.43, 0.10, 0.33),
        "lens": 59.0,
    },
    "Camera_Path_60": {
        "location": (1.79, -4.42, 1.31),
        "target": (0.51, 0.03, 0.36),
        "lens": 64.0,
    },
    "Camera_Path_NearFrontal": {
        "location": (1.03, -3.80, 1.04),
        "target": (0.60, -0.02, 0.40),
        "lens": 70.0,
    },
    "Camera_Power_Front": {
        "location": (0.93, -3.54, 1.10),
        "target": (0.62, -0.01, 0.40),
        "lens": 74.0,
    },
    "Camera_Raster_Close": {
        "location": (0.80, -2.34, 0.82),
        "target": (0.64, -0.075, 0.425),
        "lens": 86.0,
    },
    "Camera_Portal_03_CloseApproach": {
        "location": (0.80, -2.04, 0.72),
        "target": (0.64, -0.090, 0.425),
        "lens": 80.0,
    },
    "Camera_Portal_04_GlassAlmostFills": {
        "location": (0.75, -1.22, 0.55),
        "target": (0.65, -0.102, 0.425),
        "lens": 66.0,
    },
    "Camera_Portal_05_BezelExits": {
        "location": (0.70, -0.76, 0.46),
        "target": (0.65, -0.108, 0.425),
        "lens": 58.0,
    },
    "Camera_Portal_06_TextFree": {
        "location": (0.65, -0.55, 0.425),
        "target": (0.65, -0.112, 0.425),
        "lens": 48.0,
    },
    "Camera_Mobile_Dormant": {
        "location": (2.58, -4.52, 2.62),
        "target": (0.34, 0.04, 0.72),
        "lens": 58.0,
    },
    "Camera_Reduced_Desktop": {
        "location": (3.58, -4.82, 1.58),
        "target": (0.40, 0.14, 0.32),
        "lens": 57.0,
    },
    "Camera_Reduced_Mobile": {
        "location": (2.48, -4.42, 2.58),
        "target": (0.32, 0.02, 0.75),
        "lens": 60.0,
    },
}
