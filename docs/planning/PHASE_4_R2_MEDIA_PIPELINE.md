# Phase 4-R2 media production authority

`scripts/phase4r2-media.mjs` is the fail-closed boundary between the external
16-bit Cycles masters and the nine selected, tracked delivery assets. It never
renders Blender frames and never permits F501-F540 media.

## Gates

1. `audit-masters --family all` requires exactly 500 receipt-bound, fully
   decodable 16-bit RGB PNGs for every camera family. It recreates each stable
   manifest twice and requires byte-identical results, then independently
   decodes and probes the sequence with the pinned FFmpeg toolchain.
2. Encoding requires an external master visual verdict in which the pilot,
   temporal ranges and final visual sample explicitly pass. No pending verdict
   is interpreted as approval. Its exact bytes are preserved externally and
   hash-bound through the quality report, selection and final staging audit.
3. `encode-ladder` first proves deterministic VP9 and H.264 output from the
   same F360-F390 critical sample, then creates the 3-quality x 2-codec ladder
   for one family. Every candidate is decoded, probed, seek-tested, checked for
   exact 12-frame GOP cadence, size-classified, and measured against the 16-bit
   sequence in display-referred `gbrp16le`. A structurally valid rung at or
   above 25 MiB remains external `SIZE_REJECTED` evidence; it does not abort the
   ladder and can never be selected or staged. Crash recovery adopts only a
   unique completed output bound to a successful exact argv receipt; ambiguous
   or incomplete orphan output is quarantined and the command stops.
4. `select` requires an external visual verdict for banding, exact Q, graphite
   current, wall shadows, portal black and overall quality. It selects the
   smallest deploy-eligible (`<25 MiB`) machine-valid visual PASS for each
   family/codec. The exact 18-candidate verdict is preserved externally and
   hash-bound into selection and staging.
5. `posters` derives one hash-named PNG per family from exact F1 through the
   delivery color/chroma round trip and validates it against F1 and both
   selected decoded first frames.
6. `stage-selected` copies only the six selected videos, three posters and
   path-free authority reports/manifests (including all three byte-determinism
   reports) into
   `artifacts/original/phase-4r2-final-cinematic-production/`. Existing or
   unexpected tracked payloads cause a stop; the tool does not delete them.
   Before copying, it freshly audits all masters, revalidates and decodes every
   selected video, independently reproduces selected-video and poster metrics,
   and rechecks both preserved visual-verdict authorities.

Each family currently declares its native authored delivery cohort explicitly:
1920x1200 desktop, 780x1688 portrait, and 1688x780 landscape. A native cohort
that cannot supply one deploy-eligible visual PASS per codec fails closed. It
is never silently resampled; any future lower-resolution cohort must be added
as a separately named, fully reported authority decision.

Raw frames, receipts, logs, all 18 candidate working files, metric logs,
decoded checks, rejected outputs and editable verdict inputs remain under the
durable external production root. Only the exact vetted, path-free verdict
authorities are copied with the selected production reports. A global
production lock plus an atomic family lock prevent renderer/encoder overlap.
Phase 5 and merging to `main` remain denied.
