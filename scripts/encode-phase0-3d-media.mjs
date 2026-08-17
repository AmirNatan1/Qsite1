import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const packageRoot = path.join(
  projectRoot,
  "artifacts",
  "original",
  "phase-0-3d-repair",
);
const frameDirectory = path.join(packageRoot, "work", "animatic-frames");
const mediaDirectory = path.join(packageRoot, "media");
const reviewDirectory = path.join(packageRoot, "review");
const manifestDirectory = path.join(packageRoot, "manifests");
const localAppData = process.env.LOCALAPPDATA;

if (!localAppData) {
  throw new Error("LOCALAPPDATA is required to locate the verified portable FFmpeg toolchain.");
}

const ffmpegPath =
  process.env.QH_FFMPEG_PATH ??
  path.join(
    localAppData,
    "QuantumHubTools",
    "ffmpeg-9.0.1",
    "ffmpeg-9.0.1-essentials_build",
    "bin",
    "ffmpeg.exe",
  );
const ffprobePath =
  process.env.QH_FFPROBE_PATH ??
  path.join(
    localAppData,
    "QuantumHubTools",
    "ffmpeg-9.0.1",
    "ffmpeg-9.0.1-essentials_build",
    "bin",
    "ffprobe.exe",
  );

for (const executable of [ffmpegPath, ffprobePath]) {
  if (!existsSync(executable)) {
    throw new Error(`Verified production tool is unavailable: ${executable}`);
  }
}

const expectedFrames = Array.from(
  { length: 192 },
  (_, index) => path.join(frameDirectory, `frame-${String(index + 1).padStart(4, "0")}.png`),
);
const missingFrames = expectedFrames.filter((file) => !existsSync(file));
if (missingFrames.length) {
  throw new Error(
    `Animatic sequence is incomplete: ${missingFrames.length} of 192 frames are missing; first missing ${missingFrames[0]}`,
  );
}

const firstPng = readFileSync(expectedFrames[0]);
if (firstPng.toString("hex", 0, 8) !== "89504e470d0a1a0a") {
  throw new Error("The first animatic source is not a PNG file.");
}
const sourceWidth = firstPng.readUInt32BE(16);
const sourceHeight = firstPng.readUInt32BE(20);
if (sourceWidth !== 960 || sourceHeight !== 540) {
  throw new Error(`Expected 960x540 review frames, received ${sourceWidth}x${sourceHeight}.`);
}

mkdirSync(mediaDirectory, { recursive: true });
mkdirSync(reviewDirectory, { recursive: true });
mkdirSync(manifestDirectory, { recursive: true });

