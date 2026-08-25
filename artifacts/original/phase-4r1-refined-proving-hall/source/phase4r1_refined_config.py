"""Deterministic authorities for the Phase 4-R1 refined proving hall.

This v2 track is a non-destructive derivative of the recovered e24ccf R1
source.  It changes only the physical hall treatment, cable route/current
presentation, restrained cable terminations, and exact-SVG screen texture.
The accepted CRT, recovered establishing-aim actions, and orbit/threshold
camera paths remain immutable authorities.
"""

from __future__ import annotations

from pathlib import Path


SOURCE_DIR = Path(__file__).resolve().parent
REPOSITORY_ROOT = SOURCE_DIR.parents[3]

RECOVERED_SOURCE = (
    REPOSITORY_ROOT
    / "artifacts"
    / "original"
    / "phase-4r1-proving-hall-environment"
    / "source"
    / "quantum-signal-television-phase4r1-proving-hall.blend"
)
RECOVERED_SOURCE_SHA256 = "e24ccf974a57c0a5ffad48a42d07238138bf7e519da0494f5b9329f2a8b60e87"
RECOVERED_BUILD_REPORT = RECOVERED_SOURCE.with_name("phase4r1-source-build.json")
RECOVERED_VALIDATION_REPORT = RECOVERED_SOURCE.with_name("phase4r1-source-validation.json")

DERIVATIVE_SOURCE = SOURCE_DIR / "quantum-signal-television-phase4r1-refined-proving-hall.blend"
BUILD_REPORT = SOURCE_DIR / "phase4r1-refined-source-build.json"
PREFLIGHT_REPORT = SOURCE_DIR / "phase4r1-refined-preflight.json"
VALIDATION_REPORT = SOURCE_DIR / "phase4r1-refined-source-validation.json"
ASSET_LEDGER = SOURCE_DIR / "phase4r1-refined-asset-ledger.json"
Q_PROVENANCE_REPORT = SOURCE_DIR / "phase4r1-exact-q-provenance.json"
RECOVERY_REPORT = SOURCE_DIR / "phase4r1-recovery-report.json"
RECOVERY_BACKUP_SUMMARY = SOURCE_DIR / "phase4r1-recovery-backup-summary.json"
AUDIT_REPORTS = {
    role: SOURCE_DIR / f"phase4r1-{role}.json"
    for role in (
        "central-floor-object-audit",
        "palette-audit",
        "cable-geometry-audit",
        "current-continuity-audit",
        "camera-audit",
        "exact-q-fidelity-audit",
    )
}

Q_FIDELITY_DIR = SOURCE_DIR / "q-fidelity"
Q_WHITE_SVG = REPOSITORY_ROOT / "public" / "brand" / "quantum-icon-white.svg"
Q_WHITE_SVG_SHA256 = "c660ed87bc5293bfbffa662e523343a7e83bc86cb94848912494e85e0dc9d4ff"
Q_COLOR_SVG = REPOSITORY_ROOT / "public" / "brand" / "quantum-icon-color.svg"
Q_COLOR_SVG_SHA256 = "04dc37965b33587fea5f4664660f8a7f9a81ec7904d39925b41c6826b80cded9"
Q_TEXTURE_WHITE = Q_FIDELITY_DIR / "quantum-icon-white-2048.png"
Q_TEXTURE_COLOR = Q_FIDELITY_DIR / "quantum-icon-color-2048.png"
Q_TEXTURE_PRE_CRT = Q_FIDELITY_DIR / "quantum-icon-pre-crt-effect.png"
Q_OVERLAY = Q_FIDELITY_DIR / "quantum-icon-white-overlay.png"
Q_DIFFERENCE = Q_FIDELITY_DIR / "quantum-icon-white-difference.png"
Q_SILHOUETTE = Q_FIDELITY_DIR / "quantum-icon-white-silhouette-comparison.png"
Q_ASPECT = Q_FIDELITY_DIR / "quantum-icon-aspect-comparison.png"
Q_TEXTURE_RESOLUTION = 2048
CANONICAL_Q_IMAGE_FILEPATH = "//q-fidelity/quantum-icon-pre-crt-effect.png"
CANONICAL_RENDER_HOLD_FILEPATH = "//render-hold/"
CANONICAL_FILE_BROWSER_DIRECTORY = "//"
FILE_BROWSER_DIRECTORY_BUFFER_OVERWRITE_MINIMUM_BYTES = 1281
FILE_BROWSER_DIRECTORY_BUFFER_OVERWRITE_PREFIX = "//privacy-sanitized/"
IMAGE_FILEPATH_BUFFER_OVERWRITE_MINIMUM_CHARACTERS = 1023
IMAGE_FILEPATH_BUFFER_OVERWRITE_PREFIX = "//privacy-sanitized/"

