# Phase 4-R2.1 cinematic reaction state machine

Status: CP1 implemented for focused source review. This report covers only zero-dead-zone scroll mapping and the bounded automatic CRT wake. Codec selection, media inventory, timeout geometry preservation, CSS, authored media, and evidence capture are outside CP1.

## Fixed timeline authority

- Exact top: conceptual `u=0`, physical F1.
- First positive integer scroll offset: conceptual `u>=45`, physical F46. There is no positive scroll position that still presents dormant F1–F45.
- Arrival boundary: conceptual `u=284`, physical F285.
- Automatic wake: the existing muted decoder plays from F285 to F370 only.
- Arrival media time: `(285 - 1) / 30 = 9.4666667 s`.
- Stable-Q media time: `(370 - 1) / 30 = 12.3000000 s`.
- Wake duration: `(370 - 285) / 30 = 2.8333333 s`.
- First post-arrival scroll position: conceptual `u=370`, physical F371. F286–F370 therefore have one owner: the automatic wake.
- Physical media remains capped at F500. Conceptual `u=500..513` remains browser black and `u=513..540` remains the semantic ENTRY reveal.

The runtime derives an integer scroll offset from native `window.scrollY`; it does not intercept wheel, touch, pointer, or keyboard input and never writes scroll position.

## Calculated mapping at authored viewport travel

| Cohort example | Rounded travel (px) | Arrival offset (px) | Offset 0 | Offset 1 | Arrival | Arrival + 1 | End |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Desktop 1440×900 | 5,625 | 2,403 | F1 | F46 | F285 | F371 | F500 / u540 |
| Short desktop 1366×650 | 3,543 | 1,489 | F1 | F46 | F285 | F371 | F500 / u540 |
| Portrait 390×844 | 4,093 | 1,682 | F1 | F46 | F285 | F371 | F500 / u540 |
| Portrait 320×800 | 3,880 | 1,595 | F1 | F46 | F285 | F371 | F500 / u540 |
| Portrait 768×1024 | 4,966 | 2,041 | F1 | F46 | F285 | F371 | F500 / u540 |
| Landscape 844×390 | 1,989 | 818 | F1 | F46 | F285 | F371 | F500 / u540 |

The family-specific approved orbit anchors remain the interpolation shape. The new integer boundary assigns F1 only to exact top, then compresses the former dormant interval out of positive scroll travel. The calculated F285 position is kept as the arrival boundary; scroll resumes after the decoder-owned interval.

## State transition authority

| State | Event / condition | Next state | Decoder action |
| --- | --- | --- | --- |
| `pending` | media ready below arrival | `pre-arrival` | paused seek to latest scroll frame |
| `pending` | load/history already at or beyond arrival | `post-arrival` | skip replay; paused seek to F370 or latest post frame |
| `pre-arrival` | native scroll crosses the F285 boundary | `wake-armed` | exact paused seek to F285 |
| `wake-armed` | F285 is presented | `wake-forward` | call `play()` once on the existing muted video |
| `wake-forward` | presented media reaches F370 | `stable-hold` | pause and exact-seek F370 |
| `wake-armed` / `wake-forward` | latest scroll outruns arrival | `post-arrival` | cancel callback/playback and direct-seek latest F371+ target |
| `stable-hold` / `post-arrival` / active wake | scroll retreats | `wake-reverse` | cancel playback and unwind with paused frame seeks |
| `wake-reverse` | unwind reaches latest pre-arrival target | `pre-arrival` | remain paused at that exact target |
| `wake-reverse` | scroll re-enters the F285 boundary | `wake-armed` | cancel old generation and arm exactly one new wake |
| any active state | media/seek/play failure | `failed` | abort/release media and fail open; no input trap |

```text
                         restore/pending at-or-beyond
            +--------------------------------------------------+
            |                                                  v
pending --ready below--> pre-arrival --cross F285--> wake-armed
   |                         ^                        |
   |                         | unwind                | F285 presented
   |                         |                        v
   +--restore post------> post-arrival <---outrun--- wake-forward
                              ^                        |
                              |                        | F370 presented
                              |                        v
                              +----forward------ stable-hold
                                      \              /
                                       \--retreat---/
                                             |
                                             v
                                        wake-reverse
                                      /              \
                            re-enter F285          unwind complete
                                  |                    |
                                  +--> wake-armed      +--> pre-arrival

Any active state -- media / seek / play failure --> failed (usable fail-open)
```

Each asynchronous reaction owns a generation number. A cancellation increments it, so stale video-frame callbacks, animation-frame callbacks, and rejected playback promises cannot mutate the current state.

