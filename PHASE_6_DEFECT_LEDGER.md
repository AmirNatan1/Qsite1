# Phase 6 defect ledger

Status: open ledger; baseline observations are bound to accepted Phase 5B-R2 SHA `005a36860ecbfd6fedb3d3f2223f168c1edfbb05`.

Severity describes user impact, not implementation size. A suspected cross-engine difference is not treated as a defect without a reproducible violation of an accepted contract.

## Verified defects

### P6-001 — Home controller-module failure can trap the document

- Route/state: fresh `/`, enhancement eligible, outer Home entry module blocked after HTML.
- Engine/viewport: Chromium 151, 1440×900.
- Reproduction: abort `/_astro/index.astro_astro_type_script_index_0_lang.*.js`; wait after DOMContentLoaded.
- Expected: semantic content and navigation fail open without an enhanced runway trap.
- Observed: `data-cinematic-mode="candidate"`, header and `#entry` remained inert, and the shell measured 8,105 px against a 900 px viewport. The only recovery code lived in the module that did not execute.
- Severity: high.
- Evidence: external baseline controller-block run; source `src/pages/index.astro` bootstrap/inert/module sequence.
- Probable cause: prepaint concealment has no inline liveness watchdog.
- Production repair justified: yes.
- Final resolution: pending implementation and before/after verification.

### P6-002 — Failed `/#entry` media keeps reverse traversal hidden

- Route/state: fresh `/#entry`; cinematic MP4 aborted; native reverse wheel to top.
- Engine/viewport: Chromium 151, 1440×900.
- Reproduction: block `**/*.mp4`, open `/#entry`, await failure, wheel natively to scrollY 0.
- Expected: no F1 flash on arrival, then a coherent poster is visible when the user deliberately reverses.
- Observed: `data-cinematic-entry-intent="pending"` survived failure; at scrollY 0 the physical phase was active but the stage computed `visibility:hidden`.
- Severity: high.
- Evidence: external baseline entry-media-failure run.
- Probable cause: entry-intent release requires `mediaReady` even after terminal media failure.
- Production repair justified: yes.
- Final resolution: pending implementation and before/after verification.

### P6-003 — Immediate top-of-page media failure retains an avoidable runway

- Route/state: fresh bare `/`, exact top, MP4 blocked before interaction.
- Engine/viewport: Chromium 151, 1440×900.
- Reproduction: abort the selected MP4 on initial load and remain at scrollY 0.
- Expected: compact static fallback when no document progress/restoration can be displaced.
- Observed: enhancement was already considered committed, so the shell retained roughly nine viewport heights with a frozen poster.
- Severity: medium.
- Evidence: external baseline blocked-media state plus source failure-disposition audit.
- Probable cause: failure disposition distinguishes only pre/post enhancement, not safe exact-top collapse from unsafe mid-document collapse.
- Production repair justified: yes, narrowly at exact top with no semantic-entry intent.
- Final resolution: pending implementation and before/after verification.

### P6-004 — Maradin pagehide cleanup is consumed after one persisted cycle

- Route/state: Maradin video initiation → synthetic persisted pagehide/pageshow → re-initiation → second persisted pagehide.
- Engine/viewport: Chromium 151, 1440×900.
- Expected: each departure releases every video source and decoder.
- Observed: first pagehide cleared `src`; second pagehide left the player `active`, `tabIndex=0`, launch hidden and the MP4 `src` present.
- Severity: high.
- Evidence: external baseline lifecycle run with `defectReproduced=true`.
- Probable cause: `pagehide` was registered with `{ once: true }` and never re-armed.
- Production repair justified: yes.
- Final resolution: pending implementation and repeated-cycle verification.

### P6-005 — Maradin media failure leaves an active dead control

- Route/state: Maradin first video initiation with MP4 request aborted.
- Engine/viewport: Chromium 151, 1440×900.
- Expected: release media state, show the poster/retry launch and retain no decoder/source.
- Observed: media error code 4 / `readyState=0`; player stayed `active`, `src` remained, launch stayed hidden and the video remained keyboard-focusable.
- Severity: medium.
- Evidence: external baseline failed-video run with `defectReproduced=true`.
- Probable cause: no video error lifecycle and swallowed `play()` rejection.
- Production repair justified: yes; hidden-tab release is part of the same bounded lifecycle.
- Final resolution: pending implementation and failure/visibility verification.

### P6-006 — Square viewport selects different poster and video families

