"""Deterministic production configuration for the Phase 3 CRT opening."""

from __future__ import annotations

from collections import OrderedDict
from pathlib import Path


SOURCE_DIR = Path(__file__).resolve().parent
PACKAGE_DIR = SOURCE_DIR.parent
REPOSITORY_ROOT = PACKAGE_DIR.parents[2]

ACCEPTED_SOURCE = (
    REPOSITORY_ROOT
    / "artifacts"
    / "original"
    / "phase-0-4-crt-television"
    / "source"
    / "quantum-signal-television-v1.blend"
)
ACCEPTED_SOURCE_SHA256 = "3027c4c46e2b829fd97ee9a3a47558e43adda47abcc488420faa0f087bd720a7"
DERIVATIVE_SOURCE = SOURCE_DIR / "quantum-signal-television-phase3-opening.blend"

RENDER_ROOT = PACKAGE_DIR / "renders"
REVIEW_ROOT = PACKAGE_DIR / "review"
MEDIA_ROOT = PACKAGE_DIR / "media"
MANIFEST_ROOT = PACKAGE_DIR / "manifests"

FPS = 30
FRAME_START = 1
FRAME_END = 270
DURATION_SECONDS = FRAME_END / FPS

DESKTOP_MASTER = (1920, 1080)
MOBILE_MASTER = (720, 1280)
DESKTOP_REVIEW = (1280, 720)
MOBILE_REVIEW = (540, 960)

PAGE_BASE = "#0e1112"
QUANTUM_MAGENTA = "#d82b72"
QUANTUM_ACCENT = "#f06ba0"

EVENTS = OrderedDict(
    [
        ("dormancy_start", 1),
        ("dormancy_hold_end", 30),
        ("conduction_start", 31),
        ("conduction_midpoint", 72),
        ("current_arrival", 112),
        ("indicator_on", 116),
        ("horizontal_line_start", 121),
        ("horizontal_line_peak", 126),
        ("horizontal_line_end", 132),
        ("raster_expansion_start", 133),
        ("raster_expansion_end", 154),
        ("settling_start", 155),
        ("black_stabilized", 176),
        ("brand_start", 177),
        ("route_start", 190),
        ("status_start", 201),
        ("signal_stabilized", 210),
        ("camera_entry_start", 211),
        ("front_alignment", 232),
        ("bezel_exit", 252),
        ("late_flattening", 255),
        ("handoff", 270),
    ]
)

DESKTOP_CAMERA_KEYS = [
    (1, (2.70, -3.48, 0.88), (0.27, 0.15, 0.28), 66.0),
    (72, (2.62, -3.42, 0.86), (0.31, 0.13, 0.30), 67.0),
    (112, (2.45, -3.34, 0.84), (0.37, 0.10, 0.32), 68.0),
    (176, (1.02, -3.00, 0.74), (0.58, -0.01, 0.40), 78.0),
    (210, (0.80, -2.34, 0.80), (0.64, -0.075, 0.425), 84.0),
    (232, (0.76, -1.72, 0.64), (0.65, -0.096, 0.425), 74.0),
    (246, (0.72, -1.04, 0.51), (0.65, -0.104, 0.425), 63.0),
    (258, (0.68, -0.69, 0.45), (0.65, -0.109, 0.425), 54.0),
    (270, (0.65, -0.47, 0.425), (0.65, -0.112, 0.425), 45.0),
]

# Portrait is deliberately authored as a separate, shorter and earlier-frontal move.
MOBILE_CAMERA_KEYS = [
    (1, (2.25, -3.86, 2.24), (0.37, 0.02, 0.69), 53.0),
    (72, (2.15, -3.75, 2.16), (0.40, 0.01, 0.67), 54.0),
    (112, (1.86, -3.52, 1.86), (0.45, -0.01, 0.61), 57.0),
    (166, (1.04, -2.86, 1.05), (0.59, -0.04, 0.46), 66.0),
    (198, (0.78, -2.20, 0.78), (0.64, -0.08, 0.43), 72.0),
    (222, (0.71, -1.43, 0.58), (0.65, -0.10, 0.425), 63.0),
    (244, (0.67, -0.83, 0.47), (0.65, -0.108, 0.425), 54.0),
    (260, (0.65, -0.58, 0.435), (0.65, -0.111, 0.425), 48.0),
    (270, (0.65, -0.43, 0.425), (0.65, -0.112, 0.425), 43.0),
]

CYCLES = {
    "engine": "CYCLES",
    "device": "GPU",
    "compute_backend": "OPTIX",
    "samples": 48,
    "preview_samples": 16,
    "adaptive_sampling": True,
    "adaptive_threshold": 0.018,
    "denoising": True,
    "denoiser": "OPENIMAGEDENOISE",
    "seed": 2404,
    "max_bounces": 8,
    "diffuse_bounces": 4,
    "glossy_bounces": 4,
    "transmission_bounces": 8,
    "transparent_bounces": 8,
    "volume_bounces": 0,
    "view_transform": "AgX",
    "look": "AgX - Medium High Contrast",
}

REVIEW_FRAMES = OrderedDict(
    [
        ("dormancy", 1),
        ("early-conduction", 42),
        ("mid-conduction", 72),
        ("current-near-crt", 104),
        ("current-arrival-indicator", 116),
        ("horizontal-phosphor-line", 126),
        ("raster-expansion", 144),
        ("settling-degauss", 162),
        ("quantum-brand", 182),
        ("quantum-route", 196),
        ("camera-early-approach", 218),
        ("camera-mid-approach", 236),
        ("crt-fills-viewport", 250),
        ("late-flattening", 262),
        ("portal-handoff", 270),
    ]
)


def normalized(frame: int) -> float:
    """Map the inclusive production frame range to 0.000–1.000."""

    return (int(frame) - FRAME_START) / (FRAME_END - FRAME_START)
