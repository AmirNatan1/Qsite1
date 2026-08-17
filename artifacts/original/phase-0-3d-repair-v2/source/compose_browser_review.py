"""Compose the three Phase 0.2 browser-derived review sheets.

Every browser capture is pasted at its native pixel dimensions. The compositor
adds labels and review framing outside the capture bounds only; it never
rescales, repaints, or overlays the captured browser pixels.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


PACKAGE = Path(__file__).resolve().parents[1]
REPOSITORY = PACKAGE.parents[2]
EVIDENCE = REPOSITORY / "artifacts" / "evidence" / "phase-0-3d-repair-v2"
MATRIX_PATH = EVIDENCE / "browser-matrix-report.json"
REVIEW = PACKAGE / "review"
MANIFEST_PATH = PACKAGE / "manifests" / "browser-review-composition-manifest.json"

BG = "#0e1112"
PANEL = "#151a1b"
WHITE = "#f5f7f7"
COOL = "#aab4b6"
MUTED = "#718084"
WARM = "#f06ba0"
LINE = "#354043"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def repo_relative(path: Path) -> str:
    return path.resolve().relative_to(REPOSITORY.resolve()).as_posix()


def font(size: int, *, bold: bool = False) -> ImageFont.ImageFont:
    candidates = (
        Path("C:/Windows/Fonts/arialbd.ttf") if bold else Path("C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/segoeuib.ttf") if bold else Path("C:/Windows/Fonts/segoeui.ttf"),
    )
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


MATRIX = json.loads(MATRIX_PATH.read_text(encoding="utf-8"))
CASES = {case["id"]: case for case in MATRIX["cases"]}


def capture(capture_id: str) -> tuple[Image.Image, dict]:
    case = CASES[capture_id]
    record = case["capture"]
    path = REPOSITORY / record["path"]
    if not path.is_file():
        raise FileNotFoundError(record["path"])
    if sha256(path) != record["sha256"]:
        raise RuntimeError(f"Matrix hash mismatch: {capture_id}")
    opened = Image.open(path).convert("RGB")
    if opened.size != (record["width"], record["height"]):
        raise RuntimeError(f"Matrix dimensions mismatch: {capture_id}")
    return opened, {
        "captureId": capture_id,
        "path": record["path"],
        "sha256": record["sha256"],
        "bytes": record["bytes"],
        "width": record["width"],
        "height": record["height"],
        "normalization": record["normalization"],
        "matrixPass": bool(case["report"]["pass"] and case["runner"]["pass"]),
    }


def heading(draw: ImageDraw.ImageDraw, index: str, title: str, subtitle: str) -> None:
    draw.text((60, 38), index, fill=WARM, font=font(23, bold=True))
    draw.text((60, 72), title, fill=WHITE, font=font(46, bold=True))
    draw.text((62, 130), subtitle, fill=COOL, font=font(19))


def paste_capture(
    canvas: Image.Image,
    draw: ImageDraw.ImageDraw,
    capture_id: str,
    x: int,
    y: int,
    label: str,
) -> dict:
    image, record = capture(capture_id)
    draw.text((x, y - 30), label, fill=WHITE, font=font(18, bold=True))
    draw.rectangle((x - 2, y - 2, x + image.width + 1, y + image.height + 1), outline=LINE, width=2)
    canvas.paste(image, (x, y))
    return record


def save_sheet(canvas: Image.Image, filename: str, sources: list[dict], purpose: str) -> dict:
    REVIEW.mkdir(parents=True, exist_ok=True)
    output = REVIEW / filename
    canvas.save(output, format="PNG", optimize=True, compress_level=9)
    return {
        "path": output.relative_to(PACKAGE).as_posix(),
        "repositoryPath": repo_relative(output),
        "width": canvas.width,
        "height": canvas.height,
        "bytes": output.stat().st_size,
        "sha256": sha256(output),
        "purpose": purpose,
        "derivation": "normalized browser rasters pasted 1:1 with no additional compositor resampling or repainting; each source records its matrix normalization lineage",
        "sources": sources,
    }


def desktop_sheet() -> dict:
    canvas = Image.new("RGB", (3060, 3210), BG)
    draw = ImageDraw.Draw(canvas)
    heading(
        draw,
        "08 / RESPONSIVE HERO",
        "Desktop + tablet browser evidence",
        "Actual semantic HTML/CSS overlay · exact viewports · forced metric-conscious fallback · all captures PASS",
    )
    sources = [
        paste_capture(canvas, draw, "hero-actual--desktop-1440x900", 60, 200, "1440 × 900 · DESKTOP"),
        paste_capture(canvas, draw, "hero-actual--short-desktop-1366x650", 1560, 200, "1366 × 650 · SHORT DESKTOP"),
        paste_capture(canvas, draw, "hero-actual--desktop-1280x800", 60, 1190, "1280 × 800 · DESKTOP"),
        paste_capture(canvas, draw, "hero-actual--tablet-landscape-1024x768", 1420, 1190, "1024 × 768 · TABLET LANDSCAPE"),
        paste_capture(canvas, draw, "hero-actual--tablet-portrait-768x1024", 60, 2080, "768 × 1024 · TABLET PORTRAIT"),
    ]
    draw.text((900, 2145), "COPY / SCENE CONTRACT", fill=WARM, font=font(20, bold=True))
    notes = (
        "Semantic hero copy remains live DOM text.\n"
        "The quiet left field is preserved without an opaque copy box.\n"
        "The Field Unit remains lower-right / right-middle.\n"
        "Dormant state contains no authored magenta illumination.\n"
        "No horizontal overflow or glyph collision was reported."
    )
    draw.multiline_text((900, 2190), notes, fill=COOL, font=font(22), spacing=15)
    draw.text((60, 3160), "Exact CSS viewports are verified by the browser matrix; wide evidence uses the declared scale / Lanczos lineage.", fill=MUTED, font=font(17))
    return save_sheet(
        canvas,
        "desktop-hero-composition-v2.png",
        sources,
        "Five exact desktop/tablet hero viewports composed from normalized browser captures",
    )


def mobile_sheet() -> dict:
    canvas = Image.new("RGB", (1500, 2100), BG)
    draw = ImageDraw.Draw(canvas)
    heading(
        draw,
        "09 / AUTHORED MOBILE",
        "Portrait + landscape browser evidence",
        "Independent mobile composition · actual semantic overlay · exact touch viewports · all captures PASS",
    )
    sources = [
        paste_capture(canvas, draw, "hero-actual--mobile-390x844", 60, 220, "390 × 844"),
        paste_capture(canvas, draw, "hero-actual--mobile-360x800", 510, 220, "360 × 800"),
        paste_capture(canvas, draw, "hero-actual--narrow-320x800", 930, 220, "320 × 800"),
        paste_capture(canvas, draw, "hero-actual--mobile-landscape-844x390", 60, 1160, "844 × 390 · MOBILE LANDSCAPE"),
    ]
    draw.text((970, 1200), "RESPONSIVE PROOF", fill=WARM, font=font(19, bold=True))
    notes = (
        "Portrait is independently authored,\n"
        "not a desktop crop.\n\n"
        "Spiral and larger device remain legible.\n"
        "Semantic actions remain visible.\n"
        "Natural document flow; no nested scroller.\n"
        "No horizontal overflow at 320 px."
    )
    draw.multiline_text((970, 1240), notes, fill=COOL, font=font(19), spacing=12)
    draw.text((60, 2045), "Native capture pixels pasted 1:1 · system fallback typography forced and verified · no resampling", fill=MUTED, font=font(17))
    return save_sheet(
        canvas,
        "mobile-hero-composition-v2.png",
        sources,
        "Four exact mobile hero viewports composed from normalized browser captures",
    )


def zoom_and_fallback_sheet() -> dict:
    canvas = Image.new("RGB", (3060, 2100), BG)
    draw = ImageDraw.Draw(canvas)
    heading(
        draw,
        "10 / TEXT STRESS + FALLBACK",
        "True 200% zoom under metric-conscious system fallbacks",
        "Hero and portal surfaces · desktop, narrow portrait, and mobile landscape · all typography checks PASS",
    )
    sources = [
        paste_capture(canvas, draw, "hero-zoom-200--desktop-1440x900", 60, 220, "HERO · 200% · 1440 × 900"),
        paste_capture(canvas, draw, "portal-zoom-200--desktop-1440x900", 1560, 220, "PORTAL · 200% · 1440 × 900"),
        paste_capture(canvas, draw, "hero-zoom-200--narrow-320x800", 60, 1210, "HERO · 200% · 320 × 800"),
        paste_capture(canvas, draw, "portal-zoom-200--narrow-320x800", 440, 1210, "PORTAL · 200% · 320 × 800"),
        paste_capture(canvas, draw, "portal-zoom-200--mobile-landscape-844x390", 830, 1210, "PORTAL · 200% · 844 × 390"),
    ]
    draw.text((1740, 1280), "FALLBACK MODE", fill=WARM, font=font(20, bold=True))
    notes = (
        "Display: Arial Black / Arial\n"
        "Editorial: Georgia / Times New Roman\n"
        "UI: Arial / Helvetica\n\n"
        "No bundled font binary.\n"
        "No glyph collision.\n"
        "No horizontal overflow.\n"
        "No rule / expanded-glyph intersection."
    )
    draw.multiline_text((1740, 1325), notes, fill=COOL, font=font(20), spacing=13)
    draw.text((60, 2045), "The browser report, not this label layer, is authoritative for computed font families and each PASS result.", fill=MUTED, font=font(17))
    return save_sheet(
        canvas,
        "text-zoom-and-fallback-v2.png",
        sources,
        "Representative true-200-percent zoom evidence under forced metric-conscious system fallbacks",
    )


def main() -> None:
    expected_schema = "quantum-hub.phase-0-3d-repair-v2.typography-collision-matrix.v1"
    if MATRIX.get("schema") != expected_schema:
        raise RuntimeError(f"Unexpected browser matrix schema: {MATRIX.get('schema')}")
    records = [desktop_sheet(), mobile_sheet(), zoom_and_fallback_sheet()]
    if any(not source["matrixPass"] for record in records for source in record["sources"]):
        raise RuntimeError("A selected browser source did not pass its matrix case")
    manifest = {
        "schema": "quantum-hub.phase-0-3d-repair-v2.browser-review-composition.v1",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "browser_matrix": {
            "path": repo_relative(MATRIX_PATH),
            "schema": MATRIX["schema"],
            "sha256": sha256(MATRIX_PATH),
            "cases_total": len(MATRIX["cases"]),
            "cases_passed": sum(1 for case in MATRIX["cases"] if case["report"]["pass"] and case["runner"]["pass"]),
            "font_mode": MATRIX["fontMode"],
        },
        "pixel_policy": {
            "compositor_capture_scale": 1.0,
            "compositor_resampled": False,
            "repainted": False,
            "labels_overlap_capture_pixels": False,
            "source_normalization": "per-source capture normalization is copied verbatim from the browser matrix; wide evidence may use declared Lanczos restoration",
        },
        "records": records,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    print("QH_V2_BROWSER_REVIEW=PASS")
    print(f"QH_V2_BROWSER_REVIEW_OUTPUTS={len(records)}")


if __name__ == "__main__":
    main()
