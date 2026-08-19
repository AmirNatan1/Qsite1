import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

const repositoryRoot = process.cwd();
const packageRelative = "artifacts/original/phase-0-4-crt-television";
const packageRoot = path.join(repositoryRoot, ...packageRelative.split("/"));
const repairEvidenceRelative = "artifacts/evidence/phase-0-4r-crt-television";
const repairEvidenceRoot = path.join(repositoryRoot, ...repairEvidenceRelative.split("/"));
const repositoryImpactRelative = `${repairEvidenceRelative}/repository-impact-report.json`;
const acceptedRepairParent = "fec1f0e9243a9cda188c539ab1b79e4a99c30623";
const expectedBranch = "redirect/phase-0-4-crt-television";
const expectedOrigin = "https://github.com/AmirNatan1/Qsite1.git";
const preferredNetGrowthBytes = 80_000_000;
const maximumFileBytes = 100 * 1024 * 1024;
const explicitPreflight = process.argv.includes("--preflight");
const explicitFinal = process.argv.includes("--final");
const explicitPostcommit = process.argv.includes("--postcommit");
const requireExternalReviewZip = process.argv.includes("--require-external-review-zip");
const requireLocalFfprobe = process.argv.includes("--require-local-ffprobe");
const errors = [];

if (explicitPreflight && explicitFinal) errors.push("Phase 0.4R verifier cannot run with both --preflight and --final");
if (explicitPreflight && explicitPostcommit) errors.push("Phase 0.4R verifier cannot run with both --preflight and --postcommit");
const finalMode = explicitFinal || explicitPostcommit;

let sharpDecoder = null;
try {
  ({ default: sharpDecoder } = await import("sharp"));
} catch (error) {
  errors.push(`sharp image decoder is unavailable: ${error.message}`);
}

const repairManifestRelative = "manifests/crt-phase-0-4r-repair-manifest.json";
const cyclesManifestRelative = "manifests/crt-phase-0-4r-cycles-master-render-manifest.json";
const turntableManifestRelative = "manifests/crt-model-turntable-manifest.json";
const validationRelative = "manifests/blender-source-validation.json";
const keepoutRelative = "manifests/crt-scene-source-keepouts.json";
const materialManifestRelative = "manifests/crt-material-and-asset-manifest.json";
const canonicalInventoryRelative = "manifests/crt-phase-0-4r-canonical-render-inventory.json";
const powerStateRelative = "manifests/crt-phase-0-4r-power-on-state-authority.json";
const physicalPortalStateRelative = "manifests/crt-phase-0-4r-portal-physical-state-authority.json";
const portalStateRelative = "manifests/crt-phase-0-4r-portal-transition-state-authority.json";
const sanitizerRelative = "manifests/png-metadata-sanitization.json";
const reviewBundleRelative = "manifests/review-bundle-manifest.json";
const packageInventoryRelative = "manifests/package-inventory.json";
const staticReviewCompositionRelative = "manifests/crt-phase-0-4r-review-composition-manifest.json";
const refinedSourceRelative = "source/quantum-signal-television-v1.blend";
const repairPackagerRelative = "source/package_phase0_4r_quality_review.py";
const externalReviewZipRelative = `${packageRelative}/work/phase-0-4r-crt-quality-review.zip`;
const externalReviewZipAbsolute = path.join(repositoryRoot, ...externalReviewZipRelative.split("/"));
const turntableRelative = "crt-model-turntable.webm";
const closeupsRelative = "crt-model-quality-closeups.png";
const oldReviewZipRelative = "phase-0-4-crt-television-review.zip";

const repairPngNames = [
  "crt-cabinet-material-sheet.png",
  "crt-cable-and-connection-sheet.png",
  "crt-camera-path-study.png",
  "crt-controls-speaker-rear-detail-sheet.png",
  "crt-desktop-hero-composition.png",
  "crt-mobile-hero-composition.png",
  "crt-physical-dom-alignment-sheet.png",
  "crt-portal-transition-sheet.png",
  "crt-power-on-contact-sheet.png",
  "crt-proving-ground-style-frame.png",
  "crt-reduced-motion-desktop.png",
  "crt-reduced-motion-mobile.png",
  "crt-screen-glass-and-phosphor-sheet.png",
  "crt-television-recommended-design-sheet.png",
  "crt-text-zoom-and-fallback.png",
];

const exactRepairDeliverables = new Set([...repairPngNames, closeupsRelative, turntableRelative]);
const exactTopLevelReviewPngs = new Set([
  "crt-television-proportion-options.png",
  ...repairPngNames,
  closeupsRelative,
]);

const exactBrowserReviewOutputs = [
  [10, "crt-portal-transition-sheet.png"],
  [11, "crt-physical-dom-alignment-sheet.png"],
  [12, "crt-desktop-hero-composition.png"],
  [13, "crt-mobile-hero-composition.png"],
  [14, "crt-text-zoom-and-fallback.png"],
  [15, "crt-reduced-motion-desktop.png"],
  [16, "crt-reduced-motion-mobile.png"],
];

const baselineRepairPngs = new Map([
  ["crt-cabinet-material-sheet.png", { bytes: 1105801, sha256: "f7b81ddf7a0b031f1b3d84c0aff76bbb34bf20fd16106a21c6a149cf0e4beb93" }],
  ["crt-cable-and-connection-sheet.png", { bytes: 2593236, sha256: "7a5322ec0b88d73ec67ded6f64097320b3cc6aede20b03f10f65dafbd7262be4" }],
  ["crt-camera-path-study.png", { bytes: 1813944, sha256: "1ef0766083ffdde4e6062374580cf29767c2605a59a8a22ebfca760f09f84232" }],
  ["crt-controls-speaker-rear-detail-sheet.png", { bytes: 3441617, sha256: "0224be4cf40afcfbadd699445d4146594af236186ebda9881e38b03817451dec" }],
  ["crt-desktop-hero-composition.png", { bytes: 1758336, sha256: "b8123eca4d6c9ce05adfb16e29177604acb48730a6d49b6c7cc7821e8d81cfc0" }],
  ["crt-mobile-hero-composition.png", { bytes: 859548, sha256: "6880496b2341e6dd3e29824a528a6411518c664e9b8853f9cf602936e44569d3" }],
  ["crt-physical-dom-alignment-sheet.png", { bytes: 4447353, sha256: "e733948ae7d4b534eea5ef7becb858c776628376ce0954c24c168cc506bc7252" }],
  ["crt-portal-transition-sheet.png", { bytes: 10703351, sha256: "ce7e80d633f66a48454593fbb3a459c994177f5c3b8a25480bb9b9c7e1c14515" }],
  ["crt-power-on-contact-sheet.png", { bytes: 2357483, sha256: "b61535e954881a7dd9e263241e62cfd6e14adae8be3e4e634ce17ed4adbac583" }],
  ["crt-proving-ground-style-frame.png", { bytes: 2320530, sha256: "f06437722067b3bb1e55355c18ff9f7d5d4aada66666052d69daebb2e612aff5" }],
  ["crt-reduced-motion-desktop.png", { bytes: 877291, sha256: "7324db6378a9820c2ef930cff0eed3a5744030ed01aaadaaa29533ab75ab7b0f" }],
  ["crt-reduced-motion-mobile.png", { bytes: 412148, sha256: "79a1373ccea650441777c3ad598bf0bcf50f57c6d5f82f1bea27d610c8a89785" }],
  ["crt-screen-glass-and-phosphor-sheet.png", { bytes: 3158471, sha256: "f08ce94db324b70b1bdc0b6fc65990be03799ec28d230e1597e660766529c25d" }],
  ["crt-television-recommended-design-sheet.png", { bytes: 1542628, sha256: "fee6271b2b5453a6228830e57e5481c67922d3fd2610aa88e79756224c656e4c" }],
  ["crt-text-zoom-and-fallback.png", { bytes: 1383021, sha256: "1db1a05290a81b9a929c241fd7983a468c097e7e51751b6e24ff809de8119ec9" }],
]);

const exactCyclesMasters = new Set([
  "renders/repair-masters/cycles-design-three-quarter-front.png",
  "renders/repair-masters/cycles-cabinet-material-closeup.png",
  "renders/repair-masters/cycles-speaker-controls-closeup.png",
  "renders/repair-masters/cycles-rear-strain-relief-closeup.png",
  "renders/repair-masters/cycles-dormant-glass-closeup.png",
  "renders/repair-masters/cycles-powered-glass-phosphor-closeup.png",
  "renders/repair-masters/cycles-proving-ground-master.png",
  "renders/repair-masters/cycles-portal-ready-closeup.png",
]);

const exactSourceRoles = new Set([
  "source-desktop-dormant",
  "source-mobile-dormant",
  "source-reduced-desktop-dormant",
  "source-reduced-mobile-dormant",
  "source-physical-portal-close",
  "source-text-free-portal-takeover",
]);

const exactSourceRoleFiles = new Map([
  ["source-desktop-dormant", { path: "renders/refined/sources/source-desktop-dormant.png", width: 1920, height: 1200 }],
  ["source-mobile-dormant", { path: "renders/refined/sources/source-mobile-dormant.png", width: 1080, height: 1800 }],
  ["source-reduced-desktop-dormant", { path: "renders/refined/sources/source-reduced-desktop-dormant.png", width: 1920, height: 1200 }],
  ["source-reduced-mobile-dormant", { path: "renders/refined/sources/source-reduced-mobile-dormant.png", width: 1080, height: 1800 }],
  ["source-physical-portal-close", { path: "renders/refined/sources/source-physical-portal-close.png", width: 1920, height: 1200 }],
  ["source-text-free-portal-takeover", { path: "renders/refined/sources/source-text-free-portal-takeover.png", width: 1920, height: 1200 }],
]);

const exactKeepoutGeometryRoles = new Set(["crt-cabinet", "crt-screen", "spiral-cable"]);

const exactCanonicalRoster = [
  ["design-front", "design", "renders/refined/design/design-front.png"],
  ["design-side", "design", "renders/refined/design/design-side.png"],
  ["design-rear", "design", "renders/refined/design/design-rear.png"],
  ["design-three-quarter-front", "design", "renders/refined/design/design-three-quarter-front.png"],
  ["design-three-quarter-rear", "design", "renders/refined/design/design-three-quarter-rear.png"],
  ["cabinet-three-quarter", "materials", "renders/refined/materials/cabinet-three-quarter.png"],
  ["cabinet-front-material", "materials", "renders/refined/materials/cabinet-front-material.png"],
  ["cabinet-rear-material", "materials", "renders/refined/materials/cabinet-rear-material.png"],
  ["glass-dormant-front", "materials", "renders/refined/materials/glass-dormant-front.png"],
  ["glass-grazing-proof", "materials", "renders/refined/materials/glass-grazing-proof.png"],
  ["glass-electrical-wake", "materials", "renders/refined/materials/glass-electrical-wake.png"],
  ["glass-raster-warm", "materials", "renders/refined/materials/glass-raster-warm.png"],
  ["detail-controls", "details", "renders/refined/details/detail-controls.png"],
  ["detail-speaker", "details", "renders/refined/details/detail-speaker.png"],
  ["detail-rear", "details", "renders/refined/details/detail-rear.png"],
  ["detail-connector", "details", "renders/refined/details/detail-connector.png"],
  ["cable-dormant", "cable", "renders/refined/cable/cable-dormant.png"],
  ["cable-conduction-boundary", "cable", "renders/refined/cable/cable-conduction-boundary.png"],
  ["cable-rear-arrival", "cable", "renders/refined/cable/cable-rear-arrival.png"],
  ["cable-connected-powered", "cable", "renders/refined/cable/cable-connected-powered.png"],
  ["proving-ground-master", "environment", "renders/refined/environment/proving-ground-master.png"],
  ["camera-01-arrival", "camera-study", "renders/refined/camera-study/camera-01-arrival.png"],
  ["camera-02-thirty-percent", "camera-study", "renders/refined/camera-study/camera-02-thirty-percent.png"],
  ["camera-03-sixty-percent", "camera-study", "renders/refined/camera-study/camera-03-sixty-percent.png"],
  ["camera-04-near-frontal", "camera-study", "renders/refined/camera-study/camera-04-near-frontal.png"],
  ["camera-05-portal-ready", "camera-study", "renders/refined/camera-study/camera-05-portal-ready.png"],
  ["power-01-completely-dormant", "power-on", "renders/refined/power-on/power-01-completely-dormant.png"],
  ["power-02-current-reaches-connection", "power-on", "renders/refined/power-on/power-02-current-reaches-connection.png"],
  ["power-03-power-indicator-response", "power-on", "renders/refined/power-on/power-03-power-indicator-response.png"],
  ["power-04-crt-electrical-wake", "power-on", "renders/refined/power-on/power-04-crt-electrical-wake.png"],
  ["power-05-raster-phosphor-appears", "power-on", "renders/refined/power-on/power-05-raster-phosphor-appears.png"],
  ["power-06-quantum-interface-stabilizes", "power-on", "renders/refined/power-on/power-06-quantum-interface-stabilizes.png"],
  ["power-07-portal-ready", "power-on", "renders/refined/power-on/power-07-portal-ready.png"],
  ["portal-01-television-in-scene", "portal", "renders/refined/portal/portal-01-television-in-scene.png"],
  ["portal-02-screen-active", "portal", "renders/refined/portal/portal-02-screen-active.png"],
  ["portal-03-close-approach", "portal", "renders/refined/portal/portal-03-close-approach.png"],
  ["portal-04-glass-almost-fills", "portal", "renders/refined/portal/portal-04-glass-almost-fills.png"],
  ["portal-05-bezel-exits", "portal", "renders/refined/portal/portal-05-bezel-exits.png"],
  ["portal-06-distortion-reduces", "portal", "renders/refined/portal/portal-06-distortion-reduces.png"],
  ["source-desktop-dormant", "sources", "renders/refined/sources/source-desktop-dormant.png"],
  ["source-mobile-dormant", "sources", "renders/refined/sources/source-mobile-dormant.png"],
  ["source-reduced-desktop-dormant", "sources", "renders/refined/sources/source-reduced-desktop-dormant.png"],
  ["source-reduced-mobile-dormant", "sources", "renders/refined/sources/source-reduced-mobile-dormant.png"],
  ["source-physical-portal-close", "sources", "renders/refined/sources/source-physical-portal-close.png"],
  ["source-text-free-portal-takeover", "sources", "renders/refined/sources/source-text-free-portal-takeover.png"],
];
const exactCanonicalRenderPaths = new Set(exactCanonicalRoster.map(([, , relative]) => relative));
const exactStaticReviewSheets = new Map([
  ["crt-television-recommended-design-sheet.png", { reviewIndex: 2, sources: [
    "renders/refined/design/design-front.png",
    "renders/refined/design/design-side.png",
    "renders/refined/design/design-rear.png",
    "renders/repair-masters/cycles-design-three-quarter-front.png",
    "renders/refined/design/design-three-quarter-rear.png",
  ] }],
  ["crt-cabinet-material-sheet.png", { reviewIndex: 3, sources: [
    "renders/repair-masters/cycles-cabinet-material-closeup.png",
    "renders/repair-masters/cycles-design-three-quarter-front.png",
    "renders/repair-masters/cycles-rear-strain-relief-closeup.png",
  ] }],
  ["crt-screen-glass-and-phosphor-sheet.png", { reviewIndex: 4, sources: [
    "renders/repair-masters/cycles-dormant-glass-closeup.png",
    "renders/repair-masters/cycles-design-three-quarter-front.png",
    "renders/refined/materials/glass-electrical-wake.png",
    "renders/repair-masters/cycles-powered-glass-phosphor-closeup.png",
  ] }],
  ["crt-controls-speaker-rear-detail-sheet.png", { reviewIndex: 5, sources: [
    "renders/repair-masters/cycles-speaker-controls-closeup.png",
    "renders/repair-masters/cycles-cabinet-material-closeup.png",
    "renders/repair-masters/cycles-rear-strain-relief-closeup.png",
  ] }],
  ["crt-cable-and-connection-sheet.png", { reviewIndex: 6, sources: [
    "renders/refined/cable/cable-dormant.png",
    "renders/refined/cable/cable-conduction-boundary.png",
    "renders/refined/cable/cable-rear-arrival.png",
    "renders/refined/cable/cable-connected-powered.png",
  ] }],
  ["crt-proving-ground-style-frame.png", { reviewIndex: 7, sources: [
    "renders/repair-masters/cycles-proving-ground-master.png",
  ] }],
  ["crt-camera-path-study.png", { reviewIndex: 8, sources: [
    "renders/refined/camera-study/camera-01-arrival.png",
    "renders/refined/camera-study/camera-02-thirty-percent.png",
    "renders/refined/camera-study/camera-03-sixty-percent.png",
    "renders/refined/camera-study/camera-04-near-frontal.png",
    "renders/refined/camera-study/camera-05-portal-ready.png",
  ] }],
  ["crt-power-on-contact-sheet.png", { reviewIndex: 9, sources: [
    "renders/refined/power-on/power-01-completely-dormant.png",
    "renders/refined/power-on/power-02-current-reaches-connection.png",
    "renders/refined/power-on/power-03-power-indicator-response.png",
    "renders/refined/power-on/power-04-crt-electrical-wake.png",
    "renders/refined/power-on/power-05-raster-phosphor-appears.png",
    "renders/refined/power-on/power-06-quantum-interface-stabilizes.png",
    "renders/refined/power-on/power-07-portal-ready.png",
  ] }],
]);

const exactPowerStateIds = [
  "power-01-completely-dormant",
  "power-02-current-reaches-connection",
  "power-03-power-indicator-response",
  "power-04-crt-electrical-wake",
  "power-05-raster-phosphor-appears",
  "power-06-quantum-interface-stabilizes",
  "power-07-portal-ready",
];

const exactPortalStateIds = [
  "portal-01-television-in-scene",
  "portal-02-screen-active",
  "portal-03-close-approach",
  "portal-04-glass-almost-fills",
  "portal-05-bezel-exits",
  "portal-06-distortion-reduces",
  "portal-07-dom-takes-ownership",
  "portal-08-full-semantic-surface",
];

const exactPhysicalScreenContent = [
  { id: "stage-1-brand", stage: "brand", lines: ["QUANTUM HUB"] },
  { id: "stage-2-route-resolved", stage: "route", lines: ["FRAME SOURCE ASSESS TEST DECIDE"] },
  { id: "stage-3-portal-ready", stage: "ready", lines: ["TEST ROUTE AVAILABLE"] },
];

const exactPowerInterfaceStages = new Map([
  ["power-01-completely-dormant", "none"],
  ["power-02-current-reaches-connection", "none"],
  ["power-03-power-indicator-response", "none"],
  ["power-04-crt-electrical-wake", "none"],
  ["power-05-raster-phosphor-appears", "none"],
  ["power-06-quantum-interface-stabilizes", "brand"],
  ["power-07-portal-ready", "route"],
]);

const exactPhysicalPortalInterfaceStages = new Map([
  ["portal-01-television-in-scene", "route"],
  ["portal-02-screen-active", "ready"],
  ["portal-03-close-approach", "ready"],
  ["portal-04-glass-almost-fills", "ready"],
  ["portal-05-bezel-exits", "ready"],
  ["portal-06-distortion-reduces", "none"],
]);

const exactPhysicalScreenStateMap = new Map([
  ["brand", {
    stateIds: ["power-06-quantum-interface-stabilizes"],
    expectedCopyLines: ["QUANTUM HUB"],
    visibility: "visible-readable-copy",
    interfaceStage: "brand",
  }],
  ["route", {
    stateIds: ["power-07-portal-ready", "portal-01-television-in-scene"],
    expectedCopyLines: ["FRAME SOURCE ASSESS TEST DECIDE"],
    visibility: "visible-readable-copy",
    interfaceStage: "route",
  }],
  ["ready", {
    stateIds: [
      "portal-02-screen-active",
      "portal-03-close-approach",
      "portal-04-glass-almost-fills",
      "portal-05-bezel-exits",
    ],
    expectedCopyLines: ["TEST ROUTE AVAILABLE"],
    visibility: "visible-readable-copy",
    interfaceStage: "ready",
  }],
  ["text-free", {
    stateIds: ["portal-06-distortion-reduces"],
    expectedCopyLines: [],
    visibility: "active-no-copy-surface",
    interfaceStage: "none",
  }],
]);

const staticRepairPngs = new Set([
  "crt-cabinet-material-sheet.png",
  "crt-cable-and-connection-sheet.png",
  "crt-camera-path-study.png",
  "crt-controls-speaker-rear-detail-sheet.png",
  "crt-power-on-contact-sheet.png",
  "crt-proving-ground-style-frame.png",
  "crt-screen-glass-and-phosphor-sheet.png",
  "crt-television-recommended-design-sheet.png",
]);
const supplementalEeveeRepairPngs = new Set([
  "crt-cable-and-connection-sheet.png",
  "crt-camera-path-study.png",
  "crt-power-on-contact-sheet.png",
]);
const mixedCyclesEeveeRepairPngs = new Set([
  "crt-screen-glass-and-phosphor-sheet.png",
  "crt-television-recommended-design-sheet.png",
]);
const browserRepairPngs = new Set([
  "crt-desktop-hero-composition.png",
  "crt-mobile-hero-composition.png",
  "crt-physical-dom-alignment-sheet.png",
  "crt-reduced-motion-desktop.png",
  "crt-reduced-motion-mobile.png",
  "crt-text-zoom-and-fallback.png",
]);

const requiredRepairValidationChecks = new Set([
  "refined_assembly_collection",
  "assembled_overall_width",
  "assembled_overall_height",
  "assembled_overall_depth",
  "convex_smoked_glass",
  "separate_phosphor_layer",
  "visible_screen_aspect_4_3",
  "desktop_spiral_2_5_turns",
  "mobile_spiral_2_25_turns",
  "mobile_authored_separately",
  "physical_rear_cable_connection",
  "closed_protected_cable_entry",
  "recessed_conductor_channel",
  "speaker_true_recess_and_plenum",
  "rear_vent_true_recess_and_plenum",
  "side_vent_true_recess_and_plenum",
  "period_control_taxonomy",
  "period_control_recess_and_travel",
  "abs_node_topology_and_settings",
  "glass_phosphor_layer_order",
  "glass_phosphor_positive_gap",
  "glass_fresnel_and_ior",
  "glass_transmission_and_roughness",
  "glass_evaluated_principled_inputs",
  "dormant_emission_zero",
  "active_raster_measured_4_3",
  "connector_localized_post_arrival",
  "phosphor_line_to_rectangular_raster_sequence",
  "simplified_physical_screen_content",
  "cycles_master_settings",
  "external_libraries",
  "external_images",
  "packed_files",
  "external_paths",
  "missing_files",
  "private_photo_loaded",
  "third_party_models",
  "modelled_from_scratch",
  "full_animatic_created",
  "manufacturer_branding",
  "exact_seven_power_states",
  "exact_eight_portal_states",
  "camera_arrival_to_power_arc",
  "raw_sequence_absent",
]);

const protectedBaseline = new Map([
  ["artifacts/original/phase-0", "2fc11881f8b4b771fafaab890d2879da20920a69"],
  ["artifacts/original/phase-0-3d-repair", "ac46cd1546dc8df8c41302574a39d0aef4465b52"],
  ["artifacts/original/phase-0-3d-repair-v2", "45dc45438ce1b981d448d7d3ea6c7ece38dea471"],
  ["artifacts/original/phase-0-3d-repair-v3", "9747b6d0d0753010b34e2e9eac44361ff1434e06"],
  ["artifacts/evidence/phase-0", "22de63edb2f8b58f748c84ff7b43ed8ca3d847f8"],
  ["artifacts/evidence/phase-0-3d-repair-v2", "062bce1170fd52ff5972348bcdcf7247cb92a574"],
  ["artifacts/evidence/phase-0-3d-repair-v3", "d0c6f026642fed1a683fcbb81e17de53794bf682"],
  ["artifacts/evidence/phase-0-4-crt-television", "144a95ed9dacb50808bf020d15891cb490eae795"],
  ["prototypes/phase-0-spiral-field", "5a0e8834e2c8b7f5b4c07f0a20f50f3a49a89dea"],
  ["prototypes/phase-0-3d-media-spike", "150b1a61077573345d532ed586613b645983bfed"],
  ["prototypes/phase-0-portal-layout-qa", "994bd7c225cb6f6691d5e0a1a163d23c2329cbbd"],
  ["prototypes/phase-0-4-crt-portal-qa", "2d77a24e5b1cc1bdaea13b48c9127e0c3926be3c"],
  ["docs/planning/QHUB_IMPORT_LEDGER.md", "7d521a8b229950338f2be3b77465cf94cd007526"],
  ["docs/planning/PUBLICATION_MATRIX.md", "641bc101ac3e868126917c58d93c5929831c2ae2"],
  ["src", "6c5fc6072e2884955e90d0c797056cbde64ab711"],
  ["public", "772f9408c9d51936d27efa81306c063b23be9235"],
  [".nvmrc", "5b540673a82888c11694866137e18f3865890bde"],
  ["astro.config.mjs", "dbea7720436ea60e5d2f3a090b14e89e64d055eb"],
  ["package-lock.json", "e6efe95e1029e95b98c72dc7cb3121d9fb86f49a"],
  ["docs/planning/FRAMEWORK_AND_CLOUDFLARE_CONTRACT.md", "dd4e1ac6cee77794ee4455995287a8cbc15c6b6e"],
  ["artifacts/evidence/phase-0/REPOSITORY_AND_CLOUDFLARE_AUDIT.md", "0b688515e3b904547190a9b0441cffe42446ef98"],
  ["scripts/verify-phase0-4-crt-assets.mjs", "5ca49c7729098ac5c75623a79b174b004abee552"],
  ["scripts/verify-phase0-4-crt-layout.mjs", "78688e144ad8eca5c9e3d36b36fdbdaed3d438ea"],
  ["artifacts/original/phase-0-4-crt-television/crt-portal-layout.json", "46467567abf5a0f664ea49a7312af708b8024ff0"],
  ["artifacts/original/phase-0-4-crt-television/phase-0-4-crt-television-review.zip", "2f27453f417c28e7c8489a23b085973790b15106"],
  ["artifacts/original/phase-0-4-crt-television/crt-television-proportion-options.png", "29ce4180125217454bb41234fabdea268dc81322"],
  ["artifacts/original/phase-0-4-crt-television/source/quantum-signal-television-proportion-options.blend", "bd8214e1f7614a02eddb590a51ec39084681b203"],
  ["artifacts/original/phase-0-4-crt-television/manifests/crt-proportion-render-manifest.json", "aef2c39bd22463fbd7d587affdf2275b8d9efd75"],
  ["artifacts/original/phase-0-4-crt-television/manifests/crt-proportion-decision-manifest.json", "7b6a873e37489a3b78dabc08d04ff86808f0845f"],
  ["artifacts/original/phase-0-4-crt-television/manifests/crt-proportion-source-validation.json", "082f03c96d807d3124490965e2704aad70e649e0"],
  ["artifacts/original/phase-0-4-crt-television/manifests/crt-power-on-state-authority.json", "5374ff038e6ef10c69653cf22bd5468a96f183c8"],
  ["artifacts/original/phase-0-4-crt-television/manifests/crt-portal-transition-state-authority.json", "18a469dcd3f5278c905a45226ee7ef86d6835cd5"],
  ["artifacts/original/phase-0-4-crt-television/source/package_crt_review_bundle.py", "0d18ad7f1289687d1bef91a08265159450770a76"],
  ["artifacts/evidence/phase-0-4-crt-television/browser-matrix-report.json", "6d66d8f16757fef040b08bddc89bb34ac119d9cf"],
  ["artifacts/evidence/phase-0-4-crt-television/browser-evidence-manifest.json", "e160e409dd82d8dc2d8ca40c336bedfe3bf7f2a0"],
  ["artifacts/evidence/phase-0-4-crt-television/capture-plan-authority.json", "7b3464fa7da4cec05a6c8ca7aed65732b8a303b4"],
  ["artifacts/evidence/phase-0-4-crt-television/captures", "778fbdd01c71818db2e069f84d41f35b21129cc3"],
  ["artifacts/evidence/phase-0-4-crt-television/reports", "d1e26241af823aa896da4092b669e42b6c855599"],
  ["artifacts/evidence/phase-0-4-crt-television/recovery", "e1fe72a2716f3d434cb5ff3f8af5369b59c98abf"],
]);

