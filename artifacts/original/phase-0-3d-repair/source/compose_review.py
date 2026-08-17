"""Compose the human-review bundle from canonical Phase 0 Blender renders.

This script performs presentation-only image composition. It does not alter the
Blender source, canonical renders, animation frames, or encoded media.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFont, ImageOps


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
RENDERS = PACKAGE_ROOT / "renders"
REVIEW = PACKAGE_ROOT / "review"
MANIFESTS = PACKAGE_ROOT / "manifests"

BG = "#0e1112"
PANEL = "#151a1b"
PANEL_ALT = "#1a2020"
WHITE = "#f5f7f7"
COOL = "#aab4b6"
MUTED = "#718084"
MAGENTA = "#d82b72"
WARM = "#f06ba0"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    candidates = ["arialbd.ttf", "DejaVuSans-Bold.ttf"] if bold else ["arial.ttf", "DejaVuSans.ttf"]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def load(relative: str) -> Image.Image:
    return Image.open(PACKAGE_ROOT / relative).convert("RGB")


def cover(image: Image.Image, size: tuple[int, int], focus: tuple[float, float] = (0.5, 0.5)) -> Image.Image:
    source_ratio = image.width / image.height
    target_ratio = size[0] / size[1]
    if source_ratio > target_ratio:
        crop_width = round(image.height * target_ratio)
        left = round((image.width - crop_width) * focus[0])
        left = max(0, min(left, image.width - crop_width))
        image = image.crop((left, 0, left + crop_width, image.height))
    else:
        crop_height = round(image.width / target_ratio)
        top = round((image.height - crop_height) * focus[1])
        top = max(0, min(top, image.height - crop_height))
        image = image.crop((0, top, image.width, top + crop_height))
    return image.resize(size, Image.Resampling.LANCZOS)


def contain(image: Image.Image, size: tuple[int, int], background: str = PANEL) -> Image.Image:
    fitted = ImageOps.contain(image, size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", size, background)
    canvas.paste(fitted, ((size[0] - fitted.width) // 2, (size[1] - fitted.height) // 2))
    return canvas


def heading(canvas: Image.Image, title: str, subtitle: str, number: str) -> int:
    draw = ImageDraw.Draw(canvas)
    draw.text((96, 62), number, fill=MAGENTA, font=font(24, True))
    draw.text((96, 104), title, fill=WHITE, font=font(52, True))
    draw.text((98, 174), subtitle, fill=COOL, font=font(23))
    draw.line((96, 226, canvas.width - 96, 226), fill="#30393b", width=2)
    return 266


def panel(canvas: Image.Image, image: Image.Image, box: tuple[int, int, int, int], label: str, note: str = "", *, fit: str = "cover", focus: tuple[float, float] = (0.5, 0.5)) -> None:
    x0, y0, x1, y1 = box
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(box, radius=18, fill=PANEL_ALT, outline="#354043", width=2)
    inner = (x0 + 10, y0 + 10, x1 - 10, y1 - 82)
    prepared = cover(image, (inner[2] - inner[0], inner[3] - inner[1]), focus) if fit == "cover" else contain(image, (inner[2] - inner[0], inner[3] - inner[1]))
    canvas.paste(prepared, inner[:2])
    draw.text((x0 + 22, y1 - 62), label, fill=WHITE, font=font(20, True))
    if note:
        draw.text((x1 - 22, y1 - 60), note, anchor="ra", fill=MUTED, font=font(17))


def grid_sheet(filename: str, title: str, subtitle: str, number: str, entries: list[dict], size: tuple[int, int], columns: int, margin: int = 92, gap: int = 24) -> None:
    canvas = Image.new("RGB", size, BG)
    top = heading(canvas, title, subtitle, number)
    rows = (len(entries) + columns - 1) // columns
    cell_width = (size[0] - margin * 2 - gap * (columns - 1)) // columns
    cell_height = (size[1] - top - margin - gap * (rows - 1)) // rows
    for index, entry in enumerate(entries):
        row, column = divmod(index, columns)
        x0 = margin + column * (cell_width + gap)
        y0 = top + row * (cell_height + gap)
        panel(
            canvas,
            load(entry["path"]),
            (x0, y0, x0 + cell_width, y0 + cell_height),
            entry["label"],
            entry.get("note", ""),
            fit=entry.get("fit", "cover"),
            focus=entry.get("focus", (0.5, 0.5)),
        )
    canvas.save(REVIEW / filename, optimize=True)


def material_sheet() -> None:
    size = (3000, 2200)
    canvas = Image.new("RGB", size, BG)
    top = heading(canvas, "Field Unit material study", "Canonical material views plus one declared, derived cable-construction crop", "02")
    margin, gap, columns, rows = 92, 24, 3, 2
    cell_width = (size[0] - margin * 2 - gap * (columns - 1)) // columns
    cell_height = (size[1] - top - margin - gap) // rows
    entries = [
        ("renders/materials/material-coated-metal.png", "COATED METAL", "raw Blender render"),
        ("renders/materials/material-smoked-glass.png", "SMOKED GLASS", "raw Blender render"),
        ("renders/materials/material-connector.png", "CONNECTOR", "raw Blender render"),
        ("renders/materials/material-base-contact.png", "BASE + GROUND CONTACT", "raw Blender render"),
        ("renders/materials/material-precision-detail.png", "PRECISION DETAIL", "raw Blender render"),
    ]
    for index, (path, label, note) in enumerate(entries):
        row, column = divmod(index, columns)
        x0 = margin + column * (cell_width + gap)
        y0 = top + row * (cell_height + gap)
        panel(canvas, load(path), (x0, y0, x0 + cell_width, y0 + cell_height), label, note, fit="cover")

    # Review-only macro derived from the canonical 70% master. The raw dedicated
    # cable-camera render remains preserved in renders/materials/material-cable.png.
    source = load("renders/conduction/conduction-70.png")
    crop_box = (1370, 1060, 1915, 1195)
    macro = source.crop(crop_box)
    index = 5
    row, column = divmod(index, columns)
    x0 = margin + column * (cell_width + gap)
    y0 = top + row * (cell_height + gap)
    x1, y1 = x0 + cell_width, y0 + cell_height
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((x0, y0, x1, y1), radius=18, fill=PANEL_ALT, outline="#354043", width=2)
    preview_box = (x0 + 22, y0 + 132, x1 - 22, y1 - 116)
    macro_view = contain(ImageEnhance.Contrast(macro).enhance(1.04), (preview_box[2] - preview_box[0], preview_box[3] - preview_box[1]), "#101414")
    canvas.paste(macro_view, preview_box[:2])
    draw.text((x0 + 22, y0 + 24), "CABLE CONSTRUCTION / DERIVED MACRO", fill=WHITE, font=font(20, True))
    draw.text((x0 + 22, y0 + 58), "Source: conduction-70.png · crop [1370, 1060, 1915, 1195]", fill=COOL, font=font(16))
    draw.text((x0 + 22, y0 + 88), "graphite sheath  ·  recessed warm core  ·  single front  ·  ground contact", fill=WARM, font=font(16, True))
    draw.text((x0 + 22, y1 - 72), "The separate raw cable-camera study is retained; this crop is the review evidence.", fill=MUTED, font=font(15))
    draw.text((x0 + 22, y1 - 44), "No geometry or material has been repainted or composited into the source image.", fill=MUTED, font=font(15))
    canvas.save(REVIEW / "field-unit-material-sheet.png", optimize=True)


def mobile_sheet() -> None:
    size = (2600, 2500)
    canvas = Image.new("RGB", size, BG)
    top = heading(canvas, "Authored mobile evidence", "Two portrait compositions; each state is rendered from its own mobile camera contract", "07")
    margin, gap = 94, 26
    labels = ["DORMANT", "MID CONDUCTION", "ACTIVATION", "PORTAL"]
    paths = ["mobile-dormant.png", "mobile-mid-conduction.png", "mobile-activation.png", "mobile-portal.png"]
    row_height = (size[1] - top - margin - gap) // 2
    cell_width = (size[0] - margin * 2 - gap * 3) // 4
    for row, viewport in enumerate(["390x844", "360x800"]):
        y0 = top + row * (row_height + gap)
        for column, (label, name) in enumerate(zip(labels, paths)):
            x0 = margin + column * (cell_width + gap)
            panel(
                canvas,
                load(f"renders/mobile/{viewport}/{name}"),
                (x0, y0, x0 + cell_width, y0 + row_height),
                label,
                viewport,
                fit="contain",
            )
    canvas.save(REVIEW / "mobile-contact-sheet.png", optimize=True)


def portal_alignment() -> dict:
    physical = load("renders/portal/portal-100.png")
    dom = load("renders/portal/first-dom-reference.png")
    physical_gray = np.asarray(physical.convert("L"), dtype=np.float64)
    dom_gray = np.asarray(dom.convert("L"), dtype=np.float64)

    # Deterministic global SSIM approximation. It is an engineering diagnostic,
    # not a claim of perceptual or pixel identity.
    dynamic = 255.0
    c1 = (0.01 * dynamic) ** 2
    c2 = (0.03 * dynamic) ** 2
    mu_x, mu_y = physical_gray.mean(), dom_gray.mean()
    var_x, var_y = physical_gray.var(), dom_gray.var()
    covariance = ((physical_gray - mu_x) * (dom_gray - mu_y)).mean()
    ssim = ((2 * mu_x * mu_y + c1) * (2 * covariance + c2)) / ((mu_x**2 + mu_y**2 + c1) * (var_x + var_y + c2))
    mae = np.abs(physical_gray - dom_gray).mean() / dynamic

    overlay = Image.blend(physical, dom, 0.5)
    canvas = Image.new("RGB", (2800, 1900), BG)
    top = heading(canvas, "Portal / semantic DOM alignment", "Physical-glass frame, crisp DOM reference, and 50% overlay — matched structure, not claimed pixel identity", "08")
    panel(canvas, physical, (88, top, 1376, 1048), "FINAL PHYSICAL-GLASS FRAME", "portal-100.png", fit="contain")
    panel(canvas, dom, (1424, top, 2712, 1048), "FIRST CRISP DOM REFERENCE", "first-dom-reference.png", fit="contain")
    panel(canvas, overlay, (88, 1080, 2712, 1810), "50% ALIGNMENT OVERLAY", "human perception is primary", fit="contain")
    draw = ImageDraw.Draw(canvas)
    # Guides represent the shared navigation, heading, route, and audience zones.
    overlay_box = (88 + 10, 1080 + 10, 2712 - 10, 1810 - 82)
    ratio = min((overlay_box[2] - overlay_box[0]) / physical.width, (overlay_box[3] - overlay_box[1]) / physical.height)
    fitted_w, fitted_h = round(physical.width * ratio), round(physical.height * ratio)
    ox = overlay_box[0] + (overlay_box[2] - overlay_box[0] - fitted_w) // 2
    oy = overlay_box[1] + (overlay_box[3] - overlay_box[1] - fitted_h) // 2
    for source_y, label in [(160, "NAV SAFE"), (420, "HEADING"), (730, "ROUTE"), (960, "AUDIENCE")]:
        y = oy + round(source_y * ratio)
        draw.line((ox, y, ox + fitted_w, y), fill=MAGENTA if label == "HEADING" else "#6d7a7d", width=2)
        draw.text((ox + 14, y + 8), label, fill=WARM if label == "HEADING" else COOL, font=font(13, True))
    canvas.save(REVIEW / "portal-dom-overlay.png", optimize=True)

    return {
        "schema": "quantum-hub.phase-0-3d-portal-alignment.v1",
        "generated_at_utc": utc_now(),
        "physical_glass_frame": "renders/portal/portal-100.png",
        "first_semantic_dom_reference": "renders/portal/first-dom-reference.png",
        "review_overlay": "review/portal-dom-overlay.png",
        "comparison_scope": "matched aperture, crop, navigation-safe zone, heading anchor, route row and audience choices",
        "claim": "structural and perceptual alignment; pixel identity is intentionally not claimed",
        "human_perception_primary": True,
        "metrics": {
            "global_ssim_approximation": round(float(ssim), 6),
            "normalized_grayscale_mae": round(float(mae), 6),
            "width": physical.width,
            "height": physical.height,
        },
    }


def creative_contact_sheet() -> None:
    entries = [
        {"path": "renders/desktop/dormant-master.png", "label": "00% · DORMANT", "note": "no magenta"},
        {"path": "renders/conduction/conduction-10.png", "label": "10% · OUTER TERMINUS", "note": "single front"},
        {"path": "renders/conduction/conduction-40.png", "label": "40% · CAMERA + CURRENT", "note": "cumulative"},
        {"path": "renders/conduction/conduction-70.png", "label": "70% · FINAL INNER TURN", "note": "unit off"},
        {"path": "renders/activation/activation-01-connector-arrival.png", "label": "80% · CONNECTOR", "note": "arrival once"},
        {"path": "renders/activation/activation-03-mechanical-wake.png", "label": "87% · MECHANICAL WAKE", "note": "restrained"},
        {"path": "renders/activation/activation-04-interface-visible.png", "label": "91% · INTERFACE", "note": "route legible"},
        {"path": "renders/portal/portal-100.png", "label": "97% · PHYSICAL GLASS", "note": "portal owns frame"},
        {"path": "renders/portal/first-dom-reference.png", "label": "100% · DOM REFERENCE", "note": "matched anchor"},
    ]
    grid_sheet(
        "phase-0-3d-creative-review-contact-sheet.png",
        "Spiral Conduction creative review",
        "Original Field Unit · one physical cable · deterministic cause-and-effect · exact reverse by timeline state",
        "00",
        entries,
        (3300, 2500),
        3,
    )


def copy_review_masters() -> None:
    load("renders/desktop/dormant-master.png").save(REVIEW / "dormant-master.png", optimize=True)
    load("renders/reduced/reduced-motion-desktop.png").save(REVIEW / "reduced-motion-desktop.png", optimize=True)
    load("renders/reduced/reduced-motion-mobile.png").save(REVIEW / "reduced-motion-mobile.png", optimize=True)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def png_size(path: Path) -> tuple[int, int] | tuple[None, None]:
    if path.suffix.lower() != ".png":
        return None, None
    with Image.open(path) as image:
        return image.size


def write_review_manifest() -> None:
    required = [
        "phase-0-3d-creative-review-contact-sheet.png",
        "field-unit-design-sheet.png",
        "field-unit-material-sheet.png",
        "dormant-master.png",
        "conduction-master-contact-sheet.png",
        "activation-contact-sheet.png",
        "portal-contact-sheet.png",
        "mobile-contact-sheet.png",
        "reduced-motion-desktop.png",
        "reduced-motion-mobile.png",
        "portal-dom-overlay.png",
        "dom-match-metrics.json",
        "field-unit-animatic.webm",
        "README.md",
    ]
    records = []
    for name in required:
        path = REVIEW / name
        if not path.is_file():
            raise FileNotFoundError(f"Required review artifact is missing: {path}")
        width, height = png_size(path)
        record = {
            "path": f"review/{name}",
            "sha256": sha256(path),
            "bytes": path.stat().st_size,
        }
        if width is not None:
            record.update({"width": width, "height": height})
        if name == "field-unit-material-sheet.png":
            record["derived_crop"] = {
                "source": "renders/conduction/conduction-70.png",
                "crop_xyxy": [1370, 1060, 1915, 1195],
                "purpose": "tight review macro of the canonical cable sheath, recessed core/front and ground contact",
                "raw_dedicated_study_preserved": "renders/materials/material-cable.png",
            }
        records.append(record)
    document = {
        "schema": "quantum-hub.phase-0-3d-review-bundle.v1",
        "generated_at_utc": utc_now(),
        "classification": "original Quantum creative evidence",
        "approval_state": "pending human creative review",
        "artifacts": records,
    }
    (MANIFESTS / "review-bundle-manifest.json").write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    REVIEW.mkdir(parents=True, exist_ok=True)
    MANIFESTS.mkdir(parents=True, exist_ok=True)

    creative_contact_sheet()
    grid_sheet(
        "field-unit-design-sheet.png",
        "Field Unit design study",
        "Six canonical dormant turntable views · low, dense, grounded industrial construction",
        "01",
        [
            {"path": f"renders/design/{name}.png", "label": label, "note": "canonical 48-sample render", "fit": "contain"}
            for name, label in [
                ("field-unit-front", "FRONT"),
                ("field-unit-three-quarter-front", "THREE-QUARTER FRONT"),
                ("field-unit-left", "LEFT"),
                ("field-unit-right", "RIGHT"),
                ("field-unit-three-quarter-rear", "THREE-QUARTER REAR"),
                ("field-unit-rear", "REAR"),
            ]
        ],
        (3300, 2450),
        3,
    )
    material_sheet()
    grid_sheet(
        "conduction-master-contact-sheet.png",
        "Cumulative spiral conduction",
        "One front advances outer-to-inner; illuminated cable remains live behind it; the unit stays off",
        "03",
        [
            {"path": "renders/desktop/dormant-master.png", "label": "00%", "note": "fully dormant"},
            *[
                {"path": f"renders/conduction/conduction-{value}.png", "label": f"{value}%", "note": "cumulative"}
                for value in [10, 25, 40, 55, 70]
            ],
        ],
        (3200, 2200),
        3,
    )
    grid_sheet(
        "activation-contact-sheet.png",
        "Field Unit activation",
        "Connector response → internal travel → mechanical wake → readable interface → portal ready",
        "04",
        [
            {"path": f"renders/activation/{name}.png", "label": label, "note": note}
            for name, label, note in [
                ("activation-01-connector-arrival", "01 · CONNECTOR ARRIVAL", "unit begins response"),
                ("activation-02-internal-response", "02 · INTERNAL RESPONSE", "localized travel"),
                ("activation-03-mechanical-wake", "03 · MECHANICAL WAKE", "seven-degree motion"),
                ("activation-04-interface-visible", "04 · INTERFACE", "five stages legible"),
                ("activation-05-portal-ready", "05 · PORTAL READY", "major camera move complete"),
            ]
        ],
        (3200, 2200),
        3,
    )
    grid_sheet(
        "portal-contact-sheet.png",
        "Portal ownership handoff",
        "Physical Q-derived aperture resolves into the same operating-surface structure without a blank bridge",
        "05",
        [
            {"path": f"renders/portal/{name}.png", "label": label, "note": note, "fit": "contain"}
            for name, label, note in [
                ("portal-00", "00 · ACTIVATED INTERFACE", "physical"),
                ("portal-25", "25 · ENTRY BEGINS", "physical"),
                ("portal-50", "50 · TAKEOVER", "matched aperture"),
                ("portal-75", "75 · SURFACE FILLS FRAME", "no obstruction"),
                ("portal-100", "100 · FINAL GLASS FRAME", "physical finish"),
                ("first-dom-reference", "FIRST DOM REFERENCE", "crisp structural match"),
            ]
        ],
        (3200, 2200),
        3,
    )
    mobile_sheet()
    copy_review_masters()
    alignment = portal_alignment()
    (REVIEW / "dom-match-metrics.json").write_text(json.dumps(alignment, indent=2) + "\n", encoding="utf-8")
    (MANIFESTS / "portal-alignment-report.json").write_text(json.dumps(alignment, indent=2) + "\n", encoding="utf-8")
    write_review_manifest()
    print(f"QH_REVIEW_BUNDLE={REVIEW}")
    print(f"QH_REVIEW_MANIFEST={MANIFESTS / 'review-bundle-manifest.json'}")


if __name__ == "__main__":
    main()
