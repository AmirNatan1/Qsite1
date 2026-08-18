"""Compose the Phase 0.4 six-view CRT proportion gate and provisional decision manifest."""

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

import crt_options_config as cfg


BG = "#0d1011"
PANEL = "#15191a"
PANEL_ALT = "#111516"
LINE = "#3b4547"
WHITE = "#f5f6f4"
MUTED = "#adb7b7"
MAGENTA = "#ef6099"
GREEN = "#9bc6b3"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = (
        Path("C:/Windows/Fonts/arialbd.ttf") if bold else Path("C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/segoeuib.ttf") if bold else Path("C:/Windows/Fonts/segoeui.ttf"),
    )
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def wrap(draw: ImageDraw.ImageDraw, text: str, face: ImageFont.ImageFont, width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textbbox((0, 0), candidate, font=face)[2] <= width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_wrapped(
    draw: ImageDraw.ImageDraw,
    origin: tuple[int, int],
    text: str,
    face: ImageFont.ImageFont,
    fill: str,
    width: int,
    line_height: int,
) -> int:
    x, y = origin
    lines = wrap(draw, text, face, width)
    for index, line in enumerate(lines):
        draw.text((x, y + index * line_height), line, fill=fill, font=face)
    return y + len(lines) * line_height


def main() -> None:
    cfg.MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    width, height = 4300, 3560
    canvas = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(canvas)
    eyebrow = font(25, True)
    title = font(66, True)
    subtitle = font(29)
    row_title = font(39, True)
    label = font(22, True)
    body = font(22)
    small = font(18)

    draw.text((72, 52), "PHASE 0.4 / QUANTUM SIGNAL TELEVISION", fill=MAGENTA, font=eyebrow)
    draw.text((72, 98), "CRT proportion gate / three era-authentic families", fill=WHITE, font=title)
    draw.text(
        (72, 183),
        "Original procedural blockouts · dormant 4:3 glass · front / side / rear / top / 3Q front / 3Q rear",
        fill=MUTED,
        font=subtitle,
    )
    draw.text(
        (72, 225),
        "Private user reference informed broad era and proportion only; it is absent from this source and sheet.",
        fill=MUTED,
        font=body,
    )

    views = ("front", "side", "rear", "top", "three-quarter-front", "three-quarter-rear")
    view_labels = {
        "front": "FRONT",
        "side": "SIDE",
        "rear": "REAR",
        "top": "TOP",
        "three-quarter-front": "3Q FRONT",
        "three-quarter-rear": "3Q REAR",
    }
    start_y = 300
    row_height = 945
    panel_x0 = 68
    panel_step = 700
    image_size = (658, 494)
    source_records: list[dict] = []

    for row, (key, spec) in enumerate(cfg.OPTIONS.items()):
        y = start_y + row * row_height
        selected = key == cfg.PROVISIONAL_SELECTION
        draw.rounded_rectangle(
            (42, y - 12, width - 42, y + row_height - 28),
            radius=24,
            fill=PANEL,
            outline=MAGENTA if selected else LINE,
            width=4 if selected else 2,
        )
        dimensions = spec["dimensions_m"]
        badge = "PROVISIONAL SELECTION" if selected else "COMPARATIVE VARIANT"
        draw.text((72, y + 12), f"{key} / {spec['name'].upper()}", fill=WHITE, font=row_title)
        draw.text(
            (1270, y + 20),
            f"{dimensions['width']:.2f} W × {dimensions['height']:.2f} H × {dimensions['depth']:.2f} D m  /  {spec['screen_class_inches']} in 4:3",
            fill=MUTED,
            font=body,
        )
        badge_box = draw.textbbox((0, 0), badge, font=label)
        badge_width = badge_box[2] - badge_box[0]
        draw.text((width - badge_width - 74, y + 22), badge, fill=MAGENTA if selected else MUTED, font=label)

        for column, view in enumerate(views):
            x = panel_x0 + column * panel_step
            source = cfg.RENDER_DIR / f"option-{key.lower()}" / f"option-{key.lower()}-{view}.png"
            image = Image.open(source).convert("RGB")
            image = image.resize(image_size, Image.Resampling.LANCZOS)
            panel_y = y + 82
            canvas.paste(image, (x, panel_y))
            draw.rectangle((x, panel_y, x + image.width, panel_y + image.height), outline=LINE, width=2)
            draw.rounded_rectangle((x + 12, panel_y + 12, x + 150, panel_y + 47), radius=8, fill="#0b0e0f")
            draw.text((x + 22, panel_y + 18), view_labels[view], fill=WHITE, font=small)
            source_records.append(
                {
                    "option": key,
                    "view": view,
                    "package_relative_path": source.relative_to(cfg.PACKAGE_DIR).as_posix(),
                    "bytes": source.stat().st_size,
                    "sha256": sha256(source),
                }
            )

        info_y = y + 602
        columns = (
            (72, 1240, "CABLE CONNECTION", spec["cable_connection"], WHITE),
            (1450, 1260, "STRONGEST QUALITY", spec["strongest_quality"], GREEN),
            (2850, 1340, "STRONGEST VISUAL RISK", spec["strongest_risk"], MUTED),
        )
        for x, text_width, heading, value, color in columns:
            draw.text((x, info_y), heading, fill=MAGENTA, font=label)
            draw_wrapped(draw, (x, info_y + 36), value, body, color, text_width, 30)

        scores_y = y + 785
        draw.text((72, scores_y), "SELECTION CRITERIA / 1–5", fill=MAGENTA, font=label)
        score_x = 485
        for index, criterion in enumerate(cfg.CRITERIA):
            x = score_x + index * 600
            draw.text((x, scores_y), criterion.replace("_", " ").upper(), fill=MUTED, font=small)
            score = spec["scores"][criterion]
            draw.text((x, scores_y + 34), str(score), fill=MAGENTA if selected else WHITE, font=row_title)

    decision_y = start_y + 3 * row_height + 10
    draw.rounded_rectangle((42, decision_y, width - 42, height - 48), radius=24, fill=PANEL_ALT, outline=LINE, width=2)
    draw.text((72, decision_y + 28), "PROVISIONAL DECISION", fill=MAGENTA, font=label)
    draw.text((72, decision_y + 68), "A / ROUNDED 1990s DOMESTIC CRT", fill=WHITE, font=row_title)
    draw_wrapped(draw, (72, decision_y + 124), cfg.SELECTION_REASON, body, MUTED, 2850, 31)
    draw.text((72, decision_y + 210), "REFINEMENT HOLD", fill=MAGENTA, font=label)
    draw.text(
        (72, decision_y + 248),
        "No selected high-detail model has begun. This gate requires independent provenance and creative approval.",
        fill=WHITE,
        font=body,
    )
    draw.text((3150, decision_y + 32), "BOUNDARY", fill=MAGENTA, font=label)
    boundary_lines = (
        "0 third-party models",
        "0 external textures",
        "0 reference image datablocks",
        "0 packed files",
        "Dormant emission: 0",
        "Every physical screen: 4:3",
    )
    for index, line in enumerate(boundary_lines):
        draw.text((3150, decision_y + 72 + index * 36), line, fill=WHITE if index < 4 else MUTED, font=body)

    cfg.COMPARISON_SHEET.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(cfg.COMPARISON_SHEET, format="PNG", optimize=True)

    decision = {
        "schema": "quantum-hub.phase-0-4-crt-television.proportion-decision.v1",
        "script_version": cfg.SCRIPT_VERSION,
        "gate": "low-cost CRT proportion selection before selected high-detail modelling",
        "status": cfg.SELECTION_STATUS,
        "high_detail_refinement_started": False,
        "provisional_selection": cfg.PROVISIONAL_SELECTION,
        "selection_reason": cfg.SELECTION_REASON,
        "selection_criteria": list(cfg.CRITERIA),
        "options": cfg.OPTIONS,
        "creative_boundary": {
            "object_category": "three original generic old box CRT television variants",
            "modelled_from_scratch": True,
            "procedural_materials_only": True,
            "third_party_model_count": 0,
            "external_texture_count": 0,
            "reference_image_datablock_count": 0,
            "packed_file_count": 0,
            "private_reference": "user-supplied CRT television photograph",
            "private_reference_purpose": "broad era and proportion reference only",
            "private_reference_repository_status": "intentionally uncommitted",
            "manufacturer_branding": False,
            "screen_aspect": "4:3",
            "dormant_emission": 0.0,
        },
        "required_gate_approvals": ["independent provenance review", "creative lead review"],
        "sheet": {
            "package_relative_path": cfg.COMPARISON_SHEET.relative_to(cfg.PACKAGE_DIR).as_posix(),
            "width": width,
            "height": height,
            "bytes": cfg.COMPARISON_SHEET.stat().st_size,
            "sha256": sha256(cfg.COMPARISON_SHEET),
            "classification": "Phase 0.4 CRT proportion gate comparison",
            "approval_state": "awaiting creative gate",
            "intendedCommit": True,
        },
        "source_renders": source_records,
    }
    cfg.DECISION_MANIFEST.write_text(json.dumps(decision, indent=2) + "\n", encoding="utf-8")
    print("QH_PHASE04_CRT_PROPORTION_GATE=READY_FOR_REVIEW")
    print(f"QH_PHASE04_CRT_PROVISIONAL_SELECTION={cfg.PROVISIONAL_SELECTION}")
    print(f"QH_PHASE04_CRT_COMPARISON_SHEET={cfg.COMPARISON_SHEET.resolve()}")


if __name__ == "__main__":
    main()

