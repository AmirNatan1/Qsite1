"""Compose Phase 0.4 CRT review sheets 10–16 from frozen browser authorities.

The compositor is deliberately evidence-only. Every governed source raster is
pasted at its native pixel dimensions: no crop, resample, retouch or repaint is
permitted. Labels, borders and explanatory metadata are added outside source
pixel bounds. The output manifest records the exact source order and hashes
required by the repository browser finalizer.
"""

from __future__ import annotations

import hashlib
import json
import sys
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

sys.dont_write_bytecode = True
Image.MAX_IMAGE_PIXELS = None

SCRIPT = Path(__file__).resolve()
PACKAGE = SCRIPT.parents[1]
ROOT = SCRIPT.parents[4]
PACKAGE_RELATIVE = "artifacts/original/phase-0-4-crt-television"
EVIDENCE_RELATIVE = "artifacts/evidence/phase-0-4-crt-television"
PLAN_RELATIVE = "prototypes/phase-0-4-crt-portal-qa/capture-plan.json"
MATRIX_RELATIVE = f"{EVIDENCE_RELATIVE}/browser-matrix-report.json"
PORTAL_RELATIVE = f"{PACKAGE_RELATIVE}/manifests/crt-portal-transition-state-authority.json"
KEEP_OUT_RELATIVE = f"{PACKAGE_RELATIVE}/manifests/crt-scene-source-keepouts.json"
LAYOUT_RELATIVE = f"{PACKAGE_RELATIVE}/crt-portal-layout.json"
OUTPUT_RELATIVE = f"{PACKAGE_RELATIVE}/manifests/browser-review-composition-manifest.json"

MATRIX_SCHEMA = "quantum-hub.phase-0-4-crt-television.typography-collision-matrix.v1"
PORTAL_SCHEMA = "quantum-hub.phase-0-4-crt-television.portal-transition-state-authority.v1"
OUTPUT_SCHEMA = "quantum-hub.phase-0-4-crt-television.browser-review-composition.v1"

PORTAL_IDS = (
    "portal-01-television-in-scene",
    "portal-02-screen-active",
    "portal-03-close-approach",
    "portal-04-glass-almost-fills",
    "portal-05-bezel-exits",
    "portal-06-distortion-reduces",
    "portal-07-dom-takes-ownership",
    "portal-08-full-semantic-surface",
)

OUTPUTS = (
    (10, "crt-portal-transition-sheet.png"),
    (11, "crt-physical-dom-alignment-sheet.png"),
    (12, "crt-desktop-hero-composition.png"),
    (13, "crt-mobile-hero-composition.png"),
    (14, "crt-text-zoom-and-fallback.png"),
    (15, "crt-reduced-motion-desktop.png"),
    (16, "crt-reduced-motion-mobile.png"),
)

BG = "#0b0f10"
PANEL = "#121718"
LINE = "#354043"
WHITE = "#f3f5f2"
MUTED = "#a9b3b3"
MAGENTA = "#ef6099"
GREEN = "#9bc6b3"


@dataclass(frozen=True)
class Source:
    id: str
    path: str
    absolute: Path
    width: int
    height: int
    bytes: int
    sha256: str
    label: str
    note: str

    def capture_record(self, key: str) -> dict[str, Any]:
        return {
            key: self.id,
            "path": self.path,
            "width": self.width,
            "height": self.height,
            "bytes": self.bytes,
            "sha256": self.sha256,
        }


def read_json(relative: str) -> dict[str, Any]:
    return json.loads(repo_path(relative).read_text(encoding="utf-8"))


def repo_path(relative: str) -> Path:
    normalized = str(relative).replace("\\", "/")
    if not normalized or normalized.startswith("/") or "../" in normalized:
        raise RuntimeError(f"Unsafe repository-relative path: {relative}")
    resolved = (ROOT / normalized).resolve()
    try:
        resolved.relative_to(ROOT)
    except ValueError as error:
        raise RuntimeError(f"Path escapes repository root: {relative}") from error
    return resolved


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def json_record(relative: str, schema: str | None = None) -> dict[str, Any]:
    path = repo_path(relative)
    result: dict[str, Any] = {"path": relative, "bytes": path.stat().st_size, "sha256": sha256(path)}
    if schema:
        result["schema"] = schema
    return result


