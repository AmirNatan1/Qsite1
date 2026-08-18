"""Compose the five-frame selected-CRT refinement visual gate."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import crt_refined_config as cfg


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    path = Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf")
    return ImageFont.truetype(str(path), size=size) if path.exists() else ImageFont.load_default()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    width, height = 3900, 2760
    canvas = Image.new("RGB", (width, height), "#0c1011")
    draw = ImageDraw.Draw(canvas)
    eyebrow = font(26, True)
    title = font(58, True)
    subtitle = font(25)
    label = font(24, True)
    body = font(20)
    magenta, white, muted, line = "#ef6099", "#f4f5f3", "#aeb7b8", "#394447"
    draw.text((58, 44), "PHASE 0.4 / OPTION A REFINEMENT", fill=magenta, font=eyebrow)
    draw.text((58, 88), "Diagnostic visual gate before canonical still production", fill=white, font=title)
    draw.text(
        (58, 160),
        "0.84×0.69×0.76m · 29-inch 4:3 · procedural source · one physical 2.5-turn cable · no animatic",
        fill=muted,
        font=subtitle,
    )
    frames = (
        ("dormant-hero", "DORMANT HERO", "Recognisable heavy CRT, smoked convex glass, grounded industrial placement; no magenta."),
        ("conductor-macro", "CONDUCTOR MACRO", "One joined graphite sheath contains a recessed warm current trail, brighter front, and black cable ahead."),
        ("rear-arrival", "REAR ARRIVAL / CONNECTION", "Deep tube silhouette, serviceable rear, ribbed strain relief, and continuous cable entry."),
        ("crt-wake", "CRT ELECTRICAL WAKE", "Cable arrival triggers one indicator and one restrained horizontal phosphor wake line."),
        ("glass-grazing", "GLASS / PHOSPHOR GRAZING PROOF", "Outward 4:3 curvature, dense 12 mm smoked cap, grazing reflection, and separately recessed phosphor layer."),
    )
    records = []
    cell_w, cell_h = 1220, 1090
    image_w, image_h = 1180, 738
    for index, (state_id, heading, note) in enumerate(frames):
        row, col = divmod(index, 3)
        x = 58 + col * 1275
        y = 230 + row * 1160
        source = cfg.DIAGNOSTIC_DIR / f"diagnostic-{state_id}.png"
        image = Image.open(source).convert("RGB").resize((image_w, image_h), Image.Resampling.LANCZOS)
        draw.rounded_rectangle((x - 8, y - 8, x + cell_w, y + cell_h), radius=18, fill="#14191a", outline=line, width=2)
        canvas.paste(image, (x, y))
        draw.rounded_rectangle((x + 18, y + 18, x + 720, y + 61), radius=8, fill="#090d0e")
        draw.text((x + 32, y + 25), heading, fill=white, font=label)
        draw.rectangle((x, y + image_h - 92, x + image_w, y + image_h), fill="#0b0f10")
        draw.text((x + 24, y + image_h - 69), note, fill=muted, font=body)
        records.append(
            {
                "state_id": state_id,
                "package_relative_path": source.relative_to(cfg.PACKAGE_DIR).as_posix(),
                "bytes": source.stat().st_size,
                "sha256": sha256(source),
            }
        )
    summary_x, summary_y = 58 + 2 * 1275, 230 + 1160
    draw.rounded_rectangle(
        (summary_x - 8, summary_y - 8, summary_x + cell_w, summary_y + cell_h),
        radius=18,
        fill="#111617",
        outline=line,
        width=2,
    )
    draw.text((summary_x + 28, summary_y + 30), "REPAIR AUTHORITY", fill=magenta, font=label)
    summary_lines = (
        "• single convex glass face + 12 mm perimeter wall; no optical rear cap",
        "• one grooved graphite sheath; 6 mm core crown sits 2.1 mm below both shoulders",
        "• near-black charcoal ABS with controlled grazing edge response",
        "• short tucked feet; direct heavy ground contact",
        "• rear mass, strain relief, 2.5 turns and dormant field preserved",
        "• canonical still batch remains held pending visual release",
    )
    for index, line_text in enumerate(summary_lines):
        draw.text((summary_x + 28, summary_y + 100 + index * 62), line_text, fill=white if index < 4 else muted, font=body)
    draw.text(
        (58, height - 62),
        "Visual decision required: release / repair. Canonical review sheets remain held until this diagnostic gate passes.",
        fill=magenta,
        font=subtitle,
    )
    output = cfg.WORK_DIR / "crt-refinement-diagnostic-sheet.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, format="PNG", optimize=True)
    manifest = {
        "schema": "quantum-hub.phase-0-4-crt-television.refinement-diagnostic-sheet.v1",
        "status": "awaiting visual gate",
        "canonical_review_batch_started": False,
        "sheet": {
            "package_relative_path": output.relative_to(cfg.PACKAGE_DIR).as_posix(),
            "width": width,
            "height": height,
            "bytes": output.stat().st_size,
            "sha256": sha256(output),
        },
        "source_frames": records,
    }
    target = cfg.MANIFEST_DIR / "crt-refinement-diagnostic-sheet-manifest.json"
    target.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"QH_PHASE04_CRT_DIAGNOSTIC_SHEET={output.resolve()}")


if __name__ == "__main__":
    main()
