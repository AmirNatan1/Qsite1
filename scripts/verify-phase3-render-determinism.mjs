#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const derivativeRelative =
  "artifacts/original/phase-3-crt-opening/source/quantum-signal-television-phase3-opening.blend";
const expectedDerivativeSha256 =
  "bbde82220f500c6f047c2e2d33a8580c08a40e65800615dd7256bebc2f4472ba";
const variants = [
  {
    id: "desktop",
    size: [1920, 1080],
    frames: [1, 72, 126, 154, 196, 246, 270],
  },
  {
    id: "mobile",
    size: [720, 1280],
    frames: [1, 72, 126, 154, 196, 222, 270],
  },
];

const help = `Phase 3 sparse render determinism verifier

Usage:
  node scripts/verify-phase3-render-determinism.mjs \\
    --desktop-reference <outside-git-directory> \\
    --desktop-rerender <outside-git-directory> \\
    --mobile-reference <outside-git-directory> \\
    --mobile-rerender <outside-git-directory> \\
    --output <report.json>

Each rerender directory must contain the seven authored sample PNGs produced in
a fresh Blender process. The verifier records byte identity and measures decoded
pixel equivalence against the corresponding completed sequential master.`;

function parseArguments(argv) {
  if (argv.includes("--help")) {
    process.stdout.write(help + "\n");
    process.exit(0);
  }
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error("Invalid arguments.\n\n" + help);
    }
    values.set(flag.slice(2), value);
  }
  const required = [
    "desktop-reference",
    "desktop-rerender",
    "mobile-reference",
    "mobile-rerender",
    "output",
  ];
  for (const key of required) {
    if (!values.has(key)) throw new Error("Missing --" + key + ".\n\n" + help);
  }
  return Object.fromEntries(
    required.map((key) => [key, path.resolve(String(values.get(key)))]),
  );
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
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

