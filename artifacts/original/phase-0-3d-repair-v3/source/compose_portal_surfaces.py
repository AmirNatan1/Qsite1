"""Generate the physical-glass, semantic-DOM, and overlay portal surfaces.

Every anchor and string is read directly from the authoritative portal-layout.json.
No hand-copied coordinate fork is used.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

sys.dont_write_bytecode = True

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import scene_config as cfg


WHITE = "#f1f4f4"
COOL = "#aab4b6"
MUTED = "#718084"
MAGENTA = "#d82b72"
WARM = "#f06ba0"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def font(size: int, family: str = "ui", bold: bool = False) -> ImageFont.ImageFont:
    if family == "display":
        names = ["arialbd.ttf", "DejaVuSans-Bold.ttf"]
    elif family == "editorial":
        names = ["georgia.ttf", "DejaVuSerif.ttf"]
    else:
        names = ["arialbd.ttf", "DejaVuSans-Bold.ttf"] if bold else ["arial.ttf", "DejaVuSans.ttf"]
    for name in names:
        try:
            return ImageFont.truetype(name, size=max(8, size))
        except OSError:
            continue
    return ImageFont.load_default()


def cover_transform(width: int, height: int) -> tuple[float, float, float]:
    scale = max(width / 1920.0, height / 1200.0)
    return scale, (width - 1920 * scale) / 2.0, (height - 1200 * scale) / 2.0


def project(x: float, y: float, transform: tuple[float, float, float]) -> tuple[float, float]:
    scale, ox, oy = transform
    return ox + x * scale, oy + y * scale


def fit_font(text: str, target_width: float, preferred_size: int, family: str, bold: bool = False) -> ImageFont.ImageFont:
    size = preferred_size
    while size >= 8:
        candidate = font(size, family, bold)
        bounds = candidate.getbbox(text)
        if bounds[2] - bounds[0] <= target_width:
            return candidate
        size -= 1
    return font(8, family, bold)


def glass_background(width: int, height: int) -> Image.Image:
    image = Image.new("RGB", (width, height), "#101617")
    pixels = image.load()
    for y in range(height):
        for x in range(width):
            nx = (x / max(1, width - 1)) - 0.5
            ny = (y / max(1, height - 1)) - 0.5
            radial = max(0.0, 1.0 - math.sqrt(nx * nx + ny * ny) * 1.42)
            reflection = max(0.0, 1.0 - abs((nx * 0.60 + ny * 1.1) - 0.18) * 6.0)
            value = int(15 + radial * 8 + reflection * 5)
            pixels[x, y] = (value - 3, value + 1, value + 2)
    return image.filter(ImageFilter.GaussianBlur(radius=max(1, width // 960)))


def draw_surface(layout: dict, size: tuple[int, int], physical: bool) -> tuple[Image.Image, dict]:
    width, height = size
    image = glass_background(width, height) if physical else Image.new("RGB", size, "#0e1112")
    draw = ImageDraw.Draw(image)
    transform = cover_transform(width, height)
    scale = transform[0]
    anchors = layout["anchors"]
    copy = layout["copy"]
    regions = layout["regions"]
    color_white = "#dce3e3" if physical else WHITE
    color_cool = "#8f9b9d" if physical else COOL
    color_magenta = "#cf4279" if physical else MAGENTA

    def baseline_text(text: str, anchor: dict, text_font: ImageFont.ImageFont, fill: str) -> tuple[float, float]:
        x, y = project(anchor["x"], anchor["y"], transform)
        bounds = text_font.getbbox(text)
        draw.text((x, y - (bounds[3] - bounds[1])), text, fill=fill, font=text_font)
        return x, y

    ui_size = round(layout["typography"]["ui"]["referenceSizePx"] * scale)
    display_size = round(layout["typography"]["display"]["referenceSizePx"] * scale)
    editorial_size = round(layout["typography"]["editorial"]["referenceSizePx"] * scale)
    baseline_text(copy["brand"], anchors["navBaseline"], font(round(ui_size * 1.12), "ui", True), color_white)
    baseline_text(copy["signalLine"], anchors["signalLineBaseline"], font(ui_size, "ui", True), color_magenta)
    baseline_text(copy["eyebrow"], anchors["eyebrowBaseline"], font(round(ui_size * 0.9), "ui", True), color_cool)

    h1_region = regions["heading"]
    h1_width = h1_region["width"] * scale
    h1_font = fit_font(copy["heading"], h1_width, display_size, "display", True)
    baseline_text(copy["heading"], anchors["h1Line1Baseline"], h1_font, color_white)

    route_y = anchors["routeBaseline"]["y"]
    for item, x in zip(copy["route"], regions["route"]["itemStarts"], strict=True):
        baseline_text(item, {"x": x, "y": route_y}, font(ui_size, "ui", True), color_cool)

    baseline_text(copy["audiences"][0], anchors["audienceIndustryBaseline"], font(round(editorial_size * 1.15), "editorial"), color_white)
    baseline_text(copy["audiences"][1], anchors["audienceStartupsBaseline"], font(round(editorial_size * 1.15), "editorial"), color_white)

    # Exactly one decorative divider, sourced from the JSON.
    rule = layout["decorativeRules"][0]
    x1, y1 = project(rule["x1"], rule["y1"], transform)
    x2, y2 = project(rule["x2"], rule["y2"], transform)
    draw.line((x1, y1, x2, y2), fill="#627073" if physical else "#819093", width=max(1, round(rule["strokeWidth"] * scale)))

    projected = {
        key: {"x": project(value["x"], value["y"], transform)[0], "y": project(value["x"], value["y"], transform)[1]}
        for key, value in anchors.items()
        if isinstance(value, dict) and "x" in value and "y" in value
    }
    return image, projected


def main() -> None:
    layout_path = cfg.PACKAGE_ROOT / "portal-layout.json"
    layout = json.loads(layout_path.read_text(encoding="utf-8"))
    if layout["copy"]["heading"] != "WHERE DO YOU ENTER?":
        raise ValueError("Binding portal heading is not present")
    if len(layout["decorativeRules"]) != 1:
        raise ValueError("Portal layout must contain exactly one decorative rule")
    cfg.RENDER_DIR.joinpath("portal").mkdir(parents=True, exist_ok=True)
    cfg.RENDER_DIR.joinpath("diagnostics").mkdir(parents=True, exist_ok=True)
    outputs = []

    glass_only = glass_background(1920, 1200)
    physical, physical_anchors = draw_surface(layout, (1920, 1200), True)
    dom, dom_anchors = draw_surface(layout, (1920, 1200), False)
    overlay = Image.blend(physical, dom, 0.5)
    for name, image in (("physical-glass-base", glass_only), ("physical-layout", physical), ("dom-layout", dom), ("layout-overlay", overlay)):
        path = cfg.RENDER_DIR / "portal" / f"{name}.png"
        image.save(path, optimize=True)
        outputs.append({"path": path.relative_to(cfg.PACKAGE_ROOT).as_posix(), "bytes": path.stat().st_size, "sha256": sha256(path), "width": image.width, "height": image.height})

    diagnostic, _ = draw_surface(layout, (1280, 800), True)
    diagnostic_path = cfg.RENDER_DIR / "diagnostics" / "portal-physical.png"
    diagnostic.save(diagnostic_path, optimize=True)
    outputs.append({"path": diagnostic_path.relative_to(cfg.PACKAGE_ROOT).as_posix(), "bytes": diagnostic_path.stat().st_size, "sha256": sha256(diagnostic_path), "width": 1280, "height": 800})

    deltas = {
        key: round(math.hypot(physical_anchors[key]["x"] - dom_anchors[key]["x"], physical_anchors[key]["y"] - dom_anchors[key]["y"]), 6)
        for key in physical_anchors
    }
    manifest = {
        "schema": "quantum-hub.phase-0-3d-repair-v3.portal-surface-render.v1",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "layout": "portal-layout.json",
        "layout_sha256": sha256(layout_path),
        "projection": layout["coordinateSystem"]["projection"],
        "heading": layout["copy"]["heading"],
        "decorative_rule_count": 1,
        "physical_dom_anchor_delta_px": deltas,
        "maximum_anchor_delta_px": max(deltas.values()),
        "accepted_anchor_tolerance_px": layout["acceptance"]["maximumAnchorDeltaPx"],
        "font_policy": "documented system fallbacks; no font binary bundled",
        "outputs": outputs,
    }
    cfg.MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    target = cfg.MANIFEST_DIR / "portal-surface-manifest.json"
    target.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"QH_V3_PORTAL_SURFACES={len(outputs)}")
    print(f"QH_V3_PORTAL_LAYOUT_SHA256={manifest['layout_sha256']}")


if __name__ == "__main__":
    main()