const allowedPackageExtensions = new Set([".blend", ".gitignore", ".json", ".md", ".png", ".py", ".webm", ".zip"]);
const forbiddenPackageExtensions = new Set([
  ".abc", ".apng", ".avi", ".avif", ".bmp", ".cr2", ".dng", ".exr", ".fbx", ".gif", ".glb", ".gltf",
  ".hdr", ".heic", ".heif", ".jpeg", ".jpg", ".m4a", ".m4v", ".mkv", ".mov", ".mp3", ".mp4", ".nef",
  ".obj", ".ogg", ".psb", ".psd", ".raw", ".stl", ".svg", ".tif", ".tiff", ".usda", ".usdc", ".usdz",
  ".wav", ".webp",
]);
const residuePath = /(?:^|\/)(?:__pycache__|cache|caches|frames?|sequence|sequences|temp|tmp)(?:\/|$)|\.blend\d+$|\.py[co]$/i;
const numberedFrame = /(?:^|\/)(?:(?:frame|shot|turntable|animatic)[-_]?)?\d{3,}\.(?:png|jpe?g|webp|avif)$/i;
const privateName = /(?:^|[\/._-])(?:private[-_ ]?reference|reference[-_ ]?photo|user[-_ ]?photo|manufacturer[-_ ]?photo)(?:[\/._-]|$)/i;

function check(condition, message) {
  if (!condition) errors.push(message);
}

function normalize(value) {
  return String(value ?? "").replaceAll("\\", "/");
}

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", options.quiet ? "ignore" : "pipe"],
    maxBuffer: 128 * 1024 * 1024,
  }).trim();
}

function gitBuffer(args, options = {}) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    stdio: ["ignore", "pipe", options.quiet ? "ignore" : "pipe"],
    maxBuffer: 128 * 1024 * 1024,
  });
}

async function exists(absolute) {
  try {
    await fs.access(absolute);
    return true;
  } catch {
    return false;
  }
}

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function privatePathHit(buffer) {
  const value = buffer.toString("latin1");
  const patterns = [
    ["Windows user path", /[A-Za-z]:[\\/]+Users[\\/]+[^\\/\x00\r\n]+[\\/]+/i],
    ["macOS user path", /[\\/]+Users[\\/]+[^\\/\x00\r\n]+[\\/]+/i],
    ["Codex attachment path", /(?:^|[\\/])\.codex[\\/]+attachments[\\/]+/i],
    ["OneDrive absolute path", /[A-Za-z]:[\\/]+[^\x00\r\n]*OneDrive[\\/]+/i],
  ];
  for (const [label, pattern] of patterns) if (pattern.test(value)) return label;
  return null;
}

async function readJson(absolute, label) {
  try {
    return JSON.parse(await fs.readFile(absolute, "utf8"));
  } catch (error) {
    errors.push(`${label} is missing or invalid JSON: ${error.message}`);
    return {};
  }
}

function recordsFrom(value) {
  if (Array.isArray(value)) return value;
  for (const key of ["records", "files", "assets", "outputs", "deliverables", "review_files", "reviewFiles", "renders"]) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return [];
}

function recordPath(record) {
  return normalize(
    record?.package_relative_path ?? record?.repository_relative_path ?? record?.relative_path ?? record?.path ?? record?.file ?? "",
  ).replace(`${packageRelative}/`, "");
}

function recordSha(record) {
  return String(record?.sha256 ?? record?.after_sha256 ?? record?.hash ?? "").toLowerCase();
}

function numberFrom(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return Number.NaN;
}

function boolFrom(object, keys) {
  for (const key of keys) if (typeof object?.[key] === "boolean") return object[key];
  return null;
}

function pngDimensions(buffer) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function pngContainsChunk(buffer, wanted) {
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const bytes = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    if (type === wanted) return true;
    offset += 12 + bytes;
  }
  return false;
}

async function decodePng(absolute, label) {
  if (!sharpDecoder) return null;
  try {
    const image = sharpDecoder(absolute, { animated: false, limitInputPixels: false });
    const metadata = await image.metadata();
    // The repair manifest deliberately hashes the decoded image after
    // ensureAlpha(), while the sanitizer authority records Sharp's native RGB
    // bytes and mode. Preserve both domains instead of treating one as the
    // other; this makes the byte-level comparison explicit and reproducible.
    const native = await image.raw().toBuffer({ resolveWithObject: true });
    const rgba = await sharpDecoder(absolute, { animated: false, limitInputPixels: false })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return {
      metadata,
      info: rgba.info,
      nativeInfo: native.info,
      pixelSha256: sha256Buffer(rgba.data),
      nativePixelSha256: sha256Buffer(native.data),
    };
  } catch (error) {
    errors.push(`${label} cannot be decoded: ${error.message}`);
    return null;
  }
}

// Sharp handles both governed PNG and JPEG browser/portal evidence. Keep the
// PNG-specific wrapper above for PNG-only gates and use this format-neutral
// name where a state authority intentionally mixes both formats.
async function decodeRaster(absolute, label) {
  return decodePng(absolute, label);
}

async function pngLumaStats(absolute, label) {
  if (!sharpDecoder) return null;
  try {
    const { data, info } = await sharpDecoder(absolute, { animated: false, limitInputPixels: false }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let maximum = 0;
    let atLeast200 = 0;
    for (let offset = 0; offset < data.length; offset += info.channels) {
      const luma = 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2];
      maximum = Math.max(maximum, luma);
      if (luma >= 200) atLeast200 += 1;
    }
    return { maximum, atLeast200, pixelCount: info.width * info.height };
  } catch (error) {
    errors.push(`${label} luma cannot be evaluated: ${error.message}`);
    return null;
  }
}

async function verifyFileRecord(record, label, expectedPath = null) {
  const relative = recordPath(record);
  check(relative.length > 0, `${label} has no package-relative path`);
  if (!relative) return null;
  if (expectedPath !== null) check(relative === expectedPath, `${label} path is ${relative}; expected ${expectedPath}`);
  check(!path.posix.isAbsolute(relative) && !relative.startsWith("../") && !relative.includes("/../"), `${label} has unsafe path: ${relative}`);
  const absolute = path.join(packageRoot, ...relative.split("/"));
  check(await exists(absolute), `${label} points to a missing file: ${relative}`);
  if (!(await exists(absolute))) return null;
  const buffer = await fs.readFile(absolute);
  const stat = await fs.stat(absolute);
  check(numberFrom(record, ["bytes", "size", "after_bytes"]) === stat.size, `${label} byte mismatch: ${relative}`);
  check(recordSha(record) === sha256Buffer(buffer), `${label} SHA-256 mismatch: ${relative}`);
  return { relative, absolute, buffer, stat };
}

function repositoryRecordPath(record) {
  return normalize(record?.repository_relative_path ?? record?.relative_path ?? record?.path ?? record?.file ?? "");
}

async function verifyRepositoryFileRecord(record, label, expectedPath = null) {
  const relative = repositoryRecordPath(record);
  check(relative.length > 0, `${label} has no repository-relative path`);
  if (!relative) return null;
  if (expectedPath !== null) check(relative === expectedPath, `${label} path is ${relative}; expected ${expectedPath}`);
  check(!path.posix.isAbsolute(relative) && !relative.startsWith("../") && !relative.includes("/../"), `${label} has unsafe repository path: ${relative}`);
  const absolute = path.join(repositoryRoot, ...relative.split("/"));
  check(await exists(absolute), `${label} points to a missing repository file: ${relative}`);
  if (!(await exists(absolute))) return null;
  const buffer = await fs.readFile(absolute);
  const stat = await fs.stat(absolute);
  check(numberFrom(record, ["bytes", "size"]) === stat.size, `${label} byte mismatch: ${relative}`);
  check(recordSha(record) === sha256Buffer(buffer), `${label} SHA-256 mismatch: ${relative}`);
  return { relative, absolute, buffer, stat };
}

async function listCandidatePaths() {
  return git(["ls-files", "--cached", "--others", "--exclude-standard"], { quiet: true })
    .split(/\r?\n/)
    .map(normalize)
    .filter(Boolean);
}

function parseLsTree() {
  const rows = new Map();
  for (const line of git(["ls-tree", "-r", "-l", "--full-tree", acceptedRepairParent], { quiet: true }).split(/\r?\n/)) {
    const match = line.match(/^\d+\s+blob\s+[0-9a-f]+\s+(\d+)\t(.+)$/);
    if (match) rows.set(normalize(match[2]), Number(match[1]));
  }
  return rows;
}

function parseBaselineBlobObjects() {
  const rows = new Map();
  for (const line of git(["ls-tree", "-r", "-l", "--full-tree", acceptedRepairParent], { quiet: true }).split(/\r?\n/)) {
    const match = line.match(/^\d+\s+blob\s+([0-9a-f]+)\s+(\d+)\t(.+)$/);
    if (match) rows.set(match[1], Number(match[2]));
  }
  return rows;
}

