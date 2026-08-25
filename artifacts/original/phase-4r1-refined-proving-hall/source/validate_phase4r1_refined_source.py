"""Validate the saved Phase 4-R1 v2 derivative and emit strict audits.

Run only with the published refined derivative open.  This validator performs
no save and no render.  It independently re-runs the scene audit, re-hashes all
tracked producers, checks preserved CRT/camera signatures, validates packed
resources, and fail-closes on private host paths or unresolved dependencies.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

import bpy

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
import build_phase4r1_refined_proving_hall as builder
import phase4r1_refined_config as cfg
import preflight_phase4r1_refined_geometry as preflight


EXPECTED_PRODUCER_IDS = {
    "config",
    "builder",
    "preflight",
    "validator",
    "exact-q-generator",
    "sparse-proof-renderer",
    "preview-renderer",
    "cycles-benchmarks-renderer",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_record(path: Path) -> dict[str, Any]:
    return {
        "path": path.resolve().relative_to(cfg.REPOSITORY_ROOT.resolve()).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def json_authority(path: Path, schema: str) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if value.get("schema") != schema or value.get("status") != "PASS":
        raise RuntimeError(f"invalid authority {path.name}: {value.get('schema')} / {value.get('status')}")
    return value


def is_git_tracked(repo_path: str) -> bool:
    result = subprocess.run(
        ["git", "ls-files", "--error-unmatch", "--", repo_path],
        cwd=cfg.REPOSITORY_ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0


def decode_blender_byte_string(value: Any) -> str:
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="surrogateescape")
    return str(value or "")


def resolved_resource_audit() -> dict[str, Any]:
    private_tokens = ("c:\\users\\amir", "c:/users/amir")
    images: list[dict[str, Any]] = []
    unresolved: list[dict[str, str]] = []
    private_paths: list[dict[str, str]] = []
    q_image_filepath_buffer_overwrite_realized_characters = int(bpy.context.scene.get("phase4r1v2_q_filepath_overwrite_chars", 0))
    for image in bpy.data.images:
        filepath_raw = str(image.filepath or "")
        filepath_canonical = None
        filepath_canonicalization_error = None
        packed_filepaths_raw = [str(entry.filepath or "") for entry in image.packed_files]
        packed_filepaths_canonical: list[str | None] = []
        packed_filepath_canonicalization_errors: list[str | None] = []
        if image.name == "Phase4R1V2_ExactQuantumQ_PreCRTEffect_2048":
            try:
                filepath_canonical = cfg.canonical_blender_repo_relative_path(
                    filepath_raw,
                    cfg.CANONICAL_Q_IMAGE_FILEPATH,
                )
            except ValueError as exc:
                filepath_canonicalization_error = str(exc)
            for packed_filepath_raw in packed_filepaths_raw:
                try:
                    packed_filepaths_canonical.append(
                        cfg.canonical_blender_repo_relative_path(
                            packed_filepath_raw,
                            cfg.CANONICAL_Q_IMAGE_FILEPATH,
                        )
                    )
                    packed_filepath_canonicalization_errors.append(None)
                except ValueError as exc:
                    packed_filepaths_canonical.append(None)
                    packed_filepath_canonicalization_errors.append(str(exc))
        packed_bytes = b"" if image.packed_file is None else bytes(image.packed_file.data)
        record = {"name": image.name, "filepathRaw": filepath_raw, "filepath": filepath_canonical if filepath_canonical is not None else filepath_raw, "filepathCanonical": filepath_canonical, "filepathCanonicalizationError": filepath_canonicalization_error, "filepathBufferOverwriteRealizedCharacters": int(image.get("phase4r1v2_filepath_buffer_overwrite_realized_characters", 0)), "packed": image.packed_file is not None, "packedFileCount": len(packed_filepaths_raw), "packedFilepathsRaw": packed_filepaths_raw, "packedFilepathsCanonical": packed_filepaths_canonical, "packedFilepathCanonicalizationErrors": packed_filepath_canonicalization_errors, "packedBytes": len(packed_bytes), "packedSha256": None if not packed_bytes else hashlib.sha256(packed_bytes).hexdigest(), "source": image.source}
        images.append(record)
        lowered = filepath_raw.lower()
        if any(token in lowered for token in private_tokens):
            private_paths.append({"kind": "image", "name": image.name, "path": filepath_raw})
        for packed_filepath_raw in packed_filepaths_raw:
            if any(token in packed_filepath_raw.lower() for token in private_tokens):
                private_paths.append({"kind": "image-packed-file", "name": image.name, "path": packed_filepath_raw})
        if filepath_raw and image.packed_file is None and image.source not in {"GENERATED", "VIEWER"}:
            absolute = Path(bpy.path.abspath(filepath_raw))
            if not absolute.is_file():
                unresolved.append({"kind": "image", "name": image.name, "path": filepath_raw})
    libraries = []
    for library in bpy.data.libraries:
        filepath = str(library.filepath or "")
        libraries.append({"name": library.name, "filepath": filepath})
        if any(token in filepath.lower() for token in private_tokens):
            private_paths.append({"kind": "library", "name": library.name, "path": filepath})
        if filepath and not Path(bpy.path.abspath(filepath)).is_file():
            unresolved.append({"kind": "library", "name": library.name, "path": filepath})
    render_path_raw = str(bpy.context.scene.render.filepath or "")
    render_path_canonical = None
    render_path_canonicalization_error = None
    try:
        render_path_canonical = cfg.canonical_blender_repo_relative_path(
            render_path_raw,
            cfg.CANONICAL_RENDER_HOLD_FILEPATH,
        )
    except ValueError as exc:
        render_path_canonicalization_error = str(exc)
    if any(token in render_path_raw.lower() for token in private_tokens):
        private_paths.append({"kind": "render-output", "name": bpy.context.scene.name, "path": render_path_raw})
    file_browser_state: list[dict[str, Any]] = []
    for screen in sorted(bpy.data.screens, key=lambda item: item.name):
        for area_index, area in enumerate(screen.areas):
            if area.type != "FILE_BROWSER":
                continue
            params = getattr(area.spaces.active, "params", None)
            if params is None:
                file_browser_state.append({"screen": screen.name, "areaIndex": area_index, "parametersReadable": False, "passes": False})
                continue
            directory = decode_blender_byte_string(params.directory)
            filename = decode_blender_byte_string(params.filename)
            has_private_path = any(token in directory.lower() or token in filename.lower() for token in private_tokens)
            record = {
                "screen": screen.name,
                "areaIndex": area_index,
                "title": str(params.title or ""),
                "directory": None if has_private_path else directory,
                "filename": None if has_private_path else filename,
                "hasPrivatePath": has_private_path,
                "parametersReadable": True,
                "passes": directory == cfg.CANONICAL_FILE_BROWSER_DIRECTORY and filename == "" and not has_private_path,
            }
            file_browser_state.append(record)
            if has_private_path:
                private_paths.append({"kind": "file-browser-ui-state", "name": f"{screen.name}[{area_index}]", "path": "private path redacted"})
    file_browser_buffer_overwrite_realized_bytes = int(bpy.context.scene.get("phase4r1v2_file_browser_buffer_overwrite_realized_bytes", 0))
    return {
        "images": images,
        "libraries": libraries,
        "renderOutputPathRaw": render_path_raw,
        "renderOutputPath": render_path_canonical,
        "renderOutputPathCanonicalizationError": render_path_canonicalization_error,
        "unresolved": unresolved,
        "privateDataBlockPaths": private_paths,
        "fileBrowserState": file_browser_state,
        "fileBrowserBufferOverwriteMinimumBytes": cfg.FILE_BROWSER_DIRECTORY_BUFFER_OVERWRITE_MINIMUM_BYTES,
        "fileBrowserBufferOverwriteRealizedBytes": file_browser_buffer_overwrite_realized_bytes,
        "fileBrowserStateCanonical": bool(file_browser_state) and file_browser_buffer_overwrite_realized_bytes >= cfg.FILE_BROWSER_DIRECTORY_BUFFER_OVERWRITE_MINIMUM_BYTES and all(record["passes"] for record in file_browser_state),
        "qImageFilepathBufferOverwriteMinimumCharacters": cfg.IMAGE_FILEPATH_BUFFER_OVERWRITE_MINIMUM_CHARACTERS,
        "qImageFilepathBufferOverwriteRealizedCharacters": q_image_filepath_buffer_overwrite_realized_characters,
        "exactQRepoRelativePacked": any(
            row["name"] == "Phase4R1V2_ExactQuantumQ_PreCRTEffect_2048"
            and row["filepath"] == cfg.CANONICAL_Q_IMAGE_FILEPATH
            and row["filepathCanonicalizationError"] is None
            and row["filepathBufferOverwriteRealizedCharacters"] >= cfg.IMAGE_FILEPATH_BUFFER_OVERWRITE_MINIMUM_CHARACTERS
            and row["filepathBufferOverwriteRealizedCharacters"] == q_image_filepath_buffer_overwrite_realized_characters
            and row["packed"]
            and row["packedFileCount"] == 1
            and row["packedFilepathsCanonical"] == [cfg.CANONICAL_Q_IMAGE_FILEPATH]
            and row["packedFilepathCanonicalizationErrors"] == [None]
            and row["packedBytes"] == cfg.Q_TEXTURE_PRE_CRT.stat().st_size
            and row["packedSha256"] == sha256(cfg.Q_TEXTURE_PRE_CRT)
            for row in images
        ),
    }


def private_byte_scan(paths: list[Path]) -> dict[str, Any]:
    needles = (b"c:\\users\\amir", b"c:/users/amir")
    hits: list[str] = []
    for path in paths:
        lowered = path.read_bytes().lower()
        if any(needle in lowered for needle in needles):
            hits.append(path.resolve().relative_to(cfg.REPOSITORY_ROOT.resolve()).as_posix())
    return {"policies": ["windows-user-profile-backslash", "windows-user-profile-forward-slash"], "scanned": [file_record(path) for path in paths], "hits": hits}


def source_hygiene_audit() -> dict[str, Any]:
    pending = sorted(path.name for path in cfg.SOURCE_DIR.glob("*.pending.blend") if path.is_file())
    blender_backups = sorted(path.name for path in cfg.SOURCE_DIR.glob("*.blend1") if path.is_file())
    bytecode_directories = sorted(path.resolve().relative_to(cfg.REPOSITORY_ROOT.resolve()).as_posix() for path in cfg.SOURCE_DIR.rglob("__pycache__") if path.is_dir())
    return {
        "pendingBlendFiles": pending,
        "blenderBackupFiles": blender_backups,
        "pythonBytecodeDirectories": bytecode_directories,
        "passes": not pending and not blender_backups and not bytecode_directories,
    }


def write_role_audits(audits: dict[str, Any], authorities: dict[str, Any], producers: dict[str, Any]) -> dict[str, Any]:
    payloads = {
        "central-floor-object-audit": audits["centralFloor"],
        "palette-audit": audits["palette"],
        "cable-geometry-audit": audits["cable"],
        "current-continuity-audit": audits["current"],
        "camera-audit": audits["camera"],
        "exact-q-fidelity-audit": audits["q"],
    }
    records: dict[str, Any] = {}
    for role, audit in payloads.items():
        if role == "central-floor-object-audit":
            passed = audit.get("visibleHeroObjects") == ["CRT", "spiral cable"] and audit.get("visibleNonHeroObjects") == []
        elif role == "palette-audit":
            passed = (
                audit.get("magentaAbsentAtDormancy") is True
                and audit.get("brightWhiteFactoryPanels") is False
                and audit.get("exactGlobalHallVisualAuthority", {}).get("passes") is True
                and audit.get("phase3ScreenSpillObjectOnlySuppression", {}).get("passes") is True
            )
        elif role == "cable-geometry-audit":
            passed = all(row.get("status") == "PASS" for row in audit.values())
        elif role == "current-continuity-audit":
            passed = all(row.get("status") == "PASS" for row in audit.values())
        elif role == "camera-audit":
            passed = audit.get("pathActionsPreserved") is True and all(row.get("status") == "PASS" for row in audit.get("openingComposition", {}).values())
        else:
            metrics = audit.get("provenanceMetrics", {})
            passed = audit.get("imagePacked") is True and not audit.get("oldQCurvesVisible") and all(int(value) == 0 for value in metrics.values())
        report = {
            "schema": f"quantum-hub.phase-4-r1.refined-proving-hall.{role}.v2",
            "status": "PASS" if passed else "FAIL",
            "generatedAt": cfg.GENERATED_AT,
            "sourceAuthorities": authorities,
            "producerAuthorities": producers,
            "audit": audit,
            "authorization": cfg.AUTHORIZATION,
        }
        path = cfg.AUDIT_REPORTS[role]
        path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        records[role] = file_record(path)
    return records


def validate_transaction() -> None:
    if Path(bpy.data.filepath).resolve() != cfg.DERIVATIVE_SOURCE.resolve():
        raise RuntimeError(f"validator requires exact refined derivative open; got {bpy.data.filepath}")
    build = json_authority(cfg.BUILD_REPORT, "quantum-hub.phase-4-r1.refined-proving-hall.source-build.v2")
    ledger = json_authority(cfg.ASSET_LEDGER, "quantum-hub.phase-4-r1.refined-proving-hall.asset-ledger.v2")
    q_report = json_authority(cfg.Q_PROVENANCE_REPORT, "quantum-hub.phase-4-r1.exact-q-provenance.v2")
    recovery = json_authority(cfg.RECOVERY_REPORT, "quantum-hub.phase-4-r1.recovery-report.v2")
    backup = json_authority(cfg.RECOVERY_BACKUP_SUMMARY, "quantum-hub.phase-4-r1.recovery-backup-summary.v2")

    checks: list[dict[str, Any]] = []

    def check(name: str, passed: bool, evidence: Any) -> None:
        checks.append({"name": name, "status": "PASS" if passed else "FAIL", "evidence": evidence})

    derivative = file_record(cfg.DERIVATIVE_SOURCE)
    expected_derivative = build["sourceAuthorities"]["refinedDerivative"]
    check("refined-derivative-build-binding", derivative == expected_derivative, {"actual": derivative, "expected": expected_derivative})
    check("recovered-source-unchanged", file_record(cfg.RECOVERED_SOURCE)["sha256"] == cfg.RECOVERED_SOURCE_SHA256, file_record(cfg.RECOVERED_SOURCE))
    check("recovered-source-validation-present", all(recovery["selectedSource"]["validation"].values()) if not any(isinstance(value, list) for value in recovery["selectedSource"]["validation"].values()) else all(value is True or value == [] for value in recovery["selectedSource"]["validation"].values()), recovery["selectedSource"]["validation"])
    check("exact-producer-id-set", set(build.get("producerAuthorities", {})) == EXPECTED_PRODUCER_IDS, {"actual": sorted(build.get("producerAuthorities", {})), "expected": sorted(EXPECTED_PRODUCER_IDS)})
    check("exact-q-generator-self-binding", q_report.get("producerAuthority") == build["producerAuthorities"].get("exact-q-generator") == file_record(SCRIPT_DIR / "generate_phase4r1_exact_q.mjs"), {"qProvenance": q_report.get("producerAuthority"), "build": build["producerAuthorities"].get("exact-q-generator"), "actual": file_record(SCRIPT_DIR / "generate_phase4r1_exact_q.mjs")})

    scene_exclusion_authority_raw = str(bpy.context.scene.get("phase4r1v2_persistence_exclusion_authority_json", ""))
    try:
        scene_exclusion_authority = json.loads(scene_exclusion_authority_raw)
    except (json.JSONDecodeError, TypeError, ValueError):
        scene_exclusion_authority = None
    scene_boundary = {
        "schema": bpy.context.scene.get("phase4r1v2_schema"),
        "full540FrameCyclesProductionFilmStarted": bpy.context.scene.get("phase4r1v2_full540_frame_cycles_production_film_started"),
        "full540FrameCyclesProductionFilmResumed": bpy.context.scene.get("phase4r1v2_full540_frame_cycles_production_film_resumed"),
        "refinedPhysicalMediaRuntimeIntegrationStarted": bpy.context.scene.get("phase4r1v2_refined_physical_media_runtime_integration_started"),
        "chromeStatePolicyImplementationEvidenced": bpy.context.scene.get("phase4r1v2_chrome_state_policy_implementation_evidenced"),
        "phase5Authorized": bpy.context.scene.get("phase4r1v2_phase5_authorized"),
        "preservationSignatureSchema": bpy.context.scene.get("phase4r1v2_preservation_signature_schema"),
        "persistenceVolatileRnaPropertyExclusionAuthority": scene_exclusion_authority,
        "persistenceVolatileRnaPropertyExclusionAuthorityRaw": scene_exclusion_authority_raw,
        "crtTrackMutationOccurred": bpy.context.scene.get("phase4r1v2_crt_track_mutation_occurred"),
        "preservationSignatureFrame": bpy.context.scene.get("phase4r1v2_preservation_signature_frame"),
    }
    scene_boundary_valid = (
        scene_boundary["schema"] == "quantum-hub.phase-4-r1.refined-proving-hall.blender-source.v2"
        and scene_boundary["full540FrameCyclesProductionFilmStarted"] is False
        and scene_boundary["full540FrameCyclesProductionFilmResumed"] is False
        and scene_boundary["refinedPhysicalMediaRuntimeIntegrationStarted"] is False
        and scene_boundary["chromeStatePolicyImplementationEvidenced"] is True
        and scene_boundary["phase5Authorized"] is False
        and scene_boundary["preservationSignatureSchema"] == cfg.PRESERVATION_SIGNATURE_SCHEMA
        and scene_boundary["persistenceVolatileRnaPropertyExclusionAuthority"] == cfg.PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY
        and scene_boundary["persistenceVolatileRnaPropertyExclusionAuthority"] is not None
        and scene_boundary["persistenceVolatileRnaPropertyExclusionAuthority"].get("properties") == ["session_uid"]
        and "tag" not in scene_boundary["persistenceVolatileRnaPropertyExclusionAuthority"].get("properties", [])
        and scene_boundary["crtTrackMutationOccurred"] is False
        and scene_boundary["preservationSignatureFrame"] == 1
    )
    check("scene-schema-and-authorization-boundary", scene_boundary_valid, scene_boundary)

    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    current_crt = builder.accepted_crt_signature()
    current_camera = builder.camera_path_signature()
    current_establishing = builder.establishing_aim_signature()
    check("accepted-crt-byte-signature", current_crt["sha256"] == build["preservation"]["acceptedCrtAfter"]["sha256"], current_crt)
    check("camera-action-signature", current_camera["sha256"] == build["preservation"]["cameraPathAfter"]["sha256"], current_camera)
    check("establishing-aim-action-signature", current_establishing["sha256"] == build["preservation"]["establishingAimAfter"]["sha256"], current_establishing)
    preservation = build.get("preservation", {})
    persistence_signature_records = {
        "acceptedCrtBefore": preservation.get("acceptedCrtBefore"),
        "acceptedCrtAfter": preservation.get("acceptedCrtAfter"),
        "cameraPathBefore": preservation.get("cameraPathBefore"),
        "cameraPathAfter": preservation.get("cameraPathAfter"),
        "establishingAimBefore": preservation.get("establishingAimBefore"),
        "establishingAimAfter": preservation.get("establishingAimAfter"),
        "currentAcceptedCrt": current_crt,
        "currentCameraPath": current_camera,
        "currentEstablishingAim": current_establishing,
    }
    persistence_exclusion_valid = (
        cfg.PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY.get("properties") == ["session_uid"]
        and "tag" not in cfg.PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY.get("properties", [])
        and preservation.get("preservationSignatureSchema") == cfg.PRESERVATION_SIGNATURE_SCHEMA
        and preservation.get("persistenceVolatileRnaPropertyExclusionAuthority") == cfg.PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY
        and all(
            isinstance(record, dict)
            and record.get("signatureSchema") == cfg.PRESERVATION_SIGNATURE_SCHEMA
            and record.get("persistenceVolatileRnaPropertyExclusionAuthority") == cfg.PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY
            for record in persistence_signature_records.values()
        )
    )
    check(
        "persistence-signature-volatile-exclusion-boundary",
        persistence_exclusion_valid,
        {
            "schema": cfg.PRESERVATION_SIGNATURE_SCHEMA,
            "authority": cfg.PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY,
            "sceneAuthority": scene_exclusion_authority,
            "signatureRecords": {
                name: None if not isinstance(record, dict) else {
                    "signatureSchema": record.get("signatureSchema"),
                    "persistenceVolatileRnaPropertyExclusionAuthority": record.get("persistenceVolatileRnaPropertyExclusionAuthority"),
                }
                for name, record in persistence_signature_records.items()
            },
        },
    )
    expected_old_q_unchanged_hidden = {
        "before": {"Phase4R0_QuantumQ_Accent": True, "Phase4R0_QuantumQ_Body": True},
        "after": {"Phase4R0_QuantumQ_Accent": True, "Phase4R0_QuantumQ_Body": True},
        "changed": False,
        "crtTrackMutationOccurred": False,
    }
    precise_preservation = (
        preservation.get("preservationSignatureSchema") == cfg.PRESERVATION_SIGNATURE_SCHEMA
        and preservation.get("persistenceVolatileRnaPropertyExclusionAuthority") == cfg.PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY
        and persistence_exclusion_valid
        and preservation.get("acceptedCrtPhysicalMaterialsActionsUnchanged") is True
        and preservation.get("acceptedCrtBefore") == preservation.get("acceptedCrtAfter")
        and preservation.get("acceptedCrtAfter", {}).get("signatureFrame") == 1
        and preservation.get("acceptedCrtAfter", {}).get("collectionAuthority", {}).get("records")
        and preservation.get("cameraPathBefore") == preservation.get("cameraPathAfter")
        and preservation.get("cameraPathAfter", {}).get("signatureFrame") == 1
        and preservation.get("establishingAimBefore") == preservation.get("establishingAimAfter")
        and preservation.get("establishingAimAfter", {}).get("signatureFrame") == 1
        and preservation.get("oldApproximateQVisibilityUnchangedHidden") == expected_old_q_unchanged_hidden
        and "allowedOldQVisibilityTransition" not in preservation
        and preservation.get("cameraOrbitThresholdActionsAndStaticRigStateUnchanged") is True
        and preservation.get("establishingAimActionsAndStaticStateUnchanged") is True
        and all(bpy.data.objects[name].hide_render for name in expected_old_q_unchanged_hidden["after"])
        and json.loads(str(bpy.context.scene.get("phase4r1v2_old_approximate_q_visibility_unchanged_hidden_json", "{}"))) == expected_old_q_unchanged_hidden
    )
    check("precise-preservation-boundary", precise_preservation, preservation)

    ledger_assets = {row.get("id"): row for row in ledger.get("assets", [])}
    ledger_valid = (
        set(ledger_assets) == {"accepted-crt", "dark-v2-hall", "responsive-spiral-cables", "exact-quantum-q"}
        and ledger_assets["accepted-crt"].get("physicalGeometryMaterialsActionsChanged") is False
        and ledger_assets["accepted-crt"].get("preservationSignatureSchema") == cfg.PRESERVATION_SIGNATURE_SCHEMA
        and ledger_assets["accepted-crt"].get("persistenceVolatileRnaPropertyExclusionAuthority") == cfg.PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY
        and ledger_assets["accepted-crt"].get("oldApproximateQVisibilityUnchangedHidden") == expected_old_q_unchanged_hidden
        and "allowedSupersededOldQVisibilityTransition" not in ledger_assets["accepted-crt"]
        and ledger_assets["exact-quantum-q"].get("manualRedraw") is False
        and ledger_assets["exact-quantum-q"].get("approximateGeometry") is False
        and ledger.get("externalAssetsDownloaded") == []
        and ledger.get("stockOrGenerativeAssetsUsed") is False
    )
    check("asset-ledger-semantic-essentials", ledger_valid, ledger)

    live_preflight = preflight.audit_scene()
    check("saved-scene-preflight", live_preflight["status"] == "PASS", live_preflight["summary"])
    live_audits = live_preflight.get("audits", {})
    build_environment = build.get("design", {}).get("environment", {})
    build_connections = build.get("design", {}).get("connections", {})
    hall_authority_binding = {
        "config": cfg.HALL_VISUAL_AUTHORITY,
        "build": build_environment.get("visualAuthority"),
        "preflight": live_audits.get("hallVisualAuthority"),
    }
    check(
        "global-hall-visual-authority-cross-bound",
        build_environment.get("visualAuthority") == cfg.HALL_VISUAL_AUTHORITY
        and live_audits.get("hallVisualAuthority", {}).get("authority") == cfg.HALL_VISUAL_AUTHORITY
        and live_audits.get("hallVisualAuthority", {}).get("passes") is True,
        hall_authority_binding,
    )
    screen_spill_binding = {
        "config": cfg.SCREEN_SPILL_SUPPRESSION_AUTHORITY,
        "build": build_environment.get("screenSpillSuppression"),
        "preflight": live_audits.get("screenSpillSuppressionAuthority"),
    }
    check(
        "phase3-screen-spill-object-only-suppression-cross-bound",
        build_environment.get("screenSpillSuppression", {}).get("passes") is True
        and live_audits.get("screenSpillSuppressionAuthority", {}).get("authority") == cfg.SCREEN_SPILL_SUPPRESSION_AUTHORITY
        and live_audits.get("screenSpillSuppressionAuthority", {}).get("passes") is True,
        screen_spill_binding,
    )
    service_mouth_binding = {
        "config": cfg.SERVICE_MOUTH_AUTHORITY,
        "build": build_connections.get("serviceMouth"),
        "preflight": live_audits.get("serviceMouthGeometryAuthority"),
    }
    check(
        "coaxial-service-mouth-authority-cross-bound",
        build_connections.get("serviceMouth", {}).get("authority") == cfg.SERVICE_MOUTH_AUTHORITY
        and live_audits.get("serviceMouthGeometryAuthority", {}).get("authority") == cfg.SERVICE_MOUTH_AUTHORITY
        and live_audits.get("serviceMouthGeometryAuthority", {}).get("passes") is True
        and all(row.get("originAuthority", {}).get("apertureTransit", {}).get("passes") is True for row in live_audits.get("cable", {}).values()),
        service_mouth_binding,
    )
    check(
        "saved-scene-preflight-persistence-authority",
        live_preflight.get("preservationSignatureAuthority", {}).get("schema") == cfg.PRESERVATION_SIGNATURE_SCHEMA
        and live_preflight.get("preservationSignatureAuthority", {}).get("persistenceVolatileRnaPropertyExclusionAuthority") == cfg.PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY,
        live_preflight.get("preservationSignatureAuthority"),
    )
    source_authorities = {
        "derivative": derivative,
        "build": file_record(cfg.BUILD_REPORT),
        "validationParentPreflight": file_record(cfg.PREFLIGHT_REPORT),
        "ledger": file_record(cfg.ASSET_LEDGER),
        "qProvenance": file_record(cfg.Q_PROVENANCE_REPORT),
        "recovery": file_record(cfg.RECOVERY_REPORT),
        "recoveryBackupSummary": file_record(cfg.RECOVERY_BACKUP_SUMMARY),
    }
    producer_actual: dict[str, Any] = {}
    producer_failures: list[dict[str, Any]] = []
    for producer_id, expected in sorted(build["producerAuthorities"].items()):
        path = cfg.REPOSITORY_ROOT / expected["path"]
        actual = file_record(path) if path.is_file() else None
        tracked = path.is_file() and is_git_tracked(expected["path"])
        producer_actual[producer_id] = None if actual is None else {**actual, "gitTracked": tracked}
        if actual != expected or not tracked:
            producer_failures.append({"id": producer_id, "expected": expected, "actual": actual, "gitTracked": tracked})
    check("producer-authorities-tracked-and-hash-bound", not producer_failures, {"failures": producer_failures, "actual": producer_actual})

    resources = resolved_resource_audit()
    check("resources-resolved-and-private-path-free", not resources["unresolved"] and not resources["privateDataBlockPaths"] and resources["fileBrowserStateCanonical"] and resources["exactQRepoRelativePacked"] and resources["renderOutputPath"] == cfg.CANONICAL_RENDER_HOLD_FILEPATH and resources["renderOutputPathCanonicalizationError"] is None, resources)
    audit_records = write_role_audits(live_preflight["audits"], source_authorities, build["producerAuthorities"])
    byte_scan_paths = [cfg.DERIVATIVE_SOURCE, cfg.BUILD_REPORT, cfg.PREFLIGHT_REPORT, cfg.ASSET_LEDGER, cfg.Q_PROVENANCE_REPORT, cfg.RECOVERY_REPORT, cfg.RECOVERY_BACKUP_SUMMARY, *(cfg.REPOSITORY_ROOT / record["path"] for record in audit_records.values())]
    byte_scan = private_byte_scan(byte_scan_paths)
    check("saved-source-and-reports-private-byte-scan", not byte_scan["hits"], byte_scan)
    check("exact-q-zero-difference", q_report.get("manualRedraw") is False and q_report.get("approximateBlenderGeometry") is False and all(int(value) == 0 for value in q_report["metrics"].values()), q_report["metrics"])
    check("authorization-remains-closed", all(value is False for key, value in cfg.AUTHORIZATION.items() if key != "chromeStatePolicyImplementationEvidenced") and cfg.AUTHORIZATION["chromeStatePolicyImplementationEvidenced"] is True, cfg.AUTHORIZATION)
    hygiene = source_hygiene_audit()
    check("source-directory-hygiene", hygiene["passes"], hygiene)

    check("role-audit-reports-pass", all(json.loads((cfg.REPOSITORY_ROOT / record["path"]).read_text(encoding="utf-8"))["status"] == "PASS" for record in audit_records.values()), audit_records)
    failed = [row for row in checks if row["status"] != "PASS"]
    report = {
        "schema": "quantum-hub.phase-4-r1.refined-proving-hall.source-validation.v2",
        "status": "PASS" if not failed else "FAIL",
        "generatedAt": cfg.GENERATED_AT,
        "blenderVersion": bpy.app.version_string,
        "sourceAuthorities": source_authorities,
        "producerAuthorities": build["producerAuthorities"],
        "preservation": {"signatureSchema": cfg.PRESERVATION_SIGNATURE_SCHEMA, "persistenceVolatileRnaPropertyExclusionAuthority": cfg.PERSISTENCE_VOLATILE_RNA_PROPERTY_EXCLUSION_AUTHORITY, "acceptedCrt": current_crt, "cameraPath": current_camera, "establishingAim": current_establishing},
        "resourceAudit": resources,
        "sourceDirectoryHygiene": hygiene,
        "privateByteScan": byte_scan,
        "livePreflight": live_preflight,
        "auditReports": audit_records,
        "checks": checks,
        "summary": {"total": len(checks), "passed": len(checks) - len(failed), "failed": len(failed), "failedNames": [row["name"] for row in failed]},
        "full540FrameCyclesProductionFilmStarted": False,
        "full540FrameCyclesProductionFilmResumed": False,
        "refinedPhysicalMediaRuntimeIntegrationStarted": False,
        "chromeStatePolicyImplementationEvidenced": True,
        "humanAccepted": False,
        "phase5Authorized": False,
        "reusedRecoveredOldVisualEvidence": False,
        "authorization": cfg.AUTHORIZATION,
    }
    cfg.VALIDATION_REPORT.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"QH_PHASE4R1_REFINED_VALIDATION_REPORT={cfg.VALIDATION_REPORT}")
    print(f"QH_PHASE4R1_REFINED_VALIDATION_STATUS={report['status']}")
    if report["status"] != "PASS":
        raise RuntimeError(f"refined source validation failed: {report['summary']}")


def main() -> None:
    generated_paths = (cfg.VALIDATION_REPORT, *cfg.AUDIT_REPORTS.values())
    stale = [path.name for path in generated_paths if path.exists()]
    if stale:
        raise RuntimeError(f"refusing to overwrite stale refined validation/audit reports: {stale}")
    try:
        validate_transaction()
    except BaseException:
        for path in generated_paths:
            if path.is_file() and path.parent.resolve() == cfg.SOURCE_DIR.resolve():
                path.unlink()
        raise


if __name__ == "__main__":
    main()
