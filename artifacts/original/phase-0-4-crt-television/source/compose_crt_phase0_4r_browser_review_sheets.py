"""Compose only the additive Phase 0.4R browser review sheets 10–16.

This entry point reuses the accepted native-pixel Phase 0.4 sheet renderer but
rebinds every mutable authority to the additive Phase 0.4R evidence family.
It refuses to write until the normalized 46/36 matrix, the final ordered 8/8
portal authority, and the finalizer-produced composition inputs agree exactly.
The historical Phase 0.4 compositor, evidence and composition manifest are
read-only and remain byte-identical.
"""

from __future__ import annotations

import contextlib
import hashlib
import importlib.util
import io
import json
import sys
from pathlib import Path
from typing import Any

sys.dont_write_bytecode = True

SCRIPT = Path(__file__).resolve()
PACKAGE = SCRIPT.parents[1]
ROOT = SCRIPT.parents[4]
PACKAGE_RELATIVE = "artifacts/original/phase-0-4-crt-television"
EVIDENCE_RELATIVE = "artifacts/evidence/phase-0-4r-crt-television"
PLAN_RELATIVE = "prototypes/phase-0-4r-crt-portal-qa/capture-plan.json"
SNAPSHOT_RELATIVE = f"{EVIDENCE_RELATIVE}/capture-plan-authority.json"
MATRIX_RELATIVE = f"{EVIDENCE_RELATIVE}/browser-matrix-report.json"
INPUTS_RELATIVE = f"{EVIDENCE_RELATIVE}/browser-review-composition-inputs.json"
PORTAL_RELATIVE = f"{PACKAGE_RELATIVE}/manifests/crt-phase-0-4r-portal-transition-state-authority.json"
KEEP_OUT_RELATIVE = f"{PACKAGE_RELATIVE}/manifests/crt-scene-source-keepouts.json"
LAYOUT_RELATIVE = f"{PACKAGE_RELATIVE}/crt-portal-layout.json"
OUTPUT_RELATIVE = f"{PACKAGE_RELATIVE}/manifests/phase-0-4r-browser-review-composition-manifest.json"

HISTORICAL_COMPOSITOR_RELATIVE = (
    f"{PACKAGE_RELATIVE}/source/compose_crt_browser_review_sheets.py"
)
HISTORICAL_OUTPUT_RELATIVE = (
    f"{PACKAGE_RELATIVE}/manifests/browser-review-composition-manifest.json"
)

PLAN_SCHEMA = "quantum-hub.phase-0-4r-crt-television.typography-capture-plan.v1"
MATRIX_SCHEMA = "quantum-hub.phase-0-4r-crt-television.typography-collision-matrix.v1"
INPUTS_SCHEMA = "quantum-hub.phase-0-4r-crt-television.browser-review-composition-inputs.v1"
PORTAL_SCHEMA = "quantum-hub.phase-0-4r-crt-television.portal-transition-state-authority.v1"
OUTPUT_SCHEMA = "quantum-hub.phase-0-4r-crt-television.browser-review-composition.v1"

PORTAL_IDS = (
    "portal-01-television-in-scene",
    "portal-02-screen-active",
    "portal-03-close-approach",
    "portal-04-glass-almost-fills",
    "portal-05-bezel-exits",
    "portal-06-distortion-reduces",
    "portal-07-dom-takes-ownership",
    "portal-08-full-semantic-surface",
)

OUTPUTS = (
    (10, "crt-portal-transition-sheet.png"),
    (11, "crt-physical-dom-alignment-sheet.png"),
    (12, "crt-desktop-hero-composition.png"),
    (13, "crt-mobile-hero-composition.png"),
    (14, "crt-text-zoom-and-fallback.png"),
    (15, "crt-reduced-motion-desktop.png"),
    (16, "crt-reduced-motion-mobile.png"),
)

SHEET_11_AUTHORITIES = (
    "source-physical-portal-close",
    "source-text-free-portal-takeover",
    "crt-portal-layout.json",
)


def repo_path(relative: str) -> Path:
    normalized = str(relative).replace("\\", "/")
    if not normalized or normalized.startswith("/") or "../" in normalized:
        raise RuntimeError(f"Unsafe repository-relative path: {relative}")
    resolved = (ROOT / normalized).resolve()
    try:
        resolved.relative_to(ROOT)
    except ValueError as error:
        raise RuntimeError(f"Path escapes repository root: {relative}") from error
    return resolved


