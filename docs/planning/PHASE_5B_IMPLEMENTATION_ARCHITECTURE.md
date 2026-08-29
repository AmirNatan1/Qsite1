# Phase 5B implementation architecture

Status: authorized production implementation on `feature/phase-5b-supporting-route-production`.

Accepted parent: `b6a9d4f6e05412dfd460a657edfd8be4ce7eef2c`.

Frozen production main: `501040c42bba30b9d9517b88a8f9857992a2dba4`.

## Boundary

The nine public routes remain nine authored Astro documents. No component receives route data to choose an overture, chapter sequence, geometry, or ending. Shared code is limited to semantic atoms, accessibility behavior, tokens, measurements, and bounded enhancement utilities.

## Production ownership

| Route | Page-owned composition | Route CSS | Controller | Mode |
| --- | --- | --- | --- | --- |
| For industry | pressure system / four acts | `industry.css` | `industry-progress.ts` | C |
| For startups | conditional corridor / four acts | `startups.css` | `startup-channels.ts` | C |
| Industries | threshold + four territories + coda | `industries.css` | `industries-territories.ts` | C |
| Proof | archive threshold + one record | `proof-production.css` | bounded observer only | B |
| Maradin | six documentary acts | `maradin.css` | still-first media initiation + bounded observer | B |
| SPARK | runway + sealed gate + release | `spark-production.css` | bounded observer only | B |
| About | worlds + interlock + position | `about.css` | bounded observer only | B |
| Contact | one intent field | `contact.css` | none | A |
| 404 | one misregistered recovery field | `404-production.css` | none | A |

Controllers are imported only by the page that needs them. Contact and 404 deliberately load no route controller. Supporting routes never import the homepage cinematic controller or Phase 4 media manifest.

## Shared primitives

- `RouteKicker.astro`: semantic route label only.
- `RouteLink.astro`: ordinary native anchor with a consistent focus-safe affordance.
- `EditorialFigure.astro`: governed image, orientation-aware display dimensions, and caption semantics without modifying source bytes.
- `BoundedReveal.astro` + `bounded-reveal.ts`: optional one-shot observer state; route CSS owns the actual visual behavior.
- `production-foundations.css`: captions, links, and type primitives only. It defines no route shell, content measure, overture, chapter, grid, ending, or motion composition.

Shared header/footer infrastructure remains in `BaseLayout.astro`. The shared footer appears only after each route completes its route-specific ending.

## Prohibited convergence

- no `SupportingRoute.astro`;
- no route JSON driving production DOM;
- no universal hero or metadata strip;
- no universal text/visual split;
- no shared chapter wrapper that fixes order or spacing;
- no shared outgoing statement;
- no sticky, scroll-lock, horizontal-scroll, snap, or wheel interception;
- no controller registry shipped to every route.

The QA-only route contract records paths, budgets, act counts, and expected modes. It cannot render public markup.

## Checkpoint rule

Each implementation batch must pass a direct rendered comparison against the accepted Phase 5A-R storyboard before the next batch begins. A machine pass does not authorize material creative deviation. Phase 6 remains unauthorized.
