# Phase 0.3 portal and typography QA harness

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

The frozen Phase 0.2 matrix plan remains in `capture-plan.json`. The additive Phase 0.3 plan is `capture-plan-v3.json` and expands to the same 46 deterministic cases with whole-word and reduced-motion quiet-composition gates. Its scene ledger is frozen and provenance-released; capture is authorized only while its exact paths, dimensions, byte counts and SHA-256 values continue to match.

## Browser API

The official matrix uses `runner.html` because it creates a same-origin iframe at the exact requested CSS-pixel viewport, independent of the outer browser window. Add `vw`, `vh` and the capture plan's explicit `captureScale` to the normal state query:

```text
runner.html?vw=390&vh=844&captureScale=1&surface=hero&fixture=actual&zoom=100&motion=no-preference&chrome=0
```

The iframe always remains at the requested CSS viewport. The evidence-only outer `#capture-viewport` is rendered at scale 1 through 1200px wide; wider cases use the exact `1200 / requested width` scale serialized in `capture-plan.json`. This keeps the visible evidence inside the in-app browser's reliable raster region without changing media queries, DOM layout, measurements or the child report.

Wait for:

```js
await window.phase03RunnerReady
```

Read `window.phase03RunnerReport`. Its `report` property is the child typography report, and `viewportMatch` proves the iframe used the requested CSS dimensions. `captureScale`, `captureRenderedBounds` and `captureBoundsMatch` record the separate outer evidence geometry. The runner records the browser's actual DPR without claiming control. The in-app browser's available screenshot path produces a full-page JPEG and does not expose element screenshots. Preserve that raw JPEG and its actual raster dimensions, then crop the recorded outer-frame bounds from top-left `0,0`. Scale-1 crops are written to PNG without resampling; scaled wide crops are restored to the requested viewport dimensions with Lanczos. The raw raster is not asserted to equal CSS dimensions multiplied by DPR. Phase 0.2 globals remain aliases for historical tooling only.

For direct harness debugging, the child page also exposes the following API.

Wait for the contract, scene and first audit:

```js
await window.phase03Ready
```

Request a fresh two-frame-stabilized measurement:

```js
await window.runPhase03TypographyCheck()
```

The latest report is also available at:

```js
window.phase03TypographyReport
```

Expected report schema:

```text
quantum-hub.phase-0-3d-repair-v3.typography-collision-browser-report.v1
```

The report's top-level `pass` is true only when copy, line-count, whole-word integrity, human line-break instrumentation, collision, overflow, button-size, glyph-rule clearance, anchor, focus, reduced-motion quiet composition, semantic, and scene-loading checks all pass. `copy.wordFragmentationOffenders` must equal `0`.

At the narrow breakpoint, 200% portal text keeps the mobile display size exactly doubled and reflows the five-stage carrier into one content-driven document column. This preserves whole words and label legibility without clipping, a nested scroller, or a typography reduction.

The audit focus loop is measurement-only. After checking every audience control it restores the pre-audit active element or blurs to a neutral state. `runner.html` records `focusState` and passes a neutral case only when no review control remains active; an explicit focus case passes only when `activeReviewControlId` exactly matches the plan's requested selector.

## Matrix record contract

The final report path is `artifacts/evidence/phase-0-3d-repair-v3/browser-matrix-report.json` with schema:

```text
quantum-hub.phase-0-3d-repair-v3.typography-collision-matrix.v1
```

Its root records `generatedAt`, evidence method, accepted portal contract path/SHA, fallback-font mode, the expanded `cases`, bound scene sources, and the exact-byte modal `capturePolicy`. Each case records its plan ID, viewport ID, original state query, complete v3 runner report, complete v3 child report, and—only when required—the raw capture/normalized capture lineage. The modal policy records 11 attempts, an untied winner of at least 7 votes, observed minimum, weak-case count, discarded weak attempts, SHA-256 selection, and no timing claim.

Current sealed browser authority: generated `2026-08-18T10:20:47.772Z`, 1,785,125 bytes, SHA-256 `8272764a01ac18b4aed7b8b0ebffdca812a5f235e51d6c2c2ea6ae744c6ac4fc`; 46/46 runner and child reports pass and all 36 planned visual cases have normalized capture lineage. It binds plan SHA-256 `26cf9fc7088d3102b1214c6f8c0c5f1864d02d3d04c52a047b2b17b8ca7db2d5`, cache `phase03-layout-v11`, and harness SHA-256 `c306bd2b33cbc116c60e6171ebf6f1e47a29892d7d8ef57697292d379e178d65`.

The command below remains the frozen Phase 0.2 evidence normalizer and must not be pointed at Phase 0.3 evidence:

```text
python scripts/normalize-phase02-captures.py
```

The additive Phase 0.3 normalizer is:

```text
python scripts/normalize-phase03-captures.py
```

## Repository-native resumable capture

The authoritative Phase 0.3 browser capture runner is:

```text
scripts/capture-phase03-browser-matrix.mjs
```

It uses an already-installed `playwright` or `playwright-core` package and an already-installed Chrome, Edge, or Chromium executable. It does not install a dependency or change the lockfile. Resolution checks the running Node executable's adjacent package root before `NODE_PATH`; browser resolution prefers Playwright's existing managed Chromium before installed-system Chrome or Edge. Keep the prototype server running at port 4173, expose an existing package root through `NODE_PATH` only when needed, and optionally set `PHASE03_BROWSER_EXECUTABLE` or pass `--browser-executable`.

```text
npm run prototype
npm run capture:phase03 -- --targeted-stress
npm run capture:phase03 -- --batch-size 10
```

`--targeted-stress` always takes real modal screenshots for these six cases, even where the final plan normally requires only a DOM report:

- `portal-actual--short-desktop-1366x650`;
- `portal-zoom-200--short-desktop-1366x650`;
- `hero-zoom-200--short-desktop-1366x650`;
- `portal-zoom-200--narrow-320x800`;
- `portal-zoom-200--mobile-390x844`;
- `portal-zoom-200--mobile-landscape-844x390`.

Targeted JPEGs and reports remain isolated under `artifacts/evidence/phase-0-3d-repair-v3/targeted/` and never count toward matrix completion. `--case CASE_ID` runs a planned local-authority case; repeat it for a small explicit set. `--batch-size` is bounded to 1–10 and defaults to 10.

Each authority case reads the serialized JSON from `#phase03-runner-report`, writes a per-case report under `artifacts/evidence/phase-0-3d-repair-v3/reports/`, and atomically updates `capture-checkpoint.json`. For a visual case it takes 11 successive full-page JPEGs, accepts only a unique exact-byte mode with at least 7 votes, and records every weak or tied discarded round before retrying. Resume is implicit: rerun the same command and the runner validates the plan, exact six-file harness ledger/cache, report, and raw-file hashes before skipping a completed case; no `--resume` switch is required. The final matrix is not written until all 46 cases are validated as repository-native local authority.

On its first authoritative or targeted run, the runner copies the recovered browser-control checkpoint byte-for-byte into the `recovery/` evidence directory, byte-copies all 19 historical JPEGs into a deterministic `recovery/raw/` subtree, and writes a companion report binding every source/copy path, hash, byte count, and byte-identical result. Those files remain preserved but untrusted; they cannot satisfy resume or matrix completion.

If the harness authority later changes, the runner likewise byte-preserves the stale checkpoint, every referenced raw JPEG and per-case report, and any existing matrix under a deterministic harness-keyed `recovery/` subtree before beginning a fresh checkpoint. The v11 focus repair exercised this boundary: 36 raw JPEGs, 46 reports, and the prior matrix are preserved as process evidence but are not accepted by the current resume gate.

It refuses to write while `sceneFreeze.status` is not `frozen`. After normalization, use `--check` to validate the raw/normalized dimensions, hashes, byte counts, runner crop geometry and bound matrix lineage without writing.

This local evidence command requires Pillow and writes no application dependency. It performs no resize for scale-1 cases and uses Lanczos only for the three widths above 1200px. It updates each required matrix case with the explicit capture scale, rendered crop, resampling state, raw and normalized dimensions, byte counts, hashes, actual DPR metadata, and source lineage.

For the two visible-focus captures, focus the selector listed in `capture-plan-v3.json` after `phase03Ready`, then capture without rerunning the focus loop. Capture chrome stays off, so the QA toolbar cannot obscure the focused hero or portal surface.

## Boundaries

- No preferred font is claimed or loaded. The harness forces documented system fallbacks.
- No `@font-face`, remote font, video, canvas, frame sequence, wheel handler, scroll cancellation, nested horizontal scroller, or hidden overflow is used.
- The 25%-longer fixture is clearly non-public stress data.
- Reduced motion uses a dormant still plus directional full-frame scrim, instantiates no cinematic asset, and permits no large floating rounded glass panel.
- Reduced-motion hero evidence must retain the frozen v3 Aperture Station opposite the copy with its cable visible and source-projected keepouts clear; portal reduced-motion displacement is not a hero precedent.
- Mobile and reduced-mobile scenes bind the independently authored 2.25-turn cable and passing visibility evidence of approximately 2.171694 turns against the 2.15 minimum.
- Every visible H1/H2 uses normal word breaking, normal overflow wrapping, and no automatic hyphenation.
- Phase 0.3 screenshots and browser reports belong under `artifacts/evidence/phase-0-3d-repair-v3/` only after the exact v3 scene ledger is frozen.
