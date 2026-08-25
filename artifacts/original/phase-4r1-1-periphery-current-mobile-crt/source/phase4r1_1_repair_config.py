"""Exact authority for the Phase 4-R1.1 targeted preproduction repair."""

from __future__ import annotations

from pathlib import Path


SOURCE_DIR = Path(__file__).resolve().parent
REPO_ROOT = SOURCE_DIR.parents[3]
ACCEPTED_R1_SOURCE = REPO_ROOT / "artifacts/original/phase-4r1-refined-proving-hall/source/quantum-signal-television-phase4r1-refined-proving-hall.blend"
DERIVATIVE = SOURCE_DIR / "quantum-signal-television-phase4r1-1-periphery-current-mobile-crt.blend"
BUILD_REPORT = SOURCE_DIR / "phase4r1-1-source-build.json"

ACCEPTED_R1_BYTES = 3_526_219
ACCEPTED_R1_SHA256 = "a0a122baaf021833e9cad6194a474ef714b182be2c8e7171e00ad69c00565215"
ACCEPTED_R1_HEAD = "bfbd3e6a07ab20cd034b4c669f3759287bd73c82"
ACCEPTED_R1_DIRECT_PARENT = "5cb0ad10c64db810e4719c08e42c9f4120593885"
ACCEPTED_R0_ANCESTOR = "4fd17810d47697785e66584a7ef40199ff597ba1"
MAIN_AUTHORITY = "501040c42bba30b9d9517b88a8f9857992a2dba4"

EXACT_Q_IMAGE_NAME = "Phase4R1V2_ExactQuantumQ_PreCRTEffect_2048"
EXACT_Q_CANONICAL_PATH = "//q-fidelity/quantum-icon-pre-crt-effect.png"
EXACT_Q_BYTES = 69_348
EXACT_Q_SHA256 = "009c494df3b301470ab539f23e02b375f0c1fcec9b4b18cf07fc853b95fd03c5"
OFFICIAL_Q_WHITE_SHA256 = "c660ed87bc5293bfbffa662e523343a7e83bc86cb94848912494e85e0dc9d4ff"
OFFICIAL_Q_COLOR_SHA256 = "04dc37965b33587fea5f4664660f8a7f9a81ec7904d39925b41c6826b80cded9"

SCHEMA = "quantum-hub.phase-4-r1-1.targeted-repair.production-source.v1"
COLLECTION = "PHASE4R11_PERIPHERAL_AUTHORITY"
CENTRAL_ZONE_CENTRE_XY = (0.65, 0.0)
CENTRAL_ZONE_RADIUS_METERS = 6.1
FLOAT_TOLERANCE = 2e-6

STAGE_ORDER = ("periphery", "cable")

CABLE_CONTACT_PROFILE_OBJECT = "Phase4R1V2_WeightedSheathContactProfile"
CABLE_SHEATH_MATERIAL = "Phase4R1V2_HeavyGraphiteCable"
CABLE_CURRENT_MATERIAL = "Phase4R1V2_ExactArcLengthCurrentSurface"
CABLE_FAMILY_AUTHORITY = {
    "desktop": {
        "collection": "PHASE4R1V2_CABLE_DESKTOP",
        "sheath": "Phase4R1V2_Desktop_ContinuousGraphiteSheath",
        "currentPrefix": "Phase4R1V2_Desktop_Current_",
        "currentCount": 160,
        "localResponsePrefix": "Phase4R1V2_Desktop_LocalResponse_",
        "localResponseCount": 4,
    },
    "mobile": {
        "collection": "PHASE4R1V2_CABLE_MOBILE",
        "sheath": "Phase4R1V2_Mobile_ContinuousGraphiteSheath",
        "currentPrefix": "Phase4R1V2_Mobile_Current_",
        "currentCount": 144,
        "localResponsePrefix": "Phase4R1V2_Mobile_LocalResponse_",
        "localResponseCount": 4,
    },
    "landscape": {
        "collection": "PHASE4R1V2_CABLE_LANDSCAPE",
        "sheath": "Phase4R1V2_Landscape_ContinuousGraphiteSheath",
        "currentPrefix": "Phase4R1V2_Landscape_Current_",
        "currentCount": 152,
        "localResponsePrefix": "Phase4R1V2_Landscape_LocalResponse_",
        "localResponseCount": 4,
    },
}
CABLE_EXPECTED_SHEATH_USERS = 3
CABLE_EXPECTED_CURRENT_USERS = 456
CABLE_EXPECTED_LOCAL_RESPONSE_LIGHTS = 12
CABLE_CURRENT_STATE_FRAMES = (1, 46, 70, 106, 166, 225, 261, 285)

