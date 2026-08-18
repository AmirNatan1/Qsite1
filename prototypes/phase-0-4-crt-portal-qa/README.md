# Phase 0.4 CRT Portal QA Scaffold

This is a non-public review system for the Quantum Signal Television's physical 4:3 screen, camera entry and semantic-DOM takeover. It is not a launch route and is not wired into the public Astro application.

## Current state

The 46-case / 36-capture topology is defined in `capture-plan.json`. The executable HTML/CSS/JavaScript harness ran against the post-clean frozen six-source ledger and accepted evaluated cabinet/screen/cable keepouts. The final normalized matrix contains 46/46 passing reports and 36/36 normalized captures at `artifacts/evidence/phase-0-4-crt-television/browser-matrix-report.json` (1,149,989 bytes; SHA-256 `5411220869170f0290423d2f235aba2dc659aa1820e6eb2a3680bbe179d073d7`). Every normalized source was inspected individually at full target size and passed the direct visual audit. The staged finalizer preserves the ready-plan snapshot, promotes the exact eight-state portal authority to PASS, and seals all seven browser-derived review sheets. Browser evidence is PASS at SHA-256 `0ad595af087867134b7199f1d92855209a7dfd18205bef45efb2e64675c04a58`; the current plan is complete. Human creative acceptance remains a separate gate.

The six fail-closed source IDs are `source-desktop-dormant`, `source-mobile-dormant`, `source-reduced-desktop-dormant`, `source-reduced-mobile-dormant`, `source-physical-portal-close`, and `source-text-free-portal-takeover`. The first, third, fifth and sixth are 1920×1200; the authored-mobile pair is 1080×1800. Their fixed paths are recorded in `capture-plan.json`. The frozen keepout manifest uses those IDs as record keys and `sourceRole` values and binds exact source hashes/dimensions plus evaluated object lineage. Five physical roles require visible normalized cabinet/screen polygons and spiral-cable segments. The exact post-bezel text-free takeover role instead requires explicit out-of-frame records with null bounds, zero projected/visible points and empty projections; those physical shapes are provenance-bound but collision-non-applicable after they leave the frame.

Scaffold reports identify themselves with `authority.mode: scaffold`, `captureEligible: false`, and `sceneSafety.applicable: false`. Final reports require `authority.mode: final`, exact six-source and keepout lineage, and applicable source-projected collision results. Scaffold reports can never enter the final matrix. The byte-frozen CRT layout JSON retains its original closed pre-freeze gate; the current plan's six exact source records and accepted keepout hash are the additive capture release.

## Repository-native workflow after release

The local prototype server remains on port 4173. The repository commands are:

```text
npm run capture:phase04 -- --list
npm run capture:phase04 -- --batch-size 10
npm run capture:phase04 -- --case portal-zoom-200--narrow-320x800
python scripts/normalize-phase04-captures.py
python scripts/normalize-phase04-captures.py --check
npm run prepare:phase04-browser
npm run finalize:phase04-browser
npm run check:phase04-browser
node scripts/verify-phase0-4-crt-layout.mjs
```

The capture command:

- processes no more than ten pending cases per invocation;
- reads serialized same-origin runner and child reports rather than inferring success from pixels;
- takes 11 successive full-page JPEGs for each visual case;
- accepts only one exact-byte modal winner with at least 7 votes;
- writes an atomic checkpoint after each case;
- validates plan, contract, harness, scene and keepout hashes before skipping completed cases;
- preserves stale-authority reports and raw images under `artifacts/evidence/phase-0-4-crt-television/recovery/` before starting a replacement authority;
- emits the final matrix only after all 46 reports and 36 modal visual captures validate.

Re-running the same command is the resume operation; no separate resume flag is needed.

The normalizer crops the measured evidence frame and resamples only capture-scale values below 1. It binds raw and normalized SHA-256 lineage to the matrix and then updates the checkpoint. It does not alter source scene pixels.

After normalization, `prepare:phase04-browser` preserves a byte-identical snapshot of the ready-for-capture plan, binds semantic portal states 7–8 to normalized case `portal-actual--desktop-1440x900`, promotes `crt-portal-transition-state-authority.json` to the exact eight-state PASS authority, and writes the browser evidence inputs for the compositor. Because that operation changes the canonical render manifest, it also refreshes the canonical-inventory pointer in the seven-state power authority and the canonical/power pointers in the already-rendered sheets 2–9 composition manifest. Physical source records and review pixels remain unchanged. It does not mark the plan complete.

After the compositor has produced sheets 10–16 and its PASS manifest, `finalize:phase04-browser` requires the material/asset manifest, all seven review outputs and all source hashes before changing `matrixStatus` to `complete`. `check:phase04-browser` is read-only and validates that completed one-way authority chain. The matrix continues to bind the preserved ready-plan snapshot, avoiding a circular plan/matrix hash.

## Verified report gates

The final harness measures rather than assumes:

- exact requested viewport and state;
- 4:3 physical screen geometry and continuous native-aspect DOM takeover;
- zero whole-word fragmentation with a human line-break report;
- zero overflow, text clipping, collisions and nested component scrolling;
- 12-pixel rule clearance, 44×44 targets and visible explicit focus;
- source-projected CRT cabinet, CRT screen and cable-segment keepouts;
- no identical text-bearing physical raster behind semantic DOM;
- static dormant reduced-motion composition with no cinematic media or large rounded glass panel.

The ten `font=fallback` long-copy cases force the documented display, editorial and UI system stacks onto the live elements. A pass requires exact normalized computed-stack matches and absence of the preferred Syne, Newsreader and Inter tokens; merely requesting fallback mode is insufficient.

Portal sheet 10 binds the exact six physical portal renders plus semantic states 7–8 from the normalized reference portal case. Browser-derived review sheets 11–16 use only the exact case IDs recorded in the plan. After normalization, the matrix binds each selected capture's repository-relative path, dimensions, byte count and SHA-256. The review compositor must bind both the external SHA-256 of the finalized matrix and the final eight-state portal authority; it may add labels or metadata without repainting evidence pixels.

Phase 1 remains locked.
