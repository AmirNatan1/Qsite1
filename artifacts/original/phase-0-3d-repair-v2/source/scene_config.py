"""Authoritative Phase 0.2 Integrated Aperture Chassis contracts."""

from __future__ import annotations

from pathlib import Path


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = PACKAGE_ROOT / "source"
RENDER_DIR = PACKAGE_ROOT / "renders"
REVIEW_DIR = PACKAGE_ROOT / "review"
MANIFEST_DIR = PACKAGE_ROOT / "manifests"
WORK_DIR = PACKAGE_ROOT / "work"

BLOCKOUT_BLEND = SOURCE_DIR / "field-unit-v2-blockouts.blend"
FINAL_BLEND = SOURCE_DIR / "field-unit-v2-integrated-aperture-chassis.blend"

BLOCKOUT_OPTIONS = {
    "A": {
        "name": "Recessed Optical Chassis",
        "rationale": "Recessed optics merge identity, protection, and premium industrial restraint cleanly.",
        "risk": "Circular precision may overpower the asymmetric chassis if its reveal grows.",
    },
    "B": {
        "name": "Calibration Drum",
        "rationale": "Embedded drum makes calibration legible while preserving grounded horizontal authority.",
        "risk": "The cylindrical mass may read as a camera or pressure vessel.",
    },
    "C": {
        "name": "Split-Shell Instrument",
        "rationale": "Split shells create integrated aperture tension and distinctive asymmetric recognition.",
        "risk": "The shell division may feel decorative and weaken manufacturing plausibility.",
    },
}

BLOCKOUT_VIEWS = {
    "front": {"location": (0.0, -10.8, 2.15), "target": (0.0, 0.0, 0.92), "ortho_scale": 7.6},
    "side": {"location": (10.8, 0.0, 2.1), "target": (0.0, 0.0, 0.9), "ortho_scale": 7.6},
    "top": {"location": (0.0, -0.01, 11.6), "target": (0.0, 0.0, 0.3), "ortho_scale": 7.6},
    "three-quarter": {"location": (7.6, -8.3, 4.6), "target": (0.0, 0.0, 0.85), "ortho_scale": 8.2},
}

BLOCKOUT_RESOLUTION = (1400, 1050)
CANONICAL_STILL_RESOLUTION = (1920, 1200)
DESIGN_RESOLUTION = (2048, 1536)
MATERIAL_RESOLUTION = (1600, 1200)
DESKTOP_TABLET_VIEWPORTS = ((1440, 900), (1366, 650), (1280, 800), (1024, 768), (768, 1024))
MOBILE_VIEWPORTS = ((390, 844), (360, 800), (320, 800), (844, 390))

SELECTED_OPTION = "A"
SELECTED_REASON = (
    "Option A best satisfies the integrated recessed-aperture requirement while keeping "
    "the chassis low, wide, asymmetric, optically dormant and manufacturable."
)
