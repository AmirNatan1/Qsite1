# Phase 0 test and build report

Final pre-commit verification date: 2026-08-17

Branch: `planning/phase-0-reconciliation`
Parent: `501040c42bba30b9d9517b88a8f9857992a2dba4`

The final pushed SHA and Cloudflare branch check cannot be written into their own commit. They are reported in the external Human Review Package handoff.

## Dependency restoration

Command: `npm ci`

Result: pass; 277 packages restored from the committed lockfile.

Observed npm warning: npm's install-script policy reported the `esbuild@0.28.2` postinstall as not explicitly allow-listed. No approval or policy mutation was performed. The static check and build completed successfully with the installed platform package.

## Static/type/content/provenance checks

Command: `npm run check`

Result:

```text
Astro diagnostics: 0 errors, 0 warnings, 0 hints
Node tests: 13 passed, 0 failed, 0 skipped
Original SVG render verification: 10/10 parsed and vector geometry rasterized
```

Coverage includes:

- explicit Astro static output;
- authorized Phase 0 root copy and absent prohibited dependencies;
- all nine planning files;
- nine frozen Q-HUB asset hashes;
- all 37 registered committed asset hashes;
- direct progress ranges and absence of wheel cancellation/nested scrolling code;
- reduced-motion early return and zero video construction;
- original SVG dimensions/semantics;
- real encoded-seek evidence consistency;
- private absolute-path scan;
- prohibited launch-output scan;
- absence of binaries matching the private third-party reference manifest.

The raster check removes SVG review labels before rendering so it validates the authored vector geometry without requiring or installing a system font cache. Source-level tests separately require titles, descriptions, declared dimensions, and well-formed closing SVG structure for every original file. No font file was installed or distributed.

## Static production build

Command: `npm run build`

Result:

```text
Astro output mode: static
Routes: 1 (/index.html)
Static files: 11
Static output bytes: 9,333,433
Server/Worker output: none
Build verification: semantic /, no server runtime, no asset over 25MiB
```

The output size includes the nine approved frozen Q-HUB public assets. The Phase 0 root itself references only the approved Quantum identity SVG and contains no client script or cinematic media.

## Browser verification

See `BROWSER_QA.md` for required viewports, exact reverse, reduced motion, keyboard focus, zero horizontal overflow, single-root scroll, and controller timing.

## Encoded-media verification

See `TOOLCHAIN_AND_MEDIA_AUDIT.md` and `encoded-seek-spike-report.json` for the historical pre-install 640×400 VP9 browser encode, forward/reverse seek order, explicit frame-callback timeouts, and then-absent FFmpeg/ffprobe boundary. Current portable-toolchain and genuine Blender-media evidence is recorded in `TOOLCHAIN_3D_REPAIR.md` and `artifacts/original/phase-0-3d-repair/manifests/`.
