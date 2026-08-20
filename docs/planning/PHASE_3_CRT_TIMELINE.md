# Phase 3 CRT Master Timeline

Status: locked production authoring contract; current derivative validated
Branch: `feature/phase-3-crt-opening-production`
Accepted parent: `b54f3a83b6180466127589a8d028f94dab892d17`
Master cadence: 30 fps
Master frame range: 1–270 inclusive
Nominal media duration: 9.000 seconds

## Current execution authority

| Authority | Current value |
| --- | --- |
| Configuration | `artifacts/original/phase-3-crt-opening/source/phase3_config.py` |
| Derivative | `artifacts/original/phase-3-crt-opening/source/quantum-signal-television-phase3-opening.blend` |
| Derivative SHA-256 | `bbde82220f500c6f047c2e2d33a8580c08a40e65800615dd7256bebc2f4472ba` |
| Build ledger | `artifacts/original/phase-3-crt-opening/manifests/phase-3-source-build.json` — PASS |
| Validation ledger | `artifacts/original/phase-3-crt-opening/manifests/phase-3-source-validation.json` — PASS 28/28 |

The event frames below are the canonical editorial milestones in `phase3_config.py`. Some animated properties use earlier zero-strength keys or later retirement keys to create continuous envelopes; those exact implementation keys are called out where they differ from the milestone label.

## Purpose and boundary

This document freezes the Phase 3 desktop master timeline for **Quantum Signal Television**. It governs the isolated physical cinematic only. It does not implement scroll control, homepage integration, the CRT-to-DOM takeover, or any Phase 2B production-code change.

The sequence is:

```text
DORMANCY
→ CONDUCTION
→ ARRIVAL / INDICATOR
→ BOWED HORIZONTAL LINE
→ RECTANGULAR RASTER EXPANSION
→ SETTLING / SCANLINES / BLACK STABILIZATION
→ QUANTUM SIGNAL
→ CAMERA ENTRY / PORTAL HANDOFF
```

Phase 2B remains the design authority for the state immediately after frame 270.

## Frame and progress convention

The master contains exactly 270 displayed frames numbered 1 through 270. At 30 fps, frame 1 is displayed at `00:00.000`, frame 270 is displayed at `00:08.966667`, and the encoded stream has a nominal duration of `9.000` seconds.

Continuous normalized progress `u` uses equal frame cells:

```text
for 0.000000 <= u < 1.000000:
  frame(u) = min(270, floor(u * 270) + 1)

at u = 1.000000:
  frame(u) = 270
```

An inclusive frame range `a–b` therefore owns the continuous interval `[(a - 1) / 270, b / 270)`, except that the final range includes `u = 1.000000`.

Evidence that names a single rendered frame uses endpoint-safe sampled progress:

```text
u_sample(frame) = (frame - 1) / 269
```

This makes frame 1 exactly `0.000000` and frame 270 exactly `1.000000`. Production manifests must state which convention they use; phase boundaries use frame cells, while still-frame evidence uses `u_sample`.

## Frozen phase ranges

| Phase | Inclusive frames | Continuous normalized range | Time cell | Required end state |
| --- | ---: | ---: | ---: | --- |
| Dormancy | 1–30 | `[0.000000, 0.111111)` | `[0.000, 1.000)` s | CRT, indicator, cable core, and environment remain unenergized; zero environmental magenta |
| Spiral conduction | 31–112 | `[0.111111, 0.414815)` | `[1.000, 3.733)` s | Current front has traversed the spiral, reached the physical rear connection, and initiated its localized response |
| Arrival / indicator | 113–120 | `[0.414815, 0.444444)` | `[3.733, 4.000)` s | The post-contact connector response decays, then the small physical indicator is awake; screen remains dark until the line begins |
| Bowed horizontal line | 121–132 | `[0.444444, 0.488889)` | `[4.000, 4.400)` s | A soft, slightly bowed phosphor line exists inside the convex glass; no circular or radar imagery |
| Raster expansion | 133–154 | `[0.488889, 0.570370)` | `[4.400, 5.133)` s | The line has expanded into the curved, imperfect 4:3 picture area |
| Settling / scanline refinement / black stabilization | 155–176 | `[0.570370, 0.651852)` | `[5.133, 5.867)` s | Restrained degauss response is settled, scanlines enabled at the raster-expansion endpoint are refined, and raster black is stable |
| Quantum brand / route / status | 177–210 | `[0.651852, 0.777778)` | `[5.867, 7.000)` s | `QUANTUM HUB`, the five-stage route, and one restrained status have resolved cleanly |
| Meaningful portal approach / handoff | 211–270 | `[0.777778, 1.000000]` | `[7.000, 9.000]` s | Cabinet is effectively outside the viewport; raster is frontal, nearly flat, text-safe, and visually aligned for Phase 2B ENTRY |

These ranges are contiguous, non-overlapping, and cover every master frame exactly once.

## Detailed authoring cues

### Frames 1–30 — dormancy

