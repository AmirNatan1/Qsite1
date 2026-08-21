"""Deterministic configuration for the narrow Phase 3-R CRT authenticity repair.

All physical, camera, portal, conduction, timing, and delivery constants remain
bound to the accepted Phase 3 configuration. Only the repaired derivative and
screen-specific review frames are new authorities.
"""

from __future__ import annotations

from collections import OrderedDict

from phase3_config import (  # noqa: F401
    ACCEPTED_SOURCE,
    ACCEPTED_SOURCE_SHA256,
    CYCLES,
    DESKTOP_CAMERA_KEYS,
    DESKTOP_MASTER,
    DESKTOP_REVIEW,
    DURATION_SECONDS,
    EVENTS,
    FPS,
    FRAME_END,
    FRAME_START,
    MANIFEST_ROOT,
    MEDIA_ROOT,
    MOBILE_CAMERA_KEYS,
    MOBILE_MASTER,
    MOBILE_REVIEW,
    PACKAGE_DIR,
    PAGE_BASE,
    QUANTUM_ACCENT,
    QUANTUM_MAGENTA,
    RENDER_ROOT,
    REPOSITORY_ROOT,
    REVIEW_ROOT,
    SOURCE_DIR,
    normalized,
)


REPAIR_PARENT = "ae6cd4c0c664a275c077bd37207efde01e9caa29"
PHASE3_DERIVATIVE_SOURCE = SOURCE_DIR / "quantum-signal-television-phase3-opening.blend"
PHASE3_DERIVATIVE_SHA256 = "bbde82220f500c6f047c2e2d33a8580c08a40e65800615dd7256bebc2f4472ba"
DERIVATIVE_SOURCE = SOURCE_DIR / "quantum-signal-television-phase3-r-crt-authenticity.blend"

# The broad accepted timeline is byte-for-byte inherited. These repair review
# frames add early/mature line and picture-field formation coverage without
# shifting a single cue.
REPAIR_REVIEW_FRAMES = OrderedDict(
    [
        ("arrival", 116),
        ("horizontal-line-early", 121),
        ("horizontal-line-mature", 126),
        ("horizontal-line-release", 132),
        ("picture-field-early", 136),
        ("picture-field-mid", 144),
        ("picture-field-full", 154),
        ("settling", 162),
        ("quantum-brand", 182),
        ("quantum-content", 196),
        ("camera-approach", 218),
        ("crt-receding", 250),
        ("late-flattening", 262),
        ("handoff", 270),
    ]
)

FULL_RESOLUTION_REPAIR_FRAMES = (121, 126, 132, 144, 154, 162, 182, 196, 218, 250, 262, 270)

# Procedural raster frequencies are intentionally variant-specific. They
# describe fine texture within a continuous field, not countable geometry.
DESKTOP_RASTER_BANDS = 160.0
MOBILE_RASTER_BANDS = 112.0