def digest_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def file_bytes(relative: str) -> bytes:
    path = repo_path(relative)
    if not path.is_file():
        raise RuntimeError(f"Missing required Phase 0.4R authority: {relative}")
    return path.read_bytes()


def read_json(relative: str) -> tuple[dict[str, Any], bytes]:
    raw = file_bytes(relative)
    return json.loads(raw.decode("utf-8")), raw


def record_path(record: dict[str, Any]) -> str:
    return str(
        record.get("repository_relative_path")
        or record.get("relative_path")
        or record.get("path")
        or record.get("file")
        or ""
    ).replace("\\", "/")


def record_sha(record: dict[str, Any]) -> str:
    return str(record.get("sha256") or record.get("hash") or "").lower()


def record_bytes(record: dict[str, Any]) -> int:
    return int(record.get("bytes", record.get("size", -1)))


def validate_repository_record(
    record: dict[str, Any], expected_path: str, label: str
) -> bytes:
    if record_path(record) != expected_path:
        raise RuntimeError(
            f"{label} path differs: {record_path(record)!r} != {expected_path!r}"
        )
    raw = file_bytes(expected_path)
    if record_bytes(record) != len(raw) or record_sha(record) != digest_bytes(raw):
        raise RuntimeError(f"{label} byte/hash authority differs: {expected_path}")
    return raw


def capture_of(record: dict[str, Any]) -> dict[str, Any]:
    return record.get("capture") or record.get("render") or record


def normalized_capture(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "path": record_path(record),
        "width": int(record.get("width", -1)),
        "height": int(record.get("height", -1)),
        "bytes": record_bytes(record),
        "sha256": record_sha(record),
    }


