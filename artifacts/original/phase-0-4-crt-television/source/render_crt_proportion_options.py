"""Render the eighteen canonical Phase 0.4 CRT proportion views."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import crt_options_config as cfg


def cli_args() -> argparse.Namespace:
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--manifest-only",
        action="store_true",
        help="Re-hash already rendered, sanitized canonical views without rendering again.",
    )
    return parser.parse_args(raw)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    args = cli_args()
    scene = bpy.context.scene
    scene.render.engine = cfg.RENDER_ENGINE
    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = cfg.RENDER_SAMPLES
    scene.render.resolution_x, scene.render.resolution_y = cfg.RENDER_RESOLUTION
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 48
    scene.render.film_transparent = False
    cfg.RENDER_DIR.mkdir(parents=True, exist_ok=True)
    cfg.MANIFEST_DIR.mkdir(parents=True, exist_ok=True)

    option_collections = {
        key: bpy.data.collections[f"OPTION_{key}_{spec['slug'].replace('-', '_').upper()}"]
        for key, spec in cfg.OPTIONS.items()
    }
    records: list[dict] = []
    for key, spec in cfg.OPTIONS.items():
        for candidate, collection in option_collections.items():
            collection.hide_render = candidate != key
        option_dir = cfg.RENDER_DIR / f"option-{key.lower()}"
        option_dir.mkdir(parents=True, exist_ok=True)
        for view in cfg.VIEWS:
            scene.camera = bpy.data.objects[f"Camera_CRT_{view.replace('-', '_').title()}"]
            output = option_dir / f"option-{key.lower()}-{view}.png"
            if not args.manifest_only:
                scene.render.filepath = str(output.resolve())
                bpy.ops.render.render(write_still=True)
            if not output.exists():
                raise FileNotFoundError(output)
            records.append(
                {
                    "option": key,
                    "option_name": spec["name"],
                    "view": view,
                    "package_relative_path": output.relative_to(cfg.PACKAGE_DIR).as_posix(),
                    "width": cfg.RENDER_RESOLUTION[0],
                    "height": cfg.RENDER_RESOLUTION[1],
                    "bytes": output.stat().st_size,
                    "sha256": sha256(output),
                    "classification": "canonical proportion-gate render",
                    "approval_state": "awaiting creative gate",
                    "intendedCommit": True,
                }
            )

    for collection in option_collections.values():
        collection.hide_render = False
    source = cfg.BLOCKOUT_BLEND
    manifest = {
        "schema": "quantum-hub.phase-0-4-crt-television.proportion-renders.v1",
        "script_version": cfg.SCRIPT_VERSION,
        "source": {
            "package_relative_path": source.relative_to(cfg.PACKAGE_DIR).as_posix(),
            "bytes": source.stat().st_size,
            "sha256": sha256(source),
        },
        "render": {
            "engine": cfg.RENDER_ENGINE,
            "samples": cfg.RENDER_SAMPLES,
            "resolution": {"width": cfg.RENDER_RESOLUTION[0], "height": cfg.RENDER_RESOLUTION[1]},
            "color_management": cfg.COLOR_MANAGEMENT,
            "transparent": False,
        },
        "creative_boundary": {
            "modelled_from_scratch": True,
            "procedural_materials_only": True,
            "third_party_models": False,
            "external_textures": False,
            "reference_image_loaded": False,
            "dormant_emission": 0.0,
        },
        "records": records,
    }
    cfg.RENDER_MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"QH_PHASE04_CRT_PROPORTION_RENDERS={len(records)}")
    print(f"QH_PHASE04_CRT_MANIFEST_ONLY={args.manifest_only}")
    print(f"QH_PHASE04_CRT_RENDER_MANIFEST={cfg.RENDER_MANIFEST.resolve()}")


if __name__ == "__main__":
    main()
