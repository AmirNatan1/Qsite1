# Phase 5B responsive and accessibility hardening

Status: machine `PASS` for CP7. Human review remains pending.

Branch: `feature/phase-5b-supporting-route-production`.

CP7 baseline: `508d54a517b9c28ac683fb3257df3afad24b72bb`.

## Executed matrix

The production build was exercised across all nine routes at the thirteen governed viewports:

- 1440×900, 1366×650, 1280×800, 1024×768 and 768×1024;
- 390×844, 360×800 and 320×800;
- 844×390, 740×360, 800×360, 896×414 and 900×480.

The browser audit also ran desktop and portrait reduced-motion, no-JavaScript, keyboard and axe passes; an explicit 720×450 200% proxy; blocked self-hosted-font fallback; and an open mobile-navigation pass for every route.

Final automated coverage:

| Surface | Cases | Result |
| --- | ---: | --- |
| Responsive route × viewport | 117 | PASS |
| Reduced motion, no JavaScript, fallback fonts and 200% proxy | 54 | PASS |
| Keyboard walks | 18 | PASS |
| Open mobile navigation | 9 | PASS |
| axe WCAG A/AA scans | 18 | PASS |
| Serious/critical axe findings | 0 | PASS |
| All axe violations | 0 | PASS |

The final external report is `../phase-5b-work/cp7-responsive-accessibility/final/responsive-accessibility-final.json` (661,215 bytes; SHA-256 `e62b4d20b49170d729ce4dfb61e5f73f796eb55701678beeacce2ac600afe365`). It was generated with Chrome `150.0.7871.187` and is not tracked by Git.

## Repairs made

The initial audit found five genuine implementation defects. None was waived.

1. Contact's CP6 headline crossed the first viewport in three short-landscape sizes. Its compact-height composition now leaves 89.14 px clearance at 740×360 and 800×360, 117.70 px at 844×390, 134.59 px at 896×414 and 200.03 px at 900×480.
2. SPARK's desktop overture placed its H1 below the 1366×650 fold. The existing compact-height composition now includes that viewport family; the H1 and introduction resolve inside the first viewport without increasing route CSS.
3. About's skewed decorative interlock extended the 320 px document by 13 px. The mobile rails retain their skewed identity inside a narrower inset and no longer enlarge the document.
4. Maradin's visible act counters failed WCAG AA contrast. Their restrained documentary tone was retained at sufficient opacity; subsequent desktop and portrait axe scans report no violation.
5. Maradin's launch control could remain visibly styled after receiving `hidden`, and its dormant button collided with the aperture caption in compact portrait/landscape layouts. The global hidden-state guarantee now wins over component display rules, while the two compact offsets preserve separation. The dormant video still has no `src`, uses `preload="none"`, and is initiated only by the explicit control.

The shared reversible observer threshold was also reduced from 0.12 to 0.04 after a 740×360 SPARK track proved mathematically unable to intersect 12% while clipped to its unresolved state. Forward and reverse states can now cross their threshold in every short-landscape viewport without a scroll listener or persistent RAF.

## Accessibility result

- One main landmark and one H1 remain on each route.
- Heading order, IDs, `aria-labelledby` references, accessible names and skip-link targets pass.
- All visible interactive targets are at least 44×44 CSS pixels.
- Keyboard order and visible focus pass on desktop and portrait.
- The native mobile details navigation opens without overflow, exposes eight 44 px links, synchronizes `aria-expanded`, closes on Escape and restores focus.
- Contact's three fragment links move focus to the exact `tabindex="-1"` target with visible focus/target treatment and 32 px scroll margin.
- The 404 exposes a serious semantic error cue and an exact Home recovery path while returning HTTP 404.
- Reduced-motion and no-JavaScript variants keep every act visible and comprehensible.
- Blocking the three self-hosted font files does not create overflow, clipping or hidden copy.
- The 720×450 proxy retains full semantic content and route identity for all nine routes.

Machine PASS does not assign any Phase 5B human gate. All six human decisions remain pending.
