# Phase 3-R CRT Authenticity Repair

Status: source-only narrow repair authored; final render, media, QA, and human review authorities pending
Branch: `feature/phase-3-crt-opening-production`
Repair parent: `ae6cd4c0c664a275c077bd37207efde01e9caa29`
Scope: phosphor / raster / startup only
Phase 4: unauthorized

## Purpose and human diagnosis

Human review accepted the physical cinematic and identified one bounded defect: the CRT screen treatment read as a stylized retro interface instead of a maintained old tube. The initial event near frame 126 was a clean Quantum-magenta graphic line. During formation, separate bright horizontal bars remained individually countable. Those bars continued to dominate the Quantum content and persisted too strongly during the portal approach, making the typography look composited over a scanline graphic rather than emitted through curved CRT glass.

Phase 3-R repairs that surface treatment only. Its intended progression is:

```text
dark glass
→ neutral physical phosphor wake
→ continuous picture field gathering vertically
→ fine, subordinate raster structure
→ restrained Quantum signal within the phosphor
→ gradual loss of CRT-specific texture
→ nearly digital Phase 2B-aligned black
```

It does not restart Phase 3, redesign the cinematic, integrate the sequence into production, or authorize Phase 4.

## Source lineage

| Authority | Path or identity | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Accepted Phase 0 CRT master | `artifacts/original/phase-0-4-crt-television/source/quantum-signal-television-v1.blend` | 1,516,222 | `3027c4c46e2b829fd97ee9a3a47558e43adda47abcc488420faa0f087bd720a7` |
| Accepted Phase 3 derivative | `artifacts/original/phase-3-crt-opening/source/quantum-signal-television-phase3-opening.blend` | 2,182,647 | `bbde82220f500c6f047c2e2d33a8580c08a40e65800615dd7256bebc2f4472ba` |
| Phase 3-R derivative | `artifacts/original/phase-3-crt-opening/source/quantum-signal-television-phase3-r-crt-authenticity.blend` | 2,222,662 | `4341a3fb7ae29ef9be4472ea23ca9235e36f9609893bc2f37de32e5847d36f26` |
| Git repair parent | `ae6cd4c0c664a275c077bd37207efde01e9caa29` | — | — |

The repair builder opens only the exact accepted Phase 3 derivative, verifies its filepath and SHA-256, and saves to the distinct Phase 3-R derivative path. It cannot overwrite either historical Blender authority. The derivative was authored with Blender `5.2.0 LTS`.

The current source-build ledger is `artifacts/original/phase-3-crt-opening/manifests/phase-3-r-source-build.json`. It records zero external images, linked libraries, audio, movie clips, cache files, or external paths. The canonical frozen-scene signature matched before and after the repair:

```text
before  3294b48a0a8e36d07daffb511bf0a59ef8fe25969cd8db686a31c9b1b98658f1
after   3294b48a0a8e36d07daffb511bf0a59ef8fe25969cd8db686a31c9b1b98658f1
```

The three accepted screen-content meshes also retained an exact X/Z topology digest:

```text
before  dad608ff19b5daa6ae0d596169748db137e8b0c3dfc647b5e640334f31647da1
after   dad608ff19b5daa6ae0d596169748db137e8b0c3dfc647b5e640334f31647da1
```

## Exact screen repair

### Neutral startup phosphor

The dominant startup tone is neutral warm-white `#d9d7d0`, not Quantum magenta. The new wake is a deterministic 65-point, slightly bowed curve seated within the accepted convex glass. Its center bow is 4.8 mm with restrained static positional variation of ±0.22 mm and tapered ends. Three optical layers replace the single graphic line:

| Layer | Curve radius | Peak emission | Function |
| --- | ---: | ---: | --- |
| `Phase3R_WakePhosphorCore` | 0.50 mm | 1.600 | restrained defined phosphor center |
| `Phase3R_WakePhosphorBody` | 1.35 mm | 0.620 | soft physical body |
| `Phase3R_WakePhosphorHalo` | 3.50 mm | 0.320 | low-energy local bloom through glass |

All three use static, spatial intensity variation in the range 0.82–1.00; no temporal noise is introduced. They become render-visible at frame 121, reach their authored emission peak at frame 126, decline through frame 132, and are fully dark by frame 136. Their width settles from 88% at frame 121 to 98% at frame 126 and 100% at frame 132. The accepted legacy wake object is retained as history but permanently hidden from rendering.

### Picture-field-first formation

The 18 legacy startup expansion bars and 32 legacy coarse scanline objects are retained but permanently hidden. `CRT_InternalPhosphorLayer` keeps its accepted mesh geometry and receives a continuous procedural field instead of separately revealed bars.

The field grows through a soft, feathered vertical mask: half-height advances from 0 at frame 131, to 0.006 at frame 132, 0.075 at frame 137, 0.280 at frame 144, 0.430 at frame 150, and 0.520 at frame 154. This makes increasing illuminated area and changing physical black the primary read. The desktop raster uses 160 procedural bands; the mobile raster uses 112 bands to reduce compression shimmer and moiré at portrait delivery sizes.

