"""Refresh diagnostic hashes after pixel-preserving PNG metadata sanitation."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
SCRIPT = Path(__file__).resolve()
PACKAGE = SCRIPT.parents[1]
MANIFESTS = PACKAGE / "manifests"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def refresh_file_record(record: dict) -> None:
    path = PACKAGE / record["package_relative_path"]
    if not path.is_file():
        raise FileNotFoundError(path)
    record["bytes"] = path.stat().st_size
    record["sha256"] = sha256(path)


def main() -> None:
    sanitation_path = MANIFESTS / "png-metadata-sanitization.json"
    sanitation = json.loads(sanitation_path.read_text(encoding="utf-8"))
    sanitized = {
        record["package_relative_path"]: record
        for record in sanitation["records"]
    }

    render_path = MANIFESTS / "crt-refinement-diagnostic-render-manifest.json"
    render = json.loads(render_path.read_text(encoding="utf-8"))
    refresh_file_record(render["source"])
    for record in render["records"]:
        refresh_file_record(record)
        sanitation_record = sanitized.get(record["package_relative_path"])
        if sanitation_record is None:
            raise RuntimeError(f"Missing sanitizer record: {record['package_relative_path']}")
        if sanitation_record["after_sha256"] != record["sha256"]:
            raise RuntimeError(f"Sanitizer/hash mismatch: {record['package_relative_path']}")
        record["png_metadata_sanitized"] = True
        record["pixels_preserved"] = bool(sanitation_record["pixels_preserved"])
    render["png_sanitizer"] = {
        "package_relative_path": sanitation_path.relative_to(PACKAGE).as_posix(),
        "bytes": sanitation_path.stat().st_size,
        "sha256": sha256(sanitation_path),
    }
    render_path.write_text(json.dumps(render, indent=2) + "\n", encoding="utf-8")

    sheet_path = MANIFESTS / "crt-refinement-diagnostic-sheet-manifest.json"
    if sheet_path.is_file():
        sheet = json.loads(sheet_path.read_text(encoding="utf-8"))
        refresh_file_record(sheet["sheet"])
        for record in sheet["source_frames"]:
            refresh_file_record(record)
        sheet["png_sanitizer"] = {
            "package_relative_path": sanitation_path.relative_to(PACKAGE).as_posix(),
            "bytes": sanitation_path.stat().st_size,
            "sha256": sha256(sanitation_path),
        }
        sheet_path.write_text(json.dumps(sheet, indent=2) + "\n", encoding="utf-8")

    print("QH_PHASE04_CRT_DIAGNOSTIC_AUTHORITIES=REFRESHED")
    print(f"QH_PHASE04_CRT_DIAGNOSTIC_RECORDS={len(render['records'])}")


if __name__ == "__main__":
    main()
