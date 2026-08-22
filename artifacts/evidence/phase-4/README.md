# Phase 4 — full cinematic integration evidence

This directory is the compact tracked evidence set for the Phase 4 production integration on `feature/phase-4-full-cinematic-integration`.

- `phase-4-integration-summary.json` records production geometry, mapping, media hashes, bundle measurements, QA results, and explicit execution limits.
- `phase-4-browser-report.json` is the exhaustive machine report: nine reference viewports, native scroll/reverse, reload and lifecycle matrices, warm/throttled delivery, fail-open cases, accessibility, METHOD/deep-page integrity, and supporting-route isolation.
- `phase-4-desktop-production-contact-sheet.png` shows the required 17-state continuum from dormancy through CONVERSION.
- `phase-4-portal-takeover-contact-sheet.png` shows the accepted F250–F270 takeover window.
- `phase-4-physical-dom-alignment-sheet.png` compares the late physical crossover, accepted F270 projection, and live semantic geometry; maximum measured delta is 0.005 CSS px.

Final production implementation commit: `0246932f6c3482cab30a8b4c6cbb7cdb9443def2` (initial integration: `39031c0690e82a2168ce0e6aa365f6c33ac5ecc9`). The controller fetches exactly one selected immutable encode and exposes it to the single paused decoder through a lifecycle-managed Blob URL. This preserves deterministic seeking on Cloudflare Pages, whose static asset delivery returns full `200` bodies rather than byte-range `206` responses.

The raw captures, four browser recordings, responsive/static/zoom sheets, network-transfer report, and transfer ZIP are intentionally external to Git. They must be regenerated from the clean deployed SHA with `scripts/package-phase4-human-review.mjs` before handoff.

This evidence does not select a human gate and does not authorize Phase 5. Physical trackpad/hardware momentum, Safari/WebKit, Firefox/Gecko, persisted BFCache restoration, and native browser-UI zoom remain explicitly unexecuted or unavailable; the report contains the exact tested substitutes and boundaries.