def validate_inputs() -> dict[str, Any]:
    plan, plan_raw = read_json(PLAN_RELATIVE)
    snapshot, snapshot_raw = read_json(SNAPSHOT_RELATIVE)
    matrix, matrix_raw = read_json(MATRIX_RELATIVE)
    portal, portal_raw = read_json(PORTAL_RELATIVE)
    inputs, _ = read_json(INPUTS_RELATIVE)

    if plan.get("schema") != PLAN_SCHEMA or plan.get("status") not in {"ready-for-capture", "PASS"}:
        raise RuntimeError("Mutable Phase 0.4R plan is neither released nor final PASS")
    if snapshot.get("schema") != PLAN_SCHEMA or snapshot.get("status") != "ready-for-capture":
        raise RuntimeError("Phase 0.4R ready-plan snapshot is not the acyclic capture authority")
    if plan.get("status") == "ready-for-capture" and plan_raw != snapshot_raw:
        raise RuntimeError("Mutable Phase 0.4R plan differs from the released ready-plan snapshot")
    if plan.get("status") == "PASS":
        snapshot_binding = plan.get("browserFinalization", {}).get("captureAuthoritySnapshot", {})
        if (
            record_path(snapshot_binding) != SNAPSHOT_RELATIVE
            or snapshot_binding.get("expectedSchema") != PLAN_SCHEMA
        ):
            raise RuntimeError("Final PASS plan does not preserve the released ready-plan snapshot authority")
    if matrix.get("schema") != MATRIX_SCHEMA:
        raise RuntimeError("Phase 0.4R matrix schema differs")
    cases = matrix.get("cases") or []
    case_ids = [str(item.get("id", "")) for item in cases]
    if len(cases) != 46 or len(set(case_ids)) != 46:
        raise RuntimeError("Phase 0.4R matrix is not 46 unique cases")
    if not all(
        item.get("runner", {}).get("pass") is True
        and item.get("report", {}).get("pass") is True
        for item in cases
    ):
        raise RuntimeError("Phase 0.4R matrix contains a failing browser case")
    captured = [item for item in cases if (item.get("capture") or {}).get("path")]
    if len(captured) != 36:
        raise RuntimeError(f"Phase 0.4R matrix has {len(captured)}/36 normalized captures")
    for item in captured:
        capture = item["capture"]
        relative = record_path(capture)
        expected_prefix = f"{EVIDENCE_RELATIVE}/captures/normalized/"
        if not relative.startswith(expected_prefix) or not relative.endswith(".png"):
            raise RuntimeError(f"Matrix capture is outside normalized Phase 0.4R evidence: {relative}")
        validate_repository_record(capture, relative, f"matrix capture {item['id']}")

    matrix_binding = matrix.get("capturePlanAuthority") or matrix.get("plan") or {}
    if record_path(matrix_binding) != PLAN_RELATIVE:
        raise RuntimeError("Matrix does not preserve the logical additive capture-plan path")
    if record_bytes(matrix_binding) != len(snapshot_raw) or record_sha(matrix_binding) != digest_bytes(snapshot_raw):
        raise RuntimeError("Matrix does not bind the exact acyclic ready-plan snapshot bytes")

    portal_records = portal.get("records") or portal.get("states") or []
    if (
        portal.get("schema") != PORTAL_SCHEMA
        or portal.get("status") != "PASS"
        or len(portal_records) != 8
        or tuple(item.get("id") for item in portal_records) != PORTAL_IDS
    ):
        raise RuntimeError("Final Phase 0.4R portal authority is not exact ordered PASS 8/8")
    for item in portal_records:
        capture = capture_of(item)
        relative = record_path(capture)
        validate_repository_record(capture, relative, f"portal state {item.get('id')}")

    if (
        inputs.get("schema") != INPUTS_SCHEMA
        or inputs.get("status") != "READY_FOR_CREATIVE_COMPOSITION"
    ):
        raise RuntimeError("Phase 0.4R browser composition inputs are not ready")
    validate_repository_record(
        inputs.get("capturePlanAuthority") or {},
        SNAPSHOT_RELATIVE,
        "composition-input ready-plan snapshot",
    )
    validate_repository_record(
        inputs.get("browserMatrix") or {},
        MATRIX_RELATIVE,
        "composition-input matrix",
    )
    validate_repository_record(
        inputs.get("portalTransitionStateAuthority") or {},
        PORTAL_RELATIVE,
        "composition-input portal authority",
    )

    sheets = inputs.get("sheets") or []
    actual_roster = [
        (int(sheet.get("reviewIndex", -1)), str(sheet.get("filename", "")))
        for sheet in sheets
    ]
    if actual_roster != list(OUTPUTS):
        raise RuntimeError("Composition-input sheet 10–16 roster/order differs")
    cases_by_id = {item["id"]: item for item in cases}
    portal_by_id = {item["id"]: item for item in portal_records}
    planned_by_index = {
        int(item["reviewIndex"]): item
        for item in (plan.get("browserDerivedReviewSheets") or [])
    }

    for sheet in sheets:
        index = int(sheet["reviewIndex"])
        sources = sheet.get("sources") or []
        if index == 10:
            if sheet.get("stateIds") != list(PORTAL_IDS) or len(sources) != 8:
                raise RuntimeError("Portal sheet input does not bind exact states 1–8")
            for source, state_id in zip(sources, PORTAL_IDS, strict=True):
                expected = capture_of(portal_by_id[state_id])
                if source.get("stateId") != state_id or normalized_capture(source) != normalized_capture(expected):
                    raise RuntimeError(f"Portal sheet input differs at {state_id}")
        else:
            planned = planned_by_index.get(index)
            if not planned or sheet.get("sourceCaseIds") != planned.get("sourceCaseIds"):
                raise RuntimeError(f"Browser sheet {index} case roster differs from final plan")
            case_roster = sheet.get("sourceCaseIds") or []
            if len(sources) != len(case_roster):
                raise RuntimeError(f"Browser sheet {index} source count differs")
            for source, case_id in zip(sources, case_roster, strict=True):
                expected = (cases_by_id.get(case_id) or {}).get("capture") or {}
                if source.get("captureId") != case_id or normalized_capture(source) != normalized_capture(expected):
                    raise RuntimeError(f"Browser sheet {index} source differs: {case_id}")
        authorities = tuple(sheet.get("additionalAuthorities") or [])
        expected_authorities = SHEET_11_AUTHORITIES if index == 11 else ()
        if authorities != expected_authorities:
            raise RuntimeError(f"Browser sheet {index} additional-authority roster differs")

    return {
        "matrix": matrix,
        "matrix_raw": matrix_raw,
        "portal": portal,
        "portal_raw": portal_raw,
        "inputs": inputs,
    }


def load_renderer() -> Any:
    historical = repo_path(HISTORICAL_COMPOSITOR_RELATIVE)
    specification = importlib.util.spec_from_file_location(
        "quantum_hub_phase04_native_sheet_renderer", historical
    )
    if specification is None or specification.loader is None:
        raise RuntimeError("Accepted native-pixel sheet renderer cannot be loaded")
    module = importlib.util.module_from_spec(specification)
    sys.modules[specification.name] = module
    specification.loader.exec_module(module)
    return module