PRESERVATION_SIGNATURE_SCHEMA = "quantum-hub.phase-4-r1.refined-proving-hall.preservation-signatures.v3"
PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY = {
    "properties": ["session_uid"],
    "scope": "generic RNA simple-property persistence hashing only",
    "reason": "Blender assigns session_uid at runtime and reassigns it after save/reopen; it is not authored or persisted scene state",
}


def canonical_blender_repo_relative_path(value: str, expected: str) -> str:
    """Return one strict, host-private-free Blender repo-relative path."""
    raw = str(value or "")
    if len(raw) < 3 or raw[:2] != "//" or raw[2] in {"/", "\\"}:
        raise ValueError("Blender path is not repo-relative")
    canonical = "//" + raw[2:].replace("\\", "/")
    body = canonical[2:]
    if not body or ":" in body:
        raise ValueError("Blender repo-relative path contains an empty body or drive marker")
    parts = body.split("/")
    allowed_trailing_empty = canonical.endswith("/") and parts[-1] == ""
    checked_parts = parts[:-1] if allowed_trailing_empty else parts
    if not checked_parts or any(part in {"", ".", ".."} for part in checked_parts):
        raise ValueError("Blender repo-relative path contains an empty, current, or parent segment")
    lowered_body = body.lower()
    private_prefixes = ("users/", "home/", "private/", "appdata/", "documents and settings/")
    private_markers = ("/users/", "/home/", "/private/", "/appdata/", "/documents and settings/")
    if lowered_body.startswith(private_prefixes) or any(marker in lowered_body for marker in private_markers):
        raise ValueError("Blender repo-relative path contains a private-host marker")
    if canonical != expected:
        raise ValueError(f"Blender repo-relative path differs from exact authority: {canonical}")
    return canonical


def _assert_canonical_blender_repo_relative_path_boundary() -> None:
    accepted = (
        (CANONICAL_Q_IMAGE_FILEPATH, CANONICAL_Q_IMAGE_FILEPATH, "Q forward-slash authority"),
        ("//q-fidelity\\quantum-icon-pre-crt-effect.png", CANONICAL_Q_IMAGE_FILEPATH, "Q Blender-saved backslash tail"),
        (CANONICAL_RENDER_HOLD_FILEPATH, CANONICAL_RENDER_HOLD_FILEPATH, "render forward-slash authority"),
        ("//render-hold\\", CANONICAL_RENDER_HOLD_FILEPATH, "render Blender-saved backslash tail"),
    )
    for raw, expected, label in accepted:
        if canonical_blender_repo_relative_path(raw, expected) != expected:
            raise RuntimeError(f"canonical Blender path boundary rejected {label}")

    rejected = (
        ("\\\\q-fidelity\\quantum-icon-pre-crt-effect.png", CANONICAL_Q_IMAGE_FILEPATH, "UNC prefix"),
        ("/\\q-fidelity\\quantum-icon-pre-crt-effect.png", CANONICAL_Q_IMAGE_FILEPATH, "mixed slash prefix"),
        ("\\/q-fidelity\\quantum-icon-pre-crt-effect.png", CANONICAL_Q_IMAGE_FILEPATH, "reverse mixed slash prefix"),
        ("C:\\q-fidelity\\quantum-icon-pre-crt-effect.png", CANONICAL_Q_IMAGE_FILEPATH, "drive path"),
        ("//Users/amir/q-fidelity/quantum-icon-pre-crt-effect.png", "//Users/amir/q-fidelity/quantum-icon-pre-crt-effect.png", "private-host path"),
        ("//q-fidelity/../q-fidelity/quantum-icon-pre-crt-effect.png", "//q-fidelity/../q-fidelity/quantum-icon-pre-crt-effect.png", "parent segment"),
        ("//q-fidelity/quantum-icon-white-2048.png", CANONICAL_Q_IMAGE_FILEPATH, "wrong authority"),
    )
    for raw, expected, label in rejected:
        try:
            canonical_blender_repo_relative_path(raw, expected)
        except ValueError:
            continue
        raise RuntimeError(f"canonical Blender path boundary accepted rejected {label}")


