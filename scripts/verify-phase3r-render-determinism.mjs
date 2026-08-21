#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const verifierPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(verifierPath), "..");
const packageRelative = "artifacts/original/phase-3-crt-opening";
const packageRoot = path.join(repositoryRoot, packageRelative);
const sourceBuildManifestRelative = `${packageRelative}/manifests/phase-3-r-source-build.json`;
const sourceBuildManifestPath = path.join(repositoryRoot, sourceBuildManifestRelative);
const renderScriptRelative = `${packageRelative}/source/render_phase3r_frames.py`;
const renderScriptPath = path.join(repositoryRoot, renderScriptRelative);
const expectedDerivativePackageRelative =
  "source/quantum-signal-television-phase3-r-crt-authenticity.blend";

const expectedAuthority = Object.freeze({
  manifestSchema: "quantum-hub.phase-3-r-crt-authenticity.source-build.v1",
  repairParent: "ae6cd4c0c664a275c077bd37207efde01e9caa29",
  acceptedPhase0Sha256:
    "3027c4c46e2b829fd97ee9a3a47558e43adda47abcc488420faa0f087bd720a7",
  acceptedPhase3Sha256:
    "bbde82220f500c6f047c2e2d33a8580c08a40e65800615dd7256bebc2f4472ba",
});

// These checkpoints cover every authored state whose deterministic access is
// material to the repair: dormant glass, wake line, growing field, settling,
// content, late suppression, near-flat portal, and the final handoff.
const variants = Object.freeze([
  {
    id: "desktop",
    dimensions: [1920, 1080],
    frames: [1, 126, 144, 162, 196, 250, 262, 270],
  },
  {
    id: "mobile",
    dimensions: [720, 1280],
    frames: [1, 126, 144, 162, 196, 250, 262, 270],
  },
]);

const help = `Phase 3-R sparse production-render determinism verifier

Usage:
  node scripts/verify-phase3r-render-determinism.mjs \\
    --blender <Blender-5.2-executable> \\
    --desktop-reference <completed-desktop-master-directory> \\
    --mobile-reference <completed-mobile-master-directory> \\
    [--work-root <outside-git-directory>] \\
    [--output <outside-git-report.json>]

The verifier binds the repaired Blender derivative through the Phase 3-R
source-build manifest, then launches desktop and mobile as two separate fresh
Blender processes. Each process renders the eight production checkpoints
1,126,144,162,196,250,262,270 outside Git. The reference directories may be
full 270-frame masters, but must contain phase3r-<variant>-NNNN.png for every
checkpoint.

When omitted, --work-root and --output are placed in a unique directory under:
  ${path.join(tmpdir(), "quantum_phase3r_determinism")}

Raw rerenders are intentionally retained beside the report for review. Nothing
is written to the historical Phase 3 or Phase 3-R manifest/evidence trees.`;

function parseArguments(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(help + "\n");
    process.exit(0);
  }

  const allowed = new Set([
    "blender",
    "desktop-reference",
    "mobile-reference",
    "work-root",
    "output",
  ]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error("Invalid arguments.\n\n" + help);
    }
    const key = flag.slice(2);
    if (!allowed.has(key)) throw new Error(`Unknown option --${key}.\n\n${help}`);
    if (values.has(key)) throw new Error(`Duplicate option --${key}.`);
    values.set(key, value);
  }

  for (const key of ["blender", "desktop-reference", "mobile-reference"]) {
    if (!values.has(key)) throw new Error(`Missing --${key}.\n\n${help}`);
  }

  const runSlug = new Date().toISOString().replaceAll(":", "-").replace(".", "-");
  const defaultBase = path.join(tmpdir(), "quantum_phase3r_determinism");
  const workBase = path.resolve(String(values.get("work-root") ?? defaultBase));
  const runRoot = path.join(workBase, `phase3r-${runSlug}-${process.pid}`);
  return {
    blender: String(values.get("blender")),
    desktopReference: path.resolve(String(values.get("desktop-reference"))),
    mobileReference: path.resolve(String(values.get("mobile-reference"))),
    workBase,
    runRoot,
    output: values.has("output")
      ? path.resolve(String(values.get("output")))
      : path.join(runRoot, "phase-3-r-render-determinism.json"),
  };
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function portableRelative(file) {
  return path.relative(repositoryRoot, file).replaceAll("\\", "/");
}

