# Phase 0 Spiral Conduction feasibility harness

This is an isolated, non-production review harness. It is intentionally not an Astro route and must not be copied into the launch application unchanged.

## Run locally

From the repository root, use the repository's Phase 0 static-server command:

```text
npm run prototype
```

Then visit:

```text
http://127.0.0.1:4173/prototypes/phase-0-spiral-field/
```

The command serves the repository root, so the harness can load the committed poster sources under `artifacts/original/phase-0/`. No package installation beyond the repository lockfile is needed. Opening `index.html` directly also works in current browsers, although the documented local HTTP origin is preferred for consistent asset loading and capture.

The separate browser-media capability and seek probe is available at:

```text
http://127.0.0.1:4173/prototypes/phase-0-spiral-field/media-spike.html
```

That probe records actual browser capabilities honestly. It must not be described as encoded-media evidence unless a real supported recording is produced and subsequently tested.

## Deterministic review controls

The harness is driven by native document scroll. It never cancels wheel or touch input and contains no nested page scroller.

- `?progress=0` through `?progress=1` fixes the visual state for evidence capture.
- `?layout=mobile` forces the separately authored 720×1600 mobile composition.
- `?mode=reduced` loads only the static reduced-motion poster path.
- `?debug=1` exposes exact normalized progress and lifecycle values.

The fixed evidence milestones are `0`, `.12`, `.25`, `.40`, `.55`, `.70`, `.82`, `.92`, and `1`.

## Progress mapping

| Progress | Directly computed visual state |
|---:|---|
| `0.00–0.08` | Dormant graphite cable, powered-off Field Unit, inactive interface |
| `0.08–0.16` | One conduction front enters at the outer terminus |
| `0.16–0.68` | Cumulative outer-to-inner conduction and controlled camera/parallax change |
| `0.68–0.76` | Near-frontal alignment and final inner turn |
| `0.76–0.80` | Current reaches the physical connector |
| `0.80–0.87` | Restrained Field Unit power-on |
| `0.84–0.91` | Sparse interface wake |
| `0.89–0.97` | Q-derived portal expansion and matched native-surface overlap |
| `0.97–1.00` | Native semantic operating surface owns the viewport |

Every value is derived from the current absolute progress on each animation frame. Reverse scrolling therefore retracts the portal, powers down the unit, and removes the cumulative conduction without a queued reverse animation.

For deterministic tests, the same normalized values are exposed on `<body>` as `data-progress`, `data-conduction`, `data-camera`, `data-connector`, `data-device-power`, `data-screen-wake`, `data-portal`, and `data-surface`. Reduced motion exposes `data-reduced="true"` and does not add the animated scene SVG.

## Composition decisions

- Desktop uses the recommended 2.5-turn Archimedean spiral. It preserves readable turn spacing, provides a long conduction beat, and leaves a useful hero-copy safe area.
- Mobile is independently authored at a 720×1600 viewBox with 2.25 turns, a larger Field Unit, a bottom-edge terminus, fewer depth layers, and a shorter scroll range.
- The Field Unit is an original low industrial instrument built around an offset Q-yoke, grounded plinth, left-side connector, and inset operating surface. It is not a laptop or stock product.
- Reduced motion never constructs the animated SVG scene. It injects the appropriate dormant poster as an ordinary image and exposes the semantic page immediately.

## Scope boundary

This package demonstrates interaction and visual feasibility only. It has no public routes, production media, framework dependency, analytics, forms, metrics, partner descriptions, testimonials, or deployment logic.