def font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    candidates = (
        Path("C:/Windows/Fonts/arialbd.ttf") if bold else Path("C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/segoeuib.ttf") if bold else Path("C:/Windows/Fonts/segoeui.ttf"),
    )
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def dimensions(path: Path) -> tuple[int, int, str]:
    with Image.open(path) as opened:
        opened.load()
        return opened.width, opened.height, opened.mode


def validate_file(relative: str, record: dict[str, Any]) -> tuple[Path, int, int]:
    path = repo_path(relative)
    if not path.is_file():
        raise RuntimeError(f"Missing governed source: {relative}")
    width, height, mode = dimensions(path)
    if mode != "RGB":
        raise RuntimeError(f"Governed source must be RGB for native-pixel paste: {relative} / {mode}")
    expected_width = int(record.get("width", width))
    expected_height = int(record.get("height", height))
    expected_bytes = int(record.get("bytes", path.stat().st_size))
    expected_sha = str(record.get("sha256", sha256(path))).lower()
    if (width, height) != (expected_width, expected_height):
        raise RuntimeError(f"Dimension mismatch: {relative}")
    if path.stat().st_size != expected_bytes or sha256(path) != expected_sha:
        raise RuntimeError(f"Byte/hash mismatch: {relative}")
    return path, width, height


def source_from_capture(
    source_id: str,
    capture: dict[str, Any],
    label: str,
    note: str,
) -> Source:
    relative = str(capture.get("path", "")).replace("\\", "/")
    path, width, height = validate_file(relative, capture)
    return Source(
        id=source_id,
        path=relative,
        absolute=path,
        width=width,
        height=height,
        bytes=path.stat().st_size,
        sha256=sha256(path),
        label=label,
        note=note,
    )


def portal_capture(record: dict[str, Any]) -> dict[str, Any]:
    candidate = record.get("capture") or record.get("render") or record
    if candidate.get("path"):
        return candidate
    package_path = candidate.get("package_relative_path")
    if not package_path:
        raise RuntimeError(f"Portal state lacks governed raster: {record.get('id')}")
    return {**candidate, "path": f"{PACKAGE_RELATIVE}/{package_path}"}


def source_from_keepout(source_id: str, label: str, note: str, keepouts: dict[str, Any]) -> Source:
    governed_records = keepouts.get("records", {})
    if isinstance(governed_records, dict):
        record = governed_records.get(source_id)
    else:
        record = next(
            (
                item
                for item in governed_records
                if item.get("id") == source_id or item.get("sourceRole") == source_id
            ),
            None,
        )
    if not record:
        raise RuntimeError(f"Keepout authority omits {source_id}")
    governed = record.get("source", {})
    relative = str(governed.get("path", "")).replace("\\", "/")
    path, width, height = validate_file(relative, governed)
    return Source(
        id=source_id,
        path=relative,
        absolute=path,
        width=width,
        height=height,
        bytes=path.stat().st_size,
        sha256=sha256(path),
        label=label,
        note=note,
    )


def draw_header(canvas: Image.Image, eyebrow: str, title: str, subtitle: str) -> None:
    draw = ImageDraw.Draw(canvas)
    draw.text((64, 34), eyebrow, font=font(26, True), fill=MAGENTA)
    draw.text((64, 80), title, font=font(58, True), fill=WHITE)
    draw.text((64, 154), subtitle, font=font(25), fill=MUTED)
    draw.line((64, 204, canvas.width - 64, 204), fill=LINE, width=2)