async function pngIdentity(file) {
  const buffer = await readFile(file);
  const signature = "89504e470d0a1a0a";
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== signature) {
    throw new Error("Not a valid PNG: " + path.basename(file));
  }
  const fileStat = await stat(file);
  return {
    bytes: fileStat.size,
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
  const histogram = new Array(256).fill(0);
  let absoluteTotal = 0;
  let squareTotal = 0;
  let changedChannels = 0;
  let maximum = 0;
  for (let index = 0; index < reference.data.length; index += 1) {
    const delta = Math.abs(reference.data[index] - rerender.data[index]);
    histogram[delta] += 1;
    absoluteTotal += delta;
    squareTotal += delta * delta;
    if (delta > 0) changedChannels += 1;
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
  const mae = absoluteTotal / reference.data.length;
  const rmse = Math.sqrt(squareTotal / reference.data.length);
  const changedChannelRatio = changedChannels / reference.data.length;
  const visualStateIdentityPassed =
    percentile(0.95) === 0 && maximum <= 1 && changedChannelRatio <= 0.0001;
  return {
    comparable: true,
    decodedChannels: reference.info.channels,
    decodedChannelValues: reference.data.length,
    changedChannels,
    changedChannelRatio: Number(changedChannelRatio.toFixed(9)),
    mae8Bit: Number(mae.toFixed(9)),
    rmse8Bit: Number(rmse.toFixed(9)),
    p95AbsChannelDelta: percentile(0.95),
    maxAbsChannelDelta: maximum,
    thresholds: {
      p95AbsChannelDelta: 0,
      maxAbsChannelDelta: 1,
      maximumChangedChannelRatio: 0.0001,
    },
    visualStateIdentityPassed,
  };
}

async function verifyVariant(definition, referenceRoot, rerenderRoot) {
  for (const [label, root] of [
    ["reference", referenceRoot],
    ["rerender", rerenderRoot],
  ]) {
    if (isWithin(repositoryRoot, root)) {
      throw new Error(`${definition.id} ${label} directory must remain outside Git`);
    }
    await access(root);
  }

  const rerenderNames = (await readdir(rerenderRoot))
    .filter((name) => name.toLowerCase().endsWith(".png"))
    .sort();
  const expectedNames = definition.frames.map(
    (frame) => `phase3-${definition.id}-${String(frame).padStart(4, "0")}.png`,
  );
  if (JSON.stringify(rerenderNames) !== JSON.stringify(expectedNames)) {
    throw new Error(
      `${definition.id} rerender set differs from the exact sparse sample: ${rerenderNames.join(", ")}`,
    );
  }

  const records = [];
  for (const frame of definition.frames) {
    const filename = `phase3-${definition.id}-${String(frame).padStart(4, "0")}.png`;
    const reference = await pngIdentity(path.join(referenceRoot, filename));
    const rerender = await pngIdentity(path.join(rerenderRoot, filename));
    const pixelComparison = await comparePixels(
      path.join(referenceRoot, filename),
      path.join(rerenderRoot, filename),
    );
    const dimensionsPassed =
      reference.width === definition.size[0] &&
      reference.height === definition.size[1] &&
      rerender.width === definition.size[0] &&
      rerender.height === definition.size[1];
    const pngByteIdentityPassed =
      reference.bytes === rerender.bytes && reference.sha256 === rerender.sha256;
    const passed = dimensionsPassed && pixelComparison.visualStateIdentityPassed;
    records.push({
      frame,
      normalizedProgress: Number(((frame - 1) / 269).toFixed(6)),
      filename,
      expectedDimensions: definition.size,
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
    expectedDimensions: definition.size,
    sampleFrames: definition.frames,
    storagePolicy: "RAW_REFERENCE_AND_RERENDER_PATHS_OUTSIDE_GIT_AND_INTENTIONALLY_OMITTED",
    records,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const derivativePath = path.join(repositoryRoot, derivativeRelative);
  const derivativeSha256 = await sha256(derivativePath);
  if (derivativeSha256 !== expectedDerivativeSha256) {
    throw new Error("Derivative Blender source hash differs from the accepted Phase 3 authority");
  }
  const scriptRelative = path.relative(repositoryRoot, fileURLToPath(import.meta.url)).replaceAll("\\", "/");
  const results = {};
  for (const definition of variants) {
    results[definition.id] = await verifyVariant(
      definition,
      options[`${definition.id}-reference`],
      options[`${definition.id}-rerender`],
    );
  }
  const status = Object.values(results).every((result) => result.status === "PASS")
    ? "PASS"
    : "FAIL";
  const report = {
    schema: "quantum-hub.phase-3-render-determinism.v1",
    status,
    authority: "fresh-process-sparse-production-rerender-decoded-pixel-comparison",
    deterministicProtocol: {
      desktopFreshBlenderProcess: true,
      mobileFreshBlenderProcess: true,
      comparison:
        "PNG byte identity is recorded but not required; PASS requires exact geometry, decoded p95 delta 0, maximum channel delta <= 1/255, and changed-channel ratio <= 0.0001",
      renderSettings: "Cycles GPU, OptiX, OIDN, AgX Medium High Contrast, 48 adaptive samples",
      randomFrameDependentEvents: false,
      rationale:
        "Fresh OptiX/OIDN processes may differ at a sparse set of 8-bit rounding values without changing authored state or visible timeline access.",
    },
    derivativeSource: {
      repositoryRelativePath: derivativeRelative,
      bytes: (await stat(derivativePath)).size,
      sha256: derivativeSha256,
    },
    verifier: {
      repositoryRelativePath: scriptRelative,
      sha256: await sha256(fileURLToPath(import.meta.url)),
    },
    variants: results,
  };
  await mkdir(path.dirname(options.output), { recursive: true });
  await writeFile(options.output, JSON.stringify(report, null, 2) + "\n", "utf8");
  process.stdout.write(`Phase 3 sparse render determinism ${status}: ${options.output}\n`);
  if (status !== "PASS") process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write("Phase 3 determinism verification failed: " + error.message + "\n");
  process.exitCode = 1;
});