def validate_output(
    inputs: dict[str, Any], matrix: dict[str, Any]
) -> tuple[bytes, dict[str, Any]]:
    manifest, raw = read_json(OUTPUT_RELATIVE)
    if manifest.get("schema") != OUTPUT_SCHEMA or manifest.get("status") != "PASS":
        raise RuntimeError("Additive browser composition manifest is not PASS")
    records = manifest.get("records") or []
    roster = [
        (int(record.get("reviewIndex", -1)), str(record.get("filename", "")))
        for record in records
    ]
    if roster != list(OUTPUTS):
        raise RuntimeError("Additive browser composition output roster/order differs")
    if manifest.get("exact_output_roster") != [list(item) for item in OUTPUTS]:
        raise RuntimeError("Additive browser composition exact output roster differs")
    expected_sheets = {int(sheet["reviewIndex"]): sheet for sheet in inputs.get("sheets") or []}
    matrix_sources = {
        str(source.get("id", "")): source
        for source in (matrix.get("sceneSources") or matrix.get("scene_sources") or [])
    }
    for record in records:
        index = int(record["reviewIndex"])
        filename = str(record["filename"])
        validate_repository_record(record, f"{PACKAGE_RELATIVE}/{filename}", f"review sheet {index}")
        expected = expected_sheets[index]
        if not record.get("sources"):
            raise RuntimeError(f"Review sheet {index} has no governed source records")
        if record.get("sources") != expected.get("sources"):
            raise RuntimeError(f"Review sheet {index} source lineage differs from frozen inputs")
        if index > 10 and record.get("sourceCaseIds") != expected.get("sourceCaseIds"):
            raise RuntimeError(f"Review sheet {index} case lineage differs from frozen inputs")
        if index == 11:
            actual_authorities = record.get("additionalAuthorities") or []
            if len(actual_authorities) != 3:
                raise RuntimeError("Sheet 11 does not emit three resolved additional authorities")
            expected_authorities: list[dict[str, Any]] = []
            for source_id in SHEET_11_AUTHORITIES[:2]:
                source = matrix_sources.get(source_id)
                if not source:
                    raise RuntimeError(f"Matrix omits sheet-11 source authority: {source_id}")
                expected_authorities.append(
                    {
                        "sourceId": source_id,
                        "path": record_path(source),
                        "width": int(source.get("width", -1)),
                        "height": int(source.get("height", -1)),
                        "bytes": record_bytes(source),
                        "sha256": record_sha(source),
                    }
                )
            layout_raw = file_bytes(LAYOUT_RELATIVE)
            expected_authorities.append(
                {
                    "path": LAYOUT_RELATIVE,
                    "bytes": len(layout_raw),
                    "sha256": digest_bytes(layout_raw),
                }
            )
            if actual_authorities != expected_authorities:
                raise RuntimeError("Sheet 11 resolved additional authorities differ")
    return raw, manifest


