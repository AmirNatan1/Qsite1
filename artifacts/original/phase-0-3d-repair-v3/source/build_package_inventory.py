"""Build the self-excluding, intended-commit Phase 0.3 package inventory."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image


SCRIPT = Path(__file__).resolve()
PACKAGE = SCRIPT.parents[1]
REPOSITORY = PACKAGE.parents[2]
OUTPUT = PACKAGE / "manifests" / "package-inventory.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def classification(relative: str) -> tuple[str, str]:
    if relative == "README.md":
        return "Phase 0.3 package documentation", "human repository and feasibility review required"
    if relative == "portal-layout.json":
        return "shared physical and semantic portal layout contract", "human creative and repository review required"
    if relative.startswith("source/") and relative.endswith(".blend"):
        return "editable original Quantum Blender source", "human creative review required"
    if relative.startswith("source/"):
        return "deterministic Phase 0.3 generation and validation tooling", "human repository and feasibility review required"
    if relative.startswith("renders/"):
        return "original Quantum canonical Blender still", "human creative review required"
    if relative.startswith("review/"):
        return "original Quantum human-review evidence", "human creative review required"
    if relative.startswith("manifests/"):
        return "machine-readable Phase 0.3 provenance and validation evidence", "human repository and feasibility review required"
    raise RuntimeError(f"Unclassified Phase 0.3 package file: {relative}")


def main() -> None:
    records = []
    total_bytes = 0
    for path in sorted(item for item in PACKAGE.rglob("*") if item.is_file() and item != OUTPUT):
        relative = path.relative_to(PACKAGE).as_posix()
        category, approval = classification(relative)
        size = path.stat().st_size
        total_bytes += size
        record = {
                "package_relative_path": relative,
                "repository_relative_path": path.relative_to(REPOSITORY).as_posix(),
                "bytes": size,
                "sha256": sha256(path),
                "classification": category,
                "approval_state": approval,
                "intendedCommit": True,
            }
        if path.suffix.lower() == ".png":
            with Image.open(path) as opened:
                record["width"], record["height"] = opened.size
        records.append(record)

    manifest = {
        "schema": "quantum-hub.phase-0-3d-repair-v3.package-inventory.v1",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "scope": "artifacts/original/phase-0-3d-repair-v3",
        "exclusions": ["manifests/package-inventory.json"],
        "intended_commit_only": True,
        "file_count": len(records),
        "total_bytes": total_bytes,
        "records": records,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )
    print("QH_V3_PACKAGE_INVENTORY=PASS")
    print(f"QH_V3_PACKAGE_FILES={len(records)}")
    print(f"QH_V3_PACKAGE_BYTES={total_bytes}")


if __name__ == "__main__":
    main()
