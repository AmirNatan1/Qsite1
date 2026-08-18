"""Reconcile sanitized Phase 0.4 CRT still bytes with canonical state authorities."""

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


CANONICAL_SCHEMA = "quantum-hub.phase-0-4-crt-television.canonical-still-render-inventory.v1"
POWER_SCHEMA = "quantum-hub.phase-0-4-crt-television.power-on-state-authority.v1"
PORTAL_SCHEMA = "quantum-hub.phase-0-4-crt-television.portal-transition-state-authority.v1"
CANONICAL_PATH = cfg.MANIFEST_DIR / "crt-canonical-render-manifest.json"
POWER_PATH = cfg.MANIFEST_DIR / "crt-power-on-state-authority.json"
PORTAL_PATH = cfg.MANIFEST_DIR / "crt-portal-transition-state-authority.json"


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


def main() -> None:
    manifest = json.loads(CANONICAL_PATH.read_text(encoding="utf-8"))
    if manifest.get("schema") != CANONICAL_SCHEMA:
        raise RuntimeError("canonical render schema mismatch")

    source = cfg.REFINED_BLEND
    renderer = SCRIPT_DIR / "render_crt_canonical_stills.py"
    canonical_config = Path(cfg.__file__).resolve()
    refined_config = Path(cfg.refined.__file__).resolve()
    source_record = file_record(source)
    renderer_record = file_record(renderer)
    canonical_config_record = file_record(canonical_config)
    refined_config_record = file_record(refined_config)
    layout_record = file_record(cfg.PORTAL_LAYOUT)
    layout_record["schema"] = "quantum-hub.phase-0-4-crt-television.crt-portal-layout.v1"
    layout_record["consumed_directly"] = True

    lineage = {
        "parent": CANONICAL_SCHEMA,
        "refined_source_sha256": source_record["sha256"],
        "render_generator_sha256": renderer_record["sha256"],
        "canonical_config_sha256": canonical_config_record["sha256"],
        "refined_config_sha256": refined_config_record["sha256"],
        "layout_authority_sha256": layout_record["sha256"],
    }
    existing = {record["id"]: record for record in manifest.get("records", [])}
    expected_ids = list(cfg.CANONICAL_STATES)
    if set(existing) != set(expected_ids) or len(existing) != 45:
        raise RuntimeError("canonical render record membership changed")

    records = []
    seen_paths = set()
    for order, state_id in enumerate(expected_ids, 1):
        state = cfg.CANONICAL_STATES[state_id]
        record = deepcopy(existing[state_id])
        expected_path = cfg.RENDER_ROOT / state["group"] / f"{state_id}.png"
        if not expected_path.is_file():
            raise RuntimeError(f"canonical render is missing: {expected_path}")
        width, height = png_dimensions(expected_path)
        if [width, height] != list(state["resolution"]):
            raise RuntimeError(
                f"canonical dimensions changed for {state_id}: {(width, height)} / {state['resolution']}"
            )
        package_path = expected_path.relative_to(cfg.PACKAGE_DIR).as_posix()
        if package_path in seen_paths:
            raise RuntimeError(f"duplicate canonical render path: {package_path}")
        seen_paths.add(package_path)
        record.update(
            {
                "id": state_id,
                "order": order,
                "group": state["group"],
                "camera": state["camera"],
                "conduction_progress": state["conduction_progress"],
                "indicator": state["indicator"],
                "phosphor": state["phosphor"],
                "interface": state["interface"],
                "cable": state["cable"],
                "classification": state["classification"],
                "approval_state": state["approval_state"],
                "render_settings": {
                    "engine": state["engine"],
                    "samples": cfg.EEVEE_SAMPLES,
                    "denoising": False,
                    "color_management": cfg.COLOR_MANAGEMENT,
                    "resolution": [width, height],
                },
                "lineage": lineage,
                "package_relative_path": package_path,
                "width": width,
                "height": height,
                "bytes": expected_path.stat().st_size,
                "sha256": sha256(expected_path),
            }
        )
        records.append(record)

    power_records = [deepcopy(next(record for record in records if record["id"] == state_id)) for state_id in cfg.POWER_STATE_IDS]
    portal_records = []
    for order, state_id in enumerate(cfg.PORTAL_STATE_IDS, 1):
        match = next((record for record in records if record["id"] == state_id), None)
        if match is not None:
            portal_records.append(
                {
                    "id": state_id,
                    "order": order,
                    "owner": "Blender physical CRT",
                    "render": deepcopy(match),
                    "lineage": lineage,
                    "status": "FROZEN",
                }
            )
        else:
            portal_records.append(
                {
                    "id": state_id,
                    "order": order,
                    "owner": "repository browser semantic DOM",
                    "render": None,
                    "browser_case_id": "portal-actual--desktop-1440x900",
                    "lineage": lineage,
                    "status": "PENDING_BROWSER_CAPTURE",
                }
            )

    manifest.update(
        {
            "status": "PASS",
            "source": source_record,
            "generator": renderer_record,
            "configuration_authority": [canonical_config_record, refined_config_record],
            "layout_authority": layout_record,
            "render_count": len(records),
            "records": records,
            "power_on_authority": {
                "count": 7,
                "exact_ids": cfg.POWER_STATE_IDS,
                "records": power_records,
                "status": "PASS",
            },
            "portal_transition_authority": {
                "count": 8,
                "exact_ids": cfg.PORTAL_STATE_IDS,
                "records": portal_records,
                "physical_state_count": 6,
                "browser_state_count": 2,
                "status": "PHYSICAL_FROZEN_BROWSER_PENDING",
            },
            "render_audit": {
                "expected_count": 45,
                "governed_count": len(records),
                "unique_id_count": len({record["id"] for record in records}),
                "unique_path_count": len(seen_paths),
                "missing_count": 0,
                "dimension_mismatch_count": 0,
                "status": "PASS",
            },
            "full_animatic_created": False,
        }
    )
    CANONICAL_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    canonical_record = file_record(CANONICAL_PATH)

    power = {
        "schema": POWER_SCHEMA,
        "status": "FROZEN",
        "canonical_inventory": canonical_record,
        "source": source_record,
        "generator": renderer_record,
        "layout_authority": layout_record,
        "render_settings": manifest["render_settings"],
        "count": 7,
        "exact_ids": cfg.POWER_STATE_IDS,
        "records": power_records,
        "full_animatic_created": False,
    }
    portal = {
        "schema": PORTAL_SCHEMA,
        "status": "PHYSICAL_FROZEN_BROWSER_PENDING",
        "canonical_inventory": canonical_record,
        "source": source_record,
        "generator": renderer_record,
        "layout_authority": layout_record,
        "render_settings": manifest["render_settings"],
        "count": 8,
        "exact_ids": cfg.PORTAL_STATE_IDS,
        "physical_state_count": 6,
        "browser_state_count": 2,
        "records": portal_records,
        "full_animatic_created": False,
    }
    POWER_PATH.write_text(json.dumps(power, indent=2) + "\n", encoding="utf-8")
    PORTAL_PATH.write_text(json.dumps(portal, indent=2) + "\n", encoding="utf-8")
    print("QH_PHASE04_CRT_CANONICAL_REFRESH=PASS")
    print(f"QH_PHASE04_CRT_RENDER_AUDIT={len(records)}/45")
    print(f"QH_PHASE04_CRT_POWER_AUTHORITY={POWER_PATH.resolve()}")
    print(f"QH_PHASE04_CRT_PORTAL_AUTHORITY={PORTAL_PATH.resolve()}")


if __name__ == "__main__":
    main()