CABLE_MATERIAL_AUTHORITY = {
    "sheath": {
        "name": CABLE_SHEATH_MATERIAL,
        "baseColor": "#060808",
        "roughnessMinimum": 0.78,
        "roughnessMaximum": 0.91,
        "noiseScale": 145.0,
        "noiseDetail": 2.2,
        "noiseRoughness": 0.62,
        "noiseDistortion": 0.04,
        "bumpStrength": 0.055,
        "bumpDistanceMeters": 0.00045,
        "emissionStrength": 0.0,
        "transmissionWeight": 0.0,
    },
    "current": {
        "name": CABLE_CURRENT_MATERIAL,
        "channelHousingColor": "#030505",
        "channelHousingRoughness": 0.90,
        "objectColorTint": (0.82, 0.45, 0.76, 1.0),
        "emissionStrength": 0.78,
        "transmissionBasis": "SOURCE_CORRIDOR_FIXED_X_CROSS_SECTION_ELSE_ABS_DOT_GEOMETRY_NORMAL_INCOMING",
        "sourceCorridorAxisWorld": (1.0, 0.0, 0.0),
        "sourceCorridorGateFullY": -5.50,
        "sourceCorridorGateZeroY": -5.20,
        "sourceCorridorCrossSectionDenominatorMinimum": 0.0001,
        "sourceCorridorOverlayRadiusMeters": 0.0305,
        "sourceCorridorMinimumAbsoluteTangentX": 0.90,
        "outerViewFacingMinimum": 0.64,
        "outerViewFacingMaximum": 0.80,
        "coreViewFacingMinimum": 0.88,
        "coreViewFacingMaximum": 0.96,
        "frontFacingOnly": True,
        "useBackfaceCulling": True,
        "surfaceRenderMethod": "DITHERED",
    },
}

PALETTE = {
    "primaryBlack": "#0e1112",
    "deepGraphite": "#1a2020",
    "warmUndertone": "#14090f",
    "warmDark": "#2b2229",
    "mutedSteel": "#252e30",
    "cabinetGraphite": "#121718",
    "paintedSteel": "#1b2224",
    "conduitSteel": "#293234",
    "ventBlack": "#141b1c",
    "maintenancePlate": "#343a3b",
}

MATERIALS = {
    "cabinet": {"name": "Phase4R11_CabinetGraphite", "color": "#121718", "roughness": 0.62, "metallic": 0.18, "noiseScale": 26.0, "bumpStrength": 0.055},
    "paintedSteel": {"name": "Phase4R11_PaintedStructuralSteel", "color": "#1b2224", "roughness": 0.48, "metallic": 0.52, "noiseScale": 18.0, "bumpStrength": 0.045},
    "conduit": {"name": "Phase4R11_DarkGalvanizedConduit", "color": "#293234", "roughness": 0.38, "metallic": 0.72, "noiseScale": 32.0, "bumpStrength": 0.035},
    "vent": {"name": "Phase4R11_VentilationBlack", "color": "#141b1c", "roughness": 0.72, "metallic": 0.24, "noiseScale": 20.0, "bumpStrength": 0.035},
    "recess": {"name": "Phase4R11_UtilityRecessWarmDark", "color": "#14090f", "roughness": 0.84, "metallic": 0.04, "noiseScale": 12.0, "bumpStrength": 0.025},
    "plate": {"name": "Phase4R11_MaintenancePlate", "color": "#343a3b", "roughness": 0.44, "metallic": 0.58, "noiseScale": 35.0, "bumpStrength": 0.025},
}

