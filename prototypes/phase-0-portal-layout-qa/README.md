# Phase 0.2 portal and typography QA harness

This is a committed, non-public review compositor. It is not an Astro route, public launch surface, production cinematic integration, or Phase 1 implementation.

## Run

From the repository root:

```text
npm run prototype
```

Open:

```text
http://127.0.0.1:4173/prototypes/phase-0-portal-layout-qa/
```

If a different local `PORT` is supplied, retain the same path and update the capture plan's local base URL for that evidence run only.

## Shared authority

The portal surface fetches:

```text
/artifacts/original/phase-0-3d-repair-v2/portal-layout.json
```

The physical screen, semantic DOM reference, and alignment overlay must use the same file. The portal H1 is read from that JSON and is not duplicated in the application source. The separate hero-composition state uses the approved public hero copy and cannot overwrite the portal contract.

The live portal compositor always places its semantic DOM over the text-free `physical-glass-base.png`, including exact 16:10 alignment cases. The text-bearing `physical-layout.png`, semantic `dom-layout.png` and overlay are separate crossover evidence; loading the text-bearing raster behind the live DOM is prohibited because it visibly doubles copy.

## Deterministic states

Query parameters:

```text
surface=hero|portal
fixture=actual|long
zoom=100|200
motion=no-preference|reduce
chrome=0|1
```

Examples:

```text
?surface=hero&fixture=actual&zoom=100&motion=no-preference&chrome=0
?surface=portal&fixture=actual&zoom=100&motion=no-preference&chrome=0
?surface=hero&fixture=long&zoom=100&motion=no-preference&chrome=0
?surface=portal&fixture=actual&zoom=200&motion=reduce&chrome=0
```

The exact viewport and state matrix is in `capture-plan.json`.

## Browser API

The official matrix uses `runner.html` because it creates a same-origin iframe at the exact requested CSS-pixel viewport, independent of the outer browser window. Add `vw`, `vh` and the capture plan's explicit `captureScale` to the normal state query:

```text
runner.html?vw=390&vh=844&captureScale=1&surface=hero&fixture=actual&zoom=100&motion=no-preference&chrome=0
```

The iframe always remains at the requested CSS viewport. The evidence-only outer `#capture-viewport` is rendered at scale 1 through 1200px wide; wider cases use the exact `1200 / requested width` scale serialized in `capture-plan.json`. This keeps the visible evidence inside the in-app browser's reliable raster region without changing media queries, DOM layout, measurements or the child report.

Wait for:

```js
await window.phase02RunnerReady
```

Read `window.phase02RunnerReport`. Its `report` property is the child typography report, and `viewportMatch` proves the iframe used the requested CSS dimensions. `captureScale`, `captureRenderedBounds` and `captureBoundsMatch` record the separate outer evidence geometry. The runner records the browser's actual DPR without claiming control. The in-app browser's available screenshot path produces a full-page JPEG and does not expose element screenshots. Preserve that raw JPEG and its actual raster dimensions, then crop the recorded outer-frame raster bounds from top-left `0,0`. Scale-1 crops are written to PNG without resampling; scaled wide crops are restored to the requested viewport dimensions with Lanczos. The raw raster is not asserted to equal CSS dimensions multiplied by DPR.

For direct harness debugging, the child page also exposes the following API.

Wait for the contract, scene and first audit:

```js
await window.phase02Ready
```

Request a fresh two-frame-stabilized measurement:

```js
await window.runPhase02TypographyCheck()
```

The latest report is also available at:

```js
window.phase02TypographyReport
```

Expected report schema:

```text
quantum-hub.phase-0-3d-repair-v2.typography-collision-browser-report.v1
```

The report's top-level `pass` is true only when copy, line-count, collision, overflow, button-size, glyph-rule clearance, anchor, focus, reduced-motion, semantic, and scene-loading checks all pass.

After the raw full-page JPEGs and browser matrix records exist, create and bind the exact review crops with the evidence-only normalizer:

```text
python scripts/normalize-phase02-captures.py
```

This local evidence command requires Pillow and writes no application dependency. It performs no resize for scale-1 cases and uses Lanczos only for the three widths above 1200px. It updates each required matrix case with the explicit capture scale, rendered crop, resampling state, raw and normalized dimensions, byte counts, hashes, actual DPR metadata, and source lineage.

For the two visible-focus captures, focus the selector listed in `capture-plan.json` after `phase02Ready`, then capture without rerunning the focus loop. Capture chrome stays off, so the QA toolbar cannot obscure the focused hero or portal surface.

## Boundaries

- No preferred font is claimed or loaded. The harness forces documented system fallbacks.
- No `@font-face`, remote font, video, canvas, frame sequence, wheel handler, scroll cancellation, nested horizontal scroller, or hidden overflow is used.
- The 25%-longer fixture is clearly non-public stress data.
- Reduced motion uses the dormant still and instantiates no cinematic asset.
- Screenshots and browser reports are original evidence and belong under `artifacts/evidence/phase-0-3d-repair-v2/`.
