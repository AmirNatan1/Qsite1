# Phase 5A scroll-addressed CRT mapping

Status: implemented for Phase 5A human review  
Accepted parent: `47a6f3cc7f464b09c9c143cac273c2a1f5a35bfa`  
Physical authority: unchanged F1–F500 H.264 film at 30 fps  
Blender authority: unchanged `quantum-signal-television-phase4r2-1-causal-current.blend`  
Blender SHA-256: `58f5479484dd8da342556abad1e58c96a660f30e6a9d6d5215927056b5cbc516`

## Amendment

The accepted Phase 4-R2.1 automatic decoder wake has been removed. The one
existing video element is always paused and is used only as a seek surface.
Native document position is the sole authority for forward, reverse, restored,
media-pending, and fast-jump states.

There is no `play()` path, wake timer, reverse timer, direction latch, synthetic
scroll write, second decoder, or DOM reconstruction of the CRT.

## Total travel and pacing decision

Keeping the Phase 4-R2.1 total travel would have required cutting the accepted
scroll-addressed Q hold or compressing the approach/threshold band by roughly
forty percent. Phase 5A therefore uses the brief's permitted maximum modest
increase of `0.5` viewport heights per family. Conduction/orbit, the restored
startup, the accepted Q hold, digital breathing, and ENTRY reveal retain their
legible absolute allocations. Only the approach/threshold remainder is reduced,
by approximately 7–15% depending on family.

| Family | Phase 4-R2.1 | Phase 5A | Increase |
| --- | ---: | ---: | ---: |
| Desktop | 6.25vh | 6.75vh | 0.50vh |
| Short desktop | 5.45vh | 5.95vh | 0.50vh |
| Portrait | 4.85vh | 5.35vh | 0.50vh |
| Mobile landscape | 5.10vh | 5.60vh | 0.50vh |

| Family | Through F285 | F285→F370 startup | F370→F406 Q hold | F406→digital black | Black | ENTRY |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Desktop | 2.6695vh | 0.7859vh | 0.8672vh | 1.6489vh | 0.2530vh | 0.5254vh |
| Short desktop | 2.2911vh | 0.6973vh | 0.7694vh | 1.5076vh | 0.2225vh | 0.4621vh |
| Portrait | 1.9935vh | 0.6078vh | 0.6706vh | 1.4466vh | 0.2052vh | 0.4262vh |
| Mobile landscape | 2.0962vh | 0.6391vh | 0.7052vh | 1.4954vh | 0.2158vh | 0.4482vh |

The startup allocations are inside the requested bands: desktop 0.75–1.00vh,
short desktop 0.65–0.85vh, portrait 0.60–0.80vh, and mobile landscape
0.60–0.80vh.

## Explicit piecewise authority

Coordinates are zero-based: physical F285 is conceptual `u=284`. Exact top is
the only F1 position. The first positive integer document offset targets F46.
At exact arrival the film is F285; arrival + 1px targets F286.

| Segment | Conceptual range | Physical range | Semantic range | Ownership |
| --- | ---: | ---: | ---: | --- |
| Top dormancy | u0 | F1 | 0 | exact document top only |
| Current + orbit | u45–283 | F46–F284 | 0 | scroll |
| CRT arrival | u284 | F285 | 0 | exact arrival address |
| Indicator/startup | u285–298 | F286–F299 | 0 | scroll |
| Bowed phosphor line | u299–314 | F300–F315 | 0 | scroll |
| Line-to-raster expansion | u315–334 | F316–F335 | 0 | scroll |
| Raster settling | u335–354 | F336–F355 | 0 | scroll |
| Q appearance | u355–368 | F356–F369 | 0 | scroll |
| Stable Q hold | u369–404 | F370–F405 | 0 | scroll |
| Frontal approach | u405–479 | F406–F480 | 0 | scroll |
| Physical threshold | u480–499 | F481–F500 | 0 | scroll |
| Digital breathing | u500–512 | F500 held | 0 | browser black derived from scroll |
| ENTRY reveal | u513–540 | F500 held | smoothstep(u513→u540) | semantic DOM derived from scroll |

## Family progress anchors

The table gives normalized document progress at each explicit landmark. F286 is
forced to the first integer pixel after the F285 arrival address; its theoretical
normalized value is not used at runtime.

| Landmark | Desktop | Short desktop | Portrait | Mobile landscape |
| --- | ---: | ---: | ---: | ---: |
| F46 / u45 | first positive px | first positive px | first positive px | first positive px |
| u54 | .038056 | .032792 | .036262 | .036429 |
| u226.8 | .317130 | .306208 | .296167 | .297530 |
| F285 / u284 | .395484 | .385067 | .372615 | .374330 |
| F286 / u285 | arrival + 1px | arrival + 1px | arrival + 1px | arrival + 1px |
| indicator / u291 | .405073 | .394717 | .381971 | .383729 |
| line / u299 | .416031 | .405747 | .392662 | .394470 |
| raster / u315 | .437949 | .427806 | .414046 | .415951 |
| settling / u335 | .465346 | .455379 | .440776 | .442805 |
| Q appearance / u355 | .492743 | .482952 | .467506 | .469658 |
| stable Q / u369 | .511920 | .502253 | .486217 | .488455 |
| approach / u405 | .640396 | .631556 | .611566 | .614381 |
| late approach / u421.2 | .691074 | .684481 | .665562 | .667706 |
| threshold / u480 | .835542 | .834058 | .827041 | .827180 |
| digital black / u500 | .884681 | .884934 | .881966 | .881423 |
| ENTRY / u513 | .922159 | .922331 | .920328 | .919961 |
| settled / u540 | 1 | 1 | 1 | 1 |

## Native input, reverse, and fast scroll

- The controller listens only to passive `scroll`, resize, lifecycle, media, and
  accessibility events.
- It never listens for wheel, touchmove, pointermove, or keyboard gestures.
- It never calls `preventDefault`, `scrollTo`, `scrollBy`, or writes `scrollTop`.
- Every update derives one coordinate from the latest native `window.scrollY`.
- Forward and reverse use the same function. Direction is not stored.
- A new position replaces an in-flight seek. When an older seek completes, the
  `seeked` handler immediately yields to the newest requested frame.
- Stopping at arrival, line, raster, Q, approach, or any other address leaves the
  decoder paused on that address indefinitely.
- A fast jump seeks the final mapped target and never starts catch-up playback.

## Failure and accessibility continuity

- Reduced motion is rejected before the manifest or video request; semantic flow
  is immediately available with zero video.
- Without JavaScript, the decorative video has no source and static semantic
  content remains available.
- Once enhanced runway geometry has committed, a late media/load/decode/seek
  failure preserves that geometry and derives black, ENTRY, chrome, and settled
  interaction from document position.
- Supporting routes retain zero cinematic media, zero cinematic runway, and
  immediate semantic availability.

## Production-media boundary

No Blender file, rendered frame, camera, cable, phosphor material, Q asset,
poster, or H.264 payload changes in Phase 5A. The existing one-request, one-Blob,
one-decoder H.264 architecture remains authoritative.