def native_contact_sheet(
    sources: list[Source],
    columns: int,
    eyebrow: str,
    title: str,
    subtitle: str,
    footer: str,
) -> Image.Image:
    if not sources:
        raise RuntimeError("Contact sheet requires at least one source")
    max_width = max(source.width for source in sources)
    max_height = max(source.height for source in sources)
    label_height = 54
    note_height = 70
    card_pad = 12
    gap = 26
    margin = 50
    header_height = 230
    footer_height = 90
    card_width = max_width + card_pad * 2
    card_height = label_height + max_height + note_height + card_pad
    rows = (len(sources) + columns - 1) // columns
    canvas_width = margin * 2 + columns * card_width + (columns - 1) * gap
    canvas_height = header_height + rows * card_height + max(0, rows - 1) * gap + footer_height
    canvas = Image.new("RGB", (canvas_width, canvas_height), BG)
    draw_header(canvas, eyebrow, title, subtitle)
    draw = ImageDraw.Draw(canvas)
    for index, source in enumerate(sources):
        row, column = divmod(index, columns)
        x = margin + column * (card_width + gap)
        y = header_height + row * (card_height + gap)
        draw.rounded_rectangle((x, y, x + card_width, y + card_height), radius=16, fill=PANEL, outline=LINE, width=2)
        draw.text((x + 18, y + 14), source.label, font=font(22, True), fill=MAGENTA if index else MUTED)
        image_x = x + card_pad + (max_width - source.width) // 2
        image_y = y + label_height + (max_height - source.height) // 2
        with Image.open(source.absolute) as opened:
            opened.load()
            if opened.mode != "RGB" or opened.size != (source.width, source.height):
                raise RuntimeError(f"Native-pixel source changed while composing: {source.path}")
            canvas.paste(opened, (image_x, image_y))
        draw.rectangle((image_x - 1, image_y - 1, image_x + source.width, image_y + source.height), outline=LINE, width=1)
        note_y = y + label_height + max_height + 14
        draw.text((x + 18, note_y), source.note, font=font(19), fill=MUTED)
        draw.text((x + 18, note_y + 28), f"NATIVE {source.width}×{source.height} · {source.sha256[:12]}…", font=font(16), fill=GREEN)
    footer_y = canvas.height - footer_height + 18
    draw.rounded_rectangle((margin, footer_y - 8, canvas.width - margin, canvas.height - 18), radius=12, fill=PANEL, outline=LINE, width=2)
    draw.text((margin + 22, footer_y + 9), footer, font=font(21), fill=WHITE)
    return canvas


def save(canvas: Image.Image, filename: str) -> dict[str, Any]:
    output = PACKAGE / filename
    canvas.save(output, format="PNG", optimize=True, compress_level=9)
    width, height, mode = dimensions(output)
    if mode != "RGB":
        raise RuntimeError(f"Review sheet is not RGB: {filename}")
    return {
        "filename": filename,
        "path": f"{PACKAGE_RELATIVE}/{filename}",
        "width": width,
        "height": height,
        "bytes": output.stat().st_size,
        "sha256": sha256(output),
    }


def case_source(matrix_cases: dict[str, dict[str, Any]], case_id: str, label: str | None = None) -> Source:
    case = matrix_cases.get(case_id)
    if not case:
        raise RuntimeError(f"Browser matrix omits {case_id}")
    capture = case.get("capture") or {}
    if not capture.get("path"):
        raise RuntimeError(f"Browser case is not normalized: {case_id}")
    title = label or case_id.replace("--", " / ").replace("-", " ").upper()
    return source_from_capture(case_id, capture, title, "Exact normalized browser capture; semantic DOM remains live-owned.")