_assert_canonical_blender_repo_relative_path_boundary()

PALETTE = {
    "primary_black": "#0e1112",
    "deep_graphite": "#1a2020",
    "warm_dark": "#2b2229",
    "muted_dark_steel": "#252e30",
    "quantum_magenta": "#d82b72",
    "quantum_accent": "#f06ba0",
    "neutral_practical": "#b7aea3",
}

FPS = 30
FRAME_START = 1
FRAME_END = 540
CONDUCTION_START = 46
CONDUCTION_END = 285
CURRENT_FRONT_WIDTH_FRACTION = 0.055
CABLE_DIAMETER_M = 0.054
CURRENT_OVERLAY_RADIUS_M = 0.0305
CURRENT_OVERLAY_MIN_TOP_SEPARATION_M = 0.001
CURRENT_OVERLAY_BEVEL_RESOLUTION = 8
FLOOR_CABLE_CENTRE_Z_M = CABLE_DIAMETER_M * 0.5 + 0.002
CENTRAL_ZONE_CENTRE_XY = (0.65, 0.0)
CENTRAL_ZONE_RADIUS_M = 6.1
PERIMETER_SOURCE_WORLD_M = (-16.72, -7.20, 0.135)
PERIMETER_FLOOR_ENTRY_WORLD_M = (-15.85, -7.20, FLOOR_CABLE_CENTRE_Z_M)
ACCEPTED_REAR_COLLAR_WORLD_M = (0.855, 0.662, 0.135)

SCREEN_SPILL_SUPPRESSION_AUTHORITY = {
    "object": "Phase3_ScreenSpill",
    "collection": "PHASE3_SCREEN_LIGHTING",
    "objectType": "LIGHT",
    "lightType": "AREA",
    "dataAction": "Phase3_ScreenSpill_DataAction.001",
    "inspectionFrame": 355,
    "evaluatedEnergyWatts": 24.0,
    "areaSizeMeters": 0.48,
    "recoveredHideRender": False,
    "requiredHideRender": True,
    "recoveredHideViewport": False,
    "recoveredCollectionHideRender": False,
}

SERVICE_MOUTH_AUTHORITY = {
    "schema": "quantum-hub.phase-4-r1.refined-proving-hall.coaxial-service-mouth.v1",
    "axis": "+X",
    "axisOriginWorldMeters": list(PERIMETER_SOURCE_WORLD_M),
    "segments": 64,
    "float32RealizationToleranceMeters": 2e-6,
    "maximumRenderedCableCurrentEnvelopeRadiusMeters": max(CABLE_DIAMETER_M * 0.5, CURRENT_OVERLAY_RADIUS_M),
    "minimumEnvelopeClearanceMeters": 0.0045,
    "maximumOuterDiameterMultipleOfCable": 3.0,
    "flange": {
        "object": "P4R1V2_PerimeterCableServiceMouth",
        "material": "Phase4R1V2_MutedDarkSteel",
        "outerDiameterMeters": 0.156,
        "innerDiameterMeters": 0.088,
        "xOffsetsMeters": [0.048, 0.060],
    },
    "sleeve": {
        "object": "P4R1V2_PerimeterCableServiceSleeve",
        "material": "Phase4R1V2_RestrainedRubber",
        "outerDiameterMeters": 0.084,
        "innerDiameterMeters": 0.072,
        "xOffsetsMeters": [0.029, 0.051],
        "boreSelection": "72 mm bore is the smallest whole-millimetre diameter that preserves at least 4.5 mm radial clearance around the off-axis 30.5 mm rendered current envelope at both measured sleeve faces",
    },
}

