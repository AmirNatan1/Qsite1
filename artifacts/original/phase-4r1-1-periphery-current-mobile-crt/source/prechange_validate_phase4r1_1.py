"""Read-only Blender 5.2 validation for the accepted Phase 4-R1 source.

This script is deliberately safe to run only as a no-save background audit. It
binds the exact accepted R1 .blend and the external pre-change backup before any
R1.1 scene mutation is allowed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
from typing import Any

import bpy


EXPECTED_SOURCE_NAME = "quantum-signal-television-phase4r1-refined-proving-hall.blend"
EXPECTED_SOURCE_BYTES = 3_526_219
EXPECTED_SOURCE_SHA256 = "a0a122baaf021833e9cad6194a474ef714b182be2c8e7171e00ad69c00565215"
EXPECTED_Q_NAME = "Phase4R1V2_ExactQuantumQ_PreCRTEffect_2048"
EXPECTED_Q_PATH = "//q-fidelity/quantum-icon-pre-crt-effect.png"
EXPECTED_Q_BYTES = 69_348
EXPECTED_Q_SHA256 = "009c494df3b301470ab539f23e02b375f0c1fcec9b4b18cf07fc853b95fd03c5"
BACKUP_RECORDS = {
    "brand/quantum-icon-color.svg": (788, "04dc37965b33587fea5f4664660f8a7f9a81ec7904d39925b41c6826b80cded9"),
    "brand/quantum-icon-white.svg": (785, "c660ed87bc5293bfbffa662e523343a7e83bc86cb94848912494e85e0dc9d4ff"),
    "q-fidelity/phase4r1-exact-q-provenance.json": (5_816, "f8759f6f6f39d07c5b081f139983afe1a9e39e7c37e0e916e8f3230bb736a93a"),
    "q-fidelity/quantum-icon-pre-crt-effect.png": (69_348, EXPECTED_Q_SHA256),
    f"source/{EXPECTED_SOURCE_NAME}": (EXPECTED_SOURCE_BYTES, EXPECTED_SOURCE_SHA256),
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_record(path: Path) -> dict[str, Any]:
    data = path.read_bytes()
    return {"bytes": len(data), "sha256": sha256_bytes(data)}


def canonical_blend_path(value: str) -> str:
    normalized = str(value or "").replace("\\", "/")
    while normalized.startswith("///"):
        normalized = normalized[1:]
    return normalized


def packed_bytes(image: bpy.types.Image) -> bytes:
    entries = list(image.packed_files)
    if len(entries) != 1:
        return b""
    packed = entries[0].packed_file
    return bytes(packed.data) if packed is not None else b""


def resource_audit() -> dict[str, Any]:
    unresolved: list[dict[str, Any]] = []
    images: list[dict[str, Any]] = []
    for image in sorted(bpy.data.images, key=lambda item: item.name):
        entries = list(image.packed_files)
        record = {
            "name": image.name,
            "source": image.source,
            "filepath": canonical_blend_path(image.filepath),
            "packedFileCount": len(entries),
        }
        if entries:
            data = packed_bytes(image) if len(entries) == 1 else b""
            record["packedBytes"] = len(data)
            record["packedSha256"] = sha256_bytes(data) if data else None
            record["packedFilepaths"] = [canonical_blend_path(entry.filepath) for entry in entries]
        elif image.source == "FILE" and image.filepath:
            resolved = Path(bpy.path.abspath(image.filepath))
            record["resolvedExists"] = resolved.is_file()
            if not resolved.is_file():
                unresolved.append({"type": "image", "name": image.name, "filepath": canonical_blend_path(image.filepath)})
        images.append(record)

    libraries: list[dict[str, Any]] = []
    for library in sorted(bpy.data.libraries, key=lambda item: item.name):
        resolved = Path(bpy.path.abspath(library.filepath))
        record = {"name": library.name, "filepath": canonical_blend_path(library.filepath), "resolvedExists": resolved.is_file()}
        libraries.append(record)
        if not resolved.is_file():
            unresolved.append({"type": "library", **record})

    external_blocks: list[dict[str, Any]] = []
    for label, datablocks in (
        ("font", bpy.data.fonts),
        ("movieClip", bpy.data.movieclips),
        ("sound", bpy.data.sounds),
    ):
        for datablock in sorted(datablocks, key=lambda item: item.name):
            filepath = str(getattr(datablock, "filepath", "") or "")
            if not filepath:
                continue
            packed = getattr(datablock, "packed_file", None) is not None
            resolved = Path(bpy.path.abspath(filepath))
            record = {
                "type": label,
                "name": datablock.name,
                "filepath": canonical_blend_path(filepath),
                "packed": packed,
                "resolvedExists": resolved.is_file(),
            }
            external_blocks.append(record)
            if not packed and not resolved.is_file():
                unresolved.append(record)

    return {
        "images": images,
        "libraries": libraries,
        "externalDataBlocks": external_blocks,
        "unresolved": unresolved,
    }


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--backup-root", required=True)
    return parser.parse_args(argv)


def main() -> None:
    args = parse_args()
    output = Path(args.output).resolve()
    backup_root = Path(args.backup_root).resolve()
    source = Path(bpy.data.filepath).resolve()
    repo_root = source.parents[4]
    script_path = Path(__file__).resolve()
    if not backup_root.is_dir():
        raise RuntimeError("--backup-root must identify the existing external backup directory")
    if output.exists():
        raise RuntimeError("--output must be a new report path")
    if not output.parent.is_dir():
        raise RuntimeError("--output parent must already exist")
    for label, candidate in (("backup root", backup_root), ("output", output)):
        try:
            candidate.relative_to(repo_root)
        except ValueError:
            pass
        else:
            raise RuntimeError(f"{label} must remain outside the repository")
    audits: list[dict[str, Any]] = []

    def check(identifier: str, passed: bool, actual: Any, expected: Any) -> None:
        audits.append({"id": identifier, "status": "PASS" if passed else "FAIL", "actual": actual, "expected": expected})

    source_record = file_record(source)
    check("accepted-source-filename", source.name == EXPECTED_SOURCE_NAME, source.name, EXPECTED_SOURCE_NAME)
    check("accepted-source-bytes", source_record["bytes"] == EXPECTED_SOURCE_BYTES, source_record["bytes"], EXPECTED_SOURCE_BYTES)
    check("accepted-source-sha256", source_record["sha256"] == EXPECTED_SOURCE_SHA256, source_record["sha256"], EXPECTED_SOURCE_SHA256)
    check("blender-version", tuple(bpy.app.version) == (5, 2, 0), list(bpy.app.version), [5, 2, 0])

    scene = bpy.context.scene
    timeline = {"frameStart": int(scene.frame_start), "frameEnd": int(scene.frame_end), "fps": int(scene.render.fps)}
    check("accepted-timeline", timeline == {"frameStart": 1, "frameEnd": 540, "fps": 30}, timeline, {"frameStart": 1, "frameEnd": 540, "fps": 30})

    resources = resource_audit()
    check("no-missing-resources", not resources["unresolved"], resources["unresolved"], [])
    check("no-linked-libraries", not resources["libraries"], resources["libraries"], [])

    q_image = bpy.data.images.get(EXPECTED_Q_NAME)
    q_data = b"" if q_image is None else packed_bytes(q_image)
    q_record = None if q_image is None else {
        "name": q_image.name,
        "filepath": canonical_blend_path(q_image.filepath),
        "packedFileCount": len(q_image.packed_files),
        "packedFilepaths": [canonical_blend_path(entry.filepath) for entry in q_image.packed_files],
        "packedBytes": len(q_data),
        "packedSha256": sha256_bytes(q_data) if q_data else None,
    }
    check("exact-q-image-present", q_image is not None, None if q_image is None else q_image.name, EXPECTED_Q_NAME)
    check(
        "exact-q-packed-authority",
        q_record is not None
        and q_record["filepath"] == EXPECTED_Q_PATH
        and q_record["packedFileCount"] == 1
        and q_record["packedFilepaths"] == [EXPECTED_Q_PATH]
        and q_record["packedBytes"] == EXPECTED_Q_BYTES
        and q_record["packedSha256"] == EXPECTED_Q_SHA256,
        q_record,
        {"filepath": EXPECTED_Q_PATH, "packedFileCount": 1, "packedBytes": EXPECTED_Q_BYTES, "packedSha256": EXPECTED_Q_SHA256},
    )

    backup_records: dict[str, Any] = {}
    for relative, (expected_bytes, expected_sha) in BACKUP_RECORDS.items():
        path = backup_root / Path(relative)
        record = {"exists": path.is_file()}
        if path.is_file():
            record.update(file_record(path))
        record.update({"expectedBytes": expected_bytes, "expectedSha256": expected_sha})
        backup_records[relative] = record
    backup_pass = all(
        record.get("exists")
        and record.get("bytes") == record["expectedBytes"]
        and record.get("sha256") == record["expectedSha256"]
        for record in backup_records.values()
    )
    check("external-backup-authority", backup_pass, backup_records, "all expected files byte/hash exact")

    summary = {
        "total": len(audits),
        "passed": sum(item["status"] == "PASS" for item in audits),
        "failed": sum(item["status"] == "FAIL" for item in audits),
        "failedIds": [item["id"] for item in audits if item["status"] == "FAIL"],
    }
    report = {
        "schema": "quantum-hub.phase-4-r1-1.prechange-source-validation.v1",
        "status": "PASS" if summary["failed"] == 0 else "FAIL",
        "mode": "read-only-no-save",
        "producer": {"repositoryRelativePath": os.path.relpath(script_path, repo_root).replace("\\", "/"), **file_record(script_path)},
        "source": {"repositoryRelativePath": os.path.relpath(source, Path.cwd()).replace("\\", "/"), **source_record},
        "backup": {"externalDirectoryName": backup_root.name, "records": backup_records},
        "blender": {"version": bpy.app.version_string, "versionTuple": list(bpy.app.version)},
        "timeline": timeline,
        "sceneInventory": {
            "objects": len(bpy.data.objects),
            "collections": len(bpy.data.collections),
            "materials": len(bpy.data.materials),
            "images": len(bpy.data.images),
            "actions": len(bpy.data.actions),
            "cameras": sorted(camera.name for camera in bpy.data.cameras),
        },
        "exactQ": q_record,
        "resources": resources,
        "audits": audits,
        "summary": summary,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(f"PHASE4R1_1_PRECHANGE_STATUS={report['status']}")
    print(f"PHASE4R1_1_PRECHANGE_REPORT={output}")
    if report["status"] != "PASS":
        raise RuntimeError(f"pre-change source validation failed: {summary['failedIds']}")


if __name__ == "__main__":
    main()
