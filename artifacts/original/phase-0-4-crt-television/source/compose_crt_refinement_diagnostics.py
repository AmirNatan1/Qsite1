"""Compose the sixteen-frame Phase 0.4R CRT quality-repair visual gate."""

from __future__ import annotations

import hashlib
import json
import sys
import textwrap
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
    width, height = 5200, 4350
    canvas = Image.new("RGB", (width, height), "#0c1011")
    draw = ImageDraw.Draw(canvas)
    eyebrow = font(26, True)
    title = font(58, True)
    subtitle = font(25)
    label = font(24, True)
    body = font(20)
    magenta, white, muted, line = "#ef6099", "#f4f5f3", "#aeb7b8", "#394447"
    draw.text((58, 44), "PHASE 0.4R / OPTION A QUALITY REPAIR", fill=magenta, font=eyebrow)
    draw.text((58, 88), "Diagnostic comparison gate before canonical still production", fill=white, font=title)
    draw.text(
        (58, 160),
        "Preserved 0.84×0.69×0.76m envelope · 29-inch 4:3 · 2.5-turn physical cable · procedural source · no animatic",
        fill=muted,
        font=subtitle,
    )
    frames = (
        ("quality-front-three-quarter", "QUALITY / FRONT THREE-QUARTER", "Rounded domestic CRT mass, deeper bezel and compact feet remain inside the accepted Option A envelope."),
        ("controls-speaker", "TRUE GRILLE + PERIOD CONTROLS", "Subtractive speaker openings reveal a dark plenum; one round power control and one tuning rocker replace three generic blocks."),
        ("rear-manufacturing", "REAR MANUFACTURING", "Open service-panel vents, restrained fasteners, side breathing slots and protected strain relief read as manufactured parts."),
        ("dormant-glass", "DORMANT GLASS", "Convex smoked 4:3 glass remains optically black with localized reflection only; no white crescent and no magenta."),
        ("conductor-macro", "CENTRED RECESSED CONDUCTOR", "A 2.3 mm core is centred below both graphite shoulders with warm trail, modest front and black cable ahead."),
        ("connector-before-arrival", "CONNECTOR / BEFORE ARRIVAL", "The protected collar remains optically black before the advancing front reaches the cabinet."),
        ("connector-after-arrival", "CONNECTOR / AFTER ARRIVAL", "A restrained upper inner-collar seam appears only after arrival; the cabinet and indicator remain dark."),
        ("rear-arrival", "CONTROLLED REAR ARRIVAL", "The luminous core disappears inside the protected entry while the single graphite sheath remains continuous."),
        ("proving-ground-arrival", "LOW / HEAVY ARRIVAL", "Larger lower framing, a flush maintenance zone, cable chase and layered industrial distance establish scale and ground contact."),
        ("startup-wake-line", "STARTUP / BOWED LINE", "A brief bowed horizontal phosphor line is the first authentic tube response after power arrival."),
        ("startup-raster-expansion", "STARTUP / RECTANGULAR EXPANSION", "The line expands vertically into a partial-height rounded 4:3 field while a restrained degaussing ripple settles."),
        ("rectangular-raster", "STARTUP / FULL 4:3 RASTER", "Thirty-two full-width rounded-rectangle scanlines remain after the ripple settles; no elliptical target."),
        ("content-brand", "SCREEN STAGE 1", "Only QUANTUM HUB appears over the active 4:3 phosphor field."),
        ("content-route", "SCREEN STAGE 2", "Only FRAME SOURCE ASSESS TEST DECIDE occupies the accepted route baseline."),
        ("content-ready", "SCREEN STAGE 3", "Only TEST ROUTE AVAILABLE remains for the portal-ready physical state."),
        ("portal-takeover-continuity", "TEXT-FREE TAKEOVER CONTINUITY", "The same dark phosphor field, rectangular scanlines, overscan cues and route carrier persist without doubled copy or a blank cut."),
    )
    records = []
    cell_w, cell_h = 1240, 930
    image_w, image_h = 1200, 750
    for index, (state_id, heading, note) in enumerate(frames):
        row, col = divmod(index, 4)
        x = 58 + col * 1280
        y = 230 + row * 1005
        source = cfg.DIAGNOSTIC_DIR / f"diagnostic-{state_id}.png"
        image = Image.open(source).convert("RGB").resize((image_w, image_h), Image.Resampling.LANCZOS)
        draw.rounded_rectangle((x - 8, y - 8, x + cell_w, y + cell_h), radius=18, fill="#14191a", outline=line, width=2)
        canvas.paste(image, (x, y))
        draw.rounded_rectangle((x + 18, y + 18, x + 720, y + 61), radius=8, fill="#090d0e")
        draw.text((x + 32, y + 25), heading, fill=white, font=label)
        draw.rectangle((x, y + image_h - 82, x + image_w, y + image_h), fill="#0b0f10")
        wrapped = "\n".join(textwrap.wrap(note, width=92))
        draw.multiline_text((x + 24, y + image_h - 69), wrapped, fill=muted, font=body, spacing=4)
        records.append(
            {
                "state_id": state_id,
                "package_relative_path": source.relative_to(cfg.PACKAGE_DIR).as_posix(),
                "bytes": source.stat().st_size,
                "sha256": sha256(source),
            }
        )
    draw.text(
        (58, height - 62),
        "Visual decision required: release / repair. Canonical stills, Cycles masters and turntable remain held until this diagnostic gate passes.",
        fill=magenta,
        font=subtitle,
    )
    output = cfg.WORK_DIR / "crt-refinement-diagnostic-sheet.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, format="PNG", optimize=True)
    manifest = {
        "schema": "quantum-hub.phase-0-4r-crt-television.refinement-diagnostic-sheet.v1",
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