CURRENT_ISOLATION_PIXEL_AUTHORITY = {
    "fitInsetNdc": 0.05,
    "minimumEvaluatedGeometryInsetNdc": 0.04,
    "minimumPixelBoundaryClearance": 12,
    "dominantComponentFractionMinimum": 0.98,
    "seamUniformityRatioMinimum": 0.40,
    "frontToTrailContrastMinimum": 1.10,
    "frontToTrailContrastMaximum": 4.00,
}

DORMANT_PIXEL_AUTHORITY = {
    "schema": "quantum-hub.phase-4-r1.refined-proving-hall.dormant-pixel-gates.v1",
    "meanLinearLuminanceRange": [0.0018, 0.025],
    "p90LinearLuminanceRange": [0.0025, 0.045],
    "p99LinearLuminanceRangeByFamily": {"desktop": [0.025, 0.18], "mobile": [0.006, 0.18], "landscape": [0.025, 0.18]},
    "fourBitBlackBinChannelMaximumExclusive8Bit": 16,
    "fourBitBlackBinFractionMaximumByFamily": {"desktop": 0.92, "mobile": 0.96, "landscape": 0.92},
    "magentaLikePixelCountMaximum": 0,
    "brightNeutralMinimumLinearLuminance": 0.75,
    "brightNeutralMaximumChannelSpread8Bit": 22,
    "brightNeutralPixelFractionMaximum": 0.0025,
    "largestBrightNeutralConnectedAreaFractionMaximum": 0.0025,
    "environmentMaximumLinearLuminance": 0.30,
}

F355_OUTSIDE_SCREEN_PIXEL_AUTHORITY = {
    "family": "desktop",
    "frame": 355,
    "screenMaskPaddingPixels": 6,
    "brightNeutralMinimumLinearLuminance": 0.18,
    "neutralMaximumChannelSpread8Bit": 22,
    "largestComponentAreaFractionMaximum": 0.035,
    "largestComponentWidthFractionMaximum": 0.45,
    "largestComponentHeightFractionMaximum": 0.25,
    "significantPoolAreaFractionMinimum": 0.001,
    "outsideScreenHighLuminanceThreshold": 0.45,
    "outsideScreenHighLuminanceFractionMaximum": 0.001,
    "significantPoolsMayOccupyBothScreenSides": False,
}

