"""Compose Phase 0.4R sheets 2–9 plus model-quality Cycles closeups.

Material-critical panels consume the exact governed Cycles masters; bounded
camera, cable, and causal-state panels consume the 45-state Eevee authority.
The historical Phase 0.4 composition manifest is never rewritten.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import crt_canonical_config as cfg


BG = "#0b0f10"
PANEL = "#121718"
PANEL_ALT = "#0f1415"
LINE = "#354043"
WHITE = "#f3f5f2"
MUTED = "#a9b3b3"
SOFT = "#7f8b8c"
MAGENTA = "#ef6099"
GREEN = "#9bc6b3"
CYCLES_ROOT = cfg.PACKAGE_DIR / "renders" / "repair-masters"


def font(size: int, bold: bool = False) -> ImageFont.ImageFont:
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


def file_record(path: Path) -> dict:
    with Image.open(path) as opened:
        width, height = opened.size
    return {
        "package_relative_path": path.relative_to(cfg.PACKAGE_DIR).as_posix(),
        "width": width,
        "height": height,
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def authority_record(path: Path) -> dict:
    return {
        "package_relative_path": path.relative_to(cfg.PACKAGE_DIR).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def evaluated_conductor_caption() -> str:
    """Read conductor dimensions from the evaluated Blender validation authority."""
    validation_path = cfg.MANIFEST_DIR / "blender-source-validation.json"
    validation = json.loads(validation_path.read_text(encoding="utf-8"))
    record = next(
        item for item in validation.get("checks", []) if item.get("id") == "recessed_conductor_channel"
    )
    actual = record["actual"]
    sheath_radius_mm = actual["outer_sheath_radius_m"] * 1000.0
    groove_depth_mm = actual["groove_depth_m"] * 1000.0
    core_diameter_mm = actual["core_diameter_m"] * 1000.0
    crown_recess_mm = actual["core_crown_below_sheath_shoulders_m"] * 1000.0
    return (
        f"{sheath_radius_mm:.0f} mm sheath radius · {groove_depth_mm:.0f} mm groove depth · "
        f"{core_diameter_mm:.1f} mm centred core · core crown {crown_recess_mm:.1f} mm below both graphite shoulders"
    )


def wrap(draw: ImageDraw.ImageDraw, text: str, face: ImageFont.ImageFont, width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if not current or draw.textbbox((0, 0), candidate, font=face)[2] <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_wrapped(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    face: ImageFont.ImageFont,
    fill: str,
    width: int,
    line_height: int,
    max_lines: int | None = None,
) -> int:
    lines = wrap(draw, text, face, width)
    if max_lines is not None:
        lines = lines[:max_lines]
    x, y = xy
    for index, line in enumerate(lines):
        draw.text((x, y + index * line_height), line, font=face, fill=fill)
    return y + len(lines) * line_height


def header(
    canvas: Image.Image,
    eyebrow: str,
    title_text: str,
    subtitle: str,
    width: int,
) -> None:
    draw = ImageDraw.Draw(canvas)
    draw.text((54, 34), eyebrow, font=font(25, True), fill=MAGENTA)
    draw.text((54, 74), title_text, font=font(56, True), fill=WHITE)
    draw.text((54, 146), subtitle, font=font(25), fill=MUTED)
    draw.line((54, 192, width - 54, 192), fill=LINE, width=2)


def source_path(group: str, state_id: str) -> Path:
    return cfg.RENDER_ROOT / group / f"{state_id}.png"


def cycles_path(master_id: str) -> Path:
    path = CYCLES_ROOT / f"{master_id}.png"
    if not path.is_file():
        raise RuntimeError(f"missing governed Cycles master: {path}")
    return path


def fit(path: Path, size: tuple[int, int]) -> Image.Image:
    with Image.open(path) as opened:
        return ImageOps.fit(opened.convert("RGB"), size, method=Image.Resampling.LANCZOS)


def contain(path: Path, size: tuple[int, int]) -> Image.Image:
    """Preserve the complete governed frame when edge content is evidentiary."""
    with Image.open(path) as opened:
        image = ImageOps.contain(opened.convert("RGB"), size, method=Image.Resampling.LANCZOS)
    framed = Image.new("RGB", size, "#050708")
    framed.paste(image, ((size[0] - image.width) // 2, (size[1] - image.height) // 2))
    return framed


def card(
    canvas: Image.Image,
    path: Path,
    box: tuple[int, int, int, int],
    label: str,
    note: str,
    *,
    accent: str = MAGENTA,
    contain_image: bool = False,
) -> None:
    draw = ImageDraw.Draw(canvas)
    x, y, width, height = box
    label_height = 48
    note_height = 78
    image_height = height - label_height - note_height
    draw.rounded_rectangle((x, y, x + width, y + height), radius=18, fill=PANEL, outline=LINE, width=2)
    image_size = (width - 8, image_height - 4)
    image = contain(path, image_size) if contain_image else fit(path, image_size)
    canvas.paste(image, (x + 4, y + label_height))
    draw.text((x + 18, y + 12), label, font=font(22, True), fill=accent)
    draw_wrapped(
        draw,
        (x + 18, y + label_height + image_height + 10),
        note,
        font(19),
        MUTED,
        width - 36,
        25,
        max_lines=2,
    )


def info_card(
    canvas: Image.Image,
    box: tuple[int, int, int, int],
    heading: str,
    lines: list[tuple[str, str]],
) -> None:
    draw = ImageDraw.Draw(canvas)
    x, y, width, height = box
    draw.rounded_rectangle((x, y, x + width, y + height), radius=18, fill=PANEL_ALT, outline=LINE, width=2)
    draw.text((x + 24, y + 22), heading, font=font(25, True), fill=MAGENTA)
    cursor = y + 74
    for label, value in lines:
        draw.text((x + 24, cursor), label.upper(), font=font(17, True), fill=SOFT)
        cursor = draw_wrapped(draw, (x + 24, cursor + 25), value, font(22), WHITE, width - 48, 29, 3) + 24


def save_sheet(canvas: Image.Image, filename: str, review_index: int, source_files: list[Path]) -> dict:
    output = cfg.PACKAGE_DIR / filename
    canvas.save(output, format="PNG", optimize=True, compress_level=9)
    record = file_record(output)
    record.update(
        {
            "review_index": review_index,
            "classification": "Phase 0.4R CRT bounded creative repair evidence",
            "approval_state": "awaiting direct human Phase 0.4R review",
            "intendedCommit": True,
            "source_renders": [file_record(path) for path in source_files],
        }
    )
    return record


def design_sheet() -> tuple[Image.Image, list[Path]]:
    canvas = Image.new("RGB", (3000, 2000), BG)
    header(
        canvas,
        "PHASE 0.4 / SELECTED OPTION A",
        "Recommended CRT / resolved production design",
        "Rounded 1990s domestic television · deep tube mass · grounded rear connection · no logo",
        3000,
    )
    frames = [
        ("design-front", "FRONT", "Unmistakable 4:3 face, thick bezel and restrained asymmetric lower control band."),
        ("design-side", "SIDE", "Deep tube body and heavy direct ground contact reject the computer-monitor read."),
        ("design-rear", "REAR", "Unobstructed shell, service panel, ventilation, feet, strain relief and cable entry."),
        ("design-three-quarter-front", "3Q FRONT", "Convex glass crown and moulded cabinet depth remain legible at hero distance."),
        ("design-three-quarter-rear", "3Q REAR", "Rear taper and connection preserve interest through the controlled camera orbit."),
    ]
    sources = [source_path("design", state_id) for state_id, _, _ in frames]
    sources[3] = cycles_path("cycles-design-three-quarter-front")
    x_positions = (50, 1025, 2000)
    y_positions = (220, 990)
    for index, ((_, label, note), path) in enumerate(zip(frames, sources)):
        row, column = divmod(index, 3)
        card(canvas, path, (x_positions[column], y_positions[row], 950, 700), label, note)
    info_card(
        canvas,
        (2000, 990, 950, 700),
        "SELECTED SPECIFICATION",
        [
            ("working envelope", "0.84 W × 0.69 H × 0.76 D m / 29-inch screen class"),
            ("validated assembled bounds", "0.845959 W × 0.697500 H × 0.769766 D m including glass, feet and cable collar"),
            ("screen", "4:3 visible CRT / 0.590 × 0.4425 m"),
            ("camera", "27.782636° arrival-to-power arc; near frontal only at cable arrival"),
            ("boundary", "Modelled from scratch / procedural materials / zero manufacturer branding"),
        ],
    )
    return canvas, sources


def material_sheet() -> tuple[Image.Image, list[Path]]:
    canvas = Image.new("RGB", (3000, 1700), BG)
    header(
        canvas,
        "PHASE 0.4 / CABINET MATERIAL",
        "Near-black cared-for ABS / close-range material logic",
        "Moderate roughness · fine moulded microvariation · controlled seams · restrained edge response",
        3000,
    )
    frames = [
        ("cabinet-three-quarter", "PRIMARY CABINET", "Near-black injection-moulded charcoal retains form under grazing light."),
        ("cabinet-front-material", "FRONT ASSEMBLY", "Bezel, gasket, shell and control band separate through roughness—not colour blocking."),
        ("cabinet-rear-material", "REAR MATERIAL + CONNECTION", "Quiet rear moulding, service hierarchy and the protected physical cable entry remain materially coherent."),
    ]
    sources = [
        cycles_path("cycles-cabinet-material-closeup"),
        cycles_path("cycles-design-three-quarter-front"),
        cycles_path("cycles-rear-strain-relief-closeup"),
    ]
    for index, ((_, label, note), path) in enumerate(zip(frames, sources)):
        card(canvas, path, (50 + index * 975, 220, 950, 710), label, note)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((50, 970, 2950, 1638), radius=18, fill=PANEL_ALT, outline=LINE, width=2)
    draw.text((78, 1000), "MATERIAL HIERARCHY", font=font(25, True), fill=MAGENTA)
    swatches = [
        ("CARED-FOR CHARCOAL ABS", "#101314", "Primary shell / fine procedural microtexture"),
        ("SECONDARY MOULDED ABS", "#0b0e0f", "Lower band and rear service hierarchy"),
        ("PROTECTIVE BEZEL", "#07090a", "Thicker, slightly tighter edge response"),
        ("PERIMETER GASKET", "#111516", "Resilient glass-to-bezel depth separator"),
    ]
    for index, (name, color, note) in enumerate(swatches):
        x = 90 + index * 715
        draw.rounded_rectangle((x, 1065, x + 150, 1215), radius=18, fill=color, outline="#566063", width=2)
        draw.text((x, 1242), name, font=font(20, True), fill=WHITE)
        draw_wrapped(draw, (x, 1280), note, font(19), MUTED, 610, 27, 2)
    draw.text((90, 1455), "PROCEDURAL ONLY", font=font(18, True), fill=GREEN)
    draw.text((90, 1490), "0 image textures · 0 external models · coherent manufacturing scale · no grime treatment", font=font(23), fill=WHITE)
    return canvas, sources


def glass_sheet() -> tuple[Image.Image, list[Path]]:
    canvas = Image.new("RGB", (3000, 2200), BG)
    header(
        canvas,
        "PHASE 0.4 / CRT GLASS + PHOSPHOR",
        "Convex crown, physical thickness and restrained tube wake",
        "One forward glass cap · separate recessed phosphor patch · no target artefact · no OLED-like fade",
        3000,
    )
    frames = [
        ("glass-dormant-front", "DORMANT / ZERO EMISSION", "Smoked black level keeps a controlled environmental reflection and visible bezel depth."),
        ("glass-grazing-proof", "OBLIQUE CROWN PROOF", "The accepted Cycles front three-quarter master proves crown, glass / gasket / bezel separation without broad glare."),
        ("glass-electrical-wake", "ELECTRICAL WAKE", "One restrained bowed horizontal phosphor response follows physical current arrival."),
        ("glass-raster-warm", "RASTER / PHOSPHOR WARMING", "Low grey phosphor and subtle scanlines establish a real tube before interface ownership."),
    ]
    sources = [
        cycles_path("cycles-dormant-glass-closeup"),
        cycles_path("cycles-design-three-quarter-front"),
        source_path("materials", "glass-electrical-wake"),
        cycles_path("cycles-powered-glass-phosphor-closeup"),
    ]
    for index, ((_, label, note), path) in enumerate(zip(frames, sources)):
        row, column = divmod(index, 2)
        card(canvas, path, (50 + column * 1460, 220 + row * 965, 1440, 925), label, note)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((1060, 2110, 2945, 2172), radius=14, fill="#090d0e", outline=LINE, width=2)
    draw.text((1090, 2128), "60 mm outward crown · 12 mm glass · separate 52 mm phosphor curvature", font=font(22, True), fill=GREEN)
    return canvas, sources


def detail_sheet() -> tuple[Image.Image, list[Path]]:
    canvas = Image.new("RGB", (3000, 2200), BG)
    header(
        canvas,
        "PHASE 0.4 / MANUFACTURING DETAIL",
        "Controls, speaker, rear service and strain-relief evidence",
        "Close-up geometry replaces placeholder greebles; recess, fastening and load paths remain coherent",
        3000,
    )
    frames = [
        ("speaker-controls", "TRUE SPEAKER APERTURES + ERA CONTROLS", "Open grille depth and acoustic plenum sit beside one round power control and one restrained rocker."),
        ("rear-service", "OPEN REAR VENTS + SERVICE HIERARCHY", "Cycles material proof shows recessed ventilation, interior darkness, sparse seams and a deliberate service panel."),
        ("rear-entry", "CLOSED STRAIN-RELIEF CONNECTION", "One continuous graphite sheath flows through the protected collar with no open stump, gap or decorative plug."),
    ]
    sources = [
        cycles_path("cycles-speaker-controls-closeup"),
        cycles_path("cycles-cabinet-material-closeup"),
        cycles_path("cycles-rear-strain-relief-closeup"),
    ]
    for index, ((_, label, note), path) in enumerate(zip(frames, sources)):
        card(canvas, path, (50 + index * 975, 220, 950, 1870), label, note)
    draw = ImageDraw.Draw(canvas)
    draw.text((60, 2133), "MANUFACTURING RULE: fewer panels / coherent seams / restrained fasteners / no decorative sci-fi surface language", font=font(22, True), fill=GREEN)
    return canvas, sources


def cable_sheet() -> tuple[Image.Image, list[Path]]:
    canvas = Image.new("RGB", (3000, 2200), BG)
    header(
        canvas,
        "PHASE 0.4 / PHYSICAL SPIRAL CONDUCTION",
        "One graphite sheath containing a recessed warm signal core",
        "2.5 desktop turns · 2.25 separately authored mobile turns · cumulative outer-to-inner current",
        3000,
    )
    frames = [
        ("cable-dormant", "DORMANT SHEATH", "A single physical graphite conductor rests on terrain; the internal channel remains black."),
        ("cable-conduction-boundary", "TRAIL / FRONT / BLACK AHEAD", "Warm restrained trail stays active; modest non-white front advances into dormant channel."),
        ("cable-rear-arrival", "REAR ARRIVAL", "Current reaches the strain relief only after traversing the full authored spiral."),
        ("cable-connected-powered", "CONNECTION + INDICATOR", "The cable remains grounded and physically continuous as the cabinet responds once."),
    ]
    sources = [source_path("cable", state_id) for state_id, _, _ in frames]
    for index, ((_, label, note), path) in enumerate(zip(frames, sources)):
        row, column = divmod(index, 2)
        card(canvas, path, (50 + column * 1460, 220 + row * 965, 1440, 925), label, note)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((60, 2108, 2940, 2174), radius=14, fill="#090d0e", outline=LINE, width=2)
    draw.text((88, 2126), evaluated_conductor_caption(), font=font(22, True), fill=GREEN)
    return canvas, sources


def environment_sheet() -> tuple[Image.Image, list[Path]]:
    source = cycles_path("cycles-proving-ground-master")
    canvas = Image.new("RGB", (3200, 2200), BG)
    header(
        canvas,
        "PHASE 0.4 / DORMANT PROVING GROUND",
        "Familiar old television × unfamiliar industrial field",
        "Neutral dormant light · layered infrastructure · dark terrain variation · no environmental magenta",
        3200,
    )
    image = fit(source, (3100, 1938))
    canvas.paste(image, (50, 220))
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((50, 2010, 3150, 2158), fill="#090d0e")
    draw.text((80, 2035), "DORMANT MASTER", font=font(22, True), fill=MAGENTA)
    draw.text((340, 2035), "semantic-copy quiet region left · CRT destination right-middle · cable grounded across foreground depth", font=font(22), fill=WHITE)
    draw.rectangle((50, 220, 3150, 2158), outline=LINE, width=2)
    return canvas, [source]


def camera_sheet() -> tuple[Image.Image, list[Path]]:
    canvas = Image.new("RGB", (3000, 2000), BG)
    header(
        canvas,
        "PHASE 0.4 / CAMERA PATH",
        "Rear-side arrival to near-frontal CRT portal alignment",
        "Meaningful 28.110717° horizontal arc · foreground parallax · subtle convergence · screen dominates only at arrival",
        3000,
    )
    frames = [
        ("camera-01-arrival", "ARRIVAL / 0°", "Deep body, cable connection and copy-safe field establish the destination."),
        ("camera-02-thirty-percent", "30% / 8.366403°", "Foreground spiral shifts against the CRT and industrial distance."),
        ("camera-03-sixty-percent", "60% / 16.754026°", "Front glass grows while side depth remains legible."),
        ("camera-04-near-frontal", "NEAR FRONTAL / 26.311526°", "Alignment occurs only as the advancing signal reaches its final path."),
        ("camera-05-portal-ready", "PORTAL READY / 28.110717°", "The 4:3 tube becomes the immediate physical entry surface."),
    ]
    sources = [source_path("camera-study", state_id) for state_id, _, _ in frames]
    x_positions = (50, 1025, 2000)
    y_positions = (220, 990)
    for index, ((_, label, note), path) in enumerate(zip(frames, sources)):
        row, column = divmod(index, 3)
        card(canvas, path, (x_positions[column], y_positions[row], 950, 700), label, note)
    info_card(
        canvas,
        (2000, 990, 950, 700),
        "MEASURED PATH",
        [
            ("arrival azimuth", "−57.198598°"),
            ("power-front azimuth", "−84.981235°"),
            ("arrival → power", "27.782636° / PASS within authorized 20–30°"),
            ("arrival → close", "28.110717°"),
            ("motion boundary", "Still checkpoints only; no full animatic or production media created"),
        ],
    )
    return canvas, sources


def power_sheet() -> tuple[Image.Image, list[Path]]:
    canvas = Image.new("RGB", (3600, 2000), BG)
    header(
        canvas,
        "PHASE 0.4 / EXACT SEVEN-STATE POWER AUTHORITY",
        "Cable arrival causes one controlled, authentic CRT wake",
        "No response before arrival · one tiny indicator · one bowed phosphor line · raster warms · interface stabilizes",
        3600,
    )
    labels = [
        ("power-01-completely-dormant", "01 / COMPLETELY DORMANT", "No magenta, emission, raster or interface."),
        ("power-02-current-reaches-connection", "02 / CURRENT REACHES CONNECTION", "Advancing front arrives at the committed rear entry."),
        ("power-03-power-indicator-response", "03 / INDICATOR RESPONSE", "One tiny physical indicator responds once."),
        ("power-04-crt-electrical-wake", "04 / CRT ELECTRICAL WAKE", "One restrained bowed horizontal phosphor line."),
        ("power-05-raster-phosphor-appears", "05 / RASTER + PHOSPHOR", "Low grey phosphor bloom and subtle scanlines."),
        ("power-06-quantum-interface-stabilizes", "06 / STAGE 1 · BRAND", "QUANTUM HUB resolves alone over the settled 4:3 raster."),
        ("power-07-portal-ready", "07 / STAGE 2 · ROUTE", "FRAME SOURCE ASSESS TEST DECIDE becomes fully legible before portal continuity."),
    ]
    sources = [source_path("power-on", state_id) for state_id, _, _ in labels]
    positions = []
    for index in range(4):
        positions.append((50 + index * 875, 220, 850, 700))
    for index in range(3):
        positions.append((50 + index * 1175, 960, 1150, 810))
    for (state_id, label, note), path, position in zip(labels, sources, positions):
        card(canvas, path, position, label, note, accent=MAGENTA if state_id != labels[0][0] else MUTED)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((50, 1810, 3550, 1945), radius=16, fill=PANEL_ALT, outline=LINE, width=2)
    draw.text((78, 1837), "CAUSALITY PASS", font=font(22, True), fill=GREEN)
    draw.text((300, 1837), "dormant field → cable arrival → indicator → tube wake → raster → signal interface → portal-ready", font=font(23), fill=WHITE)
    draw.text((78, 1882), "Physical copy: QUANTUM HUB · FRAME  SOURCE  ASSESS  TEST  DECIDE · TEST ROUTE AVAILABLE", font=font(21), fill=MUTED)
    return canvas, sources


def quality_closeups_sheet() -> tuple[Image.Image, list[Path]]:
    canvas = Image.new("RGB", (4200, 2400), BG)
    header(
        canvas,
        "PHASE 0.4R / MODEL QUALITY CLOSEUPS",
        "Exact-source Cycles material and manufacturing authority",
        "64 samples · OIDN · AgX Medium High Contrast · one sealed source / renderer / settings lineage",
        4200,
    )
    frames = [
        ("cycles-design-three-quarter-front", "SELECTED FRONT 3Q", "Heavy domestic CRT proportions and direct ground contact."),
        ("cycles-cabinet-material-closeup", "CHARCOAL ABS", "Fine moulded grain, restrained bevels and coherent seams."),
        ("cycles-speaker-controls-closeup", "SPEAKER + CONTROLS", "True recessed perforations and distinct period control types."),
        ("cycles-rear-strain-relief-closeup", "REAR ENTRY", "Closed tapered sheath enters the ribbed strain relief continuously."),
        ("cycles-dormant-glass-closeup", "DORMANT GLASS", "Optically black tube with one localized bent grazing cue."),
        ("cycles-powered-glass-phosphor-closeup", "POWERED PHOSPHOR", "Convex smoked glass remains distinct from the 4:3 raster."),
        ("cycles-proving-ground-master", "PROVING GROUND", "Installed scale, terrain contact and industrial depth."),
        ("cycles-portal-ready-closeup", "PORTAL READY", "Restrained glass cue preserves raster and three-stage physical copy."),
    ]
    sources = [cycles_path(master_id) for master_id, _, _ in frames]
    for index, ((master_id, label, note), path) in enumerate(zip(frames, sources)):
        row, column = divmod(index, 4)
        card(
            canvas,
            path,
            (40 + column * 1040, 220 + row * 1040, 1010, 1000),
            label,
            note,
            contain_image=master_id in {"cycles-powered-glass-phosphor-closeup", "cycles-portal-ready-closeup"},
        )
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((40, 2280, 4160, 2360), radius=14, fill=PANEL_ALT, outline=LINE, width=2)
    draw.text((72, 2303), "QUALITY BOUNDARY", font=font(22, True), fill=GREEN)
    draw.text((330, 2303), "no external textures · no third-party models · no manufacturer branding · no full animatic", font=font(23), fill=WHITE)
    return canvas, sources


def main() -> None:
    sheets: list[dict] = []
    builders = [
        (2, "crt-television-recommended-design-sheet.png", design_sheet),
        (3, "crt-cabinet-material-sheet.png", material_sheet),
        (4, "crt-screen-glass-and-phosphor-sheet.png", glass_sheet),
        (5, "crt-controls-speaker-rear-detail-sheet.png", detail_sheet),
        (6, "crt-cable-and-connection-sheet.png", cable_sheet),
        (7, "crt-proving-ground-style-frame.png", environment_sheet),
        (8, "crt-camera-path-study.png", camera_sheet),
        (9, "crt-power-on-contact-sheet.png", power_sheet),
    ]
    for review_index, filename, builder in builders:
        canvas, sources = builder()
        sheets.append(save_sheet(canvas, filename, review_index, sources))

    quality_canvas, quality_sources = quality_closeups_sheet()
    quality_output = cfg.PACKAGE_DIR / "crt-model-quality-closeups.png"
    quality_canvas.save(quality_output, format="PNG", optimize=True, compress_level=9)
    quality_record = file_record(quality_output)
    quality_record.update(
        {
            "classification": "Phase 0.4R supplemental Cycles model-quality evidence",
            "approval_state": "awaiting direct human Phase 0.4R review",
            "intendedCommit": True,
            "source_renders": [file_record(path) for path in quality_sources],
        }
    )

    canonical_manifest = cfg.MANIFEST_DIR / "crt-phase-0-4r-canonical-render-inventory.json"
    power_authority = cfg.MANIFEST_DIR / "crt-phase-0-4r-power-on-state-authority.json"
    cycles_authority = cfg.MANIFEST_DIR / "crt-phase-0-4r-cycles-master-render-manifest.json"
    manifest = {
        "schema": "quantum-hub.phase-0-4r-crt-television.review-composition.v1",
        "status": "CREATIVE_SHEETS_2_TO_9_COMPLETE_BROWSER_SHEETS_PENDING",
        "repair_baseline": "fec1f0e9243a9cda188c539ab1b79e4a99c30623",
        "composer": authority_record(Path(__file__).resolve()),
        "refined_source": authority_record(cfg.REFINED_BLEND),
        "canonical_render_authority": authority_record(canonical_manifest),
        "power_state_authority": authority_record(power_authority),
        "cycles_master_authority": authority_record(cycles_authority),
        "layout_authority": authority_record(cfg.PORTAL_LAYOUT),
        "review_indices_complete": list(range(2, 10)),
        "review_indices_pending_browser": list(range(10, 17)),
        "sheet_count": len(sheets),
        "sheets": sheets,
        "quality_closeups": quality_record,
        "render_engine_split": {
            "material_quality_authority": "eight exact-source BLENDER_CYCLES masters",
            "supplemental_state_authority": "BLENDER_EEVEE camera/cable/power/source-group stills",
        },
        "creative_boundary": {
            "private_reference_included": False,
            "third_party_models": 0,
            "external_textures": 0,
            "full_animatic_created": False,
            "production_media_created": False,
        },
    }
    target = cfg.MANIFEST_DIR / "crt-phase-0-4r-review-composition-manifest.json"
    target.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"QH_PHASE04_CRT_REVIEW_SHEETS={len(sheets)}")
    print("QH_PHASE04_CRT_REVIEW_INDICES=2-9")
    print(f"QH_PHASE04R_CRT_REVIEW_COMPOSITION_MANIFEST={target.resolve()}")


if __name__ == "__main__":
    main()
