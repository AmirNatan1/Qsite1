"""Create compact 16-sample preview versus 48-sample production evidence."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFont


REPOSITORY = Path(__file__).resolve().parents[1]
DERIVATIVE = REPOSITORY / (
    "artifacts/original/phase-3-crt-opening/source/"
    "quantum-signal-television-phase3-opening.blend"
)
DERIVATIVE_SHA256 = "bbde82220f500c6f047c2e2d33a8580c08a40e65800615dd7256bebc2f4472ba"
VARIANTS: dict[str, dict[str, Any]] = {
    "desktop": {
        "frames": (1, 72, 126, 154, 196, 246, 270),
        "sheet_frames": (1, 72, 154, 196, 270),
        "preview_size": (1280, 720),
        "production_size": (1920, 1080),
        "panel_size": (360, 203),
    },
    "mobile": {
        "frames": (1, 72, 126, 154, 196, 222, 270),
        "sheet_frames": (1, 72, 154, 196, 270),
        "preview_size": (540, 960),
        "production_size": (720, 1280),
        "panel_size": (216, 384),
    },
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--desktop-preview", type=Path, required=True)
    parser.add_argument("--desktop-production", type=Path, required=True)
    parser.add_argument("--mobile-preview", type=Path, required=True)
    parser.add_argument("--mobile-production", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def outside_repository(path: Path, label: str) -> Path:
    resolved = path.resolve()
    try:
        resolved.relative_to(REPOSITORY)
    except ValueError:
        return resolved
    raise ValueError(f"{label} must remain outside Git")


def image_path(root: Path, variant: str, frame: int) -> Path:
    return root / f"phase3-{variant}-{frame:04d}.png"


def file_identity(path: Path, expected_size: tuple[int, int]) -> dict[str, Any]:
    with Image.open(path) as source:
        size = source.size
    if size != expected_size:
        raise ValueError(f"Unexpected dimensions for {path.name}: {size}, expected {expected_size}")
    return {
        "filename": path.name,
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
        "width": size[0],
        "height": size[1],
    }


def difference_metrics(preview: Image.Image, production: Image.Image) -> tuple[dict[str, Any], Image.Image]:
    preview_rgb = preview.convert("RGB")
    production_equalized = production.convert("RGB").resize(
        preview_rgb.size,
        Image.Resampling.LANCZOS,
    )
    difference = ImageChops.difference(preview_rgb, production_equalized)
    histogram = difference.histogram()
    channel_histogram = [0] * 256
    for channel in range(3):
        for value, count in enumerate(histogram[channel * 256 : (channel + 1) * 256]):
            channel_histogram[value] += count
    values = preview_rgb.width * preview_rgb.height * 3
    absolute_total = sum(value * count for value, count in enumerate(channel_histogram))
    square_total = sum(value * value * count for value, count in enumerate(channel_histogram))
    target = math.ceil(values * 0.95)
    cumulative = 0
    p95 = 255
    for value, count in enumerate(channel_histogram):
        cumulative += count
        if cumulative >= target:
            p95 = value
            break
    maximum = max(value for value, count in enumerate(channel_histogram) if count)
    changed = values - channel_histogram[0]
    metrics = {
        "comparisonGeometry": [preview_rgb.width, preview_rgb.height],
        "productionResample": "Lanczos to native 16-sample preview dimensions",
        "mae8Bit": round(absolute_total / values, 6),
        "rmse8Bit": round(math.sqrt(square_total / values), 6),
        "p95AbsChannelDelta": p95,
        "maxAbsChannelDelta": maximum,
        "changedChannelRatio": round(changed / values, 6),
    }
    amplified = ImageEnhance.Brightness(difference).enhance(8.0)
    return metrics, amplified


def fit(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    copy = image.convert("RGB")
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    panel = Image.new("RGB", size, "#050708")
    panel.paste(copy, ((size[0] - copy.width) // 2, (size[1] - copy.height) // 2))
    return panel


def create_sheet(
    destination: Path,
    variant: str,
    panels: list[tuple[int, Image.Image, Image.Image, Image.Image]],
    panel_size: tuple[int, int],
) -> None:
    font = ImageFont.load_default()
    margin = 24
    gutter = 16
    label_height = 28
    header_height = 72
    row_height = panel_size[1] + label_height + gutter
    width = margin * 2 + panel_size[0] * 3 + gutter * 2
    height = header_height + row_height * len(panels) + margin
    sheet = Image.new("RGB", (width, height), "#080b0c")
    draw = ImageDraw.Draw(sheet)
    draw.text((margin, 18), f"PHASE 3 · {variant.upper()} · 16-SAMPLE PREVIEW vs 48-SAMPLE PRODUCTION", fill="#f3f5f4", font=font)
    draw.text((margin, 42), "Equalized view: preview · production downsample · 8× absolute difference", fill="#9da8a6", font=font)
    labels = ("16 SAMPLE / PREVIEW", "48 SAMPLE / PRODUCTION", "8× ABS DIFFERENCE")
    for row, (frame, preview, production, difference) in enumerate(panels):
        y = header_height + row * row_height
        for column, image in enumerate((preview, production, difference)):
            x = margin + column * (panel_size[0] + gutter)
            sheet.paste(fit(image, panel_size), (x, y + label_height))
            draw.text((x, y + 7), f"F{frame:03d} · {labels[column]}", fill="#d8dedd", font=font)
    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination, format="PNG", optimize=False, compress_level=6)


def main() -> None:
    args = parse_args()
    roots = {
        "desktop": {
            "preview": outside_repository(args.desktop_preview, "Desktop preview root"),
            "production": outside_repository(args.desktop_production, "Desktop production root"),
        },
        "mobile": {
            "preview": outside_repository(args.mobile_preview, "Mobile preview root"),
            "production": outside_repository(args.mobile_production, "Mobile production root"),
        },
    }
    output = args.output.resolve()
    for protected in (REPOSITORY / "src", REPOSITORY / "public", REPOSITORY / "dist"):
        try:
            output.relative_to(protected)
        except ValueError:
            continue
        raise ValueError(f"Evidence output cannot enter production root {protected.name}")
    if sha256(DERIVATIVE) != DERIVATIVE_SHA256:
        raise ValueError("Derivative source differs from the accepted Phase 3 authority")

    output.mkdir(parents=True, exist_ok=True)
    results: dict[str, Any] = {}
    sheet_records = []
    for variant, specification in VARIANTS.items():
        records = []
        sheet_panels = []
        for frame in specification["frames"]:
            preview_path = image_path(roots[variant]["preview"], variant, frame)
            production_path = image_path(roots[variant]["production"], variant, frame)
            preview_identity = file_identity(preview_path, specification["preview_size"])
            production_identity = file_identity(production_path, specification["production_size"])
            with Image.open(preview_path) as preview_source, Image.open(production_path) as production_source:
                metrics, difference = difference_metrics(preview_source, production_source)
                if frame in specification["sheet_frames"]:
                    sheet_panels.append(
                        (
                            frame,
                            preview_source.copy(),
                            production_source.resize(specification["preview_size"], Image.Resampling.LANCZOS),
                            difference,
                        )
                    )
            records.append(
                {
                    "frame": frame,
                    "normalizedProgress": round((frame - 1) / 269, 6),
                    "preview16": preview_identity,
                    "production48": production_identity,
                    "decodedComparison": metrics,
                }
            )
        sheet_path = output / f"phase-3-{variant}-sample-quality-comparison.png"
        create_sheet(sheet_path, variant, sheet_panels, specification["panel_size"])
        sheet_record = {
            "repositoryRelativePath": sheet_path.relative_to(REPOSITORY).as_posix(),
            "bytes": sheet_path.stat().st_size,
            "sha256": sha256(sheet_path),
            "sourceFrames": list(specification["sheet_frames"]),
        }
        sheet_records.append(sheet_record)
        results[variant] = {
            "status": "PASS",
            "preview": {"samples": 16, "resolution": list(specification["preview_size"])},
            "production": {"samples": 48, "resolution": list(specification["production_size"])},
            "rawSequencePaths": "OUTSIDE_GIT_AND_INTENTIONALLY_OMITTED",
            "records": records,
            "comparisonSheet": sheet_record,
        }

    script = Path(__file__).resolve()
    report = {
        "schema": "quantum-hub.phase-3-render-quality-gate.v1",
        "status": "PASS",
        "authority": "fresh-derivative-16-sample-preview-versus-48-sample-production",
        "decision": "SELECT_48_SAMPLE_PRODUCTION",
        "decisionBasis": [
            "three times the sampling budget with OIDN and identical seed/color transform",
            "full 1920x1080 desktop and 720x1280 mobile delivery dimensions",
            "16-sample reduced-resolution renders retained only as outside-Git comparison inputs",
            "thin scanlines, CRT glass, dark gradients, cable response, and interface type receive the production profile",
        ],
        "derivativeSource": {
            "repositoryRelativePath": DERIVATIVE.relative_to(REPOSITORY).as_posix(),
            "bytes": DERIVATIVE.stat().st_size,
            "sha256": DERIVATIVE_SHA256,
        },
        "renderConstants": {
            "engine": "Cycles GPU",
            "backend": "OptiX",
            "denoiser": "OpenImageDenoise",
            "viewTransform": "AgX Medium High Contrast",
            "seed": 2404,
        },
        "variants": results,
        "reviewArtifacts": sheet_records,
        "generator": {
            "repositoryRelativePath": script.relative_to(REPOSITORY).as_posix(),
            "bytes": script.stat().st_size,
            "sha256": sha256(script),
            "pillow": Image.__version__,
        },
    }
    report_path = output / "phase-3-render-quality-report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Phase 3 render quality evidence PASS: {report_path}")


if __name__ == "__main__":
    main()