async function sha256(file) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function readJson(file, label) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read ${label}: ${error.message}`);
  }
}

async function bindDerivativeAuthority() {
  const manifest = await readJson(sourceBuildManifestPath, "Phase 3-R source-build manifest");
  if (manifest.schema !== expectedAuthority.manifestSchema || manifest.status !== "PASS") {
    throw new Error("Phase 3-R source-build manifest is not the accepted PASS schema");
  }
  if (manifest.repair_parent !== expectedAuthority.repairParent) {
    throw new Error("Phase 3-R source-build manifest has a different repair parent");
  }
  if (
    manifest.accepted_phase0_source?.sha256 !== expectedAuthority.acceptedPhase0Sha256 ||
    manifest.accepted_phase3_derivative?.sha256 !== expectedAuthority.acceptedPhase3Sha256
  ) {
    throw new Error("Phase 3-R source-build manifest is detached from an accepted source authority");
  }
  if (manifest.timeline_changed !== false || manifest.frozen_signature?.exact_match !== true) {
    throw new Error("Phase 3-R source-build manifest does not preserve the frozen timeline/scene");
  }

  const derivative = manifest.phase3r_derivative;
  if (derivative?.package_relative_path !== expectedDerivativePackageRelative) {
    throw new Error("Phase 3-R source-build manifest names an unexpected derivative path");
  }
  if (!/^[a-f0-9]{64}$/.test(String(derivative.sha256))) {
    throw new Error("Phase 3-R derivative authority has no valid SHA-256");
  }
  const derivativePath = path.resolve(packageRoot, derivative.package_relative_path);
  if (!isWithin(path.join(packageRoot, "source"), derivativePath)) {
    throw new Error("Phase 3-R derivative authority escapes the package source directory");
  }
  const derivativeStat = await stat(derivativePath);
  const derivativeSha256 = await sha256(derivativePath);
  if (derivativeStat.size !== derivative.bytes || derivativeSha256 !== derivative.sha256) {
    throw new Error("Phase 3-R derivative bytes differ from the source-build authority");
  }
  await access(renderScriptPath);

  return {
    manifest,
    derivativePath,
    record: {
      sourceBuildManifest: {
        repositoryRelativePath: sourceBuildManifestRelative,
        bytes: (await stat(sourceBuildManifestPath)).size,
        sha256: await sha256(sourceBuildManifestPath),
        schema: manifest.schema,
        status: manifest.status,
      },
      derivative: {
        repositoryRelativePath: `${packageRelative}/${derivative.package_relative_path}`,
        bytes: derivativeStat.size,
        sha256: derivativeSha256,
      },
      renderer: {
        repositoryRelativePath: renderScriptRelative,
        bytes: (await stat(renderScriptPath)).size,
        sha256: await sha256(renderScriptPath),
      },
      repairParent: manifest.repair_parent,
      timelineChanged: manifest.timeline_changed,
      frozenSignatureExactMatch: manifest.frozen_signature.exact_match,
    },
  };
}

async function validateExternalDirectory(root, label) {
  if (isWithin(repositoryRoot, root)) {
    throw new Error(`${label} must remain outside Git: ${root}`);
  }
  const metadata = await stat(root);
  if (!metadata.isDirectory()) throw new Error(`${label} is not a directory: ${root}`);
}

async function validateExecutable(command) {
  if (path.isAbsolute(command) || command.includes("/") || command.includes("\\")) {
    const executable = path.resolve(command);
    await access(executable);
    return executable;
  }
  return command;
}

function appendTail(current, chunk, maximum = 64 * 1024) {
  const combined = current + chunk;
  return combined.length <= maximum ? combined : combined.slice(combined.length - maximum);
}

async function launchFreshRender(blender, authority, definition, outputRoot) {
  const args = [
    "--background",
    authority.derivativePath,
    "--python",
    renderScriptPath,
    "--",
    "--variant",
    definition.id,
    "--quality",
    "production",
    "--frames",
    definition.frames.join(","),
    "--output",
    outputRoot,
  ];
  const started = Date.now();
  let stdoutTail = "";
  let stderrTail = "";
  let childPid = null;
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(blender, args, {
      cwd: repositoryRoot,
      env: process.env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    childPid = child.pid ?? null;
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdoutTail = appendTail(stdoutTail, text);
      process.stdout.write(`[${definition.id}] ${text}`);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderrTail = appendTail(stderrTail, text);
      process.stderr.write(`[${definition.id}] ${text}`);
    });
    child.on("error", reject);
    child.on("close", resolve);
  });
  if (exitCode !== 0) {
    throw new Error(
      `${definition.id} fresh Blender process exited ${exitCode}. ` +
        `Last stderr: ${stderrTail.trim() || "(empty)"}`,
    );
  }
  return {
    freshProcess: true,
    separateFromOtherVariant: true,
    processIdRecordedAtRuntime: childPid !== null,
    exitCode,
    durationSeconds: Number(((Date.now() - started) / 1000).toFixed(3)),
    executable: path.basename(blender),
    quality: "production",
    requestedFrames: definition.frames,
    stdoutEndedWithRenderReport: /QH_PHASE3R_RENDER_REPORT=/.test(stdoutTail),
    stderrWasEmpty: stderrTail.trim().length === 0,
  };
}

async function pngIdentity(file) {
  const buffer = await readFile(file);
  const signature = "89504e470d0a1a0a";
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== signature) {
    throw new Error(`Not a valid PNG: ${path.basename(file)}`);
  }
  return {
    bytes: (await stat(file)).size,
    sha256: await sha256(file),
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

async function comparePixels(referenceFile, rerenderFile) {
  const [reference, rerender] = await Promise.all([
    sharp(referenceFile).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(rerenderFile).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  if (
    reference.info.width !== rerender.info.width ||
    reference.info.height !== rerender.info.height ||
    reference.info.channels !== rerender.info.channels ||
    reference.data.length !== rerender.data.length
  ) {
    return {
      comparable: false,
      reason: "decoded pixel buffers have different geometry",
      visualStateIdentityPassed: false,
    };
  }

  const histogram = new Uint32Array(256);
  let absoluteTotal = 0;
  let squareTotal = 0;
  let changedChannels = 0;
  let maximum = 0;
  for (let index = 0; index < reference.data.length; index += 1) {
    const delta = Math.abs(reference.data[index] - rerender.data[index]);
    histogram[delta] += 1;
    absoluteTotal += delta;
    squareTotal += delta * delta;
    if (delta !== 0) changedChannels += 1;
    if (delta > maximum) maximum = delta;
  }
  const percentile = (fraction) => {
    const target = Math.ceil(reference.data.length * fraction);
    let cumulative = 0;
    for (let value = 0; value < histogram.length; value += 1) {
      cumulative += histogram[value];
      if (cumulative >= target) return value;
    }
    return 255;
  };
  const changedChannelRatio = changedChannels / reference.data.length;
  const p95 = percentile(0.95);
  const visualStateIdentityPassed =
    p95 === 0 && maximum <= 1 && changedChannelRatio <= 0.0001;
  return {
    comparable: true,
    decodedChannels: reference.info.channels,
    decodedChannelValues: reference.data.length,
    changedChannels,
    changedChannelRatio: Number(changedChannelRatio.toFixed(9)),
    mae8Bit: Number((absoluteTotal / reference.data.length).toFixed(9)),
    rmse8Bit: Number(Math.sqrt(squareTotal / reference.data.length).toFixed(9)),
    p95AbsChannelDelta: p95,
    maxAbsChannelDelta: maximum,
    thresholds: {
      p95AbsChannelDelta: 0,
      maxAbsChannelDelta: 1,
      maximumChangedChannelRatio: 0.0001,
    },
    visualStateIdentityPassed,
  };
}

async function verifyVariant(definition, referenceRoot, rerenderRoot, processRecord) {
  const generatedPngs = (await readdir(rerenderRoot))
    .filter((name) => name.toLowerCase().endsWith(".png"))
    .sort();
  const expectedPngs = definition.frames.map(
    (frame) => `phase3r-${definition.id}-${String(frame).padStart(4, "0")}.png`,
  );
  if (JSON.stringify(generatedPngs) !== JSON.stringify(expectedPngs)) {
    throw new Error(
      `${definition.id} fresh process did not create the exact sparse set: ${generatedPngs.join(", ")}`,
    );
  }

  const records = [];
  for (const frame of definition.frames) {
    const filename = `phase3r-${definition.id}-${String(frame).padStart(4, "0")}.png`;
    const referenceFile = path.join(referenceRoot, filename);
    const rerenderFile = path.join(rerenderRoot, filename);
    const [reference, rerender, pixelComparison] = await Promise.all([
      pngIdentity(referenceFile),
      pngIdentity(rerenderFile),
      comparePixels(referenceFile, rerenderFile),
    ]);
    const dimensionsPassed =
      reference.width === definition.dimensions[0] &&
      reference.height === definition.dimensions[1] &&
      rerender.width === definition.dimensions[0] &&
      rerender.height === definition.dimensions[1];
    const pngByteIdentityPassed =
      reference.bytes === rerender.bytes && reference.sha256 === rerender.sha256;
    const passed = dimensionsPassed && pixelComparison.visualStateIdentityPassed;
    records.push({
      frame,
      normalizedProgress: Number(((frame - 1) / 269).toFixed(6)),
      authoredState:
        new Map([
          [1, "dormant"],
          [126, "neutral-phosphor-wake"],
          [144, "continuous-picture-field-expansion"],
          [162, "settling"],
          [196, "integrated-quantum-content"],
          [250, "late-crt-texture-suppression"],
          [262, "near-digital-portal"],
          [270, "text-free-handoff"],
        ]).get(frame),
      filename,
      expectedDimensions: definition.dimensions,
      reference,
      rerender,
      dimensionsPassed,
      pngByteIdentityPassed,
      pixelComparison,
      status: passed ? "PASS" : "FAIL",
    });
  }

  return {
    status: records.every((record) => record.status === "PASS") ? "PASS" : "FAIL",
    expectedDimensions: definition.dimensions,
    sampleFrames: definition.frames,
    freshRenderProcess: processRecord,
    externalStorage: {
      referenceDirectoryRecordedInReport: false,
      rerenderDirectoryRecordedInReport: false,
      policy: "RAW_REFERENCE_AND_FRESH_RERENDER_PATHS_ARE_OUTSIDE_GIT_AND_OMITTED",
    },
    records,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const blender = await validateExecutable(options.blender);
  for (const [label, root] of [
    ["desktop reference", options.desktopReference],
    ["mobile reference", options.mobileReference],
  ]) {
    await validateExternalDirectory(root, label);
  }
  for (const [label, target] of [
    ["work root", options.workBase],
    ["run root", options.runRoot],
    ["report output", options.output],
  ]) {
    if (isWithin(repositoryRoot, target)) throw new Error(`${label} must remain outside Git`);
  }

  const authority = await bindDerivativeAuthority();
  await mkdir(options.workBase, { recursive: true });
  await mkdir(options.runRoot, { recursive: false });
  const results = {};
  for (const definition of variants) {
    const rerenderRoot = path.join(options.runRoot, definition.id);
    await mkdir(rerenderRoot, { recursive: false });
    const processRecord = await launchFreshRender(
      blender,
      authority,
      definition,
      rerenderRoot,
    );
    const referenceRoot =
      definition.id === "desktop" ? options.desktopReference : options.mobileReference;
    results[definition.id] = await verifyVariant(
      definition,
      referenceRoot,
      rerenderRoot,
      processRecord,
    );
  }

  const status = Object.values(results).every((result) => result.status === "PASS")
    ? "PASS"
    : "FAIL";
  const report = {
    schema: "quantum-hub.phase-3-r-render-determinism.v1",
    status,
    authority: "source-manifest-bound-fresh-process-sparse-production-rerender",
    deterministicProtocol: {
      desktopFreshBlenderProcess: true,
      mobileFreshBlenderProcess: true,
      processesAreSeparate: true,
      comparison:
        "PNG byte identity is recorded but not required. PASS requires exact production geometry, decoded p95 channel delta 0, maximum channel delta <= 1/255, and changed-channel ratio <= 0.0001.",
      toleranceRationale:
        "Independent Cycles OptiX and OIDN processes can produce a sparse set of one-level 8-bit rounding differences without changing authored state or visible timeline access.",
      renderSettings:
        "Phase 3-R renderer production preset: Cycles GPU, OptiX/CUDA, OIDN, AgX Medium High Contrast, 48 adaptive samples",
      randomFrameDependentEvents: false,
      checkpointCoverage: [
        "dormant",
        "wake",
        "picture-field-expansion",
        "settling",
        "content",
        "late-portal",
        "near-digital",
        "final-handoff",
      ],
    },
    sourceAuthority: authority.record,
    verifier: {
      repositoryRelativePath: portableRelative(verifierPath),
      bytes: (await stat(verifierPath)).size,
      sha256: await sha256(verifierPath),
    },
    outputPolicy: {
      reportOutsideGit: true,
      rawRerendersOutsideGit: true,
      rawRerendersRetained: true,
      historicalManifestsWritten: false,
      absoluteExternalPathsOmittedForPortability: true,
    },
    variants: results,
  };

  await mkdir(path.dirname(options.output), { recursive: true });
  await writeFile(options.output, JSON.stringify(report, null, 2) + "\n", "utf8");
  process.stdout.write(`Phase 3-R sparse render determinism ${status}: ${options.output}\n`);
  if (status !== "PASS") process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`Phase 3-R determinism verification failed: ${error.message}\n`);
  process.exitCode = 1;
});
