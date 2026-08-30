# Phase 6 defect ledger

Status: verified repair ledger complete; baseline observations are bound to accepted Phase 5B-R2 SHA `005a36860ecbfd6fedb3d3f2223f168c1edfbb05`.

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
- Final resolution: repaired with a bounded inline watchdog that remains armed through both the outer entry module and the dynamically imported cinematic controller's synchronous initialization. The final live regression covers an aborted outer module at exact top, after 3,000 px of native scroll, and at direct `/#entry`, plus an inner controller chunk stalled beyond the four-second bound. Exact-top and inner-stall cases reach compact `controller-timeout`; progressed and semantic-entry cases release into `controller-timeout-preserve-runway` without moving scroll or geometry (observed CLS `0`). All paths remove inert state, preserve usable H1/navigation, clear the watchdog, and prevent a late resolution or rejection from overwriting the terminal fallback.

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
- Final resolution: repaired by allowing terminal media failure to satisfy semantic-entry positioning and clear the pending intent. The live regression reaches scrollY `0` through native reverse wheel input, reveals the governed poster, and retains no media source/decoder.

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
- Final resolution: repaired with a safe-at-exact-top disposition that is prohibited for `#entry`, pending intent, or progressed/restored documents. The live regression observes one blocked H.264 request, static compact geometry of 1,800 px at a 900 px viewport, and no active source/decoder.

### P6-004 — Maradin pagehide cleanup is consumed after one persisted cycle

- Route/state: Maradin video initiation → synthetic persisted pagehide/pageshow → re-initiation → second persisted pagehide.
- Engine/viewport: Chromium 151, 1440×900.
- Expected: each departure releases every video source and decoder.
- Observed: first pagehide cleared `src`; second pagehide left the player `active`, `tabIndex=0`, launch hidden and the MP4 `src` present.
- Severity: high.
- Evidence: external baseline lifecycle run with `defectReproduced=true`.
- Probable cause: `pagehide` was registered with `{ once: true }` and never re-armed.
- Production repair justified: yes.
- Final resolution: repaired with a persistent pagehide handler and non-persisted-only controller abort. Two synthetic persisted pagehide/pageshow cycles each release both sources/decoders and still permit the next user initiation.

### P6-005 — Maradin media failure leaves an active dead control

- Route/state: Maradin first video initiation with MP4 request aborted.
- Engine/viewport: Chromium 151, 1440×900.
- Expected: release media state, show the poster/retry launch and retain no decoder/source.
- Observed: media error code 4 / `readyState=0`; player stayed `active`, `src` remained, launch stayed hidden and the video remained keyboard-focusable.
- Severity: medium.
- Evidence: external baseline failed-video run with `defectReproduced=true`.
- Probable cause: no video error lifecycle and swallowed `play()` rejection.
- Production repair justified: yes; hidden-tab release is part of the same bounded lifecycle.
- Final resolution: repaired with shared release handling for media error, rejected play, hidden visibility, replacement and teardown. A blocked live MP4 returns both players to retryable source-free dormancy (`readyState=0`, `tabIndex=-1`, launches visible).

### P6-006 — Square viewport selects different poster and video families

- Route/state: fresh Home at exactly 800×800.
- Engine/viewport: Chromium 151, 800×800.
- Expected: responsive poster and cinematic video use one coherent family.
- Observed: `<picture>` requested `phase-4r2-portrait-poster-*`, while bootstrap/controller selected the desktop cohort.
- Severity: medium.
- Evidence: external baseline request/state run.
- Probable cause: CSS portrait orientation includes square while JavaScript required `height > width`.
- Production repair justified: yes; align the boundary without changing authored assets.
- Final resolution: repaired by aligning JavaScript portrait selection with CSS (`height >= width`). The live 800×800 regression requests one portrait poster, one portrait H.264 asset and no VP9/WebM authority.

### P6-007 — Fractional positive scroll can remain F1

- Route/state: Home physical opening under fractional CSS-pixel scroll input (zoom/high-resolution input condition).
- Engine/viewport: engine-independent source mapping; physical-device confirmation pending.
- Expected: exact zero is F1; every positive offset visibly enters F46+.
- Observed: both mapping and runtime offset use `Math.round`, so `0 < offset < 0.5` becomes zero.
- Severity: medium.
- Evidence: source arithmetic and focused pure-test target.
- Probable cause: integer-offset normalization preserved zero after positive fractional input.
- Production repair justified: yes; preserve exact zero only and clamp positive input to at least one authored offset.
- Final resolution: repaired by preserving exact zero while clamping every positive finite offset to at least one authored pixel. Two Playwright `0.25` wheel inputs produced native `scrollY=1`, F46 and a stable paused seek at 1.5 s; physical trackpad confirmation remains pending human review.