- Frame 1 is a finished static composition, not a throwaway lead-in.
- The physical spiral, ground, and television remain legible through neutral, restrained lighting only.
- Environmental magenta, cable emission, indicator emission, phosphor emission, decorative particles, and reflected magenta are exactly zero.
- Camera movement is absent or below perceptual prominence. The cable will provide the first meaningful motion.
- Frame 30 is still fully dormant. The first visible current belongs to frame 31.

### Frames 31–112 — spiral conduction

- Frames 31–48 introduce the contained warm-magenta current at the outer cable while retaining the graphite sheath.
- Frames 49–71 traverse the outer half of the cable. The energized trail remains behind the modestly brighter leading front.
- The conduction midpoint lies on the boundary between frames 71 and 72; frame 72 is the canonical midpoint review frame.
- Frames 72–96 traverse the inner spiral without increasing global environmental illumination.
- Frames 97–112 complete the inward travel and make physical contact with the rear cable connection.
- Frame 112 is the last conduction frame: the current reaches contact and the localized connector reaction begins at that exact authored key.
- Cable progress is measured by authored curve length, not control-point count, so the visual front moves at a deliberate physical pace.

### Frames 113–120 — post-contact arrival and indicator

- Frame 113 is the first post-contact hold/review state; frames 113–115 retain the small localized response begun at frame 112 and then let it decay.
- Frames 116–120 bring up the physical indicator with restrained spill.
- The screen remains dark through frame 120. No picture-area fade-in is allowed.

### Frames 121–132 — bowed horizontal line

- The line originates inside the phosphor layer, not on the glass surface.
- Curvature, softness, and bloom remain subtle and respond to the physical CRT glass.
- The line may breathe slightly but must not become a laser, CSS-like rule, rectangle, reticle, ring, or circular boot graphic.

### Frames 133–154 — raster expansion

- Expansion proceeds vertically from the bowed line into a rounded rectangular 4:3 raster.
- Glass curvature, overscan, phosphor softness, and small geometric imperfection remain visible.
- The raster may slightly overshoot and recover, but it must not snap or stretch to the browser aspect ratio.

### Frames 155–176 — settling, scanlines, and black

- Frame 154 enables the accepted scanline geometry at emission strength `0.34`, coincident with the raster-expansion endpoint; it is not a separate hard onset at frame 167.
- The restrained degauss scale keys are frame 154 `(1.000, 1.000, 1.000)`, frame 158 `(1.008, 1.000, 0.994)`, frame 162 `(0.996, 1.000, 1.004)`, frame 167 `(1.002, 1.000, 0.999)`, and frame 176 `(1.000, 1.000, 1.000)`.
- Frame 167 is the canonical settled-scanline review milestone; frames 167–171 refine their fine, physically plausible appearance.
- Frames 172–176 stabilize black level and phosphor response. The scanline emission envelope continues deterministically from `0.34` at frame 154 to `0.26` at frame 176, `0.22` at frame 210, `0.12` at frame 255, and `0.045` at frame 270.
- No VHS montage, datamosh, RGB split, violent shake, random static, or horror-TV failure behavior is permitted.

### Frames 177–210 — Quantum signal content

- Frame 177, frame 190, and frame 201 are the canonical brand, route, and status milestones from the configuration authority.
- The physical raster envelopes are continuous and intentionally overlap those editorial milestones: brand keys are `(174, 0.00)`, `(180, 0.70)`, `(190, 0.68)`, `(197, 0.00)`; route keys are `(187, 0.00)`, `(193, 0.64)`, `(203, 0.62)`, `(213, 0.00)`; status keys are `(198, 0.00)`, `(204, 0.58)`, `(213, 0.54)`, `(222, 0.00)`.
- The three physical interface objects are render-visible only for frames 174–196, 187–212, and 198–221 respectively, then are hidden. Thus all physical interface text is retired by frame 222, well before the final handoff lock.
- Content remains sparse, premium, legible, and physically rasterized. No fictional HUD, percentages, coordinates, meters, or meaningless diagnostics are introduced.
- Content timing is additive and calm; it must remain comprehensible when traversed in reverse.

### Frames 211–270 — meaningful portal approach and handoff

- The desktop camera has subtle composition/reframe keys at frames 1, 72, 112, 176, and 210 before the semantic `camera_entry_start` milestone. Its full key set is 1, 72, 112, 176, 210, 232, 246, 258, and 270; the independently authored mobile path uses 1, 72, 112, 166, 198, 222, 244, 260, and 270.
- Frames 211–231 begin the meaningful physical approach while retaining cabinet, glass, and proving-field context.
- Frames 232–251 progressively correct toward frontal alignment. Perspective correction is established before the bezel exits at frame 252.
- Frames 252–254 take the screen edges beyond the viewport and make the cabinet/bezel effectively absent.
- The cable trail, contact lights, and indicator retain their authored state through frame 246 and reach zero emission at the frame-255 late-flattening key.
- Frames 255–264 perform late flattening: curvature and phosphor softness diminish perceptually, scanlines become fainter, and raster black converges on the accepted Operating Field black. Physical-screen text is already retired.
- Frames 265–269 lock the already text-free Phase 2B ENTRY alignment and retain the accepted text-free takeover cue rather than a blank bridge. `PHASE3_PORTAL_ALIGNMENT_FIELD` remains a hidden, review-only guide collection and is never baked into production media.
- Frame 270 is the exact handoff frame. It is nearly/fully frontal, effectively text-safe, minimally curved, faintly scanned, black-level matched, and contains no generic fade, blank pause, loader, or duplicated DOM-owned copy.