HALL_VISUAL_AUTHORITY = {
    "schema": "quantum-hub.phase-4-r1.refined-proving-hall.global-visual-authority.v1",
    "viewTransform": "AgX",
    "look": "AgX - Medium High Contrast",
    "exposureStops": 1.0,
    "float32RealizationTolerances": {
        "worldMeters": 2e-6,
        "degrees": 2e-6,
        "colorChannel": 1e-6,
        "materialScalar": 1e-6,
        "ordinaryLightEnergy": 1e-6,
        "sunEnergy": 1e-8,
        "worldStrength": 1e-8,
    },
    "materials": {
        "graphite": {"name": "Phase4R1V2_DeepGraphite", "colorHex": "#1a2020", "roughness": 0.78, "metallic": 0.08},
        "warmDark": {"name": "Phase4R1V2_WarmDarkUndertone", "colorHex": "#2b2229", "roughness": 0.82, "metallic": 0.02},
        "steel": {"name": "Phase4R1V2_MutedDarkSteel", "colorHex": "#252e30", "roughness": 0.54, "metallic": 0.60},
    },
    "world": {"colorHex": "#0c0d0d", "strength": 0.045},
    "perimeterPointPracticals": [
        {"location": [-13.5, -7.5, 3.1], "energyWatts": 95.0, "color": [0.72, 0.69, 0.65], "softRadiusMeters": 3.0},
        {"location": [13.5, 6.8, 3.4], "energyWatts": 110.0, "color": [0.67, 0.70, 0.69], "softRadiusMeters": 3.4},
        {"location": [-12.0, 8.8, 4.6], "energyWatts": 80.0, "color": [0.70, 0.66, 0.62], "softRadiusMeters": 2.8},
        {"location": [11.0, -8.5, 4.0], "energyWatts": 72.0, "color": [0.64, 0.67, 0.67], "softRadiusMeters": 3.0},
    ],
    "highSoftNeutralKey": {"location": [0.0, -1.8, 8.2], "energyWatts": 180.0, "color": [0.64, 0.62, 0.60], "shape": "DISK", "sizeMeters": 8.0},
    "architecturalSun": {
        "object": "Phase4R1V2_GlobalArchitecturalSun",
        "data": "Phase4R1V2_GlobalArchitecturalSun_Data",
        "location": [0.0, -16.0, 10.0],
        "eulerDegrees": [55.0, 0.0, 36.0],
        "expectedLocalMinusZWorld": [-0.4814854910, 0.6627079248, -0.5735764364],
        "directionRealizationTolerance": 1e-6,
        "color": [0.64, 0.66, 0.67],
        "angleDegrees": 15.0,
        "energy": 0.24,
        "rejectedDiagnosticBaselineEnergy": 0.045,
        "action": None,
        "mesh": None,
    },
    "additionalLocalRearLight": {
        "object": "Phase4R1V2_LocalRearSpot",
        "data": "Phase4R1V2_LocalRearSpot_Data",
        "location": [1.75, 1.72, 0.95],
        "targetWorldMeters": [0.855, 0.662, 0.22],
        "expectedLocalMinusZWorld": [-0.571411109181, -0.675478160350, -0.466067161678],
        "directionRealizationTolerance": 1e-6,
        "color": [0.62, 0.61, 0.59],
        "coneDegrees": 30.0,
        "blend": 0.75,
        "softRadiusMeters": 0.18,
        "energyWatts": 18.0,
        "action": None,
        "mesh": None,
    },
    "pendingSelections": [],
}

