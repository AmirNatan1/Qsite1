# Phase 6-R1 validation closure

## Decision status

Phase 6-R1 is an evidence and validation repair only. It does not self-accept Phase 6, authorize Phase 7, or authorize a merge to `main`.

- Branch: `repair/phase-6-r1-validation-closure`
- Exact branch parent: `aee036740b129624c54b8f1b878229f955d187ae`
- Frozen production `main`: `501040c42bba30b9d9517b88a8f9857992a2dba4`
- Production-source changes: none
- Permitted changes used: evidence assembly, test harnesses, validation tooling, package scripts, and this report

The final branch SHA and signed deployment identity are intentionally not hard-coded here: changing this tracked report changes the commit. The post-commit external deployment verifier and final handoff bind the exact final SHA, deployment UUID, immutable preview, branch preview, local `dist`, and frozen `main`.

## Corrected evidence taxonomy

The evidence assembler preserves `PASS`, `FAIL`, `LIMITATION`, `NOT OBSERVED`, and `PENDING HUMAN REVIEW` without binary promotion. Focused counterexample tests cover the guarded false-PASS paths:

- BFCache without a real persisted restoration remains `NOT OBSERVED`.
- Hidden/visible lifecycle without a real transition remains `NOT OBSERVED`.
- A failed or limited interaction source cannot become keyboard, focus, or mobile-menu `PASS`.
- Axe-only evidence cannot satisfy keyboard, focus, mobile-menu, or browser-zoom requirements.
- The 720×450 reflow run is supplemental proxy evidence only.
- Genuine 200% requires one human recording with all ten exact routes and all ten checks per route.
- Physical-device PASS requires all four exact recordings, SHA-256 and byte-size binding, exact per-recording review checks, a timestamp or frame reference bound to every failed check, and artifact/ledger status agreement.
- Accessibility interaction PASS requires the complete ten-route keyboard matrix, the complete four-cycle mobile-menu result, and the completed history result; one successful record is not complete coverage.
- Human and machine hidden/visible observations are combined with observed failures taking precedence.
- The R1 Chromium/Firefox motion reports and persistent-lifecycle report use explicit schema-bound roles rather than unconstrained supplemental labels.

A fresh external corrected assembly of the accepted Phase 6 source contains 60 entries, including the real 720×450 proxy. Its assembly-inventory SHA-256 is `3c67f7294b7b2e57fc9a722ee9af94c86499960234c2402e108152f73b2440e5`. The corrected guarded outcomes are:

| Requirement | Status |
| --- | --- |
| BFCache persisted restoration | `NOT OBSERVED` |
| Hidden/visible lifecycle | `NOT OBSERVED` |
| WebKit keyboard, focus, and mobile menu | `LIMITATION` |
| Genuine browser 200% | `PENDING HUMAN REVIEW` |
| Physical iPhone Safari | `PENDING HUMAN REVIEW` |
| Physical mouse or trackpad | `PENDING HUMAN REVIEW` |

The proxy artifact itself is a valid supplemental record; it does not promote the genuine-zoom requirement.

## Declared runtime and regression

Node `v22.16.0` and npm `10.9.2` were used without changing `.nvmrc`.

- `npm ci`: PASS
- Astro check: PASS with zero errors and zero warnings
- Complete test suite: PASS on the pre-commit R1 tooling snapshot; the final tracked state is rerun before handoff
- Production build: PASS, ten pages
- Phase 4 source verification: PASS
- Phase 5B/Phase 6 focused regression: PASS
- Node 22 versus the prior Node 24 `dist`: byte-identical, 58 files, 22,147,141 bytes, manifest SHA-256 `b92ebd02e524f29cd6a013186ed8a03e1b013d24c90475bdac2068b756fa9261`

The complete performance, memory, lifecycle-loop, and media/network regression finished `PASS` with zero failures. Its report SHA-256 is `a24e280dd3ff6a3b49b19f5581146ff710819fbcd64971c7d114cf7afd28f3c3`. The report explicitly keeps its unobserved hidden transition and BFCache observation separate from ordinary Back/Forward PASS.

## WebKit keyboard closure

The prior URL wait timeout was isolated. It is a Windows-host WebKit focus-policy limitation: native Tab did not include implicit links under the host preference, so Enter could not initiate the expected navigation. The repaired harness waits for URL navigation only after the expected element actually receives focus.