The final Phase 3 frame proves the physical side of the takeover. Phase 4 will own the actual rendered-to-native transition and scroll mapping.

## Canonical still-frame milestones

| Milestone | Frame | `u_sample` | Timestamp |
| --- | ---: | ---: | ---: |
| Dormant opening | 1 | `0.000000` | `00:00.000` |
| Last fully dormant frame | 30 | `0.107807` | `00:00.966667` |
| Current entry | 31 | `0.111524` | `00:01.000` |
| Conduction midpoint review | 72 | `0.263941` | `00:02.366667` |
| Current reaches connection / connector response begins | 112 | `0.412639` | `00:03.700` |
| Post-contact connector review | 113 | `0.416357` | `00:03.733333` |
| Indicator response | 116 | `0.427509` | `00:03.833333` |
| Bowed line begins | 121 | `0.446097` | `00:04.000` |
| Raster expansion begins | 133 | `0.490706` | `00:04.400` |
| Scanline geometry enabled / raster expansion ends | 154 | `0.568773` | `00:05.100` |
| Settling begins | 155 | `0.572491` | `00:05.133333` |
| Settled scanline review | 167 | `0.617100` | `00:05.533333` |
| Quantum brand canonical milestone | 177 | `0.654275` | `00:05.866667` |
| Route canonical milestone | 190 | `0.702602` | `00:06.300` |
| Status canonical milestone | 201 | `0.743494` | `00:06.666667` |
| Meaningful portal approach begins | 211 | `0.780669` | `00:07.000` |
| Front-alignment phase begins | 232 | `0.858736` | `00:07.700` |
| Bezel exit / raster becomes viewport-dominant | 252 | `0.933086` | `00:08.366667` |
| Late flattening begins | 255 | `0.944238` | `00:08.466667` |
| Handoff lock begins | 265 | `0.981413` | `00:08.800` |
| Exact portal handoff | 270 | `1.000000` | `00:08.966667` |

## Reverse-readiness contract

The same rendered frames must remain coherent when accessed in descending order. Reverse traversal is not required to simulate a literal real-world CRT shutdown, but it must look intentional and continuous.

- Frame 270 back through 255 restores curvature, scanlines, glass, bezel, cabinet, oblique perspective, and proving-field context gradually.
- Frames 254 back through 222 restore the physical cable/indicator sources and then the status object according to their authored continuous envelopes; no semantic text is present at frame 222 or later.
- Frames 221 back through 174 traverse the status, route, and brand envelopes in exact reverse order without popping; each stage reappears and then recedes at its authored zero-strength key.
- Frames 176 back through 121 contract the raster back to the bowed line and then to darkness without a circular collapse.
- Frames 120 back through 113 lower the indicator only after the screen has returned to darkness and remove the localized connector response coherently.
- Frames 112 back through 31 move the conduction boundary outward while shortening the energized trail; the sheath stays present throughout.
- Frames 30 back through 1 remain genuinely dormant and contain no residual magenta.
- Camera position, focal length, exposure, light intensities, material emissions, visibility, and deformation curves must be single-valued functions of frame/progress. No state is allowed to depend on playback direction.
- Directional motion blur that looks wrong under reverse seeking is prohibited. Use no motion blur or only a qualified restrained setting that passes reverse review.

## Frame determinism contract

- Rendering any frame in isolation must produce the same authored state as rendering it within the full sequence.
- Use fixed seeds for Cycles and every procedural source. Static material noise is acceptable; random frame-dependent events are not.
- Do not use unbaked physics, time-history simulations, uncontrolled particles, random sparks, noise bursts, stochastic glitches, or caches whose result depends on prior frames.
- If a cache becomes technically necessary, it must be deterministically baked outside Git, reproducible from documented inputs, validated by isolated-frame renders, and never become a source dependency.
- Conduction, CRT geometry, content visibility, camera movement, lighting, and late flattening must be reconstructable directly from the requested frame.
- Frame 1 and frame 270 are immutable endpoint compositions. Phase 4 may hold them for arbitrary scroll duration without requiring extra rendered frames.

## Change control

Any later pacing change must preserve all of the following:

- exactly 270 frames at 30 fps unless a human-approved timeline revision replaces this contract;
- the frozen startup order;
- no environmental magenta through frame 30;
- no screen picture before the indicator response;
- horizontal line before rectangular raster;
- gradual front alignment before late flattening;
- exact handoff at frame 270;
- coherent reverse traversal and isolated-frame determinism.

If final production changes any frame boundary, update this document and the eventual `PHASE_3_MEDIA_MANIFEST.md` together before review evidence is generated.