MOBILE_REFINED_ROUTE = {
    "preservedPrefixPointCount": 482,
    "preservedPrefixMinimumAbsoluteTurns": 2.25,
    "preservedPrefixExpectedAbsoluteTurns": 2.257312563286151,
    "preservedPrefixRoundedCoordinateBytes": 17076,
    "preservedPrefixRoundedCoordinateSha256": "a5e3c2dead8b5100fb06c676503e058967cd44359433bec9a3f8d8a8de84f03d",
    "prefixHashMethod": "compact JSON array of recovered world XYZ, each component rounded to 8 decimal places, local points [0:482]",
    "floorTransitionType": "LSL",
    "floorTransitionRadiusMeters": 0.18,
    "floorTransitionParameters": (0.22778452879056843, 6.550979692792345, 3.7433530382163105),
    "floorTransitionAnalyticPrimitiveLengthsMeters": (0.0410012151823023, 1.179176344702622, 0.673803546878936),
    "floorTransitionAnalyticTotalLengthMeters": 1.8939811067638601,
    "floorTransitionInclusivePrimitiveSampleCounts": (15, 395, 226),
    "floorTransitionExpectedSampledPointCount": 634,
    "floorTransitionExpectedSampledLengthMeters": 1.8939728835129035,
    "floorTransitionMaximumChordMeters": 0.003,
    "floorTransitionExpectedMinimumZMeters": 0.028997997727,
    "floorTransitionExpectedMaximumZMeters": 0.02942795,
    "floorTransitionMaximumFloorCentreErrorMeters": 0.00042795,
    "floorTransitionExpectedAbsoluteTurns": 0.256814167375,
    "floorTransitionExpectedSignedTurns": 0.238007759222,
    "requiredMaximumFloorTransitionAbsoluteTurnRealizationErrorTurns": 1e-8,
    "finishedReadableMinimumAbsoluteTurns": 2.5,
    "floorTransitionEndWorldMeters": (0.68, 1.02, FLOOR_CABLE_CENTRE_Z_M),
    "floorTransitionEndYawDegrees": -40.0,
    "requiredMaximumAnalyticEndpointXYErrorMeters": 1e-6,
    "requiredMaximumBlenderRealizationErrorMeters": 1e-6,
    "terminalLiftControl1WorldMeters": (0.787246222, 0.930009735, FLOOR_CABLE_CENTRE_Z_M),
    "terminalLiftControl2WorldMeters": (0.854999959, 0.886000003, 0.135000005),
    "terminalLiftInclusiveSampleCount": 161,
    "axialSeatStartWorldMeters": (0.854999959, 0.726000003, 0.135000005),
    "axialSeatLengthMeters": 0.064,
    "axialSeatInclusiveSampleCount": 33,
    "terminalExpectedSampledLengthMeters": 0.442495541524,
    "terminalExpectedHorizontalSpanMeters": 0.398483354109,
    "terminalExpectedRiseMeters": 0.106000005,
    "sourceLeadPointCountThroughSpiralStartInclusive": 169,
    "sourceLeadPointCountStrictlyBeforeSpiralStart": 168,
    "expectedFullRoutePointCount": 1475,
    "expectedGlobalJoinIndices": (48, 108, 168, 649, 663, 1057, 1282, 1442),
    "standaloneVerifiedMinimumClearanceMeters": 0.090712484196,
    "standaloneVerifiedMinimumBendRadiusMeters": 0.179999999961,
    "standaloneVerifiedContactCount": 0,
    "standaloneVerifiedProperPlanarCrossingCount": 0,
}

MOBILE_FLOOR_LEAD_AUTHORITY = {
    "schema": "phase4r1-mobile-two-cubic-floor-lead-authority.v1",
    "topology": "two cubic Bezier spans with one shared C1 waypoint and the original 121-point/index budget",
    "stage2CandidateDigestSha256": "2e392a8d9473283167c2d80a5eb5ec89438bd678692f5cbb464863e16af197f4",
    "coordinateDigestMethod": "compact JSON array of world XYZ coordinates rounded to 12 decimals",
    "leadCoordinateBytes": 5921,
    "leadCoordinateSha256": "1f759861b91a04e66e4adc606927c51efe180071525925401d6ae865290444e1",
    "fullRouteCoordinateSha256": "281c9192cfa26d32eb44d6999b897848bdc9904e62a52b06d004b57c816d5504",
    "sourceServiceTransitionCoordinateSha256": "25a0dc521b30430a657fb2aee268d506a8c0a48940f4bc3ec3d11d5d1e0e2391",
    "preservedSpiralAndTailCoordinateSha256": "70223cd92d25f0d62a8ac7cc46f299fc3d860ec34fd7314895ae19393bd049fc",
    "firstCubicInclusiveSampleCount": 61,
    "secondCubicInclusiveSampleCount": 61,
    "deduplicatedLeadPointCount": 121,
    "waypointLeadLocalIndex": 60,
    "waypointGlobalIndex": 108,
    "leadGlobalStartIndex": 48,
    "spiralStartGlobalIndex": 168,
    "visibleLeadLocalRangeAtFrame1": (93, 120),
    "visibleLeadGlobalRangeAtFrame1": (141, 168),
    "verifiedVisibleLeadArcLengthMeters": 2.080271697148068,
    "requiredMinimumVisibleLeadArcLengthMeters": 2.0,
    "firstCubicControlsWorldMeters": (
        (-15.850000381469727, -7.199999809265137, 0.028999999165534973),
        (-13.75, -7.199999809265137, 0.028999999165534973),
        (-12.680761337280273, -4.830890655517578, 0.02945421077311039),
        (-6.181933403015137, -5.5, 0.029859023168683052),
    ),
    "secondCubicControlsWorldMeters": (
        (-6.181933403015137, -5.5, 0.029859023168683052),
        (0.3168940544128418, -6.169109344482422, 0.030263835564255714),
        (-0.9490955471992493, -2.776289224624634, 0.029839202761650085),
        (0.6499999761581421, -2.722527503967285, 0.028081513941287994),
    ),
    "waypointWorldMeters": (-6.181933403015137, -5.5, 0.029859023168683052),
    "waypointTangentControlVectorMeters": (6.4988274574279785, -0.6691094636917114, 0.000404812628403306),
    "stage2EvidenceExternalRecoveryId": "phase4r1-mobile-lead-stage2-rank20-2e392a8d9473",
    "stage2EvidenceEnvelopeBytes": 28639,
    "stage2EvidenceEnvelopeSha256": "1bec6cfcacae82ba653013409d72e67c3e3cc69d4c730dc2430be90592b01394",
    "stage2VerifiedMinimumClearanceMeters": 0.0907124096,
    "stage2VerifiedMinimumBendRadiusMeters": 0.17935765664867664,
    "stage2VerifiedContactCount": 0,
    "stage2VerifiedProperPlanarCrossingCount": 0,
    "stage2VerifiedRoutePointCount": 1475,
    "stage2VerifiedMinimumClearanceSegmentPair": (1253, 1285),
}