Desktop raster contrast is 0 at frame 133, 0.010 at frame 144, 0.075 at frame 154, and reaches only 0.085 during settled picture. The stable-picture modulation therefore never cuts deeper than 0.915 before the smaller static phosphor variation is applied. Mobile raster contrast is 72% of the corresponding desktop value. Raster texture is subordinate to the continuous field and has no deep black gaps.

Field emission is restrained: it rises from 0 at frame 131 to 0.520 at frame 144, peaks at 0.600 at frame 150, then settles to 0.420 at frame 162, 0.300 at frame 176, and 0.280 at frame 210. Mobile emission is 94% of desktop from frames 132–247. The base stays at physical CRT black `#080a0a` through the main picture and approaches the accepted page black only during late flattening.

### Maintained-tube settling

Settling is deterministic and reversible. From frames 154–176, the existing phosphor plane receives at most 0.35% X/Z scale breathing with a compensating location adjustment. It returns exactly to unit scale. There is no RGB split, static, tearing, tracking error, random frame event, or time-varying noise.

### Quantum content within the phosphor

The accepted copy, typography, hierarchy, object count, X/Z topology, and visibility schedules remain unchanged:

```text
QUANTUM HUB
FRAME   SOURCE   ASSESS   TEST   DECIDE
the accepted restrained status
```

Only optical depth and materials change. The three meshes are conformed in Y to a 4.8 mm inset within the accepted convex glass and receive warm-neutral, low-bloom Phase 3-R materials. Brand, route, and status each use restrained procedural raster interaction and static phosphor variation; mobile equivalents reduce raster frequency and emission. This preserves legibility and elegant typography while removing the appearance of sharp text pasted over the screen.

### Late texture suppression and portal ambiguity

CRT identity persists through the Quantum content and early approach, then recedes continuously. Desktop raster contrast reduces from 0.060 at frame 232 to 0.030 at frame 247, 0.010 at frame 255, 0.004 at frame 262, and 0.001 at frame 270. Mobile uses 72% of those values. Field emission falls from 0.235 at frame 232 to 0.180 at frame 247, 0.100 at frame 255, 0.050 at frame 262, and 0.015 at frame 270. Tone, physical black, softness, and emission converge on the accepted page field rather than disappearing as a hard cut.

The accepted portal-cue geometry is unchanged. Its copied Phase 3-R material makes the existing carrier surfaces optically silent through frame 220, enters them gradually by frame 238, and retains only the restrained late cue strength needed for the text-free handoff. Frames 265–270 remain free of physical text.

The only lighting compensation is `Phase3_ScreenSpill`: its color becomes neutral-warm `(0.72, 0.67, 0.59)`, with energy keys of 0 at frame 132, 31 at 154, 24 at 176, 26 at 210, 14 at 245, 7 at 255, and 2 at 270. This is screen-output compensation; it does not revise the accepted lighting philosophy.

## Changed-object, material, and property allowlist

No Blender property outside this table is authorized by Phase 3-R.

| Target | Authorized delta |
| --- | --- |
| `CRT_WakeHorizontalPhosphorLine` | Clear legacy animation and set `hide_render = true`; geometry and historical material remain present. |
| All 18 objects in `CRT_STARTUP_RASTER_EXPANSION` | Clear legacy animation and set `hide_render = true`; do not delete or remodel. |
| All 32 objects in `CRT_SCANLINE_GEOMETRY` | Clear legacy animation and set `hide_render = true`; do not delete or remodel. |
| New collection `PHASE3R_CRT_SCREEN_REPAIR` | Add only the three new startup-wake curve objects below. |
| `Phase3R_WakePhosphorCore`, `Phase3R_WakePhosphorBody`, `Phase3R_WakePhosphorHalo` | New glass-mediated curve geometry; parent `CRT_ASSEMBLY_ROOT`; allowlisted material, visibility, scale animation, and `phase3r_role` property only. |
| `CRT_InternalPhosphorLayer` | Replace material slot with the active Phase 3-R field material; replace object animation with deterministic scale/location settling keys. Mesh geometry must remain exact. |
| `CRT_InterfaceTitle`, `CRT_InterfaceRouteCarrier`, `CRT_InterfaceStatus` | Change vertex Y only to conform to the accepted glass; X/Z topology remains exact. Replace material slot with the matching active Phase 3-R interface material and add `phase3r_optical_depth`. |
| `Phase3_ScreenSpill` | Change light color; replace energy animation with the neutral screen-compensation keys; add `phase3r_screen_only_compensation`. |
| Every existing object in `CRT_PORTAL_TAKEOVER_CUES` | Change only its material assignment to `Phase3R_TextFreePortalContinuityCue`; geometry, transform, placement, and timing carriers remain unchanged. |
| Scene metadata | Add `phase3r_schema`, `phase3r_repair_parent`, `phase3r_phase3_derivative_sha256`, `phase3r_frozen_signature_sha256`, `phase3r_timeline_changed = false`, `phase3r_random_events = 0`, and `phase3r_scope`. |

New material allowlist:

- `Phase3R_WakeCore_Neutral`
- `Phase3R_WakeBody_Neutral`
- `Phase3R_WakeHalo_Neutral`
- `Phase3R_PhosphorField_Desktop`
- `Phase3R_PhosphorField_Mobile`
- `Phase3R_Interface_Brand_Desktop`
- `Phase3R_Interface_Brand_Mobile`
- `Phase3R_Interface_Route_Desktop`
- `Phase3R_Interface_Route_Mobile`
- `Phase3R_Interface_Ready_Desktop`
- `Phase3R_Interface_Ready_Mobile`
- `Phase3R_TextFreePortalContinuityCue`

The mobile materials are stored with persistent data-block authority and are selected by the mobile render path. The saved derivative is normalized to the accepted desktop camera and desktop/mobile cable-collection visibility state; that normalization is not a creative or geometric change.

## Frozen areas

The repair builder's before/after signature covers non-screen objects, geometry, transforms, animation, materials, collections, the complete event map, timeline, and dependency state. Its exact match confirms that Phase 3-R does not change:

- the proving field, ground, structural depth, CRT placement, or lighting philosophy;
- either spiral cable, its desktop/mobile turn count, route, sheath, physical connection, or rear strain relief;
- current-path geometry, conduction timing, leading edge, energized trail, or ground response;
- the accepted CRT cabinet, bezel, convex glass geometry, screen mesh geometry, speaker/control band, dimensions, proportions, materials, rear mass, controls, vents, or service panel;
- the desktop or mobile camera paths, lens strategy, front-alignment strategy, or cabinet exit;
- portal geometry, Phase 2B anchor/safe-zone geometry, or the text-free 265–270 takeover boundary;
- mobile scene composition;
- reduced-motion poster art direction or poster files;
- any Phase 2B component, controller, CSS, semantic hierarchy, ENTRY geometry, or production runtime.

## Timeline preservation

No editorial frame, phase boundary, or microtiming cue changed. The Phase 3-R configuration inherits the accepted `EVENTS` map, 30 fps cadence, frames 1–270 inclusive, normalized timeline, and 9.000-second duration.

| Phase | Frames |
| --- | ---: |
| Dormancy | 1–30 |
| Spiral conduction | 31–112 |
| Arrival / indicator | 113–120 |
| Horizontal line | 121–132 |
| Raster expansion | 133–154 |
| Settling | 155–176 |
| Quantum content | 177–210 |
| Camera approach | 211–270 |
| Late flattening, within approach | 247–264 |
| Text-free handoff, within approach | 265–270 |

The new property keys listed above shape optical treatment inside those accepted intervals; they do not move an event boundary or alter the total frame count.

## Before/after human-review intent

This table defines the visual gate; it does not pre-accept an unreviewed render.

| Frame | Phase 3 diagnosis | Phase 3-R review intent | Final review result |
| ---: | --- | --- | --- |
| ~126 | Clean, branded pink graphic line | Neutral, softly bowed phosphor wake with restrained body, core, bloom, falloff, variation, and glass depth | **[ROOT-FILL AFTER FINAL FULL-SIZE REVIEW]** |
| ~144 | Separate luminous horizontal bars | One vertically expanding picture field; fine raster structure is present but not countable | **[ROOT-FILL AFTER FINAL FULL-SIZE REVIEW]** |
| ~182 | Sharp white content over a graphic scanline layer | Quantum typography remains readable but shares glass curvature, phosphor softness, raster interaction, and restrained emission | **[ROOT-FILL AFTER FINAL FULL-SIZE REVIEW]** |
| ~250 | Horizontal stripes remain visually assertive | CRT texture is faintly perceptible and clearly receding along a continuous flattening curve | **[ROOT-FILL AFTER FINAL FULL-SIZE REVIEW]** |
| 270 | Surface still reads as a CRT shader | Nearly digital Phase 2B-aligned black; scan structure is barely perceptible and all physical text is absent | **[ROOT-FILL AFTER FINAL FULL-SIZE REVIEW]** |

Reverse review must confirm the same deterministic construction in reverse: stable picture → contraction → continuous field collapse → neutral horizontal line → dark glass.

## Final-run fields

These entries are deliberately unresolved until the authoritative selected renders, encodes, probes, browser seeking, scrub lab, reverse review, production regressions, and human-size inspection are complete.

| Final authority | Result |
| --- | --- |
| Phase 3-R source validation | **[ROOT-FILL: check count, status, ledger path]** |
| Desktop H.264 / VP9 | **[ROOT-FILL: selected files, hashes, sizes, probe and artifact review]** |
| Mobile H.264 / VP9 | **[ROOT-FILL: selected files, hashes, sizes, portrait/landscape and moiré review]** |
| Forward / reverse / deterministic render review | **[ROOT-FILL: status and evidence]** |
| Scrub and browser seek lab | **[ROOT-FILL: result ledger and any genuine limitation]** |
| Phase 2B integrity / build isolation | **[ROOT-FILL: hashes, checks, build, dist isolation]** |
| Human-review ZIP | **[ROOT-FILL: absolute external path, bytes, SHA-256, inventory]** |
| CRT authenticity gate | **PENDING HUMAN REVIEW — do not mark ACCEPT from source construction alone** |
