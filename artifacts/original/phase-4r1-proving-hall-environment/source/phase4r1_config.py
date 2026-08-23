"""Deterministic authority for Phase 4-R1: The Proving Hall.

The R1 source is a derivative of the exact Phase 4-R0 camera/signal/threshold
authority.  R1 adds only authored physical-world environment, extended cable
families, a credible distribution source, local current response, and revised
two-stage camera rigs.  It remains preproduction: the full production render
and runtime integration are explicitly outside this configuration.
"""

from __future__ import annotations

from collections import OrderedDict
from pathlib import Path


SOURCE_DIR = Path(__file__).resolve().parent
PACKAGE_DIR = SOURCE_DIR.parent
REPOSITORY_ROOT = SOURCE_DIR.parents[3]

ACCEPTED_PHASE4R0_COMMIT = "4fd17810d47697785e66584a7ef40199ff597ba1"
ACCEPTED_PHASE4R0_SOURCE = (
    REPOSITORY_ROOT
    / "artifacts"
    / "original"
    / "phase-4r0-orbit-signal-threshold"
    / "source"
    / "quantum-signal-television-phase4r0-orbit-signal-threshold.blend"
)
ACCEPTED_PHASE4R0_SHA256 = "838f304a0f029f5570c1ede2b4ce20c7e7475571f1e7e4fb7d6286e5536e72d3"
DERIVATIVE_SOURCE = SOURCE_DIR / "quantum-signal-television-phase4r1-proving-hall.blend"
BUILD_REPORT = SOURCE_DIR / "phase4r1-source-build.json"
VALIDATION_REPORT = SOURCE_DIR / "phase4r1-source-validation.json"
ASSET_LEDGER = SOURCE_DIR / "phase4r1-asset-ledger.json"

Q_REVERSED_SOURCE = REPOSITORY_ROOT / "public" / "brand" / "quantum-icon-white.svg"
Q_REVERSED_SHA256 = "c660ed87bc5293bfbffa662e523343a7e83bc86cb94848912494e85e0dc9d4ff"
Q_COLOR_SOURCE = REPOSITORY_ROOT / "public" / "brand" / "quantum-icon-color.svg"
Q_COLOR_SHA256 = "04dc37965b33587fea5f4664660f8a7f9a81ec7904d39925b41c6826b80cded9"

FPS = 30
FRAME_START = 1
FRAME_END = 540
DURATION_SECONDS = 18.0