AXIAL_SEAT_LENGTHS_M = {"desktop": 0.24, "mobile": 0.064, "landscape": 0.24}
LEAD_APPROACH_TANGENT_CONTROL_M = {"desktop": 2.40, "mobile": 3.20, "landscape": 2.40}

CABLE_FAMILIES = {
    "desktop": {
        "source_object": "Phase4R1_Desktop_ContinuousGraphiteSheath",
        "source_collection": "PHASE4R1_CABLE_DESKTOP",
        "collection": "PHASE4R1V2_CABLE_DESKTOP",
        "spiral_start_index": 148,
        "spiral_samples": 721,
        "segments": 160,
        "turns": 3.50,
        "outer_radius_m": 5.50,
        "inner_radius_m": 1.48,
    },
    "mobile": {
        "source_object": "Phase4R1_Mobile_ContinuousGraphiteSheath",
        "source_collection": "PHASE4R1_CABLE_MOBILE",
        "collection": "PHASE4R1V2_CABLE_MOBILE",
        "spiral_start_index": 148,
        "spiral_samples": 641,
        "segments": 144,
        "turns": 3.00,
        "outer_radius_m": 2.70,
        "inner_radius_m": 1.00,
    },
    "landscape": {
        "source_object": "Phase4R1_Landscape_ContinuousGraphiteSheath",
        "source_collection": "PHASE4R1_CABLE_LANDSCAPE",
        "collection": "PHASE4R1V2_CABLE_LANDSCAPE",
        "spiral_start_index": 148,
        "spiral_samples": 681,
        "segments": 152,
        "turns": 3.25,
        "outer_radius_m": 5.25,
        "inner_radius_m": 1.45,
    },
}

CAMERAS = {
    "desktop": "Phase4R1_Camera_Desktop",
    "mobile": "Phase4R1_Camera_Mobile",
    "landscape": "Phase4R1_Camera_Landscape",
}

PROJECTION_RESOLUTIONS = {
    "desktop": (960, 600),
    "mobile": (390, 844),
    "landscape": (844, 390),
}

PREVIEW_RESOLUTIONS = {
    "desktop": (1440, 900),
    "mobile": (390, 844),
    "landscape": (844, 390),
}

