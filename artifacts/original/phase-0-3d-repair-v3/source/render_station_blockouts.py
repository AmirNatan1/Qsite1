"""Render the twelve deterministic Phase 0.3 silhouette views."""

from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import bpy

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import scene_config as cfg


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = cfg.BLOCKOUT_RESOLUTION
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 45
    cfg.BLOCKOUT_RENDER_DIR.mkdir(parents=True, exist_ok=True)
    cfg.MANIFEST_DIR.mkdir(parents=True, exist_ok=True)

    option_collections = {
        key: bpy.data.collections[f"OPTION_{key}_{spec['name'].replace(' ', '_')}"]
        for key, spec in cfg.OPTIONS.items()
    }
    records = []
    for key in cfg.OPTIONS:
        for option_key, collection in option_collections.items():
            collection.hide_render = option_key != key
        for view in cfg.VIEWS:
            camera_name = f"Camera_Blockout_{view.replace('-', '_').title()}"
            scene.camera = bpy.data.objects[camera_name]
            output = cfg.BLOCKOUT_RENDER_DIR / f"option-{key.lower()}-{view}.png"
            scene.render.filepath = str(output.resolve())
            bpy.ops.render.render(write_still=True)
            records.append({
                "option": key,
                "view": view,
                "path": output.relative_to(cfg.PACKAGE_DIR).as_posix(),
                "width": cfg.BLOCKOUT_RESOLUTION[0],
                "height": cfg.BLOCKOUT_RESOLUTION[1],
                "bytes": output.stat().st_size,
                "sha256": sha256(output),
            })

    source = cfg.BLOCKOUT_BLEND
    manifest = {
        "schema": "quantum-hub.phase-0-3d-repair-v3.blockout-renders.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": {
            "path": source.relative_to(cfg.PACKAGE_DIR).as_posix(),
            "bytes": source.stat().st_size,
            "sha256": sha256(source),
        },
        "engine": scene.render.engine,
        "resolution": {"width": cfg.BLOCKOUT_RESOLUTION[0], "height": cfg.BLOCKOUT_RESOLUTION[1]},
        "external_assets": False,
        "dormant_emission": 0.0,
        "records": records,
    }
    path = cfg.MANIFEST_DIR / "blockout-render-manifest.json"
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"QH_V3_BLOCKOUT_RENDERS={len(records)}")


if __name__ == "__main__":
    main()