EVENTS = OrderedDict(
    [
        ("dormancy_start", 1),
        ("dormancy_hold_end", 45),
        ("conduction_start", 46),
        ("orbit_45", 76),
        ("orbit_90_conduction_25", 106),
        ("orbit_135", 136),
        ("orbit_180_conduction_50", 165),
        ("orbit_225", 195),
        ("orbit_270_conduction_75", 225),
        ("orbit_315", 255),
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

ORBIT_TARGET = (0.65, 0.0, 0.425)
START_ANGLE_DEGREES = -90.0
END_ANGLE_DEGREES = 270.0
ORBIT_DIRECTION = "counter-clockwise viewed from +Z"

HALL = {
    "width_x_m": 34.0,
    "depth_y_m": 24.0,
    "clear_height_m": 10.0,
    "floor_top_z_m": 0.0,
    "column_grid_x_m": (-14.5, -7.0, 7.0, 14.5),
    "column_grid_y_m": (-9.5, 9.5),
    "catwalk_y_m": 10.35,
    "catwalk_deck_z_m": 4.65,
    "crane_rail_z_m": 7.65,
    # The source is a compact, credible foreground infrastructure layer rather
    # than the opening hero.  Moving it deeper into the bay keeps the complete
    # station readable in portrait while leaving upper/deep architecture in
    # the establishing composition.
    "distribution_station_location_m": (-0.15, -1.65, 1.08),
    "socket_world_m": (0.22, -1.935, 0.95),
    # The cable now leaves a visibly separate relief axially before it bends
    # toward the supported floor transition.  These two points are shared by
    # the modeled hardware, route builder, preflight, and evidence cameras.
    "cable_exit_world_m": (0.22, -2.620, 0.95),
    "floor_transition_world_m": (0.08, -4.30, 0.115),
    # The accepted CRT collar remains at y=.91.  The authored R1 cable now
    # reaches the *outer* face of the rubber gland at y=1.14 and travels the
    # final 0.20 m along -Y, making the insertion physically auditable.
    "crt_rear_connection_world_m": (0.65, 0.91, 0.30),
    "crt_gland_cable_entry_world_m": (0.65, 1.14, 0.30),
    "crt_gland_axial_approach_world_m": (0.65, 2.10, 0.30),
}

# The first 106 frames use family-authored hall/source targets and converge to
# the accepted CRT centre exactly at F106.  Mobile has additional authored
# milestones so the complete source is safe at F1/F76 and the active front,
# substantial connected trail and CRT remain safe thereafter.  F285+ remains
# governed by the unchanged accepted orbit target.
ESTABLISHING_AIM_KEYS = {
    "desktop": (
        (1, (0.30, 1.00, 2.70)),
        (45, (0.30, 1.00, 2.70)),
        (46, (0.30, 1.00, 2.70)),
        (76, (0.398, 0.72, 1.63)),
        (106, ORBIT_TARGET),
        (540, ORBIT_TARGET),
    ),
    "mobile": (
        (1, (0.25, -0.45, 1.10)),
        (45, (0.25, -0.45, 1.10)),
        (46, (0.25, -0.45, 1.10)),
        (76, (0.18, -1.20, 0.86)),
        (106, ORBIT_TARGET),
        (540, ORBIT_TARGET),
    ),
    "landscape": (
        (1, (0.30, 1.00, 2.70)),
        (45, (0.30, 1.00, 2.70)),
        (46, (0.30, 1.00, 2.70)),
        (76, (0.398, 0.72, 1.63)),
        (106, ORBIT_TARGET),
        (540, ORBIT_TARGET),
    ),
}
# Backward-compatible desktop alias used only by schema consumers that do not
# yet understand family-specific target keys.
ESTABLISHING_AIM = ESTABLISHING_AIM_KEYS["desktop"][0][1]

# Each family has a separately authored route.  ``turns`` includes only the
# broad inward spiral; the source lead and rear connection are additional.
CABLE_SPECS = {
    "desktop": {
        "turns": 3.50,
        "outer_radius_m": 5.50,
        "inner_radius_m": 1.48,
        "diameter_m": 0.054,
        "segments": 160,
        "route_samples": 721,
        "phase_offset_degrees": 0.0,
        "route_irregularity": 1.0,
        "x_scale": 1.0,
        "lead_x_scale": 1.0,
        "lead_excursion_m": 0.72,
        "lead_midpoint_offset_xy_m": (-0.28, -0.65),
        "lead_midpoint_z_m": 0.17,
        "lead_start_tangent_xyz": (-0.38, -0.91, 0.16),
        "lead_midpoint_tangent_xyz": (0.25, -0.968, 0.0),
        "lead_start_handle_m": 0.38,
        "lead_mid_handle_m": 0.45,
        "lead_second_start_handle_m": 0.45,
        "lead_end_handle_m": 0.42,
        "source_drop_vertical_handle_m": 0.38,
        "connector_style": "left_semicircle",
        "connector_departure_handle_m": 0.18,
        "lead_control_y_m": (-6.20, -6.05),
        "collection": "PHASE4R1_CABLE_DESKTOP",
    },
    "mobile": {
        "turns": 3.00,
        "outer_radius_m": 2.70,
        "inner_radius_m": 1.00,
        "diameter_m": 0.054,
        "segments": 144,
        "route_samples": 641,
        "phase_offset_degrees": 0.0,
        "route_irregularity": 0.65,
        "x_scale": 0.40,
        "inner_x_scale": 0.52,
        "lead_x_scale": 0.35,
        "lead_excursion_m": 0.356,
        "lead_midpoint_offset_xy_m": (-0.356, 0.192),
        "lead_start_tangent_xyz": (-0.836, -0.548, -0.08),
        "lead_midpoint_tangent_xyz": (0.0, 1.0, 0.0),
        "lead_start_handle_m": 0.183,
        "lead_mid_handle_m": 0.183,
        "source_drop_vertical_handle_m": 0.38,
        "connector_style": "right_semicircle",
        "connector_departure_handle_m": 0.0,
        "connector_midpoint_z_m": 0.42,
        "connector_first_lift_control_z_m": 0.56,
        "connector_second_departure_control_z_m": 0.29,
        "connector_intent": "immediate supported rise toward rear gland clears the preceding floor turn",
        "lead_control_y_m": (-5.30, -4.40),
        "collection": "PHASE4R1_CABLE_MOBILE",
    },
    "landscape": {
        "turns": 3.25,
        "outer_radius_m": 5.25,
        "inner_radius_m": 1.45,
        "diameter_m": 0.054,
        "segments": 152,
        "route_samples": 681,
        "phase_offset_degrees": 0.0,
        "route_irregularity": 0.88,
        "x_scale": 0.88,
        "lead_x_scale": 0.88,
        "lead_excursion_m": 0.68,
        "lead_midpoint_offset_xy_m": (-0.25, -0.61),
        "lead_midpoint_z_m": 0.16,
        "lead_start_tangent_xyz": (-0.38, -0.91, 0.16),
        "lead_midpoint_tangent_xyz": (0.25, -0.968, 0.0),
        "lead_start_handle_m": 0.36,
        "lead_mid_handle_m": 0.45,
        "lead_second_start_handle_m": 0.45,
        "lead_end_handle_m": 0.40,
        "source_drop_vertical_handle_m": 0.38,
        "connector_style": "direct_quarter_turn",
        "lead_control_y_m": (-6.10, -5.80),
        "collection": "PHASE4R1_CABLE_LANDSCAPE",
    },
}

CURRENT = {
    "front_width_fraction": 0.055,
    "front_strength_eevee": 1.55,
    "trail_strength_eevee": 0.52,
    "front_strength_cycles": 2.40,
    "trail_strength_cycles": 0.82,
    "color_srgb": "#C52B68",
    "local_response_sites": 4,
    "local_response_front_energy_w": 6.0,
    "local_response_trail_energy_w": 1.5,
}

CAMERA_SPECS = {
    "desktop": {
        "start_radius_m": 11.40,
        "completion_radius_m": 3.40,
        "start_elevation_m": 7.7310,
        "level_90_elevation_m": 1.85,
        "completion_elevation_m": 0.72,
        "start_lens_mm": 25.3,
        "start_shift_y": -0.160,
        "start_shift_x": 0.0,
        "completion_lens_mm": 46.0,
        "push_lens_mm": 32.0,
        "resolution": (960, 600),
        "presentation": (1440, 900),
        "camera": "Phase4R1_Camera_Desktop",
        "rig": "Phase4R1_OrbitRig_Desktop",
    },
    "mobile": {
        "start_radius_m": 12.00,
        "completion_radius_m": 2.82,
        "start_elevation_m": 6.47,
        "level_90_elevation_m": 1.55,
        "completion_elevation_m": 0.66,
        "start_lens_mm": 74.0,
        "start_shift_y": -0.128,
        "start_shift_x": 0.003,
        "lens_keys": (
            (1, 74.0), (45, 74.0), (46, 74.0), (76, 24.0),
            (106, 24.0), (165, 24.0), (225, 24.0), (255, 40.0),
            (285, 56.0), (405, 56.0), (460, 39.0), (480, 35.0),
            (500, 35.0), (540, 35.0),
        ),
        "shift_y_keys": (
            (1, -0.128), (45, -0.128), (46, -0.128),
            (76, 0.0), (106, 0.0), (165, 0.0),
            (225, 0.0), (255, -0.010), (285, 0.0), (540, 0.0),
        ),
        "shift_x_keys": (
            (1, 0.003), (45, 0.003), (46, 0.003),
            (76, 0.0), (106, 0.0), (165, 0.0),
            (225, 0.0), (255, -0.020), (285, 0.0), (540, 0.0),
        ),
        "completion_lens_mm": 56.0,
        "push_lens_mm": 35.0,
        "resolution": (390, 844),
        "presentation": (390, 844),
        "camera": "Phase4R1_Camera_Mobile",
        "rig": "Phase4R1_OrbitRig_Mobile",
    },
    "landscape": {
        "start_radius_m": 11.40,
        "completion_radius_m": 3.55,
        "start_elevation_m": 7.7310,
        "level_90_elevation_m": 1.70,
        "completion_elevation_m": 0.58,
        "start_lens_mm": 20.0,
        "start_shift_y": -0.120,
        "start_shift_x": 0.0,
        "completion_lens_mm": 42.0,
        "push_lens_mm": 30.0,
        "resolution": (844, 390),
        "presentation": (844, 390),
        "camera": "Phase4R1_Camera_Landscape",
        "rig": "Phase4R1_OrbitRig_Landscape",
    },
}

TIMELINE = [
    ("DISTANT PROVING-HALL DORMANCY", 1, 45),
    ("CONDUCTION + FULL ORBIT", 46, 285),
    ("CRT ACTIVATION", 286, 355),
    ("Q HOLD", 356, 405),
    ("FRONTAL APPROACH", 406, 480),
    ("PHYSICAL THRESHOLD", 481, 500),
    ("BREATHING BEAT", 501, 513),
    ("ENTRY RESOLUTION", 514, 540),
]

EXTERNAL_ASSETS: tuple[dict[str, str], ...] = ()


def normalized(frame: int) -> float:
    return (int(frame) - FRAME_START) / (FRAME_END - FRAME_START)
