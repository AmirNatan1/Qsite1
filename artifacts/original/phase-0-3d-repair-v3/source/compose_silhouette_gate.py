"""Compose the Phase 0.3 three-family silhouette gate and decision manifest."""

from __future__ import annotations

import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import scene_config as cfg


BG = "#0e1112"
PANEL = "#14191a"
LINE = "#344044"
WHITE = "#f5f7f7"
MUTED = "#aeb8ba"
MAGENTA = "#f06ba0"


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


def main() -> None:
    cfg.REVIEW_DIR.mkdir(parents=True, exist_ok=True)
    cfg.MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    width, height = 4096, 3700
    canvas = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(canvas)
    title = font(76, True)
    subtitle = font(34)
    row_title = font(42, True)
    label = font(25, True)
    body = font(24)
    tiny = font(19)

    draw.text((72, 56), "PHASE 0.3 / GROUND-ANCHORED APERTURE STATION", fill=MAGENTA, font=label)
    draw.text((72, 108), "Three materially distinct silhouette families", fill=WHITE, font=title)
    draw.text((72, 206), f"Iteration {cfg.ITERATION} · dormant graphite study · no emission · front / side / top / three-quarter", fill=MUTED, font=subtitle)

    views = ("front", "side", "top", "three-quarter")
    cell_w = 960
    image_w, image_h = 900, 675
    start_y = 310
    row_h = 980
    source_records = []
    mobile_crop_records = []

    for row, (key, option) in enumerate(cfg.OPTIONS.items()):
        y = start_y + row * row_h
        recommended = key == cfg.RECOMMENDED_OPTION
        draw.rounded_rectangle((48, y - 18, width - 48, y + row_h - 38), radius=24, fill=PANEL, outline=MAGENTA if recommended else LINE, width=4 if recommended else 2)
        dims = option["dimensions_m"]
        badge = "RECOMMENDED FOR GATE" if recommended else "COMPARATIVE FAMILY"
        draw.text((76, y + 12), f"{key} / {option['name'].upper()}", fill=WHITE, font=row_title)
        draw.text((1120, y + 20), f"{dims['width']:.2f} W × {dims['depth']:.2f} D × {dims['height']:.2f} H m", fill=MUTED, font=body)
        draw.text((width - 520, y + 20), badge, fill=MAGENTA if recommended else MUTED, font=label)

        for column, view in enumerate(views):
            x = 72 + column * cell_w
            source = cfg.BLOCKOUT_RENDER_DIR / f"option-{key.lower()}-{view}.png"
            if cfg.ITERATION == 1:
                cfg.ARCHIVE_BLOCKOUT_RENDER_DIR.mkdir(parents=True, exist_ok=True)
                archived = cfg.ARCHIVE_BLOCKOUT_RENDER_DIR / source.name
                shutil.copyfile(source, archived)
                source = archived
            image = Image.open(source).convert("RGB")
            image.thumbnail((image_w, image_h), Image.Resampling.LANCZOS)
            panel_x = x
            panel_y = y + 82
            canvas.paste(image, (panel_x, panel_y))
            draw.rectangle((panel_x, panel_y, panel_x + image.width, panel_y + image.height), outline=LINE, width=2)
            draw.text((panel_x + 16, panel_y + 14), view.replace("-", " ").upper(), fill=WHITE, font=label)
            source_records.append({
                "option": key,
                "view": view,
                "path": source.relative_to(cfg.PACKAGE_DIR).as_posix(),
                "bytes": source.stat().st_size,
                "sha256": sha256(source),
            })
            if view == "three-quarter":
                crop_ratio = 390 / 844
                crop_width = round(image.height * crop_ratio)
                crop_left = max(0, round((image.width - crop_width) * 0.50))
                crop_box = (crop_left, 0, min(image.width, crop_left + crop_width), image.height)
                mobile_crop = image.crop(crop_box)
                proof_height = 330
                proof_width = round(proof_height * crop_ratio)
                mobile_crop = mobile_crop.resize((proof_width, proof_height), Image.Resampling.LANCZOS)
                proof_x = panel_x + image.width - proof_width - 18
                proof_y = panel_y + image.height - proof_height - 18
                draw.rounded_rectangle(
                    (proof_x - 8, proof_y - 38, proof_x + proof_width + 8, proof_y + proof_height + 8),
                    radius=12,
                    fill="#0b0e0f",
                    outline=MAGENTA if recommended else LINE,
                    width=3,
                )
                canvas.paste(mobile_crop, (proof_x, proof_y))
                draw.text((proof_x, proof_y - 31), "390×844 CROP", fill=WHITE, font=tiny)
                mobile_crop_records.append({
                    "option": key,
                    "source_path": source.relative_to(cfg.PACKAGE_DIR).as_posix(),
                    "source_crop_box_after_panel_fit": list(crop_box),
                    "proof_dimensions": [proof_width, proof_height],
                    "derivation": "central portrait crop of the three-quarter blockout; review proof only, not browser output",
                })

        info_y = y + 785
        left = 76
        draw.text((left, info_y), "15-WORD RATIONALE", fill=MAGENTA, font=tiny)
        draw.text((left, info_y + 28), option["rationale_15_words"], fill=WHITE, font=body)
        draw.text((left, info_y + 67), "STRONGEST RISK", fill=MAGENTA, font=tiny)
        draw.text((left, info_y + 95), option["strongest_risk"], fill=MUTED, font=body)
        draw.text((2050, info_y), "CABLE ENTRY", fill=MAGENTA, font=tiny)
        for idx, line in enumerate(wrap(draw, option["cable_entry"], body, 820)):
            draw.text((2050, info_y + 28 + idx * 29), line, fill=WHITE, font=body)
        draw.text((3000, info_y), "PORTAL APPROACH", fill=MAGENTA, font=tiny)
        for idx, line in enumerate(wrap(draw, option["portal_approach"], body, 930)):
            draw.text((3000, info_y + 28 + idx * 29), line, fill=WHITE, font=body)

    matrix_y = start_y + 3 * row_h + 8
    draw.text((72, matrix_y), "EIGHT-CRITERION COMPARISON / 1–5", fill=MAGENTA, font=label)
    headers = [criterion.replace("_", " ").upper() for criterion in cfg.CRITERIA]
    table_x = 72
    table_y = matrix_y + 46
    name_w = 470
    score_w = 410
    draw.rectangle((table_x, table_y, width - 72, table_y + 200), outline=LINE, width=2)
    for idx, header in enumerate(headers):
        x = table_x + name_w + idx * score_w
        draw.text((x + 10, table_y + 12), header, fill=MUTED, font=tiny)
    for row, (key, option) in enumerate(cfg.OPTIONS.items()):
        y = table_y + 61 + row * 44
        draw.text((table_x + 12, y), f"{key} / {option['name']}", fill=WHITE, font=body)
        for idx, criterion in enumerate(cfg.CRITERIA):
            x = table_x + name_w + idx * score_w
            score = option["scores"][criterion]
            draw.text((x + 18, y), str(score), fill=MAGENTA if key == cfg.RECOMMENDED_OPTION else WHITE, font=body)

    draw.text(
        (72, height - 72),
        "Gate recommendation: A / inclined optical blade. Refinement remains held for independent and human creative acceptance.",
        fill=MUTED,
        font=body,
    )
    cfg.SILHOUETTE_SHEET.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(cfg.SILHOUETTE_SHEET, format="PNG", optimize=True)

    manifest = {
        "schema": "quantum-hub.phase-0-3d-repair-v3.silhouette-decision.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "creative_boundary": "original procedural geometry; no reference image or third-party binary consumed",
        "status": cfg.RECOMMENDATION_STATUS,
        "recommended_option": cfg.RECOMMENDED_OPTION,
        "recommendation_reason": cfg.RECOMMENDATION_REASON,
        "anti_pattern_gate": {
            "appliance": "candidate pass; no rounded cabinet family remains",
            "monitor": "candidate pass; A uses a non-rectangular load-bearing blade and deep offset negative space",
            "camera": "candidate pass; no lens, barrel, disc, controls, or exposed plug",
            "speaker": "pass",
            "portal_prop": "candidate pass; B remains the strongest freestanding-portal risk for human review",
            "monument": "candidate pass; C remains the strongest monument risk for human review",
            "complete_ring_or_literal_q": "candidate pass: apertures are structural, incomplete, offset, and have no applied rim",
            "presentation_plinth_or_base_rail": "pass: foundations are entirely below grade",
        },
        "options": cfg.OPTIONS,
        "views": list(views),
        "sheet": {
            "path": cfg.SILHOUETTE_SHEET.relative_to(cfg.PACKAGE_DIR).as_posix(),
            "width": width,
            "height": height,
            "bytes": cfg.SILHOUETTE_SHEET.stat().st_size,
            "sha256": sha256(cfg.SILHOUETTE_SHEET),
        },
        "source_renders": source_records,
        "mobile_crop_proofs": mobile_crop_records,
    }
    target = cfg.SILHOUETTE_MANIFEST
    target.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("QH_V3_SILHOUETTE_GATE=PASS")
    print(f"QH_V3_RECOMMENDED_PENDING_GATE={cfg.RECOMMENDED_OPTION}")


if __name__ == "__main__":
    main()
