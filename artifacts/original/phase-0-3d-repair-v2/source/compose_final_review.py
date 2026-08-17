"""Compose the bounded Phase 0.2 still-only human-review originals.

Every scene pixel comes from the maintainable Blender source in this package.
The compositing layer adds only review labels, approved semantic copy, crops,
and Dark V2 presentation framing. No reference image, stock asset, model,
video, external font binary, or AI-generated bitmap is consumed.
"""

from __future__ import annotations

import hashlib
import json
import textwrap
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFont, ImageOps


PACKAGE = Path(__file__).resolve().parents[1]
RENDERS = PACKAGE / "renders"
REVIEW = PACKAGE / "review"
MANIFESTS = PACKAGE / "manifests"
PORTAL_LAYOUT = PACKAGE / "portal-layout.json"
FINAL_BLEND = PACKAGE / "source" / "field-unit-v2-integrated-aperture-chassis.blend"

BG = "#0e1112"
PANEL = "#151a1b"
PANEL_2 = "#1a2020"
WHITE = "#f5f7f7"
COOL = "#aab4b6"
MUTED = "#718084"
MAGENTA = "#d82b72"
WARM = "#f06ba0"
LINE = "#354043"

records: list[dict] = []


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def font(size: int, *, bold: bool = False, serif: bool = False) -> ImageFont.ImageFont:
    if serif:
        candidates = [Path("C:/Windows/Fonts/georgia.ttf"), Path("C:/Windows/Fonts/times.ttf")]
    elif bold:
        candidates = [Path("C:/Windows/Fonts/arialbd.ttf"), Path("C:/Windows/Fonts/arial.ttf")]
    else:
        candidates = [Path("C:/Windows/Fonts/arial.ttf"), Path("C:/Windows/Fonts/segoeui.ttf")]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def load(relative: str) -> Image.Image:
    return Image.open(PACKAGE / relative).convert("RGB")


