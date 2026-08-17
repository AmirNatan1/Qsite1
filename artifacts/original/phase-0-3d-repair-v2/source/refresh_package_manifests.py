"""Refresh Phase 0.2 file facts after the lossless PNG metadata scrub.

This script does not render or alter image pixels. It updates the existing
authoritative manifests with the current byte sizes, dimensions and SHA-256
digests of their package-relative sources and outputs.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image


PACKAGE = Path(__file__).resolve().parents[1]
MANIFESTS = PACKAGE / "manifests"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def load(name: str) -> dict:
    return json.loads((MANIFESTS / name).read_text(encoding="utf-8"))


def save(name: str, data: dict) -> None:
    (MANIFESTS / name).write_text(
        json.dumps(data, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )


def file_facts(relative_path: str, *, image: bool = False) -> dict:
    path = PACKAGE / relative_path
    if not path.is_file():
        raise FileNotFoundError(relative_path)
    facts = {"bytes": path.stat().st_size, "sha256": sha256(path)}
    if image:
        with Image.open(path) as opened:
            facts["width"], facts["height"] = opened.size
    return facts


def refresh_image_record(record: dict, path_key: str = "path") -> None:
    record.update(file_facts(record[path_key], image=True))


def refresh_render_manifest(name: str) -> None:
    data = load(name)
    source = data["source"]
    data["source_sha256"] = sha256(PACKAGE / source)
    for record in data["renders"]:
        refresh_image_record(record)
    data["generated_at_utc"] = timestamp()
    save(name, data)


def refresh_portal_manifest() -> None:
    name = "portal-surface-manifest.json"
    data = load(name)
    data["layout_sha256"] = sha256(PACKAGE / data["layout"])
    for record in data["outputs"]:
        refresh_image_record(record)
    data["generated_at_utc"] = timestamp()
    save(name, data)


def refresh_review_manifest() -> None:
    name = "review-composition-manifest.json"
    data = load(name)
    blend = data["final_blend"]
    blend.update(file_facts(blend["path"]))
    layout = data["portal_layout"]
    layout["sha256"] = sha256(PACKAGE / layout["path"])
    for record in data["records"]:
        refresh_image_record(record)
    data["generated_at_utc"] = timestamp()
    save(name, data)


def refresh_silhouette_manifest() -> None:
    name = "silhouette-decision-manifest.json"
    data = load(name)
    output = data["output"]
    facts = file_facts(output, image=True)
    data["output_sha256"] = facts["sha256"]
    data["output_bytes"] = facts["bytes"]
    data["width"] = facts["width"]
    data["height"] = facts["height"]
    for record in data["source_renders"]:
        record["sha256"] = sha256(PACKAGE / record["source"])
    data["generated_at_utc"] = timestamp()
    save(name, data)


def main() -> None:
    refresh_render_manifest("blockout-render-manifest.json")
    refresh_render_manifest("final-render-manifest-all.json")
    refresh_render_manifest("final-render-manifest-diagnostic.json")
    refresh_portal_manifest()
    refresh_review_manifest()
    refresh_silhouette_manifest()
    print("QH_V2_MANIFEST_REFRESH=PASS")


if __name__ == "__main__":
    main()
