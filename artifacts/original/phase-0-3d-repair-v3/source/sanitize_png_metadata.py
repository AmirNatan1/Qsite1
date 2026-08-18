"""Strip nonessential PNG metadata from every Phase 0.3 PNG, pixel-perfectly.

Blender writes a `tEXt` file-path chunk by default. This deterministic pass
re-encodes each PNG without ancillary metadata, verifies identical mode, size,
and decoded pixel bytes, then records the before/after hashes. Run it only after
all render and review PNG generation is complete; rerun after any later PNG.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

sys.dont_write_bytecode = True

SCRIPT = Path(__file__).resolve()
PACKAGE = SCRIPT.parents[1]
OUTPUT = PACKAGE / "manifests" / "png-metadata-sanitization.json"
# Compose generic patterns so the scanner source never embeds a real profile or
# workspace marker verbatim.  The checks catch Windows, macOS, and Linux user
# roots plus the two workspace-specific directory names that must stay private.
PROFILE_SEGMENT = b"User" + b"s"
HOME_SEGMENT = b"ho" + b"me"
PRIVATE_PATTERNS = (
    (
        "windows-user-profile",
        re.compile(
            rb"[A-Za-z]:[\\/]+" + PROFILE_SEGMENT + rb"[\\/]+[^\\/\x00\r\n]+",
            re.IGNORECASE,
        ),
    ),
    (
        "macos-user-profile",
        re.compile(rb"/" + PROFILE_SEGMENT + rb"/[^/\x00\r\n]+", re.IGNORECASE),
    ),
    (
        "linux-user-profile",
        re.compile(rb"/" + HOME_SEGMENT + rb"/[^/\x00\r\n]+", re.IGNORECASE),
    ),
    ("cloud-sync-root", re.compile(b"One" + b"Drive", re.IGNORECASE)),
    ("agent-config-root", re.compile(re.escape(b".") + b"cod" + b"ex", re.IGNORECASE)),
)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def main() -> None:
    records = []
    for path in sorted(PACKAGE.rglob("*.png")):
        relative = path.relative_to(PACKAGE).as_posix()
        before_bytes = path.read_bytes()
        before_sha = sha256_bytes(before_bytes)
        with Image.open(path) as opened:
            opened.load()
            mode = opened.mode
            size = opened.size
            pixels = opened.tobytes()
            pixel_sha = sha256_bytes(pixels)
            clean = opened.copy()
            source_info = sorted(opened.info.keys())

        before_marker_hits = [label for label, pattern in PRIVATE_PATTERNS if pattern.search(before_bytes)]
        if source_info or before_marker_hits:
            temporary = path.with_suffix(".png.sanitized.tmp")
            clean.save(temporary, format="PNG", optimize=True, compress_level=9)
            with Image.open(temporary) as reopened:
                reopened.load()
                after_mode = reopened.mode
                after_size = reopened.size
                after_pixels = reopened.tobytes()
                remaining_info = sorted(reopened.info.keys())
            if after_mode != mode or after_size != size or after_pixels != pixels:
                temporary.unlink(missing_ok=True)
                raise RuntimeError(f"Pixel preservation failed for {relative}")
            # A same-file overwrite is reliable in synchronized Windows
            # workspaces where an atomic rename may be denied by the indexer.
            path.write_bytes(temporary.read_bytes())
            temporary.unlink(missing_ok=True)
            after_bytes = path.read_bytes()
        else:
            # Already-clean files are byte-preserved. This keeps repeated final
            # audits fast while still recording and validating every PNG.
            remaining_info = []
            after_bytes = before_bytes
        marker_hits = [label for label, pattern in PRIVATE_PATTERNS if pattern.search(after_bytes)]
        if marker_hits:
            raise RuntimeError(f"Private marker remained in sanitized PNG {relative}: {marker_hits}")
        records.append(
            {
                "path": relative,
                "width": size[0],
                "height": size[1],
                "mode": mode,
                "pixel_sha256": pixel_sha,
                "pixels_preserved": True,
                "before_sha256": before_sha,
                "after_sha256": sha256_bytes(after_bytes),
                "before_bytes": len(before_bytes),
                "after_bytes": len(after_bytes),
                "remaining_metadata_keys": remaining_info,
                "private_marker_hits": marker_hits,
            }
        )

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    manifest = {
        "schema": "quantum-hub.phase-0-3d-repair-v3.png-metadata-sanitization.v1",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "sanitizer": {"path": SCRIPT.relative_to(PACKAGE).as_posix(), "sha256": sha256(SCRIPT)},
        "pixel_preservation_required": True,
        "all_pixels_preserved": all(item["pixels_preserved"] for item in records),
        "private_marker_hits": [],
        "records": records,
    }
    OUTPUT.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"QH_V3_SANITIZED_PNGS={len(records)}")
    print(f"QH_V3_PIXELS_PRESERVED={manifest['all_pixels_preserved']}")
    print(f"QH_V3_SANITIZATION_MANIFEST={OUTPUT.resolve()}")


if __name__ == "__main__":
    main()

