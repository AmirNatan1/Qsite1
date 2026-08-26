# Phase 4-R2 production pipeline

This file is the recovery authority for the Phase 4-R2 physical Cycles render.
It intentionally contains no private absolute path. Raw frames, receipts, logs,
and the authoritative live ledger remain external to Git.

## Frozen source

- Repository source: `artifacts/original/phase-4r1-1-periphery-current-mobile-crt/source/quantum-signal-television-phase4r1-1-periphery-current-mobile-crt.blend`
- Bytes: `3,600,194`
- SHA-256: `b0c9c7c1cf5a1642870cf03a36791cc50ec31ac207aeae794fbea83c856a79c0`
- Blender: `5.2.0 LTS`
- Exact packed Q SHA-256: `009c494df3b301470ab539f23e02b375f0c1fcec9b4b18cf07fc853b95fd03c5`

The accepted source is never saved by the production worker. The worker
rechecks its hash before every non-reused frame and after every invocation.
The durable external backup directory is
`phase-4r2-immutable-source-b0c9c7c1`; its copy is read-only and has the
same byte size and SHA-256 as the repository source.

## Physical production authority

Only F1-F500 are renderable. F501-F513 are the browser-authored black beat and
F514-F540 are the semantic HTML ENTRY reveal. The worker rejects every frame
outside F1-F500.

| Family | Camera | Cable collection | Master resolution |
| --- | --- | --- | --- |
| desktop | `Phase4R1_Camera_Desktop` | `PHASE4R1V2_CABLE_DESKTOP` | 1920x1200 |
| portrait | `Phase4R1_Camera_Mobile` | `PHASE4R1V2_CABLE_MOBILE` | 780x1688 |
| landscape | `Phase4R1_Camera_Landscape` | `PHASE4R1V2_CABLE_LANDSCAPE` | 1688x780 |

The selected camera and matching cable collection are switched in memory only.
All other camera, cable, scene, material, light, geometry, Q, and animation data
remain those of the frozen source hash.

Production settings are Cycles/OptiX GPU with CUDA fallback, 192 maximum
samples, adaptive sampling at `0.018`, OpenImageDenoise, motion blur, AgX
Medium High Contrast, `+1` exposure, RGB 16-bit PNG, and 30 fps authority.
Frames are written to a uniquely named pending PNG, fully checked through PNG
chunk CRCs and zlib row decoding, hashed, and then atomically promoted. Each
frame has an atomic receipt bound to the source and settings hashes.

## External state and recovery

The default external root is the durable local application-data production
directory `phase-4r2-production-b0c9c7c1`. Override it only with
`PHASE4R2_OUTPUT_ROOT`; the orchestrator refuses a repository, temporary, or
drive-root destination before creating any file.

- Live ledger: `phase-4r2-production-render-ledger.json` at the external root.
- Master frames: `masters/<family>/frames/F001.png` through `F500.png`.
- Receipts: `masters/<family>/receipts/F001.json` through `F500.json`.
- Logs: `logs/`.
- Invalid or mismatched prior outputs: preserved under `quarantine/`.
- Tracked recovery summary: `artifacts/reports/phase-4r2/phase-4r2-production-render-ledger.json`.

One exclusive production lock covers Blender work and tracked-ledger sync. A
concurrent invocation fails closed; a same-host lock is recoverable only after
its recorded process is proven dead. The live ledger is updated atomically
after every frame and reconciled against all on-disk frame/receipt pairs before
work resumes. On interruption, rerun the same command: frames are reused only
when their complete PNG stream, byte size, SHA-256, receipt, source SHA, family,
frame number, and settings SHA all match. Valid pending writes are salvaged;
invalid and superseded artifacts are preserved under `quarantine/`.

## Commands

Preflight and status:

```text
npm run phase4r2:preflight
npm run phase4r2:status
```

Required final-resolution pilot for one family:

```text
node scripts/phase4r2-production.mjs pilot --family desktop
```

Required temporal sample ranges F150-F180, F360-F390, and F450-F480:

```text
node scripts/phase4r2-production.mjs temporal --family desktop
```

Render the next measured, contiguous missing chunk:

```text
node scripts/phase4r2-production.mjs render-next --family desktop
```

The same commands apply to `portrait` and `landscape`. Status always prints the
exact next resume command. Explicit bounded ranges are also supported:

```text
node scripts/phase4r2-production.mjs render --family desktop --start 1 --end 50
```

Do not launch a monolithic 1,500-frame command. Commit and push the tracked
ledger summary after each completed family checkpoint. Raw masters must never
be added to Git, `public`, `dist`, a deployment, or a human-review ZIP.
