# Phase 0 browser QA

Audit date: 2026-08-17

Runtime: Codex in-app Chromium browser
Targets: built Astro root at a local static preview and the isolated Spiral Conduction feasibility harness

## Static root

The built `dist/` root was served locally after `npm run build`.

| Check | Result |
| --- | --- |
| Status/content | Working `/`; title `Quantum‑Hub — Phase 0 feasibility` |
| Semantics | One `main`, one `h1`, labelled header and sections |
| Public actions | One skip link; audience labels are non-link text because later routes do not exist |
| Forms | 0 |
| External/client script elements | 0 |
| Horizontal overflow at 1440×900 | None; scroll width equals client width |
| Horizontal overflow at 390×844 | None; scroll width equals client width |
| Focus | Skip link resolves to solid `#f06ba0`, 2px outline with 4px offset and a 44.7px-high visible target |
| Server markers | No Worker/server entry marker observed |

Dark V2 contrast calculations against the `#0e1112` page base are: white heading 18.96:1, `#c2cbcb` body 11.47:1, `#8a9797` muted text 6.28:1, and `#f06ba0` focus/current color 6.61:1. These exceed WCAG AA text thresholds for their implemented uses.

Evidence:

- `static-root-1440x900.png`
- `static-root-focus-1440x900.png`
- `static-root-390x844.png`

## Harness viewport matrix

Every viewport was checked at dormant progress `0.00`. The browser reserves 15px for its vertical scrollbar, so the client width is 15px below the requested width. In every row, document scroll width equals client width, the hero heading remains horizontally in bounds, the action targets meet at least 44px height, and zero nested vertical scrollers were detected.

| Requested viewport | Authored mode | Client/scroll width | Action height | Nested scrollers | Result |
| --- | --- | --- | ---: | ---: | --- |
| 1440×900 | desktop | 1425 / 1425 | 46.4px | 0 | Pass |
| 1280×800 | desktop | 1265 / 1265 | 46.4px | 0 | Pass |
| 1024×768 | desktop/tablet | 1009 / 1009 | 46.4px | 0 | Pass |
| 768×1024 | desktop/tablet | 753 / 753 | 46.4px | 0 | Pass |
| 390×844 | independent mobile | 375 / 375 | 44px | 0 | Pass |
| 360×800 | independent mobile | 345 / 345 | 44px | 0 | Pass |
| 1366×650 | short desktop | 1351 / 1351 | 46.4px | 0 | Pass |

## Deterministic state and reverse

Native document scrolling produced these observed states:

| Pass | Document position | Progress | Conduction | Camera | Device | Portal | Surface |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Forward | 2,100px | 0.686 | 0.933 | 0.958 | 0.000 | 0.000 | 0.000 |
| Reverse | 1,050px | 0.343 | 0.303 | 0.223 | 0.000 | 0.000 | 0.000 |
| Forward to portal | 3,050px | 0.997 | 1.000 | 1.000 | 1.000 | 1.000 | 0.991 |
| Reverse to arrival | 0px | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |

No wheel handler, wheel cancellation, scroll lock, URL threshold mutation, timer-owned reveal, or nested page scroller is present. The state values are recomputed from absolute document progress.

## Reduced motion

At both 1600×1000 and 720×1600:

- `data-reduced="true"`;
- animated scene SVG count: 0;
- video count: 0;
- static picture count: 1;
- progress, conduction, device, portal, and surface state: 0;
- nested scrollers: 0;
- horizontal overflow: 0.

Evidence:

- `harness-reduced-desktop-1600x1000.png`
- `harness-reduced-mobile-720x1600.png`

## Scroll-controller timing

Debug-only instrumentation measured the synchronous renderer body during deliberate rapid direction changes. It does not include browser paint/compositing and is therefore controller timing, not an end-to-end frame metric.

| Mode | Samples | Last observed | Observed p95 |
| --- | ---: | ---: | ---: |
| Desktop 1440×900 | 9 | 0.200ms | 0.400ms |
| Mobile 390×844 | 9 | 0.100ms | 0.300ms |

No long-task or Core Web Vitals claim is made from this small local sample. Later production hardening still requires real-device and deployed measurements.

## Visual evidence index

- `harness-dormant-1440x900.png`
- `harness-mid-conduction-1440x900.png`
- `harness-activation-1440x900.png`
- `harness-portal-1440x900.png`
- `harness-operating-surface-1440x900.png`
- `harness-mobile-dormant-390x844.png`
- `harness-mobile-mid-390x844.png`
- `harness-mobile-portal-360x800.png`
- `keyboard-focus-1440x900.png`

These captures are original Quantum implementation evidence. Third-party reference screenshots remain private and uncommitted.