function run(executable, args, label) {
  const result = spawnSync(executable, args, {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed (${result.status}):\n${result.stderr || result.stdout}`);
  }
  return result;
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function relative(file) {
  return path.relative(packageRoot, file).split(path.sep).join("/");
}

function parseSsim(stderr, label) {
  const matches = [...stderr.matchAll(/All:([0-9.]+)/g)];
  if (!matches.length) throw new Error(`${label} did not report an aggregate SSIM value.`);
  return Number(matches.at(-1)[1]);
}

function measureSsim(output, portalOnly = false) {
  const source = path.join(frameDirectory, "frame-%04d.png");
  const filter = portalOnly
    ? "[0:v]trim=start_frame=170:end_frame=192,setpts=PTS-STARTPTS[ref];[1:v]trim=start_frame=170:end_frame=192,setpts=PTS-STARTPTS[encoded];[ref][encoded]ssim"
    : "[0:v][1:v]ssim";
  const result = run(
    ffmpegPath,
    [
      "-hide_banner",
      "-framerate",
      "24",
      "-start_number",
      "1",
      "-i",
      source,
      "-i",
      output,
      "-lavfi",
      filter,
      "-f",
      "null",
      "-",
    ],
    `${portalOnly ? "portal" : "full-timeline"} SSIM for ${path.basename(output)}`,
  );
  return parseSsim(result.stderr, path.basename(output));
}

const versionResult = run(ffmpegPath, ["-version"], "ffmpeg version audit");
const ffprobeVersionResult = run(ffprobePath, ["-version"], "ffprobe version audit");
const ffmpegVersion = versionResult.stdout.split(/\r?\n/, 1)[0];
const ffprobeVersion = ffprobeVersionResult.stdout.split(/\r?\n/, 1)[0];
const inputPattern = path.join(frameDirectory, "frame-%04d.png");

const variants = [];
for (const codec of ["vp9", "h264"]) {
  for (const gop of [1, 6, 12]) {
    const extension = codec === "vp9" ? "webm" : "mp4";
    const output = path.join(
      mediaDirectory,
      `field-unit-animatic-${codec}-g${gop}.${extension}`,
    );
    const common = [
      "-y",
      "-hide_banner",
      "-framerate",
      "24",
      "-start_number",
      "1",
      "-i",
      inputPattern,
      "-frames:v",
      "192",
      "-an",
      "-pix_fmt",
      "yuv420p",
      "-g",
      String(gop),
    ];
    const codecArgs =
      codec === "vp9"
        ? [
            "-c:v",
            "libvpx-vp9",
            "-crf",
            "30",
            "-b:v",
            "0",
            "-row-mt",
            "1",
            "-cpu-used",
            "2",
            "-threads",
            "8",
          ]
        : [
            "-c:v",
            "libx264",
            "-preset",
            "slow",
            "-crf",
            "20",
            "-keyint_min",
            String(gop),
            "-sc_threshold",
            "0",
            "-movflags",
            "+faststart",
          ];
    const args = [...common, ...codecArgs, output];
    console.log(`Encoding ${path.basename(output)}...`);
    run(ffmpegPath, args, `encode ${path.basename(output)}`);

    const probeResult = run(
      ffprobePath,
      [
        "-v",
        "error",
        "-count_frames",
        "-select_streams",
        "v:0",
        "-show_entries",
        "format=duration,size,bit_rate:stream=codec_name,profile,width,height,pix_fmt,r_frame_rate,avg_frame_rate,duration,bit_rate,nb_frames,nb_read_frames",
        "-of",
        "json",
        output,
      ],
      `ffprobe ${path.basename(output)}`,
    );
    const frameProbeResult = run(
      ffprobePath,
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_frames",
        "-show_entries",
        "frame=key_frame,pict_type,best_effort_timestamp_time",
        "-of",
        "json",
        output,
      ],
      `keyframe probe ${path.basename(output)}`,
    );
    const probe = JSON.parse(probeResult.stdout);
    const frames = JSON.parse(frameProbeResult.stdout).frames ?? [];
    const keyframes = frames.filter((frame) => Number(frame.key_frame) === 1);

    variants.push({
      codec,
      requested_keyframe_interval: gop,
      path: relative(output),
      bytes: statSync(output).size,
      sha256: sha256(output),
      encode: {
        fps: 24,
        frames: 192,
        width: sourceWidth,
        height: sourceHeight,
        arguments: [
          "-framerate 24",
          "-start_number 1",
          "-i work/animatic-frames/frame-%04d.png",
          "-frames:v 192",
          codec === "vp9"
            ? `-c:v libvpx-vp9 -crf 30 -b:v 0 -g ${gop} -row-mt 1 -cpu-used 2`
            : `-c:v libx264 -preset slow -crf 20 -g ${gop} -keyint_min ${gop} -sc_threshold 0 -movflags +faststart`,
          "-pix_fmt yuv420p -an",
        ],
      },
      probe,
      observed_decoded_frames: frames.length,
      observed_keyframes: keyframes.length,
      keyframe_times_seconds: keyframes.map((frame) =>
        Number(Number(frame.best_effort_timestamp_time).toFixed(6)),
      ),
      quality: {
        full_timeline_ssim: measureSsim(output),
        portal_segment_ssim_frames_171_to_192: measureSsim(output, true),
      },
    });
  }
}

const preferredVariant = path.join(mediaDirectory, "field-unit-animatic-vp9-g6.webm");
const reviewAnimatic = path.join(reviewDirectory, "field-unit-animatic.webm");
copyFileSync(preferredVariant, reviewAnimatic);

const generatedAt = new Date().toISOString();
const encodeManifest = {
  schema: "quantum-hub.phase-0-3d-encode-manifest.v1",
  generated_at_utc: generatedAt,
  original_blender_imagery: true,
  audio: false,
  ffmpeg_version: ffmpegVersion,
  ffprobe_version: ffprobeVersion,
  source: {
    path: "work/animatic-frames/frame-%04d.png",
    width: sourceWidth,
    height: sourceHeight,
    fps: 24,
    frames: 192,
    duration_seconds: 8,
  },
  variants,
  preferred_review_variant: relative(preferredVariant),
  review_copy: {
    path: relative(reviewAnimatic),
    bytes: statSync(reviewAnimatic).size,
    sha256: sha256(reviewAnimatic),
  },
};
writeFileSync(
  path.join(manifestDirectory, "encode-manifest.json"),
  `${JSON.stringify(encodeManifest, null, 2)}\n`,
  "utf8",
);

const ffprobeManifest = {
  schema: "quantum-hub.phase-0-3d-ffprobe-manifest.v1",
  generated_at_utc: generatedAt,
  ffprobe_version: ffprobeVersion,
  files: variants.map(({ path: filePath, bytes, sha256: hash, probe, observed_decoded_frames, observed_keyframes, keyframe_times_seconds }) => ({
    path: filePath,
    bytes,
    sha256: hash,
    probe,
    observed_decoded_frames,
    observed_keyframes,
    keyframe_times_seconds,
  })),
};
writeFileSync(
  path.join(manifestDirectory, "ffprobe-manifest.json"),
  `${JSON.stringify(ffprobeManifest, null, 2)}\n`,
  "utf8",
);

console.log(
  `Encoded ${variants.length} real-content variants; preferred review media ${relative(reviewAnimatic)} (${statSync(reviewAnimatic).size} bytes).`,
);