def contain(image: Image.Image, size: tuple[int, int], background: str = PANEL) -> Image.Image:
    fitted = ImageOps.contain(image, size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", size, background)
    canvas.paste(fitted, ((size[0] - fitted.width) // 2, (size[1] - fitted.height) // 2))
    return canvas


def cover(image: Image.Image, size: tuple[int, int], focus: tuple[float, float] = (0.5, 0.5)) -> Image.Image:
    target_ratio = size[0] / size[1]
    source_ratio = image.width / image.height
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


def save(image: Image.Image, filename: str, sources: list[str], derivation: str, extra: dict | None = None) -> None:
    REVIEW.mkdir(parents=True, exist_ok=True)
    path = REVIEW / filename
    image.convert("RGB").save(path, optimize=True, quality=96)
    record = {
        "path": path.relative_to(PACKAGE).as_posix(),
        "width": image.width,
        "height": image.height,
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
        "source_paths": sources,
        "derivation": derivation,
    }
    if extra:
        record.update(extra)
    records.append(record)


def sheet_header(canvas: Image.Image, index: str, title: str, subtitle: str) -> int:
    draw = ImageDraw.Draw(canvas)
    draw.text((92, 60), index, fill=MAGENTA, font=font(23, bold=True))
    draw.text((92, 100), title, fill=WHITE, font=font(50, bold=True))
    draw.text((94, 166), subtitle, fill=COOL, font=font(21))
    draw.line((92, 220, canvas.width - 92, 220), fill=LINE, width=2)
    return 254


def panel(
    canvas: Image.Image,
    source: Image.Image,
    box: tuple[int, int, int, int],
    label: str,
    note: str = "",
    *,
    fit: str = "cover",
    focus: tuple[float, float] = (0.5, 0.5),
) -> None:
    x0, y0, x1, y1 = box
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(box, radius=18, fill=PANEL_2, outline=LINE, width=2)
    image_box = (x0 + 10, y0 + 10, x1 - 10, y1 - 76)
    size = (image_box[2] - image_box[0], image_box[3] - image_box[1])
    prepared = cover(source, size, focus) if fit == "cover" else contain(source, size)
    canvas.paste(prepared, image_box[:2])
    draw.text((x0 + 20, y1 - 55), label, fill=WHITE, font=font(18, bold=True))
    if note:
        draw.text((x1 - 20, y1 - 53), note, anchor="ra", fill=MUTED, font=font(15))


def grid_sheet(
    filename: str,
    index: str,
    title: str,
    subtitle: str,
    entries: list[tuple[str, str, str]],
    size: tuple[int, int],
    columns: int,
    sources: list[str],
) -> None:
    canvas = Image.new("RGB", size, BG)
    top = sheet_header(canvas, index, title, subtitle)
    margin, gap = 88, 22
    rows = (len(entries) + columns - 1) // columns
    cell_w = (size[0] - margin * 2 - gap * (columns - 1)) // columns
    cell_h = (size[1] - top - margin - gap * (rows - 1)) // rows
    for i, (path, label, note) in enumerate(entries):
        row, col = divmod(i, columns)
        x0 = margin + col * (cell_w + gap)
        y0 = top + row * (cell_h + gap)
        panel(canvas, load(path), (x0, y0, x0 + cell_w, y0 + cell_h), label, note, fit="contain")
    save(canvas, filename, sources, "Dark V2 review grid composed from canonical Blender stills; no scene pixels repainted")


def design_sheet() -> None:
    names = ["front", "side", "rear", "three-quarter", "rear-three-quarter", "top"]
    entries = [(f"renders/design/{name}.png", name.replace("-", " ").upper(), "raw Blender still") for name in names]
    grid_sheet(
        "field-unit-v2-recommended-design-sheet.png",
        "02",
        "Recommended A · Integrated Aperture Chassis",
        "Low, wide asymmetric monocoque · protected recess · service-side logic · credible hidden footing",
        entries,
        (3300, 2350),
        3,
        [entry[0] for entry in entries],
    )


def crop_panel(canvas: Image.Image, image: Image.Image, crop: tuple[int, int, int, int], box: tuple[int, int, int, int], label: str, note: str) -> None:
    cropped = ImageEnhance.Contrast(image.crop(crop)).enhance(1.04)
    panel(canvas, cropped, box, label, note, fit="contain")


def material_sheet() -> None:
    canvas = Image.new("RGB", (3400, 3000), BG)
    top = sheet_header(
        canvas,
        "03",
        "Material, conductor, and connector construction",
        "Graphite sheath surrounds a recessed physical channel; energy remains local to the cable and lower-side entry",
    )
    margin, gap = 88, 22
    cell_w = (canvas.width - margin * 2 - gap * 2) // 3
    cell_h = (canvas.height - top - margin - gap * 2) // 3
    boxes = []
    for i in range(9):
        row, col = divmod(i, 3)
        x0 = margin + col * (cell_w + gap)
        y0 = top + row * (cell_h + gap)
        boxes.append((x0, y0, x0 + cell_w, y0 + cell_h))

    panel(canvas, load("renders/materials/shell.png"), boxes[0], "COATED GRAPHITE SHELL", "raw Blender still", fit="contain")
    panel(canvas, load("renders/materials/glass.png"), boxes[1], "OPTICALLY BLACK GLASS", "raw Blender still", fit="contain")
    panel(canvas, load("renders/design/low.png"), boxes[2], "CHASSIS GROUND CONTACT", "raw Blender still", fit="contain")

    dormant = load("renders/environment/proving-ground-style-frame.png")
    crop_panel(canvas, dormant, (0, 690, 1920, 1110), boxes[3], "DORMANT GRAPHITE SHEATH", "derived crop · style frame [0,690,1920,1110]")
    mid = load("renders/diagnostics/mid-conduction.png")
    crop_panel(canvas, mid, (350, 500, 840, 760), boxes[4], "MODESTLY BRIGHTER LEADING FRONT", "derived crop · mid [350,500,840,760]")
    crop_panel(canvas, mid, (0, 440, 1120, 790), boxes[5], "CONTINUOUS WARM ENERGIZED TRAIL", "derived crop · mid [0,440,1120,790]")
    crop_panel(canvas, mid, (420, 520, 930, 770), boxes[6], "EXACT ACTIVE → DORMANT TRANSITION", "derived crop · mid [420,520,930,770]")
    response = load("renders/camera-study/03-conduction-70.png")
    crop_panel(canvas, response, (0, 720, 1800, 1160), boxes[7], "CABLE CONTACT + LOCAL GROUND RESPONSE", "derived crop · 70% [0,720,1800,1160]")
    activation = load("renders/activation/02-internal-energy-transfer.png")
    crop_panel(canvas, activation, (1540, 610, 1920, 1040), boxes[8], "PROTECTED LOWER-SIDE CONNECTOR", "derived crop · transfer [1540,610,1920,1040]")
    draw = ImageDraw.Draw(canvas)
    draw.text((100, canvas.height - 42), "Derived crops preserve the canonical pixels; no cable, glow, or connector geometry was painted into the sheet.", fill=MUTED, font=font(15))
    save(
        canvas,
        "field-unit-v2-material-and-cable-sheet.png",
        [
            "renders/materials/shell.png",
            "renders/materials/glass.png",
            "renders/design/low.png",
            "renders/environment/proving-ground-style-frame.png",
            "renders/diagnostics/mid-conduction.png",
            "renders/camera-study/03-conduction-70.png",
            "renders/activation/02-internal-energy-transfer.png",
        ],
        "Review grid with three raw stills and six explicitly labelled pixel-preserving construction crops",
        {
            "derived_crops": [
                {"source": "renders/environment/proving-ground-style-frame.png", "box": [0, 690, 1920, 1110], "proves": "dormant graphite sheath"},
                {"source": "renders/diagnostics/mid-conduction.png", "box": [350, 500, 840, 760], "proves": "modestly brighter leading front"},
                {"source": "renders/diagnostics/mid-conduction.png", "box": [0, 440, 1120, 790], "proves": "continuous warm energized trail"},
                {"source": "renders/diagnostics/mid-conduction.png", "box": [420, 520, 930, 770], "proves": "exact active-to-dormant transition"},
                {"source": "renders/camera-study/03-conduction-70.png", "box": [0, 720, 1800, 1160], "proves": "cable-to-ground contact and local response"},
                {"source": "renders/activation/02-internal-energy-transfer.png", "box": [1540, 610, 1920, 1040], "proves": "protected connector entry"},
            ]
        },
    )


def style_frame() -> None:
    source = load("renders/environment/proving-ground-style-frame.png")
    save(source, "proving-ground-v2-style-frame.png", ["renders/environment/proving-ground-style-frame.png"], "Pixel-equivalent canonical 1920×1200 Blender still")


def camera_sheet() -> None:
    angles = (-14, -5, 4, 13)
    paths = [
        "renders/camera-study/01-arrival.png",
        "renders/camera-study/02-conduction-35.png",
        "renders/camera-study/03-conduction-70.png",
        "renders/camera-study/04-frontal-activation.png",
    ]
    states = ["arrival · dormant", "35% · cumulative", "70% · unit off", "frontal activation"]
    entries = [(path, f"ARC {i} · {angle:+d}°", state) for i, (path, angle, state) in enumerate(zip(paths, angles, states), 1)]
    grid_sheet(
        "camera-path-v2-study.png",
        "05",
        "Meaningful still-camera arc",
        "Four authored checkpoints span 27°; this is still evidence only and does not claim a new animatic",
        entries,
        (3300, 2350),
        2,
        [entry[0] for entry in entries],
    )


def activation_sheet() -> None:
    paths = [
        "renders/activation/01-connector-arrival.png",
        "renders/activation/02-internal-energy-transfer.png",
        "renders/activation/03-mechanical-movement-begins.png",
        "renders/activation/04-interface-visible.png",
        "renders/activation/05-portal-ready.png",
    ]
    labels = ["CONNECTOR ARRIVAL", "INTERNAL TRANSFER", "RING MOVEMENT BEGINS", "INTERFACE VISIBLE", "PORTAL READY"]
    meanings = [
        "current arrived · unit still off",
        "localized connector-to-internal response",
        "sole interrupted inner ring begins",
        "CHALLENGE DETECTED · five-stage route",
        "TEST ROUTE AVAILABLE",
    ]
    canvas = Image.new("RGB", (3500, 2400), BG)
    top = sheet_header(
        canvas,
        "06",
        "Five-state activation causality",
        "One interrupted inner optical ring rotates once; adjacent aperture crops make orientation and staged meaning reviewable",
    )
    margin, gap = 72, 18
    cell_w = (canvas.width - margin * 2 - gap * 4) // 5
    full_h = 820
    crop_h = 850
    draw = ImageDraw.Draw(canvas)
    for i, path in enumerate(paths):
        x0 = margin + i * (cell_w + gap)
        raw = load(path)
        panel(canvas, raw, (x0, top, x0 + cell_w, top + full_h), labels[i], f"state {i + 1}/5", fit="contain")
        aperture = raw.crop((400, 315, 790, 705))
        panel(canvas, aperture, (x0, top + full_h + 28, x0 + cell_w, top + full_h + 28 + crop_h), "APERTURE DETAIL", meanings[i], fit="contain")
        # A compact orientation datum makes the partial-ring interruption easy
        # to compare without claiming an animation or adding scene geometry.
        angle_x = x0 + cell_w - 44
        angle_y = top + full_h + 72
        draw.ellipse((angle_x - 18, angle_y - 18, angle_x + 18, angle_y + 18), outline=MUTED, width=2)
        angle_label = ("−5°", "−5°", "+1°", "+9°", "+9°")[i]
        draw.text((angle_x, angle_y + 30), angle_label, anchor="ma", fill=WARM if i >= 2 else MUTED, font=font(14, bold=True))
    draw.text((74, canvas.height - 42), "Mechanical count: 1 · inner partial ring only · no shutter, iris, glass-clearing motion, handle, or external torus.", fill=MUTED, font=font(15))
    save(
        canvas,
        "activation-v2-contact-sheet.png",
        paths,
        "Canonical five-state still grid with enlarged aperture crops and review-only orientation labels",
        {
            "mechanical_response_count": 1,
            "mechanical_response": "deeply recessed interrupted inner optical partial ring begins at frame 3 and rotates from -5° to +9°",
            "semantic_sequence": meanings,
            "aperture_crop": [400, 315, 790, 705],
        },
    )


def portal_sheet() -> None:
    physical_path = "renders/portal/physical-layout.png"
    dom_path = "renders/portal/dom-layout.png"
    overlay_path = "renders/portal/layout-overlay.png"
    entries = [
        (physical_path, "PHYSICAL SCREEN SURFACE", "smoked-glass treatment"),
        (dom_path, "SEMANTIC DOM REFERENCE", "crisp fallback typography"),
        (overlay_path, "50% ALIGNMENT OVERLAY", "shared anchors · max delta 0 px"),
    ]
    canvas = Image.new("RGB", (3300, 2420), BG)
    top = sheet_header(
        canvas,
        "07",
        "Portal layout · one shared authority",
        f"WHERE DO YOU ENTER? · physical, DOM, and overlay consume portal-layout.json · SHA-256 {sha256(PORTAL_LAYOUT)[:16]}…",
    )
    panel(canvas, load(physical_path), (86, top, 1626, 1180), entries[0][1], entries[0][2], fit="contain")
    panel(canvas, load(dom_path), (1674, top, 3214, 1180), entries[1][1], entries[1][2], fit="contain")
    panel(canvas, load(overlay_path), (86, 1215, 3214, 2328), entries[2][1], entries[2][2], fit="contain")
    save(
        canvas,
        "portal-v2-layout-sheet.png",
        [physical_path, dom_path, overlay_path, "portal-layout.json"],
        "Side-by-side physical/semantic surfaces and overlay produced from one JSON coordinate authority",
        {
            "portal_layout_sha256": sha256(PORTAL_LAYOUT),
            "maximum_anchor_delta_px": 0,
            "decorative_rule_count": 1,
            "heading": "WHERE DO YOU ENTER?",
        },
    )


def darken_for_copy(image: Image.Image, box: tuple[int, int, int, int], opacity: int = 185) -> Image.Image:
    result = image.convert("RGBA")
    layer = Image.new("RGBA", result.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle(box, radius=24, fill=(8, 12, 13, opacity))
    return Image.alpha_composite(result, layer).convert("RGB")


def wrapped(draw: ImageDraw.ImageDraw, text: str, box: tuple[int, int, int, int], face: ImageFont.ImageFont, fill: str, spacing: int = 8) -> int:
    x0, y0, x1, _ = box
    words = text.split()
    lines: list[str] = []
    line = ""
    for word in words:
        candidate = f"{line} {word}".strip()
        if draw.textbbox((0, 0), candidate, font=face)[2] <= x1 - x0 or not line:
            line = candidate
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    y = y0
    for value in lines:
        draw.text((x0, y), value, fill=fill, font=face)
        bbox = draw.textbbox((x0, y), value, font=face)
        y = bbox[3] + spacing
    return y


def hero_surface(base: Image.Image, size: tuple[int, int], *, mobile: bool, reduced: bool = False, zoom: float = 1.0) -> Image.Image:
    focus = (0.48, 0.42) if mobile else (0.50, 0.52)
    image = cover(base, size, focus)
    draw = ImageDraw.Draw(image)
    if mobile:
        pad = max(20, round(size[0] * 0.055))
        copy_box = (pad, pad + 42, size[0] - pad, min(size[1] - pad, round(size[1] * 0.48)))
        image = darken_for_copy(image, (pad // 2, 24, size[0] - pad // 2, copy_box[3] + 22), 208)
        draw = ImageDraw.Draw(image)
        ui = max(12, round(size[0] * 0.034 * zoom))
        h1 = max(28, round(size[0] * 0.090 * zoom))
        body = max(13, round(size[0] * 0.038 * zoom))
        draw.text((pad, 38), "Quantum-Hub", fill=WHITE, font=font(ui, bold=True))
        draw.text((pad, copy_box[1]), "industrial innovation · herzliya", fill=WARM, font=font(ui, bold=True))
        y = wrapped(draw, "Prove it where it has to work.", (pad, copy_box[1] + ui + 18, size[0] - pad, size[1]), font(h1, bold=True), WHITE, 4)
        y = wrapped(
            draw,
            "Quantum brings industry and technology together to define real needs, test solutions and turn evidence into decisions.",
            (pad, y + 18, size[0] - pad, size[1]),
            font(body, serif=True),
            COOL,
            5,
        )
        button_y = min(y + 18, copy_box[3] - 62)
        button_h = max(40, round(48 * zoom))
        button_w = (size[0] - pad * 2 - 10) // 2
        for i, label in enumerate(("For industry", "For startups")):
            x0 = pad + i * (button_w + 10)
            draw.rounded_rectangle((x0, button_y, x0 + button_w, button_y + button_h), radius=8, fill="#171d1e", outline="#566164", width=1)
            draw.text((x0 + 12, button_y + button_h // 2), label, anchor="lm", fill=WHITE, font=font(max(12, round(ui * 0.95)), bold=True))
        if reduced:
            draw.text((size[0] - pad, 40), "reduced motion · static poster", anchor="ra", fill=MUTED, font=font(max(10, ui - 2)))
    else:
        pad = round(size[0] * 0.055)
        copy_w = round(size[0] * 0.39)
        x0 = size[0] - pad - copy_w
        y0 = round(size[1] * 0.13)
        image = darken_for_copy(image, (x0 - 34, y0 - 40, size[0] - pad + 18, round(size[1] * 0.69)), 193)
        draw = ImageDraw.Draw(image)
        ui = max(15, round(size[0] * 0.0105 * zoom))
        h1 = max(48, round(size[0] * 0.040 * zoom))
        body = max(18, round(size[0] * 0.014 * zoom))
        draw.text((pad, 46), "Quantum-Hub", fill=WHITE, font=font(ui + 2, bold=True))
        draw.text((x0, y0), "industrial innovation · herzliya", fill=WARM, font=font(ui, bold=True))
        y = wrapped(draw, "Prove it where it has to work.", (x0, y0 + ui + 24, x0 + copy_w, size[1]), font(h1, bold=True), WHITE, 8)
        y = wrapped(
            draw,
            "Quantum brings industry and technology together to define real needs, test solutions and turn evidence into decisions.",
            (x0, y + 28, x0 + copy_w, size[1]),
            font(body, serif=True),
            COOL,
            7,
        )
        button_y = y + 28
        button_w = (copy_w - 16) // 2
        for i, label in enumerate(("For industry", "For startups")):
            bx = x0 + i * (button_w + 16)
            draw.rounded_rectangle((bx, button_y, bx + button_w, button_y + 56), radius=10, fill="#171d1e", outline="#566164", width=1)
            draw.text((bx + 18, button_y + 28), label, anchor="lm", fill=WHITE, font=font(ui, bold=True))
        if reduced:
            draw.text((size[0] - pad, 50), "reduced motion · static poster", anchor="ra", fill=MUTED, font=font(ui - 1))
    return image


def reduced_outputs() -> None:
    desktop_base = load("renders/hero/desktop-dormant-base.png")
    mobile_base = load("renders/hero/mobile-dormant-base.png")
    reduced_desktop = hero_surface(desktop_base, (1600, 1000), mobile=False, reduced=True)
    save(reduced_desktop, "reduced-motion-v2-desktop.png", ["renders/hero/desktop-dormant-base.png"], "Designed 1600×1000 static dormant poster; no animation or media sequence")
    reduced_mobile = hero_surface(mobile_base, (720, 1600), mobile=True, reduced=True)
    save(reduced_mobile, "reduced-motion-v2-mobile.png", ["renders/hero/mobile-dormant-base.png"], "Designed 720×1600 static dormant poster from authored portrait camera; no animation or media sequence")


def text_zoom_sheet() -> None:
    raise RuntimeError("Browser zoom/fallback review must be composed from canonical HTML/CSS captures, never from Pillow-drawn UI")


def main() -> None:
    required = [
        FINAL_BLEND,
        PORTAL_LAYOUT,
        RENDERS / "environment" / "proving-ground-style-frame.png",
        RENDERS / "hero" / "desktop-dormant-base.png",
        RENDERS / "hero" / "mobile-dormant-base.png",
        RENDERS / "portal" / "physical-layout.png",
        RENDERS / "portal" / "dom-layout.png",
        RENDERS / "portal" / "layout-overlay.png",
    ]
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        raise SystemExit(f"Missing canonical inputs: {missing}")

    design_sheet()
    material_sheet()
    style_frame()
    camera_sheet()
    activation_sheet()
    portal_sheet()
    reduced_outputs()

    manifest = {
        "schema": "quantum-hub.phase-0-3d-repair-v2.review-composition.v1",
        "generated_at_utc": utc_now(),
        "selected_option": "A · Recessed Optical Chassis",
        "final_blend": {
            "path": FINAL_BLEND.relative_to(PACKAGE).as_posix(),
            "bytes": FINAL_BLEND.stat().st_size,
            "sha256": sha256(FINAL_BLEND),
        },
        "portal_layout": {
            "path": PORTAL_LAYOUT.relative_to(PACKAGE).as_posix(),
            "sha256": sha256(PORTAL_LAYOUT),
        },
        "render_contract": {
            "engine": "BLENDER_EEVEE",
            "samples": 48,
            "still_only": True,
            "new_animatic_or_video": False,
        },
        "creative_boundary": {
            "original_geometry_materials_lighting_and_composition": True,
            "reference_binary_used": False,
            "external_asset_used": False,
            "external_addon_used": False,
            "font_binary_bundled": False,
            "full_animatic_created": False,
        },
        "records": records,
    }
    MANIFESTS.mkdir(parents=True, exist_ok=True)
    path = MANIFESTS / "review-composition-manifest.json"
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"QH_V2_REVIEW_ORIGINALS={len(records)}")
    print(f"QH_V2_REVIEW_MANIFEST={path.resolve()}")


if __name__ == "__main__":
    main()
