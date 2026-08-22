"""Deterministic configuration for the Phase 4-R0 orbit previsualization.

This is a low-cost creative gate, not a production-render configuration.  It
inherits the accepted Phase 3-R physical scene and replaces only the camera,
timeline, signal mark, and preview lighting needed to judge choreography.
"""

from __future__ import annotations

from collections import OrderedDict
from pathlib import Path


SOURCE_DIR = Path(__file__).resolve().parent
PACKAGE_DIR = SOURCE_DIR.parent
REPOSITORY_ROOT = SOURCE_DIR.parents[3]

ACCEPTED_PHASE4_PARENT = "ce7bd0cb61bf4b9abd81303d89c5ac1aef089e0c"
ACCEPTED_PHASE3R_SOURCE = (
    REPOSITORY_ROOT
    / "artifacts"
    / "original"
    / "phase-3-crt-opening"
    / "source"
    / "quantum-signal-television-phase3-r-crt-authenticity.blend"
)
ACCEPTED_PHASE3R_SHA256 = "4341a3fb7ae29ef9be4472ea23ca9235e36f9609893bc2f37de32e5847d36f26"
DERIVATIVE_SOURCE = SOURCE_DIR / "quantum-signal-television-phase4r0-orbit-signal-threshold.blend"
BUILD_REPORT = SOURCE_DIR / "phase4r0-source-build.json"

Q_COLOR_SOURCE = REPOSITORY_ROOT / "public" / "brand" / "quantum-icon-color.svg"
Q_COLOR_SHA256 = "04dc37965b33587fea5f4664660f8a7f9a81ec7904d39925b41c6826b80cded9"
Q_REVERSED_SOURCE = REPOSITORY_ROOT / "public" / "brand" / "quantum-icon-white.svg"
Q_REVERSED_SHA256 = "c660ed87bc5293bfbffa662e523343a7e83bc86cb94848912494e85e0dc9d4ff"

FPS = 30
FRAME_START = 1
FRAME_END = 540
DURATION_SECONDS = FRAME_END / FPS

EVENTS = OrderedDict(
    [
        ("dormancy_start", 1),
        ("dormancy_hold_end", 45),
        ("conduction_start", 46),
        ("conduction_25", 106),
        ("conduction_50", 165),
        ("conduction_75", 225),
        ("orbit_complete_current_arrival", 285),
        ("indicator_response", 292),
        ("horizontal_line_start", 300),
        ("horizontal_line_peak", 308),
        ("horizontal_line_end", 315),
        ("raster_expansion_start", 316),
        ("raster_expansion_end", 335),
        ("settling_start", 336),
        ("black_stabilized", 355),
        ("q_first_readable", 356),
        ("q_stable", 370),
        ("q_hold_end", 405),
        ("frontal_push_start", 406),
        ("late_approach", 460),
        ("glass_fill", 480),
        ("threshold_crossing", 500),
        ("breathing_start", 501),
        ("breathing_middle", 510),
        ("semantic_geometry_start", 514),
        ("h1_first_readable", 525),
        ("semantic_half_reveal", 531),
        ("settled_entry", 540),
    ]
)

# The orbit target is the accepted CRT screen/cabinet centre.  Each camera is
# parented to an empty at this point; a monotonic 0 -> 2pi Z rotation supplies
# the genuine orbit while local radius and elevation contract independently.
ORBIT_TARGET = (0.65, 0.0, 0.425)
START_ANGLE_DEGREES = -90.0
END_ANGLE_DEGREES = 270.0
ORBIT_DIRECTION = "counter-clockwise viewed from +Z"

CAMERA_SPECS = {
    "desktop": {
        "start_radius": 12.0,
        "completion_radius": 3.25,
        "start_elevation": 4.80,
        "completion_elevation": 0.75,
        "start_lens_mm": 40.0,
        "completion_lens_mm": 46.0,
        "push_lens_mm": 32.0,
        "resolution": (960, 600),
        "presentation": (1440, 900),
        "camera": "Phase4R0_Camera_Desktop",
        "rig": "Phase4R0_OrbitRig_Desktop",
    },
    "mobile": {
        "start_radius": 8.0,
        "completion_radius": 2.70,
        "start_elevation": 4.60,
        "completion_elevation": 0.68,
        "start_lens_mm": 50.0,
        "completion_lens_mm": 56.0,
        "push_lens_mm": 35.0,
        "resolution": (390, 844),
        "presentation": (390, 844),
        "camera": "Phase4R0_Camera_Mobile",
        "rig": "Phase4R0_OrbitRig_Mobile",
    },
    "landscape": {
        "start_radius": 11.5,
        "completion_radius": 3.45,
        "start_elevation": 3.20,
        "completion_elevation": 0.55,
        "start_lens_mm": 36.0,
        "completion_lens_mm": 42.0,
        "push_lens_mm": 30.0,
        "resolution": (844, 390),
        "presentation": (844, 390),
        "camera": "Phase4R0_Camera_Landscape",
        "rig": "Phase4R0_OrbitRig_Landscape",
    },
}

SCROLL_PROPOSALS_VH = {
    "desktop": OrderedDict(
        [
            ("distant_dormancy", 0.45),
            ("conduction_orbit", 3.00),
            ("activation_q_hold", 0.90),
            ("frontal_approach_threshold", 1.10),
            ("breathing_semantic_reveal", 0.80),
        ]
    ),
    "short_desktop": OrderedDict(
        [
            ("distant_dormancy", 0.40),
            ("conduction_orbit", 2.60),
            ("activation_q_hold", 0.80),
            ("frontal_approach_threshold", 0.95),
            ("breathing_semantic_reveal", 0.70),
        ]
    ),
    "mobile": OrderedDict(
        [
            ("distant_dormancy", 0.35),
            ("conduction_orbit", 2.25),
            ("activation_q_hold", 0.70),
            ("frontal_approach_threshold", 0.85),
            ("breathing_semantic_reveal", 0.70),
        ]
    ),
    "mobile_landscape": OrderedDict(
        [
            ("distant_dormancy", 0.35),
            ("conduction_orbit", 2.35),
            ("activation_q_hold", 0.75),
            ("frontal_approach_threshold", 0.90),
            ("breathing_semantic_reveal", 0.75),
        ]
    ),
}

TIMELINE = [
    ("DISTANT DORMANCY", 1, 45, "wide proving field; full spiral authority"),
    ("CONDUCTION + 360 ORBIT", 46, 285, "monotonic orbit and inward current complete together"),
    ("CRT ACTIVATION", 286, 355, "indicator, neutral line, continuous raster, black settling"),
    ("Q HOLD", 356, 405, "approved Q becomes readable and holds at the frontal camera"),
    ("FRONTAL APPROACH", 406, 480, "direct screen-axis push; Q remains physically embedded"),
    ("THRESHOLD", 481, 500, "glass fills frame and camera crosses the physical surface"),
    ("BREATHING BEAT", 501, 513, "bounded deep digital black; document position remains authoritative"),
    ("ENTRY RESOLUTION", 514, 540, "semantic field and exact H1 resolve progressively"),
]


def normalized(frame: int) -> float:
    return (int(frame) - FRAME_START) / (FRAME_END - FRAME_START)
