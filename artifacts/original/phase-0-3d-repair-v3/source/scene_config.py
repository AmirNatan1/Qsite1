"""Shared deterministic configuration for the Phase 0.3 aperture-station gate."""

from __future__ import annotations

from pathlib import Path


SOURCE_DIR = Path(__file__).resolve().parent
PACKAGE_DIR = SOURCE_DIR.parent
PACKAGE_ROOT = PACKAGE_DIR
RENDER_DIR = PACKAGE_DIR / "renders"
BLOCKOUT_RENDER_DIR = RENDER_DIR / "blockouts"
ARCHIVE_BLOCKOUT_RENDER_DIR = RENDER_DIR / "blockouts-iteration-1"
REVIEW_DIR = PACKAGE_DIR / "review"
MANIFEST_DIR = PACKAGE_DIR / "manifests"
WORK_DIR = PACKAGE_DIR / "work"

BLOCKOUT_BLEND = SOURCE_DIR / "quantum-aperture-station-v3-blockouts.blend"
FINAL_BLEND = SOURCE_DIR / "quantum-aperture-station-v3.blend"
BLOCKOUT_RESOLUTION = (1024, 768)
CANONICAL_STILL_RESOLUTION = (1920, 1200)
DESIGN_RESOLUTION = (2048, 1536)
MATERIAL_RESOLUTION = (1800, 1200)
DESKTOP_TABLET_VIEWPORTS = ((1440, 900), (1366, 650), (1280, 800), (1024, 768), (768, 1024))
MOBILE_VIEWPORTS = ((390, 844), (360, 800), (320, 800), (844, 390))
SILHOUETTE_SHEET = REVIEW_DIR / "aperture-station-silhouette-options.png"
SILHOUETTE_MANIFEST = MANIFEST_DIR / "silhouette-decision-manifest.json"

RECOMMENDED_OPTION = "A"
ITERATION = 3
RECOMMENDATION_STATUS = "iteration-3 pre-refinement recommendation; requires independent and human creative acceptance"
RECOMMENDATION_REASON = "Option A best balances a non-rectangular blade, offset protected recess, load-bearing service spine, controlled portal approach, and narrow-crop readability."

OPTIONS = {
    "A": {
        "name": "Inclined optical blade",
        "dimensions_m": {"width": 1.86, "height": 1.24, "depth": 0.72},
        "cable_entry": "Below-grade rear service raceway disappearing beneath the integrated foundation",
        "portal_approach": "Controlled frontal approach into the protected elliptical recess",
        "rationale_15_words": "Inclined blade frames protected optics while asymmetric foundations communicate calibrated industrial purpose at architectural scale.",
        "strongest_risk": "Could become a display slab unless depth, service spine, and ground interface remain unmistakably physical.",
        "scores": {
            "uniqueness": 4,
            "industrial_credibility": 4,
            "non_appliance_distance": 4,
            "q_negative_space": 4,
            "activation_potential": 4,
            "portal_potential": 4,
            "orbit_readability": 4,
            "responsive_readability": 3,
        },
    },
    "B": {
        "name": "Twin-mass calibration station",
        "dimensions_m": {"width": 1.92, "height": 1.12, "depth": 0.82},
        "cable_entry": "Below-grade side trench entering beneath the smaller calibration mass",
        "portal_approach": "Shallow diagonal approach through the optical void between unequal masses",
        "rationale_15_words": "Unequal twin masses create robust calibration tension, grounding optical exchange within believable serviceable field infrastructure.",
        "strongest_risk": "May resemble specialized surveying equipment or a paired industrial camera at medium distance.",
        "scores": {
            "uniqueness": 4,
            "industrial_credibility": 4,
            "non_appliance_distance": 4,
            "q_negative_space": 4,
            "activation_potential": 4,
            "portal_potential": 4,
            "orbit_readability": 4,
            "responsive_readability": 3,
        },
    },
    "C": {
        "name": "Cantilevered optical station",
        "dimensions_m": {"width": 1.78, "height": 1.18, "depth": 0.78},
        "cable_entry": "Below-grade rear foundation raceway turning into the sheltered optical bay",
        "portal_approach": "Off-axis sweep beneath the cantilever before frontal optical alignment",
        "rationale_15_words": "Cantilevered shell shelters recessed optics, creates dramatic approach, and preserves low anchored silhouette across viewports.",
        "strongest_risk": "May drift toward a sculptural monument or generic exhibition portal if over-refined.",
        "scores": {
            "uniqueness": 5,
            "industrial_credibility": 4,
            "non_appliance_distance": 4,
            "q_negative_space": 4,
            "activation_potential": 3,
            "portal_potential": 4,
            "orbit_readability": 4,
            "responsive_readability": 3,
        },
    },
}

VIEWS = {
    "front": {
        "location": (0.0, -5.8, 0.82),
        "target": (0.0, 0.0, 0.60),
        "ortho_scale": 2.45,
    },
    "side": {
        "location": (5.8, 0.0, 0.82),
        "target": (0.0, 0.0, 0.60),
        "ortho_scale": 2.45,
    },
    "top": {
        "location": (0.0, 0.0, 6.2),
        "target": (0.0, 0.0, 0.0),
        "ortho_scale": 2.70,
    },
    "three-quarter": {
        "location": (4.5, -5.3, 2.9),
        "target": (0.0, 0.0, 0.55),
        "ortho_scale": 2.65,
    },
}

CRITERIA = (
    "uniqueness",
    "industrial_credibility",
    "non_appliance_distance",
    "q_negative_space",
    "activation_potential",
    "portal_potential",
    "orbit_readability",
    "responsive_readability",
)