- Route/state: fresh Home at exactly 800×800.
- Engine/viewport: Chromium 151, 800×800.
- Expected: responsive poster and cinematic video use one coherent family.
- Observed: `<picture>` requested `phase-4r2-portrait-poster-*`, while bootstrap/controller selected the desktop cohort.
- Severity: medium.
- Evidence: external baseline request/state run.
- Probable cause: CSS portrait orientation includes square while JavaScript required `height > width`.
- Production repair justified: yes; align the boundary without changing authored assets.
- Final resolution: pending implementation and request verification.

### P6-007 — Fractional positive scroll can remain F1

- Route/state: Home physical opening under fractional CSS-pixel scroll input (zoom/high-resolution input condition).
- Engine/viewport: engine-independent source mapping; physical-device confirmation pending.
- Expected: exact zero is F1; every positive offset visibly enters F46+.
- Observed: both mapping and runtime offset use `Math.round`, so `0 < offset < 0.5` becomes zero.
- Severity: medium.
- Evidence: source arithmetic and focused pure-test target.
- Probable cause: integer-offset normalization preserved zero after positive fractional input.
- Production repair justified: yes; preserve exact zero only and clamp positive input to at least one authored offset.
- Final resolution: pending implementation, pure regression test and human trackpad confirmation.

### P6-008 — Logo fallback ratio is incorrect

- Route/state: shared header/footer before SVG intrinsic metadata settles.
- Engine/viewport: all; strongest risk on constrained/font/media startup.
- Expected: HTML width/height reserve the final SVG aspect ratio.
- Observed: markup declares 222×72 while the SVG viewBox is 242×181.98. Supporting-route load CLS reached 0.082353, although the trace does not establish the logo as the sole cause.
- Severity: medium.
- Evidence: source/intrinsic metadata mismatch; CLS is supporting context only.
- Probable cause: legacy dimensions survived a taller accepted logo.
- Production repair justified: yes; ratio-only metadata correction preserves final design.
- Final resolution: pending implementation and CLS/layout regression.

### P6-009 — Footer and 404 Home intent bypasses the manifesto

- Route/state: intentional Home activation from footer or real 404.
- Engine/viewport: all.
- Expected: deliberate Home UI targets `/#entry`; bare `/` remains only fresh direct entry.
- Observed: shared footer and 404 recovery link use `/`.
- Severity: medium.
- Evidence: source href inspection against the accepted navigation contract.
- Probable cause: Phase 5B-R2 repaired header Home surfaces but not these two intentional Home affordances.
- Production repair justified: yes.
- Final resolution: pending implementation and cross-route navigation verification.

## Investigated issues not currently classified as production defects

### P6-I01 — Playwright WebKit H.264 failure

- Observation: WebKit 26.5 reports `canPlayType(...)=probably` but both direct and Blob H.264 fail with media error code 4 on this Windows host.
- Site result: the media surface is released; the governed poster and native document progression remain coherent.
- Decision: no engine sniffing or design flattening. Record as a local Playwright codec limitation and retain physical Safari review.

### P6-I02 — Persistent BFCache not observed

- Observation: Chromium and WebKit returned through a `back_forward` navigation, but `pageshow.persisted` was not observed locally.
- Decision: not a site defect. Exercise synthetic persisted lifecycles and normal restoration; require deployed/manual confirmation.

### P6-I03 — Maradin decorative background stills

- Observation: initial Maradin load requested the governed poster plus both governed stills; CSS decorative backgrounds reference URLs also used by lazy `<img>` elements.
- Decision: no production change yet. URLs are governed and cache-deduplicated, the existing route budget passes, and changing the accepted documentary composition without isolated initiator/visual evidence is not justified.

### P6-I04 — Resize geometry reads

- Observation: some resize handlers measure synchronously rather than marking all measurement dirty for the next RAF.
- Result: zero scroll-window long tasks, no repeated forced-layout evidence and no resize hitch was reproduced.
- Decision: no production change required unless trace evidence establishes thrash.

### P6-I05 — About reduced/no-JS transforms

- Observation: its compact stylesheet broadly resolves descendant transforms in static modes.
- Result: all 13 responsive and static-variant cases passed with complete content and no clipping.
- Decision: do not reopen the accepted Dark V2 design without a reproduced visual defect.

### P6-I06 — Dormant poster optimization

- Observation: lossless WebP saves 11.8–13.5% per poster but approximately doubles local proxy decode medians; lossless AVIF is slower and lossy candidates alter dark gradients/edges.
- Decision: `NO PRODUCTION POSTER CHANGE — CURRENT AUTHORITY RETAINED`. See `PHASE_6_POSTER_STUDY.md`.

