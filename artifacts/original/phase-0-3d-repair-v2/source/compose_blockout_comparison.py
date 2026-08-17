"""Compose the required A/B/C four-view silhouette decision sheet."""

from __future__ import annotations

import hashlib
import json
import sys
import textwrap
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

sys.dont_write_bytecode = True

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import scene_config as cfg


BG = "#0e1112"
PANEL = "#171c1d"
WHITE = "#f5f7f7"
COOL = "#aab4b6"
MUTED = "#718084"
MAGENTA = "#d82b72"
WARM = "#f06ba0"

CRITERIA_MATRIX = {
    "uniqueness": {
        "A": "Strong · asymmetric protected optic",
        "B": "Medium · familiar calibration drum",
        "C": "Medium · distinctive but rail-led",
    },
    "industrial credibility": {
        "A": "Strong · service logic + footing",
        "B": "Medium · pressure-vessel association",
        "C": "Medium · ornamental rail risk",
    },
    "premium quality": {
        "A": "Strong · coherent tapered monocoque",
        "B": "Medium · console-like silhouette",
        "C": "Medium · unresolved shell split",
    },
    "distance from appliances": {
        "A": "Strongest · projector risk manageable",
        "B": "Weak · camera/projector reading",
        "C": "Medium · decorative device reading",
    },
    "Q relationship / no literal logo": {
        "A": "Strong · recessed negative-space cue",
        "B": "Weak · lens/disk more literal",
        "C": "Medium · split-shell tension",
    },
    "animation potential": {
        "A": "Strong · one protected inner response",
        "B": "Medium · drum invites excess motion",
        "C": "Medium · rails risk ornament",
    },
    "portal potential": {
        "A": "Strong · deep optical surface",
        "B": "Weak · protruding circular object",
        "C": "Medium · narrow protected opening",
    },
    "responsive readability": {
        "A": "Strong · simple low-wide hierarchy",
        "B": "Medium · disk dominates at small size",
        "C": "Weak · rails collapse visually",
    },
}