Native intent has a separate sequence authority. Only the passive `scroll` listener increments that sequence. ResizeObserver, font readiness, resize, and `pageshow` may remeasure offsets and update safe paused targets, but their writes have direction `0`, crossing `0`, and cannot arm, outrun, reverse, or cancel an active reaction.

## Presentation and fallback policy

`requestVideoFrameCallback` is the primary presentation authority during forward wake. Its `mediaTime` updates the presented frame and stops playback as F370 is presented. Where that API is absent, `requestAnimationFrame` observes decoder `currentTime` only to trigger the bounded stop; it does not claim that an intermediate frame was presented. The exact terminal paused seek and its `seeked` event prove F370 and correct any decoder overshoot. No second clock or playback timer is synthesized.

`presentedPhysicalFrame` is not a target or prediction. Apart from the initial F1/poster assumption, it is written only from `seeked` or decoder-presentation observation. Arming F285 does not claim F285 has appeared. A reverse decision always uses this last proven frame and explicitly ignores a newer requested/pending seek. Cancellation retargets an in-flight future seek immediately before reverse stepping, preventing that unpresented target from flashing or becoming the unwind origin.

Reverse uses the same decoder, paused. Frames beyond F370 unwind at a bounded 90 fps; the authored F370→F285 reaction unwinds at 30 fps; the remaining move to the latest pre-arrival scroll target is bounded at 90 fps. Ordinary seeks coalesce, while reversal, re-entry, or forward override replaces an in-flight future seek immediately with the latest authoritative target.

An active reverse plan owns one monotonic start timestamp. Later backward wheel, touch, or keyboard events may lower its target floor, but they do not reset its origin or elapsed clock. Continuous 60 Hz input therefore cannot starve the authored 30 fps unwind.

Geometry-only remeasurement may replace that floor with the newly mapped paused target while preserving the same start timestamp. When the unwind completes, it explicitly retargets the current mapping, so a resize, font settlement, or `pageshow` cannot leave it parked at a stale pre-measurement frame.

If a newer retreat or geometry target changes the floor while the decoder is still seeking the previous floor, the `seeked` callback resumes the same monotonic reverse plan. The obsolete in-flight seek therefore cannot strand the unwind.

## Edge-case policy

- The scroll event that first crosses arrival arms the wake even if a native wheel/touch increment lands a few pixels beyond the exact boundary. A later forward event is the latest-wins override: it cancels that generation immediately and seeks the newest post-arrival target. If no later event arrives, the wake completes and then seeks the already-recorded post target.
- Reversing cancels native play before any unwind begins. Each later reverse event replans from the newest actually presented frame; a requested but unpresented future frame is never an origin. Forward re-entry either seeks the newer pre-arrival frame or arms one new wake at the boundary.
- Reload, BFCache/history restoration, or initial placement at/beyond arrival never replays the wake. History metadata version 2 records `arrivalOrBeyond` in the existing history entry only; no persistent storage is used.
- Crossing arrival while media is pending records a pending arrival and skips retroactive playback when media becomes usable. Returning below arrival before readiness clears that pending condition, allowing a later genuine crossing to react once.
- Visibility loss cancels the active callback generation. Resumption at/beyond arrival restores stable/post state instead of replaying.
- Playback rejection or decode/seek failure follows the existing fail-open route. CP1 does not alter the separately scoped late-timeout geometry policy.
- Skip remains synchronous and releases ENTRY without waiting for media.
- Reduced motion remains an eligibility bypass before the production media fetch; no wake state or decoder playback is entered.
- With JavaScript absent, the decorative video has no source and the document retains its semantic static fallback.
- Deep links and restored positions derive state from native document position. At/beyond arrival they enter stable/post state without dormancy or replay; before arrival they retain normal progression.

## Focused executable checks

`node --test tests/phase4r2-runtime.test.mjs` covers the six authored travel cohorts, exact F1/F46/F285/F371 boundaries, the 85/30-second interval, geometry-only writes, armed/playing reverse, unpresented pending-seek races, rVFC terminal authority, skip/lifecycle/failure decisions, single-decoder source constraints, native-scroll prohibitions, and restoration metadata.

`node_modules/.bin/tsc --noEmit --pretty false` type-checks the controller under the repository strict TypeScript configuration.

The source verifier was intentionally updated to require the new mapping, one bounded `video.play()` call, rVFC/rAF presentation control, exactly three presented-frame assignment sites (initialization, presentation observation, and `seeked`), actual-frame reverse authority, explicit passive-scroll event sequencing, state-machine reverse/re-entry, version-2 restoration metadata, and the expanded controller budget. Its unrelated staged-media checks remain authoritative and are not changed by CP1.