SUPPRESSED_OPENING_HEADER_OBJECTS = (
    "P4R1_Portal_00_Header",
    "P4R1_Portal_00_ServiceEdge",
)

OPENING_HEADER_REPLACEMENTS = (
    {"name": "Phase4R11_OpeningHeader_West", "location": (-8.45, -6.40, 6.55), "dimensions": (9.60, 0.36, 0.24), "material": "paintedSteel", "zone": "opening-overhead"},
    {"name": "Phase4R11_OpeningHeader_East", "location": (8.45, -6.40, 6.55), "dimensions": (9.60, 0.36, 0.24), "material": "paintedSteel", "zone": "opening-overhead"},
    {"name": "Phase4R11_OpeningHeader_WestServiceEdge", "location": (-8.45, -6.52, 6.39), "dimensions": (9.20, 0.080, 0.080), "material": "conduit", "zone": "opening-overhead"},
    {"name": "Phase4R11_OpeningHeader_EastServiceEdge", "location": (8.45, -6.52, 6.39), "dimensions": (9.20, 0.080, 0.080), "material": "conduit", "zone": "opening-overhead"},
)

ZONE_A_CABINETS = (
    {"name": "Phase4R11_ServiceWall_Cabinet_A", "location": (-13.35, 11.26, 1.70), "dimensions": (1.35, 0.46, 2.15)},
    {"name": "Phase4R11_ServiceWall_Cabinet_B", "location": (-10.20, 11.10, 2.72), "dimensions": (1.60, 0.54, 3.00)},
    {"name": "Phase4R11_ServiceWall_Cabinet_C", "location": (-6.70, 11.28, 2.00), "dimensions": (1.25, 0.42, 1.75)},
)

ZONE_A_CONDUIT_PATHS = (
    {"name": "Phase4R11_ServiceWall_Conduit_A", "points": ((-13.55, 11.02, 4.78), (-13.55, 11.02, 3.55), (-13.08, 11.02, 2.92)), "radius": 0.038},
    {"name": "Phase4R11_ServiceWall_Conduit_B", "points": ((-10.55, 11.02, 5.28), (-10.55, 11.02, 4.38), (-9.92, 11.02, 3.92)), "radius": 0.035},
    {"name": "Phase4R11_ServiceWall_Conduit_C", "points": ((-7.02, 11.02, 4.72), (-7.02, 11.02, 3.68), (-6.48, 11.02, 3.25)), "radius": 0.032},
)

PERIMETER_LIGHTS = (
    {
        "name": "Phase4R11_ServiceWall_Skim",
        "data": "Phase4R11_ServiceWall_Skim_Data",
        "location": (-8.3, 8.90, 5.10),
        "target": (-8.3, 11.20, 2.60),
        "energyWatts": 54.0,
        "color": (0.50, 0.47, 0.44),
        "coneDegrees": 48.0,
        "blend": 0.80,
        "softRadiusMeters": 0.55,
        "zone": "service-wall",
    },
    {
        "name": "Phase4R11_VentRecess_Skim",
        "data": "Phase4R11_VentRecess_Skim_Data",
        "location": (6.65, 9.10, 4.60),
        "target": (6.20, 11.08, 2.75),
        "energyWatts": 46.0,
        "color": (0.43, 0.47, 0.47),
        "coneDegrees": 42.0,
        "blend": 0.82,
        "softRadiusMeters": 0.45,
        "zone": "vent-recess",
    },
)

AUTHORIZATION = {
    "complete540FrameCyclesFilmStarted": False,
    "complete540FrameCyclesFilmResumed": False,
    "finalRefinedMediaIntegrationStarted": False,
    "phase5Authorized": False,
    "generativeVideoAuthorized": False,
}