def font(size: int, bold: bool = False):
    for name in (["arialbd.ttf", "DejaVuSans-Bold.ttf"] if bold else ["arial.ttf", "DejaVuSans.ttf"]):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    for option in cfg.BLOCKOUT_OPTIONS.values():
        count = len(option["rationale"].rstrip(".").split())
        if count != 10:
            raise ValueError(f"Rationale must contain exactly ten words, found {count}: {option['rationale']}")

    width, height = 3400, 3680
    canvas = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(canvas)
    draw.text((96, 70), "PHASE 0.2 / SILHOUETTE DECISION", fill=MAGENTA, font=font(24, True))
    draw.text((96, 120), "Integrated Aperture Chassis", fill=WHITE, font=font(62, True))
    draw.text((98, 203), "Three genuinely distinct families · front / side / top / three-quarter · dormant optical state", fill=COOL, font=font(24))
    draw.line((96, 254, width - 96, 254), fill="#344043", width=2)

    margin, gap = 96, 22
    label_width = 470
    grid_left = margin + label_width
    grid_width = width - grid_left - margin
    cell_width = (grid_width - gap * 3) // 4
    row_height = 860
    row_top = 292
    views = ("front", "side", "top", "three-quarter")
    for column, view in enumerate(views):
        x = grid_left + column * (cell_width + gap)
        draw.text((x, row_top - 4), view.upper().replace("-", " "), fill=MUTED, font=font(18, True))

    records = []
    for row, (option_key, option) in enumerate(cfg.BLOCKOUT_OPTIONS.items()):
        y0 = row_top + 38 + row * row_height
        selected = option_key == cfg.SELECTED_OPTION
        accent = MAGENTA if selected else "#465255"
        draw.rounded_rectangle((margin, y0, width - margin, y0 + row_height - 32), radius=20, fill="#121718", outline=accent, width=3 if selected else 2)
        draw.text((margin + 30, y0 + 34), option_key, fill=WARM if selected else COOL, font=font(54, True))
        draw.text((margin + 30, y0 + 104), option["name"], fill=WHITE, font=font(26, True))
        if selected:
            draw.rounded_rectangle((margin + 30, y0 + 155, margin + 248, y0 + 201), radius=12, fill=MAGENTA)
            draw.text((margin + 50, y0 + 166), "RECOMMENDED", fill=WHITE, font=font(17, True))
        draw.text((margin + 30, y0 + 242), "10-WORD RATIONALE", fill=MUTED, font=font(15, True))
        draw.multiline_text(
            (margin + 30, y0 + 278),
            textwrap.fill(option["rationale"], width=31),
            fill=COOL,
            font=font(20),
            spacing=8,
        )
        draw.text((margin + 30, y0 + 405), "STRONGEST RISK", fill=MUTED, font=font(15, True))
        draw.multiline_text(
            (margin + 30, y0 + 441),
            textwrap.fill(option["risk"], width=32),
            fill="#c49aa9" if selected else COOL,
            font=font(19),
            spacing=8,
        )
        draw.text((margin + 30, y0 + 654), "Integrated recess", fill=COOL, font=font(17, True))
        draw.text((margin + 30, y0 + 687), "Optically black", fill=COOL, font=font(17, True))
        draw.text((margin + 30, y0 + 720), "Low + wide", fill=COOL, font=font(17, True))

        for column, view in enumerate(views):
            source = cfg.RENDER_DIR / "blockouts" / option_key.lower() / f"{view}.png"
            image = Image.open(source).convert("RGB")
            image_box = (grid_left + column * (cell_width + gap), y0 + 28, grid_left + column * (cell_width + gap) + cell_width, y0 + row_height - 62)
            prepared = ImageOps.contain(image, (cell_width - 14, row_height - 104), Image.Resampling.LANCZOS)
            px = image_box[0] + (cell_width - prepared.width) // 2
            py = image_box[1] + (row_height - 90 - prepared.height) // 2
            canvas.paste(prepared, (px, py))
            draw.rounded_rectangle(image_box, radius=14, outline="#344043", width=2)
            records.append({"option": option_key, "view": view, "source": source.relative_to(cfg.PACKAGE_ROOT).as_posix(), "sha256": sha256(source)})

    matrix_y = 2918
    draw.text((96, matrix_y), "EIGHT-CRITERION COMPARATIVE ASSESSMENT", fill=MAGENTA, font=font(18, True))
    table_top = matrix_y + 42
    col_x = (96, 700, 1585, 2470)
    headers = ("CRITERION", "A · RECESSED CHASSIS", "B · CALIBRATION DRUM", "C · SPLIT SHELL")
    for x, header in zip(col_x, headers):
        draw.text((x, table_top), header, fill=WHITE, font=font(16, True))
    draw.line((96, table_top + 32, width - 96, table_top + 32), fill="#344043", width=2)
    for index, (criterion, assessments) in enumerate(CRITERIA_MATRIX.items()):
        y = table_top + 48 + index * 55
        if index % 2 == 0:
            draw.rectangle((96, y - 7, width - 96, y + 39), fill="#121718")
        draw.text((96, y), criterion.upper(), fill=COOL, font=font(14, True))
        draw.text((700, y), assessments["A"], fill=WARM, font=font(14, True))
        draw.text((1585, y), assessments["B"], fill=MUTED, font=font(14))
        draw.text((2470, y), assessments["C"], fill=MUTED, font=font(14))

    decision_y = 3540
    draw.text((96, decision_y), "DECISION", fill=MAGENTA, font=font(17, True))
    draw.text((235, decision_y - 7), "A / Recessed Optical Chassis", fill=WHITE, font=font(27, True))
    draw.text((780, decision_y - 3), cfg.SELECTED_REASON, fill=COOL, font=font(19))

    cfg.REVIEW_DIR.mkdir(parents=True, exist_ok=True)
    output = cfg.REVIEW_DIR / "field-unit-v2-silhouette-options.png"
    canvas.save(output, optimize=True)
    manifest = {
        "schema": "quantum-hub.phase-0-3d-repair-v2.silhouette-decision.v1",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "output": output.relative_to(cfg.PACKAGE_ROOT).as_posix(),
        "output_sha256": sha256(output),
        "output_bytes": output.stat().st_size,
        "width": width,
        "height": height,
        "selected_option": cfg.SELECTED_OPTION,
        "selection_reason": cfg.SELECTED_REASON,
        "criteria": list(CRITERIA_MATRIX.keys()),
        "criteria_matrix": CRITERIA_MATRIX,
        "options": cfg.BLOCKOUT_OPTIONS,
        "source_renders": records,
    }
    cfg.MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    target = cfg.MANIFEST_DIR / "silhouette-decision-manifest.json"
    target.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"QH_V2_SILHOUETTE_SHEET={output.resolve()}")
    print(f"QH_V2_SELECTED={cfg.SELECTED_OPTION}")


if __name__ == "__main__":
    main()
