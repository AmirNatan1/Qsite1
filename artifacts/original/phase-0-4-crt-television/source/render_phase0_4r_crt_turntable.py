"""Render the bounded Phase 0.4R CRT model-quality turntable.

Blender 5.2's bundled build has no direct FFMPEG output format, so governed
temporary PNG frames are encoded deterministically to VP9/no-audio and deleted
before the PASS manifest is written. No frame sequence is retained or committed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.dont_write_bytecode = True
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import crt_canonical_config as canonical
import render_crt_canonical_stills as canonical_renderer


OUTPUT = canonical.PACKAGE_DIR / "crt-model-turntable.webm"
FRAME_DIR = canonical.PACKAGE_DIR / "work" / ".phase0-4r-turntable-frames"
FRAME_PATTERN = FRAME_DIR / "frame-%04d.png"
MANIFEST = canonical.MANIFEST_DIR / "crt-model-turntable-manifest.json"
FPS = 24
FRAME_COUNT = 144
WIDTH = 960
HEIGHT = 600
START_AZIMUTH_DEGREES = -55.0
END_AZIMUTH_DEGREES = 55.0
ORBIT_RADIUS_M = 2.20


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_record(path: Path) -> dict:
    return {
        "package_relative_path": path.relative_to(canonical.PACKAGE_DIR).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def args() -> argparse.Namespace:
    tail = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ffmpeg", type=Path, required=True)
    parser.add_argument("--ffprobe", type=Path, required=True)
    parser.add_argument(
        "--manifest-only",
        action="store_true",
        help="Re-probe the existing governed WebM and refresh its deterministic authority without re-encoding.",
    )
    return parser.parse_args(tail)


def track_to(obj: bpy.types.Object, target: bpy.types.Object) -> None:
    constraint = obj.constraints.new("TRACK_TO")
    constraint.target = target
    constraint.track_axis = "TRACK_NEGATIVE_Z"
    constraint.up_axis = "UP_Y"


def area_light(
    name: str,
    location: tuple[float, float, float],
    energy: float,
    size: float,
    target: bpy.types.Object,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = (0.88, 0.91, 0.92)
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    collection.objects.link(obj)
    track_to(obj, target)
    return obj


def configure_scene(scene: bpy.types.Scene) -> None:
    canonical_renderer.set_state(canonical.CANONICAL_STATES["design-three-quarter-front"])
    for name in (
        "DESKTOP_2_5_TURN_SPIRAL_CABLE",
        "MOBILE_2_25_TURN_SPIRAL_CABLE",
        "INDUSTRIAL_PROVING_GROUND",
        "NEUTRAL_CONTROLLED_LIGHTING",
    ):
        collection = bpy.data.collections.get(name)
        if collection is not None:
            collection.hide_render = True

    temp = bpy.data.collections.new("PHASE_0_4R_TURNTABLE_RUNTIME")
    scene.collection.children.link(temp)
    center = Vector((0.65, 0.02, 0.34))

    target = bpy.data.objects.new("TurntableTarget", None)
    target.location = center
    temp.objects.link(target)
    orbit = bpy.data.objects.new("TurntableOrbit", None)
    orbit.location = center
    temp.objects.link(orbit)
    camera_data = bpy.data.cameras.new("TurntableCamera")
    camera_data.lens = 65.0
    camera_data.sensor_width = 36.0
    camera_data.dof.use_dof = False
    camera = bpy.data.objects.new("TurntableCamera", camera_data)
    temp.objects.link(camera)
    camera.parent = orbit
    camera.location = (ORBIT_RADIUS_M, 0.0, 0.56)
    track_to(camera, target)
    # Blender 5.2 uses layered Actions without the legacy Action.fcurves API.
    # A frame-driven rotation is simpler and explicitly linear while avoiding
    # any version-specific keyframe channel traversal.
    start_radians = math.radians(START_AZIMUTH_DEGREES)
    end_radians = math.radians(END_AZIMUTH_DEGREES)
    orbit.rotation_euler.z = start_radians
    driver_curve = orbit.driver_add("rotation_euler", 2)
    driver_curve.driver.type = "SCRIPTED"
    driver_curve.driver.expression = (
        f"{start_radians:.12f} + ({end_radians - start_radians:.12f}) * "
        f"(frame - 1) / {FRAME_COUNT - 1}"
    )
    scene.camera = camera

    bpy.ops.mesh.primitive_plane_add(size=6.0, location=(0.65, 0.0, -0.006))
    floor = bpy.context.object
    floor.name = "TurntableNeutralGround"
    for owner in tuple(floor.users_collection):
        owner.objects.unlink(floor)
    temp.objects.link(floor)
    floor_material = bpy.data.materials.new("TurntableNeutralGroundMaterial")
    floor_material.use_nodes = True
    floor_shader = floor_material.node_tree.nodes.get("Principled BSDF")
    floor_shader.inputs["Base Color"].default_value = (0.026, 0.029, 0.030, 1.0)
    floor_shader.inputs["Roughness"].default_value = 0.76
    floor.data.materials.append(floor_material)

    area_light("TurntableKey", (-1.2, -2.0, 2.7), 680.0, 2.0, target, temp)
    area_light("TurntableFill", (2.7, -0.8, 1.6), 360.0, 1.6, target, temp)
    area_light("TurntableRearRim", (1.1, 2.7, 2.2), 520.0, 1.3, target, temp)

    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.008, 0.010, 0.011, 1.0)
    background.inputs["Strength"].default_value = 0.16

    scene.render.engine = canonical.EEVEE_ENGINE
    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = 32
    scene.render.resolution_x = WIDTH
    scene.render.resolution_y = HEIGHT
    scene.render.resolution_percentage = 100
    scene.render.fps = FPS
    scene.frame_start = 1
    scene.frame_end = FRAME_COUNT
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 48
    scene.render.filepath = str((FRAME_DIR / "frame-").resolve())


def rate(value: str) -> float:
    numerator, denominator = value.split("/")
    return float(numerator) / float(denominator)


def decode_rgb_sample(ffmpeg: Path, timestamp_seconds: float) -> bytes:
    command = [
        str(ffmpeg.resolve()),
        "-v",
        "error",
        "-i",
        str(OUTPUT.resolve()),
        "-ss",
        f"{timestamp_seconds:.6f}",
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "pipe:1",
    ]
    decoded = subprocess.run(command, check=True, capture_output=True).stdout
    expected_bytes = WIDTH * HEIGHT * 3
    if len(decoded) != expected_bytes:
        raise RuntimeError(
            f"decoded turntable sample has {len(decoded)} bytes; expected {expected_bytes}"
        )
    return decoded


def adjacent_rgb_difference(first: bytes, second: bytes) -> tuple[float, float]:
    if len(first) != len(second) or len(first) % 3:
        raise RuntimeError("turntable sample buffers are incompatible")
    mean_absolute_rgb_delta = sum(abs(a - b) for a, b in zip(first, second)) / len(first)
    pixel_count = len(first) // 3
    changed_pixels = sum(
        sum(
            abs(first[offset + channel] - second[offset + channel])
            for channel in range(3)
        )
        > 12
        for offset in range(0, len(first), 3)
    )
    return mean_absolute_rgb_delta, changed_pixels / pixel_count


def main() -> None:
    options = args()
    for tool in (options.ffmpeg, options.ffprobe):
        if not tool.is_file():
            raise RuntimeError(f"required media tool missing: {tool.name}")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    command = [
        str(options.ffmpeg.resolve()),
        "-y",
        "-framerate",
        str(FPS),
        "-start_number",
        "1",
        "-i",
        str(FRAME_PATTERN.resolve()),
        "-map",
        "0:v:0",
        "-c:v",
        "libvpx-vp9",
        "-b:v",
        "0",
        "-crf",
        "30",
        "-deadline",
        "good",
        "-cpu-used",
        "2",
        "-row-mt",
        "1",
        "-pix_fmt",
        "yuv420p",
        "-g",
        str(FPS),
        "-an",
        "-sn",
        "-dn",
        str(OUTPUT.resolve()),
    ]
    if options.manifest_only:
        if not OUTPUT.is_file():
            raise RuntimeError("manifest-only turntable reconciliation requires the governed WebM")
        if FRAME_DIR.exists():
            raise RuntimeError("manifest-only turntable reconciliation found retained temporary frames")
    else:
        if FRAME_DIR.exists():
            shutil.rmtree(FRAME_DIR)
        FRAME_DIR.mkdir(parents=True, exist_ok=False)
        if OUTPUT.exists():
            OUTPUT.unlink()

        scene = bpy.context.scene
        configure_scene(scene)
        bpy.ops.render.render(animation=True)
        frames = sorted(FRAME_DIR.glob("frame-*.png"))
        if len(frames) != FRAME_COUNT:
            raise RuntimeError(f"Blender wrote {len(frames)} turntable frames; expected {FRAME_COUNT}")
        try:
            subprocess.run(command, check=True, capture_output=True, text=True)
        finally:
            shutil.rmtree(FRAME_DIR, ignore_errors=True)

    probe_command = [
        str(options.ffprobe.resolve()),
        "-v",
        "error",
        "-count_frames",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        str(OUTPUT.resolve()),
    ]
    probe = json.loads(subprocess.run(probe_command, check=True, capture_output=True, text=True).stdout)
    streams = probe.get("streams", [])
    videos = [stream for stream in streams if stream.get("codec_type") == "video"]
    if len(videos) != 1:
        raise RuntimeError(f"turntable has {len(videos)} video streams")
    video = videos[0]
    duration = float(probe.get("format", {}).get("duration") or video.get("duration") or 0.0)
    fps = rate(video.get("avg_frame_rate", "0/1"))
    probed_frames = int(video.get("nb_read_frames") or video.get("nb_frames") or 0)
    counts = {
        stream_type: sum(stream.get("codec_type") == stream_type for stream in streams)
        for stream_type in ("video", "audio", "subtitle", "data", "attachment")
    }
    if not (5.0 <= duration <= 7.0 and video.get("codec_name") == "vp9" and counts["video"] == 1 and all(counts[key] == 0 for key in ("audio", "subtitle", "data", "attachment"))):
        raise RuntimeError("turntable probe does not satisfy VP9/no-audio/5–7 second contract")

    sample_timestamps = [0.5, duration / 2.0, duration - 0.5]
    decoded_samples = [decode_rgb_sample(options.ffmpeg, timestamp) for timestamp in sample_timestamps]
    sample_hashes = [hashlib.sha256(decoded).hexdigest() for decoded in decoded_samples]
    adjacent_differences = []
    for index in range(len(decoded_samples) - 1):
        mean_delta, changed_ratio = adjacent_rgb_difference(
            decoded_samples[index], decoded_samples[index + 1]
        )
        adjacent_differences.append(
            {
                "from": sample_timestamps[index],
                "to": sample_timestamps[index + 1],
                "mean_absolute_rgb_delta": mean_delta,
                "changed_pixel_ratio": changed_ratio,
            }
        )
    all_distinct = len(set(sample_hashes)) == len(sample_hashes)
    if not all_distinct or any(
        item["mean_absolute_rgb_delta"] <= 1.0 or item["changed_pixel_ratio"] <= 0.05
        for item in adjacent_differences
    ):
        raise RuntimeError("turntable decoded samples do not prove nontrivial continuous motion")
    decoded_sample_proof = {
        "status": "PASS",
        "sample_count": len(sample_timestamps),
        "all_distinct": all_distinct,
        "samples": [
            {
                "timestamp_seconds": timestamp,
                "width": WIDTH,
                "height": HEIGHT,
                "decoded_rgb_sha256": decoded_hash,
            }
            for timestamp, decoded_hash in zip(sample_timestamps, sample_hashes)
        ],
        "adjacent_differences": adjacent_differences,
    }

    source = canonical.REFINED_BLEND
    renderer = Path(__file__).resolve()
    ffmpeg_version = subprocess.run([str(options.ffmpeg.resolve()), "-version"], check=True, capture_output=True, text=True).stdout.splitlines()[0]
    normalized_encoder_command = [
        "ffmpeg", "-y", "-framerate", str(FPS), "-start_number", "1", "-i", "<temporary-frame-%04d.png>",
        "-map", "0:v:0", "-c:v", "libvpx-vp9",
        "-b:v", "0", "-crf", "30", "-deadline", "good", "-cpu-used", "2", "-row-mt", "1",
        "-pix_fmt", "yuv420p", "-g", str(FPS), "-an", "-sn", "-dn", "crt-model-turntable.webm",
    ]
    manifest = {
        "schema": "quantum-hub.phase-0-4r-crt-television.turntable.v1",
        "status": "PASS",
        "repair_baseline": "fec1f0e9243a9cda188c539ab1b79e4a99c30623",
        "source": file_record(source),
        "renderer": file_record(renderer),
        "output": {**file_record(OUTPUT), "width": WIDTH, "height": HEIGHT},
        "render_lineage": {
            "source_sha256": sha256(source),
            "renderer_sha256": sha256(renderer),
            "camera_orbit": {
                "start_view": "front three-quarter",
                "end_view": "rear three-quarter",
                "start_angle_degrees": START_AZIMUTH_DEGREES,
                "end_angle_degrees": END_AZIMUTH_DEGREES,
                "start_azimuth_degrees": START_AZIMUTH_DEGREES,
                "end_azimuth_degrees": END_AZIMUTH_DEGREES,
                "orbit_radius_m": ORBIT_RADIUS_M,
                "interpolation": "linear",
            },
            "seed": 2404,
            "frame_count": FRAME_COUNT,
            "fps": FPS,
            "width": WIDTH,
            "height": HEIGHT,
            "temporary_frames_retained": False,
            "temporary_frame_count_created": FRAME_COUNT,
            "temporary_intermediate_retained": False,
            "engine": canonical.EEVEE_ENGINE,
            "samples": 32,
            "color_management": {"view_transform": "AgX", "look": "AgX - Medium High Contrast"},
            "manifest_only_reconciliation": bool(options.manifest_only),
        },
        "encoder": {
            "tool": "FFmpeg",
            "version": ffmpeg_version,
            "license": "FFmpeg build distributed under the licenses reported by `ffmpeg -L`; VP9 encoder libvpx-vp9",
            "command": normalized_encoder_command,
            "codec": "libvpx-vp9",
            "audio": "disabled with -an",
            "pix_fmt": "yuv420p",
            "gop_frames": FPS,
            "crf": 30,
        },
        "ffprobe": {
            "codec_name": video.get("codec_name"),
            "duration": duration,
            "fps": fps,
            "frame_count": probed_frames,
            "width": int(video.get("width", 0)),
            "height": int(video.get("height", 0)),
            "time_base": video.get("time_base"),
            "pix_fmt": video.get("pix_fmt"),
            "video_stream_count": counts["video"],
            "audio_stream_count": counts["audio"],
            "subtitle_stream_count": counts["subtitle"],
            "data_stream_count": counts["data"],
            "attachment_stream_count": counts["attachment"],
            "no_audio": counts["audio"] == 0,
        },
        "decoded_sample_proof": decoded_sample_proof,
        "no_audio": True,
        "temporary_frames_retained": False,
        "frame_sequence": {"created": True, "frame_count": FRAME_COUNT, "retained": False},
        "full_animatic_created": False,
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"QH_PHASE04R_TURNTABLE={OUTPUT.resolve()}")
    print(f"QH_PHASE04R_TURNTABLE_DURATION={duration}")
    print(f"QH_PHASE04R_TURNTABLE_MANIFEST={MANIFEST.resolve()}")


if __name__ == "__main__":
    main()