function gitBlobOid(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`, "utf8");
  return createHash("sha1").update(header).update(buffer).digest("hex");
}

async function candidateSizeReport(candidatePaths) {
  const baseline = parseLsTree();
  const baselineBlobs = parseBaselineBlobObjects();
  const changed = new Set(
    git(["diff", "--name-only", acceptedRepairParent, "--"], { quiet: true })
      .split(/\r?\n/)
      .map(normalize)
      .filter(Boolean),
  );
  const untracked = new Set(
    git(["ls-files", "--others", "--exclude-standard"], { quiet: true })
      .split(/\r?\n/)
      .map(normalize)
      .filter(Boolean),
  );
  let candidateBytes = 0;
  let filesystemBytes = 0;
  let newBlobBytes = 0;
  const newBlobOids = new Set();
  const files = [];
  for (const relative of candidatePaths) {
    const absolute = path.join(repositoryRoot, ...relative.split("/"));
    if (!(await exists(absolute))) continue;
    const stat = await fs.stat(absolute);
    if (!stat.isFile()) continue;
    const current = stat.size;
    const projected = baseline.has(relative) && !changed.has(relative) && !untracked.has(relative) ? baseline.get(relative) : current;
    candidateBytes += projected;
    filesystemBytes += current;
    if (changed.has(relative) || untracked.has(relative)) {
      const buffer = await fs.readFile(absolute);
      const oid = gitBlobOid(buffer);
      if (!baselineBlobs.has(oid) && !newBlobOids.has(oid)) {
        newBlobOids.add(oid);
        newBlobBytes += current;
      }
    }
    files.push({ relative, current, projected });
  }
  const baselineBytes = [...baseline.values()].reduce((sum, bytes) => sum + bytes, 0);
  const baselinePackage = [...baseline.entries()].filter(([relative]) => relative.startsWith(`${packageRelative}/`));
  const baselineEvidence = [...baseline.entries()].filter(([relative]) => relative.startsWith("artifacts/evidence/phase-0-4-crt-television/"));
  return {
    baselineFiles: baseline.size,
    baselineBytes,
    candidateFiles: files.length,
    candidateBytes,
    filesystemBytes,
    netGrowthBytes: candidateBytes - baselineBytes,
    newBlobCount: newBlobOids.size,
    newBlobBytes,
    baselinePackageFiles: baselinePackage.length,
    baselinePackageBytes: baselinePackage.reduce((sum, [, bytes]) => sum + bytes, 0),
    baselineEvidenceFiles: baselineEvidence.length,
    baselineEvidenceBytes: baselineEvidence.reduce((sum, [, bytes]) => sum + bytes, 0),
    files,
  };
}

// Branch, remote, protected history and working-tree boundaries.
check(git(["rev-parse", "--show-toplevel"]).replaceAll("\\", "/") === repositoryRoot.replaceAll("\\", "/"), "verifier is not running at the Qsite1 root");
check(git(["branch", "--show-current"]) === expectedBranch, `unexpected branch; expected ${expectedBranch}`);
check(git(["remote", "get-url", "origin"]) === expectedOrigin, "origin fetch URL is not the authorized Qsite1 remote");
check(git(["remote", "get-url", "--push", "origin"]) === expectedOrigin, "origin push URL is not the authorized Qsite1 remote");
try {
  git(["merge-base", "--is-ancestor", acceptedRepairParent, "HEAD"]);
} catch {
  errors.push(`repair parent ${acceptedRepairParent} is not an ancestor of HEAD`);
}

for (const [protectedPath, expectedObject] of protectedBaseline) {
  let observed = "";
  try {
    observed = git(["rev-parse", `HEAD:${protectedPath}`], { quiet: true });
  } catch {
    errors.push(`protected baseline path is missing: ${protectedPath}`);
  }
  check(observed === expectedObject, `protected baseline changed: ${protectedPath}`);
  check(git(["diff", "--name-only", "--", protectedPath], { quiet: true }).length === 0, `protected working-tree change: ${protectedPath}`);
  check(git(["diff", "--cached", "--name-only", "--", protectedPath], { quiet: true }).length === 0, `protected staged change: ${protectedPath}`);
  check(git(["ls-files", "--others", "--exclude-standard", "--", protectedPath], { quiet: true }).length === 0, `protected untracked content: ${protectedPath}`);
}

const candidatePaths = await listCandidatePaths();
const sizeReport = await candidateSizeReport(candidatePaths);
check(sizeReport.baselineFiles === 1097 && sizeReport.baselineBytes === 520_536_106, "accepted Phase 0.4R repository baseline totals changed");
check(sizeReport.baselinePackageFiles === 119 && sizeReport.baselinePackageBytes === 160_357_141, "accepted Phase 0.4R package baseline totals changed");
check(sizeReport.baselineEvidenceFiles === 260 && sizeReport.baselineEvidenceBytes === 21_923_821, "accepted Phase 0.4R evidence baseline totals changed");
check(sizeReport.netGrowthBytes < preferredNetGrowthBytes, `Phase 0.4R net tracked-blob growth is ${sizeReport.netGrowthBytes} B; preferred gate is <${preferredNetGrowthBytes} B`);
for (const file of sizeReport.files) check(file.current < maximumFileBytes, `candidate file reaches 100 MiB: ${file.relative} (${file.current} B)`);

if (finalMode) {
  const impactAbsolute = path.join(repositoryRoot, ...repositoryImpactRelative.split("/"));
  check(await exists(impactAbsolute), `missing Phase 0.4R repository-impact report: ${repositoryImpactRelative}`);
  if (await exists(impactAbsolute)) {
    const impact = await readJson(impactAbsolute, "Phase 0.4R repository-impact report");
    check(impact.schema === "quantum-hub.phase-0-4r-crt-television.repository-impact.v1", "Phase 0.4R repository-impact schema mismatch");
    check(impact.status === "PASS", "Phase 0.4R repository-impact report is not PASS");
    check((impact.accepted_parent ?? impact.baseline?.head) === acceptedRepairParent, "Phase 0.4R repository-impact report baseline mismatch");
    check(numberFrom(impact, ["candidate_files"]) === sizeReport.candidateFiles, "Phase 0.4R repository-impact candidate file count differs");
    check(numberFrom(impact, ["candidate_bytes"]) === sizeReport.candidateBytes, "Phase 0.4R repository-impact candidate bytes differ");
    check(numberFrom(impact, ["net_growth_bytes"]) === sizeReport.netGrowthBytes, "Phase 0.4R repository-impact net growth differs");
    check(numberFrom(impact, ["true_new_blob_count"]) === sizeReport.newBlobCount, "Phase 0.4R repository-impact true-new blob count differs");
    check(numberFrom(impact, ["true_new_blob_bytes"]) === sizeReport.newBlobBytes, "Phase 0.4R repository-impact true-new blob bytes differ");
    check(numberFrom(impact, ["preferred_budget_bytes"]) === preferredNetGrowthBytes, "Phase 0.4R repository-impact preferred budget differs");
    const exception = impact.preferred_budget_exception;
    if (sizeReport.newBlobBytes >= preferredNetGrowthBytes) {
      check(exception && typeof exception === "object", "Phase 0.4R true-new bytes exceed the preferred budget without a structured exception");
      check(typeof exception?.reason === "string" && exception.reason.trim().length >= 40, "Phase 0.4R preferred-budget exception lacks a concrete reason");
      check(exception?.required_evidence_preserved === true, "Phase 0.4R preferred-budget exception does not preserve required governed evidence");
      check(exception?.bytes_deleted_to_game_budget === false, "Phase 0.4R preferred-budget exception permits deleting evidence to game the metric");
      check(exception?.raw_eleven_shot_candidates_committed === false, "Phase 0.4R preferred-budget exception reports retained eleven-shot candidates");
      check(numberFrom(exception ?? {}, ["true_new_blob_bytes"]) === sizeReport.newBlobBytes, "Phase 0.4R preferred-budget exception true-new bytes differ");
    } else {
      check(exception == null, "Phase 0.4R repository-impact report declares an unnecessary preferred-budget exception");
    }
  }
}

const packageCandidatePaths = candidatePaths
  .filter((relative) => relative.startsWith(`${packageRelative}/`))
  .map((relative) => relative.slice(packageRelative.length + 1));
const trackedPackageWebm = packageCandidatePaths.filter((relative) => path.extname(relative).toLowerCase() === ".webm");
const trackedPackageZips = packageCandidatePaths.filter((relative) => path.extname(relative).toLowerCase() === ".zip");
check(trackedPackageWebm.length <= 1 && (trackedPackageWebm.length === 0 || trackedPackageWebm[0] === turntableRelative), `tracked package WebM set is invalid: ${trackedPackageWebm.join(", ")}`);
check(trackedPackageZips.length === 1 && trackedPackageZips[0] === oldReviewZipRelative, `tracked package ZIP set is invalid: ${trackedPackageZips.join(", ")}`);
if (finalMode) {
  check(trackedPackageWebm.length === 1 && trackedPackageWebm[0] === turntableRelative, "final package omits the exact governed turntable WebM");
  const topLevelPngs = packageCandidatePaths.filter((relative) => !relative.includes("/") && relative.endsWith(".png"));
  check(topLevelPngs.length === exactTopLevelReviewPngs.size, `final package has ${topLevelPngs.length}/${exactTopLevelReviewPngs.size} exact top-level review PNGs`);
  for (const name of exactTopLevelReviewPngs) check(topLevelPngs.includes(name), `final top-level review set omits ${name}`);
}

const deltaPaths = new Set([
  ...git(["diff", "--name-only", acceptedRepairParent, "--"], { quiet: true }).split(/\r?\n/),
  ...git(["ls-files", "--others", "--exclude-standard"], { quiet: true }).split(/\r?\n/),
]);
deltaPaths.delete("");
for (const rawPath of deltaPaths) {
  const relative = normalize(rawPath);
  const absolute = path.join(repositoryRoot, ...relative.split("/"));
  if (!(await exists(absolute))) continue;
  const stat = await fs.stat(absolute);
  if (!stat.isFile()) continue;
  const buffer = await fs.readFile(absolute);
  const hit = privatePathHit(buffer);
  check(hit === null, `${hit} leaked into Phase 0.4R candidate file ${relative}`);
  check(!privateName.test(relative), `private/reference-oriented filename is forbidden: ${relative}`);
  check(!buffer.subarray(0, 128).toString("utf8").startsWith("version https://git-lfs.github.com/spec/v1"), `Git LFS pointer is forbidden: ${relative}`);
  const extension = path.posix.basename(relative) === ".gitignore" ? ".gitignore" : path.extname(relative).toLowerCase();
  if ([".css", ".html", ".js", ".json", ".md", ".mjs", ".py"].includes(extension)) {
    const text = buffer.toString("utf8");
    if (relative !== "scripts/verify-phase0-4r-crt-assets.mjs") {
      check(!/no material (?:review )?improvement|Cycles remains authorized for|future[- ]only Cycles/i.test(text), `stale pre-repair Cycles rationale remains in ${relative}`);
    }
    if (relative.startsWith("prototypes/phase-0-4r-crt-portal-qa/")) {
      check(!/\bdefen[cs]e\b|\bdual[- ]use\b/i.test(text), `prohibited launch taxonomy leaked into Phase 0.4R governed text: ${relative}`);
    }
  }
  if (relative.startsWith(`${packageRelative}/`)) {
    check(allowedPackageExtensions.has(extension), `unapproved package extension: ${relative}`);
    check(!forbiddenPackageExtensions.has(extension), `forbidden external/reference format in package: ${relative}`);
    check(!residuePath.test(relative), `cache/temp/raw-sequence residue in package: ${relative}`);
    check(!numberedFrame.test(relative), `numbered raw-frame sequence member in package: ${relative}`);
  }
}

for (const relative of [
  `${packageRelative}/source/crt_canonical_config.py`,
  `${packageRelative}/manifests/crt-canonical-render-manifest.json`,
]) {
  const absolute = path.join(repositoryRoot, ...relative.split("/"));
  if (!(await exists(absolute))) continue;
  const text = await fs.readFile(absolute, "utf8");
  check(!/no material (?:review )?improvement|Cycles remains authorized for|future[- ]only Cycles/i.test(text), `stale pre-repair Cycles rationale remains in ${relative}`);
}

if (explicitPostcommit) {
  check(git(["rev-parse", "HEAD"], { quiet: true }) !== acceptedRepairParent, "postcommit verification requires a repair commit after the accepted parent");
  check(git(["status", "--porcelain=v1", "--untracked-files=all"], { quiet: true }).length === 0, "postcommit Phase 0.4R tree is not clean");
  check(git(["rev-parse", "HEAD"], { quiet: true }) === git(["rev-parse", "@{upstream}"], { quiet: true }), "postcommit Phase 0.4R HEAD is not the pushed upstream SHA");
}

for (const relative of candidatePaths) {
  check(relative !== ".lfsconfig" && !relative.endsWith("/.lfsconfig"), `Git LFS configuration is forbidden: ${relative}`);
}
try {
  const attributes = execFileSync("git", ["check-attr", "filter", "diff", "merge", "--stdin"], {
    cwd: repositoryRoot,
    input: `${candidatePaths.join("\n")}\n`,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 128 * 1024 * 1024,
  });
  check(!/\bfilter:\s*lfs\b/i.test(attributes), "Git LFS attributes apply to one or more candidate files");
} catch (error) {
  errors.push(`Git attribute audit failed: ${error.message}`);
}

if (finalMode || explicitPostcommit) {
  const historical = git(["rev-list", "--objects", `${acceptedRepairParent}..HEAD`], { quiet: true })
    .split(/\r?\n/)
    .map((line) => {
      const split = line.indexOf(" ");
      return split < 0 ? { object: line, relative: "" } : { object: line.slice(0, split), relative: normalize(line.slice(split + 1)) };
    })
    .filter((record) => record.object);
  for (const record of historical) {
    let type = "";
    try {
      type = git(["cat-file", "-t", record.object], { quiet: true });
    } catch {
      continue;
    }
    if (type !== "blob") continue;
    const buffer = gitBuffer(["cat-file", "blob", record.object], { quiet: true });
    const hit = privatePathHit(buffer);
    check(hit === null, `${hit} leaked into Phase 0.4R branch-history blob ${record.object}${record.relative ? ` (${record.relative})` : ""}`);
    check(!privateName.test(record.relative), `private/reference-oriented path exists in Phase 0.4R history: ${record.relative}`);
    check(!buffer.subarray(0, 128).toString("utf8").startsWith("version https://git-lfs.github.com/spec/v1"), `Git LFS pointer exists in Phase 0.4R history: ${record.relative || record.object}`);
  }
}

// The private photograph remains outside Git and outside the package by construction.
for (const relative of candidatePaths.filter((value) => value.startsWith(`${packageRelative}/`))) {
  check(!privateName.test(relative), `private/reference-oriented package filename is forbidden: ${relative}`);
  const extension = path.posix.basename(relative) === ".gitignore" ? ".gitignore" : path.extname(relative).toLowerCase();
  check(allowedPackageExtensions.has(extension), `unapproved package extension: ${relative}`);
  check(!forbiddenPackageExtensions.has(extension), `forbidden external/reference format in package: ${relative}`);
  check(!residuePath.test(relative), `cache/temp/raw-sequence residue in package: ${relative}`);
  check(!numberedFrame.test(relative), `numbered raw-frame sequence member in package: ${relative}`);
}

const proportionAbsolute = path.join(packageRoot, "crt-television-proportion-options.png");
if (await exists(proportionAbsolute)) {
  const proportionBuffer = await fs.readFile(proportionAbsolute);
  check(proportionBuffer.length === 4_912_129, "historical proportion sheet byte count changed");
  check(sha256Buffer(proportionBuffer) === "4e33468ac0073f8d73fe5ad3290e9a2b3e06ad6b2c8ab810c83033ec7083a250", "historical proportion sheet SHA-256 changed");
}
const oldZipAbsolute = path.join(packageRoot, oldReviewZipRelative);
if (await exists(oldZipAbsolute)) {
  const oldZipBuffer = await fs.readFile(oldZipAbsolute);
  check(oldZipBuffer.length === 43_303_597, "historical Phase 0.4 review ZIP byte count changed");
  check(sha256Buffer(oldZipBuffer) === "8eeec33182ad476d5dd78d5635a5dcb2cdfbeb96c97092462bd1af6227f642c7", "historical Phase 0.4 review ZIP SHA-256 changed");
}

const externalZipTracked = git(["ls-files", "--", externalReviewZipRelative], { quiet: true });
check(externalZipTracked.length === 0, "Phase 0.4R quality-review ZIP must remain outside Git");
let externalZipIgnored = false;
try {
  externalZipIgnored = Boolean(git(["check-ignore", externalReviewZipRelative], { quiet: true }));
} catch {
  externalZipIgnored = false;
}
check(externalZipIgnored, "Phase 0.4R quality-review ZIP path is not ignored");

function requireFinalFile(relative, label) {
  const absolute = path.join(packageRoot, ...relative.split("/"));
  return exists(absolute).then((present) => {
    if (finalMode) check(present, `missing ${label}: ${relative}`);
    return present;
  });
}

const finalAuthorities = [
  [repairManifestRelative, "repair lineage manifest"],
  [cyclesManifestRelative, "Cycles master manifest"],
  [turntableManifestRelative, "turntable manifest"],
  [validationRelative, "Blender validation report"],
  [keepoutRelative, "scene keepout authority"],
  [materialManifestRelative, "material authority"],
  [canonicalInventoryRelative, "canonical 45-still inventory"],
  [powerStateRelative, "power-state authority"],
  [physicalPortalStateRelative, "physical portal-state authority"],
  [portalStateRelative, "portal-state authority"],
  [staticReviewCompositionRelative, "static review-composition authority"],
  [sanitizerRelative, "PNG sanitizer authority"],
  [reviewBundleRelative, "review-bundle manifest"],
  [packageInventoryRelative, "package inventory"],
];
const authorityPresence = new Map();
for (const [relative, label] of finalAuthorities) authorityPresence.set(relative, await requireFinalFile(relative, label));
const repairActive = finalMode
  || authorityPresence.get(repairManifestRelative)
  || authorityPresence.get(cyclesManifestRelative)
  || authorityPresence.get(turntableManifestRelative)
  || authorityPresence.get(canonicalInventoryRelative)
  || authorityPresence.get(powerStateRelative)
  || authorityPresence.get(physicalPortalStateRelative)
  || authorityPresence.get(portalStateRelative);
const finalPackageSealingActive = finalMode || authorityPresence.get(repairManifestRelative);

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function verifyPng(relative, record, label, minimum = { width: 1000, height: 800 }) {
  const verified = await verifyFileRecord(record, label, relative);
  if (!verified) return null;
  const dimensions = pngDimensions(verified.buffer);
  check(dimensions !== null, `${label} is not a PNG: ${relative}`);
  if (!dimensions) return null;
  check(!pngContainsChunk(verified.buffer, "acTL"), `${label} is an animated PNG: ${relative}`);
  check(dimensions.width >= minimum.width && dimensions.height >= minimum.height, `${label} is only ${dimensions.width}x${dimensions.height}`);
  const recordedWidth = numberFrom(record, ["width"]);
  const recordedHeight = numberFrom(record, ["height"]);
  check(recordedWidth === dimensions.width && recordedHeight === dimensions.height, `${label} dimension record mismatch: ${relative}`);
  const decoded = await decodePng(verified.absolute, label);
  if (decoded) {
    check(decoded.info.width === dimensions.width && decoded.info.height === dimensions.height, `${label} decoded dimensions differ from IHDR`);
    if (typeof record.pixel_sha256 === "string") check(record.pixel_sha256.toLowerCase() === decoded.pixelSha256, `${label} decoded pixel SHA-256 mismatch`);
  }
  return { ...verified, dimensions, decoded };
}

let staticReviewComposition = {};
let staticReviewSheetsByName = new Map();
let staticQualityCloseupRecord = null;
if (authorityPresence.get(staticReviewCompositionRelative)) {
  staticReviewComposition = await readJson(
    path.join(packageRoot, ...staticReviewCompositionRelative.split("/")),
    "Phase 0.4R static review-composition authority",
  );
  check(staticReviewComposition.schema === "quantum-hub.phase-0-4r-crt-television.review-composition.v1", "static review-composition schema mismatch");
  check(
    ["CREATIVE_SHEETS_2_TO_9_COMPLETE_BROWSER_SHEETS_PENDING", "PASS"].includes(staticReviewComposition.status),
    "static review-composition authority has an invalid status",
  );
  for (const [record, expectedPath, label] of [
    [staticReviewComposition.composer, "source/compose_crt_canonical_review_sheets.py", "static review composer"],
    [staticReviewComposition.refined_source, refinedSourceRelative, "static review refined source"],
    [staticReviewComposition.canonical_render_authority, canonicalInventoryRelative, "static review canonical authority"],
    [staticReviewComposition.power_state_authority, powerStateRelative, "static review power authority"],
    [staticReviewComposition.cycles_master_authority, cyclesManifestRelative, "static review Cycles authority"],
    [staticReviewComposition.layout_authority, "crt-portal-layout.json", "static review layout authority"],
  ]) {
    check(Boolean(record), `${label} record is missing`);
    if (record) await verifyFileRecord(record, label, expectedPath);
  }
  const sheets = Array.isArray(staticReviewComposition.sheets) ? staticReviewComposition.sheets : [];
  check(sheets.length === exactStaticReviewSheets.size, `static review-composition has ${sheets.length}/${exactStaticReviewSheets.size} sheets`);
  check(
    canonicalJson(sheets.map((record) => [numberFrom(record, ["review_index", "reviewIndex"]), path.posix.basename(recordPath(record))])) ===
      canonicalJson([...exactStaticReviewSheets.entries()].map(([filename, expected]) => [expected.reviewIndex, filename])),
    "static review-composition sheet roster/order differs",
  );
  staticReviewSheetsByName = new Map(sheets.map((record) => [path.posix.basename(recordPath(record)), record]));
  for (const [filename, expected] of exactStaticReviewSheets) {
    const record = staticReviewSheetsByName.get(filename);
    check(Boolean(record), `static review-composition omits ${filename}`);
    if (!record) continue;
    await verifyPng(filename, record, `static review-composition output ${filename}`);
    const sources = Array.isArray(record.source_renders) ? record.source_renders : [];
    check(canonicalJson(sources.map(recordPath)) === canonicalJson(expected.sources), `static review-composition source roster differs: ${filename}`);
    for (let index = 0; index < sources.length; index += 1) {
      await verifyFileRecord(sources[index], `static review-composition source ${filename}[${index}]`, expected.sources[index]);
    }
  }
  staticQualityCloseupRecord = staticReviewComposition.quality_closeups ?? null;
  check(Boolean(staticQualityCloseupRecord), "static review-composition omits model-quality closeups");
  if (staticQualityCloseupRecord) {
    await verifyPng(closeupsRelative, staticQualityCloseupRecord, "static review-composition model-quality closeups", { width: 3000, height: 1800 });
    const sources = Array.isArray(staticQualityCloseupRecord.source_renders) ? staticQualityCloseupRecord.source_renders : [];
    check(canonicalJson(sources.map(recordPath)) === canonicalJson([...exactCyclesMasters]), "model-quality closeup source roster differs from the exact eight Cycles masters");
    for (const source of sources) await verifyFileRecord(source, "static review-composition model-quality source", recordPath(source));
  }
}

let repairManifest = {};
let repairRecordsByName = new Map();
if (authorityPresence.get(repairManifestRelative)) {
  repairManifest = await readJson(path.join(packageRoot, ...repairManifestRelative.split("/")), "Phase 0.4R repair manifest");
  check(repairManifest.schema === "quantum-hub.phase-0-4r-crt-television.repair-package.v1", "repair manifest schema mismatch");
  check(repairManifest.status === "PASS", "repair manifest is not PASS");
  check(
    repairManifest.accepted_parent === acceptedRepairParent || repairManifest.baseline?.head === acceptedRepairParent,
    "repair manifest does not bind the accepted repair parent",
  );
  const repairRecords = recordsFrom(repairManifest);
  check(repairRecords.length === exactRepairDeliverables.size, `repair manifest has ${repairRecords.length}/${exactRepairDeliverables.size} exact deliverables`);
  const byName = new Map(repairRecords.map((record) => [path.posix.basename(recordPath(record)), record]));
  repairRecordsByName = byName;
  check(byName.size === repairRecords.length, "repair manifest has duplicate deliverable paths");
  for (const name of exactRepairDeliverables) check(byName.has(name), `repair manifest omits ${name}`);
  const external = repairManifest.external_review_zip ?? repairManifest.externalReviewZip ?? {};
  check(external.intentionally_uncommitted === true || external.repository_status === "intentionally uncommitted", "repair manifest does not classify the external review ZIP as intentionally uncommitted");
  check(normalize(external.local_relative_path ?? external.path) === externalReviewZipRelative, "repair manifest external review ZIP path mismatch");
  check(Number.isFinite(numberFrom(external, ["bytes", "size"])) && numberFrom(external, ["bytes", "size"]) > 0, "repair manifest external review ZIP byte count is missing");
  check(/^[0-9a-f]{64}$/i.test(recordSha(external)), "repair manifest external review ZIP SHA-256 is missing");
  const packager = repairManifest.packager ?? repairManifest.authorities?.packager;
  check(Boolean(packager), "repair manifest omits the additive Phase 0.4R packager authority");
  if (packager) await verifyFileRecord(packager, "Phase 0.4R packager authority", repairPackagerRelative);
  for (const [field, expectedPath, label] of [
    ["canonical_inventory", canonicalInventoryRelative, "Phase 0.4R canonical inventory"],
    ["power_state_authority", powerStateRelative, "Phase 0.4R power-state authority"],
    ["physical_portal_state_authority", physicalPortalStateRelative, "Phase 0.4R physical portal-state authority"],
    ["portal_state_authority", portalStateRelative, "Phase 0.4R portal-state authority"],
    ["review_composition_authority", staticReviewCompositionRelative, "Phase 0.4R static review-composition authority"],
  ]) {
    const authority = repairManifest[field] ?? repairManifest.authorities?.[field];
    check(Boolean(authority), `repair manifest omits ${label}`);
    if (authority) await verifyFileRecord(authority, label, expectedPath);
  }
  const pixelHashes = new Set();
  const governedMasterPaths = new Set();
  for (const name of repairPngNames) {
    const record = byName.get(name) ?? {};
    const baseline = baselineRepairPngs.get(name);
    const before = record.before ?? record.baseline ?? record.previous ?? {};
    check(numberFrom(before, ["bytes", "size"]) === baseline.bytes, `repair manifest baseline bytes mismatch: ${name}`);
    check(recordSha(before) === baseline.sha256, `repair manifest baseline SHA-256 mismatch: ${name}`);
    const staticReviewRecord = staticReviewSheetsByName.get(name);
    if (staticReviewRecord) {
      check(recordPath(record) === recordPath(staticReviewRecord), `repair/static-review output path differs: ${name}`);
      check(numberFrom(record, ["bytes", "size"]) === numberFrom(staticReviewRecord, ["bytes", "size"]), `repair/static-review output bytes differ: ${name}`);
      check(recordSha(record) === recordSha(staticReviewRecord), `repair/static-review output SHA-256 differs: ${name}`);
    }
    const result = await verifyPng(name, record, `repair PNG ${name}`);
    const lineage = record.lineage ?? record.source_lineage ?? {};
    const lineageKind = String(lineage.kind ?? record.source_kind ?? "").toLowerCase();
    if (staticRepairPngs.has(name) && supplementalEeveeRepairPngs.has(name)) {
      check(
        ["eevee", "eevee-composition", "supplemental-eevee", "supplemental-eevee-composition"].includes(lineageKind),
        `supplemental layout/contact-sheet PNG has unlabelled render lineage: ${name}`,
      );
    } else if (staticRepairPngs.has(name) && mixedCyclesEeveeRepairPngs.has(name)) {
      check(
        ["mixed", "cycles-eevee-composition", "mixed-cycles-eevee-composition"].includes(lineageKind),
        `mixed Cycles/Eevee review PNG has unlabelled render lineage: ${name}`,
      );
    } else if (staticRepairPngs.has(name)) {
      check(lineageKind === "cycles" || lineageKind === "cycles-composition", `mandated static repair PNG lacks Cycles lineage: ${name}`);
    }
    if (browserRepairPngs.has(name)) check(lineageKind === "browser" || lineageKind === "browser-composition", `browser repair PNG lacks browser lineage: ${name}`);
    if (name === "crt-portal-transition-sheet.png") check(lineageKind === "mixed" || lineageKind === "cycles-browser-composition", "portal transition sheet lacks mixed Cycles/browser lineage");
    const sources = Array.isArray(lineage.sources)
      ? lineage.sources
      : Array.isArray(record.sources)
        ? record.sources
        : Array.isArray(record.source_renders)
          ? record.source_renders
          : [];
    const cycleSources = sources.filter((source) => exactCyclesMasters.has(recordPath(source)));
    const eeveeSources = sources.filter((source) => exactCanonicalRenderPaths.has(recordPath(source)));
    if (staticRepairPngs.has(name)) check(sources.length > 0, `static repair PNG has no governed source records: ${name}`);
    if (supplementalEeveeRepairPngs.has(name)) {
      check(eeveeSources.length === sources.length, `supplemental Eevee sheet consumes a non-canonical source: ${name}`);
    } else if (mixedCyclesEeveeRepairPngs.has(name)) {
      check(cycleSources.length > 0 && eeveeSources.length > 0, `mixed review sheet does not consume both Cycles and Eevee authorities: ${name}`);
      check(cycleSources.length + eeveeSources.length === sources.length, `mixed review sheet consumes an ungoverned source: ${name}`);
    } else if (staticRepairPngs.has(name)) {
      check(cycleSources.length === sources.length, `mandated Cycles repair PNG consumes a non-Cycles source: ${name}`);
    }
    for (const source of sources) {
      const sourcePath = recordPath(source);
      if (exactCyclesMasters.has(sourcePath)) {
        governedMasterPaths.add(sourcePath);
        await verifyFileRecord(source, `repair deliverable ${name} Cycles source`, sourcePath);
      } else if (exactCanonicalRenderPaths.has(sourcePath)) {
        await verifyFileRecord(source, `repair deliverable ${name} canonical Eevee source`, sourcePath);
      } else if (staticRepairPngs.has(name)) {
        check(false, `repair deliverable ${name} has an ungoverned static source: ${sourcePath || "missing path"}`);
      }
    }
    if (result) {
      check(sha256Buffer(result.buffer) !== baseline.sha256, `repair PNG was not updated: ${name}`);
      if (result.decoded) {
        check(!pixelHashes.has(result.decoded.pixelSha256), `duplicate repaired PNG pixels: ${name}`);
        pixelHashes.add(result.decoded.pixelSha256);
      }
    }
  }
  const closeupRecord = byName.get(closeupsRelative) ?? {};
  if (staticQualityCloseupRecord) {
    check(recordPath(closeupRecord) === recordPath(staticQualityCloseupRecord), "repair/static-review model-quality path differs");
    check(numberFrom(closeupRecord, ["bytes", "size"]) === numberFrom(staticQualityCloseupRecord, ["bytes", "size"]), "repair/static-review model-quality bytes differ");
    check(recordSha(closeupRecord) === recordSha(staticQualityCloseupRecord), "repair/static-review model-quality SHA-256 differs");
  }
  const closeup = await verifyPng(closeupsRelative, closeupRecord, "model quality closeups", { width: 3000, height: 1800 });
  const closeupLineage = closeupRecord.lineage ?? closeupRecord.source_lineage ?? {};
  check(["cycles", "cycles-composition"].includes(String(closeupLineage.kind ?? closeupRecord.source_kind ?? "").toLowerCase()), "model quality closeups lack Cycles lineage");
  const closeupSources = Array.isArray(closeupLineage.sources) ? closeupLineage.sources : [];
  check(closeupSources.length > 0, "model quality closeups have no governed Cycles master sources");
  for (const source of closeupSources) {
    const sourcePath = recordPath(source);
    check(exactCyclesMasters.has(sourcePath), `model quality closeups consume a non-Cycles source: ${sourcePath || "missing path"}`);
    if (exactCyclesMasters.has(sourcePath)) {
      governedMasterPaths.add(sourcePath);
      await verifyFileRecord(source, "model quality closeups Cycles source", sourcePath);
    }
  }
  if (closeup?.decoded) check(!pixelHashes.has(closeup.decoded.pixelSha256), "quality closeup pixels duplicate another review sheet");
  for (const master of exactCyclesMasters) check(governedMasterPaths.has(master), `repair deliverable lineage does not consume Cycles master ${master}`);
}

let cyclesManifest = {};
if (authorityPresence.get(cyclesManifestRelative)) {
  cyclesManifest = await readJson(path.join(packageRoot, ...cyclesManifestRelative.split("/")), "Cycles master manifest");
  check(cyclesManifest.schema === "quantum-hub.phase-0-4r-crt-television.cycles-master-render.v1", "Cycles manifest schema mismatch");
  check(cyclesManifest.status === "PASS", "Cycles manifest is not PASS");
  check(cyclesManifest.private_reference_loaded === false, "Cycles manifest reports the private CRT reference loaded");
  check(numberFrom(cyclesManifest, ["external_textures", "external_texture_count"]) === 0, "Cycles manifest reports external textures");
  check(numberFrom(cyclesManifest, ["external_models", "external_model_count"]) === 0, "Cycles manifest reports external models");
  check(cyclesManifest.full_animatic_created === false && cyclesManifest.frame_sequence_created === false, "Cycles master generation created a full animatic or retained frame sequence");
  const settings = cyclesManifest.render_settings ?? cyclesManifest.settings ?? {};
  check(settings.engine === "BLENDER_CYCLES", "Cycles master engine is not exactly BLENDER_CYCLES");
  check(Number.isInteger(numberFrom(settings, ["samples"])) && numberFrom(settings, ["samples"]) >= 64, "Cycles samples are missing or below 64");
  check(typeof settings.device === "string" && settings.device.length > 0, "Cycles device is missing");
  check(Number.isInteger(numberFrom(settings, ["seed"])), "Cycles seed is missing");
  check(boolFrom(settings, ["adaptive_sampling", "use_adaptive_sampling"]) !== null, "Cycles adaptive-sampling setting is missing");
  check(boolFrom(settings, ["denoising", "use_denoising"]) === true, "Cycles denoising is not enabled");
  check(typeof (settings.denoiser ?? settings.denoise_method) === "string", "Cycles denoiser is missing");
  check(boolFrom(settings, ["transparent_film", "film_transparent"]) !== null, "Cycles film-transparency setting is missing");
  for (const key of ["diffuse_bounces", "glossy_bounces", "transmission_bounces", "transparent_bounces", "volume_bounces"]) {
    check(Number.isFinite(numberFrom(settings, [key])), `Cycles ${key} is missing`);
  }
  check(String(settings.view_transform ?? settings.color_management?.view_transform ?? "").toLowerCase() === "agx", "Cycles color management is not AgX");
  check(typeof (settings.look ?? settings.color_management?.look) === "string", "Cycles AgX look is missing");
  const settingsHash = sha256Buffer(Buffer.from(canonicalJson(settings)));
  check(typeof cyclesManifest.render_settings_sha256 === "string" && cyclesManifest.render_settings_sha256.toLowerCase() === settingsHash, "Cycles settings SHA-256 is missing or does not match canonical settings JSON");
  const cyclesSource = cyclesManifest.source ?? cyclesManifest.authorities?.source ?? {};
  const cyclesSourceSha = recordSha(cyclesSource);
  const cyclesRenderer = cyclesManifest.renderer ?? cyclesManifest.authorities?.renderer ?? {};
  const cyclesRendererSha = recordSha(cyclesRenderer);
  check(/^[0-9a-f]{64}$/.test(cyclesSourceSha), "Cycles master source SHA-256 authority is missing");
  check(/^[0-9a-f]{64}$/.test(cyclesRendererSha), "Cycles master renderer SHA-256 authority is missing");
  const records = recordsFrom(cyclesManifest);
  check(records.length === exactCyclesMasters.size, `Cycles manifest has ${records.length}/${exactCyclesMasters.size} masters`);
  const byPath = new Map(records.map((record) => [recordPath(record), record]));
  const cyclesPixelHashes = new Set();
  for (const relative of exactCyclesMasters) {
    check(byPath.has(relative), `Cycles manifest omits ${relative}`);
    const record = byPath.get(relative) ?? {};
    const minimum = relative === "renders/repair-masters/cycles-proving-ground-master.png"
      ? { width: 1920, height: 1200 }
      : { width: 1600, height: 1000 };
    const result = await verifyPng(relative, record, `Cycles master ${relative}`, minimum);
    check((record.engine ?? record.render_engine ?? record.render_settings?.engine) === "BLENDER_CYCLES", `Cycles master record has wrong engine: ${relative}`);
    check(typeof record.render_settings_sha256 === "string" && record.render_settings_sha256.toLowerCase() === settingsHash, `Cycles master settings lineage is missing or mismatched: ${relative}`);
    const recordSourceSha = String(record.source_sha256 ?? record.lineage?.source_sha256 ?? recordSha(record.source)).toLowerCase();
    const recordRendererSha = String(record.renderer_sha256 ?? record.lineage?.renderer_sha256 ?? recordSha(record.renderer)).toLowerCase();
    check(recordSourceSha === cyclesSourceSha, `Cycles master does not bind the one frozen source SHA-256: ${relative}`);
    check(recordRendererSha === cyclesRendererSha, `Cycles master does not bind the one frozen renderer SHA-256: ${relative}`);
    if (result) {
      check(result.stat.size > 100_000, `Cycles master is implausibly small: ${relative}`);
      if (result.decoded) {
        check(!cyclesPixelHashes.has(result.decoded.pixelSha256), `Cycles master duplicates another decoded master: ${relative}`);
        cyclesPixelHashes.add(result.decoded.pixelSha256);
      }
    }
  }
  check(cyclesPixelHashes.size === exactCyclesMasters.size, `Cycles master decoded-pixel uniqueness is ${cyclesPixelHashes.size}/${exactCyclesMasters.size}`);
  const exactCyclesAuthorityPaths = new Map([
    ["source", refinedSourceRelative],
    ["builder", "source/build_refined_crt.py"],
    ["renderer", "source/render_crt_cycles_masters.py"],
    ["validator", "source/validate_refined_crt_source.py"],
  ]);
  for (const authority of ["source", "builder", "renderer", "validator"]) {
    const record = cyclesManifest[authority] ?? cyclesManifest.authorities?.[authority];
    check(Boolean(record), `Cycles manifest omits ${authority} authority`);
    if (record) await verifyFileRecord(record, `Cycles ${authority} authority`, exactCyclesAuthorityPaths.get(authority));
  }
}

let validation = {};
if (repairActive && authorityPresence.get(validationRelative)) {
  validation = await readJson(path.join(packageRoot, ...validationRelative.split("/")), "Blender repair validation");
  check(validation.status === "PASS", "Blender repair validation is not PASS");
  const sourceRecord = validation.source ?? validation.blend_source ?? validation.authorities?.source;
  const validatorRecord = validation.validator ?? validation.authorities?.validator;
  check(Boolean(sourceRecord), "Blender repair validation omits source authority");
  check(Boolean(validatorRecord), "Blender repair validation omits validator authority");
  if (sourceRecord) await verifyFileRecord(sourceRecord, "Blender repair source", refinedSourceRelative);
  if (validatorRecord) await verifyFileRecord(validatorRecord, "Blender repair validator", "source/validate_refined_crt_source.py");
  check(/^5\.2(?:\.0)?(?:\s|$)/.test(String(validation.blender_version ?? validation.blender?.version ?? "")), "Blender repair validation does not bind Blender 5.2");
  const checks = Array.isArray(validation.checks) ? validation.checks : [];
  const byId = new Map(checks.map((record) => [String(record.id ?? record.check_id ?? ""), record]));
  for (const id of requiredRepairValidationChecks) {
    check(byId.has(id), `Blender repair validation omits ${id}`);
    const record = byId.get(id);
    if (record) check(record.pass === true || record.status === "PASS", `Blender repair validation does not pass ${id}`);
  }
  const cyclesValidationSource = cyclesManifest.source ?? cyclesManifest.authorities?.source;
  if (sourceRecord && cyclesValidationSource) {
    check(recordSha(sourceRecord) === recordSha(cyclesValidationSource), "Blender validation source SHA-256 differs from the Cycles master source");
  }
  {
    const validatedSettings = byId.get("cycles_master_settings")?.measurements
      ?? byId.get("cycles_master_settings")?.actual
      ?? {};
    const governedSettings = cyclesManifest.render_settings ?? cyclesManifest.settings ?? {};
    check(
      canonicalJson(validatedSettings) === canonicalJson(governedSettings),
      "Blender-evaluated Cycles master settings differ from the governed Cycles render manifest",
    );
  }
  for (const id of ["speaker_true_recess_and_plenum", "rear_vent_true_recess_and_plenum", "side_vent_true_recess_and_plenum"]) {
    const detail = byId.get(id)?.measurements ?? byId.get(id)?.actual ?? {};
    const openDepth = numberFrom(detail, ["open_depth_m", "recess_depth_m", "opening_depth_m"]);
    const plenumDepth = numberFrom(detail, ["plenum_depth_m"]);
    check(detail.through_opening === true || detail.open_to_plenum === true, `${id} does not prove an open path into a plenum`);
    check(openDepth > 0 && plenumDepth > 0, `${id} does not prove positive open depth and a physical plenum`);
  }
  {
    const taxonomy = byId.get("period_control_taxonomy")?.measurements ?? byId.get("period_control_taxonomy")?.actual ?? {};
    const controls = Array.isArray(taxonomy.controls) ? taxonomy.controls : Array.isArray(taxonomy.taxonomy) ? taxonomy.taxonomy : [];
    const expectedCount = numberFrom(taxonomy, ["expected_count", "control_count"]);
    const actualCount = numberFrom(taxonomy, ["actual_count", "control_count"]);
    check(Number.isInteger(actualCount) && actualCount >= 2 && actualCount === expectedCount, "period control count does not match the declared exact count");
    check(controls.length === actualCount && new Set(controls.map((control) => String(control.type ?? control).toLowerCase())).size === actualCount, "period controls do not have distinct bound taxonomies");
    check(controls.every((control) => typeof control === "object" && numberFrom(control, ["recess_depth_m"]) > 0 && numberFrom(control, ["travel_m", "rotation_travel_degrees"]) > 0), "period controls do not each bind positive recess and travel");
  }
  {
    const layers = byId.get("glass_phosphor_layer_order")?.measurements ?? byId.get("glass_phosphor_layer_order")?.actual ?? {};
    const order = Array.isArray(layers.layer_order) ? layers.layer_order.map((value) => String(value).toLowerCase()) : [];
    const joined = order.join("|");
    check(order.length >= 4 && /glass/.test(joined) && /phosphor/.test(joined) && order.findIndex((value) => value.includes("glass")) < order.findIndex((value) => value.includes("phosphor")), "glass/phosphor layer order is not physically bound");
    const gap = byId.get("glass_phosphor_positive_gap")?.measurements ?? byId.get("glass_phosphor_positive_gap")?.actual ?? {};
    check(numberFrom(gap, ["gap_m", "minimum_gap_m"]) > 0, "glass/phosphor gap is not positive");
    const fresnel = byId.get("glass_fresnel_and_ior")?.measurements ?? byId.get("glass_fresnel_and_ior")?.actual ?? {};
    check(fresnel.fresnel_enabled === true && numberFrom(fresnel, ["ior"]) >= 1.4 && numberFrom(fresnel, ["ior"]) <= 1.7, "glass Fresnel/IOR evidence is missing or implausible");
    const transmission = byId.get("glass_transmission_and_roughness")?.measurements ?? byId.get("glass_transmission_and_roughness")?.actual ?? {};
    check(numberFrom(transmission, ["transmission_weight", "transmission"]) >= 0.35 && numberFrom(transmission, ["transmission_weight", "transmission"]) <= 0.9, "smoked glass transmission is missing or still predominantly opaque");
    check(numberFrom(transmission, ["roughness"]) >= 0.03 && numberFrom(transmission, ["roughness"]) <= 0.18, "smoked glass roughness is outside the credible restrained range");
    check(numberFrom(transmission, ["coat_roughness"]) >= 0.02 && numberFrom(transmission, ["coat_roughness"]) <= 0.2, "smoked glass coat roughness is outside the credible restrained range");
    check(numberFrom(transmission, ["specular_ior_level", "specular_level"]) > 0, "Blender 5.2 smoked-glass Specular IOR level is not explicitly bound");
    const evaluated = byId.get("glass_evaluated_principled_inputs")?.measurements ?? byId.get("glass_evaluated_principled_inputs")?.actual ?? {};
    check(evaluated.evaluated_from_blend === true, "smoked-glass values are claims rather than evaluated Blender node inputs");
    check(String(evaluated.material_name ?? evaluated.material ?? "") === "CRT_ThickSmokedGlass", "evaluated glass material name is not CRT_ThickSmokedGlass");
    check(String(evaluated.node_type ?? evaluated.principled_node_type ?? "").toUpperCase().includes("PRINCIPLED"), "evaluated glass node is not Principled BSDF");
    check(numberFrom(evaluated, ["roughness"]) >= 0.03 && numberFrom(evaluated, ["roughness"]) <= 0.18, "evaluated base Roughness is outside the credible restrained range");
    check(numberFrom(evaluated, ["transmission_weight", "transmission"]) >= 0.35 && numberFrom(evaluated, ["transmission_weight", "transmission"]) <= 0.9, "evaluated Transmission Weight is missing or predominantly opaque");
    check(numberFrom(evaluated, ["ior"]) >= 1.4 && numberFrom(evaluated, ["ior"]) <= 1.7, "evaluated glass IOR is implausible");
    check(numberFrom(evaluated, ["specular_ior_level", "specular_level"]) > 0, "evaluated Specular IOR Level is not positive");
    check(numberFrom(evaluated, ["coat_weight"]) >= 0 && numberFrom(evaluated, ["coat_weight"]) <= 0.25, "evaluated Coat Weight is missing or excessive");
    check(numberFrom(evaluated, ["glass_phosphor_gap_m", "phosphor_gap_m"]) > 0, "evaluated glass/phosphor physical gap is not positive");
    check(numberFrom(evaluated, ["dormant_phosphor_emission_strength", "dormant_emission_strength"]) === 0, "evaluated dormant phosphor emission is not exactly zero");
    const dormant = byId.get("dormant_emission_zero")?.measurements ?? byId.get("dormant_emission_zero")?.actual ?? {};
    check(numberFrom(dormant, ["emission_strength", "maximum_emission_strength"]) === 0, "dormant phosphor emission is not exactly zero");
  }
  {
    const raster = byId.get("active_raster_measured_4_3")?.measurements ?? byId.get("active_raster_measured_4_3")?.actual ?? {};
    const width = numberFrom(raster, ["active_width_m", "width"]);
    const height = numberFrom(raster, ["active_height_m", "height"]);
    const aspect = numberFrom(raster, ["measured_aspect_ratio", "aspect_ratio"]);
    check(width > 0 && height > 0 && Math.abs(width / height - 4 / 3) <= 0.01, "active raster measured bounds are not 4:3 within 0.01");
    check(Number.isFinite(aspect) && Math.abs(aspect - 4 / 3) <= 0.01, "active raster recorded aspect is not 4:3 within 0.01");
  }
  {
    const connector = byId.get("connector_localized_post_arrival")?.measurements ?? byId.get("connector_localized_post_arrival")?.actual ?? {};
    check(numberFrom(connector, ["pre_arrival_emission", "pre_arrival_emission_strength"]) === 0, "connector emits before arrival");
    check(numberFrom(connector, ["post_arrival_emission", "post_arrival_emission_strength"]) > 0, "connector has no post-arrival response");
    check(connector.localized === true && numberFrom(connector, ["affected_area_ratio", "local_area_ratio"]) > 0 && numberFrom(connector, ["affected_area_ratio", "local_area_ratio"]) <= 0.1, "connector response is not demonstrably localized");
  }
  {
    const entry = byId.get("closed_protected_cable_entry")?.measurements ?? byId.get("closed_protected_cable_entry")?.actual ?? {};
    for (const variant of ["desktop", "mobile"]) {
      const record = entry[variant] ?? {};
      check(record.endpoint_inside_collar === true && record.exposed_cut_end === false, `${variant} cable entry is not closed inside the strain-relief collar`);
      check(numberFrom(record, ["start_radius_m"]) > numberFrom(record, ["end_radius_m"]) && numberFrom(record, ["end_radius_m"]) > 0, `${variant} cable entry does not prove a positive tapered overmould`);
    }
  }
  {
    const channel = byId.get("recessed_conductor_channel")?.measurements ?? byId.get("recessed_conductor_channel")?.actual ?? {};
    const variants = [channel.desktop, channel.mobile].filter((record) => record && typeof record === "object");
    const records = variants.length ? variants : [channel];
    for (const record of records) {
      const sheath = numberFrom(record, ["sheath_diameter_m", "sheath_width_m", "channel_width_m"]);
      const core = numberFrom(record, ["core_diameter_m", "core_width_m"]);
      const groove = numberFrom(record, ["groove_depth_m", "channel_depth_m", "recess_depth_m"]);
      const recess = numberFrom(record, ["core_recess_below_shoulders_m", "core_recess_depth_m"]);
      check(sheath > core && core > 0, "evaluated cable conductor/core is not enclosed by a wider physical sheath");
      check(groove > 0 && recess > 0, "evaluated cable core is not recessed below positive graphite shoulders/groove depth");
    }
  }
  {
    const sequence = byId.get("phosphor_line_to_rectangular_raster_sequence")?.measurements
      ?? byId.get("phosphor_line_to_rectangular_raster_sequence")?.actual
      ?? {};
    const stages = Array.isArray(sequence.stages) ? sequence.stages : Array.isArray(sequence.states) ? sequence.states : [];
    const findStage = (wanted, fallback) => stages.find((stage) => String(stage.id ?? stage.state_id ?? stage.phase ?? "").toLowerCase().includes(wanted)) ?? fallback ?? {};
    const wake = findStage("wake", sequence.wake ?? sequence.line);
    const partial = findStage("partial", sequence.partial_raster ?? sequence.partial);
    const full = findStage("full", sequence.full_raster ?? sequence.full);
    const wakeShape = String(wake.shape ?? wake.form ?? "").toLowerCase();
    const wakeOrientation = String(wake.orientation ?? wake.axis ?? "").toLowerCase();
    check(wakeShape.includes("line") && !/(?:dot|ellipse|circle|crosshair)/.test(wakeShape), "validated CRT startup does not begin with a phosphor line");
    check(wakeOrientation.includes("horizontal") && (wake.bowed === true || numberFrom(wake, ["bow_amount", "curvature", "curvature_ratio"]) > 0), "validated CRT wake line is not horizontal and measurably bowed");
    const partialShape = String(partial.shape ?? partial.form ?? "").toLowerCase();
    const partialAspect = numberFrom(partial, ["measured_aspect_ratio", "aspect_ratio"]);
    const partialFill = numberFrom(partial, ["vertical_fill_ratio", "fill_progress", "vertical_expansion_progress"]);
    check(partialShape.includes("rect") && (partial.rounded === true || numberFrom(partial, ["corner_radius", "corner_radius_m", "corner_radius_ratio"]) > 0), "validated partial CRT raster is not rounded-rectangular");
    check(Number.isFinite(partialAspect) && Math.abs(partialAspect - 4 / 3) <= 0.02, "validated partial CRT raster is not 4:3 within 0.02");
    check(partialFill > 0 && partialFill < 1 && (partial.expanded_from_horizontal_line === true || String(partial.expanded_from ?? "").toLowerCase().includes("line")), "validated partial raster does not expand progressively from the wake line");
    const partialRipple = partial.degaussing_ripple ?? sequence.partial_degaussing_ripple ?? {};
    check(partialRipple.active === true || partialRipple.visible === true || partialRipple.present === true, "validated partial CRT raster omits active degaussing ripple evidence");
    const fullShape = String(full.shape ?? full.form ?? "").toLowerCase();
    const fullAspect = numberFrom(full, ["measured_aspect_ratio", "aspect_ratio"]);
    const fullFill = numberFrom(full, ["vertical_fill_ratio", "fill_progress", "vertical_expansion_progress"]);
    check(fullShape.includes("rect") && (full.rounded === true || numberFrom(full, ["corner_radius", "corner_radius_m", "corner_radius_ratio"]) > 0), "validated full CRT raster is not rounded-rectangular");
    check(Number.isFinite(fullAspect) && Math.abs(fullAspect - 4 / 3) <= 0.02 && fullFill >= 0.98, "validated full CRT raster is not a settled 4:3 fill");
    const settled = full.degaussing_ripple ?? sequence.full_degaussing_ripple ?? {};
    check(settled.settled === true || full.degaussing_settled === true, "validated degaussing ripple is not settled at full raster");
  }
  {
    const content = byId.get("simplified_physical_screen_content")?.measurements
      ?? byId.get("simplified_physical_screen_content")?.actual
      ?? {};
    const states = Array.isArray(content.states) ? content.states : Array.isArray(content.records) ? content.records : [];
    check(states.length >= 2, "validated simplified physical-screen content omits stabilized and portal-ready states");
    for (const state of states) {
      const lines = state.lines ?? state.copy_lines ?? [];
      check(state.simplified === true && Array.isArray(lines) && lines.length >= 1 && lines.length <= 4, `validated physical-screen state ${state.id ?? state.state_id ?? "unknown"} is not simplified to 1–4 lines`);
    }
  }
  for (const [label, keys] of [
    ["external libraries", ["external_library_count", "external_libraries"]],
    ["external images", ["external_image_count", "external_images"]],
    ["packed files", ["packed_file_count", "packed_files"]],
    ["external paths", ["external_path_count", "external_paths"]],
    ["missing files", ["missing_file_count", "missing_files"]],
    ["third-party models", ["third_party_model_count", "third_party_models"]],
  ]) check(numberFrom(validation, keys) === 0 || numberFrom(validation.summary ?? {}, keys) === 0, `Blender validation ${label} count is not zero`);
  check(validation.private_photo_loaded === false || validation.creative_boundary?.private_photo_loaded === false, "private CRT photo was loaded into Blender");
  check(validation.full_animatic_created === false || validation.media?.full_animatic_created === false, "full animatic was created");
}

if (repairActive && authorityPresence.get(materialManifestRelative)) {
  const material = await readJson(path.join(packageRoot, ...materialManifestRelative.split("/")), "CRT material manifest");
  check(material.schema === "quantum-hub.phase-0-4-crt-television.material-and-asset.v1", "CRT material manifest schema mismatch");
  check(material.status === "PASS", "CRT material manifest is not PASS");
  check(material.procedural_only === true, "CRT material manifest is not procedural-only");
  check(numberFrom(material, ["external_texture_count"]) === 0, "CRT material manifest reports external textures");
  check(numberFrom(material, ["external_model_count", "model_count"]) === 0, "CRT material manifest reports external models");
  check(material.private_reference_loaded === false, "CRT material manifest reports the private reference loaded");
  const quality = material.phase_0_4r_quality ?? material.repair_quality ?? {};
  check(quality.abs_node_topology?.status === "PASS" || quality.abs_node_topology?.pass === true, "ABS node topology is not PASS");
  const nodeTypes = Array.isArray(quality.abs_node_topology?.node_types) ? quality.abs_node_topology.node_types.map((value) => String(value).toLowerCase()) : [];
  check(nodeTypes.some((value) => value.includes("principled")) && nodeTypes.some((value) => value.includes("noise")) && nodeTypes.some((value) => value.includes("bump")), "ABS topology omits Principled/noise/bump nodes");
  check(Number.isFinite(numberFrom(quality.abs_node_topology ?? {}, ["roughness"])), "ABS roughness setting is missing");
  check(Number.isFinite(numberFrom(quality.abs_node_topology ?? {}, ["specular_ior_level", "specular"])), "ABS specular/IOR setting is missing");
  check(Number.isFinite(numberFrom(quality.abs_node_topology ?? {}, ["bump_strength"])), "ABS bump strength is missing");
  check(Number.isFinite(numberFrom(quality.abs_node_topology ?? {}, ["grain_scale"])), "ABS grain scale is missing");
  for (const authority of ["source", "builder", "renderer", "validator"]) {
    const record = material[authority] ?? material.authorities?.[authority];
    check(Boolean(record), `CRT material manifest omits ${authority} authority`);
    if (record) await verifyFileRecord(record, `CRT material ${authority} authority`, authority === "source" ? refinedSourceRelative : null);
  }
}

function stateId(record) {
  return String(record?.state_id ?? record?.id ?? record?.state ?? "");
}

function stateRenderSha(record) {
  return recordSha(record?.render ?? record?.capture ?? record?.file ?? record);
}

async function verifyStateRender(record, label) {
  const file = record?.render ?? record?.capture ?? record?.file ?? record;
  const repositoryRelative = normalize(file?.repository_relative_path ?? file?.path ?? "");
  if (file?.repository_relative_path || /^(?:artifacts|prototypes|scripts)\//.test(repositoryRelative)) {
    return verifyRepositoryFileRecord(file, label);
  }
  return verifyFileRecord(file, label);
}

function stateRenderRecord(record) {
  return record?.render ?? record?.capture ?? record?.file ?? record ?? {};
}

function normalizedInterfaceStage(record) {
  const rendered = stateRenderRecord(record);
  return String(rendered.interface_stage ?? rendered.interfaceStage ?? "").toLowerCase();
}

function verifyPhysicalScreenContentAuthority(authority, label) {
  const content = authority?.physical_screen_content ?? authority?.physicalScreenContent ?? {};
  const states = Array.isArray(content.states) ? content.states : [];
  check(states.length === exactPhysicalScreenContent.length, `${label} does not bind the exact three simplified physical-screen content stages`);
  for (let index = 0; index < exactPhysicalScreenContent.length; index += 1) {
    const expected = exactPhysicalScreenContent[index];
    const actual = states[index] ?? {};
    check(String(actual.id ?? actual.stage_id ?? "") === expected.id, `${label} physical-screen content stage ${index + 1} has the wrong id`);
    check(actual.simplified === true, `${label} physical-screen content stage ${expected.id} is not explicitly simplified`);
    check(canonicalJson(Array.isArray(actual.lines) ? actual.lines : []) === canonicalJson(expected.lines), `${label} physical-screen content stage ${expected.id} has the wrong copy`);
  }
  const approved = Array.isArray(content.approved_copy) ? content.approved_copy : Array.isArray(content.approvedCopy) ? content.approvedCopy : [];
  check(canonicalJson(approved) === canonicalJson(exactPhysicalScreenContent.flatMap((state) => state.lines)), `${label} approved physical-screen copy is not exact or ordered`);
  check(content.fictional_os_chrome === false && content.dense_telemetry === false, `${label} permits fictional OS chrome or dense telemetry`);
}

async function verifyPhysicalScreenContentStateMap(authority, label, expectedSourceSha, canonicalById = null) {
  const stateMap = authority?.physical_screen_content_state_map ?? authority?.physicalScreenContentStateMap;
  check(stateMap && typeof stateMap === "object" && !Array.isArray(stateMap), `${label} omits the physical-screen content state map`);
  if (!stateMap || typeof stateMap !== "object" || Array.isArray(stateMap)) return "";
  check(canonicalJson(Object.keys(stateMap)) === canonicalJson([...exactPhysicalScreenStateMap.keys()]), `${label} content-state map keys/order are not exact`);
  const paths = new Set();
  const hashes = new Set();
  for (const [stage, expected] of exactPhysicalScreenStateMap) {
    const record = stateMap[stage] ?? {};
    const renders = Array.isArray(record.renders) ? record.renders : [];
    check(record.stage === stage, `${label} content-state map has wrong stage metadata: ${stage}`);
    check(record.proof_status === "PASS", `${label} content-state map is not proof-status PASS: ${stage}`);
    check(record.visibility === expected.visibility, `${label} content-state visibility is wrong: ${stage}`);
    check(canonicalJson(record.state_ids ?? []) === canonicalJson(expected.stateIds), `${label} content-state IDs are wrong: ${stage}`);
    check(canonicalJson(record.expected_copy_lines ?? []) === canonicalJson(expected.expectedCopyLines), `${label} content-state copy is wrong: ${stage}`);
    check(renders.length === expected.stateIds.length, `${label} content-state render count is wrong: ${stage}`);
    for (let index = 0; index < expected.stateIds.length; index += 1) {
      const expectedId = expected.stateIds[index];
      const render = renders[index] ?? {};
      check(stateId(render) === expectedId, `${label} content-state render order/id is wrong: ${stage}/${expectedId}`);
      check(normalizedInterfaceStage(render) === expected.interfaceStage, `${label} content-state interface stage is wrong: ${stage}/${expectedId}`);
      const interfaceVisible = stateRenderRecord(render).interface;
      check(interfaceVisible === (stage !== "text-free"), `${label} content-state interface visibility is wrong: ${stage}/${expectedId}`);
      if (stage === "text-free") check(String(stateRenderRecord(render).phosphor ?? "").toLowerCase() === "takeover", `${label} text-free state is not the takeover phosphor state`);
      const sourceSha = String(
        render.source_sha256
          ?? render.lineage?.source_sha256
          ?? render.lineage?.refined_source_sha256
          ?? "",
      ).toLowerCase();
      check(sourceSha === expectedSourceSha, `${label} content-state source SHA-256 differs: ${stage}/${expectedId}`);
      const verified = await verifyStateRender(render, `${label} content-state render ${expectedId}`);
      if (verified) {
        check(!paths.has(verified.relative), `${label} reuses a content-state render path: ${verified.relative}`);
        paths.add(verified.relative);
        const hash = sha256Buffer(verified.buffer);
        check(!hashes.has(hash), `${label} reuses content-state rendered bytes: ${expectedId}`);
        hashes.add(hash);
        const decoded = await decodePng(verified.absolute, `${label} content-state render ${expectedId}`);
        check(Boolean(decoded), `${label} content-state render is not a decodable PNG: ${expectedId}`);
      }
      if (canonicalById instanceof Map && canonicalById.has(expectedId)) {
        check(canonicalJson(render) === canonicalJson(canonicalById.get(expectedId)), `${label} content-state render differs from canonical inventory: ${stage}/${expectedId}`);
      }
    }
  }
  return canonicalJson(stateMap);
}

let canonicalInventory = {};
let canonicalById = new Map();
let canonicalStateMapDigest = "";
if (repairActive && authorityPresence.get(canonicalInventoryRelative)) {
  canonicalInventory = await readJson(path.join(packageRoot, ...canonicalInventoryRelative.split("/")), "Phase 0.4R canonical inventory");
  check(canonicalInventory.schema === "quantum-hub.phase-0-4r-crt-television.canonical-render-inventory.v1", "Phase 0.4R canonical inventory schema mismatch");
  check(canonicalInventory.status === "PASS", "Phase 0.4R canonical inventory is not PASS");
  check(canonicalInventory.repair_baseline === acceptedRepairParent, "Phase 0.4R canonical inventory does not bind the repair baseline");
  const canonicalSource = canonicalInventory.source ?? canonicalInventory.authorities?.source;
  const canonicalGenerator = canonicalInventory.generator ?? canonicalInventory.authorities?.generator;
  const canonicalValidator = canonicalInventory.validator ?? canonicalInventory.authorities?.validator;
  const canonicalConfiguration = canonicalInventory.configuration_authority ?? canonicalInventory.configurationAuthority;
  check(Boolean(canonicalSource), "Phase 0.4R canonical inventory omits source authority");
  check(Boolean(canonicalGenerator), "Phase 0.4R canonical inventory omits renderer authority");
  check(Boolean(canonicalValidator), "Phase 0.4R canonical inventory omits validator authority");
  check(Array.isArray(canonicalConfiguration) && canonicalConfiguration.length === 2, "Phase 0.4R canonical inventory does not bind the exact two configuration authorities");
  if (canonicalSource) await verifyFileRecord(canonicalSource, "canonical inventory source", refinedSourceRelative);
  if (canonicalGenerator) await verifyFileRecord(canonicalGenerator, "canonical inventory renderer", "source/render_crt_canonical_stills.py");
  if (canonicalValidator) await verifyFileRecord(canonicalValidator, "canonical inventory validator", "source/validate_refined_crt_source.py");
  if (Array.isArray(canonicalConfiguration)) {
    const configurationByPath = new Map(canonicalConfiguration.map((record) => [recordPath(record), record]));
    for (const relative of ["source/crt_canonical_config.py", "source/crt_refined_config.py"]) {
      const record = configurationByPath.get(relative);
      check(Boolean(record), `canonical inventory omits configuration authority ${relative}`);
      if (record) await verifyFileRecord(record, `canonical inventory configuration ${relative}`, relative);
    }
  }
  const validationSource = validation.source ?? validation.blend_source ?? validation.authorities?.source;
  const cyclesSource = cyclesManifest.source ?? cyclesManifest.authorities?.source;
  if (canonicalSource && validationSource) check(recordSha(canonicalSource) === recordSha(validationSource), "canonical inventory source differs from Blender validation source");
  if (canonicalSource && cyclesSource) check(recordSha(canonicalSource) === recordSha(cyclesSource), "canonical inventory source differs from Cycles master source");
  const records = recordsFrom(canonicalInventory);
  check(numberFrom(canonicalInventory, ["render_count", "renderCount"]) === 45, "canonical inventory does not declare 45 renders");
  check(records.length === 45, `canonical inventory has ${records.length}/45 records`);
  const actualCanonicalRoster = records.map((record) => [stateId(record), String(record.group ?? ""), recordPath(record)]);
  check(canonicalJson(actualCanonicalRoster) === canonicalJson(exactCanonicalRoster), "canonical inventory does not preserve the exact ordered 45-state ID/group/path roster");
  canonicalById = new Map(records.map((record) => [stateId(record), record]));
  check(canonicalById.size === 45, "canonical inventory state IDs are not unique");
  const canonicalPaths = new Set();
  for (const [id, expectedGroup, expectedPath] of exactCanonicalRoster) {
    const record = canonicalById.get(id);
    if (!record) continue;
    check(id.length > 0, "canonical inventory contains an empty state ID");
    const verified = await verifyFileRecord(record, `canonical inventory render ${id}`, expectedPath);
    check(String(record.group ?? "") === expectedGroup, `canonical inventory render group differs: ${id}`);
    if (verified) {
      check(!canonicalPaths.has(verified.relative), `canonical inventory reuses render path ${verified.relative}`);
      canonicalPaths.add(verified.relative);
      if (id === "glass-grazing-proof") {
        const luma = await pngLumaStats(verified.absolute, "canonical glass-grazing proof");
        if (luma) {
          check(luma.atLeast200 === 0, `canonical glass-grazing proof contains ${luma.atLeast200} white-blown pixels >=200 luma`);
          check(luma.maximum < 200, `canonical glass-grazing proof max luma is ${luma.maximum}; expected <200`);
        }
      }
    }
    const lineageSource = String(record.source_sha256 ?? record.lineage?.source_sha256 ?? record.lineage?.refined_source_sha256 ?? "").toLowerCase();
    check(lineageSource === recordSha(canonicalSource), `canonical render source lineage differs: ${id}`);
  }
  for (const id of [...exactPowerStateIds, ...exactPortalStateIds.slice(0, 6), ...exactSourceRoles]) {
    check(canonicalById.has(id), `canonical inventory omits governed state ${id}`);
  }
  const audit = canonicalInventory.render_audit ?? canonicalInventory.audit ?? {};
  check(audit.status === "PASS", "canonical inventory render audit is not PASS");
  check(numberFrom(audit, ["expected_count"]) === 45 && numberFrom(audit, ["governed_count"]) === 45, "canonical inventory render audit is not 45/45");
  check(numberFrom(audit, ["unique_id_count"]) === 45 && numberFrom(audit, ["unique_path_count"]) === 45, "canonical inventory render audit uniqueness is not 45/45");
  check(numberFrom(audit, ["missing_count"]) === 0 && numberFrom(audit, ["dimension_mismatch_count"]) === 0, "canonical inventory render audit reports missing/dimension failures");
  check(canonicalInventory.full_animatic_created === false && canonicalInventory.frame_sequence_created === false, "canonical still inventory created an animatic or retained frame sequence");
  verifyPhysicalScreenContentAuthority(canonicalInventory, "canonical inventory");
  canonicalStateMapDigest = await verifyPhysicalScreenContentStateMap(canonicalInventory, "canonical inventory", recordSha(canonicalSource), canonicalById);
}

if (repairActive && authorityPresence.get(powerStateRelative)) {
  const power = await readJson(path.join(packageRoot, ...powerStateRelative.split("/")), "CRT power-state authority");
  check(power.schema === "quantum-hub.phase-0-4r-crt-television.power-on-state-authority.v1", "Phase 0.4R power-state authority schema mismatch");
  check(power.status === "PASS" || power.status === "FROZEN", "CRT power-state authority is not PASS/FROZEN");
  const states = power.states ?? recordsFrom(power);
  check(states.length === exactPowerStateIds.length, `power authority has ${states.length}/${exactPowerStateIds.length} states`);
  check(states.map(stateId).join("|") === exactPowerStateIds.join("|"), "power authority state order is not exact");
  const byId = new Map(states.map((record) => [stateId(record), record]));
  for (const id of exactPowerStateIds) check(byId.has(id), `power authority omits ${id}`);
  verifyPhysicalScreenContentAuthority(power, "power authority");
  const powerCanonical = power.canonical_inventory ?? power.canonicalInventory;
  check(Boolean(powerCanonical), "power authority omits canonical inventory lineage");
  if (powerCanonical) await verifyFileRecord(powerCanonical, "power canonical inventory lineage", canonicalInventoryRelative);
  const powerSource = power.source ?? power.authorities?.source;
  check(Boolean(powerSource), "power authority omits its editable source lineage");
  if (powerSource) await verifyFileRecord(powerSource, "power source lineage", refinedSourceRelative);
  const powerStateMapDigest = await verifyPhysicalScreenContentStateMap(power, "power authority", recordSha(powerSource), canonicalById);
  if (canonicalStateMapDigest) check(powerStateMapDigest === canonicalStateMapDigest, "power content-state map differs from canonical inventory");
  const powerPixels = new Set();
  for (const id of exactPowerStateIds) if (byId.has(id)) {
    check(String(byId.get(id).owner ?? "") === "Blender physical CRT", `power state ${id} is not owned by the physical Blender sequence`);
    const rendered = await verifyStateRender(byId.get(id), `power state ${id}`);
    const expectedPath = `renders/refined/power-on/${id}.png`;
    if (rendered) check(rendered.relative === expectedPath, `power state ${id} is not bound to its canonical render path`);
    const expectedStage = exactPowerInterfaceStages.get(id);
    check(normalizedInterfaceStage(byId.get(id)) === expectedStage, `power state ${id} has interface stage ${normalizedInterfaceStage(byId.get(id)) || "missing"}; expected ${expectedStage}`);
    const renderedState = stateRenderRecord(byId.get(id));
    if (canonicalById.has(id)) check(canonicalJson(renderedState) === canonicalJson(canonicalById.get(id)), `power state differs from canonical inventory: ${id}`);
    if (expectedStage === "none") check(renderedState.interface === false, `power state ${id} exposes interface content before the governed brand stage`);
    else check(renderedState.interface === true, `power state ${id} does not render its governed ${expectedStage} content stage`);
    if (rendered && path.extname(rendered.relative).toLowerCase() === ".png") {
      const decoded = await decodePng(rendered.absolute, `power state ${id}`);
      if (decoded) powerPixels.add(decoded.pixelSha256);
    }
  }
  const hashes = states.map(stateRenderSha).filter((value) => /^[0-9a-f]{64}$/.test(value));
  check(hashes.length === exactPowerStateIds.length && new Set(hashes).size === exactPowerStateIds.length, "power states do not bind seven distinct rendered states");
  check(powerPixels.size === exactPowerStateIds.length, "power states do not contain seven visually distinct decoded PNG states");
  for (const authority of ["source", "generator"]) {
    const record = power[authority] ?? power.authorities?.[authority];
    check(Boolean(record), `power authority omits ${authority} lineage`);
    if (record) {
      if (authority === "source") await verifyFileRecord(record, `power ${authority} lineage`, refinedSourceRelative);
      else await verifyFileRecord(record, `power ${authority} lineage`, "source/render_crt_canonical_stills.py");
    }
  }
}

let physicalPortalAuthority = {};
let physicalPortalById = new Map();
let physicalPortalStateMapDigest = "";
if (repairActive && authorityPresence.get(physicalPortalStateRelative)) {
  physicalPortalAuthority = await readJson(path.join(packageRoot, ...physicalPortalStateRelative.split("/")), "CRT physical portal-state authority");
  check(physicalPortalAuthority.schema === "quantum-hub.phase-0-4r-crt-television.portal-physical-state-authority.v1", "Phase 0.4R physical portal-state authority schema mismatch");
  check(physicalPortalAuthority.status === "PASS", "Phase 0.4R physical portal-state authority is not PASS");
  check(physicalPortalAuthority.repair_baseline === acceptedRepairParent, "physical portal-state authority does not bind the repair baseline");
  const expectedIds = exactPortalStateIds.slice(0, 6);
  const states = physicalPortalAuthority.states ?? recordsFrom(physicalPortalAuthority);
  check(numberFrom(physicalPortalAuthority, ["count", "physical_state_count"]) === 6, "physical portal-state authority does not declare six states");
  check(canonicalJson(physicalPortalAuthority.exact_ids ?? []) === canonicalJson(expectedIds), "physical portal-state exact IDs are wrong");
  check(states.length === 6 && states.map(stateId).join("|") === expectedIds.join("|"), "physical portal-state order is not exact");
  physicalPortalById = new Map(states.map((record) => [stateId(record), record]));
  const physicalCanonical = physicalPortalAuthority.canonical_inventory ?? physicalPortalAuthority.canonicalInventory;
  check(Boolean(physicalCanonical), "physical portal-state authority omits canonical inventory lineage");
  if (physicalCanonical) await verifyFileRecord(physicalCanonical, "physical portal canonical inventory lineage", canonicalInventoryRelative);
  const physicalSource = physicalPortalAuthority.source ?? physicalPortalAuthority.authorities?.source;
  const physicalGenerator = physicalPortalAuthority.generator ?? physicalPortalAuthority.authorities?.generator;
  check(Boolean(physicalSource), "physical portal-state authority omits editable source lineage");
  check(Boolean(physicalGenerator), "physical portal-state authority omits canonical renderer lineage");
  if (physicalSource) await verifyFileRecord(physicalSource, "physical portal source lineage", refinedSourceRelative);
  if (physicalGenerator) await verifyFileRecord(physicalGenerator, "physical portal renderer lineage", "source/render_crt_canonical_stills.py");
  verifyPhysicalScreenContentAuthority(physicalPortalAuthority, "physical portal authority");
  physicalPortalStateMapDigest = await verifyPhysicalScreenContentStateMap(physicalPortalAuthority, "physical portal authority", recordSha(physicalSource), canonicalById);
  if (canonicalStateMapDigest) check(physicalPortalStateMapDigest === canonicalStateMapDigest, "physical portal content-state map differs from canonical inventory");
  for (const id of expectedIds) {
    const state = physicalPortalById.get(id);
    check(Boolean(state), `physical portal-state authority omits ${id}`);
    if (!state) continue;
    check(String(state.owner ?? "") === "Blender physical CRT", `physical portal state ${id} is not Blender-owned`);
    const render = stateRenderRecord(state);
    if (canonicalById.has(id)) check(canonicalJson(render) === canonicalJson(canonicalById.get(id)), `physical portal state differs from canonical inventory: ${id}`);
    const verified = await verifyStateRender(state, `physical portal state ${id}`);
    if (verified) check(verified.relative === `renders/refined/portal/${id}.png`, `physical portal state path is not canonical: ${id}`);
  }
  const quality = physicalPortalAuthority.transition_quality ?? {};
  check(numberFrom(quality, ["blank_frame_count"]) === 0, "physical portal authority reports a blank frame");
  check(numberFrom(quality, ["aspect_snap_count"]) === 0, "physical portal authority reports an aspect snap");
  check(numberFrom(quality, ["doubled_semantic_copy_count"]) === 0, "physical portal authority reports doubled semantic copy");
  check(quality.text_free_takeover_nonblank === true, "physical portal authority does not prove a nonblank text-free takeover");
}

let portalAuthority = {};
if (repairActive && authorityPresence.get(portalStateRelative)) {
  portalAuthority = await readJson(path.join(packageRoot, ...portalStateRelative.split("/")), "CRT portal-state authority");
  const portal = portalAuthority;
  check(portal.schema === "quantum-hub.phase-0-4r-crt-television.portal-transition-state-authority.v1", "Phase 0.4R portal-state authority schema mismatch");
  check(portal.status === "PASS", "CRT portal-state authority is not PASS");
  const states = portal.states ?? recordsFrom(portal);
  check(states.length === exactPortalStateIds.length, `portal authority has ${states.length}/${exactPortalStateIds.length} states`);
  check(states.map(stateId).join("|") === exactPortalStateIds.join("|"), "portal authority state order is not exact");
  const byId = new Map(states.map((record) => [stateId(record), record]));
  for (const id of exactPortalStateIds) check(byId.has(id), `portal authority omits ${id}`);
  verifyPhysicalScreenContentAuthority(portal, "portal authority");
  const portalSource = portal.source ?? portal.authorities?.source;
  check(Boolean(portalSource), "portal authority omits editable source lineage");
  if (portalSource) await verifyFileRecord(portalSource, "portal source lineage", refinedSourceRelative);
  const portalStateMapDigest = await verifyPhysicalScreenContentStateMap(portal, "portal authority", recordSha(portalSource), canonicalById);
  if (canonicalStateMapDigest) check(portalStateMapDigest === canonicalStateMapDigest, "final portal content-state map differs from canonical inventory");
  if (physicalPortalStateMapDigest) check(portalStateMapDigest === physicalPortalStateMapDigest, "final portal content-state map differs from physical portal authority");
  const portalPixels = new Set();
  for (const id of exactPortalStateIds) if (byId.has(id)) {
    if (exactPhysicalPortalInterfaceStages.has(id)) check(String(byId.get(id).owner ?? "") === "Blender physical CRT", `portal state ${id} is not owned by the physical Blender sequence`);
    else check(String(byId.get(id).owner ?? "") === "repository browser semantic DOM", `portal state ${id} is not owned by the semantic browser surface`);
    const rendered = await verifyStateRender(byId.get(id), `portal state ${id}`);
    if (exactPhysicalPortalInterfaceStages.has(id)) {
      if (physicalPortalById.has(id)) check(canonicalJson(stateRenderRecord(byId.get(id))) === canonicalJson(stateRenderRecord(physicalPortalById.get(id))), `final portal physical render differs from frozen physical authority: ${id}`);
      const expectedPath = `renders/refined/portal/${id}.png`;
      if (rendered) check(rendered.relative === expectedPath, `portal state ${id} is not bound to its canonical physical render path`);
      const expectedStage = exactPhysicalPortalInterfaceStages.get(id);
      check(normalizedInterfaceStage(byId.get(id)) === expectedStage, `portal state ${id} has interface stage ${normalizedInterfaceStage(byId.get(id)) || "missing"}; expected ${expectedStage}`);
      const renderedState = stateRenderRecord(byId.get(id));
      if (expectedStage === "none") {
        check(renderedState.interface === false, `portal state ${id} retains physical copy in the text-free takeover frame`);
        check(String(renderedState.phosphor ?? "").toLowerCase() === "takeover", `portal state ${id} is not the governed text-free takeover state`);
      } else {
        check(renderedState.interface === true, `portal state ${id} does not render its governed ${expectedStage} content stage`);
      }
    }
    if (rendered) {
      const decoded = await decodeRaster(rendered.absolute, `portal state ${id}`);
      if (decoded) {
        const renderedState = stateRenderRecord(byId.get(id));
        check(decoded.info.width === numberFrom(renderedState, ["width"]), `portal state ${id} decoded width differs`);
        check(decoded.info.height === numberFrom(renderedState, ["height"]), `portal state ${id} decoded height differs`);
        portalPixels.add(decoded.pixelSha256);
      }
    }
  }
  const hashes = states.map(stateRenderSha).filter((value) => /^[0-9a-f]{64}$/.test(value));
  check(hashes.length === exactPortalStateIds.length && new Set(hashes).size === exactPortalStateIds.length, "portal states do not bind eight distinct physical/DOM frames");
  check(portalPixels.size === exactPortalStateIds.length, "portal states do not contain eight visually distinct decoded raster states");
  const quality = portal.transition_quality ?? portal.quality_gates ?? portal;
  check(numberFrom(quality, ["blank_frame_count", "blankBridgeCount"]) === 0, "portal authority reports a blank frame");
  check(numberFrom(quality, ["aspect_snap_count", "aspectSnapCount"]) === 0, "portal authority reports an aspect snap");
  check(numberFrom(quality, ["doubled_semantic_copy_count", "duplicate_copy_count", "doubledCopyCount"]) === 0, "portal authority reports doubled semantic copy");
  const portalGenerator = portal.generator ?? portal.authorities?.generator;
  const physicalGenerator = portal.physical_generator ?? portal.physicalGenerator ?? portal.authorities?.physical_generator;
  const physicalAuthorityRecord = portal.physical_state_authority ?? portal.physicalStateAuthority ?? portal.authorities?.physical_state_authority;
  const canonicalRecord = portal.canonical_render_authority ?? portal.canonical_inventory ?? portal.canonicalInventory ?? portal.authorities?.canonical_inventory;
  check(Boolean(portalGenerator), "portal authority omits browser finalizer lineage");
  check(Boolean(physicalGenerator), "portal authority omits physical canonical-renderer lineage");
  check(Boolean(physicalAuthorityRecord), "portal authority omits frozen physical-state authority lineage");
  check(Boolean(canonicalRecord), "portal authority omits canonical inventory lineage");
  if (portalGenerator) await verifyRepositoryFileRecord(portalGenerator, "portal browser finalizer lineage", "scripts/finalize-phase04r-browser-evidence.mjs");
  if (physicalGenerator) await verifyFileRecord(physicalGenerator, "portal physical renderer lineage", "source/render_crt_canonical_stills.py");
  if (physicalAuthorityRecord) await verifyFileRecord(physicalAuthorityRecord, "portal physical-state authority lineage", physicalPortalStateRelative);
  if (canonicalRecord) await verifyFileRecord(canonicalRecord, "portal canonical inventory lineage", canonicalInventoryRelative);
}

if (repairActive && authorityPresence.get(keepoutRelative)) {
  const keepout = await readJson(path.join(packageRoot, ...keepoutRelative.split("/")), "Phase 0.4R keepout authority");
  check(keepout.schema === "quantum-hub.phase-0-4-crt-television.scene-source-keepouts.v1", "keepout authority schema mismatch");
  check(["pass", "frozen"].includes(String(keepout.status ?? "").toLowerCase()), "keepout authority is not PASS/frozen");
  check(String(keepout.validationStatus ?? keepout.validation_status ?? "").toUpperCase() === "PASS", "keepout authority validation status is not PASS");
  check(numberFrom(keepout, ["recordCount", "record_count"]) === exactSourceRoles.size, "keepout authority record count is not exactly six");
  const declaredRoles = Array.isArray(keepout.sourceRoles) ? keepout.sourceRoles : Array.isArray(keepout.source_roles) ? keepout.source_roles : [];
  check(canonicalJson(declaredRoles) === canonicalJson([...exactSourceRoles]), "keepout authority source-role order is not exact");
  const sourceRecords = keepout.records;
  check(sourceRecords && typeof sourceRecords === "object" && !Array.isArray(sourceRecords), "keepout authority records are not the accepted object-keyed ledger");
  const sources = sourceRecords && typeof sourceRecords === "object" && !Array.isArray(sourceRecords) ? Object.entries(sourceRecords) : [];
  const roles = new Set(sources.map(([role]) => role));
  check(roles.size === exactSourceRoles.size, `keepout authority has ${roles.size}/${exactSourceRoles.size} source roles`);
  for (const role of exactSourceRoles) check(roles.has(role), `keepout authority omits ${role}`);
  const sourceHashes = new Set();
  for (const [role, record] of sources) {
    check(String(record.sourceRole ?? record.source_role ?? record.role ?? "") === role, `keepout record key/source role mismatch: ${role}`);
    check(["pass", "frozen", "accepted"].includes(String(record.status ?? "").toLowerCase()), `keepout record is not PASS/frozen/accepted: ${role}`);
    check(String(record.validationStatus ?? record.validation_status ?? "").toUpperCase() === "PASS", `keepout record validation status is not PASS: ${role}`);
    const source = record.source ?? record.file;
    check(Boolean(source), `keepout record omits its source file authority: ${role}`);
    const expectedSource = exactSourceRoleFiles.get(role);
    if (source && expectedSource) {
      await verifyFileRecord(source, `keepout source ${role}`, expectedSource.path);
      check(numberFrom(source, ["width"]) === expectedSource.width && numberFrom(source, ["height"]) === expectedSource.height, `keepout source dimensions are wrong: ${role}`);
      const sourceSha = recordSha(source);
      check(/^[0-9a-f]{64}$/.test(sourceSha) && !sourceHashes.has(sourceSha), `keepout source SHA-256 is missing or reused: ${role}`);
      sourceHashes.add(sourceSha);
    }
    const geometry = record.geometry;
    check(geometry && typeof geometry === "object" && !Array.isArray(geometry), `keepout geometry is missing: ${role}`);
    const geometryRoles = geometry && typeof geometry === "object" && !Array.isArray(geometry) ? Object.keys(geometry) : [];
    check(canonicalJson(geometryRoles.sort()) === canonicalJson([...exactKeepoutGeometryRoles].sort()), `keepout geometry roles are not exact: ${role}`);
    const hiddenTakeover = role === "source-text-free-portal-takeover";
    check(record.collisionGeometryVisible === !hiddenTakeover, `keepout collision-geometry visibility is wrong: ${role}`);
    for (const geometryRole of exactKeepoutGeometryRoles) {
      const shape = geometry?.[geometryRole] ?? {};
      const polygons = Array.isArray(shape.normalizedPolygons) ? shape.normalizedPolygons : [];
      const segmentRects = Array.isArray(shape.normalizedSegmentRectangles) ? shape.normalizedSegmentRectangles : [];
      if (hiddenTakeover) {
        check(shape.visible === false && shape.visibility === "out-of-frame/no-visible-geometry", `hidden takeover ${geometryRole} is not explicitly out of frame`);
        check(shape.pixelBounds == null && shape.paddedBoundsPx == null, `hidden takeover ${geometryRole} retains pixel bounds`);
        check(polygons.length === 0 && segmentRects.length === 0, `hidden takeover ${geometryRole} retains projected geometry`);
        check(numberFrom(shape, ["projectedPointCount", "projected_point_count"]) === 0 && numberFrom(shape, ["visiblePointCount", "visible_point_count"]) === 0, `hidden takeover ${geometryRole} retains projected points`);
      } else {
        check(shape.visible === true && shape.visibility === "visible-in-frame", `visible keepout ${role}/${geometryRole} is not explicitly visible`);
        check(numberFrom(shape.pixelBounds ?? {}, ["width"]) > 0 && numberFrom(shape.pixelBounds ?? {}, ["height"]) > 0, `visible keepout ${role}/${geometryRole} lacks positive pixel bounds`);
        check(polygons.length > 0, `visible keepout ${role}/${geometryRole} lacks normalized polygons`);
        check(numberFrom(shape, ["projectedPointCount", "projected_point_count"]) > 0 && numberFrom(shape, ["visiblePointCount", "visible_point_count"]) > 0, `visible keepout ${role}/${geometryRole} lacks projected points`);
        if (geometryRole === "spiral-cable") check(segmentRects.length > 0, `visible keepout ${role}/spiral-cable lacks segment rectangles`);
      }
    }
  }
  check(keepout.repair_baseline === acceptedRepairParent || keepout.lineage?.accepted_parent === acceptedRepairParent, "keepout authority does not bind the repair baseline");
}

function findLocalFfprobe() {
  const candidates = [];
  if (process.env.PHASE04R_FFPROBE) candidates.push(process.env.PHASE04R_FFPROBE);
  candidates.push("ffprobe");
  if (process.env.LOCALAPPDATA) {
    candidates.push(path.join(process.env.LOCALAPPDATA, "QuantumHubTools", "ffmpeg-9.0.1-essentials_build", "bin", "ffprobe.exe"));
    candidates.push(path.join(process.env.LOCALAPPDATA, "QuantumHubTools", "ffmpeg-9.0.1", "ffmpeg-9.0.1-essentials_build", "bin", "ffprobe.exe"));
  }
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["-version"], { stdio: "ignore", timeout: 10_000 });
      return candidate;
    } catch {
      // Try the next documented local candidate.
    }
  }
  return null;
}

function findLocalFfmpeg() {
  const candidates = [];
  if (process.env.PHASE04R_FFMPEG) candidates.push(process.env.PHASE04R_FFMPEG);
  candidates.push("ffmpeg");
  if (process.env.LOCALAPPDATA) {
    candidates.push(path.join(process.env.LOCALAPPDATA, "QuantumHubTools", "ffmpeg-9.0.1-essentials_build", "bin", "ffmpeg.exe"));
    candidates.push(path.join(process.env.LOCALAPPDATA, "QuantumHubTools", "ffmpeg-9.0.1", "ffmpeg-9.0.1-essentials_build", "bin", "ffmpeg.exe"));
  }
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["-version"], { stdio: "ignore", timeout: 10_000 });
      return candidate;
    } catch {
      // Try the next documented local candidate.
    }
  }
  return null;
}

function rational(value) {
  const [left, right] = String(value ?? "").split("/").map(Number);
  if (Number.isFinite(left) && Number.isFinite(right) && right !== 0) return left / right;
  return Number(value);
}

async function verifyTurntable(turntableManifest) {
  const source = turntableManifest.source ?? turntableManifest.authorities?.source;
  const renderer = turntableManifest.renderer ?? turntableManifest.authorities?.renderer;
  check(Boolean(source), "turntable manifest omits the editable Blender source authority");
  check(Boolean(renderer), "turntable manifest omits the deterministic renderer authority");
  if (source) await verifyFileRecord(source, "turntable Blender source", refinedSourceRelative);
  if (renderer) await verifyFileRecord(renderer, "turntable renderer authority", "source/render_phase0_4r_crt_turntable.py");
  const records = recordsFrom(turntableManifest);
  const record = records.find((candidate) => path.posix.basename(recordPath(candidate)) === turntableRelative) ?? turntableManifest.output ?? turntableManifest.file;
  check(Boolean(record), "turntable manifest omits the WebM record");
  const verified = record ? await verifyFileRecord(record, "CRT turntable WebM", turntableRelative) : null;
  if (!verified) return;
  check(verified.buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])), "turntable is not an EBML/WebM file");
  const probeRecord = turntableManifest.ffprobe ?? turntableManifest.probe ?? {};
  const recordedDuration = numberFrom(probeRecord, ["duration_seconds", "duration"]);
  const recordedFps = numberFrom(probeRecord, ["fps", "frame_rate"]);
  const recordedWidth = numberFrom(probeRecord, ["width"]);
  const recordedHeight = numberFrom(probeRecord, ["height"]);
  check(recordedDuration >= 5 && recordedDuration <= 7, `turntable duration is ${recordedDuration}; expected 5–7 seconds`);
  check(recordedFps > 0 && recordedFps <= 30, `turntable fps is ${recordedFps}; expected >0 and <=30`);
  check(recordedWidth >= 960 && recordedHeight >= 600, `turntable dimensions are ${recordedWidth}x${recordedHeight}; expected at least 960x600`);
  check(String(probeRecord.codec_name ?? probeRecord.codec ?? "").toLowerCase() === "vp9", "turntable codec is not VP9");
  check(numberFrom(probeRecord, ["video_stream_count"]) === 1, "turntable must have exactly one video stream");
  check(numberFrom(probeRecord, ["audio_stream_count"]) === 0, "turntable contains an audio stream");
  check(numberFrom(probeRecord, ["subtitle_stream_count"]) === 0, "turntable contains a subtitle stream");
  check(numberFrom(probeRecord, ["data_stream_count"]) === 0, "turntable contains a data stream");
  check(numberFrom(probeRecord, ["attachment_stream_count"]) === 0, "turntable contains an attachment stream");
  check(turntableManifest.no_audio === true || probeRecord.no_audio === true, "turntable manifest does not explicitly declare no audio");
  check(turntableManifest.temporary_frames_retained === false || turntableManifest.frame_sequence?.retained === false, "turntable temporary frames were retained");
  const lineage = turntableManifest.render_lineage ?? turntableManifest.lineage ?? {};
  const lineageSourceSha = String(lineage.source_sha256 ?? lineage.refined_source_sha256 ?? recordSha(lineage.source ?? {})).toLowerCase();
  const lineageRendererSha = String(lineage.renderer_sha256 ?? recordSha(lineage.renderer ?? {})).toLowerCase();
  check(lineageSourceSha === recordSha(source), "turntable render lineage does not bind the editable source SHA-256");
  check(lineageRendererSha === recordSha(renderer), "turntable render lineage does not bind the renderer SHA-256");
  check(Number.isInteger(numberFrom(lineage, ["seed"])), "turntable deterministic seed is missing");
  check(Number.isInteger(numberFrom(lineage, ["frame_count"])) && numberFrom(lineage, ["frame_count"]) > 0, "turntable deterministic frame count is missing");
  check(numberFrom(lineage, ["fps", "frame_rate"]) === recordedFps, "turntable lineage fps differs from ffprobe authority");
  check(numberFrom(lineage, ["width"]) === numberFrom(probeRecord, ["width"]) && numberFrom(lineage, ["height"]) === numberFrom(probeRecord, ["height"]), "turntable lineage dimensions differ from ffprobe authority");
  const orbit = lineage.camera_orbit ?? lineage.orbit ?? {};
  const orbitStart = numberFrom(orbit, ["start_degrees", "start_angle_degrees"]);
  const orbitEnd = numberFrom(orbit, ["end_degrees", "end_angle_degrees"]);
  check(Number.isFinite(orbitStart) && Number.isFinite(orbitEnd), "turntable deterministic camera orbit is missing");
  check(Math.abs(orbitEnd - orbitStart) >= 90 && Math.abs(orbitEnd - orbitStart) <= 360, "turntable orbit does not meaningfully travel from front three-quarter toward rear three-quarter");
  check(/front.*three.?quarter/i.test(String(orbit.start_view ?? orbit.startView ?? "")), "turntable orbit does not declare a front three-quarter start view");
  check(/rear.*three.?quarter/i.test(String(orbit.end_view ?? orbit.endView ?? "")), "turntable orbit does not declare a rear three-quarter end view");
  const encoder = turntableManifest.encoder ?? turntableManifest.encode ?? {};
  const command = Array.isArray(encoder.command) ? encoder.command.join(" ") : String(encoder.command ?? encoder.encode_command ?? "");
  check(typeof encoder.tool === "string" && encoder.tool.length > 0 && typeof encoder.version === "string" && encoder.version.length > 0, "turntable encoder tool/version authority is missing");
  check(typeof encoder.license === "string" && encoder.license.length > 0, "turntable encoder license is missing");
  check(/libvpx-vp9/i.test(command) && /(?:^|\s)-an(?:\s|$)/.test(command), "turntable encode command does not bind libvpx-vp9 with audio disabled");
  check(Number.isInteger(numberFrom(encoder, ["gop", "gop_frames", "keyframe_interval"])) && numberFrom(encoder, ["gop", "gop_frames", "keyframe_interval"]) > 0, "turntable GOP/keyframe policy is missing");
  check(typeof (encoder.pix_fmt ?? probeRecord.pix_fmt) === "string", "turntable pixel format is missing");

  const ffprobe = findLocalFfprobe();
  const ffmpeg = findLocalFfmpeg();
  if (requireLocalFfprobe || finalMode) check(Boolean(ffprobe), "local ffprobe is required for final/handoff verification but unavailable");
  if (finalMode) check(Boolean(ffmpeg), "local ffmpeg is required for final turntable decoded-motion verification but unavailable");
  if (!ffprobe) return;
  try {
    const output = execFileSync(ffprobe, [
      "-v", "error", "-print_format", "json", "-show_format", "-show_streams", "-count_frames", verified.absolute,
    ], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    const actual = JSON.parse(output);
    const streams = Array.isArray(actual.streams) ? actual.streams : [];
    const videos = streams.filter((stream) => stream.codec_type === "video");
    const audios = streams.filter((stream) => stream.codec_type === "audio");
    const subtitles = streams.filter((stream) => stream.codec_type === "subtitle");
    const dataStreams = streams.filter((stream) => stream.codec_type === "data");
    const attachments = streams.filter((stream) => stream.codec_type === "attachment");
    check(videos.length === 1 && videos[0].codec_name === "vp9", "ffprobe does not report exactly one VP9 video stream");
    check(audios.length === 0, "ffprobe reports audio in the turntable");
    check(subtitles.length === 0 && dataStreams.length === 0 && attachments.length === 0, "ffprobe reports a non-video auxiliary stream");
    const duration = Number(actual.format?.duration ?? videos[0]?.duration);
    const fps = rational(videos[0]?.avg_frame_rate);
    const decodedFrameCount = Number(videos[0]?.nb_read_frames ?? videos[0]?.nb_frames);
    check(duration >= 5 && duration <= 7, `ffprobe duration is ${duration}; expected 5–7 seconds`);
    check(fps > 0 && fps <= 30, `ffprobe fps is ${fps}; expected >0 and <=30`);
    check(Math.abs(duration - recordedDuration) <= 0.05, "turntable manifest duration differs from ffprobe");
    check(Math.abs(fps - recordedFps) <= 0.01, "turntable manifest fps differs from ffprobe");
    check(numberFrom(probeRecord, ["width"]) === Number(videos[0]?.width), "turntable manifest width differs from ffprobe");
    check(numberFrom(probeRecord, ["height"]) === Number(videos[0]?.height), "turntable manifest height differs from ffprobe");
    check(Number.isInteger(decodedFrameCount) && decodedFrameCount === numberFrom(lineage, ["frame_count"]), "turntable decoded frame count differs from deterministic lineage");
    if (ffmpeg) {
      const width = Number(videos[0]?.width);
      const height = Number(videos[0]?.height);
      const sampleTimes = [0.5, duration / 2, duration - 0.5];
      const sampleBuffers = sampleTimes.map((time) => execFileSync(ffmpeg, [
        "-v", "error", "-ss", time.toFixed(6), "-i", verified.absolute,
        "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
      ], { encoding: null, maxBuffer: Math.max(8 * 1024 * 1024, width * height * 4), timeout: 30_000 }));
      for (const buffer of sampleBuffers) check(buffer.length === width * height * 3, `turntable decoded sample has ${buffer.length} bytes; expected ${width * height * 3}`);
      const sampleHashes = sampleBuffers.map(sha256Buffer);
      check(new Set(sampleHashes).size === sampleBuffers.length, "turntable first/mid/last decoded samples are not visually distinct");
      const differences = [];
      for (let index = 1; index < sampleBuffers.length; index += 1) {
        const before = sampleBuffers[index - 1];
        const after = sampleBuffers[index];
        let absoluteDelta = 0;
        let changedPixels = 0;
        for (let offset = 0; offset < before.length; offset += 3) {
          const delta = Math.abs(before[offset] - after[offset]) + Math.abs(before[offset + 1] - after[offset + 1]) + Math.abs(before[offset + 2] - after[offset + 2]);
          absoluteDelta += delta;
          if (delta > 12) changedPixels += 1;
        }
        const meanAbsoluteRgbDelta = absoluteDelta / before.length;
        const changedPixelRatio = changedPixels / (width * height);
        check(meanAbsoluteRgbDelta >= 2, `turntable adjacent decoded samples have only ${meanAbsoluteRgbDelta.toFixed(4)} mean RGB delta`);
        check(changedPixelRatio >= 0.1, `turntable adjacent decoded samples change only ${(changedPixelRatio * 100).toFixed(3)}% of pixels`);
        differences.push({ from: index - 1, to: index, mean_absolute_rgb_delta: meanAbsoluteRgbDelta, changed_pixel_ratio: changedPixelRatio });
      }
      const proof = turntableManifest.decoded_sample_proof ?? turntableManifest.visual_motion_proof ?? {};
      const proofSamples = Array.isArray(proof.samples) ? proof.samples : [];
      const proofDifferences = Array.isArray(proof.adjacent_differences) ? proof.adjacent_differences : [];
      check(proof.status === "PASS" && proof.all_distinct === true && numberFrom(proof, ["sample_count"]) === 3, "turntable manifest lacks PASS three-sample decoded-motion proof");
      check(proofSamples.length === 3 && proofDifferences.length === 2, "turntable decoded-motion manifest proof has the wrong sample/difference count");
      for (let index = 0; index < 3; index += 1) {
        const sample = proofSamples[index] ?? {};
        check(Math.abs(numberFrom(sample, ["timestamp_seconds", "time_seconds"]) - sampleTimes[index]) <= 0.01, `turntable sample timestamp differs at index ${index}`);
        check(numberFrom(sample, ["width"]) === width && numberFrom(sample, ["height"]) === height, `turntable sample dimensions differ at index ${index}`);
        check(String(sample.decoded_rgb_sha256 ?? sample.pixel_sha256 ?? "").toLowerCase() === sampleHashes[index], `turntable decoded sample SHA-256 differs at index ${index}`);
      }
      for (let index = 0; index < differences.length; index += 1) {
        const declared = proofDifferences[index] ?? {};
        check(Math.abs(numberFrom(declared, ["mean_absolute_rgb_delta"]) - differences[index].mean_absolute_rgb_delta) <= 1e-6, `turntable declared mean RGB delta differs at transition ${index}`);
        check(Math.abs(numberFrom(declared, ["changed_pixel_ratio"]) - differences[index].changed_pixel_ratio) <= 1e-9, `turntable declared changed-pixel ratio differs at transition ${index}`);
      }
    }
  } catch (error) {
    errors.push(`ffprobe validation failed: ${error.message}`);
  }
}

if (authorityPresence.get(turntableManifestRelative)) {
  const turntable = await readJson(path.join(packageRoot, ...turntableManifestRelative.split("/")), "turntable manifest");
  check(turntable.schema === "quantum-hub.phase-0-4r-crt-television.turntable.v1", "turntable manifest schema mismatch");
  check(turntable.status === "PASS", "turntable manifest is not PASS");
  await verifyTurntable(turntable);
}

// Browser-owned repaired evidence is additive and must be complete in final mode.
const browserPlanRelative = "prototypes/phase-0-4r-crt-portal-qa/capture-plan.json";
const browserPlanSnapshotRelative = `${repairEvidenceRelative}/capture-plan-authority.json`;
const browserCheckpointRelative = `${repairEvidenceRelative}/capture-checkpoint.json`;
const browserMatrixRelative = `${repairEvidenceRelative}/browser-matrix-report.json`;
const browserEvidenceRelative = `${repairEvidenceRelative}/browser-evidence-manifest.json`;
const browserCompositionInputsRelative = `${repairEvidenceRelative}/browser-review-composition-inputs.json`;
const browserCompositionRelative = `${packageRelative}/manifests/phase-0-4r-browser-review-composition-manifest.json`;
const browserComposerPackageRelative = "source/compose_crt_phase0_4r_browser_review_sheets.py";
const portalBrowserStateRelative = `${repairEvidenceRelative}/portal-states/portal-browser-state-authority.json`;
const portalState8ReportRelative = `${repairEvidenceRelative}/portal-states/portal-08-full-semantic-surface.json`;
const portalBrowserStateSchema = "quantum-hub.phase-0-4r-crt-television.portal-browser-state-authority.v1";
const portalState8ReportSchema = "quantum-hub.phase-0-4r-crt-television.portal-state-browser-capture.v1";
const portalBrowserCaseId = "portal-actual--desktop-1440x900";
const textFreeSourceRole = "source-text-free-portal-takeover";

function expandBrowserPlan(plan) {
  const viewports = Array.isArray(plan?.viewports) ? plan.viewports : [];
  const viewportById = new Map(viewports.map((viewport) => [String(viewport?.id ?? ""), viewport]));
  check(viewports.length === 9 && viewportById.size === 9, "Phase 0.4R ready-plan snapshot does not bind nine unique viewports");
  const allViewportIds = [...viewportById.keys()];
  const templates = Array.isArray(plan?.caseTemplates) ? plan.caseTemplates : [];
  check(templates.length === 10, "Phase 0.4R ready-plan snapshot does not bind ten case templates");
  const expanded = [];
  for (const template of templates) {
    const prefix = String(template?.idPrefix ?? "");
    const viewportIds = template?.viewportIds === "all" ? allViewportIds : (Array.isArray(template?.viewportIds) ? template.viewportIds : []);
    const captureViewportIds = new Set(template?.captureViewportIds === "all" ? allViewportIds : (Array.isArray(template?.captureViewportIds) ? template.captureViewportIds : []));
    check(prefix.length > 0 && typeof template?.query === "string" && template.query.length > 0, "Phase 0.4R case template omits its ID prefix or query");
    for (const viewportId of viewportIds) {
      const viewport = viewportById.get(String(viewportId));
      check(Boolean(viewport), `Phase 0.4R case template ${prefix} uses unknown viewport ${viewportId}`);
      if (!viewport) continue;
      expanded.push({
        id: `${prefix}--${viewportId}`,
        idPrefix: prefix,
        viewportId: String(viewportId),
        viewport: {
          id: String(viewport.id),
          width: Number(viewport.width),
          height: Number(viewport.height),
          captureScale: Number(viewport.captureScale),
        },
        query: String(template.query),
        focusSelector: template.focusSelector ?? null,
        captureRequired: captureViewportIds.has(viewportId),
      });
    }
  }
  check(expanded.length === 46 && new Set(expanded.map((record) => record.id)).size === 46, `Phase 0.4R ready-plan snapshot expands to ${expanded.length}/46 unique cases`);
  check(expanded.filter((record) => record.captureRequired).length === 36, "Phase 0.4R ready-plan snapshot does not select exactly 36 captures");
  return expanded;
}

function normalizedRepositoryRecord(record) {
  return {
    path: repositoryRecordPath(record ?? {}),
    bytes: numberFrom(record ?? {}, ["bytes", "size"]),
    sha256: recordSha(record ?? {}),
  };
}

function browserCaseReportRelative(snapshot, id) {
  const directory = normalize(snapshot?.capture?.reportDirectory ?? "").replace(/\/$/, "");
  return `${directory}/${id}.json`;
}

function browserRawCaptureRelative(snapshot, id) {
  const directory = normalize(snapshot?.capture?.rawDirectory ?? "").replace(/\/$/, "");
  return `${directory}/${id}.jpg`;
}

function browserNormalizedCaptureRelative(snapshot, id) {
  const directory = normalize(snapshot?.capture?.normalizedDirectory ?? "").replace(/\/$/, "");
  return `${directory}/${id}.png`;
}

async function verifyBrowserPngRecord(record, label, expectedPath, expectedWidth, expectedHeight) {
  const verified = await verifyRepositoryFileRecord(record, label, expectedPath);
  if (!verified) return null;
  const dimensions = pngDimensions(verified.buffer);
  check(Boolean(dimensions), `${label} is not a PNG`);
  if (!dimensions) return null;
  check(!pngContainsChunk(verified.buffer, "acTL"), `${label} is an animated PNG`);
  check(dimensions.width === expectedWidth && dimensions.height === expectedHeight, `${label} dimensions are ${dimensions.width}x${dimensions.height}; expected ${expectedWidth}x${expectedHeight}`);
  check(numberFrom(record, ["width"]) === expectedWidth && numberFrom(record, ["height"]) === expectedHeight, `${label} recorded dimensions differ`);
  const decoded = await decodePng(verified.absolute, label);
  if (decoded) check(decoded.info.width === expectedWidth && decoded.info.height === expectedHeight, `${label} decoded dimensions differ`);
  return { ...verified, dimensions, decoded };
}

async function verifyBrowserJpegRecord(record, label, expectedPath) {
  const verified = await verifyRepositoryFileRecord(record, label, expectedPath);
  if (!verified) return null;
  check(verified.buffer.length >= 4 && verified.buffer[0] === 0xff && verified.buffer[1] === 0xd8 && verified.buffer.at(-2) === 0xff && verified.buffer.at(-1) === 0xd9, `${label} is not a complete JPEG`);
  if (sharpDecoder) {
    try {
      const metadata = await sharpDecoder(verified.absolute, { limitInputPixels: false }).metadata();
      check(metadata.format === "jpeg" && Number(metadata.width) > 0 && Number(metadata.height) > 0, `${label} cannot be decoded as JPEG`);
    } catch (error) {
      errors.push(`${label} cannot be decoded: ${error.message}`);
    }
  }
  return verified;
}

if (finalMode) {
  for (const [relative, label] of [
    [browserPlanRelative, "Phase 0.4R browser plan"],
    [browserPlanSnapshotRelative, "Phase 0.4R ready-plan snapshot"],
    [browserCheckpointRelative, "Phase 0.4R browser checkpoint"],
    [browserMatrixRelative, "Phase 0.4R browser matrix"],
    [browserEvidenceRelative, "Phase 0.4R browser evidence"],
    [browserCompositionInputsRelative, "Phase 0.4R browser composition inputs"],
    [browserCompositionRelative, "Phase 0.4R browser review composition"],
    [portalBrowserStateRelative, "Phase 0.4R two-state browser portal authority"],
    [portalState8ReportRelative, "Phase 0.4R portal state-8 capture report"],
  ]) check(await exists(path.join(repositoryRoot, ...relative.split("/"))), `missing ${label}: ${relative}`);
}
let browserPlan = {};
if (await exists(path.join(repositoryRoot, ...browserPlanRelative.split("/")))) {
  browserPlan = await readJson(path.join(repositoryRoot, ...browserPlanRelative.split("/")), "Phase 0.4R browser plan");
  const plan = browserPlan;
  check(plan.schema === "quantum-hub.phase-0-4r-crt-television.typography-capture-plan.v1", "Phase 0.4R browser plan schema mismatch");
  if (finalMode) check(plan.status === "PASS", "Phase 0.4R browser plan is not final PASS");
  check((plan.acceptedBaseline?.repositoryHead ?? plan.accepted_baseline?.head) === acceptedRepairParent, "Phase 0.4R browser plan does not bind the accepted repair parent");
  check(numberFrom(plan, ["expectedCaseCount", "expected_case_count"]) === 46, "Phase 0.4R browser plan does not bind 46 cases");
  check(numberFrom(plan, ["expectedCaptureCount", "expected_capture_count"]) === 36, "Phase 0.4R browser plan does not bind 36 captures");
  if (finalMode) check(String(plan.sceneFreeze?.status ?? plan.sceneFreeze ?? "").toLowerCase() === "frozen", "Phase 0.4R browser plan scene freeze is not frozen");
  if (finalMode) {
    const snapshot = plan.captureAuthoritySnapshot ?? plan.capture_authority_snapshot;
    const completion = plan.completionAuthority ?? plan.completion_authority;
    check(Boolean(snapshot), "completed browser plan omits the acyclic ready-plan snapshot pointer");
    check(Boolean(completion), "completed browser plan omits the browser-evidence completion pointer");
    if (snapshot) await verifyRepositoryFileRecord(snapshot, "completed browser-plan snapshot", browserPlanSnapshotRelative);
    if (completion) await verifyRepositoryFileRecord(completion, "completed browser-plan evidence", browserEvidenceRelative);
  }
}
let browserPlanSnapshot = {};
let browserPlanSnapshotSources = [];
let browserPlanSnapshotKeepout = {};
let browserExpandedCases = [];
let browserExpandedCasesById = new Map();
if (await exists(path.join(repositoryRoot, ...browserPlanSnapshotRelative.split("/")))) {
  browserPlanSnapshot = await readJson(path.join(repositoryRoot, ...browserPlanSnapshotRelative.split("/")), "Phase 0.4R ready-plan snapshot");
  const snapshot = browserPlanSnapshot;
  check(snapshot.schema === "quantum-hub.phase-0-4r-crt-television.typography-capture-plan.v1", "Phase 0.4R ready-plan snapshot schema mismatch");
  check((snapshot.acceptedBaseline?.repositoryHead ?? snapshot.accepted_baseline?.head) === acceptedRepairParent, "Phase 0.4R ready-plan snapshot does not bind the accepted repair parent");
  check(numberFrom(snapshot, ["expectedCaseCount", "expected_case_count"]) === 46, "Phase 0.4R ready-plan snapshot does not bind 46 cases");
  check(numberFrom(snapshot, ["expectedCaptureCount", "expected_capture_count"]) === 36, "Phase 0.4R ready-plan snapshot does not bind 36 captures");
  check(String(snapshot.sceneFreeze?.status ?? snapshot.sceneFreeze ?? "").toLowerCase() === "frozen", "Phase 0.4R ready-plan snapshot scene freeze is not frozen");
  check(snapshot.sceneFreeze?.captureAllowed === true, "Phase 0.4R ready-plan snapshot does not explicitly release capture");
  check(String(snapshot.status ?? "").toLowerCase() === "ready-for-capture", "Phase 0.4R ready-plan snapshot is not the exact pre-completion ready-for-capture authority");
  check(String(snapshot.sceneFreeze?.matrixStatus ?? snapshot.sceneFreeze?.matrix_status ?? "").toLowerCase() === "ready-for-capture", "Phase 0.4R ready-plan snapshot matrix status is not ready-for-capture");
  check(normalize(snapshot.capture?.rawDirectory ?? "") === `${repairEvidenceRelative}/captures/raw`, "Phase 0.4R ready-plan raw-capture directory differs");
  check(normalize(snapshot.capture?.normalizedDirectory ?? "") === `${repairEvidenceRelative}/captures/normalized`, "Phase 0.4R ready-plan normalized-capture directory differs");
  check(normalize(snapshot.capture?.reportDirectory ?? "") === `${repairEvidenceRelative}/reports`, "Phase 0.4R ready-plan report directory differs");
  check(snapshot.capture?.stabilization?.successiveFullPageJpegsPerVisualCase === 11, "Phase 0.4R ready-plan does not require eleven modal-candidate shots");
  check(snapshot.capture?.stabilization?.minimumWinnerVotes === 7, "Phase 0.4R ready-plan does not require a 7/11 modal winner");
  browserExpandedCases = expandBrowserPlan(snapshot);
  browserExpandedCasesById = new Map(browserExpandedCases.map((record) => [record.id, record]));
  for (const field of [
    "captureAuthoritySnapshot", "capture_authority_snapshot", "completionAuthority", "completion_authority",
    "finalMatrix", "final_matrix", "browserReviewCompositionAuthority", "browser_review_composition_authority",
    "creativeReviewCompositionAuthority", "creative_review_composition_authority", "portalTransitionStateAuthority", "portal_transition_state_authority",
  ]) check(snapshot[field] == null, `Phase 0.4R ready-plan snapshot contains a completion-era forward pointer: ${field}`);
  browserPlanSnapshotSources = Array.isArray(snapshot.sceneFreeze?.sources) ? snapshot.sceneFreeze.sources : [];
  check(browserPlanSnapshotSources.length === exactSourceRoles.size, "Phase 0.4R ready-plan snapshot does not bind six source records");
  check(canonicalJson(browserPlanSnapshotSources.map((record) => record.id)) === canonicalJson([...exactSourceRoles]), "Phase 0.4R ready-plan snapshot source order is not exact");
  for (let index = 0; index < browserPlanSnapshotSources.length; index += 1) {
    const source = browserPlanSnapshotSources[index];
    const role = [...exactSourceRoles][index];
    const expected = exactSourceRoleFiles.get(role);
    check(source.id === role && source.role === role, `ready-plan snapshot source role is wrong: ${role}`);
    check(["frozen", "accepted"].includes(String(source.status ?? "").toLowerCase()), `ready-plan snapshot source is not frozen/accepted: ${role}`);
    if (expected) {
      check(repositoryRecordPath(source) === `${packageRelative}/${expected.path}`, `ready-plan snapshot source path is wrong: ${role}`);
      check(numberFrom(source, ["width"]) === expected.width && numberFrom(source, ["height"]) === expected.height, `ready-plan snapshot source dimensions are wrong: ${role}`);
      await verifyRepositoryFileRecord(source, `ready-plan snapshot source ${role}`, `${packageRelative}/${expected.path}`);
    }
  }
  browserPlanSnapshotKeepout = snapshot.sceneFreeze?.keepoutAuthority ?? snapshot.sceneFreeze?.keepout_authority ?? {};
  check(Object.keys(browserPlanSnapshotKeepout).length > 0, "Phase 0.4R ready-plan snapshot omits keepout authority");
  if (Object.keys(browserPlanSnapshotKeepout).length > 0) await verifyRepositoryFileRecord(browserPlanSnapshotKeepout, "ready-plan snapshot keepout authority", `${packageRelative}/${keepoutRelative}`);
  if (Object.keys(browserPlan).length > 0) {
    check(canonicalJson(browserPlan.sceneFreeze?.sources ?? []) === canonicalJson(browserPlanSnapshotSources), "completed browser plan scene sources differ from the ready-plan snapshot");
    check(canonicalJson(browserPlan.sceneFreeze?.keepoutAuthority ?? {}) === canonicalJson(browserPlanSnapshotKeepout), "completed browser plan keepout authority differs from the ready-plan snapshot");
  }
}
let browserMatrix = {};
let browserMatrixCases = new Map();
let browserSemanticStateRecords = [];
if (await exists(path.join(repositoryRoot, ...browserMatrixRelative.split("/")))) {
  browserMatrix = await readJson(path.join(repositoryRoot, ...browserMatrixRelative.split("/")), "Phase 0.4R browser matrix");
  const matrix = browserMatrix;
  check(matrix.schema === "quantum-hub.phase-0-4r-crt-television.typography-collision-matrix.v1", "Phase 0.4R browser matrix schema mismatch");
  const matrixCases = Array.isArray(matrix.cases) ? matrix.cases : [];
  browserMatrixCases = new Map(matrixCases.map((record) => [String(record.id ?? ""), record]));
  const normalizedCaptureCount = matrixCases.filter((record) => record.capture?.path && /^[0-9a-f]{64}$/i.test(record.capture?.sha256 ?? "")).length;
  const allCasesPass = matrixCases.length === 46 && browserMatrixCases.size === 46 && matrixCases.every((record) => record.runner?.pass === true && record.report?.pass === true);
  check(allCasesPass, "Phase 0.4R browser matrix does not derive PASS from 46 unique passing cases");
  check(normalizedCaptureCount === 36, `Phase 0.4R matrix has ${normalizedCaptureCount}/36 normalized captures`);
  check(browserExpandedCases.length === 46, "Phase 0.4R matrix cannot be verified without the exact expanded ready-plan topology");
  check(canonicalJson(matrixCases.map((record) => record.id)) === canonicalJson(browserExpandedCases.map((record) => record.id)), "Phase 0.4R matrix case order/IDs differ from the frozen ready-plan expansion");
  for (const expected of browserExpandedCases) {
    const actual = browserMatrixCases.get(expected.id) ?? {};
    check(actual.viewportId === expected.viewportId, `browser matrix viewport ID differs: ${expected.id}`);
    check(actual.query === expected.query, `browser matrix query differs: ${expected.id}`);
    check((actual.focusSelector ?? null) === expected.focusSelector, `browser matrix focus selector differs: ${expected.id}`);
    check(actual.runner?.requestedViewport?.width === expected.viewport.width && actual.runner?.requestedViewport?.height === expected.viewport.height, `browser matrix requested viewport differs: ${expected.id}`);
    check(Math.abs(Number(actual.runner?.captureScale) - expected.viewport.captureScale) <= 1e-6, `browser matrix capture scale differs: ${expected.id}`);
    check(actual.report?.viewport?.width === expected.viewport.width && actual.report?.viewport?.height === expected.viewport.height, `browser matrix child viewport differs: ${expected.id}`);
    check(Boolean(actual.capture) === expected.captureRequired, `browser matrix capture-required topology differs: ${expected.id}`);
    if (!expected.captureRequired || !actual.capture) continue;
    const normalizedPath = browserNormalizedCaptureRelative(browserPlanSnapshot, expected.id);
    const rawPath = browserRawCaptureRelative(browserPlanSnapshot, expected.id);
    await verifyBrowserPngRecord(actual.capture, `normalized browser capture ${expected.id}`, normalizedPath, expected.viewport.width, expected.viewport.height);
    await verifyBrowserJpegRecord(actual.capture.raw, `modal raw browser winner ${expected.id}`, rawPath);
    check(actual.capture.modal?.pass === true && numberFrom(actual.capture.modal?.winner ?? {}, ["votes"]) >= 7, `browser matrix capture lacks a unique >=7/11 modal winner: ${expected.id}`);
    check(recordSha(actual.capture.raw) === String(actual.capture.normalization?.sourceRawSha256 ?? "").toLowerCase(), `normalized browser source-raw SHA-256 differs: ${expected.id}`);
  }
  const matrixPlan = matrix.capturePlanAuthority ?? matrix.capture_plan_authority ?? matrix.plan;
  check(Boolean(matrixPlan), "Phase 0.4R matrix omits the frozen ready-plan snapshot authority");
  if (matrixPlan) {
    check(repositoryRecordPath(matrixPlan) === browserPlanRelative, "Phase 0.4R matrix plan path is not the additive capture plan");
    const snapshotAbsolute = path.join(repositoryRoot, ...browserPlanSnapshotRelative.split("/"));
    if (await exists(snapshotAbsolute)) {
      const snapshotBuffer = await fs.readFile(snapshotAbsolute);
      check(numberFrom(matrixPlan, ["bytes", "size"]) === snapshotBuffer.length, "Phase 0.4R matrix plan byte count differs from the ready-plan snapshot");
      check(recordSha(matrixPlan) === sha256Buffer(snapshotBuffer), "Phase 0.4R matrix plan SHA-256 differs from the ready-plan snapshot");
    }
  }
  const normalizedBrowserSourceRecord = (record) => ({
    id: record?.id ?? null,
    role: record?.role ?? null,
    path: repositoryRecordPath(record ?? {}),
    bytes: numberFrom(record ?? {}, ["bytes", "size"]),
    sha256: recordSha(record ?? {}),
    width: numberFrom(record ?? {}, ["width"]),
    height: numberFrom(record ?? {}, ["height"]),
  });
  const normalizedBrowserAuthorityRecord = (record) => ({
    path: repositoryRecordPath(record ?? {}),
    bytes: numberFrom(record ?? {}, ["bytes", "size"]),
    sha256: recordSha(record ?? {}),
    schema: record?.schema ?? null,
  });
  check(
    canonicalJson((matrix.sceneSources ?? matrix.scene_sources ?? []).map(normalizedBrowserSourceRecord)) ===
      canonicalJson(browserPlanSnapshotSources.map(normalizedBrowserSourceRecord)),
    "Phase 0.4R matrix scene sources differ from the frozen ready-plan snapshot",
  );
  check(
    canonicalJson(normalizedBrowserAuthorityRecord(matrix.keepout ?? matrix.keepoutAuthority ?? {})) ===
      canonicalJson(normalizedBrowserAuthorityRecord(browserPlanSnapshotKeepout)),
    "Phase 0.4R matrix keepout authority differs from the frozen ready-plan snapshot",
  );
  const portalCases = matrixCases.filter((record) => record.report?.portal?.applicable === true);
  const blankBridgeCases = portalCases.filter((record) =>
    record.report?.portal?.takeover?.pass !== true ||
    record.report?.portal?.takeover?.noPermanentLetterbox !== true ||
    record.report?.accessibility?.semanticHeadingCount !== 1);
  const aspectSnapCases = portalCases.filter((record) =>
    record.report?.portal?.physicalScreen?.pass !== true ||
    record.report?.portal?.takeover?.noAbruptAspectSnap !== true ||
    record.report?.portal?.takeover?.semanticDomUndistorted !== true);
  const doubledCopyCases = portalCases.filter((record) =>
    record.report?.assets?.doubledCopyPass !== true ||
    record.report?.portal?.takeover?.physicalTextAbsentBeforeDomCopy !== true);
  check(portalCases.length > 0, "Phase 0.4R matrix contains no applicable portal cases");
  check(blankBridgeCases.length === 0, `portal matrix reports blank/letterboxed/heading-invalid cases: ${blankBridgeCases.map((record) => record.id).join(", ")}`);
  check(aspectSnapCases.length === 0, `portal matrix reports aspect-snap/distortion cases: ${aspectSnapCases.map((record) => record.id).join(", ")}`);
  check(doubledCopyCases.length === 0, `portal matrix reports doubled-copy cases: ${doubledCopyCases.map((record) => record.id).join(", ")}`);
}

if (await exists(path.join(repositoryRoot, ...browserMatrixRelative.split("/")))) {
  const checkpointAbsolute = path.join(repositoryRoot, ...browserCheckpointRelative.split("/"));
  check(await exists(checkpointAbsolute), `missing Phase 0.4R normalized capture checkpoint: ${browserCheckpointRelative}`);
  if (await exists(checkpointAbsolute)) {
    const checkpoint = await readJson(checkpointAbsolute, "Phase 0.4R normalized capture checkpoint");
    check(checkpoint.schema === "quantum-hub.phase-0-4r-crt-television.capture-checkpoint.v1", "Phase 0.4R checkpoint schema mismatch");
    check(checkpoint.status === "complete-local-authority-normalized", "Phase 0.4R checkpoint is not complete-local-authority-normalized");
    check(checkpoint.authorityFingerprint === browserMatrix.authorityFingerprint && typeof checkpoint.authorityFingerprint === "string" && checkpoint.authorityFingerprint.length === 64, "Phase 0.4R checkpoint authority fingerprint differs from the matrix");
    check(numberFrom(checkpoint, ["completedAuthorityCases"]) === 46, "Phase 0.4R checkpoint does not bind 46 completed authority cases");
    check(numberFrom(checkpoint.matrix ?? {}, ["cases"]) === 46 && numberFrom(checkpoint.matrix ?? {}, ["captures"]) === 36 && checkpoint.matrix?.normalized === true, "Phase 0.4R checkpoint does not bind a normalized 46/36 matrix");
    await verifyRepositoryFileRecord(checkpoint.matrix, "Phase 0.4R checkpoint matrix", browserMatrixRelative);
    const checkpointCases = checkpoint.cases && typeof checkpoint.cases === "object" && !Array.isArray(checkpoint.cases) ? checkpoint.cases : {};
    check(canonicalJson(Object.keys(checkpointCases).sort()) === canonicalJson(browserExpandedCases.map((record) => record.id).sort()), "Phase 0.4R checkpoint case roster differs from the exact 46-case plan expansion");
    for (const expected of browserExpandedCases) {
      const entry = checkpointCases[expected.id] ?? {};
      const matrixCase = browserMatrixCases.get(expected.id) ?? {};
      check(entry.id === expected.id && entry.status === "complete", `Phase 0.4R checkpoint entry is not complete: ${expected.id}`);
      check(entry.authorityFingerprint === checkpoint.authorityFingerprint, `Phase 0.4R checkpoint entry fingerprint differs: ${expected.id}`);
      const expectedReportPath = browserCaseReportRelative(browserPlanSnapshot, expected.id);
      const verifiedReport = await verifyRepositoryFileRecord(entry.report, `Phase 0.4R case report ${expected.id}`, expectedReportPath);
      if (verifiedReport) {
        const report = await readJson(verifiedReport.absolute, `Phase 0.4R case report ${expected.id}`);
        check(report.schema === "quantum-hub.phase-0-4r-crt-television.local-browser-case.v1", `browser case-report schema differs: ${expected.id}`);
        check(report.id === expected.id && report.viewportId === expected.viewportId, `browser case-report identity differs: ${expected.id}`);
        check(report.query === expected.query && (report.focusSelector ?? null) === expected.focusSelector, `browser case-report query/focus differs: ${expected.id}`);
        check(report.captureRequired === expected.captureRequired, `browser case-report capture-required flag differs: ${expected.id}`);
        check(report.authorityFingerprint === checkpoint.authorityFingerprint, `browser case-report authority fingerprint differs: ${expected.id}`);
        check(canonicalJson(report.runner ?? {}) === canonicalJson(matrixCase.runner ?? {}), `browser case-report runner evidence differs from matrix: ${expected.id}`);
        check(canonicalJson(report.report ?? {}) === canonicalJson(matrixCase.report ?? {}), `browser case-report collision/accessibility evidence differs from matrix: ${expected.id}`);
        if (expected.captureRequired) {
          const expectedRawPath = browserRawCaptureRelative(browserPlanSnapshot, expected.id);
          await verifyBrowserJpegRecord(entry.raw, `checkpoint modal raw winner ${expected.id}`, expectedRawPath);
          check(canonicalJson(normalizedRepositoryRecord(entry.raw)) === canonicalJson(normalizedRepositoryRecord(report.capture?.raw)), `checkpoint/report raw lineage differs: ${expected.id}`);
          check(canonicalJson(normalizedRepositoryRecord(entry.raw)) === canonicalJson(normalizedRepositoryRecord(matrixCase.capture?.raw)), `checkpoint/matrix raw lineage differs: ${expected.id}`);
          check(canonicalJson(report.capture?.modal ?? {}) === canonicalJson(matrixCase.capture?.modal ?? {}), `case-report/matrix modal proof differs: ${expected.id}`);
          check(report.capture?.modal?.pass === true && numberFrom(report.capture?.modal?.winner ?? {}, ["votes"]) >= 7, `browser case-report lacks a passing >=7/11 modal winner: ${expected.id}`);
        } else {
          check(entry.raw == null && report.capture == null && matrixCase.capture == null, `report-only browser case retains unexpected raster evidence: ${expected.id}`);
        }
      }
    }
  }
}

if (await exists(path.join(repositoryRoot, ...portalBrowserStateRelative.split("/")))) {
  const browserStateAuthority = await readJson(path.join(repositoryRoot, ...portalBrowserStateRelative.split("/")), "Phase 0.4R browser portal-state authority");
  check(browserStateAuthority.schema === portalBrowserStateSchema, "Phase 0.4R browser portal-state schema mismatch");
  check(browserStateAuthority.status === "PASS", "Phase 0.4R browser portal-state authority is not PASS");
  check(numberFrom(browserStateAuthority, ["stateCount", "state_count"]) === 2, "Phase 0.4R browser portal authority does not bind two states");
  check(canonicalJson(browserStateAuthority.exactStateIds ?? browserStateAuthority.exact_state_ids ?? []) === canonicalJson(exactPortalStateIds.slice(6)), "Phase 0.4R browser portal exact state IDs/order differ");
  check(browserStateAuthority.distinctCaptureHashes?.pass === true, "Phase 0.4R browser portal authority does not prove distinct state hashes");
  const matrixRecord = browserStateAuthority.matrix;
  check(Boolean(matrixRecord), "Phase 0.4R browser portal authority omits matrix lineage");
  if (matrixRecord) await verifyRepositoryFileRecord(matrixRecord, "browser portal-state matrix", browserMatrixRelative);
  const textFreeSnapshotSource = browserPlanSnapshotSources.find((record) => record.id === textFreeSourceRole);
  const browserStateSource = browserStateAuthority.source;
  check(Boolean(browserStateSource), "Phase 0.4R browser portal authority omits text-free source lineage");
  if (browserStateSource) await verifyRepositoryFileRecord(browserStateSource, "browser portal-state text-free source", `${packageRelative}/${exactSourceRoleFiles.get(textFreeSourceRole).path}`);
  if (browserStateSource && textFreeSnapshotSource) {
    check(repositoryRecordPath(browserStateSource) === repositoryRecordPath(textFreeSnapshotSource), "browser portal text-free source path differs from ready snapshot");
    check(recordSha(browserStateSource) === recordSha(textFreeSnapshotSource), "browser portal text-free source SHA-256 differs from ready snapshot");
    check(numberFrom(browserStateSource, ["bytes"]) === numberFrom(textFreeSnapshotSource, ["bytes"]), "browser portal text-free source bytes differ from ready snapshot");
  }
  const states = Array.isArray(browserStateAuthority.states) ? browserStateAuthority.states : [];
  check(states.length === 2 && canonicalJson(states.map((record) => record.id)) === canonicalJson(exactPortalStateIds.slice(6)), "browser portal authority lacks exact ordered states 7–8");
  const state7Case = browserMatrixCases.get(portalBrowserCaseId);
  check(Boolean(state7Case), `browser matrix omits governed portal state-7 case ${portalBrowserCaseId}`);
  check(state7Case?.report?.assets?.sceneId === textFreeSourceRole, "portal state 7 does not use the frozen text-free source role");
  check(state7Case?.report?.assets?.sceneSha256 === recordSha(textFreeSnapshotSource), "portal state 7 scene SHA-256 differs from the frozen text-free source");
  const state7Capture = states[0]?.capture;
  check(states[0]?.order === 7 && states[0]?.owner === "repository browser semantic DOM" && states[0]?.caseId === portalBrowserCaseId, "browser portal state 7 metadata differs from the governed matrix case");
  if (state7Capture && state7Case?.capture) {
    check(repositoryRecordPath(state7Capture) === repositoryRecordPath(state7Case.capture), "browser portal state 7 capture path differs from matrix");
    check(recordSha(state7Capture) === recordSha(state7Case.capture), "browser portal state 7 capture SHA-256 differs from matrix");
    check(numberFrom(state7Capture, ["bytes"]) === numberFrom(state7Case.capture, ["bytes"]), "browser portal state 7 capture bytes differ from matrix");
    await verifyRepositoryFileRecord(state7Capture, "browser portal state 7 capture", repositoryRecordPath(state7Case.capture));
  } else {
    check(false, "browser portal state 7 capture is missing");
  }
  let state8Report = {};
  if (await exists(path.join(repositoryRoot, ...portalState8ReportRelative.split("/")))) {
    state8Report = await readJson(path.join(repositoryRoot, ...portalState8ReportRelative.split("/")), "Phase 0.4R portal state-8 report");
    check(state8Report.schema === portalState8ReportSchema && state8Report.status === "PASS", "portal state-8 report is not the PASS browser-capture authority");
    check(recordSha(state8Report.matrix) === recordSha(matrixRecord), "portal state-8 report matrix SHA-256 differs from browser authority");
    check(state8Report.state7?.caseId === portalBrowserCaseId && recordSha(state8Report.state7?.capture) === recordSha(state7Capture), "portal state-8 report does not bind the exact state-7 case/capture");
    check(state8Report.audit?.pass === true && state8Report.audit?.sceneCrop?.display === "none" && state8Report.audit?.afterReportPass === true, "portal state-8 report does not prove full semantic ownership with the scene removed");
    check(state8Report.distinctFromState7?.pass === true, "portal state-8 report does not prove state-7/state-8 distinctness");
  } else if (finalMode) {
    check(false, `missing Phase 0.4R portal state-8 report: ${portalState8ReportRelative}`);
  }
  const state8Capture = states[1]?.capture;
  check(states[1]?.order === 8 && states[1]?.owner === "repository browser semantic DOM" && states[1]?.caseId === portalBrowserCaseId, "browser portal state 8 metadata differs from the governed semantic case");
  if (state8Capture) {
    await verifyRepositoryFileRecord(state8Capture, "browser portal state 8 capture", repositoryRecordPath(state8Capture));
    check(numberFrom(state8Capture, ["width"]) === 1440 && numberFrom(state8Capture, ["height"]) === 900, "browser portal state 8 is not the governed 1440x900 capture");
    check(numberFrom(state8Capture, ["modal", "votes"]) >= 7 || numberFrom(state8Capture.modal?.winner ?? {}, ["votes"]) >= 7, "browser portal state 8 lacks a >=7/11 modal winner");
    check(recordSha(state8Capture) === recordSha(state8Report.capture), "browser portal state 8 capture differs from the governed state-8 report");
  } else {
    check(false, "browser portal state 8 capture is missing");
  }
  const state8CaptureReport = states[1]?.captureReport;
  check(Boolean(state8CaptureReport), "browser portal state 8 omits its capture-report authority");
  if (state8CaptureReport) await verifyRepositoryFileRecord(state8CaptureReport, "browser portal state 8 capture report", portalState8ReportRelative);
  check(recordSha(state7Capture) !== recordSha(state8Capture), "browser portal states 7 and 8 reuse the same capture hash");
  const semanticPixels = new Set();
  for (const [record, label] of [[state7Capture, "browser portal state 7"], [state8Capture, "browser portal state 8"]]) {
    const relative = repositoryRecordPath(record);
    if (!relative) continue;
    const decoded = await decodeRaster(path.join(repositoryRoot, ...relative.split("/")), label);
    if (decoded) semanticPixels.add(decoded.pixelSha256);
  }
  check(semanticPixels.size === 2, "browser portal states 7 and 8 are not visually distinct decoded raster captures");
  const normalizedState7Capture = state7Capture ? {
    path: repositoryRecordPath(state7Capture), width: numberFrom(state7Capture, ["width"]), height: numberFrom(state7Capture, ["height"]),
    bytes: numberFrom(state7Capture, ["bytes"]), sha256: recordSha(state7Capture),
  } : {};
  const normalizedState8Capture = state8Capture ? {
    path: repositoryRecordPath(state8Capture), width: numberFrom(state8Capture, ["width"]), height: numberFrom(state8Capture, ["height"]),
    bytes: numberFrom(state8Capture, ["bytes"]), sha256: recordSha(state8Capture),
  } : {};
  browserSemanticStateRecords = [
    {
      id: exactPortalStateIds[6], order: 7, owner: "repository browser semantic DOM", status: "PASS",
      case_id: portalBrowserCaseId, source_id: textFreeSourceRole, source_sha256: recordSha(textFreeSnapshotSource), matrix_sha256: recordSha(matrixRecord),
      semantic_state: "DOM takes ownership over the frozen text-free takeover raster", capture: normalizedState7Capture,
    },
    {
      id: exactPortalStateIds[7], order: 8, owner: "repository browser semantic DOM", status: "PASS",
      case_id: portalBrowserCaseId, source_id: textFreeSourceRole, source_sha256: recordSha(textFreeSnapshotSource), matrix_sha256: recordSha(matrixRecord),
      semantic_state: "full semantic surface after the decorative takeover raster exits", capture: normalizedState8Capture,
      capture_report: state8CaptureReport,
    },
  ];
  const finalPortalStates = Array.isArray(portalAuthority.states) ? portalAuthority.states : recordsFrom(portalAuthority);
  if (finalPortalStates.length >= 8) check(canonicalJson(finalPortalStates.slice(6)) === canonicalJson(browserSemanticStateRecords), "final portal states 7–8 differ from the independently reconstructed browser authorities");
}
if (await exists(path.join(repositoryRoot, ...browserEvidenceRelative.split("/")))) {
  const evidence = await readJson(path.join(repositoryRoot, ...browserEvidenceRelative.split("/")), "Phase 0.4R browser evidence");
  check(evidence.schema === "quantum-hub.phase-0-4r-crt-television.browser-evidence.v1", "Phase 0.4R browser evidence schema mismatch");
  check(evidence.status === "PASS", "Phase 0.4R browser evidence is not PASS");
  const expectedRecords = [
    [evidence.capturePlanAuthority ?? evidence.capture_plan_authority, browserPlanSnapshotRelative, "browser evidence ready-plan snapshot"],
    [evidence.matrix, browserMatrixRelative, "browser evidence matrix"],
    [evidence.power_state_authority, `${packageRelative}/${powerStateRelative}`, "browser evidence power-state authority"],
    [evidence.portal_state_authority, `${packageRelative}/${portalStateRelative}`, "browser evidence portal-state authority"],
    [evidence.browserReviewCompositionInputs, browserCompositionInputsRelative, "browser evidence composition inputs"],
    [evidence.browserReviewCompositionManifest, browserCompositionRelative, "browser evidence composition manifest"],
  ];
  for (const [record, expectedPath, label] of expectedRecords) {
    check(Boolean(record), `${label} record is missing`);
    if (record) await verifyRepositoryFileRecord(record, label, expectedPath);
  }
  const summary = evidence.matrix_summary ?? {};
  check(numberFrom(summary, ["case_count"]) === 46 && numberFrom(summary, ["normalized_capture_count"]) === 36, "browser evidence does not bind 46 cases / 36 normalized captures");
  check(numberFrom(evidence, ["blankBridgeCount"]) === 0, "browser evidence reports a blank portal bridge");
  check(numberFrom(evidence, ["aspectSnapCount"]) === 0, "browser evidence reports an aspect snap");
  check(numberFrom(evidence, ["doubledCopyCount"]) === 0, "browser evidence reports doubled semantic copy");
  const evidenceCore = String(evidence.evidence_core_sha256 ?? evidence.evidenceCoreSha256 ?? "").toLowerCase();
  const portalCore = String(portalAuthority.evidence_core_sha256 ?? portalAuthority.browser_evidence_core_sha256 ?? "").toLowerCase();
  check(/^[0-9a-f]{64}$/.test(evidenceCore) && portalCore === evidenceCore, "portal authority/browser evidence canonical core digest is missing or mismatched");
  const core = evidence.evidenceCore ?? evidence.evidence_core ?? {};
  const coreWithoutDigest = { ...core };
  delete coreWithoutDigest.canonicalSha256;
  delete coreWithoutDigest.canonical_sha256;
  const recomputedCore = sha256Buffer(Buffer.from(canonicalJson(coreWithoutDigest)));
  check(core.canonicalSha256 === evidenceCore && recomputedCore === evidenceCore, "browser evidence core digest does not match its canonical contents");
  for (const [record, expectedPath, label] of [
    [core.capturePlanAuthority, browserPlanSnapshotRelative, "browser evidence core ready-plan snapshot"],
    [core.matrix, browserMatrixRelative, "browser evidence core matrix"],
    [core.keepout, `${packageRelative}/${keepoutRelative}`, "browser evidence core keepout"],
    [core.canonicalRenderAuthority, `${packageRelative}/${canonicalInventoryRelative}`, "browser evidence core canonical inventory"],
    [core.physicalPortalAuthority, `${packageRelative}/${physicalPortalStateRelative}`, "browser evidence core physical portal authority"],
    [core.powerStateAuthority, `${packageRelative}/${powerStateRelative}`, "browser evidence core power authority"],
    [core.blenderValidationAuthority, `${packageRelative}/${validationRelative}`, "browser evidence core Blender validation"],
    [core.portalBrowserStateAuthority, `${repairEvidenceRelative}/portal-states/portal-browser-state-authority.json`, "browser evidence core browser-state authority"],
  ]) {
    check(Boolean(record), `${label} record is missing`);
    if (record) await verifyRepositoryFileRecord(record, label, expectedPath);
  }
  check(canonicalJson(core.sceneSources ?? []) === canonicalJson(browserPlanSnapshotSources), "browser evidence core scene sources differ from the ready-plan snapshot");
  const expectedStateMapSha = canonicalStateMapDigest ? sha256Buffer(Buffer.from(canonicalStateMapDigest)) : "";
  check(core.physicalScreenContentStateMapSha256 === expectedStateMapSha, "browser evidence core content-state map SHA-256 differs from canonical authority");
  check(browserSemanticStateRecords.length === 2, "browser evidence cannot be sealed without two independently verified semantic portal states");
  if (browserSemanticStateRecords.length === 2) check(canonicalJson(core.semanticStates ?? []) === canonicalJson(browserSemanticStateRecords), "browser evidence core semantic states differ from the independently reconstructed browser authorities");
}

if (await exists(path.join(repositoryRoot, ...browserCompositionInputsRelative.split("/"))) || await exists(path.join(repositoryRoot, ...browserCompositionRelative.split("/")))) {
  const inputsPresent = await exists(path.join(repositoryRoot, ...browserCompositionInputsRelative.split("/")));
  const compositionPresent = await exists(path.join(repositoryRoot, ...browserCompositionRelative.split("/")));
  check(inputsPresent, `missing Phase 0.4R browser composition inputs: ${browserCompositionInputsRelative}`);
  check(compositionPresent, `missing Phase 0.4R browser composition manifest: ${browserCompositionRelative}`);
  if (inputsPresent && compositionPresent) {
    const inputs = await readJson(path.join(repositoryRoot, ...browserCompositionInputsRelative.split("/")), "Phase 0.4R browser composition inputs");
    const composition = await readJson(path.join(repositoryRoot, ...browserCompositionRelative.split("/")), "Phase 0.4R browser composition manifest");
    check(inputs.schema === "quantum-hub.phase-0-4r-crt-television.browser-review-composition-inputs.v1", "browser composition-input schema mismatch");
    check(inputs.status === "READY_FOR_CREATIVE_COMPOSITION", "browser composition inputs are not the frozen ready authority");
    check(composition.schema === "quantum-hub.phase-0-4r-crt-television.browser-review-composition.v1" && composition.status === "PASS", "browser composition manifest is not PASS");
    check(composition.historical_phase_0_4_authorities_modified === false, "additive browser compositor does not preserve historical Phase 0.4 authorities");
    check(numberFrom(composition, ["record_count"]) === 7, "browser composition manifest record count is not seven");
    check(canonicalJson(composition.exact_output_roster ?? []) === canonicalJson(exactBrowserReviewOutputs), "browser composition exact output roster/order differs from sheets 10–16");
    await verifyFileRecord(composition.composer, "Phase 0.4R additive browser compositor", browserComposerPackageRelative);
    await verifyRepositoryFileRecord(composition.capture_plan_authority, "browser composition ready-plan authority", browserPlanSnapshotRelative);
    await verifyRepositoryFileRecord(composition.composition_inputs, "browser composition frozen inputs authority", browserCompositionInputsRelative);
    await verifyRepositoryFileRecord(inputs.capturePlanAuthority, "browser composition ready-plan snapshot", browserPlanSnapshotRelative);
    await verifyRepositoryFileRecord(inputs.browserMatrix, "browser composition matrix", browserMatrixRelative);
    await verifyRepositoryFileRecord(inputs.portalTransitionStateAuthority, "browser composition final portal authority", `${packageRelative}/${portalStateRelative}`);
    const inputSheets = Array.isArray(inputs.sheets) ? inputs.sheets : [];
    const outputRecords = Array.isArray(composition.records) ? composition.records : [];
    check(inputSheets.length === 7 && outputRecords.length === 7, "browser composition does not bind exactly seven input/output sheets");
    check(canonicalJson(inputSheets.map((sheet) => [sheet.reviewIndex, sheet.filename])) === canonicalJson(exactBrowserReviewOutputs), "browser composition input roster/order differs from sheets 10–16");
    check(canonicalJson(outputRecords.map((record) => [record.reviewIndex, record.filename])) === canonicalJson(exactBrowserReviewOutputs), "browser composition output roster/order differs from sheets 10–16");
    check(new Set(outputRecords.map((record) => record.filename)).size === 7, "browser composition output filenames are not unique");
    const compositionMatrix = composition.browserMatrix ?? composition.browser_matrix ?? composition.matrix;
    const compositionPortal = composition.portalTransitionStateAuthority ?? composition.portal_state_authority;
    await verifyRepositoryFileRecord(compositionMatrix, "browser composition matrix authority", browserMatrixRelative);
    await verifyRepositoryFileRecord(compositionPortal, "browser composition portal authority", `${packageRelative}/${portalStateRelative}`);
    for (let outputIndex = 0; outputIndex < exactBrowserReviewOutputs.length; outputIndex += 1) {
      const [reviewIndex, filename] = exactBrowserReviewOutputs[outputIndex];
      const expected = inputSheets[outputIndex];
      const output = outputRecords[outputIndex];
      check(Boolean(expected), `browser composition inputs omit ${filename}`);
      check(Boolean(output), `browser composition outputs omit ${filename}`);
      if (!expected || !output) continue;
      check(expected.reviewIndex === reviewIndex && expected.filename === filename, `browser composition input identity differs: ${filename}`);
      check(output.reviewIndex === reviewIndex && output.filename === filename, `browser composition output identity differs: ${filename}`);
      const outputFile = output.output ?? output;
      const verifiedOutput = await verifyPng(filename, outputFile, `browser composition output ${filename}`);
      const repairRecord = repairRecordsByName.get(filename);
      check(Boolean(repairRecord), `repair manifest omits browser composition output ${filename}`);
      if (repairRecord) {
        check(recordPath(outputFile) === recordPath(repairRecord), `browser composition output path differs from repair manifest: ${filename}`);
        check(recordSha(outputFile) === recordSha(repairRecord), `browser composition output SHA-256 differs from repair manifest: ${filename}`);
        check(numberFrom(outputFile, ["bytes"]) === numberFrom(repairRecord, ["bytes"]), `browser composition output bytes differ from repair manifest: ${filename}`);
      }
      const outputSources = Array.isArray(output.sources) ? output.sources : [];
      const expectedSources = Array.isArray(expected.sources) ? expected.sources : [];
      check(outputSources.length > 0 && outputSources.length === expectedSources.length, `browser composition source count differs: ${filename}`);
      check(canonicalJson(output.sourceCaseIds ?? expected.sourceCaseIds ?? []) === canonicalJson(expected.sourceCaseIds ?? []), `browser composition source case IDs differ: ${filename}`);
      for (let index = 0; index < expectedSources.length; index += 1) {
        const actualSource = outputSources[index] ?? {};
        const expectedSource = expectedSources[index] ?? {};
        check((actualSource.captureId ?? actualSource.stateId) === (expectedSource.captureId ?? expectedSource.stateId), `browser composition source ID differs: ${filename}[${index}]`);
        check(repositoryRecordPath(actualSource) === repositoryRecordPath(expectedSource), `browser composition source path differs: ${filename}[${index}]`);
        check(recordSha(actualSource) === recordSha(expectedSource), `browser composition source SHA-256 differs: ${filename}[${index}]`);
        check(numberFrom(actualSource, ["bytes"]) === numberFrom(expectedSource, ["bytes"]), `browser composition source bytes differ: ${filename}[${index}]`);
        check(numberFrom(actualSource, ["width"]) === numberFrom(expectedSource, ["width"]) && numberFrom(actualSource, ["height"]) === numberFrom(expectedSource, ["height"]), `browser composition source dimensions differ: ${filename}[${index}]`);
        const sourcePath = repositoryRecordPath(actualSource);
        if (sourcePath.startsWith(`${packageRelative}/`)) await verifyRepositoryFileRecord(actualSource, `browser composition package source ${filename}[${index}]`, sourcePath);
        else await verifyRepositoryFileRecord(actualSource, `browser composition capture source ${filename}[${index}]`, sourcePath);
      }
      const actualAdditional = Array.isArray(output.additionalAuthorities) ? output.additionalAuthorities : [];
      if (reviewIndex === 11) {
        const physical = browserPlanSnapshotSources.find((record) => record.id === "source-physical-portal-close") ?? {};
        const takeover = browserPlanSnapshotSources.find((record) => record.id === "source-text-free-portal-takeover") ?? {};
        const layoutRelative = `${packageRelative}/crt-portal-layout.json`;
        const layoutAbsolute = path.join(repositoryRoot, ...layoutRelative.split("/"));
        const layoutBuffer = await fs.readFile(layoutAbsolute);
        const expectedAdditional = [
          {
            sourceId: "source-physical-portal-close",
            path: repositoryRecordPath(physical),
            width: numberFrom(physical, ["width"]),
            height: numberFrom(physical, ["height"]),
            bytes: numberFrom(physical, ["bytes"]),
            sha256: recordSha(physical),
          },
          {
            sourceId: "source-text-free-portal-takeover",
            path: repositoryRecordPath(takeover),
            width: numberFrom(takeover, ["width"]),
            height: numberFrom(takeover, ["height"]),
            bytes: numberFrom(takeover, ["bytes"]),
            sha256: recordSha(takeover),
          },
          { path: layoutRelative, bytes: layoutBuffer.length, sha256: sha256Buffer(layoutBuffer) },
        ];
        check(canonicalJson(actualAdditional) === canonicalJson(expectedAdditional), "browser sheet 11 resolved additional-authority roster/records differ");
        if (actualAdditional[0]) await verifyRepositoryFileRecord(actualAdditional[0], "browser sheet 11 physical source authority", repositoryRecordPath(physical));
        if (actualAdditional[1]) await verifyRepositoryFileRecord(actualAdditional[1], "browser sheet 11 takeover source authority", repositoryRecordPath(takeover));
        if (actualAdditional[2]) await verifyRepositoryFileRecord(actualAdditional[2], "browser sheet 11 layout authority", layoutRelative);
      } else {
        check(actualAdditional.length === 0, `browser composition output has unexpected additional authorities: ${filename}`);
      }
      if (verifiedOutput?.decoded) check(verifiedOutput.decoded.pixelSha256.length === 64, `browser composition output failed decoded-pixel verification: ${filename}`);
    }
  }
}

if (finalPackageSealingActive && authorityPresence.get(reviewBundleRelative)) {
  const reviewBundle = await readJson(path.join(packageRoot, ...reviewBundleRelative.split("/")), "review-bundle manifest");
  check(reviewBundle.status === "PASS", "review-bundle manifest is not PASS");
  const records = recordsFrom(reviewBundle);
  const names = new Set(records.map((record) => path.posix.basename(recordPath(record))));
  check(names.size === exactTopLevelReviewPngs.size, `review bundle has ${names.size}/${exactTopLevelReviewPngs.size} top-level PNGs`);
  for (const name of exactTopLevelReviewPngs) check(names.has(name), `review bundle omits ${name}`);
}

if (repairActive && authorityPresence.get(sanitizerRelative)) {
  const sanitizer = await readJson(path.join(packageRoot, ...sanitizerRelative.split("/")), "PNG sanitizer manifest");
  const records = recordsFrom(sanitizer);
  const privateHits = Array.isArray(sanitizer.private_marker_hits) ? sanitizer.private_marker_hits : [];
  const producerPass = sanitizer.status === "PASS"
    || (sanitizer.status == null && sanitizer.all_pixels_preserved === true && privateHits.length === 0);
  check(producerPass, "PNG sanitizer manifest lacks a valid PASS or pixel-preserved/zero-private-marker producer seal");
  check(sanitizer.all_pixels_preserved === true || Number(sanitizer.pixel_mismatch_count ?? sanitizer.summary?.pixel_mismatch_count) === 0, "PNG sanitizer reports changed pixels");
  check(privateHits.length === 0 && Number(sanitizer.private_marker_count ?? sanitizer.summary?.private_marker_count ?? 0) === 0, "PNG sanitizer reports private markers");
  check(records.every((record) => record.pixels_preserved === true), "PNG sanitizer contains a record without pixels_preserved=true");
  check(records.every((record) => !Array.isArray(record.private_marker_hits) || record.private_marker_hits.length === 0), "PNG sanitizer contains a per-file private-marker hit");
  if (finalPackageSealingActive) {
    const packagePngs = candidatePaths
      .filter((relative) => relative.startsWith(`${packageRelative}/`) && relative.endsWith(".png"))
      .map((relative) => relative.slice(packageRelative.length + 1));
    const packagePngSet = new Set(packagePngs);
    const sanitized = new Map(records.map((record) => [recordPath(record), record]));
    check(sanitized.size === records.length, "PNG sanitizer contains duplicate file records");
    const verifySanitizerRecord = async (relative, record) => {
      const verified = await verifyFileRecord(record, `PNG sanitizer record ${relative}`, relative);
      if (!verified) return;
      const dimensions = pngDimensions(verified.buffer);
      check(dimensions !== null && !pngContainsChunk(verified.buffer, "acTL"), `PNG sanitizer record is not a static PNG: ${relative}`);
      const decoded = await decodePng(verified.absolute, `PNG sanitizer record ${relative}`);
      if (dimensions && decoded) {
        check(numberFrom(record, ["width"]) === dimensions.width && numberFrom(record, ["height"]) === dimensions.height, `PNG sanitizer dimensions differ: ${relative}`);
        check(decoded.nativeInfo.width === dimensions.width && decoded.nativeInfo.height === dimensions.height, `PNG sanitizer native decoded dimensions differ: ${relative}`);
        const expectedMode = new Map([[1, "L"], [2, "LA"], [3, "RGB"], [4, "RGBA"]]).get(decoded.nativeInfo.channels) ?? `CHANNELS_${decoded.nativeInfo.channels}`;
        check(String(record.mode ?? "").toUpperCase() === expectedMode, `PNG sanitizer decoded mode differs: ${relative}`);
        check(String(record.pixel_sha256 ?? "").toLowerCase() === decoded.nativePixelSha256, `PNG sanitizer native decoded pixel SHA-256 differs: ${relative}`);
      }
      const removedMetadata = Array.isArray(record.removed_metadata_keys) ? record.removed_metadata_keys : [];
      if (removedMetadata.length === 0) {
        check(String(record.before_sha256 ?? "").toLowerCase() === String(record.after_sha256 ?? "").toLowerCase(), `PNG sanitizer claims no metadata rewrite but before/after SHA-256 differ: ${relative}`);
        check(numberFrom(record, ["before_bytes"]) === numberFrom(record, ["after_bytes"]), `PNG sanitizer claims no metadata rewrite but before/after bytes differ: ${relative}`);
      }
    };
    for (const relative of packagePngs) {
      const record = sanitized.get(relative);
      check(Boolean(record), `PNG sanitizer omits ${relative}`);
      if (record) await verifySanitizerRecord(relative, record);
    }
    for (const [relative, record] of sanitized) {
      if (packagePngSet.has(relative)) continue;
      const repositoryRelative = `${packageRelative}/${relative}`;
      let ignored = false;
      try {
        execFileSync("git", ["check-ignore", "--quiet", "--", repositoryRelative], {
          cwd: repositoryRoot,
          stdio: "ignore",
        });
        ignored = true;
      } catch {
        ignored = false;
      }
      check(relative.startsWith("work/") && ignored, `PNG sanitizer has a non-candidate record that is not governed ignored work: ${relative}`);
      if (await exists(path.join(packageRoot, ...relative.split("/")))) await verifySanitizerRecord(relative, record);
    }
  }
}

if (finalPackageSealingActive && authorityPresence.get(packageInventoryRelative)) {
  const inventory = await readJson(path.join(packageRoot, ...packageInventoryRelative.split("/")), "package inventory");
  check(inventory.schema === "quantum-hub.phase-0-4-crt-television.package-inventory.v1", "package inventory schema mismatch");
  check(inventory.scope === packageRelative, "package inventory scope mismatch");
  check(inventory.intended_commit_only === true, "package inventory is not intended-commit-only");
  check(Array.isArray(inventory.exclusions) && inventory.exclusions.length === 1 && inventory.exclusions[0] === packageInventoryRelative, "package inventory self-exclusion mismatch");
  const records = recordsFrom(inventory);
  const inventoryRelative = `${packageRelative}/${packageInventoryRelative}`;
  const intended = candidatePaths.filter((relative) => relative.startsWith(`${packageRelative}/`) && relative !== inventoryRelative);
  check(records.length === intended.length, `package inventory has ${records.length}/${intended.length} self-excluded records`);
  const byPath = new Map(records.map((record) => [recordPath(record), record]));
  for (const repositoryRelative of intended) {
    const relative = repositoryRelative.slice(packageRelative.length + 1);
    const record = byPath.get(relative);
    check(Boolean(record), `package inventory omits ${relative}`);
    if (!record) continue;
    const absolute = path.join(repositoryRoot, ...repositoryRelative.split("/"));
    const buffer = await fs.readFile(absolute);
    const stat = await fs.stat(absolute);
    check(numberFrom(record, ["bytes", "size"]) === stat.size, `package inventory byte mismatch: ${relative}`);
    check(recordSha(record) === sha256Buffer(buffer), `package inventory SHA-256 mismatch: ${relative}`);
    check(record.intendedCommit === true, `package inventory does not mark intendedCommit=true: ${relative}`);
  }
}

function findEndOfCentralDirectory(buffer) {
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  return -1;
}

const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    table[value] = crc >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function readZipMembers(buffer) {
  const end = findEndOfCentralDirectory(buffer);
  if (end < 0) throw new Error("end-of-central-directory record not found");
  const totalEntries = buffer.readUInt16LE(end + 10);
  const centralBytes = buffer.readUInt32LE(end + 12);
  const centralOffset = buffer.readUInt32LE(end + 16);
  const commentBytes = buffer.readUInt16LE(end + 20);
  if (buffer.readUInt16LE(end + 4) !== 0 || buffer.readUInt16LE(end + 6) !== 0) throw new Error("multi-disk ZIP is forbidden");
  if (buffer.readUInt16LE(end + 8) !== totalEntries) throw new Error("ZIP entry counts disagree");
  if (commentBytes !== 0 || end + 22 !== buffer.length) throw new Error("ZIP comment or appended payload is forbidden");
  if (centralOffset + centralBytes !== end) throw new Error("ZIP central directory boundary mismatch");
  const members = [];
  const localRanges = [];
  let cursor = centralOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error(`invalid central entry ${index}`);
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const expectedCrc = buffer.readUInt32LE(cursor + 16);
    const compressedBytes = buffer.readUInt32LE(cursor + 20);
    const uncompressedBytes = buffer.readUInt32LE(cursor + 24);
    const nameBytes = buffer.readUInt16LE(cursor + 28);
    const extraBytes = buffer.readUInt16LE(cursor + 30);
    const memberCommentBytes = buffer.readUInt16LE(cursor + 32);
    const externalAttributes = buffer.readUInt32LE(cursor + 38);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = normalize(buffer.toString(flags & 0x0800 ? "utf8" : "latin1", cursor + 46, cursor + 46 + nameBytes));
    if (flags & 0x0001 || flags & 0x0008) throw new Error(`encrypted/data-descriptor member is forbidden: ${name}`);
    if (flags & ~0x0800) throw new Error(`unsupported ZIP flags are forbidden: ${name}`);
    if (memberCommentBytes !== 0) throw new Error(`member comment is forbidden: ${name}`);
    if (extraBytes !== 0) throw new Error(`central extra fields are forbidden: ${name}`);
    if (((externalAttributes >>> 16) & 0xf000) === 0xa000) throw new Error(`symlink member is forbidden: ${name}`);
    if (path.posix.isAbsolute(name) || name.startsWith("../") || name.includes("/../") || name.includes("\\")) throw new Error(`unsafe ZIP path: ${name}`);
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`invalid local header: ${name}`);
    const localNameBytes = buffer.readUInt16LE(localOffset + 26);
    const localExtraBytes = buffer.readUInt16LE(localOffset + 28);
    const localFlags = buffer.readUInt16LE(localOffset + 6);
    const localMethod = buffer.readUInt16LE(localOffset + 8);
    const localCrc = buffer.readUInt32LE(localOffset + 14);
    const localCompressedBytes = buffer.readUInt32LE(localOffset + 18);
    const localUncompressedBytes = buffer.readUInt32LE(localOffset + 22);
    const localName = normalize(buffer.toString("utf8", localOffset + 30, localOffset + 30 + localNameBytes));
    if (localName !== name) throw new Error(`local/central path mismatch: ${name}`);
    if (localExtraBytes !== 0) throw new Error(`local extra fields are forbidden: ${name}`);
    if (localFlags !== flags || localMethod !== method || localCrc !== expectedCrc || localCompressedBytes !== compressedBytes || localUncompressedBytes !== uncompressedBytes) {
      throw new Error(`local/central metadata mismatch: ${name}`);
    }
    const dataOffset = localOffset + 30 + localNameBytes + localExtraBytes;
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedBytes);
    let contents;
    if (method === 0) contents = Buffer.from(compressed);
    else if (method === 8) contents = inflateRawSync(compressed);
    else throw new Error(`unsupported ZIP compression ${method}: ${name}`);
    if (contents.length !== uncompressedBytes || crc32(contents) !== expectedCrc) throw new Error(`ZIP size/CRC mismatch: ${name}`);
    if (compressedBytes > 0 && uncompressedBytes / compressedBytes > 200) throw new Error(`excessive ZIP expansion ratio: ${name}`);
    localRanges.push({ start: localOffset, end: dataOffset + compressedBytes, name });
    members.push({ name, contents });
    cursor += 46 + nameBytes + extraBytes + memberCommentBytes;
  }
  if (cursor !== end) throw new Error("ZIP central directory length mismatch");
  localRanges.sort((left, right) => left.start - right.start);
  for (let index = 0; index < localRanges.length; index += 1) {
    const expectedStart = index === 0 ? 0 : localRanges[index - 1].end;
    if (localRanges[index].start !== expectedStart) throw new Error(`hidden ZIP gap before ${localRanges[index].name}`);
  }
  if (localRanges.at(-1)?.end !== centralOffset) throw new Error("hidden ZIP payload before central directory");
  return members;
}

async function verifyExternalReviewZip() {
  const present = await exists(externalReviewZipAbsolute);
  if (requireExternalReviewZip) check(present, `required external review ZIP is absent: ${externalReviewZipRelative}`);
  if (!present) return;
  const buffer = await fs.readFile(externalReviewZipAbsolute);
  const external = repairManifest.external_review_zip ?? repairManifest.externalReviewZip ?? {};
  check(external.intentionally_uncommitted === true || external.repository_status === "intentionally uncommitted", "repair manifest does not classify external ZIP as intentionally uncommitted");
  check(normalize(external.local_relative_path ?? external.path) === externalReviewZipRelative, "repair manifest external ZIP path mismatch");
  check(numberFrom(external, ["bytes", "size"]) === buffer.length, "external review ZIP byte mismatch");
  check(recordSha(external) === sha256Buffer(buffer), "external review ZIP SHA-256 mismatch");
  try {
    const members = readZipMembers(buffer);
    check(members.length === exactRepairDeliverables.size, `external review ZIP has ${members.length}/${exactRepairDeliverables.size} members`);
    const byName = new Map(members.map((member) => [member.name, member]));
    for (const name of exactRepairDeliverables) {
      check(byName.has(name), `external review ZIP omits ${name}`);
      if (!byName.has(name)) continue;
      const packageAbsolute = path.join(packageRoot, name);
      if (await exists(packageAbsolute)) {
        const packageBuffer = await fs.readFile(packageAbsolute);
        check(byName.get(name).contents.equals(packageBuffer), `external review ZIP member differs from package file: ${name}`);
      }
    }
    for (const member of members) check(privatePathHit(member.contents) === null, `private path leaked into external review ZIP member ${member.name}`);
  } catch (error) {
    errors.push(`external review ZIP is invalid: ${error.message}`);
  }
}

await verifyExternalReviewZip();

if (errors.length) {
  console.error(`Phase 0.4R CRT asset verification failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const mode = finalMode ? "final" : "preflight";
  const trueNewBudget = sizeReport.newBlobBytes < preferredNetGrowthBytes
    ? `true-new ${sizeReport.newBlobBytes} B across ${sizeReport.newBlobCount} blobs remains within the <${preferredNetGrowthBytes} B preference`
    : `true-new ${sizeReport.newBlobBytes} B across ${sizeReport.newBlobCount} blobs exceeds the <${preferredNetGrowthBytes} B preference and requires the governed evidence-backed exception`;
  console.log(
    `Verified Phase 0.4R CRT ${mode} boundaries at ${acceptedRepairParent}: protected V1–V4 history, privacy/external-dependency boundary, ${sizeReport.candidateFiles} candidate files / ${sizeReport.candidateBytes} B, strict net growth ${sizeReport.netGrowthBytes} B (<${preferredNetGrowthBytes} B); ${trueNewBudget}.`,
  );
}
