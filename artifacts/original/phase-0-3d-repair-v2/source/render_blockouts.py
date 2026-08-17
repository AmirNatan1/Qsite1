"""Render the four-view comparison for all three v2 silhouette families."""

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
    scene.render.image_settings.compression = 45
    records = []

    option_collections = {
        key: bpy.data.collections[f"OPTION_{key}_{cfg.BLOCKOUT_OPTIONS[key]['name'].replace(' ', '_')}"]
        for key in cfg.BLOCKOUT_OPTIONS
    }
    for option, destination_collection in option_collections.items():
        for key, collection in option_collections.items():
            collection.hide_render = key != option
        for view in cfg.BLOCKOUT_VIEWS:
            camera_name = f"Camera_Blockout_{view.replace('-', '_').title()}"
            scene.camera = bpy.data.objects[camera_name]
            output = cfg.RENDER_DIR / "blockouts" / option.lower() / f"{view}.png"
            output.parent.mkdir(parents=True, exist_ok=True)
            scene.render.filepath = str(output.resolve())
            bpy.ops.render.render(write_still=True)
            records.append(
                {
                    "option": option,
                    "view": view,
                    "camera": camera_name,
                    "path": output.relative_to(cfg.PACKAGE_ROOT).as_posix(),
                    "width": cfg.BLOCKOUT_RESOLUTION[0],
                    "height": cfg.BLOCKOUT_RESOLUTION[1],
                    "bytes": output.stat().st_size,
                    "sha256": sha256(output),
                }
            )

    source = cfg.BLOCKOUT_BLEND
    manifest = {
        "schema": "quantum-hub.phase-0-3d-repair-v2.blockout-renders.v1",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "blender_version": bpy.app.version_string,
        "blender_build_hash": bpy.app.build_hash.decode("utf-8"),
        "source": source.relative_to(cfg.PACKAGE_ROOT).as_posix(),
        "source_sha256": sha256(source),
        "engine": scene.render.engine,
        "samples": 64,
        "original_artwork": True,
        "reference_binary_used": False,
        "renders": records,
    }
    cfg.MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    target = cfg.MANIFEST_DIR / "blockout-render-manifest.json"
    target.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"QH_V2_BLOCKOUT_RENDERS={len(records)}")
    print(f"QH_V2_BLOCKOUT_MANIFEST={target.resolve()}")


if __name__ == "__main__":
    main()