# Native Cycles proof stills must satisfy the evidence consumer's minimum
# raster dimensions without resampling.  Mobile keeps the accepted 390:844
# portrait aspect at an exact 2x proof resolution.
CYCLES_BENCHMARK_RESOLUTIONS = {
    "desktop": (1440, 900),
    "mobile": (780, 1688),
    "landscape": (844, 390),
}

AGGREGATE_TIMELINE = {
    "fps": 30,
    "frameStart": 1,
    "frameEnd": 540,
    "physicalEnd": 500,
    "blackStart": 501,
    "blackEnd": 513,
    "entryStart": 514,
    "entrySettled": 540,
}

ESTABLISHING_AIMS = {
    "desktop": ((1, (0.30, 1.00, 2.70)), (45, (0.30, 1.00, 2.70)), (46, (0.30, 1.00, 2.70)), (76, (0.398, 0.72, 1.63)), (106, (0.65, 0.0, 0.425)), (540, (0.65, 0.0, 0.425))),
    "mobile": ((1, (0.25, -0.45, 1.10)), (45, (0.25, -0.45, 1.10)), (46, (0.25, -0.45, 1.10)), (76, (0.18, -1.20, 0.86)), (106, (0.65, 0.0, 0.425)), (540, (0.65, 0.0, 0.425))),
    "landscape": ((1, (0.30, 1.00, 2.70)), (45, (0.30, 1.00, 2.70)), (46, (0.30, 1.00, 2.70)), (76, (0.398, 0.72, 1.63)), (106, (0.65, 0.0, 0.425)), (540, (0.65, 0.0, 0.425))),
}

ACCEPTED_CRT_COLLECTIONS = (
    "REFINED_CRT_ASSEMBLY",
    "CRT_CABLE_CONNECTION",
    "CRT_PHYSICAL_CONTROLS",
    "CRT_PHYSICAL_SIGNAL_INTERFACE",
    "CRT_REAR_SERVICE_DETAIL",
    "CRT_SCANLINE_GEOMETRY",
    "CRT_SIDE_VENT_DETAIL",
    "CRT_SPEAKER_PERFORATIONS",
    "CRT_STARTUP_RASTER_EXPANSION",
    "CRT_PORTAL_TAKEOVER_CUES",
    "PHASE3R_CRT_SCREEN_REPAIR",
    "PHASE4R0_DRAFT_RASTER",
    "PHASE4R0_Q_SIGNAL",
)

# The recovered distribution collection contains exactly 38 objects.  The
# branch plus its three physical roof hangers remain as subdued overhead shadow
# architecture; the other 34 central/hardware objects are hidden as a single
# audited refinement set.
RETAINED_OVERHEAD_SOURCE_OBJECTS = (
    "P4R1_Distribution_FacilityFeedBranch",
    "P4R1_Distribution_FacilityFeedHanger_00",
    "P4R1_Distribution_FacilityFeedHanger_01",
    "P4R1_Distribution_FacilityFeedHanger_02",
)

MUSEUM_OVERLAY_COLLECTIONS = (
    "INDUSTRIAL_PROVING_GROUND",
    "PROVING_GROUND_DISTANCE",
    "PHASE4R0_PROVING_FIELD_EXTENSION",
)

GENERATED_AT = "2026-08-24T00:00:00Z"
STARTING_HEAD = "3c73a51f976272343d32ede89fc12d1fab228f80"
RECOVERY_CHECKPOINT_HEAD = "5cb0ad10c64db810e4719c08e42c9f4120593885"
EXACT_PARENT = "4fd17810d47697785e66584a7ef40199ff597ba1"
MAIN_AUTHORITY = "501040c42bba30b9d9517b88a8f9857992a2dba4"

AUTHORIZATION = {
    "full540FrameCyclesProductionFilmStarted": False,
    "full540FrameCyclesProductionFilmResumed": False,
    "refinedPhysicalMediaRuntimeIntegrationStarted": False,
    "chromeStatePolicyImplementationEvidenced": True,
    "humanAccepted": False,
    "phase5Authorized": False,
}
