"""Compose the four Phase 0.3 browser-derived human-review sheets.

Every normalized browser capture is pasted at its native pixel dimensions.
The compositor adds labels and Dark V2 review framing outside capture bounds;
it never rescales, repaints, or overlays captured browser pixels.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


PACKAGE = Path(__file__).resolve().parents[1]
REPOSITORY = PACKAGE.parents[2]
EVIDENCE = REPOSITORY / "artifacts" / "evidence" / "phase-0-3d-repair-v3"
MATRIX_PATH = EVIDENCE / "browser-matrix-report.json"
REVIEW = PACKAGE / "review"
MANIFEST_PATH = PACKAGE / "manifests" / "browser-review-composition-manifest.json"

EXPECTED_MATRIX_SHA256 = "8272764a01ac18b4aed7b8b0ebffdca812a5f235e51d6c2c2ea6ae744c6ac4fc"

BG = "#0e1112"
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


if sha256(MATRIX_PATH) != EXPECTED_MATRIX_SHA256:
    raise RuntimeError("The released Phase 0.3 browser-matrix authority has changed")

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
    draw.rectangle(
        (x - 2, y - 2, x + image.width + 1, y + image.height + 1),
        outline=LINE,
        width=2,
    )
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
        "derivation": (
            "normalized browser rasters pasted 1:1 with no additional compositor "
            "resampling or repainting; each source records its matrix normalization lineage"
        ),
        "sources": sources,
    }


def portal_sheet() -> dict:
    canvas = Image.new("RGB", (3300, 2500), BG)
    draw = ImageDraw.Draw(canvas)
    heading(
        draw,
        "07 / PORTAL TYPOGRAPHY",
        "Whole-word semantic operating surface",
        "Actual HTML/CSS · fallback typography · one shared portal authority · all selected captures PASS",
    )
    sources = [
        paste_capture(canvas, draw, "portal-actual--desktop-1440x900", 60, 210, "1440 × 900 · DESKTOP"),
        paste_capture(canvas, draw, "portal-actual--tablet-landscape-1024x768", 1560, 210, "1024 × 768 · TABLET"),
        paste_capture(canvas, draw, "portal-actual--mobile-390x844", 60, 1230, "390 × 844"),
        paste_capture(canvas, draw, "portal-actual--narrow-320x800", 510, 1230, "320 × 800"),
        paste_capture(canvas, draw, "portal-actual--mobile-landscape-844x390", 890, 1230, "844 × 390 · LANDSCAPE"),
    ]
    draw.text((1800, 1270), "WHOLE-WORD GATE", fill=WARM, font=font(20, bold=True))
    notes = (
        "WHERE · DO · YOU · ENTER remain whole.\n"
        "No heading uses break-all or anywhere wrapping.\n"
        "The sole divider stays below the H1.\n"
        "Semantic surfaces use normal document flow.\n"
        "Matrix anchor tolerance and rule clearance pass."
    )
    draw.multiline_text((1800, 1315), notes, fill=COOL, font=font(21), spacing=14)
    draw.text(
        (60, 2445),
        "Native browser pixels pasted 1:1 · no focus ring in neutral cases · no compositor resampling",
        fill=MUTED,
        font=font(17),
    )
    return save_sheet(
        canvas,
        "portal-typography-v3-sheet.png",
        sources,
        "Five exact responsive portal viewports proving whole-word semantic typography",
    )


def desktop_sheet() -> dict:
    canvas = Image.new("RGB", (3060, 3210), BG)
    draw = ImageDraw.Draw(canvas)
    heading(
        draw,
        "08 / RESPONSIVE HERO",
        "Desktop + tablet browser evidence",
        "Actual semantic HTML/CSS overlay · exact viewports · frozen Aperture Station pixels · all captures PASS",
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
        "A directional quiet field replaces an opaque copy card.\n"
        "The installed Aperture Station remains right-weighted.\n"
        "Dormant scene contains no environmental magenta.\n"
        "Scene keepouts and horizontal-overflow gates pass."
    )
    draw.multiline_text((900, 2190), notes, fill=COOL, font=font(22), spacing=15)
    draw.text(
        (60, 3160),
        "Exact CSS viewports verified by the browser matrix · captured UI pixels are unmodified",
        fill=MUTED,
        font=font(17),
    )
    return save_sheet(
        canvas,
        "desktop-hero-composition-v3.png",
        sources,
        "Five exact desktop and tablet hero viewports composed from normalized browser captures",
    )


def mobile_sheet() -> dict:
    canvas = Image.new("RGB", (1500, 2100), BG)
    draw = ImageDraw.Draw(canvas)
    heading(
        draw,
        "09 / AUTHORED MOBILE",
        "Portrait + landscape browser evidence",
        "Independent 2.25-turn mobile composition · actual semantic overlay · all captures PASS",
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
        "Approximately 2.17 turns remain visible.\n"
        "Station and physical cable stay legible.\n"
        "Actions remain at least 44 CSS px high.\n"
        "No horizontal overflow at 320 px."
    )
    draw.multiline_text((970, 1240), notes, fill=COOL, font=font(19), spacing=12)
    draw.text(
        (60, 2045),
        "Native capture pixels pasted 1:1 · no resampling · no neutral-state focus artifact",
        fill=MUTED,
        font=font(17),
    )
    return save_sheet(
        canvas,
        "mobile-hero-composition-v3.png",
        sources,
        "Four exact mobile hero viewports composed from normalized browser captures",
    )


def zoom_and_fallback_sheet() -> dict:
    canvas = Image.new("RGB", (3300, 2500), BG)
    draw = ImageDraw.Draw(canvas)
    heading(
        draw,
        "10 / TEXT STRESS + FALLBACK",
        "True 200% text under metric-conscious system fallbacks",
        "Hero and portal · wide, portrait, narrow, and landscape states · whole-word checks PASS",
    )
    sources = [
        paste_capture(canvas, draw, "hero-zoom-200--desktop-1440x900", 60, 220, "HERO · 200% · 1440 × 900"),
        paste_capture(canvas, draw, "portal-zoom-200--desktop-1440x900", 1560, 220, "PORTAL · 200% · 1440 × 900"),
        paste_capture(canvas, draw, "hero-zoom-200--mobile-390x844", 60, 1210, "HERO · 200% · 390 × 844"),
        paste_capture(canvas, draw, "portal-zoom-200--mobile-390x844", 510, 1210, "PORTAL · 200% · 390 × 844"),
        paste_capture(canvas, draw, "hero-zoom-200--narrow-320x800", 960, 1210, "HERO · 200% · 320 × 800"),
        paste_capture(canvas, draw, "portal-zoom-200--narrow-320x800", 1340, 1210, "PORTAL · 200% · 320 × 800"),
        paste_capture(canvas, draw, "portal-zoom-200--mobile-landscape-844x390", 1720, 1210, "PORTAL · 200% · 844 × 390"),
    ]
    draw.text((2620, 1260), "FALLBACK MODE", fill=WARM, font=font(20, bold=True))
    notes = (
        "Display: Arial Black / Arial\n"
        "Editorial: Georgia / Times New Roman\n"
        "UI: Arial / Helvetica\n\n"
        "No bundled font binary.\n"
        "No mid-word fragmentation.\n"
        "No horizontal overflow.\n"
        "Vertical document flow is allowed."
    )
    draw.multiline_text((2620, 1305), notes, fill=COOL, font=font(19), spacing=12)
    draw.text(
        (60, 2445),
        "The browser matrix is authoritative for computed font families, whole-word line reports, and every PASS result.",
        fill=MUTED,
        font=font(17),
    )
    return save_sheet(
        canvas,
        "text-zoom-and-fallback-v3.png",
        sources,
        "Representative 200-percent text evidence under forced metric-conscious system fallbacks",
    )


def main() -> None:
    expected_schema = "quantum-hub.phase-0-3d-repair-v3.typography-collision-matrix.v1"
    if MATRIX.get("schema") != expected_schema:
        raise RuntimeError(f"Unexpected browser matrix schema: {MATRIX.get('schema')}")
    if len(MATRIX.get("cases", [])) != 46:
        raise RuntimeError("The Phase 0.3 browser matrix is not complete")
    records = [portal_sheet(), desktop_sheet(), mobile_sheet(), zoom_and_fallback_sheet()]
    if any(not source["matrixPass"] for record in records for source in record["sources"]):
        raise RuntimeError("A selected browser source did not pass its matrix case")
    manifest = {
        "schema": "quantum-hub.phase-0-3d-repair-v3.browser-review-composition.v1",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "browser_matrix": {
            "path": repo_relative(MATRIX_PATH),
            "schema": MATRIX["schema"],
            "sha256": sha256(MATRIX_PATH),
            "bytes": MATRIX_PATH.stat().st_size,
            "cases_total": len(MATRIX["cases"]),
            "cases_passed": sum(
                1
                for case in MATRIX["cases"]
                if case["report"]["pass"] and case["runner"]["pass"]
            ),
            "normalized_capture_count": sum(
                1 for case in MATRIX["cases"] if (case.get("capture") or {}).get("path")
            ),
            "font_mode": MATRIX["fontMode"],
        },
        "pixel_policy": {
            "compositor_capture_scale": 1.0,
            "compositor_resampled": False,
            "repainted": False,
            "labels_overlap_capture_pixels": False,
            "source_normalization": (
                "per-source capture normalization is copied verbatim from the browser matrix; "
                "wide evidence may use the matrix-declared Lanczos restoration"
            ),
        },
        "records": records,
    }
    MANIFEST_PATH.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )
    print("QH_V3_BROWSER_REVIEW=PASS")
    print(f"QH_V3_BROWSER_REVIEW_OUTPUTS={len(records)}")


if __name__ == "__main__":
    main()
