# Phase 2 Motion System

Status: Phase 2A choreography specification; no runtime authorization

## Five verbs

### Conduct

Attention or current travels along an existing path. Conduct never creates decorative activity; it identifies the active route through already-legible structure.

- Visual form: a short magenta segment moving along a graphite datum.
- Appropriate use: CRT handoff, ENTRY route response, METHOD selected route, final convergence.
- Avoid: endless line loops, pulsing borders, particles or fake signal readouts.

### Focus

A broad field narrows around a consequential object, boundary or piece of evidence.

- Visual form: edges move inward, a crop tightens or negative space redistributes.
- Appropriate use: BUILT WITH INDUSTRY -> METHOD, INDUSTRIES -> PROOF.
- Avoid: arbitrary zoom, blur-to-sharp reveals or scale applied to semantic type.

### Cross

A route passes a material threshold and the operating condition changes.

- Visual form: one path crosses a gate; the receiving plane has a different depth or texture.
- Appropriate use: METHOD / TEST, abstract field -> Maradin evidence.
- Avoid: wipes with no causal destination or requiring an extra wheel gesture.

### Resolve

Ambiguity becomes hierarchy, evidence or a clear next state.

- Visual form: dispersed edges align, tonal competition quiets, one outgoing route becomes clear.
- Appropriate use: METHOD / ASSESS and DECIDE, PROOF -> PROGRAMMES, final conversion.
- Avoid: implying that every resolution means procurement, deployment or success.

### Release

A completed structure opens into the next field while leaving a meaningful edge behind.

- Visual form: a boundary extends beyond its object and becomes the next chapter's horizon or route.
- Appropriate use: every chapter exit, especially METHOD -> INDUSTRIES and PROGRAMMES -> CONVERSION.
- Avoid: fade to black followed by an unrelated scene.

## Transition map

| Transition | Verbs | Causal handoff |
| --- | --- | --- |
| Physical raster -> ENTRY | Focus + Resolve | Soft 4:3 raster flattens; its lower edge becomes the semantic datum |
| ENTRY -> BUILT WITH INDUSTRY | Resolve + Release | Two trajectories settle into one institutional horizon |
| BUILT WITH INDUSTRY -> METHOD | Focus | A vast plane compresses into the calibration plate |
| METHOD -> INDUSTRIES | Resolve + Release | Ordered evidence edge lengthens into a territory seam |
| INDUSTRIES -> PROOF | Focus + Cross | The final horizon turns upright and opens to documentary evidence |
| PROOF -> PROGRAMMES | Resolve + Release | The media edge settles into one route, then forks |
| PROGRAMMES -> CONVERSION | Focus + Resolve | Two programme routes converge around the final next step |

## Native-scroll law

- The browser document is the only scroll root.
- Visual progress is a pure function of current scroll position, not a queued timeline.
- No wheel or touch event is cancelled.
- No scroll snapping, gesture gate, synthetic inertia, nested full-page scroller or actual horizontal scroller is permitted.
- Semantic sections retain intrinsic height and reading order when scripting is absent.
- Focus navigation may move the document normally and must never wait for an animation.

## Deliberately small sticky policy

Only one homepage chapter may be considered for sticky treatment in Phase 2B:

1. **METHOD, desktop only:** one bounded visual plate transforms through five normal-flow semantic anchors. The sticky visual may occupy approximately one viewport while the native section provides proportional scroll distance. Entry and exit remain visible, and progress ends exactly at the section boundary.

All other chapters remain normal document flow:

- ENTRY needs immediate agency and must not trap route links.
- BUILT WITH INDUSTRY derives force from stillness.
- INDUSTRIES suggests lateral travel through background transforms while each territory remains a vertical semantic passage.
- PROOF gets its force from documentary scale and a bounded in-flow aperture expansion, not a second sticky sequence.
- PROGRAMMES is an intentional breathing space.
- CONVERSION must be immediately reachable and stable.

Mobile and reduced-motion versions use no sticky choreography.

## State mapping

If Phase 2B is approved, each spatial chapter should use a normalized local progress value derived from its document bounds:

```text
progress = clamp((viewportReference - sectionTop) / travelDistance, 0, 1)
```

The visual state is computed directly from that value on every update. There is no secondary playhead, easing queue or catch-up animation. Transform/opacity values may interpolate inside bounded state intervals; semantic copy changes only at stable authored zones.

## Slow, ordinary and fast scroll behavior

- **Slow:** interpolation reveals material detail and spatial causality.
- **Ordinary:** state changes remain readable without requiring exact scroll positions.
- **Rapid trackpad:** the visual jumps directly to the correct current state; no delayed sequence continues after scrolling stops.
- **Very fast pass:** chapter start/end states are complete, copy is never stranded half-visible, and the user exits immediately when local progress reaches one.
- **Tab/focus navigation:** the focused semantic element is brought into view without visual obstruction.

Velocity may reduce decorative interpolation, but it must never change content, section order or destination.

## Reverse scroll

Reverse motion evaluates the same state function with decreasing progress. It does not start a separate reverse animation. Every geometry has a defined earlier state; video is never the sole carrier of the reverse narrative. If media cannot reverse cheaply, it holds an appropriate poster or deterministic frame while DOM/CSS geometry reconstructs the chapter.

## Motion restraint

- Only the active chapter may animate.
- Ambient grain is static or extremely low-frequency and never required.
- Magenta conduction is brief and local.
- Semantic typography does not distort, blur or shrink to preserve a visual effect.
- No chapter uses animation merely to announce its arrival.
- Long pauses, stable documentary images and fixed editorial compositions are deliberate states.

## Mobile choreography

- Depth becomes vertical threshold progression.
- Lateral territories become consecutive full-width fields.
- METHOD becomes five short normal-flow states around one vertical pressure column.
- PROOF uses a still or user-initiated media surface rather than a sticky expansion.
- Route meaning never depends on hover, cursor position or device tilt.

## Reduced motion

`prefers-reduced-motion: reduce` receives authored static endpoints:

- no CRT scanline or portal travel;
- no scroll scrub or sticky plate;
- no camera move, line drawing or automatic media playback;
- normal document flow with persistent semantic copy;
- approved posters/stills in composed apertures;
- instantaneous focus/hover state changes with visible outline;
- all decorative transforms fixed at their resolved positions.

## Performance envelope

| Chapter | Risk | Principal risk | Mitigation |
| --- | --- | --- | --- |
| ENTRY | Low | Excess compositing on route planes | DOM/CSS only; two transform layers maximum |
| BUILT WITH INDUSTRY | Low | Large background texture | CSS material first; one responsive approved image only if supplied |
| METHOD | Medium | Sticky progress and multiple masks | One plate, deterministic transforms, no layout reads inside update loop |
| INDUSTRIES | Medium | Too many full-viewport layers or decoded images | One active territory plus adjacent edge; responsive stills; stop offscreen work |
| PROOF | Medium | Video decode and full-bleed compositing | Poster-first; short optimized media; one clip/mask; mobile still fallback |
| PROGRAMMES | Low | Decorative line drawing | Static CSS geometry; no continuous animation |
| CONVERSION | Low | None beyond focus choreography | DOM/CSS; no runtime required |

Any effect that causes sustained paint, layout thrash, excessive decoded memory or scroll hesitation is removed rather than optimized into the experience.