### P6-008 — Logo fallback ratio is incorrect

- Route/state: shared header/footer before SVG intrinsic metadata settles.
- Engine/viewport: all; strongest risk on constrained/font/media startup.
- Expected: HTML width/height reserve the final SVG aspect ratio.
- Observed: markup declares 222×72 while the SVG viewBox is 242×181.98. Supporting-route load CLS reached 0.082353, although the trace does not establish the logo as the sole cause.
- Severity: medium.
- Evidence: source/intrinsic metadata mismatch; CLS is supporting context only.
- Probable cause: legacy dimensions survived a taller accepted logo.
- Production repair justified: yes; ratio-only metadata correction preserves final design.
- Final resolution: repaired by matching the SVG authority at 242×182 in both shared instances. Live DOM checks pass; final route matrices and the post-repair blocked-media CLS check are clean.

### P6-009 — Footer and 404 Home intent bypasses the manifesto

- Route/state: intentional Home activation from footer or real 404.
- Engine/viewport: all.
- Expected: deliberate Home UI targets `/#entry`; bare `/` remains only fresh direct entry.
- Observed: shared footer and 404 recovery link use `/`.
- Severity: medium.
- Evidence: source href inspection against the accepted navigation contract.
- Probable cause: Phase 5B-R2 repaired header Home surfaces but not these two intentional Home affordances.
- Production repair justified: yes.
- Final resolution: repaired so the footer brand and real-404 recovery link use `/#entry`. Live shared-DOM checks plus Chromium/WebKit/Firefox route and history matrices pass.

### P6-010 — Exact-top media fallback causes a full-viewport layout shift

- Route/state: fresh bare `/`, exact top, selected H.264 request blocked during enhancement.
- Engine/viewport: Chromium 151, 1440×900.
- Reproduction: observe Layout Shift entries, abort the selected cinematic MP4, and wait for the safe exact-top static collapse.
- Expected: a compact static fallback without catastrophic visual displacement.
- Observed: the functional P6-003 collapse changed the shell/header compensation after first paint and produced cumulative layout shift `1.0`.
- Severity: high.
- Evidence: first full Phase 6 performance/network run, exact-top blocked-media scenario.
- Probable cause: static failure removed the enhanced shell's negative header compensation and collapsed the absolute runway below one viewport.
- Production repair justified: yes; failure-only CSS can preserve the painted viewport while still removing the long runway.
- Final resolution: repaired with failure-specific shell compensation and a one-viewport runway; focused rerun measured CLS `0`.

### P6-011 — Semantic-entry keyboard focus cannot advance into audience navigation

- Route/state: Home skip-link activation to `/#entry`, then native Tab navigation.
- Engine/viewport: Chromium 151, 1440×900; cross-engine verification pending.
- Reproduction: Tab to `Skip cinematic intro`, press Enter, then press Tab after native fragment alignment.
- Expected: the focused manifesto target is followed by usable, visibly focused audience navigation.
- Observed: the fragment aligned the manifesto with the audience section still roughly `121 px` below the viewport; the entire audience section remained inert, so focus wrapped to the skip link/body instead of advancing into the next semantic choices.
- Severity: high.
- Evidence: external Phase 6 accessibility/interaction diagnostic with zero axe violations and one unsuppressed Home keyboard failure.
- Probable cause: the pure-manifesto interaction state released the focused `#entry` target but kept the immediately following audience navigation inert until further pointer/scroll input.
- Production repair justified: yes; make only the following audience section keyboard-reachable while preserving the concealed header and inert lower chapters until native scroll reaches the accepted release boundary.
- Final resolution: repaired by releasing only the immediately following audience section in the settled-manifesto interaction state. Chromium and headed Firefox complete skip activation, native Tab/Shift+Tab focus visibility, mobile-menu Escape/focus return, and history checks; Playwright WebKit link-tabbing is a declared host/engine capability limitation while its 20-route axe matrix remains clean.

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
