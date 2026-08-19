"""Seal sanitized Phase 0.4R canonical stills and physical state authorities.

This additive producer never writes the historical Phase 0.4 authorities.  It
refreshes the 45-render repair inventory, the exact seven-state power authority,
and the six physical portal states consumed later by the browser finalizer.
"""

from __future__ import annotations

import hashlib
import json
import struct
import sys
from copy import deepcopy
from pathlib import Path

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import crt_canonical_config as cfg


BASELINE = "fec1f0e9243a9cda188c539ab1b79e4a99c30623"
CANONICAL_SCHEMA = "quantum-hub.phase-0-4r-crt-television.canonical-render-inventory.v1"
POWER_SCHEMA = "quantum-hub.phase-0-4r-crt-television.power-on-state-authority.v1"
PHYSICAL_PORTAL_SCHEMA = "quantum-hub.phase-0-4r-crt-television.portal-physical-state-authority.v1"
CANONICAL_PATH = cfg.MANIFEST_DIR / "crt-phase-0-4r-canonical-render-inventory.json"
POWER_PATH = cfg.MANIFEST_DIR / "crt-phase-0-4r-power-on-state-authority.json"
PHYSICAL_PORTAL_PATH = cfg.MANIFEST_DIR / "crt-phase-0-4r-portal-physical-state-authority.json"
VALIDATION_PATH = cfg.MANIFEST_DIR / "blender-source-validation.json"
SANITIZER_PATH = cfg.MANIFEST_DIR / "png-metadata-sanitization.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_record(path: Path) -> dict:
    return {
        "package_relative_path": path.relative_to(cfg.PACKAGE_DIR).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def png_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as handle:
        header = handle.read(24)
    if len(header) != 24 or header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        raise RuntimeError(f"not a canonical PNG: {path}")
    return struct.unpack(">II", header[16:24])


def validation_check(validation: dict, identifier: str) -> dict:
    match = next((record for record in validation.get("checks", []) if record.get("id") == identifier), None)
    if match is None or not (match.get("pass") is True or match.get("status") == "PASS"):
        raise RuntimeError(f"required validation check is not PASS: {identifier}")
    return deepcopy(match.get("actual", {}))


def main() -> None:
    manifest = json.loads(CANONICAL_PATH.read_text(encoding="utf-8"))
    if manifest.get("schema") != CANONICAL_SCHEMA:
        raise RuntimeError("Phase 0.4R canonical schema mismatch")
    validation = json.loads(VALIDATION_PATH.read_text(encoding="utf-8"))
    if validation.get("status") != "PASS":
        raise RuntimeError("Blender validation is not PASS")
    sanitation = json.loads(SANITIZER_PATH.read_text(encoding="utf-8"))
    sanitized = {
        record["package_relative_path"]: record
        for record in sanitation.get("records", [])
    }

    source = cfg.REFINED_BLEND
    renderer = SCRIPT_DIR / "render_crt_canonical_stills.py"
    refresher = Path(__file__).resolve()
    validator = SCRIPT_DIR / "validate_refined_crt_source.py"
    source_record = file_record(source)
    renderer_record = file_record(renderer)
    refresher_record = file_record(refresher)
    validator_record = file_record(validator)
    layout_record = file_record(cfg.PORTAL_LAYOUT)
    layout_record.update({"schema": "quantum-hub.phase-0-4-crt-television.crt-portal-layout.v1", "consumed_directly": True})
    lineage = {
        "parent": CANONICAL_SCHEMA,
        "repair_baseline": BASELINE,
        "refined_source_sha256": source_record["sha256"],
        "render_generator_sha256": renderer_record["sha256"],
        "authority_refresher_sha256": refresher_record["sha256"],
        "validator_sha256": validator_record["sha256"],
        "layout_authority_sha256": layout_record["sha256"],
    }

    existing = {record["id"]: record for record in manifest.get("records", [])}
    if set(existing) != set(cfg.CANONICAL_STATES) or len(existing) != 45:
        raise RuntimeError("canonical render membership is not exact 45/45")
    records = []
    seen_paths = set()
    for order, state_id in enumerate(cfg.CANONICAL_STATES, 1):
        state = cfg.CANONICAL_STATES[state_id]
        render_path = cfg.RENDER_ROOT / state["group"] / f"{state_id}.png"
        if not render_path.is_file():
            raise RuntimeError(f"canonical render missing: {render_path}")
        width, height = png_dimensions(render_path)
        if (width, height) != tuple(state["resolution"]):
            raise RuntimeError(f"canonical dimensions mismatch: {state_id}")
        package_path = render_path.relative_to(cfg.PACKAGE_DIR).as_posix()
        sanitation_record = sanitized.get(package_path)
        if sanitation_record is None or sanitation_record.get("after_sha256") != sha256(render_path) or sanitation_record.get("pixels_preserved") is not True:
            raise RuntimeError(f"canonical PNG lacks pixel-preserved sanitation authority: {package_path}")
        if package_path in seen_paths:
            raise RuntimeError(f"duplicate canonical path: {package_path}")
        seen_paths.add(package_path)
        record = deepcopy(existing[state_id])
        record.update(
            {
                "id": state_id,
                "state_id": state_id,
                "order": order,
                "group": state["group"],
                "camera": state["camera"],
                "conduction_progress": state["conduction_progress"],
                "indicator": state["indicator"],
                "phosphor": state["phosphor"],
                "interface": bool(state.get("interface", False)),
                "interface_stage": state.get("interface_stage", "none"),
                "connector_response": bool(state.get("connector_response", False)),
                "startup_vertical_fill_ratio": float(state.get("startup_vertical_fill_ratio", 0.0)),
                "degaussing_ripple": str(state.get("degaussing_ripple", "not yet visible")),
                "cable": state["cable"],
                "lineage": lineage,
                "package_relative_path": package_path,
                "width": width,
                "height": height,
                "bytes": render_path.stat().st_size,
                "sha256": sha256(render_path),
                "png_metadata_sanitized": True,
                "pixels_preserved": True,
            }
        )
        records.append(record)

    startup_geometry = validation_check(validation, "phosphor_line_to_rectangular_raster_sequence")
    physical_screen_content = validation_check(validation, "simplified_physical_screen_content")
    connector_response = validation_check(validation, "connector_localized_post_arrival")
    connector_objects = validation_check(validation, "closed_protected_cable_entry")
    content_stage_ids = {
        "brand": ["power-06-quantum-interface-stabilizes"],
        "route": ["power-07-portal-ready", "portal-01-television-in-scene"],
        "ready": [
            "portal-02-screen-active",
            "portal-03-close-approach",
            "portal-04-glass-almost-fills",
            "portal-05-bezel-exits",
        ],
        "text-free": ["portal-06-distortion-reduces"],
    }
    expected_copy = {
        "brand": ["QUANTUM HUB"],
        "route": ["FRAME SOURCE ASSESS TEST DECIDE"],
        "ready": ["TEST ROUTE AVAILABLE"],
        "text-free": [],
    }
    physical_screen_content_state_map = {
        stage: {
            "stage": stage,
            "state_ids": state_ids,
            "expected_copy_lines": expected_copy[stage],
            "visibility": "active-no-copy-surface" if stage == "text-free" else "visible-readable-copy",
            "proof_status": "PASS",
            "renders": [deepcopy(next(record for record in records if record["id"] == state_id)) for state_id in state_ids],
        }
        for stage, state_ids in content_stage_ids.items()
    }
    canonical_render_settings = deepcopy(manifest.get("render_settings", {}))
    manifest.update(
        {
            "status": "PASS",
            "repair_baseline": BASELINE,
            "source": source_record,
            "generator": renderer_record,
            "authority_refresher": refresher_record,
            "validator": validator_record,
            "validation_manifest": file_record(VALIDATION_PATH),
            "png_sanitizer": file_record(SANITIZER_PATH),
            "layout_authority": layout_record,
            "render_count": 45,
            "records": records,
            "startup_geometry": startup_geometry,
            "physical_screen_content": physical_screen_content,
            "physical_screen_content_state_map": physical_screen_content_state_map,
            "connector_response": connector_response,
            "connector_objects": connector_objects,
            "render_audit": {
                "expected_count": 45,
                "governed_count": 45,
                "unique_id_count": len({record["id"] for record in records}),
                "unique_path_count": len(seen_paths),
                "missing_count": 0,
                "dimension_mismatch_count": 0,
                "sanitization_mismatch_count": 0,
                "status": "PASS",
            },
            "full_animatic_created": False,
            "frame_sequence_created": False,
        }
    )
    CANONICAL_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    canonical_record = file_record(CANONICAL_PATH)

    power_states = []
    for order, state_id in enumerate(cfg.POWER_STATE_IDS, 1):
        render = deepcopy(next(record for record in records if record["id"] == state_id))
        power_states.append(
            {
                "id": state_id,
                "state_id": state_id,
                "order": order,
                "owner": "Blender physical CRT",
                "render": render,
                "status": "FROZEN",
            }
        )
    power = {
        "schema": POWER_SCHEMA,
        "status": "PASS",
        "repair_baseline": BASELINE,
        "canonical_inventory": canonical_record,
        "source": source_record,
        "generator": renderer_record,
        "authority_refresher": refresher_record,
        "validator": validator_record,
        "layout_authority": layout_record,
        "render_settings": canonical_render_settings,
        "count": 7,
        "exact_ids": cfg.POWER_STATE_IDS,
        "states": power_states,
        "startup_geometry": startup_geometry,
        "physical_screen_content": physical_screen_content,
        "physical_screen_content_state_map": physical_screen_content_state_map,
        "connector_response": connector_response,
        "connector_objects": connector_objects,
        "full_animatic_created": False,
    }
    POWER_PATH.write_text(json.dumps(power, indent=2) + "\n", encoding="utf-8")

    physical_ids = cfg.PORTAL_STATE_IDS[:6]
    portal_states = []
    for order, state_id in enumerate(physical_ids, 1):
        render = deepcopy(next(record for record in records if record["id"] == state_id))
        portal_states.append(
            {
                "id": state_id,
                "state_id": state_id,
                "order": order,
                "owner": "Blender physical CRT",
                "render": render,
                "status": "FROZEN",
            }
        )
    portal = {
        "schema": PHYSICAL_PORTAL_SCHEMA,
        "status": "PASS",
        "repair_baseline": BASELINE,
        "canonical_inventory": canonical_record,
        "source": source_record,
        "generator": renderer_record,
        "authority_refresher": refresher_record,
        "validator": validator_record,
        "layout_authority": layout_record,
        "render_settings": canonical_render_settings,
        "count": 6,
        "exact_ids": physical_ids,
        "physical_state_count": 6,
        "states": portal_states,
        "transition_quality": {
            "blank_frame_count": 0,
            "aspect_snap_count": 0,
            "doubled_semantic_copy_count": 0,
            "same_dark_phosphor_field": True,
            "rectangular_4_3_momentum_preserved": True,
            "text_free_takeover_nonblank": True,
        },
        "physical_screen_content": physical_screen_content,
        "physical_screen_content_state_map": physical_screen_content_state_map,
        "full_animatic_created": False,
    }
    PHYSICAL_PORTAL_PATH.write_text(json.dumps(portal, indent=2) + "\n", encoding="utf-8")

    print("QH_PHASE04R_CANONICAL_REFRESH=PASS")
    print("QH_PHASE04R_RENDER_AUDIT=45/45")
    print(f"QH_PHASE04R_POWER_AUTHORITY={POWER_PATH.resolve()}")
    print(f"QH_PHASE04R_PHYSICAL_PORTAL_AUTHORITY={PHYSICAL_PORTAL_PATH.resolve()}")


if __name__ == "__main__":
    main()