- Native WebKit run: completed, axe 20/20 with zero violations, ordinary history PASS, zero engine errors, 51 structured native focus-policy failures
- Classification: `LIMITATION` (`HOST_TAB_LINKS_LIMITATION`), not site PASS and not a reproduced production defect
- Explicit-tabstop control: 21/21 checks PASS with limitation; this control is not used as native acceptance evidence
- Production repair: none

## Machine motion evidence

Fresh supplemental MP4 recordings were produced in Chromium and Firefox for all five requested stories: complete forward traversal, complete reverse traversal, stop-at-state proof, mid-current/manifesto resize-orientation simulation, and supporting route to Home `/#entry` followed by reverse traversal.

- Chromium report: PASS, five recordings, zero diagnostic failures, SHA-256 `95d0a8dcd640a031f599cca4435f9341bd032c3c5770619015ce7de93d928ab1`
- Firefox report: PASS, five recordings, zero diagnostic failures, SHA-256 `b0cfede1d44d9c156e519cc75313ede85a0796c134c2084aec69ebdf6607e462`
- Evidence class: supplemental machine evidence, never physical-device evidence

The stop proof holds current, line, raster, and Q for 1.25 seconds each with stable scroll position, target frame, presented frame, paused decoder state, and media time.

Two tooling/host faults were reproduced during closure. The Windows encoder path for the longest story crossed a native codec path boundary; the recorder now uses a short, owned sibling staging directory and has a regression test. Firefox's parent browser launched inside the sandbox but Windows denied its tab subprocess; the exact run completed after host permission was granted. Neither fault reproduced a site interaction defect, and neither caused a production-source change.

## History, BFCache, and visibility

The persistent-profile probe is fail-closed:

- Every R1 history, BFCache, visibility, listener, and media summary is re-derived from its raw state, event, transition, listener-counter, document-selection, and request ledgers; contradictory or omitted raw evidence is rejected even when a summary flag claims `PASS`.
- BFCache PASS requires an ordered, exact-route, same-Document `pagehide.persisted=true` to `pageshow.persisted=true` restoration.
- Ordinary Back/Forward, `/` versus `/#entry`, scroll restoration, Forward destinations, menu state, restored manifesto state, source/resource identity, listener growth, and media requests are evaluated independently.
- Repeated HTTP range traffic remains supplemental telemetry, while duplicate non-range Phase 4 media selections beyond the number of logical Home documents fail the media result.
- Visibility PASS requires a real per-scenario visible → hidden → visible transition with ordered native events.
- Maradin retryability requires a source-free foreground state followed by a second user activation with measured playback progress, then a second source-free release.
- A cleaned persistent profile is verified absent before the report can state `profileRetained: false`.

The accepted immutable Phase 6 preview timed out at the network layer during the first fresh headed attempt, before page load. No report and no PASS were emitted, and the temporary profile was removed. The final R1 deployed origin is tested after the signed deployment exists; its exact BFCache and visibility statuses belong to the external final verifier/handoff.

## Human evidence and packaging stop

The user-supplied human-evidence root was not present at final preflight.

Missing required files:

- `iphone-safari-opening.mp4`
- `iphone-safari-maradin.mp4`
- `physical-scroll-input.mp4`
- `chrome-200-percent.mp4`

The final preflight ledger is `BLOCKED`, with SHA-256 `82dea5ee700e463436d2e0adbba7463ca04911a5ac41c600d6c3bbc91d07b2dd`. No physical iPhone result, physical-input result, genuine 200% result, or physical Safari hidden/visible result is claimed.

Per the repair brief, `phase-6-r1-validation-closure-human-review.zip` must not be assembled while any required file is missing. The R1 assembler requires one verified ledger plus the four exact recordings, and both the packager and the independent auditor reject missing recordings, invalid MP4 container signatures, incomplete review metadata, false aggregate status promotion, or hash/size/status drift. Their synthetic end-to-end fixture remains explicitly `PENDING HUMAN REVIEW`; it exercises the exact archive filename without treating fixture presence as physical-device evidence. No real ZIP, embedded manifest, or independent package audit is produced in this state.

## Review gates

All six Phase 6 human gates remain `PENDING HUMAN REVIEW`:

- Native-scroll and motion integrity
- Performance and memory safety
- Media and network isolation
- Cross-engine and history resilience
- Accessibility and fallback resilience
- Visual and publication regression