def main() -> None:
    authorities = validate_inputs()
    protected_before = {
        relative: digest_bytes(file_bytes(relative))
        for relative in (HISTORICAL_COMPOSITOR_RELATIVE, HISTORICAL_OUTPUT_RELATIVE)
    }

    renderer = load_renderer()
    renderer.SCRIPT = SCRIPT
    renderer.PACKAGE = PACKAGE
    renderer.ROOT = ROOT
    renderer.PACKAGE_RELATIVE = PACKAGE_RELATIVE
    renderer.EVIDENCE_RELATIVE = EVIDENCE_RELATIVE
    renderer.PLAN_RELATIVE = PLAN_RELATIVE
    renderer.MATRIX_RELATIVE = MATRIX_RELATIVE
    renderer.PORTAL_RELATIVE = PORTAL_RELATIVE
    renderer.KEEP_OUT_RELATIVE = KEEP_OUT_RELATIVE
    renderer.LAYOUT_RELATIVE = LAYOUT_RELATIVE
    renderer.OUTPUT_RELATIVE = OUTPUT_RELATIVE
    renderer.MATRIX_SCHEMA = MATRIX_SCHEMA
    renderer.PORTAL_SCHEMA = PORTAL_SCHEMA
    renderer.OUTPUT_SCHEMA = OUTPUT_SCHEMA
    renderer.PORTAL_IDS = PORTAL_IDS
    renderer.OUTPUTS = OUTPUTS

    accepted_contact_sheet = renderer.native_contact_sheet

    def phase04r_contact_sheet(
        sources: list[Any],
        columns: int,
        eyebrow: str,
        title: str,
        subtitle: str,
        footer: str,
    ) -> Any:
        rendered = accepted_contact_sheet(
            sources,
            columns,
            eyebrow.replace("PHASE 0.4 /", "PHASE 0.4R /"),
            title,
            subtitle,
            footer,
        )
        if eyebrow == "PHASE 0.4 / REDUCED MOTION MOBILE" and rendered.width < 1200:
            widened = renderer.Image.new("RGB", (1200, rendered.height), renderer.BG)
            widened.paste(rendered, ((1200 - rendered.width) // 2, 0))
            return widened
        return rendered

    renderer.native_contact_sheet = phase04r_contact_sheet
    with contextlib.redirect_stdout(io.StringIO()):
        renderer.main()

    generated, _ = read_json(OUTPUT_RELATIVE)
    generated["exact_output_roster"] = [list(item) for item in OUTPUTS]
    generated["capture_plan_authority"] = renderer.json_record(
        SNAPSHOT_RELATIVE, PLAN_SCHEMA
    )
    generated["composition_inputs"] = renderer.json_record(
        INPUTS_RELATIVE, INPUTS_SCHEMA
    )
    generated["additive_phase"] = "Phase 0.4R"
    generated["historical_phase_0_4_authorities_modified"] = False
    output_target = repo_path(OUTPUT_RELATIVE)
    output_target.write_text(
        json.dumps(generated, indent=2) + "\n", encoding="utf-8"
    )

    manifest_raw, manifest = validate_output(authorities["inputs"], authorities["matrix"])
    for relative, before in protected_before.items():
        if digest_bytes(file_bytes(relative)) != before:
            raise RuntimeError(f"Historical Phase 0.4 file changed: {relative}")

    print("QH_PHASE04R_BROWSER_REVIEW_SHEETS=7")
    print(f"QH_PHASE04R_BROWSER_REVIEW_MANIFEST_SHA256={digest_bytes(manifest_raw)}")
    print(f"QH_PHASE04R_BROWSER_REVIEW_OUTPUT={OUTPUT_RELATIVE}")
    print(f"QH_PHASE04R_BROWSER_MATRIX_SHA256={digest_bytes(authorities['matrix_raw'])}")
    print(f"QH_PHASE04R_PORTAL_AUTHORITY_SHA256={digest_bytes(authorities['portal_raw'])}")
    print(f"QH_PHASE04R_BROWSER_REVIEW_RECORDS={len(manifest.get('records') or [])}")


def static_check() -> None:
    if not EVIDENCE_RELATIVE.endswith("phase-0-4r-crt-television"):
        raise RuntimeError("Additive compositor evidence root is not Phase 0.4R")
    if OUTPUT_RELATIVE == HISTORICAL_OUTPUT_RELATIVE:
        raise RuntimeError("Additive compositor would overwrite the historical manifest")
    if [index for index, _ in OUTPUTS] != list(range(10, 17)):
        raise RuntimeError("Additive compositor output indices are not exact 10–16")
    if len({filename for _, filename in OUTPUTS}) != 7:
        raise RuntimeError("Additive compositor output filenames are not unique")
    if tuple(SHEET_11_AUTHORITIES) != (
        "source-physical-portal-close",
        "source-text-free-portal-takeover",
        "crt-portal-layout.json",
    ):
        raise RuntimeError("Sheet-11 authority roster differs")
    renderer = load_renderer()
    for name in ("main", "native_contact_sheet", "json_record"):
        if not callable(getattr(renderer, name, None)):
            raise RuntimeError(f"Accepted native-pixel renderer omits callable {name}")
    print("QH_PHASE04R_BROWSER_COMPOSITOR_STATIC=PASS")
    print(f"QH_PHASE04R_BROWSER_COMPOSITOR_OUTPUT={OUTPUT_RELATIVE}")
    print("QH_PHASE04R_BROWSER_COMPOSITOR_SHEETS=10,11,12,13,14,15,16")


if __name__ == "__main__":
    if "--static-check" in sys.argv[1:]:
        static_check()
    else:
        main()