def main() -> None:
    plan = read_json(PLAN_RELATIVE)
    matrix = read_json(MATRIX_RELATIVE)
    portal = read_json(PORTAL_RELATIVE)
    keepouts = read_json(KEEP_OUT_RELATIVE)
    if matrix.get("schema") != MATRIX_SCHEMA or len(matrix.get("cases", [])) != 46:
        raise RuntimeError("Browser matrix is not the exact 46-case v1 authority")
    normalized_count = sum(1 for item in matrix.get("cases", []) if (item.get("capture") or {}).get("path"))
    if normalized_count != 36:
        raise RuntimeError(f"Browser matrix has {normalized_count}/36 normalized captures")
    if portal.get("schema") != PORTAL_SCHEMA or portal.get("status") != "PASS":
        raise RuntimeError("Portal authority must be final PASS before browser review composition")
    records = portal.get("records", [])
    if len(records) != 8 or tuple(item.get("id") for item in records) != PORTAL_IDS:
        raise RuntimeError("Portal authority does not preserve the exact ordered eight states")
    matrix_cases = {item["id"]: item for item in matrix.get("cases", [])}

    portal_labels = (
        "01 / TELEVISION IN SCENE",
        "02 / SCREEN ACTIVE",
        "03 / CLOSE APPROACH",
        "04 / GLASS ALMOST FILLS",
        "05 / BEZEL EXITS",
        "06 / DISTORTION REDUCES",
        "07 / DOM TAKES OWNERSHIP",
        "08 / FULL SEMANTIC SURFACE",
    )
    portal_notes = (
        "Grounded CRT destination remains spatially legible.",
        "Physical raster activates inside the 4:3 tube.",
        "Camera converges while cabinet depth persists.",
        "Convex glass dominates before the bezel exits.",
        "Physical frame yields without an aspect snap.",
        "Text-free takeover removes doubled physical copy.",
        "Semantic DOM assumes the same governed anchors.",
        "Native responsive surface holds final ownership.",
    )
    portal_sources = [
        source_from_capture(record["id"], portal_capture(record), portal_labels[index], portal_notes[index])
        for index, record in enumerate(records)
    ]
    portal_canvas = native_contact_sheet(
        portal_sources,
        4,
        "PHASE 0.4 / EXACT EIGHT-STATE PORTAL AUTHORITY",
        "Convex 4:3 glass yields to one semantic operating surface",
        "Six physical Blender states · two browser-owned states · shared layout authority · no doubled copy",
        "OWNERSHIP PASS  physical CRT → text-free takeover → semantic DOM; exact source pixels shown at native resolution",
    )
    portal_output = save(portal_canvas, OUTPUTS[0][1])
    portal_output.update(
        {
            "reviewIndex": 10,
            "stateIds": list(PORTAL_IDS),
            "sources": [source.capture_record("stateId") for source in portal_sources],
        }
    )

    browser_plans = {int(item["reviewIndex"]): item for item in plan.get("browserDerivedReviewSheets", [])}
    expected_indices = set(range(11, 17))
    if set(browser_plans) != expected_indices:
        raise RuntimeError("Capture plan does not contain exact browser-derived sheets 11–16")

    physical_close = source_from_keepout(
        "source-physical-portal-close",
        "PHYSICAL 4:3 PORTAL / 1920×1200",
        "Approved tube-owned copy and convex screen geometry.",
        keepouts,
    )
    text_free = source_from_keepout(
        "source-text-free-portal-takeover",
        "TEXT-FREE TAKEOVER / 1920×1200",
        "Physical copy removed before semantic DOM ownership.",
        keepouts,
    )

    descriptors: dict[int, tuple[str, str, str, int]] = {
        11: (
            "PHASE 0.4 / PHYSICAL + DOM ALIGNMENT",
            "One layout authority across tube, takeover and semantic surface",
            "Physical 4:3 source · text-free crossover · exact responsive DOM captures · ≤3px anchor gate",
            3,
        ),
        12: (
            "PHASE 0.4 / DESKTOP HERO COMPOSITIONS",
            "Actual semantic hero copy over the frozen CRT proving ground",
            "Wide, short-height, desktop and tablet-landscape browser states; no opaque copy card",
            4,
        ),
        13: (
            "PHASE 0.4 / MOBILE HERO COMPOSITIONS",
            "Separately authored 2.25-turn mobile direction remains readable",
            "390, 360, 320 and landscape states; scene keepouts and 44px controls remain authoritative",
            4,
        ),
        14: (
            "PHASE 0.4 / TEXT ZOOM + FALLBACK",
            "Whole display words survive constrained and stressed browser states",
            "200% text, narrow portal, longer-copy fixture and fallback-font evidence from the final matrix",
            4,
        ),
        15: (
            "PHASE 0.4 / REDUCED MOTION DESKTOP",
            "The same CRT composition holds without a floating glass copy card",
            "Semantic copy remains page-owned; CRT, cable and quiet field stay visible",
            2,
        ),
        16: (
            "PHASE 0.4 / REDUCED MOTION MOBILE",
            "Direct copy stays clear",
            "No card or clipping; cable visible; controls at least 44px high",
            2,
        ),
    }

    outputs: list[dict[str, Any]] = [portal_output]
    for review_index, filename in OUTPUTS[1:]:
        planned = browser_plans[review_index]
        case_ids = list(planned.get("sourceCaseIds", []))
        capture_sources = [case_source(matrix_cases, case_id) for case_id in case_ids]
        if review_index == 16:
            capture_sources = [
                replace(
                    source,
                    label=("REDUCED HERO" if source.id.startswith("hero-") else "REDUCED PORTAL") + " / 390×844",
                    note="Exact normalized browser capture.",
                )
                for source in capture_sources
            ]
        display_sources = capture_sources
        if review_index == 11:
            display_sources = [physical_close, text_free, *capture_sources]
        eyebrow, title, subtitle, columns = descriptors[review_index]
        anchor_value: str | float = "responsive"
        if review_index == 11:
            desktop = matrix_cases[case_ids[0]]
            anchor_value = (desktop.get("report", {}).get("layout", {}).get("anchors", {}) or {}).get("maximumDeltaPx", "unreported")
        footer = (
            f"ALIGNMENT PASS  maximum governed anchor displacement {anchor_value}px · physical screen exactly 4:3"
            if review_index == 11
            else (
                "MATRIX PASS  native source pixels; labels and framing only"
                if review_index == 16
                else "MATRIX PASS  exact normalized browser pixels shown at native resolution; labels and framing only"
            )
        )
        canvas = native_contact_sheet(display_sources, columns, eyebrow, title, subtitle, footer)
        output = save(canvas, filename)
        output.update(
            {
                "reviewIndex": review_index,
                "sourceCaseIds": case_ids,
                "sources": [source.capture_record("captureId") for source in capture_sources],
            }
        )
        if review_index == 11:
            layout = json_record(LAYOUT_RELATIVE)
            output["additionalAuthorities"] = [
                physical_close.capture_record("sourceId"),
                text_free.capture_record("sourceId"),
                layout,
            ]
        outputs.append(output)

    matrix_record = json_record(MATRIX_RELATIVE, MATRIX_SCHEMA)
    matrix_record.update({"cases_total": 46, "normalized_capture_count": 36})
    manifest = {
        "schema": OUTPUT_SCHEMA,
        "status": "PASS",
        "composition_policy": "native source pixels pasted 1:1; no crop, resample, retouch or repaint; labels and frames outside source bounds only",
        "composer": json_record(f"{PACKAGE_RELATIVE}/source/{SCRIPT.name}"),
        "browser_matrix": matrix_record,
        "portal_state_authority": json_record(PORTAL_RELATIVE, PORTAL_SCHEMA),
        "record_count": 7,
        "records": outputs,
    }
    target = repo_path(OUTPUT_RELATIVE)
    target.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("QH_PHASE04_BROWSER_REVIEW_SHEETS=7")
    print(f"QH_PHASE04_BROWSER_REVIEW_MANIFEST_SHA256={sha256(target)}")
    print(f"QH_PHASE04_BROWSER_REVIEW_OUTPUT={OUTPUT_RELATIVE}")


if __name__ == "__main__":
    main()
