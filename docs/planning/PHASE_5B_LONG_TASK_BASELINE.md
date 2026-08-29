# Phase 5B long-task baseline

Status: baseline investigation before supporting-route runtime.

## Accepted observation

The Phase 5A-R deployed capture observed one `348 ms` Long Task entry in the enhanced homepage `360×800` initial-load context. It began at `276.70 ms` after navigation, before settled scrolling and screenshot capture. The evidence did not provide a script stack; Long Task attribution was therefore unresolved rather than assumed harmless. The frozen summary manifest reports `203 ms` while the underlying browser diagnostics report `348 ms`; Phase 5B carries the larger measured value and discloses the inconsistency.

The observation did not occur on a supporting route and predates every Phase 5B route controller.

## Attribution method

`scripts/measure-phase5b-long-task-baseline.mjs` compares the same 360×800 browser environment across:

1. a blank-document browser control;
2. the accepted static For industry page;
3. the homepage reduced-motion path, where cinematic video is not requested;
4. the enhanced homepage with the Phase 4 MP4 request blocked;
5. the fully enhanced homepage with governed Phase 4 media enabled.

Each case records buffered Long Task entries and available attribution, media requests, CLS, navigation timing, response status, and console/page/network failures. The supporting route additionally separates navigation/quiet-idle, native forward-scroll, and native reverse-scroll windows. Repeated fresh contexts separate browser startup and evidence-harness effects from application behavior. The harness refuses a Git HEAD other than the accepted Phase 5A-R SHA and writes only to a fresh output using an atomic rename.

## Result

The first reproducible CP1 run against the accepted parent build is retained outside the repository. Its diagnostic failure was the intentionally blocked video being treated as an unexpected console error. It was not overwritten.

The corrected report passed and is retained at `../phase-5b-work/baseline/accepted-phase5ar-long-task-baseline-v3.json` (22,778 bytes; SHA-256 `4578449d4c6ba432939c94f22aa0f060f8d192427a275bcca4fe68536802cb68`). It binds both expected and observed Git HEAD to `b6a9d4f6e05412dfd460a657edfd8be4ce7eef2c` and records Chrome `150.0.7871.187` in headless mode.

| Scenario | Maximum | Median maximum | Samples over 50 ms | Media requests |
| --- | ---: | ---: | ---: | ---: |
| Blank control | 0 ms | 0 ms | 0 / 3 | 0 |
| Existing For industry route, all windows | 51 ms | 0 ms | 1 / 3 | 0 |
| Homepage, reduced motion | 108 ms | 79 ms | 3 / 3 | 0 |
| Homepage, cinematic request intentionally blocked | 111 ms | 90 ms | 3 / 3 | 3 attempted and blocked |
| Homepage, enhanced | 100 ms | 88 ms | 3 / 3 | 3 |

The sole `51 ms` supporting-route entry occurred during initial navigation in one run. All six native-scroll windows—three forward and three reverse—measured `0 ms` maximum Long Task duration. The earlier `348 ms` observation was not reproduced. Initial-load tasks still occurred on the homepage when reduced motion suppressed media and when the cinematic body was blocked, so a Phase 4 video transfer is not required for the behavior. Available Long Task attribution remained `unknown/window`; this run does not claim a more specific cause.

## Production gate

- supporting-route scroll-window long tasks attributable to route code: `0 > 50 ms`;
- persistent RAF loops: zero;
- continuous layout measurement: zero;
- unexpected media decoders: zero;
- Contact and 404 route JS: zero.

The baseline is diagnostic authority, not a human performance decision. All Phase 5B performance conclusions remain pending review.
